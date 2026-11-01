-- ============================================================================
-- IT HUB - Mandatory Service Problem Selection Validation & Data Integrity
-- Migration: 20261031000009_service_requests_mandatory_problem_validation.sql
-- ============================================================================

begin;

-- 1. Enforce that service_requests.problem is non-empty, non-whitespace
-- and cannot be bare 'Other' without custom description
alter table public.service_requests
  drop constraint if exists service_requests_problem_not_empty;

alter table public.service_requests
  add constraint service_requests_problem_not_empty
  check (length(trim(problem)) > 0);

alter table public.service_requests
  drop constraint if exists service_requests_problem_other_requires_desc;

alter table public.service_requests
  add constraint service_requests_problem_other_requires_desc
  check (lower(trim(problem)) != 'other');

-- 2. Update validate_service_booking RPC
create or replace function public.validate_service_booking(
  p_device text,
  p_model text,
  p_problem text,
  p_method text,
  p_pincode text default null,
  p_date date default null,
  p_slot text default null,
  p_directions text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_day_of_week integer;
  v_clean_pin text := trim(coalesce(p_pincode, ''));
  v_clean_device text := trim(coalesce(p_device, ''));
  v_clean_model text := trim(coalesce(p_model, ''));
  v_clean_problem text := trim(coalesce(p_problem, ''));
  v_clean_method text := trim(coalesce(p_method, ''));
  v_clean_directions text := trim(coalesce(p_directions, ''));
  -- Authoritative doorstep pins (excluding 686693 Neendapara)
  v_doorstep_pins text[] := array['686691', '686666', '686671', '686692', '686668', '686661', '686681'];
begin
  -- 1. Device category validation
  if v_clean_device = '' then
    return jsonb_build_object('valid', false, 'error', 'Device type is required.');
  end if;

  -- 2. Device brand and model is mandatory for ALL service methods
  if v_clean_model = '' then
    return jsonb_build_object('valid', false, 'error', 'Device Brand & Model / Device Name is required.');
  end if;

  -- 3. Problem description is mandatory and cannot be empty or whitespace-only
  if v_clean_problem = '' then
    return jsonb_build_object('valid', false, 'error', 'Please select the issue you''re experiencing before continuing.');
  end if;

  -- 3b. If "Other" is selected, require custom description
  if lower(v_clean_problem) = 'other' then
    return jsonb_build_object('valid', false, 'error', 'Please describe the issue you''re experiencing before continuing.');
  end if;

  -- 4. Service method validation
  if v_clean_method not in ('Visit IT HUB', 'Courier to IT HUB', 'On-site service') then
    return jsonb_build_object('valid', false, 'error', 'Invalid service method selected.');
  end if;

  -- 5. Doorstep specific checks
  if v_clean_method = 'On-site service' then
    if v_clean_pin = '' then
      return jsonb_build_object('valid', false, 'error', 'PIN code is required for doorstep technician visit.');
    end if;

    -- Explicitly reject 686693 Neendapara
    if v_clean_pin = '686693' then
      return jsonb_build_object(
        'valid', false,
        'error', 'Doorstep technician service is currently unavailable for PIN 686693 (Neendapara). Please select Direct Store Walk-In or Insured Courier Pickup & Return.'
      );
    end if;

    if not (v_clean_pin = any(v_doorstep_pins)) then
      return jsonb_build_object(
        'valid', false,
        'error', 'Doorstep technician visit is limited to ~15 km around Kothamangalam. Please choose Direct Store Walk-In or Courier to IT HUB.'
      );
    end if;

    -- Landmark / Directions is mandatory for doorstep
    if v_clean_directions = '' then
      return jsonb_build_object('valid', false, 'error', 'Landmark / Directions is required for doorstep technician visit.');
    end if;
  end if;

  -- 6. Courier specific checks
  if v_clean_method = 'Courier to IT HUB' then
    if v_clean_pin = '' then
      return jsonb_build_object('valid', false, 'error', 'PIN code is required for courier return address.');
    end if;

    if not (v_clean_pin ~ '^(67|68|69)[0-9]{4}$') then
      return jsonb_build_object(
        'valid', false,
        'error', 'Insured courier return delivery is available across all Kerala districts (PIN codes starting with 67, 68, or 69).'
      );
    end if;
  end if;

  -- 7. Appointment date & time checks (Walk-in & Doorstep ONLY)
  if v_clean_method in ('Visit IT HUB', 'On-site service') and p_date is not null then
    if p_date < v_today then
      return jsonb_build_object('valid', false, 'error', 'Appointment date cannot be in the past.');
    end if;

    v_day_of_week := extract(dow from p_date);
    if v_day_of_week = 0 then
      return jsonb_build_object('valid', false, 'error', 'Appointments cannot be booked on Sunday. IT HUB is strictly closed.');
    end if;

    if p_slot is not null and p_slot != '' then
      if p_slot not in (
        '10:00 – 12:00', '12:00 – 14:00', '14:00 – 16:00', '16:00 – 18:00', '18:00 – 19:30',
        '10:00 AM – 12:00 PM', '12:00 PM – 2:00 PM', '2:00 PM – 4:00 PM', '4:00 PM – 6:00 PM', '6:00 PM – 7:30 PM'
      ) then
        return jsonb_build_object('valid', false, 'error', 'Invalid appointment time slot.');
      end if;
    end if;
  end if;

  return jsonb_build_object('valid', true);
end;
$$;

-- 3. Update create_service_booking RPC
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
    v_effective_problem,
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

commit;
