// supabase/functions/tests/pc-builder-registry-sources.test.ts
// A registry value is manufacturer-verified only if a named official source confirmed it. Anything else
// stays on the list, unconfirmed, and can't support a label.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { matchShopifyProductToComponent, VERIFIED_HARDWARE_SPECS } =
  await import("../../../src/lib/builder/catalog.ts");
const { labelCompatibilityGaps, specConfidence } =
  await import("../../../src/lib/builder/compatibility.ts");

const entries = Object.entries(VERIFIED_HARDWARE_SPECS) as [string, any][];
const match = (name: string): any =>
  matchShopifyProductToComponent({
    id: "gid://shopify/Product/1",
    name,
    handle: "h",
    price: 1000,
    tags: [],
    variantId: "gid://shopify/ProductVariant/1",
    availableForSale: true,
    stock: 5,
    specs: {},
  } as any);
const OFFICIAL =
  /^https:\/\/(?:[a-z-]+\.)*(amd|intel|msi|asus|corsair|nvidia|gigabyte|asrock|crucial|kingston|deepcool|lenovo)\.com\//;

Deno.test("REGISTRY: all 25 entries were looked at", () => {
  assertEquals(entries.length, 25);
});

Deno.test("REGISTRY: only the two entries with no official page have no source", () => {
  const unsourced = entries.filter(([, entry]) => !entry.source).map(([key]) => key);
  assertEquals(unsourced.sort(), ["case-matx", "mobo-b760m"]);
});

Deno.test("REGISTRY: every source is an official page, dated, and says how it was read", () => {
  for (const [key, entry] of entries) {
    if (!entry.source) continue;
    assert(OFFICIAL.test(entry.source.url), `${key}: ${entry.source.url}`);
    assertEquals(entry.source.checkedOn, "2026-11-04", key);
    assertEquals(entry.source.readVia, "direct", key);
  }
});

Deno.test("REGISTRY: a value only quoted by search results verifies nothing", () => {
  const entry = (VERIFIED_HARDWARE_SPECS as any)["gpu-rx7600"];
  const original = entry.source;
  const name = "ASRock AMD Radeon RX 7600 Challenger 8GB OC";
  try {
    assertEquals(match(name).specs.provenance, "manufacturer_verified");
    entry.source = { ...original, readVia: "search" };
    const part = match(name);
    assertEquals(part.specs.provenance, "registry_unverified");
    assertEquals(specConfidence(part, "lengthMm"), "supplier_provided");
    assertEquals(specConfidence(part, "powerWatts"), "supplier_provided");
    // The value is still there to check against. It just can't support a label.
    assertEquals(part.specs.lengthMm, 270);
    assert(labelCompatibilityGaps({ GPU: part }, []).length > 0);
  } finally {
    entry.source = original;
  }
});

Deno.test("REGISTRY: ZOTAC's page can't be read, so only NVIDIA's chip figures are confirmed", () => {
  const card = match("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge");
  assertEquals(card.specs.provenance, "registry_unverified");
  assertEquals(card.specs.powerWatts, 115);
  assertEquals(
    card.specs.recommendedPsuWatts,
    550,
    "NVIDIA's figure, not the 500W search results quote",
  );
  assertEquals(specConfidence(card, "powerWatts"), "manufacturer_verified");
  assertEquals(specConfidence(card, "recommendedPsuWatts"), "manufacturer_verified");
  assertEquals(specConfidence(card, "lengthMm"), "supplier_provided");
  assertEquals(specConfidence(card, "requiredPciePins"), "supplier_provided");
  assert(labelCompatibilityGaps({ GPU: card }, []).join(" ").includes("Stated but not reviewed"));
});

Deno.test("REGISTRY: Intel's stated maximum power is held and sourced, and AMD's isn't invented", () => {
  const intel = match("Intel Core i5-14600K");
  assertEquals(intel.specs.maxTurboPowerWatts, 181);
  assertEquals(specConfidence(intel, "maxTurboPowerWatts"), "manufacturer_verified");
  assertEquals(match("Intel Core i5-12400F").specs.maxTurboPowerWatts, 117);
  for (const name of ["AMD Ryzen 5 5600", "AMD Ryzen 5 7600", "AMD Ryzen 7 9700X"]) {
    assertEquals(match(name).specs.maxTurboPowerWatts, undefined, name);
  }
});

Deno.test("REGISTRY: a source can only vouch for values the entry holds", () => {
  for (const [key, entry] of entries) {
    for (const field of entry.source?.fields || []) {
      assert(entry.specs[field] !== undefined, `${key} sources ${field}, which isn't there`);
    }
  }
});

Deno.test("REGISTRY: no entry declares its own verification any more", () => {
  for (const [key, entry] of entries) {
    assertEquals(entry.specs.provenance, undefined, key);
    assertEquals(entry.specs.lastVerifiedAt, undefined, key);
  }
});

// ── Per-value levels ─────────────────────────────────────────────────────────

Deno.test("LEVEL: a sourced value is manufacturer-verified", () => {
  const cpu = match("AMD Ryzen 5 5600");
  assertEquals(cpu.specs.provenance, "manufacturer_verified");
  assertEquals(specConfidence(cpu, "socket"), "manufacturer_verified");
  assertEquals(cpu.specs.lastVerifiedAt, "2026-11-04");
});

Deno.test("LEVEL: a value its source doesn't confirm is downgraded, on that value alone", () => {
  // Deepcool's page gives the connectors, but never states the wattage.
  const psu = match("Deepcool PK650D 650W 80 Plus Bronze Power Supply");
  assertEquals(specConfidence(psu, "pciePowerConnectors"), "manufacturer_verified");
  assertEquals(specConfidence(psu, "ratedWattage"), "supplier_provided");
  assertEquals(psu.specs.provenance, "registry_unverified");
  assert(
    labelCompatibilityGaps({ PSU: psu }, []).some((gap: string) =>
      gap.includes("wattage of Deepcool"),
    ),
  );
});

Deno.test("LEVEL: an entry with no source is downgraded throughout", () => {
  const board = match("MSI B760M Bomber DDR5 Motherboard");
  assertEquals(board.specs.provenance, "registry_unverified");
  assertEquals(specConfidence(board, "socket"), "supplier_provided");
  const cabinet = match("Ant Esports ICE-100 Air Mini Mesh Micro-ATX Case");
  assertEquals(cabinet.specs.provenance, "registry_unverified");
  assert(labelCompatibilityGaps({ Cabinet: cabinet }, []).length > 0);
});

Deno.test("LEVEL: an unconfirmed value still works as data, and the rules still use it", () => {
  const psu = match("Deepcool PK650D 650W 80 Plus Bronze Power Supply");
  assertEquals(psu.specs.ratedWattage, 650);
  // Being on the list states the value, but it doesn't verify it.
  assertEquals(psu.isVerified, false);
  assertEquals(specConfidence(psu, "ratedWattage"), "supplier_provided");
});

Deno.test("LEVEL: a processor's page that doesn't mention a cooler leaves that value unconfirmed", () => {
  const cpu = match("Intel Core i5-14600K");
  assertEquals(specConfidence(cpu, "includesCooler"), "supplier_provided");
  assertEquals(specConfidence(cpu, "socket"), "manufacturer_verified");
  assertEquals(cpu.specs.provenance, "registry_unverified");
});

Deno.test("LEVEL: fully sourced parts can support a label on their own", () => {
  for (const name of [
    "AMD Ryzen 5 5600",
    "AMD Ryzen 5 7600",
    "AMD Ryzen 7 9700X",
    "Intel Core i5-12400F",
    "ASUS Prime B550M-A WiFi II Motherboard",
    "MSI PRO B650M-P Micro-ATX Motherboard",
    "MSI MAG Z790 Tomahawk WiFi Motherboard",
    "Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz",
    "Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36",
    "Gigabyte GeForce RTX 4070 Super Windforce 12GB",
    "ASRock AMD Radeon RX 7600 Challenger 8GB OC",
    "Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD",
    "Corsair RM750e 750W 80 Plus Gold Fully Modular PSU",
    "Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case",
  ]) {
    const part = match(name);
    assertEquals(part.specs.provenance, "manufacturer_verified", name);
    assertEquals(labelCompatibilityGaps({ [part.slot]: part }, []), [], name);
  }
});

// ── Corrections the sources required ─────────────────────────────────────────

const specs = (key: string) => (VERIFIED_HARDWARE_SPECS as any)[key].specs;

Deno.test("CORRECTED: Gigabyte recommends 700W, with a dual 8-pin adapter in the box", () => {
  assertEquals(specs("gpu-rtx4070-super").recommendedPsuWatts, 700);
  assertEquals(specs("gpu-rtx4070-super").pcie16PinAdapter8PinCount, 2);
});

Deno.test("CORRECTED: motherboard figures match the maker", () => {
  assertEquals(specs("mobo-z790").sataPortCount, 7);
  // MSI lists two figures for each, so the lower one is used.
  assertEquals(specs("mobo-z790").maxRamCapacityGb, 128);
  assertEquals(specs("mobo-b650m").maxRamCapacityGb, 128);
});

Deno.test("CORRECTED: values with no support on the Bomber entry are gone", () => {
  assertEquals(specs("mobo-b760m").hasWifi, undefined);
  assertEquals(specs("mobo-b760m").maxRamCapacityGb, undefined);
});

Deno.test("CORRECTED: the CC560 V2's cooler limit, and it no longer matches the original CC560", () => {
  assertEquals(specs("case-atx").maxCoolerHeightMm, 165);
  const original = match("Deepcool CC560 Mid-Tower Case");
  assertEquals(original?.matchedModelKey, undefined);
});

Deno.test("CORRECTED: Deepcool rates the LE520 at 220W, and lists LGA1851", () => {
  assertEquals(specs("cooler-le520").maxTdpRatingWatts, 220);
  assert(specs("cooler-le520").supportedSockets.includes("LGA1851"));
  assert(specs("cooler-ag400").supportedSockets.includes("LGA1851"));
});

Deno.test("CORRECTED: lengths are rounded up, so rounding never passes a tight cabinet", () => {
  assertEquals(specs("gpu-rx7600").lengthMm, 270);
  assertEquals(specs("gpu-rtx4060").lengthMm, 222);
});

Deno.test("CORRECTED: the RM750e's connectors are from Corsair, and the R27qe Gen 2 is 200Hz", () => {
  assertEquals(specs("psu-750w").pciePowerConnectors, ["1x 12V-2x6", "1x 8-pin"]);
  assert((VERIFIED_HARDWARE_SPECS as any)["monitor-r27qe"].title.includes("200Hz"));
});

// ── The corrected data, through the rules ────────────────────────────────────

const { checkCompatibility } = await import("../../../src/lib/builder/compatibility.ts");

Deno.test("RULES: the 4070 SUPER on a 650W Deepcool goes to review, because Gigabyte asks for 700W", () => {
  const summary = checkCompatibility({
    CPU: match("AMD Ryzen 5 5600"),
    GPU: match("Gigabyte GeForce RTX 4070 Super Windforce 12GB"),
    PSU: match("Deepcool PK650D 650W 80 Plus Bronze Power Supply"),
  });
  assert(summary.items.some((i: any) => i.ruleId === "RULE_E_PSU_BELOW_RECOMMENDED"));
  // The dual 8-pin cables work through the adapter in the card's box.
  assert(summary.items.some((i: any) => i.ruleId === "RULE_F_PCIE_POWER_MATCH"));
  assert(!summary.items.some((i: any) => i.severity === "error"));
});

Deno.test("RULES: the same card on the RM750e passes on its native 16-pin cable", () => {
  const summary = checkCompatibility({
    CPU: match("AMD Ryzen 5 5600"),
    GPU: match("Gigabyte GeForce RTX 4070 Super Windforce 12GB"),
    PSU: match("Corsair RM750e 750W 80 Plus Gold Fully Modular PSU"),
  });
  assert(summary.items.some((i: any) => i.ruleId === "RULE_F_PCIE_POWER_MATCH"));
  assert(!summary.items.some((i: any) => i.ruleId === "RULE_E_PSU_BELOW_RECOMMENDED"));
});

Deno.test("REGISTRY: the counts reported to the owner are the counts in the code", () => {
  const levels: Record<string, string[]> = {};
  for (const [key, entry] of entries) {
    const part = match(entry.title);
    assertEquals(part.matchedModelKey, key, entry.title);
    (levels[part.specs.provenance] ||= []).push(key);
  }
  assertEquals(levels.manufacturer_verified.length, 19);
  assertEquals(levels.registry_unverified.sort(), [
    "case-matx",
    "cpu-i5-14600k",
    "gpu-rtx4060",
    "mobo-b760m",
    "psu-550w",
    "psu-650w",
  ]);
});
