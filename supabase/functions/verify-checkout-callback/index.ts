// supabase/functions/verify-checkout-callback/index.ts
// Production-Grade Secure Razorpay Checkout Modal Callback Verification Edge Function
// IT HUB — Kerala, India

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

export interface CheckoutCallbackDeps {
  supabaseUserClient?: any
  supabaseAdminClient?: any
  fetchFn?: typeof fetch
  razorpayKeyId?: string
  razorpayKeySecret?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  supabaseServiceRoleKey?: string
  allowedOrigins?: Set<string>
  appEnv?: string
  storefrontOrigin?: string
  gatewayTimeoutMs?: number
}

// ────────────────────────────────────────────────────────────────────────────
// 1. CORS CONFIGURATION & RESTRICTIONS (ISSUE A)
// ────────────────────────────────────────────────────────────────────────────

const DEV_LOCALHOST_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8443",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8443",
]

/**
 * Validates and normalizes an origin URL string.
 * Rejects wildcards, non-http/https protocols, and malformed strings.
 * Returns normalized lowercase `<protocol>//<host>` (or `<protocol>//<host>:<port>`).
 */
export function parseAndNormalizeOrigin(rawOrigin: string): string | null {
  const trimmed = rawOrigin.trim()
  if (!trimmed || trimmed === "*" || trimmed.includes("*")) {
    return null
  }
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }
    return url.origin.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Resolves allowed CORS origins based on explicit environment configuration.
 * - In production (APP_ENV != 'development'), only valid origins in STOREFRONT_ORIGIN are allowed.
 * - Localhost origins are ONLY permitted when APP_ENV === 'development'.
 * - Missing STOREFRONT_ORIGIN in production results in an empty allowlist (fail-closed).
 */
export function getAllowedOrigins(
  appEnv?: string,
  configuredOriginStr?: string,
): Set<string> {
  const effectiveEnv = (appEnv ?? Deno.env.get("APP_ENV") ?? "production")
    .toLowerCase()
    .trim()
  const rawConfigured =
    configuredOriginStr ?? Deno.env.get("STOREFRONT_ORIGIN") ?? ""

  const origins = new Set<string>()

  // Allow localhost ONLY in explicit development environment
  if (effectiveEnv === "development") {
    for (const devOrigin of DEV_LOCALHOST_ORIGINS) {
      const normalized = parseAndNormalizeOrigin(devOrigin)
      if (normalized) origins.add(normalized)
    }
  }

  // Parse comma-separated configured storefront origins
  if (rawConfigured) {
    const parts = rawConfigured.split(",")
    for (const part of parts) {
      const normalized = parseAndNormalizeOrigin(part)
      if (normalized) {
        origins.add(normalized)
      } else {
        console.warn(
          `[verify-checkout-callback] Ignored invalid or malformed origin in STOREFRONT_ORIGIN: "${part.trim()}"`,
        )
      }
    }
  }

  return origins
}

export interface CorsHeadersResult {
  headers: Record<string, string>
  originAllowed: boolean
}

export function getCorsHeaders(
  req: Request,
  overrideOrigins?: Set<string>,
  appEnv?: string,
  storefrontOrigin?: string,
): CorsHeadersResult {
  const origin = req.headers.get("origin")
  const allowedOrigins =
    overrideOrigins ?? getAllowedOrigins(appEnv, storefrontOrigin)

  const baseHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }

  if (!origin) {
    // Non-browser or server-to-server request (e.g. CLI, automated test, curl)
    return { headers: baseHeaders, originAllowed: true }
  }

  const normalizedOrigin = parseAndNormalizeOrigin(origin)
  if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
    return {
      headers: {
        ...baseHeaders,
        "Access-Control-Allow-Origin": origin, // Return matching origin as requested
      },
      originAllowed: true,
    }
  }

  // Browser origin is provided but not present in the allowlist
  return { headers: baseHeaders, originAllowed: false }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. TIMING-SAFE CRYPTOGRAPHIC HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Constant-time byte array comparison to protect against timing attacks.
 * Returns true if both Uint8Arrays have the same length and identical bytes.
 * Execution time does not depend on the position of the first mismatch.
 */
export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

/**
 * Converts a valid hex string into a Uint8Array byte array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim().toLowerCase()
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// ────────────────────────────────────────────────────────────────────────────
// 3. MAIN EDGE FUNCTION HANDLER
// ────────────────────────────────────────────────────────────────────────────

export async function handleCheckoutCallback(
  req: Request,
  deps?: CheckoutCallbackDeps,
): Promise<Response> {
  const { headers: corsHeaders, originAllowed } = getCorsHeaders(
    req,
    deps?.allowedOrigins,
    deps?.appEnv,
    deps?.storefrontOrigin,
  )

  // A2. Reject disallowed browser origins
  if (!originAllowed) {
    const origin = req.headers.get("origin") || "unknown"
    console.warn(
      `[verify-checkout-callback] Rejected request from unauthorized origin: ${origin}`,
    )
    return new Response(JSON.stringify({ error: "CORS origin not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Restrict HTTP method to POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Expected POST." }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          Allow: "POST, OPTIONS",
          "Content-Type": "application/json",
        },
      },
    )
  }

  const razorpayKeyId =
    deps?.razorpayKeyId ?? Deno.env.get("RAZORPAY_KEY_ID") ?? ""
  const razorpayKeySecret =
    deps?.razorpayKeySecret ?? Deno.env.get("RAZORPAY_KEY_SECRET") ?? ""
  const supabaseUrl = deps?.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? ""
  const supabaseAnonKey =
    deps?.supabaseAnonKey ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const supabaseServiceRoleKey =
    deps?.supabaseServiceRoleKey ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    ""
  const customFetch = deps?.fetchFn ?? fetch
  const gatewayTimeoutMs =
    deps?.gatewayTimeoutMs ??
    (Number(Deno.env.get("RAZORPAY_REQUEST_TIMEOUT_MS")) || 8000)

  try {
    // A. Validate Authorization Header & Customer Session
    const authHeader = req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const userClient =
      deps?.supabaseUserClient ??
      createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // B. Parse & Validate Payload
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON request payload" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const {
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body ?? {}

    if (
      !order_id ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required checkout callback fields (order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    if (
      typeof order_id !== "string" ||
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid field parameter data types" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Format assertions (UUID and 64-character hex signature)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(order_id.trim())) {
      return new Response(
        JSON.stringify({ error: "Invalid order_id format (expected UUID)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const hex64Regex = /^[0-9a-f]{64}$/i
    if (!hex64Regex.test(razorpay_signature.trim())) {
      return new Response(
        JSON.stringify({
          error:
            "Malformed payment signature format (expected 64 hex characters)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // C. Timing-Safe HMAC-SHA256 Signature Verification
    if (!razorpayKeySecret) {
      console.error(
        "[verify-checkout-callback] Missing RAZORPAY_KEY_SECRET in environment",
      )
      return new Response(
        JSON.stringify({ error: "Payment verification configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const expectedData = `${razorpay_order_id.trim()}|${razorpay_payment_id.trim()}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(razorpayKeySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(expectedData),
    )
    const calculatedBytes = new Uint8Array(signatureBuffer)
    const providedBytes = hexToBytes(razorpay_signature.trim())

    if (!constantTimeCompare(calculatedBytes, providedBytes)) {
      console.warn(
        `[verify-checkout-callback] HMAC signature mismatch for order ${order_id}`,
      )
      return new Response(
        JSON.stringify({ error: "Payment signature verification failed" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // D. Verify Internal Order Ownership & State (Scoped to Authenticated User)
    const { data: userOrder, error: orderLookupError } = await userClient
      .from("orders")
      .select(
        "id, user_id, order_number, total, razorpay_order_id, razorpay_payment_id, status, payment_status, expires_at, stock_reserved",
      )
      .eq("id", order_id.trim())
      .maybeSingle()

    if (orderLookupError) {
      console.error(
        "[verify-checkout-callback] Order query error:",
        orderLookupError.message,
      )
      return new Response(
        JSON.stringify({ error: "Failed to query order records" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const adminClient =
      deps?.supabaseAdminClient ??
      createClient(supabaseUrl, supabaseServiceRoleKey)

    // D1. Handle Service-Role Fallback Lookup (ISSUE D)
    if (!userOrder) {
      const { data: existingOrder, error: fallbackLookupError } =
        await adminClient
          .from("orders")
          .select("id, user_id")
          .eq("id", order_id.trim())
          .maybeSingle()

      if (fallbackLookupError) {
        console.error(
          "[verify-checkout-callback] Service-role fallback query error:",
          fallbackLookupError.message,
        )
        return new Response(
          JSON.stringify({ error: "Failed to query order records" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      if (existingOrder && existingOrder.user_id !== user.id) {
        // Order exists but is owned by another customer.
        // D2: Log sanitized event without disclosing user identity, and return 403 Forbidden.
        console.warn(
          `[verify-checkout-callback] Ownership violation detected for order ${order_id.trim()}`,
        )
        return new Response(
          JSON.stringify({ error: "Forbidden: You do not own this order" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Order does not exist in the system
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Explicit ownership assertion (never bypass using service-role)
    if (userOrder.user_id !== user.id) {
      console.warn(
        `[verify-checkout-callback] Ownership violation detected for order ${userOrder.id}`,
      )
      return new Response(
        JSON.stringify({ error: "Forbidden: You do not own this order" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // B1. Enforce Internal-to-Razorpay Order Mapping (ISSUE B)
    // The internal order MUST already have a non-null razorpay_order_id attached.
    if (!userOrder.razorpay_order_id || !userOrder.razorpay_order_id.trim()) {
      console.warn(
        `[verify-checkout-callback] Order ${userOrder.id} has no associated razorpay_order_id`,
      )
      return new Response(
        JSON.stringify({
          error:
            "Internal order has no associated Razorpay order ID. Order checkout was not initialized correctly.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // The submitted Razorpay order ID MUST match the stored value exactly.
    if (userOrder.razorpay_order_id.trim() !== razorpay_order_id.trim()) {
      console.warn(
        `[verify-checkout-callback] Razorpay order ID mismatch. Recorded: ${userOrder.razorpay_order_id}, Submitted: ${razorpay_order_id}`,
      )
      return new Response(
        JSON.stringify({
          error: "Submitted Razorpay order ID does not match order record",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Idempotency pre-check for already-paid orders
    if (userOrder.payment_status === "Paid") {
      let recordedPaymentId = userOrder.razorpay_payment_id
      if (!recordedPaymentId) {
        const { data: paidOrder } = await adminClient
          .from("orders")
          .select("razorpay_payment_id")
          .eq("id", userOrder.id)
          .single()
        recordedPaymentId = paidOrder?.razorpay_payment_id
      }

      if (recordedPaymentId === razorpay_payment_id.trim()) {
        return new Response(
          JSON.stringify({
            ok: true,
            idempotent: true,
            order_id: userOrder.id,
            order_number: userOrder.order_number,
            status: userOrder.status,
            payment_status: "Paid",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      } else {
        console.warn(
          `[verify-checkout-callback] Attempted to re-pay order ${userOrder.id} with different payment ID ${razorpay_payment_id}`,
        )
        return new Response(
          JSON.stringify({
            error:
              "Order has already been marked as Paid with a different payment reference",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
    }

    // E. Verify Payment with Razorpay Payments API & Timeout Protection (ISSUE C)
    if (!razorpayKeyId) {
      console.error(
        "[verify-checkout-callback] Missing RAZORPAY_KEY_ID in environment",
      )
      return new Response(
        JSON.stringify({ error: "Payment verification configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), gatewayTimeoutMs)

    let paymentData: any
    try {
      const rzpRes = await customFetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id.trim())}`,
        {
          headers: {
            Authorization: `Basic ${credentials}`,
          },
          signal: controller.signal,
        },
      )

      if (!rzpRes.ok) {
        console.error(
          `[verify-checkout-callback] Razorpay API responded with status ${rzpRes.status}`,
        )
        return new Response(
          JSON.stringify({
            error:
              "Unable to verify payment with the gateway. Please contact support.",
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Read response body under active timeout protection
      let rawText: string
      try {
        rawText = await rzpRes.text()
      } catch (readErr: any) {
        // Body stream abort or read failure will bubble to outer catch
        throw readErr
      }

      try {
        paymentData = JSON.parse(rawText)
      } catch {
        return new Response(
          JSON.stringify({
            error: "Malformed response received from payment gateway",
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
    } catch (netErr: any) {
      const isTimeout =
        controller.signal.aborted ||
        (netErr instanceof Error &&
          (netErr.name === "AbortError" || netErr.name === "TimeoutError")) ||
        String(netErr?.message).toLowerCase().includes("timeout") ||
        String(netErr?.message).toLowerCase().includes("aborted")

      if (isTimeout) {
        console.warn(
          `[verify-checkout-callback] Razorpay API request/response timed out after ${gatewayTimeoutMs}ms for payment ${razorpay_payment_id}`,
        )
        return new Response(
          JSON.stringify({
            error:
              "Payment gateway request timed out. Please retry verification shortly or check back later.",
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      console.error(
        "[verify-checkout-callback] Network error fetching payment from Razorpay:",
        netErr?.message || netErr,
      )
      return new Response(
        JSON.stringify({
          error:
            "Payment gateway verification service is currently unavailable. Please retry shortly.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    } finally {
      clearTimeout(timeoutId)
    }

    // F. Strict Gateway Data Reconciliation
    // 1. Verify Payment ID matches
    if (paymentData.id !== razorpay_payment_id.trim()) {
      console.warn(
        `[verify-checkout-callback] Gateway payment ID mismatch: ${paymentData.id} vs ${razorpay_payment_id}`,
      )
      return new Response(
        JSON.stringify({ error: "Payment identifier mismatch" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // 2. Verify Razorpay Order ID matches
    if (
      !paymentData.order_id ||
      paymentData.order_id !== razorpay_order_id.trim()
    ) {
      console.warn(
        `[verify-checkout-callback] Gateway order ID mismatch: ${paymentData.order_id} vs ${razorpay_order_id}`,
      )
      return new Response(
        JSON.stringify({
          error: "Payment does not correspond to the requested order",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // 3. Reject non-captured payment states (CRITICAL: 'authorized' is rejected)
    if (paymentData.status !== "captured") {
      console.warn(
        `[verify-checkout-callback] Payment status is '${paymentData.status}' (not 'captured'). Rejection enforced.`,
      )
      return new Response(
        JSON.stringify({
          error:
            paymentData.status === "authorized"
              ? "Payment is authorized but has not yet been captured by the bank"
              : `Payment has not been captured (current status: ${paymentData.status})`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // 4. Verify Currency
    if (paymentData.currency !== "INR") {
      console.warn(
        `[verify-checkout-callback] Invalid currency: ${paymentData.currency}`,
      )
      return new Response(
        JSON.stringify({
          error: "Unsupported currency: only INR payments are accepted",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // 5. Verify Amount (Integer Paise Comparison)
    const gatewayPaise = Number(paymentData.amount)
    const expectedPaise = Math.round(Number(userOrder.total) * 100)

    if (!Number.isInteger(gatewayPaise) || gatewayPaise <= 0) {
      console.warn(
        `[verify-checkout-callback] Non-integer or non-positive gateway amount: ${paymentData.amount}`,
      )
      return new Response(
        JSON.stringify({ error: "Invalid payment amount reported by gateway" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    if (gatewayPaise !== expectedPaise) {
      console.warn(
        `[verify-checkout-callback] Amount mismatch. Expected paise: ${expectedPaise}, Gateway paise: ${gatewayPaise}`,
      )
      return new Response(
        JSON.stringify({
          error: "Payment amount does not match the order total",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // 6. Verify notes.order_id if present
    if (
      paymentData.notes?.order_id &&
      paymentData.notes.order_id !== userOrder.id
    ) {
      console.warn(
        `[verify-checkout-callback] Gateway notes order_id mismatch: ${paymentData.notes.order_id} vs ${userOrder.id}`,
      )
      return new Response(
        JSON.stringify({
          error: "Payment metadata belongs to a different order",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // G. Finalize Payment in PostgreSQL via Trusted service_role RPC
    const verifiedAmountINR = gatewayPaise / 100.0

    const { data: result, error: rpcError } = await adminClient.rpc(
      "record_order_payment",
      {
        p_order_id: userOrder.id,
        p_razorpay_order_id: razorpay_order_id.trim(),
        p_razorpay_payment_id: razorpay_payment_id.trim(),
        p_razorpay_signature: razorpay_signature.trim(),
        p_amount_paid: verifiedAmountINR,
        p_currency: "INR",
      },
    )

    if (rpcError) {
      console.error(
        "[verify-checkout-callback] Database record_order_payment RPC failed:",
        rpcError.message,
      )
      return new Response(
        JSON.stringify({
          error:
            "Payment was captured by gateway, but order finalization could not be completed. Your payment reference is saved for automated reconciliation.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // H. Safe Client Response (No internal system details or secrets leaked)
    return new Response(
      JSON.stringify({
        ok: true,
        order_id: result.order_id,
        order_number: result.order_number,
        status: result.status,
        payment_status: result.payment_status,
        idempotent: Boolean(result.idempotent),
        coupon_conflict: Boolean(result.coupon_conflict),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (err: any) {
    console.error(
      "[verify-checkout-callback] Uncaught exception:",
      err instanceof Error ? err.message : String(err),
    )
    return new Response(
      JSON.stringify({ error: "Internal payment processing error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
}

// Start Deno server listener when executed directly
if (import.meta.main && !Deno.env.get("DENO_TESTING")) {
  serve((req) => handleCheckoutCallback(req))
}
