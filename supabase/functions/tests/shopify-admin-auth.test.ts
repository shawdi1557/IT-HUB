// Shopify Admin access for the Dev Dashboard app (client credentials grant) and the Sync Centre's read-only
// connection check. No network: every Shopify answer is a stand-in. The client ID and secret here are made up.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const Auth = await import("../_shared/shopify-admin-auth.ts");
const { handleHardwareSync, CONNECTION_TEST_QUERY } =
  await import("../hardware-shopify-sync/index.ts");
type SyncStore = import("../hardware-shopify-sync/store.ts").SyncStore;

const SHOP = "synthetic-store.myshopify.com";
const CLIENT_ID = "synthetic-client-id";
const SECRET = "synthetic-client-secret-never-shown";
const TOKEN = "synthetic-access-token-1";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A stand-in for Shopify: a token endpoint and the Admin GraphQL endpoint. */
function standIn(
  options: {
    token?: (n: number) => { status: number; body: unknown };
    graphql?: (
      call: Call,
      n: number,
    ) => { status: number; body: unknown; headers?: Record<string, string> };
  } = {},
) {
  const calls: Call[] = [];
  let tokens = 0;
  let queries = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: String(init?.body ?? ""),
    };
    calls.push(call);
    if (call.url.endsWith("/admin/oauth/access_token")) {
      tokens++;
      const answer = options.token?.(tokens) ?? {
        status: 200,
        body: {
          access_token: `synthetic-access-token-${tokens}`,
          scope: "read_products",
          expires_in: 86399,
        },
      };
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    }
    queries++;
    const answer = options.graphql?.(call, queries) ?? {
      status: 200,
      body: {
        data: {
          shop: { name: "Synthetic Store" },
          products: {
            nodes: [{ id: "gid://shopify/Product/1", title: "Synthetic CPU", status: "ACTIVE" }],
          },
        },
      },
      headers: { "X-Shopify-API-Version": "2025-10" },
    };
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: answer.headers,
    });
  }) as typeof fetch;
  return { fetchImpl, calls, counts: () => ({ tokens, queries }) };
}

Deno.test("AUTH-1: the token request is Shopify's client credentials grant, to the shop's own host, with no scope", async () => {
  Auth.clearAdminTokenCache();
  const s = standIn();
  const provider = Auth.clientCredentialsProvider({
    shop: "synthetic-store",
    clientId: CLIENT_ID,
    clientSecret: SECRET,
    fetchImpl: s.fetchImpl,
  });
  assertEquals(await provider.token(), TOKEN);
  const call = s.calls[0];
  assertEquals(call.url, `https://${SHOP}/admin/oauth/access_token`);
  assertEquals(call.method, "POST");
  assertEquals(call.headers["Content-Type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(call.body);
  assertEquals(form.get("grant_type"), "client_credentials");
  assertEquals(form.get("client_id"), CLIENT_ID);
  assertEquals(form.get("client_secret"), SECRET);
  assertEquals(form.has("scope"), false);
  assertEquals(provider.grantedScopes(), ["read_products"]);
  assert((provider.expiresInSeconds() ?? 0) > 86000);
});

Deno.test("AUTH-2: the token is reused until shortly before it expires, then requested again; one request for simultaneous callers", async () => {
  Auth.clearAdminTokenCache();
  const s = standIn();
  let clock = 1_000_000;
  const provider = Auth.clientCredentialsProvider({
    shop: SHOP,
    clientId: CLIENT_ID,
    clientSecret: SECRET,
    fetchImpl: s.fetchImpl,
    now: () => clock,
  });
  const [a, b, c] = await Promise.all([provider.token(), provider.token(), provider.token()]);
  assertEquals([a, b, c], [TOKEN, TOKEN, TOKEN]);
  assertEquals(s.counts().tokens, 1);
  clock += 23 * 3600 * 1000;
  assertEquals(await provider.token(), TOKEN);
  assertEquals(s.counts().tokens, 1);
  // Within five minutes of expiry: renewed.
  clock += 3600 * 1000 - 299 * 1000 - 1000;
  assertEquals(await provider.token(), "synthetic-access-token-2");
  assertEquals(s.counts().tokens, 2);
  // Forgotten after a refusal: renewed on the next call.
  provider.invalidate();
  assertEquals(await provider.token(), "synthetic-access-token-3");
});

Deno.test("AUTH-3: Shopify's refusals become short codes; the secret never appears in an error", async () => {
  const cases: [number, unknown, string][] = [
    [
      400,
      {
        error: "shop_not_permitted",
        error_description: "Client credentials cannot be performed on this shop.",
      },
      "shop_not_permitted",
    ],
    [400, { error: "app_not_installed" }, "app_not_installed"],
    [401, { error: "invalid_client" }, "invalid_client"],
    [401, null, "invalid_client"],
    [403, { errors: "[API] Forbidden" }, "token_request_failed"],
    [502, null, "shopify_unreachable"],
    [200, { scope: "read_products", expires_in: 86399 }, "token_response_invalid"],
    [200, { access_token: "x", scope: "read_products" }, "token_response_invalid"],
  ];
  for (const [status, body, code] of cases) {
    Auth.clearAdminTokenCache();
    const s = standIn({ token: () => ({ status, body }) });
    const provider = Auth.clientCredentialsProvider({
      shop: SHOP,
      clientId: CLIENT_ID,
      clientSecret: SECRET,
      fetchImpl: s.fetchImpl,
    });
    const error = await provider.token().catch((e) => e);
    assert(error instanceof Auth.ShopifyAuthError, JSON.stringify(body));
    assertEquals(error.code, code, JSON.stringify(body));
    const shown = JSON.stringify({ ...error, text: error.message }) + String(error.stack ?? "");
    assert(!shown.includes(SECRET), "the secret is never in an error");
  }
  Auth.clearAdminTokenCache();
  const offline = Auth.clientCredentialsProvider({
    shop: SHOP,
    clientId: CLIENT_ID,
    clientSecret: SECRET,
    fetchImpl: (() => Promise.reject(new TypeError(`connect failed ${SECRET}`))) as typeof fetch,
  });
  const down = await offline.token().catch((e) => e);
  assertEquals(down.code, "shopify_unreachable");
  assert(!JSON.stringify({ ...down, text: down.message }).includes(SECRET));
  // Missing settings are refused before any request.
  for (const [shop, id, secret, code] of [
    [SHOP, "", SECRET, "not_configured"],
    [SHOP, CLIENT_ID, "", "not_configured"],
    ["shop.example.com", CLIENT_ID, SECRET, "shop_domain_invalid"],
  ]) {
    let thrown: any = null;
    try {
      Auth.clientCredentialsProvider({ shop, clientId: id, clientSecret: secret });
    } catch (e) {
      thrown = e;
    }
    assertEquals(thrown?.code, code);
  }
});

Deno.test("AUTH-4: tokens are only ever requested from the shop's own myshopify.com host", () => {
  for (const [input, expected] of [
    ["synthetic-store", SHOP],
    ["synthetic-store.myshopify.com", SHOP],
    ["https://Synthetic-Store.myshopify.com/", SHOP],
    ["shop.example.com", null],
    ["evil.example/x.myshopify.com", null],
    ["synthetic-store.myshopify.com.evil.example", null],
    ["synthetic-store.myshopify.com/admin", null],
    ["http://synthetic-store.myshopify.com", null],
    ["", null],
    [null, null],
  ] as const) {
    assertEquals(Auth.shopifyShopDomain(input as string | null), expected, String(input));
  }
});

Deno.test("AUTH-5: a refused token (401) is renewed once and the query sent again; the secret never goes to the API", async () => {
  Auth.clearAdminTokenCache();
  const s = standIn({
    graphql: (_call, n) =>
      n === 1
        ? { status: 401, body: { errors: "Invalid API key or access token" } }
        : { status: 200, body: { data: { shop: { name: "S" } } } },
  });
  const provider = Auth.clientCredentialsProvider({
    shop: SHOP,
    clientId: CLIENT_ID,
    clientSecret: SECRET,
    fetchImpl: s.fetchImpl,
  });
  const answer = await Auth.adminGraphql(
    provider,
    SHOP,
    "2025-10",
    "query { shop { name } }",
    {},
    s.fetchImpl,
  );
  assertEquals(answer.status, 200);
  assertEquals(s.counts(), { tokens: 2, queries: 2 });
  const queries = s.calls.filter((c) => c.url.includes("/graphql.json"));
  assertEquals(queries[0].url, `https://${SHOP}/admin/api/2025-10/graphql.json`);
  assertEquals(queries[0].headers["X-Shopify-Access-Token"], "synthetic-access-token-1");
  assertEquals(queries[1].headers["X-Shopify-Access-Token"], "synthetic-access-token-2");
  for (const q of queries)
    assert(!JSON.stringify(q).includes(SECRET) && !JSON.stringify(q).includes(CLIENT_ID));
  // Refused twice: the second answer is returned, no loop.
  Auth.clearAdminTokenCache();
  const always = standIn({ graphql: () => ({ status: 401, body: {} }) });
  const p2 = Auth.clientCredentialsProvider({
    shop: SHOP,
    clientId: CLIENT_ID,
    clientSecret: SECRET,
    fetchImpl: always.fetchImpl,
  });
  assertEquals(
    (await Auth.adminGraphql(p2, SHOP, "2025-10", "query { shop { name } }", {}, always.fetchImpl))
      .status,
    401,
  );
  assertEquals(always.counts().queries, 2);
});

Deno.test("AUTH-6: the environment decides the mode; client credentials come first; half a pair is not configured", () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name] ?? "";
  assertEquals(Auth.adminAuthFromEnv(env({})).mode, "none");
  assertEquals(
    Auth.adminAuthFromEnv(
      env({
        SHOPIFY_ADMIN_CLIENT_ID: "a",
        SHOPIFY_ADMIN_CLIENT_SECRET: "b",
        VITE_SHOPIFY_STORE_DOMAIN: SHOP,
      }),
    ),
    { mode: "client_credentials", shop: SHOP, problem: null },
  );
  assertEquals(
    Auth.adminAuthFromEnv(
      env({
        SHOPIFY_ADMIN_CLIENT_ID: "a",
        SHOPIFY_ADMIN_CLIENT_SECRET: "b",
        SHOPIFY_ADMIN_ACCESS_TOKEN: "t",
        SHOPIFY_STORE_DOMAIN: SHOP,
      }),
    ).mode,
    "client_credentials",
  );
  assertEquals(
    Auth.adminAuthFromEnv(env({ SHOPIFY_ADMIN_ACCESS_TOKEN: "t", SHOPIFY_STORE_DOMAIN: SHOP }))
      .mode,
    "static_token",
  );
  assertEquals(
    Auth.adminAuthFromEnv(env({ SHOPIFY_ADMIN_CLIENT_ID: "a", SHOPIFY_STORE_DOMAIN: SHOP })),
    {
      mode: "none",
      shop: SHOP,
      problem: "not_configured",
    },
  );
  assertEquals(
    Auth.adminAuthFromEnv(
      env({
        SHOPIFY_ADMIN_CLIENT_ID: "a",
        SHOPIFY_ADMIN_CLIENT_SECRET: "b",
        SHOPIFY_STORE_DOMAIN: "shop.example.com",
      }),
    ).problem,
    "shop_domain_invalid",
  );
});

// ── The Sync Centre's connection check ──

const ADMIN = { userId: "11111111-1111-4111-8111-111111111111", role: "portal_admin" as const };
const STAFF = { userId: "22222222-2222-4222-8222-222222222222", role: "quotation_staff" as const };
const emptyStore = {
  registry: async () => [],
  links: async () => [],
  mappings: async () => [],
  jobs: async () => [],
} as unknown as SyncStore;
const ENV = {
  APP_ENV: "development",
  PORTAL_ORIGIN: "",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-stand-in",
  SHOPIFY_STORE_DOMAIN: SHOP,
  SHOPIFY_ADMIN_CLIENT_ID: CLIENT_ID,
  SHOPIFY_ADMIN_CLIENT_SECRET: SECRET,
  SHOPIFY_ADMIN_API_VERSION: "2025-10",
};
const post = (body: unknown) =>
  new Request("http://localhost/functions/v1/hardware-shopify-sync", {
    method: "POST",
    headers: {
      Authorization: "Bearer staff-token",
      Origin: "http://localhost:5174",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

Deno.test("AUTH-7: the connection check is read-only, for administrators, and reports scopes without any credential", async () => {
  Auth.clearAdminTokenCache();
  const s = standIn();
  const res = await handleHardwareSync(post({ action: "connection" }), {
    store: emptyStore,
    env: ENV,
    verifyStaff: async () => ADMIN,
    fetchImpl: s.fetchImpl,
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(
    [body.ok, body.mode, body.shop, body.shopName],
    [true, "client_credentials", SHOP, "Synthetic Store"],
  );
  assertEquals(body.grantedScopes, ["read_products"]);
  assertEquals(
    [body.canReadProducts, body.canWriteProducts, body.writesEnabled],
    [true, false, false],
  );
  assertEquals(body.products, [
    { id: "gid://shopify/Product/1", title: "Synthetic CPU", status: "ACTIVE" },
  ]);
  const text = JSON.stringify(body);
  for (const secret of [SECRET, CLIENT_ID, "synthetic-access-token"])
    assert(!text.includes(secret), secret);
  // One token request, one query, and the query is the read-only one.
  assertEquals(s.counts(), { tokens: 1, queries: 1 });
  const sent = JSON.parse(s.calls[1].body);
  assertEquals(sent.query, CONNECTION_TEST_QUERY);
  assert(!/mutation|webhook|metafieldsSet/i.test(CONNECTION_TEST_QUERY));

  // Staff can't run it.
  const staff = await handleHardwareSync(post({ action: "connection" }), {
    store: emptyStore,
    env: ENV,
    verifyStaff: async () => STAFF,
    fetchImpl: s.fetchImpl,
  });
  assertEquals(staff.status, 403);

  // Shopify refusing the app: a short code, no secret.
  Auth.clearAdminTokenCache();
  const refused = standIn({
    token: () => ({ status: 400, body: { error: "shop_not_permitted" } }),
  });
  const r = await handleHardwareSync(post({ action: "connection" }), {
    store: emptyStore,
    env: ENV,
    verifyStaff: async () => ADMIN,
    fetchImpl: refused.fetchImpl,
  });
  const rb = await r.json();
  assertEquals(
    [rb.ok, rb.code, rb.shopifyCode],
    [false, "shop_not_permitted", "shop_not_permitted"],
  );
  assert(!JSON.stringify(rb).includes(SECRET));

  // Not configured: says so without contacting anyone.
  const none = standIn();
  const n = await handleHardwareSync(post({ action: "connection" }), {
    store: emptyStore,
    env: { ...ENV, SHOPIFY_ADMIN_CLIENT_ID: "", SHOPIFY_ADMIN_CLIENT_SECRET: "" },
    verifyStaff: async () => ADMIN,
    fetchImpl: none.fetchImpl,
  });
  const nb = await n.json();
  assertEquals([nb.ok, nb.code, nb.mode], [false, "not_configured", "none"]);
  assertEquals(none.calls.length, 0);
});

Deno.test("AUTH-8: the app's credentials never reach the browser builds or the repository", async () => {
  const root = new URL("../../../", import.meta.url);
  const sources: string[] = [];
  const walk = async (dir: URL) => {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const next = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
      if (entry.isDirectory) await walk(next);
      else if (/\.(tsx?|jsx?|html|json)$/.test(entry.name))
        sources.push(await Deno.readTextFile(next));
    }
  };
  await walk(new URL("src/", root));
  await walk(new URL("ITHUB_ADMIN/src/", root));
  for (const text of sources) {
    assert(!/SHOPIFY_ADMIN_CLIENT|SHOPIFY_ADMIN_ACCESS_TOKEN|VITE_SHOPIFY_ADMIN/.test(text));
  }
  const ignored = await Deno.readTextFile(new URL(".gitignore", root));
  assert(/^\.env\*/m.test(ignored), "supabase/functions/.env stays ignored");
});
