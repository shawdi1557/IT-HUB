import { useMemo, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router"
import {
  Activity,
  Clock,
  Eye,
  FileText,
  Globe,
  Info,
  LogIn,
  LogOut,
  MapPin,
  Monitor,
  MousePointerClick,
  Package,
  Pencil,
  Play,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Square,
  Users,
  Wrench,
  Cpu,
  Save,
  X,
  Download,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import WhatsAppIcon from "../components/WhatsAppIcon"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { useStore } from "../app/store"
import {
  useAnalytics,
  updateAnalyticsSettings,
  deleteVisitorData,
  anonymizeVisitorData,
  loadDemoData,
  clearDemoData,
  maskIp,
  sessionDuration,
  type EventType,
  type VisitorEvent,
  type VisitorSession,
  type AnalyticsSettings,
} from "../lib/analytics"
import {
  Badge,
  Button,
  Empty,
  Modal,
  Select,
  fieldClass,
} from "../components/ui"

// ── Helpers ──
const DAY = 86400000
const UNAVAILABLE = "Location unavailable"
const fmtDuration = (ms: number) => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
const pct = (part: number, total: number) =>
  total ? `${((part / total) * 100).toFixed(1)}%` : "—"
const countBy = <T,>(items: T[], key: (item: T) => string | undefined) => {
  const map = new Map<string, number>()
  items.forEach((item) => {
    const k = key(item)
    if (k) map.set(k, (map.get(k) || 0) + 1)
  })
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}
export const locationLabel = (session?: VisitorSession) => {
  if (
    !session ||
    session.locationConfidence === "unavailable" ||
    !session.country
  )
    return UNAVAILABLE
  return [session.city, session.region, session.country]
    .filter(Boolean)
    .join(", ")
}
const isKerala = (s: VisitorSession) =>
  s.country === "India" && s.region === "Kerala"
const bucketOf = (s: VisitorSession) =>
  !s.country || s.locationConfidence === "unavailable"
    ? "Unavailable"
    : isKerala(s)
      ? "Kerala"
      : s.country === "India"
        ? "Other India"
        : "International"

const eventStyle: Record<EventType, {
  icon: LucideIcon
  tone: "blue" | "green" | "amber" | "red" | "gray"
}> = {
  "Session Started": { icon: Play, tone: "gray" },
  "Session Ended": { icon: Square, tone: "gray" },
  "Page Viewed": { icon: Eye, tone: "blue" },
  Login: { icon: LogIn, tone: "green" },
  Logout: { icon: LogOut, tone: "gray" },
  "Product Viewed": { icon: Package, tone: "blue" },
  "Product Added to Cart": { icon: ShoppingCart, tone: "green" },
  "Checkout Started": { icon: ShoppingBag, tone: "amber" },
  "Order Created": { icon: ShoppingBag, tone: "green" },
  "Service Booking Started": { icon: Wrench, tone: "amber" },
  "Service Request Created": { icon: Wrench, tone: "green" },
  "PC Builder Started": { icon: Cpu, tone: "blue" },
  "PC Build Saved": { icon: Save, tone: "green" },
  "Warranty Assistance Viewed": { icon: ShieldCheck, tone: "blue" },
  "Contact/WhatsApp Action": {
    icon: WhatsAppIcon as unknown as LucideIcon,
    tone: "green",
  },
  "Admin Login": { icon: LogIn, tone: "red" },
  "Admin Data Change": { icon: Pencil, tone: "red" },
}
function EventBadge({ type }: { type: EventType }) {
  const style = eventStyle[type] || { icon: Activity, tone: "gray" as const }
  const Icon = style.icon
  return (
    <Badge tone={style.tone}>
      <Icon size={11} /> {type}
    </Badge>
  )
}
function Hint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex cursor-help text-muted-foreground"
    >
      <Info size={12} />
    </span>
  )
}
const LOCATION_HINT =
  "Approximate location derived from the IP address. It is not the visitor's physical address and is separate from any address a customer provides at checkout."

function Card({
  title,
  children,
  action,
}: {
  title: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}
interface AnalyticsBarItem {
  name: string
  value: number
}

function Bars({
  rows,
  total,
  empty = "No data in this range.",
}: {
  rows: AnalyticsBarItem[]
  total?: number
  empty?: string
}) {
  const sum = total ?? rows.reduce((a, b) => a + b.value, 0)
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length)
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>
    )
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.name}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate font-medium">{row.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {row.value} · {pct(row.value, sum)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-[#1a4fd6]"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
function HBarChart({
  data,
  label,
}: {
  data: AnalyticsBarItem[]
  label: string
}) {
  if (!data.length)
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        No data in this range.
      </p>
    )
  return (
    <div
      className="w-full"
      style={{ height: Math.max(180, data.length * 34 + 30) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="#edf0f4" />
          <XAxis
            type="number"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#334155" }}
          />
          <Tooltip
            formatter={(value) => [value, label]}
            cursor={{ fill: "#f1f5f9" }}
          />
          <Bar
            dataKey="value"
            fill="#1a4fd6"
            radius={[0, 3, 3, 0]}
            barSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Date range (shared via URL so it persists across views) ──
const ranges = [
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom" },
]
const useRange = () => {
  const [params, setParams] = useSearchParams()
  const range = params.get("range") || "30"
  const today = new Date().toISOString().slice(0, 10)
  const from =
    params.get("from") ||
    new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10)
  const to = params.get("to") || today
  const [start, end] = useMemo(() => {
    if (range === "today") {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return [d.getTime(), Infinity]
    }
    if (range === "custom")
      return [
        new Date(`${from}T00:00:00`).getTime(),
        new Date(`${to}T23:59:59`).getTime(),
      ]
    return [Date.now() - Number(range) * DAY, Infinity]
  }, [range, from, to])
  const set = (next: Record<string, string>) => {
    const copy = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => copy.set(k, v))
    setParams(copy, { replace: true })
  }
  return { range, from, to, start, end, set }
}

// ── Main section ──
export default function VisitorAnalytics({
  view,
  sales,
}: {
  view: string
  sales: ReactNode
}) {
  const data = useAnalytics()
  const { range, from, to, start, end, set } = useRange()
  const sessions = useMemo(
    () =>
      data.sessions.filter((s) => {
        const t = new Date(s.firstSeen).getTime()
        return t >= start && t <= end
      }),
    [data.sessions, start, end],
  )
  const events = useMemo(
    () =>
      data.events.filter((e) => {
        const t = new Date(e.date).getTime()
        return t >= start && t <= end
      }),
    [data.events, start, end],
  )
  const hasDemo = sessions.some((s) => s.demo) || events.some((e) => e.demo)
  const anyDemo = data.sessions.some((s) => s.demo)
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white p-3 shadow-sm">
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Date range"
        >
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => set({ range: r.value })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                range === r.value
                  ? "bg-[#1a4fd6] text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => set({ from: e.target.value })}
              className={`${fieldClass} !h-8 !w-36 !py-1 text-xs`}
              aria-label="From date"
            />
            <span>to</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => set({ to: e.target.value })}
              className={`${fieldClass} !h-8 !w-36 !py-1 text-xs`}
              aria-label="To date"
            />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hasDemo && <Badge tone="amber">Demo data</Badge>}
          {!data.settings.enabled && (
            <Badge tone="red">Tracking disabled</Badge>
          )}
          {anyDemo ? (
            <Button variant="secondary" onClick={() => setConfirmClear(true)}>
              Clear demo data
            </Button>
          ) : (
            <Button variant="secondary" onClick={loadDemoData}>
              Load demo data
            </Button>
          )}
        </div>
      </div>
      {hasDemo && (
        <p className="-mt-3 mb-5 text-[11px] text-amber-700">
          This range includes generated demo records (labelled "Demo data").
          They are not real visitors — clear them before relying on these
          figures.
        </p>
      )}

      {view === "audit" ? (
        <AuditLogs
          sessions={sessions}
          events={events}
          settings={data.settings}
        />
      ) : !sessions.length ? (
        <>
          <Empty
            title="No visitor data for this range"
            description="Visitor analytics fill in automatically as people browse the storefront. Try a wider date range, or load clearly-labelled demo data to preview the dashboard."
          />
          {view === "overview" && <div className="mt-8">{sales}</div>}
        </>
      ) : (
        <>
          {sessions.length < 5 && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Insufficient data — only {sessions.length} session
              {sessions.length === 1 ? "" : "s"} in this range. Figures may not
              be representative.
            </p>
          )}
          {view === "overview" && (
            <Overview sessions={sessions} events={events} sales={sales} />
          )}
          {view === "locations" && <Locations sessions={sessions} />}
          {view === "traffic" && <Traffic sessions={sessions} />}
          {view === "devices" && <Devices sessions={sessions} />}
          {view === "pages" && <PagesProducts events={events} />}
        </>
      )}
      <Modal
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear demo data?"
        description="Removes every record flagged as demo. Real visitor records are kept."
        size="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmClear(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              clearDemoData()
              setConfirmClear(false)
            }}
          >
            Clear demo data
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function Kpi({
  label,
  value,
  note,
  hint,
}: {
  label: string
  value: ReactNode
  note?: string
  hint?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {label} {hint && <Hint text={hint} />}
      </p>
      <p
        className="mt-2 truncate text-xl font-bold"
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </p>
      {note && (
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  )
}

function Overview({
  sessions,
  events,
  sales,
}: {
  sessions: VisitorSession[]
  events: VisitorEvent[]
  sales: ReactNode
}) {
  const unique = new Set(sessions.map((s) => s.visitorId)).size
  const returningSessions = sessions.filter((s) => s.returning).length
  const newSessions = sessions.length - returningSessions
  const active = sessions.filter(
    (s) => Date.now() - new Date(s.lastSeen).getTime() < 5 * 60000,
  ).length
  const avg =
    sessions.reduce((a, s) => a + sessionDuration(s), 0) / sessions.length
  const pages = sessions.reduce((a, s) => a + s.pageViews, 0) / sessions.length
  const topLoc = countBy(
    sessions.filter((s) => s.city || s.region),
    (s) => s.city || s.region,
  )[0]
  const topLanding = countBy(sessions, (s) => s.landingPage.split("?")[0])[0]
  const actions = countBy(
    events.filter(
      (e) =>
        !["Page Viewed", "Session Started", "Session Ended"].includes(e.type),
    ),
    (e) => e.type,
  ).slice(0, 8)
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Total Visitors"
          value={sessions.length}
          note="Visits (sessions) in range"
        />
        <Kpi
          label="Unique Visitors"
          value={unique}
          hint="Counted by an anonymous browser-scoped ID, not by page views or IP."
        />
        <Kpi
          label="New Visitors"
          value={newSessions}
          note={pct(newSessions, sessions.length)}
        />
        <Kpi
          label="Returning Visitors"
          value={returningSessions}
          note={pct(returningSessions, sessions.length)}
        />
        <Kpi
          label="Active Visitors"
          value={active}
          note="Active in the last 5 minutes"
        />
        <Kpi
          label="Total Sessions"
          value={sessions.length}
          note="Ends after 30 min inactivity"
        />
        <Kpi label="Avg. Session Duration" value={fmtDuration(avg)} />
        <Kpi label="Pages / Session" value={pages.toFixed(1)} />
        <Kpi
          label="Top Location"
          value={topLoc?.name || "—"}
          note={
            topLoc
              ? `${topLoc.value} sessions · approximate`
              : "Location unavailable"
          }
          hint={LOCATION_HINT}
        />
        <Kpi
          label="Top Landing Page"
          value={topLanding?.name || "—"}
          note={topLanding ? `${topLanding.value} sessions` : undefined}
        />
      </div>
      <div className="mb-8 grid gap-5 lg:grid-cols-3">
        <Card title="Kerala vs India vs International">
          <RegionSummary sessions={sessions} />
        </Card>
        <Card title="Top actions">
          <Bars rows={actions} empty="No actions recorded yet." />
        </Card>
        <Card title="New vs returning">
          <Bars
            rows={[
              { name: "New", value: newSessions },
              { name: "Returning", value: returningSessions },
            ]}
          />
        </Card>
      </div>
      <h2 className="mb-4 text-lg font-bold">Sales & service performance</h2>
      {sales}
    </>
  )
}

function RegionSummary({ sessions }: { sessions: VisitorSession[] }) {
  const rows = ([
    "Kerala",
    "Other India",
    "International",
    "Unavailable",
  ] as const)
    .map((name) => ({
      name: name === "Unavailable" ? UNAVAILABLE : name,
      value: new Set(
        sessions.filter((s) => bucketOf(s) === name).map((s) => s.visitorId),
      ).size,
    }))
    .filter((r) => r.value)
  return <Bars rows={rows} />
}

type Mode = "city" | "state" | "country"
const keyFor = (mode: Mode) => (s: VisitorSession) =>
  s.locationConfidence === "unavailable" || !s.country
    ? UNAVAILABLE
    : mode === "city"
      ? s.city
        ? `${s.city}${s.region ? `, ${s.region}` : ""}`
        : `${s.region || s.country} (city unknown)`
      : mode === "state"
        ? s.region
          ? `${s.region}, ${s.country}`
          : `${s.country} (region unknown)`
        : s.country

function Locations({ sessions }: { sessions: VisitorSession[] }) {
  const [mode, setMode] = useState<Mode>("city")
  const totalVisitors = new Set(sessions.map((s) => s.visitorId)).size
  interface LocationAggRecord {
    visitors: Set<string>
    sessions: number
  }

  const rows = useMemo(() => {
    const map = new Map<string, LocationAggRecord>()
    sessions.forEach((s) => {
      const k = keyFor(mode)(s)
      const row = map.get(k) || { visitors: new Set(), sessions: 0 }
      row.visitors.add(s.visitorId)
      row.sessions++
      map.set(k, row)
    })
    return [...map.entries()]
      .map(([name, r]) => ({
        name,
        visitors: r.visitors.size,
        sessions: r.sessions,
      }))
      .sort((a, b) => b.visitors - a.visitors || b.sessions - a.sessions)
  }, [sessions, mode])
  const chart = rows
    .slice(0, 12)
    .map((r) => ({ name: r.name.split(",")[0], value: r.visitors }))
  return (
    <>
      <div className="mb-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card
          title={
            <>
              Visitors by Location <Hint text={LOCATION_HINT} />
            </>
          }
          action={
            <div
              className="flex rounded-md border border-border p-0.5"
              role="group"
              aria-label="Location level"
            >
              {(["city", "state", "country"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded px-3 py-1 text-xs font-semibold capitalize ${
                    mode === m
                      ? "bg-[#1a4fd6] text-white"
                      : "text-muted-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          }
        >
          <HBarChart data={chart} label="Visitors" />
        </Card>
        <Card title="Kerala vs Other India vs International">
          <RegionSummary sessions={sessions} />
          <p className="mt-4 text-[10px] leading-5 text-muted-foreground">
            Unique visitors. Locations are approximate and IP-derived.
          </p>
        </Card>
      </div>
      <Card
        title={
          <>
            Where are our visitors coming from?{" "}
            <Badge tone="gray">Approximate location</Badge>
          </>
        }
      >
        <GeoDistribution sessions={sessions} />
      </Card>
      <div className="mt-5">
        <Card title="Top Visitor Locations">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Rank</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3 text-right">Visitors</th>
                  <th className="py-2 pr-3 text-right">Sessions</th>
                  <th className="py-2 text-right">% of Visitors</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.name}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3 font-medium">
                      {r.name}
                      {r.name !== UNAVAILABLE && (
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          Approximate
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{r.visitors}</td>
                    <td className="py-2 pr-3 text-right">{r.sessions}</td>
                    <td className="py-2 text-right">
                      {pct(r.visitors, totalVisitors)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}

/** Proportional tiles grouped Kerala → Other India → International. No coordinates. */
function GeoDistribution({ sessions }: { sessions: VisitorSession[] }) {
  const groups = [
    { name: "Kerala", key: (s: VisitorSession) => s.city || "City unknown" },
    {
      name: "Other India",
      key: (s: VisitorSession) => s.region || "Region unknown",
    },
    { name: "International", key: (s: VisitorSession) => s.country },
    { name: "Unavailable", key: () => UNAVAILABLE },
  ]
  const total = sessions.length
  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {groups.map((g, i) => {
          const n = sessions.filter((s) => bucketOf(s) === g.name).length
          return n ? (
            <div
              key={g.name}
              title={`${g.name}: ${pct(n, total)}`}
              style={{ width: `${(n / total) * 100}%`, opacity: 1 - i * 0.22 }}
              className="bg-[#1a4fd6]"
            />
          ) : null
        })}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((g, i) => {
          const list = sessions.filter((s) => bucketOf(s) === g.name)
          const items = countBy(list, g.key).slice(0, 8)
          const max = Math.max(1, ...items.map((x) => x.value))
          return (
            <div key={g.name} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold">
                  {i < 2 ? (
                    <MapPin size={13} className="text-[#1a4fd6]" />
                  ) : (
                    <Globe size={13} className="text-[#1a4fd6]" />
                  )}
                  {g.name === "Unavailable" ? UNAVAILABLE : g.name}
                </span>
                <span className="text-muted-foreground">
                  {pct(list.length, total)}
                </span>
              </div>
              {items.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {items.map((x) => (
                    <span
                      key={x.name}
                      title={`${x.name}: ${x.value} sessions (approximate)`}
                      className="rounded px-2 py-1 text-[11px] font-medium"
                      style={{
                        background: `rgba(26,79,214,${0.08 + (x.value / max) * 0.5})`,
                        color: x.value / max > 0.6 ? "#fff" : "#1e3a8a",
                      }}
                    >
                      {x.name} · {x.value}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">No visits</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Traffic({ sessions }: { sessions: VisitorSession[] }) {
  const refs = countBy(sessions, (s) => s.referrer || "Direct")
  const landing = countBy(sessions, (s) => s.landingPage.split("?")[0]).slice(
    0,
    10,
  )
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Traffic by referrer">
        <HBarChart data={refs.slice(0, 10)} label="Sessions" />
      </Card>
      <Card title="Referrer breakdown">
        <Bars rows={refs} />
      </Card>
      <Card title="Top landing pages">
        <Bars rows={landing} />
      </Card>
    </div>
  )
}

function Devices({ sessions }: { sessions: VisitorSession[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card
        title={
          <>
            <Monitor size={14} /> Device type
          </>
        }
      >
        <Bars rows={countBy(sessions, (s) => s.device)} />
      </Card>
      <Card title="Operating system">
        <Bars rows={countBy(sessions, (s) => s.os)} />
      </Card>
      <Card title="Browser">
        <Bars rows={countBy(sessions, (s) => s.browser)} />
      </Card>
    </div>
  )
}

function PagesProducts({ events }: { events: VisitorEvent[] }) {
  const pages = countBy(
    events.filter((e) => e.type === "Page Viewed"),
    (e) => e.path.split("?")[0],
  ).slice(0, 12)
  const categories = countBy(
    events.filter((e) => e.type === "Page Viewed"),
    (e) =>
      new URLSearchParams(e.path.split("?")[1] || "").get("category") ||
      undefined,
  ).slice(0, 8)
  const products = countBy(
    events.filter((e) => e.type === "Product Viewed"),
    (e) => e.meta?.product,
  ).slice(0, 10)
  const carted = countBy(
    events.filter((e) => e.type === "Product Added to Cart"),
    (e) => e.meta?.product,
  ).slice(0, 10)
  const services = countBy(
    events.filter(
      (e) =>
        e.type === "Service Booking Started" ||
        e.type === "Service Request Created" ||
        (e.type === "Page Viewed" && e.path.startsWith("/services")),
    ),
    (e) =>
      e.meta?.service ||
      e.meta?.device ||
      new URLSearchParams(e.path.split("?")[1] || "").get("service") ||
      (e.type === "Page Viewed" ? e.path.split("?")[0] : e.type),
  ).slice(0, 10)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card
        title={
          <>
            <FileText size={14} /> Top pages
          </>
        }
      >
        <Bars rows={pages} />
      </Card>
      <Card title="Top product categories">
        <Bars rows={categories} empty="No category views yet." />
      </Card>
      <Card
        title={
          <>
            <Package size={14} /> Top products viewed
          </>
        }
      >
        <Bars rows={products} empty="No product views recorded yet." />
      </Card>
      <Card
        title={
          <>
            <ShoppingCart size={14} /> Most added to cart
          </>
        }
      >
        <Bars rows={carted} empty="No add-to-cart events yet." />
      </Card>
      <Card
        title={
          <>
            <Wrench size={14} /> Top services
          </>
        }
      >
        <Bars rows={services} empty="No service activity yet." />
      </Card>
    </div>
  )
}

// ── Audit logs ──
type SortKey = "newest" | "oldest" | "active" | "longest" | "pages"
function AuditLogs({
  sessions,
  events,
  settings,
}: {
  sessions: VisitorSession[]
  events: VisitorEvent[]
  settings: AnalyticsSettings
}) {
  const store = useStore()
  const all = useAnalytics()
  const [tab, setTab] = useState<"visitors" | "admin">("visitors")
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState({
    event: "",
    location: "",
    device: "",
    browser: "",
    visitor: "",
    auth: "",
  })
  const [sort, setSort] = useState<SortKey>("newest")
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState("")
  const sessionMap = useMemo(
    () => new Map(all.sessions.map((s) => [s.id, s])),
    [all.sessions],
  )
  const eventCount = useMemo(() => {
    const m = new Map<string, number>()
    all.events.forEach((e) => m.set(e.sessionId, (m.get(e.sessionId) || 0) + 1))
    return m
  }, [all.events])
  const options = (values: (string | undefined)[], all: string) => [
    { value: "", label: all },
    ...[...new Set(values.filter(Boolean) as string[])]
      .sort()
      .map((v) => ({ value: v, label: v })),
  ]
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = events.filter((e) => {
      const s = sessionMap.get(e.sessionId)
      if (filters.event && e.type !== filters.event) return false
      if (
        filters.location &&
        (s ? bucketOf(s) : "Unavailable") !== filters.location
      )
        return false
      if (filters.device && s?.device !== filters.device) return false
      if (filters.browser && s?.browser !== filters.browser) return false
      if (
        filters.visitor &&
        (filters.visitor === "returning") !== Boolean(s?.returning)
      )
        return false
      if (
        filters.auth &&
        (filters.auth === "auth") !== Boolean(e.userId || s?.userId)
      )
        return false
      if (!q) return true
      return [
        s?.ip,
        e.sessionId,
        s?.visitorId,
        e.userId,
        s?.userId,
        s?.city,
        s?.region,
        s?.country,
        e.type,
        e.path,
      ].some((v) => v?.toLowerCase().includes(q))
    })
    const by: Record<SortKey, (a: VisitorEvent, b: VisitorEvent) => number> = {
      newest: (a, b) => b.date.localeCompare(a.date),
      oldest: (a, b) => a.date.localeCompare(b.date),
      active: (a, b) =>
        (eventCount.get(b.sessionId) || 0) -
          (eventCount.get(a.sessionId) || 0) || b.date.localeCompare(a.date),
      longest: (a, b) => {
        const sa = sessionMap.get(a.sessionId),
          sb = sessionMap.get(b.sessionId)
        return (
          (sb ? sessionDuration(sb) : 0) - (sa ? sessionDuration(sa) : 0) ||
          b.date.localeCompare(a.date)
        )
      },
      pages: (a, b) =>
        (sessionMap.get(b.sessionId)?.pageViews || 0) -
          (sessionMap.get(a.sessionId)?.pageViews || 0) ||
        b.date.localeCompare(a.date),
    }
    return list.sort(by[sort])
  }, [events, sessionMap, eventCount, filters, query, sort])
  const PER = 25
  const pages = Math.max(1, Math.ceil(rows.length / PER))
  const current = Math.min(page, pages - 1)
  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters({ ...filters, [key]: value })
    setPage(0)
  }

  return (
    <>
      <div className="mb-4 flex gap-1 border-b border-border">
        {[
          ["visitors", `Visitor activity (${events.length})`],
          ["admin", `Admin activity (${store.audit.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as "visitors" | "admin")}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === key
                ? "border-[#1a4fd6] text-[#1a4fd6]"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "admin" ? (
        store.audit.length ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {store.audit.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {a.date}
                    </td>
                    <td className="px-4 py-2">{a.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No admin activity yet"
            description="Changes made in the admin workspace are recorded here."
          />
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-60 flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(0)
                }}
                placeholder="Search IP, session, user, city, state, country, event, page"
                className={`${fieldClass} pl-9`}
              />
            </label>
            <Select
              className="w-44"
              label="Sort"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={[
                { value: "newest", label: "Newest" },
                { value: "oldest", label: "Oldest" },
                { value: "active", label: "Most active" },
                { value: "longest", label: "Longest session" },
                { value: "pages", label: "Most pages viewed" },
              ]}
            />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Select
              label="Event"
              value={filters.event}
              onChange={(v) => setFilter("event", v)}
              options={options(
                events.map((e) => e.type),
                "All events",
              )}
            />
            <Select
              label="Location"
              value={filters.location}
              onChange={(v) => setFilter("location", v)}
              options={[
                { value: "", label: "All locations" },
                { value: "Kerala", label: "Kerala" },
                { value: "Other India", label: "Other India" },
                { value: "International", label: "International" },
                { value: "Unavailable", label: UNAVAILABLE },
              ]}
            />
            <Select
              label="Device"
              value={filters.device}
              onChange={(v) => setFilter("device", v)}
              options={options(
                sessions.map((s) => s.device),
                "All devices",
              )}
            />
            <Select
              label="Browser"
              value={filters.browser}
              onChange={(v) => setFilter("browser", v)}
              options={options(
                sessions.map((s) => s.browser),
                "All browsers",
              )}
            />
            <Select
              label="Visitor type"
              value={filters.visitor}
              onChange={(v) => setFilter("visitor", v)}
              options={[
                { value: "", label: "New & returning" },
                { value: "new", label: "New" },
                { value: "returning", label: "Returning" },
              ]}
            />
            <Select
              label="Authentication"
              value={filters.auth}
              onChange={(v) => setFilter("auth", v)}
              options={[
                { value: "", label: "All visitors" },
                { value: "auth", label: "Authenticated" },
                { value: "anon", label: "Anonymous" },
              ]}
            />
          </div>
          {!rows.length ? (
            <Empty
              title="No matching activity"
              description="Adjust the search, filters or date range."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-white">
              <table className="w-full min-w-[1080px] text-left text-xs">
                <thead className="border-b border-border bg-muted/50 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Visitor / User</th>
                    <th className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        IP{" "}
                        <Hint
                          text={
                            settings.maskIp
                              ? "IPs are masked per privacy settings."
                              : "Raw IP shown — enable masking in Settings → Privacy & Visitor Data."
                          }
                        />
                      </span>
                    </th>
                    <th className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        Approx. Location <Hint text={LOCATION_HINT} />
                      </span>
                    </th>
                    <th className="px-3 py-2">Device</th>
                    <th className="px-3 py-2">Browser</th>
                    <th className="px-3 py-2">Page</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(current * PER, current * PER + PER).map((e) => {
                    const s = sessionMap.get(e.sessionId)
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setOpenId(e.sessionId)}
                        className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {fmtTime(e.date)}
                        </td>
                        <td className="px-3 py-2">
                          <EventBadge type={e.type} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono">
                            {e.userId ||
                              s?.userId ||
                              `Anon · ${(s?.visitorId || "").slice(0, 6)}`}
                          </span>
                          {s?.returning && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (returning)
                            </span>
                          )}
                          {(e.demo || s?.demo) && (
                            <span className="ml-1 text-[10px] text-amber-700">
                              demo
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono">
                          {maskIp(s?.ip, settings.maskIp)}
                        </td>
                        <td className="px-3 py-2">{locationLabel(s)}</td>
                        <td className="px-3 py-2">{s?.device || "—"}</td>
                        <td className="px-3 py-2">{s?.browser || "—"}</td>
                        <td
                          className="max-w-48 truncate px-3 py-2"
                          title={e.path}
                        >
                          {e.path}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              e.status === "Success"
                                ? "green"
                                : e.status === "Warning"
                                  ? "amber"
                                  : "gray"
                            }
                          >
                            {e.status}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > PER && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {current * PER + 1}–{Math.min(rows.length, (current + 1) * PER)}{" "}
                of {rows.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
                  Previous
                </Button>
                <span className="self-center">
                  Page {current + 1} / {pages}
                </span>
                <Button
                  variant="secondary"
                  disabled={current >= pages - 1}
                  onClick={() => setPage(current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <SessionDrawer
        session={sessionMap.get(openId)}
        events={all.events}
        settings={settings}
        onClose={() => setOpenId("")}
      />
    </>
  )
}

function SessionDrawer({
  session,
  events,
  settings,
  onClose,
}: {
  session?: VisitorSession
  events: VisitorEvent[]
  settings: AnalyticsSettings
  onClose: () => void
}) {
  if (!session) return null
  const timeline = events
    .filter((e) => e.sessionId === session.id)
    .sort((a, b) => a.date.localeCompare(b.date))
  const describe = (e: VisitorEvent) =>
    e.type === "Page Viewed"
      ? `Viewed ${e.path}`
      : e.meta?.product
        ? `${e.type}: ${e.meta.product}`
        : e.meta?.action
          ? `${e.type}: ${e.meta.action}`
          : e.type
  const info: [string, ReactNode][] = [
    ["Session ID", <span className="break-all font-mono">{session.id}</span>],
    [
      "Visitor",
      session.userId || `Anonymous · ${session.visitorId.slice(0, 8)}`,
    ],
    [
      "Approximate location",
      <>
        {locationLabel(session)}{" "}
        {session.locationConfidence === "approximate" && (
          <Badge tone="gray">Approximate location</Badge>
        )}
      </>,
    ],
    [
      "IP address",
      <span className="font-mono">{maskIp(session.ip, settings.maskIp)}</span>,
    ],
    ["Network / ISP", session.isp || "—"],
    ["First seen", fmtTime(session.firstSeen)],
    ["Last seen", fmtTime(session.lastSeen)],
    ["Session duration", fmtDuration(sessionDuration(session))],
    ["Pages viewed", session.pageViews],
    ["Device", session.device],
    ["Browser", session.browser],
    ["Operating system", session.os],
    ["Referrer", session.referrer],
    ["Landing page", session.landingPage],
    ["Visitor type", session.returning ? "Returning" : "New"],
  ]
  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="Visitor session details"
    >
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        data-lenis-prevent
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="font-bold">Visitor session</h3>
            {session.demo && <Badge tone="amber">Demo data</Badge>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
            <Users size={13} /> Visitor overview
          </h4>
          <dl className="mb-3 divide-y divide-border/60 text-xs">
            {info.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-1.5">
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mb-5 rounded-md bg-muted px-3 py-2 text-[10px] leading-5 text-muted-foreground">
            {LOCATION_HINT}
          </p>
          <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
            <Clock size={13} /> Activity timeline
          </h4>
          <ol className="relative ml-2 border-l border-border">
            {timeline.map((e) => {
              const Icon = eventStyle[e.type]?.icon || MousePointerClick
              return (
                <li key={e.id} className="mb-3 ml-4">
                  <span className="absolute -left-[9px] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-white text-[#1a4fd6]">
                    <Icon size={10} />
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(e.date).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-xs font-medium">{describe(e)}</p>
                </li>
              )
            })}
            {!timeline.length && (
              <li className="ml-4 text-xs text-muted-foreground">
                No events retained for this session.
              </li>
            )}
          </ol>
        </div>
      </aside>
    </div>
  )
}

// ── Settings: Privacy & Visitor Data ──
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
const download = (name: string, rows: Record<string, unknown>[]) => {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const csv = [
    keys.join(","),
    ...rows.map((r) =>
      keys
        .map((k) =>
          csvCell(typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k]),
        )
        .join(","),
    ),
  ].join("\n")
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}
export function PrivacyPanel() {
  const store = useStore()
  const { settings, sessions, events } = useAnalytics()
  const [confirm, setConfirm] = useState<"" | "delete" | "anonymize">("")
  const toggle = (
    key: "enabled" | "ipLogging" | "maskIp",
    label: string,
    description: string,
  ) => (
    <label className="flex items-start justify-between gap-4 border-b border-border/60 py-3 last:border-0">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => {
          updateAnalyticsSettings({ [key]: e.target.checked })
          store.log(
            `Visitor privacy: ${label} ${
              e.target.checked ? "enabled" : "disabled"
            }`,
          )
        }}
        className="mt-1 h-4 w-4 accent-primary"
      />
    </label>
  )
  const exportCsv = () => {
    const masked = (ip?: string) => maskIp(ip, settings.maskIp)
    download(
      `ithub-visitor-sessions-${new Date().toISOString().slice(0, 10)}.csv`,
      sessions.map((s) => ({ ...s, ip: masked(s.ip) })),
    )
    download(
      `ithub-visitor-events-${new Date().toISOString().slice(0, 10)}.csv`,
      events.map((e) => ({ ...e, meta: e.meta ? JSON.stringify(e.meta) : "" })),
    )
    store.log("Visitor analytics exported (CSV)")
  }
  return (
    <div className="mb-6 rounded-lg border border-border bg-white p-6">
      <h3 className="text-sm font-bold">Privacy & Visitor Data</h3>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">
        Visitor analytics use an anonymous browser ID and approximate,
        IP-derived location. Locations are never treated as a physical address.
        In Supabase, visitor tables are readable by admins only (RLS).
      </p>
      <div className="mt-3">
        {toggle(
          "enabled",
          "Visitor analytics",
          "Record sessions and events on the storefront.",
        )}
        {toggle(
          "ipLogging",
          "IP logging",
          "Store the visitor IP address. Turning this off removes stored IPs.",
        )}
        {toggle(
          "maskIp",
          "Mask IP addresses",
          "Hide the last part of IPs in admin views and exports.",
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 py-3">
          <span>
            <span className="block text-sm font-semibold">Data retention</span>
            <span className="text-xs text-muted-foreground">
              Older sessions and their events are purged automatically.
            </span>
          </span>
          <Select
            className="w-40"
            label="Retention period"
            value={String(settings.retentionDays)}
            onChange={(v) => {
              updateAnalyticsSettings({
                retentionDays: Number(v) as AnalyticsSettings["retentionDays"],
              })
              store.log(`Visitor data retention set to ${v} days`)
            }}
            options={[
              ["7", "7 days"],
              ["30", "30 days"],
              ["90", "90 days"],
              ["180", "180 days"],
              ["365", "1 year"],
            ].map(([value, label]) => ({ value, label }))}
          />
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {sessions.length} sessions · {events.length} events stored
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={exportCsv}
          disabled={!sessions.length}
        >
          <Download size={14} /> Export CSV
        </Button>
        <Button
          variant="secondary"
          onClick={() => setConfirm("anonymize")}
          disabled={!sessions.length}
        >
          Anonymize visitor data
        </Button>
        <Button
          variant="secondary"
          onClick={() => setConfirm("delete")}
          disabled={!sessions.length}
        >
          <Trash2 size={14} /> Delete all visitor data
        </Button>
      </div>
      <Modal
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm("")}
        title={
          confirm === "delete"
            ? "Delete all visitor data?"
            : "Anonymize visitor data?"
        }
        description={
          confirm === "delete"
            ? "Permanently removes every visitor session and event. This cannot be undone."
            : "Removes IPs, ISPs, user IDs and visitor IDs while keeping aggregate counts."
        }
        size="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm("")}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (confirm === "delete") deleteVisitorData()
              else anonymizeVisitorData()
              store.log(
                confirm === "delete"
                  ? "All visitor data deleted"
                  : "Visitor data anonymized",
              )
              store.notify(
                confirm === "delete"
                  ? "Visitor data deleted"
                  : "Visitor data anonymized",
              )
              setConfirm("")
            }}
          >
            {confirm === "delete" ? "Delete" : "Anonymize"}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
