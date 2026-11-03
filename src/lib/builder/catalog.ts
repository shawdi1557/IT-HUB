// src/lib/builder/catalog.ts
// IT HUB Technical Hardware Catalog & Shopify Commerce Adapter
// Bridges authentic Shopify variant data with verified engineering specifications.

import type {
  CanonicalBuildComponent,
  ComponentSlotId,
  TechnicalSpecs,
  HardwareProductRecord,
  HardwareVariantRecord,
  SpecVerificationStatus,
} from "./types";
import type { Product, ComponentOption } from "../../data/catalog";
import { shopifyConfig, fetchAllShopifyProducts } from "../shopify";
import { toVariantGid } from "../shopify-schema";
import { supabase } from "../supabase";

export interface DatabaseHardwareMapping {
  product: Partial<HardwareProductRecord>;
  variant: Partial<HardwareVariantRecord>;
}

// In-memory registry for database-synced hardware specifications
const registeredDatabaseSpecs: Map<string, DatabaseHardwareMapping> = new Map();

export function registerDatabaseHardwareSpec(
  variantId: string,
  mapping: DatabaseHardwareMapping,
): void {
  registeredDatabaseSpecs.set(toVariantGid(variantId), mapping);
}

export function clearRegisteredDatabaseSpecs(): void {
  registeredDatabaseSpecs.clear();
}

export async function loadDatabaseHardwareSpecs(): Promise<void> {
  if (!supabase) return;
  try {
    const { data: variants, error: vErr } = await supabase
      .from("hardware_variants")
      .select("*, hardware_products(*)")
      .neq("verification_status", "quarantined_rejected");

    if (vErr || !variants) return;

    for (const v of variants) {
      const p = v.hardware_products as HardwareProductRecord;
      if (p && p.verification_status !== "quarantined_rejected") {
        registeredDatabaseSpecs.set(v.shopify_variant_id, { product: p, variant: v });
      }
    }
  } catch {
    // Non-blocking fallback to local verified registry
  }
}

export interface VerifiedSpecEntry {
  specs: TechnicalSpecs;
  defaultPrice: number;
  title: string;
  aliases?: string[];
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
    aliases: ["ryzen 5 7600", "r5 7600", "7600"],
    specs: {
      performance: {
        architecture: "Zen 4",
        figures: {
          performanceCores: 6,
          totalCores: 6,
          threads: 12,
          maxBoostMhz: 5100,
          cacheMb: 32,
        },
        sourceUrl:
          "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html",
        checkedOn: "2026-11-03",
      },
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
      performance: {
        architecture: "Zen 5",
        figures: {
          performanceCores: 8,
          totalCores: 8,
          threads: 16,
          maxBoostMhz: 5500,
          cacheMb: 32,
        },
        sourceUrl:
          "https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9700x.html",
        checkedOn: "2026-11-03",
      },
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
    aliases: ["ryzen 5 5600", "r5 5600", "5600"],
    specs: {
      performance: {
        architecture: "Zen 3",
        figures: {
          performanceCores: 6,
          totalCores: 6,
          threads: 12,
          maxBoostMhz: 4400,
          cacheMb: 32,
        },
        sourceUrl:
          "https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600.html",
        checkedOn: "2026-11-03",
      },
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
    aliases: ["core i5-12400f", "i5 12400f", "12400f"],
    specs: {
      performance: {
        architecture: "Alder Lake",
        figures: {
          performanceCores: 6,
          totalCores: 6,
          threads: 12,
          maxBoostMhz: 4400,
          cacheMb: 18,
        },
        sourceUrl:
          "https://www.intel.com/content/www/us/en/products/sku/134587/intel-core-i512400f-processor-18m-cache-up-to-4-40-ghz/specifications.html",
        checkedOn: "2026-11-03",
      },
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
    aliases: ["core i5-14600k", "i5 14600k", "14600k"],
    specs: {
      performance: {
        architecture: "Raptor Lake",
        figures: {
          performanceCores: 6,
          totalCores: 14,
          threads: 20,
          maxBoostMhz: 5300,
          cacheMb: 24,
        },
        sourceUrl:
          "https://www.intel.com/content/www/us/en/products/sku/236799/intel-core-i5-processor-14600k-24m-cache-up-to-5-30-ghz/specifications.html",
        checkedOn: "2026-11-03",
      },
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
    aliases: ["pro b650m-p", "b650m-p"],
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
    aliases: ["prime b550m-a", "b550m-a"],
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
    aliases: ["b760m bomber"],
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
    aliases: ["mag z790", "z790 tomahawk"],
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
    aliases: [
      "vengeance 16gb (1x16gb) ddr5",
      "16gb ddr5",
      "16g ddr5",
      "ddr5 16gb",
      "5200mhz",
      "5200",
    ],
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
    aliases: [
      "vengeance 32gb (2x16gb) ddr5",
      "32gb ddr5",
      "32g ddr5",
      "ddr5 32gb",
      "6000mhz",
      "6000",
    ],
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
    aliases: [
      "vengeance lpx 16gb (2x8gb) ddr4",
      "16gb ddr4",
      "16g ddr4",
      "ddr4 16gb",
      "3200mhz",
      "3200",
      "16d4",
    ],
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
    aliases: ["rtx 4060 twin edge", "rtx 4060 8gb twin edge"],
    specs: {
      performance: {
        architecture: "Ada Lovelace",
        figures: { shaderUnits: 3072, boostClockMhz: 2460, vramGb: 8, memoryBusBits: 128 },
        sourceUrl: "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-4060ti/",
        checkedOn: "2026-11-03",
      },
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
    aliases: ["rtx 4070 super windforce"],
    specs: {
      performance: {
        architecture: "Ada Lovelace",
        figures: { shaderUnits: 7168, boostClockMhz: 2480, vramGb: 12, memoryBusBits: 192 },
        sourceUrl: "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-family/",
        checkedOn: "2026-11-03",
      },
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
    aliases: ["rx 7600 challenger"],
    specs: {
      performance: {
        architecture: "RDNA 3",
        figures: { shaderUnits: 2048, boostClockMhz: 2655, vramGb: 8, memoryBusBits: 128 },
        sourceUrl:
          "https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7600.html",
        checkedOn: "2026-11-03",
      },
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
    aliases: ["500gb nvme", "500gb ssd", "nv2 500gb", "500gb m.2"],
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
      pciePowerConnectors: ["6+2-pin", "6+2-pin"],
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
      pciePowerConnectors: ["6+2-pin", "6+2-pin"],
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
    aliases: ["ice-100", "mini mesh", "matx case"],
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
    aliases: ["ag400", "deepcool ag400"],
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
    aliases: ["le520", "240mm aio"],
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
};

const SPEC_ENTRY_SLOTS: Record<string, ComponentSlotId> = {
  cpu: "CPU",
  mobo: "Motherboard",
  ram: "RAM",
  gpu: "GPU",
  ssd: "Storage",
  psu: "PSU",
  case: "Cabinet",
  cooler: "Cooler",
  monitor: "Monitor",
};

/** Words that describe a kind of part, or a capacity or speed, without naming any one model. */
const GENERIC_SPEC_WORD =
  /^(?:\d+(?:\.\d+)?(?:w|g|gb|tb|mhz|mm)?|watt|ddr[45]|nvme|ssd|m\.2|case|matx|atx|mid-tower|aio)$/;

/**
 * Whether a registry term can identify one model. "650W", "1TB SSD", "B550M" or "RTX 4060" fits many
 * products from many makers, so it can't justify giving a product another model's verified
 * specifications. A bare number names a model only for CPUs (5600). For the rest it's a capacity or
 * speed.
 */
function identifiesAModel(term: string, slot: ComponentSlotId): boolean {
  const words = term.toLowerCase().split(/\s+/);
  if (!words.every((word) => GENERIC_SPEC_WORD.test(word))) return true;
  return slot === "CPU" && words.length === 1 && /^\d+$/.test(words[0]);
}

/**
 * Whether a lowercase title contains a term as a whole word, so "5600" isn't found in "5600mb/s" or
 * "ant" in "warranty". "RTX 4060" doesn't match "RTX 4060 Ti", which is a different card.
 */
function titleHasTerm(title: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?![a-z0-9])(?!\\s+(?:ti|super)\\b)`).test(title);
}

/**
 * The chip maker's published board power and recommended power supply. These belong to the chip,
 * unlike a card's length or cooler, so a title naming only the chip can state these and nothing else.
 */
const GPU_CHIP_POWER: Array<{ chip: string; watts: number; recommendedPsuWatts: number }> = [
  { chip: "rtx 4070 super", watts: 220, recommendedPsuWatts: 650 },
  { chip: "rtx 4060", watts: 115, recommendedPsuWatts: 550 },
  { chip: "rx 7600", watts: 165, recommendedPsuWatts: 550 },
];

/** A list from a Shopify metafield, such as "ATX, Micro-ATX". */
function statedList(value: unknown): string[] | undefined {
  const items = String(value ?? "")
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/** True or false only when a Shopify metafield says so. */
function statedBoolean(value: unknown): boolean | undefined {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["true", "yes", "1"].includes(text)) return true;
  if (["false", "no", "0"].includes(text)) return false;
  return undefined;
}

/** A positive number from a Shopify metafield or tag value, otherwise undefined. */
function positiveNumber(value: unknown): number | undefined {
  const parsed = parseInt(String(value ?? ""), 10);
  return parsed > 0 ? parsed : undefined;
}

/**
 * Normalizes title for hardware matching by stripping test flags and bracketed prefixes.
 */
export function normalizeHardwareTitle(title: string): string {
  return title
    .replace(/^\[(?:TEST|SAMPLE|PROD|DEMO)\]\s*/i, "")
    .replace(/^\((?:TEST|SAMPLE|PROD|DEMO)\)\s*/i, "")
    .replace(/^TEST[-:\s]+/i, "")
    .trim();
}

/** Complete devices and their accessories. A laptop's specs in its title don't make it a part. */
const NOT_A_PC_COMPONENT =
  /\b(?:laptops?|notebooks?|smart\s?phones?|mobiles?|phones?|tablets?|ipad|iphone|printers?|toners?|ink|cartridges?|desktops?\s+pc|all[- ]in[- ]one\s+pc|covers?|earbuds|headphones|chargers?)\b/;

/** Storage that plugs in from outside the case. */
const EXTERNAL_STORAGE =
  /\b(?:external|portable|usb|pen\s?drive|flash\s?drive|memory\s?card|micro\s?sd|sd\s?card)\b/;

/**
 * Detects target component slot based on tags, productType, category, or title patterns.
 */
export function detectComponentSlot(
  title: string,
  productType: string = "",
  tags: string[] = [],
  category: string = "",
): ComponentSlotId | null {
  const normTitle = title.toLowerCase();
  const normType = productType.toLowerCase();
  const normCat = category.toLowerCase();
  const allTags = tags.map((t) => t.toLowerCase());

  // A laptop or phone is never a component, whatever its tags or specifications say. A title alone
  // doesn't decide this, because "Laptop Cooler" is decided below and "SO-DIMM" RAM is real RAM.
  if (NOT_A_PC_COMPONENT.test(normType) || NOT_A_PC_COMPONENT.test(normCat)) return null;
  if (EXTERNAL_STORAGE.test(normTitle) || EXTERNAL_STORAGE.test(normCat)) return null;

  // 1. Tag based detection (most specific)
  if (allTags.includes("cpu") || allTags.includes("processor")) return "CPU";
  if (allTags.includes("motherboard") || allTags.includes("mainboard")) return "Motherboard";
  if (allTags.includes("ram") || allTags.includes("memory")) return "RAM";
  if (allTags.includes("gpu") || allTags.includes("graphics-card") || allTags.includes("vga"))
    return "GPU";
  if (
    allTags.includes("storage") ||
    allTags.includes("ssd") ||
    allTags.includes("nvme") ||
    allTags.includes("hdd")
  )
    return "Storage";
  if (allTags.includes("psu") || allTags.includes("power-supply") || allTags.includes("smps"))
    return "PSU";
  if (allTags.includes("cabinet") || allTags.includes("case") || allTags.includes("chassis"))
    return "Cabinet";
  if (allTags.includes("cooler") || allTags.includes("aio") || allTags.includes("cooling"))
    return "Cooler";
  if (allTags.includes("monitor") || allTags.includes("display")) return "Monitor";

  // 2. ProductType / Category based detection
  if (normType.includes("processor") || normCat.includes("processor")) return "CPU";
  if (normType.includes("motherboard") || normCat.includes("motherboard")) return "Motherboard";
  if (normType.includes("memory") || normCat.includes("memory") || normCat === "ram") return "RAM";
  if (
    normType.includes("graphics") ||
    normCat.includes("graphics") ||
    normCat.includes("video card")
  )
    return "GPU";
  if (
    normType.includes("storage") ||
    normType.includes("solid state") ||
    normCat.includes("storage") ||
    normCat.includes("solid state") ||
    normCat.includes("hard drive")
  )
    return "Storage";
  if (normType.includes("power suppl") || normCat.includes("power suppl")) return "PSU";
  if (
    normType.includes("cabinet") ||
    normType.includes("case") ||
    normCat.includes("cabinet") ||
    normCat.includes("case")
  )
    return "Cabinet";
  if (normType.includes("cooler") || normCat.includes("cooler")) return "Cooler";
  if (normType.includes("monitor") || normCat.includes("monitor")) return "Monitor";

  // 3. Title keyword heuristics
  if (
    NOT_A_PC_COMPONENT.test(normTitle) &&
    !/\b(?:so-?dimm|laptop\s+(?:ram|memory))\b/.test(normTitle)
  )
    return null;
  if (/\b(?:ryzen|core i[3579]|lga1700|lga1200|am4 cpu|am5 cpu)\b/i.test(normTitle)) return "CPU";
  if (
    /\b(?:b550|b650|b760|z790|a620|x670|h610|x570|b450|z690|motherboard|mainboard)/i.test(normTitle)
  )
    return "Motherboard";
  if (
    /\b(?:nvme|m\.2 ssd|sata ssd|gen4 ssd|gen3 ssd|internal ssd|ssd|hard drive)\b/i.test(normTitle)
  )
    return "Storage";
  if (/\b(?:ddr4|ddr5|desktop ram|dimm|so-dimm)\b/i.test(normTitle)) return "RAM";
  if (/\b(?:rtx\s*\d{4}|gtx\s*\d{4}|rx\s*\d{4}|radeon|geforce|graphics card)\b/i.test(normTitle))
    return "GPU";
  if (/\b(?:power supply|80\s*plus|psu|smps|550w|650w|750w)\b/i.test(normTitle)) return "PSU";
  if (/\b(?:cabinet|mid-tower|case|chassis)\b/i.test(normTitle)) return "Cabinet";
  if (/\b(?:liquid cooler|aio|cpu air cooler|cpu cooler|heatsink)\b/i.test(normTitle))
    return "Cooler";
  if (/\b(?:monitor|gaming display|144hz|180hz|240hz display|qhd monitor|r27qe)\b/i.test(normTitle))
    return "Monitor";

  return null;
}

/**
 * Maps a Shopify Storefront Product into a CanonicalBuildComponent with verified engineering specifications.
 */
export function matchShopifyProductToComponent(
  product: Product,
  slotHint?: ComponentSlotId,
): CanonicalBuildComponent | null {
  const slot =
    slotHint ||
    detectComponentSlot(product.name, product.productType, product.tags || [], product.category);
  if (!slot) return null;

  const cleanedTitle = normalizeHardwareTitle(product.name);
  const normCleaned = cleanedTitle.toLowerCase();

  // Ensure authentic variant ID
  const variantId = product.variantId ? toVariantGid(product.variantId) : "";

  // 1. Check Database Specification Registry
  if (variantId && registeredDatabaseSpecs.has(variantId)) {
    const { product: dbProd, variant: dbVar } = registeredDatabaseSpecs.get(variantId)!;

    // Strict Quarantine Check: If parent or variant is quarantined, block immediately
    if (
      dbProd.verification_status === "quarantined_rejected" ||
      dbVar.verification_status === "quarantined_rejected"
    ) {
      return null;
    }

    const isVerified =
      dbVar.verification_status === "verified_manufacturer" ||
      dbVar.verification_status === "verified_technician";

    const specs: TechnicalSpecs = {
      socket: dbProd.socket,
      formFactor: dbProd.form_factor,
      supportedRamGeneration: dbProd.memory_generation as any,
      ramGeneration: (dbVar.capacity_gb ? dbProd.memory_generation : undefined) as any,
      tdpWatts: dbVar.tdp_watts || dbProd.tdp_watts,
      ratedWattage: dbVar.rated_wattage,
      lengthMm: dbVar.length_mm,
      maxGpuLengthMm: dbProd.max_gpu_length_mm,
      maxCoolerHeightMm: dbProd.max_cooler_height_mm,
      coolerHeightMm: dbProd.cooler_height_mm,
      hasWifi: dbProd.has_wifi,
      includesCooler: dbProd.includes_stock_cooler,
      hasIntegratedGraphics: dbProd.has_integrated_graphics,
      storageInterface: dbProd.storage_interface as any,
      isLaptopSoDimm: dbVar.is_laptop_sodimm,
      capacityGb: dbVar.capacity_gb,
      speedMhz: dbVar.speed_mhz,
      provenance: dbVar.verification_status as any,
      lastVerifiedAt: dbVar.last_verified_at || dbProd.last_verified_at,
    };

    return {
      slot,
      productId: product.id,
      variantId,
      title: product.name,
      brand: dbProd.brand || product.brand || "",
      model: dbProd.model_family || cleanedTitle,
      price: Math.round(product.price),
      currency: "INR",
      productUrl: `/products/${product.handle || product.id}`,
      imageUrl: product.image,
      specs,
      availability:
        (product.availableForSale ?? true) && (product.stock ?? 1) > 0
          ? "available"
          : "unavailable",
      quantity: 1,
      retrievedAt: new Date().toISOString(),
      isShopifyLive: true,
      isVerified,
      matchedModelKey: `db-${dbProd.id || dbVar.id || variantId}`,
    };
  }

  // 2. Match against verified hardware specifications
  let matchedKey: string | undefined;
  let matchedEntry: VerifiedSpecEntry | undefined;

  // A title naming the other memory generation describes a different product from a registry entry,
  // even when the model name matches, so that entry's verified specifications don't apply to it.
  const statesDdr4 = titleHasTerm(normCleaned, "ddr4");
  const statesDdr5 = titleHasTerm(normCleaned, "ddr5");
  const titleGeneration = statesDdr4 === statesDdr5 ? undefined : statesDdr4 ? "DDR4" : "DDR5";

  for (const [key, entry] of Object.entries(VERIFIED_HARDWARE_SPECS)) {
    // Specifications only ever belong to the same kind of part.
    if (SPEC_ENTRY_SLOTS[key.split("-")[0]] !== slot) continue;

    const bareModel = key.replace(/^(cpu|mobo|ram|gpu|ssd|psu|case|cooler|monitor)-/, "");
    const keyNamesAModel = slot !== "GPU" && slot !== "Motherboard" && bareModel.length > 2;
    const terms = [...(entry.aliases || []), ...(keyNamesAModel ? [bareModel] : [])];
    const matches = terms.some((term) => {
      const normalized = term.toLowerCase().replace(/-/g, term === bareModel ? " " : "-");
      return identifiesAModel(normalized, slot) && titleHasTerm(normCleaned, normalized);
    });
    const entryGeneration = entry.specs.supportedRamGeneration || entry.specs.ramGeneration;
    if (titleGeneration && entryGeneration && titleGeneration !== entryGeneration) continue;
    if (matches) {
      matchedKey = key;
      matchedEntry = entry;
      break;
    }
  }

  // A graphics card's "GDDR5" says nothing about system memory.
  const usesPlatformSpecs = slot === "CPU" || slot === "Motherboard";
  const usesRamGeneration = usesPlatformSpecs || slot === "RAM";

  if (matchedEntry && matchedKey) {
    const specs = { ...matchedEntry.specs };

    return {
      slot,
      productId: product.id,
      variantId,
      title: product.name, // Authoritative Shopify title
      brand: product.brand || "",
      model: cleanedTitle,
      price: Math.round(product.price), // Authoritative Shopify selling price (e.g. 9000)
      currency: "INR",
      productUrl: `/products/${product.handle || product.id}`,
      imageUrl: product.image,
      specs: {
        ...specs,
        provenance: "manufacturer_verified",
      },
      availability:
        (product.availableForSale ?? true) && (product.stock ?? 1) > 0
          ? "available"
          : "unavailable",
      quantity: 1,
      retrievedAt: new Date().toISOString(),
      isShopifyLive: true,
      isVerified: true,
      matchedModelKey: matchedKey,
    };
  }

  // Parse structured specifications from product specs or tags/title
  const pSpecs = product.specs || {};
  const allTags = (product.tags || []).map((t: string) => t.toLowerCase());
  let socket = usesPlatformSpecs ? pSpecs["Socket"] || pSpecs["socket"] : undefined;
  if (!socket && usesPlatformSpecs) {
    if (
      allTags.includes("am5") ||
      normCleaned.includes("am5") ||
      normCleaned.includes("b650") ||
      normCleaned.includes("x670")
    )
      socket = "AM5";
    else if (
      allTags.includes("am4") ||
      normCleaned.includes("am4") ||
      normCleaned.includes("b550") ||
      normCleaned.includes("a520")
    )
      socket = "AM4";
    else if (
      allTags.includes("lga1700") ||
      allTags.includes("1700") ||
      normCleaned.includes("lga1700") ||
      normCleaned.includes("b760") ||
      normCleaned.includes("z790") ||
      normCleaned.includes("12400") ||
      normCleaned.includes("13400") ||
      normCleaned.includes("14400")
    )
      socket = "LGA1700";
  }

  let ramGen = usesRamGeneration
    ? pSpecs["RAM Generation"] || pSpecs["ram_generation"] || pSpecs["Memory"]
    : undefined;
  if (!ramGen && usesRamGeneration) {
    if (allTags.includes("ddr5") || titleHasTerm(normCleaned, "ddr5") || socket === "AM5")
      ramGen = "DDR5";
    else if (allTags.includes("ddr4") || titleHasTerm(normCleaned, "ddr4") || socket === "AM4")
      ramGen = "DDR4";
  }

  const statedTdp = positiveNumber(pSpecs["TDP"] || pSpecs["tdp_watts"] || pSpecs["watts"]);
  const chipSpecs =
    slot === "GPU" ? GPU_CHIP_POWER.find(({ chip }) => titleHasTerm(normCleaned, chip)) : undefined;
  const chipPower = chipSpecs?.watts;
  const tdp = statedTdp;

  // Only what Shopify states for this product. Anything it doesn't state stays unknown.
  const titleWatts = normCleaned.match(/(?:^|[^a-z0-9])(\d{3,4})\s*w(?:atts?)?(?![a-z0-9])/)?.[1];
  const ratedWattage =
    slot === "PSU" ? positiveNumber(pSpecs["capacity_watts"] || titleWatts) : undefined;
  const lengthMm = slot === "GPU" ? positiveNumber(pSpecs["gpu_length_mm"]) : undefined;
  const maxGpuLengthMm =
    slot === "Cabinet" ? positiveNumber(pSpecs["cabinet_clearance_mm"]) : undefined;
  const storageInterface =
    slot !== "Storage"
      ? undefined
      : pSpecs["storage_interface"] ||
        (titleHasTerm(normCleaned, "nvme")
          ? "M.2 NVMe"
          : titleHasTerm(normCleaned, "sata")
            ? "SATA SSD"
            : undefined);

  // RAM kits state their size in the title: "16GB (2x8GB)" or "2 x 8GB".
  const ramKit =
    slot === "RAM" ? normCleaned.match(/(?:^|[^0-9])(\d)\s*x\s*(\d{1,3})\s*gb(?![a-z0-9])/) : null;
  const ramTitleSize =
    slot === "RAM" ? normCleaned.match(/(?:^|[^0-9x])(\d{1,3})\s*gb(?![a-z0-9])/)?.[1] : undefined;
  const moduleCount =
    slot === "RAM"
      ? positiveNumber(pSpecs["ram_modules"] || (ramKit ? ramKit[1] : undefined))
      : undefined;
  const capacityGb =
    slot === "RAM"
      ? positiveNumber(
          pSpecs["ram_capacity_gb"] ||
            (ramKit ? Number(ramKit[1]) * Number(ramKit[2]) : ramTitleSize),
        )
      : undefined;
  const isLaptopSoDimm =
    slot === "RAM" &&
    (titleHasTerm(normCleaned, "so-dimm") ||
      titleHasTerm(normCleaned, "sodimm") ||
      titleHasTerm(normCleaned, "laptop"))
      ? true
      : undefined;

  const isBoard = slot === "Motherboard";
  const titleFormFactor = !isBoard
    ? undefined
    : /\b(?:micro[- ]?atx|m-?atx)\b/.test(normCleaned)
      ? "Micro-ATX"
      : /\bmini[- ]?itx\b/.test(normCleaned)
        ? "Mini-ITX"
        : /\be-?atx\b/.test(normCleaned)
          ? "E-ATX"
          : /\batx\b/.test(normCleaned)
            ? "ATX"
            : undefined;
  const formFactor = isBoard ? pSpecs["form_factor"] || titleFormFactor : undefined;
  const ramSlots = isBoard ? positiveNumber(pSpecs["ram_slots"]) : undefined;
  const maxRamCapacityGb = isBoard ? positiveNumber(pSpecs["max_ram_gb"]) : undefined;
  const m2Stated = isBoard ? String(pSpecs["m2_slots"] ?? "") : "";
  const sataStated = isBoard ? String(pSpecs["sata_ports"] ?? "") : "";

  const supportedMotherboards =
    slot === "Cabinet" ? statedList(pSpecs["supported_motherboards"]) : undefined;
  const maxCoolerHeightMm =
    slot === "Cabinet" ? positiveNumber(pSpecs["max_cooler_height_mm"]) : undefined;
  const coolerHeightMm = slot === "Cooler" ? positiveNumber(pSpecs["cooler_height_mm"]) : undefined;
  const supportedSockets = slot === "Cooler" ? statedList(pSpecs["supported_sockets"]) : undefined;
  const pciePowerConnectors = slot === "PSU" ? statedList(pSpecs["pcie_connectors"]) : undefined;
  const requiredPcieConnectors = slot === "GPU" ? statedList(pSpecs["pcie_connectors"]) : undefined;
  const hasIntegratedGraphics =
    slot === "CPU" ? statedBoolean(pSpecs["integrated_graphics"]) : undefined;
  // Only a processor can come with a cooler. For a processor, silence stays unknown.
  const includesCooler = slot === "CPU" ? statedBoolean(pSpecs["includes_cooler"]) : false;

  // A value from a Shopify metafield or tag is stated for this exact product. A value read from the
  // title is useful, but still shows as unverified.
  const statedInShopify = Boolean(
    pSpecs["Socket"] ||
    pSpecs["socket"] ||
    pSpecs["RAM Generation"] ||
    pSpecs["ram_generation"] ||
    pSpecs["Memory"] ||
    statedTdp ||
    pSpecs["capacity_watts"] ||
    lengthMm ||
    maxGpuLengthMm ||
    pSpecs["storage_interface"] ||
    pSpecs["form_factor"] ||
    ramSlots ||
    maxRamCapacityGb ||
    supportedMotherboards ||
    maxCoolerHeightMm ||
    coolerHeightMm ||
    supportedSockets ||
    pciePowerConnectors ||
    requiredPcieConnectors,
  );
  const hasMetafields = Boolean(
    socket ||
    ramGen ||
    tdp ||
    chipPower ||
    ratedWattage ||
    lengthMm ||
    maxGpuLengthMm ||
    storageInterface ||
    formFactor ||
    capacityGb,
  );

  // A tag counts as inference too: only a Shopify field states a value for this exact product.
  const statedSocket = pSpecs["Socket"] || pSpecs["socket"];
  const statedRamGen = pSpecs["RAM Generation"] || pSpecs["ram_generation"] || pSpecs["Memory"];
  const inferredFromTitle: (keyof TechnicalSpecs)[] = [
    ...(socket && !statedSocket ? (["socket"] as const) : []),
    ...(ramGen && !statedRamGen ? (["supportedRamGeneration", "ramGeneration"] as const) : []),
    ...(slot === "GPU" && chipPower && !statedTdp ? (["powerWatts"] as const) : []),
    ...(ratedWattage && !pSpecs["capacity_watts"] ? (["ratedWattage"] as const) : []),
    ...(storageInterface && !pSpecs["storage_interface"] ? (["storageInterface"] as const) : []),
    ...(formFactor && !pSpecs["form_factor"] ? (["formFactor"] as const) : []),
    ...(capacityGb && !pSpecs["ram_capacity_gb"] ? (["capacityGb"] as const) : []),
  ];

  const inferredSpecs: TechnicalSpecs = {
    inferredFromTitle: inferredFromTitle.length > 0 ? inferredFromTitle : undefined,
    socket: socket || undefined,
    supportedRamGeneration: ramGen || undefined,
    ramGeneration: ramGen || undefined,
    tdpWatts: tdp,
    powerWatts: slot === "GPU" ? tdp || chipPower : undefined,
    recommendedPsuWatts: chipSpecs?.recommendedPsuWatts,
    ratedWattage,
    lengthMm,
    maxGpuLengthMm,
    maxCoolerHeightMm,
    coolerHeightMm,
    supportedSockets,
    supportedMotherboards,
    storageInterface,
    formFactor,
    ramSlots,
    maxRamCapacityGb,
    m2SlotCount: m2Stated ? Number(m2Stated) : undefined,
    sataPortCount: sataStated ? Number(sataStated) : undefined,
    capacityGb,
    moduleCount,
    isLaptopSoDimm,
    pciePowerConnectors,
    requiredPcieConnectors,
    hasIntegratedGraphics,
    hasWifi: allTags.includes("wifi") || normCleaned.includes("wifi"),
    includesCooler,
    // Only the registry can say a value was checked. A product can't claim that about itself. A value
    // from a Shopify field is the supplier's statement, and one read from the title is weaker still.
    provenance: statedInShopify ? "supplier_spec" : hasMetafields ? "title_derived" : "unverified",
  };

  return {
    slot,
    productId: product.id,
    variantId,
    title: product.name,
    brand: product.brand || "",
    model: cleanedTitle,
    price: Math.round(product.price),
    currency: "INR",
    productUrl: `/products/${product.handle || product.id}`,
    imageUrl: product.image,
    specs: inferredSpecs,
    availability:
      (product.availableForSale ?? true) && (product.stock ?? 1) > 0 ? "available" : "unavailable",
    quantity: 1,
    retrievedAt: new Date().toISOString(),
    isShopifyLive: true,
    isVerified: statedInShopify,
  };
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
  };

  // Process authentic Shopify products (Authoritative)
  for (const product of shopifyProducts) {
    const comp = matchShopifyProductToComponent(product);
    // Only available, eligible products with valid variant IDs and prices are selectable
    if (comp && comp.availability === "available" && comp.variantId && comp.price > 0) {
      catalog[comp.slot].push(comp);
    }
  }

  return catalog;
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
    isVerified: comp.isVerified ?? comp.specs.provenance !== "unverified",
    provenance: comp.specs.provenance,
    matchedModelKey: comp.matchedModelKey,
    socket: comp.specs.socket,
    ram: comp.specs.supportedRamGeneration || comp.specs.ramGeneration,
    watts: comp.specs.tdpWatts || comp.specs.powerWatts,
    capacity: comp.specs.ratedWattage,
    length: comp.specs.lengthMm,
    clearance: comp.specs.maxGpuLengthMm,
    bios: comp.specs.requiresBiosUpdateForRyzen5000,
    wifi: comp.specs.hasWifi,
    interface: comp.specs.storageInterface,
    stock: comp.availability === "available" ? 6 : 0,
    includesCooler: comp.specs.includesCooler,
    hasIntegratedGraphics: comp.specs.hasIntegratedGraphics,
    specs: comp.specs,
    image: comp.imageUrl,
  };
}

export interface ReconciledBuildParts {
  parts: Record<string, ComponentOption>;
  /** Slots whose product isn't currently offered in the live catalogue. */
  unavailable: string[];
  /** Slots whose price moved since the build was saved. */
  priceChanged: string[];
}

/** A saved build may hold the engine's model or the builder's selection model. */
function asComponentOption(slot: string, part: any): ComponentOption {
  if (part && "productId" in part && !("id" in part)) {
    return toComponentOption({
      ...part,
      slot,
      specs: part.specs || {},
      availability: part.availability ?? "available",
    });
  }
  return part;
}

/**
 * Brings a saved or restored selection up to date with the live catalogue, which is the only source
 * of price and availability. A product no longer offered stays visible so the customer can replace
 * it, but marked out of stock. Until the catalogue has loaded, nothing can be concluded either way.
 */
export function reconcileBuildParts(
  parts: Record<string, any>,
  catalog: Record<string, ComponentOption[]>,
): ReconciledBuildParts {
  const result: ReconciledBuildParts = { parts: {}, unavailable: [], priceChanged: [] };
  const catalogLoaded = Object.values(catalog || {}).some((items) => items?.length > 0);

  for (const [slot, raw] of Object.entries(parts || {})) {
    if (!raw) continue;
    const part = asComponentOption(slot, raw);
    if (!catalogLoaded) {
      result.parts[slot] = part;
      continue;
    }
    const live = (catalog[slot] || []).find(
      (item) => item.id === part.id || Boolean(part.variantId && item.variantId === part.variantId),
    );
    if (!live) {
      result.parts[slot] = { ...part, stock: 0 };
      result.unavailable.push(slot);
      continue;
    }
    if (live.price !== part.price) result.priceChanged.push(slot);
    result.parts[slot] = live;
  }
  return result;
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
  componentCatalog: Record<string, ComponentOption[]>;
  canonicalCatalog: Record<ComponentSlotId, CanonicalBuildComponent[]>;
} {
  const canonicalCatalog = buildBuilderCatalog(shopifyProducts);
  const componentCatalog: Record<string, ComponentOption[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
  };

  for (const [slot, items] of Object.entries(canonicalCatalog)) {
    if (slot === "CaseFans") continue;
    componentCatalog[slot] = items.map(toComponentOption);
  }

  return { componentCatalog, canonicalCatalog };
}

const CATALOG_CACHE_TTL_MS = 15_000;
let cachedBuilderCatalog: Record<ComponentSlotId, CanonicalBuildComponent[]> | null = null;
let lastCatalogFetchTime = 0;

/**
 * Fetches builder components directly using the live Shopify catalog when configured.
 */
export async function fetchBuilderComponents(): Promise<
  Record<ComponentSlotId, CanonicalBuildComponent[]>
> {
  const now = Date.now();
  if (cachedBuilderCatalog && now - lastCatalogFetchTime < CATALOG_CACHE_TTL_MS) {
    return cachedBuilderCatalog;
  }

  let products: Product[] = [];
  if (shopifyConfig.isConfigured) {
    try {
      const res = await fetchAllShopifyProducts();
      if (res.products && res.products.length > 0) {
        products = res.products;
      }
    } catch {
      // Nothing is cached below when Shopify can't answer, so the next request tries again.
      return buildBuilderCatalog([]);
    }
  }

  const catalog = buildBuilderCatalog(products);
  cachedBuilderCatalog = catalog;
  lastCatalogFetchTime = now;
  return catalog;
}
