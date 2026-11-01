-- ============================================================================
-- IT HUB — Customer Rescheduling Notifications, Staff Portal Badges & Customer Audits
-- Migration: 20261031000006_customer_rescheduling_notifications_and_audits.sql
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CUSTOMER NOTIFICATIONS TABLE
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid references public.service_requests(id) on delete cascade,
  reschedule_request_id uuid references public.service_appointment_reschedule_requests(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_customer_notifications_user_id 
  on public.customer_notifications(user_id);
create index if not exists idx_customer_notifications_read 
  on public.customer_notifications(read);

alter table public.customer_notifications enable row level security;

drop policy if exists "Customers can view their own notifications" on public.customer_notifications;
create policy "Customers can view their own notifications"
  on public.customer_notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists "Customers can update their own notifications" on public.customer_notifications;
create policy "Customers can update their own notifications"
  on public.customer_notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Staff and callers can insert customer notifications" on public.customer_notifications;
create policy "Staff and callers can insert customer notifications"
  on public.customer_notifications
  for insert
  with check (
    public.can_manage_services() 
    or public.is_staff() 
    or auth.uid() = user_id
    or auth.uid() is not null
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CUSTOMER AUDITS & LOCATION MANAGEMENT TABLE
-- ────────────────────────────────────────────────────────────────────────────

create sequence if not exists public.customer_audit_ref_seq start with 1001;

create or replace function public.generate_customer_audit_reference()
returns text
language plpgsql
as $$
declare
  v_num bigint;
begin
  v_num := nextval('public.customer_audit_ref_seq');
  return 'ITH-AUD-' || lpad(v_num::text, 6, '0');
end;
$$;

create table if not exists public.customer_audits (
  id uuid primary key default gen_random_uuid(),
  audit_reference text not null unique,
  audit_type text not null default 'On-site Inspection',
  status text not null default 'Pending' check (status in ('Pending', 'Scheduled', 'In Progress', 'Completed', 'Cancelled')),
  purpose text not null,
  description text,
  
  -- Customer information
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  service_ticket_id uuid references public.service_requests(id) on delete set null,
  service_ticket_reference text,
  
  -- Location information
  service_address text not null,
  city text not null default 'Kothamangalam',
  district text not null default 'Ernakulam',
  pincode text,
  landmarks text,
  latitude double precision,
  longitude double precision,
  
  -- Audit details
  observations text,
  findings text,
  notes text,
  documents jsonb not null default '[]'::jsonb,
  
  -- Staff attribution
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  assigned_staff_id uuid references auth.users(id) on delete set null,
  assigned_staff_name text,
  last_updated_by uuid references auth.users(id) on delete set null,
  last_updated_by_name text,
  
  scheduled_date date,
  scheduled_slot text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_customer_audits_reference 
  on public.customer_audits(audit_reference);
create index if not exists idx_customer_audits_customer_id 
  on public.customer_audits(customer_id);
create index if not exists idx_customer_audits_status 
  on public.customer_audits(status);
create index if not exists idx_customer_audits_created_at 
  on public.customer_audits(created_at);

create table if not exists public.customer_audit_history (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.customer_audits(id) on delete cascade,
  staff_user_id uuid references auth.users(id) on delete set null,
  staff_name text,
  action text not null,
  previous_status text,
  new_status text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_customer_audit_history_audit_id 
  on public.customer_audit_history(audit_id);

alter table public.customer_audits enable row level security;
alter table public.customer_audit_history enable row level security;

-- STRICT STAFF-ONLY RLS POLICIES FOR AUDITS (No public exposure of customer location or notes)
drop policy if exists "Staff can view all customer audits" on public.customer_audits;
create policy "Staff can view all customer audits"
  on public.customer_audits
  for select
  using (public.can_manage_services() or public.is_staff());

drop policy if exists "Staff can insert customer audits" on public.customer_audits;
create policy "Staff can insert customer audits"
  on public.customer_audits
  for insert
  with check (public.can_manage_services() or public.is_staff());

drop policy if exists "Staff can update customer audits" on public.customer_audits;
create policy "Staff can update customer audits"
  on public.customer_audits
  for update
  using (public.can_manage_services() or public.is_staff())
  with check (public.can_manage_services() or public.is_staff());

drop policy if exists "Staff can view audit history" on public.customer_audit_history;
create policy "Staff can view audit history"
  on public.customer_audit_history
  for select
  using (public.can_manage_services() or public.is_staff());

drop policy if exists "Staff can insert audit history" on public.customer_audit_history;
create policy "Staff can insert audit history"
  on public.customer_audit_history
  for insert
  with check (public.can_manage_services() or public.is_staff());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. EXPAND STAFF AUDIT LOGS ENTITY CHECK CONSTRAINT
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
      'review'::text,
      'partner_certificate'::text,
      'website_showcase'::text,
      'promotional_campaign'::text,
      'customer_audit'::text
    ])
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. UPDATE RPC: customer_request_appointment_reschedule (with Customer Notification)
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
  v_cust_name text;
  v_cust_phone text;
  v_cust_email text;
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

  -- Fetch customer profile info if available
  if v_customer_id is not null then
    select full_name, phone, email into v_cust_name, v_cust_phone, v_cust_email
    from public.profiles
    where id = v_customer_id;
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

  -- 10. Persist staff notification with full customer details
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
    format('Customer %s requested new slot on %s (%s) for %s.', coalesce(v_cust_name, 'Valued Customer'), to_char(p_requested_date, 'DD Mon YYYY'), trim(p_requested_slot), coalesce(v_ticket.device, 'Device')),
    jsonb_build_object(
      'ticketReference', coalesce(v_ticket.ticket_reference, p_ticket_id::text),
      'customerName', coalesce(v_cust_name, 'Customer'),
      'customerPhone', coalesce(v_cust_phone, ''),
      'customerEmail', coalesce(v_cust_email, ''),
      'currentDate', to_char(v_ticket.preferred_date, 'YYYY-MM-DD'),
      'currentSlot', v_ticket.preferred_slot,
      'requestedDate', to_char(p_requested_date, 'YYYY-MM-DD'),
      'requestedSlot', trim(p_requested_slot),
      'reason', nullif(trim(p_reason), ''),
      'submittedAt', now()
    )
  ) on conflict do nothing;

  -- 11. Persist customer notification
  if v_customer_id is not null then
    insert into public.customer_notifications (
      user_id,
      ticket_id,
      reschedule_request_id,
      event_type,
      title,
      message,
      metadata
    ) values (
      v_customer_id,
      p_ticket_id,
      v_new_req_id,
      'RESCHEDULE_SUBMITTED',
      'Appointment Reschedule Requested',
      format('Your request to reschedule ticket %s to %s (%s) has been submitted for staff review.',
             coalesce(v_ticket.ticket_reference, p_ticket_id::text),
             to_char(p_requested_date, 'DD Mon YYYY'),
             trim(p_requested_slot)),
      jsonb_build_object(
        'ticketReference', coalesce(v_ticket.ticket_reference, p_ticket_id::text),
        'requestedDate', to_char(p_requested_date, 'YYYY-MM-DD'),
        'requestedSlot', trim(p_requested_slot),
        'reason', nullif(trim(p_reason), ''),
        'submittedAt', now()
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'requestId', v_new_req_id,
    'status', 'pending',
    'message', 'Reschedule request submitted successfully. IT HUB team will review your preferred schedule.'
  );
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. UPDATE RPC: staff_decide_appointment_reschedule (with Customer Notification)
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
  v_target_user_id uuid;
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

  v_target_user_id := coalesce(v_req.customer_user_id, v_ticket.user_id);

  -- 5. Execute decision atomically
  if v_decision_clean = 'approved' then
    -- On Approval: Update confirmed appointment
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

    -- Notify Customer: APPROVED
    if v_target_user_id is not null then
      insert into public.customer_notifications (
        user_id,
        ticket_id,
        reschedule_request_id,
        event_type,
        title,
        message,
        metadata
      ) values (
        v_target_user_id,
        v_req.ticket_id,
        p_request_id,
        'RESCHEDULE_APPROVED',
        'Appointment Rescheduled & Confirmed',
        format('Your on-site appointment for ticket %s has been confirmed for %s (%s).%s',
               coalesce(v_ticket.ticket_reference, v_req.ticket_id::text),
               to_char(v_req.requested_date, 'DD Mon YYYY'),
               v_req.requested_slot,
               case when p_staff_response is not null and trim(p_staff_response) <> '' then ' Note: ' || trim(p_staff_response) else '' end),
        jsonb_build_object(
          'ticketReference', coalesce(v_ticket.ticket_reference, v_req.ticket_id::text),
          'confirmedDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
          'confirmedSlot', v_req.requested_slot,
          'previousDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
          'previousSlot', v_req.original_slot,
          'staffResponse', nullif(trim(p_staff_response), '')
        )
      );
    end if;

  else
    -- On Rejection: Preserve original confirmed appointment UNCHANGED!
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

    -- Notify Customer: REJECTED (original appointment active)
    if v_target_user_id is not null then
      insert into public.customer_notifications (
        user_id,
        ticket_id,
        reschedule_request_id,
        event_type,
        title,
        message,
        metadata
      ) values (
        v_target_user_id,
        v_req.ticket_id,
        p_request_id,
        'RESCHEDULE_REJECTED',
        'Appointment Reschedule Request Update',
        format('Your reschedule request for ticket %s could not be accommodated. Your original slot on %s (%s) remains active.%s',
               coalesce(v_ticket.ticket_reference, v_req.ticket_id::text),
               to_char(v_req.original_date, 'DD Mon YYYY'),
               v_req.original_slot,
               case when p_staff_response is not null and trim(p_staff_response) <> '' then ' Reason: ' || trim(p_staff_response) else '' end),
        jsonb_build_object(
          'ticketReference', coalesce(v_ticket.ticket_reference, v_req.ticket_id::text),
          'preservedDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
          'preservedSlot', v_req.original_slot,
          'requestedDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
          'requestedSlot', v_req.requested_slot,
          'staffResponse', nullif(trim(p_staff_response), '')
        )
      );
    end if;
  end if;

  -- Mark related staff notifications as read
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

-- ────────────────────────────────────────────────────────────────────────────
-- 6. REALTIME PUBLICATION
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  begin
    alter publication supabase_realtime add table public.customer_notifications;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.customer_audits;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.customer_audit_history;
  exception when others then null;
  end;
end $$;
