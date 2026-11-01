// ITHUB_ADMIN/src/lib/visitorAnalytics.ts
// Comprehensive Website Visitor Analytics Data Layer & Excel (.xlsx) Exporter
// Privacy-compliant: coarse IP geolocation, no silent GPS, formula injection prevention.
// IT HUB — Kerala, India

import * as XLSX from "xlsx";
import { supabase } from "./supabase";

export interface VisitorProfile {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface VisitorSessionRecord {
  id: string;
  visitor_id: string;
  user_id?: string | null;
  ip?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  isp?: string | null;
  location_confidence?: "approximate" | "unverified_client_reported" | "unavailable";
  device?: "Desktop" | "Mobile" | "Tablet" | null;
  os?: string | null;
  browser?: string | null;
  referrer?: string | null;
  landing_page?: string | null;
  page_views: number;
  is_returning: boolean;
  first_seen: string;
  last_seen: string;
  profiles?: VisitorProfile | null;
}

export interface VisitorEventRecord {
  id: string;
  session_id: string;
  user_id?: string | null;
  event_type: string;
  path?: string | null;
  status: "Success" | "Info" | "Warning" | string;
  meta: Record<string, any>;
  created_at: string;
}

export interface AnalyticsOverviewMetrics {
  totalVisits: number;
  uniqueVisitors: number;
  customerVisits: number;
  anonymousVisits: number;
  returningVisitors: number;
  newVisitors: number;
  desktopCount: number;
  mobileCount: number;
  tabletCount: number;
  topPages: Array<{ path: string; count: number }>;
  popularCategoriesOrProducts: Array<{ label: string; count: number }>;
  locationDistribution: Array<{ location: string; count: number }>;
}

export interface VisitorAnalyticsQueryOptions {
  searchQuery?: string;
  visitorType?: "ALL" | "CUSTOMER" | "ANONYMOUS";
  device?: "ALL" | "Desktop" | "Mobile" | "Tablet";
  dateRange?: "ALL" | "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "LAST_30_DAYS";
  location?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "last_seen" | "first_seen" | "page_views";
  sortOrder?: "asc" | "desc";
}

export interface VisitorAnalyticsQueryResult {
  sessions: VisitorSessionRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

/**
 * Sanitizes cell values to prevent CSV/Excel Formula Injection attacks.
 * Prepends a single quote if the string begins with =, +, -, or @.
 */
export function sanitizeExcelCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (/^[=+\-@]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

/**
 * Formats ISO timestamps into human-readable Indian Standard Time.
 */
export function formatAnalyticsDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

/**
 * Masks phone numbers and emails for general staff display while keeping them readable.
 */
export function maskSensitiveContact(contact?: string | null, isEmail = false): string {
  if (!contact) return "—";
  const str = contact.trim();
  if (isEmail) {
    const [user, domain] = str.split("@");
    if (!domain) return str;
    const maskedUser = user.length > 2 ? `${user.slice(0, 2)}***${user.slice(-1)}` : `${user}***`;
    return `${maskedUser}@${domain}`;
  }
  // Phone: keep first 3 and last 2 digits
  if (str.length >= 7) {
    return `${str.slice(0, 3)}****${str.slice(-2)}`;
  }
  return str;
}

/**
 * Fetches high-level aggregated website traffic & visitor metrics.
 */
export async function fetchVisitorAnalyticsOverview(): Promise<AnalyticsOverviewMetrics> {
  const fallback: AnalyticsOverviewMetrics = {
    totalVisits: 0,
    uniqueVisitors: 0,
    customerVisits: 0,
    anonymousVisits: 0,
    returningVisitors: 0,
    newVisitors: 0,
    desktopCount: 0,
    mobileCount: 0,
    tabletCount: 0,
    topPages: [],
    popularCategoriesOrProducts: [],
    locationDistribution: [],
  };

  if (!supabase) return fallback;

  try {
    // 1. Fetch sessions for traffic aggregation
    const { data: sessions, error } = await supabase
      .from("visitor_sessions")
      .select(
        "id, visitor_id, user_id, device, is_returning, page_views, city, region, country, landing_page",
      )
      .order("last_seen", { ascending: false })
      .limit(2000);

    if (error || !sessions || sessions.length === 0) {
      return fallback;
    }

    const uniqueVisitorSet = new Set<string>();
    let totalVisits = 0;
    let customerVisits = 0;
    let anonymousVisits = 0;
    let returningVisitors = 0;
    let newVisitors = 0;
    let desktopCount = 0;
    let mobileCount = 0;
    let tabletCount = 0;

    const pageCountMap = new Map<string, number>();
    const locationMap = new Map<string, number>();

    for (const s of sessions) {
      uniqueVisitorSet.add(s.visitor_id);
      totalVisits += Math.max(1, s.page_views || 1);

      if (s.user_id) customerVisits++;
      else anonymousVisits++;

      if (s.is_returning) returningVisitors++;
      else newVisitors++;

      if (s.device === "Mobile") mobileCount++;
      else if (s.device === "Tablet") tabletCount++;
      else desktopCount++;

      // Landing / path tally
      if (s.landing_page) {
        const cleanPath = s.landing_page.split("?")[0] || "/";
        pageCountMap.set(cleanPath, (pageCountMap.get(cleanPath) || 0) + (s.page_views || 1));
      }

      // Location tally
      const locKey = [s.city, s.region, s.country].filter(Boolean).join(", ") || "Unknown Location";
      locationMap.set(locKey, (locationMap.get(locKey) || 0) + 1);
    }

    // 2. Fetch popular events for category/product breakdown
    const { data: events } = await supabase
      .from("visitor_events")
      .select("event_type, path, meta")
      .in("event_type", [
        "Product Viewed",
        "Category Viewed",
        "Service Booking Started",
        "PC Builder Started",
      ])
      .limit(1000);

    const popularItemsMap = new Map<string, number>();
    if (events) {
      for (const e of events) {
        const title =
          e.meta?.title ||
          e.meta?.name ||
          e.meta?.productTitle ||
          e.meta?.category ||
          e.path ||
          e.event_type;
        if (title) {
          popularItemsMap.set(title, (popularItemsMap.get(title) || 0) + 1);
        }
      }
    }

    const topPages = Array.from(pageCountMap.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const popularCategoriesOrProducts = Array.from(popularItemsMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const locationDistribution = Array.from(locationMap.entries())
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      totalVisits,
      uniqueVisitors: uniqueVisitorSet.size,
      customerVisits,
      anonymousVisits,
      returningVisitors,
      newVisitors,
      desktopCount,
      mobileCount,
      tabletCount,
      topPages,
      popularCategoriesOrProducts,
      locationDistribution,
    };
  } catch (err) {
    console.warn("Failed to fetch visitor analytics overview:", err);
    return fallback;
  }
}

/**
 * Fetches filtered & paginated visitor sessions joined with customer profile information.
 */
export async function fetchVisitorSessions(
  options: VisitorAnalyticsQueryOptions = {},
): Promise<VisitorAnalyticsQueryResult> {
  const {
    page = 1,
    pageSize = 15,
    searchQuery = "",
    visitorType = "ALL",
    device = "ALL",
    dateRange = "ALL",
    location = "",
    sortBy = "last_seen",
    sortOrder = "desc",
  } = options;

  if (!supabase) {
    return {
      sessions: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      error: "Database client unavailable.",
    };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase
      .from("visitor_sessions")
      .select("*, profiles:user_id(id, full_name, email, phone)", { count: "exact" });

    // 1. Visitor type filter
    if (visitorType === "CUSTOMER") {
      query = query.not("user_id", "is", null);
    } else if (visitorType === "ANONYMOUS") {
      query = query.is("user_id", null);
    }

    // 2. Device filter
    if (device && device !== "ALL") {
      query = query.eq("device", device);
    }

    // 3. Location filter
    if (location.trim()) {
      const loc = `%${location.trim()}%`;
      query = query.or(`city.ilike.${loc},region.ilike.${loc},country.ilike.${loc}`);
    }

    // 4. Date range filter
    if (dateRange && dateRange !== "ALL") {
      const now = new Date();
      let filterStart: Date;

      if (dateRange === "TODAY") {
        filterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateRange === "YESTERDAY") {
        filterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const filterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query
          .gte("last_seen", filterStart.toISOString())
          .lt("last_seen", filterEnd.toISOString());
      } else if (dateRange === "LAST_7_DAYS") {
        filterStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        // LAST_30_DAYS
        filterStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      if (dateRange !== "YESTERDAY") {
        query = query.gte("last_seen", filterStart.toISOString());
      }
    }

    // 5. Search query (matches visitor_id, ip, or landing page)
    if (searchQuery.trim()) {
      const q = `%${searchQuery.trim()}%`;
      query = query.or(
        `visitor_id.ilike.${q},landing_page.ilike.${q},city.ilike.${q},region.ilike.${q}`,
      );
    }

    // 6. Sort and pagination
    query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
      return {
        sessions: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        error: error.message,
      };
    }

    const sessions = (data as VisitorSessionRecord[]) || [];
    const totalCount = count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      sessions,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err: any) {
    return {
      sessions: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      error: err?.message || "Failed to fetch visitor analytics records.",
    };
  }
}

/**
 * Fetches the event clickstream history for an individual visitor session.
 */
export async function fetchSessionEvents(sessionId: string): Promise<VisitorEventRecord[]> {
  if (!supabase || !sessionId) return [];
  try {
    const { data, error } = await supabase
      .from("visitor_events")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return (data as VisitorEventRecord[]) || [];
  } catch (err) {
    console.warn("Failed to fetch session events:", err);
    return [];
  }
}

/**
 * Fetches all filtered visitor records (bypassing pagination) for Excel export.
 */
export async function fetchAllFilteredSessionsForExport(
  options: Omit<VisitorAnalyticsQueryOptions, "page" | "pageSize"> = {},
): Promise<VisitorSessionRecord[]> {
  if (!supabase) return [];
  try {
    let query = supabase
      .from("visitor_sessions")
      .select("*, profiles:user_id(id, full_name, email, phone)")
      .order("last_seen", { ascending: false })
      .limit(5000);

    if (options.visitorType === "CUSTOMER") {
      query = query.not("user_id", "is", null);
    } else if (options.visitorType === "ANONYMOUS") {
      query = query.is("user_id", null);
    }

    if (options.device && options.device !== "ALL") {
      query = query.eq("device", options.device);
    }

    if (options.location?.trim()) {
      const loc = `%${options.location.trim()}%`;
      query = query.or(`city.ilike.${loc},region.ilike.${loc},country.ilike.${loc}`);
    }

    if (options.dateRange && options.dateRange !== "ALL") {
      const now = new Date();
      let filterStart: Date;
      if (options.dateRange === "TODAY") {
        filterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (options.dateRange === "YESTERDAY") {
        filterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const filterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query
          .gte("last_seen", filterStart.toISOString())
          .lt("last_seen", filterEnd.toISOString());
      } else if (options.dateRange === "LAST_7_DAYS") {
        filterStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        filterStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      if (options.dateRange !== "YESTERDAY") {
        query = query.gte("last_seen", filterStart.toISOString());
      }
    }

    if (options.searchQuery?.trim()) {
      const q = `%${options.searchQuery.trim()}%`;
      query = query.or(
        `visitor_id.ilike.${q},landing_page.ilike.${q},city.ilike.${q},region.ilike.${q}`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as VisitorSessionRecord[]) || [];
  } catch (err) {
    console.warn("Failed to fetch sessions for export:", err);
    return [];
  }
}

/**
 * Generates and downloads a genuine multi-worksheet Excel workbook (.xlsx).
 * Fully hardened against formula injection attacks.
 */
export function exportVisitorAnalyticsToExcel(
  sessions: VisitorSessionRecord[],
  metrics: AnalyticsOverviewMetrics,
  fileName?: string,
): void {
  // 1. Build Worksheet 1: Visitor Activity Details
  const sessionRows = sessions.map((s, index) => {
    const isCustomer = Boolean(s.user_id && s.profiles);
    return {
      "Sl No": index + 1,
      "Session ID": sanitizeExcelCell(s.id),
      "Visitor Token": sanitizeExcelCell(s.visitor_id),
      "Visitor Type": isCustomer ? "Authenticated Customer" : "Anonymous Visitor",
      "Customer ID": sanitizeExcelCell(s.user_id || "—"),
      "Customer Name": sanitizeExcelCell(
        s.profiles?.full_name || (isCustomer ? "Customer" : "Anonymous"),
      ),
      "Customer Email": sanitizeExcelCell(s.profiles?.email || "—"),
      "Customer Phone": sanitizeExcelCell(s.profiles?.phone || "—"),
      "Page Views": s.page_views || 1,
      "Returning Visitor": s.is_returning ? "Yes" : "No",
      "Device Type": sanitizeExcelCell(s.device || "Desktop"),
      "Operating System": sanitizeExcelCell(s.os || "Unknown"),
      Browser: sanitizeExcelCell(s.browser || "Unknown"),
      City: sanitizeExcelCell(s.city || "—"),
      "State / Region": sanitizeExcelCell(s.region || "—"),
      Country: sanitizeExcelCell(s.country || "—"),
      "Landing Page / URL": sanitizeExcelCell(s.landing_page || "/"),
      "Referrer Source": sanitizeExcelCell(s.referrer || "Direct"),
      "First Seen (IST)": sanitizeExcelCell(formatAnalyticsDate(s.first_seen)),
      "Last Active (IST)": sanitizeExcelCell(formatAnalyticsDate(s.last_seen)),
    };
  });

  const sessionWorksheet = XLSX.utils.json_to_sheet(sessionRows);

  // Set explicit column widths for readability
  sessionWorksheet["!cols"] = [
    { wch: 8 }, // Sl No
    { wch: 38 }, // Session ID
    { wch: 28 }, // Visitor Token
    { wch: 24 }, // Visitor Type
    { wch: 38 }, // Customer ID
    { wch: 24 }, // Customer Name
    { wch: 28 }, // Customer Email
    { wch: 18 }, // Customer Phone
    { wch: 12 }, // Page Views
    { wch: 18 }, // Returning Visitor
    { wch: 14 }, // Device Type
    { wch: 18 }, // Operating System
    { wch: 18 }, // Browser
    { wch: 18 }, // City
    { wch: 18 }, // State / Region
    { wch: 18 }, // Country
    { wch: 32 }, // Landing Page
    { wch: 18 }, // Referrer
    { wch: 24 }, // First Seen
    { wch: 24 }, // Last Active
  ];

  // 2. Build Worksheet 2: Executive Summary & Aggregated Stats
  const nowStr = formatAnalyticsDate(new Date().toISOString());
  const summaryRows = [
    {
      "Metric Category": "REPORT METADATA",
      "Metric Name": "Report Title",
      "Aggregated Value": "IT HUB Website Visitor Analytics Audit",
    },
    {
      "Metric Category": "REPORT METADATA",
      "Metric Name": "Generated On (IST)",
      "Aggregated Value": sanitizeExcelCell(nowStr),
    },
    {
      "Metric Category": "REPORT METADATA",
      "Metric Name": "Total Exported Sessions",
      "Aggregated Value": sessions.length,
    },
    {
      "Metric Category": "TRAFFIC OVERVIEW",
      "Metric Name": "Total Page Views",
      "Aggregated Value": metrics.totalVisits,
    },
    {
      "Metric Category": "TRAFFIC OVERVIEW",
      "Metric Name": "Unique Visitors",
      "Aggregated Value": metrics.uniqueVisitors,
    },
    {
      "Metric Category": "AUDIENCE BREAKDOWN",
      "Metric Name": "Logged-in Customer Visits",
      "Aggregated Value": metrics.customerVisits,
    },
    {
      "Metric Category": "AUDIENCE BREAKDOWN",
      "Metric Name": "Anonymous Storefront Visits",
      "Aggregated Value": metrics.anonymousVisits,
    },
    {
      "Metric Category": "AUDIENCE BREAKDOWN",
      "Metric Name": "Returning Visitors",
      "Aggregated Value": metrics.returningVisitors,
    },
    {
      "Metric Category": "AUDIENCE BREAKDOWN",
      "Metric Name": "New Visitors",
      "Aggregated Value": metrics.newVisitors,
    },
    {
      "Metric Category": "DEVICE DISTRIBUTION",
      "Metric Name": "Desktop Visitors",
      "Aggregated Value": metrics.desktopCount,
    },
    {
      "Metric Category": "DEVICE DISTRIBUTION",
      "Metric Name": "Mobile Visitors",
      "Aggregated Value": metrics.mobileCount,
    },
    {
      "Metric Category": "DEVICE DISTRIBUTION",
      "Metric Name": "Tablet Visitors",
      "Aggregated Value": metrics.tabletCount,
    },
    ...metrics.topPages.map((tp, idx) => ({
      "Metric Category": "TOP VISITED PAGES",
      "Metric Name": `#${idx + 1} Most Visited Route`,
      "Aggregated Value": `${sanitizeExcelCell(tp.path)} (${tp.count} views)`,
    })),
    ...metrics.popularCategoriesOrProducts.map((p, idx) => ({
      "Metric Category": "POPULAR INTERESTS",
      "Metric Name": `#${idx + 1} Viewed Product/Category`,
      "Aggregated Value": `${sanitizeExcelCell(p.label)} (${p.count} interactions)`,
    })),
    ...metrics.locationDistribution.map((l, idx) => ({
      "Metric Category": "GEOGRAPHIC REACH",
      "Metric Name": `#${idx + 1} Top Location`,
      "Aggregated Value": `${sanitizeExcelCell(l.location)} (${l.count} sessions)`,
    })),
  ];

  const summaryWorksheet = XLSX.utils.json_to_sheet(summaryRows);
  summaryWorksheet["!cols"] = [
    { wch: 24 }, // Metric Category
    { wch: 34 }, // Metric Name
    { wch: 48 }, // Aggregated Value
  ];

  // 3. Assemble Workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sessionWorksheet, "Visitor Sessions");
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, "Analytics Summary");

  // 4. Trigger Native Browser Download
  const today = new Date().toISOString().split("T")[0];
  const targetName = fileName || `IT_HUB_Website_Audit_${today}.xlsx`;
  XLSX.writeFile(workbook, targetName, { bookType: "xlsx", type: "binary" });
}
