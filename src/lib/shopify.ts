// src/lib/shopify.ts
// Production-Ready Shopify Storefront API Client & Environment Configuration
// IT HUB — Kerala, India

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
    import.meta.env?.VITE_SHOPIFY_STORE_DOMAIN) ||
  ""
).trim()

const rawToken = (
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN) ||
  ""
).trim()

const rawVersion = (
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_SHOPIFY_API_VERSION) ||
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
