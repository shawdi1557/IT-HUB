// Stage 4S-4: secure quotation verification, the database's side (migration 20261111000001), proven on the
// disposable stack with real signed-in synthetic users. Who may submit, the rate limits, atomic repeat handling,
// what customers and staff can and can't change, withdrawal, and the append-only history.
//
// DISPOSABLE STACK ONLY (dbTest). Synthetic users and quotations; nothing here is IT HUB data.

import {
  assert,
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import {
  dbTest,
  TEST_ANON_KEY,
  TEST_DB_URL,
  TEST_SERVICE_KEY,
  TEST_SUPABASE_URL,
} from "./_helpers/disposable_env.ts";
import { createSignedInUser } from "./_helpers/test_users.ts";

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };
const service = () => createClient(TEST_SUPABASE_URL, TEST_SERVICE_KEY, NO_SESSION);
const hex64 = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function sql<T = Record<string, unknown>>(text: string, ...args: unknown[]): Promise<T[]> {
  const pg = new PgClient(TEST_DB_URL);
  await pg.connect();
  try {
    return (await pg.queryObject<T>(text, args)).rows;
  } finally {
    await pg.end();
  }
}

/** A signed-in user with an account but no confirmed phone (an email-only account), or an unconfirmed one. */
async function accountWithoutConfirmedPhone(label: string, phone?: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const created = await service().auth.admin.createUser({
    email,
    password: `Synthetic-${crypto.randomUUID()}`,
    email_confirm: true,
    ...(phone ? { phone, phone_confirm: false } : {}),
  });
  if (created.error || !created.data.user) throw new Error(`fixture: ${created.error?.message}`);
  return created.data.user.id;
}

/** A synthetic Indian mobile number, different on every run. */
const syntheticPhone = () =>
  `+918${String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000).padStart(9, "0")}`;

const guard = (userId: string, ipKey: string | null = null) =>
  service().rpc("pc_quotation_guard", { p_user_id: userId, p_ip_key: ipKey });

/** A quotation stored as the Edge Function stores it. */
async function submitted(
  userId: string,
  fingerprint = crypto.randomUUID(),
  extra: Record<string, unknown> = {},
) {
  const { data, error } = await service().rpc("create_pc_quotation", {
    p_user_id: userId,
    p_fingerprint: fingerprint,
    p_quotation: {
      name: "Synthetic 4S-4",
      parts: { CPU: { slot: "CPU", variantId: "gid://shopify/ProductVariant/s4s4", quantity: 1 } },
      estimated_price: 50000,
      authoritative_price: 50000,
      price_divergence: 0,
      technician_review_required: false,
      compatibility: { status: "compatible", reportedBy: "customer_browser" },
      server_assessment: { assessedBy: "server", stage: "4S-3", state: "complete" },
      customer_name: "Synthetic",
      customer_phone: "919800000001",
      customer_email: "s4s4@example.test",
      ...extra,
    },
  });
  if (error) throw new Error(`create_pc_quotation: ${error.message}`);
  return data as { duplicate: boolean; id: string; reference_id: string };
}

const row = async (id: string) =>
  (await service().from("pc_builds").select("*").eq("id", id).single()).data;

// ── Who may submit (D8) ───────────────────────────────────────────────────────────────────────────────

dbTest("S4S4-DB-1: only a customer account with a confirmed phone passes the guard", async () => {
  const customer = await createSignedInUser("s4s4-customer");
  assertEquals((await guard(customer.id)).data, { allowed: true });

  const quotationStaff = await createSignedInUser("s4s4-qstaff", "quotation_staff");
  const serviceStaff = await createSignedInUser("s4s4-sstaff", "service_staff");
  const portalAdmin = await createSignedInUser("s4s4-padmin", "portal_admin");
  const profileAdmin = await createSignedInUser("s4s4-profadmin");
  await sql("update public.profiles set role = 'admin' where id = $1", profileAdmin.id);
  for (const [label, id] of [
    ["quotation staff", quotationStaff.id],
    ["service staff", serviceStaff.id],
    ["portal admin", portalAdmin.id],
    ["admin profile", profileAdmin.id],
    ["no phone", await accountWithoutConfirmedPhone("s4s4-nophone")],
    ["unconfirmed phone", await accountWithoutConfirmedPhone("s4s4-unconfirmed", syntheticPhone())],
  ] as [string, string][]) {
    assertEquals(
      (await guard(id)).data,
      { allowed: false, code: "customer_account_required" },
      label,
    );
  }
  // A deactivated staff member is no longer staff.
  await sql(
    "update public.staff_members set is_active = false where user_id = $1",
    serviceStaff.id,
  );
  assertEquals((await guard(serviceStaff.id)).data, { allowed: true });
});

// ── Rate limits (F9, F10, E5) ─────────────────────────────────────────────────────────────────────────

dbTest("S4S4-DB-2: five a minute per customer; another customer is unaffected", async () => {
  const first = await createSignedInUser("s4s4-limit-a");
  const second = await createSignedInUser("s4s4-limit-b");
  for (let i = 1; i <= 5; i++)
    assertEquals((await guard(first.id)).data, { allowed: true }, String(i));
  assertEquals((await guard(first.id)).data, {
    allowed: false,
    code: "rate_limited",
    limit: "customer",
  });
  assertEquals((await guard(second.id)).data, { allowed: true });
});

dbTest(
  "S4S4-DB-3: twenty a minute per hashed IP; customers sharing one IP each get their full five",
  async () => {
    const ip = hex64();
    const customers = [];
    for (let i = 0; i < 5; i++) customers.push(await createSignedInUser(`s4s4-shared-${i}`));
    // Four customers behind one IP each use all five of their requests: 20, all allowed.
    for (const customer of customers.slice(0, 4)) {
      for (let i = 1; i <= 5; i++) {
        assertEquals((await guard(customer.id, ip)).data, { allowed: true });
      }
    }
    // A fifth customer on the same IP is now held by the IP limit, though well under their own.
    assertEquals((await guard(customers[4].id, ip)).data, {
      allowed: false,
      code: "rate_limited",
      limit: "ip",
    });
    // The same customer from another IP is fine.
    assertEquals((await guard(customers[4].id, hex64())).data, { allowed: true });
    // Only hashes are accepted, and only keys are stored, never an address.
    const raw = await guard(customers[4].id, "203.0.113.7");
    assertEquals(raw.error?.code, "22023");
    const keys = await sql<{ ip_hash: string; endpoint: string }>(
      "select ip_hash, endpoint from public.rate_limits where endpoint like 'pc-quotation-%'",
    );
    assert(keys.length > 0);
    for (const { ip_hash, endpoint } of keys) {
      assertMatch(
        ip_hash,
        endpoint === "pc-quotation-ip" ? /^ip:[0-9a-f]{64}$/ : /^user:[0-9a-f-]{36}$/,
      );
    }
  },
);

dbTest(
  "S4S4-DB-4: the limiter has no first-request race: simultaneous first requests all get an answer",
  async () => {
    const customer = await createSignedInUser("s4s4-race");
    const answers = await Promise.all(Array.from({ length: 8 }, () => guard(customer.id)));
    for (const answer of answers) assertEquals(answer.error, null);
    const allowed = answers.filter((answer) => answer.data?.allowed === true).length;
    assertEquals(allowed, 5);
  },
);

// ── Creating quotations (D9, D10, F11) ────────────────────────────────────────────────────────────────

dbTest(
  "S4S4-DB-5: a stored quotation: strong reference, version 1, New, its verdict, and a submitted event",
  async () => {
    const customer = await createSignedInUser("s4s4-create");
    const result = await submitted(customer.id);
    assertEquals(result.duplicate, false);
    assertMatch(result.reference_id, /^ITH-PC-\d{8}-[0-9A-F]{10}$/);
    const stored = await row(result.id);
    assertEquals([stored.enquiry_status, stored.version, stored.user_id], ["New", 1, customer.id]);
    assertEquals(stored.server_assessment.state, "complete");
    const events = await service()
      .from("quotation_events")
      .select("*")
      .eq("quotation_id", result.id);
    assertEquals(events.data?.length, 1);
    assertEquals(events.data?.[0].event_type, "submitted");
    assertEquals(events.data?.[0].actor_type, "customer");
    assertEquals(events.data?.[0].actor_user_id, customer.id);
    assertEquals(events.data?.[0].to_status, "New");
  },
);

dbTest(
  "S4S4-DB-6: identical simultaneous submissions store one quotation; anything different stores another",
  async () => {
    const customer = await createSignedInUser("s4s4-repeat");
    const other = await createSignedInUser("s4s4-repeat-other");
    const fingerprint = crypto.randomUUID();
    const answers = await Promise.all(
      Array.from({ length: 6 }, () => submitted(customer.id, fingerprint)),
    );
    const references = new Set(answers.map((answer) => answer.reference_id));
    assertEquals(references.size, 1);
    assertEquals(answers.filter((answer) => !answer.duplicate).length, 1);
    const rows = await service()
      .from("pc_builds")
      .select("id")
      .eq("request_fingerprint", fingerprint);
    assertEquals(rows.data?.length, 1);
    const first = answers.find((answer) => !answer.duplicate)!;

    // Another request, another customer: new quotations.
    assertEquals((await submitted(customer.id, crypto.randomUUID())).duplicate, false);
    assertEquals((await submitted(other.id, fingerprint)).duplicate, false);
    // The same request more than two minutes later: new.
    await sql(
      "update public.pc_builds set created_at = now() - interval '3 minutes' where id = $1",
      first.id,
    );
    const later = await submitted(customer.id, fingerprint);
    assertEquals(later.duplicate, false);
    assertNotEquals(later.reference_id, first.reference_id);
  },
);

// ── What customers can't change (D5, D6, G2, G3) ──────────────────────────────────────────────────────

dbTest(
  "S4S4-DB-7: a customer can't read the verdict, edit, re-status, forge or delete a submitted quotation",
  async () => {
    const customer = await createSignedInUser("s4s4-protect");
    const quote = await submitted(customer.id);
    const db = customer.client;

    // The verdict isn't theirs to read (D5); the version is, to withdraw.
    const verdict = await db.from("pc_builds").select("server_assessment").eq("id", quote.id);
    assertNotEquals(verdict.error, null);
    const own = await db
      .from("pc_builds")
      .select("id, version, reference_id, enquiry_status")
      .eq("id", quote.id)
      .single();
    assertEquals([own.data?.version, own.data?.enquiry_status], [1, "New"]);

    // Editing a submitted quotation, or changing its status or version: refused.
    assertNotEquals(
      (await db.from("pc_builds").update({ name: "Edited" }).eq("id", quote.id)).error,
      null,
    );
    assertNotEquals(
      (await db.from("pc_builds").update({ enquiry_status: "Draft" }).eq("id", quote.id)).error,
      null,
    );
    assertNotEquals(
      (await db.from("pc_builds").update({ version: 9 }).eq("id", quote.id)).error,
      null,
    );
    // Inserting a submitted-looking row: refused.
    const forged = await db.from("pc_builds").insert({
      user_id: customer.id,
      name: "Forged",
      parts: {},
      estimated_price: 1,
      enquiry_status: "New",
      reference_id: "ITH-PC-FORGED",
    });
    assertNotEquals(forged.error, null);
    // Deleting it: nothing deleted.
    await db.from("pc_builds").delete().eq("id", quote.id);
    assertEquals((await row(quote.id))?.enquiry_status, "New");

    // Their own draft stays fully theirs.
    const draft = await db
      .from("pc_builds")
      .insert({
        user_id: customer.id,
        name: "Draft",
        parts: {},
        estimated_price: 1,
        enquiry_status: "Draft",
      })
      .select("id")
      .single();
    assertEquals(draft.error, null);
    assertEquals(
      (await db.from("pc_builds").update({ name: "Renamed" }).eq("id", draft.data!.id)).error,
      null,
    );
    assertEquals((await row(draft.data!.id))?.name, "Renamed");
    await db.from("pc_builds").delete().eq("id", draft.data!.id);
    assertEquals(await row(draft.data!.id), null);
  },
);

dbTest(
  "S4S4-DB-8: staff can't change status directly, return a quotation to Draft, forge one, or delete it",
  async () => {
    const customer = await createSignedInUser("s4s4-staffside");
    const staff = await createSignedInUser("s4s4-staffside-q", "quotation_staff");
    const admin = await createSignedInUser("s4s4-staffside-a", "portal_admin");
    const quote = await submitted(customer.id);

    assertNotEquals(
      (await staff.client.from("pc_builds").update({ enquiry_status: "Closed" }).eq("id", quote.id))
        .error,
      null,
    );
    // Through the staff transition function (Stage 4S-5), a submitted quotation can't return to Draft (D6).
    const toDraft = await staff.client.rpc("staff_transition_pc_quotation", {
      p_quotation_id: quote.id,
      p_to_status: "Draft",
      p_expected_version: 1,
    });
    assertNotEquals(toDraft.error, null);
    assertEquals((await row(quote.id))?.enquiry_status, "New");
    // Other moves work through it.
    const toContacted = await staff.client.rpc("staff_transition_pc_quotation", {
      p_quotation_id: quote.id,
      p_to_status: "Contacted",
      p_expected_version: 1,
    });
    assertEquals(toContacted.error, null);
    // Staff can't create a quotation directly.
    const forged = await staff.client.from("pc_builds").insert({
      user_id: customer.id,
      name: "Forged by staff",
      parts: {},
      estimated_price: 1,
      enquiry_status: "New",
      reference_id: `ITH-PC-STAFF-${crypto.randomUUID().slice(0, 6)}`,
    });
    assertNotEquals(forged.error, null);
    // Nobody deletes a submitted quotation through the API, administrators included.
    await admin.client.from("pc_builds").delete().eq("id", quote.id);
    assertNotEquals(await row(quote.id), null);
  },
);

// ── Withdrawal (D7) ───────────────────────────────────────────────────────────────────────────────────

dbTest(
  "S4S4-DB-9: the owner withdraws from New, Contacted or Quoted, recorded, with version checks",
  async () => {
    const customer = await createSignedInUser("s4s4-withdraw");
    const stranger = await createSignedInUser("s4s4-withdraw-x");
    const staff = await createSignedInUser("s4s4-withdraw-q", "quotation_staff");
    const withdraw = (client: any, id: string, version: number | null, reason?: string) =>
      client.rpc("customer_withdraw_pc_quotation", {
        p_quotation_id: id,
        p_expected_version: version,
        p_reason: reason ?? null,
      });

    const quote = await submitted(customer.id);
    // Someone else's, staff included: not found.
    for (const client of [stranger.client, staff.client]) {
      const result = await withdraw(client, quote.id, 1);
      assertEquals(result.status, 404);
      assertEquals(result.error?.message, "quotation_not_found");
    }
    // A stale version: 409, nothing changed.
    const stale = await withdraw(customer.client, quote.id, 7);
    assertEquals(stale.status, 409);
    assertEquals(stale.error?.message, "stale_version");
    assertEquals((await row(quote.id))?.enquiry_status, "New");
    // A reason too long: refused.
    assertNotEquals((await withdraw(customer.client, quote.id, 1, "x".repeat(1001))).error, null);
    // Withdrawn, with the version moved on and the event recorded.
    const ok = await withdraw(customer.client, quote.id, 1, "  Bought elsewhere  ");
    assertEquals(ok.error, null);
    assertEquals(ok.data, { ok: true, status: "Withdrawn", version: 2 });
    const after = await row(quote.id);
    assertEquals([after.enquiry_status, after.version], ["Withdrawn", 2]);
    const events = (
      await service().from("quotation_events").select("*").eq("quotation_id", quote.id).order("id")
    ).data!;
    assertEquals(
      events.map((event) => event.event_type),
      ["submitted", "withdrawn"],
    );
    assertEquals(
      [events[1].from_status, events[1].to_status, events[1].reason, events[1].version],
      ["New", "Withdrawn", "Bought elsewhere", 2],
    );
    // Withdrawn is final.
    const again = await withdraw(customer.client, quote.id, 2);
    assertEquals(again.status, 409);
    assertEquals(again.error?.message, "invalid_transition");

    // From Contacted and Quoted too; never from Closed.
    for (const [status, allowed] of [
      ["Contacted", true],
      ["Quoted", true],
      ["Closed", false],
    ] as const) {
      const next = await submitted(customer.id);
      // Since Stage 4S-5 each staff move bumps the version, so the customer withdraws at version 2.
      const moved = await staff.client.rpc("staff_transition_pc_quotation", {
        p_quotation_id: next.id,
        p_to_status: status,
        p_expected_version: 1,
        p_reason: status === "Closed" ? "Synthetic reason" : null,
      });
      assertEquals(moved.error, null, status);
      const result = await withdraw(customer.client, next.id, 2);
      assertEquals(result.error === null, allowed, status);
      if (!allowed) assertEquals(result.error?.message, "invalid_transition");
    }
    // A draft was never submitted: there's nothing to withdraw.
    const draft = await customer.client
      .from("pc_builds")
      .insert({
        user_id: customer.id,
        name: "Draft",
        parts: {},
        estimated_price: 1,
        enquiry_status: "Draft",
      })
      .select("id")
      .single();
    assertEquals((await withdraw(customer.client, draft.data!.id, 1)).status, 404);
  },
);

// ── History (D10) ─────────────────────────────────────────────────────────────────────────────────────

dbTest(
  "S4S4-DB-10: the history is append-only, for staff eyes only, and written only by the functions",
  async () => {
    const customer = await createSignedInUser("s4s4-events");
    const staff = await createSignedInUser("s4s4-events-q", "quotation_staff");
    const quote = await submitted(customer.id);

    assertEquals(
      (await customer.client.from("quotation_events").select("id").eq("quotation_id", quote.id))
        .data,
      [],
    );
    assertEquals(
      (
        await staff.client
          .from("quotation_events")
          .select("event_type")
          .eq("quotation_id", quote.id)
      ).data,
      [{ event_type: "submitted" }],
    );
    for (const client of [customer.client, staff.client]) {
      const insert = await client.from("quotation_events").insert({
        quotation_id: quote.id,
        event_type: "withdrawn",
        actor_type: "customer",
      });
      assertNotEquals(insert.error, null);
    }
    // Not even the service role or the database owner can change or remove a row.
    assertNotEquals(
      (
        await service()
          .from("quotation_events")
          .update({ reason: "x" })
          .eq("quotation_id", quote.id)
      ).error,
      null,
    );
    assertNotEquals(
      (await service().from("quotation_events").delete().eq("quotation_id", quote.id)).error,
      null,
    );
    let ownerBlocked = false;
    try {
      await sql("delete from public.quotation_events where quotation_id = $1", quote.id);
    } catch {
      ownerBlocked = true;
    }
    assert(ownerBlocked, "the database owner deleted history");
    // A quotation with history can't be removed from under it either.
    assertNotEquals((await service().from("pc_builds").delete().eq("id", quote.id)).error, null);
  },
);

// ── Nothing to forge (refinement 2) ───────────────────────────────────────────────────────────────────

dbTest(
  "S4S4-DB-11: callers can't reach the server-only functions, set session values, or write the verdict",
  async () => {
    const customer = await createSignedInUser("s4s4-forge");
    const staff = await createSignedInUser("s4s4-forge-q", "quotation_staff");
    const anon = createClient(TEST_SUPABASE_URL, TEST_ANON_KEY, NO_SESSION);
    for (const client of [anon, customer.client, staff.client]) {
      assertNotEquals(
        (await client.rpc("pc_quotation_guard", { p_user_id: customer.id })).error,
        null,
      );
      assertNotEquals(
        (
          await client.rpc("create_pc_quotation", {
            p_user_id: customer.id,
            p_fingerprint: "f",
            p_quotation: {},
          })
        ).error,
        null,
      );
      // There is no session flag to forge, and no way to set one through the API.
      assertNotEquals(
        (await client.rpc("set_config", { setting_name: "x.y", new_value: "on", is_local: false }))
          .error,
        null,
      );
    }
    const quote = await submitted(customer.id);
    for (const client of [customer.client, staff.client]) {
      for (const change of [
        { server_assessment: { state: "complete" } },
        { request_fingerprint: "forged" },
        { reference_id: "ITH-PC-FORGED" },
        { version: 5 },
      ]) {
        assertNotEquals(
          (await client.from("pc_builds").update(change).eq("id", quote.id)).error,
          null,
          JSON.stringify(change),
        );
      }
    }
    const stored = await row(quote.id);
    assertEquals([stored.version, stored.server_assessment.state], [1, "complete"]);
  },
);
