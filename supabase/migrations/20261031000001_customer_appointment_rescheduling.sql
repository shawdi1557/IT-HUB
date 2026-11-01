-- ============================================================================
-- IT HUB — Customer Appointment Rescheduling Workflow & Staff Notifications
-- Migration: 20261031000001_customer_appointment_rescheduling.sql
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. RESCHEDULE REQUESTS TABLE
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.service_appointment_reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.service_requests(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete set null,
  original_date date not null,
  original_slot text not null,
  requested_date date not null,
  requested_slot text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  staff_actor_id uuid references auth.users(id) on delete set null,
  staff_response text,
  decided_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Indexes for performance
create index if not exists idx_reschedule_ticket_id 
  on public.service_appointment_reschedule_requests(ticket_id);
create index if not exists idx_reschedule_status 
  on public.service_appointment_reschedule_requests(status);
create index if not exists idx_reschedule_customer_user_id 
  on public.service_appointment_reschedule_requests(customer_user_id);

-- Enforce partial unique index: At most ONE pending request per service ticket
create unique index if not exists idx_unique_pending_reschedule_request
  on public.service_appointment_reschedule_requests(ticket_id)
  where status = 'pending';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. STAFF NOTIFICATIONS TABLE
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.service_requests(id) on delete cascade,
  reschedule_request_id uuid references public.service_appointment_reschedule_requests(id) on delete cascade,
  event_type text not null default 'CUSTOMER_RESCHEDULE_REQUESTED',
  title text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_staff_notifications_ticket_id 
  on public.staff_notifications(ticket_id);
create index if not exists idx_staff_notifications_read 
  on public.staff_notifications(read);

-- Prevent duplicate unread notifications for the same reschedule request event
create unique index if not exists idx_unique_staff_notification_reschedule
  on public.staff_notifications(ticket_id, reschedule_request_id, event_type);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ────────────────────────────────────────────────────────────────────────────

alter table public.service_appointment_reschedule_requests enable row level security;
alter table public.staff_notifications enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Staff can view all reschedule requests" on public.service_appointment_reschedule_requests;
drop policy if exists "Customers can view their own reschedule requests" on public.service_appointment_reschedule_requests;
drop policy if exists "Staff can manage notifications" on public.staff_notifications;

-- service_appointment_reschedule_requests RLS
create policy "Staff can view all reschedule requests"
  on public.service_appointment_reschedule_requests
  for select
  using (public.can_manage_services());

create policy "Customers can view their own reschedule requests"
  on public.service_appointment_reschedule_requests
  for select
  using (
    customer_user_id = auth.uid()
    or exists (
      select 1 from public.service_requests sr
      where sr.id = service_appointment_reschedule_requests.ticket_id
      and sr.user_id = auth.uid()
    )
  );

-- Staff notifications RLS
create policy "Staff can manage notifications"
  on public.staff_notifications
  for all
  using (public.can_manage_services())
  with check (public.can_manage_services());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ATOMIC RPC: customer_request_appointment_reschedule
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.customer_request_appointment_reschedule(
  p_ticket_id uuid,
  p_requested_date date,
  p_requested_slot text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ticket record;
  v_new_req_id uuid;
  v_customer_id uuid;
  v_method_norm text;
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();

  -- 1. Fetch ticket details
  select id, user_id, method, preferred_date, preferred_slot, status, ticket_reference, device, model
  into v_ticket
  from public.service_requests
  where id = p_ticket_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Service ticket not found.');
  end if;

  -- 2. Authorization check: must be ticket owner or staff
  if v_caller_id is not null and v_ticket.user_id is not null and v_ticket.user_id <> v_caller_id then
    if not public.can_manage_services() then
      return jsonb_build_object('ok', false, 'error', 'Unauthorized: You can only reschedule your own service ticket.');
    end if;
  end if;

  v_customer_id := coalesce(v_caller_id, v_ticket.user_id);

  -- 3. Intake Method Eligibility Check: ONLY On-site / Doorstep
  v_method_norm := lower(trim(coalesce(v_ticket.method, '')));
  if not (v_method_norm like '%on-site%' or v_method_norm like '%doorstep%') then
    return jsonb_build_object(
      'ok', false, 
      'error', format('Rescheduling is available only for On-site Technician Visits (current method: "%s").', v_ticket.method)
    );
  end if;

  -- 4. Check if current appointment has been scheduled
  if v_ticket.preferred_date is null then
    return jsonb_build_object('ok', false, 'error', 'Cannot reschedule an appointment that has not yet been scheduled.');
  end if;

  -- 5. Ticket Status Eligibility Check: cannot reschedule if completed/cancelled
  if v_ticket.status in ('Completed', 'Cancelled', 'Delivered', 'Returned') then
    return jsonb_build_object('ok', false, 'error', format('Cannot reschedule ticket in "%s" status.', v_ticket.status));
  end if;

  -- 6. Date validation: Requested date must be strictly in the future (tomorrow onwards)
  if p_requested_date <= current_date then
    return jsonb_build_object('ok', false, 'error', 'Requested appointment date must be in the future.');
  end if;

  -- Sunday validation: IT HUB is closed on Sundays (extract(dow from p_requested_date) = 0)
  if extract(dow from p_requested_date) = 0 then
    return jsonb_build_object('ok', false, 'error', 'IT HUB is closed on Sundays. Please select Monday through Saturday.');
  end if;

  -- 7. Check for conflicting pending request
  if exists (
    select 1 from public.service_appointment_reschedule_requests
    where ticket_id = p_ticket_id and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'error', 'A pending reschedule request already exists for this appointment.');
  end if;

  -- 8. Insert new reschedule request
  insert into public.service_appointment_reschedule_requests (
    ticket_id,
    customer_user_id,
    original_date,
    original_slot,
    requested_date,
    requested_slot,
    reason,
    status
  ) values (
    p_ticket_id,
    v_customer_id,
    v_ticket.preferred_date,
    coalesce(v_ticket.preferred_slot, '10:00 – 12:00'),
    p_requested_date,
    trim(p_requested_slot),
    nullif(trim(p_reason), ''),
    'pending'
  )
  returning id into v_new_req_id;

  -- 9. Update service_requests.reschedule_details jsonb for seamless backwards compatibility
  -- Note: Original confirmed appointment (preferred_date, preferred_slot) is strictly PRESERVED!
  update public.service_requests
  set reschedule_details = jsonb_build_object(
    'requestId', v_new_req_id,
    'requestedDate', to_char(p_requested_date, 'YYYY-MM-DD'),
    'requestedSlot', trim(p_requested_slot),
    'currentDate', to_char(v_ticket.preferred_date, 'YYYY-MM-DD'),
    'currentSlot', coalesce(v_ticket.preferred_slot, '10:00 – 12:00'),
    'reason', nullif(trim(p_reason), ''),
    'status', 'pending',
    'submittedAt', now()
  ),
  updated_at = now()
  where id = p_ticket_id;

  -- 10. Persist staff notification / alert
  insert into public.staff_notifications (
    ticket_id,
    reschedule_request_id,
    event_type,
    title,
    description,
    metadata
  ) values (
    p_ticket_id,
    v_new_req_id,
    'CUSTOMER_RESCHEDULE_REQUESTED',
    'Customer Appointment Reschedule Request',
    format('Customer requested new slot on %s (%s) for %s.', to_char(p_requested_date, 'DD Mon YYYY'), trim(p_requested_slot), coalesce(v_ticket.device, 'Device')),
    jsonb_build_object(
      'ticketReference', coalesce(v_ticket.ticket_reference, p_ticket_id::text),
      'currentDate', to_char(v_ticket.preferred_date, 'YYYY-MM-DD'),
      'currentSlot', v_ticket.preferred_slot,
      'requestedDate', to_char(p_requested_date, 'YYYY-MM-DD'),
      'requestedSlot', trim(p_requested_slot),
      'reason', nullif(trim(p_reason), '')
    )
  ) on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'requestId', v_new_req_id,
    'status', 'pending',
    'message', 'Reschedule request submitted successfully. IT HUB team will review your preferred schedule.'
  );
end;
$$;

-- Grant execution to authenticated and anon users (RPC itself enforces ticket ownership)
grant execute on function public.customer_request_appointment_reschedule(uuid, date, text, text) to authenticated, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. ATOMIC RPC: staff_decide_appointment_reschedule
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.staff_decide_appointment_reschedule(
  p_request_id uuid,
  p_decision text, -- 'approved' or 'rejected'
  p_staff_response text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_req record;
  v_ticket record;
  v_caller_id uuid;
  v_decision_clean text;
begin
  v_caller_id := auth.uid();

  -- 1. Authorization: Only verified staff can approve or reject
  if not public.can_manage_services() then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized: Only authorized IT HUB service staff can decide reschedule requests.');
  end if;

  v_decision_clean := lower(trim(coalesce(p_decision, '')));
  if v_decision_clean not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'Decision must be either "approved" or "rejected".');
  end if;

  -- 2. Fetch reschedule request with row-level lock
  select *
  into v_req
  from public.service_appointment_reschedule_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Reschedule request not found.');
  end if;

  -- 3. Verify request is still pending (concurrency & race condition check)
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', format('This reschedule request has already been %s.', v_req.status));
  end if;

  -- 4. Fetch target service ticket
  select *
  into v_ticket
  from public.service_requests
  where id = v_req.ticket_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Service ticket associated with this request was not found.');
  end if;

  -- 5. Execute decision atomically
  if v_decision_clean = 'approved' then
    -- On Approval:
    -- Update confirmed appointment to the requested schedule
    update public.service_requests
    set preferred_date = v_req.requested_date,
        preferred_slot = v_req.requested_slot,
        reschedule_details = jsonb_build_object(
          'requestId', v_req.id,
          'status', 'approved',
          'decidedAt', now(),
          'approvedDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
          'approvedSlot', v_req.requested_slot,
          'previousDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
          'previousSlot', v_req.original_slot,
          'staffResponse', nullif(trim(p_staff_response), '')
        ),
        updated_at = now()
    where id = v_req.ticket_id;

    -- Update request status
    update public.service_appointment_reschedule_requests
    set status = 'approved',
        staff_actor_id = v_caller_id,
        staff_response = nullif(trim(p_staff_response), ''),
        decided_at = now(),
        updated_at = now()
    where id = p_request_id;

    -- Insert immutable audit log
    insert into public.staff_audit_logs (
      staff_user_id,
      action_type,
      entity_type,
      entity_id,
      previous_status,
      new_status,
      metadata
    ) values (
      v_caller_id,
      'APPROVE_RESCHEDULE',
      'service_request',
      v_req.ticket_id::text,
      v_ticket.status,
      v_ticket.status,
      jsonb_build_object(
        'requestId', v_req.id,
        'oldDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
        'oldSlot', v_req.original_slot,
        'newDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
        'newSlot', v_req.requested_slot,
        'staffResponse', nullif(trim(p_staff_response), '')
      )
    );

  else
    -- On Rejection:
    -- Preserve original confirmed appointment UNCHANGED!
    update public.service_requests
    set reschedule_details = jsonb_build_object(
          'requestId', v_req.id,
          'status', 'rejected',
          'decidedAt', now(),
          'requestedDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
          'requestedSlot', v_req.requested_slot,
          'preservedDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
          'preservedSlot', v_req.original_slot,
          'staffResponse', nullif(trim(p_staff_response), '')
        ),
        updated_at = now()
    where id = v_req.ticket_id;

    -- Update request status
    update public.service_appointment_reschedule_requests
    set status = 'rejected',
        staff_actor_id = v_caller_id,
        staff_response = nullif(trim(p_staff_response), ''),
        decided_at = now(),
        updated_at = now()
    where id = p_request_id;

    -- Insert immutable audit log
    insert into public.staff_audit_logs (
      staff_user_id,
      action_type,
      entity_type,
      entity_id,
      previous_status,
      new_status,
      metadata
    ) values (
      v_caller_id,
      'REJECT_RESCHEDULE',
      'service_request',
      v_req.ticket_id::text,
      v_ticket.status,
      v_ticket.status,
      jsonb_build_object(
        'requestId', v_req.id,
        'preservedDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
        'preservedSlot', v_req.original_slot,
        'rejectedDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
        'rejectedSlot', v_req.requested_slot,
        'staffResponse', nullif(trim(p_staff_response), '')
      )
    );
  end if;

  -- Mark related notifications as read
  update public.staff_notifications
  set read = true
  where reschedule_request_id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'status', v_decision_clean,
    'requestId', p_request_id,
    'ticketId', v_req.ticket_id,
    'message', format('Reschedule request %s successfully.', v_decision_clean)
  );
end;
$$;

grant execute on function public.staff_decide_appointment_reschedule(uuid, text, text) to authenticated;
