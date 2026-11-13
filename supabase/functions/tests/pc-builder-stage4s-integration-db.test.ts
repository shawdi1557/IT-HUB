// Stages 4S-4 and 4S-5 together (C7, the combined integration check): one quotation's whole life on the disposable
// stack, through the same database functions the Edge Function, the storefront and the Staff Portal call, with real
// signed-in synthetic users. Submission → staff review, note, assignment and moves → the customer can't edit or
// delete it but can withdraw it → archive and restore → the complete event and audit trail.
//
// The Edge Function's own steps (Shopify, specifications, the verdict) are proven by the unit suites; here the
// submission enters the database exactly as the function stores it: the guard, then create_pc_quotation.
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

/** As the Edge Function does it: the guard first, then the store. */
async function submit(customerId: string, flagged: boolean) {
  const guard = await service().rpc("pc_quotation_guard", {
    p_user_id: customerId,
    p_ip_key: null,
  });
  assertEquals(guard.data, { allowed: true });
  const stored = await service().rpc("create_pc_quotation", {
    p_user_id: customerId,
    p_fingerprint: crypto.randomUUID(),
    p_quotation: {
      name: "Synthetic C7 build",
      parts: {
        CPU: {
          slot: "CPU",
          variantId: "gid://shopify/ProductVariant/c7",
          quantity: 1,
          price: 19000,
        },
      },
      estimated_price: 50000,
      authoritative_price: 50000,
      price_divergence: 0,
      technician_review_required: flagged,
      compatibility: { status: "compatible", reportedBy: "customer_browser" },
      server_assessment: {
        assessedBy: "server",
        stage: "4S-3",
        state: flagged ? "needs_review" : "complete",
      },
      customer_name: "Synthetic",
      customer_phone: "919800000001",
      customer_email: null,
    },
  });
  assertEquals(stored.error, null);
  return stored.data as { id: string; reference_id: string; duplicate?: boolean };
}

const row = async (id: string) =>
  (
    await sql<{ enquiry_status: string; version: number; assigned_staff_id: string | null }>(
      "select enquiry_status, version, assigned_staff_id from public.pc_builds where id = $1",
      id,
    )
  )[0];

dbTest(
  "C7-1: submit → review, note, assign, move → customer can't edit, can withdraw → full trail",
  async () => {
    const customer = await createSignedInUser("c7-customer");
    const staff = await createSignedInUser("c7-staff", "quotation_staff");
    const admin = await createSignedInUser("c7-admin", "portal_admin");
    const serviceStaff = await createSignedInUser("c7-service", "service_staff");

    // 1. The customer submits; staff can't submit.
    const staffGuard = await service().rpc("pc_quotation_guard", {
      p_user_id: staff.id,
      p_ip_key: null,
    });
    assertEquals(staffGuard.data, { allowed: false, code: "customer_account_required" });
    const quote = await submit(customer.id, true);
    assert(/^ITH-PC-\d{8}-[0-9A-F]{10}$/.test(quote.reference_id), quote.reference_id);
    assertEquals(await row(quote.id), {
      enquiry_status: "New",
      version: 1,
      assigned_staff_id: null,
    });

    // The customer sees the status and version, never the verdict, notes, reviews or history.
    const mine = await customer.client
      .from("pc_builds")
      .select("reference_id, enquiry_status, version")
      .eq("id", quote.id)
      .single();
    assertEquals(mine.data, {
      reference_id: quote.reference_id,
      enquiry_status: "New",
      version: 1,
    });
    assertNotEquals(
      (await customer.client.from("pc_builds").select("server_assessment").eq("id", quote.id))
        .error,
      null,
    );

    // 2. Staff: contacted, assigned, a note, a refused Quoted (flagged, no review), a review, then Quoted.
    const move = async (client: any, to: string, reason: string | null = null) =>
      client.rpc("staff_transition_pc_quotation", {
        p_quotation_id: quote.id,
        p_to_status: to,
        p_expected_version: (await row(quote.id)).version,
        p_reason: reason,
      });
    assertEquals((await move(staff.client, "Contacted")).error, null);
    assertEquals(
      (
        await staff.client.rpc("staff_assign_pc_quotation", {
          p_quotation_id: quote.id,
          p_assignee: staff.id,
          p_expected_version: 2,
        })
      ).error,
      null,
    );
    assertEquals(
      (
        await staff.client.rpc("staff_add_pc_quotation_note", {
          p_quotation_id: quote.id,
          p_note: "Customer wants a quieter cooler",
          p_expected_version: 3,
        })
      ).error,
      null,
    );
    assertEquals((await move(staff.client, "Quoted")).error?.message, "review_required");
    assertEquals(
      (
        await staff.client.rpc("staff_record_pc_quotation_review", {
          p_quotation_id: quote.id,
          p_outcome: "checked_suitable",
          p_note: "Clearances checked against the case",
          p_expected_version: 4,
        })
      ).error,
      null,
    );
    assertEquals((await move(staff.client, "Quoted")).error, null);
    assertEquals(await row(quote.id), {
      enquiry_status: "Quoted",
      version: 6,
      assigned_staff_id: staff.id,
    });

    // Service staff and the customer can't see any of the staff records.
    for (const client of [customer.client, serviceStaff.client]) {
      for (const table of ["quotation_events", "quotation_reviews", "quotation_notes"]) {
        assertEquals(
          (await client.from(table).select("id").eq("quotation_id", quote.id)).data,
          [],
          table,
        );
      }
    }

    // 3. The customer can't edit, re-status or delete it, with or without a stale view.
    for (const change of [
      { name: "Edited" },
      { parts: {} },
      { estimated_price: 1 },
      { enquiry_status: "New" },
    ]) {
      await customer.client.from("pc_builds").update(change).eq("id", quote.id);
    }
    await customer.client.from("pc_builds").delete().eq("id", quote.id);
    assertEquals(await row(quote.id), {
      enquiry_status: "Quoted",
      version: 6,
      assigned_staff_id: staff.id,
    });
    // A withdrawal from the version the customer last saw (1) is refused as stale; from the current one it works.
    const stale = await customer.client.rpc("customer_withdraw_pc_quotation", {
      p_quotation_id: quote.id,
      p_expected_version: 1,
      p_reason: null,
    });
    assertEquals([stale.status, stale.error?.message], [409, "stale_version"]);
    const withdrawn = await customer.client.rpc("customer_withdraw_pc_quotation", {
      p_quotation_id: quote.id,
      p_expected_version: 6,
      p_reason: "Bought a laptop instead",
    });
    assertEquals(withdrawn.error, null);
    assertEquals((await row(quote.id)).enquiry_status, "Withdrawn");
    // Withdrawn is final for everyone, administrators included.
    for (const to of ["New", "Contacted", "Quoted", "Closed", "Archived"]) {
      assertEquals(
        (await move(admin.client, to, "Synthetic reason")).error?.message,
        "invalid_transition",
        to,
      );
    }

    // 4. The complete trail, in order, each event on its own version.
    const events = await sql<{
      event_type: string;
      actor_type: string;
      from_status: string | null;
      to_status: string | null;
      version: number;
      reason: string | null;
    }>(
      "select event_type, actor_type, from_status, to_status, version, reason from public.quotation_events where quotation_id = $1 order by id",
      quote.id,
    );
    assertEquals(
      events.map((e) => [e.event_type, e.actor_type, e.from_status, e.to_status, e.version]),
      [
        ["submitted", "customer", null, "New", 1],
        ["status_changed", "staff", "New", "Contacted", 2],
        ["assigned", "staff", "Contacted", "Contacted", 3],
        ["note_added", "staff", "Contacted", "Contacted", 4],
        ["review_recorded", "staff", "Contacted", "Contacted", 5],
        ["status_changed", "staff", "Contacted", "Quoted", 6],
        ["withdrawn", "customer", "Quoted", "Withdrawn", 7],
      ],
    );
    assertEquals(events[6].reason, "Bought a laptop instead");
    // One audit row per staff action, none for the customer's own steps.
    const audits = await sql<{ action_type: string; staff_user_id: string }>(
      "select action_type, staff_user_id from public.staff_audit_logs where entity_type = 'pc_quotation' and entity_id = $1 order by created_at, id",
      quote.id,
    );
    assertEquals(
      audits.map((a) => a.action_type),
      [
        "pc_quotation_status_change",
        "pc_quotation_assignment",
        "pc_quotation_note",
        "pc_quotation_review",
        "pc_quotation_status_change",
      ],
    );
    assert(audits.every((a) => a.staff_user_id === staff.id));
  },
);

dbTest("C7-2: archive and restore, and what the customer may do around them", async () => {
  const customer = await createSignedInUser("c7b-customer");
  const staff = await createSignedInUser("c7b-staff", "quotation_staff");
  const admin = await createSignedInUser("c7b-admin", "portal_admin");
  const quote = await submit(customer.id, false);
  const move = async (client: any, to: string, reason: string | null = null) =>
    client.rpc("staff_transition_pc_quotation", {
      p_quotation_id: quote.id,
      p_to_status: to,
      p_expected_version: (await row(quote.id)).version,
      p_reason: reason,
    });
  const withdraw = async () =>
    customer.client.rpc("customer_withdraw_pc_quotation", {
      p_quotation_id: quote.id,
      p_expected_version: (await row(quote.id)).version,
      p_reason: null,
    });

  assertEquals((await move(staff.client, "Contacted")).error, null);
  assertEquals((await move(staff.client, "Archived", "No reply for three weeks")).error, null);
  // Archived: the customer can't withdraw it, and quotation staff can't restore it.
  assertEquals((await withdraw()).error?.message, "invalid_transition");
  assertEquals((await move(staff.client, "Contacted", "Back")).error?.message, "forbidden");
  // The administrator restores it, only to Contacted, with a reason.
  assertEquals((await move(admin.client, "New", "Back")).error?.message, "invalid_transition");
  assertEquals((await move(admin.client, "Contacted", "Customer replied")).error, null);
  assertEquals((await row(quote.id)).enquiry_status, "Contacted");
  // Restored, it's live again: the customer can withdraw it.
  assertEquals((await withdraw()).error, null);

  const events = await sql<{
    id: bigint;
    event_type: string;
    restores_event_id: bigint | null;
    actor_type: string;
  }>(
    "select id, event_type, restores_event_id, actor_type from public.quotation_events where quotation_id = $1 order by id",
    quote.id,
  );
  assertEquals(
    events.map((e) => [e.event_type, e.actor_type]),
    [
      ["submitted", "customer"],
      ["status_changed", "staff"],
      ["archived", "staff"],
      ["restored", "admin"],
      ["withdrawn", "customer"],
    ],
  );
  assertEquals(events[3].restores_event_id, events[2].id);
  const versions = await sql<{ version: number }>(
    "select version from public.quotation_events where quotation_id = $1 order by id",
    quote.id,
  );
  assertEquals(
    versions.map((v) => v.version),
    [1, 2, 3, 4, 5],
  );
  assertEquals((await row(quote.id)).version, 5);
});
