// GENERATED from src/lib/builder/shopify-fields.ts by scripts/sync-server-builder.cjs. Don't edit: change the source and
// run `node scripts/sync-server-builder.cjs`. Only ".ts" is added to relative imports.

// src/lib/builder/shopify-fields.ts
// How a Shopify product's IDs, tags and metafields are read. Moved unchanged from src/lib/shopify-schema.ts (which
// still exports them) in Stage 4S-2, so the quotation server reads a product's specifications with exactly the code
// the storefront uses. Pure: no browser or network dependency.

export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
  updatedAt?: string;
}

/**
 * Shopify GraphQL Global ID prefix utilities
 */
export function parseShopifyGid(gid: string): string {
  if (!gid) return "";
  const parts = gid.split("/");
  return parts[parts.length - 1] || gid;
}

export function toVariantGid(id: string | number): string {
  if (!id) return "";
  const str = String(id).trim();
  if (str.startsWith("gid://shopify/ProductVariant/")) {
    return str;
  }
  // Sanitize if a Product GID was mistakenly passed
  const cleanId = parseShopifyGid(str);
  return `gid://shopify/ProductVariant/${cleanId}`;
}

/**
 * Maps Shopify tags and metafields to structured specs Record<string, string>
 */
export function parseProductSpecs(
  tags: string[],
  metafields?: Array<ShopifyMetafield | null | undefined>,
): Record<string, string> {
  const specs: Record<string, string> = {};

  // Parse key:value or key=value tags
  for (const tag of tags) {
    if (tag.includes(":")) {
      const idx = tag.indexOf(":");
      const key = tag.slice(0, idx).trim();
      const val = tag.slice(idx + 1).trim();
      if (key && val) specs[key] = val;
    } else if (tag.includes("=")) {
      const idx = tag.indexOf("=");
      const key = tag.slice(0, idx).trim();
      const val = tag.slice(idx + 1).trim();
      if (key && val) specs[key] = val;
    }
  }

  // Overlay metafields. A pc_builder value wins over the same key in another namespace.
  if (metafields) {
    for (const m of metafields) {
      if (m?.key && m?.value && m.namespace !== "pc_builder") specs[m.key] = m.value;
    }
    for (const m of metafields) {
      if (m?.key && m?.value && m.namespace === "pc_builder") specs[m.key] = m.value;
    }
  }

  return specs;
}

/** The spec keys that only a tag supplied. A tag can describe a product, but never states a spec. */
export function tagSpecKeys(
  tags: string[],
  metafields?: Array<ShopifyMetafield | null | undefined>,
): string[] {
  const fromMetafields = new Set((metafields || []).filter((m) => m?.value).map((m) => m!.key));
  return Object.keys(parseProductSpecs(tags)).filter((key) => !fromMetafields.has(key));
}

/** When each pc_builder value last changed, or undefined if Shopify didn't say. */
export function specUpdatedTimes(
  metafields?: Array<ShopifyMetafield | null | undefined>,
): Record<string, string> | undefined {
  const entries = (metafields || [])
    .filter((m) => m?.namespace === "pc_builder" && m.value && m.updatedAt)
    .map((m) => [m!.key, m!.updatedAt!]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
