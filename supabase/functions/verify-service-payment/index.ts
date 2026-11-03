// supabase/functions/verify-service-payment/index.ts
// Production-Grade Secure Payment Verification for IT HUB Service Quotations
// Performs constant-time HMAC-SHA256 signature verification server-side.
// Enforces duplicate payment protection and idempotency.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

export interface VerifyServicePaymentDeps {
  supabaseUserClient?: any;
  supabaseAdminClient?: any;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  appEnv?: string;
  storefrontOrigin?: string;
  fetchImpl?: typeof fetch;
}

const DEV_LOCALHOST_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8443",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8443",
];

export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim().toLowerCase();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function getCorsHeaders(req: Request, appEnv?: string, configuredOriginStr?: string) {
  const origin = req.headers.get("origin") || "";
  const effectiveEnv = (appEnv ?? Deno.env.get("APP_ENV") ?? "production").toLowerCase().trim();
  const configured = configuredOriginStr ?? Deno.env.get("STOREFRONT_ORIGIN") ?? "";

  let allowed = false;
  if (!origin) {
    allowed = true;
  } else if (effectiveEnv === "development" && DEV_LOCALHOST_ORIGINS.includes(origin)) {
    allowed = true;
  } else if (configured) {
    const parts = configured.split(",").map((s) => s.trim().toLowerCase());
    if (parts.includes(origin.toLowerCase())) {
      allowed = true;
    }
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (allowed && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return { headers, allowed };
}

export async function handleVerifyServicePayment(
  req: Request,
  deps?: VerifyServicePaymentDeps,
): Promise<Response> {
  const { headers: corsHeaders, allowed } = getCorsHeaders(
    req,
    deps?.appEnv,
    deps?.storefrontOrigin,
  );

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!allowed) {
    return new Response(JSON.stringify({ error: "CORS origin not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Expected POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const razorpayKeyId = deps?.razorpayKeyId ?? Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const razorpayKeySecret = deps?.razorpayKeySecret ?? Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  const supabaseUrl = deps?.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = deps?.supabaseAnonKey ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceRoleKey =
    deps?.supabaseServiceRoleKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient =
      deps?.supabaseUserClient ??
      createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, "").trim());

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse payload
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON request payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { service_request_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      body ?? {};

    if (!service_request_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required fields (service_request_id, razorpay_order_id, razorpay_payment_id, razorpay_signature)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(service_request_id.trim())) {
      return new Response(
        JSON.stringify({ error: "Invalid service_request_id format (expected UUID)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const hex64Regex = /^[0-9a-f]{64}$/i;
    if (!hex64Regex.test(razorpay_signature.trim())) {
      return new Response(
        JSON.stringify({
          error: "Malformed payment signature format (expected 64 hex characters)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Timing-Safe HMAC-SHA256 Signature Verification
    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("[verify-service-payment] Missing Razorpay credentials in environment");
      return new Response(JSON.stringify({ error: "Server payment configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedData = `${razorpay_order_id.trim()}|${razorpay_payment_id.trim()}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(razorpayKeySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(expectedData));
    const calculatedBytes = new Uint8Array(signatureBuffer);
    const providedBytes = hexToBytes(razorpay_signature.trim());

    if (!constantTimeCompare(calculatedBytes, providedBytes)) {
      console.warn(
        `[verify-service-payment] HMAC signature mismatch for service ${service_request_id}`,
      );
      return new Response(JSON.stringify({ error: "Payment signature verification failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Fetch service record from database
    const adminClient =
      deps?.supabaseAdminClient ?? createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: service, error: serviceError } = await adminClient
      .from("service_requests")
      .select(
        "id, user_id, ticket_reference, quote, quote_state, status, payment_status, razorpay_order_id, razorpay_payment_id",
      )
      .eq("id", service_request_id.trim())
      .maybeSingle();

    if (serviceError || !service) {
      return new Response(JSON.stringify({ error: "Service request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Only the ticket's owner may finalize its payment
    if (service.user_id !== user.id) {
      console.warn(`[verify-service-payment] Ownership mismatch for service ${service.id}`);
      return new Response(JSON.stringify({ error: "You do not own this service ticket" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Verify attached order ID
    if (
      !service.razorpay_order_id ||
      service.razorpay_order_id.trim() !== razorpay_order_id.trim()
    ) {
      return new Response(
        JSON.stringify({ error: "Submitted Razorpay order ID does not match service record" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 7. Duplicate check / Idempotency
    if (service.payment_status === "Paid") {
      if (service.razorpay_payment_id === razorpay_payment_id.trim()) {
        return new Response(
          JSON.stringify({
            ok: true,
            idempotent: true,
            service_request_id: service.id,
            ticket_reference: service.ticket_reference,
            payment_status: "Paid",
            status: service.status,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "Service ticket has already been marked as Paid with a different payment ID",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // 8. Ask Razorpay what actually happened. A valid signature proves the ids belong together,
    // not that the money was captured or how much it was.
    const fetcher = deps?.fetchImpl ?? fetch;
    let payment: any;
    try {
      const paymentRes = await fetcher(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id.trim())}`,
        { headers: { Authorization: "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`) } },
      );
      if (!paymentRes.ok) throw new Error(`Razorpay responded ${paymentRes.status}`);
      payment = await paymentRes.json();
    } catch (fetchErr: any) {
      console.error("[verify-service-payment] Razorpay lookup failed:", fetchErr?.message);
      return new Response(
        JSON.stringify({ error: "Could not confirm the payment with Razorpay" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const quoteAmount = Number(service.quote) || 0;
    const expectedPaise = Math.round(quoteAmount * 100);
    if (
      payment?.status !== "captured" ||
      payment?.order_id !== razorpay_order_id.trim() ||
      payment?.currency !== "INR" ||
      expectedPaise <= 0 ||
      payment?.amount !== expectedPaise
    ) {
      console.warn(`[verify-service-payment] Payment details rejected for service ${service.id}`);
      return new Response(
        JSON.stringify({ error: "Payment was not captured for the full quoted amount" }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 9. Invoke privileged record_service_payment RPC with the amount Razorpay reports
    const { data: rpcData, error: rpcError } = await adminClient.rpc("record_service_payment", {
      p_service_request_id: service.id,
      p_razorpay_order_id: razorpay_order_id.trim(),
      p_razorpay_payment_id: razorpay_payment_id.trim(),
      p_razorpay_signature: razorpay_signature.trim(),
      p_amount_paid: payment.amount / 100,
      p_currency: payment.currency,
    });

    if (rpcError) {
      console.error("[verify-service-payment] record_service_payment RPC error:", rpcError);
      return new Response(JSON.stringify({ error: "Failed to record payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        service_request_id: service.id,
        ticket_reference: service.ticket_reference,
        payment_status: "Paid",
        status: rpcData?.status || "In Progress",
        paid_amount: quoteAmount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("[verify-service-payment] Exception:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// Serve if run directly as edge function
if (import.meta.main) {
  serve((req) => handleVerifyServicePayment(req));
}
