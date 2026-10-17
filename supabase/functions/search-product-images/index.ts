// supabase/functions/search-product-images/index.ts
// Secure SerpApi Google Images Discovery & Storage Proxy
// Enforces Admin-only authorization, SSRF protection, raster magic-byte validation, and second-hand guards.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts"

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
          sourceCategory: "Official Manufacturer Website (Candidate Only)",
          licenceEvidence: `Official manufacturer asset host: ${host}. Candidate identity verified; commercial reuse permissions must be established before publishing.`,
        }
      }
    }

    for (const d of AUTHORIZED_DISTRIBUTORS) {
      if (host.includes(d)) {
        return {
          licenceType: "Distributor_Feed",
          sourceCategory: "Authorized National IT Distributor",
          licenceEvidence: `National wholesale IT distributor partner: ${host}. Candidate asset requires reseller authorization verification.`,
        }
      }
    }

    return {
      licenceType: "Unverified_Web",
      sourceCategory: "Third-Party Marketplace / Retailer (Pending Review)",
      licenceEvidence: `Source: ${host}. Commercial-use rights unclear. Candidate remains pending review until verified.`,
    }
  } catch {
    return {
      licenceType: "Unverified_Web",
      sourceCategory: "Unverified Web Source (Pending Review)",
      licenceEvidence:
        "Commercial redistribution rights unverified. Candidate remains pending review.",
    }
  }
}

async function ensureBucket(adminClient: any): Promise<boolean> {
  try {
    const { data: buckets } = await adminClient.storage.listBuckets()
    const exists = buckets?.some(
      (b: any) => b.name === "product-images" || b.id === "product-images",
    )
    if (!exists) {
      const { error } = await adminClient.storage.createBucket(
        "product-images",
        {
          public: true,
          fileSizeLimit: 5242880,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        },
      )
      if (error && !error.message?.includes("already exists")) {
        console.warn("Could not create bucket product-images:", error.message)
        return false
      }
    }
    return true
  } catch (err) {
    console.warn("ensureBucket error:", err)
    return false
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
      const envKeys = Object.keys(Deno.env.toObject())
      return new Response(
        JSON.stringify({
          ok: true,
          provider: "serpapi-google-images",
          isConfigured,
          envKeys,
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

    // ── Action: Initialize Storage Bucket ────────────────────────────────────
    if (action === "init-storage") {
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const adminClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
        )
        const ok = await ensureBucket(adminClient)
        return new Response(JSON.stringify({ ok, bucket: "product-images" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return new Response(
        JSON.stringify({ ok: false, error: "CONFIGURATION_ERROR" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // ── Action: Apply Table Grants for Authenticated & Service Role ─────────
    if (action === "fix-grants") {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL")
      if (!dbUrl) {
        return new Response(JSON.stringify({ ok: false, error: "NO_DB_URL" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      try {
        const client = new Client(dbUrl)
        await client.connect()
        await client.queryArray(`
          GRANT ALL ON TABLE public.products TO service_role;
          GRANT ALL ON TABLE public.product_images TO service_role;
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_images TO authenticated;
          
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Product Images Public Read'
            ) THEN
              CREATE POLICY "Product Images Public Read" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
            END IF;

            IF NOT EXISTS (
              SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Product Images Admin Insert'
            ) THEN
              CREATE POLICY "Product Images Admin Insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images' AND is_admin());
            END IF;

            IF NOT EXISTS (
              SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Product Images Admin Update'
            ) THEN
              CREATE POLICY "Product Images Admin Update" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images' AND is_admin()) WITH CHECK (bucket_id = 'product-images' AND is_admin());
            END IF;

            IF NOT EXISTS (
              SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Product Images Admin Delete'
            ) THEN
              CREATE POLICY "Product Images Admin Delete" ON storage.objects FOR DELETE USING (bucket_id = 'product-images' AND is_admin());
            END IF;
          END $$;
        `)
        await client.end()
        return new Response(
          JSON.stringify({ ok: true, message: "Grants applied successfully" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // ── Action: Ensure Fresh Product in Database ─────────────────────────────
    if (action === "ensure-product") {
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const adminClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
        )
        const product = payload.product || {}
        const sku = String(payload.sku || product.sku || "").trim()
        if (!sku) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "BAD_REQUEST",
              message: "sku is required",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          )
        }

        const { data: upserted, error: upsertErr } = await adminClient
          .from("products")
          .upsert(
            {
              sku,
              name: String(product.name || product.productName || sku),
              brand_id:
                product.brand_id || "20000000-0000-0000-0000-000000000003",
              category_id:
                product.category_id || "10000000-0000-0000-0000-000000000001",
              price: Number(product.price || 49999.0),
              mrp: Number(product.mrp || 56999.0),
              second_hand: Boolean(product.second_hand || product.isSecondHand),
              condition: product.condition || "New",
              status: "Active",
            },
            { onConflict: "sku" },
          )
          .select("id, sku, name, second_hand")
          .single()

        if (upsertErr) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "DB_ERROR",
              message: upsertErr.message,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          )
        }

        return new Response(JSON.stringify({ ok: true, product: upserted }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // ── Action: Upload Physical Photo for Second-Hand Item ───────────────────
    if (action === "upload-manual-photo") {
      const sku = String(payload.sku || "").trim()
      const base64Data = String(payload.base64Data || "").trim()
      const position = Number(payload.position ?? 0)

      if (!sku || !base64Data) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "BAD_REQUEST",
            message: "sku and base64Data are required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      let bytes: Uint8Array
      try {
        const cleanBase64 = base64Data.replace(
          /^data:image\/[a-z]+;base64,/i,
          "",
        )
        const binaryStr = atob(cleanBase64)
        bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
      } catch {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "INVALID_BASE64",
            message: "Malformed image base64 data",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      if (bytes.length > 5 * 1024 * 1024) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "FILE_TOO_LARGE",
            message: "File exceeds 5MB size limit",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      const rasterCheck = detectRasterMagicBytes(bytes)
      if (!rasterCheck.valid || !rasterCheck.mime || !rasterCheck.ext) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "INVALID_FORMAT",
            message:
              "File failed magic-byte verification. Only authentic JPEG, PNG, or WebP images are permitted.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const adminClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
        )
        await ensureBucket(adminClient)

        const storagePath = `products/second-hand/${sku.toLowerCase()}/photo-${Date.now()}-${position}.${rasterCheck.ext}`

        const { error: upErr } = await adminClient.storage
          .from("product-images")
          .upload(storagePath, bytes, {
            contentType: rasterCheck.mime,
            upsert: true,
          })

        if (upErr) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "STORAGE_UPLOAD_FAILED",
              message: upErr.message,
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

        let dbImageId: string | null = null
        try {
          const { data: dbProd } = await adminClient
            .from("products")
            .select("id")
            .eq("sku", sku)
            .maybeSingle()

          if (dbProd?.id) {
            const { data: insImg } = await adminClient
              .from("product_images")
              .insert({
                product_id: dbProd.id,
                storage_path: storagePath,
                position,
              })
              .select("id")
              .maybeSingle()
            dbImageId = insImg?.id || null
          }
        } catch (dbErr) {
          console.warn(
            "Could not insert product_images for manual photo:",
            dbErr,
          )
        }

        return new Response(
          JSON.stringify({
            ok: true,
            storagePath: pubData?.publicUrl || storagePath,
            sku,
            format: rasterCheck.mime,
            sizeBytes: bytes.length,
            position,
            dbImageId,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
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
      const timeoutId = setTimeout(() => controller.abort(), 18000)

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
              ? "SerpApi request timed out after 18000ms"
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

      // Second-hand safeguard: Strictly prevent automated web image storage for pre-owned items
      if (
        sku.toUpperCase().startsWith("SH-") ||
        Boolean(payload.isSecondHand)
      ) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "SECOND_HAND_RESTRICTED",
            message:
              "Second-hand products mandate physical admin photo uploads. Automated web image storage is prohibited.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Check database if product is marked second-hand
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const checkClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
          const { data: dbProd } = await checkClient
            .from("products")
            .select("second_hand")
            .eq("sku", sku)
            .maybeSingle()

          if (dbProd?.second_hand) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: "SECOND_HAND_RESTRICTED",
                message:
                  "Second-hand products mandate physical admin photo uploads. Automated web image storage is prohibited.",
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            )
          }
        } catch {
          // ignore
        }
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
        await ensureBucket(adminClient)

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

        // If product exists in database, link to product_images table
        let dbImageId: string | null = null
        try {
          const { data: dbProd } = await adminClient
            .from("products")
            .select("id")
            .eq("sku", sku)
            .maybeSingle()

          let prodId = dbProd?.id
          if (!prodId && payload.product) {
            const p = payload.product
            const { data: createdProd } = await adminClient
              .from("products")
              .insert({
                sku,
                name: String(p.name || p.productName || sku),
                brand_id: p.brand_id || "20000000-0000-0000-0000-000000000003",
                category_id:
                  p.category_id || "10000000-0000-0000-0000-000000000001",
                price: Number(p.price || 49999.0),
                mrp: Number(p.mrp || 56999.0),
                second_hand: false,
                condition: "New",
                status: "Active",
              })
              .select("id")
              .maybeSingle()
            prodId = createdProd?.id
          }

          if (prodId) {
            const { data: existingImg } = await adminClient
              .from("product_images")
              .select("id")
              .eq("product_id", prodId)
              .eq("storage_path", storagePath)
              .maybeSingle()

            if (!existingImg) {
              const { data: insertedImg } = await adminClient
                .from("product_images")
                .insert({
                  product_id: prodId,
                  storage_path: storagePath,
                  position: Number(payload.position ?? 0),
                })
                .select("id")
                .maybeSingle()
              dbImageId = insertedImg?.id || null
            } else {
              dbImageId = existingImg.id
            }
          }
        } catch (dbErr) {
          console.warn("Could not link product_images record:", dbErr)
        }

        return new Response(
          JSON.stringify({
            ok: true,
            storagePath: pubData?.publicUrl || storagePath,
            sku,
            format: rasterCheck.mime,
            sizeBytes: bytes.length,
            dbImageId,
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
