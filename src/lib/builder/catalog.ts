// src/lib/builder/catalog.ts
// IT HUB Technical Hardware Catalog & Shopify Commerce Adapter
// Bridges authentic Shopify variant data with verified engineering specifications.

import type { CanonicalBuildComponent, ComponentSlotId, HardwareProductRecord } from "./types";
import type { Product, ComponentOption } from "../../data/catalog";
import { shopifyConfig, fetchAllShopifyProducts } from "../shopify";
import { toVariantGid } from "../shopify-schema";
import { supabase } from "../supabase";
import { resolveShopifyComponent, type DatabaseHardwareMapping } from "./spec-registry";
// Moved to their own module so the quotation server can use them (Stage 4S-1). Still exported from here.
export { detectComponentSlot, normalizeHardwareTitle } from "./slot-detection";
export type { DatabaseHardwareMapping } from "./spec-registry";

// In-memory registry for database-synced hardware specifications
const registeredDatabaseSpecs: Map<string, DatabaseHardwareMapping> = new Map();

export function registerDatabaseHardwareSpec(
  variantId: string,
  mapping: DatabaseHardwareMapping,
): void {
  registeredDatabaseSpecs.set(toVariantGid(variantId), mapping);
}

export function clearRegisteredDatabaseSpecs(): void {
  registeredDatabaseSpecs.clear();
}

export async function loadDatabaseHardwareSpecs(): Promise<void> {
  if (!supabase) return;
  try {
    const { data: variants, error: vErr } = await supabase
      .from("hardware_variants")
      .select("*, hardware_products(*)")
      .neq("verification_status", "quarantined_rejected");

    if (vErr || !variants) return;

    for (const v of variants) {
      const p = v.hardware_products as HardwareProductRecord;
      if (p && p.verification_status !== "quarantined_rejected") {
        registeredDatabaseSpecs.set(v.shopify_variant_id, { product: p, variant: v });
      }
    }
  } catch {
    // Non-blocking fallback to local verified registry
  }
}

// The specification registry and resolver live in spec-registry.ts since Stage 4S-2, so the quotation server can run
// them. Still exported from here.
export {
  VERIFIED_HARDWARE_SPECS,
  shopifyStatedValues,
  type RegistrySource,
  type VerifiedSpecEntry,
} from "./spec-registry";

/**
 * Maps a Shopify Storefront Product into a CanonicalBuildComponent with verified engineering specifications.
 */
export function matchShopifyProductToComponent(
  product: Product,
  slotHint?: ComponentSlotId,
): CanonicalBuildComponent | null {
  return resolveShopifyComponent(product, slotHint, {
    databaseSpecs: (variantGid) => registeredDatabaseSpecs.get(variantGid),
  });
}

/**
 * Builds the canonical builder catalog by aggregating live Shopify products.
 * Strictly adheres to Shopify as the sole authoritative source:
 * No static, mock, or reference fallbacks are ever inserted into customer-facing component selections.
 */
export function buildBuilderCatalog(
  shopifyProducts: Product[] = [],
): Record<ComponentSlotId, CanonicalBuildComponent[]> {
  const catalog: Record<ComponentSlotId, CanonicalBuildComponent[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
    CaseFans: [],
    Monitor: [],
  };

  // Process authentic Shopify products (Authoritative)
  for (const product of shopifyProducts) {
    const comp = matchShopifyProductToComponent(product);
    // Only available, eligible products with valid variant IDs and prices are selectable
    if (comp && comp.availability === "available" && comp.variantId && comp.price > 0) {
      catalog[comp.slot].push(comp);
    }
  }

  return catalog;
}

/**
 * Converts a CanonicalBuildComponent to the legacy ComponentOption model for backward compatibility with UI and Admin.
 */
export function toComponentOption(comp: CanonicalBuildComponent): ComponentOption {
  return {
    id: comp.productId,
    name: comp.title,
    price: comp.price,
    variantId: comp.variantId || undefined,
    isShopifyLive: comp.isShopifyLive,
    isVerified: comp.isVerified ?? comp.specs.provenance !== "unverified",
    provenance: comp.specs.provenance,
    matchedModelKey: comp.matchedModelKey,
    socket: comp.specs.socket,
    ram: comp.specs.supportedRamGeneration || comp.specs.ramGeneration,
    watts: comp.specs.tdpWatts || comp.specs.powerWatts,
    capacity: comp.specs.ratedWattage,
    length: comp.specs.lengthMm,
    clearance: comp.specs.maxGpuLengthMm,
    bios: comp.specs.requiresBiosUpdateForRyzen5000,
    wifi: comp.specs.hasWifi,
    interface: comp.specs.storageInterface,
    stock: comp.availability === "available" ? 6 : 0,
    includesCooler: comp.specs.includesCooler,
    hasIntegratedGraphics: comp.specs.hasIntegratedGraphics,
    specs: comp.specs,
    image: comp.imageUrl,
  };
}

export interface ReconciledBuildParts {
  parts: Record<string, ComponentOption>;
  /** Slots whose product isn't currently offered in the live catalogue. */
  unavailable: string[];
  /** Slots whose price moved since the build was saved. */
  priceChanged: string[];
}

/** A saved build may hold the engine's model or the builder's selection model. */
function asComponentOption(slot: string, part: any): ComponentOption {
  if (part && "productId" in part && !("id" in part)) {
    return toComponentOption({
      ...part,
      slot,
      specs: part.specs || {},
      availability: part.availability ?? "available",
    });
  }
  return part;
}

/**
 * Brings a saved or restored selection up to date with the live catalogue, which is the only source
 * of price and availability. A product no longer offered stays visible so the customer can replace
 * it, but marked out of stock. Until the catalogue has loaded, nothing can be concluded either way.
 */
export function reconcileBuildParts(
  parts: Record<string, any>,
  catalog: Record<string, ComponentOption[]>,
): ReconciledBuildParts {
  const result: ReconciledBuildParts = { parts: {}, unavailable: [], priceChanged: [] };
  const catalogLoaded = Object.values(catalog || {}).some((items) => items?.length > 0);

  for (const [slot, raw] of Object.entries(parts || {})) {
    if (!raw) continue;
    const part = asComponentOption(slot, raw);
    if (!catalogLoaded) {
      result.parts[slot] = part;
      continue;
    }
    const live = (catalog[slot] || []).find(
      (item) => item.id === part.id || Boolean(part.variantId && item.variantId === part.variantId),
    );
    if (!live) {
      result.parts[slot] = { ...part, stock: 0 };
      result.unavailable.push(slot);
      continue;
    }
    if (live.price !== part.price) result.priceChanged.push(slot);
    result.parts[slot] = live;
  }
  return result;
}

/**
 * Synchronizes the application's component catalog with live Shopify products.
 * Guarantees that Shopify is the authoritative source for pricing, variant IDs, and availability.
 * Never inserts mock or fallback hardware into the selectable component catalog.
 */
export function syncBuilderCatalogWithShopify(
  shopifyProducts: Product[] = [],
  _baselineCatalog?: Record<string, ComponentOption[]>,
): {
  componentCatalog: Record<string, ComponentOption[]>;
  canonicalCatalog: Record<ComponentSlotId, CanonicalBuildComponent[]>;
} {
  const canonicalCatalog = buildBuilderCatalog(shopifyProducts);
  const componentCatalog: Record<string, ComponentOption[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
  };

  for (const [slot, items] of Object.entries(canonicalCatalog)) {
    if (slot === "CaseFans") continue;
    componentCatalog[slot] = items.map(toComponentOption);
  }

  return { componentCatalog, canonicalCatalog };
}

const CATALOG_CACHE_TTL_MS = 15_000;
let cachedBuilderCatalog: Record<ComponentSlotId, CanonicalBuildComponent[]> | null = null;
let lastCatalogFetchTime = 0;

/**
 * Fetches builder components directly using the live Shopify catalog when configured.
 */
export async function fetchBuilderComponents(): Promise<
  Record<ComponentSlotId, CanonicalBuildComponent[]>
> {
  const now = Date.now();
  if (cachedBuilderCatalog && now - lastCatalogFetchTime < CATALOG_CACHE_TTL_MS) {
    return cachedBuilderCatalog;
  }

  let products: Product[] = [];
  if (shopifyConfig.isConfigured) {
    try {
      const res = await fetchAllShopifyProducts();
      if (res.products && res.products.length > 0) {
        products = res.products;
      }
    } catch {
      // Nothing is cached below when Shopify can't answer, so the next request tries again.
      return buildBuilderCatalog([]);
    }
  }

  const catalog = buildBuilderCatalog(products);
  cachedBuilderCatalog = catalog;
  lastCatalogFetchTime = now;
  return catalog;
}
