-- Staff, customer and payment RPCs.
--
-- Every function here identifies the caller with auth.uid() before doing anything, refuses with
-- "is not true" so NULL can't pass, and has an empty search_path with fully qualified names.
-- Audit rows always name the verified caller. No function substitutes another account.

-- ─── Staff service workflow ──────────────────────────────────────────────────────────────────────

create or replace function public.staff_update_service_status(
  p_service_id uuid,
  p_new_status text,
  p_technician_name text default null,
  p_internal_notes text default null,
  p_findings jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_old_tech text;
  v_staff_id uuid := auth.uid();
  v_req record;
begin
  if v_staff_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if public.can_manage_services() is not true then
    raise exception 'Unauthorized: Staff service management permissions required.' using errcode = '42501';
  end if;

  if p_new_status is null or p_new_status not in (
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

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
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

create or replace function public.staff_update_status_description(
  p_service_id uuid,
  p_status text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := auth.uid();
  v_req record;
  v_old_desc text;
  v_new_descriptions jsonb;
  v_trimmed_desc text;
begin
  if v_staff_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if public.can_manage_services() is not true then
    raise exception 'Unauthorized: Staff service management permissions required.' using errcode = '42501';
  end if;

  select * into v_req from public.service_requests where id = p_service_id for update;
  if not found then
    raise exception 'Service request record % not found.', p_service_id;
  end if;

  v_trimmed_desc := trim(coalesce(p_description, ''));
  v_old_desc := coalesce(v_req.status_descriptions->>p_status, '');

  if v_trimmed_desc = '' then
    v_new_descriptions := coalesce(v_req.status_descriptions, '{}'::jsonb) - p_status;
  else
    v_new_descriptions := jsonb_set(
      coalesce(v_req.status_descriptions, '{}'::jsonb),
      array[p_status],
      to_jsonb(v_trimmed_desc)
    );
  end if;

  update public.service_requests
  set status_descriptions = v_new_descriptions, updated_at = now()
  where id = p_service_id;

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
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

-- This function failed for every caller: its audit insert named columns that don't exist.
create or replace function public.staff_confirm_service_payment_collected(
  p_service_request_id uuid,
  p_collected_amount numeric,
  p_payment_method text default 'store',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := auth.uid();
  v_req record;
  v_billing jsonb;
  v_method text := coalesce(p_payment_method, 'store');
begin
  if v_staff_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if public.can_manage_services() is not true then
    raise exception 'Unauthorized: Only authorized service staff can confirm payment collection.'
      using errcode = '42501';
  end if;

  if p_collected_amount is null or p_collected_amount <= 0 then
    raise exception 'collected_amount must be greater than zero';
  end if;
  if v_method not in ('store', 'upi') then
    raise exception 'Invalid payment method: %', v_method;
  end if;

  select * into v_req from public.service_requests where id = p_service_request_id for update;
  if not found then
    raise exception 'Service request not found';
  end if;
  if v_req.payment_status = 'Paid' then
    raise exception 'Service ticket is already marked as Paid';
  end if;

  v_billing := coalesce(v_req.billing_details, '{}'::jsonb) || jsonb_build_object(
    'paymentMethod', v_method,
    'paymentStatus', 'Received',
    'collectedAmount', p_collected_amount,
    'collectedAt', now(),
    'receiptNote', p_notes
  );

  update public.service_requests
  set
    payment_status = 'Paid',
    payment_method = v_method,
    paid_at = now(),
    paid_amount = p_collected_amount,
    payment_collected_by = v_staff_id,
    billing_details = v_billing,
    updated_at = now()
  where id = p_service_request_id;

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
  ) values (
    v_staff_id,
    'SERVICE_PAYMENT_COLLECTED',
    'service_request',
    p_service_request_id::text,
    v_req.payment_status,
    'Paid',
    jsonb_build_object('amount', p_collected_amount, 'payment_method', v_method, 'notes', p_notes)
  );

  return jsonb_build_object(
    'ok', true,
    'service_id', v_req.id,
    'payment_status', 'Paid',
    'paid_amount', p_collected_amount
  );
end;
$$;

-- On-site billing from the Staff Portal. It replaces a direct table update whose audit insert
-- named columns that don't exist, so those writes were never audited.
create or replace function public.staff_save_service_billing(
  p_service_id uuid,
  p_billing jsonb,
  p_is_paid boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := auth.uid();
  v_req record;
  v_total numeric;
  v_method text;
begin
  if v_staff_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if public.can_manage_services() is not true then
    raise exception 'Unauthorized: Only authorized service staff can save billing.'
      using errcode = '42501';
  end if;
  if p_billing is null or jsonb_typeof(p_billing) <> 'object' then
    raise exception 'Billing details are required';
  end if;

  select * into v_req from public.service_requests where id = p_service_id for update;
  if not found then
    raise exception 'Service request not found';
  end if;
  if v_req.payment_status = 'Paid' then
    raise exception 'Service ticket is already marked as Paid';
  end if;

  if p_is_paid is true then
    v_total := nullif(p_billing->>'total', '')::numeric;
    if v_total is null or v_total <= 0 then
      raise exception 'A paid bill must have a total greater than zero';
    end if;
    v_method := case when lower(coalesce(p_billing->>'paymentMethod', '')) like '%upi%' then 'upi' else 'store' end;

    update public.service_requests
    set
      billing_details = p_billing,
      payment_status = 'Paid',
      payment_method = v_method,
      paid_amount = v_total,
      paid_at = now(),
      payment_collected_by = v_staff_id,
      updated_at = now()
    where id = p_service_id;
  else
    update public.service_requests
    set
      billing_details = p_billing,
      payment_status = 'Pay at Store',
      payment_method = 'store',
      updated_at = now()
    where id = p_service_id;
  end if;

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
  ) values (
    v_staff_id,
    case when p_is_paid is true then 'SERVICE_PAYMENT_COLLECTED' else 'SAVE_ONSITE_BILLING' end,
    'service_request',
    p_service_id::text,
    v_req.payment_status,
    case when p_is_paid is true then 'Paid' else 'Pay at Store' end,
    p_billing
  );

  return jsonb_build_object('ok', true, 'service_id', p_service_id, 'is_paid', p_is_paid is true);
end;
$$;

-- ─── Reschedule workflow ─────────────────────────────────────────────────────────────────────────

drop function if exists public.staff_decide_appointment_reschedule(uuid, text, text);

CREATE OR REPLACE FUNCTION public.staff_decide_appointment_reschedule(p_request_id uuid DEFAULT NULL::uuid, p_decision text DEFAULT 'approved'::text, p_staff_response text DEFAULT NULL::text, p_ticket_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req record;
  v_ticket record;
  v_caller_id uuid;
  v_decision_clean text;
  v_target_user_id uuid;
  v_req_id uuid;
  v_effective_ticket_id uuid;
  v_new_status text;
  v_prev_status text;
  v_reverted_status text;
  v_new_date date;
  v_new_slot text;
begin
  -- The actor is the verified caller. There is no fallback to another account: an action nobody
  -- can be held to account for doesn't happen.
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if public.can_manage_services() is not true then
    raise exception 'Unauthorized: Only authorized IT HUB service staff can decide reschedule requests.'
      using errcode = '42501';
  end if;

  v_decision_clean := lower(trim(coalesce(p_decision, '')));
  if v_decision_clean not in ('approved', 'rejected') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Decision must be either "approved" or "rejected".'
    );
  end if;

  v_req_id := p_request_id;

  -- 2. If p_request_id was not directly supplied, look up pending request by ticket_id
  if v_req_id is null and p_ticket_id is not null then
    select id into v_req_id
    from public.service_appointment_reschedule_requests
    where ticket_id = p_ticket_id and status = 'pending'
    order by created_at desc
    limit 1;
  end if;

  -- 3. CASE A: Matching request row exists in service_appointment_reschedule_requests
  if v_req_id is not null then
    select *
    into v_req
    from public.service_appointment_reschedule_requests
    where id = v_req_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'Reschedule request record not found.');
    end if;

    if v_req.status <> 'pending' then
      return jsonb_build_object(
        'ok', false,
        'error', format('This reschedule request has already been %s.', v_req.status)
      );
    end if;

    v_effective_ticket_id := v_req.ticket_id;

    select *
    into v_ticket
    from public.service_requests
    where id = v_effective_ticket_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'Associated service ticket was not found.');
    end if;

    v_prev_status := v_ticket.status;
    v_target_user_id := coalesce(v_req.customer_user_id, v_ticket.user_id);

    if v_decision_clean = 'approved' then
      v_new_status := 'Rescheduled';

      -- Update service ticket confirmed appointment and status
      update public.service_requests
      set status = 'Rescheduled',
          preferred_date = v_req.requested_date,
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
      where id = v_effective_ticket_id;

      -- Update request table
      update public.service_appointment_reschedule_requests
      set status = 'approved',
          staff_actor_id = v_caller_id,
          staff_response = nullif(trim(p_staff_response), ''),
          decided_at = now(),
          updated_at = now()
      where id = v_req.id;

      -- Staff Audit Log
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
        v_effective_ticket_id::text,
        v_prev_status,
        v_new_status,
        jsonb_build_object(
          'requestId', v_req.id,
          'oldDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
          'oldSlot', v_req.original_slot,
          'newDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
          'newSlot', v_req.requested_slot,
          'staffResponse', nullif(trim(p_staff_response), '')
        )
      );

      -- Customer notification
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
          v_effective_ticket_id,
          v_req.id,
          'RESCHEDULE_APPROVED',
          'Appointment Rescheduled & Confirmed',
          format('Your on-site appointment for ticket %s has been confirmed for %s (%s).%s',
                 coalesce(v_ticket.ticket_reference, v_effective_ticket_id::text),
                 to_char(v_req.requested_date, 'DD Mon YYYY'),
                 v_req.requested_slot,
                 case when p_staff_response is not null and trim(p_staff_response) <> '' then ' Note: ' || trim(p_staff_response) else '' end),
          jsonb_build_object(
            'ticketReference', coalesce(v_ticket.ticket_reference, v_effective_ticket_id::text),
            'confirmedDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
            'confirmedSlot', v_req.requested_slot,
            'previousDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
            'previousSlot', v_req.original_slot,
            'staffResponse', nullif(trim(p_staff_response), '')
          )
        );
      end if;

      return jsonb_build_object(
        'ok', true,
        'decision', 'approved',
        'newStatus', v_new_status,
        'newDate', to_char(v_req.requested_date, 'YYYY-MM-DD'),
        'newSlot', v_req.requested_slot
      );

    else
      -- On Rejection: Revert status if it was 'Reschedule Requested' back to 'Booked'
      v_reverted_status := case
        when v_prev_status = 'Reschedule Requested' then 'Booked'
        else v_prev_status
      end;

      update public.service_requests
      set status = v_reverted_status,
          reschedule_details = jsonb_build_object(
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
      where id = v_effective_ticket_id;

      update public.service_appointment_reschedule_requests
      set status = 'rejected',
          staff_actor_id = v_caller_id,
          staff_response = nullif(trim(p_staff_response), ''),
          decided_at = now(),
          updated_at = now()
      where id = v_req.id;

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
        v_effective_ticket_id::text,
        v_prev_status,
        v_reverted_status,
        jsonb_build_object(
          'requestId', v_req.id,
          'preservedDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
          'preservedSlot', v_req.original_slot,
          'staffResponse', nullif(trim(p_staff_response), '')
        )
      );

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
          v_effective_ticket_id,
          v_req.id,
          'RESCHEDULE_REJECTED',
          'Reschedule Request Declined',
          format('Your reschedule request for ticket %s could not be accommodated. Your confirmed appointment remains %s (%s).%s',
                 coalesce(v_ticket.ticket_reference, v_effective_ticket_id::text),
                 to_char(v_req.original_date, 'DD Mon YYYY'),
                 v_req.original_slot,
                 case when p_staff_response is not null and trim(p_staff_response) <> '' then ' Reason: ' || trim(p_staff_response) else '' end),
          jsonb_build_object(
            'ticketReference', coalesce(v_ticket.ticket_reference, v_effective_ticket_id::text),
            'confirmedDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
            'confirmedSlot', v_req.original_slot,
            'staffResponse', nullif(trim(p_staff_response), '')
          )
        );
      end if;

      return jsonb_build_object(
        'ok', true,
        'decision', 'rejected',
        'newStatus', v_reverted_status,
        'preservedDate', to_char(v_req.original_date, 'YYYY-MM-DD'),
        'preservedSlot', v_req.original_slot
      );
    end if;

  -- 4. CASE B: Direct ticket fallback when no request row in table
  else
    if p_ticket_id is null then
      return jsonb_build_object('ok', false, 'error', 'No reschedule request or ticket ID specified.');
    end if;

    select *
    into v_ticket
    from public.service_requests
    where id = p_ticket_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'Service ticket not found.');
    end if;

    v_prev_status := v_ticket.status;
    v_target_user_id := v_ticket.user_id;

    if v_decision_clean = 'approved' then
      v_new_status := 'Rescheduled';
      begin
        v_new_date := (v_ticket.reschedule_details ->> 'requestedDate')::date;
      exception when others then
        v_new_date := v_ticket.preferred_date;
      end;
      v_new_slot := coalesce(nullif(v_ticket.reschedule_details ->> 'requestedSlot', ''), v_ticket.preferred_slot);

      update public.service_requests
      set status = 'Rescheduled',
          preferred_date = coalesce(v_new_date, preferred_date),
          preferred_slot = coalesce(v_new_slot, preferred_slot),
          reschedule_details = jsonb_build_object(
            'status', 'approved',
            'decidedAt', now(),
            'approvedDate', to_char(coalesce(v_new_date, preferred_date), 'YYYY-MM-DD'),
            'approvedSlot', coalesce(v_new_slot, preferred_slot),
            'staffResponse', nullif(trim(p_staff_response), '')
          ),
          updated_at = now()
      where id = p_ticket_id;

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
        p_ticket_id::text,
        v_prev_status,
        v_new_status,
        jsonb_build_object(
          'newDate', to_char(coalesce(v_new_date, v_ticket.preferred_date), 'YYYY-MM-DD'),
          'newSlot', coalesce(v_new_slot, v_ticket.preferred_slot),
          'staffResponse', nullif(trim(p_staff_response), '')
        )
      );

      return jsonb_build_object(
        'ok', true,
        'decision', 'approved',
        'newStatus', v_new_status
      );

    else
      v_reverted_status := case
        when v_prev_status = 'Reschedule Requested' then 'Booked'
        else v_prev_status
      end;

      update public.service_requests
      set status = v_reverted_status,
          reschedule_details = jsonb_build_object(
            'status', 'rejected',
            'decidedAt', now(),
            'preservedDate', to_char(v_ticket.preferred_date, 'YYYY-MM-DD'),
            'preservedSlot', v_ticket.preferred_slot,
            'staffResponse', nullif(trim(p_staff_response), '')
          ),
          updated_at = now()
      where id = p_ticket_id;

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
        p_ticket_id::text,
        v_prev_status,
        v_reverted_status,
        jsonb_build_object('staffResponse', nullif(trim(p_staff_response), ''))
      );

      return jsonb_build_object(
        'ok', true,
        'decision', 'rejected',
        'newStatus', v_reverted_status
      );
    end if;
  end if;
end;
$function$;

create or replace function public.customer_request_appointment_reschedule(
  p_ticket_id uuid,
  p_requested_date date,
  p_requested_slot text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
  v_new_req_id uuid;
  v_customer_id uuid;
  v_method_norm text;
  v_caller_id uuid := auth.uid();
  v_cust_name text;
  v_cust_phone text;
  v_cust_email text;
begin
  -- Anonymous callers used to skip the ownership check entirely.
  if v_caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select id, user_id, method, preferred_date, preferred_slot, status, ticket_reference, device, model
  into v_ticket
  from public.service_requests
  where id = p_ticket_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Service ticket not found.');
  end if;

  if v_ticket.user_id is distinct from v_caller_id and public.can_manage_services() is not true then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized: You can only reschedule your own service ticket.');
  end if;

  -- The request always belongs to the ticket's customer, even when staff file it for them.
  v_customer_id := v_ticket.user_id;

  v_method_norm := lower(trim(coalesce(v_ticket.method, '')));
  if not (v_method_norm like '%on-site%' or v_method_norm like '%doorstep%') then
    return jsonb_build_object(
      'ok', false,
      'error', format('Rescheduling is available only for On-site Technician Visits (current method: "%s").', v_ticket.method)
    );
  end if;

  if v_ticket.preferred_date is null then
    return jsonb_build_object('ok', false, 'error', 'Cannot reschedule an appointment that has not yet been scheduled.');
  end if;

  if v_ticket.status in ('Completed', 'Cancelled', 'Delivered', 'Returned') then
    return jsonb_build_object('ok', false, 'error', format('Cannot reschedule ticket in "%s" status.', v_ticket.status));
  end if;

  if p_requested_date is null or p_requested_date <= current_date then
    return jsonb_build_object('ok', false, 'error', 'Requested appointment date must be in the future.');
  end if;

  if extract(dow from p_requested_date) = 0 then
    return jsonb_build_object('ok', false, 'error', 'IT HUB is closed on Sundays. Please select Monday through Saturday.');
  end if;

  if exists (
    select 1 from public.service_appointment_reschedule_requests
    where ticket_id = p_ticket_id and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'error', 'A pending reschedule request already exists for this appointment.');
  end if;

  select full_name, phone, email into v_cust_name, v_cust_phone, v_cust_email
  from public.profiles
  where id = v_customer_id;

  insert into public.service_appointment_reschedule_requests (
    ticket_id, customer_user_id, original_date, original_slot,
    requested_date, requested_slot, reason, status
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

  insert into public.staff_notifications (
    ticket_id, reschedule_request_id, event_type, title, description, metadata
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

  insert into public.customer_notifications (
    user_id, ticket_id, reschedule_request_id, event_type, title, message, metadata
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

  return jsonb_build_object(
    'ok', true,
    'requestId', v_new_req_id,
    'status', 'pending',
    'message', 'Reschedule request submitted successfully. IT HUB team will review your preferred schedule.'
  );
end;
$$;

-- ─── Customer ticket actions ─────────────────────────────────────────────────────────────────────

-- Customers previously cancelled by updating the ticket directly. That write path is gone.
create or replace function public.customer_cancel_service_request(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_ticket record;
begin
  if v_caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select id, user_id, status, payment_status into v_ticket
  from public.service_requests
  where id = p_ticket_id
  for update;

  if not found or v_ticket.user_id is distinct from v_caller_id then
    raise exception 'Service ticket not found.' using errcode = '42501';
  end if;

  if v_ticket.status = 'Cancelled' then
    return jsonb_build_object('ok', true, 'status', 'Cancelled', 'idempotent', true);
  end if;
  if v_ticket.status in ('Completed', 'Delivered', 'Returned') or v_ticket.payment_status = 'Paid' then
    raise exception 'This ticket can no longer be cancelled online. Please contact IT HUB.';
  end if;

  update public.service_requests
  set status = 'Cancelled', updated_at = now()
  where id = p_ticket_id;

  return jsonb_build_object('ok', true, 'status', 'Cancelled');
end;
$$;

CREATE OR REPLACE FUNCTION public.submit_customer_quote_decision(p_request_id uuid, p_decision text, p_approved_item_ids text[], p_expected_version integer, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req record;
  v_items jsonb;
  v_elem jsonb;
  v_elem_id text;
  v_part_cost numeric;
  v_labour_cost numeric;
  v_qty numeric;
  v_discount numeric;
  v_is_required boolean;
  v_can_defer boolean;
  v_depends_on jsonb;
  v_dep_elem jsonb;
  v_dep_text text;
  v_updated_items jsonb := '[]'::jsonb;
  v_recalculated_total numeric(12, 2) := 0;
  v_approved_count int := 0;
  v_new_status text;
  v_declined_items text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Unauthorized: Authentication required';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: Must be approved or rejected';
  end if;

  select * into v_req
  from public.service_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Service request not found';
  end if;

  if v_req.user_id is distinct from auth.uid() and public.is_admin() is not true then
    raise exception 'Unauthorized: You do not own this service ticket';
  end if;

  if v_req.quote_state is distinct from 'pending' then
    raise exception 'Invalid state: Quotation is not awaiting approval (current: %)', coalesce(v_req.quote_state, 'none');
  end if;

  if v_req.quote_version is distinct from p_expected_version then
    raise exception 'Stale quotation: Quotation has been revised to version %. Please refresh to review the latest estimate.', v_req.quote_version;
  end if;

  v_items := coalesce(v_req.quotation_items, '[]'::jsonb);

  if p_decision = 'rejected' or p_approved_item_ids is null or array_length(p_approved_item_ids, 1) is null or array_length(p_approved_item_ids, 1) = 0 then
    p_decision := 'rejected';
    p_approved_item_ids := '{}';
    v_new_status := 'Awaiting Approval';

    if jsonb_typeof(v_items) = 'array' then
      for v_elem in select * from jsonb_array_elements(v_items) loop
        v_elem_id := v_elem->>'id';
        if v_elem_id is not null then
          v_declined_items := array_append(v_declined_items, v_elem_id);
          v_updated_items := v_updated_items || jsonb_build_array(v_elem || jsonb_build_object('approvalState', 'rejected'));
        end if;
      end loop;
    end if;

    v_recalculated_total := least(coalesce(v_req.quote, 300), 300);
  else
    if jsonb_typeof(v_items) = 'array' then
      for v_elem in select * from jsonb_array_elements(v_items) loop
        v_elem_id := v_elem->>'id';
        v_part_cost := coalesce((v_elem->>'partCost')::numeric, (v_elem->>'part_cost')::numeric, 0);
        v_labour_cost := coalesce((v_elem->>'labourCost')::numeric, (v_elem->>'labour_cost')::numeric, 0);
        v_qty := coalesce((v_elem->>'quantity')::numeric, 1);
        v_discount := coalesce((v_elem->>'discount')::numeric, 0);
        v_is_required := coalesce((v_elem->>'isRequired')::boolean, (v_elem->>'is_required')::boolean, false);
        v_can_defer := coalesce((v_elem->>'canDefer')::boolean, (v_elem->>'can_defer')::boolean, true);
        v_depends_on := coalesce(v_elem->'dependsOn', v_elem->'depends_on', '[]'::jsonb);

        if v_elem_id = any(p_approved_item_ids) then
          v_approved_count := v_approved_count + 1;
          v_recalculated_total := v_recalculated_total + (
            (v_part_cost + v_labour_cost) * v_qty - v_discount
          );

          if jsonb_typeof(v_depends_on) = 'array' and jsonb_array_length(v_depends_on) > 0 then
            for v_dep_elem in select * from jsonb_array_elements(v_depends_on) loop
              v_dep_text := trim(both '"' from v_dep_elem::text);
              if not (v_dep_text = any(p_approved_item_ids)) then
                raise exception 'Dependency unsatisfied: Item % requires item % to be authorized', v_elem_id, v_dep_text;
              end if;
            end loop;
          end if;

          v_updated_items := v_updated_items || jsonb_build_array(v_elem || jsonb_build_object('approvalState', 'approved'));
        else
          if v_is_required then
            raise exception 'Required repair omitted: Item % is essential for safe operation and cannot be declined', v_elem_id;
          end if;
          v_declined_items := array_append(v_declined_items, v_elem_id);
          v_updated_items := v_updated_items || jsonb_build_array(v_elem || jsonb_build_object('approvalState', case when v_can_defer then 'deferred' else 'declined' end));
        end if;
      end loop;
    end if;

    if v_approved_count = 0 then
      p_decision := 'rejected';
      v_new_status := 'Awaiting Approval';
      v_recalculated_total := 300;
    else
      v_new_status := 'In Progress';
    end if;
  end if;

  if v_req.courier_charge_return_delivery is not null and v_req.courier_charge_return_delivery > 0 then
    v_recalculated_total := v_recalculated_total + v_req.courier_charge_return_delivery;
  end if;

  update public.service_requests
  set
    quote_state = p_decision,
    quote = v_recalculated_total,
    status = v_new_status,
    quotation_items = v_updated_items,
    approved_items = p_approved_item_ids,
    declined_items = v_declined_items,
    decision_notes = p_notes,
    decision_at = now(),
    decision_actor = auth.uid(),
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'decision', p_decision,
    'approved_items', p_approved_item_ids,
    'declined_items', v_declined_items,
    'total', v_recalculated_total,
    'status', v_new_status,
    'version', v_req.quote_version
  );
end;
$function$;

create or replace function public.record_service_pay_at_store_selection(
  p_service_request_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req record;
  v_billing jsonb;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized: Authentication required' using errcode = '42501';
  end if;

  select * into v_req from public.service_requests where id = p_service_request_id for update;
  if not found then
    raise exception 'Service request not found';
  end if;

  if v_req.user_id is distinct from auth.uid() and public.is_admin() is not true then
    raise exception 'Unauthorized: You do not own this service ticket' using errcode = '42501';
  end if;

  if v_req.payment_status = 'Paid' then
    raise exception 'Service ticket is already marked as Paid';
  end if;

  -- Choosing how to pay isn't approval. A quote still waiting for a decision stays waiting.
  if v_req.quote_state = 'pending' then
    raise exception 'Please approve the quotation before choosing how to pay.';
  end if;

  v_new_status := v_req.status;
  if v_req.quote_state = 'approved' and v_req.status in ('Awaiting Approval', 'Diagnosis Done') then
    v_new_status := 'In Progress';
  end if;

  v_billing := coalesce(v_req.billing_details, '{}'::jsonb) || jsonb_build_object(
    'paymentMethod', 'Pay at Store',
    'paymentStatus', 'Pending',
    'selectedAt', now(),
    'payableAmount', v_req.quote
  );

  update public.service_requests
  set
    payment_status = 'Pay at Store',
    payment_method = 'store',
    status = v_new_status,
    billing_details = v_billing,
    notes = coalesce(notes, '') || case
      when coalesce(notes, '') = '' then ''
      else E'\n'
    end || '[Method: Pay at IT HUB Showroom | Amount: ₹' || coalesce(v_req.quote, 0) || ' | Status: Awaiting Payment at IT HUB]',
    updated_at = now()
  where id = p_service_request_id;

  return jsonb_build_object(
    'ok', true,
    'service_id', v_req.id,
    'payment_status', 'Pay at Store',
    'is_paid', false,
    'status', v_new_status
  );
end;
$$;

-- ─── Booking ─────────────────────────────────────────────────────────────────────────────────────

-- Failed for everyone: gen_random_bytes lives in the extensions schema. The technician parameter
-- is gone because customers don't assign technicians.
drop function if exists public.create_service_booking(text, text, text, text, date, text, text, jsonb, text, text, text);

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
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_courier_fee numeric := 0;
  v_callout_fee numeric := 0;
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
    raise exception 'Authentication required: Customer must be logged in to create a service request.'
      using errcode = '42501';
  end if;

  if lower(v_clean_problem) = 'other' then
    if v_clean_notes != '' then
      v_effective_problem := 'Other: ' || v_clean_notes;
    else
      raise exception 'Please describe the issue you''re experiencing before continuing.';
    end if;
  else
    v_effective_problem := v_clean_problem;
  end if;

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

  if (v_val ->> 'valid')::boolean is not true then
    raise exception '%', (v_val ->> 'error');
  end if;

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

  -- Fees come from the server's settings, never from the browser.
  if v_clean_method = 'Courier to IT HUB' then
    select coalesce(s.courier_return_delivery_fee, 150) into v_courier_fee
    from public.store_settings s where s.id = 1;
    v_courier_fee := coalesce(v_courier_fee, 150);
  elsif v_clean_method = 'On-site service' then
    select coalesce(s.doorstep_callout_fee, 0) into v_callout_fee
    from public.store_settings s where s.id = 1;
    v_callout_fee := coalesce(v_callout_fee, 0);
  end if;

  v_guest_token := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.service_requests (
    user_id, device, model, problem, customer_description, method, preferred_date, preferred_slot,
    pincode, address_details, inbound_courier_tracking_no, courier_charge_return_delivery,
    doorstep_callout_fee, guest_tracking_token, status
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
    v_callout_fee,
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

CREATE OR REPLACE FUNCTION public.get_service_request_tracking(p_tracking_id text, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_is_staff := coalesce(auth.role() = 'service_role', false)
    or public.can_manage_services() is true;

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
  if v_is_staff is not true then
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
$function$;

-- ─── Quotations, reviews and sell requests ───────────────────────────────────────────────────────

create or replace function public.staff_update_pc_quotation_status(
  p_quotation_id uuid,
  p_new_status text,
  p_staff_notes text default null,
  p_assigned_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
  v_build record;
begin
  if v_staff_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if public.can_manage_quotations() is not true then
    raise exception 'Unauthorized: Staff quotation management permissions required.' using errcode = '42501';
  end if;

  if p_new_status is null or p_new_status not in ('Draft', 'New', 'Contacted', 'Quoted', 'Closed') then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  select * into v_build from public.pc_builds where id = p_quotation_id for update;
  if not found then
    raise exception 'PC Quotation record % not found.', p_quotation_id;
  end if;

  v_old_status := v_build.enquiry_status;

  update public.pc_builds
  set
    enquiry_status = p_new_status,
    staff_notes = coalesce(p_staff_notes, staff_notes),
    assigned_staff_id = coalesce(p_assigned_staff_id, assigned_staff_id),
    updated_at = now()
  where id = p_quotation_id;

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
  ) values (
    v_staff_id,
    'pc_quotation_status_update',
    'pc_quotation',
    p_quotation_id::text,
    v_old_status,
    p_new_status,
    jsonb_build_object(
      'notes_appended', p_staff_notes is not null,
      'assigned_staff_id', p_assigned_staff_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'quotation_id', p_quotation_id,
    'previous_status', v_old_status,
    'new_status', p_new_status
  );
end;
$$;

create or replace function public.staff_delete_review(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
begin
  if v_staff_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if public.can_manage_staff() is not true then
    raise exception 'Unauthorized: Only Portal Administrators can delete reviews.' using errcode = '42501';
  end if;

  select status into v_old_status from public.reviews where id = p_review_id;
  if not found then
    raise exception 'Review not found.';
  end if;

  delete from public.reviews where id = p_review_id;

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
  ) values (
    v_staff_id, 'DELETE_REVIEW', 'review', p_review_id::text, v_old_status, 'Deleted',
    jsonb_build_object('deleted_by', v_staff_id, 'timestamp', now())
  );

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.staff_update_review_status(p_review_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
begin
  if v_staff_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if public.is_staff() is not true then
    raise exception 'Unauthorized: Staff permissions required to moderate reviews.' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('Pending', 'Published', 'Hidden') then
    raise exception 'Invalid review status. Allowed values: Pending, Published, Hidden.';
  end if;

  select status into v_old_status from public.reviews where id = p_review_id;
  if not found then
    raise exception 'Review not found.';
  end if;

  update public.reviews set status = p_status, updated_at = now() where id = p_review_id;

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
  ) values (
    v_staff_id, 'MODERATE_REVIEW', 'review', p_review_id::text, v_old_status, p_status,
    jsonb_build_object('moderated_by', v_staff_id, 'timestamp', now())
  );

  return jsonb_build_object('success', true, 'status', p_status);
end;
$$;

-- The service role used to reach this with no user, and the audit row then named the oldest
-- active administrator. A write that names the wrong person is worse than no write.
create or replace function public.staff_update_sell_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null,
  p_offered_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
begin
  if v_staff_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if public.is_staff() is not true then
    raise exception 'Unauthorized: Staff permissions required to process sell requests.' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('Pending', 'Under Review', 'Contacted', 'Approved', 'Rejected', 'Completed') then
    raise exception 'Invalid sell request status.';
  end if;

  select status into v_old_status from public.sell_requests where id = p_request_id;
  if not found then
    raise exception 'Sell request not found.';
  end if;

  update public.sell_requests
  set
    status = p_status,
    admin_notes = coalesce(p_admin_notes, admin_notes),
    offered_price = coalesce(p_offered_price, offered_price),
    updated_at = now()
  where id = p_request_id;

  insert into public.staff_audit_logs (
    staff_user_id, action_type, entity_type, entity_id, previous_status, new_status, metadata
  ) values (
    v_staff_id, 'UPDATE_SELL_REQUEST', 'sell_request', p_request_id::text, v_old_status, p_status,
    jsonb_build_object(
      'offered_price', p_offered_price,
      'has_admin_notes', p_admin_notes is not null,
      'processed_by', v_staff_id,
      'timestamp', now()
    )
  );

  return jsonb_build_object('success', true, 'status', p_status);
end;
$$;

CREATE OR REPLACE FUNCTION public.submit_pc_quotation_request(p_build_name text, p_reference_id text DEFAULT NULL::text, p_parts jsonb DEFAULT '{}'::jsonb, p_estimated_price numeric DEFAULT 0, p_compatibility jsonb DEFAULT '{}'::jsonb, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_build_id uuid;
  v_ref text;
  v_name text;
begin
  -- Only the verified Edge Function, which runs as the service role, may submit quotations.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized: PC quotations must be submitted through the verified Edge Function endpoint.'
      using errcode = '42501';
  end if;

  v_user_id := auth.uid();

  -- 2. Build name sanitization
  v_name := coalesce(nullif(trim(p_build_name), ''), 'Custom PC Build');

  -- 3. Reference ID generation / validation
  if p_reference_id is not null and trim(p_reference_id) <> '' then
    v_ref := trim(p_reference_id);
  else
    v_ref := 'ITH-PC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;

  -- 4. Validate estimated price
  if p_estimated_price is null or p_estimated_price < 0 then
    raise exception 'Invalid estimated price: %', p_estimated_price;
  end if;

  -- 5. Validate parts payload
  if p_parts is null or (jsonb_typeof(p_parts) != 'object' and jsonb_typeof(p_parts) != 'array') then
    raise exception 'Invalid parts payload';
  end if;

  -- 6. Insert new quotation request with status 'New'
  insert into public.pc_builds (
    user_id,
    name,
    reference_id,
    parts,
    estimated_price,
    authoritative_price,
    price_divergence,
    technician_review_required,
    compatibility,
    customer_name,
    customer_phone,
    customer_email,
    enquiry_status,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_name,
    v_ref,
    p_parts,
    p_estimated_price,
    p_estimated_price,
    0,
    false,
    coalesce(p_compatibility, '{}'::jsonb),
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_phone), ''),
    nullif(trim(p_customer_email), ''),
    'New',
    now(),
    now()
  ) returning id into v_build_id;

  return jsonb_build_object(
    'success', true,
    'id', v_build_id,
    'reference_id', v_ref,
    'user_id', v_user_id,
    'estimated_price', p_estimated_price
  );
exception when others then
  return jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
end;
$function$;

-- ─── Checkout association ────────────────────────────────────────────────────────────────────────

-- Failed for everyone: gen_random_bytes lives in the extensions schema. With no token, checkout
-- fell back to matching orders on details customers can edit.
create or replace function public.create_checkout_association()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'Authentication required to create checkout association' using errcode = '42501';
  end if;

  v_token := 'hub_assoc_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.shopify_order_associations (token, user_id, expires_at)
  values (v_token, v_uid, now() + interval '2 hours');

  return v_token;
end;
$$;

-- Only the signed webhook may consume a token. It returns the owner's id, so it must not be
-- reachable by anyone else. Grants enforce this; the role check is a second layer.
create or replace function public.validate_and_consume_association_token(
  p_token text,
  p_shopify_order_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assoc record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized: association tokens are consumed only by the verified webhook.'
      using errcode = '42501';
  end if;

  if p_token is null or trim(p_token) = '' then
    return null;
  end if;

  select * into v_assoc
  from public.shopify_order_associations
  where token = trim(p_token)
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    return null;
  end if;

  update public.shopify_order_associations
  set used_at = now(),
      shopify_order_id = p_shopify_order_id
  where id = v_assoc.id;

  return v_assoc.user_id;
end;
$$;

-- ─── Service payments ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.attach_service_razorpay_order_id(p_service_request_id uuid, p_razorpay_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req record;
begin
  if p_service_request_id is null then
    raise exception 'service_request_id is required';
  end if;

  if p_razorpay_order_id is null or trim(p_razorpay_order_id) = '' then
    raise exception 'razorpay_order_id is required';
  end if;

  select * into v_req
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Service request not found for id: %', p_service_request_id;
  end if;

  if v_req.payment_status = 'Paid' then
    raise exception 'Service request % is already marked as Paid', p_service_request_id;
  end if;

  update public.service_requests
  set
    razorpay_order_id = trim(p_razorpay_order_id),
    payment_method = 'upi',
    payment_status = case when payment_status = 'Unpaid' then 'Pending' else payment_status end,
    updated_at = now()
  where id = p_service_request_id;

  return jsonb_build_object(
    'ok', true,
    'service_id', p_service_request_id,
    'razorpay_order_id', trim(p_razorpay_order_id)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_service_payment(p_service_request_id uuid, p_razorpay_order_id text, p_razorpay_payment_id text, p_razorpay_signature text, p_amount_paid numeric, p_currency text DEFAULT 'INR'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req record;
  v_new_status text;
  v_billing jsonb;
begin
  if p_service_request_id is null then
    raise exception 'service_request_id is required';
  end if;

  if p_razorpay_order_id is null or trim(p_razorpay_order_id) = '' then
    raise exception 'razorpay_order_id is required';
  end if;

  if p_razorpay_payment_id is null or trim(p_razorpay_payment_id) = '' then
    raise exception 'razorpay_payment_id is required';
  end if;

  if p_amount_paid is null or p_amount_paid <= 0 then
    raise exception 'amount_paid is required and must be greater than zero';
  end if;

  if p_currency is null or upper(trim(p_currency)) <> 'INR' then
    raise exception 'Invalid currency: %, only INR is supported', p_currency;
  end if;

  select * into v_req
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Service request not found for id: %', p_service_request_id;
  end if;

  -- Verify attached order ID
  if v_req.razorpay_order_id is null or trim(v_req.razorpay_order_id) = '' then
    raise exception 'Service ticket % does not have an attached Razorpay order ID', v_req.id;
  end if;

  if v_req.razorpay_order_id <> trim(p_razorpay_order_id) then
    raise exception 'Razorpay order ID mismatch: Expected %, Received %',
      v_req.razorpay_order_id, trim(p_razorpay_order_id);
  end if;

  -- Idempotency check: Duplicate callbacks with identical payment ID return 200 safely
  if v_req.payment_status = 'Paid' then
    if v_req.razorpay_payment_id = trim(p_razorpay_payment_id) then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'service_id', v_req.id,
        'ticket_reference', coalesce(v_req.ticket_reference, v_req.id::text),
        'payment_status', 'Paid',
        'status', v_req.status
      );
    else
      raise exception 'Service ticket % is already marked as Paid with different payment ID %',
        v_req.id, v_req.razorpay_payment_id;
    end if;
  end if;

  -- Validate exact amount match against approved quote in database
  if round(p_amount_paid, 2) <> round(coalesce(v_req.quote, 0), 2) then
    raise exception 'Payment amount mismatch: Expected ₹%, Received ₹%', v_req.quote, p_amount_paid;
  end if;

  -- Determine appropriate workflow status transition
  v_new_status := v_req.status;
  if v_req.status in ('Awaiting Approval', 'Diagnosis Done', 'Booked', 'Device Received') then
    v_new_status := 'In Progress';
  end if;

  -- Build updated billing details JSON
  v_billing := coalesce(v_req.billing_details, '{}'::jsonb) || jsonb_build_object(
    'paymentMethod', 'UPI',
    'paymentStatus', 'Received',
    'paidAt', now(),
    'paidAmount', p_amount_paid
  );

  update public.service_requests
  set
    payment_status = 'Paid',
    payment_method = 'upi',
    razorpay_payment_id = trim(p_razorpay_payment_id),
    paid_at = now(),
    paid_amount = p_amount_paid,
    status = v_new_status,
    billing_details = v_billing,
    notes = coalesce(notes, '') || case
      when coalesce(notes, '') = '' then ''
      else E'\n'
    end || '[Razorpay UPI Payment ID: ' || trim(p_razorpay_payment_id) || ' | Amount: ₹' || p_amount_paid || ' | Status: Paid]',
    updated_at = now()
  where id = p_service_request_id;

  return jsonb_build_object(
    'ok', true,
    'service_id', v_req.id,
    'ticket_reference', coalesce(v_req.ticket_reference, v_req.id::text),
    'payment_status', 'Paid',
    'status', v_new_status,
    'paid_amount', p_amount_paid
  );
end;
$function$;

-- ─── Legacy orders ───────────────────────────────────────────────────────────────────────────────

-- An anonymous caller's NULL uid made the ownership check neither true nor false, so it passed.
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
  v_is_admin boolean := public.is_admin() is true;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_is_admin is not true and v_order.user_id is distinct from auth.uid() then
    raise exception 'Unauthorized to cancel this order' using errcode = '42501';
  end if;

  if v_order.status = 'Cancelled' then
    return jsonb_build_object('ok', true, 'message', 'Order is already cancelled');
  end if;

  if v_is_admin is not true and (v_order.status <> 'Pending' or v_order.payment_status = 'Paid') then
    raise exception 'Cannot cancel order with status % and payment_status %. Paid or in-fulfillment orders require merchant refund processing.', v_order.status, v_order.payment_status;
  end if;

  if v_order.stock_reserved then
    for v_item in select product_id, quantity from public.order_items where order_id = p_order_id loop
      if v_item.product_id is not null then
        update public.inventory
        set stock = stock + v_item.quantity,
            updated_at = now()
        where product_id = v_item.product_id;
      end if;
    end loop;
  end if;

  update public.orders
  set status = 'Cancelled',
      stock_reserved = false,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'status', 'Cancelled');
end;
$$;

-- One administrator model: an active portal_admin also counts as an existing administrator.
create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'Target user ID is required for initial bootstrap';
  end if;

  if exists (select 1 from public.profiles where role = 'admin')
     or exists (select 1 from public.staff_members where role = 'portal_admin' and is_active = true) then
    raise exception 'Initial administrator already exists. Further role assignments require an active administrator.';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile % does not exist. The user must sign up before being promoted.', p_user_id;
  end if;

  update public.profiles
  set role = 'admin', updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'role', 'admin');
end;
$$;

-- Portal staff need ticket references for new audits. Customers don't.
create or replace function public.generate_customer_audit_reference()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_num bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' and public.is_staff() is not true then
    raise exception 'Unauthorized: staff permissions required.' using errcode = '42501';
  end if;
  v_num := nextval('public.customer_audit_ref_seq');
  return 'ITH-AUD-' || lpad(v_num::text, 6, '0');
end;
$$;

-- This runs under API roles when staff create a ticket directly, so it needs no extra grants.
create or replace function public.trg_service_requests_ticket_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.ticket_reference is null or trim(NEW.ticket_reference) = '' then
      NEW.ticket_reference := public.generate_ticket_reference();
    else
      NEW.ticket_reference := upper(trim(NEW.ticket_reference));
    end if;
  elsif TG_OP = 'UPDATE' then
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
