// src/lib/builder/checkout.ts
// IT HUB PC Builder Commerce & Quotation Finalization Layer
// Prepares Shopify multi-item cart checkouts and structured WhatsApp quotations.

import type { CanonicalBuild, ComponentSlotId } from "./types";
import { createShopifyCart, checkShopifyAvailability, shopifyConfig } from "../shopify";
import {
  CHECKOUT_EMAIL_REQUIRED,
  isValidCheckoutEmail,
  requireCheckoutAssociation,
} from "../shopify-orders";
import { money } from "../../data/catalog";

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
 * Generates a formal, structured quotation request for IT HUB Kothamangalam via WhatsApp.
 */
export function generateWhatsAppQuotation(
  build: CanonicalBuild,
  whatsappPhone: string,
): QuotationMessageResult {
  const referenceId = `ITHUB-PC-${Date.now().toString(36).toUpperCase()}`;
  const owned = new Set(build.ownedSlots || []);

  const partsList: string[] = [];
  let total = 0;

  for (const [slot, comp] of Object.entries(build.components)) {
    if (!comp) continue;
    const isOwned = owned.has(slot as ComponentSlotId);
    if (isOwned) {
      partsList.push(`• ${slot}: ${comp.title} (Already Owned)`);
    } else {
      partsList.push(`• ${slot}: ${comp.title} — ${money(comp.price)}`);
      total += comp.price * (comp.quantity || 1);
    }
  }

  const message = [
    `*IT HUB PC CONFIGURATION QUOTATION*`,
    `Ref: ${referenceId}`,
    `Build Name: ${build.name}`,
    `Date: ${new Date().toLocaleDateString("en-IN")}`,
    ``,
    `*Selected Components:*`,
    ...partsList,
    ``,
    `*Estimated Total: ${money(total)}*`,
    `Power Estimate: ~${build.compatibility.estimatedSystemLoadWatts}W (Rec. ${build.compatibility.recommendedPsuWatts}W PSU)`,
    `Compatibility Status: ${build.compatibility.valid ? "Verified Compatible" : "Requires Review"}`,
    ``,
    `Hello IT HUB, please confirm component stock availability and provide your best quotation including assembly and testing at your Kothamangalam store.`,
  ].join("\n");

  const cleanPhone = (whatsappPhone || "919074000000").replace(/[^0-9]/g, "");
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  return {
    referenceId,
    message,
    whatsappUrl,
  };
}
