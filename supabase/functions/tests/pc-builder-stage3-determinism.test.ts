// Stage 3 Phase 1: golden catalogues, baseline measurements, determinism and stable build IDs. Every listing here
// is made up, with made-up test prices, and none is IT HUB stock. In memory, with no network and no writes.

import {
  assert,
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GOLDEN_CATALOGUES,
  GOLDEN_SEARCHES,
  measureOffers,
  offerSet,
} from "./_helpers/stage3-golden.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const {
  buildIdentityKey,
  generateDynamicCatalogRecommendations,
  getBudgetShortfallInfo,
  recommendationId,
  stableHash,
} = await import("../../../src/lib/builder/recommendations.ts");
const { purposeProfile } = await import("../../../src/lib/builder/purpose.ts");
const { getPendingQuotation, pendingMatchesBuild, savePendingQuotation, clearPendingQuotation } =
  await import("../../../src/lib/builder/persistence.ts");

// Phase 2 changes which builds are offered, by the owner's rulings, the strict budget range of 7 November 2026
// changes them again, Phase 3's candidate selection (approved the same day) again, and Phase 4's drive rule
// (P4-1, 13 November 2026: the cheapest drive that fits, never chosen by its title) again, so these tests read
// the separate Phase 4 record. The Phase 1 (stage3-golden-baseline.json), first Phase 2
// (stage3-phase2-baseline.json), strict-range (stage3-strict-baseline.json) and Phase 3
// (stage3-phase3-baseline.json) records are kept unchanged, and the selection tests check they are, byte for byte.
const BASELINE = JSON.parse(
  await Deno.readTextFile(new URL("./_helpers/stage3-phase4-baseline.json", import.meta.url)),
);
/** The record's builds without the chip, role and guarantee the roles tests compare. */
const withoutRoles = (offers: any[]) =>
  offers.map(({ chip: _chip, role: _role, guarantee: _guarantee, ...offer }) => offer);

const catalogueOf = (listings: any[]) => syncBuilderCatalogWithShopify(listings).componentCatalog;
const searchIn =
  (catalogue: any) =>
  (purpose: string, details: Record<string, string>, min: number, max: number) =>
    generateDynamicCatalogRecommendations(
      catalogue,
      { purpose, details, brands: [] },
      { min, max },
      { allowUnverified: true },
    ) as any[];
const searchKey = (s: {
  purpose: string;
  details: Record<string, string>;
  min: number;
  max: number;
}) => `${s.purpose}|${JSON.stringify(s.details)}|${s.min}-${s.max}`;

// A small repeatable generator, so a failing order can be reproduced.
const randomFrom = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const shuffled = <T>(items: T[], seed: number) => {
  const random = randomFrom(seed);
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
/** The original order, reversed, and eight shuffles: ten orders of the same catalogue. */
const tenOrders = <T>(items: T[]) => [
  items,
  items.slice().reverse(),
  ...[11, 22, 33, 44, 55, 66, 77, 88].map((seed) => shuffled(items, seed)),
];
/** Everything a customer sees that order could affect: which builds, in which order, with which IDs. */
const shownAs = (builds: any[]) =>
  builds.map((b) => `${b.templateId}|${b.price}|${offerSet([b])[0].parts}`);

// ── The baseline: the builds offered, and their prices, are the ones recorded after Phase 4 ───────

for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
  Deno.test(`S3 baseline ${name}: the same builds and prices as the Phase 4 record, for every search`, () => {
    const search = searchIn(catalogueOf(make()));
    const recorded = BASELINE.catalogues[name];
    assertEquals(make().length, recorded.listings);
    for (const s of GOLDEN_SEARCHES) {
      assertEquals(
        offerSet(search(s.purpose, s.details, s.min, s.max)),
        withoutRoles(recorded.offers[searchKey(s)]),
        `${name} ${searchKey(s)}`,
      );
    }
  });

  Deno.test(`S3 baseline ${name}: the measurements match the record`, () => {
    const { milliseconds: _time, ...metrics } = measureOffers(searchIn(catalogueOf(make())));
    assertEquals(metrics, BASELINE.catalogues[name].metrics);
  });
}

Deno.test("S3 golden: the catalogues are what the contract describes", () => {
  const listings = Object.fromEntries(
    Object.entries(GOLDEN_CATALOGUES).map(([name, make]) => [name, make()]),
  );
  assertEquals(listings.large.length, 2400);
  assertEquals(listings.singlePerSlot.length, 8);
  assert(
    !listings.missingCategory.some((item: any) => item.category === "Computer Power Supplies"),
  );
  const catalogue = catalogueOf(listings.evidenceRich);
  for (const slot of ["CPU", "GPU"]) {
    assert(
      catalogue[slot].some((part: any) => part.specs?.performance?.sourceUrl),
      `${slot} parts with sourced published figures`,
    );
  }
  for (const name of Object.keys(listings)) {
    for (const item of listings[name])
      assert(item.name.startsWith("QZX") || item.id.includes("rich"), item.name);
  }
});

Deno.test("S3 golden: a missing power supply gives no build, in every search", () => {
  const search = searchIn(catalogueOf(GOLDEN_CATALOGUES.missingCategory()));
  for (const s of GOLDEN_SEARCHES) assertEquals(search(s.purpose, s.details, s.min, s.max), []);
});

Deno.test("S3 golden: the band's edges are where the contract puts them", () => {
  const search = searchIn(catalogueOf(GOLDEN_CATALOGUES.budgetEdge()));
  const prices = search("gaming", {}, 60000, 80000).map((b) => b.price);
  assert(prices.includes(60000), prices.join());
  assert(prices.includes(80000), prices.join());
  assert(!prices.includes(80001), prices.join());
});

// ── Determinism ────────────────────────────────────────────────────────────────────────────────────

for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
  Deno.test(`S3 determinism ${name}: ten catalogue orders give identical builds, order and IDs`, () => {
    // The large catalogue takes one search per band, so the test stays quick. The others take every search.
    const searches =
      name === "large"
        ? GOLDEN_SEARCHES.filter((s) => s.purpose === "gaming" && !s.details.resolution)
        : GOLDEN_SEARCHES;
    const orders = tenOrders(make());
    const expected = searches.map((s) =>
      shownAs(searchIn(catalogueOf(orders[0]))(s.purpose, s.details, s.min, s.max)),
    );
    for (const [index, order] of orders.entries()) {
      const search = searchIn(catalogueOf(order));
      searches.forEach((s, i) => {
        assertEquals(
          shownAs(search(s.purpose, s.details, s.min, s.max)),
          expected[i],
          `${name} order ${index}, ${searchKey(s)}`,
        );
      });
    }
  });
}

Deno.test("S3 determinism: builds are shown by total price, then by their parts", () => {
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    if (name === "large") continue;
    const search = searchIn(catalogueOf(make()));
    for (const s of GOLDEN_SEARCHES) {
      const builds = search(s.purpose, s.details, s.min, s.max);
      for (let i = 1; i < builds.length; i++) {
        const [a, b] = [builds[i - 1], builds[i]];
        const inOrder =
          a.price < b.price ||
          (a.price === b.price &&
            buildIdentityKey(a.parts, a.owned) <= buildIdentityKey(b.parts, b.owned));
        assert(inOrder, `${name} ${searchKey(s)}: ${a.price} then ${b.price}`);
      }
    }
  }
});

Deno.test("S3 determinism: equal prices are ordered by parts, not by the order Shopify listed them", () => {
  const listings = GOLDEN_CATALOGUES.singlePerSlot();
  const twin = {
    ...listings.find((item) => item.category === "Video Cards")!,
    id: "gid://shopify/Product/single-twin",
    variantId: "gid://shopify/ProductVariant/single-twin",
    name: "QZX Single GPU Twin",
  };
  const results = [
    [...listings, twin],
    [twin, ...listings],
  ].map((order) => shownAs(searchIn(catalogueOf(order))("gaming", {}, 40000, 60000)));
  assertEquals(results[0], results[1]);
});

// ── Stable build IDs ─────────────────────────────────────────────────────────────────────────────

Deno.test("S3 IDs: the same configuration and purpose always get the same ID", () => {
  const search = searchIn(catalogueOf(GOLDEN_CATALOGUES.evidenceRich()));
  const first = search("gaming", {}, 80000, 100000).map((b) => b.templateId);
  const again = searchIn(catalogueOf(GOLDEN_CATALOGUES.evidenceRich()))(
    "gaming",
    {},
    80000,
    100000,
  ).map((b) => b.templateId);
  assert(first.length > 0);
  assertEquals(again, first);
  for (const id of first) assertMatch(id, /^build-[0-9a-f]{16}$/);
});

Deno.test("S3 IDs: they depend on the parts, the customer's own slots and the purpose, nothing else", () => {
  const parts = { CPU: { id: "a", variantId: "va" }, GPU: { id: "b", variantId: "vb" } };
  const id = recommendationId("build", parts, [], "gaming");
  assertEquals(
    recommendationId("build", { GPU: parts.GPU, CPU: parts.CPU }, [], "gaming"),
    id,
    "slot order",
  );
  assertNotEquals(recommendationId("build", parts, [], "programming"), id, "purpose");
  assertNotEquals(recommendationId("build", parts, ["RAM"], "gaming"), id, "own parts");
  assertNotEquals(
    recommendationId("build", { ...parts, GPU: { id: "b", variantId: "vc" } }, [], "gaming"),
    id,
    "a part",
  );
  assertMatch(recommendationId("closest", parts, [], "gaming"), /^closest-[0-9a-f]{16}$/);
  assertEquals(
    recommendationId("closest", parts, [], "gaming").slice(8),
    id.slice(6),
    "the same configuration",
  );
});

Deno.test("S3 IDs: no two different builds share an ID across every golden search", () => {
  const seen = new Map<string, string>();
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    if (name === "large") continue;
    const search = searchIn(catalogueOf(make()));
    for (const s of GOLDEN_SEARCHES) {
      for (const build of search(s.purpose, s.details, s.min, s.max)) {
        const identity = `${buildIdentityKey(build.parts, build.owned)}|purpose:${s.purpose}`;
        const earlier = seen.get(build.templateId);
        if (earlier) assertEquals(earlier, identity, build.templateId);
        seen.set(build.templateId, identity);
      }
    }
  }
  assert(seen.size > 20, `${seen.size} distinct builds`);
});

Deno.test("S3 IDs: 200,000 different identities give 200,000 different hashes", () => {
  const hashes = new Set<string>();
  for (let i = 0; i < 200000; i++)
    hashes.add(stableHash(`CPU:v${i % 997}|GPU:v${Math.floor(i / 997)}|owned:|purpose:gaming`));
  assertEquals(hashes.size, 200000);
  assertEquals(stableHash("identical"), stableHash("identical"));
  assertMatch(stableHash(""), /^[0-9a-f]{16}$/);
});

Deno.test("S3 IDs: the closest build above the budget gets a stable ID too", () => {
  const catalogue = catalogueOf(GOLDEN_CATALOGUES.singlePerSlot());
  const answers = { purpose: "gaming", details: {}, brands: [] };
  const first = getBudgetShortfallInfo(
    catalogue,
    answers,
    { min: 10000, max: 20000 },
    { allowUnverified: true },
  ) as any;
  const again = getBudgetShortfallInfo(
    catalogue,
    answers,
    { min: 10000, max: 20000 },
    { allowUnverified: true },
  ) as any;
  assert(first?.closestBuild, "a closest build is offered");
  assertMatch(first.closestBuild.templateId, /^closest-[0-9a-f]{16}$/);
  assertEquals(again.closestBuild.templateId, first.closestBuild.templateId);
});

Deno.test("S3 IDs: a pending quotation kept with an old-style ID still restores, and still matches its build", () => {
  const parts = {
    CPU: { id: "gid://shopify/Product/1", name: "QZX CPU" },
    GPU: { id: "gid://shopify/Product/2", name: "QZX GPU" },
  };
  const legacyId = "dyn-build-1-lz4k2m9";
  clearPendingQuotation();
  savePendingQuotation({
    mode: "customise",
    build: {
      templateId: legacyId,
      name: "Kept build",
      components: {},
      currency: "INR",
      createdAt: "x",
      updatedAt: "x",
    } as any,
    parts,
    name: "Kept build",
    ownedSlots: ["RAM"],
  });
  const pending = getPendingQuotation()!;
  assertEquals(pending.build.templateId, legacyId, "the stored ID is kept as it was");
  assert(pendingMatchesBuild(pending, parts, ["RAM"]), "matched by its parts, not its ID");
  assert(
    !pendingMatchesBuild(pending, { ...parts, GPU: { id: "gid://shopify/Product/3" } }, ["RAM"]),
  );
  clearPendingQuotation();
});

Deno.test("S3 IDs: nothing looks a build up by a regenerated ID", async () => {
  const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
  const persistence = await Deno.readTextFile(
    new URL("../../../src/lib/builder/persistence.ts", import.meta.url),
  );
  for (const source of [page, persistence]) {
    assert(
      !/templateId\s*===|===\s*[\w.?]*templateId|find\([^)]*templateId/.test(source),
      "no lookup by templateId",
    );
  }
  // Recommendation IDs only. The unused legacy generateRecommendations still makes time-based IDs for its own
  // unsaved build objects, which nothing in the app calls.
  assert(
    !/dyn-build-|templateId:\s*`[^`]*Date\.now/.test(
      await Deno.readTextFile(
        new URL("../../../src/lib/builder/recommendations.ts", import.meta.url),
      ),
    ),
  );
});

// ── Purposes ──────────────────────────────────────────────────────────────────────────────────────

Deno.test("S3 purpose: every purpose the page offers is a BuildPurpose", async () => {
  const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
  const types = await Deno.readTextFile(
    new URL("../../../src/lib/builder/types.ts", import.meta.url),
  );
  const block = page.slice(page.indexOf("const purposes"), page.indexOf("const purposes") + 3000);
  const offered = [...block.matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
  const declared = types.slice(
    types.indexOf("export type BuildPurpose"),
    types.indexOf(";", types.indexOf("export type BuildPurpose")),
  );
  assertEquals(offered.sort(), [
    "creation",
    "gaming",
    "general",
    "professional",
    "programming",
    "work",
  ]);
  for (const purpose of offered) assert(declared.includes(`"${purpose}"`), purpose);
});

Deno.test("S3 purpose: work and professional give complete builds, with the right card rule", () => {
  const search = searchIn(catalogueOf(GOLDEN_CATALOGUES.evidenceRich()));
  for (const [purpose, details] of [
    ["work", {}],
    ["professional", { type: "Software Development" }],
    ["professional", { type: "CAD" }],
  ] as [string, Record<string, string>][]) {
    assert(
      search(purpose, details, 60000, 100000).length > 0,
      `${purpose} ${JSON.stringify(details)}`,
    );
  }
  assertEquals(purposeProfile("work", {}).requiresDedicatedGpu, false);
  assertEquals(
    purposeProfile("professional", { type: "Software Development" }).requiresDedicatedGpu,
    false,
  );
  assertEquals(purposeProfile("professional", { type: "CAD" }).requiresDedicatedGpu, true);
  assertEquals(purposeProfile("professional", { type: "CAD" }).requirement?.software, "AutoCAD");
});

// ── Ties that only the normalised order or the stable key can settle ────────────────────────────

/** Two listings at the same price whose product-ID order is the opposite of their identity-key order. */
const twinPair = (slot: string) => {
  const listings = GOLDEN_CATALOGUES.singlePerSlot();
  const original = listings.find((item) => item.name === `QZX Single ${slot}`)!;
  const twin = {
    ...original,
    id: "gid://shopify/Product/single-0000-twin",
    variantId: "gid://shopify/ProductVariant/zz-twin",
    name: `QZX Single ${slot} Twin`,
  };
  return { listings, original, twin };
};

Deno.test("S3 order: between equal-priced parts, the same one is chosen whatever order they're listed in", () => {
  const { listings, twin } = twinPair("Cabinet");
  const results = [
    [...listings, twin],
    [twin, ...listings],
  ].map((order) =>
    offerSet(searchIn(catalogueOf(order))("gaming", {}, 40000, 60000)).map((offer) => offer.parts),
  );
  assertEquals(results[0], results[1]);
});

Deno.test("S3 order: builds at the same price are shown by their parts, not by when they were found", () => {
  const { listings, original, twin } = twinPair("GPU");
  const builds = searchIn(catalogueOf([...listings, twin]))("gaming", {}, 40000, 60000);
  const samePrice = builds.filter((build) => build.price === builds[0].price);
  assertEquals(samePrice.length, 2);
  // The twin's product ID sorts first, but its identity key sorts last.
  assertEquals(
    samePrice.map((build) => build.parts.GPU.id),
    [original.id, twin.id],
  );
});

Deno.test("S3 order: the closest build above the budget is chosen by its parts when prices tie", () => {
  const { listings, original } = twinPair("GPU");
  const catalogue = catalogueOf(listings.concat(twinPair("GPU").twin));
  const info = getBudgetShortfallInfo(
    catalogue,
    { purpose: "gaming", details: {}, brands: [] },
    { min: 10000, max: 20000 },
    { allowUnverified: true },
  ) as any;
  assertEquals(info.closestBuild.parts.GPU.id, original.id);
});
