// ITHUB_ADMIN/src/components/QuotationDetailModal.tsx
// Comprehensive PC Build Quotation Review & Status Update Modal

import { useState } from "react";
import {
  X,
  Cpu,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Save,
  MessageCircle,
  LoaderCircle,
} from "lucide-react";
import {
  type PcQuotationRecord,
  type QuotationStatus,
  type PcPartItem,
  updateQuotationStatus,
} from "../lib/quotations";

interface QuotationDetailModalProps {
  quotation: PcQuotationRecord;
  onClose: () => void;
  onUpdated: () => void;
}

export function QuotationDetailModal({ quotation, onClose, onUpdated }: QuotationDetailModalProps) {
  const [status, setStatus] = useState<QuotationStatus>(quotation.enquiry_status);
  const [staffNotes, setStaffNotes] = useState<string>(quotation.staff_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess(false);

    const res = await updateQuotationStatus(quotation.id, status, staffNotes);
    setSaving(false);

    if (!res.ok) {
      setError(res.error || "Failed to update quotation status.");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onUpdated();
      onClose();
    }, 1000);
  };

  // Normalize parts array
  const partsList: PcPartItem[] = Array.isArray(quotation.parts)
    ? quotation.parts
    : Object.entries(quotation.parts || {}).map(([key, item]: [string, any]) => ({
        type: item.type || key,
        name: item.name || "Custom Component",
        price: Number(item.price) || 0,
        variantId: item.variantId,
        isShopifyLive: item.isShopifyLive,
      }));

  const divergence = Math.round(Number(quotation.price_divergence) || 0);
  const reviewFlagged = quotation.technician_review_required || divergence > 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 overflow-y-auto">
      <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl rounded-none sm:rounded-2xl border-0 sm:border border-slate-200/80 bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Cpu size={18} className="sm:hidden" />
              <Cpu size={20} className="hidden sm:block" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="font-mono text-xs sm:text-sm font-bold text-slate-900">
                  {quotation.reference_id || "Unassigned Reference"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
                    quotation.enquiry_status === "New"
                      ? "bg-blue-100 text-blue-800"
                      : quotation.enquiry_status === "Contacted"
                        ? "bg-amber-100 text-amber-800"
                        : quotation.enquiry_status === "Quoted"
                          ? "bg-purple-100 text-purple-800"
                          : quotation.enquiry_status === "Closed"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {quotation.enquiry_status}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate max-w-xs mt-0.5">
                {quotation.name || "Custom PC Configuration"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
          {/* Price & Review Alert */}
          {reviewFlagged && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
              <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-bold">Technician Price Review Required</p>
                <p className="mt-0.5">
                  Server-side price verification detected a divergence of{" "}
                  {formatCurrency(divergence)} between the customer estimate and authoritative live
                  Shopify pricing. Please audit component rates before finalizing the formal quote.
                </p>
              </div>
            </div>
          )}

          {/* Pricing Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Submitted Total
              </p>
              <p className="mt-1 text-base sm:text-lg font-extrabold text-slate-900">
                {formatCurrency(quotation.estimated_price)}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
              <p className="text-[10px] sm:text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
                Authoritative Total
              </p>
              <p className="mt-1 text-base sm:text-lg font-extrabold text-blue-900">
                {quotation.authoritative_price
                  ? formatCurrency(quotation.authoritative_price)
                  : formatCurrency(quotation.estimated_price)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Submission Date
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800 flex items-center gap-1.5 pt-1">
                <Calendar size={14} className="text-slate-400" />
                {new Date(quotation.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          {/* Customer Details */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Customer Contact Details
            </h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-500">Customer Name:</span>
                <p className="font-bold text-slate-900 mt-0.5">
                  {quotation.customer_name || "Guest Customer"}
                </p>
              </div>

              <div>
                <span className="text-slate-500">Phone:</span>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-bold text-slate-900">
                    {quotation.customer_phone || "Not Provided"}
                  </span>
                  {quotation.customer_phone && (
                    <a
                      href={`https://wa.me/${quotation.customer_phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="WhatsApp Customer"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md hover:bg-emerald-100 transition min-h-[32px]"
                    >
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  )}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Email:</span>
                <p className="font-bold text-slate-900 mt-0.5">
                  {quotation.customer_email || "Not Provided"}
                </p>
              </div>
            </div>
          </div>

          {/* Components Breakdown Table & Mobile Cards */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Selected Build Components ({partsList.length})
              </h3>
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2">Slot</th>
                    <th className="px-4 py-2">Component Name</th>
                    <th className="px-4 py-2">Shopify Status</th>
                    <th className="px-4 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {partsList.map((part, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-bold text-slate-900">{part.type}</td>
                      <td className="px-4 py-2.5 max-w-[280px] truncate" title={part.name}>
                        {part.name}
                      </td>
                      <td className="px-4 py-2.5">
                        {part.variantId ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            Live Shopify Variant
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            Custom Spec
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-right text-slate-900">
                        {formatCurrency(part.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="sm:hidden divide-y divide-slate-100">
              {partsList.map((part, idx) => (
                <div key={idx} className="p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-700 uppercase tracking-wider text-[11px]">
                      {part.type}
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatCurrency(part.price)}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800 leading-snug">{part.name}</p>
                  <div>
                    {part.variantId ? (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        Live Shopify Variant
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                        Custom Spec
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow Action Panel: Status Update & Staff Notes */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Staff Workflow Actions &amp; Notes
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enquiry Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as QuotationStatus)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100 min-h-[44px]"
                >
                  <option value="New">New (Pending Initial Review)</option>
                  <option value="Contacted">Contacted (Spoke with Customer)</option>
                  <option value="Quoted">Quoted (Formal Pricing Sent)</option>
                  <option value="Closed">Closed (Completed / Sold)</option>
                  <option value="Draft">Draft (Archived / Inactive)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Internal Staff Notes (Not visible to customer)
              </label>
              <textarea
                rows={3}
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                placeholder="Log customer discussions, component availability notes, or custom discounts..."
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-800">
                <AlertTriangle size={15} /> <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                <CheckCircle2 size={15} /> <span>Quotation updated successfully!</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2.5 sm:gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? (
                  <>
                    <LoaderCircle size={14} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Save size={14} /> Save Status &amp; Notes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
