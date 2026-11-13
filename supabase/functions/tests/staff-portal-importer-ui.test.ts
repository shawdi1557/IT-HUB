// Shopify Hardware Importer: the Staff Portal's logic, no browser and no network. Every refusal the importer's
// database functions and Edge Function can give has staff wording; the CSV export can't carry a spreadsheet formula;
// the actions offered per status are the ones the database accepts; the page is wired under the PC Builder area for
// Admin and Staff only, without a new sidebar item.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  IMPORT_MESSAGES,
  IMPORT_STATUS,
  allowedDecisions,
  csvCell,
  importCsv,
  importMessage,
} from "../../../ITHUB_ADMIN/src/lib/hardware-import-wording.ts";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));

Deno.test("IMP-UI-1: every refusal code the importer can raise has wording for staff", async () => {
  const migration = await read("supabase/migrations/20261113000003_shopify_hardware_importer.sql");
  const raised = [...migration.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]);
  assert(raised.length >= 15, "the migration's codes were found");
  // Codes the registry's own functions raise when the importer calls them.
  const registry = [
    "duplicate_model",
    "possible_duplicate",
    "listing_already_linked",
    "model_archived",
    "forbidden",
  ];
  const handler = await read("supabase/functions/hardware-shopify-import/index.ts");
  const discovery = await read("supabase/functions/hardware-shopify-import/discovery.ts");
  const fn = [
    ...[...handler.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]),
    ...[...discovery.matchAll(/"(shopify_[a-z_]+)"/g)].map((m) => m[1]),
  ].filter(
    (c) =>
      c !== "origin_not_allowed" &&
      c !== "method_not_allowed" &&
      c !== "invalid_json" &&
      c !== "invalid_request" &&
      c !== "too_large",
  );
  for (const code of new Set([...raised, ...registry, ...fn])) {
    assert(code in IMPORT_MESSAGES, `no wording for ${code}`);
  }
  // Unknown codes fall back to a generic message, never the raw code.
  assertEquals(importMessage("permission denied for table x"), IMPORT_MESSAGES.failed);
  assertEquals(importMessage(null), IMPORT_MESSAGES.failed);
});

Deno.test("IMP-UI-2: the CSV export quotes properly and never exports a formula", () => {
  assertEquals(csvCell("plain"), "plain");
  assertEquals(csvCell('Has "quotes", commas'), '"Has ""quotes"", commas"');
  assertEquals(csvCell("two\nlines"), '"two\nlines"');
  for (const formula of ['=HYPERLINK("x")', "+1", "-2", "@SUM(A1)", "\tx", "\rx"]) {
    const cell = csvCell(formula);
    assert(/^"?'/.test(cell), `${JSON.stringify(formula)} → ${cell}`);
  }
  assertEquals(csvCell(null), "");
  assertEquals(csvCell(undefined), "");
  const csv = importCsv([
    {
      title: "=cmd|' /C calc'!A0",
      shopify_product_id: "gid://shopify/Product/1",
      vendor: null,
      shopify_category: "Video Cards & Adapters",
      product_type: null,
      category_id: "GPU",
      manufacturer: "Synthetic",
      model_name: "Card, OC",
      model_number: null,
      status: "Ready to import",
      decision: "import_new",
      result_action: null,
      error: null,
    },
  ]);
  const lines = csv.split("\r\n");
  assertEquals(lines[0].split(",")[0], "title");
  assert(lines[1].startsWith("'=cmd"));
  assert(lines[1].includes('"Card, OC"'));
  assertEquals(lines.length, 3);
});

Deno.test("IMP-UI-3: the actions offered per status match what staff_update_import_item accepts", async () => {
  assertEquals(allowedDecisions("eligible"), ["import_new", "skip"]);
  assertEquals(allowedDecisions("exact_match"), ["link_existing", "skip"]);
  assertEquals(allowedDecisions("already_linked"), ["skip", "refresh_link"]);
  assertEquals(
    new Set(allowedDecisions("possible_duplicate")),
    new Set(["link_existing", "import_new", "skip"]),
  );
  for (const s of ["unmapped", "needs_review", "excluded"] as const)
    assertEquals(allowedDecisions(s), ["skip"]);
  assertEquals(allowedDecisions("imported"), []);
  // The database's evaluation keeps exactly these (the reset rules in hardware_import_evaluate).
  const migration = await read("supabase/migrations/20261113000003_shopify_hardware_importer.sql");
  assert(
    migration.includes(
      "if v_decision is distinct from 'refresh_link' then v_decision := 'skip'; end if;",
    ),
  );
  assert(
    migration.includes(
      "if v_decision is distinct from 'skip' then v_decision := 'link_existing'; end if;",
    ),
  );
  assert(
    migration.includes(
      "if v_decision is null or v_decision not in ('import_new', 'skip') then v_decision := 'import_new'; end if;",
    ),
  );
  // Every status has a label, a tone and help.
  for (const [status, wording] of Object.entries(IMPORT_STATUS)) {
    assert(wording.label && wording.help, status);
  }
});

Deno.test("IMP-UI-4: the importer page is an Admin and Staff route under the PC Builder tabs, not a new sidebar item", async () => {
  const app = await read("ITHUB_ADMIN/src/App.tsx");
  const route = app.slice(
    app.indexOf('path="/hardware-import"'),
    app.indexOf('path="/hardware-import"') + 300,
  );
  assert(
    route.includes("profile.permissions.can_manage_quotations"),
    "route guarded like the other hardware pages",
  );
  const nav = await read("ITHUB_ADMIN/src/components/HardwareNav.tsx");
  assert(nav.includes('to: "/hardware-import"'));
  const layout = await read("ITHUB_ADMIN/src/components/Layout.tsx");
  assert(!layout.includes("/hardware-import"), "no sidebar item of its own");
  const registry = await read("ITHUB_ADMIN/src/pages/HardwareRegistry.tsx");
  assert(
    registry.includes('navigate("/hardware-import")'),
    "Import from Shopify from the registry",
  );
  // The portal never calls the discovery functions itself, and never writes the import tables directly.
  const lib = await read("ITHUB_ADMIN/src/lib/hardware-import.ts");
  assert(!/hardware_import_(begin|stage|finish_discovery)/.test(lib));
  assert(!/\.(insert|update|upsert|delete)\(/.test(lib));
});

Deno.test("IMP-UI-5: Sync Centre: a model's maker isn't repeated, and 'Try again' isn't offered where it can't help", async () => {
  const { modelLabel, retryHelps } = await import("../../../ITHUB_ADMIN/src/lib/sync-wording.ts");
  assertEquals(modelLabel("AMD", "AMD Ryzen 5 5600"), "AMD Ryzen 5 5600");
  assertEquals(modelLabel("Cooler Master", "CoolerMaster MWE 650"), "CoolerMaster MWE 650");
  assertEquals(modelLabel("DeepCool", "AK400"), "DeepCool AK400");
  assertEquals(modelLabel("", "AK400"), "AK400");
  assertEquals(modelLabel(null, "AK400"), "AK400");
  const off = { adminConfigured: false, writesEnabled: false };
  const on = { adminConfigured: true, writesEnabled: true };
  assertEquals(retryHelps({ code: "admin_not_configured" }, off), false);
  assertEquals(retryHelps({ code: "admin_not_configured" }, on), true);
  assertEquals(
    retryHelps({ code: "writes_disabled" }, { adminConfigured: true, writesEnabled: false }),
    false,
  );
  assertEquals(retryHelps({ code: "throttled" }, off), true);
  assertEquals(retryHelps(null, off), true);
});

Deno.test("IMP-UI-6: every result of the Shopify connection check has its own wording for administrators", async () => {
  const { connectionWording, failureWording } =
    await import("../../../ITHUB_ADMIN/src/lib/sync-wording.ts");
  const auth = await Deno.readTextFile(
    new URL("../_shared/shopify-admin-auth.ts", import.meta.url),
  );
  const block = auth.slice(
    auth.indexOf("export type ShopifyAuthErrorCode"),
    auth.indexOf("export class ShopifyAuthError"),
  );
  const codes = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert(codes.length >= 8);
  const generic = connectionWording("something_else");
  for (const code of [...codes, "access_denied", "query_failed"]) {
    const text = connectionWording(code);
    assert(text !== generic, `no wording for ${code}`);
  }
  assert(connectionWording(null).startsWith("Connected"));
  assert(failureWording({ code: "shopify_auth_failed" }).includes("Nothing was sent"));
});
