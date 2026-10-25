// supabase/functions/tests/pc-builder-phase1-specs.test.ts
// IT HUB PC Builder — Phase 1 Hardware Specifications & Database Registry Tests
// Verifies tri-state schema consistency, quarantine containment, audit immutability,
// and real Shopify product seeding.

import { assertEquals, assertNotEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts"

const {
  matchShopifyProductToComponent,
  registerDatabaseHardwareSpec,
  clearRegisteredDatabaseSpecs,
  buildBuilderCatalog,
} = await import("../../../src/lib/builder/catalog.ts")

const { checkCompatibility } = await import("../../../src/lib/builder/compatibility.ts")

Deno.test("PHASE1-1: Migration SQL enforces tri-state NULLs, audit immutability, and correlated variant RLS", async () => {
  const sql = await Deno.readTextFile("supabase/migrations/20261026000001_hardware_specifications.sql")

  // 1. Enums and tables exist
  assertMatch(sql, /create type public\.component_category as enum/i)
  assertMatch(sql, /create type public\.spec_verification_status as enum/i)
  assertMatch(sql, /create table if not exists public\.hardware_products/i)
  assertMatch(sql, /create table if not exists public\.hardware_variants/i)
  assertMatch(sql, /create table if not exists public\.hardware_spec_audit_log/i)

  // 2. Strict Tri-State: Verify no inappropriate defaults on critical technical columns
  // Should NOT contain default 0 or default false on technical dims
  assertEquals(sql.includes("m2_slot_count integer default 0"), false)
  assertEquals(sql.includes("sata_port_count integer default 0"), false)
  assertEquals(sql.includes("has_integrated_graphics boolean default false"), false)
  assertEquals(sql.includes("includes_stock_cooler boolean default false"), false)
  assertEquals(sql.includes("supported_motherboards text[] default '{}'"), false)
  assertEquals(sql.includes("supported_sockets text[] default '{}'"), false)
  assertEquals(sql.includes("is_laptop_sodimm boolean default false"), false)

  // 3. Immutability trigger on audit log
  assertMatch(sql, /create trigger trg_audit_log_immutable/i)
  assertMatch(sql, /raise exception 'Security Violation: Audit log entries are immutable/i)
  assertMatch(sql, /revoke update, delete on public\.hardware_spec_audit_log/i)

  // 4. Correlated variant RLS policy preventing leakage of quarantined parent products
  assertMatch(sql, /create policy "Allow read on active variants"/i)
  assertMatch(sql, /exists\s*\(\s*select 1 from public\.hardware_products p\s*where p\.id = product_id\s*and p\.verification_status != 'quarantined_rejected'\s*\)/i)
})

Deno.test("PHASE1-2: Seed script accurately maps the 9 live Shopify products", async () => {
  const sql = await Deno.readTextFile("supabase/migrations/20261026000001_hardware_specifications.sql")

  // AMD Ryzen 5 5600 is verified manufacturer
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452073165044/)
  assertMatch(sql, /gid:\/\/shopify\/ProductVariant\/67897419301108/)
  assertMatch(sql, /'verified_manufacturer'/)
  assertMatch(sql, /100-100000926BOX/)

  // Remaining 8 products are seeded as ambiguous_unverified with NULL technical specs
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452076409076/) // B550M
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452078538996/) // RAM
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452080275700/) // RTX 4060
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452081815796/) // 1TB SSD
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452083519732/) // 650W PSU
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452084404468/) // Case
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452084961524/) // Cooler
  assertMatch(sql, /gid:\/\/shopify\/Product\/15452153807092/) // RTX 5050
  assertMatch(sql, /'ambiguous_unverified'/)
})

Deno.test("PHASE1-3: Quarantine containment blocks variants belonging to quarantined parent products", () => {
  clearRegisteredDatabaseSpecs()

  // Register a variant whose parent product is quarantined
  registerDatabaseHardwareSpec("gid://shopify/ProductVariant/quarantined-child-1", {
    product: {
      id: "prod-bad-1",
      verification_status: "quarantined_rejected",
      model_family: "Defective Motherboard Model",
      category: "Motherboard",
    },
    variant: {
      id: "var-bad-1",
      shopify_variant_id: "gid://shopify/ProductVariant/quarantined-child-1",
      verification_status: "verified_manufacturer", // Child says verified, but parent is quarantined
    },
  })

  const testProduct: any = {
    id: "gid://shopify/Product/test-prod-1",
    name: "Defective Motherboard Model",
    price: 8000,
    productType: "Motherboard",
    tags: ["motherboard"],
    variantId: "gid://shopify/ProductVariant/quarantined-child-1",
    availableForSale: true,
    stock: 5,
  }

  // Must evaluate to null (completely quarantined from catalog and recommendations)
  const comp = matchShopifyProductToComponent(testProduct)
  assertEquals(comp, null)

  clearRegisteredDatabaseSpecs()
})

Deno.test("PHASE1-4: Database specification registry merges product and variant attributes correctly", () => {
  clearRegisteredDatabaseSpecs()

  registerDatabaseHardwareSpec("gid://shopify/ProductVariant/db-test-gpu-1", {
    product: {
      id: "prod-gpu-1",
      shopify_product_id: "gid://shopify/Product/test-gpu-prod",
      brand: "Gigabyte",
      model_family: "GeForce RTX 4060",
      category: "GPU",
      verification_status: "verified_manufacturer",
    },
    variant: {
      id: "var-gpu-1",
      shopify_variant_id: "gid://shopify/ProductVariant/db-test-gpu-1",
      length_mm: 272,
      tdp_watts: 115,
      rated_wattage: undefined,
      verification_status: "verified_manufacturer",
    },
  })

  const testProduct: any = {
    id: "gid://shopify/Product/test-gpu-prod",
    name: "Gigabyte GeForce RTX 4060 Eagle OC 8GB",
    price: 28000,
    productType: "Graphics Card",
    tags: ["gpu"],
    variantId: "gid://shopify/ProductVariant/db-test-gpu-1",
    availableForSale: true,
    stock: 3,
  }

  const comp = matchShopifyProductToComponent(testProduct)
  assertNotEquals(comp, null)
  assertEquals(comp?.slot, "GPU")
  assertEquals(comp?.price, 28000)
  assertEquals(comp?.isVerified, true)
  assertEquals(comp?.specs.provenance, "verified_manufacturer")
  assertEquals(comp?.specs.lengthMm, 272)
  assertEquals(comp?.specs.tdpWatts, 115)

  clearRegisteredDatabaseSpecs()
})

Deno.test("PHASE1-5: Tri-state NULL specifications preserve unknown status without false defaults", () => {
  clearRegisteredDatabaseSpecs()

  // Register an unverified generic product with NULL specifications
  registerDatabaseHardwareSpec("gid://shopify/ProductVariant/unverified-var-1", {
    product: {
      id: "prod-unverified-1",
      shopify_product_id: "gid://shopify/Product/unverified-prod-1",
      brand: undefined, // NULL
      model_family: "Generic Unverified CPU",
      category: "CPU",
      socket: undefined, // NULL (Unknown)
      tdp_watts: undefined, // NULL (Unknown)
      has_integrated_graphics: undefined, // NULL (Unknown)
      verification_status: "ambiguous_unverified",
    },
    variant: {
      id: "var-unverified-1",
      shopify_variant_id: "gid://shopify/ProductVariant/unverified-var-1",
      verification_status: "ambiguous_unverified",
    },
  })

  const testProduct: any = {
    id: "gid://shopify/Product/unverified-prod-1",
    name: "Generic Unverified CPU",
    price: 6000,
    productType: "Processor",
    tags: ["cpu"],
    variantId: "gid://shopify/ProductVariant/unverified-var-1",
    availableForSale: true,
    stock: 2,
  }

  const comp = matchShopifyProductToComponent(testProduct)
  assertNotEquals(comp, null)
  assertEquals(comp?.isVerified, false)
  assertEquals(comp?.specs.provenance, "ambiguous_unverified")
  assertEquals(comp?.specs.socket, undefined)
  assertEquals(comp?.specs.hasIntegratedGraphics, undefined)

  // Verify that checkCompatibility treats the unverified socket as Rule J UNKNOWN
  const summary = checkCompatibility({
    CPU: comp!,
    Motherboard: {
      slot: "Motherboard",
      productId: "mobo-1",
      variantId: "var-m-1",
      title: "Known B550 Board",
      price: 7000,
      currency: "INR",
      specs: { socket: "AM4", supportedRamGeneration: "DDR4" },
      availability: "available",
      quantity: 1,
      retrievedAt: new Date().toISOString(),
    },
  })

  const socketUnknown = summary.items.find((i) => i.ruleId === "RULE_A_SOCKET_UNKNOWN")
  assertNotEquals(socketUnknown, undefined)
  assertEquals(socketUnknown?.status, "unknown")

  clearRegisteredDatabaseSpecs()
})

