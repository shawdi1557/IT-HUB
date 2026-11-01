-- ============================================================================
-- IT HUB — Staff Portal to Customer Storefront Integration
-- Migration: 20261031000002_staff_portal_storefront_integration.sql
-- Module: Certificates & Partnerships, Website Showcase, Authoritative Store Settings
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PARTNER CERTIFICATES TABLE
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.partner_certificates (
  id text primary key,
  text text not null,
  brand text not null,
  category text not null,
  status text not null default 'Active Member',
  validity text not null default '2026 Certified',
  description text not null default '',
  image text not null,
  alt text not null default '',
  shop_url text,
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_certificates_published_idx
  on public.partner_certificates (is_published, display_order);

alter table public.partner_certificates enable row level security;

-- Public can read published certificates; staff can view all (including unpublished)
drop policy if exists public_read_certificates on public.partner_certificates;
create policy public_read_certificates on public.partner_certificates
  for select using (is_published = true or public.is_staff());

-- Staff with portal admin role or staff access can manage certificates
drop policy if exists staff_manage_certificates on public.partner_certificates;
create policy staff_manage_certificates on public.partner_certificates
  for all using (public.is_staff());

grant select on public.partner_certificates to anon, authenticated;
grant insert, update, delete on public.partner_certificates to authenticated;

-- Seed the 6 verified canonical partner records
insert into public.partner_certificates (
  id, text, brand, category, status, validity, description, image, alt, shop_url, display_order, is_published
)
values
  (
    'cert-asus',
    'ASUS Premium Partner',
    'ASUS',
    'Laptops & Computing',
    'Authorised Premium Partner',
    '2026 Certified',
    'Certified ASUS Premium Partner 2026 — 100% authentic ROG, TUF, ZenBook laptops and motherboards with direct manufacturer warranty.',
    '/images/recognition/asus-premium-partner.jpg',
    'ASUS Premium Partner Certificate for IT HUB',
    '/products?brand=ASUS',
    1,
    true
  ),
  (
    'cert-canon',
    'Canon Authorised Reseller',
    'Canon',
    'Printers & Consumables',
    'Authorised Reseller',
    'Official Reseller',
    'Officially recognized Canon Reseller delivering genuine PIXMA & imageCLASS printers, high-yield toner cartridges, and expert support.',
    '/images/recognition/canon-authorised-reseller.jpg',
    'Canon Authorised Reseller Certificate for IT HUB',
    '/products?brand=Canon',
    2,
    true
  ),
  (
    'cert-epson',
    'Epson Channel Partner',
    'Epson',
    'EcoTank Printers & Supplies',
    'Certified Channel Partner',
    '2026 – 2027',
    'Officially accredited Epson Certified Channel Partner delivering genuine EcoTank printers, original inks, and imaging systems.',
    '/images/recognition/epson-channel-partner.jpg',
    'Epson Certified Channel Partner Certificate for IT HUB',
    '/products?brand=Epson',
    3,
    true
  ),
  (
    'cert-numeric',
    'Numeric Energy Partner',
    'Numeric',
    'UPS & Power Systems',
    'Authorised Energy Partner',
    'Authorised Partner',
    'Authorised sales and support partner for Numeric by Legrand power backup, line-interactive UPS, and energy storage solutions.',
    '/images/recognition/numeric-energy-partner.jpg',
    'Numeric Authorised Energy Partner Certificate for IT HUB',
    '/products?category=Power%20%26%20UPS',
    4,
    true
  ),
  (
    'cert-iggis',
    'IGGIS Honour & Recognition',
    'IGGIS',
    'Institutional IT Partner',
    'Excellence Recognition',
    'Partnership Award',
    'Honour & recognition awarded by Indira Gandhi Group of Institutions for exceptional technology supply and institutional support.',
    '/images/recognition/iggis-honour-recognition.jpg',
    'Indira Gandhi Group of Institutions recognition award presented to IT HUB',
    null,
    5,
    true
  ),
  (
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

-- ────────────────────────────────────────────────────────────────────────────
-- 2. WEBSITE SHOWCASE TABLE
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.website_showcase (
  id text primary key,
  src text not null,
  caption text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_showcase_active_idx
  on public.website_showcase (is_active, display_order);

alter table public.website_showcase enable row level security;

drop policy if exists public_read_showcase on public.website_showcase;
create policy public_read_showcase on public.website_showcase
  for select using (is_active = true or public.is_staff());

drop policy if exists staff_manage_showcase on public.website_showcase;
create policy staff_manage_showcase on public.website_showcase
  for all using (public.is_staff());

grant select on public.website_showcase to anon, authenticated;
grant insert, update, delete on public.website_showcase to authenticated;

-- Seed the 10 showroom showcase items
insert into public.website_showcase (id, src, caption, display_order, is_active)
values
  ('showcase-1', '/images/showcase/showcase-1.png', 'IT HUB Experience Store — Kothamangalam showroom floor and consultation desk', 1, true),
  ('showcase-2', '/images/showcase/showcase-2.png', 'Precision diagnostics & component repair bench', 2, true),
  ('showcase-3', '/images/showcase/showcase-3.png', 'Custom liquid-cooled gaming workstation assembly', 3, true),
  ('showcase-4', '/images/showcase/showcase-4.png', 'Authorized manufacturer display and genuine parts stock', 4, true),
  ('showcase-5', '/images/showcase/showcase-5.png', 'Enterprise networking & server configuration lab', 5, true),
  ('showcase-6', '/images/showcase/showcase-6.png', 'Mobile & laptop chip-level rework station', 6, true),
  ('showcase-7', '/images/showcase/showcase-7.png', 'Customer delivery & quality inspection counter', 7, true),
  ('showcase-8', '/images/showcase/showcase-8.png', 'Multi-monitor creator build with RTX 4090', 8, true),
  ('showcase-9', '/images/showcase/showcase-9.png', 'High-speed data recovery and NAS setup bench', 9, true),
  ('showcase-10', '/images/showcase/showcase-10.png', 'IT HUB customer handover & warranty setup', 10, true)
on conflict (id) do update set
  src = excluded.src,
  caption = excluded.caption,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. STORE SETTINGS ENHANCEMENTS & STAFF UPDATE POLICY
-- ────────────────────────────────────────────────────────────────────────────

alter table public.store_settings
  add column if not exists hours text default 'Mon - Sat: 9:30 AM - 7:30 PM',
  add column if not exists tagline text default 'Computers, Laptops, Sales & Repair Services',
  add column if not exists whatsapp_default_msg text default 'Hi IT HUB, I would like to inquire about a service or PC quotation.',
  add column if not exists city text default 'Kothamangalam, Kerala',
  add column if not exists pincode text default '686691',
  add column if not exists service_radius_km numeric(5,1) default 30.0,
  add column if not exists analytics_enabled boolean default true,
  add column if not exists mask_visitor_ip boolean default true;

update public.store_settings
set
  hours = coalesce(hours, 'Mon - Sat: 9:30 AM - 7:30 PM'),
  tagline = coalesce(tagline, 'Computers, Laptops, Sales & Repair Services'),
  whatsapp_default_msg = coalesce(whatsapp_default_msg, 'Hi IT HUB, I would like to inquire about a service or PC quotation.'),
  city = coalesce(city, 'Kothamangalam, Kerala'),
  pincode = coalesce(pincode, '686691'),
  service_radius_km = coalesce(service_radius_km, 30.0),
  analytics_enabled = coalesce(analytics_enabled, true),
  mask_visitor_ip = coalesce(mask_visitor_ip, true)
where id = 1;

-- Add RLS policy for staff updates on store_settings
drop policy if exists staff_update_store_settings on public.store_settings;
create policy staff_update_store_settings on public.store_settings
  for update using (public.is_staff());

grant update on public.store_settings to authenticated;

-- Add RLS policy for staff updates on it_hub_locations
drop policy if exists staff_update_it_hub_locations on public.it_hub_locations;
create policy staff_update_it_hub_locations on public.it_hub_locations
  for update using (public.is_staff());

grant update on public.it_hub_locations to authenticated;
