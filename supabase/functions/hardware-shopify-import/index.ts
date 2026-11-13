// supabase/functions/hardware-shopify-import/index.ts
// Shopify Hardware Importer: discovery. Called by the Staff Portal only.
//
// POST JSON { action: "discover" } with the staff member's own session token. Reads every published product through
// the Storefront API (read-only), stages it in a new import session, and lets the database work out each product's
// category, manufacturer and match against the Hardware Registry. Nothing is imported here: staff review the session
// in the portal and import from there (staff_import_items, under their own session).
//
// Only an Admin or Staff session (portal_admin, quotation_staff) may call it. Nothing is ever written to Shopify.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsFor, PORTAL_DEV_ORIGINS } from "../_shared/cors.ts";
import {
  discoverAll,
  DiscoveryError,
  type ImportProduct,
  type StorefrontAnswer,
  type StorefrontFetch,
} from "./discovery.ts";

export interface StaffIdentity {
  userId: string;
  role: "portal_admin" | "quotation_staff";
}

/** The database steps of a discovery (service role). */
export interface ImportStore {
  begin(actor: string, role: string): Promise<{ id: string }>;
  stage(sessionId: string, products: ImportProduct[]): Promise<void>;
  finish(
    sessionId: string,
    error: Record<string, unknown> | null,
  ): Promise<{ status: string; counts: unknown }>;
  /** A discovery already running for anyone, started within the last few minutes. */
  running(): Promise<{ id: string } | null>;
}

export interface ImportDeps {
  store?: ImportStore;
  verifyStaff?: (token: string) => Promise<StaffIdentity | null>;
  storefront?: StorefrontFetch;
  sleep?: (ms: number) => Promise<void>;
  env?: Record<string, string | undefined>;
}

const MAX_BODY_BYTES = 2_000;
/** Staged in chunks so one database call stays small. */
const STAGE_CHUNK = 50;

export function supabaseImportStore(client: any): ImportStore {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  return {
    begin: async (actor, role) =>
      await call("hardware_import_begin", { p_actor: actor, p_actor_role: role }),
    stage: async (sessionId, products) => {
      for (let i = 0; i < products.length; i += STAGE_CHUNK) {
        await call("hardware_import_stage", {
          p_session_id: sessionId,
          p_products: products.slice(i, i + STAGE_CHUNK),
        });
      }
    },
    finish: async (sessionId, error) =>
      await call("hardware_import_finish_discovery", { p_session_id: sessionId, p_error: error }),
    running: async () => {
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data, error } = await client
        .from("hardware_import_sessions")
        .select("id")
        .eq("status", "discovering")
        .gte("started_at", since)
        .limit(1);
      if (error) throw new Error(`running: ${error.message}`);
      return data?.[0] ?? null;
    },
  };
}

export async function handleHardwareImport(req: Request, deps: ImportDeps = {}): Promise<Response> {
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
  if (!body || typeof body !== "object" || body.action !== "discover") {
    return json(400, { success: false, code: "invalid_request" });
  }

  const store =
    deps.store ??
    (supabaseUrl && serviceKey
      ? supabaseImportStore(
          createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }),
        )
      : null);
  if (!store) return json(503, { success: false, code: "not_configured" });

  // ── Shopify Storefront (read-only) ──
  const domain = env("SHOPIFY_STORE_DOMAIN") || env("VITE_SHOPIFY_STORE_DOMAIN");
  const storefrontToken =
    env("SHOPIFY_STOREFRONT_TOKEN") || env("VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN");
  const apiVersion = env("SHOPIFY_API_VERSION") || env("VITE_SHOPIFY_API_VERSION") || "2025-10";
  if (!deps.storefront && !(domain && storefrontToken)) {
    return json(503, { success: false, code: "shopify_not_configured" });
  }
  const storefront: StorefrontFetch =
    deps.storefront ??
    (async (query, variables): Promise<StorefrontAnswer> => {
      const res = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({ query, variables }),
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = null;
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      return {
        status: res.status,
        body: parsed,
        retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null,
      };
    });

  // One discovery at a time.
  try {
    const running = await store.running();
    if (running)
      return json(409, { success: false, code: "discovery_running", sessionId: running.id });
  } catch {
    return json(503, { success: false, code: "database_unavailable" });
  }

  let sessionId: string;
  try {
    sessionId = (await store.begin(staff.userId, staff.role)).id;
  } catch {
    return json(503, { success: false, code: "database_unavailable" });
  }

  try {
    const progress = await discoverAll(
      storefront,
      (products) => store.stage(sessionId, products),
      deps.sleep,
    );
    const finished = await store.finish(sessionId, null);
    return json(200, {
      success: true,
      sessionId,
      status: finished.status,
      counts: finished.counts,
      pages: progress.pages,
      products: progress.products,
      skipped: progress.skipped,
      truncated: progress.truncated,
    });
  } catch (error) {
    const known = error instanceof DiscoveryError;
    const failure = {
      code: known ? error.code : "staging_failed",
      message: known ? error.message : "The products couldn't be saved for review",
      ...(known && error.detail !== undefined ? { detail: error.detail } : {}),
    };
    try {
      await store.finish(sessionId, failure);
    } catch {
      // The session stays "discovering"; it no longer blocks a new discovery after five minutes.
    }
    return json(502, { success: false, sessionId, ...failure });
  }
}

if (import.meta.main) {
  serve((req) => handleHardwareImport(req));
}
