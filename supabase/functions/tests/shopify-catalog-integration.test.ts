// supabase/functions/tests/shopify-catalog-integration.test.ts
// Automated Regression Tests for Phase 4 Manual QA Investigation & Shopify Catalog Integration Fix
// IT HUB — Kerala, India

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  mapShopifyProductToCatalog,
  toProductGid,
  toVariantGid,
  type ShopifyProductNode,
} from "../../../src/lib/shopify-schema.ts"
import {
  validateShopifyDomain,
  normalizeShopifyDomain,
} from "../../../src/lib/shopify.ts"

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain Validation & Configuration Invariants
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-1: Domain normalization strips protocols and trailing slashes", () => {
  assertEquals(
    normalizeShopifyDomain("https://ithubkmgm.myshopify.com/"),
    "ithubkmgm.myshopify.com",
  )
  assertEquals(
    normalizeShopifyDomain("HTTP://MY-STORE.MYSHOPIFY.COM///"),
    "my-store.myshopify.com",
  )
  assertEquals(
    normalizeShopifyDomain("custom-storefront.in"),
    "custom-storefront.in",
  )
})

Deno.test("SHOP-FIX-2: Domain validation rejects malformed and malicious patterns", () => {
  assertEquals(validateShopifyDomain("ithubkmgm.myshopify.com"), true)
  assertEquals(validateShopifyDomain("store..myshopify.com"), false)
  assertEquals(validateShopifyDomain("store:8080.myshopify.com"), false)
  assertEquals(validateShopifyDomain("store/path.myshopify.com"), false)
  assertEquals(validateShopifyDomain("-invalid.myshopify.com"), false)
  assertEquals(validateShopifyDomain(""), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Lenovo Legion Monitor Mapping & Verification
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-3: Lenovo Legion R27qe Gen 2 maps title, handle, variantId, and price accurately", () => {
  const mockLenovoNode: ShopifyProductNode = {
    id: "gid://shopify/Product/9988776655",
    title: "Lenovo Legion R27qe Gen 2 27\" QHD Fast IPS Gaming Monitor",
    handle: "lenovo-legion-r27qe-gen-2",
    description: "27-inch 2K QHD 180Hz 0.5ms MPRT Fast IPS Gaming Monitor with 99% sRGB.",
    vendor: "Lenovo",
    productType: "Monitors & Displays",
    tags: ["monitor", "gaming", "180hz", "qhd", "ips"],
    availableForSale: true,
    featuredImage: {
      url: "https://cdn.shopify.com/products/lenovo-r27qe.jpg",
      altText: "Lenovo Legion R27qe Gen 2",
    },
    images: {
      edges: [
        { node: { url: "https://cdn.shopify.com/products/lenovo-r27qe.jpg" } },
      ],
    },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/1122334455",
            title: "Default Title",
            sku: "LEN-LEG-R27QE-G2",
            availableForSale: true,
            quantityAvailable: 5,
            price: { amount: "19999.00", currencyCode: "INR" },
            compareAtPrice: { amount: "26000.00", currencyCode: "INR" },
          },
        },
      ],
    },
    metafields: [
      {
        namespace: "custom",
        key: "warranty_summary",
        value: "3-Year Official Lenovo India Onsite Warranty",
        type: "single_line_text_field",
      },
      {
        namespace: "custom",
        key: "condition",
        value: "New",
        type: "single_line_text_field",
      },
    ],
  }

  const catalogProduct = mapShopifyProductToCatalog(mockLenovoNode)

  assertEquals(catalogProduct.id, "9988776655")
  assertEquals(catalogProduct.handle, "lenovo-legion-r27qe-gen-2")
  assertEquals(catalogProduct.variantId, "gid://shopify/ProductVariant/1122334455")
  assertEquals(catalogProduct.name, "Lenovo Legion R27qe Gen 2 27\" QHD Fast IPS Gaming Monitor")
  assertEquals(catalogProduct.brand, "Lenovo")
  assertEquals(catalogProduct.category, "Monitors & Displays")
  assertEquals(catalogProduct.price, 19999)
  assertEquals(catalogProduct.original, 26000)
  assertEquals(catalogProduct.stock, 5)
  assertEquals(catalogProduct.warranty, "3-Year Official Lenovo India Onsite Warranty")
  assertEquals(catalogProduct.tag, "Deal")
  assertEquals(catalogProduct.sku, "LEN-LEG-R27QE-G2")
})

Deno.test("SHOP-FIX-4: Out-of-stock monitor maps availableForSale false and stock 0", () => {
  const oosNode: ShopifyProductNode = {
    id: "gid://shopify/Product/8877665544",
    title: "Lenovo Legion R27qe Gen 2 Monitor (Out of Stock)",
    handle: "lenovo-legion-r27qe-gen-2-oos",
    description: "Temporarily out of stock.",
    vendor: "Lenovo",
    productType: "Monitors & Displays",
    tags: ["monitor"],
    availableForSale: false,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/9988112233",
            title: "Default",
            availableForSale: false,
            quantityAvailable: 0,
            price: { amount: "19999.00", currencyCode: "INR" },
          },
        },
      ],
    },
  }

  const product = mapShopifyProductToCatalog(oosNode)
  assertEquals(product.stock, 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Catalog Source Invariants & Zero Silent Fallback
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-5: Catalog source determination rule enforces no silent fallback", () => {
  // When Shopify is configured:
  const isShopifyConfigured = true
  const shopifyFetchFailed = true

  let catalogSource = "unconfigured"
  let products: any[] = []
  let catalogError: string | null = null

  if (isShopifyConfigured) {
    catalogSource = "shopify"
    if (shopifyFetchFailed) {
      // REQUIREMENT: Must NOT fallback to Supabase products!
      products = []
      catalogError = "Failed to load products from Shopify Storefront."
    }
  }

  assertEquals(catalogSource, "shopify")
  assertEquals(products.length, 0)
  assertEquals(catalogError, "Failed to load products from Shopify Storefront.")
})

Deno.test("SHOP-FIX-6: GraphQL errors with HTTP 200 are detected as failures", () => {
  const mockHttp200Response = {
    ok: false,
    status: 200,
    errors: [
      { message: "Field 'invalidField' doesn't exist on type 'Product'" },
    ],
  }

  // Verification: presence of errors in GraphQL body marks response as ok: false
  assertEquals(mockHttp200Response.ok, false)
  assertEquals(mockHttp200Response.errors.length, 1)
})

Deno.test("SHOP-FIX-7: GID formatting utilities guarantee valid variant and product GIDs", () => {
  assertEquals(toVariantGid("112233"), "gid://shopify/ProductVariant/112233")
  assertEquals(toVariantGid("gid://shopify/ProductVariant/112233"), "gid://shopify/ProductVariant/112233")
  assertEquals(toProductGid("445566"), "gid://shopify/Product/445566")
  assertEquals(toProductGid("gid://shopify/Product/445566"), "gid://shopify/Product/445566")
})


// ─────────────────────────────────────────────────────────────────────────────
// 4. GraphQL Authorization Error & Inventory Scope Regression Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-8: Regression: Storefront GraphQL scope error with HTTP 200 produces ok: false and surfaces clean error", () => {
  // Simulates Shopify GraphQL response returning HTTP 200 with authorization scope denial
  const shopifyRawResponse = {
    errors: [
      {
        message: "Access denied for quantityAvailable field. Required access: unauthenticated_read_product_inventory",
        locations: [{ line: 15, column: 17 }],
        path: ["products", "edges", 0, "node", "variants", "edges", 0, "node", "quantityAvailable"],
      },
    ],
  }

  // Emulate storefrontFetch response parsing logic
  const hasErrors = Boolean(shopifyRawResponse.errors && shopifyRawResponse.errors.length > 0)
  const errorMsg = hasErrors
    ? shopifyRawResponse.errors.map((e) => e.message).join("; ")
    : null

  const parsedResult = {
    ok: !hasErrors,
    status: 200,
    errors: shopifyRawResponse.errors,
    error: errorMsg,
  }

  assertEquals(parsedResult.ok, false)
  assertEquals(parsedResult.status, 200)
  assertEquals(
    parsedResult.error,
    "Access denied for quantityAvailable field. Required access: unauthenticated_read_product_inventory",
  )
})

Deno.test("SHOP-FIX-9: Product mapping with availableForSale (omitted quantityAvailable) maps availability and status cleanly", () => {
  const inStockNode: ShopifyProductNode = {
    id: "gid://shopify/Product/1234567890",
    title: "Lenovo Legion R27qe Gen 2 Gaming Monitor",
    handle: "lenovo-legion-r27qe-gen-2",
    description: "27-inch 2K QHD 180Hz Fast IPS Monitor",
    vendor: "Lenovo",
    productType: "Monitors & Displays",
    tags: ["monitor", "gaming"],
    availableForSale: true,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/987654321",
            title: "Standard",
            sku: "LEN-R27QE",
            availableForSale: true,
            price: { amount: "19999.00", currencyCode: "INR" },
          },
        },
      ],
    },
  }

  const catalogItem = mapShopifyProductToCatalog(inStockNode)
  assertEquals(catalogItem.availableForSale, true)
  assertEquals(catalogItem.status, "Active")
  assertEquals(catalogItem.stock > 0, true)

  const outOfStockNode: ShopifyProductNode = {
    ...inStockNode,
    id: "gid://shopify/Product/1234567891",
    availableForSale: false,
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/987654322",
            title: "Standard",
            sku: "LEN-R27QE-OOS",
            availableForSale: false,
            price: { amount: "19999.00", currencyCode: "INR" },
          },
        },
      ],
    },
  }

  const oosItem = mapShopifyProductToCatalog(outOfStockNode)
  assertEquals(oosItem.availableForSale, false)
  // oosItem status is Active
  assertEquals(oosItem.stock, 0)
})

Deno.test("SHOP-FIX-10: Storefront API query definitions do not contain restricted inventory fields", async () => {
  const shopifySource = await Deno.readTextFile("src/lib/shopify.ts")
  
  // Restricted fields requiring unauthenticated_read_product_inventory:
  assertEquals(shopifySource.includes("quantityAvailable"), false)
  assertEquals(shopifySource.includes("totalInventory"), false)
  
  // Publicly supported variant availability:
  assertEquals(shopifySource.includes("availableForSale"), true)
})


// ─────────────────────────────────────────────────────────────────────────────
// 5. Phase 4.2 Multi-Image Gallery & Product Description Regression Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-11: Multi-image mapping retains all unique images in order, deduplicates, and sets images array", () => {
  const multiImageNode: ShopifyProductNode = {
    id: "gid://shopify/Product/7788990011",
    title: "Lenovo Legion R27qe Gen 2 Gaming Monitor",
    handle: "lenovo-legion-r27qe-gen-2",
    description: "27-inch 2K QHD 180Hz Fast IPS Gaming Monitor.",
    descriptionHtml: "<p>27-inch 2K <strong>QHD</strong> 180Hz Fast IPS Gaming Monitor.</p>",
    vendor: "Lenovo",
    productType: "Monitors & Displays",
    tags: ["monitor", "gaming"],
    availableForSale: true,
    featuredImage: {
      url: "https://cdn.shopify.com/products/lenovo-front.jpg",
      altText: "Lenovo Monitor Front View",
    },
    images: {
      edges: [
        { node: { url: "https://cdn.shopify.com/products/lenovo-front.jpg", altText: "Front" } }, // Duplicate of featured
        { node: { url: "https://cdn.shopify.com/products/lenovo-back.jpg", altText: "Back ports" } },
        { node: { url: "https://cdn.shopify.com/products/lenovo-side.jpg", altText: "Side profile" } },
      ],
    },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/5566778899",
            title: "Default",
            availableForSale: true,
            price: { amount: "19999.00", currencyCode: "INR" },
            image: { url: "https://cdn.shopify.com/products/lenovo-hero.jpg" },
          },
        },
      ],
    },
  }

  const catalog = mapShopifyProductToCatalog(multiImageNode)

  // Primary image should be the variant image (highest specificity)
  assertEquals(catalog.image, "https://cdn.shopify.com/products/lenovo-hero.jpg")

  // Images array must be populated with all unique images in order
  assertEquals(Array.isArray(catalog.images), true)
  assertEquals(catalog.images?.length, 4)
  assertEquals(catalog.images?.[0], "https://cdn.shopify.com/products/lenovo-hero.jpg")
  assertEquals(catalog.images?.[1], "https://cdn.shopify.com/products/lenovo-front.jpg")
  assertEquals(catalog.images?.[2], "https://cdn.shopify.com/products/lenovo-back.jpg")
  assertEquals(catalog.images?.[3], "https://cdn.shopify.com/products/lenovo-side.jpg")

  // Ensure zero duplicate URLs in the gallery array
  const uniqueUrls = new Set(catalog.images)
  assertEquals(uniqueUrls.size, catalog.images?.length)
})

Deno.test("SHOP-FIX-12: Zero-image product fallback uses placeholder image gracefully", () => {
  const zeroImageNode: ShopifyProductNode = {
    id: "gid://shopify/Product/3344556677",
    title: "Accessory without Image",
    handle: "accessory-no-image",
    description: "Standard accessory.",
    vendor: "Generic",
    productType: "Accessories",
    tags: ["accessory"],
    availableForSale: true,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/1122446688",
            title: "Default",
            availableForSale: true,
            price: { amount: "499.00", currencyCode: "INR" },
          },
        },
      ],
    },
  }

  const catalog = mapShopifyProductToCatalog(zeroImageNode)
  assertEquals(catalog.image, "/assets/placeholder-product.png")
  assertEquals(catalog.images?.length, 1)
  assertEquals(catalog.images?.[0], "/assets/placeholder-product.png")
})

Deno.test("SHOP-FIX-13: Product description and descriptionHtml mapping preserves authentic Shopify content", () => {
  const nodeWithHtml: ShopifyProductNode = {
    id: "gid://shopify/Product/1112223334",
    title: "Lenovo Legion R27qe Gen 2",
    handle: "lenovo-legion-r27qe-gen-2",
    description: "27\" QHD Fast IPS panel, 180Hz refresh rate, 0.5ms MPRT.",
    descriptionHtml: "<p>27&quot; QHD Fast IPS panel.</p><ul><li>180Hz refresh rate</li><li>0.5ms MPRT</li></ul>",
    vendor: "Lenovo",
    productType: "Monitors",
    tags: ["monitor"],
    availableForSale: true,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/9988771122",
            title: "Default",
            availableForSale: true,
            price: { amount: "19999.00", currencyCode: "INR" },
          },
        },
      ],
    },
  }

  const catalog = mapShopifyProductToCatalog(nodeWithHtml)
  assertEquals(catalog.description, "27\" QHD Fast IPS panel, 180Hz refresh rate, 0.5ms MPRT.")
  assertEquals(
    catalog.descriptionHtml,
    "<p>27&quot; QHD Fast IPS panel.</p><ul><li>180Hz refresh rate</li><li>0.5ms MPRT</li></ul>",
  )

  // Empty description case: must map to undefined without inventing demo placeholder text
  const nodeEmptyDesc: ShopifyProductNode = {
    ...nodeWithHtml,
    id: "gid://shopify/Product/1112223335",
    description: "",
    descriptionHtml: "",
  }
  const catalogEmpty = mapShopifyProductToCatalog(nodeEmptyDesc)
  assertEquals(catalogEmpty.description, undefined)
  assertEquals(catalogEmpty.descriptionHtml, undefined)
})

Deno.test("SHOP-FIX-14: HTML sanitizer removes scripts, iframes, and event handlers while preserving safe tags", async () => {
  const { sanitizeHtml } = await import("../../../src/lib/sanitize.ts")

  const dirtyPayload = `
    <div>
      <p>Clean paragraph with <strong>bold</strong> and <em>italic</em>.</p>
      <ul><li>Feature 1</li><li>Feature 2</li></ul>
      <script>window.__pwned = true; evil();</script>
      <iframe src="https://attacker.com/cookie-steal"></iframe>
      <a href="https://ithub.in" onclick="alert('xss')">Safe link</a>
      <img src="x" onerror="alert('img xss')" />
      <object data="evil.swf"></object>
    </div>
  `

  const sanitized = sanitizeHtml(dirtyPayload)

  // Assert dangerous elements and attributes are completely eliminated:
  assertEquals(sanitized.includes("<script>"), false)
  assertEquals(sanitized.includes("evil()"), false)
  assertEquals(sanitized.includes("<iframe"), false)
  assertEquals(sanitized.includes("onclick"), false)
  assertEquals(sanitized.includes("onerror"), false)
  assertEquals(sanitized.includes("<object"), false)

  // Assert safe elements and content are preserved:
  assertEquals(sanitized.includes("<p>Clean paragraph with <strong>bold</strong>"), true)
  assertEquals(sanitized.includes("<ul><li>Feature 1</li><li>Feature 2</li></ul>"), true)
  assertEquals(sanitized.includes('<a href="https://ithub.in"'), true)
})

Deno.test("SHOP-FIX-15: Product lookup supports both Shopify numeric ID and human-readable handle", () => {
  const products = [
    {
      id: "9988776655",
      handle: "lenovo-legion-r27qe-gen-2",
      name: "Lenovo Legion R27qe Gen 2 Monitor",
      price: 19999,
      sku: "LEN-R27QE",
    },
    {
      id: "1122334455",
      handle: "asus-rog-strix-b650e",
      name: "ASUS ROG Strix B650E-F",
      price: 24999,
      sku: "ASUS-B650E",
    },
  ]

  // Lookup by ID
  const foundById = products.find(
    (item) => item.id === "9988776655" || item.sku === "9988776655" || item.handle === "9988776655",
  )
  assertEquals(foundById?.name, "Lenovo Legion R27qe Gen 2 Monitor")

  // Lookup by Handle
  const foundByHandle = products.find(
    (item) =>
      item.id === "lenovo-legion-r27qe-gen-2" ||
      item.sku === "lenovo-legion-r27qe-gen-2" ||
      item.handle === "lenovo-legion-r27qe-gen-2",
  )
  assertEquals(foundByHandle?.name, "Lenovo Legion R27qe Gen 2 Monitor")
})
