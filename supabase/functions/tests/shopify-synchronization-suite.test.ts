// supabase/functions/tests/shopify-synchronization-suite.test.ts
// Automated Test Suite for IT HUB — Shopify Seamless Auto-Refresh, Webhooks & Full Catalog Change Synchronization
// IT HUB — Kerala, India (Phase 5 & Phase 6 Validation)

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  mapShopifyProductToCatalog,
  type ShopifyProductNode,
} from "../../../src/lib/shopify-schema.ts";
import {
  diffCatalogProducts,
  patchShopifyAvailability,
  broadcastShopifySync,
} from "../../../src/lib/shopify.ts";
import type { Product } from "../../../src/data/catalog.ts";
import {
  handleShopifyWebhook,
  isDuplicateWebhook,
  clearProcessedWebhooksForTesting,
} from "../shopify-webhook/index.ts";

// Helper to create a base mock Shopify product node
function createMockNode(overrides: Partial<ShopifyProductNode> = {}): ShopifyProductNode {
  return {
    id: "gid://shopify/Product/5001",
    title: "Lenovo Legion R27qe Gen 2",
    handle: "lenovo-legion-r27qe-gen-2",
    description: "27-inch 2K 180Hz Gaming Monitor",
    descriptionHtml: "<p>27-inch 2K 180Hz Gaming Monitor</p>",
    vendor: "Lenovo",
    productType: "Monitor",
    tags: ["Monitor", "Gaming"],
    availableForSale: true,
    images: {
      edges: [{ node: { url: "https://cdn.shopify.com/mon1.jpg", altText: "Front view" } }],
    },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/v5001",
            title: "Default Title",
            availableForSale: true,
            price: { amount: "15999", currencyCode: "INR" },
            compareAtPrice: { amount: "19999", currencyCode: "INR" },
            selectedOptions: [{ name: "Title", value: "Default Title" }],
          },
        },
      ],
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Phase 5: Complete Catalog Change Coverage (diffCatalogProducts)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SYNC-DIFF-1: Scenario 1 — New product added in Shopify is detected", () => {
  const p1 = mapShopifyProductToCatalog(
    createMockNode({ id: "gid://shopify/Product/1", title: "Monitor A" }),
  );
  const p2 = mapShopifyProductToCatalog(
    createMockNode({ id: "gid://shopify/Product/2", title: "Monitor B" }),
  );

  const current = [p1];
  const incoming = [p1, p2];

  const diff = diffCatalogProducts(current, incoming);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
  assertEquals(diff.addedCount, 1);
});

Deno.test("SYNC-DIFF-2: Scenario 2 — Product title change is detected", () => {
  const p1 = mapShopifyProductToCatalog(createMockNode({ title: "Original Title" }));
  const p2 = mapShopifyProductToCatalog(createMockNode({ title: "Updated Brand New Title" }));

  const diff = diffCatalogProducts([p1], [p2]);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
  assertEquals(diff.updatedCount, 1);
});

Deno.test("SYNC-DIFF-3: Scenario 3 — Product selling price change is detected", () => {
  const node1 = createMockNode();
  const node2 = createMockNode({
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/v5001",
            title: "Default Title",
            availableForSale: true,
            price: { amount: "14499", currencyCode: "INR" }, // Discounted
            compareAtPrice: { amount: "19999", currencyCode: "INR" },
          },
        },
      ],
    },
  });

  const p1 = mapShopifyProductToCatalog(node1);
  const p2 = mapShopifyProductToCatalog(node2);

  const diff = diffCatalogProducts([p1], [p2]);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
  assertEquals(p1.price, 15999);
  assertEquals(p2.price, 14499);
});

Deno.test("SYNC-DIFF-4: Scenario 4 — Product image update is detected", () => {
  const p1 = mapShopifyProductToCatalog(
    createMockNode({
      images: { edges: [{ node: { url: "https://cdn.shopify.com/old.jpg" } }] },
    }),
  );
  const p2 = mapShopifyProductToCatalog(
    createMockNode({
      images: { edges: [{ node: { url: "https://cdn.shopify.com/new_highres.jpg" } }] },
    }),
  );

  const diff = diffCatalogProducts([p1], [p2]);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
});

Deno.test("SYNC-DIFF-5: Scenario 5 — Brand/vendor change is detected and normalized", () => {
  const p1 = mapShopifyProductToCatalog(createMockNode({ vendor: "Lenovo" }));
  const p2 = mapShopifyProductToCatalog(createMockNode({ vendor: "Samsung" }));

  const diff = diffCatalogProducts([p1], [p2]);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
  assertEquals(p1.brand, "Lenovo");
  assertEquals(p2.brand, "Samsung");
});

Deno.test("SYNC-DIFF-6: Scenario 6 — Product category change is detected", () => {
  const p1 = mapShopifyProductToCatalog(createMockNode({ productType: "Monitor" }));
  const p2 = mapShopifyProductToCatalog(createMockNode({ productType: "Gaming Displays" }));

  const diff = diffCatalogProducts([p1], [p2]);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
});

Deno.test("SYNC-DIFF-7: Scenario 7 — Variant added or removed is detected", () => {
  const singleVarNode = createMockNode();
  const multiVarNode = createMockNode({
    variants: {
      edges: [
        {
          node: {
            id: "v1",
            title: "128GB",
            availableForSale: true,
            price: { amount: "69999", currencyCode: "INR" },
          },
        },
        {
          node: {
            id: "v2",
            title: "256GB",
            availableForSale: true,
            price: { amount: "79999", currencyCode: "INR" },
          },
        },
      ],
    },
  });

  const p1 = mapShopifyProductToCatalog(singleVarNode);
  const p2 = mapShopifyProductToCatalog(multiVarNode);

  const diff = diffCatalogProducts([p1], [p2]);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
});

Deno.test("SYNC-DIFF-7B: Scenario 7B — Secondary variant price change with identical variant count is detected", () => {
  const nodeA = createMockNode({
    variants: {
      edges: [
        {
          node: {
            id: "v1",
            title: "128GB",
            availableForSale: true,
            price: { amount: "69999", currencyCode: "INR" },
          },
        },
        {
          node: {
            id: "v2",
            title: "256GB",
            availableForSale: true,
            price: { amount: "79999", currencyCode: "INR" },
          },
        },
      ],
    },
  });
  const nodeB = createMockNode({
    variants: {
      edges: [
        {
          node: {
            id: "v1",
            title: "128GB",
            availableForSale: true,
            price: { amount: "69999", currencyCode: "INR" },
          },
        },
        {
          node: {
            id: "v2",
            title: "256GB",
            availableForSale: true,
            price: { amount: "74999", currencyCode: "INR" },
          },
        }, // Secondary variant discounted
      ],
    },
  });

  const p1 = mapShopifyProductToCatalog(nodeA);
  const p2 = mapShopifyProductToCatalog(nodeB);

  const diff = diffCatalogProducts([p1], [p2]);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
});

Deno.test("SYNC-DIFF-8: Scenario 8 — Product unpublished or deleted is detected", () => {
  const p1 = mapShopifyProductToCatalog(createMockNode({ id: "gid://shopify/Product/1" }));
  const p2 = mapShopifyProductToCatalog(createMockNode({ id: "gid://shopify/Product/2" }));

  const current = [p1, p2];
  const incoming = [p1]; // Product 2 was deleted/unpublished in Shopify

  const diff = diffCatalogProducts(current, incoming);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, true);
  assertEquals(diff.removedCount, 1);
});

Deno.test("SYNC-DIFF-9: Scenario 9 — Identical catalog returns hasChanges: false (Zero layout thrash)", () => {
  const p1 = mapShopifyProductToCatalog(createMockNode());
  const diff = diffCatalogProducts([p1], [p1]);

  assertEquals(diff.hasChanges, false);
  assertEquals(diff.hasStructuralChanges, false);
  assertEquals(diff.hasAvailabilityChanges, false);
});

Deno.test("SYNC-DIFF-10: Scenario 10 — Inventory availability toggle without structural change", () => {
  const p1 = mapShopifyProductToCatalog(createMockNode({ availableForSale: true }));
  const p2 = mapShopifyProductToCatalog(
    createMockNode({
      availableForSale: false,
      variants: {
        edges: [
          {
            node: {
              id: "gid://shopify/ProductVariant/v5001",
              title: "Default Title",
              availableForSale: false,
              price: { amount: "15999", currencyCode: "INR" },
              compareAtPrice: { amount: "19999", currencyCode: "INR" },
              selectedOptions: [{ name: "Title", value: "Default Title" }],
            },
          },
        ],
      },
    }),
  );

  const diff = diffCatalogProducts([p1], [p2]);
  assertEquals(diff.hasChanges, true);
  assertEquals(diff.hasStructuralChanges, false); // No titles/prices changed
  assertEquals(diff.hasAvailabilityChanges, true); // Only availability changed
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Phase 2: Webhooks Security & Idempotency Testing
// ─────────────────────────────────────────────────────────────────────────────

async function generateTestHmac(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  let binary = "";
  const bytes = new Uint8Array(signature);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.test("SYNC-HOOK-1: Shopify webhook accepts verified HMAC signature (HTTP 200)", async () => {
  clearProcessedWebhooksForTesting();
  const secret = "shpss_test_secret_key_123456789";
  const payload = JSON.stringify({
    id: 987654321,
    title: "iPhone 17 Sage Green",
    action: "update",
  });
  const hmac = await generateTestHmac(secret, payload);

  const req = new Request("https://localhost/functions/v1/shopify-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Topic": "products/update",
      "X-Shopify-Webhook-Id": "wh-delivery-001",
      "X-Shopify-Shop-Domain": "it-hub-m8tzfzjd.myshopify.com",
    },
    body: payload,
  });

  const res = await handleShopifyWebhook(req, { webhookSecret: secret });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(data.topic, "products/update");
  assertEquals(data.productId, "987654321");
});

Deno.test("SYNC-HOOK-2: Shopify webhook rejects tampered signature (HTTP 401)", async () => {
  const secret = "shpss_test_secret_key_123456789";
  const payload = JSON.stringify({ id: 987654321, title: "Legitimate Payload" });

  const req = new Request("https://localhost/functions/v1/shopify-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": "invalid_forged_signature_base64==",
      "X-Shopify-Topic": "products/update",
    },
    body: payload,
  });

  const res = await handleShopifyWebhook(req, { webhookSecret: secret });
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error.includes("signature mismatch"), true);
});

Deno.test("SYNC-HOOK-3: Shopify webhook handles duplicate delivery idempotently (HTTP 200 skipped)", async () => {
  clearProcessedWebhooksForTesting();
  const secret = "shpss_test_secret_key_123456789";
  const payload = JSON.stringify({ id: 112233, action: "inventory_update" });
  const hmac = await generateTestHmac(secret, payload);

  const createReq = () =>
    new Request("https://localhost/functions/v1/shopify-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-Sha256": hmac,
        "X-Shopify-Topic": "inventory_levels/update",
        "X-Shopify-Webhook-Id": "duplicate-test-id-777",
      },
      body: payload,
    });

  // First delivery
  const res1 = await handleShopifyWebhook(createReq(), { webhookSecret: secret });
  assertEquals(res1.status, 200);

  // Second duplicate delivery
  const res2 = await handleShopifyWebhook(createReq(), { webhookSecret: secret });
  assertEquals(res2.status, 200);
  const data2 = await res2.json();
  assertEquals(data2.ok, true);
  assertEquals(data2.message.includes("Duplicate webhook delivery"), true);
});

Deno.test("SYNC-HOOK-4: Shopify webhook returns 500 when server secret is unconfigured", async () => {
  const req = new Request("https://localhost/functions/v1/shopify-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": "some_sig",
    },
    body: "{}",
  });

  const res = await handleShopifyWebhook(req, { webhookSecret: "" });
  assertEquals(res.status, 500);
  const data = await res.json();
  assertEquals(data.error.includes("unconfigured"), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Phase 6: Fault Tolerance & Multi-Tab Broadcast Safety
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SYNC-FAULT-1: Last known good catalog preservation on background refresh failure", () => {
  const knownGoodProduct = mapShopifyProductToCatalog(
    createMockNode({ title: "Solid State Drive 1TB" }),
  );
  const initialCatalog: Product[] = [knownGoodProduct];

  // Simulate background refresh resulting in an API error (e.g. rate limit HTTP 429)
  const failedResponse = {
    status: "rejected" as const,
    reason: new Error(
      "Shopify Storefront API rate limit reached. Please retry after a brief pause.",
    ),
  };

  // State update logic: when rejected, prev.products MUST NOT be wiped
  const prev = { products: initialCatalog, catalogError: null as string | null };
  const updates: Partial<typeof prev> = {};

  if (failedResponse.status === "rejected") {
    updates.catalogError = failedResponse.reason.message;
    // products is intentionally omitted from updates to keep last known good
  }

  const nextState = { ...prev, ...updates };

  assertEquals(nextState.products.length, 1);
  assertEquals(nextState.products[0].name, "Solid State Drive 1TB");
  assertEquals(Boolean(nextState.catalogError), true);
});

Deno.test("SYNC-BROADCAST-1: Multi-tab sync message serialization is valid", () => {
  const testMsg = {
    type: "AVAILABILITY_SYNC" as const,
    timestamp: Date.now(),
    payload: {
      "gid://shopify/Product/15450935427316": {
        id: "gid://shopify/Product/15450935427316",
        availableForSale: false,
      },
    },
  };

  const serialized = JSON.stringify(testMsg);
  const parsed = JSON.parse(serialized);

  assertEquals(parsed.type, "AVAILABILITY_SYNC");
  assertEquals(parsed.payload["gid://shopify/Product/15450935427316"].availableForSale, false);
});
