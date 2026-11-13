// GENERATED from src/lib/builder/spec-registry.ts by scripts/sync-server-builder.cjs. Don't edit: change the source and
// run `node scripts/sync-server-builder.cjs`. Only ".ts" is added to relative imports.

// src/lib/builder/spec-registry.ts
// How a Shopify product becomes a builder part with specifications: the code specification registry, and the
// resolver that layers it with an injected database registry, Shopify's pc_builder metafields and the title, keeping
// each value's provenance. Moved unchanged from catalog.ts in Stage 4S-2 (catalog.ts still exports all of it), so the
// quotation server resolves specifications with the same code as the storefront. Pure: no browser, network or
// module-level state, so the server can run it per request.

import type {
  CanonicalBuildComponent,
  ComponentSlotId,
  TechnicalSpecs,
  HardwareProductRecord,
  HardwareVariantRecord,
} from "./types.ts";
import { labelCriticalFields } from "./compatibility.ts";
import { detectComponentSlot, normalizeHardwareTitle } from "./slot-detection.ts";
import { toVariantGid } from "./shopify-fields.ts";
import {
  fieldDefinition,
  registryBuilderValues,
  type RegistryListingRecord,
} from "./hardware-spec.ts";
import {
  keysChangedSinceReview,
  readSpecReview,
  readStatedSpecs,
  sameSpecValue,
  specFieldName,
  type SpecConfidence,
  type SpecProblem,
} from "./spec-schema.ts";

export interface DatabaseHardwareMapping {
  product: Partial<HardwareProductRecord>;
  variant: Partial<HardwareVariantRecord>;
}

/**
 * The product fields the resolver reads. The storefront's `Product` (src/data/catalog.ts) has all of them; the
 * quotation server builds one from Shopify's answer. Only Shopify-derived values belong here.
 */
export interface SpecSourceProduct {
  id: string;
  name: string;
  brand?: string;
  category: string;
  productType?: string;
  tags?: string[];
  price: number;
  image?: string;
  stock?: number;
  /** The product's tags and metafields as `parseProductSpecs` (shopify-fields.ts) reads them. */
  specs?: Record<string, string>;
  /** The keys in `specs` that only a tag supplied: never read as specifications. */
  tagSpecKeys?: string[];
  specUpdatedAt?: Record<string, string>;
  handle?: string;
  variantId?: string;
  availableForSale?: boolean;
}

/**
 * Specification sources supplied by the caller, rather than held in module state. Each is consulted before the code
 * registry, and must be given identically to the storefront and the quotation server, or the two would resolve the
 * same part differently.
 *
 * `databaseSpecs`: a record for a variant (GID) from the database registry (`hardware_products`,
 * `hardware_variants`). Stage 4S-2: the storefront never loads it, so the server doesn't either. This is also where
 * a future Stage 4B specification registry would plug in.
 */
export interface SpecSources {
  databaseSpecs?: (variantGid: string) => DatabaseHardwareMapping | undefined;
  /**
   * Stage 4B: the Hardware Specification Manager's record for a listing (variant link first, then product link), from
   * `get_pc_builder_registry_specs`. Consulted first: a linked listing's identity is exact, so neither the October
   * table above, the code registry nor the title is used for it.
   */
  registrySpecs?: (variantGid: string, productId: string) => RegistryListingRecord | undefined;
}

export interface RegistrySource {
  url: string;
  checkedOn: string;
  /** The values read on this page. Anything else on the entry isn't manufacturer-verified. */
  fields: (keyof TechnicalSpecs)[];
  /** Search results quoting a page aren't the page, so a "search" source verifies nothing. */
  readVia: "direct" | "search";
  note?: string;
}

export interface VerifiedSpecEntry {
  specs: TechnicalSpecs;
  defaultPrice: number;
  title: string;
  aliases?: string[];
  /** Words a title must also have, because the model name alone also fits other speeds or versions. */
  titleMustHave?: string[];
  /** Words that mean a title is a different version of this model, with different specifications. */
  notIfTitleHas?: string[];
  /** Absent means no official page confirming this exact product was found. */
  source?: RegistrySource;
}

/**
 * Technical specification registry. A value counts as manufacturer-verified only if the entry's source
 * lists it. The rest, and every value on an entry with no source, stay on the list unconfirmed.
 */
export const VERIFIED_HARDWARE_SPECS: Record<string, VerifiedSpecEntry> = {
  // ─── Processors ───
  "cpu-r5-7600": {
    title: "AMD Ryzen 5 7600 (6 Cores / 12 Threads)",
    defaultPrice: 18999,
    aliases: ["ryzen 5 7600", "r5 7600", "7600"],
    source: {
      url: "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["socket", "tdpWatts", "hasIntegratedGraphics", "includesCooler", "supportedRamGen"],
    },
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
    },
  },
  "cpu-r7-9700x": {
    title: "AMD Ryzen 7 9700X (8 Cores / 16 Threads)",
    defaultPrice: 34999,
    aliases: ["ryzen 7 9700x", "r7 9700x", "9700x"],
    source: {
      url: "https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9700x.html",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["socket", "tdpWatts", "hasIntegratedGraphics", "includesCooler", "supportedRamGen"],
    },
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
    },
  },
  "cpu-r5-5600": {
    title: "AMD Ryzen 5 5600 (6 Cores / 12 Threads)",
    defaultPrice: 10999,
    aliases: ["ryzen 5 5600", "r5 5600", "5600"],
    source: {
      url: "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["socket", "tdpWatts", "hasIntegratedGraphics", "includesCooler", "supportedRamGen"],
    },
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
          "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html",
        checkedOn: "2026-11-03",
      },
      socket: "AM4",
      tdpWatts: 65,
      hasIntegratedGraphics: false,
      includesCooler: true,
      supportedRamGen: ["DDR4"],
    },
  },
  "cpu-i5-12400f": {
    title: "Intel Core i5-12400F (6 Cores / 12 Threads)",
    defaultPrice: 9499,
    aliases: ["core i5-12400f", "i5 12400f", "12400f"],
    source: {
      url: "https://www.intel.com/content/www/us/en/products/sku/134587/intel-core-i512400f-processor-18m-cache-up-to-4-40-ghz/specifications.html",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: [
        "socket",
        "tdpWatts",
        "maxTurboPowerWatts",
        "hasIntegratedGraphics",
        "includesCooler",
        "supportedRamGen",
      ],
      note: "No graphics and the boxed cooler are from Intel's support pages.",
    },
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
      maxTurboPowerWatts: 117,
      hasIntegratedGraphics: false,
      includesCooler: true,
      supportedRamGen: ["DDR4", "DDR5"],
    },
  },
  "cpu-i5-14600k": {
    title: "Intel Core i5-14600K (14 Cores / 20 Threads)",
    defaultPrice: 28499,
    aliases: ["core i5-14600k", "i5 14600k", "14600k"],
    source: {
      url: "https://www.intel.com/content/www/us/en/products/sku/236799/intel-core-i5-processor-14600k-24m-cache-up-to-5-30-ghz/specifications.html",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: [
        "socket",
        "tdpWatts",
        "maxTurboPowerWatts",
        "hasIntegratedGraphics",
        "supportedRamGen",
      ],
      note: "The page doesn't say whether a cooler is included.",
    },
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
      maxTurboPowerWatts: 181,
      hasIntegratedGraphics: true,
      includesCooler: false,
      supportedRamGen: ["DDR4", "DDR5"],
    },
  },

  // ─── Motherboards ───
  "mobo-b650m": {
    title: "MSI PRO B650M-P Micro-ATX Motherboard",
    defaultPrice: 10499,
    aliases: ["pro b650m-p", "b650m-p"],
    notIfTitleHas: ["wifi", "wi-fi"],
    source: {
      url: "https://www.msi.com/Motherboard/PRO-B650M-P/Specification",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: [
        "socket",
        "formFactor",
        "supportedRamGeneration",
        "ramSlots",
        "maxRamCapacityGb",
        "m2SlotCount",
        "sataPortCount",
        "hasWifi",
      ],
      note: "MSI lists 256GB on the current page and 128GB for V1, so the lower figure is used.",
    },
    specs: {
      socket: "AM5",
      formFactor: "Micro-ATX",
      supportedRamGeneration: "DDR5",
      ramSlots: 4,
      maxRamCapacityGb: 128,
      m2SlotCount: 2,
      sataPortCount: 4,
      hasWifi: false,
    },
  },
  "mobo-b550m": {
    title: "ASUS Prime B550M-A WiFi II Motherboard",
    defaultPrice: 8999,
    aliases: ["prime b550m-a wifi ii", "b550m-a wifi ii"],
    source: {
      url: "https://www.asus.com/motherboards-components/motherboards/prime/prime-b550m-a-wifi-ii/",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: [
        "socket",
        "formFactor",
        "supportedRamGeneration",
        "ramSlots",
        "maxRamCapacityGb",
        "m2SlotCount",
        "sataPortCount",
        "hasWifi",
      ],
    },
    specs: {
      socket: "AM4",
      formFactor: "Micro-ATX",
      supportedRamGeneration: "DDR4",
      ramSlots: 4,
      maxRamCapacityGb: 128,
      m2SlotCount: 2,
      sataPortCount: 4,
      hasWifi: true,
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
      m2SlotCount: 2,
      sataPortCount: 4,
    },
  },
  "mobo-z790": {
    title: "MSI MAG Z790 Tomahawk WiFi Motherboard",
    defaultPrice: 24999,
    aliases: ["mag z790 tomahawk wifi", "z790 tomahawk wifi"],
    source: {
      url: "https://www.msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI/Specification",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: [
        "socket",
        "formFactor",
        "supportedRamGeneration",
        "ramSlots",
        "maxRamCapacityGb",
        "m2SlotCount",
        "sataPortCount",
        "hasWifi",
      ],
      note: "MSI lists 256GB on the spec page and 128GB on its US store, so the lower figure is used. The page names the supported Intel generations rather than a socket. Intel's pages put those on LGA1700.",
    },
    specs: {
      socket: "LGA1700",
      formFactor: "ATX",
      supportedRamGeneration: "DDR5",
      ramSlots: 4,
      maxRamCapacityGb: 128,
      m2SlotCount: 4,
      sataPortCount: 7,
      hasWifi: true,
    },
  },

  // ─── RAM (Memory) ───
  "ram-16gb-ddr5": {
    title: "Corsair Vengeance 16GB (1x16GB) DDR5 5200MHz",
    defaultPrice: 4299,
    titleMustHave: ["5200"],
    aliases: [
      "vengeance 16gb (1x16gb) ddr5",
      "16gb ddr5",
      "16g ddr5",
      "ddr5 16gb",
      "5200mhz",
      "5200",
    ],
    source: {
      url: "https://www.corsair.com/us/en/p/memory/cmk16gx5m1b5200c40/vengeance-16gb-1x16gb-ddr5-dram-5200mhz-c40-memory-kit-black-cmk16gx5m1b5200c40",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["ramGeneration", "capacityGb", "moduleCount", "speedMhz", "isLaptopSoDimm"],
      note: "Corsair lists this kit for Intel 600, 700 and 800 series boards only. Nothing here checks that.",
    },
    specs: {
      ramGeneration: "DDR5",
      capacityGb: 16,
      moduleCount: 1,
      speedMhz: 5200,
      isLaptopSoDimm: false,
    },
  },
  "ram-32gb-ddr5": {
    title: "Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36",
    defaultPrice: 9499,
    titleMustHave: ["6000"],
    notIfTitleHas: ["cl30", "cl32", "cl34", "cl38", "cl40"],
    aliases: [
      "vengeance 32gb (2x16gb) ddr5",
      "32gb ddr5",
      "32g ddr5",
      "ddr5 32gb",
      "6000mhz",
      "6000",
    ],
    source: {
      url: "https://www.corsair.com/us/en/p/memory/cmk32gx5m2e6000c36/vengeance-32gb-2x16gb-ddr5-dram-6000mt-s-c36-memory-kit-black-cmk32gx5m2e6000c36",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["ramGeneration", "capacityGb", "moduleCount", "speedMhz"],
      note: "Corsair lists this kit for Intel 700 and 800 series boards only. Nothing here checks that.",
    },
    specs: {
      ramGeneration: "DDR5",
      capacityGb: 32,
      moduleCount: 2,
      speedMhz: 6000,
      isLaptopSoDimm: false,
    },
  },
  "ram-16gb-ddr4": {
    title: "Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
    defaultPrice: 3299,
    titleMustHave: ["3200"],
    aliases: [
      "vengeance lpx 16gb (2x8gb) ddr4",
      "16gb ddr4",
      "16g ddr4",
      "ddr4 16gb",
      "3200mhz",
      "3200",
      "16d4",
    ],
    source: {
      url: "https://www.corsair.com/us/en/p/memory/cmk16gx4m2b3200c16/vengeancea-lpx-16gb-2-x-8gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk16gx4m2b3200c16",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["ramGeneration", "capacityGb", "moduleCount", "speedMhz", "isLaptopSoDimm"],
    },
    specs: {
      ramGeneration: "DDR4",
      capacityGb: 16,
      moduleCount: 2,
      speedMhz: 3200,
      isLaptopSoDimm: false,
    },
  },

  // ─── Graphics Cards ───
  "gpu-rtx4060": {
    title: "ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge",
    defaultPrice: 28999,
    aliases: ["rtx 4060 twin edge", "rtx 4060 8gb twin edge"],
    source: {
      url: "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-4060ti/",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["powerWatts", "recommendedPsuWatts"],
      note: "ZOTAC's own page refuses automated reads, so only NVIDIA's chip figures are confirmed. Length, slots and connector came from search results and stay unconfirmed. NVIDIA's 550W is used, not the 500W those results quote for this card.",
    },
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
      recommendedPsuWatts: 550,
      requiredPciePins: "1x 8-pin",
    },
  },
  "gpu-rtx4070-super": {
    title: "Gigabyte GeForce RTX 4070 Super Windforce 12GB",
    defaultPrice: 58999,
    aliases: ["rtx 4070 super windforce"],
    source: {
      url: "https://www.gigabyte.com/Graphics-Card/GV-N407SWF3-12GD/sp",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: [
        "lengthMm",
        "powerWatts",
        "recommendedPsuWatts",
        "requiredPciePins",
        "pcie16PinAdapter8PinCount",
      ],
      note: "The OC model's page gives the same length, wattage, connector and adapter. Board power is from NVIDIA's RTX 4070 family page.",
    },
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
      recommendedPsuWatts: 700,
      requiredPciePins: "1x 16-pin (12VHPWR)",
      pcie16PinAdapter8PinCount: 2,
    },
  },
  "gpu-rx7600": {
    title: "ASRock AMD Radeon RX 7600 Challenger 8GB OC",
    defaultPrice: 23999,
    aliases: ["rx 7600 challenger"],
    source: {
      url: "https://www.asrock.com/Graphics-Card/AMD/Radeon%20RX%207600%20Challenger%208GB%20OC/index.asp",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["lengthMm", "powerWatts", "recommendedPsuWatts", "requiredPciePins"],
      note: "ASRock lists 269.2mm, rounded up here. Board power is from AMD.",
    },
    specs: {
      performance: {
        architecture: "RDNA 3",
        figures: { shaderUnits: 2048, boostClockMhz: 2655, vramGb: 8, memoryBusBits: 128 },
        sourceUrl:
          "https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7600.html",
        checkedOn: "2026-11-03",
      },
      lengthMm: 270,
      slotWidth: 2,
      powerWatts: 165,
      recommendedPsuWatts: 550,
      requiredPciePins: "1x 8-pin",
    },
  },

  // ─── Storage (SSD) ───
  "ssd-1tb-nvme": {
    title: "Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD",
    defaultPrice: 5499,
    aliases: ["1tb nvme", "1tb ssd", "p3 plus 1tb", "1tb m.2", "1tb"],
    source: {
      url: "https://www.crucial.com/ssd/p3-plus/ct1000p3pssd8",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["storageInterface", "storageFormFactor", "storageCapacityGb"],
    },
    specs: {
      storageInterface: "M.2 NVMe",
      storageFormFactor: "M.2 2280",
      storageCapacityGb: 1000,
    },
  },
  "ssd-500gb-nvme": {
    title: "Kingston NV2 500GB PCIe M.2 NVMe SSD",
    defaultPrice: 3299,
    aliases: ["500gb nvme", "500gb ssd", "nv2 500gb", "500gb m.2"],
    source: {
      url: "https://www.kingston.com/datasheets/snv2s_en.pdf",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["storageInterface", "storageFormFactor", "storageCapacityGb"],
      note: "Kingston lists SNV2S/500G as discontinued, replaced by NV3.",
    },
    specs: {
      storageInterface: "M.2 NVMe",
      storageFormFactor: "M.2 2280",
      storageCapacityGb: 500,
    },
  },

  // ─── Power Supplies ───
  "psu-550w": {
    title: "Deepcool PK550D 550W 80 Plus Bronze Power Supply",
    defaultPrice: 3499,
    aliases: ["550w", "pk550d", "550 watt", "550"],
    source: {
      url: "https://uk.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PK550D-80-PLUS-Bronze-Power-Supply/2022/15646.shtml",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["pciePowerConnectors", "efficiencyRating"],
      note: "The page never states the wattage, only the model name.",
    },
    specs: {
      ratedWattage: 550,
      efficiencyRating: "80 Plus Bronze",
      psuFormFactor: "ATX",
      pciePowerConnectors: ["6+2-pin", "6+2-pin"],
    },
  },
  "psu-650w": {
    title: "Deepcool PK650D 650W 80 Plus Bronze Power Supply",
    defaultPrice: 4499,
    aliases: ["650w", "pk650d", "650 watt", "650"],
    source: {
      url: "https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PK650D-80-PLUS-Bronze-Power-Supply/2022/15619.shtml",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["pciePowerConnectors", "efficiencyRating"],
      note: 'The page never states the wattage, only the model name. It lists "PCI-E (6+2)Pin x2" with a quantity of X2, which may mean four plugs. The smaller reading, two, is used until checked.',
    },
    specs: {
      ratedWattage: 650,
      efficiencyRating: "80 Plus Bronze",
      psuFormFactor: "ATX",
      pciePowerConnectors: ["6+2-pin", "6+2-pin"],
    },
  },
  "psu-750w": {
    title: "Corsair RM750e 750W 80 Plus Gold Fully Modular PSU",
    defaultPrice: 8999,
    aliases: ["750w", "rm750e", "750 watt", "750"],
    source: {
      url: "https://www.corsair.com/ww/en/p/psu/cp-9020295-in/rme-series-rm750e-fully-modular-low-noise-atx-power-supply-in-cp-9020295-in",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["ratedWattage", "pciePowerConnectors"],
      note: "From the India SKU. Its 12V-2x6 port feeds either the 16-pin cable or a dual 8-pin cable, so the smaller set is listed. Corsair's other listings differ. Corsair states Cybenetics Gold, not 80 Plus Gold, so efficiency isn't confirmed.",
    },
    specs: {
      ratedWattage: 750,
      efficiencyRating: "80 Plus Gold",
      psuFormFactor: "ATX",
      pciePowerConnectors: ["1x 12V-2x6", "1x 8-pin"],
    },
  },

  // ─── Cabinets ───
  "case-matx": {
    title: "Ant Esports ICE-100 Air Mini Mesh Micro-ATX Case",
    defaultPrice: 2899,
    aliases: ["ice-100 air mini mesh", "mini mesh", "matx case"],
    specs: {
      supportedMotherboards: ["Micro-ATX", "Mini-ITX"],
      maxGpuLengthMm: 310,
      maxCoolerHeightMm: 159,
      includedFanCount: 2,
    },
  },
  "case-atx": {
    title: "Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case",
    defaultPrice: 3899,
    aliases: ["cc560 v2"],
    source: {
      url: "https://www.deepcool.com/products/Cases/CC560-V2-Mid-Tower-Airflow-Case/2023/17782.shtml",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["supportedMotherboards", "maxGpuLengthMm", "maxCoolerHeightMm", "includedFanCount"],
    },
    specs: {
      supportedMotherboards: ["ATX", "Micro-ATX", "Mini-ITX"],
      maxGpuLengthMm: 370,
      maxCoolerHeightMm: 165,
      includedFanCount: 4,
    },
  },

  // ─── Coolers ───
  "cooler-ag400": {
    title: "Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler",
    defaultPrice: 1799,
    aliases: ["ag400", "deepcool ag400"],
    notIfTitleHas: ["digital", "plus", "pro", "led"],
    source: {
      url: "https://www.deepcool.com/products/Cooling/cpuaircoolers/AG400-ARGB-120mm-CPU-Cooler-1851-1700-AM5/2022/16084.shtml",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["coolerHeightMm", "supportedSockets", "maxTdpRatingWatts"],
    },
    specs: {
      coolerHeightMm: 150,
      supportedSockets: ["AM4", "AM5", "LGA1851", "LGA1700", "LGA1200"],
      maxTdpRatingWatts: 220,
    },
  },
  "cooler-le520": {
    title: "Deepcool LE520 240mm ARGB AIO Liquid Cooler",
    defaultPrice: 5499,
    aliases: ["le520", "240mm aio"],
    source: {
      url: "https://www.deepcool.com/products/Cooling/cpuliquidcoolers/LE520-240mm-Liquid-CPU-Cooler-1851-1700-AM5/2024/16608.shtml",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: ["coolerHeightMm", "supportedSockets", "maxTdpRatingWatts"],
    },
    specs: {
      coolerHeightMm: 52,
      supportedSockets: ["AM4", "AM5", "LGA1851", "LGA1700", "LGA1200"],
      maxTdpRatingWatts: 220,
    },
  },

  // ─── Monitors ───
  "monitor-r27qe": {
    title: "Lenovo Legion R27qe Gen 2 27-inch 200Hz 1440p Gaming Monitor",
    defaultPrice: 15000,
    aliases: ["r27qe", "lenovo legion r27qe", "r27qe-gen2", "lenovo legion {smartchoice} r27qe"],
    source: {
      url: "https://psref.lenovo.com/Product/LenovoMonitors/Legion_R27qe_Gen_2_Monitor",
      checkedOn: "2026-11-04",
      readVia: "direct",
      fields: [],
    },
    specs: {},
  },
};

/** Registry fields that describe the entry rather than the product. */
export const METADATA_FIELDS = new Set<keyof TechnicalSpecs>([
  "provenance",
  "lastVerifiedAt",
  "fieldSources",
  "specProblems",
  "unreviewedSpecs",
]);

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
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?![a-z0-9])(?!\\s+(?:ti|super|xt|xtx|gre)\\b)`).test(
    title,
  );
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

const REJECTED_SPECS: SpecProblem = {
  field: "spec_review_status",
  kind: "rejected",
  label: "This product's specifications",
  detail: "IT HUB has marked them as wrong, so they aren't being used",
};

/** What Shopify states for a product. A tag can describe a product, but never states a specification. */
export function shopifyStatedValues(product: SpecSourceProduct): Record<string, string> {
  const tagKeys = new Set(product.tagSpecKeys || []);
  return Object.fromEntries(
    Object.entries(product.specs || {}).filter(([key]) => !tagKeys.has(key)),
  );
}

/**
 * Stage 4B (4B-5): a listing linked to a canonical model in the Hardware Specification Manager. Its values come from
 * the registry (override, then model, then the base model's inheritable fields), each counted as IT HUB's own
 * reviewed value: authorised staff saved it, validated, with its revision recorded. Shopify's stated values only fill
 * a field the registry leaves unknown (unreviewed, as before); one that disagrees with the registry is a conflict and
 * neither value is used, so the part goes to review until a sync brings Shopify in line. A record filed under another
 * category than the part's slot is never used.
 */
function registryComponent(
  product: SpecSourceProduct,
  slot: ComponentSlotId,
  variantId: string,
  rawSpecs: Record<string, string>,
  review: ReturnType<typeof readSpecReview>,
  listing: RegistryListingRecord,
): CanonicalBuildComponent {
  const problems: SpecProblem[] = [];
  const specs: TechnicalSpecs = {};
  const fieldSources: Partial<Record<keyof TechnicalSpecs, SpecConfidence>> = {};
  const values = specs as Record<string, unknown>;
  const part = {
    slot,
    productId: product.id,
    variantId,
    title: product.name,
    brand: listing.manufacturer || product.brand || "",
    model: [listing.modelName, listing.modelNumber].filter(Boolean).join(" "),
    price: Math.round(product.price),
    currency: "INR",
    productUrl: `/products/${product.handle || product.id}`,
    imageUrl: product.image,
    availability: ((product.availableForSale ?? true) && (product.stock ?? 1) > 0
      ? "available"
      : "unavailable") as CanonicalBuildComponent["availability"],
    quantity: 1,
    retrievedAt: new Date().toISOString(),
    isShopifyLive: true,
    matchedModelKey: `hw-${listing.modelId}`,
  };

  if (listing.category !== slot) {
    problems.push({
      field: "hardware_registry",
      kind: "conflict",
      label: "This product's hardware record",
      detail: `it is recorded as ${listing.category}, but this product is a ${slot}`,
    });
    return {
      ...part,
      specs: { fieldSources, specProblems: problems, provenance: "registry_unverified" },
      isVerified: false,
    };
  }

  const { resolved, specs: registryValues } = registryBuilderValues(listing);
  for (const error of resolved.errors) {
    const definition = fieldDefinition(listing.category, error.field);
    problems.push({
      field: definition?.metafieldKey ?? error.field,
      kind: "invalid",
      label: definition?.label ?? "A specification",
      detail: error.message,
    });
  }
  for (const [field, value] of Object.entries(registryValues)) {
    values[field] = value;
    fieldSources[field as keyof TechnicalSpecs] = "it_hub_reviewed";
  }
  // The pc_builder metafields the registry states, including a value the builder doesn't carry (a "No" BIOS note).
  const coveredMetafields = new Set(
    Object.keys(resolved.values)
      .map((key) => fieldDefinition(listing.category, key)?.metafieldKey)
      .filter((key): key is string => Boolean(key)),
  );

  // Shopify's values. A review marked rejected concerns Shopify's own values, so they're ignored here.
  const unreviewed: string[] = [];
  if (review.status !== "rejected") {
    const stated = readStatedSpecs(slot, rawSpecs);
    const changedKeys = keysChangedSinceReview(review, product.specUpdatedAt);
    let filledGap = false;
    for (const [key, value] of Object.entries(stated.specs)) {
      const field = key as keyof TechnicalSpecs;
      const metafield = stated.fieldKeys[field] ?? "";
      const known = values[field];
      const conflict = (registryValue: unknown) => {
        delete values[field];
        delete fieldSources[field];
        problems.push({
          field,
          kind: "conflict",
          label: specFieldName(metafield),
          detail: `Shopify says ${String(value)}, but the hardware record says ${String(registryValue)}`,
        });
      };
      if (problems.some((problem) => problem.kind === "conflict" && problem.field === field))
        continue;
      if (known !== undefined) {
        if (!sameSpecValue(known, value)) conflict(known);
      } else if (coveredMetafields.has(metafield)) {
        // The registry states this metafield as a value the builder doesn't carry (only "No" can be): Shopify's
        // "Yes" contradicts it.
        if (value === true) conflict(false);
      } else {
        values[field] = value;
        const level: SpecConfidence =
          review.isReviewed && !changedKeys.has(metafield)
            ? "it_hub_reviewed"
            : "supplier_provided";
        fieldSources[field] = level;
        filledGap = true;
        if (level === "supplier_provided") unreviewed.push(specFieldName(metafield));
      }
    }
    for (const problem of stated.problems) {
      // An unreadable Shopify value matters only where the registry leaves the field unknown; a sync replaces it.
      if (problem.kind === "invalid" && coveredMetafields.has(problem.field)) continue;
      // A review record that doesn't hold up matters only if one of Shopify's values is used.
      if (problem.kind === "review" && !filledGap) continue;
      problems.push(problem);
    }
  }

  specs.fieldSources = fieldSources;
  if (problems.length > 0) specs.specProblems = problems;
  if (unreviewed.length > 0) specs.unreviewedSpecs = [...new Set(unreviewed)];
  const confirmed = labelCriticalFields(slot).every((alternatives) => {
    const field = alternatives.find((candidate) => values[candidate] !== undefined);
    const level = field === undefined ? undefined : fieldSources[field];
    return level === "manufacturer_verified" || level === "it_hub_reviewed";
  });
  specs.provenance = confirmed ? "it_hub_reviewed" : "registry_unverified";
  return { ...part, specs, isVerified: confirmed };
}

/**
 * Maps a Shopify Storefront Product into a CanonicalBuildComponent with verified engineering specifications.
 * (`matchShopifyProductToComponent` in catalog.ts, with the database registry passed in.)
 */
export function resolveShopifyComponent(
  product: SpecSourceProduct,
  slotHint?: ComponentSlotId,
  sources: SpecSources = {},
): CanonicalBuildComponent | null {
  const slot =
    slotHint ||
    detectComponentSlot(product.name, product.productType, product.tags || [], product.category);
  if (!slot) return null;

  const cleanedTitle = normalizeHardwareTitle(product.name);
  const normCleaned = cleanedTitle.toLowerCase();

  // Ensure authentic variant ID
  const variantId = product.variantId ? toVariantGid(product.variantId) : "";

  // What Shopify states for this product. A tag never counts, and rejected values are ignored.
  const rawSpecs = shopifyStatedValues(product);
  const review = readSpecReview(rawSpecs);

  // 0. Stage 4B: the Hardware Specification Manager. A linked listing resolves from its canonical model.
  const listing = variantId ? sources.registrySpecs?.(variantId, product.id) : undefined;
  if (listing) return registryComponent(product, slot, variantId, rawSpecs, review, listing);

  // 1. Check Database Specification Registry
  const databaseMapping = variantId ? sources.databaseSpecs?.(variantId) : undefined;
  if (databaseMapping) {
    const { product: dbProd, variant: dbVar } = databaseMapping;

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
      specProblems: review.status === "rejected" ? [REJECTED_SPECS] : undefined,
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
    const sameVersion =
      (entry.titleMustHave || []).every((word) => normCleaned.includes(word)) &&
      !(entry.notIfTitleHas || []).some((word) => titleHasTerm(normCleaned, word));
    const entryGeneration = entry.specs.supportedRamGeneration || entry.specs.ramGeneration;
    if (titleGeneration && entryGeneration && titleGeneration !== entryGeneration) continue;
    if (matches && sameVersion) {
      matchedKey = key;
      matchedEntry = entry;
      break;
    }
  }

  // A graphics card's "GDDR5" says nothing about system memory.
  const usesPlatformSpecs = slot === "CPU" || slot === "Motherboard";
  const usesRamGeneration = usesPlatformSpecs || slot === "RAM";

  const stated: ReturnType<typeof readStatedSpecs> =
    review.status === "rejected"
      ? { specs: {}, fieldKeys: {}, problems: [REJECTED_SPECS] }
      : readStatedSpecs(slot, rawSpecs);
  const changedKeys = keysChangedSinceReview(review, product.specUpdatedAt);
  // Each value has its own standing: one changed after the review no longer counts as reviewed.
  const statedLevel = (field: keyof TechnicalSpecs): SpecConfidence =>
    review.isReviewed && !changedKeys.has(stated.fieldKeys[field] ?? "")
      ? "it_hub_reviewed"
      : "supplier_provided";
  /** What Shopify states that nobody has reviewed, among the fields a part ended up using. */
  const unreviewedNames = (sources: Partial<Record<keyof TechnicalSpecs, SpecConfidence>>) => {
    const names = (Object.keys(stated.specs) as (keyof TechnicalSpecs)[])
      .filter((field) => sources[field] === "supplier_provided")
      .map((field) => specFieldName(stated.fieldKeys[field] ?? ""));
    return names.length > 0 ? [...new Set(names)] : undefined;
  };

  if (matchedEntry && matchedKey) {
    const specs: TechnicalSpecs = { ...matchedEntry.specs };
    const fieldSources: Partial<Record<keyof TechnicalSpecs, SpecConfidence>> = {};
    const problems: SpecProblem[] = [...stated.problems];
    const sourced = new Set<keyof TechnicalSpecs>(
      matchedEntry.source?.readVia === "direct" ? matchedEntry.source.fields : [],
    );
    for (const field of Object.keys(specs) as (keyof TechnicalSpecs)[]) {
      if (METADATA_FIELDS.has(field)) continue;
      // Performance figures carry their own source.
      fieldSources[field] =
        sourced.has(field) || field === "performance"
          ? "manufacturer_verified"
          : "supplier_provided";
    }
    // A stated value can fill a gap in the registry, but neither side wins a disagreement.
    for (const [key, value] of Object.entries(stated.specs)) {
      const field = key as keyof TechnicalSpecs;
      const known = (specs as Record<string, unknown>)[field];
      if (known === undefined) {
        (specs as Record<string, unknown>)[field] = value;
        fieldSources[field] = statedLevel(field);
      } else if (!sameSpecValue(known, value)) {
        delete (specs as Record<string, unknown>)[field];
        delete fieldSources[field];
        problems.push({
          field,
          kind: "conflict",
          label: specFieldName(stated.fieldKeys[field] ?? ""),
          detail: `Shopify says ${String(value)}, but the specification list says ${String(known)}`,
        });
      } else if (
        fieldSources[field] !== "manufacturer_verified" &&
        statedLevel(field) === "it_hub_reviewed"
      ) {
        fieldSources[field] = "it_hub_reviewed";
      }
    }
    specs.fieldSources = fieldSources;
    if (problems.length > 0) specs.specProblems = problems;
    // A value matching the registry adds nothing to check, so only a value that fills a gap counts.
    const filledUnreviewed = Object.fromEntries(
      Object.entries(stated.specs)
        .filter(([field]) => (matchedEntry!.specs as Record<string, unknown>)[field] === undefined)
        .map(([field]) => [field, fieldSources[field as keyof TechnicalSpecs]]),
    );
    const unreviewedSpecs = unreviewedNames(filledUnreviewed);
    if (unreviewedSpecs) specs.unreviewedSpecs = unreviewedSpecs;
    // Fully sourced only if a source confirms everything a label would rest on.
    const criticalLevels = labelCriticalFields(slot).map((alternatives) => {
      const field = alternatives.find((candidate) => specs[candidate] !== undefined);
      return field === undefined ? undefined : fieldSources[field];
    });
    const fullySourced =
      Boolean(matchedEntry.source) &&
      criticalLevels.every((level) => level === "manufacturer_verified");
    // IT HUB's review can complete what a source left open, but it never becomes the maker's word.
    const completedByReview = criticalLevels.every(
      (level) => level === "manufacturer_verified" || level === "it_hub_reviewed",
    );

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
        provenance: fullySourced
          ? "manufacturer_verified"
          : completedByReview
            ? "it_hub_reviewed"
            : "registry_unverified",
        lastVerifiedAt: matchedEntry.source?.checkedOn,
      },
      availability:
        (product.availableForSale ?? true) && (product.stock ?? 1) > 0
          ? "available"
          : "unavailable",
      quantity: 1,
      retrievedAt: new Date().toISOString(),
      isShopifyLive: true,
      // Being on the list isn't evidence. Each value the build rests on needs a source or a review.
      isVerified: completedByReview,
      matchedModelKey: matchedKey,
    };
  }

  // What the title can say. Tags aren't read, and a title never outranks a stated value.
  let titleSocket: string | undefined;
  if (usesPlatformSpecs) {
    if (normCleaned.includes("am5") || normCleaned.includes("b650") || normCleaned.includes("x670"))
      titleSocket = "AM5";
    else if (
      normCleaned.includes("am4") ||
      normCleaned.includes("b550") ||
      normCleaned.includes("a520")
    )
      titleSocket = "AM4";
    else if (
      normCleaned.includes("lga1700") ||
      normCleaned.includes("b760") ||
      normCleaned.includes("z790") ||
      normCleaned.includes("12400") ||
      normCleaned.includes("13400") ||
      normCleaned.includes("14400")
    )
      titleSocket = "LGA1700";
  }
  let titleRamGen: string | undefined;
  if (usesRamGeneration) {
    if (titleHasTerm(normCleaned, "ddr5")) titleRamGen = "DDR5";
    else if (titleHasTerm(normCleaned, "ddr4")) titleRamGen = "DDR4";
    else if (titleSocket === "AM5") titleRamGen = "DDR5";
    else if (titleSocket === "AM4") titleRamGen = "DDR4";
  }

  const chipSpecs =
    slot === "GPU" ? GPU_CHIP_POWER.find(({ chip }) => titleHasTerm(normCleaned, chip)) : undefined;

  const titleWatts = normCleaned.match(/(?:^|[^a-z0-9])(\d{3,4})\s*w(?:atts?)?(?![a-z0-9])/)?.[1];
  const titleInterface =
    slot !== "Storage"
      ? undefined
      : titleHasTerm(normCleaned, "nvme")
        ? "M.2 NVMe"
        : titleHasTerm(normCleaned, "sata")
          ? "SATA SSD"
          : undefined;
  const titleStorageSize =
    slot === "Storage" ? normCleaned.match(/(?:^|[^0-9.])(\d{1,4})\s*(tb|gb)(?![a-z0-9])/) : null;

  // RAM kits state their size in the title: "16GB (2x8GB)" or "2 x 8GB".
  const ramKit =
    slot === "RAM" ? normCleaned.match(/(?:^|[^0-9])(\d)\s*x\s*(\d{1,3})\s*gb(?![a-z0-9])/) : null;
  const ramTitleSize =
    slot === "RAM" ? normCleaned.match(/(?:^|[^0-9x])(\d{1,3})\s*gb(?![a-z0-9])/)?.[1] : undefined;
  const isSoDimmTitle =
    slot === "RAM" &&
    (titleHasTerm(normCleaned, "so-dimm") ||
      titleHasTerm(normCleaned, "sodimm") ||
      titleHasTerm(normCleaned, "laptop"));

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
  // "No Wi-Fi" says the opposite of what a search for the word would suggest.
  const titleWifi = !isBoard
    ? undefined
    : /\b(?:no|non|without)[\s-]*wi-?fi\b/.test(normCleaned)
      ? false
      : /wi-?fi/.test(normCleaned)
        ? true
        : undefined;

  const fromTitle: TechnicalSpecs = {
    socket: titleSocket,
    supportedRamGeneration: titleRamGen,
    ramGeneration: titleRamGen,
    ratedWattage: slot === "PSU" && titleWatts ? Number(titleWatts) : undefined,
    storageInterface: titleInterface,
    storageCapacityGb: titleStorageSize
      ? Number(titleStorageSize[1]) * (titleStorageSize[2] === "tb" ? 1000 : 1)
      : undefined,
    capacityGb: ramKit
      ? Number(ramKit[1]) * Number(ramKit[2])
      : ramTitleSize
        ? Number(ramTitleSize)
        : undefined,
    moduleCount: ramKit ? Number(ramKit[1]) : undefined,
    isLaptopSoDimm: isSoDimmTitle ? true : undefined,
    formFactor: titleFormFactor,
    hasWifi: titleWifi,
  };

  // A stated value is used, unless the title says otherwise. Then neither is trusted.
  const merged: TechnicalSpecs = {};
  const fieldSources: Partial<Record<keyof TechnicalSpecs, SpecConfidence>> = {};
  const problems: SpecProblem[] = [...stated.problems];
  const assign = (field: keyof TechnicalSpecs, value: unknown, level: SpecConfidence) => {
    (merged as Record<string, unknown>)[field] = value;
    fieldSources[field] = level;
  };
  for (const [key, value] of Object.entries(stated.specs)) {
    const field = key as keyof TechnicalSpecs;
    if (value !== undefined) assign(field, value, statedLevel(field));
  }
  for (const [key, value] of Object.entries(fromTitle)) {
    if (value === undefined) continue;
    const field = key as keyof TechnicalSpecs;
    const known = (stated.specs as Record<string, unknown>)[field];
    if (known === undefined) {
      assign(field, value, "title_inferred");
    } else if (!sameSpecValue(known, value)) {
      delete (merged as Record<string, unknown>)[field];
      delete fieldSources[field];
      problems.push({
        field,
        kind: "conflict",
        label: specFieldName(stated.fieldKeys[field] ?? ""),
        detail: `Shopify says ${String(known)}, but the title says ${String(value)}`,
      });
    }
  }
  // A chip's typical figures only fill a gap, because a maker's card can reasonably differ from them.
  if (chipSpecs && merged.powerWatts === undefined) {
    assign("powerWatts", chipSpecs.watts, "title_inferred");
  }
  if (chipSpecs && merged.recommendedPsuWatts === undefined) {
    assign("recommendedPsuWatts", chipSpecs.recommendedPsuWatts, "title_inferred");
  }

  const statedAny = Object.keys(stated.specs).some(
    (field) =>
      fieldSources[field as keyof TechnicalSpecs] !== undefined &&
      fieldSources[field as keyof TechnicalSpecs] !== "title_inferred",
  );
  const titleAny = Object.values(fieldSources).some((level) => level === "title_inferred");

  // Only a processor can come with a cooler. For a processor, silence stays unknown.
  if (slot !== "CPU") merged.includesCooler = false;

  // One reviewed value can't vouch for the rest: the part stands only if every value a label rests on
  // was itself reviewed. A value missing, or only read from the title, leaves it unconfirmed.
  const everyCriticalValueReviewed =
    review.isReviewed &&
    labelCriticalFields(slot).every((alternatives) => {
      const field = alternatives.find((candidate) => merged[candidate] !== undefined);
      return field !== undefined && fieldSources[field] === "it_hub_reviewed";
    });

  const inferredSpecs: TechnicalSpecs = {
    ...merged,
    fieldSources,
    specProblems: problems.length > 0 ? problems : undefined,
    unreviewedSpecs: unreviewedNames(fieldSources),
    // Only the registry can say a value was checked. A product can't claim that about itself.
    provenance: statedAny
      ? everyCriticalValueReviewed
        ? "it_hub_reviewed"
        : "supplier_spec"
      : titleAny
        ? "title_derived"
        : "unverified",
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
    // Stating a value doesn't verify a part, for the same reason one reviewed value doesn't confirm it.
    isVerified: statedAny && everyCriticalValueReviewed,
  };
}
