-- ============================================================================
-- IT HUB — Staff Reviews & Sell Requests Management & Audit Logging
-- Migration: 20261029000002_staff_reviews_and_sell_requests.sql
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. FLEXIBLE REVIEWS SCHEMA (PRODUCT, SERVICE & GENERAL STORE REVIEWS)
-- ────────────────────────────────────────────────────────────────────────────

alter table public.reviews
  alter column product_id drop not null;

alter table public.reviews
  add column if not exists service_request_id uuid references public.service_requests (id) on delete set null,
  add column if not exists review_type text not null default 'product' check (review_type in ('product', 'service', 'general'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. UPDATE is_admin() HELPER FOR PORTAL ADMINISTRATORS
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
  or coalesce(auth.role() = 'service_role', false)
  or coalesce(session_user in ('postgres', 'supabase_admin'), false)
  or exists (
    select 1 from public.staff_members
    where user_id = auth.uid() and role = 'portal_admin' and is_active = true
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.get_current_staff_role() is not null
  or coalesce(auth.role() = 'service_role', false)
  or coalesce(session_user in ('postgres', 'supabase_admin'), false);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. PERMISSIVE AUDIT-AWARE TRIGGER GUARDS FOR REVIEWS & SELL REQUESTS
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.protect_review() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_admin() or public.is_staff()) then
    if tg_op = 'INSERT' then
      if new.user_id is distinct from auth.uid() then
        raise exception 'Unauthorized: Review must belong to authenticated user';
      end if;
      if new.status is distinct from 'Pending' then
        raise exception 'Unauthorized: New reviews must start in Pending moderation status';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
        raise exception 'Unauthorized: Review identity is immutable';
      end if;
      if new.status is distinct from 'Pending' then
        raise exception 'Unauthorized: Only staff and administrators can publish or hide reviews';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_sell_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_admin() or public.is_staff()) then
    if tg_op = 'INSERT' then
      if new.customer_id is distinct from auth.uid() then
        raise exception 'Unauthorized: Customer ID must match authenticated user';
      end if;
      if new.status is distinct from 'Pending' then
        raise exception 'Unauthorized: New sell requests must start in Pending status';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.customer_id is distinct from old.customer_id or new.id is distinct from old.id then
        raise exception 'Unauthorized: Customer ID and request ID are immutable';
      end if;
      if new.status is distinct from old.status then
        raise exception 'Unauthorized: Only staff members can change sell request status';
      end if;
      if new.offered_price is distinct from old.offered_price or new.admin_notes is distinct from old.admin_notes then
        raise exception 'Unauthorized: Only staff members can update valuation and admin notes';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. STAFF RLS POLICIES FOR REVIEWS, SELL REQUESTS & CUSTOMER PROFILES
-- ────────────────────────────────────────────────────────────────────────────

-- Staff access to customer profiles for review and sell-request attribution
drop policy if exists staff_profiles_select on public.profiles;
create policy staff_profiles_select on public.profiles
  for select using (public.is_staff());

-- Staff access to reviews
drop policy if exists staff_reviews_select on public.reviews;
create policy staff_reviews_select on public.reviews
  for select using (public.is_staff());

drop policy if exists staff_reviews_update on public.reviews;
create policy staff_reviews_update on public.reviews
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_reviews_delete on public.reviews;
create policy staff_reviews_delete on public.reviews
  for delete using (public.is_admin() or public.can_manage_staff());

-- Staff access to sell requests
drop policy if exists staff_sell_requests_select on public.sell_requests;
create policy staff_sell_requests_select on public.sell_requests
  for select using (public.is_staff());

drop policy if exists staff_sell_requests_update on public.sell_requests;
create policy staff_sell_requests_update on public.sell_requests
  for update using (public.is_staff()) with check (public.is_staff());

-- Staff access to sell request images and documents
drop policy if exists staff_sell_images_select on public.sell_request_images;
create policy staff_sell_images_select on public.sell_request_images
  for select using (public.is_staff());

drop policy if exists staff_sell_documents_select on public.sell_request_documents;
create policy staff_sell_documents_select on public.sell_request_documents
  for select using (public.is_staff());

-- ────────────────────────────────────────────────────────────────────────────
-- 5. ATOMIC STAFF RPCS WITH IMMUTABLE AUDIT LOGGING
-- ────────────────────────────────────────────────────────────────────────────

-- Staff review moderation RPC
create or replace function public.staff_update_review_status(
  p_review_id uuid,
  p_status text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
begin
  if not public.is_staff() then
    raise exception 'Unauthorized: Staff permissions required to moderate reviews.';
  end if;

  if p_status not in ('Pending', 'Published', 'Hidden') then
    raise exception 'Invalid review status. Allowed values: Pending, Published, Hidden.';
  end if;

  select status into v_old_status
  from public.reviews
  where id = p_review_id;

  if not found then
    raise exception 'Review not found.';
  end if;

  update public.reviews
  set
    status = p_status,
    updated_at = now()
  where id = p_review_id;

  -- Record audit log
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
    'MODERATE_REVIEW',
    'review',
    p_review_id::text,
    v_old_status,
    p_status,
    jsonb_build_object(
      'moderated_by', v_staff_id,
      'timestamp', now()
    )
  );

  return jsonb_build_object('success', true, 'status', p_status);
end;
$$;

-- Staff review deletion RPC
create or replace function public.staff_delete_review(
  p_review_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
begin
  if not (public.is_admin() or public.can_manage_staff()) then
    raise exception 'Unauthorized: Only Portal Administrators can delete reviews.';
  end if;

  select status into v_old_status
  from public.reviews
  where id = p_review_id;

  if not found then
    raise exception 'Review not found.';
  end if;

  delete from public.reviews
  where id = p_review_id;

  -- Record audit log
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
    'DELETE_REVIEW',
    'review',
    p_review_id::text,
    v_old_status,
    'Deleted',
    jsonb_build_object(
      'deleted_by', v_staff_id,
      'timestamp', now()
    )
  );

  return jsonb_build_object('success', true);
end;
$$;

-- Staff sell request moderation & valuation RPC
create or replace function public.staff_update_sell_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null,
  p_offered_price numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
begin
  if not public.is_staff() then
    raise exception 'Unauthorized: Staff permissions required to process sell requests.';
  end if;

  if p_status not in ('Pending', 'Under Review', 'Contacted', 'Approved', 'Rejected', 'Completed') then
    raise exception 'Invalid sell request status.';
  end if;

  select status into v_old_status
  from public.sell_requests
  where id = p_request_id;

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

  -- Record audit log
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
    'UPDATE_SELL_REQUEST',
    'sell_request',
    p_request_id::text,
    v_old_status,
    p_status,
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

grant execute on function public.staff_update_review_status(uuid, text) to authenticated;
grant execute on function public.staff_delete_review(uuid) to authenticated;
grant execute on function public.staff_update_sell_request(uuid, text, text, numeric) to authenticated;
