import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router"
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  CheckCircle2,
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
} from "../data/catalog"
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
  "Warranty information may vary by product, purchase date, and manufacturer terms. Please verify warranty status with the manufacturer."
const MISSING = "Not yet available — visit the official website"

const icons: Record<string, LucideIcon> = {
  laptop: Laptop,
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
  { id: "warranty", name: "Help & Support", Icon: ShieldCheck },
  { id: "service", name: "Service Assistance", Icon: Wrench },
  { id: "onsite", name: "On-Site Warranty", Icon: MapPin },
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

  const categories = store.supportCategories.filter((item) => item.active)
  const records = store.brandSupport.filter((item) => item.active)

  const order = store.orders.find((item) => item.id === orderId)
  const orderItem = order?.items.find((item) => item.id === productId)
  const product: Product | undefined = store.products.find(
    (item) => item.id === productId,
  )

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

  const whatsapp = store.settings.whatsapp
    ? `https://wa.me/${store.settings.whatsapp}`
    : ""

  return (
    <Page>
      <section className="relative mb-10 overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-[#ecf1ff] via-white to-white p-8 md:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <PageHeading
          eyebrow="IT HUB · HELP CENTRE"
          title="Help & Support"
          description="Find official manufacturer warranty contacts, book a repair with IT HUB, check on-site warranty coverage or talk to our team — all in one place."
        />
        <div className="relative grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {views.map(({ id, name, Icon }) => (
            <button
              key={id}
              onClick={() => update({ view: id })}
              className={`flex items-center gap-3 rounded-2xl border px-5 py-4 text-left text-sm font-semibold transition ${
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

      {view === "warranty" && (
        <div className="space-y-8">
          {order && orderItem && (
            <OrderContext
              orderId={order.id}
              date={order.date}
              cancelled={order.status < 0}
              name={orderItem.name}
              brand={product?.brand || ""}
              categoryName={category?.name || product?.category || ""}
              warranty={product?.specs.Warranty || product?.warranty || ""}
            />
          )}
          {!category && (
            <section>
              <StepTitle step="1" title="Choose your product category" />
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
                          {count} brands
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

          {category && !record && (
            <section>
              <button
                onClick={() => update({ category: null, brand: null })}
                className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"
              >
                <ArrowLeft size={15} /> All categories
              </button>
              <StepTitle
                step="2"
                title={`Select your ${category.name.toLowerCase()} brand`}
              />
              {brandName && (
                <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  We don't have verified support details for “{brandName}” yet.
                  Pick a brand below or contact IT HUB.
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
                    placeholder="Search brands"
                    className={`${fieldClass} pl-11`}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => update({ category: item.id, brand: null })}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                        item.id === category.id
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white"
                      }`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
              <BrandGrid
                title="Popular brands"
                list={records.filter(
                  (r) =>
                    r.category === category.id && r.popular && match(r, query),
                )}
                onPick={(r) => update({ brand: r.brand })}
              />
              <BrandGrid
                title="All brands"
                list={records.filter(
                  (r) => r.category === category.id && match(r, query),
                )}
                onPick={(r) => update({ brand: r.brand })}
                extra={
                  <button
                    onClick={() => setOther(true)}
                    className="rounded-2xl border border-dashed border-border bg-white p-5 text-left text-sm font-semibold hover:border-primary hover:text-primary"
                  >
                    Other brand
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
                    product — it lists the manufacturer's official support
                    number and website. You can also search for the brand's
                    official support page (avoid third-party numbers). Still
                    stuck? IT HUB can help you find the right contact.
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

          {category && record && (
            <section>
              <button
                onClick={() => update({ brand: null })}
                className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"
              >
                <ArrowLeft size={15} /> {category.name} brands
              </button>
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <BrandCard
                  record={record}
                  categoryName={category.name}
                  onContact={() => update({ view: "contact" })}
                />
                <ItHubCard whatsapp={whatsapp} phone={store.settings.phone} />
              </div>
            </section>
          )}

          <Checklist onContact={() => update({ view: "contact" })} />
        </div>
      )}

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
          <ItHubCard whatsapp={whatsapp} phone={store.settings.phone} />
        </div>
      )}

      {view === "onsite" && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-primary/20 bg-secondary/60 p-8">
            <h2 className="text-2xl font-bold">IT HUB On-Site Warranty</h2>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">
              Enter your PIN code to check whether IT HUB on-site warranty
              service covers your area.
            </p>
            <WarrantyCheck source="support" />
          </div>
          <div className="rounded-2xl border border-border bg-white p-8 text-sm leading-6 text-muted-foreground">
            <h3 className="mb-2 font-bold text-foreground">
              How is this different?
            </h3>
            IT HUB on-site warranty is provided by IT HUB for eligible
            purchases. Manufacturer warranty is handled separately by the brand
            — use{" "}
            <button
              onClick={() => update({ view: "warranty" })}
              className="font-semibold text-primary"
            >
              Help & Support
            </button>{" "}
            to find official brand contacts.
          </div>
        </div>
      )}

      {view === "contact" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ItHubCard whatsapp={whatsapp} phone={store.settings.phone} />
          <div className="rounded-2xl border border-border bg-white p-8">
            <h2 className="text-xl font-bold">Reach IT HUB</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <Row
                Icon={Phone}
                label="Phone"
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
                label="Visit us"
                value={store.settings.address}
              />
            </dl>
            <Link
              to="/contact"
              className="mt-6 inline-block text-sm font-semibold text-primary"
            >
              Open contact page →
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
              {record.lastVerifiedAt ? "Verified" : "Unverified"}
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
            className="rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary"
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
  value: string
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
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white"
        >
          Call Now
        </a>
      )}
      {value && kind === "url" && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary"
        >
          Open <ExternalLink size={12} />
        </a>
      )}
      {value && kind === "mail" && (
        <a
          href={`mailto:${value}`}
          className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary"
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
  const site = record.supportUrl || record.warrantyUrl
  return (
    <article className="rounded-2xl border border-border bg-white p-7 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">
            Brand Help & Support
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
            <BadgeCheck size={13} className="mr-1 inline" /> Verified on{" "}
            {fmt(record.lastVerifiedAt)}
          </Badge>
        ) : (
          <Badge tone="amber">Unverified</Badge>
        )}
      </div>
      <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        Handled by the manufacturer — not IT HUB on-site warranty
      </p>
      <div className="mt-4">
        <Field
          Icon={ShieldCheck}
          label="Warranty support"
          value={record.warrantyPhone}
          kind="tel"
        />
        <Field
          Icon={Phone}
          label="Customer care"
          value={record.customerCarePhone}
          kind="tel"
        />
        <Field
          Icon={LifeBuoy}
          label="Support website"
          value={record.supportUrl}
          kind="url"
        />
        <Field
          Icon={FileText}
          label="Warranty portal"
          value={record.warrantyUrl}
          kind="url"
        />
        <Field Icon={Mail} label="Email" value={record.email} kind="mail" />
      </div>
      {record.notes && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {record.notes}
        </p>
      )}
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
        {site && (
          <button
            onClick={() => window.open(site, "_blank", "noopener,noreferrer")}
            className={secondaryClass}
          >
            <ExternalLink size={15} /> Visit Official Website
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
}

function ItHubCard({ whatsapp, phone }: ItHubCardProps) {
  return (
    <aside className="rounded-2xl border border-primary/20 bg-gradient-to-br from-[#ecf1ff] to-white p-7">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">
        IT HUB Support
      </p>
      <h2 className="mt-1 text-2xl font-extrabold text-[#0c2f8a]">
        We're here to help
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Repairs, service requests and IT HUB on-site warranty — handled directly
        by our team.
      </p>
      <div className="mt-6 grid gap-3">
        {phone && (
          <a href={`tel:${phone}`} className={buttonClass}>
            <Phone size={15} /> Call IT HUB
          </a>
        )}
        {whatsapp && (
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
          <Wrench size={15} /> Book a service request
        </ActionLink>
        <ActionLink secondary to="/support?view=onsite">
          <MapPin size={15} /> On-site warranty PIN check
        </ActionLink>
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
    <section className="rounded-2xl border border-border bg-white p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardList size={18} className="text-primary" /> Your purchase
        </h2>
        {cancelled && <Badge tone="red">Order cancelled</Badge>}
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <Info label="Product" value={name} />
        <Info label="Brand" value={brand || "—"} />
        <Info label="Category" value={categoryName || "—"} />
        <Info label="Purchase date" value={fmt(date)} />
        <Info label="Order number" value={orderId} />
      </dl>
      <div className="mt-6 rounded-xl bg-muted p-5">
        {months ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <span>
              Warranty period: <strong>{warranty}</strong>
            </span>
            <span>
              Estimated warranty until: <strong>{fmt(until)}</strong>
            </span>
            <Badge tone={active ? "green" : "gray"}>
              {active ? "Likely active" : "Likely expired"}
            </Badge>
          </div>
        ) : null}
        <p
          className={
            months
              ? "mt-3 text-xs text-muted-foreground"
              : "text-sm text-muted-foreground"
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
  value: string
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
    { Icon: Hash, text: "Note the product serial number" },
    { Icon: ClipboardList, text: "Describe the issue clearly" },
    { Icon: Headphones, text: "Contact IT HUB for help" },
  ]
  return (
    <section className="rounded-2xl border border-border bg-white p-7">
      <h2 className="text-lg font-bold">Can't resolve your issue?</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ Icon, text }) => (
          <li
            key={text}
            className="flex items-center gap-3 rounded-xl bg-muted p-4 text-sm"
          >
            <CheckCircle2 size={16} className="text-primary" />
            <Icon size={16} className="text-muted-foreground" /> {text}
          </li>
        ))}
      </ul>
      <button onClick={onContact} className={`${buttonClass} mt-5`}>
        Contact IT HUB
      </button>
    </section>
  )
}
