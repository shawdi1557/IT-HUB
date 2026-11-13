-- Stage 4S-4: secure quotation verification (PC Builder V2).
--
-- 1. The server's verdict gets its own column, which customers can't read (D1, D5).
-- 2. A quotation carries a version, so every later change can be checked against what its author last saw.
-- 3. A submitted quotation is never edited, deleted or returned to Draft by anyone through the API. Status
--    changes happen only inside the quotation functions (security definer), never by a direct write. The rule
--    is told apart by `private.is_api_caller()` (current_user is anon or authenticated), which no caller can
--    change: there is no session flag to forge.
-- 4. Customers may withdraw a submitted quotation (New, Contacted or Quoted), recorded, never deleted (D7).
-- 5. Quotations are created through one function that serialises each customer's submissions and refuses a
--    repeat of the same request within two minutes (D9). References come from a strong random source and are
--    retried on a clash (F11).
-- 6. Every quotation's history is kept in an append-only `quotation_events` table (D10).
-- 7. The submission guard refuses staff accounts and accounts without a confirmed phone (D8, F14), and rate
--    limits each customer, plus each hashed client IP when a trusted header is configured (F9, B1), with an
--    atomic counter (F10). Raw IP addresses are never stored.

-- ─── Columns ─────────────────────────────────────────────────────────────────────────────────────────

alter table public.pc_builds
  add column if not exists server_assessment jsonb,
  add column if not exists version integer not null default 1,
  add column if not exists request_fingerprint text;

alter table public.pc_builds
  add constraint pc_builds_version_positive check (version >= 1);

create index if not exists pc_builds_user_fingerprint_idx
  on public.pc_builds (user_id, request_fingerprint, created_at desc)
  where request_fingerprint is not null;

-- Withdrawn joins the workflow. Archived follows with Stage 4S-5.
alter table public.pc_builds drop constraint if exists pc_builds_enquiry_status_check;
alter table public.pc_builds
  add constraint pc_builds_enquiry_status_check
  check (enquiry_status in ('Draft', 'New', 'Contacted', 'Quoted', 'Closed', 'Withdrawn'));

-- ─── Quotation history ───────────────────────────────────────────────────────────────────────────────

create table public.quotation_events (
  id bigint generated always as identity primary key,
  quotation_id uuid not null references public.pc_builds (id) on delete restrict,
  event_type text not null check (
    event_type in (
      'submitted', 'withdrawn', 'status_changed', 'archived', 'restored',
      'review_recorded', 'note_added', 'assigned'
    )
  ),
  actor_type text not null check (actor_type in ('customer', 'staff', 'admin', 'system')),
  -- No foreign key: the history must never change, even if an account is later removed.
  actor_user_id uuid,
  actor_role text,
  from_status text,
  to_status text,
  version integer,
  reason text check (reason is null or char_length(reason) <= 1000),
  details jsonb not null default '{}'::jsonb,
  restores_event_id bigint references public.quotation_events (id),
  created_at timestamptz not null default now()
);

create index quotation_events_quotation_idx on public.quotation_events (quotation_id, id);

create or replace function private.quotation_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Quotation history is append-only.' using errcode = '42501';
end;
$$;

revoke all on function private.quotation_events_append_only() from public, anon, authenticated;

create trigger quotation_events_append_only
  before update or delete on public.quotation_events
  for each row execute function private.quotation_events_append_only();

create trigger quotation_events_no_truncate
  before truncate on public.quotation_events
  for each statement execute function private.quotation_events_append_only();

alter table public.quotation_events enable row level security;

-- Staff and administrators read a quotation's history. Customers see only their quotation's status (D14).
create policy quotation_events_select on public.quotation_events
  for select to authenticated
  using (public.can_manage_quotations() is true);

revoke all on public.quotation_events from public, anon, authenticated, service_role;
grant select on public.quotation_events to authenticated;
grant select, insert on public.quotation_events to service_role;

-- ─── Protection rules ────────────────────────────────────────────────────────────────────────────────

create or replace function public.protect_pc_build()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- For every caller, the quotation functions included.
  if tg_op = 'UPDATE' then
    if old.reference_id is not null and new.reference_id is distinct from old.reference_id then
      raise exception 'Unauthorized: a quotation''s reference can''t change.' using errcode = '42501';
    end if;
    if new.server_assessment is distinct from old.server_assessment
       or new.request_fingerprint is distinct from old.request_fingerprint then
      raise exception 'Unauthorized: the server''s record of a quotation can''t change.'
        using errcode = '42501';
    end if;
    -- A submitted quotation never returns to Draft (D6).
    if old.reference_id is not null
       and new.enquiry_status = 'Draft'
       and old.enquiry_status is distinct from 'Draft' then
      raise exception 'Unauthorized: a submitted quotation can''t return to Draft.'
        using errcode = '42501';
    end if;
  end if;

  if private.is_api_caller() is not true then
    return new;
  end if;

  -- Direct API writes from here on.
  if public.can_manage_quotations() is true then
    if tg_op = 'INSERT' then
      -- Quotations are created by the verified Edge Function only.
      if new.reference_id is not null
         or new.enquiry_status is distinct from 'Draft'
         or new.server_assessment is not null
         or new.request_fingerprint is not null
         or new.version <> 1 then
        raise exception 'Unauthorized: quotations are created only by the verified submission service.'
          using errcode = '42501';
      end if;
      return new;
    end if;
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception 'Unauthorized: PC build identity and ownership are immutable.'
        using errcode = '42501';
    end if;
    if new.enquiry_status is distinct from old.enquiry_status or new.version is distinct from old.version then
      raise exception 'Unauthorized: a quotation''s status changes only through the quotation functions.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Unauthorized: a saved PC build must belong to the signed-in customer.'
      using errcode = '42501';
  end if;

  -- Customers save drafts directly. Formal quotations come only from the verified Edge Function.
  if tg_op = 'INSERT' then
    if new.enquiry_status is distinct from 'Draft'
       or new.reference_id is not null
       or new.authoritative_price is not null
       or coalesce(new.price_divergence, 0) <> 0
       or coalesce(new.technician_review_required, false)
       or new.staff_notes is not null
       or new.assigned_staff_id is not null
       or new.server_assessment is not null
       or new.request_fingerprint is not null
       or new.version <> 1 then
      raise exception 'Unauthorized: customers can only save draft builds directly.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'Unauthorized: PC build identity and ownership are immutable.'
      using errcode = '42501';
  end if;

  -- Only a draft that was never submitted is the customer's to edit.
  if old.reference_id is not null
     or old.enquiry_status is distinct from 'Draft'
     or (new.enquiry_status, new.reference_id, new.authoritative_price, new.price_divergence,
         new.technician_review_required, new.staff_notes, new.assigned_staff_id,
         new.customer_name, new.customer_phone, new.customer_email, new.version)
        is distinct from
        (old.enquiry_status, old.reference_id, old.authoritative_price, old.price_divergence,
         old.technician_review_required, old.staff_notes, old.assigned_staff_id,
         old.customer_name, old.customer_phone, old.customer_email, old.version) then
    raise exception 'Unauthorized: submitted quotations and staff fields can''t be edited by customers.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- A submitted quotation is never deleted through the API, by anyone (G3). Drafts stay the customer's own.
create or replace function private.protect_pc_build_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is true and old.reference_id is not null then
    raise exception 'Unauthorized: a submitted quotation can''t be deleted. It can be withdrawn.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function private.protect_pc_build_delete() from public, anon, authenticated;

create trigger pc_builds_protect_delete
  before delete on public.pc_builds
  for each row execute function private.protect_pc_build_delete();

drop policy if exists own_builds_delete on public.pc_builds;
create policy pc_builds_delete_own_draft on public.pc_builds
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and reference_id is null
    and enquiry_status = 'Draft'
  );

-- ─── Grants ──────────────────────────────────────────────────────────────────────────────────────────

-- Column grants are the second layer behind the trigger. The server's verdict, the request fingerprint, the
-- status and the version can't be written directly by anyone using the API.
revoke update on public.pc_builds from authenticated;
grant update (
  name, parts, estimated_price, compatibility, updated_at,
  customer_name, customer_phone, customer_email,
  authoritative_price, price_divergence, technician_review_required,
  staff_notes, assigned_staff_id
) on public.pc_builds to authenticated;

-- What a customer reads of their own builds: as before, plus the version (to withdraw). Never the server's
-- verdict (D5) or the fingerprint.
revoke select on public.pc_builds from authenticated;
grant select (
  id, user_id, name, parts, estimated_price, enquiry_status, created_at, updated_at, reference_id,
  customer_name, customer_phone, customer_email, compatibility, authoritative_price,
  price_divergence, technician_review_required, version
) on public.pc_builds to authenticated;

-- Staff read everything through the staff view, now with the verdict and version.
create or replace view public.pc_builds_staff
with (security_barrier = true)
as
  select b.*
  from public.pc_builds b
  where public.can_manage_quotations() is true;

revoke all on public.pc_builds_staff from public, anon, authenticated;
grant select on public.pc_builds_staff to authenticated, service_role;

-- ─── Submission guard and rate limits ────────────────────────────────────────────────────────────────

-- One atomic step: take a slot in the window, or report the window is full (F10: no first-insert race).
create or replace function private.take_rate_slot(
  p_key text,
  p_endpoint text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (ip_hash, endpoint, request_count, window_start)
  values (p_key, p_endpoint, 1, now())
  on conflict (ip_hash, endpoint) do update
    set request_count = case
          when now() - r.window_start > make_interval(secs => p_window_seconds) then 1
          else r.request_count + 1
        end,
        window_start = case
          when now() - r.window_start > make_interval(secs => p_window_seconds) then now()
          else r.window_start
        end
  returning request_count into v_count;
  return v_count <= p_max;
end;
$$;

revoke all on function private.take_rate_slot(text, text, integer, integer)
  from public, anon, authenticated, service_role;

-- Called by the quotation Edge Function (service role) for a verified user, before anything else is done.
-- `p_ip_key` is a salted SHA-256 of the client IP, given only when a trusted client-IP header is configured.
create or replace function public.pc_quotation_guard(p_user_id uuid, p_ip_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_confirmed timestamptz;
begin
  if p_user_id is null then
    return jsonb_build_object('allowed', false, 'code', 'customer_account_required');
  end if;

  -- Staff, as `get_current_staff_role` defines them: an administrator profile or an active staff member.
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'admin')
     or exists (
       select 1 from public.staff_members s where s.user_id = p_user_id and s.is_active = true
     ) then
    return jsonb_build_object('allowed', false, 'code', 'customer_account_required');
  end if;

  select u.phone, u.phone_confirmed_at into v_phone, v_confirmed
  from auth.users u
  where u.id = p_user_id;
  if coalesce(v_phone, '') = '' or v_confirmed is null then
    return jsonb_build_object('allowed', false, 'code', 'customer_account_required');
  end if;

  if not private.take_rate_slot('user:' || p_user_id::text, 'pc-quotation-user', 5, 60) then
    return jsonb_build_object('allowed', false, 'code', 'rate_limited', 'limit', 'customer');
  end if;

  if p_ip_key is not null then
    if p_ip_key !~ '^[0-9a-f]{64}$' then
      raise exception 'The client key must be a hash.' using errcode = '22023';
    end if;
    if not private.take_rate_slot('ip:' || p_ip_key, 'pc-quotation-ip', 20, 60) then
      return jsonb_build_object('allowed', false, 'code', 'rate_limited', 'limit', 'ip');
    end if;
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.pc_quotation_guard(uuid, text) from public, anon, authenticated;
grant execute on function public.pc_quotation_guard(uuid, text) to service_role;

-- ─── Creating a quotation ────────────────────────────────────────────────────────────────────────────

-- Called by the quotation Edge Function (service role) with what the server verified. One customer's
-- submissions are serialised, so two identical requests can't both be stored (D9).
create or replace function public.create_pc_quotation(
  p_user_id uuid,
  p_fingerprint text,
  p_quotation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing record;
  v_id uuid;
  v_reference text;
  v_attempt integer := 0;
  v_review boolean := coalesce((p_quotation ->> 'technician_review_required')::boolean, true);
begin
  if p_user_id is null or coalesce(p_fingerprint, '') = '' or jsonb_typeof(p_quotation) <> 'object' then
    raise exception 'A quotation needs a customer, a request fingerprint and its details.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pc_quotation:' || p_user_id::text, 0));

  select b.id, b.reference_id, b.estimated_price, b.authoritative_price, b.technician_review_required
  into v_existing
  from public.pc_builds b
  where b.user_id = p_user_id
    and b.request_fingerprint = p_fingerprint
    and b.reference_id is not null
    and b.enquiry_status = 'New'
    and b.created_at >= now() - interval '2 minutes'
  order by b.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'duplicate', true,
      'id', v_existing.id,
      'reference_id', v_existing.reference_id,
      'estimated_price', v_existing.estimated_price,
      'authoritative_price', v_existing.authoritative_price,
      'technician_review_required', v_existing.technician_review_required
    );
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- 40 random bits from a v4 UUID (a strong random source), not Math.random.
    v_reference := 'ITH-PC-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.pc_builds (
        user_id, name, reference_id, parts, estimated_price, authoritative_price, price_divergence,
        technician_review_required, compatibility, server_assessment, customer_name, customer_phone,
        customer_email, enquiry_status, version, request_fingerprint
      ) values (
        p_user_id,
        p_quotation ->> 'name',
        v_reference,
        coalesce(p_quotation -> 'parts', '{}'::jsonb),
        (p_quotation ->> 'estimated_price')::numeric,
        (p_quotation ->> 'authoritative_price')::numeric,
        coalesce((p_quotation ->> 'price_divergence')::numeric, 0),
        v_review,
        coalesce(p_quotation -> 'compatibility', '{}'::jsonb),
        p_quotation -> 'server_assessment',
        p_quotation ->> 'customer_name',
        p_quotation ->> 'customer_phone',
        p_quotation ->> 'customer_email',
        'New',
        1,
        p_fingerprint
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.quotation_events (
    quotation_id, event_type, actor_type, actor_user_id, actor_role, to_status, version, details
  ) values (
    v_id, 'submitted', 'customer', p_user_id, 'customer', 'New', 1,
    jsonb_build_object(
      'server_state', p_quotation -> 'server_assessment' ->> 'state',
      'review_required', v_review,
      'stage', '4S-4'
    )
  );

  return jsonb_build_object('duplicate', false, 'id', v_id, 'reference_id', v_reference);
end;
$$;

revoke all on function public.create_pc_quotation(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_pc_quotation(uuid, text, jsonb) to service_role;

-- ─── Customer withdrawal ─────────────────────────────────────────────────────────────────────────────

-- The quotation's owner withdraws it from New, Contacted or Quoted. Recorded, never deleted (D7). Errors use
-- PostgREST's PT codes: PT404 (not theirs or not found), PT409 (stale_version or invalid_transition).
create or replace function public.customer_withdraw_pc_quotation(
  p_quotation_id uuid,
  p_expected_version integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  select b.id, b.user_id, b.reference_id, b.enquiry_status, b.version
  into v_row
  from public.pc_builds b
  where b.id = p_quotation_id
  for update;

  if not found or v_row.user_id is distinct from v_uid or v_row.reference_id is null then
    raise exception 'quotation_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_row.version <> p_expected_version then
    raise exception 'stale_version'
      using errcode = 'PT409', detail = jsonb_build_object('current_version', v_row.version)::text;
  end if;
  if v_row.enquiry_status not in ('New', 'Contacted', 'Quoted') then
    raise exception 'invalid_transition' using errcode = 'PT409';
  end if;

  update public.pc_builds
  set enquiry_status = 'Withdrawn', version = v_row.version + 1, updated_at = now()
  where id = p_quotation_id;

  insert into public.quotation_events (
    quotation_id, event_type, actor_type, actor_user_id, actor_role, from_status, to_status, version,
    reason
  ) values (
    p_quotation_id, 'withdrawn', 'customer', v_uid, 'customer', v_row.enquiry_status, 'Withdrawn',
    v_row.version + 1, v_reason
  );

  return jsonb_build_object('ok', true, 'status', 'Withdrawn', 'version', v_row.version + 1);
end;
$$;

revoke all on function public.customer_withdraw_pc_quotation(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.customer_withdraw_pc_quotation(uuid, integer, text) to authenticated;
