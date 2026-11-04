// scripts/shopify-admin-metafield-audit.ts
// Read-only audit of Shopify's product metafield definitions and values against the pc_builder schema.
// It sends only GraphQL queries, refuses anything else, and never prints a credential.
//
// Needs an Admin API credential with the read_products scope, for this store only. Set it in the shell
// for one session and never in a file. The safe procedure is in docs/PC_BUILDER_V2_STAGE_1_AUDIT.md:
//
//   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com, and either SHOPIFY_ADMIN_TOKEN, or
//   SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET for an app in the store's own organization.
//
//   deno run --no-lock --unstable-sloppy-imports \
//     --allow-env=SHOPIFY_STORE_DOMAIN,SHOPIFY_ADMIN_TOKEN,SHOPIFY_CLIENT_ID,SHOPIFY_CLIENT_SECRET,SHOPIFY_API_VERSION \
//     --allow-net=your-store.myshopify.com scripts/shopify-admin-metafield-audit.ts
//
// Exit codes: 0 finished, 1 the audit failed, 2 nothing was sent because a setting is missing or wrong.

import {
  compareDefinitions,
  PC_BUILDER_DEFINITIONS_TO_CREATE,
  PC_BUILDER_METAFIELDS,
  type AdminMetafieldDefinition,
  type DefinitionFinding,
} from "../src/lib/builder/spec-schema.ts";

/** Shopify refuses any single query above 1,000 points, before running it. */
export const SHOPIFY_MAX_QUERY_COST = 1000;
export const DEFINITIONS_PAGE = 50;
export const PRODUCTS_PAGE = 10;
export const METAFIELDS_PER_PRODUCT = 80;

const DEFINITIONS_QUERY = `query Definitions($cursor: String) {
  metafieldDefinitions(first: ${DEFINITIONS_PAGE}, ownerType: PRODUCT, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      namespace
      key
      type { name }
      validations { name value }
      access { storefront }
      metafieldsCount
    }
  }
}`;

const PRODUCTS_QUERY = `query Products($cursor: String) {
  products(first: ${PRODUCTS_PAGE}, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      metafields(first: ${METAFIELDS_PER_PRODUCT}) {
        pageInfo { hasNextPage }
        nodes { namespace key }
      }
    }
  }
}`;

const SCOPES_QUERY = `query Scopes {
  currentAppInstallation { accessScopes { handle } }
}`;

export const AUDIT_QUERIES = [DEFINITIONS_QUERY, PRODUCTS_QUERY, SCOPES_QUERY];

/** A hard stop: this script can never change anything in Shopify. */
export function assertReadOnlyQuery(text: string) {
  if (/\bmutation\b/i.test(text) || !/^\s*query\b/.test(text)) {
    throw new Error("Refused: this audit only sends queries.");
  }
}

export const validStoreDomain = (domain: string) =>
  /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain);

export interface AuditDeps {
  domain: string;
  token: string;
  version: string;
  fetchFn?: typeof fetch;
  log?: (line: string) => void;
  wait?: (ms: number) => Promise<void>;
}

export interface AuditReport {
  definitions: AdminMetafieldDefinition[];
  findings: DefinitionFinding[];
  incompatible: DefinitionFinding[];
  missing: DefinitionFinding[];
  existing: DefinitionFinding[];
  unexpected: DefinitionFinding[];
  productCount: number;
  valueCounts: Record<string, number>;
  valuesWithNoDefinition: string[];
  keysOutsideSchema: string[];
  productsWithMoreFields: number;
  writeScopes: string[];
}

export async function runAudit(deps: AuditDeps): Promise<AuditReport> {
  const fetchFn = deps.fetchFn ?? fetch;
  const log = deps.log ?? console.log;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

  async function query(text: string, variables: Record<string, unknown> = {}): Promise<any> {
    assertReadOnlyQuery(text);
    for (let attempt = 0; ; attempt++) {
      const response = await fetchFn(
        `https://${deps.domain}/admin/api/${deps.version}/graphql.json`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": deps.token },
          body: JSON.stringify({ query: text, variables }),
        },
      );
      // A plain 429 is a rate limit, and so can be a GraphQL THROTTLED answer below.
      if (response.status === 429 && attempt < 5) {
        await wait(2000);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Shopify refused the credential (${response.status}).`);
      }
      if (!response.ok) throw new Error(`Shopify answered ${response.status}.`);
      const body = await response.json();
      const throttled = body.errors?.some?.((e: any) => e?.extensions?.code === "THROTTLED");
      if (throttled && attempt < 5) {
        const status = body.extensions?.cost?.throttleStatus;
        const needed = body.extensions?.cost?.requestedQueryCost ?? SHOPIFY_MAX_QUERY_COST;
        const restore = status?.restoreRate || 50;
        await wait(Math.ceil((needed / restore) * 1000));
        continue;
      }
      if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 500));
      return body.data;
    }
  }

  // This only checks the credential isn't wider than it should be, so it can't stop the audit itself.
  let scopes: string[] = [];
  try {
    const scopeData = await query(SCOPES_QUERY);
    scopes = (scopeData.currentAppInstallation?.accessScopes || []).map(
      (scope: { handle: string }) => scope.handle,
    );
  } catch {
    log("Couldn't read this credential's scopes, so its width isn't known.");
  }
  const writeScopes = scopes.filter((scope) => scope.startsWith("write_"));
  log(`Credential scopes: ${scopes.join(", ") || "none reported"}`);
  if (writeScopes.length > 0) {
    log(
      `WARNING: this credential can also change data (${writeScopes.join(", ")}). This audit won't use them, but it should be replaced with a read_products-only one.`,
    );
  }

  const definitions: AdminMetafieldDefinition[] = [];
  let cursor: string | null = null;
  do {
    const data: any = await query(DEFINITIONS_QUERY, { cursor });
    for (const node of data.metafieldDefinitions.nodes) {
      definitions.push({
        namespace: node.namespace,
        key: node.key,
        type: node.type.name,
        validations: node.validations,
        storefrontAccess: node.access?.storefront,
      });
      if (node.namespace === "pc_builder" || node.namespace === "custom") {
        log(
          `DEFINED ${node.namespace}.${node.key} ${node.type.name} values=${node.metafieldsCount}`,
        );
      }
    }
    cursor = data.metafieldDefinitions.pageInfo.hasNextPage
      ? data.metafieldDefinitions.pageInfo.endCursor
      : null;
  } while (cursor);

  log(`\nDefinitions on products: ${definitions.length}`);
  log(
    `Namespaces: ${[...new Set(definitions.map((d) => d.namespace))].sort().join(", ") || "none"}`,
  );

  const findings = compareDefinitions(definitions);
  const withStatus = (...statuses: DefinitionFinding["status"][]) =>
    findings.filter((finding) => statuses.includes(finding.status));
  const incompatible = withStatus("wrong_type", "wrong_access", "different_validation");
  const missing = withStatus("missing");
  const existing = withStatus("matches");
  const unexpected = withStatus("unexpected");
  log(`\nAgainst the pc_builder schema (${PC_BUILDER_DEFINITIONS_TO_CREATE.length} keys):`);
  const section = (title: string, group: DefinitionFinding[]) => {
    log(`\n${title} (${group.length})`);
    for (const finding of group) log(`  ${finding.key}: [${finding.status}] ${finding.detail}`);
  };
  section("INCOMPATIBLE, needs a decision before 1H", incompatible);
  section("MISSING, would be created in 1H", missing);
  section("EXISTING and matching", existing);
  section("EXISTING, not in the schema", unexpected);

  // Values can exist with no definition, and those are invisible to the Storefront API.
  const valueCounts: Record<string, number> = {};
  let productCount = 0;
  let productsWithMoreFields = 0;
  let productCursor: string | null = null;
  do {
    const data: any = await query(PRODUCTS_QUERY, { cursor: productCursor });
    for (const product of data.products.nodes) {
      productCount++;
      if (product.metafields.pageInfo?.hasNextPage) productsWithMoreFields++;
      for (const field of product.metafields.nodes) {
        const name = `${field.namespace}.${field.key}`;
        valueCounts[name] = (valueCounts[name] || 0) + 1;
      }
    }
    productCursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (productCursor);

  log(`\nValues across ${productCount} products:`);
  for (const name of Object.keys(valueCounts).sort()) log(`  ${name}: ${valueCounts[name]}`);
  const schemaKeys = new Set(PC_BUILDER_METAFIELDS.map((field) => field.key));
  const inNamespace = Object.keys(valueCounts).filter((name) => name.startsWith("pc_builder."));
  const valuesWithNoDefinition = inNamespace.filter(
    (name) => !definitions.some((d) => `${d.namespace}.${d.key}` === name),
  );
  const keysOutsideSchema = inNamespace.filter((name) => !schemaKeys.has(name.split(".")[1]));
  log(`\npc_builder values with no definition: ${valuesWithNoDefinition.join(", ") || "none"}`);
  log(`pc_builder keys with values, outside the schema: ${keysOutsideSchema.join(", ") || "none"}`);
  if (productsWithMoreFields > 0) {
    log(
      `NOTE: ${productsWithMoreFields} products have more than ${METAFIELDS_PER_PRODUCT} metafields, so their counts above are partial.`,
    );
  }
  log("\nRead-only: nothing was changed in Shopify.");

  return {
    definitions,
    findings,
    incompatible,
    missing,
    existing,
    unexpected,
    productCount,
    valueCounts,
    valuesWithNoDefinition,
    keysOutsideSchema,
    productsWithMoreFields,
    writeScopes,
  };
}

/** Swaps an app's client ID and secret for a token lasting about a day. Shopify's own documented grant. */
export async function requestShortLivedToken(
  domain: string,
  clientId: string,
  clientSecret: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchFn(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!response.ok) {
    // The body names the reason (shop_not_permitted, application_cannot_be_found) and holds no secret.
    const reason = (await response.text()).slice(0, 200);
    throw new Error(`Shopify didn't issue a token (${response.status}): ${reason}`);
  }
  const { access_token: token } = await response.json();
  if (!token) throw new Error("Shopify's answer held no token.");
  return token;
}

if (import.meta.main) {
  const domain = (Deno.env.get("SHOPIFY_STORE_DOMAIN") || "").trim().toLowerCase();
  const version = Deno.env.get("SHOPIFY_API_VERSION") || "2026-10";
  const adminToken = Deno.env.get("SHOPIFY_ADMIN_TOKEN");
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  if (!validStoreDomain(domain)) {
    console.error(
      "Set SHOPIFY_STORE_DOMAIN to the store's *.myshopify.com name. Nothing was sent.",
    );
    Deno.exit(2);
  }
  if (!adminToken && !(clientId && clientSecret)) {
    console.error(
      "Set SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET. Nothing was sent.",
    );
    Deno.exit(2);
  }
  try {
    const token = adminToken || (await requestShortLivedToken(domain, clientId!, clientSecret!));
    await runAudit({ domain, token, version });
  } catch (error) {
    console.error(`Audit failed: ${error instanceof Error ? error.message : "unknown error"}`);
    Deno.exit(1);
  }
}
