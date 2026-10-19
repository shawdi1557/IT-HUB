import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { track } from "../lib/analytics"
import { supabase } from "../lib/supabase"
import { subscribeToAuthChanges, fetchOrCreateProfile } from "../lib/auth"
import {
  fetchCatalogDetailed,
  fetchActiveOffersDetailed,
  fetchActiveCouponsDetailed,
  patchProductInventory,
} from "../lib/catalog"
import {
  initialOffers,
  categories,
  componentOptions,
  type ComponentOption,
  type Product,
  type CartItem,
  type Order,
  type ServiceRequest,
  type Build,
  type Offer,
  initialBrands,
  initialLocations,
  type ItHubLocation,
  type WarrantyCheck,
  type PcEnquiry,
  type ImportRecord,
  initialSupportCategories,
  initialBrandSupport,
  initialServiceCentres,
  type SupportCategory,
  type BrandSupport,
  type SupportVerification,
  type ServiceCentre,
  type Coupon,
  type CouponUsage,
  type SellRequest,
  initialCoupons,
  initialCouponUsages,
  initialSellRequests,
} from "../data/catalog"
import {
  initialBuildTemplates,
  type BuildTemplate,
} from "../data/buildTemplates"
import { resourceDefinitions, type AdminRecord } from "../data/admin"

type Profile = {
  name: string
  email: string
  phone: string
  address: string
}
type Audit = {
  id: string
  action: string
  date: string
}
export type ShowcaseImage = {
  id: string
  src: string
  caption: string
}
type State = {
  products: Product[]
  cart: CartItem[]
  wishlist: string[]
  orders: Order[]
  requests: ServiceRequest[]
  builds: Build[]
  buildTemplates: BuildTemplate[]
  /** Assembly charge added to build estimates; 0 = free assembly. */
  assemblyCharge: number
  offers: Offer[]
  profile: Profile
  loggedIn: boolean
  showcase: ShowcaseImage[]
  notifications: string[]
  audit: Audit[]
  technicians: string[]
  catalogCategories: string[]
  brands: string[]
  locations: ItHubLocation[]
  warrantyChecks: WarrantyCheck[]
  pcEnquiries: PcEnquiry[]
  importHistory: ImportRecord[]
  supportCategories: SupportCategory[]
  brandSupport: BrandSupport[]
  serviceCentres: ServiceCentre[]
  supportVerifications: SupportVerification[]
  /** Recently viewed brand-support record ids (customer side). */
  recentSupport: string[]
  componentCatalog: Record<string, ComponentOption[]>
  resources: Record<string, AdminRecord[]>
  settings: {
    storeName: string
    delivery: string
    emailNotifications: boolean
    /** Official IT HUB WhatsApp number, digits with country code (e.g. 919876543210). */
    whatsapp: string
    address: string
    phone: string
    email: string
    workingHours: string
  }
  tickets: {
    id: string
    subject: string
    message: string
    status: string
  }[]
  coupons: Coupon[]
  couponUsages: CouponUsage[]
  sellRequests: SellRequest[]
  catalogLoading: boolean
  catalogLive: boolean
  catalogError: string | null
  realtimeConnected: boolean
}
const initial: State = {
  products: [],
  catalogLoading: true,
  catalogLive: false,
  catalogError: null,
  realtimeConnected: false,
  cart: [],
  wishlist: [],
  orders: [],
  requests: [],
  builds: [],
  buildTemplates: initialBuildTemplates,
  assemblyCharge: 0,
  offers: initialOffers,
  coupons: initialCoupons,
  couponUsages: initialCouponUsages,
  sellRequests: initialSellRequests,
  profile: { name: "", email: "", phone: "", address: "" },
  loggedIn: false,
  showcase: Array.from({ length: 10 }, (_, i) => ({
    id: `showcase-${i + 1}`,
    src: `/images/showcase/showcase-${i + 1}.png`,
    caption: "Another happy IT HUB customer",
  })),
  notifications: [],
  audit: [],
  technicians: ["Unassigned", "Demo technician A", "Demo technician B"],
  catalogCategories: categories,
  brands: initialBrands,
  locations: initialLocations,
  warrantyChecks: [],
  pcEnquiries: [],
  importHistory: [],
  supportCategories: initialSupportCategories,
  brandSupport: initialBrandSupport,
  serviceCentres: initialServiceCentres,
  supportVerifications: [],
  recentSupport: [],
  componentCatalog: componentOptions,
  resources: Object.fromEntries(
    Object.entries(resourceDefinitions).map(([key, value]) => [
      key,
      value.initial,
    ]),
  ),
  settings: {
    storeName: "IT HUB",
    delivery: "Kerala",
    emailNotifications: true,
    whatsapp: "919847223886",
    address: "Molathu Building, College Jn., Kothamangalam, Kerala - 686691",
    phone: "+91 98472 23886",
    email: "ithubkmgm@gmail.com",
    workingHours: "10:00 AM - 8:30 PM (Sunday Holiday)",
  },
  tickets: [],
}
type Store = State & {
  set: (next: Partial<State> | ((state: State) => Partial<State>)) => void
  notify: (message: string) => void
  toast: string
  authOpen: boolean
  setAuthOpen: (open: boolean) => void
  addCart: (item: Omit<CartItem, "quantity">, quantity?: number) => void
  toggleWish: (id: string) => void
  log: (action: string) => void
  refreshCatalog: () => Promise<void>
}
// Keep one context instance across hot updates; otherwise an edited store
// module creates a new context that the already-mounted provider doesn't supply.
const globalStore = globalThis as {
  __ithubStoreContext?: ReturnType<typeof createContext<Store | null>>
}
const Context = (globalStore.__ithubStoreContext ??=
  createContext<Store | null>(null))
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => {
    try {
      const saved = localStorage.getItem("ithub-prototype-v1")
      if (!saved) return initial
      const parsed = JSON.parse(saved) as Partial<State>
      return {
        ...initial,
        ...parsed,
        products: [], // Never restore stale products from localStorage; always hydrate fresh from Supabase
        catalogLoading: true,
        catalogLive: false,
        catalogError: null,
        realtimeConnected: false,
        // Older saves used coupon-code offers; replace them with the new offer model.
        offers: parsed.offers?.every((offer) => "type" in offer)
          ? parsed.offers
          : initial.offers,
        settings: {
          ...initial.settings,
          ...parsed.settings,
          phone: "+91 98472 23886",
          email: "ithubkmgm@gmail.com",
          workingHours: "10:00 AM - 8:30 PM (Sunday Holiday)",
        },
        buildTemplates: parsed.buildTemplates?.length
          ? parsed.buildTemplates
          : initial.buildTemplates,
        locations:
          parsed.locations && parsed.locations.length > 0
            ? parsed.locations.map((loc) =>
                loc.id === "kothamangalam"
                  ? {
                      ...loc,
                      name: "IT HUB Kothamangalam (Headquarters)",
                      address:
                        "Molathu Building, College Jn., Kothamangalam, Kerala",
                      pincode: "686691",
                      latitude: 10.0601,
                      longitude: 76.6277,
                      serviceRadiusKm: 15,
                    }
                  : loc,
              )
            : initial.locations,
        brandSupport: parsed.brandSupport?.some((r: any) => r.warrantyPhone)
          ? parsed.brandSupport
          : initial.brandSupport,
        serviceCentres: parsed.serviceCentres?.length
          ? parsed.serviceCentres
          : initial.serviceCentres,
        supportCategories: parsed.supportCategories?.length
          ? parsed.supportCategories
          : initial.supportCategories,
        // Append newly added catalog options missing from older saves.
        componentCatalog: Object.fromEntries(
          Object.entries(initial.componentCatalog).map(([type, options]) => {
            const saved = parsed.componentCatalog?.[type] || []
            return [
              type,
              [
                ...saved,
                ...options.filter(
                  (option) => !saved.some((row) => row.id === option.id),
                ),
              ],
            ]
          }),
        ),
      }
    } catch {
      return initial
    }
  })
  const [toast, setToast] = useState("")
  const [authOpen, setAuthOpen] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem("ithub-prototype-v1", JSON.stringify(state))
    } catch {
      setToast("Browser storage is unavailable. Changes last for this session.")
    }
  }, [state])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(""), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  // Synchronize store with real Supabase Auth session & PostgreSQL profiles
  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          fetchOrCreateProfile(session.user).then((profile) => {
            setState((prev) => ({
              ...prev,
              loggedIn: true,
              profile: {
                ...prev.profile,
                phone: session.user.phone || prev.profile.phone,
                name: profile?.full_name || prev.profile.name,
                email:
                  profile?.email || session.user.email || prev.profile.email,
                address: profile?.address || prev.profile.address,
              },
            }))
          })
        }
      })
    }

    const unsubscribe = subscribeToAuthChanges((user) => {
      if (!user) {
        setState((prev) => ({ ...prev, loggedIn: false }))
      } else {
        fetchOrCreateProfile(user).then((profile) => {
          setState((prev) => ({
            ...prev,
            loggedIn: true,
            profile: {
              ...prev.profile,
              phone: user.phone || prev.profile.phone,
              name: profile?.full_name || prev.profile.name,
              email: profile?.email || user.email || prev.profile.email,
              address: profile?.address || prev.profile.address,
            },
          }))
        })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const refreshCatalog = async () => {
    setState((prev) => ({ ...prev, catalogLoading: true }))
    try {
      const [catalogRes, offersRes, couponsRes] = await Promise.allSettled([
        fetchCatalogDetailed(),
        fetchActiveOffersDetailed(),
        fetchActiveCouponsDetailed(),
      ])

      setState((prev) => {
        const updates: Partial<State> = { catalogLoading: false }

        if (catalogRes.status === "fulfilled") {
          const { products: liveProducts, isLive, error } = catalogRes.value
          if (error) {
            updates.catalogError = error
            updates.catalogLive = false
          } else if (isLive) {
            // Live products from Supabase are the single source of truth
            updates.products = liveProducts
            updates.catalogLive = true
            updates.catalogError = null

            // Derive dynamic categories and brands from live database products
            const liveCategories = Array.from(
              new Set(liveProducts.map((p) => p.category).filter(Boolean)),
            )
            if (liveCategories.length > 0) {
              updates.catalogCategories = [
                "All",
                ...liveCategories.filter((c) => c !== "All"),
              ]
            }

            const liveBrands = Array.from(
              new Set(liveProducts.map((p) => p.brand).filter(Boolean)),
            )
            if (liveBrands.length > 0) {
              updates.brands = liveBrands
            }
          }
        } else {
          updates.catalogError =
            catalogRes.reason?.message || "Failed to load live catalog."
          updates.catalogLive = false
        }

        if (offersRes.status === "fulfilled" && offersRes.value.isLive) {
          updates.offers = offersRes.value.offers
        }

        if (couponsRes.status === "fulfilled" && couponsRes.value.isLive) {
          updates.coupons = couponsRes.value.coupons
        }

        return { ...prev, ...updates }
      })
    } catch (err) {
      console.warn("[store] Background catalog hydration error:", err)
      setState((prev) => ({
        ...prev,
        catalogLoading: false,
        catalogError: err instanceof Error ? err.message : String(err),
      }))
    }
  }

  // Phase 3 Step 3: Background Stale-While-Revalidate catalog hydration
  useEffect(() => {
    let isMounted = true
    refreshCatalog().catch(() => {
      if (isMounted) {
        setState((prev) => ({ ...prev, catalogLoading: false }))
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  // Phase 3 Step 4: Realtime Inventory Synchronization & Window Focus Revalidation
  useEffect(() => {
    const client = supabase
    if (!client) return

    const channel = client
      .channel("public:inventory")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        (payload) => {
          if (
            payload.eventType === "UPDATE" ||
            payload.eventType === "INSERT"
          ) {
            const row = payload.new as {
              product_id: string
              stock: number
              low_stock_threshold?: number
            }
            if (row?.product_id) {
              setState((prev) => {
                const productExists = prev.products.some(
                  (p) => p.id === row.product_id,
                )
                if (productExists) {
                  return {
                    ...prev,
                    products: patchProductInventory(prev.products, row),
                  }
                } else if (payload.eventType === "INSERT") {
                  // Brand new product record added; trigger full catalog revalidation
                  refreshCatalog()
                  return prev
                }
                return prev
              })
            }
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { product_id?: string }
            if (oldRow?.product_id) {
              setState((prev) => ({
                ...prev,
                products: patchProductInventory(prev.products, {
                  product_id: oldRow.product_id!,
                  stock: 0,
                }),
              }))
            }
          }
        },
      )
      .subscribe((status) => {
        setState((prev) => ({
          ...prev,
          realtimeConnected: status === "SUBSCRIBED",
        }))
      })

    const handleFocusSync = () => {
      if (document.visibilityState === "visible") {
        refreshCatalog()
      }
    }

    window.addEventListener("focus", handleFocusSync)
    document.addEventListener("visibilitychange", handleFocusSync)

    return () => {
      window.removeEventListener("focus", handleFocusSync)
      document.removeEventListener("visibilitychange", handleFocusSync)
      client.removeChannel(channel)
    }
  }, [])

  const set = (next: Partial<State> | ((value: State) => Partial<State>)) =>
    setState((previous) => ({
      ...previous,
      ...(typeof next === "function" ? next(previous) : next),
    }))
  const notify = (message: string) => setToast(message)
  const log = (action: string) => {
    if (location.pathname.startsWith("/admin"))
      track("Admin Data Change", { action })
    set((previous) => ({
      audit: [
        { id: crypto.randomUUID(), action, date: new Date().toLocaleString() },
        ...previous.audit,
      ].slice(0, 100),
    }))
  }
  const addCart = (item: Omit<CartItem, "quantity">, quantity = 1) => {
    if (!state.loggedIn) {
      setAuthOpen(true)
      notify(
        "Please sign in with your mobile number to add items to your cart.",
      )
      return
    }
    const existingQuantity =
      state.cart.find((row) => row.id === item.id)?.quantity || 0
    const product = item.productId
      ? state.products.find((product) => product.id === item.productId)
      : null
    if (
      item.productId &&
      (!product || existingQuantity + quantity > product.stock)
    ) {
      notify("Not enough stock available. Please adjust your cart.")
      return
    }
    set((previous) => {
      const existing = previous.cart.find((row) => row.id === item.id)
      return {
        cart: existing
          ? previous.cart.map((row) =>
              row.id === item.id
                ? { ...row, quantity: row.quantity + quantity }
                : row,
            )
          : [...previous.cart, { ...item, quantity }],
      }
    })
    notify("Added to cart")
    track("Product Added to Cart", {
      product: item.name ?? item.id,
      productId: item.productId ?? item.id,
    })
  }
  const toggleWish = (id: string) => {
    if (!state.loggedIn) {
      setAuthOpen(true)
      notify(
        "Please sign in with your mobile number to save items to your wishlist.",
      )
      return
    }
    const exists = state.wishlist.includes(id)
    set((previous) => ({
      wishlist: exists
        ? previous.wishlist.filter((value) => value !== id)
        : [...previous.wishlist, id],
    }))
    notify(exists ? "Removed from wishlist" : "Saved to wishlist")
  }
  return (
    <Context.Provider
      value={{
        ...state,
        set,
        notify,
        toast,
        authOpen,
        setAuthOpen,
        addCart,
        toggleWish,
        log,
        refreshCatalog,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useStore() {
  const store = useContext(Context)
  if (!store) throw new Error("Store provider is required")
  return store
}
