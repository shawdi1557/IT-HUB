// Stage 3 Phase 3: candidate selection (the owner's approval of 7 November 2026, contract section 11.7). Builds
// within the range are compared only with each other; a processor with its own graphics may try other cards to
// reach the range; the lowest price below the range comes from the first search; and the price pruning changes
// nothing. Every listing here is made up, with made-up test prices, and none is IT HUB stock. In memory only.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GOLDEN_CATALOGUES,
  GOLDEN_SEARCHES,
  reviewedSpecs,
  roleOfferSet,
  statedSpecs,
  testListingMaker,
} from "./_helpers/stage3-golden.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { generateCatalogOffer, getBudgetShortfallInfo, recommendationId } =
  await import("../../../src/lib/builder/recommendations.ts");
const { getPendingQuotation, pendingMatchesBuild, savePendingQuotation, clearPendingQuotation } =
  await import("../../../src/lib/builder/persistence.ts");

const catalogueOf = (listings: any[]) => syncBuilderCatalogWithShopify(listings).componentCatalog;
const offerIn =
  (catalogue: any, owned: string[] = [], pricePruning = true) =>
  (purpose: string, details: Record<string, string>, min: number, max: number) =>
    generateCatalogOffer(
      catalogue,
      { purpose, details, brands: [], owned },
      { min, max },
      { allowUnverified: true, pricePruning },
    );
const prices = (builds: any[]) => builds.map((build) => build.price);
/** Everything the customer is shown: the builds with their IDs, chips and roles, the notices, the lowest price. */
const shownOf = (offer: any) => ({
  builds: roleOfferSet(offer.builds),
  ids: offer.builds.map((build: any) => build.templateId),
  notes: offer.builds.map((build: any) => [build.note ?? null, build.purposeNotes]),
  notices: offer.notices,
  cheaperFrom: offer.cheaperFrom ?? null,
});
const random = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────────────

/** One processor and card, two boards: ₹67,000 with the basic board, ₹75,000 with the other. */
function twoBoardCatalogue(plusBoard: Record<string, string> = reviewedSpecs("Motherboard")) {
  const p = testListingMaker("p3dedup");
  return catalogueOf([
    p("QZX P3 CPU", "CPU", 15000, reviewedSpecs("CPU")),
    p("QZX P3 Board Basic", "Motherboard", 6000, reviewedSpecs("Motherboard")),
    p("QZX P3 Board Plus", "Motherboard", 14000, plusBoard),
    p("QZX P3 Memory 16GB", "RAM", 4000, reviewedSpecs("RAM")),
    p("QZX P3 Card", "GPU", 30000, reviewedSpecs("GPU")),
    p("QZX P3 Drive", "Storage", 4000, reviewedSpecs("Storage")),
    p("QZX P3 Power", "PSU", 5000, reviewedSpecs("PSU")),
    p("QZX P3 Case", "Cabinet", 3000, reviewedSpecs("Cabinet")),
  ]);
}

/**
 * A processor with its own graphics: ₹39,000 with no card, ₹49,000 with the cheapest card, and ₹64,000, ₹79,000
 * and ₹99,000 with the others.
 */
function integratedGraphicsCatalogue() {
  const p = testListingMaker("p3igpu");
  return catalogueOf([
    p("QZX P3 CPU Graphics", "CPU", 15000, reviewedSpecs("CPU", { integrated_graphics: "true" })),
    p("QZX P3 Board", "Motherboard", 8000, reviewedSpecs("Motherboard")),
    p("QZX P3 Memory 16GB", "RAM", 4000, reviewedSpecs("RAM")),
    p("QZX P3 Card Entry", "GPU", 10000, reviewedSpecs("GPU")),
    p("QZX P3 Card Mid", "GPU", 25000, reviewedSpecs("GPU")),
    p("QZX P3 Card High", "GPU", 40000, reviewedSpecs("GPU")),
    p("QZX P3 Card Top", "GPU", 60000, reviewedSpecs("GPU")),
    p("QZX P3 Drive", "Storage", 4000, reviewedSpecs("Storage")),
    p("QZX P3 Power", "PSU", 5000, reviewedSpecs("PSU")),
    p("QZX P3 Case", "Cabinet", 3000, reviewedSpecs("Cabinet")),
  ]);
}

// ── A. Builds within the range are compared only with each other ─────────────────────────────────────

Deno.test("S3P3 A: a cheaper version below the range doesn't push out the one within it", () => {
  const offer = offerIn(twoBoardCatalogue());
  const within = offer("gaming", {}, 70000, 80000);
  assertEquals(prices(within.builds), [75000]);
  assert(within.builds[0].parts.Motherboard.name.includes("Board Plus"));
  assertEquals(within.cheaperFrom, undefined);
  assertEquals(within.notices, ["Only one suitable build was found within your range."]);
  // Below that range, the cheaper version is the one offered, as before.
  assertEquals(prices(offer("gaming", {}, 60000, 70000).builds), [67000]);
  assertEquals(prices(offer("gaming", {}, 60000, 80000).builds), [67000]);
});

Deno.test("S3P3 A: with no minimum, or parts owned, near-duplicates are compared as before", () => {
  assertEquals(prices(offerIn(twoBoardCatalogue())("gaming", {}, 0, 80000).builds), [67000]);
  // Owned storage costs nothing, so only the maximum applies, and the cheaper version is kept.
  const owned = offerIn(twoBoardCatalogue(), ["Storage"])("gaming", {}, 70000, 80000);
  assertEquals(prices(owned.builds), [63000]);
});

Deno.test("S3P3 A: a confirmed version below the range doesn't stand in for one within it that needs review", () => {
  // The dearer board states nothing, so its build needs IT HUB's review.
  const offer = offerIn(twoBoardCatalogue({}))("gaming", {}, 70000, 80000);
  assertEquals(prices(offer.builds), [75000]);
  assert(offer.builds[0].requiresReview);
  assert(
    offer.notices.includes(
      "No build within your range is confirmed: each needs IT HUB's review, or its power supply's wattage isn't confirmed.",
    ),
    "the confirmed build below the range is said to be missing",
  );
  // Where both are within the range, the confirmed one costs less, so the review version adds nothing.
  const both = offerIn(twoBoardCatalogue({}))("gaming", {}, 60000, 80000);
  assertEquals(prices(both.builds), [67000]);
  assert(!both.builds[0].requiresReview);
});

Deno.test("S3P3 A: the large catalogue offers builds from ₹80,000 to ₹1,00,000 for every purpose", () => {
  const offer = offerIn(catalogueOf(GOLDEN_CATALOGUES.large()));
  for (const s of GOLDEN_SEARCHES.filter((search) => search.min === 80000)) {
    const { builds, cheaperFrom } = offer(s.purpose, s.details, s.min, s.max);
    assertEquals(builds.length, 3, `${s.purpose} ${JSON.stringify(s.details)}`);
    assertEquals(cheaperFrom, undefined);
    for (const build of builds) assert(build.price >= 80000 && build.price <= 100000);
  }
});

// ── B. Cards for a processor with its own graphics, only to reach the range ─────────────────────────────

Deno.test("S3P3 B: work, software development and general use reach the range with another card", () => {
  const offer = offerIn(integratedGraphicsCatalogue());
  for (const [purpose, details] of [
    ["work", {}],
    ["programming", {}],
    ["professional", { type: "Software Development" }],
    ["general", {}],
  ] as [string, Record<string, string>][]) {
    const found = offer(purpose, details, 60000, 80000);
    // ₹99,000 is above the maximum, and ₹39,000 and ₹49,000 are below the minimum.
    assertEquals(prices(found.builds), [64000, 79000], purpose);
    assert(found.notices.includes("Only two suitable builds were found within your range."));
  }
  assert(
    offer("programming", {}, 60000, 80000).notices.includes(
      "No build without a graphics card falls within your range.",
    ),
  );
});

Deno.test("S3P3 B: no other card is added where the range is met without one", () => {
  const offer = offerIn(integratedGraphicsCatalogue());
  for (const purpose of ["work", "programming", "general"]) {
    // The cheapest card's build, ₹49,000, is within the range, so no dearer card is tried.
    const builds = offer(purpose, {}, 40000, 60000).builds;
    assertEquals(prices(builds), [49000], purpose);
    assertEquals(builds[0].parts.GPU.name, "QZX P3 Card Entry");
    // With no minimum, nothing has to be reached: no card at all, and the cheapest card.
    const anyPrice = offer(purpose, {}, 0, 150000).builds;
    assertEquals(prices(anyPrice), [39000, 49000], purpose);
  }
});

Deno.test("S3P3 B: a build above the maximum doesn't count as meeting the range", () => {
  // The only power supply with a confirmed wattage costs ₹48,000, so each confirmed build is above the
  // ₹80,000 maximum, while the others, with the ₹13,000 supply, are below ₹60,000 until a dearer card is added.
  const p = testListingMaker("p3over");
  const catalogue = catalogueOf([
    p("QZX P3 CPU Graphics", "CPU", 15000, reviewedSpecs("CPU", { integrated_graphics: "true" })),
    p("QZX P3 Board", "Motherboard", 8000, reviewedSpecs("Motherboard")),
    p("QZX P3 Memory 16GB", "RAM", 4000, reviewedSpecs("RAM")),
    p("QZX P3 Card Entry", "GPU", 10000, reviewedSpecs("GPU")),
    p("QZX P3 Card Mid", "GPU", 25000, reviewedSpecs("GPU")),
    p("QZX P3 Drive", "Storage", 4000, reviewedSpecs("Storage")),
    p("QZX P3 Power Plain", "PSU", 13000, statedSpecs("PSU")),
    p("QZX P3 Power Reviewed", "PSU", 48000, reviewedSpecs("PSU")),
    p("QZX P3 Case", "Cabinet", 3000, reviewedSpecs("Cabinet")),
  ]);
  const anyPrice = prices(offerIn(catalogue)("work", {}, 0, 200000).builds);
  assert(anyPrice.includes(47000) && anyPrice.some((price) => price > 80000), String(anyPrice));
  const offer = offerIn(catalogue)("work", {}, 60000, 80000);
  assertEquals(prices(offer.builds), [72000]);
  assertEquals(offer.builds[0].parts.GPU.name, "QZX P3 Card Mid");
});

Deno.test("S3P3 B: a build that can't reach the range isn't offered, and the lowest price is the one found without", () => {
  // From ₹1,00,000 the dearest card's build, ₹99,000, is still below the range.
  const offer = offerIn(integratedGraphicsCatalogue())("work", {}, 100000, 150000);
  assertEquals(offer.builds, []);
  assertEquals(offer.cheaperFrom, 39000);
});

Deno.test("S3P3 B: gaming and 3D work are searched as before, with every sampled card", () => {
  const offer = offerIn(integratedGraphicsCatalogue());
  assertEquals(prices(offer("gaming", {}, 40000, 100000).builds).length, 3);
  for (const build of offer("gaming", {}, 40000, 100000).builds) assert(build.parts.GPU);
  assertEquals(prices(offer("gaming", {}, 60000, 80000).builds), [64000, 79000]);
});

// ── C and D. The lowest price from the first search, and the price pruning, change nothing ─────────────

Deno.test("S3P3 C: the source runs one search for the offer, and none again for the lowest price", async () => {
  const engine = await Deno.readTextFile(
    new URL("../../../src/lib/builder/recommendations.ts", import.meta.url),
  );
  const offer = engine.slice(
    engine.indexOf("export function generateCatalogOffer("),
    engine.indexOf("export interface BudgetShortfallInfo"),
  );
  assertEquals(offer.split("synthesizeBuildConfigurations(").length - 1, 1);
  assert(!/search\(false\)/.test(offer));
});

/** Random small catalogues, with and without processor graphics, over every purpose and many ranges. */
function randomCatalogue(run: number) {
  const next = random(run + 31);
  const p = testListingMaker(`p3r${run}`);
  const items: any[] = [];
  for (const slot of ["CPU", "Motherboard", "RAM", "GPU", "Storage", "PSU", "Cabinet"] as const) {
    const count = 1 + Math.floor(next() * 4);
    for (let i = 0; i < count; i++) {
      const kind = next();
      const extra: Record<string, string> =
        slot === "RAM"
          ? { ram_capacity_gb: String([8, 16, 32][Math.floor(next() * 3)]) }
          : slot === "CPU"
            ? { integrated_graphics: next() < 0.5 ? "true" : "false" }
            : {};
      const specs =
        kind < 0.5 ? reviewedSpecs(slot, extra) : kind < 0.8 ? statedSpecs(slot, extra) : {};
      items.push(p(`QZX R3 ${slot} ${i}`, slot, 1000 + Math.floor(next() * 25) * 1000, specs));
    }
  }
  return { items, next };
}
const RANDOM_SEARCHES: [string, Record<string, string>][] = [
  ["gaming", {}],
  ["gaming", { type: "AAA Games" }],
  ["creation", { type: "3D" }],
  ["programming", {}],
  ["professional", { type: "Software Development" }],
  ["work", {}],
  ["general", {}],
];

Deno.test("S3P3 random: on 1,000 catalogues, the range holds, pruning changes nothing, and the lowest price is right", () => {
  let empty = 0;
  let stated = 0;
  let reachedWithCard = 0;
  for (let run = 0; run < 1000; run++) {
    const { items, next } = randomCatalogue(run);
    const catalogue = catalogueOf(items);
    const [purpose, details] = RANDOM_SEARCHES[run % RANDOM_SEARCHES.length];
    const owned = run % 9 === 0 ? ["Storage"] : [];
    const min = 20000 + Math.floor(next() * 9) * 10000;
    const max = min + [10000, 20000, 40000][run % 3];
    const label = `run ${run} ${purpose} ₹${min}–₹${max}${owned.length ? " owning storage" : ""}`;
    const offer = offerIn(catalogue, owned)(purpose, details, min, max);
    const unpruned = offerIn(catalogue, owned, false)(purpose, details, min, max);
    assertEquals(shownOf(offer), shownOf(unpruned), `${label}: the pruning changes nothing`);
    for (const build of offer.builds) {
      assert(build.price <= max, `${label}: above the maximum`);
      if (owned.length === 0) assert(build.price >= min, `${label}: below the minimum`);
    }
    const ids = offer.builds.map((build: any) => build.templateId);
    assertEquals(new Set(ids).size, ids.length, `${label}: no build twice`);
    // A processor with its own graphics, for a use that needs no card, with a card dearer than the cheapest.
    const listing = new Map(items.map((item) => [item.id, item]));
    const cards = items.filter((item) => item.category === "Video Cards");
    const cheapestCard = Math.min(...cards.map((item) => item.price));
    reachedWithCard += offer.builds.filter(
      (build: any) =>
        !["gaming", "creation"].includes(purpose) &&
        listing.get(build.parts.CPU?.id)?.specs.integrated_graphics === "true" &&
        build.parts.GPU &&
        build.parts.GPU.price > cheapestCard,
    ).length;
    if (offer.builds.length === 0 && owned.length === 0) {
      empty++;
      // What the same search offers with no minimum: the lowest of its prices is the one stated.
      const anyPrice = offerIn(catalogue)(purpose, details, 0, max).builds;
      for (const build of anyPrice) assert(build.price < min, label);
      assertEquals(
        offer.cheaperFrom,
        anyPrice.length > 0 ? Math.min(...prices(anyPrice)) : undefined,
        `${label}: the lowest price`,
      );
      if (offer.cheaperFrom !== undefined) stated++;
    }
  }
  // The catalogues reach both cases often enough to mean something.
  assert(empty >= 150, `empty ranges: ${empty}`);
  assert(stated >= 50, `lowest prices stated: ${stated}`);
  assert(
    reachedWithCard >= 10,
    `builds that reach the range with another card: ${reachedWithCard}`,
  );
});

Deno.test("S3P3 D: pruning changes nothing on any golden catalogue or search", () => {
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const catalogue = catalogueOf(make());
    for (const s of GOLDEN_SEARCHES) {
      assertEquals(
        shownOf(offerIn(catalogue)(s.purpose, s.details, s.min, s.max)),
        shownOf(offerIn(catalogue, [], false)(s.purpose, s.details, s.min, s.max)),
        `${name} ${s.purpose} ${s.min}`,
      );
    }
  }
});

Deno.test("S3P3 D: the closest build above the budget is found as before", () => {
  // The shortfall search has no maximum, so nothing is pruned from it.
  const catalogue = catalogueOf(GOLDEN_CATALOGUES.sparse());
  const info = getBudgetShortfallInfo(
    catalogue,
    { purpose: "gaming", details: {}, brands: [] },
    { min: 10000, max: 20000 },
    { allowUnverified: true },
  ) as any;
  assert(info?.closestBuild);
  assert(info.closestBuild.price > 20000);
});

// ── Determinism, IDs, saved builds and pending quotations ──────────────────────────────────────────

Deno.test("S3P3 determinism: 200 random catalogues give the same offer in three listing orders", () => {
  for (let run = 0; run < 200; run++) {
    const { items, next } = randomCatalogue(run + 5000);
    const [purpose, details] = RANDOM_SEARCHES[run % RANDOM_SEARCHES.length];
    const min = 20000 + Math.floor(next() * 9) * 10000;
    const expected = shownOf(offerIn(catalogueOf(items))(purpose, details, min, min + 20000));
    for (let order = 1; order <= 2; order++) {
      const shuffle = random(run * 7 + order);
      const shuffled = items
        .map((item) => ({ item, at: shuffle() }))
        .sort((a, b) => a.at - b.at)
        .map(({ item }) => item);
      assertEquals(
        shownOf(offerIn(catalogueOf(shuffled))(purpose, details, min, min + 20000)),
        expected,
        `run ${run} order ${order}`,
      );
    }
  }
});

Deno.test("S3P3 IDs: a build found to reach the range gets the ID its parts always give", () => {
  const offer = offerIn(integratedGraphicsCatalogue());
  const [build] = offer("work", {}, 60000, 80000).builds;
  assertEquals(build.templateId, recommendationId("build", build.parts, [], "work"));
  assertEquals(offer("work", {}, 60000, 80000).builds[0].templateId, build.templateId);
  // The same parts offered in another range keep the same ID.
  const sameParts = offer("work", {}, 60000, 70000).builds[0];
  assertEquals(sameParts.price, 64000);
  assertEquals(sameParts.templateId, build.templateId);
  const twoBoards = offerIn(twoBoardCatalogue());
  const [plus] = twoBoards("gaming", {}, 70000, 80000).builds;
  assertEquals(plus.templateId, recommendationId("build", plus.parts, [], "gaming"));
});

Deno.test("S3P3 saved: a pending quotation of a Phase 3 build restores and matches it by its parts", () => {
  const [build] = offerIn(integratedGraphicsCatalogue())("work", {}, 60000, 80000).builds;
  clearPendingQuotation();
  savePendingQuotation({
    mode: "customise",
    build: {
      templateId: build.templateId,
      name: build.name,
      components: {},
      currency: "INR",
      createdAt: "x",
      updatedAt: "x",
    } as any,
    parts: build.parts,
    name: build.name,
    ownedSlots: [],
  });
  const pending = getPendingQuotation()!;
  assertEquals(pending.build.templateId, build.templateId);
  assert(pendingMatchesBuild(pending, build.parts, []));
  const again = offerIn(integratedGraphicsCatalogue())("work", {}, 60000, 80000).builds;
  assert(pendingMatchesBuild(pending, again[0].parts, []), "the same search finds the same build");
  clearPendingQuotation();
});

// ── The earlier records are never rewritten ────────────────────────────────────────────────────────

Deno.test("S3P3 records: the Phase 1, Phase 2, strict-range and Phase 3 records are byte-for-byte unchanged", async () => {
  const sha256 = async (name: string) => {
    const bytes = await Deno.readFile(new URL(`./_helpers/${name}`, import.meta.url));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  };
  assertEquals(
    await sha256("stage3-golden-baseline.json"),
    "2b0bbaa2d85974984ceb5d40932f1e3f9952d12c78558e30965f9e9de4a55551",
  );
  assertEquals(
    await sha256("stage3-phase2-baseline.json"),
    "2fac5d16783cf9ac049ad6a1f73d05ccd46430460c5384b22fc5be9bc48dad43",
  );
  assertEquals(
    await sha256("stage3-strict-baseline.json"),
    "111ca0cc847097ca03841ed838f993c8c9adc4f475e4d243000caae4b4c066e8",
  );
  // Stage 3 Phase 4 records its offers separately (stage3-phase4-baseline.json); the Phase 3 record stays.
  assertEquals(
    await sha256("stage3-phase3-baseline.json"),
    "f012adf99467388c105433320d2f9fad411bdd6337265fbec50a2856e51ce5da",
  );
});
