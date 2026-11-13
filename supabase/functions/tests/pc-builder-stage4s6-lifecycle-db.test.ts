// Owner decisions F1 and F2 (after Stage 4S-6): the whole customer and staff quotation lifecycle on the disposable
// stack, with real signed-in synthetic users, through the storefront's own read and withdrawal code and the same
// database functions the Edge Function and the Staff Portal call.
//
// F2: before the fix, a customer's browser kept the status and version it first saw, so once staff acted every
// withdrawal was refused as stale, forever. Here the customer's copy goes stale exactly that way, the storefront's
// read brings it up to date, and only then does a withdrawal succeed; and a quotation IT HUB closed is shown as
// closed, with withdrawal refused by the server whatever the browser holds.
// F1: a verdict produced by the server's own assessment is stored and read back unchanged, complete enough for the
// portal to read, and never readable by the customer.
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
import * as Status from "../../../src/lib/builder/quotation-status.ts";
import {
  loadQuotationStates,
  withdrawQuotationRequest,
} from "../../../src/lib/builder/persistence.ts";
import { assessQuotation } from "../verify-and-submit-pc-quotation/assess.ts";
import { readServerAssessment } from "../../../ITHUB_ADMIN/src/lib/quotation-records.ts";

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

const row = async (id: string) =>
  (
    await sql<{ enquiry_status: string; version: number }>(
      "select enquiry_status, version from public.pc_builds where id = $1",
      id,
    )
  )[0];

/** As the Edge Function does it: the guard, then the store, with a verdict from the server's own assessment. */
async function submit(customerId: string) {
  const guard = await service().rpc("pc_quotation_guard", {
    p_user_id: customerId,
    p_ip_key: null,
  });
  assertEquals(guard.data, { allowed: true });
  // No part could be resolved: the server's "not assessed" verdict, which always sends the quotation to review.
  const verdict = assessQuotation([], ["GPU"], { status: "compatible" }, undefined).record;
  const stored = await service().rpc("create_pc_quotation", {
    p_user_id: customerId,
    p_fingerprint: crypto.randomUUID(),
    p_quotation: {
      name: "Synthetic lifecycle build",
      parts: { GPU: { slot: "GPU", owned: true } },
      estimated_price: 50000,
      authoritative_price: null,
      price_divergence: 0,
      technician_review_required: true,
      compatibility: { status: "compatible", reportedBy: "customer_browser" },
      server_assessment: verdict,
      customer_name: "Synthetic",
      customer_phone: "919800000001",
      customer_email: null,
    },
  });
  assertEquals(stored.error, null);
  return { ...(stored.data as { id: string; reference_id: string }), verdict };
}

/** A staff move, at the version the database holds now (what a freshly loaded portal screen sends). */
async function move(client: any, id: string, to: string, reason: string | null = null) {
  const { error } = await client.rpc("staff_transition_pc_quotation", {
    p_quotation_id: id,
    p_to_status: to,
    p_expected_version: (await row(id)).version,
    p_reason: reason,
  });
  assertEquals(error, null, `${to}: ${error?.message}`);
}

async function review(client: any, id: string) {
  const { error } = await client.rpc("staff_record_pc_quotation_review", {
    p_quotation_id: id,
    p_outcome: "checked_suitable",
    p_note: "Synthetic review",
    p_expected_version: (await row(id)).version,
  });
  assertEquals(error, null, `review: ${error?.message}`);
}

type Held = { id: string; name: string; quotation?: Status.QuotationState };

/** What the customer's browser holds after reading the database, as the storefront reads it. */
async function refreshed(client: any, held: Held[]) {
  const states = await loadQuotationStates({ supabaseClient: client });
  assert(states, "the customer's read failed");
  return { states, held: Status.applyQuotationStates(held, states) };
}

dbTest(
  "S4S6-LC1: staff act, the customer's copy goes stale, the storefront's read updates it, then withdrawal works",
  async () => {
    const customer = await createSignedInUser("lc1-customer");
    const staff = await createSignedInUser("lc1-staff", "quotation_staff");
    const quote = await submit(customer.id);

    // F1: the server's verdict is stored and read back unchanged, and the portal can read it.
    const [stored] = await sql<{ server_assessment: unknown }>(
      "select server_assessment from public.pc_builds where id = $1",
      quote.id,
    );
    assertEquals(stored.server_assessment, JSON.parse(JSON.stringify(quote.verdict)));
    assert(readServerAssessment(stored.server_assessment) !== null);
    // The customer never reads it.
    assertNotEquals(
      (await customer.client.from("pc_builds").select("server_assessment").eq("id", quote.id))
        .error,
      null,
    );

    // The customer's browser, as the storefront fills it after submitting.
    let held: Held[] = [{ id: quote.id, name: "Synthetic lifecycle build" }];
    ({ held } = await refreshed(customer.client, held));
    assertEquals(held[0].quotation, { referenceId: quote.reference_id, status: "New", version: 1 });

    // Staff contact the customer. The browser still holds New, version 1.
    await move(staff.client, quote.id, "Contacted");
    const before = held[0].quotation!;
    const stale = await withdrawQuotationRequest(quote.id, before.version, "Changed my mind", {
      supabaseClient: customer.client,
    });
    assertEquals(stale, { ok: false, code: "stale_version" });
    assertEquals(
      await row(quote.id),
      { enquiry_status: "Contacted", version: 2 },
      "nothing changed",
    );

    // The storefront reads again on a refused withdrawal: the customer now sees the current status and version.
    let read = await refreshed(customer.client, held);
    held = read.held;
    assertEquals(held[0].quotation, {
      referenceId: quote.reference_id,
      status: "Contacted",
      version: 2,
    });
    assertEquals(Status.customerStatusLabel(held[0].quotation!.status), "We have contacted you");
    assertEquals(Status.withdrawFailureOutcome("stale_version", read.states.get(quote.id)), {
      message: Status.STALE_VERSION_MESSAGE,
      keepOpen: true,
    });

    // Staff review it and send the quotation. The customer comes back to the page: it reads again.
    await review(staff.client, quote.id);
    await move(staff.client, quote.id, "Quoted");
    ({ held } = await refreshed(customer.client, held));
    const quoted = await row(quote.id);
    assertEquals(held[0].quotation, {
      referenceId: quote.reference_id,
      status: "Quoted",
      version: quoted.version,
    });
    assert(Status.canWithdraw(held[0].quotation));

    // With the current version, the withdrawal goes through, recorded once.
    const done = await withdrawQuotationRequest(
      quote.id,
      held[0].quotation!.version,
      "Bought elsewhere",
      {
        supabaseClient: customer.client,
      },
    );
    assertEquals(done, { ok: true, status: "Withdrawn", version: quoted.version + 1 });
    ({ held } = await refreshed(customer.client, held));
    assertEquals(held[0].quotation!.status, "Withdrawn");
    assert(!Status.canWithdraw(held[0].quotation));

    // Again: refused by the server, and the page says it can no longer be withdrawn.
    const again = await withdrawQuotationRequest(quote.id, held[0].quotation!.version, undefined, {
      supabaseClient: customer.client,
    });
    assertEquals(again, { ok: false, code: "invalid_transition" });
    assertEquals(Status.withdrawFailureOutcome("invalid_transition", held[0].quotation), {
      message: Status.CANNOT_WITHDRAW_MESSAGE,
      keepOpen: false,
    });
    const withdrawals = await sql<{ n: bigint }>(
      "select count(*) as n from public.quotation_events where quotation_id = $1 and to_status = 'Withdrawn'",
      quote.id,
    );
    assertEquals(Number(withdrawals[0].n), 1);
  },
);

dbTest(
  "S4S6-LC2: IT HUB closes it while the browser holds an old copy: shown as closed, and never withdrawable",
  async () => {
    const customer = await createSignedInUser("lc2-customer");
    const staff = await createSignedInUser("lc2-staff", "quotation_staff");
    const quote = await submit(customer.id);
    let held: Held[] = [{ id: quote.id, name: "Synthetic lifecycle build" }];
    ({ held } = await refreshed(customer.client, held));

    await move(staff.client, quote.id, "Contacted");
    await review(staff.client, quote.id);
    await move(staff.client, quote.id, "Quoted");
    await move(staff.client, quote.id, "Closed", "Customer bought the parts in the shop");
    const closed = await row(quote.id);
    assertEquals(closed.enquiry_status, "Closed");

    // The browser still says New, version 1: the server refuses it as stale.
    const stale = await withdrawQuotationRequest(quote.id, 1, undefined, {
      supabaseClient: customer.client,
    });
    assertEquals(stale, { ok: false, code: "stale_version" });
    // The page reads again, shows "Completed", closes the withdrawal and says why.
    const read = await refreshed(customer.client, held);
    held = read.held;
    assertEquals(held[0].quotation!.status, "Closed");
    assertEquals(Status.customerStatusLabel("Closed"), "Completed");
    assert(!Status.canWithdraw(held[0].quotation));
    assertEquals(Status.withdrawFailureOutcome("stale_version", read.states.get(quote.id)), {
      message: Status.CANNOT_WITHDRAW_MESSAGE,
      keepOpen: false,
    });
    // Even with the current version, the server refuses: the browser can't make it withdrawable.
    const current = await withdrawQuotationRequest(quote.id, closed.version, undefined, {
      supabaseClient: customer.client,
    });
    assertEquals(current, { ok: false, code: "invalid_transition" });
    assertEquals(await row(quote.id), closed, "nothing changed");
  },
);

dbTest(
  "S4S6-F1-DB: only the server stores a verdict, once: no insert by customers or staff, no change by anyone",
  async () => {
    const customer = await createSignedInUser("f1-customer");
    const staff = await createSignedInUser("f1-staff", "quotation_staff");
    const admin = await createSignedInUser("f1-admin", "portal_admin");
    const partial = { assessedBy: "server", state: "complete" };
    // A build inserted directly with a verdict (partial or not): refused for customers and every staff role.
    for (const [who, user] of [
      ["customer", customer],
      ["staff", staff],
      ["admin", admin],
    ] as const) {
      const inserted = await user.client.from("pc_builds").insert({
        user_id: who === "customer" ? customer.id : user.id,
        name: "Forged verdict",
        parts: {},
        server_assessment: partial,
      });
      assertNotEquals(inserted.error, null, `${who} inserted a verdict`);
    }
    // Once stored by the server, the verdict can't change, even through the service role's own API access.
    const quote = await submit(customer.id);
    const update = await service()
      .from("pc_builds")
      .update({ server_assessment: partial })
      .eq("id", quote.id);
    assertNotEquals(update.error, null, "the service role changed a stored verdict");
    const [stored] = await sql<{ server_assessment: unknown }>(
      "select server_assessment from public.pc_builds where id = $1",
      quote.id,
    );
    assertEquals(stored.server_assessment, JSON.parse(JSON.stringify(quote.verdict)));
    // No forged row was left behind by any of the refused inserts.
    const forged = await sql<{ n: bigint }>(
      "select count(*) as n from public.pc_builds where name = 'Forged verdict' and user_id = any($1::uuid[])",
      [customer.id, staff.id, admin.id],
    );
    assertEquals(Number(forged[0].n), 0);
  },
);

dbTest(
  "S4S6-LC3: a forged or someone else's copy is never trusted: the server decides on its own records",
  async () => {
    const customer = await createSignedInUser("lc3-customer");
    const stranger = await createSignedInUser("lc3-stranger");
    const staff = await createSignedInUser("lc3-staff", "quotation_staff");
    const quote = await submit(customer.id);
    await move(staff.client, quote.id, "Contacted");
    const contacted = await row(quote.id);

    // A browser claiming a higher version than the database's: refused, and the read puts the real one back.
    const forged = await withdrawQuotationRequest(quote.id, 99, undefined, {
      supabaseClient: customer.client,
    });
    assertEquals(forged, { ok: false, code: "stale_version" });
    const { held } = await refreshed(customer.client, [
      {
        id: quote.id,
        name: "Forged",
        quotation: { referenceId: "ITH-PC-FORGED", status: "New", version: 99 },
      },
    ]);
    assertEquals(held[0].quotation, {
      referenceId: quote.reference_id,
      status: "Contacted",
      version: contacted.version,
    });

    // Another customer: their read never includes it, and their withdrawal finds nothing, even at the right version.
    const theirs = await loadQuotationStates({ supabaseClient: stranger.client });
    assert(theirs && !theirs.has(quote.id));
    const notTheirs = await withdrawQuotationRequest(quote.id, contacted.version, undefined, {
      supabaseClient: stranger.client,
    });
    assertEquals(notTheirs, { ok: false, code: "not_found" });

    // Staff reading through the customer's path see only their own builds (none), not the customer's.
    const staffStates = await loadQuotationStates({ supabaseClient: staff.client });
    assert(staffStates && !staffStates.has(quote.id));
    assertEquals(await row(quote.id), contacted, "nothing changed");
  },
);
