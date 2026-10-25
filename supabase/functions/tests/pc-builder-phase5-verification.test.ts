// supabase/functions/tests/pc-builder-phase5-verification.test.ts
// IT HUB Find My PC — Phase 5 Server-Side Quotation Verification & Security Test Suite
// Rigorous verification covering TEST-SEC-1 (Anti-Tampering) and TEST-SEC-4 (Distributed Rate Limiting).

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

const { handleQuotationVerification } = await import(
  "../verify-and-submit-pc-quotation/index.ts"
)

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
  }

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
    }

    return {
      data: {
        nodes: vars.ids.map((id: string) => ({
          id,
          price: { amount: priceMap[id] || "0.00", currencyCode: "INR" },
          availableForSale: true,
        })),
      },
    }
  }

  const req = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "192.168.1.101" },
    body: JSON.stringify(tamperedPayload),
  })

  const res = await handleQuotationVerification(req, {
    shopifyFetch: mockShopifyFetch,
  })

  assertEquals(res.status, 200)
  const body = await res.json()

  assertEquals(body.success, true)
  // Authoritative price must be recalculated to ₹62,000
  assertEquals(body.authoritativePrice, 62000)
  // Client price was ₹100
  assertEquals(body.clientEstimatedPrice, 100)
  // Price divergence is ₹61,900
  assertEquals(body.priceDivergence, 61900)
  // Review MUST be flagged for store technician
  assertEquals(body.technicianReviewRequired, true)
})

Deno.test("TEST-SEC-4: Distributed Rate Limiting enforces 5 requests/minute threshold", async () => {
  // In-memory mock simulating PostgreSQL check_distributed_rate_limit
  const ipStore = new Map<string, { count: number; start: number }>()

  const mockSupabaseClient = {
    rpc: async (func: string, params: any) => {
      if (func === "check_distributed_rate_limit") {
        const { p_ip_hash, p_max_requests = 5, p_window_seconds = 60 } = params
        const now = Date.now()
        const entry = ipStore.get(p_ip_hash)

        if (!entry || now - entry.start > p_window_seconds * 1000) {
          ipStore.set(p_ip_hash, { count: 1, start: now })
          return { data: true, error: null }
        }

        if (entry.count >= p_max_requests) {
          return { data: false, error: null }
        }

        entry.count++
        return { data: true, error: null }
      }
      return { data: null, error: new Error("Unknown RPC") }
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "quote-123" }, error: null }),
        }),
      }),
    }),
  }

  const payload = {
    buildName: "Rate Limit Test Build",
    estimatedPrice: 62000,
    parts: [],
    customerInfo: { name: "Rate Limit Tester" },
  }

  // Fire requests 1 through 5 (Must succeed)
  for (let i = 1; i <= 5; i++) {
    const req = new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.99" },
      body: JSON.stringify(payload),
    })

    const res = await handleQuotationVerification(req, {
      supabaseClient: mockSupabaseClient as any,
    })
    assertEquals(res.status, 200)
  }

  // Request 6 from the same IP MUST be rejected with HTTP 429
  const req6 = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.99" },
    body: JSON.stringify(payload),
  })

  const res6 = await handleQuotationVerification(req6, {
    supabaseClient: mockSupabaseClient as any,
  })

  assertEquals(res6.status, 429)
  const body6 = await res6.json()
  assertEquals(body6.success, false)
  assertEquals(body6.error.includes("Too Many Requests"), true)
  assertEquals(body6.retryAfter, 60)
})

Deno.test("PHASE5-3: Migration SQL declares rate_limits table and check_distributed_rate_limit RPC", async () => {
  const sql = await Deno.readTextFile("supabase/migrations/20261026000002_quotation_server_verification.sql")
  assertEquals(sql.includes("create table if not exists public.rate_limits"), true)
  assertEquals(sql.includes("check_distributed_rate_limit"), true)
  assertEquals(sql.includes("authoritative_price numeric"), true)
  assertEquals(sql.includes("technician_review_required boolean"), true)
})
