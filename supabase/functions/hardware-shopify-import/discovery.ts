// supabase/functions/hardware-shopify-import/discovery.ts
// Shopify Hardware Importer: reading the store's products through the Storefront API (read-only) and normalising them
// for staging. Pure apart from the injected fetcher and sleep, so every path is unit-tested without Shopify.
//
// The Storefront API shows published products only: drafts and archived products aren't discovered.

import { detectComponentSlot } from "../_shared/builder/slot-detection.ts";

export const PAGE_SIZE = 50;
/** At most this many pages per discovery (2,500 products). A larger store is reported as truncated. */
export const MAX_PAGES = 50;
export const MAX_ATTEMPTS = 4;

export const DISCOVERY_QUERY = `query HardwareImportProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      handle
      vendor
      productType
      tags
      availableForSale
      category { name }
      collections(first: 10) { nodes { title } }
      featuredImage { url }
      variants(first: 50) {
        nodes { id title sku availableForSale price { amount currencyCode } }
      }
    }
  }
}`;

/** One Storefront GraphQL answer: the HTTP status and the parsed body (null when it wasn't JSON). */
export interface StorefrontAnswer {
  status: number;
  body: any;
  retryAfterSeconds?: number | null;
}

export type StorefrontFetch = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<StorefrontAnswer>;

export interface ImportVariant {
  id: string;
  title: string | null;
  sku: string | null;
  price: string | null;
  currency: string | null;
  available: boolean | null;
}

/** A product as staged (the shape hardware_import_stage takes). */
export interface ImportProduct {
  id: string;
  title: string;
  handle: string | null;
  vendor: string | null;
  productType: string | null;
  category: string | null;
  tags: string[];
  collections: string[];
  imageUrl: string | null;
  availableForSale: boolean | null;
  variants: ImportVariant[];
  /** The builder's classifier, as a hint for staff (never applied by itself). */
  suggestedCategory: string | null;
}

export class DiscoveryError extends Error {
  constructor(
    public code:
      | "shopify_not_configured"
      | "shopify_unauthorized"
      | "shopify_throttled"
      | "shopify_unavailable"
      | "shopify_query_failed"
      | "shopify_invalid_response",
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/[0-9]+$/;
const VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/[0-9]+$/;
const REGISTRY_CATEGORIES = new Set([
  "CPU",
  "GPU",
  "Motherboard",
  "RAM",
  "Storage",
  "PSU",
  "Cabinet",
  "Cooler",
  "Monitor",
]);

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
};
const texts = (values: unknown, max: number, limit: number): string[] =>
  Array.isArray(values)
    ? values
        .map((v) => text(v, max))
        .filter((v): v is string => v !== null)
        .slice(0, limit)
    : [];

/**
 * One Storefront product node as a staged product, or null when it can't be one (no valid id or title). Unknown or
 * malformed fields are dropped, never guessed.
 */
export function normaliseProduct(node: any): ImportProduct | null {
  if (!node || typeof node !== "object") return null;
  const id = typeof node.id === "string" && PRODUCT_GID.test(node.id) ? node.id : null;
  const title = text(node.title, 300);
  if (!id || !title) return null;
  const vendor = text(node.vendor, 120);
  const productType = text(node.productType, 120);
  const category = text(node.category?.name, 120);
  const tags = texts(node.tags, 120, 100);
  const collections = texts(
    Array.isArray(node.collections?.nodes) ? node.collections.nodes.map((c: any) => c?.title) : [],
    120,
    20,
  );
  const variants: ImportVariant[] = (Array.isArray(node.variants?.nodes) ? node.variants.nodes : [])
    .filter((v: any) => v && typeof v.id === "string" && VARIANT_GID.test(v.id))
    .slice(0, 100)
    .map((v: any) => ({
      id: v.id,
      title: text(v.title, 255),
      sku: text(v.sku, 120),
      price:
        typeof v.price?.amount === "string" && /^[0-9]+(\.[0-9]+)?$/.test(v.price.amount)
          ? v.price.amount
          : null,
      currency: text(v.price?.currencyCode, 3),
      available: typeof v.availableForSale === "boolean" ? v.availableForSale : null,
    }));
  const slot = detectComponentSlot(title, productType ?? "", tags, category ?? "");
  const imageUrl =
    typeof node.featuredImage?.url === "string" && /^https:\/\//.test(node.featuredImage.url)
      ? node.featuredImage.url.slice(0, 1000)
      : null;
  return {
    id,
    title,
    handle: text(node.handle, 300),
    vendor,
    productType,
    category,
    tags,
    collections,
    imageUrl,
    availableForSale: typeof node.availableForSale === "boolean" ? node.availableForSale : null,
    variants,
    suggestedCategory: slot && REGISTRY_CATEGORIES.has(slot) ? slot : null,
  };
}

const throttled = (answer: StorefrontAnswer) =>
  answer.status === 429 ||
  (Array.isArray(answer.body?.errors) &&
    answer.body.errors.some((e: any) => e?.extensions?.code === "THROTTLED"));

/** One page, retried on throttling and server errors with growing waits. */
export async function fetchPage(
  fetcher: StorefrontFetch,
  after: string | null,
  sleep: (ms: number) => Promise<void>,
): Promise<{
  products: ImportProduct[];
  skipped: number;
  hasNextPage: boolean;
  endCursor: string | null;
}> {
  let last: StorefrontAnswer | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let answer: StorefrontAnswer;
    try {
      answer = await fetcher(DISCOVERY_QUERY, { first: PAGE_SIZE, after });
    } catch (error) {
      answer = { status: 0, body: null };
      last = answer;
      if (attempt === MAX_ATTEMPTS) {
        throw new DiscoveryError(
          "shopify_unavailable",
          "Shopify couldn't be reached",
          String(error).slice(0, 200),
        );
      }
      await sleep(1000 * 2 ** (attempt - 1));
      continue;
    }
    last = answer;
    if (answer.status === 401 || answer.status === 403) {
      throw new DiscoveryError("shopify_unauthorized", "Shopify refused the Storefront credential");
    }
    if (throttled(answer) || answer.status >= 500) {
      if (attempt === MAX_ATTEMPTS) break;
      const wait =
        answer.retryAfterSeconds && answer.retryAfterSeconds > 0
          ? Math.min(answer.retryAfterSeconds, 30) * 1000
          : 1000 * 2 ** (attempt - 1);
      await sleep(wait);
      continue;
    }
    if (answer.status !== 200 || !answer.body || typeof answer.body !== "object") {
      throw new DiscoveryError("shopify_invalid_response", `Shopify answered ${answer.status}`);
    }
    if (Array.isArray(answer.body.errors) && answer.body.errors.length > 0) {
      throw new DiscoveryError(
        "shopify_query_failed",
        "Shopify refused the product query",
        answer.body.errors.slice(0, 3).map((e: any) => String(e?.message ?? "").slice(0, 200)),
      );
    }
    const connection = answer.body.data?.products;
    if (
      !connection ||
      !Array.isArray(connection.nodes) ||
      typeof connection.pageInfo?.hasNextPage !== "boolean"
    ) {
      throw new DiscoveryError("shopify_invalid_response", "Shopify's answer has no product list");
    }
    const products: ImportProduct[] = [];
    let skipped = 0;
    for (const node of connection.nodes) {
      const product = normaliseProduct(node);
      if (product) products.push(product);
      else skipped++;
    }
    const endCursor =
      typeof connection.pageInfo.endCursor === "string" ? connection.pageInfo.endCursor : null;
    // A "next page" without a cursor can't be followed: stop rather than loop.
    return {
      products,
      skipped,
      hasNextPage: connection.pageInfo.hasNextPage && endCursor !== null,
      endCursor,
    };
  }
  if (last && throttled(last)) {
    throw new DiscoveryError(
      "shopify_throttled",
      "Shopify kept limiting requests; try again in a minute",
    );
  }
  throw new DiscoveryError(
    "shopify_unavailable",
    `Shopify kept failing (${last?.status ?? "no answer"})`,
  );
}

export interface DiscoveryProgress {
  pages: number;
  products: number;
  skipped: number;
  truncated: boolean;
}

/**
 * Every product, page by page. Each page is handed to `onPage` (which stages it) before the next is read, so a failure
 * part way keeps what was read and reports where it stopped.
 */
export async function discoverAll(
  fetcher: StorefrontFetch,
  onPage: (products: ImportProduct[]) => Promise<void>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  maxPages = MAX_PAGES,
): Promise<DiscoveryProgress> {
  const progress: DiscoveryProgress = { pages: 0, products: 0, skipped: 0, truncated: false };
  const seen = new Set<string>();
  let after: string | null = null;
  while (true) {
    const page = await fetchPage(fetcher, after, sleep);
    progress.pages++;
    progress.skipped += page.skipped;
    // The same product twice (a shifting catalogue) is staged once.
    const fresh = page.products.filter((p) => !seen.has(p.id));
    fresh.forEach((p) => seen.add(p.id));
    if (fresh.length > 0) await onPage(fresh);
    progress.products += fresh.length;
    if (!page.hasNextPage) break;
    if (progress.pages >= maxPages) {
      progress.truncated = true;
      break;
    }
    if (page.endCursor === after) break;
    after = page.endCursor;
  }
  return progress;
}
