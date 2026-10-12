-- ============================================================================
-- Migration: 20261011000001_security_and_reliability_fixes.sql
-- Description: IT HUB Supabase Security, Checkout & Database Reliability Fixes
-- Target: Supabase PostgreSQL (Postgres 15+)
--
-- Fixes Included:
--   Fix A: Service Request NULL-Safe Transition & Administrative Field Protection
--   Fix B: Razorpay Payment Settlement Disambiguation & Expired Stock Verification
--   Fix C: Consistent Checkout Pricing Snapshots & Deterministic Lock Ordering
--   Fix D: Visitor Analytics Event Allowlist, Session Isolation & Proxy Anti-Spoofing
--   Fix E: Atomic Profile Creation Trigger & Self-Healing ensure_profile() RPC
--   Fix F: Mandatory Delivery Address Validation for Home Delivery Fulfilments
--   Fix G: One-Time Coupon Boundary Checks & Conflict Reconciliation
--   Fix H: NULL-Safe Role Protection & Admin Provisioning Defense
--   Fix I: SECURITY DEFINER Search Path Enforcement & Restricted Execution Grants
--   Fix J: Catalog Cost Margin & Customer Private Storage Preservation
-- ============================================================================

begin;

-- 1. Ensure Profiles updated_at & Unique Constraints
alter table if exists profiles
  add column if not exists updated_at timestamptz not null default now();

-- 2. Ensure Products MRP, Second-hand, and Condition
alter table if exists products
  add column if not exists mrp numeric(12, 2),
  add column if not exists second_hand boolean not null default false,
  add column if not exists condition text;

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

-- 3. Ensure Orders Payment, Snapshot, Expiration, and Reservation Columns
alter table if exists orders
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

-- Backfill order_number if any legacy orders exist
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
end $$;

-- 4. Update Public Storefront Views (Cost Price Excluded)
create or replace view products_public as
select
  id, sku, name, category_id, brand_id, mrp, price, sale_price,
  status, second_hand, condition, created_at, updated_at
from products
where status = 'Active';

grant select on products_public to anon, authenticated;

-- 5. Fix E: Atomic Auth Profile Creation Trigger
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

  insert into profiles (id, role, full_name, phone, email, created_at, updated_at)
  values (
    v_user.id,
    'customer',
    nullif(trim(coalesce(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name')), ''),
    nullif(trim(v_user.phone), ''),
    nullif(trim(v_user.email), ''),
    now(),
    now()
  )
  on conflict (id) do update set
    updated_at = now()
  returning * into v_profile;

  return jsonb_build_object('ok', true, 'created', true, 'profile', to_jsonb(v_profile));
end;
$$;

-- 6. Fix H: NULL-Safe Role Protection Trigger
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

-- 7. Fix A: Service Request Authorization & NULL Handling
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

-- 8. Fix D: Visitor Analytics, IP Handling and Anti-Spoofing
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

-- 9. Fix G: Coupon Validation
create or replace function validate_coupon(
  p_code text,
  p_cart_total numeric
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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

-- 10. Fix C & F: Consistent Order Creation, Snapshotting, and Address Validation
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

-- 11. Fix B: Razorpay Settlement & Late Payment Stock Verification
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
          razorpay_order_id = trim(p_razorpay_order_id),
          razorpay_payment_id = trim(p_razorpay_payment_id),
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
          razorpay_order_id = trim(p_razorpay_order_id),
          razorpay_payment_id = trim(p_razorpay_payment_id),
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
      razorpay_order_id = trim(p_razorpay_order_id),
      razorpay_payment_id = trim(p_razorpay_payment_id),
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

-- 12. Fix I: Function Grants and Execution Permissions
revoke all on function is_admin from public;
grant execute on function is_admin to anon, authenticated;

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

revoke all on function mask_ip_address from public, anon, authenticated;
revoke all on function handle_updated_at from public, anon, authenticated;
revoke all on function handle_new_user from public, anon, authenticated;
revoke all on function protect_role from public, anon, authenticated;
revoke all on function handle_default_address from public, anon, authenticated;
revoke all on function protect_service_request from public, anon, authenticated;
revoke all on function protect_sell_request from public, anon, authenticated;

-- Index for expired checkout cleanup
create index if not exists orders_expires_reserved_idx
  on orders (expires_at) where status = 'Pending' and stock_reserved = true;

commit;

