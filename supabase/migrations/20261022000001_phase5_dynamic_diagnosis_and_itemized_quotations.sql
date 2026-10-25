-- ============================================================================
-- Migration: Phase 5.2 - Dynamic Diagnosis, Itemized Quotations & Partial Approvals
-- Target: Supabase / PostgreSQL
-- ============================================================================

begin;

-- 1. Extend service_requests table with diagnosis findings, itemized quotes & audit trail
alter table public.service_requests
  add column if not exists findings jsonb not null default '[]'::jsonb,
  add column if not exists quotation_items jsonb not null default '[]'::jsonb,
  add column if not exists quote_version integer not null default 1,
  add column if not exists approved_items text[] not null default '{}',
  add column if not exists declined_items text[] not null default '{}',
  add column if not exists decision_notes text,
  add column if not exists decision_at timestamptz,
  add column if not exists decision_actor uuid references public.profiles (id),
  add column if not exists quotation_history jsonb not null default '[]'::jsonb;

-- 2. Update protect_service_request trigger function to shield new columns from direct client tampering
create or replace function public.protect_service_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    if tg_op = 'INSERT' then
      -- 1. Enforce ownership and default workflow values on creation
      if new.user_id is distinct from auth.uid() then
        raise exception 'Unauthorized: Service request user_id must match authenticated user';
      end if;
      if new.status is distinct from 'Booked' then
        raise exception 'Unauthorized: Initial service request status must be Booked';
      end if;
      if new.quote is not null then
        raise exception 'Unauthorized: Customers cannot set quotation on request creation';
      end if;
      if new.quote_state is not null then
        raise exception 'Unauthorized: Customers cannot set quote state on request creation';
      end if;
      if new.technician_name is not null then
        raise exception 'Unauthorized: Customers cannot assign technicians';
      end if;
      if new.notes is not null then
        raise exception 'Unauthorized: Administrative notes are reserved for staff';
      end if;
      if new.courier_charge_return_delivery is not null then
        raise exception 'Unauthorized: Courier charges cannot be set by customer';
      end if;
      if new.findings is distinct from '[]'::jsonb then
        raise exception 'Unauthorized: Diagnosis findings are managed by lab technicians';
      end if;
      if new.quotation_items is distinct from '[]'::jsonb then
        raise exception 'Unauthorized: Quotation items are managed by staff';
      end if;
      if new.quote_version is distinct from 1 then
        raise exception 'Unauthorized: Quotation version cannot be initialized by customer';
      end if;
      if trim(coalesce(new.device, '')) = '' then
        raise exception 'Device cannot be empty';
      end if;
      if trim(coalesce(new.problem, '')) = '' then
        raise exception 'Problem description cannot be empty';
      end if;
      if new.address_id is not null then
        if not exists (select 1 from addresses where id = new.address_id and user_id = new.user_id) then
          raise exception 'Unauthorized: Selected address does not belong to you';
        end if;
      end if;

    elsif tg_op = 'UPDATE' then
      -- 2. Immutable identifiers & timestamps
      if new.user_id is distinct from old.user_id then
        raise exception 'Unauthorized: Cannot change service request ownership';
      end if;
      if new.id is distinct from old.id then
        raise exception 'Unauthorized: Cannot change service request ID';
      end if;
      if new.created_at is distinct from old.created_at then
        raise exception 'Unauthorized: Cannot alter creation timestamp';
      end if;

      -- 3. Administrative fields protected from direct customer mutation
      if new.status is distinct from old.status then
        raise exception 'Unauthorized: Only administrators can update service request status';
      end if;
      if new.quote is distinct from old.quote then
        raise exception 'Unauthorized: Only administrators can modify quotes';
      end if;
      if new.technician_name is distinct from old.technician_name then
        raise exception 'Unauthorized: Only administrators can assign technicians';
      end if;
      if new.notes is distinct from old.notes then
        raise exception 'Unauthorized: Only administrators can modify administrative notes';
      end if;
      if new.courier_charge_return_delivery is distinct from old.courier_charge_return_delivery then
        raise exception 'Unauthorized: Only administrators can modify courier return charges';
      end if;
      if new.findings is distinct from old.findings then
        raise exception 'Unauthorized: Only administrators can modify diagnosis findings';
      end if;
      if new.quotation_items is distinct from old.quotation_items then
        raise exception 'Unauthorized: Only administrators can modify quotation items';
      end if;
      if new.quote_version is distinct from old.quote_version then
        raise exception 'Unauthorized: Only administrators can publish new quotation versions';
      end if;
      if new.quotation_history is distinct from old.quotation_history then
        raise exception 'Unauthorized: Quotation history is immutable';
      end if;

      -- 4. Quote state transition (legacy direct update guard):
      if new.quote_state is distinct from old.quote_state then
        if (old.quote_state is distinct from 'pending') or (old.quote is null) or (new.quote_state not in ('approved', 'rejected')) then
          raise exception 'Unauthorized: Invalid quote response transition';
        end if;
      end if;

      -- 5. Customer-editable hardware & scheduling details:
      if (new.device is distinct from old.device or
          new.model is distinct from old.model or
          new.problem is distinct from old.problem or
          new.method is distinct from old.method or
          new.address_id is distinct from old.address_id or
          new.preferred_date is distinct from old.preferred_date or
          new.preferred_slot is distinct from old.preferred_slot) then
        if old.status <> 'Booked' then
          raise exception 'Unauthorized: Service request details cannot be altered once diagnosis has started';
        end if;

        if trim(coalesce(new.device, '')) = '' then
          raise exception 'Device cannot be empty';
        end if;
        if trim(coalesce(new.problem, '')) = '' then
          raise exception 'Problem description cannot be empty';
        end if;

        if new.address_id is not null and new.address_id is distinct from old.address_id then
          if not exists (select 1 from addresses where id = new.address_id and user_id = new.user_id) then
            raise exception 'Unauthorized: Selected address does not belong to you';
          end if;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 3. Atomic Customer Quote Decision RPC
create or replace function public.submit_customer_quote_decision(
  p_request_id uuid,
  p_decision text,
  p_approved_item_ids text[],
  p_expected_version integer,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if v_req.user_id <> auth.uid() and not is_admin() then
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
$$;

grant execute on function public.submit_customer_quote_decision to authenticated;

notify pgrst, 'reload schema';

commit;

