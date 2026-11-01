// ITHUB_ADMIN/src/pages/Audits.tsx
// Website Visitor Analytics & Storefront Audit Management Module
// Real-time visitor activity, customer attribution, coarse geolocation, and Excel (.xlsx) export
// IT HUB — Kerala, India

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Users,
  UserCheck,
  UserX,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Search,
  RefreshCw,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Layers,
  Loader2,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Eye,
} from "lucide-react";
import { type StaffProfile } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  fetchVisitorAnalyticsOverview,
  fetchVisitorSessions,
  fetchSessionEvents,
  fetchAllFilteredSessionsForExport,
  exportVisitorAnalyticsToExcel,
  formatAnalyticsDate,
  maskSensitiveContact,
  type VisitorSessionRecord,
  type VisitorEventRecord,
  type AnalyticsOverviewMetrics,
} from "../lib/visitorAnalytics";

interface AuditsPageProps {
  profile: StaffProfile;
}

export function Audits({ profile: _profile }: AuditsPageProps) {
  // 1. Data States
  const [sessions, setSessions] = useState<VisitorSessionRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // 2. Overview Metrics State
  const [metrics, setMetrics] = useState<AnalyticsOverviewMetrics>({
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
  });

  // 3. Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [visitorType, setVisitorType] = useState<"ALL" | "CUSTOMER" | "ANONYMOUS">("ALL");
  const [deviceFilter, setDeviceFilter] = useState<"ALL" | "Desktop" | "Mobile" | "Tablet">("ALL");
  const [dateRange, setDateRange] = useState<
    "ALL" | "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "LAST_30_DAYS"
  >("ALL");
  const [locationFilter, setLocationFilter] = useState("");

  // 4. Session Timeline Modal State
  const [selectedSession, setSelectedSession] = useState<VisitorSessionRecord | null>(null);
  const [sessionEvents, setSessionEvents] = useState<VisitorEventRecord[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // 5. Load Overview Metrics
  const loadOverviewMetrics = useCallback(async () => {
    const data = await fetchVisitorAnalyticsOverview();
    setMetrics(data);
  }, []);

  // 6. Load Paginated Sessions
  const loadSessions = useCallback(async () => {
    setLoading(true);
    const result = await fetchVisitorSessions({
      page,
      pageSize,
      searchQuery,
      visitorType,
      device: deviceFilter,
      dateRange,
      location: locationFilter,
      sortBy: "last_seen",
      sortOrder: "desc",
    });

    setSessions(result.sessions);
    setTotalCount(result.totalCount);
    setTotalPages(result.totalPages);
    setLoading(false);
  }, [page, pageSize, searchQuery, visitorType, deviceFilter, dateRange, locationFilter]);

  // Initial & Filter Change Trigger
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    loadOverviewMetrics();
  }, [loadOverviewMetrics]);

  // Realtime subscription for incoming visitor sessions
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("staff_visitor_analytics_stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_sessions" }, () => {
        loadSessions();
        loadOverviewMetrics();
      })
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, [loadSessions, loadOverviewMetrics]);

  // 7. Load Timeline Events on Session Select
  const handleOpenTimeline = async (s: VisitorSessionRecord) => {
    setSelectedSession(s);
    setLoadingEvents(true);
    const events = await fetchSessionEvents(s.id);
    setSessionEvents(events);
    setLoadingEvents(false);
  };

  // 8. Excel Export Handler
  const handleExportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const allFiltered = await fetchAllFilteredSessionsForExport({
        searchQuery,
        visitorType,
        device: deviceFilter,
        dateRange,
        location: locationFilter,
      });

      const exportDataset = allFiltered.length > 0 ? allFiltered : sessions;
      const today = new Date().toISOString().split("T")[0];
      exportVisitorAnalyticsToExcel(exportDataset, metrics, `IT_HUB_Website_Audit_${today}.xlsx`);
    } catch (err) {
      console.error("Export to Excel failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Activity size={18} />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Website Visitor Analytics
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Real-time storefront traffic, authenticated customer activity, session insights, and
            geographic distribution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              loadOverviewMetrics();
              loadSessions();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
            title="Refresh analytics data"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
            title="Export full filtered visitor audit log as Microsoft Excel workbook (.xlsx)"
          >
            {exporting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={15} />
            )}
            <span>{exporting ? "Generating .xlsx..." : "Export to Excel (.xlsx)"}</span>
          </button>
        </div>
      </div>

      {/* Overview Analytics KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Page Views */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Visits</span>
            <Eye size={15} className="text-blue-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
            {metrics.totalVisits.toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500">Cumulative page views</span>
        </div>

        {/* Unique Visitors */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Unique Visitors</span>
            <Users size={15} className="text-indigo-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
            {metrics.uniqueVisitors.toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500">Distinct browser tokens</span>
        </div>

        {/* Logged-In Customers */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Customers</span>
            <UserCheck size={15} className="text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
            {metrics.customerVisits.toLocaleString()}
          </div>
          <span className="text-[10px] text-emerald-600 font-medium">Authenticated accounts</span>
        </div>

        {/* Anonymous Visitors */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Anonymous</span>
            <UserX size={15} className="text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 font-mono">
            {metrics.anonymousVisits.toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500">Guest browser sessions</span>
        </div>

        {/* Returning Visitors */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Returning</span>
            <RefreshCw size={15} className="text-purple-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-700 font-mono">
            {metrics.returningVisitors.toLocaleString()}
          </div>
          <span className="text-[10px] text-purple-600 font-medium">
            {metrics.totalVisits > 0
              ? `${Math.round((metrics.returningVisitors / Math.max(1, metrics.returningVisitors + metrics.newVisitors)) * 100)}% retention`
              : "Repeat visits"}
          </span>
        </div>

        {/* Device Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Devices</span>
            <Monitor size={15} className="text-cyan-600" />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mt-1">
            <span title="Desktop" className="flex items-center gap-0.5">
              <Monitor size={11} className="text-slate-500" />
              {metrics.desktopCount}
            </span>
            <span className="text-slate-300">·</span>
            <span title="Mobile" className="flex items-center gap-0.5">
              <Smartphone size={11} className="text-slate-500" />
              {metrics.mobileCount}
            </span>
            <span className="text-slate-300">·</span>
            <span title="Tablet" className="flex items-center gap-0.5">
              <Tablet size={11} className="text-slate-500" />
              {metrics.tabletCount}
            </span>
          </div>
          <span className="text-[10px] text-slate-500">Desktop / Mobile / Tablet</span>
        </div>
      </div>

      {/* Insights Grid: Top Routes, Interests & Locations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top Visited Routes */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <Layers size={14} className="text-blue-600" />
              <span>Most Visited Routes</span>
            </div>
            <span className="text-[10px] text-slate-400">Storefront URLs</span>
          </div>
          {metrics.topPages.length > 0 ? (
            <div className="space-y-1.5">
              {metrics.topPages.map((tp, idx) => (
                <div
                  key={tp.path}
                  className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="font-mono text-[10px] text-slate-400 w-4">#{idx + 1}</span>
                    <span className="font-mono text-slate-800 truncate" title={tp.path}>
                      {tp.path}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[10px] shrink-0">
                    {tp.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-3 text-center">
              No route view events logged yet.
            </p>
          )}
        </div>

        {/* Popular Interests */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <ExternalLink size={14} className="text-indigo-600" />
              <span>Popular Products &amp; Sections</span>
            </div>
            <span className="text-[10px] text-slate-400">Interactions</span>
          </div>
          {metrics.popularCategoriesOrProducts.length > 0 ? (
            <div className="space-y-1.5">
              {metrics.popularCategoriesOrProducts.map((p, idx) => (
                <div
                  key={p.label}
                  className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="font-mono text-[10px] text-slate-400 w-4">#{idx + 1}</span>
                    <span className="text-slate-800 font-medium truncate" title={p.label}>
                      {p.label}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[10px] shrink-0">
                    {p.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-3 text-center">
              No product or section events yet.
            </p>
          )}
        </div>

        {/* Coarse Geographic Reach */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <Globe size={14} className="text-emerald-600" />
              <span>Coarse Geographic Reach</span>
            </div>
            <span className="text-[10px] text-slate-400">IP Geolocation</span>
          </div>
          {metrics.locationDistribution.length > 0 ? (
            <div className="space-y-1.5">
              {metrics.locationDistribution.map((l, idx) => (
                <div
                  key={l.location}
                  className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="font-mono text-[10px] text-slate-400 w-4">#{idx + 1}</span>
                    <span className="text-slate-800 font-medium truncate" title={l.location}>
                      {l.location}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded text-[10px] shrink-0">
                    {l.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-3 text-center">
              Coarse location populates from IP headers.
            </p>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Text Search */}
          <div className="relative lg:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Visitor Token, City, Region, or Landing Page..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Visitor Type Filter */}
          <div>
            <select
              value={visitorType}
              onChange={(e) => {
                setVisitorType(e.target.value as any);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Visitor Types</option>
              <option value="CUSTOMER">Logged-in Customers Only</option>
              <option value="ANONYMOUS">Anonymous Guests Only</option>
            </select>
          </div>

          {/* Device Filter */}
          <div>
            <select
              value={deviceFilter}
              onChange={(e) => {
                setDeviceFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Devices</option>
              <option value="Desktop">Desktop Only</option>
              <option value="Mobile">Mobile Only</option>
              <option value="Tablet">Tablet Only</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div>
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value as any);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7_DAYS">Last 7 Days</option>
              <option value="LAST_30_DAYS">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Active Filter Indicators */}
        {(searchQuery ||
          visitorType !== "ALL" ||
          deviceFilter !== "ALL" ||
          dateRange !== "ALL" ||
          locationFilter) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 text-[11px] font-bold">Active Filters:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px]">
                Search: "{searchQuery}"
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="hover:text-red-500"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {visitorType !== "ALL" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px]">
                Type: {visitorType === "CUSTOMER" ? "Customers" : "Anonymous"}
                <button
                  type="button"
                  onClick={() => setVisitorType("ALL")}
                  className="hover:text-red-500"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {deviceFilter !== "ALL" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 px-2 py-0.5 text-[10px]">
                Device: {deviceFilter}
                <button
                  type="button"
                  onClick={() => setDeviceFilter("ALL")}
                  className="hover:text-red-500"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {dateRange !== "ALL" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px]">
                Date: {dateRange}
                <button
                  type="button"
                  onClick={() => setDateRange("ALL")}
                  className="hover:text-red-500"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setVisitorType("ALL");
                setDeviceFilter("ALL");
                setDateRange("ALL");
                setLocationFilter("");
                setPage(1);
              }}
              className="text-[11px] text-blue-600 hover:underline font-semibold ml-auto"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Visitor Sessions Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Visitor Sessions &amp; Activity
            </span>
            <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-extrabold">
              {totalCount} Total
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Page {page} of {totalPages}
          </span>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-500 space-y-2">
            <Loader2 size={24} className="animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading visitor activity records...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
              <Activity size={24} />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-sm font-bold text-slate-900">No Visitor Activity Recorded Yet</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Visitor sessions and interactions are tracked in real time as guests and
                authenticated customers explore the IT HUB storefront.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Visitor / Customer</th>
                  <th className="py-2.5 px-3">Contact (Authorized)</th>
                  <th className="py-2.5 px-3">Location (Coarse)</th>
                  <th className="py-2.5 px-3">Landing Route</th>
                  <th className="py-2.5 px-3">Device &amp; Browser</th>
                  <th className="py-2.5 px-3 text-center">Views</th>
                  <th className="py-2.5 px-3">Last Active</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => {
                  const isCustomer = Boolean(s.user_id && s.profiles);
                  const locationDisplay =
                    [s.city, s.region, s.country].filter(Boolean).join(", ") || "Kerala, IN";

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition">
                      {/* Visitor / Customer Identity */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            {isCustomer ? (
                              <span className="font-bold text-slate-900">
                                {s.profiles?.full_name || "Customer"}
                              </span>
                            ) : (
                              <span className="font-medium text-slate-600">Anonymous Visitor</span>
                            )}
                            {isCustomer ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-extrabold uppercase">
                                <ShieldCheck size={9} /> Customer
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.2 text-[9px] font-bold uppercase">
                                Guest
                              </span>
                            )}
                          </div>
                          <p
                            className="font-mono text-[10px] text-slate-400"
                            title={`Token: ${s.visitor_id}`}
                          >
                            ID: {s.visitor_id.slice(0, 14)}...
                          </p>
                        </div>
                      </td>

                      {/* Contact Info (Masked for privacy) */}
                      <td className="py-3 px-3">
                        {isCustomer ? (
                          <div className="space-y-0.5 font-mono text-[11px] text-slate-700">
                            <p title={s.profiles?.email || ""}>
                              {maskSensitiveContact(s.profiles?.email, true)}
                            </p>
                            <p title={s.profiles?.phone || ""}>
                              {maskSensitiveContact(s.profiles?.phone, false)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Unauthenticated</span>
                        )}
                      </td>

                      {/* Location Details */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 text-slate-700">
                          <MapPin size={11} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[140px]" title={locationDisplay}>
                            {locationDisplay}
                          </span>
                        </div>
                      </td>

                      {/* Landing Page */}
                      <td className="py-3 px-3">
                        <div
                          className="max-w-[150px] truncate font-mono text-[11px] text-blue-700"
                          title={s.landing_page || "/"}
                        >
                          {s.landing_page || "/"}
                        </div>
                      </td>

                      {/* Device & Browser */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5 text-[11px] text-slate-700">
                          <div className="flex items-center gap-1 font-semibold">
                            {s.device === "Mobile" ? (
                              <Smartphone size={11} className="text-slate-400" />
                            ) : s.device === "Tablet" ? (
                              <Tablet size={11} className="text-slate-400" />
                            ) : (
                              <Monitor size={11} className="text-slate-400" />
                            )}
                            <span>{s.device || "Desktop"}</span>
                            <span className="text-slate-300">·</span>
                            <span>{s.os || "OS"}</span>
                          </div>
                          <p className="text-[10px] text-slate-400">{s.browser || "Browser"}</p>
                        </div>
                      </td>

                      {/* Page Views Count */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-block font-mono font-bold text-slate-900 bg-slate-100 rounded px-2 py-0.5 text-xs">
                          {s.page_views || 1}
                        </span>
                      </td>

                      {/* Last Active Timestamp */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5 text-[11px]">
                          <p className="font-medium text-slate-900">
                            {formatAnalyticsDate(s.last_seen)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            First: {formatAnalyticsDate(s.first_seen)}
                          </p>
                        </div>
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenTimeline(s)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                          title="View session event clickstream timeline"
                        >
                          <Clock size={11} className="text-blue-600" />
                          <span>Timeline</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <ChevronLeft size={13} /> Previous
            </button>
            <span className="text-xs text-slate-600 font-medium">
              Page <strong className="font-mono">{page}</strong> of{" "}
              <strong className="font-mono">{totalPages}</strong>
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Session Clickstream Timeline Drawer Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-blue-600" />
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Session Clickstream Timeline
                  </h3>
                </div>
                <p className="font-mono text-[11px] text-slate-500">
                  Session: {selectedSession.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Events List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingEvents ? (
                <div className="p-8 flex flex-col items-center justify-center text-slate-500 space-y-2">
                  <Loader2 size={20} className="animate-spin text-blue-600" />
                  <p className="text-xs">Loading session events...</p>
                </div>
              ) : sessionEvents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 italic">
                  No individual clickstream events logged for this session.
                </div>
              ) : (
                <div className="relative border-l-2 border-blue-200 ml-4 space-y-4 pl-4">
                  {sessionEvents.map((evt) => (
                    <div key={evt.id} className="relative group">
                      {/* Timeline Dot */}
                      <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-600 border-2 border-white" />
                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{evt.event_type}</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {formatAnalyticsDate(evt.created_at)}
                          </span>
                        </div>
                        {evt.path && (
                          <p className="font-mono text-[11px] text-blue-700">{evt.path}</p>
                        )}
                        {evt.meta && Object.keys(evt.meta).length > 0 && (
                          <pre className="mt-1 p-2 rounded bg-white border border-slate-100 text-[10px] text-slate-600 font-mono overflow-x-auto">
                            {JSON.stringify(evt.meta, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-200 px-5 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default Audits;
