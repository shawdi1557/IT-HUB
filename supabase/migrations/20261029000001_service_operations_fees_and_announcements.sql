-- ============================================================================
-- IT HUB — Service Operations, Service Fees, Announcements & Staff Audits
-- Migration: 20261029000001_service_operations_fees_and_announcements.sql
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. AUTHORITATIVE SERVICE FEES ON STORE SETTINGS
-- ────────────────────────────────────────────────────────────────────────────

alter table public.store_settings
  add column if not exists doorstep_callout_fee numeric(10,2) not null default 250.00 check (doorstep_callout_fee >= 0),
  add column if not exists courier_return_delivery_fee numeric(10,2) not null default 150.00 check (courier_return_delivery_fee >= 0),
  add column if not exists diagnostic_assessment_fee numeric(10,2) not null default 299.00 check (diagnostic_assessment_fee >= 0);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ENHANCE SERVICE REQUESTS (FEES SNAPSHOT, BILLING & RESCHEDULING)
-- ────────────────────────────────────────────────────────────────────────────

alter table public.service_requests
  add column if not exists doorstep_callout_fee numeric(8,2) default 0.00 check (doorstep_callout_fee >= 0),
  add column if not exists billing_details jsonb not null default '{}'::jsonb,
  add column if not exists reschedule_details jsonb not null default '{}'::jsonb;

-- Expand status check constraint to include Walk-In & Reschedule states
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
      'Completed'::text,
      'Cancelled'::text,
      'Delivered'::text,
      'Returned'::text,
      'Technician Assigned'::text,
      'Technician has Left IT HUB'::text,
      'Technician on the Way'::text,
      'Technician Arrived at Your Location'::text,
      'Technician Arrived'::text,
      'Service in Progress'::text,
      'Ready for Pickup'::text,
      'Customer Arrived'::text,
      'Reschedule Requested'::text,
      'Rescheduled'::text
    ])
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 3. EXPAND STAFF AUDIT LOGS ENTITY TYPES
-- ────────────────────────────────────────────────────────────────────────────

alter table public.staff_audit_logs
  drop constraint if exists staff_audit_logs_entity_type_check;

alter table public.staff_audit_logs
  add constraint staff_audit_logs_entity_type_check check (
    entity_type = any (array[
      'pc_quotation'::text,
      'service_request'::text,
      'staff_membership'::text,
      'store_settings'::text,
      'announcement'::text,
      'sell_request'::text,
      'review'::text
    ])
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. HOMEPAGE ANNOUNCEMENTS TABLE
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  headline text not null,
  supporting_text text,
  image_url text,
  cta_label text,
  cta_destination text,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  is_active boolean not null default true,
  is_draft boolean not null default false,
  display_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.announcements enable row level security;

-- Drop prior policies if exist
drop policy if exists "announcements_admin_all" on public.announcements;
drop policy if exists "announcements_public_read" on public.announcements;

-- Admin can manage all announcements
create policy "announcements_admin_all"
  on public.announcements
  using (is_admin())
  with check (is_admin());

-- Storefront visitors can only read active, published announcements within validity dates
create policy "announcements_public_read"
  on public.announcements
  for select
  using (
    is_active = true
    and is_draft = false
    and (start_date is null or start_date <= now())
    and (end_date is null or end_date >= now())
  );

drop trigger if exists handle_announcements_updated_at on public.announcements;
create trigger handle_announcements_updated_at
  before update on public.announcements
  for each row execute function handle_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. UPDATE VALIDATE_SERVICE_BOOKING RPC (MANDATORY MODEL, LANDMARK & NON-686693)
-- ────────────────────────────────────────────────────────────────────────────

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
set search_path = public, pg_temp
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

  -- 3. Problem description is mandatory and cannot be whitespace-only
  if v_clean_problem = '' then
    return jsonb_build_object('valid', false, 'error', 'Problem description is required.');
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
      -- Normalize time format (accepts both 12-hour and 24-hour formats)
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
