// supabase/functions/tests/pc-builder-phase5-verification.test.ts
// IT HUB Find My PC — Phase 5 Server-Side Quotation Verification & Security Test Suite
// Rigorous verification covering TEST-SEC-1 (Anti-Tampering) and TEST-SEC-4 (Distributed Rate Limiting).

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  submitQuotationRequest,
  savePendingQuotation,
  getPendingQuotation,
  clearPendingQuotation,
} from "../../../src/lib/builder/persistence.ts";

const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 Security Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("TEST-SEC-1: Client-Side Price Tampering is authoritatively rejected and flagged", async () => {
  // Client attempts to submit ₹100 for a ₹62,000 build
  const tamperedPayload = {
    buildName: "Tampered Budget Exploit Build",
    estimatedPrice: 100, // Forged client price!
    parts: {
      CPU: { id: "p-cpu", variantId: "gid://shopify/ProductVariant/cpu-1", price: 9000 },
      Motherboard: { id: "p-mobo", variantId: "gid://shopify/ProductVariant/mobo-1", price: 7000 },
      RAM: { id: "p-ram", variantId: "gid://shopify/ProductVariant/ram-1", price: 3000 },
      GPU: { id: "p-gpu", variantId: "gid://shopify/ProductVariant/gpu-1", price: 28000 },
      Storage: { id: "p-ssd", variantId: "gid://shopify/ProductVariant/ssd-1", price: 5000 },
      PSU: { id: "p-psu", variantId: "gid://shopify/ProductVariant/psu-1", price: 4500 },
      Cabinet: { id: "p-case", variantId: "gid://shopify/ProductVariant/case-1", price: 4000 },
      Cooler: { id: "p-cool", variantId: "gid://shopify/ProductVariant/cool-1", price: 1500 },
    },
    customerInfo: { name: "Audit Tester", phone: "9876543210" },
  };

  // Mock Shopify GraphQL returning true variant prices totaling ₹62,000
  const mockShopifyFetch = async (_query: string, vars: any) => {
    const priceMap: Record<string, string> = {
      "gid://shopify/ProductVariant/cpu-1": "9000.00",
      "gid://shopify/ProductVariant/mobo-1": "7000.00",
      "gid://shopify/ProductVariant/ram-1": "3000.00",
      "gid://shopify/ProductVariant/gpu-1": "28000.00",
      "gid://shopify/ProductVariant/ssd-1": "5000.00",
      "gid://shopify/ProductVariant/psu-1": "4500.00",
      "gid://shopify/ProductVariant/case-1": "4000.00",
      "gid://shopify/ProductVariant/cool-1": "1500.00",
    };

    return {
      data: {
        nodes: vars.ids.map((id: string) => ({
          id,
          price: { amount: priceMap[id] || "0.00", currencyCode: "INR" },
          availableForSale: true,
        })),
      },
    };
  };

  const mockAuthClient = {
    auth: {
      getUser: async (token: string) => ({
        data: { user: { id: "00000000-0000-0000-0000-000000000001" } },
        error: null,
      }),
    },
    rpc: async (_func: string, _params: any) => ({ data: true, error: null }),
    from: (_table: string) => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "quote-tamper-uuid" }, error: null }),
        }),
      }),
    }),
  };

  const req = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-auth-token",
      "x-forwarded-for": "192.168.1.101",
    },
    body: JSON.stringify(tamperedPayload),
  });

  const res = await handleQuotationVerification(req, {
    supabaseClient: mockAuthClient as any,
    shopifyFetch: mockShopifyFetch,
  });

  assertEquals(res.status, 200);
  const body = await res.json();

  assertEquals(body.success, true);
  // Authoritative price must be recalculated to ₹62,000
  assertEquals(body.authoritativePrice, 62000);
  // Client price was ₹100
  assertEquals(body.clientEstimatedPrice, 100);
  // Price divergence is ₹61,900
  assertEquals(body.priceDivergence, 61900);
  // Review MUST be flagged for store technician
  assertEquals(body.technicianReviewRequired, true);
});

Deno.test("TEST-SEC-4: Distributed Rate Limiting enforces 5 requests/minute threshold", async () => {
  // In-memory mock simulating PostgreSQL check_distributed_rate_limit
  const ipStore = new Map<string, { count: number; start: number }>();

  const mockSupabaseClient = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "00000000-0000-0000-0000-000000000002" } },
        error: null,
      }),
    },
    rpc: async (func: string, params: any) => {
      if (func === "check_distributed_rate_limit") {
        const { p_ip_hash, p_max_requests = 5, p_window_seconds = 60 } = params;
        const now = Date.now();
        const entry = ipStore.get(p_ip_hash);

        if (!entry || now - entry.start > p_window_seconds * 1000) {
          ipStore.set(p_ip_hash, { count: 1, start: now });
          return { data: true, error: null };
        }

        if (entry.count >= p_max_requests) {
          return { data: false, error: null };
        }

        entry.count++;
        return { data: true, error: null };
      }
      return { data: null, error: new Error("Unknown RPC") };
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "quote-123" }, error: null }),
        }),
      }),
    }),
  };

  const payload = {
    buildName: "Rate Limit Test Build",
    estimatedPrice: 62000,
    parts: [],
    customerInfo: { name: "Rate Limit Tester" },
  };

  // Fire requests 1 through 5 (Must succeed)
  for (let i = 1; i <= 5; i++) {
    const req = new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-auth-token",
        "x-forwarded-for": "10.0.0.99",
      },
      body: JSON.stringify(payload),
    });

    const res = await handleQuotationVerification(req, {
      supabaseClient: mockSupabaseClient as any,
    });
    assertEquals(res.status, 200);
  }

  // Request 6 from the same IP MUST be rejected with HTTP 429
  const req6 = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-auth-token",
      "x-forwarded-for": "10.0.0.99",
    },
    body: JSON.stringify(payload),
  });

  const res6 = await handleQuotationVerification(req6, {
    supabaseClient: mockSupabaseClient as any,
  });

  assertEquals(res6.status, 429);
  const body6 = await res6.json();
  assertEquals(body6.success, false);
  assertEquals(body6.error.includes("Too Many Requests"), true);
  assertEquals(body6.retryAfter, 60);
});

Deno.test("PHASE5-3: Migration SQL declares rate_limits table and check_distributed_rate_limit RPC", async () => {
  const sql = await Deno.readTextFile(
    "supabase/migrations/20261026000002_quotation_server_verification.sql",
  );
  assertEquals(sql.includes("create table if not exists public.rate_limits"), true);
  assertEquals(sql.includes("check_distributed_rate_limit"), true);
  assertEquals(sql.includes("authoritative_price numeric"), true);
  assertEquals(sql.includes("technician_review_required boolean"), true);
});

Deno.test("TEST-SEC-5: Migration and Schema SQL restrict submit_pc_quotation_request to service_role and postgres, revoking anon and authenticated", async () => {
  // 1. Verify 20261026000002_quotation_server_verification.sql revokes public/anon access
  const migrationSql = await Deno.readTextFile(
    "supabase/migrations/20261026000002_quotation_server_verification.sql",
  );
  assertEquals(
    migrationSql.includes(
      "revoke execute on function public.submit_pc_quotation_request(text, text, jsonb, numeric, jsonb, text, text, text) from public, anon, authenticated;",
    ),
    true,
  );
  assertEquals(
    migrationSql.includes(
      "grant execute on function public.submit_pc_quotation_request(text, text, jsonb, numeric, jsonb, text, text, text) to service_role, postgres;",
    ),
    true,
  );
  assertEquals(
    migrationSql.includes(
      "raise exception 'Unauthorized: PC quotations must be submitted through the verified Edge Function endpoint.';",
    ),
    true,
  );

  // 2. Verify schema.sql revokes public/anon access
  const schemaSql = await Deno.readTextFile("supabase/schema.sql");
  assertEquals(
    schemaSql.includes(
      "revoke all on function submit_pc_quotation_request(text, text, jsonb, numeric, jsonb, text, text, text) from public, anon, authenticated;",
    ),
    true,
  );
  assertEquals(
    schemaSql.includes(
      "grant execute on function submit_pc_quotation_request(text, text, jsonb, numeric, jsonb, text, text, text) to service_role, postgres;",
    ),
    true,
  );
  assertEquals(
    schemaSql.includes(
      "raise exception 'Unauthorized: PC quotations must be submitted through the verified Edge Function endpoint.';",
    ),
    true,
  );
});

Deno.test("TEST-SEC-6: submitQuotationRequest never falls back to legacy RPC on HTTP 429 rate limiting (Terminal Rate Limit)", async () => {
  let rpcCallCount = 0;

  const mockSupabase = {
    functions: {
      invoke: async (name: string, _opts: any) => {
        assertEquals(name, "verify-and-submit-pc-quotation");
        // Simulate Edge Function HTTP 429 rate limit response
        return {
          data: {
            success: false,
            error: "Too Many Requests. Maximum 5 quotation requests per minute allowed.",
            retryAfter: 60,
          },
          error: null,
        };
      },
    },
    rpc: async (funcName: string, _params: any) => {
      rpcCallCount++;
      throw new Error(
        `SECURITY VULNERABILITY: Legacy RPC ${funcName} must NEVER be called as a fallback!`,
      );
    },
  };

  const sampleBuild: any = {
    id: "rate-limit-test-build",
    name: "Rate Limit Test Rig",
    components: {
      CPU: {
        slot: "CPU",
        productId: "p-cpu",
        title: "AMD Ryzen 5 5600",
        price: 9000,
        variantId: "gid://shopify/ProductVariant/cpu-1",
      },
      Motherboard: {
        slot: "Motherboard",
        productId: "p-mobo",
        title: "ASUS B550M",
        price: 8999,
        variantId: "gid://shopify/ProductVariant/mobo-1",
      },
    },
  };

  const result = await submitQuotationRequest(
    sampleBuild,
    { name: "Rate Limit Tester" },
    { supabaseClient: mockSupabase },
  );

  // Must report failure with isRateLimited flag
  assertEquals(result.success, false);
  assertEquals(result.isRateLimited, true);
  assertEquals(result.error?.includes("Too many quotation requests"), true);

  // Must have made ZERO calls to legacy RPC
  assertEquals(rpcCallCount, 0);
});

Deno.test("TEST-SEC-7: submitQuotationRequest never falls back to legacy RPC on network or Edge Function errors (Terminal Network Error)", async () => {
  let rpcCallCount = 0;

  const mockSupabase = {
    functions: {
      invoke: async (name: string, _opts: any) => {
        assertEquals(name, "verify-and-submit-pc-quotation");
        // Simulate network disconnect / timeout
        return {
          data: null,
          error: new Error("Failed to send a request to the Edge Function: connection refused"),
        };
      },
    },
    rpc: async (funcName: string, _params: any) => {
      rpcCallCount++;
      throw new Error(
        `SECURITY VULNERABILITY: Legacy RPC ${funcName} must NEVER be called on network error!`,
      );
    },
  };

  const sampleBuild: any = {
    id: "network-error-test-build",
    name: "Network Error Rig",
    components: {
      CPU: {
        slot: "CPU",
        productId: "p-cpu",
        title: "AMD Ryzen 5 5600",
        price: 9000,
        variantId: "gid://shopify/ProductVariant/cpu-1",
      },
    },
  };

  const result = await submitQuotationRequest(
    sampleBuild,
    { name: "Network Tester" },
    { supabaseClient: mockSupabase },
  );

  // Must report failure without bypassing verification
  assertEquals(result.success, false);
  assertEquals(Boolean(result.error), true);
  assertEquals(
    result.error?.includes("connection refused") || result.error?.includes("Failed to contact"),
    true,
  );

  // Must have made ZERO calls to legacy RPC
  assertEquals(rpcCallCount, 0);
});

Deno.test("TEST-SEC-8: submitQuotationRequest never falls back to legacy RPC on Edge Function verification rejection", async () => {
  let rpcCallCount = 0;

  const mockSupabase = {
    functions: {
      invoke: async (name: string, _opts: any) => {
        assertEquals(name, "verify-and-submit-pc-quotation");
        // Simulate Edge Function price mismatch / tampering rejection
        return {
          data: {
            success: false,
            error: "Component price verification rejected due to inventory change",
            technicianReviewRequired: true,
            priceDivergence: 2500,
          },
          error: null,
        };
      },
    },
    rpc: async (funcName: string, _params: any) => {
      rpcCallCount++;
      throw new Error(
        `SECURITY VULNERABILITY: Legacy RPC ${funcName} must NEVER be called on verification rejection!`,
      );
    },
  };

  const sampleBuild: any = {
    id: "rejection-test-build",
    name: "Rejection Test Rig",
    components: {
      CPU: {
        slot: "CPU",
        productId: "p-cpu",
        title: "AMD Ryzen 5 5600",
        price: 9000,
        variantId: "gid://shopify/ProductVariant/cpu-1",
      },
    },
  };

  const result = await submitQuotationRequest(
    sampleBuild,
    { name: "Rejection Tester" },
    { supabaseClient: mockSupabase },
  );

  // Must report failure and carry review flags
  assertEquals(result.success, false);
  assertEquals(result.error, "Component price verification rejected due to inventory change");
  assertEquals(result.technicianReviewRequired, true);
  assertEquals(result.priceDivergence, 2500);

  // Must have made ZERO calls to legacy RPC
  assertEquals(rpcCallCount, 0);
});

Deno.test("TEST-SEC-9: Unauthenticated guest requests to Edge Function are rejected with HTTP 401", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error("No token provided") }),
    },
    rpc: async (_func: string, _params: any) => ({ data: true, error: null }),
  };

  const guestPayload = {
    buildName: "Guest Exploit Rig",
    estimatedPrice: 9000,
    parts: {
      CPU: { id: "p-cpu", variantId: "gid://shopify/ProductVariant/cpu-1", price: 9000 },
    },
    customerInfo: { name: "Unauthenticated Guest", phone: "9876543210" },
  };

  // Request WITHOUT Authorization header -> MUST be rejected with HTTP 401
  const reqNoAuth = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "172.16.0.42" },
    body: JSON.stringify(guestPayload),
  });

  const resNoAuth = await handleQuotationVerification(reqNoAuth, {
    supabaseClient: mockSupabase as any,
  });

  assertEquals(resNoAuth.status, 401);
  const bodyNoAuth = await resNoAuth.json();
  assertEquals(bodyNoAuth.success, false);
  assertEquals(bodyNoAuth.requiresAuth, true);
  assertEquals(bodyNoAuth.error?.includes("Authentication required"), true);

  // Request with anonymous key token -> MUST be rejected with HTTP 401
  const reqAnonKey = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer sb_publishable_y-r_ZxASFqW4Jf3yDLK9_g_bbJNwFZS",
      "x-forwarded-for": "172.16.0.42",
    },
    body: JSON.stringify(guestPayload),
  });

  const resAnonKey = await handleQuotationVerification(reqAnonKey, {
    supabaseClient: mockSupabase as any,
  });

  assertEquals(resAnonKey.status, 401);
  const bodyAnonKey = await resAnonKey.json();
  assertEquals(bodyAnonKey.success, false);
  assertEquals(bodyAnonKey.requiresAuth, true);
});

Deno.test("TEST-SEC-10: Authoritative Edge Function binds authenticated user_id from verified JWT token", async () => {
  let recordedInsert: any = null;

  const mockSupabase = {
    auth: {
      getUser: async (token: string) => {
        if (token === "valid-user-jwt") {
          return {
            data: {
              user: { id: "00000000-0000-0000-0000-000000000001", email: "auth@ithub.example.com" },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: new Error("Invalid token") };
      },
    },
    rpc: async (_func: string, _params: any) => ({ data: true, error: null }),
    from: (table: string) => {
      return {
        select: (_cols?: string) => ({
          in: async () => ({ data: [], error: null }),
        }),
        insert: (record: any) => {
          recordedInsert = record;
          return {
            select: () => ({
              single: async () => ({ data: { id: "quote-auth-verified-uuid" }, error: null }),
            }),
          };
        },
      };
    },
  };

  const payload = {
    buildName: "Authenticated Customer Rig",
    estimatedPrice: 9000,
    parts: {
      CPU: { id: "p-cpu", variantId: "gid://shopify/ProductVariant/cpu-1", price: 9000 },
    },
    customerInfo: { name: "Logged In User" },
  };

  const mockShopify = async (_q: string, vars: any) => ({
    data: {
      nodes: vars.ids.map((id: string) => ({
        id,
        price: { amount: "9000.00", currencyCode: "INR" },
        availableForSale: true,
      })),
    },
  });

  // Authorization header supplied with valid token
  const req = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-user-jwt",
      "x-forwarded-for": "172.16.0.42",
    },
    body: JSON.stringify(payload),
  });

  const res = await handleQuotationVerification(req, {
    supabaseClient: mockSupabase as any,
    shopifyFetch: mockShopify,
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.isGuest, false);
  assertEquals(body.userId, "00000000-0000-0000-0000-000000000001");

  // Verify database record has user_id = authenticated user ID
  assertEquals(recordedInsert.user_id, "00000000-0000-0000-0000-000000000001");
});

Deno.test("TEST-SEC-11: Expired or invalid JWT tokens are rejected by Edge Function with HTTP 401", async () => {
  const mockSupabase = {
    auth: {
      getUser: async (token: string) => {
        // Simulate token expiration / invalid signature
        return {
          data: { user: null },
          error: new Error("JWT expired or signature verification failed"),
        };
      },
    },
    rpc: async (_func: string, _params: any) => ({ data: true, error: null }),
  };

  const payload = {
    buildName: "Expired Token Rig",
    estimatedPrice: 9000,
    parts: {
      CPU: { id: "p-cpu", variantId: "gid://shopify/ProductVariant/cpu-1", price: 9000 },
    },
  };

  const req = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer expired-jwt-token-12345",
      "x-forwarded-for": "172.16.0.42",
    },
    body: JSON.stringify(payload),
  });

  const res = await handleQuotationVerification(req, {
    supabaseClient: mockSupabase as any,
  });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.requiresAuth, true);
  assertEquals(body.error?.includes("Invalid or expired session"), true);
});

Deno.test("TEST-SEC-12: Client-side submitQuotationRequest rejects unauthenticated sessions with requiresAuth", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    functions: {
      invoke: async () => {
        throw new Error(
          "SECURITY FAILURE: Edge Function should not be invoked when unauthenticated!",
        );
      },
    },
  };

  const sampleBuild: any = {
    id: "unauth-build-test",
    name: "Unauthenticated Rig",
    components: {
      CPU: {
        slot: "CPU",
        productId: "p-cpu",
        title: "AMD Ryzen 5 5600",
        price: 9000,
        variantId: "gid://shopify/ProductVariant/cpu-1",
      },
    },
  };

  const res = await submitQuotationRequest(sampleBuild, undefined, {
    supabaseClient: mockSupabase,
  });

  assertEquals(res.success, false);
  assertEquals(res.requiresAuth, true);
  assertEquals(res.error?.includes("Authentication required"), true);
});

Deno.test("TEST-SEC-13: Pending build preservation preserves build and preferences and restores for review", () => {
  // Clear any existing stored quote
  clearPendingQuotation();
  assertEquals(getPendingQuotation(), null);

  const mockCanonical: any = {
    id: "preserved-build-123",
    name: "Kerala Creator Rig",
    mode: "wizard",
    currency: "INR",
    components: {
      CPU: { slot: "CPU", productId: "p-cpu", title: "AMD Ryzen 5 5600", price: 9000 },
      Motherboard: { slot: "Motherboard", productId: "p-mobo", title: "ASUS B550M", price: 8999 },
    },
  };

  // 1. Save pending quotation
  savePendingQuotation({
    mode: "wizard",
    build: mockCanonical,
    parts: mockCanonical.components,
    name: mockCanonical.name,
    intent: { budget: 60000, category: "Gaming" },
    ownedSlots: ["RAM"],
  });

  // 2. Retrieve pending quotation
  const restored = getPendingQuotation();
  assertNotEquals(restored, null);
  assertEquals(restored?.mode, "wizard");
  assertEquals(restored?.name, "Kerala Creator Rig");
  assertEquals(restored?.ownedSlots?.includes("RAM"), true);
  assertEquals(restored?.intent?.budget, 60000);
  assertEquals(Boolean(restored?.parts?.CPU), true);

  // 3. Clear pending quotation upon confirmation
  clearPendingQuotation();
  assertEquals(getPendingQuotation(), null);
});

Deno.test("TEST-SEC-14: Migration 20261026000003_quotation_mandatory_authentication.sql strictly forbids anonymous quotations", async () => {
  const sql = await Deno.readTextFile(
    "supabase/migrations/20261026000003_quotation_mandatory_authentication.sql",
  );

  // 1. protect_pc_build trigger must enforce user_id is not null for quotations
  assertEquals(sql.includes("new.user_id is null"), true);
  assertEquals(
    sql.includes("PC quotation submission requires an authenticated customer account"),
    true,
  );

  // 2. submit_pc_quotation_request must require v_user_id is not null
  assertEquals(sql.includes("v_user_id is null"), true);
  assertEquals(sql.includes("v_user_id := auth.uid();"), true);
});
