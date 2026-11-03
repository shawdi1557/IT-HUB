// Shared safety rules for the disposable test environment. See docs/TEST_ENVIRONMENT.md.
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const WORKDIR_NAME = ".test-env";
const WORKDIR = path.join(ROOT, WORKDIR_NAME);
const IDENTITY_FILE = path.join(WORKDIR, "identity.json");

const PROJECT_ID = "ITHUB_TEST_DISPOSABLE";
const API_PORT = 55421;
const DB_PORT = 55422;
const SMS_SINK_PORT = 55431;
const DB_CONTAINER = `supabase_db_${PROJECT_ID}`;

const PROTECTED_PROJECT_ID = "ITHUB_WEB";
const PROTECTED_DB_CONTAINER = `supabase_db_${PROTECTED_PROJECT_ID}`;
const PROTECTED_PORTS = new Set([54320, 54321, 54322, 54323, 54324, 54327, 54329]);

/** Stops the current command with a clear refusal message. */
function refuse(message) {
  console.error(`\nREFUSED: ${message}\n`);
  process.exit(2);
}

/** Runs a command without a shell, so arguments can't be reinterpreted. Never throws. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/** Env for child processes, with anything that could point somewhere real removed. */
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(SUPABASE|VITE_|RAZORPAY|SHOPIFY|ITHUB_TEST|DENO_AUTH|PG|DATABASE_URL)/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}

/** Runs the Supabase CLI against the disposable workdir only. No other form exists on purpose. */
function supabase(args, options = {}) {
  assertWorkdirIsDisposable();
  if (args.includes("--all") || args.includes("db") || args.includes("link")) {
    refuse(`this tool never runs "supabase ${args.join(" ")}".`);
  }
  // The CLI is an npm shim on Windows, which needs a shell. These arguments are all constants.
  return run("supabase", ["--workdir", WORKDIR_NAME, ...args], {
    env: cleanEnv(),
    shell: process.platform === "win32",
    ...options,
  });
}

function assertWorkdirIsDisposable() {
  const config = path.join(WORKDIR, "supabase", "config.toml");
  if (!fs.existsSync(config)) refuse(`${config} is missing. Run: npm run test:env:up`);
  const match = fs.readFileSync(config, "utf8").match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!match || match[1] !== PROJECT_ID) {
    refuse(`the workdir's project_id is "${match?.[1]}", expected "${PROJECT_ID}".`);
  }
}

/** Rejects anything but this environment's own loopback ports, before any connection is made. */
function assertSafeUrl(rawUrl, expectedPort) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    refuse(`target "${rawUrl}" is not a valid URL.`);
  }
  const port = Number(url.port);
  if (url.hostname !== "127.0.0.1") refuse(`target host "${url.hostname}" is not 127.0.0.1.`);
  if (PROTECTED_PORTS.has(port)) refuse(`port ${port} belongs to the existing development stack.`);
  if (port !== expectedPort) refuse(`port ${port} is not the disposable port ${expectedPort}.`);
}

function readIdentity() {
  if (!fs.existsSync(IDENTITY_FILE)) refuse("no disposable environment. Run: npm run test:env:up");
  return JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf8"));
}

/** Sends SQL over stdin, so nothing in it is ever parsed by a shell. */
function psql(container, sql) {
  return run(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-A",
      "-t",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql },
  );
}

/**
 * Read-only snapshot of the protected development database: the recovered-order fingerprint,
 * plus row counts for customer tables. Returns null if that stack isn't running.
 */
function protectedSnapshot() {
  const up = run("docker", ["inspect", "-f", "{{.State.Running}}", PROTECTED_DB_CONTAINER]);
  if (up.stdout.trim() !== "true") return null;
  const query = (sql) => {
    const r = psql(PROTECTED_DB_CONTAINER, `set default_transaction_read_only = on; ${sql};`);
    if (r.status !== 0) refuse(`could not read the protected database: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  return {
    recoveredOrders: query(
      "select count(*) || '|' || md5(string_agg(t::text, '|' order by id)) from public.shopify_customer_orders t",
    ),
    counts: query(
      "select (select count(*) from auth.users) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from public.service_requests) || '|' || (select count(*) from public.shopify_order_associations)",
    ),
    writes: query(
      "select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) from pg_stat_user_tables where relname in ('shopify_customer_orders', 'shopify_order_associations', 'service_requests', 'profiles')",
    ),
    startedAt: run("docker", [
      "inspect",
      "-f",
      "{{.State.StartedAt}}",
      PROTECTED_DB_CONTAINER,
    ]).stdout.trim(),
  };
}

/** Fails the command if anything about the protected database changed since `before`. */
function assertProtectedUnchanged(before) {
  const after = protectedSnapshot();
  if (!before || !after) {
    console.log("Protected database: not running, so it could not be reached.");
    return after;
  }
  for (const key of ["recoveredOrders", "counts", "writes", "startedAt"]) {
    if (before[key] !== after[key]) {
      refuse(
        `the protected database changed (${key}): ${before[key]} -> ${after[key]}. If you were using the local app during this run, that may be the cause; check before continuing.`,
      );
    }
  }
  console.log(`Protected database unchanged. Recovered orders: ${after.recoveredOrders}`);
  return after;
}

/**
 * Positive identification. Every check must pass or the command stops.
 * The existing database has no marker, so it can never pass.
 */
async function verifyDisposable({ quiet = false } = {}) {
  assertWorkdirIsDisposable();
  const identity = readIdentity();
  if (identity.projectId !== PROJECT_ID) refuse("identity file has the wrong project id.");
  assertSafeUrl(identity.apiUrl, API_PORT);
  assertSafeUrl(identity.dbUrl.replace(/^postgresql:/, "http:"), DB_PORT);

  const inspect = run("docker", [
    "inspect",
    "-f",
    '{{.State.Running}} {{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
    DB_CONTAINER,
  ]);
  if (inspect.status !== 0) refuse(`container ${DB_CONTAINER} not found. Run: npm run test:env:up`);
  if (inspect.stdout.trim() !== `true ${DB_PORT}`) {
    refuse(`container ${DB_CONTAINER} state is "${inspect.stdout.trim()}".`);
  }

  const marker = psql(
    DB_CONTAINER,
    "select env_id || '|' || env_kind || '|' || project_id from ithub_test_env.identity;",
  );
  const expected = `${identity.envId}|disposable|${PROJECT_ID}`;
  if (marker.status !== 0 || marker.stdout.trim() !== expected) {
    refuse("the database marker read through Docker doesn't match the identity file.");
  }

  let rest;
  try {
    const response = await fetch(`${identity.apiUrl}/rest/v1/rpc/ithub_test_env_identity`, {
      method: "POST",
      headers: {
        apikey: identity.serviceRoleKey,
        Authorization: `Bearer ${identity.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    rest = response.ok ? await response.json() : null;
  } catch {
    rest = null;
  }
  if (rest?.env_id !== identity.envId || rest?.env_kind !== "disposable") {
    refuse("the database marker read through the API doesn't match the identity file.");
  }

  if (!quiet) {
    console.log(`Disposable environment verified: ${PROJECT_ID}, ${identity.apiUrl}`);
    console.log(`Environment id: ${identity.envId}`);
  }
  return identity;
}

// Existing suites hardcode these profile ids. Here they belong to invented users.
const SYNTHETIC_USER_IDS = [
  "29f73eb0-86d2-47d3-a493-7c1932b45ed5",
  "0370fb7a-7896-44bc-a543-023dd399913f",
  "4df85a8a-fb06-431d-ae85-831e4b3564d4",
];

/** Reference data from seed.sql, which has no customers, plus invented fixture users. */
async function loadFixtures(identity) {
  const seed = fs.readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8");
  const loaded = run(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: seed },
  );
  if (loaded.status !== 0) refuse(`could not load seed.sql: ${loaded.stderr.trim()}`);

  for (const [index, id] of SYNTHETIC_USER_IDS.entries()) {
    const response = await fetch(`${identity.apiUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: identity.serviceRoleKey,
        Authorization: `Bearer ${identity.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        email: `fixture-${index + 1}@example.test`,
        password: crypto.randomBytes(16).toString("hex"),
        email_confirm: true,
      }),
    });
    if (!response.ok)
      refuse(`could not create fixture user ${index + 1}: ${await response.text()}`);
  }
  console.log(`Fixtures loaded: seed.sql and ${SYNTHETIC_USER_IDS.length} synthetic users.`);
}

module.exports = {
  API_PORT,
  DB_CONTAINER,
  DB_PORT,
  IDENTITY_FILE,
  PROJECT_ID,
  PROTECTED_PORTS,
  SMS_SINK_PORT,
  ROOT,
  WORKDIR,
  assertProtectedUnchanged,
  cleanEnv,
  loadFixtures,
  protectedSnapshot,
  psql,
  refuse,
  run,
  supabase,
  verifyDisposable,
};
