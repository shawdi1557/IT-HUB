import { useEffect, useRef, useState } from "react"
import Lenis from "lenis"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router"
import {
  Search,
  Heart,
  UserRound,
  ShoppingBag,
  Menu,
  X,
  MapPin,
  ShieldCheck,
  Truck,
  ArrowUpRight,
  Wrench,
  ChevronDown,
  CheckCircle2,
  ArrowLeft,
  Home as HomeIcon,
  ChevronRight,
  Package,
  Tag,
  LifeBuoy,
  LogOut,
  ChevronUp,
  Cpu,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import AuthModal from "./AuthModal"
import { identify, track } from "../lib/analytics"
import { categories, serviceTypes, money } from "../data/catalog"
import { useStore } from "../app/store"
import { Logo, Modal, fieldClass, containerClass } from "./ui"

const nav = [
  { name: "Products", to: "/products" },
  { name: "Services", to: "/services" },
  { name: "PC Builder", to: "/pc-builder" },
  { name: "Help & Support", to: "/support" },
  { name: "About", to: "/about" },
]
export default function Layout() {
  const store = useStore()
  const [mobile, setMobile] = useState(false)
  const [search, setSearch] = useState(false)
  const [menu, setMenu] = useState(false)
  const [query, setQuery] = useState("")
  const location = useLocation()
  useEffect(() => {
    identify(
      store.loggedIn
        ? store.profile.phone || store.profile.email || "customer"
        : undefined,
    )
  }, [store.loggedIn, store.profile.phone, store.profile.email])
  useEffect(() => {
    track("Page Viewed")
  }, [location.pathname, location.search])
  const wasLoggedIn = useRef(store.loggedIn)
  useEffect(() => {
    if (wasLoggedIn.current !== store.loggedIn)
      track(store.loggedIn ? "Login" : "Logout")
    wasLoggedIn.current = store.loggedIn
  }, [store.loggedIn])
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest?.(
        "a[href*='wa.me']",
      )
      if (link)
        track("Contact/WhatsApp Action", {
          href: link.getAttribute("href")?.split("?")[0] || "",
        })
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [])
  const navigate = useNavigate()
  const lenis = useRef<Lenis | null>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    document.documentElement.classList.remove("dark")
    localStorage.removeItem("ithub-theme")
  }, [])
  useEffect(() => {
    const instance = new Lenis({ duration: 1.15, smoothWheel: true })
    lenis.current = instance
    instance.on("scroll", ({ scroll }: { scroll: number }) =>
      setScrolled(scroll > 24),
    )
    let raf = 0
    const loop = (time: number) => {
      instance.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      instance.destroy()
    }
  }, [])
  useEffect(() => {
    if (mobile || search) lenis.current?.stop()
    else lenis.current?.start()
  }, [mobile, search])
  useEffect(() => {
    lenis.current?.scrollTo(0, { immediate: true })
    setMobile(false)
    setSearch(false)
    setMenu(false)
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [location.pathname])
  const matches = store.products.filter((product) =>
    `${product.name} ${product.brand} ${product.category} ${Object.values(product.specs).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-5 focus:top-5"
      >
        Skip to content
      </a>
      <div className="bg-[#0c2f8a] text-white">
        <div
          className={`${containerClass} flex h-8 items-center justify-between text-[10px] font-medium tracking-wide`}
        >
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-blue-400" /> Serving
            customers since 2011
          </span>
          <div className="flex items-center gap-6">
            <span className="hidden items-center gap-1.5 sm:flex">
              <Truck size={12} /> All Kerala delivery
            </span>
            <span className="hidden items-center gap-1.5 md:flex">
              <Wrench size={12} /> Professional IT services
            </span>
            <Link to="/contact" className="flex items-center gap-1.5">
              <MapPin size={12} /> Kothamangalam, Kerala
            </Link>
          </div>
        </div>
      </div>
      <header
        className={`sticky top-0 z-40 transition-all duration-500 ${
          scrolled
            ? "border-b border-border/70 bg-background/75 shadow-[0_10px_40px_-20px_rgba(11,18,32,.25)] backdrop-blur"
            : "border-b border-transparent bg-background"
        }`}
      >
        <div
          className={`${containerClass} flex items-center transition-all duration-500 ${
            scrolled ? "h-[72px]" : "h-[88px]"
          } justify-between gap-5`}
        >
          <Link
            to="/"
            aria-label="IT HUB home"
            className="flex shrink-0 items-center gap-3"
          >
            <Logo />
            <div className="hidden border-l border-border pl-3 text-[9px] leading-4 text-muted-foreground xl:block">
              TECHNOLOGY.
              <br />
              PRODUCTS. SERVICE. SUPPORT.
            </div>
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-border bg-white/60 p-1 lg:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition ${
                    isActive
                      ? "bg-primary text-white"
                      : "text-slate-700 hover:bg-secondary hover:text-primary"
                  }`
                }
              >
                <span
                  className={
                    item.name === "Products" || item.name === "Services"
                      ? "font-semibold"
                      : ""
                  }
                >
                  {item.name}
                </span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-3">
            <button
              onClick={() => setSearch(true)}
              aria-label="Search products, categories and services"
              className="p-2 hover:text-primary"
            >
              <Search size={19} />
            </button>
            <Link
              to="/account/wishlist"
              aria-label="Wishlist"
              className="hidden p-2 hover:text-primary sm:block"
            >
              <Heart size={19} />
            </Link>
            <div className="relative">
              {store.loggedIn ? (
                <button
                  onClick={() => setMenu(!menu)}
                  aria-expanded={menu}
                  className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-left transition hover:border-primary"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {(store.profile.name || "U").charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden text-[11px] leading-tight sm:block">
                    Hello,
                    <br />
                    <b>{store.profile.name.split(" ")[0] || "User"}</b>
                  </span>
                  {menu ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : (
                <button
                  onClick={() => store.setAuthOpen(true)}
                  className="flex items-center gap-2 rounded-full p-2 text-sm font-semibold hover:text-primary sm:border sm:border-border sm:px-4"
                >
                  <UserRound size={18} />
                  <span className="hidden sm:inline">Login</span>
                </button>
              )}
              {menu && store.loggedIn && (
                <>
                  <button
                    aria-label="Close account menu"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setMenu(false)}
                  />
                  <div className="absolute right-0 top-full z-50 mt-3 w-72 overflow-hidden rounded-2xl border border-border bg-white p-2 shadow-md shadow-slate-900/15">
                    <div className="border-b border-border px-3 pb-3 pt-2">
                      <p className="text-sm font-semibold">
                        {store.profile.name || "IT HUB customer"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {store.profile.phone}
                      </p>
                    </div>
                    {[
                      {
                        name: "My Profile",
                        to: "/account/profile",
                        Icon: UserRound,
                      },
                      {
                        name: "My Orders",
                        to: "/account/orders",
                        Icon: Package,
                      },
                      {
                        name: "My Address",
                        to: "/account/addresses",
                        Icon: HomeIcon,
                      },
                      { name: "My Offers", to: "/account/offers", Icon: Tag },
                      { name: "PC Builds", to: "/account/builds", Icon: Cpu },
                      {
                        name: "Wishlist",
                        to: "/account/wishlist",
                        Icon: Heart,
                      },
                      {
                        name: "Warranty",
                        to: "/account/warranty",
                        Icon: ShieldCheck,
                      },
                      {
                        name: "After-sales Support",
                        to: "/account/support",
                        Icon: LifeBuoy,
                      },
                    ].map(({ name, to, Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border group-hover:border-primary group-hover:text-primary">
                          <Icon size={17} />
                        </span>
                        <span className="flex-1 font-medium">{name}</span>
                        <ChevronRight
                          size={14}
                          className="text-muted-foreground"
                        />
                      </Link>
                    ))}
                    <button
                      onClick={() => {
                        store.set({ loggedIn: false })
                        store.notify("You have been logged out")
                        setMenu(false)
                        navigate("/")
                      }}
                      className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-border px-3 py-3 text-sm font-medium text-destructive hover:bg-muted"
                    >
                      <LogOut size={17} /> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <Link
              to="/cart"
              className="relative flex items-center gap-2 p-2 text-sm hover:text-primary"
              aria-label={`Cart, ${store.cart.reduce((sum, item) => sum + item.quantity, 0)} items`}
            >
              <ShoppingBag size={19} />
              <span className="hidden xl:block">Cart</span>
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[9px] text-white">
                {store.cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </Link>
            <button
              onClick={() => setMobile(!mobile)}
              aria-label={mobile ? "Close menu" : "Open menu"}
              className="p-2 lg:hidden"
            >
              {mobile ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {mobile && (
          <nav className="max-h-[75dvh] overflow-auto border-t border-border bg-white px-6 py-5 lg:hidden">
            {[
              ...nav,
              { name: "My account", to: "/account" },
              { name: "Wishlist", to: "/account/wishlist" },
              { name: "Help & Support", to: "/support" },
              { name: "About", to: "/about" },
              { name: "Contact", to: "/contact" },
              { name: "Track an order", to: "/track-order" },
              { name: "Admin prototype", to: "/admin" },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="block border-b border-border py-3 text-sm"
              >
                {item.name}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      {location.pathname !== "/" && (
        <div
          className={`${containerClass} relative z-10 flex items-center gap-2 pt-5 text-xs`}
        >
          <button
            onClick={() =>
              window.history.length > 1 ? navigate(-1) : navigate("/")
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 font-semibold transition hover:border-primary hover:text-primary"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 font-semibold transition hover:border-primary hover:text-primary"
          >
            <HomeIcon size={14} /> Home
          </Link>
          <span className="ml-1 hidden items-center gap-1 capitalize text-muted-foreground sm:flex">
            {location.pathname
              .split("/")
              .filter(Boolean)
              .map((part) => (
                <span key={part} className="flex items-center gap-1">
                  <ChevronRight size={12} />{" "}
                  {decodeURIComponent(part).replace(/-/g, " ")}
                </span>
              ))}
          </span>
        </div>
      )}
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-[60vh] overflow-x-clip"
      >
        <Outlet />
      </main>
      <footer className="relative mt-10 overflow-hidden rounded-t-[2.5rem] border-t border-border bg-muted">
        <div
          className={`${containerClass} grid grid-cols-2 gap-10 py-14 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]`}
        >
          <div className="col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-5 text-sm font-semibold">
              Your neighbourhood. Your tech hub.
            </p>
            <p className="mt-2 max-w-60 text-xs leading-6 text-muted-foreground">
              Technology, products, service and support.
              <br />
              Kothamangalam, Kerala, India.
            </p>
            <Link
              to="/contact"
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary"
            >
              Visit our store <ArrowUpRight size={14} />
            </Link>
          </div>
          {[
            {
              title: "SHOP",
              items: [
                "Laptops",
                "PC Components",
                "Mobiles",
                "Accessories",
                "Monitors",
                "Audio",
              ],
              links: [
                "/products?category=Laptops",
                "/products?category=PC%20Components",
                "/products?category=Mobiles",
                "/products?category=Accessories",
                "/products?category=Monitors",
                "/products?category=Audio",
              ],
            },
            {
              title: "SERVICES",
              items: [
                "Laptop repair",
                "Mobile repair",
                "PC service",
                "Data recovery",
                "Custom PC",
                "On-site service",
              ],
              links: [
                "/services/book?service=Laptop%20Repair",
                "/services/book?service=Mobile%20Repair",
                "/services",
                "/services/book?service=Data%20Recovery",
                "/pc-builder",
                "/services/book?method=On-site%20service",
              ],
            },
            {
              title: "COMPANY",
              items: [
                "About IT HUB",
                "Contact",
                "Offers",
                "Help & Support",
                "Warranty",
                "Admin prototype",
              ],
              links: [
                "/about",
                "/contact",
                "/offers",
                "/support",
                "/support?view=warranty",
                "/admin",
              ],
            },
            {
              title: "YOUR IT HUB",
              items: [
                "My account",
                "Orders",
                "Services",
                "Wishlist",
                "Saved PC builds",
                "Track an order",
              ],
              links: [
                "/account",
                "/account/orders",
                "/account/services",
                "/account/wishlist",
                "/account/builds",
                "/track-order",
              ],
            },
          ].map((group) => (
            <div key={group.title}>
              <p className="mb-5 text-[10px] font-bold tracking-[.14em]">
                {group.title}
              </p>
              <ul className="space-y-3">
                {group.items.map((item, index) => (
                  <li key={item}>
                    <Link
                      to={group.links[index]}
                      className="text-xs text-muted-foreground transition hover:text-primary"
                    >
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          className={`${containerClass} flex flex-wrap items-center justify-between gap-3 border-t border-border py-5 text-[10px] text-muted-foreground`}
        >
          <p>© 2026 IT HUB. All rights reserved.</p>
          <p>Serving customers since 2011</p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck size={12} /> Interactive frontend prototype · No real
            payments
          </p>
        </div>
      </footer>
      <AuthModal open={store.authOpen} onOpenChange={store.setAuthOpen} />
      <Modal
        open={search}
        onOpenChange={setSearch}
        title="Find your next upgrade."
        description="Search technology products, categories and IT services."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            navigate(`/products?q=${encodeURIComponent(query)}`)
            setSearch(false)
          }}
          className="relative"
        >
          <Search
            size={18}
            className="absolute left-3 top-3.5 text-muted-foreground"
          />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try RTX 5070, Laptop, SSD…"
            className={`${fieldClass} pl-10`}
          />
        </form>
        <p className="mb-3 mt-5 text-[10px] font-bold tracking-wider text-muted-foreground">
          PRODUCTS
        </p>
        <div className="space-y-1">
          {matches.slice(0, 5).map((product) => (
            <Link
              key={product.id}
              to={`/products/${product.id}`}
              onClick={() => setSearch(false)}
              className="flex justify-between gap-3 rounded-md p-3 text-sm hover:bg-muted"
            >
              <span>{product.name}</span>
              <strong>{money(product.price)}</strong>
            </Link>
          ))}
          {!matches.length && (
            <p className="py-3 text-sm text-muted-foreground">
              No matching products. Try a category or service below.
            </p>
          )}
        </div>
        <p className="mb-3 mt-5 text-[10px] font-bold tracking-wider text-muted-foreground">
          CATEGORIES & SERVICES
        </p>
        <div className="flex flex-wrap gap-2">
          {store.catalogCategories
            .filter((category) =>
              category.toLowerCase().includes(query.toLowerCase()),
            )
            .slice(0, 5)
            .map((category) => (
              <Link
                onClick={() => setSearch(false)}
                key={category}
                to={`/products?category=${encodeURIComponent(category)}`}
                className="rounded-md bg-secondary px-3 py-2 text-xs text-primary"
              >
                {category}
              </Link>
            ))}
          {serviceTypes
            .filter((service) =>
              service.toLowerCase().includes(query.toLowerCase()),
            )
            .slice(0, 4)
            .map((service) => (
              <Link
                onClick={() => setSearch(false)}
                key={service}
                to={`/services/book?service=${encodeURIComponent(service)}`}
                className="rounded-md bg-muted px-3 py-2 text-xs"
              >
                {service}
              </Link>
            ))}
        </div>
      </Modal>
      {store.toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[100] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-lg bg-[#0c2f8a] px-5 py-4 text-sm text-white shadow-xl"
        >
          <CheckCircle2 size={18} className="shrink-0 text-blue-300" />
          {store.toast}
        </div>
      )}
    </>
  )
}
