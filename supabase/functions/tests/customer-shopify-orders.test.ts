// supabase/functions/tests/customer-shopify-orders.test.ts
// Automated Tests for Authenticated Customer Shopify Order Retrieval Edge Function

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleCustomerShopifyOrders } from "../customer-shopify-orders/index.ts";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

Deno.test("ORD-API-1: Rejects unauthenticated requests with HTTP 401", async () => {
  const req = new Request("http://localhost/customer-shopify-orders", {
    method: "GET",
    headers: {},
  });

  const res = await handleCustomerShopifyOrders(req, {
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SERVICE_KEY,
  });

  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error.includes("Authentication required"), true);
});

Deno.test("ORD-API-2: Returns only authenticated customer's orders (Cross-Customer Isolation)", async () => {
  const { data: profs } = await adminClient.from("profiles").select("id").limit(2);
  const userA = profs?.[0]?.id || "29f73eb0-86d2-47d3-a493-7c1932b45ed5";
  const userB = profs?.[1]?.id || "0370fb7a-7896-44bc-a543-023dd399913f";

  // Pre-seed an order for user A and an order for user B
  await adminClient.from("shopify_customer_orders").delete().in("user_id", [userA, userB]);
  await adminClient.from("shopify_customer_orders").insert([
    {
      user_id: userA,
      shopify_order_id: "gid://shopify/Order/iso_test_a",
      order_number: "#ITH-ISO-A",
      created_at: new Date(Date.now() - 10000).toISOString(),
      total_price: 3500,
      financial_status: "paid",
      fulfillment_status: "unfulfilled",
      line_items: [{ title: "Item A For User A", quantity: 1, price: 3500 }],
    },
    {
      user_id: userB,
      shopify_order_id: "gid://shopify/Order/iso_test_b",
      order_number: "#ITH-ISO-B",
      created_at: new Date().toISOString(),
      total_price: 9900,
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      line_items: [{ title: "Item B For User B", quantity: 1, price: 9900 }],
    },
  ]);

  // Request as User A (simulated verified auth token or inject user object)
  const req = new Request("http://localhost/customer-shopify-orders?limit=10", {
    method: "GET",
    headers: {
      Authorization: "Bearer mock_user_a_token",
    },
  });

  const res = await handleCustomerShopifyOrders(req, {
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SERVICE_KEY,
    overrideUserId: userA, // Test harness mock for verified JWT derivation
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(data.orders.length, 1);
  assertEquals(data.orders[0].shopify_order_id, "gid://shopify/Order/iso_test_a");
  assertEquals(data.orders[0].order_number, "#ITH-ISO-A");

  // Ensure user B's order is NOT present
  const hasUserBOrder = data.orders.some(
    (o: any) => o.shopify_order_id === "gid://shopify/Order/iso_test_b",
  );
  assertEquals(hasUserBOrder, false);

  // Clean up
  await adminClient.from("shopify_customer_orders").delete().in("user_id", [userA, userB]);
});

Deno.test("ORD-API-3: Supports pagination and newest-first sort order", async () => {
  const { data: profs } = await adminClient.from("profiles").select("id").limit(1);
  const testUserId = profs?.[0]?.id || "29f73eb0-86d2-47d3-a493-7c1932b45ed5";

  await adminClient.from("shopify_customer_orders").delete().eq("user_id", testUserId);

  // Insert 3 orders with distinct created_at
  const now = Date.now();
  await adminClient.from("shopify_customer_orders").insert([
    {
      user_id: testUserId,
      shopify_order_id: "gid://shopify/Order/pg_1",
      order_number: "#ITH-P1",
      created_at: new Date(now - 30000).toISOString(), // Oldest
      total_price: 1000,
      financial_status: "paid",
      line_items: [],
    },
    {
      user_id: testUserId,
      shopify_order_id: "gid://shopify/Order/pg_2",
      order_number: "#ITH-P2",
      created_at: new Date(now - 20000).toISOString(), // Middle
      total_price: 2000,
      financial_status: "paid",
      line_items: [],
    },
    {
      user_id: testUserId,
      shopify_order_id: "gid://shopify/Order/pg_3",
      order_number: "#ITH-P3",
      created_at: new Date(now - 10000).toISOString(), // Newest
      total_price: 3000,
      financial_status: "paid",
      line_items: [],
    },
  ]);

  // Request page size 2
  const req = new Request("http://localhost/customer-shopify-orders?limit=2", {
    method: "GET",
  });

  const res = await handleCustomerShopifyOrders(req, {
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SERVICE_KEY,
    overrideUserId: testUserId,
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.orders.length, 2);
  assertEquals(data.orders[0].order_number, "#ITH-P3", "Newest order must be first");
  assertEquals(data.orders[1].order_number, "#ITH-P2", "Second newest must follow");
  assertEquals(data.pageInfo.hasNextPage, true);

  // Clean up
  await adminClient.from("shopify_customer_orders").delete().eq("user_id", testUserId);
});
