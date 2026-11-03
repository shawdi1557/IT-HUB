#!/usr/bin/env node
// Applies new migrations to the disposable stack with the real Supabase CLI.
// Refuses unless the target is positively identified as disposable. It can't reach anything else.
const fs = require("fs");
const path = require("path");
const lib = require("./lib.cjs");

const { DB_CONTAINER, ROOT, psql, refuse } = lib;

async function main() {
  await lib.verifyDisposable();
  const before = lib.protectedSnapshot();
  // The workdir holds its own copy of the migrations, so the CLI has to be given the new ones.
  const source = path.join(ROOT, "supabase", "migrations");
  fs.cpSync(source, path.join(lib.WORKDIR, "supabase", "migrations"), { recursive: true });
  const up = lib.supabase(["migration", "up", "--local"]);
  if (up.status !== 0) refuse(`supabase migration up failed:\n${up.stderr.trim()}`);
  console.log(up.stdout.trim());

  // Revoking every function grant also hits the test-only marker, which the guard reads as the
  // service role. It isn't part of the product, so only this tool restores it.
  const marker = psql(
    DB_CONTAINER,
    "grant execute on function public.ithub_test_env_identity() to service_role; notify pgrst, 'reload schema';",
  );
  if (marker.status !== 0) refuse(`could not restore the marker grant: ${marker.stderr.trim()}`);

  // PostgREST reloads its schema cache asynchronously.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await lib.verifyDisposable();
  lib.assertProtectedUnchanged(before);
}

main().catch((error) => refuse(error.message));
