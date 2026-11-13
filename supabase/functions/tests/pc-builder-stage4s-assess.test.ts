// Stage 4S-3: server-authoritative compatibility and completeness. The quotation server runs the builder's
// unchanged engine and completeness assessment on the parts it resolved itself from Shopify (Stage 4S-2), and
// decides: Incompatible or Incomplete is refused (422, nothing stored), Needs Review is stored for a technician,
// Complete is stored without review unless something else requires it. Nothing the browser sends about
// compatibility, completeness or specifications changes the outcome.
//
// TEST CATALOGUE ONLY: every product, ID, price and value below is made up for these tests, or taken from the code
// specification registry. None of it is IT HUB stock or a selling price. No network.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SLOT_CATEGORY,
  specMetafields,
  storefrontProduct,
  verifiedValues,
} from "./_helpers/quote-structure.ts";
import { quotationClient } from "./_helpers/quotation-client.ts";

const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");
const { MESSAGE_UNREADABLE, messageMissingParts } =
  await import("../verify-and-submit-pc-quotation/structure.ts");
const { assessQuotation } = await import("../verify-and-submit-pc-quotation/assess.ts");
const { INCOMPATIBLE_MESSAGE } = await import("../../../src/lib/builder/completeness-wording.ts");
const { mapShopifyProductToCatalog } = await import("../../../src/lib/shopify-schema.ts");
const { matchShopifyProductToComponent } = await import("../../../src/lib/builder/catalog.ts");
const { checkCompatibility } = await import("../../../src/lib/builder/compatibility.ts");
const { assessBuild } = await import("../../../src/lib/builder/completeness.ts");

const SLOTS = ["CPU", "Motherboard", "RAM", "GPU", "Storage", "PSU", "Cabinet", "Cooler"];
const V = (slot: string) => `gid://shopify/ProductVariant/s4s3-${slot.toLowerCase()}`;
const PRICE: Record<string, number> = {
  CPU: 15000,
  Motherboard: 9000,
  RAM: 3000,
  GPU: 28000,
  Storage: 4000,
  PSU: 3500,
  Cabinet: 2500,
  Cooler: 1500,
};
const ESSENTIALS = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"];

/** A made-up listing for a slot: fully reviewed values (the AM4 test platform), changed as a case needs. */
const listing = (slot: string, values: Record<string, string> | null = {}, title?: string) => ({
  ...storefrontProduct(slot, title ?? `QZX S4S3 ${slot}`),
  id: `gid://shopify/Product/s4s3-${slot.toLowerCase()}`,
  metafields: values === null ? specMetafields() : specMetafields(verifiedValues(slot, values)),
});

type Catalogue = Record<string, any>;

/** Shopify's product for each slot in a build: the essentials, plus any extra slots, with changes. */
function catalogue(changes: Catalogue = {}, extra: string[] = []): Catalogue {
  const products: Catalogue = {};
  for (const slot of [...ESSENTIALS, ...extra]) products[slot] = changes[slot] ?? listing(slot);
  return products;
}

/** The request the page sends for these products: each part with a quantity, and the browser's claims. */
function partsFor(products: Catalogue, browserSpecs: Record<string, unknown> = {}) {
  const parts: Record<string, any> = {};
  for (const slot of Object.keys(products)) {
    parts[slot] = {
      slot,
      variantId: V(slot),
      title: products[slot].title,
      price: PRICE[slot],
      quantity: 1,
      ...(browserSpecs[slot] ? { specs: browserSpecs[slot] } : {}),
    };
  }
  return parts;
}

const totalOf = (products: Catalogue) =>
  Object.keys(products).reduce((sum, slot) => sum + PRICE[slot], 0);

interface Send {
  browserSpecs?: Record<string, unknown>;
  compatibility?: unknown;
  /** Replaces Shopify's whole reply. */
  reply?: (ids: string[]) => any;
  /** Parts the customer owns, sent as the page sends them. */
  owned?: string[];
  /** Sends a part in another slot than its listing's. */
  sendAs?: Record<string, string>;
  /** Further request fields, such as a purpose (decision S3-B). */
  extra?: Record<string, unknown>;
  customerInfo?: Record<string, unknown>;
}

async function send(products: Catalogue, options: Send = {}) {
  // Stage 4S-4: the database is reached only through its two quotation functions. A refusal must come before
  // the quotation is stored, which is also where repeats are now found.
  const db = quotationClient({ userId: "00000000-0000-0000-0000-0000000004s3" });
  const calls = {
    inserted: db.inserted,
    get repeatLookups() {
      return db.calls.create.length;
    },
    shopify: 0,
    logs: [] as string[],
  };
  const client = db.client;
  const bySlotOfVariant = Object.fromEntries(Object.keys(products).map((slot) => [V(slot), slot]));
  const shopifyFetch = async (_query: string, vars: { ids: string[] }) => {
    calls.shopify++;
    if (options.reply) return options.reply(vars.ids);
    return {
      data: {
        nodes: vars.ids.map((id) => {
          const slot = bySlotOfVariant[id];
          return {
            id,
            title: "Default Title",
            price: { amount: `${PRICE[slot]}.00`, currencyCode: "INR" },
            availableForSale: true,
            currentlyNotInStock: false,
            product: products[slot],
          };
        }),
      },
    };
  };
  const parts = partsFor(products, options.browserSpecs);
  for (const [slot, as] of Object.entries(options.sendAs || {})) {
    parts[as] = { ...parts[slot], slot: as };
    delete parts[slot];
  }
  for (const slot of options.owned || []) parts[slot] = { slot, owned: true };
  const ownedPrice = (options.owned || []).reduce((sum, slot) => sum + (PRICE[slot] || 0), 0);
  // The function's diagnostic log lines (decision S3-A), captured instead of printed.
  const warn = console.warn;
  console.warn = (...args: unknown[]) => calls.logs.push(args.map(String).join(" "));
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer s4s3-token" },
      body: JSON.stringify({
        buildName: "S4S-3",
        estimatedPrice: totalOf(products) - ownedPrice,
        compatibility:
          "compatibility" in options ? options.compatibility : { status: "compatible" },
        customerInfo: options.customerInfo ?? {},
        parts,
        ...options.extra,
      }),
    }),
    { supabaseClient: client as any, shopifyFetch },
  ).finally(() => {
    console.warn = warn;
  });
  return { status: res.status, body: await res.json(), calls };
}

/**
 * What the builder page concludes about the same Shopify listings: the storefront's own path, with the use the build
 * was found for, or purpose-neutral (Expert Mode).
 */
function pageVerdict(products: Catalogue, owned: string[] = [], purpose?: string) {
  const components: Record<string, any> = {};
  for (const [slot, product] of Object.entries(products)) {
    const node = {
      ...product,
      handle: "test",
      description: "",
      vendor: "",
      availableForSale: true,
      images: { edges: [] },
      variants: {
        edges: [
          {
            node: {
              id: V(slot),
              title: "Default Title",
              availableForSale: true,
              price: { amount: `${PRICE[slot]}.00`, currencyCode: "INR" },
            },
          },
        ],
      },
    };
    components[slot] = matchShopifyProductToComponent(
      mapShopifyProductToCatalog(node as any),
      slot as any,
    );
  }
  const summary = checkCompatibility(components, { ownedSlots: owned });
  return assessBuild(components as any, summary, {
    ownedSlots: owned,
    ...(purpose ? { purpose } : {}),
  });
}

const assessmentOf = (result: Awaited<ReturnType<typeof send>>) =>
  result.calls.inserted[0]?.server_assessment;

/** A refusal: 422 with the code, nothing stored, and the repeat lookup never reached. */
function assertRefused(
  result: Awaited<ReturnType<typeof send>>,
  code: "incompatible_build" | "incomplete_build",
  label: string,
) {
  assertEquals(result.status, 422, `${label}: ${JSON.stringify(result.body)}`);
  assertEquals(result.body.success, false, label);
  assertEquals(result.body.code, code, label);
  assertEquals(result.calls.inserted.length, 0, `${label}: something was stored`);
  assertEquals(result.calls.repeatLookups, 0, `${label}: refused after the repeat lookup`);
}

const mismatchIds = (result: Awaited<ReturnType<typeof send>>) =>
  (result.body.mismatches || []).map((m: any) => m.ruleId);

/** Every claim a browser could make that a build is fine. */
const FORGED_CLAIMS = {
  status: "compatible",
  valid: true,
  complete: true,
  isComplete: true,
  isCompatible: true,
  quotationReady: true,
  state: "complete",
  validForAutomatedRecommendation: true,
  hasBlockingUnknowns: false,
  items: [],
  score: 100,
};

// ── 15. Valid, fully verified builds ─────────────────────────────────────────────────────────────────

Deno.test("S4S3-1: a fully verified, compatible build is Complete on the server's word, and needs no review", async () => {
  for (const [label, products] of [
    ["the six essentials", catalogue()],
    ["with a graphics card and a cooler", catalogue({}, ["GPU", "Cooler"])],
  ] as [string, Catalogue][]) {
    const result = await send(products);
    assertEquals(result.status, 200, `${label}: ${JSON.stringify(result.body)}`);
    assertEquals(result.body.technicianReviewRequired, false, label);
    assertEquals(result.body.authoritativePrice, totalOf(products), label);
    const verdict = assessmentOf(result);
    assertEquals(verdict.assessedBy, "server", label);
    assertEquals(verdict.state, "complete", label);
    assertEquals(verdict.compatibilityStatus, "compatible", label);
    assertEquals(verdict.mismatches, [], label);
    assertEquals(verdict.gaps, [], label);
    assertEquals(verdict.reviewReasons, [], label);
    assertEquals(verdict.agreesWithBrowser, true, label);
    // The page says the same about the same listings.
    assertEquals(pageVerdict(products).state, "complete", label);
    for (const part of Object.values(result.calls.inserted[0].parts) as any[]) {
      assertEquals(part.serverSpecs.status, "verified", `${label} ${part.slot}`);
    }
  }
});

// ── 1 to 6. Forged compatibility and specifications ──────────────────────────────────────────────────

Deno.test("S4S3-2: a build the browser calls compatible, but whose parts clash, is refused", async () => {
  const cases: [string, Catalogue, Record<string, unknown>, string][] = [
    // 1, 2: the processor is AM5, the board AM4; the browser claims compatible and says the processor is AM4.
    [
      "processor socket",
      catalogue({ CPU: listing("CPU", { socket: "AM5" }) }),
      { CPU: { socket: "AM4" } },
      "RULE_A_SOCKET_MISMATCH",
    ],
    // 3: the board is AM5, the processor AM4; the browser says the board is AM4.
    [
      "motherboard socket",
      catalogue({ Motherboard: listing("Motherboard", { socket: "AM5" }) }),
      { Motherboard: { socket: "AM4" } },
      "RULE_A_SOCKET_MISMATCH",
    ],
    // 4: DDR5 memory on a DDR4 board; the browser says DDR4.
    [
      "memory generation",
      catalogue({ RAM: listing("RAM", { ram_generation: "DDR5" }) }),
      { RAM: { ramGeneration: "DDR4", supportedRamGeneration: "DDR4" } },
      "RULE_B_RAM_MISMATCH",
    ],
    // 5: a 340 mm card in a cabinet with 320 mm clearance; the browser shrinks the card and grows the cabinet.
    [
      "graphics card clearance",
      catalogue({ GPU: listing("GPU", { gpu_length_mm: "340" }) }, ["GPU"]),
      { GPU: { lengthMm: 200 }, Cabinet: { maxGpuLengthMm: 400 } },
      "RULE_D_GPU_LENGTH_EXCEEDED",
    ],
    // 6: a 250 W supply under a 286 W load; the browser says 1000 W.
    [
      "power supply wattage",
      catalogue({ PSU: listing("PSU", { capacity_watts: "250" }) }, ["GPU"]),
      { PSU: { ratedWattage: 1000 } },
      "RULE_E_PSU_WATTAGE_DEFICIT",
    ],
  ];
  for (const [label, products, browserSpecs, ruleId] of cases) {
    const result = await send(products, { browserSpecs, compatibility: FORGED_CLAIMS });
    assertRefused(result, "incompatible_build", label);
    // The builder's own approved wording for an incompatible build (W14, W15).
    assertEquals(result.body.error, INCOMPATIBLE_MESSAGE, label);
    assert(mismatchIds(result).includes(ruleId), `${label}: ${mismatchIds(result)}`);
    // The page would have said the same, so an honest customer never gets here.
    assertEquals(pageVerdict(products).state, "incompatible", label);
  }
});

Deno.test("S4S3-3: the browser's specifications can't make a clashing build pass, or a fitting build fail", async () => {
  // Forged values that would hide the clash, sent for every part.
  const clash = catalogue({ CPU: listing("CPU", { socket: "AM5" }) });
  const lies = Object.fromEntries(
    ESSENTIALS.map((slot) => [slot, { socket: "AM4", provenance: "manufacturer_verified" }]),
  );
  assertRefused(await send(clash, { browserSpecs: lies }), "incompatible_build", "hidden clash");
  // Forged values that would invent a clash, on a build that fits.
  const fits = catalogue();
  const invented = {
    CPU: { socket: "AM5" },
    RAM: { ramGeneration: "DDR5" },
    PSU: { ratedWattage: 100 },
  };
  const result = await send(fits, {
    browserSpecs: invented,
    compatibility: { status: "incompatible" },
  });
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, false);
  assertEquals(assessmentOf(result).state, "complete");
  // The browser's claim is recorded beside the verdict, as a note.
  assertEquals(assessmentOf(result).browserStatus, "incompatible");
  assertEquals(assessmentOf(result).agreesWithBrowser, false);
  assertEquals(result.calls.inserted[0].compatibility.status, "incompatible");
});

// ── 7, 14. Completeness ──────────────────────────────────────────────────────────────────────────────

Deno.test("S4S3-4: fabricated completeness flags can't pass a build missing a part it needs", async () => {
  const cases: [string, Catalogue, string[], string][] = [
    [
      "a processor with no graphics, and no card",
      catalogue({ CPU: listing("CPU", { integrated_graphics: "false" }) }),
      ["GPU"],
      "Still to choose: GPU.",
    ],
    [
      "a processor with no cooler in the box, and no cooler",
      catalogue({ CPU: listing("CPU", { includes_cooler: "false" }) }),
      ["Cooler"],
      "Still to choose: Cooler.",
    ],
  ];
  for (const [label, products, missing, wording] of cases) {
    const result = await send(products, { compatibility: FORGED_CLAIMS });
    assertRefused(result, "incomplete_build", label);
    assertEquals(result.body.missingSlots, missing, label);
    // The builder's own pop-up for the same build (W18).
    assertEquals(result.body.error, wording, label);
    assertEquals(pageVerdict(products).state, "incomplete", label);
  }
  // Adding the part makes the same build Complete.
  const withCard = catalogue({ CPU: listing("CPU", { integrated_graphics: "false" }) }, ["GPU"]);
  assertEquals(assessmentOf(await send(withCard)).state, "complete");
});

Deno.test("S4S3-5: a missing essential is refused before Shopify; a part nobody can rule out goes to review", async () => {
  // An essential part missing altogether: the structural check (Stage 4A-6), unchanged.
  const products = catalogue();
  delete products.PSU;
  const missing = await send(products, { compatibility: FORGED_CLAIMS });
  assertEquals(missing.status, 422);
  assertEquals(missing.body.code, "incomplete_build");
  assertEquals(missing.body.error, messageMissingParts(["PSU"]));
  assertEquals(missing.calls.inserted.length, 0);
  // Nobody states whether the processor has graphics: a card may not be needed, so IT HUB confirms (4A D4).
  const unknown = { ...verifiedValues("CPU") } as Record<string, string>;
  delete unknown.integrated_graphics;
  const cpu = { ...listing("CPU"), metafields: specMetafields(unknown) };
  const result = await send(catalogue({ CPU: cpu }));
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  assertEquals(assessmentOf(result).state, "needs_review");
  assertEquals(assessmentOf(result).gaps, [
    { slot: "GPU", need: "unconfirmed", reason: "gpu_integrated_graphics_unknown" },
  ]);
});

// ── 8, 9. Forged specification standing ──────────────────────────────────────────────────────────────

Deno.test("S4S3-6: values the browser calls verified, but Shopify doesn't state, leave the build for review", async () => {
  const products = catalogue({ RAM: listing("RAM", null, "QZX S4S3 Memory") });
  const result = await send(products, {
    browserSpecs: {
      RAM: {
        ramGeneration: "DDR4",
        capacityGb: 16,
        provenance: "manufacturer_verified",
        fieldSources: { ramGeneration: "manufacturer_verified" },
        isVerified: true,
      },
    },
    compatibility: FORGED_CLAIMS,
  });
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  const verdict = assessmentOf(result);
  assertEquals(verdict.state, "needs_review");
  assert(verdict.reviewChecks.some((check: any) => check.slots.includes("RAM")));
  const ram = result.calls.inserted[0].parts.RAM.serverSpecs;
  assertEquals(ram.fields.find((f: any) => f.field === "ramGeneration").status, "missing");
  assertEquals(pageVerdict(products).state, "needs_review");
});

Deno.test("S4S3-7: values Shopify states but nobody reviewed stay unreviewed, whatever standing the browser claims", async () => {
  const unreviewed = { ...listing("RAM"), metafields: specMetafields({ ram_generation: "DDR4" }) };
  const products = catalogue({ RAM: unreviewed });
  const result = await send(products, {
    browserSpecs: {
      RAM: {
        ramGeneration: "DDR4",
        provenance: "it_hub_reviewed",
        fieldSources: { ramGeneration: "manufacturer_verified" },
      },
    },
    compatibility: FORGED_CLAIMS,
  });
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  const verdict = assessmentOf(result);
  assertEquals(verdict.state, "needs_review");
  assert(verdict.reviewChecks.some((check: any) => check.ruleId === "RULE_L_SPEC_UNREVIEWED"));
  const field = result.calls.inserted[0].parts.RAM.serverSpecs.fields.find(
    (f: any) => f.field === "ramGeneration",
  );
  assertEquals([field.status, field.confidence], ["uncertain", "supplier_provided"]);
});

Deno.test("S4S3-8: a browser can't supply the server's verdict", async () => {
  const products = catalogue({ RAM: listing("RAM", null, "QZX S4S3 Memory") });
  const forgedVerdict = {
    status: "compatible",
    serverAssessment: { assessedBy: "server", stage: "4S-3", state: "complete", reviewReasons: [] },
  };
  const result = await send(products, { compatibility: forgedVerdict });
  assertEquals(result.body.technicianReviewRequired, true);
  // Stage 4S-4: the verdict has its own column (D1); a verdict the browser claims is dropped from its note.
  const row = result.calls.inserted[0];
  assertEquals(row.server_assessment.state, "needs_review");
  assert(row.server_assessment.reviewChecks.length > 0);
  assertEquals("serverAssessment" in row.compatibility, false);
  assertEquals(row.compatibility.status, "compatible");
  assertEquals(row.compatibility.reportedBy, "customer_browser");
});

// ── 10. Wrong slot ───────────────────────────────────────────────────────────────────────────────────

Deno.test("S4S3-9: a part Shopify files under another slot is still refused as unreadable, before any verdict", async () => {
  // A graphics card sent as the memory, with a forged verdict.
  const products = catalogue({}, ["GPU"]);
  delete products.RAM;
  const result = await send(products, { sendAs: { GPU: "RAM" }, compatibility: FORGED_CLAIMS });
  assertEquals(result.status, 400);
  assertEquals(result.body.error, MESSAGE_UNREADABLE);
  assertEquals(result.body.problems, [{ code: "variant_wrong_slot", slot: "RAM" }]);
  assertEquals(result.calls.inserted.length, 0);
});

// ── 11, 12, 13. Untrustworthy answers and conflicting values ─────────────────────────────────────────

Deno.test("S4S3-10: with a part's specifications unresolved there is no verdict: review, never a refusal", async () => {
  // This build clashes (AM5 processor, AM4 board), but the board's answer is malformed, so nothing can be judged.
  const products = catalogue({
    CPU: listing("CPU", { socket: "AM5" }),
    Motherboard: { ...listing("Motherboard"), metafields: { socket: "AM4" } },
  });
  const malformed = await send(products, { compatibility: FORGED_CLAIMS });
  assertEquals(malformed.status, 200);
  assertEquals(malformed.body.technicianReviewRequired, true);
  assertEquals(assessmentOf(malformed).state, "not_assessed");
  assertEquals(assessmentOf(malformed).unresolvedSlots, ["Motherboard"]);
  assertEquals(assessmentOf(malformed).mismatches, []);

  // Shopify answers for other variants: nothing in the answer is used, so nothing is judged.
  const shuffled = await send(catalogue({ CPU: listing("CPU", { socket: "AM5" }) }), {
    reply: (ids) => ({
      data: {
        nodes: [...ids].reverse().map((id) => ({
          id,
          price: { amount: "1.00" },
          availableForSale: true,
          product: listing("CPU"),
        })),
      },
    }),
    compatibility: FORGED_CLAIMS,
  });
  assertEquals(shuffled.status, 200);
  assertEquals(shuffled.body.technicianReviewRequired, true);
  assertEquals(assessmentOf(shuffled).state, "not_assessed");
  assertEquals(shuffled.body.authoritativePrice, null);

  // Shopify unreachable: the same.
  const down = await send(catalogue(), { reply: () => ({ errors: [{ message: "down" }] }) });
  assertEquals(assessmentOf(down).state, "not_assessed");
  assertEquals(down.body.technicianReviewRequired, true);
});

Deno.test("S4S3-11: incomplete metafields leave the checks that need them for review", async () => {
  // The board states only its socket: the checks on its memory, size and slots can't be made.
  const board = { ...listing("Motherboard"), metafields: specMetafields({ socket: "AM4" }) };
  const products = catalogue({ Motherboard: board });
  const result = await send(products, { compatibility: FORGED_CLAIMS });
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  const verdict = assessmentOf(result);
  assertEquals(verdict.state, "needs_review");
  assert(verdict.reviewChecks.some((check: any) => check.slots.includes("Motherboard")));
  assertEquals(pageVerdict(products).state, "needs_review");
});

Deno.test("S4S3-12: conflicting values are withheld, never guessed: review, not a refusal on either value", async () => {
  // The registry's Ryzen 5 7600 is AM5; this listing says AM4, like its board. Neither value is used.
  const products = catalogue({
    CPU: { ...listing("CPU", {}, "AMD Ryzen 5 7600") },
  });
  const result = await send(products, { compatibility: FORGED_CLAIMS });
  assertEquals(result.status, 200, JSON.stringify(result.body));
  assertEquals(result.body.technicianReviewRequired, true);
  const verdict = assessmentOf(result);
  assertEquals(verdict.state, "needs_review");
  assertEquals(verdict.mismatches, []);
  assert(verdict.reviewChecks.some((check: any) => check.ruleId === "RULE_K_SPEC_CONFLICT"));
  assertEquals(result.calls.inserted[0].parts.CPU.serverSpecs.status, "problem");
  assertEquals(pageVerdict(products).state, "needs_review");
});

// ── Owned parts and the decision table ───────────────────────────────────────────────────────────────

Deno.test("S4S3-13: an owned part is never Complete on the server's word: review, not a refusal", async () => {
  const result = await send(catalogue(), { owned: ["GPU"] });
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  const verdict = assessmentOf(result);
  assertEquals(verdict.state, "needs_review");
  assertEquals(verdict.ownedSlots, ["GPU"]);
  assert(verdict.reviewReasons.some((r: any) => r.kind === "owned_part" && r.slot === "GPU"));
});

Deno.test("S4S3-14: the verdict is the builder's own engine and assessment, on the server's parts", () => {
  // No parts resolved: no verdict.
  assertEquals(assessQuotation([], [], {}).record.state, "not_assessed");
  // The function decides review from its own verdict, and never from the browser's status.
  const edge = Deno.readTextFileSync("supabase/functions/verify-and-submit-pc-quotation/index.ts");
  assert(!edge.includes("compatibility?.status"), "the browser's status is read in index.ts");
  assert(edge.includes('verdict.record.state !== "complete"'));
  const assess = Deno.readTextFileSync(
    "supabase/functions/verify-and-submit-pc-quotation/assess.ts",
  );
  assert(assess.includes("checkCompatibility(components, { ownedSlots })"));
  assert(assess.includes("assessBuild(components, summary, {"));
  assert(assess.includes("...(purpose ? { purpose } : {}),"));
  // Only the generated copies, never src/.
  assert(!/from\s*["'][^"']*\/src\//.test(assess));
  // Every slot the page can send has a category in the test catalogue.
  for (const slot of SLOTS) assert(SLOT_CATEGORY[slot], slot);
});

// ── Decision S3-B: the Find My PC purpose ────────────────────────────────────────────────────────────

const { QUOTE_PURPOSES } = await import("../verify-and-submit-pc-quotation/structure.ts");
const { purposeProfile } = await import("../../../src/lib/builder/purpose.ts");
const { submitQuotationRequest } = await import("../../../src/lib/builder/persistence.ts");
const { compareWithBrowser, disagreementLog } =
  await import("../verify-and-submit-pc-quotation/assess.ts");

/**
 * The approved requirement of each use, as the page applies it at the quotation gate (`purposeProfile(purpose)`,
 * no details, 4A decision D2). Documented before S3-B; not a new rule.
 */
const CARD_REQUIRED: Record<string, boolean> = {
  gaming: true,
  creation: true,
  professional: true,
  programming: false,
  work: false,
  general: false,
};

Deno.test("S4S3-15: the server accepts exactly the uses Find My PC offers, with their approved requirements", () => {
  const page = Deno.readTextFileSync("src/pages/Builder.tsx");
  const type = page.match(/type PurposeId = ([^;]+);/);
  assert(type, "PurposeId not found in Builder.tsx");
  const offered = [...type[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assertEquals([...QUOTE_PURPOSES].sort(), offered.sort());
  assertEquals(Object.keys(CARD_REQUIRED).sort(), offered.sort());
  for (const purpose of QUOTE_PURPOSES) {
    assertEquals(purposeProfile(purpose).requiresDedicatedGpu, CARD_REQUIRED[purpose], purpose);
  }
});

Deno.test("S4S3-16: each use's requirement is applied on the server, as the page applies it", async () => {
  // A processor with graphics of its own and no card: enough unless the use needs a card.
  const noCard = catalogue();
  const withCard = catalogue({}, ["GPU"]);
  for (const purpose of QUOTE_PURPOSES) {
    const result = await send(noCard, { extra: { purpose }, compatibility: FORGED_CLAIMS });
    const page = pageVerdict(noCard, [], purpose);
    if (CARD_REQUIRED[purpose]) {
      assertRefused(result, "incomplete_build", purpose);
      assertEquals(result.body.missingSlots, ["GPU"], purpose);
      assertEquals(result.body.error, "Still to choose: GPU.", purpose);
      assertEquals(page.state, "incomplete", purpose);
    } else {
      assertEquals(result.status, 200, purpose);
      assertEquals(result.body.technicianReviewRequired, false, purpose);
      assertEquals(assessmentOf(result).state, "complete", purpose);
      assertEquals(page.state, "complete", purpose);
    }
    // With a card, every use is Complete, and the verdict records the use.
    const carded = await send(withCard, { extra: { purpose } });
    assertEquals(carded.status, 200, purpose);
    assertEquals(assessmentOf(carded).state, "complete", purpose);
    assertEquals(assessmentOf(carded).purpose, purpose, purpose);
    // The customer's own card counts for a use that needs one: review, not a refusal.
    const owned = await send(noCard, { extra: { purpose }, owned: ["GPU"] });
    assertEquals(owned.status, 200, purpose);
    assertEquals(owned.body.technicianReviewRequired, true, purpose);
    assertEquals(assessmentOf(owned).state, "needs_review", purpose);
  }
});

Deno.test("S4S3-17: Expert Mode and earlier requests carry no purpose, and stay purpose-neutral", async () => {
  for (const extra of [{}, { purpose: null }]) {
    const result = await send(catalogue(), { extra });
    assertEquals(result.status, 200);
    assertEquals(result.body.technicianReviewRequired, false);
    assertEquals(assessmentOf(result).state, "complete");
    assertEquals(assessmentOf(result).purpose, null);
  }
});

Deno.test("S4S3-18: a use the page doesn't offer is refused as unreadable, before Shopify is asked", async () => {
  for (const purpose of [
    "office",
    "custom",
    "GAMING",
    "gaming ",
    "",
    "mining",
    5,
    true,
    {},
    ["gaming"],
  ]) {
    const result = await send(catalogue(), { extra: { purpose } });
    const label = JSON.stringify(purpose);
    assertEquals(result.status, 400, label);
    assertEquals(result.body.code, "invalid_request", label);
    assertEquals(result.body.error, MESSAGE_UNREADABLE, label);
    assert(
      result.body.problems.some((p: any) => p.code === "purpose_invalid"),
      label,
    );
    assertEquals(result.calls.shopify, 0, label);
    assertEquals(result.calls.inserted.length, 0, label);
  }
});

Deno.test("S4S3-19: requirements come from the server's own rules, never from the request", async () => {
  // A professional build with no card, whatever the browser says about what professional work needs.
  const forged = await send(catalogue(), {
    extra: {
      purpose: "professional",
      details: { type: "Software Development" },
      requiresDedicatedGpu: false,
      purposeProfile: { requiresDedicatedGpu: false },
    },
  });
  assertRefused(forged, "incomplete_build", "forged requirements");
  // Software development needs no card, whatever the browser says it needs.
  const claimed = await send(catalogue(), {
    extra: { purpose: "programming", requiresDedicatedGpu: true },
  });
  assertEquals(claimed.status, 200);
  assertEquals(assessmentOf(claimed).state, "complete");
});

Deno.test("S4S3-20: the page sends the purpose from Find My PC, and none from Expert Mode", async () => {
  const bodies: any[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    functions: {
      invoke: async (_name: string, { body }: any) => {
        bodies.push(body);
        return { data: { success: true, referenceId: "R" }, error: null };
      },
    },
  };
  const build = {
    id: "b",
    name: "B",
    mode: "guided",
    currency: "INR",
    components: {},
    compatibility: { status: "compatible" },
    ownedSlots: [],
  } as any;
  await submitQuotationRequest(build, {}, { supabaseClient: client }, { purpose: "gaming" });
  await submitQuotationRequest(build, {}, { supabaseClient: client });
  assertEquals(bodies[0].purpose, "gaming");
  assertEquals("purpose" in bodies[1], false);
  // The customise view passes the use its build was found for; Expert Mode's call passes none.
  const page = Deno.readTextFileSync("src/pages/Builder.tsx");
  assert(page.includes("initial.purpose ? { purpose: initial.purpose } : {},"));
  assertEquals(page.split("submitQuotationRequest(").length - 1, 2);
});

// ── Decision S3-A: disagreements are recorded, never acted on ────────────────────────────────────────

const STATUSES = ["compatible", "conditional", "unknown", "incompatible"] as const;
const summaryOf = (status: string, extra: Record<string, unknown> = {}) =>
  ({ status, valid: status !== "incompatible", complete: true, items: [], ...extra }) as any;
const CONTACT = {
  name: "Test Customer",
  email: "test.customer@example.com",
  phone: "+919000000000",
};

Deno.test("S4S3-21: every combination of the browser's status and the server's is compared correctly", () => {
  for (const server of STATUSES) {
    for (const browser of [...STATUSES, "weird <b>text</b>"]) {
      const result = compareWithBrowser({ status: browser }, summaryOf(server));
      const shown = (STATUSES as readonly string[]).includes(browser) ? browser : "unrecognised";
      const label = `${browser} vs ${server}`;
      assertEquals(result.compared, true, label);
      assertEquals(result.agrees, shown === server, label);
      assertEquals(
        result.differences,
        shown === server ? [] : [{ field: "status", browser: shown, server }],
        label,
      );
    }
    // No claim, or no recognisable one: nothing to compare.
    for (const claim of [undefined, null, {}, { status: 5 }, "compatible", []]) {
      const result = compareWithBrowser(claim, summaryOf(server));
      assertEquals([result.compared, result.agrees], [false, null], JSON.stringify(claim));
    }
  }
  // No verdict (unresolved parts): nothing to compare, whatever the browser says.
  assertEquals(compareWithBrowser({ status: "compatible" }, undefined).agrees, null);
});

Deno.test("S4S3-22: the flags and blocking rules are compared, and nothing else of the browser's is kept", () => {
  const server = summaryOf("incompatible", {
    valid: false,
    complete: true,
    items: [
      { ruleId: "RULE_A_SOCKET_MISMATCH", severity: "error" },
      { ruleId: "RULE_J_SPEC_UNVERIFIED", severity: "warning" },
    ],
  });
  const result = compareWithBrowser(
    {
      status: "incompatible",
      valid: true,
      complete: false,
      items: [
        { ruleId: "RULE_D_GPU_LENGTH_EXCEEDED", severity: "error" },
        { ruleId: "customer@example.com", severity: "error" },
        { ruleId: "RULE_" + "X".repeat(200), severity: "error" },
        { ruleId: "RULE_J_SPEC_UNVERIFIED", severity: "warning" },
        "junk",
        null,
      ],
      customerName: "Someone",
    },
    server,
  );
  assertEquals(result.agrees, false);
  assertEquals(result.differences, [
    { field: "valid", browser: true, server: false },
    { field: "complete", browser: false, server: true },
  ]);
  assertEquals(result.errorRules, {
    onlyServer: ["RULE_A_SOCKET_MISMATCH"],
    onlyBrowser: ["RULE_D_GPU_LENGTH_EXCEEDED"],
  });
  assert(!JSON.stringify(result).includes("example.com"));
  assert(!JSON.stringify(result).includes("Someone"));
  // A long list is bounded.
  const many = Array.from({ length: 50 }, (_, i) => ({ ruleId: `RULE_R${i}`, severity: "error" }));
  const bounded = compareWithBrowser({ items: many }, summaryOf("compatible"));
  assertEquals(bounded.errorRules.onlyBrowser.length, 20);
});

Deno.test("S4S3-23: whatever the browser claims, every server outcome is decided the same way", async () => {
  const outcomes: [string, Catalogue, Send][] = [
    ["complete", catalogue(), {}],
    ["needs review", catalogue({ RAM: listing("RAM", null, "QZX S4S3 Memory") }), {}],
    ["not assessed", catalogue(), { reply: () => ({ errors: [{ message: "down" }] }) }],
    ["incompatible", catalogue({ CPU: listing("CPU", { socket: "AM5" }) }), {}],
    ["incomplete", catalogue(), { extra: { purpose: "gaming" } }],
  ];
  const claims = [
    { status: "compatible", valid: true, complete: true },
    { status: "incompatible", valid: false, complete: false },
    { status: "conditional" },
    { status: "unknown" },
    {},
  ];
  const secrets = [
    CONTACT.name,
    CONTACT.email,
    CONTACT.phone,
    "s4s3-token",
    "s4s3-cpu",
    "0000000004s3",
  ];
  for (const [label, products, options] of outcomes) {
    const results = [];
    for (const compatibility of claims) {
      results.push(await send(products, { ...options, compatibility, customerInfo: CONTACT }));
    }
    // The same status, refusal code and review flag for every claim.
    const decided = results.map((r) => [r.status, r.body.code, r.body.technicianReviewRequired]);
    for (const [index, decision] of decided.entries()) {
      assertEquals(decision, decided[0], `${label}, claim ${JSON.stringify(claims[index])}`);
    }
    for (const [index, result] of results.entries()) {
      const where = `${label}, claim ${JSON.stringify(claims[index])}`;
      const verdict = assessmentOf(result);
      if (verdict) {
        // Stored outcomes record the comparison, and its agreement is the stored flag.
        assertEquals(verdict.agreesWithBrowser, verdict.browserComparison.agrees, where);
        if (verdict.state === "not_assessed") {
          assertEquals(verdict.browserComparison.compared, false, where);
          assertEquals(result.calls.logs.length, 0, where);
        } else {
          assertEquals(
            result.calls.logs.length,
            verdict.browserComparison.agrees === false ? 1 : 0,
            where,
          );
        }
      }
      // A disagreement is logged, refused or not; the log names no customer, account or product.
      for (const line of result.calls.logs) {
        const entry = JSON.parse(line);
        assertEquals(entry.event, "pc_quotation_browser_disagreement", where);
        for (const secret of secrets) {
          assert(!line.includes(secret), `${where}: the log holds ${secret}`);
        }
      }
    }
    // Refused outcomes store nothing, but a browser claiming the opposite is still logged. The page sends the
    // engine's summary, which says nothing about a use's needs: for a gaming build with no card the engine is
    // "compatible" too, so that claim agrees, and the refusal comes from completeness.
    if (label === "incompatible") {
      assertEquals(results[0].calls.logs.length, 1, `${label}: a "compatible" claim not logged`);
    }
    if (label === "incomplete") assertEquals(results[0].calls.logs.length, 0, label);
  }
  // The refused, incompatible build the browser calls compatible: its disagreement in the log.
  const refused = await send(catalogue({ CPU: listing("CPU", { socket: "AM5" }) }));
  assertRefused(refused, "incompatible_build", "refused");
  const entry = JSON.parse(refused.calls.logs[0]);
  assertEquals(entry.serverState, "incompatible");
  assertEquals(entry.differences, [
    { field: "status", browser: "compatible", server: "incompatible" },
  ]);
});

Deno.test("S4S3-24: a disagreement alone never sends a Complete build to review, and agreement never clears one", async () => {
  // Complete on the server; the browser says it's incompatible and lists a clash: no review.
  const complete = await send(catalogue(), {
    compatibility: {
      status: "incompatible",
      valid: false,
      items: [{ ruleId: "RULE_A_SOCKET_MISMATCH", severity: "error" }],
    },
  });
  assertEquals(complete.body.technicianReviewRequired, false);
  assertEquals(assessmentOf(complete).browserComparison.agrees, false);
  assertEquals(disagreementLog(assessmentOf(complete))?.serverState, "complete");
  // Needs Review on the server; the browser agrees it's fine in every way it can: still review.
  const review = await send(catalogue({ RAM: listing("RAM", null, "QZX S4S3 Memory") }), {
    compatibility: FORGED_CLAIMS,
  });
  assertEquals(review.body.technicianReviewRequired, true);
});

// ── Owner decision F1 (after 4S-6): every stored verdict is complete ──────────────────────────────────────────
// A stored verdict missing the lists the Staff Portal reads blanks the whole portal (F1). The database accepts any
// JSON in that column, written only by the service role through create_pc_quotation and never changed afterwards,
// so the guarantee rests on this function. This proves every verdict it stores, for every stored outcome and every
// browser claim, carries every field the portal's verdict panel reads, in the right shape.

const { readServerAssessment, BUILD_STATE_LABELS } =
  await import("../../../ITHUB_ADMIN/src/lib/quotation-records.ts");

/** Every field the portal's verdict panel (QuotationDetailModal `ServerVerdict`) reads, checked for shape. */
function assertCompleteVerdict(verdict: any, where: string) {
  const fail = (what: string) => `${where}: ${what} in ${JSON.stringify(verdict).slice(0, 300)}`;
  const strings = (value: unknown) =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
  const checks = (value: unknown) =>
    Array.isArray(value) &&
    value.every(
      (check: any) =>
        typeof check?.ruleId === "string" &&
        typeof check?.label === "string" &&
        strings(check?.slots),
    );
  assert(verdict && typeof verdict === "object", fail("no verdict"));
  assertEquals(verdict.assessedBy, "server", fail("assessedBy"));
  assertEquals(verdict.stage, "4S-3", fail("stage"));
  assert(verdict.state in BUILD_STATE_LABELS, fail("state"));
  assert(verdict.purpose === null || typeof verdict.purpose === "string", fail("purpose"));
  for (const list of ["mismatches", "reviewChecks", "advice"]) {
    assert(checks(verdict[list]), fail(list));
  }
  assert(
    Array.isArray(verdict.gaps) &&
      verdict.gaps.every(
        (gap: any) =>
          typeof gap?.slot === "string" &&
          (gap.need === "missing" || gap.need === "unconfirmed") &&
          typeof gap.reason === "string",
      ),
    fail("gaps"),
  );
  assert(
    Array.isArray(verdict.reviewReasons) &&
      verdict.reviewReasons.every((reason: any) => typeof reason?.kind === "string"),
    fail("reviewReasons"),
  );
  assert(strings(verdict.ownedSlots), fail("ownedSlots"));
  if (verdict.unresolvedSlots !== undefined)
    assert(strings(verdict.unresolvedSlots), fail("unresolvedSlots"));
  if (verdict.power !== undefined) {
    assert(
      Number.isFinite(verdict.power?.estimatedSystemLoadWatts) &&
        Number.isFinite(verdict.power?.recommendedPsuWatts),
      fail("power"),
    );
  }
  assert(
    verdict.agreesWithBrowser === null || typeof verdict.agreesWithBrowser === "boolean",
    fail("agreesWithBrowser"),
  );
  const comparison = verdict.browserComparison;
  assert(
    typeof comparison?.compared === "boolean" &&
      (comparison.agrees === null || typeof comparison.agrees === "boolean") &&
      Array.isArray(comparison.differences) &&
      comparison.differences.every((d: any) => typeof d?.field === "string") &&
      strings(comparison.errorRules?.onlyServer) &&
      strings(comparison.errorRules?.onlyBrowser),
    fail("browserComparison"),
  );
  // The portal reads it as a verdict, not as "not recorded".
  assert(readServerAssessment(verdict) !== null, fail("portal reader"));
  // And what's stored is plain JSON: the database keeps exactly this.
  assertEquals(JSON.parse(JSON.stringify(verdict)), verdict, fail("not plain JSON"));
}

Deno.test("S4S6-F1: every verdict the server stores carries every field the Staff Portal reads", async () => {
  const outcomes: [string, Catalogue, Send, string][] = [
    ["complete", catalogue(), {}, "complete"],
    [
      "complete, Find My PC use",
      catalogue({}, ["GPU"]),
      { extra: { purpose: "gaming" } },
      "complete",
    ],
    [
      "unreviewed values",
      catalogue({ RAM: listing("RAM", null, "QZX S4S3 Memory") }),
      {},
      "needs_review",
    ],
    ["owned part", catalogue(), { owned: ["GPU"] }, "needs_review"],
    [
      "incomplete metafields",
      catalogue({
        Motherboard: { ...listing("Motherboard"), metafields: specMetafields({ socket: "AM4" }) },
      }),
      {},
      "needs_review",
    ],
    [
      "conflicting values",
      catalogue({ CPU: { ...listing("CPU", {}, "AMD Ryzen 5 7600") } }),
      {},
      "needs_review",
    ],
    [
      "malformed specifications",
      catalogue({ Motherboard: { ...listing("Motherboard"), metafields: { socket: "AM4" } } }),
      {},
      "not_assessed",
    ],
    [
      "Shopify unreachable",
      catalogue(),
      { reply: () => ({ errors: [{ message: "down" }] }) },
      "not_assessed",
    ],
  ];
  const claims: unknown[] = [
    { status: "compatible", valid: true, complete: true },
    { status: "incompatible", valid: false, complete: false, errorRules: ["RULE_A_SOCKET"] },
    { status: "made-up" },
    FORGED_CLAIMS,
    {},
  ];
  // A claim that isn't an object is refused as unreadable (`compatibility_invalid`) before anything is stored, so it has no verdict.
  let stored = 0;
  for (const [label, products, options, state] of outcomes) {
    for (const compatibility of claims) {
      const where = `${label}, claim ${JSON.stringify(compatibility)}`;
      const result = await send(products, { ...options, compatibility });
      assertEquals(result.status, 200, `${where}: ${JSON.stringify(result.body)}`);
      const verdict = assessmentOf(result);
      assertEquals(verdict?.state, state, where);
      assertCompleteVerdict(verdict, where);
      stored++;
    }
  }
  assertEquals(stored, outcomes.length * claims.length);
});
