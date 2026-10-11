import { useState, useEffect } from "react"
import { Plus, Tag, Pencil, Trash2, CheckCircle2, XCircle, Search, Clock, ArrowRight, ShieldCheck } from "lucide-react"
import { useStore } from "../app/store"
import {
  money,
  formatDate,
  type Coupon,
  type CouponType,
} from "../data/catalog"
import { Button, Badge, Modal, Field, fieldClass } from "../components/ui"

export default function CouponsAdmin({ view = "all" }: { view?: string }) {
  const store = useStore()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Coupon | null>(null)
  const [query, setQuery] = useState("")

  // Form State
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<CouponType>("percentage")
  const [value, setValue] = useState(10)
  const [minOrderValue, setMinOrderValue] = useState(0)
  const [maxDiscount, setMaxDiscount] = useState(0)
  const [totalUsageLimit, setTotalUsageLimit] = useState(0)
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [error, setError] = useState("")

  const openCreate = () => {
    setEditingCoupon(null)
    setCode("")
    setDescription("")
    setType("percentage")
    setValue(10)
    setMinOrderValue(1000)
    setMaxDiscount(2000)
    setTotalUsageLimit(0)
    const now = new Date()
    setStartsAt(now.toISOString().slice(0, 16))
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    setEndsAt(future.toISOString().slice(0, 16))
    setError("")
    setEditorOpen(true)
  }

  const openEdit = (c: Coupon) => {
    setEditingCoupon(c)
    setCode(c.code)
    setDescription(c.description)
    setType(c.type)
    setValue(c.value)
    setMinOrderValue(c.minOrderValue)
    setMaxDiscount(c.maxDiscount)
    setTotalUsageLimit(c.totalUsageLimit)
    setStartsAt(c.startsAt ? new Date(c.startsAt).toISOString().slice(0, 16) : "")
    setEndsAt(c.endsAt ? new Date(c.endsAt).toISOString().slice(0, 16) : "")
    setError("")
    setEditorOpen(true)
  }

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    const upperCode = code.trim().toUpperCase()

    if (!upperCode) {
      setError("Coupon code is required.")
      return
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(upperCode)) {
      setError("Coupon code must be 3-20 alphanumeric characters (hyphens and underscores allowed).")
      return
    }

    // Check duplicate code
    const existing = store.coupons.find(
      (c) => c.code.toUpperCase() === upperCode && c.id !== editingCoupon?.id,
    )
    if (existing) {
      setError(`Coupon code "${upperCode}" already exists.`)
      return
    }

    if (value <= 0) {
      setError("Discount value must be greater than 0.")
      return
    }
    if (type === "percentage" && value > 90) {
      setError("Percentage discount cannot exceed 90%.")
      return
    }

    const startMs = startsAt ? new Date(startsAt).getTime() : Date.now()
    const endMs = endsAt ? new Date(endsAt).getTime() : Date.now() + 30 * 86400000
    if (endMs <= startMs) {
      setError("End date must be after the start date.")
      return
    }

    if (editingCoupon) {
      const updated: Coupon = {
        ...editingCoupon,
        code: upperCode,
        description,
        type,
        value,
        minOrderValue,
        maxDiscount: type === "percentage" ? maxDiscount : 0,
        usageType: "one_time",
        totalUsageLimit,
        startsAt: new Date(startMs).toISOString(),
        endsAt: new Date(endMs).toISOString(),
      }
      store.set((prev) => ({
        coupons: prev.coupons.map((c) => (c.id === updated.id ? updated : c)),
      }))
      store.log(`Coupon Updated: ${upperCode}`)
      store.notify(`Coupon ${upperCode} updated`)
    } else {
      const created: Coupon = {
        id: `CPN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        code: upperCode,
        description,
        type,
        value,
        minOrderValue,
        maxDiscount: type === "percentage" ? maxDiscount : 0,
        usageType: "one_time",
        totalUsageLimit,
        timesUsed: 0,
        active: true,
        startsAt: new Date(startMs).toISOString(),
        endsAt: new Date(endMs).toISOString(),
        createdAt: new Date().toISOString(),
      }
      store.set((prev) => ({
        coupons: [created, ...prev.coupons],
      }))
      store.log(`Coupon Created: ${upperCode}`)
      store.notify(`Coupon ${upperCode} created successfully`)
    }

    setEditorOpen(false)
  }

  const toggleActive = (c: Coupon) => {
    store.set((prev) => ({
      coupons: prev.coupons.map((item) =>
        item.id === c.id ? { ...item, active: !item.active } : item,
      ),
    }))
    store.log(`Coupon ${c.active ? "Disabled" : "Enabled"}: ${c.code}`)
    store.notify(`Coupon ${c.code} ${c.active ? "disabled" : "activated"}`)
  }

  const handleDelete = (c: Coupon) => {
    store.set((prev) => ({
      coupons: prev.coupons.filter((item) => item.id !== c.id),
    }))
    store.log(`Coupon Deleted: ${c.code}`)
    store.notify(`Coupon ${c.code} deleted`)
    setDeleteConfirm(null)
  }

  // Filter coupons
  const filteredCoupons = store.coupons.filter((c) => {
    const matchesQuery =
      c.code.toLowerCase().includes(query.toLowerCase()) ||
      c.description.toLowerCase().includes(query.toLowerCase())
    return matchesQuery
  })

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Coupons & Promo Codes</h2>
          <p className="text-xs text-muted-foreground">
            Configure one-time or multiple-use discount codes for checkout.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={openCreate}>
            <Plus size={15} /> Create Coupon
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 text-xs font-semibold">
        <span className={`cursor-pointer rounded-lg px-3 py-1.5 ${view !== "usage" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
          All Coupons ({store.coupons.length})
        </span>
        <span className={`cursor-pointer rounded-lg px-3 py-1.5 ${view === "usage" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
          Usage History ({store.couponUsages.length})
        </span>
      </div>

      {view === "usage" ? (
        /* Usage History View */
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="border-b border-border p-4">
            <h3 className="text-sm font-bold">Coupon Redemptions</h3>
            <p className="text-xs text-muted-foreground">
              Recorded each time a customer completes an order using a valid coupon.
            </p>
          </div>
          {store.couponUsages.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3.5">Coupon Code</th>
                    <th className="px-5 py-3.5">Customer / User</th>
                    <th className="px-5 py-3.5">Order ID</th>
                    <th className="px-5 py-3.5">Discount Given</th>
                    <th className="px-5 py-3.5">Used At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {store.couponUsages.map((usage) => (
                    <tr key={usage.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3.5 font-mono font-bold text-primary">
                        {usage.couponCode}
                      </td>
                      <td className="px-5 py-3.5">{usage.customerId || usage.userId}</td>
                      <td className="px-5 py-3.5 font-mono">{usage.orderId}</td>
                      <td className="px-5 py-3.5 font-semibold text-emerald-700">
                        −{money(usage.discount)}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {formatDate(usage.usedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No coupons have been used in completed orders yet.
            </div>
          )}
        </div>
      ) : (
        /* All Coupons Table */
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="relative w-full max-w-xs">
              <Search size={14} className="absolute left-3 top-3 text-muted-foreground" />
              <input
                placeholder="Search coupon code…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${fieldClass} py-2 pl-9 text-xs`}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredCoupons.length} coupons
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3.5">Code</th>
                  <th className="px-5 py-3.5">Discount</th>
                  <th className="px-5 py-3.5">Min Order</th>
                  <th className="px-5 py-3.5">Usage Type</th>
                  <th className="px-5 py-3.5">Redemptions</th>
                  <th className="px-5 py-3.5">Validity</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCoupons.map((c) => {
                  const now = Date.now()
                  const isExpired = c.endsAt && new Date(c.endsAt).getTime() < now
                  const isFuture = c.startsAt && new Date(c.startsAt).getTime() > now
                  return (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Tag size={13} className="text-primary" />
                          <span className="font-mono font-bold text-foreground">{c.code}</span>
                        </div>
                        {c.description && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{c.description}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-emerald-700">
                        {c.type === "percentage" ? `${c.value}% OFF` : `₹${c.value} FLAT`}
                        {c.type === "percentage" && c.maxDiscount > 0 && (
                          <span className="block text-[10px] text-muted-foreground font-normal">
                            Cap: ₹{c.maxDiscount}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {c.minOrderValue > 0 ? money(c.minOrderValue) : "No min"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone="amber">
                          1-Time / Customer
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-semibold">{c.timesUsed}</span>
                        {c.totalUsageLimit > 0 ? ` / ${c.totalUsageLimit}` : " / ∞"}
                      </td>
                      <td className="px-5 py-3.5 text-[11px] text-muted-foreground">
                        {formatDate(c.startsAt)} – {formatDate(c.endsAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge
                          tone={
                            !c.active
                              ? "gray"
                              : isExpired
                                ? "red"
                                : isFuture
                                  ? "blue"
                                  : "green"
                          }
                        >
                          {!c.active ? "Disabled" : isExpired ? "Expired" : isFuture ? "Scheduled" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="rounded p-1 text-primary hover:bg-primary/10"
                            title="Edit Coupon"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(c)}
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                              c.active
                                ? "text-amber-700 hover:bg-amber-50"
                                : "text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {c.active ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(c)}
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                            title="Delete Coupon"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!filteredCoupons.length && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                      No coupons found. Click "Create Coupon" above to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      <Modal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : "Create New Coupon"}
        description="Set discount rules, order thresholds, one-time customer limits, and active date window."
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <p className="rounded-md bg-red-50 p-2.5 text-xs font-medium text-red-700">{error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Coupon Code *">
              <input
                required
                placeholder="e.g. FESTIVE20"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={`${fieldClass} uppercase font-mono font-bold tracking-wider`}
              />
            </Field>
            <Field label="Discount Type *">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CouponType)}
                className={fieldClass}
              >
                <option value="percentage">Percentage Discount (%)</option>
                <option value="fixed">Fixed INR Amount (₹)</option>
              </select>
            </Field>
          </div>

          <Field label="Description">
            <input
              placeholder="e.g. 10% off on all PC components"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={fieldClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={type === "percentage" ? "Discount Percentage (%) *" : "Discount Amount (₹) *"}>
              <input
                type="number"
                required
                min={1}
                max={type === "percentage" ? 90 : 100000}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className={fieldClass}
              />
            </Field>
            <Field label="Min Order Value (₹)">
              <input
                type="number"
                min={0}
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(Number(e.target.value))}
                className={fieldClass}
              />
            </Field>
            <Field label="Max Discount Cap (₹)">
              <input
                type="number"
                min={0}
                disabled={type === "fixed"}
                placeholder={type === "fixed" ? "N/A" : "0 = No Cap"}
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(Number(e.target.value))}
                className={fieldClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer Usage Policy">
              <div className="flex h-10 items-center rounded-lg border border-border bg-muted/40 px-3 text-xs font-medium text-foreground">
                <span className="inline-flex items-center gap-1.5 text-amber-700">
                  <ShieldCheck size={14} /> 1-Time / Customer (Single redemption per user)
                </span>
              </div>
            </Field>
            <Field label="Total Store-wide Usage Limit">
              <input
                type="number"
                min={0}
                placeholder="0 = Unlimited"
                value={totalUsageLimit}
                onChange={(e) => setTotalUsageLimit(Number(e.target.value))}
                className={fieldClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valid From *">
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Valid Until *">
              <input
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={fieldClass}
              />
            </Field>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {editingCoupon ? "Save Changes" : "Create Coupon"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          open={Boolean(deleteConfirm)}
          onOpenChange={(open) => !open && setDeleteConfirm(null)}
          title="Delete Coupon"
          description={`Are you sure you want to delete coupon "${deleteConfirm.code}"? Customers will no longer be able to use it.`}
        >
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={() => handleDelete(deleteConfirm)} className="bg-red-600 hover:bg-red-700">
              Delete Coupon
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
