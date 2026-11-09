// supabase/functions/tests/pc-builder-workflow.test.ts
// The PC Builder's path from a Shopify product to a selection, a compatibility verdict and a
// quotation. Selections go through compatibility() here because that's what the customer's screen
// runs, and most of these rules used to be unreachable on that path.

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const {
  buildBuilderCatalog,
  detectComponentSlot,
  matchShopifyProductToComponent,
  reconcileBuildParts,
  syncBuilderCatalogWithShopify,
  toComponentOption,
} = await import("../../../src/lib/builder/catalog.ts");
const { compatibility } = await import("../../../src/lib/builder/compatibility.ts");
const { generateDynamicCatalogRecommendations, getBudgetShortfallInfo } =
  await import("../../../src/lib/builder/recommendations.ts");
const { generateWhatsAppQuotation } = await import("../../../src/lib/builder/checkout.ts");
const { submitQuotationRequest } = await import("../../../src/lib/builder/persistence.ts");
const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");

let nextId = 1;
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
const option = (name: string, extra: Record<string, unknown> = {}) =>
  toComponentOption(matchShopifyProductToComponent(product(name, extra))!);

const VERIFIED = {
  CPU: "AMD Ryzen 5 5600",
  Motherboard: "ASUS Prime B550M-A WiFi II Motherboard",
  RAM: "Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
  GPU: "ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge",
  Storage: "Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD",
  PSU: "Corsair RM750e 750W 80 Plus Gold Fully Modular PSU",
  Cabinet: "Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case",
  Cooler: "Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler",
};
const verifiedParts = (overrides: Record<string, any> = {}) => ({
  ...Object.fromEntries(Object.entries(VERIFIED).map(([slot, name]) => [slot, option(name)])),
  ...overrides,
});
const ruleIds = (parts: Record<string, any>) =>
  compatibility(parts).summary.items.map((item: any) => item.ruleId);
const hasRule = (parts: Record<string, any>, ruleId: string) => ruleIds(parts).includes(ruleId);

// ── Every rule runs on the customer's path, with realistic specifications ───────────────────────

Deno.test("WORKFLOW: a fully specified, matching build is compatible on the customer's path", () => {
  const check = compatibility(verifiedParts());
  assertEquals(check.summary.status, "compatible");
  assertEquals(check.valid, true);
  assertEquals(check.complete, true);
  assertEquals(check.watts, 260);
});

Deno.test("WORKFLOW: CPU and motherboard sockets must match", () => {
  const parts = verifiedParts({ CPU: option("AMD Ryzen 5 7600") });
  assert(hasRule(parts, "RULE_A_SOCKET_MISMATCH"));
  assertEquals(compatibility(parts).valid, false);
});

Deno.test("WORKFLOW: DDR4 memory is refused on a DDR5 motherboard, and by a DDR5 processor", () => {
  const ddr5Board = option("MSI PRO B650M-P Micro-ATX Motherboard");
  const ddr4Kit = option("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz");
  assert(hasRule({ Motherboard: ddr5Board, RAM: ddr4Kit }, "RULE_B_RAM_MISMATCH"));
  assert(hasRule({ CPU: option("AMD Ryzen 5 7600"), RAM: ddr4Kit }, "RULE_B_CPU_RAM_MISMATCH"));
});

Deno.test("WORKFLOW: laptop memory is refused for a desktop", () => {
  const sodimm = option("Crucial 8GB DDR4 3200MHz SO-DIMM Laptop RAM", { category: "RAM" });
  assertEquals(sodimm.specs?.isLaptopSoDimm, true);
  assert(hasRule({ RAM: sodimm }, "RULE_B_RAM_SODIMM_ERROR"));
});

Deno.test("WORKFLOW: SO-DIMM is recognized however the title writes it", () => {
  for (const name of [
    "Crucial 8GB DDR4 SO-DIMM",
    "Crucial 8GB DDR4 SODIMM",
    "Crucial 8GB DDR4 Laptop RAM",
  ]) {
    assertEquals(option(name, { category: "RAM" }).specs?.isLaptopSoDimm, true, name);
  }
  assertEquals(
    option("Crucial 8GB DDR4 Desktop RAM", { category: "RAM" }).specs?.isLaptopSoDimm,
    undefined,
  );
});

Deno.test("WORKFLOW: a memory kit can't exceed the motherboard's slots or capacity", () => {
  const twoSlotBoard = option("MSI B760M Bomber DDR5 Motherboard");
  const bigKit = option("Generic 512GB (8x64GB) DDR5 Desktop RAM", { category: "RAM" });
  assert(hasRule({ Motherboard: twoSlotBoard, RAM: bigKit }, "RULE_B_RAM_SLOTS_EXCEEDED"));
  const limitedBoard = option("MSI MAG Z790 Tomahawk WiFi Motherboard");
  assert(hasRule({ Motherboard: limitedBoard, RAM: bigKit }, "RULE_B_RAM_CAPACITY_EXCEEDED"));
  assert(hasRule(verifiedParts(), "RULE_B_RAM_LIMITS_OK"));
});

Deno.test("WORKFLOW: a cooler must fit the socket and the cabinet", () => {
  const am5Only = option("Cooler Master AM5 CPU Cooler", {
    category: "CPU Coolers",
    specs: { supported_sockets: "AM5", cooler_height_mm: "155" },
  });
  assert(hasRule(verifiedParts({ Cooler: am5Only }), "RULE_C_COOLER_SOCKET_MISMATCH"));

  const tall = option("Noctua Tall CPU Cooler", {
    category: "CPU Coolers",
    specs: { supported_sockets: "AM4,AM5", cooler_height_mm: "170" },
  });
  assert(hasRule(verifiedParts({ Cooler: tall }), "RULE_C_COOLER_HEIGHT_EXCEEDED"));
  assert(hasRule(verifiedParts(), "RULE_C_COOLER_SOCKET_MATCH"));
  assert(hasRule(verifiedParts(), "RULE_C_COOLER_HEIGHT_OK"));
});

Deno.test("WORKFLOW: a long graphics card is refused by a small cabinet", () => {
  const longCard = option("Big Card Graphics Card", {
    category: "Video Cards",
    specs: { gpu_length_mm: "340", recommended_psu_watts: "550", watts: "200" },
  });
  assert(
    hasRule(
      verifiedParts({ GPU: longCard, Cabinet: option("Ant Esports ICE-100 Air Mini Mesh Case") }),
      "RULE_D_GPU_LENGTH_EXCEEDED",
    ),
  );
  assert(hasRule(verifiedParts(), "RULE_D_GPU_CLEARANCE_OK"));
});

Deno.test("WORKFLOW: the power supply is checked against known power draw", () => {
  const small = option("Tiny 200W Power Supply", { category: "Computer Power Supplies" });
  assert(hasRule(verifiedParts({ PSU: small }), "RULE_E_PSU_WATTAGE_DEFICIT"));
  assert(hasRule(verifiedParts(), "RULE_E_PSU_HEADROOM_ADEQUATE"));
});

Deno.test("WORKFLOW: PCIe power cables are compared where the data exists", () => {
  assert(hasRule(verifiedParts(), "RULE_F_PCIE_POWER_MATCH"));
  const dualCable = option("Big Card Graphics Card", {
    category: "Video Cards",
    specs: { watts: "300", pcie_connectors: "8-pin,8-pin" },
  });
  const oneCable = option("Some 750W Power Supply", {
    category: "Computer Power Supplies",
    specs: { pcie_connectors: "8-pin" },
  });
  assert(
    hasRule(verifiedParts({ GPU: dualCable, PSU: oneCable }), "RULE_F_PCIE_POWER_INSUFFICIENT"),
  );
});

Deno.test("WORKFLOW: a motherboard must fit the cabinet, however its size is spelled", () => {
  const atxBoard = option("MSI MAG Z790 Tomahawk WiFi Motherboard");
  const miniCase = option("Ant Esports ICE-100 Air Mini Mesh Case");
  assert(hasRule({ Motherboard: atxBoard, Cabinet: miniCase }, "RULE_G_FORM_FACTOR_MISMATCH"));

  const spelledDifferently = option("Some mATX Motherboard", {
    category: "Motherboards",
    specs: { form_factor: "mATX" },
  });
  assert(
    hasRule({ Motherboard: spelledDifferently, Cabinet: miniCase }, "RULE_G_FORM_FACTOR_MATCH"),
  );
});

Deno.test("WORKFLOW: storage needs a matching connection on the motherboard", () => {
  const noM2 = option("Old Board Motherboard", {
    category: "Motherboards",
    specs: { m2_slots: "0", sata_ports: "4" },
  });
  const noSata = option("Odd Board Motherboard", {
    category: "Motherboards",
    specs: { m2_slots: "1", sata_ports: "0" },
  });
  const nvme = option("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD");
  const sata = option("Samsung 870 EVO 1TB SATA SSD", { category: "Solid State Drives" });
  assert(hasRule({ Motherboard: noM2, Storage: nvme }, "RULE_H_STORAGE_SLOT_MISSING"));
  assert(hasRule({ Motherboard: noSata, Storage: sata }, "RULE_H_STORAGE_PORT_MISSING"));
  assert(hasRule(verifiedParts(), "RULE_H_STORAGE_OK"));
});

Deno.test("WORKFLOW: a processor with no graphics needs a graphics card", () => {
  const parts: Record<string, any> = verifiedParts();
  delete parts.GPU;
  assert(hasRule(parts, "RULE_I_GPU_MANDATORY_NO_IGPU"));
  assertEquals(compatibility(parts).complete, false);
});

// ── Missing specifications are never read as compatible ─────────────────────────────────────────

const UNSTATED = {
  CPU: () => option("Unknown Brand Processor", { category: "Computer Processors" }),
  Motherboard: () => option("Unknown Brand Motherboard", { category: "Motherboards" }),
  RAM: () => option("Unknown Brand Desktop Memory", { category: "Memory" }),
  GPU: () => option("Unknown Brand Graphics Card", { category: "Video Cards" }),
  Storage: () => option("Unknown Brand Drive", { category: "Storage" }),
  PSU: () => option("Unknown Brand Power Unit", { category: "Computer Power Supplies" }),
  Cabinet: () => option("Unknown Brand Cabinet", { category: "Computer Cases" }),
  Cooler: () => option("Unknown Brand CPU Cooler", { category: "CPU Coolers" }),
};

Deno.test("WORKFLOW: each missing specification produces its own warning", () => {
  const expected: [string, Record<string, any>][] = [
    ["RULE_A_SOCKET_UNKNOWN", { CPU: UNSTATED.CPU(), Motherboard: UNSTATED.Motherboard() }],
    ["RULE_B_RAM_UNKNOWN", { Motherboard: UNSTATED.Motherboard(), RAM: UNSTATED.RAM() }],
    ["RULE_B_RAM_LIMITS_UNKNOWN", { Motherboard: UNSTATED.Motherboard(), RAM: UNSTATED.RAM() }],
    ["RULE_C_STOCK_COOLER_UNKNOWN", { CPU: UNSTATED.CPU() }],
    ["RULE_C_COOLER_SOCKET_UNKNOWN", { CPU: UNSTATED.CPU(), Cooler: UNSTATED.Cooler() }],
    [
      "RULE_C_COOLER_HEIGHT_UNKNOWN",
      { CPU: UNSTATED.CPU(), Cooler: UNSTATED.Cooler(), Cabinet: UNSTATED.Cabinet() },
    ],
    ["RULE_D_GPU_CLEARANCE_UNKNOWN", { GPU: UNSTATED.GPU(), Cabinet: UNSTATED.Cabinet() }],
    ["RULE_E_PSU_WATTAGE_UNKNOWN", { PSU: UNSTATED.PSU() }],
    [
      "RULE_G_FORM_FACTOR_UNKNOWN",
      { Motherboard: UNSTATED.Motherboard(), Cabinet: UNSTATED.Cabinet() },
    ],
    [
      "RULE_H_STORAGE_UNKNOWN",
      { Motherboard: UNSTATED.Motherboard(), Storage: UNSTATED.Storage() },
    ],
    ["RULE_I_DISPLAY_OUTPUT_UNKNOWN", { CPU: UNSTATED.CPU() }],
  ];
  for (const [ruleId, parts] of expected) {
    const { summary } = compatibility(parts);
    const item = summary.items.find((row: any) => row.ruleId === ruleId);
    assert(item, ruleId);
    assertEquals(item.status, "unknown", ruleId);
    assertEquals(item.severity, "warning", ruleId);
    assertNotEquals(summary.status, "compatible", ruleId);
  }
});

Deno.test("WORKFLOW: a card with no stated power isn't told it runs from the slot", () => {
  const parts = { GPU: UNSTATED.GPU(), PSU: option("Deepcool PK650D 650W Power Supply") };
  assert(!hasRule(parts, "RULE_F_PCIE_POWER_NOT_REQUIRED"));
  assert(hasRule(parts, "RULE_F_GPU_POWER_UNKNOWN"));
});

Deno.test("WORKFLOW: wattage alone doesn't confirm a power supply's PCIe cables", () => {
  const parts = {
    GPU: option(VERIFIED.GPU),
    PSU: option("Vendor 750W Fully Modular PSU", { category: "Computer Power Supplies" }),
  };
  assert(!ruleIds(parts).includes("RULE_F_PCIE_POWER_ADVISORY"));
  assert(hasRule(parts, "RULE_F_PCIE_CONNECTORS_UNKNOWN"));
});

Deno.test("WORKFLOW: an assumed power draw doesn't confirm a power supply", () => {
  const parts = { CPU: UNSTATED.CPU(), GPU: UNSTATED.GPU(), PSU: option(VERIFIED.PSU) };
  assert(hasRule(parts, "RULE_E_POWER_DRAW_UNKNOWN"));
  assert(!hasRule(parts, "RULE_E_PSU_HEADROOM_ADEQUATE"));
  assert(!hasRule(parts, "RULE_E_PSU_WATTAGE_DEFICIT"));
});

Deno.test("WORKFLOW: an unverified part is reported on the customer's path", () => {
  assert(hasRule({ Cabinet: UNSTATED.Cabinet() }, "RULE_J_SPEC_UNVERIFIED"));
});

Deno.test("WORKFLOW: a capital G in a title isn't integrated graphics", () => {
  const cpu = option("GAMING SERIES Processor", { category: "Computer Processors" });
  assertEquals(cpu.hasIntegratedGraphics, undefined);
  assert(hasRule({ CPU: cpu }, "RULE_I_DISPLAY_OUTPUT_UNKNOWN"));
});

Deno.test("WORKFLOW: unknowns warn, but don't block an unrelated selection", () => {
  const check = compatibility(verifiedParts({ PSU: UNSTATED.PSU(), Cabinet: UNSTATED.Cabinet() }));
  assertEquals(check.valid, true);
  assertEquals(check.complete, true);
  assertEquals(check.summary.status, "unknown");
});

// ── Matching and classification ─────────────────────────────────────────────────────────────────

Deno.test("WORKFLOW: a chipset name doesn't give a motherboard one model's specifications", () => {
  const board = matchShopifyProductToComponent(
    product("B550M DDR4 Motherboard", { category: "Motherboards" }),
  )!;
  assertEquals(board.matchedModelKey, undefined);
  assertNotEquals(board.specs.provenance, "manufacturer_verified");
  assertEquals(board.isVerified, false);
  // What the chipset and title do establish.
  assertEquals(board.specs.socket, "AM4");
  assertEquals(board.specs.supportedRamGeneration, "DDR4");
  // What only one specific model's datasheet could say.
  assertEquals(board.specs.formFactor, undefined);
  assertEquals(board.specs.ramSlots, undefined);
  assertEquals(board.specs.m2SlotCount, undefined);
  assertEquals(board.specs.hasWifi, undefined);
});

Deno.test("WORKFLOW: a chip name gives a graphics card its power draw, and nothing else", () => {
  const card = matchShopifyProductToComponent(
    product("NVIDIA RTX 4060 8GB", { category: "Video Cards & Adapters" }),
  )!;
  assertEquals(card.matchedModelKey, undefined);
  assertNotEquals(card.specs.provenance, "manufacturer_verified");
  assertEquals(card.specs.powerWatts, 115);
  assertEquals(card.specs.lengthMm, undefined);
  assertEquals(card.specs.recommendedPsuWatts, 550);

  const ti = matchShopifyProductToComponent(
    product("NVIDIA RTX 4060 Ti 8GB", { category: "Video Cards & Adapters" }),
  )!;
  assertEquals(ti.specs.powerWatts, undefined);
});

Deno.test("WORKFLOW: a 400W supply goes to a technician for a card whose maker asks for 550W", () => {
  const parts = {
    CPU: option("AMD Ryzen 5 5600"),
    GPU: option("NVIDIA RTX 4060 8GB", { category: "Video Cards & Adapters" }),
    PSU: option("Ant Esports VS400L Value Series Power Supply", {
      category: "Computer Power Supplies",
      specs: { capacity_watts: "400" },
    }),
  };
  assert(hasRule(parts, "RULE_E_PSU_BELOW_RECOMMENDED"));
  assert(!hasRule(parts, "RULE_E_PSU_HEADROOM_ADEQUATE"));
});

Deno.test("WORKFLOW: complete devices and outside storage are never components", () => {
  const cases: [string, string, string[]][] = [
    ["HP Pavilion Ryzen 5 16GB DDR4 512GB NVMe SSD", "Laptops", []],
    ["Lenovo IdeaPad Core i5 Laptop 16GB DDR4", "", []],
    ["vivo v80 8gb 256gb", "Smart Phones", ["storage", "ram"]],
    ["iPhone 15 Clear Case", "Phone Cases", ["case"]],
    ["SanDisk Extreme Portable SSD 1TB", "Solid State Drives", []],
    ["Samsung T7 External SSD 1TB", "", []],
    ["SanDisk 128GB microSD Memory Card", "Memory", ["memory"]],
    ["Symphony Room Air Cooler", "", []],
  ];
  for (const [title, category, tags] of cases) {
    assertEquals(detectComponentSlot(title, "", tags, category), null, title);
  }
});

Deno.test("WORKFLOW: Shopify's own category names are recognized without help from the title", () => {
  const cases: [string, string, string][] = [
    ["Gigabyte Eagle OC 8G", "Video Cards & Adapters", "GPU"],
    ["Ant Esports VS400L", "Computer Power Supplies", "PSU"],
    ["SanDisk Optimus 500", "Solid State Drives", "Storage"],
    ["Seagate Barracuda 1TB", "Internal Hard Drives", "Storage"],
    ["Kingston Fury Beast 16", "RAM", "RAM"],
  ];
  for (const [title, category, slot] of cases) {
    assertEquals(detectComponentSlot(title, "", [], category), slot, title);
  }
});

Deno.test("WORKFLOW: parts are still recognized from their titles", () => {
  const cases: [string, string][] = [
    ["AMD Ryzen 7 5800X Processor", "CPU"],
    ["Samsung 980 NVMe SSD with DDR4 Cache", "Storage"],
    ["Kingston A400 480GB SSD", "Storage"],
    ["Corsair CV550 SMPS", "PSU"],
    ["Crucial 8GB DDR4 3200MHz SO-DIMM Laptop RAM", "RAM"],
    ["Deepcool AK400 CPU Cooler", "Cooler"],
    ["Zebronics Gaming Cabinet", "Cabinet"],
  ];
  for (const [title, slot] of cases) {
    assertEquals(detectComponentSlot(title), slot, title);
  }
});

Deno.test("WORKFLOW: specifications from a title alone still show as unverified", () => {
  const kit = matchShopifyProductToComponent(
    product("16GB DDR4 Desktop RAM", { category: "RAM" }),
  )!;
  assertEquals(kit.specs.ramGeneration, "DDR4");
  assertEquals(kit.specs.capacityGb, 16);
  assertEquals(kit.specs.provenance, "title_derived");
  assertEquals(kit.isVerified, false);

  const stated = matchShopifyProductToComponent(
    product("Ant Esports VS400L Value Series Power Supply", {
      category: "Computer Power Supplies",
      specs: { capacity_watts: "400" },
    }),
  )!;
  assertEquals(stated.specs.ratedWattage, 400);
  // Stating a value doesn't verify the part. It has to be reviewed.
  assertEquals(stated.isVerified, false);
  assertNotEquals(stated.specs.provenance, "manufacturer_verified");
});

Deno.test("WORKFLOW: a kit's total capacity and module count come from its title", () => {
  const specs = (name: string) =>
    matchShopifyProductToComponent(product(name, { category: "RAM" }))!.specs;
  assertEquals(specs("Adata 32GB (2x16GB) DDR5 RAM").capacityGb, 32);
  assertEquals(specs("Adata 32GB (2x16GB) DDR5 RAM").moduleCount, 2);
  assertEquals(specs("Adata 2 x 8GB DDR4 RAM").capacityGb, 16);
  assertEquals(specs("Adata 16GB DDR4 RAM").moduleCount, undefined);
});

// ── Selection, price and availability ───────────────────────────────────────────────────────────

const liveCatalog = (products: any[]) => syncBuilderCatalogWithShopify(products).componentCatalog;

Deno.test("WORKFLOW: sold-out and unpriced products can't be selected", () => {
  const catalog = buildBuilderCatalog([
    product("AMD Ryzen 5 5600", { availableForSale: false, stock: 0 }),
    product("AMD Ryzen 5 7600", { price: 0 }),
    product("Intel Core i5-14600K", { variantId: "" }),
    product("Intel Core i5-12400F"),
  ]);
  assertEquals(
    catalog.CPU.map((c: any) => c.title),
    ["Intel Core i5-12400F"],
  );
});

Deno.test("WORKFLOW: a refreshed catalogue adds, reprices and removes what can be selected", () => {
  const cpu = product("AMD Ryzen 5 5600", { price: 9000 });
  const first = liveCatalog([cpu]);
  assertEquals(first.CPU[0].price, 9000);

  const added = product("AMD Ryzen 5 7600", { price: 18000 });
  const second = liveCatalog([{ ...cpu, price: 9500 }, added]);
  assertEquals(
    second.CPU.map((c: any) => c.price),
    [9500, 18000],
  );

  assertEquals(liveCatalog([added]).CPU.length, 1);
});

Deno.test("WORKFLOW: a saved selection takes its price from the live catalogue", () => {
  const cpu = product("AMD Ryzen 5 5600", { price: 9000 });
  const saved = { CPU: toComponentOption(matchShopifyProductToComponent(cpu)!) };
  const result = reconcileBuildParts(saved, liveCatalog([{ ...cpu, price: 9750 }]));
  assertEquals(result.parts.CPU.price, 9750);
  assertEquals(result.priceChanged, ["CPU"]);
  assertEquals(result.unavailable, []);
});

Deno.test("WORKFLOW: a selection no longer sold is marked unavailable, not silently kept", () => {
  const cpu = product("AMD Ryzen 5 5600", { price: 9000 });
  const other = product("AMD Ryzen 5 7600", { price: 18000 });
  const saved = { CPU: toComponentOption(matchShopifyProductToComponent(cpu)!) };

  const soldOut = reconcileBuildParts(
    saved,
    liveCatalog([{ ...cpu, availableForSale: false }, other]),
  );
  assertEquals(soldOut.unavailable, ["CPU"]);
  assertEquals(soldOut.parts.CPU.stock, 0);
  assertEquals(toCanonicalAvailability(soldOut.parts.CPU), "unavailable");
});

function toCanonicalAvailability(part: any) {
  return compatibility({ CPU: part }).summary
    ? part.stock === 0
      ? "unavailable"
      : "available"
    : "";
}

Deno.test("WORKFLOW: nothing is called unavailable while the catalogue is still loading", () => {
  const saved = { CPU: option("AMD Ryzen 5 5600") };
  const result = reconcileBuildParts(saved, { CPU: [], Motherboard: [] });
  assertEquals(result.unavailable, []);
  assertNotEquals(result.parts.CPU.stock, 0);
});

Deno.test("WORKFLOW: a build saved in the engine's model opens with its names and specs", () => {
  const stored = {
    CPU: matchShopifyProductToComponent(product("AMD Ryzen 5 5600", { price: 9000 }))!,
  };
  const { parts } = reconcileBuildParts(stored, {});
  assertEquals(parts.CPU.name, "AMD Ryzen 5 5600");
  assertEquals(parts.CPU.price, 9000);
  assertEquals(parts.CPU.socket, "AM4");
  assert(
    hasRule({ CPU: parts.CPU, Motherboard: option(VERIFIED.Motherboard) }, "RULE_A_SOCKET_MATCH"),
  );
});

Deno.test("WORKFLOW: replacing or removing a part changes the verdict", () => {
  const parts: Record<string, any> = verifiedParts();
  assertEquals(compatibility(parts).valid, true);

  const replaced = { ...parts, CPU: option("AMD Ryzen 5 7600") };
  assertEquals(compatibility(replaced).valid, false);
  assertEquals(compatibility({ ...replaced, CPU: parts.CPU }).valid, true);

  const removed = { ...parts };
  delete removed.PSU;
  assertEquals(compatibility(removed).complete, false);
  assert(!ruleIds(removed).some((id: string) => id.startsWith("RULE_E")));
});

Deno.test("WORKFLOW: the price follows each product, whatever else is selected", () => {
  const parts = verifiedParts();
  const sum = (selection: Record<string, any>) =>
    Object.values(selection).reduce((total: number, part: any) => total + part.price, 0);
  assertEquals(sum(parts), 8 * 5000);
  assertEquals(
    matchShopifyProductToComponent(product("AMD Ryzen 5 5600", { price: 8999.6 }))!.price,
    9000,
  );
});

// ── Find My PC ──────────────────────────────────────────────────────────────────────────────────

const LIVE_STYLE = [
  product("AMD Ryzen 5 5600", { category: "Computer Processors", price: 9000 }),
  product("B550M DDR4 Motherboard", { category: "Motherboards", price: 7000 }),
  product("16GB DDR4 Desktop RAM", { category: "RAM", price: 3000 }),
  product("NVIDIA RTX 4060 8GB", { category: "Video Cards & Adapters", price: 28000 }),
  product("SANDISK Optimus 5100 NVMe SSD, 500GB, Upto 6600MB/s R, 5600MB/s W", {
    category: "Solid State Drives",
    price: 11000,
  }),
  product("Ant Esports VS400L Value Series Power Supply", {
    category: "Computer Power Supplies",
    price: 1000,
  }),
  product("Zebronics Zeb Twoface Gaming Mini Cabinet", {
    category: "Desktop Computer & Server Cases",
    price: 2100,
  }),
  product("Ant Esports ICE-C400 CPU Air Cooler", {
    category: "CPU Air Coolers & Heat Sinks",
    price: 900,
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

Deno.test("WORKFLOW: a catalogue missing a wattage isn't confirmed, but can still be offered", () => {
  const catalog = liveCatalog(LIVE_STYLE);
  assertEquals(generateDynamicCatalogRecommendations(catalog, GAMING, BAND).length, 0);

  const builds = generateDynamicCatalogRecommendations(catalog, GAMING, BAND, {
    allowUnverified: true,
  });
  assertEquals(builds.length, 1);
  assertEquals(builds[0].requiresReview, true);
  assertEquals(builds[0].confidenceBadge, "review");
  assertEquals(builds[0].price, 61100);
  assertEquals(builds[0].parts.Cooler, undefined);
  assert(builds[0].reviewItems.includes("PSU rated wattage unverified"));
});

Deno.test("WORKFLOW: fully confirmed builds don't ask for review", () => {
  // ZOTAC's page can't be read, so its card needs IT HUB's review before a build counts as confirmed.
  const reviewed = {
    gpu_length_mm: "222",
    pcie_connectors: "1x 8-pin",
    spec_source: "manufacturer_datasheet",
    spec_review_status: "reviewed",
    spec_source_url: "https://www.example.com/datasheet",
    spec_reviewed_on: "2026-11-01",
  };
  const catalog = liveCatalog(
    Object.values(VERIFIED).map((name) =>
      product(name, name === VERIFIED.GPU ? { specs: reviewed } : {}),
    ),
  );
  const [build] = generateDynamicCatalogRecommendations(catalog, GAMING, {
    min: 30000,
    max: 80000,
  });
  assertEquals(build.requiresReview, false);
  assertEquals(build.confidenceBadge, "certified");
});

Deno.test("WORKFLOW: allowing unverified builds never allows an incompatible one", () => {
  const catalog = liveCatalog([
    product("AMD Ryzen 5 7600", { price: 18000 }),
    ...LIVE_STYLE.filter((p) => !p.name.includes("Ryzen")),
  ]);
  const builds = generateDynamicCatalogRecommendations(
    catalog,
    GAMING,
    { min: 30000, max: 150000 },
    {
      allowUnverified: true,
    },
  );
  for (const build of builds) {
    assertEquals(compatibility(build.parts).valid, true);
  }
});

Deno.test("WORKFLOW: a power supply too small for the build is never offered, even for review", () => {
  const catalog = liveCatalog([
    ...LIVE_STYLE.filter((p) => !p.name.includes("VS400L")),
    product("Tiny 200W Power Supply", { category: "Computer Power Supplies", price: 800 }),
  ]);
  const builds = generateDynamicCatalogRecommendations(catalog, GAMING, BAND, {
    allowUnverified: true,
  });
  assertEquals(builds.length, 0);
});

Deno.test("WORKFLOW: a cooler is only added when the processor doesn't come with one", () => {
  const rest = LIVE_STYLE.filter((p) => !p.name.includes("Ryzen"));
  const coolerIn = (cpu: any, products = rest) =>
    generateDynamicCatalogRecommendations(
      liveCatalog([cpu, ...products]),
      GAMING,
      { min: 30000, max: 150000 },
      { allowUnverified: true },
    )[0];

  const included = product("AMD Ryzen 5 5600", { category: "Computer Processors", price: 9000 });
  assertEquals(coolerIn(included).parts.Cooler, undefined);

  const unstated = product("Unknown Brand AM4 Processor", {
    category: "Computer Processors",
    specs: { socket: "AM4", integrated_graphics: "no" },
  });
  assertEquals(coolerIn(unstated).parts.Cooler.name, "Ant Esports ICE-C400 CPU Air Cooler");

  const stated = product("Unknown Brand AM4 Processor", {
    category: "Computer Processors",
    specs: { socket: "AM4", integrated_graphics: "no", includes_cooler: "no" },
  });
  assertEquals(coolerIn(stated).parts.Cooler.name, "Ant Esports ICE-C400 CPU Air Cooler");
  const withoutCoolers = rest.filter((p) => !p.name.includes("Cooler"));
  assertEquals(coolerIn(stated, withoutCoolers), undefined);
  // Unstated, none sold: offered only for review, with the question left open.
  const open = coolerIn(unstated, withoutCoolers);
  assertEquals(open.requiresReview, true);
  assert(open.reviewItems.includes("Bundled CPU cooler unverified"));
});

Deno.test("WORKFLOW: the budget ceiling still applies, with an honest shortfall", () => {
  const catalog = liveCatalog(LIVE_STYLE);
  const low = { min: 40000, max: 60000 };
  const options = { allowUnverified: true };
  assertEquals(generateDynamicCatalogRecommendations(catalog, GAMING, low, options).length, 0);
  const shortfall = getBudgetShortfallInfo(catalog, GAMING, low, options)!;
  assertEquals(shortfall.closestBuild.price, 61100);
  assertEquals(shortfall.shortfallAmount, 1100);
  assertEquals(shortfall.closestBuild.requiresReview, true);
});

Deno.test("WORKFLOW: Find My PC doesn't guess specifications from a title", () => {
  const source = Deno.readTextFileSync("src/lib/builder/recommendations.ts");
  assert(!source.includes('normTitle.includes("5600")'));
  assert(!source.includes('normTitle.includes("g")'));
  assert(!source.includes('cpu.socket || "AM4"'));
  assert(!source.includes("ratedWattage || 550"));
});

// ── The customer's options on screen ────────────────────────────────────────────────────────────

Deno.test("WORKFLOW: Find My PC has no free-text purpose or custom budget", () => {
  const page = Deno.readTextFileSync("src/pages/Builder.tsx");
  for (const removed of [
    "Something Else",
    "Describe your use case",
    "Custom Budget",
    "custom-budget",
    "customBudget",
    "customText",
    'id: "custom"',
  ]) {
    assert(!page.includes(removed), removed);
  }
  for (const purpose of [
    "Gaming",
    "Content Creation",
    "Work / Office",
    "Professional",
    "General Use",
  ]) {
    assert(page.includes(`title: "${purpose}"`), purpose);
  }
  for (const band of ["40-60", "60-80", "80-100", "100-150", "150+"]) {
    assert(page.includes(`id: "${band}"`), band);
  }
});

Deno.test("WORKFLOW: the page doesn't make claims the data can't support", () => {
  const page = Deno.readTextFileSync("src/pages/Builder.tsx");
  assert(!page.includes("Authoritative Shopify products and verified technical specifications"));
  assert(!page.includes('checks.valid ? "All parts checked for compatibility"'));
  assert(
    page.includes(
      "Compatibility cannot be verified because required specifications are unavailable.",
    ),
  );
  assert(!/manufacturer_verified/.test(page));
});

Deno.test("WORKFLOW: product pages make no claim that no data supports", () => {
  const claims: Record<string, string[]> = {
    "src/pages/Products.tsx": [
      "100% inspected",
      "Sealed with full manufacturer warranty",
      "Tested & certified",
      "IT HUB Verified Pre-Owned",
      "multi-point",
      "Multi-point",
      "Verified physical condition photos",
      "verified catalog imagery",
      "Certified Pre-Owned",
      "Serviced & tested",
      '|| "Inspected"',
      "Verified IT HUB pre-owned",
      "Genuine brand-new",
    ],
    "src/pages/Home.tsx": [
      "Certified Pre-Owned",
      "stress-tested",
      "Save up to 50%",
      "VERIFIED SECOND-HAND",
    ],
    "src/pages/Blog.tsx": ["Official manufacturer stock", "IT HUB Certified Service"],
    "src/components/ShopifyOrderDetailsModal.tsx": ["IT HUB warranty applies"],
    "src/components/Layout.tsx": ["Admin prototype"],
    "src/lib/catalog.ts": ["Certified Pre-Owned"],
    "src/lib/builder/compatibility.ts": [
      "free BIOS flashing",
      "technicians inspect",
      "certified ${cpuSocket}",
    ],
    "src/lib/builder/recommendations.ts": ["100% Verified"],
    "src/pages/Builder.tsx": ["official manufacturer datasheets"],
  };
  for (const [file, phrases] of Object.entries(claims)) {
    const source = Deno.readTextFileSync(file);
    for (const phrase of phrases) assert(!source.includes(phrase), `${file}: ${phrase}`);
  }
});

Deno.test("WORKFLOW: saving a new build inserts it, and a saved one updates its own row", () => {
  const page = Deno.readTextFileSync("src/pages/Builder.tsx");
  assertEquals(page.split("userId: currentId ? store.profile?.id : undefined,").length - 1, 2);
  assert(!page.includes("userId: store.profile?.id,"));
});

Deno.test("WORKFLOW: the WhatsApp message doesn't claim a compatibility it didn't confirm", () => {
  const build = (status: string, valid: boolean): any => ({
    name: "Test",
    components: {},
    ownedSlots: [],
    compatibility: { status, valid, estimatedSystemLoadWatts: 260, recommendedPsuWatts: 400 },
  });
  const unknown = decodeURIComponent(
    generateWhatsAppQuotation(build("unknown", true), "91").whatsappUrl,
  );
  assert(!unknown.includes("Verified Compatible"));
  // Stage 4A-5 (the owner's approved wording): a request with an estimate, and the build's own status. With no
  // assessment passed, the message assesses the build itself: here, with no parts, it's Incomplete.
  for (const claim of ["No issues found", "CONFIGURATION QUOTATION", "Compatibility Status"]) {
    assert(!unknown.includes(claim), claim);
  }
  assert(unknown.includes("*IT HUB PC BUILD — QUOTATION REQUEST*"));
  assert(unknown.includes("Build status: Incomplete"));
  assert(
    unknown.includes(
      "Estimate only. IT HUB will check this build before confirming your quotation.",
    ),
  );
  // The page passes its own assessment, so the message says what the screen says.
  const reviewed = generateWhatsAppQuotation(build("unknown", true), "91", {
    assessment: { state: "needs_review" } as any,
  }).message;
  assert(reviewed.includes("Build status: Needs IT HUB review"));
});

Deno.test("WORKFLOW: no made-up WhatsApp number is used when none is configured", () => {
  const url = generateWhatsAppQuotation(
    {
      name: "Test",
      components: {},
      compatibility: { status: "unknown", valid: true },
    } as any,
    "",
  ).whatsappUrl;
  assert(!url.includes("919074000000"));
  assert(url.startsWith("https://wa.me/?text="));
});

// ── Quotation, with Shopify and the database stubbed: nothing is submitted anywhere ─────────────

function quotationHarness(options: { recent?: any[] } = {}) {
  const inserted: any[] = [];
  const supabaseClient = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "user-1", phone: "919800000001" } },
          error: null,
        }),
    },
    rpc: () => Promise.resolve({ data: true, error: null }),
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: () => Promise.resolve({ data: options.recent || [], error: null }),
        insert: (row: any) => {
          inserted.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "build-1" }, error: null }),
            }),
          };
        },
      };
      return query;
    },
  };
  return { inserted, supabaseClient };
}

const variantNode = (title: string, amount: string, availableForSale = true) => ({
  title: "Default Title",
  product: { title },
  price: { amount, currencyCode: "INR" },
  availableForSale,
});

function submit(body: Record<string, unknown>, harness: any, nodes: any[]) {
  return handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { Authorization: "Bearer customer-token", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    {
      supabaseClient: harness.supabaseClient,
      shopifyFetch: () => Promise.resolve({ data: { nodes } }),
    },
  );
}

Deno.test("QUOTE: Shopify's name and price replace what the browser sent", async () => {
  const harness = quotationHarness();
  const res = await submit(
    {
      buildName: "Tampered",
      estimatedPrice: 1,
      parts: {
        CPU: { slot: "CPU", variantId: "v1", title: "Free CPU", name: "Free CPU", price: 1 },
      },
      compatibility: { status: "compatible" },
      customerInfo: { name: "A", phone: "910000000000" },
    },
    harness,
    [variantNode("AMD Ryzen 5 5600", "9000.00")],
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.authoritativePrice, 9000);
  assertEquals(body.technicianReviewRequired, true);

  const row = harness.inserted[0];
  assertEquals(row.parts.CPU.title, "AMD Ryzen 5 5600");
  assertEquals(row.parts.CPU.price, 9000);
  assertEquals(row.estimated_price, 9000);
  assertEquals(row.compatibility.reportedBy, "customer_browser");
  // The verified number, not the one the browser sent.
  assertEquals(row.customer_phone, "919800000001");
});

Deno.test("QUOTE: a part the customer owns isn't priced, and always goes to a technician", async () => {
  const harness = quotationHarness();
  const res = await submit(
    {
      estimatedPrice: 9000,
      parts: {
        CPU: { slot: "CPU", variantId: "v1", title: "CPU", price: 9000 },
        GPU: { slot: "GPU", variantId: "v2", title: "GPU", price: 28000, owned: true },
      },
      compatibility: { status: "compatible" },
      customerInfo: {},
    },
    harness,
    [variantNode("AMD Ryzen 5 5600", "9000.00")],
  );
  const body = await res.json();
  assertEquals(body.authoritativePrice, 9000);
  assertEquals(body.priceDivergence, 0);
  // The browser says the build is compatible and the part is owned. Neither can be taken on trust.
  assertEquals(body.technicianReviewRequired, true);
  assertEquals(harness.inserted[0].parts.GPU.owned, true);
});

Deno.test("QUOTE: a sold-out part stops the quotation and nothing is stored", async () => {
  const harness = quotationHarness();
  const res = await submit(
    {
      estimatedPrice: 9000,
      parts: { CPU: { slot: "CPU", variantId: "v1", title: "CPU", price: 9000 } },
      compatibility: {},
      customerInfo: {},
    },
    harness,
    [variantNode("AMD Ryzen 5 5600", "9000.00", false)],
  );
  const body = await res.json();
  assertEquals(res.status, 409);
  assertEquals(body.success, false);
  assertEquals(body.unavailableParts, ["CPU"]);
  assertEquals(harness.inserted.length, 0);
});

Deno.test("QUOTE: a repeat of a recent request returns the same reference", async () => {
  const parts = { CPU: { slot: "CPU", variantId: "v1", title: "CPU", price: 9000 } };
  const harness = quotationHarness({
    recent: [
      {
        id: "build-0",
        reference_id: "ITH-PC-EXISTING",
        parts,
        estimated_price: 9000,
        authoritative_price: 9000,
      },
    ],
  });
  const res = await submit(
    { estimatedPrice: 9000, parts, compatibility: {}, customerInfo: {} },
    harness,
    [variantNode("AMD Ryzen 5 5600", "9000.00")],
  );
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.duplicate, true);
  assertEquals(body.referenceId, "ITH-PC-EXISTING");
  assertEquals(harness.inserted.length, 0);
});

Deno.test("QUOTE: a different build isn't treated as a repeat", async () => {
  const harness = quotationHarness({
    recent: [
      {
        id: "build-0",
        reference_id: "ITH-PC-EXISTING",
        parts: { CPU: { variantId: "other" } },
        estimated_price: 5,
        authoritative_price: 5,
      },
    ],
  });
  const res = await submit(
    {
      estimatedPrice: 9000,
      parts: { CPU: { slot: "CPU", variantId: "v1", title: "CPU", price: 9000 } },
      compatibility: {},
      customerInfo: {},
    },
    harness,
    [variantNode("AMD Ryzen 5 5600", "9000.00")],
  );
  assertNotEquals((await res.json()).referenceId, "ITH-PC-EXISTING");
  assertEquals(harness.inserted.length, 1);
});

Deno.test("QUOTE: the browser marks owned parts in what it sends", async () => {
  let sent: any;
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    functions: {
      invoke: (_name: string, options: any) => {
        sent = options.body;
        return Promise.resolve({
          data: { success: true, referenceId: "ITH-PC-1", authoritativePrice: 9000 },
          error: null,
        });
      },
    },
  };
  const build: any = {
    name: "Test",
    components: {
      CPU: { title: "CPU", productId: "p1", variantId: "v1", price: 9000, specs: {} },
      GPU: { title: "GPU", productId: "p2", variantId: "v2", price: 28000, specs: {} },
    },
    ownedSlots: ["GPU"],
    compatibility: { valid: true },
  };
  const result = await submitQuotationRequest(build, {}, { supabaseClient: client });
  assertEquals(result.success, true);
  assertEquals(sent.parts.GPU.owned, true);
  assertEquals(sent.parts.CPU.owned, undefined);
  assertEquals(sent.estimatedPrice, 9000);
});

// ── Stage 0.5: the search reaches the whole catalogue ───────────────────────────────────────────

// A review that holds up. Tests about searching or pricing use it, so that review doesn't decide them.
const REVIEWED = {
  spec_source: "manufacturer_datasheet",
  spec_review_status: "reviewed",
  spec_source_url: "https://www.example.com/datasheet",
  spec_reviewed_on: "2026-11-01",
};
const statedCpu = (name: string, price: number) =>
  product(name, {
    category: "Computer Processors",
    price,
    specs: {
      socket: "AM4",
      watts: "65",
      integrated_graphics: "no",
      includes_cooler: "yes",
      ...REVIEWED,
    },
  });
const statedGpu = (name: string, price: number, watts = "120") =>
  product(name, {
    category: "Video Cards",
    price,
    specs: {
      watts,
      gpu_length_mm: "250",
      recommended_psu_watts: "550",
      pcie_connectors: "8-pin",
      ...REVIEWED,
    },
  });
const am4Parts = () => [
  product("ASUS Prime B550M-A WiFi II Motherboard", { price: 9000 }),
  product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
  product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
  product("Deepcool PK650D 650W 80 Plus Bronze Power Supply", { price: 4500 }),
  product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
];
const offered = (recs: any[], slot: string) => recs.map((r) => r.parts[slot]?.name);

Deno.test("STAGE05: a large budget reaches the dearer processors and graphics cards", () => {
  const catalog = liveCatalog([
    ...am4Parts(),
    ...[8000, 12000, 16000, 30000, 45000, 60000].map((p) => statedCpu(`Vendor ${p} Processor`, p)),
    ...[15000, 25000, 40000, 60000, 90000, 120000].map((p) => statedGpu(`Maker ${p} Card`, p)),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 150000, max: 300000 });
  assert(offered(recs, "GPU").includes("Maker 120000 Card"), offered(recs, "GPU").join());
  assert(offered(recs, "CPU").includes("Vendor 60000 Processor"), offered(recs, "CPU").join());
  // A customer on a small budget still gets the cheapest build.
  const small = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 60000 });
  assert(small.length > 0);
  assert(small.every((r: any) => r.price <= 60000));
});

Deno.test("STAGE05: a part dearer than the whole budget doesn't use up the search", () => {
  const catalog = liveCatalog([
    ...am4Parts(),
    statedCpu("Vendor Value Processor", 8000),
    ...[15000, 18000, 20000].map((p) => statedGpu(`Maker ${p} Card`, p)),
    ...[200000, 250000, 300000, 350000, 400000, 450000].map((p) => statedGpu(`Maker ${p} Card`, p)),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 60000 });
  // Spreading over every card would step past this one on the way to cards nobody here can afford.
  assert(offered(recs, "GPU").includes("Maker 18000 Card"), offered(recs, "GPU").join());
  assert(recs.every((r: any) => r.price <= 60000));
});

Deno.test("STAGE05: spreading across prices keeps preferred brands first", () => {
  const catalog = liveCatalog([
    ...am4Parts(),
    statedGpu("Maker Budget Card", 15000),
    statedCpu("Other Brand Processor", 8000),
    statedCpu("AMD Pick Processor", 30000),
  ]);
  const recs = generateDynamicCatalogRecommendations(
    catalog,
    { ...GAMING, brands: ["AMD"] },
    { min: 30000, max: 100000 },
  );
  assert(offered(recs, "CPU").includes("AMD Pick Processor"));
});

Deno.test("STAGE05: a cheap cabinet that doesn't fit doesn't end the search", () => {
  const atxBuild = [
    product("Intel Core i5-14600K", { price: 28000 }),
    product("MSI MAG Z790 Tomahawk WiFi Motherboard", { price: 20000 }),
    product("Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36", { price: 9000 }),
    product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
    product("Deepcool PK650D 650W 80 Plus Bronze Power Supply", { price: 4500 }),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
    product("Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler", { price: 1800 }),
    product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
  ];
  const band = { min: 60000, max: 200000 };
  const [alone] = generateDynamicCatalogRecommendations(liveCatalog(atxBuild), GAMING, band);
  const withSmallCase = generateDynamicCatalogRecommendations(
    liveCatalog([...atxBuild, product("Ant Esports ICE-100 Air Mini Mesh Case", { price: 2000 })]),
    GAMING,
    band,
  );
  assertEquals(withSmallCase.length, 1);
  assertEquals(withSmallCase[0].parts.Cabinet.name, alone.parts.Cabinet.name);
});

Deno.test("STAGE05: the cheapest cabinet is still used when it fits", () => {
  const parts = am4Parts();
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      ...parts,
      statedCpu("Vendor Value Processor", 8000),
      statedGpu("Maker Budget Card", 15000),
      product("Ant Esports ICE-100 Air Mini Mesh Case", { price: 2000 }),
    ]),
    GAMING,
    { min: 30000, max: 100000 },
  );
  assertEquals(recs[0].parts.Cabinet.name, "Ant Esports ICE-100 Air Mini Mesh Case");
});

Deno.test("STAGE05: a cooler too tall for the cabinet is passed over for one that fits", () => {
  const coolerCpu = product("Vendor Coolerless Processor", {
    category: "Computer Processors",
    price: 9000,
    specs: {
      socket: "AM4",
      watts: "65",
      integrated_graphics: "yes",
      includes_cooler: "no",
      ...REVIEWED,
    },
  });
  const tall = product("Tall Cheap CPU Cooler", {
    category: "CPU Coolers",
    price: 500,
    specs: { supported_sockets: "AM4", cooler_height_mm: "200", ...REVIEWED },
  });
  const short = product("Short CPU Cooler", {
    category: "CPU Coolers",
    price: 1500,
    specs: { supported_sockets: "AM4", cooler_height_mm: "120", ...REVIEWED },
  });
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([...am4Parts(), coolerCpu, statedGpu("Maker Budget Card", 15000), tall, short]),
    GAMING,
    { min: 30000, max: 100000 },
  );
  assertEquals(offered(recs, "Cooler"), ["Short CPU Cooler"]);
});

Deno.test("STAGE05: a drive the motherboard can't connect is passed over", () => {
  const noM2 = product("Old Board Motherboard", {
    category: "Motherboards",
    price: 5000,
    specs: {
      socket: "AM4",
      ram_generation: "DDR4",
      form_factor: "ATX",
      ram_slots: "4",
      max_ram_gb: "128",
      m2_slots: "0",
      sata_ports: "4",
      ...REVIEWED,
    },
  });
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      noM2,
      product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
      product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
      product("Samsung 870 EVO 500GB SATA SSD", {
        category: "Solid State Drives",
        price: 4000,
        specs: { storage_interface: "SATA SSD", ...REVIEWED },
      }),
      product("Deepcool PK650D 650W 80 Plus Bronze Power Supply", { price: 4500 }),
      product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
      statedCpu("Vendor Value Processor", 8000),
      statedGpu("Maker Budget Card", 15000),
    ]),
    GAMING,
    { min: 30000, max: 100000 },
  );
  assertEquals(offered(recs, "Storage"), ["Samsung 870 EVO 500GB SATA SSD"]);
});

Deno.test("STAGE05: graphics cards sharing their first words stay separate models", () => {
  const catalog = liveCatalog([
    ...am4Parts(),
    statedCpu("Vendor Value Processor", 8000),
    statedGpu("NVIDIA RTX 3050 6GB", 15000),
    statedGpu("NVIDIA RTX 4060 8GB", 28000),
    statedGpu("NVIDIA RTX 4070 12GB", 50000),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 200000 });
  assertEquals(recs.length, 3);
  assertEquals(new Set(offered(recs, "GPU")).size, 3);
});

Deno.test("STAGE05: the same card listed twice isn't offered as two tiers", () => {
  const catalog = liveCatalog([
    ...am4Parts(),
    statedCpu("Vendor Value Processor", 8000),
    statedGpu("NVIDIA RTX 3050 6GB", 15000),
    statedGpu("NVIDIA RTX 3050 6GB", 15500),
  ]);
  const recs = generateDynamicCatalogRecommendations(catalog, GAMING, { min: 30000, max: 200000 });
  assertEquals(recs.length, 1);
});

Deno.test("STAGE05: the power supply meets the graphics card maker's recommendation", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      product("AMD Ryzen 5 5600", { price: 9000 }),
      ...am4Parts().filter((p) => !p.name.includes("PK650D")),
      product("NVIDIA RTX 4060 8GB", { category: "Video Cards", price: 28000 }),
      product("Value 450W Power Supply", { category: "Computer Power Supplies", price: 2000 }),
      product("Value 650W Power Supply", { category: "Computer Power Supplies", price: 3000 }),
    ]),
    GAMING,
    { min: 30000, max: 200000 },
    { allowUnverified: true },
  );
  assertEquals(recs[0].parts.PSU.name, "Value 650W Power Supply");
  const check = compatibility(recs[0].parts);
  assert(!check.summary.items.some((i: any) => i.ruleId === "RULE_E_PSU_HEADROOM_LIMITED"));
});

Deno.test("STAGE05: the search and the rules use one power calculation", () => {
  const source = Deno.readTextFileSync("src/lib/builder/recommendations.ts");
  assert(source.includes("calculateSystemPower("));
  assert(!source.includes("Math.max(450"));
  assert(!source.includes("gpu.tdpWatts || 160"));
});

Deno.test("STAGE05: a power supply that lacks the cables is passed over", () => {
  const dualCable = product("Big Maker Card", {
    category: "Video Cards",
    price: 40000,
    specs: {
      watts: "300",
      gpu_length_mm: "250",
      recommended_psu_watts: "550",
      pcie_connectors: "8-pin,8-pin",
      ...REVIEWED,
    },
  });
  const oneCable = product("Small 750W Power Supply", {
    category: "Computer Power Supplies",
    price: 3000,
    specs: { capacity_watts: "750", pcie_connectors: "8-pin", ...REVIEWED },
  });
  const twoCables = product("Large 850W Power Supply", {
    category: "Computer Power Supplies",
    price: 6000,
    specs: { capacity_watts: "850", pcie_connectors: "8-pin,8-pin", ...REVIEWED },
  });
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      ...am4Parts().filter((p) => !p.name.includes("PK650D")),
      statedCpu("Vendor Value Processor", 8000),
      dualCable,
      oneCable,
      twoCables,
    ]),
    GAMING,
    { min: 30000, max: 200000 },
  );
  assertEquals(offered(recs, "PSU"), ["Large 850W Power Supply"]);
});

Deno.test("STAGE05: no fitting part in a slot still means no build", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      product("Intel Core i5-14600K", { price: 28000 }),
      product("MSI MAG Z790 Tomahawk WiFi Motherboard", { price: 20000 }),
      product("Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36", { price: 9000 }),
      product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
      product("Deepcool PK650D 650W 80 Plus Bronze Power Supply", { price: 4500 }),
      product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
      product("Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler", { price: 1800 }),
      product("Ant Esports ICE-100 Air Mini Mesh Case", { price: 2000 }),
    ]),
    GAMING,
    { min: 60000, max: 200000 },
    { allowUnverified: true },
  );
  assertEquals(recs.length, 0);
});

Deno.test("STAGE05: a title naming the other memory generation isn't the verified model", () => {
  const board = matchShopifyProductToComponent(product("MSI B760M Bomber DDR4 Motherboard"))!;
  assertEquals(board.matchedModelKey, undefined);
  assertNotEquals(board.specs.provenance, "manufacturer_verified");
  assertEquals(board.specs.supportedRamGeneration, "DDR4");
  assertEquals(board.specs.socket, "LGA1700");
  assertEquals(board.specs.ramSlots, undefined);

  const same = matchShopifyProductToComponent(product("MSI B760M Bomber DDR5 Motherboard"))!;
  assertEquals(same.matchedModelKey, "mobo-b760m");
  // No official page for this exact model was found, so its entry stays unconfirmed.
  assertEquals(same.specs.provenance, "registry_unverified");

  const kit = matchShopifyProductToComponent(
    product("Corsair Vengeance LPX 16GB (2x8GB) DDR5", { category: "RAM" }),
  )!;
  assertEquals(kit.matchedModelKey, undefined);
  assertEquals(kit.specs.ramGeneration, "DDR5");
});

Deno.test("STAGE05: a product can't declare itself manufacturer verified", () => {
  for (const claim of ["manufacturer_verified", "verified_manufacturer", "verified_technician"]) {
    const unstated = matchShopifyProductToComponent(
      product("Unknown Brand Cabinet", {
        category: "Computer Cases",
        specs: { provenance: claim },
      }),
    )!;
    assertEquals(unstated.specs.provenance, "unverified", claim);

    const stated = matchShopifyProductToComponent(
      product("Unknown Brand 500W Power Supply", {
        category: "Computer Power Supplies",
        specs: { provenance: claim, capacity_watts: "500" },
      }),
    )!;
    assertEquals(stated.specs.provenance, "supplier_spec", claim);
  }
});

Deno.test("STAGE05: only a stated resolution is claimed", () => {
  const catalog = liveCatalog([
    ...am4Parts(),
    statedCpu("Vendor Value Processor", 8000),
    statedGpu("Maker Budget Card", 15000),
  ]);
  const band = { min: 30000, max: 100000 };
  const [plain] = generateDynamicCatalogRecommendations(catalog, GAMING, band);
  assertEquals(plain.designedFor, "Gaming & Everyday Use");
  const [stated] = generateDynamicCatalogRecommendations(
    catalog,
    { ...GAMING, details: { resolution: "1440p" } },
    band,
  );
  // A requested resolution is noted, never promised.
  assertEquals(stated.designedFor, "Gaming & Everyday Use");
  assert(stated.purposeNotes.some((note: string) => note.includes("You asked for 1440p")));
});

Deno.test("STAGE05: a build with no graphics card isn't presented as a gaming PC", () => {
  const [build] = generateDynamicCatalogRecommendations(
    liveCatalog([
      product("AMD Ryzen 5 7600", { price: 18000 }),
      product("MSI PRO B650M-P Micro-ATX Motherboard", { price: 10000 }),
      product("Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36", { price: 9000 }),
      ...am4Parts().slice(2),
    ]),
    GAMING,
    { min: 30000, max: 200000 },
  );
  assertEquals(build.parts.GPU, undefined);
  assertEquals(build.designedFor, "Everyday use, with integrated graphics");
  assertEquals(build.highlights.join(" ").includes("power consumption"), false);
  assertEquals(build.highlights.join(" ").includes("smooth responsiveness"), false);
  assert(build.highlights.includes("The processor's integrated graphics"));
});

Deno.test("STAGE05: the page doesn't praise a balance nothing has measured", () => {
  const page = Deno.readTextFileSync("src/pages/Builder.tsx");
  assert(!page.includes("Balanced CPU + GPU combination"));
  assert(!page.includes("keeps cost and power low"));
  assert(!page.includes("Suitable for"));
});

const reviewFlag = async (compatibilityValue: unknown) => {
  const harness = quotationHarness();
  const res = await submit(
    {
      estimatedPrice: 9000,
      parts: { CPU: { slot: "CPU", variantId: "v1", title: "CPU", price: 9000 } },
      compatibility: compatibilityValue,
      customerInfo: {},
    },
    harness,
    [variantNode("AMD Ryzen 5 5600", "9000.00")],
  );
  const body = await res.json();
  assertEquals(harness.inserted[0].technician_review_required, body.technicianReviewRequired);
  return body.technicianReviewRequired;
};

Deno.test("QUOTE: anything short of confirmed compatibility goes to a technician", async () => {
  assertEquals(await reviewFlag({ status: "compatible" }), false);
  assertEquals(await reviewFlag({ status: "conditional" }), true);
  assertEquals(await reviewFlag({ status: "unknown" }), true);
  assertEquals(await reviewFlag({ status: "incompatible" }), true);
  assertEquals(await reviewFlag({}), true);
  assertEquals(await reviewFlag(undefined), true);
});

Deno.test("QUOTE: a repeat request keeps the original review flag", async () => {
  const parts = { CPU: { slot: "CPU", variantId: "v1", title: "CPU", price: 9000 } };
  const harness = quotationHarness({
    recent: [
      {
        id: "build-0",
        reference_id: "ITH-PC-EXISTING",
        parts,
        estimated_price: 9000,
        authoritative_price: 9000,
        technician_review_required: true,
      },
    ],
  });
  const res = await submit(
    { estimatedPrice: 9000, parts, compatibility: { status: "compatible" }, customerInfo: {} },
    harness,
    [variantNode("AMD Ryzen 5 5600", "9000.00")],
  );
  assertEquals((await res.json()).technicianReviewRequired, true);
});

Deno.test("PORTAL: the review flag isn't described as only a price problem", () => {
  const modal = Deno.readTextFileSync("ITHUB_ADMIN/src/components/QuotationDetailModal.tsx");
  assert(modal.includes("Technician Review Required"));
  assert(!modal.includes("Technician Price Review Required"));
  assert(modal.includes("Compatibility isn't confirmed"));
  assert(modal.includes("{divergence > 100 && ("));
  const list = Deno.readTextFileSync("ITHUB_ADMIN/src/pages/Quotations.tsx");
  assert(!list.includes("Price Review Flagged"));
  const dashboard = Deno.readTextFileSync("ITHUB_ADMIN/src/pages/Dashboard.tsx");
  assert(!dashboard.includes(">Price Review<"));
});

Deno.test("STAGE05: allowing unverified builds still refuses a kit the board can't hold", () => {
  const recs = generateDynamicCatalogRecommendations(
    liveCatalog([
      product("Intel Core i5-14600K", { price: 28000 }),
      product("MSI B760M Bomber DDR5 Motherboard", { price: 10000 }),
      product("Generic 64GB (4x16GB) DDR5 Desktop RAM", { category: "RAM", price: 12000 }),
      product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
      product("Deepcool PK650D 650W 80 Plus Bronze Power Supply", { price: 4500 }),
      product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
      product("Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler", { price: 1800 }),
      product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
    ]),
    GAMING,
    { min: 60000, max: 200000 },
    { allowUnverified: true },
  );
  assertEquals(recs.length, 0);
});
