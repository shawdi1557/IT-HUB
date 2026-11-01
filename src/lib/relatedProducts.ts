// src/lib/relatedProducts.ts
// Related Products Recommendation Engine & Strict Condition Segregation
// IT HUB — Kerala, India

import type { Product, ProductCondition } from "../data/catalog";

const PRE_OWNED_CONDITIONS: readonly ProductCondition[] = ["Like New", "Good", "Fair", "For Parts"];

export type DetailedProductClassification = "fresh" | "pre-owned" | "unclassified";

export type ProductConditionLike = ProductCondition | string;

export type ProductClassificationInput =
  | (Omit<Partial<Product>, "condition"> & { condition?: ProductConditionLike })
  | null
  | undefined;

/**
 * Resolves the authoritative condition classification of a product.
 * Evaluates explicit condition, secondHand flag, tags, and collections.
 * Returns: "fresh" | "pre-owned" | "unclassified"
 */
export function getDetailedProductClassification(
  product?: ProductClassificationInput,
): DetailedProductClassification {
  if (!product) return "unclassified";

  // 1. Check explicit pre-owned indicators first (strict quarantine)
  if (product.secondHand === true) return "pre-owned";
  if (product.condition && product.condition !== "New") {
    if (PRE_OWNED_CONDITIONS.includes(product.condition as ProductCondition)) {
      return "pre-owned";
    }
  }
  if (Array.isArray(product.tags)) {
    const normTags = product.tags.map((t) => t.toLowerCase().trim());
    if (
      normTags.some(
        (t) =>
          t === "used" ||
          t === "pre-owned" ||
          t === "preowned" ||
          t === "second hand" ||
          t === "refurbished" ||
          t === "for parts",
      )
    ) {
      return "pre-owned";
    }
  }

  // 2. Check explicit fresh indicators
  if (product.condition === "New") {
    return "fresh";
  }
  if (Array.isArray(product.tags)) {
    const normTags = product.tags.map((t) => t.toLowerCase().trim());
    if (normTags.includes("new")) {
      return "fresh";
    }
  }
  if (Array.isArray(product.collections)) {
    const normCols = product.collections.map((c) => c.toLowerCase().trim());
    if (normCols.some((c) => c.includes("fresh"))) {
      return "fresh";
    }
  }

  // 3. Unclassified: Missing explicit classification metadata
  return "unclassified";
}

/**
 * Validates whether a product is strictly Fresh (Brand New).
 * Rules:
 * - Must NOT be second-hand (`secondHand` must be falsy).
 * - Must NOT contain any used/pre-owned tags.
 * - Must be explicitly classified as "fresh".
 * - Unclassified/missing condition is NEVER treated as Fresh.
 */
export function isFreshProduct(product?: ProductClassificationInput): boolean {
  if (!product) return false;
  return getDetailedProductClassification(product) === "fresh";
}

/**
 * Filters the catalog to extract strictly fresh, in-stock products for Featured Products display.
 * Guarantees zero pre-owned or unclassified items are included.
 */
export function filterFeaturedFreshProducts(products: Product[], limit: number = 8): Product[] {
  if (!Array.isArray(products)) return [];
  return products
    .filter((product) => isFreshProduct(product) && isProductAvailable(product))
    .slice(0, limit);
}

/**
 * Validates whether a product is strictly Pre-Owned.
 * Rules:
 * - Second-hand flag truthy, OR
 * - Product condition is one of: "Like New", "Good", "Fair", "For Parts".
 * - A product with condition "New" and secondHand false is NOT pre-owned.
 * - Missing condition with secondHand false is NOT pre-owned.
 */
export function isPreOwnedProduct(product?: ProductClassificationInput): boolean {
  if (!product) return false;
  if (product.secondHand) return true;
  if (product.condition && product.condition !== "New") {
    return PRE_OWNED_CONDITIONS.includes(product.condition as ProductCondition);
  }
  return false;
}

/**
 * Resolves the authoritative condition classification of a product.
 * Returns: "fresh" | "pre-owned" | "unknown"
 */
export function getProductConditionClassification(
  product?: ProductClassificationInput,
): "fresh" | "pre-owned" | "unknown" {
  if (isFreshProduct(product)) return "fresh";
  if (isPreOwnedProduct(product)) return "pre-owned";
  return "unknown";
}

/**
 * Determines whether a product is available for sale according to existing storefront rules.
 */
export function isProductAvailable(product?: Product | null): boolean {
  if (!product) return false;
  if (product.availableForSale !== undefined) {
    return Boolean(product.availableForSale);
  }
  if (typeof product.stock === "number") {
    return product.stock > 0;
  }
  return true;
}

export interface RelatedProductsOptions {
  limit?: number;
}

/**
 * Calculates a relevance score for a candidate product relative to the target product.
 * Ranking priorities (within the same condition):
 * 1. Same product category (+100)
 * 2. Same brand (+50)
 * 3. Similar product type (+25)
 * 4. Matching specifications (+10 per key/val, up to +20)
 * 5. Relevant price alternative (+5)
 */
function calculateRelevanceScore(target: Product, candidate: Product): number {
  let score = 0;

  // 1. Same product category
  if (
    target.category &&
    candidate.category &&
    target.category.trim().toLowerCase() === candidate.category.trim().toLowerCase()
  ) {
    score += 100;
  }

  // 2. Same brand
  if (
    target.brand &&
    candidate.brand &&
    target.brand.trim().toLowerCase() === candidate.brand.trim().toLowerCase()
  ) {
    score += 50;
  }

  // 3. Similar product type
  if (
    target.productType &&
    candidate.productType &&
    target.productType.trim().toLowerCase() === candidate.productType.trim().toLowerCase()
  ) {
    score += 25;
  }

  // 4. Similar specifications
  if (target.specs && candidate.specs) {
    let specMatches = 0;
    for (const [key, val] of Object.entries(target.specs)) {
      if (
        val &&
        candidate.specs[key] &&
        candidate.specs[key].trim().toLowerCase() === val.trim().toLowerCase()
      ) {
        specMatches++;
        if (specMatches >= 2) break;
      }
    }
    score += specMatches * 10;
  }

  // 5. Price proximity (within +/- 35% price bracket)
  if (target.price > 0 && candidate.price > 0) {
    const ratio = candidate.price / target.price;
    if (ratio >= 0.65 && ratio <= 1.35) {
      score += 5;
    }
  }

  return score;
}

/**
 * Returns strictly segregated related products for a given product.
 *
 * Guarantees:
 * - Fresh products receive ONLY Fresh recommendations.
 * - Pre-Owned products receive ONLY Pre-Owned recommendations.
 * - Current product is strictly excluded.
 * - Out-of-stock and unavailable products are excluded.
 * - Products with missing/unknown conditions are excluded.
 * - If insufficient products match, returns fewer or empty array (NEVER mixes conditions).
 */
export function getRelatedProducts(
  currentProduct: Product | null | undefined,
  catalog: Product[],
  options: RelatedProductsOptions = {},
): Product[] {
  if (!currentProduct || !Array.isArray(catalog) || catalog.length === 0) {
    return [];
  }

  const limit = options.limit && options.limit > 0 ? options.limit : 4;
  const targetClassification = getProductConditionClassification(currentProduct);

  // If the target product condition cannot be authoritatively determined, do not guess
  if (targetClassification === "unknown") {
    return [];
  }

  const isCurrentId = (p: Product) =>
    p.id === currentProduct.id ||
    (currentProduct.handle && p.handle && p.handle === currentProduct.handle);

  const matchingCandidates = catalog.filter((candidate) => {
    // 1. Exclude self
    if (isCurrentId(candidate)) return false;

    // 2. Exclude unavailable products
    if (!isProductAvailable(candidate)) return false;

    // 3. Strict condition segregation
    if (targetClassification === "fresh") {
      return isFreshProduct(candidate);
    }

    if (targetClassification === "pre-owned") {
      return isPreOwnedProduct(candidate);
    }

    return false;
  });

  // Sort by relevance score, tiebreaking by rating or ID
  matchingCandidates.sort((a, b) => {
    const scoreA = calculateRelevanceScore(currentProduct, a);
    const scoreB = calculateRelevanceScore(currentProduct, b);
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    const ratingDiff = (b.rating || 0) - (a.rating || 0);
    if (ratingDiff !== 0) return ratingDiff;
    return a.id.localeCompare(b.id);
  });

  return matchingCandidates.slice(0, limit);
}
