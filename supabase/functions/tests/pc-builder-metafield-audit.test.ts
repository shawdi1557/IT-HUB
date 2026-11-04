// supabase/functions/tests/pc-builder-metafield-audit.test.ts
// The read-only Shopify Admin audit, run against a stand-in for Shopify. It never reaches the network, so
// this proves the script's logic and limits, not that Shopify accepts it. Only a real run can show that.

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const {
  assertReadOnlyQuery,
  AUDIT_QUERIES,
  DEFINITIONS_PAGE,
  METAFIELDS_PER_PRODUCT,
  PRODUCTS_PAGE,
  requestShortLivedToken,
  runAudit,
  SHOPIFY_MAX_QUERY_COST,
  validStoreDomain,
} = await import("../../../scripts/shopify-admin-metafield-audit.ts");
const { PC_BUILDER_METAFIELDS } = await import("../../../src/lib/builder/spec-schema.ts");

const TOKEN = "stand-in-credential-value";
const source = await Deno.readTextFile(
  new URL("../../../scripts/shopify-admin-metafield-audit.ts", import.meta.url),
);

const definition = (
  key: string,
  type: string,
  storefront = "PUBLIC_READ",
  validations: any[] = [],
) => ({
  namespace: "pc_builder",
  key,
  type: { name: type },
  validations,
  access: { storefront },
  metafieldsCount: 2,
});
const page = (nodes: any[], next?: string) => ({
  pageInfo: { hasNextPage: Boolean(next), endCursor: next ?? null },
  nodes,
});

/** Answers like Shopify would, and refuses anything that isn't an audit query. */
function standIn(options: { scopes?: string[]; throttleFirst?: boolean; status?: number } = {}) {
  const requests: any[] = [];
  let throttled = options.throttleFirst ?? false;
  const fetchFn = (async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    requests.push({
      url,
      headers: init.headers,
      method: init.method,
      query: body.query,
      variables: body.variables,
    });
    if (options.status) return new Response("{}", { status: options.status });
    if (throttled) {
      throttled = false;
      return Response.json({
        errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        extensions: { cost: { requestedQueryCost: 500, throttleStatus: { restoreRate: 100 } } },
      });
    }
    if (body.query.includes("currentAppInstallation")) {
      return Response.json({
        data: {
          currentAppInstallation: {
            accessScopes: (options.scopes ?? ["read_products"]).map((handle) => ({ handle })),
          },
        },
      });
    }
    if (body.query.includes("metafieldDefinitions")) {
      return Response.json({
        data: {
          metafieldDefinitions: body.variables.cursor
            ? page([definition("old_key", "single_line_text_field")])
            : page(
                [
                  definition("socket", "single_line_text_field", "PUBLIC_READ", [
                    {
                      name: "choices",
                      value: JSON.stringify(["AM4", "AM5", "LGA1700", "LGA1851", "LGA1200"]),
                    },
                  ]),
                  definition("watts", "single_line_text_field"),
                  definition("capacity_watts", "number_integer", "NONE", [
                    { name: "min", value: "100" },
                    { name: "max", value: "3000" },
                  ]),
                  definition("ram_slots", "number_integer", "PUBLIC_READ", [
                    { name: "min", value: "1" },
                    { name: "max", value: "4" },
                  ]),
                ],
                "next",
              ),
        },
      });
    }
    return Response.json({
      data: {
        products: body.variables.cursor
          ? page([{ metafields: { pageInfo: { hasNextPage: true }, nodes: [] } }])
          : page(
              [
                {
                  metafields: {
                    pageInfo: { hasNextPage: false },
                    nodes: [
                      { namespace: "pc_builder", key: "socket" },
                      { namespace: "pc_builder", key: "orphan" },
                      { namespace: "custom", key: "condition" },
                    ],
                  },
                },
              ],
              "next",
            ),
      },
    });
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

const audit = async (options: Parameters<typeof standIn>[0] = {}) => {
  const shopify = standIn(options);
  const lines: string[] = [];
  const waits: number[] = [];
  const report = await runAudit({
    domain: "example.myshopify.com",
    token: TOKEN,
    version: "2026-10",
    fetchFn: shopify.fetchFn,
    log: (line: string) => lines.push(line),
    wait: async (ms: number) => void waits.push(ms),
  });
  return { report, lines, waits, requests: shopify.requests };
};

Deno.test("AUDIT: only sends queries, to the store's own Admin endpoint", async () => {
  const { requests } = await audit();
  assert(requests.length >= 5);
  for (const request of requests) {
    assertEquals(request.method, "POST");
    assertEquals(request.url, "https://example.myshopify.com/admin/api/2026-10/graphql.json");
    assert(/^\s*query\b/.test(request.query));
    assert(!/\bmutation\b/i.test(request.query));
  }
});

Deno.test("AUDIT: refuses anything that isn't a query", () => {
  for (const text of [
    "mutation { metafieldDefinitionCreate { userErrors { message } } }",
    "query { x } mutation { y }",
    "{ products { nodes { id } } }",
    "MUTATION x { y }",
  ]) {
    let refused = false;
    try {
      assertReadOnlyQuery(text);
    } catch {
      refused = true;
    }
    assert(refused, text);
  }
  for (const text of AUDIT_QUERIES) assertReadOnlyQuery(text);
});

Deno.test("AUDIT: no create, update or delete anywhere in the script", () => {
  assert(!/metafield\w*(?:Create|Update|Delete|Set|Pin|Unpin)/i.test(source));
  assert(!/product(?:Create|Update|Delete|Set)/.test(source));
  assert(!source.includes("bulkOperationRun"));
});

Deno.test("AUDIT: asks for no customer, order or price data", () => {
  for (const text of AUDIT_QUERIES) {
    assert(!/customer|order|price|email|phone|address|inventory/i.test(text), text);
    // Only names and types: a value could hold anything a product's staff typed.
    assert(
      !/\bvalue\b(?![^{]*validations)/.test(text.replace(/validations\s*\{[^}]*\}/, "")),
      text,
    );
  }
});

Deno.test("AUDIT: every query stays under Shopify's limit for a single query", () => {
  // Each object costs 1, and a connection is sized by its "first". The old 100 by 100 query was over 10,000.
  const products = PRODUCTS_PAGE * (1 + 1 + 1 + METAFIELDS_PER_PRODUCT) + 2;
  const definitions = DEFINITIONS_PAGE * (1 + 1 + 1 + 1) + 2;
  assert(products <= SHOPIFY_MAX_QUERY_COST, `products query costs about ${products}`);
  assert(definitions <= SHOPIFY_MAX_QUERY_COST, `definitions query costs about ${definitions}`);
  assert(100 * (1 + 1 + 100) > SHOPIFY_MAX_QUERY_COST, "the shape this replaced");
});

Deno.test("AUDIT: covers every page of definitions and products", async () => {
  const { report, requests } = await audit();
  assertEquals(requests.filter((r: any) => r.query.includes("metafieldDefinitions")).length, 2);
  assertEquals(requests.filter((r: any) => r.query.includes("products(")).length, 2);
  assertEquals(report.definitions.length, 5);
  assertEquals(report.productCount, 2);
});

Deno.test("AUDIT: sorts each definition into existing, incompatible, missing or unexpected", async () => {
  const { report } = await audit();
  const keys = (group: any[]) => group.map((finding) => finding.key).sort();
  assertEquals(keys(report.existing), ["socket"]);
  assertEquals(keys(report.incompatible), ["capacity_watts", "ram_slots", "watts"]);
  assertEquals(report.findings.find((f: any) => f.key === "watts")?.status, "wrong_type");
  assertEquals(
    report.findings.find((f: any) => f.key === "capacity_watts")?.status,
    "wrong_access",
  );
  assertEquals(
    report.findings.find((f: any) => f.key === "ram_slots")?.status,
    "different_validation",
  );
  assertEquals(keys(report.unexpected), ["old_key"]);
  assertEquals(report.missing.length, PC_BUILDER_METAFIELDS.length - 4);
  assert(report.missing.some((finding: any) => finding.key === "cpu_max_power_watts"));
  // Every key of the schema lands in exactly one group.
  assertEquals(
    report.existing.length + report.incompatible.length + report.missing.length,
    PC_BUILDER_METAFIELDS.length,
  );
});

Deno.test("AUDIT: the printed report has clear sections", async () => {
  const { lines } = await audit();
  const text = lines.join("\n");
  assert(text.includes("INCOMPATIBLE, needs a decision before 1H (3)"));
  assert(text.includes(`MISSING, would be created in 1H (${PC_BUILDER_METAFIELDS.length - 4})`));
  assert(text.includes("EXISTING and matching (1)"));
  assert(text.includes("EXISTING, not in the schema (1)"));
  assert(text.includes("Read-only: nothing was changed in Shopify."));
});

Deno.test("AUDIT: finds values with no definition, which the storefront can't see", async () => {
  const { report, lines } = await audit();
  assertEquals(report.valuesWithNoDefinition, ["pc_builder.orphan"]);
  assertEquals(report.keysOutsideSchema, ["pc_builder.orphan"]);
  assertEquals(report.valueCounts["custom.condition"], 1);
  assertEquals(report.productsWithMoreFields, 1);
  assert(lines.some((line: string) => line.includes("counts above are partial")));
});

Deno.test("AUDIT: waits and retries when Shopify says to slow down", async () => {
  const { waits, report } = await audit({ throttleFirst: true });
  assertEquals(waits, [5000]);
  assertEquals(report.productCount, 2);
});

Deno.test("AUDIT: warns about a credential that could change data", async () => {
  const wide = await audit({ scopes: ["read_products", "write_products"] });
  assertEquals(wide.report.writeScopes, ["write_products"]);
  assert(wide.lines.some((line: string) => line.startsWith("WARNING")));
  const narrow = await audit();
  assertEquals(narrow.report.writeScopes, []);
  assert(!narrow.lines.some((line: string) => line.startsWith("WARNING")));
});

Deno.test("AUDIT: the credential is sent only as Shopify's header and never printed", async () => {
  const { lines, requests } = await audit({ scopes: ["read_products", "write_products"] });
  for (const request of requests) {
    assertEquals(request.headers["X-Shopify-Access-Token"], TOKEN);
    assert(!request.url.includes(TOKEN));
    assert(!JSON.stringify(request.variables ?? {}).includes(TOKEN));
  }
  assert(!lines.join("\n").includes(TOKEN));
});

Deno.test("AUDIT: a refused credential stops the audit, with no credential in the message", async () => {
  for (const status of [401, 403]) {
    const error = await assertRejects(() => audit({ status }));
    assert((error as Error).message.includes(String(status)));
    assert(!(error as Error).message.includes(TOKEN));
  }
});

Deno.test("AUDIT: a credential only goes to a real Shopify store address", () => {
  assert(validStoreDomain("it-hub.myshopify.com"));
  for (const domain of [
    "",
    "evil.example.com",
    "it-hub.myshopify.com.evil.example",
    "https://it-hub.myshopify.com",
    "it-hub.myshopify.com/admin",
    "it hub.myshopify.com",
  ]) {
    assert(!validStoreDomain(domain), domain);
  }
});

Deno.test("AUDIT: a short-lived token is requested the documented way", async () => {
  const seen: any[] = [];
  const fetchFn = (async (url: string, init: any) => {
    seen.push({ url, init });
    return Response.json({ access_token: "issued", scope: "read_products", expires_in: 86399 });
  }) as unknown as typeof fetch;
  const token = await requestShortLivedToken("it-hub.myshopify.com", "id-1", "secret-1", fetchFn);
  assertEquals(token, "issued");
  assertEquals(seen[0].url, "https://it-hub.myshopify.com/admin/oauth/access_token");
  assertEquals(seen[0].init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(seen[0].init.body);
  assertEquals(form.get("grant_type"), "client_credentials");
  assertEquals(form.get("client_id"), "id-1");
  assertEquals(form.get("client_secret"), "secret-1");
});

Deno.test("AUDIT: a refused token request names the reason, not the secret", async () => {
  const fetchFn = (async () =>
    new Response('{"error":"shop_not_permitted"}', { status: 400 })) as unknown as typeof fetch;
  const error = await assertRejects(() =>
    requestShortLivedToken("it-hub.myshopify.com", "id-1", "secret-1", fetchFn),
  );
  assert((error as Error).message.includes("shop_not_permitted"));
  assert(!(error as Error).message.includes("secret-1"));
});

Deno.test("AUDIT: credentials come only from the environment, and aren't logged", () => {
  assert(source.includes('Deno.env.get("SHOPIFY_ADMIN_TOKEN")'));
  assert(!/console\.\w+\([^)]*(?:adminToken|clientSecret|deps\.token)/.test(source));
  // It doesn't read any file, so a credential can't come from a .env left in the project.
  assert(!source.includes("readTextFile"));
  assert(!source.includes('".env'));
  assert(!/shpat_|shpss_/.test(source));
});

Deno.test("AUDIT: not being able to read the scopes doesn't stop the audit", async () => {
  const shopify = standIn();
  const lines: string[] = [];
  const fetchFn = (async (url: string, init: any) => {
    if (JSON.parse(init.body).query.includes("currentAppInstallation")) {
      return Response.json({ errors: [{ message: "Access denied" }] });
    }
    return shopify.fetchFn(url, init);
  }) as unknown as typeof fetch;
  const report = await runAudit({
    domain: "example.myshopify.com",
    token: TOKEN,
    version: "2026-10",
    fetchFn,
    log: (line: string) => lines.push(line),
  });
  assertEquals(report.productCount, 2);
  assert(lines.some((line: string) => line.includes("width isn't known")));
});

Deno.test("AUDIT: a refused definitions query stops the audit and says so", async () => {
  const fetchFn = (async () =>
    Response.json({
      errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }],
    })) as unknown as typeof fetch;
  const error = await assertRejects(() =>
    runAudit({
      domain: "example.myshopify.com",
      token: TOKEN,
      version: "2026-10",
      fetchFn,
      log: () => {},
    }),
  );
  assert((error as Error).message.includes("ACCESS_DENIED"));
  assert(!(error as Error).message.includes(TOKEN));
});
