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
-- 5. IT HUB PHYSICAL SHOP & SERVICE HUB IN KERALA
-- Physical shop: IT HUB Kothamangalam (Headquarters)
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
  )
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  pincode = excluded.pincode,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  service_radius_km = excluded.service_radius_km,
  active = excluded.active;

-- Key Kerala postal centroids for on-site eligibility haversine checks
insert into public.pincode_areas (pincode, area, latitude, longitude)
values
  -- Kothamangalam Administrative Division
  ('686691', 'Kothamangalam Town (Bazar, Nellikuzhy, Varapetty, Karukadom, Cheruvattoor, Iramalloor, Kozhipilly, Nadukani)', 10.0601, 76.6277),
  ('686666', 'Kothamangalam College (M.A. College Campus Area)', 10.0545, 76.6435),
  ('686692', 'Kottappady & Adjacent Limits', 10.1132, 76.5925),
  ('686681', 'Keerampara / Bhoothathankettu / Thattekkad (Forest & Eco-Tourism Range)', 10.1180, 76.6850),
  ('686693', 'Manikinar, Neendapara & Forest Boundaries', 10.0380, 76.7150),
  ('686671', 'Chathamattam, Koovalloor & Limits', 10.0240, 76.6710),
  ('685514', 'Eastern High-Range / Pindimana Boundary', 10.0540, 76.7850),
  ('685612', 'Eastern High-Range / Oonnukal Range', 10.0330, 76.7550),
  ('683544', 'Kuttampuzha (Kothamangalam Forest Range)', 10.1530, 76.7380),

  -- Muvattupuzha Region
  ('686661', 'Muvattupuzha Town & HPO (Bazar, Kizhakkekara, Peringuzha, Thottumkalpeedika)', 9.9894, 76.5790),
  ('686673', 'Muvattupuzha Market & Suburbs (Kadathy, Kakkadasseri, Perumattom, Randar, Vazhappily, Mulavoor, Enanalloor)', 9.9750, 76.5820),

  -- Nearby Localities
  ('686670', 'Pothanicad', 10.0010, 76.6800),
  ('683556', 'Perumbavoor (Odakkali / Asamannoor)', 10.0790, 76.5320),
  ('683542', 'Perumbavoor Town', 10.1157, 76.4780),
  ('685608', 'Thodupuzha (Kaliyar / Vannappuram)', 9.9490, 76.7380),
  ('685584', 'Thodupuzha Town', 9.8960, 76.7137),

  -- Major Kerala Centers
  ('682030', 'Kakkanad / Infopark', 10.0159, 76.3419),
  ('682016', 'Ernakulam M.G. Road', 9.9816, 76.2799),
  ('682011', 'Ernakulam City', 9.9816, 76.2999),
  ('682001', 'Kochi Fort Kochi', 9.9658, 76.2421),
  ('682024', 'Kalamassery / CUSAT', 10.0469, 76.3267),
  ('682020', 'Kadavanthra', 9.9678, 76.2996),
  ('683101', 'Aluva', 10.1076, 76.3516),
  ('686001', 'Kottayam Town', 9.5916, 76.5222),
  ('680001', 'Thrissur Town', 10.5276, 76.2144),
  ('673001', 'Kozhikode Town', 11.2480, 75.7760),
  ('673004', 'Kozhikode Mavoor Road', 11.2588, 75.7804),
  ('695001', 'Thiruvananthapuram Statue / City', 8.4904, 76.9530),
  ('695033', 'Pattom, Trivandrum', 8.5241, 76.9407),
  ('695581', 'Kazhakkoottam / Technopark', 8.5686, 76.8731)
on conflict (pincode) do update set
  area = excluded.area,
  latitude = excluded.latitude,
  longitude = excluded.longitude;

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

-- ────────────────────────────────────────────────────────────────────────────
-- 7. INITIAL PRODUCT CATALOG: VERIFIED SECOND-HAND / PRE-OWNED HARDWARE
-- ────────────────────────────────────────────────────────────────────────────

insert into public.products (
  id, sku, name, brand_id, category_id, subcategory, description,
  mrp, price, sale_price, cost_price, warranty, weight, specs,
  second_hand, condition, status
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    'SH-MACBOOK-AIR-M1',
    'Apple MacBook Air M1 256GB Space Grey (Pre-Owned)',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'MacBooks',
    'Certified pre-owned MacBook Air with Apple Silicon M1 chip. Fully tested keyboard, trackpad, screen, and battery health at 91%. Comes with original MagSafe/Type-C cable and adapter.',
    89900.00,
    52999.00,
    49999.00,
    42000.00,
    '6 Months IT HUB Certified Warranty',
    '1.29 kg',
    '{"Processor": "Apple M1 8-Core", "RAM": "8GB Unified", "Storage": "256GB SSD", "BatteryHealth": "91%", "Display": "13.3-inch Retina True Tone", "Condition": "Like New"}'::jsonb,
    true,
    'Like New',
    'Active'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'SH-THINKPAD-T14-G2',
    'Lenovo ThinkPad T14 Gen 2 Core i5 (Pre-Owned)',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'Business Laptops',
    'Legendary business workhorse. Military-grade durability, spill-resistant keyboard, and fast 11th Gen Core i5 processor. Inspected and sanitized by IT HUB technicians.',
    98000.00,
    38500.00,
    null,
    29500.00,
    '6 Months IT HUB Certified Warranty',
    '1.47 kg',
    '{"Processor": "Intel Core i5-1135G7", "RAM": "16GB DDR4", "Storage": "512GB NVMe SSD", "Display": "14-inch FHD IPS", "BatteryHealth": "86%", "Condition": "Good"}'::jsonb,
    true,
    'Good',
    'Active'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    'SH-THINKCENTRE-M720Q',
    'Lenovo ThinkCentre M720q Tiny Mini PC (Pre-Owned)',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000002',
    'Mini PCs',
    'Ultra-compact desktop PC ideal for office work, accounting, billing desks, and student study. Fast dual storage with SSD boot and bulk HDD.',
    45000.00,
    18999.00,
    null,
    14000.00,
    '3 Months IT HUB Certified Warranty',
    '1.32 kg',
    '{"Processor": "Intel Core i5-8400T 6-Core", "RAM": "16GB DDR4", "Storage": "256GB SSD + 500GB HDD", "OS": "Windows 11 Pro Genuine", "Condition": "Good"}'::jsonb,
    true,
    'Good',
    'Active'
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    'SH-DELL-LATITUDE-7420',
    'Dell Latitude 7420 Carbon Fiber Ultrabook (Pre-Owned)',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Ultrabooks',
    'Premium carbon fiber finish with Intel Core i7 vPro performance. Super-crisp FHD screen, backlit keyboard, and USB-C Thunderbolt 4 ports.',
    115000.00,
    42999.00,
    null,
    33500.00,
    '6 Months IT HUB Certified Warranty',
    '1.31 kg',
    '{"Processor": "Intel Core i7-1185G7 vPro", "RAM": "16GB LPDDR4x", "Storage": "512GB PCIe NVMe SSD", "Display": "14.0-inch FHD Anti-Glare", "Condition": "Like New"}'::jsonb,
    true,
    'Like New',
    'Active'
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    'SH-GPU-RTX3070-8G',
    'Zotac Gaming GeForce RTX 3070 Twin Edge 8GB (Pre-Owned)',
    '20000000-0000-0000-0000-000000000025',
    '10000000-0000-0000-0000-000000000013',
    'Graphics Cards',
    'High-performance 1440p gaming graphics card. Thermal paste freshly renewed with Arctic MX-4. 3DMark and Furmark stress-tested with max temperature 68C.',
    62000.00,
    26500.00,
    null,
    21000.00,
    '3 Months IT HUB Testing Warranty',
    '0.85 kg',
    '{"VRAM": "8GB GDDR6 256-Bit", "Interface": "PCIe 4.0 16x", "Outputs": "3x DisplayPort 1.4a, 1x HDMI 2.1", "Benchmarked": "100% Stability 68C", "Condition": "Good"}'::jsonb,
    true,
    'Good',
    'Active'
  ),
  (
    '50000000-0000-0000-0000-000000000006',
    'SH-IPHONE-13-128G',
    'Apple iPhone 13 128GB Midnight (Pre-Owned)',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000008',
    'Smartphones',
    'Flawless pre-owned iPhone 13 with 89% battery health. True Tone, Face ID, and dual cameras functioning perfectly. Tested under 32-point inspection.',
    59900.00,
    36999.00,
    null,
    30000.00,
    '6 Months IT HUB Warranty',
    '0.17 kg',
    '{"Storage": "128GB", "BatteryHealth": "89%", "Color": "Midnight", "Condition": "Like New", "TrueToneFaceID": "100% Working"}'::jsonb,
    true,
    'Like New',
    'Active'
  ),
  (
    '50000000-0000-0000-0000-000000000007',
    'SH-SAMSUNG-ODYSSEY-G5',
    'Samsung Odyssey G5 27-inch 144Hz WQHD Curved (Pre-Owned)',
    '20000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000004',
    'Gaming Monitors',
    '27-inch 1000R curved gaming monitor with 2560x1440 WQHD resolution, 144Hz refresh rate, and AMD FreeSync Premium. Zero dead pixels verified.',
    24000.00,
    13999.00,
    null,
    10500.00,
    '3 Months IT HUB Warranty',
    '4.5 kg',
    '{"Resolution": "2560x1440 WQHD", "RefreshRate": "144Hz 1ms", "Curve": "1000R", "Condition": "Good", "DeadPixels": "Zero"}'::jsonb,
    true,
    'Good',
    'Active'
  )
on conflict (sku) do update set
  price = excluded.price,
  sale_price = excluded.sale_price,
  specs = excluded.specs,
  condition = excluded.condition,
  second_hand = excluded.second_hand,
  warranty = excluded.warranty,
  status = excluded.status;

-- Initialize inventory stock for seeded pre-owned hardware
insert into public.inventory (product_id, stock, low_stock_threshold)
values
  ('50000000-0000-0000-0000-000000000001', 2, 1),
  ('50000000-0000-0000-0000-000000000002', 3, 1),
  ('50000000-0000-0000-0000-000000000003', 4, 1),
  ('50000000-0000-0000-0000-000000000004', 2, 1),
  ('50000000-0000-0000-0000-000000000005', 1, 1),
  ('50000000-0000-0000-0000-000000000006', 2, 1),
  ('50000000-0000-0000-0000-000000000007', 1, 1)
on conflict (product_id) do update set
  stock = excluded.stock,
  low_stock_threshold = excluded.low_stock_threshold;

commit;
