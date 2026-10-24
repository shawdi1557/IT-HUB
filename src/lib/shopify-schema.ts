// src/lib/shopify-schema.ts
// Authoritative Shopify Storefront GraphQL Types & Data Mappers
// IT HUB — Kerala, India

import type { Product, ComponentOption, ProductCondition } from "../data/catalog.ts"

/**
 * Shopify GraphQL Global ID prefix utilities
 */
export function parseShopifyGid(gid: string): string {
  if (!gid) return ""
  const parts = gid.split("/")
  return parts[parts.length - 1] || gid
}

export function toVariantGid(id: string | number): string {
  if (!id) return ""
  const str = String(id).trim()
  if (str.startsWith("gid://shopify/ProductVariant/")) {
    return str
  }
  // Sanitize if a Product GID was mistakenly passed
  const cleanId = parseShopifyGid(str)
  return `gid://shopify/ProductVariant/${cleanId}`
}

export function toProductGid(id: string | number): string {
  if (!id) return ""
  const str = String(id).trim()
  if (str.startsWith("gid://shopify/Product/")) {
    return str
  }
  const cleanId = parseShopifyGid(str)
  return `gid://shopify/Product/${cleanId}`
}

/**
 * Core Shopify Storefront GraphQL Interfaces
 */
export interface ShopifyMoneyV2 {
  amount: string
  currencyCode: string
}

export interface ShopifyImage {
  url: string
  altText?: string | null
  width?: number
  height?: number
}

export interface ShopifyMetafield {
  namespace: string
  key: string
  value: string
  type: string
}

export interface ShopifyProductVariantNode {
  id: string
  title: string
  sku?: string | null
  availableForSale: boolean
  quantityAvailable?: number | null
  price: ShopifyMoneyV2
  compareAtPrice?: ShopifyMoneyV2 | null
  selectedOptions?: Array<{ name: string; value: string }>
  image?: ShopifyImage | null
  metafields?: Array<ShopifyMetafield | null>
}

export interface ShopifyProductNode {
  id: string
  title: string
  handle: string
  description: string
  descriptionHtml?: string
  vendor: string
  productType: string
  tags: string[]
  availableForSale: boolean
  featuredImage?: ShopifyImage | null
  images: {
    edges: Array<{ node: ShopifyImage }>
  }
  variants: {
    edges: Array<{ node: ShopifyProductVariantNode }>
  }
  metafields?: Array<ShopifyMetafield | null>
}

/**
 * Extracts a typed metafield value from an array of metafields.
 */
export function getMetafield(
  metafields: Array<ShopifyMetafield | null | undefined> | undefined,
  namespace: string,
  key: string,
): string | undefined {
  if (!metafields || !Array.isArray(metafields)) return undefined
  const match = metafields.find(
    (m) => m && m.namespace === namespace && m.key === key,
  )
  return match?.value
}

/**
 * Maps Shopify tags and metafields to structured specs Record<string, string>
 */
export function parseProductSpecs(
  tags: string[],
  metafields?: Array<ShopifyMetafield | null | undefined>,
): Record<string, string> {
  const specs: Record<string, string> = {}

  // Parse key:value or key=value tags
  for (const tag of tags) {
    if (tag.includes(":")) {
      const idx = tag.indexOf(":")
      const key = tag.slice(0, idx).trim()
      const val = tag.slice(idx + 1).trim()
      if (key && val) specs[key] = val
    } else if (tag.includes("=")) {
      const idx = tag.indexOf("=")
      const key = tag.slice(0, idx).trim()
      const val = tag.slice(idx + 1).trim()
      if (key && val) specs[key] = val
    }
  }

  // Overlay pc_builder and custom metafields
  if (metafields) {
    for (const m of metafields) {
      if (m?.key && m?.value) {
        specs[m.key] = m.value
      }
    }
  }

  return specs
}

/**
 * Derives valid catalog ProductCondition from Shopify tags and metafields
 */
export function resolveProductCondition(
  tags: string[],
  metafields?: Array<ShopifyMetafield | null | undefined>,
): ProductCondition {
  const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, " ")

  const conditionMeta = getMetafield(metafields, "custom", "condition")
  if (conditionMeta) {
    const norm = normalize(conditionMeta)
    if (norm.includes("like new")) return "Like New"
    if (norm.includes("fair")) return "Fair"
    if (norm.includes("parts")) return "For Parts"
    if (norm.includes("refurbished") || norm.includes("good") || norm.includes("pre owned") || norm.includes("used")) {
      return "Good"
    }
    if (norm.includes("new")) return "New"
  }

  for (const t of tags) {
    const norm = normalize(t)
    if (norm.includes("like new")) return "Like New"
    if (norm.includes("fair")) return "Fair"
    if (norm.includes("parts")) return "For Parts"
    if (norm.includes("refurbished") || norm.includes("good") || norm.includes("pre owned") || norm.includes("second hand") || norm.includes("used")) {
      return "Good"
    }
  }

  return "New"
}

/**
 * Maps a Shopify Product + Variant node into IT HUB's frontend Product interface.
 * Preserves MRP (original), condition, genuine warranty badges, and category classifications.
 */
export function mapShopifyProductToCatalog(
  node: ShopifyProductNode,
  variantIndex: number = 0,
): Product {
  const variantNode = node.variants.edges[variantIndex]?.node || node.variants.edges[0]?.node

  const sellingPrice = variantNode
    ? parseFloat(variantNode.price.amount)
    : 0

  const compareAtPrice = variantNode?.compareAtPrice
    ? parseFloat(variantNode.compareAtPrice.amount)
    : sellingPrice

  const original = compareAtPrice > sellingPrice ? compareAtPrice : sellingPrice

  const condition = resolveProductCondition(node.tags, node.metafields)
  const isSecondHand = condition !== "New"

  // Warranty resolution
  const warrantyMeta =
    getMetafield(node.metafields, "custom", "warranty_summary") ||
    (condition === "New" ? "1-Year Official Manufacturer Warranty" : "90-Day IT HUB Testing Warranty")

  // Collect all unique product imagery from Shopify (variants, featured, and gallery edges)
  const rawImageUrls: string[] = []
  if (variantNode?.image?.url && !rawImageUrls.includes(variantNode.image.url)) {
    rawImageUrls.push(variantNode.image.url)
  }
  if (node.featuredImage?.url && !rawImageUrls.includes(node.featuredImage.url)) {
    rawImageUrls.push(node.featuredImage.url)
  }
  if (node.images?.edges && Array.isArray(node.images.edges)) {
    for (const edge of node.images.edges) {
      const u = edge?.node?.url
      if (u && !rawImageUrls.includes(u)) {
        rawImageUrls.push(u)
      }
    }
  }

  const primaryImage =
    rawImageUrls[0] ||
    "/assets/placeholder-product.png"

  const productImages = rawImageUrls.length > 0 ? rawImageUrls : [primaryImage]

  const specs = parseProductSpecs(node.tags, node.metafields)

  const isAvailable = variantNode
    ? Boolean(variantNode.availableForSale)
    : Boolean(node.availableForSale ?? true)

  return {
    id: parseShopifyGid(node.id),
    name: node.title,
    brand: node.vendor || "IT HUB",
    category: node.productType || "Hardware & Electronics",
    price: sellingPrice,
    original,
    image: primaryImage,
    images: productImages,
    stock: variantNode?.quantityAvailable ?? (isAvailable ? 10 : 0),
    rating: 4.8, // Baseline verified store rating
    specs,
    sku: variantNode?.sku || undefined,
    description: node.description || undefined,
    descriptionHtml: node.descriptionHtml || undefined,
    warranty: warrantyMeta,
    secondHand: isSecondHand,
    condition,
    tag: compareAtPrice > sellingPrice ? "Deal" : undefined,
    status: "Active",
    handle: node.handle,
    variantId: variantNode?.id,
    availableForSale: isAvailable,
  }
}

/**
 * Maps a Shopify Product Variant with PC Builder metafields into a ComponentOption.
 * Used for socket, TDP, interface, and wattage compatibility calculations in Builder.tsx.
 */
export function mapShopifyVariantToPcComponent(
  node: ShopifyProductNode,
  variantIndex: number = 0,
): ComponentOption | null {
  const variant = node.variants.edges[variantIndex]?.node || node.variants.edges[0]?.node
  if (!variant) return null

  // Read pc_builder metafields
  const socket = getMetafield(node.metafields, "pc_builder", "socket")
  const ramGen = getMetafield(node.metafields, "pc_builder", "ram_generation")
  const wattsStr = getMetafield(node.metafields, "pc_builder", "watts")
  const capacityWattsStr = getMetafield(node.metafields, "pc_builder", "capacity_watts")
  const gpuLengthStr = getMetafield(node.metafields, "pc_builder", "gpu_length_mm")
  const clearanceStr = getMetafield(node.metafields, "pc_builder", "cabinet_clearance_mm")
  const storageIface = getMetafield(node.metafields, "pc_builder", "storage_interface")
  const biosStr = getMetafield(node.metafields, "pc_builder", "bios_update_required")
  const wifiStr = getMetafield(node.metafields, "pc_builder", "wifi")

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
  }
}
