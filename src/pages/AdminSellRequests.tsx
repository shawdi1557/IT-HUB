import { useState } from "react"
import {
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  PhoneCall,
  FileText,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter,
} from "lucide-react"
import { useStore } from "../app/store"
import {
  formatDate,
  money,
  sellCategories,
  sellRequestStatuses,
  type SellRequest,
  type SellRequestStatus,
  type SellCategory,
} from "../data/catalog"
import { supabase, supabaseConfig } from "../lib/supabase"
import { Button, Badge, Modal, Field, fieldClass } from "../components/ui"

const statusTones: Record<SellRequestStatus, "amber" | "blue" | "green" | "red" | "gray"> =
  {
    Pending: "amber",
    "Under Review": "blue",
    Contacted: "blue",
    Approved: "green",
    Rejected: "red",
    Completed: "gray",
  }

export default function SellRequestsAdmin({ view = "all" }: { view?: string }) {
  const store = useStore()
  const [selectedRequest, setSelectedRequest] = useState<SellRequest | null>(
    null,
  )
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("All")
  const [warrantyFilter, setWarrantyFilter] = useState<string>("All")
  const [statusFilter, setStatusFilter] = useState<string>(
    view === "pending"
      ? "Pending"
      : view === "review"
        ? "Under Review"
        : view === "approved"
          ? "Approved"
          : view === "rejected"
            ? "Rejected"
            : "All",
  )

  // Detail Modal edits
  const [editingStatus, setEditingStatus] =
    useState<SellRequestStatus>("Pending")
  const [internalNotes, setInternalNotes] = useState("")
  const [offeredPriceInput, setOfferedPriceInput] = useState("")
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const openDetails = (req: SellRequest) => {
    setSelectedRequest(req)
    setEditingStatus(req.status)
    setInternalNotes(req.adminNotes || "")
    setOfferedPriceInput(
      req.offeredPrice !== undefined ? String(req.offeredPrice) : "",
    )
  }

  const handleUpdateStatus = async (newStatus: SellRequestStatus) => {
    if (!selectedRequest) return
    const parsedOffered = offeredPriceInput
      ? Number(offeredPriceInput)
      : selectedRequest.offeredPrice
    const updated: SellRequest = {
      ...selectedRequest,
      status: newStatus,
      offeredPrice: parsedOffered,
      adminNotes: internalNotes,
      updatedAt: new Date().toISOString(),
    }

    store.set((prev) => ({
      sellRequests: prev.sellRequests.map((r) =>
        r.id === updated.id ? updated : r,
      ),
    }))

    if (supabase && supabaseConfig.isConfigured) {
      try {
        await supabase
          .from("sell_requests")
          .update({
            status: newStatus,
            offered_price: parsedOffered,
            admin_notes: internalNotes,
            updated_at: updated.updatedAt,
          })
          .eq("id", updated.id)
      } catch (err) {
        console.warn("[Supabase] Failed to update sell request status:", err)
      }
    }

    store.log(`Sell Request Status Changed: ${updated.id} -> ${newStatus}`)
    if (newStatus === "Approved")
      store.log(`Sell Request Approved: ${updated.id}`)
    if (newStatus === "Rejected")
      store.log(`Sell Request Rejected: ${updated.id}`)
    store.notify(`Request ${updated.id} status updated to ${newStatus}`)
    setSelectedRequest(updated)
    setEditingStatus(newStatus)
  }

  const handleSaveNotes = async () => {
    if (!selectedRequest) return
    const parsedOffered = offeredPriceInput
      ? Number(offeredPriceInput)
      : undefined
    const updated: SellRequest = {
      ...selectedRequest,
      adminNotes: internalNotes,
      status: editingStatus,
      offeredPrice: parsedOffered,
      updatedAt: new Date().toISOString(),
    }

    store.set((prev) => ({
      sellRequests: prev.sellRequests.map((r) =>
        r.id === updated.id ? updated : r,
      ),
    }))

    if (supabase && supabaseConfig.isConfigured) {
      try {
        await supabase
          .from("sell_requests")
          .update({
            admin_notes: internalNotes,
            status: editingStatus,
            offered_price: parsedOffered,
            updated_at: updated.updatedAt,
          })
          .eq("id", updated.id)
      } catch (err) {
        console.warn("[Supabase] Failed to update sell request notes:", err)
      }
    }

    store.log(`Admin Notes & Valuation Updated: ${updated.id}`)
    store.notify("Internal notes and valuation saved successfully")
    setSelectedRequest(updated)
  }

  // Filter requests
  const filteredRequests = store.sellRequests.filter((r) => {
    // View filter
    if (view === "pending" && r.status !== "Pending") return false
    if (view === "review" && r.status !== "Under Review") return false
    if (view === "approved" && r.status !== "Approved") return false
    if (view === "rejected" && r.status !== "Rejected") return false

    // Status dropdown
    if (statusFilter !== "All" && r.status !== statusFilter) return false

    // Category dropdown
    if (categoryFilter !== "All" && r.category !== categoryFilter) return false

    // Warranty dropdown
    if (warrantyFilter === "Warranty Available" && !r.hasWarranty) return false
    if (warrantyFilter === "No Warranty" && r.hasWarranty) return false

    // Search query
    if (query) {
      const q = query.toLowerCase()
      const match =
        r.id.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q)
      if (!match) return false
    }

    return true
  })

  // Summary counts
  const countWarranty = store.sellRequests.filter((r) => r.hasWarranty).length
  const countNoWarranty = store.sellRequests.length - countWarranty
  const countPending = store.sellRequests.filter(
    (r) => r.status === "Pending" || r.status === "Under Review",
  ).length

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            Customer Sell Requests
          </h2>
          <p className="text-xs text-muted-foreground">
            Review incoming evaluation requests from customers looking to sell
            electronics to IT HUB.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 font-semibold text-amber-800 border border-amber-200">
            <Clock size={13} /> {countPending} Awaiting Review
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800 border border-emerald-200">
            <ShieldCheck size={13} /> {countWarranty} Under Warranty
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-3 text-muted-foreground"
            />
            <input
              placeholder="Search request, phone, model…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${fieldClass} py-2 pl-9 text-xs`}
            />
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={`${fieldClass} py-2 text-xs`}
            >
              <option value="All">
                All Categories ({store.sellRequests.length})
              </option>
              {sellCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={warrantyFilter}
              onChange={(e) => setWarrantyFilter(e.target.value)}
              className={`${fieldClass} py-2 text-xs`}
            >
              <option value="All">All Warranty Statuses</option>
              <option value="Warranty Available">
                Warranty Available ({countWarranty})
              </option>
              <option value="No Warranty">
                No Warranty ({countNoWarranty})
              </option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${fieldClass} py-2 text-xs`}
            >
              <option value="All">All Statuses</option>
              {sellRequestStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Sell Requests List ({filteredRequests.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3.5">Request ID</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Device / Brand</th>
                <th className="px-5 py-3.5">Condition</th>
                <th className="px-5 py-3.5">Valuation Quote</th>
                <th className="px-5 py-3.5">Warranty</th>
                <th className="px-5 py-3.5">Attachments</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3.5 font-mono font-bold text-primary">
                    <button
                      type="button"
                      onClick={() => openDetails(req)}
                      className="hover:underline"
                    >
                      {req.id}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-foreground">
                      {req.customerName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {req.customerPhone}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-foreground">
                      {req.productName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {req.category}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium">
                      {req.condition}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-foreground">
                      {req.offeredPrice ? (
                        <span className="font-bold text-emerald-700">
                          {money(req.offeredPrice)}
                        </span>
                      ) : (
                        <span className="font-medium text-amber-700">
                          Awaiting Quote
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Exp: {req.expectedPrice ? money(req.expectedPrice) : "Not set"}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    {req.hasWarranty ? (
                      <span className="flex items-center gap-1 text-emerald-700 font-medium">
                        <ShieldCheck size={13} />
                        {req.warrantyRemaining || "Yes"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span>{req.imagePaths.length} photos</span>
                      {req.invoicePath && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          BILL
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTones[req.status] || "gray"}>
                      {req.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {formatDate(req.submittedAt)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => openDetails(req)}
                      className="px-3 py-1 text-xs"
                    >
                      <Eye size={13} /> Inspect
                    </Button>
                  </td>
                </tr>
              ))}
              {!filteredRequests.length && (
                <tr>
                  <td
                    colSpan={10}
                    className="p-8 text-center text-xs text-muted-foreground"
                  >
                    No sell requests match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details & Inspection Modal */}
      {selectedRequest && (
        <Modal
          open={Boolean(selectedRequest)}
          onOpenChange={(open) => !open && setSelectedRequest(null)}
          title={`Sell Request: ${selectedRequest.id} · ${selectedRequest.productName}`}
          description={`Submitted on ${formatDate(selectedRequest.submittedAt)} by ${selectedRequest.customerName}`}
        >
          <div className="space-y-6">
            {/* Customer Details Box */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Customer Contact Details
              </h4>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <p className="font-semibold text-foreground">
                    {selectedRequest.customerName}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-semibold text-foreground">
                    {selectedRequest.customerPhone}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p className="font-semibold text-foreground">
                    {selectedRequest.customerEmail}
                  </p>
                </div>
              </div>
            </div>

            {/* Product Details Box */}
            <div className="rounded-xl border border-border p-4">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Device Specifications & Evaluation Info
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <p className="font-semibold text-foreground">
                    {selectedRequest.category}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Brand:</span>
                  <p className="font-semibold text-foreground">
                    {selectedRequest.brand}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Model:</span>
                  <p className="font-semibold text-foreground">
                    {selectedRequest.model}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Condition:</span>
                  <p className="font-semibold text-foreground">
                    {selectedRequest.condition}
                  </p>
                </div>
              </div>

              {/* Valuation price comparison */}
              <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-muted/40 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Customer Asking Price:</span>
                  <p className="text-sm font-bold text-foreground">
                    {selectedRequest.expectedPrice
                      ? money(selectedRequest.expectedPrice)
                      : "Not specified"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">IT HUB Offered Valuation:</span>
                  <p className="text-sm font-bold text-emerald-700">
                    {selectedRequest.offeredPrice
                      ? money(selectedRequest.offeredPrice)
                      : "Pending valuation"}
                  </p>
                </div>
              </div>

              {selectedRequest.description && (
                <div className="mt-3 border-t border-border pt-3 text-xs">
                  <span className="text-muted-foreground">
                    Customer's notes:
                  </span>
                  <p className="mt-0.5 text-foreground">
                    {selectedRequest.description}
                  </p>
                </div>
              )}

              {/* Warranty details */}
              <div className="mt-3 border-t border-border pt-3 text-xs">
                <span className="text-muted-foreground">Warranty status: </span>
                {selectedRequest.hasWarranty ? (
                  <span className="font-semibold text-emerald-800">
                    Active ({selectedRequest.warrantyRemaining}) · Provider:{" "}
                    {selectedRequest.warrantyProvider || "Manufacturer"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    No active warranty
                  </span>
                )}
                {selectedRequest.warrantyDetails && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Extra warranty info: {selectedRequest.warrantyDetails}
                  </p>
                )}
              </div>
            </div>

            {/* Photos & Bill Gallery */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Uploaded Files ({selectedRequest.imagePaths.length} Photos
                {selectedRequest.invoicePath ? ", 1 Invoice" : ""})
              </h4>

              {/* Photos */}
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {selectedRequest.imagePaths.map((path, idx) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewImage(path)}
                    className="group relative flex h-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-muted hover:ring-2 hover:ring-primary"
                  >
                    <img
                      src={path}
                      alt={`Photo ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white">
                      Photo {idx + 1}
                    </span>
                  </div>
                ))}
              </div>

              {/* Invoice Download / Preview */}
              {selectedRequest.invoicePath ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50/70 p-3 text-xs text-emerald-950">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-emerald-700" />
                    <div>
                      <p className="font-bold">
                        Original Purchase Bill / GST Invoice
                      </p>
                      <p className="text-[10px] text-emerald-800">
                        Private admin verification document
                      </p>
                    </div>
                  </div>
                  <a
                    href={selectedRequest.invoicePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    View Bill <ExternalLink size={12} />
                  </a>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  No invoice attached (item has no active warranty).
                </p>
              )}
            </div>

            {/* Admin Controls */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                Administrator Actions & Internal Notes
              </h4>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Request Status">
                  <select
                    value={editingStatus}
                    onChange={(e) => {
                      const newStatus = e.target.value as SellRequestStatus
                      setEditingStatus(newStatus)
                      handleUpdateStatus(newStatus)
                    }}
                    className={fieldClass}
                  >
                    {sellRequestStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Offered Valuation Quote (₹)">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-semibold text-muted-foreground">
                      ₹
                    </span>
                    <input
                      type="number"
                      placeholder="e.g. 35000"
                      value={offeredPriceInput}
                      onChange={(e) => setOfferedPriceInput(e.target.value)}
                      className={`${fieldClass} pl-7 text-xs`}
                    />
                  </div>
                </Field>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Quick Status Actions
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleUpdateStatus("Contacted")}
                      className="px-2.5 py-1.5 text-[11px]"
                    >
                      <PhoneCall size={12} /> Mark Contacted
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleUpdateStatus("Approved")}
                      className="bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-[11px]"
                    >
                      Approve Offer
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleUpdateStatus("Rejected")}
                      className="text-red-600 hover:bg-red-50 px-2.5 py-1.5 text-[11px]"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Field label="Internal Admin Notes (Evaluation Notes, Quoted Price, Customer Conversation)">
                  <textarea
                    rows={3}
                    placeholder="e.g. Inspected serial number with AppleCare. Offered ₹32,000 via WhatsApp. Customer agreed."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSaveNotes}
                    className="px-3 py-1.5 text-xs"
                  >
                    Save Notes & Offer
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                onClick={() => setSelectedRequest(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Full Photo Zoom Modal */}
      {previewImage && (
        <Modal
          open={Boolean(previewImage)}
          onOpenChange={(open) => !open && setPreviewImage(null)}
          title="Product Image Preview"
        >
          <div className="flex flex-col items-center">
            <img
              src={previewImage}
              alt="Preview"
              className="max-h-[70vh] rounded-lg object-contain"
            />
            <Button
              variant="secondary"
              onClick={() => setPreviewImage(null)}
              className="mt-4"
            >
              Close Preview
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
