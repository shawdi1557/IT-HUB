-- ============================================================================
-- IT HUB - Service Realtime Synchronization, Full Replica Identity & Authoritative Notifications
-- Migration: 20261031000008_service_requests_realtime_and_notifications.sql
-- ============================================================================

begin;

-- 1. Register service_requests into the supabase_realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_requests'
  ) then
    alter publication supabase_realtime add table public.service_requests;
  end if;
end $$;

-- 2. Ensure REPLICA IDENTITY FULL on service_requests so all row data is broadcast in realtime payloads
alter table public.service_requests replica identity full;

-- 3. Update get_service_request_tracking to project payment fields and reschedule_details
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
        end if;
      end if;
    end if;
  end if;

  if v_rec.id is null then
    return null;
  end if;

  -- Authorization check:
  if not (
    v_is_staff
    or (v_auth_uid is not null and v_rec.user_id = v_auth_uid)
    or (p_guest_token is not null and trim(p_guest_token) <> '' and v_rec.guest_tracking_token = trim(p_guest_token))
  ) then
    return null;
  end if;

  -- Obfuscate technician name for privacy if not staff
  if v_is_staff then
    v_tech_name := v_rec.technician_name;
  else
    v_tech_name := coalesce(v_rec.technician_name, 'IT HUB Certified Specialist');
  end if;

  -- Project customer-safe diagnostic findings
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

  -- Project customer-safe itemized quotation items
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
        nullif(trim(elem->>'finding_id'), ''),
        'item-' || ord::text
      ) as id,
      coalesce(nullif(trim(elem->>'findingId'), ''), nullif(trim(elem->>'finding_id'), '')) as finding_id,
      coalesce(nullif(trim(elem->>'title'), ''), 'Service Component') as title,
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
      coalesce(
        case
          when trim(coalesce(elem->>'quantity', '')) ~ '^[0-9]+$'
          then (trim(elem->>'quantity'))::integer
          else null
        end,
        1
      ) as quantity,
      case
        when trim(coalesce(elem->>'discount', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(elem->>'discount'))::numeric
        else null
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
    'ticket_reference', coalesce(v_rec.ticket_reference, 'ITH-SER-' || upper(substr(replace(v_rec.id::text, '-', ''), 1, 8))),
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

-- 4. Authoritative Database Trigger to generate customer notifications upon staff service updates
create or replace function public.notify_customer_on_service_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event text := null;
  v_title text := null;
  v_message text := null;
  v_metadata jsonb := '{}'::jsonb;
begin
  -- Only notify if the service request is linked to a customer user account
  if NEW.user_id is null then
    return NEW;
  end if;

  -- Case A: Service Status Changed
  if OLD.status is distinct from NEW.status then
    if NEW.status = 'Awaiting Approval' and coalesce(NEW.quote_version, 1) > coalesce(OLD.quote_version, 0) then
      v_event := 'service_quotation_ready';
      v_title := 'Quotation Ready for Approval';
      v_message := 'An itemized quotation of ₹' || coalesce(NEW.quote, 0)::text || ' has been published for your ' || coalesce(NEW.device, 'device') || '. Please review and approve.';
    elsif NEW.status = 'Completed' then
      v_event := 'service_completed';
      v_title := 'Service Completed';
      v_message := 'Your ' || coalesce(NEW.device, 'device') || ' service has been completed successfully.';
    elsif NEW.status = 'Ready for Pickup' then
      v_event := 'service_ready_for_pickup';
      v_title := 'Ready for Collection';
      v_message := 'Your ' || coalesce(NEW.device, 'device') || ' is ready for collection at IT HUB Kothamangalam.';
    elsif NEW.status = 'Rescheduled' then
      v_event := 'service_rescheduled';
      v_title := 'Appointment Rescheduled';
      v_message := 'Your appointment has been rescheduled to ' || coalesce(NEW.preferred_date::text, 'the updated date') || ' (' || coalesce(NEW.preferred_slot, 'slot') || ').';
    elsif NEW.status = 'Device Received' then
      v_event := 'service_device_received';
      v_title := 'Device Received at IT HUB';
      v_message := 'Your ' || coalesce(NEW.device, 'device') || ' has been safely received at our service center.';
    elsif NEW.status = 'Under Diagnosis' then
      v_event := 'service_under_diagnosis';
      v_title := 'Diagnosis in Progress';
      v_message := 'Our certified technicians have begun hardware diagnostics on your ' || coalesce(NEW.device, 'device') || '.';
    elsif NEW.status = 'In Progress' or NEW.status = 'Service in Progress' then
      v_event := 'service_in_progress';
      v_title := 'Repair in Progress';
      v_message := 'Approved repairs are now actively underway for your ' || coalesce(NEW.device, 'device') || '.';
    else
      v_event := 'service_status_changed';
      v_title := 'Service Status Updated: ' || NEW.status;
      v_message := 'Your ' || coalesce(NEW.device, 'device') || ' status has progressed to "' || NEW.status || '".';
    end if;

    v_metadata := jsonb_build_object(
      'ticket_id', NEW.id,
      'ticket_reference', NEW.ticket_reference,
      'previous_status', OLD.status,
      'new_status', NEW.status,
      'device', NEW.device,
      'technician_name', NEW.technician_name
    );

  -- Case B: Technician Assigned or Changed
  elsif OLD.technician_name is distinct from NEW.technician_name and NEW.technician_name is not null and NEW.technician_name <> '' then
    v_event := 'technician_assigned';
    v_title := 'Specialist Assigned';
    v_message := 'Specialist ' || NEW.technician_name || ' has been assigned to your ' || coalesce(NEW.device, 'device') || ' service.';
    v_metadata := jsonb_build_object(
      'ticket_id', NEW.id,
      'ticket_reference', NEW.ticket_reference,
      'technician_name', NEW.technician_name,
      'status', NEW.status
    );

  -- Case C: Payment Collected
  elsif OLD.payment_status is distinct from NEW.payment_status and NEW.payment_status in ('Paid', 'Received') then
    v_event := 'service_payment_received';
    v_title := 'Payment Confirmed';
    v_message := 'Payment of ₹' || coalesce(NEW.paid_amount, NEW.quote, 0)::text || ' received for your ' || coalesce(NEW.device, 'device') || ' service.';
    v_metadata := jsonb_build_object(
      'ticket_id', NEW.id,
      'ticket_reference', NEW.ticket_reference,
      'paid_amount', coalesce(NEW.paid_amount, NEW.quote, 0),
      'payment_method', NEW.payment_method
    );

  -- Case D: Appointment Changed
  elsif (OLD.preferred_date is distinct from NEW.preferred_date or OLD.preferred_slot is distinct from NEW.preferred_slot) and NEW.preferred_date is not null then
    v_event := 'appointment_updated';
    v_title := 'Appointment Schedule Updated';
    v_message := 'Your appointment has been scheduled for ' || NEW.preferred_date::text || ' (' || coalesce(NEW.preferred_slot, 'Standard Slot') || ').';
    v_metadata := jsonb_build_object(
      'ticket_id', NEW.id,
      'ticket_reference', NEW.ticket_reference,
      'preferred_date', NEW.preferred_date,
      'preferred_slot', NEW.preferred_slot
    );
  end if;

  -- Insert notification if an event occurred and no identical notification exists within the last 5 seconds (deduplication)
  if v_event is not null then
    if not exists (
      select 1 from public.customer_notifications
      where user_id = NEW.user_id
        and ticket_id = NEW.id
        and event_type = v_event
        and created_at >= (now() - interval '5 seconds')
    ) then
      insert into public.customer_notifications (
        user_id,
        ticket_id,
        event_type,
        title,
        message,
        metadata,
        read,
        created_at
      ) values (
        NEW.user_id,
        NEW.id,
        v_event,
        v_title,
        v_message,
        v_metadata,
        false,
        now()
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_service_requests_customer_notify on public.service_requests;
create trigger trg_service_requests_customer_notify
  after update on public.service_requests
  for each row
  execute function public.notify_customer_on_service_update();

commit;
