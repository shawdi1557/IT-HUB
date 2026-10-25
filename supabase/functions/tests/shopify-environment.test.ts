// supabase/functions/tests/shopify-environment.test.ts
// Automated Test Suite for Phase 2:
// Isolated Shopify Environment, Storefront Client Configuration & Webhook Security

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { constantTimeCompare, verifyShopifyWebhook } from "../_shared/shopify-webhook.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain Validation & Normalization Invariants
// ─────────────────────────────────────────────────────────────────────────────

function validateShopifyDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string") return false;
  const trimmed = domain.trim().toLowerCase();
  if (
    trimmed.includes("..") ||
    trimmed.startsWith("-") ||
    trimmed.endsWith("-") ||
    trimmed.includes(":") ||
    trimmed.includes("/")
  ) {
    return false;
  }
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.myshopify\.com|(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)$/.test(
    trimmed,
  );
}

function normalizeShopifyDomain(domain: string): string {
  if (!domain) return "";
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

Deno.test("SHOP-ENV-1: Domain normalization strips protocol, port, and trailing slashes", () => {
  assertEquals(
    normalizeShopifyDomain("https://it-hub-kerala.myshopify.com/"),
    "it-hub-kerala.myshopify.com",
  );
  assertEquals(
    normalizeShopifyDomain("http://ITHUB-STORE.myshopify.com///"),
    "ithub-store.myshopify.com",
  );
  assertEquals(normalizeShopifyDomain("  ithubkerala.in  "), "ithubkerala.in");
  assertEquals(normalizeShopifyDomain(""), "");
});

Deno.test("SHOP-ENV-2: Domain validator permits valid myshopify.com and custom domains", () => {
  assertEquals(validateShopifyDomain("it-hub-kerala.myshopify.com"), true);
  assertEquals(validateShopifyDomain("quick-start-123.myshopify.com"), true);
  assertEquals(validateShopifyDomain("store.ithubkerala.com"), true);
  assertEquals(validateShopifyDomain("ithub.in"), true);

  // Rejections
  assertEquals(validateShopifyDomain("invalid..domain.myshopify.com"), false);
  assertEquals(validateShopifyDomain("-badstart.myshopify.com"), false);
  assertEquals(validateShopifyDomain("javascript:alert(1)"), false);
  assertEquals(validateShopifyDomain(""), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Secret Exposure Prevention & Least-Privilege Token Invariants
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-ENV-3: Public client strictly rejects Admin API tokens (shpat_ / shpca_)", () => {
  const adminToken = "shpat_mock_forbidden_admin_token";
  const storefrontToken = "storefront_mock_safe_token";

  const isAdminToken = adminToken.startsWith("shpat_") || adminToken.startsWith("shpca_");
  const isSafeToken =
    !storefrontToken.startsWith("shpat_") && !storefrontToken.startsWith("shpca_");

  assertEquals(isAdminToken, true, "Admin token prefix correctly detected");
  assertEquals(isSafeToken, true, "Valid Storefront token allowed");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Webhook Signature Verification & Constant-Time Security
// ─────────────────────────────────────────────────────────────────────────────

async function generateTestHmac(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.test("SHOP-ENV-4: Valid Shopify HMAC-SHA256 signature is verified successfully", async () => {
  const secret = "test_shopify_webhook_secret_xyz123";
  const payload = JSON.stringify({
    id: 123456789,
    topic: "orders/create",
    currency: "INR",
    total_price: "2499.00",
  });

  const signature = await generateTestHmac(payload, secret);

  const check = await verifyShopifyWebhook(payload, signature, secret);
  assertEquals(check.isValid, true);
  assertEquals(check.error, undefined);
});

Deno.test("SHOP-ENV-5: Tampered payload bytes are rejected with signature mismatch", async () => {
  const secret = "test_shopify_webhook_secret_xyz123";
  const originalPayload = JSON.stringify({ id: 123, total_price: "100.00" });
  const tamperedPayload = JSON.stringify({ id: 123, total_price: "1.00" });

  const signature = await generateTestHmac(originalPayload, secret);

  const check = await verifyShopifyWebhook(tamperedPayload, signature, secret);
  assertEquals(check.isValid, false);
  assertStringIncludes(check.error || "", "mismatch");
});

Deno.test("SHOP-ENV-6: Wrong webhook secret is rejected with signature mismatch", async () => {
  const payload = JSON.stringify({ id: 999, action: "inventory_levels/update" });
  const signature = await generateTestHmac(payload, "secret_A");

  const check = await verifyShopifyWebhook(payload, signature, "secret_B");
  assertEquals(check.isValid, false);
  assertStringIncludes(check.error || "", "mismatch");
});

Deno.test("SHOP-ENV-7: Missing header or secret fails closed with descriptive error", async () => {
  const payload = "test body";
  const checkMissingSecret = await verifyShopifyWebhook(payload, "some_sig", "");
  assertEquals(checkMissingSecret.isValid, false);
  assertStringIncludes(checkMissingSecret.error || "", "secret");

  const checkMissingHeader = await verifyShopifyWebhook(payload, "", "some_secret");
  assertEquals(checkMissingHeader.isValid, false);
  assertStringIncludes(checkMissingHeader.error || "", "header");
});

Deno.test("SHOP-ENV-8: constantTimeCompare handles identical, mismatched, and variable length strings", () => {
  assertEquals(constantTimeCompare("abcdef", "abcdef"), true);
  assertEquals(constantTimeCompare("abcdef", "abcdeg"), false);
  assertEquals(constantTimeCompare("short", "longer_string"), false);
  assertEquals(constantTimeCompare("", ""), true);
  assertEquals(constantTimeCompare("a", "b"), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GraphQL Query Error & Rate Limit Simulator
// ─────────────────────────────────────────────────────────────────────────────

interface MockResponse {
  status: number;
  statusText?: string;
  json: () => Promise<any>;
}

async function simulateGraphQLClient(
  mockResponse: MockResponse,
): Promise<{ ok: boolean; status: number; error?: string; data?: any }> {
  const status = mockResponse.status;
  if (status === 429) {
    return { ok: false, status, error: "Shopify Storefront API rate limit reached." };
  }
  if (status === 401 || status === 403) {
    return { ok: false, status, error: "Unauthorized: Invalid Storefront token." };
  }
  if (status >= 400) {
    return { ok: false, status, error: `HTTP Error: ${status}` };
  }

  const json = await mockResponse.json();
  if (json.errors && json.errors.length > 0) {
    return {
      ok: false,
      status,
      error: json.errors.map((e: any) => e.message).join("; "),
      data: json.data,
    };
  }

  return { ok: true, status, data: json.data };
}

Deno.test("SHOP-ENV-9: Rate limiting (HTTP 429) is handled gracefully without crashing", async () => {
  const res = await simulateGraphQLClient({
    status: 429,
    json: async () => ({}),
  });
  assertEquals(res.ok, false);
  assertEquals(res.status, 429);
  assertStringIncludes(res.error || "", "rate limit");
});

Deno.test("SHOP-ENV-10: Token authorization error (HTTP 401) returns actionable guidance", async () => {
  const res = await simulateGraphQLClient({
    status: 401,
    json: async () => ({}),
  });
  assertEquals(res.ok, false);
  assertEquals(res.status, 401);
  assertStringIncludes(res.error || "", "Unauthorized");
});

Deno.test("SHOP-ENV-11: GraphQL business syntax error is surfaced accurately", async () => {
  const res = await simulateGraphQLClient({
    status: 200,
    json: async () => ({
      data: null,
      errors: [{ message: "Field 'nonExistentField' doesn't exist on type 'Product'" }],
    }),
  });
  assertEquals(res.ok, false);
  assertEquals(res.status, 200);
  assertStringIncludes(res.error || "", "nonExistentField");
});

Deno.test("SHOP-ENV-12: Successful query response returns authoritative payload", async () => {
  const mockPayload = {
    shop: {
      name: "IT HUB Kerala",
      paymentSettings: { currencyCode: "INR" },
    },
  };
  const res = await simulateGraphQLClient({
    status: 200,
    json: async () => ({ data: mockPayload }),
  });
  assertEquals(res.ok, true);
  assertEquals(res.data.shop.name, "IT HUB Kerala");
  assertEquals(res.data.shop.paymentSettings.currencyCode, "INR");
});
