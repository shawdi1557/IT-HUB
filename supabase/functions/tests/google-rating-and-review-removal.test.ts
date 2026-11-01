// supabase/functions/tests/google-rating-and-review-removal.test.ts
// Automated Test Suite for Google Maps Rating Preservation & Complete Customer Reviews Feature Removal

import {
  assertEquals,
  assertMatch,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const HOME_PAGE_PATH = "src/pages/Home.tsx";
const ABOUT_PAGE_PATH = "src/pages/Information.tsx";
const PRODUCTS_PAGE_PATH = "src/pages/Products.tsx";
const PRODUCT_CARD_PATH = "src/components/ProductCard.tsx";
const PEEK_RATING_PATH = "src/components/reviews/PeekRating.tsx";
const PEEK_RATING_CSS_PATH = "src/components/reviews/PeekRating.css";
const PACKAGE_JSON_PATH = "package.json";
const PORTAL_LAYOUT_PATH = "ITHUB_ADMIN/src/components/Layout.tsx";
const PORTAL_APP_PATH = "ITHUB_ADMIN/src/App.tsx";

const VERIFIED_MAPS_URL = "https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8";

// ─────────────────────────────────────────────────────────────────────────────
// 1. GOOGLE MAPS BUSINESS RATING PRESERVATION (CRITICAL)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("RATE-1: Homepage Hero displays '4.8 Customer rating on Google Maps' linked to verified Google Maps URL", () => {
  const content = Deno.readTextFileSync(HOME_PAGE_PATH);

  // Must include the exact label text
  assertMatch(
    content,
    /Customer rating on Google Maps/i,
    "Homepage Hero must display 'Customer rating on Google Maps'",
  );

  // Must link to verified Google Maps profile
  assertMatch(
    content,
    new RegExp(VERIFIED_MAPS_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "Homepage Hero rating attribution must link to verified Google Maps URL",
  );
});

Deno.test("RATE-2: Homepage Hero does not display prototype or static disclaimer", () => {
  const content = Deno.readTextFileSync(HOME_PAGE_PATH);

  assertNotMatch(
    content,
    /Customer rating\s*·\s*static value/i,
    "Homepage Hero must remove 'Customer rating · static value'",
  );
});

Deno.test("RATE-3: About page customer rating section displays '4.8 Customer rating on Google Maps' linked to verified Google Maps URL", () => {
  const content = Deno.readTextFileSync(ABOUT_PAGE_PATH);

  // Must include the exact label text
  assertMatch(
    content,
    /Customer rating on Google Maps/i,
    "About page must display 'Customer rating on Google Maps'",
  );

  // Must link to verified Google Maps profile
  assertMatch(
    content,
    new RegExp(VERIFIED_MAPS_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "About page rating attribution must link to verified Google Maps URL",
  );
});

Deno.test("RATE-4: About page does not display 'supplied static prototype value · no live review integration'", () => {
  const content = Deno.readTextFileSync(ABOUT_PAGE_PATH);

  assertNotMatch(
    content,
    /supplied static prototype value/i,
    "About page must remove 'supplied static prototype value · no live review integration'",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. STOREFRONT CUSTOMER REVIEWS REMOVAL
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("NO-REV-1: Products.tsx removes Reviews tab, review submission form, and review list", () => {
  const content = Deno.readTextFileSync(PRODUCTS_PAGE_PATH);

  assertNotMatch(
    content,
    /\{?["']Reviews["']\}?/i,
    "Products.tsx must not contain 'Reviews' tab in tab list",
  );

  assertNotMatch(
    content,
    /Write a (Customer )?Review/i,
    "Products.tsx must not contain 'Write a Review' button or form",
  );

  assertNotMatch(
    content,
    /CustomerReview/i,
    "Products.tsx must not contain CustomerReview interface",
  );

  assertNotMatch(
    content,
    /setTab\(["']Reviews["']\)/i,
    "Products.tsx must not contain navigation triggers targeting Reviews tab",
  );
});

Deno.test("NO-REV-2: ProductCard.tsx does not display mock 'Demo rating' star badges", () => {
  const content = Deno.readTextFileSync(PRODUCT_CARD_PATH);

  assertNotMatch(
    content,
    /Demo rating/i,
    "ProductCard.tsx must not display mock 'Demo rating' badge",
  );
});

Deno.test("NO-REV-3: PeekRating component and CSS files are completely deleted", () => {
  const tsxExists = (() => {
    try {
      return Deno.statSync(PEEK_RATING_PATH).isFile;
    } catch {
      return false;
    }
  })();
  assertEquals(tsxExists, false, "PeekRating.tsx must be completely removed");

  const cssExists = (() => {
    try {
      return Deno.statSync(PEEK_RATING_CSS_PATH).isFile;
    } catch {
      return false;
    }
  })();
  assertEquals(cssExists, false, "PeekRating.css must be completely removed");
});

Deno.test("NO-REV-4: package.json has completely uninstalled Hugeicons dependencies", () => {
  const pkg = JSON.parse(Deno.readTextFileSync(PACKAGE_JSON_PATH));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  assertEquals(
    Boolean(deps["@hugeicons/react"]),
    false,
    "@hugeicons/react must not be in package.json",
  );
  assertEquals(
    Boolean(deps["@hugeicons/core-free-icons"]),
    false,
    "@hugeicons/core-free-icons must not be in package.json",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. STAFF PORTAL REVIEWS MODULE REMOVAL
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("NO-REV-5: Staff Portal Layout navigation does not expose Customer Reviews sidebar link", () => {
  const content = Deno.readTextFileSync(PORTAL_LAYOUT_PATH);

  assertNotMatch(
    content,
    /to:\s*["']\/reviews["']/i,
    "Staff Portal Layout must not contain navigation link to /reviews",
  );

  assertNotMatch(
    content,
    /label:\s*["']Customer Reviews["']/i,
    "Staff Portal Layout must not contain 'Customer Reviews' navigation label",
  );
});

Deno.test("NO-REV-6: Staff Portal router redirects /reviews route to dashboard (/)", () => {
  const content = Deno.readTextFileSync(PORTAL_APP_PATH);

  assertNotMatch(
    content,
    /import.*Reviews.*from.*pages\/Reviews/i,
    "Staff Portal App.tsx must not import Reviews page component",
  );

  assertMatch(
    content,
    /<Route\s+path=["']\/reviews["']\s+element=\{<Navigate\s+to=["']\/["']\s+replace\s*\/>\}/,
    "Staff Portal App.tsx must safely redirect /reviews route to root dashboard (/)",
  );
});
