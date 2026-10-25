// supabase/functions/tests/pc-builder-shopify-audit.test.ts
// IT HUB PC Builder — Static Data vs Shopify Storefront Audit Regression Test Suite
// Verifies that Shopify is the authoritative source for product identity, variant IDs,
// prices, and availability, and that test products (e.g. ₹9,000 Ryzen 5 5600) strictly
// override static fallback data (₹10,999) across both Expert Mode and Find My PC.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const {
  matchShopifyProductToComponent,
  buildBuilderCatalog,
  syncBuilderCatalogWithShopify,
  normalizeHardwareTitle,
  detectComponentSlot,
} = await import("../../../src/lib/builder/catalog.ts");

const { generateRecommendations } = await import("../../../src/lib/builder/recommendations.ts");
const { prepareShopifyCheckout } = await import("../../../src/lib/builder/checkout.ts");
const { checkCompatibility } = await import("../../../src/lib/builder/compatibility.ts");

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockShopifyRyzen5600: any = {
  id: "gid://shopify/Product/987654321",
  name: "[TEST] AMD Ryzen 5 5600",
  title: "[TEST] AMD Ryzen 5 5600",
  handle: "test-amd-ryzen-5-5600",
  price: 9000, // Authoritative Shopify selling price
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
  id: "gid://shopify/Product/mobo-b550m-test",
  name: "[TEST] ASUS Prime B550M-A WiFi II",
  title: "[TEST] ASUS Prime B550M-A WiFi II",
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
  id: "gid://shopify/Product/ram-16-test",
  name: "[TEST] Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
  title: "[TEST] Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
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
  id: "gid://shopify/Product/gpu-4060-test",
  name: "[TEST] Gigabyte GeForce RTX 4060 Eagle OC 8GB",
  title: "[TEST] Gigabyte GeForce RTX 4060 Eagle OC 8GB",
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
  id: "gid://shopify/Product/ssd-1tb-test",
  name: "[TEST] Kingston NV2 1TB M.2 2280 NVMe PCIe 4.0 SSD",
  title: "[TEST] Kingston NV2 1TB M.2 2280 NVMe PCIe 4.0 SSD",
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
  id: "gid://shopify/Product/psu-550-test",
  name: "[TEST] Deepcool PK550D 550W 80 Plus Bronze Power Supply",
  title: "[TEST] Deepcool PK550D 550W 80 Plus Bronze Power Supply",
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
  id: "gid://shopify/Product/case-matx-test",
  name: "[TEST] Ant Esports ICE-100 Mid-Tower Gaming Cabinet",
  title: "[TEST] Ant Esports ICE-100 Mid-Tower Gaming Cabinet",
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
  id: "gid://shopify/Product/cooler-ag400-test",
  name: "[TEST] Deepcool AG400 Single-Tower CPU Cooler",
  title: "[TEST] Deepcool AG400 Single-Tower CPU Cooler",
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

const eightTestProducts = [
  mockShopifyRyzen5600,
  mockShopifyB550M,
  mockShopifyRam16,
  mockShopifyRtx4060,
  mockShopifyNvme1tb,
  mockShopifyPsu550,
  mockShopifyCase,
  mockShopifyCooler,
];

const mockShopifyLegionMonitor: any = {
  id: "gid://shopify/Product/112233445",
  name: "Lenovo Legion {Smartchoice} R27qe Gen 2",
  title: "Lenovo Legion {Smartchoice} R27qe Gen 2",
  handle: "lenovo-legion-smartchoice-r27qe-gen-2",
  price: 15000,
  original: 18000,
  brand: "Lenovo",
  category: "Monitors",
  productType: "Monitor",
  tags: ["pc-builder", "monitor", "1440p", "180hz"],
  variantId: "gid://shopify/ProductVariant/9988776655",
  availableForSale: true,
  stock: 6,
  specs: {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Regression Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("AUDIT-1: Shopify test product [TEST] AMD Ryzen 5 5600 @ ₹9,000 maps to CPU slot at ₹9,000, suppressing ₹10,999", () => {
  const comp = matchShopifyProductToComponent(mockShopifyRyzen5600);
  assertEquals(Boolean(comp), true);
  assertEquals(comp?.slot, "CPU");
  assertEquals(comp?.price, 9000);
  assertNotEquals(comp?.price, 10999); // Strictly verify the static price is NOT used
  assertEquals(comp?.variantId, "gid://shopify/ProductVariant/4455667788");
  assertEquals(comp?.isShopifyLive, true);
  assertEquals(comp?.isVerified, true);
  assertEquals(comp?.specs.socket, "AM4");
  assertEquals(comp?.specs.tdpWatts, 65);

  // Test full catalog synchronization: the ₹10,999 fallback entry must be suppressed
  const { componentCatalog } = syncBuilderCatalogWithShopify([mockShopifyRyzen5600]);
  const cpus = componentCatalog["CPU"] || [];
  const ryzen5600Entries = cpus.filter(
    (c) => c.name.includes("5600") || (c as any).matchedModelKey === "cpu-r5-5600",
  );
  assertEquals(ryzen5600Entries.length, 1); // No duplicate fallback
  assertEquals(ryzen5600Entries[0].price, 9000); // Shopify price is authoritative
  assertEquals(ryzen5600Entries[0].variantId, "gid://shopify/ProductVariant/4455667788");
});

Deno.test("AUDIT-2: Detects slots and normalizes titles stripping [TEST] brackets", () => {
  assertEquals(normalizeHardwareTitle("[TEST] AMD Ryzen 5 5600"), "AMD Ryzen 5 5600");
  assertEquals(normalizeHardwareTitle("TEST - Core i5-12400F"), "Core i5-12400F");
  assertEquals(detectComponentSlot("AMD Ryzen 5 7600"), "CPU");
  assertEquals(detectComponentSlot("ASUS Prime B550M-A"), "Motherboard");
  assertEquals(detectComponentSlot("Corsair Vengeance 16GB DDR4"), "RAM");
  assertEquals(detectComponentSlot("GeForce RTX 4060"), "GPU");
  assertEquals(detectComponentSlot("Kingston NV2 1TB NVMe"), "Storage");
  assertEquals(detectComponentSlot("Deepcool PK550D Power Supply"), "PSU");
  assertEquals(detectComponentSlot("Ant Esports ICE-100 Case"), "Cabinet");
  assertEquals(detectComponentSlot("Deepcool AG400 CPU Cooler"), "Cooler");
  assertEquals(detectComponentSlot("Lenovo Legion R27qe Monitor"), "Monitor");
});

Deno.test("AUDIT-3: Find My PC recommendation engine uses the authentic ₹9,000 Shopify price and rejects incomplete catalogs", () => {
  // 1. Incomplete catalog (CPU only): Must produce 0 fabricated builds (no silent fallback insertion!)
  const incompleteCatalog = buildBuilderCatalog([mockShopifyRyzen5600]);
  const answers: any = {
    purpose: "gaming",
    budgetInr: 60000,
    includePeripherals: false,
    ownedParts: [],
    preferredBrands: ["AMD"],
  };
  const incompleteRecs = generateRecommendations(answers, incompleteCatalog);
  assertEquals(incompleteRecs.length, 0); // No fabricated builds!

  // 2. Complete catalog (all 8 authentic Shopify test products): Successfully generates recommendation
  const canonicalCatalog = buildBuilderCatalog(eightTestProducts);
  const recs = generateRecommendations(answers, canonicalCatalog);
  assertEquals(recs.length > 0, true);

  const valueRec = recs.find((r) => r.build.components.CPU?.title.includes("5600"));
  assertEquals(Boolean(valueRec), true);
  if (valueRec) {
    const cpu = valueRec.build.components.CPU;
    assertEquals(cpu?.price, 9000);
    assertNotEquals(cpu?.price, 10999);
    assertEquals(cpu?.variantId, "gid://shopify/ProductVariant/4455667788");
    assertEquals(cpu?.isShopifyLive, true);
  }
});

Deno.test("AUDIT-4: Moving between Find My PC and Expert Mode preserves ₹9,000 price and variant ID", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify([mockShopifyRyzen5600]);
  const selectedCpu = componentCatalog["CPU"].find((c) => c.name.includes("5600"));

  assertEquals(Boolean(selectedCpu), true);
  assertEquals(selectedCpu?.price, 9000);
  assertEquals(selectedCpu?.variantId, "gid://shopify/ProductVariant/4455667788");

  // Simulate passing to Expert Mode seed
  const expertParts: Record<string, any> = {
    CPU: selectedCpu,
  };

  assertEquals(expertParts.CPU.price, 9000);
  assertEquals(expertParts.CPU.variantId, "gid://shopify/ProductVariant/4455667788");
});

Deno.test("AUDIT-5: Out-of-stock or unpublished Shopify product maps to unavailable", () => {
  const soldOutRyzen: any = {
    ...mockShopifyRyzen5600,
    id: "gid://shopify/Product/sold-out-1",
    availableForSale: false,
    stock: 0,
  };

  const comp = matchShopifyProductToComponent(soldOutRyzen);
  assertEquals(Boolean(comp), true);
  assertEquals(comp?.availability, "unavailable");
});

Deno.test("AUDIT-6: Products with unverified technical specs are flagged as unverified", () => {
  const unknownGenericPart: any = {
    id: "gid://shopify/Product/mystery-component",
    name: "Custom Generic Processor Chip",
    price: 4999,
    category: "Hardware",
    productType: "Processor",
    tags: ["cpu"],
    variantId: "gid://shopify/ProductVariant/mystery-var-1",
    availableForSale: true,
    stock: 2,
    specs: {},
  };

  const comp = matchShopifyProductToComponent(unknownGenericPart);
  assertEquals(Boolean(comp), true);
  assertEquals(comp?.isVerified, false);
  assertEquals(comp?.specs.provenance, "unverified");

  // Compatibility engine test: Rule J marks unverified socket as unknown
  const buildParts: any = {
    CPU: comp,
    Motherboard: {
      slot: "Motherboard",
      title: "ASUS Prime B550M-A",
      specs: { socket: "AM4", supportedRamGeneration: "DDR4" },
    },
  };

  const result = checkCompatibility(buildParts);
  const socketCheck = result.items.find((i) => i.ruleId === "RULE_A_SOCKET_UNKNOWN");
  assertEquals(Boolean(socketCheck), true);
  assertEquals(socketCheck?.status, "unknown");
});

Deno.test("AUDIT-7: Build with unlinked in-store reference items is rejected by prepareShopifyCheckout with descriptive error", async () => {
  const buildWithUnlinked: any = {
    id: "build-unlinked-1",
    name: "Custom In-Store Build",
    components: {
      CPU: {
        slot: "CPU",
        title: "AMD Ryzen 5 5600",
        price: 9000,
        variantId: "gid://shopify/ProductVariant/4455667788", // Real variant
      },
      Motherboard: {
        slot: "Motherboard",
        title: "In-Store Motherboard Reference",
        price: 8999,
        variantId: "", // Unlinked, no Shopify variant
      },
    },
  };

  const result = await prepareShopifyCheckout(buildWithUnlinked);
  assertEquals(result.success, false);
  assertEquals(result.missingCount, 1);
  assertEquals(result.error?.includes("in-store or distributor-sourced"), true);
});

Deno.test("AUDIT-8: Multiple Shopify products (CPU + Monitor) correctly retain separate Shopify variants and prices", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify([
    mockShopifyRyzen5600,
    mockShopifyLegionMonitor,
  ]);

  const cpu = componentCatalog["CPU"].find((c) => c.name.includes("5600"));
  const monitor = componentCatalog["Monitor"].find((c) => c.name.includes("R27qe"));

  assertEquals(cpu?.price, 9000);
  assertEquals(cpu?.variantId, "gid://shopify/ProductVariant/4455667788");
  assertEquals(monitor?.price, 15000);
  assertEquals(monitor?.variantId, "gid://shopify/ProductVariant/9988776655");
});

Deno.test("AUDIT-9: Peripherals and OS slots are excluded from the PC Builder catalog", () => {
  const { componentCatalog, canonicalCatalog } = syncBuilderCatalogWithShopify([
    mockShopifyRyzen5600,
  ]);
  assertEquals((componentCatalog as any)["Peripherals"], undefined);
  assertEquals((componentCatalog as any)["OS"], undefined);
  assertEquals((canonicalCatalog as any)["Peripherals"], undefined);
  assertEquals((canonicalCatalog as any)["OS"], undefined);
});
