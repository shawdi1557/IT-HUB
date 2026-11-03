#!/usr/bin/env node
// Proves the migrations build a working schema from nothing, without destroying the stack.
// A scratch database is created inside the disposable container, every migration runs in order,
// and the result is compared with the live disposable database. The scratch database is dropped.
const fs = require("fs");
const path = require("path");
const lib = require("./lib.cjs");

const { DB_CONTAINER, ROOT, refuse, run } = lib;
const SCRATCH = "ithub_replay";

function exec(database, sql, user = "postgres", singleTransaction = false) {
  return run(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      user,
      "-d",
      database,
      "-X",
      "-A",
      "-t",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      ...(singleTransaction ? ["--single-transaction"] : []),
    ],
    { input: sql },
  );
}

function must(result, what) {
  if (result.status !== 0) refuse(`${what}: ${result.stderr.trim()}`);
  return result.stdout;
}

/** auth, storage and platform schemas as a new project has them, with nothing from this app. */
function platformSchema() {
  const dump = run("docker", [
    "exec",
    DB_CONTAINER,
    "pg_dump",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "-n",
    "auth",
    "-n",
    "storage",
  ]);
  if (dump.status !== 0) refuse(`pg_dump failed: ${dump.stderr.trim()}`);
  // Everything removed here is rebuilt by the migrations, so it must not exist before they run.
  return (
    dump.stdout
      .replace(/^SET transaction_timeout.*$/gm, "")
      .replace(/^\\(un)?restrict .*$/gm, "")
      // The migrations create these triggers, and the functions they call don't exist yet.
      .replace(/CREATE TRIGGER on_auth_user_[a-z_]+[\s\S]*?;\n/g, "")
      .replace(/CREATE POLICY [\s\S]*?;\n/g, "")
  );
}

const CATALOG = `
select 'function|' || p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig, ','), '')
  || '|anon=' || has_function_privilege('anon', p.oid, 'execute')
  || '|auth=' || has_function_privilege('authenticated', p.oid, 'execute')
  || '|svc=' || has_function_privilege('service_role', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.proname <> 'ithub_test_env_identity'
union all
select 'policy|' || schemaname || '.' || tablename || '|' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname = 'public' or (schemaname = 'storage' and tablename in ('objects', 'buckets'))
union all
select 'trigger|' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
union all
select 'publication|' || tablename || '|' || coalesce(array_to_string(attnames, ','), '') from pg_publication_tables where pubname = 'supabase_realtime'
union all
select 'grant|' || table_name || '|' || grantee || '|' || privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
union all
select 'column|' || table_name || '|' || column_name || '|' || grantee || '|' || privilege_type from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('service_requests', 'pc_builds', 'customer_notifications')
union all
select 'bucket|' || id || '|' || public || '|' || coalesce(file_size_limit::text, '') || '|' || coalesce(array_to_string(allowed_mime_types, ','), '') from storage.buckets
order by 1;`;

const PREPARE = `
create schema if not exists extensions;
grant usage on schema extensions to public;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pgcrypto schema extensions;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;`;

const PLATFORM_GRANTS = `
grant usage on schema auth, storage to anon, authenticated, service_role, postgres;
grant all on all tables in schema auth, storage to postgres;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant execute on all functions in schema auth, storage to anon, authenticated, service_role, postgres;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema storage grant all on tables to anon, authenticated, service_role;`;

const PLPGSQL_CHECK = `
create extension if not exists plpgsql_check schema extensions;
select p.proname || ': ' || r.level || ': ' || r.message
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang and l.lanname = 'plpgsql'
left join lateral (
  select t.tgrelid from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal limit 1
) trg on true
cross join lateral extensions.plpgsql_check_function_tb(
  p.oid, coalesce(trg.tgrelid, 0::oid), fatal_errors := false, other_warnings := false, extra_warnings := false
) r
where n.nspname in ('public', 'private')
  and (p.prorettype <> 'trigger'::regtype or trg.tgrelid is not null)
  and r.level = 'error';`;

async function main() {
  await lib.verifyDisposable();
  const before = lib.protectedSnapshot();
  must(exec("postgres", `drop database if exists ${SCRATCH};`), "could not clear the scratch db");
  must(exec("postgres", `create database ${SCRATCH};`), "could not create the scratch db");

  try {
    must(exec(SCRATCH, PREPARE, "supabase_admin"), "could not prepare extensions");
    must(exec(SCRATCH, platformSchema(), "supabase_admin"), "could not load auth and storage");
    must(exec(SCRATCH, PLATFORM_GRANTS, "supabase_admin"), "could not apply platform grants");

    const dir = path.join(ROOT, "supabase", "migrations");
    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const result = exec(SCRATCH, fs.readFileSync(path.join(dir, file), "utf8"), "postgres", true);
      if (result.status !== 0) refuse(`replay failed at ${file}:\n${result.stderr.trim()}`);
    }
    console.log(`Clean replay succeeded: ${files.length} migrations on an empty database.`);

    if (process.argv.includes("--compare")) {
      const live = must(exec("postgres", CATALOG), "could not read the live catalog").split("\n");
      const replay = must(exec(SCRATCH, CATALOG), "could not read the replay catalog").split("\n");
      const liveSet = new Set(live);
      const replaySet = new Set(replay);
      const onlyLive = live.filter((line) => !replaySet.has(line));
      const onlyReplay = replay.filter((line) => !liveSet.has(line));
      console.log(`Catalog rows: live ${live.length}, replay ${replay.length}`);
      console.log(`Only in live: ${onlyLive.length}; only in replay: ${onlyReplay.length}`);
      for (const line of onlyLive.slice(0, 25)) console.log(`LIVE   ${line.slice(0, 180)}`);
      for (const line of onlyReplay.slice(0, 25)) console.log(`REPLAY ${line.slice(0, 180)}`);
      if (onlyLive.length || onlyReplay.length) process.exitCode = 1;
    }

    if (process.argv.includes("--plpgsql-check")) {
      const out = must(exec(SCRATCH, PLPGSQL_CHECK, "supabase_admin"), "plpgsql_check").trim();
      console.log(out ? `plpgsql_check errors:\n${out}` : "plpgsql_check: no errors");
      if (out) process.exitCode = 1;
    }
  } finally {
    // --keep leaves the database for reset-data, which copies its rows and then drops it.
    if (!process.argv.includes("--keep")) {
      must(
        exec("postgres", `drop database if exists ${SCRATCH};`),
        "could not drop the scratch db",
      );
    }
  }
  lib.assertProtectedUnchanged(before);
}

main().catch((error) => refuse(error.message));
