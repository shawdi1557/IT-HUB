// Stage 4A-4: Find My PC's cards and build page say the same thing about the same build, from `assessBuild`
// and the shared price summary. Every listing here is made up, with made-up test prices, and none is IT HUB
// stock. In memory only, apart from reading the page file.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GOLDEN_CATALOGUES, reviewedSpecs, testListingMaker } from "./_helpers/stage3-golden.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { generateCatalogOffer } = await import("../../../src/lib/builder/recommendations.ts");
const { compatibility, toCanonicalComponent } =
  await import("../../../src/lib/builder/compatibility.ts");
const { assessBuild } = await import("../../../src/lib/builder/completeness.ts");
const { summariseBuildPrice } = await import("../../../src/lib/builder/pricing.ts");
const { purposeProfile } = await import("../../../src/lib/builder/purpose.ts");
const { STATE_BADGE, cardStatus, blockerLines, NO_LONGER_AVAILABLE } =
  await import("../../../src/lib/builder/completeness-wording.ts");

const page = Deno.readTextFileSync("src/pages/Builder.tsx");
const tight = (text: string) => text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
const pageHas = (code: string) => tight(page).includes(tight(code));

/** The purposes Find My PC offers, and its budget bands. */
const PURPOSES = ["gaming", "creation", "work", "programming", "professional", "general"];
const NEEDS_CARD = ["gaming", "creation", "professional"];
const BANDS = [
  [40000, 60000],
  [60000, 80000],
  [80000, 100000],
  [100000, 150000],
  [150000, 300000],
];
const ASSEMBLY = 1500;

const catalogueOf = (listings: any[]) => syncBuilderCatalogWithShopify(listings).componentCatalog;
const noCards = (listings: any[]) => listings.filter((item) => item.category !== "Video Cards");

/** What the build's page computes on opening: BuildDetail's checks, assessment and price summary. */
function detailOf(parts: Record<string, any>, owned: string[], purpose?: string) {
  const checks = compatibility(parts, { ownedSlots: owned });
  const canonical: Record<string, any> = {};
  for (const [slot, part] of Object.entries(parts)) {
    if (part) canonical[slot] = toCanonicalComponent(slot, part);
  }
  const assessment = assessBuild(canonical as any, checks.summary, {
    ownedSlots: owned,
    ...(purpose ? { purpose } : {}),
  });
  const price = summariseBuildPrice(parts, { ownedSlots: owned, assembly: ASSEMBLY });
  return { checks, assessment, price };
}

/** What the card shows, as SmartBuilder's `cardViews` computes it. */
function cardOf(build: any, purpose: string) {
  const { assessment, price } = detailOf(build.parts, build.owned || [], purpose);
  return { status: cardStatus(assessment, build), price, assessment };
}

/** Every card the page could show, over every golden catalogue, the same with no card in stock, and every search. */
function* everyCard(): Generator<{ where: string; build: any; purpose: string; owned: string[] }> {
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    for (const [label, listings] of [
      [name, make()],
      [`${name} with no card`, noCards(make())],
    ] as [string, any[]][]) {
      const catalogue = catalogueOf(listings);
      for (const purpose of PURPOSES) {
        for (const owned of [[], ["GPU"]]) {
          for (const [min, max] of BANDS) {
            const offer = generateCatalogOffer(
              catalogue,
              { purpose, brands: [], ...(owned.length ? { owned } : {}) },
              { min, max },
              { allowUnverified: true },
            );
            for (const build of offer.builds as any[]) {
              yield { where: `${label} ${purpose} ${owned} ${min}-${max}`, build, purpose, owned };
            }
          }
        }
      }
    }
  }
}

Deno.test("S4A-F1: a card's status follows its build's assessment, state by state", () => {
  const base = { gaps: [], unavailableSlots: [], mismatches: [], reviewReasons: [], advice: [] };
  for (const state of ["incompatible", "incomplete", "needs_review", "complete"] as const) {
    for (const confidenceBadge of ["certified", "high", "review", "advisory", undefined]) {
      const status = cardStatus({ ...base, state } as any, { confidenceBadge });
      const blocked = state === "incompatible" || state === "incomplete";
      assertEquals(status.badge, blocked ? STATE_BADGE[state] : undefined, state);
      assertEquals(status.review, state === "needs_review", state);
      // "Specs Confirmed" says every check passed, so only ever on a Compatible build.
      assertEquals(status.specsConfirmed, state === "complete" && confidenceBadge === "certified");
      assertEquals(status.noCardAvailable, false);
      assertEquals(status.outOfStock, false);
    }
  }
  const gap = { slot: "GPU", need: "missing", reason: "gpu_required_for_purpose", action: {} };
  assert(cardStatus({ ...base, state: "incomplete", gaps: [gap] } as any, {}).noCardAvailable);
  assert(
    cardStatus({ ...base, state: "complete", unavailableSlots: ["GPU"] } as any, {}).outOfStock,
  );
});

Deno.test("S4A-F2: every card says what its build's page says on opening: state, review, stock and price", () => {
  let cards = 0;
  const seen = new Set<string>();
  for (const { where, build, purpose, owned } of everyCard()) {
    cards++;
    const card = cardOf(build, purpose);
    // The page opens the build with the card's parts, owned parts and purpose.
    const detail = detailOf(build.parts, build.owned || [], purpose);
    seen.add(detail.assessment.state);
    assertEquals(
      card.status.badge?.label,
      card.status.badge ? STATE_BADGE[detail.assessment.state].label : undefined,
      where,
    );
    // A badge exactly when the page blocks the build for its state.
    const blocked = ["incompatible", "incomplete"].includes(detail.assessment.state);
    assertEquals(Boolean(card.status.badge), blocked, where);
    assertEquals(card.status.review, detail.assessment.state === "needs_review", where);
    assert(!card.status.specsConfirmed || detail.assessment.state === "complete", where);
    assertEquals(card.status.outOfStock, detail.assessment.unavailableSlots.length > 0, where);
    // The card's price is the page's Estimated Build Price, assembly included.
    assertEquals(card.price.total, detail.price.total, where);
    assertEquals(card.price.total, card.price.componentTotal + ASSEMBLY, where);
    // A card for a use that needs a card says so exactly when the build has none, bought or owned.
    const noCard = NEEDS_CARD.includes(purpose) && !build.parts.GPU && !owned.includes("GPU");
    assertEquals(card.status.noCardAvailable, noCard, where);
    // The recommendation's own review flag agrees with the assessment, apart from the parts the customer owns,
    // which it doesn't count and the assessment always sends to IT HUB (D5).
    if (!owned.length && !noCard) {
      assertEquals(
        Boolean(build.requiresReview),
        detail.assessment.state === "needs_review",
        where,
      );
    }
  }
  assert(cards > 300, `cards compared: ${cards}`);
  // The comparison reached the states that matter.
  for (const state of ["incomplete", "needs_review", "complete"]) assert(seen.has(state), state);
});

Deno.test("S4A-F3 (D2): gaming, creation and professional need a card; work, programming and general don't", () => {
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const catalogue = catalogueOf(noCards(make()));
    for (const purpose of PURPOSES) {
      for (const [min, max] of BANDS) {
        const offer = generateCatalogOffer(
          catalogue,
          { purpose, brands: [] },
          { min, max },
          {
            allowUnverified: true,
          },
        );
        for (const build of offer.builds as any[]) {
          const where = `${name} ${purpose} ${min}-${max}`;
          const card = cardOf(build, purpose);
          const cardGap = card.assessment.gaps.some(
            (gap: any) => gap.reason === "gpu_required_for_purpose",
          );
          assertEquals(purposeProfile(purpose).requiresDedicatedGpu, NEEDS_CARD.includes(purpose));
          if (NEEDS_CARD.includes(purpose)) {
            assertEquals(card.status.badge?.label, "Incomplete", where);
            assert(card.status.noCardAvailable && !card.assessment.quotationReady, where);
          } else {
            // The processor's graphics are enough: never Incomplete for want of a card.
            assert(!cardGap && !card.status.noCardAvailable, where);
            assert(build.parts.CPU.hasIntegratedGraphics, where);
          }
        }
      }
    }
  }
});

const make = testListingMaker("s4a4");
const SLOTS = ["CPU", "Motherboard", "RAM", "GPU", "Storage", "PSU", "Cabinet", "Cooler"] as const;
/** Reviewed values for every slot; the processor states its graphics and its cooler, so nothing is left open. */
const specsFor = (slot: string) =>
  reviewedSpecs(
    slot as any,
    slot === "CPU" ? { integrated_graphics: "true", includes_cooler: "true" } : {},
  );
/** One build from a catalogue of two reviewed listings per slot, each a test listing at a test price. */
function reviewedBuild() {
  const listings = SLOTS.flatMap((slot) => [
    make(`QZX S4A4 ${slot} A`, slot, 1000, specsFor(slot)),
    make(`QZX S4A4 ${slot} B`, slot, 2000, specsFor(slot)),
  ]);
  const catalogue = catalogueOf(listings);
  const parts: Record<string, any> = {};
  for (const slot of SLOTS) parts[slot] = catalogue[slot][0];
  return { catalogue, parts };
}

Deno.test("S4A-F4: removing, adding back and replacing a part, or changing the use, is judged again at once", () => {
  const { catalogue, parts } = reviewedBuild();
  const start = detailOf(parts, [], "gaming");
  assertEquals(start.assessment.state, "complete");
  assert(start.assessment.quotationReady);
  // Removed: Incomplete, named, and out of the price.
  const { Storage: _gone, ...noStorage } = parts;
  const removed = detailOf(noStorage, [], "gaming");
  assertEquals(removed.assessment.state, "incomplete");
  assertEquals(blockerLines(removed.assessment)[0].text, "Still to choose: Storage.");
  assertEquals(removed.price.componentTotal, start.price.componentTotal - parts.Storage.price);
  // Added back: as before.
  assertEquals(
    detailOf({ ...noStorage, Storage: parts.Storage }, [], "gaming").assessment,
    start.assessment,
  );
  // Replaced with another: priced at the new part.
  const other = catalogue.Storage[1];
  const replaced = detailOf({ ...parts, Storage: other }, [], "gaming");
  assertEquals(
    replaced.price.componentTotal,
    start.price.componentTotal - parts.Storage.price + other.price,
  );
  // Replaced with one that's no longer available: blocked, and out of the price (W21).
  const soldOut = { ...other, stock: 0 };
  const unavailable = detailOf({ ...parts, Storage: soldOut }, [], "gaming");
  assertEquals(unavailable.assessment.unavailableSlots, ["Storage"]);
  assert(!unavailable.assessment.quotationReady);
  assertEquals(unavailable.price.unavailableSlots, ["Storage"]);
  assertEquals(unavailable.price.componentTotal, start.price.componentTotal - parts.Storage.price);
  assertEquals(
    blockerLines(unavailable.assessment).at(-1)?.text,
    "Replace what's no longer available: Storage.",
  );
  // The card off: Incomplete for gaming, not for general use, on the same parts.
  const { GPU: _card, ...noCard } = parts;
  assertEquals(detailOf(noCard, [], "gaming").assessment.state, "incomplete");
  const general = detailOf(noCard, [], "general").assessment;
  assert(!general.gaps.some((gap: any) => gap.reason === "gpu_required_for_purpose"));
});

Deno.test("S4A-F5 (D5): an owned part sends the build to IT HUB, is never priced, and blocks nothing", () => {
  const { parts } = reviewedBuild();
  // As the page holds it: the slot is the customer's own, with no part bought for it. The engine checks an
  // owned memory kit, drive or card for review; any other slot still has to be chosen.
  for (const slot of ["GPU", "Storage", "RAM"]) {
    const { [slot]: _own, ...bought } = parts;
    for (const purpose of [undefined, ...PURPOSES]) {
      const where = `${slot} ${purpose}`;
      const { assessment, price } = detailOf(bought, [slot], purpose);
      assertEquals(assessment.state, "needs_review", where);
      assertEquals(assessment.ownedSlots, [slot], where);
      assert(assessment.quotationReady, where);
      assertEquals(
        price.componentTotal,
        summariseBuildPrice(parts, {}).componentTotal - parts[slot].price,
      );
      const status = cardStatus(assessment, { confidenceBadge: "certified" });
      assert(status.review && !status.specsConfirmed && !status.badge, where);
    }
  }
  // A part bought for the slot replaces the customer's own, as the engine counts it.
  assertEquals(detailOf(parts, ["GPU"], "gaming").assessment.ownedSlots, []);
  // The price summary leaves out a part marked as the customer's own, even with a part record kept.
  assertEquals(summariseBuildPrice(parts, { ownedSlots: ["GPU"] }).ownedSlots, ["GPU"]);
  // An owned card meets a use that needs one.
  const { GPU: _card, ...noCard } = parts;
  assertEquals(detailOf(noCard, ["GPU"], "gaming").assessment.state, "needs_review");
});

Deno.test("S4A-F6: the price breakdown lists what the total counts, quantities included", () => {
  const { parts } = reviewedBuild();
  const withPair = { ...parts, RAM: { ...parts.RAM, quantity: 2 } };
  const summary = summariseBuildPrice(withPair, { assembly: ASSEMBLY });
  const ram = summary.lines.find((line) => line.slot === "RAM")!;
  assertEquals(ram.lineTotal, parts.RAM.price * 2);
  assertEquals(
    summary.lines.reduce((sum, line) => sum + line.lineTotal, 0),
    summary.componentTotal,
  );
  assertEquals(summary.total, summary.componentTotal + ASSEMBLY);
  // The page writes each line from the same summary, and an unavailable part as no price at all.
  assert(
    pageHas("const { componentTotal, assembly, total, lines } = summariseBuildPrice(parts, {"),
  );
  assert(
    pageHas(
      "const lineTotal = (type: string) => lines.find((line) => line.slot === type)?.lineTotal ?? 0;",
    ),
  );
  assert(pageHas("<span>{money(lineTotal(type))}</span>"));
  // The breakdown itself never prints a unit price as a line (a part's own row still shows what it costs).
  const breakdown = page.slice(
    page.indexOf("Price Breakdown"),
    page.indexOf("<span>Component Total</span>"),
  );
  assert(
    breakdown.includes("lineTotal(type)") && !breakdown.includes(".price)"),
    breakdown.slice(0, 80),
  );
  assertEquals(NO_LONGER_AVAILABLE, "No longer available");
});

Deno.test("S4A-F7: the cards use the page's own assessment and price summary, with the customer's use", () => {
  assert(
    pageHas(
      "const assessment = assessParts(build.parts, summary, owned, answers.purpose || undefined);",
    ),
  );
  assert(pageHas("status: cardStatus(assessment, build),"));
  assert(
    pageHas(
      "price: summariseBuildPrice(build.parts, { ownedSlots: owned, assembly: store.assemblyCharge || 0 })",
    ),
  );
  assert(pageHas("[recommendations, answers.purpose, store.assemblyCharge]"));
  assert(pageHas("const { status, price } = cardViews[index];"));
  assert(pageHas("{money(price.total)}"));
  assert(pageHas("{status.outOfStock && ("));
  // The card's own rules are gone.
  for (const old of [
    "build.price + (store.assemblyCharge",
    "const noCard",
    "build.requiresReview && (",
    "part?.stock === 0,",
  ]) {
    assert(!page.includes(old), old);
  }
  // The build opened from a card gets the same use (D2), and the detail judges it the same way.
  assert(page.includes("setDetail({ ...build, purpose: answers.purpose || undefined });"));
  assert(
    page.includes("const assessment = assessParts(parts, checks.summary, owned, initial.purpose);"),
  );
  // The test-catalogue disclaimer: Expert Mode, the recommended builds and the build's page.
  assertEquals(page.split("<CatalogWarning />").length - 1, 3);
});
