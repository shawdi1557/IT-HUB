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
export function ProductDetail() {
  const { id } = useParams()
  const store = useStore()
  const navigate = useNavigate()
  const [directProduct, setDirectProduct] = useState<Product | null>(null)
  const [fetchingDirect, setFetchingDirect] = useState(false)

  const product = useMemo(() => {
    return (
      store.products.find((item) => item.id === id || item.sku === id) ||
      directProduct
    )
  }, [store.products, directProduct, id])

  useEffect(() => {
    if (!product && id) {
      let isMounted = true
      setFetchingDirect(true)
      fetchProductById(id)
        .then((fetched) => {
          if (isMounted) {
            setDirectProduct(fetched)
            setFetchingDirect(false)
          }
        })
        .catch(() => {
          if (isMounted) setFetchingDirect(false)
        })
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

  const allImages = useMemo(() => {
    if (galleryImages.length > 0) return galleryImages
    return [product?.image || DEFAULT_IMAGE_FALLBACK]
  }, [galleryImages, product?.image])

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
  const [tab, setTab] = useState("Overview")

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
  const add = () =>
    store.addCart(
      {
        id: product.id,
        productId: product.id,
        name: product.name,
        price: product.price,
        image: activeImage,
      },
      quantity,
    )
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
                  aria-label={`View photo ${index + 1}`}
                  key={imgUrl}
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
          <p className="mt-4 text-sm text-amber-500">
            <Stars size={15} />{" "}
            <span className="ml-2 text-foreground">{product.rating}/5</span>
            <span className="ml-2 text-xs text-muted-foreground">
              Static product rating
            </span>
          </p>
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
              product.stock > 5 ? "green" : product.stock > 0 ? "amber" : "gray"
            }
          >
            {product.stock > 5
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
          <div className="my-6 grid grid-cols-2 gap-4 border-y border-border py-5">
            {Object.entries(product.specs)
              .slice(0, 4)
              .map(([key, value]) => (
                <div key={key}>
                  <p className="text-[11px] text-muted-foreground">{key}</p>
                  <p className="mt-1 text-sm font-medium">{String(value)}</p>
                </div>
              ))}
          </div>
          <div className="flex flex-wrap gap-3">
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
            disabled={product.availableForSale !== undefined ? !product.availableForSale : (!product.stock || product.stock <= 0)}
            onClick={() => {
              add()
              navigate("/checkout")
            }}
            className="mt-3 w-full"
          >
            Buy now <ArrowRight size={16} />
          </Button>
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
          {[
            "Overview",
            "Specifications",
            "Features",
            "Warranty",
            "Reviews",
            "Delivery",
          ].map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`shrink-0 border-b-2 px-5 py-4 text-sm font-medium ${
                tab === value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="min-h-44 py-7 text-sm leading-7">
          {tab === "Overview" && (
            <>
              <h3 className="mb-3 text-lg font-bold">
                Designed for your next upgrade.
              </h3>
              <p className="max-w-3xl text-muted-foreground">
                Explore {product.name} at IT HUB. Get personal assistance
                choosing the right {product.category.toLowerCase()} for your
                setup, with local product and service support.
              </p>
            </>
          )}
          {tab === "Specifications" && (
            <div className="max-w-2xl">
              {Object.entries(product.specs).map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-2 border-b border-border py-3"
                >
                  <span className="text-muted-foreground">{key}</span>
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "Features" && (
            <ul className="space-y-2">
              {Object.entries(product.specs)
                .filter(([key]) => key !== "Warranty")
                .map(([key, value]) => (
                  <li key={key}>
                    ✓ {key}: {String(value)}
                  </li>
                ))}
            </ul>
          )}
          {tab === "Warranty" && (
            <>
              <h3 className="font-bold">
                {product.specs.Warranty || "Contact IT HUB"}
              </h3>
              <p className="text-muted-foreground">
                Manufacturer terms apply. Confirm warranty coverage with IT HUB
                before purchase.
              </p>
              <Link to="/account/warranty" className="text-primary">
                Manage your warranties →
              </Link>
            </>
          )}
          {tab === "Reviews" && (
            <p className="text-muted-foreground">
              {product.rating}/5 is a static prototype rating. No individual
              customer reviews have been published.
            </p>
          )}
          {tab === "Delivery" && (
            <p className="text-muted-foreground">
              Kerala delivery and store pickup options are available in the demo
              checkout. Shipping timelines are illustrative; confirm actual
              availability with IT HUB.
            </p>
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
