// supabase/functions/tests/test-env-safety.test.ts
// Stops new tests and commands from drifting back to the development database.

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertSafeTargetUrl,
  DB_TESTS_ENABLED,
  TEST_SUPABASE_URL,
} from "./_helpers/disposable_env.ts";

const TESTS_DIR = "supabase/functions/tests";

function testSources(): { file: string; code: string }[] {
  const out: { file: string; code: string }[] = [];
  for (const entry of Deno.readDirSync(TESTS_DIR)) {
    if (
      entry.isFile &&
      entry.name.endsWith(".test.ts") &&
      entry.name !== "test-env-safety.test.ts"
    ) {
      out.push({ file: entry.name, code: Deno.readTextFileSync(`${TESTS_DIR}/${entry.name}`) });
    }
  }
  return out;
}

Deno.test("TESTENV-1: no test can connect directly to the development Postgres port", () => {
  const offenders = testSources().filter(({ code }) =>
    /127\.0\.0\.1:54322|localhost:54322/.test(code),
  );
  assertEquals(
    offenders.map((o) => o.file),
    [],
  );
});

Deno.test("TESTENV-2: no test builds a real client from a hardcoded development URL", () => {
  const offenders = testSources().filter(({ code }) =>
    /createClient\(\s*["'`]https?:\/\/(127\.0\.0\.1|localhost):54321/.test(code),
  );
  assertEquals(
    offenders.map((o) => o.file),
    [],
  );
});

Deno.test("TESTENV-3: any test file using a real Postgres client goes through the guard", () => {
  const offenders = testSources().filter(
    ({ code }) =>
      /new PgClient\(/.test(code) && !/from "\.\/_helpers\/disposable_env\.ts"/.test(code),
  );
  assertEquals(
    offenders.map((o) => o.file),
    [],
  );
});

Deno.test("TESTENV-4: no npm test command grants broad permissions or bypasses the runner", () => {
  const { scripts } = JSON.parse(Deno.readTextFileSync("package.json"));
  for (const [name, command] of Object.entries<string>(scripts)) {
    if (!name.startsWith("test")) continue;
    assertEquals(command.startsWith("node scripts/test-env/"), true, `${name} bypasses the runner`);
    assertEquals(
      /\s-A\b|--allow-all|--allow-net/.test(command),
      false,
      `${name} widens permissions`,
    );
  }
});

Deno.test("TESTENV-5: nothing in the test tooling can reset a database or stop every stack", () => {
  for (const file of ["lib.cjs", "up.cjs", "down.cjs", "run.cjs", "status.cjs"]) {
    const code = Deno.readTextFileSync(`scripts/test-env/${file}`);
    assertEquals(/"db",\s*"reset"|db reset/.test(code), false, `${file} mentions db reset`);
    assertEquals(/\["stop",[^\]]*"--all"/.test(code), false, `${file} stops all stacks`);
  }
});

Deno.test("TESTENV-6: outside a disposable run, the guard's targets are dead ends", () => {
  if (DB_TESTS_ENABLED) return;
  assertEquals(TEST_SUPABASE_URL, "http://127.0.0.1:9");
  assertThrows(() => assertSafeTargetUrl(TEST_SUPABASE_URL, 55421), Error, "REFUSED");
});

Deno.test("TESTENV-7: the guard refuses the development stack and remote hosts", () => {
  for (const url of [
    "http://127.0.0.1:54321",
    "http://localhost:55421",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "https://example-project.supabase.co",
  ]) {
    assertThrows(() => assertSafeTargetUrl(url, 55421), Error, "REFUSED");
  }
});
