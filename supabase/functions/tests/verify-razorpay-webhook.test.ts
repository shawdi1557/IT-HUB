// supabase/functions/tests/verify-razorpay-webhook.test.ts
// Comprehensive Automated Test Suite for verify-razorpay-webhook Edge Function
// Verifying Webhook Security, Signature Verification, Event Filtering, and Database RPC Integration

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  handleRazorpayWebhook,
  constantTimeCompare,
  hexToBytes,
  WebhookDeps,
} from "../verify-razorpay-webhook/index.ts"

const TEST_SECRET = "secret_webhook_key_1234567890abcdef"
const TEST_RZP_ORDER_ID = "order_O123456789ABCD"
const TEST_RZP_PAY_ID = "pay_P987654321WXYZ"
const TEST_INTERNAL_ORDER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

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

interface MockRpcCall {
  fn: string
  args: any
}

interface MockAdminOpts {
  rpcResult?: any
  rpcError?: any
}

function createMockAdminClient(opts?: MockAdminOpts) {
  const calls: MockRpcCall[] = []
  return {
    calls,
    client: {
      rpc: async (fn: string, args: any) => {
        calls.push({ fn, args })
        if (opts?.rpcError) {
          return { data: null, error: opts.rpcError }
        }
        return {
          data:
            opts?.rpcResult !== undefined
              ? opts.rpcResult
              : {
                  success: true,
                  order_id: TEST_INTERNAL_ORDER_ID,
                  status: "paid",
                },
          error: null,
        }
      },
    },
  }
}

function createWebhookPayload(opts?: {
  event?: string
  paymentId?: string
  orderId?: string
  amountPaise?: number
  currency?: string
  internalOrderId?: string | any
  omitPaymentEntity?: boolean
}) {
  if (opts?.omitPaymentEntity) {
    return {
      entity: "event",
      account_id: "acc_test123",
      event: opts?.event ?? "payment.captured",
      contains: ["payment"],
      payload: {},
    }
  }

  const paymentEntity: any = {
    id: opts?.paymentId ?? TEST_RZP_PAY_ID,
    entity: "payment",
    amount: opts?.amountPaise !== undefined ? opts.amountPaise : 250000,
    currency: opts?.currency ?? "INR",
    status: "captured",
    order_id: opts?.orderId !== undefined ? opts.orderId : TEST_RZP_ORDER_ID,
    notes:
      opts?.internalOrderId !== undefined
        ? { order_id: opts.internalOrderId }
        : {},
  }

  return {
    entity: "event",
    account_id: "acc_test123",
    event: opts?.event ?? "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: paymentEntity,
      },
    },
  }
}

// ==============================================================================
// Section 1: HTTP Method & Preflight Handling
// ==============================================================================

Deno.test("WH-1. Preflight OPTIONS request returns 204 No Content", async () => {
  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "OPTIONS",
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
  })
  assertEquals(res.status, 204)
})

Deno.test("WH-2. Non-POST HTTP methods (GET, PUT, DELETE) return 405 Method Not Allowed", async () => {
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const req = new Request("http://localhost/verify-razorpay-webhook", {
      method,
    })
    const res = await handleRazorpayWebhook(req, {
      razorpayWebhookSecret: TEST_SECRET,
    })
    assertEquals(res.status, 405)
    const body = await res.json()
    assertStringIncludes(body.error, "Method not allowed")
  }
})

// ==============================================================================
// Section 2: Environment Configuration & Header Validation
// ==============================================================================

Deno.test("WH-3. Missing RAZORPAY_WEBHOOK_SECRET returns 500 Configuration Error", async () => {
  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": "a".repeat(64) },
    body: JSON.stringify({ event: "payment.captured" }),
  })
  const res = await handleRazorpayWebhook(req, { razorpayWebhookSecret: "" })
  assertEquals(res.status, 500)
  const body = await res.json()
  assertStringIncludes(body.error, "Webhook configuration error")
})

Deno.test("WH-4. Missing x-razorpay-signature header returns 400 Bad Request", async () => {
  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "payment.captured" }),
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
  })
  assertEquals(res.status, 400)
  const body = await res.json()
  assertStringIncludes(body.error, "Missing x-razorpay-signature header")
})

Deno.test("WH-5. Malformed signature length or characters returns 400 Bad Request", async () => {
  const malformedSignatures = [
    "abc123", // too short
    "z".repeat(64), // invalid hex character
    "a".repeat(63), // 63 chars instead of 64
    "b".repeat(65), // 65 chars
    "xyz-invalid-signature-token-that-is-not-hex-encoded-string-now-1234",
  ]

  for (const sig of malformedSignatures) {
    const req = new Request("http://localhost/verify-razorpay-webhook", {
      method: "POST",
      headers: {
        "x-razorpay-signature": sig,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "payment.captured" }),
    })
    const res = await handleRazorpayWebhook(req, {
      razorpayWebhookSecret: TEST_SECRET,
    })
    assertEquals(res.status, 400)
    const body = await res.json()
    assertStringIncludes(body.error, "Malformed webhook signature format")
  }
})

Deno.test("WH-6. Empty request body returns 400 Bad Request", async () => {
  const validHexSig = "a".repeat(64)
  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": validHexSig },
    body: "",
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
  })
  assertEquals(res.status, 400)
  const body = await res.json()
  assertStringIncludes(body.error, "Empty request body")
})

Deno.test("WH-7. Malformed non-JSON request body returns 400 Bad Request after signature verification", async () => {
  const rawBody = "<<<NOT JSON XML CONTENT>>>"
  const sig = await computeHmac(TEST_SECRET, rawBody)
  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": sig },
    body: rawBody,
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
  })
  assertEquals(res.status, 400)
  const body = await res.json()
  assertStringIncludes(body.error, "Malformed JSON event body")
})

// ==============================================================================
// Section 3: Cryptographic Signature Verification
// ==============================================================================

Deno.test("WH-8. Tampered payload or wrong secret returns 401 Unauthorized", async () => {
  const rawBody = JSON.stringify(createWebhookPayload())
  const wrongSecretSig = await computeHmac(
    "wrong_secret_string_1234567890abc",
    rawBody,
  )

  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": wrongSecretSig },
    body: rawBody,
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
  })
  assertEquals(res.status, 401)
  const body = await res.json()
  assertStringIncludes(body.error, "Invalid webhook signature")
})

Deno.test("WH-9. Tampered body bytes with original signature returns 401 Unauthorized", async () => {
  const originalBody = JSON.stringify(createWebhookPayload())
  const originalSig = await computeHmac(TEST_SECRET, originalBody)
  const tamperedBody = originalBody + " " // slight tampering

  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": originalSig },
    body: tamperedBody,
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
  })
  assertEquals(res.status, 401)
  const body = await res.json()
  assertStringIncludes(body.error, "Invalid webhook signature")
})

// ==============================================================================
// Section 4: Event Filtering
// ==============================================================================

Deno.test("WH-10. Non-payment events (e.g. payment.failed, order.created) return 200 ignored without calling RPC", async () => {
  const ignoredEvents = [
    "payment.failed",
    "payment.dispute.created",
    "order.created",
    "refund.created",
    "refund.processed",
    "subscription.charged",
  ]

  for (const eventName of ignoredEvents) {
    const rawBody = JSON.stringify({ event: eventName, payload: {} })
    const sig = await computeHmac(TEST_SECRET, rawBody)
    const mock = createMockAdminClient()

    const req = new Request("http://localhost/verify-razorpay-webhook", {
      method: "POST",
      headers: { "x-razorpay-signature": sig },
      body: rawBody,
    })
    const res = await handleRazorpayWebhook(req, {
      razorpayWebhookSecret: TEST_SECRET,
      supabaseAdminClient: mock.client,
    })

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.ok, true)
    assertEquals(body.ignored_event, eventName)
    assertEquals(
      mock.calls.length,
      0,
      `RPC should not be called for event: ${eventName}`,
    )
  }
})

// ==============================================================================
// Section 5: Payload Structure & Order ID Handling
// ==============================================================================

Deno.test("WH-11. Missing payment entity in payload returns 400 Bad Request", async () => {
  const payload = createWebhookPayload({ omitPaymentEntity: true })
  const rawBody = JSON.stringify(payload)
  const sig = await computeHmac(TEST_SECRET, rawBody)

  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": sig },
    body: rawBody,
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
  })
  assertEquals(res.status, 400)
  const body = await res.json()
  assertStringIncludes(body.error, "Missing payment entity")
})

Deno.test("WH-12. Payment entity missing order_id returns 400 Bad Request", async () => {
  const payload = createWebhookPayload({ orderId: null as any })
  const rawBody = JSON.stringify(payload)
  const sig = await computeHmac(TEST_SECRET, rawBody)

  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": sig },
    body: rawBody,
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
  })
  assertEquals(res.status, 400)
  const body = await res.json()
  assertStringIncludes(body.error, "Webhook payment has no associated order_id")
})

Deno.test("WH-13. Valid UUID in notes.order_id correctly passed as p_order_id to RPC", async () => {
  const payload = createWebhookPayload({
    event: "payment.captured",
    amountPaise: 500000,
    currency: "INR",
    internalOrderId: TEST_INTERNAL_ORDER_ID,
  })
  const rawBody = JSON.stringify(payload)
  const sig = await computeHmac(TEST_SECRET, rawBody)
  const mock = createMockAdminClient()

  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": sig },
    body: rawBody,
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
    supabaseAdminClient: mock.client,
  })

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
  assertEquals(mock.calls.length, 1)
  assertEquals(mock.calls[0].fn, "record_order_payment")
  assertEquals(mock.calls[0].args.p_order_id, TEST_INTERNAL_ORDER_ID)
  assertEquals(mock.calls[0].args.p_razorpay_order_id, TEST_RZP_ORDER_ID)
  assertEquals(mock.calls[0].args.p_razorpay_payment_id, TEST_RZP_PAY_ID)
  assertEquals(mock.calls[0].args.p_amount_paid, 5000.0)
  assertEquals(mock.calls[0].args.p_currency, "INR")
})

Deno.test("WH-14. Malformed non-UUID string in notes.order_id sanitizes to null without failing regex", async () => {
  const malformedNotesOrderIds = [
    "invalid-order-uuid",
    "12345",
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee", // 11 hex chars instead of 12
    "'; DROP TABLE orders; --",
    "",
  ]

  for (const badId of malformedNotesOrderIds) {
    const payload = createWebhookPayload({
      event: "payment.captured",
      internalOrderId: badId,
    })
    const rawBody = JSON.stringify(payload)
    const sig = await computeHmac(TEST_SECRET, rawBody)
    const mock = createMockAdminClient()

    const req = new Request("http://localhost/verify-razorpay-webhook", {
      method: "POST",
      headers: { "x-razorpay-signature": sig },
      body: rawBody,
    })
    const res = await handleRazorpayWebhook(req, {
      razorpayWebhookSecret: TEST_SECRET,
      supabaseAdminClient: mock.client,
    })

    assertEquals(res.status, 200)
    assertEquals(mock.calls.length, 1)
    assertEquals(
      mock.calls[0].args.p_order_id,
      null,
      `Malformed notes.order_id "${badId}" should sanitize to null`,
    )
  }
})

Deno.test("WH-15. Non-string notes.order_id (number, object) safely defaults to null", async () => {
  const nonStringValues = [12345, { nested: "object" }, true, null]

  for (const val of nonStringValues) {
    const payload = createWebhookPayload({
      event: "payment.captured",
      internalOrderId: val,
    })
    const rawBody = JSON.stringify(payload)
    const sig = await computeHmac(TEST_SECRET, rawBody)
    const mock = createMockAdminClient()

    const req = new Request("http://localhost/verify-razorpay-webhook", {
      method: "POST",
      headers: { "x-razorpay-signature": sig },
      body: rawBody,
    })
    const res = await handleRazorpayWebhook(req, {
      razorpayWebhookSecret: TEST_SECRET,
      supabaseAdminClient: mock.client,
    })

    assertEquals(res.status, 200)
    assertEquals(mock.calls.length, 1)
    assertEquals(mock.calls[0].args.p_order_id, null)
  }
})

// ==============================================================================
// Section 6: order.paid Event Handling & Currency Conversion
// ==============================================================================

Deno.test("WH-16. order.paid event successfully invokes record_order_payment RPC", async () => {
  const payload = createWebhookPayload({
    event: "order.paid",
    amountPaise: 1299900, // 12,999.00 INR
    currency: "INR",
    internalOrderId: TEST_INTERNAL_ORDER_ID,
  })
  const rawBody = JSON.stringify(payload)
  const sig = await computeHmac(TEST_SECRET, rawBody)
  const mock = createMockAdminClient()

  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": sig },
    body: rawBody,
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
    supabaseAdminClient: mock.client,
  })

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
  assertEquals(mock.calls.length, 1)
  assertEquals(mock.calls[0].args.p_amount_paid, 12999.0)
})

// ==============================================================================
// Section 7: RPC Error Handling
// ==============================================================================

Deno.test("WH-17. RPC database failure returns 400 Bad Request with generic error", async () => {
  const payload = createWebhookPayload()
  const rawBody = JSON.stringify(payload)
  const sig = await computeHmac(TEST_SECRET, rawBody)
  const mock = createMockAdminClient({
    rpcError: { message: "violates foreign key constraint 'fk_order_payment'" },
  })

  const req = new Request("http://localhost/verify-razorpay-webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": sig },
    body: rawBody,
  })
  const res = await handleRazorpayWebhook(req, {
    razorpayWebhookSecret: TEST_SECRET,
    supabaseAdminClient: mock.client,
  })

  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, "Payment recording failed")
})

// ==============================================================================
// Section 8: Utility Functions (constantTimeCompare & hexToBytes)
// ==============================================================================

Deno.test("WH-18. constantTimeCompare behaves identically to constant-time security requirements", () => {
  const a = new Uint8Array([1, 2, 3, 4, 5])
  const b = new Uint8Array([1, 2, 3, 4, 5])
  const c = new Uint8Array([1, 2, 3, 4, 6])
  const d = new Uint8Array([1, 2, 3, 4])

  assertEquals(constantTimeCompare(a, b), true)
  assertEquals(constantTimeCompare(a, c), false)
  assertEquals(constantTimeCompare(a, d), false)
  assertEquals(
    constantTimeCompare(new Uint8Array([]), new Uint8Array([])),
    true,
  )
})

Deno.test("WH-19. hexToBytes converts valid hex strings accurately", () => {
  const hex = "000102030405060708090a0b0c0d0e0f"
  const bytes = hexToBytes(hex)
  assertEquals(bytes.length, 16)
  assertEquals(bytes[0], 0)
  assertEquals(bytes[15], 15)

  const uppercaseHex = "A1B2C3D4"
  const upperBytes = hexToBytes(uppercaseHex)
  assertEquals(upperBytes.length, 4)
  assertEquals(upperBytes[0], 0xa1)
  assertEquals(upperBytes[3], 0xd4)
})
