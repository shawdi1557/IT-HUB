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

  // Never read a VITE_ variable here: those are built into the browser bundle.
  const secret = deps?.webhookSecret ?? Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";

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

  // 2. Parse JSON payload
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

  // 3. Handle Order Topics (orders/create, orders/updated, orders/fulfilled, orders/cancelled, orders/paid)
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

    // Shopify retries until it gets a 2xx, so a delivery must not be marked done before it has
    // been processed. A failed attempt stays claimable and its retry runs again.
    if (webhookId) {
      const { data: claimed, error: claimErr } = await supabase.rpc("claim_shopify_webhook", {
        p_webhook_id: webhookId,
        p_topic: topicHeader,
      });
      if (claimErr) {
        console.error(`[shopify-webhook] Could not claim delivery: ${claimErr.message}`);
        return new Response(JSON.stringify({ error: "Could not record webhook delivery." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (claimed === false) {
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
    }

    const finish = async (succeeded: boolean, error?: string) => {
      if (!webhookId) return;
      const { error: finishErr } = await supabase.rpc("finish_shopify_webhook", {
        p_webhook_id: webhookId,
        p_succeeded: succeeded,
        p_error: error ?? null,
      });
      if (finishErr) console.error(`[shopify-webhook] Could not finish: ${finishErr.message}`);
    };

    // An order that's already bound stays with that customer.
    const { data: existingOrder, error: existingErr } = await supabase
      .from("shopify_customer_orders")
      .select("id, user_id, shopify_updated_at")
      .eq("shopify_order_id", orderGid)
      .maybeSingle();

    if (existingErr) {
      await finish(false, existingErr.message);
      return new Response(JSON.stringify({ error: "Could not read the existing order." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let resolvedUserId: string | null = existingOrder?.user_id ?? null;

    // Webhooks can arrive out of order. An older delivery must not overwrite a newer one.
    const incomingUpdatedAt = payload.updated_at ? new Date(payload.updated_at).getTime() : null;
    const storedUpdatedAt = existingOrder?.shopify_updated_at
      ? new Date(existingOrder.shopify_updated_at).getTime()
      : null;
    if (incomingUpdatedAt && storedUpdatedAt && incomingUpdatedAt < storedUpdatedAt) {
      await finish(true);
      return new Response(
        JSON.stringify({
          ok: true,
          topic: topicHeader,
          orderId: orderGid,
          message: "Older delivery ignored; the stored order is newer.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // The single-use token issued to the signed-in customer's own session is the only proof of
    // ownership. Emails and phone numbers are never used: anyone can edit their profile's contact
    // details, and anyone can type any address at checkout.
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

        if (rpcErr) {
          await finish(false, rpcErr.message);
          return new Response(JSON.stringify({ error: "Could not validate association token." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (consumedUserId) {
          resolvedUserId = consumedUserId;
        } else {
          // Started on the website, but the token has expired or already linked another order.
          console.warn(`[shopify-webhook] Unusable checkout token on order ${orderGid}`);
        }
      }
    }

    // No valid token means this isn't a website order: an in-store, WhatsApp, manual or historical
    // order, for example. Those aren't tracked, so nothing about the order is kept.
    if (!resolvedUserId) {
      await finish(true);
      return new Response(
        JSON.stringify({
          ok: true,
          topic: topicHeader,
          orderId: orderGid,
          orderAssociated: false,
          message: "Not a website order, so it isn't linked to an account.",
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

    const orderData = {
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
    };

    const { error: upsertErr } = await supabase.from("shopify_customer_orders").upsert(
      {
        ...orderData,
        user_id: resolvedUserId,
        shopify_order_id: orderGid,
        shopify_updated_at: payload.updated_at || null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "shopify_order_id" },
    );

    if (upsertErr) {
      console.error(`[shopify-webhook] Upsert error: ${upsertErr.message}`);
      await finish(false, upsertErr.message);
      return new Response(JSON.stringify({ error: "Could not save the order." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    await finish(true);
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

  // 4. Product and catalog topics are only logged, so a repeat delivery has no effect
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
