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
}

async function send(products: Catalogue, options: Send = {}) {
  const calls = { inserted: [] as any[], repeatLookups: 0 };
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "00000000-0000-0000-0000-0000000004s3" } },
        error: null,
      }),
    },
    rpc: async () => ({ data: true, error: null }),
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: async () => {
          calls.repeatLookups++;
          return { data: [], error: null };
        },
        insert: (row: any) => {
          calls.inserted.push(row);
          return {
            select: () => ({ single: async () => ({ data: { id: "s4s3-row" }, error: null }) }),
          };
        },
      };
      return query;
    },
  };
  const bySlotOfVariant = Object.fromEntries(Object.keys(products).map((slot) => [V(slot), slot]));
  const shopifyFetch = async (_query: string, vars: { ids: string[] }) => {
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
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer s4s3-token" },
      body: JSON.stringify({
        buildName: "S4S-3",
        estimatedPrice: totalOf(products) - ownedPrice,
        compatibility:
          "compatibility" in options ? options.compatibility : { status: "compatible" },
        customerInfo: {},
        parts,
      }),
    }),
    { supabaseClient: client as any, shopifyFetch },
  );
  return { status: res.status, body: await res.json(), calls };
}

/** What the builder page concludes about the same Shopify listings: the storefront's own path, purpose-neutral. */
function pageVerdict(products: Catalogue, owned: string[] = []) {
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
  return assessBuild(components as any, summary, { ownedSlots: owned });
}

const assessmentOf = (result: Awaited<ReturnType<typeof send>>) =>
  result.calls.inserted[0]?.compatibility?.serverAssessment;

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
  const stored = result.calls.inserted[0].compatibility;
  assertEquals(stored.serverAssessment.state, "needs_review");
  assert(stored.serverAssessment.reviewChecks.length > 0);
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
  assert(assess.includes("assessBuild(components, summary, { ownedSlots })"));
  // Only the generated copies, never src/.
  assert(!/from\s*["'][^"']*\/src\//.test(assess));
  // Every slot the page can send has a category in the test catalogue.
  for (const slot of SLOTS) assert(SLOT_CATEGORY[slot], slot);
});
