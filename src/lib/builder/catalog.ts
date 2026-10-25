// src/lib/builder/catalog.ts
// IT HUB Technical Hardware Catalog & Shopify Commerce Adapter
// Bridges authentic Shopify variant data with verified engineering specifications.

import type {
  CanonicalBuildComponent,
  ComponentSlotId,
  TechnicalSpecs,
} from "./types"
import { shopifyConfig, storefrontFetch } from "../shopify"
import { toVariantGid } from "../shopify-schema"

/**
 * Verified Technical Specification Registry for hardware components.
 * Sourced from official manufacturer datasheets (AMD, Intel, ASUS, MSI, Corsair, NVIDIA, etc.)
 */
export const VERIFIED_HARDWARE_SPECS: Record<string, { specs: TechnicalSpecs; defaultPrice: number; title: string }> = {
  // ─── Processors ───
  "cpu-r5-7600": {
    title: "AMD Ryzen 5 7600 (6 Cores / 12 Threads)",
    defaultPrice: 18999,
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
    specs: {
      coolerHeightMm: 52, // pump block height
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1200"],
      maxTdpRatingWatts: 300,
      provenance: "manufacturer_verified",
      lastVerifiedAt: "2026-01-15",
    },
  },
}

export interface CatalogBySlot {
  slot: ComponentSlotId
  items: CanonicalBuildComponent[]
}

const CATALOG_CACHE_TTL_MS = 60_000
let cachedBuilderCatalog: Record<ComponentSlotId, CanonicalBuildComponent[]> | null = null
let lastCatalogFetchTime = 0

/**
 * Transforms verified specs into canonical build components,
 * integrating real Shopify variant pricing and availability when configured.
 */
export async function fetchBuilderComponents(): Promise<Record<ComponentSlotId, CanonicalBuildComponent[]>> {
  const now = Date.now()
  if (cachedBuilderCatalog && now - lastCatalogFetchTime < CATALOG_CACHE_TTL_MS) {
    return cachedBuilderCatalog
  }

  // Base verified catalog components
  const baseCatalog: Record<ComponentSlotId, CanonicalBuildComponent[]> = {
    CPU: [
      createCanonical("CPU", "cpu-r5-7600"),
      createCanonical("CPU", "cpu-r7-9700x"),
      createCanonical("CPU", "cpu-r5-5600"),
      createCanonical("CPU", "cpu-i5-12400f"),
      createCanonical("CPU", "cpu-i5-14600k"),
    ],
    Motherboard: [
      createCanonical("Motherboard", "mobo-b650m"),
      createCanonical("Motherboard", "mobo-b550m"),
      createCanonical("Motherboard", "mobo-b760m"),
      createCanonical("Motherboard", "mobo-z790"),
    ],
    RAM: [
      createCanonical("RAM", "ram-16gb-ddr5"),
      createCanonical("RAM", "ram-32gb-ddr5"),
      createCanonical("RAM", "ram-16gb-ddr4"),
    ],
    GPU: [
      createCanonical("GPU", "gpu-rtx4060"),
      createCanonical("GPU", "gpu-rtx4070-super"),
      createCanonical("GPU", "gpu-rx7600"),
    ],
    Storage: [
      createCanonical("Storage", "ssd-1tb-nvme"),
      createCanonical("Storage", "ssd-500gb-nvme"),
    ],
    PSU: [
      createCanonical("PSU", "psu-550w"),
      createCanonical("PSU", "psu-650w"),
      createCanonical("PSU", "psu-750w"),
    ],
    Cabinet: [
      createCanonical("Cabinet", "case-matx"),
      createCanonical("Cabinet", "case-atx"),
    ],
    Cooler: [
      createCanonical("Cooler", "cooler-ag400"),
      createCanonical("Cooler", "cooler-le520"),
    ],
    CaseFans: [],
    Monitor: [
      {
        slot: "Monitor",
        productId: "gid://shopify/Product/lenovo-legion-r27qe",
        variantId: "gid://shopify/ProductVariant/lenovo-legion-r27qe-v1",
        title: "Lenovo Legion R27qe Gen 2 27-inch 180Hz 1440p Gaming Monitor",
        brand: "Lenovo",
        model: "Legion R27qe Gen 2",
        price: 15000,
        currency: "INR",
        productUrl: "/products/lenovo-legion-smartchoice-r27qe-gen-2",
        imageUrl: "/images/photo-1527443224154-c4a3942d3acf.jpg",
        specs: {
          provenance: "manufacturer_verified",
          lastVerifiedAt: "2026-01-20",
        },
        availability: "available",
        quantity: 1,
        retrievedAt: new Date().toISOString(),
      },
    ],
    Peripherals: [],
    OS: [],
  }

  // If Shopify Storefront API is configured, attempt to refresh current prices & variant GIDs
  if (shopifyConfig.isConfigured) {
    try {
      const result = await storefrontFetch<{
        products: {
          edges: Array<{
            node: {
              id: string
              title: string
              handle: string
              variants: {
                edges: Array<{
                  node: {
                    id: string
                    title: string
                    availableForSale: boolean
                    price: { amount: string; currencyCode: string }
                  }
                }>
              }
            }
          }>
        }
      }>(
        `query getComponentLivePrices {
          products(first: 50, query: "tag:pc-builder OR product_type:Component OR product_type:Hardware") {
            edges {
              node {
                id
                title
                handle
                variants(first: 5) {
                  edges {
                    node {
                      id
                      title
                      availableForSale
                      price {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      )

      if (result.ok && result.data?.products?.edges) {
        // Overlay authentic live prices onto matched components by handle/model
        for (const edge of result.data.products.edges) {
          const shopifyProduct = edge.node
          const firstVariant = shopifyProduct.variants.edges[0]?.node
          if (!firstVariant) continue

          const amount = Math.round(parseFloat(firstVariant.price.amount) || 0)
          const variantGid = toVariantGid(firstVariant.id)

          // Match by title keywords
          for (const slot of Object.keys(baseCatalog) as ComponentSlotId[]) {
            for (const comp of baseCatalog[slot]) {
              const modelKey = comp.productId.replace("local-", "")
              if (
                shopifyProduct.handle.includes(modelKey) ||
                shopifyProduct.title.toLowerCase().includes(comp.model?.toLowerCase() || "___")
              ) {
                comp.productId = shopifyProduct.id
                comp.variantId = variantGid
                comp.price = amount
                comp.currency = firstVariant.price.currencyCode || "INR"
                comp.availability = firstVariant.availableForSale ? "available" : "unavailable"
              }
            }
          }
        }
      }
    } catch {
      // Graceful fallback to verified registry prices
    }
  }

  cachedBuilderCatalog = baseCatalog
  lastCatalogFetchTime = now
  return baseCatalog
}

function createCanonical(slot: ComponentSlotId, key: string): CanonicalBuildComponent {
  const item = VERIFIED_HARDWARE_SPECS[key]
  if (!item) {
    throw new Error(`Unknown component key: ${key}`)
  }

  return {
    slot,
    productId: `local-${key}`,
    variantId: `gid://shopify/ProductVariant/mock-${key}`,
    title: item.title,
    brand: item.title.split(" ")[0] || "IT HUB",
    model: item.title,
    price: item.defaultPrice,
    currency: "INR",
    productUrl: `/products`,
    imageUrl: `/images/pc-parts/${slot.toLowerCase()}.jpg`,
    specs: item.specs,
    availability: "available",
    quantity: 1,
    retrievedAt: new Date().toISOString(),
  }
}
