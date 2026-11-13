// Stage 4S-5: the Staff Portal's copies of the quotation server's record types must accept everything the server
// stores, and name exactly the same fields. The portal is a separate app and can't import the server's modules,
// so this is the drift check (approved plan, D: "the portal gets copies of the record types, with a drift test").
//
// Type-level: the file fails to type-check, and so the suite fails, if a copy drifts. Runtime: the portal's
// readers keep what the server writes and show older rows as "not recorded".

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  ServerAssessmentRecord,
  RecordedCheck,
  BrowserComparison,
} from "../verify-and-submit-pc-quotation/assess.ts";
import type { ServerSpecRecord, ServerSpecField } from "../verify-and-submit-pc-quotation/specs.ts";
import type { QuotePart } from "../verify-and-submit-pc-quotation/structure.ts";
import * as Portal from "../../../ITHUB_ADMIN/src/lib/quotation-records.ts";
import * as Workflow from "../../../ITHUB_ADMIN/src/lib/quotation-workflow.ts";
import * as Storefront from "../../../src/lib/builder/quotation-status.ts";

/** True when every value of A is a value of B. */
type Accepts<B, A> = [A] extends [B] ? true : false;
/** True when the two have exactly the same field names. */
type SameKeys<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : false
  : false;
const yes = <T extends true>(_: T) => {};

// The portal accepts every record the server writes…
yes<Accepts<Portal.ServerAssessmentRecord, ServerAssessmentRecord>>(true);
yes<Accepts<Portal.ServerSpecRecord, ServerSpecRecord>>(true);
yes<Accepts<Portal.ServerSpecField, ServerSpecField>>(true);
yes<Accepts<Portal.QuotePart, QuotePart>>(true);
yes<Accepts<Portal.RecordedCheck, RecordedCheck>>(true);
yes<Accepts<Portal.BrowserComparison, BrowserComparison>>(true);
yes<Accepts<Portal.ServerAssessmentRecord["state"], ServerAssessmentRecord["state"]>>(true);
yes<Accepts<ServerAssessmentRecord["state"], Portal.ServerAssessmentRecord["state"]>>(true);
yes<Accepts<ServerSpecRecord["status"], Portal.ServerSpecRecord["status"]>>(true);
yes<Accepts<ServerSpecField["status"], Portal.ServerSpecField["status"]>>(true);
yes<Accepts<ServerSpecField["origin"], Portal.ServerSpecField["origin"]>>(true);
yes<Accepts<NonNullable<QuotePart["slotCheck"]>, NonNullable<Portal.QuotePart["slotCheck"]>>>(true);
yes<Accepts<ServerAssessmentRecord["purpose"], Portal.ServerAssessmentRecord["purpose"]>>(true);
// …and names the same fields, so a field the server adds can't go unseen.
yes<SameKeys<Portal.ServerAssessmentRecord, ServerAssessmentRecord>>(true);
yes<SameKeys<Portal.ServerSpecRecord, ServerSpecRecord>>(true);
yes<SameKeys<Portal.ServerSpecField, ServerSpecField>>(true);
yes<SameKeys<Portal.QuotePart, QuotePart>>(true);
yes<SameKeys<Portal.BrowserComparison, BrowserComparison>>(true);

Deno.test("S4S5-T1: every server verdict state, spec status and slot check has a portal label", () => {
  const states: ServerAssessmentRecord["state"][] = [
    "complete",
    "needs_review",
    "incomplete",
    "incompatible",
    "not_assessed",
  ];
  for (const state of states)
    assertEquals(typeof Portal.BUILD_STATE_LABELS[state], "string", state);
  const statuses: ServerSpecRecord["status"][] = [
    "verified",
    "uncertain",
    "incomplete",
    "problem",
    "unresolved",
    "not_applicable",
  ];
  for (const status of statuses)
    assertEquals(typeof Portal.SPEC_STATUS_LABELS[status], "string", status);
  for (const check of ["shopify_fields", "title", "unconfirmed"] as const) {
    assertEquals(typeof Portal.SLOT_CHECK_LABELS[check], "string", check);
  }
});

Deno.test("S4S5-T2: the portal reads a stored verdict, and treats anything else as not recorded", () => {
  const record = { assessedBy: "server", stage: "4S-3", state: "needs_review", mismatches: [] };
  assertEquals(Portal.readServerAssessment(record)?.state, "needs_review");
  for (const older of [
    null,
    undefined,
    {},
    { state: "complete" },
    "complete",
    { assessedBy: "browser", state: "complete" },
  ]) {
    assertEquals(Portal.readServerAssessment(older), null, JSON.stringify(older));
  }
  assertEquals(Portal.NOT_RECORDED, "Not recorded (before 4S-4)");
  assertEquals(Portal.LEGACY_NOTES_LABEL, "Notes (before 4S-5)");
  assertEquals(Portal.ASSEMBLY_NOT_SET, "Not set");
});

Deno.test("S4S5-T3: stored parts keep every server field; older rows still read", () => {
  const stored = {
    CPU: {
      slot: "CPU",
      variantId: "gid://shopify/ProductVariant/1",
      title: "Ryzen 5 7600",
      name: "Ryzen 5 7600",
      price: 19000,
      quantity: 1,
      isShopifyLive: true,
      slotCheck: "title",
      reportedProductId: "gid://shopify/Product/9",
      serverSpecs: { resolvedBy: "server", stage: "4S-2", status: "uncertain" },
    },
    Storage: {
      slot: "Storage",
      owned: true,
      variantId: null,
      title: "Own SSD",
      name: "Own SSD",
      price: 0,
      isShopifyLive: false,
    },
  };
  const parts = Portal.readQuoteParts(stored);
  assertEquals(
    parts.map((p) => p.slot),
    ["CPU", "Storage"],
  );
  assertEquals(parts[0].slotCheck, "title");
  assertEquals(parts[0].reportedProductId, "gid://shopify/Product/9");
  assertEquals(parts[0].serverSpecs?.status, "uncertain");
  assertEquals(parts[0].quantity, 1);
  assertEquals(parts[1].owned, true);
  // An older array-shaped row with the legacy `type` key.
  const legacy = Portal.readQuoteParts([{ type: "GPU", name: "RTX 4060", price: "29000" }]);
  assertEquals(
    [legacy[0].slot, legacy[0].title, legacy[0].price, legacy[0].variantId],
    ["GPU", "RTX 4060", 29000, null],
  );
  assertEquals(Portal.readQuoteParts(null), []);
});

// ── The portal's workflow mirror (quotation-workflow.ts) ───────────────────────────────────────────────

const M2 = Deno.readTextFileSync(
  new URL("../../migrations/20261111000002_quotation_staff_workflow.sql", import.meta.url),
);
/** Every migration, in the order they apply, so a later one that redefines a rule is the one checked. */
const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
const ALL_MIGRATIONS = [...Deno.readDirSync(MIGRATIONS_DIR)]
  .filter((entry) => entry.isFile && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort()
  .map((name) => Deno.readTextFileSync(new URL(name, MIGRATIONS_DIR)))
  .join("\n");
/** The body of a function as the last migration to define it left it. */
const latestFunction = (name: string) => {
  const start = ALL_MIGRATIONS.lastIndexOf(`create or replace function public.${name}(`);
  assert(start >= 0, name);
  return ALL_MIGRATIONS.slice(start, ALL_MIGRATIONS.indexOf("\n$;", start));
};
const quoted = (list: string) => [...list.matchAll(/'(\w+)'/g)].map((m) => m[1]);
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
/** The staff matrix as the latest definition of the transition function holds it. */
const databaseMatrix = () => {
  const body = latestFunction("staff_transition_pc_quotation");
  const block = body.slice(
    body.indexOf("from (values"),
    body.indexOf(") as m (from_status, to_status, who, reason)"),
  );
  return [...block.matchAll(/\('(\w+)', '(\w+)', '(staff|admin)', (true|false)\)/g)].map(
    (m) => [m[1], m[2], m[3], m[4] === "true"] as [string, string, string, boolean],
  );
};
const review = (
  id: number,
  outcome: Workflow.ReviewOutcome,
  role = "quotation_staff",
  clearance: string | null = null,
): Workflow.QuotationReview => ({
  id,
  outcome,
  note: "n",
  escalation_clearance_reason: clearance,
  reviewer_user_id: "u",
  reviewer_role: role,
  version: id,
  created_at: "",
});

Deno.test("S4S5-T4: the portal's matrix is exactly the database's latest", () => {
  const database = databaseMatrix().map((row) => row.join("|"));
  assertEquals(database.length, 15);
  assertEquals(Workflow.MATRIX.map((row) => row.join("|")).sort(), database.sort());
});

Deno.test("S4S5-T5: each role is offered only its own moves; restores only to the archived-from state", () => {
  const offered = (
    status: Workflow.QuotationStatus,
    role: Workflow.WorkflowRole | null,
    from: string | null = null,
  ) => Workflow.allowedTransitions(status, role, from).map((t) => t.to);
  assertEquals(offered("New", "quotation_staff"), ["Contacted", "Quoted", "Closed", "Archived"]);
  assertEquals(offered("Contacted", "quotation_staff"), ["Quoted", "Closed", "Archived"]);
  assertEquals(offered("Contacted", "portal_admin"), ["Quoted", "Closed", "Archived", "New"]);
  assertEquals(offered("Quoted", "quotation_staff"), ["Closed", "Archived"]);
  assertEquals(offered("Quoted", "portal_admin"), ["Closed", "Archived", "Contacted"]);
  assertEquals(offered("Closed", "quotation_staff"), []);
  assertEquals(offered("Closed", "portal_admin"), ["Quoted"]);
  assertEquals(offered("Archived", "quotation_staff", "Contacted"), []);
  assertEquals(offered("Archived", "portal_admin", "Contacted"), ["Contacted"]);
  assertEquals(offered("Archived", "portal_admin", null), []);
  for (const status of ["Draft", "Withdrawn"] as const) {
    assertEquals(offered(status, "portal_admin"), [], status);
  }
  for (const role of ["service_staff", null] as const)
    assertEquals(offered("New", role), [], String(role));
  const quoted = Workflow.allowedTransitions("New", "quotation_staff").find(
    (t) => t.to === "Quoted",
  )!;
  assertEquals([quoted.gated, quoted.reasonRequired, quoted.adminOnly], [true, false, false]);
  const restore = Workflow.allowedTransitions("Archived", "portal_admin", "Quoted")[0];
  assertEquals(
    [restore.to, restore.restore, restore.reasonRequired, restore.gated],
    ["Quoted", true, true, true],
  );
});

Deno.test("S4S5-T6: the gate and the escalation rule read the reviews as the database does", () => {
  const { reviewGateMet: met, escalationOpen: open } = Workflow;
  assertEquals([met([]), open([])], [false, false]);
  assertEquals(met([review(1, "checked_suitable")]), true);
  assertEquals(met([review(1, "checked_suitable"), review(2, "needs_customer_input")]), false);
  assertEquals(met([review(1, "needs_customer_input"), review(2, "checked_suitable")]), true);
  const escalated = [review(1, "escalated")];
  assertEquals([met(escalated), open(escalated)], [false, true]);
  // Cleared only by an administrator, with a clearance reason, after the escalation.
  assertEquals(
    open([...escalated, review(2, "checked_suitable", "portal_admin", "Confirmed")]),
    false,
  );
  assertEquals(
    met([...escalated, review(2, "checked_suitable", "portal_admin", "Confirmed")]),
    true,
  );
  assertEquals(open([...escalated, review(2, "checked_suitable", "portal_admin", null)]), true);
  assertEquals(
    open([...escalated, review(2, "checked_suitable", "quotation_staff", "Confirmed")]),
    true,
  );
  assertEquals(
    open([review(2, "checked_suitable", "portal_admin", "Early"), review(3, "escalated")]),
    true,
  );
  // A suitable review that doesn't clear an open escalation never opens the gate.
  assertEquals(met([...escalated, review(2, "checked_suitable", "portal_admin", null)]), false);
  assertEquals(
    met([...escalated, review(2, "checked_suitable", "quotation_staff", "Confirmed")]),
    false,
  );
  // A second escalation after a clearance opens again.
  const twice = [
    ...escalated,
    review(2, "checked_suitable", "portal_admin", "A"),
    review(3, "escalated"),
  ];
  assertEquals([open(twice), met(twice)], [true, false]);
});

Deno.test("S4S5-T7: every refusal the staff functions raise has a staff message; anything else is 'failed'", () => {
  const raised = new Set([...M2.matchAll(/raise exception '(\w+)'/g)].map((m) => m[1]));
  assertEquals(raised.size, 10);
  for (const code of raised) {
    const mapped = Workflow.staffActionError({ message: code });
    assertEquals(mapped.code, code, code);
    assert(mapped.message && mapped.message.length > 10, code);
  }
  assertEquals(
    Workflow.staffActionError({ message: "permission denied for function x" }).code,
    "failed",
  );
  assertEquals(Workflow.staffActionError(null).code, "failed");
});

Deno.test("S4S5-T8: a restore goes to the state of the latest archive", () => {
  const event = (id: number, type: string, from: string | null): Workflow.QuotationEvent => ({
    id,
    event_type: type,
    actor_type: "staff",
    actor_user_id: null,
    actor_role: null,
    from_status: from,
    to_status: null,
    version: id,
    reason: null,
    details: null,
    restores_event_id: null,
    created_at: "",
  });
  assertEquals(Workflow.archivedFrom([]), null);
  assertEquals(
    Workflow.archivedFrom([
      event(1, "archived", "New"),
      event(2, "restored", "Archived"),
      event(3, "archived", "Quoted"),
    ]),
    "Quoted",
  );
});

// The approved plan had one shared transition table; 4S-5 keeps separate lists instead (owner decision, report §6).
// This check stops them drifting apart: a change to any one list, in a migration, the storefront or the portal,
// fails here until the others agree.
Deno.test("S4S5-T9: withdrawal, reviews, the staff matrix, the portal and the storefront agree on the statuses", () => {
  const checks = [
    ...ALL_MIGRATIONS.matchAll(
      /pc_builds_enquiry_status_check\s+check \(enquiry_status in \(([^)]*)\)\)/g,
    ),
  ];
  assert(checks.length > 0);
  const statuses = quoted(checks[checks.length - 1][1]);
  assertEquals(sorted(statuses), sorted(Object.keys(Workflow.STATUS_LABELS)), "portal statuses");
  assertEquals(
    sorted(statuses.filter((s) => s !== "Draft")),
    sorted(Object.keys(Storefront.QUOTATION_STATUS_LABELS)),
    "storefront statuses",
  );

  // Every move is between known states; staff never move a quotation into or out of Draft or Withdrawn.
  const matrix = databaseMatrix();
  assert(matrix.length > 0);
  for (const [from, to] of matrix) {
    assert(statuses.includes(from) && statuses.includes(to), `${from}>${to}`);
    for (const end of ["Draft", "Withdrawn"]) assert(from !== end && to !== end, `${from}>${to}`);
  }

  // The live states: the customer may withdraw, staff may review, and quotation staff have a move.
  const listIn = (fn: string) => {
    const found = latestFunction(fn).match(/enquiry_status not in \(([^)]*)\)/);
    assert(found, fn);
    return sorted(quoted(found[1]));
  };
  const live = listIn("customer_withdraw_pc_quotation");
  assertEquals(live, ["Contacted", "New", "Quoted"]);
  assertEquals(listIn("staff_record_pc_quotation_review"), live, "database reviews");
  assertEquals(
    sorted(matrix.filter(([, , who]) => who === "staff").map(([from]) => from)),
    live,
    "states with a quotation staff move",
  );
  assertEquals(sorted(Storefront.WITHDRAWABLE_STATUSES), live, "storefront withdraw button");
  assertEquals(sorted(Workflow.REVIEWABLE_STATUSES), live, "portal review form");
  // The ended states have only administrator moves out (reopen, restore); Withdrawn has none at all.
  for (const ended of statuses.filter((s) => !live.includes(s))) {
    assert(
      matrix.every(([from, , who]) => from !== ended || who === "admin"),
      ended,
    );
  }
});

Deno.test("S4S5-T10: the assignment menu follows the database's assignment rule", () => {
  const staff = (
    user_id: string,
    role: string,
    is_active: boolean,
    full_name: string | null = user_id,
  ) => ({ user_id, role, is_active, full_name, email: `${user_id}@example.test` });
  const profile = (
    id: string,
    role: string,
    full_name: string | null = id,
    email: string | null = null,
  ) => ({ id, role, full_name, email });
  const menu = Workflow.assignableStaff(
    [
      staff("q-active", "quotation_staff", true),
      staff("q-inactive", "quotation_staff", false),
      staff("a-active", "portal_admin", true),
      staff("a-inactive", "portal_admin", false),
      staff("s-active", "service_staff", true),
      staff("p-admin-inactive-row", "service_staff", false, "Staff row name"),
      staff("p-admin-active-row", "quotation_staff", true, "Both"),
      staff("unknown", "owner", true),
      { user_id: null, role: "quotation_staff", is_active: true, full_name: "No id" },
      { user_id: "null-active", role: "quotation_staff", is_active: null, full_name: "x" },
    ],
    [
      profile("p-admin", "admin"),
      profile("p-admin-no-name", "admin", null, "nameless@example.test"),
      profile("p-admin-nothing-12345", "admin", null, null),
      profile("p-admin-inactive-row", "admin", "Profile name"),
      profile("p-admin-active-row", "admin"),
      profile("customer", "customer"),
      profile("q-inactive", "customer"),
      { id: null, role: "admin", full_name: "No id" },
    ],
  );
  assertEquals(menu.map((m) => `${m.user_id}|${m.role}`).sort(), [
    "a-active|portal_admin",
    "p-admin-active-row|portal_admin",
    "p-admin-inactive-row|portal_admin",
    "p-admin-no-name|portal_admin",
    "p-admin-nothing-12345|portal_admin",
    "p-admin|portal_admin",
    "q-active|quotation_staff",
  ]);
  const named = Object.fromEntries(menu.map((m) => [m.user_id, m.full_name]));
  assertEquals(named["p-admin-no-name"], "nameless@example.test");
  assertEquals(named["p-admin-nothing-12345"], "p-admin-");
  // An inactive staff row adds nothing, not even its name; an active one names the administrator.
  assertEquals(named["p-admin-inactive-row"], "Profile name");
  assertEquals(named["p-admin-active-row"], "Both");
  // Each person once, in name order.
  assertEquals(menu.length, new Set(menu.map((m) => m.user_id)).size);
  assertEquals(
    menu.map((m) => m.full_name),
    [...menu.map((m) => m.full_name)].sort((a, b) => a.localeCompare(b)),
  );
  assertEquals(Workflow.assignableStaff([], []), []);
});
