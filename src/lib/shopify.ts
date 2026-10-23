// src/lib/shopify.ts
// Production-Ready Shopify Storefront API Client & Environment Configuration
// IT HUB — Kerala, India (Phase 4)

import type { Product, ComponentOption } from "../data/catalog.ts"
import {
  mapShopifyProductToCatalog,
  mapShopifyVariantToPcComponent,
  toVariantGid,
  toProductGid,
  type ShopifyProductNode,
} from "./shopify-schema.ts"

/**
 * Validates whether a store domain follows Shopify domain conventions.
 * Supports *.myshopify.com or valid custom storefront domains.
 */
export function validateShopifyDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string") return false
  const trimmed = domain.trim().toLowerCase()
  if (
    trimmed.includes("..") ||
    trimmed.startsWith("-") ||
    trimmed.endsWith("-") ||
    trimmed.includes(":") ||
    trimmed.includes("/")
  ) {
    return false
  }
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.myshopify\.com|(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)$/.test(
    trimmed,
  )
}

/**
 * Normalizes store domain into a clean host (removes protocols, trailing slashes).
 */
export function normalizeShopifyDomain(domain: string): string {
  if (!domain) return ""
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase()
}

export interface ShopifyStorefrontConfig {
  storeDomain: string
  storefrontAccessToken: string
  apiVersion: string
  isConfigured: boolean
  endpoint: string
}

// Read public environment variables safely
const rawDomain = (
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_SHOPIFY_STORE_DOMAIN) ||
  ""
).trim()

const rawToken = (
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN) ||
  ""
).trim()

const rawVersion = (
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_SHOPIFY_API_VERSION) ||
  "2026-01"
).trim()

// Defensive security audit: Guard against accidental exposure of Admin API tokens
if (rawToken.startsWith("shpat_") || rawToken.startsWith("shpca_")) {
  console.error(
    "[Shopify Security Violation] A privileged Admin API Token was provided as a Storefront Access Token. " +
      "Admin tokens must NEVER be exposed in frontend code! Reverting to unconfigured state.",
  )
}

const isSafeToken =
  Boolean(rawToken) &&
  !rawToken.startsWith("shpat_") &&
  !rawToken.startsWith("shpca_")

const normalizedDomain = normalizeShopifyDomain(rawDomain)
const isConfigured = Boolean(
  normalizedDomain &&
    validateShopifyDomain(normalizedDomain) &&
    isSafeToken,
)

export const shopifyConfig: ShopifyStorefrontConfig = {
  storeDomain: normalizedDomain,
  storefrontAccessToken: isSafeToken ? rawToken : "",
  apiVersion: rawVersion || "2026-01",
  isConfigured,
  endpoint: normalizedDomain
    ? `https://${normalizedDomain}/api/${rawVersion || "2026-01"}/graphql.json`
    : "",
}

export interface GraphQLResponse<T = any> {
  data?: T
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>
  ok: boolean
  status?: number
  error?: string
}

/**
 * Executes a GraphQL query or mutation against Shopify's Storefront API.
 * Includes rate-limiting detection, network timeout, and safe error handling.
 */
export async function storefrontFetch<T = any>(
  query: string,
  variables: Record<string, any> = {},
  options: { timeoutMs?: number; customToken?: string; customEndpoint?: string } = {},
): Promise<GraphQLResponse<T>> {
  const endpoint = options.customEndpoint || shopifyConfig.endpoint
  const token = options.customToken || shopifyConfig.storefrontAccessToken

  if (!endpoint || !token) {
    return {
      ok: false,
      error:
        "Shopify Storefront client is not configured. Please supply VITE_SHOPIFY_STORE_DOMAIN and VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN.",
    }
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null
  const timeoutId =
    controller && options.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller ? controller.signal : undefined,
    })

    if (timeoutId) clearTimeout(timeoutId)

    const status = res.status

    if (status === 429) {
      return {
        ok: false,
        status,
        error:
          "Shopify Storefront API rate limit reached. Please retry after a brief pause.",
      }
    }

    if (status === 401 || status === 403) {
      return {
        ok: false,
        status,
        error:
          "Invalid or unauthorized Shopify Storefront Access Token. Please verify store credentials.",
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        status,
        error: `Shopify HTTP error: ${res.statusText || status}`,
      }
    }

    const json = await res.json()

    if (json.errors && json.errors.length > 0) {
      const errorMsg = json.errors.map((e: any) => e.message).join("; ")
      return {
        ok: false,
        status,
        data: json.data,
        errors: json.errors,
        error: errorMsg,
      }
    }

    return {
      ok: true,
      status,
      data: json.data,
    }
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId)
    const isAbort = err?.name === "AbortError"
    return {
      ok: false,
      error: isAbort
        ? "Shopify request timed out."
        : err?.message || "Failed to communicate with Shopify Storefront API.",
    }
  }
}

/**
 * Health check querying shop metadata to verify Storefront API connectivity.
 */
export async function checkShopifyStorefrontHealth(): Promise<{
  connected: boolean
  shopName?: string
  currency?: string
  error?: string
}> {
  if (!shopifyConfig.isConfigured) {
    return {
      connected: false,
      error: "Storefront environment variables are not configured.",
    }
  }

  const query = `
    query getShopMetadata {
      shop {
        name
        primaryDomain {
          host
        }
        paymentSettings {
          currencyCode
        }
      }
    }
  `

  const result = await storefrontFetch<{
    shop: {
      name: string
      primaryDomain: { host: string }
      paymentSettings: { currencyCode: string }
    }
  }>(query, {}, { timeoutMs: 8000 })

  if (!result.ok || !result.data?.shop) {
    return {
      connected: false,
      error: result.error || "Unable to retrieve Shopify shop details.",
    }
  }

  return {
    connected: true,
    shopName: result.data.shop.name,
    currency: result.data.shop.paymentSettings?.currencyCode,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storefront GraphQL Operations: Products & Collections
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query getProducts(
    $first: Int!
    $after: String
    $query: String
    $sortKey: ProductSortKeys
    $reverse: Boolean
  ) {
    products(
      first: $first
      after: $after
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          id
          title
          handle
          description
          descriptionHtml
          vendor
          productType
          tags
          availableForSale
          featuredImage {
            url
            altText
            width
            height
          }
          images(first: 20) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                sku
                availableForSale
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                }
              }
            }
          }
          metafields(
            identifiers: [
              { namespace: "custom", key: "condition" }
              { namespace: "custom", key: "warranty_summary" }
              { namespace: "custom", key: "hsn_code" }
              { namespace: "pc_builder", key: "socket" }
              { namespace: "pc_builder", key: "ram_generation" }
              { namespace: "pc_builder", key: "watts" }
              { namespace: "pc_builder", key: "capacity_watts" }
              { namespace: "pc_builder", key: "gpu_length_mm" }
              { namespace: "pc_builder", key: "cabinet_clearance_mm" }
              { namespace: "pc_builder", key: "storage_interface" }
              { namespace: "pc_builder", key: "wifi" }
              { namespace: "pc_builder", key: "bios_update_required" }
            ]
          ) {
            namespace
            key
            value
            type
          }
        }
      }
    }
  }
`

export interface ShopifyCatalogOptions {
  first?: number
  after?: string
  query?: string
  sortKey?: "TITLE" | "PRICE" | "CREATED_AT" | "BEST_SELLING" | "RELEVANCE"
  reverse?: boolean
}

export interface ShopifyCatalogResult {
  products: Product[]
  hasNextPage: boolean
  endCursor?: string
  isLive: boolean
  error?: string
}

/**
 * Fetches products from Shopify Storefront API and maps them to catalog Product models.
 */
export async function fetchShopifyCatalog(
  options: ShopifyCatalogOptions = {},
): Promise<ShopifyCatalogResult> {
  if (!shopifyConfig.isConfigured) {
    return {
      products: [],
      hasNextPage: false,
      isLive: false,
      error: "Shopify Storefront is not configured.",
    }
  }

  const variables = {
    first: options.first || 24,
    after: options.after || null,
    query: options.query || null,
    sortKey: options.sortKey || "RELEVANCE",
    reverse: Boolean(options.reverse),
  }

  const result = await storefrontFetch<{
    products: {
      pageInfo: { hasNextPage: boolean; endCursor?: string }
      edges: Array<{ cursor: string; node: ShopifyProductNode }>
    }
  }>(PRODUCTS_QUERY, variables)

  if (!result.ok || !result.data?.products) {
    return {
      products: [],
      hasNextPage: false,
      isLive: false,
      error: result.error || "Failed to load products from Shopify.",
    }
  }

  const edges = result.data.products.edges
  const mappedProducts = edges.map((e) => mapShopifyProductToCatalog(e.node))

  return {
    products: mappedProducts,
    hasNextPage: result.data.products.pageInfo.hasNextPage,
    endCursor: result.data.products.pageInfo.endCursor,
    isLive: true,
  }
}

/**
 * Fetches single product by handle from Shopify Storefront API.
 */
export async function fetchShopifyProductByHandle(
  handle: string,
): Promise<{ product: Product | null; error?: string }> {
  if (!shopifyConfig.isConfigured || !handle) {
    return { product: null, error: "Unconfigured or invalid handle." }
  }

  const query = `
    query getProductByHandle($handle: String!) {
      product(handle: $handle) {
        id
        title
        handle
        description
        descriptionHtml
        vendor
        productType
        tags
        availableForSale
        featuredImage {
          url
          altText
        }
        images(first: 20) {
          edges {
            node {
              url
              altText
            }
          }
        }
        variants(first: 20) {
          edges {
            node {
              id
              title
              sku
              availableForSale
              price {
                amount
                currencyCode
              }
              compareAtPrice {
                amount
                currencyCode
              }
              image {
                url
                altText
              }
            }
          }
        }
        metafields(
          identifiers: [
            { namespace: "custom", key: "condition" }
            { namespace: "custom", key: "warranty_summary" }
            { namespace: "custom", key: "hsn_code" }
          ]
        ) {
          namespace
          key
          value
          type
        }
      }
    }
  `

  const result = await storefrontFetch<{ product: ShopifyProductNode | null }>(
    query,
    { handle },
  )

  if (!result.ok || !result.data?.product) {
    return { product: null, error: result.error || "Product not found." }
  }

  return { product: mapShopifyProductToCatalog(result.data.product) }
}

/**
 * Fetches single product by ID or GID from Shopify Storefront API.
 */
export async function fetchShopifyProductById(
  idOrGid: string,
): Promise<{ product: Product | null; error?: string }> {
  if (!shopifyConfig.isConfigured || !idOrGid) {
    return { product: null, error: "Unconfigured or invalid ID." }
  }

  const gid = toProductGid(idOrGid)
  const query = `
    query getProductById($id: ID!) {
      node(id: $id) {
        ... on Product {
          id
          title
          handle
          description
          descriptionHtml
          vendor
          productType
          tags
          availableForSale
          featuredImage {
            url
            altText
          }
          images(first: 20) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 20) {
            edges {
              node {
                id
                title
                sku
                availableForSale
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                image {
                  url
                  altText
                }
              }
            }
          }
          metafields(
            identifiers: [
              { namespace: "custom", key: "condition" }
              { namespace: "custom", key: "warranty_summary" }
              { namespace: "custom", key: "hsn_code" }
            ]
          ) {
            namespace
            key
            value
            type
          }
        }
      }
    }
  `

  const result = await storefrontFetch<{ node: ShopifyProductNode | null }>(
    query,
    { id: gid },
  )

  if (!result.ok || !result.data?.node) {
    return { product: null, error: result.error || "Product not found." }
  }

  return { product: mapShopifyProductToCatalog(result.data.node) }
}

/**
 * Universal product resolver: resolves by ID, GID, or handle.
 */
export async function fetchShopifyProduct(
  idOrHandle: string,
): Promise<{ product: Product | null; error?: string }> {
  if (!idOrHandle) return { product: null, error: "Missing identifier." }
  if (/^\d+$/.test(idOrHandle) || idOrHandle.startsWith("gid://")) {
    const byId = await fetchShopifyProductById(idOrHandle)
    if (byId.product) return byId
  }
  return fetchShopifyProductByHandle(idOrHandle)
}

// ─────────────────────────────────────────────────────────────────────────────
// Storefront GraphQL Operations: Native Cart & Hosted Checkout
// ─────────────────────────────────────────────────────────────────────────────

export interface ShopifyCartLineInput {
  merchandiseId: string
  quantity: number
  attributes?: Array<{ key: string; value: string }>
}

export interface ShopifyCartSnapshot {
  id: string
  checkoutUrl: string
  totalQuantity: number
  subtotal: number
  total: number
  currency: string
}

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
        totalQuantity
        cost {
          subtotalAmount {
            amount
            currencyCode
          }
          totalAmount {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

/**
 * Creates a native Shopify cart with line items, returning authoritative checkout URL.
 */
export async function createShopifyCart(
  lines: ShopifyCartLineInput[],
): Promise<{ cart: ShopifyCartSnapshot | null; error?: string }> {
  if (!shopifyConfig.isConfigured) {
    return { cart: null, error: "Shopify Storefront is not configured." }
  }

  // Ensure merchandise IDs have the required GID format
  const formattedLines = lines.map((line) => ({
    merchandiseId: toVariantGid(line.merchandiseId),
    quantity: line.quantity,
    attributes: line.attributes || [],
  }))

  const result = await storefrontFetch<{
    cartCreate: {
      cart: {
        id: string
        checkoutUrl: string
        totalQuantity: number
        cost: {
          subtotalAmount: { amount: string; currencyCode: string }
          totalAmount: { amount: string; currencyCode: string }
        }
      } | null
      userErrors: Array<{ field: string[]; message: string }>
    }
  }>(CART_CREATE_MUTATION, { input: { lines: formattedLines } })

  if (!result.ok || !result.data?.cartCreate) {
    return { cart: null, error: result.error || "Failed to create Shopify cart." }
  }

  const { cart, userErrors } = result.data.cartCreate

  if (userErrors && userErrors.length > 0) {
    return { cart: null, error: userErrors.map((e) => e.message).join("; ") }
  }

  if (!cart) {
    return { cart: null, error: "Empty cart response from Shopify." }
  }

  return {
    cart: {
      id: cart.id,
      checkoutUrl: cart.checkoutUrl,
      totalQuantity: cart.totalQuantity,
      subtotal: parseFloat(cart.cost.subtotalAmount.amount),
      total: parseFloat(cart.cost.totalAmount.amount),
      currency: cart.cost.totalAmount.currencyCode,
    },
  }
}

const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id
        checkoutUrl
        totalQuantity
        cost {
          subtotalAmount {
            amount
            currencyCode
          }
          totalAmount {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

/**
 * Appends line items to an existing Shopify cart.
 */
export async function addShopifyCartLines(
  cartId: string,
  lines: ShopifyCartLineInput[],
): Promise<{ cart: ShopifyCartSnapshot | null; error?: string }> {
  if (!shopifyConfig.isConfigured || !cartId) {
    return { cart: null, error: "Unconfigured or invalid cartId." }
  }

  const formattedLines = lines.map((line) => ({
    merchandiseId: toVariantGid(line.merchandiseId),
    quantity: line.quantity,
    attributes: line.attributes || [],
  }))

  const result = await storefrontFetch<{
    cartLinesAdd: {
      cart: {
        id: string
        checkoutUrl: string
        totalQuantity: number
        cost: {
          subtotalAmount: { amount: string; currencyCode: string }
          totalAmount: { amount: string; currencyCode: string }
        }
      } | null
      userErrors: Array<{ field: string[]; message: string }>
    }
  }>(CART_LINES_ADD_MUTATION, { cartId, lines: formattedLines })

  if (!result.ok || !result.data?.cartLinesAdd) {
    return { cart: null, error: result.error || "Failed to update cart." }
  }

  const { cart, userErrors } = result.data.cartLinesAdd

  if (userErrors && userErrors.length > 0) {
    return { cart: null, error: userErrors.map((e) => e.message).join("; ") }
  }

  if (!cart) {
    return { cart: null, error: "Empty cart response from Shopify." }
  }

  return {
    cart: {
      id: cart.id,
      checkoutUrl: cart.checkoutUrl,
      totalQuantity: cart.totalQuantity,
      subtotal: parseFloat(cart.cost.subtotalAmount.amount),
      total: parseFloat(cart.cost.totalAmount.amount),
      currency: cart.cost.totalAmount.currencyCode,
    },
  }
}
