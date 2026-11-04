// scripts/shopify-create-pc-builder-definitions.ts
// Creates the pc_builder product metafield definitions, then sets one pilot product's values.
//
// With no options this only reads, and says what it would do. Writing needs an explicit option and the
// store's name retyped. It works on one store, in one namespace, on products. It can create definitions,
// set the pilot values, or roll those back. It never updates a definition or changes anything else.
//
//   deno run --no-lock --no-prompt --unstable-sloppy-imports \
//     --allow-env=SHOPIFY_STORE_DOMAIN,SHOPIFY_ADMIN_TOKEN,SHOPIFY_CLIENT_ID,SHOPIFY_CLIENT_SECRET,SHOPIFY_API_VERSION \
//     --allow-net=<the store> scripts/shopify-create-pc-builder-definitions.ts [options]
//
//   (no options)            Read only. Lists what's there and what would be created.
//   --apply-definitions     Creates what's missing. Needs --confirm-store=<the store>.
//   --apply-pilot           Sets the pilot values. Needs --confirm-store=<the store>,
//                           --values-checked, --reviewed-by=<initials> and --reviewed-on=<YYYY-MM-DD>.
//   --rollback              Removes the definitions and the pilot's values. Needs
//                           --confirm-store=<the store> and --confirm-rollback. Refuses if any value
//                           exists outside the pilot product.
//
// Credentials come from the environment only: SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, or
// SHOPIFY_ADMIN_TOKEN. Exit codes: 0 finished, 1 stopped by Shopify or a check, 2 nothing was sent.

import {
  compareDefinitions,
  definitionCreateInput,
  PC_BUILDER_DEFINITIONS_TO_CREATE,
  PC_BUILDER_METAFIELDS,
  PC_BUILDER_NAMESPACE,
  type AdminMetafieldDefinition,
  type DefinitionFinding,
  type MetafieldDefinition,
} from "../src/lib/builder/spec-schema.ts";
import { requestShortLivedToken } from "./shopify-admin-metafield-audit.ts";

export const ALLOWED_STORE = "it-hub-m8tzfzjd.myshopify.com";
export const API_VERSION = "2026-10";
const ALLOWED_SCOPES = new Set(["read_products", "write_products"]);

/** Values read on AMD's page, and already on the specification list, so customers should see no change. */
export const PILOT = {
  productId: "gid://shopify/Product/15452073165044",
  title: "AMD Ryzen 5 5600",
  sourceUrl:
    "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html",
  specs: {
    socket: "AM4",
    watts: "65",
    integrated_graphics: "false",
    includes_cooler: "true",
    supported_ram_generations: JSON.stringify(["DDR4"]),
  } as Record<string, string>,
};

const SCOPES_QUERY = `query Scopes {
  currentAppInstallation { accessScopes { handle } }
}`;
const DEFINITIONS_QUERY = `query Definitions($cursor: String) {
  metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "${PC_BUILDER_NAMESPACE}", after: $cursor) {
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
const PILOT_QUERY = `query PilotProduct($id: ID!) {
  product(id: $id) {
    id
    title
    metafields(first: 50, namespace: "${PC_BUILDER_NAMESPACE}") { nodes { key value } }
  }
}`;
const CREATE_MUTATION = `mutation CreateDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id key }
    userErrors { field message code }
  }
}`;
const SET_MUTATION = `mutation SetPilotValues($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { key value }
    userErrors { field message code }
  }
}`;
const DELETE_MUTATION = `mutation DeleteDefinition($identifier: MetafieldDefinitionIdentifierInput!) {
  metafieldDefinitionDelete(identifier: $identifier, deleteAllAssociatedMetafields: true) {
    deletedDefinitionId
    userErrors { field message code }
  }
}`;

const READS = new Set([SCOPES_QUERY, DEFINITIONS_QUERY, PILOT_QUERY]);
const WRITES = new Set([CREATE_MUTATION, SET_MUTATION, DELETE_MUTATION]);

/** The only operations this script can send, whatever else goes wrong. */
export const ALLOWED_OPERATIONS = [...READS, ...WRITES];

/** A hard stop before anything leaves this machine. */
export function assertAllowedOperation(text: string, writesAllowed: boolean) {
  if (READS.has(text)) return;
  if (!WRITES.has(text)) throw new Stop("Refused: this isn't one of this script's operations.");
  if (!writesAllowed) throw new Stop("Refused: this run was only allowed to read.");
}

/** Stops the run on purpose, with the reason. */
export class Stop extends Error {}

export type Mode = "plan" | "definitions" | "pilot" | "rollback";

export interface Options {
  mode: Mode;
  reviewedBy?: string;
  reviewedOn?: string;
}

/** Reads the command line. Anything unknown or missing stops the run before anything is sent. */
export function parseOptions(args: string[], today: string): Options {
  const flags = new Map<string, string | true>();
  for (const arg of args) {
    const match = arg.match(/^(--[a-z-]+)(?:=(.*))?$/);
    if (!match) throw new Stop(`Unknown option: ${arg}`);
    flags.set(match[1], match[2] ?? true);
  }
  const known = new Set([
    "--apply-definitions",
    "--apply-pilot",
    "--rollback",
    "--confirm-store",
    "--confirm-rollback",
    "--values-checked",
    "--reviewed-by",
    "--reviewed-on",
  ]);
  for (const flag of flags.keys()) {
    if (!known.has(flag)) throw new Stop(`Unknown option: ${flag}`);
  }
  const chosen = ["--apply-definitions", "--apply-pilot", "--rollback"].filter((f) => flags.has(f));
  if (chosen.length > 1)
    throw new Stop("Choose one of --apply-definitions, --apply-pilot, --rollback.");
  if (chosen.length === 0) {
    if (flags.size > 0) throw new Stop("These options only apply to a run that writes.");
    return { mode: "plan" };
  }
  if (flags.get("--confirm-store") !== ALLOWED_STORE) {
    throw new Stop(`Writing needs --confirm-store=${ALLOWED_STORE}.`);
  }
  if (chosen[0] === "--apply-definitions") return { mode: "definitions" };
  if (chosen[0] === "--rollback") {
    if (!flags.has("--confirm-rollback")) throw new Stop("Rolling back needs --confirm-rollback.");
    return { mode: "rollback" };
  }
  if (!flags.has("--values-checked")) {
    throw new Stop(
      "The pilot needs --values-checked: someone must check the values against the source.",
    );
  }
  const reviewedBy = String(flags.get("--reviewed-by") ?? "").trim();
  if (!/^[A-Za-z][A-Za-z .-]{0,19}$/.test(reviewedBy)) {
    throw new Stop("The pilot needs --reviewed-by=<initials>, up to 20 letters.");
  }
  const reviewedOn = String(flags.get("--reviewed-on") ?? "");
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(reviewedOn) &&
    new Date(`${reviewedOn}T00:00:00Z`).toISOString().slice(0, 10) === reviewedOn;
  if (!validDate || reviewedOn > today) {
    throw new Stop("The pilot needs --reviewed-on=<YYYY-MM-DD>, and it can't be in the future.");
  }
  return { mode: "pilot", reviewedBy, reviewedOn };
}

/** The settings a run can't start without, checked before anything is sent. */
export function assertStore(domain: string) {
  if (domain !== ALLOWED_STORE) {
    throw new Stop(
      `This script only works on ${ALLOWED_STORE}. SHOPIFY_STORE_DOMAIN says otherwise.`,
    );
  }
}

/** Lists first, because a rejection there means nothing else has been created to clean up. */
export function createOrder(fields: MetafieldDefinition[]): MetafieldDefinition[] {
  const unproven = (field: MetafieldDefinition) =>
    field.type.startsWith("list.") && Boolean(field.choices);
  return [...fields.filter(unproven), ...fields.filter((field) => !unproven(field))];
}

export function pilotInputs(reviewedBy: string, reviewedOn: string) {
  const definitionFor = (key: string) => PC_BUILDER_METAFIELDS.find((field) => field.key === key)!;
  const values: Record<string, string> = {
    ...PILOT.specs,
    spec_source: "manufacturer_datasheet",
    spec_review_status: "reviewed",
    spec_source_url: PILOT.sourceUrl,
    spec_reviewed_on: reviewedOn,
    spec_reviewed_by: reviewedBy,
  };
  return Object.entries(values).map(([key, value]) => ({
    ownerId: PILOT.productId,
    namespace: PC_BUILDER_NAMESPACE,
    key,
    type: definitionFor(key).type,
    value,
    // Null means this must not exist yet, so a value someone has entered can't be overwritten.
    compareDigest: null,
  }));
}

export interface Deps {
  domain: string;
  token: string;
  options: Options;
  fetchFn?: typeof fetch;
  log?: (line: string) => void;
  wait?: (ms: number) => Promise<void>;
}

interface ListedDefinition extends AdminMetafieldDefinition {
  metafieldsCount: number;
}

const BLOCKING: DefinitionFinding["status"][] = [
  "wrong_type",
  "wrong_access",
  "different_validation",
  "unexpected",
];

/** The refusals that can mean Shopify won't take choices on a list. Anything else still stops the run. */
const CHOICES_REFUSAL_CODES = new Set(["INVALID_OPTION", "INVALID", "INCLUSION"]);

export interface Outcome {
  created: string[];
  createdWithoutChoices: string[];
  skipped: string[];
  deleted: string[];
  pilotSet: boolean;
}

export async function run(deps: Deps): Promise<Outcome> {
  const fetchFn = deps.fetchFn ?? refusingRedirects;
  const log = deps.log ?? console.log;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const { mode } = deps.options;
  const writes = mode !== "plan";
  const outcome: Outcome = {
    created: [],
    createdWithoutChoices: [],
    skipped: [],
    deleted: [],
    pilotSet: false,
  };

  assertStore(deps.domain);

  async function send(text: string, variables: Record<string, unknown> = {}): Promise<any> {
    assertAllowedOperation(text, writes);
    for (let attempt = 0; ; attempt++) {
      const response = await fetchFn(
        `https://${deps.domain}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": deps.token },
          body: JSON.stringify({ query: text, variables }),
          redirect: "error",
        },
      );
      if (response.status === 429 && attempt < 5) {
        await wait(2000);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Stop(`Shopify refused the credential (${response.status}).`);
      }
      if (!response.ok) throw new Stop(`Shopify answered ${response.status}.`);
      const body = await response.json();
      // A throttled request wasn't carried out, so sending it again can't do anything twice.
      const throttled = body.errors?.some?.((e: any) => e?.extensions?.code === "THROTTLED");
      if (throttled && attempt < 5) {
        const needed = body.extensions?.cost?.requestedQueryCost ?? 1000;
        const restore = body.extensions?.cost?.throttleStatus?.restoreRate || 50;
        await wait(Math.ceil((needed / restore) * 1000));
        continue;
      }
      if (body.errors) throw new Stop(JSON.stringify(body.errors).slice(0, 500));
      return body.data;
    }
  }

  async function listDefinitions(): Promise<ListedDefinition[]> {
    const listed: ListedDefinition[] = [];
    let cursor: string | null = null;
    do {
      const data: any = await send(DEFINITIONS_QUERY, { cursor });
      for (const node of data.metafieldDefinitions.nodes) {
        listed.push({
          namespace: node.namespace,
          key: node.key,
          type: node.type.name,
          validations: node.validations,
          storefrontAccess: node.access?.storefront,
          metafieldsCount: node.metafieldsCount,
        });
      }
      cursor = data.metafieldDefinitions.pageInfo.hasNextPage
        ? data.metafieldDefinitions.pageInfo.endCursor
        : null;
    } while (cursor);
    return listed;
  }

  async function checkScopes() {
    let scopes: string[] | undefined;
    try {
      const data = await send(SCOPES_QUERY);
      scopes = (data.currentAppInstallation?.accessScopes || []).map((s: any) => s.handle);
    } catch (error) {
      if (writes)
        throw new Stop(`Couldn't confirm this credential's scopes, so nothing was written.`);
      log(`Couldn't read this credential's scopes: ${(error as Error).message}`);
    }
    if (!scopes) return;
    log(`Credential scopes: ${scopes.join(", ") || "none reported"}`);
    const extra = scopes.filter((scope) => !ALLOWED_SCOPES.has(scope));
    if (extra.length > 0) {
      const message = `This credential can do more than this needs (${extra.join(", ")}).`;
      if (writes) throw new Stop(`${message} Use one with only read_products and write_products.`);
      log(`WARNING: ${message}`);
    }
    if (writes && !scopes.includes("write_products")) {
      throw new Stop("This credential doesn't have write_products, so nothing was written.");
    }
  }

  const readPilotProduct = async () => {
    const data = await send(PILOT_QUERY, { id: PILOT.productId });
    const product = data.product;
    if (!product) throw new Stop(`The pilot product ${PILOT.productId} wasn't found.`);
    if (product.title !== PILOT.title) {
      throw new Stop(`The pilot product is now called "${product.title}", not "${PILOT.title}".`);
    }
    return product as { title: string; metafields: { nodes: { key: string; value: string }[] } };
  };

  const stopOnUserErrors = (errors: any[] | undefined, what: string) => {
    if (errors && errors.length > 0) {
      const detail = errors
        .map((e) => `${e.code ?? "ERROR"} ${(e.field || []).join(".")}: ${e.message}`)
        .join("; ");
      throw new Stop(`Shopify refused ${what}: ${detail}`);
    }
  };

  await checkScopes();
  const listed = await listDefinitions();
  const findings = compareDefinitions(listed);
  const blockers = findings.filter((finding) => BLOCKING.includes(finding.status));
  const missing = findings.filter((finding) => finding.status === "missing");
  const matching = findings.filter((finding) => finding.status === "matches");
  log(`Store: ${deps.domain}`);
  log(`Matching: ${matching.length}. Missing: ${missing.length}. Blocking: ${blockers.length}.`);
  for (const finding of blockers)
    log(`  BLOCKING ${finding.key}: [${finding.status}] ${finding.detail}`);

  if (mode === "plan") {
    const order = createOrder(
      PC_BUILDER_DEFINITIONS_TO_CREATE.filter((f) => missing.some((m) => m.key === f.key)),
    );
    log(`\nWould create ${order.length} definitions, in this order:`);
    for (const field of order) {
      const input = definitionCreateInput(field);
      log(`  ${input.key} [${input.type}] storefront=${input.access.storefront}`);
    }
    log("\nRead-only: nothing was changed in Shopify.");
    return outcome;
  }

  if (mode === "definitions") {
    if (blockers.length > 0) {
      throw new Stop("Existing definitions differ from the schema, so nothing was created.");
    }
    outcome.skipped = matching.map((finding) => finding.key);
    const order = createOrder(
      PC_BUILDER_DEFINITIONS_TO_CREATE.filter((f) => missing.some((m) => m.key === f.key)),
    );
    for (const field of order) {
      let data: any;
      try {
        const input = definitionCreateInput(field);
        data = await send(CREATE_MUTATION, { definition: input });
        const errors: any[] = data.metafieldDefinitionCreate.userErrors || [];
        const isList = field.type.startsWith("list.") && Boolean(field.choices);
        if (isList && errors.length > 0 && errors.every((e) => CHOICES_REFUSAL_CODES.has(e.code))) {
          log(
            `  Shopify refused choices on ${field.key} (${errors[0].code}). Creating it without them.`,
          );
          data = await send(CREATE_MUTATION, {
            definition: {
              ...input,
              validations: input.validations.filter((rule) => rule.name !== "choices"),
            },
          });
          stopOnUserErrors(data.metafieldDefinitionCreate.userErrors, `to create ${field.key}`);
          outcome.createdWithoutChoices.push(field.key);
        } else {
          stopOnUserErrors(errors, `to create ${field.key}`);
        }
      } catch (error) {
        log(`Created ${outcome.created.length} before stopping. Running again skips those.`);
        throw error;
      }
      if (!data.metafieldDefinitionCreate.createdDefinition) {
        throw new Stop(`Shopify didn't confirm creating ${field.key}.`);
      }
      outcome.created.push(field.key);
      log(`  created ${field.key}`);
    }
    const after = compareDefinitions(await listDefinitions());
    const notRight = after.filter((finding) => finding.status !== "matches");
    if (notRight.length > 0) {
      throw new Stop(
        `After creating, these aren't as expected: ${notRight.map((f) => f.key).join(", ")}`,
      );
    }
    log(`\nCreated ${outcome.created.length}, already there ${outcome.skipped.length}. All match.`);
    if (outcome.createdWithoutChoices.length > 0) {
      log(`Created without choices: ${outcome.createdWithoutChoices.join(", ")}.`);
    }
    return outcome;
  }

  if (mode === "pilot") {
    const inputs = pilotInputs(deps.options.reviewedBy!, deps.options.reviewedOn!);
    const notReady = inputs.filter(
      (input) => !matching.some((finding) => finding.key === input.key),
    );
    if (notReady.length > 0) {
      throw new Stop(
        `These definitions aren't in place: ${notReady.map((i) => i.key).join(", ")}. Nothing was set.`,
      );
    }
    const product = await readPilotProduct();
    if (product.metafields.nodes.length > 0) {
      throw new Stop(
        `${PILOT.title} already holds pc_builder values (${product.metafields.nodes
          .map((node) => node.key)
          .join(", ")}). Nothing was set.`,
      );
    }
    const data = await send(SET_MUTATION, { metafields: inputs });
    stopOnUserErrors(data.metafieldsSet.userErrors, "the pilot values");
    const saved = (await readPilotProduct()).metafields.nodes;
    const wrong = inputs.filter(
      (input) => saved.find((node) => node.key === input.key)?.value !== input.value,
    );
    if (wrong.length > 0) {
      throw new Stop(`Read back differently: ${wrong.map((input) => input.key).join(", ")}`);
    }
    outcome.pilotSet = true;
    log(`\nSet ${inputs.length} values on ${PILOT.title}, and read them back.`);
    return outcome;
  }

  // Rollback. Every check happens before the first delete, so it can't stop halfway on a refusal.
  const schemaKeys = new Set(PC_BUILDER_METAFIELDS.map((field) => field.key));
  const outside = listed.filter((definition) => !schemaKeys.has(definition.key));
  if (outside.length > 0) {
    throw new Stop(
      `These aren't this script's definitions: ${outside.map((d) => d.key).join(", ")}. Nothing was deleted.`,
    );
  }
  const onPilot = new Set((await readPilotProduct()).metafields.nodes.map((node) => node.key));
  const elsewhere = listed.filter(
    (definition) => definition.metafieldsCount > (onPilot.has(definition.key) ? 1 : 0),
  );
  if (elsewhere.length > 0) {
    throw new Stop(
      `Values exist outside the pilot product on: ${elsewhere.map((d) => d.key).join(", ")}. Nothing was deleted.`,
    );
  }
  for (const definition of listed) {
    let data: any;
    try {
      data = await send(DELETE_MUTATION, {
        identifier: {
          ownerType: "PRODUCT",
          namespace: PC_BUILDER_NAMESPACE,
          key: definition.key,
        },
      });
      stopOnUserErrors(data.metafieldDefinitionDelete.userErrors, `to delete ${definition.key}`);
    } catch (error) {
      log(`Deleted ${outcome.deleted.length} before stopping.`);
      throw error;
    }
    outcome.deleted.push(definition.key);
    log(`  deleted ${definition.key}`);
  }
  log(
    `\nDeleted ${outcome.deleted.length} definitions. Shopify removes their values in the background.`,
  );
  return outcome;
}

/** A token must never follow a redirect to another address. */
export const refusingRedirects: typeof fetch = (input, init) =>
  fetch(input, { ...init, redirect: "error" });

if (import.meta.main) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const options = parseOptions(Deno.args, today);
    const domain = (Deno.env.get("SHOPIFY_STORE_DOMAIN") || "").trim().toLowerCase();
    assertStore(domain);
    const adminToken = Deno.env.get("SHOPIFY_ADMIN_TOKEN");
    const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
    const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");
    if (!adminToken && !(clientId && clientSecret)) {
      throw new Stop("Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, or SHOPIFY_ADMIN_TOKEN.");
    }
    let sent = false;
    try {
      sent = true;
      const token =
        adminToken ||
        (await requestShortLivedToken(domain, clientId!, clientSecret!, refusingRedirects));
      await run({ domain, token, options });
    } catch (error) {
      console.error(`Stopped: ${error instanceof Error ? error.message : "unknown error"}`);
      Deno.exit(sent ? 1 : 2);
    }
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : "unknown error"} Nothing was sent.`);
    Deno.exit(2);
  }
}
