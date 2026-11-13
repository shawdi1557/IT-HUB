// supabase/functions/hardware-shopify-sync/sync.ts
// Stage 4B-4: the pure part of the Shopify specification sync. What a listing's metafields should be, whether that may
// be written, what Shopify's answer means, and each listing's sync state. No network or database here.
//
// Rules (4B-4):
//   - Only the pc_builder namespace, only the keys the mappings name, and only mappings switched on. Nothing else on
//     the product is touched: metafieldsSet changes exactly the metafields it is given.
//   - A listing whose resolved specification is invalid or misses a required field isn't synced at all.
//   - Each value is checked against the pc_builder metafield definitions (spec-schema.ts, the definitions created in
//     Shopify in Stage 1H): type, range and choices. A mapping whose type differs from its definition blocks the sync.
//   - A value the registry leaves unknown isn't written, and Shopify's value for it is left as it is.
//   - Metafield definitions are owned by the product. A variant link is written to its product only when the product
//     has that one variant; otherwise variant-specific values have no safe destination and the sync is refused.

import { PC_BUILDER_METAFIELDS, PC_BUILDER_NAMESPACE } from "../_shared/builder/spec-schema.ts";
import {
  fieldDefinition,
  registryBuilderValues,
  type HardwareSpecValue,
  type RegistryListingRecord,
} from "../_shared/builder/hardware-spec.ts";

export interface MappingRow {
  id: string;
  category_id: string;
  field_key: string;
  namespace: string;
  metafield_key: string;
  metafield_type: string;
  is_enabled: boolean;
}

export interface MetafieldInput {
  namespace: string;
  key: string;
  type: string;
  value: string;
}

export type SyncProblemCode =
  | "invalid_value"
  | "missing_required"
  | "mapping_invalid"
  | "value_rejected"
  | "nothing_to_sync"
  | "shared_product";

export interface SyncProblem {
  code: SyncProblemCode;
  field?: string;
  message: string;
}

export interface SyncPlan {
  metafields: MetafieldInput[];
  /** Any problem blocks the sync. */
  problems: SyncProblem[];
  /** Registry fields with a value but no enabled mapping, and mapped fields left unknown (Shopify left as it is). */
  notSynced: { field: string; reason: "no_mapping" | "unknown" }[];
}

/** A registry value as Shopify's metafield value text, or undefined if the type can't hold it. */
export function encodeMetafieldValue(type: string, value: HardwareSpecValue): string | undefined {
  switch (type) {
    case "number_integer":
      return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
    case "boolean":
      return typeof value === "boolean" ? String(value) : undefined;
    case "single_line_text_field":
      return typeof value === "string" && value.trim() !== "" ? value : undefined;
    case "list.single_line_text_field":
      return Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === "string")
        ? JSON.stringify(value)
        : undefined;
    default:
      return undefined;
  }
}

/** Whether a value passes the Shopify definition's own validations, as created in Stage 1H. */
function definitionAccepts(key: string, value: HardwareSpecValue): string | undefined {
  const definition = PC_BUILDER_METAFIELDS.find((field) => field.key === key);
  if (!definition) return "has no Shopify definition";
  if (typeof value === "number") {
    if (definition.min !== undefined && value < definition.min) return `is below ${definition.min}`;
    if (definition.max !== undefined && value > definition.max) return `is above ${definition.max}`;
  }
  if (
    typeof value === "string" &&
    definition.maxLength !== undefined &&
    value.length > definition.maxLength
  ) {
    return `is longer than ${definition.maxLength} characters`;
  }
  if (definition.choices) {
    const items = Array.isArray(value) ? value : [value];
    const outside = items.find((item) => !definition.choices!.includes(String(item)));
    if (outside !== undefined) return `"${outside}" isn't one of Shopify's choices`;
  }
  return undefined;
}

/**
 * The metafields a listing should hold, from its current registry record and the mappings. Sorted by key, so the same
 * values always give the same payload and hash.
 */
export function buildSyncPlan(record: RegistryListingRecord, mappings: MappingRow[]): SyncPlan {
  const problems: SyncProblem[] = [];
  const notSynced: SyncPlan["notSynced"] = [];
  const { resolved } = registryBuilderValues(record);
  for (const error of resolved.errors) {
    problems.push({ code: "invalid_value", field: error.field, message: error.message });
  }
  for (const field of resolved.missingRequired) {
    problems.push({
      code: "missing_required",
      field,
      message: `${fieldDefinition(record.category, field)?.label ?? field} is required before a sync`,
    });
  }

  const categoryMappings = mappings.filter((mapping) => mapping.category_id === record.category);
  const metafields: MetafieldInput[] = [];
  const usedKeys = new Set<string>();
  for (const mapping of categoryMappings) {
    if (!mapping.is_enabled) continue;
    const label = fieldDefinition(record.category, mapping.field_key)?.label ?? mapping.field_key;
    const definition = PC_BUILDER_METAFIELDS.find((field) => field.key === mapping.metafield_key);
    if (
      mapping.namespace !== PC_BUILDER_NAMESPACE ||
      !definition ||
      definition.legacy ||
      definition.notCreated ||
      definition.type !== mapping.metafield_type ||
      usedKeys.has(mapping.metafield_key) ||
      [
        "spec_source",
        "spec_review_status",
        "spec_source_url",
        "spec_reviewed_on",
        "spec_reviewed_by",
      ].includes(mapping.metafield_key)
    ) {
      problems.push({
        code: "mapping_invalid",
        field: mapping.field_key,
        message: `${label}: the mapping to ${mapping.namespace}.${mapping.metafield_key} (${mapping.metafield_type}) doesn't match a Shopify definition`,
      });
      continue;
    }
    usedKeys.add(mapping.metafield_key);
    const value = resolved.values[mapping.field_key];
    if (value === undefined) {
      notSynced.push({ field: mapping.field_key, reason: "unknown" });
      continue;
    }
    const encoded = encodeMetafieldValue(mapping.metafield_type, value);
    const refusal = definitionAccepts(mapping.metafield_key, value);
    if (encoded === undefined || refusal) {
      problems.push({
        code: "value_rejected",
        field: mapping.field_key,
        message: `${label}: ${refusal ?? `can't be written as ${mapping.metafield_type}`}`,
      });
      continue;
    }
    metafields.push({
      namespace: PC_BUILDER_NAMESPACE,
      key: mapping.metafield_key,
      type: mapping.metafield_type,
      value: encoded,
    });
  }
  const mapped = new Set(categoryMappings.filter((m) => m.is_enabled).map((m) => m.field_key));
  for (const field of Object.keys(resolved.values)) {
    if (!mapped.has(field)) notSynced.push({ field, reason: "no_mapping" });
  }
  if (metafields.length === 0 && problems.length === 0) {
    problems.push({ code: "nothing_to_sync", message: "No mapped value is known yet" });
  }
  metafields.sort((a, b) => a.key.localeCompare(b.key));
  return { metafields, problems, notSynced };
}

/** SHA-256 of the destination and payload, in hex: the job's identity for idempotency and staleness checks. */
export async function payloadHash(
  productId: string,
  metafields: MetafieldInput[],
): Promise<string> {
  const text = JSON.stringify({ owner: productId, metafields });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface ActiveLinkRow {
  id: string;
  model_id: string;
  shopify_product_id: string;
  shopify_variant_id: string | null;
}

/**
 * Other active links on the same product. Product metafields hold one set of values, so a product shared between a
 * product link and variant links (or several variant links) can't be synced without overwriting one with another.
 */
export function sharedProductProblem(
  link: ActiveLinkRow,
  links: ActiveLinkRow[],
): SyncProblem | undefined {
  const others = links.filter(
    (other) => other.id !== link.id && other.shopify_product_id === link.shopify_product_id,
  );
  if (others.length === 0) return undefined;
  return {
    code: "shared_product",
    message:
      "Another link uses this Shopify product, and its metafields can hold only one set of values. Sync isn't available for products with several linked variants.",
  };
}

// ─── Shopify's answer ──────────────────────────────────────────────────────────────────────────────────

export type AttemptOutcome =
  | { outcome: "synced"; response: Record<string, unknown> }
  | { outcome: "retry_pending"; error: SyncError; retryAfterSeconds: number }
  | { outcome: "failed"; error: SyncError };

export interface SyncError {
  code: string;
  message: string;
  /** Shopify's own user errors or error codes, when it gave some. */
  details?: unknown;
}

/** Wait before attempt n + 1: 30 s, 60 s, 120 s, ... at most 15 minutes. */
export function backoffSeconds(attempt: number): number {
  return Math.min(900, 30 * 2 ** Math.max(0, attempt - 1));
}

export interface ShopifyHttpAnswer {
  status: number;
  retryAfter?: string | null;
  body: any;
}

/** What one metafieldsSet answer means. Shopify applies all the metafields or none, so there is no partial write. */
export function classifyMetafieldsSet(
  answer: ShopifyHttpAnswer,
  sent: MetafieldInput[],
  attempt: number,
): AttemptOutcome {
  const retry = (code: string, message: string, seconds?: number): AttemptOutcome => ({
    outcome: "retry_pending",
    error: { code, message },
    retryAfterSeconds: seconds ?? backoffSeconds(attempt),
  });
  if (answer.status === 429) {
    const after = Number(answer.retryAfter);
    return retry(
      "throttled",
      "Shopify asked us to slow down",
      Number.isFinite(after) && after > 0 ? Math.ceil(after) : undefined,
    );
  }
  if (answer.status >= 500)
    return retry("shopify_unavailable", `Shopify answered ${answer.status}`);
  if (answer.status === 401 || answer.status === 403) {
    return {
      outcome: "failed",
      error: {
        code: "shopify_access_denied",
        message: "The Shopify Admin credential was refused or lacks write_products",
      },
    };
  }
  if (answer.status < 200 || answer.status >= 300) {
    return {
      outcome: "failed",
      error: { code: "shopify_error", message: `Shopify answered ${answer.status}` },
    };
  }
  const errors = Array.isArray(answer.body?.errors) ? answer.body.errors : [];
  if (errors.some((error: any) => error?.extensions?.code === "THROTTLED")) {
    return retry("throttled", "Shopify's request budget is used up for now");
  }
  if (errors.length > 0) {
    return {
      outcome: "failed",
      error: {
        code: "shopify_graphql_error",
        message: "Shopify refused the request",
        details: errors.map((error: any) => ({
          message: String(error?.message ?? ""),
          code: error?.extensions?.code,
        })),
      },
    };
  }
  const result = answer.body?.data?.metafieldsSet;
  if (!result) {
    return {
      outcome: "failed",
      error: { code: "shopify_unexpected_answer", message: "Shopify's answer had no result" },
    };
  }
  const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];
  if (userErrors.length > 0) {
    return {
      outcome: "failed",
      error: {
        code: "shopify_rejected_values",
        message: "Shopify rejected the values; nothing was changed",
        details: userErrors.map((error: any) => ({
          field: error?.field,
          message: String(error?.message ?? ""),
          code: error?.code,
        })),
      },
    };
  }
  const written = Array.isArray(result.metafields) ? result.metafields : [];
  const writtenKeys = new Set(
    written
      .filter((item: any) => item?.namespace === PC_BUILDER_NAMESPACE)
      .map((item: any) => `${item.key}=${item.value}`),
  );
  const missing = sent.filter((item) => !writtenKeys.has(`${item.key}=${item.value}`));
  if (missing.length > 0) {
    return {
      outcome: "failed",
      error: {
        code: "shopify_unconfirmed",
        message: "Shopify didn't confirm every value; retry to write them again",
        details: missing.map((item) => item.key),
      },
    };
  }
  return {
    outcome: "synced",
    response: {
      metafields: written.map((item: any) => ({
        key: item.key,
        value: item.value,
        updatedAt: item.updatedAt,
      })),
    },
  };
}

export const METAFIELDS_SET_MUTATION = `mutation ItHubSyncPcBuilderSpecs($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { namespace key value updatedAt }
    userErrors { field message code }
  }
}`;

/** The product's variants (two are enough to know it has more than one) and its current pc_builder values. */
export const SYNC_TARGET_QUERY = `query ItHubSyncTarget($id: ID!) {
  product(id: $id) {
    id
    variants(first: 2) { nodes { id } }
    metafields(namespace: "pc_builder", first: 60) { nodes { key value type } }
  }
}`;

/** Whether a variant link may write to its product: the product exists and that variant is its only one. */
export function variantDestinationProblem(
  target: any,
  variantId: string | null,
): SyncError | undefined {
  if (!target) return { code: "product_not_found", message: "Shopify has no such product" };
  if (!variantId) return undefined;
  const variants: string[] = Array.isArray(target?.variants?.nodes)
    ? target.variants.nodes.map((node: any) => node?.id)
    : [];
  if (!variants.includes(variantId)) {
    return {
      code: "variant_not_on_product",
      message: "The linked variant isn't on this product in Shopify",
    };
  }
  if (variants.length > 1) {
    return {
      code: "variant_specific_unsupported",
      message:
        "This product has several variants, and pc_builder metafields belong to the product, so variant-specific values can't be written safely",
    };
  }
  return undefined;
}

// ─── Each listing's state ──────────────────────────────────────────────────────────────────────────────

export type ListingSyncState =
  | "not_synced"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "retry_pending";

export interface JobRow {
  id: string;
  link_id: string;
  model_id: string;
  status: string;
  payload_hash: string;
  payload: MetafieldInput[];
  spec_revision: number;
  override_revision: number;
  shopify_product_id: string;
  shopify_variant_id: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_error: SyncError | null;
  created_at: string;
  finished_at: string | null;
  requested_by: string;
  requested_role: string;
}

/**
 * A listing's state: a waiting or running job shows as such; otherwise its latest finished job, where "synced" counts
 * only if it wrote the values the listing holds now (a later change makes it Not Synced again).
 */
export function listingState(jobs: JobRow[], currentHash: string | undefined): ListingSyncState {
  const ordered = [...jobs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const open = ordered.find((job) => ["queued", "syncing", "retry_pending"].includes(job.status));
  if (open) return open.status as ListingSyncState;
  const latest = ordered.find((job) => job.status === "synced" || job.status === "failed");
  if (!latest) return "not_synced";
  if (latest.status === "failed") return "failed";
  return currentHash !== undefined && latest.payload_hash === currentHash ? "synced" : "not_synced";
}
