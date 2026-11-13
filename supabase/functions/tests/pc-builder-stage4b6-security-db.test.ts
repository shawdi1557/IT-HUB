// Stage 4B-6: security, tamper and concurrency verification of the Hardware Specification Manager (migration
// 20261112000001) on the disposable stack, with real signed-in synthetic users of every relevant kind: visitor,
// customer, service staff, quotation staff, portal admin, profile admin, and inactive staff rows.
//
// DISPOSABLE STACK ONLY (dbTest). Synthetic users, models and made-up Shopify ids. Nothing contacts Shopify.

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
const rpc = async (client: any, fn: string, args: Record<string, unknown>) => {
  const { data, error } = await client.rpc(fn, args);
  return { data, error, code: error?.message as string | undefined };
};

const TABLES = [
  "hardware_categories",
  "hardware_spec_fields",
  "hardware_manufacturers",
  "hardware_models",
  "hardware_shopify_links",
  "hardware_spec_revisions",
  "hardware_metafield_mappings",
  "hardware_sync_jobs",
  "hardware_activity_log",
];

const GPU = {
  tdp_watts: 200,
  length_mm: 242,
  pcie_8pin_required: 1,
  pcie_16pin_required: 0,
  recommended_psu_watts: 650,
};

/** Every kind of caller the 4B rules distinguish. */
async function everyone(label: string) {
  const customer = await createSignedInUser(`${label}-c`);
  const serviceStaff = await createSignedInUser(`${label}-s`, "service_staff");
  const staff = await createSignedInUser(`${label}-q`, "quotation_staff");
  const admin = await createSignedInUser(`${label}-a`, "portal_admin");
  const profileAdmin = await createSignedInUser(`${label}-p`);
  await sql("update public.profiles set role = 'admin' where id = $1", profileAdmin.id);
  const inactiveStaff = await createSignedInUser(`${label}-iq`, "quotation_staff");
  const inactiveAdmin = await createSignedInUser(`${label}-ia`, "portal_admin");
  await sql("update public.staff_members set is_active = false where user_id = any($1)", [
    inactiveStaff.id,
    inactiveAdmin.id,
  ]);
  return {
    visitor: { client: anon(), kind: "none" },
    customer: { ...customer, kind: "none" },
    serviceStaff: { ...serviceStaff, kind: "none" },
    inactiveStaff: { ...inactiveStaff, kind: "none" },
    inactiveAdmin: { ...inactiveAdmin, kind: "none" },
    staff: { ...staff, kind: "staff" },
    admin: { ...admin, kind: "admin" },
    profileAdmin: { ...profileAdmin, kind: "admin" },
  } as Record<string, { client: any; id?: string; kind: "none" | "staff" | "admin" }>;
}

async function fixture(client: any) {
  const maker = (
    await rpc(client, "staff_save_hardware_manufacturer", {
      p_id: null,
      p_expected_version: null,
      p_name: `Sec Maker ${unique()}`,
      p_website_url: null,
      p_is_active: true,
    })
  ).data;
  const model = (
    await rpc(client, "staff_create_hardware_model", {
      p_category: "GPU",
      p_manufacturer_id: maker.id,
      p_model_name: `Sec Board ${unique()}`,
      p_model_number: null,
      p_is_base: false,
      p_base_model_id: null,
      p_notes: null,
      p_specs: GPU,
      p_confirm_distinct: true,
      p_reason: null,
    })
  ).data;
  const link = (
    await rpc(client, "staff_link_shopify_listing", {
      p_model_id: model.id,
      p_product_id: shopifyNumber(),
      p_variant_id: null,
      p_product_title: "Sec",
      p_variant_title: null,
      p_reason: null,
    })
  ).data;
  return { maker, model, link };
}

dbTest(
  "S4B6-1: table access matrix: only Admin and Staff read; nobody writes directly",
  async () => {
    const people = await everyone(`s4b6-1-${unique()}`);
    await fixture(people.admin.client);
    for (const [who, person] of Object.entries(people)) {
      for (const table of TABLES) {
        const { data, error } = await person.client.from(table).select("*").limit(1);
        if (person.kind === "none") {
          assert((data ?? []).length === 0, `${who} read ${table}`);
        } else {
          assertEquals(error, null, `${who} ${table}`);
          assertEquals((data ?? []).length, 1, `${who} should read ${table}`);
        }
        const insert = await person.client.from(table).insert({}).select();
        assert(insert.error, `${who} inserted into ${table}`);
        const update = await person.client
          .from(table)
          .update({ updated_at: new Date().toISOString() })
          .neq("updated_at", "x")
          .select();
        assert(update.error || (update.data ?? []).length === 0, `${who} updated ${table}`);
        const del = await person.client.from(table).delete().not("created_at", "is", null).select();
        assert(del.error || (del.data ?? []).length === 0, `${who} deleted from ${table}`);
      }
    }
  },
);

dbTest(
  "S4B6-2: function matrix: role checks fail closed for everyone but Admin and Staff; admin-only stays admin-only",
  async () => {
    const people = await everyone(`s4b6-2-${unique()}`);
    const missing = crypto.randomUUID();
    // Each call is built so a permitted caller is refused for another reason (not found, invalid), never "forbidden".
    const calls: [string, Record<string, unknown>, boolean][] = [
      [
        "staff_save_hardware_manufacturer",
        {
          p_id: missing,
          p_expected_version: 1,
          p_name: `M ${unique()}`,
          p_website_url: null,
          p_is_active: true,
        },
        false,
      ],
      [
        "staff_update_hardware_category",
        { p_id: "Nope", p_expected_version: 1, p_label: "x", p_sort_order: 1, p_is_active: true },
        false,
      ],
      [
        "staff_create_hardware_model",
        {
          p_category: "Nope",
          p_manufacturer_id: missing,
          p_model_name: "x",
          p_model_number: null,
          p_is_base: false,
          p_base_model_id: null,
          p_notes: null,
          p_specs: {},
          p_confirm_distinct: true,
          p_reason: null,
        },
        false,
      ],
      [
        "staff_update_hardware_model",
        {
          p_model_id: missing,
          p_expected_version: 1,
          p_category: "GPU",
          p_manufacturer_id: missing,
          p_model_name: "x",
          p_model_number: null,
          p_is_base: false,
          p_base_model_id: null,
          p_notes: null,
          p_confirm_distinct: true,
          p_reason: null,
        },
        false,
      ],
      [
        "staff_save_hardware_specs",
        { p_model_id: missing, p_expected_version: 1, p_specs: {}, p_reason: null },
        false,
      ],
      [
        "staff_set_hardware_model_archived",
        { p_model_id: missing, p_expected_version: 1, p_archived: true, p_reason: "test reason" },
        true,
      ],
      [
        "staff_find_hardware_duplicates",
        {
          p_category: "GPU",
          p_manufacturer_id: missing,
          p_model_name: "x",
          p_model_number: null,
          p_exclude: null,
        },
        false,
      ],
      [
        "staff_link_shopify_listing",
        {
          p_model_id: missing,
          p_product_id: "1",
          p_variant_id: null,
          p_product_title: null,
          p_variant_title: null,
          p_reason: null,
        },
        false,
      ],
      [
        "staff_relink_shopify_listing",
        { p_link_id: missing, p_expected_version: 1, p_model_id: missing, p_reason: "test reason" },
        false,
      ],
      [
        "staff_remove_shopify_link",
        { p_link_id: missing, p_expected_version: 1, p_reason: "test reason" },
        false,
      ],
      [
        "staff_save_listing_overrides",
        { p_link_id: missing, p_expected_version: 1, p_overrides: {}, p_reason: null },
        false,
      ],
      [
        "staff_set_hardware_metafield_mapping",
        { p_id: missing, p_expected_version: 1, p_enabled: true },
        true,
      ],
    ];
    for (const [fn, args, adminOnly] of calls) {
      for (const [who, person] of Object.entries(people)) {
        const res = await rpc(person.client, fn, args);
        const allowed = person.kind === "admin" || (person.kind === "staff" && !adminOnly);
        if (allowed) {
          assert(
            res.code !== "forbidden" && !/permission denied/i.test(res.error?.message ?? ""),
            `${who} should pass the role check of ${fn}: ${res.error?.message}`,
          );
        } else {
          assert(res.error, `${who} must be refused ${fn}`);
          assert(
            res.code === "forbidden" || /permission denied/i.test(res.error.message),
            `${who} ${fn}: ${res.error.message}`,
          );
        }
      }
    }
    // The job functions belong to the service role alone.
    for (const [fn, args] of [
      [
        "hardware_sync_enqueue",
        {
          p_link_id: missing,
          p_spec_revision: 1,
          p_override_revision: 0,
          p_payload: [],
          p_payload_hash: "a".repeat(64),
          p_actor: missing,
          p_actor_role: "portal_admin",
        },
      ],
      ["hardware_sync_claim", { p_job_id: missing }],
      [
        "hardware_sync_finish",
        {
          p_job_id: missing,
          p_outcome: "synced",
          p_error: null,
          p_response: null,
          p_retry_after_seconds: null,
        },
      ],
      [
        "hardware_sync_retry",
        { p_job_id: missing, p_actor: missing, p_actor_role: "portal_admin" },
      ],
    ] as [string, Record<string, unknown>][]) {
      for (const [who, person] of Object.entries(people)) {
        const res = await rpc(person.client, fn, args);
        assert(
          res.error && /permission denied/i.test(res.error.message),
          `${who} must not call ${fn}: ${res.error?.message}`,
        );
      }
    }
  },
);

dbTest(
  "S4B6-3: every 4B function is security definer with an empty search path; private helpers have no grants",
  async () => {
    const fns = await sql<{
      name: string;
      secdef: boolean;
      config: string[] | null;
      schema: string;
    }>(
      `select p.proname as name, p.prosecdef as secdef, p.proconfig as config, n.nspname as schema
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'public' and (p.proname like 'staff_%hardware%' or p.proname like 'staff_%shopify%'
            or p.proname like 'staff_%listing%' or p.proname like 'hardware_sync_%' or p.proname = 'get_pc_builder_registry_specs'))
        or (n.nspname = 'private' and (p.proname like 'hardware_%' or p.proname like 'lock_hardware_%')
            -- The Shopify importer's helpers (20261113000003) are checked by IMP-DB-7.
            and p.proname not like 'hardware\\_import\\_%')`,
    );
    assertEquals(fns.filter((f) => f.schema === "public").length, 17);
    // 14 helpers from 20261112000001 and the 3 duplicate guards from 20261113000001 (triggers only).
    assertEquals(fns.filter((f) => f.schema === "private").length, 17);
    for (const f of fns) {
      assert((f.config ?? []).includes('search_path=""'), `${f.schema}.${f.name} search_path`);
      if (f.schema === "public") assert(f.secdef, `${f.name} security definer`);
    }
    const privateGrants = await sql<{ n: bigint }>(
      `select count(*) as n from information_schema.routine_privileges
     where routine_schema = 'private' and (routine_name like 'hardware_%' or routine_name like 'lock_hardware_%')
       and grantee in ('anon','authenticated','service_role','PUBLIC')`,
    );
    assertEquals(Number(privateGrants[0].n), 0);
    // Not in the Realtime publication.
    const published = await sql<{ n: bigint }>(
      "select count(*) as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'hardware_%'",
    );
    assertEquals(Number(published[0].n), 0);
  },
);

dbTest(
  "S4B6-4: the actor is always the caller; a forged actor can't reach the service functions",
  async () => {
    const people = await everyone(`s4b6-4-${unique()}`);
    const { model } = await fixture(people.staff.client);
    const saved = await rpc(people.staff.client, "staff_save_hardware_specs", {
      p_model_id: model.id,
      p_expected_version: model.version,
      p_specs: { ...GPU, length_mm: 250 },
      p_reason: null,
    });
    assertEquals(saved.error, null);
    const [rev] = await sql<{ actor_user_id: string; actor_role: string }>(
      "select actor_user_id, actor_role from public.hardware_spec_revisions where model_id = $1 and revision_no = 2",
      model.id,
    );
    assertEquals(rev, { actor_user_id: people.staff.id!, actor_role: "quotation_staff" });
    // An extra "actor" argument is not part of any staff function: PostgREST refuses an unknown signature.
    const forged = await rpc(people.staff.client, "staff_save_hardware_specs", {
      p_model_id: model.id,
      p_expected_version: saved.data.version,
      p_specs: GPU,
      p_reason: null,
      p_actor: people.admin.id,
    });
    assert(forged.error, "unknown parameter must be refused");
    // The service functions take an actor, but only the service role may call them (S4B6-2), and they refuse a
    // client role name that isn't staff.
    const bogusRole = await rpc(service(), "hardware_sync_retry", {
      p_job_id: crypto.randomUUID(),
      p_actor: people.customer.id,
      p_actor_role: "customer",
    });
    assertEquals(bogusRole.code, "forbidden");
  },
);

dbTest(
  "S4B6-5: tamper: malformed, oversized and out-of-contract input is refused and changes nothing",
  async () => {
    const people = await everyone(`s4b6-5-${unique()}`);
    const { maker, model, link } = await fixture(people.staff.client);
    const save = (specs: unknown) =>
      rpc(people.staff.client, "staff_save_hardware_specs", {
        p_model_id: model.id,
        p_expected_version: model.version,
        p_specs: specs,
        p_reason: null,
      });
    for (const bad of [
      [],
      "text",
      5,
      { length_mm: { nested: 1 } },
      { length_mm: [242] },
      { length_mm: "242" },
      { length_mm: true },
      { "": 1 },
    ]) {
      assertEquals((await save(bad)).code, "specs_invalid", JSON.stringify(bad));
    }
    // Oversized: thousands of unknown keys, a huge text value, a 13-entry list.
    const many = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, i]));
    assertEquals((await save(many)).code, "specs_invalid");
    assertEquals((await save({ ...GPU, display_outputs: ["x".repeat(61)] })).code, "specs_invalid");
    assertEquals(
      (await save({ ...GPU, display_outputs: Array.from({ length: 13 }, (_, i) => `Port ${i}`) }))
        .code,
      "specs_invalid",
    );
    assertEquals(
      (
        await rpc(people.staff.client, "staff_create_hardware_model", {
          p_category: "GPU",
          p_manufacturer_id: maker.id,
          p_model_name: "x".repeat(121),
          p_model_number: null,
          p_is_base: false,
          p_base_model_id: null,
          p_notes: null,
          p_specs: {},
          p_confirm_distinct: true,
          p_reason: null,
        })
      ).code,
      "model_name_invalid",
    );
    assertEquals(
      (
        await rpc(people.staff.client, "staff_create_hardware_model", {
          p_category: "GPU",
          p_manufacturer_id: maker.id,
          p_model_name: `Notes ${unique()}`,
          p_model_number: null,
          p_is_base: false,
          p_base_model_id: null,
          p_notes: "n".repeat(1001),
          p_specs: {},
          p_confirm_distinct: true,
          p_reason: null,
        })
      ).code,
      "reason_invalid",
    );
    // Invalid Shopify ids.
    for (const id of [
      "abc",
      "gid://shopify/Product/abc",
      "gid://shopify/ProductVariant/1",
      "1; drop table x",
      "gid://shopify/Product/1/2",
      "-1",
    ]) {
      const res = await rpc(people.staff.client, "staff_link_shopify_listing", {
        p_model_id: model.id,
        p_product_id: id,
        p_variant_id: null,
        p_product_title: null,
        p_variant_title: null,
        p_reason: null,
      });
      assertEquals(res.code, "shopify_id_invalid", id);
    }
    const badVariant = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: model.id,
      p_product_id: shopifyNumber(),
      p_variant_id: "gid://shopify/Product/5",
      p_product_title: null,
      p_variant_title: null,
      p_reason: null,
    });
    assertEquals(badVariant.code, "shopify_id_invalid");
    // Oversized sync payloads are refused by the table even for the service role.
    const huge = Array.from({ length: 26 }, (_, i) => ({
      namespace: "pc_builder",
      key: `k${i}`,
      type: "number_integer",
      value: "1",
    }));
    const tooMany = await rpc(service(), "hardware_sync_enqueue", {
      p_link_id: link.id,
      p_spec_revision: 1,
      p_override_revision: 0,
      p_payload: huge,
      p_payload_hash: "d".repeat(64),
      p_actor: people.staff.id,
      p_actor_role: "quotation_staff",
    });
    assert(tooMany.error, "26 metafields must be refused");
    const otherNamespace = await rpc(service(), "hardware_sync_enqueue", {
      p_link_id: link.id,
      p_spec_revision: 1,
      p_override_revision: 0,
      p_payload: [
        { namespace: "custom", key: "socket", type: "single_line_text_field", value: "AM5" },
      ],
      p_payload_hash: "e".repeat(64),
      p_actor: people.staff.id,
      p_actor_role: "quotation_staff",
    });
    assert(otherNamespace.error, "another namespace must be refused");
    // Mapping namespace and keys can't be changed by anyone through the API, and the table refuses them even for the owner.
    for (const statement of [
      "update public.hardware_metafield_mappings set namespace = 'custom' where category_id = 'GPU' and field_key = 'length_mm'",
      "update public.hardware_metafield_mappings set metafield_key = 'spec_review_status' where category_id = 'GPU' and field_key = 'length_mm'",
      "update public.hardware_metafield_mappings set metafield_type = 'json' where category_id = 'GPU' and field_key = 'length_mm'",
    ]) {
      let refused = false;
      try {
        await sql(statement);
      } catch {
        refused = true;
      }
      assert(refused, statement);
    }
    const [after] = await sql<{ specs: unknown; version: number }>(
      "select specs, version from public.hardware_models where id = $1",
      model.id,
    );
    assertEquals(after, { specs: GPU, version: model.version });
  },
);

dbTest(
  "S4B6-6: archived and base models can't be linked or relinked to; overrides follow the target's category",
  async () => {
    const people = await everyone(`s4b6-6-${unique()}`);
    const { maker, model, link } = await fixture(people.staff.client);
    const base = (
      await rpc(people.staff.client, "staff_create_hardware_model", {
        p_category: "GPU",
        p_manufacturer_id: maker.id,
        p_model_name: `Sec Chip ${unique()}`,
        p_model_number: null,
        p_is_base: true,
        p_base_model_id: null,
        p_notes: null,
        p_specs: { tdp_watts: 200 },
        p_confirm_distinct: true,
        p_reason: null,
      })
    ).data;
    const spare = (
      await rpc(people.staff.client, "staff_create_hardware_model", {
        p_category: "GPU",
        p_manufacturer_id: maker.id,
        p_model_name: `Sec Spare ${unique()}`,
        p_model_number: null,
        p_is_base: false,
        p_base_model_id: null,
        p_notes: null,
        p_specs: GPU,
        p_confirm_distinct: true,
        p_reason: null,
      })
    ).data;
    const archived = (
      await rpc(people.admin.client, "staff_set_hardware_model_archived", {
        p_model_id: spare.id,
        p_expected_version: spare.version,
        p_archived: true,
        p_reason: "retired line",
      })
    ).data;
    const cpu = (
      await rpc(people.staff.client, "staff_create_hardware_model", {
        p_category: "CPU",
        p_manufacturer_id: maker.id,
        p_model_name: `Sec CPU ${unique()}`,
        p_model_number: null,
        p_is_base: false,
        p_base_model_id: null,
        p_notes: null,
        p_specs: {},
        p_confirm_distinct: true,
        p_reason: null,
      })
    ).data;
    const relink = (target: string, version: number) =>
      rpc(people.staff.client, "staff_relink_shopify_listing", {
        p_link_id: link.id,
        p_expected_version: version,
        p_model_id: target,
        p_reason: "moving it",
      });
    assertEquals((await relink(base.id, link.version)).code, "model_not_linkable");
    assertEquals((await relink(archived.id, link.version)).code, "model_not_linkable");
    assertEquals(
      (
        await rpc(people.staff.client, "staff_link_shopify_listing", {
          p_model_id: archived.id,
          p_product_id: shopifyNumber(),
          p_variant_id: null,
          p_product_title: null,
          p_variant_title: null,
          p_reason: null,
        })
      ).code,
      "model_archived",
    );
    // A GPU override (length) can't follow the link to a CPU model.
    const withOverride = (
      await rpc(people.staff.client, "staff_save_listing_overrides", {
        p_link_id: link.id,
        p_expected_version: link.version,
        p_overrides: { length_mm: 250 },
        p_reason: null,
      })
    ).data;
    assertEquals((await relink(cpu.id, withOverride.version)).code, "specs_invalid");
    // A model can't be its own base, or use a base of another category, or a non-base model as base.
    for (const baseId of [model.id, cpu.id]) {
      const res = await rpc(people.staff.client, "staff_update_hardware_model", {
        p_model_id: model.id,
        p_expected_version: model.version,
        p_category: "GPU",
        p_manufacturer_id: maker.id,
        p_model_name: model.model_name,
        p_model_number: null,
        p_is_base: false,
        p_base_model_id: baseId,
        p_notes: null,
        p_confirm_distinct: true,
        p_reason: null,
      });
      assertEquals(res.code, "base_model_invalid");
    }
    // Nothing changed for the link.
    const [still] = await sql<{ model_id: string }>(
      "select model_id from public.hardware_shopify_links where id = $1",
      link.id,
    );
    assertEquals(still.model_id, model.id);
  },
);

dbTest("S4B6-7: history can't be rewritten or truncated, even by the database owner", async () => {
  for (const table of ["hardware_spec_revisions", "hardware_activity_log"]) {
    let refused = false;
    try {
      await sql(`truncate public.${table}`);
    } catch (e) {
      refused = /append-only/.test(String(e));
    }
    assert(refused, `truncate ${table}`);
  }
  const before = await sql<{ n: bigint }>("select count(*) as n from public.hardware_activity_log");
  assert(Number(before[0].n) > 0);
});

dbTest(
  "S4B6-8: concurrency: one of two simultaneous saves wins; the other is told its version is stale",
  async () => {
    const people = await everyone(`s4b6-8-${unique()}`);
    const { model } = await fixture(people.staff.client);
    const [a, b] = await Promise.all([
      rpc(people.staff.client, "staff_save_hardware_specs", {
        p_model_id: model.id,
        p_expected_version: model.version,
        p_specs: { ...GPU, length_mm: 250 },
        p_reason: "a",
      }),
      rpc(people.admin.client, "staff_save_hardware_specs", {
        p_model_id: model.id,
        p_expected_version: model.version,
        p_specs: { ...GPU, length_mm: 260 },
        p_reason: "b",
      }),
    ]);
    const outcomes = [a, b].map((r) => (r.error ? r.code : "saved")).sort();
    assertEquals(outcomes, ["saved", "stale_version"]);
    const revs = await sql<{ n: bigint }>(
      "select count(*) as n from public.hardware_spec_revisions where model_id = $1",
      model.id,
    );
    assertEquals(Number(revs[0].n), 2);
  },
);

dbTest(
  "S4B6-9: concurrency: simultaneous identical creates give one model and one plain duplicate refusal",
  async () => {
    const people = await everyone(`s4b6-9-${unique()}`);
    const { maker } = await fixture(people.staff.client);
    const name = `Race Board ${unique()}`;
    const create = (client: any) =>
      rpc(client, "staff_create_hardware_model", {
        p_category: "GPU",
        p_manufacturer_id: maker.id,
        p_model_name: name,
        p_model_number: null,
        p_is_base: false,
        p_base_model_id: null,
        p_notes: null,
        p_specs: {},
        p_confirm_distinct: true,
        p_reason: null,
      });
    const results = await Promise.all([
      create(people.staff.client),
      create(people.admin.client),
      create(people.profileAdmin.client),
    ]);
    const ok = results.filter((r) => !r.error).length;
    assertEquals(ok, 1);
    for (const r of results.filter((x) => x.error))
      assertEquals(r.code, "duplicate_model", r.error.message);
    const rows = await sql<{ n: bigint }>(
      "select count(*) as n from public.hardware_models where model_name = $1",
      name,
    );
    assertEquals(Number(rows[0].n), 1);
  },
);

dbTest(
  "S4B6-10: concurrency: simultaneous enqueues leave one waiting job; simultaneous claims run it once",
  async () => {
    const people = await everyone(`s4b6-10-${unique()}`);
    const { link } = await fixture(people.staff.client);
    const payload = [
      { namespace: "pc_builder", key: "gpu_length_mm", type: "number_integer", value: "242" },
    ];
    const enqueue = (hash: string) =>
      rpc(service(), "hardware_sync_enqueue", {
        p_link_id: link.id,
        p_spec_revision: 1,
        p_override_revision: 0,
        p_payload: payload,
        p_payload_hash: hash,
        p_actor: people.staff.id,
        p_actor_role: "quotation_staff",
      });
    const results = await Promise.all(["1", "2", "3", "4"].map((d) => enqueue(d.repeat(64))));
    for (const r of results) assertEquals(r.error, null, r.error?.message);
    const waiting = await sql<{ id: string }>(
      "select id from public.hardware_sync_jobs where link_id = $1 and status in ('queued','retry_pending')",
      link.id,
    );
    assertEquals(waiting.length, 1);
    const superseded = await sql<{ n: bigint }>(
      "select count(*) as n from public.hardware_sync_jobs where link_id = $1 and status = 'superseded'",
      link.id,
    );
    assertEquals(Number(superseded[0].n), 3);
    // Older queued jobs never run: claiming a superseded job gives nothing.
    const old = await sql<{ id: string }>(
      "select id from public.hardware_sync_jobs where link_id = $1 and status = 'superseded' limit 1",
      link.id,
    );
    assertEquals(
      (await rpc(service(), "hardware_sync_claim", { p_job_id: old[0].id })).data?.id ?? null,
      null,
    );
    // Two simultaneous claims of the waiting job: exactly one gets it.
    const claims = await Promise.all(
      [1, 2, 3].map(() => rpc(service(), "hardware_sync_claim", { p_job_id: waiting[0].id })),
    );
    assertEquals(claims.filter((c) => c.data?.id).length, 1);
    const [job] = await sql<{ status: string; attempts: number }>(
      "select status, attempts from public.hardware_sync_jobs where id = $1",
      waiting[0].id,
    );
    assertEquals(job, { status: "syncing", attempts: 1 });
  },
);

dbTest(
  "S4B6-11: an attempt whose lock lapsed (worker stopped) is recovered, and a live one isn't stolen",
  async () => {
    const people = await everyone(`s4b6-11-${unique()}`);
    const { link } = await fixture(people.staff.client);
    const job = (
      await rpc(service(), "hardware_sync_enqueue", {
        p_link_id: link.id,
        p_spec_revision: 1,
        p_override_revision: 0,
        p_payload: [
          { namespace: "pc_builder", key: "gpu_length_mm", type: "number_integer", value: "242" },
        ],
        p_payload_hash: "f".repeat(64),
        p_actor: people.staff.id,
        p_actor_role: "quotation_staff",
      })
    ).data;
    assertEquals(
      (await rpc(service(), "hardware_sync_claim", { p_job_id: job.id })).data.status,
      "syncing",
    );
    // Still locked: a second claim gets nothing.
    assertEquals(
      (await rpc(service(), "hardware_sync_claim", { p_job_id: job.id })).data?.id ?? null,
      null,
    );
    // The worker died: its lock lapses.
    await sql(
      "update public.hardware_sync_jobs set locked_until = now() - interval '1 minute' where id = $1",
      job.id,
    );
    const recovered = await rpc(service(), "hardware_sync_claim", { p_job_id: job.id });
    assertEquals(recovered.data.status, "syncing");
    assertEquals(recovered.data.attempts, 2);
    // Retries are bounded: past max attempts, retry_pending becomes failed.
    await sql("update public.hardware_sync_jobs set attempts = max_attempts where id = $1", job.id);
    const finished = await rpc(service(), "hardware_sync_finish", {
      p_job_id: job.id,
      p_outcome: "retry_pending",
      p_error: { code: "throttled" },
      p_response: null,
      p_retry_after_seconds: 5,
    });
    assertEquals(finished.data.status, "failed");
  },
);

dbTest("S4B6-12: the public registry read exposes only intended technical facts", async () => {
  const people = await everyone(`s4b6-12-${unique()}`);
  const { maker, model, link } = await fixture(people.staff.client);
  await rpc(people.staff.client, "staff_update_hardware_model", {
    p_model_id: model.id,
    p_expected_version: model.version,
    p_category: "GPU",
    p_manufacturer_id: maker.id,
    p_model_name: model.model_name,
    p_model_number: null,
    p_is_base: false,
    p_base_model_id: null,
    p_notes: "INTERNAL supplier cost note",
    p_confirm_distinct: true,
    p_reason: "internal",
  });
  const { data, error } = await anon().rpc("get_pc_builder_registry_specs", {
    p_product_ids: [link.shopify_product_id],
    p_variant_ids: [],
  });
  assertEquals(error, null);
  assertEquals(data.length, 1);
  const text = JSON.stringify(data);
  for (const secret of [
    "INTERNAL",
    people.staff.id!,
    "quotation_staff",
    "created_by",
    "updated_by",
    "removed_reason",
    "notes",
    'version"',
  ]) {
    assert(!text.includes(secret), `leaked ${secret}`);
  }
  // Removed links and archived models disappear from it.
  const removed = await rpc(people.staff.client, "staff_remove_shopify_link", {
    p_link_id: link.id,
    p_expected_version: link.version,
    p_reason: "withdrawn",
  });
  assertEquals(removed.error, null);
  const after = await anon().rpc("get_pc_builder_registry_specs", {
    p_product_ids: [link.shopify_product_id],
    p_variant_ids: [],
  });
  assertEquals(after.data, []);
  // A visitor can't use it to read anything else: no parameters but id lists, and the function is read-only.
  const [fn] = await sql<{ volatile: string }>(
    "select provolatile as volatile from pg_proc where proname = 'get_pc_builder_registry_specs'",
  );
  assertEquals(fn.volatile, "s");
});

/** Runs `statement` in two open transactions as the same staff member; the first commits while the second waits. */
async function race(userId: string, statement: string, args: unknown[]) {
  const a = new PgClient(TEST_DB_URL);
  const b = new PgClient(TEST_DB_URL);
  await a.connect();
  await b.connect();
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const begin = async (c: PgClient) => {
    await c.queryArray("begin");
    await c.queryArray("set local role authenticated");
    await c.queryArray("select set_config('request.jwt.claims', $1, true)", [claims]);
  };
  try {
    await begin(a);
    await begin(b);
    await a.queryArray(statement, args);
    const second = b.queryArray(statement, args).then(
      () => "saved",
      (e) => `${e?.fields?.code ?? ""} ${e?.fields?.message ?? e.message}`,
    );
    await new Promise((r) => setTimeout(r, 400));
    await a.queryArray("commit");
    return await second;
  } finally {
    try {
      await b.queryArray("rollback");
    } catch {
      /* already ended */
    }
    await a.end();
    await b.end();
  }
}

dbTest(
  "S4B6-13 (F-4B6-1): a true race on the same identity gives the plain refusal, never a raw 23505",
  async () => {
    const people = await everyone(`s4b6-13-${unique()}`);
    const { maker } = await fixture(people.staff.client);
    const model = await race(
      people.staff.id!,
      "select (public.staff_create_hardware_model('GPU',$1,$2,null,false,null,null,'{}'::jsonb,true,null)).id",
      [maker.id, `Race Model ${unique()}`],
    );
    assertEquals(model, "PT409 duplicate_model");
    const manufacturer = await race(
      people.staff.id!,
      "select (public.staff_save_hardware_manufacturer(null,null,$1,null,true)).id",
      [`Race Maker ${unique()}`],
    );
    assertEquals(manufacturer, "PT409 duplicate_manufacturer");
    const { model: target } = await fixture(people.staff.client);
    const link = await race(
      people.staff.id!,
      "select (public.staff_link_shopify_listing($1,$2,null,null,null,null)).id",
      [target.id, shopifyNumber()],
    );
    assertEquals(link, "PT409 listing_already_linked");
  },
);
