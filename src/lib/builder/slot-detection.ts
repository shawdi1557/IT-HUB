// src/lib/builder/slot-detection.ts
// Which builder slot a Shopify product belongs to. Pure: no browser, Shopify or Supabase access, so the quotation
// server runs exactly this code (Stage 4S-1). Moved unchanged from catalog.ts, which still exports it.

import type { ComponentSlotId } from "./types";

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
  if (
    /\b(?:rtx\s*a?\d{3,4}|gtx\s*\d{3,4}|gt\s*(?:710|730|1030)|rx\s*(?:\d{4}|[45]\d{2})|radeon|geforce|arc\s*[ab]\d{3}|intel arc|graphics card)\b/i.test(
      normTitle,
    )
  )
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
 * Store categories that are certainly not a part the builder sells, checked only after Shopify's own fields have
 * named no builder slot (so "Video Cards & Adapters" stays a graphics card, as `detectComponentSlot` decides).
 */
const NOT_A_BUILDER_PART =
  /\b(?:cables?|adapters?|connectors?|converters?|splitters?|mounts?|stands?|keyboards?|mice|mouse|speakers?|webcams?|routers?|networking|bags?|backpacks?|accessor(?:y|ies)|software|licen[cs]es?|gift\s?cards?)\b/;

/** What Shopify's data says about a product, as the server reads it. */
export interface SlotEvidence {
  title: string;
  productType?: string;
  tags?: string[];
  /** The product's taxonomy category name, which IT HUB sets for each component. */
  category?: string;
}

export type SlotClassification =
  /** Shopify's own fields, or failing them the title, put the product in the slot it was sent for. */
  | { kind: "match"; source: "shopify_fields" | "title" }
  /** Shopify's own fields name a different builder slot: a board sent as a processor. */
  | { kind: "other_part"; detectedSlot: ComponentSlotId }
  /** Shopify's own fields say it isn't a builder part at all: a cable, a phone, an external drive. */
  | { kind: "not_a_part" }
  /** Nothing confident: no category, type or tag that decides, and the title doesn't settle it. */
  | { kind: "unknown"; reason: "no_signal" | "title_conflict"; titleSlot?: ComponentSlotId };

/**
 * Whether a product belongs in the slot a quotation request put it in (Stage 4S decision 2). Only the fields IT HUB
 * sets in Shopify (tags, product type, category) can positively identify a product, so only they can make the
 * server refuse it, or confirm it. A title is a weaker signal: a title match is provisional (the quotation server
 * sends it to a technician), and a title that disagrees, or says nothing, leaves the product unknown. Uses `detectComponentSlot` unchanged, so whatever the
 * builder offers in a slot because of those fields, the server accepts there too.
 */
export function classifyProductSlot(
  product: SlotEvidence,
  claimedSlot: ComponentSlotId,
): SlotClassification {
  const productType = product.productType || "";
  const tags = product.tags || [];
  const category = product.category || "";

  // What Shopify's own fields say, with the title left out.
  const declared = detectComponentSlot("", productType, tags, category);
  if (declared) {
    return declared === claimedSlot
      ? { kind: "match", source: "shopify_fields" }
      : { kind: "other_part", detectedSlot: declared };
  }
  const fields = `${productType} ${category}`.toLowerCase();
  if (
    NOT_A_PC_COMPONENT.test(fields) ||
    EXTERNAL_STORAGE.test(category.toLowerCase()) ||
    NOT_A_BUILDER_PART.test(fields)
  ) {
    return { kind: "not_a_part" };
  }

  // Nothing declared: the title, read as the builder reads it, can confirm the slot but never refuse.
  const titleSlot = detectComponentSlot(
    normalizeHardwareTitle(product.title || ""),
    productType,
    tags,
    category,
  );
  if (titleSlot === claimedSlot) return { kind: "match", source: "title" };
  return titleSlot
    ? { kind: "unknown", reason: "title_conflict", titleSlot }
    : { kind: "unknown", reason: "no_signal" };
}
