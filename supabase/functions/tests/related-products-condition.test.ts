// supabase/functions/tests/related-products-condition.test.ts
// Automated Tests: IT HUB Related Products Condition Segregation (TDD)
// Kerala, India

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { Product, ProductCondition } from "../../../src/data/catalog.ts";
import {
  isFreshProduct,
  isPreOwnedProduct,
  getProductConditionClassification,
  getRelatedProducts,
} from "../../../src/lib/relatedProducts.ts";

function createMockProduct(overrides: Partial<Product> & { id: string; name: string }): Product {
  return {
    category: "Laptops",
    brand: "Lenovo",
    price: 50000,
    original: 60000,
    image: "/images/laptop.jpg",
    stock: 5,
    rating: 4.8,
    specs: {},
    availableForSale: true,
    condition: "New" as ProductCondition,
    secondHand: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 1: Condition Classification Helpers
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("COND-1: isFreshProduct correctly validates fresh products and rejects others", () => {
  const freshProd = createMockProduct({
    id: "1",
    name: "Fresh Laptop",
    condition: "New",
    secondHand: false,
  });
  assertEquals(isFreshProduct(freshProd), true);

  // Second-hand flag contradicts "New" condition -> Must NOT be fresh
  const contradictoryProd = createMockProduct({
    id: "2",
    name: "Flagged Pre-Owned",
    condition: "New",
    secondHand: true,
  });
  assertEquals(isFreshProduct(contradictoryProd), false);

  // Pre-owned conditions -> Must NOT be fresh
  const preOwnedProd = createMockProduct({
    id: "3",
    name: "Good Condition",
    condition: "Good",
    secondHand: true,
  });
  assertEquals(isFreshProduct(preOwnedProd), false);

  // Missing condition -> Must NOT be treated as fresh
  const missingConditionProd = createMockProduct({
    id: "4",
    name: "Unknown",
    condition: undefined,
    secondHand: false,
  });
  assertEquals(isFreshProduct(missingConditionProd), false);

  // Null/undefined product
  assertEquals(isFreshProduct(null), false);
  assertEquals(isFreshProduct(undefined), false);
});

Deno.test("COND-2: isPreOwnedProduct correctly validates pre-owned conditions", () => {
  const goodProd = createMockProduct({
    id: "1",
    name: "Used Laptop",
    condition: "Good",
    secondHand: true,
  });
  assertEquals(isPreOwnedProduct(goodProd), true);

  const likeNewProd = createMockProduct({
    id: "2",
    name: "Like New Laptop",
    condition: "Like New",
    secondHand: false,
  });
  assertEquals(isPreOwnedProduct(likeNewProd), true);

  const fairProd = createMockProduct({
    id: "3",
    name: "Fair Laptop",
    condition: "Fair",
    secondHand: true,
  });
  assertEquals(isPreOwnedProduct(fairProd), true);

  const partsProd = createMockProduct({
    id: "4",
    name: "Parts Only",
    condition: "For Parts",
    secondHand: true,
  });
  assertEquals(isPreOwnedProduct(partsProd), true);

  // Fresh product -> Must NOT be pre-owned
  const freshProd = createMockProduct({
    id: "5",
    name: "Fresh Item",
    condition: "New",
    secondHand: false,
  });
  assertEquals(isPreOwnedProduct(freshProd), false);

  // Missing condition & secondHand false -> Not pre-owned
  const missingProd = createMockProduct({
    id: "6",
    name: "Missing Item",
    condition: undefined,
    secondHand: false,
  });
  assertEquals(isPreOwnedProduct(missingProd), false);
});

Deno.test("COND-3: getProductConditionClassification resolves fresh, pre-owned, and unknown", () => {
  const fresh = createMockProduct({ id: "1", name: "Fresh", condition: "New", secondHand: false });
  assertEquals(getProductConditionClassification(fresh), "fresh");

  const preOwned = createMockProduct({
    id: "2",
    name: "Pre-owned",
    condition: "Good",
    secondHand: true,
  });
  assertEquals(getProductConditionClassification(preOwned), "pre-owned");

  const unknown = createMockProduct({
    id: "3",
    name: "Unclassified",
    condition: undefined,
    secondHand: false,
  });
  assertEquals(getProductConditionClassification(unknown), "unknown");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 2: Fresh Product Recommendations
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REC-1: Fresh product returns ONLY fresh recommendations and NEVER pre-owned", () => {
  const currentFreshProduct = createMockProduct({
    id: "fresh-target",
    name: "Lenovo Legion Pro 5 (Fresh)",
    category: "Laptops",
    brand: "Lenovo",
    condition: "New",
    secondHand: false,
  });

  const catalog: Product[] = [
    currentFreshProduct,
    createMockProduct({
      id: "fresh-1",
      name: "Lenovo LOQ 15",
      category: "Laptops",
      brand: "Lenovo",
      condition: "New",
      secondHand: false,
    }),
    createMockProduct({
      id: "fresh-2",
      name: "Asus ROG Strix",
      category: "Laptops",
      brand: "Asus",
      condition: "New",
      secondHand: false,
    }),
    createMockProduct({
      id: "used-1",
      name: "HP Omen (Pre-owned)",
      category: "Laptops",
      brand: "HP",
      condition: "Good",
      secondHand: true,
    }),
    createMockProduct({
      id: "used-2",
      name: "Dell G15 (Pre-owned)",
      category: "Laptops",
      brand: "Dell",
      condition: "Like New",
      secondHand: true,
    }),
  ];

  const recommendations = getRelatedProducts(currentFreshProduct, catalog, { limit: 4 });

  assertEquals(recommendations.length, 2);
  assertEquals(
    recommendations.every((p) => p.condition === "New" && !p.secondHand),
    true,
  );
  assertEquals(
    recommendations.some((p) => p.secondHand || p.condition !== "New"),
    false,
  );
  assertEquals(
    recommendations.map((p) => p.id),
    ["fresh-1", "fresh-2"],
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 3: Pre-Owned Product Recommendations
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REC-2: Pre-owned product returns ONLY pre-owned recommendations and NEVER fresh", () => {
  const currentPreOwnedProduct = createMockProduct({
    id: "used-target",
    name: "MacBook Air M1 (Pre-owned)",
    category: "Laptops",
    brand: "Apple",
    condition: "Good",
    secondHand: true,
  });

  const catalog: Product[] = [
    currentPreOwnedProduct,
    createMockProduct({
      id: "fresh-1",
      name: "MacBook Air M3 (Fresh)",
      category: "Laptops",
      brand: "Apple",
      condition: "New",
      secondHand: false,
    }),
    createMockProduct({
      id: "fresh-2",
      name: "Dell XPS 13 (Fresh)",
      category: "Laptops",
      brand: "Dell",
      condition: "New",
      secondHand: false,
    }),
    createMockProduct({
      id: "used-1",
      name: "MacBook Pro 13 (Pre-owned)",
      category: "Laptops",
      brand: "Apple",
      condition: "Like New",
      secondHand: true,
    }),
    createMockProduct({
      id: "used-2",
      name: "ThinkPad T14 (Pre-owned)",
      category: "Laptops",
      brand: "Lenovo",
      condition: "Good",
      secondHand: true,
    }),
  ];

  const recommendations = getRelatedProducts(currentPreOwnedProduct, catalog, { limit: 4 });

  assertEquals(recommendations.length, 2);
  assertEquals(
    recommendations.every((p) => p.secondHand || (p.condition && p.condition !== "New")),
    true,
  );
  assertEquals(
    recommendations.some((p) => !p.secondHand && p.condition === "New"),
    false,
  );
  assertEquals(
    recommendations.map((p) => p.id),
    ["used-1", "used-2"],
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 4: Empty & Reduced State Without Cross-Condition Fallback
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REC-3: Fresh product with no related fresh products returns empty array (no cross-condition filling)", () => {
  const currentFreshProduct = createMockProduct({
    id: "lone-fresh",
    name: "ASUS ProArt Studiobook",
    category: "Laptops",
    condition: "New",
    secondHand: false,
  });

  // Catalog contains only pre-owned products
  const catalog: Product[] = [
    currentFreshProduct,
    createMockProduct({
      id: "used-1",
      name: "Lenovo Ideapad (Used)",
      category: "Laptops",
      condition: "Good",
      secondHand: true,
    }),
    createMockProduct({
      id: "used-2",
      name: "HP Pavilion (Used)",
      category: "Laptops",
      condition: "Fair",
      secondHand: true,
    }),
  ];

  const recommendations = getRelatedProducts(currentFreshProduct, catalog, { limit: 4 });

  assertEquals(recommendations, []);
});

Deno.test("REC-4: Pre-owned product with no related pre-owned products returns empty array (no cross-condition filling)", () => {
  const currentPreOwnedProduct = createMockProduct({
    id: "lone-preowned",
    name: "Dell Latitude 7490 (Used)",
    category: "Laptops",
    condition: "Good",
    secondHand: true,
  });

  // Catalog contains only fresh products
  const catalog: Product[] = [
    currentPreOwnedProduct,
    createMockProduct({
      id: "fresh-1",
      name: "Dell Inspiron (Brand New)",
      category: "Laptops",
      condition: "New",
      secondHand: false,
    }),
    createMockProduct({
      id: "fresh-2",
      name: "Lenovo ThinkBook (Brand New)",
      category: "Laptops",
      condition: "New",
      secondHand: false,
    }),
  ];

  const recommendations = getRelatedProducts(currentPreOwnedProduct, catalog, { limit: 4 });

  assertEquals(recommendations, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 5: Exclusion of Self, Missing/Unknown Conditions, and Unavailable Items
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REC-5: Excludes currently viewed product from recommendations", () => {
  const product = createMockProduct({
    id: "prod-100",
    name: "Acer Nitro 5",
    category: "Laptops",
    condition: "New",
    secondHand: false,
  });
  const other = createMockProduct({
    id: "prod-101",
    name: "Acer Predator",
    category: "Laptops",
    condition: "New",
    secondHand: false,
  });

  const recommendations = getRelatedProducts(product, [product, other]);
  assertEquals(recommendations.length, 1);
  assertEquals(recommendations[0].id, "prod-101");
});

Deno.test("REC-6: Missing or unknown condition is strictly excluded and never treated as fresh", () => {
  const currentFresh = createMockProduct({
    id: "f-1",
    name: "Fresh Target",
    condition: "New",
    secondHand: false,
  });

  const catalog: Product[] = [
    currentFresh,
    createMockProduct({
      id: "missing-1",
      name: "Unspecified Item 1",
      condition: undefined,
      secondHand: false,
    }),
    createMockProduct({
      id: "missing-2",
      name: "Unspecified Item 2",
      condition: undefined,
      secondHand: undefined,
    }),
    createMockProduct({
      id: "valid-fresh",
      name: "Valid Fresh Item",
      condition: "New",
      secondHand: false,
    }),
  ];

  const recommendations = getRelatedProducts(currentFresh, catalog);
  assertEquals(recommendations.length, 1);
  assertEquals(recommendations[0].id, "valid-fresh");
});

Deno.test("REC-7: Out-of-stock and unavailable products are excluded according to storefront rules", () => {
  const currentFresh = createMockProduct({
    id: "f-target",
    name: "Fresh Laptop",
    condition: "New",
    secondHand: false,
  });

  const catalog: Product[] = [
    currentFresh,
    createMockProduct({
      id: "in-stock",
      name: "In Stock Product",
      condition: "New",
      secondHand: false,
      availableForSale: true,
      stock: 5,
    }),
    createMockProduct({
      id: "sold-out-flag",
      name: "Sold Out Product",
      condition: "New",
      secondHand: false,
      availableForSale: false,
      stock: 0,
    }),
    createMockProduct({
      id: "zero-stock",
      name: "Zero Stock Product",
      condition: "New",
      secondHand: false,
      availableForSale: undefined,
      stock: 0,
    }),
  ];

  const recommendations = getRelatedProducts(currentFresh, catalog);
  assertEquals(recommendations.length, 1);
  assertEquals(recommendations[0].id, "in-stock");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 6: Recommendation Relevance Ranking
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REC-8: Prioritizes same category > same brand > similar specs > alternatives", () => {
  const current = createMockProduct({
    id: "current-pc",
    name: "IT HUB Gaming Rig Intel i5",
    category: "Desktops",
    brand: "IT-HUB",
    productType: "Gaming PC",
    condition: "New",
    secondHand: false,
    price: 65000,
    specs: { Socket: "LGA1700", RAM: "DDR4" },
  });

  const sameCatSameBrand = createMockProduct({
    id: "same-cat-same-brand",
    name: "IT HUB Creator Rig",
    category: "Desktops",
    brand: "IT-HUB",
    productType: "Workstation",
    condition: "New",
    secondHand: false,
    price: 70000,
  });

  const sameCatDiffBrand = createMockProduct({
    id: "same-cat-diff-brand",
    name: "Asus ROG Desktop",
    category: "Desktops",
    brand: "Asus",
    productType: "Gaming PC",
    condition: "New",
    secondHand: false,
    price: 80000,
  });

  const diffCatSameBrand = createMockProduct({
    id: "diff-cat-same-brand",
    name: "IT HUB Custom Mouse",
    category: "Accessories",
    brand: "IT-HUB",
    condition: "New",
    secondHand: false,
    price: 2000,
  });

  const diffCatDiffBrand = createMockProduct({
    id: "diff-cat-diff-brand",
    name: "Logitech Keyboard",
    category: "Accessories",
    brand: "Logitech",
    condition: "New",
    secondHand: false,
    price: 3000,
  });

  const catalog = [diffCatDiffBrand, diffCatSameBrand, sameCatDiffBrand, sameCatSameBrand, current];

  const recommendations = getRelatedProducts(current, catalog, { limit: 4 });

  // Order must prioritize same category + same brand first, then same category diff brand, then diff category same brand, then others
  assertEquals(recommendations[0].id, "same-cat-same-brand");
  assertEquals(recommendations[1].id, "same-cat-diff-brand");
  assertEquals(recommendations[2].id, "diff-cat-same-brand");
  assertEquals(recommendations[3].id, "diff-cat-diff-brand");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 7: Dynamic Product Availability & Live Catalog Changes
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REC-9: Reacts dynamically when product availability changes from in-stock to sold-out", () => {
  const currentFresh = createMockProduct({
    id: "f-target",
    name: "Target Product",
    condition: "New",
    secondHand: false,
  });
  const candA = createMockProduct({
    id: "cand-a",
    name: "Candidate A",
    condition: "New",
    secondHand: false,
    availableForSale: true,
    stock: 3,
  });
  const candB = createMockProduct({
    id: "cand-b",
    name: "Candidate B",
    condition: "New",
    secondHand: false,
    availableForSale: true,
    stock: 2,
  });

  const catalog = [currentFresh, candA, candB];

  // Initially both candA and candB are available
  const initial = getRelatedProducts(currentFresh, catalog);
  assertEquals(initial.length, 2);

  // When candA becomes unavailable in real-time
  const updatedCatalog = [currentFresh, { ...candA, availableForSale: false, stock: 0 }, candB];

  const afterUpdate = getRelatedProducts(currentFresh, updatedCatalog);
  assertEquals(afterUpdate.length, 1);
  assertEquals(afterUpdate[0].id, "cand-b");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 8: Navigation Simulation Between Fresh & Pre-Owned Detail Pages
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REC-10: Product detail navigation between Fresh and Pre-Owned products maintains strict isolation", () => {
  const freshProduct = createMockProduct({
    id: "fresh-laptop",
    name: "Dell Inspiron 15 (Brand New)",
    category: "Laptops",
    condition: "New",
    secondHand: false,
  });

  const preOwnedProduct = createMockProduct({
    id: "used-laptop",
    name: "Dell Inspiron 15 (Pre-owned)",
    category: "Laptops",
    condition: "Good",
    secondHand: true,
  });

  const sharedCatalog: Product[] = [
    freshProduct,
    preOwnedProduct,
    createMockProduct({
      id: "fresh-acc-1",
      name: "Fresh Bag",
      category: "Laptops",
      condition: "New",
      secondHand: false,
    }),
    createMockProduct({
      id: "fresh-acc-2",
      name: "Fresh Charger",
      category: "Laptops",
      condition: "New",
      secondHand: false,
    }),
    createMockProduct({
      id: "used-acc-1",
      name: "Pre-owned Dock",
      category: "Laptops",
      condition: "Like New",
      secondHand: true,
    }),
    createMockProduct({
      id: "used-acc-2",
      name: "Pre-owned Stand",
      category: "Laptops",
      condition: "Fair",
      secondHand: true,
    }),
  ];

  // Step 1: Customer views Fresh product
  const freshViewRecs = getRelatedProducts(freshProduct, sharedCatalog);
  assertEquals(
    freshViewRecs.every((p) => p.condition === "New" && !p.secondHand),
    true,
  );
  assertEquals(
    freshViewRecs.map((p) => p.id),
    ["fresh-acc-1", "fresh-acc-2"],
  );

  // Step 2: Customer navigates to Pre-owned product
  const preOwnedViewRecs = getRelatedProducts(preOwnedProduct, sharedCatalog);
  assertEquals(
    preOwnedViewRecs.every((p) => p.secondHand || p.condition !== "New"),
    true,
  );
  assertEquals(
    preOwnedViewRecs.map((p) => p.id),
    ["used-acc-1", "used-acc-2"],
  );

  // Ensure zero cross-contamination in either view
  assertEquals(
    freshViewRecs.some((p) => p.id.startsWith("used-")),
    false,
  );
  assertEquals(
    preOwnedViewRecs.some((p) => p.id.startsWith("fresh-")),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 9: Missing Target Condition Safety
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REC-11: Target product with missing or unknown condition yields empty recommendations safely", () => {
  const unclassifiedTarget = createMockProduct({
    id: "unclassified-item",
    name: "Mystery Product",
    condition: undefined,
    secondHand: false,
  });

  const catalog = [
    unclassifiedTarget,
    createMockProduct({ id: "f-1", name: "Fresh 1", condition: "New", secondHand: false }),
    createMockProduct({ id: "u-1", name: "Used 1", condition: "Good", secondHand: true }),
  ];

  // Because the target's condition cannot be authoritatively determined, do not make guesses
  const recs = getRelatedProducts(unclassifiedTarget, catalog);
  assertEquals(recs, []);
});
