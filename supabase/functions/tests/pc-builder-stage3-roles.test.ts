// Stage 3 Phase 2: budget-range fit and the offer roles (contract sections 2.2 and 11, owner rulings P2-1 to
// P2-7, and the strict range of 7 November 2026, section 11.6). Every listing here is made up, with made-up test prices, and none is IT HUB stock. In memory only.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GOLDEN_CATALOGUES,
  GOLDEN_SEARCHES,
  measureOffers,
  reviewedSpecs,
  roleOfferSet,
  statedSpecs,
  testListingMaker,
} from "./_helpers/stage3-golden.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const {
  buildIdentityKey,
  fillOfferRoles,
  generateCatalogOffer,
  generateDynamicCatalogRecommendations,
  medianPrice,
  nearestToMedian,
  pairOf,
  performancePriorityPick,
} = await import("../../../src/lib/builder/recommendations.ts");
const { purposeProfile } = await import("../../../src/lib/builder/purpose.ts");

const PHASE2 = JSON.parse(
  await Deno.readTextFile(new URL("./_helpers/stage3-phase2-baseline.json", import.meta.url)),
);
const PHASE1_FILE = new URL("./_helpers/stage3-golden-baseline.json", import.meta.url);
// The strict budget range (7 November 2026) changes the Phase 2 offers, so they're recorded separately again.
const STRICT = JSON.parse(
  await Deno.readTextFile(new URL("./_helpers/stage3-strict-baseline.json", import.meta.url)),
);
// Phase 3's candidate selection (7 November 2026) changes the offers again, so they're recorded separately too.
const PHASE3 = JSON.parse(
  await Deno.readTextFile(new URL("./_helpers/stage3-phase3-baseline.json", import.meta.url)),
);

const catalogueOf = (listings: any[]) => syncBuilderCatalogWithShopify(listings).componentCatalog;
const searchIn =
  (catalogue: any, owned: string[] = []) =>
  (purpose: string, details: Record<string, string>, min: number, max: number) =>
    generateDynamicCatalogRecommendations(
      catalogue,
      { purpose, details, brands: [], owned },
      { min, max },
      { allowUnverified: true },
    ) as any[];
const searchKey = (s: {
  purpose: string;
  details: Record<string, string>;
  min: number;
  max: number;
}) => `${s.purpose}|${JSON.stringify(s.details)}|${s.min}-${s.max}`;

const ROLES = ["Value Choice", "Performance Priority", "Balanced Choice", "Another Option"];
const GUARANTEES = [
  "No graphics card",
  "Confirmed specifications",
  "No review needed",
  "Review required",
  "Some specifications unconfirmed",
];
const LABELS = ["Best Value", "Best Balanced", "Highest Verified Performance"];
const INSUFFICIENT = "Insufficient information";
/** Words a role's reason must never use: it states a selection rule, never performance or compatibility. */
const FORBIDDEN =
  /faster|outperform|\bfps\b|frame rate of|benchmark|best performance|compatible|confirmed|guarantee|score/i;
const VALUE_SUITS = "The lowest-priced build here that suits what you asked for.";
const ROLE_REASONS = [
  VALUE_SUITS,
  // With owned parts only the maximum applies, so the range isn't claimed: "within your budget".
  "The only other suitable build within your budget with a different processor and graphics card.",
  "Another suitable build within your budget, at a higher price.",
  "The lowest-priced of the builds here that come closest to what you asked for.",
  "The lowest-priced build here for what you asked for, though some of what you stated can't be checked on it.",
  "Priced nearest the middle of the",
  "The only other suitable build within your range with a different processor and graphics card.",
  "Another suitable build within your range, at a higher price.",
  "which leans on the",
];

/**
 * The rules every offer keeps, checked on the builds a customer sees. `min` is the bottom of the range, and
 * `priority` whether the customer's use names a priority part.
 */
function assertOfferRules(builds: any[], min: number, priority: boolean, where: string) {
  assert(builds.length <= 3, where);
  // Zero identical builds.
  assertEquals(new Set(builds.map((b) => b.templateId)).size, builds.length, where);
  // One chip each: the evidence label, otherwise the role, otherwise the Stage 2 reason.
  for (const b of builds) {
    const expected =
      b.tradeoffLabel !== INSUFFICIENT ? b.tradeoffLabel : (b.offerRole ?? b.guarantee);
    assertEquals(b.tradeoff, expected, `${where}: chip`);
    assert([...LABELS, ...ROLES, ...GUARANTEES].includes(b.tradeoff), `${where}: ${b.tradeoff}`);
    if (b.tradeoff === "Confirmed specifications")
      assertEquals(b.confidenceBadge, "certified", where);
    if (b.tradeoff === "Review required") assertEquals(b.requiresReview, true, where);
    if (b.tradeoff === "No graphics card") assert(!b.parts.GPU, where);
  }
  // Each role at most once, except Another Option.
  for (const role of ["Value Choice", "Performance Priority", "Balanced Choice"]) {
    assert(builds.filter((b) => b.offerRole === role).length <= 1, `${where}: ${role} twice`);
  }
  // Zero repeated pairs outside the Stage 2 confirmed and review pair.
  const byPair = new Map<string, any[]>();
  for (const b of builds) byPair.set(pairOf(b), [...(byPair.get(pairOf(b)) || []), b]);
  for (const group of byPair.values()) {
    if (group.length === 1) continue;
    assertEquals(group.length, 2, `${where}: a pair shown three times`);
    const twin = group.find((b) =>
      ["Review required", "Some specifications unconfirmed"].includes(b.guarantee),
    );
    assert(twin, `${where}: a repeated pair that isn't the Stage 2 pair`);
    const other = group.find((b) => b !== twin)!;
    assert(twin.price < other.price, `${where}: the twin needing review is the cheaper one`);
    assertEquals(other.requiresReview, false, where);
    // A role never borrows a shown pair: only the twin itself can hold one (Value Choice, ruling P2-3).
    assert(!other.offerRole || other.offerRole === "Value Choice", where);
    assert(!twin.offerRole || twin.offerRole === "Value Choice", where);
  }
  // Performance Priority only where the use names a priority part. The strict range: no build below the
  // minimum, whatever put it there, unless the customer owns parts, and then the build says why.
  for (const b of builds) {
    if (b.offerRole === "Performance Priority") assert(priority, `${where}: no priority part`);
    if (b.owned.length === 0) assert(b.price >= min, `${where}: ${b.tradeoff} below the range`);
    else if (b.price < min) {
      assert(b.note?.includes("because you already own"), `${where}: ${b.note}`);
      assert(!/within your range/.test(b.purposeNotes.join(" ")), `${where}: range claimed`);
    }
  }
  // Display order: total price, then the stable key.
  for (let i = 1; i < builds.length; i++) {
    const [a, b] = [builds[i - 1], builds[i]];
    assert(
      a.price < b.price ||
        (a.price === b.price &&
          buildIdentityKey(a.parts, a.owned) < buildIdentityKey(b.parts, b.owned)),
      `${where}: display order`,
    );
  }
  // Each role's reason is stated, and no reason claims performance or compatibility.
  for (const b of builds) {
    const reasons = b.purposeNotes.filter((n: string) => ROLE_REASONS.some((r) => n.includes(r)));
    if (b.offerRole) assertEquals(reasons.length, 1, `${where}: one reason for ${b.offerRole}`);
    for (const reason of reasons) assert(!FORBIDDEN.test(reason), `${where}: ${reason}`);
  }
  // A Value Choice never claims to suit or meet the request while a stated requirement is unmet or unchecked,
  // and below the range it says which it is.
  const UNMET = /below|isn't confirmed|no Wi-Fi|No dedicated graphics card/;
  for (const b of builds) {
    if (b.offerRole !== "Value Choice") continue;
    const unmet = b.purposeNotes.some(
      (n: string) => UNMET.test(n) && !n.startsWith("You asked for"),
    );
    if (unmet)
      assert(!b.purposeNotes.includes(VALUE_SUITS), `${where}: ${b.purposeNotes.join(" ")}`);
  }
}

// ── Synthetic builds for the pure rules ──────────────────────────────────────

let nextPart = 1;
const part = (price: number, extra: Record<string, unknown> = {}) => ({
  id: `part-${nextPart++}`,
  name: `Part ${nextPart}`,
  price,
  ...extra,
});
const build = (price: number, cpu: any, gpu?: any) => ({
  price,
  parts: gpu ? { CPU: cpu, GPU: gpu } : { CPU: cpu },
});
const fill = (suitable: any[], options: Record<string, unknown> = {}) =>
  fillOfferRoles({
    shown: [],
    suitable,
    minBudget: 0,
    ownedSlots: [],
    isConfirmed: () => true,
    ...options,
  } as any);
const roleOf = (result: any, b: any) => result.roles.get(b)?.role;

// ── C. Balanced Choice and the median ────────────────────────────────────────

Deno.test("S3P2 C1: an odd count takes the middle price", () => {
  assertEquals(medianPrice([100, 200, 900]), 200);
  const pool = [100, 200, 900].map((p) => ({ price: p }));
  assertEquals(nearestToMedian(pool), pool[1]);
});

Deno.test("S3P2 C2: an even count takes the build nearest the mean of the two middle prices", () => {
  assertEquals(medianPrice([100, 200, 400, 500]), 300);
  const pool = [100, 260, 400, 500].map((p) => ({ price: p }));
  // The median is 330: ₹260 is 70 away and ₹400 is 70 away, so the lower price decides (C3).
  assertEquals(nearestToMedian(pool), pool[1]);
  const uneven = [100, 290, 400, 500, 520, 900].map((p) => ({ price: p }));
  // The median is 450: ₹400 and ₹500 are each 50 away, and the lower wins.
  assertEquals(nearestToMedian(uneven), uneven[2]);
});

Deno.test("S3P2 C3: two builds equally near the median: the lower price", () => {
  const pool = [100, 200, 300, 400].map((p) => ({ price: p }));
  assertEquals(nearestToMedian(pool), pool[1]);
});

Deno.test("S3P2 C4: the same price and distance: the stable key decides, in any input order", () => {
  const cheap = build(1000, part(1));
  const a = build(3000, part(1), part(1, { id: "gpu-a" }));
  const z = build(3000, part(1), part(1, { id: "gpu-z" }));
  const dear = build(5000, part(1), part(1));
  for (const order of [
    [cheap, a, z, dear],
    [dear, z, a, cheap],
    [z, cheap, dear, a],
  ]) {
    const result = fill(order);
    const balanced = result.shown.find((b: any) => roleOf(result, b) === "Balanced Choice");
    const [first] = [a, z].sort((x, y) =>
      buildIdentityKey(x.parts) < buildIdentityKey(y.parts) ? -1 : 1,
    );
    assertEquals(balanced, first);
  }
});

Deno.test("S3P2 C5: builds with the Value Choice pair are left out before the median is taken", () => {
  const cpu = part(1);
  const card = part(1);
  const value = build(1000, cpu, card);
  // The same pair, with more memory, sits right on what would otherwise be the median.
  const samePair = build(3000, cpu, card);
  const others = [build(2000, part(1), part(1)), build(4000, part(1), part(1))];
  const result = fill([value, samePair, ...others]);
  assertEquals(roleOf(result, value), "Value Choice");
  assert(!result.shown.includes(samePair));
  const balanced = result.shown.find((b: any) => roleOf(result, b) === "Balanced Choice");
  // Two left, ₹2,000 and ₹4,000: the median is ₹3,000, equally near both, so the lower.
  assertEquals(balanced, others[0]);
  assertEquals(
    result.roles.get(balanced!)?.reason,
    "Priced nearest the middle of the 2 suitable builds within your range.",
  );
});

Deno.test("S3P2 C6: with no in-range build of another pair, Balanced Choice is left out", () => {
  const cpu = part(1);
  const card = part(1);
  const below = [build(1000, part(1), part(1)), build(1500, part(1), part(1))];
  const inRangeSamePair = build(3000, cpu, card);
  const value = build(900, cpu, card);
  const result = fill([...below, value, inRangeSamePair], { minBudget: 2000 });
  assertEquals(roleOf(result, value), "Value Choice");
  assert(![...result.roles.values()].some((r: any) => r.role === "Balanced Choice"));
  assert(![...result.roles.values()].some((r: any) => r.role === "Another Option"));
  // Fewer than three, because no further suitable build in the range has a distinct pair.
  assertEquals(result.shown.length, 1);
});

Deno.test("S3P2 C7: Balanced Choice leaves out every shown pair, guarantees and Performance Priority too", () => {
  const guaranteeBuild = build(5000, part(1), part(1));
  const value = build(1000, part(1), part(1));
  const perf = build(6000, part(1), part(9000));
  const middle = build(4000, part(1), part(5000));
  // The guarantee's pair, at a price that would otherwise sit on the median.
  const guaranteePair = build(5000, guaranteeBuild.parts.CPU, guaranteeBuild.parts.GPU);
  const result = fill([value, perf, guaranteeBuild, middle, guaranteePair], {
    shown: [guaranteeBuild],
    priority: "GPU",
    priorityAsked: "AAA games",
    max: 4,
  });
  assertEquals(roleOf(result, value), "Value Choice");
  assertEquals(roleOf(result, perf), "Performance Priority");
  // Left: only the ₹4,000 build. The guarantee's pair and Performance Priority's are both out.
  assertEquals(roleOf(result, middle), "Balanced Choice");
  assert(!result.shown.includes(guaranteePair));
  assertEquals(new Set(result.shown.map(pairOf)).size, result.shown.length);
});

// ── Value Choice ─────────────────────────────────────────────────────────────

Deno.test("S3P2 V1: Value Choice is the lowest-priced suitable build, below the range if it suits", () => {
  const value = build(1000, part(1), part(1));
  const result = fill([build(5000, part(1), part(1)), value, build(3000, part(1), part(1))], {
    minBudget: 2000,
  });
  assertEquals(result.valuePick, value);
  assertEquals(roleOf(result, value), "Value Choice");
});

Deno.test("S3P2 V2: equal prices: confirmed before review, then the stable key", () => {
  const review = build(1000, part(1), part(1));
  const confirmed = build(1000, part(1), part(1));
  const result = fill([review, confirmed], { isConfirmed: (b: any) => b === confirmed });
  assertEquals(result.valuePick, confirmed);
  const a = build(1000, part(1, { id: "cpu-a" }));
  const z = build(1000, part(1, { id: "cpu-z" }));
  assertEquals(fill([z, a]).valuePick, a);
  assertEquals(fill([a, z]).valuePick, a);
});

Deno.test("S3P2 V3: a Value Choice already shown by a guarantee takes the role there, with no duplicate", () => {
  const twin = build(1000, part(1), part(1));
  const result = fill([twin, build(2000, part(1), part(1))], { shown: [twin] });
  assertEquals(roleOf(result, twin), "Value Choice");
  assertEquals(result.shown.filter((b: any) => b === twin).length, 1);
});

Deno.test("S3P2 V4: Value Choice passes over a build whose pair another shown build has", () => {
  const cpu = part(1);
  const card = part(1);
  const shownBuild = build(2000, cpu, card);
  const samePairCheaper = build(1000, cpu, card);
  const next = build(1500, part(1), part(1));
  const result = fill([samePairCheaper, next, shownBuild], { shown: [shownBuild] });
  assertEquals(result.valuePick, next);
  assert(!result.shown.includes(samePairCheaper));
});

// ── B. Performance Priority evidence ─────────────────────────────────────────

const card = (price: number, architecture: string | undefined, figures: number[], sourced = true) =>
  part(price, {
    verificationStatus: "manufacturer_verified",
    performance: architecture
      ? {
          architecture,
          figures: {
            shaderUnits: figures[0],
            boostClockMhz: figures[1],
            vramGb: figures[2],
            memoryBusBits: figures[3],
          },
          sourceUrl: sourced ? "https://www.example.org/made-up-card" : undefined,
        }
      : undefined,
  });
const keyOf = (b: any) => buildIdentityKey(b.parts);

Deno.test("S3P2 B1: comparable figures with one leader: the leader, on figures", () => {
  // The leader isn't the dearest card, so a price rule would pick another build.
  const leader = card(30000, "Ada", [5000, 2600, 12, 192]);
  const builds = [
    build(60000, part(1), leader),
    build(70000, part(1), card(45000, "Ada", [3000, 2400, 8, 128])),
    build(50000, part(1), card(20000, "Ada", [2000, 2200, 8, 128])),
  ];
  const picked = performancePriorityPick(builds, "GPU", keyOf)!;
  assertEquals(picked.basis, "figures");
  assertEquals(picked.build, builds[0]);
});

Deno.test("S3P2 B2: different architectures: the price rule", () => {
  const builds = [
    build(60000, part(1), card(30000, "Ada", [5000, 2600, 12, 192])),
    build(70000, part(1), card(45000, "RDNA 3", [3000, 2400, 8, 128])),
  ];
  const picked = performancePriorityPick(builds, "GPU", keyOf)!;
  assertEquals(picked.basis, "price");
  assertEquals(picked.build, builds[1]);
});

Deno.test("S3P2 B2b: one card beats both others, but those two don't compare: the price rule", () => {
  const leader = card(30000, "Ada", [6000, 2800, 16, 256]);
  const builds = [
    build(60000, part(1), leader),
    // More shader units but a lower clock than the next card: neither is higher.
    build(70000, part(1), card(45000, "Ada", [4000, 2300, 8, 128])),
    build(50000, part(1), card(20000, "Ada", [3000, 2500, 8, 128])),
  ];
  const picked = performancePriorityPick(builds, "GPU", keyOf)!;
  assertEquals(picked.basis, "price");
  assertEquals(picked.build, builds[1]);
});

Deno.test("S3P2 B3: missing figures: the price rule", () => {
  const builds = [
    build(60000, part(1), card(30000, "Ada", [5000, 2600, 12, 192])),
    build(70000, part(1), card(45000, undefined, [])),
  ];
  const picked = performancePriorityPick(builds, "GPU", keyOf)!;
  assertEquals(picked.basis, "price");
  assertEquals(picked.build, builds[1]);
});

Deno.test("S3P2 B4: comparable, but no single leader: the price rule", () => {
  const same = [4000, 2500, 8, 128];
  const builds = [
    build(60000, part(1), card(30000, "Ada", same)),
    build(70000, part(1), card(45000, "Ada", same)),
  ];
  const picked = performancePriorityPick(builds, "GPU", keyOf)!;
  assertEquals(picked.basis, "price");
  assertEquals(picked.build, builds[1]);
});

Deno.test("S3P2 B4b: figures no manufacturer source backs don't decide: the price rule", () => {
  const builds = [
    build(60000, part(1), card(30000, "Ada", [5000, 2600, 12, 192], false)),
    build(70000, part(1), card(45000, "Ada", [3000, 2400, 8, 128], false)),
  ];
  assertEquals(performancePriorityPick(builds, "GPU", keyOf)!.basis, "price");
});

Deno.test("S3P2 B4c: nothing to compare: one candidate, or every candidate spends the same on it", () => {
  assertEquals(performancePriorityPick([build(1000, part(1), part(500))], "GPU", keyOf), undefined);
  const shared = part(500);
  assertEquals(
    performancePriorityPick(
      [build(1000, part(1), shared), build(2000, part(1), shared)],
      "GPU",
      keyOf,
    ),
    undefined,
  );
});

Deno.test("S3P2 B4d: two builds with the leading card: the lower total price", () => {
  const leader = card(30000, "Ada", [5000, 2600, 12, 192]);
  const builds = [
    build(80000, part(1), leader),
    build(60000, part(1), leader),
    build(50000, part(1), card(20000, "Ada", [2000, 2200, 8, 128])),
  ];
  assertEquals(performancePriorityPick(builds, "GPU", keyOf)!.build, builds[1]);
});

Deno.test("S3P2 B5: the price reason says it's price, the figure reason says only published figures", () => {
  const price = fill(
    [
      build(1000, part(1), part(100)),
      build(2000, part(1), part(900)),
      build(1500, part(1), part(300)),
    ],
    { priority: "GPU", priorityAsked: "AAA games" },
  );
  const reasons = [...price.roles.values()].map((r: any) => r.reason);
  const perf = reasons.find((r: string) => r.includes("leans on"))!;
  assertEquals(
    perf,
    "You asked for AAA games, which leans on the graphics card. It spends the most on the graphics card. That's price, not measured performance.",
  );
  const leader = card(30000, "Ada", [5000, 2600, 12, 192]);
  const figures = fill(
    [
      build(10000, part(1), card(5000, "Ada", [1000, 2000, 8, 128])),
      build(60000, part(1), leader),
      build(70000, part(1), card(45000, "Ada", [3000, 2400, 8, 128])),
    ],
    { priority: "GPU", priorityAsked: "1440p" },
  );
  const figureReason = [...figures.roles.values()]
    .map((r: any) => r.reason)
    .find((r: string) => r.includes("leans on"));
  assertEquals(
    figureReason,
    "You asked for 1440p, which leans on the graphics card. Its graphics card has the highest published figures of the builds compared.",
  );
  for (const reason of [...reasons, figureReason]) assert(!FORBIDDEN.test(reason!), reason);
});

Deno.test("S3P2 A7b: Performance Priority never takes a pair already shown, though it spends the most", () => {
  const cpu = part(500);
  const topCard = part(9000);
  const value = build(9500, cpu, topCard);
  // The Value Choice's pair again, with more memory: the dearest card, but its pair is already shown.
  const samePairMoreMemory = build(15000, cpu, topCard);
  const midCard = build(12000, part(500), part(5000));
  const smallCard = build(11000, part(500), part(1000));
  const result = fill([value, samePairMoreMemory, midCard, smallCard], {
    priority: "GPU",
    priorityAsked: "AAA games",
  });
  assertEquals(roleOf(result, value), "Value Choice");
  assertEquals(roleOf(result, midCard), "Performance Priority");
  assert(!result.shown.includes(samePairMoreMemory));
});

Deno.test("S3P2 B6: no priority part and no approved guideline: no Performance Priority", () => {
  const result = fill([
    build(1000, part(1), part(100)),
    build(2000, part(1), part(900)),
    build(1500, part(1), part(300)),
  ]);
  assert(![...result.roles.values()].some((r: any) => r.role === "Performance Priority"));
  for (const [purpose, details] of [
    ["gaming", {}],
    ["creation", { type: "Video" }],
    ["work", {}],
    ["programming", {}],
    ["professional", { type: "Software Development" }],
    ["general", {}],
    ["office", {}],
  ] as [string, Record<string, string>][]) {
    assertEquals(purposeProfile(purpose, details).priority, undefined, purpose);
  }
});

// ── P2-1: Another Option, and fewer than three ──────────────────────────────

Deno.test("S3P2 P2-1: Another Option takes the highest-priced suitable in-range build of a new pair", () => {
  const dearest = build(9000, part(1), part(1));
  const result = fill([
    build(1000, part(1), part(1)),
    build(5000, part(1), part(1)),
    build(6000, part(1), part(1)),
    dearest,
  ]);
  assertEquals(roleOf(result, dearest), "Another Option");
  assertEquals(
    result.roles.get(dearest)?.reason,
    "Another suitable build within your range, at a higher price.",
  );
});

Deno.test("S3P2 P2-1: never forced: fewer than three only when no further suitable distinct build qualifies", () => {
  const random = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let run = 0; run < 2000; run++) {
    const next = random(run + 1);
    const cpus = Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
      part(1000 + Math.floor(next() * 9) * 1000),
    );
    const cards = Array.from({ length: Math.floor(next() * 4) }, () =>
      part(2000 + Math.floor(next() * 9) * 1000),
    );
    const pool: any[] = [];
    for (const cpu of cpus) {
      for (const gpu of [undefined, ...cards]) {
        if (next() < 0.6)
          pool.push(build(cpu.price + (gpu?.price ?? 0) + Math.floor(next() * 3) * 500, cpu, gpu));
      }
    }
    const minBudget = Math.floor(next() * 12) * 1000;
    const shown = pool.length > 0 && next() < 0.3 ? [pool[Math.floor(next() * pool.length)]] : [];
    const result = fill(pool, {
      shown: shown.slice(),
      minBudget,
      priority: next() < 0.5 ? "GPU" : undefined,
      priorityAsked: "AAA games",
    });
    const where = `run ${run}`;
    assert(result.shown.length <= 3, where);
    // No two shown builds share a pair.
    assertEquals(new Set(result.shown.map(pairOf)).size, result.shown.length, where);
    if (result.shown.length < 3) {
      const shownPairs = new Set(result.shown.map(pairOf));
      const left = pool.filter((b) => b.price >= minBudget && !shownPairs.has(pairOf(b)));
      assertEquals(left, [], `${where}: a distinct suitable in-range build was left out`);
    }
    // The Value Choice is the cheapest suitable build whose pair isn't held by an earlier shown build.
    if (result.valuePick && !shown.includes(result.valuePick)) {
      const blocked = new Set(shown.map(pairOf));
      const cheapest = Math.min(...pool.filter((b) => !blocked.has(pairOf(b))).map((b) => b.price));
      assertEquals(result.valuePick.price, cheapest, where);
    }
  }
});

// ── End to end: the catalogue, the engine and the wording ────────────────────

/** A reviewed catalogue with a cheaper power supply that needs review, so the Stage 2 pair exists. */
function pairCatalogue(extra: (p: ReturnType<typeof testListingMaker>) => any[] = () => []) {
  const p = testListingMaker("p2pair");
  return [
    p("QZX P2 CPU Entry", "CPU", 9500, reviewedSpecs("CPU")),
    p("QZX P2 CPU Mid", "CPU", 16500, reviewedSpecs("CPU")),
    p("QZX P2 CPU High", "CPU", 27500, reviewedSpecs("CPU")),
    p("QZX P2 Board", "Motherboard", 7200, reviewedSpecs("Motherboard")),
    p("QZX P2 Memory 16GB", "RAM", 3300, reviewedSpecs("RAM")),
    p("QZX P2 Card A", "GPU", 24500, reviewedSpecs("GPU")),
    p("QZX P2 Card B", "GPU", 38500, reviewedSpecs("GPU")),
    p("QZX P2 Drive", "Storage", 4600, reviewedSpecs("Storage")),
    p("QZX P2 Power Reviewed", "PSU", 4800, reviewedSpecs("PSU")),
    p("QZX P2 Power Blank", "PSU", 3000, {}),
    p("QZX P2 Case", "Cabinet", 3200, reviewedSpecs("Cabinet")),
    ...extra(p),
  ];
}

Deno.test("S3P2 A1 A2: the confirmed and review pair is kept, with its notes, though roles could fill every place", () => {
  const builds = searchIn(catalogueOf(pairCatalogue()))("gaming", {}, 40000, 150000);
  assertEquals(builds.length, 3);
  const [twin, confirmed] = builds;
  assertEquals(pairOf(twin), pairOf(confirmed));
  assertEquals(twin.requiresReview, true);
  assertEquals(twin.guarantee, "Review required");
  assertEquals(confirmed.guarantee, "Confirmed specifications");
  assertEquals(confirmed.tradeoff, "Confirmed specifications");
  // The cheaper twin is the lowest-priced suitable build, so it takes Value Choice (ruling P2-3).
  assertEquals(twin.tradeoff, "Value Choice");
  assert(twin.purposeNotes.some((n: string) => n.startsWith("Differs from the ₹57,100 build in:")));
  assert(
    confirmed.purposeNotes.some((n: string) => n.startsWith("Differs from the ₹55,300 build in:")),
  );
  assertOfferRules(builds, 40000, false, "pair");
});

Deno.test("S3P2 A3 A6: two builds with the same pair and memory sizes apart: only one is shown", () => {
  const items = pairCatalogue((p) => [
    p("QZX P2 Memory 32GB", "RAM", 6400, reviewedSpecs("RAM", { ram_capacity_gb: "32" })),
  ]);
  const builds = searchIn(catalogueOf(items))("gaming", {}, 40000, 150000);
  assertOfferRules(builds, 40000, false, "memory sizes");
});

Deno.test("S3P2 A5: a confirmed build cheaper than its review twin: only the confirmed build", () => {
  const items = pairCatalogue().map((item) =>
    item.name === "QZX P2 Power Blank" ? { ...item, price: 9000 } : item,
  );
  const builds = searchIn(catalogueOf(items))("gaming", {}, 40000, 150000);
  assert(!builds.some((b) => b.parts.PSU.name === "QZX P2 Power Blank"));
  assertOfferRules(builds, 40000, false, "dearer twin");
});

Deno.test("S3P2 A7 D1 D3: every golden search keeps the offer rules", () => {
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const search = searchIn(catalogueOf(make()));
    for (const s of GOLDEN_SEARCHES) {
      const priority = Boolean(purposeProfile(s.purpose, s.details).priority);
      assertOfferRules(
        search(s.purpose, s.details, s.min, s.max),
        s.min,
        priority,
        `${name} ${searchKey(s)}`,
      );
    }
  }
});

Deno.test("S3P2 D2: review notices and the reasons no label was earned stay visible", () => {
  const search = searchIn(catalogueOf(GOLDEN_CATALOGUES.sparse()));
  for (const s of GOLDEN_SEARCHES) {
    for (const b of search(s.purpose, s.details, s.min, s.max)) {
      if (b.requiresReview) assert(b.reviewItems.length > 0, searchKey(s));
      if (b.tradeoffLabel === INSUFFICIENT) assert(b.rankingReasons.length > 0, searchKey(s));
    }
  }
});

Deno.test("S3P2 random catalogues: the offer rules hold on 300 catalogues", () => {
  const random = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const slots = ["CPU", "Motherboard", "RAM", "GPU", "Storage", "PSU", "Cabinet"] as const;
  const searches: [string, Record<string, string>][] = [
    ["gaming", {}],
    ["gaming", { type: "AAA Games" }],
    ["gaming", { type: "Competitive / Esports" }],
    ["creation", { type: "3D" }],
    ["programming", {}],
    ["work", {}],
  ];
  for (let run = 0; run < 300; run++) {
    const next = random(run + 7);
    const p = testListingMaker(`rnd${run}`);
    const items: any[] = [];
    for (const slot of slots) {
      const count = 1 + Math.floor(next() * 4);
      for (let i = 0; i < count; i++) {
        const kind = next();
        const extra: Record<string, string> =
          slot === "RAM" ? { ram_capacity_gb: String([8, 16, 32][Math.floor(next() * 3)]) } : {};
        const specs =
          kind < 0.5 ? reviewedSpecs(slot, extra) : kind < 0.8 ? statedSpecs(slot, extra) : {};
        items.push(p(`QZX R ${slot} ${i}`, slot, 1000 + Math.floor(next() * 40) * 1000, specs));
      }
    }
    const catalogue = catalogueOf(items);
    const [purpose, details] = searches[run % searches.length];
    const min = [30000, 50000, 70000][run % 3];
    const builds = searchIn(catalogue)(purpose, details, min, min + 40000);
    assertOfferRules(builds, min, Boolean(purposeProfile(purpose, details).priority), `run ${run}`);
  }
});

/** One product per slot, so one build whose price the tests read rather than assume. */
function oneBuildCatalogue(tag: string, memory: [string, Record<string, string>]) {
  const p = testListingMaker(tag);
  return catalogueOf([
    p(`QZX ${tag} CPU`, "CPU", 9500, reviewedSpecs("CPU")),
    p(`QZX ${tag} Board`, "Motherboard", 7200, reviewedSpecs("Motherboard")),
    p(`QZX ${tag} ${memory[0]}`, "RAM", 3300, memory[1]),
    p(`QZX ${tag} Card`, "GPU", 24500, reviewedSpecs("GPU")),
    p(`QZX ${tag} Drive`, "Storage", 4600, reviewedSpecs("Storage")),
    p(`QZX ${tag} Power`, "PSU", 4800, reviewedSpecs("PSU")),
    p(`QZX ${tag} Case`, "Cabinet", 3200, reviewedSpecs("Cabinet")),
  ]);
}
const offerIn =
  (catalogue: any, owned: string[] = []) =>
  (purpose: string, details: Record<string, string>, min: number, max: number) =>
    generateCatalogOffer(
      catalogue,
      { purpose, details, brands: [], owned },
      { min, max },
      { allowUnverified: true },
    );

Deno.test("S3P2 strict range: the minimum and the maximum are both inclusive boundaries", () => {
  const offer = offerIn(oneBuildCatalogue("edge", ["Memory 16GB", reviewedSpecs("RAM")]));
  const [build] = offer("gaming", {}, 1000, 400000).builds;
  const price = build.price;
  // At either boundary it's offered.
  assertEquals(
    offer("gaming", {}, price, price + 20000).builds.map((b: any) => b.price),
    [price],
  );
  assertEquals(
    offer("gaming", {}, price - 20000, price).builds.map((b: any) => b.price),
    [price],
  );
  // One rupee past either boundary, and it isn't.
  const above = offer("gaming", {}, price + 1, price + 20000);
  assertEquals(above.builds, []);
  assertEquals(above.cheaperFrom, price);
  const below = offer("gaming", {}, price - 20000, price - 1);
  assertEquals(below.builds, []);
  assertEquals(below.cheaperFrom, undefined);
});

Deno.test("S3P2 strict range: nothing below the range fills a place, and the customer is told what was found", () => {
  // Every suitable sparse build costs less than ₹1,00,000: nothing is offered, and only the price is said.
  const offer = offerIn(catalogueOf(GOLDEN_CATALOGUES.sparse()))("gaming", {}, 100000, 150000);
  assertEquals(offer.builds, []);
  assertEquals(offer.cheaperFrom, 58800);
  assertEquals(offer.notices, []);
  // Every golden search: no build outside the range, and fewer than three is always said.
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const search = offerIn(catalogueOf(make()));
    for (const s of GOLDEN_SEARCHES) {
      const where = `${name} ${searchKey(s)}`;
      const result = search(s.purpose, s.details, s.min, s.max);
      for (const b of result.builds) {
        assert(b.price >= s.min && b.price <= s.max, `${where}: ₹${b.price}`);
        assertEquals(b.note, undefined, where);
      }
      const count = result.builds.length;
      if (count === 1) {
        assert(
          result.notices.includes("Only one suitable build was found within your range."),
          where,
        );
      }
      if (count === 2) {
        assert(
          result.notices.includes("Only two suitable builds were found within your range."),
          where,
        );
      }
      if (count === 3) assert(!result.notices.some((n: string) => n.startsWith("Only")), where);
      if (count === 0) assertEquals(result.notices, [], where);
    }
  }
});

Deno.test("S3P2 strict range: the Value Choice is the lowest-priced suitable build within the range", () => {
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const search = offerIn(catalogueOf(make()));
    for (const s of GOLDEN_SEARCHES) {
      const { builds } = search(s.purpose, s.details, s.min, s.max);
      const value = builds.find((b: any) => b.offerRole === "Value Choice");
      if (!value) continue;
      assert(value.price >= s.min, `${name} ${searchKey(s)}`);
      // Nothing cheaper is offered under another role.
      for (const b of builds) {
        if (b.offerRole && b.offerRole !== "Value Choice") {
          assert(b.price >= value.price, `${name} ${searchKey(s)}`);
        }
      }
    }
  }
});

Deno.test("S3P2 strict range: with owned parts only the maximum applies, and the build says why it costs less", () => {
  const catalogue = oneBuildCatalogue("own", ["Memory 16GB", reviewedSpecs("RAM")]);
  const result = offerIn(catalogue, ["Storage"])("gaming", {}, 200000, 300000);
  assertEquals(result.builds.length, 1);
  const [build] = result.builds;
  assert(build.price < 200000);
  assertEquals(build.note, "It costs less than your range because you already own the storage.");
  assert(result.notices.includes("Only one suitable build was found within your budget."));
  // Two owned parts are named together, and an owned build is still never above the maximum.
  const two = offerIn(catalogue, ["RAM", "Storage"])("gaming", {}, 200000, 300000).builds[0];
  assertEquals(
    two.note,
    "It costs less than your range because you already own the memory and storage.",
  );
  assertEquals(offerIn(catalogue, ["Storage"])("gaming", {}, 1000, 2000).builds, []);
  // With several builds, the roles below the range speak of the budget, never of the range.
  const owned = offerIn(catalogueOf(chipCatalogue(["QZX C Power Blank", {}])), ["Storage"])(
    "gaming",
    {},
    200000,
    300000,
  ).builds;
  const placed = owned.filter(
    (b: any) => b.offerRole === "Balanced Choice" || b.offerRole === "Another Option",
  );
  assert(placed.length > 0, owned.map((b: any) => b.offerRole).join());
  for (const b of owned)
    assert(!b.purposeNotes.join(" ").includes("within your range"), b.purposeNotes.join(" | "));
  assert(placed.every((b: any) => b.purposeNotes.join(" ").includes("within your budget")));
});

Deno.test("S3P2 explanations: within the range, 'suits' only when nothing stated is unmet or unchecked", () => {
  const video = (tag: string, memory: [string, Record<string, string>]) =>
    offerIn(oneBuildCatalogue(tag, memory))("creation", { type: "Video" }, 40000, 150000).builds[0];
  // Video editing: Adobe's memory figure, met by a stated 16GB kit.
  const meets = video("meets", ["Memory 16GB", reviewedSpecs("RAM")]);
  assertEquals(meets.offerRole, "Value Choice");
  assert(meets.purposeNotes.includes(VALUE_SUITS));
  // An 8GB kit, below the figure: the build comes closest, never "suits", and the shortfall stays.
  const short = video("short", ["Memory 8GB", reviewedSpecs("RAM", { ram_capacity_gb: "8" })]);
  assertEquals(short.offerRole, "Value Choice");
  assert(
    short.purposeNotes.includes(
      "The lowest-priced of the builds here that come closest to what you asked for.",
    ),
  );
  assert(!short.purposeNotes.includes(VALUE_SUITS));
  assert(
    short.purposeNotes.some((n: string) => n.startsWith("Memory: 8GB, below")),
    short.purposeNotes.join(" | "),
  );
  // A kit whose size nobody states: can't be checked, never met.
  const unchecked = video("unchecked", ["Memory", {}]);
  assertEquals(unchecked.offerRole, "Value Choice");
  assert(
    unchecked.purposeNotes.includes(
      "The lowest-priced build here for what you asked for, though some of what you stated can't be checked on it.",
    ),
  );
  assert(!unchecked.purposeNotes.includes(VALUE_SUITS));
  assert(
    unchecked.purposeNotes.some((n: string) => n.includes("isn't confirmed")),
    unchecked.purposeNotes.join(" | "),
  );
  for (const b of [meets, short, unchecked]) assertOfferRules([b], 40000, false, b.name);
});

const NO_CARD_NOTICE = "No build without a graphics card falls within your range.";
const CONFIRMED_NOTICE =
  "No build within your range is confirmed: each needs IT HUB's review, or its power supply's wattage isn't confirmed.";
const TWIN_NOTICE =
  "A cheaper version of the confirmed build, which IT HUB would have to check, costs less than your range, so it isn't shown.";

Deno.test("S3P2 strict range: a no-card build below the range is left out, and the page says so", () => {
  let said = 0;
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const offer = offerIn(catalogueOf(make()));
    for (const s of GOLDEN_SEARCHES.filter((g) => g.purpose === "programming")) {
      const where = `${name} ${searchKey(s)}`;
      const result = offer(s.purpose, s.details, s.min, s.max);
      if (!result.notices.includes(NO_CARD_NOTICE)) continue;
      said++;
      // Nothing without a card is offered, and one would be if the range started lower.
      assert(
        result.builds.every((b: any) => b.parts.GPU),
        where,
      );
      assert(
        offer(s.purpose, s.details, 0, s.max).builds.some((b: any) => !b.parts.GPU),
        `${where}: a no-card build below the range`,
      );
    }
    // Never said for another use.
    for (const s of GOLDEN_SEARCHES.filter((g) => g.purpose !== "programming")) {
      assert(!offer(s.purpose, s.details, s.min, s.max).notices.includes(NO_CARD_NOTICE));
    }
  }
  assert(said > 0, "the notice is exercised");
});

Deno.test("S3P2 strict range: a confirmed build below the range is left out, and the page says so", () => {
  let said = 0;
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const offer = offerIn(catalogueOf(make()));
    for (const s of GOLDEN_SEARCHES) {
      const where = `${name} ${searchKey(s)}`;
      const result = offer(s.purpose, s.details, s.min, s.max);
      const confirmedShown = result.builds.some((b: any) =>
        ["Confirmed specifications", "No review needed"].includes(b.guarantee),
      );
      if (!result.notices.includes(CONFIRMED_NOTICE)) continue;
      said++;
      assert(!confirmedShown, where);
      assert(
        offer(s.purpose, s.details, 0, s.max).builds.some((b: any) => b.requiresReview === false),
        `${where}: a confirmed build below the range`,
      );
    }
  }
  // On the golden catalogues a search losing its confirmed build has nothing left in the range, so the
  // notice is checked on a catalogue where builds needing review remain.
  const items = chipCatalogue(
    ["QZX C Power Blank", {}],
    [["QZX C Card Unlisted", "GPU", 60000, {}]],
  );
  // From ₹90,000 only builds with the unlisted card remain, and none of them is confirmed.
  const narrow = offerIn(catalogueOf(items))("gaming", {}, 90000, 150000);
  assert(narrow.builds.length > 0, "unconfirmed builds remain in the range");
  assert(
    !narrow.builds.some((b: any) =>
      ["Confirmed specifications", "No review needed"].includes(b.guarantee),
    ),
  );
  assert(narrow.notices.includes(CONFIRMED_NOTICE), narrow.notices.join(" | "));
  // With the confirmed build in the range, nothing is said.
  const wide = offerIn(catalogueOf(items))("gaming", {}, 30000, 150000);
  assert(wide.builds.some((b: any) => b.requiresReview === false));
  assert(!wide.notices.includes(CONFIRMED_NOTICE));
  assert(said >= 0);
});

Deno.test("S3P2 strict range: a cheaper twin below the range is left out, and the page says so", () => {
  // The confirmed build costs ₹57,100 with the reviewed supply; its twin, with a supply whose wattage has no
  // source, costs less. A range starting between them keeps only the confirmed one.
  const items = chipCatalogue(["Deepcool PK650D 650W 80 Plus Bronze Power Supply", {}]);
  const offer = offerIn(catalogueOf(items));
  const wide = offer("gaming", {}, 30000, 150000).builds;
  const confirmed = wide.find((b: any) =>
    ["Confirmed specifications", "No review needed"].includes(b.guarantee),
  );
  const twin = wide.find((b: any) =>
    ["Some specifications unconfirmed", "Review required"].includes(b.guarantee),
  );
  assert(confirmed && twin, wide.map((b: any) => `${b.price} ${b.guarantee}`).join());
  const narrow = offer("gaming", {}, twin.price + 1, 150000);
  assert(!narrow.builds.some((b: any) => b.price < twin.price + 1));
  assert(narrow.builds.some((b: any) => b.templateId === confirmed.templateId));
  assert(narrow.notices.includes(TWIN_NOTICE), narrow.notices.join(" | "));
  // With the twin in the range, nothing is said.
  assert(!offer("gaming", {}, 30000, 150000).notices.includes(TWIN_NOTICE));
  // Nor when a still cheaper version is below the range but a twin within it is shown.
  const twoTwins = offerIn(
    catalogueOf(
      chipCatalogue(
        ["Deepcool PK650D 650W 80 Plus Bronze Power Supply", {}],
        [["QZX C Power Bare", "PSU", 1200, {}]],
      ),
    ),
  );
  const both = twoTwins("gaming", {}, 30000, 150000).builds;
  const cheapest = Math.min(...both.map((b: any) => b.price));
  const shownTwin = twoTwins("gaming", {}, cheapest + 1, 150000);
  if (
    shownTwin.builds.some((b: any) =>
      ["Some specifications unconfirmed", "Review required"].includes(b.guarantee),
    )
  ) {
    assert(!shownTwin.notices.includes(TWIN_NOTICE), shownTwin.notices.join(" | "));
  } else {
    throw new Error(both.map((b: any) => `${b.price} ${b.guarantee}`).join());
  }
});

Deno.test("S3P2 fewer than three: one product per slot gives one build, with no filler", () => {
  const search = searchIn(catalogueOf(GOLDEN_CATALOGUES.singlePerSlot()));
  for (const s of GOLDEN_SEARCHES) {
    const builds = search(s.purpose, s.details, s.min, s.max);
    assert(builds.length <= 1, searchKey(s));
  }
});

Deno.test("S3P2 owned parts: roles work with the customer's own card or processor", () => {
  const catalogue = catalogueOf(GOLDEN_CATALOGUES.evidenceRich());
  for (const owned of [["GPU"], ["CPU"], ["RAM", "Storage"]]) {
    const builds = searchIn(catalogue, owned)("gaming", { type: "AAA Games" }, 40000, 150000);
    assert(builds.length > 0, owned.join());
    assertOfferRules(builds, 40000, true, owned.join());
    // An owned card, memory or drive isn't in the build. An owned processor stays in it as the reference for
    // compatibility, at no charge, as it did before Stage 3.
    for (const b of builds) {
      for (const slot of owned.filter((s) => s !== "CPU")) {
        assert(!b.parts[slot], `${slot} is the customer's`);
      }
      assertEquals(b.owned, owned);
    }
  }
});

Deno.test("S3P2 no-card build: software development still offers a build without a card", () => {
  let found = 0;
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const search = searchIn(catalogueOf(make()));
    for (const s of GOLDEN_SEARCHES.filter((g) => g.purpose === "programming")) {
      for (const b of search(s.purpose, s.details, s.min, s.max).filter((x) => !x.parts.GPU)) {
        found++;
        // Its chip is the Stage 2 reason, or a role it also holds; never a claim about a card.
        assert(
          ["No graphics card", ...ROLES, ...LABELS].includes(b.tradeoff),
          `${name}: ${b.tradeoff}`,
        );
      }
    }
  }
  assert(found > 0, "a build without a graphics card is offered somewhere");
});

// ── D. Chips that stay true ──────────────────────────────────────────────────

/** The pair catalogue's parts, with a chosen power supply for the twin and anything else added. */
function chipCatalogue(
  twinPower: [string, Record<string, string>],
  extra: [string, any, number, any][] = [],
) {
  const p = testListingMaker(`chip${twinPower[0].length}${extra.length}`);
  return [
    p("QZX C CPU Entry", "CPU", 9500, reviewedSpecs("CPU")),
    p("QZX C CPU High", "CPU", 27500, reviewedSpecs("CPU")),
    p("QZX C Board", "Motherboard", 7200, reviewedSpecs("Motherboard")),
    p("QZX C Memory 16GB", "RAM", 3300, reviewedSpecs("RAM")),
    p("QZX C Card A", "GPU", 24500, reviewedSpecs("GPU")),
    p("QZX C Card B", "GPU", 38500, reviewedSpecs("GPU")),
    p("QZX C Drive", "Storage", 4600, reviewedSpecs("Storage")),
    p("QZX C Power Reviewed", "PSU", 4800, reviewedSpecs("PSU")),
    p(twinPower[0], "PSU", 3000, twinPower[1]),
    p("QZX C Case", "Cabinet", 3200, reviewedSpecs("Cabinet")),
    ...extra.map(([name, slot, price, specs]) => p(name, slot, price, specs)),
  ];
}

Deno.test("S3P2 D3: a twin that needs no review never says review is required", () => {
  // A power supply on the specification list whose wattage has no recorded source: stated, not reviewed.
  // A cheaper card takes Value Choice, so the twin shows its Stage 2 chip.
  const items = chipCatalogue(
    ["Deepcool PK650D 650W 80 Plus Bronze Power Supply", {}],
    [["QZX C Card Cheap", "GPU", 9000, {}]],
  );
  // The cheaper card's build costs less than ₹40,000, so the range starts at ₹30,000 to keep it in.
  const builds = searchIn(catalogueOf(items))("gaming", {}, 30000, 150000);
  const twin = builds.find((b) => b.guarantee === "Some specifications unconfirmed");
  assert(twin, builds.map((b) => b.tradeoff).join());
  assertEquals(twin.requiresReview, false);
  assertEquals(twin.tradeoff, "Some specifications unconfirmed");
  assertOfferRules(builds, 30000, false, "listed twin");
});

Deno.test("S3P2 D3: a confirmed build without every specification confirmed says only that it needs no review", () => {
  // A case on the specification list with no source: nothing needs review, but not every value is confirmed.
  const items = chipCatalogue(
    ["QZX C Power Blank", {}],
    [["Ant Esports ICE-100 Air Mini Mesh Micro-ATX Case", "Cabinet", 1000, {}]],
  );
  const builds = searchIn(catalogueOf(items))("gaming", {}, 40000, 150000);
  const confirmed = builds.find((b) => b.guarantee === "No review needed");
  assert(confirmed, builds.map((b) => b.tradeoff).join());
  assertEquals(confirmed.requiresReview, false);
  assert(confirmed.confidenceBadge !== "certified");
  assertEquals(confirmed.tradeoff, "No review needed");
  assertOfferRules(builds, 40000, false, "listed case");
});

Deno.test("S3P2 D1: an evidence label stays the chip, and a role it also holds is only explained", () => {
  // Parts from IT HUB's specification list with sourced published figures, at made-up test prices.
  const p = testListingMaker("labelled");
  const reviewedCard = {
    gpu_length_mm: "222",
    pcie_connectors: "1x 8-pin",
    spec_source: "manufacturer_datasheet",
    spec_review_status: "reviewed",
    spec_source_url: "https://www.example.org/made-up-datasheet",
    spec_reviewed_on: "2026-11-01",
  };
  const items = [
    p("AMD Ryzen 5 5600", "CPU", 9000, {}),
    p("ASUS Prime B550M-A WiFi II Motherboard", "Motherboard", 9000, {}),
    p("Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz", "RAM", 3000, {}),
    p("Crucial P3 Plus 1TB PCIe M.2 2280 NVMe SSD", "Storage", 5000, {}),
    p("Corsair RM750e 750W 80 Plus Gold Fully Modular PSU", "PSU", 4500, {}),
    p("Deepcool CC560 V2 High-Airflow Mid-Tower ATX Case", "Cabinet", 3900, {}),
    p("ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", "GPU", 28000, reviewedCard),
    p("Gigabyte GeForce RTX 4070 Super Windforce 12GB", "GPU", 58000, {}),
  ];
  const builds = searchIn(catalogueOf(items))("gaming", { type: "AAA Games" }, 30000, 300000);
  const labelled = builds.find((b) => b.tradeoffLabel === "Best Value");
  assert(labelled, builds.map((b) => b.tradeoffLabel).join());
  assertEquals(labelled.offerRole, "Value Choice");
  assertEquals(labelled.tradeoff, "Best Value");
  assert(
    labelled.purposeNotes.includes("The lowest-priced build here that suits what you asked for."),
  );
  assertOfferRules(builds, 30000, true, "labelled");
});

// ── Determinism ──────────────────────────────────────────────────────────────

const randomFrom = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const shuffled = <T>(items: T[], seed: number) => {
  const random = randomFrom(seed);
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const tenOrders = <T>(items: T[]) => [
  items,
  items.slice().reverse(),
  ...[11, 22, 33, 44, 55, 66, 77, 88].map((seed) => shuffled(items, seed)),
];
const seenAs = (builds: any[]) =>
  builds.map(
    (b) =>
      `${b.templateId}|${b.price}|${b.tradeoff}|${b.offerRole ?? "-"}|${b.purposeNotes.join("/")}`,
  );

for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
  Deno.test(`S3P2 determinism ${name}: ten catalogue orders give the same builds, roles, chips and order`, () => {
    const searches =
      name === "large" ? GOLDEN_SEARCHES.filter((_, i) => i % 8 === 0) : GOLDEN_SEARCHES;
    const reference = searches.map((s) =>
      seenAs(searchIn(catalogueOf(make()))(s.purpose, s.details, s.min, s.max)),
    );
    for (const order of tenOrders(make()).slice(1)) {
      const search = searchIn(catalogueOf(order));
      searches.forEach((s, i) =>
        assertEquals(
          seenAs(search(s.purpose, s.details, s.min, s.max)),
          reference[i],
          `${name} ${searchKey(s)}`,
        ),
      );
    }
  });
}

// ── The baselines (ruling P2-6). The Phase 1 and first Phase 2 files are never rewritten ─────────

for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
  Deno.test(`S3P2 baseline ${name}: the builds, prices, chips and roles recorded after Phase 3`, () => {
    const search = searchIn(catalogueOf(make()));
    const recorded = PHASE3.catalogues[name];
    assertEquals(make().length, recorded.listings);
    for (const s of GOLDEN_SEARCHES) {
      assertEquals(
        roleOfferSet(search(s.purpose, s.details, s.min, s.max)),
        recorded.offers[searchKey(s)],
        `${name} ${searchKey(s)}`,
      );
    }
  });

  Deno.test(`S3P2 baseline ${name}: the measurements match the Phase 3 record`, () => {
    const { milliseconds: _time, ...metrics } = measureOffers(searchIn(catalogueOf(make())));
    assertEquals(metrics, PHASE3.catalogues[name].metrics);
  });
}

Deno.test("S3P2 baseline: Phase 2 is recorded separately, and the Phase 1 record is kept", async () => {
  const phase1 = JSON.parse(await Deno.readTextFile(PHASE1_FILE));
  assertEquals(phase1.recordedFrom, "dd475a6, before Stage 3 Phase 1");
  assert(PHASE2.recordedFrom.includes("Phase 2"));
  assertEquals(Object.keys(phase1.catalogues), Object.keys(PHASE2.catalogues));
  assert(STRICT.recordedFrom.includes("strict budget range"));
  assertEquals(Object.keys(phase1.catalogues), Object.keys(STRICT.catalogues));
  // Phase 2 never raised how often a build below the range is shown, and removed every repeated pair. Under
  // the strict range no build below the range is shown at all.
  for (const name of Object.keys(phase1.catalogues)) {
    const [before, after] = [phase1.catalogues[name].metrics, PHASE2.catalogues[name].metrics];
    assert(after.belowBandShare <= before.belowBandShare, name);
    assertEquals(after.repeatedPairs, 0, name);
    assertEquals(after.labelled, before.labelled, `${name}: labels are unchanged`);
    const strict = STRICT.catalogues[name].metrics;
    assertEquals(strict.belowBand, 0, name);
    assertEquals(strict.repeatedPairs, 0, name);
    assertEquals(strict.labelled, before.labelled, `${name}: labels are unchanged`);
    // Phase 3 finds what the strict range had left out: never fewer builds, never more empty searches,
    // and still none outside the range and no repeated pair.
    const phase3 = PHASE3.catalogues[name].metrics;
    assert(phase3.shown >= strict.shown, name);
    assert(phase3.empty <= strict.empty, name);
    assertEquals(phase3.belowBand, 0, name);
    assertEquals(phase3.repeatedPairs, 0, name);
    assertEquals(phase3.labelled, before.labelled, `${name}: labels are unchanged`);
  }
  assert(PHASE3.recordedFrom.includes("Stage 3 Phase 3"));
  assertEquals(Object.keys(phase1.catalogues), Object.keys(PHASE3.catalogues));
});

// ── F1. No guideline is used ─────────────────────────────────────────────────

Deno.test("S3P2 F1: no guideline module, and the roles read the purpose's priority part only", async () => {
  const root = new URL("../../../src/lib/builder/", import.meta.url);
  let exists = true;
  try {
    await Deno.stat(new URL("guidelines.ts", root));
  } catch {
    exists = false;
  }
  assertEquals(exists, false);
  const engine = await Deno.readTextFile(new URL("recommendations.ts", root));
  assert(!/guideline/i.test(engine.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
});
