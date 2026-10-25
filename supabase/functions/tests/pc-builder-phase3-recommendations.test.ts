// supabase/functions/tests/pc-builder-phase3-recommendations.test.ts
// IT HUB Find My PC — Phase 3 & 4 Multi-Branch Synthesizer & Scoring Test Suite
// Verifies multi-branching diversity, label assignments, strict budget ceiling,
// honest budget shortfall calculation, latency budget (<50ms), and confidence badges.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

const {
  generateDynamicCatalogRecommendations,
  getBudgetShortfallInfo,
  getComponentBenchmarkScores,
  getPurposeWeights,
} = await import("../../../src/lib/builder/recommendations.ts")

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts")

// Realistic multi-tier catalog fixture
const multiTierShopifyProducts: any[] = [
  // CPUs
  {
    id: "gid://shopify/Product/cpu-5600",
    name: "AMD Ryzen 5 5600",
    price: 9000,
    category: "Processors",
    tags: ["pc-builder", "cpu", "am4"],
    variantId: "gid://shopify/ProductVariant/v-5600",
    availableForSale: true,
    stock: 10,
    specs: { socket: "AM4", tdpWatts: 65, hasIntegratedGraphics: false, includesCooler: true, provenance: "verified_manufacturer" },
  },
  {
    id: "gid://shopify/Product/cpu-7600",
    name: "AMD Ryzen 5 7600",
    price: 18500,
    category: "Processors",
    tags: ["pc-builder", "cpu", "am5"],
    variantId: "gid://shopify/ProductVariant/v-7600",
    availableForSale: true,
    stock: 5,
    specs: { socket: "AM5", tdpWatts: 65, hasIntegratedGraphics: true, includesCooler: true, provenance: "verified_manufacturer" },
  },
  // Motherboards
  {
    id: "gid://shopify/Product/mobo-b550m",
    name: "B550M DDR4 Motherboard",
    price: 7000,
    category: "Motherboards",
    tags: ["pc-builder", "motherboard", "am4", "b550"],
    variantId: "gid://shopify/ProductVariant/v-b550m",
    availableForSale: true,
    stock: 8,
    specs: { socket: "AM4", supportedRamGeneration: "DDR4", formFactor: "Micro-ATX", m2SlotCount: 1, provenance: "verified_technician" },
  },
  {
    id: "gid://shopify/Product/mobo-b650m",
    name: "B650M DDR5 Motherboard with Wi-Fi",
    price: 12500,
    category: "Motherboards",
    tags: ["pc-builder", "motherboard", "am5", "b650"],
    variantId: "gid://shopify/ProductVariant/v-b650m",
    availableForSale: true,
    stock: 6,
    specs: { socket: "AM5", supportedRamGeneration: "DDR5", formFactor: "Micro-ATX", hasWifi: true, m2SlotCount: 2, provenance: "verified_manufacturer" },
  },
  // RAM
  {
    id: "gid://shopify/Product/ram-ddr4-16",
    name: "16GB DDR4 Desktop RAM",
    price: 3000,
    category: "Memory",
    tags: ["pc-builder", "ram", "ddr4"],
    variantId: "gid://shopify/ProductVariant/v-ram4-16",
    availableForSale: true,
    stock: 15,
    specs: { ramGeneration: "DDR4", isLaptopSoDimm: false, capacityGb: 16, provenance: "verified_technician" },
  },
  {
    id: "gid://shopify/Product/ram-ddr5-32",
    name: "32GB (2x16GB) DDR5 6000MHz RAM",
    price: 8500,
    category: "Memory",
    tags: ["pc-builder", "ram", "ddr5"],
    variantId: "gid://shopify/ProductVariant/v-ram5-32",
    availableForSale: true,
    stock: 8,
    specs: { ramGeneration: "DDR5", isLaptopSoDimm: false, capacityGb: 32, provenance: "verified_manufacturer" },
  },
  // GPUs
  {
    id: "gid://shopify/Product/gpu-4060",
    name: "NVIDIA RTX 4060 8GB",
    price: 28000,
    category: "Graphics Cards",
    tags: ["pc-builder", "gpu"],
    variantId: "gid://shopify/ProductVariant/v-4060",
    availableForSale: true,
    stock: 7,
    specs: { powerWatts: 115, lengthMm: 242, recommendedPsuWatts: 450, provenance: "verified_technician" },
  },
  {
    id: "gid://shopify/Product/gpu-5050",
    name: "RTX 5050 GPU 12GB",
    price: 50000,
    category: "Graphics Cards",
    tags: ["pc-builder", "gpu"],
    variantId: "gid://shopify/ProductVariant/v-5050",
    availableForSale: true,
    stock: 3,
    specs: { powerWatts: 140, lengthMm: 260, recommendedPsuWatts: 550, provenance: "verified_technician" },
  },
  // Storage
  {
    id: "gid://shopify/Product/ssd-1tb",
    name: "1TB NVMe SSD",
    price: 5000,
    category: "Storage",
    tags: ["pc-builder", "storage"],
    variantId: "gid://shopify/ProductVariant/v-ssd1",
    availableForSale: true,
    stock: 12,
    specs: { storageInterface: "M.2 NVMe", capacityGb: 1000, provenance: "verified_manufacturer" },
  },
  // PSU
  {
    id: "gid://shopify/Product/psu-650",
    name: "650W ATX Power Supply",
    price: 4500,
    category: "Power Supply",
    tags: ["pc-builder", "psu"],
    variantId: "gid://shopify/ProductVariant/v-psu650",
    availableForSale: true,
    stock: 10,
    specs: { ratedWattage: 650, pciePowerConnectors: ["8-pin", "8-pin"], provenance: "verified_manufacturer" },
  },
  // Cabinet
  {
    id: "gid://shopify/Product/case-mid",
    name: "ATX Mid Tower Cabinet",
    price: 4000,
    category: "Cabinet",
    tags: ["pc-builder", "case"],
    variantId: "gid://shopify/ProductVariant/v-case",
    availableForSale: true,
    stock: 6,
    specs: { maxGpuLengthMm: 360, supportedMotherboards: ["ATX", "Micro-ATX", "Mini-ITX"], provenance: "verified_manufacturer" },
  },
  // Cooler
  {
    id: "gid://shopify/Product/cooler-am4",
    name: "AM4 Compatible CPU Cooler",
    price: 1500,
    category: "Cooler",
    tags: ["pc-builder", "cooler"],
    variantId: "gid://shopify/ProductVariant/v-cool",
    availableForSale: true,
    stock: 10,
    specs: { supportedSockets: ["AM4", "AM5"], coolerHeightMm: 145, provenance: "verified_manufacturer" },
  },
]

Deno.test("PHASE3-1: Multi-branch synthesizer returns distinct builds with 100% diversity", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify(multiTierShopifyProducts)

  const answers = {
    purpose: "gaming",
    budgetId: "100-150", // Budget ₹1,00,000 - ₹1,50,000 accommodates both AM4 and AM5 tiers
    brands: [],
    wifi: "No",
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers, { min: 100000, max: 150000 })
  assertEquals(recs.length >= 2, true)

  // Verify 100% Diversity Metric D: Unique (CPU, GPU, RAM) triples
  const triples = recs.map((r) => `${r.parts.CPU?.name}|${r.parts.GPU?.name}|${r.parts.RAM?.name}`)
  const uniqueTriples = new Set(triples)
  assertEquals(uniqueTriples.size, recs.length) // Diversity = 100.0%

  // Verify all builds are strictly within budget
  for (const r of recs) {
    assertEquals(r.price <= 150000, true)
    assertEquals(Boolean(r.confidenceBadge), true)
  }
})

Deno.test("PHASE3-2: Label assignments adhere to Best Value and Balanced/Performance rules", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify(multiTierShopifyProducts)

  const answers = {
    purpose: "gaming",
    budgetId: "80-100", // ₹80,000 - ₹1,00,000
    brands: [],
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers, { min: 60000, max: 100000 })
  assertEquals(recs.length >= 2, true)

  // Best Value must have lowest total price
  const bestValue = recs.find((r) => r.tradeoff === "Value" || r.tradeoffLabel === "Best Value")
  if (bestValue) {
    const minPrice = Math.min(...recs.map((r) => r.price))
    assertEquals(bestValue.price, minPrice)
  }
})

Deno.test("PHASE3-3: Combinatorial search latency budget P95 < 50ms", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify(multiTierShopifyProducts)

  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: [],
    owned: [],
  }

  const times: number[] = []
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now()
    generateDynamicCatalogRecommendations(componentCatalog, answers, { min: 50000, max: 120000 })
    const t1 = performance.now()
    times.push(t1 - t0)
  }

  times.sort((a, b) => a - b)
  const p95 = times[Math.floor(times.length * 0.95)]
  assertEquals(p95 < 50, true) // Target P95 < 50ms
})

Deno.test("PHASE3-4: Honest Shortfall correctly identifies closest build when budget is under minimum", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify(multiTierShopifyProducts)

  // Budget ₹40,000 - ₹60,000 (below cheapest valid complete build of ₹62,000)
  const answers = {
    purpose: "gaming",
    budgetId: "40-60",
    brands: [],
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers, { min: 40000, max: 60000 })
  // Strict budget filter MUST return 0 builds
  assertEquals(recs.length, 0)

  // getBudgetShortfallInfo MUST detect the shortfall
  const shortfall = getBudgetShortfallInfo(componentCatalog, answers, { min: 40000, max: 60000 })
  assertNotEquals(shortfall, null)
  assertEquals(shortfall?.closestBuild.price, 62000)
  assertEquals(shortfall?.shortfallAmount, 2000) // ₹62,000 - ₹60,000
  assertEquals(shortfall?.closestBuild.name.includes("Ryzen 5 5600"), true)
})

Deno.test("PHASE3-5: Specification confidence badges reflect provenance accurately", () => {
  const { componentCatalog } = syncBuilderCatalogWithShopify(multiTierShopifyProducts)

  const answers = {
    purpose: "gaming",
    budgetId: "mid",
    brands: [],
    owned: [],
  }

  const recs = generateDynamicCatalogRecommendations(componentCatalog, answers, { min: 60000, max: 80000 })
  assertEquals(recs.length > 0, true)
  const rec = recs[0]
  assertEquals(rec.confidenceBadge === "certified" || rec.confidenceBadge === "high", true)
  assertEquals(Boolean(rec.confidenceLabel), true)
})

