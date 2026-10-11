// supabase/functions/verify-razorpay-webhook/index.ts
// Secure Asynchronous Razorpay Webhook Verification Edge Function
// Verifies X-Razorpay-Signature on raw request body using RAZORPAY_WEBHOOK_SECRET

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing x-razorpay-signature header" }), { status: 400 });
    }

    // 1. Read exact raw HTTP request body text
    const rawBody = await req.text();

    // 2. Cryptographic signature check: HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(RAZORPAY_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const calculatedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (calculatedSignature !== signature) {
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), { status: 401 });
    }

    // 3. Parse JSON event payload
    const event = JSON.parse(rawBody);

    // Only process payment.captured or order.paid events
    if (event.event !== "payment.captured" && event.event !== "order.paid") {
      return new Response(JSON.stringify({ ok: true, ignored_event: event.event }), { status: 200 });
    }

    const payment = event.payload.payment?.entity;
    if (!payment) {
      return new Response(JSON.stringify({ error: "Missing payment entity in payload" }), { status: 400 });
    }

    const razorpayPaymentId = payment.id;
    const razorpayOrderId = payment.order_id;
    const amountPaid = payment.amount / 100.0; // paise to INR
    const currency = payment.currency;
    const internalOrderId = payment.notes?.order_id || null;

    if (!razorpayOrderId) {
      return new Response(JSON.stringify({ error: "Webhook payment has no associated order_id" }), { status: 400 });
    }

    // 4. Call privileged database finalization function via service_role client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: result, error: rpcError } = await supabase.rpc("record_order_payment", {
      p_order_id: internalOrderId,
      p_razorpay_order_id: razorpayOrderId,
      p_razorpay_payment_id: razorpayPaymentId,
      p_razorpay_signature: signature,
      p_amount_paid: amountPaid,
      p_currency: currency,
    });

    if (rpcError) {
      return new Response(JSON.stringify({ error: rpcError.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

