// supabase/functions/hardware-shopify-sync/store.ts
// Stage 4B-4: what the sync function reads and writes in the database, through the service role. Reads are plain
// selects of the 4B tables; every change goes through the migration's functions (hardware_sync_enqueue, _claim,
// _finish, _retry), which check states and write the activity log in the same transaction.

import {
  registryRecordFromRow,
  type RegistryListingRecord,
} from "../_shared/builder/hardware-spec.ts";
import type { JobRow, MappingRow, MetafieldInput, SyncError } from "./sync.ts";

export interface LinkSummary {
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
}

export interface DbError {
  code?: string;
  message: string;
  details?: string;
}

export interface SyncStore {
  /** Every active listing's registry layers; null if they can't be read. */
  registry(): Promise<RegistryListingRecord[] | null>;
  links(): Promise<LinkSummary[]>;
  mappings(): Promise<MappingRow[]>;
  jobs(query: {
    linkIds?: string[];
    ids?: string[];
    dueOnly?: boolean;
    limit: number;
  }): Promise<JobRow[]>;
  enqueue(args: {
    linkId: string;
    specRevision: number;
    overrideRevision: number;
    payload: MetafieldInput[];
    payloadHash: string;
    actor: string;
    role: string;
  }): Promise<{ job?: JobRow; error?: DbError }>;
  claim(jobId: string): Promise<{ job?: JobRow | null; error?: DbError }>;
  finish(args: {
    jobId: string;
    outcome: "synced" | "failed" | "retry_pending" | "superseded";
    error?: SyncError | null;
    response?: Record<string, unknown> | null;
    retryAfterSeconds?: number | null;
  }): Promise<{ job?: JobRow; error?: DbError }>;
  retry(args: {
    jobId: string;
    actor: string;
    role: string;
  }): Promise<{ job?: JobRow; error?: DbError }>;
}

const asError = (error: any): DbError => ({
  code: error?.code,
  message: String(error?.message ?? "database error"),
  details: error?.details,
});

/** The store over a service-role Supabase client. */
export function supabaseSyncStore(client: any): SyncStore {
  return {
    async registry() {
      const { data, error } = await client.rpc("get_pc_builder_registry_specs", {
        p_product_ids: null,
        p_variant_ids: null,
      });
      if (error || !Array.isArray(data)) return null;
      const records: RegistryListingRecord[] = [];
      for (const row of data) {
        const record = registryRecordFromRow(row);
        if (!record) return null;
        records.push(record);
      }
      return records;
    },
    async links() {
      const { data, error } = await client
        .from("hardware_shopify_links")
        .select(
          "id, model_id, shopify_product_id, shopify_variant_id, product_title, variant_title, " +
            "hardware_models(model_name, model_number, category_id, hardware_manufacturers(name))",
        )
        .eq("status", "active");
      if (error) throw new Error(`links: ${error.message}`);
      return (data ?? []).map((row: any) => ({
        id: row.id,
        model_id: row.model_id,
        shopify_product_id: row.shopify_product_id,
        shopify_variant_id: row.shopify_variant_id,
        product_title: row.product_title,
        variant_title: row.variant_title,
        model_name: row.hardware_models?.model_name ?? "",
        model_number: row.hardware_models?.model_number ?? null,
        category_id: row.hardware_models?.category_id ?? "",
        manufacturer: row.hardware_models?.hardware_manufacturers?.name ?? "",
      }));
    },
    async mappings() {
      const { data, error } = await client
        .from("hardware_metafield_mappings")
        .select("id, category_id, field_key, namespace, metafield_key, metafield_type, is_enabled");
      if (error) throw new Error(`mappings: ${error.message}`);
      return data ?? [];
    },
    async jobs({ linkIds, ids, dueOnly, limit }) {
      let query = client.from("hardware_sync_jobs").select("*");
      if (linkIds) query = query.in("link_id", linkIds);
      if (ids) query = query.in("id", ids);
      if (dueOnly) {
        query = query
          .in("status", ["queued", "retry_pending"])
          .lte("next_attempt_at", new Date().toISOString());
      }
      const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error(`jobs: ${error.message}`);
      return data ?? [];
    },
    async enqueue(args) {
      const { data, error } = await client.rpc("hardware_sync_enqueue", {
        p_link_id: args.linkId,
        p_spec_revision: args.specRevision,
        p_override_revision: args.overrideRevision,
        p_payload: args.payload,
        p_payload_hash: args.payloadHash,
        p_actor: args.actor,
        p_actor_role: args.role,
      });
      return error ? { error: asError(error) } : { job: data };
    },
    async claim(jobId) {
      const { data, error } = await client.rpc("hardware_sync_claim", { p_job_id: jobId });
      if (error) return { error: asError(error) };
      // A null composite comes back as null, or as an object of nulls.
      return { job: data && data.id ? data : null };
    },
    async finish(args) {
      const { data, error } = await client.rpc("hardware_sync_finish", {
        p_job_id: args.jobId,
        p_outcome: args.outcome,
        p_error: args.error ?? null,
        p_response: args.response ?? null,
        p_retry_after_seconds: args.retryAfterSeconds ?? null,
      });
      return error ? { error: asError(error) } : { job: data };
    },
    async retry(args) {
      const { data, error } = await client.rpc("hardware_sync_retry", {
        p_job_id: args.jobId,
        p_actor: args.actor,
        p_actor_role: args.role,
      });
      return error ? { error: asError(error) } : { job: data };
    },
  };
}
