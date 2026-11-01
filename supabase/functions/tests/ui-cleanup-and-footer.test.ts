// supabase/functions/tests/ui-cleanup-and-footer.test.ts
// Test-Driven Development (TDD) Suite for Phase 2 (Product Page Cleanup) and Phase 3 (Footer Cleanup)
// IT HUB — Kerala, India

import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const repoRoot = path.resolve(path.fromFileUrl(import.meta.url), "../../../..");
const productsPagePath = path.join(repoRoot, "src", "pages", "Products.tsx");
const layoutComponentPath = path.join(repoRoot, "src", "components", "Layout.tsx");

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: PRODUCT PAGE CLEANUP
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PROD-CLEANUP-1: Product detail section removes prototype-data disclaimer", () => {
  const content = Deno.readTextFileSync(productsPagePath);

  // Must NOT contain the prototype disclaimer
  const hasDisclaimer =
    /Prices,\s*availability\s*and\s*discounts\s*are\s*illustrative\s*prototype\s*data/i.test(
      content,
    );
  assertEquals(
    hasDisclaimer,
    false,
    "Product detail section must not display 'Prices, availability and discounts are illustrative prototype data.'",
  );
});

Deno.test("PROD-CLEANUP-2: Product detail purchase section removes 'Warranty help →' link", () => {
  const content = Deno.readTextFileSync(productsPagePath);

  // Must NOT contain the "Warranty help →" link in the buy section
  const hasWarrantyHelpLink = /Warranty\s+help\s+→/i.test(content);
  assertEquals(
    hasWarrantyHelpLink,
    false,
    "Product detail purchase section must not display 'Warranty help →' link",
  );

  // Must preserve standard delivery information and ordinary warranty metadata
  assertMatch(
    content,
    /All Kerala delivery available/i,
    "Must preserve delivery availability notice",
  );
  assertMatch(content, /Warranty:/i, "Must preserve ordinary warranty metadata label");
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: FOOTER CLEANUP AND ALIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("FOOTER-CLEANUP-1: Footer removes 'Interactive frontend prototype · No real payments'", () => {
  const content = Deno.readTextFileSync(layoutComponentPath);

  const hasPrototypeNotice = /Interactive frontend prototype\s*·\s*No real payments/i.test(content);
  assertEquals(
    hasPrototypeNotice,
    false,
    "Footer must not contain 'Interactive frontend prototype · No real payments'",
  );
});

Deno.test("FOOTER-CLEANUP-2: Footer aligns business tagline to the right and copyright to the left", () => {
  const content = Deno.readTextFileSync(layoutComponentPath);

  // Tagline text must be preserved
  assertMatch(content, /Serving customers since 2011/i, "Must preserve tagline wording");
  assertMatch(content, /© 2026 IT HUB\. All rights reserved\./i, "Must preserve copyright notice");

  // In the bottom row container, verify layout arrangement
  // Tagline must be right-aligned or positioned at the end of the container (e.g. justify-between with 2 items)
  // Ensure no third middle item remains
  assertMatch(content, /justify-between/i, "Bottom row must justify between items");
  assertMatch(content, /sm:text-right|text-right/i, "Tagline must be right-aligned on desktop");
});
