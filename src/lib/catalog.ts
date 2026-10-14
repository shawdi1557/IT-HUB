// src/lib/catalog.ts
// Type-Safe Catalog Client Service & PostgREST Abstraction Layer
// IT HUB — Kerala, India (Phase 3)

import { supabase } from "./supabase"
import type {
  Product,
  Offer,
  Coupon,
  OfferType,
  CouponType,
  ProductCondition,
} from "../data/catalog"
import { initialProducts, initialOffers, initialCoupons } from "../data/catalog"

/**
 * Raw PostgreSQL row shape from public.products_public view.
 */
export interface DatabaseProductRow {
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

/**
 * Raw PostgreSQL row shape from public.live_offers view.
 */
export interface LiveOfferRow {
  id: string
  name: string
  description: string | null
  type: string
  discount_percent: number | null
  discount_amount: number | null
  starts_at: string
  ends_at: string
  banner_path: string | null
  active: boolean
  created_at?: string
}

/**
 * Raw PostgreSQL row shape from public.public_coupons view.
 */
export interface PublicCouponRow {
  id: string
  code: string
  description: string | null
  type: string
  value: number
  min_order_value: number
  max_discount: number | null
  starts_at: string
  ends_at: string
}

/**
 * Filtering, searching, sorting, and pagination parameters.
 */
export interface CatalogFilterOptions {
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

/**
 * Transforms a raw database view row into the canonical storefront Product model.
 */
export function mapDatabaseProduct(row: DatabaseProductRow): Product {
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
    image: row.image_url || DEFAULT_IMAGE_FALLBACK,
    stock: Number(row.stock || 0),
    lowStockThreshold: Number(row.low_stock_threshold || 3),
    rating: 4.8,
    specs,
    tag,
    warranty: row.warranty || undefined,
    weight: row.weight || undefined,
    status: row.status as "Active" | "Draft" | "Archived" || "Active",
    secondHand: Boolean(row.second_hand),
    condition:
      row.condition as ProductCondition || (row.second_hand ? "Good" : "New"),
  }
}

/**
 * Transforms a raw live_offers database row into the storefront Offer model.
 */
export function mapDatabaseOffer(row: LiveOfferRow): Offer {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    type: row.type as OfferType || "Seasonal Offer",
    discount: Number(row.discount_percent || 0),
    amount: Number(row.discount_amount || 0),
    products: [],
    categories: [],
    brands: [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    banner: row.banner_path || "",
    active: Boolean(row.active),
  }
}

/**
 * Transforms a raw public_coupons database row into the storefront Coupon model.
 */
export function mapDatabaseCoupon(row: PublicCouponRow): Coupon {
  return {
    id: row.id,
    code: row.code.toUpperCase(),
    description: row.description || "",
    type: row.type as CouponType || "percentage",
    value: Number(row.value || 0),
    minOrderValue: Number(row.min_order_value || 0),
    maxDiscount: Number(row.max_discount || 0),
    usageType: "one_time",
    totalUsageLimit: 0,
    timesUsed: 0,
    active: true,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.starts_at,
  }
}

/**
 * In-memory fallback filter function used when Supabase is unreachable.
 */
export function filterFallbackProducts(
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

/**
 * Fetches the active storefront catalog from the products_public database view.
 * Gracefully falls back to local data if the database or network is unavailable.
 */
export async function fetchCatalog(
  options: CatalogFilterOptions = {},
): Promise<Product[]> {
  if (!supabase) {
    return filterFallbackProducts(initialProducts, options)
  }

  try {
    let query = supabase.from("products_public").select("*")

    if (
      options.category &&
      options.category.trim() !== "" &&
      options.category !== "All"
    ) {
      query = query.eq("category", options.category.trim())
    }

    if (
      options.brand &&
      options.brand.trim() !== "" &&
      options.brand !== "All"
    ) {
      query = query.eq("brand", options.brand.trim())
    }

    if (typeof options.secondHand === "boolean") {
      query = query.eq("second_hand", options.secondHand)
    }

    if (typeof options.minPrice === "number" && !isNaN(options.minPrice)) {
      query = query.gte("effective_price", options.minPrice)
    }

    if (typeof options.maxPrice === "number" && !isNaN(options.maxPrice)) {
      query = query.lte("effective_price", options.maxPrice)
    }

    if (options.search && options.search.trim() !== "") {
      const term = `%${options.search.trim()}%`
      query = query.or(
        `name.ilike.${term},description.ilike.${term},sku.ilike.${term}`,
      )
    }

    if (options.sortBy === "price_asc") {
      query = query.order("effective_price", { ascending: true })
    } else if (options.sortBy === "price_desc") {
      query = query.order("effective_price", { ascending: false })
    } else if (options.sortBy === "name") {
      query = query.order("name", { ascending: true })
    } else {
      query = query.order("created_at", { ascending: false })
    }

    if (typeof options.limit === "number" && options.limit > 0) {
      const offset =
        typeof options.offset === "number" && options.offset > 0
          ? options.offset
          : 0
      query = query.range(offset, offset + options.limit - 1)
    }

    const { data, error } = await query

    if (error) {
      console.warn(
        "[catalog] products_public query failed; using fallback catalog:",
        error.message,
      )
      return filterFallbackProducts(initialProducts, options)
    }

    if (!data || data.length === 0) {
      return filterFallbackProducts(initialProducts, options)
    }

    return (data as DatabaseProductRow[]).map(mapDatabaseProduct)
  } catch (err: any) {
    console.warn(
      "[catalog] network error querying products_public; using fallback catalog:",
      err?.message || err,
    )
    return filterFallbackProducts(initialProducts, options)
  }
}

/**
 * Fetches a single product by UUID or SKU.
 */
export async function fetchProductById(
  idOrSku: string,
): Promise<Product | null> {
  if (!idOrSku || !idOrSku.trim()) return null

  const trimmed = idOrSku.trim()

  if (!supabase) {
    return (
      initialProducts.find((p) => p.id === trimmed || p.sku === trimmed) || null
    )
  }

  try {
    const { data, error } = await supabase
      .from("products_public")
      .select("*")
      .or(`id.eq.${trimmed},sku.eq.${trimmed}`)
      .maybeSingle()

    if (error || !data) {
      return (
        initialProducts.find((p) => p.id === trimmed || p.sku === trimmed) ||
        null
      )
    }

    return mapDatabaseProduct(data as DatabaseProductRow)
  } catch {
    return (
      initialProducts.find((p) => p.id === trimmed || p.sku === trimmed) || null
    )
  }
}

/**
 * Fetches currently active promotional offers from public.live_offers view.
 */
export async function fetchActiveOffers(): Promise<Offer[]> {
  if (!supabase) return initialOffers

  try {
    const { data, error } = await supabase
      .from("live_offers")
      .select("*")
      .order("created_at", { ascending: false })

    if (error || !data || data.length === 0) {
      return initialOffers
    }

    return (data as LiveOfferRow[]).map(mapDatabaseOffer)
  } catch {
    return initialOffers
  }
}

/**
 * Fetches eligible storefront coupons from public.public_coupons view.
 */
export async function fetchActiveCoupons(): Promise<Coupon[]> {
  if (!supabase) return initialCoupons

  try {
    const { data, error } = await supabase
      .from("public_coupons")
      .select("*")
      .order("min_order_value", { ascending: true })

    if (error || !data || data.length === 0) {
      return initialCoupons
    }

    return (data as PublicCouponRow[]).map(mapDatabaseCoupon)
  } catch {
    return initialCoupons
  }
}

/**
 * Fetches secondary gallery images for a product from public.product_images table.
 */
export async function fetchProductGallery(
  productId: string,
): Promise<string[]> {
  if (!productId || !productId.trim() || !supabase) return []

  try {
    const { data, error } = await supabase
      .from("product_images")
      .select("storage_path")
      .eq("product_id", productId.trim())
      .order("position", { ascending: true })

    if (error || !data || data.length === 0) {
      return []
    }

    return data
      .map((item: { storage_path: string }) => item.storage_path)
      .filter(Boolean)
  } catch {
    return []
  }
}
