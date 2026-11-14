// IT HUB guidelines G1 to G7 (approved by the owner on 14 November 2026 as advice only). The rows and their values,
// which apply to which purpose, the advice wording, stated versus unstated sizes, and that advice never changes a
// build or its evidence. Synthetic parts; no network.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GOLDEN_CATALOGUES } from "./_helpers/stage3-golden.ts";

const G = await import("../../../src/lib/builder/guidelines.ts");
const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");

const ram = (gb?: number, source = "it_hub_reviewed") => ({
  specs: { capacityGb: gb, fieldSources: gb === undefined ? {} : { capacityGb: source } },
});
const drive = ram;

Deno.test("GL-1: the seven approved rows, with the owner's values", () => {
  const rows = Object.fromEntries(G.IT_HUB_GUIDELINES.map((g: any) => [g.id, g]));
  assertEquals(Object.keys(rows).sort(), ["G1", "G2", "G3", "G4", "G5", "G6", "G7"]);
  assertEquals(
    ["G1", "G2", "G3", "G4", "G5", "G6", "G7"].map((id) => [rows[id].kind, rows[id].value]),
    [
      ["minimumMemoryGb", 8],
      ["minimumMemoryGb", 16],
      ["minimumMemoryGb", 32],
      ["minimumStorageGb", 500],
      ["minimumStorageGb", 1000],
      ["minimumStorageGb", 1000],
      ["priorityPart", "none"],
    ],
  );
  for (const g of G.IT_HUB_GUIDELINES) {
    assertEquals(g.status, "approved", g.id);
    assertEquals(g.approvedOn, "2026-11-14", g.id);
    assert(g.rationale && g.intendedWorkload, g.id);
  }
});

Deno.test("GL-2: which rows apply to each purpose and gaming resolution", () => {
  const ids = (purpose?: string, details: Record<string, string> = {}) =>
    G.applicableGuidelines(purpose, details).map((g: any) => g.id);
  assertEquals(ids("gaming"), ["G2", "G5"]);
  assertEquals(ids("gaming", { resolution: "Not sure" }), ["G2", "G5"]);
  assertEquals(ids("gaming", { resolution: "1080p" }), ["G2", "G5"]);
  assertEquals(ids("gaming", { resolution: "1440p" }), ["G3", "G5"]);
  assertEquals(ids("gaming", { resolution: "4K" }), ["G3", "G5"]);
  for (const p of ["office", "work"]) assertEquals(ids(p), ["G1", "G4"], p);
  assertEquals(ids("general"), ["G1", "G4", "G7"]);
  assertEquals(ids("creation"), ["G6"]);
  for (const p of ["programming", "professional", "custom", undefined])
    assertEquals(ids(p), [], String(p));
});

Deno.test("GL-3: advice says whether the build meets it, and never guesses a size", () => {
  const advice = (parts: any, purpose = "gaming") => G.guidelineAdvice(purpose, {}, parts);
  const meets = advice({ RAM: ram(16), Storage: drive(1000) });
  assertEquals(
    meets.map((a: any) => [a.guidelineId, a.standing]),
    [
      ["G2", "meets"],
      ["G5", "meets"],
    ],
  );
  assertEquals(
    meets[0].text,
    "IT HUB recommends at least 16 GB of memory for gaming at 1080p. This build has 16 GB.",
  );
  assertEquals(
    meets[1].text,
    "IT HUB recommends at least 1 TB of storage for gaming. This build has 1 TB.",
  );
  const below = advice({ RAM: ram(8), Storage: drive(500) });
  assertEquals(
    below.map((a: any) => a.standing),
    ["below", "below"],
  );
  assertEquals(
    below[1].text,
    "IT HUB recommends at least 1 TB of storage for gaming. This build has 500 GB.",
  );
  // Unstated, or only read from a title: IT HUB will confirm it.
  for (const unknown of [
    ram(undefined),
    ram(16, "title_inferred"),
    ram(16, "title_derived"),
    { specs: null },
  ]) {
    const [a] = advice({ RAM: unknown });
    assertEquals(a.standing, "not_stated");
    assertEquals(
      a.text,
      "IT HUB recommends at least 16 GB of memory for gaming at 1080p. This build's memory size isn't stated, so IT HUB will confirm it.",
    );
  }
  // A part the customer owns (not in the build) gets no advice; G7 (no priority part) never shows advice.
  assertEquals(
    advice({ Storage: drive(1000) }).map((a: any) => a.guidelineId),
    ["G5"],
  );
  assertEquals(
    advice({ RAM: ram(16), Storage: drive(1000) }, "general").map((a: any) => a.guidelineId),
    ["G1", "G4"],
  );
  assertEquals(advice({ RAM: ram(16) }, "programming"), []);
});

Deno.test("GL-4: advisory wording: 'IT HUB recommends', never 'requires', no outside names", () => {
  const texts = ["gaming", "office", "work", "general", "creation"].flatMap((purpose) =>
    [
      { RAM: ram(4), Storage: drive(250) },
      { RAM: ram(64), Storage: drive(4000) },
      { RAM: ram(undefined), Storage: drive(undefined) },
    ].flatMap((parts) => G.guidelineAdvice(purpose, {}, parts).map((a: any) => a.text)),
  );
  assert(texts.length > 20);
  for (const text of texts) {
    assert(text.startsWith("IT HUB recommends at least "), text);
    assert(
      !/requir|must|incompatible|compatible|confirmed|Adobe|Blender|Autodesk|Microsoft|AMD|Intel|NVIDIA/i.test(
        text,
      ),
      text,
    );
  }
});

Deno.test("GL-5: advice never changes a build, a part or its evidence, and the offers are unchanged", () => {
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const catalogue = syncBuilderCatalogWithShopify(make() as any).componentCatalog;
    for (const purpose of ["gaming", "office", "creation"]) {
      const builds = generateDynamicCatalogRecommendations(
        catalogue,
        { purpose, details: {}, brands: [] },
        { min: 30000, max: 150000 },
        { allowUnverified: true },
      ) as any[];
      for (const build of builds) {
        const before = JSON.stringify(build);
        G.guidelineAdvice(purpose, {}, build.parts);
        assertEquals(JSON.stringify(build), before, `${name} ${purpose}`);
      }
    }
  }
});

Deno.test("GL-6: the page shows the advice beside each build's evidence, worded by the module", async () => {
  const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
  assert(page.includes('import { guidelineAdvice } from "../lib/builder/guidelines"'));
  assert(page.includes('data-testid="guideline-advice"'));
  assert(page.includes("IT HUB's recommendations"));
  // The page never writes its own guideline wording.
  assert(!/IT HUB recommends at least/.test(page));
});

Deno.test("GL-7: only approved rows are ever used; a draft or retired row gives no advice", () => {
  const extra = (status: string, value: number) => ({
    ...G.IT_HUB_GUIDELINES.find((g: any) => g.id === "G2"),
    id: `X-${status}`,
    status,
    value,
  });
  const rows = [extra("draft", 64), extra("retired", 48)] as any[];
  assertEquals(G.applicableGuidelines("gaming", {}, rows), []);
  assertEquals(G.guidelineAdvice("gaming", {}, { RAM: ram(16) }, rows), []);
  // With an approved row beside them, only the approved one applies.
  const withApproved = [...rows, G.IT_HUB_GUIDELINES.find((g: any) => g.id === "G2")];
  assertEquals(
    G.guidelineAdvice("gaming", {}, { RAM: ram(16) }, withApproved as any).map(
      (a: any) => a.guidelineId,
    ),
    ["G2"],
  );
});
