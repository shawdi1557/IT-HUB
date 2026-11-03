-- Approved staff permissions, enforced in the database so a hidden screen isn't the only barrier.
--
--   Portal administrator: everything, including staff, settings, content and analytics.
--   Service staff: service tickets, appointments, on-site audits, customer service.
--   Quotation staff: PC builds, quotations, customer enquiries.
--
-- Neither staff role manages staff, global settings or website content. Sell requests stay open to
-- both staff roles as customer enquiries. Review moderation is customer service.

-- ─── Website content and settings: administrators only ───────────────────────────────────────────

drop policy if exists announcements_staff_all on public.announcements;
drop policy if exists staff_update_store_settings on public.store_settings;
drop policy if exists staff_update_it_hub_locations on public.it_hub_locations;

drop policy if exists staff_manage_certificates on public.partner_certificates;
drop policy if exists admin_manage_certificates on public.partner_certificates;
create policy admin_manage_certificates on public.partner_certificates
  for all to authenticated
  using (public.is_admin() is true)
  with check (public.is_admin() is true);

drop policy if exists public_read_certificates on public.partner_certificates;
create policy public_read_certificates on public.partner_certificates
  for select
  using (is_published = true or public.is_admin() is true);

drop policy if exists staff_manage_showcase on public.website_showcase;
drop policy if exists admin_manage_showcase on public.website_showcase;
create policy admin_manage_showcase on public.website_showcase
  for all to authenticated
  using (public.is_admin() is true)
  with check (public.is_admin() is true);

drop policy if exists public_read_showcase on public.website_showcase;
create policy public_read_showcase on public.website_showcase
  for select
  using (is_active = true or public.is_admin() is true);

drop policy if exists promotional_campaigns_staff_manage on public.promotional_campaigns;
drop policy if exists promotional_campaigns_admin_manage on public.promotional_campaigns;
create policy promotional_campaigns_admin_manage on public.promotional_campaigns
  for all to authenticated
  using (public.is_admin() is true)
  with check (public.is_admin() is true);

drop policy if exists promotional_campaigns_public_read on public.promotional_campaigns;
create policy promotional_campaigns_public_read on public.promotional_campaigns
  for select
  using (
    (status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()))
    or public.is_admin() is true
  );

drop policy if exists "Promotional Banners Staff Insert" on storage.objects;
drop policy if exists "Promotional Banners Staff Update" on storage.objects;
drop policy if exists "Promotional Banners Staff Delete" on storage.objects;
drop policy if exists "Promotional Banners Admin Insert" on storage.objects;
drop policy if exists "Promotional Banners Admin Update" on storage.objects;
drop policy if exists "Promotional Banners Admin Delete" on storage.objects;

create policy "Promotional Banners Admin Insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'promotional-banners' and public.is_admin() is true);

create policy "Promotional Banners Admin Update" on storage.objects
  for update to authenticated
  using (bucket_id = 'promotional-banners' and public.is_admin() is true)
  with check (bucket_id = 'promotional-banners' and public.is_admin() is true);

create policy "Promotional Banners Admin Delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'promotional-banners' and public.is_admin() is true);

-- ─── Visitor analytics: IP and behaviour data, administrators only ───────────────────────────────

drop policy if exists staff_visitor_sessions_select on public.visitor_sessions;
drop policy if exists staff_visitor_events_select on public.visitor_events;

-- ─── On-site customer audits: service staff ──────────────────────────────────────────────────────

drop policy if exists "Staff can view all customer audits" on public.customer_audits;
drop policy if exists "Staff can insert customer audits" on public.customer_audits;
drop policy if exists "Staff can update customer audits" on public.customer_audits;
drop policy if exists "Staff can view audit history" on public.customer_audit_history;
drop policy if exists "Staff can insert audit history" on public.customer_audit_history;
drop policy if exists "Service staff can view customer audits" on public.customer_audits;
drop policy if exists "Service staff can insert customer audits" on public.customer_audits;
drop policy if exists "Service staff can update customer audits" on public.customer_audits;
drop policy if exists "Service staff can view audit history" on public.customer_audit_history;
drop policy if exists "Service staff can insert audit history" on public.customer_audit_history;

create policy "Service staff can view customer audits" on public.customer_audits
  for select to authenticated
  using (public.can_manage_services() is true);

create policy "Service staff can insert customer audits" on public.customer_audits
  for insert to authenticated
  with check (public.can_manage_services() is true);

create policy "Service staff can update customer audits" on public.customer_audits
  for update to authenticated
  using (public.can_manage_services() is true)
  with check (public.can_manage_services() is true);

create policy "Service staff can view audit history" on public.customer_audit_history
  for select to authenticated
  using (public.can_manage_services() is true);

create policy "Service staff can insert audit history" on public.customer_audit_history
  for insert to authenticated
  with check (public.can_manage_services() is true);

-- ─── Customer orders and tokens ──────────────────────────────────────────────────────────────────

drop policy if exists shopify_customer_orders_select on public.shopify_customer_orders;
create policy shopify_customer_orders_select on public.shopify_customer_orders
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_services() is true);

-- Association tokens prove ownership of a future order, so no staff role has a reason to read them.
drop policy if exists shopify_order_associations_select on public.shopify_order_associations;
create policy shopify_order_associations_select on public.shopify_order_associations
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin() is true);

-- ─── Audit log: administrators see everything, staff see their own actions ───────────────────────

drop policy if exists staff_audit_logs_select on public.staff_audit_logs;
create policy staff_audit_logs_select on public.staff_audit_logs
  for select to authenticated
  using (public.is_admin() is true or (staff_user_id = auth.uid() and public.is_staff() is true));

-- ─── Reviews: customer service ───────────────────────────────────────────────────────────────────

drop policy if exists staff_reviews_select on public.reviews;
create policy staff_reviews_select on public.reviews
  for select to authenticated
  using (public.can_manage_services() is true);

drop policy if exists staff_reviews_update on public.reviews;
create policy staff_reviews_update on public.reviews
  for update to authenticated
  using (public.can_manage_services() is true)
  with check (public.can_manage_services() is true);

create or replace function public.protect_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is not true or public.can_manage_services() is true then
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
    raise exception 'Unauthorized: only service staff and administrators can publish or hide reviews.'
      using errcode = '42501';
  end if;
  return new;
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
  if public.can_manage_services() is not true then
    raise exception 'Unauthorized: Service staff permissions required to moderate reviews.' using errcode = '42501';
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

-- ─── What the portal shows: the same answers the database enforces ───────────────────────────────

create or replace function public.get_staff_portal_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_member record;
  v_profile record;
begin
  if v_user_id is null then
    return jsonb_build_object('is_staff', false, 'error', 'Unauthenticated');
  end if;

  v_role := public.get_current_staff_role();
  if v_role is null then
    return jsonb_build_object('is_staff', false, 'error', 'Unauthorized');
  end if;

  select * into v_member from public.staff_members where user_id = v_user_id and is_active = true limit 1;
  select * into v_profile from public.profiles where id = v_user_id limit 1;

  return jsonb_build_object(
    'is_staff', true,
    'user_id', v_user_id,
    'role', v_role,
    'full_name', coalesce(v_member.full_name, v_profile.full_name, 'IT HUB Staff'),
    'email', coalesce(v_member.email, v_profile.email, ''),
    'permissions', jsonb_build_object(
      'can_manage_quotations', public.can_manage_quotations(),
      'can_manage_services', public.can_manage_services(),
      'can_manage_staff', public.can_manage_staff(),
      'can_manage_content', public.is_admin(),
      'can_manage_settings', public.is_admin(),
      'can_view_analytics', public.is_admin(),
      'can_manage_sell_requests', public.is_staff()
    )
  );
end;
$$;
