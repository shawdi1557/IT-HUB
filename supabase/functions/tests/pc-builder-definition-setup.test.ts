// supabase/functions/tests/pc-builder-definition-setup.test.ts
// The script that will create Shopify's pc_builder definitions, run against a stand-in for Shopify. It
// never reaches the network, so this proves the script's logic and limits, not that Shopify accepts it.

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const setup = await import("../../../scripts/shopify-create-pc-builder-definitions.ts");
const {
  ALLOWED_OPERATIONS,
  ALLOWED_STORE,
  assertAllowedOperation,
  assertStore,
  createOrder,
  parseOptions,
  PILOT,
  pilotInputs,
  refusingRedirects,
  run,
  Stop,
} = setup;
const {
  compareDefinitions,
  definitionCreateInput,
  PC_BUILDER_DEFINITIONS_TO_CREATE: TO_CREATE,
  PC_BUILDER_METAFIELDS: ALL_KEYS,
  readStatedSpecs,
} = await import("../../../src/lib/builder/spec-schema.ts");
const { matchShopifyProductToComponent, syncBuilderCatalogWithShopify } =
  await import("../../../src/lib/builder/catalog.ts");
const { parseProductSpecs } = await import("../../../src/lib/shopify-schema.ts");
const { checkCompatibility } = await import("../../../src/lib/builder/compatibility.ts");
const { generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");

const TOKEN = "stand-in-credential-value";
const source = await Deno.readTextFile(
  new URL("../../../scripts/shopify-create-pc-builder-definitions.ts", import.meta.url),
);

// ── The approved list, written out separately so a change to the schema has to be deliberate ────

const SOCKETS = ["AM4", "AM5", "LGA1700", "LGA1851", "LGA1200"];
const SIZES = ["E-ATX", "ATX", "Micro-ATX", "Mini-ITX"];
const GENERATIONS = ["DDR4", "DDR5"];
const TEXT = "single_line_text_field";
const LIST = "list.single_line_text_field";
const INT = "number_integer";
const BOOL = "boolean";
const APPROVED: Record<string, { type: string; range?: [number, number]; choices?: string[] }> = {
  spec_source: { type: TEXT, choices: ["manufacturer_datasheet", "supplier", "it_hub_measured"] },
  spec_review_status: { type: TEXT, choices: ["unreviewed", "reviewed", "rejected"] },
  spec_source_url: { type: "url" },
  spec_reviewed_on: { type: "date" },
  spec_reviewed_by: { type: TEXT },
  socket: { type: TEXT, choices: SOCKETS },
  supported_ram_generations: { type: LIST, choices: GENERATIONS },
  ram_generation: { type: TEXT, choices: GENERATIONS },
  watts: { type: INT, range: [1, 1000] },
  cpu_max_power_watts: { type: INT, range: [1, 1000] },
  integrated_graphics: { type: BOOL },
  includes_cooler: { type: BOOL },
  form_factor: { type: TEXT, choices: SIZES },
  ram_slots: { type: INT, range: [1, 8] },
  max_ram_gb: { type: INT, range: [1, 4096] },
  m2_slots: { type: INT, range: [0, 12] },
  sata_ports: { type: INT, range: [0, 12] },
  wifi: { type: BOOL },
  bios_update_required: { type: BOOL },
  ram_capacity_gb: { type: INT, range: [1, 1024] },
  ram_modules: { type: INT, range: [1, 8] },
  ram_speed_mhz: { type: INT, range: [1000, 12000] },
  ram_module_type: { type: TEXT, choices: ["DIMM", "SO-DIMM"] },
  gpu_length_mm: { type: INT, range: [50, 500] },
  recommended_psu_watts: { type: INT, range: [100, 2000] },
  pcie_6plus2_required: { type: INT, range: [0, 4] },
  pcie_16pin_required: { type: INT, range: [0, 2] },
  pcie_16pin_adapter_8pin_count: { type: INT, range: [0, 4] },
  capacity_watts: { type: INT, range: [100, 3000] },
  pcie_6plus2_count: { type: INT, range: [0, 12] },
  pcie_16pin_count: { type: INT, range: [0, 4] },
  supported_motherboards: { type: LIST, choices: SIZES },
  cabinet_clearance_mm: { type: INT, range: [100, 600] },
  max_cooler_height_mm: { type: INT, range: [50, 250] },
  storage_interface: { type: TEXT, choices: ["M.2 NVMe", "M.2 SATA", "SATA SSD", "SATA HDD"] },
  storage_capacity_gb: { type: INT, range: [1, 100000] },
  supported_sockets: { type: LIST, choices: SOCKETS },
  cooler_height_mm: { type: INT, range: [20, 250] },
};

Deno.test("LIST: exactly the 38 approved definitions, and nothing else", () => {
  assertEquals(Object.keys(APPROVED).length, 38);
  assertEquals(TO_CREATE.map((f: any) => f.key).sort(), Object.keys(APPROVED).sort());
  // Still read if they ever appear, but never created.
  const skipped = ALL_KEYS.filter((f: any) => f.notCreated).map((f: any) => f.key);
  assertEquals(skipped.sort(), ["exact_model", "pcie_connectors"]);
});

Deno.test("LIST: each definition's input is what was approved", () => {
  for (const field of TO_CREATE) {
    const input = definitionCreateInput(field);
    const wanted = APPROVED[field.key];
    assertEquals(input.key, field.key);
    assertEquals(input.namespace, "pc_builder");
    assertEquals(input.ownerType, "PRODUCT");
    assertEquals(input.type, wanted.type, field.key);
    assertEquals(input.pin, false, field.key);
    assert(input.name.trim().length > 0 && input.name.length <= 255, field.key);
    assert(input.description.trim().length > 0, field.key);
    const by = Object.fromEntries(input.validations.map((v: any) => [v.name, v.value]));
    if (wanted.range) {
      assertEquals(by.min, String(wanted.range[0]), field.key);
      assertEquals(by.max, String(wanted.range[1]), field.key);
    }
    if (wanted.choices) assertEquals(JSON.parse(by.choices), wanted.choices, field.key);
    // Shopify's documented rules for a key, and its refusal of admin access here.
    assert(/^[A-Za-z0-9_-]{2,64}$/.test(input.key), field.key);
    assertEquals(Object.keys(input.access), ["storefront"], field.key);
  }
  assert(/^[A-Za-z0-9_-]{3,255}$/.test("pc_builder"));
});

Deno.test("LIST: only the reviewer's initials stay out of the public API", () => {
  const hidden = TO_CREATE.filter(
    (f: any) => definitionCreateInput(f).access.storefront !== "PUBLIC_READ",
  ).map((f: any) => f.key);
  assertEquals(hidden, ["spec_reviewed_by"]);
  const initials = definitionCreateInput(TO_CREATE.find((f: any) => f.key === "spec_reviewed_by")!);
  assertEquals(initials.access.storefront, "NONE");
  assertEquals(initials.validations, [{ name: "max", value: "20" }]);
});

Deno.test("LIST: every definition the builder reads is in Shopify's catalogue query", async () => {
  const query = await Deno.readTextFile(new URL("../../../src/lib/shopify.ts", import.meta.url));
  for (const field of TO_CREATE) {
    if (field.key === "spec_reviewed_by") {
      assert(!query.includes(`key: "${field.key}"`), "initials are never requested");
      continue;
    }
    assert(query.includes(`{ namespace: "pc_builder", key: "${field.key}" }`), field.key);
  }
});

Deno.test("ORDER: lists with choices go first, because Shopify only documents choices for text", () => {
  const order = createOrder(TO_CREATE).map((f: any) => f.key);
  assertEquals(order.slice(0, 3).sort(), [
    "supported_motherboards",
    "supported_ram_generations",
    "supported_sockets",
  ]);
  assertEquals(order.length, 38);
  assertEquals(new Set(order).size, 38);
});

// ── A stand-in for Shopify that keeps state and applies Shopify's documented refusals ───────────

interface StandInOptions {
  scopes?: string[];
  definitions?: any[];
  pilotValues?: Record<string, string>;
  title?: string;
  rejectListChoices?: boolean;
  listRefusalCode?: string;
  refuseListOutright?: boolean;
  failCreateOn?: string;
  dropValidationOn?: string;
  scopesRefused?: boolean;
  status?: number;
  throttleOnce?: boolean;
  valuesElsewhere?: Record<string, number>;
  misreadPilot?: boolean;
  refusePilot?: boolean;
}

function standIn(options: StandInOptions = {}) {
  const definitions = new Map<string, any>();
  for (const d of options.definitions || []) definitions.set(d.key, d);
  const pilot = new Map<string, string>(Object.entries(options.pilotValues || {}));
  const requests: {
    query: string;
    variables: any;
    headers: any;
    url: string;
    redirect?: string;
  }[] = [];
  let throttle = options.throttleOnce ?? false;
  const respond = (data: unknown) => Response.json({ data });
  const fetchFn = (async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    requests.push({
      query: body.query,
      variables: body.variables,
      headers: init.headers,
      url,
      redirect: init.redirect,
    });
    if (options.status) return new Response("{}", { status: options.status });
    if (throttle) {
      throttle = false;
      return Response.json({
        errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        extensions: { cost: { requestedQueryCost: 100, throttleStatus: { restoreRate: 100 } } },
      });
    }
    const q: string = body.query;
    if (q.includes("currentAppInstallation")) {
      if (options.scopesRefused) return Response.json({ errors: [{ message: "Access denied" }] });
      const handles = options.scopes ?? ["read_products", "write_products"];
      return respond({
        currentAppInstallation: { accessScopes: handles.map((handle) => ({ handle })) },
      });
    }
    if (q.includes("metafieldDefinitions(")) {
      return respond({
        metafieldDefinitions: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [...definitions.values()].map((d) => ({
            namespace: d.namespace,
            key: d.key,
            type: { name: d.type },
            validations: d.validations,
            access: d.access,
            metafieldsCount: (pilot.has(d.key) ? 1 : 0) + (options.valuesElsewhere?.[d.key] ?? 0),
          })),
        },
      });
    }
    if (q.includes("product(id:")) {
      return respond({
        product: {
          id: PILOT.productId,
          title: options.title ?? PILOT.title,
          metafields: {
            nodes: [...pilot.entries()].map(([key, value]) => ({
              key,
              value: options.misreadPilot && key === "watts" ? "999" : value,
            })),
          },
        },
      });
    }
    if (q.includes("metafieldDefinitionCreate(")) {
      const input = body.variables.definition;
      const refuse = (code: string, message: string) =>
        respond({
          metafieldDefinitionCreate: {
            createdDefinition: null,
            userErrors: [{ field: ["definition"], message, code }],
          },
        });
      if (input.access?.admin) return refuse("ADMIN_ACCESS_INPUT_NOT_ALLOWED", "Not allowed");
      if (definitions.has(input.key)) return refuse("TAKEN", "Already in use");
      if (options.failCreateOn === input.key) return refuse("INVALID", "Stand-in refusal");
      const hasChoices = input.validations.some((v: any) => v.name === "choices");
      if (options.rejectListChoices && input.type.startsWith("list.") && hasChoices) {
        return refuse(options.listRefusalCode ?? "INVALID_OPTION", "choices isn't supported");
      }
      if (options.refuseListOutright && input.type.startsWith("list.")) {
        return refuse("INVALID_OPTION", "not this time either");
      }
      definitions.set(input.key, {
        ...input,
        validations: options.dropValidationOn === input.key ? [] : input.validations,
      });
      return respond({
        metafieldDefinitionCreate: {
          createdDefinition: {
            id: `gid://shopify/MetafieldDefinition/${input.key}`,
            key: input.key,
          },
          userErrors: [],
        },
      });
    }
    if (q.includes("metafieldsSet(")) {
      const inputs = body.variables.metafields;
      if (options.refusePilot) {
        return respond({
          metafieldsSet: {
            metafields: [],
            userErrors: [
              { field: ["metafields"], message: "Stand-in refusal", code: "INVALID_VALUE" },
            ],
          },
        });
      }
      if (inputs.length > 25) {
        return respond({ metafieldsSet: { metafields: [], userErrors: [{ message: "Over 25" }] } });
      }
      // All or nothing, as documented.
      for (const m of inputs) {
        const d = definitions.get(m.key);
        const bad = (message: string) =>
          respond({
            metafieldsSet: {
              metafields: [],
              userErrors: [{ field: ["metafields", m.key], message, code: "INVALID_VALUE" }],
            },
          });
        if (!d) return bad("No definition");
        if (d.type !== m.type) return bad("Wrong type");
        const by = Object.fromEntries(d.validations.map((v: any) => [v.name, v.value]));
        if (by.choices) {
          const allowed = JSON.parse(by.choices);
          const values = d.type.startsWith("list.") ? JSON.parse(m.value) : [m.value];
          if (!values.every((v: string) => allowed.includes(v))) return bad("Not a choice");
        }
        if (d.type === "number_integer") {
          const n = Number(m.value);
          if (!Number.isInteger(n) || n < Number(by.min) || n > Number(by.max)) {
            return bad("Out of range");
          }
        }
        if (d.type === "boolean" && !["true", "false"].includes(m.value)) return bad("Not boolean");
        if (d.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(m.value)) return bad("Not a date");
        if (d.type === "url" && !/^https:\/\//.test(m.value)) return bad("Not a link");
        if (by.max && d.type === "single_line_text_field" && m.value.length > Number(by.max)) {
          return bad("Too long");
        }
        if (m.compareDigest === null && pilot.has(m.key)) return bad("Already exists");
      }
      for (const m of inputs) pilot.set(m.key, m.value);
      return respond({
        metafieldsSet: {
          metafields: inputs.map((m: any) => ({ key: m.key, value: m.value })),
          userErrors: [],
        },
      });
    }
    if (q.includes("metafieldDefinitionDelete(")) {
      const { key } = body.variables.identifier;
      definitions.delete(key);
      pilot.delete(key);
      return respond({
        metafieldDefinitionDelete: {
          deletedDefinitionId: `gid://shopify/MetafieldDefinition/${key}`,
          userErrors: [],
        },
      });
    }
    throw new Error(`The stand-in was sent something unknown: ${q.slice(0, 60)}`);
  }) as unknown as typeof fetch;
  return { fetchFn, requests, definitions, pilot };
}

const TODAY = "2026-11-04";
const asDefinition = (field: any) => {
  const input = definitionCreateInput(field);
  return { ...input };
};
const all38 = () => TO_CREATE.map(asDefinition);
const PILOT_OPTIONS = { mode: "pilot", reviewedBy: "AK", reviewedOn: TODAY } as const;

const go = async (mode: any, shopify: ReturnType<typeof standIn>) => {
  const lines: string[] = [];
  const waits: number[] = [];
  const outcome = await run({
    domain: ALLOWED_STORE,
    token: TOKEN,
    options: typeof mode === "string" ? { mode } : mode,
    fetchFn: shopify.fetchFn,
    log: (line: string) => lines.push(line),
    wait: async (ms: number) => void waits.push(ms),
  });
  return { outcome, lines, waits };
};
const stopped = async (mode: any, shopify: ReturnType<typeof standIn>) => {
  const error = await assertRejects(() => go(mode, shopify));
  assert(error instanceof Stop, String(error));
  return (error as Error).message;
};
const mutations = (shopify: ReturnType<typeof standIn>) =>
  shopify.requests.filter((r) => /^\s*mutation\b/.test(r.query));

// ── Reading only, unless told otherwise ─────────────────────────────────────────────────────────

Deno.test("PLAN: with no options it writes nothing, and says what it would do", async () => {
  const shopify = standIn({ scopes: ["read_products"] });
  const { lines, outcome } = await go("plan", shopify);
  assertEquals(mutations(shopify).length, 0);
  assertEquals(shopify.definitions.size, 0);
  assertEquals(outcome.created, []);
  const text = lines.join("\n");
  assert(text.includes("Would create 38 definitions"));
  assert(text.includes("Read-only: nothing was changed in Shopify."));
});

Deno.test("PLAN: a read-only run can't send a write, even if the code tried", () => {
  for (const operation of ALLOWED_OPERATIONS) {
    if (/^\s*mutation\b/.test(operation)) {
      let refused = false;
      try {
        assertAllowedOperation(operation, false);
      } catch {
        refused = true;
      }
      assert(refused, operation.slice(0, 40));
    } else {
      assertAllowedOperation(operation, false);
    }
  }
});

Deno.test("SAFETY: only this script's own operations can be sent", () => {
  for (const text of [
    "mutation { productUpdate(input: {}) { product { id } } }",
    "mutation { metafieldDefinitionUpdate(definition: {}) { updatedDefinition { id } } }",
    "mutation { productDelete(input: {}) { deletedProductId } }",
    "query { orders(first: 1) { nodes { id } } }",
    "query { customers(first: 1) { nodes { id } } }",
    "",
  ]) {
    let refused = false;
    try {
      assertAllowedOperation(text, true);
    } catch {
      refused = true;
    }
    assert(refused, text);
  }
});

Deno.test("SAFETY: the script names only three writes, and none that update or touch stock", () => {
  const names = [...source.matchAll(/\bmutation\s+\w+[^{]*\{\s*(\w+)/g)].map((m) => m[1]).sort();
  assertEquals(names, ["metafieldDefinitionCreate", "metafieldDefinitionDelete", "metafieldsSet"]);
  for (const forbidden of [
    "metafieldDefinitionUpdate",
    "metafieldDefinitionPin",
    "metafieldsDelete",
    "productUpdate",
    "productSet",
    "productDelete",
    "productVariant",
    "inventory",
    "bulkOperationRun",
  ]) {
    assert(!source.includes(forbidden), forbidden);
  }
});

Deno.test("SAFETY: asks for no customer, order, price or stock data", () => {
  for (const operation of ALLOWED_OPERATIONS) {
    assert(!/customer|order\b|orders|price|email|phone|address|inventory/i.test(operation));
  }
});

// ── Options and settings ────────────────────────────────────────────────────────────────────────

const refused = (args: string[]) => {
  let threw = false;
  try {
    parseOptions(args, TODAY);
  } catch (error) {
    threw = error instanceof Stop;
  }
  return threw;
};
const CONFIRM = `--confirm-store=${ALLOWED_STORE}`;
const PILOT_ARGS = [
  "--apply-pilot",
  CONFIRM,
  "--values-checked",
  "--reviewed-by=AK",
  `--reviewed-on=${TODAY}`,
];

Deno.test("OPTIONS: nothing given means read only", () => {
  assertEquals(parseOptions([], TODAY), { mode: "plan" });
});

Deno.test("OPTIONS: writing needs the store's name retyped exactly", () => {
  assertEquals(parseOptions(["--apply-definitions", CONFIRM], TODAY).mode, "definitions");
  assert(refused(["--apply-definitions"]));
  assert(refused(["--apply-definitions", "--confirm-store"]));
  assert(refused(["--apply-definitions", "--confirm-store=other.myshopify.com"]));
  assert(refused(["--apply-pilot", "--confirm-store=other.myshopify.com"]));
  assert(refused(["--rollback", "--confirm-store=other.myshopify.com", "--confirm-rollback"]));
});

Deno.test("OPTIONS: anything unknown, combined or left over stops the run", () => {
  assert(refused(["--apply"]));
  assert(refused(["apply"]));
  assert(refused(["--apply-definitions", "--apply-pilot", CONFIRM]));
  assert(refused(["--apply-definitions", "--rollback", CONFIRM]));
  assert(refused([CONFIRM]), "a confirmation with nothing to confirm is a mistake");
  assert(refused(["--apply-definitions", CONFIRM, "--force"]));
});

Deno.test("OPTIONS: rolling back has to be asked for twice", () => {
  assert(refused(["--rollback", CONFIRM]));
  assertEquals(parseOptions(["--rollback", CONFIRM, "--confirm-rollback"], TODAY).mode, "rollback");
});

Deno.test("OPTIONS: the pilot needs a person's check, initials and a real date", () => {
  assertEquals(parseOptions(PILOT_ARGS, TODAY), {
    mode: "pilot",
    reviewedBy: "AK",
    reviewedOn: TODAY,
  });
  assert(refused(PILOT_ARGS.filter((a) => a !== "--values-checked")));
  assert(refused(PILOT_ARGS.filter((a) => !a.startsWith("--reviewed-by"))));
  assert(refused(PILOT_ARGS.filter((a) => !a.startsWith("--reviewed-on"))));
  const withDate = (date: string) => [...PILOT_ARGS.slice(0, 4), `--reviewed-on=${date}`];
  assert(refused(withDate("2026-11-05")), "the future");
  assert(refused(withDate("2026-02-31")), "not a real date");
  assert(refused(withDate("04-11-2026")));
  const withName = (name: string) => [
    PILOT_ARGS[0],
    CONFIRM,
    "--values-checked",
    `--reviewed-by=${name}`,
    `--reviewed-on=${TODAY}`,
  ];
  assert(refused(withName("")));
  assert(refused(withName("A".repeat(21))));
  assert(refused(withName("<script>")));
});

Deno.test("STORE: only IT HUB's store, whatever the settings say", async () => {
  assertStore(ALLOWED_STORE);
  for (const domain of ["", "other.myshopify.com", `${ALLOWED_STORE}.evil.example`, "IT-HUB"]) {
    let threw = false;
    try {
      assertStore(domain);
    } catch {
      threw = true;
    }
    assert(threw, domain);
  }
  const shopify = standIn();
  await assertRejects(() =>
    run({
      domain: "other.myshopify.com",
      token: TOKEN,
      options: { mode: "definitions" },
      fetchFn: shopify.fetchFn,
      log: () => {},
    }),
  );
  assertEquals(shopify.requests.length, 0, "nothing is sent to the wrong store");
});

// ── The credential ──────────────────────────────────────────────────────────────────────────────

Deno.test("SCOPE: writing refuses a credential that can do more than this needs", async () => {
  const shopify = standIn({ scopes: ["read_products", "write_products", "write_orders"] });
  const message = await stopped("definitions", shopify);
  assert(message.includes("write_orders"));
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("SCOPE: writing refuses a credential with no write access, before trying", async () => {
  const shopify = standIn({ scopes: ["read_products"] });
  assert((await stopped("definitions", shopify)).includes("write_products"));
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("SCOPE: writing refuses when the scopes can't be confirmed", async () => {
  const shopify = standIn({ scopesRefused: true });
  await stopped("definitions", shopify);
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("SCOPE: reading only warns about a wider credential, and carries on", async () => {
  const shopify = standIn({ scopes: ["read_products", "write_orders"] });
  const { lines } = await go("plan", shopify);
  assert(lines.some((line: string) => line.startsWith("WARNING")));
});

Deno.test("CREDENTIAL: sent only in Shopify's header, to the store, and never printed", async () => {
  const shopify = standIn();
  const { lines } = await go("definitions", shopify);
  for (const request of shopify.requests) {
    assertEquals(request.headers["X-Shopify-Access-Token"], TOKEN);
    assertEquals(request.url, `https://${ALLOWED_STORE}/admin/api/2026-10/graphql.json`);
    assert(!request.url.includes(TOKEN));
    assert(!JSON.stringify(request.variables).includes(TOKEN));
    assertEquals(request.redirect, "error", "a token must not follow a redirect");
  }
  assert(!lines.join("\n").includes(TOKEN));
});

Deno.test("CREDENTIAL: a refused credential stops the run, and isn't in the message", async () => {
  for (const status of [401, 403]) {
    const message = await stopped("definitions", standIn({ status }));
    assert(!message.includes(TOKEN));
  }
});

Deno.test("CREDENTIAL: credentials come only from the environment, and aren't logged", () => {
  assert(!source.includes("readTextFile"));
  assert(!source.includes('".env'));
  assert(!/shpat_|shpss_/.test(source));
  assert(!/console\.\w+\([^)]*(?:adminToken|clientSecret|clientId|token\b)/.test(source));
  assert(!/log\([^)]*deps\.token/.test(source));
});

Deno.test("CREDENTIAL: the default sender refuses redirects", async () => {
  const realFetch = globalThis.fetch;
  let seen: RequestInit | undefined;
  globalThis.fetch = (async (_input: unknown, init: RequestInit) => {
    seen = init;
    return new Response("{}");
  }) as typeof fetch;
  try {
    await refusingRedirects("https://example.invalid/", { method: "POST" });
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(seen?.redirect, "error");
});

// ── Creating definitions ────────────────────────────────────────────────────────────────────────

Deno.test("CREATE: an empty store ends with exactly the 38, all matching", async () => {
  const shopify = standIn();
  const { outcome } = await go("definitions", shopify);
  assertEquals(outcome.created.length, 38);
  assertEquals(shopify.definitions.size, 38);
  assertEquals([...shopify.definitions.keys()].sort(), Object.keys(APPROVED).sort());
  assert(!shopify.definitions.has("pcie_connectors"));
  assert(!shopify.definitions.has("exact_model"));
  const findings = compareDefinitions(
    [...shopify.definitions.values()].map((d) => ({
      namespace: d.namespace,
      key: d.key,
      type: d.type,
      validations: d.validations,
      storefrontAccess: d.access.storefront,
    })),
  );
  assertEquals(findings.length, 38);
  assert(findings.every((f: any) => f.status === "matches"));
});

Deno.test("CREATE: never sets admin access, which Shopify refuses here", async () => {
  const shopify = standIn();
  await go("definitions", shopify);
  for (const request of mutations(shopify)) {
    assertEquals(request.variables.definition.access.admin, undefined);
  }
});

Deno.test("CREATE: running twice creates nothing the second time", async () => {
  const shopify = standIn();
  await go("definitions", shopify);
  const before = mutations(shopify).length;
  const { outcome } = await go("definitions", shopify);
  assertEquals(mutations(shopify).length, before);
  assertEquals(outcome.created, []);
  assertEquals(outcome.skipped.length, 38);
});

Deno.test("CREATE: a run stopped halfway can be finished safely", async () => {
  const shopify = standIn({ failCreateOn: "watts" });
  await stopped("definitions", shopify);
  const partial = shopify.definitions.size;
  assert(partial > 0 && partial < 38);
  assert(!shopify.definitions.has("watts"));
  const retry = standIn({ definitions: [...shopify.definitions.values()] });
  const { outcome } = await go("definitions", retry);
  assertEquals(outcome.skipped.length, partial);
  assertEquals(outcome.created.length, 38 - partial);
});

const LISTS = ["supported_motherboards", "supported_ram_generations", "supported_sockets"];

Deno.test("CREATE: if Shopify refuses choices on lists, they're created without them", async () => {
  const shopify = standIn({ rejectListChoices: true });
  const { outcome, lines } = await go("definitions", shopify);
  assertEquals(shopify.definitions.size, 38);
  assertEquals(outcome.created.length, 38);
  assertEquals([...outcome.createdWithoutChoices].sort(), LISTS);
  for (const key of LISTS) {
    assertEquals(shopify.definitions.get(key).validations, []);
    assertEquals(shopify.definitions.get(key).type, LIST);
    assertEquals(shopify.definitions.get(key).access.storefront, "PUBLIC_READ");
  }
  assert(lines.some((line: string) => line.includes("Created without choices")));
  // Only the lists lose them.
  const socket = shopify.definitions.get("socket");
  assert(socket.validations.some((v: any) => v.name === "choices"));
});

Deno.test("CREATE: lists Shopify accepts keep their choices", async () => {
  const shopify = standIn();
  const { outcome } = await go("definitions", shopify);
  assertEquals(outcome.createdWithoutChoices, []);
  for (const key of LISTS) {
    assert(shopify.definitions.get(key).validations.some((v: any) => v.name === "choices"));
  }
});

Deno.test("CREATE: a run with lists created without choices can be run again safely", async () => {
  const shopify = standIn({ rejectListChoices: true });
  await go("definitions", shopify);
  const before = mutations(shopify).length;
  const { outcome } = await go("definitions", shopify);
  assertEquals(mutations(shopify).length, before);
  assertEquals(outcome.skipped.length, 38);
});

Deno.test("CREATE: any other refusal on a list still stops the run", async () => {
  for (const code of ["TAKEN", "LIMIT_EXCEEDED", "RESOURCE_TYPE_LIMIT_EXCEEDED", "TOO_LONG"]) {
    const shopify = standIn({ rejectListChoices: true, listRefusalCode: code });
    const message = await stopped("definitions", shopify);
    assert(message.includes(code), message);
    assertEquals(shopify.definitions.size, 0, code);
    assertEquals(mutations(shopify).length, 1, code);
  }
});

Deno.test("CREATE: a text definition never loses its choices", async () => {
  const shopify = standIn({ failCreateOn: "socket" });
  await stopped("definitions", shopify);
  const creates = mutations(shopify).filter((r) => r.variables.definition.key === "socket");
  assertEquals(creates.length, 1, "no second attempt");
  assert(!shopify.definitions.has("socket"));
});

Deno.test("CREATE: if a list is refused without choices too, the run stops", async () => {
  const shopify = standIn({ rejectListChoices: true, refuseListOutright: true });
  assert((await stopped("definitions", shopify)).includes("not this time either"));
  assertEquals(shopify.definitions.size, 0);
  assertEquals(mutations(shopify).length, 2, "one attempt with choices and one without");
});

Deno.test("AUDIT: a list without choices matches, and says so", () => {
  const list = TO_CREATE.find((f: any) => f.key === "supported_sockets")!;
  const row = (validations: any[]) =>
    compareDefinitions([
      {
        namespace: "pc_builder",
        key: list.key,
        type: LIST,
        storefrontAccess: "PUBLIC_READ",
        validations,
      },
    ]).find((f: any) => f.key === list.key);
  const without = row([]);
  assertEquals(without?.status, "matches");
  assert(without?.detail.includes("without choices"));
  // Choices that are there must be the right ones.
  assertEquals(row([{ name: "choices", value: '["AM4"]' }])?.status, "different_validation");
  assertEquals(row([{ name: "choices", value: JSON.stringify(SOCKETS) }])?.detail, "as proposed");
});

Deno.test("AUDIT: text with its choices missing is still a difference", () => {
  const status = compareDefinitions([
    {
      namespace: "pc_builder",
      key: "socket",
      type: TEXT,
      storefrontAccess: "PUBLIC_READ",
      validations: [],
    },
  ]).find((f: any) => f.key === "socket")?.status;
  assertEquals(status, "different_validation");
});

Deno.test("BUILDER: without Shopify's choices, a value outside a list still isn't used", () => {
  const cases: [string, string, string, string][] = [
    ["CPU", "supported_ram_generations", "DDR3", "supportedRamGen"],
    ["Cabinet", "supported_motherboards", "Nano-ITX", "supportedMotherboards"],
    ["Cooler", "supported_sockets", "TR5", "supportedSockets"],
  ];
  for (const [slot, key, bad, field] of cases) {
    const { specs, problems } = readStatedSpecs(slot as any, { [key]: JSON.stringify([bad]) });
    assertEquals((specs as any)[field], undefined, key);
    assert(
      problems.some((p: any) => p.kind === "invalid"),
      key,
    );
  }
});

Deno.test("PILOT: still works on lists created without choices", async () => {
  const shopify = standIn({ rejectListChoices: true });
  await go("definitions", shopify);
  const { outcome } = await go(PILOT_OPTIONS, shopify);
  assertEquals(outcome.pilotSet, true);
  assertEquals(shopify.pilot.get("supported_ram_generations"), '["DDR4"]');
});

Deno.test("CREATE: stops before writing if an existing definition differs", async () => {
  const wrong = all38().filter((d: any) => d.key === "watts");
  wrong[0] = { ...wrong[0], type: TEXT };
  const shopify = standIn({ definitions: wrong });
  assert((await stopped("definitions", shopify)).includes("nothing was created"));
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("CREATE: stops before writing if storefront access or limits differ", async () => {
  const closed = { ...asDefinition(TO_CREATE.find((f: any) => f.key === "socket")) };
  closed.access = { storefront: "NONE" };
  const first = standIn({ definitions: [closed] });
  await stopped("definitions", first);
  assertEquals(mutations(first).length, 0);
  const narrower = { ...asDefinition(TO_CREATE.find((f: any) => f.key === "ram_slots")) };
  narrower.validations = [
    { name: "min", value: "1" },
    { name: "max", value: "4" },
  ];
  const second = standIn({ definitions: [narrower] });
  await stopped("definitions", second);
  assertEquals(mutations(second).length, 0);
});

Deno.test("CREATE: stops before writing if an unknown pc_builder definition exists", async () => {
  const shopify = standIn({
    definitions: [
      {
        namespace: "pc_builder",
        key: "mystery",
        type: TEXT,
        validations: [],
        access: { storefront: "NONE" },
      },
    ],
  });
  await stopped("definitions", shopify);
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("CREATE: reads back what Shopify stored, and says if it isn't right", async () => {
  const shopify = standIn({ dropValidationOn: "ram_slots" });
  assert((await stopped("definitions", shopify)).includes("ram_slots"));
});

Deno.test("CREATE: waits and retries when Shopify says to slow down", async () => {
  const shopify = standIn({ throttleOnce: true });
  const { waits, outcome } = await go("definitions", shopify);
  assertEquals(waits, [1000]);
  assertEquals(outcome.created.length, 38);
});

// ── The pilot ───────────────────────────────────────────────────────────────────────────────────

Deno.test("PILOT: the planned values, on the planned product", () => {
  assertEquals(PILOT.productId, "gid://shopify/Product/15452073165044");
  assertEquals(PILOT.title, "AMD Ryzen 5 5600");
  const inputs = pilotInputs("AK", TODAY);
  assertEquals(inputs.length, 10);
  assert(inputs.length <= 25, "Shopify's limit for one call");
  const by = Object.fromEntries(inputs.map((i: any) => [i.key, i.value]));
  assertEquals(by, {
    socket: "AM4",
    watts: "65",
    integrated_graphics: "false",
    includes_cooler: "true",
    supported_ram_generations: '["DDR4"]',
    spec_source: "manufacturer_datasheet",
    spec_review_status: "reviewed",
    spec_source_url: PILOT.sourceUrl,
    spec_reviewed_on: TODAY,
    spec_reviewed_by: "AK",
  });
  for (const input of inputs) {
    assertEquals(input.ownerId, PILOT.productId);
    assertEquals(input.namespace, "pc_builder");
    assertEquals(input.compareDigest, null);
    assertEquals(input.type, APPROVED[input.key].type, input.key);
  }
});

Deno.test("PILOT: sets the values together, passes Shopify's rules, and reads them back", async () => {
  const shopify = standIn({ definitions: all38() });
  const { outcome } = await go(PILOT_OPTIONS, shopify);
  assertEquals(outcome.pilotSet, true);
  assertEquals(mutations(shopify).length, 1, "one call, so it's all or nothing");
  assertEquals(shopify.pilot.size, 10);
  assertEquals(shopify.pilot.get("socket"), "AM4");
});

Deno.test("PILOT: refuses until the definitions are in place", async () => {
  const shopify = standIn({ definitions: all38().filter((d: any) => d.key !== "socket") });
  assert((await stopped(PILOT_OPTIONS, shopify)).includes("socket"));
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("PILOT: refuses if the product has changed", async () => {
  const shopify = standIn({ definitions: all38(), title: "Something else" });
  assert((await stopped(PILOT_OPTIONS, shopify)).includes("Something else"));
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("PILOT: never overwrites a value someone has already entered", async () => {
  const shopify = standIn({ definitions: all38(), pilotValues: { socket: "AM5" } });
  assert((await stopped(PILOT_OPTIONS, shopify)).includes("already holds"));
  assertEquals(mutations(shopify).length, 0);
  assertEquals(shopify.pilot.get("socket"), "AM5");
});

Deno.test("PILOT: a refusal from Shopify stops the run, and says why", async () => {
  const shopify = standIn({ definitions: all38(), refusePilot: true });
  const message = await stopped(PILOT_OPTIONS, shopify);
  assert(message.includes("Shopify refused the pilot values"), message);
  assert(message.includes("INVALID_VALUE"), message);
  assertEquals(shopify.pilot.size, 0);
});

Deno.test("PILOT: a value read back differently is reported", async () => {
  const shopify = standIn({ definitions: all38(), misreadPilot: true });
  assert((await stopped(PILOT_OPTIONS, shopify)).includes("watts"));
});

// ── What the pilot does to the builder ──────────────────────────────────────────────────────────

const rawPilotSpecs = () =>
  Object.fromEntries(pilotInputs("AK", TODAY).map((input: any) => [input.key, input.value]));
const shopifyProduct = (name: string, price: number, specs: any = {}): any => ({
  id: `gid://shopify/Product/${name}`,
  name,
  handle: name,
  price,
  tags: [],
  variantId: `gid://shopify/ProductVariant/${name}`,
  availableForSale: true,
  stock: 5,
  specs,
});

Deno.test("EFFECT: Shopify's own value shapes read correctly through the real mapper", () => {
  // The Storefront API returns every value as a string, and never returns the reviewer's initials.
  const metafields = pilotInputs("AK", TODAY)
    .filter((input: any) => input.key !== "spec_reviewed_by")
    .map((input: any) => ({ namespace: input.namespace, key: input.key, value: input.value }));
  const specs = parseProductSpecs([], metafields as any);
  const part = matchShopifyProductToComponent(shopifyProduct(PILOT.title, 9000, specs)) as any;
  const without = matchShopifyProductToComponent(shopifyProduct(PILOT.title, 9000)) as any;
  assertEquals(part.specs.specProblems, undefined);
  assertEquals(part.specs, without.specs);
  // The same values on a product the list doesn't know are read, and count as IT HUB's review.
  const unknown = matchShopifyProductToComponent({
    ...shopifyProduct("Vendor Processor", 9000, specs),
    category: "Computer Processors",
  }) as any;
  assertEquals(unknown.specs.socket, "AM4");
  assertEquals(unknown.specs.tdpWatts, 65);
  assertEquals(unknown.specs.hasIntegratedGraphics, false);
  assertEquals(unknown.specs.includesCooler, true);
  assertEquals(unknown.specs.supportedRamGen, ["DDR4"]);
  assertEquals(unknown.specs.fieldSources.socket, "it_hub_reviewed");
  assertEquals(unknown.specs.specProblems, undefined);
});

Deno.test("EFFECT: the pilot's values agree with the specification list, with no problems", () => {
  const without = matchShopifyProductToComponent(shopifyProduct(PILOT.title, 9000)) as any;
  const withValues = matchShopifyProductToComponent(
    shopifyProduct(PILOT.title, 9000, rawPilotSpecs()),
  ) as any;
  assertEquals(withValues.specs.specProblems, undefined);
  assertEquals(withValues.matchedModelKey, "cpu-r5-5600");
  assertEquals(withValues.specs, without.specs);
});

const LIVE_STYLE = (specs: any) => [
  shopifyProduct(PILOT.title, 9000, specs),
  shopifyProduct("B550M DDR4 Motherboard", 7000),
  shopifyProduct("16GB DDR4 Desktop RAM", 3000),
  shopifyProduct("NVIDIA RTX 4060 8GB", 28000),
  shopifyProduct("SANDISK Optimus 5100 NVMe SSD, 500GB", 11000),
  shopifyProduct("Ant Esports VS400L Value Series Power Supply", 1000),
  shopifyProduct("Zebronics Zeb Twoface New Premium Gaming Mini Cabinet-White", 2100),
];

Deno.test("EFFECT: a customer's builds are the same with or without the pilot's values", () => {
  const answers = {
    purpose: "gaming",
    details: {},
    budgetId: "60-80",
    brands: [],
    wifi: "",
    owned: [],
  };
  const offer = (specs: any) =>
    generateDynamicCatalogRecommendations(
      syncBuilderCatalogWithShopify(LIVE_STYLE(specs)).componentCatalog,
      answers,
      { min: 60000, max: 80000 },
      { allowUnverified: true },
    ).map((b: any) => ({
      price: b.price,
      requiresReview: b.requiresReview,
      badge: b.confidenceBadge,
      label: b.tradeoffLabel,
      reasons: b.rankingReasons,
      notes: b.purposeNotes,
      parts: Object.fromEntries(Object.entries(b.parts).map(([k, v]: any) => [k, v.name])),
    }));
  const before = offer({});
  assert(before.length > 0);
  assertEquals(offer(rawPilotSpecs()), before);
});

// ── Rolling back ────────────────────────────────────────────────────────────────────────────────

Deno.test("ROLLBACK: removes the definitions and the pilot's values", async () => {
  const shopify = standIn({ definitions: all38() });
  await go(PILOT_OPTIONS, shopify);
  const { outcome } = await go("rollback", shopify);
  assertEquals(outcome.deleted.length, 38);
  assertEquals(shopify.definitions.size, 0);
  assertEquals(shopify.pilot.size, 0);
  for (const request of mutations(shopify).filter((r) => r.query.includes("Delete"))) {
    assertEquals(request.variables.identifier.ownerType, "PRODUCT");
    assertEquals(request.variables.identifier.namespace, "pc_builder");
  }
});

Deno.test("ROLLBACK: refuses if any value exists outside the pilot, and deletes nothing", async () => {
  const shopify = standIn({ definitions: all38(), valuesElsewhere: { capacity_watts: 3 } });
  assert((await stopped("rollback", shopify)).includes("capacity_watts"));
  assertEquals(mutations(shopify).length, 0);
  assertEquals(shopify.definitions.size, 38);
});

Deno.test("ROLLBACK: even one value elsewhere, on a key the pilot doesn't use, blocks it", async () => {
  const shopify = standIn({ definitions: all38(), valuesElsewhere: { capacity_watts: 1 } });
  assert((await stopped("rollback", shopify)).includes("capacity_watts"));
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("ROLLBACK: a second value on a pilot key counts as outside the pilot", async () => {
  const shopify = standIn({
    definitions: all38(),
    pilotValues: { socket: "AM4" },
    valuesElsewhere: { socket: 1 },
  });
  await stopped("rollback", shopify);
  assertEquals(mutations(shopify).length, 0);
});

Deno.test("ROLLBACK: refuses to touch a definition this script doesn't know", async () => {
  const shopify = standIn({
    definitions: [
      ...all38(),
      {
        namespace: "pc_builder",
        key: "mystery",
        type: TEXT,
        validations: [],
        access: { storefront: "NONE" },
      },
    ],
  });
  assert((await stopped("rollback", shopify)).includes("mystery"));
  assertEquals(mutations(shopify).length, 0);
});

// ── The audit agrees ────────────────────────────────────────────────────────────────────────────

Deno.test("AUDIT: a key that isn't created isn't reported missing, but is checked if it appears", () => {
  const none = compareDefinitions([]);
  assertEquals(none.length, 38);
  assert(none.every((f: any) => f.status === "missing"));
  assert(!none.some((f: any) => f.key === "pcie_connectors" || f.key === "exact_model"));
  const appeared = compareDefinitions([
    {
      namespace: "pc_builder",
      key: "exact_model",
      type: "number_integer",
      storefrontAccess: "PUBLIC_READ",
    },
  ]);
  assertEquals(appeared.find((f: any) => f.key === "exact_model")?.status, "wrong_type");
});

Deno.test("AUDIT: a different length limit on the reviewer's initials is noticed", () => {
  const initials = TO_CREATE.find((f: any) => f.key === "spec_reviewed_by")!;
  const base = {
    namespace: "pc_builder",
    key: "spec_reviewed_by",
    type: TEXT,
    storefrontAccess: "NONE",
  };
  const status = (validations: any[]) =>
    compareDefinitions([{ ...base, validations }]).find((f: any) => f.key === initials.key)?.status;
  assertEquals(status([{ name: "max", value: "20" }]), "matches");
  assertEquals(status([{ name: "max", value: "200" }]), "different_validation");
  assertEquals(status([]), "different_validation");
});

// ── A BIOS warning works on either maker's board ────────────────────────────────────────────────

Deno.test("BIOS: a stated need warns on an Intel board and an AMD board alike", () => {
  const component = (slot: string, specs: any) => ({ slot, title: slot, specs }) as any;
  const check = (socket: string, stated: string) => {
    const board = matchShopifyProductToComponent({
      ...shopifyProduct("Vendor Motherboard", 5000, {
        socket,
        ram_generation: "DDR5",
        bios_update_required: stated,
      }),
    }) as any;
    const items = checkCompatibility({
      CPU: component("CPU", { socket }),
      Motherboard: board,
    }).items;
    return items.some((item: any) => item.ruleId === "RULE_A_BIOS_UPDATE");
  };
  assert(check("LGA1700", "true"));
  assert(check("AM4", "true"));
  assert(!check("LGA1700", "false"));
  assert(!check("AM4", "false"));
});
