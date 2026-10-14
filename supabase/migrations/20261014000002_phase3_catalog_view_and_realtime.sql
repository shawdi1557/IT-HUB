-- ============================================================================
-- Migration: Phase 3 Step 1 - Database View Enrichment & Realtime Publication
-- Target: Supabase / PostgreSQL
-- Features:
--   1. Enriches products_public view with brand, category, low_stock_threshold,
--      and primary image path from product_images.
--   2. Enforces security_invoker = on and cost_price shielding.
--   3. Idempotently registers public.inventory into supabase_realtime publication.
-- ============================================================================

begin;

-- 1. Re-create products_public view with enriched joins
drop view if exists public.products_public cascade;

create view public.products_public with (security_invoker = on, security_barrier = true) as
  select
    p.id,
    p.sku,
    p.name,
    p.brand_id,
    b.name as brand,
    p.category_id,
    c.name as category,
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
    coalesce(i.stock, 0) as stock,
    coalesce(i.low_stock_threshold, 3) as low_stock_threshold,
    coalesce(
      (
        select pi.storage_path
        from public.product_images pi
        where pi.product_id = p.id
        order by pi.position asc, pi.created_at asc
        limit 1
      ),
      '/images/photo-1616440347437-b1c73416efc2.jpg'
    ) as image_url
  from public.products p
  left join public.brands b on b.id = p.brand_id
  left join public.categories c on c.id = p.category_id
  left join public.inventory i on i.product_id = p.id
  where p.status = 'Active';

alter view public.products_public set (security_invoker = on, security_barrier = true);

-- 2. Explicit grants on joined display columns for security_invoker caller execution
grant select (id, name) on table public.brands to anon, authenticated;
grant select (id, name, parent_id) on table public.categories to anon, authenticated;
grant select (id, product_id, storage_path, position, created_at) on table public.product_images to anon, authenticated;
grant select on public.products_public to anon, authenticated;

-- 3. Idempotent Realtime publication registration
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory'
  ) then
    alter publication supabase_realtime add table public.inventory;
  end if;
end $$;

alter table public.inventory replica identity default;

commit;
