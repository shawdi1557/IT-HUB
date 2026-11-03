-- Fixed empty search path and fully qualified names for functions whose logic doesn't change.
-- With an unqualified name, an object placed earlier on the search path could be resolved instead.

CREATE OR REPLACE FUNCTION public.attach_razorpay_order_id(p_order_id uuid, p_razorpay_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
begin
  if p_order_id is null or p_razorpay_order_id is null or trim(p_razorpay_order_id) = '' then
    raise exception 'order_id and razorpay_order_id are required';
  end if;

  select * into v_order
  from public.orders
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

  update public.orders
  set razorpay_order_id = trim(p_razorpay_order_id),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'razorpay_order_id', trim(p_razorpay_order_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_distributed_rate_limit(p_ip_hash text, p_endpoint text, p_max_requests integer DEFAULT 5, p_window_seconds integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := now();
  v_count integer;
  v_window_start timestamptz;
begin
  select request_count, window_start into v_count, v_window_start
  from public.rate_limits
  where ip_hash = p_ip_hash and endpoint = p_endpoint
  for update;

  if not found then
    insert into public.rate_limits (ip_hash, endpoint, request_count, window_start)
    values (p_ip_hash, p_endpoint, 1, v_now);
    return true;
  end if;

  -- Check if current window has expired
  if v_now - v_window_start > (p_window_seconds || ' seconds')::interval then
    update public.rate_limits
    set request_count = 1,
        window_start = v_now
    where ip_hash = p_ip_hash and endpoint = p_endpoint;
    return true;
  end if;

  -- Window is still active: check request threshold
  if v_count >= p_max_requests then
    return false; -- Rate limit exceeded
  end if;

  -- Increment count
  update public.rate_limits
  set request_count = request_count + 1
  where ip_hash = p_ip_hash and endpoint = p_endpoint;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_onsite_warranty(p_pincode text)
 RETURNS TABLE(eligible boolean, location_id uuid, area text, approx_distance_km numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select d.km <= l.service_radius_km, l.id, a.area, round(d.km::numeric, 1)
  from public.pincode_areas a
  cross join lateral (
    select l.*, 6371 * 2 * asin(sqrt(
      power(sin(radians(l.latitude - a.latitude) / 2), 2) +
      cos(radians(a.latitude)) * cos(radians(l.latitude)) *
      power(sin(radians(l.longitude - a.longitude) / 2), 2))) as km
    from public.it_hub_locations l where l.active
    order by km limit 1
  ) l
  cross join lateral (select l.km) d
  where a.pincode = p_pincode;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_item record;
  v_cleaned_count int := 0;
begin
  for v_order in
    select id
    from public.orders
    where status = 'Pending'
      and payment_status = 'Pending'
      and stock_reserved = true
      and expires_at < now()
    for update skip locked
  loop
    for v_item in select product_id, quantity from public.order_items where order_id = v_order.id loop
      if v_item.product_id is not null then
        update public.inventory
        set stock = stock + v_item.quantity,
            updated_at = now()
        where product_id = v_item.product_id;
      end if;
    end loop;

    update public.orders
    set status = 'Cancelled',
        stock_reserved = false,
        notes = coalesce(notes, '') || ' [Auto-cancelled: Checkout reservation expired]',
        updated_at = now()
    where id = v_order.id;

    v_cleaned_count := v_cleaned_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'cleaned_orders_count', v_cleaned_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_order(p_items jsonb, p_address_id uuid DEFAULT NULL::uuid, p_delivery_method text DEFAULT 'Kerala delivery'::text, p_payment_method text DEFAULT 'Razorpay'::text, p_coupon_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if not exists (select 1 from public.addresses where id = p_address_id and user_id = v_user_id) then
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
    from public.products p
    join public.inventory i on i.product_id = p.id
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
    update public.inventory
    set stock = stock - v_item_qty,
        updated_at = now()
    where product_id = v_item_pid;
  end loop;

  -- 3. Validate coupon if provided
  if p_coupon_code is not null and trim(p_coupon_code) <> '' then
    select * into v_coupon
    from public.coupons
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

    if exists (select 1 from public.coupon_usages where coupon_id = v_coupon.id and customer_id = v_user_id) then
      raise exception 'You have already redeemed coupon "%"', v_coupon.code;
    end if;

    -- Prevent customer from holding multiple concurrent pending checkouts with the same one-time coupon
    if exists (
      select 1 from public.orders
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
  insert into public.orders (
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
    insert into public.order_items (
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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'Security Violation: Audit log entries are immutable and cannot be updated or deleted.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_user record;
  v_profile record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required to ensure profile';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;
  if found then
    return jsonb_build_object('ok', true, 'created', false, 'profile', to_jsonb(v_profile));
  end if;

  select * into v_user from auth.users where id = v_user_id;
  if not found then
    raise exception 'Authenticated user record not found';
  end if;

  insert into public.profiles (id, role, full_name, phone, email, address, created_at, updated_at)
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
$function$;

CREATE OR REPLACE FUNCTION public.generate_ticket_reference()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_bytes bytea;
  v_code text := '';
  v_idx integer;
  v_candidate text;
  v_attempts integer := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    v_code := '';
    v_bytes := extensions.gen_random_bytes(8);
    for i in 0..7 loop
      v_idx := (get_byte(v_bytes, i) % 36);
      v_code := v_code || substr(v_chars, v_idx + 1, 1);
    end loop;
    v_candidate := 'ITH-SER-' || v_code;

    -- Ensure candidate is collision-free
    if not exists (select 1 from public.service_requests where ticket_reference = v_candidate) then
      return v_candidate;
    end if;

    if v_attempts > 25 then
      -- Deterministic fallback to avoid infinite loop under theoretical collision load
      return 'ITH-SER-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_portal_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'can_manage_staff', public.can_manage_staff()
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_default_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.is_default then
    update public.addresses
    set is_default = false
    where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phone text;
  v_email text;
  v_full_name text;
  v_address text;
begin
  v_phone := nullif(trim(new.phone), '');
  v_email := nullif(trim(new.email), '');
  v_full_name := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name'
  )), '');
  v_address := nullif(trim(coalesce(
    new.raw_user_meta_data->>'address',
    ''
  )), '');

  -- Pre-validate unique phone to prevent orphaned auth.users records on constraint failure
  if v_phone is not null and exists (select 1 from public.profiles where phone = v_phone and id <> new.id) then
    raise exception 'Phone number % is already registered to another account', v_phone;
  end if;

  insert into public.profiles (id, role, full_name, phone, email, address, created_at, updated_at)
  values (new.id, 'customer', v_full_name, v_phone, v_email, v_address, now(), now())
  on conflict (id) do update set
    email = coalesce(excluded.email, profiles.email),
    phone = coalesce(excluded.phone, profiles.phone),
    full_name = coalesce(excluded.full_name, profiles.full_name),
    address = coalesce(excluded.address, profiles.address),
    updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.health_check()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'status', 'ok',
    'timestamp', extract(epoch from now())::bigint
  );
$function$;

CREATE OR REPLACE FUNCTION public.log_visitor_event(p_session_id uuid, p_visitor_id text, p_event_type text, p_path text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb, p_device text DEFAULT NULL::text, p_os text DEFAULT NULL::text, p_browser text DEFAULT NULL::text, p_referrer text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_isp text DEFAULT NULL::text, p_returning boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.analytics_settings;
  v_session record;
  v_raw_header text;
  v_raw_ip text;
  v_ip inet;
begin
  select * into s from public.analytics_settings where id;
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
    if p_event_type in ('Admin Login', 'Admin Data Change') and public.is_admin() then
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
  select * into v_session from public.visitor_sessions where id = p_session_id;
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
            v_ip := public.mask_ip_address(v_ip);
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
  insert into public.visitor_sessions as vs (
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
  insert into public.visitor_events (
    session_id, user_id, event_type, path, meta
  ) values (
    p_session_id,
    auth.uid(),
    left(p_event_type, 64),
    left(p_path, 500),
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.mask_ip_address(p_ip inet)
 RETURNS inet
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_ip is null then
    return null;
  end if;
  if family(p_ip) = 4 then
    -- IPv4: Zero last octet (e.g. 103.21.244.15 -> 103.21.244.0)
    return host(network(set_masklen(p_ip, 24)))::inet;
  elsif family(p_ip) = 6 then
    -- IPv6: Retain only 48-bit prefix
    return host(network(set_masklen(p_ip, 48)))::inet;
  end if;
  return p_ip;
exception when others then
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_customer_on_service_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.purge_visitor_data()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_retention integer;
  removed integer := 0;
begin
  select retention_days into v_retention from public.analytics_settings where id limit 1;
  v_retention := coalesce(v_retention, 90);

  delete from public.visitor_sessions
  where last_seen < now() - make_interval(days => v_retention);

  get diagnostics removed = row_count;
  return removed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_order_payment(p_order_id uuid, p_razorpay_order_id text, p_razorpay_payment_id text, p_razorpay_signature text, p_amount_paid numeric, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    from public.orders
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
    from public.orders
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
      from public.order_items
      where order_id = v_order.id and product_id is not null
      order by product_id asc
    loop
      select stock into v_current_stock
      from public.inventory
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
        from public.order_items
        where order_id = v_order.id and product_id is not null
        order by product_id asc
      loop
        update public.inventory
        set stock = stock - v_item.quantity,
            updated_at = now()
        where product_id = v_item.product_id;
      end loop;

      update public.orders
      set stock_reserved = true,
          status = 'Processing',
          notes = coalesce(notes, '') || ' [Stock re-reserved successfully upon late payment confirmation]'
      where id = v_order.id;
    else
      -- Stock unavailable: Preserve explicit reconciliation/refund workflow
      update public.orders
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
    from public.coupons
    where id = v_order.coupon_id
    for update;

    select exists (
      select 1 from public.coupon_usages
      where coupon_id = v_order.coupon_id
        and customer_id = v_order.user_id
    ) into v_coupon_already_used;

    -- If customer already redeemed or global limit was reached in the interim
    if v_coupon_already_used or (v_coupon.total_usage_limit > 0 and v_coupon.times_used >= v_coupon.total_usage_limit) then
      update public.orders
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
      insert into public.coupon_usages (
        coupon_id, customer_id, order_id, discount, used_at
      ) values (
        v_order.coupon_id, v_order.user_id, v_order.id, v_order.coupon_discount, now()
      )
      on conflict (coupon_id, customer_id) do nothing
      returning true into v_usage_inserted;

      if v_usage_inserted then
        update public.coupons
        set times_used = times_used + 1,
            updated_at = now()
        where id = v_order.coupon_id;
      end if;
    end if;
  end if;

  -- 7. Normal success transition to Paid & Processing
  update public.orders
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
$function$;

CREATE OR REPLACE FUNCTION public.record_payment_failure(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_item record;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_order.payment_status = 'Paid' then
    return jsonb_build_object('ok', false, 'error', 'Order is already marked Paid');
  end if;

  -- Release stock reservation if held
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
  set payment_status = 'Failed',
      status = 'Cancelled',
      stock_reserved = false,
      notes = coalesce(notes, '') || ' [Payment Failed: ' || coalesce(p_reason, 'Declined') || ']',
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'payment_status', 'Failed');
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_product_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.inventory (product_id, stock, low_stock_threshold)
  values (new.id, 0, 3)
  on conflict (product_id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_coupon(p_code text, p_cart_total numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.coupons;
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
  from public.coupons
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
      select 1 from public.coupon_usages
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
$function$;

CREATE OR REPLACE FUNCTION public.validate_service_booking(p_device text, p_model text, p_problem text, p_method text, p_pincode text DEFAULT NULL::text, p_date date DEFAULT NULL::date, p_slot text DEFAULT NULL::text, p_directions text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_day_of_week integer;
  v_clean_pin text := trim(coalesce(p_pincode, ''));
  v_clean_device text := trim(coalesce(p_device, ''));
  v_clean_model text := trim(coalesce(p_model, ''));
  v_clean_problem text := trim(coalesce(p_problem, ''));
  v_clean_method text := trim(coalesce(p_method, ''));
  v_clean_directions text := trim(coalesce(p_directions, ''));
  -- Authoritative doorstep pins (excluding 686693 Neendapara)
  v_doorstep_pins text[] := array['686691', '686666', '686671', '686692', '686668', '686661', '686681'];
begin
  -- 1. Device category validation
  if v_clean_device = '' then
    return jsonb_build_object('valid', false, 'error', 'Device type is required.');
  end if;

  -- 2. Device brand and model is mandatory for ALL service methods
  if v_clean_model = '' then
    return jsonb_build_object('valid', false, 'error', 'Device Brand & Model / Device Name is required.');
  end if;

  -- 3. Problem description is mandatory and cannot be empty or whitespace-only
  if v_clean_problem = '' then
    return jsonb_build_object('valid', false, 'error', 'Please select the issue you''re experiencing before continuing.');
  end if;

  -- 3b. If "Other" is selected, require custom description
  if lower(v_clean_problem) = 'other' then
    return jsonb_build_object('valid', false, 'error', 'Please describe the issue you''re experiencing before continuing.');
  end if;

  -- 4. Service method validation
  if v_clean_method not in ('Visit IT HUB', 'Courier to IT HUB', 'On-site service') then
    return jsonb_build_object('valid', false, 'error', 'Invalid service method selected.');
  end if;

  -- 5. Doorstep specific checks
  if v_clean_method = 'On-site service' then
    if v_clean_pin = '' then
      return jsonb_build_object('valid', false, 'error', 'PIN code is required for doorstep technician visit.');
    end if;

    -- Explicitly reject 686693 Neendapara
    if v_clean_pin = '686693' then
      return jsonb_build_object(
        'valid', false,
        'error', 'Doorstep technician service is currently unavailable for PIN 686693 (Neendapara). Please select Direct Store Walk-In or Insured Courier Pickup & Return.'
      );
    end if;

    if not (v_clean_pin = any(v_doorstep_pins)) then
      return jsonb_build_object(
        'valid', false,
        'error', 'Doorstep technician visit is limited to ~15 km around Kothamangalam. Please choose Direct Store Walk-In or Courier to IT HUB.'
      );
    end if;

    -- Landmark / Directions is mandatory for doorstep
    if v_clean_directions = '' then
      return jsonb_build_object('valid', false, 'error', 'Landmark / Directions is required for doorstep technician visit.');
    end if;
  end if;

  -- 6. Courier specific checks
  if v_clean_method = 'Courier to IT HUB' then
    if v_clean_pin = '' then
      return jsonb_build_object('valid', false, 'error', 'PIN code is required for courier return address.');
    end if;

    if not (v_clean_pin ~ '^(67|68|69)[0-9]{4}$') then
      return jsonb_build_object(
        'valid', false,
        'error', 'Insured courier return delivery is available across all Kerala districts (PIN codes starting with 67, 68, or 69).'
      );
    end if;
  end if;

  -- 7. Appointment date & time checks (Walk-in & Doorstep ONLY)
  if v_clean_method in ('Visit IT HUB', 'On-site service') and p_date is not null then
    if p_date < v_today then
      return jsonb_build_object('valid', false, 'error', 'Appointment date cannot be in the past.');
    end if;

    v_day_of_week := extract(dow from p_date);
    if v_day_of_week = 0 then
      return jsonb_build_object('valid', false, 'error', 'Appointments cannot be booked on Sunday. IT HUB is strictly closed.');
    end if;

    if p_slot is not null and p_slot != '' then
      if p_slot not in (
        '10:00 – 12:00', '12:00 – 14:00', '14:00 – 16:00', '16:00 – 18:00', '18:00 – 19:30',
        '10:00 AM – 12:00 PM', '12:00 PM – 2:00 PM', '2:00 PM – 4:00 PM', '4:00 PM – 6:00 PM', '6:00 PM – 7:30 PM'
      ) then
        return jsonb_build_object('valid', false, 'error', 'Invalid appointment time slot.');
      end if;
    end if;
  end if;

  return jsonb_build_object('valid', true);
end;
$function$;
