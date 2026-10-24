import { useEffect, useMemo, useState } from "react"
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router"
import {
  Search,
  SlidersHorizontal,
  X,
  ArrowRight,
  Heart,
  Minus,
  Plus,
  Truck,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  BadgeIndianRupee,
  AlertTriangle,
  LoaderCircle,
  Star,
  CheckCircle2,
  MessageSquare,
  PenLine,
} from "lucide-react"
import { useStore } from "../app/store"
import { track } from "../lib/analytics"
import {
  fetchProductGallery,
  fetchProductById,
  DEFAULT_IMAGE_FALLBACK,
} from "../lib/catalog"
import {
  bestOffer,
  categories,
  money,
  offerHeadline,
  type Product,
} from "../data/catalog"
import {
  fetchShopifyProduct,
  shopifyConfig,
  createShopifyCart,
  checkShopifyAvailability,
  toVariantGid,
} from "../lib/shopify"
import { sanitizeHtml, resolveProductDescription } from "../lib/sanitize"
import ProductCard, { ProductImage } from "../components/ProductCard"
import SellYourItem from "../components/SellYourItem"
import {
  ActionLink,
  Badge,
  Button,
  Empty,
  Field,
  Page,
  PageHeading,
  fieldClass,
  Stars,
  Select,
} from "../components/ui"

export function Products() {
  const store = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [brand, setBrand] = useState(params.get("brand") || "")
  const [max, setMax] = useState(150000)
  const [available, setAvailable] = useState(false)
  const [rating, setRating] = useState(0)
  const [sort, setSort] = useState("Relevance")
  const [showFilters, setShowFilters] = useState(false)
  const [specs, setSpecs] = useState<Record<string, string>>({})
  const category = params.get("category") || ""
  const query = params.get("q") || ""
  const update = (key: string, value: string) => {
    if (key === "section" && location.pathname !== "/products") {
      navigate(value === "fresh" ? "/products" : `/products?section=${value}`)
      return
    }
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      value ? next.set(key, value) : next.delete(key)
      return next
    })
  }

  const defaultSection =
    location.pathname === "/second-hand"
      ? "secondhand"
      : location.pathname === "/sell" || location.pathname === "/sell-your-item"
        ? "sell"
        : "fresh"

  const section = (params.get("section") ||
    defaultSection) as "fresh" | "secondhand" | "sell"

  const sectionProducts = useMemo(
    () =>
      store.products.filter((product) => {
        if (section === "secondhand") return Boolean(product.secondHand)
        if (section === "fresh") return !product.secondHand
        return true
      }),
    [store.products, section],
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of sectionProducts) {
      if (p.category) {
        counts[p.category] = (counts[p.category] || 0) + 1
      }
    }
    return counts
  }, [sectionProducts])

  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of sectionProducts) {
      if (p.brand) {
        counts[p.brand] = (counts[p.brand] || 0) + 1
      }
    }
    return counts
  }, [sectionProducts])

  const filtered = useMemo(
    () =>
      sectionProducts
        .filter((product) => {
          return (
            (!category ||
              product.category === category ||
              (category === "PC Components" &&
                [
                  "Processors",
                  "Graphics Cards",
                  "RAM",
                  "Motherboards",
                  "Storage",
                  "PC Components",
                ].includes(product.category))) &&
            (!brand || product.brand === brand) &&
            product.price <= max &&
            (!available || (product.availableForSale !== undefined ? product.availableForSale : product.stock > 0)) &&
            product.rating >= rating &&
            `${product.name} ${product.brand} ${product.category} ${Object.values(product.specs).join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            Object.entries(specs).every(
              ([key, value]) => !value || product.specs[key] === value,
            )
          )
        })
        .sort((first, second) =>
          sort === "Price: Low to High"
            ? first.price - second.price
            : sort === "Price: High to Low"
              ? second.price - first.price
              : sort === "Rating"
                ? second.rating - first.rating
                : sort === "Newest"
                  ? second.id.localeCompare(first.id)
                  : 0,
        ),
    [
      store.products,
      section,
      category,
      brand,
      max,
      available,
      rating,
      query,
      specs,
      sort,
    ],
  )

  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 12

  // Reset to page 1 whenever any filter, search query, or category changes
  useEffect(() => {
    setCurrentPage(1)
  }, [category, brand, max, available, rating, query, section, sort, specs])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)
  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  const specificKeys =
    category === "Laptops"
      ? ["Processor", "RAM", "Storage", "GPU", "Screen"]
      : ["Socket", "Generation", "Capacity", "Interface"]
  return (
    <Page>
      <PageHeading
        title={
          section === "sell"
            ? "Sell Your Electronics"
            : section === "secondhand"
              ? "Verified Pre-Owned & Refurbished"
              : category || "Find your next upgrade."
        }
        description={
          section === "sell"
            ? "Submit your device for fair evaluation and immediate payout by IT HUB."
            : section === "secondhand"
              ? "100% inspected, tested & certified pre-owned gadgets with IT HUB warranty."
              : "Technology for work, play and everything in between. Explore the brand-new IT HUB collection."
        }
      />

      {/* ── 3-SECTION EXPERIENCE SWITCHER ── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {/* Card 1: FRESH ITEMS */}
        <button
          type="button"
          onClick={() => update("section", "fresh")}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition duration-300 ${
            section === "fresh"
              ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
              : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles size={22} />
            </span>
            {section === "fresh" && <Badge tone="blue">ACTIVE</Badge>}
          </div>
          <div className="mt-4">
            <h3 className="text-base font-bold text-foreground">FRESH ITEMS</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              New IT HUB Products · Sealed with full manufacturer warranty
            </p>
          </div>
        </button>

        {/* Card 2: SECOND-HAND */}
        <button
          type="button"
          onClick={() => update("section", "secondhand")}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition duration-300 ${
            section === "secondhand"
              ? "border-amber-500 bg-amber-50/50 shadow-md ring-2 ring-amber-500/20"
              : "border-border bg-card hover:border-amber-500/40 hover:shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <RefreshCw size={20} />
            </span>
            {section === "secondhand" && <Badge tone="amber">ACTIVE</Badge>}
          </div>
          <div className="mt-4">
            <h3 className="text-base font-bold text-foreground">SECOND-HAND</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pre-owned Products · Tested & certified by IT HUB technicians
            </p>
          </div>
        </button>

        {/* Card 3: SELL YOUR ITEM */}
        <button
          type="button"
          onClick={() => update("section", "sell")}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition duration-300 ${
            section === "sell"
              ? "border-emerald-600 bg-emerald-50/60 shadow-md ring-2 ring-emerald-500/20"
              : "border-border bg-card hover:border-emerald-600/40 hover:shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <BadgeIndianRupee size={22} />
            </span>
            {section === "sell" && <Badge tone="green">ACTIVE</Badge>}
          </div>
          <div className="mt-4">
            <h3 className="text-base font-bold text-foreground">
              SELL YOUR ITEM
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sell your device · Get an evaluation and instant deal from IT HUB
            </p>
          </div>
        </button>
      </div>

      {/* When SELL YOUR ITEM is active, render the dedicated wizard */}
      {section === "sell" ? (
        <SellYourItem onBackToFresh={() => update("section", "fresh")} />
      ) : (
        <>
          {section === "secondhand" && (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <RefreshCw size={15} className="text-amber-800 shrink-0" />
                <span>
                  <strong>IT HUB Verified Pre-Owned Collection:</strong> Every
                  second-hand device undergoes multi-point hardware diagnostics
                  and includes testing certification.
                </span>
              </div>
              <button
                type="button"
                onClick={() => update("section", "sell")}
                className="shrink-0 font-bold text-amber-900 underline hover:text-amber-700"
              >
                Want to sell yours? Click here →
              </button>
            </div>
          )}
          <div className="mb-7 flex flex-wrap gap-3">
            <div className="relative min-w-48 flex-1">
              <Search
                size={17}
                className="absolute left-3 top-3.5 text-muted-foreground"
              />
              <input
                aria-label="Search products"
                value={query}
                onChange={(event) => update("q", event.target.value)}
                className={`${fieldClass} pl-10`}
                placeholder="Search products, brands, specifications…"
              />
            </div>
            <button
              className="flex items-center gap-2 rounded-md border border-border px-4 lg:hidden"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={16} /> Filters
            </button>
            <Select
              label="Sort products"
              align="right"
              className="w-52 shrink-0"
              value={sort}
              onChange={setSort}
              options={[
                "Relevance",
                "Price: Low to High",
                "Price: High to Low",
                "Newest",
                "Rating",
              ].map((value) => ({ value, label: value }))}
            />
          </div>
          <div className="grid gap-8 lg:grid-cols-[210px_1fr]">
            <aside
              className={`${
                showFilters ? "block" : "hidden"
              } space-y-6 rounded-lg border border-border p-5 lg:block lg:self-start`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Filters</h2>
                <button
                  onClick={() => {
                    setParams({})
                    setBrand("")
                    setMax(150000)
                    setAvailable(false)
                    setRating(0)
                    setSpecs({})
                  }}
                  className="text-[11px] text-primary"
                >
                  Clear all
                </button>
              </div>
              <Field label="Category">
                <Select
                  label="Category"
                  value={category}
                  onChange={(value) => {
                    update("category", value)
                    setSpecs({})
                  }}
                  options={[
                    {
                      value: "",
                      label: `All categories (${sectionProducts.length})`,
                    },
                    ...store.catalogCategories
                      .filter((val) => val !== "All")
                      .map((value) => ({
                        value,
                        label: `${value} (${categoryCounts[value] || 0})`,
                      })),
                  ]}
                />
              </Field>
              <Field label="Brand">
                <Select
                  label="Brand"
                  value={brand}
                  onChange={setBrand}
                  options={[
                    {
                      value: "",
                      label: `All brands (${sectionProducts.length})`,
                    },
                    ...[
                      ...new Set(
                        sectionProducts
                          .map((product) => product.brand)
                          .filter(Boolean),
                      ),
                    ]
                      .sort((a, b) => a.localeCompare(b))
                      .map((value) => ({
                        value,
                        label: `${value} (${brandCounts[value] || 0})`,
                      })),
                  ]}
                />
              </Field>
              <Field label={`Budget: up to ${money(max)}`}>
                <input
                  aria-label="Maximum price"
                  type="range"
                  min={1000}
                  max={150000}
                  step={500}
                  value={max}
                  onChange={(event) => setMax(Number(event.target.value))}
                  className="w-full accent-primary"
                />
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                  <span>₹1,000</span>
                  <span>₹1,50,000</span>
                </div>
              </Field>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={available}
                  onChange={(event) => setAvailable(event.target.checked)}
                  className="accent-primary"
                />{" "}
                In stock only
              </label>
              <Field label="Customer rating (demo)">
                <Select
                  label="Customer rating"
                  value={String(rating)}
                  onChange={(value) => setRating(Number(value))}
                  options={[
                    { value: "0", label: "All ratings" },
                    { value: "4", label: "4 stars & above" },
                    { value: "4.8", label: "4.8 & above" },
                    { value: "5", label: "5 stars" },
                  ]}
                />
              </Field>
              {category &&
                specificKeys.map((key) => {
                  const values = [
                    ...new Set(
                      store.products
                        .filter((product) => product.category === category)
                        .map((product) => product.specs[key])
                        .filter(Boolean),
                    ),
                  ]
                  return values.length ? (
                    <Field key={key} label={key}>
                      <Select
                        label={key}
                        value={specs[key] || ""}
                        onChange={(value) =>
                          setSpecs({ ...specs, [key]: value })
                        }
                        options={[
                          { value: "", label: `All ${key.toLowerCase()}` },
                          ...values.map((value) => ({
                            value: String(value),
                            label: String(value),
                          })),
                        ]}
                      />
                    </Field>
                  ) : null
                })}
            </aside>
            <div>
              {store.catalogLoading && store.products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <LoaderCircle className="mb-4 h-10 w-10 animate-spin text-primary" />
                  <h3 className="text-base font-semibold text-foreground">
                    Loading products from IT HUB catalog...
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fetching verified inventory from Supabase
                  </p>
                </div>
              ) : store.catalogError && store.products.length === 0 ? (
                <div className="my-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <AlertTriangle size={24} />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    Failed to load live catalog
                  </h3>
                  <p className="mx-auto my-2 max-w-md text-xs text-muted-foreground">
                    {store.catalogError}
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => store.refreshCatalog()}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold"
                  >
                    <RefreshCw size={14} />
                    Retry Connection
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <p>
                      Showing{" "}
                      <strong className="text-foreground">
                        {filtered.length === 0
                          ? 0
                          : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                              safePage * PAGE_SIZE,
                              filtered.length,
                            )}`}
                      </strong>{" "}
                      of{" "}
                      <strong className="text-foreground">
                        {filtered.length}
                      </strong>{" "}
                      products
                      {store.catalogLive ? (
                        <span className="ml-2 inline-flex items-center font-medium text-emerald-600">
                          · {store.catalogSource === "shopify" ? "Shopify Storefront" : "Live Catalog"}
                        </span>
                      ) : null}
                    </p>
                    {totalPages > 1 && (
                      <p className="font-medium">
                        Page {safePage} of {totalPages}
                      </p>
                    )}
                  </div>
                  {filtered.length ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 md:gap-5 xl:grid-cols-3">
                        {paginatedProducts.map((product) => (
                          <ProductCard key={product.id} product={product} />
                        ))}
                      </div>

                      {/* Accessible Pagination Navigation */}
                      {totalPages > 1 && (
                        <div className="mt-10 flex items-center justify-center gap-2 border-t border-border pt-6">
                          <Button
                            variant="secondary"
                            disabled={safePage === 1}
                            onClick={() => {
                              setCurrentPage((p) => Math.max(1, p - 1))
                              window.scrollTo({ top: 0, behavior: "smooth" })
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs"
                          >
                            <ChevronLeft size={14} /> Previous
                          </Button>

                          <div className="flex items-center gap-1">
                            {Array.from(
                              { length: totalPages },
                              (_, i) => i + 1,
                            ).map((pageNum) => (
                              <button
                                key={pageNum}
                                onClick={() => {
                                  setCurrentPage(pageNum)
                                  window.scrollTo({
                                    top: 0,
                                    behavior: "smooth",
                                  })
                                }}
                                className={`h-8 w-8 rounded-lg text-xs font-semibold transition ${
                                  safePage === pageNum
                                    ? "bg-primary text-white shadow-sm"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                              >
                                {pageNum}
                              </button>
                            ))}
                          </div>

                          <Button
                            variant="secondary"
                            disabled={safePage === totalPages}
                            onClick={() => {
                              setCurrentPage((p) => Math.min(totalPages, p + 1))
                              window.scrollTo({ top: 0, behavior: "smooth" })
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs"
                          >
                            Next <ChevronRight size={14} />
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Empty
                      title={
                        store.products.length === 0
                          ? "IT HUB catalog is currently empty"
                          : section === "secondhand"
                            ? "No pre-owned products match your criteria"
                            : "No products found"
                      }
                      description={
                        store.products.length === 0
                          ? "No active products are currently available in the live database. Please check back soon!"
                          : "Try another search or clear your filters."
                      }
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  )
}
export interface CustomerReview {
  id: string
  productId: string
  author: string
  rating: number
  title?: string
  comment: string
  date: string
  verified: boolean
}

export function ProductDetail() {
  const { id } = useParams()
  const store = useStore()
  const navigate = useNavigate()
  const [directProduct, setDirectProduct] = useState<Product | null>(null)
  const [fetchingDirect, setFetchingDirect] = useState(false)

  const [reviews, setReviews] = useState<CustomerReview[]>([])
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [formRating, setFormRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [formAuthor, setFormAuthor] = useState("")
  const [formTitle, setFormTitle] = useState("")
  const [formComment, setFormComment] = useState("")
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [buyingNow, setBuyingNow] = useState(false)
  const [buyNowError, setBuyNowError] = useState<string | null>(null)

  const product = useMemo(() => {
    if (!id) return directProduct
    const searchKey = decodeURIComponent(id).trim().toLowerCase()
    return (
      store.products.find((item) => {
        if (!item) return false
        const itemId = String(item.id || "").toLowerCase()
        const itemSku = String(item.sku || "").toLowerCase()
        const itemHandle = String(item.handle || "").toLowerCase()
        const itemVariant = String(item.variantId || "").toLowerCase()
        return (
          itemId === searchKey ||
          itemSku === searchKey ||
          itemHandle === searchKey ||
          itemVariant === searchKey
        )
      }) || directProduct
    )
  }, [store.products, directProduct, id])

  useEffect(() => {
    if (!product && id) {
      let isMounted = true
      setFetchingDirect(true)

      const loadDirectProduct = async () => {
        try {
          if (shopifyConfig.isConfigured) {
            const shopifyRes = await fetchShopifyProduct(id)
            if (isMounted && shopifyRes.product) {
              setDirectProduct(shopifyRes.product)
              setFetchingDirect(false)
              return
            }
          }
          const dbProduct = await fetchProductById(id)
          if (isMounted) {
            setDirectProduct(dbProduct)
            setFetchingDirect(false)
          }
        } catch {
          if (isMounted) setFetchingDirect(false)
        }
      }

      loadDirectProduct()
      return () => {
        isMounted = false
      }
    }
  }, [product, id])

  const [galleryImages, setGalleryImages] = useState<string[]>([])
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  useEffect(() => {
    let isMounted = true
    if (product?.id) {
      fetchProductGallery(product.id).then((imgs) => {
        if (isMounted && imgs && imgs.length > 0) {
          setGalleryImages(imgs)
        }
      })
    }
    return () => {
      isMounted = false
    }
  }, [product?.id])

  useEffect(() => {
    setActiveImageIndex(0)
  }, [product?.id, product?.handle])

  const allImages = useMemo(() => {
    if (product?.images && product.images.length > 0) {
      return product.images
    }
    if (galleryImages.length > 0) return galleryImages
    return [product?.image || DEFAULT_IMAGE_FALLBACK]
  }, [product?.images, galleryImages, product?.image])

  const activeImage = allImages[activeImageIndex] || allImages[0]

  useEffect(() => {
    if (product)
      track("Product Viewed", {
        product: product.name,
        productId: product.id,
        category: product.category,
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id])
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState("Description")

  useEffect(() => {
    if (!product?.id) return
    try {
      const saved = localStorage.getItem(`ithub_product_reviews_${product.id}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setReviews(parsed)
          return
        }
      }
    } catch (err) {
      console.warn("Failed to load reviews from localStorage", err)
    }
    setReviews([])
  }, [product?.id])

  useEffect(() => {
    if (store.profile?.name && !formAuthor) {
      setFormAuthor(store.profile.name)
    }
  }, [store.profile?.name, formAuthor])

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formAuthor.trim() || !formComment.trim() || !product) return
    setFormSubmitting(true)

    const newReview: CustomerReview = {
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: String(product.id),
      author: formAuthor.trim(),
      rating: formRating,
      title: formTitle.trim() || undefined,
      comment: formComment.trim(),
      date: new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      verified: true,
    }

    const updated = [newReview, ...reviews]
    setReviews(updated)

    try {
      localStorage.setItem(
        `ithub_product_reviews_${product.id}`,
        JSON.stringify(updated),
      )
    } catch (err) {
      console.warn("Could not save review to localStorage", err)
    }

    if (store.loggedIn && store.profile?.id) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        product.id,
      )
      if (isUuid) {
        import("../lib/supabase").then(async ({ supabase }) => {
          if (!supabase) return
          try {
            await supabase.from("reviews").insert({
              user_id: store.profile.id,
              product_id: product.id,
              rating: formRating,
              body: formComment.trim(),
              status: "Pending",
            })
          } catch {
            // Handled gracefully
          }
        })
      }
    }

    store.notify("Review submitted successfully! Thank you for your feedback.")
    setFormTitle("")
    setFormComment("")
    setFormRating(5)
    setShowReviewForm(false)
    setFormSubmitting(false)
  }

  if (!product && (store.catalogLoading || fetchingDirect)) {
    return (
      <Page>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <LoaderCircle className="mb-4 h-10 w-10 animate-spin text-primary" />
          <h3 className="text-base font-semibold text-foreground">
            Loading product details...
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Retrieving live data from IT HUB catalog
          </p>
        </div>
      </Page>
    )
  }

  if (!product)
    return (
      <Page>
        <Empty
          title="Product not found"
          description="This product may have been removed or does not exist in the IT HUB catalog."
          to="/products"
        />
      </Page>
    )
  const isSoldOut =
    product.availableForSale !== undefined
      ? !product.availableForSale
      : !product.stock || product.stock <= 0

  const add = () => {
    if (isSoldOut) {
      store.notify("Sorry, this item is currently sold out.")
      return
    }
    store.addCart(
      {
        id: product.id,
        productId: product.id,
        variantId: product.variantId,
        name: product.name,
        price: product.price,
        image: activeImage,
      },
      quantity,
    )
  }

  const handleBuyNow = async () => {
    setBuyNowError(null)

    if (isSoldOut) {
      setBuyNowError("Sorry, this item is currently sold out.")
      return
    }

    if (quantity < 1) {
      setBuyNowError("Please select a valid quantity (at least 1).")
      return
    }

    if (shopifyConfig.isConfigured) {
      setBuyingNow(true)
      try {
        let variantId = product.variantId
        if (!variantId && (product.handle || product.id)) {
          const fresh = await fetchShopifyProduct(product.handle || product.id)
          if (fresh.product?.variantId) {
            variantId = fresh.product.variantId
          }
        }

        if (!variantId) {
          setBuyNowError("Unable to resolve Shopify product variant for checkout. Please refresh the page.")
          setBuyingNow(false)
          return
        }

        const returnUrl = `${window.location.origin}/products/${encodeURIComponent(product.handle || product.id)}`

        // Real-time pre-flight availability check before creating checkout URL
        const availability = await checkShopifyAvailability([variantId])
        const gid = toVariantGid(variantId)
        const info =
          availability.availability[gid] || availability.availability[variantId]
        if (info && !info.availableForSale) {
          setBuyNowError("Sorry, this item is currently sold out.")
          setBuyingNow(false)
          return
        }

        const res = await createShopifyCart(
          [
            {
              merchandiseId: variantId,
              quantity,
            },
          ],
          {
            attributes: [
              {
                key: "return_to_store",
                value: returnUrl,
              },
            ],
          },
        )

        if (res.cart?.checkoutUrl) {
          window.location.href = res.cart.checkoutUrl
          return
        }

        const rawError =
          res.error || "Unable to initiate Shopify checkout. Please try again."
        const isStockIssue =
          rawError.toLowerCase().includes("sold out") ||
          rawError.toLowerCase().includes("not available") ||
          rawError.toLowerCase().includes("out of stock")

        setBuyNowError(
          isStockIssue
            ? "Sorry, this item is currently sold out or the requested quantity is unavailable."
            : rawError,
        )
      } catch (err: any) {
        setBuyNowError(
          err.message ||
            "Network error while connecting to checkout. Please try again.",
        )
      } finally {
        setBuyingNow(false)
      }
    } else {
      add()
      navigate("/checkout")
    }
  }
  return (
    <Page>
      <div className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link to="/">Home</Link>
        <ChevronRight size={12} />
        <Link to={`/products?category=${encodeURIComponent(product.category)}`}>
          {product.category}
        </Link>
        <ChevronRight size={12} />
        <span>{product.name}</span>
      </div>
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <div className="relative flex h-80 items-center justify-center rounded-2xl border border-border bg-muted p-8 shadow-inner lg:h-[420px]">
            <ProductImage
              key={`${product.id}-${activeImageIndex}`}
              product={product}
              src={activeImage}
              className="h-full w-full object-contain transition duration-300"
            />
            {(product.tag || product.secondHand) && (
              <span className="absolute left-5 top-5 flex flex-col gap-1.5">
                {product.secondHand && (
                  <Badge tone="amber">
                    <RefreshCw
                      size={10}
                      className="mr-1 inline text-amber-700"
                    />
                    PRE-OWNED
                    {product.condition ? ` · ${product.condition}` : ""}
                  </Badge>
                )}
                {product.tag && !product.secondHand && (
                  <Badge>{product.tag}</Badge>
                )}
              </span>
            )}
            {allImages.length > 1 && (
              <span className="absolute bottom-4 right-4 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                Photo {activeImageIndex + 1} of {allImages.length}
              </span>
            )}
          </div>
          {allImages.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {allImages.map((imgUrl, index) => (
                <button
                  aria-label={`View photo ${index + 1} of ${product.name}`}
                  key={`${imgUrl}-${index}`}
                  onClick={() => setActiveImageIndex(index)}
                  className={`relative h-20 w-24 overflow-hidden rounded-xl border bg-muted p-1 transition duration-200 ${
                    activeImageIndex === index
                      ? "border-primary ring-2 ring-primary/20 shadow-sm"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <ProductImage
                    product={product}
                    src={imgUrl}
                    className="h-full w-full object-contain"
                  />
                  {product.secondHand && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">
                      #{index + 1}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            {product.secondHand
              ? "Verified physical condition photos taken and uploaded by IT HUB technicians."
              : "Official manufacturer / verified catalog imagery."}
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-primary">
            {product.brand}
          </p>
          <h1 className="text-3xl font-bold leading-tight lg:text-4xl">
            {product.name}
          </h1>
          <button
            type="button"
            onClick={() => setTab("Reviews")}
            className="mt-4 flex items-center text-sm text-amber-500 hover:opacity-85 transition cursor-pointer"
          >
            <Stars size={15} />{" "}
            <span className="ml-2 text-foreground font-semibold">
              {reviews.length > 0
                ? (
                    reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
                  ).toFixed(1)
                : product.rating}
              /5
            </span>
            <span className="ml-2 text-xs text-muted-foreground hover:underline">
              {reviews.length > 0
                ? `(${reviews.length} customer ${
                    reviews.length === 1 ? "review" : "reviews"
                  })`
                : "Customer reviews"}
            </span>
          </button>
          {(() => {
            const deal = bestOffer(store.offers, product)
            const shown = deal ? deal.price : product.price
            return (
              <div className="my-6">
                {deal && (
                  <p className="mb-2 text-xs font-semibold text-primary">
                    {deal.offer.name} · {offerHeadline(deal.offer)} · applied
                    automatically
                  </p>
                )}
                <div className="inline-grid gap-1 rounded-2xl border border-border bg-secondary/50 px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    Our price
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <strong className="text-3xl">{money(shown)}</strong>
                    {product.original > shown && (
                      <Badge tone="green">
                        {Math.round((1 - shown / product.original) * 100)}% OFF
                      </Badge>
                    )}
                  </div>
                  {product.original > shown && (
                    <p className="text-sm text-muted-foreground">
                      MRP{" "}
                      <span className="line-through">
                        {money(product.original)}
                      </span>
                      <span className="ml-2 font-semibold text-emerald-700">
                        You save {money(product.original - shown)}
                      </span>
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Inclusive of all taxes
                  </p>
                </div>
              </div>
            )
          })()}
          <Badge
            tone={
              product.availableForSale !== undefined
                ? product.availableForSale
                  ? "green"
                  : "gray"
                : product.stock > 5
                  ? "green"
                  : product.stock > 0
                    ? "amber"
                    : "gray"
            }
          >
            {product.availableForSale !== undefined
              ? product.availableForSale
                ? "In stock"
                : "Currently Out of Stock"
              : product.stock > 5
                ? `In stock · ${product.stock} available`
                : product.stock > 0
                  ? `Only ${product.stock} left in stock!`
                  : "Out of stock"}
          </Badge>
          {product.secondHand && (
            <div className="my-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <RefreshCw size={15} />
                <span>IT HUB Certified Pre-Owned Assurance</span>
              </div>
              <p className="mt-1.5 leading-5 text-amber-950/80">
                Condition:{" "}
                <strong className="text-amber-950">
                  {product.condition || "Inspected"}
                </strong>{" "}
                · Multi-point diagnostics passed · Serviced & tested · Covered
                by {product.specs.Warranty || "IT HUB Warranty"}.
              </p>
            </div>
          )}
          <div className="my-6 flex flex-wrap gap-3">
            <div className="flex items-center rounded-md border border-border">
              <button
                aria-label="Decrease quantity"
                disabled={quantity <= 1 || (product.availableForSale !== undefined ? !product.availableForSale : product.stock <= 0)}
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="p-3 disabled:opacity-40"
              >
                <Minus size={15} />
              </button>
              <span className="w-7 text-center text-sm">
                {(product.availableForSale !== undefined ? !product.availableForSale : product.stock <= 0) ? 0 : quantity}
              </span>
              <button
                aria-label="Increase quantity"
                disabled={product.availableForSale !== undefined ? !product.availableForSale || quantity >= 10 : quantity >= product.stock || product.stock <= 0}
                onClick={() => setQuantity(quantity + 1)}
                className="p-3 disabled:opacity-40"
              >
                <Plus size={15} />
              </button>
            </div>
            <Button
              disabled={product.availableForSale !== undefined ? !product.availableForSale : (!product.stock || product.stock <= 0)}
              onClick={add}
              className="flex-1"
            >
              Add to cart
            </Button>
            <button
              aria-label="Save to wishlist"
              onClick={() => store.toggleWish(product.id)}
              className="rounded-md border border-border px-4"
            >
              <Heart
                size={18}
                className={
                  store.wishlist.includes(product.id)
                    ? "fill-primary text-primary"
                    : ""
                }
              />
            </button>
          </div>
          <Button
            variant="secondary"
            disabled={buyingNow || isSoldOut}
            onClick={handleBuyNow}
            className="mt-3 w-full"
          >
            {buyingNow ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Preparing checkout...
              </>
            ) : (
              <>
                Buy now <ArrowRight size={16} />
              </>
            )}
          </Button>
          {buyNowError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-900 shadow-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={15}
                  className="text-red-600 shrink-0 mt-0.5"
                />
                <div className="flex-1 space-y-1.5">
                  <p className="font-semibold">{buyNowError}</p>
                  <div className="flex items-center gap-3 pt-0.5">
                    <Link
                      to="/products"
                      className="font-medium text-red-700 underline hover:text-red-900"
                    >
                      Continue shopping →
                    </Link>
                    <button
                      type="button"
                      onClick={() => setBuyNowError(null)}
                      className="font-medium text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="mt-6 space-y-3 text-xs text-muted-foreground">
            <p className="flex gap-2">
              <Truck size={15} className="text-primary" /> All Kerala delivery
              available
            </p>
            <p className="flex gap-2">
              <ShieldCheck size={15} className="text-primary" /> Warranty:{" "}
              {product.specs.Warranty || "Contact IT HUB for details"}
              <Link
                to={`/support?view=warranty&brand=${encodeURIComponent(product.brand)}&category=${encodeURIComponent(product.category)}`}
                className="ml-1 font-semibold text-primary"
              >
                Warranty help →
              </Link>
            </p>
            <p>
              Prices, availability and discounts are illustrative prototype
              data.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-14">
        <div className="flex overflow-x-auto border-b border-border">
          {["Description", "Reviews"].map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`shrink-0 border-b-2 px-5 py-4 text-sm font-medium transition-colors ${
                tab === value || (value === "Description" && tab === "Overview")
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {value}
              {value === "Reviews" && reviews.length > 0 && (
                <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">
                  {reviews.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="min-h-44 py-7 text-sm leading-7">
          {(tab === "Description" || tab === "Overview") && (() => {
            const desc = resolveProductDescription(product)
            return (
              <section
                aria-labelledby="product-description-heading"
                className="max-w-3xl space-y-4"
              >
                <h3
                  id="product-description-heading"
                  className="text-lg font-bold text-foreground"
                >
                  Product Description
                </h3>
                {desc.type === "html" ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 space-y-3 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_p]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-semibold [&_li]:mb-1 [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline hover:[&_a]:text-primary/80"
                    dangerouslySetInnerHTML={{
                      __html: desc.content,
                    }}
                  />
                ) : desc.type === "text" ? (
                  <div className="text-foreground/90 whitespace-pre-line leading-relaxed">
                    {desc.content}
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">
                    {desc.content}
                  </p>
                )}
              </section>
            )
          })()}
          {tab === "Reviews" && (
            <div className="max-w-3xl space-y-6">
              {/* Header & Rating Overview */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/60 p-6 shadow-xs">
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    Customer Reviews
                  </h3>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center text-amber-400">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const avg =
                          reviews.length > 0
                            ? reviews.reduce((s, r) => s + r.rating, 0) /
                              reviews.length
                            : product.rating
                        return (
                          <Star
                            key={star}
                            size={18}
                            className={
                              star <= Math.round(avg)
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/30"
                            }
                          />
                        )
                      })}
                    </div>
                    <span className="text-base font-bold text-foreground">
                      {reviews.length > 0
                        ? (
                            reviews.reduce((s, r) => s + r.rating, 0) /
                            reviews.length
                          ).toFixed(1)
                        : product.rating}
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        / 5
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ·{" "}
                      {reviews.length > 0
                        ? `${reviews.length} verified ${
                            reviews.length === 1 ? "review" : "reviews"
                          }`
                        : "Catalog rating"}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => setShowReviewForm((prev) => !prev)}
                  className="flex items-center gap-2"
                >
                  <PenLine size={15} />
                  {showReviewForm ? "Close Form" : "Write a Review"}
                </Button>
              </div>

              {/* Review Posting Form */}
              {showReviewForm && (
                <form
                  onSubmit={handleReviewSubmit}
                  className="rounded-2xl border border-primary/30 bg-card p-6 shadow-sm space-y-4 transition-all"
                >
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h4 className="text-base font-bold text-foreground">
                      Write a Customer Review
                    </h4>
                    <span className="text-xs text-muted-foreground truncate max-w-xs">
                      For {product.name}
                    </span>
                  </div>

                  {/* Rating Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Your Rating *
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setFormRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="p-1 transition-transform hover:scale-125 focus:outline-none"
                          aria-label={`Select ${star} stars`}
                        >
                          <Star
                            size={24}
                            className={
                              (hoverRating || formRating) >= star
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/30"
                            }
                          />
                        </button>
                      ))}
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        {formRating === 5 && "5 / 5 · Excellent"}
                        {formRating === 4 && "4 / 5 · Very Good"}
                        {formRating === 3 && "3 / 5 · Good"}
                        {formRating === 2 && "2 / 5 · Fair"}
                        {formRating === 1 && "1 / 5 · Poor"}
                      </span>
                    </div>
                  </div>

                  {/* Author Name */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Your Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formAuthor}
                      onChange={(e) => setFormAuthor(e.target.value)}
                      placeholder="e.g. Anand R."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  {/* Review Title */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Review Headline (Optional)
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Crisp 2K display, excellent gaming performance"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  {/* Review Body */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Your Review *
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={formComment}
                      onChange={(e) => setFormComment(e.target.value)}
                      placeholder="What did you like or dislike? How was the display clarity, build quality, or gaming experience?"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none leading-relaxed"
                    />
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowReviewForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        formSubmitting ||
                        !formAuthor.trim() ||
                        !formComment.trim()
                      }
                    >
                      {formSubmitting ? "Submitting…" : "Post Review"}
                    </Button>
                  </div>
                </form>
              )}

              {/* Reviews List */}
              {reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map((rev) => (
                    <article
                      key={rev.id}
                      className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {rev.author.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground leading-tight">
                              {rev.author}
                            </p>
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={12} /> Verified Customer
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {rev.date}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-amber-400">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={14}
                            className={
                              star <= rev.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/30"
                            }
                          />
                        ))}
                      </div>

                      {rev.title && (
                        <h4 className="text-sm font-bold text-foreground">
                          {rev.title}
                        </h4>
                      )}

                      <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                        {rev.comment}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                  <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                  <h4 className="text-base font-semibold text-foreground">
                    No customer reviews yet
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                    Be the first customer to share your hands-on experience,
                    performance feedback, and rating for this product.
                  </p>
                  {!showReviewForm && (
                    <Button
                      variant="secondary"
                      onClick={() => setShowReviewForm(true)}
                      className="mt-4"
                    >
                      Write the First Review
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-6">
        <h2 className="mb-6 text-2xl font-bold">Related Products</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...store.products]
            .filter((item) => item.id !== product.id)
            .sort(
              (a, b) =>
                Number(b.category === product.category) -
                Number(a.category === product.category),
            )
            .slice(0, 4)
            .map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
        </div>
      </div>
      <div className="mt-12">
        <h2 className="mb-2 text-2xl font-bold">Related Services</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Setup, service and warranty help from IT HUB after you buy.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              name:
                product.category === "Mobiles"
                  ? "Mobile Repair"
                  : product.category === "Printers"
                    ? "Printer Service"
                    : product.category === "Laptops"
                      ? "Laptop Repair"
                      : "PC Repair",
              text: "Diagnostics, repair and upgrades by IT HUB technicians.",
              to: "",
            },
            {
              name: "Software Installation",
              text: "OS, drivers, software and data transfer.",
              to: "",
            },
            {
              name: "Help & Support",
              text: "Official brand support and on-site service eligibility.",
              to: "/support?view=warranty",
            },
          ].map((service) => (
            <Link
              key={service.name}
              to={
                service.to ||
                `/services/book?service=${encodeURIComponent(service.name)}`
              }
              className="group rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
            >
              <ShieldCheck size={20} className="text-primary" />
              <h3 className="mt-4 text-sm font-semibold">{service.name}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {service.text}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                {service.to ? "Get help" : "Request Service"}{" "}
                <ArrowRight size={13} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Page>
  )
}
