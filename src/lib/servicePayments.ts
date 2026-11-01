// src/lib/servicePayments.ts
// Service Quotation Payment Integration: UPI via Razorpay & Pay at IT HUB
// IT HUB — Kerala, India

export const ALLOWED_SERVICE_PAYMENT_METHODS = ["upi", "store"] as const;

export type ServicePaymentMethod = (typeof ALLOWED_SERVICE_PAYMENT_METHODS)[number];

export interface ServiceRecordForPayment {
  id: string;
  ticket_reference?: string | null;
  ticketReference?: string | null;
  quote?: number | null;
  quote_state?: string | null;
  quoteState?: string | null;
  status: string | number;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
}

/**
 * Validates whether a payment method is officially authorized for service quotations.
 * Strictly permits only:
 * - "upi" (Razorpay UPI checkout)
 * - "store" (Pay at IT HUB showroom)
 * Rejecting cards, net banking, wallets, and mock sandbox modes.
 */
export function isValidServicePaymentMethod(method?: string | null): boolean {
  if (!method || typeof method !== "string") return false;
  return (ALLOWED_SERVICE_PAYMENT_METHODS as readonly string[]).includes(
    method.trim().toLowerCase(),
  );
}

/**
 * Enforces business rule: Customer cannot initiate payment until quotation is published and approved.
 * Requires:
 * 1. Positive quotation amount (> 0)
 * 2. Quotation state strictly "approved"
 */
export function canInitiateServicePayment(service?: ServiceRecordForPayment | null): boolean {
  if (!service) return false;
  const quoteVal = Number(service.quote);
  if (isNaN(quoteVal) || quoteVal <= 0) return false;

  const quoteState = (service.quote_state || service.quoteState || "").toLowerCase().trim();
  return quoteState === "approved";
}

export interface OfflinePayAtStoreRecord {
  service_id: string;
  ticket_reference: string;
  payment_status: "Pay at Store";
  payment_method: "store";
  is_paid: false;
  payable_amount: number;
  selected_at: string;
  instructions: string;
}

/**
 * Generates an offline payment record for Pay at IT HUB.
 * Crucial: Strictly leaves is_paid as false. The ticket remains unpaid until physically
 * collected and verified by authorized staff at the IT HUB showroom counter.
 */
export function buildOfflinePayAtStoreRecord(
  service: ServiceRecordForPayment,
): OfflinePayAtStoreRecord {
  const ref = service.ticket_reference || service.ticketReference || service.id;
  const amount = Number(service.quote) || 0;

  return {
    service_id: service.id,
    ticket_reference: ref,
    payment_status: "Pay at Store",
    payment_method: "store",
    is_paid: false,
    payable_amount: amount,
    selected_at: new Date().toISOString(),
    instructions:
      "Please visit the IT HUB showroom counter upon device collection. " +
      "Payment can be completed in person via Cash or UPI QR upon inspecting your repaired device.",
  };
}

export interface StaffPaymentReceivedRecord {
  service_id: string;
  ticket_reference: string;
  payment_status: "Paid";
  is_paid: true;
  collected_amount: number;
  collected_by_staff_id: string;
  paid_at: string;
  payment_method: "store";
}

/**
 * Generates an authoritative staff confirmation record when offline payment is received at store.
 */
export function buildStaffPaymentReceivedRecord(
  service: ServiceRecordForPayment,
  staffUser: { id: string; email?: string; role?: string },
  collectedAmount: number,
): StaffPaymentReceivedRecord {
  const ref = service.ticket_reference || service.ticketReference || service.id;

  return {
    service_id: service.id,
    ticket_reference: ref,
    payment_status: "Paid",
    is_paid: true,
    collected_amount: collectedAmount,
    collected_by_staff_id: staffUser.id,
    paid_at: new Date().toISOString(),
    payment_method: "store",
  };
}

/**
 * Returns Razorpay Checkout configuration strictly restricted to UPI.
 * Hides Cards, Net Banking, and Wallets.
 */
export function getRazorpayUpiCheckoutConfig(params: {
  keyId: string;
  amountINR: number;
  ticketReference: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
}): Record<string, any> {
  const amountPaise = Math.round(params.amountINR * 100);

  return {
    key: params.keyId,
    amount: amountPaise,
    currency: "INR",
    name: "IT HUB",
    description: `Service Quotation — ${params.ticketReference}`,
    image: "/images/logo.png",
    prefill: {
      name: params.customerName || "",
      contact: params.customerPhone || "",
      email: params.customerEmail || "",
    },
    notes: {
      ticket_reference: params.ticketReference,
      payment_type: "service_quotation",
    },
    theme: {
      color: "#0c2f8a", // IT HUB Primary Brand Blue
    },
    // Enforce UPI-only payment method restriction in Razorpay Checkout
    config: {
      display: {
        blocks: {
          utype: {
            name: "Pay via UPI",
            instruments: [{ method: "upi" }],
          },
        },
        sequence: ["block.utype"],
        preferences: {
          show_default_blocks: false,
        },
      },
    },
  };
}
