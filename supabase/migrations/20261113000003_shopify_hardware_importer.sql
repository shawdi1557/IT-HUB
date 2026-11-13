-- Shopify Hardware Importer: bring eligible Shopify listings into the Hardware Registry.
--
-- Read-only towards Shopify. The hardware-shopify-import Edge Function reads products through the existing Storefront
-- API and stages them here; staff review each one and import it. Importing reuses the registry's own functions
-- (staff_create_hardware_model, staff_link_shopify_listing) and its duplicate detection, so a model is created or
-- linked exactly as by hand. The importer never writes specifications: an imported model starts with none, and staff
-- complete it in the Specification Manager.
--
--   hardware_import_category_rules   which Shopify category, product type, tag or collection means which registry
--                                    category, or "not hardware" (category_id null). Administrators maintain them.
--   hardware_import_sessions         one discovery run and the imports made from it, with counts and status
--   hardware_import_items            one staged Shopify product per session: what Shopify said, the proposed category,
--                                    manufacturer and model name, the match against the registry, the decision, the
--                                    result
--
-- Access: Admin and Staff (can_manage_quotations) read all three and review and import items; only administrators
-- change category rules. Service staff and customers have no access. Clients never write the tables directly.

-- ─── Category rules ──────────────────────────────────────────────────────────────────────────────────

create table public.hardware_import_category_rules (
  id uuid primary key default gen_random_uuid(),
  match_field text not null check (match_field in ('category', 'product_type', 'tag', 'collection')),
  match_value text not null check (char_length(btrim(match_value)) between 1 and 120),
  -- Compared case-, space- and punctuation-insensitively.
  match_normalized text generated always as (regexp_replace(lower(match_value), '[^a-z0-9]', '', 'g')) stored,
  -- Null: products matching this rule aren't hardware (phones, tablets, accessories) and are never imported.
  category_id text references public.hardware_categories (id) on delete restrict,
  -- Lower runs first. A product takes the first matching active rule.
  priority integer not null default 100 check (priority between 0 and 10000),
  is_active boolean not null default true,
  note text check (note is null or char_length(note) <= 300),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (match_normalized <> '')
);

create unique index hardware_import_category_rules_key
  on public.hardware_import_category_rules (match_field, match_normalized);

-- ─── Sessions and staged items ───────────────────────────────────────────────────────────────────────

create table public.hardware_import_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'discovering'
    check (status in ('discovering', 'ready', 'importing', 'completed', 'failed')),
  started_by uuid not null,
  started_role text not null check (started_role in ('portal_admin', 'quotation_staff')),
  started_at timestamptz not null default now(),
  discovered_at timestamptz,
  completed_at timestamptz,
  pages integer not null default 0 check (pages >= 0),
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  error jsonb,
  updated_at timestamptz not null default now()
);

create index hardware_import_sessions_started_idx on public.hardware_import_sessions (started_at desc);

create table public.hardware_import_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hardware_import_sessions (id) on delete restrict,
  -- What Shopify said (Storefront API).
  shopify_product_id text not null check (shopify_product_id ~ '^gid://shopify/Product/[0-9]+$'),
  handle text,
  title text not null check (char_length(title) between 1 and 300),
  vendor text,
  product_type text,
  shopify_category text,
  tags text[] not null default '{}',
  collections text[] not null default '{}',
  image_url text,
  available_for_sale boolean,
  -- [{id, title, sku, price, currency, available}]
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  -- The builder's own classifier, from Shopify's fields and title: a hint shown to staff, never applied by itself.
  suggested_category_id text references public.hardware_categories (id) on delete restrict,
  -- The proposal.
  category_id text references public.hardware_categories (id) on delete restrict,
  category_source text check (category_source in ('rule', 'manual')),
  rule_id uuid references public.hardware_import_category_rules (id) on delete set null,
  excluded boolean not null default false,
  manufacturer_id uuid references public.hardware_manufacturers (id) on delete restrict,
  manufacturer_source text check (manufacturer_source in ('vendor', 'manual')),
  model_name text check (model_name is null or char_length(model_name) between 1 and 120),
  model_number text check (model_number is null or char_length(model_number) between 1 and 80),
  -- The match against the registry.
  status text not null default 'needs_review' check (status in (
    'eligible', 'already_linked', 'exact_match', 'possible_duplicate', 'unmapped', 'needs_review', 'excluded',
    'imported', 'failed', 'skipped'
  )),
  review_reasons text[] not null default '{}',
  existing_link_id uuid references public.hardware_shopify_links (id) on delete set null,
  match_model_id uuid references public.hardware_models (id) on delete set null,
  duplicate_candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(duplicate_candidates) = 'array'),
  -- The decision: what an import of this item does.
  decision text check (decision in ('import_new', 'link_existing', 'refresh_link', 'skip')),
  target_model_id uuid references public.hardware_models (id) on delete restrict,
  confirm_distinct boolean not null default false,
  -- The result.
  result_model_id uuid references public.hardware_models (id) on delete set null,
  result_link_id uuid references public.hardware_shopify_links (id) on delete set null,
  result_action text check (result_action in ('created_model', 'linked_existing', 'refreshed_link', 'skipped', 'already_linked')),
  error jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (session_id, shopify_product_id)
);

create index hardware_import_items_session_idx on public.hardware_import_items (session_id, status);
create index hardware_import_items_product_idx on public.hardware_import_items (shopify_product_id);

-- The activity log gains the importer's actions.
alter table public.hardware_activity_log drop constraint if exists hardware_activity_log_action_check;
alter table public.hardware_activity_log add constraint hardware_activity_log_action_check check (action in (
  'manufacturer_created', 'manufacturer_updated', 'category_updated',
  'model_created', 'model_updated', 'model_category_changed', 'model_archived', 'model_restored',
  'spec_created', 'spec_updated', 'override_updated',
  'link_created', 'link_changed', 'link_removed',
  'mapping_updated',
  'sync_initiated', 'sync_succeeded', 'sync_failed', 'sync_retry_scheduled', 'sync_retried', 'sync_superseded',
  'import_discovery_started', 'import_discovery_finished', 'import_item_updated', 'import_item_imported',
  'import_item_linked', 'import_item_refreshed', 'import_item_skipped', 'import_item_failed', 'import_rule_changed'
));
-- Importer entries carry their session_id and item_id in `details`.
create index if not exists hardware_activity_log_import_session_idx
  on public.hardware_activity_log ((details ->> 'session_id')) where action like 'import_%';

-- ─── Access ──────────────────────────────────────────────────────────────────────────────────────────

alter table public.hardware_import_category_rules enable row level security;
alter table public.hardware_import_sessions enable row level security;
alter table public.hardware_import_items enable row level security;

revoke all on public.hardware_import_category_rules from public, anon, authenticated, service_role;
revoke all on public.hardware_import_sessions from public, anon, authenticated, service_role;
revoke all on public.hardware_import_items from public, anon, authenticated, service_role;

grant select on public.hardware_import_category_rules, public.hardware_import_sessions, public.hardware_import_items
  to authenticated;
grant select on public.hardware_import_category_rules, public.hardware_import_sessions, public.hardware_import_items
  to service_role;

create policy hardware_import_category_rules_select on public.hardware_import_category_rules
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_import_sessions_select on public.hardware_import_sessions
  for select to authenticated using (public.can_manage_quotations() is true);
create policy hardware_import_items_select on public.hardware_import_items
  for select to authenticated using (public.can_manage_quotations() is true);

-- ─── Default rules (from the store's own Shopify taxonomy categories, 12–13 November 2026) ──────────

insert into public.hardware_import_category_rules (match_field, match_value, category_id, priority, note) values
  ('category', 'Computer Processors', 'CPU', 10, 'Shopify taxonomy'),
  ('category', 'Video Cards & Adapters', 'GPU', 10, 'Shopify taxonomy'),
  ('category', 'Motherboards', 'Motherboard', 10, 'Shopify taxonomy'),
  ('category', 'RAM', 'RAM', 10, 'Shopify taxonomy'),
  ('category', 'Computer Memory', 'RAM', 10, 'Suggested by IT HUB'),
  ('category', 'Solid State Drives', 'Storage', 10, 'Shopify taxonomy'),
  ('category', 'Hard Drives', 'Storage', 10, 'Shopify taxonomy'),
  ('category', 'Internal Storage', 'Storage', 10, 'Suggested by IT HUB'),
  ('category', 'Computer Power Supplies', 'PSU', 10, 'Shopify taxonomy'),
  ('category', 'Desktop Computer & Server Cases', 'Cabinet', 10, 'Shopify taxonomy'),
  ('category', 'Computer Cases', 'Cabinet', 10, 'Suggested by IT HUB'),
  ('category', 'CPU Air Coolers & Heat Sinks', 'Cooler', 10, 'Shopify taxonomy'),
  ('category', 'CPU Cooling', 'Cooler', 10, 'Suggested by IT HUB'),
  ('category', 'Monitors', 'Monitor', 10, 'Shopify taxonomy'),
  ('category', 'Computer Monitors', 'Monitor', 10, 'Suggested by IT HUB'),
  ('category', 'Desktop Processors', 'CPU', 10, 'Suggested by IT HUB'),
  -- Not hardware: never imported.
  ('category', 'Smart Phones', null, 20, 'Phones aren''t PC hardware'),
  ('category', 'Mobile & Smart Phones', null, 20, 'Phones aren''t PC hardware'),
  ('category', 'Tablet Computers', null, 20, 'Tablets aren''t PC hardware'),
  ('product_type', 'Mobile Phone', null, 30, 'Phones aren''t PC hardware'),
  ('product_type', 'Tablet', null, 30, 'Tablets aren''t PC hardware');

-- ─── Shared steps ────────────────────────────────────────────────────────────────────────────────────

-- The first active rule a product matches, in priority order: its category, then product type, tags, collections.
create or replace function private.hardware_import_rule_for(
  p_category text,
  p_product_type text,
  p_tags text[],
  p_collections text[]
)
returns public.hardware_import_category_rules
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.hardware_import_category_rules r
  where r.is_active
    and (
      (r.match_field = 'category' and r.match_normalized = private.hardware_identity_text(p_category))
      or (r.match_field = 'product_type' and r.match_normalized = private.hardware_identity_text(p_product_type))
      or (r.match_field = 'tag' and r.match_normalized in (
        select private.hardware_identity_text(t) from unnest(coalesce(p_tags, '{}')) t))
      or (r.match_field = 'collection' and r.match_normalized in (
        select private.hardware_identity_text(c) from unnest(coalesce(p_collections, '{}')) c))
    )
  order by r.priority,
    case r.match_field when 'category' then 1 when 'product_type' then 2 when 'tag' then 3 else 4 end,
    r.created_at
  limit 1;
$$;

-- Works out an item's proposal and match from its Shopify facts, its manual corrections and the registry as it is now.
-- Imported and skipped items keep their outcome.
create or replace function private.hardware_import_evaluate(p_item_id uuid)
returns public.hardware_import_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.hardware_import_items;
  v_rule public.hardware_import_category_rules;
  v_link public.hardware_shopify_links;
  v_variant_ids text[];
  v_exact uuid;
  v_candidates jsonb := '[]'::jsonb;
  v_reasons text[] := '{}';
  v_status text;
  v_decision text;
  v_target uuid;
begin
  select * into v from public.hardware_import_items where id = p_item_id for update;
  if not found then
    raise exception 'import_item_not_found' using errcode = 'PT404';
  end if;
  if v.status in ('imported', 'skipped') then
    return v;
  end if;

  -- Category: a manual choice stands; otherwise the first matching rule.
  if v.category_source is distinct from 'manual' then
    select * into v_rule from private.hardware_import_rule_for(v.shopify_category, v.product_type, v.tags, v.collections);
    if v_rule.id is not null then
      v.rule_id := v_rule.id;
      v.category_id := v_rule.category_id;
      v.category_source := 'rule';
      v.excluded := v_rule.category_id is null;
    else
      v.rule_id := null;
      v.category_id := null;
      v.category_source := null;
      v.excluded := false;
    end if;
  else
    v.excluded := false;
  end if;

  -- Manufacturer: a manual choice stands; otherwise the vendor, if it's a registered manufacturer.
  if v.manufacturer_source is distinct from 'manual' then
    select m.id into v.manufacturer_id
    from public.hardware_manufacturers m
    where m.is_active and m.identity = private.hardware_identity_text(v.vendor) and v.vendor is not null
    limit 1;
    v.manufacturer_source := case when v.manufacturer_id is null then null else 'vendor' end;
  end if;
  if v.model_name is null then
    v.model_name := left(private.hardware_clean_text(v.title), 120);
  end if;

  -- Already linked: the product, or any of its variants.
  select array_agg(e ->> 'id') into v_variant_ids from jsonb_array_elements(v.variants) e;
  select * into v_link from public.hardware_shopify_links l
  where l.status = 'active'
    and (l.shopify_product_id = v.shopify_product_id or l.shopify_variant_id = any (coalesce(v_variant_ids, '{}')))
  order by (l.shopify_variant_id is null) desc, l.created_at
  limit 1;

  v_decision := v.decision;
  v_target := v.target_model_id;
  v.existing_link_id := null;
  v.match_model_id := null;

  if v_link.id is not null then
    v_status := 'already_linked';
    v.existing_link_id := v_link.id;
    v.match_model_id := v_link.model_id;
  elsif v.excluded then
    v_status := 'excluded';
    v_reasons := array['A category rule marks this product as not PC hardware'];
  elsif v.category_id is null then
    v_status := 'unmapped';
    v_reasons := array['No category rule matches this product: choose its category, or add a rule'];
  elsif v.manufacturer_id is null then
    v_status := 'needs_review';
    v_reasons := array['Choose the manufacturer: the Shopify vendor isn''t a manufacturer in the registry'];
  else
    select m.id into v_exact
    from public.hardware_models m
    where m.category_id = v.category_id and m.manufacturer_id = v.manufacturer_id and m.status = 'active'
      and not m.is_base
      and m.identity = private.hardware_identity_text(v.model_name) || '|' || private.hardware_identity_text(v.model_number)
    limit 1;
    if v_exact is not null then
      v_status := 'exact_match';
      v.match_model_id := v_exact;
    else
      v_candidates := private.hardware_possible_duplicates(v.category_id, v.manufacturer_id, v.model_name, v.model_number, null);
      v_status := case when jsonb_array_length(v_candidates) > 0 then 'possible_duplicate' else 'eligible' end;
      if v_status = 'possible_duplicate' then
        v_reasons := array['Similar models exist: link to one of them, or confirm this is a different product'];
      end if;
    end if;
  end if;
  -- A decision that no longer fits the status is reset to the default for it.
  if v_status = 'already_linked' then
    if v_decision is distinct from 'refresh_link' then v_decision := 'skip'; end if;
    v_target := v.match_model_id;
  elsif v_status = 'exact_match' then
    if v_decision is distinct from 'skip' then v_decision := 'link_existing'; end if;
    v_target := v.match_model_id;
  elsif v_status = 'eligible' then
    if v_decision is null or v_decision not in ('import_new', 'skip') then v_decision := 'import_new'; end if;
    v_target := null;
  elsif v_status = 'possible_duplicate' then
    if v_decision = 'link_existing' and v_target is not null and exists (
      select 1 from jsonb_array_elements(v_candidates) c where (c ->> 'id')::uuid = v_target
    ) then
      null;
    elsif v_decision = 'import_new' and v.confirm_distinct then
      v_target := null;
    elsif v_decision = 'skip' then
      v_target := null;
    else
      v_decision := null;
      v_target := null;
    end if;
  else
    v_decision := case when v_status = 'excluded' then 'skip' else null end;
    v_target := null;
  end if;

  update public.hardware_import_items
  set category_id = v.category_id, category_source = v.category_source, rule_id = v.rule_id, excluded = v.excluded,
      manufacturer_id = v.manufacturer_id, manufacturer_source = v.manufacturer_source, model_name = v.model_name,
      status = v_status,
      review_reasons = v_reasons, existing_link_id = v.existing_link_id, match_model_id = v.match_model_id,
      duplicate_candidates = v_candidates, decision = v_decision, target_model_id = v_target, updated_at = now()
  where id = p_item_id
  returning * into v;
  return v;
end;
$$;

-- Recomputes a session's counts from its items.
create or replace function private.hardware_import_count(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'discovered', count(*),
    'eligible', count(*) filter (where status = 'eligible'),
    'already_linked', count(*) filter (where status = 'already_linked'),
    'exact_match', count(*) filter (where status = 'exact_match'),
    'possible_duplicate', count(*) filter (where status = 'possible_duplicate'),
    'unmapped', count(*) filter (where status = 'unmapped'),
    'needs_review', count(*) filter (where status = 'needs_review'),
    'excluded', count(*) filter (where status = 'excluded'),
    'imported', count(*) filter (where status = 'imported' and result_action = 'created_model'),
    'linked', count(*) filter (where status = 'imported' and result_action in ('linked_existing', 'refreshed_link', 'already_linked')),
    'skipped', count(*) filter (where status = 'skipped'),
    'failed', count(*) filter (where status = 'failed' or (error is not null and status not in ('imported', 'skipped')))
  )
  from public.hardware_import_items where session_id = p_session_id;
$$;

revoke all on function private.hardware_import_rule_for(text, text, text[], text[]) from public, anon, authenticated, service_role;
revoke all on function private.hardware_import_evaluate(uuid) from public, anon, authenticated, service_role;
revoke all on function private.hardware_import_count(uuid) from public, anon, authenticated, service_role;

-- ─── Discovery (the Edge Function, service role) ────────────────────────────────────────────────────

-- Starts a discovery session for a verified Admin or Staff caller.
create or replace function public.hardware_import_begin(p_actor uuid, p_actor_role text)
returns public.hardware_import_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.hardware_import_sessions;
begin
  if p_actor is null or p_actor_role not in ('portal_admin', 'quotation_staff') then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  insert into public.hardware_import_sessions (started_by, started_role) values (p_actor, p_actor_role)
  returning * into v_row;
  perform private.hardware_log('import_discovery_started', p_actor_role, p_actor => p_actor,
    p_details => jsonb_build_object('session_id', v_row.id));
  return v_row;
end;
$$;

-- Stages a page of normalised Shopify products into a discovering session and evaluates each.
create or replace function public.hardware_import_stage(p_session_id uuid, p_products jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.hardware_import_sessions;
  v_product jsonb;
  v_item_id uuid;
  v_count integer := 0;
begin
  select * into v_session from public.hardware_import_sessions where id = p_session_id for update;
  if not found then
    raise exception 'import_session_not_found' using errcode = 'PT404';
  end if;
  if v_session.status <> 'discovering' then
    raise exception 'import_session_not_discovering' using errcode = 'PT409';
  end if;
  if p_products is null or jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) > 250 then
    raise exception 'products_invalid' using errcode = '22023';
  end if;
  for v_product in select value from jsonb_array_elements(p_products) loop
    if jsonb_typeof(v_product) <> 'object'
       or coalesce(v_product ->> 'id', '') !~ '^gid://shopify/Product/[0-9]+$'
       or char_length(btrim(coalesce(v_product ->> 'title', ''))) = 0
       or jsonb_typeof(coalesce(v_product -> 'variants', '[]'::jsonb)) <> 'array' then
      raise exception 'product_invalid' using errcode = '22023';
    end if;
    insert into public.hardware_import_items (
      session_id, shopify_product_id, handle, title, vendor, product_type, shopify_category, tags, collections,
      image_url, available_for_sale, variants, suggested_category_id
    ) values (
      p_session_id, v_product ->> 'id', left(v_product ->> 'handle', 300), left(btrim(v_product ->> 'title'), 300),
      left(nullif(btrim(coalesce(v_product ->> 'vendor', '')), ''), 120),
      left(nullif(btrim(coalesce(v_product ->> 'productType', '')), ''), 120),
      left(nullif(btrim(coalesce(v_product ->> 'category', '')), ''), 120),
      coalesce((select array_agg(left(t, 120)) from jsonb_array_elements_text(coalesce(v_product -> 'tags', '[]'::jsonb)) t), '{}'),
      coalesce((select array_agg(left(c, 120)) from jsonb_array_elements_text(coalesce(v_product -> 'collections', '[]'::jsonb)) c), '{}'),
      left(v_product ->> 'imageUrl', 1000), (v_product ->> 'availableForSale')::boolean,
      coalesce(v_product -> 'variants', '[]'::jsonb),
      (select c.id from public.hardware_categories c where c.id = v_product ->> 'suggestedCategory')
    )
    on conflict (session_id, shopify_product_id) do update
      set title = excluded.title, handle = excluded.handle, vendor = excluded.vendor,
          product_type = excluded.product_type, shopify_category = excluded.shopify_category, tags = excluded.tags,
          collections = excluded.collections, image_url = excluded.image_url,
          available_for_sale = excluded.available_for_sale, variants = excluded.variants,
          suggested_category_id = excluded.suggested_category_id, updated_at = now()
    returning id into v_item_id;
    perform private.hardware_import_evaluate(v_item_id);
    v_count := v_count + 1;
  end loop;
  update public.hardware_import_sessions set pages = pages + 1, updated_at = now() where id = p_session_id;
  return v_count;
end;
$$;

-- Ends discovery: ready for review, or failed with the reason.
create or replace function public.hardware_import_finish_discovery(p_session_id uuid, p_error jsonb)
returns public.hardware_import_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.hardware_import_sessions;
begin
  update public.hardware_import_sessions
  set status = case when p_error is null then 'ready' else 'failed' end, error = p_error,
      discovered_at = now(), counts = private.hardware_import_count(p_session_id), updated_at = now(),
      completed_at = case when p_error is null then null else now() end
  where id = p_session_id and status = 'discovering'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'import_session_not_discovering' using errcode = 'PT409';
  end if;
  perform private.hardware_log('import_discovery_finished', 'system', p_actor => v_row.started_by,
    p_details => jsonb_build_object('session_id', v_row.id, 'counts', v_row.counts, 'error', p_error));
  return v_row;
end;
$$;

-- ─── Review (Admin and Staff) ───────────────────────────────────────────────────────────────────────

-- Corrects an item and chooses what its import does. Null arguments keep the current value; p_clear_category resets
-- the category to the rules' choice.
create or replace function public.staff_update_import_item(
  p_item_id uuid,
  p_expected_version integer,
  p_category_id text,
  p_manufacturer_id uuid,
  p_model_name text,
  p_model_number text,
  p_decision text,
  p_target_model_id uuid,
  p_confirm_distinct boolean
)
returns public.hardware_import_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_old public.hardware_import_items;
  v_row public.hardware_import_items;
  v_name text := nullif(private.hardware_clean_text(p_model_name), '');
  v_number text := nullif(private.hardware_clean_text(p_model_number), '');
  v_target public.hardware_models;
begin
  select * into v_old from public.hardware_import_items where id = p_item_id for update;
  if not found then
    raise exception 'import_item_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_old.version <> p_expected_version then
    raise exception 'stale_version'
      using errcode = 'PT409', detail = jsonb_build_object('current_version', v_old.version)::text;
  end if;
  if v_old.status in ('imported') then
    raise exception 'import_item_done' using errcode = 'PT409';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.hardware_categories c where c.id = p_category_id and c.is_active
  ) then
    raise exception 'category_invalid' using errcode = '22023';
  end if;
  if p_manufacturer_id is not null and not exists (
    select 1 from public.hardware_manufacturers m where m.id = p_manufacturer_id and m.is_active
  ) then
    raise exception 'manufacturer_invalid' using errcode = '22023';
  end if;
  if p_model_name is not null and (v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120) then
    raise exception 'model_name_invalid' using errcode = '22023';
  end if;
  if v_number is not null and char_length(v_number) > 80 then
    raise exception 'model_number_invalid' using errcode = '22023';
  end if;
  if p_decision is not null and p_decision not in ('import_new', 'link_existing', 'refresh_link', 'skip') then
    raise exception 'decision_invalid' using errcode = '22023';
  end if;
  if p_target_model_id is not null then
    select * into v_target from public.hardware_models where id = p_target_model_id;
    if not found or v_target.status <> 'active' or v_target.is_base then
      raise exception 'model_not_linkable' using errcode = 'PT409';
    end if;
  end if;

  update public.hardware_import_items
  set category_id = coalesce(p_category_id, category_id),
      category_source = case when p_category_id is not null then 'manual' else category_source end,
      manufacturer_id = coalesce(p_manufacturer_id, manufacturer_id),
      manufacturer_source = case when p_manufacturer_id is not null then 'manual' else manufacturer_source end,
      model_name = coalesce(v_name, model_name),
      model_number = case when p_model_number is null then model_number else v_number end,
      decision = coalesce(p_decision, decision),
      target_model_id = case when p_decision is not null then p_target_model_id else target_model_id end,
      confirm_distinct = coalesce(p_confirm_distinct, confirm_distinct),
      status = case when status = 'skipped' and p_decision is not null and p_decision <> 'skip' then 'needs_review' else status end,
      version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = p_item_id;
  v_row := private.hardware_import_evaluate(p_item_id);
  -- A decision the evaluation couldn't keep (it doesn't fit the item's status) is refused rather than dropped.
  if p_decision is not null and v_row.decision is distinct from p_decision then
    raise exception 'decision_not_allowed'
      using errcode = 'PT409', detail = jsonb_build_object('status', v_row.status)::text;
  end if;
  perform private.hardware_log('import_item_updated', v_role, p_model_id => v_row.target_model_id,
    p_category_id => v_row.category_id,
    p_previous => jsonb_build_object('category_id', v_old.category_id, 'manufacturer_id', v_old.manufacturer_id,
      'model_name', v_old.model_name, 'model_number', v_old.model_number, 'decision', v_old.decision, 'status', v_old.status),
    p_new => jsonb_build_object('category_id', v_row.category_id, 'manufacturer_id', v_row.manufacturer_id,
      'model_name', v_row.model_name, 'model_number', v_row.model_number, 'decision', v_row.decision, 'status', v_row.status),
    p_details => jsonb_build_object('session_id', v_row.session_id, 'item_id', v_row.id,
      'shopify_product_id', v_row.shopify_product_id, 'title', v_row.title));
  return v_row;
end;
$$;

-- Re-evaluates every open item of a session against the rules and registry as they are now (after a rule or
-- manufacturer change).
create or replace function public.staff_reevaluate_import_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_item uuid;
begin
  perform v_role;
  if not exists (select 1 from public.hardware_import_sessions where id = p_session_id) then
    raise exception 'import_session_not_found' using errcode = 'PT404';
  end if;
  for v_item in select id from public.hardware_import_items where session_id = p_session_id and status not in ('imported', 'skipped') loop
    perform private.hardware_import_evaluate(v_item);
  end loop;
  update public.hardware_import_sessions set counts = private.hardware_import_count(p_session_id), updated_at = now()
  where id = p_session_id;
  return private.hardware_import_count(p_session_id);
end;
$$;

-- ─── Import (Admin and Staff) ───────────────────────────────────────────────────────────────────────

-- Imports the chosen items, each in its own subtransaction: one failure is recorded on its item and never undoes the
-- others. Each item is evaluated again first, so a repeated or concurrent import never creates a second model or link.
-- New models are created with no specifications; nothing about an existing model's specification is ever changed.
create or replace function public.staff_import_items(p_session_id uuid, p_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_actor_role();
  v_session public.hardware_import_sessions;
  v_item public.hardware_import_items;
  v_id uuid;
  v_model public.hardware_models;
  v_link public.hardware_shopify_links;
  v_action text;
  v_results jsonb := '[]'::jsonb;
  v_message text;
  v_detail text;
begin
  select * into v_session from public.hardware_import_sessions where id = p_session_id for update;
  if not found then
    raise exception 'import_session_not_found' using errcode = 'PT404';
  end if;
  if v_session.status not in ('ready', 'importing', 'completed') then
    raise exception 'import_session_not_ready' using errcode = 'PT409';
  end if;
  if p_item_ids is null or cardinality(p_item_ids) = 0 or cardinality(p_item_ids) > 200 then
    raise exception 'items_invalid' using errcode = '22023';
  end if;
  update public.hardware_import_sessions set status = 'importing', updated_at = now() where id = p_session_id;

  foreach v_id in array p_item_ids loop
    v_action := null;
    begin
      select * into v_item from public.hardware_import_items where id = v_id and session_id = p_session_id for update;
      if not found then
        raise exception 'import_item_not_found' using errcode = 'PT404';
      end if;
      if v_item.status = 'imported' then
        v_results := v_results || jsonb_build_object('item_id', v_id, 'status', 'imported', 'action', v_item.result_action, 'repeat', true);
        continue;
      end if;
      v_item := private.hardware_import_evaluate(v_id);

      if v_item.decision is null then
        raise exception 'decision_required' using errcode = 'PT409',
          detail = jsonb_build_object('status', v_item.status, 'reasons', v_item.review_reasons)::text;
      elsif v_item.decision = 'skip' then
        v_action := 'skipped';
        update public.hardware_import_items set status = 'skipped', result_action = 'skipped', error = null,
          attempts = attempts + 1, updated_by = auth.uid(), updated_at = now() where id = v_id;
        perform private.hardware_log('import_item_skipped', v_role, p_model_id => v_item.match_model_id,
          p_details => jsonb_build_object('session_id', p_session_id, 'item_id', v_id, 'shopify_product_id', v_item.shopify_product_id));
      elsif v_item.status = 'already_linked' then
        select * into v_link from public.hardware_shopify_links where id = v_item.existing_link_id for update;
        if v_item.decision = 'refresh_link' then
          -- Only Shopify's own facts about the listing: never the model or its specification.
          update public.hardware_shopify_links
          set product_title = left(v_item.title, 255), version = version + 1, updated_at = now(), updated_by = auth.uid()
          where id = v_link.id and product_title is distinct from left(v_item.title, 255);
          v_action := 'refreshed_link';
          perform private.hardware_log('import_item_refreshed', v_role, p_model_id => v_link.model_id, p_link_id => v_link.id,
            p_previous => jsonb_build_object('product_title', v_link.product_title),
            p_new => jsonb_build_object('product_title', left(v_item.title, 255)),
            p_details => jsonb_build_object('session_id', p_session_id, 'item_id', v_id));
        else
          v_action := 'already_linked';
        end if;
        update public.hardware_import_items set status = 'imported', result_action = v_action,
          result_model_id = v_link.model_id, result_link_id = v_link.id, error = null, attempts = attempts + 1,
          updated_by = auth.uid(), updated_at = now() where id = v_id;
      elsif v_item.decision = 'link_existing' then
        v_link := public.staff_link_shopify_listing(v_item.target_model_id, v_item.shopify_product_id, null,
          v_item.title, null, 'Linked by the Shopify importer');
        v_action := 'linked_existing';
        update public.hardware_import_items set status = 'imported', result_action = v_action,
          result_model_id = v_item.target_model_id, result_link_id = v_link.id, error = null, attempts = attempts + 1,
          updated_by = auth.uid(), updated_at = now() where id = v_id;
        perform private.hardware_log('import_item_linked', v_role, p_model_id => v_item.target_model_id, p_link_id => v_link.id,
          p_details => jsonb_build_object('session_id', p_session_id, 'item_id', v_id, 'shopify_product_id', v_item.shopify_product_id));
      elsif v_item.decision = 'import_new' then
        v_model := public.staff_create_hardware_model(v_item.category_id, v_item.manufacturer_id, v_item.model_name,
          v_item.model_number, false, null, null, '{}'::jsonb, v_item.status = 'possible_duplicate' and v_item.confirm_distinct,
          'Imported from Shopify');
        v_link := public.staff_link_shopify_listing(v_model.id, v_item.shopify_product_id, null, v_item.title, null,
          'Linked by the Shopify importer');
        v_action := 'created_model';
        update public.hardware_import_items set status = 'imported', result_action = v_action,
          result_model_id = v_model.id, result_link_id = v_link.id, error = null, attempts = attempts + 1,
          updated_by = auth.uid(), updated_at = now() where id = v_id;
        perform private.hardware_log('import_item_imported', v_role, p_model_id => v_model.id, p_link_id => v_link.id,
          p_category_id => v_model.category_id,
          p_new => jsonb_build_object('model_name', v_model.model_name, 'model_number', v_model.model_number),
          p_details => jsonb_build_object('session_id', p_session_id, 'item_id', v_id, 'shopify_product_id', v_item.shopify_product_id));
      else
        raise exception 'decision_not_allowed' using errcode = 'PT409';
      end if;
      v_results := v_results || jsonb_build_object('item_id', v_id, 'status', case when v_action = 'skipped' then 'skipped' else 'imported' end, 'action', v_action);
    exception when others then
      get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail;
      -- The item's own changes are undone by the subtransaction; record why on the item.
      update public.hardware_import_items
      set status = 'failed', error = jsonb_build_object('code', v_message, 'detail', v_detail),
          attempts = attempts + 1, updated_by = auth.uid(), updated_at = now()
      where id = v_id and session_id = p_session_id;
      perform private.hardware_log('import_item_failed', v_role,
        p_details => jsonb_build_object('session_id', p_session_id, 'item_id', v_id, 'error', v_message));
      v_results := v_results || jsonb_build_object('item_id', v_id, 'status', 'failed', 'error', v_message, 'detail', v_detail);
    end;
  end loop;

  update public.hardware_import_sessions
  set status = 'completed', completed_at = now(), counts = private.hardware_import_count(p_session_id), updated_at = now()
  where id = p_session_id;
  return jsonb_build_object('results', v_results, 'counts', private.hardware_import_count(p_session_id));
end;
$$;

-- ─── Category rules (administrators) ────────────────────────────────────────────────────────────────

-- Creates (p_id null) or updates a rule. p_category_id null means "not hardware". Switch a rule off with p_is_active.
create or replace function public.staff_save_import_category_rule(
  p_id uuid,
  p_expected_version integer,
  p_match_field text,
  p_match_value text,
  p_category_id text,
  p_priority integer,
  p_is_active boolean,
  p_note text
)
returns public.hardware_import_category_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.hardware_admin_role();
  v_old public.hardware_import_category_rules;
  v_row public.hardware_import_category_rules;
  v_value text := private.hardware_clean_text(p_match_value);
begin
  if p_match_field not in ('category', 'product_type', 'tag', 'collection') then
    raise exception 'match_field_invalid' using errcode = '22023';
  end if;
  if char_length(v_value) < 1 or char_length(v_value) > 120 or private.hardware_identity_text(v_value) = '' then
    raise exception 'match_value_invalid' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (select 1 from public.hardware_categories c where c.id = p_category_id) then
    raise exception 'category_invalid' using errcode = '22023';
  end if;
  if p_priority is not null and (p_priority < 0 or p_priority > 10000) then
    raise exception 'priority_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.hardware_import_category_rules r
    where r.match_field = p_match_field and r.match_normalized = private.hardware_identity_text(v_value)
      and (p_id is null or r.id <> p_id)
  ) then
    raise exception 'duplicate_rule' using errcode = 'PT409';
  end if;

  if p_id is null then
    insert into public.hardware_import_category_rules (match_field, match_value, category_id, priority, is_active, note, updated_by)
    values (p_match_field, v_value, p_category_id, coalesce(p_priority, 100), coalesce(p_is_active, true),
      nullif(private.hardware_clean_text(p_note), ''), auth.uid())
    returning * into v_row;
  else
    select * into v_old from public.hardware_import_category_rules where id = p_id for update;
    if not found then
      raise exception 'rule_not_found' using errcode = 'PT404';
    end if;
    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception 'stale_version'
        using errcode = 'PT409', detail = jsonb_build_object('current_version', v_old.version)::text;
    end if;
    update public.hardware_import_category_rules
    set match_field = p_match_field, match_value = v_value, category_id = p_category_id,
        priority = coalesce(p_priority, priority), is_active = coalesce(p_is_active, is_active),
        note = nullif(private.hardware_clean_text(p_note), ''), version = version + 1, updated_at = now(),
        updated_by = auth.uid()
    where id = p_id
    returning * into v_row;
  end if;
  perform private.hardware_log('import_rule_changed', v_role, p_category_id => v_row.category_id,
    p_previous => case when v_old.id is null then null else jsonb_build_object('match_field', v_old.match_field,
      'match_value', v_old.match_value, 'category_id', v_old.category_id, 'priority', v_old.priority, 'is_active', v_old.is_active) end,
    p_new => jsonb_build_object('match_field', v_row.match_field, 'match_value', v_row.match_value,
      'category_id', v_row.category_id, 'priority', v_row.priority, 'is_active', v_row.is_active));
  return v_row;
end;
$$;

-- ─── Function access ─────────────────────────────────────────────────────────────────────────────────

revoke all on function public.hardware_import_begin(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.hardware_import_stage(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.hardware_import_finish_discovery(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.staff_update_import_item(uuid, integer, text, uuid, text, text, text, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_reevaluate_import_session(uuid) from public, anon, authenticated, service_role;
revoke all on function public.staff_import_items(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.staff_save_import_category_rule(uuid, integer, text, text, text, integer, boolean, text)
  from public, anon, authenticated, service_role;

grant execute on function public.hardware_import_begin(uuid, text) to service_role;
grant execute on function public.hardware_import_stage(uuid, jsonb) to service_role;
grant execute on function public.hardware_import_finish_discovery(uuid, jsonb) to service_role;
grant execute on function public.staff_update_import_item(uuid, integer, text, uuid, text, text, text, uuid, boolean)
  to authenticated;
grant execute on function public.staff_reevaluate_import_session(uuid) to authenticated;
grant execute on function public.staff_import_items(uuid, uuid[]) to authenticated;
grant execute on function public.staff_save_import_category_rule(uuid, integer, text, text, text, integer, boolean, text)
  to authenticated;
