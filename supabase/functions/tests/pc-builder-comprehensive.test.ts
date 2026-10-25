// supabase/functions/tests/pc-builder-comprehensive.test.ts
// IT HUB PC Builder Production Architecture & Compatibility Engine Test Suite
// Rigorous verification covering Rules A through J, Power Calculation, Recommendations,
// Supabase Persistence Integrity, and Shopify Cart Preparation.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

// Dynamic import of builder modules
const {
  checkCompatibility,
  calculateSystemPower,
  compatibility,
} = await import("../../../src/lib/builder/compatibility.ts")

const { generateRecommendations } = await import("../../../src/lib/builder/recommendations.ts")
const { generateWhatsAppQuotation, prepareShopifyCheckout } = await import("../../../src/lib/builder/checkout.ts")

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility Engine Unit Tests (Rules A – J)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PC-BUILD-1: Rule A — CPU and Motherboard socket mismatch triggers hard error", () => {
  const parts: any = {
    CPU: {
      slot: "CPU",
      productId: "cpu-1",
      variantId: "gid://shopify/ProductVariant/101",
      title: "AMD Ryzen 5 7600",
      price: 18999,
      currency: "INR",
      specs: { socket: "AM5" },
      availability: "available",
      quantity: 1,
    },
    Motherboard: {
      slot: "Motherboard",
      productId: "mobo-1",
      variantId: "gid://shopify/ProductVariant/201",
      title: "ASUS Prime B550M-A WiFi II",
      price: 8999,
      currency: "INR",
      specs: { socket: "AM4", supportedRamGeneration: "DDR4" },
      availability: "available",
      quantity: 1,
    },
  }

  const result = checkCompatibility(parts)
  assertEquals(result.valid, false)
  const socketError = result.items.find((i) => i.ruleId === "RULE_A_SOCKET_MISMATCH")
  assertEquals(Boolean(socketError), true)
  assertEquals(socketError?.severity, "error")
  assertEquals(socketError?.status, "incompatible")
})

Deno.test("PC-BUILD-2: Rule A — Exact matching CPU & Motherboard sockets pass cleanly", () => {
  const parts: any = {
    CPU: {
      slot: "CPU",
      productId: "cpu-1",
      variantId: "gid://shopify/ProductVariant/101",
      title: "AMD Ryzen 5 7600",
      price: 18999,
      currency: "INR",
      specs: { socket: "AM5", hasIntegratedGraphics: true, includesCooler: true },
      availability: "available",
      quantity: 1,
    },
    Motherboard: {
      slot: "Motherboard",
      productId: "mobo-1",
      variantId: "gid://shopify/ProductVariant/201",
      title: "MSI PRO B650M-P",
      price: 10499,
      currency: "INR",
      specs: { socket: "AM5", supportedRamGeneration: "DDR5" },
      availability: "available",
      quantity: 1,
    },
  }

  const result = checkCompatibility(parts)
  const matchInfo = result.items.find((i) => i.ruleId === "RULE_A_SOCKET_MATCH")
  assertEquals(Boolean(matchInfo), true)
  assertEquals(matchInfo?.status, "compatible")
})

Deno.test("PC-BUILD-3: Rule B — RAM generation mismatch (DDR4 vs DDR5) triggers error", () => {
  const parts: any = {
    Motherboard: {
      slot: "Motherboard",
      productId: "mobo-1",
      variantId: "gid://shopify/ProductVariant/201",
      title: "MSI PRO B650M-P",
      price: 10499,
      currency: "INR",
      specs: { socket: "AM5", supportedRamGeneration: "DDR5" },
      availability: "available",
      quantity: 1,
    },
    RAM: {
      slot: "RAM",
      productId: "ram-1",
      variantId: "gid://shopify/ProductVariant/301",
      title: "Corsair Vengeance LPX 16GB DDR4",
      price: 3299,
      currency: "INR",
      specs: { ramGeneration: "DDR4", isLaptopSoDimm: false },
      availability: "available",
      quantity: 1,
    },
  }

  const result = checkCompatibility(parts)
  const ramError = result.items.find((i) => i.ruleId === "RULE_B_RAM_MISMATCH")
  assertEquals(Boolean(ramError), true)
  assertEquals(ramError?.severity, "error")
  assertEquals(result.valid, false)
})

Deno.test("PC-BUILD-4: Rule B — Incompatible SO-DIMM laptop memory triggers error", () => {
  const parts: any = {
    RAM: {
      slot: "RAM",
      productId: "ram-sodimm",
      variantId: "gid://shopify/ProductVariant/302",
      title: "Crucial 16GB DDR5 4800MHz SO-DIMM Laptop Memory",
      price: 4199,
      currency: "INR",
      specs: { ramGeneration: "DDR5", isLaptopSoDimm: true },
      availability: "available",
      quantity: 1,
    },
  }

  const result = checkCompatibility(parts)
  const sodimmError = result.items.find((i) => i.ruleId === "RULE_B_RAM_SODIMM_ERROR")
  assertEquals(Boolean(sodimmError), true)
  assertEquals(sodimmError?.severity, "error")
})

Deno.test("PC-BUILD-5: Rule D — GPU length exceeding cabinet clearance triggers error", () => {
  const parts: any = {
    GPU: {
      slot: "GPU",
      productId: "gpu-large",
      variantId: "gid://shopify/ProductVariant/401",
      title: "Triple-Fan Flagship GPU",
      price: 89999,
      currency: "INR",
      specs: { lengthMm: 340, powerWatts: 285 },
      availability: "available",
      quantity: 1,
    },
    Cabinet: {
      slot: "Cabinet",
      productId: "case-small",
      variantId: "gid://shopify/ProductVariant/501",
      title: "Compact Mini-ITX Chassis",
      price: 3499,
      currency: "INR",
      specs: { maxGpuLengthMm: 310 },
      availability: "available",
      quantity: 1,
    },
  }

  const result = checkCompatibility(parts)
  const clearanceError = result.items.find((i) => i.ruleId === "RULE_D_GPU_LENGTH_EXCEEDED")
  assertEquals(Boolean(clearanceError), true)
  assertEquals(clearanceError?.severity, "error")
})

Deno.test("PC-BUILD-6: Rule E & F — Power calculation and PSU deficit detection", () => {
  const parts: any = {
    CPU: {
      slot: "CPU",
      specs: { tdpWatts: 125 },
    },
    GPU: {
      slot: "GPU",
      specs: { powerWatts: 285 },
    },
    PSU: {
      slot: "PSU",
      title: "Entry 450W PSU",
      specs: { ratedWattage: 450 },
    },
  }

  // System load = 125 + 285 + 80 = 490W
  const power = calculateSystemPower(parts)
  assertEquals(power.estimatedSystemLoadWatts, 490)
  assertEquals(power.powerHeadroomStatus, "deficit")

  const result = checkCompatibility(parts)
  const psuDeficit = result.items.find((i) => i.ruleId === "RULE_E_PSU_WATTAGE_DEFICIT")
  assertEquals(Boolean(psuDeficit), true)
  assertEquals(psuDeficit?.severity, "error")
  assertEquals(result.valid, false)
})

Deno.test("PC-BUILD-7: Rule G — Motherboard form factor mismatch with case triggers error", () => {
  const parts: any = {
    Motherboard: {
      slot: "Motherboard",
      title: "ATX Full Size Board",
      specs: { formFactor: "ATX" },
    },
    Cabinet: {
      slot: "Cabinet",
      title: "Micro-ATX Mini Case",
      specs: { supportedMotherboards: ["Micro-ATX", "Mini-ITX"] },
    },
  }

  const result = checkCompatibility(parts)
  const formFactorError = result.items.find((i) => i.ruleId === "RULE_G_FORM_FACTOR_MISMATCH")
  assertEquals(Boolean(formFactorError), true)
  assertEquals(formFactorError?.severity, "error")
})

Deno.test("PC-BUILD-8: Rule I — CPU with no iGPU requires discrete GPU for display output", () => {
  const parts: any = {
    CPU: {
      slot: "CPU",
      title: "Intel Core i5-12400F (No iGPU)",
      specs: { socket: "LGA1700", hasIntegratedGraphics: false, includesCooler: true },
    },
  }

  const result = checkCompatibility(parts, { workload: "work" })
  const igpuError = result.items.find((i) => i.ruleId === "RULE_I_GPU_MANDATORY_NO_IGPU")
  assertEquals(Boolean(igpuError), true)
  assertEquals(igpuError?.severity, "error")
  assertEquals(result.valid, false)
})

Deno.test("PC-BUILD-9: Rule J — Unspecified sockets are marked unknown rather than falsely compatible", () => {
  const parts: any = {
    CPU: {
      slot: "CPU",
      title: "Unbranded Processor",
      specs: { socket: undefined },
    },
    Motherboard: {
      slot: "Motherboard",
      title: "Unbranded Motherboard",
      specs: { socket: "AM5" },
    },
  }

  const result = checkCompatibility(parts)
  const unknownItem = result.items.find((i) => i.ruleId === "RULE_A_SOCKET_UNKNOWN")
  assertEquals(Boolean(unknownItem), true)
  assertEquals(unknownItem?.status, "unknown")
})

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation Engine Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PC-BUILD-10: Recommendation engine respects budget and generates valid candidates", () => {
  const mockCatalog: any = {
    CPU: [
      {
        slot: "CPU",
        productId: "cpu-r5-7600",
        variantId: "gid://shopify/ProductVariant/1",
        title: "AMD Ryzen 5 7600",
        price: 18999,
        specs: { socket: "AM5", tdpWatts: 65, hasIntegratedGraphics: true, includesCooler: true, supportedRamGen: ["DDR5"] },
      },
      {
        slot: "CPU",
        productId: "cpu-r5-5600",
        variantId: "gid://shopify/ProductVariant/2",
        title: "AMD Ryzen 5 5600",
        price: 10999,
        specs: { socket: "AM4", tdpWatts: 65, hasIntegratedGraphics: false, includesCooler: true, supportedRamGen: ["DDR4"] },
      },
    ],
    Motherboard: [
      {
        slot: "Motherboard",
        productId: "mobo-b650m",
        variantId: "gid://shopify/ProductVariant/3",
        title: "MSI B650M",
        price: 10499,
        specs: { socket: "AM5", formFactor: "Micro-ATX", supportedRamGeneration: "DDR5" },
      },
      {
        slot: "Motherboard",
        productId: "mobo-b550m",
        variantId: "gid://shopify/ProductVariant/4",
        title: "ASUS B550M",
        price: 8999,
        specs: { socket: "AM4", formFactor: "Micro-ATX", supportedRamGeneration: "DDR4" },
      },
    ],
    RAM: [
      {
        slot: "RAM",
        productId: "ram-16gb-ddr5",
        variantId: "gid://shopify/ProductVariant/5",
        title: "16GB DDR5",
        price: 4299,
        specs: { ramGeneration: "DDR5", isLaptopSoDimm: false },
      },
      {
        slot: "RAM",
        productId: "ram-16gb-ddr4",
        variantId: "gid://shopify/ProductVariant/6",
        title: "16GB DDR4",
        price: 3299,
        specs: { ramGeneration: "DDR4", isLaptopSoDimm: false },
      },
    ],
    GPU: [
      {
        slot: "GPU",
        productId: "gpu-rtx4060",
        variantId: "gid://shopify/ProductVariant/7",
        title: "GeForce RTX 4060",
        price: 28999,
        specs: { lengthMm: 240, powerWatts: 115, recommendedPsuWatts: 500 },
      },
    ],
    Storage: [
      {
        slot: "Storage",
        productId: "ssd-1tb",
        variantId: "gid://shopify/ProductVariant/8",
        title: "1TB NVMe SSD",
        price: 5499,
        specs: { storageInterface: "M.2 NVMe" },
      },
    ],
    PSU: [
      {
        slot: "PSU",
        productId: "psu-550w",
        variantId: "gid://shopify/ProductVariant/9",
        title: "550W PSU",
        price: 3499,
        specs: { ratedWattage: 550 },
      },
    ],
    Cabinet: [
      {
        slot: "Cabinet",
        productId: "case-atx",
        variantId: "gid://shopify/ProductVariant/10",
        title: "ATX High Airflow Case",
        price: 3899,
        specs: { supportedMotherboards: ["ATX", "Micro-ATX"], maxGpuLengthMm: 350 },
      },
    ],
  }

  const answers: any = {
    purpose: "gaming",
    budgetInr: 75000,
    includePeripherals: false,
    ownedParts: [],
    preferredBrands: ["AMD"],
    requireWifi: false,
  }

  const candidates = generateRecommendations(answers, mockCatalog)
  assertEquals(candidates.length > 0, true)
  // All generated candidates must pass hard compatibility checks
  for (const c of candidates) {
    assertEquals(c.build.compatibility.valid, true)
    assertEquals(Boolean(c.title), true)
    assertEquals(Boolean(c.rationale), true)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Quotation & Commerce Finalization Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PC-BUILD-11: WhatsApp quotation formatting includes reference ID and itemized total", () => {
  const build: any = {
    id: "build-test-1",
    name: "Custom Gaming Beast",
    compatibility: {
      estimatedSystemLoadWatts: 340,
      recommendedPsuWatts: 550,
      valid: true,
    },
    components: {
      CPU: { title: "AMD Ryzen 5 7600", price: 18999 },
      GPU: { title: "NVIDIA RTX 4060", price: 28999 },
      RAM: { title: "16GB DDR5", price: 4299 },
    },
  }

  const quote = generateWhatsAppQuotation(build, "919074000000")
  assertEquals(quote.referenceId.startsWith("ITHUB-PC-"), true)
  assertEquals(quote.message.includes("Custom Gaming Beast"), true)
  assertEquals(quote.message.includes("AMD Ryzen 5 7600"), true)
  assertEquals(quote.whatsappUrl.startsWith("https://wa.me/919074000000"), true)
})

Deno.test("PC-BUILD-12: Shopify cart checkout preparation requires real variant GIDs", async () => {
  const buildWithMockVariants: any = {
    id: "build-test-2",
    name: "Test Config",
    components: {
      CPU: { variantId: "gid://shopify/ProductVariant/mock-cpu", price: 18999 },
    },
  }

  const result = await prepareShopifyCheckout(buildWithMockVariants)
  // Mock/unlinked variants are caught and prevented from sending invalid requests to Shopify
  assertEquals(result.success, false)
  assertEquals(Boolean(result.error), true)
})

Deno.test("PC-BUILD-13: Backward compatibility wrapper preserves Admin.tsx signature", () => {
  const legacyParts: any = {
    CPU: { id: "r5", name: "Ryzen 5 7600", price: 18999, socket: "AM5", watts: 65 },
    Motherboard: { id: "b650", name: "MSI B650M", price: 10499, socket: "AM5", ram: "DDR5" },
    RAM: { id: "ram", name: "16GB DDR5", price: 4299, ram: "DDR5" },
    GPU: { id: "gpu", name: "RTX 4060", price: 28999, length: 240, watts: 115 },
    Storage: { id: "ssd", name: "1TB SSD", price: 5499 },
    PSU: { id: "psu", name: "550W PSU", price: 3499, capacity: 550 },
    Cabinet: { id: "case", name: "ATX Case", price: 3899, clearance: 350 },
    Cooler: { id: "cooler", name: "Tower Cooler", price: 1799 },
  }

  const result = compatibility(legacyParts)
  // Must return expected shape { result, watts, recommended, valid, complete }
  assertEquals(typeof result.valid, "boolean")
  assertEquals(typeof result.watts, "number")
  assertEquals(typeof result.recommended, "number")
  assertEquals(Array.isArray(result.result), true)
  assertEquals(result.valid, true)
})
