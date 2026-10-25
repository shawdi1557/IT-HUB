// src/lib/payments.ts
// Production-Grade Razorpay Gateway & Supabase Edge Function Integration
// IT HUB — Kerala, India

import { supabase, supabaseConfig, SUPABASE_URL } from "./supabase";

export const RAZORPAY_KEY_ID = (
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_RAZORPAY_KEY_ID) ||
  ""
).trim();

export interface RazorpayPaymentSuccessPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifyPaymentResult {
  ok: boolean;
  order_id?: string;
  order_number?: string;
  status?: number | string;
  payment_status?: string;
  idempotent?: boolean;
  coupon_conflict?: boolean;
  error?: string;
}

export interface OrderItemParam {
  product_id: string;
  quantity: number;
}

export interface CreateOrderParams {
  items: OrderItemParam[];
  addressId?: string | null;
  deliveryMethod?: string;
  paymentMethod?: string;
  couponCode?: string | null;
  notes?: string | null;
}

export interface CreateOrderResult {
  ok: boolean;
  orderId?: string;
  orderNumber?: string;
  total?: number;
  expiresAt?: string;
  error?: string;
}

/**
 * Dynamically loads the official Razorpay Checkout SDK script if not already present.
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }

    // Check if script tag is already being loaded
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error("[Razorpay SDK] Failed to load checkout script.");
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Creates an authoritative order row in Supabase PostgreSQL via create_order() RPC.
 * Automatically locks inventory rows for 30 minutes.
 */
export async function createSupabaseOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return {
      ok: false,
      error: "Supabase database client is not configured.",
    };
  }

  try {
    const { data, error } = await supabase.rpc("create_order", {
      p_items: params.items,
      p_address_id: params.addressId || null,
      p_delivery_method: params.deliveryMethod || "Kerala delivery",
      p_payment_method: params.paymentMethod || "Razorpay",
      p_coupon_code: params.couponCode || null,
      p_notes: params.notes || null,
    });

    if (error) {
      console.error("[create_order RPC] Error creating order:", error.message);
      return {
        ok: false,
        error: error.message || "Failed to create order on server.",
      };
    }

    return {
      ok: true,
      orderId: data.order_id,
      orderNumber: data.order_number,
      total: Number(data.total),
      expiresAt: data.expires_at,
    };
  } catch (err: any) {
    console.error("[create_order RPC] Uncaught exception:", err);
    return {
      ok: false,
      error: err?.message || "Internal order creation error.",
    };
  }
}

/**
 * Submits the payment callback payload to the Supabase Edge Function:
 * `verify-checkout-callback`
 *
 * Edge Function verifies:
 * 1. CORS allowlist (STOREFRONT_ORIGIN)
 * 2. Constant-time HMAC-SHA256 signature
 * 3. Customer order ownership
 * 4. Razorpay Payments API (captured status, INR currency, integer paise)
 * 5. Privileged record_order_payment() RPC invocation
 */
export async function verifyCheckoutCallback(
  payload: RazorpayPaymentSuccessPayload & { order_id: string },
): Promise<VerifyPaymentResult> {
  if (!supabase || !supabaseConfig.isConfigured || !SUPABASE_URL) {
    return {
      ok: false,
      error: "Payment verification service is not reachable (Supabase not configured).",
    };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return {
        ok: false,
        error: "Active customer session required to verify payment.",
      };
    }

    const endpoint = `${SUPABASE_URL}/functions/v1/verify-checkout-callback`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn("[verify-checkout-callback] Verification rejected:", body);
      return {
        ok: false,
        error: body?.error || `Payment verification failed with status ${res.status}`,
      };
    }

    return {
      ok: true,
      order_id: body.order_id,
      order_number: body.order_number,
      status: body.status,
      payment_status: body.payment_status,
      idempotent: body.idempotent,
      coupon_conflict: body.coupon_conflict,
    };
  } catch (err: any) {
    console.error("[verify-checkout-callback] Fetch exception:", err);
    return {
      ok: false,
      error:
        "Network error contacting payment verification endpoint. Your order reference is saved.",
    };
  }
}

export interface LaunchRazorpayOptions {
  orderId: string;
  razorpayOrderId?: string;
  amountINR: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  onSuccess: (payload: RazorpayPaymentSuccessPayload) => void;
  onDismiss?: () => void;
  onError?: (err: string) => void;
}

/**
 * Initializes and displays the official Razorpay Checkout modal.
 */
export async function launchRazorpayModal(options: LaunchRazorpayOptions): Promise<boolean> {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    options.onError?.("Could not load payment gateway. Please check your internet connection.");
    return false;
  }

  if (!RAZORPAY_KEY_ID) {
    options.onError?.("Razorpay Key ID is not configured in environment.");
    return false;
  }

  const amountPaise = Math.round(options.amountINR * 100);

  const razorpayOptions: Record<string, any> = {
    key: RAZORPAY_KEY_ID,
    amount: amountPaise,
    currency: "INR",
    name: "IT HUB",
    description: `Order ${options.orderId.slice(0, 12)}`,
    image: "/images/logo.png",
    prefill: {
      name: options.customerName,
      email: options.customerEmail,
      contact: options.customerPhone,
    },
    notes: {
      order_id: options.orderId,
      platform: "IT HUB Kerala",
    },
    theme: {
      color: "#0c2f8a", // IT HUB Primary Brand Blue
    },
    modal: {
      ondismiss: () => {
        options.onDismiss?.();
      },
    },
    handler: (response: any) => {
      if (response.razorpay_payment_id && response.razorpay_signature) {
        options.onSuccess({
          razorpay_order_id: response.razorpay_order_id || options.razorpayOrderId || "",
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      } else {
        options.onError?.("Incomplete payment credentials received from gateway.");
      }
    },
  };

  if (options.razorpayOrderId) {
    razorpayOptions.order_id = options.razorpayOrderId;
  }

  try {
    const rzp = new (window as any).Razorpay(razorpayOptions);
    rzp.on("payment.failed", (failedRes: any) => {
      console.warn("[Razorpay] Payment failed:", failedRes?.error);
      options.onError?.(failedRes?.error?.description || "Payment was declined by the bank.");
    });
    rzp.open();
    return true;
  } catch (err: any) {
    console.error("[Razorpay] Error initializing modal:", err);
    options.onError?.("Failed to launch payment checkout window.");
    return false;
  }
}
