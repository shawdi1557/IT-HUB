// supabase/functions/verify-and-submit-pc-quotation/resolve.ts
// Stage 4S-1: what Shopify says each submitted variant is. The browser's names, product IDs and slot claims are
// never taken on trust: the server asks Shopify for the variant, checks the answer is for that variant, and checks
// the product belongs in the slot it was sent for, using the builder's own slot rules (generated copy, see
// scripts/sync-server-builder.cjs).

import { classifyProductSlot, type SlotClassification } from "../_shared/builder/slot-detection.ts";
import type { ComponentSlotId } from "../_shared/builder/types.ts";

/**
 * One Storefront request for every variant to buy: identity, price, whether it can be bought, and the product
 * fields the builder places products by (type, tags, taxonomy category, collections), as the storefront reads them.
 * Stock counts aren't asked for: the Storefront token can't read them (`quantityAvailable` is refused without the
 * `unauthenticated_read_product_inventory` scope, checked 10 November 2026).
 */
export const VARIANT_QUERY = `
  query verifyQuotationVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        price {
          amount
          currencyCode
        }
        availableForSale
        currentlyNotInStock
        product {
          id
          title
          productType
          tags
          category {
            name
          }
          collections(first: 5) {
            edges {
              node {
                title
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * The category name the storefront files a product under, worked out as `resolveShopifyCategory` in
 * src/lib/shopify-schema.ts does: the taxonomy category, else the product type, else the first collection, else
 * "Uncategorized". The builder places products by this name, so the server must read it the same way.
 * `pc-builder-stage4s-resolve.test.ts` compares the two.
 */
export function storefrontCategory(product: any): string {
  const taxonomy = typeof product?.category?.name === "string" ? product.category.name.trim() : "";
  if (taxonomy) return taxonomy;
  const productType = typeof product?.productType === "string" ? product.productType.trim() : "";
  if (productType) return productType;
  const collection = (product?.collections?.edges || [])
    .map((edge: any) => (typeof edge?.node?.title === "string" ? edge.node.title.trim() : ""))
    .find(Boolean);
  return collection || "Uncategorized";
}

/** How the server read one Shopify answer for one part. */
export type VariantCheck =
  /** Shopify answered for a different variant: the answer can't be trusted, so nothing in it is used. */
  | { kind: "mismatched" }
  /** Shopify doesn't know the variant, or gave it no usable price. */
  | { kind: "unknown_variant" }
  | {
      kind: "resolved";
      price: number;
      productId: string | null;
      title: string | null;
      availableForSale: boolean;
      /** Shopify sells it while out of stock. Stock can't be confirmed, so a technician checks. */
      backordered: boolean;
      slot: SlotClassification;
    };

/** Checks one node against the variant it was asked for and the slot that variant was sent in. */
export function checkVariantNode(node: any, variantId: string, slot: string): VariantCheck {
  if (!node) return { kind: "unknown_variant" };
  if (node.id !== variantId) return { kind: "mismatched" };
  const amount = parseFloat(node?.price?.amount);
  if (!Number.isFinite(amount)) return { kind: "unknown_variant" };
  const product = node.product || {};
  return {
    kind: "resolved",
    price: Math.round(amount),
    productId: typeof product.id === "string" ? product.id : null,
    title: typeof product.title === "string" && product.title ? product.title : null,
    availableForSale: node.availableForSale !== false,
    backordered: node.currentlyNotInStock === true,
    slot: classifyProductSlot(
      {
        title: typeof product.title === "string" ? product.title : "",
        productType: typeof product.productType === "string" ? product.productType : "",
        tags: Array.isArray(product.tags)
          ? product.tags.filter((t: unknown) => typeof t === "string")
          : [],
        category: storefrontCategory(product),
      },
      slot as ComponentSlotId,
    ),
  };
}

/**
 * What a stored part records about the server's slot check, for the technician: confirmed by Shopify's own fields,
 * matched by title only (provisional, so the quotation goes to review), or unconfirmed.
 */
export function slotCheckLabel(
  slot: SlotClassification,
): "shopify_fields" | "title" | "unconfirmed" {
  return slot.kind === "match" ? slot.source : "unconfirmed";
}
