// supabase/functions/customer-shopify-orders/index.ts
// Production-Ready Authenticated Customer Shopify Order Retrieval & Reconciliation Edge Function
// IT HUB — Kerala, India

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface CustomerShopifyOrdersDeps {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  shopifyAdminToken?: string;
  shopifyStoreDomain?: string;
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

  // 2. Parse query parameters (limit, offset, cursor, reconcile)
  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "10", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 10 : rawLimit), 50);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
  const shouldReconcile = url.searchParams.get("reconcile") === "true";

  // 3. Optional on-demand Admin API reconciliation if configured
  const adminToken = deps?.shopifyAdminToken ?? Deno.env.get("SHOPIFY_ADMIN_API_ACCESS_TOKEN");
  const storeDomain = deps?.shopifyStoreDomain ?? Deno.env.get("VITE_SHOPIFY_STORE_DOMAIN");

  if (shouldReconcile && adminToken && storeDomain) {
    try {
      // Fetch customer profile to get verified phone and email
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, email")
        .eq("id", authenticatedUserId)
        .maybeSingle();

      if (profile && (profile.email || profile.phone)) {
        // Build Admin API query for matching orders
        const queryTerm = profile.email || profile.phone || "";
        const adminEndpoint = `https://${storeDomain}/admin/api/2026-01/orders.json?status=any&query=${encodeURIComponent(queryTerm)}`;
        const res = await fetch(adminEndpoint, {
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": adminToken,
          },
        });

        if (res.ok) {
          const data = await res.json();
          const orders = data.orders || [];
          for (const order of orders) {
            const orderGid = `gid://shopify/Order/${order.id}`;
            const lineItems = (order.line_items || []).map((item: any) => ({
              id: String(item.id),
              title: item.title,
              quantity: item.quantity,
              price: parseFloat(item.price || "0"),
              variantTitle: item.variant_title || null,
              sku: item.sku || null,
            }));

            await supabase.from("shopify_customer_orders").upsert(
              {
                user_id: authenticatedUserId,
                shopify_order_id: orderGid,
                order_number: order.name || `#${order.order_number}`,
                created_at: order.created_at || order.processed_at,
                financial_status: order.financial_status || "pending",
                fulfillment_status:
                  order.fulfillment_status || (order.cancelled_at ? "cancelled" : "unfulfilled"),
                currency_code: order.currency || "INR",
                total_price: parseFloat(order.total_price || "0"),
                subtotal_price: parseFloat(order.subtotal_price || "0"),
                total_shipping: parseFloat(
                  order.total_shipping_price_set?.shop_money?.amount || "0",
                ),
                total_tax: parseFloat(order.total_tax || "0"),
                total_discount: parseFloat(order.total_discounts || "0"),
                line_items: lineItems,
                shipping_address: order.shipping_address || null,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "shopify_order_id" },
            );
          }
        }
      }
    } catch (reconcileErr) {
      console.warn("[customer-shopify-orders] On-demand reconciliation error:", reconcileErr);
      // Non-fatal: continue to serve authoritative database snapshot
    }
  }

  // 4. Query authoritative synchronized orders bound to this authenticated user
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
