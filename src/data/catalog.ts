// ── Second-hand / Pre-owned products ──
export type ProductCondition = 'New' | 'Like New' | 'Good' | 'Fair' | 'For Parts'
export const productConditions: ProductCondition[] = ['New', 'Like New', 'Good', 'Fair', 'For Parts']

export type Product = {
  id: string
  name: string
  brand: string
  category: string
  price: number
  original: number
  image: string
  stock: number
  rating: number
  specs: Record<string, string>
  tag?: string
  sku?: string
  subcategory?: string
  description?: string
  costPrice?: number
  lowStockThreshold?: number
  warranty?: string
  weight?: string
  status?: "Active" | "Draft" | "Archived"
  secondHand?: boolean
  condition?: ProductCondition
}
export const photo = (id: string, width = 700) => `/images/${id}.jpg`
export const images = {
  hero: photo("photo-1616440347437-b1c73416efc2", 1600),
  setup: photo("photo-1510519138101-570d1dca3d66", 1100),
  laptop: photo("photo-1603302576837-37561b2e2302"),
  gpu: "/images/rtx-5070.jpg",
  cpu: photo("photo-1494083306499-e22e4a457632"),
  ssd: photo("photo-1686705562930-4f3e46f620d8"),
  monitor: photo("photo-1527443224154-c4a3942d3acf"),
  audio: photo("photo-1546435770-a3e426bf472b"),
  mouse: photo("photo-1527814050087-3793815479db"),
  phone: photo("photo-1592750475338-74b7b21085ab"),
  keyboard: photo("photo-1587829741301-dc798b83add3"),
  pc: "/images/pc-build.png",
}
const p = (
  id: string,
  name: string,
  brand: string,
  category: string,
  price: number,
  image: string,
  specs: Record<string, string>,
  stock = 12,
  tag?: string,
): Product => ({
  id,
  name,
  brand,
  category,
  price,
  original: Math.round(price * 1.1),
  image,
  stock,
  rating: 4.8,
  specs,
  tag,
})
export const initialProducts: Product[] = [
  p(
    "rtx-5070",
    "NVIDIA GeForce RTX 5070",
    "NVIDIA",
    "Graphics Cards",
    64999,
    images.gpu,
    {
      Memory: "12GB GDDR7",
      Interface: "PCIe 5.0",
      Power: "250W",
      Warranty: "3 years",
    },
    8,
    "NEW ARRIVAL",
  ),
  p(
    "ryzen-9700x",
    "AMD Ryzen 7 9700X",
    "AMD",
    "Processors",
    34999,
    images.cpu,
    {
      Cores: "8 cores / 16 threads",
      Socket: "AM5",
      Generation: "Zen 5",
      Warranty: "3 years",
    },
    16,
    "BEST SELLER",
  ),
  p(
    "asus-tuf",
    "ASUS TUF Gaming A15",
    "ASUS",
    "Laptops",
    89999,
    images.laptop,
    {
      Processor: "AMD Ryzen 7",
      RAM: "16GB",
      Storage: "512GB SSD",
      GPU: "RTX 4060",
      Screen: "15.6 inch · 144Hz",
      Warranty: "1 year",
    },
    7,
  ),
  p(
    "990-evo",
    "Samsung 990 EVO 1TB",
    "Samsung",
    "Storage",
    8499,
    images.ssd,
    {
      Capacity: "1TB",
      Interface: "NVMe PCIe 4.0",
      Read: "5,000 MB/s",
      Warranty: "5 years",
    },
    24,
    "GREAT VALUE",
  ),
  p(
    "kingston-32",
    "Kingston FURY Beast 32GB",
    "Kingston",
    "RAM",
    9999,
    images.pc,
    {
      Capacity: "32GB",
      Generation: "DDR5",
      Speed: "6000MHz",
      Warranty: "Limited lifetime",
    },
  ),
  p(
    "lg-ultragear",
    'LG UltraGear 27" QHD',
    "LG",
    "Monitors",
    29999,
    images.monitor,
    {
      Resolution: "2560 × 1440",
      Refresh: "165Hz",
      Panel: "IPS",
      Warranty: "3 years",
    },
  ),
  p("sony-xm6", "Sony WH-1000XM6", "Sony", "Audio", 34999, images.audio, {
    Type: "Wireless over-ear",
    Feature: "Noise cancellation",
    Warranty: "1 year",
  }),
  p(
    "g502",
    "Logitech G502 HERO",
    "Logitech",
    "Gaming",
    7499,
    images.mouse,
    { Sensor: "25K HERO", Buttons: "11 programmable", Warranty: "2 years" },
    3,
  ),
  p("iphone-16", "Apple iPhone 16", "Apple", "Mobiles", 69999, images.phone, {
    Storage: "128GB",
    Screen: "6.1 inch",
    Processor: "A18",
    Warranty: "1 year",
  }),
  p(
    "keychron-k2",
    "Keychron K2 Wireless",
    "Keychron",
    "Accessories",
    8999,
    images.keyboard,
    {
      Type: "Mechanical",
      Connectivity: "Bluetooth / USB-C",
      Warranty: "1 year",
    },
  ),
  p("b650", "ASUS PRIME B650M-A", "ASUS", "Motherboards", 14999, images.pc, {
    Socket: "AM5",
    Generation: "DDR5",
    Interface: "PCIe 4.0",
    Warranty: "3 years",
  }),
  p(
    "epson-l3250",
    "Epson EcoTank L3250",
    "Epson",
    "Printers",
    15999,
    images.setup,
    { Type: "Ink tank", Connectivity: "Wi-Fi", Warranty: "1 year" },
  ),
  p(
    "tplink-ax23",
    "TP-Link Archer AX23",
    "TP-Link",
    "Networking",
    4999,
    images.setup,
    { Wireless: "Wi-Fi 6", Speed: "1800Mbps", Warranty: "3 years" },
  ),
  p(
    "workstation",
    "IT HUB Essential Desktop",
    "IT HUB",
    "PC Components",
    44999,
    images.pc,
    {
      Processor: "Ryzen 5 5600G",
      RAM: "16GB",
      Storage: "512GB SSD",
      Warranty: "Component-specific",
    },
  ),
  {
    ...p("dell-lat-7490", "Dell Latitude 7490 (Refurbished)", "Dell", "Laptops", 24999, images.laptop, {
      Processor: "Intel Core i7-8650U",
      RAM: "16GB DDR4",
      Storage: "512GB NVMe SSD",
      Display: "14-inch Full HD",
      Condition: "Like New",
      Warranty: "6 Months IT HUB Warranty",
    }, 4, "VERIFIED PRE-OWNED"),
    secondHand: true,
    condition: "Like New" as const,
  },
  {
    ...p("thinkcentre-m720q", "Lenovo ThinkCentre M720q Tiny (Pre-Owned)", "Lenovo", "PC Components", 18999, images.pc, {
      Processor: "Intel Core i5-8400T",
      RAM: "16GB DDR4",
      Storage: "256GB SSD + 500GB HDD",
      Condition: "Good",
      Warranty: "3 Months IT HUB Warranty",
    }, 3, "VERIFIED PRE-OWNED"),
    secondHand: true,
    condition: "Good" as const,
  },
  {
    ...p("iphone-13-preowned", "Apple iPhone 13 128GB (Pre-Owned)", "Apple", "Mobiles", 36999, images.phone, {
      Storage: "128GB",
      BatteryHealth: "89%",
      Color: "Midnight",
      Condition: "Like New",
      Warranty: "6 Months IT HUB Warranty",
    }, 2, "VERIFIED PRE-OWNED"),
    secondHand: true,
    condition: "Like New" as const,
  },
]
export const categories = [
  "Laptops",
  "PC Components",
  "Graphics Cards",
  "Processors",
  "Motherboards",
  "RAM",
  "Storage",
  "Monitors",
  "Audio",
  "Mobiles",
  "Printers",
  "Accessories",
  "Networking",
  "Gaming",
]
export const initialBrands = [
  "AMD",
  "ASUS",
  "Apple",
  "Corsair",
  "Dell",
  "Epson",
  "HP",
  "IT HUB",
  "Intel",
  "JBL",
  "Keychron",
  "Kingston",
  "Lenovo",
  "Logitech",
  "NVIDIA",
  "Samsung",
  "Sony",
  "TP-Link",
]
export const serviceTypes = [
  "Laptop Repair",
  "Mobile Repair",
  "PC Repair",
  "OS Installation",
  "Data Recovery",
  "Hardware Upgrade",
  "Virus Removal",
  "PC Assembly",
  "Printer Service",
  "Network Setup",
  "Laptop Cleaning",
  "Thermal Paste Replacement",
  "Hardware Diagnostics",
  "Software Installation",
  "Windows Installation",
  "SSD Upgrade",
  "RAM Upgrade",
  "PC Troubleshooting",
  "Website Development",
  "Software Development",
  "Other IT Services",
]
export const problems = [
  "Not turning on",
  "Slow performance",
  "Screen issue",
  "Battery problem",
  "Overheating",
  "Keyboard issue",
  "Charging issue",
  "Software issue",
  "Virus",
  "Data recovery",
  "Other",
]
export const problemsByDevice: Record<string, string[]> = {
  Printer: [
    "Not printing",
    "Paper jam",
    "Faded / streaky prints",
    "Ink or toner issue",
    "Cartridge not detected",
    "Wi-Fi / network printing",
    "Driver installation",
    "Scanner not working",
    "Error lights / codes",
    "Printhead cleaning",
    "Other",
  ],
  Mobile: [
    "Not turning on",
    "Screen / display broken",
    "Battery draining fast",
    "Charging issue",
    "Speaker / mic issue",
    "Camera issue",
    "Water damage",
    "Software / hanging",
    "Data recovery",
    "Other",
  ],
}
export const problemsFor = (device: string) => problemsByDevice[device] || problems
export const orderStatuses = [
  "Order placed",
  "Confirmed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for delivery",
  "Delivered",
]
export const serviceStatuses = [
  "Requested",
  "Pickup scheduled",
  "Device received",
  "Diagnosing",
  "Awaiting approval",
  "Approved",
  "Repairing",
  "Quality check",
  "Ready for delivery",
  "Completed",
]
export type ComponentOption = {
  id: string
  name: string
  price: number
  socket?: string
  ram?: string
  watts?: number
  capacity?: number
  length?: number
  clearance?: number
  bios?: boolean
  interface?: string
  /** Built-in Wi-Fi (motherboards) */
  wifi?: boolean
  /** Units in IT HUB inventory; undefined = available, 0 = out of stock */
  stock?: number
}
export const componentOptions: Record<string, ComponentOption[]> = {
  CPU: [
    {
      id: "r5",
      name: "AMD Ryzen 5 7600",
      price: 18999,
      socket: "AM5",
      watts: 65,
    },
    {
      id: "r7",
      name: "AMD Ryzen 7 9700X",
      price: 34999,
      socket: "AM5",
      watts: 65,
    },
    {
      id: "i5",
      name: "Intel Core i5-14600K",
      price: 28999,
      socket: "LGA1700",
      watts: 181,
    },
    {
      id: "i7",
      name: "Intel Core i7-14700K",
      price: 39999,
      socket: "LGA1700",
      watts: 253,
    },
    { id: "r5-5600", name: "AMD Ryzen 5 5600", price: 10999, socket: "AM4", watts: 65 },
    { id: "r5-8600g", name: "AMD Ryzen 5 8600G (Radeon graphics)", price: 17999, socket: "AM5", watts: 65 },
    { id: "r7-9800x3d", name: "AMD Ryzen 7 9800X3D", price: 47999, socket: "AM5", watts: 120 },
    { id: "r9-9950x", name: "AMD Ryzen 9 9950X", price: 54999, socket: "AM5", watts: 170 },
    { id: "i5-12400", name: "Intel Core i5-12400 (UHD graphics)", price: 13499, socket: "LGA1700", watts: 65 },
    { id: "i5-12400f", name: "Intel Core i5-12400F", price: 11999, socket: "LGA1700", watts: 65 },
  ],
  Motherboard: [
    {
      id: "b650",
      name: "ASUS PRIME B650M-A",
      price: 14999,
      socket: "AM5",
      ram: "DDR5",
      bios: true,
      interface: "NVMe",
    },
    {
      id: "x870",
      name: "MSI PRO X870-P",
      price: 24999,
      socket: "AM5",
      ram: "DDR5",
      interface: "NVMe",
    },
    {
      id: "z790",
      name: "MSI PRO Z790-P",
      price: 21999,
      socket: "LGA1700",
      ram: "DDR5",
      interface: "NVMe",
    },
    {
      id: "b760",
      name: "Gigabyte B760M DDR4",
      price: 12999,
      socket: "LGA1700",
      ram: "DDR4",
      interface: "NVMe",
    },
    { id: "b550", name: "MSI B550M PRO-VDH", price: 9999, socket: "AM4", ram: "DDR4", interface: "NVMe" },
    { id: "b650wifi", name: "MSI B650 Gaming Plus WiFi", price: 18999, socket: "AM5", ram: "DDR5", interface: "NVMe", wifi: true },
    { id: "b760wifi", name: "ASUS PRIME B760M-A WiFi D4", price: 14999, socket: "LGA1700", ram: "DDR4", interface: "NVMe", wifi: true },
  ],
  RAM: [
    { id: "16d5", name: "16GB DDR5 · 5200MHz", price: 4999, ram: "DDR5" },
    { id: "32d5", name: "32GB DDR5 · 6000MHz", price: 9999, ram: "DDR5" },
    { id: "64d5", name: "64GB DDR5 · 6000MHz", price: 18999, ram: "DDR5" },
    { id: "16d4", name: "16GB DDR4 · 3200MHz", price: 3499, ram: "DDR4" },
    { id: "32d4", name: "32GB DDR4 · 3200MHz", price: 6499, ram: "DDR4" },
  ],
  GPU: [
    {
      id: "4060",
      name: "NVIDIA RTX 4060",
      price: 29999,
      watts: 115,
      length: 240,
    },
    {
      id: "4070",
      name: "RTX 4070 Super",
      price: 59999,
      watts: 220,
      length: 300,
    },
    {
      id: "5070",
      name: "NVIDIA RTX 5070",
      price: 64999,
      watts: 250,
      length: 320,
    },
    {
      id: "7800",
      name: "AMD RX 7800 XT",
      price: 49999,
      watts: 263,
      length: 330,
    },
    { id: "rx6600", name: "AMD RX 6600 8GB", price: 19999, watts: 132, length: 190 },
    { id: "rx7600", name: "AMD RX 7600 8GB", price: 25999, watts: 165, length: 205 },
    { id: "4060ti", name: "NVIDIA RTX 4060 Ti 16GB", price: 44999, watts: 165, length: 245, stock: 0 },
    { id: "4080s", name: "NVIDIA RTX 4080 Super", price: 99999, watts: 320, length: 310 },
  ],
  Storage: [
    { id: "1tb", name: "1TB NVMe SSD", price: 6999, interface: "NVMe" },
    { id: "2tb", name: "2TB NVMe SSD", price: 11999, interface: "NVMe" },
    { id: "512gb", name: "512GB NVMe SSD", price: 3999, interface: "NVMe" },
    { id: "4tb", name: "4TB NVMe SSD", price: 22999, interface: "NVMe" },
  ],
  PSU: [
    { id: "650", name: "650W 80+ Gold", price: 7999, capacity: 650 },
    { id: "750", name: "750W 80+ Gold", price: 9999, capacity: 750 },
    { id: "850", name: "850W 80+ Gold", price: 12999, capacity: 850 },
    { id: "550", name: "550W 80+ Bronze", price: 4499, capacity: 550 },
    { id: "1000", name: "1000W 80+ Gold", price: 16999, capacity: 1000 },
  ],
  Cabinet: [
    { id: "compact", name: "Cooler Master Q300L", price: 4999, clearance: 300 },
    {
      id: "corsair",
      name: "Corsair 4000D Airflow",
      price: 7999,
      clearance: 360,
    },
    { id: "ant", name: "Ant Esports ICE-112", price: 2999, clearance: 320 },
    { id: "lancool", name: "Lian Li Lancool 216", price: 8499, clearance: 392 },
  ],
  Cooler: [
    { id: "ak400", name: "DeepCool AK400", price: 2499, capacity: 220 },
    { id: "h100", name: "Corsair H100 240mm AIO", price: 9999, capacity: 300 },
    { id: "ag400", name: "DeepCool AG400", price: 1499, capacity: 220 },
    { id: "aio360", name: "Lian Li Galahad II 360mm AIO", price: 13999, capacity: 350 },
  ],
}
export type Build = {
  id: string
  name: string
  parts: Record<string, ComponentOption>
  price: number
  /** Smart builder context, e.g. "1440p gaming" */
  designedFor?: string
  templateId?: string
  /** Part types the customer already owns (excluded from estimate) */
  owned?: string[]
}
export type CartItem = {
  id: string
  name: string
  price: number
  image: string
  quantity: number
  productId?: string
  build?: Build
}
export type Order = {
  id: string
  name: string
  email: string
  address: string
  items: CartItem[]
  total: number
  status: number
  date: string
  payment: string
  delivery: string
}
export type ServiceRequest = {
  id: string
  name: string
  email: string
  device: string
  model: string
  problem: string
  method: string
  address: string
  date: string
  time: string
  status: number
  quote: number
  quoteState: "pending" | "approved" | "rejected"
  technician: string
  notes: string
  /**
   * Courier charges for "Courier to IT HUB" method.
   * Customer ships the device to IT HUB at their own cost (no inbound charge).
   * IT HUB charges only for the return delivery leg.
   * On quote rejection this becomes the "diagnosis & return fee".
   */
  courierCharge?: { returnDelivery: number }
}
// ── Offers (no coupon codes — offers apply automatically by date window) ──
export const offerTypes = [
  "Product Offer",
  "Category Offer",
  "Brand Offer",
  "Seasonal Offer",
  "Flash Sale",
] as const
export type OfferType = (typeof offerTypes)[number]
export type Offer = {
  id: string
  name: string
  description: string
  type: OfferType
  /** Percentage discount (0 when the offer uses a fixed amount). */
  discount: number
  /** Fixed ₹ amount off per item (0 when the offer uses a percentage). */
  amount: number
  products: string[]
  categories: string[]
  brands: string[]
  startsAt: string
  endsAt: string
  banner: string
  active: boolean
}
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 16)
export const initialOffers: Offer[] = [
  {
    id: "gaming-sale",
    name: "Gaming Accessories Sale",
    description: "Selected gaming accessories",
    type: "Category Offer",
    discount: 20,
    amount: 0,
    products: [],
    categories: ["Gaming", "Accessories"],
    brands: [],
    startsAt: daysFromNow(-3),
    endsAt: "2026-10-15T23:59",
    banner: "",
    active: true,
  },
  {
    id: "components-week",
    name: "PC Components Week",
    description: "Processors, motherboards, RAM and graphics cards",
    type: "Seasonal Offer",
    discount: 10,
    amount: 0,
    products: [],
    categories: ["Processors", "Motherboards", "RAM", "Graphics Cards"],
    brands: [],
    startsAt: daysFromNow(-1),
    endsAt: daysFromNow(20),
    banner: "",
    active: true,
  },
  {
    id: "ssd-flash",
    name: "SSD Flash Sale",
    description: "Faster storage, lower prices",
    type: "Flash Sale",
    discount: 0,
    amount: 1000,
    products: [],
    categories: ["Storage"],
    brands: [],
    startsAt: daysFromNow(5),
    endsAt: daysFromNow(7),
    banner: "",
    active: true,
  },
]
export type OfferStatus = "Active" | "Scheduled" | "Expired" | "Inactive"
export const offerStatus = (offer: Offer, now = Date.now()): OfferStatus => {
  if (!offer.active) return "Inactive"
  if (offer.startsAt && new Date(offer.startsAt).getTime() > now) return "Scheduled"
  if (offer.endsAt && new Date(offer.endsAt).getTime() < now) return "Expired"
  return "Active"
}
export const offerApplies = (offer: Offer, product: Pick<Product, "id" | "brand" | "category">) =>
  offer.products.includes(product.id) ||
  offer.categories.includes(product.category) ||
  offer.brands.includes(product.brand)
export const offerHeadline = (offer: Offer) =>
  offer.discount > 0
    ? `UP TO ${offer.discount}% OFF`
    : `FLAT ${money(offer.amount)} OFF`
/** Best currently-active offer for a product and its discounted unit price. */
export const bestOffer = (
  offers: Offer[],
  product: Pick<Product, "id" | "brand" | "category" | "price">,
) => {
  let best: { offer: Offer; price: number; saving: number } | null = null
  for (const offer of offers) {
    if (offerStatus(offer) !== "Active" || !offerApplies(offer, product)) continue
    const saving = Math.min(
      product.price,
      offer.discount > 0 ? Math.round((product.price * offer.discount) / 100) : offer.amount,
    )
    if (!best || saving > best.saving)
      best = { offer, price: product.price - saving, saving }
  }
  return best
}
export const formatDate = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : ""

// ── On-site warranty: IT HUB locations + PIN code directory ──
export type ItHubLocation = {
  id: string
  name: string
  address: string
  pincode: string
  latitude: number
  longitude: number
  serviceRadiusKm: number
  active: boolean
}
export const initialLocations: ItHubLocation[] = [
  {
    id: "kothamangalam",
    name: "IT HUB Kothamangalam",
    address: "Kothamangalam, Ernakulam, Kerala",
    pincode: "686691",
    latitude: 10.0602,
    longitude: 76.6351,
    serviceRadiusKm: 15,
    active: true,
  },
]
/**
 * PIN code → approximate area centroid. Centroids are estimates, so any
 * distance derived from them is labelled approximate in the UI.
 * (Supabase: `pincode_areas` lookup table.)
 */
export const pincodeDirectory: Record<string, { area: string; latitude: number; longitude: number }> = {
  "686691": { area: "Kothamangalam", latitude: 10.0602, longitude: 76.6351 },
  "686692": { area: "Kothamangalam (Cheruvattoor)", latitude: 10.0805, longitude: 76.6102 },
  "686693": { area: "Nellikuzhi / Iramalloor", latitude: 10.0425, longitude: 76.6045 },
  "686681": { area: "Keerampara", latitude: 10.0798, longitude: 76.6889 },
  "686671": { area: "Kuttamangalam / Pindimana", latitude: 10.0421, longitude: 76.6702 },
  "686661": { area: "Muvattupuzha", latitude: 9.9894, longitude: 76.5790 },
  "686673": { area: "Muvattupuzha (Marady)", latitude: 9.9660, longitude: 76.5760 },
  "683544": { area: "Kothamangalam (Kuttampuzha)", latitude: 10.1530, longitude: 76.7380 },
  "683556": { area: "Perumbavoor (Odakkali)", latitude: 10.0790, longitude: 76.5320 },
  "686670": { area: "Pothanicad", latitude: 10.0010, longitude: 76.6800 },
  "683542": { area: "Perumbavoor", latitude: 10.1157, longitude: 76.4780 },
  "685608": { area: "Thodupuzha (Kaliyar)", latitude: 9.9490, longitude: 76.7380 },
  "685584": { area: "Thodupuzha", latitude: 9.8960, longitude: 76.7137 },
  "682030": { area: "Kakkanad", latitude: 10.0159, longitude: 76.3419 },
  "682011": { area: "Ernakulam", latitude: 9.9816, longitude: 76.2999 },
  "683101": { area: "Aluva", latitude: 10.1076, longitude: 76.3516 },
  "686001": { area: "Kottayam", latitude: 9.5916, longitude: 76.5222 },
  "680001": { area: "Thrissur", latitude: 10.5276, longitude: 76.2144 },
  "695001": { area: "Thiruvananthapuram", latitude: 8.5241, longitude: 76.9366 },
}
const toRad = (deg: number) => (deg * Math.PI) / 180
export const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}
export type WarrantyResult =
  | { status: "invalid" }
  | { status: "unknown"; pincode: string }
  | {
      status: "eligible" | "ineligible"
      pincode: string
      area: string
      location: ItHubLocation
      distanceKm: number
    }
/** Straight-line distance from the PIN centroid to the nearest active IT HUB location. */
export const checkWarranty = (pincode: string, locations: ItHubLocation[]): WarrantyResult => {
  const pin = pincode.trim()
  if (!/^[1-9]\d{5}$/.test(pin)) return { status: "invalid" }
  const centroid = pincodeDirectory[pin]
  const active = locations.filter((location) => location.active)
  if (!centroid || !active.length) return { status: "unknown", pincode: pin }
  const nearest = active
    .map((location) => ({
      location,
      km: distanceKm(centroid.latitude, centroid.longitude, location.latitude, location.longitude),
    }))
    .sort((a, b) => a.km - b.km)[0]
  return {
    status: nearest.km <= nearest.location.serviceRadiusKm ? "eligible" : "ineligible",
    pincode: pin,
    area: centroid.area,
    location: nearest.location,
    distanceKm: Math.round(nearest.km * 10) / 10,
  }
}
export type WarrantyCheck = {
  id: string
  pincode: string
  area: string
  result: "eligible" | "ineligible" | "unknown"
  distanceKm: number | null
  source: string
  date: string
}

// ── PC Builder enquiries (sent to WhatsApp) ──
export type PcEnquiry = {
  id: string
  summary: string
  parts: { type: string; name: string; price: number }[]
  estimate: number
  date: string
  status: "New" | "Contacted" | "Quoted" | "Closed"
}

// ── Bulk import ──
export type ImportRecord = {
  id: string
  file: string
  date: string
  rows: number
  created: number
  updated: number
  skipped: number
  failed: number
}

/** Admin navigation tree. Sub-items map to `/admin/:section?view=<view>`. */
export type AdminNavItem = { label: string; view: string }
export type AdminNavGroup = {
  name: string
  section: string
  items?: AdminNavItem[]
}
export const adminGroups: AdminNavGroup[] = [
  { name: "Dashboard", section: "dashboard" },
  {
    name: "Products",
    section: "products",
    items: [
      { label: "All Products", view: "all" },
      { label: "Categories", view: "categories" },
      { label: "Brands", view: "brands" },
      { label: "Bulk Import", view: "import" },
    ],
  },
  {
    name: "Inventory",
    section: "inventory",
    items: [
      { label: "Stock Overview", view: "overview" },
      { label: "Low Stock", view: "low" },
      { label: "Out of Stock", view: "out" },
      { label: "Stock Adjustment", view: "adjust" },
    ],
  },
  {
    name: "Orders",
    section: "orders",
    items: [
      { label: "All Orders", view: "all" },
      { label: "Pending", view: "pending" },
      { label: "Processing", view: "processing" },
      { label: "Shipped", view: "shipped" },
      { label: "Delivered", view: "delivered" },
      { label: "Cancelled", view: "cancelled" },
    ],
  },
  {
    name: "Offers",
    section: "offers",
    items: [
      { label: "Active Offers", view: "active" },
      { label: "Create Offer", view: "create" },
      { label: "Scheduled Offers", view: "scheduled" },
      { label: "Expired Offers", view: "expired" },
    ],
  },
  {
    name: "Coupons",
    section: "coupons",
    items: [
      { label: "All Coupons", view: "all" },
      { label: "Create Coupon", view: "create" },
      { label: "Usage History", view: "usage" },
    ],
  },
  {
    name: "Services",
    section: "services",
    items: [
      { label: "Laptop Services", view: "laptop" },
      { label: "Mobile Services", view: "mobile" },
      { label: "PC Services", view: "pc" },
      { label: "Printer Services", view: "printer" },
      { label: "On-Site Services", view: "onsite" },
      { label: "All Requests", view: "requests" },
      { label: "On-Site Warranty", view: "warranty" },
      { label: "Service Areas", view: "areas" },
    ],
  },
  {
    name: "Sell Requests",
    section: "sell-requests",
    items: [
      { label: "All Requests", view: "all" },
      { label: "Pending", view: "pending" },
      { label: "Under Review", view: "review" },
      { label: "Approved", view: "approved" },
      { label: "Rejected", view: "rejected" },
    ],
  },
  {
    name: "Warranty / After-Sales",
    section: "support",
    items: [
      { label: "Brand Support", view: "all" },
      { label: "Laptop", view: "laptop" },
      { label: "Mobile", view: "mobile" },
      { label: "Printer", view: "printer" },
      { label: "Verification History", view: "history" },
    ],
  },
  {
    name: "PC Builder",
    section: "pc-builder",
    items: [
      { label: "Build Templates", view: "templates" },
      { label: "Configurations", view: "configurations" },
      { label: "Requests", view: "requests" },
      { label: "Estimates", view: "estimates" },
    ],
  },
  { name: "Customers", section: "customers" },
  { name: "Reviews", section: "reviews" },
  {
    name: "Analytics & Visitors",
    section: "analytics",
    items: [
      { label: "Overview", view: "overview" },
      { label: "Visitor Locations", view: "locations" },
      { label: "Traffic Sources", view: "traffic" },
      { label: "Devices", view: "devices" },
      { label: "Pages & Products", view: "pages" },
      { label: "Audit Logs", view: "audit" },
    ],
  },
  {
    name: "Settings",
    section: "settings",
    items: [
      { label: "Store Information", view: "store" },
      { label: "IT HUB Location", view: "location" },
      { label: "On-Site Service Radius", view: "radius" },
      { label: "WhatsApp Number", view: "whatsapp" },
      { label: "Privacy & Visitor Data", view: "privacy" },
    ],
  },
  {
    name: "Website Content",
    section: "website-content",
    items: [{ label: "Showcase & Banners", view: "showcase" }],
  },
]
export const slug = (value: string) => value.toLowerCase().replace(/ /g, "-")
export const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)

// ── After-sales support: brand support directory ──
// Supabase: `support_categories`, `brand_support`, `support_verifications`.
// Extensible — add a category row (e.g. "monitor", "tv") without code changes.
export type SupportCategory = {
  id: string
  name: string
  /** lucide icon key used by the UI: laptop | smartphone | printer | monitor | tv | camera | router | gamepad | cpu */
  icon: string
  /** Store catalog categories that map to this support category (for order-aware lookup). */
  catalogCategories: string[]
  active: boolean
}
export const initialSupportCategories: SupportCategory[] = [
  { id: "laptop", name: "Laptop", icon: "laptop", catalogCategories: ["Laptops"], active: true },
  { id: "mobile", name: "Mobile", icon: "smartphone", catalogCategories: ["Mobiles"], active: true },
  { id: "printer", name: "Printer", icon: "printer", catalogCategories: ["Printers"], active: true },
]
export type BrandSupport = {
  id: string
  brand: string
  category: string
  warrantyPhone: string
  customerCarePhone: string
  supportUrl: string
  warrantyUrl: string
  email: string
  notes: string
  /** Official manufacturer page the details were taken from. */
  sourceUrl: string
  verifiedBy: string
  /** ISO date; empty = never verified — UI must show "Unverified". */
  lastVerifiedAt: string
  popular: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}
export type SupportVerification = {
  id: string
  supportId: string
  brand: string
  category: string
  verifiedBy: string
  sourceUrl: string
  changes: string
  date: string
}
/**
 * Seed records: brand + category + official support-site URL only.
 * Phone numbers are deliberately left empty — they must be added by an admin
 * from the manufacturer's official source and marked verified. Never guess them.
 */
const seed = (
  brand: string,
  category: string,
  supportUrl: string,
  popular = false,
): BrandSupport => ({
  id: `${category}-${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  brand,
  category,
  warrantyPhone: "",
  customerCarePhone: "",
  supportUrl,
  warrantyUrl: "",
  email: "",
  notes: "",
  sourceUrl: "",
  verifiedBy: "",
  lastVerifiedAt: "",
  popular,
  active: true,
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
})
export const initialBrandSupport: BrandSupport[] = [
  seed("ASUS", "laptop", "https://www.asus.com/in/support/", true),
  seed("HP", "laptop", "https://support.hp.com/in-en", true),
  seed("Dell", "laptop", "https://www.dell.com/support/home/en-in", true),
  seed("Lenovo", "laptop", "https://pcsupport.lenovo.com/in/en", true),
  seed("Acer", "laptop", "https://www.acer.com/in-en/support"),
  seed("MSI", "laptop", "https://www.msi.com/support"),
  seed("Apple", "laptop", "https://support.apple.com/en-in"),
  seed("Samsung", "laptop", "https://www.samsung.com/in/support/"),
  seed("Samsung", "mobile", "https://www.samsung.com/in/support/", true),
  seed("Apple", "mobile", "https://support.apple.com/en-in", true),
  seed("OnePlus", "mobile", "https://www.oneplus.in/support"),
  seed("Xiaomi", "mobile", "https://www.mi.com/in/support/", true),
  seed("Redmi", "mobile", "https://www.mi.com/in/support/"),
  seed("Realme", "mobile", "https://www.realme.com/in/support"),
  seed("Vivo", "mobile", "https://www.vivo.com/in/support"),
  seed("Oppo", "mobile", "https://support.oppo.com/in/"),
  seed("Motorola", "mobile", "https://www.motorola.com/we/support"),
  seed("Nothing", "mobile", "https://in.nothing.tech/pages/support"),
  seed("HP", "printer", "https://support.hp.com/in-en/printer", true),
  seed("Canon", "printer", "https://in.canon/en/support", true),
  seed("Epson", "printer", "https://www.epson.co.in/Support", true),
  seed("Brother", "printer", "https://www.brother.in/en/support"),
  seed("Ricoh", "printer", "https://www.ricoh.co.in/support/"),
  seed("Xerox", "printer", "https://www.support.xerox.com/"),
  seed("Samsung", "printer", "https://www.samsung.com/in/support/"),
]
/** Find the support record for a purchased product (order-aware assistance). */
export const supportForProduct = (
  product: Pick<Product, "brand" | "category">,
  categories: SupportCategory[],
  records: BrandSupport[],
) => {
  const category = categories.find(
    (item) => item.active && item.catalogCategories.includes(product.category),
  )
  const record = category
    ? records.find(
        (item) =>
          item.active &&
          item.category === category.id &&
          item.brand.toLowerCase() === product.brand.toLowerCase(),
      )
    : undefined
  return { category, record }
}
/**
 * Parse a warranty period like "2 years", "1 year", "6 months".
 * Returns null for anything we can't confidently interpret (e.g. "Limited lifetime").
 */
export const warrantyMonths = (text?: string) => {
  const match = text?.trim().match(/^(\d+)\s*(year|yr|month|mo)s?$/i)
  if (!match) return null
  const value = Number(match[1])
  return /^y/i.test(match[2]) ? value * 12 : value
}
export const warrantyUntil = (purchaseIso: string, months: number) => {
  const date = new Date(purchaseIso)
  date.setMonth(date.getMonth() + months)
  return date.toISOString()
}

// ── Coupons ──
export type CouponType = 'percentage' | 'fixed'
export type CouponUsageType = 'one_time'

export type Coupon = {
  id: string
  code: string                    // stored uppercase, compared case-insensitive
  description: string
  type: CouponType
  value: number                   // percent (0-90) or fixed INR amount
  minOrderValue: number           // 0 = no minimum
  maxDiscount: number             // 0 = no cap (only for percentage type)
  usageType?: CouponUsageType     // All coupons are strictly one-time per customer
  totalUsageLimit: number         // 0 = unlimited across all customers
  timesUsed: number
  active: boolean
  startsAt: string                // ISO datetime
  endsAt: string                  // ISO datetime
  createdAt: string
}

export type CouponUsage = {
  id: string
  couponId: string
  couponCode: string
  customerId: string              // unique customer phone, email or profile id
  userId?: string                 // backwards-compatible alias
  orderId: string
  discount: number
  usedAt: string
}

export const initialCoupons: Coupon[] = [
  {
    id: "CPN-WELCOME10",
    code: "WELCOME10",
    description: "10% off on all products (up to ₹2,000, 1-time per customer)",
    type: "percentage",
    value: 10,
    minOrderValue: 1000,
    maxDiscount: 2000,
    usageType: "one_time",
    totalUsageLimit: 500,
    timesUsed: 12,
    active: true,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "CPN-ITHUB500",
    code: "ITHUB500",
    description: "Flat ₹500 discount on orders above ₹5,000 (1-time per customer)",
    type: "fixed",
    value: 500,
    minOrderValue: 5000,
    maxDiscount: 0,
    usageType: "one_time",
    totalUsageLimit: 200,
    timesUsed: 5,
    active: true,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]
export const initialCouponUsages: CouponUsage[] = []

/**
 * Validate a coupon code for a given cart total and customer.
 * All coupons are strictly one-time per customer: verifies customer has not previously completed an order with this coupon.
 * Returns { valid: true, coupon, discount } or { valid: false, error }
 */
export const validateCoupon = (
  code: string,
  cartTotal: number,
  customerId: string,
  coupons: Coupon[],
  usages: CouponUsage[],
): { valid: true; coupon: Coupon; discount: number } | { valid: false; error: string } => {
  const upper = code.trim().toUpperCase()
  if (!upper) return { valid: false, error: 'Enter a coupon code.' }
  const coupon = coupons.find((c) => c.code.toUpperCase() === upper)
  if (!coupon) return { valid: false, error: 'Invalid coupon code.' }
  if (!coupon.active) return { valid: false, error: 'This coupon is no longer active.' }
  const now = Date.now()
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now)
    return { valid: false, error: 'This coupon is not yet valid.' }
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now)
    return { valid: false, error: 'This coupon has expired.' }
  if (coupon.totalUsageLimit > 0 && coupon.timesUsed >= coupon.totalUsageLimit)
    return { valid: false, error: 'This coupon has reached its usage limit.' }
  // Every coupon can only be used once per customer
  const alreadyUsed = usages.some(
    (u) => u.couponId === coupon.id && (u.customerId === customerId || u.userId === customerId),
  )
  if (alreadyUsed) return { valid: false, error: 'You have already used this coupon.' }
  if (coupon.minOrderValue > 0 && cartTotal < coupon.minOrderValue)
    return {
      valid: false,
      error: `Minimum order value of ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(coupon.minOrderValue)} required.`,
    }
  let discount = coupon.type === 'percentage'
    ? Math.round((cartTotal * coupon.value) / 100)
    : coupon.value
  if (coupon.type === 'percentage' && coupon.maxDiscount > 0)
    discount = Math.min(discount, coupon.maxDiscount)
  discount = Math.min(discount, cartTotal)
  return { valid: true, coupon, discount }
}

// ── Sell Your Item (customer submission flow) ──
export type SellRequestStatus =
  | 'Pending'
  | 'Under Review'
  | 'Contacted'
  | 'Approved'
  | 'Rejected'
  | 'Completed'

export const sellRequestStatuses: SellRequestStatus[] = [
  'Pending', 'Under Review', 'Contacted', 'Approved', 'Rejected', 'Completed',
]

export const sellCategories = [
  'Phone',
  'Laptop',
  'Desktop / PC',
  'Monitor',
  'Printer',
  'Tablet',
  'Accessories',
  'Other Electronics',
] as const
export type SellCategory = typeof sellCategories[number]

export type SellRequest = {
  id: string                      // e.g. SELL-XXXXXXX
  userId: string                  // store.profile.phone
  customerName: string
  customerEmail: string
  customerPhone: string
  category: SellCategory
  productName: string
  brand: string
  model: string
  condition: ProductCondition
  description: string
  hasWarranty: boolean
  warrantyProvider: string
  warrantyRemaining: string       // e.g. '6 months', '1 year'
  warrantyDetails: string
  /** Simulated storage paths for product images (in prototype: data URIs or filenames) */
  imagePaths: string[]
  /** Simulated storage path for invoice document */
  invoicePath: string
  status: SellRequestStatus
  adminNotes: string
  submittedAt: string
  updatedAt: string
}

export const initialSellRequests: SellRequest[] = [
  {
    id: "SELL-78219A",
    userId: "9876543210",
    customerName: "Rahul Menon",
    customerEmail: "rahul.menon@example.com",
    customerPhone: "9876543210",
    category: "Laptop",
    productName: "HP Pavilion 15 Gaming",
    brand: "HP",
    model: "ec2075AX (Ryzen 5 / GTX 1650)",
    condition: "Good",
    description: "Purchased in 2023. Minor scratches on lid, screen and keyboard in mint condition. Original charger included.",
    hasWarranty: true,
    warrantyProvider: "HP India",
    warrantyRemaining: "4 months",
    warrantyDetails: "Extended care pack valid till Feb 2027",
    imagePaths: ["/images/laptop.jpg"],
    invoicePath: "/invoices/hp-pavilion-invoice.pdf",
    status: "Under Review",
    adminNotes: "Customer sent clear photos of invoice. Checking serial number against HP support portal.",
    submittedAt: "2026-10-05T10:30:00.000Z",
    updatedAt: "2026-10-06T14:15:00.000Z",
  },
  {
    id: "SELL-41902B",
    userId: "9847123456",
    customerName: "Ananya George",
    customerEmail: "ananya.george@example.com",
    customerPhone: "9847123456",
    category: "Phone",
    productName: "Samsung Galaxy S22 5G",
    brand: "Samsung",
    model: "SM-S901E 128GB Phantom Black",
    condition: "Like New",
    description: "Used as a secondary device with case and glass protector from day one. Battery health excellent.",
    hasWarranty: false,
    warrantyProvider: "",
    warrantyRemaining: "",
    warrantyDetails: "",
    imagePaths: ["/images/phone.jpg"],
    invoicePath: "",
    status: "Pending",
    adminNotes: "",
    submittedAt: "2026-10-06T18:00:00.000Z",
    updatedAt: "2026-10-06T18:00:00.000Z",
  },
]
