// src/lib/shopify-orders.ts
// Production-Ready Shopify Customer Order Client & Association Service
// IT HUB — Kerala, India

import { supabase, supabaseConfig } from "./supabase";

export interface ShopifyOrderLineItem {
  id?: string;
  title: string;
  quantity: number;
  price: number;
  variantTitle?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
}

export interface ShopifyShippingAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  name?: string;
  phone?: string;
}

export interface ShopifyCustomerOrder {
  id: string;
  user_id: string;
  shopify_order_id: string;
  order_number: string;
  created_at: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency_code: string;
  total_price: number;
  subtotal_price: number;
  total_shipping: number;
  total_tax: number;
  total_discount: number;
  tracking_company: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  line_items: ShopifyOrderLineItem[];
  shipping_address?: ShopifyShippingAddress | null;
  synced_at: string;
}

export type OrderPresentationStatus =
  | "Order placed"
  | "Processing"
  | "Partially fulfilled"
  | "Fulfilled"
  | "Cancelled"
  | "Refunded";

/**
 * Maps Shopify fulfillment and financial status to customer-friendly presentation status.
 */
export function resolveOrderPresentationStatus(
  financialStatus?: string | null,
  fulfillmentStatus?: string | null,
): OrderPresentationStatus {
  const fin = (financialStatus || "").toLowerCase();
  const ful = (fulfillmentStatus || "").toLowerCase();

  if (ful === "cancelled" || ful === "canceled") {
    return "Cancelled";
  }
  if (fin === "refunded") {
    return "Refunded";
  }
  if (ful === "fulfilled" || ful === "delivered") {
    return "Fulfilled";
  }
  if (ful === "partial" || ful === "partially_fulfilled") {
    return "Partially fulfilled";
  }
  if (fin === "paid" || fin === "authorized") {
    return "Processing";
  }
  return "Order placed";
}

/**
 * Returns a theme tone badge for the given presentation status.
 */
export function getOrderStatusBadgeTone(
  status: OrderPresentationStatus,
): "green" | "blue" | "amber" | "red" | "gray" {
  switch (status) {
    case "Fulfilled":
      return "green";
    case "Processing":
      return "blue";
    case "Partially fulfilled":
      return "amber";
    case "Cancelled":
      return "red";
    case "Refunded":
      return "gray";
    case "Order placed":
    default:
      return "blue";
  }
}

export type CheckoutAssociation =
  | { ok: true; token: string }
  | { ok: false; authRequired: boolean; error: string };

const SIGN_IN_TO_BUY = "Please sign in to check out, so your order is saved to your account.";

/**
 * Gets the single-use token that links a website order to the signed-in customer. The server issues
 * it to whoever the session's verified JWT says, so nothing here can name an owner. Without a token
 * the order could never reach the customer's account, so checkout must not start.
 */
export const CHECKOUT_EMAIL_REQUIRED =
  "An email address is needed for your order confirmation and delivery updates.";

/** Checkout's email is for order communication. It never identifies a customer or an order's owner. */
export function isValidCheckoutEmail(email: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email ?? "").trim());
}

export async function requireCheckoutAssociation(): Promise<CheckoutAssociation> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return { ok: false, authRequired: false, error: "Checkout is temporarily unavailable." };
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return { ok: false, authRequired: true, error: SIGN_IN_TO_BUY };
    }

    const { data: token, error, status } = await supabase.rpc("create_checkout_association");
    if (error || !token) {
      const expired = status === 401 || error?.code === "42501" || error?.code === "PGRST301";
      return expired
        ? { ok: false, authRequired: true, error: SIGN_IN_TO_BUY }
        : {
            ok: false,
            authRequired: false,
            error: "We couldn't start a secure checkout. Please try again.",
          };
    }

    return { ok: true, token };
  } catch {
    return {
      ok: false,
      authRequired: false,
      error: "We couldn't start a secure checkout. Please try again.",
    };
  }
}

export interface FetchOrdersResult {
  orders: ShopifyCustomerOrder[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  totalCount: number;
  syncedAt?: string;
  error?: string;
  authError?: boolean;
}

/**
 * Fetches the signed-in customer's orders with server-side pagination. Orders are linked to an
 * account by the signed Shopify webhook and a checkout token, never from this call.
 */
export async function fetchCustomerShopifyOrders(options?: {
  refresh?: boolean;
  offset?: number;
  limit?: number;
}): Promise<FetchOrdersResult> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return {
      orders: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      totalCount: 0,
      error: "Supabase connection is not configured.",
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return {
      orders: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      totalCount: 0,
      error: "Please sign in to view your order history.",
      authError: true,
    };
  }

  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;
  const refresh = options?.refresh ?? false;

  let edgeFnError: string | null = null;

  // 1. First attempt to call the customer-shopify-orders Edge Function
  try {
    const fnUrl = `${supabaseConfig.url}/functions/v1/customer-shopify-orders?limit=${limit}&offset=${offset}`;
    const res = await fetch(fnUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 401) {
      return {
        orders: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 0,
        error: "Your session has expired. Please sign in again.",
        authError: true,
      };
    }

    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.orders)) {
        return {
          orders: data.orders,
          pageInfo: data.pageInfo || { hasNextPage: false, endCursor: null },
          totalCount: data.totalCount ?? data.orders.length,
          syncedAt: data.syncedAt,
        };
      }
    } else {
      const errPayload = await res.json().catch(() => null);
      edgeFnError = errPayload?.error || `Temporary order sync error (HTTP ${res.status}).`;
    }
  } catch (err: any) {
    edgeFnError = err?.message || "Unable to connect to order sync service.";
  }

  // 2. Direct PostgREST RLS query fallback (authoritative, protected by user_id = auth.uid())
  try {
    const { data, count, error } = await supabase
      .from("shopify_customer_orders")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);

    if (error) {
      return {
        orders: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 0,
        error: error.message || "Failed to load order history from database.",
      };
    }

    const hasNextPage = (data || []).length > limit;
    const orders = hasNextPage ? (data || []).slice(0, limit) : data || [];
    const endCursor = hasNextPage ? String(offset + limit) : null;

    // If edge function failed and local database has 0 orders, surface the actual error
    // rather than misleading the user into thinking no orders ever existed
    if (edgeFnError && orders.length === 0 && refresh) {
      return {
        orders: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 0,
        error: edgeFnError,
      };
    }

    return {
      orders: orders as ShopifyCustomerOrder[],
      pageInfo: { hasNextPage, endCursor },
      totalCount: count ?? orders.length,
      syncedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      orders: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      totalCount: 0,
      error: err?.message || edgeFnError || "Unexpected network error loading orders.",
    };
  }
}
