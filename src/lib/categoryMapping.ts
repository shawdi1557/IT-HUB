// src/lib/categoryMapping.ts
// Canonical Category Mapping & Accurate Count Aggregation Architecture
// IT HUB — Kerala, India

import type { Product } from "../data/catalog.ts";

export const WEBSITE_CATEGORIES = [
  "Laptops",
  "Mobiles",
  "PC Components",
  "Printers",
  "Monitors",
  "Storage",
  "Computer Accessories",
  "Headphones & Audio",
  "Networking",
  "Gaming",
] as const;

export type WebsiteCategory = (typeof WEBSITE_CATEGORIES)[number];

// Standard alias resolution for navigation & backwards compatibility
const CATEGORY_ALIASES: Record<string, WebsiteCategory> = {
  accessories: "Computer Accessories",
  "computer accessories": "Computer Accessories",
  audio: "Headphones & Audio",
  "headphones & audio": "Headphones & Audio",
  mobiles: "Mobiles",
  mobile: "Mobiles",
  smartphones: "Mobiles",
  phones: "Mobiles",
  laptops: "Laptops",
  laptop: "Laptops",
  "pc components": "PC Components",
  components: "PC Components",
  printers: "Printers",
  printer: "Printers",
  monitors: "Monitors",
  monitor: "Monitors",
  storage: "Storage",
  networking: "Networking",
  gaming: "Gaming",
};

/**
 * Normalizes any category string or alias to its canonical website category name.
 */
export function normalizeCategoryName(rawCategory?: string | null): WebsiteCategory | null {
  if (!rawCategory || typeof rawCategory !== "string") return null;
  const clean = rawCategory.trim().toLowerCase();
  return CATEGORY_ALIASES[clean] || null;
}

/**
 * Maps a Shopify product (including its taxonomy category, productType, and tags)
 * deterministically into exactly one of the 10 canonical website categories.
 * Returns null if the product cannot be confidently classified.
 */
export function mapToWebsiteCategory(product?: Partial<Product> | null): WebsiteCategory | null {
  if (!product) return null;

  // Collect all searchable category signals from the product
  const signals: string[] = [];

  if (product.category) signals.push(product.category.toLowerCase().trim());
  if (product.productType) signals.push(product.productType.toLowerCase().trim());
  if (product.taxonomyCategory?.name)
    signals.push(product.taxonomyCategory.name.toLowerCase().trim());
  if (product.taxonomyCategory?.fullName)
    signals.push(product.taxonomyCategory.fullName.toLowerCase().trim());

  if (Array.isArray(product.tags)) {
    for (const t of product.tags) {
      if (typeof t === "string") signals.push(t.toLowerCase().trim());
    }
  }

  if (Array.isArray(product.collections)) {
    for (const c of product.collections) {
      if (typeof c === "string") signals.push(c.toLowerCase().trim());
    }
  }

  // 1. Mobiles & Tablets
  if (
    signals.some(
      (s) =>
        s.includes("smart phone") ||
        s.includes("smartphone") ||
        s.includes("mobile phone") ||
        s.includes("cell phone") ||
        s.includes("mobile & smart phone") ||
        s.includes("tablet") ||
        s === "mobiles" ||
        s === "mobile",
    )
  ) {
    return "Mobiles";
  }

  // 2. Laptops & Notebooks
  if (
    signals.some(
      (s) =>
        s.includes("laptop") ||
        s.includes("notebook computer") ||
        s.includes("notebook") ||
        s.includes("macbook"),
    )
  ) {
    return "Laptops";
  }

  // 3. PC Components (Processors, Motherboards, RAM, GPUs, Power Supplies, Cabinets)
  if (
    signals.some(
      (s) =>
        s.includes("processor") ||
        s.includes("motherboard") ||
        s === "ram" ||
        s.includes("video card") ||
        s.includes("graphics card") ||
        s.includes("computer component") ||
        s.includes("power suppl") ||
        s.includes("smps") ||
        s.includes("cabinet") ||
        s.includes("thermal management") ||
        s === "cpu" ||
        s === "gpu",
    )
  ) {
    return "PC Components";
  }

  // 4. Monitors & Displays
  if (signals.some((s) => s.includes("monitor") || s.includes("display"))) {
    return "Monitors";
  }

  // 5. Printers & Scanners
  if (
    signals.some(
      (s) =>
        s.includes("printer") ||
        s.includes("copier") ||
        s.includes("scanner") ||
        s.includes("ink") ||
        s.includes("toner"),
    )
  ) {
    return "Printers";
  }

  // 6. Storage (SSDs, Hard Drives, Memory)
  if (
    signals.some(
      (s) =>
        s.includes("solid state drive") ||
        s.includes("hard drive") ||
        s.includes("storage") ||
        s.includes("nvme") ||
        s.includes("ssd") ||
        s.includes("hdd") ||
        s.includes("flash drive"),
    )
  ) {
    return "Storage";
  }

  // 7. Computer Accessories (Keyboards, Mice, Mouse Pads, Webcams, Cables)
  if (
    signals.some(
      (s) =>
        s.includes("keyboard") ||
        s.includes("mouse") ||
        s.includes("mouse pad") ||
        s.includes("webcam") ||
        s.includes("accessories") ||
        s.includes("accessory"),
    )
  ) {
    return "Computer Accessories";
  }

  // 8. Headphones & Audio (Headsets, Speakers, Soundbars)
  if (
    signals.some(
      (s) =>
        s.includes("headphone") ||
        s.includes("headset") ||
        s.includes("speaker") ||
        s.includes("soundbar") ||
        s.includes("audio") ||
        s.includes("earphone") ||
        s.includes("tws"),
    )
  ) {
    return "Headphones & Audio";
  }

  // 9. Networking & Security (Routers, Switches, Modems, CCTV)
  if (
    signals.some(
      (s) =>
        s.includes("router") ||
        s.includes("switch") ||
        s.includes("modem") ||
        s.includes("cctv") ||
        s.includes("networking") ||
        s.includes("access point") ||
        s.includes("wi-fi") ||
        s.includes("wifi"),
    )
  ) {
    return "Networking";
  }

  // 10. Gaming (Consoles, Controllers, Gaming Gear)
  if (
    signals.some(
      (s) =>
        s.includes("gaming") ||
        s.includes("game console") ||
        s.includes("controller") ||
        s.includes("playstation") ||
        s.includes("xbox") ||
        s.includes("nintendo"),
    )
  ) {
    return "Gaming";
  }

  return null;
}

/**
 * Determines whether a product matches a category filter selection on the homepage
 * or product listing page, taking aliases and canonical categories into account.
 */
export function matchesCategoryFilter(
  product?: Product | null,
  filterCategory?: string | null,
): boolean {
  if (!product) return false;
  if (!filterCategory || !filterCategory.trim() || filterCategory === "All") return true;

  const targetCanonical = normalizeCategoryName(filterCategory);
  const productCanonical = mapToWebsiteCategory(product);

  if (targetCanonical && productCanonical) {
    return targetCanonical === productCanonical;
  }

  // Fallback: Direct string match on raw category if unmapped
  if (product.category && typeof filterCategory === "string") {
    return product.category.toLowerCase().trim() === filterCategory.toLowerCase().trim();
  }

  return false;
}

const DEFAULT_PRICE_CEILING = 150000;

/**
 * The top of the listing page's budget slider. It rises with the catalog, so a product priced above
 * the usual range is still listed and can still be reached.
 */
export function priceFilterCeiling(products: Pick<Product, "price">[]): number {
  const highest = products.reduce(
    (top, product) => (Number.isFinite(product.price) ? Math.max(top, product.price) : top),
    0,
  );
  return Math.max(DEFAULT_PRICE_CEILING, Math.ceil(highest / 1000) * 1000);
}

/**
 * Accurately calculates product counts for each canonical website category from the catalog.
 * Follows consistent deduplication and visibility rules.
 */
export function calculateCategoryCounts(products: Product[]): Record<string, number> {
  const counts: Record<string, number> = {};

  // Initialize all canonical categories with 0
  for (const cat of WEBSITE_CATEGORIES) {
    counts[cat] = 0;
  }
  // Initialize aliases
  counts["Accessories"] = 0;
  counts["Audio"] = 0;

  if (!Array.isArray(products)) return counts;

  for (const product of products) {
    const canonical = mapToWebsiteCategory(product);
    if (canonical && counts[canonical] !== undefined) {
      counts[canonical]++;
      // Populate aliases
      if (canonical === "Computer Accessories") {
        counts["Accessories"]++;
      } else if (canonical === "Headphones & Audio") {
        counts["Audio"]++;
      }
    }
  }

  return counts;
}
