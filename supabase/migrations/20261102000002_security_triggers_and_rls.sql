-- Protection triggers, RLS and column exposure.
--
-- The triggers are SECURITY INVOKER on purpose, so private.is_api_caller() can tell a direct API
-- write from a write inside a SECURITY DEFINER function. Definer functions authorize callers
-- themselves. Direct writes are checked here, in addition to RLS.

-- ─── Service tickets ─────────────────────────────────────────────────────────────────────────────

create or replace function public.protect_service_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is not true then
    return new;
  end if;

  -- Customers change tickets only through RPCs. Direct writes are for service staff.
  if public.can_manage_services() is not true then
    raise exception 'Unauthorized: service tickets can only be changed through the booking and tracking workflows.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.payment_status is distinct from 'Unpaid'
       or new.paid_amount is not null
       or new.paid_at is not null
       or new.razorpay_order_id is not null
       or new.razorpay_payment_id is not null
       or new.payment_collected_by is not null then
      raise exception 'Unauthorized: payment state is set only by the audited payment workflows.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'Unauthorized: service ticket identity and ownership are immutable.'
      using errcode = '42501';
  end if;

  -- Money moves only through audited functions, so every change names who made it.
  if (new.payment_status, new.payment_method, new.paid_amount, new.paid_at,
      new.razorpay_order_id, new.razorpay_payment_id, new.payment_collected_by,
      new.billing_details, new.guest_tracking_token, new.decision_actor, new.decision_at)
     is distinct from
     (old.payment_status, old.payment_method, old.paid_amount, old.paid_at,
      old.razorpay_order_id, old.razorpay_payment_id, old.payment_collected_by,
      old.billing_details, old.guest_tracking_token, old.decision_actor, old.decision_at) then
    raise exception 'Unauthorized: payment and decision fields are set only by the audited workflows.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop policy if exists own_services_insert on public.service_requests;
drop policy if exists own_services_update on public.service_requests;
drop policy if exists service_requests_update on public.service_requests;
drop policy if exists service_requests_staff_update on public.service_requests;

create policy service_requests_staff_update on public.service_requests
  for update to authenticated
  using (public.can_manage_services() is true)
  with check (public.can_manage_services() is true);

-- Staff and customers share the "authenticated" role, so column privileges decide what that role
-- can read from the base table, and what Realtime will deliver. Staff read the rest through the
-- service_requests_staff view below.
revoke all on public.service_requests from anon;
revoke all on public.service_requests from authenticated;
grant insert, update, delete on public.service_requests to authenticated;
grant select (
  id, user_id, device, model, problem, method, address_id, preferred_date, preferred_slot, status,
  quote, quote_state, technician_name, courier_charge_return_delivery, created_at, updated_at,
  findings, quotation_items, quote_version, approved_items, declined_items, decision_notes,
  decision_at, quotation_history, pincode, address_details, inbound_courier_tracking_no,
  outbound_courier_tracking_no, status_descriptions, doorstep_callout_fee, billing_details,
  reschedule_details, ticket_reference, payment_status, payment_method, paid_at, paid_amount,
  customer_description
) on public.service_requests to authenticated;

-- Runs as its owner, so it sees every column. The WHERE clause is its only gate, and the security
-- barrier stops a caller's filter from running before it.
create or replace view public.service_requests_staff
with (security_barrier = true)
as
  select sr.*
  from public.service_requests sr
  where public.can_manage_services() is true;

revoke all on public.service_requests_staff from public, anon, authenticated;
grant select on public.service_requests_staff to authenticated, service_role;

-- ─── PC builds and quotations ────────────────────────────────────────────────────────────────────

create or replace function public.protect_pc_build()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is not true then
    return new;
  end if;

  if public.can_manage_quotations() is true then
    if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id) then
      raise exception 'Unauthorized: PC build identity and ownership are immutable.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Unauthorized: a saved PC build must belong to the signed-in customer.'
      using errcode = '42501';
  end if;

  -- Customers save drafts directly. Formal quotations come only from the verified Edge Function.
  if tg_op = 'INSERT' then
    if new.enquiry_status is distinct from 'Draft'
       or new.reference_id is not null
       or new.authoritative_price is not null
       or coalesce(new.price_divergence, 0) <> 0
       or coalesce(new.technician_review_required, false)
       or new.staff_notes is not null
       or new.assigned_staff_id is not null then
      raise exception 'Unauthorized: customers can only save draft builds directly.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'Unauthorized: PC build identity and ownership are immutable.'
      using errcode = '42501';
  end if;

  if old.enquiry_status is distinct from 'Draft'
     or (new.enquiry_status, new.reference_id, new.authoritative_price, new.price_divergence,
         new.technician_review_required, new.staff_notes, new.assigned_staff_id,
         new.customer_name, new.customer_phone, new.customer_email)
        is distinct from
        (old.enquiry_status, old.reference_id, old.authoritative_price, old.price_divergence,
         old.technician_review_required, old.staff_notes, old.assigned_staff_id,
         old.customer_name, old.customer_phone, old.customer_email) then
    raise exception 'Unauthorized: submitted quotations and staff fields can''t be edited by customers.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop policy if exists pc_builds_update on public.pc_builds;
create policy pc_builds_update on public.pc_builds
  for update to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_quotations() is true)
  with check (user_id = (select auth.uid()) or public.can_manage_quotations() is true);

drop policy if exists pc_builds_select on public.pc_builds;
create policy pc_builds_select on public.pc_builds
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_quotations() is true);

revoke all on public.pc_builds from anon;
revoke all on public.pc_builds from authenticated;
grant insert, update, delete on public.pc_builds to authenticated;
grant select (
  id, user_id, name, parts, estimated_price, enquiry_status, created_at, updated_at, reference_id,
  customer_name, customer_phone, customer_email, compatibility, authoritative_price,
  price_divergence, technician_review_required
) on public.pc_builds to authenticated;

create or replace view public.pc_builds_staff
with (security_barrier = true)
as
  select b.*
  from public.pc_builds b
  where public.can_manage_quotations() is true;

revoke all on public.pc_builds_staff from public, anon, authenticated;
grant select on public.pc_builds_staff to authenticated, service_role;

-- ─── Profiles, staff, reviews and sell requests ──────────────────────────────────────────────────

create or replace function public.protect_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is not true then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'customer' and public.is_admin() is not true then
      raise exception 'Unauthorized: only administrators can create admin accounts.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role and public.is_admin() is not true then
    raise exception 'Unauthorized: only administrators can modify roles.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.protect_staff_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is true and public.can_manage_staff() is not true then
    raise exception 'Unauthorized: only Portal Administrators can create, modify or deactivate staff accounts.'
      using errcode = '42501';
  end if;
  -- NEW is null on DELETE. Returning it made every delete silently do nothing.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.protect_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is not true or public.is_staff() is true then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is null or new.user_id is distinct from auth.uid() then
      raise exception 'Unauthorized: a review must belong to the signed-in customer.'
        using errcode = '42501';
    end if;
    if new.status is distinct from 'Pending' then
      raise exception 'Unauthorized: new reviews must start in Pending moderation status.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
    raise exception 'Unauthorized: review identity is immutable.' using errcode = '42501';
  end if;
  if new.status is distinct from 'Pending' then
    raise exception 'Unauthorized: only staff and administrators can publish or hide reviews.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.protect_sell_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is not true or public.is_staff() is true then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is null or new.customer_id is distinct from auth.uid() then
      raise exception 'Unauthorized: a sell request must belong to the signed-in customer.'
        using errcode = '42501';
    end if;
    if new.status is distinct from 'Pending'
       or new.offered_price is not null
       or new.admin_notes is not null then
      raise exception 'Unauthorized: new sell requests start as Pending, with no valuation or staff notes.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.customer_id is distinct from old.customer_id or new.id is distinct from old.id then
    raise exception 'Unauthorized: customer and request ids are immutable.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Unauthorized: only staff can change sell request status.' using errcode = '42501';
  end if;
  if new.offered_price is distinct from old.offered_price
     or new.admin_notes is distinct from old.admin_notes then
    raise exception 'Unauthorized: only staff can update valuation and staff notes.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── Notifications and audit ─────────────────────────────────────────────────────────────────────

-- Any signed-in user could previously send a notification to any customer.
drop policy if exists "Staff and callers can insert customer notifications" on public.customer_notifications;
drop policy if exists customer_notifications_staff_insert on public.customer_notifications;
create policy customer_notifications_staff_insert on public.customer_notifications
  for insert to authenticated
  with check (public.is_staff() is true);

-- A customer may mark a notification as read, and may not rewrite it.
revoke all on public.customer_notifications from anon;
revoke update on public.customer_notifications from authenticated;
grant update (read) on public.customer_notifications to authenticated;

-- An audit row must always name the person who made it, including for administrators.
drop policy if exists staff_audit_logs_insert on public.staff_audit_logs;
create policy staff_audit_logs_insert on public.staff_audit_logs
  for insert to authenticated
  with check (public.is_staff() is true and staff_user_id = auth.uid());

-- ─── Table privileges for API roles ──────────────────────────────────────────────────────────────

-- Default privileges gave anon every table privilege, leaving RLS as the only barrier.
do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', r.tablename);
    execute format('revoke insert, update, delete on public.%I from anon', r.tablename);
  end loop;
end $$;

-- Anonymous visitors have no reason to touch these tables at all.
do $$
declare
  t text;
begin
  foreach t in array array[
    'addresses', 'analytics_settings', 'coupon_usages', 'coupons', 'customer_audit_history',
    'customer_audits', 'customer_notifications', 'hardware_spec_audit_log', 'import_runs',
    'order_items', 'orders', 'profiles', 'rate_limits', 'sell_request_documents',
    'sell_request_images', 'sell_requests', 'service_appointment_reschedule_requests',
    'shopify_customer_orders', 'shopify_order_associations', 'staff_audit_logs', 'staff_members',
    'staff_notifications', 'support_verifications', 'visitor_events', 'visitor_sessions',
    'warranty_checks', 'wishlist'
  ] loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Rate limits are read and written only by the service role.
revoke all on public.rate_limits from authenticated;
