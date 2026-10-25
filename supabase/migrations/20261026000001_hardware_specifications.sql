-- ============================================================================
-- Migration: 20261026000001_hardware_specifications.sql
-- Description: Phase 1 — Technical Hardware Specification Master, Variant Registry & Audit Log
-- Target: Supabase PostgreSQL (Postgres 15+)
-- ============================================================================

begin;

-- 1. Enumerated Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'component_category') then
    create type public.component_category as enum (
      'CPU', 'Motherboard', 'RAM', 'GPU', 'Storage', 'PSU', 'Cabinet', 'Cooler', 'CaseFans', 'Monitor'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'spec_verification_status') then
    create type public.spec_verification_status as enum (
      'verified_manufacturer',
      'verified_technician',
      'supplier_spec',
      'ambiguous_unverified',
      'quarantined_rejected'
    );
  end if;
end $$;

-- 2. Hardware Products (Product-Level Specifications)
-- Strict Tri-State Logic: Zero inappropriate defaults on technical parameters
create table if not exists public.hardware_products (
  id uuid primary key default gen_random_uuid(),
  shopify_product_id text not null unique,
  handle text,
  brand text,
  model_family text not null,
  category public.component_category not null,
  
  -- Architectural Specifications (Strict Tri-State: NULL = Unknown)
  socket text,
  form_factor text,
  chipset text,
  memory_generation text,
  memory_slots integer,
  max_memory_capacity_gb integer,
  storage_interface text,
  m2_slot_count integer,
  sata_port_count integer,
  
  -- Chassis Clearances (NULL = Unknown)
  max_gpu_length_mm integer,
  max_cooler_height_mm integer,
  max_psu_length_mm integer,
  supported_motherboards text[],
  supported_sockets text[],
  cooler_height_mm integer,
  max_tdp_rating_watts integer,
  
  -- Thermal, Electrical & Feature Flags (NULL = Unknown)
  tdp_watts integer,
  has_integrated_graphics boolean,
  includes_stock_cooler boolean,
  has_wifi boolean,
  has_bluetooth boolean,
  bios_version_required text,
  
  -- Benchmark Ratings (0.00 - 100.00)
  benchmark_single_core numeric(5,2),
  benchmark_multi_core numeric(5,2),
  benchmark_gpu_raster numeric(5,2),
  benchmark_gpu_compute numeric(5,2),
  
  -- Provenance & Verification
  verification_status public.spec_verification_status not null default 'ambiguous_unverified',
  source_reference_url text,
  verified_by text,
  spec_provenance jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Hardware Variants (Variant-Level Specifications)
create table if not exists public.hardware_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.hardware_products(id) on delete cascade,
  shopify_variant_id text not null unique,
  sku text,
  variant_title text not null default 'Default Title',
  
  -- Physical & Electrical Dimensions (NULL = Unknown)
  length_mm integer,
  slot_width numeric(3,1),
  tdp_watts integer,
  rated_wattage integer,
  efficiency_rating text,
  pcie_power_connectors text[],
  
  -- Memory & Storage Dimensions (NULL = Unknown)
  capacity_gb integer,
  module_count integer,
  speed_mhz integer,
  cas_latency integer,
  is_laptop_sodimm boolean,
  
  -- Provenance & Verification
  verification_status public.spec_verification_status not null default 'ambiguous_unverified',
  source_reference_url text,
  spec_provenance jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Audit Log
create table if not exists public.hardware_spec_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  entity_type text not null check (entity_type in ('product', 'variant')),
  changed_by text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'VERIFY', 'REJECT')),
  old_values jsonb,
  new_values jsonb,
  change_reason text not null,
  created_at timestamptz not null default now()
);

-- 5. Immutability Enforcement Trigger on Audit Log
create or replace function public.enforce_audit_log_immutability()
returns trigger language plpgsql as $$
begin
  raise exception 'Security Violation: Audit log entries are immutable and cannot be updated or deleted.';
end;
$$;

drop trigger if exists trg_audit_log_immutable on public.hardware_spec_audit_log;
create trigger trg_audit_log_immutable
  before update or delete on public.hardware_spec_audit_log
  for each row execute function public.enforce_audit_log_immutability();

-- 6. Indices for rapid relational joining
create index if not exists idx_hw_prod_cat on public.hardware_products(category);
create index if not exists idx_hw_prod_socket on public.hardware_products(socket);
create index if not exists idx_hw_prod_status on public.hardware_products(verification_status);
create index if not exists idx_hw_var_variant_id on public.hardware_variants(shopify_variant_id);
create index if not exists idx_hw_var_product_id on public.hardware_variants(product_id);
create index if not exists idx_hw_audit_entity on public.hardware_spec_audit_log(entity_id);

-- 7. Row Level Security Policies
alter table public.hardware_products enable row level security;
alter table public.hardware_variants enable row level security;
alter table public.hardware_spec_audit_log enable row level security;

-- Read Access: Prevents leakage of variants belonging to quarantined products
drop policy if exists "Allow read on active products" on public.hardware_products;
create policy "Allow read on active products"
  on public.hardware_products for select
  using (verification_status != 'quarantined_rejected' or is_admin());

drop policy if exists "Allow read on active variants" on public.hardware_variants;
create policy "Allow read on active variants"
  on public.hardware_variants for select
  using (
    (
      verification_status != 'quarantined_rejected'
      and exists (
        select 1 from public.hardware_products p
        where p.id = product_id
          and p.verification_status != 'quarantined_rejected'
      )
    )
    or is_admin()
  );

-- Mutations: Restricted strictly to verified administrators
drop policy if exists "Allow admin mutations on products" on public.hardware_products;
create policy "Allow admin mutations on products"
  on public.hardware_products for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Allow admin mutations on variants" on public.hardware_variants;
create policy "Allow admin mutations on variants"
  on public.hardware_variants for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Allow admin read on audit log" on public.hardware_spec_audit_log;
create policy "Allow admin read on audit log"
  on public.hardware_spec_audit_log for select to authenticated
  using (is_admin());

drop policy if exists "Allow admin insert on audit log" on public.hardware_spec_audit_log;
create policy "Allow admin insert on audit log"
  on public.hardware_spec_audit_log for insert to authenticated
  with check (is_admin());

-- Revoke dangerous permissions
revoke update, delete on public.hardware_spec_audit_log from public, anon, authenticated;

grant select on public.hardware_products to anon, authenticated;
grant select on public.hardware_variants to anon, authenticated;

-- 8. Seed Pilot Products (Live Shopify Grounding)
-- 8.1 AMD Ryzen 5 5600 (Verified Manufacturer)
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category,
  socket, chipset, memory_generation, tdp_watts, has_integrated_graphics,
  includes_stock_cooler, benchmark_single_core, benchmark_multi_core,
  verification_status, source_reference_url, verified_by, last_verified_at,
  spec_provenance
) values (
  'gid://shopify/Product/15452073165044',
  'amd-ryzen-5-5600',
  'AMD',
  'Ryzen 5 5600',
  'CPU',
  'AM4',
  'Vermeer',
  'DDR4',
  65,
  false,
  true,
  54.00,
  32.50,
  'verified_manufacturer',
  'https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600.html',
  'IT-HUB-ENG-INITIAL',
  now(),
  '{"socket": "verified_manufacturer", "tdp_watts": "verified_manufacturer", "has_integrated_graphics": "verified_manufacturer"}'::jsonb
) on conflict (shopify_product_id) do update set
  verification_status = excluded.verification_status,
  updated_at = now();

insert into public.hardware_variants (
  product_id, shopify_variant_id, sku, variant_title,
  tdp_watts, verification_status, source_reference_url, last_verified_at
) select 
  hp.id,
  'gid://shopify/ProductVariant/67897419301108',
  '100-100000926BOX',
  'Default Title',
  65,
  'verified_manufacturer',
  'https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600.html',
  now()
from public.hardware_products hp
where hp.shopify_product_id = 'gid://shopify/Product/15452073165044'
on conflict (shopify_variant_id) do update set
  verification_status = excluded.verification_status,
  updated_at = now();

-- 8.2 Generic In-Store Products (Seeded strictly as ambiguous_unverified with NULL technical specs)
-- Motherboard
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category, verification_status
) values (
  'gid://shopify/Product/15452076409076', 'b550m-ddr4-motherboard', null, 'B550M DDR4 Motherboard', 'Motherboard', 'ambiguous_unverified'
) on conflict (shopify_product_id) do nothing;

insert into public.hardware_variants (
  product_id, shopify_variant_id, variant_title, verification_status
) select hp.id, 'gid://shopify/ProductVariant/67897451675892', 'Default Title', 'ambiguous_unverified'
from public.hardware_products hp where hp.shopify_product_id = 'gid://shopify/Product/15452076409076'
on conflict (shopify_variant_id) do nothing;

-- RAM
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category, verification_status
) values (
  'gid://shopify/Product/15452078538996', '16gb-ddr4-desktop-ram', null, '16GB DDR4 Desktop RAM', 'RAM', 'ambiguous_unverified'
) on conflict (shopify_product_id) do nothing;

insert into public.hardware_variants (
  product_id, shopify_variant_id, variant_title, verification_status
) select hp.id, 'gid://shopify/ProductVariant/67897476284660', 'Default Title', 'ambiguous_unverified'
from public.hardware_products hp where hp.shopify_product_id = 'gid://shopify/Product/15452078538996'
on conflict (shopify_variant_id) do nothing;

-- GPU
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category, verification_status
) values (
  'gid://shopify/Product/15452080275700', 'nvidia-rtx-4060-8gb', null, 'NVIDIA RTX 4060 8GB', 'GPU', 'ambiguous_unverified'
) on conflict (shopify_product_id) do nothing;

insert into public.hardware_variants (
  product_id, shopify_variant_id, variant_title, verification_status
) select hp.id, 'gid://shopify/ProductVariant/67897496273140', 'Default Title', 'ambiguous_unverified'
from public.hardware_products hp where hp.shopify_product_id = 'gid://shopify/Product/15452080275700'
on conflict (shopify_variant_id) do nothing;

-- Storage
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category, verification_status
) values (
  'gid://shopify/Product/15452081815796', '1tb-nvme-ssd', null, '1TB NVMe SSD', 'Storage', 'ambiguous_unverified'
) on conflict (shopify_product_id) do nothing;

insert into public.hardware_variants (
  product_id, shopify_variant_id, variant_title, verification_status
) select hp.id, 'gid://shopify/ProductVariant/67897513574644', 'Default Title', 'ambiguous_unverified'
from public.hardware_products hp where hp.shopify_product_id = 'gid://shopify/Product/15452081815796'
on conflict (shopify_variant_id) do nothing;

-- PSU
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category, verification_status
) values (
  'gid://shopify/Product/15452083519732', '650w-atx-power-supply', null, '650W ATX Power Supply', 'PSU', 'ambiguous_unverified'
) on conflict (shopify_product_id) do nothing;

insert into public.hardware_variants (
  product_id, shopify_variant_id, variant_title, verification_status
) select hp.id, 'gid://shopify/ProductVariant/67897534480628', 'Default Title', 'ambiguous_unverified'
from public.hardware_products hp where hp.shopify_product_id = 'gid://shopify/Product/15452083519732'
on conflict (shopify_variant_id) do nothing;

-- Cabinet
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category, verification_status
) values (
  'gid://shopify/Product/15452084404468', 'atx-mid-tower-cabinet', null, 'ATX Mid Tower Cabinet', 'Cabinet', 'ambiguous_unverified'
) on conflict (shopify_product_id) do nothing;

insert into public.hardware_variants (
  product_id, shopify_variant_id, variant_title, verification_status
) select hp.id, 'gid://shopify/ProductVariant/67897544081652', 'Default Title', 'ambiguous_unverified'
from public.hardware_products hp where hp.shopify_product_id = 'gid://shopify/Product/15452084404468'
on conflict (shopify_variant_id) do nothing;

-- Cooler
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category, verification_status
) values (
  'gid://shopify/Product/15452084961524', 'am4-compatible-cpu-cooler', null, 'AM4 Compatible CPU Cooler', 'Cooler', 'ambiguous_unverified'
) on conflict (shopify_product_id) do nothing;

insert into public.hardware_variants (
  product_id, shopify_variant_id, variant_title, verification_status
) select hp.id, 'gid://shopify/ProductVariant/67897548570868', 'Default Title', 'ambiguous_unverified'
from public.hardware_products hp where hp.shopify_product_id = 'gid://shopify/Product/15452084961524'
on conflict (shopify_variant_id) do nothing;

-- Secondary GPU (RTX 5050)
insert into public.hardware_products (
  shopify_product_id, handle, brand, model_family, category, verification_status
) values (
  'gid://shopify/Product/15452153807092', 'rtx-5050-gpu', null, 'RTX 5050 GPU', 'GPU', 'ambiguous_unverified'
) on conflict (shopify_product_id) do nothing;

insert into public.hardware_variants (
  product_id, shopify_variant_id, variant_title, verification_status
) select hp.id, 'gid://shopify/ProductVariant/67898272678132', 'Default Title', 'ambiguous_unverified'
from public.hardware_products hp where hp.shopify_product_id = 'gid://shopify/Product/15452153807092'
on conflict (shopify_variant_id) do nothing;

commit;

