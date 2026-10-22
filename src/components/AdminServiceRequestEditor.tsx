import { useState, useMemo } from "react"
import {
  Wrench,
  Plus,
  Trash2,
  FileText,
  Layers,
  History,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { useStore } from "../app/store"
import {
  money,
  serviceStatuses,
  type ServiceRequest,
  type DiagnosisFinding,
  type QuotationItem,
  type FindingSource,
  type FindingClassification,
  type RepairSafety,
} from "../data/catalog"
import {
  adminPublishQuotation,
  adminUpdateServiceRequest,
  calculateQuotationTotals,
} from "../lib/services"
import { ActionLink, Badge, Button, Field, fieldClass } from "./ui"

interface AdminServiceRequestEditorProps {
  request: ServiceRequest
  onClose: () => void
}

export default function AdminServiceRequestEditor({
  request,
  onClose,
}: AdminServiceRequestEditorProps) {
  const store = useStore()

  // Local draft states
  const [technician, setTechnician] = useState<string>(
    request.technician || "Unassigned",
  )
  const [status, setStatus] = useState<number>(request.status || 0)
  const [adminNotes, setAdminNotes] = useState<string>(request.notes || "")
  const [error, setError] = useState<string>("")
  const [isPublishing, setIsPublishing] = useState<boolean>(false)
  const [showHistory, setShowHistory] = useState<boolean>(false)

  // Draft findings
  const [findings, setFindings] = useState<DiagnosisFinding[]>(() => {
    if (request.findings && request.findings.length > 0) {
      return [...request.findings]
    }
    // Seed with initial customer complaint as first finding if none exist
    return [
      {
        id: `find-cust-${Date.now().toString(36)}`,
        title: "Reported Symptom",
        description:
          request.problem || "Initial customer complaint upon service booking.",
        source: "customer",
        classification: "confirmed",
        customerExplanation:
          request.problem || "Reported fault requiring workbench diagnosis.",
        recommendedRepair: "Inspect & test core hardware components.",
        safety: "required",
        isEligibleForRepair: true,
        createdAt: new Date().toISOString(),
      },
    ]
  })

  // Draft quotation items
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>(() => {
    if (request.quotationItems && request.quotationItems.length > 0) {
      return [...request.quotationItems]
    }
    // Default item if legacy single quote
    const baseQuote = request.quote || 1500
    const diagnosticCredit = Math.min(300, baseQuote)
    return [
      {
        id: `item-${Date.now().toString(36)}`,
        title: `${request.device} Workbench Service`,
        description:
          request.problem || "Standard hardware repair and bench diagnostics.",
        partCost: Math.max(0, baseQuote - diagnosticCredit),
        labourCost: diagnosticCredit,
        quantity: 1,
        lineTotal: baseQuote,
        isRequired: true,
        canDefer: false,
        approvalState: request.quoteState || "pending",
      },
    ]
  })

  // Finding form state
  const [isAddingFinding, setIsAddingFinding] = useState<boolean>(false)
  const [newFindingTitle, setNewFindingTitle] = useState<string>("")
  const [newFindingDesc, setNewFindingDesc] = useState<string>("")
  const [newFindingSource, setNewFindingSource] =
    useState<FindingSource>("technician")
  const [newFindingClass, setNewFindingClass] =
    useState<FindingClassification>("confirmed")
  const [newFindingSafety, setNewFindingSafety] =
    useState<RepairSafety>("recommended")
  const [newFindingCustExpl, setNewFindingCustExpl] = useState<string>("")
  const [newFindingRecRepair, setNewFindingRecRepair] = useState<string>("")

  // Quotation item form state
  const [isAddingItem, setIsAddingItem] = useState<boolean>(false)
  const [newItemTitle, setNewItemTitle] = useState<string>("")
  const [newItemDesc, setNewItemDesc] = useState<string>("")
  const [newItemPartCost, setNewItemPartCost] = useState<number>(1000)
  const [newItemLabourCost, setNewItemLabourCost] = useState<number>(500)
  const [newItemQty, setNewItemQty] = useState<number>(1)
  const [newItemFindingId, setNewItemFindingId] = useState<string>("")
  const [newItemIsRequired, setNewItemIsRequired] = useState<boolean>(false)
  const [newItemCanDefer, setNewItemCanDefer] = useState<boolean>(true)
  const [newItemDependsOn, setNewItemDependsOn] = useState<string>("")

  // Authoritative total calculation
  const allItemIds = useMemo(
    () => quotationItems.map((i) => i.id),
    [quotationItems],
  )
  const totals = useMemo(() => {
    return calculateQuotationTotals(
      quotationItems,
      allItemIds,
      request.courierCharge,
    )
  }, [quotationItems, allItemIds, request.courierCharge])

  // Handlers for Findings
  const handleAddFinding = () => {
    if (!newFindingTitle.trim()) {
      setError("Finding title is required.")
      return
    }
    setError("")

    const newF: DiagnosisFinding = {
      id: `find-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: newFindingTitle.trim(),
      description: newFindingDesc.trim() || newFindingTitle.trim(),
      source: newFindingSource,
      classification: newFindingClass,
      safety: newFindingSafety,
      customerExplanation:
        newFindingCustExpl.trim() ||
        `Identified ${newFindingTitle.trim().toLowerCase()}. Repair recommended for optimal reliability.`,
      recommendedRepair:
        newFindingRecRepair.trim() ||
        "Component replacement / bench servicing.",
      isEligibleForRepair: true,
      createdAt: new Date().toISOString(),
    }

    setFindings((prev) => [...prev, newF])
    setNewFindingTitle("")
    setNewFindingDesc("")
    setNewFindingCustExpl("")
    setNewFindingRecRepair("")
    setIsAddingFinding(false)
  }

  const handleRemoveFinding = (findingId: string) => {
    setFindings((prev) => prev.filter((f) => f.id !== findingId))
  }

  // Handlers for Quotation Items
  const handleAddQuotationItem = () => {
    if (!newItemTitle.trim()) {
      setError("Item title is required.")
      return
    }
    setError("")

    const lineTotal =
      (newItemPartCost + newItemLabourCost) * Math.max(1, newItemQty)
    const dependsOnList = newItemDependsOn.trim()
      ? [newItemDependsOn.trim()]
      : undefined

    const item: QuotationItem = {
      id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      findingId: newItemFindingId || undefined,
      title: newItemTitle.trim(),
      description: newItemDesc.trim() || newItemTitle.trim(),
      partCost: Math.max(0, newItemPartCost),
      labourCost: Math.max(0, newItemLabourCost),
      quantity: Math.max(1, newItemQty),
      lineTotal,
      isRequired: newItemIsRequired,
      canDefer: newItemCanDefer,
      dependsOn: dependsOnList,
      approvalState: "pending",
    }

    setQuotationItems((prev) => [...prev, item])
    setNewItemTitle("")
    setNewItemDesc("")
    setNewItemPartCost(1000)
    setNewItemLabourCost(500)
    setNewItemQty(1)
    setNewItemIsRequired(false)
    setNewItemCanDefer(true)
    setNewItemDependsOn("")
    setIsAddingItem(false)
  }

  const handleRemoveQuotationItem = (itemId: string) => {
    setQuotationItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  // Technician assignment handler
  const handleTechnicianChange = async (newTech: string) => {
    setTechnician(newTech)
    await adminUpdateServiceRequest(request.id, { technician_name: newTech })
    store.set({
      requests: store.requests.map((item) =>
        item.id === request.id ? { ...item, technician: newTech } : item,
      ),
    })
    store.log(`Technician ${newTech} assigned to ${request.id}`)
    store.notify("Technician assigned")
  }

  // Status update handler
  const handleStatusChange = async (newStatus: number) => {
    if (newStatus >= 5 && request.quoteState !== "approved") {
      setError(
        "The customer must approve the quotation before repair work can proceed.",
      )
      return
    }
    setError("")
    setStatus(newStatus)

    await adminUpdateServiceRequest(request.id, {
      status: serviceStatuses[newStatus],
    })

    store.set((previous) => ({
      requests: previous.requests.map((item) =>
        item.id === request.id ? { ...item, status: newStatus } : item,
      ),
      notifications: [
        `Service ${request.id}: ${serviceStatuses[newStatus]}`,
        ...previous.notifications,
      ],
    }))

    store.log(`Service ${request.id}: ${serviceStatuses[newStatus]}`)
    store.notify("Service status updated")
  }

  // Publish / Revise quotation handler
  const handlePublishQuotation = async () => {
    if (quotationItems.length === 0) {
      setError("At least one quotation line item is required.")
      return
    }
    setError("")
    setIsPublishing(true)

    try {
      const result = await adminPublishQuotation(
        request.id,
        findings,
        quotationItems,
        adminNotes,
        request.courierCharge?.returnDelivery,
        request,
      )

      if (!result.ok) {
        setError(result.error || "Failed to publish quotation.")
        setIsPublishing(false)
        return
      }

      const nextStatus = Math.max(request.status, 4)
      const newVersion = result.newVersion || (request.quoteVersion || 1) + 1

      // Update store
      store.set((previous) => ({
        requests: previous.requests.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status: nextStatus,
                quoteState: "pending",
                quote: result.totalAmount ?? totals.totalPayable,
                quoteVersion: newVersion,
                findings,
                quotationItems,
                approvedItems: [],
                declinedItems: [],
                notes: adminNotes,
              }
            : item,
        ),
        notifications: [
          `Quotation v${newVersion} published for ${request.id} (${money(totals.totalPayable)})`,
          ...previous.notifications,
        ],
      }))

      store.log(`Quotation v${newVersion} published for ${request.id}`)
      if (result.warning) {
        store.notify(result.warning)
      } else {
        store.notify(`Quotation v${newVersion} published for customer review`)
      }
      setIsPublishing(false)
    } catch (err: any) {
      setError(err?.message || "Failed to publish quotation.")
      setIsPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Overview & Unaltered Customer Issue */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Device Ticket
            </span>
            <h3 className="text-xl font-extrabold text-foreground">
              {request.model || request.device}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Customer: <strong>{request.name}</strong> · {request.email}{" "}
              {request.phone ? `· ${request.phone}` : ""}
            </p>
          </div>
          <div className="text-right">
            <Badge
              tone={
                request.quoteState === "approved"
                  ? "green"
                  : request.quoteState === "rejected"
                    ? "red"
                    : "amber"
              }
            >
              QUOTE: {request.quoteState?.toUpperCase() || "PENDING"} (v
              {request.quoteVersion || 1})
            </Badge>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Status: <strong>{serviceStatuses[status]}</strong>
            </p>
          </div>
        </div>

        {/* Immutable Customer Problem */}
        <div className="mt-3.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <FileText size={14} className="text-primary" />
            <span>Customer-Reported Problem (Original Complaint):</span>
          </div>
          <p className="mt-1 font-semibold text-foreground">
            "{request.problem}"
          </p>
          <span className="mt-1 inline-block text-[10px] text-muted-foreground">
            *Preserved permanently; not overwritten by technician findings.
          </span>
        </div>
      </div>

      {/* 2. Operational Assignment Controls */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assigned Technician">
          <select
            className={fieldClass}
            value={technician}
            onChange={(e) => handleTechnicianChange(e.target.value)}
          >
            {store.technicians.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Service Status">
          <select
            className={fieldClass}
            value={status}
            onChange={(e) => handleStatusChange(Number(e.target.value))}
          >
            {serviceStatuses.map((s, index) => (
              <option value={index} key={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* 3. Dynamic Diagnosis Findings Manager */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h4 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
              <Wrench size={15} className="text-primary" />
              <span>Diagnostic Findings ({findings.length})</span>
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Record both customer-reported symptoms and newly discovered faults
              with customer-safe explanations.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsAddingFinding((prev) => !prev)}
            className="text-xs py-1.5 px-3"
          >
            <Plus size={13} /> {isAddingFinding ? "Cancel" : "Add Finding"}
          </Button>
        </div>

        {/* New Finding Form */}
        {isAddingFinding && (
          <div className="rounded-xl border border-primary/20 bg-secondary/20 p-4 text-xs space-y-3">
            <h5 className="font-bold text-foreground">New Diagnosis Finding</h5>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Fault / Finding Title:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Battery Swelling & Degraded Capacity"
                  value={newFindingTitle}
                  onChange={(e) => setNewFindingTitle(e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Source:
                </label>
                <select
                  value={newFindingSource}
                  onChange={(e) =>
                    setNewFindingSource(e.target.value as FindingSource)
                  }
                  className={fieldClass}
                >
                  <option value="technician">Technician Discovered</option>
                  <option value="customer">Customer Reported</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Classification:
                </label>
                <select
                  value={newFindingClass}
                  onChange={(e) =>
                    setNewFindingClass(e.target.value as FindingClassification)
                  }
                  className={fieldClass}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="suspected">Suspected</option>
                  <option value="needs_further_testing">
                    Needs Further Testing
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Safety / Dependency:
                </label>
                <select
                  value={newFindingSafety}
                  onChange={(e) =>
                    setNewFindingSafety(e.target.value as RepairSafety)
                  }
                  className={fieldClass}
                >
                  <option value="required">
                    Required (Device will not work safely without it)
                  </option>
                  <option value="recommended">
                    Recommended (Performance/stability)
                  </option>
                  <option value="optional">
                    Optional (Cosmetic/accessory)
                  </option>
                  <option value="cosmetic">Cosmetic Only</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-foreground mb-1">
                Customer-Safe Explanation:
              </label>
              <textarea
                rows={2}
                placeholder="Plain language explanation that customers see on their quotation tracker..."
                value={newFindingCustExpl}
                onChange={(e) => setNewFindingCustExpl(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-foreground mb-1">
                Recommended Repair:
              </label>
              <input
                type="text"
                placeholder="e.g. Replace with OEM 56Wh Grade-A Battery"
                value={newFindingRecRepair}
                onChange={(e) => setNewFindingRecRepair(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={handleAddFinding}
                className="text-xs"
              >
                Save Finding
              </Button>
            </div>
          </div>
        )}

        {/* Findings List */}
        <div className="space-y-2">
          {findings.map((f) => (
            <div
              key={f.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border p-3.5 text-xs bg-card"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-foreground">{f.title}</span>
                  <Badge tone={f.source === "customer" ? "blue" : "amber"}>
                    {f.source === "customer" ? "Customer" : "Tech Found"}
                  </Badge>
                  <Badge tone={f.safety === "required" ? "red" : "gray"}>
                    {f.safety.toUpperCase()}
                  </Badge>
                  <Badge tone="green">{f.classification}</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  {f.customerExplanation || f.description}
                </p>
                {f.recommendedRepair && (
                  <p className="text-[10px] font-semibold text-primary">
                    Action: {f.recommendedRepair}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveFinding(f.id)}
                className="text-red-500 hover:text-red-700 p-1"
                title="Remove finding"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Itemized Quotation Lines */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h4 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
              <Layers size={15} className="text-primary" />
              <span>Itemized Quotation Items ({quotationItems.length})</span>
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Individual parts and labour pricing. Customers can authorize
              eligible items individually.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsAddingItem((prev) => !prev)}
            className="text-xs py-1.5 px-3"
          >
            <Plus size={13} /> {isAddingItem ? "Cancel" : "Add Item"}
          </Button>
        </div>

        {/* Add Item Form */}
        {isAddingItem && (
          <div className="rounded-xl border border-primary/20 bg-secondary/20 p-4 text-xs space-y-3">
            <h5 className="font-bold text-foreground">
              New Quotation Line Item
            </h5>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Item / Part Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dell XPS Battery Replacement"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Link to Finding (Optional):
                </label>
                <select
                  value={newItemFindingId}
                  onChange={(e) => setNewItemFindingId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Unlinked / General Workbench</option>
                  {findings.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title} ({f.safety})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Part Cost (₹):
                </label>
                <input
                  type="number"
                  min={0}
                  value={newItemPartCost}
                  onChange={(e) => setNewItemPartCost(Number(e.target.value))}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Labour Cost (₹):
                </label>
                <input
                  type="number"
                  min={0}
                  value={newItemLabourCost}
                  onChange={(e) => setNewItemLabourCost(Number(e.target.value))}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Depends On (Optional Item ID):
                </label>
                <select
                  value={newItemDependsOn}
                  onChange={(e) => setNewItemDependsOn(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">
                    No Dependency (Can be approved standalone)
                  </option>
                  {quotationItems.map((qi) => (
                    <option key={qi.id} value={qi.id}>
                      Requires: {qi.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItemIsRequired}
                    onChange={(e) => setNewItemIsRequired(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary"
                  />
                  <span className="font-semibold text-foreground text-xs">
                    Required Repair
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItemCanDefer}
                    onChange={(e) => setNewItemCanDefer(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary"
                  />
                  <span className="text-muted-foreground text-xs">
                    Can Safely Defer
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={handleAddQuotationItem}
                className="text-xs"
              >
                Save Line Item
              </Button>
            </div>
          </div>
        )}

        {/* Line Items List */}
        <div className="space-y-2">
          {quotationItems.map((item) => {
            const linkedFinding = findings.find((f) => f.id === item.findingId)
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 text-xs bg-card"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">
                      {item.title}
                    </span>
                    {item.isRequired && <Badge tone="red">REQUIRED</Badge>}
                    {item.canDefer && <Badge tone="gray">DEFERRABLE</Badge>}
                    {item.dependsOn && item.dependsOn.length > 0 && (
                      <Badge tone="amber">HAS DEPENDENCY</Badge>
                    )}
                    {linkedFinding && (
                      <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Linked: {linkedFinding.title} (
                        {linkedFinding.source === "customer"
                          ? "Customer"
                          : "Tech Found"}
                        )
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Part: {money(item.partCost)} · Labour:{" "}
                    {money(item.labourCost)} · Qty: {item.quantity}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-extrabold text-foreground text-sm">
                    {money(item.lineTotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveQuotationItem(item.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Remove quotation item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Calculated Authoritative Total Summary */}
        <div className="rounded-xl border border-border bg-secondary/30 p-4 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Parts Subtotal:</span>
            <span className="font-semibold">{money(totals.partsTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Labour Subtotal:</span>
            <span className="font-semibold">{money(totals.labourTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Diagnostic Fee:</span>
            <span className="font-semibold text-emerald-600">
              ₹0 (Waived when repairs approved)
            </span>
          </div>
          {totals.courierFee > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Return Courier:</span>
              <span className="font-semibold">{money(totals.courierFee)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-sm font-bold">
            <span>Published Grand Total:</span>
            <span className="text-base font-extrabold text-primary">
              {money(totals.totalPayable)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Revision Audit Trail */}
      {request.quotationHistory && request.quotationHistory.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm text-xs">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="flex w-full items-center justify-between font-bold text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <History size={15} className="text-primary" />
              <span>
                Quotation Revision History ({request.quotationHistory.length})
              </span>
            </span>
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {request.quotationHistory.map((rev, idx) => (
                <div
                  key={idx}
                  className="rounded-lg bg-secondary/20 p-2.5 text-[11px]"
                >
                  <div className="flex justify-between font-bold">
                    <span>
                      Version {rev.version} — {money(rev.totalAmount)}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(rev.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">
                    Items: {rev.items?.length || 0} · Findings:{" "}
                    {rev.findings?.length || 0}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Admin Internal Notes */}
      <Field label="Administrative Staff Notes (Internal Only)">
        <textarea
          rows={2}
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Private lab notes, diagnostic board voltages, parts supplier tracking..."
          className={fieldClass}
        />
      </Field>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 7. Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          disabled={isPublishing}
          onClick={handlePublishQuotation}
          className="text-xs"
        >
          {isPublishing
            ? "Publishing & Saving..."
            : `Publish Quotation v${(request.quoteVersion || 1) + 1} (${money(totals.totalPayable)})`}
        </Button>

        <div className="flex items-center gap-3">
          <ActionLink
            secondary
            to={`/track-service/${request.id}`}
            className="text-xs"
          >
            Customer View <ArrowRight size={13} className="inline ml-1" />
          </ActionLink>
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
