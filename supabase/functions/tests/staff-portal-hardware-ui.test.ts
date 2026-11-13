// Stage 4B-6: the Staff Portal's hardware screens, logic only (no browser): every specification field appears in
// exactly one on-screen section, and the Sync Centre's wording never presents a record as written to the real Shopify
// store unless the server recorded a live write. No network.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { HARDWARE_CATEGORIES, categoryFields } from "../../../ITHUB_ADMIN/src/lib/hardware-spec.ts";
import { FIELD_GROUPS, groupsFor } from "../../../ITHUB_ADMIN/src/lib/hardware-groups.ts";
import {
  failureWording,
  reachedRealShopify,
  stateWording,
} from "../../../ITHUB_ADMIN/src/lib/sync-wording.ts";

Deno.test("S4B6-UI-1: every field of every category is in exactly one section, and no section names a field that doesn't exist", () => {
  for (const category of HARDWARE_CATEGORIES) {
    const keys = categoryFields(category.id).map((f) => f.key);
    const listed = (FIELD_GROUPS[category.id] ?? []).flatMap((g) => g.fields);
    assertEquals(new Set(listed).size, listed.length, `${category.id}: a field is in two sections`);
    for (const key of listed) assert(keys.includes(key), `${category.id}: ${key} isn't a field`);
    for (const key of keys) assert(listed.includes(key), `${category.id}: ${key} has no section`);
    // groupsFor adds nothing when every field is listed.
    assert(!groupsFor(category.id, keys).some((g) => g.id === "other"), category.id);
  }
  // A field no section names still appears, under "Other details".
  const extra = groupsFor("CPU", [...categoryFields("CPU").map((f) => f.key), "future_field"]);
  assertEquals(extra[extra.length - 1].fields, ["future_field"]);
});

Deno.test("S4B6-UI-2: only a recorded live write reads as 'in Shopify'; stand-in and unmarked records read as tests", () => {
  const live = { status: "synced", shopify_response: { mode: "live" } };
  const standIn = { status: "synced", shopify_response: { mode: "stand_in" } };
  const unmarked = { status: "synced", shopify_response: { metafields: [] } };
  assertEquals(reachedRealShopify(live), true);
  for (const job of [
    standIn,
    unmarked,
    { status: "synced", shopify_response: null },
    { status: "failed", shopify_response: { mode: "live" } },
    null,
  ]) {
    assertEquals(reachedRealShopify(job as any), false, JSON.stringify(job));
  }
  assertEquals(stateWording("synced", live).label, "Up to date in Shopify");
  for (const job of [standIn, unmarked, null]) {
    const w = stateWording("synced", job as any);
    assertEquals(w.label, "Test record only", JSON.stringify(job));
    assert(!/up to date in shopify/i.test(w.explanation));
  }
  assertEquals(stateWording("not_synced").label, "Not sent yet");
  assertEquals(stateWording("failed").tone, "danger");
});

Deno.test("S4B6-UI-3: every failure the sync function can record has a plain-language explanation", () => {
  for (const code of [
    "admin_not_configured",
    "writes_disabled",
    "throttled",
    "shopify_unavailable",
    "network_error",
    "shopify_access_denied",
    "variant_specific_unsupported",
    "variant_not_on_product",
    "product_not_found",
    "shopify_rejected_values",
    "shopify_unconfirmed",
    "specification_changed",
  ]) {
    const text = failureWording({ code, message: "raw" });
    assert(text.length > 20 && text !== "raw." && !text.includes("_"), `${code}: ${text}`);
  }
  assert(failureWording({ code: "admin_not_configured" }).includes("Nothing was sent"));
  assertEquals(
    failureWording({ code: "something_new", message: "Shopify said no" }),
    "Shopify said no.",
  );
  assertEquals(failureWording(null), "Something went wrong. Try again.");
});
