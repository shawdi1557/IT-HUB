// supabase/functions/search-product-images/index.ts
// Secure SerpApi Google Images Discovery & Storage Proxy
// Enforces Admin-only authorization, SSRF protection, raster magic-byte validation, and second-hand guards.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const SERPAPI_API_KEY =
  Deno.env.get("SERPAPI_API_KEY") || Deno.env.get("SERPAPI_KEY") || ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// ── In-Memory Search Cache (15-minute TTL, max 100 entries) ─────────────────
interface CacheEntry {
  timestamp: number
  results: unknown[]
}
const searchCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

function getCachedResults(cacheKey: string): unknown[] | null {
  const entry = searchCache.get(cacheKey)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(cacheKey)
    return null
  }
  return entry.results
}

function setCachedResults(cacheKey: string, results: unknown[]): void {
  if (searchCache.size > 100) {
    const oldestKey = searchCache.keys().next().value
    if (oldestKey) searchCache.delete(oldestKey)
  }
  searchCache.set(cacheKey, { timestamp: Date.now(), results })
}

// ── Security Helpers: SSRF Defense & Raster Validation ──────────────────────

export interface SafeUrlResult {
  valid: boolean
  reason?: string
}

export interface RasterMagicBytesResult {
  valid: boolean
  mime?: string
  ext?: string
}

export function isSafeImageUrl(urlStr: string): SafeUrlResult {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: false, reason: "Empty or invalid URL" }
  }

  try {
    const url = new URL(urlStr)
    if (url.protocol !== "https:") {
      return {
        valid: false,
        reason: "Strict HTTPS required. Unencrypted HTTP is prohibited.",
      }
    }

    const host = url.hostname.toLowerCase()
    const forbidden = [
      "localhost",
      "127.",
      "0.0.0.0",
      "169.254.", // Cloud metadata service (AWS/GCP)
      "10.", // RFC 1918 Class A
      "172.16.",
      "172.17.",
      "172.18.",
      "172.19.",
      "172.20.",
      "172.21.",
      "172.22.",
      "172.23.",
      "172.24.",
      "172.25.",
      "172.26.",
      "172.27.",
      "172.28.",
      "172.29.",
      "172.30.",
      "172.31.",
      "192.168.", // RFC 1918 Class C
      "::1",
      "fe80:",
      "metadata.google.internal",
    ]

    for (const pattern of forbidden) {
      if (host.includes(pattern)) {
        return {
          valid: false,
          reason: `Forbidden target host "${host}" (SSRF Defense)`,
        }
      }
    }

    // Prohibit SVG or executable scripts (Stored XSS defense)
    const ext = url.pathname.split(".").pop()?.toLowerCase()
    if (ext && ["svg", "exe", "js", "html", "php", "sh", "bat"].includes(ext)) {
      return {
        valid: false,
        reason: `Unsafe file extension .${ext} is prohibited.`,
      }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: "Malformed URL syntax" }
  }
}

export function detectRasterMagicBytes(
  bytes: Uint8Array,
): RasterMagicBytesResult {
  if (!bytes || bytes.length < 12) return { valid: false }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, mime: "image/jpeg", ext: "jpg" }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { valid: true, mime: "image/png", ext: "png" }
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, mime: "image/webp", ext: "webp" }
  }

  return { valid: false }
}

// Known authorized manufacturer and distributor domains
const OFFICIAL_MANUFACTURERS = [
  "hp.com",
  "apple.com",
  "lenovo.com",
  "acer.com",
  "dell.com",
  "asus.com",
  "boat-lifestyle.com",
  "tp-link.com",
  "hikvision.com",
  "kingston.com",
  "crucial.com",
  "seagate.com",
  "westerndigital.com",
  "xprinter.net",
  "canon.co.in",
  "epson.co.in",
  "brother.in",
  "samsung.com",
  "lg.com",
  "logitech.com",
]

const AUTHORIZED_DISTRIBUTORS = [
  "savex.in",
  "redingtongroup.com",
  "ingrammicro.com",
  "rashiperipherals.com",
]

export function assessLicenceAndEvidence(
  sourceUrl: string,
): {
  licenceType: string
  sourceCategory: string
  licenceEvidence: string
} {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase()

    for (const m of OFFICIAL_MANUFACTURERS) {
      if (host.includes(m)) {
        return {
          licenceType: "Manufacturer_Authorized",
          sourceCategory: "Official Manufacturer Website",
          licenceEvidence: `Verified manufacturer digital asset host: ${host}`,
        }
      }
    }

    for (const d of AUTHORIZED_DISTRIBUTORS) {
      if (host.includes(d)) {
        return {
          licenceType: "Distributor_Feed",
          sourceCategory: "Authorized National IT Distributor",
          licenceEvidence: `National wholesale IT distributor partner: ${host}`,
        }
      }
    }

    return {
      licenceType: "Unverified_Web",
      sourceCategory: "Third-Party Marketplace / Retailer",
      licenceEvidence: `Source: ${host}. Commercial redistribution rights unverified. Admin rights review required.`,
    }
  } catch {
    return {
      licenceType: "Unverified_Web",
      sourceCategory: "Unverified Web Source",
      licenceEvidence:
        "Commercial redistribution rights unverified. Admin review required.",
    }
  }
}

// ── Main Request Handler ────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "METHOD_NOT_ALLOWED",
        message: "Only POST requests are supported",
      }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  try {
    const payload = await req.json().catch(() => ({}))
    const action = payload.action || "search"

    // ── Action: Status / Health Check ───────────────────────────────────────
    // Does not perform billable searches or leak secrets; returns provider readiness
    if (action === "status") {
      const isConfigured = Boolean(
        SERPAPI_API_KEY && SERPAPI_API_KEY.trim().length > 0,
      )
      return new Response(
        JSON.stringify({
          ok: true,
          provider: "serpapi-google-images",
          isConfigured,
          message: isConfigured
            ? "SerpApi Google Images provider is active."
            : "SERPAPI_API_KEY secret is not configured in Supabase Edge Functions.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // ── Protected Actions Authorization Gate (search & fetch-and-store) ──────
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "").trim()

    if (!authHeader || !token) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "UNAUTHORIZED",
          message: "Missing or empty Authorization header",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    let isAuthorizedAdmin = false

    // 1. Verify if caller holds Supabase Service Role key (internal backend)
    if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
      isAuthorizedAdmin = true
    }

    // 2. Verify if caller holds an authenticated Admin User session
    if (!isAuthorizedAdmin && SUPABASE_URL && SUPABASE_ANON_KEY) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser(token)

      if (userError || !user) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "UNAUTHORIZED",
            message: "Invalid or expired authorization token",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Query profile role using caller's authenticated session
      const userAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: profile } = await userAuthClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()

      if (profile?.role === "admin") {
        isAuthorizedAdmin = true
      } else if (SUPABASE_SERVICE_ROLE_KEY) {
        const adminClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
        )
        const { data: adminProfile } = await adminClient
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()

        if (adminProfile?.role === "admin") {
          isAuthorizedAdmin = true
        }
      }
    }

    if (!isAuthorizedAdmin) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "FORBIDDEN",
          message:
            "Admin authorization required to perform search or store images",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // ── Action: Search Product Images via SerpApi ────────────────────────────
    if (action === "search") {
      if (!SERPAPI_API_KEY || SERPAPI_API_KEY.trim().length === 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "CONFIGURATION_REQUIRED",
            message:
              "SerpApi API key is not configured in Supabase Edge Function secrets. Set SERPAPI_API_KEY to enable Google Images search.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      const productObj =
        payload.product && typeof payload.product === "object"
          ? payload.product
          : {}
      const sku = String(payload.sku || productObj.sku || "").trim()
      const query = String(payload.query || productObj.query || "").trim()
      const brand = String(payload.brand || productObj.brand || "").trim()
      const modelMpn = String(
        payload.modelMpn || productObj.modelMpn || "",
      ).trim()
      const productName = String(
        payload.productName || productObj.productName || "",
      ).trim()
      const originalDescription = String(
        payload.originalDescription || productObj.originalDescription || "",
      ).trim()
      const condition = String(
        payload.condition || productObj.condition || "",
      ).trim()

      const isSecondHand =
        Boolean(payload.isSecondHand || productObj.isSecondHand) ||
        sku.toUpperCase().startsWith("SH-") ||
        (condition.length > 0 && condition.toLowerCase() !== "new") ||
        /\b(second[- ]?hand|pre[- ]?owned|refurbished|used)\b/i.test(query) ||
        /\b(second[- ]?hand|pre[- ]?owned|refurbished|used)\b/i.test(
          productName,
        ) ||
        /\b(second[- ]?hand|pre[- ]?owned|refurbished|used)\b/i.test(
          originalDescription,
        )

      if (!sku) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "BAD_REQUEST",
            message: "Product SKU is required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Second-hand safeguard: Never allow automated search for pre-owned items
      if (isSecondHand) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "SECOND_HAND_RESTRICTED",
            message:
              "Second-hand products mandate physical admin photo uploads. Automated search is prohibited.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Check database if SKU corresponds to a second-hand product
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const userAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
          })
          const { data: dbProd } = await userAuthClient
            .from("products")
            .select("second_hand, condition")
            .eq("sku", sku)
            .maybeSingle()

          if (
            dbProd?.second_hand ||
            (dbProd?.condition && dbProd.condition !== "New")
          ) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: "SECOND_HAND_RESTRICTED",
                message:
                  "Second-hand products mandate physical admin photo uploads. Automated search is prohibited.",
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            )
          }
        } catch {
          // Continue if DB check fails
        }
      }

      if (!query) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "BAD_REQUEST",
            message: "Search query string is required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Check cache first
      const cacheKey = `${sku}:${query}`
      const cached = getCachedResults(cacheKey)
      if (cached) {
        return new Response(
          JSON.stringify({
            ok: true,
            cached: true,
            query,
            results: cached,
            candidates: cached,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Call SerpApi Google Images API
      const serpUrl = new URL("https://serpapi.com/search.json")
      serpUrl.searchParams.set("engine", "google_images")
      serpUrl.searchParams.set("q", query)
      serpUrl.searchParams.set("gl", "in") // India region
      serpUrl.searchParams.set("hl", "en")
      serpUrl.searchParams.set("safe", "active")
      serpUrl.searchParams.set("api_key", SERPAPI_API_KEY)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      let serpRes: Response
      try {
        serpRes = await fetch(serpUrl.toString(), { signal: controller.signal })
      } catch (err) {
        clearTimeout(timeoutId)
        const isTimeout = err instanceof Error && err.name === "AbortError"
        return new Response(
          JSON.stringify({
            ok: false,
            error: isTimeout ? "GATEWAY_TIMEOUT" : "FETCH_ERROR",
            message: isTimeout
              ? "SerpApi request timed out after 8000ms"
              : String(err),
          }),
          {
            status: 504,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
      clearTimeout(timeoutId)

      if (!serpRes.ok) {
        const errorText = await serpRes.text()
        return new Response(
          JSON.stringify({
            ok: false,
            error: "SERPAPI_ERROR",
            message: `SerpApi responded with HTTP ${serpRes.status}: ${errorText.slice(0, 200)}`,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      const data = await serpRes.json()
      if (data.error) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "SERPAPI_ERROR",
            message: data.error,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      const imagesResults = Array.isArray(data.images_results)
        ? data.images_results
        : []
      const candidates = []

      for (let i = 0; i < Math.min(imagesResults.length, 6); i++) {
        const item = imagesResults[i]
        const originalUrl = item.original || item.thumbnail || ""
        const sourcePageUrl = item.link || ""
        const title = item.title || ""
        const sourceDomain = item.source || ""
        const width = item.original_width || 0
        const height = item.original_height || 0

        // Security check
        const urlCheck = isSafeImageUrl(originalUrl)
        if (!urlCheck.valid) {
          continue // Skip unsafe candidate
        }

        // Assess confidence and rights
        const { licenceType, sourceCategory, licenceEvidence } =
          assessLicenceAndEvidence(sourcePageUrl)

        const titleLower = title.toLowerCase()
        const brandMatch = brand && titleLower.includes(brand.toLowerCase())
        const modelMatch =
          modelMpn &&
          modelMpn !== "N/A" &&
          titleLower.includes(modelMpn.toLowerCase())

        let confidence = 0.5
        if (brandMatch && modelMatch) confidence = 0.95
        else if (modelMatch) confidence = 0.85
        else if (brandMatch) confidence = 0.7

        if (licenceType === "Manufacturer_Authorized")
          confidence = Math.min(1.0, confidence + 0.05)

        const status =
          confidence >= 0.9
            ? "identity_verified"
            : confidence >= 0.7
              ? "candidate_found"
              : "needs_review"

        candidates.push({
          id: `cand-${sku}-${i + 1}`,
          sku,
          candidateUrl: originalUrl,
          thumbnailUrl: item.thumbnail || originalUrl,
          sourcePageUrl,
          sourcePageTitle: title,
          sourceDomain,
          sourceCategory,
          searchQuery: query,
          dimensions: width && height ? { width, height } : undefined,
          confidence,
          status,
          licenceType,
          licenceEvidence,
          matchEvidence:
            brandMatch && modelMatch
              ? `Exact Brand (${brand}) and Model/MPN (${modelMpn}) confirmed in search title.`
              : brandMatch
                ? `Brand (${brand}) matched. Model number requires manual review.`
                : "Generic search keyword match. Staff verification required.",
        })
      }

      // Cache results
      setCachedResults(cacheKey, candidates)

      return new Response(
        JSON.stringify({
          ok: true,
          cached: false,
          query,
          results: candidates,
          candidates,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // ── Action: Fetch, Validate & Store Approved Image ──────────────────────
    if (action === "fetch-and-store") {
      const sku = String(payload.sku || "").trim()
      const candidateUrl = String(payload.candidateUrl || "").trim()
      const rightsConfirmed = Boolean(payload.rightsConfirmed)

      if (!sku || !candidateUrl) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "BAD_REQUEST",
            message: "sku and candidateUrl are required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Commercial rights confirmation mandatory
      if (!rightsConfirmed) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "RIGHTS_UNCONFIRMED",
            message:
              "Commercial reuse rights must be explicitly confirmed by the admin before storing.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // SSRF check
      const urlCheck = isSafeImageUrl(candidateUrl)
      if (!urlCheck.valid) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "SECURITY_VIOLATION",
            message: urlCheck.reason,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Fetch image with timeout and 5MB limit
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      let imgRes: Response
      try {
        imgRes = await fetch(candidateUrl, { signal: controller.signal })
      } catch (err) {
        clearTimeout(timeoutId)
        return new Response(
          JSON.stringify({
            ok: false,
            error: "FETCH_FAILED",
            message: String(err),
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
      clearTimeout(timeoutId)

      if (!imgRes.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "FETCH_FAILED",
            message: `HTTP ${imgRes.status} from image host`,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      const arrayBuffer = await imgRes.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)

      if (bytes.length > 5 * 1024 * 1024) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "FILE_TOO_LARGE",
            message: "Image exceeds 5MB size limit",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Magic-byte raster validation
      const rasterCheck = detectRasterMagicBytes(bytes)
      if (!rasterCheck.valid || !rasterCheck.mime || !rasterCheck.ext) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "INVALID_FORMAT",
            message:
              "File header failed magic-byte verification. Only authentic JPEG, PNG, and WebP images are allowed.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      const storagePath = `products/${sku.toLowerCase()}/primary.${rasterCheck.ext}`

      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const adminClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
        )
        const { error: uploadErr } = await adminClient.storage
          .from("product-images")
          .upload(storagePath, bytes, {
            contentType: rasterCheck.mime,
            upsert: true,
          })

        if (uploadErr) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "STORAGE_UPLOAD_FAILED",
              message: uploadErr.message,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          )
        }

        const { data: pubData } = adminClient.storage
          .from("product-images")
          .getPublicUrl(storagePath)

        return new Response(
          JSON.stringify({
            ok: true,
            storagePath: pubData?.publicUrl || storagePath,
            sku,
            format: rasterCheck.mime,
            sizeBytes: bytes.length,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Fallback if running without live Supabase storage
      return new Response(
        JSON.stringify({
          ok: true,
          storagePath: candidateUrl,
          sku,
          format: rasterCheck.mime,
          sizeBytes: bytes.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: "UNKNOWN_ACTION",
        message: `Action '${action}' is not supported`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "INTERNAL_ERROR",
        message: String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
})
