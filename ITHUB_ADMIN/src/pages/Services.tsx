// ITHUB_ADMIN/src/pages/Services.tsx
// Service Management Queue with Search, Device Filters & Server Pagination

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  User,
  Wrench,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  Truck,
  Home,
  Store,
  Layers,
  MessageCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  type ServiceRecord,
  type ServiceStatus,
  type CanonicalServiceMethod,
  type ServiceMethodCounts,
  fetchServices,
  updateServiceStatus,
  getStatusOptionsForMethod,
  getServiceMethodInfo,
  getServiceMethodCounts,
  fetchServiceById,
  formatTicketReference,
} from "../lib/services";
import { ServiceDetailModal } from "../components/ServiceDetailModal";

export function Services() {
  const [searchParams] = useSearchParams();
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState<"ALL" | CanonicalServiceMethod>("ALL");
  const [methodCounts, setMethodCounts] = useState<ServiceMethodCounts>({
    all: 0,
    courier: 0,
    onsite: 0,
    walkIn: 0,
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<ServiceRecord | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const activeRequestIdRef = useRef<number>(0);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Debounce search input to avoid runaway network requests while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Clean up feedback toast timer on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  // Dismiss status filter dropdown on outside click or Escape key
  useEffect(() => {
    if (!statusDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStatusDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [statusDropdownOpen]);

  const showFeedback = (type: "success" | "error", message: string) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setFeedback({ type, message });
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  const loadData = useCallback(async () => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    const [result, counts] = await Promise.all([
      fetchServices({
        page,
        pageSize,
        status,
        category,
        method: methodFilter,
        searchQuery: debouncedSearch,
        sortBy: "created_at",
        sortOrder: "desc",
      }),
      getServiceMethodCounts(),
    ]);

    // Discard stale responses if a newer request has started
    if (requestId !== activeRequestIdRef.current) return;

    setServices(result.services);
    setSelectedService((prev) =>
      prev ? result.services.find((s) => s.id === prev.id) || prev : null,
    );
    setTotalCount(result.totalCount);
    setTotalPages(result.totalPages || 1);
    setMethodCounts(counts);
    setLoading(false);
  }, [page, pageSize, status, category, methodFilter, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime live ticket synchronisation across Staff Portal sessions
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel("admin-services-realtime-desk")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [loadData]);

  // Click-through direct ticket selection from Admin Notifications or deep links
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    if (ticketId) {
      fetchServiceById(ticketId).then((ticket) => {
        if (ticket) {
          setSelectedService(ticket);
        }
      });
    }
  }, [searchParams]);

  const handleMethodChange = (newMethod: "ALL" | CanonicalServiceMethod) => {
    setMethodFilter(newMethod);
    setPage(1);
  };

  const handleInlineStatusChange = async (
    item: ServiceRecord,
    newStatus: ServiceStatus,
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    e.stopPropagation();
    if (updatingStatusId) return;
    if (item.status === newStatus) return;

    // Strict non-reversion check
    if (item.status === "Completed" && newStatus !== "Completed") {
      showFeedback(
        "error",
        "Completed service requests are finalized and cannot be reverted to earlier statuses.",
      );
      return;
    }

    setUpdatingStatusId(item.id);

    try {
      const res = await updateServiceStatus(
        item.id,
        newStatus,
        item.technician_name || undefined,
        item.notes || undefined,
        item.findings,
      );

      if (res.ok) {
        setServices((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, status: newStatus } : s)),
        );
        showFeedback(
          "success",
          `Ticket ${item.ticket_reference || formatTicketReference(item.id)} status updated to "${newStatus === "In Progress" ? "In Progress (Repairing)" : newStatus}".`,
        );
      } else {
        showFeedback("error", res.error || "Failed to update ticket status.");
      }
    } catch (err: any) {
      showFeedback("error", err?.message || "An unexpected error occurred while updating status.");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
    setPage(1);
  };

  const statusFilters = [
    { id: "ALL", label: "All Tickets" },
    { id: "Booked", label: "Booked" },
    { id: "Technician Assigned", label: "Tech Assigned" },
    { id: "Device Received", label: "Device Received" },
    { id: "Under Diagnosis", label: "Under Diagnosis" },
    { id: "In Progress", label: "In Progress" },
    { id: "Diagnosis Done", label: "Diagnosis Done" },
    { id: "Awaiting Approval", label: "Awaiting Approval" },
    { id: "Quality Check", label: "Quality Check" },
    { id: "Ready for Pickup", label: "Ready for Pickup" },
    { id: "Completed", label: "Completed" },
    { id: "Delivered", label: "Delivered" },
  ];

  const categoryFilters = ["ALL", "Laptop", "Desktop", "Mobile", "Printer", "CCTV", "Monitor"];

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Service Management Desk
            </h1>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              {totalCount} Active Tickets
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Dispatch technicians, publish itemized repair quotations, and manage customer workbench
            progress.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition shrink-0 self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-red-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Canonical Service Method Filters & Device Category Pills */}
      <div className="space-y-3">
        {/* Three Canonical Method Filter Controls with Live Counts */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-thin">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Intake Method:
          </span>

          {/* All Tickets / All Methods */}
          <button
            type="button"
            onClick={() => handleMethodChange("ALL")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition whitespace-nowrap shrink-0 border ${
              methodFilter === "ALL"
                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Layers size={13} />
            <span>All Methods</span>
            <span
              className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                methodFilter === "ALL"
                  ? "bg-slate-800 text-slate-200"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {methodCounts.all}
            </span>
          </button>

          {/* 1. Courier to IT HUB */}
          <button
            type="button"
            onClick={() => handleMethodChange("Courier to IT HUB")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition whitespace-nowrap shrink-0 border ${
              methodFilter === "Courier to IT HUB"
                ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                : "bg-purple-50/70 text-purple-700 border-purple-200/80 hover:bg-purple-100/70"
            }`}
          >
            <Truck size={13} />
            <span>Courier</span>
            <span
              className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                methodFilter === "Courier to IT HUB"
                  ? "bg-purple-700 text-purple-100"
                  : "bg-purple-100 text-purple-800"
              }`}
            >
              {methodCounts.courier}
            </span>
          </button>

          {/* 2. On-site Technician Visit */}
          <button
            type="button"
            onClick={() => handleMethodChange("On-site Technician Visit")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition whitespace-nowrap shrink-0 border ${
              methodFilter === "On-site Technician Visit"
                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                : "bg-blue-50/70 text-blue-700 border-blue-200/80 hover:bg-blue-100/70"
            }`}
          >
            <Home size={13} />
            <span>On-site</span>
            <span
              className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                methodFilter === "On-site Technician Visit"
                  ? "bg-blue-700 text-blue-100"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {methodCounts.onsite}
            </span>
          </button>

          {/* 3. Visit IT HUB */}
          <button
            type="button"
            onClick={() => handleMethodChange("Visit IT HUB")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition whitespace-nowrap shrink-0 border ${
              methodFilter === "Visit IT HUB"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                : "bg-emerald-50/70 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100/70"
            }`}
          >
            <Store size={13} />
            <span>Visit IT HUB</span>
            <span
              className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                methodFilter === "Visit IT HUB"
                  ? "bg-emerald-700 text-emerald-100"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {methodCounts.walkIn}
            </span>
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-thin">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Category:
          </span>
          {categoryFilters.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`rounded-full px-3 py-1 font-semibold transition whitespace-nowrap shrink-0 ${
                category === cat
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat === "ALL" ? "All Devices" : cat}
            </button>
          ))}
        </div>

        {/* Status Dropdown Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div ref={statusDropdownRef} className="relative z-20 w-full sm:w-auto">
            <button
              type="button"
              role="combobox"
              aria-label="Filter tickets by status"
              aria-expanded={statusDropdownOpen}
              onClick={() => setStatusDropdownOpen((prev) => !prev)}
              className="inline-flex min-h-[42px] w-full sm:w-64 items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 shadow-2xs hover:border-slate-300 hover:bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:scale-[0.99] transition"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold shrink-0">
                  Status:
                </span>
                <span className="truncate text-slate-800">
                  {(statusFilters.find((f) => f.id === status) || statusFilters[0]).label}
                </span>
                {status === "ALL" ? (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-600">
                    {totalCount}
                  </span>
                ) : null}
              </div>
              <ChevronDown
                size={14}
                className={`text-slate-500 transition-transform duration-200 shrink-0 ${
                  statusDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {statusDropdownOpen && (
              <div
                role="listbox"
                className="absolute left-0 top-full mt-1.5 w-full sm:w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 max-h-80 overflow-y-auto scrollbar-thin"
              >
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                  Filter by Ticket Status
                </div>
                {statusFilters.map((tab) => {
                  const isSelected = status === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        handleStatusChange(tab.id);
                        setStatusDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        isSelected
                          ? "bg-emerald-50 text-emerald-800 font-bold shadow-2xs"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {isSelected ? (
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      ) : tab.id === "ALL" ? (
                        <span className="text-[10px] font-bold text-slate-400">{totalCount}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={handleSearchSubmit} className="relative w-full xl:w-80 shrink-0">
            <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket ref (ITH-SER-...), device, customer, problem..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-20 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100 shadow-2xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-12 top-2 text-[10px] font-bold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
            >
              Find
            </button>
          </form>
        </div>
      </div>

      {/* Scroll indicator hint for narrow desktop/tablet viewports */}
      <div className="hidden lg:flex xl:hidden items-center justify-between text-[11px] text-slate-400 px-1">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          Scroll table horizontally if viewing on a compact screen &rarr;
        </span>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          A. Desktop View: Full-Width Properly Proportioned Ticket Table (lg+)
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="hidden lg:block overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xs">
        {/* Dedicated Responsive Container */}
        <div
          className="relative w-full overflow-x-auto min-w-0 focus:outline-none"
          tabIndex={0}
          role="region"
          aria-label="Service Tickets Table"
        >
          <table className="w-full min-w-[1160px] table-fixed text-left text-xs divide-y divide-slate-200">
            <colgroup>
              <col className="w-[145px]" />
              <col className="w-[23%] min-w-[185px]" />
              <col className="w-[16%] min-w-[140px]" />
              <col className="w-[125px]" />
              <col className="w-[175px]" />
              <col className="w-[95px]" />
              <col className="w-[110px]" />
              <col className="w-[105px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead className="bg-slate-50/70 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th scope="col" className="px-3.5 py-3.5">
                  Ticket ID
                </th>
                <th scope="col" className="px-3.5 py-3.5">
                  Device &amp; Problem
                </th>
                <th scope="col" className="px-3.5 py-3.5">
                  Customer &amp; Contact
                </th>
                <th scope="col" className="px-2.5 py-3.5">
                  Method
                </th>
                <th scope="col" className="px-3 py-3.5">
                  Status
                </th>
                <th scope="col" className="px-3 py-3.5 text-right">
                  Quote &amp; State
                </th>
                <th scope="col" className="px-3.5 py-3.5">
                  Technician
                </th>
                <th scope="col" className="px-3 py-3.5">
                  Booked
                </th>
                <th scope="col" className="px-3 py-3.5 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw size={24} className="mx-auto animate-spin text-emerald-600 mb-2" />
                    <span>Loading service tickets…</span>
                  </td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <p className="font-bold text-slate-700">No service requests found</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Try adjusting your category or status filter parameters.
                    </p>
                  </td>
                </tr>
              ) : (
                services.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedService(item)}
                    className="hover:bg-emerald-50/30 cursor-pointer transition"
                  >
                    {/* Ticket ID */}
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-900 align-middle whitespace-nowrap">
                      {item.ticket_reference || formatTicketReference(item.id)}
                    </td>

                    {/* Device & Issue */}
                    <td className="px-4 py-3.5 align-middle">
                      <p
                        className="font-bold text-slate-900 truncate"
                        title={`${item.device}${item.model ? ` (${item.model})` : ""}`}
                      >
                        {item.device} {item.model && `(${item.model})`}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate" title={item.problem}>
                        {item.problem}
                      </p>
                      {item.findings && item.findings.length > 0 && (
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200/60 shrink-0">
                            <Wrench size={10} />
                            <span>
                              {item.findings.length} Diagnostic Finding
                              {item.findings.length > 1 ? "s" : ""}
                            </span>
                          </span>
                          {item.findings[0]?.title && (
                            <span
                              className="text-[10px] text-slate-600 font-medium truncate max-w-[120px]"
                              title={item.findings[0].title}
                            >
                              {item.findings[0].title}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3.5 align-middle">
                      <p
                        className="font-bold text-slate-900 truncate"
                        title={item.customer_name || "Valued Customer"}
                      >
                        {item.customer_name || "Valued Customer"}
                      </p>
                      <p
                        className="text-[11px] text-slate-500 truncate"
                        title={item.customer_phone || "No phone"}
                      >
                        {item.customer_phone || "No phone"}
                      </p>
                    </td>

                    {/* Method Badge with Canonical Icon & Styling */}
                    <td className="px-2.5 py-3.5 align-middle">
                      {(() => {
                        const info = getServiceMethodInfo(item.method);
                        return (
                          <span
                            title={info.description}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold border shadow-2xs ${info.badgeClass}`}
                          >
                            {info.iconName === "Truck" && <Truck size={12} className="shrink-0" />}
                            {info.iconName === "Home" && <Home size={12} className="shrink-0" />}
                            {info.iconName === "Store" && <Store size={12} className="shrink-0" />}
                            <span>{info.shortLabel}</span>
                          </span>
                        );
                      })()}
                    </td>

                    {/* Status with tailored method pipeline */}
                    <td
                      className="px-3 py-3.5 align-middle"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="relative w-full min-w-0 flex items-center">
                        <select
                          value={item.status}
                          disabled={updatingStatusId === item.id}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleInlineStatusChange(item, e.target.value as ServiceStatus, e)
                          }
                          className={`w-full min-w-0 rounded-lg border py-1.5 pl-2.5 pr-8 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 appearance-none shadow-2xs truncate ${
                            item.status === "Booked"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : item.status === "Technician Assigned"
                                ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                                : item.status === "Technician has Left IT HUB" ||
                                    item.status === "Technician on the Way"
                                  ? "bg-cyan-50 text-cyan-800 border-cyan-200"
                                  : item.status === "Technician Arrived at Your Location" ||
                                      item.status === "Technician Arrived"
                                    ? "bg-violet-50 text-violet-800 border-violet-200"
                                    : item.status === "Customer Arrived"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : item.status === "Device Received"
                                        ? "bg-teal-50 text-teal-800 border-teal-300"
                                        : item.status === "Under Diagnosis"
                                          ? "bg-sky-50 text-sky-800 border-sky-300"
                                          : item.status === "In Progress" ||
                                              item.status === "Service in Progress"
                                            ? "bg-amber-50 text-amber-800 border-amber-300"
                                            : item.status === "Ready for Pickup"
                                              ? "bg-lime-50 text-lime-800 border-lime-300"
                                              : item.status === "Diagnosis Done"
                                                ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                                                : item.status === "Awaiting Approval"
                                                  ? "bg-purple-50 text-purple-800 border-purple-200"
                                                  : item.status === "Approved"
                                                    ? "bg-lime-50 text-lime-800 border-lime-300"
                                                    : item.status === "Quality Check"
                                                      ? "bg-cyan-50 text-cyan-800 border-cyan-300"
                                                      : item.status === "Ready for Delivery"
                                                        ? "bg-violet-50 text-violet-800 border-violet-300"
                                                        : item.status === "Completed"
                                                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                          : item.status === "Delivered"
                                                            ? "bg-green-50 text-green-800 border-green-200"
                                                            : item.status === "Reschedule Requested"
                                                              ? "bg-amber-100 text-amber-900 border-amber-300"
                                                              : item.status === "Rescheduled"
                                                                ? "bg-sky-100 text-sky-900 border-sky-300"
                                                                : "bg-slate-100 text-slate-800 border-slate-200"
                          }`}
                        >
                          {getStatusOptionsForMethod(item.method, item.status).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt === "In Progress" &&
                              (item.method.toLowerCase().includes("courier") ||
                                item.method.toLowerCase().includes("pickup"))
                                ? "In Progress (Repairing)"
                                : opt}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                          {updatingStatusId === item.id ? (
                            <LoaderCircle size={13} className="animate-spin text-blue-600" />
                          ) : (
                            <ChevronDown size={13} className="text-slate-500 opacity-70" />
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Quote & State */}
                    <td className="px-4 py-3.5 text-right font-mono align-middle">
                      {item.quote ? (
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900 truncate">
                            {formatCurrency(item.quote)}
                          </p>
                          {item.quote_state && (
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                                item.quote_state === "approved"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : item.quote_state === "rejected"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {item.quote_state}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No quote</span>
                      )}
                    </td>

                    {/* Technician */}
                    <td className="px-4 py-3.5 align-middle">
                      {item.technician_name ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 truncate max-w-full"
                          title={item.technician_name}
                        >
                          <User size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{item.technician_name}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-3 py-3.5 text-[11px] text-slate-600 whitespace-nowrap align-middle">
                      <span className="font-medium">
                        {new Date(item.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-3.5 py-3.5 text-right align-middle whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedService(item);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition"
                      >
                        <Eye size={13} />
                        <span>Manage</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server Pagination Footer (Desktop) */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 text-xs text-slate-600">
          <div>
            Showing <strong className="text-slate-900">{services.length}</strong> of{" "}
            <strong className="text-slate-900">{totalCount}</strong> service tickets
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="font-bold text-slate-800 px-1">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          B. Mobile & Tablet View: High-Density Responsive Ticket Cards (< lg)
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="block lg:hidden space-y-3.5">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-2xs">
            <RefreshCw size={24} className="mx-auto animate-spin text-emerald-600 mb-2" />
            <p className="text-xs font-bold text-slate-600">Loading service tickets…</p>
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-2xs">
            <p className="font-bold text-slate-800 text-sm">No service requests found</p>
            <p className="mt-1 text-xs text-slate-400">
              Try adjusting your category, method, or status filters.
            </p>
          </div>
        ) : (
          services.map((item) => {
            const info = getServiceMethodInfo(item.method);
            return (
              <div
                key={item.id}
                onClick={() => setSelectedService(item)}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition cursor-pointer space-y-3"
              >
                {/* Card Top: Ticket ID + Method Badge + Date */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                      {item.ticket_reference || formatTicketReference(item.id)}
                    </span>
                    <span
                      title={info.description}
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-bold border shadow-2xs ${info.badgeClass}`}
                    >
                      {info.iconName === "Truck" && <Truck size={11} className="shrink-0" />}
                      {info.iconName === "Home" && <Home size={11} className="shrink-0" />}
                      {info.iconName === "Store" && <Store size={11} className="shrink-0" />}
                      <span>{info.shortLabel}</span>
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium">
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>

                {/* Device & Problem Details */}
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {item.device} {item.model && `(${item.model})`}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{item.problem}</p>
                  {item.findings && item.findings.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200/60">
                        <Wrench size={10} />
                        <span>
                          {item.findings.length} Finding{item.findings.length > 1 ? "s" : ""}
                        </span>
                      </span>
                      {item.findings[0]?.title && (
                        <span className="text-[10px] text-slate-500 font-medium truncate max-w-[180px]">
                          {item.findings[0].title}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Customer Info & WhatsApp Link */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">
                      {item.customer_name || "Valued Customer"}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {item.customer_phone || "No phone"}
                    </p>
                  </div>
                  {item.customer_phone && (
                    <a
                      href={`https://wa.me/${item.customer_phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition min-h-[38px] shrink-0"
                    >
                      <MessageCircle size={13} />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>

                {/* Quote & Technician Info Row */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      Quote
                    </span>
                    {item.quote ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(item.quote)}
                        </span>
                        {item.quote_state && (
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider border ${
                              item.quote_state === "approved"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : item.quote_state === "rejected"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {item.quote_state}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic mt-0.5">No quote</p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      Technician
                    </span>
                    {item.technician_name ? (
                      <p className="font-semibold text-slate-800 flex items-center gap-1 justify-end text-[11px] mt-0.5">
                        <User size={12} className="text-slate-400" />
                        <span className="truncate max-w-[120px]">{item.technician_name}</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic mt-0.5">Unassigned</p>
                    )}
                  </div>
                </div>

                {/* Inline Status Dropdown & Action Button */}
                <div
                  className="flex items-center gap-2 pt-2 border-t border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative flex-1 min-w-0">
                    <select
                      value={item.status}
                      disabled={updatingStatusId === item.id}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        handleInlineStatusChange(item, e.target.value as ServiceStatus, e)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-[11px] font-bold uppercase tracking-wider text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] appearance-none shadow-2xs truncate"
                    >
                      {getStatusOptionsForMethod(item.method, item.status).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === "In Progress" &&
                          (item.method.toLowerCase().includes("courier") ||
                            item.method.toLowerCase().includes("pickup"))
                            ? "In Progress (Repairing)"
                            : opt}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                      {updatingStatusId === item.id ? (
                        <LoaderCircle size={14} className="animate-spin text-blue-600" />
                      ) : (
                        <ChevronDown size={14} className="text-slate-500 opacity-70" />
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedService(item);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-white px-4 py-2 text-xs font-bold hover:bg-slate-800 active:scale-95 transition min-h-[44px] shrink-0"
                  >
                    <Eye size={14} />
                    <span>Manage</span>
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Server Pagination Footer (Mobile Cards) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-2xs">
          <div className="text-center sm:text-left">
            Showing <strong className="text-slate-900">{services.length}</strong> of{" "}
            <strong className="text-slate-900">{totalCount}</strong> tickets
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 min-h-[44px] transition"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="font-bold text-slate-800 px-2 whitespace-nowrap">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 min-h-[44px] transition"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedService && (
        <ServiceDetailModal
          service={selectedService}
          onClose={() => setSelectedService(null)}
          onUpdated={loadData}
        />
      )}
    </div>
  );
}
