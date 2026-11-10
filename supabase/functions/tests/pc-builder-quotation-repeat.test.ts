// Stage 4S decision 6 (F8): the two-minute repeat check. An identical request returns the earlier reference; a
// request that differs in anything material (parts, quantities, ownership) is filed as a new quotation with its
// own price. Runs the real handler against an in-memory table that keeps what was inserted and answers the same
// filters as the database. Made-up IDs, no network.

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");
const { quotationFingerprint } = await import("../verify-and-submit-pc-quotation/structure.ts");

const V = (id: string) => `gid://shopify/ProductVariant/rep-${id}`;
const CUSTOMER = "00000000-0000-0000-0000-00000000f008";
const OTHER_CUSTOMER = "00000000-0000-0000-0000-00000000f009";

const PRICES: Record<string, number> = {
  [V("cpu")]: 15000,
  [V("cpu-b")]: 21000,
  [V("board")]: 9000,
  [V("ram")]: 3000,
  [V("ssd")]: 4000,
  [V("psu")]: 3500,
  [V("case")]: 2500,
  [V("gpu")]: 28000,
};

const part = (slot: string, id: string, quantity = 1) => ({
  slot,
  variantId: V(id),
  title: slot,
  price: PRICES[V(id)],
  quantity,
});

/** One of each essential, every part bought. */
const baseParts = (): Record<string, any> => ({
  CPU: part("CPU", "cpu"),
  Motherboard: part("Motherboard", "board"),
  RAM: part("RAM", "ram"),
  Storage: part("Storage", "ssd"),
  PSU: part("PSU", "psu"),
  Cabinet: part("Cabinet", "case"),
});

const totalOf = (parts: Record<string, any>) =>
  Object.values(parts).reduce(
    (sum: number, p: any) => (p.owned ? sum : sum + PRICES[p.variantId] * p.quantity),
    0,
  );

interface Row extends Record<string, any> {
  id: string;
  created_at: string;
}

/** A pc_builds table in memory: inserts are kept, and select answers `eq` and `gte` filters as Postgres would. */
function table(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  let next = rows.length;
  const client = (userId: string) => ({
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    rpc: async () => ({ data: true, error: null }),
    from: () => {
      const filters: ((row: Row) => boolean)[] = [];
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        gte: async (column: string, value: string) => {
          filters.push((row) => String(row[column]) >= value);
          return { data: rows.filter((row) => filters.every((keep) => keep(row))), error: null };
        },
        insert: (row: any) => {
          const stored: Row = {
            ...structuredClone(row),
            id: `rep-row-${++next}`,
            created_at: new Date().toISOString(),
          };
          rows.push(stored);
          return {
            select: () => ({ single: async () => ({ data: { id: stored.id }, error: null }) }),
          };
        },
      };
      return query;
    },
  });
  return { rows, client };
}

const shopifyFetch = async (_query: string, vars: { ids: string[] }) => ({
  data: {
    nodes: vars.ids.map((id) => ({
      id,
      product: { title: `Shopify ${id.split("-").pop()}` },
      price: { amount: `${PRICES[id]}.00`, currencyCode: "INR" },
      availableForSale: true,
    })),
  },
});

async function submit(db: ReturnType<typeof table>, parts: unknown, userId = CUSTOMER) {
  const estimatedPrice = Array.isArray(parts)
    ? totalOf(Object.fromEntries(parts.map((p: any) => [p.slot, p])))
    : totalOf(parts as Record<string, any>);
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer rep-token" },
      body: JSON.stringify({
        buildName: "Repeat check",
        estimatedPrice,
        compatibility: { status: "compatible" },
        customerInfo: {},
        parts,
      }),
    }),
    { supabaseClient: db.client(userId) as any, shopifyFetch },
  );
  const body = await res.json();
  assertEquals(res.status, 200, JSON.stringify(body));
  return body;
}

/** Sends `first`, then `second`, and says whether the second was taken as a repeat of the first. */
async function pair(first: unknown, second: unknown) {
  const db = table();
  const a = await submit(db, first);
  const b = await submit(db, second);
  return { a, b, rows: db.rows };
}

function assertNewQuotation(result: Awaited<ReturnType<typeof pair>>, expectedPrice: number) {
  const { a, b, rows } = result;
  assertEquals(b.duplicate, undefined, "a different request was taken as a repeat");
  assertNotEquals(b.referenceId, a.referenceId);
  assertEquals(b.authoritativePrice, expectedPrice);
  assertEquals(rows.length, 2);
}

// ── Identical requests stay idempotent ───────────────────────────────────────────────────────────────

Deno.test("REPEAT-1: the same request twice within two minutes returns the first reference and price", async () => {
  const { a, b, rows } = await pair(baseParts(), baseParts());
  assertEquals(a.duplicate, undefined);
  assertEquals(b.duplicate, true);
  assertEquals(b.referenceId, a.referenceId);
  assertEquals(b.buildId, a.buildId);
  assertEquals(b.authoritativePrice, a.authoritativePrice);
  assertEquals(rows.length, 1);
});

Deno.test("REPEAT-2: the same request in another slot order, or sent as a list, is still a repeat", async () => {
  const reordered = Object.fromEntries(Object.entries(baseParts()).reverse());
  const listed = Object.values(baseParts());
  for (const second of [reordered, listed]) {
    const { a, b, rows } = await pair(baseParts(), second);
    assertEquals(b.duplicate, true);
    assertEquals(b.referenceId, a.referenceId);
    assertEquals(rows.length, 1);
  }
});

Deno.test("REPEAT-3: browser-only fields that change nothing material don't make a new request", async () => {
  const relabelled = baseParts();
  relabelled.CPU = { ...relabelled.CPU, title: "Renamed", price: 1, specs: { socket: "AM5" } };
  const { a, b } = await pair(baseParts(), relabelled);
  assertEquals(b.duplicate, true);
  assertEquals(b.referenceId, a.referenceId);
});

// ── Material changes are new quotations ──────────────────────────────────────────────────────────────

Deno.test("REPEAT-4: changing the memory quantity files a new quotation at the new price", async () => {
  for (const quantity of [2, 4]) {
    const more = { ...baseParts(), RAM: part("RAM", "ram", quantity) };
    assertNewQuotation(await pair(baseParts(), more), totalOf(more));
  }
  // And back down again.
  const two = { ...baseParts(), RAM: part("RAM", "ram", 2) };
  assertNewQuotation(await pair(two, baseParts()), totalOf(baseParts()));
});

Deno.test("REPEAT-5: changing the storage quantity files a new quotation at the new price", async () => {
  const two = { ...baseParts(), Storage: part("Storage", "ssd", 2) };
  assertNewQuotation(await pair(baseParts(), two), totalOf(two));
});

Deno.test("REPEAT-6: a different component, or one added, files a new quotation", async () => {
  const otherCpu = { ...baseParts(), CPU: part("CPU", "cpu-b") };
  assertNewQuotation(await pair(baseParts(), otherCpu), totalOf(otherCpu));

  // The same variant in another slot is another request: slots are material.
  const asCard = { ...baseParts(), GPU: part("GPU", "gpu") };
  const asCooler = { ...baseParts(), Cooler: part("Cooler", "gpu") };
  assertNewQuotation(await pair(asCard, asCooler), totalOf(asCooler));

  const withCard = { ...baseParts(), GPU: part("GPU", "gpu") };
  assertNewQuotation(await pair(baseParts(), withCard), totalOf(withCard));
  assertNewQuotation(await pair(withCard, baseParts()), totalOf(baseParts()));
});

Deno.test("REPEAT-7: switching a part between bought and owned files a new quotation", async () => {
  const ownedRam = { ...baseParts(), RAM: { owned: true } };
  // Bought, then owned: the owned build is unpriced for memory.
  const toOwned = await pair(baseParts(), ownedRam);
  assertNewQuotation(toOwned, totalOf(baseParts()) - PRICES[V("ram")]);
  assertEquals(toOwned.b.technicianReviewRequired, true);
  // Owned, then bought.
  assertNewQuotation(await pair(ownedRam, baseParts()), totalOf(baseParts()));
  // Owned card added to a build that had none.
  assertNewQuotation(
    await pair(baseParts(), { ...baseParts(), GPU: { owned: true } }),
    totalOf(baseParts()),
  );
  // The same owned build twice is still a repeat.
  const again = await pair(ownedRam, { ...baseParts(), RAM: { owned: true } });
  assertEquals(again.b.duplicate, true);
  assertEquals(again.b.referenceId, again.a.referenceId);
});

// ── Scope of the check ───────────────────────────────────────────────────────────────────────────────

Deno.test("REPEAT-8: another customer's identical request, or one older than two minutes, isn't a repeat", async () => {
  const db = table();
  const mine = await submit(db, baseParts());
  const theirs = await submit(db, baseParts(), OTHER_CUSTOMER);
  assertEquals(theirs.duplicate, undefined);
  assertNotEquals(theirs.referenceId, mine.referenceId);

  const old = table([
    {
      id: "rep-old",
      user_id: CUSTOMER,
      enquiry_status: "New",
      reference_id: "ITH-PC-OLD",
      parts: baseParts(),
      created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    },
  ]);
  const fresh = await submit(old, baseParts());
  assertEquals(fresh.duplicate, undefined);
  assertNotEquals(fresh.referenceId, "ITH-PC-OLD");
});

Deno.test("REPEAT-9: a stored row from before quantities were stored counts each part as one", async () => {
  const legacyParts = baseParts();
  for (const p of Object.values(legacyParts)) delete p.quantity;
  const seeded = () =>
    table([
      {
        id: "rep-legacy",
        user_id: CUSTOMER,
        enquiry_status: "New",
        reference_id: "ITH-PC-LEGACY",
        parts: legacyParts,
        authoritative_price: totalOf(baseParts()),
        estimated_price: totalOf(baseParts()),
        created_at: new Date().toISOString(),
      },
    ]);
  const same = await submit(seeded(), baseParts());
  assertEquals(same.duplicate, true);
  assertEquals(same.referenceId, "ITH-PC-LEGACY");

  const more = { ...baseParts(), RAM: part("RAM", "ram", 2) };
  const changed = await submit(seeded(), more);
  assertEquals(changed.duplicate, undefined);
  assertEquals(changed.authoritativePrice, totalOf(more));
});

// ── The fingerprint itself ───────────────────────────────────────────────────────────────────────────

Deno.test("REPEAT-10: the fingerprint covers slot, ownership, variant and quantity, and nothing else", () => {
  const base = quotationFingerprint(baseParts());
  assertEquals(quotationFingerprint(Object.values(baseParts())), base);
  assertEquals(
    quotationFingerprint({ ...baseParts(), CPU: { ...part("CPU", "cpu"), title: "x", price: 9 } }),
    base,
  );
  const differs = [
    { ...baseParts(), RAM: part("RAM", "ram", 2) },
    { ...baseParts(), Storage: part("Storage", "ssd", 2) },
    { ...baseParts(), CPU: part("CPU", "cpu-b") },
    { ...baseParts(), RAM: { owned: true } },
    { ...baseParts(), GPU: part("GPU", "gpu") },
    { ...baseParts(), GPU: { owned: true } },
  ];
  // The same variant moved between slots.
  assertNotEquals(
    quotationFingerprint({ ...baseParts(), GPU: part("GPU", "gpu") }),
    quotationFingerprint({ ...baseParts(), Cooler: part("Cooler", "gpu") }),
  );
  for (const parts of differs) assertNotEquals(quotationFingerprint(parts), base);
  // Shapes that aren't parts give an empty fingerprint, never a match with a real build.
  for (const junk of [null, undefined, "x", 5, {}, []]) {
    assertEquals(quotationFingerprint(junk), "[]");
    assertNotEquals(quotationFingerprint(junk), base);
  }
  assert(base.includes(V("cpu")));
});
