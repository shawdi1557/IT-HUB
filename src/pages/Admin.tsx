import { useEffect, useMemo, useState, type ReactNode } from "react"

import { Link, useNavigate, useParams, useSearchParams } from "react-router"

import {
  LayoutDashboard,
  ArrowUpRight,
  ArrowRight,
  Search,
  Plus,
  Pencil,
  Trash2,
  Menu,
  X,
  Download,
  Package,
  ShoppingBag,
  Wrench,
  Users,
  AlertTriangle,
  Truck,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  Settings,
  Cpu,
  CheckCircle2,
  ChevronDown,
  Tag,
  BarChart3,
  Star,
  Globe,
  Boxes,
  Upload,
  FileSpreadsheet,
  MapPin,
  XCircle,
  LogOut,
  Award,
} from "lucide-react"

import type { User } from "@supabase/supabase-js"

import {
  checkAdminSession,
  subscribeToAuthChanges,
  signOutUser,
  type CustomerProfile,
  type AdminAccessState,
} from "../lib/auth"

import { AdminLogin, AdminAccessDenied, AdminAuthLoading } from "./AdminLogin"

import WhatsAppIcon from "../components/WhatsAppIcon"

import * as XLSX from "xlsx"

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"

import { useStore } from "../app/store"

import {
  adminGroups,
  slug,
  money,
  images,
  orderStatuses,
  serviceStatuses,
  type Product,
  type Order,
  type ServiceRequest,
  type ComponentOption,
  type Offer,
  type ItHubLocation,
  type PcEnquiry,
  type BrandSupport,
  type SupportCategory,
  type ServiceCentre,
  offerTypes,
  offerStatus,
  offerHeadline,
  formatDate,
  checkWarranty,
  productConditions,
} from "../data/catalog"

import {
  chartData,
  resourceDefinitions,
  importColumns,
  importTemplateRows,
  validateImportRows,
  type AdminRecord,
  type ImportRow,
} from "../data/admin"

import {
  checkStoreSettingsCompleteness,
  validateIndianPincode,
  validateHttpsUrl,
} from "../lib/support"

import { adminUpdateServiceRequest } from "../lib/services"

import { compatibility } from "./Builder"

import VisitorAnalytics, { PrivacyPanel } from "./AdminAnalytics"

import CouponsAdmin from "./AdminCoupons"

import SellRequestsAdmin from "./AdminSellRequests"

import AdminCertificates from "./AdminCertificates"

import DatabaseConnectionPanel from "../components/DatabaseConnectionPanel"

import AdminImageDiscovery from "./AdminImageDiscovery"

import { track } from "../lib/analytics"

import type { BuildTemplate, BuildPurpose } from "../data/buildTemplates"

import {
  ActionLink,
  Badge,
  Button,
  Empty,
  Field,
  Logo,
  Modal,
  PageHeading,
  fieldClass,
} from "../components/ui"

type Row = Record<string, unknown> & { id: string }

type Column = {
  key: string

  label: string

  render?: (row: Row) => ReactNode
}

function DataTable({
  rows,

  columns,

  onView,

  actions,
}: {
  rows: Row[]

  columns: Column[]

  onView?: (row: Row) => void

  actions?: (row: Row) => ReactNode
}) {
  const [query, setQuery] = useState("")

  const [page, setPage] = useState(0)

  const [sort, setSort] = useState("")

  const [descending, setDescending] = useState(false)

  useEffect(() => setPage(0), [query, rows.length])

  const filtered = rows

    .filter((row) =>
      Object.values(row)

        .filter((value) => typeof value !== "object")

        .join(" ")

        .toLowerCase()

        .includes(query.toLowerCase()),
    )

    .sort((first, second) =>
      sort
        ? (typeof first[sort] === "number"
            ? Number(first[sort]) - Number(second[sort])
            : String(first[sort] || "").localeCompare(
                String(second[sort] || ""),
              )) * (descending ? -1 : 1)
        : 0,
    )

  const pageCount = Math.max(1, Math.ceil(filtered.length / 7))

  const safePage = Math.min(page, pageCount - 1)

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-border p-4">
        <div className="relative w-full max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-3 text-muted-foreground"
          />
          <input
            aria-label="Search table"
            placeholder="Search records…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${fieldClass} py-2.5 pl-9`}
          />
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {filtered.length} records
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-xs">
          <thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-4">
                  <button
                    className="flex items-center gap-2"
                    onClick={() => {
                      setSort(column.key)

                      setDescending(sort === column.key ? !descending : false)
                    }}
                  >
                    {column.label}
                    {sort === column.key && (descending ? "↓" : "↑")}
                  </button>
                </th>
              ))}
              {(actions || onView) && <th className="px-5 py-4">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(safePage * 7, safePage * 7 + 7).map((row) => (
              <tr
                key={row.id}
                className="border-t border-border hover:bg-muted/50"
              >
                {columns.map((column, index) => (
                  <td key={column.key} className="max-w-64 truncate px-5 py-4">
                    {index === 0 && onView ? (
                      <button
                        onClick={() => onView(row)}
                        className="font-semibold text-primary hover:underline"
                      >
                        {column.render
                          ? column.render(row)
                          : String(row[column.key] ?? "—")}
                      </button>
                    ) : column.render ? (
                      column.render(row)
                    ) : (
                      String(row[column.key] ?? "—")
                    )}
                  </td>
                ))}
                {(actions || onView) && (
                  <td className="px-5 py-4">
                    {actions ? (
                      actions(row)
                    ) : (
                      <button
                        onClick={() => onView?.(row)}
                        className="rounded p-2 text-primary hover:bg-secondary"
                        aria-label={`View ${row.id}`}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="py-14 text-center">
            <Package size={28} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-semibold">
              {query ? "No matching records" : "No records yet"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {query
                ? "Try another search term."
                : "Create activity in the storefront or add a demo record."}
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[10px] text-muted-foreground">
        <span>
          Page {safePage + 1} of {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            disabled={!safePage}
            aria-label="Previous page"
            onClick={() => setPage(safePage - 1)}
            className="rounded border border-border p-1.5 disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            disabled={safePage >= pageCount - 1}
            aria-label="Next page"
            onClick={() => setPage(safePage + 1)}
            className="rounded border border-border p-1.5 disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

const statusBadge = (status: string) => (
  <Badge
    tone={
      /complete|delivered|active|stock/i.test(status) &&
      !/low|out|inactive/i.test(status)
        ? "green"
        : /pending|low|awaiting/i.test(status)
          ? "amber"
          : "blue"
    }
  >
    {status}
  </Badge>
)

function Chart({
  type = "revenue",

  title,
}: {
  type?: "revenue" | "orders" | "services"

  title: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-white p-6">
      <div className="mb-7 flex justify-between gap-3">
        <h3 className="text-sm font-bold">{title}</h3>
        <Badge tone="gray">ILLUSTRATIVE DATA</Badge>
      </div>
      <div className="h-56 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          {type === "revenue" ? (
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
            >
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1557d6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#1557d6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#edf0f4" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <Tooltip
                formatter={(value) => [`₹${value}k (demo)`, "Revenue"]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#1557d6"
                strokeWidth={2.5}
                fill="url(#revenueFill)"
              />
            </AreaChart>
          ) : (
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#edf0f4" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <Tooltip />
              <Bar
                dataKey={type}
                fill={type === "orders" ? "#1557d6" : "#7aa5eb"}
                radius={[3, 3, 0, 0]}
                barSize={25}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const navIcons: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,

  products: Package,

  inventory: Boxes,

  orders: ShoppingBag,

  offers: Tag,

  customers: Users,

  reviews: Star,

  certificates: Award,

  services: Wrench,

  "pc-builder": Cpu,

  analytics: BarChart3,

  settings: Settings,

  "website-content": Globe,
}

export default function Admin() {
  const [authStatus, setAuthStatus] = useState<AdminAccessState>("loading")

  const [adminUser, setAdminUser] = useState<User | null>(null)

  const [adminProfile, setAdminProfile] = useState<CustomerProfile | null>(null)

  useEffect(() => {
    let mounted = true

    // Initial session verification

    checkAdminSession().then((res) => {
      if (!mounted) return

      setAuthStatus(res.state)

      setAdminUser(res.user)

      setAdminProfile(res.profile)
    })

    // Listen for auth state transitions (sign in, sign out, token refresh)

    const unsubscribe = subscribeToAuthChanges((user) => {
      if (!user) {
        if (mounted) {
          setAuthStatus("unauthenticated")

          setAdminUser(null)

          setAdminProfile(null)
        }
      } else {
        checkAdminSession().then((res) => {
          if (!mounted) return

          setAuthStatus(res.state)

          setAdminUser(res.user)

          setAdminProfile(res.profile)
        })
      }
    })

    return () => {
      mounted = false

      unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    await signOutUser()

    setAuthStatus("unauthenticated")

    setAdminUser(null)

    setAdminProfile(null)
  }

  const { section = "dashboard" } = useParams()

  const store = useStore()

  const [params] = useSearchParams()

  const navigate = useNavigate()

  const view =
    params.get("view") ||
    adminGroups.find((group) => group.section === section)?.items?.[0]?.view ||
    ""

  const [menu, setMenu] = useState(false)

  const [openGroups, setOpenGroups] = useState<string[]>([])

  const [product, setProduct] = useState<Product | null>(null)

  const [productOpen, setProductOpen] = useState(false)

  const [offer, setOffer] = useState<Offer | null>(null)

  const [offerOpen, setOfferOpen] = useState(false)

  const [orderId, setOrderId] = useState("")

  const [requestId, setRequestId] = useState("")

  const [customerEmail, setCustomerEmail] = useState("")

  const [stockId, setStockId] = useState("")

  const [stockAmount, setStockAmount] = useState(1)

  const [categoryOpen, setCategoryOpen] = useState(false)

  const [category, setCategory] = useState("")

  const [componentOpen, setComponentOpen] = useState(false)

  const [componentType, setComponentType] = useState("CPU")

  const [component, setComponent] = useState<ComponentOption>({
    id: "",

    name: "",

    price: 0,
  })

  const [remove, setRemove] = useState<{
    type: string

    id: string

    name: string
  } | null>(null)

  const [sample, setSample] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem("ithub-admin-login")) return

    sessionStorage.setItem("ithub-admin-login", "1")

    track("Admin Login")
  }, [])

  const [error, setError] = useState("")

  useEffect(() => {
    setMenu(false)

    setError("")

    if (section === "products" && view === "add") {
      setProduct(null)

      setProductOpen(true)
    }

    if (section === "offers" && view === "create") {
      setOffer(null)

      setOfferOpen(true)
    }
  }, [section, view])

  const selectedOrder = store.orders.find((item) => item.id === orderId)

  const selectedRequest = store.requests.find((item) => item.id === requestId)

  const customers = useMemo(() => {
    const entries = new Map<string, {
      id: string

      name: string

      email: string

      orders: number

      services: number

      total: number

      status: string
    }>()

    for (const order of store.orders) {
      const row = entries.get(order.email) || {
        id: order.email,

        name: order.name,

        email: order.email,

        orders: 0,

        services: 0,

        total: 0,

        status: "Active",
      }

      row.orders++

      row.total += order.total

      entries.set(order.email, row)
    }

    for (const request of store.requests) {
      const row = entries.get(request.email) || {
        id: request.email,

        name: request.name,

        email: request.email,

        orders: 0,

        services: 0,

        total: 0,

        status: "Active",
      }

      row.services++

      entries.set(request.email, row)
    }

    return [...entries.values()]
  }, [store.orders, store.requests])

  const orderRows = store.orders.map((item) => ({
    ...item,

    amount: item.total,

    statusLabel: item.status < 0 ? "Cancelled" : orderStatuses[item.status],

    dateLabel: new Date(item.date).toLocaleDateString(),
  }))

  const serviceRows = store.requests.map((item) => ({
    ...item,

    amount: item.quote,

    statusLabel: serviceStatuses[item.status],
  }))

  const serviceFilters: Record<string, (item: {
    device: string

    method: string
  }) => boolean> = {
    requests: () => true,

    laptop: (item) => /laptop|notebook|macbook/i.test(item.device),

    mobile: (item) => /mobile|phone|tablet/i.test(item.device),

    pc: (item) => /\bpc\b|desktop|computer|cpu/i.test(item.device),

    printer: (item) => /printer/i.test(item.device),

    onsite: (item) => /on-?site/i.test(item.method),
  }

  const lowStock = store.products.filter(
    (item) => item.stock > 0 && item.stock <= (item.lowStockThreshold ?? 3),
  )

  const outOfStock = store.products.filter((item) => item.stock <= 0)

  const columnsOrders: Column[] = [
    { key: "id", label: "Order ID" },

    { key: "name", label: "Customer" },

    {
      key: "amount",

      label: "Amount",

      render: (row) => money(Number(row.amount)),
    },

    {
      key: "statusLabel",

      label: "Status",

      render: (row) => statusBadge(String(row.statusLabel)),
    },

    { key: "dateLabel", label: "Date" },
  ]

  const columnsServices: Column[] = [
    { key: "id", label: "Request ID" },

    { key: "name", label: "Customer" },

    { key: "model", label: "Device" },

    { key: "problem", label: "Issue" },

    { key: "technician", label: "Technician" },

    {
      key: "statusLabel",

      label: "Status",

      render: (row) => statusBadge(String(row.statusLabel)),
    },

    {
      key: "amount",

      label: "Quote",

      render: (row) => money(Number(row.amount)),
    },
  ]

  const currentGroup = adminGroups.find((group) => group.section === section)

  const currentItem = currentGroup?.items?.find((item) => item.view === view)

  const heading =
    section === "dashboard"
      ? "Your hub, at a glance."
      : currentItem
        ? currentItem.label
        : currentGroup?.name || "Not found"

  const orderBuckets: Record<string, (status: number) => boolean> = {
    all: () => true,

    pending: (status) => status >= 0 && status <= 1,

    processing: (status) => status >= 2 && status <= 3,

    shipped: (status) => status >= 4 && status <= 5,

    delivered: (status) => status === 6,

    cancelled: (status) => status < 0,
  }

  const inventoryProducts =
    view === "low" ? lowStock : view === "out" ? outOfStock : store.products

  const deleteItem = () => {
    if (!remove) return

    if (remove.type === "product")
      store.set((previous) => ({
        products: previous.products.filter((item) => item.id !== remove.id),

        wishlist: previous.wishlist.filter((id) => id !== remove.id),

        cart: previous.cart.filter((item) => item.productId !== remove.id),
      }))

    if (remove.type === "offer")
      store.set({
        offers: store.offers.filter((item) => item.id !== remove.id),
      })

    if (remove.type === "category")
      store.set({
        catalogCategories: store.catalogCategories.filter(
          (item) => item !== remove.id,
        ),
      })

    if (remove.type === "brand")
      store.set({ brands: store.brands.filter((item) => item !== remove.id) })

    if (remove.type === "location")
      store.set({
        locations: store.locations.filter((item) => item.id !== remove.id),
      })

    if (remove.type === "technician")
      store.set((previous) => ({
        technicians: previous.technicians.filter((item) => item !== remove.id),

        requests: previous.requests.map((item) =>
          item.technician === remove.id
            ? { ...item, technician: "Unassigned" }
            : item,
        ),
      }))

    if (remove.type === "component")
      store.set({
        componentCatalog: {
          ...store.componentCatalog,

          [componentType]: store.componentCatalog[componentType].filter(
            (item) => item.id !== remove.id,
          ),
        },
      })

    if (remove.type === "build")
      store.set({
        builds: store.builds.filter((item) => item.id !== remove.id),
      })

    store.log(`${remove.type} removed: ${remove.name}`)

    store.notify("Record removed")

    setRemove(null)
  }

  const loadSample = () => {
    const id = `ITH-DEMO-${crypto.randomUUID().slice(0, 5).toUpperCase()}`

    const gpu = store.products[0]

    if (!gpu) {
      store.notify("Add a product first to load a sample order")

      setSample(false)

      return
    }

    const demoOrder: Order = {
      id,

      name: "Example customer",

      email: "customer@example.com",

      address: "Example address · Kothamangalam, Kerala (demo)",

      items: [
        {
          id: gpu.id,

          productId: gpu.id,

          name: gpu.name,

          price: gpu.price,

          image: gpu.image,

          quantity: 1,
        },
      ],

      total: gpu.price,

      status: 3,

      date: new Date().toISOString(),

      payment: "UPI (demo)",

      delivery: "Kerala delivery",
    }

    const demoRequest: ServiceRequest = {
      id: `SRV-DEMO-${crypto.randomUUID().slice(0, 5).toUpperCase()}`,

      name: "Example customer",

      email: "customer@example.com",

      device: "Laptop",

      model: "Dell Inspiron 15 (demo)",

      problem: "Screen issue",

      method: "Courier pickup",

      address: "Example address · Kothamangalam, Kerala (demo)",

      date: new Date().toISOString().slice(0, 10),

      time: "10:00 – 12:00 (demo)",

      status: 4,

      quote: 9500,

      quoteState: "pending",

      technician: "Demo technician A",

      notes: "Sample request for the prototype walkthrough",
    }

    store.set((previous) => ({
      orders: [demoOrder, ...previous.orders],

      requests: [demoRequest, ...previous.requests],

      notifications: [
        "Sample order and service request loaded",

        ...previous.notifications,
      ],
    }))

    store.log("Sample activity loaded by administrator")

    setSample(false)

    store.notify("Sample activity loaded. Explore it in the customer account.")
  }

  const exportRows = () => {
    const rows =
      section === "services"
        ? serviceRows
        : section === "products" || section === "inventory"
          ? store.products
          : orderRows

    const keys = rows.length
      ? Object.keys(rows[0]).filter(
          (key) =>
            typeof (rows[0] as Record<string, unknown>)[key] !== "object",
        )
      : []

    const csv = [
      keys.join(","),

      ...rows.map((row) =>
        keys

          .map(
            (key) =>
              `"${String((row as unknown as Record<string, unknown>)[key] ?? "").replace(/"/g, '""')}"`,
          )

          .join(","),
      ),
    ].join("\n")

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))

    const anchor = document.createElement("a")

    anchor.href = url

    anchor.download = `ithub-${section}.csv`

    anchor.click()

    URL.revokeObjectURL(url)

    store.notify("Report exported")
  }

  // Route Security Guard: Enforce authentication and administrator authorization

  if (authStatus === "loading") {
    return <AdminAuthLoading />
  }

  if (authStatus === "unauthenticated") {
    return (
      <AdminLogin
        onLoginSuccess={(user, profile) => {
          setAdminUser(user)

          setAdminProfile(profile)

          setAuthStatus("authorized")
        }}
      />
    )
  }

  if (authStatus === "denied") {
    return (
      <AdminAccessDenied
        customerEmail={
          adminUser?.email || adminProfile?.email || "Customer Account"
        }
        onSignOut={() => {
          setAuthStatus("unauthenticated")

          setAdminUser(null)

          setAdminProfile(null)
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-muted">
      <aside
        className={`${
          menu ? "block" : "hidden"
        } fixed inset-y-0 left-0 z-50 w-60 overflow-y-auto border-r border-border bg-white lg:block`}
      >
        <div className="flex h-28 items-center justify-between border-b border-border px-6">
          <Link to="/admin">
            <Logo />
          </Link>
          <Badge>ADMIN</Badge>
          <button
            className="lg:hidden"
            onClick={() => setMenu(false)}
            aria-label="Close admin menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-4 py-5">
          {adminGroups.map((group) => {
            const isCurrent = group.section === section

            const Icon = navIcons[group.section] || LayoutDashboard

            const expanded = isCurrent || openGroups.includes(group.section)

            return (
              <div key={group.section} className="mb-1">
                {group.items ? (
                  <button
                    onClick={() =>
                      setOpenGroups((list) =>
                        list.includes(group.section)
                          ? list.filter((item) => item !== group.section)
                          : [...list, group.section],
                      )
                    }
                    aria-expanded={expanded}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-xs font-semibold ${
                      isCurrent
                        ? "text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1 text-left">{group.name}</span>
                    {group.section === "inventory" && lowStock.length > 0 && (
                      <span className="rounded bg-amber-50 px-1.5 text-[9px] text-amber-700">
                        {lowStock.length}
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      className={`transition ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : (
                  <Link
                    to={
                      group.section === "dashboard"
                        ? "/admin"
                        : `/admin/${group.section}`
                    }
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-semibold ${
                      isCurrent
                        ? "bg-secondary text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon size={16} />
                    {group.name}
                  </Link>
                )}
                {group.items && expanded && (
                  <div className="mb-2 ml-5 border-l border-border pl-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.view}
                        to={`/admin/${group.section}?view=${item.view}`}
                        className={`block rounded-md px-3 py-2 text-xs ${
                          isCurrent && view === item.view
                            ? "bg-secondary font-semibold text-primary"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div className="mt-7 border-t border-border pt-4">
            <div className="mb-3 px-3">
              <div className="truncate text-xs font-semibold text-foreground">
                {adminUser?.email || "Administrator"}
              </div>
              <div className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Role: {adminProfile?.role || "admin"}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            >
              <LogOut size={14} />
              Sign Out
            </button>
            <Link
              to="/"
              className="mt-2 flex items-center gap-2 px-3 py-1.5 text-xs text-primary"
            >
              Back to storefront <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          aria-label="Close menu overlay"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-border bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenu(true)}
              aria-label="Open admin menu"
              className="lg:hidden"
            >
              <Menu size={20} />
            </button>
            <span className="text-xs text-muted-foreground">
              Workspace <span className="mx-2 text-border">/</span>{" "}
              <strong className="text-foreground">{heading}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden items-center gap-1.5 text-xs text-primary sm:flex"
            >
              View store <ArrowUpRight size={13} />
            </Link>
            <div className="hidden h-4 w-px bg-border sm:block" />
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground md:inline">
                {adminUser?.email || "Administrator"}
              </span>
              <button
                onClick={handleSignOut}
                title="Sign out of admin"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted hover:text-red-600"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] p-5 md:p-8">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-100 bg-secondary/50 px-4 py-3 text-[10px] text-primary">
            <span>
              Admin prototype · data is stored locally in this browser · data
              model is Supabase-ready (admin and customer roles only)
            </span>
            <button
              className="font-bold underline underline-offset-2"
              onClick={() => setSample(true)}
            >
              Load sample activity
            </button>
          </div>
          <PageHeading
            eyebrow="IT HUB / ADMIN WORKSPACE"
            title={heading}
            description={
              section === "dashboard"
                ? "The latest from your store, service desk and inventory."
                : currentGroup && currentItem
                  ? `${currentGroup.name} · changes are saved locally and reflected across the storefront.`
                  : "Changes are saved locally and reflected across the storefront."
            }
          >
            {["products", "inventory", "orders", "services"].includes(
              section,
            ) &&
              !(section === "products" && view !== "all") && (
                <Button variant="secondary" onClick={exportRows}>
                  <Download size={14} />
                  Export CSV
                </Button>
              )}
            {section === "products" && (view === "all" || view === "add") && (
              <Button
                onClick={() => {
                  setProduct(null)

                  setProductOpen(true)
                }}
              >
                <Plus size={15} />
                Add product
              </Button>
            )}
            {section === "offers" && (
              <Button
                onClick={() => {
                  setOffer(null)

                  setOfferOpen(true)
                }}
              >
                <Plus size={15} />
                Create offer
              </Button>
            )}
            {section === "products" && view === "categories" && (
              <Button
                onClick={() => {
                  setCategory("")

                  setCategoryOpen(true)
                }}
              >
                <Plus size={15} />
                Add category
              </Button>
            )}
            {section === "pc-builder" && view === "estimates" && (
              <Button
                onClick={() => {
                  setComponent({ id: "", name: "", price: 0 })

                  setComponentType("CPU")

                  setComponentOpen(true)
                }}
              >
                <Plus size={15} />
                Add component
              </Button>
            )}
          </PageHeading>
          {section === "website-content" && <ShowcaseManager />}
          {section === "dashboard" && (
            <>
              <div className="mb-7 grid grid-cols-2 gap-4 xl:grid-cols-4">
                {[
                  {
                    label: "Today’s sales",

                    value: money(
                      store.orders

                        .filter(
                          (item) =>
                            item.date.slice(0, 10) ===
                            new Date().toISOString().slice(0, 10),
                        )

                        .reduce((sum, item) => sum + item.total, 0),
                    ),

                    Icon: IndianRupee,

                    to: "orders",
                  },

                  {
                    label: "Monthly revenue",

                    value: money(
                      store.orders

                        .filter(
                          (item) =>
                            item.date.slice(0, 7) ===
                            new Date().toISOString().slice(0, 7),
                        )

                        .reduce((sum, item) => sum + item.total, 0),
                    ),

                    Icon: IndianRupee,

                    to: "analytics",
                  },

                  {
                    label: "Orders",

                    value: store.orders.length,

                    Icon: ShoppingBag,

                    to: "orders",
                  },

                  {
                    label: "Pending services",

                    value: store.requests.filter((item) => item.status < 9)
                      .length,

                    Icon: Wrench,

                    to: "services",
                  },

                  {
                    label: "Active shipments",

                    value: store.orders.filter(
                      (item) => item.status >= 4 && item.status < 6,
                    ).length,

                    Icon: Truck,

                    to: "orders?view=shipped",
                  },

                  {
                    label: "Low stock",

                    value: lowStock.length,

                    Icon: AlertTriangle,

                    to: "inventory?view=low",
                  },

                  {
                    label: "Customers",

                    value: customers.length,

                    Icon: Users,

                    to: "customers",
                  },

                  {
                    label: "Catalog products",

                    value: store.products.length,

                    Icon: Package,

                    to: "products",
                  },
                ].map(({ label, value, Icon, to }) => (
                  <Link
                    key={label}
                    to={`/admin/${to}`}
                    className="rounded-lg border border-border bg-white p-5 transition hover:border-primary/40"
                  >
                    <div className="mb-5 flex justify-between">
                      <span className="text-xs text-muted-foreground">
                        {label}
                      </span>
                      <Icon size={16} className="text-primary" />
                    </div>
                    <strong className="font-display text-2xl font-bold">
                      {value}
                    </strong>
                    <p className="mt-2 text-[9px] text-muted-foreground">
                      Current prototype activity
                    </p>
                  </Link>
                ))}
              </div>
              <div className="mb-8 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
                <Chart title="Revenue overview" />
                <Chart title="Orders over time" type="orders" />
              </div>
              <div className="mb-8">
                <div className="mb-4 flex justify-between">
                  <h2 className="text-lg font-bold">Recent orders</h2>
                  <Link className="text-xs text-primary" to="/admin/orders">
                    View all →
                  </Link>
                </div>
                <DataTable
                  rows={orderRows}
                  columns={columnsOrders}
                  onView={(row) => setOrderId(row.id)}
                />
              </div>
              <div className="mb-8">
                <div className="mb-4 flex justify-between">
                  <h2 className="text-lg font-bold">Service desk</h2>
                  <Link className="text-xs text-primary" to="/admin/services">
                    View all →
                  </Link>
                </div>
                <DataTable
                  rows={serviceRows}
                  columns={columnsServices}
                  onView={(row) => setRequestId(row.id)}
                />
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-white p-6">
                  <h2 className="mb-5 text-lg font-bold">Inventory alerts</h2>
                  {lowStock.map((item) => (
                    <div
                      key={item.id}
                      className="mb-3 flex justify-between gap-3 rounded-md bg-amber-50 p-4 text-xs"
                    >
                      <span>{item.name}</span>
                      <Badge tone="amber">{item.stock} left</Badge>
                    </div>
                  ))}
                  {!lowStock.length && (
                    <p className="text-xs text-muted-foreground">
                      All products are above reorder level.
                    </p>
                  )}
                  <Link
                    to="/admin/inventory?view=adjust"
                    className="mt-3 inline-block text-xs text-primary"
                  >
                    Manage stock →
                  </Link>
                </div>
                <div className="rounded-lg border border-border bg-white p-6">
                  <h2 className="mb-5 text-lg font-bold">Pending actions</h2>
                  {[
                    {
                      title: `${store.requests.filter((item) => item.status === 4 && item.quoteState === "pending").length} quotations awaiting approval`,

                      to: "services",
                    },

                    {
                      title: `${store.orders.filter((item) => item.status >= 0 && item.status < 4).length} orders to prepare`,

                      to: "orders?view=pending",
                    },

                    {
                      title: `${store.pcEnquiries.filter((item) => item.status === "New").length} new PC build requests`,

                      to: "pc-builder?view=requests",
                    },

                    {
                      title: "Supabase database connection health & latency",

                      to: "settings?view=database",
                    },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={`/admin/${item.to}`}
                      className="mb-3 flex items-center justify-between rounded-md bg-muted p-4 text-xs"
                    >
                      {item.title}
                      <ArrowRight size={13} />
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
          {section === "products" && (view === "all" || view === "add") && (
            <DataTable
              rows={store.products.map((item) => ({
                ...item,

                sku: item.sku || `ITH-${item.id.toUpperCase()}`,

                status: item.status || (item.stock ? "Active" : "Out of stock"),
              }))}
              columns={[
                { key: "name", label: "Product" },

                { key: "sku", label: "SKU" },

                { key: "category", label: "Category" },

                { key: "brand", label: "Brand" },

                {
                  key: "price",

                  label: "Price",

                  render: (row) => money(Number(row.price)),
                },

                { key: "stock", label: "Stock" },

                {
                  key: "status",

                  label: "Status",

                  render: (row) => statusBadge(String(row.status)),
                },
              ]}
              onView={(row) => {
                setProduct(
                  store.products.find((item) => item.id === row.id) || null,
                )

                setProductOpen(true)
              }}
              actions={(row) => (
                <div className="flex gap-2">
                  <button
                    aria-label="Edit product"
                    className="p-1.5 text-primary"
                    onClick={() => {
                      setProduct(
                        store.products.find((item) => item.id === row.id) ||
                          null,
                      )

                      setProductOpen(true)
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Delete product"
                    className="p-1.5 text-red-600"
                    onClick={() =>
                      setRemove({
                        type: "product",

                        id: row.id,

                        name: String(row.name),
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            />
          )}
          {section === "inventory" && (
            <DataTable
              key={view}
              rows={inventoryProducts.map((item) => {
                const reserved = store.orders

                  .filter((order) => order.status < 4)

                  .reduce(
                    (sum, order) =>
                      sum +
                      order.items

                        .filter((row) => row.productId === item.id)

                        .reduce((count, row) => count + row.quantity, 0),

                    0,
                  )

                return {
                  ...item,

                  sku: item.sku || `ITH-${item.id.toUpperCase()}`,

                  current: item.stock + reserved,

                  reserved,

                  available: item.stock,

                  reorder: item.lowStockThreshold ?? 3,

                  status:
                    item.stock === 0
                      ? "Out of stock"
                      : item.stock <= (item.lowStockThreshold ?? 3)
                        ? "Low stock"
                        : "In stock",
                }
              })}
              columns={[
                { key: "name", label: "Product" },

                { key: "sku", label: "SKU" },

                { key: "current", label: "Current stock" },

                { key: "reserved", label: "Reserved" },

                { key: "available", label: "Available" },

                { key: "reorder", label: "Reorder level" },

                {
                  key: "status",

                  label: "Status",

                  render: (row) => statusBadge(String(row.status)),
                },
              ]}
              actions={(row) =>
                view !== "adjust" && view !== "low" && view !== "out" ? null : (
                  <button
                    onClick={() => {
                      setStockId(row.id)

                      setStockAmount(1)
                    }}
                    className="flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <Plus size={13} />
                    Adjust stock
                  </button>
                )
              }
            />
          )}
          {section === "orders" && (
            <DataTable
              key={view}
              rows={orderRows.filter((item) =>
                (orderBuckets[view] || orderBuckets.all)(item.status),
              )}
              columns={columnsOrders}
              onView={(row) => setOrderId(row.id)}
            />
          )}
          {section === "services" && serviceFilters[view] && (
            <DataTable
              rows={serviceRows.filter(serviceFilters[view])}
              columns={columnsServices}
              onView={(row) => setRequestId(row.id)}
            />
          )}
          {section === "customers" && (
            <DataTable
              rows={customers}
              columns={[
                { key: "name", label: "Customer" },

                { key: "email", label: "Email" },

                { key: "orders", label: "Orders" },

                { key: "services", label: "Services" },

                {
                  key: "total",

                  label: "Lifetime value (demo)",

                  render: (row) => money(Number(row.total)),
                },

                {
                  key: "status",

                  label: "Status",

                  render: (row) => statusBadge(String(row.status)),
                },
              ]}
              onView={(row) => setCustomerEmail(String(row.email))}
            />
          )}
          {section === "offers" && (
            <DataTable
              key={view}
              rows={store.offers

                .map((item) => ({
                  ...item,

                  status: offerStatus(item),

                  headline: offerHeadline(item),

                  targets: [
                    item.products.length
                      ? `${item.products.length} product(s)`
                      : "",

                    item.categories.join(", "),

                    item.brands.join(", "),
                  ]

                    .filter(Boolean)

                    .join(" · "),

                  window: `${formatDate(item.startsAt)} – ${formatDate(item.endsAt)}`,
                }))

                .filter((item) =>
                  view === "scheduled"
                    ? item.status === "Scheduled"
                    : view === "expired"
                      ? item.status === "Expired"
                      : view === "active"
                        ? item.status === "Active" || item.status === "Inactive"
                        : true,
                )}
              columns={[
                { key: "name", label: "Offer" },

                { key: "type", label: "Type" },

                { key: "headline", label: "Headline" },

                { key: "targets", label: "Applies to" },

                { key: "window", label: "Validity" },

                {
                  key: "status",

                  label: "Status",

                  render: (row) => (
                    <Badge
                      tone={
                        row.status === "Active"
                          ? "green"
                          : row.status === "Scheduled"
                            ? "blue"
                            : row.status === "Expired"
                              ? "gray"
                              : "amber"
                      }
                    >
                      {String(row.status)}
                    </Badge>
                  ),
                },
              ]}
              onView={(row) => {
                setOffer(
                  store.offers.find((item) => item.id === row.id) || null,
                )

                setOfferOpen(true)
              }}
              actions={(row) => (
                <div className="flex gap-3">
                  <button
                    className="text-primary"
                    onClick={() => {
                      setOffer(
                        store.offers.find((item) => item.id === row.id) || null,
                      )

                      setOfferOpen(true)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-primary"
                    onClick={() => {
                      store.set({
                        offers: store.offers.map((item) =>
                          item.id === row.id
                            ? { ...item, active: !item.active }
                            : item,
                        ),
                      })

                      store.log(`Offer toggled: ${row.name}`)

                      store.notify("Offer updated")
                    }}
                  >
                    {row.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    className="text-red-600"
                    onClick={() =>
                      setRemove({
                        type: "offer",

                        id: row.id,

                        name: String(row.name),
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              )}
            />
          )}
          {section === "products" && view === "categories" && (
            <DataTable
              rows={store.catalogCategories.map((name) => ({
                id: name,

                name,

                count: store.products.filter((item) => item.category === name)
                  .length,

                status: "Active",
              }))}
              columns={[
                { key: "name", label: "Category" },

                { key: "count", label: "Products" },

                {
                  key: "status",

                  label: "Status",

                  render: (row) => statusBadge(String(row.status)),
                },
              ]}
              actions={(row) => (
                <div className="flex gap-3">
                  <Link
                    to={`/products?category=${encodeURIComponent(row.id)}`}
                    className="text-primary"
                  >
                    View store
                  </Link>
                  <button
                    disabled={Number(row.count) > 0}
                    className="text-red-600 disabled:opacity-30"
                    title={
                      Number(row.count) > 0
                        ? "Move products out of this category before deleting"
                        : "Delete category"
                    }
                    onClick={() =>
                      setRemove({
                        type: "category",

                        id: row.id,

                        name: String(row.name),
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              )}
            />
          )}
          {section === "pc-builder" && view === "estimates" && (
            <>
              <p className="mb-5 max-w-2xl text-xs leading-6 text-muted-foreground">
                Component prices below drive the estimated build price customers
                see in the PC Builder. Final quotes are shared on WhatsApp.
              </p>
              <DataTable
                rows={Object.entries(store.componentCatalog).flatMap(
                  ([type, items]) =>
                    items.map((item) => ({
                      ...item,

                      id: `${type}::${item.id}`,

                      componentId: item.id,

                      type,

                      socket: item.socket || "—",

                      ram: item.ram || "—",
                    })),
                )}
                columns={[
                  { key: "name", label: "Component" },

                  { key: "type", label: "Type" },

                  {
                    key: "price",

                    label: "Price",

                    render: (row) => money(Number(row.price)),
                  },

                  { key: "socket", label: "Socket" },

                  { key: "ram", label: "RAM generation" },
                ]}
                onView={(row) => {
                  const type = String(row.type)

                  setComponentType(type)

                  setComponent(
                    store.componentCatalog[type].find(
                      (item) => item.id === row.componentId,
                    )!,
                  )

                  setComponentOpen(true)
                }}
                actions={(row) => (
                  <div className="flex gap-3">
                    <button
                      className="text-primary"
                      onClick={() => {
                        const type = String(row.type)

                        setComponentType(type)

                        setComponent(
                          store.componentCatalog[type].find(
                            (item) => item.id === row.componentId,
                          )!,
                        )

                        setComponentOpen(true)
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-600"
                      onClick={() => {
                        setComponentType(String(row.type))

                        setRemove({
                          type: "component",

                          id: String(row.componentId),

                          name: String(row.name),
                        })
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              />
            </>
          )}
          {section === "pc-builder" && view === "configurations" && (
            <DataTable
              rows={store.builds.map((item) => ({
                ...item,

                components: Object.keys(item.parts).length,

                compatibility: compatibility(item.parts).valid
                  ? "Compatible"
                  : "Incompatible",
              }))}
              columns={[
                { key: "name", label: "Build name" },

                { key: "components", label: "Components" },

                {
                  key: "price",

                  label: "Price",

                  render: (row) => money(Number(row.price)),
                },

                {
                  key: "compatibility",

                  label: "Compatibility",

                  render: (row) => statusBadge(String(row.compatibility)),
                },
              ]}
              actions={(row) => (
                <div className="flex gap-3">
                  <Link
                    to={`/pc-builder?build=${row.id}`}
                    className="text-primary"
                  >
                    Open build
                  </Link>
                  <button
                    className="text-red-600"
                    onClick={() =>
                      setRemove({
                        type: "build",

                        id: row.id,

                        name: String(row.name),
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              )}
            />
          )}
          {section === "analytics" && (
            <VisitorAnalytics
              view={view}
              sales={
                <>
                  <div className="mb-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    <Chart title="Revenue trend" type="revenue" />
                    <Chart title="Orders trend" type="orders" />
                    <Chart title="Service activity" type="services" />
                  </div>
                  <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[
                      [
                        "Order revenue",

                        money(
                          store.orders.reduce(
                            (sum, item) => sum + item.total,

                            0,
                          ),
                        ),
                      ],

                      [
                        "Approved service revenue",

                        money(
                          store.requests

                            .filter((item) => item.quoteState === "approved")

                            .reduce((sum, item) => sum + item.quote, 0),
                        ),
                      ],

                      ["Order count", store.orders.length],

                      ["Service requests", store.requests.length],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg border border-border bg-white p-5"
                      >
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-4 text-2xl font-bold">{value}</p>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Current browser-local activity
                        </p>
                      </div>
                    ))}
                  </div>
                  <h2 className="mb-4 text-lg font-bold">
                    Product performance
                  </h2>
                  {
                    <DataTable
                      rows={store.products.map((item) => ({
                        ...item,

                        sold: store.orders.reduce(
                          (sum, order) =>
                            sum +
                            order.items

                              .filter((row) => row.productId === item.id)

                              .reduce((count, row) => count + row.quantity, 0),

                          0,
                        ),
                      }))}
                      columns={[
                        { key: "name", label: "Product" },

                        { key: "category", label: "Category" },

                        { key: "sold", label: "Units sold" },

                        { key: "stock", label: "Stock" },
                      ]}
                    />
                  }
                  <h2 className="mb-4 mt-8 text-lg font-bold">
                    Service requests
                  </h2>
                  {
                    <DataTable
                      rows={serviceRows}
                      columns={columnsServices}
                      onView={(row) => setRequestId(row.id)}
                    />
                  }
                  <h2 className="mb-4 mt-8 text-lg font-bold">Orders</h2>
                  {
                    <DataTable
                      rows={orderRows}
                      columns={columnsOrders}
                      onView={(row) => setOrderId(row.id)}
                    />
                  }
                </>
              }
            />
          )}
          {section === "settings" && <SettingsPanel key={view} view={view} />}
          {section === "products" && view === "brands" && (
            <BrandsManager
              onRemove={(name) => setRemove({ type: "brand", id: name, name })}
            />
          )}
          {section === "products" && view === "import" && <BulkImport />}
          {section === "products" && view === "image-discovery" && (
            <AdminImageDiscovery />
          )}
          {section === "services" && view === "requests" && (
            <TechnicianManager />
          )}
          {section === "services" && view === "warranty" && <WarrantyAdmin />}
          {section === "services" && view === "areas" && (
            <ServiceAreas
              onRemove={(id, name) => setRemove({ type: "location", id, name })}
            />
          )}
          {section === "pc-builder" && view === "requests" && <PcRequests />}
          {section === "pc-builder" && view === "templates" && (
            <BuildTemplatesAdmin />
          )}
          {section === "support" && <SupportAdmin key={view} view={view} />}
          {section === "coupons" && <CouponsAdmin key={view} view={view} />}
          {section === "sell-requests" && (
            <SellRequestsAdmin key={view} view={view} />
          )}
          {section === "certificates" && (
            <AdminCertificates key={view} view={view} />
          )}
          {resourceDefinitions[section] && (
            <ResourceManager key={section} section={section} />
          )}
          {!adminGroups.some((group) => group.section === section) &&
            !resourceDefinitions[section] && (
              <Empty
                title="Workspace not found"
                description="Use the admin navigation to explore your hub."
                to="/admin"
                label="Back to dashboard"
              />
            )}
          <p className="mt-10 text-[10px] text-muted-foreground">
            IT HUB Admin · All data and financial values are prototype
            demonstrations, not real business statistics.
          </p>
        </div>
      </div>
      <ProductEditor
        open={productOpen}
        onOpenChange={(open) => {
          setProductOpen(open)

          if (!open && view === "add") navigate("/admin/products?view=all")
        }}
        product={product}
      />
      <OfferEditor
        open={offerOpen}
        onOpenChange={(open) => {
          setOfferOpen(open)

          if (!open && view === "create") navigate("/admin/offers?view=active")
        }}
        offer={offer}
      />
      <Modal
        open={Boolean(stockId)}
        onOpenChange={(open) => {
          if (!open) setStockId("")
        }}
        title="Stock adjustment"
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()

            store.set({
              products: store.products.map((item) =>
                item.id === stockId
                  ? { ...item, stock: Math.max(0, item.stock + stockAmount) }
                  : item,
              ),
            })

            store.log(`Stock adjusted by ${stockAmount} for ${stockId}`)

            setStockId("")

            store.notify("Stock updated in the storefront")
          }}
        >
          <p className="text-sm font-semibold">
            {store.products.find((item) => item.id === stockId)?.name}
          </p>
          <p className="text-xs text-muted-foreground">
            Current stock:{" "}
            {store.products.find((item) => item.id === stockId)?.stock ?? 0}.
            Use a negative number to remove units (damaged, returned to
            supplier).
          </p>
          <Field label="Adjust by (units)">
            <input
              type="number"
              required
              min={-10000}
              max={10000}
              step={1}
              value={stockAmount}
              onChange={(event) => setStockAmount(Number(event.target.value))}
              className={fieldClass}
            />
          </Field>
          <Button type="submit" disabled={!stockAmount}>
            Apply adjustment
          </Button>
        </form>
      </Modal>
      <Modal
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        title="Add product category"
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()

            if (store.catalogCategories.includes(category.trim())) {
              store.notify("This category already exists")

              return
            }

            store.set({
              catalogCategories: [...store.catalogCategories, category.trim()],
            })

            store.log(`Category created: ${category}`)

            setCategoryOpen(false)

            store.notify("Category added to storefront filters")
          }}
        >
          <Field label="Category name">
            <input
              required
              minLength={2}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Button type="submit">Create category</Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open) setOrderId("")
        }}
        title={selectedOrder?.id || "Order details"}
      >
        {selectedOrder && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="mt-1 font-semibold">{selectedOrder.name}</p>
                <p className="mt-1 text-xs">{selectedOrder.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="mt-1 text-xl font-bold">
                  {money(selectedOrder.total)}
                </p>
              </div>
            </div>
            <p className="rounded-md bg-muted p-4 text-sm">
              {selectedOrder.address}
            </p>
            <Field label="Order status">
              <select
                className={fieldClass}
                value={selectedOrder.status}
                onChange={(event) => {
                  const status = Number(event.target.value)

                  store.set((previous) => ({
                    orders: previous.orders.map((item) =>
                      item.id === orderId ? { ...item, status } : item,
                    ),

                    notifications: [
                      `Order ${orderId}: ${orderStatuses[status] || "Cancelled"}`,

                      ...previous.notifications,
                    ],
                  }))

                  store.log(
                    `Order ${orderId}: ${orderStatuses[status] || "Cancelled"}`,
                  )

                  store.notify("Order status updated for the customer")
                }}
              >
                {orderStatuses.map((status, index) => (
                  <option value={index} key={status}>
                    {status}
                  </option>
                ))}
                <option value={-1}>Cancelled</option>
              </select>
            </Field>
            <h3 className="font-bold">Order items</h3>
            {selectedOrder.items.map((item) => (
              <p className="flex justify-between gap-3 text-xs" key={item.id}>
                <span>
                  {item.name} × {item.quantity}
                </span>
                {money(item.price * item.quantity)}
              </p>
            ))}
            <ActionLink secondary to={`/track-order/${selectedOrder.id}`}>
              Open customer tracking <ArrowUpRight size={14} />
            </ActionLink>
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) setRequestId("")
        }}
        title={selectedRequest?.id || "Service details"}
      >
        {selectedRequest && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-bold">{selectedRequest.model}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {selectedRequest.name} · {selectedRequest.email}
              </p>
              <p className="mt-3 text-sm">Issue: {selectedRequest.problem}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedRequest.notes || "No additional notes"}
              </p>
            </div>
            <Field label="Technician">
              <select
                className={fieldClass}
                value={selectedRequest.technician}
                onChange={(event) => {
                  const technician = event.target.value

                  adminUpdateServiceRequest(requestId, {
                    technician_name: technician,
                  })

                  store.set({
                    requests: store.requests.map((item) =>
                      item.id === requestId ? { ...item, technician } : item,
                    ),
                  })

                  store.log(`Technician assigned to ${requestId}`)

                  store.notify("Technician assigned")
                }}
              >
                {store.technicians.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Field label="Service status">
              <select
                className={fieldClass}
                value={selectedRequest.status}
                onChange={(event) => {
                  const status = Number(event.target.value)

                  if (
                    status >= 5 &&
                    selectedRequest.quoteState !== "approved"
                  ) {
                    setError(
                      "The customer must approve the quotation before repair can proceed.",
                    )

                    return
                  }

                  setError("")

                  adminUpdateServiceRequest(requestId, {
                    status: serviceStatuses[status],
                  })

                  store.set((previous) => ({
                    requests: previous.requests.map((item) =>
                      item.id === requestId ? { ...item, status } : item,
                    ),

                    notifications: [
                      `Service ${requestId}: ${serviceStatuses[status]}`,

                      ...previous.notifications,
                    ],
                  }))

                  store.log(`Service ${requestId}: ${serviceStatuses[status]}`)

                  store.notify("Service status updated")
                }}
              >
                {serviceStatuses.map((status, index) => (
                  <option value={index} key={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            {error && (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            )}
            <Field label="Quotation amount (₹, demo)">
              <input
                type="number"
                min={1000}
                step={1}
                disabled={selectedRequest.quoteState !== "pending"}
                value={selectedRequest.quote}
                onChange={(event) =>
                  store.set({
                    requests: store.requests.map((item) =>
                      item.id === requestId
                        ? { ...item, quote: Number(event.target.value) }
                        : item,
                    ),
                  })
                }
                className={fieldClass}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Approval: <strong>{selectedRequest.quoteState}</strong>. Approved
              quotations are locked.
            </p>
            <Button
              onClick={async () => {
                if (selectedRequest.quote < 1000) {
                  setError(
                    "Quote must be at least ₹1,000 for the sample labour line.",
                  )

                  return
                }

                const newStatus = Math.max(selectedRequest.status, 4)

                await adminUpdateServiceRequest(requestId, {
                  status: serviceStatuses[newStatus],

                  quote: selectedRequest.quote,

                  quote_state: "pending",
                })

                store.set((previous) => ({
                  requests: previous.requests.map((item) =>
                    item.id === requestId
                      ? { ...item, status: newStatus, quoteState: "pending" }
                      : item,
                  ),

                  notifications: [
                    `Quotation ready for ${requestId}`,

                    ...previous.notifications,
                  ],
                }))

                store.log(`Quotation published for ${requestId}`)

                store.notify("Quotation published for customer review")
              }}
            >
              Publish quotation
            </Button>
            <ActionLink
              secondary
              to={`/track-service/${selectedRequest.id}`}
              className="ml-3"
            >
              Customer view
            </ActionLink>
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(customerEmail)}
        onOpenChange={(open) => {
          if (!open) setCustomerEmail("")
        }}
        title="Customer profile"
      >
        <div className="space-y-5">
          <h3 className="text-xl font-bold">
            {customers.find((item) => item.email === customerEmail)?.name}
          </h3>
          <p className="text-sm text-muted-foreground">{customerEmail}</p>
          <h4 className="font-bold">Orders & payments</h4>
          {store.orders

            .filter((item) => item.email === customerEmail)

            .map((item) => (
              <Link
                className="flex justify-between rounded bg-muted p-3 text-xs text-primary"
                key={item.id}
                to={`/track-order/${item.id}`}
              >
                <span>{item.id}</span>
                {money(item.total)}
              </Link>
            ))}
          <h4 className="font-bold">Service requests</h4>
          {store.requests

            .filter((item) => item.email === customerEmail)

            .map((item) => (
              <Link
                className="block rounded bg-muted p-3 text-xs text-primary"
                key={item.id}
                to={`/track-service/${item.id}`}
              >
                {item.model} · {item.id}
              </Link>
            ))}
          <div className="flex gap-3">
            <ActionLink secondary to="/account/warranty">
              Warranty records
            </ActionLink>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Customers are derived from browser-local demo transactions.
          </p>
        </div>
      </Modal>
      <Modal
        open={componentOpen}
        onOpenChange={setComponentOpen}
        title={
          component.id ? "Edit builder component" : "Add builder component"
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()

            const next = {
              ...component,

              id: component.id || crypto.randomUUID(),
            }

            store.set({
              componentCatalog: {
                ...store.componentCatalog,

                [componentType]: component.id
                  ? store.componentCatalog[componentType].map((item) =>
                      item.id === component.id ? next : item,
                    )
                  : [...store.componentCatalog[componentType], next],
              },
            })

            store.log(`Builder component saved: ${component.name}`)

            setComponentOpen(false)

            store.notify("PC builder component updated")
          }}
        >
          <Field label="Component type">
            <select
              disabled={Boolean(component.id)}
              value={componentType}
              onChange={(event) => setComponentType(event.target.value)}
              className={fieldClass}
            >
              {Object.keys(store.componentCatalog).map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input
              required
              value={component.name}
              onChange={(event) =>
                setComponent({ ...component, name: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Price (₹)">
            <input
              required
              min={1}
              type="number"
              value={component.price}
              onChange={(event) =>
                setComponent({
                  ...component,

                  price: Number(event.target.value),
                })
              }
              className={fieldClass}
            />
          </Field>
          {["CPU", "Motherboard"].includes(componentType) && (
            <Field label="Socket">
              <select
                required
                value={component.socket || ""}
                onChange={(event) =>
                  setComponent({ ...component, socket: event.target.value })
                }
                className={fieldClass}
              >
                <option value="">Choose socket</option>
                <option>AM5</option>
                <option>LGA1700</option>
              </select>
            </Field>
          )}
          {["RAM", "Motherboard"].includes(componentType) && (
            <Field label="RAM generation">
              <select
                required
                value={component.ram || ""}
                onChange={(event) =>
                  setComponent({ ...component, ram: event.target.value })
                }
                className={fieldClass}
              >
                <option value="">Choose generation</option>
                <option>DDR5</option>
                <option>DDR4</option>
              </select>
            </Field>
          )}
          {["CPU", "GPU"].includes(componentType) && (
            <Field label="Estimated power (W)">
              <input
                required
                min={1}
                type="number"
                value={component.watts || ""}
                onChange={(event) =>
                  setComponent({
                    ...component,

                    watts: Number(event.target.value),
                  })
                }
                className={fieldClass}
              />
            </Field>
          )}
          {["PSU", "Cooler"].includes(componentType) && (
            <Field label="Capacity (W)">
              <input
                required
                min={1}
                type="number"
                value={component.capacity || ""}
                onChange={(event) =>
                  setComponent({
                    ...component,

                    capacity: Number(event.target.value),
                  })
                }
                className={fieldClass}
              />
            </Field>
          )}
          {componentType === "GPU" && (
            <Field label="GPU length (mm)">
              <input
                required
                min={1}
                type="number"
                value={component.length || ""}
                onChange={(event) =>
                  setComponent({
                    ...component,

                    length: Number(event.target.value),
                  })
                }
                className={fieldClass}
              />
            </Field>
          )}
          {componentType === "Cabinet" && (
            <Field label="GPU clearance (mm)">
              <input
                required
                min={1}
                type="number"
                value={component.clearance || ""}
                onChange={(event) =>
                  setComponent({
                    ...component,

                    clearance: Number(event.target.value),
                  })
                }
                className={fieldClass}
              />
            </Field>
          )}
          {["Storage", "Motherboard"].includes(componentType) && (
            <Field label="Storage interface">
              <select
                required
                value={component.interface || ""}
                onChange={(event) =>
                  setComponent({ ...component, interface: event.target.value })
                }
                className={fieldClass}
              >
                <option value="">Choose interface</option>
                <option>NVMe</option>
                <option>SATA</option>
              </select>
            </Field>
          )}
          <Button type="submit">Save component</Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(remove)}
        onOpenChange={(open) => {
          if (!open) setRemove(null)
        }}
        title="Remove this record?"
        description="This changes browser-local demo data only."
      >
        <p className="mb-6 text-sm">
          Remove <strong>{remove?.name}</strong>? Existing transaction history
          will be kept.
        </p>
        <div className="flex gap-3">
          <Button onClick={deleteItem}>Confirm removal</Button>
          <Button variant="secondary" onClick={() => setRemove(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
      <Modal
        open={sample}
        onOpenChange={setSample}
        title="Load sample activity?"
        description="Add one clearly labelled demo order and one example repair request."
      >
        <p className="mb-6 text-sm leading-7 text-muted-foreground">
          These are illustrative records, not real customers or business
          transactions. They also appear in the customer account so you can
          explore tracking, quotations and management.
        </p>
        <Button onClick={loadSample}>Load sample order & service</Button>
      </Modal>
      {store.toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[100] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-lg bg-[#0b1220] px-5 py-4 text-sm text-white shadow-xl"
        >
          <CheckCircle2 size={18} className="shrink-0 text-blue-300" />
          {store.toast}
        </div>
      )}
    </div>
  )
}

function ProductEditor({
  open,

  onOpenChange,

  product,
}: {
  open: boolean

  onOpenChange: (open: boolean) => void

  product: Product | null
}) {
  const store = useStore()

  const [draft, setDraft] = useState<Product>(
    product || {
      id: "",

      name: "",

      brand: "",

      category: "Laptops",

      price: 0,

      original: 0,

      image: "",

      stock: 0,

      rating: 4.8,

      specs: { Warranty: "Contact IT HUB" },
    },
  )

  const [specText, setSpecText] = useState("")

  const [error, setError] = useState("")

  useEffect(() => {
    setDraft(
      product || {
        id: "",

        name: "",

        brand: "",

        category: store.catalogCategories[0] || "Laptops",

        price: 0,

        original: 0,

        image: "",

        stock: 0,

        rating: 4.8,

        specs: { Warranty: "Contact IT HUB" },
      },
    )

    setSpecText(
      JSON.stringify(product?.specs || { Warranty: "Contact IT HUB" }, null, 2),
    )

    setError("")
  }, [product, open])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={product ? "Edit product" : "Add a new product"}
      description="Update the shared catalog. Changes appear immediately in the storefront."
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()

          try {
            const specs = JSON.parse(specText)

            if (
              !/^https?:\/\//.test(draft.image) &&
              !draft.image.startsWith("/")
            ) {
              setError("Use an https:// image URL or a local /images/ path.")

              return
            }

            if (
              !specs ||
              Array.isArray(specs) ||
              typeof specs !== "object" ||
              Object.values(specs).some((value) => typeof value !== "string")
            )
              throw new Error()

            const next = {
              ...draft,

              specs,

              id:
                product?.id ||
                slug(draft.name) + "-" + crypto.randomUUID().slice(0, 4),
            }

            if (next.original < next.price) {
              setError("Original price cannot be below the current price.")

              return
            }

            store.set((previous) => ({
              products: product
                ? previous.products.map((item) =>
                    item.id === product.id ? next : item,
                  )
                : [next, ...previous.products],
            }))

            store.log(
              `Product ${product ? "updated" : "created"}: ${next.name}`,
            )

            onOpenChange(false)

            store.notify("Product saved to storefront")
          } catch {
            setError(
              'Specifications must be a JSON object with text values, e.g. {"RAM":"16GB"}.',
            )
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name">
            <input
              required
              minLength={3}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Brand">
            <input
              required
              list="admin-brands"
              value={draft.brand}
              onChange={(event) =>
                setDraft({ ...draft, brand: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
          <datalist id="admin-brands">
            {store.brands.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Field label="Category">
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value })
              }
              className={fieldClass}
            >
              {store.catalogCategories.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Stock">
            <input
              required
              type="number"
              min={0}
              step={1}
              value={draft.stock}
              onChange={(event) =>
                setDraft({ ...draft, stock: Number(event.target.value) })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Current price (₹)">
            <input
              required
              type="number"
              min={1}
              value={draft.price}
              onChange={(event) =>
                setDraft({ ...draft, price: Number(event.target.value) })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Original price (₹)">
            <input
              required
              type="number"
              min={1}
              value={draft.original}
              onChange={(event) =>
                setDraft({ ...draft, original: Number(event.target.value) })
              }
              className={fieldClass}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="SKU">
            <input
              value={draft.sku || ""}
              onChange={(event) =>
                setDraft({ ...draft, sku: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Low stock threshold">
            <input
              type="number"
              min={0}
              step={1}
              value={draft.lowStockThreshold ?? 3}
              onChange={(event) =>
                setDraft({
                  ...draft,

                  lowStockThreshold: Number(event.target.value),
                })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Status">
            <select
              value={draft.status || "Active"}
              onChange={(event) =>
                setDraft({
                  ...draft,

                  status: event.target.value as Product["status"],
                })
              }
              className={fieldClass}
            >
              {["Active", "Draft", "Archived"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inventory Classification">
            <select
              value={draft.secondHand ? "secondHand" : "fresh"}
              onChange={(event) =>
                setDraft({
                  ...draft,

                  secondHand: event.target.value === "secondHand",

                  condition:
                    event.target.value === "secondHand"
                      ? draft.condition || "Good"
                      : undefined,
                })
              }
              className={fieldClass}
            >
              <option value="fresh">Fresh (Brand New Product)</option>
              <option value="secondHand">
                Second-Hand / Verified Pre-Owned
              </option>
            </select>
          </Field>
          {draft.secondHand && (
            <Field label="Pre-Owned Condition">
              <select
                value={draft.condition || "Good"}
                onChange={(event) =>
                  setDraft({ ...draft, condition: event.target.value as any })
                }
                className={fieldClass}
              >
                {productConditions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label="Image URL">
          <input
            required
            type="text"
            value={draft.image}
            onChange={(event) =>
              setDraft({ ...draft, image: event.target.value })
            }
            className={fieldClass}
            placeholder="https://…"
          />
        </Field>
        <Field label="Product label (optional)">
          <input
            value={draft.tag || ""}
            onChange={(event) =>
              setDraft({ ...draft, tag: event.target.value })
            }
            className={fieldClass}
          />
        </Field>
        <Field label="Specifications (JSON)">
          <textarea
            value={specText}
            onChange={(event) => setSpecText(event.target.value)}
            className={`${fieldClass} font-mono text-xs`}
            rows={5}
          />
        </Field>
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <Button type="submit">Save product</Button>
      </form>
    </Modal>
  )
}

const emptyOffer = (): Offer => {
  const now = new Date()

  const start = new Date(now.getTime() - now.getTimezoneOffset() * 60000)

  const end = new Date(start.getTime() + 7 * 86400000)

  return {
    id: "",

    name: "",

    description: "",

    type: offerTypes[0],

    discount: 10,

    amount: 0,

    products: [],

    categories: [],

    brands: [],

    startsAt: start.toISOString().slice(0, 16),

    endsAt: end.toISOString().slice(0, 16),

    banner: "",

    active: true,
  }
}

/** Read an image file and downscale it to a JPEG data URL for localStorage. */

const readImage = (file: File, max = 1200) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = reject

    reader.onload = () => {
      const img = new Image()

      img.onerror = reject

      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))

        const canvas = document.createElement("canvas")

        canvas.width = Math.round(img.width * scale)

        canvas.height = Math.round(img.height * scale)

        canvas

          .getContext("2d")!

          .drawImage(img, 0, 0, canvas.width, canvas.height)

        resolve(canvas.toDataURL("image/jpeg", 0.82))
      }

      img.src = String(reader.result)
    }

    reader.readAsDataURL(file)
  })

function Chips({
  options,

  selected,

  onChange,
}: {
  options: string[]

  selected: string[]

  onChange: (next: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option)

        return (
          <button
            type="button"
            key={option}
            onClick={() =>
              onChange(
                on
                  ? selected.filter((item) => item !== option)
                  : [...selected, option],
              )
            }
            className={`rounded-full border px-3 py-1.5 text-xs ${
              on
                ? "border-primary bg-secondary font-semibold text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function OfferEditor({
  open,

  onOpenChange,

  offer,
}: {
  open: boolean

  onOpenChange: (open: boolean) => void

  offer: Offer | null
}) {
  const store = useStore()

  const [draft, setDraft] = useState<Offer>(emptyOffer)

  const [mode, setMode] = useState<"percent" | "fixed">("percent")

  const [search, setSearch] = useState("")

  const [error, setError] = useState("")

  useEffect(() => {
    const next = offer || emptyOffer()

    setDraft(next)

    setMode(next.discount > 0 || !next.amount ? "percent" : "fixed")

    setSearch("")

    setError("")
  }, [offer, open])

  const matches = store.products.filter((item) =>
    `${item.name} ${item.brand} ${item.category}`

      .toLowerCase()

      .includes(search.toLowerCase()),
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={offer ? "Edit offer" : "Create offer"}
      description="Offers apply automatically to matching products between the start and end time. No coupon codes."
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()

          const next: Offer = {
            ...draft,

            name: draft.name.trim(),

            discount: mode === "percent" ? draft.discount : 0,

            amount: mode === "fixed" ? draft.amount : 0,

            id: offer?.id || crypto.randomUUID(),
          }

          if (!next.name) return setError("Offer name is required.")

          if (
            mode === "percent" &&
            (!(next.discount >= 1) || next.discount > 90)
          )
            return setError("Percentage discount must be between 1 and 90.")

          if (mode === "fixed" && !(next.amount > 0))
            return setError("Fixed discount amount must be greater than ₹0.")

          if (!next.startsAt || !next.endsAt)
            return setError("Choose a start and end date/time.")

          if (new Date(next.endsAt) <= new Date(next.startsAt))
            return setError("End date/time must be after the start.")

          if (
            !next.products.length &&
            !next.categories.length &&
            !next.brands.length
          )
            return setError("Select at least one product, category or brand.")

          store.set({
            offers: offer
              ? store.offers.map((item) => (item.id === offer.id ? next : item))
              : [next, ...store.offers],
          })

          store.log(`Offer saved: ${next.name}`)

          onOpenChange(false)

          store.notify(`Offer saved · ${offerStatus(next)}`)
        }}
      >
        <Field label="Offer name">
          <input
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
            className={fieldClass}
            placeholder="e.g. Onam Gaming Sale"
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={2}
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            className={fieldClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Offer type">
            <select
              value={draft.type}
              onChange={(event) =>
                setDraft({
                  ...draft,

                  type: event.target.value as Offer["type"],
                })
              }
              className={fieldClass}
            >
              {offerTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <div>
            <p className="mb-2 text-xs font-semibold">Discount</p>
            <div className="flex gap-2">
              <div className="flex shrink-0 overflow-hidden rounded-md border border-border text-xs">
                {(["percent", "fixed"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setMode(value)}
                    className={`px-3 py-2 ${
                      mode === value
                        ? "bg-primary font-semibold text-white"
                        : "bg-white text-muted-foreground"
                    }`}
                  >
                    {value === "percent" ? "%" : "₹"}
                  </button>
                ))}
              </div>
              <input
                aria-label={
                  mode === "percent" ? "Discount percentage" : "Discount amount"
                }
                type="number"
                min={mode === "percent" ? 1 : 1}
                max={mode === "percent" ? 90 : undefined}
                value={mode === "percent" ? draft.discount : draft.amount}
                onChange={(event) =>
                  setDraft(
                    mode === "percent"
                      ? { ...draft, discount: Number(event.target.value) }
                      : { ...draft, amount: Number(event.target.value) },
                  )
                }
                className={fieldClass}
              />
            </div>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">
            Selected products ({draft.products.length})
          </p>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products…"
            className={`${fieldClass} mb-2 py-2`}
          />
          <div className="max-h-40 overflow-y-auto rounded-md border border-border">
            {matches.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs last:border-0"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={draft.products.includes(item.id)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,

                      products: event.target.checked
                        ? [...draft.products, item.id]
                        : draft.products.filter((id) => id !== item.id),
                    })
                  }
                />
                <span className="flex-1">{item.name}</span>
                <span className="text-muted-foreground">
                  {money(item.price)}
                </span>
              </label>
            ))}
            {!matches.length && (
              <p className="p-3 text-xs text-muted-foreground">
                No products match.
              </p>
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">Selected categories</p>
          <Chips
            options={store.catalogCategories}
            selected={draft.categories}
            onChange={(categories) => setDraft({ ...draft, categories })}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">Selected brands</p>
          <Chips
            options={store.brands}
            selected={draft.brands}
            onChange={(brands) => setDraft({ ...draft, brands })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date & time">
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) =>
                setDraft({ ...draft, startsAt: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="End date & time">
            <input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(event) =>
                setDraft({ ...draft, endsAt: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">Banner image</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={
                draft.banner.startsWith("data:")
                  ? "Uploaded image"
                  : draft.banner
              }
              onChange={(event) =>
                setDraft({ ...draft, banner: event.target.value })
              }
              placeholder="https://… or /images/…"
              className={`${fieldClass} flex-1`}
            />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-semibold text-primary">
              <Upload size={14} /> Upload
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0]

                  event.target.value = ""

                  if (!file || !file.type.startsWith("image/")) return

                  const banner = await readImage(file)

                  setDraft((current) => ({ ...current, banner }))
                }}
              />
            </label>
          </div>
          {draft.banner && (
            <img
              src={draft.banner}
              alt="Offer banner preview"
              className="mt-3 max-h-32 w-full rounded-md border border-border object-cover"
            />
          )}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) =>
              setDraft({ ...draft, active: event.target.checked })
            }
            className="accent-primary"
          />
          Active (status is then set automatically by the date window)
        </label>
        <p className="rounded-md bg-muted p-3 text-xs">
          Preview:{" "}
          <strong>
            {offerHeadline({
              ...draft,

              discount: mode === "percent" ? draft.discount : 0,

              amount: mode === "fixed" ? draft.amount : 0,
            })}
          </strong>{" "}
          · {offerStatus(draft)}
        </p>
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <Button type="submit">Save offer</Button>
      </form>
    </Modal>
  )
}

function Panel({
  title,

  children,

  description,
}: {
  title: string

  description?: string

  children: ReactNode
}) {
  return (
    <div className="mb-6 rounded-lg border border-border bg-white p-6">
      <h3 className="text-sm font-bold">{title}</h3>
      {description && (
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          {description}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function BrandsManager({ onRemove }: { onRemove: (name: string) => void }) {
  const store = useStore()

  const [name, setName] = useState("")

  return (
    <>
      <Panel title="Add brand">
        <form
          className="flex max-w-md gap-3"
          onSubmit={(event) => {
            event.preventDefault()

            const value = name.trim()

            if (!value) return

            if (
              store.brands.some(
                (item) => item.toLowerCase() === value.toLowerCase(),
              )
            ) {
              store.notify("This brand already exists")

              return
            }

            store.set({
              brands: [...store.brands, value].sort((a, b) =>
                a.localeCompare(b),
              ),
            })

            store.log(`Brand added: ${value}`)

            store.notify("Brand added")

            setName("")
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Brand name"
            className={fieldClass}
          />
          <Button type="submit">
            <Plus size={14} /> Add
          </Button>
        </form>
      </Panel>
      <DataTable
        rows={store.brands.map((brand) => ({
          id: brand,

          name: brand,

          count: store.products.filter((item) => item.brand === brand).length,
        }))}
        columns={[
          { key: "name", label: "Brand" },

          { key: "count", label: "Products" },
        ]}
        actions={(row) => (
          <button
            disabled={Number(row.count) > 0}
            title={
              Number(row.count) > 0
                ? "Brand is used by products"
                : "Delete brand"
            }
            className="text-red-600 disabled:opacity-30"
            onClick={() => onRemove(row.id)}
          >
            Delete
          </button>
        )}
      />
    </>
  )
}

const importSteps = [
  "Upload",

  "Parse",

  "Validate",

  "Preview",

  "Errors/Warnings",

  "Confirm",

  "Import",

  "Summary",
]

type ImportSummary = {
  imported: number

  updated: number

  created: number

  skipped: number

  failed: number
}

function BulkImport() {
  const store = useStore()

  const [tab, setTab] = useState<"csv" | "excel" | "template" | "history">(
    "csv",
  )

  const [file, setFile] = useState("")

  const [rows, setRows] = useState<ImportRow[] | null>(null)

  const [parseError, setParseError] = useState("")

  const [showIssues, setShowIssues] = useState(false)

  const [confirming, setConfirming] = useState(false)

  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const reset = () => {
    setFile("")

    setRows(null)

    setParseError("")

    setShowIssues(false)

    setConfirming(false)

    setSummary(null)
  }

  const step = summary
    ? 7
    : confirming
      ? 5
      : rows
        ? rows.some((row) => row.issues.length)
          ? 4
          : 3
        : file
          ? 1
          : 0

  const parse = async (input: File) => {
    reset()

    setFile(input.name)

    const extension = input.name.split(".").pop()?.toLowerCase()

    if (!["csv", "xlsx"].includes(extension || "")) {
      setParseError("Unsupported file type. Upload a .csv or .xlsx file.")

      return
    }

    try {
      const workbook =
        extension === "csv"
          ? XLSX.read(await input.text(), { type: "string" })
          : XLSX.read(await input.arrayBuffer(), { type: "array" })

      const sheet = workbook.Sheets[workbook.SheetNames[0]]

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",

        raw: false,
      })

      if (!raw.length) {
        setParseError(
          "No data rows found. Check that the first row contains the column headers.",
        )

        return
      }

      const headers = Object.keys(raw[0])

      const missing = ["SKU", "Product Name", "Price", "Stock"].filter(
        (key) => !headers.includes(key),
      )

      if (missing.length) {
        setParseError(
          `Missing required columns: ${missing.join(", ")}. Download the template for the expected format.`,
        )

        return
      }

      setRows(validateImportRows(raw, store.catalogCategories, store.brands))
    } catch {
      setParseError(
        "The file could not be parsed. Make sure it is a valid CSV or Excel workbook.",
      )
    }
  }

  const download = (type: "csv" | "xlsx") => {
    const sheet = XLSX.utils.json_to_sheet(importTemplateRows, {
      header: [...importColumns],
    })

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(workbook, sheet, "Products")

    XLSX.writeFile(workbook, `ithub-product-import-template.${type}`, {
      bookType: type,
    })
  }

  const valid = rows?.filter((row) => row.valid) || []

  const errorRows = rows?.filter((row) => !row.valid) || []

  const warningCount =
    rows?.reduce(
      (sum, row) =>
        sum + row.issues.filter((issue) => issue.level === "warning").length,

      0,
    ) || 0

  const runImport = () => {
    if (!rows) return

    let created = 0

    let updated = 0

    let failed = 0

    const products = [...store.products]

    const brands = [...store.brands]

    for (const row of valid) {
      try {
        const d = row.data

        const num = (key: string) =>
          d[key] ? Number(d[key].replace(/[,₹\s]/g, "")) : undefined

        const price = num("Price")!

        const sale = num("Sale Price")

        const mrp = num("MRP")

        const isSecondHand =
          d["Second Hand"]?.toLowerCase() === "yes" ||
          d["Second Hand"]?.toLowerCase() === "true" ||
          (Boolean(d.Condition) && d.Condition?.toLowerCase() !== "new") ||
          d.SKU.toUpperCase().startsWith("SH-")

        const condition =
          d.Condition as Product["condition"] || (isSecondHand ? "Good" : "New")

        const category =
          store.catalogCategories.find(
            (name) => name.toLowerCase() === d.Category.toLowerCase(),
          ) ||
          d.Category ||
          "Uncategorized"

        let brand = brands.find(
          (name) => name.toLowerCase() === d.Brand.toLowerCase(),
        )

        if (!brand) {
          brand = d.Brand || "Generic / OEM"

          brands.push(brand)
        }

        const status = (
          d.Status
            ? d.Status[0].toUpperCase() + d.Status.slice(1).toLowerCase()
            : "Draft"
        ) as Product["status"]

        const specs: Record<string, string> = {}

        if (d["Model Number"]) specs["Model / MPN"] = d["Model Number"]

        if (d.Warranty) specs.Warranty = d.Warranty

        const fields: Partial<Product> = {
          sku: d.SKU,

          name: d["Product Name"],

          brand,

          category,

          subcategory: d.Subcategory || undefined,

          description: d.Description || undefined,

          original: mrp && mrp >= price ? mrp : price,

          price: sale ?? price,

          costPrice: num("Cost Price"),

          stock: num("Stock") ?? 0,

          lowStockThreshold: num("Low Stock Threshold") ?? 3,

          warranty: d.Warranty || undefined,

          weight: d.Weight || undefined,

          secondHand: isSecondHand,

          condition,

          status,
        }

        const index = products.findIndex(
          (item) => item.sku?.toLowerCase() === d.SKU.toLowerCase(),
        )

        if (index >= 0) {
          products[index] = {
            ...products[index],

            ...fields,

            specs: { ...products[index].specs, ...specs },
          }

          updated++
        } else {
          products.unshift({
            id: `${slug(d["Product Name"]).replace(/[^a-z0-9-]/g, "")}-${crypto.randomUUID().slice(0, 4)}`,

            image: images.pc,

            rating: 4.8,

            specs,

            ...fields as Omit<Product, "id" | "image" | "rating" | "specs">,
          })

          created++
        }
      } catch {
        failed++
      }
    }

    const result = {
      imported: created + updated,

      created,

      updated,

      skipped: errorRows.length,

      failed,
    }

    store.set((previous) => ({
      products,

      brands: brands.sort((a, b) => a.localeCompare(b)),

      importHistory: [
        {
          id: crypto.randomUUID(),

          file,

          date: new Date().toLocaleString(),

          rows: rows.length,

          created,

          updated,

          skipped: result.skipped,

          failed,
        },

        ...previous.importHistory,
      ],
    }))

    store.log(`Bulk import ${file}: ${created} created, ${updated} updated`)

    store.notify(`${result.imported} products imported`)

    setConfirming(false)

    setSummary(result)
  }

  const tabs = [
    ["csv", "CSV"],

    ["excel", "Excel"],

    ["template", "Template"],

    ["history", "Import History"],
  ] as const

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-border">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-xs font-semibold ${
              tab === value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "template" && (
        <Panel
          title="Import template"
          description={`Columns: ${importColumns.join(", ")}. Required: Product Name, Price (Selling Price), and at least one identifier (SKU or Model Number). Optional: MRP, Stock, Brand, Category, Warranty, Condition, Second Hand, Status. Inconsistent prices (MRP < Price) and missing details are flagged for review.`}
        >
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => download("csv")}>
              <Download size={14} /> Download CSV template
            </Button>
            <Button variant="secondary" onClick={() => download("xlsx")}>
              <FileSpreadsheet size={14} /> Download Excel template
            </Button>
          </div>
        </Panel>
      )}
      {tab === "history" && (
        <DataTable
          rows={store.importHistory}
          columns={[
            { key: "file", label: "File" },

            { key: "date", label: "Date" },

            { key: "rows", label: "Rows" },

            { key: "created", label: "Created" },

            { key: "updated", label: "Updated" },

            { key: "skipped", label: "Skipped" },

            { key: "failed", label: "Failed" },
          ]}
        />
      )}
      {(tab === "csv" || tab === "excel") && (
        <>
          <ol className="mb-6 flex flex-wrap gap-2">
            {importSteps.map((label, index) => (
              <li
                key={label}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                  index < step
                    ? "bg-secondary text-primary"
                    : index === step
                      ? "bg-primary text-white"
                      : "bg-white text-muted-foreground"
                }`}
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {!rows && !summary && (
            <Panel
              title={
                tab === "csv" ? "Upload CSV file" : "Upload Excel file (.xlsx)"
              }
              description="The file is parsed and validated in your browser. Nothing is imported until you confirm."
            >
              <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-10 text-center hover:border-primary/50">
                <Upload size={24} className="text-primary" />
                <span className="text-sm font-semibold">
                  Choose a {tab === "csv" ? ".csv" : ".xlsx"} file
                </span>
                <span className="text-xs text-muted-foreground">
                  Use the Template tab for the expected columns
                </span>
                <input
                  type="file"
                  accept={
                    tab === "csv"
                      ? ".csv,text/csv"
                      : ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  }
                  className="sr-only"
                  onChange={(event) => {
                    const input = event.target.files?.[0]

                    event.target.value = ""

                    if (input) parse(input)
                  }}
                />
              </label>
              {parseError && (
                <p role="alert" className="mt-4 text-xs text-red-600">
                  {file}: {parseError}
                </p>
              )}
            </Panel>
          )}
          {rows && !summary && (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-white p-5 text-sm">
                <strong>{file}</strong>
                <span>{rows.length} rows found</span>
                <span className="text-emerald-700">✓ {valid.length} valid</span>
                <span className="text-amber-700">
                  ⚠ {warningCount} warnings
                </span>
                <span className="text-red-600">
                  ✕ {errorRows.length} errors
                </span>
              </div>
              {rows.some((row) => row.issues.length) && (
                <div className="mb-5 rounded-lg border border-border bg-white">
                  <button
                    onClick={() => setShowIssues(!showIssues)}
                    className="flex w-full items-center justify-between p-4 text-xs font-semibold text-primary"
                  >
                    {showIssues
                      ? "Hide errors & warnings"
                      : "View errors & warnings"}
                    <ChevronDown
                      size={14}
                      className={showIssues ? "rotate-180" : ""}
                    />
                  </button>
                  {showIssues && (
                    <ul className="max-h-64 overflow-y-auto border-t border-border text-xs">
                      {rows.flatMap((row) =>
                        row.issues.map((issue, index) => (
                          <li
                            key={`${row.row}-${index}`}
                            className={`flex items-center gap-2 border-b border-border px-4 py-2 ${
                              issue.level === "error"
                                ? "text-red-600"
                                : "text-amber-700"
                            }`}
                          >
                            {issue.level === "error" ? (
                              <XCircle size={13} />
                            ) : (
                              <AlertTriangle size={13} />
                            )}
                            Row {row.row} — {issue.message}
                          </li>
                        )),
                      )}
                    </ul>
                  )}
                </div>
              )}
              <div className="mb-5 overflow-x-auto rounded-lg border border-border bg-white">
                <table className="w-full whitespace-nowrap text-left text-xs">
                  <thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Row</th>
                      <th className="px-4 py-3">Status</th>
                      {[
                        "SKU",

                        "Product Name",

                        "Brand",

                        "Category",

                        "Price",

                        "Sale Price",

                        "Stock",

                        "Status",
                      ].map((key) => (
                        <th key={key} className="px-4 py-3">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row) => (
                      <tr key={row.row} className="border-t border-border">
                        <td className="px-4 py-3">{row.row}</td>
                        <td className="px-4 py-3">
                          {!row.valid ? (
                            <Badge tone="red">Error</Badge>
                          ) : row.issues.length ? (
                            <Badge tone="amber">Warning</Badge>
                          ) : (
                            <Badge tone="green">Valid</Badge>
                          )}
                        </td>
                        {[
                          "SKU",

                          "Product Name",

                          "Brand",

                          "Category",

                          "Price",

                          "Sale Price",

                          "Stock",

                          "Status",
                        ].map((key) => (
                          <td key={key} className="max-w-48 truncate px-4 py-3">
                            {row.data[key] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 10 && (
                  <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                    Showing first 10 of {rows.length} rows
                  </p>
                )}
              </div>
              {confirming ? (
                <div className="rounded-lg border border-primary/30 bg-secondary/50 p-5">
                  <p className="mb-4 text-sm">
                    Import <strong>{valid.length}</strong> valid rows?{" "}
                    {errorRows.length} row(s) with errors will be skipped.
                    Products with a matching SKU will be updated.
                  </p>
                  <div className="flex gap-3">
                    <Button onClick={runImport}>Confirm import</Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirming(false)}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={reset}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!valid.length}
                    onClick={() => setConfirming(true)}
                  >
                    Import valid rows ({valid.length})
                  </Button>
                </div>
              )}
            </>
          )}
          {summary && (
            <Panel title="Import summary" description={file}>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {([
                  ["Imported", summary.imported],

                  ["Updated", summary.updated],

                  ["Created", summary.created],

                  ["Skipped", summary.skipped],

                  ["Failed", summary.failed],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-md bg-muted p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button onClick={reset}>
                  <Upload size={14} /> Upload corrected file
                </Button>
                <ActionLink secondary to="/admin/products?view=all">
                  View products
                </ActionLink>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}

function TechnicianManager() {
  const store = useStore()

  const [name, setName] = useState("")

  return (
    <div className="mt-6">
      <Panel
        title="Internal service staff"
        description="Names used in the technician dropdown on service requests. These are not application logins — the app only has admin and customer roles."
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {store.technicians

            .filter((item) => item !== "Unassigned")

            .map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs"
              >
                {item}
                <button
                  aria-label={`Remove ${item}`}
                  className="text-red-600"
                  onClick={() => {
                    store.set((previous) => ({
                      technicians: previous.technicians.filter(
                        (value) => value !== item,
                      ),

                      requests: previous.requests.map((request) =>
                        request.technician === item
                          ? { ...request, technician: "Unassigned" }
                          : request,
                      ),
                    }))

                    store.log(`Service staff removed: ${item}`)
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
        </div>
        <form
          className="flex max-w-md gap-3"
          onSubmit={(event) => {
            event.preventDefault()

            const value = name.trim()

            if (!value || store.technicians.includes(value)) return

            store.set({ technicians: [...store.technicians, value] })

            store.log(`Service staff added: ${value}`)

            setName("")
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Staff name"
            className={fieldClass}
          />
          <Button type="submit" variant="secondary">
            Add
          </Button>
        </form>
      </Panel>
    </div>
  )
}

function WarrantyAdmin() {
  const store = useStore()

  const [pin, setPin] = useState("")

  const [checked, setChecked] = useState("")

  const result = checked ? checkWarranty(checked, store.locations) : null

  return (
    <>
      <Panel
        title="Quick eligibility check"
        description="Distance is a straight-line estimate from the PIN code area centre to the nearest active IT HUB location."
      >
        <form
          className="flex max-w-md gap-3"
          onSubmit={(event) => {
            event.preventDefault()

            setChecked(pin)
          }}
        >
          <input
            value={pin}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            placeholder="6-digit PIN code"
            className={fieldClass}
          />
          <Button type="submit">
            <MapPin size={14} /> Check
          </Button>
        </form>
        {result && (
          <div className="mt-4 rounded-md bg-muted p-4 text-sm">
            {result.status === "invalid" && (
              <p className="text-red-600">
                Enter a valid 6-digit Indian PIN code.
              </p>
            )}
            {result.status === "unknown" && (
              <p className="text-amber-700">
                PIN {result.pincode} is not in the area directory — confirm
                manually.
              </p>
            )}
            {(result.status === "eligible" ||
              result.status === "ineligible") && (
              <>
                <Badge tone={result.status === "eligible" ? "green" : "red"}>
                  {result.status === "eligible"
                    ? "Eligible for on-site service"
                    : "Outside service radius"}
                </Badge>
                <p className="mt-3">
                  Area: <strong>{result.area}</strong> · nearest:{" "}
                  {result.location.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.distanceKm !== null
                    ? `approx. ${result.distanceKm} km (PIN-area estimate) · `
                    : ""}
                  radius {result.location.serviceRadiusKm} km
                </p>
              </>
            )}
          </div>
        )}
      </Panel>
      <h2 className="mb-4 text-lg font-bold">Customer warranty checks</h2>
      <DataTable
        rows={store.warrantyChecks.map((item) => ({
          ...item,

          distance:
            item.distanceKm === null ? "—" : `approx. ${item.distanceKm} km`,
        }))}
        columns={[
          { key: "pincode", label: "PIN code" },

          { key: "area", label: "Area" },

          {
            key: "result",

            label: "Result",

            render: (row) => (
              <Badge
                tone={
                  row.result === "eligible"
                    ? "green"
                    : row.result === "ineligible"
                      ? "red"
                      : "amber"
                }
              >
                {String(row.result)}
              </Badge>
            ),
          },

          { key: "distance", label: "Distance" },

          { key: "source", label: "Source" },

          { key: "date", label: "Date" },
        ]}
      />
    </>
  )
}

const emptyLocation = (): ItHubLocation => ({
  id: "",

  name: "",

  address: "",

  pincode: "",

  latitude: 10.0602,

  longitude: 76.6351,

  serviceRadiusKm: 15,

  active: true,
})

function LocationForm({
  value,

  onSave,

  submitLabel = "Save location",
}: {
  value: ItHubLocation

  onSave: (location: ItHubLocation) => void

  submitLabel?: string
}) {
  const [draft, setDraft] = useState(value)

  const [error, setError] = useState("")

  useEffect(() => setDraft(value), [value])

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()

        if (draft.name.trim().length < 2) return setError("Name is required.")

        if (!/^[1-9]\d{5}$/.test(draft.pincode))
          return setError("Enter a valid 6-digit PIN code.")

        if (
          !(Math.abs(draft.latitude) <= 90) ||
          !(Math.abs(draft.longitude) <= 180)
        )
          return setError("Latitude must be −90…90 and longitude −180…180.")

        if (!(draft.serviceRadiusKm > 0))
          return setError("Service radius must be greater than 0 km.")

        setError("")

        onSave({
          ...draft,

          name: draft.name.trim(),

          id: draft.id || crypto.randomUUID(),
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location name">
          <input
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
            className={fieldClass}
          />
        </Field>
        <Field label="PIN code">
          <input
            value={draft.pincode}
            maxLength={6}
            onChange={(event) =>
              setDraft({
                ...draft,

                pincode: event.target.value.replace(/\D/g, ""),
              })
            }
            className={fieldClass}
          />
        </Field>
      </div>
      <Field label="Address">
        <input
          value={draft.address}
          onChange={(event) =>
            setDraft({ ...draft, address: event.target.value })
          }
          className={fieldClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Latitude">
          <input
            type="number"
            step="any"
            value={draft.latitude}
            onChange={(event) =>
              setDraft({ ...draft, latitude: Number(event.target.value) })
            }
            className={fieldClass}
          />
        </Field>
        <Field label="Longitude">
          <input
            type="number"
            step="any"
            value={draft.longitude}
            onChange={(event) =>
              setDraft({ ...draft, longitude: Number(event.target.value) })
            }
            className={fieldClass}
          />
        </Field>
        <Field label="Service radius (km)">
          <input
            type="number"
            min={1}
            step="any"
            value={draft.serviceRadiusKm}
            onChange={(event) =>
              setDraft({
                ...draft,

                serviceRadiusKm: Number(event.target.value),
              })
            }
            className={fieldClass}
          />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="accent-primary"
          checked={draft.active}
          onChange={(event) =>
            setDraft({ ...draft, active: event.target.checked })
          }
        />
        Active (used for on-site service checks)
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <Button type="submit">{submitLabel}</Button>
    </form>
  )
}

function ServiceAreas({
  onRemove,
}: {
  onRemove: (id: string, name: string) => void
}) {
  const store = useStore()

  const [editing, setEditing] = useState<ItHubLocation | null>(null)

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => setEditing(emptyLocation())}>
          <Plus size={14} /> Add location
        </Button>
      </div>
      <DataTable
        rows={store.locations.map((item) => ({
          ...item,

          coords: `${item.latitude}, ${item.longitude}`,

          radius: `${item.serviceRadiusKm} km`,

          status: item.active ? "Active" : "Inactive",
        }))}
        columns={[
          { key: "name", label: "Location" },

          { key: "address", label: "Address" },

          { key: "pincode", label: "PIN" },

          { key: "coords", label: "Lat, Lng" },

          { key: "radius", label: "Radius" },

          {
            key: "status",

            label: "Status",

            render: (row) => statusBadge(String(row.status)),
          },
        ]}
        actions={(row) => (
          <div className="flex gap-3">
            <button
              className="text-primary"
              onClick={() =>
                setEditing(
                  store.locations.find((item) => item.id === row.id) || null,
                )
              }
            >
              Edit
            </button>
            <button
              className="text-red-600"
              onClick={() => onRemove(row.id, String(row.name))}
            >
              Delete
            </button>
          </div>
        )}
      />
      <Modal
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.id ? "Edit service location" : "Add service location"}
      >
        {editing && (
          <LocationForm
            value={editing}
            onSave={(location) => {
              store.set((previous) => ({
                locations: previous.locations.some(
                  (item) => item.id === location.id,
                )
                  ? previous.locations.map((item) =>
                      item.id === location.id ? location : item,
                    )
                  : [...previous.locations, location],
              }))

              store.log(`Service location saved: ${location.name}`)

              store.notify("Service location saved")

              setEditing(null)
            }}
          />
        )}
      </Modal>
    </>
  )
}

function PcRequests() {
  const store = useStore()

  const [openId, setOpenId] = useState("")

  const selected = store.pcEnquiries.find((item) => item.id === openId)

  const statuses: PcEnquiry["status"][] = [
    "New",

    "Contacted",

    "Quoted",

    "Closed",
  ]

  return (
    <>
      <p className="mb-5 max-w-2xl text-xs leading-6 text-muted-foreground">
        Build enquiries customers sent to the IT HUB WhatsApp number from the PC
        Builder.
      </p>
      <DataTable
        rows={store.pcEnquiries.map((item) => ({
          ...item,

          count: item.parts.length,
        }))}
        columns={[
          { key: "id", label: "Request" },

          { key: "summary", label: "Summary" },

          { key: "count", label: "Parts" },

          {
            key: "estimate",

            label: "Estimate",

            render: (row) => money(Number(row.estimate)),
          },

          { key: "date", label: "Date" },

          {
            key: "status",

            label: "Status",

            render: (row) => statusBadge(String(row.status)),
          },
        ]}
        onView={(row) => setOpenId(row.id)}
        actions={(row) => (
          <select
            aria-label="Request status"
            className="rounded border border-border p-2 text-xs"
            value={String(row.status)}
            onChange={(event) => {
              const status = event.target.value as PcEnquiry["status"]

              store.set({
                pcEnquiries: store.pcEnquiries.map((item) =>
                  item.id === row.id ? { ...item, status } : item,
                ),
              })

              store.log(`PC request ${row.id}: ${status}`)

              store.notify("Request status updated")
            }}
          >
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        )}
      />
      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setOpenId("")}
        title={selected?.id || "Request"}
      >
        {selected && (
          <div className="space-y-3">
            <p className="text-sm">{selected.summary}</p>
            {selected.parts.map((part) => (
              <p
                key={`${part.type}-${part.name}`}
                className="flex justify-between gap-3 text-xs"
              >
                <span>
                  <strong>{part.type}</strong> · {part.name}
                </span>
                {money(part.price)}
              </p>
            ))}
            <p className="border-t border-border pt-3 text-sm font-bold">
              Estimate {money(selected.estimate)}
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}

function SettingsPanel({ view }: { view: string }) {
  const store = useStore()

  const [settings, setSettings] = useState(store.settings)

  const [error, setError] = useState("")

  const save = (message: string) => {
    store.set({ settings })

    store.log(message)

    store.notify("Settings saved")
  }

  const primary = store.locations[0]

  if (view === "database") return <DatabaseConnectionPanel />

  if (view === "privacy") return <PrivacyPanel />

  if (view === "location")
    return (
      <Panel
        title="Primary IT HUB location"
        description="Used for on-site service distance checks and shown as the store location."
      >
        <LocationForm
          value={primary || emptyLocation()}
          onSave={(location) => {
            store.set((previous) => ({
              locations: previous.locations.length
                ? [location, ...previous.locations.slice(1)]
                : [location],
            }))

            store.log("Primary IT HUB location updated")

            store.notify("Location saved")
          }}
        />
      </Panel>
    )

  if (view === "radius")
    return (
      <Panel
        title="On-site service radius"
        description="Customers whose PIN-area estimate is within the radius of an active location are eligible for on-site service."
      >
        <div className="space-y-4">
          {store.locations.map((location) => (
            <div
              key={location.id}
              className="flex flex-wrap items-center gap-4"
            >
              <span className="min-w-48 text-sm font-semibold">
                {location.name}
              </span>
              <input
                type="range"
                min={1}
                max={100}
                value={location.serviceRadiusKm}
                onChange={(event) =>
                  store.set({
                    locations: store.locations.map((item) =>
                      item.id === location.id
                        ? {
                            ...item,

                            serviceRadiusKm: Number(event.target.value),
                          }
                        : item,
                    ),
                  })
                }
                className="w-56 accent-primary"
                aria-label={`${location.name} radius`}
              />
              <span className="text-sm">{location.serviceRadiusKm} km</span>
            </div>
          ))}
          {!store.locations.length && (
            <p className="text-xs text-muted-foreground">
              Add a service area first.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Changes save automatically.
          </p>
        </div>
      </Panel>
    )

  if (view === "whatsapp")
    return (
      <Panel
        title="WhatsApp number"
        description="PC Builder enquiries and contact buttons open a chat with this number. Include the country code (91 for India), digits only."
      >
        <form
          className="max-w-md space-y-4"
          onSubmit={(event) => {
            event.preventDefault()

            if (!/^\d{10,15}$/.test(settings.whatsapp)) {
              setError(
                "Enter 10–15 digits including the country code, e.g. 919876543210.",
              )

              return
            }

            setError("")

            save("WhatsApp number updated")
          }}
        >
          <Field label="WhatsApp number">
            <input
              inputMode="numeric"
              value={settings.whatsapp}
              onChange={(event) =>
                setSettings({
                  ...settings,

                  whatsapp: event.target.value.replace(/\D/g, ""),
                })
              }
              className={fieldClass}
            />
          </Field>
          <p className="flex items-center gap-2 text-xs">
            <WhatsAppIcon size={14} className="text-primary" /> Preview:{" "}
            <a
              className="text-primary underline"
              href={`https://wa.me/${settings.whatsapp}`}
              target="_blank"
              rel="noreferrer"
            >
              https://wa.me/{settings.whatsapp}
            </a>
          </p>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <Button type="submit">Save number</Button>
        </form>
      </Panel>
    )

  return (
    <Panel title="Store information">
      <form
        className="max-w-2xl space-y-5"
        onSubmit={(event) => {
          event.preventDefault()

          if (settings.email && !/^\S+@\S+\.\S+$/.test(settings.email)) {
            setError("Enter a valid email address.")

            return
          }

          setError("")

          save("Store information updated")
        }}
      >
        <Field label="Store name">
          <input
            required
            value={settings.storeName}
            onChange={(event) =>
              setSettings({ ...settings, storeName: event.target.value })
            }
            className={fieldClass}
          />
        </Field>
        <Field label="Address">
          <textarea
            rows={2}
            value={settings.address}
            onChange={(event) =>
              setSettings({ ...settings, address: event.target.value })
            }
            className={fieldClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input
              value={settings.phone}
              onChange={(event) =>
                setSettings({ ...settings, phone: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={settings.email}
              onChange={(event) =>
                setSettings({ ...settings, email: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="Delivery region">
          <input
            required
            value={settings.delivery}
            onChange={(event) =>
              setSettings({ ...settings, delivery: event.target.value })
            }
            className={fieldClass}
          />
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.emailNotifications}
            onChange={(event) =>
              setSettings({
                ...settings,

                emailNotifications: event.target.checked,
              })
            }
            className="accent-primary"
          />
          Email notifications for new orders
        </label>
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <Button type="submit">Save store information</Button>
      </form>
    </Panel>
  )
}

function ResourceManager({ section }: { section: string }) {
  const store = useStore()

  const config = resourceDefinitions[section]

  const rows = store.resources[section] || []

  const [editing, setEditing] = useState<AdminRecord | null>(null)

  const [open, setOpen] = useState(false)

  const [deleting, setDeleting] = useState<string | null>(null)

  const [draft, setDraft] = useState<AdminRecord>({
    id: "",

    name: "",

    detail: "",

    value: "",

    status: config.statuses[0],
  })

  const immutable = section === "compatibility"

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs leading-6 text-muted-foreground">
          {config.description}
        </p>
        {!immutable && (
          <Button
            onClick={() => {
              setEditing(null)

              setDraft({
                id: "",

                name: "",

                detail: "",

                value: "",

                status: config.statuses[0],
              })

              setOpen(true)
            }}
          >
            <Plus size={14} />
            Add record
          </Button>
        )}
      </div>
      <DataTable
        rows={rows}
        columns={[
          { key: "name", label: config.labels[0] },

          { key: "detail", label: config.labels[1] },

          { key: "value", label: config.labels[2] },

          {
            key: "status",

            label: "Status",

            render: (row) => statusBadge(String(row.status)),
          },
        ]}
        actions={
          immutable
            ? undefined
            : (row) => (
                <div className="flex gap-3">
                  <button
                    className="text-primary"
                    onClick={() => {
                      setEditing(row as AdminRecord)

                      setDraft(row as AdminRecord)

                      setOpen(true)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-red-600"
                    onClick={() => setDeleting(row.id)}
                  >
                    Delete
                  </button>
                </div>
              )
        }
      />
      {immutable && (
        <ActionLink secondary to="/pc-builder" className="mt-5">
          Test the compatibility engine
        </ActionLink>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit demo record" : "Add demo record"}
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()

            const next = { ...draft, id: editing?.id || crypto.randomUUID() }

            store.set({
              resources: {
                ...store.resources,

                [section]: editing
                  ? rows.map((item) => (item.id === editing.id ? next : item))
                  : [...rows, next],
              },
            })

            store.log(
              `${config.title}: ${
                editing ? "updated" : "created"
              } ${next.name}`,
            )

            setOpen(false)

            store.notify("Record saved")
          }}
        >
          {(["name", "detail", "value"] as const).map((key, index) => (
            <Field key={key} label={config.labels[index]}>
              <input
                required
                value={draft[key]}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
                className={fieldClass}
              />
            </Field>
          ))}
          <Field label="Status">
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value })
              }
              className={fieldClass}
            >
              {config.statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </Field>
          <Button type="submit">Save record</Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete demo record?"
      >
        <p className="mb-6 text-sm text-muted-foreground">
          This removes the record from this browser only.
        </p>
        <Button
          onClick={() => {
            store.set({
              resources: {
                ...store.resources,

                [section]: rows.filter((item) => item.id !== deleting),
              },
            })

            store.log(`${config.title}: record deleted`)

            setDeleting(null)

            store.notify("Record deleted")
          }}
        >
          Confirm deletion
        </Button>
      </Modal>
    </>
  )
}

function ShowcaseManager() {
  const store = useStore()

  const [caption, setCaption] = useState("")

  const [remove, setRemove] = useState<string | null>(null)

  const upload = (files: FileList | null) => {
    if (!files?.length) return

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return

      const reader = new FileReader()

      reader.onload = () => {
        // Downscale so the prototype's localStorage can hold several uploads.

        const img = new Image()

        img.onload = () => {
          const scale = Math.min(1, 900 / Math.max(img.width, img.height))

          const canvas = document.createElement("canvas")

          canvas.width = Math.round(img.width * scale)

          canvas.height = Math.round(img.height * scale)

          canvas

            .getContext("2d")!

            .drawImage(img, 0, 0, canvas.width, canvas.height)

          const src = canvas.toDataURL("image/jpeg", 0.82)

          store.set((s) => ({
            showcase: [
              {
                id: `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,

                src,

                caption: caption.trim() || "Another happy IT HUB customer",
              },

              ...s.showcase,
            ],
          }))

          store.log(`Added showcase image ${file.name}`)
        }

        img.src = String(reader.result)
      }

      reader.readAsDataURL(file)
    })

    setCaption("")

    store.notify(
      files.length > 1
        ? `${files.length} images added to showcase`
        : "Image added to showcase",
    )
  }

  const target = store.showcase.find((item) => item.id === remove)

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="text-sm font-bold">Add showcase images</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Images appear in the "Happy customers" section on the storefront home
          page. Newest first.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional) — e.g. New laptop handover"
            className={fieldClass}
          />
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0b3b91]">
            <Plus size={16} /> Upload images
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                upload(e.target.files)

                e.target.value = ""
              }}
            />
          </label>
        </div>
      </div>
      {store.showcase.length === 0 ? (
        <Empty
          title="No showcase images"
          description="Upload customer photos to show them on the home page."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {store.showcase.map((item) => (
            <figure
              key={item.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-muted"
            >
              <img
                src={item.src}
                alt={item.caption}
                className="aspect-[4/5] w-full object-cover"
              />
              <figcaption className="truncate px-3 py-2 text-[11px] text-muted-foreground">
                {item.caption}
              </figcaption>
              <button
                onClick={() => setRemove(item.id)}
                aria-label={`Delete ${item.caption}`}
                className="absolute right-2 top-2 rounded-full bg-white/95 p-2 text-red-600 shadow transition hover:bg-red-600 hover:text-white"
              >
                <Trash2 size={15} />
              </button>
            </figure>
          ))}
        </div>
      )}
      <Modal
        size="max-w-md"
        open={!!target}
        onOpenChange={(open) => !open && setRemove(null)}
        title="Delete this image?"
        description="It will be removed from the storefront showcase."
      >
        {target && (
          <img
            src={target.src}
            alt=""
            className="mb-5 max-h-60 w-full rounded-xl object-cover"
          />
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              store.set((s) => ({
                showcase: s.showcase.filter((item) => item.id !== remove),
              }))

              store.log("Deleted a showcase image")

              store.notify("Image removed from showcase")

              setRemove(null)
            }}
          >
            <Trash2 size={15} /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}

const supportWarning =
  "Only enter numbers and URLs taken from the manufacturer's official website. Do not guess support details."

const emptySupport = (category = ""): BrandSupport => ({
  id: "",

  brand: "",

  category:
    category === "all" || category === "centres" || category === "history"
      ? ""
      : category,

  warrantyPhone: "",

  customerCarePhone: "",

  supportUrl: "",

  warrantyUrl: "",

  serviceLocatorUrl: "",

  email: "",

  notes: "",

  sourceUrl: "",

  verifiedBy: "",

  lastVerifiedAt: "",

  region: "India",

  verificationStatus: "pending_verification",

  isPublished: false,

  popular: false,

  active: true,

  createdAt: "",

  updatedAt: "",
})

const emptyServiceCentre = (category = ""): ServiceCentre => ({
  id: "",

  name: "",

  brandName: "",

  category:
    category === "all" || category === "centres" || category === "history"
      ? "laptop"
      : category,

  address: "",

  city: "Kochi",

  state: "Kerala",

  pincode: "",

  phone: "",

  email: "",

  servicesOffered: [],

  isAuthorized: true,

  authorizationEvidence: "",

  sourceUrl: "",

  latitude: undefined,

  longitude: undefined,

  active: true,

  verifiedAt: new Date().toISOString(),
})

const contactKeys = [
  "warrantyPhone",

  "customerCarePhone",

  "supportUrl",

  "warrantyUrl",

  "serviceLocatorUrl",

  "email",
] as const

const badUrl = (value?: string) => {
  if (!value || !value.trim()) return false

  return !/^https:\/\/\S+$/i.test(value.trim())
}

function SupportAdmin({ view }: { view: string }) {
  const store = useStore()

  const [status, setStatus] = useState("all")

  const [query, setQuery] = useState("")

  const [editing, setEditing] = useState<BrandSupport | null>(null)

  const [verifying, setVerifying] = useState<BrandSupport | null>(null)

  const [removing, setRemoving] = useState<BrandSupport | null>(null)

  const [editingCentre, setEditingCentre] = useState<ServiceCentre | null>(null)

  const [removingCentre, setRemovingCentre] = useState<ServiceCentre | null>(
    null,
  )

  const settingsStatus = useMemo(
    () => checkStoreSettingsCompleteness(store.settings),

    [store.settings],
  )

  const categoryName = (id: string) =>
    store.supportCategories.find((item) => item.id === id)?.name || id

  const history = view === "history"

  const isCentres = view === "centres"

  const rows = store.brandSupport

    .filter(
      (item) =>
        view === "all" || history || isCentres || item.category === view,
    )

    .filter((item) =>
      status === "all"
        ? true
        : status === "active"
          ? item.active
          : status === "inactive"
            ? !item.active
            : status === "published"
              ? item.isPublished
              : status === "verified"
                ? Boolean(item.lastVerifiedAt)
                : !item.lastVerifiedAt,
    )

    .filter((item) =>
      [
        item.brand,

        categoryName(item.category),

        item.warrantyPhone,

        item.customerCarePhone,

        item.supportUrl,
      ]

        .join(" ")

        .toLowerCase()

        .includes(query.toLowerCase()),
    )

  const centreRows = store.serviceCentres.filter((item) =>
    [
      item.name,

      item.brandName,

      item.city,

      item.pincode,

      item.address,

      item.phone || "",
    ]

      .join(" ")

      .toLowerCase()

      .includes(query.toLowerCase()),
  )

  const update = (id: string, patch: Partial<BrandSupport>) =>
    store.set((state) => ({
      brandSupport: state.brandSupport.map((item) =>
        item.id === id
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item,
      ),
    }))

  return (
    <>
      {/* Configuration Required Banner if IT HUB store contact details are missing */}
      {!settingsStatus.complete && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="font-bold">
                Attention: Store Settings Contact Details Incomplete
              </p>
              <p className="mt-1 text-xs leading-5">
                {settingsStatus.warningMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>{supportWarning}</p>
      </div>

      {/* History Subview */}
      {history && (
        <DataTable
          rows={[...store.supportVerifications]

            .sort((a, b) => b.date.localeCompare(a.date))

            .map((item) => ({
              ...item,

              categoryLabel: categoryName(item.category),

              when: new Date(item.date).toLocaleString("en-IN"),
            }))}
          columns={[
            { key: "when", label: "Date" },

            { key: "brand", label: "Brand" },

            { key: "categoryLabel", label: "Category" },

            { key: "verifiedBy", label: "Verified by" },

            {
              key: "sourceUrl",

              label: "Source",

              render: (row) => (
                <a
                  href={String(row.sourceUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  {String(row.sourceUrl)}
                </a>
              ),
            },

            { key: "changes", label: "Changes" },
          ]}
        />
      )}

      {/* Service Centres Subview */}
      {isCentres && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search
                size={15}
                className="absolute left-3 top-3 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search centre, city, PIN, brand..."
                className={`${fieldClass} pl-9`}
              />
            </div>
            <Button
              className="ml-auto"
              onClick={() => setEditingCentre(emptyServiceCentre())}
            >
              <Plus size={14} /> Add authorized service centre
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {[
                    "Centre Name",

                    "Brand & Category",

                    "Location & PIN",

                    "Phone & Contact",

                    "Authorization",

                    "Verified",

                    "",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {centreRows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-border align-top"
                  >
                    <td className="px-4 py-3 font-semibold max-w-[200px]">
                      <div>{item.name}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                        {item.address}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{item.brandName}</span>
                      <div className="text-[10px] text-muted-foreground">
                        {categoryName(item.category)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        {item.city}, {item.state}
                      </div>
                      <div className="font-mono text-primary font-semibold">
                        PIN: {item.pincode}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.phone || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.email || ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.isAuthorized ? (
                        <Badge tone="green">Authorized</Badge>
                      ) : (
                        <Badge tone="gray">Partner</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.verifiedAt ? (
                        <span className="text-emerald-700 font-semibold">
                          Verified
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        className="mr-3"
                        onClick={() => setEditingCentre(item)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="text-red-600"
                        onClick={() => setRemovingCentre(item)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!centreRows.length && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No service centres match your query.
              </p>
            )}
          </div>
        </>
      )}

      {/* Main Brand Support Subview */}
      {!history && !isCentres && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search
                size={15}
                className="absolute left-3 top-3 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search brand, phone, URL..."
                className={`${fieldClass} pl-9`}
              />
            </div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={`${fieldClass} max-w-[180px]`}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Disabled</option>
              <option value="published">Published</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
            <Button
              className="ml-auto"
              onClick={() =>
                setEditing(emptySupport(view === "all" ? "" : view))
              }
            >
              <Plus size={14} /> Add brand support
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {[
                    "Brand",

                    "Category",

                    "Phones (Warranty / Care)",

                    "Official Portals",

                    "Verification",

                    "Public",

                    "Active",

                    "",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-border align-top"
                  >
                    <td className="px-4 py-3 font-semibold">
                      {item.brand}
                      {item.popular && (
                        <span className="ml-2">
                          <Badge tone="blue">Popular</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{categoryName(item.category)}</td>
                    <td className="px-4 py-3">
                      <div>
                        Warranty:{" "}
                        <span className="font-semibold">
                          {item.warrantyPhone || "—"}
                        </span>
                      </div>
                      <div>Care: {item.customerCarePhone || "—"}</div>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      {[
                        item.supportUrl,

                        item.warrantyUrl,

                        item.serviceLocatorUrl,
                      ]

                        .filter(Boolean)

                        .map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-primary underline"
                          >
                            {url}
                          </a>
                        ))}
                    </td>
                    <td className="px-4 py-3">
                      {item.lastVerifiedAt ? (
                        <>
                          <Badge tone="green">Verified</Badge>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {new Date(item.lastVerifiedAt).toLocaleDateString(
                              "en-IN",
                            )}{" "}
                            · {item.verifiedBy}
                          </div>
                        </>
                      ) : (
                        <Badge tone="amber">Unverified</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.isPublished ? (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Published
                        </span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${
                          item.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                        onClick={() => {
                          update(item.id, { active: !item.active })

                          store.log(
                            `Brand support ${
                              item.active ? "disabled" : "enabled"
                            }: ${item.brand} (${item.category})`,
                          )

                          store.notify(
                            item.active ? "Record disabled" : "Record enabled",
                          )
                        }}
                      >
                        {item.active ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        className="mr-3 text-primary font-semibold"
                        onClick={() => setVerifying(item)}
                      >
                        Mark verified
                      </button>
                      <button className="mr-3" onClick={() => setEditing(item)}>
                        <Pencil size={13} />
                      </button>
                      <button
                        className="text-red-600"
                        onClick={() => setRemoving(item)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No support records match.
              </p>
            )}
          </div>
          {view === "all" && <SupportCategories />}
        </>
      )}

      {/* Modals */}
      <SupportEditor record={editing} onClose={() => setEditing(null)} />
      <VerifyModal record={verifying} onClose={() => setVerifying(null)} />
      <ServiceCentreEditor
        record={editingCentre}
        onClose={() => setEditingCentre(null)}
      />

      {/* Remove Brand Support Modal */}
      <Modal
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete support record?"
        description={
          removing
            ? `${removing.brand} · ${categoryName(removing.category)}`
            : ""
        }
        size="max-w-md"
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!removing) return

              store.set((state) => ({
                brandSupport: state.brandSupport.filter(
                  (item) => item.id !== removing.id,
                ),
              }))

              store.log(
                `Brand support deleted: ${removing.brand} (${removing.category})`,
              )

              store.notify("Support record deleted")

              setRemoving(null)
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Remove Service Centre Modal */}
      <Modal
        open={Boolean(removingCentre)}
        onOpenChange={(open) => !open && setRemovingCentre(null)}
        title="Delete authorized service centre?"
        description={
          removingCentre
            ? `${removingCentre.name} (${removingCentre.city})`
            : ""
        }
        size="max-w-md"
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRemovingCentre(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!removingCentre) return

              store.set((state) => ({
                serviceCentres: state.serviceCentres.filter(
                  (item) => item.id !== removingCentre.id,
                ),
              }))

              store.log(`Service centre deleted: ${removingCentre.name}`)

              store.notify("Service centre deleted")

              setRemovingCentre(null)
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
  )
}

const appendVerification = (
  record: BrandSupport,

  verifiedBy: string,

  sourceUrl: string,

  changes: string,
) => ({
  id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,

  supportId: record.id,

  brand: record.brand,

  category: record.category,

  verifiedBy,

  sourceUrl,

  changes,

  date: new Date().toISOString(),
})

function SupportEditor({
  record,

  onClose,
}: {
  record: BrandSupport | null

  onClose: () => void
}) {
  const store = useStore()

  const [form, setForm] = useState<BrandSupport>(emptySupport())

  const [reverify, setReverify] = useState(false)

  const [error, setError] = useState("")

  useEffect(() => {
    if (record) {
      setForm(record)

      setReverify(false)

      setError("")
    }
  }, [record])

  const field = (key: keyof BrandSupport, label: string, placeholder = "") => (
    <Field label={label}>
      <input
        value={String(form[key] || "")}
        placeholder={placeholder}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        className={fieldClass}
      />
    </Field>
  )

  const save = () => {
    const brand = form.brand.trim()

    if (!brand || !form.category)
      return setError("Brand and category are required.")

    for (const key of [
      "supportUrl",

      "warrantyUrl",

      "serviceLocatorUrl",

      "sourceUrl",
    ] as const)
      if (badUrl(form[key])) return setError(`${key} must start with https://`)

    if (
      store.brandSupport.some(
        (item) =>
          item.id !== form.id &&
          item.category === form.category &&
          item.brand.toLowerCase() === brand.toLowerCase(),
      )
    )
      return setError("This brand already has a record for this category.")

    if (form.isPublished && !form.sourceUrl.trim()) {
      return setError("Publishing requires an official source URL (https://).")
    }

    if (form.isPublished && !form.lastVerifiedAt && !reverify) {
      return setError(
        "Cannot publish unverified records. Please confirm verification against the official source.",
      )
    }

    if (reverify && (!form.sourceUrl.trim() || !form.verifiedBy.trim()))
      return setError("Re-verifying requires a source URL and verifier name.")

    const now = new Date().toISOString()

    const changed = record?.id
      ? contactKeys.filter(
          (key) => (record[key] || "").trim() !== (form[key] || "").trim(),
        )
      : []

    let next: BrandSupport = {
      ...form,

      brand,

      updatedAt: now,

      region: "India",
    }

    if (!record?.id) {
      next = {
        ...next,

        id: `${form.category}-${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,

        createdAt: now,
      }
    }

    if (reverify) {
      next = {
        ...next,

        lastVerifiedAt: now,

        verificationStatus: "verified",
      }
    } else if (!record?.id || changed.length) {
      next = {
        ...next,

        lastVerifiedAt: "",

        verifiedBy: "",

        verificationStatus: "pending_verification",

        isPublished: false, // unpublish until verified
      }
    }

    store.set((state) => ({
      brandSupport: record?.id
        ? state.brandSupport.map((item) => (item.id === next.id ? next : item))
        : [...state.brandSupport, next],

      supportVerifications: reverify
        ? [
            ...state.supportVerifications,

            appendVerification(
              next,

              next.verifiedBy.trim(),

              next.sourceUrl.trim(),

              changed.length
                ? `Updated: ${changed.join(", ")}`
                : "Re-verified on save",
            ),
          ]
        : state.supportVerifications,
    }))

    store.log(
      `Brand support ${
        record?.id ? "updated" : "added"
      }: ${brand} (${form.category})`,
    )

    store.notify(
      changed.length && !reverify
        ? "Saved — contact details changed, marked Unverified and Draft"
        : "Support record saved",
    )

    onClose()
  }

  return (
    <Modal
      open={Boolean(record)}
      onOpenChange={(open) => !open && onClose()}
      title={record?.id ? "Edit brand support" : "Add brand support"}
      description={supportWarning}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {field("brand", "Brand (e.g. HP, Apple)")}
        <Field label="Category">
          <select
            value={form.category}
            onChange={(event) =>
              setForm({ ...form, category: event.target.value })
            }
            className={fieldClass}
          >
            <option value="">Select category</option>
            {store.supportCategories.map((item: SupportCategory) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </Field>
        {field("warrantyPhone", "Official warranty support phone")}
        {field("customerCarePhone", "General customer care phone")}
        {field("supportUrl", "Official support portal URL", "https://")}
        {field("warrantyUrl", "Warranty verification URL", "https://")}
        {field("serviceLocatorUrl", "Service centre locator URL", "https://")}
        {field("email", "Official support email")}
        {field("sourceUrl", "Official source verification URL", "https://")}
        {field("verifiedBy", "Verified by")}

        <div className="flex flex-col justify-end gap-2 text-xs md:col-span-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isPublished ?? false}
              onChange={(event) =>
                setForm({ ...form, isPublished: event.target.checked })
              }
            />{" "}
            <strong>Published on Storefront</strong> (Requires verified source
            URL)
          </label>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.popular}
                onChange={(event) =>
                  setForm({ ...form, popular: event.target.checked })
                }
              />{" "}
              Popular brand
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) =>
                  setForm({ ...form, active: event.target.checked })
                }
              />{" "}
              Active
            </label>
          </div>
        </div>

        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              className={`${fieldClass} min-h-20`}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-xs md:col-span-2 rounded-lg bg-blue-50 p-3 text-blue-900">
          <input
            type="checkbox"
            checked={reverify}
            onChange={(event) => setReverify(event.target.checked)}
          />
          I have confirmed these details against the official manufacturer
          source and authorize publication
        </label>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600 font-semibold">{error}</p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Save Support Record</Button>
      </div>
    </Modal>
  )
}

function ServiceCentreEditor({
  record,

  onClose,
}: {
  record: ServiceCentre | null

  onClose: () => void
}) {
  const store = useStore()

  const [form, setForm] = useState<ServiceCentre>(emptyServiceCentre())

  const [servicesInput, setServicesInput] = useState("")

  const [error, setError] = useState("")

  useEffect(() => {
    if (record) {
      setForm(record)

      setServicesInput((record.servicesOffered || []).join(", "))

      setError("")
    }
  }, [record])

  const save = () => {
    const name = form.name.trim()

    const brandName = form.brandName.trim()

    const pincode = form.pincode.trim()

    const sourceUrl = form.sourceUrl.trim()

    if (!name || !brandName || !form.category) {
      return setError("Centre name, brand name, and category are required.")
    }

    if (!validateIndianPincode(pincode)) {
      return setError(
        "PIN code must be a valid 6-digit Indian PIN code (e.g. 686691).",
      )
    }

    if (!validateHttpsUrl(sourceUrl)) {
      return setError(
        "Official source URL is mandatory and must start with https://.",
      )
    }

    const services = servicesInput

      .split(",")

      .map((s) => s.trim())

      .filter(Boolean)

    const next: ServiceCentre = {
      ...form,

      name,

      brandName,

      pincode,

      sourceUrl,

      servicesOffered: services,

      id:
        form.id ||
        `sc-${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,

      verifiedAt: form.verifiedAt || new Date().toISOString(),
    }

    store.set((state) => ({
      serviceCentres: record?.id
        ? state.serviceCentres.map((item) =>
            item.id === next.id ? next : item,
          )
        : [...state.serviceCentres, next],
    }))

    store.log(`Service centre ${record?.id ? "updated" : "added"}: ${name}`)

    store.notify("Service centre saved")

    onClose()
  }

  return (
    <Modal
      open={Boolean(record)}
      onOpenChange={(open) => !open && onClose()}
      title={
        record?.id
          ? "Edit Authorized Service Centre"
          : "Add Authorized Service Centre"
      }
      description="Record verified manufacturer-authorized service delivery locations in Kerala. Never fabricate details."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Centre Name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. HP Authorized Service Centre (F1 Info Solutions)"
            className={fieldClass}
          />
        </Field>
        <Field label="Brand Name">
          <input
            value={form.brandName}
            onChange={(e) => setForm({ ...form, brandName: e.target.value })}
            placeholder="e.g. HP, Apple, Samsung"
            className={fieldClass}
          />
        </Field>
        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={fieldClass}
          >
            {store.supportCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="6-Digit Indian PIN Code">
          <input
            value={form.pincode}
            maxLength={6}
            onChange={(e) => setForm({ ...form, pincode: e.target.value })}
            placeholder="682035"
            className={fieldClass}
          />
        </Field>
        <Field label="City">
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Kochi, Muvattupuzha, etc."
            className={fieldClass}
          />
        </Field>
        <Field label="State">
          <input
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            className={fieldClass}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Full Address">
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Building name, street, landmarks"
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="Phone">
          <input
            value={form.phone || ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+91-484-XXXXXXX"
            className={fieldClass}
          />
        </Field>
        <Field label="Email">
          <input
            value={form.email || ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="service@example.com"
            className={fieldClass}
          />
        </Field>
        <Field label="Latitude (Optional, for distance)">
          <input
            type="number"
            step="0.0001"
            value={form.latitude ?? ""}
            onChange={(e) =>
              setForm({
                ...form,

                latitude: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="9.9816"
            className={fieldClass}
          />
        </Field>
        <Field label="Longitude (Optional, for distance)">
          <input
            type="number"
            step="0.0001"
            value={form.longitude ?? ""}
            onChange={(e) =>
              setForm({
                ...form,

                longitude: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="76.2845"
            className={fieldClass}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Services Offered (Comma-separated)">
            <input
              value={servicesInput}
              onChange={(e) => setServicesInput(e.target.value)}
              placeholder="Screen Replacement, Motherboard Repair, Battery Replacement"
              className={fieldClass}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Official Source Verification URL (Mandatory)">
            <input
              value={form.sourceUrl}
              onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
              placeholder="https://support.hp.com/in-en/service-center"
              className={fieldClass}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Authorization Evidence Note">
            <input
              value={form.authorizationEvidence || ""}
              onChange={(e) =>
                setForm({ ...form, authorizationEvidence: e.target.value })
              }
              placeholder="e.g. Official HP India Service Delivery Partner Network"
              className={fieldClass}
            />
          </Field>
        </div>
        <div className="flex items-center gap-4 text-xs md:col-span-2">
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={form.isAuthorized}
              onChange={(e) =>
                setForm({ ...form, isAuthorized: e.target.checked })
              }
            />
            Official Manufacturer-Authorized Centre
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600 font-semibold">{error}</p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Save Service Centre</Button>
      </div>
    </Modal>
  )
}

function VerifyModal({
  record,

  onClose,
}: {
  record: BrandSupport | null

  onClose: () => void
}) {
  const store = useStore()

  const [sourceUrl, setSourceUrl] = useState("")

  const [verifiedBy, setVerifiedBy] = useState("")

  const [error, setError] = useState("")

  useEffect(() => {
    if (record) {
      setSourceUrl(record.sourceUrl)

      setVerifiedBy(record.verifiedBy || "Store Administrator")

      setError("")
    }
  }, [record])

  return (
    <Modal
      open={Boolean(record)}
      onOpenChange={(open) => !open && onClose()}
      title="Mark as verified & publish"
      description={
        record
          ? `${record.brand} · ${record.category}. Confirm details against the manufacturer's official website.`
          : ""
      }
      size="max-w-lg"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()

          if (!record) return

          if (!sourceUrl.trim() || badUrl(sourceUrl))
            return setError("Enter the official source URL (https://).")

          if (!verifiedBy.trim()) return setError("Enter the verifier name.")

          const now = new Date().toISOString()

          const next: BrandSupport = {
            ...record,

            sourceUrl: sourceUrl.trim(),

            verifiedBy: verifiedBy.trim(),

            lastVerifiedAt: now,

            verificationStatus: "verified",

            isPublished: true,

            updatedAt: now,
          }

          store.set((state) => ({
            brandSupport: state.brandSupport.map((item) =>
              item.id === record.id ? next : item,
            ),

            supportVerifications: [
              ...state.supportVerifications,

              appendVerification(
                next,

                next.verifiedBy,

                next.sourceUrl,

                "Marked verified & published",
              ),
            ],
          }))

          store.log(
            `Brand support verified: ${record.brand} (${record.category})`,
          )

          store.notify("Marked as verified and published on storefront")

          onClose()
        }}
      >
        <Field label="Official source URL (https://)">
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://"
            className={fieldClass}
          />
        </Field>
        <Field label="Verified by">
          <input
            value={verifiedBy}
            onChange={(event) => setVerifiedBy(event.target.value)}
            className={fieldClass}
          />
        </Field>
        {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <CheckCircle2 size={14} /> Mark verified & publish
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function SupportCategories() {
  const store = useStore()

  const [name, setName] = useState("")

  const [icon, setIcon] = useState("monitor")

  const [mapped, setMapped] = useState("")

  return (
    <div className="mt-8">
      <Panel
        title="Support categories"
        description="Add categories (e.g. TV, Monitor) to extend the support directory. Map them to store catalog categories for order-aware lookup."
      >
        <form
          className="mb-4 flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault()

            const value = name.trim()

            if (!value) return

            const id = value.toLowerCase().replace(/[^a-z0-9]+/g, "-")

            if (store.supportCategories.some((item) => item.id === id)) {
              store.notify("This category already exists")

              return
            }

            const catalogCategories = mapped

              .split(",")

              .map((item) => item.trim())

              .filter(Boolean)

            store.set((state) => ({
              supportCategories: [
                ...state.supportCategories,

                { id, name: value, icon, catalogCategories, active: true },
              ],
            }))

            store.log(`Support category added: ${value}`)

            store.notify("Category added")

            setName("")

            setMapped("")
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Category name"
            className={`${fieldClass} max-w-[180px]`}
          />
          <select
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            className={`${fieldClass} max-w-[150px]`}
          >
            {[
              "laptop",

              "smartphone",

              "printer",

              "monitor",

              "tv",

              "camera",

              "router",

              "gamepad",

              "cpu",
            ].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={mapped}
            onChange={(event) => setMapped(event.target.value)}
            placeholder="Catalog categories (comma separated)"
            className={`${fieldClass} max-w-xs`}
          />
          <Button type="submit">
            <Plus size={14} /> Add
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {store.supportCategories.map((item) => (
            <button
              key={item.id}
              title="Toggle active"
              onClick={() =>
                store.set((state) => ({
                  supportCategories: state.supportCategories.map((cat) =>
                    cat.id === item.id ? { ...cat, active: !cat.active } : cat,
                  ),
                }))
              }
            >
              <Badge tone={item.active ? "green" : "gray"}>
                {item.name} ·{" "}
                {
                  store.brandSupport.filter(
                    (record) => record.category === item.id,
                  ).length
                }{" "}
                · {item.active ? "active" : "inactive"}
              </Badge>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}

const buildPurposes: BuildPurpose[] = [
  "gaming",

  "creation",

  "work",

  "professional",

  "general",
]

const tradeoffOptions = [
  "Value-focused",

  "Balanced",

  "Higher-performance",

  "Upgrade-friendly",
]

const templatePartTypes = [
  "CPU",

  "Motherboard",

  "RAM",

  "GPU",

  "Storage",

  "PSU",

  "Cabinet",

  "Cooler",
]

const emptyTemplate = (): BuildTemplate => ({
  id: "",

  name: "",

  purpose: "gaming",

  budgetMin: 50000,

  budgetMax: 80000,

  resolution: "1080p",

  usage: "",

  tradeoff: "Balanced",

  parts: {},

  highlights: [],

  active: true,
})

function BuildTemplatesAdmin() {
  const store = useStore()

  const [purpose, setPurpose] = useState<"all" | BuildPurpose>("all")

  const [draft, setDraft] = useState<BuildTemplate | null>(null)

  const [highlights, setHighlights] = useState("")

  const [removeId, setRemoveId] = useState("")

  const [error, setError] = useState("")

  const [charge, setCharge] = useState(String(store.assemblyCharge))

  useEffect(
    () => setCharge(String(store.assemblyCharge)),

    [store.assemblyCharge],
  )

  const estimate = (parts: Record<string, string>) =>
    Object.entries(parts).reduce((total, [type, id]) => {
      const option = (store.componentCatalog[type] || []).find(
        (item) => item.id === id,
      )

      return total + (option?.price || 0)
    }, 0)

  const templates = store.buildTemplates.filter(
    (item) => purpose === "all" || item.purpose === purpose,
  )

  const toRemove = store.buildTemplates.find((item) => item.id === removeId)

  const openEditor = (template: BuildTemplate) => {
    setDraft({ ...template, parts: { ...template.parts } })

    setHighlights(template.highlights.join("\n"))

    setError("")
  }

  const save = () => {
    if (!draft) return

    if (!draft.name.trim()) return setError("Template name is required.")

    if (draft.budgetMin <= 0 || draft.budgetMax < draft.budgetMin)
      return setError(
        "Budget maximum must be at least the minimum, and both above zero.",
      )

    const missing = templatePartTypes.filter((type) => !draft.parts[type])

    if (missing.length)
      return setError(`Select parts for: ${missing.join(", ")}`)

    const record: BuildTemplate = {
      ...draft,

      name: draft.name.trim(),

      highlights: highlights

        .split("\n")

        .map((line) => line.trim())

        .filter(Boolean),
    }

    const isNew = !record.id

    if (isNew) record.id = `tpl-${slug(record.name)}-${Date.now().toString(36)}`

    store.set((previous) => ({
      buildTemplates: isNew
        ? [...previous.buildTemplates, record]
        : previous.buildTemplates.map((item) =>
            item.id === record.id ? record : item,
          ),
    }))

    store.log(`Build template ${isNew ? "created" : "updated"}: ${record.name}`)

    store.notify(isNew ? "Build template added" : "Build template updated")

    setDraft(null)
  }

  return (
    <>
      <p className="mb-5 max-w-2xl text-xs leading-6 text-muted-foreground">
        Templates power Smart PC Builder recommendations. Estimated price is
        computed from current component prices.
      </p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {(["all", ...buildPurposes] as const).map((item) => (
            <button
              key={item}
              onClick={() => setPurpose(item)}
              className={`rounded-full border px-3 py-1.5 text-xs capitalize ${
                purpose === item
                  ? "border-primary bg-primary text-white"
                  : "border-border text-muted-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <Field label="Assembly charge (₹, 0 = free)">
            <input
              type="number"
              min={0}
              value={charge}
              onChange={(event) => setCharge(event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => {
              const value = Number(charge)

              if (!Number.isFinite(value) || value < 0) {
                store.notify("Assembly charge must be zero or more")

                return
              }

              store.set({ assemblyCharge: Math.round(value) })

              store.log(
                `Assembly charge set to ${value ? money(value) : "free"}`,
              )

              store.notify("Assembly charge updated")
            }}
          >
            Save charge
          </Button>
          <Button onClick={() => openEditor(emptyTemplate())}>
            <Plus className="h-4 w-4" /> Add template
          </Button>
        </div>
      </div>
      <DataTable
        rows={templates.map((item) => ({
          ...item,

          budget: item.budgetMin,

          estimate: estimate(item.parts),
        }))}
        columns={[
          { key: "name", label: "Name" },

          {
            key: "purpose",

            label: "Purpose",

            render: (row) => (
              <span className="capitalize">{String(row.purpose)}</span>
            ),
          },

          {
            key: "budget",

            label: "Budget",

            render: (row) =>
              `${money(Number(row.budgetMin))} – ${money(Number(row.budgetMax))}`,
          },

          { key: "resolution", label: "Resolution" },

          { key: "tradeoff", label: "Trade-off" },

          {
            key: "estimate",

            label: "Est. price",

            render: (row) => money(Number(row.estimate)),
          },

          {
            key: "active",

            label: "Status",

            render: (row) => (
              <button
                onClick={() => {
                  store.set((previous) => ({
                    buildTemplates: previous.buildTemplates.map((item) =>
                      item.id === row.id
                        ? { ...item, active: !item.active }
                        : item,
                    ),
                  }))

                  store.log(`Build template toggled: ${String(row.name)}`)

                  store.notify("Template status updated")
                }}
              >
                <Badge tone={row.active ? "green" : "gray"}>
                  {row.active ? "Active" : "Inactive"}
                </Badge>
              </button>
            ),
          },
        ]}
        onView={(row) => {
          const found = store.buildTemplates.find((item) => item.id === row.id)

          if (found) openEditor(found)
        }}
        actions={(row) => {
          const found = store.buildTemplates.find((item) => item.id === row.id)

          return (
            <div className="flex gap-3">
              <button
                className="text-primary"
                onClick={() => found && openEditor(found)}
              >
                Edit
              </button>
              <button
                className="text-primary"
                onClick={() => {
                  if (!found) return

                  const copy: BuildTemplate = {
                    ...found,

                    parts: { ...found.parts },

                    highlights: [...found.highlights],

                    id: `tpl-${slug(found.name)}-${Date.now().toString(36)}`,

                    name: `${found.name} (copy)`,

                    active: false,
                  }

                  store.set((previous) => ({
                    buildTemplates: [...previous.buildTemplates, copy],
                  }))

                  store.log(`Build template duplicated: ${found.name}`)

                  store.notify("Template duplicated as inactive copy")
                }}
              >
                Duplicate
              </button>
              <button
                className="text-red-600"
                onClick={() => setRemoveId(String(row.id))}
              >
                Delete
              </button>
            </div>
          )
        }}
      />
      <Modal
        open={Boolean(draft)}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.id ? "Edit build template" : "Add build template"}
        size="max-w-3xl"
      >
        {draft && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  className={fieldClass}
                />
              </Field>
              <Field label="Purpose">
                <select
                  value={draft.purpose}
                  onChange={(event) =>
                    setDraft({
                      ...draft,

                      purpose: event.target.value as BuildPurpose,
                    })
                  }
                  className={fieldClass}
                >
                  {buildPurposes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Budget minimum (₹)">
                <input
                  type="number"
                  min={0}
                  value={draft.budgetMin}
                  onChange={(event) =>
                    setDraft({
                      ...draft,

                      budgetMin: Number(event.target.value),
                    })
                  }
                  className={fieldClass}
                />
              </Field>
              <Field label="Budget maximum (₹)">
                <input
                  type="number"
                  min={0}
                  value={draft.budgetMax}
                  onChange={(event) =>
                    setDraft({
                      ...draft,

                      budgetMax: Number(event.target.value),
                    })
                  }
                  className={fieldClass}
                />
              </Field>
              <Field label="Resolution">
                <input
                  value={draft.resolution}
                  onChange={(event) =>
                    setDraft({ ...draft, resolution: event.target.value })
                  }
                  className={fieldClass}
                />
              </Field>
              <Field label="Trade-off">
                <select
                  value={draft.tradeoff}
                  onChange={(event) =>
                    setDraft({ ...draft, tradeoff: event.target.value })
                  }
                  className={fieldClass}
                >
                  {[...new Set([...tradeoffOptions, draft.tradeoff])].map(
                    (item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ),
                  )}
                </select>
              </Field>
            </div>
            <Field label="Usage">
              <input
                value={draft.usage}
                onChange={(event) =>
                  setDraft({ ...draft, usage: event.target.value })
                }
                className={fieldClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {templatePartTypes.map((type) => (
                <Field key={type} label={type}>
                  <select
                    value={draft.parts[type] || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,

                        parts: { ...draft.parts, [type]: event.target.value },
                      })
                    }
                    className={fieldClass}
                  >
                    <option value="">Select {type}</option>
                    {(store.componentCatalog[type] || []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {money(item.price)}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <Field label="Highlights (one per line)">
              <textarea
                rows={4}
                value={highlights}
                onChange={(event) => setHighlights(event.target.value)}
                className={fieldClass}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  setDraft({ ...draft, active: event.target.checked })
                }
              />
              Active (shown to customers)
            </label>
            <p className="text-sm">
              Estimated price: <strong>{money(estimate(draft.parts))}</strong>
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={save}>Save template</Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(toRemove)}
        onOpenChange={(open) => !open && setRemoveId("")}
        title="Delete build template?"
        description={
          toRemove
            ? `"${toRemove.name}" will no longer be recommended.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRemoveId("")}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!toRemove) return

              store.set((previous) => ({
                buildTemplates: previous.buildTemplates.filter(
                  (item) => item.id !== toRemove.id,
                ),
              }))

              store.log(`Build template deleted: ${toRemove.name}`)

              store.notify("Build template deleted")

              setRemoveId("")
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
  )
}
