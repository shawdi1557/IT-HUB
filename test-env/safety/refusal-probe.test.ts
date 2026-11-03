// test-env/safety/refusal-probe.test.ts
// `npm run test:env:safety` runs this with hostile settings. The body touches nothing, so a
// guard failure is reported safely, as this error, instead of as damage to a database.

import { dbTest } from "../../supabase/functions/tests/_helpers/disposable_env.ts";

dbTest("PROBE: this body must only run on the verified disposable environment", () => {
  if (Deno.env.get("ITHUB_PROBE_EXPECT_RUN") !== "yes") {
    throw new Error("GUARD FAILED: a database test body ran on an unverified target.");
  }
});
