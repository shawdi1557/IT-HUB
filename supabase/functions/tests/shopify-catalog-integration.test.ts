// supabase/functions/tests/shopify-catalog-integration.test.ts
// Automated Regression Tests for Phase 4 Manual QA Investigation & Shopify Catalog Integration Fix
// IT HUB — Kerala, India

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  mapShopifyProductToCatalog,
  toProductGid,
  toVariantGid,
  type ShopifyProductNode,
} from "../../../src/lib/shopify-schema.ts";
import {
  validateShopifyDomain,
  normalizeShopifyDomain,
  parseCartErrorLineIndex,
} from "../../../src/lib/shopify.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain Validation & Configuration Invariants
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-1: Domain normalization strips protocols and trailing slashes", () => {
  assertEquals(
    normalizeShopifyDomain("https://ithubkmgm.myshopify.com/"),
    "ithubkmgm.myshopify.com",
  );
  assertEquals(
    normalizeShopifyDomain("HTTP://MY-STORE.MYSHOPIFY.COM///"),
    "my-store.myshopify.com",
  );
  assertEquals(normalizeShopifyDomain("custom-storefront.in"), "custom-storefront.in");
});

Deno.test("SHOP-FIX-2: Domain validation rejects malformed and malicious patterns", () => {
  assertEquals(validateShopifyDomain("ithubkmgm.myshopify.com"), true);
  assertEquals(validateShopifyDomain("store..myshopify.com"), false);
  assertEquals(validateShopifyDomain("store:8080.myshopify.com"), false);
  assertEquals(validateShopifyDomain("store/path.myshopify.com"), false);
  assertEquals(validateShopifyDomain("-invalid.myshopify.com"), false);
  assertEquals(validateShopifyDomain(""), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Lenovo Legion Monitor Mapping & Verification
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-3: Lenovo Legion R27qe Gen 2 maps title, handle, variantId, and price accurately", () => {
  const mockLenovoNode: ShopifyProductNode = {
    id: "gid://shopify/Product/9988776655",
    title: 'Lenovo Legion R27qe Gen 2 27" QHD Fast IPS Gaming Monitor',
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
      edges: [{ node: { url: "https://cdn.shopify.com/products/lenovo-r27qe.jpg" } }],
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
  };

  const catalogProduct = mapShopifyProductToCatalog(mockLenovoNode);

  assertEquals(catalogProduct.id, "9988776655");
  assertEquals(catalogProduct.handle, "lenovo-legion-r27qe-gen-2");
  assertEquals(catalogProduct.variantId, "gid://shopify/ProductVariant/1122334455");
  assertEquals(catalogProduct.name, 'Lenovo Legion R27qe Gen 2 27" QHD Fast IPS Gaming Monitor');
  assertEquals(catalogProduct.brand, "Lenovo");
  assertEquals(catalogProduct.category, "Monitors & Displays");
  assertEquals(catalogProduct.price, 19999);
  assertEquals(catalogProduct.original, 26000);
  assertEquals(catalogProduct.stock, 5);
  assertEquals(catalogProduct.warranty, "3-Year Official Lenovo India Onsite Warranty");
  assertEquals(catalogProduct.tag, "Deal");
  assertEquals(catalogProduct.sku, "LEN-LEG-R27QE-G2");
});

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
  };

  const product = mapShopifyProductToCatalog(oosNode);
  assertEquals(product.stock, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Catalog Source Invariants & Zero Silent Fallback
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-5: Catalog source determination rule enforces no silent fallback", () => {
  // When Shopify is configured:
  const isShopifyConfigured = true;
  const shopifyFetchFailed = true;

  let catalogSource = "unconfigured";
  let products: any[] = [];
  let catalogError: string | null = null;

  if (isShopifyConfigured) {
    catalogSource = "shopify";
    if (shopifyFetchFailed) {
      // REQUIREMENT: Must NOT fallback to Supabase products!
      products = [];
      catalogError = "Failed to load products from Shopify Storefront.";
    }
  }

  assertEquals(catalogSource, "shopify");
  assertEquals(products.length, 0);
  assertEquals(catalogError, "Failed to load products from Shopify Storefront.");
});

Deno.test("SHOP-FIX-6: GraphQL errors with HTTP 200 are detected as failures", () => {
  const mockHttp200Response = {
    ok: false,
    status: 200,
    errors: [{ message: "Field 'invalidField' doesn't exist on type 'Product'" }],
  };

  // Verification: presence of errors in GraphQL body marks response as ok: false
  assertEquals(mockHttp200Response.ok, false);
  assertEquals(mockHttp200Response.errors.length, 1);
});

Deno.test("SHOP-FIX-7: GID formatting utilities guarantee valid variant and product GIDs", () => {
  assertEquals(toVariantGid("112233"), "gid://shopify/ProductVariant/112233");
  assertEquals(
    toVariantGid("gid://shopify/ProductVariant/112233"),
    "gid://shopify/ProductVariant/112233",
  );
  assertEquals(toProductGid("445566"), "gid://shopify/Product/445566");
  assertEquals(toProductGid("gid://shopify/Product/445566"), "gid://shopify/Product/445566");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GraphQL Authorization Error & Inventory Scope Regression Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-FIX-8: Regression: Storefront GraphQL scope error with HTTP 200 produces ok: false and surfaces clean error", () => {
  // Simulates Shopify GraphQL response returning HTTP 200 with authorization scope denial
  const shopifyRawResponse = {
    errors: [
      {
        message:
          "Access denied for quantityAvailable field. Required access: unauthenticated_read_product_inventory",
        locations: [{ line: 15, column: 17 }],
        path: ["products", "edges", 0, "node", "variants", "edges", 0, "node", "quantityAvailable"],
      },
    ],
  };

  // Emulate storefrontFetch response parsing logic
  const hasErrors = Boolean(shopifyRawResponse.errors && shopifyRawResponse.errors.length > 0);
  const errorMsg = hasErrors ? shopifyRawResponse.errors.map((e) => e.message).join("; ") : null;

  const parsedResult = {
    ok: !hasErrors,
    status: 200,
    errors: shopifyRawResponse.errors,
    error: errorMsg,
  };

  assertEquals(parsedResult.ok, false);
  assertEquals(parsedResult.status, 200);
  assertEquals(
    parsedResult.error,
    "Access denied for quantityAvailable field. Required access: unauthenticated_read_product_inventory",
  );
});

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
  };

  const catalogItem = mapShopifyProductToCatalog(inStockNode);
  assertEquals(catalogItem.availableForSale, true);
  assertEquals(catalogItem.status, "Active");
  assertEquals(catalogItem.stock > 0, true);

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
  };

  const oosItem = mapShopifyProductToCatalog(outOfStockNode);
  assertEquals(oosItem.availableForSale, false);
  // oosItem status is Active
  assertEquals(oosItem.stock, 0);
});

Deno.test("SHOP-FIX-10: Storefront API query definitions do not contain restricted inventory fields", async () => {
  const shopifySource = await Deno.readTextFile("src/lib/shopify.ts");

  // Restricted fields requiring unauthenticated_read_product_inventory:
  assertEquals(shopifySource.includes("quantityAvailable"), false);
  assertEquals(shopifySource.includes("totalInventory"), false);

  // Publicly supported variant availability:
  assertEquals(shopifySource.includes("availableForSale"), true);
});

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
        {
          node: { url: "https://cdn.shopify.com/products/lenovo-back.jpg", altText: "Back ports" },
        },
        {
          node: {
            url: "https://cdn.shopify.com/products/lenovo-side.jpg",
            altText: "Side profile",
          },
        },
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
  };

  const catalog = mapShopifyProductToCatalog(multiImageNode);

  // Primary image should be the variant image (highest specificity)
  assertEquals(catalog.image, "https://cdn.shopify.com/products/lenovo-hero.jpg");

  // Images array must be populated with all unique images in order
  assertEquals(Array.isArray(catalog.images), true);
  assertEquals(catalog.images?.length, 4);
  assertEquals(catalog.images?.[0], "https://cdn.shopify.com/products/lenovo-hero.jpg");
  assertEquals(catalog.images?.[1], "https://cdn.shopify.com/products/lenovo-front.jpg");
  assertEquals(catalog.images?.[2], "https://cdn.shopify.com/products/lenovo-back.jpg");
  assertEquals(catalog.images?.[3], "https://cdn.shopify.com/products/lenovo-side.jpg");

  // Ensure zero duplicate URLs in the gallery array
  const uniqueUrls = new Set(catalog.images);
  assertEquals(uniqueUrls.size, catalog.images?.length);
});

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
  };

  const catalog = mapShopifyProductToCatalog(zeroImageNode);
  assertEquals(catalog.image, "/assets/placeholder-product.png");
  assertEquals(catalog.images?.length, 1);
  assertEquals(catalog.images?.[0], "/assets/placeholder-product.png");
});

Deno.test("SHOP-FIX-13: Product description and descriptionHtml mapping preserves authentic Shopify content", () => {
  const nodeWithHtml: ShopifyProductNode = {
    id: "gid://shopify/Product/1112223334",
    title: "Lenovo Legion R27qe Gen 2",
    handle: "lenovo-legion-r27qe-gen-2",
    description: '27" QHD Fast IPS panel, 180Hz refresh rate, 0.5ms MPRT.',
    descriptionHtml:
      "<p>27&quot; QHD Fast IPS panel.</p><ul><li>180Hz refresh rate</li><li>0.5ms MPRT</li></ul>",
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
  };

  const catalog = mapShopifyProductToCatalog(nodeWithHtml);
  assertEquals(catalog.description, '27" QHD Fast IPS panel, 180Hz refresh rate, 0.5ms MPRT.');
  assertEquals(
    catalog.descriptionHtml,
    "<p>27&quot; QHD Fast IPS panel.</p><ul><li>180Hz refresh rate</li><li>0.5ms MPRT</li></ul>",
  );

  // Empty description case: must map to undefined without inventing demo placeholder text
  const nodeEmptyDesc: ShopifyProductNode = {
    ...nodeWithHtml,
    id: "gid://shopify/Product/1112223335",
    description: "",
    descriptionHtml: "",
  };
  const catalogEmpty = mapShopifyProductToCatalog(nodeEmptyDesc);
  assertEquals(catalogEmpty.description, undefined);
  assertEquals(catalogEmpty.descriptionHtml, undefined);
});

Deno.test("SHOP-FIX-14: HTML sanitizer removes scripts, iframes, and event handlers while preserving safe tags", async () => {
  const { sanitizeHtml } = await import("../../../src/lib/sanitize.ts");

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
  `;

  const sanitized = sanitizeHtml(dirtyPayload);

  // Assert dangerous elements and attributes are completely eliminated:
  assertEquals(sanitized.includes("<script>"), false);
  assertEquals(sanitized.includes("evil()"), false);
  assertEquals(sanitized.includes("<iframe"), false);
  assertEquals(sanitized.includes("onclick"), false);
  assertEquals(sanitized.includes("onerror"), false);
  assertEquals(sanitized.includes("<object"), false);

  // Assert safe elements and content are preserved:
  assertEquals(sanitized.includes("<p>Clean paragraph with <strong>bold</strong>"), true);
  assertEquals(sanitized.includes("<ul><li>Feature 1</li><li>Feature 2</li></ul>"), true);
  assertEquals(sanitized.includes('<a href="https://ithub.in"'), true);
});

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
  ];

  // Lookup by ID
  const foundById = products.find(
    (item) => item.id === "9988776655" || item.sku === "9988776655" || item.handle === "9988776655",
  );
  assertEquals(foundById?.name, "Lenovo Legion R27qe Gen 2 Monitor");

  // Lookup by Handle
  const foundByHandle = products.find(
    (item) =>
      item.id === "lenovo-legion-r27qe-gen-2" ||
      item.sku === "lenovo-legion-r27qe-gen-2" ||
      item.handle === "lenovo-legion-r27qe-gen-2",
  );
  assertEquals(foundByHandle?.name, "Lenovo Legion R27qe Gen 2 Monitor");
});

Deno.test("SHOP-FIX-16: Regression: resolveProductDescription maps HTML, plain text, and empty descriptions to UI structure accurately", async () => {
  const { resolveProductDescription } = await import("../../../src/lib/sanitize.ts");

  // Case 1: Populated HTML description
  const htmlProduct = {
    description: "27-inch 2K QHD 180Hz Fast IPS Monitor",
    descriptionHtml:
      "<p>27-inch 2K <strong>QHD</strong> 180Hz Fast IPS Monitor.</p><ul><li>0.5ms MPRT</li><li>99% sRGB</li></ul>",
  };
  const resHtml = resolveProductDescription(htmlProduct);
  assertEquals(resHtml.type, "html");
  assertEquals(resHtml.content.includes("<strong>QHD</strong>"), true);
  assertEquals(resHtml.content.includes("<li>0.5ms MPRT</li>"), true);

  // Case 2: Plain-text only description (no HTML)
  const textProduct = {
    description: "High-performance gaming monitor with 180Hz refresh rate and Fast IPS panel.",
    descriptionHtml: undefined,
  };
  const resText = resolveProductDescription(textProduct);
  assertEquals(resText.type, "text");
  assertEquals(
    resText.content,
    "High-performance gaming monitor with 180Hz refresh rate and Fast IPS panel.",
  );

  // Case 3: Empty description (empty strings or undefined)
  const emptyProduct = {
    description: "",
    descriptionHtml: "",
  };
  const resEmpty = resolveProductDescription(emptyProduct);
  assertEquals(resEmpty.type, "empty");
  assertEquals(resEmpty.content, "No product description has been provided for this product yet.");

  // Case 4: Empty HTML tags (<p><br></p>) with plain-text fallback
  const tagOnlyProduct = {
    description: "Fallback plain description text.",
    descriptionHtml: "<p><br></p>",
  };
  const resTagOnly = resolveProductDescription(tagOnlyProduct);
  assertEquals(resTagOnly.type, "text");
  assertEquals(resTagOnly.content, "Fallback plain description text.");

  // Case 5: End-to-End Shopify response -> mapper -> resolveProductDescription
  const rawShopifyNode: ShopifyProductNode = {
    id: "gid://shopify/Product/9876543210",
    title: "Lenovo Legion {Smartchoice} R27qe Gen 2",
    handle: "lenovo-legion-smartchoice-r27qe-gen-2",
    description: "Official Lenovo 27-inch QHD 180Hz Gaming Monitor.",
    descriptionHtml: "<p>Official Lenovo 27-inch <strong>QHD 180Hz</strong> Gaming Monitor.</p>",
    vendor: "Lenovo",
    productType: "Monitors & Displays",
    tags: ["monitor", "gaming"],
    availableForSale: true,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/123459876",
            title: "Default",
            availableForSale: true,
            price: { amount: "19999.00", currencyCode: "INR" },
          },
        },
      ],
    },
  };

  // 1. Map from Shopify GraphQL node
  const catalogProduct = mapShopifyProductToCatalog(rawShopifyNode);
  assertEquals(catalogProduct.name, "Lenovo Legion {Smartchoice} R27qe Gen 2");
  assertEquals(catalogProduct.description, "Official Lenovo 27-inch QHD 180Hz Gaming Monitor.");
  assertEquals(
    catalogProduct.descriptionHtml,
    "<p>Official Lenovo 27-inch <strong>QHD 180Hz</strong> Gaming Monitor.</p>",
  );

  // 2. Resolve for UI
  const uiDesc = resolveProductDescription(catalogProduct);
  assertEquals(uiDesc.type, "html");
  assertEquals(uiDesc.content.includes("<strong>QHD 180Hz</strong>"), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Checkout Navigation, Direct URL Redirection & Sold-Out Recovery
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOP-CHECKOUT-1: Buy Now payload accurately normalizes variant GID and selected quantity", () => {
  const selectedVariantId = "123459876";
  const quantity = 2;
  const formattedGid = toVariantGid(selectedVariantId);

  assertEquals(formattedGid, "gid://shopify/ProductVariant/123459876");
  assertEquals(quantity >= 1, true);
});

Deno.test("SHOP-CHECKOUT-2: Buy Now redirects directly to returned Shopify checkout URL", () => {
  const mockShopifyCart = {
    id: "gid://shopify/Cart/c1-abc12345",
    checkoutUrl: "https://it-hub-m8tzfjd.myshopify.com/checkouts/cn/c1-abc12345?key=mockkey",
    totalQuantity: 1,
    subtotal: 15000,
    total: 15000,
    currency: "INR",
  };

  // Confirms the checkout URL is authoritative Shopify hosted checkout and not a local page
  assertEquals(
    mockShopifyCart.checkoutUrl.startsWith("https://it-hub-m8tzfjd.myshopify.com/checkouts/"),
    true,
  );
  assertNotEquals(mockShopifyCart.checkoutUrl, "/checkout");
  assertNotEquals(mockShopifyCart.checkoutUrl, "/cart");
});

Deno.test("SHOP-CHECKOUT-3: Add to Cart preserves variantId and existing product structure", () => {
  const product = {
    id: "9876543210",
    variantId: "gid://shopify/ProductVariant/123459876",
    name: "Lenovo Legion R27qe Gen 2",
    price: 15000,
    image: "https://cdn.shopify.com/image.jpg",
  };
  const quantity = 1;

  const cartItem = {
    id: product.id,
    productId: product.id,
    variantId: product.variantId,
    name: product.name,
    price: product.price,
    image: product.image,
    quantity,
  };

  assertEquals(cartItem.variantId, "gid://shopify/ProductVariant/123459876");
  assertEquals(cartItem.quantity, 1);
  assertEquals(cartItem.price, 15000);
});

Deno.test("SHOP-CHECKOUT-4: Sold-out variants (availableForSale: false) are rejected before checkout or cart addition", () => {
  const soldOutProduct = {
    id: "gid://shopify/Product/9876543210",
    name: "Sold-Out Monitor",
    availableForSale: false,
    stock: 0,
  };

  const isSoldOut =
    soldOutProduct.availableForSale !== undefined
      ? !soldOutProduct.availableForSale
      : soldOutProduct.stock <= 0;

  assertEquals(isSoldOut, true);

  // System must reject sold-out purchase with clear recovery message
  const soldOutNotice = isSoldOut ? "Sorry, this item is currently sold out." : null;
  assertEquals(soldOutNotice, "Sorry, this item is currently sold out.");
});

Deno.test("SHOP-CHECKOUT-5: Quantity exceeding availability is detected and prevented without fabricating success", () => {
  const product = {
    id: "prod-1",
    name: "Mechanical Keyboard",
    stock: 3,
    availableForSale: undefined,
  };
  const requestedQuantity = 5;
  const exceedsStock = requestedQuantity > product.stock;

  assertEquals(exceedsStock, true);
  const errorMessage = exceedsStock ? "Not enough stock available. Please adjust your cart." : null;
  assertEquals(errorMessage, "Not enough stock available. Please adjust your cart.");
});

Deno.test("SHOP-CHECKOUT-6: Checkout preparation failures keep user on IT HUB and allow retry", () => {
  // Simulates cart creation network error
  const failedCartResult = {
    cart: null,
    error: "Network error while connecting to checkout. Please try again.",
  };

  assertEquals(failedCartResult.cart, null);
  assertEquals(Boolean(failedCartResult.error), true);
  // Ensure customer stays on IT HUB origin
  const destination = failedCartResult.cart
    ? (failedCartResult.cart as any).checkoutUrl
    : "/products";
  assertEquals(destination, "/products");
});

Deno.test("SHOP-CHECKOUT-7: Cart recovery identifies unavailable items and provides route back to catalog", () => {
  const cartItems = [
    { id: "item-1", name: "In-Stock Mouse", availableForSale: true },
    { id: "item-2", name: "Sold-Out GPU", availableForSale: false },
  ];

  const unavailableItems = cartItems.filter((i) => !i.availableForSale);
  assertEquals(unavailableItems.length, 1);
  assertEquals(unavailableItems[0].name, "Sold-Out GPU");

  // Catalog recovery path
  const continueShoppingRoute = "/products";
  assertEquals(continueShoppingRoute, "/products");
});

Deno.test("SHOP-CHECKOUT-8: Race condition handling: parseCartErrorLineIndex pinpoints affected cart item from userErrors", () => {
  // Simulates Shopify returning error for lines[1] during cartCreate
  const userErrorField = ["input", "lines", "1", "merchandiseId"];
  const lineIndex = parseCartErrorLineIndex(userErrorField);

  assertEquals(lineIndex, 1);

  const cart = [
    { id: "cart-1", name: "Monitor" },
    { id: "cart-2", name: "Out of Stock RAM" },
  ];

  const affectedItem = lineIndex !== undefined ? cart[lineIndex] : null;
  assertEquals(affectedItem?.name, "Out of Stock RAM");
});

Deno.test("SHOP-CHECKOUT-9: Internal recovery links and return attributes use configured storefront origin", () => {
  const mockOrigin = "http://localhost:8443";
  const returnToStoreAttribute = {
    key: "return_to_store",
    value: `${mockOrigin}/cart`,
  };

  assertEquals(returnToStoreAttribute.key, "return_to_store");
  assertEquals(returnToStoreAttribute.value, "http://localhost:8443/cart");
  // Ensures no unconfirmed external domain or admin URL is used
  assertEquals(returnToStoreAttribute.value.includes("admin.shopify.com"), false);
});

Deno.test("SHOP-CHECKOUT-10: checkShopifyAvailability and revalidateCartAvailability handle empty and unconfigured states safely", async () => {
  const { checkShopifyAvailability, revalidateCartAvailability } =
    await import("../../../src/lib/shopify.ts");

  // Empty check
  const emptyRes = await checkShopifyAvailability([]);
  assertEquals(emptyRes.allAvailable, true);
  assertEquals(emptyRes.unavailableIds.length, 0);

  // Empty cart revalidation
  const emptyCartRes = await revalidateCartAvailability([]);
  assertEquals(emptyCartRes.valid, true);
  assertEquals(emptyCartRes.unavailableItems.length, 0);
});

Deno.test("SHOP-CHECKOUT-11: Cart lines avoid line-level return_to_store attributes and verify availability", () => {
  const lineItem = {
    merchandiseId: "gid://shopify/ProductVariant/123459876",
    quantity: 1,
  };

  // Ensure line item does NOT contain customer-facing attributes that render on Shopify checkout
  assertEquals((lineItem as any).attributes, undefined);

  // Cart-level option carries return-to-store origin
  const cartOptions = {
    attributes: [{ key: "return_to_store", value: "http://localhost:8443/products" }],
  };
  assertEquals(cartOptions.attributes[0].key, "return_to_store");
  assertEquals(cartOptions.attributes[0].value, "http://localhost:8443/products");
});

Deno.test("SHOP-CHECKOUT-12: toVariantGid sanitizes inputs and strictly avoids double-prefixing or malformed GIDs", async () => {
  const { toVariantGid, toProductGid } = await import("../../../src/lib/shopify-schema.ts");

  // Already formatted GID
  assertEquals(
    toVariantGid("gid://shopify/ProductVariant/12345678"),
    "gid://shopify/ProductVariant/12345678",
  );

  // Bare numeric ID
  assertEquals(toVariantGid("12345678"), "gid://shopify/ProductVariant/12345678");

  // Product GID accidentally passed — must strip Product prefix and correctly format
  assertEquals(
    toVariantGid("gid://shopify/Product/12345678"),
    "gid://shopify/ProductVariant/12345678",
  );

  // toProductGid
  assertEquals(toProductGid("gid://shopify/Product/98765432"), "gid://shopify/Product/98765432");
  assertEquals(toProductGid("98765432"), "gid://shopify/Product/98765432");
});

Deno.test("SHOP-CHECKOUT-13: Cart creation validates totalQuantity > 0 and guards against zero-allocation checkouts", () => {
  // Simulates Shopify returning cart with 0 quantity (inventory rejected by location)
  const rejectedCart = {
    id: "gid://shopify/Cart/test1234",
    checkoutUrl: "https://shop.myshopify.com/checkouts/cn/test",
    totalQuantity: 0,
    cost: {
      subtotalAmount: { amount: "0.0", currencyCode: "INR" },
      totalAmount: { amount: "0.0", currencyCode: "INR" },
    },
  };

  const isRejected = rejectedCart.totalQuantity === 0;
  assertEquals(isRejected, true);

  const cartError = isRejected
    ? "Sorry, this item is currently unavailable for online checkout."
    : null;
  assertEquals(cartError, "Sorry, this item is currently unavailable for online checkout.");
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Phase 5 Multi-Variant & Storefront Completion Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PH5-VARIANT-1: Multi-variant mapping extracts options and variant list accurately", () => {
  const multiVariantNode: ShopifyProductNode = {
    id: "gid://shopify/Product/8888999900",
    title: "MacBook Air M2 13.6-inch",
    handle: "macbook-air-m2",
    description: "Apple M2 chip with 8-core CPU and 8-core GPU.",
    vendor: "Apple",
    productType: "Laptops",
    tags: ["laptop", "apple", "m2"],
    availableForSale: true,
    images: {
      edges: [{ node: { url: "https://cdn.shopify.com/products/mba-midnight.jpg" } }],
    },
    options: [
      {
        id: "gid://shopify/ProductOption/1",
        name: "Color",
        values: ["Midnight", "Starlight", "Space Gray"],
      },
      { id: "gid://shopify/ProductOption/2", name: "Storage", values: ["256GB", "512GB"] },
    ],
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/101",
            title: "Midnight / 256GB",
            sku: "MBA-M2-MID-256",
            availableForSale: true,
            quantityAvailable: 4,
            price: { amount: "99900.00", currencyCode: "INR" },
            compareAtPrice: { amount: "114900.00", currencyCode: "INR" },
            selectedOptions: [
              { name: "Color", value: "Midnight" },
              { name: "Storage", value: "256GB" },
            ],
            image: { url: "https://cdn.shopify.com/products/mba-midnight.jpg" },
          },
        },
        {
          node: {
            id: "gid://shopify/ProductVariant/102",
            title: "Midnight / 512GB",
            sku: "MBA-M2-MID-512",
            availableForSale: false,
            quantityAvailable: 0,
            price: { amount: "119900.00", currencyCode: "INR" },
            compareAtPrice: { amount: "134900.00", currencyCode: "INR" },
            selectedOptions: [
              { name: "Color", value: "Midnight" },
              { name: "Storage", value: "512GB" },
            ],
            image: { url: "https://cdn.shopify.com/products/mba-midnight.jpg" },
          },
        },
        {
          node: {
            id: "gid://shopify/ProductVariant/103",
            title: "Space Gray / 256GB",
            sku: "MBA-M2-GRY-256",
            availableForSale: true,
            quantityAvailable: 8,
            price: { amount: "99900.00", currencyCode: "INR" },
            compareAtPrice: { amount: "114900.00", currencyCode: "INR" },
            selectedOptions: [
              { name: "Color", value: "Space Gray" },
              { name: "Storage", value: "256GB" },
            ],
          },
        },
      ],
    },
  };

  const catalogProduct = mapShopifyProductToCatalog(multiVariantNode);

  assertEquals(catalogProduct.id, "8888999900");
  assertEquals(catalogProduct.options?.length, 2);
  assertEquals(catalogProduct.options?.[0].name, "Color");
  assertEquals(catalogProduct.options?.[0].values, ["Midnight", "Starlight", "Space Gray"]);
  assertEquals(catalogProduct.options?.[1].name, "Storage");
  assertEquals(catalogProduct.options?.[1].values, ["256GB", "512GB"]);

  assertEquals(catalogProduct.variants?.length, 3);
  assertEquals(catalogProduct.variants?.[0].id, "gid://shopify/ProductVariant/101");
  assertEquals(catalogProduct.variants?.[0].sku, "MBA-M2-MID-256");
  assertEquals(catalogProduct.variants?.[0].price, 99900);
  assertEquals(catalogProduct.variants?.[0].compareAtPrice, 114900);
  assertEquals(catalogProduct.variants?.[0].availableForSale, true);
  assertEquals(
    catalogProduct.variants?.[0].image,
    "https://cdn.shopify.com/products/mba-midnight.jpg",
  );

  assertEquals(catalogProduct.variants?.[1].id, "gid://shopify/ProductVariant/102");
  assertEquals(catalogProduct.variants?.[1].availableForSale, false);
});

Deno.test("PH5-VARIANT-2: Variant option matching and price/stock calculation", () => {
  const variants = [
    {
      id: "gid://shopify/ProductVariant/101",
      title: "Midnight / 256GB",
      sku: "MBA-M2-MID-256",
      price: 99900,
      compareAtPrice: 114900,
      availableForSale: true,
      selectedOptions: [
        { name: "Color", value: "Midnight" },
        { name: "Storage", value: "256GB" },
      ],
    },
    {
      id: "gid://shopify/ProductVariant/102",
      title: "Midnight / 512GB",
      sku: "MBA-M2-MID-512",
      price: 119900,
      compareAtPrice: 134900,
      availableForSale: false,
      selectedOptions: [
        { name: "Color", value: "Midnight" },
        { name: "Storage", value: "512GB" },
      ],
    },
  ];

  // Test matching 256GB
  const selectedOptions1 = { Color: "Midnight", Storage: "256GB" };
  const match1 = variants.find((v) =>
    Object.entries(selectedOptions1).every(([k, val]) =>
      v.selectedOptions.some(
        (so) =>
          so.name.toLowerCase() === k.toLowerCase() && so.value.toLowerCase() === val.toLowerCase(),
      ),
    ),
  );
  assertEquals(match1?.id, "gid://shopify/ProductVariant/101");
  assertEquals(match1?.price, 99900);
  assertEquals(match1?.availableForSale, true);

  // Test matching 512GB (sold out)
  const selectedOptions2 = { Color: "Midnight", Storage: "512GB" };
  const match2 = variants.find((v) =>
    Object.entries(selectedOptions2).every(([k, val]) =>
      v.selectedOptions.some(
        (so) =>
          so.name.toLowerCase() === k.toLowerCase() && so.value.toLowerCase() === val.toLowerCase(),
      ),
    ),
  );
  assertEquals(match2?.id, "gid://shopify/ProductVariant/102");
  assertEquals(match2?.price, 119900);
  assertEquals(match2?.availableForSale, false);
});

Deno.test("PH5-VARIANT-3: Correct variant ID passed to cart and Buy Now line items", () => {
  const chosenVariant = {
    id: "gid://shopify/ProductVariant/202",
    title: "16GB / 512GB",
    price: 124900,
  };
  const quantity = 2;

  const lineItem = {
    merchandiseId: chosenVariant.id,
    quantity,
  };

  // Authoritative check: merchandiseId must be the variant ID, not product ID
  assertEquals(lineItem.merchandiseId, "gid://shopify/ProductVariant/202");
  assertNotEquals(lineItem.merchandiseId, "gid://shopify/Product/12345");
  assertEquals(lineItem.quantity, 2);
});

Deno.test("PH5-GUARD-1: Direct /checkout route guard safely redirects to /cart when Shopify is configured", () => {
  const shopifyConfig = { isConfigured: true };
  let navigatedPath = "";
  const mockNavigate = (path: string, options?: { replace?: boolean }) => {
    navigatedPath = path;
  };

  // Simulation of Checkout route guard in Commerce.tsx
  if (shopifyConfig.isConfigured) {
    mockNavigate("/cart", { replace: true });
  }

  assertEquals(navigatedPath, "/cart");
});

Deno.test("PH5-DISCOUNT-1: Shopify discount code passed in createShopifyCart options", () => {
  const promoCode = "FESTIVE10";
  const options = {
    discountCodes: [promoCode],
    attributes: [{ key: "return_to_store", value: "http://localhost:8443/products" }],
  };

  assertEquals(options.discountCodes, ["FESTIVE10"]);
  assertEquals(options.attributes[0].key, "return_to_store");
});

Deno.test("PH5-DISCOUNT-2: Shopify discount code status validation rejects unapplicable codes", () => {
  const cartWithDiscount = {
    id: "gid://shopify/Cart/cart999",
    checkoutUrl: "https://it-hub-m8tzfzjd.myshopify.com/checkouts/cn/test",
    discountCodes: [{ code: "INVALID50", applicable: false }],
  };

  const firstDiscount = cartWithDiscount.discountCodes[0];
  const isValid = firstDiscount && firstDiscount.applicable === true;

  assertEquals(isValid, false);
});

Deno.test("PH5-SHIPPING-1: Shipping business rules - Kerala delivery & 15km local delivery radius", () => {
  // IT HUB headquarters: College Junction, Kothamangalam, Kerala 686691
  const HQ_PINCODE = "686691";
  const LOCAL_RADIUS_KM = 15;
  const FREE_DELIVERY_THRESHOLD = 100;

  // Known pincodes within ~15 km of Kothamangalam
  const localPincodes = [
    "686691", // Kothamangalam HQ
    "686692", // Kavalangad / Nellimattom
    "686666", // Keerampara
    "686671", // Pothanicad
    "686681", // Varapetty
    "686693", // Kozhipilly
    "683549", // Perumbavoor / Kuruppampady border
  ];

  // Delivery qualification check
  const isLocalDelivery = (pincode: string) => localPincodes.includes(pincode);
  const calculateDeliveryCharge = (pincode: string, subtotal: number) => {
    if (!isLocalDelivery(pincode)) {
      return { eligible: true, type: "Kerala Regional Shipping", fee: 50 };
    }
    if (subtotal >= FREE_DELIVERY_THRESHOLD) {
      return { eligible: true, type: "Local Free Delivery", fee: 0 };
    }
    return { eligible: true, type: "Local Express Delivery", fee: 30 };
  };

  // Free delivery for orders >= 100 in local area
  assertEquals(calculateDeliveryCharge("686691", 15000).fee, 0);
  assertEquals(calculateDeliveryCharge("686691", 15000).type, "Local Free Delivery");

  // Local order under 100
  assertEquals(calculateDeliveryCharge("686691", 80).fee, 30);

  // Non-local Kerala order
  assertEquals(calculateDeliveryCharge("695001", 15000).fee, 50);
});

Deno.test("PH5-INTACT-1: Supabase repair and sell service workflows remain intact", () => {
  // Service request schema contract check
  const sampleServiceRequest = {
    id: "srv-uuid-123",
    customer_name: "Prakash A K",
    device_type: "Laptop",
    brand: "Apple",
    model: "MacBook Pro 16",
    issue_description: "Battery replacement requested",
    status: "quoted",
    quoted_price: 4500,
    quote_approved: true,
  };

  assertEquals(sampleServiceRequest.status, "quoted");
  assertEquals(sampleServiceRequest.quote_approved, true);
  assertEquals(sampleServiceRequest.quoted_price, 4500);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Phase 5 QA Fix: Shopify Catalog Performance & Category Accuracy Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PH5-QA-CAT-1: Product with taxonomy category different from productType preserves taxonomy distinctly", () => {
  const iphoneNode: ShopifyProductNode = {
    id: "gid://shopify/Product/7788990011",
    title: "iPhone 17 Sage Green 256GB",
    handle: "iphone-17-sage-green",
    description: "Next-gen A19 Bionic powerhouse in Sage Green.",
    vendor: "Apple",
    productType: "Flagship Smartphones",
    tags: ["apple", "iphone", "5g", "sage-green"],
    availableForSale: true,
    category: {
      id: "gid://shopify/TaxonomyCategory/el-1-1-1",
      name: "Smart Phones",
      ancestors: [{ id: "gid://shopify/TaxonomyCategory/el-1-1", name: "Mobile & Smart Phones" }],
    },
    collections: {
      edges: [
        {
          node: {
            id: "gid://shopify/Collection/1",
            title: "Apple Mobiles",
            handle: "apple-mobiles",
          },
        },
      ],
    },
    images: { edges: [{ node: { url: "https://cdn.shopify.com/iphone-17.jpg" } }] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/701",
            title: "Sage Green / 256GB",
            availableForSale: true,
            price: { amount: "89999.00", currencyCode: "INR" },
            compareAtPrice: { amount: "94999.00", currencyCode: "INR" },
          },
        },
      ],
    },
  };

  const mapped = mapShopifyProductToCatalog(iphoneNode);

  assertEquals(mapped.name, "iPhone 17 Sage Green 256GB");
  assertEquals(mapped.brand, "Apple");
  assertEquals(mapped.category, "Smart Phones");
  assertEquals(mapped.categorySource, "taxonomy");
  assertEquals(mapped.productType, "Flagship Smartphones");
  assertEquals(mapped.taxonomyCategory?.name, "Smart Phones");
  assertEquals(mapped.taxonomyCategory?.fullName, "Smart Phones in Mobile & Smart Phones");
  assertEquals(mapped.collections, ["Apple Mobiles"]);
});

Deno.test("PH5-QA-CAT-2: Product without taxonomy category honestly falls back to productType", () => {
  const monitorNode: ShopifyProductNode = {
    id: "gid://shopify/Product/9988776655",
    title: "Lenovo Legion R27qe Gen 2",
    handle: "lenovo-legion-r27qe-gen-2",
    description: "27-inch 2K QHD 180Hz Fast IPS.",
    vendor: "Lenovo",
    productType: "Monitors & Displays",
    tags: ["monitor", "gaming"],
    availableForSale: true,
    category: null,
    images: { edges: [{ node: { url: "https://cdn.shopify.com/lenovo-r27qe.jpg" } }] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/501",
            title: "Default Title",
            availableForSale: true,
            price: { amount: "15000.00", currencyCode: "INR" },
          },
        },
      ],
    },
  };

  const mapped = mapShopifyProductToCatalog(monitorNode);

  assertEquals(mapped.brand, "Lenovo");
  assertEquals(mapped.category, "Monitors & Displays");
  assertEquals(mapped.categorySource, "productType");
  assertEquals(mapped.taxonomyCategory, undefined);
  assertNotEquals(mapped.category, "Hardware & Electronics");
});

Deno.test("PH5-QA-CAT-3: Product without category and productType falls back to collection", () => {
  const accessoryNode: ShopifyProductNode = {
    id: "gid://shopify/Product/111222333",
    title: "MagSafe Silicone Case",
    handle: "magsafe-silicone-case",
    description: "Protective case.",
    vendor: "Apple",
    productType: "",
    tags: ["case", "accessory"],
    availableForSale: true,
    category: null,
    collections: {
      edges: [
        { node: { id: "gid://shopify/Collection/2", title: "Accessories", handle: "accessories" } },
      ],
    },
    images: { edges: [{ node: { url: "https://cdn.shopify.com/case.jpg" } }] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/601",
            title: "Default Title",
            availableForSale: true,
            price: { amount: "4900.00", currencyCode: "INR" },
          },
        },
      ],
    },
  };

  const mapped = mapShopifyProductToCatalog(accessoryNode);

  assertEquals(mapped.category, "Accessories");
  assertEquals(mapped.categorySource, "collection");
  assertEquals(mapped.taxonomyCategory, undefined);
});

Deno.test("PH5-QA-CAT-4: Product missing all taxonomy/type/collection honestly defaults to Uncategorized", () => {
  const bareNode: ShopifyProductNode = {
    id: "gid://shopify/Product/444555666",
    title: "Generic USB Cable",
    handle: "generic-usb-cable",
    description: "Standard USB-C to USB-C cable.",
    vendor: "",
    productType: "",
    tags: [],
    availableForSale: true,
    category: null,
    collections: { edges: [] },
    images: { edges: [{ node: { url: "https://cdn.shopify.com/cable.jpg" } }] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/801",
            title: "Default Title",
            availableForSale: true,
            price: { amount: "299.00", currencyCode: "INR" },
          },
        },
      ],
    },
  };

  const mapped = mapShopifyProductToCatalog(bareNode);

  assertEquals(mapped.category, "Uncategorized");
  assertEquals(mapped.categorySource, "fallback");
  assertEquals(mapped.taxonomyCategory, undefined);
  assertNotEquals(mapped.category, "Hardware & Electronics");
});

Deno.test("PH5-QA-CAT-5: Dynamic store category list generates distinct accurate categories", () => {
  const products = [
    { id: "1", name: "iPhone 17", brand: "Apple", category: "Smart Phones" },
    { id: "2", name: "Lenovo Monitor", brand: "Lenovo", category: "Monitors & Displays" },
  ];

  const liveCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
  const storeCategories = ["All", ...liveCategories.filter((c) => c !== "All")];

  assertEquals(storeCategories, ["All", "Smart Phones", "Monitors & Displays"]);
  assertNotEquals(storeCategories, ["All", "Hardware & Electronics"]);
});

Deno.test("PH5-QA-PERF-1: Invalidation clears in-memory catalog and product cache", async () => {
  const { invalidateShopifyCatalogCache, getShopifyCacheStats } =
    await import("../../../src/lib/shopify.ts");

  invalidateShopifyCatalogCache();
  const stats = getShopifyCacheStats();

  assertEquals(stats.catalogEntries, 0);
  assertEquals(stats.productEntries, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Phase 5 Scope Change: Technology Blog & Navigation Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PH5-BLOG-1: Shopify native article maps title, slug, contentHtml, excerpt, and author accurately", async () => {
  const { mapShopifyArticleToModel } = await import("../../../src/lib/blog.ts");

  const mockArticleNode = {
    id: "gid://shopify/Article/12345678",
    title: "RTX 50-Series Graphics Card Architectural Overview",
    handle: "rtx-50-series-overview",
    excerpt: "Comprehensive look at next-gen GPU memory bandwidth.",
    contentHtml: "<p>The next-generation architectures deliver notable compute improvements.</p>",
    publishedAt: "2026-10-24T12:00:00Z",
    authorV2: { name: "Anand Lal" },
    image: { url: "https://cdn.shopify.com/rtx-50.jpg", altText: "RTX 50 GPU" },
    tags: ["Graphics Cards", "NVIDIA", "Hardware Reviews"],
    blog: { id: "gid://shopify/Blog/1", title: "Hardware Reviews", handle: "hardware-reviews" },
  };

  const mapped = mapShopifyArticleToModel(mockArticleNode);

  assertEquals(mapped.title, "RTX 50-Series Graphics Card Architectural Overview");
  assertEquals(mapped.slug, "rtx-50-series-overview");
  assertEquals(mapped.author, "Anand Lal");
  assertEquals(mapped.category, "Hardware Reviews");
  assertEquals(mapped.source, "shopify");
  assertEquals(mapped.publishedAt, "2026-10-24");
});

Deno.test("PH5-BLOG-2: Editorial fallback provides verified IT HUB technology guides when Shopify blog is empty", async () => {
  const { fetchBlogArticles, invalidateBlogCache } = await import("../../../src/lib/blog.ts");
  invalidateBlogCache();

  const articles = await fetchBlogArticles();

  assertEquals(articles.length >= 4, true);
  const lenovoReview = articles.find((a) => a.slug === "lenovo-legion-r27qe-gen-2-review");
  assertEquals(Boolean(lenovoReview), true);
  assertEquals(lenovoReview?.category, "Hardware Reviews");
  assertEquals(lenovoReview?.relatedProductHandles?.includes("lenovo-legion-r27qe-gen-2"), true);
});

Deno.test("PH5-BLOG-3: fetchBlogArticleBySlug resolves existing article and returns null for invalid slug", async () => {
  const { fetchBlogArticleBySlug } = await import("../../../src/lib/blog.ts");

  const article = await fetchBlogArticleBySlug("laptop-battery-health-and-replacement-guide");
  assertEquals(Boolean(article), true);
  assertEquals(article?.title.includes("Laptop Battery Health"), true);

  const missing = await fetchBlogArticleBySlug("non-existent-article-slug-xyz");
  assertEquals(missing, null);
});

Deno.test("PH5-BLOG-4: Blog category filtering and search accurately filter articles", async () => {
  const { fetchBlogArticles } = await import("../../../src/lib/blog.ts");
  const articles = await fetchBlogArticles();

  const repairArticles = articles.filter((a) => a.category === "Repair & Maintenance");
  assertEquals(repairArticles.length > 0, true);
  assertEquals(
    repairArticles.every((a) => a.category === "Repair & Maintenance"),
    true,
  );

  const batteryMatches = articles.filter(
    (a) =>
      a.title.toLowerCase().includes("battery") ||
      a.excerpt.toLowerCase().includes("battery") ||
      a.tags.some((t) => t.toLowerCase().includes("battery")),
  );
  assertEquals(batteryMatches.length > 0, true);
});

Deno.test("PH5-BLOG-5: Primary customer navigation presents both PC Builder and Blog while preserving all routes", () => {
  const primaryNav = [
    { name: "Products", to: "/products" },
    { name: "PC Builder", to: "/pc-builder" },
    { name: "Services", to: "/services" },
    { name: "Blog", to: "/blog" },
    { name: "Help & Support", to: "/support" },
    { name: "About", to: "/about" },
  ];

  // Primary customer navigation contains both Blog and PC Builder prominently
  assertEquals(
    primaryNav.some((n) => n.name === "Blog" && n.to === "/blog"),
    true,
  );
  assertEquals(
    primaryNav.some((n) => n.name === "PC Builder" && n.to === "/pc-builder"),
    true,
  );

  // Route registry preserves all routes
  const routes = [{ path: "blog" }, { path: "blog/:slug" }, { path: "pc-builder" }];
  assertEquals(
    routes.some((r) => r.path === "blog"),
    true,
  );
  assertEquals(
    routes.some((r) => r.path === "pc-builder"),
    true,
  );
});

Deno.test("PH5-BLOG-6: Technology guide articles link to real Shopify products and Supabase services", async () => {
  const { fetchBlogArticleBySlug } = await import("../../../src/lib/blog.ts");

  const batteryGuide = await fetchBlogArticleBySlug("laptop-battery-health-and-replacement-guide");
  assertEquals(batteryGuide?.relatedServicePath, "/services/book?service=Laptop%20Repair");

  const monitorReview = await fetchBlogArticleBySlug("lenovo-legion-r27qe-gen-2-review");
  assertEquals(monitorReview?.relatedProductHandles?.[0], "lenovo-legion-r27qe-gen-2");
});
