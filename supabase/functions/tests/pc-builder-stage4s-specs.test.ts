// Stage 4S-2: trusted specification resolution on the quotation server. The server works out each part's
// specifications from Shopify's answer for that variant, with the storefront's own resolver (generated copy), and
// records each value's status and provenance. The browser's specifications are never used as values. Only a part
// whose specifications can't be resolved, or carry a problem (rejected, conflicting, unreadable, an unsound review
// record), sends the quotation to review in this stage (owner decision, 11 November 2026).
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
const { MESSAGE_UNREADABLE } = await import("../verify-and-submit-pc-quotation/structure.ts");
const { SPEC_METAFIELD_KEYS, VARIANT_QUERY } =
  await import("../verify-and-submit-pc-quotation/resolve.ts");
const {
  fieldsForMetafield,
  readSpecMetafields,
  resolvePartSpecs,
  serverBuildComponents,
  unresolvedSpecRecord,
} = await import("../verify-and-submit-pc-quotation/specs.ts");
const serverRegistry = await import("../_shared/builder/spec-registry.ts");
const sourceRegistry = await import("../../../src/lib/builder/spec-registry.ts");
const shopifyFields = await import("../../../src/lib/builder/shopify-fields.ts");
const shopifySchema = await import("../../../src/lib/shopify-schema.ts");
const { matchShopifyProductToComponent } = await import("../../../src/lib/builder/catalog.ts");
const { PC_BUILDER_METAFIELDS } = await import("../../../src/lib/builder/spec-schema.ts");
const { GOLDEN_CATALOGUES } = await import("./_helpers/stage3-golden.ts");

const V = (id: string) => `gid://shopify/ProductVariant/s4s2-${id}`;

const PRICES: Record<string, number> = {
  [V("cpu")]: 15000,
  [V("board")]: 9000,
  [V("ram")]: 3000,
  [V("ssd")]: 4000,
  [V("psu")]: 3500,
  [V("case")]: 2500,
};
const TOTAL = 15000 + 9000 + 3000 + 4000 + 3500 + 2500;

const parts = (): Record<string, any> => ({
  CPU: { slot: "CPU", variantId: V("cpu"), title: "Processor", price: 15000, quantity: 1 },
  Motherboard: {
    slot: "Motherboard",
    variantId: V("board"),
    title: "Board",
    price: 9000,
    quantity: 1,
  },
  RAM: { slot: "RAM", variantId: V("ram"), title: "Memory", price: 3000, quantity: 1 },
  Storage: { slot: "Storage", variantId: V("ssd"), title: "Drive", price: 4000, quantity: 1 },
  PSU: { slot: "PSU", variantId: V("psu"), title: "Supply", price: 3500, quantity: 1 },
  Cabinet: { slot: "Cabinet", variantId: V("case"), title: "Case", price: 2500, quantity: 1 },
});

/** A complete IT HUB review record, dated in the past. */
const REVIEWED = {
  spec_review_status: "reviewed",
  spec_source: "manufacturer_datasheet",
  spec_source_url: "https://example.com/test-datasheet",
  spec_reviewed_on: "2026-11-01",
};

/** A test listing filed under its slot's category, with these pc_builder values. */
const listing = (slot: string, title: string, values: Record<string, string> = {}) => ({
  ...storefrontProduct(slot, title),
  metafields: specMetafields(values),
});

const AM5 = { socket: "AM5", ram_generation: "DDR5" };

/**
 * The test catalogue for a build: one made-up listing per part, an AM5 and DDR5 build that is Complete on the
 * server's own assessment (Stage 4S-3).
 */
const PRODUCTS: Record<string, any> = {
  // Matches the registry entry cpu-r5-7600, whose socket, power, graphics and cooler have a maker's page.
  [V("cpu")]: listing("CPU", "AMD Ryzen 5 7600"),
  // No registry entry: everything comes from the listing's own, reviewed, metafields.
  [V("board")]: listing("Motherboard", "IT-HUB Test Board TB-1", {
    ...verifiedValues("Motherboard", AM5),
    form_factor: "Micro-ATX",
    ...REVIEWED,
  }),
  [V("ram")]: listing("RAM", "IT-HUB Test Memory TM-1", verifiedValues("RAM", AM5)),
  [V("ssd")]: listing("Storage", "IT-HUB Test Drive TD-1", verifiedValues("Storage")),
  [V("psu")]: listing("PSU", "IT-HUB Test Supply TS-1 650W", verifiedValues("PSU")),
  [V("case")]: listing("Cabinet", "IT-HUB Test Case TC-1", verifiedValues("Cabinet")),
};

const node = (id: string, product: any = PRODUCTS[id], overrides: Record<string, any> = {}) => ({
  id,
  title: "Default Title",
  price: { amount: `${PRICES[id]}.00`, currencyCode: "INR" },
  availableForSale: true,
  currentlyNotInStock: false,
  product,
  ...overrides,
});

interface Options {
  answer?: Record<string, (id: string) => any>;
  reply?: (ids: string[]) => any;
  shopifyThrows?: boolean;
}

async function send(body: Record<string, any>, options: Options = {}) {
  // Stage 4S-4: the database is reached only through its two quotation functions.
  const db = quotationClient({ userId: "00000000-0000-0000-0000-0000000004s2" });
  const calls = { shopify: [] as { query: string; ids: string[] }[], inserted: db.inserted };
  const client = db.client;
  const shopifyFetch = async (query: string, vars: { ids: string[] }) => {
    calls.shopify.push({ query, ids: vars.ids });
    if (options.shopifyThrows) throw new Error("network down");
    if (options.reply) return options.reply(vars.ids);
    return { data: { nodes: vars.ids.map((id) => (options.answer?.[id] ?? node)(id)) } };
  };
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer s4s2-token" },
      body: JSON.stringify({
        buildName: "S4S-2",
        estimatedPrice: TOTAL,
        compatibility: { status: "compatible" },
        customerInfo: {},
        ...body,
      }),
    }),
    { supabaseClient: client as any, shopifyFetch },
  );
  return { status: res.status, body: await res.json(), calls };
}

/** Shopify's answer for one variant, with its product changed. */
const productAs = (changes: Record<string, unknown>) => (id: string) =>
  node(id, { ...PRODUCTS[id], ...changes });

const field = (record: any, name: string) =>
  record.fields.find((entry: any) => entry.field === name);

const CONFIRMED = { kind: "match", source: "shopify_fields" } as const;

/** One part resolved directly, as the quotation server resolves it. */
const resolveOne = (
  slot: string,
  product: any,
  browserSpecs?: unknown,
  slotCheck: any = CONFIRMED,
) =>
  resolvePartSpecs(
    { id: V("one"), price: { amount: "1000.00" }, availableForSale: true, product },
    slot,
    slotCheck,
    browserSpecs,
  );

// ── 1. Supported Shopify specifications ──────────────────────────────────────────────────────────────

Deno.test("S4S2-1: reviewed Shopify metafields resolve to verified values, each with its metafield", () => {
  const { record } = resolveOne("Motherboard", PRODUCTS[V("board")]);
  assertEquals(record.status, "verified");
  assertEquals(record.reviewRequired, false);
  assertEquals(record.slotBasis, "shopify_fields");
  for (const [name, value, metafield] of [
    ["socket", "AM5", "socket"],
    ["supportedRamGeneration", "DDR5", "ram_generation"],
    ["formFactor", "Micro-ATX", "form_factor"],
  ]) {
    assertEquals(field(record, name), {
      field: name,
      status: "verified",
      value,
      confidence: "it_hub_reviewed",
      origin: "shopify_metafield",
      metafield,
      critical: true,
    });
  }
  assertEquals(record.missingCritical, []);
  assertEquals(record.problems, []);

  // The same values unreviewed are only a supplier's statement: present, but uncertain.
  const unreviewed = resolveOne(
    "Motherboard",
    listing("Motherboard", "IT-HUB Test Board TB-1", {
      socket: "AM5",
      ram_generation: "DDR5",
      form_factor: "Micro-ATX",
    }),
  ).record;
  assertEquals(unreviewed.status, "uncertain");
  assertEquals(field(unreviewed, "socket").status, "uncertain");
  assertEquals(field(unreviewed, "socket").confidence, "supplier_provided");
  // Recorded, but not a reason for review on its own in 4S-2 (owner decision 2; Stage 4S-3 decides).
  assertEquals(unreviewed.reviewRequired, false);
});

Deno.test("S4S2-2: a registry match with a maker's page per field resolves to verified, from the code registry", () => {
  const { record, component } = resolveOne("CPU", PRODUCTS[V("cpu")]);
  assertEquals(record.registryKey, "cpu-r5-7600");
  assertEquals(record.status, "verified");
  assertEquals(record.provenance, "manufacturer_verified");
  assertEquals(field(record, "socket"), {
    field: "socket",
    status: "verified",
    value: "AM5",
    confidence: "manufacturer_verified",
    origin: "code_registry",
    critical: true,
  });
  // A registry value without a maker's page is on the list, but not verified.
  const unsourced = record.fields.filter(
    (entry: any) => entry.origin === "code_registry" && entry.confidence === "supplier_provided",
  );
  for (const entry of unsourced) assertEquals(entry.status, "uncertain", entry.field);
  // Stage 4S-3 receives this part, built from Shopify's answer and the registry only.
  assertEquals(component?.specs.socket, "AM5");
});

// ── 2. Missing specifications ────────────────────────────────────────────────────────────────────────

Deno.test("S4S2-3: a missing value is reported missing, never filled in", () => {
  const { record } = resolveOne(
    "Motherboard",
    listing("Motherboard", "IT-HUB Test Board TB-2", { socket: "AM5" }),
  );
  assertEquals(record.status, "incomplete");
  assertEquals(record.missingCritical, ["memory generation", "form factor"]);
  for (const name of ["supportedRamGeneration", "formFactor"]) {
    assertEquals(field(record, name), {
      field: name,
      status: "missing",
      confidence: "unknown",
      critical: true,
    });
  }
  // Missing values are Stage 4S-3's to weigh against the rest of the build, not a review reason here.
  assertEquals(record.reviewRequired, false);

  // Nothing stated at all: every critical value missing, none invented.
  const bare = resolveOne("Storage", listing("Storage", "IT-HUB Test Drive TD-1")).record;
  assertEquals(bare.status, "incomplete");
  assertEquals(field(bare, "storageInterface").status, "missing");
  assertEquals(
    bare.fields.filter((entry: any) => "value" in entry),
    [],
    "a drive with no stated values has no values",
  );
});

// ── 3. Invalid types and formats ─────────────────────────────────────────────────────────────────────

Deno.test("S4S2-4: an unreadable or out-of-range value is invalid: no value, and the quotation is reviewed", () => {
  const cases: [string, string, Record<string, string>, string][] = [
    ["Motherboard", "IT-HUB Test Board TB-3", { socket: "AM9" }, "socket"],
    ["Motherboard", "IT-HUB Test Board TB-3", { ram_slots: "99" }, "ramSlots"],
    ["Motherboard", "IT-HUB Test Board TB-3", { wifi: "perhaps" }, "hasWifi"],
    ["GPU", "IT-HUB Test Card TG-1", { gpu_length_mm: "long" }, "lengthMm"],
    [
      "Cabinet",
      "IT-HUB Test Case TC-2",
      { supported_motherboards: '["ATX","Huge"]' },
      "supportedMotherboards",
    ],
  ];
  for (const [slot, title, values, name] of cases) {
    const { record } = resolveOne(slot, listing(slot, title, values));
    const label = `${slot} ${JSON.stringify(values)}`;
    assertEquals(field(record, name)?.status, "invalid", label);
    assertEquals("value" in field(record, name), false, label);
    assertEquals(record.status, "problem", label);
    assertEquals(record.reviewRequired, true, label);
    assertEquals(record.problems[0].kind, "invalid", label);
  }
});

// ── 4. Conflicting values ────────────────────────────────────────────────────────────────────────────

Deno.test("S4S2-5: sources that disagree give no value, and the quotation is reviewed", async () => {
  // The registry says AM5 for a Ryzen 5 7600; the listing says AM4.
  const registry = resolveOne("CPU", listing("CPU", "AMD Ryzen 5 7600", { socket: "AM4" })).record;
  assertEquals(field(registry, "socket"), {
    field: "socket",
    status: "conflicting",
    confidence: "unknown",
    critical: true,
  });
  assertEquals(registry.status, "problem");
  assertEquals(registry.reviewRequired, true);
  assert(registry.problems.some((p: any) => p.kind === "conflict" && p.field === "socket"));

  // The listing says AM5, its title says AM4.
  const title = resolveOne(
    "Motherboard",
    listing("Motherboard", "IT-HUB Test Board AM4 Edition", { socket: "AM5" }),
  ).record;
  assertEquals(field(title, "socket").status, "conflicting");
  assertEquals(title.reviewRequired, true);

  // In a quotation: the browser claims "compatible", the server finds a conflict, so a technician reviews it.
  const result = await send(
    { parts: parts() },
    { answer: { [V("cpu")]: productAs({ metafields: specMetafields({ socket: "AM4" }) }) } },
  );
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  assertEquals(result.body.authoritativePrice, TOTAL);
  assertEquals(result.calls.inserted[0].parts.CPU.serverSpecs.status, "problem");
});

Deno.test("S4S2-6: IT HUB's rejection of a listing's values is honoured: none is used, and it is reviewed", () => {
  const { record } = resolveOne(
    "Motherboard",
    listing("Motherboard", "IT-HUB Test Board TB-4", {
      socket: "AM5",
      ram_generation: "DDR5",
      form_factor: "ATX",
      spec_review_status: "rejected",
    }),
  );
  assertEquals(record.status, "problem");
  assertEquals(record.reviewRequired, true);
  assert(record.problems.some((p: any) => p.kind === "rejected"));
  for (const name of ["socket", "supportedRamGeneration", "formFactor"]) {
    assertEquals("value" in field(record, name), false, name);
  }
  // A review record that doesn't hold up (no source link) is a problem too, as the builder's Rule K says.
  const unsound = resolveOne(
    "Motherboard",
    listing("Motherboard", "IT-HUB Test Board TB-4", {
      socket: "AM5",
      spec_review_status: "reviewed",
      spec_source: "manufacturer_datasheet",
      spec_reviewed_on: "2026-11-01",
    }),
  ).record;
  assertEquals(unsound.reviewRequired, true);
  assertEquals(field(unsound, "socket").status, "uncertain");
});

// ── 5. Uncertain and unsupported values ──────────────────────────────────────────────────────────────

Deno.test("S4S2-7: a title-read value is uncertain; a value for another kind of part is unsupported, not read", () => {
  const supply = resolveOne("PSU", listing("PSU", "IT-HUB Test Supply TS-1 650W")).record;
  assertEquals(field(supply, "ratedWattage"), {
    field: "ratedWattage",
    status: "uncertain",
    value: 650,
    confidence: "title_inferred",
    origin: "product_title",
    critical: true,
  });
  assertEquals(supply.status, "incomplete"); // its connectors aren't stated anywhere
  assertEquals(supply.reviewRequired, false);

  // A graphics card length and memory generation set on a processor listing: not a processor's values.
  const cpu = resolveOne(
    "CPU",
    listing("CPU", "AMD Ryzen 5 7600", { gpu_length_mm: "250", ram_capacity_gb: "16" }),
  ).record;
  // In the order the server asks for them.
  assertEquals(cpu.unsupported, ["ram_capacity_gb", "gpu_length_mm"]);
  assertEquals(field(cpu, "lengthMm"), undefined);
  assertEquals(cpu.status, "verified");

  // A value changed in Shopify after its review counts as unreviewed again.
  const product = listing("Motherboard", "IT-HUB Test Board TB-1");
  product.metafields = specMetafields({
    socket: "AM5",
    ram_generation: "DDR5",
    form_factor: "Micro-ATX",
    ...REVIEWED,
  }).map((entry: any) =>
    entry?.key === "socket" ? { ...entry, updatedAt: "2026-11-05T10:00:00Z" } : entry,
  );
  const changed = resolveOne("Motherboard", product).record;
  assertEquals(field(changed, "socket").confidence, "supplier_provided");
  assertEquals(field(changed, "socket").status, "uncertain");
  assertEquals(field(changed, "formFactor").status, "verified");
  assertEquals(changed.status, "uncertain");
});

Deno.test("S4S2-8: every pc_builder key the server reads fills a builder value for some kind of part", () => {
  const slots = Object.keys(SLOT_CATEGORY);
  const recordKeys = [
    "spec_source",
    "spec_review_status",
    "spec_source_url",
    "spec_reviewed_on",
    "exact_model",
  ];
  for (const key of SPEC_METAFIELD_KEYS) {
    if (recordKeys.includes(key)) continue;
    assert(
      slots.some((slot) => fieldsForMetafield(slot as any, key).length > 0),
      `${key} fills nothing: the unsupported list would be wrong`,
    );
  }
});

// ── 6. Browser tampering ─────────────────────────────────────────────────────────────────────────────

Deno.test("S4S2-9: the browser's specifications are never used: only noted where they differ", async () => {
  const lies = {
    socket: "AM4",
    tdpWatts: 5,
    ratedWattage: 2000,
    provenance: "manufacturer_verified",
    fieldSources: { socket: "manufacturer_verified" },
  };
  const honest = await send({ parts: parts() });
  const forged = parts();
  forged.CPU.specs = lies;
  forged.Motherboard.specs = { socket: "AM4", formFactor: "E-ATX" };
  const tampered = await send({ parts: forged });
  assertEquals(tampered.status, 200);
  for (const slot of Object.keys(forged)) {
    const fromHonest = { ...honest.calls.inserted[0].parts[slot].serverSpecs };
    const fromTampered = { ...tampered.calls.inserted[0].parts[slot].serverSpecs };
    delete fromTampered.browserDifferences;
    assertEquals(fromTampered, fromHonest, `${slot}: the browser's specs changed the server's`);
  }
  const cpu = tampered.calls.inserted[0].parts.CPU;
  assertEquals(field(cpu.serverSpecs, "socket").value, "AM5");
  assertEquals(cpu.specs, lies, "the browser's report is kept as it was sent, as a note");
  assertEquals(cpu.serverSpecs.browserDifferences, [
    { field: "socket", browser: "AM4", server: "AM5" },
    { field: "tdpWatts", browser: "5", server: 65 },
  ]);
  assertEquals(tampered.calls.inserted[0].parts.Motherboard.serverSpecs.browserDifferences, [
    { field: "socket", browser: "AM4", server: "AM5" },
    { field: "formFactor", browser: "E-ATX", server: "Micro-ATX" },
  ]);
  // Same review outcome either way: the browser's values neither add nor clear a reason.
  assertEquals(tampered.body.technicianReviewRequired, honest.body.technicianReviewRequired);

  // A browser claiming a better standing than the server found is noted too.
  const claimed = resolveOne("RAM", PRODUCTS[V("ram")], {
    ramGeneration: "DDR5",
    provenance: "manufacturer_verified",
  }).record;
  assertEquals(claimed.browserDifferences, [
    { field: "provenance", browser: "manufacturer_verified", server: "it_hub_reviewed" },
  ]);
  // Junk in the browser's specs can't break anything or reach the record as a value.
  for (const junk of [null, "AM5", 42, [1, 2], { socket: { $gt: "" } }]) {
    const record = resolveOne("CPU", PRODUCTS[V("cpu")], junk).record;
    assertEquals(field(record, "socket").value, "AM5", JSON.stringify(junk));
  }
});

Deno.test("S4S2-10: a browser can't clear a specification problem by claiming compatibility or specs", async () => {
  const forged = parts();
  forged.CPU.specs = { socket: "AM5", provenance: "manufacturer_verified" };
  const result = await send(
    { parts: forged, compatibility: { status: "compatible", valid: true, isComplete: true } },
    {
      answer: {
        [V("board")]: productAs({
          metafields: specMetafields({ socket: "AM5", spec_review_status: "rejected" }),
        }),
      },
    },
  );
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  const stored = result.calls.inserted[0];
  assertEquals(stored.parts.Motherboard.serverSpecs.status, "problem");
  // The browser's result is still stored only as its own note.
  assertEquals(stored.compatibility.reportedBy, "customer_browser");
});

// ── 7, 8, 9. Mismatched variants, Shopify failures, malformed answers ────────────────────────────────

Deno.test("S4S2-11: an answer for another variant resolves nothing: no specification is claimed", async () => {
  const result = await send(
    { parts: parts() },
    { answer: { [V("cpu")]: () => node(V("board"), PRODUCTS[V("board")]) } },
  );
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  for (const [slot, part] of Object.entries(result.calls.inserted[0].parts) as [string, any][]) {
    assertEquals(part.serverSpecs, unresolvedSpecRecord("answer_unreliable", part.variantId), slot);
  }
  // One node missing from the answer: the answer can't be matched to the parts either.
  const short = await send(
    { parts: parts() },
    { reply: (ids) => ({ data: { nodes: ids.slice(1).map((id) => node(id)) } }) },
  );
  for (const part of Object.values(short.calls.inserted[0].parts) as any[]) {
    assertEquals(part.serverSpecs.status, "unresolved");
    assertEquals(part.serverSpecs.reason, "answer_unreliable");
  }
});

Deno.test("S4S2-12: when Shopify can't be asked, nothing is resolved and a technician reviews it", async () => {
  for (const options of [
    { shopifyThrows: true },
    { reply: () => ({ errors: [{ message: "Throttled" }] }) },
    { reply: () => null },
    { reply: () => ({ data: {} }) },
  ] as Options[]) {
    const result = await send({ parts: parts() }, options);
    const label = JSON.stringify(options);
    assertEquals(result.status, 200, label);
    assertEquals(result.body.technicianReviewRequired, true, label);
    assertEquals(result.body.authoritativePrice, null, label);
    for (const part of Object.values(result.calls.inserted[0].parts) as any[]) {
      assertEquals(part.serverSpecs.status, "unresolved", label);
      assertEquals(part.serverSpecs.fields, [], label);
      assertEquals(part.serverSpecs.reviewRequired, true, label);
    }
  }
});

Deno.test("S4S2-13: metafields in a shape Shopify never sends make that part unresolved, and it is reviewed", async () => {
  const good = (values: Record<string, string> = { socket: "AM5" }) => specMetafields(values);
  const malformed: [string, unknown][] = [
    ["no list", undefined],
    ["not a list", { socket: "AM5" }],
    ["an entry that isn't an object", ["AM5", ...good().slice(1)]],
    ["another namespace", [{ namespace: "custom", key: "socket", value: "AM5", type: "" }]],
    ["a key not asked for", [{ namespace: "pc_builder", key: "turbo", value: "yes", type: "" }]],
    [
      "a repeated key",
      [...good(), { namespace: "pc_builder", key: "socket", value: "AM4", type: "" }],
    ],
    ["a value that isn't text", [{ namespace: "pc_builder", key: "socket", value: 5, type: "" }]],
    [
      "a date that isn't text",
      [{ namespace: "pc_builder", key: "socket", value: "AM5", updatedAt: 7 }],
    ],
  ];
  for (const [label, metafields] of malformed) {
    assertEquals(readSpecMetafields({ metafields }), null, label);
    const result = await send(
      { parts: parts() },
      { answer: { [V("cpu")]: productAs({ metafields }) } },
    );
    assertEquals(result.status, 200, label);
    assertEquals(result.body.technicianReviewRequired, true, label);
    const stored = result.calls.inserted[0].parts;
    assertEquals(stored.CPU.serverSpecs, unresolvedSpecRecord("malformed_answer", V("cpu")), label);
    // The other parts' answers were sound, so they are resolved, and Shopify's price still stands.
    assertEquals(stored.Motherboard.serverSpecs.status, "verified", label);
    assertEquals(result.body.authoritativePrice, TOTAL, label);
  }
  // Shopify's own shape, nulls included, is read; an empty list is a product with no values.
  assertEquals(readSpecMetafields({ metafields: good() })?.length, 1);
  assertEquals(readSpecMetafields({ metafields: [] }), []);
});

// ── 10, 11, 12. Slot classification is unchanged ─────────────────────────────────────────────────────

Deno.test("S4S2-14: a part placed only by its title has no verified value, and stays with a technician", async () => {
  const result = await send(
    { parts: parts() },
    { answer: { [V("cpu")]: productAs({ category: null }) } },
  );
  assertEquals(result.status, 200);
  assertEquals(result.body.technicianReviewRequired, true);
  const cpu = result.calls.inserted[0].parts.CPU;
  assertEquals(cpu.slotCheck, "title");
  assertEquals(cpu.serverSpecs.slotBasis, "title");
  assertEquals(cpu.serverSpecs.status, "uncertain");
  // The registry's values are still recorded, with their source, but none counts as verified on a provisional slot.
  assertEquals(field(cpu.serverSpecs, "socket").confidence, "manufacturer_verified");
  assertEquals(
    cpu.serverSpecs.fields.filter((entry: any) => entry.status === "verified"),
    [],
  );
  // Unconfirmed altogether: likewise.
  const unknown = resolveOne("CPU", PRODUCTS[V("cpu")], undefined, {
    kind: "unknown",
    reason: "no_signal",
  }).record;
  assertEquals(unknown.slotBasis, "unconfirmed");
  assertEquals(unknown.status, "uncertain");
});

Deno.test("S4S2-15: Shopify's category or IT HUB's tags confirm the slot, so verified values count", async () => {
  const byCategory = await send({ parts: parts() });
  assertEquals(byCategory.body.technicianReviewRequired, false);
  assertEquals(byCategory.calls.inserted[0].parts.CPU.serverSpecs.slotBasis, "shopify_fields");
  assertEquals(byCategory.calls.inserted[0].parts.CPU.serverSpecs.status, "verified");

  const byTag = await send(
    { parts: parts() },
    { answer: { [V("cpu")]: productAs({ category: null, tags: ["cpu"] }) } },
  );
  assertEquals(byTag.calls.inserted[0].parts.CPU.slotCheck, "shopify_fields");
  assertEquals(byTag.calls.inserted[0].parts.CPU.serverSpecs.status, "verified");
  assertEquals(byTag.body.technicianReviewRequired, false);
});

Deno.test("S4S2-16: a product Shopify files under another part is refused, whatever its metafields say", async () => {
  const cpuValues = specMetafields({ socket: "AM5", watts: "65", ...REVIEWED });
  for (const [label, slot, product] of [
    [
      "a cable with processor values",
      "CPU",
      { title: "HDMI Cable 2m", category: { name: "Audio & Video Cables" } },
    ],
    [
      "a board as the processor",
      "CPU",
      { title: "B650 board", category: { name: "Motherboards" } },
    ],
    [
      "a phone as the drive",
      "Storage",
      { title: "Galaxy A15", category: { name: "Smart Phones" } },
    ],
  ] as [string, string, Record<string, unknown>][]) {
    const variant = parts()[slot].variantId;
    const result = await send(
      { parts: parts() },
      { answer: { [variant]: productAs({ ...product, metafields: cpuValues }) } },
    );
    assertEquals(result.status, 400, label);
    assertEquals(result.body.error, MESSAGE_UNREADABLE, label);
    assertEquals(result.body.problems, [{ code: "variant_wrong_slot", slot }], label);
    assertEquals(result.calls.inserted.length, 0, label);
  }
});

// ── 13. Provenance ───────────────────────────────────────────────────────────────────────────────────

Deno.test("S4S2-17: every stored part says what was resolved, its value, where it came from and for which product", async () => {
  const result = await send({ parts: parts() });
  const stored = result.calls.inserted[0].parts;
  for (const [slot, part] of Object.entries(stored) as [string, any][]) {
    const record = part.serverSpecs;
    assertEquals(record.resolvedBy, "server", slot);
    assertEquals(record.stage, "4S-2", slot);
    assertEquals(record.variantId, part.variantId, slot);
    assertEquals(record.productId, PRODUCTS[part.variantId].id, slot);
    for (const entry of record.fields) {
      const label = `${slot}.${entry.field}`;
      assert(
        ["verified", "uncertain", "missing", "conflicting", "invalid"].includes(entry.status),
        label,
      );
      if ("value" in entry) {
        assert(["verified", "uncertain"].includes(entry.status), label);
        assert(
          ["code_registry", "shopify_metafield", "product_title"].includes(entry.origin),
          `${label}: ${entry.origin}`,
        );
        if (entry.origin === "shopify_metafield") assert(entry.metafield, label);
      } else {
        assertEquals(entry.origin, undefined, label);
        assertEquals(entry.confidence, "unknown", label);
      }
    }
  }
  // The record is plain JSON, as stored in pc_builds.parts.
  assertEquals(JSON.parse(JSON.stringify(stored.CPU.serverSpecs)), stored.CPU.serverSpecs);
  // The response to the customer is unchanged: no specification detail is sent back.
  assertEquals(Object.keys(result.body).sort(), [
    "authoritativePrice",
    "buildId",
    "clientEstimatedPrice",
    "isGuest",
    "priceDivergence",
    "referenceId",
    "success",
    "technicianReviewRequired",
    "userId",
  ]);
});

Deno.test("S4S2-18: owned parts aren't resolved; Stage 4S-3 gets only server-resolved parts", async () => {
  const result = await send({
    parts: { ...parts(), RAM: { owned: true } },
    estimatedPrice: TOTAL - 3000,
  });
  assertEquals("serverSpecs" in result.calls.inserted[0].parts.RAM, false);

  const resolved = resolveOne("CPU", PRODUCTS[V("cpu")]);
  const unresolved = {
    slot: "Motherboard",
    record: unresolvedSpecRecord("shopify_unavailable", V("board")),
    component: null,
  };
  const components = serverBuildComponents([resolved, unresolved]);
  assertEquals(Object.keys(components), ["CPU"]);
  assertEquals(components.CPU?.specs.socket, "AM5");
});

// ── 14. Generated module consistency ─────────────────────────────────────────────────────────────────

Deno.test("S4S2-19: the server asks Shopify for exactly the pc_builder keys the storefront reads", () => {
  const storefront = Deno.readTextFileSync("src/lib/shopify.ts");
  const keys = new Set(
    [...storefront.matchAll(/\{ namespace: "pc_builder", key: "([a-z0-9_]+)" \}/g)].map(
      (m) => m[1],
    ),
  );
  assertEquals([...SPEC_METAFIELD_KEYS].sort(), [...keys].sort());
  for (const key of SPEC_METAFIELD_KEYS) {
    assert(VARIANT_QUERY.includes(`{ namespace: "pc_builder", key: "${key}" }`), key);
  }
  // The reviewer's name stays out of the public API.
  assertEquals(SPEC_METAFIELD_KEYS.includes("spec_reviewed_by"), false);
  assertEquals(
    PC_BUILDER_METAFIELDS.filter((f: any) => f.storefront === "public").length,
    SPEC_METAFIELD_KEYS.length,
  );
});

Deno.test("S4S2-20: the moved readers are the storefront's own, and the server's copy resolves as the source", () => {
  // shopify-schema.ts and catalog.ts export the moved functions themselves, not copies.
  for (const name of [
    "parseProductSpecs",
    "tagSpecKeys",
    "specUpdatedTimes",
    "toVariantGid",
    "parseShopifyGid",
  ]) {
    assertEquals((shopifySchema as any)[name], (shopifyFields as any)[name], name);
  }
  // On every golden catalogue listing, in every slot it could be sent in, the generated server copy resolves the
  // part exactly as the source, and as the storefront's matchShopifyProductToComponent.
  let checked = 0;
  for (const make of Object.values(GOLDEN_CATALOGUES)) {
    for (const product of (make as () => any[])()) {
      for (const slot of Object.keys(SLOT_CATEGORY)) {
        const strip = (component: any) => component && { ...component, retrievedAt: undefined };
        const fromSource = strip(sourceRegistry.resolveShopifyComponent(product, slot as any));
        assertEquals(
          strip(serverRegistry.resolveShopifyComponent(product, slot as any)),
          fromSource,
          `${product.name} in ${slot}`,
        );
        assertEquals(strip(matchShopifyProductToComponent(product, slot as any)), fromSource);
        checked++;
      }
    }
  }
  assert(checked > 500, `only ${checked} checked`);
  assertEquals(serverRegistry.VERIFIED_HARDWARE_SPECS, sourceRegistry.VERIFIED_HARDWARE_SPECS);
});

// ── 15. Same part, same specifications: the storefront and the server agree ─────────────────────────

/** The storefront's catalogue node for a test listing, as its catalogue query returns it. */
function storefrontNode(variantId: string, product: any, metafields: unknown[]) {
  return {
    ...product,
    handle: "test-listing",
    description: "",
    vendor: "",
    availableForSale: true,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: variantId,
            title: "Default Title",
            availableForSale: true,
            price: { amount: "1000.00", currencyCode: "INR" },
          },
        },
      ],
    },
    metafields,
  };
}

Deno.test("S4S2-21: the server resolves each test listing's specifications exactly as the storefront does", () => {
  const listings: [string, any][] = [
    ...Object.entries(PRODUCTS).map(([id, product]) => [id, product] as [string, any]),
    [V("x1"), listing("CPU", "AMD Ryzen 5 7600", { socket: "AM4" })],
    [V("x2"), listing("Motherboard", "IT-HUB Test Board AM4 Edition", { socket: "AM5" })],
    [V("x3"), listing("GPU", "IT-HUB Test Card RTX 4060", { gpu_length_mm: "long" })],
    [
      V("x4"),
      listing("Motherboard", "IT-HUB Test Board TB-4", {
        socket: "AM5",
        spec_review_status: "rejected",
      }),
    ],
    [
      V("x5"),
      { ...listing("RAM", "IT-HUB Test Memory 2 x 8GB DDR4"), tags: ["Socket:AM5", "ram"] },
    ],
    [
      V("x6"),
      listing("Cooler", "IT-HUB Test Cooler TK-1", {
        supported_sockets: '["AM4","AM5"]',
        cooler_height_mm: "155",
        ...REVIEWED,
      }),
    ],
  ];
  for (const [variantId, product] of listings) {
    const slot = Object.entries(SLOT_CATEGORY).find(
      ([, name]) => name === product.category?.name,
    )![0];
    const browserProduct = shopifySchema.mapShopifyProductToCatalog(
      storefrontNode(variantId, product, product.metafields) as any,
    );
    const browser = matchShopifyProductToComponent(browserProduct, slot as any);
    const server = resolveOne(slot, product).component;
    assert(browser && server, product.title);
    assertEquals(server.specs, browser.specs, product.title);
    assertEquals(server.isVerified, browser.isVerified, product.title);
    assertEquals(server.matchedModelKey, browser.matchedModelKey, product.title);
  }
});
