// supabase/functions/verify-and-submit-pc-quotation/specs.ts
// Stage 4S-2: the specifications of each part to buy, worked out on the server from Shopify's answer for that
// variant, with the storefront's own resolver (generated copy of src/lib/builder/spec-registry.ts). The browser's
// `specs` are never read as values: they are compared, and differences noted for the technician.
//
// What this stage decides: a part whose specifications can't be resolved, or whose resolved specifications carry a
// problem (rejected by IT HUB, two sources conflicting, a value that can't be read, a review record that doesn't hold
// up), sends the quotation to a technician. These are the cases the builder's Rule K always sends to review, so an
// honest build is unaffected. Missing, title-only and unreviewed values are recorded with their provenance but don't
// decide anything here (owner decision, 11 November 2026): whether they matter depends on the other parts, which is
// Stage 4S-3's compatibility check, run on `serverBuildComponents`.

import {
  METADATA_FIELDS,
  resolveShopifyComponent,
  VERIFIED_HARDWARE_SPECS,
  shopifyStatedValues,
  type SpecSourceProduct,
} from "../_shared/builder/spec-registry.ts";
import {
  parseProductSpecs,
  specUpdatedTimes,
  tagSpecKeys,
  type ShopifyMetafield,
} from "../_shared/builder/shopify-fields.ts";
import {
  labelCriticalFields,
  missingCriticalSpecs,
  specConfidence,
} from "../_shared/builder/compatibility.ts";
import {
  CONFIRMED_CONFIDENCE,
  PC_BUILDER_METAFIELDS,
  PC_BUILDER_NAMESPACE,
  readSpecReview,
  readStatedSpecs,
  sameSpecValue,
  type SpecConfidence,
  type SpecProblem,
} from "../_shared/builder/spec-schema.ts";
import type { SlotClassification } from "../_shared/builder/slot-detection.ts";
import type {
  CanonicalBuildComponent,
  ComponentSlotId,
  TechnicalSpecs,
} from "../_shared/builder/types.ts";
import { SPEC_METAFIELD_KEYS, storefrontCategory } from "./resolve.ts";

/** How far one specification value can be relied on. */
export type SpecFieldStatus =
  /** From the maker's page recorded per field, or a complete IT HUB review, on a part Shopify's fields placed. */
  | "verified"
  /** A value, but only a supplier's statement, an unsourced registry entry, a title, or on an unconfirmed slot. */
  | "uncertain"
  /** No source states it. */
  | "missing"
  /** Two sources disagree, so neither value is used. */
  | "conflicting"
  /** Shopify states something that can't be read or is out of range, so no value is used. */
  | "invalid";

/** Where a resolved value came from. */
export type SpecOrigin =
  | "code_registry"
  | "database_registry"
  | "shopify_metafield"
  | "product_title"
  /** Present on the part, but none of the sources above can be shown to have given it. */
  | "unattributed";

export interface ServerSpecField {
  /** The builder's specification name (TechnicalSpecs key). */
  field: string;
  status: SpecFieldStatus;
  /** Only for a value that was resolved. Never filled in from the browser or a guess. */
  value?: unknown;
  confidence: SpecConfidence;
  origin?: SpecOrigin;
  /** The pc_builder metafield the value was read from, when that is its origin. */
  metafield?: string;
  /** Whether a recommendation label rests on it for this kind of part (`labelCriticalFields`). */
  critical: boolean;
}

/** The part's specifications as a whole, worst first. */
export type PartSpecStatus =
  /** Shopify couldn't be asked, or its answer couldn't be relied on: nothing was resolved. */
  | "unresolved"
  /** Resolved, but with a rejected, conflicting, unreadable or unreviewable value. */
  | "problem"
  /** A critical value is missing. */
  | "incomplete"
  /** Every critical value is present, but at least one isn't verified. */
  | "uncertain"
  /** Every critical value is verified. */
  | "verified"
  /** This kind of part has no critical values (a monitor, case fans). */
  | "not_applicable";

export type SpecUnresolvedReason =
  /** Shopify isn't configured, failed, or answered with errors. */
  | "shopify_unavailable"
  /** Shopify's answer didn't match the variants asked for, so none of it is used. */
  | "answer_unreliable"
  /** The product's metafields came back in a shape Shopify never sends. */
  | "malformed_answer"
  /** The resolver gave no part for this product. */
  | "not_resolvable";

/**
 * What the server stored for one part to buy, in `pc_builds.parts[slot].serverSpecs`. The quotation's existing parts
 * JSON holds it, as it holds `slotCheck`, so no migration is needed. The browser's `specs` stay beside it, unchanged.
 */
export interface ServerSpecRecord {
  resolvedBy: "server";
  stage: "4S-2";
  status: PartSpecStatus;
  reason?: SpecUnresolvedReason;
  /** Stage 4S-2's only effect on the quotation: true for `unresolved` and `problem`. */
  reviewRequired: boolean;
  /** How the slot the specifications were read for was confirmed (Stage 4S-1). Only Shopify's fields count. */
  slotBasis: "shopify_fields" | "title" | "unconfirmed";
  variantId: string | null;
  productId: string | null;
  /** The code registry entry the product matched, if any. */
  registryKey?: string;
  /** The resolver's overall provenance and verified flag, as the storefront computes them. */
  provenance?: string;
  isVerified?: boolean;
  fields: ServerSpecField[];
  /** The critical values nobody states, in the builder's words. */
  missingCritical: string[];
  problems: { kind: SpecProblem["kind"]; field: string; detail: string }[];
  /** pc_builder metafields set on the product that don't apply to this kind of part, so weren't read. */
  unsupported: string[];
  /** Where the browser's reported specifications differ from the server's. A note only: never used. */
  browserDifferences?: { field: string; browser: string; server: unknown }[];
}

/** One part's resolution: the record to store, and the part for Stage 4S-3's compatibility check. */
export interface PartSpecResolution {
  slot: string;
  record: ServerSpecRecord;
  /** Null when unresolved. Built only from Shopify's answer and the registries, never from the request. */
  component: CanonicalBuildComponent | null;
}

/** The record for a part whose specifications couldn't be resolved at all. */
export function unresolvedSpecRecord(
  reason: SpecUnresolvedReason,
  variantId: string | null,
): ServerSpecRecord {
  return {
    resolvedBy: "server",
    stage: "4S-2",
    status: "unresolved",
    reason,
    reviewRequired: true,
    slotBasis: "unconfirmed",
    variantId,
    productId: null,
    fields: [],
    missingCritical: [],
    problems: [],
    unsupported: [],
  };
}

const SPEC_METAFIELD_KEY_SET = new Set(SPEC_METAFIELD_KEYS);

/** The review record's keys, and `exact_model`, which nothing reads yet. None states a specification. */
const RECORD_KEYS = new Set([
  "spec_source",
  "spec_review_status",
  "spec_source_url",
  "spec_reviewed_on",
  "spec_reviewed_by",
  "exact_model",
]);

/**
 * The product's pc_builder metafields, if Shopify's answer has the shape Shopify sends: a list holding, for each key
 * asked for, its metafield or null. A missing list, an entry that isn't an object, a key not asked for, another
 * namespace, a repeated key or a non-text value means the answer can't be relied on, so null.
 */
export function readSpecMetafields(product: any): ShopifyMetafield[] | null {
  const list = product?.metafields;
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const metafields: ShopifyMetafield[] = [];
  for (const entry of list) {
    if (entry === null) continue;
    if (typeof entry !== "object" || Array.isArray(entry)) return null;
    const { namespace, key, value, type, updatedAt } = entry;
    if (namespace !== PC_BUILDER_NAMESPACE || typeof key !== "string") return null;
    if (!SPEC_METAFIELD_KEY_SET.has(key) || seen.has(key)) return null;
    if (typeof value !== "string") return null;
    if (type !== undefined && type !== null && typeof type !== "string") return null;
    if (updatedAt !== undefined && updatedAt !== null && typeof updatedAt !== "string") return null;
    seen.add(key);
    metafields.push({
      namespace,
      key,
      value,
      type: typeof type === "string" ? type : "",
      ...(typeof updatedAt === "string" ? { updatedAt } : {}),
    });
  }
  return metafields;
}

/**
 * The product as the resolver reads it, from Shopify's answer for the variant only. Shaped as the storefront's
 * `mapShopifyProductToCatalog` shapes it, so both resolve a part the same way.
 */
export function specSourceProduct(node: any, metafields: ShopifyMetafield[]): SpecSourceProduct {
  const product = node?.product || {};
  const tags: string[] = Array.isArray(product.tags)
    ? product.tags.filter((tag: unknown): tag is string => typeof tag === "string")
    : [];
  const tagKeys = tagSpecKeys(tags, metafields);
  const price = parseFloat(node?.price?.amount);
  return {
    id: typeof product.id === "string" ? product.id : "",
    name: typeof product.title === "string" ? product.title : "",
    category: storefrontCategory(product),
    productType: typeof product.productType === "string" ? product.productType : "",
    tags,
    price: Number.isFinite(price) ? price : 0,
    specs: parseProductSpecs(tags, metafields),
    tagSpecKeys: tagKeys.length > 0 ? tagKeys : undefined,
    specUpdatedAt: specUpdatedTimes(metafields),
    variantId: typeof node?.id === "string" ? node.id : undefined,
    availableForSale: node?.availableForSale !== false,
  };
}

/** A value each metafield type accepts, to learn from the parser itself which fields a key fills for a slot. */
function sampleValue(key: string): string | undefined {
  const definition = PC_BUILDER_METAFIELDS.find((field) => field.key === key);
  if (!definition) return undefined;
  switch (definition.type) {
    case "number_integer":
      return String(definition.min ?? 1);
    case "boolean":
      return "true";
    case "single_line_text_field":
      return definition.choices?.[0];
    case "list.single_line_text_field":
      return JSON.stringify([definition.choices?.[0] ?? "8-pin"]);
    default:
      return undefined;
  }
}

const fieldsByKey = new Map<string, string[]>();

/** The builder fields a pc_builder metafield fills for this kind of part, as `readStatedSpecs` reads it. */
export function fieldsForMetafield(slot: ComponentSlotId, key: string): string[] {
  const cacheKey = `${slot}|${key}`;
  const known = fieldsByKey.get(cacheKey);
  if (known) return known;
  const sample = sampleValue(key);
  const fields =
    sample === undefined ? [] : Object.keys(readStatedSpecs(slot, { [key]: sample }).specs);
  fieldsByKey.set(cacheKey, fields);
  return fields;
}

/** Where a value on the resolved part came from, worked out from the same sources the resolver used. */
function fieldOrigin(
  field: keyof TechnicalSpecs,
  component: CanonicalBuildComponent,
  stated: ReturnType<typeof readStatedSpecs>,
): { origin: SpecOrigin; metafield?: string } {
  const key = component.matchedModelKey;
  if (key?.startsWith("db-")) return { origin: "database_registry" };
  const entry = key ? VERIFIED_HARDWARE_SPECS[key] : undefined;
  if (entry && entry.specs[field] !== undefined) return { origin: "code_registry" };
  const statedValue = (stated.specs as Record<string, unknown>)[field];
  const metafield = stated.fieldKeys[field];
  if (
    metafield &&
    statedValue !== undefined &&
    sameSpecValue(statedValue, (component.specs as Record<string, unknown>)[field])
  ) {
    return { origin: "shopify_metafield", metafield };
  }
  if (component.specs.fieldSources?.[field] === "title_inferred")
    return { origin: "product_title" };
  return { origin: "unattributed" };
}

const MAX_BROWSER_DIFFERENCES = 40;

/** A browser value, short enough to store as a note. */
function noteValue(value: unknown): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/** Where the browser's reported specifications differ from the server's: missing on the server, or another value. */
function browserDifferences(
  browserSpecs: unknown,
  fields: ServerSpecField[],
  provenance: string | undefined,
): ServerSpecRecord["browserDifferences"] {
  if (!browserSpecs || typeof browserSpecs !== "object" || Array.isArray(browserSpecs)) {
    return undefined;
  }
  const reported = browserSpecs as Record<string, unknown>;
  const differences: NonNullable<ServerSpecRecord["browserDifferences"]> = [];
  const compare = (field: string, server: unknown) => {
    const browser = reported[field];
    if (browser === undefined || browser === null) return;
    if (server !== undefined && sameSpecValue(browser, server)) return;
    if (differences.length < MAX_BROWSER_DIFFERENCES) {
      differences.push({ field, browser: noteValue(browser), server: server ?? null });
    }
  };
  for (const entry of fields) compare(entry.field, entry.value);
  // A browser claiming a better standing than the server found is worth a technician seeing.
  compare("provenance", provenance);
  return differences.length > 0 ? differences : undefined;
}

/**
 * Resolves one part's specifications from Shopify's answer for its variant (already checked by `checkVariantNode` to
 * be for that variant), for the slot it was sent in. `slot` is how Stage 4S-1 placed it; a part placed only by title,
 * or not at all, has its values read for the claimed slot but none of them counts as verified.
 */
export function resolvePartSpecs(
  node: any,
  partSlot: string,
  slot: SlotClassification,
  browserSpecs?: unknown,
): PartSpecResolution {
  const variantId = typeof node?.id === "string" ? node.id : null;
  const metafields = readSpecMetafields(node?.product);
  if (!metafields) {
    return {
      slot: partSlot,
      record: unresolvedSpecRecord("malformed_answer", variantId),
      component: null,
    };
  }
  const product = specSourceProduct(node, metafields);
  const slotId = partSlot as ComponentSlotId;
  // No database registry: the storefront never loads one, and the two must resolve a part identically.
  const component = resolveShopifyComponent(product, slotId, {});
  if (!component) {
    return {
      slot: partSlot,
      record: unresolvedSpecRecord("not_resolvable", variantId),
      component: null,
    };
  }

  const slotBasis: ServerSpecRecord["slotBasis"] =
    slot.kind === "match" ? slot.source : "unconfirmed";
  const slotConfirmed = slotBasis === "shopify_fields";
  const raw = shopifyStatedValues(product);
  const stated =
    readSpecReview(raw).status === "rejected"
      ? { specs: {}, fieldKeys: {}, problems: [] }
      : readStatedSpecs(slotId, raw);
  const critical = labelCriticalFields(slotId);
  const isCritical = (field: string) =>
    critical.some((group) => group.includes(field as keyof TechnicalSpecs));
  const problems = component.specs.specProblems || [];

  const fields: ServerSpecField[] = [];
  const specs = component.specs as Record<string, unknown>;
  for (const [name, value] of Object.entries(specs)) {
    const field = name as keyof TechnicalSpecs;
    if (value === undefined || value === null) continue;
    if (METADATA_FIELDS.has(field) || field === "performance") continue;
    // The builder records that only a processor can come with a cooler. That's its rule, not a product's value.
    if (field === "includesCooler" && slotId !== "CPU") continue;
    const confidence = specConfidence(component, field);
    fields.push({
      field,
      status: slotConfirmed && CONFIRMED_CONFIDENCE.has(confidence) ? "verified" : "uncertain",
      value,
      confidence,
      ...fieldOrigin(field, component, stated),
      critical: isCritical(field),
    });
  }

  // Values withheld: conflicting or unreadable ones, and critical values nobody states.
  const withheld = new Map<string, SpecFieldStatus>();
  for (const problem of problems) {
    if (problem.kind === "conflict") withheld.set(problem.field, "conflicting");
    if (problem.kind === "invalid") {
      for (const field of fieldsForMetafield(slotId, problem.field)) {
        if (!withheld.has(field)) withheld.set(field, "invalid");
      }
    }
  }
  for (const group of critical) {
    if (group.some((field) => specs[field] !== undefined)) continue;
    const marked = group.find((field) => withheld.has(field));
    if (!marked) withheld.set(group[0], "missing");
  }
  for (const [field, status] of withheld) {
    if (specs[field] !== undefined) continue;
    fields.push({ field, status, confidence: "unknown", critical: isCritical(field) });
  }

  const unsupported = metafields
    .filter((entry) => entry.value.trim() !== "" && !RECORD_KEYS.has(entry.key))
    .filter((entry) => fieldsForMetafield(slotId, entry.key).length === 0)
    .map((entry) => entry.key);

  const missingCritical = missingCriticalSpecs(component);
  const criticalFields = fields.filter((entry) => entry.critical && entry.value !== undefined);
  const status: PartSpecStatus =
    problems.length > 0
      ? "problem"
      : missingCritical.length > 0
        ? "incomplete"
        : critical.length === 0
          ? "not_applicable"
          : criticalFields.every((entry) => entry.status === "verified")
            ? "verified"
            : "uncertain";

  const record: ServerSpecRecord = {
    resolvedBy: "server",
    stage: "4S-2",
    status,
    reviewRequired: status === "problem",
    slotBasis,
    variantId,
    productId: product.id || null,
    ...(component.matchedModelKey ? { registryKey: component.matchedModelKey } : {}),
    provenance: component.specs.provenance,
    isVerified: component.isVerified,
    fields,
    missingCritical,
    problems: problems.map((problem) => ({
      kind: problem.kind,
      field: problem.field,
      detail: problem.detail,
    })),
    unsupported,
  };
  const differences = browserDifferences(browserSpecs, fields, component.specs.provenance);
  if (differences) record.browserDifferences = differences;
  return { slot: partSlot, record, component };
}

/**
 * The interface Stage 4S-3 consumes: the server-resolved parts, keyed by slot, for `checkCompatibility` and
 * `assessBuild`. Only resolved parts are included; an unresolved part is absent, never guessed, and its record
 * already sends the quotation to review.
 */
export function serverBuildComponents(
  resolutions: PartSpecResolution[],
): Partial<Record<ComponentSlotId, CanonicalBuildComponent>> {
  const components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {};
  for (const resolution of resolutions) {
    if (resolution.component && resolution.record.status !== "unresolved") {
      components[resolution.slot as ComponentSlotId] = resolution.component;
    }
  }
  return components;
}
