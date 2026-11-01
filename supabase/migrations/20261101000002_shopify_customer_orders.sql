-- supabase/migrations/20261101000002_shopify_customer_orders.sql
-- Migration: Shopify Order Associations, Synchronized Customer Order Metadata & Authoritative Isolation
-- IT HUB — Kerala, India

create table if not exists public.shopify_order_associations (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  shopify_order_id text,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_shopify_order_associations_token on public.shopify_order_associations(token);
create index if not exists idx_shopify_order_associations_user on public.shopify_order_associations(user_id);

alter table public.shopify_order_associations enable row level security;

-- Only authenticated users can generate tokens via RPC; table is protected
create policy shopify_order_associations_select on public.shopify_order_associations
  for select to authenticated
  using (user_id = (select auth.uid()) or is_staff());

create policy shopify_order_associations_service on public.shopify_order_associations
  for all to service_role
  using (true)
  with check (true);

-- Authoritative snapshot of Shopify customer product orders
create table if not exists public.shopify_customer_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shopify_order_id text not null unique,
  order_number text not null,
  created_at timestamptz not null,
  financial_status text,
  fulfillment_status text,
  currency_code text not null default 'INR',
  total_price numeric(12, 2) not null default 0,
  subtotal_price numeric(12, 2) not null default 0,
  total_shipping numeric(12, 2) not null default 0,
  total_tax numeric(12, 2) not null default 0,
  total_discount numeric(12, 2) not null default 0,
  tracking_company text,
  tracking_number text,
  tracking_url text,
  line_items jsonb not null default '[]'::jsonb,
  shipping_address jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists idx_shopify_customer_orders_user on public.shopify_customer_orders(user_id, created_at desc);
create index if not exists idx_shopify_customer_orders_shopify_id on public.shopify_customer_orders(shopify_order_id);

alter table public.shopify_customer_orders enable row level security;

-- RLS: Customer can only select their own product orders; unauthenticated gets 0 rows
create policy shopify_customer_orders_select on public.shopify_customer_orders
  for select to authenticated
  using (user_id = (select auth.uid()) or is_staff());

create policy shopify_customer_orders_service on public.shopify_customer_orders
  for all to service_role
  using (true)
  with check (true);

-- RPC: create_checkout_association
-- Invoked by authenticated customer before navigating to Shopify checkout
create or replace function public.create_checkout_association()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_token text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required to create checkout association';
  end if;

  -- Generate cryptographically random opaque token
  v_token := 'hub_assoc_' || encode(gen_random_bytes(24), 'hex');

  insert into public.shopify_order_associations (token, user_id, expires_at)
  values (v_token, v_uid, now() + interval '2 hours');

  return v_token;
end;
$$;

revoke all on function public.create_checkout_association() from public;
grant execute on function public.create_checkout_association() to authenticated, service_role;

-- RPC: validate_and_consume_association_token
-- Invoked by webhook processor or sync service to bind Shopify order to customer
create or replace function public.validate_and_consume_association_token(
  p_token text,
  p_shopify_order_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assoc record;
begin
  if p_token is null or trim(p_token) = '' then
    return null;
  end if;

  select * into v_assoc
  from public.shopify_order_associations
  where token = trim(p_token)
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    return null;
  end if;

  update public.shopify_order_associations
  set used_at = now(),
      shopify_order_id = p_shopify_order_id
  where id = v_assoc.id;

  return v_assoc.user_id;
end;
$$;

revoke all on function public.validate_and_consume_association_token(text, text) from public;
grant execute on function public.validate_and_consume_association_token(text, text) to authenticated, service_role;
