// Stage 4A-5: quotation readiness, the build kept for sign-in, saved builds and the WhatsApp request. Every listing
// here is made up, with made-up test prices, and none is IT HUB stock. In memory only, apart from reading the
// two page files; the quotation request goes to a stand-in client that records it and sends nothing.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reviewedSpecs, testListingMaker } from "./_helpers/stage3-golden.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { compatibility, toCanonicalComponent } =
  await import("../../../src/lib/builder/compatibility.ts");
const { assessBuild } = await import("../../../src/lib/builder/completeness.ts");
const { summariseBuildPrice } = await import("../../../src/lib/builder/pricing.ts");
const { liveBuild } = await import("../../../src/lib/builder/readiness.ts");
const { generateWhatsAppQuotation } = await import("../../../src/lib/builder/checkout.ts");
const { savePendingQuotation, getPendingQuotation, clearPendingQuotation, submitQuotationRequest } =
  await import("../../../src/lib/builder/persistence.ts");
const { STATE_BADGE, WHATSAPP_HEADING, WHATSAPP_ESTIMATE_NOTE, blockerLines } =
  await import("../../../src/lib/builder/completeness-wording.ts");

const page = Deno.readTextFileSync("src/pages/Builder.tsx");
const account = Deno.readTextFileSync("src/pages/Account.tsx");
const tight = (text: string) => text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
const has = (source: string, code: string) => tight(source).includes(tight(code));
const count = (source: string, code: string) => tight(source).split(tight(code)).length - 1;

const make = testListingMaker("s4a5");
const SLOTS = ["CPU", "Motherboard", "RAM", "GPU", "Storage", "PSU", "Cabinet", "Cooler"] as const;
/** Reviewed values for every slot; the processor states its graphics and its cooler, so nothing is left open. */
const specsFor = (slot: (typeof SLOTS)[number]) =>
  reviewedSpecs(
    slot,
    slot === "CPU" ? { integrated_graphics: "true", includes_cooler: "true" } : {},
  );
/** A catalogue of two reviewed test listings per slot, and one build from it. */
function catalogueAndBuild() {
  const listings = SLOTS.flatMap((slot) => [
    make(`QZX S4A5 ${slot} A`, slot, 1000, specsFor(slot)),
    make(`QZX S4A5 ${slot} B`, slot, 2500, specsFor(slot)),
  ]);
  const catalogue = syncBuilderCatalogWithShopify(listings as any).componentCatalog;
  const parts: Record<string, any> = {};
  for (const slot of SLOTS) parts[slot] = catalogue[slot][0];
  return { catalogue, parts };
}
/** As the builder's screens assess a build: the engine's summary, then `assessBuild`. */
function assess(parts: Record<string, any>, owned: string[] = [], purpose?: string) {
  const { summary } = compatibility(parts, { ownedSlots: owned });
  const components: Record<string, any> = {};
  for (const [slot, part] of Object.entries(parts)) {
    if (part) components[slot] = toCanonicalComponent(slot, part);
  }
  return {
    summary,
    components,
    assessment: assessBuild(components as any, summary, {
      ownedSlots: owned,
      ...(purpose ? { purpose } : {}),
    }),
  };
}
const canonical = (parts: Record<string, any>, owned: string[] = []) => {
  const { summary, components } = assess(parts, owned);
  return {
    id: "s4a5",
    name: "QZX request build",
    mode: "guided",
    currency: "INR",
    components,
    compatibility: summary,
    ownedSlots: owned,
    createdAt: "",
    updatedAt: "",
  } as any;
};

Deno.test("S4A-Q1: the WhatsApp request is a request with an estimate, priced and judged as the screen is", () => {
  const { parts } = catalogueAndBuild();
  const { Storage: _own, ...bought } = parts;
  const build = canonical(bought, ["Storage"]);
  // A pair of memory kits: quantity is held on the engine's parts, as a build saved or kept for sign-in has it.
  build.components.RAM = { ...build.components.RAM, quantity: 2 };
  for (const assembly of [0, 1500]) {
    const { assessment } = assess(bought, ["Storage"], "gaming");
    const { message } = generateWhatsAppQuotation(build, "", { assessment, assembly });
    const price = summariseBuildPrice(build.components, { ownedSlots: ["Storage"], assembly });
    const lines = message.split("\n");
    assertEquals(lines[0], WHATSAPP_HEADING);
    assertEquals(WHATSAPP_HEADING, "*IT HUB PC BUILD — QUOTATION REQUEST*");
    // Every part in the builder's order, the cooler by its full name, the customer's own drive unpriced.
    const listed = lines.filter((line) => line.startsWith("• ")).map((line) => line.split(":")[0]);
    assertEquals(listed, [
      "• CPU",
      "• Motherboard",
      "• RAM",
      "• GPU",
      "• Storage",
      "• PSU",
      "• Cabinet",
      "• CPU Cooler",
    ]);
    assert(message.includes("• Storage: (Already owned)"));
    // Each line at its line total, and they add up to the Component Total.
    const amounts = lines
      .filter((line) => line.startsWith("• ") && line.includes("₹"))
      .map((line) => Number(line.split("₹")[1].replace(/,/g, "")));
    assertEquals(
      amounts.reduce((sum, value) => sum + value, 0),
      price.componentTotal,
    );
    assert(
      message.includes(
        `• RAM: ${build.components.RAM.title} — ₹${(parts.RAM.price * 2).toLocaleString("en-IN")}`,
      ),
    );
    assert(message.includes(`Component Total: ₹${price.componentTotal.toLocaleString("en-IN")}`));
    assert(
      message.includes(
        `Assembly / Service Charge: ${assembly ? `₹${assembly.toLocaleString("en-IN")}` : "Confirmed with your quotation"}`,
      ),
    );
    assert(message.includes(`*Estimated Total: ₹${price.total.toLocaleString("en-IN")}*`));
    // The build's own status, in the badge's words, then the approved sentence.
    assert(message.includes(`Build status: ${STATE_BADGE[assessment.state].label}`));
    assertEquals(assessment.state, "needs_review");
    assertEquals(
      WHATSAPP_ESTIMATE_NOTE,
      "Estimate only. IT HUB will check this build before confirming your quotation.",
    );
    assert(message.includes(WHATSAPP_ESTIMATE_NOTE));
    for (const claim of ["Free", "No issues found", "Verified", "CONFIGURATION QUOTATION"]) {
      assert(!message.includes(claim), claim);
    }
  }
  // The page's own assessment decides the status, not one the message makes for itself: this build, left to
  // itself, needs review for the customer's drive.
  const told = generateWhatsAppQuotation(build, "", {
    assessment: { state: "complete" } as any,
  }).message;
  assert(told.includes("Build status: Compatible"), told);
  assert(
    generateWhatsAppQuotation(build, "").message.includes("Build status: Needs IT HUB review"),
  );
});

Deno.test("S4A-Q2: a saved build is judged as it stands today, against the live catalogue", () => {
  const { catalogue, parts } = catalogueAndBuild();
  const ready = liveBuild(parts, [], catalogue);
  assertEquals(ready.assessment.state, "complete");
  assert(ready.assessment.quotationReady);
  // A part that has gone from the store: unavailable, out of the price, and blocked, in the builder's words.
  const gone = {
    ...parts,
    GPU: { ...parts.GPU, id: "gid://shopify/Product/s4a5-gone", variantId: "gone" },
  };
  const live = liveBuild(gone, [], catalogue);
  assertEquals(live.assessment.unavailableSlots, ["GPU"]);
  assert(!live.assessment.quotationReady);
  assertEquals(live.price.componentTotal, ready.price.componentTotal - parts.GPU.price);
  assertEquals(
    blockerLines(live.assessment).at(-1)?.text,
    "Replace what's no longer available: GPU.",
  );
  // An old saved price gives way to today's.
  const old = liveBuild({ ...parts, CPU: { ...parts.CPU, price: 1 } }, [], catalogue);
  assertEquals(old.price.componentTotal, ready.price.componentTotal);
  // The customer's own part: kept, unpriced, and sent to review; a part chosen for the slot replaces it.
  const { Storage: _own, ...bought } = parts;
  const owned = liveBuild(bought, ["Storage"], catalogue);
  assertEquals(owned.owned, ["Storage"]);
  assertEquals(owned.assessment.state, "needs_review");
  assert(owned.assessment.quotationReady);
  assertEquals(liveBuild(parts, ["Storage"], catalogue).owned, []);
  // Purpose-neutral (D6): no card is no gap when the processor has graphics.
  const { GPU: _card, ...noCard } = parts;
  assert(!liveBuild(noCard, [], catalogue).assessment.gaps.some((gap: any) => gap.slot === "GPU"));
  // Before the catalogue loads, the saved parts are judged as saved, with nothing called unavailable.
  assertEquals(liveBuild(gone, [], {}).assessment.unavailableSlots, []);
  // The same answer the builder's own screens give for the same parts.
  assertEquals(live.assessment, assess(live.parts, live.owned).assessment);
});

Deno.test("S4A-Q3: the build kept for sign-in keeps its parts, the customer's own and the use", () => {
  const { parts } = catalogueAndBuild();
  const { Storage: _own, ...bought } = parts;
  clearPendingQuotation();
  savePendingQuotation({
    mode: "customise",
    build: canonical(bought, ["Storage"]),
    parts: bought,
    name: "QZX kept build",
    ownedSlots: ["Storage"],
    intent: { purpose: "gaming" },
  });
  const pending = getPendingQuotation()!;
  assertEquals(pending.ownedSlots, ["Storage"]);
  assertEquals(pending.intent?.purpose, "gaming");
  assertEquals(Object.keys(pending.parts).sort(), Object.keys(bought).sort());
  // Restored, it's judged with the use it was kept with: the owned drive goes to review, and without a card a
  // gaming build is Incomplete (D2).
  assertEquals(
    assess(pending.parts, pending.ownedSlots, pending.intent.purpose).assessment.state,
    "needs_review",
  );
  const { GPU: _card, ...noCard } = pending.parts;
  assertEquals(
    assess(noCard, pending.ownedSlots, pending.intent.purpose).assessment.state,
    "incomplete",
  );
  clearPendingQuotation();
  assertEquals(getPendingQuotation(), null);
  // The page restores both, and clears the kept build only once a request is accepted.
  assert(
    page.includes(
      'purpose: typeof pending.intent?.purpose === "string" ? pending.intent.purpose : undefined,',
    ),
  );
  assert(page.includes("owned: pending.ownedSlots || [],"));
  assert(
    !has(
      page,
      "setPendingRestored(false); clearPendingQuotation(); await handleRequestQuotation();",
    ),
  );
  assertEquals(count(page, "onClick={handleRequestQuotation}"), 4);
});

Deno.test("S4A-Q4: a quotation request carries the customer's own parts unpriced, and each quantity", async () => {
  const { parts } = catalogueAndBuild();
  const { Storage: _own, ...bought } = parts;
  const build = canonical(bought, ["Storage"]);
  // A pair of memory kits: quantity is held on the engine's parts, as a build saved or kept for sign-in has it.
  build.components.RAM = { ...build.components.RAM, quantity: 2 };
  let sent: any = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "s4a5-user" } } }) },
    functions: {
      invoke: async (_name: string, options: any) => {
        sent = options.body;
        return {
          data: { success: true, referenceId: "ITH-S4A5", authoritativePrice: 12345 },
          error: null,
        };
      },
    },
  };
  const result = await submitQuotationRequest(build, { name: "QZX" }, { supabaseClient: client });
  assert(result.success);
  assertEquals(result.estimatedPrice, 12345);
  assertEquals(sent.parts.Storage.owned, true);
  assertEquals(sent.parts.Storage.price, 0);
  assertEquals(sent.parts.RAM.quantity, 2);
  assertEquals(
    sent.estimatedPrice,
    summariseBuildPrice(build.components, { ownedSlots: ["Storage"] }).componentTotal,
  );
});

Deno.test("S4A-Q5: every way to send, save or quote a build on the builder is held by the assessment", () => {
  // Quotation, save and WhatsApp on both screens: the button is off, and the handler stops a blocked build too.
  assertEquals(count(page, "const canRequest = assessment.quotationReady;"), 2);
  const GUARD = "if (!canRequest) { store.notify(blockerMessage(assessment)); return; }";
  // Two quotation requests, two saves, one WhatsApp request.
  assertEquals(count(page, GUARD), 5);
  // In each save, before anything else.
  assertEquals(
    count(
      page,
      `${GUARD} if (!store.loggedIn) { store.notify("Please log in to save your build");`,
    ),
    2,
  );
  // In the WhatsApp request, before the message is made.
  assert(has(page, `${GUARD} const canonical = createCanonical();`));
  assert(
    has(
      page,
      "generateWhatsAppQuotation(canonical, store.settings.whatsapp, { assessment, assembly, })",
    ),
  );
  assert(has(page, "onClick={enquire} disabled={!canRequest}"));
  // The confirmation after a request, one component on both screens, with the screen's breakdown.
  assertEquals(count(page, "<QuoteReceived"), 2);
  assertEquals(count(page, "componentTotal: res.estimatedPrice ?? componentTotal,"), 2);
  assert(
    !page.includes(
      'Estimated Build Price\n                  </span>\n                  <p className="text-[10px]',
    ),
  );
  assert(has(page, ".map((type) => ({ type, name: parts[type].name, price: lineTotal(type) }));"));
  // Expert Mode lists each part at what the total counts for it, as Find My PC does.
  assert(
    has(
      page,
      "const lineTotal = (type: string) => pricing.lines.find((line) => line.slot === type)?.lineTotal ?? 0;",
    ),
  );
  // Expert Mode's list and request, and Find My PC's request and WhatsApp record.
  assertEquals(count(page, "price: lineTotal(type)"), 3);
  // A saved build opened by its link opens once it arrives.
  assert(has(page, 'if (!saved || detail || mode !== "landing") return;'));
});

Deno.test("S4A-Q6: a saved build on the Account page goes to IT HUB or the cart only as it stands today", () => {
  assert(
    has(
      account,
      "const live = liveBuild(build.parts, build.owned, store.componentCatalog, assembly);",
    ),
  );
  assert(has(account, "const ready = live.assessment.quotationReady;"));
  assertEquals(count(account, "disabled={!ready}"), 2);
  assert(has(account, "if (!live.assessment.quotationReady) return;"));
  assert(has(account, "onClick={() => ready && store.addCart({"));
  // In the cart, the build and its price are today's.
  assertEquals(count(account, "price: live.price.componentTotal"), 2);
  assert(has(account, "build: { ...build, parts: live.parts, owned: live.owned,"));
  // The blocker lines show whenever the build can't go.
  assert(has(account, '{!ready && (<div className="mt-3 space-y-1 text-[11px] text-red-600">'));
  // The price on the card is today's (the message below uses the same figure).
  assert(has(account, '<strong className="text-primary">{money(live.price.total)}</strong>'));
  assert(has(account, "{blockerLines(live.assessment).map((line) => ("));
  // Its message keeps its wording, with today's parts and price.
  assert(has(account, "`Estimated Price:\\n${money(live.price.total)}`,"));
  assert(account.includes("Please confirm availability and provide the final quotation."));
});
