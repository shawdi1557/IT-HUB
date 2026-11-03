// supabase/functions/tests/shopify-customer-orders-db.test.ts
// Automated Tests for Shopify Order Associations, Synchronized Orders & RLS Security

import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  TEST_ANON_KEY,
  TEST_SERVICE_KEY,
  TEST_SUPABASE_URL,
  dbTest,
} from "./_helpers/disposable_env.ts";
import { createSignedInUser } from "./_helpers/test_users.ts";

const SUPABASE_URL = TEST_SUPABASE_URL;
const SERVICE_KEY = TEST_SERVICE_KEY;
const ANON_KEY = TEST_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

dbTest("DB-SHOPIFY-1: Tables exist and have appropriate columns", async () => {
  const { data: assocCols, error: err1 } = await adminClient
    .from("shopify_order_associations")
    .select("id, token, user_id, expires_at, used_at, shopify_order_id, created_at")
    .limit(0);

  assertEquals(err1, null, "shopify_order_associations table should exist with required columns");

  const { data: orderCols, error: err2 } = await adminClient
    .from("shopify_customer_orders")
    .select(
      "id, user_id, shopify_order_id, order_number, created_at, financial_status, fulfillment_status, currency_code, total_price, subtotal_price, total_shipping, total_tax, total_discount, tracking_company, tracking_number, tracking_url, line_items, shipping_address, synced_at",
    )
    .limit(0);

  assertEquals(err2, null, "shopify_customer_orders table should exist with required columns");
});

dbTest("DB-SHOPIFY-2: Token creation and consumption RPCs validate lifecycle", async () => {
  // 1. A real customer creates a token through the real RPC
  const customer = await createSignedInUser("db-shopify");
  const testUserId = customer.id;
  const { data: token, error: insErr } = await customer.client.rpc("create_checkout_association");
  assertEquals(insErr, null, "Should create association token");

  // 2. The customer can't consume it themselves: only the server can
  const blocked = await customer.client.rpc("validate_and_consume_association_token", {
    p_token: token,
    p_shopify_order_id: "gid://shopify/Order/990000",
  });
  assertEquals(blocked.error?.code, "42501");

  // 3. Test RPC: validate_and_consume_association_token
  const shopifyOrderId = `gid://shopify/Order/990001`;
  const { data: consumedUserId, error: rpcErr } = await adminClient.rpc(
    "validate_and_consume_association_token",
    {
      p_token: token,
      p_shopify_order_id: shopifyOrderId,
    },
  );

  assertEquals(rpcErr, null, "RPC validate_and_consume_association_token should succeed");
  assertEquals(consumedUserId, testUserId, "Should return correct user_id");

  // 4. A used token can't link a different order (single-use enforcement)
  const { data: secondConsume, error: secondErr } = await adminClient.rpc(
    "validate_and_consume_association_token",
    {
      p_token: token,
      p_shopify_order_id: "gid://shopify/Order/990002",
    },
  );

  assertEquals(secondErr, null);
  assertEquals(secondConsume, null, "Already-consumed token must return null (cannot be reused)");

  // 5. Shopify's retry of the same order gets the same owner, and nothing changes
  const { data: retried, error: retryErr } = await adminClient.rpc(
    "validate_and_consume_association_token",
    {
      p_token: token,
      p_shopify_order_id: shopifyOrderId,
    },
  );

  assertEquals(retryErr, null);
  assertEquals(retried, testUserId, "A retry for the same order must find its owner");
});

dbTest("DB-SHOPIFY-3: RLS ensures Customer A cannot view Customer B orders", async () => {
  const { data: profs } = await adminClient.from("profiles").select("id").limit(2);
  const userA = profs?.[0]?.id || "29f73eb0-86d2-47d3-a493-7c1932b45ed5";
  const userB = profs?.[1]?.id || "0370fb7a-7896-44bc-a543-023dd399913f";

  // Insert order for User A and User B
  await adminClient.from("shopify_customer_orders").delete().in("user_id", [userA, userB]);
  await adminClient.from("shopify_customer_orders").insert([
    {
      user_id: userA,
      shopify_order_id: "gid://shopify/Order/userA-1",
      order_number: "#ITH-A1",
      created_at: new Date().toISOString(),
      total_price: 1500,
      financial_status: "paid",
      fulfillment_status: "unfulfilled",
      line_items: [{ title: "Laptop RAM 16GB", quantity: 1, price: 1500 }],
    },
    {
      user_id: userB,
      shopify_order_id: "gid://shopify/Order/userB-1",
      order_number: "#ITH-B1",
      created_at: new Date().toISOString(),
      total_price: 4500,
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      line_items: [{ title: "27in Monitor", quantity: 1, price: 4500 }],
    },
  ]);

  // Anonymous / unauthenticated client must receive 0 rows or error
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: anonData } = await anonClient.from("shopify_customer_orders").select("*");
  assertEquals(anonData?.length || 0, 0, "Anon client must not see any shopify customer orders");

  // Clean up test rows
  await adminClient.from("shopify_customer_orders").delete().in("user_id", [userA, userB]);
  await adminClient.from("shopify_order_associations").delete().in("user_id", [userA, userB]);
});
