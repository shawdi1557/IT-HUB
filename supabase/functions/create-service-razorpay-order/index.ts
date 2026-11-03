// supabase/functions/create-service-razorpay-order/index.ts
// Production-Grade Secure Razorpay Order Creation for IT HUB Service Quotations
// Binds order amount strictly to the approved quotation amount in the database.
// Never exposes or trusts browser-supplied amounts.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export interface CreateServiceOrderDeps {
  supabaseUserClient?: any;
  supabaseAdminClient?: any;
  fetchFn?: typeof fetch;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  appEnv?: string;
  storefrontOrigin?: string;
}

const DEV_LOCALHOST_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8443",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8443",
];

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

export async function handleCreateServiceRazorpayOrder(
  req: Request,
  deps?: CreateServiceOrderDeps,
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
  const customFetch = deps?.fetchFn ?? fetch;

  try {
    // 1. Authenticate customer JWT
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

    // 2. Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON request payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { service_request_id } = body ?? {};
    if (!service_request_id || typeof service_request_id !== "string") {
      return new Response(JSON.stringify({ error: "service_request_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // 3. Fetch authoritative service ticket from database using adminClient
    const adminClient =
      deps?.supabaseAdminClient ?? createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: service, error: serviceError } = await adminClient
      .from("service_requests")
      .select(
        "id, user_id, ticket_reference, quote, quote_state, status, payment_status, razorpay_order_id",
      )
      .eq("id", service_request_id.trim())
      .maybeSingle();

    if (serviceError || !service) {
      return new Response(JSON.stringify({ error: "Service request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Verify ownership
    if (service.user_id !== user.id) {
      // Asks the database as the caller, so both administrator identities are recognised.
      const { data: isAdmin } = await userClient.rpc("is_admin");

      if (isAdmin !== true) {
        return new Response(
          JSON.stringify({ error: "Forbidden: You do not own this service ticket" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // 5. Verify quotation approval status
    const quoteState = (service.quote_state || "").toLowerCase().trim();
    if (quoteState !== "approved") {
      return new Response(
        JSON.stringify({
          error: `Cannot initiate payment for quotation with state '${service.quote_state || "none"}'. Quotation must be approved first.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 6. Verify quote amount (> 0)
    const quoteAmount = Number(service.quote);
    if (isNaN(quoteAmount) || quoteAmount <= 0) {
      return new Response(
        JSON.stringify({
          error: `Cannot initiate payment for quotation with zero or negative amount (₹${service.quote}).`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 7. Verify ticket is not already paid
    if (service.payment_status === "Paid") {
      return new Response(
        JSON.stringify({
          error: "Service quotation has already been paid.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 8. Bind amount strictly to approved quotation (paise)
    const amountInPaise = Math.round(quoteAmount * 100);

    // 9. Call Razorpay API to create official Order
    if (!razorpayKeyId || !razorpayKeySecret) {
      return new Response(
        JSON.stringify({ error: "Razorpay credentials are not configured on server." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const receiptRef = service.ticket_reference || service.id.substring(0, 16);

    const rzpResponse = await customFetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: receiptRef,
        notes: {
          service_request_id: service.id,
          ticket_reference: receiptRef,
          customer_id: user.id,
          payment_type: "service_quotation",
        },
      }),
    });

    if (!rzpResponse.ok) {
      const rzpError = await rzpResponse.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          error: "Razorpay order creation failed",
          details: rzpError,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rzpOrder = await rzpResponse.json();

    // 10. Attach Razorpay Order ID to the service request via privileged RPC
    const { error: attachError } = await adminClient.rpc("attach_service_razorpay_order_id", {
      p_service_request_id: service.id,
      p_razorpay_order_id: rzpOrder.id,
    });

    if (attachError) {
      console.error(
        "[create-service-razorpay-order] RPC attach_service_razorpay_order_id failed:",
        attachError,
      );
      return new Response(JSON.stringify({ error: attachError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        service_request_id: service.id,
        ticket_reference: receiptRef,
        razorpay_order_id: rzpOrder.id,
        amount: amountInPaise,
        currency: "INR",
        key_id: razorpayKeyId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("[create-service-razorpay-order] Exception:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// Serve if run directly as edge function
if (import.meta.main) {
  serve((req) => handleCreateServiceRazorpayOrder(req));
}
