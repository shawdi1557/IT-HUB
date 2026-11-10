// Stage 4A-2: one price summary for every screen and for the quotation request. Owned parts are never priced,
// unavailable parts are named and left out, the assembly charge is its own line, and the browser and the
// quotation server both price unit price times quantity. Every price here is a made-up test price. In memory only.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { summariseBuildPrice, isUnavailablePart, partQuantity } =
  await import("../../../src/lib/builder/pricing.ts");
const { calculateBuildTotal, submitQuotationRequest, ownedPartRecord } =
  await import("../../../src/lib/builder/persistence.ts");
const { generateWhatsAppQuotation } = await import("../../../src/lib/builder/checkout.ts");
const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");
const { withEssentials, isFiller } = await import("./_helpers/quote-structure.ts");

const selection = (name: string, price: number, extra: Record<string, unknown> = {}) => ({
  id: `p-${name}`,
  name,
  price,
  stock: 5,
  ...extra,
});

Deno.test("S4A-P1: parts are priced unit price times quantity, in slot order, with the assembly charge on top", () => {
  const summary = summariseBuildPrice(
    {
      Storage: selection("Drive", 4000, { quantity: 2 }),
      CPU: selection("Processor", 15000),
      RAM: selection("Memory", 3000, { quantity: 4 }),
    },
    { assembly: 1500 },
  );
  assertEquals(
    summary.lines.map((line: any) => [line.slot, line.unitPrice, line.quantity, line.lineTotal]),
    [
      ["CPU", 15000, 1, 15000],
      ["RAM", 3000, 4, 12000],
      ["Storage", 4000, 2, 8000],
    ],
  );
  assertEquals(summary.componentTotal, 35000);
  assertEquals(summary.assembly, 1500);
  assertEquals(summary.total, 36500);
});

Deno.test("S4A-P2 (D5): owned parts are never priced, whether named as owned or stored as an owned record", () => {
  const summary = summariseBuildPrice(
    {
      CPU: selection("Processor", 15000),
      RAM: selection("Memory", 3000),
      GPU: ownedPartRecord("GPU"),
    },
    { ownedSlots: ["RAM", "Storage"] },
  );
  assertEquals(summary.componentTotal, 15000);
  assertEquals(summary.ownedSlots, ["RAM", "GPU", "Storage"]);
  assertEquals(
    summary.lines.map((line: any) => line.slot),
    ["CPU"],
  );
});

Deno.test("S4A-P3: an unavailable part is named and left out of every total", () => {
  const summary = summariseBuildPrice(
    {
      CPU: selection("Processor", 15000),
      GPU: selection("Card", 30000, { stock: 0 }),
      PSU: { title: "Power", price: 5000, availability: "unavailable", quantity: 1 },
    },
    { assembly: 1000 },
  );
  assertEquals(summary.unavailableSlots, ["GPU", "PSU"]);
  assertEquals(summary.componentTotal, 15000);
  assertEquals(summary.total, 16000);
  assertEquals(isUnavailablePart({ stock: 0 }), true);
  assertEquals(isUnavailablePart({ availability: "unavailable" }), true);
  assertEquals(isUnavailablePart({ stock: 3, availability: "available" }), false);
  assertEquals(isUnavailablePart(undefined), false);
});

Deno.test("S4A-P4: odd quantities, prices and assembly charges are read safely", () => {
  for (const quantity of [undefined, 0, -2, 1.5, Number.NaN, "2" as any]) {
    assertEquals(partQuantity({ quantity }), 1, String(quantity));
  }
  assertEquals(partQuantity({ quantity: 3 }), 3);
  const summary = summariseBuildPrice(
    { CPU: { name: "No price" } as any, RAM: selection("Memory", Number.NaN) },
    { assembly: -50 },
  );
  assertEquals(summary.componentTotal, 0);
  assertEquals(summary.assembly, 0);
  assertEquals(summariseBuildPrice(null).total, 0);
  assertEquals(summariseBuildPrice({}, { assembly: Number.POSITIVE_INFINITY }).assembly, 0);
});

Deno.test("S4A-P5: the order parts were given in never changes the summary", () => {
  const parts = {
    Cabinet: selection("Case", 3000),
    CPU: selection("Processor", 15000),
    Peripherals: selection("Keyboard", 1000),
    RAM: selection("Memory", 3000, { quantity: 2 }),
    GPU: selection("Card", 30000, { stock: 0 }),
  };
  const reversed = Object.fromEntries(Object.entries(parts).reverse());
  assertEquals(
    summariseBuildPrice(reversed, { ownedSlots: ["Storage", "GPU"] }),
    summariseBuildPrice(parts, { ownedSlots: ["GPU", "Storage"] }),
  );
  // Slots the builder doesn't list come last, by name.
  assertEquals(
    summariseBuildPrice(parts).lines.map((line: any) => line.slot),
    ["CPU", "RAM", "Cabinet", "Peripherals"],
  );
});

Deno.test("S4A-P6: a saved or submitted build totals as the screens do, with no assembly charge", () => {
  const build: any = {
    id: "s4a-build",
    name: "QZX test build",
    components: {
      CPU: { title: "Processor", price: 15000, quantity: 1, availability: "available" },
      RAM: { title: "Memory", price: 3000, quantity: 2, availability: "available" },
      Storage: { title: "Drive", price: 4000, quantity: 1, availability: "available" },
      GPU: { title: "Card", price: 30000, quantity: 1, availability: "unavailable" },
    },
    ownedSlots: ["Storage"],
  };
  assertEquals(calculateBuildTotal(build), 15000 + 3000 * 2);
  assertEquals(
    calculateBuildTotal(build),
    summariseBuildPrice(build.components, { ownedSlots: build.ownedSlots }).componentTotal,
  );
});

Deno.test("S4A-P7: the WhatsApp request's total leaves out owned and unavailable parts", () => {
  const build: any = {
    id: "s4a-wa",
    name: "QZX WhatsApp build",
    ownedSlots: ["RAM"],
    compatibility: {
      status: "unknown",
      valid: true,
      estimatedSystemLoadWatts: 300,
      recommendedPsuWatts: 550,
    },
    components: {
      CPU: { title: "Processor", price: 15000, quantity: 1 },
      RAM: { title: "Memory", price: 3000, quantity: 1 },
      GPU: { title: "Card", price: 30000, quantity: 1, availability: "unavailable" },
      Storage: { title: "Drive", price: 4000, quantity: 2 },
    },
  };
  const { message } = generateWhatsAppQuotation(build, "");
  const expected = summariseBuildPrice(build.components, { ownedSlots: build.ownedSlots });
  assertEquals(expected.componentTotal, 23000);
  // Stage 4A-5 (the owner's approved wording): the owned part named as the customer's own, the unavailable one
  // with no price, each line at its line total, and the screen's breakdown.
  assert(message.includes("• RAM: (Already owned)"), message);
  assert(message.includes("• GPU: Card — No longer available"), message);
  assert(message.includes("• Storage: Drive — ₹8,000"), message);
  assert(message.includes("Component Total: ₹23,000"), message);
  assert(message.includes("*Estimated Total: ₹23,000*"), message);
});

// ── The quotation request and the server ───────────────────────────────────────────────────────────

const PRICES: Record<string, string> = {
  "gid://shopify/ProductVariant/s4a-cpu": "15000.00",
  "gid://shopify/ProductVariant/s4a-ram": "3000.00",
  "gid://shopify/ProductVariant/s4a-ssd": "4000.00",
};
const shopifyFetch = async (_query: string, vars: any) => ({
  data: {
    nodes: vars.ids.map((id: string) => ({
      id,
      // Stage 4A-6: the ₹0 stand-ins for essentials a test isn't about.
      price: { amount: isFiller(id) ? "0.00" : PRICES[id], currencyCode: "INR" },
      availableForSale: true,
    })),
  },
});
function serverClient(stored: any[]) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "00000000-0000-0000-0000-0000000000a4" } },
        error: null,
      }),
    },
    rpc: async () => ({ data: true, error: null }),
    from: () => ({
      // The duplicate check is a courtesy: with nothing to read it finds nothing.
      select: () => ({
        eq: () => ({ eq: () => ({ gte: async () => ({ data: [], error: null }) }) }),
      }),
      insert: (row: any) => {
        stored.push(row);
        return {
          select: () => ({ single: async () => ({ data: { id: "s4a-quote" }, error: null }) }),
        };
      },
    }),
  };
}
async function submitToServer(body: any) {
  const stored: any[] = [];
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer s4a-customer-token" },
      // Stage 4A-6: the server refuses a build missing an essential part, so the essentials these tests aren't
      // about are added at ₹0. Totals are unchanged.
      body: JSON.stringify({ ...body, parts: withEssentials(body.parts) }),
    }),
    { supabaseClient: serverClient(stored) as any, shopifyFetch },
  );
  return { status: res.status, body: await res.json(), stored };
}

const quotedBuild = (ramQuantity: number): any => ({
  id: "s4a-quote-build",
  name: "QZX quoted build",
  ownedSlots: ["GPU"],
  compatibility: { status: "unknown" },
  components: {
    CPU: {
      productId: "p-cpu",
      variantId: "gid://shopify/ProductVariant/s4a-cpu",
      title: "Processor",
      price: 15000,
      quantity: 1,
    },
    RAM: {
      productId: "p-ram",
      variantId: "gid://shopify/ProductVariant/s4a-ram",
      title: "Memory",
      price: 3000,
      quantity: ramQuantity,
    },
    Storage: {
      productId: "p-ssd",
      variantId: "gid://shopify/ProductVariant/s4a-ssd",
      title: "Drive",
      price: 4000,
      quantity: 1,
    },
  },
});

/** Sends a build the way the page does, and hands the request body to the server. */
async function roundTrip(build: any) {
  let sent: any;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    functions: {
      invoke: async (_name: string, { body }: any) => {
        sent = body;
        const server = await submitToServer(body);
        return { data: server.body, error: null };
      },
    },
  };
  const result = await submitQuotationRequest(build, {}, { supabaseClient: client });
  return { sent, result };
}

Deno.test("S4A-P8: the request carries each part's quantity, and the server prices it the same way", async () => {
  const { sent, result } = await roundTrip(quotedBuild(2));
  assertEquals(sent.parts.RAM.quantity, 2);
  assertEquals(sent.parts.CPU.quantity, 1);
  assertEquals(sent.parts.GPU.owned, true);
  assertEquals(sent.estimatedPrice, 15000 + 3000 * 2 + 4000);
  assertEquals(result.success, true);
  assertEquals(result.estimatedPrice, sent.estimatedPrice);
  assertEquals(result.priceDivergence, 0);
});

Deno.test("S4A-P9: a request with no quantities is priced one of each, as before", async () => {
  const { status, body, stored } = await submitToServer({
    buildName: "QZX no quantities",
    estimatedPrice: 22000,
    compatibility: { status: "compatible" },
    parts: {
      CPU: { variantId: "gid://shopify/ProductVariant/s4a-cpu", price: 15000 },
      RAM: { variantId: "gid://shopify/ProductVariant/s4a-ram", price: 3000 },
      Storage: { variantId: "gid://shopify/ProductVariant/s4a-ssd", price: 4000 },
    },
  });
  assertEquals(status, 200);
  assertEquals(body.authoritativePrice, 22000);
  assertEquals(body.priceDivergence, 0);
  assertEquals(stored[0].authoritative_price, 22000);
});

Deno.test("S4A-P10: a quantity the server can't price sends the quotation to review with no verified price", async () => {
  // Whole numbers above the slot's most. Since Stage 4A-7, zero, negative, fractional and text quantities are
  // refused outright instead (owner decision): see S4A-S25.
  for (const quantity of [5, 6, 100]) {
    const { status, body, stored } = await submitToServer({
      buildName: "QZX odd quantity",
      estimatedPrice: 22000,
      compatibility: { status: "compatible" },
      parts: {
        CPU: { variantId: "gid://shopify/ProductVariant/s4a-cpu", price: 15000 },
        RAM: { variantId: "gid://shopify/ProductVariant/s4a-ram", price: 3000, quantity },
        Storage: { variantId: "gid://shopify/ProductVariant/s4a-ssd", price: 4000 },
      },
    });
    assertEquals(status, 200, String(quantity));
    assertEquals(body.authoritativePrice, null, String(quantity));
    assertEquals(body.technicianReviewRequired, true, String(quantity));
    assertEquals(stored[0].authoritative_price, null, String(quantity));
  }
});

Deno.test("S4A-P11: a client total that ignores the quantity is caught as a price difference", async () => {
  const { body } = await submitToServer({
    buildName: "QZX understated",
    estimatedPrice: 22000,
    compatibility: { status: "compatible" },
    parts: {
      CPU: { variantId: "gid://shopify/ProductVariant/s4a-cpu", price: 15000, quantity: 1 },
      RAM: { variantId: "gid://shopify/ProductVariant/s4a-ram", price: 3000, quantity: 4 },
      Storage: { variantId: "gid://shopify/ProductVariant/s4a-ssd", price: 4000, quantity: 1 },
    },
  });
  assertEquals(body.authoritativePrice, 31000);
  assertEquals(body.priceDivergence, 9000);
  assertEquals(body.technicianReviewRequired, true);
});
