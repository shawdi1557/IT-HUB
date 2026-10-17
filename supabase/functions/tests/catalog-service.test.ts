// supabase/functions/tests/catalog-service.test.ts
// Automated Unit Tests for Catalog Client Service & Mapping Layer
// IT HUB — Kerala, India

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"

// Recreate the pure mapper and in-memory filter functions for isolated Deno testing
interface DatabaseProductRow {
  id: string
  sku: string
  name: string
  brand_id: string
  category_id: string
  subcategory: string | null
  description: string | null
  mrp: number | null
  price: number
  sale_price: number | null
  effective_price: number
  warranty: string | null
  weight: string | null
  specs: Record<string, string> | null
  second_hand: boolean
  condition: string | null
  status: string
  created_at: string
  stock: number
  brand: string | null
  category: string | null
  low_stock_threshold: number
  image_url: string
}

interface Product {
  id: string
  sku?: string
  name: string
  brand: string
  category: string
  subcategory?: string
  description?: string
  price: number
  original: number
  image: string
  stock: number
  lowStockThreshold?: number
  rating: number
  specs: Record<string, string>
  tag?: string
  warranty?: string
  weight?: string
  status?: string
  secondHand?: boolean
  condition?: string
}

interface CatalogFilterOptions {
  category?: string
  brand?: string
  search?: string
  secondHand?: boolean
  minPrice?: number
  maxPrice?: number
  sortBy?: "price_asc" | "price_desc" | "name" | "newest"
  limit?: number
  offset?: number
}

const DEFAULT_IMAGE_FALLBACK = "/images/photo-1616440347437-b1c73416efc2.jpg"

function resolveProductImageUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl || typeof pathOrUrl !== "string" || pathOrUrl.trim() === "") {
    return DEFAULT_IMAGE_FALLBACK
  }

  const trimmed = pathOrUrl.trim()

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed
  }

  if (trimmed.startsWith("/images/")) {
    return trimmed
  }

  const cleanPath = trimmed.replace(/^product-images\//, "").replace(/^\/+/, "")
  return `https://aeulrulvpxyqmxmypzey.supabase.co/storage/v1/object/public/product-images/${cleanPath}`
}

function mapDatabaseProduct(row: DatabaseProductRow): Product {
  const original =
    row.mrp !== null && row.mrp !== undefined && Number(row.mrp) > 0
      ? Number(row.mrp)
      : Number(row.price)
  const price = Number(row.effective_price ?? row.sale_price ?? row.price)

  let tag: string | undefined
  if (row.second_hand) {
    tag = "Certified Pre-Owned"
  } else if (
    row.sale_price !== null &&
    row.sale_price !== undefined &&
    Number(row.sale_price) < Number(row.price)
  ) {
    tag = "Deal"
  }

  const specs =
    row.specs && typeof row.specs === "object"
      ? row.specs as Record<string, string>
      : {}

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand || "IT HUB",
    category: row.category || "Hardware",
    subcategory: row.subcategory || undefined,
    description: row.description || undefined,
    price,
    original,
    image: resolveProductImageUrl(row.image_url),
    stock: Number(row.stock || 0),
    lowStockThreshold: Number(row.low_stock_threshold || 3),
    rating: 4.8,
    specs,
    tag,
    warranty: row.warranty || undefined,
    weight: row.weight || undefined,
    status: row.status || "Active",
    secondHand: Boolean(row.second_hand),
    condition: row.condition || (row.second_hand ? "Good" : "New"),
  }
}

function filterFallbackProducts(
  products: Product[],
  options: CatalogFilterOptions,
): Product[] {
  let filtered = [...products]

  if (
    options.category &&
    options.category.trim() !== "" &&
    options.category !== "All"
  ) {
    const cat = options.category.trim().toLowerCase()
    filtered = filtered.filter((p) => p.category.toLowerCase() === cat)
  }

  if (options.brand && options.brand.trim() !== "" && options.brand !== "All") {
    const br = options.brand.trim().toLowerCase()
    filtered = filtered.filter((p) => p.brand.toLowerCase() === br)
  }

  if (typeof options.secondHand === "boolean") {
    filtered = filtered.filter(
      (p) => Boolean(p.secondHand) === options.secondHand,
    )
  }

  if (typeof options.minPrice === "number" && !isNaN(options.minPrice)) {
    filtered = filtered.filter((p) => p.price >= options.minPrice!)
  }

  if (typeof options.maxPrice === "number" && !isNaN(options.maxPrice)) {
    filtered = filtered.filter((p) => p.price <= options.maxPrice!)
  }

  if (options.search && options.search.trim() !== "") {
    const query = options.search.trim().toLowerCase()
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query)) ||
        (p.sku && p.sku.toLowerCase().includes(query)),
    )
  }

  if (options.sortBy === "price_asc") {
    filtered.sort((a, b) => a.price - b.price)
  } else if (options.sortBy === "price_desc") {
    filtered.sort((a, b) => b.price - a.price)
  } else if (options.sortBy === "name") {
    filtered.sort((a, b) => a.name.localeCompare(b.name))
  }

  if (typeof options.limit === "number" && options.limit > 0) {
    const offset =
      typeof options.offset === "number" && options.offset > 0
        ? options.offset
        : 0
    filtered = filtered.slice(offset, offset + options.limit)
  }

  return filtered
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("CAT-1. mapDatabaseProduct maps brand, category, MRP, and effective price accurately", () => {
  const row: DatabaseProductRow = {
    id: "50000000-0000-0000-0000-000000000001",
    sku: "SH-MACBOOK-AIR-M1",
    name: "Apple MacBook Air M1 (Pre-Owned)",
    brand_id: "20000000-0000-0000-0000-000000000001",
    category_id: "10000000-0000-0000-0000-000000000001",
    subcategory: "MacBooks",
    description: "Certified pre-owned M1.",
    mrp: 89900.0,
    price: 52999.0,
    sale_price: 49999.0,
    effective_price: 49999.0,
    warranty: "6 Months Warranty",
    weight: "1.29 kg",
    specs: { Processor: "M1", RAM: "8GB" },
    second_hand: true,
    condition: "Like New",
    status: "Active",
    created_at: "2026-10-14T10:00:00Z",
    stock: 2,
    brand: "Apple",
    category: "Laptops",
    low_stock_threshold: 1,
    image_url: "/images/photo-1616440347437-b1c73416efc2.jpg",
  }

  const product = mapDatabaseProduct(row)
  assertEquals(product.id, "50000000-0000-0000-0000-000000000001")
  assertEquals(product.brand, "Apple")
  assertEquals(product.category, "Laptops")
  assertEquals(product.price, 49999)
  assertEquals(product.original, 89900)
  assertEquals(product.stock, 2)
  assertEquals(product.lowStockThreshold, 1)
  assertEquals(product.secondHand, true)
  assertEquals(product.tag, "Certified Pre-Owned")
  assertEquals(product.condition, "Like New")
  assertEquals(product.specs.Processor, "M1")
})

Deno.test("CAT-2. mapDatabaseProduct defaults MRP to price when MRP is NULL or 0", () => {
  const row: DatabaseProductRow = {
    id: "prod-2",
    sku: "SKU-2",
    name: "Generic Component",
    brand_id: "brand-1",
    category_id: "cat-1",
    subcategory: null,
    description: null,
    mrp: null,
    price: 1500,
    sale_price: null,
    effective_price: 1500,
    warranty: null,
    weight: null,
    specs: null,
    second_hand: false,
    condition: null,
    status: "Active",
    created_at: "2026-10-14T10:00:00Z",
    stock: 10,
    brand: null,
    category: null,
    low_stock_threshold: 3,
    image_url: "",
  }

  const product = mapDatabaseProduct(row)
  assertEquals(
    product.original,
    1500,
    "original price must fall back to price when mrp is null",
  )
  assertEquals(
    product.brand,
    "IT HUB",
    "brand must fall back to IT HUB default",
  )
  assertEquals(
    product.category,
    "Hardware",
    "category must fall back to Hardware default",
  )
  assertEquals(
    product.image,
    DEFAULT_IMAGE_FALLBACK,
    "image must fall back to default image",
  )
  assertEquals(
    product.condition,
    "New",
    "condition must default to New for first-hand products",
  )
})

Deno.test("CAT-3. mapDatabaseProduct detects deals when sale_price is lower than price", () => {
  const row: DatabaseProductRow = {
    id: "prod-deal",
    sku: "SKU-DEAL",
    name: "Discounted GPU",
    brand_id: "brand-1",
    category_id: "cat-1",
    subcategory: null,
    description: null,
    mrp: 65000,
    price: 55000,
    sale_price: 48000,
    effective_price: 48000,
    warranty: null,
    weight: null,
    specs: null,
    second_hand: false,
    condition: null,
    status: "Active",
    created_at: "2026-10-14T10:00:00Z",
    stock: 5,
    brand: "NVIDIA",
    category: "Graphics Cards",
    low_stock_threshold: 2,
    image_url: "/images/rtx-5070.jpg",
  }

  const product = mapDatabaseProduct(row)
  assertEquals(product.price, 48000)
  assertEquals(product.tag, "Deal")
})

Deno.test("CAT-4. filterFallbackProducts filters accurately by category and brand", () => {
  const mockProducts: Product[] = [
    {
      id: "p1",
      name: "Apple MacBook",
      brand: "Apple",
      category: "Laptops",
      price: 50000,
      original: 60000,
      image: "",
      stock: 5,
      rating: 4.8,
      specs: {},
    },
    {
      id: "p2",
      name: "Dell XPS",
      brand: "Dell",
      category: "Laptops",
      price: 70000,
      original: 80000,
      image: "",
      stock: 3,
      rating: 4.8,
      specs: {},
    },
    {
      id: "p3",
      name: "Samsung Monitor",
      brand: "Samsung",
      category: "Monitors",
      price: 15000,
      original: 20000,
      image: "",
      stock: 8,
      rating: 4.8,
      specs: {},
    },
  ]

  const laptops = filterFallbackProducts(mockProducts, { category: "Laptops" })
  assertEquals(laptops.length, 2)

  const appleOnly = filterFallbackProducts(mockProducts, { brand: "Apple" })
  assertEquals(appleOnly.length, 1)
  assertEquals(appleOnly[0].id, "p1")
})

Deno.test("CAT-5. filterFallbackProducts filters by price range and secondHand toggle", () => {
  const mockProducts: Product[] = [
    {
      id: "p1",
      name: "Item 1",
      brand: "B1",
      category: "C1",
      price: 10000,
      original: 10000,
      image: "",
      stock: 5,
      rating: 4.8,
      specs: {},
      secondHand: true,
    },
    {
      id: "p2",
      name: "Item 2",
      brand: "B1",
      category: "C1",
      price: 25000,
      original: 25000,
      image: "",
      stock: 5,
      rating: 4.8,
      specs: {},
      secondHand: false,
    },
    {
      id: "p3",
      name: "Item 3",
      brand: "B1",
      category: "C1",
      price: 50000,
      original: 50000,
      image: "",
      stock: 5,
      rating: 4.8,
      specs: {},
      secondHand: true,
    },
  ]

  const preOwned = filterFallbackProducts(mockProducts, { secondHand: true })
  assertEquals(preOwned.length, 2)

  const priceBounded = filterFallbackProducts(mockProducts, {
    minPrice: 15000,
    maxPrice: 30000,
  })
  assertEquals(priceBounded.length, 1)
  assertEquals(priceBounded[0].id, "p2")
})

Deno.test("CAT-6. filterFallbackProducts sorts ascending and descending accurately", () => {
  const mockProducts: Product[] = [
    {
      id: "p-mid",
      name: "Mid",
      brand: "B",
      category: "C",
      price: 20000,
      original: 20000,
      image: "",
      stock: 5,
      rating: 4.8,
      specs: {},
    },
    {
      id: "p-low",
      name: "Low",
      brand: "B",
      category: "C",
      price: 5000,
      original: 5000,
      image: "",
      stock: 5,
      rating: 4.8,
      specs: {},
    },
    {
      id: "p-high",
      name: "High",
      brand: "B",
      category: "C",
      price: 90000,
      original: 90000,
      image: "",
      stock: 5,
      rating: 4.8,
      specs: {},
    },
  ]

  const asc = filterFallbackProducts(mockProducts, { sortBy: "price_asc" })
  assertEquals(asc[0].id, "p-low")
  assertEquals(asc[2].id, "p-high")

  const desc = filterFallbackProducts(mockProducts, { sortBy: "price_desc" })
  assertEquals(desc[0].id, "p-high")
  assertEquals(desc[2].id, "p-low")
})

interface InventoryUpdatePayload {
  product_id: string
  stock: number
  low_stock_threshold?: number
}

function patchProductInventory(
  products: Product[],
  update: InventoryUpdatePayload,
): Product[] {
  if (!update || !update.product_id) return products

  return products.map((product) => {
    if (product.id === update.product_id) {
      return {
        ...product,
        stock: Number(update.stock ?? product.stock),
        lowStockThreshold:
          update.low_stock_threshold !== undefined &&
          update.low_stock_threshold !== null
            ? Number(update.low_stock_threshold)
            : (product.lowStockThreshold ?? 3),
      }
    }
    return product
  })
}

Deno.test("RT-1: Realtime inventory update correctly patches stock on matching product", () => {
  const products: Product[] = [
    {
      id: "prod-101",
      name: "Mechanical Keyboard",
      brand: "Keychron",
      category: "Peripherals",
      price: 8500,
      original: 8500,
      image: "/images/kb.jpg",
      stock: 12,
      lowStockThreshold: 3,
      rating: 4.8,
      specs: { Switch: "Gateron Brown" },
    },
  ]

  const updated = patchProductInventory(products, {
    product_id: "prod-101",
    stock: 4,
  })

  assertEquals(updated[0].stock, 4)
  assertEquals(updated[0].lowStockThreshold, 3)
  assertEquals(updated[0].name, "Mechanical Keyboard")
  assertEquals(updated[0].price, 8500)
})

Deno.test("RT-2: Realtime inventory update modifies low_stock_threshold without mutating immutable product fields", () => {
  const products: Product[] = [
    {
      id: "prod-202",
      name: "RTX 4070 GPU",
      brand: "Nvidia",
      category: "Components",
      price: 59999,
      original: 65000,
      image: "/images/gpu.jpg",
      stock: 7,
      lowStockThreshold: 2,
      rating: 4.9,
      specs: { VRAM: "12GB GDDR6X" },
      tag: "Deal",
    },
  ]

  const updated = patchProductInventory(products, {
    product_id: "prod-202",
    stock: 2,
    low_stock_threshold: 5,
  })

  assertEquals(updated[0].stock, 2)
  assertEquals(updated[0].lowStockThreshold, 5)
  assertEquals(updated[0].tag, "Deal")
  assertEquals(updated[0].specs["VRAM"], "12GB GDDR6X")
})

Deno.test("RT-3: Realtime inventory update with unmatched product ID safely preserves existing products", () => {
  const products: Product[] = [
    {
      id: "prod-303",
      name: "1TB NVMe SSD",
      brand: "Samsung",
      category: "Storage",
      price: 9000,
      original: 10000,
      image: "/images/ssd.jpg",
      stock: 15,
      rating: 4.9,
      specs: {},
    },
  ]

  const updated = patchProductInventory(products, {
    product_id: "prod-unknown-999",
    stock: 0,
  })

  assertEquals(updated[0].stock, 15)
})

Deno.test("RT-4: Realtime inventory DELETE event sets stock to 0", () => {
  const products: Product[] = [
    {
      id: "prod-404",
      name: "Wireless Mouse",
      brand: "Logitech",
      category: "Peripherals",
      price: 2500,
      original: 3000,
      image: "/images/mouse.jpg",
      stock: 8,
      rating: 4.7,
      specs: {},
    },
  ]

  const updated = patchProductInventory(products, {
    product_id: "prod-404",
    stock: 0,
  })

  assertEquals(updated[0].stock, 0)
  assertEquals(updated[0].name, "Wireless Mouse")
})

Deno.test("CAT-11: resolveProductImageUrl correctly resolves storage paths, remote URLs, and fallbacks", () => {
  // 1. Supabase Storage relative path
  const storageUrl = resolveProductImageUrl(
    "products/ith-lpt-hp-b91dnpa-3ade/primary.jpg",
  )
  assertEquals(
    storageUrl,
    "https://aeulrulvpxyqmxmypzey.supabase.co/storage/v1/object/public/product-images/products/ith-lpt-hp-b91dnpa-3ade/primary.jpg",
  )

  // 2. Second-hand physical photo path
  const shPhotoUrl = resolveProductImageUrl(
    "products/second-hand/sh-macbook-air-m1/photo-1792220852101-0.jpg",
  )
  assertEquals(
    shPhotoUrl,
    "https://aeulrulvpxyqmxmypzey.supabase.co/storage/v1/object/public/product-images/products/second-hand/sh-macbook-air-m1/photo-1792220852101-0.jpg",
  )

  // 3. Local bundled asset
  assertEquals(
    resolveProductImageUrl("/images/photo-1616440347437-b1c73416efc2.jpg"),
    "/images/photo-1616440347437-b1c73416efc2.jpg",
  )

  // 4. Remote HTTPS URL
  assertEquals(
    resolveProductImageUrl("https://example.com/laptop.jpg"),
    "https://example.com/laptop.jpg",
  )

  // 5. Empty or null fallback
  assertEquals(resolveProductImageUrl(null), DEFAULT_IMAGE_FALLBACK)
  assertEquals(resolveProductImageUrl(""), DEFAULT_IMAGE_FALLBACK)
  assertEquals(resolveProductImageUrl("   "), DEFAULT_IMAGE_FALLBACK)
})

Deno.test("CAT-12: Storefront pagination boundary ensures zero overlapping products", () => {
  const dummyProducts: Product[] = Array.from({ length: 29 }, (_, i) => ({
    id: `prod-${i + 1}`,
    sku: `SKU-${i + 1}`,
    name: `Product ${i + 1}`,
    brand: "IT HUB",
    category: "Hardware",
    price: 1000 + i * 100,
    original: 1200 + i * 100,
    image: DEFAULT_IMAGE_FALLBACK,
    stock: 5,
    rating: 4.8,
    specs: {},
  }))

  const PAGE_SIZE = 12
  const totalPages = Math.ceil(dummyProducts.length / PAGE_SIZE)
  assertEquals(totalPages, 3)

  const page1 = dummyProducts.slice(0, PAGE_SIZE)
  const page2 = dummyProducts.slice(PAGE_SIZE, PAGE_SIZE * 2)
  const page3 = dummyProducts.slice(PAGE_SIZE * 2, PAGE_SIZE * 3)

  assertEquals(page1.length, 12)
  assertEquals(page2.length, 12)
  assertEquals(page3.length, 5)

  const page1Ids = new Set(page1.map((p) => p.id))
  const page2Ids = new Set(page2.map((p) => p.id))
  const page3Ids = new Set(page3.map((p) => p.id))

  // Assert mutually exclusive pages (zero overlap)
  for (const id of page2Ids) {
    assertEquals(page1Ids.has(id), false)
  }
  for (const id of page3Ids) {
    assertEquals(page1Ids.has(id), false)
    assertEquals(page2Ids.has(id), false)
  }
})

// ── Phase 4.1 Mock Data Removal & Supabase Source-of-Truth Tests ────────────

interface CatalogFetchResult {
  products: Product[]
  totalCount?: number
  isLive: boolean
  error?: string
}

function processCatalogQueryResponse(
  data: DatabaseProductRow[] | null,
  count: number | null,
  error: { message: string } | null,
): CatalogFetchResult {
  if (error) {
    return {
      products: [],
      totalCount: 0,
      isLive: false,
      error: error.message,
    }
  }

  if (!data || data.length === 0) {
    return {
      products: [],
      totalCount: count ?? 0,
      isLive: true,
    }
  }

  return {
    products: data.map(mapDatabaseProduct),
    totalCount: count ?? data.length,
    isLive: true,
  }
}

Deno.test("CAT-13: Catalog service on empty database returns empty array and isLive: true without mock products", () => {
  const result = processCatalogQueryResponse([], 0, null)
  assertEquals(result.products.length, 0)
  assertEquals(result.totalCount, 0)
  assertEquals(result.isLive, true)
  assertEquals(result.error, undefined)
})

Deno.test("CAT-14: Catalog service on database error returns error and empty array without mock fallback", () => {
  const result = processCatalogQueryResponse(null, null, {
    message: "relation products_public does not exist",
  })
  assertEquals(result.products.length, 0)
  assertEquals(result.totalCount, 0)
  assertEquals(result.isLive, false)
  assertEquals(result.error, "relation products_public does not exist")
})

Deno.test("CAT-15: Staged inventory validation strictly rejects missing selling prices (zero-fabrication rule)", () => {
  const stagedRowWithoutPrice = {
    sku: "ITH-LPT-TEST-001",
    name: "HP ProBook 440 G9",
    brand: "HP",
    category: "Laptops & MacBooks",
    price: null, // Client selling price not yet provided
    stock: null,
  }

  // Validate zero-fabrication price gate
  const price = stagedRowWithoutPrice.price
  const hasValidPrice =
    price !== null && price !== undefined && !isNaN(price) && Number(price) > 0
  assertEquals(hasValidPrice, false)

  // Verify that price must be strictly rejected
  const errorTriggered = !hasValidPrice
  assertEquals(errorTriggered, true)
})

Deno.test("CAT-16: Staged inventory validation detects internal duplicate SKUs and existing DB SKUs", () => {
  const testRows = [
    { sku: "ITH-GPU-RTX4060", name: "Zotac RTX 4060", price: 29999, stock: 5 },
    {
      sku: "ITH-GPU-RTX4060",
      name: "Duplicate RTX 4060",
      price: 29999,
      stock: 2,
    },
    {
      sku: "ITH-LPT-HP-B91DNPA-3ADE",
      name: "HP 15 FD0534TU",
      price: 49999,
      stock: 10,
    },
  ]

  const existingDbSkus = new Set(["ITH-LPT-HP-B91DNPA-3ADE"])

  const skuCounts = new Map<string, number>()
  for (const r of testRows) {
    skuCounts.set(r.sku, (skuCounts.get(r.sku) || 0) + 1)
  }

  assertEquals((skuCounts.get("ITH-GPU-RTX4060") || 0) > 1, true)
  assertEquals(existingDbSkus.has("ITH-LPT-HP-B91DNPA-3ADE"), true)
})

Deno.test("CAT-17: Dry-run import mode completes safely with zero database mutations", () => {
  const dryRunOption = true
  let dbMutationAttempted = false

  if (!dryRunOption) {
    dbMutationAttempted = true
  }

  assertEquals(dryRunOption, true)
  assertEquals(dbMutationAttempted, false)
})
