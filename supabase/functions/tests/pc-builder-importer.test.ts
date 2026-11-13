// Shopify Hardware Importer: discovery (Storefront API, read-only) and the Edge Function's handler, with no network.
// Pagination, empty stores, missing or malformed fields, Shopify errors, rate limiting, and who may call it.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const D = await import("../hardware-shopify-import/discovery.ts");
const { handleHardwareImport } = await import("../hardware-shopify-import/index.ts");
type ImportStore = import("../hardware-shopify-import/index.ts").ImportStore;
type StorefrontAnswer = import("../hardware-shopify-import/discovery.ts").StorefrontAnswer;

const noSleep =
  (waits: number[] = []) =>
  async (ms: number) => {
    waits.push(ms);
  };

function node(n: number, extra: Record<string, unknown> = {}) {
  return {
    id: `gid://shopify/Product/${1000 + n}`,
    title: `Synthetic Product ${n}`,
    handle: `synthetic-${n}`,
    vendor: "IT-HUB",
    productType: "",
    tags: [],
    availableForSale: true,
    category: { name: "Video Cards & Adapters" },
    collections: { nodes: [{ title: "Graphics Cards" }] },
    featuredImage: { url: "https://cdn.example.test/x.png" },
    variants: {
      nodes: [
        {
          id: `gid://shopify/ProductVariant/${5000 + n}`,
          title: "Default Title",
          sku: `SKU-${n}`,
          availableForSale: true,
          price: { amount: "25999.0", currencyCode: "INR" },
        },
      ],
    },
    ...extra,
  };
}

const page = (
  nodes: unknown[],
  hasNextPage: boolean,
  endCursor: string | null,
): StorefrontAnswer => ({
  status: 200,
  body: { data: { products: { pageInfo: { hasNextPage, endCursor }, nodes } } },
});

Deno.test("IMP-1: normalising keeps Shopify's facts, drops malformed fields and suggests a registry category", () => {
  const p = D.normaliseProduct(
    node(1, { tags: ["  GPU ", 7, ""], productType: "  Graphics   Card " }),
  )!;
  assertEquals(p.id, "gid://shopify/Product/1001");
  assertEquals(p.category, "Video Cards & Adapters");
  assertEquals(p.productType, "Graphics Card");
  assertEquals(p.tags, ["GPU"]);
  assertEquals(p.collections, ["Graphics Cards"]);
  assertEquals(p.variants, [
    {
      id: "gid://shopify/ProductVariant/5001",
      title: "Default Title",
      sku: "SKU-1",
      price: "25999.0",
      currency: "INR",
      available: true,
    },
  ]);
  assertEquals(p.suggestedCategory, "GPU");

  // Missing optional fields: nulls and empty lists, nothing invented.
  const bare = D.normaliseProduct({ id: "gid://shopify/Product/7", title: "Bare" })!;
  assertEquals(
    [bare.vendor, bare.productType, bare.category, bare.imageUrl, bare.availableForSale],
    [null, null, null, null, null],
  );
  assertEquals([bare.tags, bare.collections, bare.variants], [[], [], []]);
  assertEquals(bare.suggestedCategory, null);

  // No usable id or title: not a product.
  assertEquals(D.normaliseProduct({ id: "gid://shopify/Collection/1", title: "x" }), null);
  assertEquals(D.normaliseProduct({ id: "gid://shopify/Product/1", title: "   " }), null);
  assertEquals(D.normaliseProduct(null), null);
  assertEquals(D.normaliseProduct("text"), null);

  // Malformed variants and prices are dropped; insecure images aren't kept.
  const odd = D.normaliseProduct(
    node(2, {
      featuredImage: { url: "http://insecure.example.test/x.png" },
      variants: {
        nodes: [
          { id: "not-a-gid", title: "x" },
          {
            id: "gid://shopify/ProductVariant/9",
            price: { amount: "free" },
            availableForSale: "yes",
          },
        ],
      },
    }),
  )!;
  assertEquals(odd.imageUrl, null);
  assertEquals(odd.variants, [
    {
      id: "gid://shopify/ProductVariant/9",
      title: null,
      sku: null,
      price: null,
      currency: null,
      available: null,
    },
  ]);

  // A phone is never suggested as hardware; a case fan has no registry category.
  assertEquals(
    D.normaliseProduct(
      node(3, { title: "Synthetic Phone 5G", category: { name: "Smart Phones" } }),
    )!.suggestedCategory,
    null,
  );
});

Deno.test("IMP-2: discovery follows every page, stages each before reading the next, and handles an empty store", async () => {
  const calls: Array<string | null> = [];
  const pages: Record<string, StorefrontAnswer> = {
    start: page([node(1), node(2)], true, "c1"),
    c1: page([node(3), { id: "bad" }], true, "c2"),
    c2: page([node(3), node(4)], false, "c3"),
  };
  const staged: string[][] = [];
  const progress = await D.discoverAll(
    async (_q, vars) => {
      calls.push((vars.after as string | null) ?? null);
      assertEquals(vars.first, D.PAGE_SIZE);
      return pages[(vars.after as string) ?? "start"];
    },
    async (products) => {
      staged.push(products.map((p) => p.id.split("/").pop()!));
    },
    noSleep(),
  );
  assertEquals(calls, [null, "c1", "c2"]);
  // Product 3 appears twice (a shifting catalogue): staged once. The malformed node is counted as skipped.
  assertEquals(staged, [["1001", "1002"], ["1003"], ["1004"]]);
  assertEquals(progress, { pages: 3, products: 4, skipped: 1, truncated: false });

  const empty = await D.discoverAll(
    async () => page([], false, null),
    async () => {
      throw new Error("nothing to stage");
    },
    noSleep(),
  );
  assertEquals(empty, { pages: 1, products: 0, skipped: 0, truncated: false });

  // A page limit stops a runaway catalogue and says so; a next page without a cursor stops too.
  let n = 0;
  const capped = await D.discoverAll(
    async () => page([node(n++)], true, `c${n}`),
    async () => {},
    noSleep(),
    3,
  );
  assertEquals([capped.pages, capped.truncated], [3, true]);
  const noCursor = await D.discoverAll(
    async () => page([node(1)], true, null),
    async () => {},
    noSleep(),
  );
  assertEquals(noCursor.pages, 1);
});

Deno.test("IMP-3: throttling and server errors are retried with growing waits; other failures stop with a reason", async () => {
  // Throttled twice (HTTP 429, then GraphQL THROTTLED), then fine.
  const waits: number[] = [];
  let attempt = 0;
  const answers: StorefrontAnswer[] = [
    { status: 429, body: null, retryAfterSeconds: 2 },
    {
      status: 200,
      body: { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] },
    },
    page([node(1)], false, null),
  ];
  const ok = await D.fetchPage(async () => answers[attempt++], null, noSleep(waits));
  assertEquals(ok.products.length, 1);
  assertEquals(waits, [2000, 2000]);

  // Always throttled: gives up after the last attempt with "throttled".
  const throttledWaits: number[] = [];
  const err1 = await D.fetchPage(
    async () => ({ status: 429, body: null }),
    null,
    noSleep(throttledWaits),
  ).catch((e) => e);
  assertEquals(err1.code, "shopify_throttled");
  assertEquals(throttledWaits, [1000, 2000, 4000]);

  // Server errors and network failures: retried, then "unavailable".
  const err2 = await D.fetchPage(async () => ({ status: 503, body: null }), null, noSleep()).catch(
    (e) => e,
  );
  assertEquals(err2.code, "shopify_unavailable");
  let tries = 0;
  const err3 = await D.fetchPage(
    async () => {
      tries++;
      throw new Error("connection reset");
    },
    null,
    noSleep(),
  ).catch((e) => e);
  assertEquals([err3.code, tries], ["shopify_unavailable", D.MAX_ATTEMPTS]);

  // Credential refused, query refused, or an answer with no product list: no retry.
  for (const [answer, code] of [
    [{ status: 401, body: {} }, "shopify_unauthorized"],
    [{ status: 403, body: {} }, "shopify_unauthorized"],
    [
      { status: 200, body: { errors: [{ message: "Field 'category' doesn't exist" }] } },
      "shopify_query_failed",
    ],
    [{ status: 200, body: { data: {} } }, "shopify_invalid_response"],
    [{ status: 200, body: null }, "shopify_invalid_response"],
    [{ status: 404, body: {} }, "shopify_invalid_response"],
    [
      {
        status: 200,
        body: { data: { products: { nodes: "x", pageInfo: { hasNextPage: false } } } },
      },
      "shopify_invalid_response",
    ],
  ] as const) {
    let count = 0;
    const err = await D.fetchPage(
      async () => {
        count++;
        return answer as StorefrontAnswer;
      },
      null,
      noSleep(),
    ).catch((e) => e);
    assertEquals([err.code, count], [code, 1], JSON.stringify(answer));
  }

  // The query asks only for what's read, through the public Storefront schema, and never a mutation.
  assert(!/mutation/i.test(D.DISCOVERY_QUERY));
  for (const field of [
    "category { name }",
    "vendor",
    "productType",
    "tags",
    "collections",
    "variants",
    "sku",
  ]) {
    assert(D.DISCOVERY_QUERY.includes(field), field);
  }
});

// ── The handler ──

const STAFF = { userId: "11111111-1111-4111-8111-111111111111", role: "quotation_staff" as const };
const ENV = {
  APP_ENV: "development",
  PORTAL_ORIGIN: "",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-stand-in",
};

function memoryStore(overrides: Partial<ImportStore> = {}) {
  const log: string[] = [];
  const staged: string[] = [];
  const store: ImportStore = {
    begin: async (actor, role) => {
      log.push(`begin:${actor}:${role}`);
      return { id: "session-1" };
    },
    stage: async (_id, products) => {
      staged.push(...products.map((p) => p.id));
    },
    finish: async (_id, error) => {
      log.push(`finish:${error ? (error as any).code : "ok"}`);
      return { status: error ? "failed" : "ready", counts: { discovered: staged.length } };
    },
    running: async () => null,
    ...overrides,
  };
  return { store, log, staged };
}

const call = (
  body: unknown,
  init: { token?: string | null; origin?: string; method?: string } = {},
) =>
  new Request("http://localhost/functions/v1/hardware-shopify-import", {
    method: init.method ?? "POST",
    headers: {
      ...(init.token === null ? {} : { Authorization: `Bearer ${init.token ?? "staff-token"}` }),
      Origin: init.origin ?? "http://localhost:5174",
      "Content-Type": "application/json",
    },
    body:
      init.method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

Deno.test("IMP-4: only an Admin or Staff session from the portal may discover", async () => {
  const { store } = memoryStore();
  const deps = (verify: any) => ({
    store,
    env: ENV,
    verifyStaff: verify,
    storefront: async () => page([], false, null),
    sleep: noSleep(),
  });
  assertEquals(
    (
      await handleHardwareImport(
        call({ action: "discover" }, { token: null }),
        deps(async () => STAFF),
      )
    ).status,
    401,
  );
  // The service key itself is never accepted as a caller.
  assertEquals(
    (
      await handleHardwareImport(
        call({ action: "discover" }, { token: ENV.SUPABASE_SERVICE_ROLE_KEY }),
        deps(async () => STAFF),
      )
    ).status,
    401,
  );
  assertEquals(
    (
      await handleHardwareImport(
        call({ action: "discover" }),
        deps(async () => null),
      )
    ).status,
    403,
  );
  assertEquals(
    (
      await handleHardwareImport(
        call({ action: "discover" }),
        deps(async () => {
          throw new Error("auth down");
        }),
      )
    ).status,
    403,
  );
  const foreign = await handleHardwareImport(
    call({ action: "discover" }, { origin: "https://evil.example" }),
    deps(async () => STAFF),
  );
  assertEquals(foreign.status, 403);
  assertEquals(
    (
      await handleHardwareImport(
        call(null, { method: "GET" }),
        deps(async () => STAFF),
      )
    ).status,
    405,
  );
  assertEquals(
    (
      await handleHardwareImport(
        call("{not json"),
        deps(async () => STAFF),
      )
    ).status,
    400,
  );
  assertEquals(
    (
      await handleHardwareImport(
        call({ action: "import" }),
        deps(async () => STAFF),
      )
    ).status,
    400,
  );
  assertEquals(
    (
      await handleHardwareImport(
        call({ action: "discover", pad: "x".repeat(3000) }),
        deps(async () => STAFF),
      )
    ).status,
    413,
  );
  const ok = await handleHardwareImport(
    call({ action: "discover" }),
    deps(async () => STAFF),
  );
  assertEquals(ok.status, 200);
});

Deno.test("IMP-5: a discovery stages every page and finishes ready; a Shopify failure finishes the session as failed", async () => {
  const { store, log, staged } = memoryStore();
  const pages = [page([node(1), node(2)], true, "c1"), page([node(3)], false, null)];
  let i = 0;
  const res = await handleHardwareImport(call({ action: "discover" }), {
    store,
    env: ENV,
    verifyStaff: async () => STAFF,
    storefront: async () => pages[i++],
    sleep: noSleep(),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(
    [body.sessionId, body.status, body.pages, body.products, body.truncated],
    ["session-1", "ready", 2, 3, false],
  );
  assertEquals(staged.length, 3);
  assertEquals(log, [`begin:${STAFF.userId}:quotation_staff`, "finish:ok"]);

  // Shopify refuses the credential on page 2: what was read stays staged, the session is failed with the reason.
  const second = memoryStore();
  let j = 0;
  const failing = await handleHardwareImport(call({ action: "discover" }), {
    store: second.store,
    env: ENV,
    verifyStaff: async () => STAFF,
    storefront: async () => (j++ === 0 ? page([node(1)], true, "c1") : { status: 401, body: {} }),
    sleep: noSleep(),
  });
  const failBody = await failing.json();
  assertEquals(
    [failing.status, failBody.code, failBody.sessionId],
    [502, "shopify_unauthorized", "session-1"],
  );
  assertEquals(second.log, [
    `begin:${STAFF.userId}:quotation_staff`,
    "finish:shopify_unauthorized",
  ]);
  assertEquals(second.staged.length, 1);

  // Staging refused by the database: failed with a neutral code, never a raw database message.
  const third = memoryStore({
    stage: async () => {
      throw new Error("hardware_import_stage: product_invalid");
    },
  });
  const staging = await handleHardwareImport(call({ action: "discover" }), {
    store: third.store,
    env: ENV,
    verifyStaff: async () => STAFF,
    storefront: async () => page([node(1)], false, null),
    sleep: noSleep(),
  });
  const stagingBody = await staging.json();
  assertEquals([staging.status, stagingBody.code], [502, "staging_failed"]);
  assert(!JSON.stringify(stagingBody).includes("hardware_import_stage"));
});

Deno.test("IMP-6: one discovery at a time; no Storefront configuration or database is reported, not guessed", async () => {
  const busy = memoryStore({ running: async () => ({ id: "session-0" }) });
  const res = await handleHardwareImport(call({ action: "discover" }), {
    store: busy.store,
    env: ENV,
    verifyStaff: async () => STAFF,
    storefront: async () => page([], false, null),
  });
  assertEquals([res.status, (await res.json()).code], [409, "discovery_running"]);
  assertEquals(busy.log, []);

  const unconfigured = await handleHardwareImport(call({ action: "discover" }), {
    store: memoryStore().store,
    env: ENV,
    verifyStaff: async () => STAFF,
  });
  assertEquals(
    [unconfigured.status, (await unconfigured.json()).code],
    [503, "shopify_not_configured"],
  );

  const noDb = memoryStore({
    begin: async () => {
      throw new Error("down");
    },
  });
  const down = await handleHardwareImport(call({ action: "discover" }), {
    store: noDb.store,
    env: ENV,
    verifyStaff: async () => STAFF,
    storefront: async () => page([], false, null),
  });
  assertEquals([down.status, (await down.json()).code], [503, "database_unavailable"]);
});

Deno.test("IMP-7: the importer never writes to Shopify and never reads the Admin credential", async () => {
  const source = await Deno.readTextFile(
    new URL("../hardware-shopify-import/index.ts", import.meta.url),
  );
  const discovery = await Deno.readTextFile(
    new URL("../hardware-shopify-import/discovery.ts", import.meta.url),
  );
  for (const text of [source, discovery]) {
    assert(
      !/SHOPIFY_ADMIN_ACCESS_TOKEN|SHOPIFY_SYNC_WRITES|X-Shopify-Access-Token|\/admin\/api\//.test(
        text,
      ),
    );
    assert(!/mutation\s*\{|mutation\s+\w+/.test(text));
  }
  assert(source.includes("X-Shopify-Storefront-Access-Token"));
});

// ── The PC Builder after an import ──

const Spec = await import("../../../src/lib/builder/hardware-spec.ts");
const { resolveShopifyComponent } = await import("../../../src/lib/builder/spec-registry.ts");

/** A registry row as get_pc_builder_registry_specs returns it for an imported model nobody has specified yet. */
const importedRow = (overrides: Record<string, unknown> = {}) => ({
  link_id: "00000000-0000-4000-8000-0000000b0001",
  shopify_product_id: "gid://shopify/Product/95000001",
  shopify_variant_id: null,
  model_id: "00000000-0000-4000-8000-0000000b0002",
  category_id: "CPU",
  manufacturer: "AMD",
  model_name: "Ryzen 5 7600",
  model_number: null,
  model_specs: {},
  base_specs: null,
  overrides: {},
  spec_revision: 0,
  override_revision: 0,
  ...overrides,
});
const lookupOf = (...rows: Record<string, unknown>[]) =>
  Spec.registryLookup(rows.map((row) => Spec.registryRecordFromRow(row)!));
const strip = (part: any) => ({ ...part, retrievedAt: "" });

Deno.test("IMP-8: an imported model with no specification yet leaves the PC Builder's resolution exactly as before", () => {
  // A processor the builder already knows (built-in verified specifications, matched by title), and one it knows
  // only from Shopify's stated values.
  const known = {
    id: "gid://shopify/Product/95000001",
    name: "AMD Ryzen 5 7600 Desktop Processor",
    category: "Computer Processors",
    price: 18000,
    variantId: "gid://shopify/ProductVariant/96000001",
    specs: {},
  };
  const before = strip(resolveShopifyComponent(known, "CPU", {}));
  assertEquals(before.isVerified, true, "fixture: the builder already verifies this processor");
  const after = strip(
    resolveShopifyComponent(known, "CPU", { registrySpecs: lookupOf(importedRow()) }),
  );
  assertEquals(after, before);

  const stated = {
    ...known,
    name: "Unlisted Synthetic CPU 1234",
    specs: { socket: "AM5", tdp_watts: "65" },
  };
  assertEquals(
    strip(resolveShopifyComponent(stated, "CPU", { registrySpecs: lookupOf(importedRow()) })),
    strip(resolveShopifyComponent(stated, "CPU", {})),
  );

  // Once staff save a specification (revision 1 and up), the registry record decides, as in 4B.
  const specified = resolveShopifyComponent(known, "CPU", {
    registrySpecs: lookupOf(
      importedRow({ model_specs: { socket: "AM5", tdp_watts: 65 }, spec_revision: 1 }),
    ),
  })!;
  assertEquals(specified.matchedModelKey, "hw-00000000-0000-4000-8000-0000000b0002");
  // A listing override alone (no model revision) also counts as stated.
  const overridden = resolveShopifyComponent(known, "CPU", {
    registrySpecs: lookupOf(importedRow({ overrides: { tdp_watts: 65 }, override_revision: 1 })),
  })!;
  assertEquals(overridden.matchedModelKey, "hw-00000000-0000-4000-8000-0000000b0002");
  // A record filed under another category still goes to review, specified or not (4B: S4B-12).
  const misfiled = resolveShopifyComponent(known, "CPU", {
    registrySpecs: lookupOf(importedRow({ category_id: "GPU" })),
  })!;
  assertEquals(misfiled.isVerified, false);
});

Deno.test("IMP-9: the quotation server's resolver (its generated copy) also leaves an unspecified import as before", async () => {
  const ServerSpec = await import("../_shared/builder/hardware-spec.ts");
  const Server = await import("../_shared/builder/spec-registry.ts");
  const serverLookup = (...rows: Record<string, unknown>[]) =>
    ServerSpec.registryLookup(rows.map((row) => ServerSpec.registryRecordFromRow(row)!));
  const known = {
    id: "gid://shopify/Product/95000001",
    name: "AMD Ryzen 5 7600 Desktop Processor",
    category: "Computer Processors",
    price: 18000,
    variantId: "gid://shopify/ProductVariant/96000001",
    specs: {},
  };
  const before = strip(Server.resolveShopifyComponent(known, "CPU", {}));
  assertEquals(before.isVerified, true);
  assertEquals(
    strip(
      Server.resolveShopifyComponent(known, "CPU", { registrySpecs: serverLookup(importedRow()) }),
    ),
    before,
  );
  const misfiled = Server.resolveShopifyComponent(known, "CPU", {
    registrySpecs: serverLookup(importedRow({ category_id: "GPU" })),
  })!;
  assertEquals(misfiled.isVerified, false);
});
