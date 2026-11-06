// Stage 2 Phase 3: the engine and every report read one list of the values compatibility rules need.
// Every part here is made up, and no PC listing is real stock. In memory, with no network and no writes.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const {
  buildInputsMissing,
  checkCompatibility,
  checkInputsMissing,
  compatibility,
  inputsNeededByPart,
  labelCompatibilityGaps,
  reportedItems,
} = await import("../../../src/lib/builder/compatibility.ts");
const { generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");
const { buildSpecReport, formatSpecReport } =
  await import("../../../src/lib/builder/spec-report.ts");

type Specs = Record<string, unknown>;

const TITLES: Record<string, string> = {
  CPU: "QZX Processor",
  Motherboard: "QZX Board",
  RAM: "QZX Memory",
  GPU: "QZX Card",
  Storage: "QZX Drive",
  PSU: "QZX Supply",
  Cabinet: "QZX Enclosure",
  Cooler: "QZX Tower",
};

const COMPLETE: Record<string, Specs> = {
  CPU: {
    socket: "AM4",
    tdpWatts: 65,
    maxTurboPowerWatts: 76,
    hasIntegratedGraphics: false,
    includesCooler: false,
  },
  Motherboard: {
    socket: "AM4",
    supportedRamGeneration: "DDR4",
    formFactor: "Micro-ATX",
    ramSlots: 4,
    maxRamCapacityGb: 128,
    m2SlotCount: 2,
    sataPortCount: 4,
  },
  RAM: { ramGeneration: "DDR4", isLaptopSoDimm: false, moduleCount: 2, capacityGb: 16 },
  GPU: {
    powerWatts: 115,
    recommendedPsuWatts: 450,
    lengthMm: 250,
    pcie6Plus2Required: 1,
    pcie16PinRequired: 0,
  },
  Storage: { storageInterface: "M.2 NVMe" },
  PSU: { ratedWattage: 650, pcie6Plus2Count: 2, pcie16PinCount: 0 },
  Cabinet: {
    supportedMotherboards: ["Micro-ATX"],
    maxGpuLengthMm: 300,
    maxCoolerHeightMm: 160,
  },
  Cooler: { supportedSockets: ["AM4"], coolerHeightMm: 150 },
};

const part = (slot: string, specs: Specs): any => ({
  slot,
  productId: slot,
  variantId: slot,
  title: TITLES[slot],
  price: 1000,
  currency: "INR",
  specs: { provenance: "it_hub_reviewed", ...specs },
  availability: "available",
  quantity: 1,
  retrievedAt: "2026-11-05T00:00:00Z",
  isShopifyLive: true,
  isVerified: true,
});

/** A complete build, with some of its values changed. `undefined` blanks a value, and `null` drops the part. */
const buildWith = (changes: Record<string, Specs | null> = {}) => {
  const parts: Record<string, any> = {};
  for (const [slot, specs] of Object.entries(COMPLETE)) {
    if (changes[slot] === null) continue;
    const merged: Specs = { ...specs, ...(changes[slot] || {}) };
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
    parts[slot] = part(slot, merged);
  }
  return parts;
};

const names = (inputs: any[]) => inputs.map(({ slot, name }) => `${slot}: ${name}`);
const report = (parts: any, options: any = {}): any => checkCompatibility(parts, options);
const ruleOf = (summary: any, ruleId: string) =>
  summary.items.find((item: any) => item.ruleId === ruleId);
const unknownIds = (summary: any) =>
  summary.items.filter((i: any) => i.status === "unknown").map((i: any) => i.ruleId);

Deno.test("INPUT: a complete build has nothing missing, and the engine agrees", () => {
  const parts = buildWith();
  assertEquals(names(buildInputsMissing(parts)), []);
  const summary = report(parts);
  assertEquals(summary.status, "compatible");
  assertEquals(unknownIds(summary), []);
  for (const item of summary.items) assertEquals(item.missingInputs, undefined);
});

// ── Each value, present and absent, with the rule that reads it ──────────────────────────────────

/** Limited headroom is the only time a processor's maximum power is read. */
const LIMITED: Record<string, Specs> = {
  GPU: { recommendedPsuWatts: 350 },
  PSU: { ratedWattage: 360 },
};

const TABLE: {
  slot: string;
  name: string;
  blank: Specs;
  rule: string;
  base?: Record<string, Specs | null>;
}[] = [
  { slot: "CPU", name: "socket", blank: { socket: undefined }, rule: "RULE_A_SOCKET_UNKNOWN" },
  {
    slot: "Motherboard",
    name: "socket",
    blank: { socket: undefined },
    rule: "RULE_A_SOCKET_UNKNOWN",
  },
  {
    slot: "RAM",
    name: "module type",
    blank: { isLaptopSoDimm: undefined },
    rule: "RULE_B_RAM_TYPE_UNKNOWN",
  },
  {
    slot: "Motherboard",
    name: "memory generation",
    blank: { supportedRamGeneration: undefined },
    rule: "RULE_B_RAM_UNKNOWN",
  },
  {
    slot: "RAM",
    name: "memory generation",
    blank: { ramGeneration: undefined },
    rule: "RULE_B_RAM_UNKNOWN",
  },
  {
    slot: "RAM",
    name: "module count",
    blank: { moduleCount: undefined },
    rule: "RULE_B_RAM_LIMITS_UNKNOWN",
  },
  {
    slot: "RAM",
    name: "capacity",
    blank: { capacityGb: undefined },
    rule: "RULE_B_RAM_LIMITS_UNKNOWN",
  },
  {
    slot: "Motherboard",
    name: "memory slots",
    blank: { ramSlots: undefined },
    rule: "RULE_B_RAM_LIMITS_UNKNOWN",
  },
  {
    slot: "Motherboard",
    name: "memory limit",
    blank: { maxRamCapacityGb: undefined },
    rule: "RULE_B_RAM_LIMITS_UNKNOWN",
  },
  {
    slot: "CPU",
    name: "included cooler",
    blank: { includesCooler: undefined },
    rule: "RULE_C_STOCK_COOLER_UNKNOWN",
    base: { Cooler: null },
  },
  {
    slot: "Cooler",
    name: "supported sockets",
    blank: { supportedSockets: undefined },
    rule: "RULE_C_COOLER_SOCKET_UNKNOWN",
  },
  {
    slot: "Cooler",
    name: "height",
    blank: { coolerHeightMm: undefined },
    rule: "RULE_C_COOLER_HEIGHT_UNKNOWN",
  },
  {
    slot: "Cabinet",
    name: "cooler height limit",
    blank: { maxCoolerHeightMm: undefined },
    rule: "RULE_C_COOLER_HEIGHT_UNKNOWN",
  },
  {
    slot: "GPU",
    name: "length",
    blank: { lengthMm: undefined },
    rule: "RULE_D_GPU_CLEARANCE_UNKNOWN",
  },
  {
    slot: "Cabinet",
    name: "graphics card clearance",
    blank: { maxGpuLengthMm: undefined },
    rule: "RULE_D_GPU_CLEARANCE_UNKNOWN",
  },
  {
    slot: "PSU",
    name: "wattage",
    blank: { ratedWattage: undefined },
    rule: "RULE_E_PSU_WATTAGE_UNKNOWN",
  },
  {
    slot: "CPU",
    name: "power draw",
    blank: { tdpWatts: undefined },
    rule: "RULE_E_POWER_DRAW_UNKNOWN",
  },
  {
    slot: "CPU",
    name: "maximum power",
    blank: { maxTurboPowerWatts: undefined },
    rule: "RULE_E_CPU_PEAK_UNKNOWN",
    base: LIMITED,
  },
  {
    slot: "GPU",
    name: "recommended power supply",
    blank: { recommendedPsuWatts: undefined },
    rule: "RULE_E_RECOMMENDED_UNKNOWN",
  },
  {
    slot: "GPU",
    name: "power draw",
    blank: { powerWatts: undefined },
    rule: "RULE_E_POWER_DRAW_UNKNOWN",
  },
  {
    slot: "GPU",
    name: "power connectors",
    blank: { pcie6Plus2Required: undefined, pcie16PinRequired: undefined },
    rule: "RULE_F_GPU_CONNECTORS_UNKNOWN",
  },
  {
    slot: "PSU",
    name: "power connectors",
    blank: { pcie6Plus2Count: undefined, pcie16PinCount: undefined },
    rule: "RULE_F_PCIE_CONNECTORS_UNKNOWN",
  },
  {
    slot: "Motherboard",
    name: "form factor",
    blank: { formFactor: undefined },
    rule: "RULE_G_FORM_FACTOR_UNKNOWN",
  },
  {
    slot: "Cabinet",
    name: "supported motherboards",
    blank: { supportedMotherboards: undefined },
    rule: "RULE_G_FORM_FACTOR_UNKNOWN",
  },
  {
    slot: "Storage",
    name: "interface",
    blank: { storageInterface: undefined },
    rule: "RULE_H_STORAGE_UNKNOWN",
  },
  {
    slot: "Motherboard",
    name: "M.2 slots",
    blank: { m2SlotCount: undefined },
    rule: "RULE_H_STORAGE_UNKNOWN",
  },
  {
    slot: "Motherboard",
    name: "SATA ports",
    blank: { sataPortCount: undefined },
    rule: "RULE_H_STORAGE_UNKNOWN",
    base: { Storage: { storageInterface: "SATA" } },
  },
  {
    slot: "CPU",
    name: "integrated graphics",
    blank: { hasIntegratedGraphics: undefined },
    rule: "RULE_I_DISPLAY_OUTPUT_UNKNOWN",
    base: { GPU: null },
  },
];

for (const { slot, name, blank, rule, base } of TABLE) {
  Deno.test(`INPUT ${slot} ${name}: stated, nothing's missing, and blank, both name it`, () => {
    const stated = buildWith(base);
    assertEquals(names(checkInputsMissing(stated[slot], stated)), []);
    assert(!ruleOf(report(stated), rule), `${rule} fired with the value stated`);

    const blanked = buildWith({ ...base, [slot]: { ...base?.[slot], ...blank } });
    assertEquals(names(checkInputsMissing(blanked[slot], blanked)), [`${slot}: ${name}`]);
    assertEquals(names(buildInputsMissing(blanked)), [`${slot}: ${name}`]);

    const item = ruleOf(report(blanked), rule);
    assert(item, `${rule} didn't fire`);
    assertEquals(item.status, "unknown");
    assertEquals(names(item.missingInputs), [`${slot}: ${name}`]);
  });
}

// ── Stated and wrong isn't missing: Match, Mismatch and Unknown stay apart ───────────────────────

const MISMATCHES: { name: string; changes: Record<string, Specs | null>; rule: string }[] = [
  { name: "socket", changes: { CPU: { socket: "AM5" } }, rule: "RULE_A_SOCKET_MISMATCH" },
  {
    name: "memory generation",
    changes: { RAM: { ramGeneration: "DDR5" } },
    rule: "RULE_B_RAM_MISMATCH",
  },
  {
    name: "laptop memory",
    changes: { RAM: { isLaptopSoDimm: true } },
    rule: "RULE_B_RAM_SODIMM_ERROR",
  },
  { name: "module count", changes: { RAM: { moduleCount: 8 } }, rule: "RULE_B_RAM_SLOTS_EXCEEDED" },
  {
    name: "capacity",
    changes: { RAM: { capacityGb: 256 } },
    rule: "RULE_B_RAM_CAPACITY_EXCEEDED",
  },
  {
    name: "cooler socket",
    changes: { Cooler: { supportedSockets: ["LGA1700"] } },
    rule: "RULE_C_COOLER_SOCKET_MISMATCH",
  },
  {
    name: "cooler height",
    changes: { Cooler: { coolerHeightMm: 200 } },
    rule: "RULE_C_COOLER_HEIGHT_EXCEEDED",
  },
  {
    name: "card length",
    changes: { GPU: { lengthMm: 400 } },
    rule: "RULE_D_GPU_LENGTH_EXCEEDED",
  },
  {
    name: "power supply size",
    changes: { PSU: { ratedWattage: 100 } },
    rule: "RULE_E_PSU_WATTAGE_DEFICIT",
  },
  {
    name: "connectors",
    changes: { PSU: { pcie6Plus2Count: 0 } },
    rule: "RULE_F_PCIE_POWER_INSUFFICIENT",
  },
  {
    name: "form factor",
    changes: { Cabinet: { supportedMotherboards: ["Mini-ITX"] } },
    rule: "RULE_G_FORM_FACTOR_MISMATCH",
  },
  {
    name: "M.2 slot",
    changes: { Motherboard: { m2SlotCount: 0 } },
    rule: "RULE_H_STORAGE_SLOT_MISSING",
  },
  {
    name: "SATA port",
    changes: { Storage: { storageInterface: "SATA" }, Motherboard: { sataPortCount: 0 } },
    rule: "RULE_H_STORAGE_PORT_MISSING",
  },
  {
    name: "display output",
    changes: { GPU: null },
    rule: "RULE_I_GPU_MANDATORY_NO_IGPU",
  },
];

for (const { name, changes, rule } of MISMATCHES) {
  Deno.test(`INPUT mismatch ${name}: a wrong value is a mismatch, and isn't reported as missing`, () => {
    const parts = buildWith(changes);
    const summary = report(parts);
    assertEquals(ruleOf(summary, rule)?.status, "incompatible");
    assertEquals(summary.status, "incompatible");
    assertEquals(names(buildInputsMissing(parts)), []);
  });
}

Deno.test("INPUT: a zero count is an answer, and the rule treats it as one", () => {
  const parts = buildWith({ Motherboard: { m2SlotCount: 0 } });
  assertEquals(names(checkInputsMissing(parts.Motherboard, parts)), []);
});

Deno.test("INPUT: a matching build stays a match, and blanking a value never confirms anything", () => {
  assertEquals(report(buildWith()).status, "compatible");
  for (const { slot, blank, base } of TABLE) {
    const summary = report(buildWith({ ...base, [slot]: { ...base?.[slot], ...blank } }));
    assertEquals(summary.status, "unknown", `${slot} ${Object.keys(blank)}`);
    assertEquals(summary.validForAutomatedRecommendation, false);
  }
});

// ── Conditional requirements ─────────────────────────────────────────────────────────────────────

Deno.test("INPUT conditional: a boxed cooler needs no height check, from either part", () => {
  const parts = buildWith({
    Cooler: null,
    CPU: { includesCooler: true },
    Cabinet: { maxCoolerHeightMm: undefined },
  });
  assertEquals(names(buildInputsMissing(parts)), []);
  const summary = report(parts);
  assertEquals(summary.status, "compatible");
  assert(!ruleOf(summary, "RULE_C_COOLER_HEIGHT_UNKNOWN"));
  assert(summary.notes.some((note: string) => note.includes("boxed cooler")));
});

Deno.test("INPUT conditional: a separate cooler needs both heights", () => {
  const parts = buildWith({
    Cooler: { coolerHeightMm: undefined },
    Cabinet: { maxCoolerHeightMm: undefined },
  });
  assertEquals(names(buildInputsMissing(parts)).sort(), [
    "Cabinet: cooler height limit",
    "Cooler: height",
  ]);
});

Deno.test("INPUT conditional: a separate cooler doesn't need the processor's boxed-cooler answer", () => {
  const parts = buildWith({ CPU: { includesCooler: undefined } });
  assertEquals(names(buildInputsMissing(parts)), []);
  assert(!ruleOf(report(parts), "RULE_C_STOCK_COOLER_UNKNOWN"));
});

Deno.test("INPUT conditional: a graphics card replaces the integrated graphics answer", () => {
  const withCard = buildWith({ CPU: { hasIntegratedGraphics: undefined } });
  assertEquals(names(buildInputsMissing(withCard)), []);
  const withOwnCard = buildWith({ GPU: null, CPU: { hasIntegratedGraphics: undefined } });
  assertEquals(names(buildInputsMissing(withOwnCard, { ownedSlots: ["GPU"] })), []);
  assert(!ruleOf(report(withOwnCard, { ownedSlots: ["GPU"] }), "RULE_I_DISPLAY_OUTPUT_UNKNOWN"));
});

Deno.test("INPUT conditional: with no card, no connector or clearance value is needed", () => {
  const parts = buildWith({
    GPU: null,
    CPU: { hasIntegratedGraphics: true },
    PSU: { pcie6Plus2Count: undefined, pcie16PinCount: undefined },
    Cabinet: { maxGpuLengthMm: undefined },
  });
  assertEquals(names(buildInputsMissing(parts)), []);
  assertEquals(report(parts).status, "compatible");
});

Deno.test("INPUT conditional: a card on slot power doesn't read the supply's cables", () => {
  const parts = buildWith({
    GPU: { powerWatts: 70, pcie6Plus2Required: 0 },
    PSU: { pcie6Plus2Count: undefined, pcie16PinCount: undefined },
  });
  assertEquals(names(buildInputsMissing(parts)), []);
  assert(ruleOf(report(parts), "RULE_F_PCIE_POWER_NOT_REQUIRED"));
});

Deno.test("INPUT conditional: half-filled connector counts aren't a value, as the rule reads them", () => {
  const supply = buildWith({ PSU: { pcie16PinCount: undefined } });
  assertEquals(names(buildInputsMissing(supply)), ["PSU: power connectors"]);
  assert(ruleOf(report(supply), "RULE_F_PCIE_CONNECTORS_UNKNOWN"));
  const card = buildWith({ GPU: { pcie16PinRequired: undefined } });
  assertEquals(names(buildInputsMissing(card)), ["GPU: power connectors"]);
  assert(ruleOf(report(card), "RULE_F_GPU_CONNECTORS_UNKNOWN"));
});

Deno.test("INPUT conditional: a drive reads only the connection it uses", () => {
  const nvme = buildWith({ Motherboard: { sataPortCount: undefined } });
  assertEquals(names(buildInputsMissing(nvme)), []);
  const sata = buildWith({
    Storage: { storageInterface: "SATA" },
    Motherboard: { m2SlotCount: undefined },
  });
  assertEquals(names(buildInputsMissing(sata)), []);
});

Deno.test("INPUT conditional: an unreadable interface asks about the drive, not the board", () => {
  const parts = buildWith({
    Storage: { storageInterface: "PCIe" },
    Motherboard: { m2SlotCount: undefined, sataPortCount: undefined },
  });
  assertEquals(names(buildInputsMissing(parts)), ["Storage: interface"]);
});

Deno.test("INPUT conditional: M.2 SATA support is named, though no field can answer it yet", () => {
  const parts = buildWith({ Storage: { storageInterface: "M.2 SATA" } });
  assertEquals(names(buildInputsMissing(parts)), ["Motherboard: M.2 SATA support"]);
  const item = ruleOf(report(parts), "RULE_H_M2_SATA_UNKNOWN");
  assertEquals(names(item.missingInputs), ["Motherboard: M.2 SATA support"]);
  const noSlot = buildWith({
    Storage: { storageInterface: "M.2 SATA" },
    Motherboard: { m2SlotCount: 0 },
  });
  assertEquals(names(buildInputsMissing(noSlot)), []);
  assertEquals(report(noSlot).status, "incompatible");
});

Deno.test("INPUT conditional: a processor's maximum power is only read at limited headroom", () => {
  assertEquals(
    names(buildInputsMissing(buildWith({ CPU: { maxTurboPowerWatts: undefined } }))),
    [],
  );
});

Deno.test("INPUT conditional: the customer's own part asks nothing of a part that isn't there", () => {
  const ownMemory = buildWith({
    RAM: null,
    Motherboard: { ramSlots: undefined, maxRamCapacityGb: undefined },
  });
  assertEquals(names(buildInputsMissing(ownMemory, { ownedSlots: ["RAM"] })), []);
  const summary = report(ownMemory, { ownedSlots: ["RAM"] });
  const own = ruleOf(summary, "RULE_B_OWNED_RAM_UNCHECKED");
  assertEquals(own.status, "unknown");
  assertEquals(own.missingInputs, undefined);
  const ownDrive = buildWith({ Storage: null, Motherboard: { m2SlotCount: undefined } });
  assertEquals(names(buildInputsMissing(ownDrive, { ownedSlots: ["Storage"] })), []);
});

Deno.test("INPUT conditional: choosing a part means the customer's own isn't used there", () => {
  const parts = buildWith({ CPU: { hasIntegratedGraphics: undefined } });
  assertEquals(names(buildInputsMissing(parts, { ownedSlots: ["GPU"] })), []);
  const noCard = buildWith({ GPU: null, CPU: { hasIntegratedGraphics: undefined } });
  assertEquals(names(buildInputsMissing(noCard)), ["CPU: integrated graphics"]);
});

Deno.test("INPUT conditional: only slots with rules are asked anything", () => {
  const monitor = { ...part("Monitor", {}), title: "QZX Screen" };
  assertEquals(checkInputsMissing(monitor, buildWith()), []);
  assertEquals(inputsNeededByPart(monitor), { always: [], sometimes: [] });
});

Deno.test("INPUT: a part looked at alone asks nothing about parts that aren't chosen", () => {
  assertEquals(names(checkInputsMissing(part("Cabinet", {}))), []);
  assertEquals(names(checkInputsMissing(part("RAM", {}))), ["RAM: module type"]);
});

// ── Every Unknown about a value is covered, and nothing drifts ───────────────────────────────────

const ABOUT_THE_CUSTOMER_OR_THE_RECORD = new Set([
  "RULE_B_OWNED_RAM_UNCHECKED",
  "RULE_H_OWNED_STORAGE_UNCHECKED",
  "RULE_I_OWNED_GPU_UNCHECKED",
  "RULE_L_SPEC_UNREVIEWED",
  "RULE_K_SPEC_INVALID",
  "RULE_K_SPEC_CONFLICT",
  "RULE_K_REVIEW_INCOMPLETE",
  "RULE_K_SPEC_REJECTED",
]);

const EXTRA_COMBINATIONS: { rule: string; changes: Record<string, Specs | null> }[] = [
  {
    rule: "RULE_F_GPU_POWER_UNKNOWN",
    changes: {
      GPU: { powerWatts: undefined, pcie6Plus2Required: undefined, pcie16PinRequired: undefined },
    },
  },
  {
    rule: "RULE_F_PCIE_POWER_UNKNOWN",
    changes: {
      PSU: { ratedWattage: undefined, pcie6Plus2Count: undefined, pcie16PinCount: undefined },
    },
  },
  { rule: "RULE_H_M2_SATA_UNKNOWN", changes: { Storage: { storageInterface: "M.2 SATA" } } },
];

Deno.test("INPUT drift: every Unknown the engine can return is either on the list or explained here", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../src/lib/builder/compatibility.ts", import.meta.url),
  );
  const unknownRules = [
    ...source.matchAll(/ruleId: "(RULE_[A-Z0-9_]+)",\s+severity: "warning",\s+status: "unknown"/g),
  ].map((match) => match[1]);
  assert(unknownRules.length > 20, `found ${unknownRules.length}`);
  const covered = new Set([
    ...TABLE.map(({ rule }) => rule),
    ...EXTRA_COMBINATIONS.map(({ rule }) => rule),
    ...ABOUT_THE_CUSTOMER_OR_THE_RECORD,
  ]);
  assertEquals(
    unknownRules.filter((rule) => !covered.has(rule)),
    [],
  );
});

for (const { rule, changes } of EXTRA_COMBINATIONS) {
  Deno.test(`INPUT combination ${rule}: it names what it's waiting for`, () => {
    const item = ruleOf(report(buildWith(changes)), rule);
    assert(item, `${rule} didn't fire`);
    assert(item.missingInputs?.length > 0);
  });
}

Deno.test("INPUT: a stated contradiction stays an Unknown, without claiming a value is missing", () => {
  const parts = buildWith({ GPU: { pcie6Plus2Required: 0, powerWatts: 200 } });
  const item = ruleOf(report(parts), "RULE_F_GPU_CONNECTORS_UNKNOWN");
  assertEquals(item.status, "unknown");
  assertEquals(item.missingInputs, undefined);
  assertEquals(names(buildInputsMissing(parts)), []);
});

Deno.test("INPUT: the customer's own card leaves the power check unknown, with no value to blame", () => {
  const parts = buildWith({ GPU: null });
  const summary = report(parts, { ownedSlots: ["GPU"] });
  const power = ruleOf(summary, "RULE_E_POWER_DRAW_UNKNOWN");
  assertEquals(power.status, "unknown");
  assertEquals(power.missingInputs, undefined);
  assert(ruleOf(summary, "RULE_I_OWNED_GPU_UNCHECKED"));
});

// A small repeatable generator, so a failure can be reproduced.
const randomFrom = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

Deno.test("INPUT agreement: across 3,000 random builds, the engine and the list never disagree", () => {
  const random = randomFrom(20261105);
  const slots = Object.keys(COMPLETE);
  for (let run = 0; run < 3000; run++) {
    const changes: Record<string, Specs | null> = {};
    for (const slot of slots) {
      if (random() < 0.12) {
        changes[slot] = null;
        continue;
      }
      const blanks: Specs = {};
      for (const key of Object.keys(COMPLETE[slot])) if (random() < 0.15) blanks[key] = undefined;
      changes[slot] = blanks;
    }
    if (changes.GPU !== null && random() < 0.2) changes.PSU = { ratedWattage: 360 };
    if (random() < 0.15) changes.Storage = { storageInterface: "M.2 SATA" };
    const owned = random() < 0.15 ? ["GPU"] : [];
    const parts = buildWith(changes);
    const summary = report(parts, { ownedSlots: owned });
    const missing = buildInputsMissing(parts, { ownedSlots: owned });
    const context = JSON.stringify({ run, changes, owned });

    // Every Unknown about a value names at least one, unless the customer's own card is the reason.
    for (const item of summary.items) {
      if (item.status !== "unknown" || ABOUT_THE_CUSTOMER_OR_THE_RECORD.has(item.ruleId)) continue;
      if (owned.length && item.ruleId === "RULE_E_POWER_DRAW_UNKNOWN") continue;
      assert(item.missingInputs?.length > 0, `${item.ruleId} named nothing: ${context}`);
    }
    // Every missing value is named by a check. Only a definite mismatch can stop a check being reached.
    const named = new Set(
      summary.items.flatMap((item: any) =>
        (item.missingInputs || []).map((i: any) => `${i.slot}|${i.name}`),
      ),
    );
    const hasError = summary.items.some((item: any) => item.severity === "error");
    for (const input of missing) {
      if (hasError) break;
      assert(named.has(`${input.slot}|${input.name}`), `${input.slot} ${input.name}: ${context}`);
    }
    // Nothing missing and no mismatch means no Unknown about a value.
    if (missing.length === 0 && !hasError) {
      const left = summary.items.filter(
        (item: any) =>
          item.status === "unknown" &&
          !ABOUT_THE_CUSTOMER_OR_THE_RECORD.has(item.ruleId) &&
          !(owned.length && item.ruleId === "RULE_E_POWER_DRAW_UNKNOWN"),
      );
      assertEquals(
        left.map((item: any) => item.ruleId),
        [],
        context,
      );
    }
    // A part the report calls complete is never named as missing in any build.
    for (const input of missing) {
      const needs = inputsNeededByPart(parts[input.slot]);
      const reported = [...needs.always, ...needs.sometimes.map(({ name }: any) => name)];
      const isUnanswerable = input.name === "M.2 SATA support";
      assert(isUnanswerable || reported.includes(input.name), `${input.name}: ${context}`);
    }
  }
});

Deno.test("INPUT: leaving the marking out changes no result, for the search's many checks", () => {
  const random = randomFrom(7);
  for (let run = 0; run < 300; run++) {
    const blanks: Specs = {};
    for (const key of Object.keys(COMPLETE.RAM)) if (random() < 0.5) blanks[key] = undefined;
    const parts = buildWith({ RAM: blanks, Cooler: random() < 0.5 ? null : {} });
    const marked = report(parts);
    const plain = report(parts, { withoutMissingInputs: true });
    assertEquals(plain.status, marked.status);
    assertEquals(
      plain.items.map((item: any) => [item.ruleId, item.status]),
      marked.items.map((item: any) => [item.ruleId, item.status]),
    );
    for (const item of plain.items) assertEquals(item.missingInputs, undefined);
  }
});

// ── The staff report ─────────────────────────────────────────────────────────────────────────────

Deno.test("REPORT: a part stating every label value still lists what the checks need", () => {
  const before = inputsNeededByPart(
    part("Motherboard", {
      socket: "AM4",
      supportedRamGeneration: "DDR4",
      formFactor: "Micro-ATX",
    }),
  );
  assertEquals(before.always, ["memory slots", "memory limit"]);
  assertEquals(before.sometimes, [
    { name: "M.2 slots", when: "an M.2 drive is chosen" },
    { name: "SATA ports", when: "a SATA drive is chosen" },
  ]);
});

Deno.test("REPORT: a part stating every value is complete", () => {
  for (const slot of Object.keys(COMPLETE)) {
    assertEquals(inputsNeededByPart(buildWith()[slot]), { always: [], sometimes: [] }, slot);
  }
});

Deno.test("REPORT: values only some builds read aren't called missing from every build", () => {
  const cabinet = inputsNeededByPart(part("Cabinet", { supportedMotherboards: ["ATX"] }));
  assertEquals(cabinet.always, []);
  assertEquals(cabinet.sometimes, [
    { name: "cooler height limit", when: "a separate cooler is chosen" },
    { name: "graphics card clearance", when: "a graphics card is chosen" },
  ]);
  const processor = inputsNeededByPart(part("CPU", { socket: "AM4", tdpWatts: 65 }));
  assertEquals(processor.always, []);
  assertEquals(
    processor.sometimes.map(({ name }: any) => name),
    ["included cooler", "maximum power", "integrated graphics"],
  );
  const supply = inputsNeededByPart(part("PSU", { ratedWattage: 650 }));
  assertEquals(supply.always, []);
  assertEquals(supply.sometimes, [
    { name: "power connectors", when: "a graphics card that needs a power cable is chosen" },
  ]);
});

Deno.test("REPORT: half-filled connector counts aren't called complete", () => {
  const supply = inputsNeededByPart(part("PSU", { ratedWattage: 650, pcie6Plus2Count: 2 }));
  assertEquals(
    supply.sometimes.map(({ name }: any) => name),
    ["power connectors"],
  );
});

Deno.test("REPORT: an M.2 SATA drive says a check can't be answered yet, and an NVMe one doesn't", () => {
  assertEquals(inputsNeededByPart(part("Storage", { storageInterface: "M.2 SATA" })).sometimes, [
    { name: "M.2 SATA support", when: "an M.2 SATA drive is chosen" },
  ]);
  assertEquals(inputsNeededByPart(part("Storage", { storageInterface: "M.2 NVMe" })).sometimes, []);
  const board = inputsNeededByPart(buildWith().Motherboard);
  assertEquals(board, { always: [], sometimes: [] });
});

Deno.test("REPORT: the written report keeps the two groups apart", () => {
  const product = {
    id: "gid://shopify/Product/1",
    name: "QZX Enclosure",
    handle: "qzx",
    price: 1000,
    tags: [],
    variantId: "gid://shopify/ProductVariant/1",
    availableForSale: true,
    stock: 5,
    category: "Computer Cases",
    specs: { supported_motherboards: '["ATX"]' },
  };
  const text = formatSpecReport(buildSpecReport([product as any]));
  assert(!text.includes("    Not stated: "), text);
  assert(
    text.includes(
      "Not stated, needed in some builds: cooler height limit (when a separate cooler is chosen), graphics card clearance (when a graphics card is chosen)",
    ),
    text,
  );
});

// ── Labels, and what a customer reads ────────────────────────────────────────────────────────────

const gaps = (parts: any, options: any = {}) =>
  labelCompatibilityGaps(parts, report(parts, options).items, options);

Deno.test("GAPS: each check names its values, once, with no second list repeating them", () => {
  const parts = buildWith({
    Motherboard: { ramSlots: undefined },
    GPU: { lengthMm: undefined },
  });
  const lines = gaps(parts);
  assertEquals(lines, [
    "Not yet confirmed: Memory slot and capacity limits unverified (memory slots of QZX Board), Chassis GPU clearance unverified (length of QZX Card).",
  ]);
});

Deno.test("GAPS: a value only a label needs is called not stated, as before", () => {
  const parts = { GPU: part("GPU", { lengthMm: 250 }) };
  const lines = gaps(parts);
  assert(
    lines.some((line: string) => line.startsWith("Not stated") && line.includes("power draw")),
  );
  assert(lines.some((line: string) => line.includes("recommended power supply of QZX Card")));
});

Deno.test("GAPS: a value this build doesn't read still stops a label, but isn't called something to check", () => {
  const parts = buildWith({
    GPU: null,
    CPU: { hasIntegratedGraphics: true },
    PSU: { pcie6Plus2Count: undefined, pcie16PinCount: undefined },
    Cabinet: { maxGpuLengthMm: undefined },
  });
  assertEquals(report(parts).status, "compatible");
  assertEquals(gaps(parts), [
    "No recommendation label, because these aren't on file, though this build doesn't rely on them: power connectors of QZX Supply; graphics card clearance of QZX Enclosure.",
  ]);
});

Deno.test("GAPS: a part's title-read values aren't announced twice", () => {
  const titleRead = buildWith({
    PSU: { fieldSources: { ratedWattage: "title_inferred" } },
  });
  const lines = gaps(titleRead);
  assertEquals(
    lines.filter((line: string) => line.includes("specifications not yet reviewed")),
    [],
  );
  assert(
    lines.some(
      (line: string) =>
        line === "Read from the product title, not confirmed: wattage of QZX Supply.",
    ),
  );
});

Deno.test("GAPS: a part with unreviewed stated values keeps its line", () => {
  const parts = buildWith({ PSU: { unreviewedSpecs: ["Wattage"] } });
  const lines = gaps(parts);
  assert(
    lines.some((line: string) => line.includes("QZX Supply: specifications not yet reviewed")),
  );
});

// ── Both screens read the same thing ─────────────────────────────────────────────────────────────

const row = (parts: any, options: any = {}): any =>
  compatibility(
    Object.fromEntries(
      Object.entries(parts).map(([slot, p]: [string, any]) => [
        slot,
        {
          id: slot,
          name: p.title,
          price: 1000,
          variantId: slot,
          specs: p.specs,
          isVerified: p.isVerified,
        },
      ]),
    ),
    options,
  );

Deno.test("SCREENS: the checks list names the same values the engine does", () => {
  const parts = buildWith({ Motherboard: { ramSlots: undefined }, RAM: { capacityGb: undefined } });
  const check = row(parts);
  const limits = check.result.find(
    (r: any) => r.label === "Memory slot and capacity limits unverified",
  );
  assertEquals(limits.missing, "Not stated: memory slots of QZX Board; capacity of QZX Memory.");
  assertEquals(limits.advice, undefined);
  for (const r of check.result) {
    if (r !== limits) assertEquals(r.missing, undefined, r.label);
  }
});

Deno.test("SCREENS: values are named in the same order, however the parts were chosen", () => {
  const parts = buildWith({
    GPU: { pcie6Plus2Required: undefined, pcie16PinRequired: undefined },
    PSU: { pcie6Plus2Count: undefined, pcie16PinCount: undefined },
  });
  const reversed = Object.fromEntries(Object.entries(parts).reverse());
  const label = "PSU PCIe cables unverified";
  const named = (build: any) => row(build).result.find((r: any) => r.label === label).missing;
  assertEquals(
    named(parts),
    "Not stated: power connectors of QZX Card; power connectors of QZX Supply.",
  );
  assertEquals(named(reversed), named(parts));
});

Deno.test("SCREENS: advice and a mismatch name no missing value", () => {
  const advice = row(buildWith({ CPU: { includesCooler: false }, Cooler: null }));
  const cooler = advice.result.find((r: any) => r.label === "CPU cooler required");
  assert(cooler.advice);
  assertEquals(cooler.missing, undefined);
  const mismatch = row(buildWith({ CPU: { socket: "AM5" } }));
  for (const r of mismatch.result) assertEquals(r.missing, undefined);
});

Deno.test("SCREENS: no check is listed twice, whichever values are missing", () => {
  const random = randomFrom(99);
  for (let run = 0; run < 500; run++) {
    const changes: Record<string, Specs | null> = {};
    for (const slot of Object.keys(COMPLETE)) {
      const blanks: Specs = {};
      for (const key of Object.keys(COMPLETE[slot])) if (random() < 0.3) blanks[key] = undefined;
      changes[slot] = blanks;
    }
    const check = row(buildWith(changes));
    const labels = check.result.map((r: any) => r.label);
    assertEquals(labels.length, new Set(labels).size, JSON.stringify(changes));
    for (const r of check.result) {
      if (!r.missing) continue;
      const values = r.missing.replace("Not stated: ", "").replace(/\.$/, "").split("; ");
      assertEquals(values.length, new Set(values).size, r.missing);
    }
  }
});

Deno.test("SCREENS: the general notice isn't shown beside the checks that say the same thing", () => {
  const blankPart = { ...part("PSU", {}), isVerified: false, specs: { provenance: "unverified" } };
  const parts = { ...buildWith(), PSU: blankPart };
  const summary = report(parts);
  assert(ruleOf(summary, "RULE_J_SPEC_UNVERIFIED"), "it stays in the summary");
  assertEquals(summary.status, "unknown");
  assert(!reportedItems(summary.items).some((i: any) => i.ruleId === "RULE_J_SPEC_UNVERIFIED"));
  const rows = compatibility(parts as any).result.map((r: any) => r.label);
  assert(!rows.includes("Component specifications preliminary / unverified"));
});

Deno.test("SCREENS: the general notice is still shown when it's the only thing saying it", () => {
  const parts = {
    ...buildWith(),
    Storage: { ...part("Storage", COMPLETE.Storage), isVerified: false },
  };
  const summary = report(parts);
  assertEquals(unknownIds(summary), []);
  assertEquals(summary.status, "conditional");
  assert(reportedItems(summary.items).some((i: any) => i.ruleId === "RULE_J_SPEC_UNVERIFIED"));
});

// Through the real search, from Shopify-shaped listings.
const REVIEWED = {
  spec_source: "manufacturer_datasheet",
  spec_review_status: "reviewed",
  spec_source_url: "https://www.example.org/datasheet",
  spec_reviewed_on: "2026-11-01",
};
let nextId = 1;
const listing = (name: string, category: string, specs: Record<string, string>, price = 5000) => {
  const id = nextId++;
  return {
    id: `gid://shopify/Product/${id}`,
    name,
    handle: `listing-${id}`,
    price,
    tags: [],
    variantId: `gid://shopify/ProductVariant/${id}`,
    availableForSale: true,
    stock: 5,
    specs: { ...REVIEWED, ...specs },
    category,
  };
};
const LISTINGS = (changes: Record<string, Record<string, string>> = {}) => [
  listing("QZX Processor 77", "Computer Processors", {
    socket: "AM4",
    watts: "65",
    cpu_max_power_watts: "76",
    integrated_graphics: "false",
    includes_cooler: "true",
    ...changes.CPU,
  }),
  listing("QZX Board 12", "Motherboards", {
    socket: "AM4",
    ram_generation: "DDR4",
    form_factor: "Micro-ATX",
    ram_slots: "2",
    max_ram_gb: "64",
    m2_slots: "1",
    sata_ports: "4",
    ...changes.Motherboard,
  }),
  listing("QZX Memory Kit", "RAM", {
    ram_generation: "DDR4",
    ram_capacity_gb: "16",
    ram_modules: "2",
    ram_module_type: "DIMM",
    ...changes.RAM,
  }),
  listing("QZX Card 8", "Video Cards", {
    watts: "130",
    gpu_length_mm: "200",
    recommended_psu_watts: "450",
    pcie_6plus2_required: "1",
    pcie_16pin_required: "0",
    ...changes.GPU,
  }),
  listing("QZX Drive 1", "Solid State Drives", {
    storage_interface: "M.2 NVMe",
    storage_capacity_gb: "500",
    ...changes.Storage,
  }),
  listing("QZX Power 650", "Computer Power Supplies", {
    capacity_watts: "650",
    pcie_6plus2_count: "2",
    pcie_16pin_count: "0",
    ...changes.PSU,
  }),
  listing("QZX Enclosure 3", "Computer Cases", {
    supported_motherboards: '["Micro-ATX"]',
    cabinet_clearance_mm: "300",
    max_cooler_height_mm: "160",
    ...changes.Cabinet,
  }),
];

const findMyPc = (items: any[], owned: string[] = []) =>
  generateDynamicCatalogRecommendations(
    syncBuilderCatalogWithShopify(items).componentCatalog,
    { purpose: "gaming", details: {}, brands: [], wifi: "", owned },
    { min: 0, max: 500000 },
    { allowUnverified: true },
  );

const expertCheckOf = (build: any, owned: string[] = []): any =>
  compatibility(build.parts, { ownedSlots: owned });

Deno.test("SCREENS: a complete build from the search has no warning on either screen", () => {
  const [build] = findMyPc(LISTINGS());
  assertEquals(build.requiresReview, false);
  assertEquals(build.confidenceBadge, "certified");
  assertEquals(build.advisories, []);
  const check = expertCheckOf(build);
  assertEquals(check.summary.status, "compatible");
  assertEquals(
    check.result.filter((r: any) => r.state !== "ok"),
    [],
  );
});

for (const [name, changes, label, value] of [
  [
    "memory limits",
    { Motherboard: { max_ram_gb: "" } },
    "Memory slot and capacity limits unverified",
    "memory limit of QZX Board 12",
  ],
  [
    "module type",
    { RAM: { ram_module_type: "" } },
    "Memory module type unverified",
    "module type of QZX Memory Kit",
  ],
  [
    "cabinet clearance",
    { Cabinet: { cabinet_clearance_mm: "" } },
    "Chassis GPU clearance unverified",
    "graphics card clearance of QZX Enclosure 3",
  ],
  [
    "card length",
    { GPU: { gpu_length_mm: "" } },
    "Chassis GPU clearance unverified",
    "length of QZX Card 8",
  ],
  [
    "supply connectors",
    { PSU: { pcie_16pin_count: "" } },
    "PSU PCIe cables unverified",
    "power connectors of QZX Power 650",
  ],
  [
    "card connectors",
    { GPU: { pcie_16pin_required: "" } },
    "Graphics card connector type unverified",
    "power connectors of QZX Card 8",
  ],
  [
    "storage connection",
    { Motherboard: { m2_slots: "" } },
    "Storage connection unverified",
    "M.2 slots of QZX Board 12",
  ],
  [
    "storage interface",
    { Storage: { storage_interface: "" } },
    "Storage connection unverified",
    "interface of QZX Drive 1",
  ],
] as [string, Record<string, Record<string, string>>, string, string][]) {
  Deno.test(`SCREENS ${name}: Find My PC and Expert Mode name the same missing value`, () => {
    const items = LISTINGS(changes).map((item: any) => ({
      ...item,
      specs: Object.fromEntries(Object.entries(item.specs).filter(([, v]) => v !== "")),
    }));
    const [build] = findMyPc(items);
    assertEquals(build.requiresReview, true);
    assert(build.confidenceBadge !== "certified");
    assert(build.reviewItems.includes(label), build.reviewItems.join(", "));
    assert(
      build.rankingReasons.some(
        (reason: string) => reason.includes(`${label} (`) && reason.includes(value),
      ),
      build.rankingReasons.join(" | "),
    );

    const check = expertCheckOf(build);
    assertEquals(check.summary.status, "unknown");
    const expert = check.result.find((r: any) => r.label === label);
    assert(expert?.missing?.includes(value), expert?.missing);
  });
}

Deno.test("SCREENS: the same build gets the same review list and status on both screens", () => {
  const items = LISTINGS({ RAM: { ram_module_type: "" } }).map((item: any) => ({
    ...item,
    specs: Object.fromEntries(Object.entries(item.specs).filter(([, v]) => v !== "")),
  }));
  for (const build of findMyPc(items)) {
    const summary = expertCheckOf(build).summary;
    const reviewing = summary.items
      .filter((i: any) => i.status === "unknown" || i.ruleId === "RULE_A_BIOS_UPDATE")
      .map((i: any) => i.label);
    assertEquals(reviewing, build.reviewItems);
    assertEquals(summary.validForAutomatedRecommendation, !build.requiresReview);
  }
});

Deno.test("SCREENS: a boxed cooler build asks neither screen for a cooler height", () => {
  const items = LISTINGS({ Cabinet: { max_cooler_height_mm: "" } }).map((item: any) => ({
    ...item,
    specs: Object.fromEntries(Object.entries(item.specs).filter(([, v]) => v !== "")),
  }));
  const [build] = findMyPc(items);
  assertEquals(build.parts.Cooler, undefined);
  assertEquals(build.requiresReview, false);
  assert(!build.rankingReasons.join(" ").includes("cooler height"));
  const check = expertCheckOf(build);
  assert(!check.result.some((r: any) => /height/i.test(r.label)));
  assert(check.summary.notes.some((note: string) => note.includes("boxed cooler")));
});

Deno.test("SCREENS: Find My PC's card doesn't add the general notice to a build needing review", () => {
  const items = LISTINGS().map((item: any, index: number) =>
    index === 2 ? { ...item, specs: { ram_generation: "DDR4" } } : item,
  );
  const [build] = findMyPc(items);
  assertEquals(build.requiresReview, true);
  assertEquals(
    build.advisories.filter((a: any) => a.label.includes("preliminary")),
    [],
  );
});

Deno.test("SCREENS: both checks lists on the page show the named values", async () => {
  const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
  assertEquals(page.match(/\{check\.missing && \(/g)?.length, 2);
  // An icon beside a wrapped line keeps its size in both lists.
  for (const icon of ["CheckCircle2", "XCircle", "AlertTriangle"]) {
    assert(page.includes(`<${icon} size={14} className="mt-0.5 shrink-0" />`), icon);
  }
});

Deno.test("SCREENS: the build detail doesn't repeat the checks in its evidence", async () => {
  const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
  assert(page.includes("<RankingEvidence build={initial} />"));
  assert(page.includes('.filter((reason) => compact || !reason.startsWith("Not yet confirmed"));'));
  assert(
    page.includes("<RankingEvidence build={build} compact />"),
    "the card keeps its full list",
  );
});

// ── The general notice, when a part's missing values aren't used by the build ───────────────────

const notOnFile = (slot: string, specs: Specs) => ({ ...part(slot, specs), isVerified: false });
const NO_CARD = { GPU: null, CPU: { hasIntegratedGraphics: true } } as Record<string, Specs | null>;
const NO_CABLES: Specs = { ratedWattage: 650 };

Deno.test("NOTICE: a part missing only values this build doesn't use isn't something to confirm", () => {
  const parts = { ...buildWith(NO_CARD), PSU: notOnFile("PSU", NO_CABLES) };
  const summary = report(parts);
  const notice = ruleOf(summary, "RULE_J_SPEC_UNVERIFIED");
  assertEquals(notice.status, "conditional");
  assertEquals(notice.severity, "warning");
  assertEquals(notice.label, "Some specifications aren't on file");
  assertEquals(
    notice.explanation,
    "Not on file: power connectors of QZX Supply. This build doesn't use them, so its compatibility doesn't depend on them.",
  );
  assertEquals(notice.suggestedResolution, undefined);
  assertEquals(summary.status, "conditional");
  const advice = row(parts).result.find((r: any) => r.label === notice.label);
  assert(!/confirm/i.test(advice.advice), advice.advice);
});

Deno.test("NOTICE: the same part in a build that uses the value keeps the warning", () => {
  const parts = { ...buildWith(), PSU: notOnFile("PSU", NO_CABLES) };
  const notice = ruleOf(report(parts), "RULE_J_SPEC_UNVERIFIED");
  assertEquals(notice.label, "Component specifications preliminary / unverified");
  assertEquals(
    notice.explanation,
    "1 component(s) don't have their full specifications stated in the catalogue.",
  );
  assertEquals(
    notice.suggestedResolution,
    "Confirm these specifications with IT HUB before ordering.",
  );
  assert(
    ruleOf(report(parts), "RULE_F_PCIE_CONNECTORS_UNKNOWN"),
    "and the missing value is still checked",
  );
});

Deno.test("NOTICE: only the parts that matter are counted, and the others are named apart", () => {
  const parts = {
    ...buildWith(NO_CARD),
    PSU: notOnFile("PSU", NO_CABLES),
    Cabinet: notOnFile("Cabinet", { maxGpuLengthMm: 300, maxCoolerHeightMm: 160 }),
  };
  const notice = ruleOf(report(parts), "RULE_J_SPEC_UNVERIFIED");
  assertEquals(notice.label, "Component specifications preliminary / unverified");
  assertEquals(
    notice.explanation,
    "1 component(s) don't have their full specifications stated in the catalogue. Also not on file, but not used by this build: power connectors of QZX Supply.",
  );
  assertEquals(notice.affectedSlots, ["PSU", "Cabinet"]);
});

Deno.test("NOTICE: a part with values stated but unconfirmed keeps the warning", () => {
  const titled = notOnFile("PSU", {
    ratedWattage: 650,
    fieldSources: { ratedWattage: "title_inferred" },
  });
  const unreviewed = notOnFile("PSU", { ratedWattage: 650, unreviewedSpecs: ["Wattage"] });
  for (const supply of [titled, unreviewed]) {
    const notice = ruleOf(report({ ...buildWith(NO_CARD), PSU: supply }), "RULE_J_SPEC_UNVERIFIED");
    assertEquals(notice.label, "Component specifications preliminary / unverified");
  }
});

Deno.test("NOTICE: a part with nothing stated keeps the warning", () => {
  const blank = { ...part("PSU", {}), isVerified: false, specs: { provenance: "unverified" } };
  const notice = ruleOf(report({ ...buildWith(NO_CARD), PSU: blank }), "RULE_J_SPEC_UNVERIFIED");
  assertEquals(notice.label, "Component specifications preliminary / unverified");
});

Deno.test("NOTICE: the wording never changes a result or a status", () => {
  const random = randomFrom(4242);
  for (let run = 0; run < 400; run++) {
    const changes: Record<string, Specs | null> = {};
    for (const slot of Object.keys(COMPLETE)) {
      if (random() < 0.15) {
        changes[slot] = null;
        continue;
      }
      const blanks: Specs = {};
      for (const key of Object.keys(COMPLETE[slot])) if (random() < 0.2) blanks[key] = undefined;
      changes[slot] = blanks;
    }
    const parts = buildWith(changes);
    for (const slot of Object.keys(parts))
      if (random() < 0.3) parts[slot] = { ...parts[slot], isVerified: false };
    const full = report(parts);
    const plain = report(parts, { withoutMissingInputs: true });
    const shape = (summary: any) =>
      summary.items.map((i: any) => [i.ruleId, i.status, i.severity, i.affectedSlots.join()]);
    assertEquals(shape(full), shape(plain), JSON.stringify(changes));
    assertEquals(full.status, plain.status);
    assertEquals(full.validForAutomatedRecommendation, plain.validForAutomatedRecommendation);
  }
});

Deno.test("NOTICE: Find My PC's card says the same, for a build with no card", () => {
  const items = LISTINGS({
    CPU: { integrated_graphics: "true" },
    PSU: { pcie_6plus2_count: "", pcie_16pin_count: "" },
  }).map((item: any) => ({
    ...item,
    specs: Object.fromEntries(Object.entries(item.specs).filter(([, v]) => v !== "")),
  }));
  const builds = generateDynamicCatalogRecommendations(
    syncBuilderCatalogWithShopify(items).componentCatalog,
    { purpose: "programming", details: {}, brands: [], wifi: "", owned: [] },
    { min: 0, max: 500000 },
    { allowUnverified: true },
  );
  const noCard = builds.find((build: any) => !build.parts.GPU);
  assert(noCard, "a build with no card is offered");
  assertEquals(noCard.requiresReview, false);
  assertEquals(
    noCard.advisories.map((a: any) => a.label),
    ["Some specifications aren't on file"],
  );
  assert(!/confirm/i.test(noCard.advisories[0].explanation), noCard.advisories[0].explanation);
  assert(
    noCard.rankingReasons.some((reason: string) => reason.startsWith("No recommendation label")),
    noCard.rankingReasons.join(" | "),
  );
  const expert = expertCheckOf(noCard);
  assertEquals(expert.summary.status, "conditional");
  const advice = expert.result.find((r: any) => r.label === "Some specifications aren't on file");
  assertEquals(advice.advice, noCard.advisories[0].explanation);
});
