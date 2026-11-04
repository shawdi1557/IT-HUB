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
  /**
   * invalid: a value couldn't be read. conflict: two sources disagree. review: the review record doesn't
   * hold up, so the values count as unreviewed. rejected: IT HUB marked this product's values as wrong.
   */
  kind: "invalid" | "conflict" | "review" | "rejected";
  /** Wording a customer can read. The field is an internal key and stays out of customer text. */
  label?: string;
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
  /** Why this key is read if present, but isn't created in Shopify. */
  notCreated?: string;
}

export const PC_BUILDER_NAMESPACE = "pc_builder";

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
  {
    key: "exact_model",
    type: "single_line_text_field",
    maxLength: 120,
    storefront: "public",
    notCreated: "nothing uses it yet, so filling it in would change nothing",
  },
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
  {
    ...list("pcie_connectors"),
    legacy: true,
    notCreated: "it exists only to read older data, and the store holds none",
  },
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

/** The definitions Shopify should hold. A definition's type and key can't be changed once created. */
export const PC_BUILDER_DEFINITIONS_TO_CREATE = PC_BUILDER_METAFIELDS.filter(
  (field) => !field.notCreated,
);

/** What staff see in Shopify Admin for each definition. */
const FIELD_LABELS: Record<string, { name: string; description: string }> = {
  spec_source: {
    name: "Spec source",
    description: "Where these specifications came from.",
  },
  spec_review_status: {
    name: "Spec review status",
    description: "Reviewed means someone at IT HUB checked these values against the source link.",
  },
  spec_source_url: {
    name: "Spec source link",
    description: "The https page the values were checked against. Required for a review to count.",
  },
  spec_reviewed_on: { name: "Spec reviewed on", description: "The date of the review." },
  spec_reviewed_by: {
    name: "Spec reviewed by",
    description: "The reviewer's initials. Not shown publicly.",
  },
  // Read if present, though never created. Named here because a value can still need describing.
  pcie_connectors: {
    name: "PCIe power connectors",
    description: "Older wording for a part's PCIe power connectors.",
  },
  exact_model: { name: "Exact model", description: "The maker's exact model name." },
  socket: { name: "CPU socket", description: "For a processor or motherboard." },
  supported_ram_generations: {
    name: "Supported RAM generations",
    description: "For a processor. Choose each generation it supports.",
  },
  ram_generation: {
    name: "RAM generation",
    description: "For a memory kit, or the generation a motherboard takes.",
  },
  watts: {
    name: "Power (W)",
    description: "A processor's base power, or a graphics card's board power, in watts.",
  },
  cpu_max_power_watts: {
    name: "CPU maximum power (W)",
    description: "The most a processor can draw, in watts, if the maker states it.",
  },
  integrated_graphics: {
    name: "Has integrated graphics",
    description: "For a processor.",
  },
  includes_cooler: { name: "Includes a cooler", description: "For a boxed processor." },
  form_factor: { name: "Motherboard size", description: "For a motherboard." },
  ram_slots: { name: "RAM slots", description: "For a motherboard." },
  max_ram_gb: { name: "Maximum RAM (GB)", description: "For a motherboard, in GB." },
  m2_slots: { name: "M.2 slots", description: "For a motherboard." },
  sata_ports: { name: "SATA ports", description: "For a motherboard." },
  wifi: { name: "Has built-in Wi-Fi", description: "For a motherboard." },
  bios_update_required: {
    name: "May need a BIOS update",
    description: "For a motherboard that may need an update to boot a newer processor.",
  },
  ram_capacity_gb: { name: "RAM kit capacity (GB)", description: "The whole kit's size, in GB." },
  ram_modules: { name: "RAM sticks in kit", description: "How many sticks are in the kit." },
  ram_speed_mhz: { name: "RAM speed (MHz)", description: "The kit's rated speed." },
  ram_module_type: {
    name: "RAM module type",
    description: "DIMM for desktops. SO-DIMM is for laptops.",
  },
  gpu_length_mm: { name: "Graphics card length (mm)", description: "Rounded up to a whole mm." },
  recommended_psu_watts: {
    name: "Recommended PSU (W)",
    description: "The wattage the graphics card's maker recommends.",
  },
  pcie_6plus2_required: {
    name: "8-pin plugs the card needs",
    description: "6+2-pin or 8-pin PCIe plugs. Enter 0 if none.",
  },
  pcie_16pin_required: {
    name: "16-pin plugs the card needs",
    description: "16-pin, 12VHPWR or 12V-2x6 plugs. Enter 0 if none.",
  },
  pcie_16pin_adapter_8pin_count: {
    name: "8-pin plugs on the card's adapter",
    description: "Only if the card's box includes a 16-pin adapter. Otherwise leave blank.",
  },
  capacity_watts: { name: "PSU wattage (W)", description: "The power supply's rated wattage." },
  pcie_6plus2_count: {
    name: "PSU 8-pin plugs",
    description: "How many 6+2-pin PCIe plugs the power supply has. Enter 0 if none.",
  },
  pcie_16pin_count: {
    name: "PSU 16-pin plugs",
    description: "How many 16-pin, 12VHPWR or 12V-2x6 plugs it has. Enter 0 if none.",
  },
  supported_motherboards: {
    name: "Supported motherboard sizes",
    description: "For a cabinet. Choose each size it fits.",
  },
  cabinet_clearance_mm: {
    name: "Graphics card clearance (mm)",
    description: "The longest graphics card a cabinet fits.",
  },
  max_cooler_height_mm: {
    name: "Cooler height limit (mm)",
    description: "The tallest CPU cooler a cabinet fits.",
  },
  storage_interface: { name: "Storage connection", description: "How a drive connects." },
  storage_capacity_gb: { name: "Storage capacity (GB)", description: "The drive's size, in GB." },
  supported_sockets: {
    name: "Cooler supported sockets",
    description: "For a CPU cooler. Choose each socket it fits.",
  },
  cooler_height_mm: { name: "Cooler height (mm)", description: "For a CPU cooler." },
};

/** A metafield's staff-facing name, for text a customer or staff member reads. */
export function specFieldName(key: string): string {
  return FIELD_LABELS[key]?.name ?? "A specification";
}

const INTERNAL_SPEC_KEYS = new Set(PC_BUILDER_METAFIELDS.map((field) => field.key));

/**
 * A product's specifications without the builder's internal fields. Anything shown to a customer, or
 * searched on their behalf, reads this. The builder keeps reading the full set.
 */
export function customerVisibleSpecs(specs: unknown): Record<string, string> {
  if (!specs || typeof specs !== "object") return {};
  return Object.fromEntries(
    Object.entries(specs as Record<string, string>).filter(([key]) => !INTERNAL_SPEC_KEYS.has(key)),
  );
}

/** Builder values that describe the product itself, unlike its review record or plain numbers. */
const DESCRIPTIVE_SPEC_KEYS = [
  "socket",
  "ram_generation",
  "supported_ram_generations",
  "form_factor",
  "storage_interface",
  "supported_sockets",
  "supported_motherboards",
];

/**
 * What search and related products may use: everything a customer sees, plus the builder's descriptive
 * values, so that searching "AM5" still finds an AM5 board. The review record stays out, as do numbers,
 * which would match almost any search.
 */
export function searchableSpecs(specs: unknown): Record<string, string> {
  const all = (specs && typeof specs === "object" ? specs : {}) as Record<string, string>;
  const descriptive = DESCRIPTIVE_SPEC_KEYS.filter((key) => all[key]).map((key) => [key, all[key]]);
  return { ...customerVisibleSpecs(all), ...Object.fromEntries(descriptive) };
}

export interface DefinitionCreateInput {
  name: string;
  namespace: string;
  key: string;
  description: string;
  type: MetafieldType;
  ownerType: "PRODUCT";
  pin: false;
  validations: { name: string; value: string }[];
  access: { storefront: "PUBLIC_READ" | "NONE" };
}

/**
 * What Shopify's metafieldDefinitionCreate is given for a field. Admin access is left out, because Shopify
 * refuses it on merchant-owned definitions. Unpinned, so these don't crowd every product's page.
 */
export function definitionCreateInput(field: MetafieldDefinition): DefinitionCreateInput {
  const validations: { name: string; value: string }[] = [];
  if (field.min !== undefined) validations.push({ name: "min", value: String(field.min) });
  if (field.max !== undefined) validations.push({ name: "max", value: String(field.max) });
  if (field.maxLength !== undefined) {
    validations.push({ name: "max", value: String(field.maxLength) });
  }
  if (field.choices) {
    validations.push({ name: "choices", value: JSON.stringify([...field.choices]) });
  }
  const label = FIELD_LABELS[field.key];
  return {
    name: label.name,
    namespace: PC_BUILDER_NAMESPACE,
    key: field.key,
    description: label.description,
    type: field.type,
    ownerType: "PRODUCT",
    pin: false,
    validations,
    access: { storefront: field.storefront === "public" ? "PUBLIC_READ" : "NONE" },
  };
}

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
  source?: (typeof SPEC_SOURCES)[number];
  sourceUrl?: string;
  /** YYYY-MM-DD. */
  reviewedOn?: string;
  /** Marked reviewed, and the record holds up: see readSpecReview. */
  isReviewed: boolean;
  /** Why a product marked reviewed doesn't count as reviewed. */
  issues: SpecProblem[];
}

/** IT HUB works in India, so a review dated today there must count, even while it's yesterday in UTC. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDate = (time: number) => new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10);

function readHttpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") ? value : undefined;
  } catch {
    return undefined;
  }
}

/** A real calendar date in Shopify's format, or nothing. */
function readDate(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

/**
 * A review counts only with a source that isn't a supplier's own claim, a link to check it against, and
 * a real date that isn't in the future. Nothing here can tell whether the link really backs the values:
 * that remains the reviewer's job.
 */
export function readSpecReview(raw: Record<string, unknown>, now: number = Date.now()): SpecReview {
  const status = String(raw["spec_review_status"] ?? "")
    .trim()
    .toLowerCase();
  const known = (REVIEW_STATUSES as readonly string[]).includes(status)
    ? (status as SpecReview["status"])
    : "unreviewed";
  const sourceText = String(raw["spec_source"] ?? "")
    .trim()
    .toLowerCase();
  const source = (SPEC_SOURCES as readonly string[]).includes(sourceText)
    ? (sourceText as SpecReview["source"])
    : undefined;
  const sourceUrl = readHttpsUrl(String(raw["spec_source_url"] ?? "").trim());
  const reviewedOn = readDate(String(raw["spec_reviewed_on"] ?? "").trim());

  const issues: SpecProblem[] = [];
  if (known === "reviewed") {
    const issue = (field: string, detail: string) =>
      issues.push({ field, kind: "review", label: specFieldName(field), detail });
    if (!source) issue("spec_source", "marked reviewed, but no valid source is set");
    else if (source === "supplier") {
      issue("spec_source", "marked reviewed, but its source is only the supplier's claim");
    }
    if (!sourceUrl) {
      issue("spec_source_url", "marked reviewed, but no valid https source link is set");
    }
    if (!reviewedOn) issue("spec_reviewed_on", "marked reviewed, but no valid review date is set");
    else if (reviewedOn > istDate(now)) {
      issue("spec_reviewed_on", "marked reviewed, but the review date is in the future");
    }
  }
  return {
    status: known,
    source,
    sourceUrl,
    reviewedOn,
    isReviewed: known === "reviewed" && issues.length === 0,
    issues,
  };
}

/**
 * The metafield keys changed after their review, which so count as unreviewed. A review has only a date,
 * so a value changed later on that same day can't be told apart.
 */
export function keysChangedSinceReview(
  review: SpecReview,
  updatedAt: Record<string, string> = {},
): Set<string> {
  if (!review.isReviewed || !review.reviewedOn) return new Set();
  const reviewDayEnds = Date.parse(`${review.reviewedOn}T23:59:59.999+05:30`);
  return new Set(
    Object.entries(updatedAt)
      .filter(([, time]) => Date.parse(time) > reviewDayEnds)
      .map(([key]) => key),
  );
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
  /** The metafield each value was read from. */
  fieldKeys: Partial<Record<keyof TechnicalSpecs, string>>;
}

/**
 * Reads what Shopify's fields state for a product of this kind. A blank field gives no value. A value
 * that can't be read, or falls outside its range, gives no value and a problem for staff to fix.
 */
export function readStatedSpecs(
  slot: ComponentSlotId,
  raw: Record<string, unknown>,
  now: number = Date.now(),
): StatedSpecs {
  const specs: TechnicalSpecs = {};
  const problems: SpecProblem[] = [];
  const fieldKeys: StatedSpecs["fieldKeys"] = {};
  const invalid = (field: string, value: unknown) =>
    problems.push({
      field,
      kind: "invalid",
      label: specFieldName(field),
      detail: `"${String(value)}" can't be read`,
    });

  const read = <T>(
    keys: string[],
    parse: (value: unknown) => T | undefined,
    assign: (value: T) => void,
  ) => {
    const value = firstStated(raw, keys);
    if (value === undefined) return;
    const parsed = parse(value);
    if (parsed === undefined) {
      invalid(keys[keys.length - 1], value);
      return;
    }
    const known = new Set(Object.keys(specs));
    assign(parsed);
    const statedKey = keys.find((key) => firstStated(raw, [key]) !== undefined)!;
    for (const field of Object.keys(specs) as (keyof TechnicalSpecs)[]) {
      if (!known.has(field)) fieldKeys[field] = statedKey;
    }
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

  problems.push(...readSpecReview(raw, now).issues);
  return { specs, problems, fieldKeys };
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
  const inNamespace = actual.filter((item) => item.namespace === PC_BUILDER_NAMESPACE);
  const findings: DefinitionFinding[] = [];
  for (const wanted of PC_BUILDER_METAFIELDS) {
    const found = inNamespace.find((item) => item.key === wanted.key);
    if (!found) {
      // A key that isn't created isn't missing. If someone has created it, it's still checked below.
      if (!wanted.notCreated) {
        findings.push({ key: wanted.key, status: "missing", detail: `needs ${wanted.type}` });
      }
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
    if (wanted.maxLength !== undefined && String(validations.max) !== String(wanted.maxLength))
      different.push("max length");
    // Shopify only documents choices for text, so a list may have to go without them. That's accepted,
    // because the builder still refuses any value outside the list.
    const listWithoutChoices =
      Boolean(wanted.choices) &&
      wanted.type.startsWith("list.") &&
      validations.choices === undefined;
    if (wanted.choices && !listWithoutChoices) {
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
        : {
            key: wanted.key,
            status: "matches",
            detail: listWithoutChoices
              ? "as proposed, without choices. The builder checks these values"
              : "as proposed",
          },
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
