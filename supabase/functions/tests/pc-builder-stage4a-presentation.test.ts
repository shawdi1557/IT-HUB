// Stage 4A-3: how Expert Mode and Find My PC present a build's completeness, in the wording the owner approved on
// 8 November 2026 (D10, table W1 to W34). Every listing here is made up, with made-up test prices, and none is
// IT HUB stock. In memory only, apart from reading the two page files.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reviewedSpecs, testListingMaker } from "./_helpers/stage3-golden.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { checkCompatibility, compatibility, reportedItems, toCanonicalComponent } =
  await import("../../../src/lib/builder/compatibility.ts");
const { assessBuild, BUILD_STATE_PRECEDENCE } =
  await import("../../../src/lib/builder/completeness.ts");
const wording = await import("../../../src/lib/builder/completeness-wording.ts");
const {
  STATE_BADGE,
  INCOMPATIBLE_MESSAGE,
  REVIEW_MESSAGE,
  ADVICE_NOTE,
  OWNED_PART_NOTE,
  NO_LONGER_AVAILABLE,
  ASSEMBLY_NOT_SET,
  blockerLines,
  blockerMessage,
  reviewNotes,
  gapExplanation,
  CARD_NEEDED_FOR_PURPOSE,
  NO_CARD_AVAILABLE,
  pickerReviewLabel,
  cardStatus,
  customerChecks,
  repeatedChecks,
} = wording;
const { purposeProfile } = await import("../../../src/lib/builder/purpose.ts");

const page = Deno.readTextFileSync("src/pages/Builder.tsx");
const account = Deno.readTextFileSync("src/pages/Account.tsx");
const recommendationsSource = Deno.readTextFileSync("src/lib/builder/recommendations.ts");

type Flag = "true" | "false" | undefined;
const SLOTS = ["CPU", "Motherboard", "RAM", "GPU", "Storage", "PSU", "Cabinet", "Cooler"] as const;
const make = testListingMaker("s4a3");

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
  const listings = SLOTS.map((slot) =>
    make(
      `QZX S4A3 ${slot}`,
      slot,
      1000,
      slot === "CPU" ? cpu : reviewedSpecs(slot, overrides[slot]),
    ),
  );
  const catalogue = syncBuilderCatalogWithShopify(listings as any).componentCatalog;
  const parts: Record<string, any> = {};
  for (const slot of SLOTS) parts[slot] = catalogue[slot][0];
  return parts;
}

const without = (parts: Record<string, any>, ...slots: string[]) => {
  const copy = { ...parts };
  for (const slot of slots) delete copy[slot];
  return copy;
};

/** As the page does it: the engine's summary, then the assessment, with the page's owned parts and purpose. */
function assess(parts: Record<string, any>, options: { owned?: string[]; purpose?: string } = {}) {
  const components: Record<string, any> = {};
  for (const [slot, part] of Object.entries(parts)) {
    if (part) components[slot] = toCanonicalComponent(slot, part);
  }
  const summary = checkCompatibility(components, { ownedSlots: options.owned || [] });
  return assessBuild(components as any, summary, {
    ownedSlots: options.owned || [],
    ...(options.purpose ? { purpose: options.purpose } : {}),
  });
}

// ── The approved wording ───────────────────────────────────────────────────────────────────────────

Deno.test("S4A-W1: one badge per state, in the approved words, and none of the old ones", () => {
  assertEquals(Object.keys(STATE_BADGE).sort(), [...BUILD_STATE_PRECEDENCE].sort());
  assertEquals(STATE_BADGE, {
    incompatible: { label: "Incompatible", tone: "red" },
    incomplete: { label: "Incomplete", tone: "gray" },
    needs_review: { label: "Needs IT HUB review", tone: "amber" },
    complete: { label: "Compatible", tone: "green" },
  });
});

Deno.test("S4A-W2: the approved sentences, exactly", () => {
  assertEquals(
    INCOMPATIBLE_MESSAGE,
    "Some selected components are incompatible. Change them before requesting a quotation or saving this build.",
  );
  assertEquals(
    REVIEW_MESSAGE,
    "IT HUB will check this build before confirming your quotation. You can still request it.",
  );
  assertEquals(ADVICE_NOTE, "This advice doesn't stop your quotation.");
  assertEquals(OWNED_PART_NOTE, "Not included in the estimate. IT HUB will check it fits.");
  assertEquals(NO_LONGER_AVAILABLE, "No longer available");
  // W31: assembly is never advertised as free until IT HUB confirms its policy.
  assertEquals(ASSEMBLY_NOT_SET, "Confirmed with your quotation");
  const every = JSON.stringify(
    Object.values(wording).filter((value) => typeof value !== "function"),
  );
  for (const old of ["See Advice", "Needs checking", "Free", "In progress", "Needs attention"]) {
    assert(!every.includes(old), old);
  }
});

// ── Blockers, in the owner's order ─────────────────────────────────────────────────────────────────

Deno.test("S4A-W3 (W18): every blocker shown, one line each: Incompatible, Still to choose, unavailable", () => {
  const parts = without(partsOf("false", "true", { Motherboard: { socket: "AM5" } }), "Storage");
  parts.PSU = { ...parts.PSU, stock: 0 };
  const assessment = assess(parts);
  assertEquals(assessment.state, "incompatible");
  assertEquals(blockerLines(assessment), [
    { kind: "incompatible", text: INCOMPATIBLE_MESSAGE },
    { kind: "incomplete", text: "Still to choose: Storage." },
    { kind: "unavailable", text: "Replace what's no longer available: PSU." },
  ]);
  assertEquals(
    blockerMessage(assessment),
    `${INCOMPATIBLE_MESSAGE} Still to choose: Storage. Replace what's no longer available: PSU.`,
  );
});

Deno.test("S4A-W4: blockers appear exactly when the build can't be quoted, led by what blocks it", () => {
  let seen = 0;
  const states = new Set<string>();
  for (const igpu of ["true", "false", undefined] as Flag[]) {
    for (const boxed of ["true", "false", undefined] as Flag[]) {
      for (const removed of [[], ["GPU"], ["Cooler"], ["GPU", "Cooler"], ["PSU"], ["CPU"]]) {
        for (const socket of ["AM4", "AM5"]) {
          for (const stock of [5, 0]) {
            for (const purpose of [undefined, "gaming", "work", "programming", "professional"]) {
              for (const owned of [[], ["GPU"], ["Storage"]]) {
                const parts = without(
                  partsOf(igpu, boxed, { Motherboard: { socket } }),
                  ...removed,
                  ...owned,
                );
                if (parts.RAM) parts.RAM = { ...parts.RAM, stock };
                const assessment = assess(parts, { owned, purpose });
                const lines = blockerLines(assessment);
                states.add(assessment.state);
                assertEquals(lines.length === 0, assessment.quotationReady);
                if (lines.length) assertEquals(lines[0].kind, assessment.blockedBy);
                // Each kind once, in the owner's order.
                const order = ["incompatible", "incomplete", "unavailable"];
                const kinds = lines.map((line: any) => line.kind);
                assertEquals(
                  kinds,
                  order.filter((kind) => kinds.includes(kind)),
                );
                assertEquals(kinds.includes("incompatible"), assessment.mismatches.length > 0);
                assertEquals(
                  kinds.includes("incomplete"),
                  assessment.gaps.some((gap: any) => gap.need === "missing"),
                );
                assertEquals(kinds.includes("unavailable"), assessment.unavailableSlots.length > 0);
                // Needs Review never blocks on its own.
                if (assessment.state === "needs_review" && !assessment.unavailableSlots.length) {
                  assertEquals(lines, []);
                }
                seen++;
              }
            }
          }
        }
      }
    }
  }
  assert(seen > 1000, String(seen));
  assertEquals([...states].sort(), [...BUILD_STATE_PRECEDENCE].sort());
});

// ── Gaps and their reasons ─────────────────────────────────────────────────────────────────────────

Deno.test("S4A-W5 (D2, W8): a purpose that needs a card says so, even when the processor's graphics are unknown", () => {
  const parts = without(partsOf(undefined, "true"), "GPU");
  for (const purpose of ["gaming", "creation", "professional"]) {
    const assessment = assess(parts, { purpose });
    assertEquals(STATE_BADGE[assessment.state].label, "Incomplete", purpose);
    assertEquals(blockerLines(assessment), [
      {
        kind: "incomplete",
        text: "Still to choose: GPU.",
        details: ["GPU: The use you chose needs a dedicated graphics card."],
      },
    ]);
    // D2 outranks D4: the unknown graphics aren't also offered for IT HUB to confirm.
    assertEquals(reviewNotes(assessment), []);
  }
  // The same build with no purpose, as Expert Mode and saved drafts see it (D6), goes to IT HUB instead (D4).
  const neutral = assess(parts);
  assertEquals(STATE_BADGE[neutral.state].label, "Needs IT HUB review");
  assertEquals(blockerLines(neutral), []);
  assertEquals(reviewNotes(neutral), [
    "We couldn't confirm whether this processor has built-in graphics. Add a graphics card, or IT HUB will confirm whether you need one.",
  ]);
});

Deno.test("S4A-W6 (W9, W10): a part the processor states it lacks is named with its reason", () => {
  const assessment = assess(without(partsOf("false", "false"), "GPU", "Cooler"));
  assertEquals(assessment.state, "incomplete");
  assertEquals(blockerLines(assessment), [
    {
      kind: "incomplete",
      text: "Still to choose: GPU, Cooler.",
      details: [
        "GPU: This processor has no built-in graphics, so it needs a graphics card.",
        "CPU Cooler: This processor doesn't come with a cooler.",
      ],
    },
  ]);
});

Deno.test("S4A-W7 (W7, W13): essential parts are listed by name, with no reason added", () => {
  const assessment = assess({});
  assertEquals(blockerLines(assessment), [
    { kind: "incomplete", text: "Still to choose: CPU, Motherboard, RAM, Storage, PSU, Cabinet." },
  ]);
  for (const gap of assessment.gaps) assertEquals(gapExplanation(gap), undefined);
});

Deno.test("S4A-W8 (D4, W11, W12): an unknown cooler or graphics is for IT HUB to confirm, and blocks nothing", () => {
  const assessment = assess(without(partsOf(undefined, undefined), "GPU", "Cooler"), {
    purpose: "work",
  });
  assertEquals(assessment.state, "needs_review");
  assertEquals(blockerLines(assessment), []);
  assertEquals(reviewNotes(assessment), [
    "We couldn't confirm whether this processor has built-in graphics. Add a graphics card, or IT HUB will confirm whether you need one.",
    "We couldn't confirm whether this processor comes with a cooler. Add a CPU cooler, or IT HUB will confirm whether you need one.",
  ]);
});

Deno.test("S4A-W9 (D5, W25): each owned part sends the build to IT HUB, said once each", () => {
  const assessment = assess(without(partsOf("false", "true"), "GPU", "Storage"), {
    owned: ["Storage", "GPU", "GPU"],
  });
  assertEquals(STATE_BADGE[assessment.state].label, "Needs IT HUB review");
  assertEquals(blockerLines(assessment), []);
  assertEquals(reviewNotes(assessment), [
    "You're using your own GPU. IT HUB will check it fits.",
    "You're using your own storage. IT HUB will check it fits.",
  ]);
});

Deno.test("S4A-W10 (D3, W6): an advice-only build is Compatible, and its advice is still there to read", () => {
  let found = false;
  for (let watts = 100; watts <= 600 && !found; watts += 5) {
    const parts = without(
      partsOf("true", "true", { PSU: { capacity_watts: String(watts) } }),
      "GPU",
    );
    const checks = compatibility(parts, { ownedSlots: [] });
    if (!checks.summary.items.some((item: any) => item.ruleId === "RULE_E_PSU_HEADROOM_LIMITED")) {
      continue;
    }
    if (checks.summary.hasBlockingUnknowns) continue;
    found = true;
    const assessment = assess(parts, { purpose: "work" });
    assertEquals(checks.summary.status, "conditional");
    assertEquals(STATE_BADGE[assessment.state].label, "Compatible");
    assertEquals(blockerLines(assessment), []);
    // The page's Advice heading lists what `compatibility` marks as advice: the same checks as the assessment.
    const advised = checks.result.filter((check: any) => check.advice);
    assertEquals(advised.length, assessment.advice.length);
    assert(
      advised.every((check: any) => assessment.advice.some((a: any) => a.label === check.label)),
    );
  }
  assert(found, "a power supply with limited headroom and nothing for review");
});

// ── The pages use it ───────────────────────────────────────────────────────────────────────────────

Deno.test("S4A-W11: both screens badge, block and explain from the assessment, never their own rules", () => {
  assertEquals(page.split("const canRequest = assessment.quotationReady;").length - 1, 2);
  // Both quotation requests, both saves and the WhatsApp request (the last three guarded since Stage 4A-5).
  assertEquals(page.split("store.notify(blockerMessage(assessment));").length - 1, 5);
  assertEquals(page.split("<Blockers").length - 1, 2);
  assertEquals(page.split("<ReviewNotice").length - 1, 2);
  // The old per-screen rules are gone.
  for (const old of [
    "missingForQuotation",
    "hasConflict",
    "checks.valid && checks.complete",
    "complete && valid &&",
    "Please select all essential components",
    "Resolve compatibility",
    "IT HUB will check these before",
    "before confirming it.",
    "you already own this",
  ]) {
    assert(!page.includes(old), old);
  }
  // The approved sentences come from one place.
  assert(page.includes("{OWNED_PART_NOTE}"));
  assert(page.includes("{REVIEW_MESSAGE}"));
});

Deno.test("S4A-W12 (D6): only Find My PC passes a purpose; saved builds and Expert Mode have none", () => {
  assert(page.includes("const assessment = assessParts(parts, summary, owned);"));
  assert(page.includes("assessParts(parts, checks.summary, owned, initial.purpose)"));
  // Opened from Find My PC, a build carries the purpose it was found for.
  assertEquals(page.split("purpose: answers.purpose || undefined").length - 1, 2);
  // A build kept for sign-in keeps its purpose in the existing `intent` field, and gets it back.
  assert(page.includes("...(initial.purpose ? { intent: { purpose: initial.purpose } } : {}),"));
  assert(
    page.includes(
      'purpose: typeof pending.intent?.purpose === "string" ? pending.intent.purpose : undefined,',
    ),
  );
  // A saved build opened in the detail is built without one.
  const start = page.indexOf("const [detail, setDetail]");
  const savedDetail = page.slice(start, page.indexOf("useEffect", start));
  assert(savedDetail.includes("saved.parts") && !savedDetail.includes("purpose"));
});

Deno.test("S4A-W13 (W21, W31, W32): unavailable parts show no price, and assembly is never called free", () => {
  assertEquals(page.split("{NO_LONGER_AVAILABLE}").length - 1, 2);
  // Both screens, and the confirmation after a request (Stage 4A-5).
  assertEquals(page.split("ASSEMBLY_NOT_SET}").length - 1, 3);
  assert(account.includes("{assembly ? money(assembly) : ASSEMBLY_NOT_SET}"));
  for (const source of [page, account]) assert(!source.includes(': "Free"'));
  // Expert Mode's breakdown matches Find My PC's, and so does the confirmation after a request (Stage 4A-5).
  for (const label of ["Component Total", "Assembly / Service Charge", "Estimated Total"]) {
    assertEquals(page.split(`>${label}<`).length - 1, 3, label);
  }
  assert(account.includes("Assembly / Service Charge"));
});

// ── Stage 4A-3 closure, approved by the owner on 9 November 2026 ───────────────────────────────────

const W8 = "The use you chose needs a dedicated graphics card.";
const PURPOSES = [
  undefined,
  "gaming",
  "creation",
  "professional",
  "work",
  "programming",
  "general",
];
const FLAGS: Flag[] = ["true", "false", undefined];

/** Every processor graphics and cooler combination, with and without a card and a cooler, for every purpose. */
function* closureCases() {
  for (const igpu of FLAGS) {
    for (const boxed of FLAGS) {
      for (const drop of [[], ["GPU"], ["Cooler"], ["GPU", "Cooler"]]) {
        for (const purpose of PURPOSES) {
          const parts = without(partsOf(igpu, boxed), ...drop);
          const checks = compatibility(parts, { ownedSlots: [] });
          const assessment = assess(parts, purpose ? { purpose } : {});
          yield { igpu, boxed, drop, purpose, checks, assessment };
        }
      }
    }
  }
}

const RULE = {
  W9: "RULE_I_GPU_MANDATORY_NO_IGPU",
  W10: "RULE_C_COOLER_REQUIRED",
  W11: "RULE_I_DISPLAY_OUTPUT_UNKNOWN",
  W12: "RULE_C_STOCK_COOLER_UNKNOWN",
};

/** What the screen says about the build's gaps: the Still to choose details and the review notes. */
/** The page's source with spacing and trailing commas removed, so a check survives the formatter's wrapping. */
const tight = (text: string) => text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
const pageHas = (code: string) => tight(page).includes(tight(code));

const gapLines = (assessment: any) => [
  ...blockerLines(assessment).flatMap((line: any) => line.details || []),
  ...reviewNotes(assessment),
];

Deno.test("S4A-W14 (closure 2): each of the four repeated checks is left out on screen, and kept everywhere else", () => {
  const cases: Array<[string, Flag, Flag, string[], string, string]> = [
    ["W9", "false", "true", ["GPU"], RULE.W9, "Discrete graphics card required for display output"],
    ["W10", "true", "false", ["Cooler"], RULE.W10, "CPU cooler required"],
    ["W11", undefined, "true", ["GPU"], RULE.W11, "Display output unverified"],
    ["W12", "true", undefined, ["Cooler"], RULE.W12, "Bundled CPU cooler unverified"],
  ];
  for (const [id, igpu, boxed, drop, ruleId, label] of cases) {
    const parts = without(partsOf(igpu, boxed), ...drop);
    const checks = compatibility(parts, { ownedSlots: [] });
    const assessment = assess(parts);
    // The engine still reports it, and the page's raw rows still carry it.
    assert(
      checks.summary.items.some((item: any) => item.ruleId === ruleId),
      `${id}: engine`,
    );
    assert(
      checks.result.some((row: any) => row.label === label),
      `${id}: rows`,
    );
    // A check that needs IT HUB stays one of the assessment's review reasons.
    if (ruleId === RULE.W11 || ruleId === RULE.W12) {
      assert(
        assessment.reviewReasons.some((r: any) => r.kind === "check" && r.ruleId === ruleId),
        `${id}: review reason`,
      );
    }
    // The customer sees it once: the gap's own line, not the check as well.
    assert(repeatedChecks(assessment).has(ruleId), id);
    const shown = customerChecks(checks.result, checks.summary, assessment);
    assert(!shown.some((row: any) => row.label === label), `${id}: shown`);
    assertEquals(shown.length, checks.result.length - 1, `${id}: only that one left out`);
    assertEquals(gapLines(assessment).length, 1, `${id}: ${gapLines(assessment).join(" | ")}`);
  }
});

Deno.test("S4A-W15 (closure 2): a check is left out only while a line on screen says the same, and nothing else is", () => {
  let hidden = 0;
  for (const { checks, assessment, igpu, boxed, drop, purpose } of closureCases()) {
    const name = `${igpu}/${boxed}/${drop.join("+")}/${purpose}`;
    const items = reportedItems(checks.summary.items);
    // The page's rows follow the engine's reported items one for one, which is how a row is matched.
    assertEquals(
      checks.result.map((row: any) => row.label),
      items.map((item: any) => item.label),
      name,
    );
    const shown = customerChecks(checks.result, checks.summary, assessment);
    const repeated = repeatedChecks(assessment);
    assertEquals(
      shown.map((row: any) => row.label),
      items.filter((item: any) => !repeated.has(item.ruleId)).map((item: any) => item.label),
      name,
    );
    // Nothing is marked to leave out unless its part has a gap, whatever the engine reports now or later.
    for (const ruleId of repeated) {
      const slot = ruleId.startsWith("RULE_I_") ? "GPU" : "Cooler";
      assert(
        assessment.gaps.some((g: any) => g.slot === slot),
        `${name}: ${ruleId} left out with nothing saying it`,
      );
    }
    // Every check left out is said by a gap's line for the same part.
    const said = gapLines(assessment).join(" | ");
    for (const item of items.filter((item: any) => repeated.has(item.ruleId))) {
      hidden++;
      const slot = item.ruleId.startsWith("RULE_I_") ? "GPU" : "Cooler";
      const gap = assessment.gaps.find((g: any) => g.slot === slot);
      assert(gap, `${name}: ${item.ruleId} has no gap`);
      assert(said.includes(gapExplanation(gap)!), `${name}: ${item.ruleId} unexplained: ${said}`);
    }
    // W10: a build blocked for want of a cooler never shows the cooler as advice that doesn't stop the quotation.
    if (assessment.gaps.some((g: any) => g.slot === "Cooler")) {
      assert(!shown.some((row: any) => row.advice && row.label === "CPU cooler required"), name);
    }
  }
  assert(hidden > 0);
});

Deno.test("S4A-W16 (closure 3): the missing parts come in one fixed order, the same on both screens", () => {
  const ORDER = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet", "GPU", "Cooler"];
  const full = partsOf("false", "false");
  // Every way of leaving parts out, with the parts also given in reverse order.
  for (let mask = 0; mask < 1 << SLOTS.length; mask++) {
    const dropped = SLOTS.filter((_, index) => mask & (1 << index));
    const kept = without(full, ...dropped);
    const reversed = Object.fromEntries(Object.entries(kept).reverse());
    // Expert Mode has no purpose (D6). Find My PC passes one; a purpose that needs no card changes nothing.
    const expert = blockerLines(assess(kept));
    for (const purpose of ["work", "programming", "general"]) {
      assertEquals(blockerLines(assess(reversed, { purpose })), expert, `${dropped} ${purpose}`);
    }
    const line = expert.find((l: any) => l.kind === "incomplete");
    if (!line) continue;
    const named = line.text.replace("Still to choose: ", "").replace(/\.$/, "").split(", ");
    assertEquals(
      named,
      ORDER.filter((slot) => named.includes(slot)),
      dropped.join(","),
    );
  }
  // Both screens show that one list, from the one assessment.
  assertEquals(tight(page).split("<Blockersassessment={assessment}").length - 1, 2);
});

Deno.test("S4A-W17 (closure 1): a use that needs a card never offers the processor's own graphics as one", () => {
  assertEquals(CARD_NEEDED_FOR_PURPOSE, W8);
  assertEquals(
    gapExplanation({
      slot: "GPU",
      need: "missing",
      reason: "gpu_required_for_purpose",
      action: { kind: "choose", slot: "GPU" },
    }),
    W8,
  );
  // The page and the assessment ask the same question of the same purposes (D2).
  for (const purpose of ["gaming", "creation", "professional"]) {
    assert(purposeProfile(purpose).requiresDedicatedGpu, purpose);
  }
  for (const purpose of ["work", "programming", "general"]) {
    assert(!purposeProfile(purpose).requiresDedicatedGpu, purpose);
  }
  assert(
    pageHas(
      "const needsCard = Boolean(initial.purpose && purposeProfile(initial.purpose).requiresDedicatedGpu);",
    ),
  );
  assert(pageHas("answers.purpose && purposeProfile(answers.purpose).requiresDedicatedGpu"));
  // The picker: the approved sentence in place of removing the card, which stays for other uses.
  assert(pageHas('{selection === "GPU" && needsCard && ('));
  assert(
    pageHas('selection === "GPU" && parts.GPU && parts.CPU?.hasIntegratedGraphics && !needsCard'),
  );
  assertEquals(page.split("Use integrated graphics (remove graphics card)").length - 1, 1);
  // In the picker. The card says NO_CARD_AVAILABLE instead (owner, 9 November 2026: S4A-W20).
  assertEquals(page.split("{CARD_NEEDED_FOR_PURPOSE}").length - 1, 1);
  // The row and the reasons.
  assert(
    pageHas(
      '(type === "GPU" && parts.CPU?.hasIntegratedGraphics && !needsCard ? "Integrated graphics (built into CPU)"',
    ),
  );
  assert(pageHas("!parts.GPU && parts.CPU?.hasIntegratedGraphics && !needsCard"));
  assert(pageHas("!(needsCard && highlight === INTEGRATED_GRAPHICS_HIGHLIGHT)"));
  // The highlight it leaves out is the recommendation's own, word for word.
  assert(
    page.includes('const INTEGRATED_GRAPHICS_HIGHLIGHT = "The processor\'s integrated graphics";'),
  );
  assert(recommendationsSource.includes(': "The processor\'s integrated graphics",'));
  // The card.
  assert(pageHas('(type === "GPU" && cardNeeded ? "No graphics card selected"'));
  // The same build opened for another use starts afresh.
  assert(
    page.includes('key={JSON.stringify(detail.parts) + detail.name + (detail.purpose || "")}'),
  );
  // The Remove button is unchanged.
  assert(page.includes("aria-label={`Remove ${partLabels[type] || type}`}"));
});

Deno.test("S4A-W18 (closure 2): both screens list the checks the customer sees, and advise from the same", () => {
  assert(page.includes("const shownChecks = customerChecks(result, summary, assessment);"));
  assert(
    page.includes("const shownChecks = customerChecks(checks.result, checks.summary, assessment);"),
  );
  assertEquals(page.split("<AdviceList checks={shownChecks} />").length - 1, 2);
  assertEquals(page.split(/\{shownChecks\s*\.filter\(\(check\) => !check\.advice\)/).length - 1, 2);
  assert(!page.includes("<AdviceList checks={result} />"));
  assert(!page.includes("<AdviceList checks={checks.result} />"));
});

// ── Stage 4A-3 reconciliation, approved by the owner on 9 November 2026 ────────────────────────────

Deno.test("S4A-W19 (W29): a picker option IT HUB must check says Needs IT HUB review, naming the check", () => {
  assertEquals(pickerReviewLabel("BIOS support"), "Needs IT HUB review: BIOS support");
  // The badge's own words, so the two can't drift apart.
  assert(pickerReviewLabel("x").startsWith(`${STATE_BADGE.needs_review.label}: `));
  // Every check the engine leaves open on a part reads in the approved words, never the old ones.
  let open = 0;
  // Unconfirmed graphics with no card, and an unconfirmed boxed cooler with no cooler, leave checks open.
  for (const parts of [
    without(partsOf(undefined, "true"), "GPU"),
    without(partsOf("true", undefined), "Cooler"),
    without(partsOf(undefined, undefined), "GPU", "Cooler"),
  ]) {
    for (const slot of SLOTS) {
      const check = compatibility(parts, { ownedSlots: [] });
      const item = check.summary.items.find(
        (row: any) => row.status === "unknown" && row.affectedSlots.includes(slot),
      );
      if (!item) continue;
      open++;
      const line = pickerReviewLabel(item.label);
      assertEquals(line, `Needs IT HUB review: ${item.label}`);
      assert(!line.includes("Needs checking"), line);
    }
  }
  assert(open > 0, "a part with a check left open");
  // The picker uses it, after the stronger reasons and before "Compatible with this build".
  assert(
    pageHas(
      ': item.isVerified === false ? "Specifications unverified" : unverifiedCheck ? pickerReviewLabel(unverifiedCheck.label) : "Compatible with this build"',
    ),
  );
  assert(!page.includes("Needs checking"));
  assert(!page.includes("Needs IT HUB review:"));
});

Deno.test("S4A-W20: a card for a use that needs a graphics card, with none to offer, says Incomplete and why", () => {
  assertEquals(
    NO_CARD_AVAILABLE,
    "A dedicated graphics card is required, but none is currently available.",
  );
  // The state the card claims is the one the build opens in.
  for (const purpose of ["gaming", "creation", "professional"]) {
    for (const igpu of FLAGS) {
      const assessment = assess(without(partsOf(igpu, "true"), "GPU"), { purpose });
      assertEquals(STATE_BADGE[assessment.state].label, "Incomplete", `${purpose} ${igpu}`);
      assert(!assessment.quotationReady);
    }
  }
  // Since Stage 4A-4 the card decides from its build's own assessment (`cardStatus`): a use that needs a card,
  // with none bought or owned, is Incomplete, with the sentence, and no chip says it passed or needs review.
  for (const purpose of ["gaming", "creation", "professional"]) {
    const status = cardStatus(assess(without(partsOf("true", "true"), "GPU"), { purpose }), {
      confidenceBadge: "certified",
    });
    assertEquals(status.badge?.label, "Incomplete", purpose);
    assert(status.noCardAvailable && !status.specsConfirmed && !status.review, purpose);
  }
  assert(
    pageHas("{status.badge && (<Badge tone={status.badge.tone}>{status.badge.label}</Badge>)}"),
  );
  assert(pageHas("{status.specsConfirmed && ("));
  assert(pageHas('{!status.badge && (build.confidenceBadge === "high" ||'));
  // The chip and the sentence saying the build can still be requested.
  assertEquals(tight(page).split(tight("{status.review && (")).length - 1, 2);
  // The sentence in place of "Designed for Everyday use, with integrated graphics".
  assert(
    pageHas(
      '{status.noCardAvailable ? (<p className="mt-1 text-xs font-medium text-foreground">{NO_CARD_AVAILABLE}</p>) : (<p className="mt-1 text-xs text-muted-foreground">Designed for {build.designedFor}</p>)}',
    ),
  );
  assert(recommendationsSource.includes(': "Everyday use, with integrated graphics"'));
  // The card's GPU line stays as the closure set it.
  assert(pageHas('(type === "GPU" && cardNeeded ? "No graphics card selected"'));
});

Deno.test("S4A-W21: both screens show the approved wording from the assessment, wired in each place", () => {
  // W1 to W3: each screen's badge is its own assessment's state.
  assert(
    pageHas(
      "const assessment = assessParts(parts, summary, owned); const canRequest = assessment.quotationReady; const badge = STATE_BADGE[assessment.state];",
    ),
  );
  assert(
    pageHas(
      "const assessment = assessParts(parts, checks.summary, owned, initial.purpose); const canRequest = assessment.quotationReady; const badge = STATE_BADGE[assessment.state];",
    ),
  );
  assertEquals(page.split("<Badge tone={badge.tone}>{badge.label}</Badge>").length - 1, 2);
  // W6: the Advice heading and its note.
  assert(
    pageHas(
      '<p className="text-xs font-semibold">Advice</p><p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{ADVICE_NOTE}</p>',
    ),
  );
  // W21: an unavailable part shows no price, on each screen.
  assert(
    pageHas(
      '{assessment.unavailableSlots.includes(part.type as ComponentSlotId) ? (<strong className="shrink-0 text-red-600">{NO_LONGER_AVAILABLE}</strong>',
    ),
  );
  assert(
    pageHas(
      '{assessment.unavailableSlots.includes(type as ComponentSlotId) ? (<span className="text-red-600">{NO_LONGER_AVAILABLE}</span>',
    ),
  );
  // W23: an owned part's note, on each screen.
  assert(pageHas('<p className="mt-1 text-xs text-muted-foreground">{OWNED_PART_NOTE}</p>'));
  assert(pageHas("{isOwned ? OWNED_PART_NOTE : explanations[type]}"));
  // W26 to W28: a build for review says it can still be requested.
  assert(pageHas('[hasUnknown ? UNVERIFIED_NOTICE : "", review ? REVIEW_MESSAGE : ""]'));
  assert(pageHas('const review = assessment.state === "needs_review";'));
  // W16, W17: the pop-up is the blocker lines, in order, whatever blocks the build.
  const parts = partsOf("true", "true");
  const blocked = assess(without(parts, "PSU"));
  assertEquals(
    blockerMessage(blocked),
    blockerLines(blocked)
      .map((line) => line.text)
      .join(" "),
  );
  assertEquals(blockerMessage(blocked), "Still to choose: PSU.");
});
