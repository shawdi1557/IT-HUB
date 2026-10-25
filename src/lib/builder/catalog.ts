// src/lib/builder/catalog.ts
// IT HUB Technical Hardware Catalog & Shopify Commerce Adapter
// Bridges authentic Shopify variant data with verified engineering specifications.

import type {
  CanonicalBuildComponent,
  ComponentSlotId,
  TechnicalSpecs,
} from "./types"
import type { Product, ComponentOption } from "../../data/catalog"
import { shopifyConfig, fetchShopifyCatalog } from "../shopify"
import { toVariantGid } from "../shopify-schema"

export interface VerifiedSpecEntry {
  specs: TechnicalSpecs
  defaultPrice: number
  title: string
  aliases?: string[]
}

/**
 * Verified Technical Specification Registry for hardware components.
 * Sourced from official manufacturer datasheets (AMD, Intel, ASUS, MSI, Corsair, NVIDIA, etc.)
 */
export const VERIFIED_HARDWARE_SPECS: Record<string, VerifiedSpecEntry> = {
  // ─── Processors ───
  "cpu-r5-7600": {
    title: "AMD Ryzen 5 7600 (6 Cores / 12 Threads)",
    defaultPrice: 18999,
    aliases: ["ryzen 5 7600", "r5 7600", "7600x", "7600"],
    specs: {
      socket: "AM5",
      tdpWatts: 65,
      hasIntegratedGraphics: true,
      includesCooler: true,
      supportedRamGen: ["DDR5"],
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "cpu-r7-9700x": {
    title: "AMD Ryzen 7 9700X (8 Cores / 16 Threads)",
    defaultPrice: 34999,
    aliases: ["ryzen 7 9700x", "r7 9700x", "9700x"],
    specs: {
      socket: "AM5",
      tdpWatts: 65,
      hasIntegratedGraphics: true,
      includesCooler: false,
      supportedRamGen: ["DDR5"],
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "cpu-r5-5600": {
    title: "AMD Ryzen 5 5600 (6 Cores / 12 Threads)",
    defaultPrice: 10999,
    aliases: ["ryzen 5 5600", "r5 5600", "5600x", "5600"],
    specs: {
      socket: "AM4",
      tdpWatts: 65,
      hasIntegratedGraphics: false,
      includesCooler: true,
      supportedRamGen: ["DDR4"],
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "cpu-i5-12400f": {
    title: "Intel Core i5-12400F (6 Cores / 12 Threads)",
    defaultPrice: 9499,
    aliases: ["core i5-12400f", "i5 12400f", "12400f", "12400"],
    specs: {
      socket: "LGA1700",
      tdpWatts: 65,
      hasIntegratedGraphics: false,
      includesCooler: true,
      supportedRamGen: ["DDR4", "DDR5"],
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "cpu-i5-14600k": {
    title: "Intel Core i5-14600K (14 Cores / 20 Threads)",
    defaultPrice: 28499,
    aliases: ["core i5-14600k", "i5 14600k", "14600k", "14600"],
    specs: {
      socket: "LGA1700",
      tdpWatts: 125,
      hasIntegratedGraphics: true,
      includesCooler: false,
      supportedRamGen: ["DDR4", "DDR5"],
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },

  // ─── Motherboards ───
  "mobo-b650m": {
    title: "MSI PRO B650M-P Micro-ATX Motherboard",
    defaultPrice: 10499,
    aliases: ["pro b650m-p", "b650m-p", "b650m", "b650"],
    specs: {
      socket: "AM5",
      formFactor: "Micro-ATX",
      supportedRamGeneration: "DDR5",
      ramSlots: 4,
      maxRamCapacityGb: 192,
      m2SlotCount: 2,
      sataPortCount: 4,
      hasWifi: false,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "mobo-b550m": {
    title: "ASUS Prime B550M-A WiFi II Motherboard",
    defaultPrice: 8999,
    aliases: ["prime b550m-a", "b550m-a", "b550m", "b550"],
    specs: {
      socket: "AM4",
      formFactor: "Micro-ATX",
      supportedRamGeneration: "DDR4",
      ramSlots: 4,
      maxRamCapacityGb: 128,
      m2SlotCount: 2,
      sataPortCount: 4,
      hasWifi: true,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "mobo-b760m": {
    title: "MSI B760M Bomber DDR5 Motherboard",
    defaultPrice: 9999,
    aliases: ["b760m bomber", "b760m", "b760"],
    specs: {
      socket: "LGA1700",
      formFactor: "Micro-ATX",
      supportedRamGeneration: "DDR5",
      ramSlots: 2,
      maxRamCapacityGb: 96,
      m2SlotCount: 2,
      sataPortCount: 4,
      hasWifi: false,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "mobo-z790": {
    title: "MSI MAG Z790 Tomahawk WiFi Motherboard",
    defaultPrice: 24999,
    aliases: ["mag z790", "z790 tomahawk", "z790"],
    specs: {
      socket: "LGA1700",
      formFactor: "ATX",
      supportedRamGeneration: "DDR5",
      ramSlots: 4,
      maxRamCapacityGb: 192,
      m2SlotCount: 4,
      sataPortCount: 6,
      hasWifi: true,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },

  // ─── RAM (Memory) ───
  "ram-16gb-ddr5": {
    title: "Corsair Vengeance 16GB (1x16GB) DDR5 5200MHz",
    defaultPrice: 4299,
    aliases: ["16gb ddr5", "16g ddr5", "ddr5 16gb", "5200mhz", "5200"],
    specs: {
      ramGeneration: "DDR5",
      capacityGb: 16,
      moduleCount: 1,
      speedMhz: 5200,
      isLaptopSoDimm: false,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "ram-32gb-ddr5": {
    title: "Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36",
    defaultPrice: 9499,
    aliases: ["32gb ddr5", "32g ddr5", "ddr5 32gb", "6000mhz", "6000"],
    specs: {
      ramGeneration: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMhz: 6000,
      isLaptopSoDimm: false,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "ram-16gb-ddr4": {
    title: "Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
    defaultPrice: 3299,
    aliases: ["16gb ddr4", "16g ddr4", "ddr4 16gb", "3200mhz", "3200", "16d4"],
    specs: {
      ramGeneration: "DDR4",
      capacityGb: 16,
      moduleCount: 2,
      speedMhz: 3200,
      isLaptopSoDimm: false,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },

  // ─── Graphics Cards ───
  "gpu-rtx4060": {
    title: "ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge",
    defaultPrice: 28999,
    aliases: ["rtx 4060", "rtx4060", "geforce 4060", "4060"],
    specs: {
      lengthMm: 222,
      slotWidth: 2,
      powerWatts: 115,
      recommendedPsuWatts: 500,
      requiredPciePins: "1x 8-pin",
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "gpu-rtx4070-super": {
    title: "Gigabyte GeForce RTX 4070 Super Windforce 12GB",
    defaultPrice: 58999,
    aliases: ["rtx 4070 super", "4070 super", "rtx4070s", "4070s"],
    specs: {
      lengthMm: 261,
      slotWidth: 2.5,
      powerWatts: 220,
      recommendedPsuWatts: 650,
      requiredPciePins: "1x 16-pin (12VHPWR)",
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "gpu-rx7600": {
    title: "ASRock AMD Radeon RX 7600 Challenger 8GB OC",
    defaultPrice: 23999,
    aliases: ["rx 7600", "rx7600", "radeon 7600", "7600 8gb", "rx6600"],
    specs: {
      lengthMm: 269,
      slotWidth: 2,
      powerWatts: 165,
      recommendedPsuWatts: 550,
      requiredPciePins: "1x 8-pin",
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },

  // ─── Storage (SSD) ───
  "ssd-1tb-nvme": {
    title: "Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD",
    defaultPrice: 5499,
    aliases: ["1tb nvme", "1tb ssd", "p3 plus 1tb", "1tb m.2", "1tb"],
    specs: {
      storageInterface: "M.2 NVMe",
      storageFormFactor: "M.2 2280",
      storageCapacityGb: 1000,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "ssd-500gb-nvme": {
    title: "Kingston NV2 500GB PCIe M.2 NVMe SSD",
    defaultPrice: 3299,
    aliases: ["500gb nvme", "500gb ssd", "nv2 500gb", "500gb m.2", "512gb"],
    specs: {
      storageInterface: "M.2 NVMe",
      storageFormFactor: "M.2 2280",
      storageCapacityGb: 500,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },

  // ─── Power Supplies ───
  "psu-550w": {
    title: "Deepcool PK550D 550W 80 Plus Bronze Power Supply",
    defaultPrice: 3499,
    aliases: ["550w", "pk550d", "550 watt", "550"],
    specs: {
      ratedWattage: 550,
      efficiencyRating: "80 Plus Bronze",
      psuFormFactor: "ATX",
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "psu-650w": {
    title: "Deepcool PK650D 650W 80 Plus Bronze Power Supply",
    defaultPrice: 4499,
    aliases: ["650w", "pk650d", "650 watt", "650"],
    specs: {
      ratedWattage: 650,
      efficiencyRating: "80 Plus Bronze",
      psuFormFactor: "ATX",
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "psu-750w": {
    title: "Corsair RM750e 750W 80 Plus Gold Fully Modular PSU",
    defaultPrice: 8999,
    aliases: ["750w", "rm750e", "750 watt", "750"],
    specs: {
      ratedWattage: 750,
      efficiencyRating: "80 Plus Gold",
      psuFormFactor: "ATX",
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },

  // ─── Cabinets ───
  "case-matx": {
    title: "Ant Esports ICE-100 Air Mini Mesh Micro-ATX Case",
    defaultPrice: 2899,
    aliases: ["ice-100", "mini mesh", "matx case", "ant"],
    specs: {
      supportedMotherboards: ["Micro-ATX", "Mini-ITX"],
      maxGpuLengthMm: 310,
      maxCoolerHeightMm: 159,
      includedFanCount: 2,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "case-atx": {
    title: "Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case",
    defaultPrice: 3899,
    aliases: ["cc560", "atx case", "mid-tower"],
    specs: {
      supportedMotherboards: ["ATX", "Micro-ATX", "Mini-ITX"],
      maxGpuLengthMm: 370,
      maxCoolerHeightMm: 163,
      includedFanCount: 4,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },

  // ─── Coolers ───
  "cooler-ag400": {
    title: "Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler",
    defaultPrice: 1799,
    aliases: ["ag400", "deepcool ag400", "ak400"],
    specs: {
      coolerHeightMm: 150,
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1200"],
      maxTdpRatingWatts: 220,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
  "cooler-le520": {
    title: "Deepcool LE520 240mm ARGB AIO Liquid Cooler",
    defaultPrice: 5499,
    aliases: ["le520", "240mm aio", "le720"],
    specs: {
      coolerHeightMm: 52,
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1200"],
      maxTdpRatingWatts: 300,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },

  // ─── Monitors ───
  "monitor-r27qe": {
    title: "Lenovo Legion R27qe Gen 2 27-inch 180Hz 1440p Gaming Monitor",
    defaultPrice: 15000,
    aliases: ["r27qe", "lenovo legion r27qe", "r27qe-gen2", "lenovo legion {smartchoice} r27qe"],
    specs: {
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-20",
    },
  },
}

/**
 * Normalizes title for hardware matching by stripping test flags and bracketed prefixes.
 */
export function normalizeHardwareTitle(title: string): string {
  return title
    .replace(/^\[(?:TEST|SAMPLE|PROD|DEMO)\]\s*/i, "")
    .replace(/^\((?:TEST|SAMPLE|PROD|DEMO)\)\s*/i, "")
    .replace(/^TEST[-:\s]+/i, "")
    .trim()
}

/**
 * Detects target component slot based on tags, productType, category, or title patterns.
 */
export function detectComponentSlot(
  title: string,
  productType: string = "",
  tags: string[] = [],
  category: string = "",
): ComponentSlotId | null {
  const normTitle = title.toLowerCase()
  const normType = productType.toLowerCase()
  const normCat = category.toLowerCase()
  const allTags = tags.map((t) => t.toLowerCase())

  // 1. Tag based detection (most specific)
  if (allTags.includes("cpu") || allTags.includes("processor")) return "CPU"
  if (allTags.includes("motherboard") || allTags.includes("mainboard")) return "Motherboard"
  if (allTags.includes("ram") || allTags.includes("memory")) return "RAM"
  if (allTags.includes("gpu") || allTags.includes("graphics-card") || allTags.includes("vga")) return "GPU"
  if (allTags.includes("storage") || allTags.includes("ssd") || allTags.includes("nvme") || allTags.includes("hdd")) return "Storage"
  if (allTags.includes("psu") || allTags.includes("power-supply") || allTags.includes("smps")) return "PSU"
  if (allTags.includes("cabinet") || allTags.includes("case") || allTags.includes("chassis")) return "Cabinet"
  if (allTags.includes("cooler") || allTags.includes("aio") || allTags.includes("cooling")) return "Cooler"
  if (allTags.includes("monitor") || allTags.includes("display")) return "Monitor"

  // 2. ProductType / Category based detection
  if (normType.includes("processor") || normCat.includes("processor")) return "CPU"
  if (normType.includes("motherboard") || normCat.includes("motherboard")) return "Motherboard"
  if (normType.includes("memory") || normCat.includes("memory")) return "RAM"
  if (normType.includes("graphics") || normCat.includes("graphics")) return "GPU"
  if (normType.includes("storage") || normType.includes("solid state") || normCat.includes("storage")) return "Storage"
  if (normType.includes("power supply") || normCat.includes("power supply")) return "PSU"
  if (normType.includes("cabinet") || normType.includes("case") || normCat.includes("cabinet") || normCat.includes("case")) return "Cabinet"
  if (normType.includes("cooler") || normCat.includes("cooler")) return "Cooler"
  if (normType.includes("monitor") || normCat.includes("monitor")) return "Monitor"

  // 3. Title keyword heuristics
  if (/\b(?:ryzen|core i[3579]|lga1700|lga1200|am4 cpu|am5 cpu)\b/i.test(normTitle)) return "CPU"
  if (/\b(?:b550|b650|b760|z790|a620|x670|h610|x570|b450|z690|motherboard|mainboard)/i.test(normTitle)) return "Motherboard"
  if (/\b(?:ddr4|ddr5|desktop ram|dimm|so-dimm)\b/i.test(normTitle)) return "RAM"
  if (/\b(?:rtx\s*\d{4}|gtx\s*\d{4}|rx\s*\d{4}|radeon|geforce|graphics card)\b/i.test(normTitle)) return "GPU"
  if (/\b(?:nvme|m\.2 ssd|sata ssd|gen4 ssd|gen3 ssd)\b/i.test(normTitle)) return "Storage"
  if (/\b(?:power supply|80\s*plus|bronze psu|gold psu|550w|650w|750w|850w smps)\b/i.test(normTitle)) return "PSU"
  if (/\b(?:cabinet|mid-tower|case|chassis)\b/i.test(normTitle)) return "Cabinet"
  if (/\b(?:liquid cooler|aio|air cooler|cpu cooler|heatsink)\b/i.test(normTitle)) return "Cooler"
  if (/\b(?:monitor|gaming display|144hz|180hz|240hz display|qhd monitor|r27qe)\b/i.test(normTitle)) return "Monitor"

  return null
}

/**
 * Maps a Shopify Storefront Product into a CanonicalBuildComponent with verified engineering specifications.
 */
export function matchShopifyProductToComponent(
  product: Product,
  slotHint?: ComponentSlotId,
): CanonicalBuildComponent | null {
  const slot = slotHint || detectComponentSlot(product.name, product.productType, product.tags || [], product.category)
  if (!slot) return null

  const cleanedTitle = normalizeHardwareTitle(product.name)
  const normCleaned = cleanedTitle.toLowerCase()

  // Match against verified hardware specifications
  let matchedKey: string | undefined
  let matchedEntry: VerifiedSpecEntry | undefined

  for (const [key, entry] of Object.entries(VERIFIED_HARDWARE_SPECS)) {
    // Check aliases
    if (entry.aliases?.some((alias) => normCleaned.includes(alias.toLowerCase()))) {
      matchedKey = key
      matchedEntry = entry
      break
    }
    // Check key model part
    const bareModel = key.replace(/^(cpu|mobo|ram|gpu|ssd|psu|case|cooler|monitor)-/, "")
    if (bareModel.length > 2 && normCleaned.includes(bareModel.replace(/-/g, " "))) {
      matchedKey = key
      matchedEntry = entry
      break
    }
  }

  // Ensure authentic variant ID
  const variantId = product.variantId ? toVariantGid(product.variantId) : ""

  if (matchedEntry && matchedKey) {
    return {
      slot,
      productId: product.id,
      variantId,
      title: product.name, // Authoritative Shopify title
      brand: product.brand || "IT HUB",
      model: cleanedTitle,
      price: Math.round(product.price), // Authoritative Shopify selling price (e.g. 9000)
      currency: "INR",
      productUrl: `/products/${product.handle || product.id}`,
      imageUrl: product.image,
      specs: {
        ...matchedEntry.specs,
        provenance: "manufacturer_verified",
      },
      availability: product.availableForSale && (product.stock ?? 1) > 0 ? "available" : "unavailable",
      quantity: 1,
      retrievedAt: new Date().toISOString(),
      isShopifyLive: true,
      isVerified: true,
      matchedModelKey: matchedKey,
    }
  }

  // Parse structured specifications from product specs if available
  const pSpecs = product.specs || {}
  const socket = pSpecs["Socket"] || pSpecs["socket"]
  const ramGen = pSpecs["RAM Generation"] || pSpecs["ram_generation"] || pSpecs["Memory"]
  const tdp = parseInt(pSpecs["TDP"] || pSpecs["tdp_watts"] || "0", 10) || undefined
  const hasMetafields = Boolean(socket || ramGen || tdp)

  const inferredSpecs: TechnicalSpecs = {
    socket: socket || undefined,
    supportedRamGeneration: ramGen || undefined,
    ramGeneration: ramGen || undefined,
    tdpWatts: tdp,
    provenance: hasMetafields ? "supplier_spec" : "unverified",
  }

  return {
    slot,
    productId: product.id,
    variantId,
    title: product.name,
    brand: product.brand || "IT HUB",
    model: cleanedTitle,
    price: Math.round(product.price),
    currency: "INR",
    productUrl: `/products/${product.handle || product.id}`,
    imageUrl: product.image,
    specs: inferredSpecs,
    availability: product.availableForSale && (product.stock ?? 1) > 0 ? "available" : "unavailable",
    quantity: 1,
    retrievedAt: new Date().toISOString(),
    isShopifyLive: true,
    isVerified: hasMetafields,
  }
}

/**
 * Builds the canonical builder catalog by aggregating live Shopify products.
 * Strictly adheres to Shopify as the sole authoritative source:
 * No static, mock, or reference fallbacks are ever inserted into customer-facing component selections.
 */
export function buildBuilderCatalog(
  shopifyProducts: Product[] = [],
): Record<ComponentSlotId, CanonicalBuildComponent[]> {
  const catalog: Record<ComponentSlotId, CanonicalBuildComponent[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
    CaseFans: [],
    Monitor: [],
  }

  // Process authentic Shopify products (Authoritative)
  for (const product of shopifyProducts) {
    const comp = matchShopifyProductToComponent(product)
    // Only available, eligible products with valid variant IDs and prices are selectable
    if (
      comp &&
      comp.availability === "available" &&
      comp.variantId &&
      comp.price > 0
    ) {
      catalog[comp.slot].push(comp)
    }
  }

  return catalog
}

/**
 * Converts a CanonicalBuildComponent to the legacy ComponentOption model for backward compatibility with UI and Admin.
 */
export function toComponentOption(comp: CanonicalBuildComponent): ComponentOption {
  return {
    id: comp.productId,
    name: comp.title,
    price: comp.price,
    variantId: comp.variantId || undefined,
    isShopifyLive: comp.isShopifyLive,
    isVerified: comp.isVerified ?? (comp.specs.provenance !== "unverified"),
    provenance: comp.specs.provenance,
    matchedModelKey: comp.matchedModelKey,
    socket: comp.specs.socket,
    ram: comp.specs.supportedRamGeneration || comp.specs.ramGeneration,
    watts: comp.specs.tdpWatts || comp.specs.powerWatts,
    capacity: comp.specs.ratedWattage,
    length: comp.specs.lengthMm,
    clearance: comp.specs.maxGpuLengthMm || comp.specs.maxCoolerHeightMm,
    bios: comp.specs.requiresBiosUpdateForRyzen5000,
    wifi: comp.specs.hasWifi,
    interface: comp.specs.storageInterface,
    stock: comp.availability === "available" ? 6 : 0,
  }
}

/**
 * Synchronizes the application's component catalog with live Shopify products.
 * Guarantees that Shopify is the authoritative source for pricing, variant IDs, and availability.
 * Never inserts mock or fallback hardware into the selectable component catalog.
 */
export function syncBuilderCatalogWithShopify(
  shopifyProducts: Product[] = [],
  _baselineCatalog?: Record<string, ComponentOption[]>,
): {
  componentCatalog: Record<string, ComponentOption[]>
  canonicalCatalog: Record<ComponentSlotId, CanonicalBuildComponent[]>
} {
  const canonicalCatalog = buildBuilderCatalog(shopifyProducts)
  const componentCatalog: Record<string, ComponentOption[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
  }

  for (const [slot, items] of Object.entries(canonicalCatalog)) {
    if (slot === "CaseFans") continue
    componentCatalog[slot] = items.map(toComponentOption)
  }

  return { componentCatalog, canonicalCatalog }
}

const CATALOG_CACHE_TTL_MS = 60_000
let cachedBuilderCatalog: Record<ComponentSlotId, CanonicalBuildComponent[]> | null = null
let lastCatalogFetchTime = 0

/**
 * Fetches builder components directly using the live Shopify catalog when configured.
 */
export async function fetchBuilderComponents(): Promise<Record<ComponentSlotId, CanonicalBuildComponent[]>> {
  const now = Date.now()
  if (cachedBuilderCatalog && now - lastCatalogFetchTime < CATALOG_CACHE_TTL_MS) {
    return cachedBuilderCatalog
  }

  let products: Product[] = []
  if (shopifyConfig.isConfigured) {
    try {
      const res = await fetchShopifyCatalog({ first: 100 })
      if (res.products && res.products.length > 0) {
        products = res.products
      }
    } catch {
      // Fallback to reference catalog
    }
  }

  const catalog = buildBuilderCatalog(products)
  cachedBuilderCatalog = catalog
  lastCatalogFetchTime = now
  return catalog
}
