// PC Builder specification integrity: a product gets verified specifications only when it really is
// that model, and only from the same kind of part. Anything Shopify doesn't state stays unknown.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectComponentSlot,
  matchShopifyProductToComponent,
  VERIFIED_HARDWARE_SPECS,
} from "../../../src/lib/builder/catalog.ts";
import { checkCompatibility } from "../../../src/lib/builder/compatibility.ts";

function product(name: string, extra: Record<string, unknown> = {}) {
  return {
    id: `id-${name}`,
    name,
    price: 1000,
    brand: "",
    category: "",
    productType: "",
    tags: [],
    variantId: "gid://shopify/ProductVariant/1",
    availableForSale: true,
    stock: 1,
    specs: {},
    ...extra,
  } as any;
}

const SANDISK =
  "SANDISK Optimus™ 5100 NVMe™ SSD, 500GB, Upto 6600MB/s R, 5600MB/s W, 5Y Warranty, PCIe Gen 4 NVMe M.2 2280 Gaming Storage Internal Solid State Drive";
const ANT_PSU = "Ant Esports VS400L Value Series Power Supply";
const ZEBRONICS = "Zebronics Zeb Twoface New Premium Gaming Mini Cabinet-White";

const CATEGORY_FIELDS = {
  cpu: ["socket", "tdpWatts", "hasIntegratedGraphics", "supportedRamGen"],
  cabinet: ["supportedMotherboards", "maxGpuLengthMm", "maxCoolerHeightMm", "includedFanCount"],
  psu: ["ratedWattage", "efficiencyRating", "psuFormFactor"],
};

function assertNoFields(specs: Record<string, unknown>, fields: string[]) {
  for (const field of fields) assertEquals(specs[field], undefined, `unexpected ${field}`);
}

// ── The two reported faults ───────────────────────────────────────────────────────────────────

Deno.test("SPEC: an SSD's 5600MB/s doesn't make it a Ryzen 5 5600", () => {
  const comp = matchShopifyProductToComponent(
    product(SANDISK, { category: "Solid State Drives" }),
  )!;
  assertEquals(comp.slot, "Storage");
  assertEquals(comp.matchedModelKey, undefined);
  assertNotEquals(comp.specs.provenance, "manufacturer_verified");
  assertNoFields(comp.specs as any, CATEGORY_FIELDS.cpu);
  assertEquals(comp.specs.includesCooler, false);
  // The title does state the interface, so that much is known.
  assertEquals(comp.specs.storageInterface, "M.2 NVMe");
});

Deno.test("SPEC: a real Ryzen 5 5600 keeps its verified specifications", () => {
  const comp = matchShopifyProductToComponent(product("AMD Ryzen 5 5600"))!;
  assertEquals(comp.slot, "CPU");
  assertEquals(comp.matchedModelKey, "cpu-r5-5600");
  assertEquals(comp.specs.provenance, "manufacturer_verified");
  assertEquals(comp.specs.socket, "AM4");
  assertEquals(comp.specs.tdpWatts, 65);
});

Deno.test("SPEC: an Ant Esports power supply gets no cabinet specifications", () => {
  const comp = matchShopifyProductToComponent(
    product(ANT_PSU, { category: "Computer Power Supplies" }),
  )!;
  assertEquals(comp.slot, "PSU");
  assertEquals(comp.matchedModelKey, undefined);
  assertNoFields(comp.specs as any, CATEGORY_FIELDS.cabinet);
});

Deno.test("SPEC: an unstated PSU wattage stays unknown, and the build says so", () => {
  const comp = matchShopifyProductToComponent(product(ANT_PSU))!;
  assertEquals(comp.specs.ratedWattage, undefined);
  assertEquals(comp.specs.provenance, "unverified");
  assertEquals(comp.isVerified, false);

  const report = checkCompatibility({ PSU: comp } as any);
  assert(report.items.some((item: any) => item.ruleId === "RULE_E_PSU_WATTAGE_UNKNOWN"));
  assertEquals(report.powerHeadroomStatus, "unknown");
  assertEquals(report.hasBlockingUnknowns, true);
});

Deno.test("SPEC: a build is only called compatible when nothing is unknown", () => {
  const titles: Record<string, string> = {
    CPU: "AMD Ryzen 5 5600",
    Motherboard: "ASUS Prime B550M-A WiFi II Motherboard",
    RAM: "Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
    GPU: "ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge",
    Storage: "Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD",
    PSU: "Deepcool PK650D 650W 80 Plus Bronze Power Supply",
    Cabinet: "Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case",
    Cooler: "Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler",
  };
  const build = (overrides: Record<string, string> = {}) =>
    Object.fromEntries(
      Object.entries({ ...titles, ...overrides }).map(([slot, name]) => [
        slot,
        matchShopifyProductToComponent(product(name))!,
      ]),
    ) as any;

  assertEquals(checkCompatibility(build()).status, "compatible");
  assertEquals(checkCompatibility(build({ PSU: ANT_PSU })).status, "unknown");
  // A cabinet stating nothing leaves physical fit unknown, which is as final as a socket if it's wrong.
  assertEquals(checkCompatibility(build({ Cabinet: ZEBRONICS })).status, "unknown");
});

Deno.test("SPEC: the builder's badges follow that status, not just the absence of errors", () => {
  const page = Deno.readTextFileSync("src/pages/Builder.tsx");
  assert(page.includes("const { result, watts, recommended, valid, complete, summary } ="));
  assertEquals(page.split('summary.status === "compatible"').length - 1, 5);
  assertEquals(page.split('"Needs checking"').length - 1, 2);
  assert(page.includes('"Specifications unverified"'));
  assert(!page.includes('{checks.valid ? "Compatible" : "Needs attention"}'));
  assert(!page.includes('complete ? "Compatible" : "In progress"'));
});

// ── Cabinets ──────────────────────────────────────────────────────────────────────────────────

Deno.test("SPEC: the named Ant Esports cabinet keeps its entry, unconfirmed because no page was found", () => {
  const comp = matchShopifyProductToComponent(product("Ant Esports ICE-100 Air Mini Mesh Case"))!;
  assertEquals(comp.slot, "Cabinet");
  assertEquals(comp.matchedModelKey, "case-matx");
  assertEquals(comp.specs.provenance, "registry_unverified");
  assertEquals(comp.specs.maxGpuLengthMm, 310);
});

Deno.test("SPEC: sharing a brand doesn't give a cabinet another model's specifications", () => {
  const comp = matchShopifyProductToComponent(product("Ant Esports ICE-200TG Cabinet"))!;
  assertEquals(comp.slot, "Cabinet");
  assertEquals(comp.matchedModelKey, undefined);
  assertEquals(comp.specs.maxGpuLengthMm, undefined);
});

Deno.test("SPEC: a cabinet with no stated dimensions stays unknown", () => {
  const comp = matchShopifyProductToComponent(
    product(ZEBRONICS, { category: "Desktop Computer & Server Cases" }),
  )!;
  assertEquals(comp.slot, "Cabinet");
  assertEquals(comp.specs.provenance, "unverified");
  assertNoFields(comp.specs as any, CATEGORY_FIELDS.cabinet);
});

// ── Words and numbers that overlap ────────────────────────────────────────────────────────────

Deno.test("SPEC: 'ant' is never found inside another word", () => {
  for (const name of [
    "Gigantic ATX Cabinet With Warranty",
    "Elegant Mesh Cabinet",
    "ASUS B450 Motherboard 3 Year Warranty",
  ]) {
    const comp = matchShopifyProductToComponent(product(name))!;
    assertNotEquals(comp.matchedModelKey, "case-matx", name);
  }
});

Deno.test("SPEC: the same number can mean different models in different categories", () => {
  const cases: [string, string][] = [
    ["AMD Ryzen 5 7600", "cpu-r5-7600"],
    ["ASRock Radeon RX 7600 Challenger 8GB OC", "gpu-rx7600"],
    ["Zotac GeForce RTX 4060 Twin Edge", "gpu-rtx4060"],
  ];
  for (const [name, key] of cases) {
    assertEquals(matchShopifyProductToComponent(product(name))!.matchedModelKey, key, name);
  }
});

Deno.test("SPEC: a similar but different model isn't treated as a match", () => {
  const notThisEntry: [string, string][] = [
    ["Zotac GeForce RTX 4060 Ti", "gpu-rtx4060"],
    ["AMD Ryzen 5 7600X", "cpu-r5-7600"],
    ["AMD Ryzen 5 5600G", "cpu-r5-5600"],
    ["AMD Ryzen 5 5600X", "cpu-r5-5600"],
    ["Intel Core i5-12400 Processor", "cpu-i5-12400f"],
    ["Intel Core i5-14600 Processor", "cpu-i5-14600k"],
  ];
  for (const [name, key] of notThisEntry) {
    assertNotEquals(matchShopifyProductToComponent(product(name))!.matchedModelKey, key, name);
  }
});

Deno.test("SPEC: SSD speeds never become a CPU socket or a cooler", () => {
  for (const speed of ["12400", "13400", "14400", "5600", "7600"]) {
    const comp = matchShopifyProductToComponent(product(`Fast NVMe SSD ${speed}MB/s`))!;
    assertEquals(comp.slot, "Storage", speed);
    assertEquals(comp.matchedModelKey, undefined, speed);
    assertEquals(comp.specs.socket, undefined, speed);
    assertEquals(comp.specs.ramGeneration, undefined, speed);
    assertEquals(comp.specs.includesCooler, false, speed);
  }
});

Deno.test("SPEC: a graphics card's GDDR memory isn't a system RAM generation", () => {
  const comp = matchShopifyProductToComponent(product("Generic Graphics Card 8GB GDDR5"))!;
  assertEquals(comp.slot, "GPU");
  assertEquals(comp.specs.ramGeneration, undefined);
  assertEquals(comp.specs.supportedRamGeneration, undefined);
});

Deno.test("SPEC: an SSD's DRAM cache isn't a system RAM generation", () => {
  const comp = matchShopifyProductToComponent(
    product("Fast SSD With DDR4 Cache", { productType: "Solid State Drive" }),
  )!;
  assertEquals(comp.slot, "Storage");
  assertEquals(comp.specs.ramGeneration, undefined);
  assertEquals(comp.specs.supportedRamGeneration, undefined);
});

Deno.test("SPEC: GDDR isn't read as DDR, even on a part that uses a RAM generation", () => {
  const comp = matchShopifyProductToComponent(product("Mystery Chip With GDDR5 Graphics"), "CPU")!;
  assertEquals(comp.specs.ramGeneration, undefined);

  const gddr4 = matchShopifyProductToComponent(product("Mystery Chip With GDDR4 Graphics"), "CPU")!;
  assertEquals(gddr4.specs.ramGeneration, undefined);
});

Deno.test("SPEC: a CPU's model number doesn't give another part a stock cooler", () => {
  for (const name of ["Storage 5600 NVMe SSD", "Storage 12400 NVMe SSD"]) {
    const comp = matchShopifyProductToComponent(product(name))!;
    assertEquals(comp.slot, "Storage", name);
    assertEquals(comp.specs.includesCooler, false, name);
  }
});

// ── A capacity or speed doesn't identify a model ──────────────────────────────────────────────

Deno.test("SPEC: a wattage alone doesn't make a power supply a verified Deepcool", () => {
  const comp = matchShopifyProductToComponent(product("Cooler Master 650W Power Supply"))!;
  assertEquals(comp.slot, "PSU");
  assertEquals(comp.matchedModelKey, undefined);
  assertEquals(comp.specs.efficiencyRating, undefined);
  assertNotEquals(comp.specs.provenance, "manufacturer_verified");
  // The title states the wattage, so it's known, but it stays marked as read from the title.
  assertEquals(comp.specs.ratedWattage, 650);
  assertEquals(comp.specs.provenance, "title_derived");
});

Deno.test("SPEC: a capacity alone doesn't identify an SSD or a RAM kit", () => {
  const ssd = matchShopifyProductToComponent(product("Samsung 980 1TB NVMe SSD"))!;
  assertEquals(ssd.matchedModelKey, undefined);
  assertNotEquals(ssd.specs.provenance, "manufacturer_verified");

  const ram = matchShopifyProductToComponent(product("16GB DDR4 Desktop RAM"))!;
  assertEquals(ram.slot, "RAM");
  assertEquals(ram.matchedModelKey, undefined);
  assertNotEquals(ram.specs.provenance, "manufacturer_verified");
  assertEquals(ram.specs.ramGeneration, "DDR4");
  assertEquals(ram.specs.speedMhz, undefined);
});

// ── Provenance ────────────────────────────────────────────────────────────────────────────────

Deno.test("SPEC: every registry entry still matches its own product title", () => {
  for (const [key, entry] of Object.entries(VERIFIED_HARDWARE_SPECS)) {
    const comp = matchShopifyProductToComponent(product(entry.title))!;
    assert(comp, `${key} wasn't classified`);
    assertEquals(comp.matchedModelKey, key, entry.title);
    assert(
      comp.specs.provenance === "manufacturer_verified" ||
        comp.specs.provenance === "registry_unverified",
      entry.title,
    );
    // Only evidence for the values a label rests on makes a part verified, not its place on the list.
    assertEquals(comp.isVerified, comp.specs.provenance === "manufacturer_verified", entry.title);
  }
});

Deno.test("SPEC: no alias can give a product another category's specifications", () => {
  const prefixes: Record<string, string> = {
    CPU: "cpu",
    Motherboard: "mobo",
    RAM: "ram",
    GPU: "gpu",
    Storage: "ssd",
    PSU: "psu",
    Cabinet: "case",
    Cooler: "cooler",
    Monitor: "monitor",
  };
  for (const entry of Object.values(VERIFIED_HARDWARE_SPECS)) {
    for (const alias of entry.aliases || []) {
      for (const [slot, prefix] of Object.entries(prefixes)) {
        const comp = matchShopifyProductToComponent(product(`Part ${alias} Item`), slot as any)!;
        if (comp.matchedModelKey) {
          assert(
            comp.matchedModelKey.startsWith(`${prefix}-`),
            `"${alias}" gave ${slot} the specifications of ${comp.matchedModelKey}`,
          );
        }
      }
    }
  }
});

Deno.test("SPEC: only a registry match is ever labelled manufacturer_verified", () => {
  for (const name of [SANDISK, ANT_PSU, ZEBRONICS, "Unknown Brand B999 Motherboard DDR5"]) {
    const comp = matchShopifyProductToComponent(product(name))!;
    assertNotEquals(comp.specs.provenance, "manufacturer_verified", name);
    assertEquals(comp.matchedModelKey, undefined, name);
  }
});

Deno.test("SPEC: values from Shopify metafields are used, as a supplier's claim", () => {
  const psu = matchShopifyProductToComponent(
    product(ANT_PSU, { specs: { capacity_watts: "400" } }),
  )!;
  assertEquals(psu.specs.ratedWattage, 400);
  assertEquals(psu.specs.provenance, "supplier_spec");

  const cabinet = matchShopifyProductToComponent(
    product(ZEBRONICS, { specs: { cabinet_clearance_mm: "270" } }),
  )!;
  assertEquals(cabinet.specs.maxGpuLengthMm, 270);
  assertEquals(cabinet.specs.provenance, "supplier_spec");

  const gpu = matchShopifyProductToComponent(
    product("Generic Graphics Card", { specs: { gpu_length_mm: "240" } }),
  )!;
  assertEquals(gpu.specs.lengthMm, 240);
});

Deno.test("SPEC: a metafield for another category is ignored", () => {
  const ssd = matchShopifyProductToComponent(
    product("Fast NVMe SSD", {
      specs: { capacity_watts: "650", socket: "AM5", gpu_length_mm: "300" },
    }),
  )!;
  assertEquals(ssd.specs.ratedWattage, undefined);
  assertEquals(ssd.specs.socket, undefined);
  assertEquals(ssd.specs.lengthMm, undefined);
});

Deno.test("SPEC: a part with nothing stated falls back to unknown, not to a guess", () => {
  const comp = matchShopifyProductToComponent(
    product("Mystery Part", { productType: "Processor", tags: ["cpu"] }),
  )!;
  assertEquals(comp.isVerified, false);
  assertEquals(comp.specs.provenance, "unverified");
  assertEquals(comp.specs.socket, undefined);
  assertEquals(comp.specs.tdpWatts, undefined);
  assertEquals(comp.matchedModelKey, undefined);
});

Deno.test("SPEC: products that aren't PC parts stay out of the builder", () => {
  assertEquals(detectComponentSlot("iPhone 15 Blue 128GB"), null);
  assertEquals(matchShopifyProductToComponent(product("iPhone 15 Blue 128GB")), null);
});
