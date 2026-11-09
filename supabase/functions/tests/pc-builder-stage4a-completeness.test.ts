// Stage 4A-1: build completeness (the owner's decisions D1 to D9 of 8 November 2026). One assessment reads the
// compatibility engine's summary and says whether a build is Incompatible, Incomplete, Needs Review or Complete.
// Every listing here is made up, with made-up test prices, and none is IT HUB stock. In memory only.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GOLDEN_CATALOGUES,
  GOLDEN_SEARCHES,
  reviewedSpecs,
  testListingMaker,
} from "./_helpers/stage3-golden.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { checkCompatibility, toCanonicalComponent } =
  await import("../../../src/lib/builder/compatibility.ts");
const { generateCatalogOffer } = await import("../../../src/lib/builder/recommendations.ts");
const { purposeProfile } = await import("../../../src/lib/builder/purpose.ts");
const { ESSENTIAL_SLOTS } = await import("../../../src/lib/builder/slots.ts");
const { assessBuild, BUILD_STATE_PRECEDENCE } =
  await import("../../../src/lib/builder/completeness.ts");

type Flag = "true" | "false" | undefined;
const SLOTS = ["CPU", "Motherboard", "RAM", "GPU", "Storage", "PSU", "Cabinet", "Cooler"] as const;

const make = testListingMaker("s4a");
/** One part per slot that passes every check, with the processor's graphics and boxed cooler as given. */
function partsOf(
  igpu: Flag,
  boxed: Flag,
  overrides: Partial<Record<(typeof SLOTS)[number], Record<string, string>>> = {},
) {
  const cpu: Record<string, string> = reviewedSpecs("CPU", overrides.CPU);
  if (igpu === undefined) delete cpu.integrated_graphics;
  else cpu.integrated_graphics = igpu;
  if (boxed === undefined) delete cpu.includes_cooler;
  else cpu.includes_cooler = boxed;
  const prices = {
    CPU: 15000,
    Motherboard: 8000,
    RAM: 4000,
    GPU: 30000,
    Storage: 4000,
    PSU: 5000,
    Cabinet: 3000,
    Cooler: 2000,
  };
  const listings = SLOTS.map((slot) =>
    make(
      `QZX S4A ${slot}`,
      slot,
      prices[slot],
      slot === "CPU" ? cpu : reviewedSpecs(slot, overrides[slot]),
    ),
  );
  const catalogue = syncBuilderCatalogWithShopify(listings as any).componentCatalog;
  const parts: Record<string, any> = {};
  for (const slot of SLOTS) parts[slot] = catalogue[slot][0];
  return parts;
}

/** What a screen does: convert its selection, ask the engine, then assess. */
function assess(
  parts: Record<string, any>,
  options: { owned?: string[]; purpose?: string; details?: Record<string, string> } = {},
) {
  const components: Record<string, any> = {};
  for (const [slot, part] of Object.entries(parts)) {
    if (part) components[slot] = toCanonicalComponent(slot, part);
  }
  const summary = checkCompatibility(components, { ownedSlots: options.owned || [] });
  const before = structuredClone(summary);
  const assessment = assessBuild(components as any, summary, {
    purpose: options.purpose,
    details: options.details,
    ownedSlots: options.owned || [],
  });
  // The assessment only reads the engine's result.
  assertEquals(summary, before);
  return { assessment, summary, components };
}

const without = (parts: Record<string, any>, ...slots: string[]) => {
  const copy = { ...parts };
  for (const slot of slots) delete copy[slot];
  return copy;
};

// ── Named cases ────────────────────────────────────────────────────────────────────────────────────

Deno.test("S4A-1: an empty build is Incomplete, missing the six essential parts in order", () => {
  const { assessment } = assess({});
  assertEquals(assessment.state, "incomplete");
  assertEquals(
    assessment.gaps.map((gap: any) => [gap.slot, gap.need, gap.reason]),
    ESSENTIAL_SLOTS.map((slot: string) => [slot, "missing", "essential"]),
  );
  assertEquals(assessment.quotationReady, false);
  assertEquals(assessment.blockedBy, "incomplete");
  assertEquals(BUILD_STATE_PRECEDENCE, ["incompatible", "incomplete", "needs_review", "complete"]);
});

Deno.test("S4A-2: a full build with every value reviewed is Complete and can be quoted", () => {
  const { assessment, summary } = assess(partsOf("false", "true"));
  assertEquals(summary.status, "compatible");
  assertEquals(assessment.state, "complete");
  assertEquals(assessment.gaps, []);
  assertEquals(assessment.reviewReasons, []);
  assertEquals(assessment.quotationReady, true);
  assertEquals(assessment.blockedBy, undefined);
});

Deno.test("S4A-3 (D2): gaming, creation and professional need a card, even when the processor has its own graphics", () => {
  for (const igpu of ["true", undefined] as Flag[]) {
    const parts = without(partsOf(igpu, "true"), "GPU");
    for (const [purpose, details] of [
      ["gaming", {}],
      ["creation", { type: "Video" }],
      ["professional", {}],
      ["professional", { type: "CAD" }],
    ] as [string, Record<string, string>][]) {
      const { assessment } = assess(parts, { purpose, details });
      assertEquals(assessment.state, "incomplete", `${purpose} ${igpu}`);
      assertEquals(
        assessment.gaps.map((gap: any) => [gap.slot, gap.need, gap.reason]),
        [["GPU", "missing", "gpu_required_for_purpose"]],
      );
      assertEquals(assessment.gaps[0].action, { kind: "choose", slot: "GPU" });
      assertEquals(assessment.quotationReady, false);
    }
  }
});

Deno.test("S4A-4: integrated graphics are enough for work, programming, office, general and professional software development", () => {
  const parts = without(partsOf("true", "true"), "GPU");
  for (const [purpose, details] of [
    ["work", {}],
    ["programming", {}],
    ["office", {}],
    ["general", {}],
    ["professional", { type: "Software Development" }],
    [undefined, {}],
  ] as [string | undefined, Record<string, string>][]) {
    const { assessment } = assess(parts, { purpose, details });
    assertEquals(assessment.state, "complete", String(purpose));
    assertEquals(assessment.gaps, []);
    assertEquals(assessment.quotationReady, true);
  }
});

Deno.test("S4A-5: a processor stating no graphics needs a card; that's a part to choose, not a Mismatch", () => {
  const { assessment, summary } = assess(without(partsOf("false", "true"), "GPU"), {
    purpose: "work",
  });
  assert(summary.items.some((item: any) => item.ruleId === "RULE_I_GPU_MANDATORY_NO_IGPU"));
  assertEquals(assessment.state, "incomplete");
  assertEquals(assessment.mismatches, []);
  assertEquals(
    assessment.gaps.map((gap: any) => [gap.slot, gap.need, gap.reason]),
    [["GPU", "missing", "gpu_no_integrated_graphics"]],
  );
});

Deno.test("S4A-6 (D4): unknown integrated graphics with no card is Needs Review, never Complete, and can be quoted", () => {
  const { assessment, summary } = assess(without(partsOf(undefined, "true"), "GPU"), {
    purpose: "work",
  });
  assertEquals(summary.complete, true);
  assertEquals(assessment.state, "needs_review");
  assertEquals(
    assessment.gaps.map((gap: any) => [gap.slot, gap.need, gap.reason]),
    [["GPU", "unconfirmed", "gpu_integrated_graphics_unknown"]],
  );
  assertEquals(assessment.gaps[0].action, { kind: "choose_or_it_hub_confirms", slot: "GPU" });
  assert(
    assessment.reviewReasons.some((r: any) => r.kind === "unconfirmed_part" && r.slot === "GPU"),
  );
  assertEquals(assessment.quotationReady, true);
});

Deno.test("S4A-7 (D4): an unknown boxed cooler with no cooler is Needs Review; a stated missing one is Incomplete", () => {
  const unknown = assess(without(partsOf("false", undefined), "Cooler")).assessment;
  assertEquals(unknown.state, "needs_review");
  assertEquals(
    unknown.gaps.map((gap: any) => [gap.slot, gap.need, gap.reason]),
    [["Cooler", "unconfirmed", "cooler_unknown"]],
  );
  assertEquals(unknown.quotationReady, true);

  const none = assess(without(partsOf("false", "false"), "Cooler")).assessment;
  assertEquals(none.state, "incomplete");
  assertEquals(
    none.gaps.map((gap: any) => [gap.slot, gap.need, gap.reason]),
    [["Cooler", "missing", "cooler_not_included"]],
  );
  assertEquals(none.quotationReady, false);

  // A cooler chosen settles it either way.
  assertEquals(assess(partsOf("false", undefined)).assessment.gaps, []);
  assertEquals(assess(partsOf("false", "false")).assessment.state, "complete");
});

Deno.test("S4A-8 (D1): a Mismatch outranks everything, even while parts are still missing", () => {
  const parts = partsOf("false", "true", { Motherboard: { socket: "AM5" } });
  const { assessment } = assess(without(parts, "RAM", "Storage"));
  assertEquals(assessment.state, "incompatible");
  assert(assessment.mismatches.some((item: any) => item.ruleId === "RULE_A_SOCKET_MISMATCH"));
  // The missing parts are still named.
  assertEquals(
    assessment.gaps.map((gap: any) => gap.slot),
    ["RAM", "Storage"],
  );
  assertEquals(assessment.quotationReady, false);
  assertEquals(assessment.blockedBy, "incompatible");
});

Deno.test("S4A-9 (D1): Incomplete outranks Needs Review", () => {
  const { assessment } = assess(without(partsOf(undefined, undefined), "GPU", "Cooler", "PSU"));
  assertEquals(assessment.state, "incomplete");
  assertEquals(
    assessment.gaps.map((gap: any) => [gap.slot, gap.need]),
    [
      ["PSU", "missing"],
      ["GPU", "unconfirmed"],
      ["Cooler", "unconfirmed"],
    ],
  );
});

Deno.test("S4A-10 (D5): an owned part is never Complete and never priced as verified", () => {
  for (const slot of ["RAM", "Storage", "GPU"]) {
    const { assessment } = assess(without(partsOf("false", "true"), slot), { owned: [slot] });
    assertEquals(assessment.state, "needs_review", slot);
    assertEquals(assessment.ownedSlots, [slot]);
    assert(assessment.reviewReasons.some((r: any) => r.kind === "owned_part" && r.slot === slot));
    assertEquals(assessment.quotationReady, true);
  }
  // A gaming build with the customer's own card has its card, and IT HUB checks it.
  const gaming = assess(without(partsOf("true", "true"), "GPU"), {
    owned: ["GPU"],
    purpose: "gaming",
  }).assessment;
  assertEquals(gaming.state, "needs_review");
  assertEquals(gaming.gaps, []);
  // The engine checks only an owned memory kit, drive or card. Any other owned part must still be chosen.
  const psu = assess(without(partsOf("false", "true"), "PSU"), { owned: ["PSU"] }).assessment;
  assertEquals(psu.state, "incomplete");
  assertEquals(
    psu.gaps.map((gap: any) => gap.slot),
    ["PSU"],
  );
  // A part chosen for a slot replaces the customer's own.
  const chosen = assess(partsOf("false", "true"), { owned: ["RAM"] }).assessment;
  assertEquals(chosen.ownedSlots, []);
  assertEquals(chosen.state, "complete");
});

Deno.test("S4A-11 (D3): advice the customer can read doesn't change a Complete build", () => {
  // No card, so no card maker's recommended supply: a small supply is only short of headroom.
  let found = false;
  for (let watts = 100; watts <= 600 && !found; watts += 5) {
    const { assessment, summary } = assess(
      without(partsOf("true", "true", { PSU: { capacity_watts: String(watts) } }), "GPU"),
      { purpose: "work" },
    );
    const ruleIds = summary.items.map((item: any) => item.ruleId);
    if (!ruleIds.includes("RULE_E_PSU_HEADROOM_LIMITED") || summary.hasBlockingUnknowns) continue;
    found = true;
    assertEquals(summary.status, "conditional");
    assertEquals(assessment.state, "complete");
    assertEquals(
      assessment.advice.map((item: any) => item.ruleId),
      ["RULE_E_PSU_HEADROOM_LIMITED"],
    );
    assertEquals(assessment.quotationReady, true);
  }
  assert(found, "a power supply with limited headroom and nothing for review");
});

Deno.test("S4A-12 (D3): a review rule is not advice: below the card maker's recommended supply is Needs Review", () => {
  let found = false;
  for (let watts = 300; watts <= 1200 && !found; watts += 10) {
    const { assessment, summary } = assess(
      partsOf("false", "true", { PSU: { capacity_watts: String(watts) } }),
    );
    if (!summary.items.some((item: any) => item.ruleId === "RULE_E_PSU_BELOW_RECOMMENDED"))
      continue;
    if (summary.items.some((item: any) => item.severity === "error")) continue;
    found = true;
    assertEquals(assessment.state, "needs_review");
    assert(
      assessment.reviewReasons.some(
        (r: any) => r.kind === "check" && r.ruleId === "RULE_E_PSU_BELOW_RECOMMENDED",
      ),
    );
    assertEquals(
      assessment.advice.some((item: any) => item.ruleId === "RULE_E_PSU_BELOW_RECOMMENDED"),
      false,
    );
  }
  assert(found, "a power supply below the recommended wattage that still runs the build");
});

Deno.test("S4A-13: an unavailable part blocks the quotation without changing the state", () => {
  const parts = partsOf("false", "true");
  parts.RAM = { ...parts.RAM, stock: 0 };
  const { assessment } = assess(parts);
  assertEquals(assessment.state, "complete");
  assertEquals(assessment.unavailableSlots, ["RAM"]);
  assertEquals(assessment.quotationReady, false);
  assertEquals(assessment.blockedBy, "unavailable");
  // A missing part is reported first.
  const incomplete = assess(without(parts, "PSU")).assessment;
  assertEquals(incomplete.blockedBy, "incomplete");
});

Deno.test("S4A-14: a value the engine can't confirm keeps a full build in Needs Review", () => {
  const parts = partsOf("false", "true");
  const stated = { ...parts.PSU, specs: { ...parts.PSU.specs } };
  delete stated.specs.ratedWattage;
  delete stated.capacity;
  const { assessment, summary } = assess({ ...parts, PSU: stated });
  assert(summary.hasBlockingUnknowns);
  assertEquals(assessment.state, "needs_review");
  assert(assessment.reviewReasons.some((r: any) => r.kind === "check"));
});

// ── Every combination ──────────────────────────────────────────────────────────────────────────────

const FLAGS: Flag[] = ["true", "false", undefined];
const PURPOSES: [string | undefined, Record<string, string>][] = [
  [undefined, {}],
  ["custom", {}],
  ["gaming", {}],
  ["creation", { type: "3D" }],
  ["professional", {}],
  ["professional", { type: "Software Development" }],
  ["programming", {}],
  ["work", {}],
  ["office", {}],
  ["general", {}],
];
const VARIANTS: { drop: string[]; owned: string[] }[] = [
  { drop: [], owned: [] },
  ...["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"].map((slot) => ({
    drop: [slot],
    owned: [],
  })),
  { drop: ["RAM"], owned: ["RAM"] },
  { drop: ["Storage"], owned: ["Storage"] },
  { drop: ["PSU"], owned: ["PSU"] },
  { drop: ["Cabinet"], owned: ["Cabinet"] },
];
const BASES = new Map<string, Record<string, any>>();
for (const igpu of FLAGS)
  for (const boxed of FLAGS) BASES.set(`${igpu}|${boxed}`, partsOf(igpu, boxed));

function* everyCase() {
  for (const [key, base] of BASES) {
    const [igpu, boxed] = key.split("|");
    for (const card of ["chosen", "owned", "none"]) {
      for (const cooler of ["chosen", "none"]) {
        for (const variant of VARIANTS) {
          for (const [purpose, details] of PURPOSES) {
            const drop = [...variant.drop];
            const owned = [...variant.owned];
            if (card !== "chosen") drop.push("GPU");
            if (card === "owned") owned.push("GPU");
            if (cooler === "none") drop.push("Cooler");
            yield {
              label: `igpu=${igpu} boxed=${boxed} card=${card} cooler=${cooler} drop=${variant.drop} owned=${variant.owned} ${purpose} ${JSON.stringify(details)}`,
              parts: without(base, ...drop),
              owned,
              purpose,
              details,
              igpu,
              boxed,
              card,
              cooler,
            };
          }
        }
      }
    }
  }
}

Deno.test("S4A-15: every combination keeps the precedence, the engine's gating and the purpose rule", () => {
  let cases = 0;
  for (const c of everyCase()) {
    cases++;
    const { assessment: a, summary, components } = assess(c.parts, c);
    const missing = a.gaps.some((gap: any) => gap.need === "missing");
    const needsCard = c.purpose ? purposeProfile(c.purpose, c.details).requiresDedicatedGpu : false;

    // D1: the state is the highest that applies.
    if (a.mismatches.length > 0) assertEquals(a.state, "incompatible", c.label);
    else if (missing) assertEquals(a.state, "incomplete", c.label);
    else if (a.reviewReasons.length > 0) assertEquals(a.state, "needs_review", c.label);
    else assertEquals(a.state, "complete", c.label);
    // Mismatches are exactly the engine's errors, apart from the card still to choose.
    assertEquals(
      a.mismatches.map((item: any) => item.ruleId),
      summary.items
        .filter(
          (item: any) =>
            item.severity === "error" && item.ruleId !== "RULE_I_GPU_MANDATORY_NO_IGPU",
        )
        .map((item: any) => item.ruleId),
      c.label,
    );

    if (!needsCard) {
      // With no purpose rule, the parts to choose are exactly what the engine counts as incomplete, and the
      // quotation is allowed exactly when the page allows it today.
      assertEquals(missing, !summary.complete, c.label);
      assertEquals(a.quotationReady, summary.complete && summary.valid, c.label);
    } else if (c.card === "none") {
      // D2: a purpose needing a card is Incomplete without one, whatever the processor states.
      assert(
        a.gaps.some(
          (gap: any) =>
            gap.slot === "GPU" &&
            gap.need === "missing" &&
            gap.reason === "gpu_required_for_purpose",
        ),
        c.label,
      );
      assertEquals(a.quotationReady, false, c.label);
    }

    // Unknown is never Complete.
    if (a.state === "complete") {
      assertEquals(summary.hasBlockingUnknowns, false, c.label);
      assert(summary.status === "compatible" || summary.status === "conditional", c.label);
      assertEquals(
        summary.items.some((item: any) => item.status === "unknown"),
        false,
        c.label,
      );
      assertEquals(a.ownedSlots, [], c.label);
    }
    if (c.cooler === "none" && components.CPU && c.boxed === "undefined") {
      assert(
        a.gaps.some((gap: any) => gap.slot === "Cooler" && gap.need === "unconfirmed"),
        c.label,
      );
      assert(a.state !== "complete", c.label);
    }
    if (c.card === "none" && components.CPU && c.igpu === "undefined" && !needsCard) {
      assert(
        a.gaps.some((gap: any) => gap.slot === "GPU" && gap.need === "unconfirmed"),
        c.label,
      );
      assert(a.state !== "complete", c.label);
    }
    // D5: an owned part is always reviewed.
    if (a.ownedSlots.length > 0) assert(a.state !== "complete", c.label);
    // Only incompatible or incomplete builds are blocked here; nothing in this table is unavailable.
    assertEquals(a.quotationReady, a.state === "needs_review" || a.state === "complete", c.label);
  }
  assertEquals(cases, 9 * 3 * 2 * VARIANTS.length * PURPOSES.length);
});

Deno.test("S4A-16: the result never depends on the order parts or owned slots were given in", () => {
  let checked = 0;
  for (const c of everyCase()) {
    if (checked++ % 7 !== 0) continue;
    const forward = assess(c.parts, c).assessment;
    const reversedParts = Object.fromEntries(Object.entries(c.parts).reverse());
    const reversed = assess(reversedParts, { ...c, owned: [...c.owned].reverse() }).assessment;
    assertEquals(reversed, forward, c.label);
    // And the same input gives the same answer twice.
    assertEquals(assess(c.parts, c).assessment, forward, c.label);
  }
});

// ── Recommendations ────────────────────────────────────────────────────────────────────────────────

Deno.test("S4A-17: every recommendation on the golden catalogues is quotable, and Needs Review exactly when it says so", () => {
  let builds = 0;
  for (const [name, catalogueOf] of Object.entries(GOLDEN_CATALOGUES)) {
    const catalogue = syncBuilderCatalogWithShopify(catalogueOf() as any).componentCatalog;
    for (const search of GOLDEN_SEARCHES) {
      const offer = generateCatalogOffer(
        catalogue,
        { purpose: search.purpose, details: search.details, brands: [] },
        { min: search.min, max: search.max },
        { allowUnverified: true },
      );
      for (const build of offer.builds) {
        builds++;
        const label = `${name} ${search.purpose} ${search.min}-${search.max} ${build.price}`;
        const { assessment } = assess(build.parts, {
          owned: build.owned || [],
          purpose: search.purpose,
          details: search.details,
        });
        assert(assessment.state === "complete" || assessment.state === "needs_review", label);
        assertEquals(assessment.state === "needs_review", Boolean(build.requiresReview), label);
        assertEquals(assessment.quotationReady, true, label);
      }
    }
  }
  assert(builds > 0);
});
