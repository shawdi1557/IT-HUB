// src/lib/builder/checkout.ts
// IT HUB PC Builder Commerce & Quotation Finalization Layer
// Prepares Shopify multi-item cart checkouts and structured WhatsApp quotations.

import type { CanonicalBuild, CompatibilitySummary, ComponentSlotId } from "./types";
import { checkCompatibility } from "./compatibility";
import { assessBuild, type BuildAssessment } from "./completeness";
import {
  ASSEMBLY_NOT_SET,
  NO_LONGER_AVAILABLE,
  STATE_BADGE,
  WHATSAPP_ESTIMATE_NOTE,
  WHATSAPP_HEADING,
  slotLabel,
} from "./completeness-wording";
import { COMPONENT_SLOTS } from "./slots";
import { createShopifyCart, checkShopifyAvailability, shopifyConfig } from "../shopify";
import {
  CHECKOUT_EMAIL_REQUIRED,
  isValidCheckoutEmail,
  requireCheckoutAssociation,
} from "../shopify-orders";
import { money } from "../../data/catalog";
import { summariseBuildPrice } from "./pricing";

export interface PrepareCheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
  missingCount?: number;
  requiresAuth?: boolean;
  requiresEmail?: boolean;
}

/**
 * Prepares a multi-variant Shopify cart for the configured PC build components.
 * Bypasses owned parts and pre-checks inventory availability.
 */
export async function prepareShopifyCheckout(
  build: CanonicalBuild,
  contact?: { email?: string | null; phone?: string | null },
): Promise<PrepareCheckoutResult> {
  const owned = new Set(build.ownedSlots || []);
  const lines: Array<{ merchandiseId: string; quantity: number }> = [];
  let missingVariantCount = 0;

  for (const [slot, comp] of Object.entries(build.components)) {
    if (!comp || owned.has(slot as ComponentSlotId)) continue;

    // Real Shopify variants use standard GID format
    if (comp.variantId && comp.variantId.startsWith("gid://shopify/ProductVariant/")) {
      // Exclude local placeholder variant IDs
      if (!comp.variantId.includes("mock-")) {
        lines.push({
          merchandiseId: comp.variantId,
          quantity: comp.quantity || 1,
        });
        continue;
      }
    }
    missingVariantCount++;
  }

  // If any non-owned components could not be resolved to authentic Shopify variants
  if (missingVariantCount > 0) {
    return {
      success: false,
      missingCount: missingVariantCount,
      error: `This configuration includes ${missingVariantCount} component(s) that are in-store or distributor-sourced items without an active Shopify online catalog listing. Direct Shopify checkout requires all parts to be listed. You can request an itemized quotation via WhatsApp.`,
    };
  }

  // If no lines could be resolved to live Shopify variants
  if (lines.length === 0) {
    return {
      success: false,
      missingCount: missingVariantCount,
      error: "No components in this configuration are available for online Shopify checkout.",
    };
  }

  // A website order must belong to a signed-in customer, so no token means no checkout.
  const association = await requireCheckoutAssociation();
  if (!association.ok) {
    return { success: false, error: association.error, requiresAuth: association.authRequired };
  }

  if (!isValidCheckoutEmail(contact?.email)) {
    return { success: false, error: CHECKOUT_EMAIL_REQUIRED, requiresEmail: true };
  }

  // Pre-flight availability revalidation
  const variantIds = lines.map((l) => l.merchandiseId);
  const availability = await checkShopifyAvailability(variantIds);

  if (!availability.allAvailable && availability.unavailableIds.length > 0) {
    return {
      success: false,
      error:
        "Some items in this configuration are currently out of stock on Shopify. Please request an IT HUB quotation.",
    };
  }

  const returnUrl =
    typeof window !== "undefined" ? `${window.location.origin}/pc-builder` : undefined;

  // Initiate Shopify Cart
  const result = await createShopifyCart(lines, {
    attributes: [
      { key: "build_name", value: build.name },
      { key: "build_id", value: build.id },
      { key: "return_to_store", value: returnUrl || "" },
      { key: "_return_to_store", value: returnUrl || "" },
      { key: "_hub_assoc_token", value: association.token },
    ],
    note: `IT HUB Custom PC Build: ${build.name} (${lines.length} items)`,
    buyerIdentity: {
      email: contact?.email?.trim(),
      phone: contact?.phone || undefined,
    },
  });

  if (!result.cart?.checkoutUrl) {
    return {
      success: false,
      error:
        result.error ||
        "Unable to initiate Shopify checkout. Please try requesting a WhatsApp quotation.",
    };
  }

  return {
    success: true,
    checkoutUrl: result.cart.checkoutUrl,
  };
}

export interface QuotationMessageResult {
  referenceId: string;
  message: string;
  whatsappUrl: string;
}

/**
 * The customer's WhatsApp message to IT HUB: a quotation request with an estimate, never a confirmed quotation
 * or a confirmed compatibility (Stage 4A-5, the owner's approved wording). Priced as every screen prices it, and
 * the build's status is its assessment's: the page passes its own, with the use a Find My PC build was found for.
 */
export function generateWhatsAppQuotation(
  build: CanonicalBuild,
  whatsappPhone: string,
  options: { assessment?: BuildAssessment; assembly?: number } = {},
): QuotationMessageResult {
  const referenceId = `ITHUB-PC-${Date.now().toString(36).toUpperCase()}`;
  const components = build.components || {};
  const price = summariseBuildPrice(components, {
    ownedSlots: build.ownedSlots,
    assembly: options.assembly || 0,
  });
  const owned = new Set<string>([...(build.ownedSlots || []), ...price.ownedSlots]);
  // A build without a full summary (a stored or hand-made one) is checked here, purpose-neutral (D6).
  const summary: CompatibilitySummary = Array.isArray((build.compatibility as any)?.items)
    ? build.compatibility
    : checkCompatibility(components, { ownedSlots: [...owned] });
  const assessment =
    options.assessment ||
    assessBuild(components, summary, { ownedSlots: [...owned] as ComponentSlotId[] });

  // Each part in the builder's order: the customer's own, one no longer available, or its line total.
  const order = COMPONENT_SLOTS.map((slot) => slot.id as string);
  const slots = [
    ...order.filter((slot) => owned.has(slot) || (components as any)[slot]),
    ...Object.keys(components).filter((slot) => !order.includes(slot) && (components as any)[slot]),
  ];
  const partsList = slots.map((slot) => {
    const label = slotLabel(slot as ComponentSlotId);
    if (owned.has(slot)) return `• ${label}: (Already owned)`;
    const part = (components as any)[slot];
    if (price.unavailableSlots.includes(slot)) {
      return `• ${label}: ${part.title} — ${NO_LONGER_AVAILABLE}`;
    }
    const line = price.lines.find((item) => item.slot === slot);
    return `• ${label}: ${part.title} — ${money(line ? line.lineTotal : 0)}`;
  });

  const message = [
    WHATSAPP_HEADING,
    `Ref: ${referenceId}`,
    `Build Name: ${build.name}`,
    `Date: ${new Date().toLocaleDateString("en-IN")}`,
    ``,
    `*Selected Components:*`,
    ...partsList,
    ``,
    `Component Total: ${money(price.componentTotal)}`,
    `Assembly / Service Charge: ${price.assembly ? money(price.assembly) : ASSEMBLY_NOT_SET}`,
    `*Estimated Total: ${money(price.total)}*`,
    `Power Estimate: ~${summary.estimatedSystemLoadWatts}W (Rec. ${summary.recommendedPsuWatts}W PSU)`,
    `Build status: ${STATE_BADGE[assessment.state].label}`,
    WHATSAPP_ESTIMATE_NOTE,
    ``,
    `Hello IT HUB, please confirm component stock availability and provide your best quotation including assembly and testing at your Kothamangalam store.`,
  ].join("\n");

  // With no number configured, WhatsApp lets the customer choose who to send it to.
  const cleanPhone = (whatsappPhone || "").replace(/[^0-9]/g, "");
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  return {
    referenceId,
    message,
    whatsappUrl,
  };
}
