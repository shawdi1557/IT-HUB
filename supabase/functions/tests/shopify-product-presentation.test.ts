// The storefront shows only what Shopify states: no invented warranties, ratings or demo wording,
// and the sort control describes the order customers actually see.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isConditionGradeStated,
  mapShopifyProductToCatalog,
} from "../../../src/lib/shopify-schema.ts";
import { warrantyMonths } from "../../../src/data/catalog.ts";

const read = (path: string) => Deno.readTextFileSync(path);

function node(extra: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/Product/1",
    title: "Synthetic Part",
    handle: "synthetic-part",
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
            id: "gid://shopify/ProductVariant/1",
            title: "Default Title",
            availableForSale: true,
            price: { amount: "1000.0", currencyCode: "INR" },
            selectedOptions: [],
          },
        },
      ],
    },
    metafields: [],
    ...extra,
  } as any;
}

const warrantyMetafield = (value: string) => ({
  namespace: "custom",
  key: "warranty_summary",
  value,
  type: "single_line_text_field",
});

Deno.test("WARRANTY: a warranty stated in Shopify is kept exactly", () => {
  const product = mapShopifyProductToCatalog(
    node({ metafields: [warrantyMetafield("5-Year SanDisk Limited Warranty")] }),
  );
  assertEquals(product.warranty, "5-Year SanDisk Limited Warranty");
});

Deno.test("WARRANTY: a new product with none stated has none", () => {
  assertEquals(mapShopifyProductToCatalog(node()).warranty, undefined);
});

Deno.test("WARRANTY: a second-hand product with none stated has none", () => {
  const product = mapShopifyProductToCatalog(node({ tags: ["used"] }));
  assertEquals(product.secondHand, true);
  assertEquals(product.warranty, undefined);
});

Deno.test("WARRANTY: nothing is inferred from a title or a category", () => {
  const product = mapShopifyProductToCatalog(
    node({
      title: "SANDISK Optimus 5100 SSD, 5Y Warranty",
      category: { id: "1", name: "Solid State Drives", ancestors: [] },
    }),
  );
  assertEquals(product.warranty, undefined);
});

Deno.test("WARRANTY: invented wording is gone from the storefront", () => {
  const files = [
    "src/lib/shopify-schema.ts",
    "src/components/ProductCard.tsx",
    "src/pages/Products.tsx",
    "src/pages/Support.tsx",
  ];
  for (const file of files) {
    const text = read(file);
    for (const claim of [
      "1-Year Official Manufacturer Warranty",
      "90-Day IT HUB Testing Warranty",
      "Brand warranty",
      "IT HUB Warranty",
      "1 Year Manufacturer",
    ]) {
      assert(!text.includes(claim), `${file} still claims "${claim}"`);
    }
  }
});

Deno.test("WARRANTY: a card hides the line, and a detail page says it isn't provided", () => {
  const card = read("src/components/ProductCard.tsx");
  assert(card.includes("{(product.specs?.Warranty || product.warranty) && ("));
  assert(read("src/pages/Products.tsx").includes('"Warranty information not provided"'));
});

Deno.test("WARRANTY: the neutral text gives no estimated expiry date", () => {
  assert(read("src/pages/Support.tsx").includes('"Warranty information not provided"'));
  assertEquals(warrantyMonths("Warranty information not provided"), null);
  assertEquals(warrantyMonths("2 years"), 24);
});

Deno.test("RATING: no rating is invented, and the filter is gone", () => {
  assertEquals(mapShopifyProductToCatalog(node()).rating, 0);
  const page = read("src/pages/Products.tsx");
  assert(!page.includes("Customer rating"), "the rating filter is back");
  assert(!page.includes("setRating"), "the rating filter is back");
});

Deno.test("SORT: the control names the order customers see, and real options remain", () => {
  const page = read("src/pages/Products.tsx");
  assert(page.includes('useState("Newest")'));
  assert(page.includes('options={["Newest", "Price: Low to High", "Price: High to Low"]'));
  assert(!page.includes('"Relevance"'), "the control claims an order that isn't used");
  assert(!page.includes('"Rating"'), "a sort by a rating that doesn't exist is back");
});

Deno.test("ACCOUNT: obsolete demo wording is gone, and sign-in code is untouched by it", () => {
  const account = read("src/pages/Account.tsx");
  for (const phrase of [
    "demo product data",
    "ACTIVE · DEMO",
    "demo orders",
    "Demo profile only",
    "There are no passwords or real authentication",
    "Expiry (demo)",
    "prototype warranty record",
  ]) {
    assert(!account.includes(phrase), `/account still says "${phrase}"`);
  }
});

Deno.test("PRESENTATION: a Used tag says a device is pre-owned, not that it's in good condition", () => {
  assertEquals(isConditionGradeStated(["Used"]), false);
  assertEquals(isConditionGradeStated(["second-hand", "refurbished"]), false);
  assertEquals(isConditionGradeStated(["Used", "good"]), true);
  assertEquals(isConditionGradeStated(["like-new"]), true);
  assertEquals(
    isConditionGradeStated([], [{ namespace: "custom", key: "condition", value: "Fair" }] as any),
    true,
  );
  assertEquals(
    isConditionGradeStated([], [{ namespace: "custom", key: "condition", value: "Used" }] as any),
    false,
  );

  const page = Deno.readTextFileSync("src/pages/Products.tsx");
  const card = Deno.readTextFileSync("src/components/ProductCard.tsx");
  assert(!page.includes("product.condition ? ` · ${product.condition}`"));
  assert(!card.includes("product.condition ? ` · ${product.condition}`"));
  assert(page.includes('product.conditionStated ? product.condition : "Not stated"'));
});
