import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router"
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Cpu,
  ExternalLink,
  FileText,
  Gamepad2,
  Hash,
  Headphones,
  Laptop,
  LifeBuoy,
  Mail,
  MapPin,
  Monitor,
  Navigation,
  Phone,
  Printer,
  Router,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Smartphone,
  Tv,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import WhatsAppIcon from "../components/WhatsAppIcon"
import { useStore } from "../app/store"
import { track } from "../lib/analytics"
import WarrantyCheck from "../components/WarrantyCheck"
import {
  warrantyMonths,
  warrantyUntil,
  type BrandSupport,
  type Product,
  type ServiceCentre,
  type SupportCategory,
} from "../data/catalog"
import {
  calculatePincodeDistance,
  checkStoreSettingsCompleteness,
  validateIndianPincode,
} from "../lib/support"
import {
  ActionLink,
  Badge,
  Page,
  PageHeading,
  buttonClass,
  fieldClass,
  secondaryClass,
} from "../components/ui"

const DISCLAIMER =
  "Warranty terms and duration are determined exclusively by the respective manufacturer and vary by product model and purchase date. IT HUB provides official contact and locator assistance; warranty claims are validated directly by the brand against your purchase invoice."
const MISSING = "Not yet published — visit the official portal"

const icons: Record<string, LucideIcon> = {
  laptop: Laptop,
  mobile: Smartphone,
  smartphone: Smartphone,
  printer: Printer,
  monitor: Monitor,
  tv: Tv,
  camera: Camera,
  router: Router,
  gamepad: Gamepad2,
  cpu: Cpu,
}

const views = [
  { id: "warranty", name: "Manufacturer Directory", Icon: ShieldCheck },
  { id: "locator", name: "Find a Service Centre", Icon: MapPin },
  { id: "service", name: "Service Assistance", Icon: Wrench },
  { id: "onsite", name: "On-Site Warranty", Icon: Navigation },
  { id: "contact", name: "Contact IT HUB", Icon: Headphones },
] as const

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

export default function Support() {
  const store = useStore()
  const [params, setParams] = useSearchParams()
  const view = params.get("view") || "warranty"
  const orderId = params.get("order") || ""
  const productId = params.get("product") || ""
  const [query, setQuery] = useState("")
  const [other, setOther] = useState(false)
  const [pincodeInput, setPincodeInput] = useState("")
  const [pincodeSubmitted, setPincodeSubmitted] = useState("")
  const [pincodeError, setPincodeError] = useState("")

  const categories = store.supportCategories.filter((item) => item.active)
  const records = store.brandSupport.filter((item) => item.active)
  const serviceCentres = store.serviceCentres.filter((item) => item.active)

  const settingsStatus = useMemo(
    () => checkStoreSettingsCompleteness(store.settings),
    [store.settings],
  )

  const order = store.orders.find((item) => item.id === orderId)
  const orderItem = order?.items.find((item) => item.id === productId)
  const product: Product | undefined = store.products.find(
    (item) => item.id === productId,
  )

  // Customer order history for order-aware assistance
  const customerOrders = useMemo(() => {
    if (!store.loggedIn) return []
    return store.orders.filter((o) => o.status >= 0)
  }, [store.loggedIn, store.orders])

  // Category param may be a support id or a store catalog category name.
  const rawCategory = params.get("category") || ""
  const fromProduct = product
    ? categories.find((item) =>
        item.catalogCategories.includes(product.category),
      )
    : undefined
  const category =
    categories.find((item) => item.id === rawCategory) ||
    categories.find((item) => item.catalogCategories.includes(rawCategory)) ||
    (rawCategory ? undefined : fromProduct)
  const brandName =
    params.get("brand") || (product && category ? product.brand : "")
  const record = category
    ? records.find(
        (item) =>
          item.category === category.id &&
          item.brand.toLowerCase() === brandName.toLowerCase(),
      )
    : undefined

  const update = (next: Record<string, string | null>) => {
    const copy = new URLSearchParams(params)
    Object.entries(next).forEach(([key, value]) =>
      value ? copy.set(key, value) : copy.delete(key),
    )
    setParams(copy)
    setOther(false)
  }

  useEffect(() => {
    if (!record) return
    track("Warranty Assistance Viewed", { brand: record.brand })
    store.set((previous) => ({
      recentSupport: [
        record.id,
        ...previous.recentSupport.filter((id) => id !== record.id),
      ].slice(0, 6),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id])

  const handlePincodeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const clean = pincodeInput.trim()
    if (!clean) {
      setPincodeSubmitted("")
      setPincodeError("")
      return
    }
    if (!validateIndianPincode(clean)) {
      setPincodeError(
        "Please enter a valid 6-digit Indian PIN code (e.g. 686691)",
      )
      return
    }
    setPincodeError("")
    setPincodeSubmitted(clean)
  }

  const whatsapp = store.settings.whatsapp
    ? `https://wa.me/${store.settings.whatsapp}`
    : ""

  return (
    <Page>
      {/* Store Settings Alert Banner (if contact details are missing) */}
      {!settingsStatus.complete && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 shrink-0 text-amber-600"
              size={20}
            />
            <div>
              <p className="font-bold">Store Notice</p>
              <p className="mt-1 text-sm leading-6">
                Direct phone and messaging contact channels are currently being
                re-verified by our store administration. You can still access
                all verified official manufacturer warranties, or visit us in
                person.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Header */}
      <section className="relative mb-10 overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-[#ecf1ff] via-white to-white p-8 md:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <PageHeading
          eyebrow="IT HUB · REAL HELP & SUPPORT"
          title="Help & Support"
          description="Access official manufacturer warranties, locate authorized service centres in Kerala, book professional repairs, or connect with our store team."
        />
        <div className="relative grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {views.map(({ id, name, Icon }) => (
            <button
              key={id}
              onClick={() => update({ view: id })}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition ${
                view === id
                  ? "border-primary bg-primary text-white shadow-[0_10px_30px_-12px_rgba(26,79,214,.7)]"
                  : "border-border bg-white hover:border-primary hover:text-primary"
              }`}
            >
              <Icon size={18} /> {name}
            </button>
          ))}
        </div>
      </section>

      {/* VIEW 1: Manufacturer Warranty & Customer Support */}
      {view === "warranty" && (
        <div className="space-y-8">
          {/* Order-Aware Purchase Widget */}
          {order && orderItem && (
            <OrderContext
              orderId={order.id}
              date={order.date}
              cancelled={order.status < 0}
              name={orderItem.name}
              brand={product?.brand || ""}
              categoryName={category?.name || product?.category || ""}
              warranty={
                product?.specs?.Warranty ||
                product?.warranty ||
                "1 Year Manufacturer"
              }
            />
          )}

          {/* Quick Order-Aware Picker for Authenticated Customers */}
          {!order &&
            store.loggedIn &&
            customerOrders.length > 0 &&
            !category && (
              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                <div className="flex items-center gap-2 font-bold text-primary">
                  <ClipboardList size={18} />
                  <span>Your Recent Purchases</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Get instant warranty and service assistance for items you
                  bought from IT HUB.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {customerOrders.slice(0, 3).flatMap((o) =>
                    o.items.map((it) => {
                      const p = store.products.find((prod) => prod.id === it.id)
                      const targetCategory = p
                        ? categories.find((cat) =>
                            cat.catalogCategories.includes(p.category),
                          )?.id
                        : undefined
                      return (
                        <button
                          key={`${o.id}-${it.id}`}
                          onClick={() =>
                            update({
                              order: o.id,
                              product: it.id,
                              category: targetCategory || null,
                              brand: p?.brand || null,
                            })
                          }
                          className="flex items-center justify-between rounded-xl border border-border bg-white p-4 text-left transition hover:border-primary hover:shadow-sm"
                        >
                          <div className="overflow-hidden">
                            <p className="truncate font-semibold text-sm">
                              {it.name}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Order #{o.id.slice(0, 8)} · {fmt(o.date)}
                            </p>
                          </div>
                          <ChevronRight
                            size={16}
                            className="text-muted-foreground"
                          />
                        </button>
                      )
                    }),
                  )}
                </div>
              </section>
            )}

          {/* Step 1: Select Category */}
          {!category && (
            <section>
              <StepTitle step="1" title="Choose your device category" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map((item) => {
                  const Icon = icons[item.icon] || LifeBuoy
                  const count = records.filter(
                    (r) => r.category === item.id,
                  ).length
                  return (
                    <button
                      key={item.id}
                      onClick={() => update({ category: item.id, brand: null })}
                      className="group flex items-center gap-5 rounded-2xl border border-border bg-white p-6 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
                    >
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary transition group-hover:bg-primary group-hover:text-white">
                        <Icon size={26} />
                      </span>
                      <span>
                        <span className="block text-lg font-bold">
                          {item.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {count} verified brands
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <RecentlyViewed
                ids={store.recentSupport}
                records={records}
                onPick={(r) => update({ category: r.category, brand: r.brand })}
              />
            </section>
          )}

          {/* Step 2: Select Brand */}
          {category && !record && (
            <section>
              <button
                onClick={() => update({ category: null, brand: null })}
                className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                <ArrowLeft size={15} /> All categories
              </button>
              <StepTitle
                step="2"
                title={`Select your ${category.name.toLowerCase()} manufacturer`}
              />
              {brandName && (
                <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  We don't have verified support contacts recorded for “
                  {brandName}” yet. Pick a manufacturer below or contact IT HUB
                  for assistance.
                </p>
              )}
              <div className="mb-6 flex flex-wrap gap-3">
                <label className="relative min-w-[240px] flex-1">
                  <Search
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search manufacturer (e.g. HP, Apple, Samsung)..."
                    className={`${fieldClass} pl-11`}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => update({ category: item.id, brand: null })}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        item.id === category.id
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white hover:border-primary"
                      }`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
              <BrandGrid
                title="Popular Brands"
                list={records.filter(
                  (r) =>
                    r.category === category.id && r.popular && match(r, query),
                )}
                onPick={(r) => update({ brand: r.brand })}
              />
              <BrandGrid
                title="All Manufacturers"
                list={records.filter(
                  (r) => r.category === category.id && match(r, query),
                )}
                onPick={(r) => update({ brand: r.brand })}
                extra={
                  <button
                    onClick={() => setOther(true)}
                    className="rounded-2xl border border-dashed border-border bg-white p-5 text-left text-sm font-semibold hover:border-primary hover:text-primary transition"
                  >
                    Other Brand
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      Not listed here?
                    </span>
                  </button>
                }
              />
              {other && (
                <div className="mt-6 rounded-2xl border border-border bg-white p-6">
                  <h3 className="flex items-center gap-2 font-bold">
                    <ShieldQuestion size={18} className="text-primary" /> Brand
                    not listed
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Check the warranty card or invoice that came with your
                    product — it lists the manufacturer's official support phone
                    number and warranty website. Always avoid unverified
                    third-party numbers on search engines. Still stuck? Contact
                    IT HUB directly and our technicians will help you find the
                    correct authorized support center.
                  </p>
                  <button
                    onClick={() => update({ view: "contact" })}
                    className={`${buttonClass} mt-4`}
                  >
                    Contact IT HUB
                  </button>
                </div>
              )}
              <RecentlyViewed
                ids={store.recentSupport}
                records={records}
                onPick={(r) => update({ category: r.category, brand: r.brand })}
              />
            </section>
          )}

          {/* Step 3: Verified Brand Support Details Card & Authorized Service Centres */}
          {category && record && (
            <section className="space-y-8">
              <button
                onClick={() => update({ brand: null })}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                <ArrowLeft size={15} /> Back to {category.name} brands
              </button>
              <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                <BrandCard
                  record={record}
                  categoryName={category.name}
                  onContact={() => update({ view: "contact" })}
                />
                <ItHubCard
                  whatsapp={whatsapp}
                  phone={store.settings.phone}
                  complete={settingsStatus.complete}
                />
              </div>

              {/* Authorized Service Centres for this Brand */}
              <BrandServiceCentresSection
                brandName={record.brand}
                category={record.category}
                serviceLocatorUrl={record.serviceLocatorUrl}
                centres={serviceCentres}
                pincodeInput={pincodeInput}
                setPincodeInput={setPincodeInput}
                pincodeSubmitted={pincodeSubmitted}
                pincodeError={pincodeError}
                onPincodeSubmit={handlePincodeSubmit}
              />
            </section>
          )}

          <Checklist onContact={() => update({ view: "contact" })} />
        </div>
      )}

      {/* VIEW 2: Find a Service Centre (Full Directory) */}
      {view === "locator" && (
        <section className="space-y-8">
          <div className="rounded-2xl border border-primary/20 bg-secondary/60 p-8">
            <div className="flex items-center gap-3 text-primary">
              <MapPin size={28} />
              <h2 className="text-2xl font-bold text-foreground">
                Authorized Service Centre Locator
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Locate verified manufacturer-authorized service centres in Kerala.
              Enter your 6-digit Indian PIN code to calculate exact travel
              distances.
            </p>

            <form
              onSubmit={handlePincodeSubmit}
              className="mt-6 flex flex-wrap items-center gap-3"
            >
              <div className="relative min-w-[260px] flex-1">
                <MapPin
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={pincodeInput}
                  onChange={(e) => {
                    setPincodeInput(e.target.value)
                    setPincodeError("")
                  }}
                  placeholder="Enter 6-digit Indian PIN code (e.g. 686691)"
                  maxLength={6}
                  className={`${fieldClass} pl-11`}
                />
              </div>
              <button type="submit" className={buttonClass}>
                Calculate Distance
              </button>
              {pincodeSubmitted && (
                <button
                  type="button"
                  onClick={() => {
                    setPincodeInput("")
                    setPincodeSubmitted("")
                    setPincodeError("")
                  }}
                  className={secondaryClass}
                >
                  Clear PIN
                </button>
              )}
            </form>
            {pincodeError && (
              <p className="mt-2 text-xs font-semibold text-rose-600">
                {pincodeError}
              </p>
            )}
            {pincodeSubmitted && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing straight-line distance from PIN centroid:{" "}
                <strong className="text-foreground">{pincodeSubmitted}</strong>
              </p>
            )}
          </div>

          {/* Category & Brand Filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => update({ category: null, brand: null })}
              className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                !rawCategory
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white"
              }`}
            >
              All Categories
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => update({ category: c.id, brand: null })}
                className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                  rawCategory === c.id
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <ServiceCentreList
            centres={serviceCentres}
            categoryFilter={rawCategory}
            brandFilter={brandName}
            pincode={pincodeSubmitted}
            records={records}
          />
        </section>
      )}

      {/* VIEW 3: Service Assistance (Repairs with IT HUB) */}
      {view === "service" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-primary/20 bg-secondary/60 p-8">
            <Wrench className="text-primary" size={28} />
            <h2 className="mt-4 text-2xl font-bold">Service Assistance</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Out of warranty, physical damage or need an upgrade? IT HUB
              technicians repair laptops, desktops, mobiles and printers — in
              store or on-site.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ActionLink to="/services/book">
                Book a service request
              </ActionLink>
              <ActionLink secondary to="/track-service">
                Track a service
              </ActionLink>
            </div>
          </div>
          <ItHubCard
            whatsapp={whatsapp}
            phone={store.settings.phone}
            complete={settingsStatus.complete}
          />
        </div>
      )}

      {/* VIEW 4: On-Site Warranty Coverage Check */}
      {view === "onsite" && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-primary/20 bg-secondary/60 p-8">
            <h2 className="text-2xl font-bold">IT HUB On-Site Warranty</h2>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">
              Enter your PIN code to check whether IT HUB on-site doorstep
              warranty service covers your area.
            </p>
            <WarrantyCheck source="support" />
          </div>
          <div className="rounded-2xl border border-border bg-white p-8 text-sm leading-6 text-muted-foreground">
            <h3 className="mb-2 font-bold text-foreground">
              How is this different?
            </h3>
            <p>
              <strong>IT HUB On-Site Warranty:</strong> Provided directly by IT
              HUB for eligible purchases made from our store. Our technician
              visits your premises in covered Kerala areas.
            </p>
            <p className="mt-3">
              <strong>Manufacturer Warranty:</strong> Handled directly by the
              respective brand (Apple, HP, Dell, Samsung, etc.) through their
              national authorized service centers. Use the{" "}
              <button
                onClick={() => update({ view: "warranty" })}
                className="font-semibold text-primary hover:underline"
              >
                Manufacturer Directory
              </button>{" "}
              to access official toll-free lines and service locators.
            </p>
          </div>
        </div>
      )}

      {/* VIEW 5: Contact IT HUB */}
      {view === "contact" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ItHubCard
            whatsapp={whatsapp}
            phone={store.settings.phone}
            complete={settingsStatus.complete}
          />
          <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
            <h2 className="text-xl font-bold">Reach IT HUB Directly</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <Row
                Icon={Phone}
                label="Phone (Verified)"
                value={store.settings.phone}
                href={`tel:${store.settings.phone}`}
              />
              <Row
                Icon={Mail}
                label="Email"
                value={store.settings.email}
                href={`mailto:${store.settings.email}`}
              />
              <Row
                Icon={MapPin}
                label="Headquarters"
                value={store.settings.address}
              />
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Business hours: Monday to Saturday, 9:30 AM to 7:30 PM.
            </p>
            <Link
              to="/contact"
              className="mt-6 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Open Contact & Directions Page →
            </Link>
          </div>
        </div>
      )}
    </Page>
  )
}

const match = (record: BrandSupport, query: string) =>
  record.brand.toLowerCase().includes(query.trim().toLowerCase())

interface StepTitleProps {
  step: string
  title: string
}

function StepTitle({ step, title }: StepTitleProps) {
  return (
    <h2 className="mb-5 flex items-center gap-3 text-xl font-bold">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs text-white">
        {step}
      </span>
      {title}
    </h2>
  )
}

function BrandGrid({
  title,
  list,
  onPick,
  extra,
}: {
  title: string
  list: BrandSupport[]
  onPick: (record: BrandSupport) => void
  extra?: ReactNode
}) {
  if (!list.length && !extra) return null
  return (
    <div className="mb-8">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((record) => (
          <button
            key={record.id}
            onClick={() => onPick(record)}
            className="rounded-2xl border border-border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
          >
            <span className="block font-bold">{record.brand}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {record.lastVerifiedAt ? "Verified Contacts" : "Unverified"}
            </span>
          </button>
        ))}
        {extra}
      </div>
    </div>
  )
}

function RecentlyViewed({
  ids,
  records,
  onPick,
}: {
  ids: string[]
  records: BrandSupport[]
  onPick: (record: BrandSupport) => void
}) {
  const list = ids
    .map((id) => records.find((r) => r.id === id))
    .filter(Boolean) as BrandSupport[]
  if (!list.length) return null
  return (
    <div className="mt-8">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">
        Recently viewed
      </p>
      <div className="flex flex-wrap gap-2">
        {list.map((record) => (
          <button
            key={record.id}
            onClick={() => onPick(record)}
            className="rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary transition"
          >
            {record.brand} · {record.category}
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({
  Icon,
  label,
  value,
  kind,
}: {
  Icon: LucideIcon
  label: string
  value?: string
  kind: "tel" | "url" | "mail"
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 last:border-0">
      <div className="flex items-start gap-3">
        <Icon size={17} className="mt-0.5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={`text-sm ${
              value ? "font-semibold" : "italic text-muted-foreground"
            }`}
          >
            {value
              ? kind === "url"
                ? value.replace(/^https?:\/\//, "")
                : value
              : MISSING}
          </p>
        </div>
      </div>
      {value && kind === "tel" && (
        <a
          href={`tel:${value.replace(/\s/g, "")}`}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Call Now
        </a>
      )}
      {value && kind === "url" && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary transition"
        >
          Open <ExternalLink size={12} />
        </a>
      )}
      {value && kind === "mail" && (
        <a
          href={`mailto:${value}`}
          className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary transition"
        >
          Email
        </a>
      )}
    </div>
  )
}

function BrandCard({
  record,
  categoryName,
  onContact,
}: {
  record: BrandSupport
  categoryName: string
  onContact: () => void
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-7 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">
            Official Manufacturer Contacts
          </p>
          <h2 className="mt-1 text-2xl font-extrabold">
            {record.brand}{" "}
            <span className="font-medium text-muted-foreground">
              {categoryName}
            </span>
          </h2>
        </div>
        {record.lastVerifiedAt ? (
          <Badge tone="green">
            <BadgeCheck size={13} className="mr-1 inline" /> Verified{" "}
            {fmt(record.lastVerifiedAt)}
          </Badge>
        ) : (
          <Badge tone="amber">Pending Verification</Badge>
        )}
      </div>

      <p className="mt-3 rounded-lg bg-blue-50 px-3.5 py-2.5 text-xs text-blue-900 leading-5">
        <strong>Manufacturer Support Notice:</strong> Services, spare parts, and
        warranty inspections are administered directly by {record.brand}. Have
        your product serial number and purchase invoice ready.
      </p>

      <div className="mt-4">
        {/* Clearly distinguished Warranty Support vs. General Customer Care */}
        <Field
          Icon={ShieldCheck}
          label="Official Warranty Support (Toll-Free)"
          value={record.warrantyPhone}
          kind="tel"
        />
        <Field
          Icon={Phone}
          label="General Customer Care & Technical Helpline"
          value={record.customerCarePhone}
          kind="tel"
        />
        <Field
          Icon={LifeBuoy}
          label="Official Support Website"
          value={record.supportUrl}
          kind="url"
        />
        <Field
          Icon={FileText}
          label="Official Warranty Portal (Check Status by Serial)"
          value={record.warrantyUrl}
          kind="url"
        />
        {record.serviceLocatorUrl && (
          <Field
            Icon={MapPin}
            label="Official Service Centre Locator"
            value={record.serviceLocatorUrl}
            kind="url"
          />
        )}
        <Field
          Icon={Mail}
          label="Official Email Support"
          value={record.email}
          kind="mail"
        />
      </div>

      {record.notes && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground border-t border-border pt-3">
          {record.notes}
        </p>
      )}

      {/* Action Buttons */}
      <div className="mt-6 flex flex-wrap gap-3">
        {record.warrantyPhone && (
          <a
            href={`tel:${record.warrantyPhone.replace(/\s/g, "")}`}
            className={buttonClass}
          >
            <Phone size={15} /> Call Warranty Support
          </a>
        )}
        {record.customerCarePhone && (
          <a
            href={`tel:${record.customerCarePhone.replace(/\s/g, "")}`}
            className={secondaryClass}
          >
            <Phone size={15} /> Call Customer Care
          </a>
        )}
        {record.warrantyUrl && (
          <button
            onClick={() =>
              window.open(record.warrantyUrl, "_blank", "noopener,noreferrer")
            }
            className={secondaryClass}
          >
            <FileText size={15} /> Check Warranty Online
          </button>
        )}
        {record.serviceLocatorUrl && (
          <button
            onClick={() =>
              window.open(
                record.serviceLocatorUrl,
                "_blank",
                "noopener,noreferrer",
              )
            }
            className={secondaryClass}
          >
            <MapPin size={15} /> Official Locator
          </button>
        )}
        <button onClick={onContact} className={secondaryClass}>
          <Headphones size={15} /> Contact IT HUB
        </button>
      </div>
    </article>
  )
}

interface ItHubCardProps {
  whatsapp: string
  phone: string
  complete: boolean
}

function ItHubCard({ whatsapp, phone, complete }: ItHubCardProps) {
  return (
    <aside className="rounded-2xl border border-primary/20 bg-gradient-to-br from-[#ecf1ff] to-white p-7">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">
        IT HUB Support
      </p>
      <h2 className="mt-1 text-2xl font-extrabold text-[#0c2f8a]">
        We're here to help
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Hardware repairs, software diagnostics, parts upgrades and IT HUB
        on-site warranty — handled directly by our certified local team.
      </p>
      <div className="mt-6 grid gap-3">
        {complete && phone && (
          <a href={`tel:${phone.replace(/\s/g, "")}`} className={buttonClass}>
            <Phone size={15} /> Call IT HUB ({phone})
          </a>
        )}
        {complete && whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-95"
          >
            <WhatsAppIcon size={15} /> WhatsApp IT HUB
          </a>
        )}
        <ActionLink secondary to="/services/book">
          <Wrench size={15} /> Book a repair request
        </ActionLink>
        <ActionLink secondary to="/support?view=onsite">
          <Navigation size={15} /> On-site warranty PIN check
        </ActionLink>
      </div>
    </aside>
  )
}

function BrandServiceCentresSection({
  brandName,
  category,
  serviceLocatorUrl,
  centres,
  pincodeInput,
  setPincodeInput,
  pincodeSubmitted,
  pincodeError,
  onPincodeSubmit,
}: {
  brandName: string
  category: string
  serviceLocatorUrl?: string
  centres: ServiceCentre[]
  pincodeInput: string
  setPincodeInput: (val: string) => void
  pincodeSubmitted: string
  pincodeError: string
  onPincodeSubmit: (e?: React.FormEvent) => void
}) {
  const filtered = centres.filter(
    (c) =>
      c.brandName.toLowerCase() === brandName.toLowerCase() &&
      c.category.toLowerCase() === category.toLowerCase(),
  )

  const withDistance = useMemo(() => {
    if (!pincodeSubmitted || !validateIndianPincode(pincodeSubmitted)) {
      return filtered
    }
    const mapped = filtered.map((c) => ({
      ...c,
      distanceKm:
        calculatePincodeDistance(pincodeSubmitted, c.latitude, c.longitude) ??
        undefined,
    }))
    return mapped.sort((a, b) => {
      if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
        return a.distanceKm - b.distanceKm
      }
      if (a.distanceKm !== undefined) return -1
      if (b.distanceKm !== undefined) return 1
      return a.name.localeCompare(b.name)
    })
  }, [filtered, pincodeSubmitted])

  return (
    <div className="rounded-2xl border border-border bg-white p-7 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <MapPin className="text-primary" size={20} />
            Authorized {brandName} Service Centres in Kerala
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Verified official authorized service points. Enter your 6-digit
            Indian PIN code to calculate straight-line travel distance.
          </p>
        </div>
        {serviceLocatorUrl && (
          <a
            href={serviceLocatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            Official {brandName} Locator <ExternalLink size={13} />
          </a>
        )}
      </div>

      {/* Proximity PIN Code Input */}
      <form onSubmit={onPincodeSubmit} className="mt-5 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <input
            value={pincodeInput}
            onChange={(e) => setPincodeInput(e.target.value)}
            placeholder="Enter your 6-digit PIN code"
            maxLength={6}
            className={`${fieldClass} py-2 text-sm`}
          />
        </div>
        <button type="submit" className={`${buttonClass} py-2 text-xs`}>
          Check Distance
        </button>
        {pincodeSubmitted && (
          <button
            type="button"
            onClick={() => {
              setPincodeInput("")
              onPincodeSubmit()
            }}
            className={`${secondaryClass} py-2 text-xs`}
          >
            Reset
          </button>
        )}
      </form>
      {pincodeError && (
        <p className="mt-2 text-xs font-semibold text-rose-600">
          {pincodeError}
        </p>
      )}

      {/* Centre Cards */}
      <div className="mt-6 space-y-4">
        {withDistance.length > 0 ? (
          withDistance.map((c) => (
            <ServiceCentreCard
              key={c.id}
              centre={c}
              userPin={pincodeSubmitted}
            />
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center">
            <p className="font-semibold text-sm">
              No direct authorized service centre registered in our Kerala
              database for {brandName}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Please consult {brandName}'s official locator portal to view all
              certified franchises and walk-in centers across India.
            </p>
            {serviceLocatorUrl && (
              <a
                href={serviceLocatorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonClass} mt-4 inline-flex`}
              >
                <MapPin size={14} className="mr-1.5" /> Open Official{" "}
                {brandName} Locator
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ServiceCentreCard({
  centre,
  userPin,
}: {
  centre: ServiceCentre
  userPin?: string
}) {
  return (
    <div className="rounded-xl border border-border p-5 hover:border-primary/50 transition">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-base">{centre.name}</h4>
            {centre.isAuthorized && (
              <Badge tone="green">
                <BadgeCheck size={12} className="mr-1 inline" /> Authorized
                Centre
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{centre.address}</p>
          <p className="text-xs text-muted-foreground">
            PIN: {centre.pincode} · {centre.city}, {centre.state}
          </p>
        </div>
        {centre.distanceKm !== undefined && (
          <div className="rounded-lg bg-blue-50 px-3 py-1.5 text-right">
            <span className="block text-xs font-bold text-primary">
              ~{centre.distanceKm} km
            </span>
            <span className="block text-[10px] text-muted-foreground">
              from {userPin}
            </span>
          </div>
        )}
      </div>

      {centre.authorizationEvidence && (
        <p className="mt-2 text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2">
          Evidence: {centre.authorizationEvidence}
        </p>
      )}

      {centre.servicesOffered && centre.servicesOffered.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {centre.servicesOffered.map((s) => (
            <span
              key={s}
              className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
        <div className="flex items-center gap-4 text-xs">
          {centre.phone && (
            <a
              href={`tel:${centre.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <Phone size={13} /> {centre.phone}
            </a>
          )}
          {centre.email && (
            <a
              href={`mailto:${centre.email}`}
              className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
            >
              <Mail size={13} /> {centre.email}
            </a>
          )}
        </div>
        {centre.sourceUrl && (
          <a
            href={centre.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition"
          >
            Source <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  )
}

function ServiceCentreList({
  centres,
  categoryFilter,
  brandFilter,
  pincode,
  records,
}: {
  centres: ServiceCentre[]
  categoryFilter?: string
  brandFilter?: string
  pincode?: string
  records: BrandSupport[]
}) {
  const filtered = useMemo(() => {
    let list = centres
    if (categoryFilter) {
      list = list.filter((c) => c.category === categoryFilter)
    }
    if (brandFilter) {
      list = list.filter(
        (c) => c.brandName.toLowerCase() === brandFilter.toLowerCase(),
      )
    }
    if (pincode && validateIndianPincode(pincode)) {
      list = list.map((c) => ({
        ...c,
        distanceKm:
          calculatePincodeDistance(pincode, c.latitude, c.longitude) ??
          undefined,
      }))
      list = [...list].sort((a, b) => {
        if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
          return a.distanceKm - b.distanceKm
        }
        if (a.distanceKm !== undefined) return -1
        if (b.distanceKm !== undefined) return 1
        return a.name.localeCompare(b.name)
      })
    }
    return list
  }, [centres, categoryFilter, brandFilter, pincode])

  return (
    <div className="space-y-4">
      {filtered.length > 0 ? (
        filtered.map((c) => (
          <ServiceCentreCard key={c.id} centre={c} userPin={pincode} />
        ))
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <p className="font-bold text-base">
            No authorized service centres found for this filter.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try choosing a different category or consult the manufacturer's
            official locator directly.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {records
              .filter((r) => r.serviceLocatorUrl)
              .slice(0, 4)
              .map((r) => (
                <a
                  key={r.id}
                  href={r.serviceLocatorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={secondaryClass}
                >
                  {r.brand} Locator <ExternalLink size={12} className="ml-1" />
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OrderContext({
  orderId,
  date,
  cancelled,
  name,
  brand,
  categoryName,
  warranty,
}: {
  orderId: string
  date: string
  cancelled: boolean
  name: string
  brand: string
  categoryName: string
  warranty: string
}) {
  const months = warrantyMonths(warranty)
  const until = months ? warrantyUntil(date, months) : ""
  const active = until ? new Date(until) > new Date() : false
  return (
    <section className="rounded-2xl border border-border bg-white p-7 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardList size={18} className="text-primary" /> Purchased Item
          Details
        </h2>
        {cancelled && <Badge tone="red">Order cancelled</Badge>}
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <Info label="Product" value={name} />
        <Info label="Brand" value={brand || "—"} />
        <Info label="Category" value={categoryName || "—"} />
        <Info label="Purchase Date" value={fmt(date)} />
        <Info label="Order Number" value={orderId} />
      </dl>
      <div className="mt-6 rounded-xl bg-muted p-5">
        {months ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <span>
              Standard warranty: <strong>{warranty}</strong>
            </span>
            <span>
              Estimated warranty until: <strong>{fmt(until)}</strong>
            </span>
            <Badge tone={active ? "green" : "gray"}>
              {active ? "Likely Active" : "Likely Expired"}
            </Badge>
          </div>
        ) : null}
        <p
          className={
            months
              ? "mt-3 text-xs text-muted-foreground leading-5"
              : "text-sm text-muted-foreground leading-5"
          }
        >
          {DISCLAIMER}
        </p>
      </div>
    </section>
  )
}

interface InfoProps {
  label: string
  value: string
}

function Info({ label, value }: InfoProps) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  )
}

function Row({
  Icon,
  label,
  value,
  href,
}: {
  Icon: LucideIcon
  label: string
  value?: string
  href?: string
}) {
  return (
    <div className="flex gap-3">
      <Icon size={17} className="mt-0.5 text-primary" />
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-semibold">
          {value ? href ? <a href={href}>{value}</a> : value : "Not available"}
        </dd>
      </div>
    </div>
  )
}

function Checklist({ onContact }: { onContact: () => void }) {
  const items = [
    { Icon: FileText, text: "Keep your invoice ready" },
    { Icon: Hash, text: "Note the serial number (S/N)" },
    { Icon: ClipboardList, text: "Describe symptoms clearly" },
    { Icon: Headphones, text: "Contact IT HUB for guidance" },
  ]
  return (
    <section className="rounded-2xl border border-border bg-white p-7 shadow-sm">
      <h2 className="text-lg font-bold">
        What to prepare before requesting warranty service
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ Icon, text }) => (
          <li
            key={text}
            className="flex items-center gap-3 rounded-xl bg-muted p-4 text-sm font-medium"
          >
            <CheckCircle2 size={16} className="text-primary shrink-0" />
            <Icon size={16} className="text-muted-foreground shrink-0" /> {text}
          </li>
        ))}
      </ul>
      <button onClick={onContact} className={`${buttonClass} mt-5`}>
        Need Assistance? Contact IT HUB
      </button>
    </section>
  )
}
