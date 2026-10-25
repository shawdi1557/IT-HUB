// supabase/functions/tests/pc-builder-dynamic-recommendations.test.ts
// IT HUB PC Builder — Live Shopify Catalog Find My PC Integration Regression Tests
// Verifies that Find My PC generates recommendations dynamically from live Shopify-backed products
// without hardcoded template IDs, enforces compatibility, preserves authentic prices & variant IDs,
// and strictly avoids fabricated or placeholder recommendations when categories are incomplete.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

const {
  syncBuilderCatalogWithShopify,
  buildBuilderCatalog,
} = await import("../../../src/lib/builder/catalog.ts")

const {
  generateRecommendations,
  generateDynamicCatalogRecommendations,
  getMissingCatalogCategories,
} = await import("../../../src/lib/builder/recommendations.ts")

const { checkCompatibility, compatibility } = await import("../../../src/lib/builder/compatibility.ts")

// ─────────────────────────────────────────────────────────────────────────────
// 8 Authentic Shopify Test Products (Identical to Expert Mode)
// ─────────────────────────────────────────────────────────────────────────────

const mockShopifyRyzen5600: any = {
  id: "gid://shopify/Product/987654321",
  name: "[TEST] AMD Ryzen 5 5600",
  title: "[TEST] AMD Ryzen 5 5600",
  handle: "test-amd-ryzen-5-5600",
  price: 9000, // Authoritative Shopify selling price (not 10999)
  original: 10999,
  brand: "AMD",
  category: "Processors",
  productType: "Processor",
  tags: ["pc-builder", "cpu", "am4"],
  variantId: "gid://shopify/ProductVariant/4455667788",
  availableForSale: true,
  stock: 6,
  specs: {},
}

const mockShopifyB550M: any = {
  id: "gid://shopify/Product/mobo-b550m-test",
  name: "[TEST] ASUS Prime B550M-A WiFi II",
  title: "[TEST] ASUS Prime B550M-A WiFi II",
  handle: "test-asus-prime-b550m-a",
  price: 8999,
  brand: "ASUS",
  category: "Motherboards",
  productType: "Motherboard",
  tags: ["pc-builder", "motherboard", "am4", "b550"],
  variantId: "gid://shopify/ProductVariant/4455667789",
  availableForSale: true,
  stock: 5,
  specs: {},
}

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
}

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
}

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
}

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
}

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
}

const mockShopifyCooler: any = {
  id: "gid://shopify/Product/cooler-ag400-test",
  name: "[TEST] Deepcool AG400 Single Tower 120mm CPU Cooler",
  title: "[TEST] Deepcool AG400 Single Tower 120mm CPU Cooler",
  handle: "test-deepcool-ag400",
  price: 1899,
  brand: "Deepcool",
  category: "Coolers",
  productType: "CPU Cooler",
  tags: ["pc-builder", "cooler", "ag400"],
  variantId: "gid://shopify/ProductVariant/4455667795",
  availableForSale: true,
  stock: 5,
  specs: {},
}

const eightLiveShopifyProducts = [
  mockShopifyRyzen5600,
  mockShopifyB550M,
  mockShopifyRam16,
  mockShopifyRtx4060,
  mockShopifyNvme1tb,
  mockShopifyPsu550,
  mockShopifyCase,
  mockShopifyCooler,
]

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("FIND-MY-PC-1: Find My PC uses the same live Shopify catalog as Expert Mode", () => {
  const { componentCatalog, canonicalCatalog } = syncBuilderCatalogWithShopify(eightLiveShopifyProducts)

  // Verify Expert Mode catalog has live products
  assertEquals(componentCatalog.CPU.length, 1)
  assertEquals(componentCatalog.CPU[0].price, 9000)
  assertEquals(componentCatalog.CPU[0].variantId, "gid://shopify/ProductVariant/4455667788")

  // Generate recommendations directly from store.componentCatalog
  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: ["AMD"],
    wifi: "Yes",
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers)
  assertEquals(recs.length > 0, true)

  const rec = recs[0]
  assertEquals(Boolean(rec.parts.CPU), true)
  assertEquals(rec.parts.CPU.id, "gid://shopify/Product/987654321")
  assertEquals(rec.parts.CPU.price, 9000)
  assertEquals(rec.parts.CPU.variantId, "gid://shopify/ProductVariant/4455667788")
  assertEquals(rec.parts.CPU.isShopifyLive, true)
})

Deno.test("FIND-MY-PC-2: Recommends a valid build from the 8 live Shopify test products", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify(eightLiveShopifyProducts)

  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: ["AMD"],
    wifi: "Yes",
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers)
  assertEquals(recs.length, 1) // Exactly 1 authentic build, no fake filler builds

  const build = recs[0]
  assertEquals(build.tradeoff, "Balanced")
  assertEquals(build.parts.CPU.name, "[TEST] AMD Ryzen 5 5600")
  assertEquals(build.parts.Motherboard.name, "[TEST] ASUS Prime B550M-A WiFi II")
  assertEquals(build.parts.RAM.name, "[TEST] Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz")
  assertEquals(build.parts.GPU.name, "[TEST] Gigabyte GeForce RTX 4060 Eagle OC 8GB")
  assertEquals(build.parts.Storage.name, "[TEST] Kingston NV2 1TB M.2 2280 NVMe PCIe 4.0 SSD")
  assertEquals(build.parts.PSU.name, "[TEST] Deepcool PK550D 550W 80 Plus Bronze Power Supply")
  assertEquals(build.parts.Cabinet.name, "[TEST] Ant Esports ICE-100 Mid-Tower Gaming Cabinet")
  assertEquals(build.parts.Cooler.name, "[TEST] Deepcool AG400 Single Tower 120mm CPU Cooler")

  // Total price must be exact sum of Shopify prices: 9000 + 8999 + 3499 + 28499 + 4999 + 3699 + 2999 + 1899 = 63593
  assertEquals(build.price, 63593)

  // Hard compatibility check must pass
  const check = compatibility(build.parts)
  assertEquals(check.valid, true)
})

Deno.test("FIND-MY-PC-3: Missing essential category produces zero fabricated builds and lists missing category", () => {
  // Catalog missing Motherboard
  const productsMissingMobo = eightLiveShopifyProducts.filter((p) => p.productType !== "Motherboard")
  const { componentCatalog } = syncBuilderCatalogWithShopify(productsMissingMobo)

  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: ["AMD"],
    wifi: "No",
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers)
  assertEquals(recs.length, 0) // Strictly 0 recommendations when an essential category is missing

  const missingCategories = getMissingCatalogCategories(componentCatalog as any)
  assertEquals(missingCategories.includes("Motherboard"), true)
  assertEquals(missingCategories.includes("CPU"), false)
})

Deno.test("FIND-MY-PC-4: User-owned category is not required in catalog", () => {
  // Catalog missing Storage, but user already owns Storage
  const productsMissingStorage = eightLiveShopifyProducts.filter((p) => p.productType !== "Solid State Drive")
  const { componentCatalog } = syncBuilderCatalogWithShopify(productsMissingStorage)

  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: ["AMD"],
    wifi: "Yes",
    owned: ["Storage"],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers)
  assertEquals(recs.length > 0, true)

  const build = recs[0]
  assertEquals(build.owned.includes("Storage"), true)
  // Total price should exclude Storage (63593 - 4999 = 58594)
  assertEquals(build.price, 58594)
})

Deno.test("FIND-MY-PC-5: Incompatible combinations are strictly rejected", () => {
  // AM5 CPU combined with AM4 Motherboard
  const am5Cpu = {
    id: "gid://shopify/Product/r5-7600",
    name: "[TEST] AMD Ryzen 5 7600",
    title: "[TEST] AMD Ryzen 5 7600",
    price: 18999,
    productType: "Processor",
    tags: ["am5", "pc-builder"],
    variantId: "gid://shopify/ProductVariant/7600",
    stock: 5,
  }

  const { componentCatalog } = syncBuilderCatalogWithShopify([
    am5Cpu,
    mockShopifyB550M, // AM4 motherboard!
    mockShopifyRam16,
    mockShopifyRtx4060,
    mockShopifyNvme1tb,
    mockShopifyPsu550,
    mockShopifyCase,
  ])

  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: ["AMD"],
    wifi: "No",
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers)
  // AM5 CPU + AM4 Motherboard is physically incompatible, so no invalid build must be produced!
  assertEquals(recs.length, 0)
})

Deno.test("FIND-MY-PC-6: Variant IDs and prices survive recommendation-to-Expert-Mode transition", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify(eightLiveShopifyProducts)

  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: ["AMD"],
    wifi: "Yes",
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers)
  const candidate = recs[0]

  // Simulate "Customize in Expert Mode" action in Builder.tsx:
  // onExpert(candidate.parts, candidate.name) -> sets expertSeed.parts
  const expertSeedParts = candidate.parts

  for (const [slot, part] of Object.entries(expertSeedParts)) {
    const originalShopify = eightLiveShopifyProducts.find((p) => p.name === (part as any).name)
    assertEquals(Boolean(originalShopify), true)
    assertEquals((part as any).price, originalShopify.price)
    assertEquals((part as any).variantId, originalShopify.variantId)
    assertEquals((part as any).isShopifyLive, true)
  }
})

Deno.test("FIND-MY-PC-7: Does not depend on fixed template product IDs from buildTemplates.ts", () => {
  // A new arbitrary product with custom ID and title not present in buildTemplates.ts
  const customShopifyCpu: any = {
    id: "gid://shopify/Product/custom-intel-12400",
    name: "[TEST] Intel Core i5-12400F Processor",
    title: "[TEST] Intel Core i5-12400F Processor",
    handle: "test-intel-i5-12400f",
    price: 11000,
    productType: "Processor",
    tags: ["pc-builder", "cpu", "lga1700"],
    variantId: "gid://shopify/ProductVariant/12400",
    stock: 3,
  }

  const customShopifyB760M: any = {
    id: "gid://shopify/Product/custom-mobo-b760m",
    name: "[TEST] MSI PRO B760M-P DDR4 Motherboard",
    title: "[TEST] MSI PRO B760M-P DDR4 Motherboard",
    handle: "test-msi-b760m-p-ddr4",
    price: 9500,
    productType: "Motherboard",
    tags: ["pc-builder", "motherboard", "lga1700", "b760", "ddr4"],
    variantId: "gid://shopify/ProductVariant/760",
    stock: 4,
  }

  const intelCatalogProducts = [
    customShopifyCpu,
    customShopifyB760M,
    mockShopifyRam16,
    mockShopifyRtx4060,
    mockShopifyNvme1tb,
    mockShopifyPsu550,
    mockShopifyCase,
  ]

  const { componentCatalog } = syncBuilderCatalogWithShopify(intelCatalogProducts)

  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: ["Intel"],
    wifi: "No",
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers)
  assertEquals(recs.length > 0, true)

  const intelBuild = recs[0]
  assertEquals(intelBuild.parts.CPU.name, "[TEST] Intel Core i5-12400F Processor")
  assertEquals(intelBuild.parts.Motherboard.name, "[TEST] MSI PRO B760M-P DDR4 Motherboard")
  assertEquals(intelBuild.parts.CPU.price, 11000)
  assertEquals(intelBuild.parts.Motherboard.price, 9500)
})
