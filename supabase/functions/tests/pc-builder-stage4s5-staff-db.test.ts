// Stage 4S-5: the Staff Portal's quotation workflow, the database's side (migration 20261111000002), proven on the
// disposable stack with real signed-in synthetic users: the transition matrix for every role, reasons, the review
// gate on every move into Quoted, escalation, version checks, append-only reviews and notes, assignment, audit
// written in the same transaction, and no direct staff writes.
//
// DISPOSABLE STACK ONLY (dbTest). Synthetic users and quotations; nothing here is IT HUB data.

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import {
  dbTest,
  TEST_DB_URL,
  TEST_SERVICE_KEY,
  TEST_SUPABASE_URL,
} from "./_helpers/disposable_env.ts";
import { createSignedInUser } from "./_helpers/test_users.ts";
import * as Workflow from "../../../ITHUB_ADMIN/src/lib/quotation-workflow.ts";
import * as Storefront from "../../../src/lib/builder/quotation-status.ts";

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };
const service = () => createClient(TEST_SUPABASE_URL, TEST_SERVICE_KEY, NO_SESSION);

async function sql<T = Record<string, unknown>>(text: string, ...args: unknown[]): Promise<T[]> {
  const pg = new PgClient(TEST_DB_URL);
  await pg.connect();
  try {
    return (await pg.queryObject<T>(text, args)).rows;
  } finally {
    await pg.end();
  }
}

type Cast = Awaited<ReturnType<typeof cast>>;
/** The people every test needs: a customer and their stranger, both kinds of quotation staff, and service staff. */
async function cast(label: string) {
  return {
    customer: await createSignedInUser(`${label}-c`),
    stranger: await createSignedInUser(`${label}-x`),
    staff: await createSignedInUser(`${label}-q`, "quotation_staff"),
    admin: await createSignedInUser(`${label}-a`, "portal_admin"),
    serviceStaff: await createSignedInUser(`${label}-s`, "service_staff"),
  };
}

/** A quotation stored as the Edge Function stores it, then set to `status` as the database owner. */
async function quotation(customerId: string, status = "New", flagged = false) {
  const { data, error } = await service().rpc("create_pc_quotation", {
    p_user_id: customerId,
    p_fingerprint: crypto.randomUUID(),
    p_quotation: {
      name: "Synthetic 4S-5",
      parts: {},
      estimated_price: 50000,
      authoritative_price: 50000,
      technician_review_required: flagged,
      server_assessment: { assessedBy: "server", state: flagged ? "needs_review" : "complete" },
    },
  });
  if (error) throw new Error(`create_pc_quotation: ${error.message}`);
  if (status !== "New") {
    await sql("update public.pc_builds set enquiry_status = $2 where id = $1", data.id, status);
  }
  return data.id as string;
}

const version = async (id: string) =>
  (await sql<{ version: number }>("select version from public.pc_builds where id = $1", id))[0]
    .version;
const status = async (id: string) =>
  (
    await sql<{ enquiry_status: string }>(
      "select enquiry_status from public.pc_builds where id = $1",
      id,
    )
  )[0].enquiry_status;
const eventCount = async (id: string) =>
  Number(
    (
      await sql<{ n: bigint }>(
        "select count(*) as n from public.quotation_events where quotation_id = $1",
        id,
      )
    )[0].n,
  );
const auditCount = async (id: string) =>
  Number(
    (
      await sql<{ n: bigint }>(
        "select count(*) as n from public.staff_audit_logs where entity_type = 'pc_quotation' and entity_id = $1",
        id,
      )
    )[0].n,
  );

const transition = async (
  client: any,
  id: string,
  to: string,
  reason: string | null = "Synthetic reason",
) =>
  client.rpc("staff_transition_pc_quotation", {
    p_quotation_id: id,
    p_to_status: to,
    p_expected_version: await version(id),
    p_reason: reason,
  });
const review = async (client: any, id: string, outcome: string, clearance: string | null = null) =>
  client.rpc("staff_record_pc_quotation_review", {
    p_quotation_id: id,
    p_outcome: outcome,
    p_note: "Synthetic review note",
    p_expected_version: await version(id),
    p_escalation_clearance_reason: clearance,
  });

/** The approved matrix (D11): [who, reason required]. Archived restores are checked separately. */
const MATRIX: Record<string, ["staff" | "admin", boolean]> = {
  "New>Contacted": ["staff", false],
  "New>Quoted": ["staff", false],
  "New>Closed": ["staff", true],
  "New>Archived": ["staff", true],
  "Contacted>Quoted": ["staff", false],
  "Contacted>Closed": ["staff", true],
  "Contacted>Archived": ["staff", true],
  "Contacted>New": ["admin", true],
  "Quoted>Closed": ["staff", true],
  "Quoted>Archived": ["staff", true],
  "Quoted>Contacted": ["admin", true],
  "Closed>Quoted": ["admin", true],
};
const STATES = ["New", "Contacted", "Quoted", "Closed", "Withdrawn"];
const TARGETS = ["Draft", "New", "Contacted", "Quoted", "Closed", "Archived", "Withdrawn"];

// ── The matrix (D11) ──────────────────────────────────────────────────────────────────────────────────

dbTest(
  "S4S5-DB-1: every transition, for quotation staff and administrators, is exactly the approved matrix",
  async () => {
    const people = await cast("s4s5-matrix");
    for (const [role, client] of [
      ["staff", people.staff.client],
      ["admin", people.admin.client],
    ] as const) {
      for (const from of STATES) {
        for (const to of TARGETS) {
          if (from === to) continue;
          const id = await quotation(people.customer.id, from);
          const before = await version(id);
          const result = await transition(client, id, to);
          const cell = MATRIX[`${from}>${to}`];
          const label = `${role}: ${from} → ${to}`;
          if (cell && (cell[0] === "staff" || role === "admin")) {
            assertEquals(result.error, null, label);
            assertEquals(result.data, { ok: true, status: to, version: before + 1 }, label);
            assertEquals(await status(id), to, label);
          } else {
            assertEquals(result.status, cell ? 403 : 409, label);
            assertEquals(result.error?.message, cell ? "forbidden" : "invalid_transition", label);
            assertEquals([await status(id), await version(id)], [from, before], label);
          }
        }
      }
    }
  },
);

dbTest(
  "S4S5-DB-2: customers, other customers and service staff can't make any staff move",
  async () => {
    const people = await cast("s4s5-roles");
    const id = await quotation(people.customer.id);
    for (const [label, client] of [
      ["owner", people.customer.client],
      ["stranger", people.stranger.client],
      ["service staff", people.serviceStaff.client],
    ] as const) {
      for (const call of [
        transition(client, id, "Contacted"),
        review(client, id, "checked_suitable"),
        client.rpc("staff_add_pc_quotation_note", {
          p_quotation_id: id,
          p_note: "x",
          p_expected_version: 1,
        }),
        client.rpc("staff_assign_pc_quotation", {
          p_quotation_id: id,
          p_assignee: people.staff.id,
          p_expected_version: 1,
        }),
      ]) {
        const result = await call;
        assertEquals(result.status, 403, label);
        assertEquals(result.error?.message, "forbidden", label);
      }
    }
    assertEquals([await status(id), await version(id), await eventCount(id)], ["New", 1, 1]);
  },
);

dbTest(
  "S4S5-DB-3: archive restoration: administrators only, with a reason, only to the recorded state, linked",
  async () => {
    const people = await cast("s4s5-restore");
    const id = await quotation(people.customer.id, "Contacted");
    assertEquals(
      (await transition(people.staff.client, id, "Archived", "Customer stopped replying")).error,
      null,
    );
    const archived = (
      await sql<{ id: bigint; from_status: string }>(
        "select id, from_status from public.quotation_events where quotation_id = $1 and event_type = 'archived'",
        id,
      )
    )[0];
    assertEquals(archived.from_status, "Contacted");
    // Quotation staff can't restore.
    assertEquals(
      (await transition(people.staff.client, id, "Contacted")).error?.message,
      "forbidden",
    );
    // Not to another state.
    for (const to of ["New", "Quoted"]) {
      assertEquals(
        (await transition(people.admin.client, id, to)).error?.message,
        "invalid_transition",
        to,
      );
    }
    // Not without a reason.
    assertEquals(
      (await transition(people.admin.client, id, "Contacted", null)).error?.message,
      "reason_required",
    );
    const restored = await transition(
      people.admin.client,
      id,
      "Contacted",
      "Customer replied after all",
    );
    assertEquals(restored.error, null);
    const event = (
      await sql<{
        event_type: string;
        restores_event_id: bigint;
        reason: string;
        actor_type: string;
      }>(
        "select event_type, restores_event_id, reason, actor_type from public.quotation_events where quotation_id = $1 order by id desc limit 1",
        id,
      )
    )[0];
    assertEquals(event.event_type, "restored");
    assertEquals(event.restores_event_id, archived.id);
    assertEquals(event.reason, "Customer replied after all");
    assertEquals(event.actor_type, "admin");
  },
);

dbTest(
  "S4S5-DB-4: reasons: required where the matrix says, optional elsewhere, and bounded",
  async () => {
    const people = await cast("s4s5-reasons");
    for (const reason of [null, "", "  ", "ab"]) {
      const id = await quotation(people.customer.id);
      const result = await transition(people.staff.client, id, "Closed", reason);
      assertEquals(result.status, 400, JSON.stringify(reason));
      assertEquals(await status(id), "New");
    }
    const tooLong = await quotation(people.customer.id);
    assertEquals(
      (await transition(people.staff.client, tooLong, "Archived", "x".repeat(1001))).status,
      400,
    );
    // Optional: New → Contacted needs none, and keeps one if given.
    const optional = await quotation(people.customer.id);
    assertEquals((await transition(people.staff.client, optional, "Contacted", null)).error, null);
    const given = await quotation(people.customer.id);
    assertEquals(
      (await transition(people.staff.client, given, "Contacted", "  Called the customer  ")).error,
      null,
    );
    const reason = (
      await sql<{ reason: string }>(
        "select reason from public.quotation_events where quotation_id = $1 order by id desc limit 1",
        given,
      )
    )[0].reason;
    assertEquals(reason, "Called the customer");
  },
);

// ── The review gate and escalation (D11, E1, E2) ──────────────────────────────────────────────────────

dbTest(
  "S4S5-DB-5: a flagged quotation reaches Quoted only after a completed suitable review",
  async () => {
    const people = await cast("s4s5-gate");
    const id = await quotation(people.customer.id, "New", true);
    const refused = await transition(people.staff.client, id, "Quoted");
    assertEquals(refused.status, 409);
    assertEquals(refused.error?.message, "review_required");
    for (const outcome of ["needs_customer_input", "cannot_supply_as_built", "escalated"]) {
      const other = await quotation(people.customer.id, "Contacted", true);
      assertEquals((await review(people.staff.client, other, outcome)).error, null, outcome);
      assertEquals(
        (await transition(people.admin.client, other, "Quoted")).error?.message,
        "review_required",
        outcome,
      );
    }
    // E2: the same reviewer records "Needs Customer Input", then "Checked – Suitable": the gate opens.
    assertEquals((await review(people.staff.client, id, "needs_customer_input")).error, null);
    assertEquals(
      (await transition(people.staff.client, id, "Quoted")).error?.message,
      "review_required",
    );
    assertEquals((await review(people.staff.client, id, "checked_suitable")).error, null);
    const passed = await transition(people.staff.client, id, "Quoted");
    assertEquals(passed.error, null);
    const details = (
      await sql<{ details: Record<string, unknown> }>(
        "select details from public.quotation_events where quotation_id = $1 order by id desc limit 1",
        id,
      )
    )[0].details;
    assertEquals(details.review_gate, "satisfied");
    // An unflagged quotation needs no review.
    const clean = await quotation(people.customer.id);
    assertEquals((await transition(people.staff.client, clean, "Quoted")).error, null);
  },
);

dbTest(
  "S4S5-DB-6: an escalation is cleared only by an administrator, with its own reason; both stay in history",
  async () => {
    const people = await cast("s4s5-escalate");
    const id = await quotation(people.customer.id, "New", true);
    assertEquals((await review(people.staff.client, id, "escalated")).error, null);
    // Quotation staff can't clear it.
    const byStaff = await review(people.staff.client, id, "checked_suitable");
    assertEquals(byStaff.status, 403);
    // An administrator needs a clearance reason.
    assertEquals(
      (await review(people.admin.client, id, "checked_suitable")).error?.message,
      "reason_required",
    );
    // A clearance reason only belongs to clearing an escalation.
    const clean = await quotation(people.customer.id, "New", true);
    assertEquals(
      (await review(people.staff.client, clean, "checked_suitable", "Not escalated")).status,
      400,
    );
    // The same administrator who escalated may clear it (E1).
    const selfEscalated = await quotation(people.customer.id, "New", true);
    assertEquals((await review(people.admin.client, selfEscalated, "escalated")).error, null);
    assertEquals(
      (
        await review(
          people.admin.client,
          selfEscalated,
          "checked_suitable",
          "Checked the cooler clearance myself",
        )
      ).error,
      null,
    );
    assertEquals((await transition(people.admin.client, selfEscalated, "Quoted")).error, null);
    // Cleared by another administrator: gate opens; both records kept.
    assertEquals(
      (await review(people.admin.client, id, "checked_suitable", "Confirmed with the maker")).error,
      null,
    );
    assertEquals((await transition(people.staff.client, id, "Quoted")).error, null);
    const history = await sql<{
      outcome: string;
      reviewer_role: string;
      escalation_clearance_reason: string | null;
    }>(
      "select outcome, reviewer_role, escalation_clearance_reason from public.quotation_reviews where quotation_id = $1 order by id",
      id,
    );
    assertEquals(history, [
      { outcome: "escalated", reviewer_role: "quotation_staff", escalation_clearance_reason: null },
      {
        outcome: "checked_suitable",
        reviewer_role: "portal_admin",
        escalation_clearance_reason: "Confirmed with the maker",
      },
    ]);
  },
);

dbTest(
  "S4S5-DB-7: the gate also holds for administrator reopening and archive restoration into Quoted",
  async () => {
    const people = await cast("s4s5-gate-admin");
    // Quoted after a suitable review; a later review says it can't be supplied; then Closed. Reopening: refused.
    const reopen = await quotation(people.customer.id, "New", true);
    await review(people.staff.client, reopen, "checked_suitable");
    assertEquals((await transition(people.staff.client, reopen, "Quoted")).error, null);
    await review(people.staff.client, reopen, "cannot_supply_as_built");
    assertEquals(
      (await transition(people.staff.client, reopen, "Closed", "Customer chose another build"))
        .error,
      null,
    );
    assertEquals(
      (await transition(people.admin.client, reopen, "Quoted", "Reopened")).error?.message,
      "review_required",
    );
    // The same for a restore from Archived into Quoted.
    const restore = await quotation(people.customer.id, "New", true);
    await review(people.staff.client, restore, "checked_suitable");
    assertEquals((await transition(people.staff.client, restore, "Quoted")).error, null);
    await review(people.staff.client, restore, "needs_customer_input");
    assertEquals(
      (await transition(people.staff.client, restore, "Archived", "No reply")).error,
      null,
    );
    assertEquals(
      (await transition(people.admin.client, restore, "Quoted", "Back")).error?.message,
      "review_required",
    );
    assertEquals(await status(restore), "Archived");
    // With the gate met, both work.
    const ok = await quotation(people.customer.id, "New", true);
    await review(people.staff.client, ok, "checked_suitable");
    await transition(people.staff.client, ok, "Quoted");
    await transition(people.staff.client, ok, "Closed", "Sold");
    assertEquals(
      (await transition(people.admin.client, ok, "Quoted", "Reopened for a revision")).error,
      null,
    );
  },
);

// ── Versions (refinement 3) ───────────────────────────────────────────────────────────────────────────

dbTest(
  "S4S5-DB-8: every staff mutation checks the version, bumps it by one, and writes nothing when stale",
  async () => {
    const people = await cast("s4s5-version");
    const id = await quotation(people.customer.id);
    const calls: [string, (v: number) => PromiseLike<any>][] = [
      [
        "transition",
        (v) =>
          people.staff.client.rpc("staff_transition_pc_quotation", {
            p_quotation_id: id,
            p_to_status: "Contacted",
            p_expected_version: v,
          }),
      ],
      [
        "review",
        (v) =>
          people.staff.client.rpc("staff_record_pc_quotation_review", {
            p_quotation_id: id,
            p_outcome: "needs_customer_input",
            p_note: "Asked for the budget",
            p_expected_version: v,
          }),
      ],
      [
        "note",
        (v) =>
          people.staff.client.rpc("staff_add_pc_quotation_note", {
            p_quotation_id: id,
            p_note: "Called twice",
            p_expected_version: v,
          }),
      ],
      [
        "assign",
        (v) =>
          people.staff.client.rpc("staff_assign_pc_quotation", {
            p_quotation_id: id,
            p_assignee: people.admin.id,
            p_expected_version: v,
          }),
      ],
    ];
    for (const [label, call] of calls) {
      const current = await version(id);
      const events = await eventCount(id);
      const audits = await auditCount(id);
      const stale = await call(current - 1);
      assertEquals(stale.status, 409, label);
      assertEquals(stale.error?.message, "stale_version", label);
      assertEquals(
        [await version(id), await eventCount(id), await auditCount(id)],
        [current, events, audits],
        label,
      );
      const ok = await call(current);
      assertEquals(ok.error, null, label);
      assertEquals(ok.data.version, current + 1, label);
      assertEquals(
        [await version(id), await eventCount(id), await auditCount(id)],
        [current + 1, events + 1, audits + 1],
        label,
      );
    }
  },
);

dbTest(
  "S4S5-DB-9: two staff acting on the same version at once: exactly one wins, the other is told",
  async () => {
    const people = await cast("s4s5-race");
    const id = await quotation(people.customer.id);
    const answers = await Promise.all([
      people.staff.client.rpc("staff_transition_pc_quotation", {
        p_quotation_id: id,
        p_to_status: "Contacted",
        p_expected_version: 1,
      }),
      people.admin.client.rpc("staff_add_pc_quotation_note", {
        p_quotation_id: id,
        p_note: "Same moment",
        p_expected_version: 1,
      }),
      people.admin.client.rpc("staff_assign_pc_quotation", {
        p_quotation_id: id,
        p_assignee: people.staff.id,
        p_expected_version: 1,
      }),
    ]);
    assertEquals(answers.filter((a) => a.error === null).length, 1);
    assertEquals(answers.filter((a) => a.error?.message === "stale_version").length, 2);
    assertEquals(await version(id), 2);
  },
);

// ── Notes, reviews, assignment, audit ─────────────────────────────────────────────────────────────────

dbTest("S4S5-DB-10: notes and reviews are append-only history, for IT HUB eyes only", async () => {
  const people = await cast("s4s5-notes");
  const id = await quotation(people.customer.id);
  assertEquals(
    (
      await people.staff.client.rpc("staff_add_pc_quotation_note", {
        p_quotation_id: id,
        p_note: "First",
        p_expected_version: 1,
      })
    ).error,
    null,
  );
  assertEquals(
    (
      await people.admin.client.rpc("staff_add_pc_quotation_note", {
        p_quotation_id: id,
        p_note: "Second",
        p_expected_version: 2,
      })
    ).error,
    null,
  );
  assertEquals(
    (
      await people.staff.client.rpc("staff_add_pc_quotation_note", {
        p_quotation_id: id,
        p_note: "   ",
        p_expected_version: 3,
      })
    ).status,
    400,
  );
  await review(people.staff.client, id, "needs_customer_input");
  // Readable by quotation staff and administrators; not by the customer or service staff.
  for (const client of [people.staff.client, people.admin.client]) {
    assertEquals(
      (await client.from("quotation_notes").select("note").eq("quotation_id", id).order("id")).data,
      [{ note: "First" }, { note: "Second" }],
    );
    assertEquals(
      (await client.from("quotation_reviews").select("outcome").eq("quotation_id", id)).data
        ?.length,
      1,
    );
  }
  for (const client of [people.customer.client, people.serviceStaff.client]) {
    assertEquals(
      (await client.from("quotation_notes").select("id").eq("quotation_id", id)).data,
      [],
    );
    assertEquals(
      (await client.from("quotation_reviews").select("id").eq("quotation_id", id)).data,
      [],
    );
    assertEquals(
      (await client.from("quotation_events").select("id").eq("quotation_id", id)).data,
      [],
    );
  }
  // Nobody writes them directly, or changes or removes them, not even the service role or the database owner.
  assertNotEquals(
    (
      await people.staff.client.from("quotation_notes").insert({
        quotation_id: id,
        note: "x",
        author_user_id: people.staff.id,
        author_role: "quotation_staff",
        version: 1,
      })
    ).error,
    null,
  );
  assertNotEquals(
    (await service().from("quotation_notes").update({ note: "changed" }).eq("quotation_id", id))
      .error,
    null,
  );
  assertNotEquals(
    (await service().from("quotation_reviews").delete().eq("quotation_id", id)).error,
    null,
  );
  for (const statement of [
    "update public.quotation_notes set note = 'changed' where quotation_id = $1",
    "delete from public.quotation_reviews where quotation_id = $1",
  ]) {
    let blocked = false;
    try {
      await sql(statement, id);
    } catch {
      blocked = true;
    }
    assert(blocked, statement);
  }
});

dbTest(
  "S4S5-DB-11: assignment: only to an active quotation staff member or administrator; unassigning works",
  async () => {
    const people = await cast("s4s5-assign");
    const id = await quotation(people.customer.id);
    const assign = async (assignee: string | null) =>
      people.staff.client.rpc("staff_assign_pc_quotation", {
        p_quotation_id: id,
        p_assignee: assignee,
        p_expected_version: await version(id),
      });
    for (const invalid of [people.serviceStaff.id, people.customer.id, crypto.randomUUID()]) {
      assertEquals((await assign(invalid)).status, 400);
    }
    assertEquals((await assign(people.admin.id)).error, null);
    assertEquals((await assign(people.staff.id)).error, null);
    assertEquals((await assign(null)).error, null);
    const events = await sql<{ details: Record<string, unknown> }>(
      "select details from public.quotation_events where quotation_id = $1 and event_type = 'assigned' order by id",
      id,
    );
    assertEquals(
      events.map((e) => e.details.to_assignee),
      [people.admin.id, people.staff.id, null],
    );
    // A deactivated staff member can't be assigned.
    await sql(
      "update public.staff_members set is_active = false where user_id = $1",
      people.admin.id,
    );
    assertEquals((await assign(people.admin.id)).status, 400);
  },
);

dbTest(
  "S4S5-DB-12: each staff action writes its history and audit row in one transaction; a failure writes nothing",
  async () => {
    const people = await cast("s4s5-atomic");
    const id = await quotation(people.customer.id);
    assertEquals((await transition(people.staff.client, id, "Contacted")).error, null);
    const audit = await sql<{
      action_type: string;
      previous_status: string;
      new_status: string;
      staff_user_id: string;
    }>(
      "select action_type, previous_status, new_status, staff_user_id from public.staff_audit_logs where entity_type = 'pc_quotation' and entity_id = $1",
      id,
    );
    assertEquals(audit, [
      {
        action_type: "pc_quotation_status_change",
        previous_status: "New",
        new_status: "Contacted",
        staff_user_id: people.staff.id,
      },
    ]);

    // Force the audit write to fail for this quotation only: nothing else may be written either.
    const trigger = `s4s5_fail_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    await sql(
      `create function public.${trigger}() returns trigger language plpgsql set search_path = '' as $$ begin if new.entity_id = '${id}' then raise exception 'forced failure'; end if; return new; end $$`,
    );
    await sql(
      `create trigger ${trigger} before insert on public.staff_audit_logs for each row execute function public.${trigger}()`,
    );
    try {
      const before = [await status(id), await version(id), await eventCount(id)];
      const failed = await transition(people.staff.client, id, "Quoted");
      assertNotEquals(failed.error, null);
      assertEquals([await status(id), await version(id), await eventCount(id)], before);
    } finally {
      await sql(`drop trigger ${trigger} on public.staff_audit_logs`);
      await sql(`drop function public.${trigger}()`);
    }
    // Staff can't file a quotation audit row directly any more; other entities still can.
    const forged = await people.staff.client.from("staff_audit_logs").insert({
      staff_user_id: people.staff.id,
      action_type: "pc_quotation_status_change",
      entity_type: "pc_quotation",
      entity_id: id,
    });
    assertNotEquals(forged.error, null);
    const serviceAudit = await people.serviceStaff.client.from("staff_audit_logs").insert({
      staff_user_id: people.serviceStaff.id,
      action_type: "service_status_note",
      entity_type: "service_request",
      entity_id: crypto.randomUUID(),
    });
    assertEquals(serviceAudit.error, null);
  },
);

// ── Direct writes and the retired function (G1, E8) ──────────────────────────────────────────────────

dbTest(
  "S4S5-DB-13: no staff role writes a quotation directly, and the old status function is retired",
  async () => {
    const people = await cast("s4s5-direct");
    const id = await quotation(people.customer.id);
    for (const client of [people.staff.client, people.admin.client]) {
      for (const change of [
        { authoritative_price: 1 },
        { technician_review_required: false },
        { parts: {} },
        { staff_notes: "direct" },
        { assigned_staff_id: people.staff.id },
        { enquiry_status: "Closed" },
        { name: "Renamed by staff" },
      ]) {
        assertNotEquals(
          (await client.from("pc_builds").update(change).eq("id", id)).error,
          null,
          JSON.stringify(change),
        );
      }
      const retired = await client.rpc("staff_update_pc_quotation_status", {
        p_quotation_id: id,
        p_new_status: "Closed",
      });
      assertNotEquals(retired.error, null);
    }
    const row = (
      await sql<{ enquiry_status: string; version: number; authoritative_price: string }>(
        "select enquiry_status, version, authoritative_price from public.pc_builds where id = $1",
        id,
      )
    )[0];
    assertEquals(
      [row.enquiry_status, row.version, Number(row.authoritative_price)],
      ["New", 1, 50000],
    );
    // Drafts: staff can't act on them through the functions either.
    const draft = await people.customer.client
      .from("pc_builds")
      .insert({
        user_id: people.customer.id,
        name: "Draft",
        parts: {},
        estimated_price: 1,
        enquiry_status: "Draft",
      })
      .select("id")
      .single();
    assertEquals(
      (
        await people.staff.client.rpc("staff_transition_pc_quotation", {
          p_quotation_id: draft.data!.id,
          p_to_status: "New",
          p_expected_version: 1,
        })
      ).status,
      404,
    );
    // The customer's own draft is still theirs to edit.
    assertEquals(
      (
        await people.customer.client
          .from("pc_builds")
          .update({ name: "Mine" })
          .eq("id", draft.data!.id)
      ).error,
      null,
    );
  },
);

// The plan's single shared transition table wasn't built (owner decision, report §6): the customer's withdrawal,
// staff reviews and the staff matrix each keep their own list. Here the database's actual behaviour is held to the
// storefront's and the portal's lists for every status, so a change to one side fails until the others agree.
dbTest(
  "S4S5-DB-14: in every status, withdrawal and reviews behave as the storefront's and portal's lists say",
  async () => {
    const people = await cast("s4s5-live");
    const statuses = Object.keys(Workflow.STATUS_LABELS).filter((s) => s !== "Draft");
    assertEquals(statuses.length, 6);
    for (const state of statuses) {
      const id = await quotation(people.customer.id, state);
      const reviewed = await review(people.staff.client, id, "needs_customer_input");
      assertEquals(
        reviewed.error === null,
        Workflow.REVIEWABLE_STATUSES.includes(state as Workflow.QuotationStatus),
        `review in ${state}: ${reviewed.error?.message}`,
      );
      // Quotation staff have a move out of exactly the live states (archived ones only from their history).
      const staffMoves = Workflow.allowedTransitions(
        state as Workflow.QuotationStatus,
        "quotation_staff",
      );
      assertEquals(staffMoves.length > 0, Storefront.WITHDRAWABLE_STATUSES.includes(state), state);
      const withdrawn = await people.customer.client.rpc("customer_withdraw_pc_quotation", {
        p_quotation_id: id,
        p_expected_version: await version(id),
        p_reason: null,
      });
      assertEquals(
        withdrawn.error === null,
        Storefront.WITHDRAWABLE_STATUSES.includes(state),
        `withdraw from ${state}: ${withdrawn.error?.message}`,
      );
      if (withdrawn.error) assertEquals(withdrawn.error.message, "invalid_transition", state);
      assertEquals(await status(id), withdrawn.error ? state : "Withdrawn");
    }
  },
);

dbTest(
  "S4S5-DB-15: the portal's assignment menu offers exactly the people the database accepts",
  async () => {
    const label = "s4s5-menu";
    const people = await cast(label);
    const quotationStaffOff = await createSignedInUser(`${label}-qoff`, "quotation_staff");
    const adminOff = await createSignedInUser(`${label}-aoff`, "portal_admin");
    const profileAdmin = await createSignedInUser(`${label}-p`);
    const profileAdminOldRow = await createSignedInUser(`${label}-pold`, "service_staff");
    const off = [quotationStaffOff.id, adminOff.id, profileAdminOldRow.id];
    await sql("update public.staff_members set is_active = false where user_id = any($1)", off);
    const promoted = [profileAdmin.id, profileAdminOldRow.id];
    await sql("update public.profiles set role = 'admin' where id = any($1)", promoted);
    try {
      const expected: Record<string, boolean> = {
        [people.staff.id]: true,
        [people.admin.id]: true,
        [profileAdmin.id]: true,
        [profileAdminOldRow.id]: true,
        [quotationStaffOff.id]: false,
        [adminOff.id]: false,
        [people.serviceStaff.id]: false,
        [people.customer.id]: false,
        [people.stranger.id]: false,
      };
      // The portal's own code, as quotation staff and as an administrator see it.
      for (const viewer of [people.staff, people.admin]) {
        const menu = await Workflow.loadAssignableStaff(viewer.client);
        const offered = new Set(menu.map((m) => m.user_id));
        for (const [user, shown] of Object.entries(expected)) {
          assertEquals(offered.has(user), shown, user);
        }
        assertEquals(menu.find((m) => m.user_id === profileAdminOldRow.id)?.role, "portal_admin");
        // Nobody in the whole menu fails the database's rule.
        const outside = await sql<{ id: string }>(
          `select u.id::text as id from unnest($1::uuid[]) as u (id)
           where not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin')
             and not exists (
               select 1 from public.staff_members s
               where s.user_id = u.id and s.is_active = true and s.role in ('quotation_staff', 'portal_admin')
             )`,
          [...offered],
        );
        assertEquals(outside, []);
      }
      // A customer gets an empty menu. (Service staff can read staff and profile rows under the existing staff
      // policies, but the portal keeps them off the quotation screens and the database refuses their assignments.)
      assertEquals(await Workflow.loadAssignableStaff(people.customer.client), []);

      // And the database agrees, person by person.
      const id = await quotation(people.customer.id);
      for (const [user, shown] of Object.entries(expected)) {
        const assigned = await people.staff.client.rpc("staff_assign_pc_quotation", {
          p_quotation_id: id,
          p_assignee: user,
          p_expected_version: await version(id),
        });
        assertEquals(assigned.error === null, shown, `${user}: ${assigned.error?.message}`);
        if (!shown) assertEquals(assigned.error?.message, "assignee_invalid", user);
      }
    } finally {
      await sql("update public.profiles set role = 'customer' where id = any($1)", promoted);
    }
  },
);
