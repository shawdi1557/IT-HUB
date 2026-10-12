// Visitor analytics — privacy-conscious session + event model.
// Supabase: `visitor_sessions` and `visitor_events` (admin-only via RLS).
// Prototype: persisted in localStorage under its own key so audit data
// never bloats the main store.
import { useSyncExternalStore } from "react"

export type EventType = "Session Started" | "Session Ended" | "Page Viewed" | "Login" | "Logout" | "Product Viewed" | "Product Added to Cart" | "Checkout Started" | "Order Created" | "Service Booking Started" | "Service Request Created" | "PC Builder Started" | "PC Build Saved" | "Warranty Assistance Viewed" | "Contact/WhatsApp Action" | "Admin Login" | "Admin Data Change"

export type VisitorSession = {
  id: string
  /** Anonymous, browser-scoped visitor id (not a person identifier). */
  visitorId: string
  userId?: string
  /** Raw IP — only stored when IP logging is enabled. */
  ip?: string
  /** IP-derived and approximate. Never an address. */
  country?: string
  region?: string
  city?: string
  isp?: string
  /** "approximate" when IP lookup succeeded, "unavailable" otherwise. */
  locationConfidence: "approximate" | "unavailable"
  device: "Desktop" | "Mobile" | "Tablet"
  os: string
  browser: string
  referrer: string
  landingPage: string
  firstSeen: string
  lastSeen: string
  pageViews: number
  returning: boolean
  demo?: boolean
}
export type VisitorEvent = {
  id: string
  sessionId: string
  userId?: string
  type: EventType
  path: string
  date: string
  status: "Success" | "Info" | "Warning"
  meta?: Record<string, string>
  demo?: boolean
}
export type AnalyticsSettings = {
  enabled: boolean
  ipLogging: boolean
  /** Mask the last IP octet in admin views. */
  maskIp: boolean
  retentionDays: 7 | 30 | 90 | 180 | 365
}
type AnalyticsState = {
  sessions: VisitorSession[]
  events: VisitorEvent[]
  settings: AnalyticsSettings
}

const KEY = "ithub-analytics-v1"
const VISITOR_KEY = "ithub-visitor-id"
const SESSION_KEY = "ithub-session"
/** A session ends after 30 minutes of inactivity. */
const SESSION_TIMEOUT = 30 * 60 * 1000

const defaults: AnalyticsState = {
  sessions: [],
  events: [],
  settings: { enabled: true, ipLogging: true, maskIp: true, retentionDays: 90 },
}
const load = (): AnalyticsState => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null")
    return saved
      ? {
          ...defaults,
          ...saved,
          settings: { ...defaults.settings, ...saved.settings },
        }
      : defaults
  } catch {
    return defaults
  }
}
let state = load()
const listeners = new Set<() => void>()
const commit = (next: Partial<AnalyticsState>) => {
  state = { ...state, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage full — drop the oldest half of events and retry once.
    state = {
      ...state,
      events: state.events.slice(0, Math.floor(state.events.length / 2)),
    }
    localStorage.setItem(KEY, JSON.stringify(state))
  }
  listeners.forEach((listener) => listener())
}
export const useAnalytics = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )

// ── Device parsing (user agent; coarse by design) ──
const parseAgent = () => {
  const ua = navigator.userAgent
  const device: VisitorSession["device"] = /iPad|Tablet/i.test(ua)
    ? "Tablet"
    : /Mobi|Android|iPhone/i.test(ua)
      ? "Mobile"
      : "Desktop"
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(ua)
        ? "iOS"
        : /Mac OS/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Other"
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Other"
  return { device, os, browser }
}
const referrerSource = () => {
  if (!document.referrer) return "Direct"
  try {
    const host = new URL(document.referrer).hostname
    if (host === location.hostname) return "Direct"
    if (/google\./.test(host)) return "Google"
    if (/facebook|instagram|fb\./.test(host)) return "Social"
    if (/whatsapp|wa\.me/.test(host)) return "WhatsApp"
    return host
  } catch {
    return "Direct"
  }
}

// ── Retention ──
const prune = () => {
  const cutoff = Date.now() - state.settings.retentionDays * 86400000
  const sessions = state.sessions.filter(
    (item) => new Date(item.lastSeen).getTime() >= cutoff,
  )
  const ids = new Set(sessions.map((item) => item.id))
  const events = state.events.filter((item) => ids.has(item.sessionId))
  if (
    sessions.length !== state.sessions.length ||
    events.length !== state.events.length
  )
    commit({ sessions, events })
}

/** Approximate IP geolocation. Failure is fine — location stays "unavailable". */
const locate = async (sessionId: string) => {
  try {
    const response = await fetch("https://ipapi.co/json/")
    if (!response.ok) return
    const data = await response.json()
    if (data.error) return
    commit({
      sessions: state.sessions.map((item) =>
        item.id === sessionId
          ? {
              ...item,
              ip: state.settings.ipLogging ? data.ip : undefined,
              country: data.country_name || undefined,
              region: data.region || undefined,
              city: data.city || undefined,
              isp: data.org || undefined,
              locationConfidence:
                data.city || data.region ? "approximate" : "unavailable",
            }
          : item,
      ),
    })
  } catch {
    // Network blocked / offline — keep "Location unavailable".
  }
}

let currentUser: string | undefined
const currentSession = () => {
  const visitorId = localStorage.getItem(VISITOR_KEY)
  const raw = sessionStorage.getItem(SESSION_KEY)
  const saved = raw ? JSON.parse(raw) as { id: string at: number } : null
  if (saved && Date.now() - saved.at < SESSION_TIMEOUT) {
    const session = state.sessions.find((item) => item.id === saved.id)
    if (session) return session
  }
  // Close the previous session, start a new one.
  if (saved) {
    const previous = state.sessions.find((item) => item.id === saved.id)
    if (previous) push(previous, "Session Ended", previous.landingPage, "Info")
  }
  const returning = Boolean(visitorId)
  const nextVisitor = visitorId || crypto.randomUUID()
  localStorage.setItem(VISITOR_KEY, nextVisitor)
  const now = new Date().toISOString()
  const session: VisitorSession = {
    id: crypto.randomUUID(),
    visitorId: nextVisitor,
    userId: currentUser,
    locationConfidence: "unavailable",
    ...parseAgent(),
    referrer: referrerSource(),
    landingPage: location.pathname + location.search,
    firstSeen: now,
    lastSeen: now,
    pageViews: 0,
    returning,
  }
  commit({ sessions: [session, ...state.sessions] })
  push(session, "Session Started", session.landingPage, "Info")
  void locate(session.id)
  return session
}
const push = (
  session: VisitorSession,
  type: EventType,
  path: string,
  status: VisitorEvent["status"] = "Success",
  meta?: Record<string, string>,
) => {
  const event: VisitorEvent = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    userId: session.userId || currentUser,
    type,
    path,
    date: new Date().toISOString(),
    status,
    meta,
  }
  commit({ events: [event, ...state.events].slice(0, 5000) })
}

/** Record an event for the current visitor session. No-op when analytics is disabled. */
export const track = (type: EventType, meta?: Record<string, string>) => {
  if (!state.settings.enabled || typeof window === "undefined") return
  prune()
  const session = currentSession()
  const path = location.pathname + location.search
  const now = new Date().toISOString()
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ id: session.id, at: Date.now() }),
  )
  commit({
    sessions: state.sessions.map((item) =>
      item.id === session.id
        ? {
            ...item,
            userId: currentUser || item.userId,
            lastSeen: now,
            pageViews: item.pageViews + (type === "Page Viewed" ? 1 : 0),
          }
        : item,
    ),
  })
  push(
    { ...session, userId: currentUser || session.userId },
    type,
    path,
    "Success",
    meta,
  )
}
export const identify = (userId?: string) => {
  currentUser = userId
}

// ── Admin controls ──
export const updateAnalyticsSettings = (
  settings: Partial<AnalyticsSettings>,
) => {
  commit({ settings: { ...state.settings, ...settings } })
  if (settings.ipLogging === false)
    commit({
      sessions: state.sessions.map((item) => ({ ...item, ip: undefined })),
    })
  prune()
}
export const deleteVisitorData = () => commit({ sessions: [], events: [] })
/** Keep aggregate value, remove identifiers. */
export const anonymizeVisitorData = () =>
  commit({
    sessions: state.sessions.map((item) => ({
      ...item,
      ip: undefined,
      isp: undefined,
      userId: undefined,
      visitorId: "anonymized",
    })),
    events: state.events.map((item) => ({ ...item, userId: undefined })),
  })
export const clearDemoData = () =>
  commit({
    sessions: state.sessions.filter((item) => !item.demo),
    events: state.events.filter((item) => !item.demo),
  })
export const maskIp = (ip?: string, masked = state.settings.maskIp) =>
  !ip
    ? "—"
    : masked
      ? ip.replace(/(\d+)$/, "xxx").replace(/:[0-9a-f]*$/i, ":xxxx")
      : ip
export const sessionDuration = (session: VisitorSession) =>
  Math.max(
    0,
    new Date(session.lastSeen).getTime() -
      new Date(session.firstSeen).getTime(),
  )

/**
 * Demo data — clearly flagged (`demo: true`) and labelled "Demo data" in the UI.
 * Uses documentation IP ranges (203.0.113.x / 198.51.100.x), never real addresses.
 */
export const loadDemoData = () => {
  const places = [
    ["India", "Kerala", "Kothamangalam"],
    ["India", "Kerala", "Kochi"],
    ["India", "Kerala", "Muvattupuzha"],
    ["India", "Kerala", "Perumbavoor"],
    ["India", "Kerala", "Thodupuzha"],
    ["India", "Kerala", "Thrissur"],
    ["India", "Tamil Nadu", "Coimbatore"],
    ["India", "Karnataka", "Bengaluru"],
    ["United Arab Emirates", "Dubai", "Dubai"],
    ["", "", ""],
  ]
  const weights = [30, 22, 14, 9, 6, 5, 4, 4, 3, 3]
  const pick = <T>(items: T[], w?: number[]) => {
    if (!w) return items[Math.floor(Math.random() * items.length)]
    let roll = Math.random() * w.reduce((a, b) => a + b, 0)
    for (let i = 0; i < items.length; i++)
      if ((roll -= w[i]) < 0) return items[i]
    return items[0]
  }
  const paths = [
    "/",
    "/products",
    "/products?category=Laptops",
    "/products?category=Mobiles",
    "/products?category=Printers",
    "/services",
    "/services/book",
    "/pc-builder",
    "/support?view=warranty",
    "/about",
  ]
  const actions: EventType[] = [
    "Product Viewed",
    "Product Added to Cart",
    "Service Booking Started",
    "PC Builder Started",
    "Warranty Assistance Viewed",
    "Contact/WhatsApp Action",
  ]
  const sessions: VisitorSession[] = []
  const events: VisitorEvent[] = []
  const visitors = Array.from({ length: 70 }, () => crypto.randomUUID())
  for (let i = 0; i < 140; i++) {
    const [country, region, city] = pick(places, weights)
    const start = Date.now() - Math.random() * 60 * 86400000
    const views = 1 + Math.floor(Math.random() * 7)
    const id = crypto.randomUUID()
    const device = pick<VisitorSession["device"]>([
      "Mobile",
      "Mobile",
      "Mobile",
      "Desktop",
      "Desktop",
      "Tablet",
    ])
    const landing = pick(paths, [30, 15, 10, 6, 4, 12, 3, 8, 6, 6])
    let at = start
    const timeline: VisitorEvent[] = []
    const add = (
      type: EventType,
      path: string,
      status: VisitorEvent["status"] = "Success",
    ) => {
      timeline.push({
        id: crypto.randomUUID(),
        sessionId: id,
        type,
        path,
        date: new Date(at).toISOString(),
        status,
        demo: true,
      })
      at += (20 + Math.random() * 160) * 1000
    }
    add("Session Started", landing, "Info")
    for (let v = 0; v < views; v++) {
      add("Page Viewed", v === 0 ? landing : pick(paths))
      if (Math.random() < 0.25) add(pick(actions), pick(paths))
    }
    add("Session Ended", landing, "Info")
    sessions.push({
      id,
      visitorId: pick(visitors),
      ip: country
        ? `${pick(["203.0.113", "198.51.100"])}.${Math.floor(Math.random() * 254) + 1}`
        : undefined,
      country: country || undefined,
      region: region || undefined,
      city: city || undefined,
      isp: country
        ? pick(["BSNL", "Jio", "Airtel", "Asianet Broadband", "Vodafone Idea"])
        : undefined,
      locationConfidence: country ? "approximate" : "unavailable",
      device,
      os:
        device === "Desktop"
          ? pick(["Windows", "Windows", "macOS", "Linux"])
          : pick(["Android", "Android", "iOS"]),
      browser: pick([
        "Chrome",
        "Chrome",
        "Chrome",
        "Safari",
        "Edge",
        "Samsung Internet",
        "Firefox",
      ]),
      referrer: pick(["Direct", "Google", "Google", "WhatsApp", "Social"]),
      landingPage: landing,
      firstSeen: new Date(start).toISOString(),
      lastSeen: timeline[timeline.length - 1].date,
      pageViews: views,
      returning: false,
      demo: true,
    })
    events.push(...timeline)
  }
  // Mark returning visitors: every session after a visitor's first.
  const seen = new Set<string>()
  sessions
    .sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))
    .forEach((session) => {
      session.returning = seen.has(session.visitorId)
      seen.add(session.visitorId)
    })
  commit({
    sessions: [...state.sessions, ...sessions].sort((a, b) =>
      b.firstSeen.localeCompare(a.firstSeen),
    ),
    events: [...state.events, ...events].sort((a, b) =>
      b.date.localeCompare(a.date),
    ),
  })
}
