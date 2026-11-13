// Owner decision R3 (migration 20261113000002): the October hardware tables are closed to visitors, and nobody writes
// to them through the API, while their rows and the administrator's read access stay. Proven on the disposable stack
// with real signed-in synthetic users.
//
// DISPOSABLE STACK ONLY (dbTest). Synthetic users; the October rows are only read and counted, never changed.

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
const LEGACY = ["hardware_products", "hardware_variants", "hardware_spec_audit_log"];

async function sql<T = Record<string, unknown>>(text: string, ...args: unknown[]): Promise<T[]> {
  const pg = new PgClient(TEST_DB_URL);
  await pg.connect();
  try {
    return (await pg.queryObject<T>(text, args)).rows;
  } finally {
    await pg.end();
  }
}

const counts = async () =>
  Object.fromEntries(
    await Promise.all(
      LEGACY.map(async (t) => [
        t,
        Number((await sql<{ n: bigint }>(`select count(*) as n from public.${t}`))[0].n),
      ]),
    ),
  );

dbTest("R3-1: the grants are exactly as approved", async () => {
  const rows = await sql<{ grantee: string; table_name: string; privilege_type: string }>(
    `select grantee, table_name, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name = any($1) and grantee in ('anon', 'authenticated')
     order by table_name, grantee, privilege_type`,
    LEGACY,
  );
  const of = (role: string, table: string) =>
    rows.filter((r) => r.grantee === role && r.table_name === table).map((r) => r.privilege_type);
  for (const table of LEGACY) {
    assertEquals(of("anon", table), [], `anon on ${table}`);
    assertEquals(of("authenticated", table), ["SELECT"], `authenticated on ${table}`);
  }
});

dbTest(
  "R3-2: visitors can't read; nobody writes through the API; administrators still read every row",
  async () => {
    const before = await counts();
    for (const table of ["hardware_products", "hardware_variants"]) {
      const { data, error } = await createClient(TEST_SUPABASE_URL, TEST_ANON_KEY, NO_SESSION)
        .from(table)
        .select("id")
        .limit(1);
      assert(
        error && /permission denied/i.test(error.message),
        `anon read ${table}: ${error?.message} ${JSON.stringify(data)}`,
      );
    }
    const admin = await createSignedInUser(
      `r3-a-${crypto.randomUUID().slice(0, 6)}`,
      "portal_admin",
    );
    const customer = await createSignedInUser(`r3-c-${crypto.randomUUID().slice(0, 6)}`);
    for (const person of [admin, customer]) {
      for (const table of LEGACY) {
        const insert = await person.client.from(table).insert({}).select();
        assert(
          insert.error && /permission denied/i.test(insert.error.message),
          `${table} insert: ${insert.error?.message}`,
        );
        const update = await person.client
          .from(table)
          .update({ created_at: new Date().toISOString() })
          .not("id", "is", null)
          .select();
        assert(
          update.error && /permission denied/i.test(update.error.message),
          `${table} update: ${update.error?.message}`,
        );
        const del = await person.client.from(table).delete().not("id", "is", null).select();
        assert(
          del.error && /permission denied/i.test(del.error.message),
          `${table} delete: ${del.error?.message}`,
        );
      }
    }
    // The administrator's read path is intact: every row, including any quarantined ones.
    for (const table of ["hardware_products", "hardware_variants", "hardware_spec_audit_log"]) {
      const { data, error } = await admin.client.from(table).select("id");
      assertEquals(error, null, table);
      assertEquals(data?.length, before[table], `admin reads every ${table} row`);
    }
    // The service role and the database owner are unchanged.
    const service = createClient(TEST_SUPABASE_URL, TEST_SERVICE_KEY, NO_SESSION);
    assertEquals(
      (await service.from("hardware_products").select("id")).data?.length,
      before.hardware_products,
    );
    // Nothing was dropped or changed.
    assertEquals(await counts(), before);
  },
);
