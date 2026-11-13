// ITHUB_ADMIN/src/pages/Dashboard.tsx
// High-Level Operational Triage Dashboard for PC Quotations & Services
// IT HUB — Kerala, India

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  Cpu,
  Wrench,
  AlertTriangle,
  Clock,
  CheckCircle2,
  PhoneCall,
  ArrowRight,
  RefreshCw,
  Layers,
  FileCheck,
  ShieldCheck,
  CheckCheck,
  History,
  Activity,
  Bell,
  Truck,
  Home,
  Store,
  ExternalLink,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { StaffProfile } from "../lib/auth";
import { getQuotationStats } from "../lib/quotations";
import { HardwareDashboardCard } from "../components/HardwareDashboardCard";
import {
  getServiceStats,
  generateAlertsFromTickets,
  markAlertAsRead,
  markAllAlertsAsRead,
  getUnreadAlertCount,
  loadStoredAlerts,
  saveStoredAlerts,
  getServiceMethodInfo,
  formatTicketReference,
  type AdminAlert,
} from "../lib/services";

interface DashboardProps {
  profile: StaffProfile;
}

export function Dashboard({ profile }: DashboardProps) {
  const [quotationStats, setQuotationStats] = useState({
    totalNew: 0,
    totalContacted: 0,
    totalQuoted: 0,
    totalClosed: 0,
    totalFlaggedReview: 0,
  });

  const [serviceStats, setServiceStats] = useState({
    totalBooked: 0,
    totalInDiagnosis: 0,
    totalAwaitingApproval: 0,
    totalCompleted: 0,
  });

  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    const client = supabase;
    if (!client) return;

    try {
      const { data, error } = await client
        .from("service_requests_staff")
        .select("*, profiles:user_id(full_name, phone, email)")
        .order("updated_at", { ascending: false })
        .limit(30);

      if (!error && data) {
        const tickets = data.map((row: any) => ({
          ...row,
          customer_name: row.profiles?.full_name || "Valued Customer",
          customer_phone: row.profiles?.phone || "",
        }));

        const stored = loadStoredAlerts();
        const generated = generateAlertsFromTickets(tickets, stored);
        setAlerts(generated);
        saveStoredAlerts(generated);
      }
    } catch (err) {
      console.error("Failed to load alerts:", err);
    }
  }, []);

  const loadAllStats = useCallback(async () => {
    setLoading(true);
    const [qStats, sStats] = await Promise.all([
      getQuotationStats(),
      getServiceStats(),
      loadAlerts(),
    ]);
    setQuotationStats(qStats);
    setServiceStats(sStats);
    setLoading(false);
  }, [loadAlerts]);

  useEffect(() => {
    loadAllStats();
  }, [loadAllStats]);

  // Realtime subscription for incoming service bookings & updates
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const channel = client
      .channel("admin-dashboard-alerts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => {
        loadAlerts();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [loadAlerts]);

  const handleMarkRead = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setAlerts((prev) => {
      const updated = markAlertAsRead(prev, id);
      saveStoredAlerts(updated);
      return updated;
    });
  };

  const handleMarkAllRead = () => {
    setAlerts((prev) => {
      const updated = markAllAlertsAsRead(prev);
      saveStoredAlerts(updated);
      return updated;
    });
  };

  const unreadCount = getUnreadAlertCount(alerts);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* ─────────────────────────────────────────────────────────────────────────────
          1. Operational Header
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Operational Workspace
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
              Live Overview
            </span>
          </div>
          <p className="mt-1.5 text-xs font-medium text-slate-500">
            Welcome back, <strong className="text-slate-800">{profile.full_name}</strong>. Real-time
            status across PC Builder quotations and workbench repair workflows.
          </p>
        </div>

        <button
          onClick={loadAllStats}
          disabled={loading}
          aria-label="Refresh operational statistics"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-all duration-200 active:scale-95"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-blue-600" : ""} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          Operational Alert Notification Center (Three Service Methods)
          ───────────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shadow-2xs border border-amber-200 mt-0.5 sm:mt-0">
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
                  Operational Alerts &amp; Dispatch Notifications
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                    unreadCount > 0
                      ? "bg-red-100 text-red-700 border border-red-200 animate-pulse"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {unreadCount > 0 ? `${unreadCount} Unread Actions` : "All Caught Up"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Actionable alerts across Courier, On-site Technician Visits, and Walk-in customer
                triage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs min-h-[38px]"
              >
                <CheckCheck size={14} className="text-blue-600" />
                <span>Mark All Read</span>
              </button>
            )}
            <Link
              to="/services"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition min-h-[38px]"
            >
              <span>Service Desk</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xs">
            <CheckCircle2 size={24} className="mx-auto text-emerald-600 mb-2" />
            <p className="text-xs font-bold text-slate-700">No pending operational alerts</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              New bookings, customer arrivals, reschedule requests, and quote approvals will appear
              here live.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alerts.slice(0, 6).map((alert) => {
              const methodInfo = getServiceMethodInfo(alert.method);
              return (
                <div
                  key={alert.id}
                  className={`group relative rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between ${
                    !alert.read
                      ? "border-amber-300 bg-linear-to-b from-amber-50/60 to-white shadow-2xs"
                      : "border-slate-200 bg-white hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  <div className="space-y-2">
                    {/* Alert Header: Method Badge + Ticket ID + Action Tag */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${methodInfo.badgeClass}`}
                      >
                        {methodInfo.iconName === "Truck" && <Truck size={11} />}
                        {methodInfo.iconName === "Home" && <Home size={11} />}
                        {methodInfo.iconName === "Store" && <Store size={11} />}
                        <span>{methodInfo.label}</span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        {alert.actionRequired && (
                          <span className="rounded-full bg-red-100 text-red-800 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider border border-red-200">
                            Action
                          </span>
                        )}
                        {!alert.read && (
                          <span
                            className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"
                            title="Unread alert"
                          />
                        )}
                      </div>
                    </div>

                    {/* Alert Title & Ticket ID */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                        <span className="truncate">{alert.title}</span>
                        <span className="font-mono text-[10px] font-bold text-slate-500 shrink-0 ml-1">
                          {alert.ticketReference || formatTicketReference(alert.ticketId)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
                        {alert.description}
                      </p>
                    </div>

                    {/* Customer Info */}
                    <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="font-medium text-slate-700 truncate max-w-[150px]">
                        {alert.customerName}
                      </span>
                      <span>
                        {new Date(alert.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Actions: View Ticket & Mark Read */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <Link
                      to={`/services?ticket=${alert.ticketId}`}
                      onClick={() => handleMarkRead(alert.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 transition"
                    >
                      <span>Open Ticket</span>
                      <ExternalLink size={12} />
                    </Link>

                    {!alert.read && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkRead(alert.id, e)}
                        className="text-[10px] font-semibold text-slate-400 hover:text-slate-700 transition"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Stage 4B: the Hardware Specification Manager's summary, for Admin and Staff. */}
      {profile.permissions.can_manage_quotations && <HardwareDashboardCard />}

      {/* ─────────────────────────────────────────────────────────────────────────────
          2. PC Builder Quotations
          ───────────────────────────────────────────────────────────────────────────── */}
      {profile.permissions.can_manage_quotations && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 shadow-2xs border border-blue-200 shrink-0">
                <Cpu size={17} />
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  PC Builder Quotations
                </h2>
                <p className="text-[11px] text-slate-500">
                  Custom build customer enquiries &amp; triage
                </p>
              </div>
            </div>
            <Link
              to="/quotations"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition min-h-[38px] self-start sm:self-auto"
            >
              <span>Open Quotation Queue</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <Link
              to="/quotations"
              className="rounded-2xl border border-blue-200 bg-linear-to-b from-blue-50/70 to-blue-50/30 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300 block"
            >
              <div className="flex items-center justify-between text-blue-700">
                <span className="text-xs font-bold uppercase tracking-wider">New Enquiries</span>
                <Clock size={16} />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-blue-900">
                {quotationStats.totalNew}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-blue-600">
                Pending initial contact
              </p>
            </Link>

            <Link
              to="/quotations"
              className="rounded-2xl border border-amber-200 bg-linear-to-b from-amber-50/70 to-amber-50/30 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-amber-300 block"
            >
              <div className="flex items-center justify-between text-amber-700">
                <span className="text-xs font-bold uppercase tracking-wider">In Contact</span>
                <PhoneCall size={16} />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-amber-900">
                {quotationStats.totalContacted}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                Under customer discussion
              </p>
            </Link>

            <Link
              to="/quotations"
              className="rounded-2xl border border-purple-200 bg-linear-to-b from-purple-50/70 to-purple-50/30 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-purple-300 block"
            >
              <div className="flex items-center justify-between text-purple-700">
                <span className="text-xs font-bold uppercase tracking-wider">Quoted</span>
                <FileCheck size={16} />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-purple-900">
                {quotationStats.totalQuoted}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-purple-700">
                Formal pricing issued
              </p>
            </Link>

            <Link
              to="/quotations"
              className="rounded-2xl border border-emerald-200 bg-linear-to-b from-emerald-50/70 to-emerald-50/30 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-300 block"
            >
              <div className="flex items-center justify-between text-emerald-700">
                <span className="text-xs font-bold uppercase tracking-wider">Closed</span>
                <CheckCircle2 size={16} />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-900">
                {quotationStats.totalClosed}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                Completed &amp; archived
              </p>
            </Link>

            <Link
              to="/quotations"
              className="rounded-2xl border border-amber-200/90 bg-linear-to-b from-amber-50/80 to-amber-50/30 p-4 col-span-2 sm:col-span-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-amber-300 block"
            >
              <div className="flex items-center justify-between text-amber-700">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Technician Review
                </span>
                <AlertTriangle size={16} className="text-amber-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-amber-900">
                {quotationStats.totalFlaggedReview}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                Price or compatibility flagged
              </p>
            </Link>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          3. Service & Repair Workbench
          ───────────────────────────────────────────────────────────────────────────── */}
      {profile.permissions.can_manage_services && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-2xs border border-emerald-200 shrink-0">
                <Wrench size={17} />
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Service &amp; Repair Workbench
                </h2>
                <p className="text-[11px] text-slate-500">
                  Live service ticket stages &amp; technician workbench
                </p>
              </div>
            </div>
            <Link
              to="/services"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 transition min-h-[38px] self-start sm:self-auto"
            >
              <span>Open Service Desk</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <Link
              to="/services"
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300 block"
            >
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-xs font-bold uppercase tracking-wider">Booked / Intake</span>
                <Clock size={16} className="text-blue-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {serviceStats.totalBooked}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                Awaiting device check-in
              </p>
            </Link>

            <Link
              to="/services"
              className="rounded-2xl border border-amber-200 bg-linear-to-b from-amber-50/50 to-white p-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-amber-300 block"
            >
              <div className="flex items-center justify-between text-amber-700">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Workbench Testing
                </span>
                <Activity size={16} />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-amber-900">
                {serviceStats.totalInDiagnosis}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                Active diagnosis &amp; test
              </p>
            </Link>

            <Link
              to="/services"
              className="rounded-2xl border border-purple-200 bg-linear-to-b from-purple-50/50 to-white p-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-purple-300 block"
            >
              <div className="flex items-center justify-between text-purple-700">
                <span className="text-xs font-bold uppercase tracking-wider">Customer Review</span>
                <Layers size={16} />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-purple-900">
                {serviceStats.totalAwaitingApproval}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-purple-700">
                Quotation awaiting approval
              </p>
            </Link>

            <Link
              to="/services"
              className="rounded-2xl border border-emerald-200 bg-linear-to-b from-emerald-50/50 to-white p-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-300 block"
            >
              <div className="flex items-center justify-between text-emerald-700">
                <span className="text-xs font-bold uppercase tracking-wider">Completed</span>
                <CheckCircle2 size={16} />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-900">
                {serviceStats.totalCompleted}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                Handed over or ready
              </p>
            </Link>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          4. Security & Operational Audit Guarantees
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={16} className="text-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Security &amp; Operational Audit Guarantees
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 transition hover:border-slate-300">
            <div className="flex items-center gap-2 mb-1.5 text-slate-900">
              <ShieldCheck size={15} className="text-blue-600" />
              <strong className="font-bold text-xs">Server-Side RLS Enforcement</strong>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Database operations are strictly restricted to verified staff identities. Browser
              route guards are backed by PostgreSQL security-definer triggers.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 transition hover:border-slate-300">
            <div className="flex items-center gap-2 mb-1.5 text-slate-900">
              <CheckCheck size={15} className="text-emerald-600" />
              <strong className="font-bold text-xs">Shopify Price Verification</strong>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              All PC Builder quotations are re-evaluated against live Shopify variant GIDs. Pricing
              divergence flags technician review automatically.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 transition hover:border-slate-300">
            <div className="flex items-center gap-2 mb-1.5 text-slate-900">
              <History size={15} className="text-purple-600" />
              <strong className="font-bold text-xs">Append-Only Audit Trail</strong>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Every quotation status progression and service assignment records an immutable audit
              trail entry in{" "}
              <code className="font-mono text-[10px] bg-slate-200/80 px-1 py-0.5 rounded-sm">
                public.staff_audit_logs
              </code>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
