// supabase/functions/tests/pc-builder-exact-model.test.ts
// A registry entry's values belong to one exact model. A near neighbour, such as a DDR4 version of a DDR5
// board or a Wi-Fi version of a board with none, must not inherit them. It stays unknown and goes to review.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { detectComponentSlot, matchShopifyProductToComponent } =
  await import("../../../src/lib/builder/catalog.ts");
const { checkCompatibility } = await import("../../../src/lib/builder/compatibility.ts");

const match = (name: string, specs: Record<string, unknown> = {}): any =>
  matchShopifyProductToComponent({
    id: "gid://shopify/Product/1",
    name,
    handle: "h",
    price: 1000,
    tags: [],
    variantId: "gid://shopify/ProductVariant/1",
    availableForSale: true,
    stock: 5,
    specs,
  } as any);

const EXACT: [string, string][] = [
  ["AMD Ryzen 5 5600", "cpu-r5-5600"],
  ["AMD Ryzen 5 7600", "cpu-r5-7600"],
  ["AMD Ryzen 7 9700X", "cpu-r7-9700x"],
  ["Intel Core i5-12400F", "cpu-i5-12400f"],
  ["Intel Core i5-14600K", "cpu-i5-14600k"],
  ["MSI PRO B650M-P Micro-ATX Motherboard", "mobo-b650m"],
  ["ASUS Prime B550M-A WiFi II Motherboard", "mobo-b550m"],
  ["MSI B760M Bomber DDR5 Motherboard", "mobo-b760m"],
  ["MSI MAG Z790 Tomahawk WiFi Motherboard", "mobo-z790"],
  ["ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", "gpu-rtx4060"],
  ["Gigabyte GeForce RTX 4070 Super Windforce 12GB", "gpu-rtx4070-super"],
  ["Gigabyte GeForce RTX 4070 Super Windforce OC 12GB", "gpu-rtx4070-super"],
  ["ASRock AMD Radeon RX 7600 Challenger 8GB OC", "gpu-rx7600"],
  ["Corsair RM750e 750W 80 Plus Gold Fully Modular PSU", "psu-750w"],
  ["Deepcool PK650D 650W 80 Plus Bronze Power Supply", "psu-650w"],
  ["Deepcool PK550D 550W 80 Plus Bronze Power Supply", "psu-550w"],
  ["Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", "case-atx"],
  ["Ant Esports ICE-100 Air Mini Mesh Micro-ATX Case", "case-matx"],
  ["Deepcool LE520 240mm ARGB AIO Liquid Cooler", "cooler-le520"],
  ["Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler", "cooler-ag400"],
  ["Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", "ssd-1tb-nvme"],
  ["Kingston NV2 500GB PCIe M.2 NVMe SSD", "ssd-500gb-nvme"],
  ["Corsair Vengeance 16GB (1x16GB) DDR5 5200MHz", "ram-16gb-ddr5"],
  ["Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36", "ram-32gb-ddr5"],
  ["Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", "ram-16gb-ddr4"],
];

const NEIGHBOURS = [
  "AMD Ryzen 5 5600X",
  "AMD Ryzen 5 5600G",
  "AMD Ryzen 5 5600GT",
  "AMD Ryzen 5 5600T",
  "AMD Ryzen 5 7600X",
  "AMD Ryzen 5 7600X3D",
  "AMD Ryzen 7 9700F",
  "Intel Core i5-12400",
  "Intel Core i5-14600KF",
  "Intel Core i5-14600",
  "MSI PRO B650M-P WIFI Motherboard",
  "MSI PRO B650M-A WIFI Motherboard",
  "ASUS Prime B550M-A Motherboard",
  "ASUS Prime B550M-A AC Motherboard",
  "ASUS Prime B550M-K Motherboard",
  "MSI B760M Bomber WIFI DDR4 Motherboard",
  "MSI MAG Z790 Tomahawk WiFi DDR4 Motherboard",
  "MSI MAG Z790 Tomahawk Max WiFi Motherboard",
  "MSI MAG Z790 Carbon WiFi Motherboard",
  "MSI PRO Z790-P WiFi Motherboard",
  "ZOTAC Gaming GeForce RTX 4060 Ti 8GB Twin Edge",
  "MSI GeForce RTX 4060 Ventus 2X",
  "Gigabyte GeForce RTX 4070 Ti Super Windforce 16GB",
  "Gigabyte GeForce RTX 4070 Windforce 12GB",
  "ASRock Radeon RX 7600 XT Challenger 16GB OC",
  "Corsair RM750x 750W 80 Plus Gold PSU",
  "Corsair RM750 750W PSU",
  "Deepcool PK650W 650W Power Supply",
  "Deepcool PM650D 650W Power Supply",
  "Cooler Master MWE 650W Bronze Power Supply",
  "Ant Esports VS400L Value Series Power Supply",
  "Deepcool CC560 Mid-Tower Case",
  "Deepcool LE240 AIO Cooler",
  "Deepcool AG400 Digital CPU Cooler",
  "Crucial P3 1TB PCIe M.2 NVMe SSD",
  "Samsung 980 1TB NVMe SSD",
  "Kingston NV3 500GB PCIe M.2 NVMe SSD",
  "Corsair Vengeance 16GB (1x16GB) DDR5 6000MHz",
  "Kingston Fury 16GB DDR5 5200MHz",
  "G.Skill 16GB DDR4 3200MHz",
  "Corsair Vengeance LPX 16GB (1x16GB) DDR4 3200MHz",
  "Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL30",
  "Ant Esports ICE-100 Air Mesh ATX Mid-Tower Case",
];

Deno.test("MODEL: each listed model reaches its own registry entry", () => {
  const wrong = EXACT.filter(([name, key]) => match(name)?.matchedModelKey !== key).map(
    ([name, key]) => `${name}: got ${match(name)?.matchedModelKey}, expected ${key}`,
  );
  assertEquals(wrong, []);
});

Deno.test("MODEL: a near neighbour never inherits another model's values", () => {
  const wrong = NEIGHBOURS.filter((name) => match(name)?.matchedModelKey).map(
    (name) => `${name}: got ${match(name)?.matchedModelKey}`,
  );
  assertEquals(wrong, []);
});

Deno.test("MODEL: the DDR4 version of a DDR5 board isn't told it takes DDR5", () => {
  const board = match("MSI MAG Z790 Tomahawk WiFi DDR4 Motherboard");
  assert(board.specs.supportedRamGeneration !== "DDR5");
});

// ── Graphics cards are found by what their maker calls them ─────────────────────────────────────

Deno.test("SLOT: NVIDIA, AMD and Intel cards are all recognised", () => {
  for (const name of [
    "Intel Arc B580 12GB Graphics",
    "ASRock Intel Arc B580 Challenger 12GB OC",
    "Sparkle Intel Arc A380 Genie",
    "Intel Arc A750",
    "ASUS GT 1030 2GB",
    "Zotac GT 710 2GB",
    "MSI GTX 1650 D6 Ventus",
    "MSI GTX 750 Ti",
    "PowerColor RX 580 8GB",
    "XFX RX 6600 8GB",
    "AMD Radeon RX 7600",
    "NVIDIA RTX 3050 6GB",
    "PNY RTX A2000 12GB",
  ]) {
    assertEquals(detectComponentSlot(name, "", [], ""), "GPU", name);
  }
});

Deno.test("SLOT: other products with similar names aren't taken for graphics cards", () => {
  for (const name of [
    "ASUS TUF Gaming Laptop RTX 4060",
    "Lenovo LOQ Laptop Intel Arc Graphics",
    "HP Victus Notebook RX 6500M",
    "Realme GT 6T 5G Phone",
    "Sony RX100 Camera",
  ]) {
    assertEquals(detectComponentSlot(name, "", [], ""), null, name);
  }
});

Deno.test("COVERAGE: a card with no figures anywhere goes to review, whoever makes it", () => {
  const board = match("ASUS Prime B550M-A WiFi II Motherboard");
  const cpu = match("AMD Ryzen 5 5600");
  const psu = match("Corsair RM750e 750W 80 Plus Gold Fully Modular PSU");
  for (const name of [
    "Intel Arc B580 12GB Graphics",
    "PowerColor RX 580 8GB",
    "MSI GTX 1650 D6 Ventus",
    "NVIDIA RTX 5070 12GB",
  ]) {
    const card = match(name);
    assertEquals(card.slot, "GPU", name);
    const summary = checkCompatibility({ CPU: cpu, Motherboard: board, GPU: card, PSU: psu });
    assertEquals(summary.status, "unknown", name);
    assert(summary.valid, name);
    assert(
      summary.items.some((item: any) => item.ruleId === "RULE_E_POWER_DRAW_UNKNOWN"),
      name,
    );
  }
});

Deno.test("COVERAGE: chip figures only come from the three chips with a checked source", () => {
  assertEquals(match("MSI GeForce RTX 4060 Ventus 2X").specs.powerWatts, 115);
  assertEquals(match("MSI GeForce RTX 4060 Ventus 2X").specs.recommendedPsuWatts, 550);
  assertEquals(match("Vendor RTX 4070 Super Card").specs.powerWatts, 220);
  assertEquals(match("Vendor RX 7600 Card").specs.powerWatts, 165);
  // A chip's figures never state a card's connector, because makers differ.
  assertEquals(match("MSI GeForce RTX 4060 Ventus 2X").specs.requiredPciePins, undefined);
  // Nothing is invented for any other chip, including near neighbours of those three.
  for (const name of [
    "Vendor RTX 4060 Ti Card",
    "Vendor RTX 4070 Card",
    "Vendor RX 7600 XT Card",
  ]) {
    assertEquals(match(name).specs.powerWatts, undefined, name);
    assertEquals(match(name).specs.recommendedPsuWatts, undefined, name);
  }
});
