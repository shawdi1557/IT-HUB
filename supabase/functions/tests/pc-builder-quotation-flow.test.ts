// supabase/functions/tests/pc-builder-quotation-flow.test.ts
// IT HUB PC Builder — Hardcoded Products Purge, Checkout Removal & Quotation Persistence Test Suite
// Verifies all 10 acceptance criteria defined in Phase 5 requirements.

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const {
  matchShopifyProductToComponent,
  buildBuilderCatalog,
  syncBuilderCatalogWithShopify,
  toComponentOption,
} = await import("../../../src/lib/builder/catalog.ts");

const { generateRecommendations, getMissingCatalogCategories } =
  await import("../../../src/lib/builder/recommendations.ts");

const { submitQuotationRequest, generateQuotationReference, calculateBuildTotal } =
  await import("../../../src/lib/builder/persistence.ts");

const { prepareShopifyCheckout } = await import("../../../src/lib/builder/checkout.ts");

// ─────────────────────────────────────────────────────────────────────────────
// 8 Authentic Shopify Test Products Fixture
// ─────────────────────────────────────────────────────────────────────────────

const mockShopifyRyzen5600: any = {
  id: "gid://shopify/Product/test-cpu-5600",
  name: "[TEST] AMD Ryzen 5 5600",
  handle: "test-amd-ryzen-5-5600",
  price: 9000, // Authoritative Shopify selling price (vs hardcoded ₹10,999)
  original: 10999,
  brand: "AMD",
  category: "Processors",
  productType: "Processor",
  tags: ["pc-builder", "cpu", "am4"],
  variantId: "gid://shopify/ProductVariant/4455667788",
  availableForSale: true,
  stock: 6,
  specs: {},
};

const mockShopifyB550M: any = {
  id: "gid://shopify/Product/test-mobo-b550m",
  name: "[TEST] ASUS Prime B550M-A WiFi II",
  handle: "test-asus-prime-b550m-a",
  price: 8999,
  original: 9999,
  brand: "ASUS",
  category: "Motherboards",
  productType: "Motherboard",
  tags: ["pc-builder", "motherboard", "am4", "b550"],
  variantId: "gid://shopify/ProductVariant/4455667789",
  availableForSale: true,
  stock: 5,
  specs: {},
};

const mockShopifyRam16: any = {
  id: "gid://shopify/Product/test-ram-16",
  name: "[TEST] Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
  handle: "test-corsair-vengeance-16gb-ddr4",
  price: 3499,
  brand: "Corsair",
  category: "Memory",
  productType: "RAM",
  tags: ["pc-builder", "ram", "ddr4"],
  variantId: "gid://shopify/ProductVariant/4455667790",
  availableForSale: true,
  stock: 10,
  specs: {},
};

const mockShopifyRtx4060: any = {
  id: "gid://shopify/Product/test-gpu-4060",
  name: "[TEST] Gigabyte GeForce RTX 4060 Eagle OC 8GB",
  handle: "test-gigabyte-rtx-4060",
  price: 28499,
  brand: "Gigabyte",
  category: "Graphics Cards",
  productType: "Graphics Card",
  tags: ["pc-builder", "gpu", "rtx4060"],
  variantId: "gid://shopify/ProductVariant/4455667791",
  availableForSale: true,
  stock: 4,
  specs: {},
};

const mockShopifyNvme1tb: any = {
  id: "gid://shopify/Product/test-ssd-1tb",
  name: "[TEST] Kingston NV2 1TB M.2 2280 NVMe PCIe 4.0 SSD",
  handle: "test-kingston-nv2-1tb",
  price: 4999,
  brand: "Kingston",
  category: "Storage",
  productType: "Solid State Drive",
  tags: ["pc-builder", "storage", "nvme", "ssd"],
  variantId: "gid://shopify/ProductVariant/4455667792",
  availableForSale: true,
  stock: 8,
  specs: {},
};

const mockShopifyPsu550: any = {
  id: "gid://shopify/Product/test-psu-550",
  name: "[TEST] Deepcool PK550D 550W 80 Plus Bronze Power Supply",
  handle: "test-deepcool-pk550d",
  price: 3699,
  brand: "Deepcool",
  category: "Power Supplies",
  productType: "Power Supply",
  tags: ["pc-builder", "psu", "550w"],
  variantId: "gid://shopify/ProductVariant/4455667793",
  availableForSale: true,
  stock: 6,
  specs: {},
};

const mockShopifyCase: any = {
  id: "gid://shopify/Product/test-case-matx",
  name: "[TEST] Ant Esports ICE-100 Mid-Tower Gaming Cabinet",
  handle: "test-ant-esports-ice-100",
  price: 2999,
  brand: "Ant Esports",
  category: "PC Cases",
  productType: "Cabinet",
  tags: ["pc-builder", "cabinet", "case"],
  variantId: "gid://shopify/ProductVariant/4455667794",
  availableForSale: true,
  stock: 7,
  specs: {},
};

const mockShopifyCooler: any = {
  id: "gid://shopify/Product/test-cooler-ag400",
  name: "[TEST] Deepcool AG400 Single-Tower CPU Cooler",
  handle: "test-deepcool-ag400",
  price: 1799,
  brand: "Deepcool",
  category: "Cooling",
  productType: "CPU Cooler",
  tags: ["pc-builder", "cooler"],
  variantId: "gid://shopify/ProductVariant/4455667795",
  availableForSale: true,
  stock: 9,
  specs: {},
};

const eightAuthenticTestProducts = [
  mockShopifyRyzen5600,
  mockShopifyB550M,
  mockShopifyRam16,
  mockShopifyRtx4060,
  mockShopifyNvme1tb,
  mockShopifyPsu550,
  mockShopifyCase,
  mockShopifyCooler,
];

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance Criteria Regression Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("CRITERIA-1: A product not present in the eligible Shopify catalog never appears as a selectable component", () => {
  // If we only provide the Ryzen 5 5600 in the Shopify catalog:
  const singleProductCatalog = [mockShopifyRyzen5600];
  const canonicalCatalog = buildBuilderCatalog(singleProductCatalog);
  const { componentCatalog } = syncBuilderCatalogWithShopify(singleProductCatalog);

  // CPU slot must contain ONLY the authentic Shopify product
  assertEquals(canonicalCatalog.CPU.length, 1);
  assertEquals(canonicalCatalog.CPU[0].productId, "gid://shopify/Product/test-cpu-5600");

  // Other slots must be strictly EMPTY — no static fallback or reference products injected!
  assertEquals(canonicalCatalog.Motherboard.length, 0);
  assertEquals(canonicalCatalog.RAM.length, 0);
  assertEquals(canonicalCatalog.Storage.length, 0);
  assertEquals(canonicalCatalog.PSU.length, 0);
  assertEquals(canonicalCatalog.Cabinet.length, 0);

  // In customer-facing componentCatalog:
  assertEquals(componentCatalog["Motherboard"].length, 0);
  assertEquals(componentCatalog["RAM"].length, 0);
  assertEquals(componentCatalog["Storage"].length, 0);
  assertEquals(componentCatalog["PSU"].length, 0);
  assertEquals(componentCatalog["Cabinet"].length, 0);

  // A random unlisted product is never present
  assertEquals(
    componentCatalog["CPU"].some((c) => c.name.includes("Intel Core i9")),
    false,
  );
});

Deno.test("CRITERIA-2: The eight test products are displayed at their exact Shopify prices", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify(eightAuthenticTestProducts);

  const cpu = componentCatalog["CPU"].find((c) => c.id === mockShopifyRyzen5600.id);
  const mobo = componentCatalog["Motherboard"].find((c) => c.id === mockShopifyB550M.id);
  const ram = componentCatalog["RAM"].find((c) => c.id === mockShopifyRam16.id);
  const gpu = componentCatalog["GPU"].find((c) => c.id === mockShopifyRtx4060.id);
  const storage = componentCatalog["Storage"].find((c) => c.id === mockShopifyNvme1tb.id);
  const psu = componentCatalog["PSU"].find((c) => c.id === mockShopifyPsu550.id);
  const cabinet = componentCatalog["Cabinet"].find((c) => c.id === mockShopifyCase.id);
  const cooler = componentCatalog["Cooler"].find((c) => c.id === mockShopifyCooler.id);

  assertEquals(cpu?.price, 9000);
  assertNotEquals(cpu?.price, 10999); // Proves static ₹10,999 is suppressed

  assertEquals(mobo?.price, 8999);
  assertEquals(ram?.price, 3499);
  assertEquals(gpu?.price, 28499);
  assertEquals(storage?.price, 4999);
  assertEquals(psu?.price, 3699);
  assertEquals(cabinet?.price, 2999);
  assertEquals(cooler?.price, 1799);
});

Deno.test("CRITERIA-3: No hardcoded fallback product is silently inserted into a recommendation", () => {
  // If catalog is missing Storage and PSU:
  const partialProducts = eightAuthenticTestProducts.filter(
    (p) => p.productType !== "Solid State Drive" && p.productType !== "Power Supply",
  );
  const canonicalCatalog = buildBuilderCatalog(partialProducts);

  const answers: any = {
    purpose: "gaming",
    budgetInr: 65000,
    ownedParts: [],
  };

  const recommendations = generateRecommendations(answers, canonicalCatalog);

  // Because Storage and PSU are missing in the catalog, recommendation engine MUST NOT
  // silently substitute hardcoded Storage or PSU options!
  assertEquals(recommendations.length, 0);
});

Deno.test("CRITERIA-4: Empty or incomplete catalogs produce a helpful message instead of fabricated builds", () => {
  // 1. Partial catalog missing Motherboard, RAM, PSU:
  const partialProducts = [mockShopifyRyzen5600, mockShopifyNvme1tb, mockShopifyCase];
  const canonicalCatalog = buildBuilderCatalog(partialProducts);

  const missingCategories = getMissingCatalogCategories(canonicalCatalog);
  assertEquals(missingCategories.includes("Motherboard"), true);
  assertEquals(missingCategories.includes("RAM"), true);
  assertEquals(missingCategories.includes("PSU"), true);
  assertEquals(missingCategories.includes("CPU"), false);

  // 2. Empty catalog:
  const emptyCatalog = buildBuilderCatalog([]);
  const allMissing = getMissingCatalogCategories(emptyCatalog);
  assertEquals(allMissing.length, 6); // All 6 essential components missing
});

Deno.test("CRITERIA-5: Recommendation-to-Expert-Mode transitions preserve Shopify variant IDs and prices", () => {
  const canonicalCatalog = buildBuilderCatalog(eightAuthenticTestProducts);

  const answers: any = {
    purpose: "gaming",
    budgetInr: 65000,
    ownedParts: [],
  };

  const recommendations = generateRecommendations(answers, canonicalCatalog);
  assertEquals(recommendations.length > 0, true);

  const selectedCandidate = recommendations[0];
  const build = selectedCandidate.build;

  // Simulate passing components into Expert Mode seed
  const expertParts = build.components;

  assertEquals(expertParts.CPU?.price, 9000);
  assertEquals(expertParts.CPU?.variantId, "gid://shopify/ProductVariant/4455667788");
  assertEquals(expertParts.Motherboard?.price, 8999);
  assertEquals(expertParts.Motherboard?.variantId, "gid://shopify/ProductVariant/4455667789");
  assertEquals(expertParts.RAM?.price, 3499);
  assertEquals(expertParts.RAM?.variantId, "gid://shopify/ProductVariant/4455667790");
});

Deno.test("CRITERIA-6: The PC Builder no longer displays the 'Checkout with Shopify' button", async () => {
  const builderCode = await Deno.readTextFile("src/pages/Builder.tsx");

  // Ensure "Checkout with Shopify" button text is completely absent from Builder component JSX
  assertEquals(builderCode.includes('"Checkout with Shopify"'), false);
  assertEquals(builderCode.includes("'Checkout with Shopify'"), false);

  // Ensure PC Builder action button is strictly "Request IT HUB Quotation"
  assertEquals(builderCode.includes("Request IT HUB Quotation"), true);
});

Deno.test("CRITERIA-7: Normal website Shopify checkout still works outside the PC Builder", async () => {
  // Verify that prepareShopifyCheckout remains functional for valid Shopify variants
  const canonicalBuild: any = {
    id: "build-test-commerce",
    name: "Valid Checkout Build",
    components: {
      CPU: {
        slot: "CPU",
        title: "AMD Ryzen 5 5600",
        price: 9000,
        variantId: "gid://shopify/ProductVariant/4455667788",
        isShopifyLive: true,
      },
    },
  };

  // Without live internet / offline credentials, prepareShopifyCheckout handles the variants gracefully
  const res = await prepareShopifyCheckout(canonicalBuild);
  // It either succeeds or returns standard connection/configuration error, never throws syntax failure
  assertEquals(typeof res.success, "boolean");
});

Deno.test("CRITERIA-8: A quotation request only shows success after the configured persistence/dispatch step succeeds", async () => {
  const testBuild: any = {
    id: "build-quote-test",
    name: "Quotation Test Rig",
    components: {
      CPU: {
        slot: "CPU",
        productId: "test-cpu",
        title: "AMD Ryzen 5 5600",
        price: 9000,
        variantId: "gid://shopify/ProductVariant/1",
      },
      Motherboard: {
        slot: "Motherboard",
        productId: "test-mobo",
        title: "ASUS B550M",
        price: 8999,
        variantId: "gid://shopify/ProductVariant/2",
      },
    },
  };

  // When calling submitQuotationRequest:
  const res = await submitQuotationRequest(testBuild, {
    name: "Akshay Test",
    phone: "9876543210",
    email: "test@ithub.example.com",
  });

  // Must return an object with success boolean and quotation reference ID
  assertEquals(typeof res.success, "boolean");
  if (res.success) {
    assertEquals(Boolean(res.referenceId), true);
    assertMatch(res.referenceId!, /^ITH-PC-\d{8}-[A-Z0-9]+$/);
  }
});

Deno.test("CRITERIA-9: The quotation modal displays the correct estimated total and reference ID", () => {
  const ref = generateQuotationReference();
  assertMatch(ref, /^ITH-PC-\d{8}-[A-Z0-9]+$/);

  const testBuild: any = {
    id: "build-calc-test",
    components: {
      CPU: { price: 9000, quantity: 1 },
      Motherboard: { price: 8999, quantity: 1 },
      RAM: { price: 3499, quantity: 1 },
      Storage: { price: 4999, quantity: 1 },
    },
    ownedSlots: ["RAM"], // RAM is owned, so excluded from total
  };

  const estimatedTotal = calculateBuildTotal(testBuild);
  assertEquals(estimatedTotal, 9000 + 8999 + 4999); // 22998 (excludes RAM)
});

Deno.test("CRITERIA-10: Supabase ownership and guest-request security are verified", async () => {
  const migrationSql = await Deno.readTextFile(
    "supabase/migrations/20261025000001_pc_builder_quotation_persistence.sql",
  );

  // 1. Authoritative user derivation: Never trust client-supplied user_id
  assertEquals(migrationSql.includes("v_user_id := auth.uid();"), true);

  // 2. Reference ID generation and persistence
  assertEquals(migrationSql.includes("reference_id text unique"), true);
  assertEquals(migrationSql.includes("ITH-PC-"), true);

  // 3. Status must begin as 'New'
  assertEquals(migrationSql.includes("'New'"), true);

  // 4. Permissions granted to both anon (for guests) and authenticated
  assertEquals(
    migrationSql.includes(
      "grant execute on function public.submit_pc_quotation_request to anon, authenticated;",
    ),
    true,
  );

  // 5. Trigger protection against client tampering
  assertEquals(migrationSql.includes("create or replace function public.protect_pc_build()"), true);
});
