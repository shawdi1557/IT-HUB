// supabase/functions/tests/pc-builder-spec-provenance.test.ts
// Reading Shopify's real value shapes, tracking where each value came from, and refusing to settle a
// disagreement silently. A Shopify value can reach it_hub_reviewed at most.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { matchShopifyProductToComponent, syncBuilderCatalogWithShopify } =
  await import("../../../src/lib/builder/catalog.ts");
const { checkCompatibility, labelCompatibilityGaps, specConfidence } =
  await import("../../../src/lib/builder/compatibility.ts");
const { generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");
const {
  compareDefinitions,
  normalizeFormFactorName,
  normalizeRamGeneration,
  normalizeSocket,
  normalizeStorageInterface,
  parseIntegerValue,
  parseListValue,
  PC_BUILDER_DEFINITIONS_TO_CREATE,
  PC_BUILDER_METAFIELDS,
  readSpecReview,
  readStatedSpecs,
  sameSpecValue,
} = await import("../../../src/lib/builder/spec-schema.ts");
const { mapShopifyProductToCatalog, parseProductSpecs, tagSpecKeys } =
  await import("../../../src/lib/shopify-schema.ts");

const product = (name: string, category: string, specs: any = {}, extra: any = {}): any => ({
  id: "gid://shopify/Product/1",
  name,
  handle: "h",
  price: 1000,
  tags: [],
  variantId: "gid://shopify/ProductVariant/1",
  availableForSale: true,
  stock: 5,
  specs,
  category,
  ...extra,
});
const match = (item: any): any => matchShopifyProductToComponent(item);
const REVIEWED = {
  spec_review_status: "reviewed",
  spec_source_url: "https://www.example.com/datasheet",
};

// ── Shopify's value shapes ───────────────────────────────────────────────────

Deno.test("PARSE: Shopify's list type arrives as JSON and is read as a list", () => {
  assertEquals(parseListValue('["ATX","Micro-ATX"]'), ["ATX", "Micro-ATX"]);
  assertEquals(parseListValue("ATX, Micro-ATX"), ["ATX", "Micro-ATX"]);
  assertEquals(parseListValue(""), []);
  assertEquals(parseListValue("[broken"), []);
  const cabinet = match(
    product("Vendor Case", "Computer Cases", { supported_motherboards: '["ATX","Micro-ATX"]' }),
  );
  assertEquals(cabinet.specs.supportedMotherboards, ["ATX", "Micro-ATX"]);
  const cooler = match(
    product("Vendor CPU Cooler", "CPU Coolers", { supported_sockets: '["AM4","AM5"]' }),
  );
  assertEquals(cooler.specs.supportedSockets, ["AM4", "AM5"]);
  const psu = match(
    product("Vendor PSU", "Computer Power Supplies", { pcie_connectors: '["8-pin","8-pin"]' }),
  );
  assertEquals(psu.specs.pciePowerConnectors, ["8-pin", "8-pin"]);
});

Deno.test("PARSE: spellings of a known value are normalised, and nonsense gives nothing", () => {
  assertEquals(normalizeSocket("amd am4"), "AM4");
  assertEquals(normalizeSocket("AM5"), "AM5");
  assertEquals(normalizeSocket("FCLGA1700"), "LGA1700");
  assertEquals(normalizeSocket("LGA 1851"), "LGA1851");
  assertEquals(normalizeSocket("AM4 and AM5"), undefined);
  assertEquals(normalizeSocket("banana"), undefined);
  assertEquals(normalizeRamGeneration("ddr5"), "DDR5");
  assertEquals(normalizeRamGeneration("16GB"), undefined);
  assertEquals(normalizeRamGeneration("DDR4/DDR5"), undefined);
  assertEquals(normalizeFormFactorName("mATX"), "Micro-ATX");
  assertEquals(normalizeFormFactorName("Mini ITX"), "Mini-ITX");
  assertEquals(normalizeFormFactorName("huge"), undefined);
  assertEquals(normalizeStorageInterface("NVMe"), "M.2 NVMe");
  assertEquals(normalizeStorageInterface("M.2 SATA"), "M.2 SATA");
  assertEquals(normalizeStorageInterface("floppy"), undefined);
});

Deno.test("PARSE: a spelling difference no longer causes a false mismatch", () => {
  const cpu = match(product("Vendor CPU", "Computer Processors", { socket: "AM4" }));
  const board = match(product("Vendor Board", "Motherboards", { socket: "amd am4" }));
  assertEquals(board.specs.socket, "AM4");
  const summary = checkCompatibility({ CPU: cpu, Motherboard: board });
  assert(!summary.items.some((item: any) => item.ruleId === "RULE_A_SOCKET_MISMATCH"));
});

Deno.test("PARSE: numbers keep to their range, and zero counts are real", () => {
  assertEquals(parseIntegerValue("capacity_watts", "650"), 650);
  assertEquals(parseIntegerValue("capacity_watts", "650W"), 650);
  assertEquals(parseIntegerValue("capacity_watts", "-5"), undefined);
  assertEquals(parseIntegerValue("capacity_watts", "abc"), undefined);
  assertEquals(parseIntegerValue("capacity_watts", "99"), undefined);
  assertEquals(parseIntegerValue("capacity_watts", "3001"), undefined);
  assertEquals(parseIntegerValue("m2_slots", "0"), 0);
  const board = match(product("Vendor Board", "Motherboards", { m2_slots: "0", sata_ports: "4" }));
  assertEquals(board.specs.m2SlotCount, 0);
  assertEquals(board.specs.sataPortCount, 4);
});

Deno.test("PARSE: an unreadable value gives nothing, and it's listed for staff", () => {
  const psu = match(product("Vendor PSU", "Computer Power Supplies", { capacity_watts: "lots" }));
  assertEquals(psu.specs.ratedWattage, undefined);
  assertEquals(psu.specs.specProblems[0].kind, "invalid");
  assertEquals(psu.specs.specProblems[0].field, "capacity_watts");
  const board = match(product("Vendor Board", "Motherboards", { Memory: "16GB" }));
  assertEquals(board.specs.supportedRamGeneration, undefined);
  assertEquals(board.specs.specProblems[0].kind, "invalid");
});

Deno.test("PARSE: an unreadable connector list is unknown, not a guess", () => {
  const psu = match(
    product("Vendor PSU", "Computer Power Supplies", { pcie_connectors: "plenty" }),
  );
  assertEquals(psu.specs.pciePowerConnectors, undefined);
  assertEquals(psu.specs.specProblems[0].field, "pcie_connectors");
});

Deno.test("PARSE: the Wi-Fi and BIOS fields are read", () => {
  const yes = match(product("Vendor Board", "Motherboards", { wifi: "true" }));
  assertEquals(yes.specs.hasWifi, true);
  const no = match(product("Vendor Board", "Motherboards", { wifi: "false" }));
  assertEquals(no.specs.hasWifi, false);
  const bios = match(
    product("Vendor Board", "Motherboards", { socket: "AM4", bios_update_required: "true" }),
  );
  assertEquals(bios.specs.requiresBiosUpdateForRyzen5000, true);
});

Deno.test("PARSE: a title saying no Wi-Fi isn't read as having it", () => {
  for (const name of [
    "Vendor B550 Board No WiFi",
    "Vendor B550 Non-WiFi Board",
    "Vendor B550 Board without Wi-Fi",
  ]) {
    assertEquals(match(product(name, "Motherboards")).specs.hasWifi, false, name);
  }
  assertEquals(match(product("Vendor B550 WiFi Board", "Motherboards")).specs.hasWifi, true);
  // Silence stays unknown, rather than a claim that there's none.
  assertEquals(match(product("Vendor B550 Board", "Motherboards")).specs.hasWifi, undefined);
});

Deno.test("PARSE: the new fields are read", () => {
  const card = match(
    product("Vendor Card", "Video Cards", {
      watts: "200",
      gpu_length_mm: "300",
      recommended_psu_watts: "650",
      pcie_6plus2_required: "0",
      pcie_16pin_required: "1",
      pcie_16pin_adapter_8pin_count: "2",
    }),
  );
  assertEquals(card.specs.recommendedPsuWatts, 650);
  assertEquals(card.specs.pcie6Plus2Required, 0);
  assertEquals(card.specs.pcie16PinRequired, 1);
  assertEquals(card.specs.pcie16PinAdapter8PinCount, 2);
  const psu = match(
    product("Vendor PSU", "Computer Power Supplies", {
      pcie_6plus2_count: "0",
      pcie_16pin_count: "0",
    }),
  );
  assertEquals(psu.specs.pcie6Plus2Count, 0);
  const ram = match(
    product("Vendor RAM", "RAM", { ram_speed_mhz: "3200", ram_module_type: "SO-DIMM" }),
  );
  assertEquals(ram.specs.speedMhz, 3200);
  assertEquals(ram.specs.isLaptopSoDimm, true);
  const ssd = match(product("Vendor SSD", "Solid State Drives", { storage_capacity_gb: "512" }));
  assertEquals(ssd.specs.storageCapacityGb, 512);
  const cpu = match(
    product("Vendor CPU", "Computer Processors", { supported_ram_generations: '["DDR4","DDR5"]' }),
  );
  assertEquals(cpu.specs.supportedRamGen, ["DDR4", "DDR5"]);
});

Deno.test("PARSE: fields belonging to another kind of part aren't read", () => {
  const cpu = match(
    product("Vendor CPU", "Computer Processors", { capacity_watts: "650", gpu_length_mm: "300" }),
  );
  assertEquals(cpu.specs.ratedWattage, undefined);
  assertEquals(cpu.specs.lengthMm, undefined);
});

Deno.test("PARSE: an SSD's capacity is read from its title", () => {
  assertEquals(
    match(product("Vendor NVMe SSD 500GB, Upto 6600MB/s", "Solid State Drives")).specs
      .storageCapacityGb,
    500,
  );
  assertEquals(
    match(product("Vendor 2TB NVMe SSD", "Solid State Drives")).specs.storageCapacityGb,
    2000,
  );
});

// ── Tags ─────────────────────────────────────────────────────────────────────

const node = (tags: string[], metafields: any[] = []): any => ({
  id: "gid://shopify/Product/1",
  title: "Vendor Board",
  handle: "vendor-board",
  description: "",
  vendor: "Vendor",
  productType: "Motherboards",
  tags,
  availableForSale: true,
  priceRange: { minVariantPrice: { amount: "1000", currencyCode: "INR" } },
  images: { edges: [] },
  variants: {
    edges: [
      {
        node: {
          id: "gid://shopify/ProductVariant/1",
          availableForSale: true,
          price: { amount: "1000", currencyCode: "INR" },
        },
      },
    ],
  },
  metafields,
});

Deno.test("TAGS: a key:value tag is still shown, but never counts as a stated spec", () => {
  const mapped = mapShopifyProductToCatalog(node(["socket:AM4", "ram_generation:DDR4"]));
  assertEquals(mapped.specs?.socket, "AM4");
  assertEquals(mapped.tagSpecKeys, ["socket", "ram_generation"]);
  const comp = match({ ...mapped, name: "Vendor Board", category: "Motherboards" });
  assertEquals(comp.specs.socket, undefined);
  assertEquals(comp.specs.provenance, "unverified");
  assertEquals(comp.isVerified, false);
});

Deno.test("TAGS: a bare tag doesn't fill a spec", () => {
  const comp = match(
    product("Vendor Board", "Motherboards", {}, { tags: ["am4", "ddr4", "wifi"] }),
  );
  assertEquals(comp.specs.socket, undefined);
  assertEquals(comp.specs.supportedRamGeneration, undefined);
  assertEquals(comp.specs.hasWifi, undefined);
});

Deno.test("TAGS: a metafield with the same key is what counts", () => {
  assertEquals(
    tagSpecKeys(["socket:AM5"], [
      { namespace: "pc_builder", key: "socket", value: "AM4", type: "x" },
    ] as any),
    [],
  );
  const mapped = mapShopifyProductToCatalog(
    node(["socket:AM5"], [{ namespace: "pc_builder", key: "socket", value: "AM4", type: "x" }]),
  );
  const comp = match({ ...mapped, name: "Vendor Board", category: "Motherboards" });
  assertEquals(comp.specs.socket, "AM4");
  assertEquals(comp.specs.provenance, "supplier_spec");
});

Deno.test("TAGS: a pc_builder value wins over another namespace, whatever the order", () => {
  const custom = { namespace: "custom", key: "socket", value: "AM5", type: "x" };
  const builder = { namespace: "pc_builder", key: "socket", value: "AM4", type: "x" };
  assertEquals(parseProductSpecs([], [custom, builder] as any).socket, "AM4");
  assertEquals(parseProductSpecs([], [builder, custom] as any).socket, "AM4");
});

// ── Levels ───────────────────────────────────────────────────────────────────

Deno.test("LEVEL: each source gets its own level, per value", () => {
  const board = match(
    product("B550M DDR4 Motherboard", "Motherboards", { form_factor: "Micro-ATX" }),
  );
  assertEquals(specConfidence(board, "formFactor"), "supplier_provided");
  assertEquals(specConfidence(board, "socket"), "title_inferred");
  assertEquals(specConfidence(board, "ramSlots"), "unknown");
});

Deno.test("LEVEL: a reviewed value with a source is it_hub_reviewed, never manufacturer_verified", () => {
  const board = match(
    product("Vendor Board", "Motherboards", {
      socket: "AM4",
      ...REVIEWED,
      spec_source: "manufacturer_datasheet",
    }),
  );
  assertEquals(specConfidence(board, "socket"), "it_hub_reviewed");
  assertEquals(board.specs.provenance, "it_hub_reviewed");
});

Deno.test("LEVEL: no Shopify input can reach manufacturer_verified", () => {
  const attempts: any[] = [
    { provenance: "manufacturer_verified" },
    { spec_review_status: "manufacturer_verified" },
    { spec_source: "manufacturer_verified" },
    { ...REVIEWED, provenance: "manufacturer_verified", spec_source: "manufacturer_datasheet" },
    { fieldSources: { socket: "manufacturer_verified" } },
  ];
  for (const attempt of attempts) {
    const board = match(product("Vendor Board", "Motherboards", { socket: "AM4", ...attempt }));
    assert(board.specs.provenance !== "manufacturer_verified", JSON.stringify(attempt));
    assert(specConfidence(board, "socket") !== "manufacturer_verified", JSON.stringify(attempt));
  }
  const tagged = match(
    product(
      "Vendor Board",
      "Motherboards",
      { socket: "AM4" },
      { tags: ["manufacturer_verified", "verified"] },
    ),
  );
  assert(specConfidence(tagged, "socket") !== "manufacturer_verified");
});

Deno.test("LEVEL: reviewed with no valid source stays supplier-provided, and is listed", () => {
  for (const url of [undefined, "", "not a link", "http://insecure.example.com/x", "ftp://x.y/z"]) {
    const board = match(
      product("Vendor Board", "Motherboards", {
        socket: "AM4",
        spec_review_status: "reviewed",
        ...(url === undefined ? {} : { spec_source_url: url }),
      }),
    );
    assertEquals(specConfidence(board, "socket"), "supplier_provided", String(url));
    assert(
      board.specs.specProblems.some((p: any) => p.field === "spec_source_url"),
      String(url),
    );
  }
});

Deno.test("LEVEL: an unknown review status counts as unreviewed", () => {
  assertEquals(
    readSpecReview({ spec_review_status: "approved", spec_source_url: "https://x.y/z" }).isReviewed,
    false,
  );
  assertEquals(readSpecReview({}).status, "unreviewed");
});

Deno.test("LEVEL: rejected values are ignored, and the title still counts", () => {
  const board = match(
    product("B550M DDR4 Motherboard", "Motherboards", {
      socket: "AM5",
      form_factor: "ATX",
      spec_review_status: "rejected",
    }),
  );
  assertEquals(board.specs.socket, "AM4");
  assertEquals(specConfidence(board, "socket"), "title_inferred");
  assertEquals(board.specs.formFactor, undefined);
  assertEquals(board.specs.specProblems, undefined);
  assertEquals(board.isVerified, false);
});

Deno.test("LEVEL: a chip table's figure is inferred, whatever else is stated", () => {
  const card = match(
    product("Maker RTX 4060 Card", "Video Cards", { gpu_length_mm: "250", ...REVIEWED }),
  );
  assertEquals(specConfidence(card, "powerWatts"), "title_inferred");
  assertEquals(specConfidence(card, "recommendedPsuWatts"), "title_inferred");
  assertEquals(specConfidence(card, "lengthMm"), "it_hub_reviewed");
});

Deno.test("LEVEL: a stated card figure can differ from the chip's, without a conflict", () => {
  const card = match(
    product("Maker RTX 4060 OC Card", "Video Cards", {
      watts: "130",
      recommended_psu_watts: "500",
    }),
  );
  assertEquals(card.specs.powerWatts, 130);
  assertEquals(card.specs.recommendedPsuWatts, 500);
  assertEquals(card.specs.specProblems, undefined);
});

// ── Conflicts ────────────────────────────────────────────────────────────────

const conflict = (comp: any, field: string) =>
  comp.specs.specProblems?.find((p: any) => p.kind === "conflict" && p.field === field);

Deno.test("CONFLICT: a field against the title leaves the value unknown", () => {
  const psu = match(
    product("Vendor 750W PSU", "Computer Power Supplies", { capacity_watts: "550" }),
  );
  assertEquals(psu.specs.ratedWattage, undefined);
  assert(conflict(psu, "ratedWattage").detail.includes("550"));
  assert(conflict(psu, "ratedWattage").detail.includes("750"));
  const ram = match(product("Vendor 16GB DDR4 RAM", "RAM", { ram_capacity_gb: "32" }));
  assertEquals(ram.specs.capacityGb, undefined);
  const generation = match(product("Vendor 16GB DDR4 RAM", "RAM", { ram_generation: "DDR5" }));
  assertEquals(generation.specs.ramGeneration, undefined);
  const socket = match(product("B550 Board", "Motherboards", { socket: "AM5" }));
  assertEquals(socket.specs.socket, undefined);
});

Deno.test("CONFLICT: a field agreeing with the title takes the field's level", () => {
  const psu = match(
    product("Vendor 650W PSU", "Computer Power Supplies", { capacity_watts: "650", ...REVIEWED }),
  );
  assertEquals(psu.specs.ratedWattage, 650);
  assertEquals(specConfidence(psu, "ratedWattage"), "it_hub_reviewed");
  assertEquals(psu.specs.specProblems, undefined);
});

Deno.test("CONFLICT: a field against the registry leaves the value unknown", () => {
  const psu = match(
    product("Corsair RM750e 750W 80 Plus Gold Fully Modular PSU", "Computer Power Supplies", {
      capacity_watts: "550",
    }),
  );
  assertEquals(psu.specs.ratedWattage, undefined);
  assert(conflict(psu, "ratedWattage").detail.includes("specification list"));
});

Deno.test("CONFLICT: a field agreeing with the registry changes nothing", () => {
  const cpu = match(
    product("AMD Ryzen 5 5600", "Computer Processors", { socket: "AM4", watts: "65" }),
  );
  assertEquals(cpu.specs.socket, "AM4");
  assertEquals(specConfidence(cpu, "socket"), "manufacturer_verified");
  assertEquals(cpu.specs.specProblems, undefined);
});

Deno.test("CONFLICT: a Shopify field can fill a gap in the registry, at its own level", () => {
  const card = match(
    product("ASRock AMD Radeon RX 7600 Challenger 8GB OC", "Video Cards", {
      pcie_16pin_adapter_8pin_count: "0",
      ...REVIEWED,
    }),
  );
  assertEquals(specConfidence(card, "pcie16PinAdapter8PinCount"), "it_hub_reviewed");
  assertEquals(specConfidence(card, "lengthMm"), "manufacturer_verified");
});

Deno.test("CONFLICT: a reviewed value agreeing with an unconfirmed one confirms it, at its own level", () => {
  const name = "ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge";
  assertEquals(
    specConfidence(match(product(name, "Video Cards", {})), "lengthMm"),
    "supplier_provided",
  );
  // Agreeing without a review changes nothing.
  const unreviewed = match(product(name, "Video Cards", { gpu_length_mm: "222" }));
  assertEquals(specConfidence(unreviewed, "lengthMm"), "supplier_provided");
  const reviewed = match(product(name, "Video Cards", { gpu_length_mm: "222", ...REVIEWED }));
  assertEquals(specConfidence(reviewed, "lengthMm"), "it_hub_reviewed");
  // A review never lifts a value to the maker's level, or lowers one already there.
  const verified = match(
    product("ASRock AMD Radeon RX 7600 Challenger 8GB OC", "Video Cards", {
      gpu_length_mm: "270",
      ...REVIEWED,
    }),
  );
  assertEquals(specConfidence(verified, "lengthMm"), "manufacturer_verified");
});

Deno.test("CONFLICT: a conflict sends the build to review, and doesn't call it incompatible", () => {
  const cpu = match(
    product("Vendor CPU", "Computer Processors", {
      socket: "AM4",
      watts: "65",
      integrated_graphics: "yes",
      includes_cooler: "yes",
    }),
  );
  const psu = match(
    product("Vendor 750W PSU", "Computer Power Supplies", { capacity_watts: "550" }),
  );
  const summary = checkCompatibility({ CPU: cpu, PSU: psu });
  const item = summary.items.find((i: any) => i.ruleId === "RULE_K_SPEC_CONFLICT");
  assert(item, "the conflict should reach the compatibility panel");
  assertEquals(item!.status, "unknown");
  assertEquals(summary.hasBlockingUnknowns, true);
  assert(!summary.items.some((i: any) => i.severity === "error"));
});

Deno.test("CONFLICT: any conflict goes to a technician, even on a value no rule depends on", () => {
  const ram = match(product("Vendor 16GB DDR4 RAM", "RAM", { ram_capacity_gb: "32" }));
  const summary = checkCompatibility({ RAM: ram });
  assert(summary.items.some((i: any) => i.ruleId === "RULE_K_SPEC_CONFLICT"));
  assertEquals(summary.hasBlockingUnknowns, true);
});

Deno.test("CONFLICT: an unreadable value blocks a label, without forcing review by itself", () => {
  const cabinet = match(product("Vendor Case", "Computer Cases", { cabinet_clearance_mm: "wide" }));
  const summary = checkCompatibility({ Cabinet: cabinet });
  const item = summary.items.find((i: any) => i.ruleId === "RULE_K_SPEC_INVALID");
  assert(item);
  assert(
    labelCompatibilityGaps({ Cabinet: cabinet }, summary.items).some((gap: string) =>
      gap.includes("unreadable"),
    ),
  );
  assertEquals(summary.hasBlockingUnknowns, false);
});

// ── What a label needs ───────────────────────────────────────────────────────

const noItems: any[] = [];
const gapsFor = (slot: string, comp: any) => labelCompatibilityGaps({ [slot]: comp }, noItems);

Deno.test("LABEL: only reviewed Shopify values can support a label", () => {
  const fields = { capacity_watts: "650", pcie_connectors: "8-pin" };
  const unreviewed = match(product("Vendor PSU", "Computer Power Supplies", fields));
  assert(
    gapsFor("PSU", unreviewed).some((gap: string) => gap.startsWith("Stated but not reviewed")),
  );
  const reviewed = match(
    product("Vendor PSU", "Computer Power Supplies", { ...fields, ...REVIEWED }),
  );
  assertEquals(gapsFor("PSU", reviewed), []);
});

Deno.test("LABEL: title-read values can't support a label, even when another field is reviewed", () => {
  const board = match(
    product("B550M DDR4 Motherboard", "Motherboards", { form_factor: "ATX", ...REVIEWED }),
  );
  const gaps = gapsFor("Motherboard", board);
  assert(
    gaps.some(
      (gap: string) => gap.startsWith("Read from the product title") && gap.includes("socket"),
    ),
  );
});

Deno.test("LABEL: a missing critical value blocks a label, even if no rule looks at it", () => {
  const card = match(
    product("Vendor Card", "Video Cards", {
      watts: "200",
      gpu_length_mm: "300",
      pcie_connectors: "8-pin",
      ...REVIEWED,
    }),
  );
  assert(
    gapsFor("GPU", card).some(
      (gap: string) => gap.startsWith("Not stated") && gap.includes("recommended power supply"),
    ),
  );
});

Deno.test("LABEL: a reviewed value and the registry can both support a label", () => {
  const cpu = match(product("Intel Core i5-12400F", "Computer Processors"));
  assertEquals(gapsFor("CPU", cpu), []);
});

// ── Decision 5: budget first ─────────────────────────────────────────────────

const REGISTRY_BUILD = () => [
  product(
    "AMD Ryzen 5 5600",
    "Computer Processors",
    {},
    { id: "c", variantId: "gid://shopify/ProductVariant/c", price: 9000 },
  ),
  product(
    "ASUS Prime B550M-A WiFi II Motherboard",
    "Motherboards",
    {},
    { id: "m", variantId: "gid://shopify/ProductVariant/m", price: 9000 },
  ),
  product(
    "Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
    "RAM",
    {},
    { id: "r", variantId: "gid://shopify/ProductVariant/r", price: 3000 },
  ),
  product(
    "Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD",
    "Solid State Drives",
    {},
    { id: "s", variantId: "gid://shopify/ProductVariant/s", price: 5000 },
  ),
  product(
    "Corsair RM750e 750W 80 Plus Gold Fully Modular PSU",
    "Computer Power Supplies",
    {},
    { id: "p", variantId: "gid://shopify/ProductVariant/p", price: 8000 },
  ),
  product(
    "Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case",
    "Computer Cases",
    {},
    { id: "k", variantId: "gid://shopify/ProductVariant/k", price: 3900 },
  ),
  product(
    "ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge",
    "Video Cards",
    {},
    { id: "g", variantId: "gid://shopify/ProductVariant/g", price: 28000 },
  ),
];
const cheap = (name: string, category: string, price: number, specs: any = {}) =>
  product(name, category, specs, {
    id: name,
    variantId: `gid://shopify/ProductVariant/${name}`,
    price,
  });
const GAMING = { purpose: "gaming", details: {}, budgetId: "x", brands: [], wifi: "", owned: [] };
const WIDE = { min: 30000, max: 300000 };

Deno.test("BUDGET: a cheaper unconfirmed part isn't replaced by a dearer confirmed one", () => {
  const catalog = syncBuilderCatalogWithShopify([
    ...REGISTRY_BUILD(),
    cheap("Vendor Cheap 1TB NVMe SSD", "Solid State Drives", 1000),
  ]).componentCatalog;
  const [build] = generateDynamicCatalogRecommendations(catalog, GAMING, WIDE, {
    allowUnverified: true,
  });
  assertEquals(build.parts.Storage.name, "Vendor Cheap 1TB NVMe SSD");
  assertEquals(build.price, 61900);
  assert(
    build.rankingReasons.some((reason: string) =>
      reason.includes("interface of Vendor Cheap 1TB NVMe SSD"),
    ),
  );
});

Deno.test("BUDGET: a cheaper option needing review is offered beside one that doesn't", () => {
  const catalog = syncBuilderCatalogWithShopify([
    ...REGISTRY_BUILD(),
    cheap("Vendor Plain Motherboard", "Motherboards", 4000),
  ]).componentCatalog;
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, WIDE, {
    allowUnverified: true,
  });
  const review = recs.find((r: any) => r.requiresReview);
  const passing = recs.find((r: any) => !r.requiresReview);
  assertEquals(review?.parts.Motherboard.name, "Vendor Plain Motherboard");
  assertEquals(passing?.parts.Motherboard.name, "ASUS Prime B550M-A WiFi II Motherboard");
  assert(review!.price < passing!.price);
});

Deno.test("BUDGET: a dearer option needing review adds nothing, and isn't shown", () => {
  const catalog = syncBuilderCatalogWithShopify([
    ...REGISTRY_BUILD(),
    cheap("Vendor Plain Motherboard", "Motherboards", 15000),
  ]).componentCatalog;
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, WIDE, {
    allowUnverified: true,
  });
  assert(
    recs.every((r: any) => !r.requiresReview),
    JSON.stringify(recs.map((r: any) => r.parts.Motherboard.name)),
  );
});

Deno.test("BUDGET: a cheaper adequate power supply is chosen over a dearer exact-fit one", () => {
  const psu = (name: string, price: number, watts: string) =>
    cheap(name, "Computer Power Supplies", price, {
      capacity_watts: watts,
      pcie_connectors: "8-pin",
    });
  const catalog = syncBuilderCatalogWithShopify([
    ...REGISTRY_BUILD().filter((p) => !p.name.includes("RM750e")),
    psu("Vendor 650W PSU", 7000, "650"),
    psu("Vendor 850W PSU", 5000, "850"),
  ]).componentCatalog;
  const [build] = generateDynamicCatalogRecommendations(catalog, GAMING, WIDE, {
    allowUnverified: true,
  });
  assertEquals(build.parts.PSU.name, "Vendor 850W PSU");
});

Deno.test("BUDGET: an unstated power supply is offered as a separate, cheaper review option", () => {
  const catalog = syncBuilderCatalogWithShopify([
    ...REGISTRY_BUILD(),
    cheap("Vendor Unstated Power Supply", "Computer Power Supplies", 1000),
  ]).componentCatalog;
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, WIDE, {
    allowUnverified: true,
  });
  assertEquals(
    recs.find((r: any) => r.requiresReview)?.parts.PSU.name,
    "Vendor Unstated Power Supply",
  );
  assertEquals(
    recs.find((r: any) => !r.requiresReview)?.parts.PSU.name,
    "Corsair RM750e 750W 80 Plus Gold Fully Modular PSU",
  );
});

// ── The schema itself ────────────────────────────────────────────────────────

const shopifySource = await Deno.readTextFile(
  new URL("../../../src/lib/shopify.ts", import.meta.url),
);

Deno.test("SCHEMA: every public field is requested from Shopify", () => {
  for (const field of PC_BUILDER_METAFIELDS.filter((f: any) => f.storefront === "public")) {
    assert(shopifySource.includes(`{ namespace: "pc_builder", key: "${field.key}" }`), field.key);
  }
});

Deno.test("SCHEMA: the reviewer's name is never requested", () => {
  assert(!shopifySource.includes("spec_reviewed_by"));
  assertEquals(
    PC_BUILDER_METAFIELDS.find((f: any) => f.key === "spec_reviewed_by")?.storefront,
    "none",
  );
});

Deno.test("SCHEMA: every integer has a range, and every choice a list", () => {
  for (const field of PC_BUILDER_METAFIELDS) {
    if (field.type === "number_integer") {
      assert(field.min !== undefined && field.max !== undefined, field.key);
      assertEquals(parseIntegerValue(field.key, String(field.max + 1)), undefined, field.key);
    }
  }
  assert(readStatedSpecs("CPU", { socket: "AM9" }).problems.length > 0);
  assert(sameSpecValue(["ATX", "Micro-ATX"], ["micro-atx", "atx"]));
});

// ── Admin audit comparison (no network) ──────────────────────────────────────

const validDefinition = (field: any) => ({
  namespace: "pc_builder",
  key: field.key,
  type: field.type,
  storefrontAccess: field.storefront === "public" ? "PUBLIC_READ" : "NONE",
  validations: [
    ...(field.min !== undefined ? [{ name: "min", value: String(field.min) }] : []),
    ...(field.max !== undefined ? [{ name: "max", value: String(field.max) }] : []),
    ...(field.maxLength !== undefined ? [{ name: "max", value: String(field.maxLength) }] : []),
    ...(field.choices ? [{ name: "choices", value: JSON.stringify(field.choices) }] : []),
  ],
});

Deno.test("ADMIN AUDIT: nothing defined means everything is missing", () => {
  const findings = compareDefinitions([]);
  assertEquals(findings.length, PC_BUILDER_DEFINITIONS_TO_CREATE.length);
  assert(findings.every((f: any) => f.status === "missing"));
});

Deno.test("ADMIN AUDIT: a full match is reported as such", () => {
  const findings = compareDefinitions(PC_BUILDER_METAFIELDS.map(validDefinition));
  assert(
    findings.every((f: any) => f.status === "matches"),
    JSON.stringify(findings.filter((f: any) => f.status !== "matches")),
  );
});

Deno.test("ADMIN AUDIT: differences are named", () => {
  const defs = PC_BUILDER_METAFIELDS.map(validDefinition);
  const change = (key: string, patch: any) => {
    const i = defs.findIndex((d: any) => d.key === key);
    defs[i] = { ...defs[i], ...patch };
  };
  change("capacity_watts", { type: "single_line_text_field" });
  change("socket", { storefrontAccess: "NONE" });
  change("gpu_length_mm", {
    validations: [
      { name: "min", value: "1" },
      { name: "max", value: "500" },
    ],
  });
  change("form_factor", { validations: [{ name: "choices", value: '["ATX"]' }] });
  defs.push({
    namespace: "pc_builder",
    key: "old_field",
    type: "boolean",
    storefrontAccess: "NONE",
    validations: [],
  });
  defs.push({
    namespace: "other",
    key: "ignored",
    type: "boolean",
    storefrontAccess: "NONE",
    validations: [],
  });
  const findings = compareDefinitions(defs);
  const status = (key: string) => findings.find((f: any) => f.key === key)?.status;
  assertEquals(status("capacity_watts"), "wrong_type");
  assertEquals(status("socket"), "wrong_access");
  assertEquals(status("gpu_length_mm"), "different_validation");
  assertEquals(status("form_factor"), "different_validation");
  assertEquals(status("old_field"), "unexpected");
  assertEquals(status("ignored"), undefined);
});

Deno.test("POWER: a processor's maximum can be stated in Shopify, at its own level", () => {
  const cpu = match(
    product("Vendor CPU", "Computer Processors", {
      socket: "AM5",
      watts: "65",
      cpu_max_power_watts: "88",
      ...REVIEWED,
    }),
  );
  assertEquals(cpu.specs.maxTurboPowerWatts, 88);
  assertEquals(specConfidence(cpu, "maxTurboPowerWatts"), "it_hub_reviewed");
  const unreviewed = match(
    product("Vendor CPU", "Computer Processors", { cpu_max_power_watts: "88" }),
  );
  assertEquals(specConfidence(unreviewed, "maxTurboPowerWatts"), "supplier_provided");
  // A registry figure and a Shopify figure that disagree aren't settled by either side.
  const conflict = match(
    product("Intel Core i5-14600K", "Computer Processors", { cpu_max_power_watts: "150" }),
  );
  assertEquals(conflict.specs.maxTurboPowerWatts, undefined);
  assert(conflict.specs.specProblems.some((p: any) => p.field === "maxTurboPowerWatts"));
});

Deno.test("POWER: the catalogue query asks Shopify for a processor's maximum", async () => {
  const query = await Deno.readTextFile(new URL("../../../src/lib/shopify.ts", import.meta.url));
  assert(query.includes('{ namespace: "pc_builder", key: "cpu_max_power_watts" }'));
});

Deno.test("LEVEL: IT HUB's review can complete a part, but it never becomes the maker's word", () => {
  const card = match(
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", "Video Cards", {
      gpu_length_mm: "222",
      pcie_connectors: "1x 8-pin",
      ...REVIEWED,
    }),
  );
  assertEquals(card.specs.provenance, "it_hub_reviewed");
  // Only part of it reviewed leaves the part unconfirmed.
  const partial = match(
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", "Video Cards", {
      gpu_length_mm: "222",
      ...REVIEWED,
    }),
  );
  assertEquals(partial.specs.provenance, "registry_unverified");
});

Deno.test("SCHEMA: an adapter can take the four 8-pin plugs high-end cards ask for", () => {
  const card = match(
    product("Vendor RTX 5090 Card", "Video Cards", { pcie_16pin_adapter_8pin_count: "4" }),
  );
  assertEquals(card.specs.pcie16PinAdapter8PinCount, 4);
});
