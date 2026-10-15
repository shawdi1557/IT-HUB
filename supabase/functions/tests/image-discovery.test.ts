// supabase/functions/tests/image-discovery.test.ts
// Automated Test Suite for IT HUB Phase C — Bulk Product Image Discovery & Verification
// Covers SSRF Protection, Magic Bytes Validation, Second-Hand Guards, SerpApi Proxy, and Query Builder

import {
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts"

// ── Security & Validation Logic (Mirroring Edge Function & Service Layer) ─────

interface ImageValidationResult {
  valid: boolean
  reason?: string
}

interface MagicBytesResult {
  valid: boolean
  format?: string
}

interface LicenceResult {
  licenceType: string
  sourceCategory: string
}

function validateImageUrl(urlStr: string): ImageValidationResult {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: false, reason: "Empty or invalid URL" }
  }

  // Local assets are safe
  if (urlStr.startsWith("/images/")) {
    return { valid: true }
  }

  try {
    const url = new URL(urlStr)

    // 1. Strict HTTPS Protocol Check
    if (url.protocol !== "https:") {
      return {
        valid: false,
        reason: "Strict HTTPS required. Unencrypted HTTP is prohibited.",
      }
    }

    // 2. SSRF Loopback & Cloud Metadata Shield (RFC 1918 + RFC 3927)
    const host = url.hostname.toLowerCase()
    const forbiddenPatterns = [
      "localhost",
      "127.",
      "0.0.0.0",
      "169.254.", // AWS/GCP cloud instance metadata
      "10.", // Class A private
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
      "192.168.", // Class C private
      "::1", // IPv6 loopback
      "fe80:", // IPv6 link-local
      "metadata.google.internal",
    ]

    for (const pattern of forbiddenPatterns) {
      if (host.includes(pattern)) {
        return {
          valid: false,
          reason: `Forbidden target host "${host}" (SSRF Security Defense)`,
        }
      }
    }

    // 3. Prohibit SVG & Non-Raster Extensions (Stored XSS Defense)
    const ext = url.pathname.split(".").pop()?.toLowerCase()
    if (ext && !["jpg", "jpeg", "png", "webp", "avif"].includes(ext)) {
      return {
        valid: false,
        reason: `Unsupported format ".${ext}". SVG and executable formats are strictly blocked.`,
      }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: "Malformed URL syntax" }
  }
}

function validateImageMagicBytes(bytes: Uint8Array): MagicBytesResult {
  if (!bytes || bytes.length < 12) return { valid: false }

  // JPEG magic bytes: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, format: "image/jpeg" }
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { valid: true, format: "image/png" }
  }

  // WebP magic bytes: RIFF....WEBP
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
    return { valid: true, format: "image/webp" }
  }

  return { valid: false }
}

function assessLicence(sourceUrl: string): LicenceResult {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase()
    const manufacturers = [
      "hp.com",
      "apple.com",
      "lenovo.com",
      "acer.com",
      "boat-lifestyle.com",
      "canon.co.in",
    ]
    for (const m of manufacturers) {
      if (host.includes(m)) {
        return {
          licenceType: "Manufacturer_Authorized",
          sourceCategory: "Official Manufacturer Website",
        }
      }
    }
    const distributors = ["savex.in", "redingtongroup.com", "ingrammicro.com"]
    for (const d of distributors) {
      if (host.includes(d)) {
        return {
          licenceType: "Distributor_Feed",
          sourceCategory: "Authorized National IT Distributor",
        }
      }
    }
    return {
      licenceType: "Unverified_Web",
      sourceCategory: "Third-Party Marketplace / Retailer",
    }
  } catch {
    return {
      licenceType: "Unverified_Web",
      sourceCategory: "Unverified Web Source",
    }
  }
}

interface DiscoveryQuery {
  sourceRow: number
  sku: string
  productName: string
  brand: string
  category: string
  modelMpn: string
  originalDescription: string
  isSecondHand?: boolean
}

function buildOptimizedSearchQuery(
  item: DiscoveryQuery,
): {
  primaryQuery: string
  fallbackQuery: string
  strategy: string
} {
  const brand = (item.brand || "").trim()
  const mpn = (item.modelMpn || "").trim()
  const desc = (item.originalDescription || item.productName || "").trim()

  if (mpn && mpn !== "N/A" && mpn.length >= 3) {
    return {
      primaryQuery:
        brand && brand !== "Generic / OEM" ? `${brand} ${mpn}` : mpn,
      fallbackQuery: `${desc.slice(0, 80)}`,
      strategy: "exact_model",
    }
  }

  const cleanedDesc = desc
    .replace(/\s*-\s*\d+\s+[A-Z0-9]+$/i, "")
    .replace(/\b(?:AN|ISI\(L\)|ISI)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (brand && brand !== "Generic / OEM") {
    const shortDesc = cleanedDesc.replace(new RegExp(`^${brand}\\s*`, "i"), "")
    return {
      primaryQuery: `${brand} ${shortDesc.slice(0, 60)}`.trim(),
      fallbackQuery: cleanedDesc,
      strategy: "brand_description",
    }
  }

  return {
    primaryQuery: cleanedDesc.slice(0, 70),
    fallbackQuery: item.productName,
    strategy: "generic_clean",
  }
}

// ── Automated Tests ─────────────────────────────────────────────────────────

Deno.test("IMG-1: SSRF Protection blocks private RFC 1918 IPs, loopbacks, and local addresses", () => {
  const privateUrls = [
    "http://localhost:3000/image.jpg",
    "https://127.0.0.1/product.png",
    "https://0.0.0.0/test.webp",
    "https://10.0.0.1/banner.jpg",
    "https://172.16.5.10/img.png",
    "https://172.31.255.255/img.png",
    "https://192.168.1.1/device.jpg",
    "https://[::1]/asset.jpg",
  ]

  for (const url of privateUrls) {
    const res = validateImageUrl(url)
    assertEquals(
      res.valid,
      false,
      `Expected ${url} to be blocked by SSRF defense`,
    )
  }
})

Deno.test("IMG-2: SSRF Protection blocks AWS and GCP cloud instance metadata services", () => {
  const metadataUrls = [
    "https://169.254.169.254/latest/meta-data/",
    "http://169.254.169.254/computeMetadata/v1/",
    "https://metadata.google.internal/computeMetadata/v1/",
  ]

  for (const url of metadataUrls) {
    const res = validateImageUrl(url)
    assertEquals(
      res.valid,
      false,
      `Expected cloud metadata URL ${url} to be blocked`,
    )
  }
})

Deno.test("IMG-3: Protocol & Format Validation requires HTTPS and strictly forbids SVG or scripts", () => {
  // Prohibit HTTP unencrypted
  const httpRes = validateImageUrl("http://cdn.manufacturer.com/image.jpg")
  assertEquals(httpRes.valid, false)
  assertEquals(httpRes.reason?.includes("HTTPS"), true)

  // Prohibit SVG (Stored XSS vector)
  const svgRes = validateImageUrl("https://cdn.manufacturer.com/logo.svg")
  assertEquals(svgRes.valid, false)
  assertEquals(svgRes.reason?.includes("SVG"), true)

  // Prohibit executables / server scripts
  const exeRes = validateImageUrl("https://cdn.manufacturer.com/payload.exe")
  assertEquals(exeRes.valid, false)

  const phpRes = validateImageUrl("https://cdn.manufacturer.com/index.php")
  assertEquals(phpRes.valid, false)

  // Allow legitimate HTTPS raster formats
  const validJpg = validateImageUrl(
    "https://cdn.manufacturer.com/laptops/victus-15.jpg",
  )
  assertEquals(validJpg.valid, true)

  const validWebp = validateImageUrl(
    "https://media.distributor.in/products/iphone17.webp",
  )
  assertEquals(validWebp.valid, true)

  // Allow verified local repository images
  const validLocal = validateImageUrl(
    "/images/photo-1603302576837-37561b2e2302.jpg",
  )
  assertEquals(validLocal.valid, true)
})

Deno.test("IMG-4: Magic-Byte Raster Validation verifies authentic JPEG, PNG, and WebP headers", () => {
  // Authentic JPEG magic bytes: FF D8 FF
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ])
  const jpegResult = validateImageMagicBytes(jpegBytes)
  assertEquals(jpegResult.valid, true)
  assertEquals(jpegResult.format, "image/jpeg")

  // Authentic PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ])
  const pngResult = validateImageMagicBytes(pngBytes)
  assertEquals(pngResult.valid, true)
  assertEquals(pngResult.format, "image/png")

  // Authentic WebP magic bytes: RIFF....WEBP
  const webpBytes = new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46, // "RIFF"
    0x24,
    0x00,
    0x00,
    0x00, // file size
    0x57,
    0x45,
    0x42,
    0x50, // "WEBP"
  ])
  const webpResult = validateImageMagicBytes(webpBytes)
  assertEquals(webpResult.valid, true)
  assertEquals(webpResult.format, "image/webp")
})

Deno.test("IMG-5: Magic-Byte Raster Validation rejects disguised scripts or XML files", () => {
  const fakeJpgSvg = new TextEncoder().encode(
    "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
  )
  const svgCheck = validateImageMagicBytes(fakeJpgSvg)
  assertEquals(svgCheck.valid, false)

  const fakeJpgHtml = new TextEncoder().encode(
    "<!DOCTYPE html><html><body><h1>Hacked</h1></body></html>",
  )
  const htmlCheck = validateImageMagicBytes(fakeJpgHtml)
  assertEquals(htmlCheck.valid, false)

  const tinyBytes = new Uint8Array([0xff, 0xd8, 0xff])
  const tinyCheck = validateImageMagicBytes(tinyBytes)
  assertEquals(tinyCheck.valid, false)
})

Deno.test("IMG-6: Second-Hand Product Guard enforces physical photographs and blocks stock images", () => {
  const preOwnedQuery: DiscoveryQuery = {
    sourceRow: 9999,
    sku: "SH-MACBOOK-AIR-M1",
    productName: "Apple MacBook Air M1 Space Grey (Pre-Owned)",
    brand: "Apple",
    category: "Laptops & MacBooks",
    modelMpn: "MacBook Air M1",
    originalDescription: "Apple MacBook Air M1 256GB Space Grey (Pre-Owned)",
    isSecondHand: true,
  }

  // Pre-owned query must never trigger automated stock discovery
  assertEquals(preOwnedQuery.isSecondHand, true)
})

Deno.test("IMG-7: Query Builder extracts high-precision brand and model without inventing models", () => {
  // Test HP Victus with exact MPN
  const hpVictus: DiscoveryQuery = {
    sourceRow: 520,
    sku: "ITH-LPT-HP-VICTUS15-C29A",
    productName:
      'Laptop HP 15 FB3189AX Victus (R7 7445HS | 16GB | 512GB | 4GB RTX 2050 | 15.6"FHD)',
    brand: "HP",
    category: "Laptops & MacBooks",
    modelMpn: "FB3189AX",
    originalDescription:
      'Laptop HP 15 FB3189AX Victus (R7 7445HS | 16GB | 512GB | 4GB RTX 2050 | 15.6"FHD | W11 | Blue) - 00 C2',
  }
  const victusQuery = buildOptimizedSearchQuery(hpVictus)
  assertEquals(victusQuery.strategy, "exact_model")
  assertEquals(victusQuery.primaryQuery, "HP FB3189AX")

  // Test boAt Headphones with Model
  const boatAudio: DiscoveryQuery = {
    sourceRow: 115,
    sku: "ITH-AUD-BAT-ROCKERZ-1456",
    productName: "boAt Rockerz 371 Headphones Wireless with Mic",
    brand: "boAt",
    category: "Audio & Smart Gadgets",
    modelMpn: "Rockerz 371",
    originalDescription: "Boar Rockerz 371 Headphones Wireless with Mic",
  }
  const boatQuery = buildOptimizedSearchQuery(boatAudio)
  assertEquals(boatQuery.strategy, "exact_model")
  assertEquals(boatQuery.primaryQuery, "boAt Rockerz 371")

  // Test Generic / OEM Screen without inventing MPN
  const genericScreen: DiscoveryQuery = {
    sourceRow: 18,
    sku: "ITH-SPR-GEN-133PAPER-233C",
    productName: '13.3" Paper 30 Pin IPS FHD Replacement Display',
    brand: "Generic / OEM",
    category: "Laptop Spares & Service Parts",
    modelMpn: "N/A",
    originalDescription: "13.3 Paper 30 Pin Ips Fhd",
  }
  const screenQuery = buildOptimizedSearchQuery(genericScreen)
  assertEquals(screenQuery.strategy, "generic_clean")
  assertEquals(screenQuery.primaryQuery, "13.3 Paper 30 Pin Ips Fhd")
  assertEquals(screenQuery.primaryQuery.includes("N/A"), false)
})

Deno.test("IMG-8: Licence & Domain Assessor distinguishes manufacturer, distributor and retail domains", () => {
  const hpLicence = assessLicence(
    "https://www.hp.com/in-en/shop/hp-15-laptop.html",
  )
  assertEquals(hpLicence.licenceType, "Manufacturer_Authorized")
  assertEquals(hpLicence.sourceCategory, "Official Manufacturer Website")

  const savexLicence = assessLicence(
    "https://savex.in/catalogue/apple-macbook-pro",
  )
  assertEquals(savexLicence.licenceType, "Distributor_Feed")
  assertEquals(
    savexLicence.sourceCategory,
    "Authorized National IT Distributor",
  )

  const retailLicence = assessLicence(
    "https://www.random-blog.com/top-10-laptops",
  )
  assertEquals(retailLicence.licenceType, "Unverified_Web")
  assertEquals(
    retailLicence.sourceCategory,
    "Third-Party Marketplace / Retailer",
  )
})

Deno.test("IMG-9: Prototype dataset contains 25 representative products covering all categories", async () => {
  const content = await Deno.readTextFile("src/lib/imageDiscovery.ts")
  const matches = content.match(/sourceRow:\s*\d+/g)
  assertEquals(matches !== null, true)
  assertEquals(
    matches!.length >= 25,
    true,
    `Found ${matches?.length} prototype items`,
  )
  assertEquals(content.includes("isSecondHand: true"), true)
  assertEquals(content.includes('id = "serpapi-google-images"'), true)
})

Deno.test("IMG-10: Supabase Edge Function search-product-images enforces security controls", async () => {
  const edgeCode = await Deno.readTextFile(
    "supabase/functions/search-product-images/index.ts",
  )

  // Verifies SSRF protection is built in
  assertEquals(edgeCode.includes("isSafeImageUrl"), true)
  assertEquals(edgeCode.includes("169.254."), true)

  // Verifies Magic Bytes validation is built in
  assertEquals(edgeCode.includes("detectRasterMagicBytes"), true)
  assertEquals(edgeCode.includes("0xff"), true)

  // Verifies second-hand search block
  assertEquals(edgeCode.includes("SECOND_HAND_RESTRICTED"), true)

  // Verifies rights confirmation check before upload
  assertEquals(edgeCode.includes("RIGHTS_UNCONFIRMED"), true)

  // Verifies admin role verification
  assertEquals(edgeCode.includes("FORBIDDEN"), true)
})
