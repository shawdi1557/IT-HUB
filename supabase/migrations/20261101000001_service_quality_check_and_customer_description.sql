-- ============================================================================
-- Migration: 20261101000001_service_quality_check_and_customer_description.sql
-- Description:
-- 1. Add customer_description column to public.service_requests.
-- 2. Add 'Approved', 'Quality Check', and 'Ready for Delivery' to service_requests_status_check.
-- 3. Update staff_update_service_status RPC to support new statuses and enforce non-reversion from Completed.
-- 4. Update get_service_request_tracking RPC to project customer_description while hiding staff notes.
-- 5. Update create_service_booking RPC to populate customer_description from p_notes.
-- ============================================================================

begin;

-- 1. Add customer_description column to public.service_requests
alter table public.service_requests
  add column if not exists customer_description text default null;

-- 2. Update service_requests_status_check constraint
alter table public.service_requests
  drop constraint if exists service_requests_status_check;

alter table public.service_requests
  add constraint service_requests_status_check check (
    status = any (array[
      'Booked'::text,
      'Device Received'::text,
      'Under Diagnosis'::text,
      'In Progress'::text,
      'Diagnosis Done'::text,
      'Awaiting Approval'::text,
      'Approved'::text,
      'Quality Check'::text,
      'Ready for Delivery'::text,
      'Ready for Pickup'::text,
      'Completed'::text,
      'Cancelled'::text,
      'Delivered'::text,
      'Returned'::text,
      'Technician Assigned'::text,
      'Technician has Left IT HUB'::text,
      'Technician on the Way'::text,
      'Technician Arrived at Your Location'::text,
      'Technician Arrived'::text,
      'Customer Arrived'::text,
      'Service in Progress'::text,
      'Reschedule Requested'::text,
      'Rescheduled'::text
    ])
  );

-- 3. Update staff_update_service_status RPC
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
    'Awaiting Approval', 'Approved', 'Quality Check', 'Ready for Delivery',
    'Completed', 'Cancelled', 'Delivered', 'Returned',
    'Technician Assigned', 'Technician has Left IT HUB', 'Technician on the Way',
    'Technician Arrived at Your Location', 'Technician Arrived', 'Customer Arrived',
    'Service in Progress', 'Ready for Pickup', 'Reschedule Requested', 'Rescheduled'
  ) then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  select * into v_req from public.service_requests where id = p_service_id for update;
  if not found then
    raise exception 'Service request record % not found.', p_service_id;
  end if;

  v_old_status := v_req.status;
  v_old_tech := v_req.technician_name;

  -- Enforce non-reversion rule: A Completed ticket cannot be reverted to an earlier status
  if v_old_status = 'Completed' and p_new_status <> 'Completed' then
    raise exception 'Completed service requests cannot be reverted to earlier statuses.';
  end if;

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
      'technician_name', coalesce(p_technician_name, v_old_tech),
      'internal_notes_updated', (p_internal_notes is not null),
      'findings_count', case when p_findings is not null and jsonb_typeof(p_findings) = 'array' then jsonb_array_length(p_findings) else 0 end,
      'timestamp', extract(epoch from now())
    )
  );

  return jsonb_build_object(
    'ok', true,
    'service_id', p_service_id,
    'previous_status', v_old_status,
    'status', p_new_status,
    'technician_name', coalesce(p_technician_name, v_old_tech),
    'updated_at', now()
  );
end;
$$;

revoke all on function public.staff_update_service_status(uuid, text, text, text, jsonb) from public;
grant execute on function public.staff_update_service_status(uuid, text, text, text, jsonb) to authenticated;

-- 4. Update create_service_booking RPC to populate customer_description
create or replace function public.create_service_booking(
  p_device text,
  p_problem text,
  p_method text default 'Visit IT HUB'::text,
  p_model text default null::text,
  p_preferred_date date default null::date,
  p_preferred_slot text default null::text,
  p_pincode text default null::text,
  p_address_details jsonb default '{}'::jsonb,
  p_inbound_courier_tracking_no text default null::text,
  p_notes text default null::text,
  p_technician_name text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_courier_fee numeric := 0;
  v_new_id uuid;
  v_guest_token text;
  v_ticket_reference text;
  v_clean_method text := trim(coalesce(p_method, 'Visit IT HUB'));
  v_clean_model text := nullif(trim(coalesce(p_model, '')), '');
  v_clean_problem text := trim(coalesce(p_problem, ''));
  v_clean_notes text := trim(coalesce(p_notes, ''));
  v_clean_pin text := nullif(trim(coalesce(p_pincode, '')), '');
  v_effective_problem text;
  v_val jsonb;
  v_recent_id uuid;
  v_recent_token text;
  v_recent_ref text;
begin
  if v_auth_uid is null then
    raise exception 'Authentication required: Customer must be logged in to create a service request.';
  end if;

  -- Format "Other" problem if notes provided
  if lower(v_clean_problem) = 'other' then
    if v_clean_notes != '' then
      v_effective_problem := 'Other: ' || v_clean_notes;
    else
      raise exception 'Please describe the issue you''re experiencing before continuing.';
    end if;
  else
    v_effective_problem := v_clean_problem;
  end if;

  -- 1. Server-side validation
  v_val := public.validate_service_booking(
    p_device => p_device,
    p_model => v_clean_model,
    p_problem => v_effective_problem,
    p_method => v_clean_method,
    p_pincode => v_clean_pin,
    p_date => p_preferred_date,
    p_slot => p_preferred_slot,
    p_directions => (p_address_details ->> 'directions')
  );

  if not (v_val ->> 'valid')::boolean then
    raise exception '%', (v_val ->> 'error');
  end if;

  -- 2. Duplicate debounce prevention
  select id, guest_tracking_token, ticket_reference into v_recent_id, v_recent_token, v_recent_ref
  from public.service_requests
  where user_id = v_auth_uid
    and device = p_device
    and problem = v_effective_problem
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

  -- 5. Insert new service request record with customer_description
  insert into public.service_requests (
    user_id,
    device,
    model,
    problem,
    customer_description,
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
    v_effective_problem,
    nullif(v_clean_notes, ''),
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

revoke all on function public.create_service_booking(text, text, text, text, date, text, text, jsonb, text, text, text) from public;
grant execute on function public.create_service_booking(text, text, text, text, date, text, text, jsonb, text, text, text) to authenticated;

-- 5. Update get_service_request_tracking RPC to project customer_description
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
    v_is_staff := coalesce(
      (auth.jwt() ->> 'role') = 'service_role' or public.can_manage_services(),
      false
    );
  exception when undefined_function then
    v_is_staff := ((auth.jwt() ->> 'role') = 'service_role') or ((v_auth_uid is not null) and (
      exists (
        select 1 from public.staff_members
        where user_id = v_auth_uid and is_active = true and role in ('portal_admin', 'service_staff')
      ) or exists (
        select 1 from public.profiles
        where id = v_auth_uid and role = 'admin'
      )
    ));
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
        elsif v_match_count > 1 then
          raise exception 'Ambiguous tracking ID prefix. Please provide full ticket reference.';
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
        elsif v_match_count > 1 then
          raise exception 'Ambiguous tracking ID prefix. Please provide full ticket reference.';
        end if;
      end if;
    end if;

  -- 4. CASE-INSENSITIVE FALLBACK (Any length > 4)
  else
    if length(v_clean) >= 4 then
      if p_guest_token is not null and trim(p_guest_token) <> '' then
        select * into v_rec
        from public.service_requests
        where (
          lower(ticket_reference) = v_clean
          or id::text ilike v_clean || '%'
        ) and guest_tracking_token = trim(p_guest_token);
      elsif v_is_staff then
        select count(*) into v_match_count
        from public.service_requests
        where lower(ticket_reference) = v_clean
           or id::text ilike v_clean || '%';

        if v_match_count = 1 then
          select * into v_rec
          from public.service_requests
          where lower(ticket_reference) = v_clean
             or id::text ilike v_clean || '%';
        elsif v_match_count > 1 then
          raise exception 'Ambiguous tracking query. Please provide full ticket reference.';
        end if;
      elsif v_auth_uid is not null then
        select count(*) into v_match_count
        from public.service_requests
        where (
          lower(ticket_reference) = v_clean
          or id::text ilike v_clean || '%'
        ) and user_id = v_auth_uid;

        if v_match_count = 1 then
          select * into v_rec
          from public.service_requests
          where (
            lower(ticket_reference) = v_clean
            or id::text ilike v_clean || '%'
          ) and user_id = v_auth_uid;
        elsif v_match_count > 1 then
          raise exception 'Ambiguous tracking query. Please provide full ticket reference.';
        end if;
      end if;
    end if;
  end if;

  if v_rec is null or v_rec.id is null then
    return null;
  end if;

  -- Authorization check:
  if not v_is_staff then
    if (v_auth_uid is null or v_rec.user_id is distinct from v_auth_uid) then
      if p_guest_token is null or trim(p_guest_token) = '' or v_rec.guest_tracking_token is distinct from trim(p_guest_token) then
        return null;
      end if;
    end if;
  end if;

  -- Anonymize technician name for customer view if unassigned
  v_tech_name := case
    when v_rec.technician_name is not null and trim(v_rec.technician_name) <> '' then v_rec.technician_name
    when v_rec.method in ('On-site service', 'Doorstep Technician Visit') then 'IT HUB Field Specialist'
    else 'IT HUB Bench Specialist'
  end;

  -- Sanitize findings
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  into v_safe_findings
  from (
    select jsonb_build_object(
      'id', coalesce(elem->>'id', 'finding-' || ord::text),
      'title', coalesce(elem->>'title', 'Diagnostic Assessment'),
      'description', coalesce(elem->>'description', ''),
      'classification', coalesce(elem->>'classification', 'confirmed'),
      'customerExplanation', coalesce(elem->>'customerExplanation', elem->>'description', ''),
      'recommendedRepair', coalesce(elem->>'recommendedRepair', ''),
      'safety', coalesce(elem->>'safety', 'optional'),
      'isEligibleForRepair', coalesce((elem->>'isEligibleForRepair')::boolean, true)
    ) as elem
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_rec.findings) = 'array' then v_rec.findings
        else '[]'::jsonb
      end
    ) with ordinality as t(elem, ord)
  ) as parsed;

  -- Sanitize quotation items
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  into v_safe_quotation_items
  from (
    select jsonb_build_object(
      'id', coalesce(elem->>'id', 'item-' || ord::text),
      'findingId', elem->>'findingId',
      'title', coalesce(elem->>'title', 'Service Item'),
      'description', coalesce(elem->>'description', ''),
      'partCost', coalesce((elem->>'partCost')::numeric, 0),
      'labourCost', coalesce((elem->>'labourCost')::numeric, 0),
      'quantity', coalesce((elem->>'quantity')::integer, 1),
      'discount', coalesce((elem->>'discount')::numeric, 0),
      'lineTotal', coalesce((elem->>'lineTotal')::numeric, 0),
      'isRequired', coalesce((elem->>'isRequired')::boolean, false),
      'canDefer', coalesce((elem->>'canDefer')::boolean, true),
      'dependsOn', case
        when jsonb_typeof(coalesce(elem->'dependsOn', elem->'depends_on')) = 'array'
        then coalesce(elem->'dependsOn', elem->'depends_on')
        else '[]'::jsonb
      end,
      'approvalState', case
        when lower(trim(coalesce(elem->>'approvalState', elem->>'approval_state', ''))) in ('pending', 'approved', 'declined', 'deferred', 'rejected')
        then lower(trim(coalesce(elem->>'approvalState', elem->>'approval_state')))
        else 'pending'
      end,
      'requirementLevel', coalesce(
        nullif(trim(elem->>'requirementLevel'), ''),
        nullif(trim(elem->>'requirement_level'), ''),
        'optional'
      )
    ) as elem
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
    'customer_description', v_rec.customer_description,
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
    'updated_at', v_rec.updated_at,
    'payment_status', v_rec.payment_status,
    'payment_method', v_rec.payment_method,
    'paid_amount', v_rec.paid_amount,
    'paid_at', v_rec.paid_at,
    'reschedule_details', v_rec.reschedule_details
  );
end;
$$;

revoke all on function public.get_service_request_tracking(text, text) from public;
grant execute on function public.get_service_request_tracking(text, text) to anon, authenticated;

commit;
