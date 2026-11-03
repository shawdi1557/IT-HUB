// supabase/functions/tests/pc-builder-evidence-ranking.test.ts
// Build labels rest only on published specifications, and say so when those can't settle a comparison.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { generateDynamicCatalogRecommendations, generateRecommendations, getBudgetShortfallInfo } =
  await import("../../../src/lib/builder/recommendations.ts");
const {
  buildBuilderCatalog,
  syncBuilderCatalogWithShopify,
  matchShopifyProductToComponent,
  VERIFIED_HARDWARE_SPECS,
} = await import("../../../src/lib/builder/catalog.ts");
const {
  compareBuildPerformance,
  comparePartPerformance,
  describeSpecSource,
  performanceEvidence,
  rankBuilds,
} = await import("../../../src/lib/builder/ranking.ts");
const { compatibility } = await import("../../../src/lib/builder/compatibility.ts");

let nextId = 5000;
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
const liveCatalog = (products: any[]) => syncBuilderCatalogWithShopify(products).componentCatalog;
const matchProduct = (item: any): any => matchShopifyProductToComponent(item);

// Published figures, from each manufacturer's product page.
const SOURCE = "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/";
const ada = (
  shaderUnits: number,
  boostClockMhz: number,
  vramGb: number,
  memoryBusBits: number,
) => ({
  architecture: "Ada Lovelace",
  figures: { shaderUnits, boostClockMhz, vramGb, memoryBusBits },
  sourceUrl: SOURCE,
  checkedOn: "2026-11-03",
});
const RTX_4060 = ada(3072, 2460, 8, 128);
const RTX_4070_SUPER = ada(7168, 2480, 12, 192);
const RTX_4090 = ada(16384, 2520, 24, 384);
const RX_7600 = {
  architecture: "RDNA 3",
  figures: { shaderUnits: 2048, boostClockMhz: 2655, vramGb: 8, memoryBusBits: 128 },
  sourceUrl: "https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/",
  checkedOn: "2026-11-03",
};
const cpuFigures = (
  architecture: string,
  cores: number,
  threads: number,
  maxBoostMhz: number,
  cacheMb: number,
) => ({
  architecture,
  figures: { performanceCores: cores, totalCores: cores, threads, maxBoostMhz, cacheMb },
  sourceUrl: "https://www.amd.com/en/products/processors/desktops/ryzen.html",
  checkedOn: "2026-11-03",
});

const part = (
  name: string,
  performance?: unknown,
  verificationStatus = "manufacturer_verified",
): any => ({ id: name, name, performance, verificationStatus });
const build = (price: number, CPU: any, GPU?: any, requiresReview = false): any => ({
  price,
  requiresReview,
  parts: { CPU, GPU },
});
const GAMING_RULES = { ownedSlots: new Set<string>(), needsDedicatedGpu: true };
const labels = (builds: any[], rules = GAMING_RULES) =>
  rankBuilds(builds, rules).map((r: any) => r.label);

const R5 = part("Ryzen 5 7600", cpuFigures("Zen 4", 6, 12, 5100, 32));
const R7 = part("Ryzen 7 7700", cpuFigures("Zen 4", 8, 16, 5300, 32));
const R9 = part("Ryzen 9 7900", cpuFigures("Zen 4", 12, 24, 5400, 64));
const G4060 = part("RTX 4060", RTX_4060);
const G4070S = part("RTX 4070 SUPER", RTX_4070_SUPER);
const G4090 = part("RTX 4090", RTX_4090);

// ── Comparing parts ──────────────────────────────────────────────────────────

Deno.test("RANK: with sufficient verified figures, the RTX 4090 is higher than the RTX 4060", () => {
  assertEquals(comparePartPerformance("GPU", G4090, G4060), "higher");
  assertEquals(comparePartPerformance("GPU", G4060, G4090), "lower");
});

Deno.test("RANK: price and title play no part in comparing parts", () => {
  const cheapTitle = part("RTX 4090", RTX_4060);
  const dearTitle = part("RTX 4060", RTX_4090);
  assertEquals(comparePartPerformance("GPU", dearTitle, cheapTitle), "higher");
});

Deno.test("RANK: more memory alone doesn't make a graphics card higher", () => {
  const sixteen = part("Card 16GB", ada(4352, 2535, 16, 128));
  const eight = part("Card 8GB", ada(4352, 2535, 8, 128));
  assertEquals(comparePartPerformance("GPU", sixteen, eight), "no_clear_difference");
});

Deno.test("RANK: more shader units alone don't make a graphics card higher", () => {
  const more = part("More units", ada(8000, 2500, 12, 192));
  const fewer = part("Fewer units", ada(4000, 2500, 12, 192));
  assertEquals(comparePartPerformance("GPU", more, fewer), "no_clear_difference");
});

Deno.test("RANK: more cores and threads alone don't make a processor higher", () => {
  // Cores and threads rise together, so they count as one kind of evidence.
  const more = part("More cores", cpuFigures("Zen 4", 16, 32, 5100, 32));
  const fewer = part("Fewer cores", cpuFigures("Zen 4", 6, 12, 5100, 32));
  assertEquals(comparePartPerformance("CPU", more, fewer), "no_clear_difference");
});

Deno.test("RANK: more cores don't outrank a chip with a higher clock or more cache", () => {
  const moreCores = part("More cores", cpuFigures("Zen 4", 12, 24, 5000, 32));
  const moreClock = part("Higher clock", cpuFigures("Zen 4", 8, 16, 5400, 32));
  const moreCache = part("More cache", cpuFigures("Zen 4", 8, 16, 5000, 96));
  assertEquals(comparePartPerformance("CPU", moreCores, moreClock), "incomparable");
  assertEquals(comparePartPerformance("CPU", moreCores, moreCache), "incomparable");
});

Deno.test("RANK: different architectures are never compared, whatever the figures say", () => {
  assertEquals(comparePartPerformance("GPU", G4090, part("RX 7600", RX_7600)), "incomparable");
  const zen3 = part("Older", cpuFigures("Zen 3", 16, 32, 5500, 64));
  const zen4 = part("Newer", cpuFigures("Zen 4", 6, 12, 5100, 32));
  assertEquals(comparePartPerformance("CPU", zen3, zen4), "incomparable");
});

Deno.test("RANK: a part with no figures, or incomplete ones, can't be compared", () => {
  assertEquals(comparePartPerformance("GPU", G4090, part("No figures")), "insufficient");
  const partial = part("Partial", {
    architecture: "Ada Lovelace",
    figures: { shaderUnits: 9000, boostClockMhz: 2600, vramGb: 16 },
    sourceUrl: SOURCE,
    checkedOn: "2026-11-03",
  });
  assertEquals(performanceEvidence("GPU", partial), "missing");
  assertEquals(comparePartPerformance("GPU", partial, G4060), "insufficient");
  const zero = part("Zero", ada(0, 2500, 8, 128));
  assertEquals(performanceEvidence("GPU", zero), "missing");
});

Deno.test("RANK: the same part, in any build, shows no difference", () => {
  assertEquals(comparePartPerformance("GPU", G4060, G4060), "no_clear_difference");
  assertEquals(
    comparePartPerformance("GPU", part("Unknown"), part("Unknown")),
    "no_clear_difference",
  );
});

// ── Evidence levels ──────────────────────────────────────────────────────────

Deno.test("RANK: evidence separates manufacturer, supplier and missing figures", () => {
  assertEquals(performanceEvidence("GPU", G4060), "manufacturer_verified");
  assertEquals(
    performanceEvidence("GPU", part("Supplier", RTX_4060, "supplier_spec")),
    "supplier_stated",
  );
  assertEquals(
    performanceEvidence("GPU", part("Title", RTX_4060, "title_derived")),
    "supplier_stated",
  );
  assertEquals(performanceEvidence("GPU", part("None")), "missing");
});

Deno.test("RANK: a manufacturer status without a named source isn't verified", () => {
  const unsourced = part("No source", { ...RTX_4060, sourceUrl: "" });
  assertEquals(performanceEvidence("GPU", unsourced), "supplier_stated");
  const notALink = part("Not a link", { ...RTX_4060, sourceUrl: "NVIDIA website" });
  assertEquals(performanceEvidence("GPU", notALink), "supplier_stated");
});

Deno.test("RANK: customers can tell where each part's specifications came from", () => {
  assertEquals(
    describeSpecSource("GPU", G4060),
    "Manufacturer's published figures, source on file",
  );
  assertEquals(
    describeSpecSource("GPU", part("Registry, no figures")),
    "On IT HUB's specification list, no performance figures on file",
  );
  assertEquals(
    describeSpecSource("GPU", part("Stated", undefined, "supplier_spec")),
    "Stated by the supplier, not checked",
  );
  assertEquals(
    describeSpecSource("GPU", part("Title", undefined, "title_derived")),
    "Read from the product title, not checked",
  );
  assertEquals(describeSpecSource("GPU", part("None", undefined, "unverified")), "Not stated");
});

Deno.test("RANK: a Shopify product can't supply or claim its own figures", () => {
  const claimed = product("Vendor RTX 4090 Super Card", {
    category: "Video Cards",
    tags: ["manufacturer_verified", "verified"],
    specs: {
      performance: RTX_4090,
      provenance: "manufacturer_verified",
      watts: "450",
    },
  });
  const comp = matchProduct(claimed);
  assertEquals(comp.specs.performance, undefined);
  assertEquals(comp.specs.provenance, "supplier_spec");
});

Deno.test("RANK: a title naming a chip earns no figures, and is labelled as title-derived", () => {
  const titled = matchProduct(
    product("Maker GeForce RTX 4060 8GB Gaming OC", { category: "Video Cards" }),
  );
  assertEquals(titled.specs.performance, undefined);
  assertEquals(titled.specs.provenance, "title_derived");
  assertEquals(titled.isVerified, false);
});

Deno.test("RANK: a similar processor doesn't inherit another model's figures", () => {
  for (const name of ["AMD Ryzen 5 5600X", "AMD Ryzen 5 5600X3D", "AMD Ryzen 5 7600X"]) {
    const comp = matchProduct(product(name, { category: "Processors" }));
    assertEquals(comp.specs.performance, undefined, name);
  }
});

Deno.test("RANK: every published figure in the registry names an official source", () => {
  const entries = Object.entries(VERIFIED_HARDWARE_SPECS) as [string, any][];
  const withFigures = entries.filter(([, entry]) => entry.specs.performance);
  assertEquals(withFigures.map(([key]) => key).sort(), [
    "cpu-i5-12400f",
    "cpu-i5-14600k",
    "cpu-r5-5600",
    "cpu-r5-7600",
    "cpu-r7-9700x",
    "gpu-rtx4060",
    "gpu-rtx4070-super",
    "gpu-rx7600",
  ]);
  for (const [key, entry] of withFigures) {
    const slot = key.startsWith("cpu") ? "CPU" : "GPU";
    const row = { id: key, name: key, ...entry.specs, verificationStatus: entry.specs.provenance };
    assertEquals(performanceEvidence(slot, row), "manufacturer_verified", key);
    assert(
      /^https:\/\/www\.(amd|intel|nvidia)\.com\//.test(entry.specs.performance.sourceUrl),
      key,
    );
  }
});

// ── Labelling builds ─────────────────────────────────────────────────────────

Deno.test("RANK: the RTX 4090 build earns the label, whatever the prices", () => {
  const builds = [build(70000, R5, G4060), build(190000, R5, G4090)];
  assertEquals(labels(builds), ["Best Value", "Highest Verified Performance"]);
  // The old scores called a cheaper RTX 4060 the better performer. Price no longer decides it.
  const reversed = [build(190000, R5, G4060), build(70000, R5, G4090)];
  const rankings = rankBuilds(reversed, GAMING_RULES);
  assertEquals(rankings[1].label, "Highest Verified Performance");
  assertEquals(rankings[0].outclassed, true);
  assert(rankings[1].reasons.some((reason: string) => reason.includes("lowest priced")));
});

Deno.test("RANK: three distinct builds earn three distinct labels, for three distinct reasons", () => {
  const combos = [
    build(70000, R5, G4060),
    build(120000, R5, G4070S),
    build(190000, R5, G4090),
    build(80000, R7, G4060),
    build(130000, R7, G4070S),
    build(200000, R7, G4090),
    build(95000, R9, G4060),
    build(145000, R9, G4070S),
    build(215000, R9, G4090),
  ];
  const rankings = rankBuilds(combos, GAMING_RULES);
  const with_ = (label: string) => combos[rankings.findIndex((r: any) => r.label === label)];
  assertEquals(with_("Best Value"), combos[0]);
  assertEquals(with_("Highest Verified Performance"), combos[8]);
  // The middle processor with the middle card, not the strongest card on the weakest processor.
  assertEquals(with_("Best Balanced"), combos[4]);
  assertEquals(rankings.filter((r: any) => r.label !== "Insufficient information").length, 3);
});

Deno.test("RANK: a lopsided build is never the balanced one", () => {
  const rankings = rankBuilds(
    [
      build(70000, R5, G4060),
      build(170000, R5, G4090),
      build(95000, R9, G4060),
      build(215000, R9, G4090),
    ],
    GAMING_RULES,
  );
  assert(!rankings.some((r: any) => r.label === "Best Balanced"));
});

Deno.test("RANK: one processor can't show balance, so no build is called balanced", () => {
  assertEquals(
    labels([build(70000, R5, G4060), build(120000, R5, G4070S), build(190000, R5, G4090)]),
    ["Best Value", "Insufficient information", "Highest Verified Performance"],
  );
});

Deno.test("RANK: missing graphics card figures give no label to anyone", () => {
  const builds = [
    build(70000, R5, part("Vendor RTX 4060")),
    build(190000, R5, part("Vendor RTX 4090")),
  ];
  const rankings = rankBuilds(builds, GAMING_RULES);
  assertEquals(
    rankings.map((r: any) => r.label),
    ["Insufficient information", "Insufficient information"],
  );
  assert(rankings[0].reasons[0].includes("Vendor RTX 4060"));
  assert(rankings[1].reasons[0].includes("Vendor RTX 4090"));
});

Deno.test("RANK: mixed confidence: only the verified builds are compared, and it's disclosed", () => {
  const supplier = part("Supplier RTX 4090", RTX_4090, "supplier_spec");
  const rankings = rankBuilds(
    [build(70000, R5, G4060), build(120000, R5, G4070S), build(190000, R5, supplier)],
    GAMING_RULES,
  );
  assertEquals(
    rankings.map((r: any) => r.label),
    ["Best Value", "Highest Verified Performance", "Insufficient information"],
  );
  assert(rankings[2].reasons[0].includes("haven't been checked"));
  // The label's own words say another build was left out.
  assert(rankings[1].reasons.some((r: string) => r.includes("1 other build couldn't be compared")));
});

Deno.test("RANK: supplier figures alone never earn a verified label", () => {
  const supplier = (name: string, figures: unknown) => part(name, figures, "supplier_spec");
  assertEquals(
    labels([
      build(70000, supplier("CPU", R5.performance), supplier("Low", RTX_4060)),
      build(190000, supplier("CPU", R5.performance), supplier("High", RTX_4090)),
    ]),
    ["Insufficient information", "Insufficient information"],
  );
});

Deno.test("RANK: a verified graphics card can't carry an unverified processor", () => {
  const unknownCpu = part("Unknown Processor");
  assertEquals(labels([build(70000, unknownCpu, G4060), build(190000, unknownCpu, G4090)]), [
    "Insufficient information",
    "Insufficient information",
  ]);
});

Deno.test("RANK: equal configurations aren't ranked against each other", () => {
  const rankings = rankBuilds(
    [build(70000, R5, G4060), build(70000, R5, part("Same figures", RTX_4060))],
    GAMING_RULES,
  );
  assertEquals(
    rankings.map((r: any) => r.label),
    ["Insufficient information", "Insufficient information"],
  );
  assert(rankings[0].reasons[0].includes("no clear difference"));
});

Deno.test("RANK: a dearer equal build is outclassed by the cheaper one", () => {
  const rankings = rankBuilds(
    [build(70000, R5, G4060), build(90000, R5, part("Same figures", RTX_4060))],
    GAMING_RULES,
  );
  assertEquals(rankings[1].outclassed, true);
  assertEquals(rankings[0].outclassed, false);
});

Deno.test("RANK: incomparable configurations give no value or performance label", () => {
  const rx = part("RX 7600", RX_7600);
  const rankings = rankBuilds(
    [build(60000, R5, rx), build(70000, R5, G4060), build(190000, R5, G4090)],
    GAMING_RULES,
  );
  assertEquals(
    rankings.map((r: any) => r.label),
    ["Insufficient information", "Insufficient information", "Insufficient information"],
  );
  assert(rankings[2].reasons[0].includes("compared like for like"));
});

Deno.test("RANK: a stronger processor with a weaker card can't be ordered against the reverse", () => {
  assertEquals(
    compareBuildPerformance(build(100000, R9, G4060), build(100000, R5, G4090), GAMING_RULES),
    "incomparable",
  );
  assertEquals(labels([build(95000, R9, G4060), build(100000, R5, G4090)]), [
    "Insufficient information",
    "Insufficient information",
  ]);
});

Deno.test("RANK: a single build has nothing to be ranked against", () => {
  const rankings = rankBuilds([build(70000, R5, G4060)], GAMING_RULES);
  assertEquals(rankings[0].label, "Insufficient information");
  assert(rankings[0].reasons[0].includes("nothing to rank it against"));
});

Deno.test("RANK: a build IT HUB must review earns no label, even with verified figures", () => {
  const rankings = rankBuilds(
    [build(70000, R5, G4060, true), build(190000, R5, G4090, true)],
    GAMING_RULES,
  );
  assertEquals(
    rankings.map((r: any) => r.label),
    ["Insufficient information", "Insufficient information"],
  );
  assert(rankings[0].reasons[0].includes("compatibility"));
});

Deno.test("RANK: integrated graphics can't be set against a dedicated card", () => {
  const rules = { ownedSlots: new Set<string>(), needsDedicatedGpu: false };
  assertEquals(
    compareBuildPerformance(build(50000, R5), build(80000, R5, G4060), rules),
    "incomparable",
  );
});

Deno.test("RANK: a purpose needing graphics gets no label for a build without a card", () => {
  const rankings = rankBuilds([build(50000, R5), build(80000, R9)], GAMING_RULES);
  assertEquals(rankings[0].label, "Insufficient information");
  assert(rankings[0].reasons[0].includes("no graphics card"));
});

Deno.test("RANK: everyday builds on integrated graphics compare by processor", () => {
  const rules = { ownedSlots: new Set<string>(), needsDedicatedGpu: false };
  assertEquals(labels([build(50000, R5), build(80000, R9)], rules), [
    "Best Value",
    "Highest Verified Performance",
  ]);
});

Deno.test("RANK: an owned card is the same in every build, so processors decide", () => {
  const rules = { ownedSlots: new Set(["GPU"]), needsDedicatedGpu: true };
  assertEquals(labels([build(50000, R5), build(80000, R9)], rules), [
    "Best Value",
    "Highest Verified Performance",
  ]);
  // No two parts left to weigh against each other, so nothing can be called balanced.
  assert(
    !labels([build(50000, R5), build(60000, R7), build(80000, R9)], rules).includes(
      "Best Balanced",
    ),
  );
});

Deno.test("RANK: nothing to compare when the customer owns the compared parts", () => {
  const rules = { ownedSlots: new Set(["CPU", "GPU"]), needsDedicatedGpu: true };
  assertEquals(labels([build(20000, R5), build(30000, R9)], rules), [
    "Insufficient information",
    "Insufficient information",
  ]);
});

Deno.test("RANK: the cheapest build isn't best value when another build can't be compared with it", () => {
  // It's verifiably below one build, but the Radeon card can't be set against it either way.
  const rankings = rankBuilds(
    [build(70000, R5, G4060), build(90000, R5, part("RX 7600", RX_7600)), build(190000, R5, G4090)],
    GAMING_RULES,
  );
  assert(!rankings.some((r: any) => r.label === "Best Value"));
});

Deno.test("RANK: a build beaten at its price can't be the balanced one", () => {
  const rankings = rankBuilds(
    [
      build(70000, R5, G4060),
      // The closest pairing, but the next build beats it for less.
      build(200000, R7, G4070S),
      build(100000, R9, G4070S),
      build(215000, R9, G4090),
    ],
    GAMING_RULES,
  );
  assertEquals(rankings[1].outclassed, true);
  assertEquals(rankings[1].label, "Insufficient information");
  assertEquals(rankings[2].label, "Best Balanced");
});

Deno.test("RANK: balanced needs a compared build above it", () => {
  // The two dearest builds can't be ordered, so each has a build below it and none above.
  const rankings = rankBuilds(
    [build(70000, R5, G4060), build(190000, R7, G4090), build(195000, R9, G4070S)],
    GAMING_RULES,
  );
  assert(!rankings.some((r: any) => r.label === "Best Balanced"));
});

Deno.test("RANK: balanced needs a compared build below it", () => {
  // The closest pairing, but neither cheaper build can be ordered against it.
  const rankings = rankBuilds(
    [
      build(80000, R9, G4060),
      build(90000, R5, G4090),
      build(100000, R7, G4070S),
      build(215000, R9, G4090),
    ],
    GAMING_RULES,
  );
  assertEquals(rankings[3].label, "Highest Verified Performance");
  assert(!rankings.some((r: any) => r.label === "Best Balanced"));
});

Deno.test("RANK: a graphics card that can't be compared means balance can't be judged", () => {
  const rx = part("RX 7600", RX_7600);
  const rankings = rankBuilds(
    [
      build(70000, R5, G4060),
      build(80000, R7, G4060),
      build(95000, R9, G4060),
      build(215000, R9, G4090),
      build(60000, R5, rx),
    ],
    GAMING_RULES,
  );
  assert(!rankings.some((r: any) => r.label === "Best Balanced"));
});

Deno.test("RANK: at the same price, the build with lower figures is outclassed", () => {
  const rankings = rankBuilds([build(90000, R5, G4060), build(90000, R5, G4090)], GAMING_RULES);
  assertEquals(rankings[0].outclassed, true);
  assertEquals(rankings[1].outclassed, false);
  assertEquals(rankings[1].label, "Highest Verified Performance");
});

// ── Through the engine ───────────────────────────────────────────────────────

const GAMING = { purpose: "gaming", details: {}, budgetId: "x", brands: [], wifi: "", owned: [] };
const am4Parts = () => [
  product("ASUS Prime B550M-A WiFi II Motherboard", { price: 9000 }),
  product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
  product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
  product("Deepcool PK650D 650W 80 Plus Bronze Power Supply", { price: 4500 }),
  product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
];

/** The figures a registry entry for this model would hold. No such entry exists for these cards. */
const addFigures = (catalog: any, slot: string, name: string, performance: unknown) => {
  const option = catalog[slot].find((item: any) => item.name === name);
  option.provenance = "manufacturer_verified";
  option.specs = { ...option.specs, provenance: "manufacturer_verified", performance };
};

Deno.test("ENGINE: real registry entries compare through the live pipeline", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
    product("Gigabyte GeForce RTX 4070 Super Windforce 12GB", { price: 58000 }),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 150000 });
  const label = (name: string) =>
    recs.find((r: any) => r.parts.GPU?.name.includes(name))?.tradeoffLabel;
  assertEquals(label("RTX 4060"), "Best Value");
  assertEquals(label("RTX 4070"), "Highest Verified Performance");
  for (const r of recs) {
    assertEquals(r.specSources.GPU, "Manufacturer's published figures, source on file");
    assert(r.rankingReasons.length > 0);
    assertEquals(r.tradeoff, r.tradeoffLabel);
  }
});

Deno.test("ENGINE: the old mislabelling is gone: title-only cards get no label at all", () => {
  // These are the cards the old scores called "Best Performance" and "Balanced Choice" in the wrong order.
  const gpu = (name: string, price: number) =>
    product(name, {
      category: "Video Cards",
      price,
      specs: { watts: "120", gpu_length_mm: "250", pcie_connectors: "8-pin" },
    });
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    gpu("Vendor RTX 3050 Card", 20000),
    gpu("Vendor RTX 4060 Card", 33000),
    gpu("Vendor RTX 4090 Card", 95000),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 150000 });
  assertEquals(recs.length, 3);
  for (const r of recs) {
    assertEquals(r.tradeoffLabel, "Insufficient information");
    assert(r.rankingReasons[0].includes(r.parts.GPU.name));
    assertEquals(r.specSources.GPU, "Stated by the supplier, not checked");
  }
  // In price order, because nothing here says one is better.
  assertEquals(
    recs.map((r: any) => r.price),
    recs
      .map((r: any) => r.price)
      .slice()
      .sort((a: number, b: number) => a - b),
  );
});

Deno.test("ENGINE: with verified figures, the RTX 4090 outranks the RTX 4060", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    product("Maker RTX 4060 Card", {
      category: "Video Cards",
      price: 33000,
      specs: { watts: "115", gpu_length_mm: "250", pcie_connectors: "8-pin" },
    }),
    product("Maker RTX 4090 Card", {
      category: "Video Cards",
      price: 95000,
      specs: { watts: "120", gpu_length_mm: "250", pcie_connectors: "8-pin" },
    }),
  ]);
  addFigures(catalog, "GPU", "Maker RTX 4060 Card", RTX_4060);
  addFigures(catalog, "GPU", "Maker RTX 4090 Card", RTX_4090);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 150000 });
  assertEquals(
    recs.map((r: any) => [r.parts.GPU.name, r.tradeoffLabel]),
    [
      ["Maker RTX 4060 Card", "Best Value"],
      ["Maker RTX 4090 Card", "Highest Verified Performance"],
    ],
  );
});

Deno.test("ENGINE: the live-style catalogue reports insufficient information, with a reason", () => {
  const catalog = liveCatalog([
    product("Vendor Mystery Processor", { category: "Processors", price: 9000 }),
    product("Vendor Mystery Motherboard", { category: "Motherboards", price: 9000 }),
    product("Vendor Mystery 16GB DDR4 RAM", { category: "RAM", price: 3000 }),
    product("Vendor Mystery 1TB NVMe SSD", { category: "Solid State Drives", price: 5000 }),
    product("Vendor Mystery 650W Power Supply", { category: "Power Supplies", price: 4500 }),
    product("Vendor Mystery Cabinet", { category: "Computer Cases", price: 3000 }),
    product("Vendor Mystery Graphics Card", { category: "Video Cards", price: 20000 }),
    product("Vendor Mystery CPU Cooler", { category: "CPU Coolers", price: 2000 }),
  ]);
  const recs = generateDynamicCatalogRecommendations(
    catalog,
    GAMING,
    { min: 30000, max: 150000 },
    {
      allowUnverified: true,
    },
  );
  assertEquals(recs.length, 1);
  assertEquals(recs[0].tradeoffLabel, "Insufficient information");
  assertEquals(recs[0].requiresReview, true);
  assert(recs[0].rankingReasons.length > 0);
});

Deno.test("ENGINE: no score is exposed, and the old labels are gone", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
    product("Gigabyte GeForce RTX 4070 Super Windforce 12GB", { price: 58000 }),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 150000 });
  assert(recs.length > 0);
  for (const r of recs) {
    assertEquals(r.score, undefined);
    assertEquals(r.workloadScore, undefined);
    assert(!["Best Performance", "Balanced Choice", "Higher-performance"].includes(r.tradeoff));
  }
});

Deno.test("ENGINE: budget optimisation never trades away compatibility", () => {
  // A cheap card too long for the only cabinet. The cheapest build in the catalogue would use it.
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    product("ASUS Prime B550M-A WiFi II Motherboard", { price: 9000 }),
    product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
    product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
    product("Deepcool PK650D 650W 80 Plus Bronze Power Supply", { price: 4500 }),
    product("Maker Compact Case", {
      category: "Computer Cases",
      price: 3900,
      specs: {
        cabinet_clearance_mm: "280",
        form_factor: "ATX",
        supported_motherboards: "ATX,Micro-ATX",
        max_cooler_height_mm: "160",
      },
    }),
    product("Maker Long Card", {
      category: "Video Cards",
      price: 15000,
      specs: { watts: "115", gpu_length_mm: "340", pcie_connectors: "8-pin" },
    }),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
    product("Gigabyte GeForce RTX 4070 Super Windforce 12GB", { price: 58000 }),
  ]);
  addFigures(catalog, "GPU", "Maker Long Card", ada(9000, 2600, 16, 256));
  const recs = generateDynamicCatalogRecommendations(
    catalog,
    GAMING,
    { min: 30000, max: 100000 },
    {
      allowUnverified: true,
    },
  );
  assert(recs.length > 0);
  for (const r of recs) {
    assert(r.parts.GPU.name !== "Maker Long Card", "a card that doesn't fit was offered");
    assertEquals(compatibility(r.parts).valid, true);
    assert(r.price <= 100000);
  }
});

Deno.test("ENGINE: a label never goes to a build over the budget", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
    product("Gigabyte GeForce RTX 4070 Super Windforce 12GB", { price: 58000 }),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 70000 });
  assertEquals(recs.length, 1);
  assertEquals(recs[0].parts.GPU.name, "ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge");
  // The dearer card was out of reach, so the build had nothing to be compared with.
  assertEquals(recs[0].tradeoffLabel, "Insufficient information");
});

Deno.test("ENGINE: a build a cheaper one verifiably beats isn't offered", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 58000 }),
    product("Gigabyte GeForce RTX 4070 Super Windforce 12GB", { price: 28000 }),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 150000 });
  assertEquals(
    recs.map((r: any) => [r.parts.GPU.name, r.tradeoffLabel]),
    [["Gigabyte GeForce RTX 4070 Super Windforce 12GB", "Highest Verified Performance"]],
  );
});

Deno.test("ENGINE: parts with checked figures aren't crowded out of a large catalogue", () => {
  const filler = Array.from({ length: 30 }, (_, i) =>
    product(`Maker ${i} Card`, {
      category: "Video Cards",
      price: 20000 + i * 1000,
      specs: { watts: "115", gpu_length_mm: "250", pcie_connectors: "8-pin" },
    }),
  );
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    ...filler,
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28500 }),
    product("Gigabyte GeForce RTX 4070 Super Windforce 12GB", { price: 33500 }),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 150000 });
  const label = (name: string) =>
    recs.find((r: any) => r.parts.GPU?.name.includes(name))?.tradeoffLabel;
  assertEquals(label("RTX 4060"), "Best Value");
  assertEquals(label("RTX 4070"), "Highest Verified Performance");
  // Unchecked cards still get a place.
  assert(recs.some((r: any) => r.tradeoffLabel === "Insufficient information"));
});

Deno.test("ENGINE: checked parts don't squeeze every unchecked part out of the search", () => {
  const card = (name: string, price: number) =>
    product(name, {
      category: "Video Cards",
      price,
      specs: { watts: "115", gpu_length_mm: "250", pcie_connectors: "8-pin" },
    });
  const checked = [20000, 30000, 40000, 50000, 60000];
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    ...checked.map((price) => card(`Checked ${price} Card`, price)),
    card("Unchecked Card", 15000),
  ]);
  checked.forEach((price, i) =>
    addFigures(
      catalog,
      "GPU",
      `Checked ${price} Card`,
      ada(3000 + i * 1000, 2400 + i * 50, 8 + i * 4, 128),
    ),
  );
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 150000 });
  const unchecked = recs.find((r: any) => r.parts.GPU.name === "Unchecked Card");
  assertEquals(unchecked?.tradeoffLabel, "Insufficient information");
  assert(recs.some((r: any) => r.tradeoffLabel === "Highest Verified Performance"));
});

Deno.test("ENGINE: an otherwise equal build needing review gives way to a confirmed one", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    // Nothing states its socket, so a build using it can only be offered for review.
    product("Vendor Plain Motherboard", { category: "Motherboards", price: 4000 }),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
  ]);
  const [only] = generateDynamicCatalogRecommendations(
    catalog,
    GAMING,
    { min: 30000, max: 150000 },
    {
      allowUnverified: true,
    },
  );
  assertEquals(only.requiresReview, false);
  assertEquals(only.parts.Motherboard.name, "ASUS Prime B550M-A WiFi II Motherboard");
});

Deno.test("ENGINE: gaming builds with no graphics card earn no label, but everyday ones can", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 7600", { price: 18000 }),
    product("AMD Ryzen 9 7900", {
      category: "Processors",
      price: 35000,
      specs: {
        socket: "AM5",
        ram_generation: "DDR5",
        watts: "65",
        integrated_graphics: "yes",
        includes_cooler: "yes",
      },
    }),
    product("MSI PRO B650M-P Micro-ATX Motherboard", { price: 10000 }),
    product("Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36", { price: 9000 }),
    product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
    product("Deepcool PK650D 650W 80 Plus Bronze Power Supply", { price: 4500 }),
    product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
  ]);
  addFigures(catalog, "CPU", "AMD Ryzen 9 7900", cpuFigures("Zen 4", 12, 24, 5400, 64));
  const band = { min: 30000, max: 150000 };
  const gaming = generateDynamicCatalogRecommendations(catalog, GAMING, band);
  assert(gaming.length > 0);
  for (const r of gaming) assertEquals(r.tradeoffLabel, "Insufficient information");
  const everyday = generateDynamicCatalogRecommendations(
    catalog,
    { ...GAMING, purpose: "general" },
    band,
  );
  assertEquals(
    everyday.map((r: any) => r.tradeoffLabel),
    ["Best Value", "Highest Verified Performance"],
  );
});

Deno.test("ENGINE: the canonical API reports the same evidence as a style", () => {
  const canonical = buildBuilderCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
    product("Gigabyte GeForce RTX 4070 Super Windforce 12GB", { price: 58000 }),
  ]);
  const answers: any = { purpose: "gaming", budgetInr: 130000, ownedParts: [] };
  const candidates = generateRecommendations(answers, canonical);
  assertEquals(
    candidates.map((c: any) => c.style),
    ["best-fit", "upgrade-friendly"],
  );
  assertEquals((candidates[0] as any).matchScore, undefined);
  const lower = generateRecommendations({ ...answers, budgetInr: 60000 }, canonical);
  assertEquals(
    lower.map((c: any) => c.style),
    ["not-ranked"],
  );
});

Deno.test("ENGINE: Wi-Fi asked for survives the choice between otherwise equal builds", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    product("Maker B550 AM4 DDR4 Plain Motherboard", {
      category: "Motherboards",
      price: 6000,
      specs: {
        socket: "AM4",
        ram_generation: "DDR4",
        form_factor: "Micro-ATX",
        ram_slots: "4",
        max_ram_gb: "128",
        m2_slots: "2",
        sata_ports: "4",
      },
    }),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
  ]);
  const wanted = generateDynamicCatalogRecommendations(
    catalog,
    { ...GAMING, wifi: "Yes" },
    { min: 30000, max: 150000 },
  );
  assertEquals(wanted[0].parts.Motherboard.name, "ASUS Prime B550M-A WiFi II Motherboard");
  const notWanted = generateDynamicCatalogRecommendations(catalog, GAMING, {
    min: 30000,
    max: 150000,
  });
  assertEquals(notWanted[0].parts.Motherboard.name, "Maker B550 AM4 DDR4 Plain Motherboard");
});

Deno.test("ENGINE: the closest build above budget carries no ranking label", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    ...am4Parts(),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
  ]);
  const info = getBudgetShortfallInfo(catalog, GAMING, { min: 20000, max: 40000 });
  assertEquals(info?.closestBuild.tradeoff, "Closest available build");
  assertEquals(info?.closestBuild.score, undefined);
  assertEquals(info?.closestBuild.workloadScore, undefined);
});

// ── The page ─────────────────────────────────────────────────────────────────

const engine = await Deno.readTextFile(
  new URL("../../../src/lib/builder/recommendations.ts", import.meta.url),
);
const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));

Deno.test("PAGE: no invented score remains in the engine", () => {
  for (const banned of [
    "HARDWARE_BENCHMARK_REGISTRY",
    "getComponentBenchmarkScores",
    "getPurposeWeights",
    "compositeScore",
    "gpuRaster",
    "sWorkload",
    "Best Performance",
    "Balanced Choice",
  ]) {
    assert(!engine.includes(banned), banned);
  }
});

Deno.test("PAGE: every recommended build shows its reason and what the label rests on", () => {
  assert(page.includes("{RANKING_BASIS}"));
  assert(page.includes("<RankingEvidence build={build} compact />"));
  assert(page.includes("<RankingEvidence build={initial} />"));
});

Deno.test("PAGE: a label doesn't stay on a build the customer has changed", () => {
  assert(page.includes("{initial.tradeoff && !changed && <Badge>"));
  assert(page.includes("{!changed && <RankingEvidence build={initial} />}"));
});

Deno.test("PAGE: partly confirmed specifications aren't called high confidence", () => {
  assert(!page.includes("High Confidence"));
  assert(!engine.includes("High Confidence"));
  assert(page.includes("Some Specs"));
});
