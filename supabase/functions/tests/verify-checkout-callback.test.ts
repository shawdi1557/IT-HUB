// supabase/functions/tests/verify-checkout-callback.test.ts
// Comprehensive Automated Test Suite for verify-checkout-callback Edge Function
// Verifying Issue A (CORS), Issue B (Order Mapping), Issue C (Timeout), and Issue D (Service-Role Fallback)

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  handleCheckoutCallback,
  constantTimeCompare,
  hexToBytes,
  getCorsHeaders,
  getAllowedOrigins,
  parseAndNormalizeOrigin,
  CheckoutCallbackDeps,
} from "../verify-checkout-callback/index.ts"

const TEST_SECRET = "rzp_test_secret_key_abcdef1234567890"
const TEST_KEY_ID = "rzp_test_keyid_123456789"
const TEST_USER_ID = "11111111-2222-3333-4444-555555555555"
const TEST_OTHER_USER_ID = "99999999-8888-7777-6666-555555555555"
const TEST_ORDER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const TEST_RZP_ORDER_ID = "order_O123456789ABCD"
const TEST_RZP_PAY_ID = "pay_P987654321WXYZ"

async function computeHmac(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  )
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function createMockUserClient(opts?: {
  user?: { id: string } | null
  authError?: any
  order?: any
  orderLookupError?: any
}) {
  return {
    auth: {
      getUser: async () => {
        if (opts?.authError)
          return { data: { user: null }, error: opts.authError }
        return {
          data: {
            user: opts?.user !== undefined ? opts.user : { id: TEST_USER_ID },
          },
          error: null,
        }
      },
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: string) => ({
          maybeSingle: async () => {
            if (opts?.orderLookupError)
              return { data: null, error: opts.orderLookupError }
            return {
              data:
                opts?.order !== undefined
                  ? opts.order
                  : {
                      id: TEST_ORDER_ID,
                      user_id: TEST_USER_ID,
                      order_number: "ORD-20261009-0001",
                      total: 61000.0,
                      razorpay_order_id: TEST_RZP_ORDER_ID,
                      razorpay_payment_id: null,
                      status: "Pending",
                      payment_status: "Pending",
                      expires_at: new Date(Date.now() + 900000).toISOString(),
                      stock_reserved: true,
                    },
              error: null,
            }
          },
        }),
      }),
    }),
  }
}

function createMockAdminClient(opts?: {
  existingOrder?: any
  paidOrder?: any
  fallbackError?: any
  rpcResult?: any
  rpcError?: any
}) {
  const rpcCalls: Array<{ fnName: string; args: any }> = []

  return {
    rpcCalls,
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: string) => ({
          maybeSingle: async () => {
            if (opts?.fallbackError)
              return { data: null, error: opts.fallbackError }
            return {
              data: opts?.existingOrder ?? null,
              error: null,
            }
          },
          single: async () => ({
            data: opts?.paidOrder ?? opts?.existingOrder ?? null,
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (fnName: string, args: any) => {
      rpcCalls.push({ fnName, args })
      if (opts?.rpcError) return { data: null, error: opts.rpcError }
      return {
        data: opts?.rpcResult ?? {
          order_id: args.p_order_id,
          order_number: "ORD-20261009-0001",
          status: "Processing",
          payment_status: "Paid",
          idempotent: false,
          coupon_conflict: false,
        },
        error: null,
      }
    },
  }
}

function createMockFetch(opts?: {
  payment?: any
  networkError?: boolean
  timeoutError?: boolean
  stalledBody?: boolean
  status?: number
  malformedJson?: boolean
}) {
  return async (
    _url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const signal = init?.signal
    if (opts?.timeoutError) {
      const err = new Error("The signal has been aborted")
      err.name = "AbortError"
      throw err
    }
    if (opts?.networkError) {
      throw new Error("Network connection reset by peer")
    }
    if (opts?.stalledBody) {
      // Simulate headers arriving promptly (200 OK), but body streaming stalls until aborted
      const mockResponse = {
        ok: true,
        status: opts.status ?? 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            if (signal?.aborted) {
              const err = new Error("The operation was aborted")
              err.name = "AbortError"
              reject(err)
              return
            }
            signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted")
              err.name = "AbortError"
              reject(err)
            })
          }),
        json: () =>
          new Promise<any>((_resolve, reject) => {
            if (signal?.aborted) {
              const err = new Error("The operation was aborted")
              err.name = "AbortError"
              reject(err)
              return
            }
            signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted")
              err.name = "AbortError"
              reject(err)
            })
          }),
      } as unknown as Response

      return mockResponse
    }
    if (opts?.malformedJson) {
      return new Response("<html>502 Bad Gateway</html>", {
        status: opts.status ?? 502,
        headers: { "Content-Type": "text/html" },
      })
    }
    const status = opts?.status ?? 200
    const body = opts?.payment
      ? JSON.stringify(opts.payment)
      : JSON.stringify({
          id: TEST_RZP_PAY_ID,
          order_id: TEST_RZP_ORDER_ID,
          status: "captured",
          currency: "INR",
          amount: 6100000,
          notes: { order_id: TEST_ORDER_ID },
        })
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }
}

function getBaseDeps(overrides?: Partial<CheckoutCallbackDeps>) {
  const adminClient = overrides?.supabaseAdminClient ?? createMockAdminClient()
  const userClient = overrides?.supabaseUserClient ?? createMockUserClient()
  const fetchFn = overrides?.fetchFn ?? createMockFetch()

  const deps: CheckoutCallbackDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_SECRET,
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
    appEnv: "development",
    storefrontOrigin: "http://localhost:5173",
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    fetchFn: fetchFn,
    ...overrides,
  }

  return { deps, adminClient, userClient, fetchFn }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 1: ISSUE A — RESTRICT PRODUCTION CORS ORIGINS
// ────────────────────────────────────────────────────────────────────────────

Deno.test("A1. Configured production storefront origin is accepted", async () => {
  const { deps, adminClient } = getBaseDeps({
    appEnv: "production",
    storefrontOrigin: "https://shop.example.com",
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("https://api.example.com/verify-checkout-callback", {
    method: "POST",
    headers: {
      Origin: "https://shop.example.com",
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 200)
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://shop.example.com",
  )
  assertEquals(res.headers.get("Vary"), "Origin")
  assertEquals(adminClient.rpcCalls.length, 1)
})

Deno.test("A2. Unapproved external origin is rejected with 403 Forbidden", async () => {
  const { deps, adminClient } = getBaseDeps({
    appEnv: "production",
    storefrontOrigin: "https://shop.example.com",
  })
  const req = new Request("https://api.example.com/verify-checkout-callback", {
    method: "POST",
    headers: {
      Origin: "https://malicious-phishing.example.org",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: TEST_ORDER_ID }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 403)
  const data = await res.json()
  assertEquals(data.error, "CORS origin not allowed")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("A3. Localhost origin is strictly rejected in production", async () => {
  const { deps, adminClient } = getBaseDeps({
    appEnv: "production",
    storefrontOrigin: "https://shop.example.com",
  })
  const req = new Request("https://api.example.com/verify-checkout-callback", {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: TEST_ORDER_ID }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 403)
  const data = await res.json()
  assertEquals(data.error, "CORS origin not allowed")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("A4. Localhost origin is accepted when APP_ENV=development", async () => {
  const { deps, adminClient } = getBaseDeps({
    appEnv: "development",
    storefrontOrigin: "",
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 200)
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "http://localhost:5173",
  )
  assertEquals(adminClient.rpcCalls.length, 1)
})

Deno.test("A5. Missing production origin configuration fails closed for browser requests", async () => {
  const { deps, adminClient } = getBaseDeps({
    appEnv: "production",
    storefrontOrigin: "", // Unconfigured
  })
  const req = new Request("https://api.example.com/verify-checkout-callback", {
    method: "POST",
    headers: {
      Origin: "https://anydomain.example.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: TEST_ORDER_ID }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 403)
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("A6. Multiple configured production origins work correctly", async () => {
  const { deps, adminClient } = getBaseDeps({
    appEnv: "production",
    storefrontOrigin: "https://shop.example.com, https://admin.example.com",
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )

  const reqAdmin = new Request(
    "https://api.example.com/verify-checkout-callback",
    {
      method: "POST",
      headers: {
        Origin: "https://admin.example.com",
        "Content-Type": "application/json",
        Authorization: "Bearer valid_jwt_token",
      },
      body: JSON.stringify({
        order_id: TEST_ORDER_ID,
        razorpay_order_id: TEST_RZP_ORDER_ID,
        razorpay_payment_id: TEST_RZP_PAY_ID,
        razorpay_signature: validSignature,
      }),
    },
  )

  const res = await handleCheckoutCallback(reqAdmin, deps)
  assertEquals(res.status, 200)
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://admin.example.com",
  )
  assertEquals(adminClient.rpcCalls.length, 1)
})

Deno.test("A7. Wildcard and malformed origins in STOREFRONT_ORIGIN are safely rejected", () => {
  const origins = getAllowedOrigins(
    "production",
    "*, javascript:alert(1), not-a-valid-url, https://valid.example.com",
  )
  assertEquals(origins.has("*"), false)
  assertEquals(origins.has("javascript:alert(1)"), false)
  assertEquals(origins.has("not-a-valid-url"), false)
  assertEquals(origins.has("https://valid.example.com"), true)
})

Deno.test("A8. Preflight OPTIONS request returns 204 for allowed origin and 403 for disallowed", async () => {
  const { deps } = getBaseDeps({
    appEnv: "production",
    storefrontOrigin: "https://shop.example.com",
  })

  // Allowed origin
  const reqAllowed = new Request(
    "https://api.example.com/verify-checkout-callback",
    {
      method: "OPTIONS",
      headers: { Origin: "https://shop.example.com" },
    },
  )
  const resAllowed = await handleCheckoutCallback(reqAllowed, deps)
  assertEquals(resAllowed.status, 204)
  assertEquals(
    resAllowed.headers.get("Access-Control-Allow-Origin"),
    "https://shop.example.com",
  )

  // Disallowed origin
  const reqDenied = new Request(
    "https://api.example.com/verify-checkout-callback",
    {
      method: "OPTIONS",
      headers: { Origin: "https://attacker.example.com" },
    },
  )
  const resDenied = await handleCheckoutCallback(reqDenied, deps)
  assertEquals(resDenied.status, 403)
})

Deno.test("A9. Requests without Origin header proceed to auth verification and reject missing JWT", async () => {
  const { deps, adminClient } = getBaseDeps({ appEnv: "production" })
  // Non-browser request (e.g. curl / server-to-server) without Origin header
  const req = new Request("https://api.example.com/verify-checkout-callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" }, // No Authorization header
    body: JSON.stringify({ order_id: TEST_ORDER_ID }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 401)
  const data = await res.json()
  assertEquals(data.error, "Authentication required")
  assertEquals(adminClient.rpcCalls.length, 0)
})

// ────────────────────────────────────────────────────────────────────────────
// SECTION 2: ISSUE B — ENFORCE INTERNAL-TO-RAZORPAY ORDER MAPPING
// ────────────────────────────────────────────────────────────────────────────

Deno.test("B1. Matching stored and submitted Razorpay order IDs succeeds and calls RPC", async () => {
  const { deps, adminClient } = getBaseDeps()
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 200)
  const data = await res.json()
  assertEquals(data.ok, true)
  assertEquals(adminClient.rpcCalls.length, 1)
  assertEquals(adminClient.rpcCalls[0].fnName, "record_order_payment")
  assertEquals(
    adminClient.rpcCalls[0].args.p_razorpay_order_id,
    TEST_RZP_ORDER_ID,
  )
})

Deno.test("B2. Missing internal Razorpay order ID is rejected with 400 (RPC suppressed)", async () => {
  const userClient = createMockUserClient({
    order: {
      id: TEST_ORDER_ID,
      user_id: TEST_USER_ID,
      order_number: "ORD-20261009-0001",
      total: 61000.0,
      razorpay_order_id: null, // Internal mapping is missing / uninitialized
      razorpay_payment_id: null,
      status: "Pending",
      payment_status: "Pending",
      expires_at: new Date(Date.now() + 900000).toISOString(),
      stock_reserved: true,
    },
  })

  const { deps, adminClient } = getBaseDeps({ supabaseUserClient: userClient })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  const data = await res.json()
  assertStringIncludes(
    data.error,
    "Internal order has no associated Razorpay order ID",
  )
  // CRITICAL: Ensure privileged RPC is never called
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("B3. Mismatched internal and submitted Razorpay order IDs rejected with 400 (RPC suppressed)", async () => {
  const userClient = createMockUserClient({
    order: {
      id: TEST_ORDER_ID,
      user_id: TEST_USER_ID,
      order_number: "ORD-20261009-0001",
      total: 61000.0,
      razorpay_order_id: "order_PREVIOUSLY_RECORDED_111", // Different recorded order ID
      razorpay_payment_id: null,
      status: "Pending",
      payment_status: "Pending",
      expires_at: new Date(Date.now() + 900000).toISOString(),
      stock_reserved: true,
    },
  })

  const { deps, adminClient } = getBaseDeps({ supabaseUserClient: userClient })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  const data = await res.json()
  assertEquals(
    data.error,
    "Submitted Razorpay order ID does not match order record",
  )
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("B4. Mismatched Razorpay API paymentData.order_id rejected with 400 (RPC suppressed)", async () => {
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({
      payment: {
        id: TEST_RZP_PAY_ID,
        order_id: "order_DIFFERENT_GATEWAY_ORDER_999", // Gateway order ID mismatch
        status: "captured",
        currency: "INR",
        amount: 6100000,
      },
    }),
  })

  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  const data = await res.json()
  assertEquals(data.error, "Payment does not correspond to the requested order")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("B5. Gateway payment metadata notes.order_id belonging to different order is rejected", async () => {
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({
      payment: {
        id: TEST_RZP_PAY_ID,
        order_id: TEST_RZP_ORDER_ID,
        status: "captured",
        currency: "INR",
        amount: 6100000,
        notes: { order_id: "99999999-0000-0000-0000-000000000000" }, // Mismatched internal order in notes
      },
    }),
  })

  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  const data = await res.json()
  assertEquals(data.error, "Payment metadata belongs to a different order")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("B6. Duplicate callback for already-paid order returns idempotent 200 without calling RPC", async () => {
  const userClient = createMockUserClient({
    order: {
      id: TEST_ORDER_ID,
      user_id: TEST_USER_ID,
      order_number: "ORD-20261009-0001",
      total: 61000.0,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID, // Already recorded with same payment ID
      status: "Processing",
      payment_status: "Paid",
    },
  })

  const { deps, adminClient } = getBaseDeps({ supabaseUserClient: userClient })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 200)
  const data = await res.json()
  assertEquals(data.ok, true)
  assertEquals(data.idempotent, true)
  // Idempotency short-circuit ensures RPC is NOT re-invoked
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("B7. Different payment ID for already-paid order returns 409 Conflict (RPC suppressed)", async () => {
  const newPaymentId = "pay_NEW_PAYMENT_DIFFERENT"
  const userClient = createMockUserClient({
    order: {
      id: TEST_ORDER_ID,
      user_id: TEST_USER_ID,
      order_number: "ORD-20261009-0001",
      total: 61000.0,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: "pay_ORIGINAL_PAYMENT_111", // Previously paid with different ID
      status: "Processing",
      payment_status: "Paid",
    },
  })

  const { deps, adminClient } = getBaseDeps({ supabaseUserClient: userClient })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${newPaymentId}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: newPaymentId,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 409)
  const data = await res.json()
  assertStringIncludes(
    data.error,
    "Order has already been marked as Paid with a different payment reference",
  )
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("B8. End-to-end flow check: order with stock reservation expired handled safely via RPC", async () => {
  // Simulates an order whose checkout reservation window has expired prior to callback
  const userClient = createMockUserClient({
    order: {
      id: TEST_ORDER_ID,
      user_id: TEST_USER_ID,
      order_number: "ORD-20261009-0001",
      total: 61000.0,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: null,
      status: "Pending",
      payment_status: "Pending",
      expires_at: new Date(Date.now() - 60000).toISOString(), // Expired 1 minute ago
      stock_reserved: false,
    },
  })

  // Admin client RPC simulates record_order_payment's reconciliation workflow for post-expiration payment
  const { deps, adminClient } = getBaseDeps({
    supabaseUserClient: userClient,
    supabaseAdminClient: createMockAdminClient({
      rpcResult: {
        ok: true,
        idempotent: false,
        order_id: TEST_ORDER_ID,
        order_number: "ORD-20261009-0001",
        status: "Processing",
        payment_status: "Paid",
        stock_re_reserved: true,
      },
    }),
  })

  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 200)
  const data = await res.json()
  assertEquals(data.ok, true)
  assertEquals(data.payment_status, "Paid")
  assertEquals(adminClient.rpcCalls.length, 1)
})

// ────────────────────────────────────────────────────────────────────────────
// SECTION 3: ISSUE C — TIMEOUT & GATEWAY RESILIENCE
// ────────────────────────────────────────────────────────────────────────────

Deno.test("C1. Normal Razorpay API response completes verification successfully", async () => {
  const { deps, adminClient } = getBaseDeps()
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 200)
  assertEquals(adminClient.rpcCalls.length, 1)
})

Deno.test("C2. Gateway request timeout triggers safe 502 response and suppresses RPC", async () => {
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({ timeoutError: true }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 502)
  const data = await res.json()
  assertStringIncludes(data.error, "Payment gateway request timed out")
  // Ensure unverified timeout NEVER invokes payment finalization RPC
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("C2b. Prompt headers with stalled body stream: timeout triggers, safe 502 returned, RPC suppressed", async () => {
  const { deps, adminClient } = getBaseDeps({
    gatewayTimeoutMs: 50, // Short deterministic timeout for test execution
    fetchFn: createMockFetch({ stalledBody: true }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 502)
  const data = await res.json()
  assertStringIncludes(data.error, "Payment gateway request timed out")
  // CRITICAL: privileged RPC record_order_payment must NEVER be called
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("C3. Network connection failure triggers safe 502 and suppresses RPC", async () => {
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({ networkError: true }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 502)
  const data = await res.json()
  assertStringIncludes(
    data.error,
    "Payment gateway verification service is currently unavailable",
  )
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("C4. Gateway HTTP 500 error triggers safe 502 response and suppresses RPC", async () => {
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({
      status: 500,
      payment: { error: { description: "Gateway failure" } },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 502)
  const data = await res.json()
  assertStringIncludes(data.error, "Unable to verify payment with the gateway")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("C5. Gateway malformed HTML/JSON response triggers safe 502 and suppresses RPC", async () => {
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({ malformedJson: true }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 502)
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("C6. Customer retry after gateway timeout succeeds on subsequent attempt", async () => {
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const reqBody = JSON.stringify({
    order_id: TEST_ORDER_ID,
    razorpay_order_id: TEST_RZP_ORDER_ID,
    razorpay_payment_id: TEST_RZP_PAY_ID,
    razorpay_signature: validSignature,
  })

  // Attempt 1: Gateway times out
  const { deps: deps1, adminClient: admin1 } = getBaseDeps({
    fetchFn: createMockFetch({ timeoutError: true }),
  })
  const req1 = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: reqBody,
  })
  const res1 = await handleCheckoutCallback(req1, deps1)
  assertEquals(res1.status, 502)
  assertEquals(admin1.rpcCalls.length, 0)

  // Attempt 2: Gateway succeeds on retry
  const { deps: deps2, adminClient: admin2 } = getBaseDeps({
    fetchFn: createMockFetch({ status: 200 }),
  })
  const req2 = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: reqBody,
  })
  const res2 = await handleCheckoutCallback(req2, deps2)
  assertEquals(res2.status, 200)
  const data2 = await res2.json()
  assertEquals(data2.ok, true)
  assertEquals(admin2.rpcCalls.length, 1)
})

Deno.test("C7. Timeout response never exposes internal stack traces or gateway credentials", async () => {
  const { deps } = getBaseDeps({
    fetchFn: createMockFetch({ timeoutError: true }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  const rawText = await res.text()
  assertEquals(rawText.includes(TEST_KEY_ID), false)
  assertEquals(rawText.includes(TEST_SECRET), false)
  assertEquals(rawText.includes("at "), false)
  assertEquals(rawText.includes("AbortError"), false)
})

// ────────────────────────────────────────────────────────────────────────────
// SECTION 4: ISSUE D — HARDEN SERVICE-ROLE OWNERSHIP FALLBACK
// ────────────────────────────────────────────────────────────────────────────

Deno.test("D1. Authenticated customer owns order: passes ownership check and proceeds", async () => {
  const { deps, adminClient } = getBaseDeps()
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 200)
  assertEquals(adminClient.rpcCalls.length, 1)
})

Deno.test("D2. Order does not exist in system: returns safe 404 (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps({
    supabaseUserClient: createMockUserClient({ order: null }),
    supabaseAdminClient: createMockAdminClient({ existingOrder: null }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 404)
  const data = await res.json()
  assertEquals(data.error, "Order not found")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("D3. Order belongs to another customer: returns 403 Forbidden without leaking details", async () => {
  const { deps, adminClient } = getBaseDeps({
    supabaseUserClient: createMockUserClient({
      user: { id: TEST_USER_ID },
      order: null, // RLS filters it out
    }),
    supabaseAdminClient: createMockAdminClient({
      existingOrder: {
        id: TEST_ORDER_ID,
        user_id: TEST_OTHER_USER_ID, // Owned by another user
      },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 403)
  const data = await res.json()
  assertEquals(data.error, "Forbidden: You do not own this order")
  // Ensure NO customer IDs or sensitive metadata leaked in body
  const rawBody = JSON.stringify(data)
  assertEquals(rawBody.includes(TEST_OTHER_USER_ID), false)
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("D4. Customer-scoped lookup database error returns 500 and halts immediately", async () => {
  const { deps, adminClient } = getBaseDeps({
    supabaseUserClient: createMockUserClient({
      orderLookupError: { message: "Connection pool exhausted on client node" },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 500)
  const data = await res.json()
  assertEquals(data.error, "Failed to query order records")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("D5. Service-role fallback lookup database error returns 500 without false 404", async () => {
  const { deps, adminClient } = getBaseDeps({
    supabaseUserClient: createMockUserClient({ order: null }),
    supabaseAdminClient: createMockAdminClient({
      fallbackError: { message: "Fatal error reading table orders" },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 500)
  const data = await res.json()
  assertEquals(data.error, "Failed to query order records")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("D6. Client responses do not reveal other customer data or database errors", async () => {
  const { deps } = getBaseDeps({
    supabaseUserClient: createMockUserClient({
      orderLookupError: {
        message: "Internal Postgres relation error pg_catalog",
      },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  const rawBody = await res.text()
  assertEquals(rawBody.includes("pg_catalog"), false)
  assertEquals(rawBody.includes("Postgres"), false)
  assertEquals(rawBody.includes("relation"), false)
})

// ────────────────────────────────────────────────────────────────────────────
// SECTION 5: CROSS-CUTTING CORE PAYMENT SECURITY & REGRESSION
// ────────────────────────────────────────────────────────────────────────────

Deno.test("E1. Missing Authorization header returns 401 (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps()
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: TEST_ORDER_ID }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 401)
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("E2. Invalid or expired customer session returns 401 (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps({
    supabaseUserClient: createMockUserClient({
      authError: { message: "JWT expired" },
      user: null,
    }),
  })
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer expired_jwt_token",
    },
    body: JSON.stringify({ order_id: TEST_ORDER_ID }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 401)
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("E3. Missing required callback fields returns 400 (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps()
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("E4. Malformed signature format (not 64 hex) returns 400 (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps()
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: "bad_signature_hex",
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("E5. Payment status 'authorized' is strictly rejected with 400 (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({
      payment: {
        id: TEST_RZP_PAY_ID,
        order_id: TEST_RZP_ORDER_ID,
        status: "authorized", // NOT captured
        currency: "INR",
        amount: 6100000,
      },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  const data = await res.json()
  assertStringIncludes(
    data.error,
    "Payment is authorized but has not yet been captured",
  )
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("E6. Payment currency not INR is rejected with 400 (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({
      payment: {
        id: TEST_RZP_PAY_ID,
        order_id: TEST_RZP_ORDER_ID,
        status: "captured",
        currency: "USD",
        amount: 6100000,
      },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  const data = await res.json()
  assertEquals(
    data.error,
    "Unsupported currency: only INR payments are accepted",
  )
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("E7. Payment amount paise mismatch is rejected with 400 (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps({
    fetchFn: createMockFetch({
      payment: {
        id: TEST_RZP_PAY_ID,
        order_id: TEST_RZP_ORDER_ID,
        status: "captured",
        currency: "INR",
        amount: 5000000, // 50,000.00 vs 61,000.00
      },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 400)
  const data = await res.json()
  assertEquals(data.error, "Payment amount does not match the order total")
  assertEquals(adminClient.rpcCalls.length, 0)
})

Deno.test("E8. Database record_order_payment RPC failure returns safe 500 without schema leak", async () => {
  const { deps, adminClient } = getBaseDeps({
    supabaseAdminClient: createMockAdminClient({
      rpcError: {
        message: "deadlock detected at process 4102 on relation orders",
      },
    }),
  })
  const validSignature = await computeHmac(
    TEST_SECRET,
    `${TEST_RZP_ORDER_ID}|${TEST_RZP_PAY_ID}`,
  )
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid_jwt_token",
    },
    body: JSON.stringify({
      order_id: TEST_ORDER_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 500)
  const data = await res.json()
  assertStringIncludes(
    data.error,
    "Payment was captured by gateway, but order finalization could not be completed",
  )
  assertEquals(data.error.includes("deadlock"), false)
  assertEquals(data.error.includes("relation orders"), false)
  assertEquals(adminClient.rpcCalls.length, 1)
})

Deno.test("E9. Unsupported HTTP method (GET) returns 405 Method Not Allowed (RPC suppressed)", async () => {
  const { deps, adminClient } = getBaseDeps()
  const req = new Request("http://localhost:8000/verify-checkout-callback", {
    method: "GET",
  })

  const res = await handleCheckoutCallback(req, deps)
  assertEquals(res.status, 405)
  assertEquals(res.headers.get("Allow"), "POST, OPTIONS")
  assertEquals(adminClient.rpcCalls.length, 0)
})

// ────────────────────────────────────────────────────────────────────────────
// SECTION 6: CRYPTOGRAPHIC & UTILITY UNIT TESTS
// ────────────────────────────────────────────────────────────────────────────

Deno.test("F1. Constant-time byte array comparison handles identical and mismatched inputs", () => {
  const a = new Uint8Array([10, 20, 30, 40])
  const b = new Uint8Array([10, 20, 30, 40])
  const c = new Uint8Array([10, 20, 30, 41])
  const d = new Uint8Array([10, 20, 30])

  assertEquals(constantTimeCompare(a, b), true)
  assertEquals(constantTimeCompare(a, c), false)
  assertEquals(constantTimeCompare(a, d), false)
})

Deno.test("F2. hexToBytes converts valid hex strings accurately", () => {
  const hex = "deadbeef"
  const bytes = hexToBytes(hex)
  assertEquals(bytes.length, 4)
  assertEquals(bytes[0], 0xde)
  assertEquals(bytes[1], 0xad)
  assertEquals(bytes[2], 0xbe)
  assertEquals(bytes[3], 0xef)
})

Deno.test("F3. parseAndNormalizeOrigin correctly validates, trims, and normalizes URLs", () => {
  assertEquals(
    parseAndNormalizeOrigin("https://example.com/"),
    "https://example.com",
  )
  assertEquals(
    parseAndNormalizeOrigin("HTTPS://EXAMPLE.COM:8443/PATH?Q=1"),
    "https://example.com:8443",
  )
  assertEquals(
    parseAndNormalizeOrigin("http://localhost:5173"),
    "http://localhost:5173",
  )
  assertEquals(parseAndNormalizeOrigin("*"), null)
  assertEquals(parseAndNormalizeOrigin("https://*.example.com"), null)
  assertEquals(parseAndNormalizeOrigin("not-a-valid-url"), null)
  assertEquals(parseAndNormalizeOrigin("ftp://example.com"), null)
})
