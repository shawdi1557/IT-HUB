-- ============================================================================
-- IT HUB — Supabase / PostgreSQL Safe Database Migration
-- Target: Upgrades an existing Supabase instance running the initial schema
--         to the production-ready secure schema with MRP, stock expiration,
--         and refined service-request protections.
--
-- Starting Schema Version: IT HUB v1.0 (Initial Prototype Schema)
-- Expected Prerequisites:
--   Existing tables: profiles, categories, brands, products, inventory,
--                    orders, order_items, coupons, coupon_usages, service_requests.
--
-- Safety Notice:
--   - Non-destructive: preserves existing product catalogs, customer profiles,
--     historical orders, and coupons.
--   - Does NOT use destructive CASCADE drops.
--   - Safe transaction wrapper: aborts cleanly on any error.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PREREQUISITES VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'products') then
    raise exception 'Migration aborted: Required table "products" does not exist in schema public.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'orders') then
    raise exception 'Migration aborted: Required table "orders" does not exist in schema public.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    raise exception 'Migration aborted: Required table "profiles" does not exist in schema public.';
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SCHEMA EVOLUTION: COLUMN ADDITIONS & CONSTRAINTS
-- ────────────────────────────────────────────────────────────────────────────

-- 2.1 Profiles
alter table profiles
  add column if not exists address text,
  add column if not exists updated_at timestamptz not null default now();

-- 2.2 Products: Add MRP, Second-hand, and Condition
alter table products
  add column if not exists mrp numeric(12, 2),
  add column if not exists second_hand boolean not null default false,
  add column if not exists condition text;

-- Add check constraints if not present
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_mrp_check') then
    alter table products add constraint products_mrp_check check (mrp is null or mrp >= price);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_condition_check') then
    alter table products add constraint products_condition_check
      check (condition is null or condition in ('New', 'Like New', 'Good', 'Fair', 'For Parts'));
  end if;
end $$;

-- 2.3 Orders: Add order_number, payment fields, expiration TTL, and stock reservation flag
alter table orders
  add column if not exists order_number text,
  add column if not exists payment_status text not null default 'Pending',
  add column if not exists coupon_id uuid references coupons (id) on delete set null,
  add column if not exists coupon_discount numeric(12, 2) not null default 0,
  add column if not exists shipping_fee numeric(12, 2) not null default 0,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text,
  add column if not exists expires_at timestamptz not null default (now() + interval '30 minutes'),
  add column if not exists stock_reserved boolean not null default true,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill order_number for existing orders
update orders
set order_number = 'ITH-' || to_char(created_at, 'YYYYMMDD') || '-' || upper(substring(id::text from 1 for 6))
where order_number is null;

alter table orders
  alter column order_number set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_order_number_unique') then
    alter table orders add constraint orders_order_number_unique unique (order_number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_status_check') then
    alter table orders add constraint orders_payment_status_check
      check (payment_status in ('Pending', 'Paid', 'Failed', 'Refunded'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_coupon_discount_check') then
    alter table orders add constraint orders_coupon_discount_check check (coupon_discount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_shipping_fee_check') then
    alter table orders add constraint orders_shipping_fee_check check (shipping_fee >= 0);
  end if;
end $$;

-- Backfill payment_status and mark reservation released for historical completed orders
update orders
set payment_status = 'Paid',
    stock_reserved = false
where payment_status = 'Pending' and status in ('Processing', 'Shipped', 'Delivered');

update orders
set stock_reserved = false
where status = 'Cancelled';

-- 2.4 Timestamp columns for other core entities
alter table coupons add column if not exists updated_at timestamptz not null default now();
alter table service_requests add column if not exists updated_at timestamptz not null default now();
alter table pc_builds add column if not exists updated_at timestamptz not null default now();
alter table store_settings add column if not exists updated_at timestamptz not null default now();
alter table brand_support add column if not exists updated_at timestamptz not null default now();
alter table sell_requests add column if not exists updated_at timestamptz not null default now();
alter table sell_requests add column if not exists expected_price numeric(12, 2) check (expected_price is null or expected_price >= 0);
alter table sell_requests add column if not exists offered_price numeric(12, 2) check (offered_price is null or offered_price >= 0);
alter table analytics_settings add column if not exists updated_at timestamptz not null default now();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. VIEWS: SAFE REPLACEMENT (NON-CASCADE)
-- ────────────────────────────────────────────────────────────────────────────

-- Drop views cleanly without CASCADE to protect any dependent references
drop view if exists products_public;

create view products_public with (security_invoker = on, security_barrier = true) as
  select
    p.id,
    p.sku,
    p.name,
    p.brand_id,
    p.category_id,
    p.subcategory,
    p.description,
    p.mrp,
    p.price,
    p.sale_price,
    coalesce(p.sale_price, p.price) as effective_price,
    p.warranty,
    p.weight,
    p.specs,
    p.second_hand,
    p.condition,
    p.status,
    p.created_at,
    coalesce(i.stock, 0) as stock
  from products p
  left join inventory i on i.product_id = p.id
  where p.status = 'Active';

alter view products_public set (security_invoker = on, security_barrier = true);

drop view if exists live_offers;

create view live_offers with (security_invoker = on, security_barrier = true) as
  select
    id,
    name,
    description,
    type,
    discount_percent,
    discount_amount,
    starts_at,
    ends_at,
    banner_path,
    active,
    created_at
  from offers
  where active and now() between starts_at and ends_at;

alter view live_offers set (security_invoker = on, security_barrier = true);

drop view if exists public_coupons;

create view public_coupons with (security_invoker = on, security_barrier = true) as
  select
    id,
    code,
    description,
    type,
    value,
    min_order_value,
    max_discount,
    starts_at,
    ends_at
  from coupons
  where active and now() between starts_at and ends_at;

alter view public_coupons set (security_invoker = on, security_barrier = true);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. FUNCTION & TRIGGER UPDATES
-- ────────────────────────────────────────────────────────────────────────────

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select
    coalesce(current_user in ('postgres', 'supabase_admin'), false)
    or coalesce(nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role', false)
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    );
create or replace function check_onsite_warranty(p_pincode text)
returns table (eligible boolean, location_id uuid, area text, approx_distance_km numeric)
language sql stable security invoker set search_path = public, pg_temp as $$
  select d.km <= l.service_radius_km, l.id, a.area, round(d.km::numeric, 1)
  from pincode_areas a
  cross join lateral (
    select l.*, 6371 * 2 * asin(sqrt(
      power(sin(radians(l.latitude - a.latitude) / 2), 2) +
      cos(radians(a.latitude)) * cos(radians(l.latitude)) *
      power(sin(radians(l.longitude - a.longitude) / 2), 2))) as km
    from it_hub_locations l where l.active
    order by km limit 1
  ) l
  cross join lateral (select l.km) d
  where a.pincode = p_pincode;
$$;

create or replace function handle_updated_at() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_phone text;
  v_email text;
  v_full_name text;
begin
  v_phone := nullif(trim(new.phone), '');
  v_email := nullif(trim(new.email), '');
  v_full_name := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name'
  )), '');

  -- Pre-validate unique phone to prevent orphaned auth.users records on constraint failure
  if v_phone is not null and exists (select 1 from profiles where phone = v_phone and id <> new.id) then
    raise exception 'Phone number % is already registered to another account', v_phone;
  end if;

  insert into profiles (id, role, full_name, phone, email, created_at, updated_at)
  values (new.id, 'customer', v_full_name, v_phone, v_email, now(), now())
  on conflict (id) do update set
    email = coalesce(excluded.email, profiles.email),
    phone = coalesce(excluded.phone, profiles.phone),
    full_name = coalesce(excluded.full_name, profiles.full_name),
    updated_at = now();
  return new;
end;
$$;

-- Self-healing reconciliation helper to recover missing profiles for authenticated users
create or replace function ensure_profile() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_user record;
  v_profile record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required to ensure profile';
  end if;

  select * into v_profile from profiles where id = v_user_id;
  if found then
    return jsonb_build_object('ok', true, 'created', false, 'profile', to_jsonb(v_profile));
  end if;

  select * into v_user from auth.users where id = v_user_id;
  if not found then
    raise exception 'Authenticated user record not found';
  end if;

  insert into profiles (id, role, full_name, phone, email, address, created_at, updated_at)
  values (
    v_user.id,
    'customer',
    nullif(trim(coalesce(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name')), ''),
    nullif(trim(v_user.phone), ''),
    nullif(trim(v_user.email), ''),
    nullif(trim(coalesce(v_user.raw_user_meta_data->>'address', '')), ''),
    now(),
    now()
  )
  on conflict (id) do update set
    updated_at = now()
  returning * into v_profile;

  return jsonb_build_object('ok', true, 'created', true, 'profile', to_jsonb(v_profile));
end;
$$;

-- Enforces NULL-safe comparisons and restricts non-admin creation strictly to customer role
create or replace function protect_role() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not is_admin() then
      raise exception 'Unauthorized: Only administrators can modify roles';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role is distinct from 'customer' and not is_admin() then
      raise exception 'Unauthorized: Only administrators can create admin accounts';
    end if;
  end if;
  return new;
end;
$$;

-- Enforces fine-grained customer vs admin update permissions on service requests.
-- Uses NULL-safe comparisons (IS DISTINCT FROM), strict quote transition checks,
-- and protects administrative notes and privileged fields.
create or replace function protect_service_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    -- 1. Immutable identifiers & timestamps
    if new.user_id is distinct from old.user_id then
      raise exception 'Unauthorized: Cannot change service request ownership';
    end if;
    if new.id is distinct from old.id then
      raise exception 'Unauthorized: Cannot change service request ID';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'Unauthorized: Cannot alter creation timestamp';
    end if;

    -- 2. Administrative fields protected from customer mutation
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

    -- 3. Quote state transition:
    -- Customer can ONLY respond to an active pending quote when a quote is present.
    -- Prevents transition when old.quote_state is NULL or not pending.
    if new.quote_state is distinct from old.quote_state then
      if (old.quote_state is distinct from 'pending') or (old.quote is null) or (new.quote_state not in ('approved', 'rejected')) then
        raise exception 'Unauthorized: Invalid quote response transition';
      end if;
    end if;

    -- 4. Customer-editable hardware & scheduling details:
    -- Permitted ONLY while in 'Booked' workflow status
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

      -- Validate customer ownership of new address_id if specified
      if new.address_id is not null and new.address_id is distinct from old.address_id then
        if not exists (select 1 from addresses where id = new.address_id and user_id = new.user_id) then
          raise exception 'Unauthorized: Selected address does not belong to you';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function protect_sell_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    if tg_op = 'INSERT' then
      if new.customer_id is distinct from auth.uid() then
        raise exception 'Unauthorized: Customer ID must match authenticated user';
      end if;
      if new.status is distinct from 'Pending' then
        raise exception 'Unauthorized: New sell requests must start in Pending status';
      end if;
      if new.admin_notes is not null then
        raise exception 'Unauthorized: Administrative notes cannot be set on creation';
      end if;
      if new.offered_price is not null then
        raise exception 'Unauthorized: Offered price cannot be set on creation';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.status <> old.status then
        raise exception 'Unauthorized: Only administrators can update sell request status';
      end if;
      if new.admin_notes is distinct from old.admin_notes then
        raise exception 'Unauthorized: Only administrators can modify admin notes';
      end if;
      if new.offered_price is distinct from old.offered_price then
        raise exception 'Unauthorized: Only administrators can modify offered price';
      end if;
      if new.customer_id <> old.customer_id then
        raise exception 'Unauthorized: Cannot change sell request customer';
      end if;
      if new.id <> old.id then
        raise exception 'Unauthorized: Cannot change sell request ID';
      end if;
      if old.status <> 'Pending' then
        raise exception 'Unauthorized: Sell request details cannot be edited once under review';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function mask_ip_address(p_ip inet) returns inet
language plpgsql immutable security definer set search_path = public, pg_temp as $$
begin
  if p_ip is null then
    return null;
  end if;
  if family(p_ip) = 4 then
    return host(network(set_masklen(p_ip, 24)))::inet;
  elsif family(p_ip) = 6 then
    return host(network(set_masklen(p_ip, 48)))::inet;
  end if;
  return p_ip;
exception when others then
  return null;
end;
$$;

-- Privacy-respecting visitor event logging RPC.
-- Enforces strict event type allowlist, metadata validation, session ownership checks,
-- and prioritizes trusted Cloudflare / proxy headers to mitigate header spoofing.
create or replace function log_visitor_event(
  p_session_id uuid,
  p_visitor_id text,
  p_event_type text,
  p_path text default null,
  p_meta jsonb default '{}'::jsonb,
  p_device text default null,
  p_os text default null,
  p_browser text default null,
  p_referrer text default null,
  p_country text default null,
  p_region text default null,
  p_city text default null,
  p_isp text default null,
  p_returning boolean default false
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s analytics_settings;
  v_session record;
  v_raw_header text;
  v_raw_ip text;
  v_ip inet;
begin
  select * into s from analytics_settings where id;
  if not coalesce(s.enabled, true) then
    return;
  end if;

  if p_session_id is null then
    raise exception 'Invalid session ID';
  end if;

  if p_visitor_id is null or length(trim(p_visitor_id)) < 1 or length(p_visitor_id) > 64 then
    raise exception 'Invalid visitor ID';
  end if;

  -- 1. Explicit allowlist for permitted event types
  if p_event_type is null or p_event_type not in (
    'Session Started',
    'Session Ended',
    'Page Viewed',
    'Login',
    'Logout',
    'Product Viewed',
    'Product Added to Cart',
    'Checkout Started',
    'Order Created',
    'Service Booking Started',
    'Service Request Created',
    'PC Builder Started',
    'PC Build Saved',
    'Warranty Assistance Viewed',
    'Contact/WhatsApp Action'
  ) then
    -- Administrative events are permitted only for verified administrators
    if p_event_type in ('Admin Login', 'Admin Data Change') and is_admin() then
      null;
    else
      raise exception 'Disallowed or invalid event type: %', p_event_type;
    end if;
  end if;

  -- 2. Metadata validation (must be object, max 4096 bytes)
  if p_meta is not null then
    if jsonb_typeof(p_meta) <> 'object' then
      raise exception 'Metadata must be a JSON object';
    end if;
    if octet_length(p_meta::text) > 4096 then
      raise exception 'Metadata exceeds maximum allowable size of 4096 bytes';
    end if;
  end if;

  -- 3. Session ownership check: prevent session hijacking and cross-user contamination
  select * into v_session from visitor_sessions where id = p_session_id;
  if found then
    if v_session.visitor_id <> trim(p_visitor_id) then
      raise exception 'Session ownership violation: visitor ID mismatch';
    end if;
    if v_session.user_id is not null and auth.uid() is not null and v_session.user_id <> auth.uid() then
      raise exception 'Session ownership violation: session belongs to another user';
    end if;
  end if;

  -- 4. Derive IP from trusted infrastructure request headers (Cloudflare CF-Connecting-IP first)
  if coalesce(s.ip_logging, true) then
    begin
      v_raw_header := current_setting('request.headers', true);
      if v_raw_header is not null and v_raw_header <> '' then
        v_raw_ip := coalesce(
          nullif(trim(v_raw_header::json ->> 'cf-connecting-ip'), ''),
          nullif(trim(v_raw_header::json ->> 'x-real-ip'), ''),
          nullif(trim(split_part(v_raw_header::json ->> 'x-forwarded-for', ',', 1)), '')
        );
        if v_raw_ip is not null then
          v_ip := v_raw_ip::inet;
          if coalesce(s.mask_ip, true) then
            v_ip := mask_ip_address(v_ip);
          end if;
        end if;
      end if;
    exception when others then
      v_ip := null;
    end;
  else
    v_ip := null;
  end if;

  -- 5. Upsert visitor session
  insert into visitor_sessions as vs (
    id, visitor_id, user_id, ip, country, region, city, isp, location_confidence,
    device, os, browser, referrer, landing_page, is_returning, page_views
  ) values (
    p_session_id,
    left(trim(p_visitor_id), 64),
    auth.uid(),
    v_ip,
    left(p_country, 64),
    left(p_region, 64),
    left(p_city, 64),
    left(p_isp, 64),
    case when p_city is not null or p_region is not null or p_country is not null then 'approximate' else 'unavailable' end,
    case when p_device in ('Desktop', 'Mobile', 'Tablet') then p_device else null end,
    left(p_os, 64),
    left(p_browser, 64),
    left(p_referrer, 255),
    left(p_path, 500),
    coalesce(p_returning, false),
    case when p_event_type = 'Page Viewed' then 1 else 0 end
  )
  on conflict (id) do update set
    last_seen = now(),
    user_id = coalesce(vs.user_id, auth.uid()),
    page_views = vs.page_views + case when p_event_type = 'Page Viewed' then 1 else 0 end;

  -- 6. Append visitor event
  insert into visitor_events (
    session_id, user_id, event_type, path, meta
  ) values (
    p_session_id,
    auth.uid(),
    left(p_event_type, 64),
    left(p_path, 500),
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

create or replace function purge_visitor_data() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_retention integer;
  removed integer := 0;
begin
  select retention_days into v_retention from analytics_settings where id limit 1;
  v_retention := coalesce(v_retention, 90);

  delete from visitor_sessions
  where last_seen < now() - make_interval(days => v_retention);

  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Read-only coupon validation during checkout. Does NOT record usage.
create or replace function validate_coupon(
  p_code text,
  p_cart_total numeric
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  c coupons;
  v_discount numeric := 0;
  v_customer_id uuid;
  v_already_used boolean;
begin
  v_customer_id := auth.uid();
  if p_code is null or trim(p_code) = '' then
    return jsonb_build_object('ok', false, 'valid', false, 'error', 'Enter a coupon code.');
  end if;

  if p_cart_total is null or p_cart_total <= 0 then
    return jsonb_build_object('ok', false, 'valid', false, 'error', 'Invalid cart total.');
  end if;

  select * into c
  from coupons
  where upper(code) = upper(trim(p_code)) and active;

  if not found then
    return jsonb_build_object('ok', false, 'valid', false, 'error', 'Invalid coupon code.');
  end if;

  if now() < c.starts_at or now() > c.ends_at then
    return jsonb_build_object('ok', false, 'valid', false, 'error', 'Coupon is not currently valid.');
  end if;

  if c.total_usage_limit > 0 and c.times_used >= c.total_usage_limit then
    return jsonb_build_object('ok', false, 'valid', false, 'error', 'Coupon usage limit reached.');
  end if;

  -- Validate one-time per customer if signed in
  if v_customer_id is not null then
    select exists (
      select 1 from coupon_usages
      where coupon_id = c.id and customer_id = v_customer_id
    ) into v_already_used;

    if v_already_used then
      return jsonb_build_object('ok', false, 'valid', false, 'error', 'You have already used this coupon.');
    end if;
  end if;

  if c.min_order_value > 0 and p_cart_total < c.min_order_value then
    return jsonb_build_object(
      'ok', false,
      'valid', false,
      'error', format('Minimum order value of ₹%s required.', c.min_order_value::int)
    );
  end if;

  if c.type = 'percentage' then
    v_discount := round((p_cart_total * c.value) / 100.0, 2);
    if c.max_discount is not null and c.max_discount > 0 then
      v_discount := least(v_discount, c.max_discount);
    end if;
  else
    v_discount := c.value;
  end if;

  v_discount := least(v_discount, p_cart_total);

  return jsonb_build_object(
    'ok', true,
    'valid', true,
    'coupon_id', c.id,
    'code', c.code,
    'description', c.description,
    'discount', v_discount,
    'type', c.type,
    'coupon', jsonb_build_object(
      'id', c.id,
      'code', c.code,
      'description', c.description,
      'type', c.type,
      'value', c.value,
      'minOrderValue', c.min_order_value,
      'maxDiscount', coalesce(c.max_discount, 0)
    )
  );
end;
$$;

create or replace function create_order(
  p_items jsonb,
  p_address_id uuid default null,
  p_delivery_method text default 'Kerala delivery',
  p_payment_method text default 'Razorpay',
  p_coupon_code text default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12, 2) := 0;
  v_coupon_discount numeric(12, 2) := 0;
  v_coupon_id uuid := null;
  v_shipping numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
  v_item record;
  v_item_pid uuid;
  v_item_qty int;
  v_product record;
  v_effective_price numeric(12, 2);
  v_coupon record;
  v_expires_at timestamptz;
  v_snapshots jsonb := '[]'::jsonb;
  v_snapshot_item jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required to place an order';
  end if;

  -- 1. Validate delivery and payment methods against supported values
  if p_delivery_method is null or p_delivery_method not in ('Store pickup', 'Kerala delivery', 'Standard delivery') then
    raise exception 'Invalid delivery method: %. Supported: Store pickup, Kerala delivery, Standard delivery', p_delivery_method;
  end if;

  if p_payment_method is null or p_payment_method not in ('Razorpay', 'Cash on Delivery') then
    raise exception 'Invalid payment method: %. Supported: Razorpay, Cash on Delivery', p_payment_method;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  -- Fulfilment address requirement: Delivery methods require a verified delivery address
  if p_delivery_method in ('Kerala delivery', 'Standard delivery') then
    if p_address_id is null then
      raise exception 'Delivery address is required for %', p_delivery_method;
    end if;
  end if;

  if p_address_id is not null then
    if not exists (select 1 from addresses where id = p_address_id and user_id = v_user_id) then
      raise exception 'Selected delivery address does not exist or does not belong to you';
    end if;
  end if;

  -- 2. Validate stock, lock inventory & catalog rows deterministically (order by product_id)
  -- Aggregates quantities to prevent duplicate product race conditions in cart payload
  for v_item in
    select product_id, sum(quantity)::int as quantity
    from jsonb_to_recordset(p_items) as (product_id uuid, quantity int)
    group by product_id
    order by product_id asc
  loop
    v_item_pid := v_item.product_id;
    v_item_qty := v_item.quantity;

    if v_item_pid is null then
      raise exception 'Item product_id cannot be null';
    end if;

    if v_item_qty is null or v_item_qty <= 0 then
      raise exception 'Item quantity must be a positive integer';
    end if;

    -- Lock product (FOR SHARE) and inventory row (FOR UPDATE) to stabilize price & stock
    select p.id, p.name, p.status, p.price, p.sale_price, p.mrp, i.stock
    into v_product
    from products p
    join inventory i on i.product_id = p.id
    where p.id = v_item_pid
    for share of p for update of i;

    if not found then
      raise exception 'Product % not found in catalog or inventory', v_item_pid;
    end if;

    if v_product.status <> 'Active' then
      raise exception 'Product "%" is not active for purchase', v_product.name;
    end if;

    if v_product.stock < v_item_qty then
      raise exception 'Insufficient stock for "%". Requested: %, Available: %',
        v_product.name, v_item_qty, v_product.stock;
    end if;

    -- Authoritative effective price rule: sale_price if present and valid, otherwise regular price
    v_effective_price := coalesce(v_product.sale_price, v_product.price);
    if v_effective_price < 0 then
      raise exception 'Invalid calculated price for "%"', v_product.name;
    end if;

    v_subtotal := v_subtotal + (v_effective_price * v_item_qty);

    -- Store validated snapshot entry for reuse in order-item inserts
    v_snapshots := v_snapshots || jsonb_build_object(
      'product_id', v_item_pid,
      'name', v_product.name,
      'unit_price', v_effective_price,
      'quantity', v_item_qty
    );

    -- Deduct stock atomically for the 30-minute reservation window
    update inventory
    set stock = stock - v_item_qty,
        updated_at = now()
    where product_id = v_item_pid;
  end loop;

  -- 3. Validate coupon if provided
  if p_coupon_code is not null and trim(p_coupon_code) <> '' then
    select * into v_coupon
    from coupons
    where upper(code) = upper(trim(p_coupon_code))
      and active
    for update;

    if not found then
      raise exception 'Invalid coupon code "%"', p_coupon_code;
    end if;

    if now() < v_coupon.starts_at or now() > v_coupon.ends_at then
      raise exception 'Coupon "%" is expired or not yet valid', v_coupon.code;
    end if;

    if v_coupon.total_usage_limit > 0 and v_coupon.times_used >= v_coupon.total_usage_limit then
      raise exception 'Coupon "%" has reached its maximum global usage limit', v_coupon.code;
    end if;

    if exists (select 1 from coupon_usages where coupon_id = v_coupon.id and customer_id = v_user_id) then
      raise exception 'You have already redeemed coupon "%"', v_coupon.code;
    end if;

    -- Prevent customer from holding multiple concurrent pending checkouts with the same one-time coupon
    if exists (
      select 1 from orders
      where user_id = v_user_id
        and coupon_id = v_coupon.id
        and status = 'Pending'
        and payment_status = 'Pending'
        and expires_at > now()
    ) then
      raise exception 'You already have an active checkout with coupon "%". Please complete or cancel that checkout first.', v_coupon.code;
    end if;

    if v_coupon.min_order_value > 0 and v_subtotal < v_coupon.min_order_value then
      raise exception 'Minimum order value of ₹% required for coupon "%"', v_coupon.min_order_value::int, v_coupon.code;
    end if;

    if v_coupon.type = 'percentage' then
      v_coupon_discount := round((v_subtotal * v_coupon.value) / 100.0, 2);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_coupon_discount := least(v_coupon_discount, v_coupon.max_discount);
      end if;
    else
      v_coupon_discount := v_coupon.value;
    end if;
    v_coupon_discount := least(v_coupon_discount, v_subtotal);
    v_coupon_id := v_coupon.id;
  end if;

  -- 4. Delivery charges
  if p_delivery_method = 'Store pickup' then
    v_shipping := 0.00;
  else
    v_shipping := 99.00;
  end if;

  v_total := greatest(0, v_subtotal - v_coupon_discount) + v_shipping;
  v_order_number := 'ITH-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 6));
  v_order_id := gen_random_uuid();
  v_expires_at := now() + interval '30 minutes';

  -- 5. Create Pending Order with 30-minute stock reservation
  insert into orders (
    id, order_number, user_id, address_id, status, payment_status,
    subtotal, offer_savings, coupon_id, coupon_discount,
    shipping_fee, total, payment_method, delivery_method,
    expires_at, stock_reserved, notes, created_at, updated_at
  ) values (
    v_order_id, v_order_number, v_user_id, p_address_id, 'Pending', 'Pending',
    v_subtotal, 0, v_coupon_id, v_coupon_discount,
    v_shipping, v_total, p_payment_method, p_delivery_method,
    v_expires_at, true, p_notes, now(), now()
  );

  -- 6. Create Order Item snapshots using validated captured prices (no secondary query)
  for v_snapshot_item in select * from jsonb_array_elements(v_snapshots) loop
    insert into order_items (
      order_id, product_id, name, unit_price, quantity
    ) values (
      v_order_id,
      (v_snapshot_item->>'product_id')::uuid,
      v_snapshot_item->>'name',
      (v_snapshot_item->>'unit_price')::numeric,
      (v_snapshot_item->>'quantity')::int
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'coupon_discount', v_coupon_discount,
    'shipping_fee', v_shipping,
    'total', v_total,
    'status', 'Pending',
    'payment_status', 'Pending',
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function attach_razorpay_order_id(
  p_order_id uuid,
  p_razorpay_order_id text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order record;
begin
  if p_order_id is null or p_razorpay_order_id is null or trim(p_razorpay_order_id) = '' then
    raise exception 'order_id and razorpay_order_id are required';
  end if;

  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_order.status <> 'Pending' or v_order.payment_status <> 'Pending' then
    raise exception 'Cannot attach Razorpay order ID to order with status % / payment_status %', v_order.status, v_order.payment_status;
  end if;

  if v_order.razorpay_order_id is not null and v_order.razorpay_order_id <> trim(p_razorpay_order_id) then
    raise exception 'Order % already has a different Razorpay order ID attached (%)', p_order_id, v_order.razorpay_order_id;
  end if;

  update orders
  set razorpay_order_id = trim(p_razorpay_order_id),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'razorpay_order_id', trim(p_razorpay_order_id));
end;
$$;

-- Drop previous overloads of record_order_payment to ensure a single canonical signature
drop function if exists record_order_payment(uuid, text, text, text);
drop function if exists record_order_payment(uuid, text, text, text, numeric);
drop function if exists record_order_payment(uuid, text, text, text, numeric, text);

create or replace function record_order_payment(
  p_order_id uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text,
  p_amount_paid numeric,
  p_currency text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order record;
  v_coupon record;
  v_usage_inserted boolean := false;
  v_item record;
  v_current_stock int;
  v_stock_available boolean := true;
  v_coupon_already_used boolean := false;
begin
  -- 1. Strict input validation
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

  -- 2. Lookup order with row lock unambiguously
  if p_order_id is not null then
    select * into v_order
    from orders
    where id = p_order_id
    for update;

    if not found then
      raise exception 'Order not found for order_id: %', p_order_id;
    end if;

    if v_order.razorpay_order_id is null or trim(v_order.razorpay_order_id) = '' then
      raise exception 'Order % does not have an attached Razorpay order ID', v_order.id;
    end if;

    if v_order.razorpay_order_id <> trim(p_razorpay_order_id) then
      raise exception 'Razorpay order ID mismatch: Expected %, Received %',
        v_order.razorpay_order_id, trim(p_razorpay_order_id);
    end if;
  else
    select * into v_order
    from orders
    where razorpay_order_id = trim(p_razorpay_order_id)
    for update;

    if not found then
      raise exception 'Order not found for razorpay_order_id: %', trim(p_razorpay_order_id);
    end if;
  end if;

  -- 3. Idempotency check: duplicate webhook delivery returns success without re-processing
  if v_order.payment_status = 'Paid' then
    if v_order.razorpay_payment_id = trim(p_razorpay_payment_id) then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', v_order.status,
        'payment_status', v_order.payment_status
      );
    else
      raise exception 'Order % is already marked as Paid with different payment ID %',
        v_order.id, v_order.razorpay_payment_id;
    end if;
  end if;

  -- 4. Validate exact amount match
  if round(p_amount_paid, 2) <> round(v_order.total, 2) then
    raise exception 'Payment amount mismatch: Expected ₹%, Received ₹%', v_order.total, p_amount_paid;
  end if;

  -- 5. Handling payment arrived after expiration / cancellation
  if v_order.status = 'Cancelled' or not v_order.stock_reserved or v_order.expires_at < now() then
    -- Lock all item inventory rows in deterministic order to prevent deadlocks
    for v_item in
      select product_id, quantity
      from order_items
      where order_id = v_order.id and product_id is not null
      order by product_id asc
    loop
      select stock into v_current_stock
      from inventory
      where product_id = v_item.product_id
      for update;

      if not found or v_current_stock < v_item.quantity then
        v_stock_available := false;
      end if;
    end loop;

    if v_stock_available then
      -- Deduct re-reserved inventory atomically
      for v_item in
        select product_id, quantity
        from order_items
        where order_id = v_order.id and product_id is not null
        order by product_id asc
      loop
        update inventory
        set stock = stock - v_item.quantity,
            updated_at = now()
        where product_id = v_item.product_id;
      end loop;

      update orders
      set stock_reserved = true,
          status = 'Processing',
          notes = coalesce(notes, '') || ' [Stock re-reserved successfully upon late payment confirmation]'
      where id = v_order.id;
    else
      -- Stock unavailable: Preserve explicit reconciliation/refund workflow
      update orders
      set payment_status = 'Paid',
          razorpay_order_id = p_razorpay_order_id,
          razorpay_payment_id = p_razorpay_payment_id,
          razorpay_signature = p_razorpay_signature,
          notes = coalesce(notes, '') || ' [RECONCILIATION REQUIRED: Paid ₹' || v_order.total || ' post-expiration but items out of stock. Action required: Merchant must fulfill manually or initiate Razorpay refund.]',
          updated_at = now()
      where id = v_order.id;

      return jsonb_build_object(
        'ok', true,
        'idempotent', false,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', 'Cancelled',
        'payment_status', 'Paid',
        'stock_re_reserved', false,
        'alert', 'Paid post-expiration; out of stock; manual refund or restock required'
      );
    end if;
  end if;

  -- 6. Coupon validation & redemption under row lock
  if v_order.coupon_id is not null then
    select * into v_coupon
    from coupons
    where id = v_order.coupon_id
    for update;

    select exists (
      select 1 from coupon_usages
      where coupon_id = v_order.coupon_id
        and customer_id = v_order.user_id
    ) into v_coupon_already_used;

    -- If customer already redeemed or global limit was reached in the interim
    if v_coupon_already_used or (v_coupon.total_usage_limit > 0 and v_coupon.times_used >= v_coupon.total_usage_limit) then
      update orders
      set payment_status = 'Paid',
          status = 'Processing',
          razorpay_order_id = p_razorpay_order_id,
          razorpay_payment_id = p_razorpay_payment_id,
          razorpay_signature = p_razorpay_signature,
          notes = coalesce(notes, '') || ' [COUPON CONFLICT ALERT: Duplicate redemption or limit exceeded post-payment. Discount of ₹' || v_order.coupon_discount || ' was applied in error. Action required: Collect difference or adjust tax invoice]',
          updated_at = now()
      where id = v_order.id;

      return jsonb_build_object(
        'ok', true,
        'idempotent', false,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', 'Processing',
        'payment_status', 'Paid',
        'coupon_conflict', true,
        'warning', 'Duplicate coupon use flagged for merchant reconciliation'
      );
    else
      -- Legitimate coupon redemption
      insert into coupon_usages (
        coupon_id, customer_id, order_id, discount, used_at
      ) values (
        v_order.coupon_id, v_order.user_id, v_order.id, v_order.coupon_discount, now()
      )
      on conflict (coupon_id, customer_id) do nothing
      returning true into v_usage_inserted;

      if v_usage_inserted then
        update coupons
        set times_used = times_used + 1,
            updated_at = now()
        where id = v_order.coupon_id;
      end if;
    end if;
  end if;

  -- 7. Normal success transition to Paid & Processing
  update orders
  set payment_status = 'Paid',
      status = 'Processing',
      razorpay_order_id = p_razorpay_order_id,
      razorpay_payment_id = p_razorpay_payment_id,
      razorpay_signature = p_razorpay_signature,
      updated_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', 'Processing',
    'payment_status', 'Paid'
  );
end;
$$;

create or replace function record_payment_failure(
  p_order_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order record;
  v_item record;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_order.payment_status = 'Paid' then
    return jsonb_build_object('ok', false, 'error', 'Order is already marked Paid');
  end if;

  if v_order.stock_reserved then
    for v_item in select product_id, quantity from order_items where order_id = p_order_id loop
      if v_item.product_id is not null then
        update inventory
        set stock = stock + v_item.quantity,
            updated_at = now()
        where product_id = v_item.product_id;
      end if;
    end loop;
  end if;

  update orders
  set payment_status = 'Failed',
      status = 'Cancelled',
      stock_reserved = false,
      notes = coalesce(notes, '') || ' [Payment Failed: ' || coalesce(p_reason, 'Declined') || ']',
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'payment_status', 'Failed');
end;
$$;

create or replace function cancel_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order record;
  v_item record;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if not is_admin() and v_order.user_id <> auth.uid() then
    raise exception 'Unauthorized to cancel this order';
  end if;

  if v_order.status = 'Cancelled' then
    return jsonb_build_object('ok', true, 'message', 'Order is already cancelled');
  end if;

  if not is_admin() and (v_order.status <> 'Pending' or v_order.payment_status = 'Paid') then
    raise exception 'Cannot cancel order with status % and payment_status %', v_order.status, v_order.payment_status;
  end if;

  if v_order.stock_reserved then
    for v_item in select product_id, quantity from order_items where order_id = p_order_id loop
      if v_item.product_id is not null then
        update inventory
        set stock = stock + v_item.quantity,
            updated_at = now()
        where product_id = v_item.product_id;
      end if;
    end loop;
  end if;

  update orders
  set status = 'Cancelled',
      stock_reserved = false,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'status', 'Cancelled');
end;
$$;

create or replace function cleanup_expired_orders() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order record;
  v_item record;
  v_cleaned_count int := 0;
begin
  for v_order in
    select id
    from orders
    where status = 'Pending'
      and payment_status = 'Pending'
      and stock_reserved = true
      and expires_at < now()
    for update skip locked
  loop
    for v_item in select product_id, quantity from order_items where order_id = v_order.id loop
      if v_item.product_id is not null then
        update inventory
        set stock = stock + v_item.quantity,
            updated_at = now()
        where product_id = v_item.product_id;
      end if;
    end loop;

    update orders
    set status = 'Cancelled',
        stock_reserved = false,
        notes = coalesce(notes, '') || ' [Auto-cancelled: Checkout reservation expired]',
        updated_at = now()
    where id = v_order.id;

    v_cleaned_count := v_cleaned_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'cleaned_orders_count', v_cleaned_count);
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RE-ATTACH TRIGGERS SAFELY
-- ────────────────────────────────────────────────────────────────────────────

drop trigger if exists service_requests_protect on service_requests;
create trigger service_requests_protect
  before update on service_requests
  for each row execute function protect_service_request();

drop trigger if exists sell_requests_protect on sell_requests;
create trigger sell_requests_protect
  before update on sell_requests
  for each row execute function protect_sell_request();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. PRIVILEGES & SECURITY GRANTS
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Shield confidential cost_price: Grant column-level SELECT omitting cost_price
revoke all on table products from anon, authenticated, public;
grant select (
  id, sku, name, brand_id, category_id, subcategory, description,
  mrp, price, sale_price, warranty, weight, specs,
  second_hand, condition, status, created_at
) on table products to anon, authenticated;

revoke all on table inventory from anon, authenticated, public;
grant select (product_id, stock) on table inventory to anon, authenticated;

revoke all on table coupons from anon, authenticated, public;
grant select (
  id, code, description, type, value, min_order_value, max_discount,
  total_usage_limit, times_used, active, starts_at, ends_at
) on table coupons to anon, authenticated;

grant select on table coupon_usages to authenticated;

revoke all on table visitor_sessions from anon, authenticated, public;
revoke all on table visitor_events from anon, authenticated, public;
revoke all on table analytics_settings from anon, authenticated, public;

-- Cleanly reset and consolidate all RLS policies to eliminate multiple_permissive_policies and auth_rls_initplan
do $$
declare
  pol record;
begin
  for pol in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Admin-Only Tables
do $$
declare t text;
begin
  foreach t in array array[
    'import_runs','support_verifications',
    'visitor_sessions','visitor_events','analytics_settings'
  ] loop
    execute format(
      'create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Public Storefront Assets: Single SELECT policy + Admin write policies
create policy public_read on categories for select using (true);
create policy public_read on brands for select using (true);
create policy public_read on products for select using (status = 'Active' or is_admin());
create policy public_read on inventory for select using (true);
create policy public_read on coupons for select
  using ((active and (starts_at is null or now() >= starts_at) and (ends_at is null or now() <= ends_at)) or is_admin());
create policy public_read on product_images for select
  using (exists (select 1 from products p where p.id = product_id and (p.status = 'Active' or is_admin())));
create policy public_read on offers for select
  using ((active and now() between starts_at and ends_at) or is_admin());
create policy public_read on offer_products for select
  using (exists (select 1 from offers o where o.id = offer_id and (o.active and now() between o.starts_at and o.ends_at or is_admin())));
create policy public_read on offer_categories for select
  using (exists (select 1 from offers o where o.id = offer_id and (o.active and now() between o.starts_at and o.ends_at or is_admin())));
create policy public_read on offer_brands for select
  using (exists (select 1 from offers o where o.id = offer_id and (o.active and now() between o.starts_at and o.ends_at or is_admin())));
create policy public_read on it_hub_locations for select using (active or is_admin());
create policy public_read on pincode_areas for select using (true);
create policy public_read on store_settings for select using (true);
create policy public_read on pc_build_templates for select using (active or is_admin());
create policy public_read on support_categories for select using (active or is_admin());
create policy public_read on brand_support for select using (active or is_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'categories','brands','products','inventory','coupons','product_images',
    'offers','offer_products','offer_categories','offer_brands',
    'it_hub_locations','pincode_areas','store_settings','pc_build_templates',
    'support_categories','brand_support'
  ] loop
    execute format('create policy admin_insert on %I for insert to authenticated with check (is_admin())', t);
    execute format('create policy admin_update on %I for update to authenticated using (is_admin()) with check (is_admin())', t);
    execute format('create policy admin_delete on %I for delete to authenticated using (is_admin())', t);
  end loop;
end $$;

-- Customers: Consolidated policies using (select auth.uid()) InitPlan
create policy profiles_select on profiles for select to authenticated
  using (id = (select auth.uid()) or is_admin());
create policy profiles_update on profiles for update to authenticated
  using (id = (select auth.uid()) or is_admin())
  with check (id = (select auth.uid()) or is_admin());

create policy addresses_select on addresses for select to authenticated
  using (user_id = (select auth.uid()) or is_admin());
create policy addresses_insert on addresses for insert to authenticated
  with check (user_id = (select auth.uid()) or is_admin());
create policy addresses_update on addresses for update to authenticated
  using (user_id = (select auth.uid()) or is_admin())
  with check (user_id = (select auth.uid()) or is_admin());
create policy addresses_delete on addresses for delete to authenticated
  using (user_id = (select auth.uid()) or is_admin());

create policy wishlist_select on wishlist for select to authenticated
  using (user_id = (select auth.uid()) or is_admin());
create policy wishlist_insert on wishlist for insert to authenticated
  with check (user_id = (select auth.uid()) or is_admin());
create policy wishlist_delete on wishlist for delete to authenticated
  using (user_id = (select auth.uid()) or is_admin());

create policy pc_builds_select on pc_builds for select to authenticated
  using (user_id = (select auth.uid()) or is_admin());
create policy pc_builds_insert on pc_builds for insert to authenticated
  with check (user_id = (select auth.uid()) or is_admin());
create policy pc_builds_update on pc_builds for update to authenticated
  using (user_id = (select auth.uid()) or is_admin())
  with check (user_id = (select auth.uid()) or is_admin());
create policy pc_builds_delete on pc_builds for delete to authenticated
  using (user_id = (select auth.uid()) or is_admin());

create policy orders_select on orders for select to authenticated
  using (user_id = (select auth.uid()) or is_admin());
create policy admin_orders_insert on orders for insert to authenticated with check (is_admin());
create policy admin_orders_update on orders for update to authenticated using (is_admin()) with check (is_admin());
create policy admin_orders_delete on orders for delete to authenticated using (is_admin());

create policy order_items_select on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = (select auth.uid()) or is_admin())));
create policy admin_order_items_insert on order_items for insert to authenticated with check (is_admin());
create policy admin_order_items_update on order_items for update to authenticated using (is_admin()) with check (is_admin());
create policy admin_order_items_delete on order_items for delete to authenticated using (is_admin());

create policy coupon_usages_select on coupon_usages for select to authenticated
  using (customer_id = (select auth.uid()) or is_admin());
create policy admin_coupon_usages_insert on coupon_usages for insert to authenticated with check (is_admin());
create policy admin_coupon_usages_update on coupon_usages for update to authenticated using (is_admin()) with check (is_admin());
create policy admin_coupon_usages_delete on coupon_usages for delete to authenticated using (is_admin());

create policy reviews_select on reviews for select
  using (status = 'Published' or user_id = (select auth.uid()) or is_admin());
create policy reviews_insert on reviews for insert to authenticated
  with check ((user_id = (select auth.uid()) and status = 'Pending') or is_admin());
create policy reviews_update on reviews for update to authenticated
  using (user_id = (select auth.uid()) or is_admin())
  with check ((user_id = (select auth.uid()) and status = 'Pending') or is_admin());
create policy reviews_delete on reviews for delete to authenticated
  using (user_id = (select auth.uid()) or is_admin());

create policy service_requests_select on service_requests for select to authenticated
  using (user_id = (select auth.uid()) or is_admin());
create policy service_requests_insert on service_requests for insert to authenticated
  with check (user_id = (select auth.uid()) or is_admin());
create policy service_requests_update on service_requests for update to authenticated
  using (user_id = (select auth.uid()) or is_admin())
  with check (user_id = (select auth.uid()) or is_admin());
create policy admin_service_requests_delete on service_requests for delete to authenticated
  using (is_admin());

create policy warranty_checks_select on warranty_checks for select to authenticated
  using (user_id = (select auth.uid()) or is_admin());
create policy warranty_checks_insert on warranty_checks for insert
  with check (user_id is null or user_id = (select auth.uid()) or is_admin());
create policy admin_warranty_checks_delete on warranty_checks for delete to authenticated
  using (is_admin());

create policy sell_requests_select on sell_requests for select to authenticated
  using (customer_id = (select auth.uid()) or is_admin());
create policy sell_requests_insert on sell_requests for insert to authenticated
  with check (customer_id = (select auth.uid()) or is_admin());
create policy sell_requests_update on sell_requests for update to authenticated
  using (customer_id = (select auth.uid()) or is_admin())
  with check ((customer_id = (select auth.uid()) and status = 'Pending') or is_admin());
create policy admin_sell_requests_delete on sell_requests for delete to authenticated
  using (is_admin());

create policy sell_request_images_select on sell_request_images for select to authenticated
  using (exists (select 1 from sell_requests sr where sr.id = sell_request_id and (sr.customer_id = (select auth.uid()) or is_admin())));
create policy sell_request_images_insert on sell_request_images for insert to authenticated
  with check (exists (select 1 from sell_requests sr where sr.id = sell_request_id and ((sr.customer_id = (select auth.uid()) and sr.status = 'Pending') or is_admin())));
create policy sell_request_images_delete on sell_request_images for delete to authenticated
  using (exists (select 1 from sell_requests sr where sr.id = sell_request_id and ((sr.customer_id = (select auth.uid()) and sr.status = 'Pending') or is_admin())));

create policy sell_request_documents_select on sell_request_documents for select to authenticated
  using (exists (select 1 from sell_requests sr where sr.id = sell_request_id and (sr.customer_id = (select auth.uid()) or is_admin())));
create policy sell_request_documents_insert on sell_request_documents for insert to authenticated
  with check (exists (select 1 from sell_requests sr where sr.id = sell_request_id and ((sr.customer_id = (select auth.uid()) and sr.status = 'Pending') or is_admin())));
create policy admin_sell_docs_delete on sell_request_documents for delete to authenticated
  using (is_admin());

grant select on products_public to anon, authenticated;
grant select on live_offers to anon, authenticated;
grant select on public_coupons to anon, authenticated;

-- is_admin only needed by authenticated users (anon can never be admin)
revoke all on function is_admin from public, anon;
grant execute on function is_admin to authenticated;

revoke all on function check_onsite_warranty from public;
grant execute on function check_onsite_warranty to anon, authenticated;

revoke all on function validate_coupon from public;
grant execute on function validate_coupon to anon, authenticated;

revoke all on function create_order from public;
grant execute on function create_order to authenticated;

revoke all on function cancel_order from public;
grant execute on function cancel_order to authenticated;

revoke all on function ensure_profile from public, anon;
grant execute on function ensure_profile to authenticated;

revoke all on function log_visitor_event from public;
grant execute on function log_visitor_event to anon, authenticated;

revoke all on function attach_razorpay_order_id from public, anon, authenticated;
grant execute on function attach_razorpay_order_id to service_role;

revoke all on function record_order_payment from public, anon, authenticated;
grant execute on function record_order_payment to service_role;

revoke all on function record_payment_failure from public, anon, authenticated;
grant execute on function record_payment_failure to service_role;

revoke all on function cleanup_expired_orders from public, anon, authenticated;
grant execute on function cleanup_expired_orders to service_role;

revoke all on function purge_visitor_data from public, anon, authenticated;
grant execute on function purge_visitor_data to service_role;

-- Revoke direct public execution on internal trigger functions and helpers
revoke all on function mask_ip_address from public, anon, authenticated;
revoke all on function handle_updated_at from public, anon, authenticated;
revoke all on function handle_new_user from public, anon, authenticated;
revoke all on function protect_role from public, anon, authenticated;
revoke all on function protect_service_request from public, anon, authenticated;
revoke all on function protect_sell_request from public, anon, authenticated;

-- Revoke rogue or legacy utility functions flagged by database linter
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable') then
    execute 'revoke all on function rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. PERFORMANCE INDEXES
-- ────────────────────────────────────────────────────────────────────────────

create index if not exists orders_expires_reserved_idx
  on orders (expires_at) where status = 'Pending' and stock_reserved = true;

-- Foreign key indexes (accelerates joins and parent record deletions)
create index if not exists categories_parent_idx on categories (parent_id);
create index if not exists orders_address_idx on orders (address_id);
create index if not exists orders_coupon_idx on orders (coupon_id);
create index if not exists order_items_offer_idx on order_items (offer_id);
create index if not exists service_requests_address_idx on service_requests (address_id);
create index if not exists warranty_checks_location_idx on warranty_checks (location_id);
create index if not exists offer_products_product_idx on offer_products (product_id);
create index if not exists offer_categories_category_idx on offer_categories (category_id);
create index if not exists offer_brands_brand_idx on offer_brands (brand_id);
create index if not exists wishlist_product_idx on wishlist (product_id);
create index if not exists coupons_created_by_idx on coupons (created_by);
create index if not exists import_runs_created_by_idx on import_runs (created_by);
drop index if exists brand_support_category_fk_idx;
create index if not exists brand_support_verified_by_idx on brand_support (verified_by);
create index if not exists support_verifications_brand_support_idx on support_verifications (brand_support_id);
create index if not exists support_verifications_verified_by_idx on support_verifications (verified_by);
create index if not exists visitor_sessions_user_idx on visitor_sessions (user_id);
create index if not exists visitor_events_user_idx on visitor_events (user_id);

-- Lightweight database health check RPC for connectivity monitoring (security_invoker)
create or replace function health_check() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'status', 'ok',
    'timestamp', extract(epoch from now())::bigint
  );
$$;

revoke all on function health_check() from public;
grant execute on function health_check() to anon, authenticated, service_role;

commit;

-- ============================================================================
-- ROLLBACK & RECOVERY GUIDELINES
-- In the event that this migration needs to be rolled back before commit:
--   The transaction automatically rolls back.
-- If rolled back after commit on an operational database:
--   1. Columns mrp, second_hand, condition, expires_at, stock_reserved are backward-compatible.
--   2. To revert view: DROP VIEW products_public; and re-create without mrp/second_hand.
--   3. Functions can be re-pointed to earlier definitions via their respective CREATE OR REPLACE statements.
-- ============================================================================
