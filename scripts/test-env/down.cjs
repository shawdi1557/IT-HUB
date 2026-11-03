#!/usr/bin/env node
// Destroys the disposable stack and its data. It can only target ITHUB_TEST_DISPOSABLE.
const fs = require("fs");
const lib = require("./lib.cjs");

const { DB_CONTAINER, WORKDIR, refuse, run } = lib;

const before = lib.protectedSnapshot();

if (fs.existsSync(WORKDIR)) {
  const stop = lib.supabase(["stop", "--no-backup"], { stdio: "inherit" });
  if (stop.status !== 0) refuse("supabase stop failed.");
  fs.rmSync(WORKDIR, { recursive: true, force: true });
}

if (run("docker", ["inspect", DB_CONTAINER]).status === 0) {
  refuse(`${DB_CONTAINER} still exists after stopping.`);
}
lib.assertProtectedUnchanged(before);
console.log("Disposable environment removed.");
