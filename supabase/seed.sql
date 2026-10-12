-- ============================================================================
-- IT HUB — Initial Configuration & Seed Data Script
-- Purpose: Populates foundational store categories, brands, locations, settings,
--          and templates required for storefront operation on a fresh install.
-- Execution: Run after supabase/schema.sql in Supabase SQL Editor or via CLI.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. STORE & ANALYTICS INITIAL CONFIGURATION (Kothamangalam, Kerala)
-- ────────────────────────────────────────────────────────────────────────────

insert into public.store_settings (id, store_name, address, phone, email, whatsapp_number, delivery_region)
values (
  1,
  'IT HUB',
  'Molathu Building, College Jn., Kothamangalam, Kerala - 686691',
  '+91 9847223886',
  'ithubkmgm@gmail.com',
  '919847223886',
  'Kerala'
)
on conflict (id) do update set
  store_name = excluded.store_name,
  address = excluded.address,
  phone = excluded.phone,
  email = excluded.email,
  whatsapp_number = excluded.whatsapp_number,
  delivery_region = excluded.delivery_region;

insert into public.analytics_settings (id, enabled, ip_logging, mask_ip, retention_days)
values (true, true, true, true, 90)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. FOUNDATIONAL PRODUCT CATEGORIES (CLIENT INVENTORY ALIGNED)
-- ────────────────────────────────────────────────────────────────────────────

insert into public.categories (id, name, parent_id)
values
  ('10000000-0000-0000-0000-000000000001', 'Laptops & MacBooks', null),
  ('10000000-0000-0000-0000-000000000002', 'Desktops, AIO & Servers', null),
  ('10000000-0000-0000-0000-000000000003', 'PC Components', null),
  ('10000000-0000-0000-0000-000000000004', 'Monitors & Displays', null),
  ('10000000-0000-0000-0000-000000000005', 'Storage & Memory', null),
  ('10000000-0000-0000-0000-000000000006', 'Printers, Scanners & POS', null),
  ('10000000-0000-0000-0000-000000000007', 'Inks, Toners & Cartridges', null),
  ('10000000-0000-0000-0000-000000000008', 'Mobile Phones & Tablets', null),
  ('10000000-0000-0000-0000-000000000009', 'Networking & CCTV', null),
  ('10000000-0000-0000-0000-000000000010', 'Audio & Smart Gadgets', null),
  ('10000000-0000-0000-0000-000000000020', 'Power, UPS & Inverters', null),
  ('10000000-0000-0000-0000-000000000030', 'Laptop Spares & Service Parts', null),
  ('10000000-0000-0000-0000-000000000040', 'Cables & Accessories', null)
on conflict (name) do nothing;

-- Subcategories under PC Components & Spares
insert into public.categories (id, name, parent_id)
values
  ('10000000-0000-0000-0000-000000000011', 'Processors (CPU)', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000012', 'Motherboards', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000013', 'Graphics Cards (GPU)', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000014', 'Power Supplies (SMPS)', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000015', 'Cabinets & Cases', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000016', 'CPU Coolers & Fans', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000017', 'RAM (DDR4 / DDR5)', '10000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000018', 'Solid State Drives (SSD)', '10000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000019', 'Hard Disk Drives (HDD)', '10000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000031', 'Replacement Laptop Screens', '10000000-0000-0000-0000-000000000030'),
  ('10000000-0000-0000-0000-000000000032', 'Replacement Laptop Keyboards', '10000000-0000-0000-0000-000000000030'),
  ('10000000-0000-0000-0000-000000000033', 'Laptop Adapters & Chargers', '10000000-0000-0000-0000-000000000030'),
  ('10000000-0000-0000-0000-000000000034', 'Laptop Batteries', '10000000-0000-0000-0000-000000000030')
on conflict (name) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. HARDWARE & OEM BRANDS (CLIENT INVENTORY EXTRACTED)
-- ────────────────────────────────────────────────────────────────────────────

insert into public.brands (id, name)
values
  ('20000000-0000-0000-0000-000000000001', 'Apple'),
  ('20000000-0000-0000-0000-000000000002', 'Dell'),
  ('20000000-0000-0000-0000-000000000003', 'HP'),
  ('20000000-0000-0000-0000-000000000004', 'Lenovo'),
  ('20000000-0000-0000-0000-000000000005', 'ASUS'),
  ('20000000-0000-0000-0000-000000000006', 'Acer'),
  ('20000000-0000-0000-0000-000000000007', 'MSI'),
  ('20000000-0000-0000-0000-000000000008', 'Samsung'),
  ('20000000-0000-0000-0000-000000000009', 'LG'),
  ('20000000-0000-0000-0000-000000000010', 'Intel'),
  ('20000000-0000-0000-0000-000000000011', 'AMD'),
  ('20000000-0000-0000-0000-000000000012', 'NVIDIA'),
  ('20000000-0000-0000-0000-000000000013', 'Logitech'),
  ('20000000-0000-0000-0000-000000000014', 'Crucial'),
  ('20000000-0000-0000-0000-000000000015', 'Corsair'),
  ('20000000-0000-0000-0000-000000000016', 'Kingston'),
  ('20000000-0000-0000-0000-000000000017', 'Western Digital'),
  ('20000000-0000-0000-0000-000000000018', 'Seagate'),
  ('20000000-0000-0000-0000-000000000019', 'SanDisk'),
  ('20000000-0000-0000-0000-000000000020', 'Gigabyte'),
  ('20000000-0000-0000-0000-000000000021', 'Cooler Master'),
  ('20000000-0000-0000-0000-000000000022', 'Deepcool'),
  ('20000000-0000-0000-0000-000000000023', 'Ant Esports'),
  ('20000000-0000-0000-0000-000000000024', 'Antec'),
  ('20000000-0000-0000-0000-000000000025', 'Zotac'),
  ('20000000-0000-0000-0000-000000000026', 'Colorful'),
  ('20000000-0000-0000-0000-000000000027', 'Sapphire'),
  ('20000000-0000-0000-0000-000000000028', 'Canon'),
  ('20000000-0000-0000-0000-000000000029', 'Epson'),
  ('20000000-0000-0000-0000-000000000030', 'Brother'),
  ('20000000-0000-0000-0000-000000000031', 'TVS-E'),
  ('20000000-0000-0000-0000-000000000032', 'TP-Link'),
  ('20000000-0000-0000-0000-000000000033', 'D-Link'),
  ('20000000-0000-0000-0000-000000000034', 'Tenda'),
  ('20000000-0000-0000-0000-000000000035', 'Hikvision'),
  ('20000000-0000-0000-0000-000000000036', 'CP Plus'),
  ('20000000-0000-0000-0000-000000000037', 'boAt'),
  ('20000000-0000-0000-0000-000000000038', 'Portronics'),
  ('20000000-0000-0000-0000-000000000039', 'Noise'),
  ('20000000-0000-0000-0000-000000000040', 'OnePlus'),
  ('20000000-0000-0000-0000-000000000041', 'Motorola'),
  ('20000000-0000-0000-0000-000000000042', 'Xiaomi / Redmi'),
  ('20000000-0000-0000-0000-000000000043', 'Realme'),
  ('20000000-0000-0000-0000-000000000044', 'iQOO'),
  ('20000000-0000-0000-0000-000000000045', 'POCO'),
  ('20000000-0000-0000-0000-000000000046', 'Vivo'),
  ('20000000-0000-0000-0000-000000000047', 'OPPO'),
  ('20000000-0000-0000-0000-000000000048', 'Nothing'),
  ('20000000-0000-0000-0000-000000000049', 'BenQ'),
  ('20000000-0000-0000-0000-000000000050', 'Fingers'),
  ('20000000-0000-0000-0000-000000000051', 'Lapcare'),
  ('20000000-0000-0000-0000-000000000052', 'Zebronics'),
  ('20000000-0000-0000-0000-000000000053', 'APC'),
  ('20000000-0000-0000-0000-000000000054', 'Numeric'),
  ('20000000-0000-0000-0000-000000000055', 'V-Guard'),
  ('20000000-0000-0000-0000-000000000056', 'Lento'),
  ('20000000-0000-0000-0000-000000000057', 'Warrior')
on conflict (name) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. AFTER-SALES SUPPORT DIRECTORY CATEGORIES
-- ────────────────────────────────────────────────────────────────────────────

insert into public.support_categories (id, name, icon, catalog_categories, active)
values
  ('laptop', 'Laptops & MacBooks', 'laptop', array['Laptops'], true),
  ('desktop', 'Desktop PCs & All-in-Ones', 'monitor', array['Desktops & All-in-Ones'], true),
  ('printer', 'Printers & Multi-Function', 'printer', array['Printers & Scanners'], true),
  ('monitor', 'Monitors & Visual Displays', 'tv', array['Monitors & Displays'], true),
  ('component', 'PC Components & Graphics', 'cpu', array['PC Components'], true),
  ('networking', 'Routers & Networking', 'wifi', array['Networking & Wi-Fi'], true),
  ('accessory', 'Keyboards, Mice & Audio', 'headphones', array['Computer Accessories'], true)
on conflict (id) do update set
  name = excluded.name,
  icon = excluded.icon,
  active = excluded.active;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. IT HUB SERVICE HUBS & HUBS IN KERALA
-- ────────────────────────────────────────────────────────────────────────────

insert into public.it_hub_locations (id, name, address, pincode, latitude, longitude, service_radius_km, active)
values
  (
    '30000000-0000-0000-0000-000000000000',
    'IT HUB Kothamangalam (Headquarters)',
    'Molathu Building, College Jn., Kothamangalam, Kerala',
    '686691',
    10.0601,
    76.6277,
    30.0,
    true
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    'IT HUB Kochi Central',
    'Shop 14, Central Plaza, M.G. Road, Ernakulam, Kochi',
    '682016',
    9.9816,
    76.2799,
    20.0,
    true
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'IT HUB Trivandrum Hub',
    'TC 25/1420, M.G. Road, Statue Junction, Thiruvananthapuram',
    '695001',
    8.4904,
    76.9530,
    20.0,
    true
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'IT HUB Calicut Branch',
    'Mavoor Road Junction, Kozhikode',
    '673004',
    11.2588,
    75.7804,
    20.0,
    true
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    'IT HUB Thrissur Centre',
    'Swaraj Round North, Thrissur',
    '680001',
    10.5276,
    76.2144,
    18.0,
    true
  )
on conflict (id) do nothing;

-- Key Kerala district postal centroids for on-site eligibility haversine checks
insert into public.pincode_areas (pincode, area, latitude, longitude)
values
  ('682016', 'Ernakulam M.G. Road', 9.9816, 76.2799),
  ('682001', 'Kochi Fort Kochi', 9.9658, 76.2421),
  ('682024', 'Kalamassery / CUSAT', 10.0469, 76.3267),
  ('682030', 'Kakkanad / Infopark', 10.0159, 76.3419),
  ('682020', 'Kadavanthra', 9.9678, 76.2996),
  ('695001', 'Trivandrum City / Statue', 8.4904, 76.9530),
  ('695033', 'Pattom, Trivandrum', 8.5241, 76.9407),
  ('695581', 'Kazhakkoottam / Technopark', 8.5686, 76.8731),
  ('673001', 'Kozhikode Town', 11.2480, 75.7760),
  ('673004', 'Kozhikode Mavoor Road', 11.2588, 75.7804),
  ('680001', 'Thrissur Town', 10.5276, 76.2144)
on conflict (pincode) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. PC BUILDER STARTER TEMPLATES
-- ────────────────────────────────────────────────────────────────────────────

insert into public.pc_build_templates (id, name, purpose, budget_min, budget_max, resolution, usage, tradeoff, parts, highlights, active)
values
  (
    '40000000-0000-0000-0000-000000000001',
    'Budget Esports Challenger',
    'gaming',
    45000,
    55000,
    '1080p FHD High',
    'Competitive 1080p esports titles (Valorant, CS2, Fortnite, Apex Legends) at 144+ FPS.',
    'Stock CPU air cooler, 500GB NVMe storage to prioritize dedicated GPU performance.',
    '[
      {"type": "cpu", "name": "Intel Core i3-12100F", "price": 7999},
      {"type": "motherboard", "name": "H610M Micro-ATX Motherboard", "price": 6200},
      {"type": "ram", "name": "16GB (2x8GB) DDR4 3200MHz", "price": 3499},
      {"type": "gpu", "name": "NVIDIA GeForce GTX 1650 4GB / RX 6500XT", "price": 14500},
      {"type": "storage", "name": "500GB Gen4 NVMe SSD", "price": 3299},
      {"type": "psu", "name": "550W 80+ Bronze Certified PSU", "price": 3499},
      {"type": "cabinet", "name": "Mesh Front ARGB M-ATX Case", "price": 3100}
    ]'::jsonb,
    array['1080p 144Hz Ready', 'DDR4 Dual-Channel', 'Solid 550W Upgrade Path'],
    true
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '1440p High-FPS Battle Station',
    'gaming',
    95000,
    115000,
    '1440p QHD Ultra',
    'AAA gaming at max settings (Cyberpunk 2077, Black Myth: Wukong) with ray tracing and DLSS/FSR.',
    'Standard air cooling rather than custom liquid cooling to maximize GPU budget.',
    '[
      {"type": "cpu", "name": "AMD Ryzen 5 7600X", "price": 19500},
      {"type": "motherboard", "name": "B650 Gaming WiFi ATX Motherboard", "price": 15400},
      {"type": "ram", "name": "32GB (2x16GB) DDR5 6000MHz CL30", "price": 9800},
      {"type": "gpu", "name": "NVIDIA GeForce RTX 4060 Ti 8GB / RX 7700 XT", "price": 38500},
      {"type": "storage", "name": "1TB Gen4 NVMe M.2 SSD (5000MB/s)", "price": 6499},
      {"type": "cooler", "name": "Deepcool AK400 Digital Air Cooler", "price": 3499},
      {"type": "psu", "name": "650W 80+ Gold Fully Modular PSU", "price": 6800},
      {"type": "cabinet", "name": "High Airflow ATX Mid-Tower Case", "price": 4900}
    ]'::jsonb,
    array['AM5 Platform Longevity', 'DDR5 6000MHz Memory', '1440p Ultra Gaming Performance'],
    true
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    'Creator & Video Editing Workstation',
    'creation',
    125000,
    155000,
    '4K Video / CAD Workflow',
    'Heavy Adobe Premiere Pro, After Effects, DaVinci Resolve Studio, and Blender 3D rendering.',
    'Focused on CPU core count and 64GB RAM; aesthetics kept minimalist.',
    '[
      {"type": "cpu", "name": "Intel Core i7-14700K 20-Core", "price": 36500},
      {"type": "motherboard", "name": "Z790 Creator Motherboard", "price": 22500},
      {"type": "ram", "name": "64GB (2x32GB) DDR5 5600MHz", "price": 17800},
      {"type": "gpu", "name": "NVIDIA GeForce RTX 4070 Super 12GB", "price": 58000},
      {"type": "storage", "name": "2TB Gen4 High-Speed NVMe SSD (7000MB/s)", "price": 12500},
      {"type": "cooler", "name": "360mm ARGB AIO Liquid Cooler", "price": 7900},
      {"type": "psu", "name": "750W 80+ Gold Modular PSU", "price": 8200},
      {"type": "cabinet", "name": "Professional Sound-Damped Case", "price": 6500}
    ]'::jsonb,
    array['20 High-Performance Cores', '64GB High Capacity RAM', 'NVIDIA Studio Certified GPU'],
    true
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    'Office & Student Daily Performer',
    'general',
    28000,
    35000,
    '1080p Everyday Office',
    'Web browsing, office productivity, accounting (Tally), video conferencing, and online schooling.',
    'Integrated graphics (APU); no dedicated graphics card.',
    '[
      {"type": "cpu", "name": "AMD Ryzen 5 5600G with Radeon Graphics", "price": 11200},
      {"type": "motherboard", "name": "A520M Micro-ATX Motherboard", "price": 4600},
      {"type": "ram", "name": "16GB (2x8GB) DDR4 3200MHz", "price": 3200},
      {"type": "storage", "name": "512GB NVMe M.2 SSD", "price": 2899},
      {"type": "psu", "name": "450W Standard Efficiency Power Supply", "price": 2100},
      {"type": "cabinet", "name": "Compact Micro-ATX Office Case", "price": 1800}
    ]'::jsonb,
    array['Radeon Integrated Graphics', 'Whisper-Quiet Operation', 'Compact Footprint'],
    true
  )
on conflict (id) do nothing;

commit;

