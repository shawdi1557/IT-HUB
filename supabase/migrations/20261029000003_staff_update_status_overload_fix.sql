-- ============================================================================
-- Migration: Fix RPC Function Overload Conflict for staff_update_service_status
-- Ensures single authoritative 5-arg signature and adds missing canonical statuses
-- ============================================================================

begin;

-- 1. Drop obsolete 4-parameter overload that causes PostgREST PGRST203 (HTTP 300 Multiple Choices)
drop function if exists public.staff_update_service_status(uuid, text, text, text);

-- 2. Drop obsolete 6-parameter overload of validate_service_booking
drop function if exists public.validate_service_booking(text, date, text, text, text, text);

-- 3. Authoritative staff_update_service_status function with all canonical statuses
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

commit;
