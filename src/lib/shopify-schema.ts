// src/lib/shopify-schema.ts
// Authoritative Shopify Storefront GraphQL Types & Data Mappers
// IT HUB — Kerala, India

import type { Product, ComponentOption, ProductCondition } from "../data/catalog.ts";

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

export function toProductGid(id: string | number): string {
  if (!id) return "";
  const str = String(id).trim();
  if (str.startsWith("gid://shopify/Product/")) {
    return str;
  }
  const cleanId = parseShopifyGid(str);
  return `gid://shopify/Product/${cleanId}`;
}

/**
 * Core Shopify Storefront GraphQL Interfaces
 */
export interface ShopifyMoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText?: string | null;
  width?: number;
  height?: number;
}

export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ShopifyProductOption {
  id?: string;
  name: string;
  values: string[];
}

export interface ShopifyTaxonomyCategory {
  id?: string;
  name: string;
  ancestors?: Array<{ id?: string; name: string }>;
}

export interface ShopifyCollectionNode {
  id: string;
  title: string;
  handle: string;
}

export interface ShopifyProductVariantNode {
  id: string;
  title: string;
  sku?: string | null;
  availableForSale: boolean;
  quantityAvailable?: number | null;
  price: ShopifyMoneyV2;
  compareAtPrice?: ShopifyMoneyV2 | null;
  selectedOptions?: Array<{ name: string; value: string }>;
  image?: ShopifyImage | null;
  metafields?: Array<ShopifyMetafield | null>;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  handle: string;
  description: string;
  descriptionHtml?: string;
  vendor: string;
  productType: string;
  tags: string[];
  availableForSale: boolean;
  category?: ShopifyTaxonomyCategory | null;
  collections?: {
    edges: Array<{ node: ShopifyCollectionNode }>;
  };
  options?: ShopifyProductOption[];
  featuredImage?: ShopifyImage | null;
  images: {
    edges: Array<{ node: ShopifyImage }>;
  };
  variants: {
    edges: Array<{ node: ShopifyProductVariantNode }>;
  };
  metafields?: Array<ShopifyMetafield | null>;
}

/**
 * Extracts a typed metafield value from an array of metafields.
 */
export function getMetafield(
  metafields: Array<ShopifyMetafield | null | undefined> | undefined,
  namespace: string,
  key: string,
): string | undefined {
  if (!metafields || !Array.isArray(metafields)) return undefined;
  const match = metafields.find((m) => m && m.namespace === namespace && m.key === key);
  return match?.value;
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

/**
 * Derives valid catalog ProductCondition from Shopify tags and metafields
 */
export function resolveProductCondition(
  tags: string[],
  metafields?: Array<ShopifyMetafield | null | undefined>,
): ProductCondition {
  const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, " ");

  const conditionMeta = getMetafield(metafields, "custom", "condition");
  if (conditionMeta) {
    const norm = normalize(conditionMeta);
    if (norm.includes("like new")) return "Like New";
    if (norm.includes("fair")) return "Fair";
    if (norm.includes("parts")) return "For Parts";
    if (
      norm.includes("refurbished") ||
      norm.includes("good") ||
      norm.includes("pre owned") ||
      norm.includes("used")
    ) {
      return "Good";
    }
    if (norm.includes("new")) return "New";
  }

  for (const t of tags) {
    const norm = normalize(t);
    if (norm.includes("like new")) return "Like New";
    if (norm.includes("fair")) return "Fair";
    if (norm.includes("parts")) return "For Parts";
    if (
      norm.includes("refurbished") ||
      norm.includes("good") ||
      norm.includes("pre owned") ||
      norm.includes("second hand") ||
      norm.includes("used")
    ) {
      return "Good";
    }
  }

  return "New";
}

/**
 * Whether Shopify states a device's grade. A tag like "Used" says it's pre-owned, not what state
 * it's in, so a grade is only shown to customers when this is true.
 */
export function isConditionGradeStated(
  tags: string[],
  metafields?: Array<ShopifyMetafield | null | undefined>,
): boolean {
  const statements = [getMetafield(metafields, "custom", "condition") || "", ...tags];
  return statements.some((text) =>
    /\b(?:like new|good|fair|for parts)\b/.test(text.toLowerCase().replace(/[-_]/g, " ")),
  );
}

/**
 * Resolves product category, preserving taxonomy category, productType, and collections distinctly.
 * - Authoritative category: Shopify Standard Product Taxonomy (category.name).
 *   If ancestors are present, builds a full hierarchical name (e.g. "Smart Phones in Mobile & Smart Phones").
 * - Honest fallback: productType if present, then first non-empty collection, then "Uncategorized".
 * - Never claims a fallback is an official taxonomy category.
 */
export function resolveShopifyCategory(node: ShopifyProductNode): {
  category: string;
  categorySource: "taxonomy" | "productType" | "collection" | "fallback";
  taxonomyCategory?: {
    id?: string;
    name: string;
    fullName?: string;
    ancestors?: string[];
  };
  productType?: string;
  collections?: string[];
} {
  const collectionList = (node.collections?.edges || [])
    .map((e) => e.node?.title?.trim())
    .filter(Boolean) as string[];

  const trimmedProductType = (node.productType || "").trim();
  const taxCat = node.category;

  if (taxCat && taxCat.name && taxCat.name.trim()) {
    const catName = taxCat.name.trim();
    const ancestorNames = (taxCat.ancestors || [])
      .map((a) => a.name?.trim())
      .filter(Boolean) as string[];
    const immediateParent = ancestorNames.length > 0 ? ancestorNames[0] : undefined;
    const fullName = immediateParent ? `${catName} in ${immediateParent}` : catName;

    return {
      category: catName,
      categorySource: "taxonomy",
      taxonomyCategory: {
        id: taxCat.id,
        name: catName,
        fullName,
        ancestors: ancestorNames,
      },
      productType: trimmedProductType || undefined,
      collections: collectionList.length > 0 ? collectionList : undefined,
    };
  }

  if (trimmedProductType) {
    return {
      category: trimmedProductType,
      categorySource: "productType",
      taxonomyCategory: undefined,
      productType: trimmedProductType,
      collections: collectionList.length > 0 ? collectionList : undefined,
    };
  }

  if (collectionList.length > 0) {
    return {
      category: collectionList[0],
      categorySource: "collection",
      taxonomyCategory: undefined,
      productType: undefined,
      collections: collectionList,
    };
  }

  return {
    category: "Uncategorized",
    categorySource: "fallback",
    taxonomyCategory: undefined,
    productType: undefined,
    collections: undefined,
  };
}

/**
 * Detects whether a vendor or brand string represents the store/retailer identity (IT HUB)
 * rather than a genuine hardware manufacturer.
 */
export function isRetailerIdentity(val: string | null | undefined): boolean {
  if (!val) return false;
  const norm = val
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, "");
  return (
    norm === "ithub" ||
    norm === "ithubkerala" ||
    norm === "ithubkmgm" ||
    norm === "ithubkothamangalam" ||
    norm.startsWith("ithub")
  );
}

/**
 * Normalizes manufacturer brand capitalization to canonical industry standards.
 */
const CANONICAL_BRAND_CASING: Record<string, string> = {
  apple: "Apple",
  samsung: "Samsung",
  oneplus: "OnePlus",
  iqoo: "iQOO",
  poco: "Poco",
  oppo: "Oppo",
  vivo: "Vivo",
  redmi: "Redmi",
  realme: "Realme",
  motorola: "Motorola",
  google: "Google",
  nothing: "Nothing",
  lenovo: "Lenovo",
  amd: "AMD",
  nvidia: "NVIDIA",
  intel: "Intel",
  mivi: "Mivi",
  hp: "HP",
  dell: "Dell",
  asus: "ASUS",
  msi: "MSI",
  gigabyte: "Gigabyte",
  corsair: "Corsair",
  crucial: "Crucial",
  kingston: "Kingston",
  seagate: "Seagate",
  "western digital": "Western Digital",
  wd: "WD",
  logitech: "Logitech",
  boat: "boAt",
  canon: "Canon",
  epson: "Epson",
  acer: "Acer",
  lg: "LG",
  sony: "Sony",
  "tp-link": "TP-Link",
  tplink: "TP-Link",
};

export function normalizeBrandName(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (CANONICAL_BRAND_CASING[lower]) {
    return CANONICAL_BRAND_CASING[lower];
  }
  // Title-case single lowercase words
  if (/^[a-z0-9]+$/.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return trimmed;
}

export interface BrandResolutionResult {
  brand: string;
  brandSource: "vendor" | "metafield" | "tag" | "provenance" | "unspecified";
  isRetailerVendor: boolean;
  requiresReview: boolean;
}

/**
 * Resolves the genuine manufacturer brand for a Shopify product.
 * - Prioritizes manufacturer brand metafields and brand tags.
 * - Uses Shopify `vendor` when it represents a real manufacturer.
 * - Strictly avoids using store/retailer identity (IT-HUB) as a manufacturer brand.
 * - Accurately derives manufacturer brand for genuine trademarked hardware lines (iPhone, iPad, Legion, Ryzen, RTX, etc.)
 *   when vendor is mistakenly set to the retailer.
 * - Flags unbranded or uncertain products for manual review and leaves brand blank/unspecified instead of guessing.
 */
export function resolveManufacturerBrand(node: ShopifyProductNode): BrandResolutionResult {
  // 1. Explicit manufacturer brand metafield
  const brandMeta =
    getMetafield(node.metafields, "custom", "brand") ||
    getMetafield(node.metafields, "custom", "manufacturer") ||
    getMetafield(node.metafields, "shopify", "brand");

  if (brandMeta && brandMeta.trim()) {
    const clean = brandMeta.trim();
    if (!isRetailerIdentity(clean)) {
      return {
        brand: normalizeBrandName(clean),
        brandSource: "metafield",
        isRetailerVendor: false,
        requiresReview: false,
      };
    }
  }

  // 2. Explicit Brand tag (e.g. "brand:Apple" or tag matching known manufacturer)
  if (node.tags && Array.isArray(node.tags)) {
    for (const tag of node.tags) {
      if (/^brand[:=]/i.test(tag)) {
        const val = tag.replace(/^brand[:=]\s*/i, "").trim();
        if (val && !isRetailerIdentity(val)) {
          return {
            brand: normalizeBrandName(val),
            brandSource: "tag",
            isRetailerVendor: false,
            requiresReview: false,
          };
        }
      }
    }
  }

  // 3. Shopify Vendor (when NOT the retailer/store identity)
  const rawVendor = (node.vendor || "").trim();
  const isRetailer = isRetailerIdentity(rawVendor);

  if (rawVendor && !isRetailer) {
    return {
      brand: normalizeBrandName(rawVendor),
      brandSource: "vendor",
      isRetailerVendor: false,
      requiresReview: false,
    };
  }

  // 4. Authoritative Manufacturer Provenance Detection
  // Used only when vendor is missing or set to the retailer identity (e.g. IT-HUB)
  const fullText = `${node.title || ""} ${node.handle || ""} ${node.description || ""} ${(node.tags || []).join(" ")}`;

  // Apple: iPhone, iPad, MacBook, iMac, Mac mini, Mac Studio, Apple Watch, AirPods, MagSafe
  if (
    /\b(iphone|ipad|macbook|imac|mac\s*mini|mac\s*studio|airpods|apple\s*watch)\b/i.test(
      node.title,
    ) ||
    /\bapple\s*magsafe\b/i.test(fullText) ||
    /\b(a\d{2}\s*bionic|apple\s*silicon)\b/i.test(fullText)
  ) {
    return {
      brand: "Apple",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // Lenovo: Lenovo, ThinkPad, IdeaPad, Legion
  if (/\blenovo\b/i.test(node.title) || /\blegion\b/i.test(node.title)) {
    return {
      brand: "Lenovo",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // AMD: Ryzen, Radeon, Threadripper, EPYC
  if (/\b(amd\s*ryzen|ryzen\s*\d|radeon|threadripper|epyc)\b/i.test(node.title)) {
    return {
      brand: "AMD",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // NVIDIA: GeForce, RTX, GTX
  if (/\b(nvidia|geforce|rtx\s*\d{4}|gtx\s*\d{4}|rtx\s*5050)\b/i.test(node.title)) {
    return {
      brand: "NVIDIA",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // Intel: Core i3/i5/i7/i9, Core Ultra, Xeon
  if (/\b(intel|core\s*i[3579]|core\s*ultra|xeon)\b/i.test(node.title)) {
    return {
      brand: "Intel",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // Samsung: Galaxy, Samsung
  if (/\b(samsung|galaxy)\b/i.test(node.title)) {
    return {
      brand: "Samsung",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // Google: Pixel
  if (/\bpixel\b/i.test(node.title)) {
    return {
      brand: "Google",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // OnePlus: OnePlus, Nord
  if (/\b(oneplus|nord)\b/i.test(node.title)) {
    return {
      brand: "OnePlus",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // Nothing: Nothing Phone, Nothing CMF
  if (/\bnothing\b/i.test(node.title)) {
    return {
      brand: "Nothing",
      brandSource: "provenance",
      isRetailerVendor: isRetailer,
      requiresReview: false,
    };
  }

  // 5. Unspecified / Uncertain Brand:
  // Must remain unknown or blank until verified in Shopify; never default to IT HUB.
  return {
    brand: "",
    brandSource: "unspecified",
    isRetailerVendor: isRetailer,
    requiresReview: true,
  };
}

/**
 * Maps a Shopify Product + Variant node into IT HUB's frontend Product interface.
 * Preserves MRP (original), condition, genuine warranty badges, and category classifications.
 */
export function mapShopifyProductToCatalog(
  node: ShopifyProductNode,
  variantIndex: number = 0,
): Product {
  const variantNode = node.variants.edges[variantIndex]?.node || node.variants.edges[0]?.node;

  const sellingPrice = variantNode ? parseFloat(variantNode.price.amount) : 0;

  const compareAtPrice = variantNode?.compareAtPrice
    ? parseFloat(variantNode.compareAtPrice.amount)
    : sellingPrice;

  const original = compareAtPrice > sellingPrice ? compareAtPrice : sellingPrice;

  const condition = resolveProductCondition(node.tags, node.metafields);
  const isSecondHand = condition !== "New";

  // Only warranty information stated in Shopify. A missing value stays missing.
  const warrantyMeta = getMetafield(node.metafields, "custom", "warranty_summary") || undefined;

  // Collect all unique product imagery from Shopify (variants, featured, and gallery edges)
  const rawImageUrls: string[] = [];
  if (variantNode?.image?.url && !rawImageUrls.includes(variantNode.image.url)) {
    rawImageUrls.push(variantNode.image.url);
  }
  if (node.featuredImage?.url && !rawImageUrls.includes(node.featuredImage.url)) {
    rawImageUrls.push(node.featuredImage.url);
  }
  if (node.images?.edges && Array.isArray(node.images.edges)) {
    for (const edge of node.images.edges) {
      const u = edge?.node?.url;
      if (u && !rawImageUrls.includes(u)) {
        rawImageUrls.push(u);
      }
    }
  }

  const primaryImage = rawImageUrls[0] || "/assets/placeholder-product.png";

  const productImages = rawImageUrls.length > 0 ? rawImageUrls : [primaryImage];

  const specs = parseProductSpecs(node.tags, node.metafields);
  const specKeysFromTags = tagSpecKeys(node.tags, node.metafields);

  const isAvailable = variantNode
    ? Boolean(variantNode.availableForSale)
    : Boolean(node.availableForSale ?? true);

  // Map product options (filter out single dummy option "Title: Default Title")
  const productOptions = (node.options || [])
    .filter(
      (opt) =>
        !(opt.name === "Title" && opt.values.length === 1 && opt.values[0] === "Default Title"),
    )
    .map((opt) => ({
      id: opt.id,
      name: opt.name,
      values: opt.values || [],
    }));

  // Map all variants for multi-variant selection
  const mappedVariants = (node.variants?.edges || []).map((e) => {
    const v = e.node;
    const vPrice = parseFloat(v.price.amount);
    const vCompareAt = v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : vPrice;
    return {
      id: v.id,
      title: v.title,
      price: vPrice,
      compareAtPrice: vCompareAt,
      sku: v.sku || undefined,
      availableForSale: Boolean(v.availableForSale),
      selectedOptions: v.selectedOptions || [],
      image: v.image?.url || undefined,
    };
  });

  const categoryInfo = resolveShopifyCategory(node);
  const brandInfo = resolveManufacturerBrand(node);

  return {
    id: parseShopifyGid(node.id),
    name: node.title,
    brand: brandInfo.brand,
    brandSource: brandInfo.brandSource,
    brandFlaggedForReview: brandInfo.requiresReview,
    category: categoryInfo.category,
    categorySource: categoryInfo.categorySource,
    taxonomyCategory: categoryInfo.taxonomyCategory,
    productType: categoryInfo.productType,
    collections: categoryInfo.collections,
    price: sellingPrice,
    original,
    image: primaryImage,
    images: productImages,
    stock: variantNode?.quantityAvailable ?? (isAvailable ? 10 : 0),
    rating: 0, // Product ratings aren't implemented, so none is claimed
    specs,
    sku: variantNode?.sku || undefined,
    description: node.description || undefined,
    descriptionHtml: node.descriptionHtml || undefined,
    warranty: warrantyMeta,
    secondHand: isSecondHand,
    condition,
    conditionStated: isConditionGradeStated(node.tags, node.metafields),
    tagSpecKeys: specKeysFromTags.length > 0 ? specKeysFromTags : undefined,
    tag: compareAtPrice > sellingPrice ? "Deal" : undefined,
    status: "Active",
    handle: node.handle,
    variantId: variantNode?.id,
    tags: node.tags || [],
    availableForSale: isAvailable,
    options: productOptions.length > 0 ? productOptions : undefined,
    variants: mappedVariants.length > 0 ? mappedVariants : undefined,
  };
}

/**
 * Maps a Shopify Product Variant with PC Builder metafields into a ComponentOption.
 * Used for socket, TDP, interface, and wattage compatibility calculations in Builder.tsx.
 */
export function mapShopifyVariantToPcComponent(
  node: ShopifyProductNode,
  variantIndex: number = 0,
): ComponentOption | null {
  const variant = node.variants.edges[variantIndex]?.node || node.variants.edges[0]?.node;
  if (!variant) return null;

  // Read pc_builder metafields
  const socket = getMetafield(node.metafields, "pc_builder", "socket");
  const ramGen = getMetafield(node.metafields, "pc_builder", "ram_generation");
  const wattsStr = getMetafield(node.metafields, "pc_builder", "watts");
  const capacityWattsStr = getMetafield(node.metafields, "pc_builder", "capacity_watts");
  const gpuLengthStr = getMetafield(node.metafields, "pc_builder", "gpu_length_mm");
  const clearanceStr = getMetafield(node.metafields, "pc_builder", "cabinet_clearance_mm");
  const storageIface = getMetafield(node.metafields, "pc_builder", "storage_interface");
  const biosStr = getMetafield(node.metafields, "pc_builder", "bios_update_required");
  const wifiStr = getMetafield(node.metafields, "pc_builder", "wifi");

  return {
    id: parseShopifyGid(variant.id),
    name: node.title,
    price: parseFloat(variant.price.amount),
    socket: socket || undefined,
    ram: ramGen || undefined,
    watts: wattsStr ? parseInt(wattsStr, 10) : undefined,
    capacity: capacityWattsStr ? parseInt(capacityWattsStr, 10) : undefined,
    length: gpuLengthStr ? parseInt(gpuLengthStr, 10) : undefined,
    clearance: clearanceStr ? parseInt(clearanceStr, 10) : undefined,
    interface: storageIface || undefined,
    bios: biosStr === "true",
    wifi: wifiStr === "true",
    stock: variant.availableForSale ? (variant.quantityAvailable ?? 5) : 0,
  };
}
