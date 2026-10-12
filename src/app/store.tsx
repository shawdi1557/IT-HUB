import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { track } from "../lib/analytics"
import {
  initialProducts,
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
  type SupportCategory,
  type BrandSupport,
  type SupportVerification,
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
export type ShowcaseImage = { id: string src: string caption: string }
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
}
const initial: State = {
  products: initialProducts,
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
    phone: "+91-9847223886",
    email: "ithubkmgm@gmail.com",
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
        // Older saves used coupon-code offers; replace them with the new offer model.
        offers: parsed.offers?.every((offer) => "type" in offer)
          ? parsed.offers
          : initial.offers,
        settings: { ...initial.settings, ...parsed.settings },
        buildTemplates: parsed.buildTemplates?.length
          ? parsed.buildTemplates
          : initial.buildTemplates,
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
