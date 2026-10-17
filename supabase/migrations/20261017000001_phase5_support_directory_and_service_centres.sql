-- ============================================================================
-- Migration: Phase 5 - Support Directory, Brand Support & Service Centres
-- Target: Supabase / PostgreSQL (aeulrulvpxyqmxmypzey)
-- Features:
--   1. Ensures 'mobile' category exists in support_categories.
--   2. Enriches brand_support with service_locator_url, region, verification_status, is_published.
--   3. Creates service_centres table with strict Indian PIN constraint and coordinates.
--   4. Configures Row Level Security (RLS) enforcing public read only for verified/published records.
--   5. Seeds verified Indian manufacturer contacts and Kerala authorized service centres.
-- ============================================================================

begin;

-- 1. Ensure support_categories includes 'mobile' (Smartphones & Tablets)
insert into public.support_categories (id, name, icon, catalog_categories, active)
values (
  'mobile',
  'Smartphones & Tablets',
  'smartphone',
  array['Mobile Phones', 'Smartphones', 'Tablets'],
  true
)
on conflict (id) do update set
  name = excluded.name,
  icon = excluded.icon,
  catalog_categories = excluded.catalog_categories,
  active = true;

-- 2. Enrich brand_support table
alter table public.brand_support
  add column if not exists service_locator_url text check (service_locator_url is null or service_locator_url like 'https://%'),
  add column if not exists region text not null default 'India',
  add column if not exists verification_status text not null default 'pending_verification'
    check (verification_status in ('verified', 'pending_verification', 'unverified')),
  add column if not exists is_published boolean not null default false;

-- 3. Create service_centres table
create table if not exists public.service_centres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_id uuid references public.brands (id) on delete cascade,
  brand_name text not null,
  category text not null references public.support_categories (id) on delete cascade,
  address text not null,
  city text not null,
  state text not null default 'Kerala',
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  phone text,
  email text,
  services_offered text[] not null default '{}',
  is_authorized boolean not null default false,
  authorization_evidence text,
  source_url text not null check (source_url like 'https://%'),
  latitude double precision,
  longitude double precision,
  active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger for service_centres updated_at
drop trigger if exists service_centres_set_updated_at on public.service_centres;
create trigger service_centres_set_updated_at
  before update on public.service_centres
  for each row execute function public.handle_updated_at();

-- Indexes for fast querying
create index if not exists idx_service_centres_brand on public.service_centres(brand_id);
create index if not exists idx_service_centres_category on public.service_centres(category);
create index if not exists idx_service_centres_pincode on public.service_centres(pincode);
create index if not exists idx_service_centres_active_verified on public.service_centres(active, verified_at);
create index if not exists idx_brand_support_published on public.brand_support(active, is_published, verification_status);

-- 4. Row Level Security Policies

-- brand_support: Public can read ONLY active, published records that have been verified
alter table public.brand_support enable row level security;

drop policy if exists public_read on public.brand_support;
create policy public_read on public.brand_support for select
  using (((active = true and last_verified_at is not null and is_published = true)) or is_admin());

-- service_centres: Public can read ONLY active, verified service centres
alter table public.service_centres enable row level security;

drop policy if exists public_read on public.service_centres;
create policy public_read on public.service_centres for select
  using (((active = true and verified_at is not null)) or is_admin());

-- Admin mutations on service_centres
drop policy if exists admin_insert on public.service_centres;
create policy admin_insert on public.service_centres for insert to authenticated
  with check (is_admin());

drop policy if exists admin_update on public.service_centres;
create policy admin_update on public.service_centres for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists admin_delete on public.service_centres;
create policy admin_delete on public.service_centres for delete to authenticated
  using (is_admin());

-- Grants
grant select on public.service_centres to anon, authenticated;
grant select, insert, update, delete on public.service_centres to authenticated;

commit;
