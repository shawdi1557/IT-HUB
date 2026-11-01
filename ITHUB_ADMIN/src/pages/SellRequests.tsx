// ITHUB_ADMIN/src/pages/SellRequests.tsx
// Customer Sell & Trade-In Hardware Requests Management View
// Authoritative Supabase source: public.sell_requests with atomic staff audit logging

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BadgeIndianRupee,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  Phone,
  ExternalLink,
  X,
  MessageCircle,
  Smartphone,
  Laptop,
  Monitor,
  Printer,
  Cpu,
  ArrowRight,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  type AdminSellRequestRecord,
  type SellRequestStatus,
  fetchSellRequests,
  updateSellRequest,
} from "../lib/sellRequests";

export function SellRequests() {
  const [requests, setRequests] = useState<AdminSellRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<AdminSellRequestRecord | null>(null);
  const [updating, setUpdating] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(
    null,
  );

  // Form states for the detail modal
  const [editStatus, setEditStatus] = useState<SellRequestStatus>("Pending");
  const [editNotes, setEditNotes] = useState("");
  const [editOfferedPrice, setEditOfferedPrice] = useState("");

  // Scroll management for the wide data table
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, requests]);

  const scrollTableLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -320, behavior: "smooth" });
  };

  const scrollTableRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 320, behavior: "smooth" });
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    const res = await fetchSellRequests({
      status: statusFilter,
      searchQuery: debouncedSearch,
    });
    setRequests(res.requests);
    setLoading(false);
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenDetail = (req: AdminSellRequestRecord) => {
    setSelectedRequest(req);
    setEditStatus(req.status);
    setEditNotes(req.admin_notes || "");
    setEditOfferedPrice(req.offered_price ? String(req.offered_price) : "");
    setFeedback(null);
  };

  const handleSaveDetail = async () => {
    if (!selectedRequest) return;
    setUpdating(true);
    setFeedback(null);

    const priceNum = editOfferedPrice ? parseFloat(editOfferedPrice) : null;
    const res = await updateSellRequest(selectedRequest.id, editStatus, editNotes, priceNum);
    setUpdating(false);

    if (res.ok) {
      setFeedback({
        message: `Sell Request for "${selectedRequest.product_name}" updated successfully.`,
        type: "success",
      });
      setSelectedRequest(null);
      loadData();
    } else {
      setFeedback({
        message: res.error || "Failed to update sell request.",
        type: "error",
      });
    }
  };

  const getStatusBadge = (status: SellRequestStatus) => {
    switch (status) {
      case "Pending":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Under Review":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Contacted":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Approved":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Rejected":
        return "bg-red-50 text-red-700 border-red-200";
      case "Completed":
        return "bg-teal-50 text-teal-700 border-teal-200";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "laptop":
        return Laptop;
      case "phone":
      case "mobile":
        return Smartphone;
      case "desktop":
      case "pc":
      case "desktop / pc":
        return Monitor;
      case "printer":
        return Printer;
      default:
        return Cpu;
    }
  };

  const statusTabs = [
    { id: "ALL", label: "All Submissions" },
    { id: "Pending", label: "Pending" },
    { id: "Under Review", label: "Under Review" },
    { id: "Contacted", label: "Contacted" },
    { id: "Approved", label: "Approved" },
    { id: "Rejected", label: "Rejected" },
    { id: "Completed", label: "Completed" },
  ];

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Sell &amp; Trade-In Requests
            </h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-100">
              {requests.length} Requests
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Review customer hardware submissions, verify device condition, contact sellers, and
            record purchase valuations.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-blue-600" : ""} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2.5 rounded-xl border p-4 text-xs font-medium transition ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-red-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Filters & Search Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-xs font-bold scrollbar-thin">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab.id
                    ? "bg-white text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full xl:w-80 shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search item, customer, phone, brand…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden shadow-2xs"
          />
        </div>
      </div>

      {/* Scroll Discoverability & Controls Bar (Desktop only) */}
      <div className="hidden lg:flex items-center justify-between text-[11px] text-slate-500 px-1">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          <span>
            Wide table: scroll horizontally or use navigation arrows to access all details &amp;
            actions &rarr;
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={scrollTableLeft}
            disabled={!canScrollLeft}
            aria-label="Scroll table left"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            title="Scroll left"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={scrollTableRight}
            disabled={!canScrollRight}
            aria-label="Scroll table right to actions"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            title="Scroll right to actions"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Submissions List Card */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <RefreshCw size={24} className="mx-auto animate-spin text-blue-600 mb-3" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Loading Customer Submissions…
          </p>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-xs">
          <BadgeIndianRupee size={36} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Sell Requests Found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {statusFilter !== "ALL"
              ? `There are no requests matching the "${statusFilter}" status filter.`
              : "No customer sell or trade-in requests have been submitted yet."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View (lg+) */}
          <div className="hidden lg:block overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xs">
            <div
              ref={scrollContainerRef}
              role="region"
              aria-label="Sell Requests Table"
              tabIndex={0}
              className="relative w-full overflow-x-auto min-w-0 focus:outline-none focus:ring-1 focus:ring-blue-500/20 scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 scrollbar-track-slate-100"
            >
              <table className="w-full min-w-[1040px] table-fixed text-left text-xs divide-y divide-slate-100">
                <colgroup>
                  <col className="w-[115px]" />
                  <col className="w-[24%]" />
                  <col className="w-[18%]" />
                  <col className="w-[150px]" />
                  <col className="w-[105px]" />
                  <col className="w-[125px]" />
                  <col className="w-[110px]" />
                  <col className="w-[85px]" />
                </colgroup>
                <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th scope="col" className="py-3.5 px-3.5 text-left">
                      Request &amp; Date
                    </th>
                    <th scope="col" className="py-3.5 px-3.5 text-left">
                      Hardware &amp; Category
                    </th>
                    <th scope="col" className="py-3.5 px-3.5 text-left">
                      Customer Details
                    </th>
                    <th scope="col" className="py-3.5 px-3.5 text-left">
                      Condition &amp; Warranty
                    </th>
                    <th scope="col" className="py-3.5 px-3.5 text-right">
                      Asking Price
                    </th>
                    <th scope="col" className="py-3.5 px-3.5 text-right">
                      Offered Valuation
                    </th>
                    <th scope="col" className="py-3.5 px-3.5 text-left">
                      Status
                    </th>
                    <th scope="col" className="py-3.5 px-3.5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {requests.map((req) => {
                    const CategoryIcon = getCategoryIcon(req.category);
                    const customerName = req.customer?.full_name || "Valued Customer";
                    const customerPhone = req.customer?.phone || "";
                    const cleanPhone = customerPhone.replace(/\D/g, "");

                    return (
                      <tr
                        key={req.id}
                        onClick={() => handleOpenDetail(req)}
                        className="hover:bg-blue-50/30 cursor-pointer transition"
                      >
                        {/* Request ID & Date */}
                        <td className="py-3.5 px-3.5">
                          <span
                            className="font-mono font-bold text-slate-800 bg-slate-100/90 px-2 py-0.5 rounded text-[11px] inline-block border border-slate-200/60"
                            title={`Request ID: ${req.id}`}
                          >
                            #{req.id.slice(0, 8)}
                          </span>
                          <span className="text-[11px] text-slate-500 block mt-1 whitespace-nowrap">
                            {new Date(req.created_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </td>

                        {/* Hardware & Category */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200/60">
                              <CategoryIcon size={18} />
                            </div>
                            <div className="min-w-0">
                              <span
                                className="font-bold text-slate-900 block truncate"
                                title={req.product_name}
                              >
                                {req.product_name}
                              </span>
                              <span
                                className="text-[11px] text-slate-500 block truncate"
                                title={`${req.brand || req.category} ${req.model ? `• ${req.model}` : ""}`}
                              >
                                {req.brand || req.category} {req.model ? `• ${req.model}` : ""}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Customer Details */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span
                              className="font-bold text-slate-900 block truncate"
                              title={customerName}
                            >
                              {customerName}
                            </span>
                            {customerPhone && (
                              <span className="text-[11px] text-slate-500 block truncate font-mono">
                                {customerPhone}
                              </span>
                            )}
                            {req.customer?.email && (
                              <span
                                className="text-[11px] text-slate-400 block truncate"
                                title={req.customer.email}
                              >
                                {req.customer.email}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Condition & Warranty */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200/60 whitespace-nowrap">
                              {req.condition}
                            </span>
                            {req.has_warranty ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                <ShieldCheck size={11} />
                                <span>Active Warranty</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-200 whitespace-nowrap">
                                <ShieldAlert size={11} />
                                <span>No Warranty</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Asking Price */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(req.expected_price)}
                        </td>

                        {/* Offered Valuation */}
                        <td className="py-3.5 px-4 text-right font-mono whitespace-nowrap">
                          {req.offered_price ? (
                            <span className="font-bold text-emerald-700 block">
                              {formatCurrency(req.offered_price)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic block whitespace-nowrap">
                              Pending Valuation
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${getStatusBadge(
                              req.status,
                            )}`}
                          >
                            {req.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-3.5 text-right">
                          <div
                            className="flex items-center justify-end gap-1.5 whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {cleanPhone && (
                              <a
                                href={`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`}?text=${encodeURIComponent(
                                  `Hello ${customerName}, this is IT HUB Kothamangalam regarding your sell request for ${req.product_name}.`,
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition border border-transparent hover:border-emerald-200 shrink-0"
                                title="Chat on WhatsApp"
                                aria-label={`Chat with ${customerName} on WhatsApp`}
                              >
                                <MessageCircle size={15} />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenDetail(req)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer shrink-0"
                              aria-label={`Inspect sell request for ${req.product_name}`}
                            >
                              <span>Inspect</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View (< lg) */}
          <div className="block lg:hidden space-y-3.5">
            {requests.map((req) => {
              const CategoryIcon = getCategoryIcon(req.category);
              const customerName = req.customer?.full_name || "Valued Customer";
              const customerPhone = req.customer?.phone || "";
              const cleanPhone = customerPhone.replace(/\D/g, "");

              return (
                <div
                  key={req.id}
                  onClick={() => handleOpenDetail(req)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition cursor-pointer space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                        <CategoryIcon size={16} />
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                        #{req.id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadge(
                          req.status,
                        )}`}
                      >
                        {req.status}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(req.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{req.product_name}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        Condition: {req.condition || "Fair"}
                      </span>
                      {req.has_warranty ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          <ShieldCheck size={11} />
                          <span>Active Warranty</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-200">
                          <ShieldAlert size={11} />
                          <span>No Warranty</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-slate-800 truncate">{customerName}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {customerPhone || "No direct phone"}
                      </p>
                    </div>

                    {customerPhone && (
                      <a
                        href={`https://wa.me/${cleanPhone}`}
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

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Asking:
                        </span>
                        <span className="font-mono font-semibold text-xs text-slate-700">
                          {formatCurrency(req.expected_price)}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Valuation:
                        </span>
                        <span className="font-mono font-black text-sm text-emerald-700">
                          {req.offered_price != null
                            ? formatCurrency(req.offered_price)
                            : "Pending"}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(req);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-white px-4 py-2 text-xs font-bold hover:bg-blue-700 active:scale-95 transition min-h-[44px]"
                    >
                      <span>Inspect</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Inspection & Valuation Modal */}
      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl overflow-y-auto rounded-none sm:rounded-3xl bg-white p-4 sm:p-6 shadow-2xl space-y-5 sm:space-y-6 border-0 sm:border border-slate-100 flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                  {selectedRequest.category} Submission Details
                </span>
                <h2 className="text-xl font-extrabold text-slate-900">
                  {selectedRequest.product_name}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Request ID:{" "}
                  <span className="font-mono font-semibold text-slate-600">
                    {selectedRequest.id}
                  </span>{" "}
                  &bull; Submitted on{" "}
                  {new Date(selectedRequest.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Hardware Information Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-4 text-xs border border-slate-200/60">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Brand</span>
                <span className="font-bold text-slate-800">{selectedRequest.brand || "—"}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Model</span>
                <span className="font-bold text-slate-800">{selectedRequest.model || "—"}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Condition</span>
                <span className="font-bold text-slate-800">{selectedRequest.condition}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">
                  Customer Asking Price
                </span>
                <span className="font-extrabold text-slate-900 font-mono">
                  {formatCurrency(selectedRequest.expected_price)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Has Warranty</span>
                <span className="font-bold text-slate-800">
                  {selectedRequest.has_warranty ? "Yes (Active)" : "No / Expired"}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">
                  Warranty Provider
                </span>
                <span className="font-bold text-slate-800">
                  {selectedRequest.warranty_provider || "—"}
                </span>
              </div>
              {selectedRequest.warranty_remaining && (
                <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-200/50">
                  <span className="text-[11px] text-slate-400 font-medium mr-2">
                    Warranty Duration Remaining:
                  </span>
                  <span className="font-bold text-slate-800">
                    {selectedRequest.warranty_remaining}
                  </span>
                </div>
              )}
              {selectedRequest.warranty_details && (
                <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-200/50">
                  <span className="text-[11px] text-slate-400 font-medium mr-2">
                    Warranty Terms:
                  </span>
                  <span className="text-slate-700">{selectedRequest.warranty_details}</span>
                </div>
              )}
            </div>

            {/* Customer Description */}
            {selectedRequest.description && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-1">Customer Description</h4>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  {selectedRequest.description}
                </div>
              </div>
            )}

            {/* Attached Hardware Photos */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <ImageIcon size={14} className="text-blue-600" />
                <span>Attached Hardware Photos ({selectedRequest.images.length})</span>
              </h4>
              {selectedRequest.images && selectedRequest.images.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {selectedRequest.images.map((img) => (
                    <a
                      key={img.id}
                      href={img.url || img.storage_path}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative block aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-2xs"
                    >
                      <img
                        src={img.url || img.storage_path}
                        alt="Hardware preview"
                        className="h-full w-full object-cover group-hover:scale-105 transition"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white text-xs font-semibold gap-1">
                        <ExternalLink size={14} />
                        <span>View</span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic rounded-xl border border-dashed border-slate-200 p-4 text-center">
                  No hardware photos attached.
                </p>
              )}
            </div>

            {/* Attached Proof of Purchase / Invoice Document */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <FileText size={14} className="text-purple-600" />
                <span>Proof of Purchase / Invoice Document</span>
              </h4>
              {selectedRequest.documents && selectedRequest.documents.length > 0 ? (
                <div className="space-y-2">
                  {selectedRequest.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/50 p-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700 shrink-0">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate" title={doc.file_name}>
                            {doc.file_name}
                          </p>
                          <span className="text-[10px] text-purple-700 font-semibold uppercase tracking-wider">
                            Customer Bill / Invoice
                          </span>
                        </div>
                      </div>

                      <a
                        href={doc.url || doc.storage_path}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold text-purple-700 shadow-2xs hover:bg-purple-50 transition shrink-0 ml-2"
                      >
                        <ExternalLink size={12} />
                        <span>View Invoice</span>
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-3.5 text-center text-xs text-slate-400 italic">
                  {selectedRequest.has_warranty
                    ? "No invoice attached for this request."
                    : "No invoice attached (No warranty claimed by customer)."}
                </div>
              )}
            </div>

            {/* Customer Contact & Outreach Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>Customer Contact &amp; Outreach</span>
              </h4>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-800 block">
                    {selectedRequest.customer?.full_name || "Valued Customer"}
                  </span>
                  <span className="text-slate-500 block">
                    {selectedRequest.customer?.phone || "No phone provided"}
                  </span>
                  <span className="text-slate-400 block">
                    {selectedRequest.customer?.email || "No email provided"}
                  </span>
                </div>

                {selectedRequest.customer?.phone && (
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${selectedRequest.customer.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                    >
                      <Phone size={13} />
                      <span>Call</span>
                    </a>
                    <a
                      href={`https://wa.me/${selectedRequest.customer.phone.replace(/\D/g, "").startsWith("91") ? selectedRequest.customer.phone.replace(/\D/g, "") : `91${selectedRequest.customer.phone.replace(/\D/g, "")}`}?text=${encodeURIComponent(
                        `Hello ${selectedRequest.customer.full_name || "Customer"}, IT HUB Kothamangalam here regarding your sell request for ${selectedRequest.product_name}. Our valuation is ${editOfferedPrice ? `₹${editOfferedPrice}` : "ready for discussion"}. Please let us know if you'd like to proceed!`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      <MessageCircle size={13} />
                      <span>WhatsApp Customer</span>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Valuation & Moderation Form */}
            <div className="space-y-4 rounded-2xl bg-slate-50 p-4 border border-slate-200">
              <h4 className="text-xs font-bold text-slate-900">
                Staff Valuation &amp; Request Processing
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Offered Purchase Price (₹ INR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 35000"
                    value={editOfferedPrice}
                    onChange={(e) => setEditOfferedPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Customer's expected asking price:{" "}
                    {formatCurrency(selectedRequest.expected_price)}
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Request Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as SellRequestStatus)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Internal Staff Notes &amp; Communication Log
                </label>
                <textarea
                  rows={2}
                  placeholder="Record customer communication, battery health findings, physical showroom drop-off details…"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDetail}
                  disabled={updating}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
                >
                  {updating ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={13} />
                      <span>Save Valuation &amp; Update Status</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SellRequests;
