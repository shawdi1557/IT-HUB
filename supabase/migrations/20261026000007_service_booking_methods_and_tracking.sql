-- ============================================================================
-- Migration: 20261026000007_service_booking_methods_and_tracking.sql
-- Description: Service booking workflow refinements, method-specific pipelines
-- (Direct Store Walk-In, Doorstep Technician Visit, Insured Courier Pickup & Return),
-- appointment slot & Sunday validation, doorstep ~15km PIN radius checks,
-- editable customer-facing status descriptions with staff RBAC audit logging,
-- and assigned technician authorized name projection.
-- ============================================================================

-- 1. Add supporting columns to public.service_requests
alter table public.service_requests
  add column if not exists pincode text,
  add column if not exists address_details jsonb default '{}'::jsonb,
  add column if not exists inbound_courier_tracking_no text,
  add column if not exists outbound_courier_tracking_no text,
  add column if not exists status_descriptions jsonb default '{}'::jsonb;

-- 2. Expand status check constraint to support method-specific tracking statuses
alter table public.service_requests drop constraint if exists service_requests_status_check;
alter table public.service_requests add constraint service_requests_status_check
  check (status in (
    'Booked',
    'Device Received',
    'Under Diagnosis',
    'In Progress',
    'Diagnosis Done',
    'Awaiting Approval',
    'Completed',
    'Cancelled',
    'Delivered',
    'Returned',
    'Technician Assigned',
    'Technician has Left IT HUB',
    'Technician on the Way',
    'Technician Arrived at Your Location',
    'Technician Arrived',
    'Service in Progress',
    'Ready for Pickup'
  ));

-- 3. Staff RPC: update service status and technician assignment
create or replace function public.staff_update_service_status(
  p_service_id uuid,
  p_new_status text,
  p_technician_name text default null,
  p_internal_notes text default null,
  p_findings jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old_status text;
  v_old_tech text;
  v_staff_id uuid := auth.uid();
  v_req record;
begin
  if not public.can_manage_services() then
    raise exception 'Unauthorized: Staff service management permissions required.';
  end if;

  if p_new_status not in (
    'Booked', 'Device Received', 'Under Diagnosis', 'In Progress', 'Diagnosis Done',
    'Awaiting Approval', 'Completed', 'Cancelled', 'Delivered', 'Returned',
    'Technician Assigned', 'Technician has Left IT HUB', 'Technician on the Way',
    'Technician Arrived at Your Location', 'Technician Arrived', 'Service in Progress',
    'Ready for Pickup'
  ) then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  select * into v_req from public.service_requests where id = p_service_id for update;
  if not found then
    raise exception 'Service request record % not found.', p_service_id;
  end if;

  v_old_status := v_req.status;
  v_old_tech := v_req.technician_name;

  update public.service_requests
  set
    status = p_new_status,
    technician_name = coalesce(p_technician_name, technician_name),
    notes = coalesce(p_internal_notes, notes),
    findings = coalesce(p_findings, findings),
    updated_at = now()
  where id = p_service_id;

  -- Insert immutable staff audit record
  insert into public.staff_audit_logs (
    staff_user_id,
    action_type,
    entity_type,
    entity_id,
    previous_status,
    new_status,
    metadata
  ) values (
    v_staff_id,
    'service_status_update',
    'service_request',
    p_service_id::text,
    v_old_status,
    p_new_status,
    jsonb_build_object(
      'previous_technician', v_old_tech,
      'new_technician', coalesce(p_technician_name, v_old_tech),
      'notes_appended', p_internal_notes is not null,
      'findings_appended', p_findings is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'service_id', p_service_id,
    'previous_status', v_old_status,
    'new_status', p_new_status,
    'technician_name', coalesce(p_technician_name, v_old_tech)
  );
end;
$$;

grant execute on function public.staff_update_service_status(uuid, text, text, text, jsonb) to authenticated;

-- 4. Staff RPC: update customer-facing status description with audit logging
create or replace function public.staff_update_status_description(
  p_service_id uuid,
  p_status text,
  p_description text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_staff_id uuid := auth.uid();
  v_req record;
  v_old_desc text;
  v_new_descriptions jsonb;
  v_trimmed_desc text;
begin
  if not public.can_manage_services() then
    raise exception 'Unauthorized: Staff service management permissions required.';
  end if;

  select * into v_req from public.service_requests where id = p_service_id for update;
  if not found then
    raise exception 'Service request record % not found.', p_service_id;
  end if;

  v_trimmed_desc := trim(coalesce(p_description, ''));
  v_old_desc := coalesce(v_req.status_descriptions->>p_status, '');

  if v_trimmed_desc = '' then
    -- Remove description for this status
    v_new_descriptions := coalesce(v_req.status_descriptions, '{}'::jsonb) - p_status;
  else
    v_new_descriptions := jsonb_set(
      coalesce(v_req.status_descriptions, '{}'::jsonb),
      array[p_status],
      to_jsonb(v_trimmed_desc)
    );
  end if;

  update public.service_requests
  set
    status_descriptions = v_new_descriptions,
    updated_at = now()
  where id = p_service_id;

  -- Record audit trail
  insert into public.staff_audit_logs (
    staff_user_id,
    action_type,
    entity_type,
    entity_id,
    previous_status,
    new_status,
    metadata
  ) values (
    v_staff_id,
    'service_description_update',
    'service_request',
    p_service_id::text,
    v_req.status,
    v_req.status,
    jsonb_build_object(
      'status_target', p_status,
      'previous_description', v_old_desc,
      'new_description', v_trimmed_desc
    )
  );

  return jsonb_build_object(
    'ok', true,
    'service_id', p_service_id,
    'status', p_status,
    'description', v_trimmed_desc
  );
end;
$$;

grant execute on function public.staff_update_status_description(uuid, text, text) to authenticated;

-- 5. Service Booking Server-Side Validation RPC
create or replace function public.validate_service_booking(
  p_method text,
  p_date date,
  p_slot text,
  p_device text,
  p_model text default null,
  p_pincode text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_clean_method text := trim(coalesce(p_method, ''));
  v_clean_pin text := trim(coalesce(p_pincode, ''));
  v_clean_model text := trim(coalesce(p_model, ''));
  v_clean_slot text := trim(coalesce(p_slot, ''));
  v_day_of_week integer;
begin
  if p_date is not null then
    if p_date < current_date then
      raise exception 'Appointment date cannot be in the past.';
    end if;

    -- Exclude Sundays: 0 is Sunday in Postgres extract(dow)
    v_day_of_week := extract(dow from p_date);
    if v_day_of_week = 0 then
      raise exception 'IT HUB is closed on Sundays. Please select an appointment from Monday through Saturday.';
    end if;
  end if;

  -- Validate preferred time slot if provided
  if v_clean_slot <> '' and v_clean_slot not in (
    '10:00 – 12:00', '12:00 – 14:00', '14:00 – 16:00', '16:00 – 18:00', '18:00 – 19:30',
    '10:00 - 12:00', '12:00 - 14:00', '14:00 - 16:00', '16:00 - 18:00', '18:00 - 19:30'
  ) then
    raise exception 'Invalid appointment time slot: %. Please choose a configured store slot.', v_clean_slot;
  end if;

  -- Doorstep Technician Visit requirements
  if v_clean_method in ('On-site service', 'Doorstep Technician Visit') then
    if v_clean_model = '' then
      raise exception 'Device brand and model number is required for Doorstep Technician visits.';
    end if;

    if v_clean_pin = '' then
      raise exception 'PIN code is required to verify doorstep service eligibility.';
    end if;

    -- Validated ~15 km radius around Kothamangalam PIN codes
    if v_clean_pin not in (
      '686691', -- Kothamangalam, Keerampara, Varapetty
      '686666', -- Kothamangalam Bazaar
      '686671', -- Pothanicad, Paingottoor
      '686692', -- Kottappady
      '686693', -- Neriamangalam, Vadattupara
      '686668', -- Ayavana
      '686661', -- Muvattupuzha
      '686681'  -- Vazhakulam
    ) then
      raise exception 'Doorstep service is currently limited to approximately 15 km around Kothamangalam (PINs: 686691, 686666, 686671, 686692, 686693, 686668, 686661). Please select Direct Store Walk-In or Insured Courier Pickup & Return.';
    end if;
  end if;

  -- Insured Courier Pickup & Return requirements
  if v_clean_method in ('Courier to IT HUB', 'Insured Courier Pickup & Return') then
    if v_clean_model = '' then
      raise exception 'Device brand and model number is required for courier shipping intake.';
    end if;

    if v_clean_pin <> '' then
      -- Courier available across Kerala: 6-digit PIN starting with 67, 68, or 69
      if v_clean_pin !~ '^(67|68|69)[0-9]{4}$' then
        raise exception 'Insured courier return delivery is available across all Kerala districts (PIN codes starting with 67, 68, or 69).';
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.validate_service_booking(text, date, text, text, text, text) to anon, authenticated;

-- 6. Atomic Server-Side Create Service Booking RPC with duplicate debounce & slot revalidation
create or replace function public.create_service_booking(
  p_device text,
  p_model text,
  p_problem text,
  p_method text,
  p_preferred_date date default null,
  p_preferred_slot text default null,
  p_pincode text default null,
  p_address_details jsonb default '{}'::jsonb,
  p_inbound_courier_tracking_no text default null,
  p_customer_name text default null,
  p_customer_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_auth_uid uuid := auth.uid();
  v_courier_fee numeric := null;
  v_new_id uuid;
  v_guest_token text;
  v_clean_method text := trim(coalesce(p_method, 'Visit IT HUB'));
  v_clean_model text := nullif(trim(coalesce(p_model, '')), '');
  v_clean_pin text := nullif(trim(coalesce(p_pincode, '')), '');
  v_recent_id uuid;
  v_recent_token text;
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
  select id, guest_tracking_token into v_recent_id, v_recent_token
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

  -- 5. Insert new service request record
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
  ) returning id into v_new_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'guest_tracking_token', v_guest_token,
    'deduplicated', false
  );
end;
$$;

grant execute on function public.create_service_booking(text, text, text, text, date, text, text, jsonb, text, text, text) to authenticated;

-- 7. Update get_service_request_tracking to project method-specific tracking details,
-- status descriptions, assigned technician name, appointment details, and PIN codes.
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

  -- Canonical Staff Authorization / RBAC check:
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

  -- 1. EXACT FULL-UUID LOOKUP (36 characters)
  if v_clean ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_rec
    from public.service_requests
    where id = v_clean::uuid;

    if not found then
      return null;
    end if;

  -- 2. EXACT EIGHT-CHARACTER HEX PREFIX LOOKUP
  elsif v_clean ~ '^[0-9a-f]{8}$' then
    if p_guest_token is not null and trim(p_guest_token) <> '' then
      select * into v_rec
      from public.service_requests
      where id::text ilike v_clean || '%'
        and guest_tracking_token = trim(p_guest_token);

      if not found then
        return null;
      end if;

    elsif v_is_staff then
      select count(*) into v_match_count
      from public.service_requests
      where id::text ilike v_clean || '%';

      if v_match_count = 1 then
        select * into v_rec
        from public.service_requests
        where id::text ilike v_clean || '%';
      else
        return null;
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
      else
        return null;
      end if;

    else
      return null;
    end if;

  else
    return null;
  end if;

  -- AUTHORIZATION POLICY:
  if not (
    v_is_staff
    or (v_auth_uid is not null and v_rec.user_id = v_auth_uid)
    or (p_guest_token is not null and trim(p_guest_token) <> '' and v_rec.guest_tracking_token = trim(p_guest_token))
  ) then
    return null;
  end if;

  -- Resolves technician name:
  -- If technician_name is stored on record, use it.
  v_tech_name := v_rec.technician_name;

  -- CUSTOMER-SAFE PROJECTION FOR DIAGNOSIS FINDINGS
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

  -- CUSTOMER-SAFE PROJECTION FOR ITEMIZE QUOTATION ITEMS
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
        nullif(trim(elem->>'itemId'), ''),
        nullif(trim(elem->>'item_id'), ''),
        'item-' || ord::text
      ) as id,
      coalesce(nullif(trim(elem->>'findingId'), ''), nullif(trim(elem->>'finding_id'), '')) as finding_id,
      coalesce(nullif(trim(elem->>'title'), ''), 'Service Item') as title,
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
      case
        when trim(coalesce(elem->>'quantity', '')) ~ '^[0-9]+(\.[0-9]+)?$'
          and (trim(elem->>'quantity'))::numeric > 0
        then (trim(elem->>'quantity'))::numeric
        else 1
      end as quantity,
      case
        when trim(coalesce(elem->>'discount', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(elem->>'discount'))::numeric
        else 0
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
