// supabase/functions/tests/shopify-data-mapping.test.ts
// Automated Tests for Phase 3: Shopify Data Model, GID parsers, and Catalog/Component Mappers
// IT HUB — Kerala, India

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parseShopifyGid,
  toProductGid,
  toVariantGid,
  getMetafield,
  parseProductSpecs,
  resolveProductCondition,
  mapShopifyProductToCatalog,
  mapShopifyVariantToPcComponent,
  type ShopifyProductNode,
} from "../../../src/lib/shopify-schema.ts";

Deno.test("MAP-1: parseShopifyGid extracts numerical ID from Shopify GraphQL GIDs", () => {
  assertEquals(parseShopifyGid("gid://shopify/Product/789123456"), "789123456");
  assertEquals(parseShopifyGid("gid://shopify/ProductVariant/445566778"), "445566778");
  assertEquals(parseShopifyGid("gid://shopify/Order/11223344"), "11223344");
  assertEquals(parseShopifyGid("raw-id-999"), "raw-id-999");
  assertEquals(parseShopifyGid(""), "");
});

Deno.test("MAP-2: toProductGid and toVariantGid format GIDs idempotently", () => {
  assertEquals(toProductGid("12345"), "gid://shopify/Product/12345");
  assertEquals(toProductGid("gid://shopify/Product/12345"), "gid://shopify/Product/12345");
  assertEquals(toVariantGid("67890"), "gid://shopify/ProductVariant/67890");
  assertEquals(
    toVariantGid("gid://shopify/ProductVariant/67890"),
    "gid://shopify/ProductVariant/67890",
  );
});

Deno.test("MAP-3: getMetafield extracts targeted namespace and key safely", () => {
  const metafields = [
    { namespace: "pc_builder", key: "socket", value: "AM5", type: "single_line_text_field" },
    { namespace: "pc_builder", key: "watts", value: "65", type: "number_integer" },
    { namespace: "custom", key: "condition", value: "Like New", type: "single_line_text_field" },
    null,
  ];

  assertEquals(getMetafield(metafields, "pc_builder", "socket"), "AM5");
  assertEquals(getMetafield(metafields, "pc_builder", "watts"), "65");
  assertEquals(getMetafield(metafields, "custom", "condition"), "Like New");
  assertEquals(getMetafield(metafields, "custom", "non_existent"), undefined);
  assertEquals(getMetafield([], "custom", "key"), undefined);
  assertEquals(getMetafield(undefined, "custom", "key"), undefined);
});

Deno.test("MAP-4: parseProductSpecs parses tags and overlays metafields", () => {
  const tags = ["brand:ASUS", "form_factor=ATX", "gaming-grade", "socket:LGA1700"];
  const metafields = [
    {
      namespace: "pc_builder",
      key: "ram_generation",
      value: "DDR5",
      type: "single_line_text_field",
    },
  ];

  const specs = parseProductSpecs(tags, metafields);
  assertEquals(specs["brand"], "ASUS");
  assertEquals(specs["form_factor"], "ATX");
  assertEquals(specs["socket"], "LGA1700");
  assertEquals(specs["ram_generation"], "DDR5");
});

Deno.test("MAP-5: resolveProductCondition maps condition tags and metafields accurately", () => {
  // 1. Metafield precedence
  assertEquals(
    resolveProductCondition(
      [],
      [
        {
          namespace: "custom",
          key: "condition",
          value: "Like New",
          type: "single_line_text_field",
        },
      ],
    ),
    "Like New",
  );
  assertEquals(
    resolveProductCondition(
      [],
      [
        {
          namespace: "custom",
          key: "condition",
          value: "Fair condition",
          type: "single_line_text_field",
        },
      ],
    ),
    "Fair",
  );
  assertEquals(
    resolveProductCondition(
      [],
      [
        {
          namespace: "custom",
          key: "condition",
          value: "Salvage / Parts",
          type: "single_line_text_field",
        },
      ],
    ),
    "For Parts",
  );
  assertEquals(
    resolveProductCondition(
      [],
      [
        {
          namespace: "custom",
          key: "condition",
          value: "Refurbished Certified",
          type: "single_line_text_field",
        },
      ],
    ),
    "Good",
  );

  // 2. Tag fallback
  assertEquals(resolveProductCondition(["condition:like-new"]), "Like New");
  assertEquals(resolveProductCondition(["second-hand", "tested"]), "Good");
  assertEquals(resolveProductCondition(["refurbished-pc"]), "Good");

  // 3. Default to New
  assertEquals(resolveProductCondition(["brand:Intel", "sealed"]), "New");
});

Deno.test("MAP-6: mapShopifyProductToCatalog accurately maps product, pricing, MRP, and discount deal tags", () => {
  const mockNode: ShopifyProductNode = {
    id: "gid://shopify/Product/98765",
    title: "AMD Ryzen 7 7800X3D Gaming Processor",
    handle: "amd-ryzen-7-7800x3d",
    description: "The ultimate gaming desktop processor with AMD 3D V-Cache technology.",
    vendor: "AMD",
    productType: "Processors",
    tags: ["socket:AM5", "pc-part"],
    availableForSale: true,
    featuredImage: { url: "https://cdn.shopify.com/products/7800x3d.jpg" },
    images: {
      edges: [{ node: { url: "https://cdn.shopify.com/products/7800x3d.jpg" } }],
    },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/54321",
            title: "Default Title",
            sku: "AMD-R7-7800X3D",
            availableForSale: true,
            quantityAvailable: 15,
            price: { amount: "38990.00", currencyCode: "INR" },
            compareAtPrice: { amount: "45000.00", currencyCode: "INR" },
          },
        },
      ],
    },
    metafields: [
      {
        namespace: "custom",
        key: "warranty_summary",
        value: "3-Year Official AMD Warranty",
        type: "single_line_text_field",
      },
    ],
  };

  const catalogProduct = mapShopifyProductToCatalog(mockNode);

  assertEquals(catalogProduct.id, "98765");
  assertEquals(catalogProduct.name, "AMD Ryzen 7 7800X3D Gaming Processor");
  assertEquals(catalogProduct.brand, "AMD");
  assertEquals(catalogProduct.category, "Processors");
  assertEquals(catalogProduct.price, 38990);
  assertEquals(catalogProduct.original, 45000);
  assertEquals(catalogProduct.sku, "AMD-R7-7800X3D");
  assertEquals(catalogProduct.stock, 15);
  assertEquals(catalogProduct.secondHand, false);
  assertEquals(catalogProduct.condition, "New");
  assertEquals(catalogProduct.warranty, "3-Year Official AMD Warranty");
  assertEquals(catalogProduct.tag, "Deal");
  assertEquals(catalogProduct.image, "https://cdn.shopify.com/products/7800x3d.jpg");
});

Deno.test("MAP-7: mapShopifyVariantToPcComponent extracts hardware specifications for PC builder compatibility", () => {
  const mockNode: ShopifyProductNode = {
    id: "gid://shopify/Product/111222",
    title: "MSI MAG B650 TOMAHAWK WIFI Motherboard",
    handle: "msi-mag-b650-tomahawk-wifi",
    description: "Supports AMD Ryzen 7000/8000/9000 Series Desktop Processors for AM5 socket.",
    vendor: "MSI",
    productType: "Motherboards",
    tags: ["am5", "ddr5"],
    availableForSale: true,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/333444",
            title: "Standard",
            sku: "MSI-MAG-B650-TOM",
            availableForSale: true,
            quantityAvailable: 8,
            price: { amount: "21499.00", currencyCode: "INR" },
          },
        },
      ],
    },
    metafields: [
      { namespace: "pc_builder", key: "socket", value: "AM5", type: "single_line_text_field" },
      {
        namespace: "pc_builder",
        key: "ram_generation",
        value: "DDR5",
        type: "single_line_text_field",
      },
      { namespace: "pc_builder", key: "watts", value: "50", type: "number_integer" },
      { namespace: "pc_builder", key: "wifi", value: "true", type: "boolean" },
      { namespace: "pc_builder", key: "bios_update_required", value: "false", type: "boolean" },
    ],
  };

  const component = mapShopifyVariantToPcComponent(mockNode);

  assertEquals(component?.id, "333444");
  assertEquals(component?.name, "MSI MAG B650 TOMAHAWK WIFI Motherboard");
  assertEquals(component?.price, 21499);
  assertEquals(component?.socket, "AM5");
  assertEquals(component?.ram, "DDR5");
  assertEquals(component?.watts, 50);
  assertEquals(component?.wifi, true);
  assertEquals(component?.bios, false);
  assertEquals(component?.stock, 8);
});

Deno.test("MAP-8: GPU clearance and PSU capacity metafield mapping in mapShopifyVariantToPcComponent", () => {
  const gpuNode: ShopifyProductNode = {
    id: "gid://shopify/Product/777888",
    title: "ZOTAC GAMING GeForce RTX 4070 SUPER Twin Edge",
    handle: "zotac-rtx-4070-super-twin-edge",
    description: "Compact dual-fan design 234mm length.",
    vendor: "ZOTAC",
    productType: "Graphics Cards",
    tags: ["gpu"],
    availableForSale: true,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/888999",
            title: "Default",
            price: { amount: "58999.00", currencyCode: "INR" },
            availableForSale: true,
          },
        },
      ],
    },
    metafields: [
      { namespace: "pc_builder", key: "gpu_length_mm", value: "234", type: "number_integer" },
      { namespace: "pc_builder", key: "watts", value: "220", type: "number_integer" },
    ],
  };

  const gpuComponent = mapShopifyVariantToPcComponent(gpuNode);
  assertEquals(gpuComponent?.length, 234);
  assertEquals(gpuComponent?.watts, 220);

  const psuNode: ShopifyProductNode = {
    id: "gid://shopify/Product/444555",
    title: "Corsair RM750e 750W 80 Plus Gold Fully Modular PSU",
    handle: "corsair-rm750e-750w",
    description: "ATX 3.0 & PCIe 5.0 Compliant Power Supply.",
    vendor: "Corsair",
    productType: "Power Supplies",
    tags: ["psu"],
    availableForSale: false,
    images: { edges: [] },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/555666",
            title: "Default",
            price: { amount: "9499.00", currencyCode: "INR" },
            availableForSale: false,
          },
        },
      ],
    },
    metafields: [
      { namespace: "pc_builder", key: "capacity_watts", value: "750", type: "number_integer" },
    ],
  };

  const psuComponent = mapShopifyVariantToPcComponent(psuNode);
  assertEquals(psuComponent?.capacity, 750);
  assertEquals(psuComponent?.stock, 0);
});
