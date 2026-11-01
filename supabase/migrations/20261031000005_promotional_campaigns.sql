-- supabase/migrations/20261031000005_promotional_campaigns.sql
-- IT HUB Promotional Campaign Manager & Homepage Hero Carousel
-- Schema, RLS, Storage Bucket & Realtime Publication

-- 1. Create promotional_campaigns Table
create table if not exists public.promotional_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  badge text,
  image_url text not null,
  mobile_image_url text,
  destination_type text not null default 'product' check (destination_type in ('product', 'category', 'service', 'url')),
  destination_ref text,
  destination_url text not null default '/products',
  cta_label text default 'Explore Now',
  starts_at timestamptz default now(),
  ends_at timestamptz,
  show_countdown boolean not null default false,
  countdown_heading text default 'ENDS IN',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'paused', 'expired', 'archived')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- 2. Indexes for Performance and Queries
create index if not exists promotional_campaigns_status_idx
  on public.promotional_campaigns (status);

create index if not exists promotional_campaigns_display_order_idx
  on public.promotional_campaigns (display_order asc, created_at desc);

create index if not exists promotional_campaigns_schedule_idx
  on public.promotional_campaigns (starts_at, ends_at);

-- 3. Row Level Security (RLS)
alter table public.promotional_campaigns enable row level security;

-- Public can view published campaigns that have started and not expired (or staff can view all)
drop policy if exists promotional_campaigns_public_read on public.promotional_campaigns;
create policy promotional_campaigns_public_read on public.promotional_campaigns
  for select using (
    (
      status = 'published'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    )
    or public.is_staff()
  );

-- Staff can insert, update, and delete all campaigns
drop policy if exists promotional_campaigns_staff_manage on public.promotional_campaigns;
create policy promotional_campaigns_staff_manage on public.promotional_campaigns
  for all using (public.is_staff())
  with check (public.is_staff());

-- 4. Grants
grant select on public.promotional_campaigns to anon, authenticated;
grant insert, update, delete on public.promotional_campaigns to authenticated;

-- 5. Realtime Publication & Replica Identity
alter table public.promotional_campaigns replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promotional_campaigns'
  ) then
    alter publication supabase_realtime add table public.promotional_campaigns;
  end if;
end $$;

-- 6. Audit Logging Support
do $$
begin
  alter table public.staff_audit_logs drop constraint if exists staff_audit_logs_entity_type_check;
  alter table public.staff_audit_logs add constraint staff_audit_logs_entity_type_check
    check (entity_type in ('pc_quotation', 'service_request', 'staff_membership', 'store_settings', 'announcement', 'sell_request', 'review', 'partner_certificate', 'website_showcase', 'promotional_campaign'));
exception when others then
  null;
end $$;

-- 7. Supabase Storage Bucket for Promotional Banners
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promotional-banners', 'promotional-banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

-- Storage Policies
drop policy if exists "Promotional Banners Public Select" on storage.objects;
create policy "Promotional Banners Public Select" on storage.objects
  for select using (bucket_id = 'promotional-banners');

drop policy if exists "Promotional Banners Staff Insert" on storage.objects;
create policy "Promotional Banners Staff Insert" on storage.objects
  for insert with check (bucket_id = 'promotional-banners' and public.is_staff());

drop policy if exists "Promotional Banners Staff Update" on storage.objects;
create policy "Promotional Banners Staff Update" on storage.objects
  for update using (bucket_id = 'promotional-banners' and public.is_staff());

drop policy if exists "Promotional Banners Staff Delete" on storage.objects;
create policy "Promotional Banners Staff Delete" on storage.objects
  for delete using (bucket_id = 'promotional-banners' and public.is_staff());
