// Shopify Hardware Importer: the database side (migration 20261113000003), proven on the disposable stack with real
// signed-in synthetic users. Category rules (exact, normalised, unknown, not hardware, manual correction, admin-only),
// staging and matching against the registry (already linked, exact match, possible duplicate, vendor as manufacturer),
// importing (single, bulk, partial failure, retry, repeat-safe), existing specifications untouched, the activity log,
// who may read and do what, and the PC Builder's registry read of an imported model.
//
// DISPOSABLE STACK ONLY (dbTest). Synthetic users, manufacturers, models and made-up Shopify ids; nothing contacts
// Shopify.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
const anon = () => createClient(TEST_SUPABASE_URL, TEST_ANON_KEY, NO_SESSION);

async function sql<T = Record<string, unknown>>(text: string, ...args: unknown[]): Promise<T[]> {
  const pg = new PgClient(TEST_DB_URL);
  await pg.connect();
  try {
    return (await pg.queryObject<T>(text, args)).rows;
  } finally {
    await pg.end();
  }
}

const unique = () => crypto.randomUUID().slice(0, 8);
const shopifyNumber = () => String(9_000_000_000 + Math.floor(Math.random() * 999_999_999));
const productGid = () => `gid://shopify/Product/${shopifyNumber()}`;

async function cast(label: string) {
  return {
    customer: await createSignedInUser(`${label}-c`),
    staff: await createSignedInUser(`${label}-q`, "quotation_staff"),
    admin: await createSignedInUser(`${label}-a`, "portal_admin"),
    serviceStaff: await createSignedInUser(`${label}-s`, "service_staff"),
  };
}

const rpc = async (client: any, fn: string, args: Record<string, unknown>) => {
  const { data, error } = await client.rpc(fn, args);
  return { data, error, code: error?.message as string | undefined };
};

async function manufacturer(client: any, name = `Synthetic Maker ${unique()}`) {
  const res = await rpc(client, "staff_save_hardware_manufacturer", {
    p_id: null,
    p_expected_version: null,
    p_name: name,
    p_website_url: null,
    p_is_active: true,
  });
  if (res.error) throw new Error(`manufacturer: ${res.error.message}`);
  return res.data;
}

const GPU_SPECS = {
  tdp_watts: 200,
  length_mm: 242,
  pcie_8pin_required: 1,
  pcie_16pin_required: 0,
  recommended_psu_watts: 650,
};

async function model(client: any, makerId: string, overrides: Record<string, unknown> = {}) {
  const res = await rpc(client, "staff_create_hardware_model", {
    p_category: "GPU",
    p_manufacturer_id: makerId,
    p_model_name: `Synthetic Board ${unique()}`,
    p_model_number: null,
    p_is_base: false,
    p_base_model_id: null,
    p_notes: null,
    p_specs: GPU_SPECS,
    p_confirm_distinct: false,
    p_reason: "first entry",
    ...overrides,
  });
  if (res.error) throw new Error(`model: ${res.error.message} ${res.error.details ?? ""}`);
  return res.data;
}

interface StagedProduct {
  id: string;
  title: string;
  vendor?: string | null;
  productType?: string | null;
  category?: string | null;
  tags?: string[];
  collections?: string[];
  variants?: Array<Record<string, unknown>>;
  suggestedCategory?: string | null;
}

/** Runs a discovery the way the Edge Function does (service role): begin, stage, finish. */
async function discover(actorId: string, role: string, products: StagedProduct[]) {
  const svc = service();
  const begun = await rpc(svc, "hardware_import_begin", { p_actor: actorId, p_actor_role: role });
  if (begun.error) throw new Error(`begin: ${begun.error.message}`);
  const sessionId = begun.data.id as string;
  const staged = await rpc(svc, "hardware_import_stage", {
    p_session_id: sessionId,
    p_products: products,
  });
  if (staged.error) throw new Error(`stage: ${staged.error.message}`);
  const done = await rpc(svc, "hardware_import_finish_discovery", {
    p_session_id: sessionId,
    p_error: null,
  });
  if (done.error) throw new Error(`finish: ${done.error.message}`);
  return sessionId;
}

async function items(sessionId: string) {
  return await sql<Record<string, any>>(
    "select * from public.hardware_import_items where session_id = $1 order by title",
    sessionId,
  );
}

async function itemFor(sessionId: string, productId: string) {
  const rows = await sql<Record<string, any>>(
    "select * from public.hardware_import_items where session_id = $1 and shopify_product_id = $2",
    sessionId,
    productId,
  );
  assert(rows[0], `item for ${productId}`);
  return rows[0];
}

const update = (client: any, item: Record<string, any>, args: Record<string, unknown>) =>
  rpc(client, "staff_update_import_item", {
    p_item_id: item.id,
    p_expected_version: item.version,
    p_category_id: null,
    p_manufacturer_id: null,
    p_model_name: null,
    p_model_number: null,
    p_decision: null,
    p_target_model_id: null,
    p_confirm_distinct: null,
    ...args,
  });

dbTest(
  "IMP-DB-1: category rules map exactly and normalised, unknown stays unmapped, not-hardware is excluded, manual wins",
  async () => {
    const people = await cast("imp1");
    const tag = `synthetic-gpu-tag-${unique()}`;
    const rule = await rpc(people.admin.client, "staff_save_import_category_rule", {
      p_id: null,
      p_expected_version: null,
      p_match_field: "tag",
      p_match_value: tag,
      p_category_id: "GPU",
      p_priority: 50,
      p_is_active: true,
      p_note: "synthetic",
    });
    assertEquals(rule.error, null);

    const exact = { id: productGid(), title: `Exact ${unique()}`, category: "Computer Processors" };
    const normalised = {
      id: productGid(),
      title: `Norm ${unique()}`,
      category: "  video cards AND adapters ",
    };
    const unknown = {
      id: productGid(),
      title: `Unknown ${unique()}`,
      category: `Mystery ${unique()}`,
    };
    const phone = { id: productGid(), title: `Phone ${unique()}`, category: "Smart Phones" };
    const byTag = { id: productGid(), title: `Tagged ${unique()}`, tags: [tag.toUpperCase()] };
    const sessionId = await discover(people.staff.id, "quotation_staff", [
      exact,
      normalised,
      unknown,
      phone,
      byTag,
    ]);

    assertEquals((await itemFor(sessionId, exact.id)).category_id, "CPU");
    assertEquals((await itemFor(sessionId, exact.id)).category_source, "rule");
    // "video cards AND adapters" isn't "Video Cards & Adapters": normalisation drops case, spaces and punctuation only.
    assertEquals((await itemFor(sessionId, normalised.id)).status, "unmapped");
    const unk = await itemFor(sessionId, unknown.id);
    assertEquals([unk.status, unk.category_id, unk.decision], ["unmapped", null, null]);
    const ph = await itemFor(sessionId, phone.id);
    assertEquals([ph.status, ph.excluded, ph.decision], ["excluded", true, "skip"]);
    assertEquals((await itemFor(sessionId, byTag.id)).category_id, "GPU");

    // A normalised match: case, spacing and punctuation differ.
    const sessionB = await discover(people.staff.id, "quotation_staff", [
      { id: productGid(), title: `Norm2 ${unique()}`, category: "video-cards & ADAPTERS" },
    ]);
    assertEquals((await items(sessionB))[0].category_id, "GPU");

    // Manual correction: staff choose the category; it stands over the rules and survives re-evaluation.
    const fixed = await update(people.staff.client, unk, { p_category_id: "Storage" });
    assertEquals(fixed.error, null);
    assertEquals([fixed.data.category_id, fixed.data.category_source], ["Storage", "manual"]);
    await rpc(people.staff.client, "staff_reevaluate_import_session", { p_session_id: sessionId });
    assertEquals((await itemFor(sessionId, unknown.id)).category_id, "Storage");
    // An excluded product can be brought in by a manual category.
    const inc = await update(people.staff.client, ph, { p_category_id: "Monitor" });
    assertEquals([inc.data.excluded, inc.data.category_id], [false, "Monitor"]);

    // Rules: administrators only; duplicates refused; bad values refused.
    for (const who of [people.staff.client, people.serviceStaff.client, people.customer.client]) {
      const refused = await rpc(who, "staff_save_import_category_rule", {
        p_id: null,
        p_expected_version: null,
        p_match_field: "tag",
        p_match_value: `x-${unique()}`,
        p_category_id: "GPU",
        p_priority: 1,
        p_is_active: true,
        p_note: null,
      });
      assertEquals(refused.code, "forbidden");
    }
    const dup = await rpc(people.admin.client, "staff_save_import_category_rule", {
      p_id: null,
      p_expected_version: null,
      p_match_field: "tag",
      p_match_value: ` ${tag.toUpperCase()}!`,
      p_category_id: "CPU",
      p_priority: 1,
      p_is_active: true,
      p_note: null,
    });
    assertEquals(dup.code, "duplicate_rule");
    const badField = await rpc(people.admin.client, "staff_save_import_category_rule", {
      p_id: null,
      p_expected_version: null,
      p_match_field: "vendor",
      p_match_value: "x",
      p_category_id: "GPU",
      p_priority: 1,
      p_is_active: true,
      p_note: null,
    });
    assertEquals(badField.code, "match_field_invalid");
    // Switching a rule off: a re-evaluation leaves its products unmapped.
    const off = await rpc(people.admin.client, "staff_save_import_category_rule", {
      p_id: rule.data.id,
      p_expected_version: rule.data.version,
      p_match_field: "tag",
      p_match_value: tag,
      p_category_id: "GPU",
      p_priority: 50,
      p_is_active: false,
      p_note: "synthetic",
    });
    assertEquals(off.error, null);
    const stale = await rpc(people.admin.client, "staff_save_import_category_rule", {
      p_id: rule.data.id,
      p_expected_version: rule.data.version,
      p_match_field: "tag",
      p_match_value: tag,
      p_category_id: "GPU",
      p_priority: 50,
      p_is_active: true,
      p_note: null,
    });
    assertEquals(stale.code, "stale_version");
    await rpc(people.staff.client, "staff_reevaluate_import_session", { p_session_id: sessionId });
    assertEquals((await itemFor(sessionId, byTag.id)).status, "unmapped");
    const logged = await sql<{ n: number }>(
      "select count(*)::int as n from public.hardware_activity_log where action = 'import_rule_changed' and new ->> 'match_value' = $1",
      tag,
    );
    assertEquals(logged[0].n, 2);
  },
);

dbTest(
  "IMP-DB-2: matching: vendor as manufacturer, already linked, exact match, possible duplicate, needs review",
  async () => {
    const people = await cast("imp2");
    const maker = await manufacturer(people.staff.client);
    const linkedModel = await model(people.staff.client, maker.id);
    const linkedProduct = productGid();
    const link = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: linkedModel.id,
      p_product_id: linkedProduct,
      p_variant_id: null,
      p_product_title: "old title",
      p_variant_title: null,
      p_reason: null,
    });
    assertEquals(link.error, null);
    const exactModel = await model(people.staff.client, maker.id, {
      p_model_name: `Exact Board ${unique()}`,
      p_model_number: "EX-100",
    });
    const nearModel = await model(people.staff.client, maker.id, {
      p_model_name: `Velocity Storm ${unique()}`,
    });

    const products = {
      linked: {
        id: linkedProduct,
        title: "Linked listing",
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
      exact: {
        id: productGid(),
        title: exactModel.model_name,
        vendor: maker.name.toUpperCase(),
        category: "Video Cards & Adapters",
      },
      near: {
        id: productGid(),
        title: `${nearModel.model_name} OC Edition`,
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
      store: {
        id: productGid(),
        title: `Store Vendor ${unique()}`,
        vendor: "IT-HUB",
        category: "Video Cards & Adapters",
      },
      fresh: {
        id: productGid(),
        title: `Brand New ${unique()}`,
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
    };
    const sessionId = await discover(people.admin.id, "portal_admin", Object.values(products));

    const linked = await itemFor(sessionId, products.linked.id);
    assertEquals(
      [linked.status, linked.existing_link_id, linked.match_model_id, linked.decision],
      ["already_linked", link.data.id, linkedModel.id, "skip"],
    );
    // Exact match needs the model number too: the title alone gives "name|" which differs from "name|ex100".
    const exactItem = await itemFor(sessionId, products.exact.id);
    assertEquals(exactItem.manufacturer_source, "vendor");
    assertEquals(exactItem.status, "possible_duplicate");
    const withNumber = await update(people.staff.client, exactItem, { p_model_number: "ex 100" });
    assertEquals(withNumber.error, null);
    assertEquals(
      [withNumber.data.status, withNumber.data.match_model_id, withNumber.data.decision],
      ["exact_match", exactModel.id, "link_existing"],
    );

    const near = await itemFor(sessionId, products.near.id);
    assertEquals([near.status, near.decision], ["possible_duplicate", null]);
    assert(near.duplicate_candidates.some((c: any) => c.id === nearModel.id));
    // "New" without confirming it's different is refused, not silently dropped.
    const unconfirmed = await update(people.staff.client, near, { p_decision: "import_new" });
    assertEquals(unconfirmed.code, "decision_not_allowed");
    // Linking to a model that isn't among the candidates is refused.
    const wrongTarget = await update(people.staff.client, near, {
      p_decision: "link_existing",
      p_target_model_id: linkedModel.id,
    });
    assertEquals(wrongTarget.code, "decision_not_allowed");
    const confirmed = await update(people.staff.client, near, {
      p_decision: "import_new",
      p_confirm_distinct: true,
    });
    assertEquals([confirmed.error, confirmed.data.decision], [null, "import_new"]);
    // Stale versions are refused.
    const stale = await update(people.staff.client, near, { p_decision: "skip" });
    assertEquals(stale.code, "stale_version");

    const store = await itemFor(sessionId, products.store.id);
    assertEquals(
      [store.status, store.manufacturer_id, store.decision],
      ["needs_review", null, null],
    );
    const fresh = await itemFor(sessionId, products.fresh.id);
    assertEquals(
      [fresh.status, fresh.decision, fresh.model_name],
      ["eligible", "import_new", products.fresh.title],
    );

    const session = (
      await sql<Record<string, any>>(
        "select * from public.hardware_import_sessions where id = $1",
        sessionId,
      )
    )[0];
    assertEquals(session.status, "ready");
    assertEquals(session.counts.discovered, 5);
    assertEquals(session.counts.already_linked, 1);
    assertEquals(session.counts.needs_review, 1);
  },
);

dbTest(
  "IMP-DB-3: import single, bulk, partial failure, retry and repeat create each model and link exactly once",
  async () => {
    const people = await cast("imp3");
    const maker = await manufacturer(people.staff.client);
    const existing = await model(people.staff.client, maker.id, {
      p_model_name: `Kept Spec ${unique()}`,
      p_model_number: "KS-1",
    });
    const before = (
      await sql<Record<string, any>>(
        "select * from public.hardware_models where id = $1",
        existing.id,
      )
    )[0];

    const p = {
      a: {
        id: productGid(),
        title: `Alpha Card ${unique()}`,
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
      b: {
        id: productGid(),
        title: `Bravo Card ${unique()}`,
        vendor: "IT-HUB",
        category: "Video Cards & Adapters",
      },
      c: {
        id: productGid(),
        title: existing.model_name,
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
      d: {
        id: productGid(),
        title: `Delta Card ${unique()}`,
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
    };
    const sessionId = await discover(people.staff.id, "quotation_staff", Object.values(p));
    const c0 = await itemFor(sessionId, p.c.id);
    const cFixed = await update(people.staff.client, c0, { p_model_number: "KS-1" });
    assertEquals(cFixed.data.status, "exact_match");

    // Single.
    const a = await itemFor(sessionId, p.a.id);
    const single = await rpc(people.staff.client, "staff_import_items", {
      p_session_id: sessionId,
      p_item_ids: [a.id],
    });
    assertEquals(single.error, null);
    assertEquals(single.data.results[0].action, "created_model");
    const aDone = await itemFor(sessionId, p.a.id);
    const created = (
      await sql<Record<string, any>>(
        "select * from public.hardware_models where id = $1",
        aDone.result_model_id,
      )
    )[0];
    assertEquals(
      [created.category_id, created.manufacturer_id, created.spec_revision],
      ["GPU", maker.id, 0],
    );
    assertEquals(created.specs, {});
    const revs = await sql<{ n: number }>(
      "select count(*)::int as n from public.hardware_spec_revisions where model_id = $1",
      created.id,
    );
    assertEquals(revs[0].n, 0);

    // Bulk with a failure in the middle: b has no manufacturer (no decision), the others still go through.
    const b = await itemFor(sessionId, p.b.id);
    const c = await itemFor(sessionId, p.c.id);
    const d = await itemFor(sessionId, p.d.id);
    const bulk = await rpc(people.staff.client, "staff_import_items", {
      p_session_id: sessionId,
      p_item_ids: [b.id, c.id, d.id, a.id],
    });
    assertEquals(bulk.error, null);
    const byId = Object.fromEntries(bulk.data.results.map((r: any) => [r.item_id, r]));
    assertEquals([byId[b.id].status, byId[b.id].error], ["failed", "decision_required"]);
    assertEquals(byId[c.id].action, "linked_existing");
    assertEquals(byId[d.id].action, "created_model");
    assertEquals([byId[a.id].status, byId[a.id].repeat], ["imported", true]);
    assertEquals(bulk.data.counts.failed, 1);

    // The existing model's specification is untouched by linking.
    const after = (
      await sql<Record<string, any>>(
        "select * from public.hardware_models where id = $1",
        existing.id,
      )
    )[0];
    assertEquals(
      [after.specs, after.spec_revision, after.version],
      [before.specs, before.spec_revision, before.version],
    );

    // Retry after correcting the failure.
    const bFailed = await itemFor(sessionId, p.b.id);
    assertEquals([bFailed.status, bFailed.attempts], ["failed", 1]);
    const bFixed = await update(people.staff.client, bFailed, { p_manufacturer_id: maker.id });
    assertEquals(
      [bFixed.error, bFixed.data.status, bFixed.data.decision],
      [null, "eligible", "import_new"],
    );
    const retry = await rpc(people.staff.client, "staff_import_items", {
      p_session_id: sessionId,
      p_item_ids: [b.id],
    });
    assertEquals(retry.data.results[0].action, "created_model");
    const bDone = await itemFor(sessionId, p.b.id);
    assertEquals([bDone.status, bDone.error, bDone.attempts], ["imported", null, 2]);

    // Repeat-safe: a second discovery of the same products finds them linked; importing again changes nothing.
    const models = await sql<{ n: number }>(
      "select count(*)::int as n from public.hardware_models where manufacturer_id = $1",
      maker.id,
    );
    const again = await discover(people.staff.id, "quotation_staff", Object.values(p));
    const againItems = await items(again);
    assert(
      againItems.every((i) => i.status === "already_linked"),
      JSON.stringify(againItems.map((i) => i.status)),
    );
    const rerun = await rpc(people.staff.client, "staff_import_items", {
      p_session_id: again,
      p_item_ids: againItems.map((i) => i.id),
    });
    assertEquals(rerun.error, null);
    assert(rerun.data.results.every((r: any) => r.action === "skipped"));
    const modelsAfter = await sql<{ n: number }>(
      "select count(*)::int as n from public.hardware_models where manufacturer_id = $1",
      maker.id,
    );
    assertEquals(modelsAfter[0].n, models[0].n);
    const links = await sql<{ n: number }>(
      "select count(*)::int as n from public.hardware_shopify_links where shopify_product_id = any($1) and status = 'active'",
      Object.values(p).map((x) => x.id),
    );
    assertEquals(links[0].n, 4);

    // Imported items can't be edited.
    const done = await update(people.staff.client, aDone, { p_model_name: "Something else" });
    assertEquals(done.code, "import_item_done");
  },
);

dbTest(
  "IMP-DB-4: refreshing an existing link changes only its Shopify title; a link made meanwhile is never duplicated",
  async () => {
    const people = await cast("imp4");
    const maker = await manufacturer(people.staff.client);
    const m = await model(people.staff.client, maker.id);
    const productId = productGid();
    const link = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: m.id,
      p_product_id: productId,
      p_variant_id: null,
      p_product_title: "Old title",
      p_variant_title: null,
      p_reason: null,
    });
    const overrides = await rpc(people.staff.client, "staff_save_listing_overrides", {
      p_link_id: link.data.id,
      p_expected_version: link.data.version,
      p_overrides: { length_mm: 250 },
      p_reason: "listing is the longer cooler",
    });
    assertEquals(overrides.error, null);
    const beforeLink = (
      await sql<Record<string, any>>(
        "select * from public.hardware_shopify_links where id = $1",
        link.data.id,
      )
    )[0];
    const beforeModel = (
      await sql<Record<string, any>>("select * from public.hardware_models where id = $1", m.id)
    )[0];

    const sessionId = await discover(people.staff.id, "quotation_staff", [
      {
        id: productId,
        title: "New title from Shopify",
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
    ]);
    const item = await itemFor(sessionId, productId);
    const refresh = await update(people.staff.client, item, { p_decision: "refresh_link" });
    assertEquals(refresh.error, null);
    const res = await rpc(people.staff.client, "staff_import_items", {
      p_session_id: sessionId,
      p_item_ids: [item.id],
    });
    assertEquals(res.data.results[0].action, "refreshed_link");
    const afterLink = (
      await sql<Record<string, any>>(
        "select * from public.hardware_shopify_links where id = $1",
        link.data.id,
      )
    )[0];
    const afterModel = (
      await sql<Record<string, any>>("select * from public.hardware_models where id = $1", m.id)
    )[0];
    assertEquals(afterLink.product_title, "New title from Shopify");
    assertEquals(
      [afterLink.overrides, afterLink.override_revision, afterLink.model_id],
      [beforeLink.overrides, beforeLink.override_revision, beforeLink.model_id],
    );
    assertEquals(
      [afterModel.specs, afterModel.spec_revision, afterModel.version],
      [beforeModel.specs, beforeModel.spec_revision, beforeModel.version],
    );

    // Linked by hand between discovery and import: the import re-checks, and an import_new decision now has nothing
    // to create (it's already linked), so it's recorded as already linked, never a second link.
    const other = productGid();
    const s2 = await discover(people.staff.id, "quotation_staff", [
      {
        id: other,
        title: `Raced ${unique()}`,
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
    ]);
    const raced = await itemFor(s2, other);
    assertEquals(raced.decision, "import_new");
    const byHand = await rpc(people.admin.client, "staff_link_shopify_listing", {
      p_model_id: m.id,
      p_product_id: other,
      p_variant_id: null,
      p_product_title: "by hand",
      p_variant_title: null,
      p_reason: null,
    });
    assertEquals(byHand.error, null);
    const res2 = await rpc(people.staff.client, "staff_import_items", {
      p_session_id: s2,
      p_item_ids: [raced.id],
    });
    assertEquals(res2.data.results[0].action, "skipped");
    const n = await sql<{ n: number }>(
      "select count(*)::int as n from public.hardware_shopify_links where shopify_product_id = $1",
      other,
    );
    assertEquals(n[0].n, 1);
  },
);

dbTest(
  "IMP-DB-5: only Admin and Staff read or act; discovery is the service role's; clients never write the tables",
  async () => {
    const people = await cast("imp5");
    const sessionId = await discover(people.staff.id, "quotation_staff", [
      { id: productGid(), title: `Secret ${unique()}`, category: "Monitors" },
    ]);
    const item = (await items(sessionId))[0];

    for (const [who, client] of [
      ["admin", people.admin.client],
      ["staff", people.staff.client],
    ] as const) {
      for (const table of [
        "hardware_import_items",
        "hardware_import_sessions",
        "hardware_import_category_rules",
      ]) {
        const { data, error } = await client.from(table).select("id").limit(500);
        assertEquals(error, null, `${who} ${table}`);
        assert((data ?? []).length > 0, `${who} reads ${table}`);
      }
    }
    for (const [who, client] of [
      ["service staff", people.serviceStaff.client],
      ["customer", people.customer.client],
    ] as const) {
      for (const table of [
        "hardware_import_items",
        "hardware_import_sessions",
        "hardware_import_category_rules",
      ]) {
        const { data } = await client.from(table).select("id").limit(5);
        assertEquals((data ?? []).length, 0, `${who} reads nothing from ${table}`);
      }
      assertEquals((await update(client, item, { p_decision: "skip" })).code, "forbidden");
      assertEquals(
        (
          await rpc(client, "staff_import_items", {
            p_session_id: sessionId,
            p_item_ids: [item.id],
          })
        ).code,
        "forbidden",
      );
      assertEquals(
        (await rpc(client, "staff_reevaluate_import_session", { p_session_id: sessionId })).code,
        "forbidden",
      );
    }
    const visitor = anon();
    for (const table of [
      "hardware_import_items",
      "hardware_import_sessions",
      "hardware_import_category_rules",
    ]) {
      const { error } = await visitor.from(table).select("id").limit(1);
      assert(error, `visitor refused ${table}`);
    }
    assert(
      (await rpc(visitor, "staff_import_items", { p_session_id: sessionId, p_item_ids: [item.id] }))
        .error,
    );

    // Discovery functions: signed-in users can't call them, even administrators.
    for (const client of [people.admin.client, people.staff.client, people.customer.client]) {
      const begun = await rpc(client, "hardware_import_begin", {
        p_actor: people.admin.id,
        p_actor_role: "portal_admin",
      });
      assert(begun.error, "begin refused");
      const staged = await rpc(client, "hardware_import_stage", {
        p_session_id: sessionId,
        p_products: [],
      });
      assert(staged.error, "stage refused");
    }
    // The service role can't start a session for anyone who isn't Admin or Staff.
    const bad = await rpc(service(), "hardware_import_begin", {
      p_actor: people.serviceStaff.id,
      p_actor_role: "service_staff",
    });
    assertEquals(bad.code, "forbidden");

    // Direct writes are refused, for administrators too.
    const ins = await people.admin.client
      .from("hardware_import_items")
      .update({ status: "imported" })
      .eq("id", item.id)
      .select();
    assert(ins.error || (ins.data ?? []).length === 0);
    const rule = await people.admin.client
      .from("hardware_import_category_rules")
      .insert({ match_field: "tag", match_value: "direct", category_id: "GPU" });
    assert(rule.error);
    assertEquals((await items(sessionId))[0].status, item.status);

    // A finished discovery takes no more pages; malformed products are refused whole.
    const late = await rpc(service(), "hardware_import_stage", {
      p_session_id: sessionId,
      p_products: [],
    });
    assertEquals(late.code, "import_session_not_discovering");
    const open = await rpc(service(), "hardware_import_begin", {
      p_actor: people.staff.id,
      p_actor_role: "quotation_staff",
    });
    for (const bad of [
      [{ id: "not-a-gid", title: "x" }],
      [{ id: productGid(), title: "  " }],
      [{ id: productGid(), title: "x", variants: {} }],
      ["string"],
    ]) {
      const refused = await rpc(service(), "hardware_import_stage", {
        p_session_id: open.data.id,
        p_products: bad,
      });
      assert(refused.code === "product_invalid", JSON.stringify(refused));
    }
    const tooMany = Array.from({ length: 251 }, () => ({ id: productGid(), title: "x" }));
    assertEquals(
      (
        await rpc(service(), "hardware_import_stage", {
          p_session_id: open.data.id,
          p_products: tooMany,
        })
      ).code,
      "products_invalid",
    );
    const failed = await rpc(service(), "hardware_import_finish_discovery", {
      p_session_id: open.data.id,
      p_error: { code: "shopify_unavailable" },
    });
    assertEquals(failed.data.status, "failed");
    // A failed session can't be imported from.
    assertEquals(
      (
        await rpc(people.staff.client, "staff_import_items", {
          p_session_id: open.data.id,
          p_item_ids: [item.id],
        })
      ).code,
      "import_session_not_ready",
    );
  },
);

dbTest(
  "IMP-DB-6: the activity log records every step with its session; the PC Builder reads an imported model as unspecified",
  async () => {
    const people = await cast("imp6");
    const maker = await manufacturer(people.staff.client);
    const productId = productGid();
    const sessionId = await discover(people.staff.id, "quotation_staff", [
      {
        id: productId,
        title: `Logged Card ${unique()}`,
        vendor: maker.name,
        category: "Video Cards & Adapters",
      },
    ]);
    const item = await itemFor(sessionId, productId);
    const renamed = await update(people.staff.client, item, {
      p_model_name: "Logged Card Prime",
      p_model_number: "LCP-1",
    });
    assertEquals(renamed.error, null);
    const res = await rpc(people.staff.client, "staff_import_items", {
      p_session_id: sessionId,
      p_item_ids: [item.id],
    });
    assertEquals(res.data.results[0].action, "created_model");

    const log = await sql<{ action: string; actor_user_id: string; actor_role: string }>(
      `select action, actor_user_id::text, actor_role from public.hardware_activity_log
       where details ->> 'session_id' = $1 order by id`,
      sessionId,
    );
    assertEquals(
      log.map((l) => l.action),
      [
        "import_discovery_started",
        "import_discovery_finished",
        "import_item_updated",
        "import_item_imported",
      ],
    );
    assert(log.every((l) => l.actor_user_id === people.staff.id));
    // The registry's own entries for the new model and link are written too.
    const done = await itemFor(sessionId, productId);
    const own = await sql<{ action: string }>(
      "select action from public.hardware_activity_log where model_id = $1 and action in ('model_created', 'link_created') order by id",
      done.result_model_id,
    );
    assertEquals(
      own.map((o) => o.action),
      ["model_created", "link_created"],
    );
    // The log stays append-only.
    let refused = false;
    try {
      await sql(
        "update public.hardware_activity_log set details = '{}' where details ->> 'session_id' = $1",
        sessionId,
      );
    } catch {
      refused = true;
    }
    assert(refused, "activity log is append-only");

    // The PC Builder's registry read: the model appears with its link but no specification (revision 0), so nothing
    // is presented as verified until staff complete it.
    const reg = await rpc(anon(), "get_pc_builder_registry_specs", {
      p_product_ids: [productId],
      p_variant_ids: null,
    });
    assertEquals(reg.error, null);
    assertEquals(reg.data.length, 1);
    assertEquals(
      [reg.data[0].model_name, reg.data[0].model_number, reg.data[0].spec_revision],
      ["Logged Card Prime", "LCP-1", 0],
    );
    assertEquals(reg.data[0].model_specs, {});
  },
);

dbTest(
  "IMP-DB-7: every importer function is security definer with an empty search path; helpers have no grants; nothing is published",
  async () => {
    const fns = await sql<{
      name: string;
      secdef: boolean;
      config: string[] | null;
      schema: string;
    }>(
      `select p.proname as name, p.prosecdef as secdef, p.proconfig as config, n.nspname as schema
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where (n.nspname = 'public' and (p.proname like 'hardware\_import\_%' or p.proname in (
                'staff_update_import_item', 'staff_reevaluate_import_session', 'staff_import_items',
                'staff_save_import_category_rule')))
          or (n.nspname = 'private' and p.proname like 'hardware\_import\_%')`,
    );
    assertEquals(
      fns
        .filter((f) => f.schema === "public")
        .map((f) => f.name)
        .sort(),
      [
        "hardware_import_begin",
        "hardware_import_finish_discovery",
        "hardware_import_stage",
        "staff_import_items",
        "staff_reevaluate_import_session",
        "staff_save_import_category_rule",
        "staff_update_import_item",
      ],
    );
    assertEquals(
      fns
        .filter((f) => f.schema === "private")
        .map((f) => f.name)
        .sort(),
      ["hardware_import_count", "hardware_import_evaluate", "hardware_import_rule_for"],
    );
    for (const f of fns) {
      assert((f.config ?? []).includes('search_path=""'), `${f.schema}.${f.name} search_path`);
      assert(f.secdef, `${f.schema}.${f.name} security definer`);
    }
    const privateGrants = await sql<{ n: bigint }>(
      `select count(*) as n from information_schema.routine_privileges
       where routine_schema = 'private' and routine_name like 'hardware\_import\_%'
         and grantee in ('anon','authenticated','service_role','PUBLIC')`,
    );
    assertEquals(Number(privateGrants[0].n), 0);
    // Tables: select only, for signed-in users (RLS) and the service role; nothing for visitors; no write grants.
    const grants = await sql<{ grantee: string; privilege_type: string; table_name: string }>(
      `select grantee, privilege_type, table_name from information_schema.role_table_grants
       where table_schema = 'public' and table_name like 'hardware\_import\_%'
         and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC') order by 3, 1, 2`,
    );
    assert(grants.length > 0);
    for (const g of grants) {
      assertEquals(g.privilege_type, "SELECT", `${g.grantee} ${g.privilege_type} ${g.table_name}`);
      assert(g.grantee !== "anon" && g.grantee !== "PUBLIC", `${g.grantee} on ${g.table_name}`);
    }
    const rls = await sql<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname like 'hardware\_import\_%' and relkind = 'r'",
    );
    assertEquals(rls.length, 3);
    assert(rls.every((r) => r.relrowsecurity));
    const published = await sql<{ n: bigint }>(
      "select count(*) as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'hardware\_import\_%'",
    );
    assertEquals(Number(published[0].n), 0);
  },
);
