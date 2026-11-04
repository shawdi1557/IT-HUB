// supabase/functions/tests/pc-builder-psu-rules.test.ts
// A power supply must carry the actual load and have the connectors the card needs. Below the maker's
// recommended wattage goes to a technician. A populated wattage never clears a review by itself.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const {
  checkCompatibility,
  calculateSystemPower,
  gpuConnectorNeeds,
  missingConnectors,
  psuConnectors,
  readPcieConnectors,
} = await import("../../../src/lib/builder/compatibility.ts");
const { generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");
const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");

const part = (slot: string, title: string, specs: any = {}): any => ({
  slot,
  productId: title,
  variantId: `gid://shopify/ProductVariant/${title}`,
  title,
  price: 1000,
  currency: "INR",
  specs,
  availability: "available",
  quantity: 1,
});
const rule = (parts: any, ruleId: string) =>
  checkCompatibility(parts).items.find((item: any) => item.ruleId === ruleId);
const CPU = part("CPU", "Processor", { tdpWatts: 65 });
const CARD_8PIN = part("GPU", "Card", {
  powerWatts: 115,
  recommendedPsuWatts: 550,
  requiredPcieConnectors: ["8-pin"],
});
const psu = (watts: number | undefined, connectors?: string[]) =>
  part("PSU", "Power Supply", { ratedWattage: watts, pciePowerConnectors: connectors });

// ── Connector wording ────────────────────────────────────────────────────────

Deno.test("CONNECTORS: none means zero, in every spelling", () => {
  for (const text of ["none", "None", "NONE", "0", "no", "n/a", "zero"]) {
    assertEquals(readPcieConnectors([text]), { sixPin: 0, eightPin: 0, sixteenPin: 0 }, text);
  }
});

Deno.test("CONNECTORS: types and counts are read", () => {
  assertEquals(readPcieConnectors(["6+2-pin", "6+2-pin"]), {
    sixPin: 0,
    eightPin: 2,
    sixteenPin: 0,
  });
  assertEquals(readPcieConnectors(["2x 8-pin"]), { sixPin: 0, eightPin: 2, sixteenPin: 0 });
  assertEquals(readPcieConnectors(["1x 16-pin (12VHPWR)"]), {
    sixPin: 0,
    eightPin: 0,
    sixteenPin: 1,
  });
  assertEquals(readPcieConnectors(["1x 12V-2x6", "1x 8-pin"]), {
    sixPin: 0,
    eightPin: 1,
    sixteenPin: 1,
  });
  assertEquals(readPcieConnectors(["1x 6-pin"]), { sixPin: 1, eightPin: 0, sixteenPin: 0 });
});

Deno.test("CONNECTORS: wording that can't be read gives no answer, not a guess", () => {
  assertEquals(readPcieConnectors(["some cables"]), undefined);
  assertEquals(psuConnectors({ pciePowerConnectors: ["8-pin", "mystery"] }), undefined);
});

Deno.test("CONNECTORS: stated counts are read, with zero as a real answer", () => {
  assertEquals(psuConnectors({ pcie6Plus2Count: 0, pcie16PinCount: 0 }), {
    sixPin: 0,
    eightPin: 0,
    sixteenPin: 0,
  });
  assertEquals(gpuConnectorNeeds({ pcie6Plus2Required: 1, pcie16PinRequired: 0 }), {
    sixPin: 0,
    eightPin: 1,
    sixteenPin: 0,
  });
});

Deno.test("CONNECTORS: one count left blank is no answer, not a zero", () => {
  assertEquals(psuConnectors({ pcie6Plus2Count: 2 }), undefined);
  assertEquals(psuConnectors({ pcie16PinCount: 0 }), undefined);
  assertEquals(gpuConnectorNeeds({ pcie16PinRequired: 1 }), undefined);
});

Deno.test("CONNECTORS: types must match", () => {
  const set = (sixPin: number, eightPin: number, sixteenPin: number) => ({
    sixPin,
    eightPin,
    sixteenPin,
  });
  assertEquals(missingConnectors(set(0, 1, 0), set(0, 2, 0)), undefined);
  assertEquals(missingConnectors(set(0, 2, 0), set(0, 1, 0)), "1 8-pin");
  // A 16-pin cable can't stand in for an 8-pin socket, or the other way round.
  assertEquals(missingConnectors(set(0, 1, 0), set(0, 0, 1)), "1 8-pin");
  assertEquals(missingConnectors(set(0, 0, 1), set(0, 3, 0)), "1 16-pin");
  // A 6+2-pin plug serves a 6-pin socket, but a 6-pin plug can't serve an 8-pin socket.
  assertEquals(missingConnectors(set(1, 0, 0), set(0, 1, 0)), undefined);
  assertEquals(missingConnectors(set(0, 1, 0), set(1, 0, 0)), "1 8-pin");
  // A spare 6+2-pin plug is used only once.
  assertEquals(missingConnectors(set(1, 1, 0), set(0, 1, 0)), "1 6-pin");
});

Deno.test("CONNECTORS: a 16-pin card works on 8-pin cables only with the adapter from its box", () => {
  const needs16 = { sixPin: 0, eightPin: 0, sixteenPin: 1 };
  assertEquals(missingConnectors(needs16, { sixPin: 0, eightPin: 2, sixteenPin: 0 }, 2), undefined);
  assertEquals(
    missingConnectors(needs16, { sixPin: 0, eightPin: 1, sixteenPin: 0 }, 2),
    "1 16-pin",
  );
  assertEquals(
    missingConnectors(needs16, { sixPin: 0, eightPin: 2, sixteenPin: 0 }, 0),
    "1 16-pin",
  );
  // The plugs an adapter uses aren't free for anything else.
  assertEquals(
    missingConnectors(
      { sixPin: 0, eightPin: 1, sixteenPin: 1 },
      { sixPin: 0, eightPin: 2, sixteenPin: 0 },
      2,
    ),
    "1 16-pin",
  );
});

// ── Rule outcomes ────────────────────────────────────────────────────────────

Deno.test("RULES: zero connectors fail a card that needs one", () => {
  const parts = { CPU, GPU: CARD_8PIN, PSU: psu(650, ["none"]) };
  const item: any = rule(parts, "RULE_F_PCIE_POWER_INSUFFICIENT");
  assertEquals(item?.severity, "error");
  assert(!rule(parts, "RULE_F_PCIE_POWER_MATCH"));
  assertEquals(checkCompatibility(parts).status, "incompatible");
});

Deno.test("RULES: zero connectors fail any card drawing more than the slot gives, type unknown", () => {
  const card = part("GPU", "Unstated Card", { powerWatts: 115 });
  assertEquals(
    (rule({ CPU, GPU: card, PSU: psu(650, ["none"]) }, "RULE_F_PCIE_POWER_INSUFFICIENT") as any)
      ?.severity,
    "error",
  );
});

Deno.test("RULES: zero connectors are fine for a card the slot can power", () => {
  const low = part("GPU", "Low Power Card", { powerWatts: 70 });
  assert(rule({ CPU, GPU: low, PSU: psu(450, ["none"]) }, "RULE_F_PCIE_POWER_NOT_REQUIRED"));
  const stated = part("GPU", "Slot Card", {
    pcie6Plus2Required: 0,
    pcie16PinRequired: 0,
    powerWatts: 70,
  });
  assert(rule({ CPU, GPU: stated, PSU: psu(450, ["none"]) }, "RULE_F_PCIE_POWER_NOT_REQUIRED"));
});

Deno.test("RULES: a card can't need no cable and also draw more than the slot gives", () => {
  const contradictory = part("GPU", "RTX 4060 Card", {
    pcie6Plus2Required: 0,
    pcie16PinRequired: 0,
    powerWatts: 115,
    recommendedPsuWatts: 550,
  });
  const parts = { CPU, GPU: contradictory, PSU: psu(650, ["2x 8-pin"]) };
  assert(!rule(parts, "RULE_F_PCIE_POWER_NOT_REQUIRED"));
  assert(rule(parts, "RULE_F_GPU_CONNECTORS_UNKNOWN"));
  assertEquals(checkCompatibility(parts).hasBlockingUnknowns, true);
});

Deno.test("RULES: the wrong connector type fails, even with enough connectors", () => {
  const card = part("GPU", "16-pin Card", { powerWatts: 200, requiredPcieConnectors: ["16-pin"] });
  const item: any = rule(
    { CPU, GPU: card, PSU: psu(850, ["8-pin", "8-pin"]) },
    "RULE_F_PCIE_POWER_INSUFFICIENT",
  );
  assert(item?.explanation.includes("16-pin"), item?.explanation);
});

Deno.test("RULES: a card's unstated connector type isn't guessed from its power draw", () => {
  const card = part("GPU", "Unstated Card", { powerWatts: 250 });
  const parts = { CPU, GPU: card, PSU: psu(850, ["8-pin"]) };
  assert(rule(parts, "RULE_F_GPU_CONNECTORS_UNKNOWN"));
  assert(!rule(parts, "RULE_F_PCIE_POWER_INSUFFICIENT"));
  assert(!rule(parts, "RULE_F_PCIE_POWER_MATCH"));
  assertEquals(checkCompatibility(parts).hasBlockingUnknowns, true);
});

Deno.test("RULES: requiredPciePins wording counts as the card's stated need", () => {
  const card = part("GPU", "Card", { powerWatts: 115, requiredPciePins: "1x 8-pin" });
  assert(rule({ CPU, GPU: card, PSU: psu(650, ["6+2-pin"]) }, "RULE_F_PCIE_POWER_MATCH"));
  assert(rule({ CPU, GPU: card, PSU: psu(650, ["none"]) }, "RULE_F_PCIE_POWER_INSUFFICIENT"));
});

// ── Load and recommendation are different things ─────────────────────────────

Deno.test("POWER: load and the maker's recommendation are reported separately", () => {
  const power: any = calculateSystemPower({ CPU, GPU: CARD_8PIN, PSU: psu(400) });
  assertEquals(power.estimatedSystemLoadWatts, 260);
  assertEquals(power.manufacturerRecommendedPsuWatts, 550);
  assertEquals(power.recommendedPsuWatts, 550);
  const noMaker: any = calculateSystemPower({ CPU });
  assertEquals(noMaker.manufacturerRecommendedPsuWatts, undefined);
});

Deno.test("POWER: below the load fails compatibility", () => {
  const parts = { CPU, GPU: CARD_8PIN, PSU: psu(200, ["8-pin"]) };
  assertEquals((rule(parts, "RULE_E_PSU_WATTAGE_DEFICIT") as any)?.severity, "error");
  assertEquals(checkCompatibility(parts).status, "incompatible");
});

Deno.test("POWER: above the load but below the recommendation goes to a technician", () => {
  const parts = { CPU, GPU: CARD_8PIN, PSU: psu(400, ["8-pin"]) };
  const summary = checkCompatibility(parts);
  assert(rule(parts, "RULE_E_PSU_BELOW_RECOMMENDED"));
  assert(!summary.items.some((item: any) => item.severity === "error"));
  assertEquals(summary.status, "unknown");
  assertEquals(summary.hasBlockingUnknowns, true);
  assertEquals(summary.validForAutomatedRecommendation, false);
  // Not called incompatible, so a customer can still ask for a quotation.
  assertEquals(summary.valid, true);
});

Deno.test("POWER: exactly the recommended wattage passes", () => {
  const parts = { CPU, GPU: CARD_8PIN, PSU: psu(550, ["8-pin"]) };
  assert(!rule(parts, "RULE_E_PSU_BELOW_RECOMMENDED"));
  assertEquals(checkCompatibility(parts).hasBlockingUnknowns, false);
});

Deno.test("POWER: exactly the load isn't a failure, and a card's missing recommendation goes to review", () => {
  const card = part("GPU", "Card", { powerWatts: 115, requiredPcieConnectors: ["8-pin"] });
  const parts = { CPU, GPU: card, PSU: psu(260, ["8-pin"]) };
  assert(!rule(parts, "RULE_E_PSU_WATTAGE_DEFICIT"));
  assert(rule(parts, "RULE_E_RECOMMENDED_UNKNOWN"));
  assertEquals(checkCompatibility(parts).hasBlockingUnknowns, true);
  assertEquals(checkCompatibility(parts).valid, true);
});

// ── A processor's base power isn't what it can draw ─────────────────────────────────────────────

const INTEL_14600K = part("CPU", "Core i5-14600K", { tdpWatts: 125, maxTurboPowerWatts: 181 });
const CARD_220W = part("GPU", "Card", {
  powerWatts: 220,
  recommendedPsuWatts: 450,
  requiredPcieConnectors: ["2x 8-pin"],
});

Deno.test("POWER: the load counts a processor's stated maximum, not its base power", () => {
  const power = calculateSystemPower({ CPU: INTEL_14600K, GPU: CARD_220W });
  assertEquals(power.estimatedSystemLoadWatts, 181 + 220 + 80);
  assertEquals(power.cpuPeakStated, true);
  // 450W would cover base power (425W), but not what this processor can actually draw (481W).
  const parts = { CPU: INTEL_14600K, GPU: CARD_220W, PSU: psu(450, ["2x 8-pin"]) };
  assert(rule(parts, "RULE_E_PSU_WATTAGE_DEFICIT"));
  assertEquals(checkCompatibility(parts).valid, false);
});

Deno.test("POWER: with a stated maximum, thin headroom stays a note rather than a review", () => {
  const parts = { CPU: INTEL_14600K, GPU: CARD_220W, PSU: psu(500, ["2x 8-pin"]) };
  assert(rule(parts, "RULE_E_PSU_HEADROOM_LIMITED"));
  assertEquals(checkCompatibility(parts).hasBlockingUnknowns, false);
});

Deno.test("POWER: thin headroom with an unstated maximum goes to review", () => {
  const base = part("CPU", "Base Only CPU", { tdpWatts: 125 });
  const parts = { CPU: base, GPU: CARD_220W, PSU: psu(500, ["2x 8-pin"]) };
  assert(rule(parts, "RULE_E_CPU_PEAK_UNKNOWN"));
  assertEquals(checkCompatibility(parts).hasBlockingUnknowns, true);
  // Plenty of headroom doesn't depend on the maximum, so it stays confirmed.
  const ample = { CPU: base, GPU: CARD_220W, PSU: psu(750, ["2x 8-pin"]) };
  assert(rule(ample, "RULE_E_PSU_HEADROOM_ADEQUATE"));
  assert(!rule(ample, "RULE_E_CPU_PEAK_UNKNOWN"));
});

Deno.test("POWER: what's known can fail a build even when something else is unknown", () => {
  const unknownCard = part("GPU", "Unknown Card", {});
  const parts = { CPU: INTEL_14600K, GPU: unknownCard, PSU: psu(200, ["8-pin"]) };
  assert(rule(parts, "RULE_E_PSU_WATTAGE_DEFICIT"));
  // Above the known part, the unknown one decides, so it's a review.
  const above = { CPU: INTEL_14600K, GPU: unknownCard, PSU: psu(300, ["8-pin"]) };
  assert(!rule(above, "RULE_E_PSU_WATTAGE_DEFICIT"));
  assert(rule(above, "RULE_E_POWER_DRAW_UNKNOWN"));
});

// ── What a listing's wording actually says ──────────────────────────────────────────────────────

Deno.test("CONNECTORS: wording is read for what it says, and anything unclear gives no answer", () => {
  const read = (text: string) => readPcieConnectors([text]);
  const cases: [string, [number, number, number] | undefined][] = [
    ["none", [0, 0, 0]],
    ["None required", [0, 0, 0]],
    ["No power connector", [0, 0, 0]],
    ["PCIe (6+2) Connectors-0", [0, 0, 0]],
    ["0x 8-pin", [0, 0, 0]],
    ["1x 8-pin", [0, 1, 0]],
    ["8-pin", [0, 1, 0]],
    ["Dual 8-pin", [0, 2, 0]],
    ["Triple 8 pin", [0, 3, 0]],
    ["8-pin x 2", [0, 2, 0]],
    ["2 8-pin", [0, 2, 0]],
    ["6+2-pin", [0, 1, 0]],
    ["2x 6+2-pin", [0, 2, 0]],
    ["PCIe (6+2) Connectors-4", [0, 4, 0]],
    ["2x 8-pin + 1x 6-pin", [1, 2, 0]],
    ["2x 8-pin, 1x 6-pin", [1, 2, 0]],
    ["6+8-pin", [1, 1, 0]],
    ["8+8-pin", [0, 2, 0]],
    ["6-pin", [1, 0, 0]],
    ["1x 16-pin (12VHPWR)", [0, 0, 1]],
    ["1x 12V-2x6", [0, 0, 1]],
    ["12V-2×6", [0, 0, 1]],
    ["12+4 pin", [0, 0, 1]],
    ["1x 12V-2x6, 2x 6+2-pin", [0, 2, 1]],
    // A processor's cable doesn't power a graphics card.
    ["1x EPS 8-pin", [0, 0, 0]],
    ["CPU 8-pin", [0, 0, 0]],
    ["2x 4+4-pin", [0, 0, 0]],
    ["2x 8-pin, 1x EPS 8-pin", [0, 2, 0]],
    // Anything else stays unanswered, so it goes to review.
    ["Standard connectors", undefined],
    ["6/8", undefined],
    ["See description", undefined],
  ];
  for (const [text, expected] of cases) {
    const result = read(text);
    assertEquals(
      result && [result.sixPin, result.eightPin, result.sixteenPin],
      expected,
      `"${text}"`,
    );
  }
});

Deno.test("POWER: a wattage alone never clears a review", () => {
  const unknownConnectors = { CPU, GPU: CARD_8PIN, PSU: psu(650) };
  assert(rule(unknownConnectors, "RULE_F_PCIE_CONNECTORS_UNKNOWN"));
  assertEquals(checkCompatibility(unknownConnectors).hasBlockingUnknowns, true);
  const unknownDraw = {
    CPU,
    GPU: part("GPU", "Card", { requiredPcieConnectors: ["8-pin"] }),
    PSU: psu(650, ["8-pin"]),
  };
  assert(rule(unknownDraw, "RULE_E_POWER_DRAW_UNKNOWN"));
  assertEquals(checkCompatibility(unknownDraw).hasBlockingUnknowns, true);
});

// ── The live Ant Esports VS400L and RTX 4060 pair ────────────────────────────

let nextId = 8000;
const product = (name: string, extra: Record<string, unknown> = {}): any => {
  const id = nextId++;
  return {
    id: `gid://shopify/Product/${id}`,
    name,
    handle: `product-${id}`,
    price: 5000,
    tags: [],
    variantId: `gid://shopify/ProductVariant/${id}`,
    availableForSale: true,
    stock: 10,
    specs: {},
    ...extra,
  };
};
// The live store's products, with the same names, categories and prices.
const liveParts = (
  psuSpecs: Record<string, string> = {},
  cardSpecs: Record<string, string> = {},
) => [
  product("AMD Ryzen 5 5600", { category: "Computer Processors", price: 9000 }),
  product("B550M DDR4 Motherboard", { category: "Motherboards", price: 7000 }),
  product("16GB DDR4 Desktop RAM", { category: "RAM", price: 3000 }),
  product("NVIDIA RTX 4060 8GB", {
    category: "Video Cards & Adapters",
    price: 28000,
    specs: cardSpecs,
  }),
  product("SANDISK Optimus 5100 NVMe SSD, 500GB, Upto 6600MB/s R, 5600MB/s W", {
    category: "Solid State Drives",
    price: 11000,
  }),
  product("Ant Esports VS400L Value Series Power Supply", {
    category: "Computer Power Supplies",
    price: 1000,
    specs: psuSpecs,
  }),
  product("Zebronics Zeb Twoface Gaming Mini Cabinet", {
    category: "Desktop Computer & Server Cases",
    price: 2100,
  }),
];
const GAMING = {
  purpose: "gaming",
  details: {},
  budgetId: "60-80",
  brands: [],
  wifi: "",
  owned: [],
};
const BAND = { min: 60000, max: 80000 };
const offered = (
  specs: Record<string, string>,
  cardSpecs: Record<string, string> = {},
  allowUnverified = true,
) =>
  generateDynamicCatalogRecommendations(
    syncBuilderCatalogWithShopify(liveParts(specs, cardSpecs)).componentCatalog,
    GAMING,
    BAND,
    { allowUnverified },
  );

Deno.test("VS400L: with no data entered, the build is offered and needs review", () => {
  const [build] = offered({});
  assertEquals(build.price, 61100);
  assertEquals(build.requiresReview, true);
});

Deno.test("VS400L: entering 400W doesn't clear the review", () => {
  const [build] = offered({ capacity_watts: "400" });
  assert(build, "the build should still be offered for a technician to check");
  assertEquals(build.requiresReview, true);
  assertEquals(offered({ capacity_watts: "400" }, {}, false).length, 0);
});

Deno.test("VS400L: entering zero connectors rules the build out", () => {
  assertEquals(offered({ capacity_watts: "400", pcie_connectors: "none" }).length, 0);
  assertEquals(
    offered({ capacity_watts: "400", pcie_connectors: "none" }, { pcie_connectors: "8-pin" })
      .length,
    0,
  );
});

Deno.test("VS400L: zero connectors rule it out even with plenty of wattage", () => {
  assertEquals(offered({ capacity_watts: "850", pcie_connectors: "none" }).length, 0);
});

Deno.test("VS400L: a power supply with the right connector is offered instead", () => {
  const catalog = syncBuilderCatalogWithShopify([
    ...liveParts({ capacity_watts: "400", pcie_connectors: "none" }),
    product("Vendor 650W Power Supply", {
      category: "Computer Power Supplies",
      price: 4500,
      specs: { capacity_watts: "650", pcie_connectors: "8-pin,8-pin" },
    }),
  ]).componentCatalog;
  const [build] = generateDynamicCatalogRecommendations(catalog, GAMING, BAND, {
    allowUnverified: true,
  });
  assertEquals(build.parts.PSU.name, "Vendor 650W Power Supply");
  assertEquals(build.price, 64600);
});
