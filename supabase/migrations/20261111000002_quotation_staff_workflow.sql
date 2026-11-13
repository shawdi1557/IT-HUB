-- Stage 4S-5: the Staff Portal's quotation workflow (PC Builder V2).
--
-- Every staff change to a quotation goes through one of four functions, each a single transaction that checks the
-- caller's role, the quotation's state and the version the caller last saw, makes the change, bumps the version,
-- and writes both the quotation's own history (`quotation_events`) and the staff audit log (`staff_audit_logs`):
--
--   staff_transition_pc_quotation   the approved transition matrix (D11), with reasons, the review gate on every move
--                                   into Quoted, administrator corrections, reopening and archive restoration
--   staff_record_pc_quotation_review  append-only reviews with the four approved outcomes (D12, E1, E2)
--   staff_add_pc_quotation_note       append-only notes (D12)
--   staff_assign_pc_quotation         assignment to an active quotation staff member or administrator
--
-- Errors use PostgREST's PT codes (HTTP status): PT403 forbidden, PT404 quotation_not_found, PT409 stale_version,
-- invalid_transition or review_required; 22023 (HTTP 400) for a missing or invalid reason, note or outcome.
--
-- Staff can no longer write a quotation directly (G1), the old status function is retired (E8), and staff can no
-- longer file a quotation audit row directly (G5). Service-ticket audit writes are unchanged.

-- ─── Status ──────────────────────────────────────────────────────────────────────────────────────────

alter table public.pc_builds drop constraint if exists pc_builds_enquiry_status_check;
alter table public.pc_builds
  add constraint pc_builds_enquiry_status_check
  check (enquiry_status in ('Draft', 'New', 'Contacted', 'Quoted', 'Closed', 'Archived', 'Withdrawn'));

-- ─── Reviews and notes: append-only ──────────────────────────────────────────────────────────────────

create table public.quotation_reviews (
  id bigint generated always as identity primary key,
  quotation_id uuid not null references public.pc_builds (id) on delete restrict,
  outcome text not null check (
    outcome in ('checked_suitable', 'needs_customer_input', 'cannot_supply_as_built', 'escalated')
  ),
  note text not null check (char_length(note) between 3 and 2000),
  -- Required when this review clears an open escalation (E1): administrators only.
  escalation_clearance_reason text
    check (escalation_clearance_reason is null or char_length(escalation_clearance_reason) between 3 and 1000),
  reviewer_user_id uuid not null,
  reviewer_role text not null check (reviewer_role in ('quotation_staff', 'portal_admin')),
  version integer not null,
  created_at timestamptz not null default now()
);

create index quotation_reviews_quotation_idx on public.quotation_reviews (quotation_id, id);

create table public.quotation_notes (
  id bigint generated always as identity primary key,
  quotation_id uuid not null references public.pc_builds (id) on delete restrict,
  note text not null check (char_length(note) between 1 and 2000),
  author_user_id uuid not null,
  author_role text not null check (author_role in ('quotation_staff', 'portal_admin')),
  version integer not null,
  created_at timestamptz not null default now()
);

create index quotation_notes_quotation_idx on public.quotation_notes (quotation_id, id);

create trigger quotation_reviews_append_only
  before update or delete on public.quotation_reviews
  for each row execute function private.quotation_events_append_only();
create trigger quotation_reviews_no_truncate
  before truncate on public.quotation_reviews
  for each statement execute function private.quotation_events_append_only();
create trigger quotation_notes_append_only
  before update or delete on public.quotation_notes
  for each row execute function private.quotation_events_append_only();
create trigger quotation_notes_no_truncate
  before truncate on public.quotation_notes
  for each statement execute function private.quotation_events_append_only();

alter table public.quotation_reviews enable row level security;
alter table public.quotation_notes enable row level security;

-- Internal to IT HUB (D14): quotation staff and administrators read them; customers never do.
create policy quotation_reviews_select on public.quotation_reviews
  for select to authenticated
  using (public.can_manage_quotations() is true);
create policy quotation_notes_select on public.quotation_notes
  for select to authenticated
  using (public.can_manage_quotations() is true);

revoke all on public.quotation_reviews from public, anon, authenticated, service_role;
revoke all on public.quotation_notes from public, anon, authenticated, service_role;
grant select on public.quotation_reviews to authenticated, service_role;
grant select on public.quotation_notes to authenticated, service_role;

-- ─── Direct writes ───────────────────────────────────────────────────────────────────────────────────

-- Staff and administrators no longer write quotations directly (G1). Through the API, anyone writes only their own
-- never-submitted drafts, under the customer rules. The quotation functions (security definer) are unaffected.
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

  -- Direct API writes, by anyone: only one's own draft that was never submitted.
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Unauthorized: quotations change only through the quotation functions.'
      using errcode = '42501';
  end if;

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

-- Second layer: through the API, only a draft's own fields can be written at all.
revoke update on public.pc_builds from authenticated;
grant update (name, parts, estimated_price, compatibility, updated_at) on public.pc_builds to authenticated;

-- The old status function allowed any status to any other, overwrote notes and had no version check (E8).
revoke all on function public.staff_update_pc_quotation_status(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

-- Staff file quotation audit rows only through the quotation functions (G5). Other entities are unchanged.
drop policy if exists staff_audit_logs_insert on public.staff_audit_logs;
create policy staff_audit_logs_insert on public.staff_audit_logs
  for insert to authenticated
  with check (
    public.is_staff() is true
    and staff_user_id = auth.uid()
    and entity_type <> 'pc_quotation'
  );

-- ─── Shared steps ────────────────────────────────────────────────────────────────────────────────────

-- The caller's quotation role: 'portal_admin' or 'quotation_staff'; anything else is refused (PT403).
create or replace function private.quotation_staff_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.get_current_staff_role();
begin
  if auth.uid() is null or v_role is null or v_role not in ('portal_admin', 'quotation_staff') then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  return v_role;
end;
$$;

-- Locks a submitted quotation and checks the version the caller last saw.
create or replace function private.lock_pc_quotation(p_quotation_id uuid, p_expected_version integer)
returns public.pc_builds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pc_builds;
begin
  select * into v_row from public.pc_builds where id = p_quotation_id for update;
  if not found or v_row.reference_id is null then
    raise exception 'quotation_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_row.version <> p_expected_version then
    raise exception 'stale_version'
      using errcode = 'PT409', detail = jsonb_build_object('current_version', v_row.version)::text;
  end if;
  return v_row;
end;
$$;

-- A reason: trimmed, 3 to 1,000 characters when required; at most 1,000 when optional.
create or replace function private.quotation_reason(p_reason text, p_required boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    if p_required then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    return null;
  end if;
  if char_length(v_reason) > 1000 or (p_required and char_length(v_reason) < 3) then
    raise exception 'reason_invalid' using errcode = '22023';
  end if;
  return v_reason;
end;
$$;

-- An escalation is open until an administrator records "Checked – Suitable" with a clearance reason after it (E1).
create or replace function private.pc_quotation_escalation_open(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quotation_reviews e
    where e.quotation_id = p_quotation_id
      and e.outcome = 'escalated'
      and not exists (
        select 1 from public.quotation_reviews c
        where c.quotation_id = p_quotation_id
          and c.id > e.id
          and c.outcome = 'checked_suitable'
          and c.reviewer_role = 'portal_admin'
          and c.escalation_clearance_reason is not null
      )
  );
$$;

-- The review gate (D11): a quotation the server flagged can become Quoted only when its latest review is
-- "Checked – Suitable" and no escalation is open. The id of that review, or null when the gate isn't met.
create or replace function private.pc_quotation_gate(p_row public.pc_builds)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_latest public.quotation_reviews;
begin
  select * into v_latest
  from public.quotation_reviews r
  where r.quotation_id = p_row.id
  order by r.id desc
  limit 1;
  if not found
     or v_latest.outcome <> 'checked_suitable'
     or v_latest.reviewer_role not in ('quotation_staff', 'portal_admin')
     or private.pc_quotation_escalation_open(p_row.id) then
    return null;
  end if;
  return v_latest.id;
end;
$$;

-- Writes the history event and the staff audit row for a staff action, in the caller's transaction.
create or replace function private.record_pc_quotation_staff_action(
  p_quotation_id uuid,
  p_role text,
  p_event_type text,
  p_audit_action text,
  p_from_status text,
  p_to_status text,
  p_version integer,
  p_reason text,
  p_details jsonb,
  p_restores_event_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id bigint;
begin
  insert into public.quotation_events (
    quotation_id, event_type, actor_type, actor_user_id, actor_role, from_status, to_status, version,
    reason, details, restores_event_id
  ) values (
    p_quotation_id, p_event_type, case when p_role = 'portal_admin' then 'admin' else 'staff' end,
    auth.uid(), p_role, p_from_status, p_to_status, p_version, p_reason, coalesce(p_details, '{}'::jsonb),
    p_restores_event_id
  )
  returning id into v_event_id;

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
  ) values (
    auth.uid(), p_audit_action, 'pc_quotation', p_quotation_id::text, p_from_status, p_to_status,
    coalesce(p_details, '{}'::jsonb)
      || jsonb_build_object('event_id', v_event_id, 'version', p_version, 'reason_given', p_reason is not null)
  );
  return v_event_id;
end;
$$;

revoke all on function private.quotation_staff_role() from public, anon, authenticated, service_role;
revoke all on function private.lock_pc_quotation(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function private.quotation_reason(text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.pc_quotation_escalation_open(uuid) from public, anon, authenticated, service_role;
revoke all on function private.pc_quotation_gate(public.pc_builds) from public, anon, authenticated, service_role;
revoke all on function private.record_pc_quotation_staff_action(
  uuid, text, text, text, text, text, integer, text, jsonb, bigint
) from public, anon, authenticated, service_role;

-- ─── Transitions (D11) ───────────────────────────────────────────────────────────────────────────────

create or replace function public.staff_transition_pc_quotation(
  p_quotation_id uuid,
  p_to_status text,
  p_expected_version integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.quotation_staff_role();
  v_row public.pc_builds;
  v_from text;
  v_to text := coalesce(p_to_status, '');
  v_who text;          -- 'staff' (quotation staff or admin) or 'admin' (administrators only)
  v_reason_needed boolean;
  v_reason text;
  v_event_type text := 'status_changed';
  v_restores bigint;
  v_review_id bigint;
  v_details jsonb := '{}'::jsonb;
  v_version integer;
begin
  v_row := private.lock_pc_quotation(p_quotation_id, p_expected_version);
  v_from := v_row.enquiry_status;

  -- The approved matrix: who may make each move, and whether it needs a reason.
  select m.who, m.reason into v_who, v_reason_needed
  from (values
    ('New', 'Contacted', 'staff', false),
    ('New', 'Quoted', 'staff', false),
    ('New', 'Closed', 'staff', true),
    ('New', 'Archived', 'staff', true),
    ('Contacted', 'Quoted', 'staff', false),
    ('Contacted', 'Closed', 'staff', true),
    ('Contacted', 'Archived', 'staff', true),
    ('Contacted', 'New', 'admin', true),
    ('Quoted', 'Closed', 'staff', true),
    ('Quoted', 'Archived', 'staff', true),
    ('Quoted', 'Contacted', 'admin', true),
    ('Closed', 'Quoted', 'admin', true),
    ('Archived', 'New', 'admin', true),
    ('Archived', 'Contacted', 'admin', true),
    ('Archived', 'Quoted', 'admin', true)
  ) as m (from_status, to_status, who, reason)
  where m.from_status = v_from and m.to_status = v_to;

  if v_who is null then
    raise exception 'invalid_transition' using errcode = 'PT409';
  end if;
  if v_who = 'admin' and v_role <> 'portal_admin' then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  v_reason := private.quotation_reason(p_reason, v_reason_needed);

  -- Archive restoration: only to the exact state recorded when it was archived, linked to that event.
  if v_from = 'Archived' then
    select e.id, e.from_status into v_restores, v_details
    from (
      select id, jsonb_build_object('archived_from', from_status) as from_status
      from public.quotation_events
      where quotation_id = p_quotation_id and event_type = 'archived'
      order by id desc
      limit 1
    ) e;
    if v_restores is null or v_details ->> 'archived_from' is distinct from v_to then
      raise exception 'invalid_transition' using errcode = 'PT409';
    end if;
    v_event_type := 'restored';
  elsif v_to = 'Archived' then
    v_event_type := 'archived';
  end if;

  -- The review gate applies to every move into Quoted: new, administrator reopening and restoration alike.
  if v_to = 'Quoted' then
    if v_row.technician_review_required is true then
      v_review_id := private.pc_quotation_gate(v_row);
      if v_review_id is null then
        raise exception 'review_required' using errcode = 'PT409';
      end if;
      v_details := v_details || jsonb_build_object('review_gate', 'satisfied', 'review_id', v_review_id);
    else
      v_details := v_details || jsonb_build_object('review_gate', 'not_required');
    end if;
  end if;

  v_version := v_row.version + 1;
  update public.pc_builds
  set enquiry_status = v_to, version = v_version, updated_at = now()
  where id = p_quotation_id;

  perform private.record_pc_quotation_staff_action(
    p_quotation_id, v_role, v_event_type, 'pc_quotation_status_change', v_from, v_to, v_version,
    v_reason, v_details, v_restores
  );

  return jsonb_build_object('ok', true, 'status', v_to, 'version', v_version);
end;
$$;

-- ─── Reviews (D12, E1, E2) ───────────────────────────────────────────────────────────────────────────

create or replace function public.staff_record_pc_quotation_review(
  p_quotation_id uuid,
  p_outcome text,
  p_note text,
  p_expected_version integer,
  p_escalation_clearance_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.quotation_staff_role();
  v_row public.pc_builds;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_clearance text;
  v_review_id bigint;
  v_version integer;
begin
  v_row := private.lock_pc_quotation(p_quotation_id, p_expected_version);
  if v_row.enquiry_status not in ('New', 'Contacted', 'Quoted') then
    raise exception 'invalid_transition' using errcode = 'PT409';
  end if;
  if p_outcome is null
     or p_outcome not in ('checked_suitable', 'needs_customer_input', 'cannot_supply_as_built', 'escalated') then
    raise exception 'outcome_invalid' using errcode = '22023';
  end if;
  if v_note is null or char_length(v_note) < 3 or char_length(v_note) > 2000 then
    raise exception 'note_required' using errcode = '22023';
  end if;

  -- Clearing an open escalation: an administrator, with its own reason, kept beside the note (E1).
  if p_outcome = 'checked_suitable' and private.pc_quotation_escalation_open(p_quotation_id) then
    if v_role <> 'portal_admin' then
      raise exception 'forbidden' using errcode = 'PT403';
    end if;
    v_clearance := private.quotation_reason(p_escalation_clearance_reason, true);
  elsif nullif(btrim(coalesce(p_escalation_clearance_reason, '')), '') is not null then
    -- A clearance reason only belongs to a review that clears an open escalation.
    raise exception 'reason_invalid' using errcode = '22023';
  end if;

  v_version := v_row.version + 1;
  insert into public.quotation_reviews (
    quotation_id, outcome, note, escalation_clearance_reason, reviewer_user_id, reviewer_role, version
  ) values (
    p_quotation_id, p_outcome, v_note, v_clearance, auth.uid(), v_role, v_version
  )
  returning id into v_review_id;

  update public.pc_builds set version = v_version, updated_at = now() where id = p_quotation_id;

  perform private.record_pc_quotation_staff_action(
    p_quotation_id, v_role, 'review_recorded', 'pc_quotation_review', v_row.enquiry_status,
    v_row.enquiry_status, v_version, v_clearance,
    jsonb_build_object('review_id', v_review_id, 'outcome', p_outcome, 'clears_escalation', v_clearance is not null)
  );

  return jsonb_build_object('ok', true, 'review_id', v_review_id, 'version', v_version);
end;
$$;

-- ─── Notes (D12) ─────────────────────────────────────────────────────────────────────────────────────

create or replace function public.staff_add_pc_quotation_note(
  p_quotation_id uuid,
  p_note text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.quotation_staff_role();
  v_row public.pc_builds;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_note_id bigint;
  v_version integer;
begin
  v_row := private.lock_pc_quotation(p_quotation_id, p_expected_version);
  if v_note is null or char_length(v_note) > 2000 then
    raise exception 'note_required' using errcode = '22023';
  end if;

  v_version := v_row.version + 1;
  insert into public.quotation_notes (quotation_id, note, author_user_id, author_role, version)
  values (p_quotation_id, v_note, auth.uid(), v_role, v_version)
  returning id into v_note_id;

  update public.pc_builds set version = v_version, updated_at = now() where id = p_quotation_id;

  perform private.record_pc_quotation_staff_action(
    p_quotation_id, v_role, 'note_added', 'pc_quotation_note', v_row.enquiry_status, v_row.enquiry_status,
    v_version, null, jsonb_build_object('note_id', v_note_id)
  );

  return jsonb_build_object('ok', true, 'note_id', v_note_id, 'version', v_version);
end;
$$;

-- ─── Assignment ──────────────────────────────────────────────────────────────────────────────────────

-- To an active quotation staff member or administrator; null unassigns.
create or replace function public.staff_assign_pc_quotation(
  p_quotation_id uuid,
  p_assignee uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.quotation_staff_role();
  v_row public.pc_builds;
  v_version integer;
begin
  v_row := private.lock_pc_quotation(p_quotation_id, p_expected_version);
  if p_assignee is not null
     and not exists (select 1 from public.profiles p where p.id = p_assignee and p.role = 'admin')
     and not exists (
       select 1 from public.staff_members s
       where s.user_id = p_assignee and s.is_active = true and s.role in ('quotation_staff', 'portal_admin')
     ) then
    raise exception 'assignee_invalid' using errcode = '22023';
  end if;

  v_version := v_row.version + 1;
  update public.pc_builds
  set assigned_staff_id = p_assignee, version = v_version, updated_at = now()
  where id = p_quotation_id;

  perform private.record_pc_quotation_staff_action(
    p_quotation_id, v_role, 'assigned', 'pc_quotation_assignment', v_row.enquiry_status,
    v_row.enquiry_status, v_version, null,
    jsonb_build_object('from_assignee', v_row.assigned_staff_id, 'to_assignee', p_assignee)
  );

  return jsonb_build_object('ok', true, 'assigned_staff_id', p_assignee, 'version', v_version);
end;
$$;

revoke all on function public.staff_transition_pc_quotation(uuid, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_record_pc_quotation_review(uuid, text, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_add_pc_quotation_note(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_assign_pc_quotation(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.staff_transition_pc_quotation(uuid, text, integer, text) to authenticated;
grant execute on function public.staff_record_pc_quotation_review(uuid, text, text, integer, text)
  to authenticated;
grant execute on function public.staff_add_pc_quotation_note(uuid, text, integer) to authenticated;
grant execute on function public.staff_assign_pc_quotation(uuid, uuid, integer) to authenticated;
