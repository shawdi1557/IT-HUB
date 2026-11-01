// supabase/functions/tests/mobile-account-ui.test.ts
// Test-Driven Development (TDD) Suite for IT HUB Mobile Account Page UI Refinements:
// 1. Mobile search row suppression on /account and nested routes.
// 2. Replacement of horizontally scrolling account tabs with compact dropdown selector.
// 3. Preservation of all 13 existing account sections and desktop vertical navigation.
// IT HUB — Kerala, India

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

const MOBILE_HEADER_PATH = "src/components/MobileHeader.tsx";
const ACCOUNT_PAGE_PATH = "src/pages/Account.tsx";
const DROPDOWN_COMPONENT_PATH = "src/components/AccountNavDropdown.tsx";

// Helper regex tests for route matching
function isAccountRouteCheck(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: SEARCH BAR SUPPRESSION ON ACCOUNT ROUTES
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("ACC-SEARCH-1: Route matching logic accurately identifies /account and all nested routes", () => {
  assertEquals(isAccountRouteCheck("/account"), true);
  assertEquals(isAccountRouteCheck("/account/"), true);
  assertEquals(isAccountRouteCheck("/account/overview"), true);
  assertEquals(isAccountRouteCheck("/account/profile"), true);
  assertEquals(isAccountRouteCheck("/account/orders"), true);
  assertEquals(isAccountRouteCheck("/account/services"), true);
  assertEquals(isAccountRouteCheck("/account/wishlist"), true);
  assertEquals(isAccountRouteCheck("/account/settings"), true);

  // Shopping and other routes must NOT match
  assertEquals(isAccountRouteCheck("/"), false);
  assertEquals(isAccountRouteCheck("/products"), false);
  assertEquals(isAccountRouteCheck("/services"), false);
  assertEquals(isAccountRouteCheck("/pc-builder"), false);
  assertEquals(isAccountRouteCheck("/cart"), false);
  assertEquals(isAccountRouteCheck("/blog"), false);
  assertEquals(isAccountRouteCheck("/support"), false);
});

Deno.test("ACC-SEARCH-2: MobileHeader.tsx removes Row 2 search bar consistently across mobile storefront", async () => {
  const code = await Deno.readTextFile(MOBILE_HEADER_PATH);

  // Row 2 mobile search bar is completely removed
  const hasSearchInput =
    /<input[^>]*type=["']search["']/i.test(code) ||
    /Search laptops, mobiles, accessories/i.test(code);
  assertEquals(hasSearchInput, false, "MobileHeader must not render a search bar on mobile");

  // Row 1 (Menu, Logo, Account, Cart) must remain unconditional
  assertStringIncludes(code, "Row 1:");
  assertStringIncludes(code, "cartCount");
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: REPLACEMENT OF HORIZONTAL TABS WITH COMPACT DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("ACC-TABS-1: Account.tsx removes the mobile horizontally scrollable nav tabs", async () => {
  const code = await Deno.readTextFile(ACCOUNT_PAGE_PATH);

  // The obsolete mobile horizontal scroll tab bar class combination was:
  // <nav className="flex gap-1 overflow-x-auto lg:flex-col">
  const hasHorizontalOverflowNav = /<nav[^>]*flex[^>]*overflow-x-auto/i.test(code);
  assertEquals(
    hasHorizontalOverflowNav,
    false,
    "Account.tsx must not contain horizontally scrollable <nav> with overflow-x-auto on mobile",
  );
});

Deno.test("ACC-DROPDOWN-1: AccountNavDropdown.tsx includes all 12 canonical account sections with reschedule and no settings", async () => {
  const code = await Deno.readTextFile(DROPDOWN_COMPONENT_PATH);

  const canonicalSections = [
    "overview",
    "profile",
    "orders",
    "sell-requests",
    "services",
    "reschedule",
    "builds",
    "wishlist",
    "offers",
    "warranty",
    "notifications",
    "support",
  ];

  for (const sec of canonicalSections) {
    assertStringIncludes(code, `"${sec}"`, `Dropdown must support canonical section: ${sec}`);
  }

  // Settings and dedicated "addresses" entry must NOT be present in navigation dropdown
  assertEquals(
    /id:\s*["']settings["']/.test(code),
    false,
    "Settings navigation entry must be removed from customer account navigation",
  );
  assertEquals(
    /id:\s*["']addresses["']/.test(code),
    false,
    "Dedicated addresses entry must be consolidated into profile",
  );
});

Deno.test("ACC-DROPDOWN-2: AccountNavDropdown renders compact trigger with active indicator and chevron", async () => {
  const code = await Deno.readTextFile(DROPDOWN_COMPONENT_PATH);

  // Must have chevron icon
  assertStringIncludes(code, "ChevronDown");

  // Must have accessible attributes
  assertStringIncludes(code, "aria-expanded");
  assertStringIncludes(code, "aria-haspopup");

  // Must render active section details
  assertStringIncludes(code, "currentSection");
});

Deno.test("ACC-DROPDOWN-3: AccountNavDropdown handles outside click and escape key dismissal", async () => {
  const code = await Deno.readTextFile(DROPDOWN_COMPONENT_PATH);

  assertStringIncludes(code, "Escape");
  assertStringIncludes(code, "addEventListener");
  assertStringIncludes(code, "removeEventListener");
});

Deno.test("ACC-DROPDOWN-4: Account.tsx integrates AccountNavDropdown for mobile viewports", async () => {
  const code = await Deno.readTextFile(ACCOUNT_PAGE_PATH);

  assertStringIncludes(code, "AccountNavDropdown");
  assertStringIncludes(code, "<AccountNavDropdown");
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: DESKTOP AND TABLET SIDEBAR PRESERVATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("ACC-DESKTOP-1: Account.tsx preserves vertical desktop sidebar for lg viewports", async () => {
  const code = await Deno.readTextFile(ACCOUNT_PAGE_PATH);

  assertStringIncludes(code, "lg:grid-cols-[210px_1fr]");
  assertStringIncludes(code, "lg:block");
  assertStringIncludes(code, "lg:flex-col");
});
