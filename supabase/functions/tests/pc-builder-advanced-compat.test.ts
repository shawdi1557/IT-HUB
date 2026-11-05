// supabase/functions/tests/pc-builder-advanced-compat.test.ts
// One table of compatibility cases, each run through the real catalogue pipeline and the real rules. The
// model names are made up, so no registry entry or title rule helps unless a case says it uses a title.
// All values here are test data, and describe no real product or IT HUB stock.

import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { checkCompatibility, toCanonicalComponent } =
  await import("../../../src/lib/builder/compatibility.ts");
const { generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");

type Slot = "CPU" | "Motherboard" | "RAM" | "GPU" | "Storage" | "PSU" | "Cabinet" | "Cooler";
type Specs = Record<string, string | undefined>;
type Overrides = Partial<Record<Slot, Specs | null>>;

const REVIEWED: Specs = {
  spec_source: "manufacturer_datasheet",
  spec_review_status: "reviewed",
  spec_source_url: "https://www.example.org/datasheet",
  spec_reviewed_on: "2026-11-01",
};
const NOT_REVIEWED: Specs = {
  spec_source: undefined,
  spec_review_status: undefined,
  spec_source_url: undefined,
  spec_reviewed_on: undefined,
};

const SLOT_PRODUCTS: Record<Slot, { name: string; category: string; specs: Specs }> = {
  CPU: {
    name: "QZX Validation Processor 77",
    category: "Computer Processors",
    specs: {
      socket: "AM4",
      watts: "65",
      cpu_max_power_watts: "76",
      integrated_graphics: "false",
      includes_cooler: "true",
      supported_ram_generations: '["DDR4"]',
      ...REVIEWED,
    },
  },
  Motherboard: {
    name: "QZX Validation Board 12",
    category: "Motherboards",
    specs: {
      socket: "AM4",
      ram_generation: "DDR4",
      form_factor: "Micro-ATX",
      ram_slots: "2",
      max_ram_gb: "64",
      m2_slots: "1",
      sata_ports: "4",
      ...REVIEWED,
    },
  },
  RAM: {
    name: "QZX Validation Memory Kit",
    category: "RAM",
    specs: {
      ram_generation: "DDR4",
      ram_capacity_gb: "16",
      ram_modules: "2",
      ram_module_type: "DIMM",
      ...REVIEWED,
    },
  },
  GPU: {
    name: "QZX Validation Card 8",
    category: "Video Cards",
    specs: {
      watts: "130",
      gpu_length_mm: "200",
      recommended_psu_watts: "550",
      pcie_6plus2_required: "1",
      pcie_16pin_required: "0",
      ...REVIEWED,
    },
  },
  Storage: {
    name: "QZX Validation Drive",
    category: "Solid State Drives",
    specs: { storage_interface: "M.2 NVMe", storage_capacity_gb: "1000", ...REVIEWED },
  },
  PSU: {
    name: "QZX Validation Power 650",
    category: "Computer Power Supplies",
    specs: { capacity_watts: "650", pcie_6plus2_count: "2", pcie_16pin_count: "0", ...REVIEWED },
  },
  Cabinet: {
    name: "QZX Validation Enclosure",
    category: "Computer Cases",
    specs: {
      supported_motherboards: '["ATX","Micro-ATX"]',
      cabinet_clearance_mm: "300",
      max_cooler_height_mm: "160",
      ...REVIEWED,
    },
  },
  Cooler: {
    name: "QZX Validation Tower",
    category: "CPU Coolers",
    specs: { supported_sockets: '["AM4"]', cooler_height_mm: "150", ...REVIEWED },
  },
};
const SLOTS = Object.keys(SLOT_PRODUCTS) as Slot[];

let nextId = 1;
/** The products for a case. The cooler is left out unless a case asks for it, and null drops a slot. */
function productsFor(over: Overrides = {}, names: Partial<Record<Slot, string>> = {}): any[] {
  const products: any[] = [];
  for (const slot of SLOTS) {
    const change = over[slot];
    if (change === null || (slot === "Cooler" && change === undefined)) continue;
    const specs: Specs = { ...SLOT_PRODUCTS[slot].specs, ...change };
    for (const key of Object.keys(specs)) if (specs[key] === undefined) delete specs[key];
    const id = nextId++;
    products.push({
      id: `gid://shopify/Product/${id}`,
      name: names[slot] ?? SLOT_PRODUCTS[slot].name,
      handle: `validation-${id}`,
      price: 5000,
      tags: [],
      variantId: `gid://shopify/ProductVariant/${id}`,
      availableForSale: true,
      stock: 5,
      specs,
      category: SLOT_PRODUCTS[slot].category,
    });
  }
  return products;
}
const catalogueFor = (over?: Overrides, names?: Partial<Record<Slot, string>>) =>
  syncBuilderCatalogWithShopify(productsFor(over, names)).componentCatalog as Record<string, any[]>;
function partsFor(over?: Overrides, names?: Partial<Record<Slot, string>>) {
  const catalogue = catalogueFor(over, names);
  const parts: Record<string, any> = {};
  for (const slot of SLOTS) {
    if (catalogue[slot]?.[0]) parts[slot] = toCanonicalComponent(slot, catalogue[slot][0]);
  }
  return parts;
}
const familyOf = (rule: string) => rule.split("_").slice(0, 2).join("_") + "_";
const rulesIn = (check: any, family: string) =>
  check.items
    .filter((item: any) => item.ruleId.startsWith(family))
    .map((item: any) => item.ruleId)
    .sort();

type Kind = "positive" | "negative" | "unknown" | "advisory";
interface Case {
  rule: string;
  kind: Kind;
  name: string;
  over?: Overrides;
  names?: Partial<Record<Slot, string>>;
  options?: Record<string, unknown>;
  /** Other rules of the same family that must fire. Anything else in the family fails the case. */
  also?: string[];
  explains?: RegExp;
  overall?: string;
  valid?: boolean;
  complete?: boolean;
  source?: { slot: Slot; field: string; level: string };
}
const STATUS_FOR: Record<Kind, string> = {
  positive: "compatible",
  negative: "incompatible",
  unknown: "unknown",
  advisory: "conditional",
};
const SEVERITY_FOR: Record<Kind, string> = {
  positive: "info",
  negative: "error",
  unknown: "warning",
  advisory: "warning",
};

const RAM_FITS = ["RULE_B_RAM_MATCH", "RULE_B_RAM_LIMITS_OK"];
const CASES: Case[] = [
  // ── Rule A: processor and motherboard ──────────────────────────────────────────────────────────
  {
    rule: "RULE_A_SOCKET_MATCH",
    kind: "positive",
    name: "the same socket on both",
    explains: /AM4/,
    overall: "compatible",
    valid: true,
    complete: true,
    source: { slot: "CPU", field: "socket", level: "it_hub_reviewed" },
  },
  {
    rule: "RULE_A_SOCKET_MISMATCH",
    kind: "negative",
    name: "different sockets",
    over: { CPU: { socket: "AM5" } },
    explains: /AM5.*AM4/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_A_SOCKET_UNKNOWN",
    kind: "unknown",
    name: "the processor's socket is blank",
    over: { CPU: { socket: undefined } },
    explains: /Unable to verify CPU socket/,
    overall: "unknown",
    valid: true,
  },
  {
    rule: "RULE_A_SOCKET_UNKNOWN",
    kind: "unknown",
    name: "the motherboard's socket is blank",
    over: { Motherboard: { socket: undefined } },
    explains: /Unable to verify CPU socket/,
    overall: "unknown",
    valid: true,
  },
  {
    rule: "RULE_A_BIOS_UPDATE",
    kind: "advisory",
    name: "the motherboard is flagged as needing an update",
    over: { Motherboard: { bios_update_required: "true" } },
    explains: /BIOS/,
    valid: true,
  },

  // ── Rule B: memory ─────────────────────────────────────────────────────────────────────────────
  {
    rule: "RULE_B_RAM_MATCH",
    kind: "positive",
    name: "the same generation on both",
    also: ["RULE_B_RAM_LIMITS_OK"],
    explains: /DDR4/,
    overall: "compatible",
    source: { slot: "RAM", field: "ramGeneration", level: "it_hub_reviewed" },
  },
  {
    rule: "RULE_B_RAM_MISMATCH",
    kind: "negative",
    name: "different generations",
    over: {
      RAM: { ram_generation: "DDR5" },
      CPU: { supported_ram_generations: '["DDR4","DDR5"]' },
    },
    also: ["RULE_B_RAM_LIMITS_OK"],
    explains: /only supports DDR4.*DDR5/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_B_RAM_UNKNOWN",
    kind: "unknown",
    name: "the motherboard's generation is blank",
    over: { Motherboard: { ram_generation: undefined } },
    also: ["RULE_B_RAM_LIMITS_OK"],
    explains: /DDR generation/,
    overall: "unknown",
  },
  {
    rule: "RULE_B_RAM_UNKNOWN",
    kind: "unknown",
    name: "the kit's generation is blank",
    over: { RAM: { ram_generation: undefined } },
    also: ["RULE_B_RAM_LIMITS_OK"],
    explains: /DDR generation/,
    overall: "unknown",
  },
  {
    rule: "RULE_B_RAM_SODIMM_ERROR",
    kind: "negative",
    name: "laptop memory",
    over: { RAM: { ram_module_type: "SO-DIMM" } },
    also: RAM_FITS,
    explains: /SO-DIMM/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_B_RAM_SLOTS_EXCEEDED",
    kind: "negative",
    name: "one module more than the slots",
    over: { RAM: { ram_modules: "3" } },
    also: ["RULE_B_RAM_MATCH"],
    explains: /3 modules.*2 memory slots/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_B_RAM_CAPACITY_EXCEEDED",
    kind: "negative",
    name: "above the motherboard's limit",
    over: { RAM: { ram_capacity_gb: "65" } },
    also: ["RULE_B_RAM_MATCH"],
    explains: /65GB.*64GB/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_B_RAM_LIMITS_OK",
    kind: "positive",
    name: "exactly the slots and exactly the limit",
    over: { RAM: { ram_capacity_gb: "64" } },
    also: ["RULE_B_RAM_MATCH"],
    explains: /within the motherboard's slot count/,
    overall: "compatible",
  },
  ...(
    [
      ["RAM", "ram_modules"],
      ["RAM", "ram_capacity_gb"],
      ["Motherboard", "ram_slots"],
      ["Motherboard", "max_ram_gb"],
    ] as [Slot, string][]
  ).map(([slot, field]): Case => ({
    rule: "RULE_B_RAM_LIMITS_UNKNOWN",
    kind: "unknown",
    name: `${field} is blank`,
    over: { [slot]: { [field]: undefined } },
    also: ["RULE_B_RAM_MATCH"],
    explains: /slots and maximum capacity/,
    overall: "unknown",
  })),
  {
    rule: "RULE_B_CPU_RAM_MISMATCH",
    kind: "negative",
    name: "the processor doesn't support the kit",
    over: { Motherboard: { ram_generation: "DDR5" }, RAM: { ram_generation: "DDR5" } },
    also: RAM_FITS,
    explains: /supports DDR4 memory.*DDR5/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_B_OWNED_RAM_UNCHECKED",
    kind: "unknown",
    name: "the customer's own memory",
    over: { RAM: null },
    options: { ownedSlots: ["RAM"] },
    explains: /aren't known here/,
    overall: "unknown",
    valid: true,
    complete: true,
  },

  // ── Rule C: cooling ────────────────────────────────────────────────────────────────────────────
  {
    rule: "RULE_C_STOCK_COOLER_UNKNOWN",
    kind: "unknown",
    name: "nobody has said whether a cooler is included",
    over: { CPU: { includes_cooler: undefined } },
    explains: /includes a cooler/,
    overall: "unknown",
  },
  {
    rule: "RULE_C_COOLER_REQUIRED",
    kind: "advisory",
    name: "no cooler in the box and none chosen",
    over: { CPU: { includes_cooler: "false" } },
    explains: /aftermarket air or liquid cooler is required/,
    overall: "conditional",
    valid: true,
    complete: false,
  },
  {
    rule: "RULE_C_COOLER_SOCKET_MATCH",
    kind: "positive",
    name: "the cooler lists the socket",
    over: { Cooler: {} },
    also: ["RULE_C_COOLER_HEIGHT_OK"],
    explains: /lists mounting support for AM4/,
    overall: "compatible",
    source: { slot: "Cooler", field: "supportedSockets", level: "it_hub_reviewed" },
  },
  {
    rule: "RULE_C_COOLER_SOCKET_MISMATCH",
    kind: "negative",
    name: "the cooler doesn't list the socket",
    over: { Cooler: { supported_sockets: '["AM5"]' } },
    also: ["RULE_C_COOLER_HEIGHT_OK"],
    explains: /mounting brackets for AM4/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_C_COOLER_SOCKET_UNKNOWN",
    kind: "unknown",
    name: "the cooler's sockets are blank",
    over: { Cooler: { supported_sockets: undefined } },
    also: ["RULE_C_COOLER_HEIGHT_OK"],
    explains: /mounts on/,
    overall: "unknown",
  },
  {
    rule: "RULE_C_COOLER_HEIGHT_OK",
    kind: "positive",
    name: "exactly the cabinet's limit",
    over: { Cooler: { cooler_height_mm: "160" } },
    also: ["RULE_C_COOLER_SOCKET_MATCH"],
    explains: /within the cabinet's stated height/,
    overall: "compatible",
  },
  {
    rule: "RULE_C_COOLER_HEIGHT_EXCEEDED",
    kind: "negative",
    name: "1mm above the cabinet's limit",
    over: { Cooler: { cooler_height_mm: "161" } },
    also: ["RULE_C_COOLER_SOCKET_MATCH"],
    explains: /161mm.*160mm/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_C_COOLER_HEIGHT_UNKNOWN",
    kind: "unknown",
    name: "the cooler's height is blank",
    over: { Cooler: { cooler_height_mm: undefined } },
    also: ["RULE_C_COOLER_SOCKET_MATCH"],
    explains: /fits inside/,
    overall: "unknown",
  },
  {
    rule: "RULE_C_COOLER_HEIGHT_UNKNOWN",
    kind: "unknown",
    name: "the cabinet's limit is blank, with an added cooler",
    over: { Cooler: {}, Cabinet: { max_cooler_height_mm: undefined } },
    also: ["RULE_C_COOLER_SOCKET_MATCH"],
    explains: /fits inside/,
    overall: "unknown",
  },

  // ── Rule D: graphics card length ───────────────────────────────────────────────────────────────
  {
    rule: "RULE_D_GPU_CLEARANCE_OK",
    kind: "positive",
    name: "1mm inside the limit",
    over: { GPU: { gpu_length_mm: "299" } },
    explains: /fit cleanly/,
    overall: "compatible",
    source: { slot: "Cabinet", field: "maxGpuLengthMm", level: "it_hub_reviewed" },
  },
  {
    rule: "RULE_D_GPU_LENGTH_EXCEEDED",
    kind: "negative",
    name: "1mm over the limit",
    over: { GPU: { gpu_length_mm: "301" } },
    explains: /301mm.*300mm/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_D_GPU_CLEARANCE_UNKNOWN",
    kind: "unknown",
    name: "the card's length is blank",
    over: { GPU: { gpu_length_mm: undefined } },
    explains: /length unspecified/,
    overall: "unknown",
  },
  {
    rule: "RULE_D_GPU_CLEARANCE_UNKNOWN",
    kind: "unknown",
    name: "the cabinet's limit is blank",
    over: { Cabinet: { cabinet_clearance_mm: undefined } },
    explains: /clearance unspecified/,
    overall: "unknown",
  },

  // ── Rule E: power ──────────────────────────────────────────────────────────────────────────────
  {
    rule: "RULE_E_PSU_HEADROOM_ADEQUATE",
    kind: "positive",
    name: "above the recommendation",
    explains: /healthy power headroom/,
    overall: "compatible",
    source: { slot: "PSU", field: "ratedWattage", level: "it_hub_reviewed" },
  },
  {
    rule: "RULE_E_PSU_WATTAGE_UNKNOWN",
    kind: "unknown",
    name: "the power supply's wattage is blank",
    over: { PSU: { capacity_watts: undefined } },
    explains: /rated wattage is unspecified/,
    overall: "unknown",
  },
  {
    rule: "RULE_E_PSU_WATTAGE_DEFICIT",
    kind: "negative",
    name: "1W below the stated load",
    over: { PSU: { capacity_watts: "285" } },
    explains: /286W.*285W/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_E_POWER_DRAW_UNKNOWN",
    kind: "unknown",
    name: "the card's power draw is blank",
    over: { GPU: { watts: undefined } },
    explains: /no stated power draw/,
    overall: "unknown",
  },
  {
    rule: "RULE_E_PSU_BELOW_RECOMMENDED",
    kind: "advisory",
    name: "covers the load, below the maker's recommendation",
    over: { PSU: { capacity_watts: "549" } },
    explains: /recommends at least 550W/,
    overall: "unknown",
    valid: true,
  },
  {
    rule: "RULE_E_RECOMMENDED_UNKNOWN",
    kind: "unknown",
    name: "the maker's recommendation is blank",
    over: { GPU: { recommended_psu_watts: undefined } },
    explains: /recommends isn't stated/,
    overall: "unknown",
  },
  {
    rule: "RULE_E_CPU_PEAK_UNKNOWN",
    kind: "unknown",
    name: "little margin, and the processor's maximum is blank",
    over: {
      CPU: { cpu_max_power_watts: undefined },
      GPU: { recommended_psu_watts: "300" },
      PSU: { capacity_watts: "350" },
    },
    explains: /maximum isn't stated/,
    overall: "unknown",
  },
  {
    rule: "RULE_E_PSU_HEADROOM_LIMITED",
    kind: "advisory",
    name: "little margin, with every figure stated",
    over: { GPU: { recommended_psu_watts: "300" }, PSU: { capacity_watts: "350" } },
    explains: /less than the recommended 35% safety margin/,
    overall: "conditional",
    valid: true,
  },

  // ── Rule F: power connectors ───────────────────────────────────────────────────────────────────
  {
    rule: "RULE_F_PCIE_POWER_MATCH",
    kind: "positive",
    name: "the supply has what the card needs",
    explains: /provides the PCIe power connectors/,
    overall: "compatible",
    source: { slot: "PSU", field: "pcie6Plus2Count", level: "it_hub_reviewed" },
  },
  {
    rule: "RULE_F_PCIE_POWER_NOT_REQUIRED",
    kind: "positive",
    name: "75W, stated as needing no connector",
    over: { GPU: { watts: "75", pcie_6plus2_required: "0" } },
    explains: /≤75W/,
    overall: "compatible",
  },
  {
    rule: "RULE_F_GPU_CONNECTORS_UNKNOWN",
    kind: "unknown",
    name: "76W, stated as needing no connector, which can't both be right",
    over: { GPU: { watts: "76", pcie_6plus2_required: "0" } },
    explains: /supplies at most 75W/,
    overall: "unknown",
  },
  {
    rule: "RULE_F_GPU_CONNECTORS_UNKNOWN",
    kind: "unknown",
    name: "76W, with its connector blank",
    over: { GPU: { watts: "76", pcie_6plus2_required: undefined, pcie_16pin_required: undefined } },
    explains: /connector type isn't stated/,
    overall: "unknown",
  },
  {
    rule: "RULE_F_GPU_POWER_UNKNOWN",
    kind: "unknown",
    name: "neither the card's power nor its connector is stated",
    over: {
      GPU: { watts: undefined, pcie_6plus2_required: undefined, pcie_16pin_required: undefined },
    },
    explains: /no stated power draw or connector/,
    overall: "unknown",
  },
  {
    rule: "RULE_F_PCIE_CONNECTORS_UNKNOWN",
    kind: "unknown",
    name: "the supply states wattage but no connectors",
    over: { PSU: { pcie_6plus2_count: undefined, pcie_16pin_count: undefined } },
    explains: /no stated PCIe power cables/,
    overall: "unknown",
  },
  {
    rule: "RULE_F_PCIE_CONNECTORS_UNKNOWN",
    kind: "unknown",
    name: "a blank count isn't a zero",
    over: { PSU: { pcie_16pin_count: undefined } },
    explains: /no stated PCIe power cables/,
    overall: "unknown",
  },
  {
    rule: "RULE_F_PCIE_POWER_UNKNOWN",
    kind: "unknown",
    name: "the supply states neither wattage nor connectors",
    over: {
      PSU: { capacity_watts: undefined, pcie_6plus2_count: undefined, pcie_16pin_count: undefined },
    },
    explains: /Unable to verify PCIe auxiliary power/,
    overall: "unknown",
  },
  {
    rule: "RULE_F_PCIE_POWER_INSUFFICIENT",
    kind: "negative",
    name: "short of an 8-pin connector",
    over: { PSU: { pcie_6plus2_count: "0" } },
    explains: /short of 1 8-pin/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_F_PCIE_POWER_INSUFFICIENT",
    kind: "negative",
    name: "short of a 16-pin connector",
    over: { GPU: { pcie_6plus2_required: "0", pcie_16pin_required: "1" } },
    explains: /short of 1 16-pin/,
    overall: "incompatible",
    valid: false,
  },

  // ── Rule G: motherboard size ───────────────────────────────────────────────────────────────────
  {
    rule: "RULE_G_FORM_FACTOR_MATCH",
    kind: "positive",
    name: "the cabinet lists the size",
    explains: /MICRO-ATX/,
    overall: "compatible",
    source: { slot: "Cabinet", field: "supportedMotherboards", level: "it_hub_reviewed" },
  },
  {
    rule: "RULE_G_FORM_FACTOR_MISMATCH",
    kind: "negative",
    name: "the cabinet doesn't list the size",
    over: {
      Motherboard: { form_factor: "ATX" },
      Cabinet: { supported_motherboards: '["Mini-ITX"]' },
    },
    explains: /supported: MINI-ITX/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_G_FORM_FACTOR_UNKNOWN",
    kind: "unknown",
    name: "the motherboard's size is blank",
    over: { Motherboard: { form_factor: undefined } },
    explains: /fits inside/,
    overall: "unknown",
  },
  {
    rule: "RULE_G_FORM_FACTOR_UNKNOWN",
    kind: "unknown",
    name: "the cabinet's sizes are blank",
    over: { Cabinet: { supported_motherboards: undefined } },
    explains: /fits inside/,
    overall: "unknown",
  },

  // ── Rule H: storage ────────────────────────────────────────────────────────────────────────────
  {
    rule: "RULE_H_STORAGE_OK",
    kind: "positive",
    name: "an NVMe drive and an M.2 slot",
    explains: /1 M\.2 slot/,
    overall: "compatible",
    source: { slot: "Storage", field: "storageInterface", level: "it_hub_reviewed" },
  },
  {
    rule: "RULE_H_STORAGE_OK",
    kind: "positive",
    name: "a SATA drive and SATA ports",
    over: { Storage: { storage_interface: "SATA SSD" } },
    explains: /4 SATA port/,
    overall: "compatible",
  },
  {
    rule: "RULE_H_STORAGE_SLOT_MISSING",
    kind: "negative",
    name: "an NVMe drive and no M.2 slot",
    over: { Motherboard: { m2_slots: "0" } },
    explains: /0 M\.2 slots/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_H_STORAGE_PORT_MISSING",
    kind: "negative",
    name: "a SATA drive and no SATA port",
    over: { Storage: { storage_interface: "SATA SSD" }, Motherboard: { sata_ports: "0" } },
    explains: /needs a SATA port/,
    overall: "incompatible",
    valid: false,
  },
  {
    rule: "RULE_H_STORAGE_UNKNOWN",
    kind: "unknown",
    name: "the motherboard's M.2 count is blank",
    over: { Motherboard: { m2_slots: undefined } },
    explains: /free connection/,
    overall: "unknown",
  },
  {
    rule: "RULE_H_STORAGE_UNKNOWN",
    kind: "unknown",
    name: "the drive's interface is blank",
    over: { Storage: { storage_interface: undefined } },
    explains: /free connection/,
    overall: "unknown",
  },
  {
    rule: "RULE_H_OWNED_STORAGE_UNCHECKED",
    kind: "unknown",
    name: "the customer's own drive",
    over: { Storage: null },
    options: { ownedSlots: ["Storage"] },
    explains: /connection isn't known here/,
    overall: "unknown",
    valid: true,
    complete: true,
  },

  // ── Rule I: display output ─────────────────────────────────────────────────────────────────────
  {
    rule: "RULE_I_OWNED_GPU_UNCHECKED",
    kind: "unknown",
    name: "the customer's own card",
    over: { GPU: null },
    options: { ownedSlots: ["GPU"] },
    explains: /aren't known here/,
    overall: "unknown",
    valid: true,
    complete: true,
  },
  {
    rule: "RULE_I_GPU_MANDATORY_NO_IGPU",
    kind: "negative",
    name: "no integrated graphics and no card",
    over: { GPU: null },
    explains: /no video signal/,
    overall: "incompatible",
    valid: false,
    complete: false,
  },
  {
    rule: "RULE_I_DISPLAY_OUTPUT_UNKNOWN",
    kind: "unknown",
    name: "nobody has said whether graphics are integrated",
    over: { CPU: { integrated_graphics: undefined }, GPU: null },
    explains: /integrated graphics/,
    overall: "unknown",
    valid: true,
  },
  {
    rule: "RULE_I_GPU_RECOMMENDED_FOR_WORKLOAD",
    kind: "advisory",
    name: "integrated graphics, for gaming",
    over: { CPU: { integrated_graphics: "true" }, GPU: null },
    options: { workload: "gaming" },
    explains: /modern games/,
    overall: "conditional",
    valid: true,
    complete: true,
  },

  // ── Rules J, K and L: where a value came from ──────────────────────────────────────────────────
  {
    rule: "RULE_J_SPEC_UNVERIFIED",
    kind: "advisory",
    name: "a part with no review record",
    over: { Storage: NOT_REVIEWED },
    explains: /full specifications stated/,
    valid: true,
  },
  {
    rule: "RULE_K_SPEC_INVALID",
    kind: "unknown",
    name: "a value that can't be read",
    over: { Cabinet: { cabinet_clearance_mm: "wide" } },
    explains: /isn't being used/,
    overall: "unknown",
    valid: true,
  },
  {
    rule: "RULE_K_SPEC_CONFLICT",
    kind: "unknown",
    name: "the title and the stated value disagree",
    names: { Motherboard: "QZX Validation B550 Board" },
    over: { Motherboard: { socket: "AM5" } },
    explains: /Shopify says AM5, but the title says AM4/,
    overall: "unknown",
    valid: true,
  },
  {
    rule: "RULE_K_REVIEW_INCOMPLETE",
    kind: "unknown",
    name: "marked as reviewed with no source link",
    over: { Cabinet: { spec_source_url: undefined } },
    explains: /count as unreviewed/,
    overall: "unknown",
    valid: true,
  },
  {
    rule: "RULE_K_SPEC_REJECTED",
    kind: "unknown",
    name: "IT HUB has rejected the values",
    over: { GPU: { spec_review_status: "rejected" } },
    explains: /must check this part/,
    overall: "unknown",
    valid: true,
  },
  {
    rule: "RULE_L_SPEC_UNREVIEWED",
    kind: "unknown",
    name: "values stated in Shopify that nobody has reviewed",
    over: { Cabinet: NOT_REVIEWED },
    explains: /hasn't yet checked/,
    overall: "unknown",
    valid: true,
    source: { slot: "Cabinet", field: "maxGpuLengthMm", level: "supplier_provided" },
  },
  {
    rule: "RULE_L_SPEC_UNREVIEWED",
    kind: "unknown",
    name: "a wattage only read from the title",
    names: { PSU: "Corsair CV550 550W" },
    over: { PSU: { ...NOT_REVIEWED, capacity_watts: undefined } },
    explains: /wattage/,
    overall: "unknown",
    source: { slot: "PSU", field: "ratedWattage", level: "title_inferred" },
  },
];

for (const c of CASES) {
  Deno.test(`ADV ${c.kind} ${c.rule}: ${c.name}`, () => {
    const parts = partsFor(c.over, c.names);
    const check = checkCompatibility(parts, c.options as any);
    const item = check.items.find((candidate: any) => candidate.ruleId === c.rule);
    assert(item, `${c.rule} didn't fire. Got: ${check.items.map((i: any) => i.ruleId).join(", ")}`);
    assertEquals(item.status, STATUS_FOR[c.kind]);
    assertEquals(item.severity, SEVERITY_FOR[c.kind]);
    if (c.explains) assertMatch(item.explanation, c.explains);
    assertEquals(
      rulesIn(check, familyOf(c.rule)),
      [c.rule, ...(c.also ?? [])].sort(),
      "only these rules of this family should fire",
    );
    if (c.overall) assertEquals(check.status, c.overall);
    if (c.valid !== undefined) assertEquals(check.valid, c.valid);
    if (c.complete !== undefined) assertEquals(check.complete, c.complete);
    if (c.source) {
      assertEquals(parts[c.source.slot].specs.fieldSources?.[c.source.field], c.source.level);
    }
  });
}

Deno.test("ADV guard: every rule in the engine is in the table, and the table names no other", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../src/lib/builder/compatibility.ts", import.meta.url),
  );
  const inEngine = [
    ...new Set([...source.matchAll(/ruleId: "(RULE_[A-Z0-9_]+)"/g)].map((m) => m[1])),
  ];
  const inTable = [...new Set(CASES.map((c) => c.rule))];
  assertEquals(inTable.sort(), inEngine.sort());
});

Deno.test("ADV guard: the table has positive, negative and unknown cases, and the fixture is clean", () => {
  const count = (kind: Kind) => CASES.filter((c) => c.kind === kind).length;
  assert(count("positive") >= 10);
  assert(count("negative") >= 10);
  assert(count("unknown") >= 10);
  const check = checkCompatibility(partsFor());
  assertEquals(check.status, "compatible");
  assertEquals(
    check.items.filter((item: any) => item.status !== "compatible"),
    [],
  );
});

// ── A blank input never leaves a match behind ────────────────────────────────────────────────────

const MATCH_INPUTS: { rule: string; over?: Overrides; inputs: [Slot, string][] }[] = [
  {
    rule: "RULE_A_SOCKET_MATCH",
    inputs: [
      ["CPU", "socket"],
      ["Motherboard", "socket"],
    ],
  },
  {
    rule: "RULE_B_RAM_MATCH",
    inputs: [
      ["Motherboard", "ram_generation"],
      ["RAM", "ram_generation"],
    ],
  },
  {
    rule: "RULE_B_RAM_LIMITS_OK",
    inputs: [
      ["RAM", "ram_modules"],
      ["RAM", "ram_capacity_gb"],
      ["Motherboard", "ram_slots"],
      ["Motherboard", "max_ram_gb"],
    ],
  },
  {
    rule: "RULE_C_COOLER_SOCKET_MATCH",
    over: { Cooler: {} },
    inputs: [
      ["CPU", "socket"],
      ["Cooler", "supported_sockets"],
    ],
  },
  {
    rule: "RULE_C_COOLER_HEIGHT_OK",
    over: { Cooler: {} },
    inputs: [
      ["Cooler", "cooler_height_mm"],
      ["Cabinet", "max_cooler_height_mm"],
    ],
  },
  {
    rule: "RULE_D_GPU_CLEARANCE_OK",
    inputs: [
      ["GPU", "gpu_length_mm"],
      ["Cabinet", "cabinet_clearance_mm"],
    ],
  },
  {
    rule: "RULE_E_PSU_HEADROOM_ADEQUATE",
    inputs: [
      ["PSU", "capacity_watts"],
      ["CPU", "watts"],
      ["GPU", "watts"],
      ["GPU", "recommended_psu_watts"],
    ],
  },
  {
    rule: "RULE_F_PCIE_POWER_MATCH",
    inputs: [
      ["GPU", "pcie_6plus2_required"],
      ["GPU", "pcie_16pin_required"],
      ["PSU", "pcie_6plus2_count"],
      ["PSU", "pcie_16pin_count"],
    ],
  },
  {
    rule: "RULE_G_FORM_FACTOR_MATCH",
    inputs: [
      ["Motherboard", "form_factor"],
      ["Cabinet", "supported_motherboards"],
    ],
  },
  {
    rule: "RULE_H_STORAGE_OK",
    inputs: [
      ["Storage", "storage_interface"],
      ["Motherboard", "m2_slots"],
    ],
  },
];

for (const { rule, over, inputs } of MATCH_INPUTS) {
  for (const [slot, field] of inputs) {
    Deno.test(`ADV unknown blank input: ${field} on ${slot} leaves no ${rule}`, () => {
      const withValue = checkCompatibility(partsFor(over));
      assert(
        withValue.items.some((item: any) => item.ruleId === rule),
        `${rule} should fire with every value stated`,
      );
      const blank = checkCompatibility(
        partsFor({ ...over, [slot]: { ...over?.[slot], [field]: undefined } }),
      );
      assert(!blank.items.some((item: any) => item.ruleId === rule));
      assertEquals(blank.status, "unknown");
    });
  }
}

// ── Limits are exact ─────────────────────────────────────────────────────────────────────────────

const BOUNDARIES: {
  name: string;
  over: (value: string) => Overrides;
  at: string;
  past: string;
  ok: string;
  bad: string;
}[] = [
  {
    name: "card length against the cabinet's 300mm",
    over: (value) => ({ GPU: { gpu_length_mm: value } }),
    at: "300",
    past: "301",
    ok: "RULE_D_GPU_CLEARANCE_OK",
    bad: "RULE_D_GPU_LENGTH_EXCEEDED",
  },
  {
    name: "cooler height against the cabinet's 160mm",
    over: (value) => ({ Cooler: { cooler_height_mm: value } }),
    at: "160",
    past: "161",
    ok: "RULE_C_COOLER_HEIGHT_OK",
    bad: "RULE_C_COOLER_HEIGHT_EXCEEDED",
  },
  {
    name: "modules against the motherboard's 2 slots",
    over: (value) => ({ RAM: { ram_modules: value } }),
    at: "2",
    past: "3",
    ok: "RULE_B_RAM_LIMITS_OK",
    bad: "RULE_B_RAM_SLOTS_EXCEEDED",
  },
  {
    name: "capacity against the motherboard's 64GB",
    over: (value) => ({ RAM: { ram_capacity_gb: value } }),
    at: "64",
    past: "65",
    ok: "RULE_B_RAM_LIMITS_OK",
    bad: "RULE_B_RAM_CAPACITY_EXCEEDED",
  },
  {
    name: "a supply's wattage against the 286W load, descending",
    over: (value) => ({ GPU: { recommended_psu_watts: "286" }, PSU: { capacity_watts: value } }),
    at: "286",
    past: "285",
    ok: "RULE_E_PSU_HEADROOM_LIMITED",
    bad: "RULE_E_PSU_WATTAGE_DEFICIT",
  },
  {
    name: "a supply's wattage against the maker's 550W, descending",
    over: (value) => ({ PSU: { capacity_watts: value } }),
    at: "550",
    past: "549",
    ok: "RULE_E_PSU_HEADROOM_ADEQUATE",
    bad: "RULE_E_PSU_BELOW_RECOMMENDED",
  },
];

for (const b of BOUNDARIES) {
  Deno.test(`ADV boundary: ${b.name}`, () => {
    const rules = (value: string) =>
      checkCompatibility(partsFor(b.over(value))).items.map((item: any) => item.ruleId);
    assert(rules(b.at).includes(b.ok), `at the limit: ${rules(b.at).join(", ")}`);
    assert(!rules(b.at).includes(b.bad), `at the limit: ${rules(b.at).join(", ")}`);
    assert(rules(b.past).includes(b.bad), `past the limit: ${rules(b.past).join(", ")}`);
    assert(!rules(b.past).includes(b.ok), `past the limit: ${rules(b.past).join(", ")}`);
  });
}

// ── Conditions a rule depends on ─────────────────────────────────────────────────────────────────

Deno.test("ADV condition: a boxed cooler raises no height check, whatever the cabinet states", () => {
  const check = checkCompatibility(partsFor({ Cabinet: { max_cooler_height_mm: undefined } }));
  assertEquals(rulesIn(check, "RULE_C_"), []);
  assertEquals(check.status, "compatible");
});

Deno.test("ADV condition: a graphics card is only recommended for gaming and creation", () => {
  const over: Overrides = { CPU: { integrated_graphics: "true" }, GPU: null };
  const rule = "RULE_I_GPU_RECOMMENDED_FOR_WORKLOAD";
  for (const workload of ["gaming", "creation"]) {
    const check = checkCompatibility(partsFor(over), { workload } as any);
    assert(check.items.some((item: any) => item.ruleId === rule));
  }
  for (const workload of ["work", "general", undefined]) {
    const check = checkCompatibility(partsFor(over), { workload } as any);
    assert(!check.items.some((item: any) => item.ruleId === rule));
  }
});

Deno.test("ADV condition: choosing a part replaces the customer's own", () => {
  const owned = ["RAM", "Storage", "GPU"];
  const check = checkCompatibility(partsFor(), { ownedSlots: owned } as any);
  for (const rule of [
    "RULE_B_OWNED_RAM_UNCHECKED",
    "RULE_H_OWNED_STORAGE_UNCHECKED",
    "RULE_I_OWNED_GPU_UNCHECKED",
  ]) {
    assert(!check.items.some((item: any) => item.ruleId === rule), rule);
  }
  assertEquals(check.status, "compatible");
});

Deno.test("ADV condition: a blank slot with nothing owned isn't described as the customer's own", () => {
  const check = checkCompatibility(partsFor({ RAM: null, Storage: null }));
  assert(!check.items.some((item: any) => /OWNED/.test(item.ruleId)));
  assertEquals(check.complete, false);
});

Deno.test("ADV condition: an owned card's unknown power still goes to review", () => {
  const check = checkCompatibility(partsFor({ GPU: null }), { ownedSlots: ["GPU"] } as any);
  assert(check.items.some((item: any) => item.ruleId === "RULE_E_POWER_DRAW_UNKNOWN"));
  assertEquals(check.hasBlockingUnknowns, true);
});

// ── Where a value came from ──────────────────────────────────────────────────────────────────────

Deno.test("ADV provenance: a Shopify review never reads as manufacturer verified", () => {
  const parts = partsFor({ Cooler: {} });
  for (const part of Object.values(parts) as any[]) {
    assertEquals(part.specs.provenance, "it_hub_reviewed", part.slot);
    for (const level of Object.values(part.specs.fieldSources ?? {})) {
      assert(level !== "manufacturer_verified", `${part.slot}: ${level}`);
    }
  }
});

Deno.test("ADV provenance: a supplier's claim isn't a review, even when marked as one", () => {
  const parts = partsFor({ Cabinet: { spec_source: "supplier" } });
  assertEquals(parts.Cabinet.specs.fieldSources.maxGpuLengthMm, "supplier_provided");
  const check = checkCompatibility(parts);
  assert(check.items.some((item: any) => item.ruleId === "RULE_K_REVIEW_INCOMPLETE"));
  assertEquals(check.hasBlockingUnknowns, true);
});

Deno.test("ADV provenance: a title-read value is labelled as one, and goes to review", () => {
  const parts = partsFor(
    { GPU: { ...NOT_REVIEWED, watts: undefined, recommended_psu_watts: undefined } },
    { GPU: "Gigabyte RTX 4060 Validation 8GB" },
  );
  assertEquals(parts.GPU.specs.fieldSources.powerWatts, "title_inferred");
  assertEquals(parts.GPU.specs.fieldSources.recommendedPsuWatts, "title_inferred");
  const check = checkCompatibility(parts);
  assert(check.items.some((item: any) => item.ruleId === "RULE_L_SPEC_UNREVIEWED"));
  assertEquals(check.hasBlockingUnknowns, true);
});

Deno.test("ADV provenance: a value changed after its review stops counting as reviewed", () => {
  const products = productsFor();
  const cabinet = products.find((p) => p.category === "Computer Cases");
  cabinet.specUpdatedAt = { cabinet_clearance_mm: "2026-11-03T10:00:00Z" };
  const part: any = syncBuilderCatalogWithShopify(products).componentCatalog.Cabinet[0];
  assertEquals(part.specs.fieldSources.maxGpuLengthMm, "supplier_provided");
  assertEquals(part.specs.fieldSources.maxCoolerHeightMm, "it_hub_reviewed");
});

// ── Find My PC follows the rules ─────────────────────────────────────────────────────────────────

const offer = (over?: Overrides, purpose = "gaming") =>
  generateDynamicCatalogRecommendations(
    catalogueFor(over),
    { purpose, details: {}, brands: [], wifi: "", owned: [] },
    { min: 0, max: 900000 },
    { allowUnverified: true },
  ) as any[];

Deno.test("ADV search: the fully stated fixture is offered, and needs no review", () => {
  const builds = offer();
  assertEquals(builds.length, 1);
  assertEquals(builds[0].requiresReview, false);
});

const NO_COOLER = { includes_cooler: "false" };
const MISMATCHES: { rule: string; over: Overrides }[] = [
  { rule: "RULE_A_SOCKET_MISMATCH", over: { CPU: { socket: "AM5" } } },
  { rule: "RULE_B_RAM_MISMATCH", over: { RAM: { ram_generation: "DDR5" } } },
  { rule: "RULE_B_RAM_SODIMM_ERROR", over: { RAM: { ram_module_type: "SO-DIMM" } } },
  { rule: "RULE_B_RAM_SLOTS_EXCEEDED", over: { RAM: { ram_modules: "3" } } },
  { rule: "RULE_B_RAM_CAPACITY_EXCEEDED", over: { RAM: { ram_capacity_gb: "65" } } },
  {
    rule: "RULE_C_COOLER_SOCKET_MISMATCH",
    over: { CPU: NO_COOLER, Cooler: { supported_sockets: '["AM5"]' } },
  },
  {
    rule: "RULE_C_COOLER_HEIGHT_EXCEEDED",
    over: { CPU: NO_COOLER, Cooler: { cooler_height_mm: "161" } },
  },
  { rule: "RULE_D_GPU_LENGTH_EXCEEDED", over: { GPU: { gpu_length_mm: "301" } } },
  { rule: "RULE_E_PSU_WATTAGE_DEFICIT", over: { PSU: { capacity_watts: "285" } } },
  { rule: "RULE_F_PCIE_POWER_INSUFFICIENT", over: { PSU: { pcie_6plus2_count: "0" } } },
  {
    rule: "RULE_G_FORM_FACTOR_MISMATCH",
    over: {
      Motherboard: { form_factor: "ATX" },
      Cabinet: { supported_motherboards: '["Mini-ITX"]' },
    },
  },
  { rule: "RULE_H_STORAGE_SLOT_MISSING", over: { Motherboard: { m2_slots: "0" } } },
  {
    rule: "RULE_H_STORAGE_PORT_MISSING",
    over: { Storage: { storage_interface: "SATA SSD" }, Motherboard: { sata_ports: "0" } },
  },
  { rule: "RULE_I_GPU_MANDATORY_NO_IGPU", over: { GPU: null } },
];

for (const { rule, over } of MISMATCHES) {
  Deno.test(`ADV search: a mismatch is never offered, ${rule}`, () => {
    assertEquals(offer(over), []);
  });
}

const UNKNOWNS: { rule: string; over: Overrides }[] = [
  { rule: "RULE_A_SOCKET_UNKNOWN", over: { CPU: { socket: undefined } } },
  { rule: "RULE_B_RAM_LIMITS_UNKNOWN", over: { RAM: { ram_modules: undefined } } },
  { rule: "RULE_D_GPU_CLEARANCE_UNKNOWN", over: { GPU: { gpu_length_mm: undefined } } },
  { rule: "RULE_E_PSU_WATTAGE_UNKNOWN", over: { PSU: { capacity_watts: undefined } } },
  { rule: "RULE_F_PCIE_CONNECTORS_UNKNOWN", over: { PSU: { pcie_6plus2_count: undefined } } },
  { rule: "RULE_G_FORM_FACTOR_UNKNOWN", over: { Motherboard: { form_factor: undefined } } },
  { rule: "RULE_H_STORAGE_UNKNOWN", over: { Storage: { storage_interface: undefined } } },
  { rule: "RULE_L_SPEC_UNREVIEWED", over: { Cabinet: NOT_REVIEWED } },
];

for (const { rule, over } of UNKNOWNS) {
  Deno.test(`ADV search: an unknown is offered only for review, ${rule}`, () => {
    const builds = offer(over);
    assert(builds.length > 0);
    for (const build of builds) {
      assertEquals(build.requiresReview, true);
      assertEquals(build.confidenceBadge, "review");
    }
    assertEquals(
      generateDynamicCatalogRecommendations(
        catalogueFor(over),
        { purpose: "gaming", details: {}, brands: [], wifi: "", owned: [] },
        { min: 0, max: 900000 },
      ),
      [],
    );
  });
}
