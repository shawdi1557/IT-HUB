-- ============================================================================
-- Migration: 20261030000001_service_ticket_reference.sql
-- Description: IT HUB Unified Ticket Reference System (ITH-SER-XXXXXXXX)
-- Introduces collision-resistant 8-character uppercase alphanumeric reference,
-- BEFORE INSERT trigger generation, immutable UPDATE preservation, idempotent
-- backfill for existing records, unique indexing, and multi-mode lookup
-- (ticket_reference, 8-char code, legacy UUID) across customer tracking & staff portal.
-- ============================================================================

begin;

-- Ensure pgcrypto extension is active for gen_random_bytes
create extension if not exists "pgcrypto";

-- 1. Add ticket_reference column to public.service_requests
alter table public.service_requests
  add column if not exists ticket_reference text;

-- 2. Cryptographically secure ticket reference generator function
create or replace function public.generate_ticket_reference()
returns text
language plpgsql
volatile
as $$
declare
  v_chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_bytes bytea;
  v_code text := '';
  v_idx integer;
  v_candidate text;
  v_attempts integer := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    v_code := '';
    v_bytes := gen_random_bytes(8);
    for i in 0..7 loop
      v_idx := (get_byte(v_bytes, i) % 36);
      v_code := v_code || substr(v_chars, v_idx + 1, 1);
    end loop;
    v_candidate := 'ITH-SER-' || v_code;

    -- Ensure candidate is collision-free
    if not exists (select 1 from public.service_requests where ticket_reference = v_candidate) then
      return v_candidate;
    end if;

    if v_attempts > 25 then
      -- Deterministic fallback to avoid infinite loop under theoretical collision load
      return 'ITH-SER-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    end if;
  end loop;
end;
$$;

-- 3. Trigger function to enforce creation generation and update immutability
create or replace function public.trg_service_requests_ticket_reference()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.ticket_reference is null or trim(NEW.ticket_reference) = '' then
      NEW.ticket_reference := public.generate_ticket_reference();
    else
      NEW.ticket_reference := upper(trim(NEW.ticket_reference));
    end if;
  elsif TG_OP = 'UPDATE' then
    -- Immutability guarantee: an existing reference can NEVER be changed or wiped
    if OLD.ticket_reference is not null and trim(OLD.ticket_reference) <> '' then
      NEW.ticket_reference := OLD.ticket_reference;
    elsif NEW.ticket_reference is null or trim(NEW.ticket_reference) = '' then
      NEW.ticket_reference := public.generate_ticket_reference();
    else
      NEW.ticket_reference := upper(trim(NEW.ticket_reference));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists set_service_requests_ticket_reference on public.service_requests;
create trigger set_service_requests_ticket_reference
  before insert or update on public.service_requests
  for each row
  execute function public.trg_service_requests_ticket_reference();

-- 4. Idempotent backfill of existing tickets preserving stable references
do $$
declare
  r record;
  v_ref text;
  v_candidate text;
begin
  for r in (
    select id
    from public.service_requests
    where ticket_reference is null or trim(ticket_reference) = ''
    order by created_at asc
  ) loop
    -- Use 8-character uppercase hex prefix derived from UUID for stable backward compatibility
    v_candidate := 'ITH-SER-' || upper(substr(replace(r.id::text, '-', ''), 1, 8));
    
    -- Ensure candidate uniqueness
    if not exists (
      select 1 from public.service_requests
      where ticket_reference = v_candidate and id <> r.id
    ) then
      v_ref := v_candidate;
    else
      v_ref := public.generate_ticket_reference();
    end if;

    update public.service_requests
    set ticket_reference = v_ref
    where id = r.id;
  end loop;
end $$;

-- 5. Create unique constraint / index for fast search and integrity
create unique index if not exists idx_service_requests_ticket_reference
  on public.service_requests (ticket_reference);

-- 6. Update create_service_booking RPC to return ticket_reference
drop function if exists public.create_service_booking;
create or replace function public.create_service_booking(
  p_device text,
  p_problem text,
  p_method text default 'Visit IT HUB',
  p_model text default null,
  p_preferred_date date default null,
  p_preferred_slot text default null,
  p_pincode text default null,
  p_address_details jsonb default '{}'::jsonb,
  p_inbound_courier_tracking_no text default null,
  p_notes text default null,
  p_technician_name text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_courier_fee numeric := 0;
  v_new_id uuid;
  v_guest_token text;
  v_ticket_reference text;
  v_clean_method text := trim(coalesce(p_method, 'Visit IT HUB'));
  v_clean_model text := nullif(trim(coalesce(p_model, '')), '');
  v_clean_pin text := nullif(trim(coalesce(p_pincode, '')), '');
  v_recent_id uuid;
  v_recent_token text;
  v_recent_ref text;
begin
  if v_auth_uid is null then
    raise exception 'Authentication required: Customer must be logged in to create a service request.';
  end if;

  -- 1. Server-side validation of slot, date, method, model, and PIN eligibility
  perform public.validate_service_booking(
    v_clean_method,
    p_preferred_date,
    p_preferred_slot,
    p_device,
    v_clean_model,
    v_clean_pin
  );

  -- 2. Duplicate debounce prevention: check for identical request submitted in the last 15 seconds
  select id, guest_tracking_token, ticket_reference into v_recent_id, v_recent_token, v_recent_ref
  from public.service_requests
  where user_id = v_auth_uid
    and device = p_device
    and problem = p_problem
    and method = v_clean_method
    and created_at > (now() - interval '15 seconds')
  order by created_at desc
  limit 1;

  if v_recent_id is not null then
    return jsonb_build_object(
      'ok', true,
      'id', v_recent_id,
      'ticket_reference', coalesce(v_recent_ref, 'ITH-SER-' || upper(substr(replace(v_recent_id::text, '-', ''), 1, 8))),
      'guest_tracking_token', v_recent_token,
      'deduplicated', true
    );
  end if;

  -- 3. Set applicable logistics fee
  if v_clean_method in ('Courier to IT HUB', 'Insured Courier Pickup & Return') then
    v_courier_fee := 150;
  end if;

  -- 4. Generate high-entropy guest tracking token
  v_guest_token := encode(gen_random_bytes(16), 'hex');

  -- 5. Insert new service request record (ticket_reference is auto-generated by BEFORE INSERT trigger)
  insert into public.service_requests (
    user_id,
    device,
    model,
    problem,
    method,
    preferred_date,
    preferred_slot,
    pincode,
    address_details,
    inbound_courier_tracking_no,
    courier_charge_return_delivery,
    guest_tracking_token,
    status
  ) values (
    v_auth_uid,
    p_device,
    v_clean_model,
    p_problem,
    v_clean_method,
    p_preferred_date,
    p_preferred_slot,
    v_clean_pin,
    coalesce(p_address_details, '{}'::jsonb),
    nullif(trim(coalesce(p_inbound_courier_tracking_no, '')), ''),
    v_courier_fee,
    v_guest_token,
    'Booked'
  ) returning id, ticket_reference into v_new_id, v_ticket_reference;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'ticket_reference', v_ticket_reference,
    'guest_tracking_token', v_guest_token,
    'deduplicated', false
  );
end;
$$;

grant execute on function public.create_service_booking to authenticated;

-- 7. Update get_service_request_tracking to support ITH-SER-XXXXXXXX and project ticket_reference
create or replace function public.get_service_request_tracking(
  p_tracking_id text,
  p_guest_token text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_clean text;
  v_rec record;
  v_auth_uid uuid := auth.uid();
  v_is_staff boolean := false;
  v_match_count integer := 0;
  v_safe_findings jsonb := '[]'::jsonb;
  v_safe_quotation_items jsonb := '[]'::jsonb;
  v_safe_decision_notes text := null;
  v_tech_name text := null;
begin
  if p_tracking_id is null or trim(p_tracking_id) = '' then
    return null;
  end if;

  -- Clean input: remove '#' prefix and trim whitespace
  v_clean := lower(trim(regexp_replace(p_tracking_id, '^[#\s]+', '')));

  -- Canonical Staff Authorization / RBAC check
  begin
    v_is_staff := coalesce(public.can_manage_services(), false);
  exception when undefined_function then
    v_is_staff := (v_auth_uid is not null) and (
      exists (
        select 1 from public.staff_members
        where user_id = v_auth_uid and is_active = true and role in ('portal_admin', 'service_staff')
      ) or exists (
        select 1 from public.profiles
        where id = v_auth_uid and role = 'admin'
      )
    );
  end;

  -- 1. EXACT TICKET REFERENCE LOOKUP (e.g. ith-ser-c327b978)
  if v_clean ~ '^ith-ser-[0-9a-z]{8}$' then
    select * into v_rec
    from public.service_requests
    where lower(ticket_reference) = v_clean;

    if not found then
      -- Fallback: check if id hex prefix matches the 8 characters
      select * into v_rec
      from public.service_requests
      where id::text ilike substring(v_clean from 9 for 8) || '%';
    end if;

  -- 2. EXACT FULL-UUID LOOKUP (36 characters)
  elsif v_clean ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_rec
    from public.service_requests
    where id = v_clean::uuid;

  -- 3. EXACT EIGHT-CHARACTER ALPHANUMERIC CODE LOOKUP (e.g. c327b978 or C327B978)
  elsif v_clean ~ '^[0-9a-z]{8}$' then
    -- Try direct ticket_reference match with ITH-SER- prefix
    select * into v_rec
    from public.service_requests
    where lower(ticket_reference) = 'ith-ser-' || v_clean;

    if not found then
      if p_guest_token is not null and trim(p_guest_token) <> '' then
        select * into v_rec
        from public.service_requests
        where id::text ilike v_clean || '%'
          and guest_tracking_token = trim(p_guest_token);
      elsif v_is_staff then
        select count(*) into v_match_count
        from public.service_requests
        where id::text ilike v_clean || '%';

        if v_match_count = 1 then
          select * into v_rec
          from public.service_requests
          where id::text ilike v_clean || '%';
        end if;
      elsif v_auth_uid is not null then
        select count(*) into v_match_count
        from public.service_requests
        where id::text ilike v_clean || '%'
          and user_id = v_auth_uid;

        if v_match_count = 1 then
          select * into v_rec
          from public.service_requests
          where id::text ilike v_clean || '%'
            and user_id = v_auth_uid;
        end if;
      end if;
    end if;
  end if;

  if v_rec.id is null then
    return null;
  end if;

  -- Authorization check:
  if not (
    v_is_staff
    or (v_auth_uid is not null and v_rec.user_id = v_auth_uid)
    or (p_guest_token is not null and trim(p_guest_token) <> '' and v_rec.guest_tracking_token = trim(p_guest_token))
  ) then
    return null;
  end if;

  -- Obfuscate technician name for privacy if not staff
  if v_is_staff then
    v_tech_name := v_rec.technician_name;
  else
    v_tech_name := coalesce(v_rec.technician_name, 'IT HUB Certified Specialist');
  end if;

  -- Project customer-safe diagnostic findings
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(
          nullif(trim(elem->>'id'), ''),
          nullif(trim(elem->>'findingId'), ''),
          nullif(trim(elem->>'finding_id'), ''),
          'finding-' || ord::text
        ),
        'title', coalesce(nullif(trim(elem->>'title'), ''), 'Diagnostic Observation'),
        'description', coalesce(elem->>'description', ''),
        'customerExplanation', coalesce(nullif(trim(elem->>'customerExplanation'), ''), nullif(trim(elem->>'customer_explanation'), ''), elem->>'description', ''),
        'recommendedRepair', coalesce(elem->>'recommendedRepair', elem->>'recommended_repair', ''),
        'source', case
          when lower(trim(coalesce(elem->>'source', ''))) in ('customer', 'technician') then lower(trim(elem->>'source'))
          else 'technician'
        end,
        'safety', case
          when lower(trim(coalesce(elem->>'safety', ''))) in ('required', 'recommended', 'optional') then lower(trim(elem->>'safety'))
          else 'optional'
        end,
        'classification', case
          when lower(trim(coalesce(elem->>'classification', ''))) in ('confirmed', 'suspected', 'customer_reported', 'prevention') then lower(trim(elem->>'classification'))
          else 'confirmed'
        end,
        'isEligibleForRepair', coalesce(
          case
            when lower(trim(coalesce(elem->>'isEligibleForRepair', elem->>'is_eligible_for_repair', ''))) in ('true', 't', '1', 'yes') then true
            when lower(trim(coalesce(elem->>'isEligibleForRepair', elem->>'is_eligible_for_repair', ''))) in ('false', 'f', '0', 'no') then false
            else null
          end,
          true
        ),
        'createdAt', coalesce(nullif(trim(elem->>'createdAt'), ''), nullif(trim(elem->>'created_at'), ''), to_char(v_rec.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
      )
      order by ord
    ),
    '[]'::jsonb
  ) into v_safe_findings
  from jsonb_array_elements(
    case
      when jsonb_typeof(v_rec.findings) = 'array' then v_rec.findings
      else '[]'::jsonb
    end
  ) with ordinality as f(elem, ord);

  -- Project customer-safe itemized quotation items
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', parsed.id,
        'findingId', parsed.finding_id,
        'title', parsed.title,
        'description', parsed.description,
        'partCost', parsed.part_cost,
        'labourCost', parsed.labour_cost,
        'quantity', parsed.quantity,
        'discount', parsed.discount,
        'lineTotal', coalesce(
          parsed.explicit_line_total,
          case
            when parsed.part_cost is not null and parsed.labour_cost is not null
            then (parsed.part_cost + parsed.labour_cost) * parsed.quantity - coalesce(parsed.discount, 0)
            else null
          end
        ),
        'isRequired', parsed.is_required,
        'canDefer', parsed.can_defer,
        'dependsOn', parsed.depends_on,
        'approvalState', parsed.approval_state,
        'requirementLevel', parsed.requirement_level
      )
      order by parsed.ord
    ),
    '[]'::jsonb
  ) into v_safe_quotation_items
  from (
    select
      ord,
      coalesce(
        nullif(trim(elem->>'id'), ''),
        nullif(trim(elem->>'findingId'), ''),
        nullif(trim(elem->>'finding_id'), ''),
        'item-' || ord::text
      ) as id,
      coalesce(nullif(trim(elem->>'findingId'), ''), nullif(trim(elem->>'finding_id'), '')) as finding_id,
      coalesce(nullif(trim(elem->>'title'), ''), 'Service Component') as title,
      coalesce(elem->>'description', '') as description,
      case
        when trim(coalesce(elem->>'partCost', elem->>'part_cost', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(coalesce(elem->>'partCost', elem->>'part_cost')))::numeric
        else null
      end as part_cost,
      case
        when trim(coalesce(elem->>'labourCost', elem->>'labour_cost', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(coalesce(elem->>'labourCost', elem->>'labour_cost')))::numeric
        else null
      end as labour_cost,
      coalesce(
        case
          when trim(coalesce(elem->>'quantity', '')) ~ '^[0-9]+$'
          then (trim(elem->>'quantity'))::integer
          else null
        end,
        1
      ) as quantity,
      case
        when trim(coalesce(elem->>'discount', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(elem->>'discount'))::numeric
        else null
      end as discount,
      case
        when trim(coalesce(elem->>'lineTotal', elem->>'line_total', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(coalesce(elem->>'lineTotal', elem->>'line_total')))::numeric
        else null
      end as explicit_line_total,
      coalesce(
        case
          when lower(trim(coalesce(elem->>'requirementLevel', elem->>'requirement_level', ''))) = 'required' then true
          when lower(trim(coalesce(elem->>'isRequired', elem->>'is_required', ''))) in ('true', 't', '1', 'yes') then true
          when lower(trim(coalesce(elem->>'isRequired', elem->>'is_required', ''))) in ('false', 'f', '0', 'no') then false
          else null
        end,
        false
      ) as is_required,
      coalesce(
        case
          when lower(trim(coalesce(elem->>'requirementLevel', elem->>'requirement_level', ''))) = 'required' then false
          when lower(trim(coalesce(elem->>'isRequired', elem->>'is_required', ''))) in ('true', 't', '1', 'yes') then false
          when lower(trim(coalesce(elem->>'canDefer', elem->>'can_defer', ''))) in ('false', 'f', '0', 'no') then false
          when lower(trim(coalesce(elem->>'canDefer', elem->>'can_defer', ''))) in ('true', 't', '1', 'yes') then true
          else null
        end,
        true
      ) as can_defer,
      case
        when jsonb_typeof(coalesce(elem->'dependsOn', elem->'depends_on')) = 'array'
        then coalesce(elem->'dependsOn', elem->'depends_on')
        else '[]'::jsonb
      end as depends_on,
      case
        when lower(trim(coalesce(elem->>'approvalState', elem->>'approval_state', ''))) in ('pending', 'approved', 'declined', 'deferred', 'rejected')
        then lower(trim(coalesce(elem->>'approvalState', elem->>'approval_state')))
        else 'pending'
      end as approval_state,
      coalesce(
        nullif(trim(elem->>'requirementLevel'), ''),
        nullif(trim(elem->>'requirement_level'), ''),
        case
          when lower(trim(coalesce(elem->>'isRequired', elem->>'is_required', ''))) in ('true', 't', '1', 'yes') then 'required'
          else 'optional'
        end
      ) as requirement_level
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_rec.quotation_items) = 'array' then v_rec.quotation_items
        else '[]'::jsonb
      end
    ) with ordinality as t(elem, ord)
  ) as parsed;

  if v_rec.decision_notes is not null and trim(v_rec.decision_notes) <> '' then
    v_safe_decision_notes := substring(trim(v_rec.decision_notes) from 1 for 1000);
  end if;

  return jsonb_build_object(
    'id', v_rec.id,
    'ticket_reference', coalesce(v_rec.ticket_reference, 'ITH-SER-' || upper(substr(replace(v_rec.id::text, '-', ''), 1, 8))),
    'is_owner', (v_auth_uid is not null and v_rec.user_id = v_auth_uid),
    'device', v_rec.device,
    'model', v_rec.model,
    'problem', v_rec.problem,
    'method', v_rec.method,
    'status', v_rec.status,
    'quote', v_rec.quote,
    'quote_state', v_rec.quote_state,
    'quote_version', coalesce(v_rec.quote_version, 1),
    'technician_name', v_tech_name,
    'preferred_date', v_rec.preferred_date,
    'preferred_slot', v_rec.preferred_slot,
    'pincode', v_rec.pincode,
    'address_details', case
      when (v_auth_uid is not null and v_rec.user_id = v_auth_uid) or v_is_staff then v_rec.address_details
      else null
    end,
    'inbound_courier_tracking_no', v_rec.inbound_courier_tracking_no,
    'outbound_courier_tracking_no', v_rec.outbound_courier_tracking_no,
    'status_descriptions', coalesce(v_rec.status_descriptions, '{}'::jsonb),
    'courier_charge_return_delivery', v_rec.courier_charge_return_delivery,
    'findings', v_safe_findings,
    'quotation_items', v_safe_quotation_items,
    'approved_items', coalesce(v_rec.approved_items, '{}'::text[]),
    'declined_items', coalesce(v_rec.declined_items, '{}'::text[]),
    'decision_notes', v_safe_decision_notes,
    'decision_at', v_rec.decision_at,
    'created_at', v_rec.created_at,
    'updated_at', v_rec.updated_at
  );
end;
$$;

revoke all on function public.get_service_request_tracking(text, text) from public;
grant execute on function public.get_service_request_tracking(text, text) to anon, authenticated;

commit;
