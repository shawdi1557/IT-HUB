// Stage 4S-1: trusted Shopify product resolution on the quotation server. The browser's product names, product
// IDs and slot placement are never trusted: the server checks Shopify's answer is for the variant it asked about,
// and that the product belongs in its slot, by the builder's own rules. Also checks that the server's generated copy
// of the builder modules matches its source. Made-up IDs, no network.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SLOT_CATEGORY, storefrontProduct, withEssentials } from "./_helpers/quote-structure.ts";

const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");
const { MESSAGE_UNREADABLE } = await import("../verify-and-submit-pc-quotation/structure.ts");
const { storefrontCategory, checkVariantNode } =
  await import("../verify-and-submit-pc-quotation/resolve.ts");
const { classifyProductSlot, detectComponentSlot } =
  await import("../../../src/lib/builder/slot-detection.ts");
const serverCopy = await import("../_shared/builder/slot-detection.ts");
const { resolveShopifyCategory } = await import("../../../src/lib/shopify-schema.ts");
const { GOLDEN_CATALOGUES } = await import("./_helpers/stage3-golden.ts");

const V = (id: string) => `gid://shopify/ProductVariant/s4s1-${id}`;

const PRICES: Record<string, number> = {
  [V("cpu")]: 15000,
  [V("board")]: 9000,
  [V("ram")]: 3000,
  [V("ssd")]: 4000,
  [V("psu")]: 3500,
  [V("case")]: 2500,
};

/** A complete build, every part sent by the page with its quantity. */
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
const TOTAL = 15000 + 9000 + 3000 + 4000 + 3500 + 2500;

/** Shopify's product for each test variant, filed under its slot's category as the store does. */
const PRODUCTS: Record<string, any> = {
  [V("cpu")]: storefrontProduct("CPU", "AMD Ryzen 5 5600"),
  [V("board")]: storefrontProduct("Motherboard", "ASUS Prime B550M-A"),
  [V("ram")]: storefrontProduct("RAM", "Corsair Vengeance 16GB DDR4"),
  [V("ssd")]: storefrontProduct("Storage", "Kingston NV2 1TB NVMe"),
  [V("psu")]: storefrontProduct("PSU", "Deepcool PK550D"),
  [V("case")]: storefrontProduct("Cabinet", "Ant Esports ICE-100"),
};

const node = (id: string, overrides: Record<string, any> = {}) => ({
  id,
  title: "Default Title",
  price: { amount: `${PRICES[id]}.00`, currencyCode: "INR" },
  availableForSale: true,
  currentlyNotInStock: false,
  product: PRODUCTS[id],
  ...overrides,
});

interface Options {
  /** Replaces Shopify's answer for one variant. */
  answer?: Record<string, (id: string) => any>;
  /** Replaces Shopify's whole reply. */
  reply?: (ids: string[]) => any;
  shopifyThrows?: boolean;
}

async function send(body: Record<string, any>, options: Options = {}) {
  const calls = { shopify: [] as { query: string; ids: string[] }[], inserted: [] as any[] };
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "00000000-0000-0000-0000-0000000004s1" } },
        error: null,
      }),
    },
    rpc: async () => ({ data: true, error: null }),
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: async () => ({ data: [], error: null }),
        insert: (row: any) => {
          calls.inserted.push(row);
          return {
            select: () => ({ single: async () => ({ data: { id: "s4s1-row" }, error: null }) }),
          };
        },
      };
      return query;
    },
  };
  const shopifyFetch = async (query: string, vars: { ids: string[] }) => {
    calls.shopify.push({ query, ids: vars.ids });
    if (options.shopifyThrows) throw new Error("network down");
    if (options.reply) return options.reply(vars.ids);
    return { data: { nodes: vars.ids.map((id) => (options.answer?.[id] ?? node)(id)) } };
  };
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer s4s1-token" },
      body: JSON.stringify({
        buildName: "S4S-1",
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

const productAs = (slotProduct: Record<string, unknown>) => (id: string) =>
  node(id, { product: { ...PRODUCTS[id], ...slotProduct } });

// ── Category resolution matches the storefront's ─────────────────────────────────────────────────────

Deno.test("S4S1-1: the server reads a product's category exactly as the storefront does", () => {
  const cases = [
    { category: { name: "Computer Processors" }, productType: "", collections: { edges: [] } },
    { category: { name: "  RAM  " }, productType: "Memory", collections: { edges: [] } },
    { category: null, productType: "Mobile Phone", collections: { edges: [] } },
    {
      category: { name: "" },
      productType: "  ",
      collections: { edges: [{ node: { title: "Processors" } }] },
    },
    {
      category: null,
      productType: "",
      collections: { edges: [{ node: { title: " " } }, { node: { title: "Cases" } }] },
    },
    { category: null, productType: "", collections: { edges: [] } },
    {},
  ];
  for (const product of cases) {
    assertEquals(
      storefrontCategory(product),
      resolveShopifyCategory(product as any).category,
      JSON.stringify(product),
    );
  }
});

// ── Slot classification ──────────────────────────────────────────────────────────────────────────────

Deno.test("S4S1-2: each slot's store category places a product there; anything Shopify files elsewhere is refused", () => {
  for (const [slot, category] of Object.entries(SLOT_CATEGORY)) {
    assertEquals(classifyProductSlot({ title: "x", category }, slot as any), {
      kind: "match",
      source: "shopify_fields",
    });
    for (const other of Object.keys(SLOT_CATEGORY).filter((s) => s !== slot)) {
      assertEquals(classifyProductSlot({ title: "x", category }, other as any), {
        kind: "other_part",
        detectedSlot: slot as any,
      });
    }
  }
  // Positively not a builder part: cables, phones, tablets, external storage, accessories, software.
  for (const evidence of [
    { title: "HDMI Cable 2m", category: "Audio & Video Cables" },
    { title: "SATA Cable", category: "Computer Cables" },
    { title: "Galaxy A15", productType: "Mobile Phone", category: "Smart Phones" },
    { title: "Tab M10", productType: "Tablet", category: "Tablet Computers" },
    { title: "WD Passport 1TB", category: "External Hard Drives" },
    { title: "Logitech K120", category: "Keyboards" },
    { title: "USB-C Adapter", category: "Adapters" },
    { title: "Windows 11 Pro", category: "Software" },
  ]) {
    assertEquals(classifyProductSlot(evidence, "CPU"), { kind: "not_a_part" }, evidence.title);
  }
  // Tags IT HUB sets decide too.
  assertEquals(classifyProductSlot({ title: "x", tags: ["cpu"] }, "CPU").kind, "match");
  assertEquals(
    classifyProductSlot({ title: "x", tags: ["motherboard"] }, "CPU").kind,
    "other_part",
  );
});

Deno.test("S4S1-3: with no deciding field, a title can confirm a slot but never refuse one", () => {
  // Confirmed by title, as the builder places it.
  assertEquals(classifyProductSlot({ title: "AMD Ryzen 5 5600" }, "CPU"), {
    kind: "match",
    source: "title",
  });
  assertEquals(
    classifyProductSlot({ title: "AMD Ryzen 5 5600", category: "Uncategorized" }, "CPU"),
    { kind: "match", source: "title" },
  );
  // A title naming another part: unknown, for a technician, not refused.
  assertEquals(classifyProductSlot({ title: "ASUS Prime B550M-A" }, "CPU"), {
    kind: "unknown",
    reason: "title_conflict",
    titleSlot: "Motherboard",
  });
  // A title naming a cable or a laptop, with no category: still only unknown.
  for (const title of ["HDMI Cable 2m", "Lenovo IdeaPad laptop", "Sandisk USB pen drive"]) {
    assertEquals(classifyProductSlot({ title }, "CPU").kind, "unknown", title);
  }
  // Nothing at all.
  assertEquals(classifyProductSlot({ title: "" }, "CPU"), { kind: "unknown", reason: "no_signal" });
  // An unfamiliar category is not proof of anything either.
  assertEquals(
    classifyProductSlot({ title: "Thing", category: "Electronics" }, "RAM").kind,
    "unknown",
  );
});

Deno.test("S4S1-4: every golden catalogue listing the builder places in a slot, the server accepts there", () => {
  let checked = 0;
  for (const make of Object.values(GOLDEN_CATALOGUES)) {
    for (const listing of (make as () => any[])()) {
      const slot = detectComponentSlot(
        listing.name,
        listing.productType,
        listing.tags || [],
        listing.category,
      );
      if (!slot) continue;
      const result = classifyProductSlot(
        {
          title: listing.name,
          productType: listing.productType,
          tags: listing.tags,
          category: listing.category,
        },
        slot,
      );
      assertEquals(result.kind, "match", `${listing.name} in ${slot}`);
      checked++;
    }
  }
  assert(checked > 50, `only ${checked} listings checked`);
});

// ── The quotation server ─────────────────────────────────────────────────────────────────────────────

Deno.test("S4S1-5: a confirmed build is priced, stored with Shopify's names and products, and not reviewed", async () => {
  const body = parts();
  body.CPU = {
    ...body.CPU,
    title: "Free CPU",
    price: 1,
    productId: "gid://shopify/Product/someone-else",
  };
  const result = await send({ parts: body, estimatedPrice: TOTAL - 14999 });
  assertEquals(result.status, 200, JSON.stringify(result.body));
  assertEquals(result.body.authoritativePrice, TOTAL);
  const stored = result.calls.inserted[0].parts;
  for (const [slot, part] of Object.entries(stored) as [string, any][]) {
    assertEquals(part.slotCheck, "shopify_fields", slot);
    assertEquals(part.productId, PRODUCTS[part.variantId].id, slot);
    assertEquals(part.title, PRODUCTS[part.variantId].title, slot);
  }
  // The browser's product ID is kept only as a note, because it wasn't the variant's product.
  assertEquals(stored.CPU.reportedProductId, "gid://shopify/Product/someone-else");
  assertEquals("reportedProductId" in stored.RAM, false);
  // The browser's total was off by ₹14,999, so it's reviewed for that, not for the parts.
  assertEquals(result.body.technicianReviewRequired, true);

  const clean = await send({ parts: parts() });
  assertEquals(clean.body.technicianReviewRequired, false);
  // The server asked Shopify for each product's placing fields.
  const query = clean.calls.shopify[0].query;
  for (const field of [
    "productType",
    "tags",
    "category",
    "collections",
    "currentlyNotInStock",
    "product {",
  ]) {
    assert(query.includes(field), field);
  }
});

Deno.test("S4S1-6: a variant Shopify files under another part, or under no part, is refused and nothing is stored", async () => {
  const cases: [string, string, Record<string, unknown>][] = [
    [
      "a cable as the processor",
      "CPU",
      { title: "HDMI Cable 2m", category: { name: "Audio & Video Cables" } },
    ],
    [
      "a board as the processor",
      "CPU",
      { title: "B550 board", category: { name: "Motherboards" } },
    ],
    [
      "a phone as the drive",
      "Storage",
      { title: "Galaxy A15", productType: "Mobile Phone", category: { name: "Smart Phones" } },
    ],
    [
      "a graphics card as the memory",
      "RAM",
      { title: "RTX 4060", category: { name: "Video Cards & Adapters" } },
    ],
  ];
  for (const [label, slot, product] of cases) {
    const variant = parts()[slot].variantId;
    const result = await send({ parts: parts() }, { answer: { [variant]: productAs(product) } });
    assertEquals(result.status, 400, `${label}: ${JSON.stringify(result.body)}`);
    assertEquals(result.body.code, "invalid_request", label);
    assertEquals(result.body.error, MESSAGE_UNREADABLE, label);
    assertEquals(result.body.problems, [{ code: "variant_wrong_slot", slot }], label);
    assertEquals(result.calls.inserted.length, 0, label);
  }
  // Two wrong parts are both named.
  const two = await send(
    { parts: parts() },
    {
      answer: {
        [V("cpu")]: productAs({ category: { name: "Computer Cables" } }),
        [V("psu")]: productAs({ category: { name: "Motherboards" } }),
      },
    },
  );
  assertEquals(two.body.problems, [
    { code: "variant_wrong_slot", slot: "CPU" },
    { code: "variant_wrong_slot", slot: "PSU" },
  ]);
});

Deno.test("S4S1-7: a product Shopify can't confidently place goes to a technician, never refused", async () => {
  for (const product of [
    { title: "Mystery part", category: null, productType: "", tags: [] },
    { title: "ASUS Prime B550M-A", category: null }, // title says board, sent as processor
    { title: "Widget", category: { name: "Electronics" } },
  ]) {
    const result = await send({ parts: parts() }, { answer: { [V("cpu")]: productAs(product) } });
    assertEquals(result.status, 200, JSON.stringify(product));
    assertEquals(result.body.technicianReviewRequired, true, JSON.stringify(product));
    assertEquals(result.body.authoritativePrice, TOTAL, "the price is still Shopify's");
    assertEquals(result.calls.inserted[0].parts.CPU.slotCheck, "unconfirmed");
    assertEquals(result.calls.inserted[0].parts.RAM.slotCheck, "shopify_fields");
  }
  // A title alone that names the right part confirms it.
  const byTitle = await send(
    { parts: parts() },
    { answer: { [V("cpu")]: productAs({ title: "AMD Ryzen 5 5600", category: null }) } },
  );
  assertEquals(byTitle.calls.inserted[0].parts.CPU.slotCheck, "title");
  assertEquals(byTitle.body.technicianReviewRequired, false);
});

Deno.test("S4S1-8: an answer for a different variant is unreliable: nothing in it is used or claimed", async () => {
  // Shopify's reply for the processor names the board's variant, and calls it a cable.
  const result = await send(
    { parts: parts() },
    {
      answer: {
        [V("cpu")]: () =>
          node(V("board"), { product: { title: "Cable", category: { name: "Computer Cables" } } }),
      },
    },
  );
  assertEquals(result.status, 200, JSON.stringify(result.body));
  assertEquals(result.body.authoritativePrice, null);
  assertEquals(result.body.technicianReviewRequired, true);
  const stored = result.calls.inserted[0];
  assertEquals(stored.authoritative_price, null);
  for (const part of Object.values(stored.parts) as any[])
    assertEquals(part.slotCheck, "unconfirmed");
  // The names stay the browser's, marked unconfirmed: none of the unreliable answer was taken.
  assertEquals(stored.parts.CPU.title, "Processor");
});

Deno.test("S4S1-9: when Shopify can't be asked or answers oddly, no price, stock or slot is claimed", async () => {
  const outcomes = [
    await send({ parts: parts() }, { shopifyThrows: true }),
    await send({ parts: parts() }, { reply: () => ({ errors: [{ message: "Throttled" }] }) }),
    await send(
      { parts: parts() },
      { reply: (ids) => ({ data: { nodes: ids.slice(1).map((id) => node(id)) } }) },
    ),
  ];
  for (const [index, result] of outcomes.entries()) {
    assertEquals(result.status, 200, `${index}: ${JSON.stringify(result.body)}`);
    assertEquals(result.body.authoritativePrice, null, String(index));
    assertEquals(result.body.technicianReviewRequired, true, String(index));
    for (const part of Object.values(result.calls.inserted[0].parts) as any[]) {
      assertEquals(part.slotCheck, "unconfirmed", String(index));
    }
  }
});

Deno.test("S4S1-10: stock: sold out is refused; sold while out of stock goes to a technician", async () => {
  const soldOut = await send(
    { parts: parts() },
    { answer: { [V("ram")]: (id) => node(id, { availableForSale: false }) } },
  );
  assertEquals(soldOut.status, 409);
  assertEquals(soldOut.body.unavailableParts, ["RAM"]);
  assertEquals(soldOut.calls.inserted.length, 0);

  const backorder = await send(
    { parts: parts() },
    { answer: { [V("ram")]: (id) => node(id, { currentlyNotInStock: true }) } },
  );
  assertEquals(backorder.status, 200);
  assertEquals(backorder.body.technicianReviewRequired, true);
  assertEquals(backorder.body.authoritativePrice, TOTAL);
});

Deno.test("S4S1-11: owned parts aren't sent to Shopify and carry no slot check", async () => {
  const result = await send({
    parts: { ...parts(), RAM: { owned: true } },
    estimatedPrice: TOTAL - 3000,
  });
  assertEquals(result.status, 200);
  assertEquals(result.calls.shopify[0].ids.includes(V("ram")), false);
  assertEquals("slotCheck" in result.calls.inserted[0].parts.RAM, false);
  assertEquals(result.body.technicianReviewRequired, true); // owned parts always go to review (4A)
});

Deno.test("S4S1-12: test stand-ins for the essentials are filed under their own slot's category", async () => {
  const result = await send(
    {
      parts: withEssentials({ CPU: parts().CPU }),
      estimatedPrice: 15000,
    },
    {
      answer: Object.fromEntries(
        ["Motherboard", "RAM", "Storage", "PSU", "Cabinet"].map((slot) => [
          `gid://shopify/ProductVariant/s4a6-filler-${slot.toLowerCase()}`,
          (id: string) => ({
            id,
            price: { amount: "0.00" },
            availableForSale: true,
            product: storefrontProduct(slot, "Stand-in"),
          }),
        ]),
      ),
    },
  );
  assertEquals(result.status, 200, JSON.stringify(result.body));
  assertEquals(result.body.technicianReviewRequired, false);
});

// ── The server's copy of the builder modules ─────────────────────────────────────────────────────────

Deno.test("S4S1-13: the server's copy of each builder module is its source with only import extensions added", () => {
  const script = Deno.readTextFileSync("scripts/sync-server-builder.cjs");
  const list = script.match(/const MODULES = \[([\s\S]*?)\];/);
  assert(list, "MODULES not found in scripts/sync-server-builder.cjs");
  const modules = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert(modules.includes("slot-detection") && modules.includes("compatibility"));
  for (const name of modules) {
    const source = Deno.readTextFileSync(`src/lib/builder/${name}.ts`).replace(/\r\n/g, "\n");
    const expected =
      `// GENERATED from src/lib/builder/${name}.ts by scripts/sync-server-builder.cjs. Don't edit: change the source and\n` +
      `// run \`node scripts/sync-server-builder.cjs\`. Only ".ts" is added to relative imports.\n\n` +
      source.replace(/(\bfrom\s*["'])(\.\.?\/[^"']+?)(["'])/g, (match, open, spec, close) =>
        /\.(?:ts|tsx|js|mjs|json)$/.test(spec) ? match : `${open}${spec}.ts${close}`,
      );
    const copy = Deno.readTextFileSync(`supabase/functions/_shared/builder/${name}.ts`).replace(
      /\r\n/g,
      "\n",
    );
    assertEquals(
      copy === expected,
      true,
      `${name}.ts is out of date: run node scripts/sync-server-builder.cjs`,
    );
  }
  // The quotation function imports builder code only through the copy, never from src/.
  for (const file of ["index.ts", "resolve.ts", "structure.ts"]) {
    const text = Deno.readTextFileSync(`supabase/functions/verify-and-submit-pc-quotation/${file}`);
    assertEquals(/from\s*["'][^"']*\/src\//.test(text), false, file);
  }
});

Deno.test("S4S1-14: the copy behaves as the source on every golden catalogue listing", () => {
  for (const make of Object.values(GOLDEN_CATALOGUES)) {
    for (const listing of (make as () => any[])()) {
      for (const slot of Object.keys(SLOT_CATEGORY)) {
        const evidence = { title: listing.name, tags: listing.tags, category: listing.category };
        assertEquals(
          serverCopy.classifyProductSlot(evidence, slot as any),
          classifyProductSlot(evidence, slot as any),
        );
      }
    }
  }
  assertEquals(checkVariantNode(null, V("cpu"), "CPU"), { kind: "unknown_variant" });
});
