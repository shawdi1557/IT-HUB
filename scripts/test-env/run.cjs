#!/usr/bin/env node
// The only supported way to run the Deno tests.
//   unit        No network at all. Database tests are ignored.
//   db          The database suites, on the verified disposable environment only.
//   regression  The P0 regression tests, which are expected to fail until Phase 2.
//   safety      Proves the network limits and the guard from inside a real test run.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const lib = require("./lib.cjs");

const { API_PORT, DB_PORT, ROOT, SMS_SINK_PORT, refuse, run } = lib;

const TESTS_DIR = "supabase/functions/tests";
const BASE_FLAGS = ["test", "--no-prompt", "--no-lock", "--allow-read", "--allow-env"];
const NETWORK_FLAG = `--allow-net=127.0.0.1:${API_PORT},127.0.0.1:${DB_PORT}`;

function databaseTestFiles() {
  return fs
    .readdirSync(path.join(ROOT, TESTS_DIR))
    .filter((file) => file.endsWith(".test.ts") && file !== "test-env-safety.test.ts")
    .filter((file) => /\bdbTest\(/.test(fs.readFileSync(path.join(ROOT, TESTS_DIR, file), "utf8")))
    .map((file) => `${TESTS_DIR}/${file}`);
}

function denoBinary() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const installed = path.join(
    home,
    ".deno",
    "bin",
    process.platform === "win32" ? "deno.exe" : "deno",
  );
  return run("deno", ["--version"]).status === 0 ? "deno" : installed;
}

function deno(args, env) {
  return run(denoBinary(), args, { env, stdio: "inherit" }).status ?? 1;
}

/**
 * Starts the stand-in SMS provider. It runs the real hook, and its only network permission is its
 * own loopback port, so no message can leave this machine even by mistake.
 */
async function startSmsSink() {
  const stored = fs.readFileSync(path.join(ROOT, ".test-env", "supabase", ".env"), "utf8");
  const secret = stored.match(/^ITHUB_DISPOSABLE_SMS_HOOK_SECRET=(.+)$/m)?.[1]?.trim();
  if (!secret) refuse("the SMS hook secret is missing. Run: npm run test:env:up");

  const sink = spawn(
    denoBinary(),
    [
      "run",
      "--no-prompt",
      "--no-lock",
      `--allow-net=127.0.0.1:${SMS_SINK_PORT}`,
      "--allow-env=ITHUB_SMS_SINK_PORT,ITHUB_SMS_HOOK_SECRET",
      "scripts/test-env/sms-sink.ts",
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...lib.cleanEnv(),
        ITHUB_SMS_SINK_PORT: String(SMS_SINK_PORT),
        ITHUB_SMS_HOOK_SECRET: secret,
      },
    },
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    const ready = await fetch(`http://127.0.0.1:${SMS_SINK_PORT}/__health`).catch(() => null);
    if (ready?.ok) return sink;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  sink.kill();
  return refuse("the SMS sink didn't start.");
}

async function runAgainstDisposable(paths, extraArgs, { smsSink = false } = {}) {
  const identity = await lib.verifyDisposable();
  const before = lib.protectedSnapshot();
  const env = {
    ...lib.cleanEnv(),
    ITHUB_TEST_ENV: "disposable",
    ITHUB_TEST_ENV_ID: identity.envId,
    ITHUB_TEST_SUPABASE_URL: identity.apiUrl,
    ITHUB_TEST_DB_URL: identity.dbUrl,
    ITHUB_TEST_ANON_KEY: identity.anonKey,
    ITHUB_TEST_SERVICE_KEY: identity.serviceRoleKey,
    SUPABASE_URL: identity.apiUrl,
    SUPABASE_ANON_KEY: identity.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: identity.serviceRoleKey,
    VITE_SUPABASE_URL: identity.apiUrl,
    VITE_SUPABASE_ANON_KEY: identity.anonKey,
  };
  const sink = smsSink ? await startSmsSink() : null;
  const networkFlag = sink ? `${NETWORK_FLAG},127.0.0.1:${SMS_SINK_PORT}` : NETWORK_FLAG;
  if (sink) env.ITHUB_SMS_SINK_PORT = String(SMS_SINK_PORT);
  let status;
  try {
    status = deno([...BASE_FLAGS, networkFlag, ...extraArgs, ...paths], env);
  } finally {
    if (sink) sink.kill();
  }
  lib.assertProtectedUnchanged(before);
  return status;
}

/** Attacks the guard with hostile settings, using a probe whose body touches nothing. */
async function runSafety(extraArgs) {
  const status = await runAgainstDisposable(["test-env/safety/network-limits.test.ts"], extraArgs);
  if (status !== 0) return status;

  const identity = await lib.verifyDisposable({ quiet: true });
  const before = lib.protectedSnapshot();
  const correct = {
    ITHUB_TEST_ENV: "disposable",
    ITHUB_TEST_ENV_ID: identity.envId,
    ITHUB_TEST_SUPABASE_URL: identity.apiUrl,
    ITHUB_TEST_DB_URL: identity.dbUrl,
    ITHUB_TEST_ANON_KEY: identity.anonKey,
    ITHUB_TEST_SERVICE_KEY: identity.serviceRoleKey,
  };
  const existingStack = {
    ...correct,
    ITHUB_TEST_SUPABASE_URL: "http://127.0.0.1:54321",
    ITHUB_TEST_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  };
  const scenarios = [
    { name: "No test environment, full permissions", flags: ["-A"], env: {}, expect: "1 ignored" },
    {
      name: "Pointed at the existing stack, full permissions",
      flags: ["-A"],
      env: existingStack,
      expect: "REFUSED: port 54321",
    },
    {
      name: "Pointed at the existing stack, limited network",
      flags: [NETWORK_FLAG],
      env: existingStack,
      expect: "REFUSED: port 54321",
    },
    {
      name: "Existing database behind the disposable API",
      flags: ["-A"],
      env: { ...correct, ITHUB_TEST_DB_URL: existingStack.ITHUB_TEST_DB_URL },
      expect: "REFUSED: port 54322",
    },
    {
      name: "Pointed at a hosted URL, full permissions",
      flags: ["-A"],
      env: { ...correct, ITHUB_TEST_SUPABASE_URL: "https://example-project.supabase.co" },
      expect: 'REFUSED: "example-project.supabase.co"',
    },
    {
      name: "Correct target, but run with full permissions",
      flags: ["-A"],
      env: correct,
      expect: "REFUSED: this run has network access",
    },
    {
      name: "Correct ports, wrong environment id",
      flags: [NETWORK_FLAG],
      env: { ...correct, ITHUB_TEST_ENV_ID: "00000000-0000-4000-8000-000000000000" },
      expect: "REFUSED: the API target",
    },
    {
      name: "Verified disposable run (positive case)",
      flags: [NETWORK_FLAG],
      env: { ...correct, ITHUB_PROBE_EXPECT_RUN: "yes" },
      expect: "1 passed",
    },
  ];

  let failures = 0;
  for (const scenario of scenarios) {
    const probe = run(
      "deno",
      [
        "test",
        "--no-prompt",
        "--no-lock",
        // -A can't be combined with narrower flags, which is the case being tested.
        ...(scenario.flags.includes("-A") ? [] : ["--allow-read", "--allow-env"]),
        ...scenario.flags,
        "test-env/safety/refusal-probe.test.ts",
      ],
      { env: { ...lib.cleanEnv(), NO_COLOR: "1", ...scenario.env } },
    );
    const output = probe.stdout + probe.stderr;
    const passed = output.includes(scenario.expect) && !output.includes("GUARD FAILED");
    if (!passed) failures++;
    console.log(`${passed ? "PASS" : "FAIL"} | ${scenario.name} | expected: ${scenario.expect}`);
  }

  const widened = run("node", ["scripts/test-env/run.cjs", "db", "--allow-all"]);
  const refusedFlag = widened.status === 2 && widened.stderr.includes("REFUSED");
  if (!refusedFlag) failures++;
  console.log(
    `${refusedFlag ? "PASS" : "FAIL"} | The runner refuses wider permissions | expected: REFUSED`,
  );

  lib.assertProtectedUnchanged(before);
  console.log(failures ? `${failures} safety check(s) FAILED` : "All refusal checks passed.");
  return failures ? 1 : 0;
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const extraArgs = rest.filter((arg) => arg.startsWith("--"));
  const paths = rest.filter((arg) => !arg.startsWith("--"));

  if (
    extraArgs.some((arg) => /^(-A|--allow-all|--allow-net|--allow-write|--allow-run)/.test(arg))
  ) {
    refuse("permissions can't be widened through this command.");
  }

  switch (mode) {
    case "unit":
      process.exit(
        deno(
          [...BASE_FLAGS, ...extraArgs, ...(paths.length ? paths : [TESTS_DIR])],
          lib.cleanEnv(),
        ),
      );
      break;
    case "db":
      process.exit(
        await runAgainstDisposable(paths.length ? paths : databaseTestFiles(), extraArgs),
      );
      break;
    case "regression":
      process.exit(
        await runAgainstDisposable(paths.length ? paths : ["test-env/regression"], extraArgs, {
          smsSink: true,
        }),
      );
      break;
    case "safety":
      process.exit(await runSafety(extraArgs));
      break;
    default:
      refuse(`unknown mode "${mode}". Use unit, db, regression or safety.`);
  }
}

main().catch((error) => refuse(error.message));
