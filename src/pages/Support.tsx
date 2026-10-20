import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useSearchParams } from "react-router"

import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
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

import { checkStoreSettingsCompleteness } from "../lib/support"

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

const STORE_MAP_URL = "https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8"

const STORE_MAP_EMBED =
  "https://www.google.com/maps?q=IT+HUB+Kothamangalam+Kerala&z=16&output=embed"

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

  { id: "service", name: "Service Assistance", Icon: Wrench },

  { id: "onsite", name: "On-Site Service", Icon: Navigation },

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

  const rawView = params.get("view") || "warranty"

  const view = rawView === "locator" ? "warranty" : rawView

  const orderId = params.get("order") || ""

  const productId = params.get("product") || ""

  const [query, setQuery] = useState("")

  const categories = store.supportCategories.filter((item) => item.active)

  const records = store.brandSupport.filter((item) => item.active)

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

  const whatsapp = store.settings.whatsapp
    ? `https://wa.me/${store.settings.whatsapp}`
    : ""

  const email = store.settings.email || "ithubkmgm@gmail.com"

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
          description="Access official manufacturer warranties, book professional repairs, or connect with our store team."
        />
        <div className="relative grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
              />
              <RecentlyViewed
                ids={store.recentSupport}
                records={records}
                onPick={(r) => update({ category: r.category, brand: r.brand })}
              />
            </section>
          )}

          {/* Step 3: Verified Brand Support Details Card */}
          {category && record && (
            <section className="space-y-8">
              <button
                onClick={() => update({ brand: null })}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                <ArrowLeft size={15} /> Back to {category.name} brands
              </button>
              <div className="mx-auto max-w-3xl">
                <BrandCard
                  record={record}
                  categoryName={category.name}
                  onContact={() => update({ view: "contact" })}
                />
              </div>

              {/* Verified Manufacturer Service Centres in Whole Kerala */}
              <BrandKeralaServiceCentres
                record={record}
                category={category}
                centres={store.serviceCentres}
              />
            </section>
          )}

          <Checklist onContact={() => update({ view: "contact" })} />
        </div>
      )}

      {/* VIEW 3: Service Assistance (Repairs with IT HUB) */}
      {view === "service" && (
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-col items-center rounded-2xl border border-primary/20 bg-secondary/60 p-8 text-center sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Wrench size={28} />
            </div>
            <h2 className="mt-4 text-2xl font-bold">Service Assistance</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Out of warranty, physical damage or need an upgrade? IT HUB
              technicians repair laptops, desktops, mobiles and printers — in
              store or on-site.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <ActionLink to="/services/book">
                Book a service request
              </ActionLink>
              <ActionLink secondary to="/track-service">
                Track a service
              </ActionLink>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: On-Site Service Coverage Check */}
      {view === "onsite" && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-primary/20 bg-secondary/60 p-8">
            <h2 className="text-2xl font-bold">IT HUB On-Site Service</h2>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">
              Enter your PIN code to check whether IT HUB on-site doorstep
              service covers your area.
            </p>
            <WarrantyCheck source="support" />
          </div>
          <div className="rounded-2xl border border-border bg-white p-8 text-sm leading-6 text-muted-foreground">
            <h3 className="mb-2 font-bold text-foreground">
              How is this different?
            </h3>
            <p>
              <strong>IT HUB On-Site Service:</strong> Provided directly by IT
              HUB for repairs, diagnostics, upgrades, and doorstep assistance.
              Our certified technician visits your premises in covered Kerala
              areas.
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
            email={email}
            complete={settingsStatus.complete}
          />
          <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">Reach IT HUB Directly</h2>
              <a
                href={STORE_MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Open Google Maps <ArrowUpRight size={13} />
              </a>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {store.settings.address ||
                "Molathu Building, College Jn., Kothamangalam, Kerala - 686691"}
            </p>

            <div className="relative mt-4 h-60 w-full overflow-hidden rounded-2xl border border-border bg-muted shadow-inner">
              <iframe
                title="IT HUB store location on Google Maps"
                src={STORE_MAP_EMBED}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className="h-full w-full border-0"
              />
              <a
                href={STORE_MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl border border-border bg-white/95 px-3.5 py-2.5 shadow-md backdrop-blur transition hover:border-primary/40 sm:right-auto"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">
                    <MapPin size={16} />
                  </span>
                  <div>
                    <span className="block text-xs font-bold text-foreground">
                      IT HUB
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      Kothamangalam, Kerala
                    </span>
                  </div>
                </div>
                <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
                  Directions <ArrowUpRight size={11} />
                </span>
              </a>
            </div>

            <StoreWorkingHoursCard />
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
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">
          Official Manufacturer Contacts
        </p>
        <h2 className="mt-1 text-2xl font-extrabold">
          {record.brand}{" "}
          <span className="font-medium text-muted-foreground">
            {categoryName}
          </span>
        </h2>
        <div className="mt-2.5 flex justify-center">
          {record.lastVerifiedAt ? (
            <Badge tone="green">
              <BadgeCheck size={13} className="mr-1 inline" /> Verified{" "}
              {fmt(record.lastVerifiedAt)}
            </Badge>
          ) : (
            <Badge tone="amber">Pending Verification</Badge>
          )}
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-center text-xs text-blue-900 leading-relaxed">
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
        <p className="mt-4 border-t border-border pt-3 text-center text-sm leading-6 text-muted-foreground">
          {record.notes}
        </p>
      )}

      {/* Action Buttons */}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
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
            <MapPin size={15} /> Official Service Centre Locator
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

  email?: string

  complete: boolean
}

function StoreWorkingHoursCard() {
  const cardRef = useRef<HTMLDivElement | null>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current

    if (!el) return

    const rect = el.getBoundingClientRect()

    el.style.setProperty("--x", `${e.clientX - rect.left}px`)

    el.style.setProperty("--y", `${e.clientY - rect.top}px`)

    el.style.setProperty("--spot", "rgba(26, 79, 214, 0.16)")
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className="rb-spotlight relative mt-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-[#f8faff] via-white to-[#ecf1ff]/60 p-5 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2 border-b border-primary/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock size={15} />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Store Working Hours
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Service Counter
        </span>
      </div>

      <div className="mt-3.5 space-y-2.5 text-xs">
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-white/80 px-3.5 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-muted-foreground" />
            <span className="font-semibold text-foreground">
              Monday to Saturday
            </span>
          </div>
          <span className="rounded-md bg-primary/10 px-2.5 py-1 font-bold text-primary">
            10:00 AM – 8:30 PM
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-white/80 px-3.5 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <span className="font-medium text-foreground">Sunday</span>
          </div>
          <span className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 font-bold text-rose-700">
            Holiday
          </span>
        </div>
      </div>
    </div>
  )
}

function ItHubCard({ whatsapp, phone, email, complete }: ItHubCardProps) {
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
        on-site service — handled directly by our certified local team.
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
        {complete && email && (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-white px-6 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary hover:shadow-sm"
          >
            <Mail size={15} className="shrink-0 text-primary" />
            <span className="truncate">Email IT HUB ({email})</span>
          </a>
        )}
      </div>
    </aside>
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

interface BrandKeralaServiceCentresProps {
  record: BrandSupport

  category: SupportCategory

  centres: ServiceCentre[]
}

function BrandKeralaServiceCentres({
  record,

  category,

  centres,
}: BrandKeralaServiceCentresProps) {
  const [cityFilter, setCityFilter] = useState("all")

  const [searchQuery, setSearchQuery] = useState("")

  // Filter centers matching category & brand

  const brandCentres = useMemo(() => {
    const list = centres.filter(
      (c) =>
        c.active &&
        c.category.toLowerCase() === category.id.toLowerCase() &&
        c.brandName.toLowerCase() === record.brand.toLowerCase(),
    )

    if (list.length > 0) return list

    return centres.filter(
      (c) =>
        c.active && c.brandName.toLowerCase() === record.brand.toLowerCase(),
    )
  }, [centres, category.id, record.brand])

  // Extract unique cities and counts

  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = {}

    brandCentres.forEach((c) => {
      if (c.city) {
        counts[c.city] = (counts[c.city] || 0) + 1
      }
    })

    return counts
  }, [brandCentres])

  const sortedCities = useMemo(() => {
    return Object.keys(cityCounts).sort((a, b) => {
      const priority = [
        "Kochi",

        "Muvattupuzha",

        "Thodupuzha",

        "Kottayam",

        "Thrissur",

        "Thiruvananthapuram",

        "Kozhikode",
      ]

      const idxA = priority.indexOf(a)

      const idxB = priority.indexOf(b)

      if (idxA !== -1 && idxB !== -1) return idxA - idxB

      if (idxA !== -1) return -1

      if (idxB !== -1) return 1

      return a.localeCompare(b)
    })
  }, [cityCounts])

  // Filter by city and search query
  const displayedCentres = useMemo(() => {
    let list = brandCentres

    if (cityFilter !== "all") {
      list = list.filter(
        (c) => c.city.toLowerCase() === cityFilter.toLowerCase(),
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.pincode.includes(q),
      )
    }

    return [...list].sort((a, b) => a.city.localeCompare(b.city))
  }, [brandCentres, cityFilter, searchQuery])

  if (brandCentres.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-7 text-center shadow-sm">
        <MapPin size={32} className="mx-auto text-muted-foreground/60 mb-2" />
        <h3 className="text-lg font-bold">Authorized Service Centres</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Authorized service points for {record.brand} {category.name} in Kerala
          are listed directly on the official brand locator.
        </p>
        {record.serviceLocatorUrl && (
          <a
            href={record.serviceLocatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClass} mt-4 inline-flex items-center gap-1.5`}
          >
            Open Official {record.brand} Locator <ExternalLink size={14} />
          </a>
        )}
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-gradient-to-b from-white via-white to-[#f8faff] p-7 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin size={18} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[.16em] text-primary">
              Kerala Authorized Service Network
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-extrabold text-foreground">
            {record.brand} Authorized Service Centres in Whole Kerala
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing verified manufacturer service locations, warranty inspection
            centers, and spare parts facilities across Kerala districts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="green">
            <BadgeCheck size={14} className="mr-1 inline text-emerald-600" />
            {brandCentres.length} Kerala Centres Verified
          </Badge>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 space-y-4">
        {/* City Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-bold text-muted-foreground">
            Filter District:
          </span>
          <button
            onClick={() => setCityFilter("all")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              cityFilter === "all"
                ? "bg-primary text-white shadow-sm"
                : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            All Kerala ({brandCentres.length})
          </button>
          {sortedCities.map((city) => (
            <button
              key={city}
              onClick={() => setCityFilter(city)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                cityFilter.toLowerCase() === city.toLowerCase()
                  ? "bg-primary text-white shadow-sm"
                  : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {city} ({cityCounts[city]})
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div>
          <label className="relative block">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by city, area, road, pincode, or centre name..."
              className={`${fieldClass} pl-10 text-xs`}
            />
          </label>
        </div>
      </div>

      {/* Results Count & Status */}
      <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing <strong>{displayedCentres.length}</strong> of{" "}
          {brandCentres.length} {record.brand} service centres in Kerala
          {cityFilter !== "all" ? ` in ${cityFilter}` : ""}
        </span>
        {(cityFilter !== "all" || searchQuery) && (
          <button
            onClick={() => {
              setCityFilter("all")
              setSearchQuery("")
            }}
            className="font-semibold text-primary hover:underline"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Grid of Centres */}
      {displayedCentres.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {displayedCentres.map((centre) => (
            <div
              key={centre.id}
              className="flex flex-col justify-between rounded-2xl border border-border/80 bg-white p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary mb-1">
                      {centre.city}, Kerala
                    </span>
                    <h3 className="text-base font-bold text-foreground leading-snug">
                      {centre.name}
                    </h3>
                  </div>
                  <Badge tone="green">
                    <BadgeCheck
                      size={12}
                      className="mr-1 inline text-emerald-600"
                    />
                    Authorized
                  </Badge>
                </div>

                {/* Address */}
                <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-primary" />
                  <span>
                    {centre.address} — PIN {centre.pincode}
                  </span>
                </div>

                {/* Services Tags */}
                {centre.servicesOffered &&
                  centre.servicesOffered.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {centre.servicesOffered.map((service, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  )}
              </div>

              {/* Bottom Actions */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  {centre.phone && (
                    <a
                      href={`tel:${centre.phone.replace(/[^0-9+]/g, "")}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
                    >
                      <Phone size={12} /> Call Centre
                    </a>
                  )}
                  {centre.email && (
                    <a
                      href={`mailto:${centre.email}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
                    >
                      <Mail size={12} /> Email
                    </a>
                  )}
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${centre.name} ${centre.address}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Directions <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <p className="font-semibold text-sm">
            No service centres found matching your search.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try selecting "All Kerala" or clearing your search keywords.
          </p>
          <button
            onClick={() => {
              setCityFilter("all")

              setSearchQuery("")
            }}
            className={`${buttonClass} mt-4 text-xs`}
          >
            View All {record.brand} Kerala Centres
          </button>
        </div>
      )}

      {/* Official Brand Portal Notice */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-primary">
        <div>
          <span className="font-bold">
            Need Doorstep Technician Assistance?
          </span>
          <p className="mt-0.5 text-muted-foreground text-[11px]">
            {record.brand} also provides authorized on-site engineer visits for
            eligible products across Kerala.
          </p>
        </div>
        {record.serviceLocatorUrl && (
          <a
            href={record.serviceLocatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
          >
            Visit Official {record.brand} Locator <ArrowUpRight size={13} />
          </a>
        )}
      </div>
    </section>
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
