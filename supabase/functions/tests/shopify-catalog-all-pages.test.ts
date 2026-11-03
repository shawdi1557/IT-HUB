// Checks that a product published in Shopify reaches the storefront: every page is fetched, newest
// products come first, a failed page never shows a partial catalog, and the budget filter can't
// hide an expensive product. The Storefront API is stubbed, so this runs without a network.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// shopify.ts reads its configuration when it loads, so this must come before the import.
Deno.env.set("VITE_SHOPIFY_STORE_DOMAIN", "synthetic-store.myshopify.com");
Deno.env.set("VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN", "synthetic-storefront-token");

const { fetchAllShopifyProducts, invalidateShopifyCatalogCache, shopifyConfig } =
  await import("../../../src/lib/shopify.ts");
const { priceFilterCeiling } = await import("../../../src/lib/categoryMapping.ts");

// The environment is shared with every other test file in this run, so these can't stay set.
Deno.env.delete("VITE_SHOPIFY_STORE_DOMAIN");
Deno.env.delete("VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN");

function node(id: number) {
  return {
    id: `gid://shopify/Product/${id}`,
    title: `Synthetic Product ${id}`,
    handle: `synthetic-product-${id}`,
    description: "",
    descriptionHtml: "",
    vendor: "Synthetic Brand",
    productType: "",
    tags: [],
    availableForSale: true,
    options: [],
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: `gid://shopify/ProductVariant/${id}`,
            title: "Default Title",
            availableForSale: true,
            price: { amount: "1000.0", currencyCode: "INR" },
            selectedOptions: [],
          },
        },
      ],
    },
    metafields: [],
  };
}

type Page = { ids: number[]; hasNextPage: boolean; endCursor?: string } | "http-500";

/** Stubs the Storefront API with the given pages, and records each request's variables. */
function stubStorefront(pages: Page[]) {
  const requests: Record<string, unknown>[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    const { variables } = JSON.parse(String(init.body));
    requests.push(variables);
    const page = pages[requests.length - 1];
    if (!page || page === "http-500") {
      return Promise.resolve(new Response("failure", { status: 500 }));
    }
    return Promise.resolve(
      Response.json({
        data: {
          products: {
            pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
            edges: page.ids.map((id) => ({ cursor: String(id), node: node(id) })),
          },
        },
      }),
    );
  }) as typeof fetch;
  invalidateShopifyCatalogCache();
  return { requests, restore: () => (globalThis.fetch = realFetch) };
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from - i);

Deno.test("ALL-PAGES: the stub reaches a configured client", () => {
  assert(shopifyConfig.isConfigured, "the tests below would pass without running anything");
});

Deno.test("ALL-PAGES: products beyond the first 100 are fetched, in order", async () => {
  const stub = stubStorefront([
    { ids: range(1000, 100), hasNextPage: true, endCursor: "page-1" },
    { ids: range(900, 100), hasNextPage: true, endCursor: "page-2" },
    { ids: range(800, 7), hasNextPage: false },
  ]);
  try {
    const result = await fetchAllShopifyProducts({ force: true });
    assertEquals(result.error, undefined);
    assertEquals(result.isLive, true);
    assertEquals(result.hasNextPage, false);
    assertEquals(result.products.length, 207);
    assertEquals(result.products[0].id, "1000");
    assertEquals(result.products[206].id, "794");
    assertEquals(
      stub.requests.map((r) => r.after),
      [null, "page-1", "page-2"],
    );
  } finally {
    stub.restore();
  }
});

Deno.test("ALL-PAGES: every page asks for the newest products first", async () => {
  const stub = stubStorefront([
    { ids: [2], hasNextPage: true, endCursor: "next" },
    { ids: [1], hasNextPage: false },
  ]);
  try {
    await fetchAllShopifyProducts({ force: true });
    for (const request of stub.requests) {
      assertEquals(request.sortKey, "CREATED_AT");
      assertEquals(request.reverse, true);
    }
  } finally {
    stub.restore();
  }
});

Deno.test("ALL-PAGES: a failed page gives an error, never part of the catalog", async () => {
  const stub = stubStorefront([
    { ids: range(1000, 100), hasNextPage: true, endCursor: "page-1" },
    "http-500",
  ]);
  try {
    const result = await fetchAllShopifyProducts({ force: true });
    assert(result.error, "the failure wasn't reported");
    assertEquals(result.products, []);
    assertEquals(result.isLive, false);
  } finally {
    stub.restore();
  }
});

Deno.test("ALL-PAGES: a missing cursor stops with an error instead of repeating", async () => {
  const stub = stubStorefront([{ ids: [1], hasNextPage: true }]);
  try {
    const result = await fetchAllShopifyProducts({ force: true });
    assert(result.error, "the missing cursor wasn't reported");
    assertEquals(result.products, []);
    assertEquals(stub.requests.length, 1);
  } finally {
    stub.restore();
  }
});

Deno.test("ALL-PAGES: a product moved onto the next page isn't listed twice", async () => {
  const stub = stubStorefront([
    { ids: [3, 2], hasNextPage: true, endCursor: "next" },
    { ids: [2, 1], hasNextPage: false },
  ]);
  try {
    const result = await fetchAllShopifyProducts({ force: true });
    assertEquals(
      result.products.map((p) => p.id),
      ["3", "2", "1"],
    );
  } finally {
    stub.restore();
  }
});

Deno.test("ALL-PAGES: the storefront and PC Builder both use the full catalog", () => {
  const store = Deno.readTextFileSync("src/app/store.tsx");
  const builder = Deno.readTextFileSync("src/lib/builder/catalog.ts");
  assert(store.includes("fetchAllShopifyProducts({ force: options.force })"));
  assert(builder.includes("await fetchAllShopifyProducts()"));
  assert(!store.includes("first: 100"), "the storefront is limited to one page again");
  assert(!builder.includes("first: 100"), "PC Builder is limited to one page again");
});

Deno.test("BUDGET: the slider rises to reach the most expensive product", () => {
  assertEquals(priceFilterCeiling([]), 150000);
  assertEquals(priceFilterCeiling([{ price: 2100 }]), 150000);
  assertEquals(priceFilterCeiling([{ price: 150000 }]), 150000);
  assertEquals(priceFilterCeiling([{ price: 150001 }]), 151000);
  assertEquals(priceFilterCeiling([{ price: 2100 }, { price: 249999.5 }]), 250000);
  assertEquals(priceFilterCeiling([{ price: Number.NaN }, { price: 200000 }]), 200000);
});

Deno.test("BUDGET: the listing's default filter follows the catalog", () => {
  const page = Deno.readTextFileSync("src/pages/Products.tsx");
  assert(page.includes("const max = budgetChoice ?? priceCeiling;"));
  assert(page.includes("max={priceCeiling}"));
  assert(!page.includes("max={150000}"), "products above the old limit are hidden again");
  assert(!page.includes("useState(150000)"), "products above the old limit are hidden again");
});
