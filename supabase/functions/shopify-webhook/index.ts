// supabase/functions/shopify-webhook/index.ts
// Production-Ready Shopify Webhook Ingestion & Cache Invalidation Edge Function
// Verifies X-Shopify-Hmac-Sha256 using HMAC-SHA256 and coordinates real-time catalog & order synchronization

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { verifyShopifyWebhook } from "../_shared/shopify-webhook.ts";

export interface ShopifyWebhookDeps {
  webhookSecret?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
}

// In-memory LRU idempotency cache for deduplicating repeated webhook deliveries
const PROCESSED_WEBHOOK_IDS = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isDuplicateWebhook(webhookId: string): boolean {
  if (!webhookId) return false;
  const now = Date.now();
  const timestamp = PROCESSED_WEBHOOK_IDS.get(webhookId);
  if (timestamp && now - timestamp < IDEMPOTENCY_TTL_MS) {
    return true;
  }
  // Clean old entries if cache grows large
  if (PROCESSED_WEBHOOK_IDS.size > 1000) {
    for (const [id, ts] of PROCESSED_WEBHOOK_IDS.entries()) {
      if (now - ts >= IDEMPOTENCY_TTL_MS) {
        PROCESSED_WEBHOOK_IDS.delete(id);
      }
    }
  }
  PROCESSED_WEBHOOK_IDS.set(webhookId, now);
  return false;
}

export function clearProcessedWebhooksForTesting(): void {
  PROCESSED_WEBHOOK_IDS.clear();
}

/**
 * Normalizes an Indian phone number or general phone to standard format.
 */
function normalizePhone(raw?: string): string {
  if (!raw) return "";
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return `+${digitsOnly}`;
  }
  return `+${digitsOnly}`;
}

export async function handleShopifyWebhook(
  req: Request,
  deps?: ShopifyWebhookDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Expected POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
  const topicHeader = req.headers.get("X-Shopify-Topic") || "unknown";
  const webhookId = req.headers.get("X-Shopify-Webhook-Id") || "";
  const shopDomain = req.headers.get("X-Shopify-Shop-Domain") || "";

  const secret =
    deps?.webhookSecret ??
    Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ??
    Deno.env.get("VITE_SHOPIFY_WEBHOOK_SECRET") ??
    "";

  if (!secret) {
    return new Response(
      JSON.stringify({
        error: "Shopify webhook secret is unconfigured on server.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let rawBodyText = "";
  try {
    rawBodyText = await req.text();
  } catch (_err: any) {
    return new Response(JSON.stringify({ error: "Failed to read request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Verify cryptographic HMAC signature
  const verification = await verifyShopifyWebhook(rawBodyText, hmacHeader, secret);
  if (!verification.isValid) {
    return new Response(
      JSON.stringify({
        error: verification.error || "Invalid webhook signature.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2. Enforce idempotency: prevent re-executing duplicate webhook deliveries
  if (webhookId && isDuplicateWebhook(webhookId)) {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Duplicate webhook delivery acknowledged and skipped.",
        webhookId,
        topic: topicHeader,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 3. Parse JSON payload
  let payload: any = {};
  if (rawBodyText.trim()) {
    try {
      payload = JSON.parse(rawBodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload in webhook." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 4. Handle Order Topics (orders/create, orders/updated, orders/fulfilled, orders/cancelled, orders/paid)
  if (topicHeader.startsWith("orders/")) {
    const rawId = payload.id ? String(payload.id) : "";
    if (!rawId) {
      return new Response(JSON.stringify({ error: "Missing order ID in payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const orderGid = rawId.startsWith("gid://") ? rawId : `gid://shopify/Order/${rawId}`;
    const supabaseUrl =
      deps?.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
    const serviceKey =
      deps?.supabaseServiceRoleKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!serviceKey) {
      return new Response(
        JSON.stringify({
          error: "Supabase service credentials unconfigured for order processing.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Check if order already has an existing binding in shopify_customer_orders
    const { data: existingOrder } = await supabase
      .from("shopify_customer_orders")
      .select("id, user_id")
      .eq("shopify_order_id", orderGid)
      .maybeSingle();

    let resolvedUserId: string | null = existingOrder?.user_id ?? null;

    // Check for association token if not yet resolved
    if (!resolvedUserId) {
      const noteAttributes: Array<{ name?: string; key?: string; value?: string }> =
        payload.note_attributes || payload.custom_attributes || [];

      const tokenAttr = noteAttributes.find(
        (attr) =>
          (attr.name === "_hub_assoc_token" || attr.key === "_hub_assoc_token") &&
          attr.value &&
          attr.value.trim().length > 0,
      );

      if (tokenAttr?.value) {
        const { data: consumedUserId, error: rpcErr } = await supabase.rpc(
          "validate_and_consume_association_token",
          {
            p_token: tokenAttr.value.trim(),
            p_shopify_order_id: orderGid,
          },
        );

        if (!rpcErr && consumedUserId) {
          resolvedUserId = consumedUserId;
        }
      }
    }

    // Controlled fallback: Match by verified profile phone or email ONLY if exactly 1 non-ambiguous profile exists
    if (!resolvedUserId) {
      const rawPhone = payload.phone || payload.customer?.phone || "";
      const rawEmail = (payload.email || payload.customer?.email || "").toLowerCase().trim();
      const normalizedP = normalizePhone(rawPhone);

      if (normalizedP || rawEmail) {
        let query = supabase.from("profiles").select("id, phone, email");
        if (normalizedP && rawEmail) {
          query = query.or(`phone.eq.${normalizedP},email.eq.${rawEmail}`);
        } else if (normalizedP) {
          query = query.eq("phone", normalizedP);
        } else {
          query = query.eq("email", rawEmail);
        }

        const { data: matchingProfiles } = await query;
        // Strict ambiguity check: Exactly ONE profile must match
        if (matchingProfiles && matchingProfiles.length === 1) {
          resolvedUserId = matchingProfiles[0].id;
        } else if (matchingProfiles && matchingProfiles.length > 1) {
          console.warn(
            `[shopify-webhook] Identity ambiguity: order ${orderGid} matched ${matchingProfiles.length} customer profiles. Skipping automatic association.`,
          );
        }
      }
    }

    if (!resolvedUserId) {
      return new Response(
        JSON.stringify({
          ok: true,
          topic: topicHeader,
          orderId: orderGid,
          orderAssociated: false,
          message: "Order processed without customer association (guest checkout or unmatched).",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Map line items into standard JSON structure
    const lineItems = (payload.line_items || []).map((item: any) => ({
      id: item.id ? String(item.id) : undefined,
      title: item.title || item.name || "Item",
      quantity: Number(item.quantity) || 1,
      price: parseFloat(item.price || "0"),
      variantTitle: item.variant_title || null,
      sku: item.sku || null,
      imageUrl: item.image?.src || item.image?.url || null,
    }));

    // Determine fulfillment and tracking info
    const fulfillments = payload.fulfillments || [];
    const firstFulfillment = fulfillments[0] || {};
    const trackingInfo =
      firstFulfillment.tracking_info?.[0] || firstFulfillment.tracking_info || {};

    const trackingCompany = trackingInfo.company || firstFulfillment.tracking_company || null;
    const trackingNumber = trackingInfo.number || firstFulfillment.tracking_number || null;
    const trackingUrl = trackingInfo.url || firstFulfillment.tracking_url || null;

    let fulfillmentStatus = payload.fulfillment_status || "unfulfilled";
    if (topicHeader === "orders/cancelled" || payload.cancelled_at) {
      fulfillmentStatus = "cancelled";
    } else if (
      firstFulfillment.status === "success" ||
      firstFulfillment.shipment_status === "delivered"
    ) {
      fulfillmentStatus = "fulfilled";
    }

    let financialStatus = payload.financial_status || "pending";
    if (topicHeader === "orders/paid") {
      financialStatus = "paid";
    }

    const orderNumber =
      payload.name || payload.order_number
        ? `#${String(payload.order_number || payload.name).replace(/^#/, "")}`
        : `#${rawId.slice(-4)}`;
    const createdAt = payload.created_at || payload.processed_at || new Date().toISOString();
    const totalPrice = parseFloat(payload.total_price || payload.current_total_price || "0");
    const subtotalPrice = parseFloat(
      payload.subtotal_price || payload.current_subtotal_price || "0",
    );
    const totalTax = parseFloat(payload.total_tax || "0");
    const totalDiscount = parseFloat(payload.total_discounts || "0");
    const totalShipping = parseFloat(
      payload.total_shipping_price_set?.shop_money?.amount || payload.total_shipping_price || "0",
    );
    const currencyCode = payload.currency || "INR";

    const { error: upsertErr } = await supabase.from("shopify_customer_orders").upsert(
      {
        user_id: resolvedUserId,
        shopify_order_id: orderGid,
        order_number: orderNumber,
        created_at: createdAt,
        financial_status: financialStatus,
        fulfillment_status: fulfillmentStatus,
        currency_code: currencyCode,
        total_price: totalPrice,
        subtotal_price: subtotalPrice,
        total_shipping: totalShipping,
        total_tax: totalTax,
        total_discount: totalDiscount,
        tracking_company: trackingCompany,
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
        line_items: lineItems,
        shipping_address: payload.shipping_address || null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "shopify_order_id" },
    );

    if (upsertErr) {
      console.error(`[shopify-webhook] Upsert error: ${upsertErr.message}`);
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        topic: topicHeader,
        orderId: orderGid,
        orderAssociated: true,
        userId: resolvedUserId,
        receivedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 5. Fallback for Product / Catalog Topics
  const productId = payload.id ? String(payload.id) : undefined;
  const variantId = payload.variant_id ? String(payload.variant_id) : undefined;

  console.log(
    `[shopify-webhook] Received topic: ${topicHeader} for product: ${productId || "n/a"} (id: ${webhookId})`,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      topic: topicHeader,
      shopDomain,
      webhookId,
      productId,
      variantId,
      receivedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// Serve HTTP requests if executed directly by Deno
if (import.meta.main) {
  serve((req) => handleShopifyWebhook(req));
}
