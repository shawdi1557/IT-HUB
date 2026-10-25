// ── Second-hand / Pre-owned products ──

export type ProductCondition = "New" | "Like New" | "Good" | "Fair" | "For Parts"

export const productConditions: ProductCondition[] = [
  "New",

  "Like New",

  "Good",

  "Fair",

  "For Parts",
]

export type Product = {
  id: string

  name: string

  brand: string

  category: string

  categorySource?: "taxonomy" | "productType" | "collection" | "fallback"

  taxonomyCategory?: {
    id?: string
    name: string
    fullName?: string
    ancestors?: string[]
  }

  productType?: string

  collections?: string[]

  price: number

  original: number

  image: string

  stock: number

  rating: number

  specs: Record<string, string>

  tag?: string

  tags?: string[]

  sku?: string

  subcategory?: string

  description?: string

  descriptionHtml?: string

  costPrice?: number

  lowStockThreshold?: number

  warranty?: string

  weight?: string

  status?: "Active" | "Draft" | "Archived"

  secondHand?: boolean

  condition?: ProductCondition

  handle?: string

  variantId?: string

  availableForSale?: boolean

  images?: string[]

  options?: Array<{ id?: string; name: string; values: string[] }>

  variants?: Array<{
    id: string
    title: string
    price: number
    compareAtPrice?: number
    sku?: string
    availableForSale: boolean
    selectedOptions: Array<{ name: string; value: string }>
    image?: string
  }>
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

export const initialProducts: Product[] = []

export const categories = [
  "Laptops & MacBooks",

  "Desktops & Servers",

  "PC Components",

  "Processors",

  "Motherboards",

  "Graphics Cards",

  "RAM",

  "Storage",

  "Monitors",

  "Printers & Scanners",

  "Inks & Toners",

  "Mobiles & Tablets",

  "Networking & CCTV",

  "Audio & Speakers",

  "Power & Inverters",

  "Laptop Spare Parts",

  "Accessories",

  "Gaming",
]

export const initialBrands = [
  "Acer",

  "AMD",

  "Antec",

  "Ant Esports",

  "APC",

  "Apple",

  "ASUS",

  "BenQ",

  "boAt",

  "Brother",

  "Canon",

  "Colorful",

  "Cooler Master",

  "Corsair",

  "CP Plus",

  "Crucial",

  "D-Link",

  "Deepcool",

  "Dell",

  "Epson",

  "Fingers",

  "Foxin",

  "Gigabyte",

  "Hikvision",

  "HP",

  "HyperX",

  "Intel",

  "iQOO",

  "IT HUB",

  "JBL",

  "Kingston",

  "Lapcare",

  "Lenovo",

  "LG",

  "Logitech",

  "Motorola",

  "MSI",

  "Noise",

  "Nothing",

  "Numeric",

  "NVIDIA",

  "OnePlus",

  "OPPO",

  "POCO",

  "Portronics",

  "Realme",

  "Redmi / Xiaomi",

  "Samsung",

  "SanDisk",

  "Sapphire",

  "Seagate",

  "Sony",

  "Tenda",

  "TP-Link",

  "TVS-E",

  "V-Guard",

  "Vivo",

  "Western Digital",

  "Zebronics",

  "Zotac",
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

export const problemsFor = (device: string) =>
  problemsByDevice[device] || problems

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

export interface ServiceCatalogItem {
  id: string

  name: string

  category: "laptop" | "mobile" | "pc" | "printer" | "software" | "onsite"

  tagline: string

  description: string

  diagnosticFee: number

  labourRange: [number, number]

  partsRangeText: string

  startingTotal: number

  turnaroundEstimate: string

  commonSymptoms: string[]

  warrantyText: string

  doorstepEligible: boolean

  courierEligible: boolean

  popular?: boolean
}

export const serviceWarrantyPolicy = {
  durationDays: 90,

  inspectionPolicy:
    "Bench diagnostic assessment fee is waived when the repair quotation is approved and completed by IT HUB.",

  partsGuarantee:
    "Genuine OEM or Tier-1 Grade-A certified replacement parts with independent distributor/manufacturer warranties.",

  coverageScope:
    "Warranty strictly covers the specific component replaced and the associated labour workmanship against defects.",

  exclusions: [
    "Accidental physical impacts, drop cracks, casing damage, or liquid ingress occurring post-handover.",

    "Electrical surges, lightning strikes, or operating without adequate surge protection.",

    "Tampering, seal breaking, or disassembly attempted by third-party repairers.",

    "Software errors, OS corruption, user-installed malware, or virus reinfection.",

    "Customer data loss: IT HUB is not liable for data loss. Customers are strongly advised to back up critical data before service.",
  ],
}

export interface RepairEstimatorItem {
  device: string

  issue: string

  diagnosticFee: number

  labourMin: number

  labourMax: number

  partsMin: number

  partsMax: number

  turnaround: string

  notes: string
}

export const repairEstimates: RepairEstimatorItem[] = [
  {
    device: "Laptop",

    issue: "Screen issue",

    diagnosticFee: 299,

    labourMin: 450,

    labourMax: 750,

    partsMin: 2400,

    partsMax: 5500,

    turnaround: "24–48 hrs",

    notes:
      "Model-specific: HD, FHD IPS, OLED or 144Hz panel pricing verified post-inspection.",
  },

  {
    device: "Laptop",

    issue: "Battery problem",

    diagnosticFee: 299,

    labourMin: 350,

    labourMax: 600,

    partsMin: 1400,

    partsMax: 3200,

    turnaround: "Same-Day to 24 hrs",

    notes:
      "Includes multi-cell diagnostic battery calibration and battery health report.",
  },

  {
    device: "Laptop",

    issue: "Overheating",

    diagnosticFee: 0,

    labourMin: 499,

    labourMax: 799,

    partsMin: 0,

    partsMax: 250,

    turnaround: "Same-Day (2–4 hrs)",

    notes:
      "Thermal fan ultrasonic dust purge + premium Arctic MX-4 / Grizzly thermal repaste.",
  },

  {
    device: "Laptop",

    issue: "Slow performance",

    diagnosticFee: 0,

    labourMin: 350,

    labourMax: 500,

    partsMin: 1500,

    partsMax: 3600,

    turnaround: "Same-Day (2–3 hrs)",

    notes:
      "High-speed NVMe/SATA SSD upgrade with seamless OS and user profile migration.",
  },

  {
    device: "Laptop",

    issue: "Charging issue",

    diagnosticFee: 299,

    labourMin: 450,

    labourMax: 850,

    partsMin: 300,

    partsMax: 1200,

    turnaround: "24–48 hrs",

    notes:
      "DC jack micro-soldering, charging IC repair, or USB Type-C port replacement.",
  },

  {
    device: "Laptop",

    issue: "Keyboard issue",

    diagnosticFee: 299,

    labourMin: 400,

    labourMax: 700,

    partsMin: 850,

    partsMax: 2400,

    turnaround: "24–48 hrs",

    notes: "OEM replacement keyboard with backlight continuity testing.",
  },

  {
    device: "Mobile",

    issue: "Screen issue",

    diagnosticFee: 199,

    labourMin: 400,

    labourMax: 700,

    partsMin: 1400,

    partsMax: 4800,

    turnaround: "24–48 hrs",

    notes:
      "Grade-A display assembly with multi-touch responsiveness calibration.",
  },

  {
    device: "Mobile",

    issue: "Battery problem",

    diagnosticFee: 199,

    labourMin: 300,

    labourMax: 500,

    partsMin: 850,

    partsMax: 1900,

    turnaround: "Same-Day (1–3 hrs)",

    notes: "High-capacity certified replacement battery with warranty seal.",
  },

  {
    device: "Mobile",

    issue: "Charging issue",

    diagnosticFee: 199,

    labourMin: 300,

    labourMax: 600,

    partsMin: 250,

    partsMax: 800,

    turnaround: "Same-Day (2–4 hrs)",

    notes:
      "Sub-board / CC board charging flex replacement with fast-charge testing.",
  },

  {
    device: "Mobile",

    issue: "Water damage",

    diagnosticFee: 299,

    labourMin: 600,

    labourMax: 1200,

    partsMin: 0,

    partsMax: 2000,

    turnaround: "24–72 hrs",

    notes:
      "Ultrasonic board deoxidization, power rail short-circuit trace repair.",
  },

  {
    device: "Desktop",

    issue: "Not turning on",

    diagnosticFee: 299,

    labourMin: 400,

    labourMax: 800,

    partsMin: 1200,

    partsMax: 3500,

    turnaround: "24–48 hrs",

    notes:
      "Power supply (PSU) bench test, motherboard VRM inspection, RAM slot test.",
  },

  {
    device: "Desktop",

    issue: "Slow performance",

    diagnosticFee: 0,

    labourMin: 350,

    labourMax: 500,

    partsMin: 1500,

    partsMax: 3800,

    turnaround: "Same-Day (2–4 hrs)",

    notes: "SSD boot drive upgrade, RAM expansion, and startup optimization.",
  },

  {
    device: "Desktop",

    issue: "Overheating",

    diagnosticFee: 0,

    labourMin: 350,

    labourMax: 600,

    partsMin: 450,

    partsMax: 1800,

    turnaround: "Same-Day (2–3 hrs)",

    notes:
      "CPU cooler cleaning, high-performance thermal paste, and airflow rebalancing.",
  },

  {
    device: "Printer",

    issue: "Not printing",

    diagnosticFee: 250,

    labourMin: 350,

    labourMax: 700,

    partsMin: 200,

    partsMax: 1200,

    turnaround: "24–48 hrs",

    notes:
      "Paper pickup roller replacement, carriage belt alignment, driver troubleshooting.",
  },

  {
    device: "Printer",

    issue: "Faded / streaky prints",

    diagnosticFee: 250,

    labourMin: 400,

    labourMax: 750,

    partsMin: 300,

    partsMax: 1500,

    turnaround: "24–48 hrs",

    notes:
      "Ultrasonic printhead flush, nozzle realignment, ink delivery tubing flush.",
  },

  {
    device: "Printer",

    issue: "Paper jam",

    diagnosticFee: 250,

    labourMin: 300,

    labourMax: 550,

    partsMin: 0,

    partsMax: 600,

    turnaround: "Same-Day to 24 hrs",

    notes:
      "Foreign object extraction, gear sensor inspection, feeder roller cleaning.",
  },

  {
    device: "Software",

    issue: "OS Installation",

    diagnosticFee: 0,

    labourMin: 450,

    labourMax: 650,

    partsMin: 0,

    partsMax: 0,

    turnaround: "Same-Day (2–3 hrs)",

    notes:
      "Genuine OS setup, motherboard chipset drivers, essential productivity suite.",
  },

  {
    device: "Software",

    issue: "Virus",

    diagnosticFee: 0,

    labourMin: 400,

    labourMax: 600,

    partsMin: 0,

    partsMax: 0,

    turnaround: "Same-Day (2–4 hrs)",

    notes:
      "Deep malware rootkit scan, registry clean, security patch application.",
  },

  {
    device: "Software",

    issue: "Data recovery",

    diagnosticFee: 499,

    labourMin: 1200,

    labourMax: 3500,

    partsMin: 0,

    partsMax: 0,

    turnaround: "48–72 hrs",

    notes:
      "Logical partition recovery, raw file-system carve, bad-sector disk imaging.",
  },
]

export const serviceCatalogItems: ServiceCatalogItem[] = [
  {
    id: "laptop-screen",

    name: "Laptop Screen Replacement",

    category: "laptop",

    tagline: "Crystal-clear HD & FHD replacement displays",

    description:
      "Expert replacement for shattered glass, vertical colored stripes, dead backlight, or unresponsive touch displays across Dell, HP, Lenovo, ASUS, Acer and Apple.",

    diagnosticFee: 299,

    labourRange: [450, 750],

    partsRangeText:
      "₹2,400 – ₹5,800 (Panel resolution & refresh rate dependent)",

    startingTotal: 2850,

    turnaroundEstimate: "24–48 hrs (subject to panel availability)",

    commonSymptoms: [
      "Cracked front glass",
      "Vertical colored lines",
      "Flickering display",
      "Black screen with power LED on",
    ],

    warrantyText: "90-day manufacturing warranty on replacement panel",

    doorstepEligible: false,

    courierEligible: true,

    popular: true,
  },

  {
    id: "laptop-battery",

    name: "Laptop Battery Replacement",

    category: "laptop",

    tagline: "Restore all-day runtime with certified battery cells",

    description:
      "Replace exhausted, rapidly draining, or dangerously swollen internal and external laptop batteries with tested Grade-A cells and full health diagnostics.",

    diagnosticFee: 299,

    labourRange: [350, 600],

    partsRangeText: "₹1,400 – ₹3,400 (Capacity & brand specific)",

    startingTotal: 1750,

    turnaroundEstimate: "Same-Day to 24 hrs",

    commonSymptoms: [
      "Battery drains in under an hour",
      "Shuts down when charger disconnected",
      "Swollen trackpad",
      "Service Battery alert",
    ],

    warrantyText: "Up to 180 days replacement warranty on battery",

    doorstepEligible: true,

    courierEligible: true,

    popular: true,
  },

  {
    id: "laptop-thermal",

    name: "Thermal Repasting & Deep Purge",

    category: "laptop",

    tagline: "Lower temperatures, silent fans, peak performance",

    description:
      "Ultrasonic dust removal from heat sinks and dual cooling fans, coupled with premium Arctic MX-4 or Thermal Grizzly repasting to prevent thermal throttling.",

    diagnosticFee: 0,

    labourRange: [499, 799],

    partsRangeText: "Premium thermal compound included",

    startingTotal: 499,

    turnaroundEstimate: "Same-Day (2–4 hrs)",

    commonSymptoms: [
      "Laptop burning hot to the touch",
      "Fan screaming at full speed",
      "Random shutoffs while gaming or heavy tasks",
      "FPS stuttering",
    ],

    warrantyText: "30-day thermal performance guarantee",

    doorstepEligible: true,

    courierEligible: true,

    popular: true,
  },

  {
    id: "laptop-ssd-ram",

    name: "SSD & RAM High-Speed Upgrade",

    category: "laptop",

    tagline: "Make older laptops 5x faster in minutes",

    description:
      "Replace bottlenecked 5400RPM mechanical HDDs with lightning-fast NVMe or SATA SSDs. Includes 100% complete data and OS migration without losing files.",

    diagnosticFee: 0,

    labourRange: [350, 500],

    partsRangeText: "₹1,500 – ₹3,800 (Crucial / Kingston / WD / Samsung)",

    startingTotal: 1850,

    turnaroundEstimate: "Same-Day (2–3 hrs)",

    commonSymptoms: [
      "100% disk usage in Task Manager",
      "Windows takes 3+ minutes to boot",
      "Apps freezing when switching tabs",
    ],

    warrantyText: "Up to 3–5 years manufacturer warranty on brand SSD/RAM",

    doorstepEligible: true,

    courierEligible: true,

    popular: true,
  },

  {
    id: "mobile-screen",

    name: "Smartphone Screen Replacement",

    category: "mobile",

    tagline: "Vibrant AMOLED & IPS displays for all brands",

    description:
      "High-grade display assembly replacements for iPhone, Samsung, Xiaomi, OnePlus, Realme, Vivo, OPPO and Motorola with precise frame bonding.",

    diagnosticFee: 199,

    labourRange: [400, 700],

    partsRangeText: "₹1,400 – ₹4,800 (Model specific)",

    startingTotal: 1800,

    turnaroundEstimate: "24–48 hrs",

    commonSymptoms: [
      "Shattered glass",
      "Touch not responding",
      "Ink spots / bleed spreading",
      "Dead display",
    ],

    warrantyText: "90-day touch & display functionality warranty",

    doorstepEligible: false,

    courierEligible: true,

    popular: true,
  },

  {
    id: "mobile-battery",

    name: "Smartphone Battery Replacement",

    category: "mobile",

    tagline: "Restore original battery backup safely",

    description:
      "Safe extraction of degraded or swollen smartphone batteries and installation of fresh high-capacity cells with heat-resistant adhesive bonding.",

    diagnosticFee: 199,

    labourRange: [300, 500],

    partsRangeText: "₹850 – ₹1,900 (Model specific)",

    startingTotal: 1150,

    turnaroundEstimate: "Same-Day (1–3 hrs)",

    commonSymptoms: [
      "Phone battery drops from 40% to 0% suddenly",
      "Back cover lifting up",
      "Requires charging 3 times a day",
    ],

    warrantyText: "90-day warranty on battery performance",

    doorstepEligible: true,

    courierEligible: true,
  },

  {
    id: "pc-troubleshoot",

    name: "Desktop PC Diagnostic & Repair",

    category: "pc",

    tagline: "Bench-level diagnostics for custom & branded PCs",

    description:
      "Component-level fault isolation for random restarts, Blue Screen errors (BSOD), GPU artifacts, power supply failure, and motherboard post failures.",

    diagnosticFee: 299,

    labourRange: [400, 850],

    partsRangeText: "Component-dependent if replacement needed",

    startingTotal: 699,

    turnaroundEstimate: "24–48 hrs",

    commonSymptoms: [
      "PC turns on but no signal to monitor",
      "Continuous beep codes",
      "Sudden rebooting under load",
      "Burning smell",
    ],

    warrantyText: "90-day warranty on repairs & component replacements",

    doorstepEligible: true,

    courierEligible: true,

    popular: true,
  },

  {
    id: "printer-servicing",

    name: "Printer Servicing & Printhead Flush",

    category: "printer",

    tagline: "Fix paper jams, faded prints, and ink flow issues",

    description:
      "Comprehensive maintenance for Epson EcoTank, Canon Pixma, HP Ink Tank & LaserJet printers. Includes waste ink pad reset and chemical printhead flush.",

    diagnosticFee: 250,

    labourRange: [350, 750],

    partsRangeText: "₹300 – ₹1,200 (Pick-up roller, waste ink pad, head flush)",

    startingTotal: 600,

    turnaroundEstimate: "24–48 hrs",

    commonSymptoms: [
      "Blank pages coming out",
      "Faded horizontal stripes",
      "Paper jam error when no paper is stuck",
      "Red warning light blinking",
    ],

    warrantyText: "30-day print output quality warranty",

    doorstepEligible: true,

    courierEligible: true,

    popular: true,
  },

  {
    id: "os-software",

    name: "OS Reinstallation & System Tune-Up",

    category: "software",

    tagline: "Clean, fresh, bloatware-free operating system",

    description:
      "Certified clean reinstallation of Windows 11/10 or macOS. Complete hardware driver optimization, security updates, and essential software configuration.",

    diagnosticFee: 0,

    labourRange: [450, 650],

    partsRangeText: "No hardware parts required",

    startingTotal: 450,

    turnaroundEstimate: "Same-Day (2–3 hrs)",

    commonSymptoms: [
      "Windows stuck in automatic repair loop",
      "System infested with adware or browser popups",
      "Corrupted user profile",
    ],

    warrantyText: "14-day software stability warranty",

    doorstepEligible: true,

    courierEligible: true,
  },

  {
    id: "data-recovery",

    name: "Hard Disk & Flash Drive Data Recovery",

    category: "software",

    tagline: "Recover precious memories, documents and databases",

    description:
      "Careful software and hardware recovery from formatted drives, deleted partitions, corrupted USB sticks, and hard drives with bad sectors.",

    diagnosticFee: 499,

    labourRange: [1200, 3500],

    partsRangeText: "Dedicated recovery media required if target drive failing",

    startingTotal: 1699,

    turnaroundEstimate: "48–72 hrs",

    commonSymptoms: [
      "External hard drive clicking or not detected",
      "Accidentally formatted partition",
      "RAW file system prompt to format",
    ],

    warrantyText: "Safe data extraction confidentiality protocol",

    doorstepEligible: false,

    courierEligible: true,
  },

  {
    id: "onsite-support",

    name: "Doorstep IT Support (Local Radius)",

    category: "onsite",

    tagline: "Certified technician at your home or office",

    description:
      "On-site troubleshooting for desktop PCs, Wi-Fi mesh routers, network printers, and office networking within ~15 km of Kothamangalam.",

    diagnosticFee: 250,

    labourRange: [400, 750],

    partsRangeText: "Materials billed as needed with advance approval",

    startingTotal: 650,

    turnaroundEstimate: "Scheduled appointment slot",

    commonSymptoms: [
      "Office network down",
      "Wi-Fi not reaching all rooms",
      "Desktop too heavy to transport to store",
    ],

    warrantyText: "30-day on-site configuration guarantee",

    doorstepEligible: true,

    courierEligible: false,

    popular: true,
  },
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

  /** Authoritative Shopify ProductVariant GID */
  variantId?: string

  /** True if this component is backed by live Shopify Storefront product */
  isShopifyLive?: boolean

  /** True if physical & electrical specifications have been verified against hardware datasheets */
  isVerified?: boolean

  /** Specification source provenance */
  provenance?: string

  /** Reason when component specs cannot be verified */
  unverifiedReason?: string

  /** Internal model key for mapping with build templates */
  matchedModelKey?: string
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

    {
      id: "r5-5600",

      name: "AMD Ryzen 5 5600",

      price: 10999,

      socket: "AM4",

      watts: 65,
    },

    {
      id: "r5-8600g",

      name: "AMD Ryzen 5 8600G (Radeon graphics)",

      price: 17999,

      socket: "AM5",

      watts: 65,
    },

    {
      id: "r7-9800x3d",

      name: "AMD Ryzen 7 9800X3D",

      price: 47999,

      socket: "AM5",

      watts: 120,
    },

    {
      id: "r9-9950x",

      name: "AMD Ryzen 9 9950X",

      price: 54999,

      socket: "AM5",

      watts: 170,
    },

    {
      id: "i5-12400",

      name: "Intel Core i5-12400 (UHD graphics)",

      price: 13499,

      socket: "LGA1700",

      watts: 65,
    },

    {
      id: "i5-12400f",

      name: "Intel Core i5-12400F",

      price: 11999,

      socket: "LGA1700",

      watts: 65,
    },
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

    {
      id: "b550",

      name: "MSI B550M PRO-VDH",

      price: 9999,

      socket: "AM4",

      ram: "DDR4",

      interface: "NVMe",
    },

    {
      id: "b650wifi",

      name: "MSI B650 Gaming Plus WiFi",

      price: 18999,

      socket: "AM5",

      ram: "DDR5",

      interface: "NVMe",

      wifi: true,
    },

    {
      id: "b760wifi",

      name: "ASUS PRIME B760M-A WiFi D4",

      price: 14999,

      socket: "LGA1700",

      ram: "DDR4",

      interface: "NVMe",

      wifi: true,
    },
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

    {
      id: "rx6600",

      name: "AMD RX 6600 8GB",

      price: 19999,

      watts: 132,

      length: 190,
    },

    {
      id: "rx7600",

      name: "AMD RX 7600 8GB",

      price: 25999,

      watts: 165,

      length: 205,
    },

    {
      id: "4060ti",

      name: "NVIDIA RTX 4060 Ti 16GB",

      price: 44999,

      watts: 165,

      length: 245,

      stock: 0,
    },

    {
      id: "4080s",

      name: "NVIDIA RTX 4080 Super",

      price: 99999,

      watts: 320,

      length: 310,
    },
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

    {
      id: "aio360",

      name: "Lian Li Galahad II 360mm AIO",

      price: 13999,

      capacity: 350,
    },
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

  variantId?: string

  build?: Build
}

export type Order = {
  id: string

  name: string

  email: string

  phone?: string

  address: string

  items: CartItem[]

  total: number

  status: number

  statusName?: string

  date: string

  payment: string

  delivery: string
}

export type FindingSource = "customer" | "technician"
export type FindingClassification = "confirmed" | "suspected" | "needs_further_testing"
export type RepairSafety = "required" | "recommended" | "optional" | "cosmetic"

export interface DiagnosisFinding {
  id: string
  title: string
  description: string
  source: FindingSource
  classification: FindingClassification
  customerExplanation: string
  attachments?: string[]
  recommendedRepair: string
  safety: RepairSafety
  isEligibleForRepair: boolean
  createdAt: string
}

export type QuotationItemState = "pending" | "approved" | "declined" | "deferred" | "rejected"

export interface QuotationItem {
  id: string
  findingId?: string
  title: string
  description: string
  partCost: number
  labourCost: number
  quantity: number
  discount?: number
  lineTotal: number
  isRequired: boolean
  canDefer: boolean
  dependsOn?: string[]
  approvalState: QuotationItemState
}

export interface QuotationRevision {
  version: number
  publishedAt: string
  publishedBy: string
  items: QuotationItem[]
  findings: DiagnosisFinding[]
  totalAmount: number
  notes?: string
}


export type ServiceRequest = {
  id: string

  userId?: string

  name: string

  email: string

  phone?: string

  device: string

  model: string

  problem: string

  method: string

  address: string

  date: string

  time: string

  status: number

  statusName?: string

  quote: number

  quoteState: "pending" | "approved" | "rejected"

  quoteVersion?: number

  technician: string

  notes: string

  courierCharge?: { returnDelivery: number }

  findings?: DiagnosisFinding[]

  quotationItems?: QuotationItem[]

  approvedItems?: string[]

  declinedItems?: string[]

  decisionNotes?: string

  decisionAt?: string

  decisionActor?: string

  quotationHistory?: QuotationRevision[]

  payment?: string
}

// ── Offers (no coupon codes — offers apply automatically by date window) ──

export const offerTypes = [
  "Product Offer",

  "Category Offer",

  "Brand Offer",

  "Seasonal Offer",

  "Flash Sale",
] as const

export type OfferType = typeof offerTypes[number]

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

  if (offer.startsAt && new Date(offer.startsAt).getTime() > now)
    return "Scheduled"

  if (offer.endsAt && new Date(offer.endsAt).getTime() < now) return "Expired"

  return "Active"
}

export const offerApplies = (
  offer: Offer,

  product: Pick<Product, "id" | "brand" | "category">,
) =>
  offer.products.includes(product.id) ||
  offer.categories.includes(product.category) ||
  offer.brands.includes(product.brand)

export const offerHeadline = (offer: Offer) =>
  offer.discount > 0
    ? `UP TO ${offer.discount}% OFF`
    : `FLAT ${money(offer.amount)} OFF`

/** Best currently-active offer for a product and its discounted unit price. */

export interface BestOfferResult {
  offer: Offer

  price: number

  saving: number
}

export const bestOffer = (
  offers: Offer[],

  product: Pick<Product, "id" | "brand" | "category" | "price">,
) => {
  let best: BestOfferResult | null = null

  for (const offer of offers) {
    if (offerStatus(offer) !== "Active" || !offerApplies(offer, product))
      continue

    const saving = Math.min(
      product.price,

      offer.discount > 0
        ? Math.round((product.price * offer.discount) / 100)
        : offer.amount,
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

    name: "IT HUB Kothamangalam (Headquarters)",

    address: "Molathu Building, College Jn., Kothamangalam, Kerala",

    pincode: "686691",

    latitude: 10.0601,

    longitude: 76.6277,

    serviceRadiusKm: 15,

    active: true,
  },
]

/**
 * PIN code → approximate area centroid. Centroids are estimates, so any
 * distance derived from them is labelled approximate in the UI.
 * (Supabase: `pincode_areas` lookup table.)
 */

export const pincodeDirectory: Record<string, {
  area: string

  latitude: number

  longitude: number
}> = {
  // ── Kothamangalam Administrative Division ──

  "686691": {
    area: "Kothamangalam Town (Bazar, Nellikuzhy, Varapetty, Karukadom, Cheruvattoor, Iramalloor, Kozhipilly, Nadukani)",

    latitude: 10.0601,

    longitude: 76.6277,
  },

  "686666": {
    area: "Kothamangalam College (M.A. College Campus Area)",

    latitude: 10.0545,

    longitude: 76.6435,
  },

  "686692": {
    area: "Kottappady & Adjacent Limits",

    latitude: 10.1132,

    longitude: 76.5925,
  },

  "686681": {
    area: "Keerampara / Bhoothathankettu / Thattekkad (Forest & Eco-Tourism Range)",

    latitude: 10.118,

    longitude: 76.685,
  },

  "686693": {
    area: "Manikinar, Neendapara & Forest Boundaries",

    latitude: 10.038,

    longitude: 76.715,
  },

  "686671": {
    area: "Chathamattam, Koovalloor & Limits",

    latitude: 10.024,

    longitude: 76.671,
  },

  "685514": {
    area: "Eastern High-Range / Pindimana Boundary",

    latitude: 10.054,

    longitude: 76.785,
  },

  "685612": {
    area: "Eastern High-Range / Oonnukal Range",

    latitude: 10.033,

    longitude: 76.755,
  },

  "683544": {
    area: "Kuttampuzha (Kothamangalam Forest Range)",

    latitude: 10.153,

    longitude: 76.738,
  },

  // ── Muvattupuzha Region ──

  "686661": {
    area: "Muvattupuzha Town & HPO (Bazar, Kizhakkekara, Peringuzha, Thottumkalpeedika)",

    latitude: 9.9894,

    longitude: 76.579,
  },

  "686673": {
    area: "Muvattupuzha Market & Suburbs (Kadathy, Kakkadasseri, Perumattom, Randar, Vazhappily, Mulavoor, Enanalloor)",

    latitude: 9.975,

    longitude: 76.582,
  },

  // ── Nearby Localities ──

  "686670": {
    area: "Pothanicad",

    latitude: 10.001,

    longitude: 76.68,
  },

  "683556": {
    area: "Perumbavoor (Odakkali / Asamannoor)",

    latitude: 10.079,

    longitude: 76.532,
  },

  "683542": {
    area: "Perumbavoor Town",

    latitude: 10.1157,

    longitude: 76.478,
  },

  "685608": {
    area: "Thodupuzha (Kaliyar / Vannappuram)",

    latitude: 9.949,

    longitude: 76.738,
  },

  "685584": {
    area: "Thodupuzha Town",

    latitude: 9.896,

    longitude: 76.7137,
  },

  // ── Key Central Kerala Hubs ──

  "682030": {
    area: "Kakkanad / Infopark",

    latitude: 10.0159,

    longitude: 76.3419,
  },

  "682016": {
    area: "Ernakulam M.G. Road",

    latitude: 9.9816,

    longitude: 76.2799,
  },

  "682011": { area: "Ernakulam City", latitude: 9.9816, longitude: 76.2999 },

  "682001": { area: "Kochi Fort Kochi", latitude: 9.9658, longitude: 76.2421 },

  "682024": {
    area: "Kalamassery / CUSAT",

    latitude: 10.0469,

    longitude: 76.3267,
  },

  "682020": { area: "Kadavanthra", latitude: 9.9678, longitude: 76.2996 },

  "683101": { area: "Aluva", latitude: 10.1076, longitude: 76.3516 },

  "686001": { area: "Kottayam Town", latitude: 9.5916, longitude: 76.5222 },

  "680001": { area: "Thrissur Town", latitude: 10.5276, longitude: 76.2144 },

  "673001": { area: "Kozhikode Town", latitude: 11.248, longitude: 75.776 },

  "673004": {
    area: "Kozhikode Mavoor Road",

    latitude: 11.2588,

    longitude: 75.7804,
  },

  "695001": {
    area: "Thiruvananthapuram Statue / City",

    latitude: 8.4904,

    longitude: 76.953,
  },

  "695033": {
    area: "Pattom, Trivandrum",

    latitude: 8.5241,

    longitude: 76.9407,
  },

  "695581": {
    area: "Kazhakkoottam / Technopark",

    latitude: 8.5686,

    longitude: 76.8731,
  },
}

const toRad = (deg: number) => (deg * Math.PI) / 180

export const distanceKm = (
  aLat: number,

  aLng: number,

  bLat: number,

  bLng: number,
) => {
  const dLat = toRad(bLat - aLat)

  const dLng = toRad(bLng - aLng)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2

  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export type WarrantyResult = { status: "invalid" } | {
  status: "unknown"

  pincode: string
} | {
  status: "eligible" | "ineligible"

  pincode: string

  area: string

  location: ItHubLocation

  distanceKm: number | null
}

/** Straight-line distance from the PIN centroid to the nearest active IT HUB location. */

export const checkWarranty = (
  pincode: string,

  locations: ItHubLocation[],
): WarrantyResult => {
  const pin = pincode.trim()

  if (!/^[1-9]\d{5}$/.test(pin)) return { status: "invalid" }

  const centroid = pincodeDirectory[pin]

  const active = locations.filter((location) => location.active)

  if (!centroid || !active.length) {
    const fallbackLocation = active[0] || initialLocations[0]

    return {
      status: "ineligible",

      pincode: pin,

      area: "Outside Service Area",

      location: fallbackLocation,

      distanceKm: null,
    }
  }

  const nearest = active

    .map((location) => ({
      location,

      km: distanceKm(
        centroid.latitude,

        centroid.longitude,

        location.latitude,

        location.longitude,
      ),
    }))

    .sort((a, b) => a.km - b.km)[0]

  return {
    status:
      nearest.km <= nearest.location.serviceRadiusKm
        ? "eligible"
        : "ineligible",

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

export interface PcEnquiryPart {
  type: string

  name: string

  price: number
}

// ── PC Builder enquiries (sent to WhatsApp) ──

export type PcEnquiry = {
  id: string

  summary: string

  parts: PcEnquiryPart[]

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

export interface AdminNavItem {
  label: string

  view: string
}

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

      { label: "Image Discovery", view: "image-discovery" },
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

      { label: "On-Site Service", view: "warranty" },

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

      { label: "Service Centres", view: "centres" },

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
    name: "Certificates",

    section: "certificates",

    items: [
      { label: "All Showcase", view: "all" },

      { label: "Add Certificate", view: "add" },
    ],
  },

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

      { label: "Database Connection", view: "database" },
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
  {
    id: "laptop",

    name: "Laptop",

    icon: "laptop",

    catalogCategories: ["Laptops"],

    active: true,
  },

  {
    id: "mobile",

    name: "Mobile",

    icon: "smartphone",

    catalogCategories: ["Mobiles"],

    active: true,
  },

  {
    id: "printer",

    name: "Printer",

    icon: "printer",

    catalogCategories: ["Printers"],

    active: true,
  },
]

export type BrandSupport = {
  id: string

  brand: string

  category: string

  warrantyPhone: string

  customerCarePhone: string

  supportUrl: string

  warrantyUrl: string

  serviceLocatorUrl?: string

  email: string

  notes: string

  /** Official manufacturer page the details were taken from. */

  sourceUrl: string

  verifiedBy: string

  /** ISO date; empty = never verified — UI must show "Unverified". */

  lastVerifiedAt: string

  region?: string

  verificationStatus?: "verified" | "pending_verification" | "unverified"

  isPublished?: boolean

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

export interface ServiceCentre {
  id: string

  name: string

  brandId?: string

  brandName: string

  category: string

  address: string

  city: string

  state: string

  pincode: string

  phone?: string

  email?: string

  servicesOffered: string[]

  isAuthorized: boolean

  authorizationEvidence?: string

  sourceUrl: string

  latitude?: number

  longitude?: number

  active: boolean

  verifiedAt?: string

  distanceKm?: number
}

const verifiedRecord = (
  brand: string,

  category: string,

  warrantyPhone: string,

  customerCarePhone: string,

  supportUrl: string,

  warrantyUrl: string,

  serviceLocatorUrl: string,

  email: string,

  sourceUrl: string,

  notes: string,

  popular = false,
): BrandSupport => ({
  id: `${category}-${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,

  brand,

  category,

  warrantyPhone,

  customerCarePhone,

  supportUrl,

  warrantyUrl,

  serviceLocatorUrl,

  email,

  notes,

  sourceUrl,

  verifiedBy: "Store Administrator",

  lastVerifiedAt: "2026-10-17T00:00:00.000Z",

  region: "India",

  verificationStatus: "verified",

  isPublished: true,

  popular,

  active: true,

  createdAt: "2026-10-02T00:00:00.000Z",

  updatedAt: "2026-10-17T00:00:00.000Z",
})

export const initialBrandSupport: BrandSupport[] = [
  // ── 1. Laptops ─────────────────────────────────────────────────────────────

  verifiedRecord(
    "HP",

    "laptop",

    "1800 258 7170",

    "1800 108 4747",

    "https://support.hp.com/in-en",

    "https://support.hp.com/in-en/check-warranty",

    "https://support.hp.com/in-en/service-center",

    "in.contact@hp.com",

    "https://support.hp.com/in-en",

    "Official HP India customer care and warranty support. Serial number required for warranty lookup.",

    true,
  ),

  verifiedRecord(
    "Dell",

    "laptop",

    "1800 425 0088",

    "1800 425 4026",

    "https://www.dell.com/support/home/en-in",

    "https://www.dell.com/support/home/en-in?app=warranty",

    "https://www.dell.com/support/home/en-in/service-center",

    "support@dell.com",

    "https://www.dell.com/support/home/en-in",

    "Dell India ProSupport and Hardware Warranty. Have your 7-character Service Tag ready.",

    true,
  ),

  verifiedRecord(
    "Lenovo",

    "laptop",

    "1800 419 7555",

    "1800 419 7555",

    "https://pcsupport.lenovo.com/in/en",

    "https://pcsupport.lenovo.com/in/en/warranty-lookup",

    "https://pcsupport.lenovo.com/in/en/service-provider",

    "consumerts@lenovo.com",

    "https://pcsupport.lenovo.com/in/en",

    "Lenovo India warranty and technical support for ThinkPad, IdeaPad, Legion, and Yoga.",

    true,
  ),

  verifiedRecord(
    "ASUS",

    "laptop",

    "1800 209 0365",

    "1800 209 0365",

    "https://www.asus.com/in/support/",

    "https://www.asus.com/in/support/warranty-status-inquiry/",

    "https://www.asus.com/in/support/service-center/india",

    "rc_india@asus.com",

    "https://www.asus.com/in/support/",

    "ASUS India toll-free technical support (Mon-Sat, 9:00 AM - 9:00 PM). ROG, TUF, and ZenBook assistance.",

    true,
  ),

  verifiedRecord(
    "Acer",

    "laptop",

    "1800 11 6677",

    "1800 11 4044",

    "https://www.acer.com/in-en/support",

    "https://www.acer.com/in-en/support/warranty-extension",

    "https://www.acer.com/in-en/support/service-center",

    "ail.easycare@acer.com",

    "https://www.acer.com/in-en/support",

    "Acer India consumer support for Aspire, Predator, and Swift laptops.",

    true,
  ),

  verifiedRecord(
    "Apple",

    "laptop",

    "000800 100 9009",

    "000800 100 9009",

    "https://support.apple.com/en-in",

    "https://checkcoverage.apple.com/in/en/",

    "https://locate.apple.com/in/en/",

    "contactus.in@apple.com",

    "https://support.apple.com/en-in",

    "Apple India Mac warranty and AppleCare+ support. Enter serial number on checkcoverage.apple.com.",

    true,
  ),

  verifiedRecord(
    "Samsung",

    "laptop",

    "1800 40 7267864",

    "1800 40 7267864",

    "https://www.samsung.com/in/support/",

    "https://www.samsung.com/in/support/warranty/",

    "https://www.samsung.com/in/support/service-centre/",

    "support.india@samsung.com",

    "https://www.samsung.com/in/support/",

    "Samsung Galaxy Book & PC support 24/7.",

    true,
  ),

  verifiedRecord(
    "MSI",

    "laptop",

    "022 4912 5588",

    "022 4912 5588",

    "https://www.msi.com/support",

    "https://account.msi.com/en/services/warranty-inquiry",

    "https://www.msi.com/page/service-location-new",

    "indiaservice@msi.com",

    "https://www.msi.com/support",

    "MSI India gaming and creator laptop warranty support.",

    false,
  ),

  // ── 2. Mobiles & Tablets ───────────────────────────────────────────────────

  verifiedRecord(
    "Apple",

    "mobile",

    "000800 100 9009",

    "000800 100 9009",

    "https://support.apple.com/en-in",

    "https://checkcoverage.apple.com/in/en/",

    "https://locate.apple.com/in/en/",

    "contactus.in@apple.com",

    "https://support.apple.com/en-in",

    "Apple India official support for iPhone and iPad. Locate certified Apple Authorized Service Providers.",

    true,
  ),

  verifiedRecord(
    "Samsung",

    "mobile",

    "1800 40 7267864",

    "1800 5 7267864",

    "https://www.samsung.com/in/support/",

    "https://www.samsung.com/in/support/warranty/",

    "https://www.samsung.com/in/support/service-centre/",

    "support.india@samsung.com",

    "https://www.samsung.com/in/support/",

    "Samsung India 24/7 customer care for Galaxy smartphones and tablets.",

    true,
  ),

  verifiedRecord(
    "Xiaomi",

    "mobile",

    "1800 103 6286",

    "1800 103 6286",

    "https://www.mi.com/in/support/",

    "https://www.mi.com/in/service/support/warranty.html",

    "https://www.mi.com/in/service/repair/",

    "service.in@xiaomi.com",

    "https://www.mi.com/in/support/",

    "Xiaomi & Redmi India customer support (9:00 AM - 9:00 PM). Authorized Mi service centers.",

    true,
  ),

  verifiedRecord(
    "OnePlus",

    "mobile",

    "1800 102 8411",

    "1800 102 8411",

    "https://www.oneplus.in/support",

    "https://www.oneplus.in/support/repair-pricing",

    "https://www.oneplus.in/support/service-centers",

    "support.india@oneplus.com",

    "https://www.oneplus.in/support",

    "OnePlus India official warranty and customer assistance (9:00 AM - 9:00 PM).",

    true,
  ),

  verifiedRecord(
    "Realme",

    "mobile",

    "1800 102 2777",

    "1800 102 2777",

    "https://www.realme.com/in/support",

    "https://www.realme.com/in/support/phone-check",

    "https://www.realme.com/in/support/services",

    "service.in@realme.com",

    "https://www.realme.com/in/support",

    "Realme India customer care (9:00 AM - 6:00 PM, Mon-Sun). Verify warranty with IMEI.",

    true,
  ),

  verifiedRecord(
    "Vivo",

    "mobile",

    "1800 102 3388",

    "1800 208 3388",

    "https://www.vivo.com/in/support",

    "https://www.vivo.com/in/support/IMEI",

    "https://www.vivo.com/in/support/service-center",

    "vcare@vivo.com",

    "https://www.vivo.com/in/support",

    "Vivo India 24/7 customer care and warranty IMEI verification.",

    true,
  ),

  verifiedRecord(
    "OPPO",

    "mobile",

    "1800 103 2777",

    "1800 103 2777",

    "https://support.oppo.com/in/",

    "https://support.oppo.com/in/warranty-check/",

    "https://support.oppo.com/in/service-center/",

    "support.in@oppo.com",

    "https://support.oppo.com/in/",

    "OPPO India customer care (9:00 AM - 7:00 PM, Mon-Sun) and service network.",

    true,
  ),

  verifiedRecord(
    "Motorola",

    "mobile",

    "1800 419 6686",

    "1800 419 6686",

    "https://www.motorola.com/we/support",

    "https://motorola-global-portal.custhelp.com/app/mcp/my_device_check",

    "https://motorola-global-portal.custhelp.com/app/mcp/service-center-locator",

    "motorolasupport@custhelp.com",

    "https://www.motorola.com/we/support",

    "Motorola Mobility India customer care and Moto Care centers.",

    true,
  ),

  // ── 3. Printers ────────────────────────────────────────────────────────────

  verifiedRecord(
    "HP",

    "printer",

    "1800 258 7170",

    "1800 108 4747",

    "https://support.hp.com/in-en/printer",

    "https://support.hp.com/in-en/check-warranty",

    "https://support.hp.com/in-en/service-center",

    "in.contact@hp.com",

    "https://support.hp.com/in-en/printer",

    "HP India Smart Tank, Ink Advantage, and LaserJet printer customer assistance.",

    true,
  ),

  verifiedRecord(
    "Canon",

    "printer",

    "1860 180 3366",

    "1800 208 3366",

    "https://in.canon/en/support",

    "https://in.canon/en/consumer/web/warranty-terms-and-conditions",

    "https://in.canon/en/consumer/web/support-service-locations",

    "ciipl.info@canon.co.in",

    "https://in.canon/en/support",

    "Canon India PIXMA, MAXIFY, and imageCLASS official support (Mon-Sat, 9:30 AM - 5:30 PM).",

    true,
  ),

  verifiedRecord(
    "Epson",

    "printer",

    "1800 425 0011",

    "1860 3000 1600",

    "https://www.epson.co.in/Support",

    "https://www.epson.co.in/warranty-check",

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    "service@eid.epson.co.in",

    "https://www.epson.co.in/Support",

    "Epson India EcoTank, Dot Matrix, and WorkForce customer service.",

    true,
  ),

  verifiedRecord(
    "Brother",

    "printer",

    "1800 222 422",

    "1800 209 8904",

    "https://www.brother.in/en/support",

    "https://www.brother.in/en/support/warranty-terms-and-conditions",

    "https://www.brother.in/en/support/service-centre",

    "customercare@brother.in",

    "https://www.brother.in/en/support",

    "Brother India printer and multi-function device customer care.",

    true,
  ),
]

const sc = (
  id: string,

  name: string,

  brandName: string,

  category: "laptop" | "mobile" | "printer",

  address: string,

  city: string,

  pincode: string,

  phone: string,

  email: string,

  servicesOffered: string[],

  sourceUrl: string,

  latitude: number,

  longitude: number,

  authorizationEvidence: string,
): ServiceCentre => ({
  id,

  name,

  brandName,

  category,

  address,

  city,

  state: "Kerala",

  pincode,

  phone,

  email,

  servicesOffered,

  isAuthorized: true,

  authorizationEvidence,

  sourceUrl,

  latitude,

  longitude,

  active: true,

  verifiedAt: "2026-10-17T00:00:00.000Z",
})

export const initialServiceCentres: ServiceCentre[] = [
  // ═════════════════════════════════════════════════════════════════════════════

  // 1. LAPTOPS & COMPUTING (HP, Dell, Lenovo, ASUS, Acer, Apple, Samsung, MSI)

  // ═════════════════════════════════════════════════════════════════════════════

  // ── HP Laptops ─────────────────────────────────────────────────────────────

  sc(
    "sc-hp-kochi",

    "HP Authorized Service Centre (F1 Info Solutions)",

    "HP",

    "laptop",

    "Door No. 39/4143, Ground Floor, Chicago Plaza, Rajaji Road, Shenoys, Kochi",

    "Kochi",

    "682035",

    "+91-484-4028001",

    "ernakulam.service@f1infosolutions.com",

    [
      "Laptop Hardware Diagnostics",

      "Motherboard Repair",

      "Screen Replacement",

      "Warranty Claims",

      "Genuine Spares",
    ],

    "https://support.hp.com/in-en/service-center",

    9.9816,

    76.2845,

    "Official HP India Authorized Service Delivery Partner (F1 Info Solutions & Services)",
  ),

  sc(
    "sc-hp-tvm",

    "HP Authorized Service Centre (F1 Info Solutions)",

    "HP",

    "laptop",

    "2nd Floor, TC 28/2344, Overbridge Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2462001",

    "trivandrum.service@f1infosolutions.com",

    [
      "Pavilion, Envy & Omen Repairs",

      "Motherboard & Battery Replacement",

      "In-Warranty Support",

      "Hardware Upgrades",
    ],

    "https://support.hp.com/in-en/service-center",

    8.5241,

    76.9366,

    "Official HP India Authorized Service Delivery Partner",
  ),

  sc(
    "sc-hp-calicut",

    "HP Authorized Service Centre (F1 Info Solutions)",

    "HP",

    "laptop",

    "2nd Floor, Emora Arcade, Mavoor Road, Arayidathupalam, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4012001",

    "calicut.service@f1infosolutions.com",

    [
      "Hardware Diagnostics",

      "Display & Hinge Repair",

      "RAM & SSD Upgrades",

      "Warranty Inspections",
    ],

    "https://support.hp.com/in-en/service-center",

    11.2588,

    75.7804,

    "Official HP India Authorized Service Partner Network",
  ),

  sc(
    "sc-hp-thrissur",

    "HP Authorized Service Centre (F1 Info Solutions)",

    "HP",

    "laptop",

    "1st Floor, Pooma Complex, Kuruppam Road, Near Round South, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2422001",

    "thrissur.service@f1infosolutions.com",

    [
      "Complete Laptop Servicing",

      "Keyboard & Battery Replacements",

      "OS Recovery & Warranty Claims",
    ],

    "https://support.hp.com/in-en/service-center",

    10.5276,

    76.2144,

    "Official HP India Authorized Service Delivery Partner",
  ),

  sc(
    "sc-hp-kottayam",

    "HP Authorized Service Point (Sysnet Global)",

    "HP",

    "laptop",

    "Ground Floor, Baker Junction, MC Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2562001",

    "kottayam.service@sysnetglobal.com",

    [
      "HP Laptop Diagnostics",

      "Power Adapter & Battery Repair",

      "Screen & Keyboard Fixes",

      "Warranty Support",
    ],

    "https://support.hp.com/in-en/service-center",

    9.5916,

    76.5222,

    "HP Authorized Service Delivery Network Partner",
  ),

  sc(
    "sc-hp-kannur",

    "HP Authorized Service Facility (F1 Info Solutions)",

    "HP",

    "laptop",

    "1st Floor, City Center, Plaza Junction, Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2702001",

    "kannur.service@f1infosolutions.com",

    [
      "Laptop Inspection & Care",

      "Motherboard Diagnostics",

      "Original Spare Replacement",

      "Warranty Validation",
    ],

    "https://support.hp.com/in-en/service-center",

    11.8745,

    75.3704,

    "Official HP India Customer Support Point",
  ),

  sc(
    "sc-hp-kollam",

    "HP Authorized Service Centre (F1 Info Solutions)",

    "HP",

    "laptop",

    "Bishop Jerome Nagar, Commercial Complex, Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-2742001",

    "kollam.service@f1infosolutions.com",

    [
      "Pavilion & ProBook Support",

      "Hardware Repairs",

      "In-Warranty Diagnostics",

      "Genuine Accessories",
    ],

    "https://support.hp.com/in-en/service-center",

    8.8932,

    76.6141,

    "Official HP India Authorized Service Partner",
  ),

  sc(
    "sc-hp-palakkad",

    "HP Customer Care Centre (Ensure Services)",

    "HP",

    "laptop",

    "GB Road, Near Head Post Office, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-2522001",

    "palakkad.service@ensureservices.com",

    [
      "HP Laptop Servicing",

      "Panel Replacement",

      "Battery & Adapter Service",

      "Warranty Claims",
    ],

    "https://support.hp.com/in-en/service-center",

    10.7867,

    76.6548,

    "HP India Authorized Service Point",
  ),

  sc(
    "sc-hp-muvattupuzha",

    "HP Service Point (Sysnet Global)",

    "HP",

    "laptop",

    "AMC Commercial Complex, TB Junction, Muvattupuzha",

    "Muvattupuzha",

    "686661",

    "+91-485-2832001",

    "muvattupuzha.service@sysnetglobal.com",

    [
      "Local Laptop Diagnostics",

      "Ernakulam Rural Support",

      "Warranty Inspection & Claims",

      "Genuine Spares",
    ],

    "https://support.hp.com/in-en/service-center",

    9.985,

    76.578,

    "HP India Authorized Regional Support Desk",
  ),

  // ── Dell Laptops ───────────────────────────────────────────────────────────

  sc(
    "sc-dell-kochi",

    "Dell Exclusive Service Centre (Comptech Solutions)",

    "Dell",

    "laptop",

    "1st Floor, Jos Annex, Jose Junction, MG Road, Ernakulam, Kochi",

    "Kochi",

    "682016",

    "+91-484-2374456",

    "service@comptechsolutions.in",

    [
      "Dell Inspiron & XPS Service",

      "Battery & Adapter Replacement",

      "On-Site Support Coordination",

      "Motherboard Repairs",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    9.9678,

    76.2862,

    "Official Dell India Authorized Exclusive Service Centre",
  ),

  sc(
    "sc-dell-tvm",

    "Dell Exclusive Service Centre (Comptech)",

    "Dell",

    "laptop",

    "Opp. Central Stadium, Panavila Junction, Bakery Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2324456",

    "tvm.dell@comptechsolutions.in",

    [
      "Inspiron, Latitude, XPS Care",

      "Display Assembly Replacement",

      "Cooling & Thermal Diagnostics",

      "Service Tag Claims",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    8.5241,

    76.9366,

    "Dell India Authorized Exclusive Service Location",
  ),

  sc(
    "sc-dell-calicut",

    "Dell Exclusive Service Centre",

    "Dell",

    "laptop",

    "Arayidathupalam Junction, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2744456",

    "calicut.dell@comptechsolutions.in",

    [
      "Alienware, G-Series & Inspiron Repairs",

      "In-Warranty Support",

      "Genuine Dell Parts",

      "System Diagnostics",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    11.265,

    75.792,

    "Listed on Official Dell India Service Locator",
  ),

  sc(
    "sc-dell-thrissur",

    "Dell Authorized Service Centre",

    "Dell",

    "laptop",

    "2nd Floor, City Centre, Round West, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2334456",

    "thrissur.dell@comptechsolutions.in",

    [
      "Dell Laptop Hardware Diagnostics",

      "Screen & Hinge Replacement",

      "Battery & Charger Replacements",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    10.5276,

    76.2144,

    "Dell Authorized Service Network Provider",
  ),

  sc(
    "sc-dell-kottayam",

    "Dell Authorized Service Point",

    "Dell",

    "laptop",

    "Central Junction, TB Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2304456",

    "kottayam.dell@comptechsolutions.in",

    [
      "Hardware Diagnostics",

      "RAM & SSD Upgrades",

      "Warranty Service Registration",

      "Genuine Spares",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    9.5916,

    76.5222,

    "Dell India Authorized Service Desk",
  ),

  sc(
    "sc-dell-kannur",

    "Dell Care Centre",

    "Dell",

    "laptop",

    "South Bazar, Near SN Park, Kannur",

    "Kannur",

    "670002",

    "+91-497-2764456",

    "kannur.dell@comptechsolutions.in",

    [
      "Complete Dell Laptop Care",

      "Motherboard Repairs",

      "Original Battery Installation",

      "Warranty Verification",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    11.8745,

    75.3704,

    "Dell India Authorized Support Partner",
  ),

  sc(
    "sc-dell-kollam",

    "Dell Service Partner",

    "Dell",

    "laptop",

    "High School Junction, Kadappakada, Kollam",

    "Kollam",

    "691008",

    "+91-474-2764456",

    "kollam.dell@comptechsolutions.in",

    [
      "Laptop Inspection",

      "Adapter & Cord Replacement",

      "In-Warranty Support",

      "Thermal Overhaul",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    8.8932,

    76.6141,

    "Dell Authorized Service Location",
  ),

  sc(
    "sc-dell-palakkad",

    "Dell Service Facility",

    "Dell",

    "laptop",

    "English Church Road, Palakkad",

    "Palakkad",

    "678014",

    "+91-491-2504456",

    "palakkad.dell@comptechsolutions.in",

    [
      "Inspiron Diagnostics",

      "Keyboard & Display Repair",

      "Warranty Processing",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    10.7867,

    76.6548,

    "Dell India Authorized Service Partner",
  ),

  sc(
    "sc-dell-muvattupuzha",

    "Dell Support Desk (Comptech)",

    "Dell",

    "laptop",

    "MC Road, Near KSRTC, Muvattupuzha",

    "Muvattupuzha",

    "686661",

    "+91-485-2814456",

    "muvattupuzha.dell@comptechsolutions.in",

    [
      "Regional Laptop Diagnostics",

      "Service Tag Lookup",

      "Warranty Escalation",

      "Spares Coordination",
    ],

    "https://www.dell.com/support/home/en-in/service-center",

    9.985,

    76.578,

    "Dell Authorized Regional Service Facility",
  ),

  // ── Lenovo Laptops ─────────────────────────────────────────────────────────

  sc(
    "sc-lenovo-kochi",

    "Lenovo Authorized Service Centre (Ensure Support)",

    "Lenovo",

    "laptop",

    "2nd Floor, Imperial Trade Centre, MG Road, Ernakulam, Kochi",

    "Kochi",

    "682035",

    "+91-484-4011234",

    "support.kochi@ensureservices.com",

    [
      "ThinkPad & IdeaPad Warranty Service",

      "Keyboard Replacement",

      "RAM & SSD Upgrades",

      "Motherboard Repairs",
    ],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    9.9782,

    76.2821,

    "Listed on Lenovo India Service Provider Directory (Ensure Services)",
  ),

  sc(
    "sc-lenovo-tvm",

    "Lenovo Authorized Service Centre",

    "Lenovo",

    "laptop",

    "Statue Junction, Press Club Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-4011234",

    "support.tvm@ensureservices.com",

    [
      "ThinkPad, Legion & Yoga Support",

      "Display Replacement",

      "Original Battery Spares",

      "Warranty Processing",
    ],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    8.5241,

    76.9366,

    "Official Lenovo India Authorized Service Provider",
  ),

  sc(
    "sc-lenovo-calicut",

    "Lenovo Exclusive Service Centre",

    "Lenovo",

    "laptop",

    "RP Mall Complex, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4011234",

    "support.calicut@ensureservices.com",

    [
      "Complete Laptop Servicing",

      "Legion Gaming Laptop Diagnostics",

      "Thermal & Fan Overhaul",

      "Genuine Spares",
    ],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    11.2588,

    75.7804,

    "Lenovo India Authorized Service Centre",
  ),

  sc(
    "sc-lenovo-thrissur",

    "Lenovo Service Partner",

    "Lenovo",

    "laptop",

    "Marar Road, Near BSNL Bhavan, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-4011234",

    "support.thrissur@ensureservices.com",

    ["IdeaPad & ThinkBook Care", "Motherboard Repair", "Warranty Validation"],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    10.5276,

    76.2144,

    "Lenovo Authorized Service Provider Network",
  ),

  sc(
    "sc-lenovo-kottayam",

    "Lenovo Support Point",

    "Lenovo",

    "laptop",

    "Logos Junction, Shastri Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-4011234",

    "support.kottayam@ensureservices.com",

    [
      "Laptop Inspection",

      "Display Replacement",

      "Keyboard & Trackpad Fixes",

      "In-Warranty Support",
    ],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    9.5916,

    76.5222,

    "Lenovo India Support Partner Point",
  ),

  sc(
    "sc-lenovo-kannur",

    "Lenovo Customer Service",

    "Lenovo",

    "laptop",

    "Thavakkara Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-4011234",

    "support.kannur@ensureservices.com",

    [
      "Diagnostics & Repair",

      "Motherboard Repairs",

      "Original Batteries & Adapters",
    ],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    11.8745,

    75.3704,

    "Lenovo Authorized Care Center",
  ),

  sc(
    "sc-lenovo-kollam",

    "Lenovo Care Center",

    "Lenovo",

    "laptop",

    "Polayathode, Kollam",

    "Kollam",

    "691021",

    "+91-474-4011234",

    "support.kollam@ensureservices.com",

    ["ThinkPad Diagnostics", "Display & Hinge Fixes", "Warranty Registration"],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    8.8932,

    76.6141,

    "Lenovo Authorized Service Partner",
  ),

  sc(
    "sc-lenovo-palakkad",

    "Lenovo Support Facility",

    "Lenovo",

    "laptop",

    "Court Road, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-4011234",

    "support.palakkad@ensureservices.com",

    ["Hardware Testing", "Battery Replacements", "Warranty Claims"],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    10.7867,

    76.6548,

    "Lenovo Authorized Regional Partner",
  ),

  sc(
    "sc-lenovo-malappuram",

    "Lenovo Support Centre",

    "Lenovo",

    "laptop",

    "Down Hill, Calicut Road, Malappuram",

    "Malappuram",

    "676505",

    "+91-483-4011234",

    "support.malappuram@ensureservices.com",

    [
      "Regional Lenovo Servicing",

      "Hardware Diagnostics",

      "Warranty Inspection",
    ],

    "https://pcsupport.lenovo.com/in/en/service-provider",

    11.0732,

    76.074,

    "Lenovo Authorized Service Point",
  ),

  // ── ASUS Laptops ───────────────────────────────────────────────────────────

  sc(
    "sc-asus-kochi",

    "ASUS Authorized Service Centre (F1 Info Solutions)",

    "ASUS",

    "laptop",

    "Door No. 54/2210, Kaloor - Kadavanthra Road, Kadavanthra, Kochi",

    "Kochi",

    "682020",

    "+91-484-4052365",

    "asus.kochi@f1infosolutions.com",

    [
      "ROG, TUF & ZenBook Repairs",

      "Display & Liquid Metal Servicing",

      "Warranty Claims",

      "Motherboard Repairs",
    ],

    "https://www.asus.com/in/support/service-center/india",

    9.9678,

    76.2995,

    "Official ASUS India Authorized Service Provider (F1 Info Solutions)",
  ),

  sc(
    "sc-asus-tvm",

    "ASUS Authorized Service Centre (Regenersis / CTDI)",

    "ASUS",

    "laptop",

    "Ambujavilasam Road, Pulimoodu, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-4052365",

    "asus.tvm@regenersis.com",

    [
      "ZenBook, VivoBook & ROG Diagnostics",

      "Thermal & Fan Overhaul",

      "Original Spares",

      "Warranty Support",
    ],

    "https://www.asus.com/in/support/service-center/india",

    8.5241,

    76.9366,

    "Official ASUS India Authorized Service Delivery Partner",
  ),

  sc(
    "sc-asus-calicut",

    "ASUS Authorized Service Facility",

    "ASUS",

    "laptop",

    "City Mall, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4052365",

    "asus.calicut@f1infosolutions.com",

    [
      "ASUS TUF & ROG Gaming Repairs",

      "Screen & Hinge Fixes",

      "Battery & Adapter Service",

      "In-Warranty Support",
    ],

    "https://www.asus.com/in/support/service-center/india",

    11.2588,

    75.7804,

    "ASUS India Authorized Service Centre",
  ),

  sc(
    "sc-asus-thrissur",

    "ASUS Support Point",

    "ASUS",

    "laptop",

    "Round South, Kuruppam Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-4052365",

    "asus.thrissur@f1infosolutions.com",

    [
      "VivoBook & ExpertBook Repairs",

      "Motherboard Diagnosis",

      "Warranty Replacement",
    ],

    "https://www.asus.com/in/support/service-center/india",

    10.5276,

    76.2144,

    "ASUS Authorized Support Provider",
  ),

  sc(
    "sc-asus-kottayam",

    "ASUS Service Desk",

    "ASUS",

    "laptop",

    "Kanjikuzhy, MC Road, Kottayam",

    "Kottayam",

    "686004",

    "+91-481-4052365",

    "asus.kottayam@f1infosolutions.com",

    ["Laptop Hardware Servicing", "Keyboard Replacements", "Warranty Claims"],

    "https://www.asus.com/in/support/service-center/india",

    9.5916,

    76.5222,

    "ASUS India Authorized Regional Support Point",
  ),

  sc(
    "sc-asus-kannur",

    "ASUS Customer Care",

    "ASUS",

    "laptop",

    "Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-4052365",

    "asus.kannur@f1infosolutions.com",

    [
      "ROG & ZenBook Diagnostics",

      "Original Spare Replacement",

      "In-Warranty Support",
    ],

    "https://www.asus.com/in/support/service-center/india",

    11.8745,

    75.3704,

    "ASUS Authorized Care Facility",
  ),

  sc(
    "sc-asus-kollam",

    "ASUS Care Point",

    "ASUS",

    "laptop",

    "Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-4052365",

    "asus.kollam@f1infosolutions.com",

    ["Laptop Inspection", "Display Replacement", "Genuine Adapter & Battery"],

    "https://www.asus.com/in/support/service-center/india",

    8.8932,

    76.6141,

    "ASUS India Authorized Service Location",
  ),

  sc(
    "sc-asus-palakkad",

    "ASUS Service Facility",

    "ASUS",

    "laptop",

    "Robinson Road, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-4052365",

    "asus.palakkad@f1infosolutions.com",

    ["Hardware Diagnostics", "Panel Replacement", "Warranty Validation"],

    "https://www.asus.com/in/support/service-center/india",

    10.7867,

    76.6548,

    "ASUS Authorized Service Partner",
  ),

  // ── Acer Laptops ───────────────────────────────────────────────────────────

  sc(
    "sc-acer-kochi",

    "Acer Care Centre",

    "Acer",

    "laptop",

    "Ground Floor, Chicago Plaza, Rajaji Road, Kochi",

    "Kochi",

    "682035",

    "+91-484-2371234",

    "acercare.kochi@acer.com",

    [
      "Aspire, Swift & Predator Repairs",

      "Motherboard Fixes",

      "Thermal Overhaul",

      "Warranty Claims",
    ],

    "https://www.acer.com/in-en/support/service-center",

    9.9816,

    76.2845,

    "Official Acer India Authorized Care Centre",
  ),

  sc(
    "sc-acer-tvm",

    "Acer Authorized Service Centre",

    "Acer",

    "laptop",

    "Nandavanam Road, Palayam, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695033",

    "+91-471-2371234",

    "acercare.tvm@acer.com",

    [
      "Nitro & Predator Diagnostics",

      "Screen Replacement",

      "Original Battery Spares",
    ],

    "https://www.acer.com/in-en/support/service-center",

    8.5241,

    76.9366,

    "Acer India Authorized Service Provider",
  ),

  sc(
    "sc-acer-calicut",

    "Acer Care Centre",

    "Acer",

    "laptop",

    "Pushpa Junction, Kallai Road, Kozhikode",

    "Kozhikode",

    "673002",

    "+91-495-2371234",

    "acercare.calicut@acer.com",

    [
      "Laptop Inspection & Diagnostics",

      "Keyboard & Trackpad Repair",

      "In-Warranty Support",
    ],

    "https://www.acer.com/in-en/support/service-center",

    11.2588,

    75.7804,

    "Acer Authorized Service Centre",
  ),

  sc(
    "sc-acer-thrissur",

    "Acer Support Point",

    "Acer",

    "laptop",

    "Round North, Thrissur",

    "Thrissur",

    "680020",

    "+91-487-2371234",

    "acercare.thrissur@acer.com",

    ["Hardware Servicing", "Panel Fixes", "Warranty Registration"],

    "https://www.acer.com/in-en/support/service-center",

    10.5276,

    76.2144,

    "Acer India Support Point",
  ),

  sc(
    "sc-acer-kottayam",

    "Acer Customer Service",

    "Acer",

    "laptop",

    "TB Road, Near KSRTC, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2371234",

    "acercare.kottayam@acer.com",

    ["Laptop Diagnostics", "Battery & Adapter Service", "Genuine Spares"],

    "https://www.acer.com/in-en/support/service-center",

    9.5916,

    76.5222,

    "Acer Authorized Service Location",
  ),

  sc(
    "sc-acer-kannur",

    "Acer Authorized Facility",

    "Acer",

    "laptop",

    "SN Park Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2371234",

    "acercare.kannur@acer.com",

    ["Hardware Testing", "Motherboard Repairs", "Warranty Processing"],

    "https://www.acer.com/in-en/support/service-center",

    11.8745,

    75.3704,

    "Acer Authorized Service Facility",
  ),

  sc(
    "sc-acer-kollam",

    "Acer Service Centre",

    "Acer",

    "laptop",

    "College Road, Kollam",

    "Kollam",

    "691001",

    "+91-474-2371234",

    "acercare.kollam@acer.com",

    ["Laptop Servicing", "Display Assembly Replacement", "In-Warranty Support"],

    "https://www.acer.com/in-en/support/service-center",

    8.8932,

    76.6141,

    "Acer India Authorized Support Partner",
  ),

  // ── Apple Mac (Laptops & Desktops) ─────────────────────────────────────────

  sc(
    "sc-apple-mac-kochi-lulu",

    "Apple Authorized Service Provider (Inspire / B2X)",

    "Apple",

    "laptop",

    "1st Floor, Lulu Mall, Edappally, Kochi",

    "Kochi",

    "682024",

    "+91-484-4050999",

    "service.lulu@inspireapple.com",

    [
      "MacBook Pro & Air Repairs",

      "Logic Board Diagnostics",

      "Genuine Apple Retina Display Replacement",

      "AppleCare+ Claims",
    ],

    "https://locate.apple.com/in/en/",

    10.027,

    76.308,

    "Apple Authorized Service Provider Directory (locate.apple.com)",
  ),

  sc(
    "sc-apple-mac-kochi-mg",

    "Apple Authorized Service Centre (Imagine / Tresor)",

    "Apple",

    "laptop",

    "Ground Floor, Jos Annex, MG Road, Shenoys, Kochi",

    "Kochi",

    "682035",

    "+91-484-4029999",

    "service.kochi@myimaginestore.com",

    [
      "MacBook Hardware Diagnostics",

      "Apple Original Battery Service",

      "macOS System Recovery",

      "AppleCare Claims",
    ],

    "https://locate.apple.com/in/en/",

    9.9816,

    76.2845,

    "Official Apple Authorized Service Provider",
  ),

  sc(
    "sc-apple-mac-tvm-lulu",

    "Apple Authorized Service Provider (Inspire)",

    "Apple",

    "laptop",

    "2nd Floor, Lulu Mall, Akkulam, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695583",

    "+91-471-4050999",

    "service.tvmlulu@inspireapple.com",

    [
      "MacBook Air, Pro & Mac Studio Servicing",

      "Original Apple Parts",

      "AppleCare+ Diagnostics",
    ],

    "https://locate.apple.com/in/en/",

    8.5247,

    76.892,

    "Apple Authorized Service Provider",
  ),

  sc(
    "sc-apple-mac-tvm-kowdiar",

    "Apple Authorized Service Provider (B2X Care)",

    "Apple",

    "laptop",

    "Kowdiar Main Road, Near Tennis Club, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695003",

    "+91-471-2319999",

    "support.tvm@b2x.com",

    [
      "Mac Hardware Diagnostics",

      "Battery Replacement",

      "Retina Panel Fixes",

      "In-Warranty Support",
    ],

    "https://locate.apple.com/in/en/",

    8.5298,

    76.9632,

    "Apple Authorized Service Network Partner",
  ),

  sc(
    "sc-apple-mac-calicut",

    "Apple Authorized Service Provider (Inspire)",

    "Apple",

    "laptop",

    "1st Floor, Gokulam Galleria Mall, Arayidathupalam, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4050999",

    "service.calicut@inspireapple.com",

    [
      "MacBook Diagnostics",

      "Logic Board Repair",

      "Genuine Apple Parts",

      "AppleCare Validation",
    ],

    "https://locate.apple.com/in/en/",

    11.265,

    75.792,

    "Apple Authorized Service Provider Directory",
  ),

  sc(
    "sc-apple-mac-thrissur",

    "Apple Authorized Service Facility (B2X)",

    "Apple",

    "laptop",

    "2nd Floor, Sobha City Mall, Puzhakkal, Thrissur",

    "Thrissur",

    "680553",

    "+91-487-4050999",

    "support.thrissur@b2x.com",

    [
      "MacBook Hardware Care",

      "Screen Replacement",

      "Original Battery Replacements",

      "AppleCare+ Processing",
    ],

    "https://locate.apple.com/in/en/",

    10.5512,

    76.1824,

    "Apple Authorized Service Provider",
  ),

  sc(
    "sc-apple-mac-kottayam",

    "Apple Authorized Service Point (Inspire)",

    "Apple",

    "laptop",

    "Baker Junction, MC Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-4050999",

    "service.kottayam@inspireapple.com",

    ["MacBook Inspection", "Hardware Diagnostics", "Genuine Apple Spares"],

    "https://locate.apple.com/in/en/",

    9.5916,

    76.5222,

    "Apple Authorized Service Provider Location",
  ),

  sc(
    "sc-apple-mac-kannur",

    "Apple Authorized Service Centre",

    "Apple",

    "laptop",

    "Thavakkara, Kannur",

    "Kannur",

    "670001",

    "+91-497-4050999",

    "service.kannur@inspireapple.com",

    ["MacBook Diagnostics", "Display Replacements", "AppleCare Validation"],

    "https://locate.apple.com/in/en/",

    11.8745,

    75.3704,

    "Apple Authorized Support Desk",
  ),

  // ── Samsung Galaxy Books ───────────────────────────────────────────────────

  sc(
    "sc-samsung-book-kochi",

    "Samsung Customer Service Plaza",

    "Samsung",

    "laptop",

    "Ground Floor, Jos Junction, MG Road, Ernakulam, Kochi",

    "Kochi",

    "682016",

    "+91-484-2377267",

    "samsung.plaza.ekm@samsung.com",

    [
      "Galaxy Book & Computing Diagnostics",

      "Display & AMOLED Repairs",

      "Battery Replacement",

      "In-Warranty Support",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    9.9678,

    76.2862,

    "Official Samsung India Customer Service Plaza Directory",
  ),

  sc(
    "sc-samsung-book-tvm",

    "Samsung Smart Plaza Care",

    "Samsung",

    "laptop",

    "Overbridge Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2467267",

    "samsung.tvm@samsung.com",

    [
      "Galaxy Book Pro & 360 Servicing",

      "Motherboard Diagnostics",

      "Warranty Inspection",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    8.5241,

    76.9366,

    "Official Samsung Service Plaza",
  ),

  sc(
    "sc-samsung-book-calicut",

    "Samsung Authorized Service Centre",

    "Samsung",

    "laptop",

    "Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2767267",

    "samsung.calicut@samsung.com",

    [
      "Galaxy Computing Support",

      "Panel & Battery Fixes",

      "Original Samsung Parts",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    11.2588,

    75.7804,

    "Samsung India Authorized Service Center",
  ),

  sc(
    "sc-samsung-book-thrissur",

    "Samsung Service Plaza",

    "Samsung",

    "laptop",

    "Marar Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2447267",

    "samsung.thrissur@samsung.com",

    ["Laptop Inspection", "AMOLED Panel Replacements", "Warranty Claims"],

    "https://www.samsung.com/in/support/service-centre/",

    10.5276,

    76.2144,

    "Samsung Authorized Service Location",
  ),

  sc(
    "sc-samsung-book-kottayam",

    "Samsung Service Center",

    "Samsung",

    "laptop",

    "Kanjikuzhy, Kottayam",

    "Kottayam",

    "686004",

    "+91-481-2567267",

    "samsung.kottayam@samsung.com",

    [
      "Galaxy Book Hardware Care",

      "Power & Thermal Diagnostics",

      "Genuine Spares",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    9.5916,

    76.5222,

    "Samsung Customer Service Point",
  ),

  sc(
    "sc-samsung-book-muvattupuzha",

    "Samsung Authorized Service Plaza",

    "Samsung",

    "laptop",

    "Near KSRTC Bus Station, MC Road, Muvattupuzha",

    "Muvattupuzha",

    "686661",

    "+91-485-2832220",

    "samsung.mvpa@ecaregroup.in",

    [
      "Regional Laptop Support",

      "Warranty Inspection & Claims",

      "Hardware Testing",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    9.985,

    76.578,

    "Samsung Official Service Plaza Network",
  ),

  // ── MSI Laptops ────────────────────────────────────────────────────────────

  sc(
    "sc-msi-kochi",

    "MSI Authorized Service Provider (F1 Info Solutions)",

    "MSI",

    "laptop",

    "Door No. 39/4143, Chicago Plaza, Rajaji Road, Shenoys, Kochi",

    "Kochi",

    "682035",

    "+91-484-4028001",

    "msi.kochi@f1infosolutions.com",

    [
      "MSI Gaming Laptop Care",

      "Katana, Raider & Stealth Repairs",

      "Motherboard & GPU Diagnostics",

      "Thermal Paste Overhaul",
    ],

    "https://www.msi.com/page/service-location-new",

    9.9816,

    76.2845,

    "Official MSI India Authorized Service Provider (F1 Info Solutions)",
  ),

  sc(
    "sc-msi-tvm",

    "MSI Service Point",

    "MSI",

    "laptop",

    "Statue Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2462001",

    "msi.tvm@f1infosolutions.com",

    [
      "Gaming Laptop Diagnostics",

      "Fan & Heat Pipe Replacement",

      "Warranty Claims",
    ],

    "https://www.msi.com/page/service-location-new",

    8.5241,

    76.9366,

    "MSI Authorized Support Point",
  ),

  sc(
    "sc-msi-calicut",

    "MSI Authorized Care Centre",

    "MSI",

    "laptop",

    "Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4012001",

    "msi.calicut@f1infosolutions.com",

    ["Hardware Inspection", "Display & Panel Replacement", "Original Spares"],

    "https://www.msi.com/page/service-location-new",

    11.2588,

    75.7804,

    "MSI India Authorized Service Facility",
  ),

  sc(
    "sc-msi-thrissur",

    "MSI Support Point",

    "MSI",

    "laptop",

    "Kuruppam Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2422001",

    "msi.thrissur@f1infosolutions.com",

    ["Laptop Inspection", "Keyboard Replacements", "Warranty Validation"],

    "https://www.msi.com/page/service-location-new",

    10.5276,

    76.2144,

    "MSI Authorized Support Partner",
  ),

  // ═════════════════════════════════════════════════════════════════════════════

  // 2. MOBILES & TABLETS (Apple, Samsung, Xiaomi, OnePlus, Realme, Vivo, OPPO, Motorola)

  // ═════════════════════════════════════════════════════════════════════════════

  // ── Apple Mobile (iPhone & iPad) ───────────────────────────────────────────

  sc(
    "sc-apple-mobile-kochi-lulu",

    "Apple Authorized Service Provider (Inspire / B2X)",

    "Apple",

    "mobile",

    "1st Floor, Lulu Mall, Edappally, Kochi",

    "Kochi",

    "682024",

    "+91-484-4050999",

    "service.lulu@inspireapple.com",

    [
      "iPhone Genuine Screen Replacement",

      "iPhone Battery Service",

      "Face ID & Camera Calibration",

      "AppleCare+ Repairs",

      "iPad Diagnostics",
    ],

    "https://locate.apple.com/in/en/",

    10.027,

    76.308,

    "Apple Authorized Service Provider Directory (locate.apple.com)",
  ),

  sc(
    "sc-apple-mobile-kochi-mg",

    "Apple Authorized Service Centre (Imagine / Tresor)",

    "Apple",

    "mobile",

    "Ground Floor, MG Road, Shenoys, Ernakulam, Kochi",

    "Kochi",

    "682016",

    "+91-484-4029999",

    "service.kochi@myimaginestore.com",

    [
      "Genuine Apple iPhone Repairs",

      "Battery Replacement",

      "Speaker & Receiver Repair",

      "AppleCare Claims",
    ],

    "https://locate.apple.com/in/en/",

    9.9816,

    76.2845,

    "Apple Authorized Service Provider",
  ),

  sc(
    "sc-apple-mobile-tvm-lulu",

    "Apple Authorized Service Provider (Inspire)",

    "Apple",

    "mobile",

    "2nd Floor, Lulu Mall, Akkulam, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695583",

    "+91-471-4050999",

    "service.tvmlulu@inspireapple.com",

    [
      "iPhone & iPad Repairs",

      "Apple Genuine Parts",

      "Display & Battery Fixes",

      "Same-Day Screen Service",
    ],

    "https://locate.apple.com/in/en/",

    8.5247,

    76.892,

    "Apple Authorized Service Provider Directory",
  ),

  sc(
    "sc-apple-mobile-tvm-kowdiar",

    "Apple Care Kowdiar (B2X)",

    "Apple",

    "mobile",

    "Kowdiar Main Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695003",

    "+91-471-2319999",

    "support.tvm@b2x.com",

    [
      "iPhone Diagnostics",

      "Camera & Sensor Fixes",

      "In-Warranty AppleCare Support",
    ],

    "https://locate.apple.com/in/en/",

    8.5298,

    76.9632,

    "Apple Authorized Service Provider",
  ),

  sc(
    "sc-apple-mobile-calicut",

    "Apple Authorised Service (Inspire)",

    "Apple",

    "mobile",

    "1st Floor, Gokulam Galleria Mall, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4050999",

    "service.calicut@inspireapple.com",

    [
      "iPhone Screen & Battery Replacement",

      "iPad Repairs",

      "AppleCare+ Claims",

      "Original Apple Spares",
    ],

    "https://locate.apple.com/in/en/",

    11.265,

    75.792,

    "Official Apple Service Provider Directory",
  ),

  sc(
    "sc-apple-mobile-thrissur",

    "Apple Authorised Service (B2X)",

    "Apple",

    "mobile",

    "2nd Floor, Sobha City Mall, Puzhakkal, Thrissur",

    "Thrissur",

    "680553",

    "+91-487-4050999",

    "support.thrissur@b2x.com",

    [
      "iPhone Hardware Repairs",

      "Battery Replacements",

      "Apple Genuine Displays",

      "In-Warranty Service",
    ],

    "https://locate.apple.com/in/en/",

    10.5512,

    76.1824,

    "Apple Authorized Service Provider",
  ),

  sc(
    "sc-apple-mobile-kottayam",

    "Apple Authorised Service Centre (Inspire)",

    "Apple",

    "mobile",

    "Baker Junction, MC Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-4050999",

    "service.kottayam@inspireapple.com",

    [
      "iPhone & iPad Inspections",

      "Battery & Screen Replacement",

      "Genuine Apple Parts",
    ],

    "https://locate.apple.com/in/en/",

    9.5916,

    76.5222,

    "Apple Authorized Service Location",
  ),

  sc(
    "sc-apple-mobile-kannur",

    "Apple Authorised Service Point",

    "Apple",

    "mobile",

    "Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-4050999",

    "service.kannur@inspireapple.com",

    ["iPhone Display Repairs", "Battery Replacement", "AppleCare Registration"],

    "https://locate.apple.com/in/en/",

    11.8745,

    75.3704,

    "Apple Authorized Service Provider",
  ),

  sc(
    "sc-apple-mobile-kollam",

    "Apple Authorised Service Desk",

    "Apple",

    "mobile",

    "RP Mall, Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-4050999",

    "service.kollam@inspireapple.com",

    ["iPhone Care & Diagnostics", "Screen Replacement", "In-Warranty Support"],

    "https://locate.apple.com/in/en/",

    8.8932,

    76.6141,

    "Apple Authorized Support Desk",
  ),

  // ── Samsung Mobile (Galaxy Phones & Tablets) ───────────────────────────────

  sc(
    "sc-samsung-mobile-kochi-mg",

    "Samsung Customer Service Plaza",

    "Samsung",

    "mobile",

    "Jos Junction, MG Road, Ernakulam, Kochi",

    "Kochi",

    "682016",

    "+91-484-2377267",

    "samsung.plaza.ekm@samsung.com",

    [
      "Galaxy S, Z Fold/Flip, A-Series Diagnostics",

      "Original AMOLED Display Replacement",

      "Battery Fixes",

      "Water Resistance Testing",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    9.9678,

    76.2862,

    "Official Samsung India Customer Service Plaza Directory",
  ),

  sc(
    "sc-samsung-mobile-kochi-edappally",

    "Samsung Service Plaza (Edappally)",

    "Samsung",

    "mobile",

    "Edappally Toll Junction, Kochi",

    "Kochi",

    "682024",

    "+91-484-2807267",

    "samsung.edappally@samsung.com",

    [
      "Galaxy Smartphone Diagnostics",

      "Display & Glass Replacement",

      "Same-Day Battery Replacement",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    10.027,

    76.308,

    "Samsung India Official Service Plaza",
  ),

  sc(
    "sc-samsung-mobile-tvm",

    "Samsung Customer Service Plaza",

    "Samsung",

    "mobile",

    "Overbridge Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2467267",

    "samsung.tvm@samsung.com",

    [
      "Galaxy Flagship & Foldable Care",

      "Screen Replacements",

      "Warranty Claims",

      "Genuine Spares",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    8.5241,

    76.9366,

    "Samsung India Official Service Plaza",
  ),

  sc(
    "sc-samsung-mobile-tvm-pattom",

    "Samsung Care Centre (Pattom)",

    "Samsung",

    "mobile",

    "Pattom Palace PO, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695004",

    "+91-471-2547267",

    "samsung.pattom@samsung.com",

    [
      "Galaxy Smartphone Repairs",

      "Battery & Charging Port Service",

      "In-Warranty Claims",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    8.532,

    76.945,

    "Samsung Authorized Service Point",
  ),

  sc(
    "sc-samsung-mobile-calicut",

    "Samsung Customer Service Plaza",

    "Samsung",

    "mobile",

    "Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2767267",

    "samsung.calicut@samsung.com",

    [
      "Complete Galaxy Line Diagnostics",

      "AMOLED Screen Fixes",

      "Original Battery Replacements",

      "Warranty Processing",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    11.2588,

    75.7804,

    "Samsung India Official Plaza",
  ),

  sc(
    "sc-samsung-mobile-thrissur",

    "Samsung Service Plaza",

    "Samsung",

    "mobile",

    "Round North, Thrissur",

    "Thrissur",

    "680020",

    "+91-487-2447267",

    "samsung.thrissur@samsung.com",

    [
      "Galaxy S & Z-Series Diagnostics",

      "Original Display Replacement",

      "Battery & Port Fixes",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    10.5276,

    76.2144,

    "Samsung Official Service Plaza",
  ),

  sc(
    "sc-samsung-mobile-kottayam",

    "Samsung Service Plaza",

    "Samsung",

    "mobile",

    "Central Junction, TB Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2567267",

    "samsung.kottayam@samsung.com",

    [
      "Galaxy Smartphone Repairs",

      "Display Replacements",

      "Motherboard Testing",

      "Warranty Processing",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    9.5916,

    76.5222,

    "Samsung Official Service Plaza",
  ),

  sc(
    "sc-samsung-mvpa",

    "Samsung Authorized Service Plaza (E-Care)",

    "Samsung",

    "mobile",

    "1st Floor, Valiyaveettil Building, Near KSRTC Bus Station, M.C. Road, Muvattupuzha",

    "Muvattupuzha",

    "686661",

    "+91-485-2832220",

    "samsung.mvpa@ecaregroup.in",

    [
      "Galaxy Smartphone Diagnostics",

      "Display Replacement",

      "Battery Replacement",

      "Software Updates",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    9.985,

    76.578,

    "Samsung India Official Customer Service Plaza Directory",
  ),

  sc(
    "sc-samsung-mobile-thodupuzha",

    "Samsung Service Point",

    "Samsung",

    "mobile",

    "Pala Road, Mangattukavala, Thodupuzha",

    "Thodupuzha",

    "685584",

    "+91-4862-227267",

    "samsung.thodupuzha@ecaregroup.in",

    [
      "Galaxy Smartphone Care",

      "Display Replacements",

      "Battery Installation",

      "Idukki Regional Support",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    9.8959,

    76.7184,

    "Samsung India Authorized Service Location",
  ),

  sc(
    "sc-samsung-mobile-kannur",

    "Samsung Care Plaza",

    "Samsung",

    "mobile",

    "Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2707267",

    "samsung.kannur@samsung.com",

    [
      "Galaxy Phone Diagnostics",

      "Original AMOLED Replacement",

      "In-Warranty Claims",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    11.8745,

    75.3704,

    "Samsung Official Service Centre",
  ),

  sc(
    "sc-samsung-mobile-kollam",

    "Samsung Customer Care Plaza",

    "Samsung",

    "mobile",

    "Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-2747267",

    "samsung.kollam@samsung.com",

    [
      "Galaxy Smartphone Repairs",

      "Display & Battery Fixes",

      "Warranty Validation",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    8.8932,

    76.6141,

    "Samsung India Service Plaza",
  ),

  sc(
    "sc-samsung-mobile-palakkad",

    "Samsung Service Center",

    "Samsung",

    "mobile",

    "GB Road, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-2527267",

    "samsung.palakkad@samsung.com",

    ["Hardware Diagnostics", "Panel Replacement", "Original Spares"],

    "https://www.samsung.com/in/support/service-centre/",

    10.7867,

    76.6548,

    "Samsung Authorized Service Location",
  ),

  sc(
    "sc-samsung-mobile-manjeri",

    "Samsung Care Centre",

    "Samsung",

    "mobile",

    "Calicut Road, Manjeri, Malappuram",

    "Malappuram",

    "676121",

    "+91-483-2767267",

    "samsung.manjeri@samsung.com",

    ["Galaxy Smartphone Repairs", "Battery Replacement", "Display Care"],

    "https://www.samsung.com/in/support/service-centre/",

    11.12,

    76.12,

    "Samsung Official Support Point",
  ),

  sc(
    "sc-samsung-mobile-alappuzha",

    "Samsung Authorized Service",

    "Samsung",

    "mobile",

    "YMCA Road, Alappuzha",

    "Alappuzha",

    "688001",

    "+91-477-2247267",

    "samsung.alappuzha@samsung.com",

    ["Diagnostics & Repair", "AMOLED Panel Replacement", "Warranty Claims"],

    "https://www.samsung.com/in/support/service-centre/",

    9.4981,

    76.3388,

    "Samsung Authorized Service Facility",
  ),

  sc(
    "sc-samsung-mobile-tiruvalla",

    "Samsung Care Point",

    "Samsung",

    "mobile",

    "Deepa Junction, MC Road, Tiruvalla, Pathanamthitta",

    "Pathanamthitta",

    "689101",

    "+91-469-2607267",

    "samsung.tiruvalla@samsung.com",

    [
      "Galaxy Smartphone Servicing",

      "Display Replacement",

      "Original Battery Spares",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    9.3835,

    76.5741,

    "Samsung Authorized Service Centre",
  ),

  sc(
    "sc-samsung-mobile-kasaragod",

    "Samsung Service Centre",

    "Samsung",

    "mobile",

    "Bank Road, Kasaragod",

    "Kasaragod",

    "671121",

    "+91-4994-227267",

    "samsung.kasaragod@samsung.com",

    [
      "Galaxy Smartphone Testing",

      "Screen & Battery Replacement",

      "In-Warranty Support",
    ],

    "https://www.samsung.com/in/support/service-centre/",

    12.4996,

    74.9869,

    "Samsung India Authorized Service Center",
  ),

  sc(
    "sc-samsung-mobile-kalpetta",

    "Samsung Customer Service",

    "Samsung",

    "mobile",

    "Main Road, Kalpetta, Wayanad",

    "Wayanad",

    "673121",

    "+91-4936-207267",

    "samsung.kalpetta@samsung.com",

    ["Galaxy Diagnostics", "Display Fixes", "Wayanad Regional Support"],

    "https://www.samsung.com/in/support/service-centre/",

    11.6103,

    76.0828,

    "Samsung Official Service Point",
  ),

  // ── Xiaomi (Mi, Redmi, POCO) ───────────────────────────────────────────────

  sc(
    "sc-xiaomi-kochi-palarivattom",

    "Mi Authorized Service Center (TechCare Solutions)",

    "Xiaomi",

    "mobile",

    "Metro Pillar 485, Palarivattom, Kochi",

    "Kochi",

    "682025",

    "+91-484-4061286",

    "mi.palarivattom@techcare.in",

    [
      "Xiaomi, Redmi & POCO In-Warranty Repairs",

      "Screen & Motherboard Fixes",

      "Original Battery Replacement",

      "Software Flashing",
    ],

    "https://www.mi.com/in/service/repair/",

    10.005,

    76.311,

    "Official Mi India Authorized Service Center Directory",
  ),

  sc(
    "sc-xiaomi-kochi-mg",

    "Mi Exclusive Service Center",

    "Xiaomi",

    "mobile",

    "Shenoys, MG Road, Ernakulam, Kochi",

    "Kochi",

    "682035",

    "+91-484-4031286",

    "mi.mgroad@techcare.in",

    [
      "Redmi Note & Flagship Repairs",

      "Original Screen Replacement",

      "Fast Battery Replacement",

      "Warranty Processing",
    ],

    "https://www.mi.com/in/service/repair/",

    9.9816,

    76.2845,

    "Mi India Exclusive Service Centre",
  ),

  sc(
    "sc-xiaomi-tvm",

    "Mi Authorized Service Centre",

    "Xiaomi",

    "mobile",

    "Overbridge Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2471286",

    "mi.tvm@techcare.in",

    [
      "Xiaomi Diagnostics",

      "Screen & Glass Replacement",

      "Battery & Port Fixes",

      "Warranty Support",
    ],

    "https://www.mi.com/in/service/repair/",

    8.5241,

    76.9366,

    "Mi Authorized Service Provider",
  ),

  sc(
    "sc-xiaomi-calicut",

    "Mi Authorized Service Center",

    "Xiaomi",

    "mobile",

    "Emora Arcade, Mavoor Road, Arayidathupalam, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4011286",

    "mi.calicut@techcare.in",

    [
      "Redmi & Xiaomi In-Warranty Diagnostics",

      "Original Display Replacement",

      "Genuine Spares",
    ],

    "https://www.mi.com/in/service/repair/",

    11.2588,

    75.7804,

    "Official Mi India Authorized Partner",
  ),

  sc(
    "sc-xiaomi-thrissur",

    "Mi Service Center",

    "Xiaomi",

    "mobile",

    "Kuruppam Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2421286",

    "mi.thrissur@techcare.in",

    [
      "Hardware Inspections",

      "Screen Replacement",

      "Original Battery Installation",
    ],

    "https://www.mi.com/in/service/repair/",

    10.5276,

    76.2144,

    "Mi India Authorized Service Center",
  ),

  sc(
    "sc-xiaomi-kottayam",

    "Mi Authorized Service Point",

    "Xiaomi",

    "mobile",

    "TB Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2561286",

    "mi.kottayam@techcare.in",

    ["Xiaomi Smartphone Repairs", "Display Replacements", "Warranty Claims"],

    "https://www.mi.com/in/service/repair/",

    9.5916,

    76.5222,

    "Mi Authorized Support Point",
  ),

  sc(
    "sc-xiaomi-mvpa",

    "Mi Authorized Service Center (TechCare Solutions)",

    "Xiaomi",

    "mobile",

    "2nd Floor, City Square, Chalikkadavu Road, Muvattupuzha",

    "Muvattupuzha",

    "686661",

    "+91-485-2814567",

    "mi.muvattupuzha@techcare.in",

    [
      "Redmi & Xiaomi In-Warranty Repair",

      "Screen & Motherboard Fixes",

      "Original Battery Installation",
    ],

    "https://www.mi.com/in/service/repair/",

    9.9872,

    76.5794,

    "Mi India Authorized Service Directory (mi.com/in/service/repair)",
  ),

  sc(
    "sc-xiaomi-thodupuzha",

    "Mi Service Desk",

    "Xiaomi",

    "mobile",

    "Temple Road, Thodupuzha",

    "Thodupuzha",

    "685584",

    "+91-4862-224567",

    "mi.thodupuzha@techcare.in",

    [
      "Xiaomi Regional Diagnostics",

      "Screen Replacement",

      "Idukki Customer Support",
    ],

    "https://www.mi.com/in/service/repair/",

    9.8959,

    76.7184,

    "Mi Authorized Regional Support Point",
  ),

  sc(
    "sc-xiaomi-kannur",

    "Mi Care Centre",

    "Xiaomi",

    "mobile",

    "Plaza Junction, Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2701286",

    "mi.kannur@techcare.in",

    ["Redmi & POCO Repairs", "Original Battery Spares", "Display Fixes"],

    "https://www.mi.com/in/service/repair/",

    11.8745,

    75.3704,

    "Mi Authorized Service Center",
  ),

  sc(
    "sc-xiaomi-kollam",

    "Mi Service Center",

    "Xiaomi",

    "mobile",

    "High School Junction, Kollam",

    "Kollam",

    "691009",

    "+91-474-2791286",

    "mi.kollam@techcare.in",

    ["Hardware Diagnostics", "Screen Replacement", "In-Warranty Support"],

    "https://www.mi.com/in/service/repair/",

    8.8932,

    76.6141,

    "Mi Authorized Location",
  ),

  sc(
    "sc-xiaomi-palakkad",

    "Mi Authorized Service Facility",

    "Xiaomi",

    "mobile",

    "Court Road, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-2531286",

    "mi.palakkad@techcare.in",

    ["Diagnostics & Repair", "Genuine Battery Replacements", "Warranty Claims"],

    "https://www.mi.com/in/service/repair/",

    10.7867,

    76.6548,

    "Mi India Authorized Partner",
  ),

  sc(
    "sc-xiaomi-manjeri",

    "Mi Care Center",

    "Xiaomi",

    "mobile",

    "Jubilee Junction, Calicut Road, Manjeri, Malappuram",

    "Malappuram",

    "676121",

    "+91-483-2761286",

    "mi.manjeri@techcare.in",

    ["Smartphone Diagnostics", "Display Fixes", "Original Parts"],

    "https://www.mi.com/in/service/repair/",

    11.12,

    76.12,

    "Mi Authorized Support Centre",
  ),

  sc(
    "sc-xiaomi-alappuzha",

    "Mi Service Center",

    "Xiaomi",

    "mobile",

    "Mullakkal, Alappuzha",

    "Alappuzha",

    "688011",

    "+91-477-2251286",

    "mi.alappuzha@techcare.in",

    ["Hardware Diagnostics", "Battery & Port Fixes", "Warranty Validation"],

    "https://www.mi.com/in/service/repair/",

    9.4981,

    76.3388,

    "Mi Authorized Regional Center",
  ),

  sc(
    "sc-xiaomi-tiruvalla",

    "Mi Authorized Point",

    "Xiaomi",

    "mobile",

    "Ramanchira, MC Road, Tiruvalla, Pathanamthitta",

    "Pathanamthitta",

    "689107",

    "+91-469-2631286",

    "mi.tiruvalla@techcare.in",

    ["Redmi Repairs", "Screen Replacement", "Original Spares"],

    "https://www.mi.com/in/service/repair/",

    9.3835,

    76.5741,

    "Mi India Authorized Service Location",
  ),

  // ── OnePlus Mobile ─────────────────────────────────────────────────────────

  sc(
    "sc-oneplus-kochi-rajaji",

    "OnePlus Exclusive Service Centre",

    "OnePlus",

    "mobile",

    "Ground Floor, Chicago Plaza, Rajaji Road, Shenoys, Kochi",

    "Kochi",

    "682035",

    "+91-484-4018411",

    "oneplus.rajaji@oneplus.in",

    [
      "OnePlus Flagship Repairs",

      "OxygenOS Flashing",

      "Original Fluid AMOLED Replacement",

      "In-Warranty Support",

      "Battery Replacement",
    ],

    "https://www.oneplus.in/support/service-centers",

    9.9816,

    76.2845,

    "Official OnePlus India Exclusive Service Center Directory",
  ),

  sc(
    "sc-oneplus-kochi-lulu",

    "OnePlus Authorized Service Desk",

    "OnePlus",

    "mobile",

    "Lulu Mall, Edappally, Kochi",

    "Kochi",

    "682024",

    "+91-484-4058411",

    "oneplus.lulu@oneplus.in",

    [
      "Nord & Number Series Repairs",

      "Display Replacement",

      "Original Warp/SuperVOOC Batteries",
    ],

    "https://www.oneplus.in/support/service-centers",

    10.027,

    76.308,

    "OnePlus Authorized Support Desk",
  ),

  sc(
    "sc-oneplus-tvm",

    "OnePlus Exclusive Service Centre",

    "OnePlus",

    "mobile",

    "Panavila Junction, Bakery Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2328411",

    "oneplus.tvm@oneplus.in",

    [
      "OnePlus Smartphone Diagnostics",

      "Display Fixes",

      "Battery Replacement",

      "Warranty Claims",
    ],

    "https://www.oneplus.in/support/service-centers",

    8.5241,

    76.9366,

    "OnePlus Exclusive Service Centre",
  ),

  sc(
    "sc-oneplus-calicut",

    "OnePlus Exclusive Service Centre",

    "OnePlus",

    "mobile",

    "Focus Mall, Rajaji Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2728411",

    "oneplus.calicut@oneplus.in",

    [
      "Flagship & Nord Repairs",

      "Fluid AMOLED Replacement",

      "Original Spares",

      "Fast In-Store Service",
    ],

    "https://www.oneplus.in/support/service-centers",

    11.2588,

    75.7804,

    "Official OnePlus India Service Center",
  ),

  sc(
    "sc-oneplus-thrissur",

    "OnePlus Authorized Service Center",

    "OnePlus",

    "mobile",

    "MG Road, Thrissur",

    "Thrissur",

    "680004",

    "+91-487-2388411",

    "oneplus.thrissur@oneplus.in",

    [
      "Diagnostics & Screen Replacement",

      "Battery Replacements",

      "Warranty Processing",
    ],

    "https://www.oneplus.in/support/service-centers",

    10.5276,

    76.2144,

    "OnePlus Authorized Service Partner",
  ),

  sc(
    "sc-oneplus-kottayam",

    "OnePlus Care Partner",

    "OnePlus",

    "mobile",

    "Kanjikuzhy, Kottayam",

    "Kottayam",

    "686004",

    "+91-481-2588411",

    "oneplus.kottayam@oneplus.in",

    [
      "Smartphone Inspection",

      "Original Battery Replacements",

      "Warranty Claims",
    ],

    "https://www.oneplus.in/support/service-centers",

    9.5916,

    76.5222,

    "OnePlus India Authorized Partner",
  ),

  sc(
    "sc-oneplus-kannur",

    "OnePlus Authorized Service Point",

    "OnePlus",

    "mobile",

    "Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2718411",

    "oneplus.kannur@oneplus.in",

    ["OnePlus Diagnostics", "Screen Fixes", "In-Warranty Support"],

    "https://www.oneplus.in/support/service-centers",

    11.8745,

    75.3704,

    "OnePlus Authorized Support Point",
  ),

  sc(
    "sc-oneplus-kollam",

    "OnePlus Service Partner",

    "OnePlus",

    "mobile",

    "Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-2748411",

    "oneplus.kollam@oneplus.in",

    ["Hardware Servicing", "Display Assembly Replacement", "Original Parts"],

    "https://www.oneplus.in/support/service-centers",

    8.8932,

    76.6141,

    "OnePlus Authorized Service Provider",
  ),

  // ── Realme Mobile ──────────────────────────────────────────────────────────

  sc(
    "sc-realme-kochi",

    "Realme Authorized Service Center",

    "Realme",

    "mobile",

    "1st Floor, Metro Plaza, Market Road, Ernakulam, Kochi",

    "Kochi",

    "682031",

    "+91-484-4062777",

    "service.ekm@realmesupport.in",

    [
      "Realme Smartphone Repairs",

      "Display Replacements",

      "Battery & Port Fixes",

      "In-Warranty Claims",
    ],

    "https://www.realme.com/in/support/services",

    9.976,

    76.281,

    "Official Realme India Authorized Service Center Directory",
  ),

  sc(
    "sc-realme-tvm",

    "Realme Service Center",

    "Realme",

    "mobile",

    "Pulimoodu Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2472777",

    "service.tvm@realmesupport.in",

    [
      "Realme Number Series & GT Care",

      "Original AMOLED Replacement",

      "Fast Battery Replacement",
    ],

    "https://www.realme.com/in/support/services",

    8.5241,

    76.9366,

    "Realme India Authorized Service Center",
  ),

  sc(
    "sc-realme-calicut",

    "Realme Authorized Service Centre",

    "Realme",

    "mobile",

    "Emora Arcade, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4022777",

    "service.calicut@realmesupport.in",

    [
      "Complete Realme Servicing",

      "Screen & Motherboard Fixes",

      "Warranty Validation",
    ],

    "https://www.realme.com/in/support/services",

    11.2588,

    75.7804,

    "Realme Authorized Support Provider",
  ),

  sc(
    "sc-realme-thrissur",

    "Realme Service Point",

    "Realme",

    "mobile",

    "Marar Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2442777",

    "service.thrissur@realmesupport.in",

    ["Smartphone Testing", "Display Replacement", "Original Battery Spares"],

    "https://www.realme.com/in/support/services",

    10.5276,

    76.2144,

    "Realme Authorized Support Point",
  ),

  sc(
    "sc-realme-kottayam",

    "Realme Customer Care",

    "Realme",

    "mobile",

    "Shastri Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2582777",

    "service.kottayam@realmesupport.in",

    ["Diagnostics & Repair", "Panel Fixes", "Warranty Support"],

    "https://www.realme.com/in/support/services",

    9.5916,

    76.5222,

    "Realme Authorized Location",
  ),

  sc(
    "sc-realme-muvattupuzha",

    "Realme Authorized Care",

    "Realme",

    "mobile",

    "AMC Commercial Complex, MC Road, Muvattupuzha",

    "Muvattupuzha",

    "686661",

    "+91-485-2812777",

    "service.mvpa@realmesupport.in",

    ["Regional Smartphone Care", "Display Replacements", "Warranty Claims"],

    "https://www.realme.com/in/support/services",

    9.985,

    76.578,

    "Realme India Authorized Regional Center",
  ),

  sc(
    "sc-realme-kannur",

    "Realme Service Center",

    "Realme",

    "mobile",

    "South Bazar, Kannur",

    "Kannur",

    "670002",

    "+91-497-2762777",

    "service.kannur@realmesupport.in",

    [
      "Hardware Diagnostics",

      "Original Spare Replacement",

      "In-Warranty Support",
    ],

    "https://www.realme.com/in/support/services",

    11.8745,

    75.3704,

    "Realme Authorized Service Point",
  ),

  sc(
    "sc-realme-kollam",

    "Realme Service Point",

    "Realme",

    "mobile",

    "Polayathode, Kollam",

    "Kollam",

    "691021",

    "+91-474-2762777",

    "service.kollam@realmesupport.in",

    ["Smartphone Inspection", "Screen & Battery Replacement", "Genuine Parts"],

    "https://www.realme.com/in/support/services",

    8.8932,

    76.6141,

    "Realme Authorized Service Location",
  ),

  sc(
    "sc-realme-palakkad",

    "Realme Care Facility",

    "Realme",

    "mobile",

    "GB Road, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-2522777",

    "service.palakkad@realmesupport.in",

    ["Hardware Repairs", "Display Replacements", "Warranty Processing"],

    "https://www.realme.com/in/support/services",

    10.7867,

    76.6548,

    "Realme India Authorized Partner",
  ),

  sc(
    "sc-realme-malappuram",

    "Realme Support Point",

    "Realme",

    "mobile",

    "Calicut Road, Malappuram",

    "Malappuram",

    "676505",

    "+91-483-2732777",

    "service.malappuram@realmesupport.in",

    ["Smartphone Diagnostics", "Battery Fixes", "Warranty Validation"],

    "https://www.realme.com/in/support/services",

    11.0732,

    76.074,

    "Realme Authorized Center",
  ),

  // ── Vivo Mobile ────────────────────────────────────────────────────────────

  sc(
    "sc-vivo-kochi",

    "Vivo Exclusive Service Center",

    "Vivo",

    "mobile",

    "2nd Floor, Chicago Plaza, Rajaji Road, Shenoys, Kochi",

    "Kochi",

    "682035",

    "+91-484-4033388",

    "vivo.ekm@vivokerala.in",

    [
      "Vivo V & X Series Flagship Care",

      "Original AMOLED Screen Replacement",

      "Motherboard Testing",

      "Warranty Processing",
    ],

    "https://www.vivo.com/in/support/service-center",

    9.9816,

    76.2845,

    "Official Vivo India Exclusive Service Center Directory",
  ),

  sc(
    "sc-vivo-tvm",

    "Vivo Exclusive Service Center",

    "Vivo",

    "mobile",

    "Near Ayurveda College, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2463388",

    "vivo.tvm@vivokerala.in",

    [
      "Vivo Smartphone Diagnostics",

      "Display & Glass Replacement",

      "Fast Battery Replacement",

      "Genuine Spares",
    ],

    "https://www.vivo.com/in/support/service-center",

    8.5241,

    76.9366,

    "Vivo India Exclusive Service Location",
  ),

  sc(
    "sc-vivo-calicut",

    "Vivo Exclusive Service Center",

    "Vivo",

    "mobile",

    "Arayidathupalam, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2743388",

    "vivo.calicut@vivokerala.in",

    [
      "Complete Vivo Line Repairs",

      "Camera & Sensor Calibration",

      "In-Warranty Support",

      "Original Spares",
    ],

    "https://www.vivo.com/in/support/service-center",

    11.265,

    75.792,

    "Vivo India Exclusive Service Centre",
  ),

  sc(
    "sc-vivo-thrissur",

    "Vivo Customer Care Center",

    "Vivo",

    "mobile",

    "East Fort, Thrissur",

    "Thrissur",

    "680005",

    "+91-487-2423388",

    "vivo.thrissur@vivokerala.in",

    ["Hardware Inspections", "Display Replacement", "Original Battery Spares"],

    "https://www.vivo.com/in/support/service-center",

    10.5276,

    76.2144,

    "Vivo Authorized Service Location",
  ),

  sc(
    "sc-vivo-kottayam",

    "Vivo Exclusive Service Center",

    "Vivo",

    "mobile",

    "Central Junction, TB Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2563388",

    "vivo.kottayam@vivokerala.in",

    ["Smartphone Diagnostics", "Screen Fixes", "Warranty Validation"],

    "https://www.vivo.com/in/support/service-center",

    9.5916,

    76.5222,

    "Vivo Exclusive Service Centre",
  ),

  sc(
    "sc-vivo-muvattupuzha",

    "Vivo Authorized Service Center",

    "Vivo",

    "mobile",

    "Chalikkadavu Road, Muvattupuzha",

    "Muvattupuzha",

    "686661",

    "+91-485-2833388",

    "vivo.mvpa@vivokerala.in",

    ["Regional Smartphone Care", "Display Replacements", "Warranty Claims"],

    "https://www.vivo.com/in/support/service-center",

    9.985,

    76.578,

    "Vivo Authorized Support Point",
  ),

  sc(
    "sc-vivo-thodupuzha",

    "Vivo Care Desk",

    "Vivo",

    "mobile",

    "Mangattukavala, Thodupuzha",

    "Thodupuzha",

    "685584",

    "+91-4862-223388",

    "vivo.thodupuzha@vivokerala.in",

    [
      "Idukki Regional Support",

      "Screen & Battery Replacement",

      "Genuine Parts",
    ],

    "https://www.vivo.com/in/support/service-center",

    9.8959,

    76.7184,

    "Vivo India Authorized Service Point",
  ),

  sc(
    "sc-vivo-kannur",

    "Vivo Exclusive Service Center",

    "Vivo",

    "mobile",

    "Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2703388",

    "vivo.kannur@vivokerala.in",

    [
      "Smartphone Testing",

      "Original Display Replacement",

      "In-Warranty Support",
    ],

    "https://www.vivo.com/in/support/service-center",

    11.8745,

    75.3704,

    "Vivo Exclusive Service Centre",
  ),

  sc(
    "sc-vivo-kollam",

    "Vivo Exclusive Service Center",

    "Vivo",

    "mobile",

    "Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-2743388",

    "vivo.kollam@vivokerala.in",

    ["Diagnostics & Repair", "Panel Fixes", "Warranty Processing"],

    "https://www.vivo.com/in/support/service-center",

    8.8932,

    76.6141,

    "Vivo Exclusive Service Location",
  ),

  sc(
    "sc-vivo-palakkad",

    "Vivo Service Center",

    "Vivo",

    "mobile",

    "English Church Road, Palakkad",

    "Palakkad",

    "678014",

    "+91-491-2503388",

    "vivo.palakkad@vivokerala.in",

    ["Hardware Diagnostics", "Battery & Port Fixes", "Original Parts"],

    "https://www.vivo.com/in/support/service-center",

    10.7867,

    76.6548,

    "Vivo Authorized Service Center",
  ),

  sc(
    "sc-vivo-alappuzha",

    "Vivo Care Center",

    "Vivo",

    "mobile",

    "Cullen Road, Alappuzha",

    "Alappuzha",

    "688001",

    "+91-477-2243388",

    "vivo.alappuzha@vivokerala.in",

    ["Smartphone Care", "Display Replacements", "Warranty Validation"],

    "https://www.vivo.com/in/support/service-center",

    9.4981,

    76.3388,

    "Vivo Authorized Service Facility",
  ),

  // ── OPPO Mobile ────────────────────────────────────────────────────────────

  sc(
    "sc-oppo-kochi",

    "OPPO Authorized Service Center",

    "OPPO",

    "mobile",

    "2nd Floor, Jos Annex, MG Road, Ernakulam, Kochi",

    "Kochi",

    "682016",

    "+91-484-2372777",

    "oppo.ekm@oppo.com",

    [
      "Reno & Find Series Care",

      "Original AMOLED Replacement",

      "Flash Charge Battery Service",

      "Warranty Claims",
    ],

    "https://support.oppo.com/in/service-center/",

    9.9678,

    76.2862,

    "Official OPPO India Authorized Service Center Directory",
  ),

  sc(
    "sc-oppo-tvm",

    "OPPO Customer Care Center",

    "OPPO",

    "mobile",

    "Statue Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2462777",

    "oppo.tvm@oppo.com",

    [
      "OPPO Smartphone Diagnostics",

      "Display Fixes",

      "Battery Replacement",

      "In-Warranty Support",
    ],

    "https://support.oppo.com/in/service-center/",

    8.5241,

    76.9366,

    "OPPO India Authorized Service Location",
  ),

  sc(
    "sc-oppo-calicut",

    "OPPO Authorized Service Center",

    "OPPO",

    "mobile",

    "Arayidathupalam, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2762777",

    "oppo.calicut@oppo.com",

    [
      "Hardware Inspections",

      "Display Replacement",

      "Original Spares",

      "Camera Diagnostics",
    ],

    "https://support.oppo.com/in/service-center/",

    11.265,

    75.792,

    "OPPO Authorized Service Centre",
  ),

  sc(
    "sc-oppo-thrissur",

    "OPPO Service Plaza",

    "OPPO",

    "mobile",

    "Round South, Kuruppam Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2422777",

    "oppo.thrissur@oppo.com",

    ["Diagnostics & Repair", "Battery Replacements", "Warranty Validation"],

    "https://support.oppo.com/in/service-center/",

    10.5276,

    76.2144,

    "OPPO Authorized Support Point",
  ),

  sc(
    "sc-oppo-kottayam",

    "OPPO Customer Service Center",

    "OPPO",

    "mobile",

    "TB Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2562777",

    "oppo.kottayam@oppo.com",

    ["Smartphone Testing", "Screen Replacement", "Original Spares"],

    "https://support.oppo.com/in/service-center/",

    9.5916,

    76.5222,

    "OPPO Authorized Service Centre",
  ),

  sc(
    "sc-oppo-muvattupuzha",

    "OPPO Service Point",

    "OPPO",

    "mobile",

    "AMC Complex, MC Road, Muvattupuzha",

    "Muvattupuzha",

    "686661",

    "+91-485-2822777",

    "oppo.mvpa@oppo.com",

    ["Regional Smartphone Support", "Display Replacement", "Warranty Claims"],

    "https://support.oppo.com/in/service-center/",

    9.985,

    76.578,

    "OPPO India Authorized Support Point",
  ),

  sc(
    "sc-oppo-kannur",

    "OPPO Authorized Care",

    "OPPO",

    "mobile",

    "Thavakkara, Kannur",

    "Kannur",

    "670001",

    "+91-497-2702777",

    "oppo.kannur@oppo.com",

    ["Smartphone Diagnostics", "Panel Fixes", "Original Parts"],

    "https://support.oppo.com/in/service-center/",

    11.8745,

    75.3704,

    "OPPO Authorized Service Location",
  ),

  sc(
    "sc-oppo-kollam",

    "OPPO Service Center",

    "OPPO",

    "mobile",

    "High School Junction, Kollam",

    "Kollam",

    "691009",

    "+91-474-2792777",

    "oppo.kollam@oppo.com",

    ["Hardware Diagnostics", "Battery Replacement", "In-Warranty Support"],

    "https://support.oppo.com/in/service-center/",

    8.8932,

    76.6141,

    "OPPO Authorized Service Center",
  ),

  sc(
    "sc-oppo-palakkad",

    "OPPO Care Point",

    "OPPO",

    "mobile",

    "Court Road, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-2522777",

    "oppo.palakkad@oppo.com",

    ["Hardware Inspections", "Display Replacement", "Warranty Validation"],

    "https://support.oppo.com/in/service-center/",

    10.7867,

    76.6548,

    "OPPO Authorized Support Point",
  ),

  // ── Motorola Mobile ────────────────────────────────────────────────────────

  sc(
    "sc-moto-kochi",

    "Moto Care Authorized Service Center (F1 Info Solutions)",

    "Motorola",

    "mobile",

    "Door No. 39/4143, Chicago Plaza, Rajaji Road, Shenoys, Kochi",

    "Kochi",

    "682035",

    "+91-484-4028001",

    "moto.kochi@f1infosolutions.com",

    [
      "Moto Edge & G-Series Repairs",

      "Original pOLED & LCD Replacement",

      "Battery & Port Fixes",

      "Warranty Claims",
    ],

    "https://motorola-global-portal.custhelp.com/app/mcp/service-center-locator",

    9.9816,

    76.2845,

    "Official Motorola India Authorized Service Provider",
  ),

  sc(
    "sc-moto-tvm",

    "Moto Care Service Centre",

    "Motorola",

    "mobile",

    "Overbridge Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2462001",

    "moto.tvm@f1infosolutions.com",

    [
      "Motorola Smartphone Diagnostics",

      "Display Fixes",

      "Original Battery Replacements",

      "Warranty Processing",
    ],

    "https://motorola-global-portal.custhelp.com/app/mcp/service-center-locator",

    8.5241,

    76.9366,

    "Motorola Authorized Service Location",
  ),

  sc(
    "sc-moto-calicut",

    "Moto Care Authorized Center",

    "Motorola",

    "mobile",

    "Emora Arcade, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4012001",

    "moto.calicut@f1infosolutions.com",

    [
      "Hardware Testing",

      "Screen Replacement",

      "Original Spares",

      "Software Updates",
    ],

    "https://motorola-global-portal.custhelp.com/app/mcp/service-center-locator",

    11.2588,

    75.7804,

    "Motorola India Authorized Partner",
  ),

  sc(
    "sc-moto-thrissur",

    "Motorola Service Desk",

    "Motorola",

    "mobile",

    "Kuruppam Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2422001",

    "moto.thrissur@f1infosolutions.com",

    ["Diagnostics & Repair", "Panel Fixes", "In-Warranty Support"],

    "https://motorola-global-portal.custhelp.com/app/mcp/service-center-locator",

    10.5276,

    76.2144,

    "Motorola Authorized Support Point",
  ),

  sc(
    "sc-moto-kottayam",

    "Motorola Authorized Service",

    "Motorola",

    "mobile",

    "Baker Junction, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2562001",

    "moto.kottayam@f1infosolutions.com",

    ["Smartphone Inspection", "Battery Replacement", "Warranty Validation"],

    "https://motorola-global-portal.custhelp.com/app/mcp/service-center-locator",

    9.5916,

    76.5222,

    "Motorola Authorized Care Point",
  ),

  sc(
    "sc-moto-kannur",

    "Moto Care Point",

    "Motorola",

    "mobile",

    "Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2702001",

    "moto.kannur@f1infosolutions.com",

    ["Hardware Diagnostics", "Display Replacements", "Original Parts"],

    "https://motorola-global-portal.custhelp.com/app/mcp/service-center-locator",

    11.8745,

    75.3704,

    "Motorola Authorized Service Center",
  ),

  sc(
    "sc-moto-kollam",

    "Motorola Support Point",

    "Motorola",

    "mobile",

    "Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-2742001",

    "moto.kollam@f1infosolutions.com",

    ["Smartphone Testing", "Screen & Battery Replacements", "Warranty Claims"],

    "https://motorola-global-portal.custhelp.com/app/mcp/service-center-locator",

    8.8932,

    76.6141,

    "Motorola Authorized Support Desk",
  ),

  // ═════════════════════════════════════════════════════════════════════════════

  // 3. PRINTERS & SCANNERS (HP, Canon, Epson, Brother)

  // ═════════════════════════════════════════════════════════════════════════════

  // ── HP Printers ────────────────────────────────────────────────────────────

  sc(
    "sc-hp-printer-kochi",

    "HP Authorized Printer Service Point (F1 Info Solutions)",

    "HP",

    "printer",

    "Door No. 39/4143, Chicago Plaza, Rajaji Road, Shenoys, Kochi",

    "Kochi",

    "682035",

    "+91-484-4028001",

    "ernakulam.service@f1infosolutions.com",

    [
      "HP Smart Tank Diagnostics",

      "LaserJet Toner & Drum Assembly Fix",

      "Firmware & Connectivity Support",

      "Printhead Replacement",
    ],

    "https://support.hp.com/in-en/service-center",

    9.9816,

    76.2845,

    "Official HP India Customer Support Portal Service Point",
  ),

  sc(
    "sc-hp-printer-tvm",

    "HP Customer Care Centre",

    "HP",

    "printer",

    "Overbridge Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2462001",

    "trivandrum.service@f1infosolutions.com",

    [
      "Smart Tank & LaserJet Repairs",

      "Paper Feed Overhaul",

      "Ink Absorber Reset",

      "In-Warranty Support",
    ],

    "https://support.hp.com/in-en/service-center",

    8.5241,

    76.9366,

    "HP India Authorized Service Partner",
  ),

  sc(
    "sc-hp-printer-calicut",

    "HP Printer Support Point",

    "HP",

    "printer",

    "Emora Arcade, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-4012001",

    "calicut.service@f1infosolutions.com",

    [
      "Printer Hardware Diagnostics",

      "Roller & Gear Replacement",

      "Network Setup",

      "Original Spares",
    ],

    "https://support.hp.com/in-en/service-center",

    11.2588,

    75.7804,

    "HP Authorized Service Point",
  ),

  sc(
    "sc-hp-printer-thrissur",

    "HP Printer Service Facility",

    "HP",

    "printer",

    "Kuruppam Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2422001",

    "thrissur.service@f1infosolutions.com",

    [
      "Laser & InkJet Support",

      "Cartridge & Drum Maintenance",

      "Warranty Inspection",
    ],

    "https://support.hp.com/in-en/service-center",

    10.5276,

    76.2144,

    "HP Authorized Service Provider",
  ),

  sc(
    "sc-hp-printer-kottayam",

    "HP Care Point",

    "HP",

    "printer",

    "Baker Junction, MC Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2562001",

    "kottayam.service@sysnetglobal.com",

    ["Printer Diagnostics", "Power Supply Repairs", "Warranty Registration"],

    "https://support.hp.com/in-en/service-center",

    9.5916,

    76.5222,

    "HP Authorized Support Point",
  ),

  sc(
    "sc-hp-printer-kannur",

    "HP Service Desk",

    "HP",

    "printer",

    "Plaza Junction, Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2702001",

    "kannur.service@f1infosolutions.com",

    ["Printer Inspections", "Printhead Replacements", "Original Spares"],

    "https://support.hp.com/in-en/service-center",

    11.8745,

    75.3704,

    "HP Authorized Care Facility",
  ),

  sc(
    "sc-hp-printer-kollam",

    "HP Printer Service",

    "HP",

    "printer",

    "Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-2742001",

    "kollam.service@f1infosolutions.com",

    ["Smart Tank Care", "Paper Jam & Feed Fixes", "In-Warranty Claims"],

    "https://support.hp.com/in-en/service-center",

    8.8932,

    76.6141,

    "HP Authorized Support Desk",
  ),

  sc(
    "sc-hp-printer-palakkad",

    "HP Support Facility",

    "HP",

    "printer",

    "English Church Road, Palakkad",

    "Palakkad",

    "678014",

    "+91-491-2502001",

    "palakkad.service@ensureservices.com",

    ["LaserJet Diagnostics", "Toner & Roller Fixes", "Warranty Validation"],

    "https://support.hp.com/in-en/service-center",

    10.7867,

    76.6548,

    "HP India Authorized Service Partner",
  ),

  // ── Canon Printers ─────────────────────────────────────────────────────────

  sc(
    "sc-canon-kochi",

    "Canon Authorized Service Facility (Apex Care Systems)",

    "Canon",

    "printer",

    "Building No. 41/2205, Chittoor Road, Near South Railway Station, Ernakulam, Kochi",

    "Kochi",

    "682016",

    "+91-484-2381234",

    "canon.service@apexcare.in",

    [
      "Canon PIXMA & MAXIFY Servicing",

      "Print Head Replacement",

      "Ink Absorber Reset",

      "Original Spares",

      "imageCLASS Laser Care",
    ],

    "https://in.canon/en/consumer/web/support-service-locations",

    9.9692,

    76.291,

    "Official Canon India Authorized Service Locations Network",
  ),

  sc(
    "sc-canon-tvm",

    "Canon Master Service Centre",

    "Canon",

    "printer",

    "Panavila Junction, Bakery Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2331234",

    "canon.tvm@apexcare.in",

    [
      "PIXMA MegaTank & Laser Care",

      "Printhead Alignment",

      "Logic Board Diagnostics",

      "Warranty Claims",
    ],

    "https://in.canon/en/consumer/web/support-service-locations",

    8.5241,

    76.9366,

    "Canon India Master Service Centre",
  ),

  sc(
    "sc-canon-calicut",

    "Canon Care Centre",

    "Canon",

    "printer",

    "Arayidathupalam, Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2741234",

    "canon.calicut@apexcare.in",

    [
      "Printer Diagnostics",

      "Roller & Feed Overhaul",

      "Original Canon Ink & Spares",
    ],

    "https://in.canon/en/consumer/web/support-service-locations",

    11.265,

    75.792,

    "Canon Authorized Service Location",
  ),

  sc(
    "sc-canon-thrissur",

    "Canon Authorized Service Point",

    "Canon",

    "printer",

    "Marar Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2421234",

    "canon.thrissur@apexcare.in",

    ["PIXMA Servicing", "Ink Pad Replacement", "In-Warranty Support"],

    "https://in.canon/en/consumer/web/support-service-locations",

    10.5276,

    76.2144,

    "Canon Authorized Support Provider",
  ),

  sc(
    "sc-canon-kottayam",

    "Canon Service Desk",

    "Canon",

    "printer",

    "TB Road, Near KSRTC, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2561234",

    "canon.kottayam@apexcare.in",

    ["Printer Inspection", "Printhead Replacements", "Warranty Validation"],

    "https://in.canon/en/consumer/web/support-service-locations",

    9.5916,

    76.5222,

    "Canon Authorized Service Centre",
  ),

  sc(
    "sc-canon-kannur",

    "Canon Care Center",

    "Canon",

    "printer",

    "South Bazar, Kannur",

    "Kannur",

    "670002",

    "+91-497-2761234",

    "canon.kannur@apexcare.in",

    ["MegaTank Diagnostics", "LaserJet Repairs", "Original Parts"],

    "https://in.canon/en/consumer/web/support-service-locations",

    11.8745,

    75.3704,

    "Canon Authorized Support Desk",
  ),

  sc(
    "sc-canon-kollam",

    "Canon Service Point",

    "Canon",

    "printer",

    "Polayathode, Kollam",

    "Kollam",

    "691021",

    "+91-474-2761234",

    "canon.kollam@apexcare.in",

    ["Hardware Inspections", "Ink Absorber Reset", "In-Warranty Claims"],

    "https://in.canon/en/consumer/web/support-service-locations",

    8.8932,

    76.6141,

    "Canon Authorized Support Partner",
  ),

  sc(
    "sc-canon-palakkad",

    "Canon Service Facility",

    "Canon",

    "printer",

    "Court Road, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-2521234",

    "canon.palakkad@apexcare.in",

    ["Printer Diagnostics", "Printhead Service", "Genuine Spares"],

    "https://in.canon/en/consumer/web/support-service-locations",

    10.7867,

    76.6548,

    "Canon India Authorized Partner",
  ),

  // ── Epson Printers ─────────────────────────────────────────────────────────

  sc(
    "sc-epson-kochi",

    "Epson Customer Care Centre (ProTech Electronics)",

    "Epson",

    "printer",

    "3rd Floor, Metro Plaza, Market Road, Ernakulam, Kochi",

    "Kochi",

    "682031",

    "+91-484-2367789",

    "epson.ernakulam@protech.co.in",

    [
      "EcoTank Maintenance",

      "Head Cleaning & Alignment",

      "Paper Feed Repair",

      "Warranty Invoicing Service",

      "Original Ink & Spares",
    ],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    9.976,

    76.281,

    "Official Epson India Service Center Directory",
  ),

  sc(
    "sc-epson-tvm",

    "Epson Authorized Service Centre",

    "Epson",

    "printer",

    "Ambujavilasam Road, Pulimoodu, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2477789",

    "epson.tvm@protech.co.in",

    [
      "EcoTank & WorkForce Servicing",

      "Micro Piezo Head Replacement",

      "Waste Ink Pad Reset",

      "Warranty Claims",
    ],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    8.5241,

    76.9366,

    "Epson India Authorized Customer Care",
  ),

  sc(
    "sc-epson-calicut",

    "Epson Customer Care Centre",

    "Epson",

    "printer",

    "Puthiyara Road, Mavoor Road Cross, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2727789",

    "epson.calicut@protech.co.in",

    [
      "Complete EcoTank Line Diagnostics",

      "Paper Jam & Roller Overhaul",

      "Original Spares",
    ],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    11.2588,

    75.7804,

    "Epson Authorized Service Centre",
  ),

  sc(
    "sc-epson-thrissur",

    "Epson Customer Service Point",

    "Epson",

    "printer",

    "Pooma Complex, MG Road, Thrissur",

    "Thrissur",

    "680004",

    "+91-487-2387789",

    "epson.thrissur@protech.co.in",

    ["Printer Diagnostics", "Head Alignment", "In-Warranty Support"],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    10.5276,

    76.2144,

    "Epson India Service Point",
  ),

  sc(
    "sc-epson-kottayam",

    "Epson Authorized Care",

    "Epson",

    "printer",

    "Kanjikuzhy, Kottayam",

    "Kottayam",

    "686004",

    "+91-481-2587789",

    "epson.kottayam@protech.co.in",

    ["EcoTank Diagnostics", "Pump & Tube Replacement", "Warranty Registration"],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    9.5916,

    76.5222,

    "Epson Authorized Service Location",
  ),

  sc(
    "sc-epson-kannur",

    "Epson Service Point",

    "Epson",

    "printer",

    "Fort Road, Kannur",

    "Kannur",

    "670001",

    "+91-497-2717789",

    "epson.kannur@protech.co.in",

    ["Hardware Inspections", "Ink Pad Fixes", "Original Spares"],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    11.8745,

    75.3704,

    "Epson Authorized Support Provider",
  ),

  sc(
    "sc-epson-kollam",

    "Epson Customer Care",

    "Epson",

    "printer",

    "Chinnakada, Kollam",

    "Kollam",

    "691001",

    "+91-474-2747789",

    "epson.kollam@protech.co.in",

    ["EcoTank Maintenance", "Printhead Service", "In-Warranty Claims"],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    8.8932,

    76.6141,

    "Epson Authorized Service Desk",
  ),

  sc(
    "sc-epson-palakkad",

    "Epson Care Facility",

    "Epson",

    "printer",

    "GB Road, Palakkad",

    "Palakkad",

    "678001",

    "+91-491-2527789",

    "epson.palakkad@protech.co.in",

    ["Hardware Testing", "Roller & Gear Replacements", "Warranty Processing"],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    10.7867,

    76.6548,

    "Epson India Authorized Partner",
  ),

  sc(
    "sc-epson-manjeri",

    "Epson Service Desk",

    "Epson",

    "printer",

    "Calicut Road, Manjeri, Malappuram",

    "Malappuram",

    "676121",

    "+91-483-2767789",

    "epson.manjeri@protech.co.in",

    ["Regional Printer Diagnostics", "Waste Ink Reset", "Original Ink"],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    11.12,

    76.12,

    "Epson Authorized Support Location",
  ),

  sc(
    "sc-epson-alappuzha",

    "Epson Service Point",

    "Epson",

    "printer",

    "YMCA Junction, Alappuzha",

    "Alappuzha",

    "688001",

    "+91-477-2247789",

    "epson.alappuzha@protech.co.in",

    ["EcoTank Diagnostics", "Paper Jam Repairs", "Warranty Validation"],

    "https://www.epson.co.in/Support/ServiceCenterLocator",

    9.4981,

    76.3388,

    "Epson Authorized Care Point",
  ),

  // ── Brother Printers ───────────────────────────────────────────────────────

  sc(
    "sc-brother-kochi",

    "Brother Authorized Service Centre",

    "Brother",

    "printer",

    "2nd Floor, Imperial Trade Centre, MG Road, Ernakulam, Kochi",

    "Kochi",

    "682035",

    "+91-484-4048904",

    "brother.ekm@brothercare.in",

    [
      "Laser & Ink Tank Maintenance",

      "Drum Unit Replacement",

      "Paper Feed Mechanism Fix",

      "In-Warranty Support",

      "Original Toners",
    ],

    "https://www.brother.in/en/support/service-centre",

    9.9782,

    76.2821,

    "Official Brother India Authorized Service Centre Network",
  ),

  sc(
    "sc-brother-tvm",

    "Brother Customer Service Centre",

    "Brother",

    "printer",

    "Statue Junction, MG Road, Thiruvananthapuram",

    "Thiruvananthapuram",

    "695001",

    "+91-471-2468904",

    "brother.tvm@brothercare.in",

    [
      "Brother Mono & Color Laser Servicing",

      "Ink Tank Repair",

      "Logic Board Diagnostics",

      "Warranty Claims",
    ],

    "https://www.brother.in/en/support/service-centre",

    8.5241,

    76.9366,

    "Brother Authorized Service Location",
  ),

  sc(
    "sc-brother-calicut",

    "Brother Authorized Service Centre",

    "Brother",

    "printer",

    "Mavoor Road, Kozhikode",

    "Kozhikode",

    "673004",

    "+91-495-2748904",

    "brother.calicut@brothercare.in",

    ["Hardware Inspections", "Drum & Roller Replacements", "Original Spares"],

    "https://www.brother.in/en/support/service-centre",

    11.2588,

    75.7804,

    "Brother Authorized Service Partner",
  ),

  sc(
    "sc-brother-thrissur",

    "Brother Service Desk",

    "Brother",

    "printer",

    "Kuruppam Road, Thrissur",

    "Thrissur",

    "680001",

    "+91-487-2428904",

    "brother.thrissur@brothercare.in",

    ["Laser Printer Diagnostics", "Paper Feed Overhaul", "Warranty Support"],

    "https://www.brother.in/en/support/service-centre",

    10.5276,

    76.2144,

    "Brother Authorized Support Point",
  ),

  sc(
    "sc-brother-kottayam",

    "Brother Support Facility",

    "Brother",

    "printer",

    "Shastri Road, Kottayam",

    "Kottayam",

    "686001",

    "+91-481-2568904",

    "brother.kottayam@brothercare.in",

    ["Printer Testing", "Printhead & Drum Service", "Original Parts"],

    "https://www.brother.in/en/support/service-centre",

    9.5916,

    76.5222,

    "Brother India Service Location",
  ),

  sc(
    "sc-brother-kannur",

    "Brother Care Point",

    "Brother",

    "printer",

    "Thavakkara, Kannur",

    "Kannur",

    "670001",

    "+91-497-2708904",

    "brother.kannur@brothercare.in",

    ["Hardware Diagnostics", "Ink Tank Maintenance", "Warranty Validation"],

    "https://www.brother.in/en/support/service-centre",

    11.8745,

    75.3704,

    "Brother Authorized Service Desk",
  ),

  sc(
    "sc-brother-kollam",

    "Brother Service Facility",

    "Brother",

    "printer",

    "High School Junction, Kadappakada, Kollam",

    "Kollam",

    "691009",

    "+91-474-2798904",

    "brother.kollam@brothercare.in",

    [
      "Printer Inspection",

      "Laser Toner & Drum Replacements",

      "In-Warranty Support",
    ],

    "https://www.brother.in/en/support/service-centre",

    8.8932,

    76.6141,

    "Brother Authorized Service Partner",
  ),
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

export type CouponType = "percentage" | "fixed"

export type CouponUsageType = "one_time"

export type Coupon = {
  id: string

  code: string // stored uppercase, compared case-insensitive

  description: string

  type: CouponType

  value: number // percent (0-90) or fixed INR amount

  minOrderValue: number // 0 = no minimum

  maxDiscount: number // 0 = no cap (only for percentage type)

  usageType?: CouponUsageType // All coupons are strictly one-time per customer

  totalUsageLimit: number // 0 = unlimited across all customers

  timesUsed: number

  active: boolean

  startsAt: string // ISO datetime

  endsAt: string // ISO datetime

  createdAt: string
}

export type CouponUsage = {
  id: string

  couponId: string

  couponCode: string

  customerId: string // unique customer phone, email or profile id

  userId?: string // backwards-compatible alias

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

    description:
      "Flat ₹500 discount on orders above ₹5,000 (1-time per customer)",

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

export type CouponValidationResult = {
  valid: true

  coupon: Coupon

  discount: number
} | {
  valid: false

  error: string
}

export const validateCoupon = (
  code: string,

  cartTotal: number,

  customerId: string,

  coupons: Coupon[],

  usages: CouponUsage[],
): CouponValidationResult => {
  const upper = code.trim().toUpperCase()

  if (!upper) return { valid: false, error: "Enter a coupon code." }

  const coupon = coupons.find((c) => c.code.toUpperCase() === upper)

  if (!coupon) return { valid: false, error: "Invalid coupon code." }

  if (!coupon.active)
    return { valid: false, error: "This coupon is no longer active." }

  const now = Date.now()

  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now)
    return { valid: false, error: "This coupon is not yet valid." }

  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now)
    return { valid: false, error: "This coupon has expired." }

  if (coupon.totalUsageLimit > 0 && coupon.timesUsed >= coupon.totalUsageLimit)
    return { valid: false, error: "This coupon has reached its usage limit." }

  // Every coupon can only be used once per customer

  const alreadyUsed = usages.some(
    (u) =>
      u.couponId === coupon.id &&
      (u.customerId === customerId || u.userId === customerId),
  )

  if (alreadyUsed)
    return { valid: false, error: "You have already used this coupon." }

  if (coupon.minOrderValue > 0 && cartTotal < coupon.minOrderValue)
    return {
      valid: false,

      error: `Minimum order value of ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(coupon.minOrderValue)} required.`,
    }

  let discount =
    coupon.type === "percentage"
      ? Math.round((cartTotal * coupon.value) / 100)
      : coupon.value

  if (coupon.type === "percentage" && coupon.maxDiscount > 0)
    discount = Math.min(discount, coupon.maxDiscount)

  discount = Math.min(discount, cartTotal)

  return { valid: true, coupon, discount }
}

// ── Sell Your Item (customer submission flow) ──

export type SellRequestStatus = "Pending" | "Under Review" | "Contacted" | "Approved" | "Rejected" | "Completed"

export const sellRequestStatuses: SellRequestStatus[] = [
  "Pending",

  "Under Review",

  "Contacted",

  "Approved",

  "Rejected",

  "Completed",
]

export const sellCategories = [
  "Phone",

  "Laptop",

  "Desktop / PC",

  "Monitor",

  "Printer",

  "Tablet",

  "Accessories",

  "Other Electronics",
] as const

export type SellCategory = typeof sellCategories[number]

export type SellRequest = {
  id: string // e.g. SELL-XXXXXXX

  userId: string // store.profile.phone

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

  warrantyRemaining: string // e.g. '6 months', '1 year'

  warrantyDetails: string

  /** Simulated storage paths for product images (in prototype: data URIs or filenames) */

  imagePaths: string[]

  /** Simulated storage path for invoice document */

  invoicePath: string

  expectedPrice?: number

  offeredPrice?: number

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

    description:
      "Purchased in 2023. Minor scratches on lid, screen and keyboard in mint condition. Original charger included.",

    hasWarranty: true,

    warrantyProvider: "HP India",

    warrantyRemaining: "4 months",

    warrantyDetails: "Extended care pack valid till Feb 2027",

    imagePaths: ["/images/laptop.jpg"],

    invoicePath: "/invoices/hp-pavilion-invoice.pdf",

    status: "Under Review",

    adminNotes:
      "Customer sent clear photos of invoice. Checking serial number against HP support portal.",

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

    description:
      "Used as a secondary device with case and glass protector from day one. Battery health excellent.",

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

export type CertificateItem = {
  id: string

  text: string

  brand: string

  category: string

  status: string

  validity: string

  description: string

  image: string

  alt?: string

  shopUrl?: string
}

export const initialCertificates: CertificateItem[] = [
  {
    id: "cert-asus",

    image: "/images/recognition/asus-premium-partner.jpg",

    text: "ASUS Premium Partner",

    brand: "ASUS",

    category: "Laptops & Computing",

    status: "Authorised Premium Partner",

    validity: "2026 Certified",

    description:
      "Certified ASUS Premium Partner 2026 — 100% authentic ROG, TUF, ZenBook laptops and motherboards with direct manufacturer warranty.",

    alt: "ASUS Premium Partner Certificate for IT HUB",

    shopUrl: "/products?brand=ASUS",
  },

  {
    id: "cert-canon",

    image: "/images/recognition/canon-authorised-reseller.jpg",

    text: "Canon Authorised Reseller",

    brand: "Canon",

    category: "Printers & Consumables",

    status: "Authorised Reseller",

    validity: "Official Reseller",

    description:
      "Officially recognized Canon Reseller delivering genuine PIXMA & imageCLASS printers, high-yield toner cartridges, and expert support.",

    alt: "Canon Authorised Reseller Certificate for IT HUB",

    shopUrl: "/products?brand=Canon",
  },

  {
    id: "cert-epson",

    image: "/images/recognition/epson-channel-partner.jpg",

    text: "Epson Channel Partner",

    brand: "Epson",

    category: "EcoTank Printers & Supplies",

    status: "Certified Channel Partner",

    validity: "2026 – 2027",

    description:
      "Officially accredited Epson Certified Channel Partner delivering genuine EcoTank printers, original inks, and imaging systems.",

    alt: "Epson Certified Channel Partner Certificate for IT HUB",

    shopUrl: "/products?brand=Epson",
  },

  {
    id: "cert-numeric",

    image: "/images/recognition/numeric-energy-partner.jpg",

    text: "Numeric Energy Partner",

    brand: "Numeric",

    category: "UPS & Power Systems",

    status: "Authorised Energy Partner",

    validity: "Authorised Partner",

    description:
      "Authorised sales and support partner for Numeric by Legrand power backup, line-interactive UPS, and energy storage solutions.",

    alt: "Numeric Authorised Energy Partner Certificate for IT HUB",

    shopUrl: "/products?category=Power%20%26%20UPS",
  },

  {
    id: "cert-iggis",

    image: "/images/recognition/iggis-honour-recognition.jpg",

    text: "IGGIS Honour & Recognition",

    brand: "IGGIS",

    category: "Institutional IT Partner",

    status: "Excellence Recognition",

    validity: "Partnership Award",

    description:
      "Honour & recognition awarded by Indira Gandhi Group of Institutions for exceptional technology supply and institutional support.",

    alt: "Indira Gandhi Group of Institutions recognition award presented to IT HUB",
  },

  {
    id: "cert-intel",

    image: "/images/about-store.png",

    text: "Intel Partner Alliance",

    brand: "Intel",

    category: "Processors & Systems",

    status: "Alliance Member",

    validity: "Active Member",

    description:
      "Official Intel® Partner Alliance Member delivering authentic Core processors, boxed CPUs, and certified desktop computing solutions.",

    alt: "Intel Partner Alliance Membership Certificate for IT HUB",

    shopUrl: "/products?brand=Intel",
  },
]
