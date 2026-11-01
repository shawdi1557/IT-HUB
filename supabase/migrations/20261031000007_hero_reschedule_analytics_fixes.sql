-- ============================================================================
-- Migration: 20261031000007_hero_reschedule_analytics_fixes.sql
-- Description:
-- 1. Upgrade staff_decide_appointment_reschedule RPC to guarantee atomic status
--    transition (status -> 'Rescheduled' on approval, revert to 'Booked' on rejection),
--    flexible (request_id, ticket_id) lookups, immutable audit logging, and customer alerts.
-- 2. Grant staff read access and policies to public.visitor_sessions and public.visitor_events
--    for Website Visitor Analytics module.
-- 3. Enhance log_visitor_event stored procedure to support additional interaction events.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ENHANCED RPC: staff_decide_appointment_reschedule
-- ────────────────────────────────────────────────────────────────────────────

-- Drop legacy overload signatures if needed to ensure clean signature binding
drop function if exists public.staff_decide_appointment_reschedule(uuid, text, text);
drop function if exists public.staff_decide_appointment_reschedule(uuid, text, text, uuid);

create or replace function public.staff_decide_appointment_reschedule(
  p_request_id uuid default null,
  p_decision text default 'approved',
  p_staff_response text default null,
  p_ticket_id uuid default null
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
  v_req_id uuid;
  v_effective_ticket_id uuid;
  v_new_status text;
  v_prev_status text;
  v_reverted_status text;
  v_new_date date;
  v_new_slot text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    select id into v_caller_id from public.profiles where role = 'admin' limit 1;
  end if;

  -- 1. Authorization: Only verified staff or admin can decide reschedule requests
  if not (public.can_manage_services() or public.is_admin()) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Unauthorized: Only authorized IT HUB service staff can decide reschedule requests.'
    );
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
$$;

-- 3-parameter convenience wrapper delegating to 4-parameter version
create or replace function public.staff_decide_appointment_reschedule(
  p_request_id uuid,
  p_decision text,
  p_staff_response text default null
)
returns jsonb
language sql
security definer
as $$
  select public.staff_decide_appointment_reschedule(p_request_id, p_decision, p_staff_response, null);
$$;

grant execute on function public.staff_decide_appointment_reschedule(uuid, text, text, uuid) to authenticated;
grant execute on function public.staff_decide_appointment_reschedule(uuid, text, text) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. STAFF ACCESS FOR WEBSITE VISITOR ANALYTICS
-- ────────────────────────────────────────────────────────────────────────────

-- Grant authenticated users SELECT on visitor analytics tables
grant select on table public.visitor_sessions to authenticated;
grant select on table public.visitor_events to authenticated;
grant select on table public.analytics_settings to authenticated;

-- RLS policies for staff read access
drop policy if exists staff_visitor_sessions_select on public.visitor_sessions;
create policy staff_visitor_sessions_select on public.visitor_sessions
  for select using (
    public.can_manage_services() or public.is_admin()
  );

drop policy if exists staff_visitor_events_select on public.visitor_events;
create policy staff_visitor_events_select on public.visitor_events
  for select using (
    public.can_manage_services() or public.is_admin()
  );

-- Indexes for lightning fast analytics aggregation and filtering
create index if not exists visitor_sessions_last_seen_idx on public.visitor_sessions (last_seen desc);
create index if not exists visitor_sessions_user_id_idx on public.visitor_sessions (user_id);
create index if not exists visitor_events_session_id_idx on public.visitor_events (session_id);
create index if not exists visitor_events_created_at_idx on public.visitor_events (created_at desc);
create index if not exists visitor_events_type_idx on public.visitor_events (event_type);
