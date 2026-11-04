// src/lib/builder/spec-schema.ts
// The one definition of the pc_builder metafields: their types, units, ranges and allowed values. The
// parser reads products with it, and the Admin audit compares Shopify's definitions against it.
// A value from Shopify can reach it_hub_reviewed at most. Only the code registry is manufacturer_verified.

import type { ComponentSlotId, TechnicalSpecs } from "./types";

export type SpecConfidence =
  | "manufacturer_verified"
  | "it_hub_reviewed"
  | "supplier_provided"
  | "title_inferred"
  | "unknown";

export interface SpecProblem {
  field: string;
  kind: "invalid" | "conflict";
  detail: string;
}

export const SOCKETS = ["AM4", "AM5", "LGA1700", "LGA1851", "LGA1200"] as const;
export const RAM_GENERATIONS = ["DDR4", "DDR5"] as const;
export const FORM_FACTORS = ["E-ATX", "ATX", "Micro-ATX", "Mini-ITX"] as const;
export const STORAGE_INTERFACES = ["M.2 NVMe", "M.2 SATA", "SATA SSD", "SATA HDD"] as const;
export const RAM_MODULE_TYPES = ["DIMM", "SO-DIMM"] as const;
export const SPEC_SOURCES = ["manufacturer_datasheet", "supplier", "it_hub_measured"] as const;
export const REVIEW_STATUSES = ["unreviewed", "reviewed", "rejected"] as const;

export type MetafieldType =
  | "number_integer"
  | "single_line_text_field"
  | "list.single_line_text_field"
  | "boolean"
  | "url"
  | "date";

export interface MetafieldDefinition {
  key: string;
  type: MetafieldType;
  unit?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  choices?: readonly string[];
  /** Reviewer names stay out of the public API. */
  storefront: "public" | "none";
  /** Read so existing data isn't lost, but new entries should use the keys that replace it. */
  legacy?: boolean;
}

const integer = (key: string, min: number, max: number, unit?: string): MetafieldDefinition => ({
  key,
  type: "number_integer",
  min,
  max,
  unit,
  storefront: "public",
});
const choice = (key: string, choices: readonly string[]): MetafieldDefinition => ({
  key,
  type: "single_line_text_field",
  choices,
  storefront: "public",
});
const list = (key: string, choices?: readonly string[]): MetafieldDefinition => ({
  key,
  type: "list.single_line_text_field",
  choices,
  storefront: "public",
});
const flag = (key: string): MetafieldDefinition => ({ key, type: "boolean", storefront: "public" });

export const PC_BUILDER_METAFIELDS: MetafieldDefinition[] = [
  // Review record, one per product.
  choice("spec_source", SPEC_SOURCES),
  choice("spec_review_status", REVIEW_STATUSES),
  { key: "spec_source_url", type: "url", storefront: "public" },
  { key: "spec_reviewed_on", type: "date", storefront: "public" },
  { key: "spec_reviewed_by", type: "single_line_text_field", maxLength: 20, storefront: "none" },
  { key: "exact_model", type: "single_line_text_field", maxLength: 120, storefront: "public" },
  // Processor and motherboard.
  choice("socket", SOCKETS),
  list("supported_ram_generations", RAM_GENERATIONS),
  choice("ram_generation", RAM_GENERATIONS),
  integer("watts", 1, 1000, "W"),
  integer("cpu_max_power_watts", 1, 1000, "W"),
  flag("integrated_graphics"),
  flag("includes_cooler"),
  choice("form_factor", FORM_FACTORS),
  integer("ram_slots", 1, 8),
  integer("max_ram_gb", 1, 4096, "GB"),
  integer("m2_slots", 0, 12),
  integer("sata_ports", 0, 12),
  flag("wifi"),
  flag("bios_update_required"),
  // Memory.
  integer("ram_capacity_gb", 1, 1024, "GB"),
  integer("ram_modules", 1, 8),
  integer("ram_speed_mhz", 1000, 12000, "MHz"),
  choice("ram_module_type", RAM_MODULE_TYPES),
  // Graphics card.
  integer("gpu_length_mm", 50, 500, "mm"),
  integer("recommended_psu_watts", 100, 2000, "W"),
  integer("pcie_6plus2_required", 0, 4),
  integer("pcie_16pin_required", 0, 2),
  integer("pcie_16pin_adapter_8pin_count", 0, 4),
  // Power supply.
  integer("capacity_watts", 100, 3000, "W"),
  integer("pcie_6plus2_count", 0, 12),
  integer("pcie_16pin_count", 0, 4),
  { ...list("pcie_connectors"), legacy: true },
  // Cabinet.
  list("supported_motherboards", FORM_FACTORS),
  integer("cabinet_clearance_mm", 100, 600, "mm"),
  integer("max_cooler_height_mm", 50, 250, "mm"),
  // Storage.
  choice("storage_interface", STORAGE_INTERFACES),
  integer("storage_capacity_gb", 1, 100000, "GB"),
  // Cooler.
  list("supported_sockets", SOCKETS),
  integer("cooler_height_mm", 20, 250, "mm"),
];

const definition = (key: string) => PC_BUILDER_METAFIELDS.find((field) => field.key === key)!;

export function normalizeSocket(value: unknown): string | undefined {
  const compact = String(value ?? "")
    .toUpperCase()
    .replace(/[\s_-]/g, "");
  const found = SOCKETS.filter((socket) => {
    const digits = socket.replace("LGA", "");
    return socket.startsWith("LGA")
      ? new RegExp(`(?:^|[^0-9])${digits}(?:[^0-9]|$)`).test(compact)
      : compact.includes(socket);
  });
  return found.length === 1 ? found[0] : undefined;
}

export function normalizeRamGeneration(value: unknown): string | undefined {
  const text = String(value ?? "").toUpperCase();
  const found = RAM_GENERATIONS.filter((generation) => text.includes(generation));
  return found.length === 1 ? found[0] : undefined;
}

export function normalizeFormFactorName(value: unknown): string | undefined {
  const compact = String(value ?? "")
    .toUpperCase()
    .replace(/[\s_.-]/g, "");
  if (compact === "EATX") return "E-ATX";
  if (compact === "ATX") return "ATX";
  if (compact === "MATX" || compact === "MICROATX" || compact === "UATX") return "Micro-ATX";
  if (compact === "ITX" || compact === "MINIITX") return "Mini-ITX";
  return undefined;
}

export function normalizeStorageInterface(value: unknown): string | undefined {
  const text = String(value ?? "").toLowerCase();
  if (/nvme|pcie/.test(text)) return "M.2 NVMe";
  if (/m\.?2/.test(text) && /sata/.test(text)) return "M.2 SATA";
  if (/hdd|hard/.test(text)) return "SATA HDD";
  if (/sata/.test(text)) return "SATA SSD";
  return undefined;
}

/** A list from Shopify's own list type, which arrives as JSON, or typed text such as "ATX, Micro-ATX". */
export function parseListValue(value: unknown): string[] {
  const text = String(value ?? "").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return text
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseBooleanValue(value: unknown): boolean | undefined {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["true", "yes", "1"].includes(text)) return true;
  if (["false", "no", "0"].includes(text)) return false;
  return undefined;
}

/** A whole number with at most its own unit after it. Anything else gives no value. */
export function parseIntegerValue(key: string, value: unknown): number | undefined {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(?:w|watts?|gb|mm|mhz)?$/i);
  if (!match) return undefined;
  const parsed = Math.round(Number(match[1]));
  const { min = -Infinity, max = Infinity } = definition(key) || {};
  return parsed >= min && parsed <= max ? parsed : undefined;
}

export interface PcieConnectors {
  sixPin: number;
  /** 8-pin, including 6+2-pin plugs. */
  eightPin: number;
  sixteenPin: number;
}

/**
 * Reads connector wording such as "6+2-pin", "2x 8-pin" or "1x 16-pin (12VHPWR)". "None" means zero
 * connectors, and wording this can't read gives no answer rather than a guess.
 */
export function readPcieConnectors(entries: string[]): PcieConnectors | undefined {
  const total = { sixPin: 0, eightPin: 0, sixteenPin: 0 };
  for (const entry of entries) {
    for (const part of connectorPhrases(entry)) {
      if (NO_CONNECTOR.test(part)) continue;
      // A processor's EPS cable is a different plug, so it can't count towards a graphics card.
      if (CPU_POWER_CONNECTOR.test(part)) continue;
      const count = connectorCount(part);
      if (count === undefined) return undefined;
      if (/16[\s-]*pin|12\s*vhpwr|12v[\s-]*2[x×]6|12p4/.test(part)) total.sixteenPin += count;
      else if (/6p2|8[\s-]*pin/.test(part)) total.eightPin += count;
      else if (/6[\s-]*pin/.test(part)) total.sixPin += count;
      else return undefined;
    }
  }
  return total;
}

const NO_CONNECTOR =
  /^(?:none(?: required)?|no|nil|zero|0|n\/a|not required|no (?:external |pcie |auxiliary )?(?:power )?connectors?(?: required)?)$/;
const CPU_POWER_CONNECTOR = /\beps\b|\bcpu\b|\b4p4\b|\batx\s*12v\b/;
const NUMBER_WORDS: Record<string, number> = {
  single: 1,
  one: 1,
  dual: 2,
  two: 2,
  triple: 3,
  three: 3,
  quad: 4,
  four: 4,
};

/** Splits "2x 8-pin + 1x 6-pin" into phrases, without breaking the plus inside "6+2" or "12+4". */
function connectorPhrases(entry: string): string[] {
  return entry
    .trim()
    .toLowerCase()
    .replace(/\b6\s*\+\s*8[\s-]*pin/g, "6-pin,8-pin")
    .replace(/\b8\s*\+\s*8[\s-]*pin/g, "2x 8-pin")
    .replace(/\b6\s*\+\s*2/g, "6p2")
    .replace(/\b12\s*\+\s*4/g, "12p4")
    .replace(/\b4\s*\+\s*4/g, "4p4")
    .split(/[,;+&]|\band\b/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** How many a phrase states, from "2x", "x 2", "dual" or "connectors-0". One if it gives no count. */
function connectorCount(part: string): number | undefined {
  const leading = part.match(/^(\d+)\s*(?:x|×|\*)\s*/) ?? part.match(/^(\d+)\s+(?=\S*\d)/);
  if (leading) return Number(leading[1]);
  const trailing = part.match(/(?:\s(?:x|×|\*)\s*|connectors?\s*[-:=]\s*)(\d+)$/);
  if (trailing) return Number(trailing[1]);
  const word = part.match(/^(single|one|dual|two|triple|three|quad|four)\b/);
  if (word) return NUMBER_WORDS[word[1]];
  return 1;
}

export interface SpecReview {
  status: (typeof REVIEW_STATUSES)[number];
  sourceUrl?: string;
  /** Marked reviewed, with a source to check it against. */
  isReviewed: boolean;
}

export function readSpecReview(raw: Record<string, unknown>): SpecReview {
  const status = String(raw["spec_review_status"] ?? "")
    .trim()
    .toLowerCase();
  const known = (REVIEW_STATUSES as readonly string[]).includes(status)
    ? (status as SpecReview["status"])
    : "unreviewed";
  const url = String(raw["spec_source_url"] ?? "").trim();
  const sourceUrl = /^https:\/\/\S+\.\S+$/.test(url) ? url : undefined;
  return { status: known, sourceUrl, isReviewed: known === "reviewed" && Boolean(sourceUrl) };
}

const firstStated = (raw: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
};

export interface StatedSpecs {
  specs: TechnicalSpecs;
  problems: SpecProblem[];
}

/**
 * Reads what Shopify's fields state for a product of this kind. A blank field gives no value. A value
 * that can't be read, or falls outside its range, gives no value and a problem for staff to fix.
 */
export function readStatedSpecs(slot: ComponentSlotId, raw: Record<string, unknown>): StatedSpecs {
  const specs: TechnicalSpecs = {};
  const problems: SpecProblem[] = [];
  const invalid = (field: string, value: unknown) =>
    problems.push({ field, kind: "invalid", detail: `"${String(value)}" isn't a valid ${field}` });

  const read = <T>(
    keys: string[],
    parse: (value: unknown) => T | undefined,
    assign: (value: T) => void,
  ) => {
    const value = firstStated(raw, keys);
    if (value === undefined) return;
    const parsed = parse(value);
    if (parsed === undefined) invalid(keys[keys.length - 1], value);
    else assign(parsed);
  };
  const number = (key: string, aliases: string[], assign: (value: number) => void) =>
    read([...aliases, key], (value) => parseIntegerValue(key, value), assign);
  const bool = (key: string, assign: (value: boolean) => void) =>
    read([key], parseBooleanValue, assign);
  const names = (
    key: string,
    parse: (value: unknown) => string | undefined,
    assign: (value: string[]) => void,
  ) =>
    read(
      [key],
      (value) => {
        const items = parseListValue(value).map(parse);
        return items.length > 0 && items.every(Boolean) ? (items as string[]) : undefined;
      },
      assign,
    );
  const ramGeneration = (assign: (value: string) => void) =>
    read(["RAM Generation", "Memory", "ram_generation"], normalizeRamGeneration, assign);

  if (slot === "CPU" || slot === "Motherboard") {
    read(["Socket", "socket"], normalizeSocket, (value) => (specs.socket = value));
    ramGeneration((value) => {
      specs.supportedRamGeneration = value;
      specs.ramGeneration = value;
    });
  }
  if (slot === "CPU") {
    names(
      "supported_ram_generations",
      normalizeRamGeneration,
      (value) => (specs.supportedRamGen = value),
    );
    number("watts", ["TDP", "tdp_watts"], (value) => (specs.tdpWatts = value));
    number("cpu_max_power_watts", [], (value) => (specs.maxTurboPowerWatts = value));
    bool("integrated_graphics", (value) => (specs.hasIntegratedGraphics = value));
    bool("includes_cooler", (value) => (specs.includesCooler = value));
  }
  if (slot === "Motherboard") {
    read(["form_factor"], normalizeFormFactorName, (value) => (specs.formFactor = value));
    number("ram_slots", [], (value) => (specs.ramSlots = value));
    number("max_ram_gb", [], (value) => (specs.maxRamCapacityGb = value));
    number("m2_slots", [], (value) => (specs.m2SlotCount = value));
    number("sata_ports", [], (value) => (specs.sataPortCount = value));
    bool("wifi", (value) => (specs.hasWifi = value));
    bool("bios_update_required", (value) => {
      if (value) specs.requiresBiosUpdateForRyzen5000 = true;
    });
  }
  if (slot === "RAM") {
    ramGeneration((value) => {
      specs.ramGeneration = value;
      specs.supportedRamGeneration = value;
    });
    number("ram_capacity_gb", [], (value) => (specs.capacityGb = value));
    number("ram_modules", [], (value) => (specs.moduleCount = value));
    number("ram_speed_mhz", [], (value) => (specs.speedMhz = value));
    read(
      ["ram_module_type"],
      (value) => {
        const text = String(value).toUpperCase().replace(/[\s-]/g, "");
        return text === "SODIMM" ? true : text === "DIMM" ? false : undefined;
      },
      (value) => (specs.isLaptopSoDimm = value),
    );
  }
  if (slot === "GPU") {
    number("watts", ["TDP", "tdp_watts"], (value) => {
      specs.tdpWatts = value;
      specs.powerWatts = value;
    });
    number("gpu_length_mm", [], (value) => (specs.lengthMm = value));
    number("recommended_psu_watts", [], (value) => (specs.recommendedPsuWatts = value));
    number("pcie_6plus2_required", [], (value) => (specs.pcie6Plus2Required = value));
    number("pcie_16pin_required", [], (value) => (specs.pcie16PinRequired = value));
    number(
      "pcie_16pin_adapter_8pin_count",
      [],
      (value) => (specs.pcie16PinAdapter8PinCount = value),
    );
    read(
      ["pcie_connectors"],
      (value) => {
        const items = parseListValue(value);
        return items.length > 0 && readPcieConnectors(items) ? items : undefined;
      },
      (value) => (specs.requiredPcieConnectors = value),
    );
  }
  if (slot === "PSU") {
    number("capacity_watts", [], (value) => (specs.ratedWattage = value));
    number("pcie_6plus2_count", [], (value) => (specs.pcie6Plus2Count = value));
    number("pcie_16pin_count", [], (value) => (specs.pcie16PinCount = value));
    read(
      ["pcie_connectors"],
      (value) => {
        const items = parseListValue(value);
        return items.length > 0 && readPcieConnectors(items) ? items : undefined;
      },
      (value) => (specs.pciePowerConnectors = value),
    );
  }
  if (slot === "Cabinet") {
    names(
      "supported_motherboards",
      normalizeFormFactorName,
      (value) => (specs.supportedMotherboards = value),
    );
    number("cabinet_clearance_mm", [], (value) => (specs.maxGpuLengthMm = value));
    number("max_cooler_height_mm", [], (value) => (specs.maxCoolerHeightMm = value));
  }
  if (slot === "Storage") {
    read(
      ["storage_interface"],
      normalizeStorageInterface,
      (value) => (specs.storageInterface = value),
    );
    number("storage_capacity_gb", [], (value) => (specs.storageCapacityGb = value));
  }
  if (slot === "Cooler") {
    names("supported_sockets", normalizeSocket, (value) => (specs.supportedSockets = value));
    number("cooler_height_mm", [], (value) => (specs.coolerHeightMm = value));
  }

  const review = readSpecReview(raw);
  if (review.status === "reviewed" && !review.isReviewed) {
    problems.push({
      field: "spec_source_url",
      kind: "invalid",
      detail: "marked reviewed, but no valid https source link is set",
    });
  }
  return { specs, problems };
}

/** Whether two values of a specification say the same thing. */
export function sameSpecValue(a: unknown, b: unknown): boolean {
  const normal = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((item) => String(item).toUpperCase())
          .sort()
          .join("|")
      : String(value).toUpperCase();
  return normal(a) === normal(b);
}

/** Where a specification came from, for fields with no per-value record. */
export function confidenceFromProvenance(provenance?: string): SpecConfidence {
  switch (provenance) {
    case "manufacturer_verified":
    case "verified_manufacturer":
      return "manufacturer_verified";
    case "it_hub_reviewed":
    case "verified_technician":
    case "internal_verified":
      return "it_hub_reviewed";
    case "supplier_spec":
    case "registry_unverified":
      return "supplier_provided";
    case "title_derived":
      return "title_inferred";
    default:
      return "unknown";
  }
}

export const CONFIRMED_CONFIDENCE = new Set<SpecConfidence>([
  "manufacturer_verified",
  "it_hub_reviewed",
]);

export interface AdminMetafieldDefinition {
  namespace: string;
  key: string;
  type: string;
  validations?: { name: string; value: string }[];
  storefrontAccess?: string;
}

export interface DefinitionFinding {
  key: string;
  status:
    | "matches"
    | "missing"
    | "wrong_type"
    | "different_validation"
    | "wrong_access"
    | "unexpected";
  detail: string;
}

/**
 * Compares the definitions Shopify's Admin API reports with this schema. Read-only: it only reports.
 */
export function compareDefinitions(actual: AdminMetafieldDefinition[]): DefinitionFinding[] {
  const inNamespace = actual.filter((item) => item.namespace === "pc_builder");
  const findings: DefinitionFinding[] = [];
  for (const wanted of PC_BUILDER_METAFIELDS) {
    const found = inNamespace.find((item) => item.key === wanted.key);
    if (!found) {
      findings.push({ key: wanted.key, status: "missing", detail: `needs ${wanted.type}` });
      continue;
    }
    if (found.type !== wanted.type) {
      findings.push({
        key: wanted.key,
        status: "wrong_type",
        detail: `is ${found.type}, needs ${wanted.type}. Shopify doesn't allow a definition's type to change`,
      });
      continue;
    }
    const wantsPublic = wanted.storefront === "public";
    const isPublic = found.storefrontAccess === "PUBLIC_READ";
    if (wantsPublic !== isPublic) {
      findings.push({
        key: wanted.key,
        status: "wrong_access",
        detail: `storefront access is ${found.storefrontAccess ?? "unset"}, needs ${wantsPublic ? "PUBLIC_READ" : "NONE"}`,
      });
      continue;
    }
    const validations = Object.fromEntries((found.validations || []).map((v) => [v.name, v.value]));
    const different: string[] = [];
    if (wanted.min !== undefined && String(validations.min) !== String(wanted.min))
      different.push("min");
    if (wanted.max !== undefined && String(validations.max) !== String(wanted.max))
      different.push("max");
    if (wanted.choices) {
      let choices: string[] = [];
      try {
        choices = JSON.parse(validations.choices ?? "[]");
      } catch {
        choices = [];
      }
      if (!sameSpecValue(choices, [...wanted.choices])) different.push("choices");
    }
    findings.push(
      different.length > 0
        ? {
            key: wanted.key,
            status: "different_validation",
            detail: `differs on ${different.join(", ")}`,
          }
        : { key: wanted.key, status: "matches", detail: "as proposed" },
    );
  }
  for (const item of inNamespace) {
    if (!PC_BUILDER_METAFIELDS.some((field) => field.key === item.key)) {
      findings.push({
        key: item.key,
        status: "unexpected",
        detail: `${item.type}, not in the schema`,
      });
    }
  }
  return findings;
}
