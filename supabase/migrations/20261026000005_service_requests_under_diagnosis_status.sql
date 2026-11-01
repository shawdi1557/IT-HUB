-- Migration: 20261026000005_service_requests_under_diagnosis_status.sql
-- Add 'Device Received' and 'Under Diagnosis' status to public.service_requests check constraint and staff RPC

alter table public.service_requests drop constraint if exists service_requests_status_check;
alter table public.service_requests add constraint service_requests_status_check
  check (status in ('Booked', 'Device Received', 'Under Diagnosis', 'In Progress', 'Diagnosis Done', 'Awaiting Approval', 'Completed', 'Cancelled', 'Delivered', 'Returned'));

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
  v_staff_id uuid := auth.uid();
  v_req record;
begin
  if not public.can_manage_services() then
    raise exception 'Unauthorized: Staff service management permissions required.';
  end if;

  if p_new_status not in ('Booked', 'Device Received', 'Under Diagnosis', 'In Progress', 'Diagnosis Done', 'Awaiting Approval', 'Completed', 'Cancelled', 'Delivered', 'Returned') then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  select * into v_req from public.service_requests where id = p_service_id for update;
  if not found then
    raise exception 'Service request record % not found.', p_service_id;
  end if;

  v_old_status := v_req.status;

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
      'technician_name', p_technician_name,
      'notes_appended', p_internal_notes is not null,
      'findings_appended', p_findings is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'service_id', p_service_id,
    'previous_status', v_old_status,
    'new_status', p_new_status
  );
end;
$$;

grant execute on function public.staff_update_service_status(uuid, text, text, text, jsonb) to authenticated;


