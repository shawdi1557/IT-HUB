#!/usr/bin/env node
// Returns the verified disposable database to what a fresh build contains, without destroying the
// stack: rows the migrations insert come from a clean replay, then seed.sql and fixture users load.
const path = require("path");
const lib = require("./lib.cjs");
const { DB_CONTAINER, refuse, run } = lib;

const SCRATCH = "ithub_replay";

const psqlAdmin = (database, input) =>
  run(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      database,
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input },
  );

async function main() {
  const identity = await lib.verifyDisposable();
  const before = lib.protectedSnapshot();

  const replay = run("node", [path.join(__dirname, "replay.cjs"), "--keep"]);
  if (replay.status !== 0) refuse(`could not build clean data: ${replay.stderr.trim()}`);

  try {
    const dump = run("docker", [
      "exec",
      DB_CONTAINER,
      "pg_dump",
      "-U",
      "supabase_admin",
      "-d",
      SCRATCH,
      "--data-only",
      "--disable-triggers",
      "--schema=public",
    ]);
    // Inside the try, failures throw (not exit) so the finally below always drops the scratch database.
    if (dump.status !== 0) throw new Error(`could not read clean data: ${dump.stderr.trim()}`);

    const wipe = psqlAdmin(
      "postgres",
      // The append-only quotation tables (migrations 20261111000001/2) refuse TRUNCATE through ordinary triggers.
      // For this session only, replica mode skips ordinary triggers so the disposable data can be emptied; every
      // other session, and every application path, keeps the protection.
      `set session_replication_role = replica;
       do $$
       declare tables text;
       begin
         select string_agg(format('public.%I', tablename), ', ') into tables
         from pg_tables where schemaname = 'public';
         execute 'truncate ' || tables || ', auth.users restart identity cascade';
       end $$;`,
    );
    if (wipe.status !== 0) throw new Error(`could not empty the tables: ${wipe.stderr.trim()}`);

    const restore = psqlAdmin("postgres", dump.stdout);
    if (restore.status !== 0)
      throw new Error(`could not restore clean data: ${restore.stderr.trim()}`);
  } finally {
    psqlAdmin("postgres", `drop database if exists ${SCRATCH};`);
  }

  await lib.loadFixtures(identity);
  await lib.verifyDisposable();
  lib.assertProtectedUnchanged(before);
  console.log("Disposable data reset. The stack and its identity were kept.");
}

main().catch((error) => refuse(error.message));
