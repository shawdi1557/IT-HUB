-- Stage 4B-6 remediation (finding F-4B6-1): concurrent duplicates get the plain refusal.
--
-- The unique indexes of 20261112000001 already make a duplicate model, manufacturer or listing link impossible. But
-- when two staff members save the same identity at the same moment, both pass the functions' own duplicate check
-- (neither sees the other's uncommitted row), and the loser was refused by the index with a raw 23505 error, which
-- the portal can only show as "couldn't be saved".
--
-- These triggers take a transaction-scoped advisory lock on the identity before the row is written, then check again.
-- The second writer waits for the first to finish, sees its committed row, and is refused with the same code the
-- functions use (PT409 duplicate_model, duplicate_manufacturer, listing_already_linked). Nothing about access,
-- columns or the functions changes; the indexes stay the final guarantee.

create or replace function private.hardware_models_identity_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_identity text := private.hardware_identity_text(new.model_name) || '|' || private.hardware_identity_text(new.model_number);
begin
  if new.status <> 'active' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hardware_model|' || new.category_id || '|' || new.manufacturer_id || '|' || v_identity, 0));
  if exists (
    select 1 from public.hardware_models m
    where m.category_id = new.category_id and m.manufacturer_id = new.manufacturer_id and m.status = 'active'
      and m.identity = v_identity and m.id <> new.id
  ) then
    raise exception 'duplicate_model' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

create or replace function private.hardware_manufacturers_identity_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_identity text := private.hardware_identity_text(new.name);
begin
  perform pg_advisory_xact_lock(hashtextextended('hardware_manufacturer|' || v_identity, 0));
  if exists (select 1 from public.hardware_manufacturers m where m.identity = v_identity and m.id <> new.id) then
    raise exception 'duplicate_manufacturer' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

create or replace function private.hardware_links_listing_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.hardware_shopify_links;
begin
  if new.status <> 'active' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'hardware_link|' || coalesce(new.shopify_variant_id, new.shopify_product_id), 0
  ));
  select * into v_existing from public.hardware_shopify_links l
  where l.status = 'active' and l.id <> new.id
    and ((new.shopify_variant_id is not null and l.shopify_variant_id = new.shopify_variant_id)
      or (new.shopify_variant_id is null and l.shopify_variant_id is null and l.shopify_product_id = new.shopify_product_id))
  limit 1;
  if found then
    raise exception 'listing_already_linked' using errcode = 'PT409',
      detail = jsonb_build_object('link_id', v_existing.id, 'model_id', v_existing.model_id)::text;
  end if;
  return new;
end;
$$;

revoke all on function private.hardware_models_identity_guard() from public, anon, authenticated, service_role;
revoke all on function private.hardware_manufacturers_identity_guard() from public, anon, authenticated, service_role;
revoke all on function private.hardware_links_listing_guard() from public, anon, authenticated, service_role;

create trigger hardware_models_identity_guard
  before insert or update of model_name, model_number, category_id, manufacturer_id, status
  on public.hardware_models
  for each row execute function private.hardware_models_identity_guard();

create trigger hardware_manufacturers_identity_guard
  before insert or update of name
  on public.hardware_manufacturers
  for each row execute function private.hardware_manufacturers_identity_guard();

create trigger hardware_links_listing_guard
  before insert or update of shopify_product_id, shopify_variant_id, status
  on public.hardware_shopify_links
  for each row execute function private.hardware_links_listing_guard();
