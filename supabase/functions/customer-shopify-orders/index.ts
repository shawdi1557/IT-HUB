// supabase/functions/customer-shopify-orders/index.ts
// Returns the signed-in customer's own orders. Orders are linked to an account only by the signed
// Shopify webhook and a single-use checkout token, so this function never creates or claims one.
// IT HUB — Kerala, India

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface CustomerShopifyOrdersDeps {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  overrideUserId?: string; // For automated tests
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function handleCustomerShopifyOrders(
  req: Request,
  deps?: CustomerShopifyOrdersDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed. Expected GET." }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = deps?.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
  const serviceKey =
    deps?.supabaseServiceRoleKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!serviceKey) {
    return new Response(
      JSON.stringify({ error: "Supabase service credentials unconfigured on server." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Authenticate customer JWT or use override for test harness
  let authenticatedUserId: string | null = deps?.overrideUserId ?? null;

  if (!authenticatedUserId) {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Authentication required. Missing Bearer token." }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser(token);

      if (authErr || !user) {
        return new Response(
          JSON.stringify({ error: authErr?.message || "Invalid or expired authentication token." }),
          { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }

      authenticatedUserId = user.id;
    } catch {
      return new Response(JSON.stringify({ error: "Failed to verify authentication token." }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  // 2. Parse query parameters (limit, offset)
  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "10", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 10 : rawLimit), 50);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

  // 3. Query the orders bound to this authenticated user
  const {
    data: rawOrders,
    error: queryErr,
    count,
  } = await supabase
    .from("shopify_customer_orders")
    .select("*", { count: "exact" })
    .eq("user_id", authenticatedUserId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (queryErr) {
    return new Response(JSON.stringify({ error: queryErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const hasNextPage = (rawOrders || []).length > limit;
  const orders = hasNextPage ? (rawOrders || []).slice(0, limit) : rawOrders || [];
  const endCursor = hasNextPage ? String(offset + limit) : null;

  return new Response(
    JSON.stringify({
      ok: true,
      orders,
      pageInfo: {
        hasNextPage,
        endCursor,
      },
      totalCount: count ?? orders.length,
      syncedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}

// Serve HTTP requests if executed directly by Deno
if (import.meta.main) {
  serve((req) => handleCustomerShopifyOrders(req));
}
