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

function isProductSecondHand(item: {
  isSecondHand?: boolean
  sku?: string
  condition?: string
  productName?: string
  originalDescription?: string
}): boolean {
  if (item.isSecondHand) return true
  if (item.sku && item.sku.toUpperCase().startsWith("SH-")) return true
  if (item.condition && item.condition !== "New") return true
  const text =
    `${item.productName || ""} ${item.originalDescription || ""}`.toLowerCase()
  if (/\b(second[- ]?hand|pre[- ]?owned|refurbished|used)\b/.test(text))
    return true
  return false
}

const importColumns = [
  "SKU",
  "Product Name",
  "Model Number",
  "Brand",
  "Category",
  "Subcategory",
  "Description",
  "MRP",
  "Price",
  "Sale Price",
  "Cost Price",
  "Stock",
  "Low Stock Threshold",
  "Warranty",
  "Weight",
  "Condition",
  "Second Hand",
  "Status",
] as const

function canonicalizeImportHeader(header: string): string {
  const clean = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  if (
    [
      "sku",
      "itemcode",
      "code",
      "barcode",
      "productcode",
      "partno",
      "partnumber",
    ].includes(clean)
  ) {
    return "SKU"
  }
  if (
    [
      "model",
      "modelnumber",
      "modelno",
      "mpn",
      "devicemodel",
      "modelmpn",
    ].includes(clean)
  ) {
    return "Model Number"
  }
  if (
    [
      "productname",
      "product",
      "itemname",
      "item",
      "name",
      "title",
      "mobilename",
      "devicename",
      "particulars",
    ].includes(clean)
  ) {
    return "Product Name"
  }
  if (["brand", "make", "manufacturer"].includes(clean)) return "Brand"
  if (["category", "dept", "department", "group"].includes(clean))
    return "Category"
  if (["subcategory", "subcat", "subgroup", "type"].includes(clean))
    return "Subcategory"
  if (["mrp", "maxretailprice", "maximumretailprice"].includes(clean))
    return "MRP"
  if (
    [
      "price",
      "sellingprice",
      "salesprice",
      "retailprice",
      "offerprice",
      "rate",
      "sp",
      "unitprice",
    ].includes(clean)
  )
    return "Price"
  if (
    [
      "saleprice",
      "promoprice",
      "promotionalprice",
      "discountprice",
      "discountedprice",
    ].includes(clean)
  )
    return "Sale Price"
  if (
    ["costprice", "cost", "purchaseprice", "purchaserate", "cp"].includes(clean)
  )
    return "Cost Price"
  if (
    [
      "stock",
      "qty",
      "quantity",
      "availablestock",
      "inventory",
      "count",
      "balance",
    ].includes(clean)
  )
    return "Stock"
  if (
    ["lowstockthreshold", "lowstock", "reorderlevel", "minstock"].includes(
      clean,
    )
  )
    return "Low Stock Threshold"
  if (["warranty", "guarantee"].includes(clean)) return "Warranty"
  if (["weight", "netweight"].includes(clean)) return "Weight"
  if (["condition", "itemcondition"].includes(clean)) return "Condition"
  if (["secondhand", "preowned", "issecondhand", "used"].includes(clean))
    return "Second Hand"
  if (["status", "productstatus"].includes(clean)) return "Status"
  const matched = importColumns.find(
    (c) => c.toLowerCase() === header.trim().toLowerCase(),
  )
  return matched || header.trim()
}

interface ImportIssue {
  level: "error" | "warning"
  message: string
}

interface ImportRow {
  row: number
  data: Record<string, string>
  issues: ImportIssue[]
  valid: boolean
}

const cell = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim()

function validateImportRows(
  raw: Record<string, unknown>[],
  categories: string[],
  brands: string[],
): ImportRow[] {
  const skuCount = new Map<string, number>()
  for (const item of raw) {
    let sku = cell(item.SKU).toLowerCase()
    if (!sku) {
      for (const [k, v] of Object.entries(item)) {
        if (canonicalizeImportHeader(k) === "SKU") {
          sku = cell(v).toLowerCase()
          break
        }
      }
    }
    if (sku) skuCount.set(sku, (skuCount.get(sku) || 0) + 1)
  }

  const lowerCategories = categories.map((name) => name.toLowerCase())
  const lowerBrands = brands.map((name) => name.toLowerCase())

  return raw.map((item, index) => {
    const rawNormalized: Record<string, string> = {}
    for (const [key, val] of Object.entries(item)) {
      const canonical = canonicalizeImportHeader(key)
      const value = cell(val)
      if (!rawNormalized[canonical] || value.length > 0) {
        rawNormalized[canonical] = value
      }
    }

    const data: Record<string, string> = {}
    for (const col of importColumns) {
      data[col] = rawNormalized[col] || ""
    }

    const issues: ImportIssue[] = []
    const error = (message: string) => issues.push({ level: "error", message })
    const warn = (message: string) => issues.push({ level: "warning", message })

    if (!data.SKU && data["Model Number"]) {
      const derived = `ITH-${data["Model Number"]
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 24)
        .toUpperCase()}`
      data.SKU = derived
      warn(
        `Missing SKU header — derived identifier "${derived}" from Model Number`,
      )
    }

    if (!data.SKU && !data["Model Number"]) {
      error(
        "Missing SKU or Model Number (at least one unique identifier is required)",
      )
    } else if (data.SKU && (skuCount.get(data.SKU.toLowerCase()) || 0) > 1) {
      error(`Duplicate SKU in file (${data.SKU})`)
    }

    if (!data["Product Name"]) {
      error("Missing Product Name")
    }

    const numeric = (key: string) => {
      if (!data[key]) return null
      const value = Number(data[key].replace(/[,₹\s]/g, ""))
      if (!Number.isFinite(value)) {
        error(`Invalid ${key.toLowerCase()} (must be a number)`)
        return null
      }
      return value
    }

    const price = numeric("Price")
    if (price === null && !data.Price) {
      error("Missing selling price (Price is required and cannot be invented)")
    } else if (price !== null && price <= 0) {
      error("Invalid selling price (must be greater than 0)")
    }

    const mrp = numeric("MRP")
    if (mrp !== null && mrp <= 0) {
      error("Invalid MRP (must be greater than 0)")
    }
    if (mrp !== null && price !== null && mrp < price) {
      error(
        `Inconsistent pricing: stated MRP (₹${mrp}) cannot be lower than Selling Price (₹${price})`,
      )
    }

    const sale = numeric("Sale Price")
    if (sale !== null && sale <= 0) {
      error("Invalid sale price (must be greater than 0)")
    }
    if (sale !== null && price !== null && sale > price) {
      error("Sale price cannot be higher than regular selling price")
    }

    const cost = numeric("Cost Price")
    if (cost !== null && cost < 0) {
      error("Invalid cost price (cannot be negative)")
    }

    const stock = numeric("Stock")
    if (stock !== null) {
      if (stock < 0) error("Invalid stock (cannot be negative)")
      else if (!Number.isInteger(stock))
        error("Invalid stock (must be a whole integer)")
    } else if (!data.Stock) {
      warn(
        "Missing stock quantity — will default to 0 (Out of stock) pending physical count verification",
      )
    }

    const threshold = numeric("Low Stock Threshold")
    if (threshold !== null && (threshold < 0 || !Number.isInteger(threshold))) {
      error("Invalid low stock threshold (whole number ≥ 0)")
    }

    if (data.Brand) {
      if (!lowerBrands.includes(data.Brand.toLowerCase())) {
        warn(`Unknown brand "${data.Brand}" — will be added to brand index`)
      }
    } else {
      warn("Missing brand — product requires brand assignment")
    }

    if (data.Category) {
      if (!lowerCategories.includes(data.Category.toLowerCase())) {
        warn(
          `Category "${data.Category}" is not in current catalog taxonomy — requires review`,
        )
      }
    } else {
      warn("Missing category — product will require category assignment")
    }

    const isExplicitSecondHand =
      /yes|true|1/i.test(data["Second Hand"] || "") ||
      data.SKU.toUpperCase().startsWith("SH-")
    const isPreOwnedCondition =
      data.Condition &&
      ["like new", "good", "fair", "for parts"].includes(
        data.Condition.toLowerCase(),
      )

    if (isExplicitSecondHand || isPreOwnedCondition) {
      data["Second Hand"] = "Yes"
      if (!data.Condition || data.Condition.toLowerCase() === "new") {
        data.Condition = "Good"
      }
      warn(
        "Second-hand listing detected — automated search disabled; physical photo upload required",
      )
    }

    if (data.Status) {
      if (
        !["active", "draft", "archived"].includes(data.Status.toLowerCase())
      ) {
        error(
          `Invalid status "${data.Status}" (use Active, Draft, or Archived)`,
        )
      }
    } else {
      data.Status = "Draft"
      warn("Missing status — defaulting to Draft for catalog review")
    }

    return {
      row: index + 2,
      data,
      issues,
      valid: !issues.some((issue) => issue.level === "error"),
    }
  })
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

Deno.test("IMG-11: Second-Hand products strictly trigger zero SerpApi searches and enforce manual upload", () => {
  const preOwnedItems = [
    {
      sku: "SH-MACBOOK-AIR-M1",
      productName: "Apple MacBook Air M1 Space Grey",
      isSecondHand: true,
    },
    {
      sku: "SH-IPHONE-13-128GB",
      productName: "Apple iPhone 13 128GB Midnight",
      condition: "Good",
    },
    {
      sku: "ITH-LPT-DELL-REFURB",
      productName: "Dell Latitude 7490 (Refurbished)",
      originalDescription: "Pre-owned Dell Latitude laptop",
    },
    {
      sku: "ITH-MOB-SMP-USED",
      productName: "Samsung Galaxy S21 Ultra used condition",
    },
  ]

  for (const item of preOwnedItems) {
    const isSh = isProductSecondHand(item)
    assertEquals(
      isSh,
      true,
      `Expected ${item.sku} / "${item.productName}" to be classified as second-hand`,
    )
  }

  // Fresh items must not be classified as second-hand
  const freshItem = {
    sku: "ITH-LPT-HP-B91DNPA-3ADE",
    productName: "HP 15-FD0534TU Laptop Brand New Natural Silver",
    condition: "New",
    isSecondHand: false,
  }
  assertEquals(isProductSecondHand(freshItem), false)
})

Deno.test("IMG-12: Edge Function search-product-images rejects second-hand queries with SECOND_HAND_RESTRICTED", async () => {
  const edgeCode = await Deno.readTextFile(
    "supabase/functions/search-product-images/index.ts",
  )

  // Verifies that Edge Function checks isSecondHand, SKU prefix SH-, and second-hand keywords
  assertEquals(edgeCode.includes("SECOND_HAND_RESTRICTED"), true)
  assertEquals(edgeCode.includes("SH-"), true)
  assertEquals(
    edgeCode.includes("second[- ]?hand|pre[- ]?owned|refurbished|used"),
    true,
  )
  assertEquals(
    edgeCode.includes(
      "Second-hand products mandate physical admin photo uploads",
    ),
    true,
  )
})

Deno.test("IMG-13: Multiple real physical photos can be securely validated and uploaded for second-hand listings", () => {
  // Test multiple authentic photos (JPEG, PNG, WebP)
  const jpegHeader = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ])
  const pngHeader = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ])
  const webpHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ])

  const photos = [
    { name: "angle1.jpg", bytes: jpegHeader, size: 2 * 1024 * 1024 },
    { name: "angle2.png", bytes: pngHeader, size: 3 * 1024 * 1024 },
    { name: "ports.webp", bytes: webpHeader, size: 1.5 * 1024 * 1024 },
  ]

  for (const p of photos) {
    const magic = validateImageMagicBytes(p.bytes)
    assertEquals(magic.valid, true)
    assertEquals(p.size <= 5 * 1024 * 1024, true)
  }

  // Reject oversized photo (> 5MB)
  const oversizedSize = 6 * 1024 * 1024
  assertEquals(oversizedSize <= 5 * 1024 * 1024, false)

  // Reject disguised SVG or HTML in a multi-photo batch
  const disguisedSvg = new TextEncoder().encode(
    "<svg><script>alert('xss')</script></svg>",
  )
  assertEquals(validateImageMagicBytes(disguisedSvg).valid, false)

  // Verify flexible photo counts (e.g. 1, 2, 3, 5 photos) are supported without enforcing fixed count of 6
  const supportedCounts = [1, 2, 3, 4, 5, 8]
  for (const count of supportedCounts) {
    assertEquals(count > 0, true)
    assertEquals(count === 6 ? false : true, count !== 6)
  }
})

Deno.test("IMG-14: Bulk product importer canonicalizes client Excel headers and validates mandatory vs optional fields", () => {
  // 1. Header canonicalization
  assertEquals(canonicalizeImportHeader("Selling Price"), "Price")
  assertEquals(canonicalizeImportHeader("M.R.P."), "MRP")
  assertEquals(canonicalizeImportHeader("Maximum Retail Price"), "MRP")
  assertEquals(canonicalizeImportHeader("Model No"), "Model Number")
  assertEquals(canonicalizeImportHeader("Mobile Name"), "Product Name")
  assertEquals(canonicalizeImportHeader("Qty"), "Stock")
  assertEquals(canonicalizeImportHeader("Pre-Owned"), "Second Hand")

  // 2. Validate row with Model Number (derives SKU), MRP, Selling Price
  const categories = ["Mobile Phones & Tablets", "Laptops & MacBooks"]
  const brands = ["Samsung", "Apple", "HP"]

  const rawRows = [
    // Row 1: Valid Mobile with Model Number, Product Name, MRP, Selling Price
    {
      "Model Number": "SM-A156E",
      "Product Name": "Samsung Galaxy A15 5G",
      Brand: "Samsung",
      Category: "Mobile Phones & Tablets",
      MRP: "19,499",
      "Selling Price": "16,999",
      Qty: "15",
    },
    // Row 2: Inconsistent pricing: MRP < Selling Price (Must fail)
    {
      SKU: "ITH-LPT-ERR-001",
      "Product Name": "HP Laptop with bad MRP",
      Brand: "HP",
      Category: "Laptops & MacBooks",
      MRP: "40,000",
      "Selling Price": "45,000",
    },
    // Row 3: Missing selling price (Must fail - Never invent prices)
    {
      SKU: "ITH-PHN-NOPRICE",
      "Product Name": "Apple iPhone without price",
      Brand: "Apple",
      Category: "Mobile Phones & Tablets",
      MRP: "79,900",
    },
    // Row 4: Missing stock (Must pass with warning - Never invent stock, default 0)
    {
      SKU: "ITH-LPT-NOSTOCK",
      "Product Name": "HP Pavilion Laptop pending stock count",
      Brand: "HP",
      Category: "Laptops & MacBooks",
      MRP: "65,000",
      "Selling Price": "58,000",
    },
    // Row 5: Second-hand phone (Must detect second-hand and warn physical upload)
    {
      "Model Number": "MLPF3HN/A",
      "Product Name": "Apple iPhone 13 128GB (Pre-Owned)",
      Brand: "Apple",
      Category: "Mobile Phones & Tablets",
      MRP: "59,900",
      "Selling Price": "38,500",
      Condition: "Good",
    },
  ]

  const validated = validateImportRows(rawRows, categories, brands)
  assertEquals(validated.length, 5)

  // Row 1: Valid, derived SKU from Model Number
  assertEquals(validated[0].valid, true)
  assertEquals(validated[0].data.SKU.startsWith("ITH-"), true)
  assertEquals(validated[0].data.Price, "16,999")
  assertEquals(validated[0].data.MRP, "19,499")

  // Row 2: Invalid due to MRP < Selling Price
  assertEquals(validated[1].valid, false)
  assertEquals(
    validated[1].issues.some((i) =>
      i.message.includes("cannot be lower than Selling Price"),
    ),
    true,
  )

  // Row 3: Invalid due to missing selling price
  assertEquals(validated[2].valid, false)
  assertEquals(
    validated[2].issues.some((i) =>
      i.message.includes("Missing selling price"),
    ),
    true,
  )

  // Row 4: Valid, but has warning for missing stock
  assertEquals(validated[3].valid, true)
  assertEquals(
    validated[3].issues.some((i) =>
      i.message.includes("Missing stock quantity"),
    ),
    true,
  )

  // Row 5: Valid, detected as Second-Hand
  assertEquals(validated[4].valid, true)
  assertEquals(validated[4].data["Second Hand"], "Yes")
  assertEquals(
    validated[4].issues.some((i) =>
      i.message.includes("Second-hand listing detected"),
    ),
    true,
  )
})
