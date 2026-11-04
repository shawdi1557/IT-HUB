// supabase/functions/tests/pc-builder-owned-parts.test.ts
// A part the customer owns isn't missing, isn't priced and can't be checked. Find My PC, the build page,
// Expert Mode and the quotation must all agree on that.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");
const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { calculateSystemPower, checkCompatibility, compatibility } =
  await import("../../../src/lib/builder/compatibility.ts");

let nextId = 9000;
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
const catalog = () =>
  syncBuilderCatalogWithShopify([
    product("AMD Ryzen 5 5600", { price: 9000 }),
    product("ASUS Prime B550M-A WiFi II Motherboard", { price: 9000 }),
    product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
    product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
    product("Corsair RM750e 750W 80 Plus Gold Fully Modular PSU", { price: 8000 }),
    product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
    product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
  ]).componentCatalog;
const answers = (owned: string[], wifi = ""): any => ({
  purpose: "gaming",
  details: {},
  budgetId: "x",
  brands: [],
  wifi,
  owned,
});
const WIDE = { min: 10000, max: 300000 };
const offer = (owned: string[], wifi = "") =>
  generateDynamicCatalogRecommendations(catalog(), answers(owned, wifi), WIDE, {
    allowUnverified: true,
  });

const COMBINATIONS = [
  [],
  ["GPU"],
  ["RAM"],
  ["Storage"],
  ["GPU", "RAM"],
  ["GPU", "Storage"],
  ["RAM", "Storage"],
  ["GPU", "RAM", "Storage"],
];

Deno.test("OWNED: the build page agrees with the engine, for every combination", () => {
  for (const owned of COMBINATIONS) {
    const builds = offer(owned);
    assert(builds.length > 0, owned.join());
    for (const build of builds) {
      const check = compatibility(build.parts, { ownedSlots: owned });
      assertEquals(check.valid, true, `valid: ${owned.join()}`);
      assertEquals(check.complete, true, `complete: ${owned.join()}`);
    }
  }
});

Deno.test("OWNED: the page's old call, without owned parts, is what used to reject the build", () => {
  const [build] = offer(["GPU"]);
  assertEquals(compatibility(build.parts).valid, false);
  assertEquals(compatibility(build.parts, { ownedSlots: ["GPU"] }).valid, true);
});

Deno.test("OWNED: owned parts aren't priced", () => {
  const full = offer([])[0].price;
  assertEquals(offer(["GPU"])[0].price, full - 28000);
  assertEquals(offer(["RAM"])[0].price, full - 3000);
  assertEquals(offer(["Storage"])[0].price, full - 5000);
  assertEquals(offer(["GPU", "RAM", "Storage"])[0].price, full - 36000);
});

Deno.test("OWNED: an owned part goes to a technician, and isn't called incompatible", () => {
  for (const owned of COMBINATIONS.slice(1)) {
    for (const build of offer(owned)) {
      assertEquals(build.requiresReview, true, owned.join());
      const summary = compatibility(build.parts, { ownedSlots: owned }).summary;
      assertEquals(summary.status, "unknown", owned.join());
      assert(!summary.items.some((item: any) => item.severity === "error"), owned.join());
    }
  }
});

Deno.test("OWNED: each owned part says what IT HUB must check", () => {
  const labels = (owned: string[]) =>
    compatibility(offer(owned)[0].parts, { ownedSlots: owned }).summary.items.map(
      (i: any) => i.label,
    );
  assert(labels(["GPU"]).includes("Your own graphics card needs checking"));
  assert(labels(["RAM"]).includes("Your own memory needs checking"));
  assert(labels(["Storage"]).includes("Your own storage needs checking"));
});

Deno.test("OWNED: an owned card's power is unknown, so the supply can't be called adequate", () => {
  const parts = offer(["GPU"])[0].parts;
  const canonical = compatibility(parts, { ownedSlots: ["GPU"] }).summary;
  assert(canonical.items.some((i: any) => i.ruleId === "RULE_E_POWER_DRAW_UNKNOWN"));
  assert(!canonical.items.some((i: any) => i.ruleId === "RULE_E_PSU_HEADROOM_ADEQUATE"));
  const power: any = calculateSystemPower({}, { ownsGpu: true });
  assertEquals(power.usesAssumedPower, true);
});

Deno.test("OWNED: each owned part goes to a technician by itself, with nothing else to check", () => {
  for (const slot of ["GPU", "RAM", "Storage"]) {
    assertEquals(checkCompatibility({}, { ownedSlots: [slot] }).hasBlockingUnknowns, true, slot);
  }
});

Deno.test("OWNED: no build with an owned part earns a label", () => {
  for (const owned of COMBINATIONS.slice(1)) {
    for (const build of offer(owned)) {
      assertEquals(build.tradeoffLabel, "Insufficient information", owned.join());
    }
  }
});

Deno.test("OWNED: strict mode offers nothing, because each needs review", () => {
  const strict = generateDynamicCatalogRecommendations(catalog(), answers(["GPU"]), WIDE);
  assertEquals(strict.length, 0);
});

Deno.test("OWNED: buying a part the customer said they own clears that check", () => {
  const [build] = offer(["GPU"]);
  const card = catalog().GPU[0];
  const check = compatibility({ ...build.parts, GPU: card }, { ownedSlots: [] });
  assert(!check.summary.items.some((i: any) => i.ruleId === "RULE_I_OWNED_GPU_UNCHECKED"));
});

Deno.test("OWNED: a mismatch among the parts being bought still rules the build out", () => {
  const mismatched = syncBuilderCatalogWithShopify([
    product("AMD Ryzen 5 7600", { price: 18000 }),
    product("ASUS Prime B550M-A WiFi II Motherboard", { price: 9000 }),
    product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
    product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
    product("Corsair RM750e 750W 80 Plus Gold Fully Modular PSU", { price: 8000 }),
    product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
  ]).componentCatalog;
  const builds = generateDynamicCatalogRecommendations(mismatched, answers(["GPU"]), WIDE, {
    allowUnverified: true,
  });
  assertEquals(builds.length, 0);
});

Deno.test("OWNED: a build with no owned parts behaves as before", () => {
  const [build] = offer([]);
  assertEquals(build.requiresReview, false);
  const summary = checkCompatibility({}, { ownedSlots: [] });
  assertEquals(summary.items.length, 0);
});

// ── Wi-Fi ────────────────────────────────────────────────────────────────────

Deno.test("WIFI: a board with Wi-Fi says so when it's asked for", () => {
  const [build] = offer([], "Yes");
  assert(build.purposeNotes.some((note: string) => note.includes("Has the Wi-Fi")));
});

Deno.test("WIFI: not needed adds nothing to the build", () => {
  const [build] = offer([], "No");
  assert(!build.purposeNotes.some((note: string) => note.includes("Wi-Fi")));
});

Deno.test("WIFI: a board stated to have none says so, and one that's silent says unconfirmed", () => {
  const board = (name: string, specs: any) =>
    product(name, {
      category: "Motherboards",
      price: 4000,
      specs: { socket: "AM4", ram_generation: "DDR4", form_factor: "ATX", ...specs },
    });
  const noted = (specs: any) => {
    const builds = generateDynamicCatalogRecommendations(
      syncBuilderCatalogWithShopify([
        product("AMD Ryzen 5 5600", { price: 9000 }),
        board("Vendor AM4 Board", specs),
        product("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", { price: 3000 }),
        product("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", { price: 5000 }),
        product("Corsair RM750e 750W 80 Plus Gold Fully Modular PSU", { price: 8000 }),
        product("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", { price: 3900 }),
        product("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", { price: 28000 }),
      ]).componentCatalog,
      answers([], "Yes"),
      WIDE,
      { allowUnverified: true },
    );
    return builds[0].purposeNotes.join(" ");
  };
  assert(noted({ wifi: "false" }).includes("has no Wi-Fi"), noted({ wifi: "false" }));
  assert(noted({}).includes("isn't confirmed"), noted({}));
  assert(noted({ wifi: "true" }).includes("Has the Wi-Fi"), noted({ wifi: "true" }));
});

// ── The page and the quotation ───────────────────────────────────────────────

const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
const edge = await Deno.readTextFile(
  new URL("../verify-and-submit-pc-quotation/index.ts", import.meta.url),
);

Deno.test("PAGE: every compatibility check on the page knows about owned parts", () => {
  const calls = page.match(/compatibility\(\s*[^)]*\)/g) || [];
  assert(calls.length >= 5, String(calls.length));
  for (const call of calls) {
    assert(call.includes("ownedSlots"), call);
  }
});

Deno.test("PAGE: a quotation doesn't demand a part the customer owns", () => {
  assert(page.includes("missingForQuotation(parts, owned)"));
  assert(!page.includes("missingForQuotation(parts)"));
});

Deno.test("PAGE: Expert Mode keeps what the customer owns, until they buy that part", () => {
  assert(page.includes("initialOwned = []"));
  assert(page.includes("const owned = ownedAtStart.filter((type) => !parts[type]);"));
  assert(page.includes("onExpert(parts, name, owned)"));
  assert(
    page.includes("initialOwned={expertSeed.parts.CPU || !saved ? expertSeed.owned : saved.owned}"),
  );
  assert(page.includes("ownedSlots: owned as any,"));
});

Deno.test("PAGE: Find My PC asks nothing about Wi-Fi or parts the customer owns", () => {
  assert(!page.includes("ownedOptions"));
  assert(!page.includes("wifiOptions"));
  assert(!page.includes('"Keyboard/Mouse"'));
  assert(!page.includes("brandOptions"));
  assert(!page.includes("Do you need Wi-Fi?"));
  assert(!page.includes("Do you already own any of these?"));
  assert(page.includes("const purposeReady = Boolean(answers.purpose);"));
});

Deno.test("PAGE: Find My PC offers review builds beside confirmed ones", () => {
  assert(!page.includes("confirmed.length > 0"));
  const start = page.indexOf("const builds = generateDynamicCatalogRecommendations(");
  assert(start > 0);
  assert(page.slice(start, start + 200).includes("allowUnverified: true"));
});

Deno.test("QUOTATION: a build with owned parts reaches a technician", () => {
  // The function flags anything short of compatible, and owned parts make a build "unknown".
  assert(edge.includes('compatibility?.status !== "compatible"'));
  const [build] = offer(["GPU"]);
  assert(compatibility(build.parts, { ownedSlots: ["GPU"] }).summary.status !== "compatible");
});
