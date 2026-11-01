// ITHUB_ADMIN/src/pages/Quotations.tsx
// PC Quotations Management Queue with Search, Filters & Server Pagination

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageCircle,
} from "lucide-react";
import {
  type PcQuotationRecord,
  type QuotationQueryResult,
  fetchQuotations,
} from "../lib/quotations";
import { getAuditBadgeStyle } from "../lib/uiHelpers";
import { QuotationDetailModal } from "../components/QuotationDetailModal";

export function Quotations() {
  const [quotations, setQuotations] = useState<PcQuotationRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<PcQuotationRecord | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Debounce search input to avoid runaway requests while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const result: QuotationQueryResult = await fetchQuotations({
      page,
      pageSize,
      status,
      searchQuery: debouncedSearch,
      sortBy: "created_at",
      sortOrder: "desc",
    });
    setQuotations(result.quotations);
    setTotalCount(result.totalCount);
    setTotalPages(result.totalPages || 1);
    setLoading(false);
  }, [page, pageSize, status, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
    setPage(1);
  };

  const statusFilters = [
    { id: "ALL", label: "All Requests" },
    { id: "New", label: "New", countClass: "bg-blue-100 text-blue-800" },
    { id: "Contacted", label: "Contacted", countClass: "bg-amber-100 text-amber-800" },
    { id: "Quoted", label: "Quoted", countClass: "bg-purple-100 text-purple-800" },
    { id: "Closed", label: "Closed", countClass: "bg-emerald-100 text-emerald-800" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              PC Builder Quotations
            </h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
              {totalCount} Total
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Review customer builds, audit component pricing divergence, and update enquiry progress.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-xs font-bold">
          {statusFilters.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleStatusChange(tab.id)}
              className={`rounded-lg px-3 py-1.5 transition whitespace-nowrap ${
                status === tab.id
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Reference ID, customer name, phone..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-20 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
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
            className="absolute right-1.5 top-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 transition"
          >
            Find
          </button>
        </form>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          A. Desktop View: Quotations Table (md+)
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Reference ID</th>
                <th className="px-4 py-3.5">Customer &amp; Contact</th>
                <th className="px-4 py-3.5">Build Configuration</th>
                <th className="px-4 py-3.5 text-right">Price (Est / Auth)</th>
                <th className="px-4 py-3.5">Audit Status</th>
                <th className="px-4 py-3.5">Enquiry Status</th>
                <th className="px-4 py-3.5">Submitted</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw size={24} className="mx-auto animate-spin text-blue-600 mb-2" />
                    <span>Loading quotation queue…</span>
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-bold text-slate-700">No quotation requests found</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Try adjusting your status filter or search parameters.
                    </p>
                  </td>
                </tr>
              ) : (
                quotations.map((item) => {
                  const divergence = Math.round(Number(item.price_divergence) || 0);
                  const flagged = item.technician_review_required || divergence > 100;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedQuote(item)}
                      className="hover:bg-blue-50/40 cursor-pointer transition"
                    >
                      {/* Reference */}
                      <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                        {item.reference_id || `#${item.id.slice(0, 8)}`}
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-900">
                          {item.customer_name || "Guest Customer"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.customer_phone || item.customer_email || "No phone"}
                        </p>
                      </td>

                      {/* Build Name */}
                      <td className="px-4 py-3.5 max-w-[200px] truncate">
                        <span
                          className="font-medium text-slate-800"
                          title={item.name || "Custom Build"}
                        >
                          {item.name || "Custom Build"}
                        </span>
                      </td>

                      {/* Pricing */}
                      <td className="px-4 py-3.5 text-right font-mono">
                        <p className="font-extrabold text-slate-900">
                          {formatCurrency(item.authoritative_price || item.estimated_price)}
                        </p>
                        {item.authoritative_price &&
                          item.authoritative_price !== item.estimated_price && (
                            <p className="text-[10px] text-slate-400 line-through">
                              {formatCurrency(item.estimated_price)}
                            </p>
                          )}
                      </td>

                      {/* Audit Status */}
                      <td className="px-4 py-3.5">
                        {(() => {
                          const badge = getAuditBadgeStyle(flagged ? "flagged" : "verified");
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold shadow-2xs ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                            >
                              {badge.iconName === "AlertTriangle" ? (
                                <AlertTriangle size={11} className="shrink-0 text-amber-600" />
                              ) : (
                                <CheckCircle2 size={11} className="shrink-0 text-emerald-600" />
                              )}
                              <span>{badge.label}</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* Enquiry Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            item.enquiry_status === "New"
                              ? "bg-blue-100 text-blue-800"
                              : item.enquiry_status === "Contacted"
                                ? "bg-amber-100 text-amber-800"
                                : item.enquiry_status === "Quoted"
                                  ? "bg-purple-100 text-purple-800"
                                  : item.enquiry_status === "Closed"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {item.enquiry_status}
                        </span>
                      </td>

                      {/* Submission Date */}
                      <td className="px-4 py-3.5 text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedQuote(item);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Eye size={13} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server Pagination Footer (Desktop) */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 text-xs text-slate-600">
          <div>
            Showing <strong className="text-slate-900">{quotations.length}</strong> of{" "}
            <strong className="text-slate-900">{totalCount}</strong> quotation records
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
          B. Mobile View: Responsive Quotation Cards (< md)
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="block md:hidden space-y-3.5">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-2xs">
            <RefreshCw size={24} className="mx-auto animate-spin text-blue-600 mb-2" />
            <p className="text-xs font-bold text-slate-600">Loading quotation queue…</p>
          </div>
        ) : quotations.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-2xs">
            <p className="font-bold text-slate-800 text-sm">No quotation requests found</p>
            <p className="mt-1 text-xs text-slate-400">
              Try adjusting your status filter or search parameters.
            </p>
          </div>
        ) : (
          quotations.map((item) => {
            const divergence = Math.round(Number(item.price_divergence) || 0);
            const flagged = item.technician_review_required || divergence > 100;

            return (
              <div
                key={item.id}
                onClick={() => setSelectedQuote(item)}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition cursor-pointer space-y-3"
              >
                {/* Header: Ref ID + Status + Date */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                      {item.reference_id || `#${item.id.slice(0, 8)}`}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        item.enquiry_status === "New"
                          ? "bg-blue-100 text-blue-800"
                          : item.enquiry_status === "Contacted"
                            ? "bg-amber-100 text-amber-800"
                            : item.enquiry_status === "Quoted"
                              ? "bg-purple-100 text-purple-800"
                              : item.enquiry_status === "Closed"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {item.enquiry_status}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium">
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>

                {/* Build Details */}
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {item.name || "Custom PC Configuration"}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {(() => {
                      const badge = getAuditBadgeStyle(flagged ? "flagged" : "verified");
                      return (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold shadow-2xs ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                        >
                          {badge.iconName === "AlertTriangle" ? (
                            <AlertTriangle size={11} className="shrink-0 text-amber-600" />
                          ) : (
                            <CheckCircle2 size={11} className="shrink-0 text-emerald-600" />
                          )}
                          <span>{flagged ? "Price Review Flagged" : "Pricing Verified"}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Customer Details */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">
                      {item.customer_name || "Guest Customer"}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {item.customer_phone || item.customer_email || "No phone"}
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

                {/* Price and Action Row */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Estimated Total
                    </span>
                    <span className="font-mono font-black text-sm text-slate-900">
                      {formatCurrency(item.authoritative_price || item.estimated_price)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedQuote(item);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-white px-4 py-2 text-xs font-bold hover:bg-blue-700 active:scale-95 transition min-h-[44px]"
                  >
                    <Eye size={14} />
                    <span>View Build</span>
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Server Pagination Footer (Mobile Cards) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-2xs">
          <div className="text-center sm:text-left">
            Showing <strong className="text-slate-900">{quotations.length}</strong> of{" "}
            <strong className="text-slate-900">{totalCount}</strong> quotes
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

      {/* Review Modal */}
      {selectedQuote && (
        <QuotationDetailModal
          quotation={selectedQuote}
          onClose={() => setSelectedQuote(null)}
          onUpdated={loadData}
        />
      )}
    </div>
  );
}
