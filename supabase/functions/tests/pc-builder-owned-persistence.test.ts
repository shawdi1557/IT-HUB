// supabase/functions/tests/pc-builder-owned-persistence.test.ts
// A part the customer owns must survive saving, sign-in and the quotation, without ever being priced.
// Nothing here reaches a database or submits a quotation: the client is a stand-in that records the call.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const {
  calculateBuildTotal,
  clearPendingQuotation,
  getPendingQuotation,
  ownedPartRecord,
  partsWithOwnedRecords,
  pendingMatchesBuild,
  PENDING_QUOTATION_MAX_AGE_MS,
  PENDING_QUOTATION_STORAGE_KEY,
  savePendingQuotation,
  splitOwnedParts,
  submitQuotationRequest,
} = await import("../../../src/lib/builder/persistence.ts");
const { checkCompatibility, compatibility } =
  await import("../../../src/lib/builder/compatibility.ts");

const page = await Deno.readTextFile(new URL("../../../src/pages/Builder.tsx", import.meta.url));
const persistence = await Deno.readTextFile(
  new URL("../../../src/lib/builder/persistence.ts", import.meta.url),
);

const component = (slot: string, price: number, specs: any = {}): any => ({
  slot,
  productId: `gid://shopify/Product/${slot}`,
  variantId: `gid://shopify/ProductVariant/${slot}`,
  title: `${slot} part`,
  price,
  currency: "INR",
  specs,
  availability: "available",
  quantity: 1,
});
const build = (ownedSlots: string[] = ["GPU"]): any => ({
  id: "b1",
  name: "Test build",
  mode: "guided",
  currency: "INR",
  components: {
    CPU: component("CPU", 9000, { hasIntegratedGraphics: false }),
    Motherboard: component("Motherboard", 9000),
    PSU: component("PSU", 8000),
  },
  ownedSlots,
});

const recordingClient = (reply: any = { success: true, referenceId: "ITH-PC-TEST" }) => {
  const calls: any[] = [];
  return {
    calls,
    client: {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      functions: {
        invoke: async (name: string, options: any) => {
          calls.push({ name, body: options.body });
          return { data: reply, error: null };
        },
      },
    },
  };
};

// ── Stored parts ────────────────────────────────────────────────────────────────────────────────

Deno.test("OWNED: a stored record has no product and no price, and says what it is", () => {
  const record = ownedPartRecord("GPU");
  assertEquals(record.owned, true);
  assertEquals(record.price, 0);
  assertEquals(record.variantId, null);
  assert(record.name.includes("Customer's own graphics card"));
  assert(record.name.includes("not priced"));
});

Deno.test("OWNED: saving and loading a build keeps its owned parts apart from what's bought", () => {
  for (const owned of [["GPU"], ["RAM"], ["Storage"], ["GPU", "RAM", "Storage"]]) {
    const original = build(owned);
    const stored = JSON.parse(JSON.stringify(partsWithOwnedRecords(original)));
    const loaded = splitOwnedParts(stored);
    assertEquals([...(loaded.ownedSlots as string[])].sort(), [...owned].sort());
    assertEquals(Object.keys(loaded.components).sort(), ["CPU", "Motherboard", "PSU"]);
    assertEquals(
      calculateBuildTotal({ ...original, components: loaded.components, ownedSlots: owned }),
      26000,
    );
  }
});

Deno.test("OWNED: a build with nothing owned, or saved before this, loads as it always did", () => {
  const stored = { CPU: component("CPU", 9000) };
  const loaded = splitOwnedParts(stored);
  assertEquals(loaded.ownedSlots, []);
  assertEquals(Object.keys(loaded.components), ["CPU"]);
  assertEquals(splitOwnedParts(null), { components: {}, ownedSlots: [] });
});

Deno.test("OWNED: the database row and the reload both go through the owned records", () => {
  assert(persistence.includes("parts: partsWithOwnedRecords(build),"));
  assert(persistence.includes("splitOwnedParts(row.parts as Record<string, any>)"));
  assert(persistence.includes("compatibility: checkCompatibility(parts, { ownedSlots }),"));
});

// ── The quotation ───────────────────────────────────────────────────────────────────────────────

Deno.test("QUOTE: the technician is told what the customer owns, and it isn't priced", async () => {
  const { calls, client } = recordingClient();
  const result = await submitQuotationRequest(
    build(["GPU", "Storage"]),
    {},
    {
      supabaseClient: client,
    },
  );
  assertEquals(result.success, true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "verify-and-submit-pc-quotation");
  const { parts, estimatedPrice } = calls[0].body;
  assertEquals(estimatedPrice, 26000);
  assertEquals(parts.GPU.owned, true);
  assertEquals(parts.GPU.price, 0);
  assertEquals(parts.GPU.variantId, null);
  assertEquals(parts.Storage.owned, true);
  assertEquals(parts.CPU.owned, undefined);
  assertEquals(parts.CPU.price, 9000);
  // The Staff Portal shows each part's name and price.
  assert(parts.GPU.name.includes("Customer's own"));
});

Deno.test("QUOTE: an owned slot never sends a product, even if one is still attached", async () => {
  const { calls, client } = recordingClient();
  const withLeftover = build(["GPU"]);
  withLeftover.components.GPU = component("GPU", 28000);
  await submitQuotationRequest(withLeftover, {}, { supabaseClient: client });
  const { parts, estimatedPrice } = calls[0].body;
  assertEquals(estimatedPrice, 26000);
  assertEquals(parts.GPU.variantId, null);
  assertEquals(parts.GPU.price, 0);
});

Deno.test("QUOTE: with no result yet, the check still knows what's owned", async () => {
  const { calls, client } = recordingClient();
  await submitQuotationRequest(build(["GPU"]), {}, { supabaseClient: client });
  const ruleIds = calls[0].body.compatibility.items.map((item: any) => item.ruleId);
  assert(ruleIds.includes("RULE_I_OWNED_GPU_UNCHECKED"));
  assert(!ruleIds.includes("RULE_I_DISCRETE_GPU_REQUIRED"));
});

Deno.test("QUOTE: nothing is submitted for a customer who isn't signed in", async () => {
  const { calls, client } = recordingClient();
  client.auth.getUser = async () => ({ data: { user: null } }) as any;
  const result = await submitQuotationRequest(build(["GPU"]), {}, { supabaseClient: client });
  assertEquals(result.requiresAuth, true);
  assertEquals(calls.length, 0);
});

// ── The engine ──────────────────────────────────────────────────────────────────────────────────

Deno.test("ENGINE: a part chosen for a slot is checked as that part, not as the customer's own", () => {
  const card = component("GPU", 28000, {
    powerWatts: 115,
    recommendedPsuWatts: 550,
    requiredPcieConnectors: ["8-pin"],
  });
  const summary = checkCompatibility(
    {
      CPU: component("CPU", 9000, { tdpWatts: 65 }),
      GPU: card,
      PSU: component("PSU", 8000, { ratedWattage: 750, pciePowerConnectors: ["2x 8-pin"] }),
    },
    { ownedSlots: ["GPU"] },
  );
  const ruleIds = summary.items.map((item: any) => item.ruleId);
  assert(!ruleIds.includes("RULE_I_OWNED_GPU_UNCHECKED"));
  assert(!ruleIds.includes("RULE_E_POWER_DRAW_UNKNOWN"));
  assert(ruleIds.includes("RULE_F_PCIE_POWER_MATCH"));
});

Deno.test("ENGINE: owned parts still face the checks that can be made", () => {
  // A processor with no graphics still needs a card, unless one is owned.
  const parts = {
    CPU: { name: "CPU", hasIntegratedGraphics: false, socket: "AM4", watts: 65 },
    Motherboard: { name: "Board", socket: "AM5" },
  };
  const checks = compatibility(parts, { ownedSlots: ["GPU"] });
  assertEquals(checks.valid, false, "owning a card doesn't excuse a socket mismatch");
  // Owning a card with an unknown draw never reads as adequate power.
  const summary = checkCompatibility(
    {
      CPU: component("CPU", 9000, { tdpWatts: 65, hasIntegratedGraphics: false }),
      PSU: component("PSU", 8000, { ratedWattage: 750, pciePowerConnectors: ["2x 8-pin"] }),
    },
    { ownedSlots: ["GPU"] },
  );
  assertEquals(summary.status, "unknown");
  assert(summary.items.some((item: any) => item.ruleId === "RULE_E_POWER_DRAW_UNKNOWN"));
});

// ── Signing in ──────────────────────────────────────────────────────────────────────────────────

Deno.test("SIGN-IN: a kept build brings back what the customer owns", () => {
  clearPendingQuotation();
  savePendingQuotation({
    mode: "wizard",
    build: build(["GPU"]),
    parts: { CPU: { id: "c1", price: 9000 } },
    name: "My PC",
    ownedSlots: ["GPU"],
  });
  const pending = getPendingQuotation();
  assertEquals(pending?.ownedSlots, ["GPU"]);
  assertEquals(pending?.mode, "wizard");
  clearPendingQuotation();
  assertEquals(getPendingQuotation(), null);
});

Deno.test("SIGN-IN: both ways of leaving Expert Mode for sign-in keep the owned parts", () => {
  const wizardSaves = page.split('mode: "wizard",').slice(1);
  assertEquals(wizardSaves.length, 2);
  for (const save of wizardSaves) assert(save.slice(0, 160).includes("ownedSlots: owned,"));
});

Deno.test("SIGN-IN: a kept build only matches the same parts and the same owned slots", () => {
  const pending = {
    parts: { CPU: { id: "c1", price: 9000 }, RAM: { id: "r1", price: 3000 } },
    ownedSlots: ["GPU"],
  };
  // The price follows the live catalogue, so a price change is still the same build.
  const repriced = { RAM: { id: "r1", price: 3500 }, CPU: { id: "c1", price: 9100 } };
  assert(pendingMatchesBuild(pending, repriced, ["GPU"]));
  assert(!pendingMatchesBuild(pending, { ...repriced, RAM: { id: "r2" } }, ["GPU"]));
  assert(!pendingMatchesBuild(pending, repriced, []));
  assert(!pendingMatchesBuild(pending, repriced, ["GPU", "RAM"]));
  assert(!pendingMatchesBuild(pending, {}, ["GPU"]));
});

Deno.test("SIGN-IN: an old kept build is dropped, and a damaged one doesn't break the page", () => {
  const storage = (globalThis as any).localStorage as Storage | undefined;
  clearPendingQuotation();
  savePendingQuotation({ mode: "customise", build: build(), parts: {}, name: "Old" });
  assert(getPendingQuotation());
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + PENDING_QUOTATION_MAX_AGE_MS + 1000;
    assertEquals(getPendingQuotation(), null);
  } finally {
    Date.now = realNow;
  }
  assertEquals(getPendingQuotation(), null, "dropped for good, not just hidden");
  try {
    storage?.setItem(PENDING_QUOTATION_STORAGE_KEY, "{not json");
  } catch {
    // Storage isn't available in this runtime, so there's nothing to damage.
  }
  if (storage) assertEquals(getPendingQuotation(), null);
  clearPendingQuotation();
});

Deno.test("SIGN-IN: the page doesn't replace an open build, and a reload finds the kept one", () => {
  // The two views only take over when nothing has been chosen, and otherwise require a match.
  assert(page.includes("pendingMatchesBuild(pending, parts, owned)"));
  assert(!page.includes("setParts(pending.parts);\n        }\n        if (pending.name)"));
  // Coming back to the landing page after a reload.
  assert(page.includes('if (!store.loggedIn || mode !== "landing" || detail) return;'));
  assert(page.includes("owned: pending.ownedSlots || [],"));
});

Deno.test("PAGE: Expert Mode shows what's owned, and doesn't price it", () => {
  assert(page.includes("Not included in the estimate. IT HUB will check it fits."));
  assert(page.includes("{owned.map((type) => ("));
  assert(page.includes("Not priced"));
});

Deno.test("EDGE: the server sends any quotation with an owned part to a technician", async () => {
  const source = await Deno.readTextFile(
    new URL("../verify-and-submit-pc-quotation/index.ts", import.meta.url),
  );
  assert(source.includes("allParts.some((part) => part.owned)"));
  assert(source.includes("const partsArray = allParts.filter((part) => !part.owned);"));
});
