// supabase/functions/tests/_helpers/disposable_env.ts
// Every test that touches a database goes through dbTest. A test body only runs after the
// target has been positively identified as the disposable environment. See docs/TEST_ENVIRONMENT.md.

import { Client as PgClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const API_PORT = 55421;
const DB_PORT = 55422;
const PROTECTED_PORTS = new Set([54320, 54321, 54322, 54323, 54324, 54327, 54329]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Port 9 is never in use, so a client built outside the disposable run can't reach anything.
const NOT_CONFIGURED_URL = "http://127.0.0.1:9";
const NOT_CONFIGURED_DB_URL = "postgresql://postgres:postgres@127.0.0.1:9/postgres";
const NOT_CONFIGURED_KEY = "not-configured";

/** Hosts a disposable run must not be able to reach. Checked through Deno's own permissions. */
const FORBIDDEN_NET_TARGETS = [
  "127.0.0.1:54321",
  "127.0.0.1:54322",
  "localhost:54321",
  "localhost:54322",
  "supabase.co",
  "api.razorpay.com",
  "myshopify.com",
];

export const DB_TESTS_ENABLED = Deno.env.get("ITHUB_TEST_ENV") === "disposable";

export const TEST_SUPABASE_URL = DB_TESTS_ENABLED
  ? (Deno.env.get("ITHUB_TEST_SUPABASE_URL") ?? NOT_CONFIGURED_URL)
  : NOT_CONFIGURED_URL;
export const TEST_DB_URL = DB_TESTS_ENABLED
  ? (Deno.env.get("ITHUB_TEST_DB_URL") ?? NOT_CONFIGURED_DB_URL)
  : NOT_CONFIGURED_DB_URL;
export const TEST_ANON_KEY = DB_TESTS_ENABLED
  ? (Deno.env.get("ITHUB_TEST_ANON_KEY") ?? NOT_CONFIGURED_KEY)
  : NOT_CONFIGURED_KEY;
export const TEST_SERVICE_KEY = DB_TESTS_ENABLED
  ? (Deno.env.get("ITHUB_TEST_SERVICE_KEY") ?? NOT_CONFIGURED_KEY)
  : NOT_CONFIGURED_KEY;

/** Throws unless the URL is this environment's own loopback port. Makes no connection. */
export function assertSafeTargetUrl(rawUrl: string, expectedPort: number) {
  const url = new URL(rawUrl.replace(/^postgres(ql)?:/, "http:"));
  const port = Number(url.port);
  if (url.hostname !== "127.0.0.1") {
    throw new Error(`REFUSED: "${url.hostname}" is not the disposable test host.`);
  }
  if (PROTECTED_PORTS.has(port)) {
    throw new Error(`REFUSED: port ${port} belongs to the existing development database.`);
  }
  if (port !== expectedPort) {
    throw new Error(`REFUSED: port ${port} is not the disposable port ${expectedPort}.`);
  }
}

/** Throws if this process could reach a forbidden target. Catches `deno test -A`. */
export async function assertNetworkIsRestricted() {
  for (const host of FORBIDDEN_NET_TARGETS) {
    const { state } = await Deno.permissions.query({ name: "net", host });
    if (state === "granted") {
      throw new Error(`REFUSED: this run has network access to ${host}. Use: npm run test:db`);
    }
  }
}

/** Reads the marker through both the API and Postgres. The existing database has no marker. */
export async function verifyMarker(
  apiUrl: string,
  dbUrl: string,
  serviceKey: string,
  envId: string,
) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/ithub_test_env_identity`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const api = response.ok ? await response.json() : (await response.body?.cancel(), null);
  if (api?.env_id !== envId || api?.env_kind !== "disposable") {
    throw new Error("REFUSED: the API target has no matching disposable marker.");
  }

  const pg = new PgClient(dbUrl);
  await pg.connect();
  try {
    const { rows } = await pg.queryObject<{ env_id: string; env_kind: string }>(
      "select env_id::text, env_kind from ithub_test_env.identity",
    );
    if (rows[0]?.env_id !== envId || rows[0]?.env_kind !== "disposable") {
      throw new Error("REFUSED: the Postgres target has no matching disposable marker.");
    }
  } finally {
    await pg.end();
  }
}

/** The whole guard. Each check must pass before a database test body may run. */
export async function assertDisposableTarget() {
  if (!DB_TESTS_ENABLED) throw new Error("REFUSED: ITHUB_TEST_ENV is not 'disposable'.");
  const envId = Deno.env.get("ITHUB_TEST_ENV_ID") ?? "";
  if (!UUID.test(envId)) throw new Error("REFUSED: ITHUB_TEST_ENV_ID is not a valid id.");
  assertSafeTargetUrl(TEST_SUPABASE_URL, API_PORT);
  assertSafeTargetUrl(TEST_DB_URL, DB_PORT);
  await assertNetworkIsRestricted();
  await verifyMarker(TEST_SUPABASE_URL, TEST_DB_URL, TEST_SERVICE_KEY, envId);
}

let verified: Promise<void> | null = null;

function guard() {
  verified ??= assertDisposableTarget();
  return verified;
}

/** A test that touches a database. Ignored outside a disposable run, and guarded inside one. */
export function dbTest(name: string, fn: (t: Deno.TestContext) => void | Promise<void>) {
  Deno.test({
    name,
    ignore: !DB_TESTS_ENABLED,
    // The guard holds no open resources, but Supabase clients keep sockets between tests.
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async (t) => {
      await guard();
      await fn(t);
    },
  });
}

/** A test that calls a live third-party service. Always ignored: it needs separate approval. */
export function liveServiceTest(name: string, fn: (t: Deno.TestContext) => void | Promise<void>) {
  Deno.test({ name, ignore: true, fn });
}
