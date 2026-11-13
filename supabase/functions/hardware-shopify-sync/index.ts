// supabase/functions/hardware-shopify-sync/index.ts
// Stage 4B-4: Shopify specification sync for the Hardware Specification Manager. Called by the Staff Portal only.
//
// POST JSON { action, ... } with the staff member's own session token:
//   overview                     every linked listing: its sync state, what would be written, why it can't be
//   preview   { linkId }         one listing: the plan, its problems, and Shopify's current pc_builder values if the
//                                Admin credential is configured (a read)
//   enqueue   { linkIds, force? } queue a sync per listing (refused while its specification is invalid or incomplete),
//                                then run the queued jobs
//   run       { jobIds? }        run due jobs (all due, or those given)
//   retry     { jobId }          put a failed job back in the queue and run it
//
// Only an Admin or Staff session (portal_admin, quotation_staff) may call it. The Shopify Admin credential stays in
// this function's secrets and never reaches the browser. Writes happen only when SHOPIFY_ADMIN_ACCESS_TOKEN is set and
// SHOPIFY_SYNC_WRITES=enabled; otherwise a job fails with a clear reason and nothing reaches Shopify.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsFor, PORTAL_DEV_ORIGINS } from "../_shared/cors.ts";
import type { RegistryListingRecord } from "../_shared/builder/hardware-spec.ts";
import {
  backoffSeconds,
  buildSyncPlan,
  classifyMetafieldsSet,
  listingState,
  METAFIELDS_SET_MUTATION,
  payloadHash,
  sharedProductProblem,
  SYNC_TARGET_QUERY,
  variantDestinationProblem,
  type AttemptOutcome,
  type JobRow,
  type MappingRow,
  type ShopifyHttpAnswer,
  type SyncPlan,
} from "./sync.ts";
import { supabaseSyncStore, type LinkSummary, type SyncStore } from "./store.ts";

export interface StaffIdentity {
  userId: string;
  role: "portal_admin" | "quotation_staff";
}

export interface SyncDeps {
  store?: SyncStore;
  /** The caller's identity from their session token, or null. */
  verifyStaff?: (token: string) => Promise<StaffIdentity | null>;
  /** One Shopify Admin GraphQL request. */
  shopifyAdmin?: (query: string, variables: Record<string, unknown>) => Promise<ShopifyHttpAnswer>;
  env?: Record<string, string | undefined>;
}

const MAX_BODY_BYTES = 20_000;
const MAX_LINKS = 50;
const MAX_RUN = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ListingPlan {
  link: LinkSummary;
  record?: RegistryListingRecord;
  plan?: SyncPlan;
  hash?: string;
  problems: SyncPlan["problems"];
}

/** Every active listing's current plan: what its metafields should be now, and whether that may be written. */
async function currentPlans(
  store: SyncStore,
  onlyLinkIds?: string[],
): Promise<ListingPlan[] | null> {
  const [records, links, mappings] = await Promise.all([
    store.registry(),
    store.links(),
    store.mappings(),
  ]);
  if (!records) return null;
  const byLink = new Map(records.map((record) => [record.linkId, record]));
  const plans: ListingPlan[] = [];
  for (const link of links) {
    if (onlyLinkIds && !onlyLinkIds.includes(link.id)) continue;
    const record = byLink.get(link.id);
    if (!record) {
      // Linked to a base or archived model: nothing the builder reads, so nothing to sync.
      plans.push({
        link,
        problems: [{ code: "nothing_to_sync", message: "This listing's model isn't active" }],
      });
      continue;
    }
    const plan = buildSyncPlan(record, mappings as MappingRow[]);
    const shared = sharedProductProblem(link, links);
    const problems = shared ? [shared, ...plan.problems] : plan.problems;
    const hash =
      plan.metafields.length > 0
        ? await payloadHash(link.shopify_product_id, plan.metafields)
        : undefined;
    plans.push({ link, record, plan, hash, problems });
  }
  return plans;
}

export async function handleHardwareSync(req: Request, deps: SyncDeps = {}): Promise<Response> {
  const env = (name: string): string =>
    (deps.env && name in deps.env ? deps.env[name] : Deno.env.get(name)) ?? "";
  const cors = corsFor(req, {
    appEnv: env("APP_ENV"),
    allowedOrigins: env("PORTAL_ORIGIN"),
    devOrigins: PORTAL_DEV_ORIGINS,
  });
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS")
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
  if (!cors.allowed) return json(403, { success: false, code: "origin_not_allowed" });
  if (req.method !== "POST") return json(405, { success: false, code: "method_not_allowed" });

  // ── Who is calling ──
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || (serviceKey && token === serviceKey)) {
    return json(401, { success: false, code: "sign_in_required" });
  }
  const supabaseUrl = env("SUPABASE_URL");
  const verifyStaff =
    deps.verifyStaff ??
    (async (accessToken: string): Promise<StaffIdentity | null> => {
      const anonKey = env("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !anonKey) return null;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: user, error: userError } = await userClient.auth.getUser(accessToken);
      if (userError || !user?.user?.id) return null;
      const { data: role, error } = await userClient.rpc("get_current_staff_role");
      if (error || (role !== "portal_admin" && role !== "quotation_staff")) return null;
      return { userId: user.user.id, role };
    });
  let staff: StaffIdentity | null = null;
  try {
    staff = await verifyStaff(token);
  } catch {
    staff = null;
  }
  if (!staff) return json(403, { success: false, code: "forbidden" });

  // ── What they asked ──
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { success: false, code: "too_large" });
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { success: false, code: "invalid_json" });
  }
  if (!body || typeof body !== "object" || typeof body.action !== "string") {
    return json(400, { success: false, code: "invalid_request" });
  }
  const uuids = (value: unknown, max: number) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= max &&
    value.every((id) => typeof id === "string" && UUID.test(id))
      ? (value as string[])
      : null;

  const store =
    deps.store ??
    (supabaseUrl && serviceKey
      ? supabaseSyncStore(
          createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }),
        )
      : null);
  if (!store) return json(503, { success: false, code: "not_configured" });

  // ── Shopify Admin ──
  const adminToken = env("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const domain = env("SHOPIFY_STORE_DOMAIN") || env("VITE_SHOPIFY_STORE_DOMAIN");
  const apiVersion = env("SHOPIFY_ADMIN_API_VERSION") || env("SHOPIFY_API_VERSION") || "2025-10";
  const adminConfigured = Boolean(deps.shopifyAdmin || (adminToken && domain));
  // 4B-6: where a write goes. Only the real Admin API counts as "live"; an injected stand-in (tests, rehearsals)
  // is recorded as such, so no record can suggest a real Shopify sync that never happened.
  const writeTarget = deps.shopifyAdmin
    ? { mode: "stand_in" as const, shop: null }
    : { mode: "live" as const, shop: domain || null };
  const writesEnabled = env("SHOPIFY_SYNC_WRITES") === "enabled";
  const shopifyAdmin =
    deps.shopifyAdmin ??
    (async (query: string, variables: Record<string, unknown>): Promise<ShopifyHttpAnswer> => {
      const res = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": adminToken },
        body: JSON.stringify({ query, variables }),
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = null;
      }
      return { status: res.status, retryAfter: res.headers.get("Retry-After"), body: parsed };
    });

  /** One attempt at writing a claimed job's payload. */
  const attempt = async (job: JobRow): Promise<AttemptOutcome> => {
    if (!adminConfigured) {
      return {
        outcome: "failed",
        error: {
          code: "admin_not_configured",
          message: "No Shopify Admin credential is configured for sync",
        },
      };
    }
    if (!writesEnabled) {
      return {
        outcome: "failed",
        error: {
          code: "writes_disabled",
          message: "Shopify writes are switched off in this environment (SHOPIFY_SYNC_WRITES)",
        },
      };
    }
    try {
      const target = await shopifyAdmin(SYNC_TARGET_QUERY, { id: job.shopify_product_id });
      if (target.status === 429 || target.status >= 500) {
        return {
          outcome: "retry_pending",
          error: { code: "shopify_unavailable", message: `Shopify answered ${target.status}` },
          retryAfterSeconds: backoffSeconds(job.attempts),
        };
      }
      if (target.status < 200 || target.status >= 300 || target.body?.errors) {
        return classifyMetafieldsSet(target, job.payload, job.attempts);
      }
      const destination = variantDestinationProblem(
        target.body?.data?.product,
        job.shopify_variant_id,
      );
      if (destination) return { outcome: "failed", error: destination };
      const answer = await shopifyAdmin(METAFIELDS_SET_MUTATION, {
        metafields: job.payload.map((item) => ({ ownerId: job.shopify_product_id, ...item })),
      });
      return classifyMetafieldsSet(answer, job.payload, job.attempts);
    } catch {
      return {
        outcome: "retry_pending",
        error: { code: "network_error", message: "Shopify couldn't be reached" },
        retryAfterSeconds: backoffSeconds(job.attempts),
      };
    }
  };

  /** Claims and runs jobs one at a time. A job whose values changed since it was queued is superseded, not run. */
  const runJobs = async (jobs: JobRow[]) => {
    const results: Record<string, unknown>[] = [];
    for (const waiting of jobs.slice(0, MAX_RUN)) {
      const claimed = await store.claim(waiting.id);
      if (claimed.error) {
        results.push({ jobId: waiting.id, status: "error", error: claimed.error.message });
        continue;
      }
      const job = claimed.job;
      if (!job) {
        results.push({ jobId: waiting.id, status: "skipped" });
        continue;
      }
      const plans = await currentPlans(store, [job.link_id]);
      const current = plans?.[0];
      if (!current || current.problems.length > 0 || current.hash !== job.payload_hash) {
        const finished = await store.finish({
          jobId: job.id,
          outcome: "superseded",
          error: {
            code: "specification_changed",
            message: "The values changed after this job was queued",
          },
        });
        results.push({ jobId: job.id, status: finished.job?.status ?? "superseded" });
        continue;
      }
      const outcome = await attempt(job);
      const finished = await store.finish({
        jobId: job.id,
        outcome: outcome.outcome,
        error: outcome.outcome === "synced" ? null : outcome.error,
        response: outcome.outcome === "synced" ? { ...outcome.response, ...writeTarget } : null,
        retryAfterSeconds: outcome.outcome === "retry_pending" ? outcome.retryAfterSeconds : null,
      });
      results.push({
        jobId: job.id,
        status: finished.job?.status ?? outcome.outcome,
        error: outcome.outcome === "synced" ? undefined : outcome.error,
      });
    }
    return results;
  };

  try {
    switch (body.action) {
      case "overview": {
        const plans = await currentPlans(store);
        if (!plans) return json(503, { success: false, code: "registry_unavailable" });
        const jobs = await store.jobs({ limit: 500 });
        const listings = plans.map(({ link, plan, hash, problems }) => {
          const own = jobs.filter((job) => job.link_id === link.id);
          return {
            link,
            state: listingState(own, hash),
            problems,
            payload: plan?.metafields ?? [],
            notSynced: plan?.notSynced ?? [],
            latestJob: own[0] ?? null,
          };
        });
        return json(200, {
          success: true,
          adminConfigured,
          writesEnabled,
          writeMode: adminConfigured ? writeTarget.mode : null,
          listings,
          jobs: jobs.slice(0, 100),
        });
      }

      case "preview": {
        if (typeof body.linkId !== "string" || !UUID.test(body.linkId)) {
          return json(400, { success: false, code: "invalid_request" });
        }
        const plans = await currentPlans(store, [body.linkId]);
        if (!plans) return json(503, { success: false, code: "registry_unavailable" });
        const current = plans[0];
        if (!current) return json(404, { success: false, code: "link_not_found" });
        let shopifyValues: { key: string; value: string; type: string }[] | null = null;
        let shopifyReadError: string | null = null;
        if (adminConfigured) {
          try {
            const answer = await shopifyAdmin(SYNC_TARGET_QUERY, {
              id: current.link.shopify_product_id,
            });
            const nodes = answer.body?.data?.product?.metafields?.nodes;
            if (answer.status === 200 && Array.isArray(nodes)) shopifyValues = nodes;
            else shopifyReadError = `Shopify answered ${answer.status}`;
          } catch {
            shopifyReadError = "Shopify couldn't be reached";
          }
        }
        return json(200, {
          success: true,
          link: current.link,
          payload: current.plan?.metafields ?? [],
          problems: current.problems,
          notSynced: current.plan?.notSynced ?? [],
          shopifyValues,
          shopifyReadError,
          adminConfigured,
          writesEnabled,
          writeMode: adminConfigured ? writeTarget.mode : null,
        });
      }

      case "enqueue": {
        const linkIds = uuids(body.linkIds, MAX_LINKS);
        if (!linkIds) return json(400, { success: false, code: "invalid_request" });
        const plans = await currentPlans(store, linkIds);
        if (!plans) return json(503, { success: false, code: "registry_unavailable" });
        const existing = await store.jobs({ linkIds, limit: 500 });
        const results: Record<string, unknown>[] = [];
        const queued: JobRow[] = [];
        for (const linkId of linkIds) {
          const current = plans.find((plan) => plan.link.id === linkId);
          if (!current) {
            results.push({ linkId, status: "error", code: "link_not_found" });
            continue;
          }
          if (current.problems.length > 0 || !current.plan || !current.hash || !current.record) {
            results.push({ linkId, status: "blocked", problems: current.problems });
            continue;
          }
          const own = existing.filter((job) => job.link_id === linkId);
          if (body.force !== true && listingState(own, current.hash) === "synced") {
            results.push({ linkId, status: "already_synced" });
            continue;
          }
          const enqueued = await store.enqueue({
            linkId,
            specRevision: current.record.specRevision,
            overrideRevision: current.record.overrideRevision,
            payload: current.plan.metafields,
            payloadHash: current.hash,
            actor: staff.userId,
            role: staff.role,
          });
          if (enqueued.error || !enqueued.job) {
            results.push({
              linkId,
              status: "error",
              code: enqueued.error?.message ?? "enqueue_failed",
            });
            continue;
          }
          queued.push(enqueued.job);
          results.push({ linkId, status: "queued", jobId: enqueued.job.id });
        }
        const run = await runJobs(queued);
        return json(200, { success: true, results, run });
      }

      case "run": {
        const ids = body.jobIds === undefined ? undefined : uuids(body.jobIds, MAX_RUN);
        if (body.jobIds !== undefined && !ids)
          return json(400, { success: false, code: "invalid_request" });
        const due = await store.jobs({ ids: ids ?? undefined, dueOnly: true, limit: MAX_RUN });
        // Oldest first, so a listing's jobs run in the order they were queued.
        const run = await runJobs([...due].reverse());
        return json(200, { success: true, run });
      }

      case "retry": {
        if (typeof body.jobId !== "string" || !UUID.test(body.jobId)) {
          return json(400, { success: false, code: "invalid_request" });
        }
        const retried = await store.retry({
          jobId: body.jobId,
          actor: staff.userId,
          role: staff.role,
        });
        if (retried.error || !retried.job) {
          const code = retried.error?.message ?? "retry_failed";
          return json(code === "job_not_found" ? 404 : 409, { success: false, code });
        }
        const run = await runJobs([retried.job]);
        return json(200, { success: true, job: retried.job, run });
      }

      default:
        return json(400, { success: false, code: "unknown_action" });
    }
  } catch (error) {
    console.error(
      "[hardware-shopify-sync] failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return json(500, { success: false, code: "internal_error" });
  }
}

if (import.meta.main) serve((req) => handleHardwareSync(req));
