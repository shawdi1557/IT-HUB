-- ============================================================================
-- IT HUB — Supabase / PostgreSQL Canonical Production Database Schema
-- Roles: 'admin', 'customer', 'anon' (unauthenticated), 'service_role' (trusted backend)
-- Architecture: Database-Level Row Level Security (RLS), Strict Triggers & Security Definer RPCs
-- Target Environment: Supabase PostgreSQL 15+ (Fresh Installation Compatible)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ENUMS & APPLICATION TYPES
-- ────────────────────────────────────────────────────────────────────────────

create type app_role as enum ('admin', 'customer');
create type product_status as enum ('Active', 'Draft', 'Archived');
create type offer_type as enum (
  'Product Offer',
  'Category Offer',
  'Brand Offer',
  'Seasonal Offer',
  'Flash Sale'
);
create type order_status as enum (
  'Pending',
  'Processing',
  'Shipped',
  'Delivered',
  'Cancelled'
);
create type coupon_type as enum ('percentage', 'fixed');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PROFILES, AUTH & ADMINISTRATIVE CONTROLS
-- ────────────────────────────────────────────────────────────────────────────

-- Profiles table linked 1:1 with Supabase Auth (auth.users)
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null default 'customer',
  full_name text,
  phone text unique check (phone is null or phone ~ '^\+?[0-9]{10,15}$'), -- E.164 / Indian mobile format
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Core helper used by all administrative RLS policies.
-- Declared SECURITY DEFINER and fixed search_path to avoid RLS recursion and search_path poisoning.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Global trigger helper for updated_at timestamps
create or replace function handle_updated_at() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- New auth users always start as customers; admin role cannot be self-assigned.
-- Sanitizes empty strings to NULL to avoid unique constraint collisions on phone/email.
-- Pre-validates phone uniqueness to ensure account creation transactions remain atomic and rollback on error.
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

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

-- Customers cannot promote themselves or alter roles.
-- Enforces NULL-safe comparisons and restricts non-admin creation strictly to customer role.
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

create trigger profiles_protect_role
  before insert or update on profiles
  for each row execute function protect_role();

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function handle_updated_at();

-- Safe First-Administrator Bootstrap RPC.
-- Executable exclusively by service_role (trusted backend) or direct superuser.
-- Guarantees the initial administrator can only be claimed if no administrator currently exists.
create or replace function bootstrap_first_admin(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin_exists boolean;
  v_target_profile record;
begin
  if p_user_id is null then
    raise exception 'Target user ID is required for initial bootstrap';
  end if;

  select exists (select 1 from profiles where role = 'admin') into v_admin_exists;
  if v_admin_exists then
    raise exception 'Initial administrator already exists. Further role assignments require an active administrator.';
  end if;

  select * into v_target_profile from profiles where id = p_user_id;
  if not found then
    raise exception 'Profile % does not exist. The user must sign up before being promoted.', p_user_id;
  end if;

  update profiles
  set role = 'admin',
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'role', 'admin');
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CATALOG & INVENTORY
-- ────────────────────────────────────────────────────────────────────────────

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  parent_id uuid references categories (id) on delete set null,
  created_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Master products table (Contains confidential cost_price; public client access revoked)
-- Pricing model:
--   mrp: Maximum Retail Price (displayed publicly, strike-through)
--   price: Regular selling price (must be > 0 and <= mrp when mrp is set)
--   sale_price: Optional promotional price (must be <= price)
--   cost_price: Internal procurement cost (admin only)
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  brand_id uuid references brands (id) on delete set null,
  category_id uuid references categories (id) on delete set null,
  subcategory text,
  description text,
  mrp numeric(12, 2) check (mrp is null or mrp >= price),               -- Stated MRP (public)
  price numeric(12, 2) not null check (price > 0),                     -- Regular selling price
  sale_price numeric(12, 2) check (sale_price is null or (sale_price > 0 and sale_price <= price)), -- Promotional price
  cost_price numeric(12, 2) check (cost_price is null or cost_price >= 0), -- CONFIDENTIAL (admin only)
  warranty text,
  weight text,
  specs jsonb not null default '{}'::jsonb,
  second_hand boolean not null default false,
  condition text check (condition is null or condition in ('New', 'Like New', 'Good', 'Fair', 'For Parts')),
  status product_status not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger products_set_updated_at
  before update on products
  for each row execute function handle_updated_at();

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  storage_path text not null,         -- Supabase Storage object key in 'product-images'
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table inventory (
  product_id uuid primary key references products (id) on delete cascade,
  stock int not null default 0 check (stock >= 0),
  low_stock_threshold int not null default 3 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);

create trigger inventory_set_updated_at
  before update on inventory
  for each row execute function handle_updated_at();

-- Auto-initialize inventory record when a new product is added to the catalog
create or replace function sync_product_inventory() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into inventory (product_id, stock, low_stock_threshold)
  values (new.id, 0, 3)
  on conflict (product_id) do nothing;
  return new;
end;
$$;

create trigger on_product_created_init_inventory
  after insert on products
  for each row execute function sync_product_inventory();

-- Safe public storefront catalog view.
-- Exposes active fresh and second-hand items with live stock and MRP while completely shielding cost_price.
-- Runs with security_barrier and view owner privileges (security_invoker = false) so public
-- clients never need direct SELECT permissions on the raw products table.
create or replace view products_public as
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

alter view products_public set (security_barrier = true);

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  rows_found int not null check (rows_found >= 0),
  created int not null default 0 check (created >= 0),
  updated int not null default 0 check (updated >= 0),
  skipped int not null default 0 check (skipped >= 0),
  failed int not null default 0 check (failed >= 0),
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. OFFERS & PROMOTIONS
-- ────────────────────────────────────────────────────────────────────────────

create table offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type offer_type not null,
  discount_percent numeric(5, 2) check (discount_percent between 0 and 90),
  discount_amount numeric(12, 2) check (discount_amount >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  banner_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(discount_percent, 0) > 0 or coalesce(discount_amount, 0) > 0)
);

create trigger offers_set_updated_at
  before update on offers
  for each row execute function handle_updated_at();

create table offer_products (
  offer_id uuid not null references offers (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  primary key (offer_id, product_id)
);

create table offer_categories (
  offer_id uuid not null references offers (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  primary key (offer_id, category_id)
);

create table offer_brands (
  offer_id uuid not null references offers (id) on delete cascade,
  brand_id uuid not null references brands (id) on delete cascade,
  primary key (offer_id, brand_id)
);

-- Public view for active offers currently within their validity window
create or replace view live_offers as
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

alter view live_offers set (security_barrier = true);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. CUSTOMER ADDRESSES & WISHLISTS
-- ────────────────────────────────────────────────────────────────────────────

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  label text,
  line1 text not null,
  city text not null,
  state text not null default 'Kerala',
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Ensures at most one default address per customer
create or replace function handle_default_address() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_default then
    update addresses
    set is_default = false
    where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

create trigger addresses_set_default
  before insert or update on addresses
  for each row execute function handle_default_address();

create table wishlist (
  user_id uuid not null references profiles (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. COUPONS & USAGE (ONE SUCCESSFUL REDEMPTION PER CUSTOMER)
-- ────────────────────────────────────────────────────────────────────────────

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  type coupon_type not null,
  value numeric(10, 2) not null check (value > 0),
  min_order_value numeric(12, 2) not null default 0 check (min_order_value >= 0),
  max_discount numeric(12, 2) check (max_discount is null or max_discount >= 0),
  total_usage_limit int not null default 0 check (total_usage_limit >= 0), -- 0 = unlimited across all customers
  times_used int not null default 0 check (times_used >= 0),
  active boolean not null default true,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_format check (code ~ '^[A-Za-z0-9_-]{3,30}$'),
  constraint coupons_percent_cap check (type <> 'percentage' or value <= 90)
);

create trigger coupons_set_updated_at
  before update on coupons
  for each row execute function handle_updated_at();

-- Case-insensitive uniqueness for coupon codes
create unique index coupons_code_upper_idx on coupons (upper(code));

-- Public safe view for active storefront promotional coupons (masks internal administrative columns)
create or replace view public_coupons as
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

alter view public_coupons set (security_barrier = true);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. ORDERS, ORDER ITEMS & SECURE SETTLEMENT FIELDS
-- ────────────────────────────────────────────────────────────────────────────

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references profiles (id),
  address_id uuid references addresses (id) on delete set null,
  status order_status not null default 'Pending',
  payment_status text not null default 'Pending'
    check (payment_status in ('Pending', 'Paid', 'Failed', 'Refunded')),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  offer_savings numeric(12, 2) not null default 0 check (offer_savings >= 0),
  coupon_id uuid references coupons (id) on delete set null,
  coupon_discount numeric(12, 2) not null default 0 check (coupon_discount >= 0),
  shipping_fee numeric(12, 2) not null default 0 check (shipping_fee >= 0),
  total numeric(12, 2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('Razorpay', 'Cash on Delivery')),
  delivery_method text not null check (delivery_method in ('Store pickup', 'Kerala delivery', 'Standard delivery')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  razorpay_signature text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  stock_reserved boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function handle_updated_at();

-- Preserves immutable historical item price snapshots
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  pc_build_id uuid,
  name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  offer_id uuid references offers (id) on delete set null,
  quantity int not null check (quantity > 0)
);

-- Records one successful coupon redemption per customer per coupon.
-- Direct customer inserts are strictly prohibited. Recorded only upon completed payment.
create table coupon_usages (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons (id) on delete cascade,
  customer_id uuid not null references profiles (id) on delete cascade,
  order_id uuid references orders (id) on delete cascade,
  discount numeric(12, 2) not null check (discount >= 0),
  used_at timestamptz not null default now(),
  constraint coupon_usages_customer_unique unique (coupon_id, customer_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. REVIEWS & COMMUNITY RATINGS
-- ────────────────────────────────────────────────────────────────────────────

create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text,
  status text not null default 'Pending' check (status in ('Pending', 'Published', 'Hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create trigger reviews_set_updated_at
  before update on reviews
  for each row execute function handle_updated_at();

-- Enforces that customers cannot publish reviews directly; reviews require administrator moderation.
create or replace function protect_review() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    if tg_op = 'INSERT' then
      if new.user_id is distinct from auth.uid() then
        raise exception 'Unauthorized: Review must belong to authenticated user';
      end if;
      if new.status is distinct from 'Pending' then
        raise exception 'Unauthorized: New reviews must start in Pending moderation status';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id or new.id is distinct from old.id or new.product_id is distinct from old.product_id then
        raise exception 'Unauthorized: Review identity and product association are immutable';
      end if;
      if new.status is distinct from 'Pending' and not is_admin() then
        raise exception 'Unauthorized: Only administrators can publish or hide reviews';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger reviews_protect
  before insert or update on reviews
  for each row execute function protect_review();

-- ────────────────────────────────────────────────────────────────────────────
-- 9. SERVICES, LOCATIONS & ON-SITE WARRANTY
-- ────────────────────────────────────────────────────────────────────────────

create table it_hub_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  pincode text not null,
  latitude double precision not null,
  longitude double precision not null,
  service_radius_km numeric(5, 1) not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table pincode_areas (
  pincode text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  area text not null,
  latitude double precision not null,
  longitude double precision not null
);

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  device text not null,
  model text,
  problem text not null,
  method text not null check (method in ('Visit IT HUB', 'Courier to IT HUB', 'On-site service')),
  address_id uuid references addresses (id) on delete set null,
  preferred_date date,
  preferred_slot text,
  status text not null default 'Booked' check (status in ('Booked', 'In Progress', 'Diagnosis Done', 'Awaiting Approval', 'Completed', 'Cancelled', 'Delivered', 'Returned')),
  quote numeric(12, 2) check (quote is null or quote >= 0),
  quote_state text check (quote_state is null or quote_state in ('pending', 'approved', 'rejected')),
  technician_name text,               -- Internal info only; technicians are not app users
  notes text,
  courier_charge_return_delivery numeric(8, 2) check (courier_charge_return_delivery is null or courier_charge_return_delivery >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_requests_set_updated_at
  before update on service_requests
  for each row execute function handle_updated_at();

-- Enforces fine-grained customer vs admin permissions on service requests on BOTH INSERT and UPDATE.
-- Uses NULL-safe comparisons (IS DISTINCT FROM), strict quote transition checks,
-- protects administrative notes, quote state, and technician fields.
create or replace function protect_service_request() returns trigger
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

      -- 3. Administrative fields protected from customer mutation
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

      -- 4. Quote state transition:
      -- Customer can ONLY respond to an active pending quote when a quote is present.
      -- Prevents transition when old.quote_state is NULL or not pending.
      if new.quote_state is distinct from old.quote_state then
        if (old.quote_state is distinct from 'pending') or (old.quote is null) or (new.quote_state not in ('approved', 'rejected')) then
          raise exception 'Unauthorized: Invalid quote response transition';
        end if;
      end if;

      -- 5. Customer-editable hardware & scheduling details:
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
  end if;
  return new;
end;
$$;

create trigger service_requests_protect
  before insert or update on service_requests
  for each row execute function protect_service_request();

create table warranty_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  location_id uuid references it_hub_locations (id) on delete set null,
  result text not null check (result in ('eligible', 'ineligible', 'unknown')),
  approx_distance_km numeric(6, 1),
  source text,
  created_at timestamptz not null default now()
);

-- Server-side eligibility check (haversine from PIN centroid to nearest active location)
create or replace function check_onsite_warranty(p_pincode text)
returns table (eligible boolean, location_id uuid, area text, approx_distance_km numeric)
language sql stable security definer set search_path = public, pg_temp as $$
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

-- ────────────────────────────────────────────────────────────────────────────
-- 10. PC BUILDER & STORE SETTINGS
-- ────────────────────────────────────────────────────────────────────────────

create table pc_builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text,
  parts jsonb not null,               -- [{type, product_id, name, price}]
  estimated_price numeric(12, 2) not null check (estimated_price >= 0),
  enquiry_status text not null default 'Draft'
    check (enquiry_status in ('Draft', 'New', 'Contacted', 'Quoted', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pc_builds_set_updated_at
  before update on pc_builds
  for each row execute function handle_updated_at();

-- Enforces that customers cannot transition PC builds into administrative quotation statuses directly
create or replace function protect_pc_build() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    if tg_op = 'INSERT' then
      if new.user_id is distinct from auth.uid() then
        raise exception 'Unauthorized: PC Build user_id must match authenticated user';
      end if;
      if new.enquiry_status not in ('Draft', 'New') then
        raise exception 'Unauthorized: New PC build enquiry must start as Draft or New';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
        raise exception 'Unauthorized: PC Build identity and ownership are immutable';
      end if;
      if new.enquiry_status is distinct from old.enquiry_status and new.enquiry_status in ('Contacted', 'Quoted', 'Closed') then
        raise exception 'Unauthorized: Only administrators can update PC build status to %', new.enquiry_status;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger pc_builds_protect
  before insert or update on pc_builds
  for each row execute function protect_pc_build();

create table pc_build_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null check (purpose in ('gaming', 'creation', 'work', 'professional', 'general')),
  budget_min integer not null check (budget_min >= 0),
  budget_max integer not null check (budget_max >= budget_min),
  resolution text,
  usage text,
  tradeoff text,
  parts jsonb not null,
  highlights text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pc_build_templates_set_updated_at
  before update on pc_build_templates
  for each row execute function handle_updated_at();

create table store_settings (
  id int primary key default 1 check (id = 1),  -- Single configuration row
  store_name text not null default 'IT HUB',
  address text,
  phone text,
  email text,
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{10,15}$'),
  delivery_region text default 'Kerala',
  updated_at timestamptz not null default now()
);

create trigger store_settings_set_updated_at
  before update on store_settings
  for each row execute function handle_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 11. AFTER-SALES SUPPORT DIRECTORY
-- ────────────────────────────────────────────────────────────────────────────

create table support_categories (
  id text primary key,                 -- 'laptop', 'mobile', 'printer', etc.
  name text not null,
  icon text not null default 'cpu',
  catalog_categories text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table brand_support (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  category text not null references support_categories (id),
  warranty_phone text,
  customer_care_phone text,
  support_url text check (support_url is null or support_url like 'https://%'),
  warranty_url text check (warranty_url is null or warranty_url like 'https://%'),
  email text,
  notes text,
  popular boolean not null default false,
  active boolean not null default true,
  last_verified_at timestamptz,
  verified_by uuid references profiles (id) on delete set null,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, category)
);

create trigger brand_support_set_updated_at
  before update on brand_support
  for each row execute function handle_updated_at();

create table support_verifications (
  id uuid primary key default gen_random_uuid(),
  brand_support_id uuid not null references brand_support (id) on delete cascade,
  verified_by uuid references profiles (id) on delete set null,
  source_url text not null,
  changes text,
  verified_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 12. VISITOR ANALYTICS & PRIVACY-COMPLIANT IP LOGGING
-- ────────────────────────────────────────────────────────────────────────────

create table visitor_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,               -- Anonymous, browser-scoped token
  user_id uuid references auth.users (id) on delete set null,
  ip inet,                                -- Anonymized / masked or null
  country text,
  region text,
  city text,
  isp text,
  location_confidence text not null default 'unavailable'
    check (location_confidence in ('approximate', 'unverified_client_reported', 'unavailable')),
  device text check (device is null or device in ('Desktop', 'Mobile', 'Tablet')),
  os text,
  browser text,
  referrer text,
  landing_page text,
  page_views integer not null default 0 check (page_views >= 0),
  returning boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table visitor_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references visitor_sessions (id) on delete cascade,
  user_id references auth.users (id) on delete set null,
  event_type text not null,
  path text,
  status text not null default 'Success' check (status in ('Success', 'Info', 'Warning')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table analytics_settings (
  id boolean primary key default true check (id),  -- Single configuration row
  enabled boolean not null default true,
  ip_logging boolean not null default true,
  mask_ip boolean not null default true,
  retention_days integer not null default 90 check (retention_days in (7, 30, 90, 180, 365)),
  updated_at timestamptz not null default now()
);

insert into analytics_settings (id) values (true) on conflict do nothing;

create trigger analytics_settings_set_updated_at
  before update on analytics_settings
  for each row execute function handle_updated_at();

-- Helper to safely zero out the host portion of IP addresses (masking)
create or replace function mask_ip_address(p_ip inet) returns inet
language plpgsql immutable security definer set search_path = public, pg_temp as $$
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
    device, os, browser, referrer, landing_page, returning, page_views
  ) values (
    p_session_id,
    left(trim(p_visitor_id), 64),
    auth.uid(),
    v_ip,
    left(p_country, 64),
    left(p_region, 64),
    left(p_city, 64),
    left(p_isp, 64),
    case when p_city is not null or p_region is not null or p_country is not null then 'unverified_client_reported' else 'unavailable' end,
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

-- Safely purges expired sessions according to retention setting (events cascade on session delete)
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

-- ────────────────────────────────────────────────────────────────────────────
-- 13. SELL YOUR ITEM (CUSTOMER HARDWARE SUBMISSION & VERIFICATION)
-- ────────────────────────────────────────────────────────────────────────────

create table sell_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles (id),
  category text not null,
  product_name text not null,
  brand text,
  model text,
  condition text not null,
  description text,
  has_warranty boolean not null default false,
  warranty_provider text,
  warranty_remaining text,
  warranty_details text,
  status text not null default 'Pending'
    check (status in ('Pending', 'Under Review', 'Contacted', 'Approved', 'Rejected', 'Completed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sell_requests_set_updated_at
  before update on sell_requests
  for each row execute function handle_updated_at();

-- Protects privileged fields on BOTH INSERT and UPDATE for customer sell requests
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
    elsif tg_op = 'UPDATE' then
      if new.status <> old.status then
        raise exception 'Unauthorized: Only administrators can update sell request status';
      end if;
      if new.admin_notes is distinct from old.admin_notes then
        raise exception 'Unauthorized: Only administrators can modify admin notes';
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

create trigger sell_requests_protect
  before insert or update on sell_requests
  for each row execute function protect_sell_request();

create table sell_request_images (
  id uuid primary key default gen_random_uuid(),
  sell_request_id uuid not null references sell_requests (id) on delete cascade,
  storage_path text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Invoices and proof-of-purchase documents.
-- Strictly private. Customers can only read and upload documents for their own requests.
create table sell_request_documents (
  id uuid primary key default gen_random_uuid(),
  sell_request_id uuid not null references sell_requests (id) on delete cascade,
  document_type text not null check (document_type in ('invoice', 'other')),
  storage_path text not null,  -- Private bucket path in 'customer-invoices'
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 14. TRUSTED BUSINESS LOGIC & RPCS
-- ────────────────────────────────────────────────────────────────────────────

-- Read-only coupon validation during checkout. Does NOT record usage.
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

-- Secure server-side order creation RPC.
-- Validates input methods, enforces mandatory delivery addresses for home delivery,
-- reserves stock with 30-min TTL, pulls authoritative price (coalesce(sale_price, price))
-- with deterministic lock ordering, prevents concurrent checkouts with same one-time coupon,
-- and creates a consistent Pending order snapshot without redundant product re-queries.
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

-- Allows Edge Function to link razorpay_order_id to internal order
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

-- Trusted payment verification recorder.
-- MUST be called ONLY by trusted server components (Supabase Edge Functions with service_role).
-- Requires non-null amount, currency, and razorpay_order_id.
-- Validates amount, currency, razorpay_order_id, updates order to Paid/Processing, and redeems coupon.
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

-- Records payment failure from Razorpay webhook/callback and releases stock
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

  -- Release stock reservation if held
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

-- Allows order cancellation by admin or customer (if Pending and unpaid), restoring inventory stock idempotently
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

  -- Customers cannot cancel paid or non-Pending orders directly; must follow refund/return workflow
  if not is_admin() and (v_order.status <> 'Pending' or v_order.payment_status = 'Paid') then
    raise exception 'Cannot cancel order with status % and payment_status %. Paid or in-fulfillment orders require merchant refund processing.', v_order.status, v_order.payment_status;
  end if;

  -- Restore stock only if stock was reserved and has not yet been restored
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

-- Scheduled maintenance RPC: cleans up expired unpaid checkout orders and returns stock to inventory.
-- Uses FOR UPDATE SKIP LOCKED to prevent locking contention with ongoing checkouts.
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

-- Lightweight database health check RPC for connectivity monitoring.
-- Returns minimal timestamp and healthy status without exposing schema, config, or metrics.
create or replace function health_check() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'status', 'ok',
    'timestamp', extract(epoch from now())::bigint
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 15. PERFORMANCE INDEXES
-- ────────────────────────────────────────────────────────────────────────────

create index if not exists products_category_idx on products (category_id);
create index if not exists products_brand_idx on products (brand_id);
create index if not exists products_status_idx on products (status);
create index if not exists products_created_idx on products (created_at desc);
create index if not exists product_images_product_idx on product_images (product_id);
create index if not exists addresses_user_idx on addresses (user_id);
create index if not exists orders_user_created_idx on orders (user_id, created_at desc);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_payment_status_idx on orders (payment_status);
create index if not exists orders_razorpay_order_idx on orders (razorpay_order_id);
create index if not exists orders_expires_reserved_idx on orders (expires_at) where status = 'Pending' and stock_reserved = true;
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_product_idx on order_items (product_id);
create index if not exists coupon_usages_coupon_idx on coupon_usages (coupon_id);
create index if not exists coupon_usages_customer_idx on coupon_usages (customer_id);
create index if not exists coupon_usages_order_idx on coupon_usages (order_id);
create index if not exists reviews_product_status_idx on reviews (product_id, status);
create index if not exists reviews_user_idx on reviews (user_id);
create index if not exists service_requests_user_idx on service_requests (user_id, created_at desc);
create index if not exists service_requests_status_idx on service_requests (status);
create index if not exists warranty_checks_user_idx on warranty_checks (user_id);
create index if not exists pc_builds_user_idx on pc_builds (user_id);
create index if not exists brand_support_brand_idx on brand_support (brand_id);
create index if not exists brand_support_category_idx on brand_support (category);
create index if not exists visitor_sessions_first_seen_idx on visitor_sessions (first_seen desc);
create index if not exists visitor_sessions_visitor_idx on visitor_sessions (visitor_id);
create index if not exists visitor_events_session_created_idx on visitor_events (session_id, created_at);
create index if not exists visitor_events_type_created_idx on visitor_events (event_type, created_at desc);
create index if not exists sell_requests_customer_idx on sell_requests (customer_id);
create index if not exists sell_requests_status_idx on sell_requests (status);
create index if not exists sell_request_images_request_idx on sell_request_images (sell_request_id);
create index if not exists sell_request_documents_request_idx on sell_request_documents (sell_request_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 16. ROW LEVEL SECURITY (RLS) & ACCESS POLICIES
-- ────────────────────────────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table categories enable row level security;
alter table brands enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table inventory enable row level security;
alter table import_runs enable row level security;
alter table offers enable row level security;
alter table offer_products enable row level security;
alter table offer_categories enable row level security;
alter table offer_brands enable row level security;
alter table addresses enable row level security;
alter table wishlist enable row level security;
alter table coupons enable row level security;
alter table coupon_usages enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table reviews enable row level security;
alter table it_hub_locations enable row level security;
alter table pincode_areas enable row level security;
alter table service_requests enable row level security;
alter table warranty_checks enable row level security;
alter table pc_builds enable row level security;
alter table pc_build_templates enable row level security;
alter table store_settings enable row level security;
alter table support_categories enable row level security;
alter table brand_support enable row level security;
alter table support_verifications enable row level security;
alter table visitor_sessions enable row level security;
alter table visitor_events enable row level security;
alter table analytics_settings enable row level security;
alter table sell_requests enable row level security;
alter table sell_request_images enable row level security;
alter table sell_request_documents enable row level security;

-- 16.1 Admin: Full access across all application tables
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','categories','brands','products','product_images','inventory',
    'import_runs','offers','offer_products','offer_categories','offer_brands',
    'addresses','wishlist','coupons','coupon_usages','orders','order_items',
    'reviews','it_hub_locations','pincode_areas','service_requests',
    'warranty_checks','pc_builds','pc_build_templates','store_settings',
    'support_categories','brand_support','support_verifications',
    'visitor_sessions','visitor_events','analytics_settings',
    'sell_requests','sell_request_images','sell_request_documents'
  ] loop
    execute format(
      'create policy admin_all on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- 16.2 Public Read Policies for Storefront Assets (Masks inactive and draft elements)
create policy public_read on categories for select using (true);
create policy public_read on brands for select using (true);

-- Product images visible only for Active products to shield draft/archived media
create policy public_read on product_images for select
  using (exists (select 1 from products p where p.id = product_id and p.status = 'Active'));

create policy public_read on offers for select
  using (active and now() between starts_at and ends_at);

-- Offer mapping associations visible only for active, unexpired offers
create policy public_read on offer_products for select
  using (exists (select 1 from offers o where o.id = offer_id and o.active and now() between o.starts_at and o.ends_at));

create policy public_read on offer_categories for select
  using (exists (select 1 from offers o where o.id = offer_id and o.active and now() between o.starts_at and o.ends_at));

create policy public_read on offer_brands for select
  using (exists (select 1 from offers o where o.id = offer_id and o.active and now() between o.starts_at and o.ends_at));

create policy public_read on it_hub_locations for select using (active);
create policy public_read on pincode_areas for select using (true);
create policy public_read on store_settings for select using (true);
create policy public_read on pc_build_templates for select using (active);
create policy public_read on support_categories for select using (active);
create policy public_read on brand_support for select using (active);
create policy public_read on reviews for select using (status = 'Published' or user_id = auth.uid());

-- 16.3 Customers: Profiles & Personal Records
create policy own_profile on profiles for select using (id = auth.uid());
create policy own_profile_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy own_address_read on addresses for select using (user_id = auth.uid());
create policy own_address_insert on addresses for insert with check (user_id = auth.uid());
create policy own_address_update on addresses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_address_delete on addresses for delete using (user_id = auth.uid());

create policy own_wishlist_read on wishlist for select using (user_id = auth.uid());
create policy own_wishlist_insert on wishlist for insert with check (user_id = auth.uid());
create policy own_wishlist_delete on wishlist for delete using (user_id = auth.uid());

create policy own_builds_read on pc_builds for select using (user_id = auth.uid());
create policy own_builds_insert on pc_builds for insert with check (user_id = auth.uid());
create policy own_builds_update on pc_builds for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_builds_delete on pc_builds for delete using (user_id = auth.uid());

-- 16.4 Customers: Orders & Order Items
-- Direct INSERT/UPDATE by customers is strictly disabled.
-- Orders are created exclusively through create_order() RPC, and paid via record_order_payment().
create policy own_orders_read on orders for select using (user_id = auth.uid());
create policy own_order_items_read on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));

-- 16.5 Customers: Coupons & Usages
-- Direct INSERT by customers into coupon_usages is prohibited. Recorded only upon completed payment.
create policy own_coupon_usages_read on coupon_usages for select using (customer_id = auth.uid());

-- 16.6 Customers: Reviews
create policy own_reviews_insert on reviews for insert
  with check (user_id = auth.uid() and status = 'Pending');
create policy own_reviews_update on reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'Pending');
create policy own_reviews_delete on reviews for delete using (user_id = auth.uid());

-- 16.7 Customers: Services & Warranty
create policy own_services_read on service_requests for select using (user_id = auth.uid());
create policy own_services_insert on service_requests for insert with check (user_id = auth.uid());
create policy own_services_update on service_requests for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_warranty_read on warranty_checks for select using (user_id = auth.uid());
create policy own_warranty_insert on warranty_checks for insert
  with check (user_id is null or user_id = auth.uid());

-- 16.8 Customers: Sell Requests & Private Documents
create policy own_sell_read on sell_requests for select using (customer_id = auth.uid());
create policy own_sell_insert on sell_requests for insert with check (customer_id = auth.uid());
create policy own_sell_update on sell_requests for update
  using (customer_id = auth.uid() and status = 'Pending')
  with check (customer_id = auth.uid() and status = 'Pending');

create policy own_sell_images_read on sell_request_images for select
  using (exists (select 1 from sell_requests sr where sr.id = sell_request_id and sr.customer_id = auth.uid()));
create policy own_sell_images_insert on sell_request_images for insert
  with check (exists (select 1 from sell_requests sr where sr.id = sell_request_id and sr.customer_id = auth.uid() and sr.status = 'Pending'));
create policy own_sell_images_delete on sell_request_images for delete
  using (exists (select 1 from sell_requests sr where sr.id = sell_request_id and sr.customer_id = auth.uid() and sr.status = 'Pending'));

-- Invoices: Strictly accessible by the owning customer and admin.
create policy own_sell_docs_read on sell_request_documents for select
  using (exists (select 1 from sell_requests sr where sr.id = sell_request_id and sr.customer_id = auth.uid()));
create policy own_sell_docs_insert on sell_request_documents for insert
  with check (exists (select 1 from sell_requests sr where sr.id = sell_request_id and sr.customer_id = auth.uid() and sr.status = 'Pending'));

-- ────────────────────────────────────────────────────────────────────────────
-- 17. PRIVILEGES & SECURITY GRANTS (EXPLICIT FUNCTION SIGNATURES)
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Revoke direct public/client access to raw products and inventory to shield cost_price
revoke all on table products from anon, authenticated, public;
revoke all on table inventory from anon, authenticated, public;
revoke all on table import_runs from anon, authenticated, public;
revoke all on table visitor_sessions from anon, authenticated, public;
revoke all on table visitor_events from anon, authenticated, public;
revoke all on table analytics_settings from anon, authenticated, public;
revoke all on table coupons from anon, authenticated, public;

-- 2. Grant read access to public safe views
grant select on products_public to anon, authenticated;
grant select on live_offers to anon, authenticated;
grant select on public_coupons to anon, authenticated;

-- 3. Client & Authenticated RPC Execution Grants (Exact Function Signatures)
revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;

revoke all on function check_onsite_warranty(text) from public;
grant execute on function check_onsite_warranty(text) to anon, authenticated;

revoke all on function validate_coupon(text, numeric) from public;
grant execute on function validate_coupon(text, numeric) to anon, authenticated;

revoke all on function create_order(jsonb, uuid, text, text, text, text) from public;
grant execute on function create_order(jsonb, uuid, text, text, text, text) to authenticated;

revoke all on function cancel_order(uuid) from public;
grant execute on function cancel_order(uuid) to authenticated;

revoke all on function ensure_profile() from public, anon;
grant execute on function ensure_profile() to authenticated;

revoke all on function log_visitor_event(uuid, text, text, text, jsonb, text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function log_visitor_event(uuid, text, text, text, jsonb, text, text, text, text, text, text, text, text, boolean) to anon, authenticated;

revoke all on function health_check() from public;
grant execute on function health_check() to anon, authenticated, service_role;

-- 4. Privileged / Backend-Only Execution Grants (service_role only)
revoke all on function attach_razorpay_order_id(uuid, text) from public, anon, authenticated;
grant execute on function attach_razorpay_order_id(uuid, text) to service_role;

revoke all on function record_order_payment(uuid, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function record_order_payment(uuid, text, text, text, numeric, text) to service_role;

revoke all on function record_payment_failure(uuid, text) from public, anon, authenticated;
grant execute on function record_payment_failure(uuid, text) to service_role;

revoke all on function cleanup_expired_orders() from public, anon, authenticated;
grant execute on function cleanup_expired_orders() to service_role;

revoke all on function purge_visitor_data() from public, anon, authenticated;
grant execute on function purge_visitor_data() to service_role;

revoke all on function bootstrap_first_admin(uuid) from public, anon, authenticated;
grant execute on function bootstrap_first_admin(uuid) to service_role;

-- 5. Revoke direct public execution on internal trigger functions and helpers
revoke all on function mask_ip_address(inet) from public, anon, authenticated;
revoke all on function handle_updated_at() from public, anon, authenticated;
revoke all on function handle_new_user() from public, anon, authenticated;
revoke all on function protect_role() from public, anon, authenticated;
revoke all on function handle_default_address() from public, anon, authenticated;
revoke all on function protect_service_request() from public, anon, authenticated;
revoke all on function protect_sell_request() from public, anon, authenticated;
revoke all on function protect_review() from public, anon, authenticated;
revoke all on function protect_pc_build() from public, anon, authenticated;
revoke all on function sync_product_inventory() from public, anon, authenticated;
