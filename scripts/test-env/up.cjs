#!/usr/bin/env node
// Creates the disposable Supabase stack from an empty database and marks it as disposable.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const lib = require("./lib.cjs");

const { DB_CONTAINER, IDENTITY_FILE, PROJECT_ID, ROOT, WORKDIR, psql, refuse, run } = lib;

async function main() {
  if (run("docker", ["info", "--format", "{{.ServerVersion}}"]).status !== 0) {
    refuse("Docker isn't available.");
  }
  if (run("docker", ["inspect", DB_CONTAINER]).status === 0) {
    refuse(`${PROJECT_ID} already exists. Run: npm run test:env:down, then up again.`);
  }
  const volumes = run("docker", ["volume", "ls", "--format", "{{.Name}}"]).stdout;
  if (volumes.includes(DB_CONTAINER)) {
    refuse(`volume ${DB_CONTAINER} already exists. Run: npm run test:env:down, then up again.`);
  }

  const before = lib.protectedSnapshot();
  console.log(`Protected database before: ${before ? before.recoveredOrders : "not running"}`);

  // Rendered fresh every time. Only migrations are copied: no links, no .temp, no seed data.
  fs.rmSync(WORKDIR, { recursive: true, force: true });
  const migrations = path.join(WORKDIR, "supabase", "migrations");
  fs.mkdirSync(migrations, { recursive: true });
  fs.cpSync(path.join(ROOT, "supabase", "migrations"), migrations, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, "test-env", "config.template.toml"),
    path.join(WORKDIR, "supabase", "config.toml"),
  );
  // A random secret means tokens from this stack don't work on the development stack, or vice versa.
  fs.writeFileSync(
    path.join(WORKDIR, "supabase", ".env"),
    `ITHUB_DISPOSABLE_JWT_SECRET=${crypto.randomBytes(40).toString("hex")}
ITHUB_DISPOSABLE_SMS_HOOK_SECRET=v1,whsec_${crypto.randomBytes(32).toString("base64")}
`,
  );

  console.log("Starting the disposable stack. Migrations replay from empty...");
  const start = lib.supabase(["start"], { stdio: "inherit" });
  if (start.status !== 0) {
    refuse("supabase start failed. The protected stack was not touched by this script.");
  }

  const status = lib.supabase(["status", "-o", "json"]);
  const json = JSON.parse(status.stdout.slice(status.stdout.indexOf("{")));
  const envId = crypto.randomUUID();
  const identity = {
    envId,
    projectId: PROJECT_ID,
    createdAt: new Date().toISOString(),
    apiUrl: json.API_URL,
    dbUrl: json.DB_URL,
    anonKey: json.ANON_KEY,
    serviceRoleKey: json.SERVICE_ROLE_KEY,
  };

  // A fresh environment must contain no users and no orders.
  const empty = psql(
    DB_CONTAINER,
    "select (select count(*) from auth.users) + (select count(*) from public.shopify_customer_orders) + (select count(*) from public.service_requests);",
  );
  if (empty.status !== 0 || empty.stdout.trim() !== "0") {
    refuse(`the new database isn't empty (${empty.stdout.trim()} ${empty.stderr.trim()}).`);
  }

  const marker = psql(
    DB_CONTAINER,
    [
      "create schema ithub_test_env",
      "create table ithub_test_env.identity (singleton boolean primary key default true check (singleton), env_id uuid not null, env_kind text not null check (env_kind = 'disposable'), project_id text not null, created_at timestamptz not null default now())",
      `insert into ithub_test_env.identity (env_id, env_kind, project_id) values ('${envId}', 'disposable', '${PROJECT_ID}')`,
      "create function public.ithub_test_env_identity() returns jsonb language sql security definer set search_path = '' as $$ select jsonb_build_object('env_id', env_id, 'env_kind', env_kind, 'project_id', project_id) from ithub_test_env.identity $$",
      "revoke all on function public.ithub_test_env_identity() from public, anon, authenticated",
      "grant execute on function public.ithub_test_env_identity() to service_role",
      "notify pgrst, 'reload schema';",
    ].join("; "),
  );
  if (marker.status !== 0) refuse(`could not write the marker: ${marker.stderr.trim()}`);

  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2));

  // PostgREST reloads its schema cache asynchronously, so give it a moment.
  for (let attempt = 0; attempt < 20; attempt++) {
    const probe = await fetch(`${identity.apiUrl}/rest/v1/rpc/ithub_test_env_identity`, {
      method: "POST",
      headers: {
        apikey: identity.serviceRoleKey,
        Authorization: `Bearer ${identity.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch(() => null);
    if (probe?.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await lib.verifyDisposable();
  await lib.loadFixtures(identity);
  lib.assertProtectedUnchanged(before);
  console.log("\nReady. Next: npm run test:db");
}

main().catch((error) => refuse(error.message));
