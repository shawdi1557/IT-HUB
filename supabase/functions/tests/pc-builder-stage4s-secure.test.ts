// Stage 4S-4: secure quotation verification, the Edge Function's side. Who may submit (a customer account with a
// phone confirmed at sign-in), CORS, the rate limit's keys, the server's own environment names, and storing through
// the database's quotation function only. The database side is proven in pc-builder-stage4s-secure-db.test.ts.
//
// TEST CATALOGUE ONLY: every ID, phone, IP and price below is made up. No network.

import {
  assert,
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { quotationClient, type QuotationClientOptions } from "./_helpers/quotation-client.ts";
import { storefrontProduct, withEssentials } from "./_helpers/quote-structure.ts";

const { handleQuotationVerification, hashClientIp, MESSAGE_CUSTOMER_ACCOUNT_REQUIRED } =
  await import("../verify-and-submit-pc-quotation/index.ts");
const { quotationFingerprint } = await import("../verify-and-submit-pc-quotation/structure.ts");
const { corsFor, DEV_ORIGINS } = await import("../_shared/cors.ts");

const CUSTOMER = "00000000-0000-0000-0000-0000000004a4";
const CPU = "gid://shopify/ProductVariant/s4s4-cpu";

const nodeFor = (id: string) => ({
  id,
  title: "Default Title",
  price: { amount: id === CPU ? "15000.00" : "0.00", currencyCode: "INR" },
  availableForSale: true,
  currentlyNotInStock: false,
  product: storefrontProduct(id === CPU ? "CPU" : slotOf(id), "QZX S4S4 part"),
});
const slotOf = (id: string) => {
  const tail = id.split("-").pop()!;
  return (
    { motherboard: "Motherboard", ram: "RAM", storage: "Storage", psu: "PSU", cabinet: "Cabinet" }[
      tail
    ] ?? "CPU"
  );
};
const parts = () =>
  withEssentials({
    CPU: { slot: "CPU", variantId: CPU, title: "Processor", price: 15000, quantity: 1 },
  });

interface Send {
  db?: QuotationClientOptions;
  headers?: Record<string, string>;
  env?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  method?: string;
}

async function send(options: Send = {}) {
  const shopify: string[][] = [];
  const db = quotationClient({ userId: CUSTOMER, ...options.db });
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: options.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer s4s4-token",
        ...options.headers,
      },
      body:
        (options.method ?? "POST") === "POST"
          ? JSON.stringify({
              buildName: "S4S-4",
              estimatedPrice: 15000,
              compatibility: { status: "compatible" },
              customerInfo: {
                name: "Synthetic",
                email: "s4s4@example.test",
                phone: "+919111111111",
              },
              parts: parts(),
              ...options.body,
            })
          : undefined,
    }),
    {
      supabaseClient: db.client as any,
      shopifyFetch: async (_query: string, vars: { ids: string[] }) => {
        shopify.push(vars.ids);
        return { data: { nodes: vars.ids.map(nodeFor) } };
      },
      env: { APP_ENV: undefined, STOREFRONT_ORIGIN: undefined, ...options.env },
    },
  );
  const text = await res.text();
  return { res, status: res.status, body: text ? JSON.parse(text) : null, db, shopify };
}

// ── Who may submit (D8, F14) ──────────────────────────────────────────────────────────────────────────

Deno.test("S4S4-1: a staff account, or one the guard finds unverified, is refused with 403 before Shopify or storing", async () => {
  const result = await send({
    db: { guard: () => ({ allowed: false, code: "customer_account_required" }) },
  });
  assertEquals(result.status, 403);
  assertEquals(result.body, {
    success: false,
    error: MESSAGE_CUSTOMER_ACCOUNT_REQUIRED,
    code: "customer_account_required",
  });
  assertEquals(
    MESSAGE_CUSTOMER_ACCOUNT_REQUIRED,
    "This account can't request a PC quotation. Please sign in with your customer account.",
  );
  assertEquals(result.shopify.length, 0);
  assertEquals(result.db.calls.create.length, 0);
});

Deno.test("S4S4-2: an account with no phone confirmed at sign-in is refused before the guard is asked", async () => {
  const result = await send({ db: { phone: null } });
  assertEquals(result.status, 403);
  assertEquals(result.body.code, "customer_account_required");
  assertEquals(result.db.calls.guard.length, 0);
  assertEquals(result.db.calls.create.length, 0);
});

Deno.test("S4S4-3: the guard is asked for the signed-in customer, and failing closed when it can't answer", async () => {
  const ok = await send();
  assertEquals(ok.status, 200, JSON.stringify(ok.body));
  assertEquals(ok.db.calls.guard, [{ p_user_id: CUSTOMER, p_ip_key: null }]);
  for (const db of [
    { guardError: true },
    { guard: () => null },
    { guard: () => "yes" },
    { guard: () => ({ allowed: "true" }) },
    { guard: () => ({ allowed: false, code: "something_else" }) },
  ] as QuotationClientOptions[]) {
    const result = await send({ db });
    assertEquals(result.status, 503, JSON.stringify(db));
    assertEquals(result.shopify.length, 0);
    assertEquals(result.db.calls.create.length, 0);
  }
});

Deno.test("S4S4-4: over the limit is 429 with Retry-After, nothing stored", async () => {
  const result = await send({ db: { guard: () => ({ allowed: false, code: "rate_limited" }) } });
  assertEquals(result.status, 429);
  assertEquals(result.res.headers.get("Retry-After"), "60");
  assertEquals(result.body.retryAfter, 60);
  assertEquals(result.db.calls.create.length, 0);
});

// ── The client IP (F9, B1) ────────────────────────────────────────────────────────────────────────────

Deno.test("S4S4-5: with no trusted header configured, no IP reaches the guard, whatever the request claims", async () => {
  const result = await send({
    headers: {
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "cf-connecting-ip": "203.0.113.8",
      "x-real-ip": "203.0.113.9",
    },
    env: { QUOTATION_TRUSTED_IP_HEADER: undefined, QUOTATION_RATE_LIMIT_SALT: "s4s4-salt" },
  });
  assertEquals(result.status, 200);
  assertEquals(result.db.calls.guard[0].p_ip_key, null);
});

Deno.test("S4S4-6: a configured trusted header is hashed with the salt; the address itself is never sent", async () => {
  const env = {
    QUOTATION_TRUSTED_IP_HEADER: "x-test-client-ip",
    QUOTATION_RATE_LIMIT_SALT: "s4s4-salt",
  };
  const first = await send({
    env,
    headers: { "x-test-client-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" },
  });
  const key = first.db.calls.guard[0].p_ip_key!;
  assertMatch(key, /^[0-9a-f]{64}$/);
  assertEquals(key, await hashClientIp("203.0.113.7", "s4s4-salt"));
  assert(!key.includes("203.0.113.7"), "the address itself was sent");
  // The same IP gives the same key, so customers sharing it share the 20-a-minute count; another IP or salt doesn't.
  const again = await send({ env, headers: { "x-test-client-ip": "203.0.113.7" } });
  assertEquals(again.db.calls.guard[0].p_ip_key, key);
  const other = await send({ env, headers: { "x-test-client-ip": "203.0.113.8" } });
  assertNotEquals(other.db.calls.guard[0].p_ip_key, key);
  assertNotEquals(await hashClientIp("203.0.113.7", "another-salt"), key);
  // The configured header absent: no key, never a shared bucket, and the customer limit still applies.
  const absent = await send({ env, headers: { "x-forwarded-for": "203.0.113.7" } });
  assertEquals(absent.status, 200);
  assertEquals(absent.db.calls.guard[0].p_ip_key, null);
});

Deno.test("S4S4-7: a configured IP limit without its salt fails closed", async () => {
  const result = await send({
    env: { QUOTATION_TRUSTED_IP_HEADER: "x-test-client-ip", QUOTATION_RATE_LIMIT_SALT: undefined },
    headers: { "x-test-client-ip": "203.0.113.7" },
  });
  assertEquals(result.status, 503);
  assertEquals(result.db.calls.guard.length, 0);
  assertEquals(result.db.calls.create.length, 0);
});

// ── CORS (F12, E4) ────────────────────────────────────────────────────────────────────────────────────

Deno.test("S4S4-8: CORS allows exactly the configured origins, never a wildcard", () => {
  const request = (origin?: string) =>
    new Request("http://localhost/x", { method: "POST", headers: origin ? { origin } : {} });
  assertEquals([...DEV_ORIGINS], ["http://localhost:8443", "http://127.0.0.1:8443"]);
  // Development: the local storefront only.
  for (const origin of DEV_ORIGINS) {
    const cors = corsFor(request(origin), { appEnv: "development" });
    assertEquals(cors.allowed, true, origin);
    assertEquals(cors.headers["Access-Control-Allow-Origin"], origin);
  }
  for (const origin of [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:57499",
    "https://localhost:8443",
    "http://localhost:8443.evil.example",
    "null",
    "https://evil.example",
  ]) {
    const cors = corsFor(request(origin), { appEnv: "development" });
    assertEquals(cors.allowed, false, origin);
    assertEquals("Access-Control-Allow-Origin" in cors.headers, false, origin);
  }
  // Production, nothing configured: every browser origin refused (fails closed).
  for (const appEnv of [undefined, "production", "staging", ""]) {
    assertEquals(
      corsFor(request("http://localhost:8443"), { appEnv }).allowed,
      false,
      String(appEnv),
    );
  }
  // Production, configured: exact matches only.
  const configured = {
    appEnv: "production",
    allowedOrigins: "https://shop.example, https://www.shop.example",
  };
  assertEquals(corsFor(request("https://shop.example"), configured).allowed, true);
  assertEquals(corsFor(request("https://www.shop.example"), configured).allowed, true);
  assertEquals(corsFor(request("https://evil.shop.example"), configured).allowed, false);
  assertEquals(corsFor(request("http://shop.example"), configured).allowed, false);
  // No Origin header: not a browser page, so CORS doesn't apply.
  assertEquals(corsFor(request(), {}).allowed, true);
  assertEquals("Access-Control-Allow-Origin" in corsFor(request(), {}).headers, false);
  // Never a wildcard.
  const source = Deno.readTextFileSync("supabase/functions/_shared/cors.ts");
  assert(!source.includes('"*"'));
});

Deno.test("S4S4-9: the function refuses a disallowed origin, preflight included, and serves an allowed one", async () => {
  const evil = await send({
    headers: { origin: "https://evil.example" },
    env: { APP_ENV: "development" },
  });
  assertEquals(evil.status, 403);
  assertEquals(evil.body.code, "origin_not_allowed");
  assertEquals(evil.res.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(evil.db.calls.guard.length, 0);
  const preflight = await send({ method: "OPTIONS", headers: { origin: "https://evil.example" } });
  assertEquals(preflight.status, 403);
  const goodPreflight = await send({
    method: "OPTIONS",
    headers: { origin: "http://localhost:8443" },
    env: { APP_ENV: "development" },
  });
  assertEquals(goodPreflight.status, 204);
  assertEquals(
    goodPreflight.res.headers.get("Access-Control-Allow-Origin"),
    "http://localhost:8443",
  );
  const local = await send({
    headers: { origin: "http://localhost:8443" },
    env: { APP_ENV: "development" },
  });
  assertEquals(local.status, 200);
  assertEquals(local.res.headers.get("Access-Control-Allow-Origin"), "http://localhost:8443");
  // The local storefront is refused when APP_ENV isn't development: production fails closed.
  const notDev = await send({ headers: { origin: "http://localhost:8443" } });
  assertEquals(notDev.status, 403);
});

// ── Environment names (F13) ───────────────────────────────────────────────────────────────────────────

Deno.test("S4S4-10: Shopify settings come from the server's own names first, the VITE_ names only as a fallback", async () => {
  const seen: { url: string; token: string | null }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(input),
      token: new Headers(init?.headers).get("X-Shopify-Storefront-Access-Token"),
    });
    return new Response(JSON.stringify({ errors: [{ message: "stand-in" }] }));
  }) as typeof fetch;
  try {
    const run = (env: Record<string, string | undefined>) =>
      handleQuotationVerification(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { Authorization: "Bearer s4s4-token", "Content-Type": "application/json" },
          body: JSON.stringify({
            buildName: "B",
            estimatedPrice: 1,
            compatibility: {},
            customerInfo: {},
            parts: parts(),
          }),
        }),
        { supabaseClient: quotationClient({ userId: CUSTOMER }).client as any, env },
      );
    await run({
      SHOPIFY_STORE_DOMAIN: "server-name.example",
      SHOPIFY_STOREFRONT_TOKEN: "server-token",
      SHOPIFY_API_VERSION: "2099-01",
      VITE_SHOPIFY_STORE_DOMAIN: "vite-name.example",
      VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN: "vite-token",
      VITE_SHOPIFY_API_VERSION: "2000-01",
    });
    await run({
      SHOPIFY_STORE_DOMAIN: undefined,
      SHOPIFY_STOREFRONT_TOKEN: undefined,
      SHOPIFY_API_VERSION: undefined,
      VITE_SHOPIFY_STORE_DOMAIN: "vite-name.example",
      VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN: "vite-token",
      VITE_SHOPIFY_API_VERSION: undefined,
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(seen, [
    { url: "https://server-name.example/api/2099-01/graphql.json", token: "server-token" },
    { url: "https://vite-name.example/api/2025-10/graphql.json", token: "vite-token" },
  ]);
});

// ── Storing (D1, D9, D10, F11) ────────────────────────────────────────────────────────────────────────

Deno.test("S4S4-11: the quotation is stored only through create_pc_quotation, with the server's own values", async () => {
  const result = await send();
  assertEquals(result.status, 200, JSON.stringify(result.body));
  assertEquals(result.db.calls.tableAccess, []);
  assertEquals(result.db.calls.create.length, 1);
  const call = result.db.calls.create[0];
  assertEquals(call.p_user_id, CUSTOMER);
  assertEquals(
    call.p_fingerprint,
    quotationFingerprint(Object.values(result.db.inserted[0].parts)),
  );
  const row = call.p_quotation;
  // The phone confirmed at sign-in, never the one the browser sent (F14).
  assertEquals(row.customer_phone, "919800000001");
  assertEquals(row.customer_name, "Synthetic");
  // The verdict in its own column; the browser's report only as its note (D1, D5).
  assertEquals(row.server_assessment.assessedBy, "server");
  assertEquals(row.compatibility, { status: "compatible", reportedBy: "customer_browser" });
  // Nothing the browser could use to forge a submission's standing is accepted from it.
  for (const key of [
    "reference_id",
    "enquiry_status",
    "version",
    "request_fingerprint",
    "user_id",
  ]) {
    assertEquals(key in row, false, key);
  }
  assertEquals(result.body.referenceId, result.db.inserted[0].reference_id);
  assertEquals(result.body.buildId, result.db.inserted[0].id);
});

Deno.test("S4S4-12: forged standing in the request changes nothing that is stored", async () => {
  const result = await send({
    body: {
      reference_id: "ITH-PC-FORGED",
      referenceId: "ITH-PC-FORGED",
      enquiry_status: "Quoted",
      version: 99,
      technician_review_required: false,
      authoritative_price: 1,
      server_assessment: { state: "complete" },
      compatibility: { status: "compatible", serverAssessment: { state: "complete" } },
      user_id: "00000000-0000-0000-0000-00000000dead",
    },
  });
  assertEquals(result.status, 200);
  const row = result.db.calls.create[0].p_quotation;
  assertEquals(result.db.calls.create[0].p_user_id, CUSTOMER);
  assertNotEquals(result.body.referenceId, "ITH-PC-FORGED");
  assertEquals(row.authoritative_price, 15000);
  assertNotEquals(row.server_assessment, { state: "complete" });
  assertEquals("serverAssessment" in row.compatibility, false);
});

Deno.test("S4S4-13: a repeat answered by the database returns the earlier reference; a storing failure is a 500", async () => {
  const db = quotationClient({ userId: CUSTOMER });
  const run = () =>
    handleQuotationVerification(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { Authorization: "Bearer s4s4-token", "Content-Type": "application/json" },
        body: JSON.stringify({
          buildName: "B",
          estimatedPrice: 15000,
          compatibility: {},
          customerInfo: {},
          parts: parts(),
        }),
      }),
      {
        supabaseClient: db.client as any,
        shopifyFetch: async (_q: string, vars: { ids: string[] }) => ({
          data: { nodes: vars.ids.map(nodeFor) },
        }),
      },
    ).then((res) => res.json());
  const first = await run();
  const second = await run();
  assertEquals(second.duplicate, true);
  assertEquals(second.referenceId, first.referenceId);
  assertEquals(db.inserted.length, 1);

  const failing = await send({ db: { createError: true } });
  assertEquals(failing.status, 500);
  assertEquals(failing.body.error, "Failed to save the quotation request.");
});

Deno.test("S4S4-14: the function no longer has the weaknesses 4S-4 removes", () => {
  const source = Deno.readTextFileSync(
    "supabase/functions/verify-and-submit-pc-quotation/index.ts",
  );
  assert(!source.includes("Math.random"), "Math.random reference");
  assert(!source.includes('"guest-ip"'), "shared IP bucket");
  assert(!/headers\.get\(\s*"x-forwarded-for"/.test(source), "x-forwarded-for read");
  assert(!source.includes("check_distributed_rate_limit"), "old IP-keyed limiter");
  assert(!source.includes("customerInfo.phone"), "browser phone fallback");
  assert(!source.includes('"Access-Control-Allow-Origin": "*"'), "wildcard CORS");
  assert(!/\.from\(\s*"pc_builds"/.test(source), "direct table access");
  assert(!/Deno\.env\.get\("VITE_/.test(source), "fixed VITE_ read");
});

// ── The customer's side: labels and withdrawal (D7, D14, E7) ─────────────────────────────────────────

const quotationStatus = await import("../../../src/lib/builder/quotation-status.ts");
const { withdrawQuotationRequest } = await import("../../../src/lib/builder/persistence.ts");

Deno.test("S4S4-15: customers see the approved labels and withdrawal wording, and only while IT HUB is working on it", () => {
  assertEquals(quotationStatus.QUOTATION_STATUS_LABELS, {
    New: "Submitted",
    Contacted: "We have contacted you",
    Quoted: "Quotation provided",
    Closed: "Completed",
    Archived: "Closed by IT HUB",
    Withdrawn: "Withdrawn",
  });
  assertEquals(quotationStatus.WITHDRAW_BUTTON, "Withdraw request");
  assertEquals(
    quotationStatus.WITHDRAW_CONFIRMATION,
    "Withdraw this quotation request? IT HUB will stop working on it. This can't be undone.",
  );
  for (const status of ["New", "Contacted", "Quoted"]) {
    assertEquals(
      quotationStatus.canWithdraw({ referenceId: "R", status, version: 1 }),
      true,
      status,
    );
  }
  for (const status of ["Closed", "Archived", "Withdrawn", "Draft"]) {
    assertEquals(
      quotationStatus.canWithdraw({ referenceId: "R", status, version: 1 }),
      false,
      status,
    );
  }
  assertEquals(quotationStatus.canWithdraw(undefined), false);
});

Deno.test("S4S4-16: the page withdraws through the server function with the version it loaded, and reads each refusal", async () => {
  const calls: any[] = [];
  const client = (answer: { data?: unknown; error?: unknown }) => ({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  });
  const ok = await withdrawQuotationRequest("q-1", 3, "  Bought elsewhere  ", {
    supabaseClient: client({ data: { ok: true, status: "Withdrawn", version: 4 } }),
  });
  assertEquals(ok, { ok: true, status: "Withdrawn", version: 4 });
  assertEquals(calls[0], {
    name: "customer_withdraw_pc_quotation",
    args: { p_quotation_id: "q-1", p_expected_version: 3, p_reason: "Bought elsewhere" },
  });
  await withdrawQuotationRequest("q-1", 3, "   ", {
    supabaseClient: client({ data: { ok: true, status: "Withdrawn", version: 4 } }),
  });
  assertEquals(calls[1].args.p_reason, null);
  for (const [message, code] of <[string, string][]>[
    ["stale_version", "stale_version"],
    ["invalid_transition", "invalid_transition"],
    ["quotation_not_found", "not_found"],
    ["something else", "failed"],
  ]) {
    const result = await withdrawQuotationRequest("q-1", 3, undefined, {
      supabaseClient: client({ error: { message } }),
    });
    assertEquals<unknown>(result, { ok: false, code }, message);
  }
  // Never deleted: the page's delete reaches only drafts that were never submitted.
  const persistence = Deno.readTextFileSync("src/lib/builder/persistence.ts");
  assert(persistence.includes('.is("reference_id", null)'));
  const account = Deno.readTextFileSync("src/pages/Account.tsx");
  assert(account.includes("{build.quotation ? ("), "submitted quotations show no Delete");
  assert(account.includes("customerStatusLabel(build.quotation.status)"));
});
