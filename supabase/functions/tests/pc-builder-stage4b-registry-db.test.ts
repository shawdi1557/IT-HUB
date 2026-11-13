// Stage 4B: the Hardware Specification Manager's database side (migration 20261112000001), proven on the disposable
// stack with real signed-in synthetic users: who may read and change what, validation in the database, exact-identity
// and possible-duplicate refusals, revisions and activity written in the same transaction, append-only history,
// version checks, links and overrides, the public registry read, sync job rules, and the seeded catalogue matching
// the TypeScript one.
//
// DISPOSABLE STACK ONLY (dbTest). Synthetic users, manufacturers, models and made-up Shopify ids; nothing here is IT HUB
// data, and nothing contacts Shopify.

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
import * as Spec from "../../../src/lib/builder/hardware-spec.ts";
import * as Portal from "../../../ITHUB_ADMIN/src/lib/hardware-messages.ts";

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
/** A made-up Shopify numeric id, unique per call. */
const shopifyNumber = () => String(9_000_000_000 + Math.floor(Math.random() * 999_999_999));

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

dbTest(
  "S4B-DB-1: the seeded categories, fields and mappings equal the TypeScript catalogue",
  async () => {
    const categories = await sql<{ id: string; label: string; builder_slot: string }>(
      "select id, label, builder_slot from public.hardware_categories order by sort_order",
    );
    assertEquals(
      categories.map((c) => [c.id, c.label, c.builder_slot]),
      Spec.HARDWARE_CATEGORIES.map((c) => [c.id, c.label, c.builderSlot]),
    );
    const fields = await sql<Record<string, any>>(
      `select category_id, key, label, value_type, unit, min_value::float8 as min, max_value::float8 as max, choices,
            max_length, pattern, required, inheritable, metafield_key
     from public.hardware_spec_fields order by category_id, sort_order`,
    );
    const expected = [...Spec.HARDWARE_SPEC_FIELDS].sort((a, b) =>
      a.category.localeCompare(b.category),
    );
    assertEquals(fields.length, expected.length);
    for (const f of expected) {
      const row = fields.find((r) => r.category_id === f.category && r.key === f.key);
      assert(row, `${f.category}.${f.key} missing`);
      assertEquals(
        [
          row.label,
          row.value_type,
          row.unit ?? undefined,
          row.min == null ? undefined : Number(row.min),
          row.max == null ? undefined : Number(row.max),
          row.choices ?? undefined,
          row.max_length ?? undefined,
          row.pattern ?? undefined,
          row.required,
          row.inheritable,
          row.metafield_key ?? undefined,
        ],
        [
          f.label,
          f.type,
          f.unit,
          f.min,
          f.max,
          f.choices ? [...f.choices] : undefined,
          f.maxLength,
          f.pattern,
          f.required,
          f.inheritable,
          f.metafieldKey,
        ],
        `${f.category}.${f.key}`,
      );
    }
    const mappings = await sql<{ n: bigint }>(
      "select count(*) as n from public.hardware_metafield_mappings",
    );
    assertEquals(
      Number(mappings[0].n),
      Spec.HARDWARE_SPEC_FIELDS.filter((f) => f.metafieldKey).length,
    );
  },
);

dbTest(
  "S4B-DB-2: Admin and Staff read and change the registry; service staff, customers and visitors can't",
  async () => {
    const people = await cast(`s4b-db2-${unique()}`);
    const maker = await manufacturer(people.staff.client);
    const created = await model(people.staff.client, maker.id);
    for (const [who, client] of [
      ["admin", people.admin.client],
      ["staff", people.staff.client],
    ] as const) {
      const { data, error } = await client
        .from("hardware_models")
        .select("id")
        .eq("id", created.id);
      assertEquals(error, null, who);
      assertEquals(data?.length, 1, who);
    }
    for (const [who, client] of [
      ["service staff", people.serviceStaff.client],
      ["customer", people.customer.client],
      ["visitor", anon()],
    ] as const) {
      const { data } = await client.from("hardware_models").select("id").eq("id", created.id);
      assertEquals(data ?? [], [], `${who} must read nothing`);
      const res = await rpc(client, "staff_create_hardware_model", {
        p_category: "GPU",
        p_manufacturer_id: maker.id,
        p_model_name: `Forbidden ${unique()}`,
        p_model_number: null,
        p_is_base: false,
        p_base_model_id: null,
        p_notes: null,
        p_specs: {},
        p_confirm_distinct: true,
        p_reason: null,
      });
      assert(res.error, `${who} must not create`);
      assert(
        res.code === "forbidden" || /permission denied/i.test(res.error.message),
        `${who}: ${res.error.message}`,
      );
    }
    // No direct writes, even for staff and administrators.
    for (const client of [people.staff.client, people.admin.client]) {
      const update = await client
        .from("hardware_models")
        .update({ model_name: "Edited directly" })
        .eq("id", created.id)
        .select();
      assert(update.error || (update.data ?? []).length === 0, "direct update must fail");
      const insert = await client.from("hardware_activity_log").insert({ action: "model_created" });
      assert(insert.error, "direct log insert must fail");
    }
    const still = await sql<{ model_name: string }>(
      "select model_name from public.hardware_models where id = $1",
      created.id,
    );
    assert(still[0].model_name.startsWith("Synthetic Board"));
  },
);

dbTest(
  "S4B-DB-3: the database validates values with the TypeScript rules and normalises them",
  async () => {
    const people = await cast(`s4b-db3-${unique()}`);
    const maker = await manufacturer(people.staff.client);
    const created = await model(people.staff.client, maker.id, {
      p_specs: {
        ...GPU_SPECS,
        vram_type: "gddr6x",
        display_outputs: [" 3x DisplayPort 1.4a ", "3x DisplayPort 1.4a"],
        width_slots: 2.5,
        chipset: "",
      },
    });
    assertEquals(created.specs, {
      ...GPU_SPECS,
      vram_type: "GDDR6X",
      display_outputs: ["3x DisplayPort 1.4a"],
      width_slots: 2.5,
    });
    assertEquals(
      created.specs,
      Spec.validateHardwareSpecs("GPU", {
        ...GPU_SPECS,
        vram_type: "gddr6x",
        display_outputs: [" 3x DisplayPort 1.4a ", "3x DisplayPort 1.4a"],
        width_slots: 2.5,
        chipset: "",
      }).values,
    );

    const refused = async (specs: Record<string, unknown>) => {
      const res = await rpc(people.staff.client, "staff_save_hardware_specs", {
        p_model_id: created.id,
        p_expected_version: created.version,
        p_specs: specs,
        p_reason: null,
      });
      assertEquals(res.code, "specs_invalid", JSON.stringify(specs));
      const detail = JSON.parse(res.error.details) as { field: string; code: string }[];
      const local = Spec.validateHardwareSpecs("GPU", specs)
        .errors.map((e) => `${e.field}:${e.code}`)
        .sort();
      assertEquals(
        detail.map((e) => `${e.field}:${e.code}`).sort(),
        local,
        "database and TypeScript agree",
      );
    };
    await refused({ tdp_watts: "200W" });
    await refused({ tdp_watts: 200.5 });
    await refused({ length_mm: 501 });
    await refused({ vram_type: "GDDR9" });
    await refused({ socket: "AM5" });
    await refused({ width_slots: 2.555 });
    await refused({ tdp_watts: 300, recommended_psu_watts: 250 });
    // Refused saves change nothing and leave no revision.
    const revisions = await sql<{ n: bigint }>(
      "select count(*) as n from public.hardware_spec_revisions where model_id = $1",
      created.id,
    );
    assertEquals(Number(revisions[0].n), 1);
  },
);

dbTest(
  "S4B-DB-4: exact identity is unique; a possible duplicate needs confirming; chipset-sharing boards stay separate",
  async () => {
    const people = await cast(`s4b-db4-${unique()}`);
    const maker = await manufacturer(people.staff.client);
    const name = `Dual GeForce RTX 4070 ${unique()}`;
    await model(people.staff.client, maker.id, {
      p_model_name: name,
      p_model_number: "DUAL-RTX4070-12G",
    });
    const exact = await rpc(people.staff.client, "staff_create_hardware_model", {
      p_category: "GPU",
      p_manufacturer_id: maker.id,
      p_model_name: name.toUpperCase().replace(/ /g, "-"),
      p_model_number: "dual rtx4070 12g",
      p_is_base: false,
      p_base_model_id: null,
      p_notes: null,
      p_specs: {},
      p_confirm_distinct: true,
      p_reason: null,
    });
    assertEquals(exact.code, "duplicate_model");
    const similar = await rpc(people.staff.client, "staff_create_hardware_model", {
      p_category: "GPU",
      p_manufacturer_id: maker.id,
      p_model_name: `${name} OC`,
      p_model_number: null,
      p_is_base: false,
      p_base_model_id: null,
      p_notes: null,
      p_specs: {},
      p_confirm_distinct: false,
      p_reason: null,
    });
    assertEquals(similar.code, "possible_duplicate");
    assertEquals(JSON.parse(similar.error.details)[0].model_name, name);
    // Confirmed distinct: saved, and the confirmation is recorded.
    const confirmed = await rpc(people.staff.client, "staff_create_hardware_model", {
      p_category: "GPU",
      p_manufacturer_id: maker.id,
      p_model_name: `${name} OC`,
      p_model_number: null,
      p_is_base: false,
      p_base_model_id: null,
      p_notes: null,
      p_specs: {},
      p_confirm_distinct: true,
      p_reason: null,
    });
    assertEquals(confirmed.error, null);
    const log = await sql<{ details: any }>(
      "select details from public.hardware_activity_log where model_id = $1 and action = 'model_created'",
      confirmed.data.id,
    );
    assertEquals(log[0].details.confirmed_distinct, true);
    // Another maker's board on the same chip is a different model, with no warning.
    const other = await manufacturer(people.staff.client);
    const ventus = await rpc(people.staff.client, "staff_create_hardware_model", {
      p_category: "GPU",
      p_manufacturer_id: other.id,
      p_model_name: name,
      p_model_number: null,
      p_is_base: false,
      p_base_model_id: null,
      p_notes: null,
      p_specs: {},
      p_confirm_distinct: false,
      p_reason: null,
    });
    assertEquals(ventus.error, null);
    // Manufacturers: unique by name, punctuation ignored.
    const again = await rpc(people.staff.client, "staff_save_hardware_manufacturer", {
      p_id: null,
      p_expected_version: null,
      p_name: ` ${maker.name.toUpperCase()} `,
      p_website_url: null,
      p_is_active: true,
    });
    assertEquals(again.code, "duplicate_manufacturer");
  },
);

dbTest(
  "S4B-DB-5: each change is a new revision with the actor and changed fields; history is append-only",
  async () => {
    const people = await cast(`s4b-db5-${unique()}`);
    const maker = await manufacturer(people.staff.client);
    const created = await model(people.staff.client, maker.id);
    const saved = await rpc(people.admin.client, "staff_save_hardware_specs", {
      p_model_id: created.id,
      p_expected_version: created.version,
      p_specs: { ...GPU_SPECS, length_mm: 245, vram_gb: 12 },
      p_reason: "measured the card",
    });
    assertEquals(saved.error, null);
    assertEquals(saved.data.spec_revision, 2);
    const rev = await sql<any>(
      "select revision_no, changes, reason, actor_user_id, actor_role, specs from public.hardware_spec_revisions where model_id = $1 order by revision_no",
      created.id,
    );
    assertEquals(rev.length, 2);
    assertEquals(rev[1].actor_user_id, people.admin.id);
    assertEquals(rev[1].actor_role, "portal_admin");
    assertEquals(rev[1].reason, "measured the card");
    assertEquals(rev[1].changes, [
      { field: "length_mm", from: 242, to: 245 },
      { field: "vram_gb", from: null, to: 12 },
    ]);
    assertEquals(rev[0].specs, GPU_SPECS);
    // The same values again: nothing recorded, version unchanged.
    const same = await rpc(people.staff.client, "staff_save_hardware_specs", {
      p_model_id: created.id,
      p_expected_version: saved.data.version,
      p_specs: saved.data.specs,
      p_reason: null,
    });
    assertEquals(same.data.version, saved.data.version);
    // A stale version is refused.
    const stale = await rpc(people.staff.client, "staff_save_hardware_specs", {
      p_model_id: created.id,
      p_expected_version: created.version,
      p_specs: GPU_SPECS,
      p_reason: null,
    });
    assertEquals(stale.code, "stale_version");
    // Activity: created, spec_created, spec_updated, with the actor.
    const actions = await sql<{ action: string; actor_user_id: string }>(
      "select action, actor_user_id from public.hardware_activity_log where model_id = $1 order by id",
      created.id,
    );
    assertEquals(
      actions.map((a) => a.action),
      ["model_created", "spec_created", "spec_updated"],
    );
    assertEquals(actions[2].actor_user_id, people.admin.id);
    // Not even the database owner can rewrite history.
    for (const statement of [
      "update public.hardware_spec_revisions set reason = 'x' where model_id = $1",
      "delete from public.hardware_spec_revisions where model_id = $1",
      "update public.hardware_activity_log set action = 'model_updated' where model_id = $1",
      "delete from public.hardware_activity_log where model_id = $1",
    ]) {
      let failed = false;
      try {
        await sql(statement, created.id);
      } catch (error) {
        failed = /append-only/.test(String(error));
      }
      assert(failed, statement);
    }
  },
);

dbTest(
  "S4B-DB-6: links, the variant-first public read, overrides, inheritance and corrections",
  async () => {
    const people = await cast(`s4b-db6-${unique()}`);
    const maker = await manufacturer(people.staff.client);
    const base = await model(people.staff.client, maker.id, {
      p_is_base: true,
      p_model_name: `Reference chip ${unique()}`,
      p_specs: { tdp_watts: 200, recommended_psu_watts: 650, length_mm: 300 },
    });
    const board = await model(people.staff.client, maker.id, {
      p_base_model_id: base.id,
      p_specs: { length_mm: 242, pcie_8pin_required: 1, pcie_16pin_required: 0 },
    });
    // A base model can't be linked.
    const product = shopifyNumber();
    const baseLink = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: base.id,
      p_product_id: product,
      p_variant_id: null,
      p_product_title: null,
      p_variant_title: null,
      p_reason: null,
    });
    assertEquals(baseLink.code, "base_model_not_linkable");
    const link = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: board.id,
      p_product_id: product,
      p_variant_id: null,
      p_product_title: "Synthetic listing",
      p_variant_title: null,
      p_reason: null,
    });
    assertEquals(link.error, null);
    assertEquals(link.data.shopify_product_id, `gid://shopify/Product/${product}`);
    const twice = await rpc(people.admin.client, "staff_link_shopify_listing", {
      p_model_id: board.id,
      p_product_id: `gid://shopify/Product/${product}`,
      p_variant_id: null,
      p_product_title: null,
      p_variant_title: null,
      p_reason: null,
    });
    assertEquals(twice.code, "listing_already_linked");
    const bad = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: board.id,
      p_product_id: "not-an-id",
      p_variant_id: null,
      p_product_title: null,
      p_variant_title: null,
      p_reason: null,
    });
    assertEquals(bad.code, "shopify_id_invalid");

    // The public read: technical values only, and the TypeScript resolution reaches the inherited values.
    const { data: rows, error } = await anon().rpc("get_pc_builder_registry_specs", {
      p_product_ids: [`gid://shopify/Product/${product}`],
      p_variant_ids: [],
    });
    assertEquals(error, null);
    assertEquals(rows.length, 1);
    assertEquals(Object.keys(rows[0]).sort(), [
      "base_specs",
      "category_id",
      "link_id",
      "manufacturer",
      "model_id",
      "model_name",
      "model_number",
      "model_specs",
      "override_revision",
      "overrides",
      "shopify_product_id",
      "shopify_variant_id",
      "spec_revision",
    ]);
    const record = Spec.registryRecordFromRow(rows[0])!;
    const resolved = Spec.registryBuilderValues(record).resolved;
    assertEquals(resolved.values.length_mm, 242);
    assertEquals(resolved.values.recommended_psu_watts, 650);
    assertEquals(resolved.sources.recommended_psu_watts, "base");
    assert(resolved.complete);

    // Overrides: validated as the model's category, recorded as the link's own revision.
    const overridden = await rpc(people.staff.client, "staff_save_listing_overrides", {
      p_link_id: link.data.id,
      p_expected_version: link.data.version,
      p_overrides: { length_mm: 250 },
      p_reason: "bundle edition",
    });
    assertEquals(overridden.error, null);
    assertEquals(overridden.data.override_revision, 1);
    const wrong = await rpc(people.staff.client, "staff_save_listing_overrides", {
      p_link_id: link.data.id,
      p_expected_version: overridden.data.version,
      p_overrides: { socket: "AM5" },
      p_reason: null,
    });
    assertEquals(wrong.code, "specs_invalid");

    // A variant link wins over its product's link.
    const variant = shopifyNumber();
    const other = await model(people.staff.client, maker.id, {
      p_specs: { ...GPU_SPECS, length_mm: 300 },
    });
    const variantLink = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: other.id,
      p_product_id: product,
      p_variant_id: variant,
      p_product_title: null,
      p_variant_title: "Edition B",
      p_reason: null,
    });
    assertEquals(variantLink.error, null);
    const all = (
      await anon().rpc("get_pc_builder_registry_specs", {
        p_product_ids: [`gid://shopify/Product/${product}`],
        p_variant_ids: [],
      })
    ).data.map((row: unknown) => Spec.registryRecordFromRow(row)!);
    const lookup = Spec.registryLookup(all);
    assertEquals(lookup(`gid://shopify/ProductVariant/${variant}`, product)?.modelId, other.id);
    assertEquals(lookup("gid://shopify/ProductVariant/1", product)?.modelId, board.id);

    // Correcting a wrong link needs a reason; removal is kept, never deleted.
    const moveNoReason = await rpc(people.staff.client, "staff_relink_shopify_listing", {
      p_link_id: variantLink.data.id,
      p_expected_version: variantLink.data.version,
      p_model_id: board.id,
      p_reason: "",
    });
    assertEquals(moveNoReason.code, "reason_required");
    const moved = await rpc(people.staff.client, "staff_relink_shopify_listing", {
      p_link_id: variantLink.data.id,
      p_expected_version: variantLink.data.version,
      p_model_id: board.id,
      p_reason: "linked to the wrong edition",
    });
    assertEquals(moved.data.model_id, board.id);
    const removed = await rpc(people.staff.client, "staff_remove_shopify_link", {
      p_link_id: moved.data.id,
      p_expected_version: moved.data.version,
      p_reason: "listing withdrawn",
    });
    assertEquals(removed.data.status, "removed");
    const kept = await sql<{ status: string }>(
      "select status from public.hardware_shopify_links where id = $1",
      moved.data.id,
    );
    assertEquals(kept[0].status, "removed");
    const actions = await sql<{ action: string }>(
      "select action from public.hardware_activity_log where link_id = $1 order by id",
      moved.data.id,
    );
    assertEquals(
      actions.map((a) => a.action),
      ["link_created", "link_changed", "link_removed"],
    );
  },
);

dbTest("S4B-DB-7: archiving and mappings are for administrators; staff are refused", async () => {
  const people = await cast(`s4b-db7-${unique()}`);
  const maker = await manufacturer(people.staff.client);
  const created = await model(people.staff.client, maker.id);
  const byStaff = await rpc(people.staff.client, "staff_set_hardware_model_archived", {
    p_model_id: created.id,
    p_expected_version: created.version,
    p_archived: true,
    p_reason: "not stocked",
  });
  assertEquals(byStaff.code, "forbidden");
  const byAdmin = await rpc(people.admin.client, "staff_set_hardware_model_archived", {
    p_model_id: created.id,
    p_expected_version: created.version,
    p_archived: true,
    p_reason: "not stocked",
  });
  assertEquals(byAdmin.data.status, "archived");
  // An archived model isn't in the public read and can't be edited until restored.
  const edit = await rpc(people.staff.client, "staff_save_hardware_specs", {
    p_model_id: created.id,
    p_expected_version: byAdmin.data.version,
    p_specs: GPU_SPECS,
    p_reason: null,
  });
  assertEquals(edit.code, "model_archived");

  const [mapping] = await sql<{ id: string; version: number }>(
    "select id, version from public.hardware_metafield_mappings where category_id = 'GPU' and field_key = 'length_mm'",
  );
  const staffToggle = await rpc(people.staff.client, "staff_set_hardware_metafield_mapping", {
    p_id: mapping.id,
    p_expected_version: mapping.version,
    p_enabled: false,
  });
  assertEquals(staffToggle.code, "forbidden");
  const off = await rpc(people.admin.client, "staff_set_hardware_metafield_mapping", {
    p_id: mapping.id,
    p_expected_version: mapping.version,
    p_enabled: false,
  });
  assertEquals(off.data.is_enabled, false);
  const on = await rpc(people.admin.client, "staff_set_hardware_metafield_mapping", {
    p_id: mapping.id,
    p_expected_version: off.data.version,
    p_enabled: true,
  });
  assertEquals(on.data.is_enabled, true);
  // Only pc_builder, only the defined keys: the table itself refuses anything else.
  let refused = false;
  try {
    await sql(
      "update public.hardware_metafield_mappings set namespace = 'custom' where id = $1",
      mapping.id,
    );
  } catch {
    refused = true;
  }
  assert(refused);
});

dbTest(
  "S4B-DB-8: sync jobs: service role only; one waiting job per listing; stale revisions superseded; retries",
  async () => {
    const people = await cast(`s4b-db8-${unique()}`);
    const maker = await manufacturer(people.staff.client);
    const created = await model(people.staff.client, maker.id);
    const link = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: created.id,
      p_product_id: shopifyNumber(),
      p_variant_id: null,
      p_product_title: null,
      p_variant_title: null,
      p_reason: null,
    });
    const payload = [
      { namespace: "pc_builder", key: "gpu_length_mm", type: "number_integer", value: "242" },
    ];
    const enqueue = (client: any, hash: string, specRevision = 1) =>
      rpc(client, "hardware_sync_enqueue", {
        p_link_id: link.data.id,
        p_spec_revision: specRevision,
        p_override_revision: 0,
        p_payload: payload,
        p_payload_hash: hash,
        p_actor: people.staff.id,
        p_actor_role: "quotation_staff",
      });
    // Staff can't call the job functions directly: only the Edge Function's service role can.
    const direct = await enqueue(people.staff.client, "a".repeat(64));
    assert(direct.error && /permission denied/i.test(direct.error.message), direct.error?.message);

    const first = await enqueue(service(), "a".repeat(64));
    assertEquals(first.data.status, "queued");
    const same = await enqueue(service(), "a".repeat(64));
    assertEquals(
      same.data.id,
      first.data.id,
      "the same payload waiting is returned, not duplicated",
    );
    const second = await enqueue(service(), "b".repeat(64));
    assertEquals(second.data.status, "queued");
    const old = await sql<{ status: string; superseded_by: string }>(
      "select status, superseded_by from public.hardware_sync_jobs where id = $1",
      first.data.id,
    );
    assertEquals(old[0], { status: "superseded", superseded_by: second.data.id });
    // A payload built from an older revision is refused outright.
    const staleRevision = await enqueue(service(), "c".repeat(64), 0);
    assertEquals(staleRevision.code, "stale_revision");

    // Claim, then fail with a retry: attempts count, the job waits, and a retry by staff requeues it.
    const claimed = await rpc(service(), "hardware_sync_claim", { p_job_id: second.data.id });
    assertEquals(claimed.data.status, "syncing");
    assertEquals(claimed.data.attempts, 1);
    const finished = await rpc(service(), "hardware_sync_finish", {
      p_job_id: second.data.id,
      p_outcome: "retry_pending",
      p_error: { code: "throttled", message: "slow down" },
      p_response: null,
      p_retry_after_seconds: 5,
    });
    assertEquals(finished.data.status, "retry_pending");
    const notDue = await rpc(service(), "hardware_sync_claim", { p_job_id: second.data.id });
    assertEquals(notDue.data?.id ?? null, null, "not due yet");
    const retried = await rpc(service(), "hardware_sync_retry", {
      p_job_id: second.data.id,
      p_actor: people.staff.id,
      p_actor_role: "quotation_staff",
    });
    assertEquals(retried.data.status, "queued");

    // The specification changes before the job runs: the claim supersedes it instead of running it.
    await rpc(people.staff.client, "staff_save_hardware_specs", {
      p_model_id: created.id,
      p_expected_version: created.version,
      p_specs: { ...GPU_SPECS, length_mm: 250 },
      p_reason: null,
    });
    const afterChange = await rpc(service(), "hardware_sync_claim", { p_job_id: second.data.id });
    assertEquals(afterChange.data?.id ?? null, null);
    const status = await sql<{ status: string }>(
      "select status from public.hardware_sync_jobs where id = $1",
      second.data.id,
    );
    assertEquals(status[0].status, "superseded");
    const log = await sql<{ action: string }>(
      "select action from public.hardware_activity_log where link_id = $1 and action like 'sync_%' order by id",
      link.data.id,
    );
    assertEquals(
      log.map((l) => l.action),
      [
        "sync_initiated",
        "sync_superseded",
        "sync_initiated",
        "sync_retry_scheduled",
        "sync_retried",
        "sync_superseded",
      ],
    );
    // Staff read job history; customers don't.
    const { data: seen } = await people.staff.client
      .from("hardware_sync_jobs")
      .select("id")
      .eq("link_id", link.data.id);
    assertEquals(seen?.length, 2);
    const { data: hidden } = await people.customer.client
      .from("hardware_sync_jobs")
      .select("id")
      .eq("link_id", link.data.id);
    assertEquals(hidden ?? [], []);
  },
);

dbTest(
  "S4B-DB-9: the portal's own calls work against the real functions and map refusals to messages",
  async () => {
    const people = await cast(`s4b-db9-${unique()}`);
    const maker = await manufacturer(people.staff.client);
    const created = await model(people.staff.client, maker.id);
    const { error } = await people.staff.client.rpc("staff_save_hardware_specs", {
      p_model_id: created.id,
      p_expected_version: created.version,
      p_specs: { length_mm: 9999 },
      p_reason: null,
    });
    const mapped = Portal.hardwareError(error);
    assertEquals(mapped.code, "specs_invalid");
    assertEquals(mapped.fieldErrors, [{ field: "length_mm", code: "above_maximum" }]);
    const { error: dup } = await people.staff.client.rpc("staff_create_hardware_model", {
      p_category: "GPU",
      p_manufacturer_id: maker.id,
      p_model_name: created.model_name,
      p_model_number: null,
      p_is_base: false,
      p_base_model_id: null,
      p_notes: null,
      p_specs: {},
      p_confirm_distinct: true,
      p_reason: null,
    });
    assertEquals(Portal.hardwareError(dup).code, "duplicate_model");
  },
);

dbTest(
  "S4B-DB-10: the sync function and the quotation server's registry read work end to end on the real tables",
  async () => {
    const { handleHardwareSync } = await import("../hardware-shopify-sync/index.ts");
    const { supabaseSyncStore } = await import("../hardware-shopify-sync/store.ts");
    const { loadRegistryLookup } = await import("../verify-and-submit-pc-quotation/specs.ts");
    const people = await cast(`s4b-db10-${unique()}`);
    const maker = await manufacturer(people.staff.client);
    const created = await model(people.staff.client, maker.id);
    const product = shopifyNumber();
    const link = await rpc(people.staff.client, "staff_link_shopify_listing", {
      p_model_id: created.id,
      p_product_id: product,
      p_variant_id: null,
      p_product_title: "Synthetic",
      p_variant_title: null,
      p_reason: null,
    });
    // The quotation server's read, through the service role.
    const lookup = await loadRegistryLookup(service(), [`gid://shopify/Product/${product}`], []);
    assertEquals(
      lookup?.("gid://shopify/ProductVariant/1", `gid://shopify/Product/${product}`)?.modelId,
      created.id,
    );

    // A stand-in for Shopify's Admin API: records calls; nothing leaves this machine.
    const calls: { query: string; variables: any }[] = [];
    const shopifyAdmin = async (query: string, variables: any) => {
      calls.push({ query, variables });
      if (query.includes("ItHubSyncTarget")) {
        return {
          status: 200,
          body: {
            data: {
              product: {
                id: variables.id,
                variants: { nodes: [{ id: "gid://shopify/ProductVariant/1" }] },
                metafields: { nodes: [] },
              },
            },
          },
        };
      }
      return {
        status: 200,
        body: { data: { metafieldsSet: { metafields: variables.metafields, userErrors: [] } } },
      };
    };
    const send = (body: Record<string, unknown>) =>
      handleHardwareSync(
        new Request("http://localhost/hardware-shopify-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer staff-session" },
          body: JSON.stringify(body),
        }),
        {
          store: supabaseSyncStore(service()),
          shopifyAdmin,
          verifyStaff: async () => ({ userId: people.staff.id, role: "quotation_staff" }),
          env: {
            SHOPIFY_SYNC_WRITES: "enabled",
            APP_ENV: "development",
            SUPABASE_SERVICE_ROLE_KEY: "unused",
          },
        },
      ).then(async (res) => ({ status: res.status, body: await res.json() }));

    const before = await send({ action: "overview" });
    assertEquals(before.status, 200);
    const mine = before.body.listings.find((l: any) => l.link.id === link.data.id);
    assertEquals(mine.state, "not_synced");
    assertEquals(mine.problems, []);
    const synced = await send({ action: "enqueue", linkIds: [link.data.id] });
    assertEquals(synced.body.run[0].status, "synced");
    const set = calls.find((c) => c.query.includes("metafieldsSet"))!;
    assert(
      set.variables.metafields.every(
        (m: any) =>
          m.namespace === "pc_builder" && m.ownerId === `gid://shopify/Product/${product}`,
      ),
    );
    const after = await send({ action: "overview" });
    assertEquals(after.body.listings.find((l: any) => l.link.id === link.data.id).state, "synced");
    const log = await sql<{ action: string; actor_role: string }>(
      "select action, actor_role from public.hardware_activity_log where link_id = $1 and action like 'sync_%' order by id",
      link.data.id,
    );
    assertEquals(
      log.map((l) => `${l.action}:${l.actor_role}`),
      ["sync_initiated:quotation_staff", "sync_succeeded:system"],
    );
  },
);
