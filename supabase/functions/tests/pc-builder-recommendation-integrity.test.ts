// supabase/functions/tests/pc-builder-recommendation-integrity.test.ts
// What a customer says changes what they're offered, and a label needs its compatibility confirmed.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { generateDynamicCatalogRecommendations, getBudgetShortfallInfo } =
  await import("../../../src/lib/builder/recommendations.ts");
const { matchShopifyProductToComponent, syncBuilderCatalogWithShopify } =
  await import("../../../src/lib/builder/catalog.ts");
const { assessFit, prefersForPriority, purposeProfile } =
  await import("../../../src/lib/builder/purpose.ts");
const { compatibility, inferredCriticalSpecs, labelCompatibilityGaps } =
  await import("../../../src/lib/builder/compatibility.ts");
const { rankBuilds } = await import("../../../src/lib/builder/ranking.ts");

let nextId = 7000;
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
const match = (item: any): any => matchShopifyProductToComponent(item);
const answers = (purpose: string, details: Record<string, string> = {}, extra = {}) => ({
  purpose,
  details,
  budgetId: "x",
  brands: [],
  wifi: "",
  owned: [],
  ...extra,
});

const WIDE = { min: 30000, max: 300000 };
const REVIEWED = {
  spec_source: "manufacturer_datasheet",
  spec_review_status: "reviewed",
  spec_source_url: "https://www.example.com/datasheet",
  spec_reviewed_on: "2026-11-01",
};

const CPU_5600 = () => product("AMD Ryzen 5 5600", { price: 9000 });
// ZOTAC's page can't be read, so the card's length and connector need IT HUB's review to support a label.
const REVIEWED_4060 = {
  gpu_length_mm: "222",
  pcie_connectors: "1x 8-pin",
  ...REVIEWED,
};
const CARD_4060 = () =>
  product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000, specs: REVIEWED_4060 });
const CARD_4070S = () =>
  product("Gigabyte GeForce RTX 4070 Super Windforce 12GB", { price: 58000 });
const am4Parts = () => [
  product("ASUS Prime B550M-A WiFi II Motherboard", { price: 9000 }),
  product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
  product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
  product("Corsair RM750e 750W 80 Plus Gold Fully Modular PSU", { price: 4500 }),
  product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
];

// Parts with stated specifications but no checked performance figures.
const statedCpu = (name: string, price: number) =>
  product(name, {
    category: "Computer Processors",
    price,
    specs: {
      socket: "AM4",
      ram_generation: "DDR4",
      watts: "65",
      integrated_graphics: "no",
      includes_cooler: "yes",
      ...REVIEWED,
    },
  });
const statedGpu = (name: string, price: number) =>
  product(name, {
    category: "Video Cards",
    price,
    specs: {
      watts: "115",
      gpu_length_mm: "250",
      pcie_connectors: "8-pin",
      recommended_psu_watts: "550",
      ...REVIEWED,
    },
  });
const statedRam = (name: string, price: number, gb: string) =>
  product(name, {
    category: "RAM",
    price,
    specs: {
      ram_generation: "DDR4",
      ram_capacity_gb: gb,
      ram_modules: "2",
      ram_module_type: "DIMM",
      ...REVIEWED,
    },
  });

/** A budget too small for the dearest processor and dearest card together. */
const TIGHT_CATALOGUE = () => [
  ...am4Parts(),
  statedCpu("Budget Processor", 8000),
  statedCpu("Premium Processor", 40000),
  statedGpu("Budget Card", 15000),
  statedGpu("Premium Card", 55000),
];
const TIGHT = { min: 30000, max: 95000 };
const creationCatalogue = () => [
  CPU_5600(),
  ...am4Parts().filter((p) => !p.name.includes("Vengeance")),
  statedRam("Kit 16GB DDR4", 3000, "16"),
  statedRam("Kit 32GB DDR4", 7000, "32"),
  statedRam("Kit 64GB DDR4", 14000, "64"),
  CARD_4060(),
];
const shown = (recs: any[], slot: string) => recs.map((r) => r.parts[slot]?.name);
const allNotes = (recs: any[]) => recs.flatMap((r) => r.purposeNotes);

// ── Purpose profiles ─────────────────────────────────────────────────────────

Deno.test("PURPOSE: gaming answers set which part the build leans on", () => {
  assertEquals(purposeProfile("gaming", { type: "AAA Games" }).priority, "GPU");
  assertEquals(purposeProfile("gaming", { type: "Competitive / Esports" }).priority, "CPU");
  assertEquals(purposeProfile("gaming", { resolution: "4K" }).priority, "GPU");
  assertEquals(purposeProfile("gaming", { resolution: "1440p" }).priority, "GPU");
  // A chosen resolution outranks the type of game.
  assertEquals(
    purposeProfile("gaming", { type: "Competitive / Esports", resolution: "4K" }).priority,
    "GPU",
  );
  assertEquals(
    purposeProfile("gaming", { type: "Competitive / Esports", resolution: "1080p" }).priority,
    "CPU",
  );
});

Deno.test("PURPOSE: 3D work leans on the graphics card, and other creation work sets no lean", () => {
  const blender = purposeProfile("creation", { type: "3D" });
  assertEquals(blender.priority, "GPU");
  assertEquals(blender.priorityAsked, "3D work");
  assertEquals(purposeProfile("creation", { type: "Video" }).priority, undefined);
});

Deno.test("PURPOSE: published figures outrank price when choosing for a priority", () => {
  const card = (id: string, price: number, shaderUnits: number, clock: number, vram: number) => ({
    id,
    name: id,
    price,
    verificationStatus: "manufacturer_verified",
    performance: {
      architecture: "Ada Lovelace",
      figures: { shaderUnits, boostClockMhz: clock, vramGb: vram, memoryBusBits: 128 + vram * 8 },
      sourceUrl: "https://www.nvidia.com/x",
      checkedOn: "2026-11-03",
    },
  });
  const cheapStrong: any = { price: 50000, parts: { GPU: card("Strong", 20000, 7000, 2500, 12) } };
  const dearWeak: any = { price: 70000, parts: { GPU: card("Weak", 40000, 3000, 2400, 8) } };
  assertEquals(prefersForPriority(cheapStrong, dearWeak, "GPU"), true);
  assertEquals(prefersForPriority(dearWeak, cheapStrong, "GPU"), false);
});

Deno.test("PURPOSE: no answer, or an unsure one, sets no preference", () => {
  for (const details of [
    {},
    { type: "Both" },
    { resolution: "Not sure" },
    { resolution: "1080p" },
  ]) {
    assertEquals(purposeProfile("gaming", details as any).priority, undefined);
  }
  assertEquals(purposeProfile("gaming", { resolution: "Not sure" }).requestedResolution, undefined);
});

Deno.test("PURPOSE: each kind of work uses the publisher's own figures, with a source", () => {
  const expected: [string, string, string, number][] = [
    ["creation", "Video", "Adobe Premiere", 16],
    ["creation", "Motion Graphics", "Adobe After Effects", 32],
    ["creation", "3D", "Blender", 32],
    ["creation", "Photography", "Adobe Photoshop", 16],
    ["professional", "CAD", "AutoCAD", 32],
    ["professional", "Architecture", "AutoCAD", 32],
    ["professional", "Engineering", "AutoCAD", 32],
    ["professional", "Software Development", "Visual Studio", 16],
    ["work", "Programming", "Visual Studio", 16],
  ];
  for (const [purpose, type, software, memoryGb] of expected) {
    const requirement = purposeProfile(purpose, { type }).requirement!;
    assertEquals(requirement.software, software, type);
    assertEquals(requirement.memoryGb, memoryGb, type);
    assert(
      /^https:\/\/[^/]*(adobe|blender|autodesk|microsoft)\.[a-z]+\//.test(requirement.sourceUrl),
      requirement.sourceUrl,
    );
  }
});

Deno.test("PURPOSE: kinds of work with no single published figure get no invented one", () => {
  for (const [purpose, type] of [
    ["creation", "Streaming"],
    ["creation", "Mixed"],
    ["professional", "Data / AI"],
    ["work", "Office"],
    ["general", "Browsing"],
    ["gaming", "AAA Games"],
  ]) {
    assertEquals(purposeProfile(purpose, { type }).requirement, undefined, type);
  }
});

Deno.test("PURPOSE: software development doesn't demand a graphics card, but CAD does", () => {
  assertEquals(
    purposeProfile("professional", { type: "Software Development" }).requiresDedicatedGpu,
    false,
  );
  assertEquals(purposeProfile("professional", { type: "CAD" }).requiresDedicatedGpu, true);
  assertEquals(purposeProfile("gaming").requiresDedicatedGpu, true);
  assertEquals(purposeProfile("work").requiresDedicatedGpu, false);
});

// ── Fit against a requirement ────────────────────────────────────────────────

const OWNS_NOTHING = new Set<string>();
const fitBuild = (memory?: number, vram?: number, cores?: number, hasCard = true): any => ({
  parts: {
    RAM: { id: "r", name: "RAM", price: 1, capacityGb: memory },
    GPU: hasCard
      ? {
          id: "g",
          name: "GPU",
          price: 1,
          performance: vram ? { figures: { vramGb: vram } } : undefined,
        }
      : undefined,
    CPU: {
      id: "c",
      name: "CPU",
      price: 1,
      performance: cores ? { figures: { totalCores: cores } } : undefined,
    },
  },
});
const statuses = (checks: any[]) => checks.map((check) => check.status);

Deno.test("FIT: a figure meets, falls short, or is unknown, and these stay separate", () => {
  const blender = purposeProfile("creation", { type: "3D" });
  assertEquals(statuses(assessFit(fitBuild(32, 8, 8), blender, OWNS_NOTHING)), [
    "meets",
    "meets",
    "meets",
  ]);
  assertEquals(statuses(assessFit(fitBuild(16, 4, 6), blender, OWNS_NOTHING)), [
    "below",
    "below",
    "below",
  ]);
  assertEquals(statuses(assessFit(fitBuild(), blender, OWNS_NOTHING)), [
    "unknown",
    "unknown",
    "unknown",
  ]);
});

Deno.test("FIT: notes name the publisher and both figures", () => {
  const [memory] = assessFit(
    fitBuild(16),
    purposeProfile("creation", { type: "3D" }),
    OWNS_NOTHING,
  );
  assert(
    memory.note.includes("16") && memory.note.includes("Blender") && memory.note.includes("32"),
  );
});

Deno.test("FIT: no card at all falls short of a graphics memory recommendation", () => {
  const profile = purposeProfile("creation", { type: "3D" });
  const [, graphics] = assessFit(fitBuild(32, undefined, 8, false), profile, OWNS_NOTHING);
  assertEquals(graphics.status, "below");
});

Deno.test("FIT: a part the customer owns is unknown, not a failure", () => {
  const profile = purposeProfile("creation", { type: "3D" });
  const checks = assessFit(
    fitBuild(undefined, undefined, 8, false),
    profile,
    new Set(["RAM", "GPU"]),
  );
  assertEquals(statuses(checks), ["unknown", "unknown", "meets"]);
});

// ── Customer answers change what's offered ───────────────────────────────────

Deno.test("OFFER: AAA and competitive customers are offered different builds", () => {
  // Enough combinations that the neutral spread can't happen to include both picks.
  const catalog = liveCatalog([
    ...am4Parts(),
    statedCpu("Budget Processor", 8000),
    statedCpu("Middle Processor", 15000),
    statedCpu("Premium Processor", 40000),
    statedGpu("Budget Card", 15000),
    statedGpu("Middle Card", 25000),
    statedGpu("Premium Card", 55000),
  ]);
  const band = { min: 30000, max: 150000 };
  const pair = (recs: any[]) => recs.map((r: any) => `${r.parts.CPU.name} + ${r.parts.GPU.name}`);
  const aaa = pair(
    generateDynamicCatalogRecommendations(catalog, answers("gaming", { type: "AAA Games" }), band),
  );
  const competitive = pair(
    generateDynamicCatalogRecommendations(
      catalog,
      answers("gaming", { type: "Competitive / Esports" }),
      band,
    ),
  );
  const neutral = pair(generateDynamicCatalogRecommendations(catalog, answers("gaming"), band));
  assert(aaa.includes("Budget Processor + Premium Card"), aaa.join());
  assert(!competitive.includes("Budget Processor + Premium Card"), competitive.join());
  assert(competitive.includes("Premium Processor + Budget Card"), competitive.join());
  assert(!aaa.includes("Premium Processor + Budget Card"), aaa.join());
  assert(!neutral.includes("Budget Processor + Premium Card"), neutral.join());
  // Without an answer, nothing leans either way.
  assert(neutral.join() !== aaa.join());
});

Deno.test("OFFER: no priority note when every build has the same part", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog(creationCatalogue()),
    answers("creation", { type: "3D" }),
    WIDE,
  );
  assert(recs.length > 1);
  assertEquals(
    allNotes(recs).filter((n: string) => n.includes("leans on")),
    [],
  );
});

Deno.test("OFFER: a priority picked on price says it's only price", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog(TIGHT_CATALOGUE()),
    answers("gaming", { type: "AAA Games" }),
    TIGHT,
  );
  const note = allNotes(recs).find((n: string) => n.includes("You asked for AAA games"));
  assert(note, "no priority note");
  assert(note.includes("That's price, not measured performance."));
  // Price never turns into a label.
  assert(recs.every((r: any) => r.tradeoffLabel === "Insufficient information"));
});

Deno.test("OFFER: a priority picked on published figures says so", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([CPU_5600(), ...am4Parts(), CARD_4060(), CARD_4070S()]),
    answers("gaming", { type: "AAA Games" }),
    WIDE,
  );
  const note = allNotes(recs).find((n: string) => n.includes("You asked for AAA games"));
  assert(note?.includes("higher published figures"), note);
});

Deno.test("OFFER: no answer gives the same neutral spread as before", () => {
  const catalog = liveCatalog(TIGHT_CATALOGUE());
  const silent = generateDynamicCatalogRecommendations(catalog, answers("gaming"), TIGHT);
  const both = generateDynamicCatalogRecommendations(
    catalog,
    answers("gaming", { type: "Both" }),
    TIGHT,
  );
  assertEquals(shown(silent, "GPU"), shown(both, "GPU"));
  assertEquals(shown(silent, "CPU"), shown(both, "CPU"));
  assert(!allNotes(silent).some((n: string) => n.includes("You asked for")));
});

Deno.test("OFFER: a requested resolution is noted, never promised", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog(TIGHT_CATALOGUE()),
    answers("gaming", { resolution: "4K" }),
    TIGHT,
  );
  for (const r of recs) {
    assert(!r.designedFor.includes("4K"), r.designedFor);
    assert(r.purposeNotes.some((n: string) => n.includes("You asked for 4K")));
    assert(r.purposeNotes.some((n: string) => n.includes("Frame rates aren't measured")));
  }
});

Deno.test("OFFER: nothing estimates a frame rate or a performance percentage", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog(TIGHT_CATALOGUE()),
    answers("gaming", { type: "AAA Games", resolution: "4K" }),
    TIGHT,
  );
  const words = JSON.stringify(
    recs.map((r: any) => [r.purposeNotes, r.rankingReasons, r.highlights]),
  );
  assert(!/\d+\s*fps|\d+\s*%|percent/i.test(words), words);
});

Deno.test("OFFER: a kit meeting the recommendation is tried, even where the price spread misses it", () => {
  const sizes = [16, 32, 16, 16, 16, 16, 16];
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      ...am4Parts().filter((p) => !p.name.includes("Vengeance")),
      ...sizes.map((size, i) => statedRam(`Kit ${i} ${size}GB DDR4`, 3000 + i * 500, String(size))),
      CARD_4060(),
    ]),
    answers("creation", { type: "3D" }),
    WIDE,
  );
  assert(shown(recs, "RAM").includes("Kit 1 32GB DDR4"), shown(recs, "RAM").join());
});

Deno.test("OFFER: 3D work gets memory meeting Blender's recommendation first", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog(creationCatalogue()),
    answers("creation", { type: "3D" }),
    WIDE,
  );
  const below = recs.filter((r: any) => r.parts.RAM.name === "Kit 16GB DDR4");
  const meeting = recs.filter((r: any) => r.parts.RAM.name !== "Kit 16GB DDR4");
  assert(meeting.length > 0);
  // A 16GB build can still be shown, and it says plainly that it falls short.
  for (const r of below) {
    assert(r.purposeNotes.some((n: string) => n.includes("below Blender's recommended 32")));
  }
  for (const r of meeting) {
    assert(r.purposeNotes.some((n: string) => n.includes("meeting Blender's recommended 32")));
  }
});

Deno.test("OFFER: a 64GB kit isn't merged with a 16GB one as a near-duplicate", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog(creationCatalogue()),
    answers("creation", { type: "3D" }),
    WIDE,
  );
  assert(shown(recs, "RAM").includes("Kit 64GB DDR4"), shown(recs, "RAM").join());
});

Deno.test("OFFER: photography asks for less memory than 3D, so the cheaper kit qualifies", () => {
  const catalog = liveCatalog(creationCatalogue());
  const photo = generateDynamicCatalogRecommendations(
    catalog,
    answers("creation", { type: "Photography" }),
    WIDE,
  );
  assert(
    photo.some(
      (r: any) =>
        r.parts.RAM.name === "Kit 16GB DDR4" &&
        r.purposeNotes.some((n: string) => n.includes("meeting Adobe Photoshop's recommended 16")),
    ),
  );
});

Deno.test("OFFER: when nothing meets the recommendation, builds are offered and say so", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([CPU_5600(), ...am4Parts(), CARD_4060()]),
    answers("creation", { type: "3D" }),
    WIDE,
  );
  assertEquals(recs.length, 1);
  assert(recs[0].purposeNotes.some((n: string) => n.includes("below Blender's recommended 32")));
});

Deno.test("OFFER: labels go only to builds meeting the request, when some do", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      ...am4Parts().filter((p) => !p.name.includes("Vengeance")),
      product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
      statedRam("Kit 16GB Extra DDR4", 3200, "16"),
      product("Kit 32GB Stated DDR4", {
        category: "RAM",
        price: 7000,
        specs: { ram_generation: "DDR4", ram_capacity_gb: "32", ram_modules: "2" },
      }),
      CARD_4060(),
      CARD_4070S(),
    ]),
    answers("creation", { type: "Video" }),
    WIDE,
  );
  assert(recs.some((r: any) => r.tradeoffLabel === "Best Value"));
  for (const r of recs.filter((x: any) => x.tradeoffLabel !== "Insufficient information")) {
    assert(
      !r.purposeNotes.some((n: string) => n.includes("below")),
      JSON.stringify(r.purposeNotes),
    );
  }
});

Deno.test("OFFER: a build falling short can't take a label from builds that meet the request", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      ...am4Parts().filter((p) => !p.name.includes("Vengeance")),
      statedRam("Kit 16GB DDR4", 3000, "16"),
      statedRam("Kit 32GB DDR4", 7000, "32"),
      CARD_4060(),
      CARD_4070S(),
    ]),
    answers("professional", { type: "CAD" }),
    WIDE,
  );
  const labelled = recs.filter((r: any) => r.tradeoffLabel !== "Insufficient information");
  assert(labelled.some((r: any) => r.tradeoffLabel === "Best Value"));
  for (const r of labelled) assertEquals(r.parts.RAM.name, "Kit 32GB DDR4");
});

// ── Which specifications a label needs ───────────────────────────────────────

Deno.test("INFER: each value read from a title or tag is marked, field by field", () => {
  const board = match(product("B550M DDR4 Micro-ATX Motherboard", { category: "Motherboards" }));
  assertEquals(inferredCriticalSpecs("Motherboard", board.specs).sort(), [
    "form factor",
    "memory generation",
    "socket",
  ]);
  const psu = match(product("Vendor 650W Power Supply", { category: "Computer Power Supplies" }));
  assertEquals(inferredCriticalSpecs("PSU", psu.specs), ["wattage"]);
  const ssd = match(product("Vendor 1TB NVMe SSD", { category: "Solid State Drives" }));
  assertEquals(inferredCriticalSpecs("Storage", ssd.specs), ["interface"]);
  const card = match(product("Vendor RTX 4060 Card", { category: "Video Cards" }));
  assertEquals(inferredCriticalSpecs("GPU", card.specs), [
    "power draw",
    "recommended power supply",
  ]);
  // A tag no longer fills a specification at all.
  const tagged = match(
    product("Vendor Board", { category: "Motherboards", tags: ["am4", "ddr4"] }),
  );
  assertEquals(inferredCriticalSpecs("Motherboard", tagged.specs), []);
  assertEquals(tagged.specs.socket, undefined);
});

Deno.test("INFER: a value stated in a Shopify field isn't marked as inferred", () => {
  const board = match(
    product("Vendor Board", {
      category: "Motherboards",
      specs: { socket: "AM4", ram_generation: "DDR4", form_factor: "ATX" },
    }),
  );
  assertEquals(inferredCriticalSpecs("Motherboard", board.specs), []);
  assertEquals(board.specs.provenance, "supplier_spec");
});

Deno.test("INFER: one stated field doesn't vouch for a value read from the title", () => {
  const board = match(
    product("B550M DDR4 Motherboard", { category: "Motherboards", specs: { form_factor: "ATX" } }),
  );
  assertEquals(board.specs.provenance, "supplier_spec");
  assertEquals(inferredCriticalSpecs("Motherboard", board.specs).sort(), [
    "memory generation",
    "socket",
  ]);
});

Deno.test("INFER: a registry entry isn't marked, because its values were looked up", () => {
  const board = match(product("ASUS Prime B550M-A WiFi II Motherboard"));
  assertEquals(board.specs.inferredFromTitle, undefined);
});

Deno.test("GATE: a mismatch rules a build out, whatever else is confirmed", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([product("AMD Ryzen 5 7600", { price: 18000 }), ...am4Parts(), CARD_4060()]),
    answers("gaming"),
    WIDE,
    { allowUnverified: true },
  );
  assertEquals(recs.length, 0);
});

Deno.test("GATE: a board read from its title goes to review, and earns no label", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      product("B550M DDR4 Micro-ATX Motherboard", { category: "Motherboards", price: 8000 }),
      ...am4Parts().filter((p) => !p.name.includes("ASUS")),
      CARD_4060(),
      CARD_4070S(),
    ]),
    answers("gaming"),
    WIDE,
    { allowUnverified: true },
  );
  assertEquals(recs.length, 2);
  for (const r of recs) {
    // Not called incompatible, but a title isn't enough to confirm a build.
    assertEquals(r.requiresReview, true);
    assert(r.reviewItems.some((w: string) => w.includes("specifications not yet reviewed")));
    assertEquals(compatibility(r.parts).valid, true);
    assertEquals(r.tradeoffLabel, "Insufficient information");
    assert(r.rankingReasons.some((w: string) => w.includes("Read from the product title")));
    assert(r.rankingReasons.some((w: string) => w.includes("socket of B550M DDR4")));
  }
});

Deno.test("GATE: a graphics clearance that isn't stated stops a label, and sends the build to review", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      ...am4Parts().filter((p) => !p.name.includes("CC560")),
      product("Maker Silent Cabinet", {
        category: "Computer Cases",
        price: 3000,
        specs: {
          supported_motherboards: "ATX,Micro-ATX",
          max_cooler_height_mm: "160",
          ...REVIEWED,
        },
      }),
      CARD_4060(),
      CARD_4070S(),
    ]),
    answers("gaming"),
    WIDE,
    { allowUnverified: true },
  );
  assertEquals(recs.length, 2);
  for (const r of recs) {
    assertEquals(r.requiresReview, true);
    assert(r.reviewItems.includes("Chassis GPU clearance unverified"));
    assertEquals(r.tradeoffLabel, "Insufficient information");
    assert(r.rankingReasons.some((w: string) => w.startsWith("Not yet confirmed:")));
  }
});

const statedBoard = (extra: Record<string, string> = {}) =>
  product("Maker Stated Board", {
    category: "Motherboards",
    price: 8000,
    specs: {
      socket: "AM4",
      ram_generation: "DDR4",
      form_factor: "ATX",
      ram_slots: "4",
      max_ram_gb: "128",
      m2_slots: "2",
      sata_ports: "4",
      ...extra,
    },
  });

Deno.test("GATE: an unreviewed Shopify field can't support a label", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      statedBoard(),
      ...am4Parts().filter((p) => !p.name.includes("ASUS")),
      CARD_4060(),
      CARD_4070S(),
    ]),
    answers("gaming"),
    WIDE,
    { allowUnverified: true },
  );
  assert(recs.length > 0);
  for (const r of recs) {
    assertEquals(r.requiresReview, true);
    assertEquals(r.tradeoffLabel, "Insufficient information");
    assert(r.rankingReasons.some((w: string) => w.startsWith("Stated but not reviewed")));
  }
});

Deno.test("GATE: a reviewed Shopify field can support a label, with figures from the registry", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      statedBoard(REVIEWED),
      ...am4Parts().filter((p) => !p.name.includes("ASUS")),
      CARD_4060(),
      CARD_4070S(),
    ]),
    answers("gaming"),
    WIDE,
  );
  assertEquals(
    recs.map((r: any) => r.tradeoffLabel),
    ["Best Value", "Highest Verified Performance"],
  );
});

Deno.test("GATE: stated cooler, display and storage unknowns each block a label by themselves", () => {
  const parts: any = { Monitor: { slot: "Monitor", title: "x", specs: {} } };
  assertEquals(labelCompatibilityGaps(parts, [{ status: "match", label: "ok" }]), []);
  assertEquals(labelCompatibilityGaps(parts, [{ status: "conditional", label: "note" }]), []);
  assertEquals(labelCompatibilityGaps(parts, [{ status: "unknown", label: "Height" }]), [
    "Not yet confirmed: Height.",
  ]);
});

Deno.test("GATE: a cheap part read from its title stays, and stops the label", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      ...am4Parts(),
      product("Vendor Cheap 1TB NVMe SSD", { category: "Solid State Drives", price: 1000 }),
      CARD_4060(),
      CARD_4070S(),
    ]),
    answers("gaming"),
    WIDE,
  );
  for (const r of recs) {
    assertEquals(r.parts.Storage.name, "Vendor Cheap 1TB NVMe SSD");
    assertEquals(r.tradeoffLabel, "Insufficient information");
  }
});

// ── Edge cases ───────────────────────────────────────────────────────────────

const plainBoard = (price: number) =>
  product("Maker Plain AM4 Motherboard", {
    category: "Motherboards",
    price,
    specs: {
      socket: "AM4",
      ram_generation: "DDR4",
      form_factor: "ATX",
      ram_slots: "4",
      max_ram_gb: "128",
      m2_slots: "2",
      sata_ports: "4",
      ...REVIEWED,
    },
  });

Deno.test("EDGE: a Wi-Fi board over budget doesn't hide the build that fits", () => {
  const catalog = liveCatalog([
    CPU_5600(),
    ...am4Parts().filter((p) => !p.name.includes("ASUS")),
    product("ASUS Prime B550M-A WiFi II Motherboard", { price: 40000 }),
    plainBoard(6000),
    CARD_4060(),
  ]);
  const band = { min: 30000, max: 70000 };
  const wifi = answers("gaming", {}, { wifi: "Yes" });
  const recs = generateDynamicCatalogRecommendations(catalog, wifi, band);
  assertEquals(recs.length, 1);
  assertEquals(recs[0].parts.Motherboard.name, "Maker Plain AM4 Motherboard");
  assert(recs[0].price <= 70000);
  // It's never passed off as having what was asked for.
  assert(recs[0].purposeNotes.some((n: string) => n.includes("Wi-Fi")));
  assert(!recs[0].purposeNotes.some((n: string) => n.includes("Has the Wi-Fi")));
  assertEquals(getBudgetShortfallInfo(catalog, wifi, band), null);
});

Deno.test("EDGE: a registry board with no Wi-Fi says so, and an unstated one says unconfirmed", () => {
  const registry = generateDynamicCatalogRecommendations(
    liveCatalog([
      product("AMD Ryzen 5 7600", { price: 18000 }),
      product("MSI PRO B650M-P Micro-ATX Motherboard", { price: 10000 }),
      product("Corsair Vengeance 16GB (1x16GB) DDR5 5200MHz", { price: 4000 }),
      ...am4Parts().filter((p) => /Crucial|Deepcool|RM750e/.test(p.name)),
      CARD_4060(),
    ]),
    answers("gaming", {}, { wifi: "Yes" }),
    WIDE,
  );
  assert(registry[0].purposeNotes.some((n: string) => n.includes("has no Wi-Fi")));
  const stated = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      plainBoard(6000),
      ...am4Parts().filter((p) => !p.name.includes("ASUS")),
      CARD_4060(),
    ]),
    answers("gaming", {}, { wifi: "Yes" }),
    WIDE,
  );
  assert(stated[0].purposeNotes.some((n: string) => n.includes("isn't confirmed")));
});

Deno.test("EDGE: a Wi-Fi board that fits the budget is preferred when asked for", () => {
  const catalog = liveCatalog([CPU_5600(), plainBoard(6000), ...am4Parts(), CARD_4060()]);
  const recs = generateDynamicCatalogRecommendations(
    catalog,
    answers("gaming", {}, { wifi: "Yes" }),
    WIDE,
  );
  assertEquals(recs[0].parts.Motherboard.name, "ASUS Prime B550M-A WiFi II Motherboard");
  assert(recs[0].purposeNotes.some((n: string) => n.includes("Has the Wi-Fi")));
});

Deno.test("EDGE: owned parts aren't priced, and earn no label because they can't be checked", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([CPU_5600(), ...am4Parts(), product("AMD Ryzen 5 5600X Stated", { price: 12000 })]),
    answers("gaming", {}, { owned: ["GPU"] }),
    WIDE,
    { allowUnverified: true },
  );
  assert(recs.length > 0);
  for (const r of recs) {
    assertEquals(r.parts.GPU, undefined);
    assertEquals(r.tradeoffLabel, "Insufficient information");
    assert(r.rankingReasons.some((w: string) => /your own graphics card/i.test(w)));
  }
});

Deno.test("EDGE: owned memory is skipped against a requirement, not called too small", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([CPU_5600(), ...am4Parts(), CARD_4060()]),
    answers("creation", { type: "3D" }, { owned: ["RAM"] }),
    WIDE,
    { allowUnverified: true },
  );
  assert(recs.length > 0);
  assert(recs[0].purposeNotes.some((n: string) => n.startsWith("Memory isn't confirmed")));
  assert(!recs[0].purposeNotes.some((n: string) => n.includes("below Blender's recommended 32")));
});

Deno.test("EDGE: a single available build is offered and isn't ranked", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([CPU_5600(), ...am4Parts(), CARD_4060()]),
    answers("gaming"),
    WIDE,
  );
  assertEquals(recs.length, 1);
  assertEquals(recs[0].requiresReview, false);
  assertEquals(recs[0].tradeoffLabel, "Insufficient information");
  assert(recs[0].rankingReasons[0].includes("nothing to rank it against"));
});

Deno.test("EDGE: a single build gets no priority note, because nothing was chosen between", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([CPU_5600(), ...am4Parts(), CARD_4060()]),
    answers("gaming", { type: "AAA Games" }),
    WIDE,
  );
  assertEquals(
    allNotes(recs).filter((n: string) => n.includes("leans on")),
    [],
  );
});

Deno.test("EDGE: at most three builds, even with three labels and a priority pick", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      ...am4Parts(),
      CARD_4060(),
      CARD_4070S(),
      statedGpu("Maker Card A", 15000),
      statedGpu("Maker Card B", 20000),
      statedGpu("Maker Card C", 90000),
    ]),
    answers("gaming", { type: "AAA Games" }),
    WIDE,
  );
  assert(recs.length <= 3, String(recs.length));
});

Deno.test("EDGE: three labels leave no fourth place for a priority pick", () => {
  const catalog = liveCatalog([
    ...am4Parts(),
    statedCpu("Zen 4 Low", 10000),
    statedCpu("Zen 4 Middle", 20000),
    statedCpu("Zen 4 High", 30000),
    statedGpu("Ada Low", 25000),
    statedGpu("Ada Middle", 45000),
    statedGpu("Ada High", 90000),
  ]);
  const evidence = (option: any, performance: unknown) => {
    option.provenance = "manufacturer_verified";
    option.specs = { ...option.specs, provenance: "manufacturer_verified", performance };
  };
  const zen = (cores: number, clock: number, cache: number) => ({
    architecture: "Zen 4",
    figures: {
      performanceCores: cores,
      totalCores: cores,
      threads: cores * 2,
      maxBoostMhz: clock,
      cacheMb: cache,
    },
    sourceUrl: "https://www.amd.com/x",
    checkedOn: "2026-11-03",
  });
  const ada = (units: number, clock: number, vram: number, bus: number) => ({
    architecture: "Ada Lovelace",
    figures: { shaderUnits: units, boostClockMhz: clock, vramGb: vram, memoryBusBits: bus },
    sourceUrl: "https://www.nvidia.com/x",
    checkedOn: "2026-11-03",
  });
  const named = (slot: string, name: string) => catalog[slot].find((o: any) => o.name === name);
  evidence(named("CPU", "Zen 4 Low"), zen(6, 5100, 32));
  evidence(named("CPU", "Zen 4 Middle"), zen(8, 5300, 32));
  evidence(named("CPU", "Zen 4 High"), zen(12, 5400, 64));
  evidence(named("GPU", "Ada Low"), ada(3072, 2460, 8, 128));
  evidence(named("GPU", "Ada Middle"), ada(7168, 2480, 12, 192));
  evidence(named("GPU", "Ada High"), ada(16384, 2520, 24, 384));
  const recs = generateDynamicCatalogRecommendations(
    catalog,
    answers("gaming", { type: "AAA Games" }),
    WIDE,
  );
  assertEquals(
    recs.map((r: any) => r.tradeoffLabel),
    ["Best Value", "Best Balanced", "Highest Verified Performance"],
  );
  assertEquals(
    recs.map((r: any) => r.parts.CPU.name + " + " + r.parts.GPU.name),
    ["Zen 4 Low + Ada Low", "Zen 4 Middle + Ada Middle", "Zen 4 High + Ada High"],
  );
});

Deno.test("EDGE: if checked parts weren't tried, nothing is called highest", () => {
  // Far more checked cards than the search tries, each an improvement on the last.
  const cards = Array.from({ length: 8 }, (_, i) =>
    statedGpu(`Checked Card ${i}`, 20000 + i * 5000),
  );
  const catalog = liveCatalog([CPU_5600(), ...am4Parts(), ...cards]);
  catalog.GPU.forEach((option: any, i: number) => {
    option.provenance = "manufacturer_verified";
    option.specs = {
      ...option.specs,
      provenance: "manufacturer_verified",
      performance: {
        architecture: "Ada Lovelace",
        figures: {
          shaderUnits: 3000 + i * 1000,
          boostClockMhz: 2400 + i * 10,
          vramGb: 8 + i,
          memoryBusBits: 128 + i * 32,
        },
        sourceUrl: "https://www.nvidia.com/x",
        checkedOn: "2026-11-03",
      },
    };
  });
  // Rotate the prices so the strongest card isn't the dearest, and the spread can skip it.
  const strongest: any = catalog.GPU.find((o: any) => o.name === "Checked Card 7");
  strongest.price = 30000;
  const recs = generateDynamicCatalogRecommendations(catalog, answers("gaming"), WIDE);
  assert(
    !recs.some((r: any) => r.tradeoffLabel === "Highest Verified Performance"),
    JSON.stringify(recs.map((r: any) => [r.parts.GPU.name, r.tradeoffLabel])),
  );
});

Deno.test("EDGE: every part tried means highest is still available in a large catalogue", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      ...am4Parts(),
      CARD_4060(),
      CARD_4070S(),
      ...Array.from({ length: 20 }, (_, i) => statedGpu(`Unchecked ${i}`, 15000 + i * 1000)),
    ]),
    answers("gaming"),
    WIDE,
  );
  assert(recs.some((r: any) => r.tradeoffLabel === "Highest Verified Performance"));
});

Deno.test("EDGE: an untried part names the reason on the leading build", () => {
  const figures = (shaderUnits: number, clock: number, vram: number, bus: number) => ({
    architecture: "Ada Lovelace",
    figures: { shaderUnits, boostClockMhz: clock, vramGb: vram, memoryBusBits: bus },
    sourceUrl: "https://www.nvidia.com/x",
    checkedOn: "2026-11-03",
  });
  const part = (id: string, performance: unknown): any => ({
    id,
    name: id,
    performance,
    verificationStatus: "manufacturer_verified",
  });
  const cpu = part("CPU", {
    architecture: "Zen 4",
    figures: { performanceCores: 6, totalCores: 6, threads: 12, maxBoostMhz: 5100, cacheMb: 32 },
    sourceUrl: "https://www.amd.com/x",
    checkedOn: "2026-11-03",
  });
  const low = part("Low", figures(3000, 2400, 8, 128));
  const high = part("High", figures(7000, 2500, 12, 192));
  const rankings = rankBuilds(
    [
      { price: 70000, requiresReview: false, parts: { CPU: cpu, GPU: low } },
      { price: 90000, requiresReview: false, parts: { CPU: cpu, GPU: high } },
    ],
    { ownedSlots: new Set<string>(), needsDedicatedGpu: true, untriedCheckedParts: 2 },
  );
  assertEquals(rankings[1].label, "Insufficient information");
  assert(rankings[1].reasons[0].includes("2 more parts with confirmed figures weren't tried"));
  assertEquals(rankings[0].label, "Best Value");
});

Deno.test("EDGE: budget optimisation keeps to the budget and to compatibility", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      CPU_5600(),
      ...am4Parts(),
      product("Vendor Tiny PSU 200W", { category: "Computer Power Supplies", price: 500 }),
      CARD_4060(),
      CARD_4070S(),
    ]),
    answers("gaming"),
    { min: 30000, max: 90000 },
    { allowUnverified: true },
  );
  assert(recs.length > 0);
  for (const r of recs) {
    assert(r.price <= 90000);
    assertEquals(compatibility(r.parts).valid, true);
    assert(r.parts.PSU.name !== "Vendor Tiny PSU 200W", "a power supply too small was chosen");
  }
});

// ── The page ─────────────────────────────────────────────────────────────────

const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
const store = await Deno.readTextFile(new URL("../../../src/app/store.tsx", import.meta.url));
const types = await Deno.readTextFile(
  new URL("../../../src/lib/builder/types.ts", import.meta.url),
);

Deno.test("PAGE: Find My PC asks only the purpose and the budget", () => {
  assert(!page.includes("followUps"));
  for (const question of [
    "What kind of gaming?",
    "What resolution do you mainly want?",
    "What type of work?",
    "(optional)",
  ]) {
    assert(!page.includes(question), question);
  }
  assert(page.includes("<Button disabled={!purposeReady}"));
  assert(page.includes("const purposeReady = Boolean(answers.purpose);"));
});

Deno.test("PAGE: the customer's notes appear on the card and the build page", () => {
  assert(page.includes("build.purposeNotes?.map("));
});

Deno.test("CLEANUP: dead scoring and its data are gone", () => {
  for (const banned of [
    "function recommend(",
    "keywordFor",
    "pricedOwned",
    "findPart",
    "isAmd",
    "SLIGHTLY_ABOVE",
    "buildTemplates",
  ]) {
    assert(!page.includes(banned), banned);
  }
  assert(!store.includes("buildTemplates"));
  assert(!types.includes("benchmark_"));
});

Deno.test("CLEANUP: budget bands make no performance claim", () => {
  assert(!page.includes("band.tier"));
  for (const word of ['"Entry Level"', '"High Performance"', '"Enthusiast"', 'tier: "']) {
    assert(!page.includes(word), word);
  }
  assert(!page.includes("Upgrade-friendly motherboard"));
});
