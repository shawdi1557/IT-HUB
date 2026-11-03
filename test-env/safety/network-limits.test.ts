// test-env/safety/network-limits.test.ts
// Runs inside a real disposable run and proves what that run can and can't reach.
// Every "denied" request below is stopped by Deno's permissions before a packet is sent.

import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertDisposableTarget,
  assertNetworkIsRestricted,
  assertSafeTargetUrl,
  TEST_DB_URL,
  TEST_SERVICE_KEY,
  TEST_SUPABASE_URL,
  verifyMarker,
} from "../../supabase/functions/tests/_helpers/disposable_env.ts";

const DENIED_URLS = [
  "http://127.0.0.1:54321/rest/v1/shopify_customer_orders",
  "http://localhost:54321/rest/v1/shopify_customer_orders",
  "https://example-project.supabase.co/rest/v1/profiles",
  "https://api.razorpay.com/v1/payments",
  "https://example-store.myshopify.com/api/2026-01/graphql.json",
  "https://ipapi.co/json/",
];

for (const url of DENIED_URLS) {
  Deno.test(`NET-DENY: ${new URL(url).host} can't be reached`, async () => {
    await assertRejects(() => fetch(url), Deno.errors.NotCapable);
  });
}

for (const port of [54321, 54322]) {
  Deno.test(`NET-DENY: raw connection to existing stack port ${port} can't be made`, async () => {
    await assertRejects(
      () => Deno.connect({ hostname: "127.0.0.1", port }),
      Deno.errors.NotCapable,
    );
  });
}

Deno.test("FS-DENY: a test run can't write files", async () => {
  await assertRejects(
    () => Deno.writeTextFile("test-env-write-probe.txt", "x"),
    Deno.errors.NotCapable,
  );
});

Deno.test("RUN-DENY: a test run can't start programs such as docker or supabase", async () => {
  await assertRejects(
    async () => await new Deno.Command("docker", { args: ["ps"] }).output(),
    Deno.errors.NotCapable,
  );
});

Deno.test("GUARD: this run is positively identified as disposable", async () => {
  await assertDisposableTarget();
  await assertNetworkIsRestricted();
});

Deno.test("GUARD: a wrong environment id is refused", async () => {
  await assertRejects(
    () =>
      verifyMarker(
        TEST_SUPABASE_URL,
        TEST_DB_URL,
        TEST_SERVICE_KEY,
        "00000000-0000-4000-8000-000000000000",
      ),
    Error,
    "REFUSED",
  );
});

Deno.test("GUARD: protected and remote targets are refused without connecting", () => {
  const refused: [string, number][] = [
    ["http://127.0.0.1:54321", 55421],
    ["postgresql://postgres:postgres@127.0.0.1:54322/postgres", 55422],
    ["https://example-project.supabase.co", 55421],
    ["http://192.168.1.20:55421", 55421],
    ["http://127.0.0.1:55999", 55421],
  ];
  for (const [url, port] of refused) {
    assertThrows(() => assertSafeTargetUrl(url, port), Error, "REFUSED");
  }
  assertEquals(assertSafeTargetUrl(TEST_SUPABASE_URL, 55421), undefined);
});
