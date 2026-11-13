// ITHUB_ADMIN/src/lib/hardware.ts
// Stage 4B: the Staff Portal's side of the Hardware Specification Manager. Reads the 4B tables (staff and
// administrators only, by RLS) and changes them only through the migration's functions (20261112000001), which check
// the caller's role and version and write the revision and activity rows. Shopify sync goes through the
// `hardware-shopify-sync` Edge Function; the Shopify Admin credential never reaches the browser.

import { supabase } from "./supabase";
import type { HardwareSpecValues } from "./hardware-spec";

export interface HardwareCategoryRow {
  id: string;
  label: string;
  builder_slot: string | null;
  sort_order: number;
  is_active: boolean;
  version: number;
}

export interface ManufacturerRow {
  id: string;
  name: string;
  website_url: string | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface HardwareModelRow {
  id: string;
  category_id: string;
  manufacturer_id: string;
  model_name: string;
  model_number: string | null;
  is_base: boolean;
  base_model_id: string | null;
  notes: string | null;
  specs: HardwareSpecValues;
  spec_revision: number;
  status: "active" | "archived";
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ShopifyLinkRow {
  id: string;
  model_id: string;
  shopify_product_id: string;
  shopify_variant_id: string | null;
  product_title: string | null;
  variant_title: string | null;
  overrides: HardwareSpecValues;
  override_revision: number;
  status: "active" | "removed";
  removed_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SpecChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface SpecRevisionRow {
  id: number;
  model_id: string;
  link_id: string | null;
  revision_no: number;
  specs: HardwareSpecValues;
  changes: SpecChange[];
  reason: string | null;
  actor_user_id: string;
  actor_role: string;
  created_at: string;
}

export interface ActivityRow {
  id: number;
  action: string;
  model_id: string | null;
  link_id: string | null;
  job_id: string | null;
  manufacturer_id: string | null;
  category_id: string | null;
  mapping_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  previous: unknown;
  new: unknown;
  details: Record<string, unknown>;
  created_at: string;
}

export interface MappingRow {
  id: string;
  category_id: string;
  field_key: string;
  namespace: string;
  metafield_key: string;
  metafield_type: string;
  is_enabled: boolean;
  version: number;
}

export interface SyncJobRow {
  id: string;
  link_id: string;
  model_id: string;
  status: "queued" | "syncing" | "synced" | "failed" | "retry_pending" | "superseded";
  spec_revision: number;
  override_revision: number;
  shopify_product_id: string;
  shopify_variant_id: string | null;
  payload: { namespace: string; key: string; type: string; value: string }[];
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_error: { code?: string; message?: string; details?: unknown } | null;
  /** 4B-6: set on success. `mode` "live" only when the real Shopify Admin API took the write. */
  shopify_response?: {
    mode?: "live" | "stand_in";
    shop?: string | null;
    metafields?: unknown[];
  } | null;
  created_at: string;
  finished_at: string | null;
  requested_role: string;
}

export {
  HARDWARE_MESSAGES,
  hardwareError,
  type ActionResult,
  type FieldError,
} from "./hardware-messages";
import { HARDWARE_MESSAGES, hardwareError, type ActionResult } from "./hardware-messages";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  if (!supabase) return { ok: false, code: "failed", message: "Database client unavailable." };
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return hardwareError<T>(error);
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, code: "failed", message: HARDWARE_MESSAGES.failed };
  }
}

const nullable = (text?: string | null) => {
  const value = (text ?? "").trim();
  return value ? value : null;
};

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────────

async function select<T>(table: string, build: (query: any) => any): Promise<T[]> {
  if (!supabase) throw new Error("Database client unavailable.");
  const { data, error } = await build(supabase.from(table).select("*"));
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export const loadCategories = () =>
  select<HardwareCategoryRow>("hardware_categories", (q) => q.order("sort_order"));
export const loadManufacturers = () =>
  select<ManufacturerRow>("hardware_manufacturers", (q) => q.order("name"));
export const loadModels = () =>
  select<HardwareModelRow>("hardware_models", (q) => q.order("updated_at", { ascending: false }));
export const loadModel = async (id: string) =>
  (await select<HardwareModelRow>("hardware_models", (q) => q.eq("id", id)))[0];
export const loadLinks = (modelId?: string) =>
  select<ShopifyLinkRow>("hardware_shopify_links", (q) =>
    (modelId ? q.eq("model_id", modelId) : q).order("created_at", { ascending: false }),
  );
export const loadRevisions = (modelId: string) =>
  select<SpecRevisionRow>("hardware_spec_revisions", (q) =>
    q.eq("model_id", modelId).order("id", { ascending: false }),
  );
export const loadActivity = (options: { modelId?: string; limit?: number } = {}) =>
  select<ActivityRow>("hardware_activity_log", (q) =>
    (options.modelId ? q.eq("model_id", options.modelId) : q)
      .order("id", { ascending: false })
      .limit(options.limit ?? 200),
  );
export const loadMappings = () =>
  select<MappingRow>("hardware_metafield_mappings", (q) =>
    q.order("category_id").order("field_key"),
  );
export const loadSyncJobs = (limit = 100) =>
  select<SyncJobRow>("hardware_sync_jobs", (q) =>
    q.order("created_at", { ascending: false }).limit(limit),
  );

// ── Changes ─────────────────────────────────────────────────────────────────────────────────────────

export const saveManufacturer = (input: {
  id?: string | null;
  version?: number | null;
  name: string;
  websiteUrl?: string | null;
  isActive?: boolean;
}) =>
  rpc<ManufacturerRow>("staff_save_hardware_manufacturer", {
    p_id: input.id ?? null,
    p_expected_version: input.version ?? null,
    p_name: input.name,
    p_website_url: nullable(input.websiteUrl),
    p_is_active: input.isActive ?? true,
  });

export const updateCategory = (input: {
  id: string;
  version: number;
  label: string;
  sortOrder: number;
  isActive: boolean;
}) =>
  rpc<HardwareCategoryRow>("staff_update_hardware_category", {
    p_id: input.id,
    p_expected_version: input.version,
    p_label: input.label,
    p_sort_order: input.sortOrder,
    p_is_active: input.isActive,
  });

export interface ModelIdentityInput {
  category: string;
  manufacturerId: string;
  modelName: string;
  modelNumber?: string | null;
  isBase: boolean;
  baseModelId?: string | null;
  notes?: string | null;
  confirmDistinct?: boolean;
  reason?: string | null;
}

export const createModel = (input: ModelIdentityInput & { specs: HardwareSpecValues }) =>
  rpc<HardwareModelRow>("staff_create_hardware_model", {
    p_category: input.category,
    p_manufacturer_id: input.manufacturerId,
    p_model_name: input.modelName,
    p_model_number: nullable(input.modelNumber),
    p_is_base: input.isBase,
    p_base_model_id: input.baseModelId || null,
    p_notes: nullable(input.notes),
    p_specs: input.specs,
    p_confirm_distinct: input.confirmDistinct ?? false,
    p_reason: nullable(input.reason),
  });

export const updateModel = (id: string, version: number, input: ModelIdentityInput) =>
  rpc<HardwareModelRow>("staff_update_hardware_model", {
    p_model_id: id,
    p_expected_version: version,
    p_category: input.category,
    p_manufacturer_id: input.manufacturerId,
    p_model_name: input.modelName,
    p_model_number: nullable(input.modelNumber),
    p_is_base: input.isBase,
    p_base_model_id: input.baseModelId || null,
    p_notes: nullable(input.notes),
    p_confirm_distinct: input.confirmDistinct ?? false,
    p_reason: nullable(input.reason),
  });

export const saveSpecs = (
  id: string,
  version: number,
  specs: HardwareSpecValues,
  reason?: string,
) =>
  rpc<HardwareModelRow>("staff_save_hardware_specs", {
    p_model_id: id,
    p_expected_version: version,
    p_specs: specs,
    p_reason: nullable(reason),
  });

export const setModelArchived = (id: string, version: number, archived: boolean, reason: string) =>
  rpc<HardwareModelRow>("staff_set_hardware_model_archived", {
    p_model_id: id,
    p_expected_version: version,
    p_archived: archived,
    p_reason: reason,
  });

export const findDuplicates = (input: {
  category: string;
  manufacturerId: string;
  modelName: string;
  modelNumber?: string | null;
  excludeId?: string | null;
}) =>
  rpc<{ id: string; model_name: string; model_number: string | null }[]>(
    "staff_find_hardware_duplicates",
    {
      p_category: input.category,
      p_manufacturer_id: input.manufacturerId,
      p_model_name: input.modelName,
      p_model_number: nullable(input.modelNumber),
      p_exclude: input.excludeId ?? null,
    },
  );

export const linkListing = (input: {
  modelId: string;
  productId: string;
  variantId?: string | null;
  productTitle?: string | null;
  variantTitle?: string | null;
  reason?: string | null;
}) =>
  rpc<ShopifyLinkRow>("staff_link_shopify_listing", {
    p_model_id: input.modelId,
    p_product_id: input.productId.trim(),
    p_variant_id: nullable(input.variantId),
    p_product_title: nullable(input.productTitle),
    p_variant_title: nullable(input.variantTitle),
    p_reason: nullable(input.reason),
  });

export const relinkListing = (linkId: string, version: number, modelId: string, reason: string) =>
  rpc<ShopifyLinkRow>("staff_relink_shopify_listing", {
    p_link_id: linkId,
    p_expected_version: version,
    p_model_id: modelId,
    p_reason: reason,
  });

export const removeLink = (linkId: string, version: number, reason: string) =>
  rpc<ShopifyLinkRow>("staff_remove_shopify_link", {
    p_link_id: linkId,
    p_expected_version: version,
    p_reason: reason,
  });

export const saveOverrides = (
  linkId: string,
  version: number,
  overrides: HardwareSpecValues,
  reason?: string,
) =>
  rpc<ShopifyLinkRow>("staff_save_listing_overrides", {
    p_link_id: linkId,
    p_expected_version: version,
    p_overrides: overrides,
    p_reason: nullable(reason),
  });

export const setMappingEnabled = (id: string, version: number, enabled: boolean) =>
  rpc<MappingRow>("staff_set_hardware_metafield_mapping", {
    p_id: id,
    p_expected_version: version,
    p_enabled: enabled,
  });

// ── Shopify sync (Edge Function) ────────────────────────────────────────────────────────────────────

export type ListingSyncState =
  | "not_synced"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "retry_pending";

export const SYNC_STATE_LABEL: Record<ListingSyncState | "superseded", string> = {
  not_synced: "Not Synced",
  queued: "Queued",
  syncing: "Syncing",
  synced: "Synced",
  failed: "Failed",
  retry_pending: "Retry Pending",
  superseded: "Superseded",
};

export interface SyncProblem {
  code: string;
  field?: string;
  message: string;
}

export interface SyncListing {
  link: {
    id: string;
    model_id: string;
    shopify_product_id: string;
    shopify_variant_id: string | null;
    product_title: string | null;
    variant_title: string | null;
    model_name: string;
    model_number: string | null;
    category_id: string;
    manufacturer: string;
  };
  state: ListingSyncState;
  problems: SyncProblem[];
  payload: { namespace: string; key: string; type: string; value: string }[];
  notSynced: { field: string; reason: "no_mapping" | "unknown" }[];
  latestJob: SyncJobRow | null;
}

export interface SyncOverview {
  adminConfigured: boolean;
  writesEnabled: boolean;
  /** 4B-6: "live" when writes would reach the real store, "stand_in" in tests, null with no credential. */
  writeMode?: "live" | "stand_in" | null;
  listings: SyncListing[];
  jobs: SyncJobRow[];
}

export interface SyncPreview {
  link: SyncListing["link"];
  payload: SyncListing["payload"];
  problems: SyncProblem[];
  notSynced: SyncListing["notSynced"];
  shopifyValues: { key: string; value: string; type: string }[] | null;
  shopifyReadError: string | null;
  adminConfigured: boolean;
  writesEnabled: boolean;
}

/** Calls the sync function with the staff member's own session. */
export async function syncAction<T>(body: Record<string, unknown>): Promise<ActionResult<T>> {
  if (!supabase) return { ok: false, code: "failed", message: "Database client unavailable." };
  try {
    const { data, error } = await supabase.functions.invoke("hardware-shopify-sync", { body });
    if (error) {
      let code = "failed";
      try {
        const context = (error as { context?: Response }).context;
        const parsed = context ? await context.json() : null;
        if (parsed?.code) code = parsed.code;
      } catch {
        // No readable body.
      }
      return { ok: false, code, message: SYNC_MESSAGES[code] ?? SYNC_MESSAGES.failed };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, code: "failed", message: SYNC_MESSAGES.failed };
  }
}

export const SYNC_MESSAGES: Record<string, string> = {
  forbidden: "Your role can't use Shopify sync.",
  sign_in_required: "Please sign in again.",
  registry_unavailable: "The hardware registry couldn't be read. Please try again.",
  job_not_retryable: "Only a failed or waiting job can be retried.",
  newer_job_exists: "A newer job for this listing is already waiting or running.",
  job_not_found: "This job couldn't be found.",
  not_configured: "The sync service isn't configured.",
  failed: "The sync service couldn't be reached. Please try again.",
};

/** A Shopify GID's number, for display. */
export const shortGid = (gid: string | null | undefined) =>
  gid ? (gid.split("/").pop() ?? gid) : "";

export const ACTIVITY_LABEL: Record<string, string> = {
  manufacturer_created: "Manufacturer created",
  manufacturer_updated: "Manufacturer updated",
  category_updated: "Category updated",
  model_created: "Hardware model created",
  model_updated: "Hardware model updated",
  model_category_changed: "Category changed",
  model_archived: "Model archived",
  model_restored: "Model restored",
  spec_created: "Specification created",
  spec_updated: "Specification modified",
  override_updated: "Listing override changed",
  link_created: "Shopify product linked",
  link_changed: "Shopify link changed",
  link_removed: "Shopify link removed",
  mapping_updated: "Metafield mapping changed",
  sync_initiated: "Shopify sync initiated",
  sync_succeeded: "Shopify sync succeeded",
  sync_failed: "Shopify sync failed",
  sync_retry_scheduled: "Shopify sync will retry",
  sync_retried: "Shopify sync retried",
  sync_superseded: "Shopify sync superseded",
};

export const ROLE_LABEL: Record<string, string> = {
  portal_admin: "Admin",
  quotation_staff: "Staff",
  system: "System",
};
