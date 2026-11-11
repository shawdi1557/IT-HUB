// Stage 4A-6: structural checks in the quotation Edge Function. The server refuses a request the builder can't have
// made: an unknown or repeated slot, a part to buy with no valid variant, an owned part where ownership isn't
// offered, the same variant twice, malformed fields, an oversized body, or a build missing an essential part.
//
// These are structural checks only. They read no specification and decide nothing about compatibility: a request
// that passes them is still only as trustworthy as the browser that sent it, until Stage 4S. Shopify and the
// database are stubbed; nothing is submitted anywhere. Every ID and price is made up.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GOLDEN_CATALOGUES } from "./_helpers/stage3-golden.ts";
import { specMetafields, storefrontProduct, withEssentials } from "./_helpers/quote-structure.ts";

const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");
const {
  checkQuotationStructure,
  ownedQuotePart,
  quantityPriceable,
  QUOTE_SLOTS,
  QUOTE_ESSENTIAL_SLOTS,
  QUOTE_OWNABLE_SLOTS,
  QUOTE_MAX_QUANTITY,
  MAX_BODY_BYTES,
  MESSAGE_UNREADABLE,
  MESSAGE_TOO_LARGE,
  messageMissingParts,
} = await import("../verify-and-submit-pc-quotation/structure.ts");
const { COMPONENT_SLOTS, ESSENTIAL_SLOTS } = await import("../../../src/lib/builder/slots.ts");
const { ownedPartRecord, submitQuotationRequest } =
  await import("../../../src/lib/builder/persistence.ts");
const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { generateCatalogOffer } = await import("../../../src/lib/builder/recommendations.ts");
const { compatibility, toCanonicalComponent } =
  await import("../../../src/lib/builder/compatibility.ts");
const { assessBuild } = await import("../../../src/lib/builder/completeness.ts");

// ── A stubbed server ───────────────────────────────────────────────────────────────────────────────

const V = (id: string) => `gid://shopify/ProductVariant/${id}`;

/** A complete build as the page sends it: six essentials, each a real-looking variant. */
const completeParts = (): Record<string, any> => ({
  CPU: {
    slot: "CPU",
    variantId: V("s6-cpu"),
    title: "Processor",
    name: "Processor",
    price: 15000,
    quantity: 1,
  },
  Motherboard: {
    slot: "Motherboard",
    variantId: V("s6-board"),
    title: "Board",
    price: 9000,
    quantity: 1,
  },
  RAM: { slot: "RAM", variantId: V("s6-ram"), title: "Memory", price: 3000, quantity: 1 },
  Storage: { slot: "Storage", variantId: V("s6-ssd"), title: "Drive", price: 4000, quantity: 1 },
  PSU: { slot: "PSU", variantId: V("s6-psu"), title: "Supply", price: 3500, quantity: 1 },
  Cabinet: { slot: "Cabinet", variantId: V("s6-case"), title: "Case", price: 2500, quantity: 1 },
});
const COMPLETE_TOTAL = 15000 + 9000 + 3000 + 4000 + 3500 + 2500;

const PRICES: Record<string, string> = {
  [V("s6-cpu")]: "15000.00",
  [V("s6-board")]: "9000.00",
  [V("s6-ram")]: "3000.00",
  [V("s6-ssd")]: "4000.00",
  [V("s6-psu")]: "3500.00",
  [V("s6-case")]: "2500.00",
  [V("s6-gpu")]: "28000.00",
  [V("s6-cooler")]: "1500.00",
};

/** Which slot each test variant is a part for, so Shopify's answer files it under that slot's category. */
const SLOT_OF: Record<string, string> = {
  [V("s6-cpu")]: "CPU",
  [V("s6-board")]: "Motherboard",
  [V("s6-ram")]: "RAM",
  [V("s6-ssd")]: "Storage",
  [V("s6-psu")]: "PSU",
  [V("s6-case")]: "Cabinet",
  [V("s6-gpu")]: "GPU",
  [V("s6-cooler")]: "Cooler",
};

interface ServerOptions {
  /** Replaces Shopify's answer. Defaults to every known variant on sale at its price. */
  nodes?: (ids: string[]) => any;
  allowed?: boolean;
  authenticated?: boolean;
  priceOf?: Record<string, string>;
  /** Shopify's product for each variant. Defaults to one filed under the test variant's slot category. */
  productOf?: Record<string, any>;
}

/** The handler with Shopify, sign-in, the rate limiter and the table stubbed, recording what each was asked. */
async function send(
  body: unknown,
  options: ServerOptions = {},
  headers: Record<string, string> = {},
) {
  const calls = { shopify: 0, rateLimit: 0, inserted: [] as any[] };
  const prices = options.priceOf || PRICES;
  const client = {
    auth: {
      getUser: async () =>
        options.authenticated === false
          ? { data: { user: null }, error: new Error("invalid") }
          : { data: { user: { id: "00000000-0000-0000-0000-0000000004a6" } }, error: null },
    },
    rpc: async () => {
      calls.rateLimit++;
      return { data: options.allowed ?? true, error: null };
    },
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: async () => ({ data: [], error: null }),
        insert: (row: any) => {
          calls.inserted.push(row);
          return {
            select: () => ({ single: async () => ({ data: { id: "s6-row" }, error: null }) }),
          };
        },
      };
      return query;
    },
  };
  const shopifyFetch = async (_query: string, vars: { ids: string[] }) => {
    calls.shopify++;
    if (options.nodes) return options.nodes(vars.ids);
    return {
      data: {
        nodes: vars.ids.map((id) =>
          prices[id]
            ? {
                id,
                // Stage 4S-1: filed under its slot's category, as the store does.
                product:
                  options.productOf?.[id] ??
                  storefrontProduct(SLOT_OF[id] ?? "CPU", `Shopify ${id.split("/").pop()}`),
                price: { amount: prices[id], currencyCode: "INR" },
                availableForSale: true,
              }
            : null,
        ),
      },
    };
  };
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer s6-customer-token",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { supabaseClient: client as any, shopifyFetch },
  );
  return { status: res.status, body: await res.json(), calls };
}

const request = (parts: unknown, extra: Record<string, unknown> = {}) => ({
  buildName: "S6 build",
  estimatedPrice: COMPLETE_TOTAL,
  compatibility: { status: "compatible" },
  customerInfo: { name: "S6 tester" },
  parts,
  ...extra,
});

/** A refused request: the status and code, and neither Shopify nor the table was reached. */
function assertRefused(
  result: Awaited<ReturnType<typeof send>>,
  status: number,
  code: string,
  problem: string | undefined,
  label: string,
) {
  assertEquals(result.status, status, `${label}: ${JSON.stringify(result.body)}`);
  assertEquals(result.body.success, false, label);
  assertEquals(result.body.code, code, label);
  if (problem) {
    assert(
      result.body.problems.some((p: any) => p.code === problem),
      `${label}: expected ${problem} in ${JSON.stringify(result.body.problems)}`,
    );
  }
  assertEquals(result.calls.shopify, 0, `${label}: Shopify was asked`);
  assertEquals(result.calls.inserted.length, 0, `${label}: something was stored`);
}

// ── The server's lists match the builder's ─────────────────────────────────────────────────────────

Deno.test("S4A-S1: the server's slots, essentials, quantities and owned records match the builder's", () => {
  assertEquals([...QUOTE_SLOTS].sort(), COMPONENT_SLOTS.map((slot: any) => slot.id).sort());
  assertEquals(QUOTE_ESSENTIAL_SLOTS, [...ESSENTIAL_SLOTS]);
  for (const slot of COMPONENT_SLOTS as any[]) {
    assertEquals(QUOTE_MAX_QUANTITY[slot.id], slot.maxQuantity, slot.id);
  }
  // The slots `assessBuild` accepts as the customer's own, read from its source.
  const completeness = Deno.readTextFileSync("src/lib/builder/completeness.ts");
  const match = completeness.match(/OWNABLE_SLOTS = new Set<ComponentSlotId>\(\[([^\]]*)\]\)/);
  assert(match, "OWNABLE_SLOTS not found in completeness.ts");
  const ownable = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assertEquals([...QUOTE_OWNABLE_SLOTS].sort(), ownable.sort());
  // An owned part is stored exactly as the browser makes it.
  for (const slot of QUOTE_OWNABLE_SLOTS)
    assertEquals<unknown>(ownedQuotePart(slot), ownedPartRecord(slot));
  // CaseFans is a type in the builder, but no screen offers it, so no quotation can hold one.
  assert(!(QUOTE_SLOTS as readonly string[]).includes("CaseFans"));
});

// ── Every request the page can make still goes through ─────────────────────────────────────────────

Deno.test("S4A-S2: every Find My PC build, sent as the page sends it, passes and prices exactly", async () => {
  let checked = 0;
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const listings = make() as any[];
    const catalogue = syncBuilderCatalogWithShopify(listings).componentCatalog;
    const prices: Record<string, string> = {};
    // Stage 4S-1: Shopify answers each variant with the listing's own product data, so the server places each part
    // by the same fields the builder placed it by.
    const productOf: Record<string, any> = {};
    for (const listing of listings) {
      productOf[listing.variantId] = {
        id: listing.id,
        title: listing.name,
        productType: listing.productType ?? "",
        tags: listing.tags ?? [],
        category: listing.category ? { name: listing.category } : null,
        collections: { edges: [] },
        // Stage 4S-3: the listing's own pc_builder values, so the server resolves and judges the build itself.
        metafields: specMetafields(listing.specs || {}),
      };
    }
    for (const items of Object.values(catalogue) as any[][]) {
      for (const item of items || [])
        if (item.variantId) prices[item.variantId] = `${item.price}.00`;
    }
    for (const purpose of [
      "gaming",
      "creation",
      "work",
      "programming",
      "professional",
      "general",
    ]) {
      for (const owned of [[], ["GPU"]]) {
        for (const [min, max] of [
          [40000, 60000],
          [80000, 100000],
          [150000, 300000],
        ]) {
          const offer = generateCatalogOffer(
            catalogue,
            { purpose, brands: [], ...(owned.length ? { owned } : {}) },
            { min, max },
            { allowUnverified: true },
          );
          for (const build of offer.builds as any[]) {
            const ownedSlots = build.owned || [];
            const checks = compatibility(build.parts, { ownedSlots });
            const components: Record<string, any> = {};
            for (const [slot, part] of Object.entries(build.parts)) {
              if (part) components[slot] = toCanonicalComponent(slot, part as any);
            }
            const assessment = assessBuild(components as any, checks.summary, {
              ownedSlots,
              purpose,
            } as any);
            if (!assessment.quotationReady) continue;
            let server: Awaited<ReturnType<typeof send>> | undefined;
            const client = {
              auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
              functions: {
                invoke: async (_name: string, { body }: any) => {
                  server = await send(body, { priceOf: prices, productOf });
                  return { data: server.body, error: null };
                },
              },
            };
            const result = await submitQuotationRequest(
              {
                id: "s6",
                name: "S6",
                mode: "guided",
                currency: "INR",
                components,
                compatibility: checks.summary,
                ownedSlots,
              } as any,
              {},
              { supabaseClient: client },
              // As the page sends it from a Find My PC build (decision S3-B).
              { purpose },
            );
            const where = `${name} ${purpose} ${owned} ${min}-${max}`;
            assertEquals(server?.status, 200, `${where}: ${JSON.stringify(server?.body)}`);
            assert(result.success, where);
            // Stage 4S-3: the server reaches the same verdict as the page, for the same use (decision S3-B), from
            // the parts it resolved itself.
            const verdict = server!.calls.inserted[0].compatibility.serverAssessment;
            assertEquals(verdict.state, assessment.state, where);
            assertEquals(verdict.purpose, purpose, where);
            assertEquals(
              server!.body.technicianReviewRequired,
              assessment.state !== "complete" || ownedSlots.length > 0,
              where,
            );
            assertEquals(result.priceDivergence, 0, where);
            assert(server!.body.authoritativePrice > 0, where);
            checked++;
          }
        }
      }
    }
  }
  assert(checked > 100, `only ${checked} builds checked`);
});

Deno.test("S4A-S3: a complete build is accepted, priced from Shopify and stored keyed by slot", async () => {
  const result = await send(request(completeParts()));
  assertEquals(result.status, 200);
  assertEquals(result.body.authoritativePrice, COMPLETE_TOTAL);
  assertEquals(result.body.priceDivergence, 0);
  assertEquals(result.calls.rateLimit, 1);
  const row = result.calls.inserted[0];
  assertEquals(Object.keys(row.parts), ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"]);
  assertEquals(row.parts.CPU.title, "Shopify s6-cpu");
  assertEquals(row.parts.CPU.price, 15000);
  assertEquals(row.compatibility.reportedBy, "customer_browser");
});

Deno.test("S4A-S4: the same build sent as a list, or with its slots in any order, is stored the same way", async () => {
  const keyed = await send(request(completeParts()));
  const listed = await send(request(Object.values(completeParts()).reverse()));
  assertEquals(listed.status, 200);
  assertEquals(listed.calls.inserted[0].parts, keyed.calls.inserted[0].parts);
  assertEquals(listed.body.authoritativePrice, COMPLETE_TOTAL);
});

// ── Missing essentials ─────────────────────────────────────────────────────────────────────────────

Deno.test("S4A-S5: a build missing any essential part is refused with 422, naming what's missing", async () => {
  for (const slot of QUOTE_ESSENTIAL_SLOTS) {
    const parts = completeParts();
    delete parts[slot];
    const result = await send(request(parts));
    assertRefused(result, 422, "incomplete_build", "missing_essential", `without ${slot}`);
    assertEquals(result.body.missingSlots, [slot]);
    assertEquals(result.body.error, messageMissingParts([slot]));
  }
  // A processor alone: the gap the 4A audit found.
  const alone = await send(request({ CPU: completeParts().CPU }));
  assertRefused(alone, 422, "incomplete_build", "missing_essential", "processor alone");
  assertEquals(alone.body.missingSlots, ["Motherboard", "RAM", "Storage", "PSU", "Cabinet"]);
  assertEquals(
    alone.body.error,
    "This build is missing parts a quotation needs: motherboard, memory (RAM), storage, power supply, cabinet. Please choose them and try again.",
  );
  for (const empty of [{}, []]) {
    const none = await send(request(empty));
    assertRefused(none, 422, "incomplete_build", "missing_essential", "no parts");
    assertEquals(none.body.missingSlots, QUOTE_ESSENTIAL_SLOTS);
  }
  // An empty slot is the same as a missing one.
  const nulled = await send(request({ ...completeParts(), PSU: null }));
  assertEquals(nulled.body.missingSlots, ["PSU"]);
});

Deno.test("S4A-S6: owned memory or storage fills its slot; a graphics card or cooler is never required here", async () => {
  const parts = completeParts();
  delete parts.RAM;
  delete parts.Storage;
  const owned = await send(
    request(
      { ...parts, RAM: { owned: true }, Storage: { owned: true }, GPU: { owned: true } },
      {
        estimatedPrice: COMPLETE_TOTAL - 7000,
      },
    ),
  );
  assertEquals(owned.status, 200, JSON.stringify(owned.body));
  // Nothing on the server can check a customer's own part.
  assertEquals(owned.body.technicianReviewRequired, true);
  assertEquals(owned.body.authoritativePrice, COMPLETE_TOTAL - 7000);
  // No graphics card and no cooler: whether either is needed depends on specifications the server doesn't
  // have. That's Stage 4S, so the structure check lets the build through and decides nothing about it.
  const bare = await send(request(completeParts()));
  assertEquals(bare.status, 200);
});

// ── Malformed requests ─────────────────────────────────────────────────────────────────────────────

Deno.test("S4A-S7: a body that isn't a JSON object is refused with 400", async () => {
  for (const [label, raw] of [
    ["not JSON", "{ parts: "],
    ["empty", ""],
    ["a list", "[]"],
    ["a string", '"build"'],
    ["null", "null"],
    ["a number", "42"],
  ]) {
    const result = await send(raw);
    assertRefused(result, 400, "invalid_request", undefined, label);
    assertEquals(result.body.error, MESSAGE_UNREADABLE, label);
  }
  for (const parts of [undefined, "CPU", 5, true]) {
    const result = await send(request(parts));
    assertRefused(result, 400, "invalid_request", "parts_missing", `parts ${parts}`);
  }
});

Deno.test("S4A-S8: an unknown, mismatched or repeated slot is refused", async () => {
  for (const slot of ["CaseFans", "Keyboard", "cpu", "__proto__", "constructor", ""]) {
    // A computed key is an own property, so `__proto__` reaches the server as an ordinary JSON key.
    const parts = { ...completeParts(), [slot]: { variantId: V("s6-gpu"), price: 1 } };
    const result = await send(JSON.stringify(request(parts)));
    assertRefused(result, 400, "invalid_request", "unknown_slot", `slot "${slot}"`);
  }
  const mismatched = await send(
    request({ ...completeParts(), GPU: { slot: "Cooler", variantId: V("s6-gpu"), price: 28000 } }),
  );
  assertRefused(mismatched, 400, "invalid_request", "slot_mismatch", "slot mismatch");

  const listed = Object.values(completeParts());
  const twice = await send(request([...listed, { ...listed[0], variantId: V("s6-gpu") }]));
  assertRefused(twice, 400, "invalid_request", "duplicate_slot", "two processors");

  const noSlot = await send(request([...listed, { variantId: V("s6-gpu"), price: 1 }]));
  assertRefused(noSlot, 400, "invalid_request", "unknown_slot", "a listed part with no slot");
});

Deno.test("S4A-S9: more parts than the builder has slots are refused", async () => {
  const listed = Object.values(completeParts());
  const many = [
    ...listed,
    ...listed.map((part, i) => ({ ...part, variantId: V(`s6-extra-${i}`) })),
  ];
  assert(many.length > 10);
  const result = await send(request(many));
  assertRefused(result, 400, "invalid_request", "too_many_parts", "12 parts");
});

Deno.test("S4A-S10: a part to buy needs a well-formed variant, used once", async () => {
  for (const [label, variantId, problem] of [
    ["missing", undefined, "variant_missing"],
    ["null", null, "variant_missing"],
    ["empty", "", "variant_missing"],
    ["short", "v1", "variant_malformed"],
    ["a product ID", "gid://shopify/Product/123", "variant_malformed"],
    ["a number", 123, "variant_malformed"],
    ["with spaces", "gid://shopify/ProductVariant/1 OR 1=1", "variant_malformed"],
    ["over-long", V("x".repeat(65)), "variant_malformed"],
    ["another shop's form", "https://shop.example/variants/1", "variant_malformed"],
  ] as [string, unknown, string][]) {
    const parts = completeParts();
    parts.CPU = { ...parts.CPU, variantId };
    if (variantId === undefined) delete parts.CPU.variantId;
    const result = await send(request(parts));
    assertRefused(result, 400, "invalid_request", problem, `variant ${label}`);
  }
  const reused = await send(
    request({ ...completeParts(), GPU: { variantId: V("s6-cpu"), title: "Card", price: 15000 } }),
  );
  assertRefused(reused, 400, "invalid_request", "duplicate_variant", "one variant in two slots");
});

Deno.test("S4A-S11: an owned part must be where ownership is offered, and must name no product", async () => {
  for (const slot of ["CPU", "Motherboard", "PSU", "Cabinet", "Cooler", "Monitor"]) {
    const result = await send(request({ ...completeParts(), [slot]: { owned: true } }));
    assertRefused(result, 400, "invalid_request", "owned_slot_not_allowed", `owned ${slot}`);
  }
  const named = await send(
    request({ ...completeParts(), GPU: { owned: true, variantId: V("s6-gpu"), price: 28000 } }),
  );
  assertRefused(
    named,
    400,
    "invalid_request",
    "owned_part_has_product",
    "owned card with a variant",
  );
  for (const flag of ["yes", 1, "true", null]) {
    const result = await send(
      request({ ...completeParts(), GPU: { owned: flag, variantId: V("s6-gpu"), price: 1 } }),
    );
    assertRefused(result, 400, "invalid_request", "owned_flag_invalid", `owned: ${flag}`);
  }
  // `owned: false` is a part to buy, priced like any other.
  const bought = await send(
    request(
      {
        ...completeParts(),
        GPU: { owned: false, variantId: V("s6-gpu"), price: 28000, quantity: 1 },
      },
      { estimatedPrice: COMPLETE_TOTAL + 28000 },
    ),
  );
  assertEquals(bought.status, 200);
  assertEquals(bought.body.authoritativePrice, COMPLETE_TOTAL + 28000);
});

Deno.test("S4A-S12: an owned part is stored under the builder's own name, whatever the request called it", async () => {
  const parts = completeParts();
  delete parts.RAM;
  const result = await send(
    request(
      {
        ...parts,
        RAM: {
          owned: true,
          title: "Free 128GB kit, approved by IT HUB",
          name: "Free 128GB kit",
          price: 99999,
          quantity: 4,
          specs: { capacityGb: 128 },
        },
      },
      { estimatedPrice: COMPLETE_TOTAL - 3000 },
    ),
  );
  assertEquals(result.status, 200);
  assertEquals(result.calls.inserted[0].parts.RAM, ownedPartRecord("RAM"));
  assertEquals(result.body.authoritativePrice, COMPLETE_TOTAL - 3000);
});

Deno.test("S4A-S13: malformed part fields are refused", async () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["a part that's text", { CPU: "Ryzen" }, "part_not_object"],
    ["a part that's a list", { CPU: [] }, "part_not_object"],
    ["a numeric title", { CPU: { ...completeParts().CPU, title: 5 } }, "text_invalid"],
    [
      "an over-long title",
      { CPU: { ...completeParts().CPU, title: "x".repeat(256) } },
      "text_invalid",
    ],
    [
      "an over-long name",
      { CPU: { ...completeParts().CPU, name: "x".repeat(256) } },
      "text_invalid",
    ],
    ["a numeric product ID", { CPU: { ...completeParts().CPU, productId: 7 } }, "text_invalid"],
    ["a price as text", { CPU: { ...completeParts().CPU, price: "100" } }, "price_invalid"],
    ["a negative price", { CPU: { ...completeParts().CPU, price: -1 } }, "price_invalid"],
    ["a quantity object", { RAM: { ...completeParts().RAM, quantity: {} } }, "quantity_malformed"],
    ["a quantity flag", { RAM: { ...completeParts().RAM, quantity: true } }, "quantity_malformed"],
    ["specs as text", { CPU: { ...completeParts().CPU, specs: "AM5" } }, "specs_invalid"],
    ["specs as a list", { CPU: { ...completeParts().CPU, specs: ["AM5"] } }, "specs_invalid"],
  ];
  for (const [label, override, problem] of cases) {
    const result = await send(request({ ...completeParts(), ...override }));
    assertRefused(result, 400, "invalid_request", problem, label);
  }
  // A 255-character title is Shopify's limit, so it's allowed.
  const longest = await send(
    request({ ...completeParts(), CPU: { ...completeParts().CPU, title: "x".repeat(255) } }),
  );
  assertEquals(longest.status, 200);
});

Deno.test("S4A-S14: malformed request fields are refused; a long build name is shortened as before", async () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["a total as text", { estimatedPrice: "9000" }, "estimated_price_invalid"],
    ["a negative total", { estimatedPrice: -5 }, "estimated_price_invalid"],
    ["a null total", { estimatedPrice: null }, "estimated_price_invalid"],
    ["a numeric name", { buildName: 12 }, "build_name_invalid"],
    ["compatibility as text", { compatibility: "compatible" }, "compatibility_invalid"],
    ["compatibility as a list", { compatibility: ["compatible"] }, "compatibility_invalid"],
    ["customer details as text", { customerInfo: "me" }, "customer_info_invalid"],
    ["a numeric customer name", { customerInfo: { name: 5 } }, "customer_info_invalid"],
    [
      "an over-long email",
      { customerInfo: { email: `${"a".repeat(250)}@x.in` } },
      "customer_info_invalid",
    ],
    ["an over-long phone", { customerInfo: { phone: "9".repeat(33) } }, "customer_info_invalid"],
  ];
  for (const [label, extra, problem] of cases) {
    const result = await send(request(completeParts(), extra));
    assertRefused(result, 400, "invalid_request", problem, label);
  }
  const named = await send(request(completeParts(), { buildName: "N".repeat(500) }));
  assertEquals(named.status, 200);
  assertEquals(named.calls.inserted[0].name, "N".repeat(120));
  // Absent optional fields take their defaults, as before.
  const bare = await send({ parts: completeParts() });
  assertEquals(bare.status, 200);
  assertEquals(bare.calls.inserted[0].name, "Custom PC Build");
  assertEquals(bare.body.technicianReviewRequired, true);
});

Deno.test("S4A-S15: an oversized body is refused with 413 before it's read as a build", async () => {
  const padded = request({
    ...completeParts(),
    CPU: { ...completeParts().CPU, specs: { notes: "x".repeat(MAX_BODY_BYTES) } },
  });
  const result = await send(padded);
  assertRefused(result, 413, "request_too_large", undefined, "oversized body");
  assertEquals(result.body.error, MESSAGE_TOO_LARGE);
  // A declared length over the limit is refused without reading the body.
  const declared = await send(
    request(completeParts()),
    {},
    {
      "Content-Length": String(MAX_BODY_BYTES + 1),
    },
  );
  assertEquals(declared.status, 413);
  // The largest real build is about 5 KB: far inside the limit.
  assert(JSON.stringify(request(completeParts())).length < MAX_BODY_BYTES / 20);
});

Deno.test("S4A-S16: extra fields in a part are dropped, and browser specifications are kept only as a note", async () => {
  const parts = completeParts();
  parts.CPU = {
    ...parts.CPU,
    specs: { socket: "AM5" },
    technician_review_required: false,
    authoritative_price: 1,
    owned_by: "someone else",
  };
  const result = await send(request(parts));
  assertEquals(result.status, 200);
  const stored = result.calls.inserted[0].parts.CPU;
  // Quantity is stored because every part to buy must now state one (Stage 4A closure).
  assertEquals(Object.keys(stored).sort(), [
    "isShopifyLive",
    "name",
    "price",
    "productId",
    "quantity",
    "serverSpecs",
    "slot",
    "slotCheck",
    "specs",
    "title",
    "variantId",
  ]);
  assertEquals(stored.specs, { socket: "AM5" });
  // Stage 4S-1: the server records how Shopify placed the product, here by its category.
  assertEquals(stored.slotCheck, "shopify_fields");
  // Stage 4S-2: the server's own specifications sit beside the browser's. Shopify's reviewed listing says AM4, so
  // that's the server's value: the browser's "AM5" is only noted as a difference, never taken as the value.
  assertEquals(stored.serverSpecs.resolvedBy, "server");
  const socket = stored.serverSpecs.fields.find((field: any) => field.field === "socket");
  assertEquals(socket.status, "verified");
  assertEquals(socket.value, "AM4");
  assertEquals(
    stored.serverSpecs.browserDifferences.find((d: any) => d.field === "socket"),
    { field: "socket", browser: "AM5", server: "AM4" },
  );
  // The stored review flag and price are the server's, not the part's.
  assertEquals(result.calls.inserted[0].authoritative_price, COMPLETE_TOTAL);
});

// ── Order of checks ────────────────────────────────────────────────────────────────────────────────

Deno.test("S4A-S17: sign-in is checked first, then the rate limit, then the structure", async () => {
  const unsigned = await send("{ not json", { authenticated: false });
  assertEquals(unsigned.status, 401);
  assertEquals(unsigned.calls.rateLimit, 0);
  const limited = await send(request({ CPU: completeParts().CPU }), { allowed: false });
  assertEquals(limited.status, 429);
  // A refused request still counts against the limit, so probing the checks costs the same as submitting.
  const refused = await send(request({ CPU: completeParts().CPU }));
  assertEquals(refused.status, 422);
  assertEquals(refused.calls.rateLimit, 1);
});

// ── Unavailable and unknown parts ──────────────────────────────────────────────────────────────────

Deno.test("S4A-S18: a variant Shopify doesn't know, or can't price, stops the quotation like a sold-out part", async () => {
  const unknown = await send(request(completeParts()), {
    priceOf: { ...PRICES, [V("s6-psu")]: "" },
  });
  assertEquals(unknown.status, 409);
  assertEquals(unknown.body.unavailableParts, ["PSU"]);
  assertEquals(unknown.calls.inserted.length, 0);

  const unpriced = await send(request(completeParts()), {
    nodes: (ids) => ({
      data: {
        nodes: ids.map((id) => ({
          id,
          price: id === V("s6-case") ? null : { amount: PRICES[id] },
          availableForSale: true,
        })),
      },
    }),
  });
  assertEquals(unpriced.status, 409);
  assertEquals(unpriced.body.unavailableParts, ["Cabinet"]);

  const soldOut = await send(request(completeParts()), {
    nodes: (ids) => ({
      data: {
        nodes: ids.map((id) => ({
          id,
          price: { amount: PRICES[id] },
          availableForSale: id !== V("s6-ram"),
        })),
      },
    }),
  });
  assertEquals(soldOut.status, 409);
  assertEquals(soldOut.body.unavailableParts, ["RAM"]);
});

Deno.test("S4A-S19: when Shopify can't be asked or answers oddly, the price is unverified and goes to review", async () => {
  for (const [label, nodes] of [
    ["an error", () => ({ errors: [{ message: "throttled" }] })],
    ["too few nodes", (ids: string[]) => ({ data: { nodes: ids.slice(1).map(() => null) } })],
    [
      "a failure",
      () => {
        throw new Error("network");
      },
    ],
  ] as [string, (ids: string[]) => any][]) {
    const result = await send(request(completeParts()), { nodes });
    assertEquals(result.status, 200, label);
    assertEquals(result.body.authoritativePrice, null, label);
    assertEquals(result.body.technicianReviewRequired, true, label);
    assertEquals(result.calls.inserted[0].authoritative_price, null, label);
  }
});

// ── Quantities ─────────────────────────────────────────────────────────────────────────────────────

Deno.test("S4A-S20: quantities are limited per slot; one the server can't price goes to review", async () => {
  const priced = (slot: string, quantity: unknown) => quantityPriceable({ slot, quantity } as any);
  assert(priced("RAM", 4) && priced("Storage", 2) && priced("CPU", 1) && priced("CPU", undefined));
  assert(!priced("CPU", 2) && !priced("Storage", 3) && !priced("RAM", 5) && !priced("GPU", 0));
  assert(!priced("RAM", "2") && !priced("RAM", 1.5) && !priced("RAM", -1));

  const twoDrives = await send(
    request(
      { ...completeParts(), Storage: { ...completeParts().Storage, quantity: 2 } },
      { estimatedPrice: COMPLETE_TOTAL + 4000 },
    ),
  );
  assertEquals(twoDrives.body.authoritativePrice, COMPLETE_TOTAL + 4000);
  assertEquals(twoDrives.body.priceDivergence, 0);

  // Two processors fit the old limit of four, and were priced twice. No board holds two, so it now goes to review.
  const twoProcessors = await send(
    request(
      { ...completeParts(), CPU: { ...completeParts().CPU, quantity: 2 } },
      { estimatedPrice: COMPLETE_TOTAL + 15000 },
    ),
  );
  assertEquals(twoProcessors.status, 200);
  assertEquals(twoProcessors.body.authoritativePrice, null);
  assertEquals(twoProcessors.body.technicianReviewRequired, true);
});

Deno.test("S4A-S25: a malformed quantity is refused with 400; a whole number over the slot's most still goes to review", async () => {
  // Owner decision, Stage 4A-7: zero, negative, fractional, text, null or any other type is refused.
  const malformed: [string, unknown][] = [
    ["zero", 0],
    ["negative zero", -0],
    ["a negative", -1],
    ["a fraction", 1.5],
    ["a near-whole fraction", 2.0000001],
    ["text", "2"],
    ["empty text", ""],
    ["null", null],
    ["a flag", true],
    ["a list", [2]],
    ["an object", { value: 2 }],
  ];
  for (const slot of ["CPU", "RAM", "Storage"]) {
    for (const [label, quantity] of malformed) {
      const result = await send(
        request({ ...completeParts(), [slot]: { ...completeParts()[slot], quantity } }),
      );
      assertRefused(result, 400, "invalid_request", "quantity_malformed", `${slot} ${label}`);
      assertEquals(result.body.error, MESSAGE_UNREADABLE, `${slot} ${label}`);
    }
  }

  // Well formed but more than the slot holds: the 4A-2 policy, unchanged. Stored, never priced, always reviewed.
  for (const [slot, quantity] of [
    ["CPU", 2],
    ["RAM", 5],
    ["Storage", 3],
    ["RAM", 1000],
  ] as [string, number][]) {
    const result = await send(
      request({ ...completeParts(), [slot]: { ...completeParts()[slot], quantity } }),
    );
    assertEquals(result.status, 200, `${slot} ${quantity}`);
    assertEquals(result.body.authoritativePrice, null, `${slot} ${quantity}`);
    assertEquals(result.body.technicianReviewRequired, true, `${slot} ${quantity}`);
    assertEquals(result.calls.inserted[0].parts[slot].quantity, quantity, `${slot} ${quantity}`);
  }

  // The limits themselves are unchanged: the most each slot holds is still priced.
  const most = await send(
    request(
      {
        ...completeParts(),
        RAM: { ...completeParts().RAM, quantity: 4 },
        Storage: { ...completeParts().Storage, quantity: 2 },
      },
      { estimatedPrice: COMPLETE_TOTAL + 3000 * 3 + 4000 },
    ),
  );
  assertEquals(most.body.authoritativePrice, COMPLETE_TOTAL + 3000 * 3 + 4000);
  assertEquals(most.body.technicianReviewRequired, false);
});

Deno.test("S4A-S26: every part to buy must state its quantity; an owned part needs none", async () => {
  // Owner decision, Stage 4A closure: a missing quantity is refused with 400, like a malformed one. The builder
  // always sends one, so only a hand-made or altered request is affected.
  const withGraphics = {
    ...completeParts(),
    GPU: { slot: "GPU", variantId: V("s6-gpu"), title: "Card", price: 28000, quantity: 1 },
  };
  for (const slot of Object.keys(withGraphics)) {
    const { quantity: _left, ...noQuantity } = (withGraphics as Record<string, any>)[slot];
    const result = await send(request({ ...withGraphics, [slot]: noQuantity }));
    assertRefused(result, 400, "invalid_request", "quantity_missing", slot);
    assertEquals(result.body.error, MESSAGE_UNREADABLE, slot);
    assertEquals(result.body.problems, [{ code: "quantity_missing", slot }], slot);
  }

  // Leaving quantities out of several parts names each one.
  const { quantity: _cpu, ...cpu } = completeParts().CPU as Record<string, unknown>;
  const { quantity: _psu, ...psu } = completeParts().PSU as Record<string, unknown>;
  const several = await send(request({ ...completeParts(), CPU: cpu, PSU: psu }));
  assertEquals(several.status, 400);
  assertEquals(several.body.problems, [
    { code: "quantity_missing", slot: "CPU" },
    { code: "quantity_missing", slot: "PSU" },
  ]);

  // A part the customer owns is neither bought nor priced, so it carries no quantity and isn't refused for that.
  const owned = await send(request({ ...completeParts(), RAM: { owned: true } }));
  assertEquals(owned.status, 200, JSON.stringify(owned.body));
  assertEquals(owned.calls.inserted[0].parts.RAM.owned, true);
  assertEquals("quantity" in owned.calls.inserted[0].parts.RAM, false);

  // Stated quantities are stored as sent.
  const stated = await send(request(completeParts()));
  assertEquals(stated.status, 200);
  for (const part of Object.values(stated.calls.inserted[0].parts) as any[])
    assertEquals(part.quantity, 1);
});

// ── Compatibility is the server's own verdict (Stage 4S-3) ──────────────────────────────────────────────

Deno.test("S4A-S21: the server's own assessment decides review; the browser's claimed status is only recorded", async () => {
  // A build the server finds Complete, priced exactly: no review, whatever status the browser claims.
  for (const status of ["compatible", "unknown", "conditional", "incompatible", undefined]) {
    const result = await send(request(completeParts(), { compatibility: { status } }));
    assertEquals(result.status, 200, String(status));
    assertEquals(result.body.technicianReviewRequired, false, String(status));
    const stored = result.calls.inserted[0].compatibility;
    // The browser's report is kept as its note; the server's verdict sits beside it.
    assertEquals(stored.status, status);
    assertEquals(stored.reportedBy, "customer_browser");
    assertEquals(stored.serverAssessment.state, "complete");
    assertEquals(stored.serverAssessment.browserStatus, status ?? null);
    assertEquals(
      stored.serverAssessment.agreesWithBrowser,
      status === undefined ? null : status === "compatible",
    );
  }
  // Claimed compatible, but the server finds values nobody has reviewed: review.
  const unreviewed = await send(request(completeParts()), {
    productOf: {
      [V("s6-ram")]: storefrontProduct("RAM", "Shopify s6-ram", { ram_generation: "DDR4" }),
    },
  });
  assertEquals(unreviewed.status, 200);
  assertEquals(unreviewed.body.technicianReviewRequired, true);
  assertEquals(unreviewed.calls.inserted[0].compatibility.serverAssessment.state, "needs_review");
  // Claimed compatible, but the price can't be verified: always review, with no verdict.
  const unverified = await send(request(completeParts()), {
    nodes: () => ({ errors: [{ message: "unavailable" }] }),
  });
  assertEquals(unverified.body.technicianReviewRequired, true);
  assertEquals(unverified.calls.inserted[0].compatibility.serverAssessment.state, "not_assessed");
});

Deno.test("S4A-S22: the structure check is pure and doesn't change what it's given", () => {
  const body = request(completeParts());
  const before = JSON.stringify(body);
  const first = checkQuotationStructure(body);
  const second = checkQuotationStructure(JSON.parse(before));
  assertEquals(JSON.stringify(body), before);
  assertEquals(first, second);
  assert(first.ok);
  // The server's parts are its own objects, so pricing them can't reach back into the request.
  assert(first.parts[0] !== (body.parts as any).CPU);
});

Deno.test("S4A-S23: a test build with ₹0 stand-ins is still a complete build", () => {
  const result = checkQuotationStructure(request(withEssentials({})));
  assert(result.ok);
});

Deno.test("S4A-S24: the page shows the server's reason when a request is refused, and doesn't ask to sign in", async () => {
  for (const parts of [
    { CPU: completeParts().CPU },
    { ...completeParts(), CaseFans: { price: 1 } },
  ]) {
    const server = await send(request(parts));
    // As supabase-js reports a non-2xx answer: an error whose context is the response.
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
      functions: {
        invoke: async () => ({
          data: null,
          error: {
            message: "Edge Function returned a non-2xx status code",
            context: { status: server.status, json: async () => server.body },
          },
        }),
      },
    };
    const result = await submitQuotationRequest(
      { id: "s6", name: "S6", components: {}, ownedSlots: [] } as any,
      {},
      { supabaseClient: client },
    );
    assertEquals(result.success, false);
    assertEquals(result.error, server.body.error);
    assertEquals(Boolean(result.requiresAuth), false);
    assertEquals(Boolean((result as any).isRateLimited), false);
  }
});
