// Owner decision F2 (after Stage 4S-6): the storefront keeps a customer's quotation status and version current.
// Before this, a build the browser already held was never refreshed, so after any staff action the customer saw the
// old status and every withdrawal was refused as stale, even after reloading. These prove the pure parts: the
// database's answer replaces the browser's copy, a late older read can't undo a newer one, a refused withdrawal
// reads the latest state and says only approved things, and the pages refresh where they should.
//
// No network. Made-up ids only.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const Status = await import("../../../src/lib/builder/quotation-status.ts");
const { loadQuotationStates } = await import("../../../src/lib/builder/persistence.ts");
const { refreshQuotationStates } = await import("../../../src/lib/builder/quotation-refresh.ts");

type Q = { referenceId: string; status: string; version: number };
type B = { id: string; name: string; quotation?: Q };

const q = (status: string, version: number, referenceId = "ITH-PC-20261112-0000000001"): Q => ({
  referenceId,
  status,
  version,
});

/** A store holding builds, with the same `set` contract as the storefront's. */
function storeOf(builds: B[]) {
  const state = { builds, sets: 0 };
  const set = (update: (previous: { builds: B[] }) => { builds?: B[] }) => {
    const next = update({ builds: state.builds });
    state.sets++;
    if (next.builds) state.builds = next.builds;
  };
  return { state, set };
}

Deno.test("S4S6-R1: the database's status and version replace the browser's copy; nothing else changes", () => {
  const builds: B[] = [
    { id: "b1", name: "Held, then staff acted", quotation: q("New", 7) },
    { id: "b2", name: "Unchanged", quotation: q("Quoted", 4) },
    { id: "b3", name: "A draft" },
    { id: "b4", name: "Not in the answer", quotation: q("New", 1) },
  ];
  const states = new Map([
    ["b1", q("Contacted", 8)],
    ["b2", q("Quoted", 4)],
    ["b9", q("New", 1)],
  ]);
  const next = Status.applyQuotationStates(builds, states);
  assertEquals(next.length, 4, "never adds a build it doesn't hold");
  assertEquals(next[0], { id: "b1", name: "Held, then staff acted", quotation: q("Contacted", 8) });
  assert(next[1] === builds[1], "an unchanged build is the same object");
  assert(next[2] === builds[2], "a draft is untouched");
  assert(next[3] === builds[3], "a build the database didn't answer for is untouched");
  assert(next[0].quotation !== states.get("b1"), "a copy, not the answer itself");
  // Nothing changed: the same array, so the page doesn't redraw.
  assert(Status.applyQuotationStates(next, states) === next);
});

Deno.test("S4S6-R2: the browser's copy is never trusted over the database's, whatever it claims", () => {
  for (const held of [q("New", 99), q("Withdrawn", 3), q("Quoted", 8, "ITH-PC-FORGED")]) {
    const [build] = Status.applyQuotationStates(
      [{ id: "b1", name: "Edited in the browser", quotation: held }],
      new Map([["b1", q("Contacted", 8)]]),
    );
    assertEquals(build.quotation, q("Contacted", 8), JSON.stringify(held));
  }
});

/** A Supabase client stand-in for the read: records the query, answers as told. */
function fakeClient(answer: { user?: unknown; data?: unknown; error?: unknown; throws?: boolean }) {
  const calls: unknown[][] = [];
  const query: any = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
    not: (...args: unknown[]) => {
      calls.push(["not", ...args]);
      if (answer.throws) throw new Error("network");
      return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
    },
  };
  return {
    calls,
    client: {
      auth: { getUser: async () => ({ data: { user: answer.user ?? null } }) },
      from: (table: string) => (calls.push(["from", table]), query),
    },
  };
}

Deno.test("S4S6-R3: the latest states are read from the customer's own submitted rows only", async () => {
  const { client, calls } = fakeClient({
    user: { id: "u-1" },
    data: [
      { id: "b1", reference_id: "ITH-PC-1", enquiry_status: "Contacted", version: 8 },
      { id: "b2", reference_id: "ITH-PC-2", enquiry_status: "Closed", version: 5 },
      { id: "b3", reference_id: null, enquiry_status: "Draft", version: 1 },
      { id: 7, reference_id: "ITH-PC-3", enquiry_status: "New", version: 1 },
      { id: "b4", reference_id: "ITH-PC-4", enquiry_status: "New", version: "2" },
    ],
  });
  const states = await loadQuotationStates({ supabaseClient: client });
  assertEquals(calls, [
    ["from", "pc_builds"],
    ["select", "id, reference_id, enquiry_status, version"],
    ["eq", "user_id", "u-1"],
    ["not", "reference_id", "is", null],
  ]);
  assertEquals(
    [...states!.entries()],
    [
      ["b1", { referenceId: "ITH-PC-1", status: "Contacted", version: 8 }],
      ["b2", { referenceId: "ITH-PC-2", status: "Closed", version: 5 }],
      // A version that isn't a whole number reads as 1, as saved builds read it; the server still checks it.
      ["b4", { referenceId: "ITH-PC-4", status: "New", version: 1 }],
    ],
  );
});

Deno.test("S4S6-R4: a read that fails is null, never an empty answer that looks like no quotations", async () => {
  for (const [label, answer] of [
    ["not signed in", { user: null }],
    ["refused", { user: { id: "u-1" }, error: { message: "denied" } }],
    ["no rows object", { user: { id: "u-1" }, data: null }],
    ["network", { user: { id: "u-1" }, throws: true }],
  ] as const) {
    const { client } = fakeClient(answer as any);
    assertEquals(await loadQuotationStates({ supabaseClient: client }), null, label);
  }
});

Deno.test("S4S6-R5: an older read arriving late never undoes a newer one; a failed read changes nothing", async () => {
  const store = storeOf([{ id: "b1", name: "Build", quotation: q("Quoted", 8) }]);
  let releaseOld: (value: Map<string, Q>) => void = () => {};
  const old = refreshQuotationStates<B>(
    store.set,
    () => new Promise((resolve) => (releaseOld = resolve)),
  );
  // Started later (for example, just after a withdrawal): it wins.
  await refreshQuotationStates<B>(store.set, async () => new Map([["b1", q("Withdrawn", 9)]]));
  releaseOld(new Map([["b1", q("Quoted", 8)]]));
  await old;
  assertEquals(store.state.builds[0].quotation, q("Withdrawn", 9));

  const before = store.state.builds;
  assertEquals(await refreshQuotationStates<B>(store.set, async () => null), null);
  assert(store.state.builds === before, "a failed read changes nothing");
});

Deno.test("S4S6-R6: a refused withdrawal reads the latest state and says only approved messages", () => {
  const approved = new Set([
    Status.STALE_VERSION_MESSAGE,
    Status.CANNOT_WITHDRAW_MESSAGE,
    Status.WITHDRAW_FAILED_MESSAGE,
  ]);
  const cases: [Parameters<typeof Status.withdrawFailureOutcome>, string, boolean][] = [
    // Changed meanwhile but still open: the new status is now shown, and the customer may try again.
    [["stale_version", q("Contacted", 8)], Status.STALE_VERSION_MESSAGE, true],
    [["stale_version", q("Quoted", 9)], Status.STALE_VERSION_MESSAGE, true],
    // Changed meanwhile and now closed: say so, and close the withdrawal.
    [["stale_version", q("Closed", 9)], Status.CANNOT_WITHDRAW_MESSAGE, false],
    [["stale_version", q("Archived", 9)], Status.CANNOT_WITHDRAW_MESSAGE, false],
    [["stale_version", q("Withdrawn", 9)], Status.CANNOT_WITHDRAW_MESSAGE, false],
    // The latest state couldn't be read: the approved stale message, unchanged.
    [["stale_version", undefined], Status.STALE_VERSION_MESSAGE, true],
    [["invalid_transition", q("Closed", 9)], Status.CANNOT_WITHDRAW_MESSAGE, false],
    [["not_found", undefined], Status.CANNOT_WITHDRAW_MESSAGE, false],
    [["failed", q("New", 1)], Status.WITHDRAW_FAILED_MESSAGE, true],
  ];
  for (const [args, message, keepOpen] of cases) {
    const outcome = Status.withdrawFailureOutcome(...args);
    assertEquals(outcome, { message, keepOpen }, JSON.stringify(args));
    assert(approved.has(outcome.message));
  }
});

Deno.test("S4S6-R7: the pages refresh on opening, on returning and after every withdrawal attempt", () => {
  const account = Deno.readTextFileSync("src/pages/Account.tsx");
  const builder = Deno.readTextFileSync("src/pages/Builder.tsx");
  const between = (from: string, to: string) =>
    account.slice(account.indexOf(from), account.indexOf(to, account.indexOf(from)));

  // Opening the builds and coming back to the page.
  const mount = between("const refreshQuotations = ", "const withdraw = async");
  assert(mount.includes("refreshQuotationStates<Build>(store.set)"));
  for (const hook of [
    "useEffect(() => {\n    void refreshQuotations();",
    'window.addEventListener("focus", onReturn);',
    'document.addEventListener("visibilitychange", onReturn);',
    'if (document.visibilityState === "visible") void refreshQuotations();',
  ]) {
    assert(mount.includes(hook), hook);
  }
  // Opening one build.
  assert(/setViewing\(build\);\s*void refreshQuotations\(\);/.test(account));
  // Every withdrawal attempt: refused (read first, then the message) and accepted.
  const withdraw = between("const withdraw = async", "const assembly = ");
  assert(
    /if \(!result\.ok\) \{\s*\/\/[^\n]*\n\s*const states = await refreshQuotations\(\);/.test(
      withdraw,
    ),
  );
  assert(withdraw.includes("withdrawFailureOutcome(result.code, states?.get(build.id))"));
  assert(
    /notify\(WITHDRAWN_MESSAGE\);\s*\/\/[^\n]*\n\s*void refreshQuotations\(\);/.test(withdraw),
  );
  // The version sent is the held one; the server alone decides.
  assert(withdraw.includes("build.quotation.version"));
  // The builder page refreshes builds it already holds, after adding new ones.
  assert(builder.includes("void refreshQuotationStates<Build>(store.set);"));
  assert(builder.includes("!existingIds.has(b.id)"), "new builds are still only added once");
});

Deno.test("S4S6-R8: the page offers withdrawal only while it's possible, and says when it no longer is", () => {
  const account = Deno.readTextFileSync("src/pages/Account.tsx");
  assert(account.includes("canWithdraw(build.quotation) ? ("));
  assert(account.includes("data-withdraw-unavailable"));
  assert(account.includes("{CANNOT_WITHDRAW_MESSAGE}"));
  // The confirmation closes if a refresh shows it can no longer be withdrawn.
  assert(
    account.includes(
      "{withdrawing === build.id && build.quotation && canWithdraw(build.quotation) && (",
    ),
  );
  // Statuses: open while IT HUB is working on it, closed after.
  for (const status of ["New", "Contacted", "Quoted"]) assert(Status.canWithdraw(q(status, 1)));
  for (const status of ["Closed", "Archived", "Withdrawn", "Draft"]) {
    assert(!Status.canWithdraw(q(status, 1)), status);
  }
});
