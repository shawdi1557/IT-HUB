// supabase/functions/tests/account-address-consolidation.test.ts
// Test-Driven Development (TDD) Suite for Phase 4: Consolidate Address Management into My Profile
// IT HUB — Kerala, India

import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const repoRoot = path.resolve(path.fromFileUrl(import.meta.url), "../../../..");
const accountDropdownPath = path.join(repoRoot, "src", "components", "AccountNavDropdown.tsx");
const accountPagePath = path.join(repoRoot, "src", "pages", "Account.tsx");

Deno.test("ADDR-1: AccountNavDropdown removes dedicated 'addresses' section from canonical list", () => {
  const content = Deno.readTextFileSync(accountDropdownPath);

  // Must NOT contain { id: "addresses", ... } in accountSections
  const hasAddressesSection = /id:\s*["']addresses["']/i.test(content);
  assertEquals(
    hasAddressesSection,
    false,
    "AccountNavDropdown must not contain dedicated 'addresses' entry in accountSections",
  );
});

Deno.test("ADDR-2: Account.tsx My Profile consolidates full address management (view, edit, remove, add)", () => {
  const content = Deno.readTextFileSync(accountPagePath);

  // My Profile section must support address management
  assertMatch(
    content,
    /DEFAULT ADDRESS|Saved Delivery Address/i,
    "Profile section must display address badge",
  );
  assertMatch(
    content,
    /Edit address|Edit profile/i,
    "Profile section must provide edit address capability",
  );
  assertMatch(
    content,
    /Remove|Remove address/i,
    "Profile section must provide remove address capability",
  );

  // Dedicated section === "addresses" standalone view should either be consolidated or redirect/fallback to profile
  // Dedicated nav link must not appear
  const hasDedicatedAddressesTab = /to=["']\/account\/addresses["']/i.test(content);
  assertEquals(
    hasDedicatedAddressesTab,
    false,
    "Account.tsx must not have a dedicated /account/addresses navigation tab",
  );
});
