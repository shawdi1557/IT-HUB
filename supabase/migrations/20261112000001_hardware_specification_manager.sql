-- Stage 4B (4B-0 to 4B-4): the Hardware Specification Manager (PC Builder V2).
--
-- A reusable registry of canonical hardware models, keyed by exact manufacturer and model (never by chipset), with:
--   hardware_categories          the nine supported categories (ids equal the builder's slot ids)
--   hardware_spec_fields         each category's specification fields: type, unit, range, choices, required,
--                                inheritable, default metafield. A copy of src/lib/builder/hardware-spec.ts, checked
--                                by a database test.
--   hardware_manufacturers       manufacturers, unique by name (case and punctuation ignored)
--   hardware_models              canonical models: category, manufacturer, exact model name and number, optional
--                                base model for inheritable fields, and the current specification (`specs`)
--   hardware_shopify_links       which Shopify product or variant is which model, with listing-specific overrides
--   hardware_spec_revisions      every specification and override change: full snapshot, changed fields, actor
--   hardware_metafield_mappings  which field syncs to which pc_builder metafield (namespace fixed to pc_builder)
--   hardware_sync_jobs           Shopify synchronisation jobs: payload, revision, state, attempts, errors
--   hardware_activity_log        everything that happened, who did it, previous and new values
--
-- Simplified workflow (owner decision, 12 November 2026): Admin and Staff save specifications directly. There is no
-- approval, reviewer or evidence state. Each save is validated, recorded as a new revision with its actor, and is
-- the current specification at once.
--
-- Roles (no new role): Staff = public.can_manage_quotations() (portal_admin and quotation_staff), the existing PC
-- Builder rule; Admin = public.is_admin(). Service staff have no access. Admin-only: archiving and restoring models,
-- and metafield mappings.
--
-- Clients never write these tables. Every change is a security-definer function that checks the caller's role and
-- the version the caller last saw, and writes its revision and activity rows in the same transaction. Revisions and
-- activity are append-only. The Shopify sync Edge Function (service role) moves jobs through their states.
--
-- Errors use PostgREST's PT codes: PT403 forbidden, PT404 not found, PT409 stale_version, duplicate or conflicting
-- state; 22023 (HTTP 400) for invalid input, with a JSON list of field errors in the detail.
--
-- The October registry (hardware_products, hardware_variants, hardware_spec_audit_log) is left as it is: nothing at
-- runtime reads it (its loader has no callers). Retiring it needs the owner's approval.

-- ─── Categories and fields ───────────────────────────────────────────────────────────────────────────

create table public.hardware_categories (
  id text primary key check (id ~ '^[A-Z][A-Za-z0-9]{1,30}$'),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  builder_slot text check (builder_slot is null or builder_slot ~ '^[A-Z][A-Za-z0-9]{1,30}$'),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.hardware_spec_fields (
  category_id text not null references public.hardware_categories (id) on delete restrict,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 80),
  value_type text not null check (
    value_type in ('integer', 'decimal', 'text', 'boolean', 'enum', 'enum_list', 'text_list')
  ),
  unit text,
  min_value numeric,
  max_value numeric,
  choices text[],
  max_length integer check (max_length is null or max_length between 1 and 500),
  pattern text,
  required boolean not null,
  inheritable boolean not null,
  metafield_key text,
  sort_order integer not null,
  primary key (category_id, key),
  check (value_type not in ('enum', 'enum_list') or cardinality(choices) > 0),
  check (min_value is null or max_value is null or min_value <= max_value)
);

-- ─── Manufacturers and models ────────────────────────────────────────────────────────────────────────

create table public.hardware_manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  identity text generated always as (regexp_replace(lower(name), '[^a-z0-9]', '', 'g')) stored,
  website_url text check (website_url is null or website_url ~ '^https://[^[:space:]]{4,500}$'),
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (identity <> '')
);

create unique index hardware_manufacturers_identity_key on public.hardware_manufacturers (identity);

create table public.hardware_models (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.hardware_categories (id) on delete restrict,
  manufacturer_id uuid not null references public.hardware_manufacturers (id) on delete restrict,
  -- The exact model as the manufacturer names it, such as "Dual GeForce RTX 4070 OC".
  model_name text not null check (char_length(btrim(model_name)) between 2 and 120),
  -- The manufacturer's part number (MPN), when known. Part of the identity.
  model_number text check (model_number is null or char_length(btrim(model_number)) between 1 and 80),
  identity text generated always as (
    regexp_replace(lower(model_name), '[^a-z0-9]', '', 'g')
      || '|' || coalesce(regexp_replace(lower(model_number), '[^a-z0-9]', '', 'g'), '')
  ) stored,
  -- A base model is a platform or reference record (such as a graphics chip) that other models inherit from. It is
  -- never linked to a Shopify listing.
  is_base boolean not null default false,
  base_model_id uuid references public.hardware_models (id) on delete restrict,
  notes text check (notes is null or char_length(notes) <= 2000),
  -- The current specification: validated values only; a field not present is unknown.
  specs jsonb not null default '{}'::jsonb check (jsonb_typeof(specs) = 'object'),
  spec_revision integer not null default 0 check (spec_revision >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (base_model_id is null or base_model_id <> id),
  check (not (is_base and base_model_id is not null))
);

-- Exact identity is unique among active models of a category and manufacturer. An archived model doesn't block a
-- new one; restoring it is refused while an active one holds its identity.
create unique index hardware_models_identity_key
  on public.hardware_models (category_id, manufacturer_id, identity)
  where status = 'active';
create index hardware_models_category_idx on public.hardware_models (category_id, status);
create index hardware_models_manufacturer_idx on public.hardware_models (manufacturer_id);
create index hardware_models_base_idx on public.hardware_models (base_model_id) where base_model_id is not null;

-- ─── Shopify links ───────────────────────────────────────────────────────────────────────────────────

create table public.hardware_shopify_links (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.hardware_models (id) on delete restrict,
  shopify_product_id text not null check (shopify_product_id ~ '^gid://shopify/Product/[0-9]+$'),
  -- Null: the link covers every variant of the product. A variant link wins over its product's link.
  shopify_variant_id text check (
    shopify_variant_id is null or shopify_variant_id ~ '^gid://shopify/ProductVariant/[0-9]+$'
  ),
  product_title text check (product_title is null or char_length(product_title) <= 255),
  variant_title text check (variant_title is null or char_length(variant_title) <= 255),
  -- Values for this listing only, such as a bundle's different capacity. Validated as the model's category.
  overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object'),
  override_revision integer not null default 0 check (override_revision >= 0),
  status text not null default 'active' check (status in ('active', 'removed')),
  removed_reason text check (removed_reason is null or char_length(removed_reason) <= 1000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create unique index hardware_shopify_links_variant_key
  on public.hardware_shopify_links (shopify_variant_id)
  where status = 'active' and shopify_variant_id is not null;
create unique index hardware_shopify_links_product_key
  on public.hardware_shopify_links (shopify_product_id)
  where status = 'active' and shopify_variant_id is null;
create index hardware_shopify_links_model_idx on public.hardware_shopify_links (model_id, status);

-- ─── Revisions ───────────────────────────────────────────────────────────────────────────────────────

create table public.hardware_spec_revisions (
  id bigint generated always as identity primary key,
  model_id uuid not null references public.hardware_models (id) on delete restrict,
  -- Null: the model's specification. Set: that listing's overrides.
  link_id uuid references public.hardware_shopify_links (id) on delete restrict,
  revision_no integer not null check (revision_no >= 1),
  specs jsonb not null check (jsonb_typeof(specs) = 'object'),
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  reason text check (reason is null or char_length(reason) <= 1000),
  actor_user_id uuid not null,
  actor_role text not null check (actor_role in ('portal_admin', 'quotation_staff')),
  created_at timestamptz not null default now()
);

create unique index hardware_spec_revisions_model_key
  on public.hardware_spec_revisions (model_id, revision_no)
  where link_id is null;
create unique index hardware_spec_revisions_link_key
  on public.hardware_spec_revisions (link_id, revision_no)
  where link_id is not null;

-- ─── Metafield mappings ──────────────────────────────────────────────────────────────────────────────

create table public.hardware_metafield_mappings (
  id uuid primary key default gen_random_uuid(),
  category_id text not null,
  field_key text not null,
  -- Only IT HUB's own namespace, so a sync can never touch another app's or Shopify's metafields.
  namespace text not null default 'pc_builder' check (namespace = 'pc_builder'),
  -- Only the specification keys defined in Shopify (spec-schema.ts). Never the review record or a legacy key.
  metafield_key text not null check (metafield_key in (
    'socket', 'supported_ram_generations', 'ram_generation', 'watts', 'cpu_max_power_watts',
    'integrated_graphics', 'includes_cooler', 'form_factor', 'ram_slots', 'max_ram_gb', 'm2_slots', 'sata_ports',
    'wifi', 'bios_update_required', 'ram_capacity_gb', 'ram_modules', 'ram_speed_mhz', 'ram_module_type',
    'gpu_length_mm', 'recommended_psu_watts', 'pcie_6plus2_required', 'pcie_16pin_required',
    'pcie_16pin_adapter_8pin_count', 'capacity_watts', 'pcie_6plus2_count', 'pcie_16pin_count',
    'supported_motherboards', 'cabinet_clearance_mm', 'max_cooler_height_mm', 'storage_interface',
    'storage_capacity_gb', 'supported_sockets', 'cooler_height_mm'
  )),
  metafield_type text not null check (
    metafield_type in ('number_integer', 'boolean', 'single_line_text_field', 'list.single_line_text_field')
  ),
  is_enabled boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (category_id, field_key) references public.hardware_spec_fields (category_id, key) on delete restrict,
  unique (category_id, field_key),
  unique (category_id, metafield_key)
);

-- ─── Sync jobs ───────────────────────────────────────────────────────────────────────────────────────

create table public.hardware_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.hardware_shopify_links (id) on delete restrict,
  model_id uuid not null references public.hardware_models (id) on delete restrict,
  -- The revisions the payload was built from. A job whose revisions are no longer current is superseded, never run.
  spec_revision integer not null,
  override_revision integer not null,
  shopify_product_id text not null check (shopify_product_id ~ '^gid://shopify/Product/[0-9]+$'),
  shopify_variant_id text,
  -- The metafields to set: [{namespace, key, type, value}], pc_builder only.
  payload jsonb not null check (jsonb_typeof(payload) = 'array' and jsonb_array_length(payload) between 1 and 25),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (
    status in ('queued', 'syncing', 'synced', 'failed', 'retry_pending', 'superseded')
  ),
  attempts integer not null default 0 check (attempts between 0 and 20),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz,
  locked_until timestamptz,
  last_error jsonb,
  shopify_response jsonb,
  superseded_by uuid references public.hardware_sync_jobs (id) on delete restrict,
  requested_by uuid not null,
  requested_role text not null check (requested_role in ('portal_admin', 'quotation_staff')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  check (payload @? '$[*] ? (@.namespace != "pc_builder")' = false)
);

-- At most one waiting job and one running job per listing.
create unique index hardware_sync_jobs_waiting_key
  on public.hardware_sync_jobs (link_id)
  where status in ('queued', 'retry_pending');
create unique index hardware_sync_jobs_running_key
  on public.hardware_sync_jobs (link_id)
  where status = 'syncing';
create index hardware_sync_jobs_link_idx on public.hardware_sync_jobs (link_id, created_at desc);
create index hardware_sync_jobs_status_idx on public.hardware_sync_jobs (status, next_attempt_at);

-- ─── Activity log ────────────────────────────────────────────────────────────────────────────────────

create table public.hardware_activity_log (
  id bigint generated always as identity primary key,
  action text not null check (action in (
    'manufacturer_created', 'manufacturer_updated', 'category_updated',
    'model_created', 'model_updated', 'model_category_changed', 'model_archived', 'model_restored',
    'spec_created', 'spec_updated', 'override_updated',
    'link_created', 'link_changed', 'link_removed',
    'mapping_updated',
    'sync_initiated', 'sync_succeeded', 'sync_failed', 'sync_retry_scheduled', 'sync_retried', 'sync_superseded'
  )),
  model_id uuid,
  link_id uuid,
  job_id uuid,
  manufacturer_id uuid,
  category_id text,
  mapping_id uuid,
  -- Null for the sync worker's own outcomes.
  actor_user_id uuid,
  actor_role text check (actor_role in ('portal_admin', 'quotation_staff', 'system')),
  previous jsonb,
  new jsonb,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index hardware_activity_log_created_idx on public.hardware_activity_log (created_at desc);
create index hardware_activity_log_model_idx on public.hardware_activity_log (model_id, id desc);

-- ─── Append-only history ─────────────────────────────────────────────────────────────────────────────

create or replace function private.hardware_history_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'hardware history is append-only' using errcode = '42501';
end;
$$;

revoke all on function private.hardware_history_append_only() from public, anon, authenticated, service_role;

create trigger hardware_spec_revisions_append_only
  before update or delete on public.hardware_spec_revisions
  for each row execute function private.hardware_history_append_only();
create trigger hardware_spec_revisions_no_truncate
  before truncate on public.hardware_spec_revisions
  for each statement execute function private.hardware_history_append_only();
create trigger hardware_activity_log_append_only
  before update or delete on public.hardware_activity_log
  for each row execute function private.hardware_history_append_only();
create trigger hardware_activity_log_no_truncate
  before truncate on public.hardware_activity_log
  for each statement execute function private.hardware_history_append_only();

-- ─── Access ──────────────────────────────────────────────────────────────────────────────────────────

alter table public.hardware_categories enable row level security;
alter table public.hardware_spec_fields enable row level security;
alter table public.hardware_manufacturers enable row level security;
alter table public.hardware_models enable row level security;
alter table public.hardware_shopify_links enable row level security;
alter table public.hardware_spec_revisions enable row level security;
alter table public.hardware_metafield_mappings enable row level security;
alter table public.hardware_sync_jobs enable row level security;
alter table public.hardware_activity_log enable row level security;

revoke all on public.hardware_categories from public, anon, authenticated, service_role;
revoke all on public.hardware_spec_fields from public, anon, authenticated, service_role;
revoke all on public.hardware_manufacturers from public, anon, authenticated, service_role;
revoke all on public.hardware_models from public, anon, authenticated, service_role;
revoke all on public.hardware_shopify_links from public, anon, authenticated, service_role;
revoke all on public.hardware_spec_revisions from public, anon, authenticated, service_role;
revoke all on public.hardware_metafield_mappings from public, anon, authenticated, service_role;
revoke all on public.hardware_sync_jobs from public, anon, authenticated, service_role;
revoke all on public.hardware_activity_log from public, anon, authenticated, service_role;

-- Staff and administrators read everything here; customers and service staff read nothing. Writes go through the
-- functions below only.
grant select on
  public.hardware_categories, public.hardware_spec_fields, public.hardware_manufacturers, public.hardware_models,
  public.hardware_shopify_links, public.hardware_spec_revisions, public.hardware_metafield_mappings,
  public.hardware_sync_jobs, public.hardware_activity_log
  to authenticated;

create policy hardware_categories_select on public.hardware_categories
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_spec_fields_select on public.hardware_spec_fields
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_manufacturers_select on public.hardware_manufacturers
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_models_select on public.hardware_models
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_shopify_links_select on public.hardware_shopify_links
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_spec_revisions_select on public.hardware_spec_revisions
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_metafield_mappings_select on public.hardware_metafield_mappings
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_sync_jobs_select on public.hardware_sync_jobs
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_activity_log_select on public.hardware_activity_log
  for select to authenticated using (public.can_manage_quotations() is true);

-- The sync Edge Function reads the registry; it changes jobs and the log only through the functions below.
grant select on
  public.hardware_categories, public.hardware_spec_fields, public.hardware_manufacturers, public.hardware_models,
  public.hardware_shopify_links, public.hardware_metafield_mappings, public.hardware_sync_jobs
  to service_role;

-- ─── Seed: categories, fields, mappings (generated from src/lib/builder/hardware-spec.ts) ───────────

insert into public.hardware_categories (id, label, builder_slot, sort_order) values
  ('CPU', 'CPU', 'CPU', 10),
  ('GPU', 'GPU', 'GPU', 20),
  ('Motherboard', 'Motherboard', 'Motherboard', 30),
  ('RAM', 'RAM', 'RAM', 40),
  ('Storage', 'Storage', 'Storage', 50),
  ('PSU', 'PSU', 'PSU', 60),
  ('Cabinet', 'PC Case', 'Cabinet', 70),
  ('Cooler', 'CPU Cooler', 'Cooler', 80),
  ('Monitor', 'Monitor', 'Monitor', 90);

insert into public.hardware_spec_fields (
  category_id, key, label, value_type, unit, min_value, max_value, choices, max_length, pattern, required,
  inheritable, metafield_key, sort_order
) values
  ('CPU', 'socket', 'Socket', 'enum', null, null, null, array['AM4', 'AM5', 'LGA1700', 'LGA1851', 'LGA1200']::text[], null, null, true, true, 'socket', 10),
  ('CPU', 'core_count', 'Cores', 'integer', null, 1, 256, null, null, null, false, true, null, 20),
  ('CPU', 'thread_count', 'Threads', 'integer', null, 1, 512, null, null, null, false, true, null, 30),
  ('CPU', 'base_clock_ghz', 'Base clock', 'decimal', 'GHz', 0.1, 10, null, null, null, false, true, null, 40),
  ('CPU', 'boost_clock_ghz', 'Boost clock', 'decimal', 'GHz', 0.1, 10, null, null, null, false, true, null, 50),
  ('CPU', 'tdp_watts', 'TDP (base power)', 'integer', 'W', 1, 1000, null, null, null, true, true, 'watts', 60),
  ('CPU', 'max_power_watts', 'Maximum power', 'integer', 'W', 1, 1000, null, null, null, false, true, 'cpu_max_power_watts', 70),
  ('CPU', 'integrated_graphics', 'Integrated graphics', 'boolean', null, null, null, null, null, null, true, true, 'integrated_graphics', 80),
  ('CPU', 'includes_cooler', 'Cooler in the box', 'boolean', null, null, null, null, null, null, true, false, 'includes_cooler', 90),
  ('CPU', 'memory_support', 'Memory support', 'enum_list', null, null, null, array['DDR4', 'DDR5']::text[], null, null, true, true, 'supported_ram_generations', 100),
  ('CPU', 'max_memory_gb', 'Maximum memory', 'integer', 'GB', 1, 4096, null, null, null, false, true, null, 110),
  ('CPU', 'pcie_version', 'PCIe support', 'enum', null, null, null, array['PCIe 3.0', 'PCIe 4.0', 'PCIe 5.0']::text[], null, null, false, true, null, 120),
  ('GPU', 'chipset', 'Chipset', 'text', null, null, null, null, 80, null, false, true, null, 10),
  ('GPU', 'vram_gb', 'VRAM capacity', 'integer', 'GB', 1, 128, null, null, null, false, true, null, 20),
  ('GPU', 'vram_type', 'VRAM type', 'enum', null, null, null, array['GDDR5', 'GDDR6', 'GDDR6X', 'GDDR7', 'HBM2', 'HBM3']::text[], null, null, false, true, null, 30),
  ('GPU', 'memory_bus_bits', 'Memory bus', 'integer', 'bit', 32, 8192, null, null, null, false, true, null, 40),
  ('GPU', 'base_clock_mhz', 'Base clock', 'integer', 'MHz', 100, 5000, null, null, null, false, true, null, 50),
  ('GPU', 'boost_clock_mhz', 'Boost clock', 'integer', 'MHz', 100, 5000, null, null, null, false, false, null, 60),
  ('GPU', 'tdp_watts', 'Board power (TDP)', 'integer', 'W', 1, 1000, null, null, null, true, true, 'watts', 70),
  ('GPU', 'length_mm', 'Length', 'integer', 'mm', 50, 500, null, null, null, true, false, 'gpu_length_mm', 80),
  ('GPU', 'width_slots', 'Width', 'decimal', 'slots', 1, 5, null, null, null, false, false, null, 90),
  ('GPU', 'pcie_8pin_required', '8-pin (6+2) power plugs needed', 'integer', null, 0, 4, null, null, null, true, false, 'pcie_6plus2_required', 100),
  ('GPU', 'pcie_16pin_required', '16-pin (12VHPWR / 12V-2x6) plugs needed', 'integer', null, 0, 2, null, null, null, true, false, 'pcie_16pin_required', 110),
  ('GPU', 'pcie_16pin_adapter_8pin_count', '8-pin plugs on the boxed 16-pin adapter', 'integer', null, 0, 4, null, null, null, false, false, 'pcie_16pin_adapter_8pin_count', 120),
  ('GPU', 'recommended_psu_watts', 'Recommended PSU', 'integer', 'W', 100, 2000, null, null, null, true, true, 'recommended_psu_watts', 130),
  ('GPU', 'pcie_interface', 'PCIe interface', 'enum', null, null, null, array['PCIe 3.0 x16', 'PCIe 4.0 x8', 'PCIe 4.0 x16', 'PCIe 5.0 x8', 'PCIe 5.0 x16']::text[], null, null, false, true, null, 140),
  ('GPU', 'display_outputs', 'Display outputs', 'text_list', null, null, null, null, 60, null, false, false, null, 150),
  ('Motherboard', 'socket', 'Socket', 'enum', null, null, null, array['AM4', 'AM5', 'LGA1700', 'LGA1851', 'LGA1200']::text[], null, null, true, true, 'socket', 10),
  ('Motherboard', 'chipset', 'Chipset', 'text', null, null, null, null, 40, null, false, true, null, 20),
  ('Motherboard', 'form_factor', 'Form factor', 'enum', null, null, null, array['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX']::text[], null, null, true, false, 'form_factor', 30),
  ('Motherboard', 'ram_generation', 'RAM generation', 'enum', null, null, null, array['DDR4', 'DDR5']::text[], null, null, true, false, 'ram_generation', 40),
  ('Motherboard', 'memory_slots', 'Memory slots', 'integer', null, 1, 8, null, null, null, true, false, 'ram_slots', 50),
  ('Motherboard', 'max_memory_gb', 'Maximum memory', 'integer', 'GB', 1, 4096, null, null, null, true, false, 'max_ram_gb', 60),
  ('Motherboard', 'pcie_x16_slots', 'PCIe x16 slots', 'integer', null, 0, 8, null, null, null, false, false, null, 70),
  ('Motherboard', 'm2_slots', 'M.2 slots', 'integer', null, 0, 12, null, null, null, true, false, 'm2_slots', 80),
  ('Motherboard', 'sata_ports', 'SATA ports', 'integer', null, 0, 12, null, null, null, true, false, 'sata_ports', 90),
  ('Motherboard', 'wifi', 'Built-in Wi-Fi', 'boolean', null, null, null, null, null, null, false, false, 'wifi', 100),
  ('Motherboard', 'bluetooth', 'Bluetooth', 'boolean', null, null, null, null, null, null, false, false, null, 110),
  ('Motherboard', 'lan_speed', 'Wired network', 'enum', null, null, null, array['1 GbE', '2.5 GbE', '5 GbE', '10 GbE']::text[], null, null, false, false, null, 120),
  ('Motherboard', 'cpu_power_connectors', 'CPU power connectors', 'text', null, null, null, null, 60, null, false, false, null, 130),
  ('Motherboard', 'bios_update_required', 'May need a BIOS update for newer CPUs', 'boolean', null, null, null, null, null, null, false, false, 'bios_update_required', 140),
  ('RAM', 'capacity_gb', 'Kit capacity', 'integer', 'GB', 1, 1024, null, null, null, true, false, 'ram_capacity_gb', 10),
  ('RAM', 'ram_generation', 'DDR generation', 'enum', null, null, null, array['DDR4', 'DDR5']::text[], null, null, true, false, 'ram_generation', 20),
  ('RAM', 'speed_mhz', 'Speed', 'integer', 'MHz', 1000, 12000, null, null, null, false, false, 'ram_speed_mhz', 30),
  ('RAM', 'module_type', 'Form factor', 'enum', null, null, null, array['DIMM', 'SO-DIMM']::text[], null, null, true, false, 'ram_module_type', 40),
  ('RAM', 'module_count', 'Sticks in the kit', 'integer', null, 1, 8, null, null, null, true, false, 'ram_modules', 50),
  ('RAM', 'cas_latency', 'CAS latency', 'integer', null, 1, 100, null, null, null, false, false, null, 60),
  ('RAM', 'voltage', 'Voltage', 'decimal', 'V', 0.5, 3, null, null, null, false, false, null, 70),
  ('Storage', 'storage_type', 'Type', 'enum', null, null, null, array['SSD', 'HDD']::text[], null, null, false, false, null, 10),
  ('Storage', 'capacity_gb', 'Capacity', 'integer', 'GB', 1, 100000, null, null, null, true, false, 'storage_capacity_gb', 20),
  ('Storage', 'interface', 'Interface', 'enum', null, null, null, array['M.2 NVMe', 'M.2 SATA', 'SATA SSD', 'SATA HDD']::text[], null, null, true, false, 'storage_interface', 30),
  ('Storage', 'form_factor', 'Form factor', 'enum', null, null, null, array['M.2 2230', 'M.2 2242', 'M.2 2280', '2.5-inch', '3.5-inch']::text[], null, null, false, false, null, 40),
  ('Storage', 'read_speed_mbps', 'Read speed', 'integer', 'MB/s', 1, 20000, null, null, null, false, false, null, 50),
  ('Storage', 'write_speed_mbps', 'Write speed', 'integer', 'MB/s', 1, 20000, null, null, null, false, false, null, 60),
  ('PSU', 'wattage', 'Wattage', 'integer', 'W', 100, 3000, null, null, null, true, false, 'capacity_watts', 10),
  ('PSU', 'efficiency_rating', 'Efficiency rating', 'enum', null, null, null, array['None', '80 PLUS', '80 PLUS Bronze', '80 PLUS Silver', '80 PLUS Gold', '80 PLUS Platinum', '80 PLUS Titanium']::text[], null, null, false, false, null, 20),
  ('PSU', 'modular_type', 'Modular type', 'enum', null, null, null, array['Non-modular', 'Semi-modular', 'Fully modular']::text[], null, null, false, false, null, 30),
  ('PSU', 'form_factor', 'Form factor', 'enum', null, null, null, array['ATX', 'SFX', 'SFX-L', 'TFX']::text[], null, null, false, false, null, 40),
  ('PSU', 'pcie_8pin_count', '8-pin (6+2) PCIe plugs', 'integer', null, 0, 12, null, null, null, true, false, 'pcie_6plus2_count', 50),
  ('PSU', 'pcie_16pin_count', '16-pin (12VHPWR / 12V-2x6) plugs', 'integer', null, 0, 4, null, null, null, true, false, 'pcie_16pin_count', 60),
  ('PSU', 'eps_connectors', 'CPU (EPS) connectors', 'integer', null, 0, 4, null, null, null, false, false, null, 70),
  ('PSU', 'sata_connectors', 'SATA power connectors', 'integer', null, 0, 16, null, null, null, false, false, null, 80),
  ('Cabinet', 'case_type', 'Form factor', 'enum', null, null, null, array['Full Tower', 'Mid Tower', 'Mini Tower', 'Small Form Factor']::text[], null, null, false, false, null, 10),
  ('Cabinet', 'supported_motherboards', 'Supported motherboard sizes', 'enum_list', null, null, null, array['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX']::text[], null, null, true, false, 'supported_motherboards', 20),
  ('Cabinet', 'max_gpu_length_mm', 'Maximum GPU length', 'integer', 'mm', 100, 600, null, null, null, true, false, 'cabinet_clearance_mm', 30),
  ('Cabinet', 'max_cooler_height_mm', 'Maximum CPU cooler height', 'integer', 'mm', 50, 250, null, null, null, true, false, 'max_cooler_height_mm', 40),
  ('Cabinet', 'radiator_support', 'Radiator support', 'text_list', null, null, null, null, 40, null, false, false, null, 50),
  ('Cabinet', 'drive_bays_35', '3.5" drive bays', 'integer', null, 0, 12, null, null, null, false, false, null, 60),
  ('Cabinet', 'drive_bays_25', '2.5" drive bays', 'integer', null, 0, 12, null, null, null, false, false, null, 70),
  ('Cabinet', 'included_fans', 'Fans included', 'integer', null, 0, 12, null, null, null, false, false, null, 80),
  ('Cooler', 'cooler_type', 'Cooler type', 'enum', null, null, null, array['Air', 'AIO liquid']::text[], null, null, false, false, null, 10),
  ('Cooler', 'supported_sockets', 'Supported CPU sockets', 'enum_list', null, null, null, array['AM4', 'AM5', 'LGA1700', 'LGA1851', 'LGA1200']::text[], null, null, true, false, 'supported_sockets', 20),
  ('Cooler', 'height_mm', 'Height', 'integer', 'mm', 20, 250, null, null, null, true, false, 'cooler_height_mm', 30),
  ('Cooler', 'radiator_size_mm', 'Radiator size', 'integer', 'mm', 80, 480, null, null, null, false, false, null, 40),
  ('Cooler', 'fan_configuration', 'Fan configuration', 'text', null, null, null, null, 60, null, false, false, null, 50),
  ('Cooler', 'max_tdp_watts', 'Rated cooling capacity', 'integer', 'W', 1, 1000, null, null, null, false, false, null, 60),
  ('Monitor', 'display_size_in', 'Display size', 'decimal', 'in', 10, 65, null, null, null, false, false, null, 10),
  ('Monitor', 'resolution', 'Resolution', 'text', null, null, null, null, 11, '^[0-9]{3,5}x[0-9]{3,5}$', false, false, null, 20),
  ('Monitor', 'refresh_rate_hz', 'Refresh rate', 'integer', 'Hz', 24, 1000, null, null, null, false, false, null, 30),
  ('Monitor', 'panel_type', 'Panel type', 'enum', null, null, null, array['IPS', 'VA', 'TN', 'OLED', 'Mini-LED']::text[], null, null, false, false, null, 40),
  ('Monitor', 'response_time_ms', 'Response time', 'decimal', 'ms', 0.01, 50, null, null, null, false, false, null, 50),
  ('Monitor', 'adaptive_sync', 'Adaptive sync', 'enum_list', null, null, null, array['None', 'FreeSync', 'FreeSync Premium', 'FreeSync Premium Pro', 'G-SYNC Compatible', 'G-SYNC']::text[], null, null, false, false, null, 60),
  ('Monitor', 'connectivity', 'Connectivity', 'text_list', null, null, null, null, 40, null, false, false, null, 70);

insert into public.hardware_metafield_mappings (category_id, field_key, metafield_key, metafield_type) values
  ('CPU', 'socket', 'socket', 'single_line_text_field'),
  ('CPU', 'tdp_watts', 'watts', 'number_integer'),
  ('CPU', 'max_power_watts', 'cpu_max_power_watts', 'number_integer'),
  ('CPU', 'integrated_graphics', 'integrated_graphics', 'boolean'),
  ('CPU', 'includes_cooler', 'includes_cooler', 'boolean'),
  ('CPU', 'memory_support', 'supported_ram_generations', 'list.single_line_text_field'),
  ('GPU', 'tdp_watts', 'watts', 'number_integer'),
  ('GPU', 'length_mm', 'gpu_length_mm', 'number_integer'),
  ('GPU', 'pcie_8pin_required', 'pcie_6plus2_required', 'number_integer'),
  ('GPU', 'pcie_16pin_required', 'pcie_16pin_required', 'number_integer'),
  ('GPU', 'pcie_16pin_adapter_8pin_count', 'pcie_16pin_adapter_8pin_count', 'number_integer'),
  ('GPU', 'recommended_psu_watts', 'recommended_psu_watts', 'number_integer'),
  ('Motherboard', 'socket', 'socket', 'single_line_text_field'),
  ('Motherboard', 'form_factor', 'form_factor', 'single_line_text_field'),
  ('Motherboard', 'ram_generation', 'ram_generation', 'single_line_text_field'),
  ('Motherboard', 'memory_slots', 'ram_slots', 'number_integer'),
  ('Motherboard', 'max_memory_gb', 'max_ram_gb', 'number_integer'),
  ('Motherboard', 'm2_slots', 'm2_slots', 'number_integer'),
  ('Motherboard', 'sata_ports', 'sata_ports', 'number_integer'),
  ('Motherboard', 'wifi', 'wifi', 'boolean'),
  ('Motherboard', 'bios_update_required', 'bios_update_required', 'boolean'),
  ('RAM', 'capacity_gb', 'ram_capacity_gb', 'number_integer'),
  ('RAM', 'ram_generation', 'ram_generation', 'single_line_text_field'),
  ('RAM', 'speed_mhz', 'ram_speed_mhz', 'number_integer'),
  ('RAM', 'module_type', 'ram_module_type', 'single_line_text_field'),
  ('RAM', 'module_count', 'ram_modules', 'number_integer'),
  ('Storage', 'capacity_gb', 'storage_capacity_gb', 'number_integer'),
  ('Storage', 'interface', 'storage_interface', 'single_line_text_field'),
  ('PSU', 'wattage', 'capacity_watts', 'number_integer'),
  ('PSU', 'pcie_8pin_count', 'pcie_6plus2_count', 'number_integer'),
  ('PSU', 'pcie_16pin_count', 'pcie_16pin_count', 'number_integer'),
  ('Cabinet', 'supported_motherboards', 'supported_motherboards', 'list.single_line_text_field'),
  ('Cabinet', 'max_gpu_length_mm', 'cabinet_clearance_mm', 'number_integer'),
  ('Cabinet', 'max_cooler_height_mm', 'max_cooler_height_mm', 'number_integer'),
  ('Cooler', 'supported_sockets', 'supported_sockets', 'list.single_line_text_field'),
  ('Cooler', 'height_mm', 'cooler_height_mm', 'number_integer');

-- ─── Shared steps ────────────────────────────────────────────────────────────────────────────────────

-- The caller's role for the registry: 'portal_admin' or 'quotation_staff'; anything else is refused (PT403).
create or replace function private.hardware_actor_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.get_current_staff_role();
begin
  if auth.uid() is null or v_role is null or v_role not in ('portal_admin', 'quotation_staff') then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  return v_role;
end;
$$;

-- An administrator's action: PT403 for anyone else.
create or replace function private.hardware_admin_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
begin
  if v_role <> 'portal_admin' or public.is_admin() is not true then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  return v_role;
end;
$$;

-- Optional or required free text: trimmed; 3 to 1,000 characters when required, at most 1,000 otherwise.
create or replace function private.hardware_reason(p_reason text, p_required boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    if p_required then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    return null;
  end if;
  if char_length(v_reason) > 1000 or (p_required and char_length(v_reason) < 3) then
    raise exception 'reason_invalid' using errcode = '22023';
  end if;
  return v_reason;
end;
$$;

-- The comparison form of a name, as hardware-spec.ts's identityText: lower case, letters and digits only.
create or replace function private.hardware_identity_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]', '', 'g');
$$;

-- Trimmed text with inner whitespace collapsed, as hardware-spec.ts does.
create or replace function private.hardware_clean_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(coalesce(p_text, ''), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g');
$$;

-- Writes one activity row.
create or replace function private.hardware_log(
  p_action text,
  p_role text,
  p_model_id uuid default null,
  p_link_id uuid default null,
  p_job_id uuid default null,
  p_manufacturer_id uuid default null,
  p_category_id text default null,
  p_mapping_id uuid default null,
  p_previous jsonb default null,
  p_new jsonb default null,
  p_details jsonb default '{}'::jsonb,
  p_actor uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.hardware_activity_log (
    action, model_id, link_id, job_id, manufacturer_id, category_id, mapping_id, actor_user_id, actor_role,
    previous, new, details
  ) values (
    p_action, p_model_id, p_link_id, p_job_id, p_manufacturer_id, p_category_id, p_mapping_id,
    case when p_role = 'system' then p_actor else coalesce(p_actor, auth.uid()) end, p_role,
    p_previous, p_new, coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- What changed between two specifications: [{field, from, to}] in key order.
create or replace function private.hardware_spec_changes(p_before jsonb, p_after jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'field', k,
      'from', coalesce(p_before -> k, 'null'::jsonb),
      'to', coalesce(p_after -> k, 'null'::jsonb)
    ) order by k), '[]'::jsonb)
  from (
    select jsonb_object_keys(coalesce(p_before, '{}'::jsonb)) as k
    union
    select jsonb_object_keys(coalesce(p_after, '{}'::jsonb))
  ) keys
  where (p_before -> k) is distinct from (p_after -> k);
$$;

-- Validates and normalises a category's specification, as hardware-spec.ts's validateHardwareSpecs does. A blank
-- value means unknown and is dropped. Any error raises 22023 with the field errors as JSON in the detail.
create or replace function private.hardware_validate_specs(p_category text, p_specs jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_key text;
  v_value jsonb;
  v_field public.hardware_spec_fields;
  v_num numeric;
  v_text text;
  v_choice text;
  v_items jsonb;
  v_item jsonb;
  v_failed boolean;
begin
  if p_specs is null or jsonb_typeof(p_specs) <> 'object' then
    raise exception 'specs_invalid'
      using errcode = '22023', detail = '[{"field":"","code":"not_an_object"}]';
  end if;

  for v_key, v_value in select e.key, e.value from jsonb_each(p_specs) e loop
    select * into v_field from public.hardware_spec_fields f where f.category_id = p_category and f.key = v_key;
    if not found then
      v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'unknown_field');
      continue;
    end if;
    if jsonb_typeof(v_value) = 'null'
       or (jsonb_typeof(v_value) = 'string' and private.hardware_clean_text(v_value #>> '{}') = '') then
      continue;
    end if;

    if v_field.value_type in ('integer', 'decimal') then
      if jsonb_typeof(v_value) <> 'number' then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'wrong_type');
        continue;
      end if;
      v_num := (v_value #>> '{}')::numeric;
      if v_field.value_type = 'integer' and v_num <> trunc(v_num) then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'not_whole_number');
      elsif v_field.value_type = 'decimal' and scale(trim_scale(v_num)) > 2 then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'too_precise');
      elsif v_field.min_value is not null and v_num < v_field.min_value then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'below_minimum');
      elsif v_field.max_value is not null and v_num > v_field.max_value then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'above_maximum');
      elsif v_field.value_type = 'integer' then
        v_out := v_out || jsonb_build_object(v_key, to_jsonb(trunc(v_num)::bigint));
      else
        v_out := v_out || jsonb_build_object(v_key, to_jsonb(trim_scale(v_num)));
      end if;

    elsif v_field.value_type = 'boolean' then
      if jsonb_typeof(v_value) <> 'boolean' then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'wrong_type');
      else
        v_out := v_out || jsonb_build_object(v_key, v_value);
      end if;

    elsif v_field.value_type = 'text' then
      if jsonb_typeof(v_value) <> 'string' then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'wrong_type');
        continue;
      end if;
      v_text := private.hardware_clean_text(v_value #>> '{}');
      if v_field.max_length is not null and char_length(v_text) > v_field.max_length then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'too_long');
      elsif v_field.pattern is not null and v_text !~ v_field.pattern then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'pattern_mismatch');
      else
        v_out := v_out || jsonb_build_object(v_key, v_text);
      end if;

    elsif v_field.value_type = 'enum' then
      if jsonb_typeof(v_value) <> 'string' then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'wrong_type');
        continue;
      end if;
      v_text := private.hardware_clean_text(v_value #>> '{}');
      select c into v_choice from unnest(v_field.choices) c where lower(c) = lower(v_text) limit 1;
      if v_choice is null then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'not_a_choice');
      else
        v_out := v_out || jsonb_build_object(v_key, v_choice);
      end if;

    else -- enum_list, text_list
      if jsonb_typeof(v_value) <> 'array' then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'wrong_type');
        continue;
      end if;
      v_items := '[]'::jsonb;
      v_failed := false;
      for v_item in select value from jsonb_array_elements(v_value) loop
        if jsonb_typeof(v_item) <> 'string' then
          v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'wrong_type');
          v_failed := true;
          exit;
        end if;
        v_text := private.hardware_clean_text(v_item #>> '{}');
        continue when v_text = '';
        if v_field.value_type = 'enum_list' then
          v_choice := null;
          select c into v_choice from unnest(v_field.choices) c where lower(c) = lower(v_text) limit 1;
          if v_choice is null then
            v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'not_a_choice');
            v_failed := true;
            exit;
          end if;
          v_text := v_choice;
        elsif v_field.max_length is not null and char_length(v_text) > v_field.max_length then
          v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'too_long');
          v_failed := true;
          exit;
        end if;
        if not v_items @> jsonb_build_array(v_text) then
          v_items := v_items || jsonb_build_array(v_text);
        end if;
      end loop;
      continue when v_failed;
      if jsonb_array_length(v_items) = 0 then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'empty_list');
      elsif jsonb_array_length(v_items) > 12 then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'code', 'too_long');
      else
        v_out := v_out || jsonb_build_object(v_key, v_items);
      end if;
    end if;
  end loop;

  -- Values that can't both be right (hardware-spec.ts consistencyErrors).
  if p_category = 'CPU' then
    if (v_out ->> 'thread_count')::numeric < (v_out ->> 'core_count')::numeric then
      v_errors := v_errors || '{"field":"thread_count","code":"inconsistent"}'::jsonb;
    end if;
    if (v_out ->> 'boost_clock_ghz')::numeric < (v_out ->> 'base_clock_ghz')::numeric then
      v_errors := v_errors || '{"field":"boost_clock_ghz","code":"inconsistent"}'::jsonb;
    end if;
    if (v_out ->> 'max_power_watts')::numeric < (v_out ->> 'tdp_watts')::numeric then
      v_errors := v_errors || '{"field":"max_power_watts","code":"inconsistent"}'::jsonb;
    end if;
  elsif p_category = 'GPU' then
    if (v_out ->> 'boost_clock_mhz')::numeric < (v_out ->> 'base_clock_mhz')::numeric then
      v_errors := v_errors || '{"field":"boost_clock_mhz","code":"inconsistent"}'::jsonb;
    end if;
    if (v_out ->> 'recommended_psu_watts')::numeric < (v_out ->> 'tdp_watts')::numeric then
      v_errors := v_errors || '{"field":"recommended_psu_watts","code":"inconsistent"}'::jsonb;
    end if;
  elsif p_category = 'RAM' then
    if mod((v_out ->> 'capacity_gb')::numeric, (v_out ->> 'module_count')::numeric) <> 0 then
      v_errors := v_errors || '{"field":"module_count","code":"inconsistent"}'::jsonb;
    end if;
  elsif p_category = 'Cooler' then
    if v_out ->> 'cooler_type' = 'Air' and v_out ? 'radiator_size_mm' then
      v_errors := v_errors || '{"field":"radiator_size_mm","code":"inconsistent"}'::jsonb;
    end if;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    raise exception 'specs_invalid' using errcode = '22023', detail = v_errors::text;
  end if;
  return v_out;
end;
$$;

-- A Shopify id as a GID of the given kind, from a GID or bare digits; 22023 otherwise.
create or replace function private.hardware_shopify_gid(p_kind text, p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_value, ''));
  v_prefix text := 'gid://shopify/' || p_kind || '/';
begin
  if v_text ~ '^[0-9]+$' then
    return v_prefix || v_text;
  end if;
  if left(v_text, char_length(v_prefix)) = v_prefix and substr(v_text, char_length(v_prefix) + 1) ~ '^[0-9]+$' then
    return v_text;
  end if;
  raise exception 'shopify_id_invalid' using errcode = '22023';
end;
$$;

-- Locks a model and checks the version the caller last saw.
create or replace function private.lock_hardware_model(p_model_id uuid, p_expected_version integer)
returns public.hardware_models
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.hardware_models;
begin
  select * into v_row from public.hardware_models where id = p_model_id for update;
  if not found then
    raise exception 'model_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_row.version <> p_expected_version then
    raise exception 'stale_version'
      using errcode = 'PT409', detail = jsonb_build_object('current_version', v_row.version)::text;
  end if;
  return v_row;
end;
$$;

-- Locks a link and checks the version the caller last saw.
create or replace function private.lock_hardware_link(p_link_id uuid, p_expected_version integer)
returns public.hardware_shopify_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.hardware_shopify_links;
begin
  select * into v_row from public.hardware_shopify_links where id = p_link_id for update;
  if not found then
    raise exception 'link_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_row.version <> p_expected_version then
    raise exception 'stale_version'
      using errcode = 'PT409', detail = jsonb_build_object('current_version', v_row.version)::text;
  end if;
  return v_row;
end;
$$;

-- Other active models that could be the same product: same category and manufacturer, and the same name, one name
-- inside the other (8+ characters), or the same part number. A warning for staff, never a merge.
create or replace function private.hardware_possible_duplicates(
  p_category text,
  p_manufacturer_id uuid,
  p_model_name text,
  p_model_number text,
  p_exclude uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with wanted as (
    select private.hardware_identity_text(p_model_name) as name,
           nullif(private.hardware_identity_text(p_model_number), '') as number
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'model_name', m.model_name, 'model_number', m.model_number
    ) order by m.model_name), '[]'::jsonb)
  from public.hardware_models m, wanted w
  where m.category_id = p_category
    and m.manufacturer_id = p_manufacturer_id
    and m.status = 'active'
    and (p_exclude is null or m.id <> p_exclude)
    and (
      private.hardware_identity_text(m.model_name) = w.name
      or (w.number is not null and private.hardware_identity_text(m.model_number) = w.number)
      or (
        least(char_length(w.name), char_length(private.hardware_identity_text(m.model_name))) >= 8
        and (
          strpos(private.hardware_identity_text(m.model_name), w.name) > 0
          or strpos(w.name, private.hardware_identity_text(m.model_name)) > 0
        )
      )
    );
$$;

-- Checks a model's identity fields and base. Raises on anything invalid; returns the cleaned name and number.
create or replace function private.hardware_check_identity(
  p_model_id uuid,
  p_category text,
  p_manufacturer_id uuid,
  p_model_name text,
  p_model_number text,
  p_is_base boolean,
  p_base_model_id uuid,
  p_confirm_distinct boolean
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text := private.hardware_clean_text(p_model_name);
  v_number text := nullif(private.hardware_clean_text(p_model_number), '');
  v_base public.hardware_models;
  v_exact uuid;
  v_possible jsonb;
begin
  if not exists (select 1 from public.hardware_categories c where c.id = p_category and c.is_active) then
    raise exception 'category_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.hardware_manufacturers m where m.id = p_manufacturer_id and m.is_active) then
    raise exception 'manufacturer_invalid' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 or private.hardware_identity_text(v_name) = '' then
    raise exception 'model_name_invalid' using errcode = '22023';
  end if;
  if v_number is not null and char_length(v_number) > 80 then
    raise exception 'model_number_invalid' using errcode = '22023';
  end if;
  if coalesce(p_is_base, false) and p_base_model_id is not null then
    raise exception 'base_model_invalid' using errcode = '22023';
  end if;
  if p_base_model_id is not null then
    select * into v_base from public.hardware_models b where b.id = p_base_model_id;
    if not found or v_base.status <> 'active' or not v_base.is_base or v_base.category_id <> p_category
       or v_base.id = p_model_id then
      raise exception 'base_model_invalid' using errcode = '22023';
    end if;
  end if;

  select m.id into v_exact
  from public.hardware_models m
  where m.category_id = p_category and m.manufacturer_id = p_manufacturer_id and m.status = 'active'
    and m.identity = private.hardware_identity_text(v_name) || '|' || coalesce(private.hardware_identity_text(v_number), '')
    and (p_model_id is null or m.id <> p_model_id)
  limit 1;
  if v_exact is not null then
    raise exception 'duplicate_model'
      using errcode = 'PT409', detail = jsonb_build_object('model_id', v_exact)::text;
  end if;

  if not coalesce(p_confirm_distinct, false) then
    v_possible := private.hardware_possible_duplicates(p_category, p_manufacturer_id, v_name, v_number, p_model_id);
    if jsonb_array_length(v_possible) > 0 then
      raise exception 'possible_duplicate' using errcode = 'PT409', detail = v_possible::text;
    end if;
  end if;
  return array[v_name, v_number];
end;
$$;

revoke all on function private.hardware_actor_role() from public, anon, authenticated, service_role;
revoke all on function private.hardware_admin_role() from public, anon, authenticated, service_role;
revoke all on function private.hardware_reason(text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.hardware_identity_text(text) from public, anon, authenticated, service_role;
revoke all on function private.hardware_clean_text(text) from public, anon, authenticated, service_role;
revoke all on function private.hardware_log(
  text, text, uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.hardware_spec_changes(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.hardware_validate_specs(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.hardware_shopify_gid(text, text) from public, anon, authenticated, service_role;
revoke all on function private.lock_hardware_model(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function private.lock_hardware_link(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function private.hardware_possible_duplicates(text, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.hardware_check_identity(uuid, text, uuid, text, text, boolean, uuid, boolean)
  from public, anon, authenticated, service_role;

-- ─── 4B-1: manufacturers and categories ─────────────────────────────────────────────────────────────

-- Creates a manufacturer (p_id null) or updates one (p_id and p_expected_version).
create or replace function public.staff_save_hardware_manufacturer(
  p_id uuid,
  p_expected_version integer,
  p_name text,
  p_website_url text,
  p_is_active boolean
)
returns public.hardware_manufacturers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_name text := private.hardware_clean_text(p_name);
  v_url text := nullif(btrim(coalesce(p_website_url, '')), '');
  v_row public.hardware_manufacturers;
  v_old public.hardware_manufacturers;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 80 or private.hardware_identity_text(v_name) = '' then
    raise exception 'manufacturer_name_invalid' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~ '^https://[^[:space:]]{4,500}$' then
    raise exception 'website_url_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.hardware_manufacturers m
    where m.identity = private.hardware_identity_text(v_name) and (p_id is null or m.id <> p_id)
  ) then
    raise exception 'duplicate_manufacturer' using errcode = 'PT409';
  end if;

  if p_id is null then
    insert into public.hardware_manufacturers (name, website_url, is_active, created_by, updated_by)
    values (v_name, v_url, coalesce(p_is_active, true), auth.uid(), auth.uid())
    returning * into v_row;
    perform private.hardware_log('manufacturer_created', v_role, p_manufacturer_id => v_row.id,
      p_new => jsonb_build_object('name', v_row.name, 'website_url', v_row.website_url, 'is_active', v_row.is_active));
    return v_row;
  end if;

  select * into v_old from public.hardware_manufacturers where id = p_id for update;
  if not found then
    raise exception 'manufacturer_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_old.version <> p_expected_version then
    raise exception 'stale_version'
      using errcode = 'PT409', detail = jsonb_build_object('current_version', v_old.version)::text;
  end if;
  update public.hardware_manufacturers
  set name = v_name, website_url = v_url, is_active = coalesce(p_is_active, v_old.is_active),
      version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_id
  returning * into v_row;
  perform private.hardware_log('manufacturer_updated', v_role, p_manufacturer_id => v_row.id,
    p_previous => jsonb_build_object('name', v_old.name, 'website_url', v_old.website_url, 'is_active', v_old.is_active),
    p_new => jsonb_build_object('name', v_row.name, 'website_url', v_row.website_url, 'is_active', v_row.is_active));
  return v_row;
end;
$$;

-- Renames, reorders or switches off a category. Its fields change only by migration.
create or replace function public.staff_update_hardware_category(
  p_id text,
  p_expected_version integer,
  p_label text,
  p_sort_order integer,
  p_is_active boolean
)
returns public.hardware_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_label text := private.hardware_clean_text(p_label);
  v_old public.hardware_categories;
  v_row public.hardware_categories;
begin
  select * into v_old from public.hardware_categories where id = p_id for update;
  if not found then
    raise exception 'category_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_old.version <> p_expected_version then
    raise exception 'stale_version'
      using errcode = 'PT409', detail = jsonb_build_object('current_version', v_old.version)::text;
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 60 then
    raise exception 'category_label_invalid' using errcode = '22023';
  end if;
  if p_sort_order is not null and (p_sort_order < 0 or p_sort_order > 10000) then
    raise exception 'sort_order_invalid' using errcode = '22023';
  end if;
  update public.hardware_categories
  set label = v_label, sort_order = coalesce(p_sort_order, v_old.sort_order),
      is_active = coalesce(p_is_active, v_old.is_active), version = version + 1, updated_at = now(),
      updated_by = auth.uid()
  where id = p_id
  returning * into v_row;
  perform private.hardware_log('category_updated', v_role, p_category_id => v_row.id,
    p_previous => jsonb_build_object('label', v_old.label, 'sort_order', v_old.sort_order, 'is_active', v_old.is_active),
    p_new => jsonb_build_object('label', v_row.label, 'sort_order', v_row.sort_order, 'is_active', v_row.is_active));
  return v_row;
end;
$$;

-- ─── 4B-1 and 4B-2: models and specifications ───────────────────────────────────────────────────────

-- Creates a canonical model, with its first specification when one is given. An exact identity already in use is
-- refused (PT409 duplicate_model); a possible duplicate is refused (PT409 possible_duplicate, with the candidates)
-- unless the caller confirms the model is distinct.
create or replace function public.staff_create_hardware_model(
  p_category text,
  p_manufacturer_id uuid,
  p_model_name text,
  p_model_number text,
  p_is_base boolean,
  p_base_model_id uuid,
  p_notes text,
  p_specs jsonb,
  p_confirm_distinct boolean,
  p_reason text
)
returns public.hardware_models
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_identity text[];
  v_specs jsonb;
  v_notes text := private.hardware_reason(p_notes, false);
  v_reason text := private.hardware_reason(p_reason, false);
  v_row public.hardware_models;
begin
  v_identity := private.hardware_check_identity(
    null, p_category, p_manufacturer_id, p_model_name, p_model_number, p_is_base, p_base_model_id,
    p_confirm_distinct
  );
  v_specs := private.hardware_validate_specs(p_category, coalesce(p_specs, '{}'::jsonb));

  insert into public.hardware_models (
    category_id, manufacturer_id, model_name, model_number, is_base, base_model_id, notes, specs, spec_revision,
    created_by, updated_by
  ) values (
    p_category, p_manufacturer_id, v_identity[1], v_identity[2], coalesce(p_is_base, false), p_base_model_id,
    v_notes, v_specs, case when v_specs = '{}'::jsonb then 0 else 1 end, auth.uid(), auth.uid()
  )
  returning * into v_row;

  perform private.hardware_log('model_created', v_role, p_model_id => v_row.id, p_category_id => v_row.category_id,
    p_manufacturer_id => v_row.manufacturer_id,
    p_new => jsonb_build_object(
      'model_name', v_row.model_name, 'model_number', v_row.model_number, 'is_base', v_row.is_base,
      'base_model_id', v_row.base_model_id
    ),
    p_details => jsonb_build_object('confirmed_distinct', coalesce(p_confirm_distinct, false)));

  if v_specs <> '{}'::jsonb then
    insert into public.hardware_spec_revisions (model_id, revision_no, specs, changes, reason, actor_user_id, actor_role)
    values (v_row.id, 1, v_specs, private.hardware_spec_changes('{}'::jsonb, v_specs), v_reason, auth.uid(), v_role);
    perform private.hardware_log('spec_created', v_role, p_model_id => v_row.id, p_category_id => v_row.category_id,
      p_new => v_specs, p_details => jsonb_build_object('revision', 1, 'reason_given', v_reason is not null));
  end if;
  return v_row;
end;
$$;

-- Updates a model's identity: name, number, manufacturer, category, base and notes. A category change needs no active
-- listing and a specification valid in the new category.
create or replace function public.staff_update_hardware_model(
  p_model_id uuid,
  p_expected_version integer,
  p_category text,
  p_manufacturer_id uuid,
  p_model_name text,
  p_model_number text,
  p_is_base boolean,
  p_base_model_id uuid,
  p_notes text,
  p_confirm_distinct boolean,
  p_reason text
)
returns public.hardware_models
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_old public.hardware_models := private.lock_hardware_model(p_model_id, p_expected_version);
  v_identity text[];
  v_specs jsonb;
  v_notes text := private.hardware_reason(p_notes, false);
  v_reason text := private.hardware_reason(p_reason, false);
  v_row public.hardware_models;
begin
  if v_old.status <> 'active' then
    raise exception 'model_archived' using errcode = 'PT409';
  end if;
  v_identity := private.hardware_check_identity(
    p_model_id, p_category, p_manufacturer_id, p_model_name, p_model_number, p_is_base, p_base_model_id,
    p_confirm_distinct
  );
  v_specs := v_old.specs;
  if p_category <> v_old.category_id then
    if exists (select 1 from public.hardware_shopify_links l where l.model_id = p_model_id and l.status = 'active') then
      raise exception 'model_has_links' using errcode = 'PT409';
    end if;
    if exists (select 1 from public.hardware_models m where m.base_model_id = p_model_id and m.status = 'active') then
      raise exception 'model_is_base' using errcode = 'PT409';
    end if;
    v_specs := private.hardware_validate_specs(p_category, v_old.specs);
  end if;
  if v_old.is_base and not coalesce(p_is_base, false)
     and exists (select 1 from public.hardware_models m where m.base_model_id = p_model_id and m.status = 'active') then
    raise exception 'model_is_base' using errcode = 'PT409';
  end if;
  if coalesce(p_is_base, false) and not v_old.is_base
     and exists (select 1 from public.hardware_shopify_links l where l.model_id = p_model_id and l.status = 'active') then
    raise exception 'model_has_links' using errcode = 'PT409';
  end if;

  update public.hardware_models
  set category_id = p_category, manufacturer_id = p_manufacturer_id, model_name = v_identity[1],
      model_number = v_identity[2], is_base = coalesce(p_is_base, false), base_model_id = p_base_model_id,
      notes = v_notes, specs = v_specs, version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_model_id
  returning * into v_row;

  perform private.hardware_log('model_updated', v_role, p_model_id => v_row.id, p_category_id => v_row.category_id,
    p_manufacturer_id => v_row.manufacturer_id,
    p_previous => jsonb_build_object(
      'category_id', v_old.category_id, 'manufacturer_id', v_old.manufacturer_id, 'model_name', v_old.model_name,
      'model_number', v_old.model_number, 'is_base', v_old.is_base, 'base_model_id', v_old.base_model_id,
      'notes', v_old.notes
    ),
    p_new => jsonb_build_object(
      'category_id', v_row.category_id, 'manufacturer_id', v_row.manufacturer_id, 'model_name', v_row.model_name,
      'model_number', v_row.model_number, 'is_base', v_row.is_base, 'base_model_id', v_row.base_model_id,
      'notes', v_row.notes
    ),
    p_details => jsonb_build_object('reason', v_reason, 'confirmed_distinct', coalesce(p_confirm_distinct, false)));
  if v_row.category_id <> v_old.category_id then
    perform private.hardware_log('model_category_changed', v_role, p_model_id => v_row.id,
      p_category_id => v_row.category_id,
      p_previous => jsonb_build_object('category_id', v_old.category_id),
      p_new => jsonb_build_object('category_id', v_row.category_id),
      p_details => jsonb_build_object('reason', v_reason));
  end if;
  return v_row;
end;
$$;

-- Saves a model's whole current specification (values not given become unknown). A save that changes nothing returns
-- the model unchanged; otherwise it becomes revision n + 1, with the changed fields and the actor.
create or replace function public.staff_save_hardware_specs(
  p_model_id uuid,
  p_expected_version integer,
  p_specs jsonb,
  p_reason text
)
returns public.hardware_models
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_old public.hardware_models := private.lock_hardware_model(p_model_id, p_expected_version);
  v_specs jsonb;
  v_reason text := private.hardware_reason(p_reason, false);
  v_changes jsonb;
  v_row public.hardware_models;
begin
  if v_old.status <> 'active' then
    raise exception 'model_archived' using errcode = 'PT409';
  end if;
  v_specs := private.hardware_validate_specs(v_old.category_id, coalesce(p_specs, '{}'::jsonb));
  v_changes := private.hardware_spec_changes(v_old.specs, v_specs);
  if jsonb_array_length(v_changes) = 0 then
    return v_old;
  end if;

  update public.hardware_models
  set specs = v_specs, spec_revision = spec_revision + 1, version = version + 1, updated_at = now(),
      updated_by = auth.uid()
  where id = p_model_id
  returning * into v_row;

  insert into public.hardware_spec_revisions (model_id, revision_no, specs, changes, reason, actor_user_id, actor_role)
  values (p_model_id, v_row.spec_revision, v_specs, v_changes, v_reason, auth.uid(), v_role);

  perform private.hardware_log(
    case when v_old.spec_revision = 0 then 'spec_created' else 'spec_updated' end, v_role,
    p_model_id => p_model_id, p_category_id => v_row.category_id,
    p_previous => v_old.specs, p_new => v_specs,
    p_details => jsonb_build_object('revision', v_row.spec_revision, 'changes', v_changes, 'reason', v_reason));
  return v_row;
end;
$$;

-- Archives or restores a model (administrators only). Archiving needs no active listing and no active model built on
-- it; restoring is refused while another active model holds its identity.
create or replace function public.staff_set_hardware_model_archived(
  p_model_id uuid,
  p_expected_version integer,
  p_archived boolean,
  p_reason text
)
returns public.hardware_models
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_admin_role();
  v_old public.hardware_models := private.lock_hardware_model(p_model_id, p_expected_version);
  v_reason text := private.hardware_reason(p_reason, true);
  v_row public.hardware_models;
begin
  if p_archived is null then
    raise exception 'archived_invalid' using errcode = '22023';
  end if;
  if p_archived = (v_old.status = 'archived') then
    raise exception 'no_change' using errcode = 'PT409';
  end if;
  if p_archived then
    if exists (select 1 from public.hardware_shopify_links l where l.model_id = p_model_id and l.status = 'active') then
      raise exception 'model_has_links' using errcode = 'PT409';
    end if;
    if exists (select 1 from public.hardware_models m where m.base_model_id = p_model_id and m.status = 'active') then
      raise exception 'model_is_base' using errcode = 'PT409';
    end if;
  elsif exists (
    select 1 from public.hardware_models m
    where m.category_id = v_old.category_id and m.manufacturer_id = v_old.manufacturer_id
      and m.identity = v_old.identity and m.status = 'active' and m.id <> p_model_id
  ) then
    raise exception 'duplicate_model' using errcode = 'PT409';
  end if;

  update public.hardware_models
  set status = case when p_archived then 'archived' else 'active' end, version = version + 1, updated_at = now(),
      updated_by = auth.uid()
  where id = p_model_id
  returning * into v_row;
  perform private.hardware_log(case when p_archived then 'model_archived' else 'model_restored' end, v_role,
    p_model_id => p_model_id, p_category_id => v_row.category_id,
    p_previous => jsonb_build_object('status', v_old.status), p_new => jsonb_build_object('status', v_row.status),
    p_details => jsonb_build_object('reason', v_reason));
  return v_row;
end;
$$;

-- The possible duplicates of a model being created or edited, for the form's warning.
create or replace function public.staff_find_hardware_duplicates(
  p_category text,
  p_manufacturer_id uuid,
  p_model_name text,
  p_model_number text,
  p_exclude uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.hardware_actor_role();
  return private.hardware_possible_duplicates(p_category, p_manufacturer_id, p_model_name, p_model_number, p_exclude);
end;
$$;

-- ─── 4B-1: Shopify links and overrides ──────────────────────────────────────────────────────────────

-- Links a Shopify product (all its variants) or one variant to a model. A listing can belong to one model only.
create or replace function public.staff_link_shopify_listing(
  p_model_id uuid,
  p_product_id text,
  p_variant_id text,
  p_product_title text,
  p_variant_title text,
  p_reason text
)
returns public.hardware_shopify_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_model public.hardware_models;
  v_product text := private.hardware_shopify_gid('Product', p_product_id);
  v_variant text := case
    when nullif(btrim(coalesce(p_variant_id, '')), '') is null then null
    else private.hardware_shopify_gid('ProductVariant', p_variant_id)
  end;
  v_reason text := private.hardware_reason(p_reason, false);
  v_existing public.hardware_shopify_links;
  v_row public.hardware_shopify_links;
begin
  select * into v_model from public.hardware_models where id = p_model_id for update;
  if not found then
    raise exception 'model_not_found' using errcode = 'PT404';
  end if;
  if v_model.status <> 'active' then
    raise exception 'model_archived' using errcode = 'PT409';
  end if;
  if v_model.is_base then
    raise exception 'base_model_not_linkable' using errcode = 'PT409';
  end if;
  select * into v_existing from public.hardware_shopify_links l
  where l.status = 'active'
    and ((v_variant is not null and l.shopify_variant_id = v_variant)
      or (v_variant is null and l.shopify_variant_id is null and l.shopify_product_id = v_product))
  limit 1;
  if found then
    raise exception 'listing_already_linked' using errcode = 'PT409',
      detail = jsonb_build_object('link_id', v_existing.id, 'model_id', v_existing.model_id)::text;
  end if;

  insert into public.hardware_shopify_links (
    model_id, shopify_product_id, shopify_variant_id, product_title, variant_title, created_by, updated_by
  ) values (
    p_model_id, v_product, v_variant, left(nullif(btrim(coalesce(p_product_title, '')), ''), 255),
    left(nullif(btrim(coalesce(p_variant_title, '')), ''), 255), auth.uid(), auth.uid()
  )
  returning * into v_row;
  perform private.hardware_log('link_created', v_role, p_model_id => p_model_id, p_link_id => v_row.id,
    p_new => jsonb_build_object('shopify_product_id', v_product, 'shopify_variant_id', v_variant,
      'product_title', v_row.product_title, 'variant_title', v_row.variant_title),
    p_details => jsonb_build_object('reason', v_reason));
  return v_row;
end;
$$;

-- Moves a link to another model, to correct a wrong link. Its overrides must be valid for the new model's category.
create or replace function public.staff_relink_shopify_listing(
  p_link_id uuid,
  p_expected_version integer,
  p_model_id uuid,
  p_reason text
)
returns public.hardware_shopify_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_old public.hardware_shopify_links := private.lock_hardware_link(p_link_id, p_expected_version);
  v_reason text := private.hardware_reason(p_reason, true);
  v_model public.hardware_models;
  v_overrides jsonb;
  v_row public.hardware_shopify_links;
begin
  if v_old.status <> 'active' then
    raise exception 'link_removed' using errcode = 'PT409';
  end if;
  if p_model_id = v_old.model_id then
    raise exception 'no_change' using errcode = 'PT409';
  end if;
  select * into v_model from public.hardware_models where id = p_model_id;
  if not found then
    raise exception 'model_not_found' using errcode = 'PT404';
  end if;
  if v_model.status <> 'active' or v_model.is_base then
    raise exception 'model_not_linkable' using errcode = 'PT409';
  end if;
  v_overrides := private.hardware_validate_specs(v_model.category_id, v_old.overrides);

  -- A job built for the old model must not run.
  update public.hardware_sync_jobs
  set status = 'superseded', finished_at = now(), updated_at = now()
  where link_id = p_link_id and status in ('queued', 'retry_pending');

  update public.hardware_shopify_links
  set model_id = p_model_id, overrides = v_overrides, version = version + 1, updated_at = now(),
      updated_by = auth.uid()
  where id = p_link_id
  returning * into v_row;
  perform private.hardware_log('link_changed', v_role, p_model_id => p_model_id, p_link_id => p_link_id,
    p_previous => jsonb_build_object('model_id', v_old.model_id),
    p_new => jsonb_build_object('model_id', p_model_id),
    p_details => jsonb_build_object('reason', v_reason, 'shopify_product_id', v_old.shopify_product_id,
      'shopify_variant_id', v_old.shopify_variant_id));
  return v_row;
end;
$$;

-- Removes a link (kept as removed, never deleted). Waiting sync jobs for it are superseded.
create or replace function public.staff_remove_shopify_link(
  p_link_id uuid,
  p_expected_version integer,
  p_reason text
)
returns public.hardware_shopify_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_old public.hardware_shopify_links := private.lock_hardware_link(p_link_id, p_expected_version);
  v_reason text := private.hardware_reason(p_reason, true);
  v_row public.hardware_shopify_links;
begin
  if v_old.status <> 'active' then
    raise exception 'link_removed' using errcode = 'PT409';
  end if;
  update public.hardware_sync_jobs
  set status = 'superseded', finished_at = now(), updated_at = now()
  where link_id = p_link_id and status in ('queued', 'retry_pending');
  update public.hardware_shopify_links
  set status = 'removed', removed_reason = v_reason, version = version + 1, updated_at = now(),
      updated_by = auth.uid()
  where id = p_link_id
  returning * into v_row;
  perform private.hardware_log('link_removed', v_role, p_model_id => v_row.model_id, p_link_id => p_link_id,
    p_previous => jsonb_build_object('status', 'active', 'shopify_product_id', v_old.shopify_product_id,
      'shopify_variant_id', v_old.shopify_variant_id),
    p_new => jsonb_build_object('status', 'removed'),
    p_details => jsonb_build_object('reason', v_reason));
  return v_row;
end;
$$;

-- Saves a listing's overrides (all of them; values not given are no longer overridden), as a new override revision.
create or replace function public.staff_save_listing_overrides(
  p_link_id uuid,
  p_expected_version integer,
  p_overrides jsonb,
  p_reason text
)
returns public.hardware_shopify_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_old public.hardware_shopify_links := private.lock_hardware_link(p_link_id, p_expected_version);
  v_reason text := private.hardware_reason(p_reason, false);
  v_category text;
  v_overrides jsonb;
  v_changes jsonb;
  v_row public.hardware_shopify_links;
begin
  if v_old.status <> 'active' then
    raise exception 'link_removed' using errcode = 'PT409';
  end if;
  select m.category_id into v_category from public.hardware_models m where m.id = v_old.model_id;
  v_overrides := private.hardware_validate_specs(v_category, coalesce(p_overrides, '{}'::jsonb));
  v_changes := private.hardware_spec_changes(v_old.overrides, v_overrides);
  if jsonb_array_length(v_changes) = 0 then
    return v_old;
  end if;
  update public.hardware_shopify_links
  set overrides = v_overrides, override_revision = override_revision + 1, version = version + 1, updated_at = now(),
      updated_by = auth.uid()
  where id = p_link_id
  returning * into v_row;
  insert into public.hardware_spec_revisions (
    model_id, link_id, revision_no, specs, changes, reason, actor_user_id, actor_role
  ) values (
    v_row.model_id, p_link_id, v_row.override_revision, v_overrides, v_changes, v_reason, auth.uid(), v_role
  );
  perform private.hardware_log('override_updated', v_role, p_model_id => v_row.model_id, p_link_id => p_link_id,
    p_previous => v_old.overrides, p_new => v_overrides,
    p_details => jsonb_build_object('revision', v_row.override_revision, 'changes', v_changes, 'reason', v_reason));
  return v_row;
end;
$$;

-- ─── 4B-4: metafield mappings ───────────────────────────────────────────────────────────────────────

-- Switches a mapping on or off (administrators only). Keys and types are fixed by the migration.
create or replace function public.staff_set_hardware_metafield_mapping(
  p_id uuid,
  p_expected_version integer,
  p_enabled boolean
)
returns public.hardware_metafield_mappings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_admin_role();
  v_old public.hardware_metafield_mappings;
  v_row public.hardware_metafield_mappings;
begin
  select * into v_old from public.hardware_metafield_mappings where id = p_id for update;
  if not found then
    raise exception 'mapping_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_old.version <> p_expected_version then
    raise exception 'stale_version'
      using errcode = 'PT409', detail = jsonb_build_object('current_version', v_old.version)::text;
  end if;
  if p_enabled is null then
    raise exception 'enabled_invalid' using errcode = '22023';
  end if;
  update public.hardware_metafield_mappings
  set is_enabled = p_enabled, version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_id
  returning * into v_row;
  perform private.hardware_log('mapping_updated', v_role, p_mapping_id => p_id, p_category_id => v_row.category_id,
    p_previous => jsonb_build_object('is_enabled', v_old.is_enabled),
    p_new => jsonb_build_object('is_enabled', v_row.is_enabled),
    p_details => jsonb_build_object('field_key', v_row.field_key, 'metafield', v_row.namespace || '.' || v_row.metafield_key));
  return v_row;
end;
$$;

-- ─── 4B-4: sync jobs (the sync Edge Function, service role only) ───────────────────────────────────

-- Queues a sync for a listing. The payload is built and validated by the Edge Function from the revisions given;
-- those must still be current. A waiting job with the same payload is returned as it is (idempotent); any other
-- waiting job for the listing is superseded by the new one, so an older payload can never run after a newer one.
create or replace function public.hardware_sync_enqueue(
  p_link_id uuid,
  p_spec_revision integer,
  p_override_revision integer,
  p_payload jsonb,
  p_payload_hash text,
  p_actor uuid,
  p_actor_role text
)
returns public.hardware_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.hardware_shopify_links;
  v_model public.hardware_models;
  v_waiting public.hardware_sync_jobs;
  v_row public.hardware_sync_jobs;
begin
  if p_actor is null or p_actor_role not in ('portal_admin', 'quotation_staff') then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  select * into v_link from public.hardware_shopify_links where id = p_link_id for update;
  if not found then
    raise exception 'link_not_found' using errcode = 'PT404';
  end if;
  select * into v_model from public.hardware_models where id = v_link.model_id for update;
  if v_link.status <> 'active' or v_model.status <> 'active' then
    raise exception 'link_not_syncable' using errcode = 'PT409';
  end if;
  if v_model.spec_revision <> p_spec_revision or v_link.override_revision <> p_override_revision then
    raise exception 'stale_revision' using errcode = 'PT409';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) = 0
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'payload_invalid' using errcode = '22023';
  end if;

  select * into v_waiting from public.hardware_sync_jobs j
  where j.link_id = p_link_id and j.status in ('queued', 'retry_pending')
  for update;
  if found and v_waiting.payload_hash = p_payload_hash then
    return v_waiting;
  end if;

  -- The older waiting job steps aside first (one waiting job per listing), then points at its replacement.
  if v_waiting.id is not null then
    update public.hardware_sync_jobs
    set status = 'superseded', finished_at = now(), updated_at = now()
    where id = v_waiting.id;
  end if;
  insert into public.hardware_sync_jobs (
    link_id, model_id, spec_revision, override_revision, shopify_product_id, shopify_variant_id, payload,
    payload_hash, status, next_attempt_at, requested_by, requested_role
  ) values (
    p_link_id, v_model.id, p_spec_revision, p_override_revision, v_link.shopify_product_id,
    v_link.shopify_variant_id, p_payload, p_payload_hash, 'queued', now(), p_actor, p_actor_role
  )
  returning * into v_row;
  if v_waiting.id is not null then
    update public.hardware_sync_jobs set superseded_by = v_row.id where id = v_waiting.id;
    perform private.hardware_log('sync_superseded', 'system', p_model_id => v_model.id, p_link_id => p_link_id,
      p_job_id => v_waiting.id, p_details => jsonb_build_object('superseded_by', v_row.id));
  end if;
  perform private.hardware_log('sync_initiated', p_actor_role, p_model_id => v_model.id, p_link_id => p_link_id,
    p_job_id => v_row.id, p_new => jsonb_build_object('payload', p_payload),
    p_details => jsonb_build_object('spec_revision', p_spec_revision, 'override_revision', p_override_revision,
      'shopify_product_id', v_link.shopify_product_id, 'shopify_variant_id', v_link.shopify_variant_id),
    p_actor => p_actor);
  return v_row;
end;
$$;

-- Claims a waiting job for one attempt. Returns null when it can't run now: not waiting, not due, another attempt
-- for the listing still running, or its revisions are no longer current (then it is superseded).
create or replace function public.hardware_sync_claim(p_job_id uuid)
returns public.hardware_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.hardware_sync_jobs;
  v_link public.hardware_shopify_links;
  v_model public.hardware_models;
begin
  select * into v_job from public.hardware_sync_jobs where id = p_job_id for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'PT404';
  end if;
  -- An attempt that never finished (the worker stopped) can be claimed again once its lock has lapsed.
  if v_job.status = 'syncing' and v_job.locked_until is not null and v_job.locked_until < now() then
    v_job.status := 'retry_pending';
  end if;
  if v_job.status not in ('queued', 'retry_pending')
     or (v_job.next_attempt_at is not null and v_job.next_attempt_at > now()) then
    return null;
  end if;
  if exists (
    select 1 from public.hardware_sync_jobs j
    where j.link_id = v_job.link_id and j.status = 'syncing' and j.id <> v_job.id
      and (j.locked_until is null or j.locked_until >= now())
  ) then
    return null;
  end if;
  select * into v_link from public.hardware_shopify_links where id = v_job.link_id;
  select * into v_model from public.hardware_models where id = v_link.model_id;
  if v_link.status <> 'active' or v_model.status <> 'active' or v_link.model_id <> v_job.model_id
     or v_model.spec_revision <> v_job.spec_revision or v_link.override_revision <> v_job.override_revision then
    update public.hardware_sync_jobs
    set status = 'superseded', finished_at = now(), updated_at = now(), locked_until = null
    where id = v_job.id;
    perform private.hardware_log('sync_superseded', 'system', p_model_id => v_job.model_id,
      p_link_id => v_job.link_id, p_job_id => v_job.id,
      p_details => jsonb_build_object('reason', 'specification changed after the job was queued'));
    return null;
  end if;
  -- Release a lapsed attempt on the same listing before this one starts.
  update public.hardware_sync_jobs
  set status = 'retry_pending', locked_until = null, updated_at = now()
  where link_id = v_job.link_id and status = 'syncing' and id <> v_job.id and locked_until < now();
  update public.hardware_sync_jobs
  set status = 'syncing', attempts = attempts + 1, started_at = now(), locked_until = now() + interval '2 minutes',
      updated_at = now()
  where id = v_job.id
  returning * into v_job;
  return v_job;
end;
$$;

-- Records an attempt's outcome. 'retry_pending' becomes 'failed' once the job has used its attempts.
create or replace function public.hardware_sync_finish(
  p_job_id uuid,
  p_outcome text,
  p_error jsonb,
  p_response jsonb,
  p_retry_after_seconds integer
)
returns public.hardware_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.hardware_sync_jobs;
  v_outcome text := p_outcome;
begin
  if p_outcome not in ('synced', 'failed', 'retry_pending', 'superseded') then
    raise exception 'outcome_invalid' using errcode = '22023';
  end if;
  select * into v_job from public.hardware_sync_jobs where id = p_job_id for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'PT404';
  end if;
  if v_job.status <> 'syncing' then
    raise exception 'job_not_running' using errcode = 'PT409';
  end if;
  if v_outcome = 'retry_pending' and v_job.attempts >= v_job.max_attempts then
    v_outcome := 'failed';
  end if;
  update public.hardware_sync_jobs
  set status = v_outcome, last_error = p_error, shopify_response = p_response, locked_until = null,
      next_attempt_at = case
        when v_outcome = 'retry_pending'
          then now() + make_interval(secs => greatest(1, least(coalesce(p_retry_after_seconds, 30), 3600)))
        else null
      end,
      finished_at = case when v_outcome = 'retry_pending' then null else now() end,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;
  perform private.hardware_log(
    case v_outcome
      when 'synced' then 'sync_succeeded'
      when 'retry_pending' then 'sync_retry_scheduled'
      when 'superseded' then 'sync_superseded'
      else 'sync_failed'
    end,
    'system', p_model_id => v_job.model_id, p_link_id => v_job.link_id, p_job_id => v_job.id,
    p_new => case when v_outcome = 'synced' then jsonb_build_object('payload', v_job.payload) else null end,
    p_details => jsonb_build_object('attempt', v_job.attempts, 'error', p_error));
  return v_job;
end;
$$;

-- Puts a failed or waiting job back in the queue now, at a staff member's request.
create or replace function public.hardware_sync_retry(p_job_id uuid, p_actor uuid, p_actor_role text)
returns public.hardware_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.hardware_sync_jobs;
begin
  if p_actor is null or p_actor_role not in ('portal_admin', 'quotation_staff') then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  select * into v_job from public.hardware_sync_jobs where id = p_job_id for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'PT404';
  end if;
  if v_job.status not in ('failed', 'retry_pending') then
    raise exception 'job_not_retryable' using errcode = 'PT409';
  end if;
  if exists (
    select 1 from public.hardware_sync_jobs j
    where j.link_id = v_job.link_id and j.id <> v_job.id and j.status in ('queued', 'retry_pending', 'syncing')
  ) then
    raise exception 'newer_job_exists' using errcode = 'PT409';
  end if;
  update public.hardware_sync_jobs
  set status = 'queued', next_attempt_at = now(), finished_at = null,
      max_attempts = greatest(max_attempts, least(attempts + 3, 20)), updated_at = now()
  where id = p_job_id
  returning * into v_job;
  perform private.hardware_log('sync_retried', p_actor_role, p_model_id => v_job.model_id,
    p_link_id => v_job.link_id, p_job_id => v_job.id, p_details => jsonb_build_object('attempts', v_job.attempts),
    p_actor => p_actor);
  return v_job;
end;
$$;

-- ─── 4B-5: what the PC Builder reads ────────────────────────────────────────────────────────────────

-- The registry layers for active listings of active models: the model's specification, its base model's (when the
-- base is active), and the listing's overrides. Public technical facts only: no notes, actors or history. The
-- storefront reads it to resolve parts as the quotation server does; the server filters by the ids it was sent.
create or replace function public.get_pc_builder_registry_specs(
  p_product_ids text[] default null,
  p_variant_ids text[] default null
)
returns table (
  link_id uuid,
  shopify_product_id text,
  shopify_variant_id text,
  model_id uuid,
  category_id text,
  manufacturer text,
  model_name text,
  model_number text,
  model_specs jsonb,
  base_specs jsonb,
  overrides jsonb,
  spec_revision integer,
  override_revision integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.shopify_product_id, l.shopify_variant_id, m.id, m.category_id, mf.name, m.model_name,
         m.model_number, m.specs, case when b.status = 'active' then b.specs end, l.overrides, m.spec_revision,
         l.override_revision
  from public.hardware_shopify_links l
  join public.hardware_models m on m.id = l.model_id and m.status = 'active' and not m.is_base
  join public.hardware_manufacturers mf on mf.id = m.manufacturer_id
  left join public.hardware_models b on b.id = m.base_model_id
  where l.status = 'active'
    and (
      (p_product_ids is null and p_variant_ids is null)
      or l.shopify_product_id = any (coalesce(p_product_ids, '{}'::text[]))
      or l.shopify_variant_id = any (coalesce(p_variant_ids, '{}'::text[]))
    )
  order by l.shopify_product_id, l.shopify_variant_id nulls first;
$$;

-- ─── Function access ─────────────────────────────────────────────────────────────────────────────────

revoke all on function public.staff_save_hardware_manufacturer(uuid, integer, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_update_hardware_category(text, integer, text, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_create_hardware_model(text, uuid, text, text, boolean, uuid, text, jsonb, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_update_hardware_model(
  uuid, integer, text, uuid, text, text, boolean, uuid, text, boolean, text
) from public, anon, authenticated, service_role;
revoke all on function public.staff_save_hardware_specs(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_set_hardware_model_archived(uuid, integer, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_find_hardware_duplicates(text, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_link_shopify_listing(uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_relink_shopify_listing(uuid, integer, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_remove_shopify_link(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_save_listing_overrides(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_set_hardware_metafield_mapping(uuid, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.hardware_sync_enqueue(uuid, integer, integer, jsonb, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.hardware_sync_claim(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hardware_sync_finish(uuid, text, jsonb, jsonb, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.hardware_sync_retry(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.get_pc_builder_registry_specs(text[], text[])
  from public, anon, authenticated, service_role;

grant execute on function public.staff_save_hardware_manufacturer(uuid, integer, text, text, boolean) to authenticated;
grant execute on function public.staff_update_hardware_category(text, integer, text, integer, boolean) to authenticated;
grant execute on function public.staff_create_hardware_model(text, uuid, text, text, boolean, uuid, text, jsonb, boolean, text)
  to authenticated;
grant execute on function public.staff_update_hardware_model(
  uuid, integer, text, uuid, text, text, boolean, uuid, text, boolean, text
) to authenticated;
grant execute on function public.staff_save_hardware_specs(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.staff_set_hardware_model_archived(uuid, integer, boolean, text) to authenticated;
grant execute on function public.staff_find_hardware_duplicates(text, uuid, text, text, uuid) to authenticated;
grant execute on function public.staff_link_shopify_listing(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.staff_relink_shopify_listing(uuid, integer, uuid, text) to authenticated;
grant execute on function public.staff_remove_shopify_link(uuid, integer, text) to authenticated;
grant execute on function public.staff_save_listing_overrides(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.staff_set_hardware_metafield_mapping(uuid, integer, boolean) to authenticated;
grant execute on function public.hardware_sync_enqueue(uuid, integer, integer, jsonb, text, uuid, text) to service_role;
grant execute on function public.hardware_sync_claim(uuid) to service_role;
grant execute on function public.hardware_sync_finish(uuid, text, jsonb, jsonb, integer) to service_role;
grant execute on function public.hardware_sync_retry(uuid, uuid, text) to service_role;
grant execute on function public.get_pc_builder_registry_specs(text[], text[]) to anon, authenticated, service_role;
