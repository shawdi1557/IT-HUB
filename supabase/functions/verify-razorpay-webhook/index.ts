// supabase/functions/verify-razorpay-webhook/index.ts
// Production-Grade Secure Asynchronous Razorpay Webhook Verification Edge Function
// Verifies X-Razorpay-Signature on raw request body bytes using RAZORPAY_WEBHOOK_SECRET

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

export interface WebhookDeps {
  razorpayWebhookSecret?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  supabaseAdminClient?: any;
}

/**
 * Constant-time byte array comparison to protect against timing attacks.
 */
export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Converts a 64-character hex string into a Uint8Array byte array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim().toLowerCase();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function handleRazorpayWebhook(req: Request, deps?: WebhookDeps): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Expected POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const webhookSecret =
    deps?.razorpayWebhookSecret ?? Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  const supabaseUrl = deps?.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceRoleKey =
    deps?.supabaseServiceRoleKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!webhookSecret) {
    console.error("[verify-razorpay-webhook] Missing RAZORPAY_WEBHOOK_SECRET configuration");
    return new Response(JSON.stringify({ error: "Webhook configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing x-razorpay-signature header" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hex64Regex = /^[0-9a-f]{64}$/i;
    if (!hex64Regex.test(signature.trim())) {
      return new Response(JSON.stringify({ error: "Malformed webhook signature format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Read exact raw HTTP request body text
    const rawBody = await req.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: "Empty request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Cryptographic signature check: HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const calculatedBytes = new Uint8Array(signatureBuffer);
    const providedBytes = hexToBytes(signature.trim());

    if (!constantTimeCompare(calculatedBytes, providedBytes)) {
      console.warn("[verify-razorpay-webhook] Signature verification failed");
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Parse JSON event payload
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON event body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only process payment.captured or order.paid events
    if (event.event !== "payment.captured" && event.event !== "order.paid") {
      return new Response(JSON.stringify({ ok: true, ignored_event: event.event }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return new Response(JSON.stringify({ error: "Missing payment entity in payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const razorpayPaymentId = payment.id;
    const razorpayOrderId = payment.order_id;
    const amountPaid = payment.amount / 100.0; // paise to INR
    const currency = payment.currency;
    const internalOrderIdRaw = payment.notes?.order_id;

    if (!razorpayOrderId) {
      return new Response(JSON.stringify({ error: "Webhook payment has no associated order_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate internal UUID format if provided in notes
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const internalOrderId =
      internalOrderIdRaw &&
      typeof internalOrderIdRaw === "string" &&
      uuidRegex.test(internalOrderIdRaw.trim())
        ? internalOrderIdRaw.trim()
        : null;

    // 4. Call privileged database finalization function via service_role client
    const supabase = deps?.supabaseAdminClient ?? createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: result, error: rpcError } = await supabase.rpc("record_order_payment", {
      p_order_id: internalOrderId,
      p_razorpay_order_id: razorpayOrderId,
      p_razorpay_payment_id: razorpayPaymentId,
      p_razorpay_signature: signature.trim(),
      p_amount_paid: amountPaid,
      p_currency: currency,
    });

    if (rpcError) {
      console.error(
        "[verify-razorpay-webhook] Database record_order_payment RPC failed:",
        rpcError.message,
      );
      return new Response(JSON.stringify({ error: "Payment recording failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[verify-razorpay-webhook] Unhandled exception:", err.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main && !Deno.env.get("DENO_TESTING")) {
  serve(async (req: Request) => {
    return handleRazorpayWebhook(req);
  });
}
