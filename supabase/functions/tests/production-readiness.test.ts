// supabase/functions/tests/production-readiness.test.ts
// Test-Driven Development (TDD) Suite for IT HUB Production Readiness Correction
// Phase 1: Fresh Product Catalog & Featured Products
// Phase 2: Category Canonical Mapping & Non-Zero Counts
// Phase 3: Service Quotation Payment Integration (UPI + Pay at IT HUB)
// Phase 4: Service Tracker Canonical Reference Input & Search Normalization

import {
  assertEquals,
  assertNotEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: FRESH PRODUCTS CLASSIFICATION & FEATURED PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PROD-FRESH-1: isFreshProduct strictly validates condition is 'New' and secondHand is falsy", async () => {
  // @ts-ignore
  const { isFreshProduct, getDetailedProductClassification } =
    await import("../../../src/lib/relatedProducts.ts");

  const freshPhone = {
    id: "prod-fresh-1",
    name: "iPhone 17 Sage Green",
    price: 89999,
    condition: "New",
    secondHand: false,
    tags: ["Mobile Phone", "New", "Apple"],
    collections: ["Mobile Phones Fresh"],
    availableForSale: true,
  };

  const preOwnedPhone1 = {
    id: "prod-used-1",
    name: "iphone 16 warranty till dec bh 91|TEAL 128",
    price: 52000,
    condition: "Good",
    secondHand: true,
    tags: ["Apple", "Mobile Phone", "Used"],
    collections: [],
    availableForSale: true,
  };

  const preOwnedPhone2 = {
    id: "prod-used-2",
    name: "vivo v80 non active 8gb 256gb",
    price: 24000,
    condition: "Good",
    secondHand: true,
    tags: ["Mobile Phone", "Used", "Vivo"],
    collections: [],
    availableForSale: true,
  };

  const preOwnedTablet = {
    id: "prod-used-3",
    name: "IPAD MINI AIR 6TH GEN 8 INCH 256GB WIFI ONLY",
    price: 38000,
    condition: "Good",
    secondHand: true,
    tags: ["Apple", "Tablet", "Used"],
    collections: [],
    availableForSale: true,
  };

  const unclassifiedItem = {
    id: "prod-unclass-1",
    name: "Generic Unclassified Cable",
    price: 299,
    condition: undefined,
    secondHand: false,
    tags: [],
    collections: [],
    availableForSale: true,
  };

  // Fresh assertions
  assertEquals(isFreshProduct(freshPhone), true);
  assertEquals(getDetailedProductClassification(freshPhone), "fresh");

  // Pre-owned assertions
  assertEquals(isFreshProduct(preOwnedPhone1), false);
  assertEquals(getDetailedProductClassification(preOwnedPhone1), "pre-owned");

  assertEquals(isFreshProduct(preOwnedPhone2), false);
  assertEquals(getDetailedProductClassification(preOwnedPhone2), "pre-owned");

  assertEquals(isFreshProduct(preOwnedTablet), false);
  assertEquals(getDetailedProductClassification(preOwnedTablet), "pre-owned");

  // Unclassified assertions (Fail-safe: not fresh)
  assertEquals(isFreshProduct(unclassifiedItem), false);
  assertEquals(getDetailedProductClassification(unclassifiedItem), "unclassified");
});

Deno.test("PROD-FRESH-2: filterFeaturedFreshProducts extracts strictly fresh items up to limit", async () => {
  // @ts-ignore
  const { filterFeaturedFreshProducts } = await import("../../../src/lib/relatedProducts.ts");

  const mixedCatalog = [
    {
      id: "1",
      name: "iphone 16 warranty till dec bh 91",
      condition: "Good",
      secondHand: true,
      tags: ["Used"],
      availableForSale: true,
    },
    {
      id: "2",
      name: "Samsung m17,4GB|128GB",
      condition: "New",
      secondHand: false,
      tags: ["New", "Samsung"],
      availableForSale: true,
    },
    {
      id: "3",
      name: "vivo v80 non active",
      condition: "Good",
      secondHand: true,
      tags: ["Used"],
      availableForSale: true,
    },
    {
      id: "4",
      name: "redmi 15c,4GB,128GB",
      condition: "New",
      secondHand: false,
      tags: ["New", "Redmi"],
      availableForSale: true,
    },
    {
      id: "5",
      name: "IPAD MINI AIR 6TH GEN",
      condition: "Good",
      secondHand: true,
      tags: ["Used"],
      availableForSale: true,
    },
    {
      id: "6",
      name: "IQZ10 LITE 4,128",
      condition: "New",
      secondHand: false,
      tags: ["New"],
      availableForSale: true,
    },
    {
      id: "7",
      name: "IQOO Z10R 8/256",
      condition: "Good",
      secondHand: true,
      tags: ["Used"],
      availableForSale: true,
    },
    {
      id: "8",
      name: "moto g37 power, 4GB,128GB",
      condition: "New",
      secondHand: false,
      tags: ["New"],
      availableForSale: true,
    },
  ];

  const featured = filterFeaturedFreshProducts(mixedCatalog as any, 8);

  // Must only include fresh products (ids: 2, 4, 6, 8)
  assertEquals(featured.length, 4);
  assertEquals(
    featured.map((p: any) => p.id),
    ["2", "4", "6", "8"],
  );

  // Zero pre-owned products allowed
  for (const p of featured) {
    assertEquals(p.secondHand, false);
    assertEquals(p.condition, "New");
    assertEquals(p.tags?.includes("Used"), false);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: CANONICAL CATEGORY MAPPING & ACCURATE NON-ZERO COUNTS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PROD-CAT-1: mapToWebsiteCategory maps diverse Shopify taxonomy and product types into 10 canonical categories", async () => {
  // @ts-ignore
  const { mapToWebsiteCategory, WEBSITE_CATEGORIES } =
    await import("../../../src/lib/categoryMapping.ts");

  assertEquals(WEBSITE_CATEGORIES.length, 10);

  // Mobiles
  assertEquals(
    mapToWebsiteCategory({
      category: "Smart Phones",
      productType: "Mobile Phone",
      tags: ["Mobile Phone"],
    } as any),
    "Mobiles",
  );
  assertEquals(
    mapToWebsiteCategory({
      category: "Mobile & Smart Phones",
      productType: "",
      tags: [],
    } as any),
    "Mobiles",
  );
  assertEquals(
    mapToWebsiteCategory({
      category: "Tablet Computers",
      productType: "Tablet",
      tags: ["Tablet"],
    } as any),
    "Mobiles",
  );

  // Laptops
  assertEquals(
    mapToWebsiteCategory({
      category: "Laptops",
      productType: "Laptop",
      tags: [],
    } as any),
    "Laptops",
  );
  assertEquals(
    mapToWebsiteCategory({
      category: "Notebook Computers",
      productType: "",
      tags: [],
    } as any),
    "Laptops",
  );

  // PC Components
  assertEquals(
    mapToWebsiteCategory({
      category: "Computer Processors",
      productType: "",
      tags: [],
    } as any),
    "PC Components",
  );
  assertEquals(
    mapToWebsiteCategory({
      category: "Motherboards",
      productType: "",
      tags: [],
    } as any),
    "PC Components",
  );
  assertEquals(
    mapToWebsiteCategory({
      category: "RAM",
      productType: "",
      tags: [],
    } as any),
    "PC Components",
  );
  assertEquals(
    mapToWebsiteCategory({
      category: "Video Cards & Adapters",
      productType: "",
      tags: [],
    } as any),
    "PC Components",
  );

  // Monitors
  assertEquals(
    mapToWebsiteCategory({
      category: "Computer Monitors",
      productType: "Monitor",
      tags: [],
    } as any),
    "Monitors",
  );
  assertEquals(
    mapToWebsiteCategory({
      category: "Monitor Arms & Mounts",
      productType: "",
      tags: [],
    } as any),
    "Monitors",
  );

  // Printers
  assertEquals(
    mapToWebsiteCategory({
      category: "Computer Printers",
      productType: "Printer",
      tags: [],
    } as any),
    "Printers",
  );

  // Storage
  assertEquals(
    mapToWebsiteCategory({
      category: "Solid State Drives",
      productType: "SSD",
      tags: [],
    } as any),
    "Storage",
  );

  // Computer Accessories
  assertEquals(
    mapToWebsiteCategory({
      category: "Keyboards & Mice",
      productType: "Keyboard",
      tags: [],
    } as any),
    "Computer Accessories",
  );

  // Headphones & Audio
  assertEquals(
    mapToWebsiteCategory({
      category: "Headphones",
      productType: "Audio",
      tags: [],
    } as any),
    "Headphones & Audio",
  );

  // Networking
  assertEquals(
    mapToWebsiteCategory({
      category: "Routers",
      productType: "Networking",
      tags: [],
    } as any),
    "Networking",
  );

  // Gaming
  assertEquals(
    mapToWebsiteCategory({
      category: "Gaming Consoles",
      productType: "Gaming",
      tags: [],
    } as any),
    "Gaming",
  );
});

Deno.test("PROD-CAT-2: matchesCategoryFilter harmonizes category queries across Homepage & Product Listings", async () => {
  // @ts-ignore
  const { matchesCategoryFilter } = await import("../../../src/lib/categoryMapping.ts");

  const mobileProduct = {
    category: "Smart Phones",
    productType: "Mobile Phone",
    tags: ["Mobile Phone"],
  } as any;

  const accessoryProduct = {
    category: "Keyboards",
    productType: "Accessory",
    tags: ["Keyboard"],
  } as any;

  const audioProduct = {
    category: "Headphones",
    productType: "Audio",
    tags: ["Audio"],
  } as any;

  // Matching Mobiles
  assertEquals(matchesCategoryFilter(mobileProduct, "Mobiles"), true);
  assertEquals(matchesCategoryFilter(mobileProduct, "Laptops"), false);

  // Matching Accessories aliases (Accessories & Computer Accessories)
  assertEquals(matchesCategoryFilter(accessoryProduct, "Accessories"), true);
  assertEquals(matchesCategoryFilter(accessoryProduct, "Computer Accessories"), true);
  assertEquals(matchesCategoryFilter(accessoryProduct, "Mobiles"), false);

  // Matching Audio aliases (Audio & Headphones & Audio)
  assertEquals(matchesCategoryFilter(audioProduct, "Audio"), true);
  assertEquals(matchesCategoryFilter(audioProduct, "Headphones & Audio"), true);
  assertEquals(matchesCategoryFilter(audioProduct, "Gaming"), false);
});

Deno.test("PROD-CAT-3: calculateCategoryCounts calculates accurate non-zero counts from real catalog data", async () => {
  // @ts-ignore
  const { calculateCategoryCounts } = await import("../../../src/lib/categoryMapping.ts");

  const sampleProducts = [
    { category: "Smart Phones", productType: "Mobile Phone", tags: ["Mobile Phone"] },
    { category: "Smart Phones", productType: "Mobile Phone", tags: ["Mobile Phone"] },
    { category: "Mobile & Smart Phones", productType: "", tags: [] },
    { category: "Monitor Arms & Mounts", productType: "", tags: [] },
    { category: "Computer Processors", productType: "", tags: [] },
    { category: "Motherboards", productType: "", tags: [] },
    { category: "RAM", productType: "", tags: [] },
    { category: "Video Cards & Adapters", productType: "", tags: [] },
  ] as any[];

  const counts = calculateCategoryCounts(sampleProducts);

  // Mobiles should have 3 products
  assertEquals(counts["Mobiles"], 3);
  // Monitors should have 1 product
  assertEquals(counts["Monitors"], 1);
  // PC Components should have 4 products (Processors, Motherboard, RAM, GPU)
  assertEquals(counts["PC Components"], 4);
  // Unpopulated categories should be 0, not undefined
  assertEquals(counts["Laptops"], 0);
  assertEquals(counts["Printers"], 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: SERVICE QUOTATION PAYMENT WORKFLOW (UPI + PAY AT IT HUB)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PROD-PAY-1: Service payment methods strictly allow only UPI and Pay at IT HUB", async () => {
  // @ts-ignore
  const { isValidServicePaymentMethod, ALLOWED_SERVICE_PAYMENT_METHODS } =
    await import("../../../src/lib/servicePayments.ts");

  assertEquals(ALLOWED_SERVICE_PAYMENT_METHODS, ["upi", "store"]);

  // Valid methods
  assertEquals(isValidServicePaymentMethod("upi"), true);
  assertEquals(isValidServicePaymentMethod("store"), true);

  // Disallowed methods
  assertEquals(isValidServicePaymentMethod("card"), false);
  assertEquals(isValidServicePaymentMethod("netbanking"), false);
  assertEquals(isValidServicePaymentMethod("mock"), false);
  assertEquals(isValidServicePaymentMethod("wallet"), false);
  assertEquals(isValidServicePaymentMethod(""), false);
});

Deno.test("PROD-PAY-2: Service payment requires quotation to be published and approved with positive amount", async () => {
  // @ts-ignore
  const { canInitiateServicePayment } = await import("../../../src/lib/servicePayments.ts");

  // Quotation pending approval -> cannot initiate payment
  assertEquals(
    canInitiateServicePayment({
      quote: 2500,
      quote_state: "pending",
      status: "Awaiting Approval",
    } as any),
    false,
  );

  // Quotation rejected -> cannot initiate payment
  assertEquals(
    canInitiateServicePayment({
      quote: 300,
      quote_state: "rejected",
      status: "Awaiting Approval",
    } as any),
    false,
  );

  // No quote -> cannot initiate payment
  assertEquals(
    canInitiateServicePayment({
      quote: null,
      quote_state: null,
      status: "Booked",
    } as any),
    false,
  );

  // Quote approved with positive amount -> CAN initiate payment
  assertEquals(
    canInitiateServicePayment({
      quote: 1850,
      quote_state: "approved",
      status: "In Progress",
    } as any),
    true,
  );
});

Deno.test("PROD-PAY-3: Pay at IT HUB initiates offline store payment state without marking ticket as Paid", async () => {
  // @ts-ignore
  const { buildOfflinePayAtStoreRecord } = await import("../../../src/lib/servicePayments.ts");

  const ticket = {
    id: "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2",
    ticket_reference: "ITH-SER-C327B978",
    quote: 1850,
    quote_state: "approved",
    status: "In Progress",
  } as any;

  const record = buildOfflinePayAtStoreRecord(ticket);

  assertEquals(record.payment_status, "Pay at Store");
  assertEquals(record.payment_method, "store");
  assertEquals(record.is_paid, false); // Crucial: must NOT be marked paid
  assertEquals(record.payable_amount, 1850);
  assertEquals(record.ticket_reference, "ITH-SER-C327B978");
  assertEquals(record.instructions.includes("IT HUB"), true);
});

Deno.test("PROD-PAY-4: Staff mark payment received records staff identity, amount, and timestamp", async () => {
  // @ts-ignore
  const { buildStaffPaymentReceivedRecord } = await import("../../../src/lib/servicePayments.ts");

  const offlineTicket = {
    id: "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2",
    ticket_reference: "ITH-SER-C327B978",
    quote: 1850,
    payment_status: "Pay at Store",
  } as any;

  const staffUser = {
    id: "staff-uuid-1234",
    email: "admin@ithub.com",
    role: "portal_admin",
  };

  const receipt = buildStaffPaymentReceivedRecord(offlineTicket, staffUser, 1850);

  assertEquals(receipt.payment_status, "Paid");
  assertEquals(receipt.is_paid, true);
  assertEquals(receipt.collected_amount, 1850);
  assertEquals(receipt.collected_by_staff_id, "staff-uuid-1234");
  assertEquals(Boolean(receipt.paid_at), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4: SERVICE TRACKER CANONICAL REFERENCE INPUT & SEARCH NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PROD-TRACK-1: General tracker input starts empty with canonical placeholder", async () => {
  // @ts-ignore
  const { getTrackerInitialInput, TRACKER_PLACEHOLDER } =
    await import("../../../src/lib/ticketReference.ts");

  // No ID in URL params -> input must start completely empty
  assertEquals(getTrackerInitialInput(undefined), "");
  assertEquals(getTrackerInitialInput(""), "");

  assertEquals(TRACKER_PLACEHOLDER, "Enter your IT HUB service reference (e.g. ITH-SER-C327B978)");
});

Deno.test("PROD-TRACK-2: Ticket link prefill resolves canonical ITH-SER- reference instead of raw UUID", async () => {
  // @ts-ignore
  const { getTrackerInitialInput } = await import("../../../src/lib/ticketReference.ts");

  // When opened with canonical reference
  assertEquals(getTrackerInitialInput("ITH-SER-9F968724"), "ITH-SER-9F968724");

  // When opened with legacy UUID, input transforms to canonical reference for the customer
  assertEquals(getTrackerInitialInput("9f968724-bb09-4960-a372-bf5242240e41"), "ITH-SER-9F968724");

  // When opened with lowercase reference
  assertEquals(getTrackerInitialInput("ith-ser-9f968724"), "ITH-SER-9F968724");

  // When opened with 8-character code alone
  assertEquals(getTrackerInitialInput("9F968724"), "ITH-SER-9F968724");
});

Deno.test("PROD-TRACK-3: normalizeTrackerSearchQuery handles all valid user input variations safely", async () => {
  // @ts-ignore
  const { normalizeTrackerSearchQuery } = await import("../../../src/lib/ticketReference.ts");

  // Leading/trailing whitespace & lowercase
  assertEquals(normalizeTrackerSearchQuery("  ith-ser-c327b978  "), "ITH-SER-C327B978");

  // 8-character code alone
  assertEquals(normalizeTrackerSearchQuery("c327b978"), "ITH-SER-C327B978");

  // Full canonical reference
  assertEquals(normalizeTrackerSearchQuery("ITH-SER-C327B978"), "ITH-SER-C327B978");

  // Full UUID normalized
  assertEquals(
    normalizeTrackerSearchQuery("c327b978-2ae9-4ab7-9b5b-e9385c62a7c2"),
    "ITH-SER-C327B978",
  );

  // Empty or whitespace returns empty string
  assertEquals(normalizeTrackerSearchQuery("   "), "");
  assertEquals(normalizeTrackerSearchQuery(""), "");
});
