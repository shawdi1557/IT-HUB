// supabase/functions/tests/pc-builder-unknown-products.test.ts
// Products the builder has never heard of: the outcome must follow the Shopify value alone. The model
// names are made up, so no registry entry or title rule can help. Also covers what stops an internal
// field reaching a customer, and what counts as a review.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const {
  clearRegisteredDatabaseSpecs,
  matchShopifyProductToComponent,
  reconcileBuildParts,
  registerDatabaseHardwareSpec,
  syncBuilderCatalogWithShopify,
} = await import("../../../src/lib/builder/catalog.ts");
const { checkCompatibility, specConfidence, hasRejectedSpecs, missingCriticalSpecs } =
  await import("../../../src/lib/builder/compatibility.ts");
const { generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");
const {
  customerVisibleSpecs,
  searchableSpecs,
  keysChangedSinceReview,
  PC_BUILDER_METAFIELDS,
  readSpecReview,
  readStatedSpecs,
} = await import("../../../src/lib/builder/spec-schema.ts");
const { buildSpecReport, formatSpecReport } =
  await import("../../../src/lib/builder/spec-report.ts");
const { purposeProfile } = await import("../../../src/lib/builder/purpose.ts");
const { mapShopifyProductToCatalog, specUpdatedTimes } =
  await import("../../../src/lib/shopify-schema.ts");
const { PRODUCTS_QUERY, diffCatalogProducts } = await import("../../../src/lib/shopify.ts");

const REVIEWED = {
  spec_source: "manufacturer_datasheet",
  spec_review_status: "reviewed",
  spec_source_url: "https://www.example.com/datasheet",
  spec_reviewed_on: "2026-11-01",
};

let nextId = 1;
const product = (name: string, category: string, specs: any = {}, extra: any = {}): any => {
  const id = nextId++;
  return {
    id: `gid://shopify/Product/${id}`,
    name,
    handle: `made-up-${id}`,
    price: 5000,
    tags: [],
    variantId: `gid://shopify/ProductVariant/${id}`,
    availableForSale: true,
    stock: 5,
    specs,
    category,
    ...extra,
  };
};
const match = (item: any): any => matchShopifyProductToComponent(item);

const cpu = (specs: any) =>
  match(product("QZX Validation Processor 77", "Computer Processors", specs));
const board = (specs: any) => match(product("QZX Validation Board 12", "Motherboards", specs));
const kit = (specs: any) => match(product("QZX Validation Memory Kit", "RAM", specs));
const card = (specs: any) => match(product("QZX Validation Card 8", "Video Cards", specs));
const cabinet = (specs: any) => match(product("QZX Validation Enclosure", "Computer Cases", specs));
const cooler = (specs: any) => match(product("QZX Validation Tower", "CPU Coolers", specs));

const ruleOf = (parts: any, prefix: string) =>
  checkCompatibility(parts)
    .items.filter((item: any) => item.ruleId.startsWith(prefix))
    .map((item: any) => item.ruleId);

const FULL_CATALOGUE = (over: Record<string, any> = {}) => [
  product("QZX Validation Processor 77", "Computer Processors", {
    socket: "AM4",
    watts: "65",
    cpu_max_power_watts: "76",
    integrated_graphics: "false",
    includes_cooler: "true",
    supported_ram_generations: '["DDR4"]',
    ...REVIEWED,
    ...over.cpu,
  }),
  product("QZX Validation Board 12", "Motherboards", {
    socket: "AM4",
    ram_generation: "DDR4",
    form_factor: "Micro-ATX",
    ram_slots: "2",
    max_ram_gb: "64",
    m2_slots: "1",
    sata_ports: "4",
    ...REVIEWED,
    ...over.board,
  }),
  product("QZX Validation Memory Kit", "RAM", {
    ram_generation: "DDR4",
    ram_capacity_gb: "16",
    ram_modules: "2",
    ram_module_type: "DIMM",
    ...REVIEWED,
    ...over.ram,
  }),
  product("QZX Validation Card 8", "Video Cards", {
    watts: "130",
    gpu_length_mm: "200",
    recommended_psu_watts: "550",
    pcie_6plus2_required: "1",
    pcie_16pin_required: "0",
    ...REVIEWED,
    ...over.gpu,
  }),
  product("QZX Validation Drive", "Solid State Drives", {
    storage_interface: "M.2 NVMe",
    storage_capacity_gb: "1000",
    ...REVIEWED,
    ...over.storage,
  }),
  product("QZX Validation Power 650", "Computer Power Supplies", {
    capacity_watts: "650",
    pcie_6plus2_count: "2",
    pcie_16pin_count: "0",
    ...REVIEWED,
    ...over.psu,
  }),
  product("QZX Validation Enclosure", "Computer Cases", {
    supported_motherboards: '["ATX","Micro-ATX"]',
    cabinet_clearance_mm: "300",
    max_cooler_height_mm: "160",
    ...REVIEWED,
    ...over.cabinet,
  }),
];
const offerBuilds = (items: any[], options: any = { allowUnverified: true }) =>
  generateDynamicCatalogRecommendations(
    syncBuilderCatalogWithShopify(items).componentCatalog,
    { purpose: "gaming", details: {}, brands: [], wifi: "No", owned: [] },
    { min: 0, max: 300000 },
    options,
  );

// ── The outcome follows the Shopify value ────────────────────────────────────────────────────────

Deno.test("UNKNOWN: the socket value alone decides the match", () => {
  const am4 = board({ socket: "AM4", ...REVIEWED });
  const check = (specs: any) => ruleOf({ CPU: cpu(specs), Motherboard: am4 }, "RULE_A");
  assertEquals(check({ socket: "AM4", ...REVIEWED }), ["RULE_A_SOCKET_MATCH"]);
  assertEquals(check({ socket: "AM5", ...REVIEWED }), ["RULE_A_SOCKET_MISMATCH"]);
  assertEquals(check({ ...REVIEWED }), ["RULE_A_SOCKET_UNKNOWN"]);
  const unreadable = cpu({ socket: "FM2", ...REVIEWED });
  assertEquals(ruleOf({ CPU: unreadable, Motherboard: am4 }, "RULE_A"), ["RULE_A_SOCKET_UNKNOWN"]);
  assertEquals(unreadable.specs.specProblems[0].kind, "invalid");
});

Deno.test("UNKNOWN: a processor's memory list is checked against the kit", () => {
  const parts = {
    CPU: cpu({ socket: "AM4", supported_ram_generations: '["DDR5"]', ...REVIEWED }),
    RAM: kit({ ram_generation: "DDR4", ...REVIEWED }),
  };
  assert(ruleOf(parts, "RULE_B").includes("RULE_B_CPU_RAM_MISMATCH"));
});

Deno.test("UNKNOWN: the cabinet's list decides which boards fit", () => {
  const enclosure = cabinet({ supported_motherboards: '["Micro-ATX","Mini-ITX"]', ...REVIEWED });
  const check = (form_factor?: string) =>
    ruleOf(
      {
        Cabinet: enclosure,
        Motherboard: board({ ...(form_factor && { form_factor }), ...REVIEWED }),
      },
      "RULE_G",
    );
  assertEquals(check("Micro-ATX"), ["RULE_G_FORM_FACTOR_MATCH"]);
  assertEquals(check("Mini-ITX"), ["RULE_G_FORM_FACTOR_MATCH"]);
  assertEquals(check("ATX"), ["RULE_G_FORM_FACTOR_MISMATCH"]);
  assertEquals(check(), ["RULE_G_FORM_FACTOR_UNKNOWN"]);
});

Deno.test("UNKNOWN: a card fits up to the clearance, and no further", () => {
  const enclosure = cabinet({ cabinet_clearance_mm: "270", ...REVIEWED });
  const check = (gpu_length_mm?: string) =>
    ruleOf(
      { Cabinet: enclosure, GPU: card({ ...(gpu_length_mm && { gpu_length_mm }), ...REVIEWED }) },
      "RULE_D",
    );
  assertEquals(check("270"), ["RULE_D_GPU_CLEARANCE_OK"]);
  assertEquals(check("271"), ["RULE_D_GPU_LENGTH_EXCEEDED"]);
  assertEquals(check(), ["RULE_D_GPU_CLEARANCE_UNKNOWN"]);
});

Deno.test("UNKNOWN: a cooler fits up to the cabinet's limit, and no further", () => {
  const parts = (cooler_height_mm?: string) => ({
    CPU: cpu({ socket: "AM4", includes_cooler: "false", ...REVIEWED }),
    Cabinet: cabinet({ max_cooler_height_mm: "167", ...REVIEWED }),
    Cooler: cooler({
      supported_sockets: '["AM4"]',
      ...(cooler_height_mm && { cooler_height_mm }),
      ...REVIEWED,
    }),
  });
  const heightRules = (height?: string) => ruleOf(parts(height), "RULE_C_COOLER_HEIGHT");
  assertEquals(heightRules("167"), ["RULE_C_COOLER_HEIGHT_OK"]);
  assertEquals(heightRules("168"), ["RULE_C_COOLER_HEIGHT_EXCEEDED"]);
  assertEquals(heightRules(), ["RULE_C_COOLER_HEIGHT_UNKNOWN"]);
});

Deno.test("UNKNOWN: a cooler's socket list decides whether it mounts", () => {
  const check = (sockets?: string) =>
    ruleOf(
      {
        CPU: cpu({ socket: "AM4", includes_cooler: "false", ...REVIEWED }),
        Cooler: cooler({ ...(sockets && { supported_sockets: sockets }), ...REVIEWED }),
      },
      "RULE_C_COOLER_SOCKET",
    );
  assertEquals(check('["AM4"]'), ["RULE_C_COOLER_SOCKET_MATCH"]);
  assertEquals(check('["AM5"]'), ["RULE_C_COOLER_SOCKET_MISMATCH"]);
  assertEquals(check(), ["RULE_C_COOLER_SOCKET_UNKNOWN"]);
});

Deno.test("UNKNOWN: a title and a stated value that disagree are both withheld", () => {
  const conflicted = match(
    product("QZX Validation B550 Board", "Motherboards", { socket: "AM5", ...REVIEWED }),
  );
  assertEquals(conflicted.specs.socket, undefined);
  assertEquals(conflicted.specs.specProblems[0].kind, "conflict");
  const check = checkCompatibility({ Motherboard: conflicted });
  assertEquals(check.hasBlockingUnknowns, true);
});

Deno.test("UNKNOWN: a held selection follows each change in the catalogue", () => {
  const items = (value?: string) =>
    syncBuilderCatalogWithShopify([
      product(
        "QZX Validation Enclosure",
        "Computer Cases",
        value ? { cabinet_clearance_mm: value } : {},
        {
          id: "gid://shopify/Product/held",
          variantId: "gid://shopify/ProductVariant/held",
        },
      ),
    ]).componentCatalog;
  const held = items("270").Cabinet[0];
  const after = (value?: string) =>
    reconcileBuildParts({ Cabinet: held }, items(value)).parts.Cabinet.specs?.maxGpuLengthMm;
  assertEquals(after("270"), 270);
  assertEquals(after("200"), 200);
  assertEquals(after(), undefined);
});

Deno.test("UNKNOWN: Find My PC builds from Shopify values alone, with no registry part", () => {
  const builds = offerBuilds(FULL_CATALOGUE(), {});
  assert(builds.length > 0);
  for (const build of builds) {
    assertEquals(build.requiresReview, false);
    assertEquals(build.confidenceBadge, "certified");
    for (const part of Object.values<any>(build.parts)) {
      assertEquals(part.matchedModelKey, undefined, part.name);
    }
  }
});

// ── D1: internal fields stay away from customers ─────────────────────────────────────────────────

Deno.test("D1: no builder field reaches what a customer sees or searches", () => {
  const specs: Record<string, string> = Object.fromEntries(
    PC_BUILDER_METAFIELDS.map((field: any) => [field.key, "internal-value"]),
  );
  specs.Warranty = "3 Years";
  specs.Socket = "AM4";
  assertEquals(customerVisibleSpecs(specs), { Warranty: "3 Years", Socket: "AM4" });
  assertEquals(customerVisibleSpecs(undefined), {});
  assertEquals(customerVisibleSpecs("not an object"), {});
});

Deno.test("D1: search keeps descriptive values, but never the review record or plain numbers", () => {
  const found = searchableSpecs({
    Warranty: "3 Years",
    socket: "AM5",
    form_factor: "Micro-ATX",
    watts: "65",
    ...REVIEWED,
    spec_reviewed_by: "AK",
  });
  assertEquals(found, { Warranty: "3 Years", socket: "AM5", form_factor: "Micro-ATX" });
  assertEquals(searchableSpecs(undefined), {});
});

Deno.test("D1: the builder still reads the fields a customer doesn't see", () => {
  const part = cpu({ socket: "AM4", ...REVIEWED });
  assertEquals(part.specs.socket, "AM4");
});

for (const [file, reader] of [
  ["../../../src/components/ProductCard.tsx", "customerVisibleSpecs(product.specs)"],
  ["../../../src/pages/Products.tsx", "searchableSpecs(product.specs)"],
  ["../../../src/components/Layout.tsx", "searchableSpecs(product.specs)"],
  ["../../../src/lib/relatedProducts.ts", "searchableSpecs(target.specs)"],
] as const) {
  Deno.test(`D1: ${file.split("/").pop()} reads only customer-visible specifications`, async () => {
    const source = await Deno.readTextFile(new URL(file, import.meta.url));
    assert(source.includes(reader), file);
    assert(!source.includes("Object.values(product.specs)"), file);
    assert(!source.includes("Object.entries(product.specs)"), file);
  });
}

Deno.test("D1: a customer never reads an internal key in a compatibility message", () => {
  const badValue = cabinet({ cabinet_clearance_mm: "wide", ...REVIEWED });
  const badReview = cabinet({ cabinet_clearance_mm: "270", spec_review_status: "reviewed" });
  for (const part of [badValue, badReview]) {
    const text = checkCompatibility({ Cabinet: part })
      .items.map((item: any) => `${item.label} ${item.explanation}`)
      .join(" ");
    for (const field of PC_BUILDER_METAFIELDS) assert(!text.includes(field.key), field.key);
  }
});

Deno.test("D1: a conflict still names the field, in words a customer can read", () => {
  const conflicted = match(
    product("QZX Validation B550 Board", "Motherboards", { socket: "AM5", ...REVIEWED }),
  );
  const item = checkCompatibility({ Motherboard: conflicted }).items.find(
    (i: any) => i.ruleId === "RULE_K_SPEC_CONFLICT",
  );
  assert(item?.explanation.startsWith("CPU socket: Shopify says AM5, but the title says AM4"));
  const registry = match(product("AMD Ryzen 5 5600", "Computer Processors", { socket: "AM5" }));
  const onRegistry = checkCompatibility({ CPU: registry }).items.find(
    (i: any) => i.ruleId === "RULE_K_SPEC_CONFLICT",
  );
  assert(onRegistry?.explanation.startsWith("CPU socket: "));
});

Deno.test("D1: an older connector field is still named in words", () => {
  const part = card({ pcie_connectors: "1x 8-pin" });
  assertEquals(part.specs.unreviewedSpecs, ["PCIe power connectors"]);
});

// ── D2: one reviewed value can't vouch for a whole part ──────────────────────────────────────────

const REVIEWED_EXTRAS = {
  ram_slots: "2",
  max_ram_gb: "64",
  m2_slots: "1",
  sata_ports: "4",
  ...REVIEWED,
};

Deno.test("D2: a board with reviewed extras and a title-read socket isn't confirmed", () => {
  const titled = match(
    product("Gigabyte B550M DS3H DDR4 Micro-ATX Motherboard", "Motherboards", REVIEWED_EXTRAS),
  );
  assertEquals(specConfidence(titled, "ramSlots"), "it_hub_reviewed");
  assertEquals(specConfidence(titled, "socket"), "title_inferred");
  assertEquals(titled.specs.provenance, "supplier_spec");
});

Deno.test("D2: a build with such a board doesn't read as confirmed", () => {
  const items = FULL_CATALOGUE().filter((p) => p.category !== "Motherboards");
  items.push(
    product("Gigabyte B550M DS3H DDR4 Micro-ATX Motherboard", "Motherboards", REVIEWED_EXTRAS),
  );
  const builds = offerBuilds(items);
  assert(builds.length > 0);
  for (const build of builds) {
    assert(build.confidenceBadge !== "certified");
    assert(build.confidenceLabel !== "Specifications confirmed");
  }
});

Deno.test("D2: every label-critical value reviewed confirms the part", () => {
  const complete = board({
    socket: "AM4",
    ram_generation: "DDR4",
    form_factor: "ATX",
    ...REVIEWED,
  });
  assertEquals(complete.specs.provenance, "it_hub_reviewed");
  const oneMissing = board({ socket: "AM4", ram_generation: "DDR4", ...REVIEWED });
  assertEquals(oneMissing.specs.provenance, "supplier_spec");
});

Deno.test("D2: stating a value doesn't mark a part verified, and a full review does", () => {
  assertEquals(board({ m2_slots: "1" }).isVerified, false);
  assertEquals(board({ m2_slots: "1", ...REVIEWED }).isVerified, false);
  assertEquals(
    board({ socket: "AM4", ram_generation: "DDR4", form_factor: "ATX", ...REVIEWED }).isVerified,
    true,
  );
});

Deno.test("D2: a critical value that conflicts leaves the part unconfirmed", () => {
  const conflicted = match(
    product("QZX Validation B550 Board", "Motherboards", {
      socket: "AM5",
      ram_generation: "DDR4",
      form_factor: "ATX",
      ...REVIEWED,
    }),
  );
  assertEquals(conflicted.specs.provenance, "supplier_spec");
});

// ── D3: what counts as a review ──────────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-11-04T06:00:00Z");

Deno.test("D3: a complete record counts as reviewed", () => {
  const review = readSpecReview(REVIEWED, NOW);
  assertEquals(review.isReviewed, true);
  assertEquals(review.issues, []);
  assertEquals(
    readSpecReview({ ...REVIEWED, spec_source: "it_hub_measured" }, NOW).isReviewed,
    true,
  );
});

Deno.test("D3: each weak record is refused, naming the field that's wrong", () => {
  const cases: [Record<string, string | undefined>, string][] = [
    [{ spec_source: "supplier" }, "spec_source"],
    [{ spec_source: undefined }, "spec_source"],
    [{ spec_source: "the internet" }, "spec_source"],
    [{ spec_source_url: undefined }, "spec_source_url"],
    [{ spec_source_url: "http://www.example.com/x" }, "spec_source_url"],
    [{ spec_source_url: "https://localhost/x" }, "spec_source_url"],
    [{ spec_source_url: "not a link" }, "spec_source_url"],
    [{ spec_reviewed_on: undefined }, "spec_reviewed_on"],
    [{ spec_reviewed_on: "2099-01-01" }, "spec_reviewed_on"],
    [{ spec_reviewed_on: "2026-02-31" }, "spec_reviewed_on"],
    [{ spec_reviewed_on: "04/11/2026" }, "spec_reviewed_on"],
  ];
  for (const [change, field] of cases) {
    const review = readSpecReview({ ...REVIEWED, ...change }, NOW);
    assertEquals(review.isReviewed, false, JSON.stringify(change));
    assertEquals(
      review.issues.map((issue: any) => issue.field),
      [field],
      JSON.stringify(change),
    );
  }
});

Deno.test("D3: today's date in India counts, even while it's still yesterday in UTC", () => {
  const justAfterMidnightInIndia = Date.parse("2026-11-03T18:45:00Z");
  const today = { ...REVIEWED, spec_reviewed_on: "2026-11-04" };
  assertEquals(readSpecReview(today, justAfterMidnightInIndia).isReviewed, true);
  const tomorrow = { ...REVIEWED, spec_reviewed_on: "2026-11-05" };
  assertEquals(readSpecReview(tomorrow, justAfterMidnightInIndia).isReviewed, false);
});

Deno.test("D3: a supplier's claim marked reviewed stays supplier-provided, and says why", () => {
  const part = board({ socket: "AM4", ...REVIEWED, spec_source: "supplier" });
  assertEquals(specConfidence(part, "socket"), "supplier_provided");
  assert(
    part.specs.specProblems.some((p: any) => p.kind === "review" && p.field === "spec_source"),
  );
  assertEquals(
    readStatedSpecs("Motherboard", { ...REVIEWED, spec_source: "supplier" }, NOW).problems[0].kind,
    "review",
  );
});

Deno.test("D3: an unmarked record isn't a problem, only unreviewed", () => {
  assertEquals(board({ socket: "AM4" }).specs.specProblems, undefined);
  assertEquals(readSpecReview({ spec_source: "supplier" }, NOW).issues, []);
});

// ── D4: a value changed after its review ─────────────────────────────────────────────────────────

const updated = (specUpdatedAt: Record<string, string>, specs: any = {}) =>
  match(
    product(
      "QZX Validation Enclosure",
      "Computer Cases",
      {
        supported_motherboards: '["Micro-ATX"]',
        cabinet_clearance_mm: "270",
        ...REVIEWED,
        ...specs,
      },
      { specUpdatedAt },
    ),
  );

Deno.test("D4: the catalogue asks Shopify when each value changed, and never asks for the reviewer", () => {
  assert(/\bupdatedAt\b/.test(PRODUCTS_QUERY));
  assert(!PRODUCTS_QUERY.includes("spec_reviewed_by"));
});

Deno.test("D4: a change is carried from Shopify's response to the product", () => {
  const metafield = (namespace: string, key: string, updatedAt?: string) => ({
    namespace,
    key,
    value: "x",
    type: "t",
    updatedAt,
  });
  assertEquals(
    specUpdatedTimes([
      metafield("pc_builder", "socket", "2026-11-04T10:00:00Z"),
      metafield("custom", "condition", "2026-11-04T10:00:00Z"),
      metafield("pc_builder", "watts"),
      null,
    ]),
    { socket: "2026-11-04T10:00:00Z" },
  );
  assertEquals(specUpdatedTimes([]), undefined);
});

Deno.test("D4: a changed value is seen as a catalogue change, so stock updates can't restore the old one", () => {
  const before = product("QZX Validation Enclosure", "Computer Cases", {
    cabinet_clearance_mm: "270",
  });
  const same = { ...before, specs: { ...before.specs } };
  assertEquals(diffCatalogProducts([before], [same]).hasChanges, false);
  const edited = { ...before, specs: { cabinet_clearance_mm: "200" } };
  assertEquals(diffCatalogProducts([before], [edited]).hasStructuralChanges, true);
  const rejected = { ...before, specs: { ...before.specs, spec_review_status: "rejected" } };
  assertEquals(diffCatalogProducts([before], [rejected]).hasStructuralChanges, true);
  const touched = { ...before, specUpdatedAt: { cabinet_clearance_mm: "2026-11-04T10:00:00Z" } };
  assertEquals(diffCatalogProducts([before], [touched]).hasStructuralChanges, true);
});

Deno.test("D4: a value changed after the review day no longer counts as reviewed", () => {
  const part = updated({ cabinet_clearance_mm: "2026-11-02T10:00:00Z" });
  assertEquals(specConfidence(part, "maxGpuLengthMm"), "supplier_provided");
  assertEquals(specConfidence(part, "supportedMotherboards"), "it_hub_reviewed");
  assertEquals(part.specs.provenance, "supplier_spec");
  assert(part.specs.unreviewedSpecs.includes("Graphics card clearance (mm)"));
});

Deno.test("D4: a change on the review day can't be told apart, and says so by staying reviewed", () => {
  // 23:30 in India on the review date.
  const part = updated({ cabinet_clearance_mm: "2026-11-01T18:00:00Z" });
  assertEquals(specConfidence(part, "maxGpuLengthMm"), "it_hub_reviewed");
  // 00:30 in India the next day.
  const later = updated({ cabinet_clearance_mm: "2026-11-01T19:00:00Z" });
  assertEquals(specConfidence(later, "maxGpuLengthMm"), "supplier_provided");
});

Deno.test("D4: reviewing again brings the value back", () => {
  const part = updated(
    { cabinet_clearance_mm: "2026-11-02T10:00:00Z" },
    { spec_reviewed_on: "2026-11-03" },
  );
  assertEquals(specConfidence(part, "maxGpuLengthMm"), "it_hub_reviewed");
});

Deno.test("D4: no change time from Shopify isn't treated as a change", () => {
  assertEquals(keysChangedSinceReview(readSpecReview(REVIEWED, NOW)).size, 0);
});

Deno.test("D4: a value filling a registry gap also loses its review when changed", () => {
  const part = match(
    product(
      "AMD Ryzen 5 5600",
      "Computer Processors",
      { cpu_max_power_watts: "76", ...REVIEWED },
      { specUpdatedAt: { cpu_max_power_watts: "2026-11-03T10:00:00Z" } },
    ),
  );
  assertEquals(specConfidence(part, "maxTurboPowerWatts"), "supplier_provided");
  assert(part.specs.unreviewedSpecs.includes("CPU maximum power (W)"));
});

// ── D5: rejected parts ───────────────────────────────────────────────────────────────────────────

const REJECTED_CARD = (price = 5000) =>
  product(
    "QZX Rejected Card",
    "Video Cards",
    { watts: "130", spec_review_status: "rejected" },
    { price },
  );

Deno.test("D5: rejected values are ignored, and the part is marked", () => {
  const part = match(REJECTED_CARD());
  assertEquals(part.specs.powerWatts, undefined);
  assertEquals(hasRejectedSpecs(part.specs), true);
});

Deno.test("D5: a rejected part sends a manual build to review, and says so", () => {
  const check = checkCompatibility({ GPU: match(REJECTED_CARD()) });
  const item = check.items.find((i: any) => i.ruleId === "RULE_K_SPEC_REJECTED");
  assert(item);
  assertEquals(check.hasBlockingUnknowns, true);
  assertEquals(check.valid, true);
  assert(item.label.includes("specifications rejected"));
});

Deno.test("D5: Find My PC leaves a rejected part out, even when it's the cheapest", () => {
  const items = [...FULL_CATALOGUE(), REJECTED_CARD(100)];
  const builds = offerBuilds(items);
  assert(builds.length > 0);
  for (const build of builds) assertEquals(build.parts.GPU.name, "QZX Validation Card 8");
});

Deno.test("D5: a registry part with rejected Shopify values is also left out of Find My PC", () => {
  const items = FULL_CATALOGUE().filter((p) => p.category !== "Computer Processors");
  items.push(
    product("AMD Ryzen 5 5600", "Computer Processors", { spec_review_status: "rejected" }),
  );
  assertEquals(offerBuilds(items), []);
});

Deno.test("D5: a part from the database registry can be rejected too", () => {
  const item = product("QZX Registered Card", "Video Cards", { spec_review_status: "rejected" });
  registerDatabaseHardwareSpec(item.variantId, {
    product: { id: "p", verification_status: "verified_manufacturer" },
    variant: { id: "v", verification_status: "verified_manufacturer" },
  });
  try {
    assertEquals(hasRejectedSpecs(match(item).specs), true);
  } finally {
    clearRegisteredDatabaseSpecs();
  }
});

Deno.test("D5: a part isn't marked rejected for being unreviewed", () => {
  assertEquals(
    hasRejectedSpecs(match(product("QZX Card", "Video Cards", { watts: "130" })).specs),
    false,
  );
  assertEquals(hasRejectedSpecs(undefined), false);
});

// ── B1: unknown physical fit ─────────────────────────────────────────────────────────────────────

Deno.test("B1: every remaining kind of unknown also sends the build to review", () => {
  const silentCpu = cpu({ socket: "AM4", ...REVIEWED });
  const cases: [string, any][] = [
    ["RULE_C_STOCK_COOLER_UNKNOWN", { CPU: silentCpu }],
    ["RULE_I_DISPLAY_OUTPUT_UNKNOWN", { CPU: silentCpu }],
    [
      "RULE_H_STORAGE_UNKNOWN",
      {
        Motherboard: board({ ...REVIEWED }),
        Storage: match(
          product("QZX Validation Drive", "Solid State Drives", {
            storage_interface: "M.2 NVMe",
            ...REVIEWED,
          }),
        ),
      },
    ],
    [
      "RULE_B_RAM_LIMITS_UNKNOWN",
      {
        Motherboard: board({ ...REVIEWED }),
        RAM: kit({ ram_generation: "DDR4", ram_capacity_gb: "16", ...REVIEWED }),
      },
    ],
    ["RULE_K_SPEC_INVALID", { Cabinet: cabinet({ cabinet_clearance_mm: "wide", ...REVIEWED }) }],
  ];
  for (const [rule, parts] of cases) {
    const check = checkCompatibility(parts);
    assert(
      check.items.some((i: any) => i.ruleId === rule),
      rule,
    );
    assertEquals(check.hasBlockingUnknowns, true, rule);
    assertEquals(check.status, "unknown", rule);
    assertEquals(check.valid, true, rule);
  }
});

Deno.test("B1: below the recommended wattage still goes to review, though it isn't an unknown", () => {
  const check = checkCompatibility({
    CPU: cpu({ watts: "65", includes_cooler: "true", ...REVIEWED }),
    GPU: card({
      watts: "115",
      recommended_psu_watts: "550",
      pcie_6plus2_required: "1",
      pcie_16pin_required: "0",
      ...REVIEWED,
    }),
    PSU: match(
      product("QZX Validation Power", "Computer Power Supplies", {
        capacity_watts: "450",
        pcie_6plus2_count: "1",
        pcie_16pin_count: "0",
        ...REVIEWED,
      }),
    ),
  });
  const item = check.items.find((i: any) => i.ruleId === "RULE_E_PSU_BELOW_RECOMMENDED");
  assertEquals(item?.status, "conditional");
  assertEquals(check.hasBlockingUnknowns, true);
});

Deno.test("B1: no check can report something unknown without sending the build to review", () => {
  for (const parts of [
    { CPU: cpu({}) },
    { Motherboard: board({}), Cabinet: cabinet({}) },
    { GPU: card({}), PSU: match(product("QZX Silent Power", "Computer Power Supplies")) },
  ]) {
    const check = checkCompatibility(parts);
    if (check.items.some((i: any) => i.status === "unknown")) {
      assertEquals(check.hasBlockingUnknowns, true);
    }
  }
});

const statesNothing = {
  supported_motherboards: "",
  cabinet_clearance_mm: "",
  max_cooler_height_mm: "",
};

Deno.test("B1: each unknown physical fit sends the build to review", () => {
  const cases: [string, any][] = [
    [
      "RULE_G_FORM_FACTOR_UNKNOWN",
      { Motherboard: board({ ...REVIEWED }), Cabinet: cabinet({ ...REVIEWED }) },
    ],
    [
      "RULE_D_GPU_CLEARANCE_UNKNOWN",
      { GPU: card({ ...REVIEWED }), Cabinet: cabinet({ ...REVIEWED }) },
    ],
    [
      "RULE_C_COOLER_SOCKET_UNKNOWN",
      { CPU: cpu({ socket: "AM4", ...REVIEWED }), Cooler: cooler({ ...REVIEWED }) },
    ],
    [
      "RULE_C_COOLER_HEIGHT_UNKNOWN",
      {
        // The socket is stated, so that only the height is left to send this to review.
        CPU: cpu({ socket: "AM4", ...REVIEWED }),
        Cooler: cooler({ supported_sockets: '["AM4"]', ...REVIEWED }),
        Cabinet: cabinet({ ...REVIEWED }),
      },
    ],
  ];
  for (const [rule, parts] of cases) {
    const check = checkCompatibility(parts);
    assert(
      check.items.some((i: any) => i.ruleId === rule),
      rule,
    );
    assertEquals(check.hasBlockingUnknowns, true, rule);
    assertEquals(check.status, "unknown", rule);
    // It still isn't called incompatible, and a customer can still choose it.
    assertEquals(check.valid, true, rule);
  }
});

Deno.test("B1: Find My PC marks a build whose cabinet states nothing, and won't offer it unasked", () => {
  const items = FULL_CATALOGUE().filter((p) => p.category !== "Computer Cases");
  items.push(product("QZX Silent Enclosure", "Computer Cases", statesNothing));
  const marked = offerBuilds(items);
  assert(marked.length > 0);
  for (const build of marked) {
    assertEquals(build.requiresReview, true);
    assertEquals(build.confidenceBadge, "review");
  }
  assertEquals(offerBuilds(items, {}), []);
});

Deno.test("B1: stating the values clears the review", () => {
  const builds = offerBuilds(FULL_CATALOGUE());
  assert(builds.length > 0);
  for (const build of builds) assertEquals(build.requiresReview, false);
});

// ── B2: unreviewed Shopify values ────────────────────────────────────────────────────────────────

const UNREVIEW = {
  spec_review_status: "unreviewed",
  spec_source: undefined,
  spec_source_url: undefined,
  spec_reviewed_on: undefined,
};

Deno.test("B2: a Shopify value nobody reviewed sends the build to review", () => {
  const part = cabinet({ supported_motherboards: '["ATX"]', cabinet_clearance_mm: "300" });
  const check = checkCompatibility({ Cabinet: part });
  const item = check.items.find((i: any) => i.ruleId === "RULE_L_SPEC_UNREVIEWED");
  assert(item);
  assertEquals(check.status, "unknown");
  assertEquals(check.hasBlockingUnknowns, true);
  // Named for people to read, not by internal key.
  assert(item.explanation.includes("Graphics card clearance (mm)"));
  assert(!item.explanation.includes("cabinet_clearance_mm"));
});

Deno.test("B2: every part unreviewed still offers a build, but marked for review", () => {
  const items = FULL_CATALOGUE({
    cpu: UNREVIEW,
    board: UNREVIEW,
    ram: UNREVIEW,
    gpu: UNREVIEW,
    storage: UNREVIEW,
    psu: UNREVIEW,
    cabinet: UNREVIEW,
  });
  const builds = offerBuilds(items);
  assert(builds.length > 0);
  for (const build of builds) {
    assertEquals(build.requiresReview, true);
    assertEquals(build.confidenceBadge, "review");
  }
  assertEquals(offerBuilds(items, {}), []);
});

Deno.test("B2: one part unreviewed is enough", () => {
  const builds = offerBuilds(FULL_CATALOGUE({ psu: UNREVIEW }));
  assert(builds.length > 0);
  for (const build of builds) {
    assertEquals(build.requiresReview, true);
    assert(build.reviewItems.includes("QZX Validation Power 650: specifications not yet reviewed"));
  }
});

Deno.test("B2: a Shopify value agreeing with the registry adds nothing to check", () => {
  const part = match(product("AMD Ryzen 5 5600", "Computer Processors", { socket: "AM4" }));
  assertEquals(part.specs.unreviewedSpecs, undefined);
  // Even where the registry's own value has no source. That limits labels, and is decided elsewhere.
  const unsourced = match(
    product("Deepcool PK550D 550W 80 Plus Bronze Power Supply", "Computer Power Supplies", {
      capacity_watts: "550",
    }),
  );
  assertEquals(specConfidence(unsourced, "ratedWattage"), "supplier_provided");
  assertEquals(unsourced.specs.unreviewedSpecs, undefined);
});

Deno.test("B2: an unreviewed value filling a registry gap does count", () => {
  const part = match(
    product("AMD Ryzen 5 5600", "Computer Processors", { cpu_max_power_watts: "76" }),
  );
  assertEquals(part.specs.unreviewedSpecs, ["CPU maximum power (W)"]);
});

const unreviewedRule = (part: any) =>
  checkCompatibility({ [part.slot]: part }).items.find(
    (i: any) => i.ruleId === "RULE_L_SPEC_UNREVIEWED",
  );

Deno.test("TITLE: a critical value only read from a title sends the build to review", () => {
  const part = match(product("QZX B550M DDR4 Micro-ATX Motherboard", "Motherboards"));
  assertEquals(specConfidence(part, "socket"), "title_inferred");
  const item = unreviewedRule(part);
  assert(item);
  assert(item.explanation.includes("socket"));
  assert(item.explanation.includes("memory generation"));
  assert(item.explanation.includes("form factor"));
  assertEquals(checkCompatibility({ Motherboard: part }).status, "unknown");
});

Deno.test("TITLE: a chip table's figures are title-read too", () => {
  const part = match(product("QZX GeForce RTX 4060 Card", "Video Cards"));
  assertEquals(specConfidence(part, "recommendedPsuWatts"), "title_inferred");
  assert(unreviewedRule(part)?.explanation.includes("recommended power supply"));
});

Deno.test("TITLE: a title-read value a label doesn't rest on is no reason for review", () => {
  const part = match(
    product("QZX 2TB Drive", "Solid State Drives", {
      storage_interface: "M.2 NVMe",
      ...REVIEWED,
    }),
  );
  assertEquals(specConfidence(part, "storageCapacityGb"), "title_inferred");
  assertEquals(unreviewedRule(part), undefined);
});

Deno.test("TITLE: a reviewed value agreeing with the title clears the review", () => {
  const part = match(
    product("QZX B550M DDR4 Micro-ATX Motherboard", "Motherboards", {
      socket: "AM4",
      ram_generation: "DDR4",
      form_factor: "Micro-ATX",
      ...REVIEWED,
    }),
  );
  assertEquals(unreviewedRule(part), undefined);
  assertEquals(part.specs.provenance, "it_hub_reviewed");
});

Deno.test("TITLE: a registry part isn't sent to review by its own unsourced values", () => {
  const part = match(
    product("Deepcool PK550D 550W 80 Plus Bronze Power Supply", "Computer Power Supplies"),
  );
  assertEquals(specConfidence(part, "ratedWattage"), "supplier_provided");
  assertEquals(unreviewedRule(part), undefined);
});

// ── Software development ─────────────────────────────────────────────────────────────────────────

Deno.test("PURPOSE: software development doesn't insist on a graphics card", () => {
  assertEquals(purposeProfile("programming").requiresDedicatedGpu, false);
  assertEquals(purposeProfile("programming").requirement?.software, "Visual Studio");
  assertEquals(purposeProfile("professional").requiresDedicatedGpu, true);
});

Deno.test("PURPOSE: with integrated graphics, a developer can be offered a build with no card", () => {
  const items = FULL_CATALOGUE({ cpu: { integrated_graphics: "true" } });
  const purposeBuilds = (purpose: string) =>
    generateDynamicCatalogRecommendations(
      syncBuilderCatalogWithShopify(items).componentCatalog,
      { purpose, details: {}, brands: [], wifi: "", owned: [] },
      { min: 0, max: 300000 },
    );
  assert(purposeBuilds("programming").some((build: any) => !build.parts.GPU));
  assert(purposeBuilds("professional").every((build: any) => build.parts.GPU));
});

Deno.test("PURPOSE: a no-card build isn't crowded out by dearer ones with a card", () => {
  const cards = [10000, 30000, 50000, 70000, 90000].map((price, i) =>
    product(
      `QZX Validation Card ${i}`,
      "Video Cards",
      {
        watts: "130",
        gpu_length_mm: "200",
        recommended_psu_watts: "550",
        pcie_6plus2_required: "1",
        pcie_16pin_required: "0",
        ...REVIEWED,
      },
      { price },
    ),
  );
  const items = [
    ...FULL_CATALOGUE({ cpu: { integrated_graphics: "true" } }).filter(
      (p) => p.category !== "Video Cards",
    ),
    // Without a processor that needs a card, the cheapest two builds would otherwise take the places.
    product(
      "QZX Validation Processor 55",
      "Computer Processors",
      {
        socket: "AM4",
        watts: "65",
        cpu_max_power_watts: "76",
        integrated_graphics: "false",
        includes_cooler: "true",
        supported_ram_generations: '["DDR4"]',
        ...REVIEWED,
      },
      { price: 100 },
    ),
    ...cards,
  ];
  const offered = (purpose: string) =>
    generateDynamicCatalogRecommendations(
      syncBuilderCatalogWithShopify(items).componentCatalog,
      { purpose, details: {}, brands: [], wifi: "", owned: [] },
      { min: 0, max: 300000 },
    );
  assert(offered("programming").some((build: any) => !build.parts.GPU));
  assertEquals(offered("programming").length, 3);
  assert(offered("professional").every((build: any) => build.parts.GPU));
});

Deno.test("PURPOSE: a processor with no graphics still needs a card, whatever the purpose", () => {
  const builds = generateDynamicCatalogRecommendations(
    syncBuilderCatalogWithShopify(FULL_CATALOGUE()).componentCatalog,
    { purpose: "programming", details: {}, brands: [], wifi: "", owned: [] },
    { min: 0, max: 300000 },
  );
  assert(builds.length > 0);
  assert(builds.every((build: any) => build.parts.GPU));
});

// The board's size is left out, so every build here goes to review whichever power supply it has.
const REVIEW_CATALOGUE = (powerSupplies: any[]) => [
  ...FULL_CATALOGUE({ board: { form_factor: "" } }).filter(
    (p) => p.category !== "Computer Power Supplies",
  ),
  ...powerSupplies,
];
const UNKNOWN_POWER = product("QZX Validation Power Unknown", "Computer Power Supplies", REVIEWED, {
  price: 1000,
});
const STATED_POWER = (watts: string) =>
  product(
    `QZX Validation Power Stated ${watts}`,
    "Computer Power Supplies",
    { capacity_watts: watts, pcie_6plus2_count: "2", pcie_16pin_count: "0", ...REVIEWED },
    { price: 5000 },
  );
const powerSupplyOffered = (items: any[], max = 300000) =>
  generateDynamicCatalogRecommendations(
    syncBuilderCatalogWithShopify(items).componentCatalog,
    { purpose: "gaming", details: {}, brands: [], wifi: "", owned: [] },
    { min: 0, max },
    { allowUnverified: true },
  );

Deno.test("POWER: a supply known to be enough beats a cheaper unknown one in a build for review", () => {
  const builds = powerSupplyOffered(REVIEW_CATALOGUE([UNKNOWN_POWER, STATED_POWER("650")]));
  assertEquals(builds.length, 1);
  assert(builds[0].requiresReview);
  assertEquals(builds[0].parts.PSU.name, "QZX Validation Power Stated 650");
  assertEquals(builds[0].price, 35000);
});

Deno.test("POWER: the budget still comes first, so a build isn't lost to a dearer supply", () => {
  const builds = powerSupplyOffered(REVIEW_CATALOGUE([UNKNOWN_POWER, STATED_POWER("650")]), 32000);
  assertEquals(builds.length, 1);
  assert(builds[0].requiresReview);
  assertEquals(builds[0].parts.PSU.name, "QZX Validation Power Unknown");
  assertEquals(builds[0].price, 31000);
});

Deno.test("POWER: a stated wattage that falls short earns no preference", () => {
  const builds = powerSupplyOffered(REVIEW_CATALOGUE([UNKNOWN_POWER, STATED_POWER("400")]));
  assertEquals(builds.length, 1);
  assertEquals(builds[0].parts.PSU.name, "QZX Validation Power Unknown");
});

Deno.test("WORDING: a build below the range doesn't claim to cover the customer's needs", () => {
  const builds = generateDynamicCatalogRecommendations(
    syncBuilderCatalogWithShopify(FULL_CATALOGUE()).componentCatalog,
    { purpose: "gaming", details: {}, brands: [], wifi: "", owned: [] },
    { min: 100000, max: 300000 },
  );
  assert(builds.length > 0);
  for (const build of builds) {
    assertEquals(build.inBudget, false);
    assertEquals(build.note, "This costs less than the range you selected.");
  }
});

Deno.test("PAGE: the first screen offers software development as its own purpose", async () => {
  const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
  assert(page.includes('id: "programming"'));
  assert(page.includes('title: "Software Development"'));
  assert(!page.includes("Software development, CAD"));
});

// ── D6: the report ───────────────────────────────────────────────────────────────────────────────

Deno.test("D6: a product with values but no recognized kind is reported, not silently lost", () => {
  const report = buildSpecReport([
    product("Corsair RM750e", "", { capacity_watts: "750", spec_source: "supplier" }),
    product("Coffee Mug", "", {}),
    product("A Tag Only Thing", "", { socket: "AM4" }, { tagSpecKeys: ["socket"] }),
  ]);
  assertEquals(report.productCount, 3);
  assertEquals(report.parts, []);
  assertEquals(report.undetected, [
    { title: "Corsair RM750e", keys: ["capacity_watts", "spec_source"] },
  ]);
});

Deno.test("D6: the report says what each part lacks", () => {
  const report = buildSpecReport([
    product(
      "QZX B550M DDR4 Board",
      "Motherboards",
      { ram_slots: "wide", m2_slots: "1" },
      { variants: [{ id: "a" }, { id: "b" }] },
    ),
    product(
      "QZX Reviewed Enclosure",
      "Computer Cases",
      { supported_motherboards: '["ATX"]', cabinet_clearance_mm: "300", ...REVIEWED },
      { specUpdatedAt: { cabinet_clearance_mm: "2026-11-02T10:00:00Z" } },
    ),
    product("QZX Sold Out Card", "Video Cards", {}, { availableForSale: false }),
    product("AMD Ryzen 5 5600", "Computer Processors"),
  ]);
  const part = (title: string) => report.parts.find((p: any) => p.title === title)!;

  const boardRow = part("QZX B550M DDR4 Board");
  assertEquals(boardRow.slot, "Motherboard");
  assertEquals(boardRow.registryKey, undefined);
  assertEquals(boardRow.readFromTitle, ["socket", "memory generation"]);
  assertEquals(boardRow.missing, ["form factor"]);
  assertEquals(boardRow.unreviewed, ["M.2 slots"]);
  assertEquals(boardRow.problems[0].kind, "invalid");
  assertEquals(boardRow.variantCount, 2);

  const enclosure = part("QZX Reviewed Enclosure");
  assertEquals(enclosure.changedSinceReview, ["Graphics card clearance (mm)"]);
  assertEquals(enclosure.unreviewed, ["Graphics card clearance (mm)"]);

  assertEquals(part("QZX Sold Out Card").offered, false);
  assertEquals(part("AMD Ryzen 5 5600").registryKey, "cpu-r5-5600");

  const text = formatSpecReport(report);
  assert(text.includes("[Motherboard] QZX B550M DDR4 Board"));
  assert(text.includes("Not stated: form factor"));
  assert(text.includes("2 variants share one set of values"));
  assert(text.includes("not offered to customers"));
});

Deno.test("D6: the report ignores changes to the review record and to fields a part doesn't read", () => {
  const report = buildSpecReport([
    product(
      "QZX Reviewed Enclosure",
      "Computer Cases",
      { supported_motherboards: '["ATX"]', cooler_height_mm: "100", ...REVIEWED },
      {
        specUpdatedAt: {
          spec_review_status: "2026-11-03T10:00:00Z",
          cooler_height_mm: "2026-11-03T10:00:00Z",
        },
      },
    ),
  ]);
  assertEquals(report.parts[0].changedSinceReview, []);
});

Deno.test("D6: the report's script only reads, with the public token", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../scripts/pc-builder-spec-report.ts", import.meta.url),
  );
  assert(source.includes("fetchAllShopifyProducts"));
  assert(!/mutation|SHOPIFY_ADMIN_TOKEN|X-Shopify-Access-Token|shpat_/.test(source));
});

// ── The full path, from Shopify's own response shape ─────────────────────────────────────────────

Deno.test("PIPELINE: a Storefront response reaches the engine with its change times", () => {
  const node: any = {
    id: "gid://shopify/Product/901",
    title: "QZX Validation Enclosure",
    handle: "qzx",
    description: "",
    descriptionHtml: "",
    vendor: "IT-HUB",
    productType: "",
    tags: [],
    availableForSale: true,
    category: { id: "x", name: "Computer Cases", ancestors: [] },
    collections: { edges: [] },
    options: [],
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/901",
            title: "Default Title",
            availableForSale: true,
            price: { amount: "3000.0", currencyCode: "INR" },
            selectedOptions: [],
          },
        },
      ],
    },
    metafields: [
      ...Object.entries({
        ...REVIEWED,
        supported_motherboards: '["Micro-ATX"]',
        cabinet_clearance_mm: "270",
      }).map(([key, value]) => ({
        namespace: "pc_builder",
        key,
        value,
        type: "x",
        updatedAt: key === "cabinet_clearance_mm" ? "2026-11-02T10:00:00Z" : "2026-11-01T10:00:00Z",
      })),
      null,
    ],
  };
  const mapped = mapShopifyProductToCatalog(node);
  assertEquals(mapped.specUpdatedAt?.cabinet_clearance_mm, "2026-11-02T10:00:00Z");
  const part = match(mapped);
  assertEquals(part.slot, "Cabinet");
  assertEquals(part.specs.maxGpuLengthMm, 270);
  assertEquals(specConfidence(part, "maxGpuLengthMm"), "supplier_provided");
  assertEquals(specConfidence(part, "supportedMotherboards"), "it_hub_reviewed");
  assertEquals(missingCriticalSpecs(part), []);
});
