// supabase/functions/tests/shopify-webhook-order-sync.test.ts
// Automated Tests for Shopify Webhook Order Ingestion, Token Validation, Fallback & Sync

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleShopifyWebhook } from "../shopify-webhook/index.ts";
import { TEST_SERVICE_KEY, TEST_SUPABASE_URL, dbTest } from "./_helpers/disposable_env.ts";

const SUPABASE_URL = TEST_SUPABASE_URL;
const SERVICE_KEY = TEST_SERVICE_KEY;
const WEBHOOK_SECRET = "test_webhook_signing_secret_xyz123";

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function signPayload(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(body));
  let binary = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

dbTest("WH-ORDER-1: Ingests valid orders/create with association token", async () => {
  // 1. Get existing customer profile id
  const { data: profs } = await adminClient.from("profiles").select("id").limit(1);
  const testUserId = profs?.[0]?.id || "29f73eb0-86d2-47d3-a493-7c1932b45ed5";

  // 2. Insert valid association token
  const token = `hub_assoc_test_${Date.now()}`;
  await adminClient.from("shopify_order_associations").insert({
    token,
    user_id: testUserId,
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

  const orderId = `9001_${Date.now()}`;
  const orderGid = `gid://shopify/Order/${orderId}`;
  const payload = {
    id: orderId,
    name: `#ITH-${orderId.slice(-4)}`,
    created_at: new Date().toISOString(),
    financial_status: "paid",
    fulfillment_status: null,
    total_price: "24999.00",
    subtotal_price: "23999.00",
    total_tax: "1000.00",
    total_discounts: "0.00",
    currency: "INR",
    note_attributes: [{ name: "_hub_assoc_token", value: token }],
    line_items: [
      {
        id: 101,
        title: "Mechanical Gaming Keyboard",
        quantity: 1,
        price: "4999.00",
        variant_title: "RGB Blue Switches",
      },
    ],
    shipping_address: {
      address1: "Main Road, Kothamangalam",
      city: "Ernakulam",
      province: "Kerala",
      zip: "686691",
      country: "India",
    },
  };

  const bodyStr = JSON.stringify(payload);
  const signature = await signPayload(bodyStr, WEBHOOK_SECRET);

  const req = new Request("http://localhost/shopify-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": "orders/create",
      "X-Shopify-Hmac-Sha256": signature,
      "X-Shopify-Webhook-Id": `wh_evt_${Date.now()}`,
      "X-Shopify-Shop-Domain": "it-hub-m8tzfzjd.myshopify.com",
    },
    body: bodyStr,
  });

  const res = await handleShopifyWebhook(req, {
    webhookSecret: WEBHOOK_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SERVICE_KEY,
  });

  assertEquals(res.status, 200);
  const resData = await res.json();
  assertEquals(resData.ok, true);
  assertEquals(resData.orderAssociated, true);

  // Verify record in shopify_customer_orders
  const { data: savedOrder, error } = await adminClient
    .from("shopify_customer_orders")
    .select("*")
    .eq("shopify_order_id", orderGid)
    .single();

  assertEquals(error, null);
  assertEquals(savedOrder.user_id, testUserId);
  assertEquals(savedOrder.total_price, 24999);
  assertEquals(savedOrder.financial_status, "paid");
  assertEquals(savedOrder.line_items.length, 1);
  assertEquals(savedOrder.line_items[0].title, "Mechanical Gaming Keyboard");

  // Clean up
  await adminClient.from("shopify_customer_orders").delete().eq("shopify_order_id", orderGid);
});

dbTest("WH-ORDER-2: Updates order when fulfillment arrives (orders/updated)", async () => {
  const { data: profs } = await adminClient.from("profiles").select("id").limit(1);
  const testUserId = profs?.[0]?.id || "29f73eb0-86d2-47d3-a493-7c1932b45ed5";

  const orderId = `9002_${Date.now()}`;
  const orderGid = `gid://shopify/Order/${orderId}`;

  // Pre-seed order as unfulfilled
  await adminClient.from("shopify_customer_orders").insert({
    user_id: testUserId,
    shopify_order_id: orderGid,
    order_number: "#ITH-9002",
    created_at: new Date().toISOString(),
    financial_status: "paid",
    fulfillment_status: "unfulfilled",
    total_price: 12000,
  });

  // Now Shopify sends orders/updated with tracking details
  const payload = {
    id: orderId,
    name: "#ITH-9002",
    created_at: new Date().toISOString(),
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    total_price: "12000.00",
    fulfillments: [
      {
        tracking_company: "BlueDart",
        tracking_number: "BD123456789IN",
        tracking_url: "https://bluedart.com/track/BD123456789IN",
      },
    ],
  };

  const bodyStr = JSON.stringify(payload);
  const signature = await signPayload(bodyStr, WEBHOOK_SECRET);

  const req = new Request("http://localhost/shopify-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": "orders/updated",
      "X-Shopify-Hmac-Sha256": signature,
      "X-Shopify-Webhook-Id": `wh_evt_${Date.now()}`,
    },
    body: bodyStr,
  });

  const res = await handleShopifyWebhook(req, {
    webhookSecret: WEBHOOK_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SERVICE_KEY,
  });

  assertEquals(res.status, 200);

  const { data: updatedOrder } = await adminClient
    .from("shopify_customer_orders")
    .select("*")
    .eq("shopify_order_id", orderGid)
    .single();

  assertEquals(updatedOrder.fulfillment_status, "fulfilled");
  assertEquals(updatedOrder.tracking_company, "BlueDart");
  assertEquals(updatedOrder.tracking_number, "BD123456789IN");

  // Clean up
  await adminClient.from("shopify_customer_orders").delete().eq("shopify_order_id", orderGid);
});

Deno.test("WH-ORDER-3: Rejects webhook with invalid HMAC signature", async () => {
  const req = new Request("http://localhost/shopify-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": "orders/create",
      "X-Shopify-Hmac-Sha256": "fake_tampered_signature",
      "X-Shopify-Webhook-Id": `wh_evt_${Date.now()}`,
    },
    body: JSON.stringify({ id: 123 }),
  });

  const res = await handleShopifyWebhook(req, {
    webhookSecret: WEBHOOK_SECRET,
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SERVICE_KEY,
  });

  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error.includes("signature mismatch"), true);
});
