// ITHUB_ADMIN/src/lib/hardware-import.ts
// Shopify Hardware Importer: the Staff Portal's side. Reads the import tables (Admin and Staff only, by RLS) and
// changes them only through the migration's functions (20261113000003), which check the caller's role and version and
// reuse the registry's own model and link functions. Discovery goes through the `hardware-shopify-import` Edge
// Function, which only reads Shopify.

import { supabase } from "./supabase";
import type { ActionResult } from "./hardware-messages";
import { importMessage, type ImportDecision, type ImportStatus } from "./hardware-import-wording";

export * from "./hardware-import-wording";

export interface ImportVariant {
  id: string;
  title: string | null;
  sku: string | null;
  price: string | null;
  currency: string | null;
  available: boolean | null;
}

export interface ImportCandidate {
  id: string;
  model_name: string;
  model_number: string | null;
}

export interface ImportItemRow {
  id: string;
  session_id: string;
  shopify_product_id: string;
  handle: string | null;
  title: string;
  vendor: string | null;
  product_type: string | null;
  shopify_category: string | null;
  tags: string[];
  collections: string[];
  image_url: string | null;
  available_for_sale: boolean | null;
  variants: ImportVariant[];
  suggested_category_id: string | null;
  category_id: string | null;
  category_source: "rule" | "manual" | null;
  rule_id: string | null;
  excluded: boolean;
  manufacturer_id: string | null;
  manufacturer_source: "vendor" | "manual" | null;
  model_name: string | null;
  model_number: string | null;
  status: ImportStatus;
  review_reasons: string[];
  existing_link_id: string | null;
  match_model_id: string | null;
  duplicate_candidates: ImportCandidate[];
  decision: ImportDecision | null;
  target_model_id: string | null;
  confirm_distinct: boolean;
  result_model_id: string | null;
  result_link_id: string | null;
  result_action: string | null;
  error: { code?: string; detail?: string | null } | null;
  attempts: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ImportCounts {
  discovered?: number;
  eligible?: number;
  already_linked?: number;
  exact_match?: number;
  possible_duplicate?: number;
  unmapped?: number;
  needs_review?: number;
  excluded?: number;
  imported?: number;
  linked?: number;
  skipped?: number;
  failed?: number;
}

export interface ImportSessionRow {
  id: string;
  status: "discovering" | "ready" | "importing" | "completed" | "failed";
  started_by: string;
  started_role: string;
  started_at: string;
  discovered_at: string | null;
  completed_at: string | null;
  pages: number;
  counts: ImportCounts;
  error: { code?: string; message?: string } | null;
}

export interface ImportRuleRow {
  id: string;
  match_field: "category" | "product_type" | "tag" | "collection";
  match_value: string;
  category_id: string | null;
  priority: number;
  is_active: boolean;
  note: string | null;
  version: number;
  updated_at: string;
}

export interface ImportResult {
  item_id: string;
  status: "imported" | "skipped" | "failed";
  action?: string;
  error?: string;
  repeat?: boolean;
}

export interface DiscoveryResult {
  sessionId: string;
  status: string;
  counts: ImportCounts;
  pages: number;
  products: number;
  skipped: number;
  truncated: boolean;
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────────

const client = () => {
  if (!supabase) throw new Error("Database client unavailable.");
  return supabase;
};

export async function loadImportSessions(limit = 30): Promise<ImportSessionRow[]> {
  const { data, error } = await client()
    .from("hardware_import_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportSessionRow[];
}

/** Every item of a session (a store has hundreds of products, so this pages through them). */
export async function loadImportItems(sessionId: string): Promise<ImportItemRow[]> {
  const rows: ImportItemRow[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await client()
      .from("hardware_import_items")
      .select("*")
      .eq("session_id", sessionId)
      .order("title")
      .order("id")
      .range(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as ImportItemRow[]));
    if (!data || data.length < size) break;
  }
  return rows;
}

export async function loadImportRules(): Promise<ImportRuleRow[]> {
  const { data, error } = await client()
    .from("hardware_import_category_rules")
    .select("*")
    .order("priority")
    .order("match_field")
    .order("match_value");
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportRuleRow[];
}

// ── Changes ─────────────────────────────────────────────────────────────────────────────────────────

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  if (!supabase) return { ok: false, code: "failed", message: importMessage("failed") };
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      const code = String(error.message ?? "").trim();
      return { ok: false, code, message: importMessage(code) };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, code: "failed", message: importMessage("failed") };
  }
}

/** Reads Shopify (Storefront API, read-only) into a new session, through the Edge Function. */
export async function discoverProducts(): Promise<ActionResult<DiscoveryResult>> {
  if (!supabase) return { ok: false, code: "failed", message: importMessage("failed") };
  try {
    const { data, error } = await supabase.functions.invoke("hardware-shopify-import", {
      body: { action: "discover" },
    });
    if (error) {
      let code = "failed";
      try {
        const context = (error as { context?: Response }).context;
        const parsed = context ? await context.json() : null;
        if (parsed?.code) code = parsed.code;
      } catch {
        // No readable body.
      }
      return { ok: false, code, message: importMessage(code) };
    }
    return { ok: true, data: data as DiscoveryResult };
  } catch {
    return { ok: false, code: "failed", message: importMessage("failed") };
  }
}

export interface ItemChange {
  categoryId?: string | null;
  manufacturerId?: string | null;
  modelName?: string | null;
  modelNumber?: string | null;
  decision?: ImportDecision | null;
  targetModelId?: string | null;
  confirmDistinct?: boolean | null;
}

/** Corrects an item. Fields left out keep their value; an empty model number clears it. */
export const updateImportItem = (item: ImportItemRow, change: ItemChange) =>
  rpc<ImportItemRow>("staff_update_import_item", {
    p_item_id: item.id,
    p_expected_version: item.version,
    p_category_id: change.categoryId ?? null,
    p_manufacturer_id: change.manufacturerId ?? null,
    p_model_name: change.modelName ?? null,
    p_model_number: change.modelNumber === undefined ? null : (change.modelNumber ?? ""),
    p_decision: change.decision ?? null,
    p_target_model_id: change.targetModelId ?? null,
    p_confirm_distinct: change.confirmDistinct ?? null,
  });

export const reevaluateSession = (sessionId: string) =>
  rpc<ImportCounts>("staff_reevaluate_import_session", { p_session_id: sessionId });

/** Imports up to 200 items per call; larger selections are sent in batches. */
export async function importItems(
  sessionId: string,
  itemIds: string[],
): Promise<ActionResult<{ results: ImportResult[]; counts: ImportCounts }>> {
  const results: ImportResult[] = [];
  let counts: ImportCounts = {};
  for (let i = 0; i < itemIds.length; i += 200) {
    const res = await rpc<{ results: ImportResult[]; counts: ImportCounts }>("staff_import_items", {
      p_session_id: sessionId,
      p_item_ids: itemIds.slice(i, i + 200),
    });
    if (!res.ok || !res.data) {
      return results.length
        ? { ok: true, data: { results, counts }, code: res.code, message: res.message }
        : res;
    }
    results.push(...res.data.results);
    counts = res.data.counts;
  }
  return { ok: true, data: { results, counts } };
}

export const saveImportRule = (input: {
  id?: string | null;
  version?: number | null;
  matchField: string;
  matchValue: string;
  categoryId: string | null;
  priority: number;
  isActive: boolean;
  note?: string | null;
}) =>
  rpc<ImportRuleRow>("staff_save_import_category_rule", {
    p_id: input.id ?? null,
    p_expected_version: input.version ?? null,
    p_match_field: input.matchField,
    p_match_value: input.matchValue,
    p_category_id: input.categoryId,
    p_priority: input.priority,
    p_is_active: input.isActive,
    p_note: input.note ?? null,
  });
