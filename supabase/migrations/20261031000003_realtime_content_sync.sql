-- 20261031000003_realtime_content_sync.sql
-- IT HUB Storefront Realtime Content Synchronization
-- Enables Supabase Realtime postgres_changes broadcast for published content tables:
-- 1. public.partner_certificates
-- 2. public.website_showcase
-- 3. public.announcements
-- 4. public.store_settings
-- 5. public.it_hub_locations

-- 1. Ensure announcements schema supports banner messages and date windows
alter table public.announcements
  alter column headline drop not null,
  add column if not exists message text,
  add column if not exists cta_url text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

-- Set default values for backwards compatibility
alter table public.announcements
  alter column headline set default '';

-- Grant staff access and update RLS policies for announcements
drop policy if exists announcements_staff_all on public.announcements;
create policy announcements_staff_all on public.announcements
  for all using (public.is_staff());

drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read on public.announcements
  for select using (
    is_active = true
    and (is_draft is not true)
    and (start_date is null or start_date <= now())
    and (end_date is null or end_date >= now())
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

-- 2. Ensure REPLICA IDENTITY FULL so UPDATE and DELETE events carry full old record payloads
alter table public.partner_certificates replica identity full;
alter table public.website_showcase replica identity full;
alter table public.announcements replica identity full;
alter table public.store_settings replica identity full;
alter table public.it_hub_locations replica identity full;

-- 3. Register tables into the supabase_realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'partner_certificates'
  ) then
    alter publication supabase_realtime add table public.partner_certificates;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'website_showcase'
  ) then
    alter publication supabase_realtime add table public.website_showcase;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_settings'
  ) then
    alter publication supabase_realtime add table public.store_settings;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'it_hub_locations'
  ) then
    alter publication supabase_realtime add table public.it_hub_locations;
  end if;
end;
$$;

-- 4. Re-seed & guarantee canonical Intel Partner Alliance record
insert into public.partner_certificates (
  id, text, brand, category, status, validity, description, image, alt, shop_url, display_order, is_published
)
values (
  'cert-intel',
  'Intel Partner Alliance',
  'Intel',
  'Processors & Systems',
  'Alliance Member',
  'Active Member',
  'Official Intel® Partner Alliance Member delivering authentic Core processors, boxed CPUs, and certified desktop computing solutions.',
  '/images/about-store.png',
  'Intel Partner Alliance Membership Certificate for IT HUB',
  '/products?brand=Intel',
  6,
  true
)
on conflict (id) do update set
  text = excluded.text,
  brand = excluded.brand,
  category = excluded.category,
  status = excluded.status,
  validity = excluded.validity,
  description = excluded.description,
  image = excluded.image,
  alt = excluded.alt,
  shop_url = excluded.shop_url,
  display_order = excluded.display_order,
  is_published = excluded.is_published,
  updated_at = now();
