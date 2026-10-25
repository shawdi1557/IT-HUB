import { useState, useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Loader2,
  ShieldCheck,
  Clock,
  Wrench,
  FileText,
  Layers,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { useStore } from "../app/store";
import {
  money,
  type ServiceRequest,
  type QuotationItem,
  type DiagnosisFinding,
} from "../data/catalog";
import {
  submitCustomerQuoteDecision,
  isUserTicketOwner,
  calculateQuotationTotals,
  validateItemSelection,
  type SafePublicTracking,
} from "../lib/services";
import { Badge, Button } from "./ui";
import RepairPaymentModal from "./RepairPaymentModal";

interface QuotationApprovalPanelProps {
  request: ServiceRequest;
  safeData: SafePublicTracking;
  onDecisionComplete?: (updated: ServiceRequest) => void;
  isEmbedded?: boolean;
}

export default function QuotationApprovalPanel({
  request,
  safeData,
  onDecisionComplete,
  isEmbedded = false,
}: QuotationApprovalPanelProps) {
  const store = useStore();

  // Concurrency & confirmation states
  const [confirmingAction, setConfirmingAction] = useState<"approved" | "rejected" | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<string>("");

  // Ownership verification
  const isOwner = isUserTicketOwner(request, store.profile, {
    id: store.profile.id,
    email: store.profile.email,
    phone: store.profile.phone,
  });

  // Normalize findings and quotation items
  const findings: DiagnosisFinding[] = useMemo(() => {
    return safeData.findings && safeData.findings.length > 0
      ? safeData.findings
      : request.findings && request.findings.length > 0
        ? request.findings
        : [];
  }, [safeData.findings, request.findings]);

  const quotationItems: QuotationItem[] = useMemo(() => {
    const raw =
      safeData.quotationItems && safeData.quotationItems.length > 0
        ? safeData.quotationItems
        : request.quotationItems && request.quotationItems.length > 0
          ? request.quotationItems
          : [];

    if (raw.length > 0) return raw;

    // Fallback single line item if legacy ticket lacks itemized breakdown
    const fallbackCost = request.quote || 1500;
    const diagnosticCredit = Math.min(300, fallbackCost);
    return [
      {
        id: "item-workbench-service",
        title: `${request.device} Hardware Diagnostic & Workbench Service`,
        description: request.problem || "Diagnostic assessment and standard workshop repairs.",
        partCost: Math.max(0, fallbackCost - diagnosticCredit),
        labourCost: diagnosticCredit,
        quantity: 1,
        lineTotal: fallbackCost,
        isRequired: true,
        canDefer: false,
        approvalState: (request.quoteState as any) || "pending",
      },
    ];
  }, [
    safeData.quotationItems,
    request.quotationItems,
    request.device,
    request.problem,
    request.quote,
    request.quoteState,
  ]);

  // Track customer-selected items (default to all items, or approvedItems if already resolved)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(() => {
    if (request.approvedItems && request.approvedItems.length > 0) {
      return request.approvedItems;
    }
    return quotationItems.map((item) => item.id);
  });

  // Handle item toggle with dependency and required rules
  const handleToggleItem = (itemId: string) => {
    setActionError(null);
    const targetItem = quotationItems.find((i) => i.id === itemId);
    if (!targetItem) return;

    const isCurrentlySelected = selectedItemIds.includes(itemId);

    if (isCurrentlySelected) {
      // Trying to uncheck
      if (targetItem.isRequired) {
        setActionError(
          `"${targetItem.title}" is required for basic operation and cannot be deselected if authorizing repairs. If you do not wish to proceed, please select "Decline All Quotations".`,
        );
        return;
      }

      // Check if any OTHER currently selected item depends on this item
      const dependentItems = quotationItems.filter(
        (i) => selectedItemIds.includes(i.id) && i.dependsOn?.includes(itemId),
      );
      if (dependentItems.length > 0) {
        const depNames = dependentItems.map((i) => i.title).join(", ");
        setActionError(
          `Cannot deselect "${targetItem.title}" because other selected repairs (${depNames}) depend on it. Please deselect them first.`,
        );
        return;
      }

      setSelectedItemIds((prev) => prev.filter((id) => id !== itemId));
    } else {
      // Trying to check: also auto-select any dependencies it requires
      const toAdd = [itemId];
      if (targetItem.dependsOn && targetItem.dependsOn.length > 0) {
        for (const depId of targetItem.dependsOn) {
          if (!selectedItemIds.includes(depId) && !toAdd.includes(depId)) {
            toAdd.push(depId);
          }
        }
      }
      setSelectedItemIds((prev) => [...prev, ...toAdd]);
    }
  };

  // Live calculation based on current selections
  const effectiveSelections =
    safeData.quoteState === "approved" ? request.approvedItems || selectedItemIds : selectedItemIds;

  const calc = useMemo(() => {
    return calculateQuotationTotals(quotationItems, effectiveSelections, safeData.courierCharge);
  }, [quotationItems, effectiveSelections, safeData.courierCharge]);

  const allPayable = useMemo(() => {
    return calculateQuotationTotals(
      quotationItems,
      quotationItems.map((i) => i.id),
      safeData.courierCharge,
    ).totalPayable;
  }, [quotationItems, safeData.courierCharge]);

  const requiredCount = useMemo(
    () => quotationItems.filter((i) => i.isRequired).length,
    [quotationItems],
  );
  const optionalCount = quotationItems.length - requiredCount;

  // Pre-submission validation
  const validation = useMemo(() => {
    return validateItemSelection(quotationItems, selectedItemIds, "approved");
  }, [quotationItems, selectedItemIds]);

  // Decision submit handler
  const handleConfirmDecision = async () => {
    if (!confirmingAction) return;
    setIsSubmitting(true);
    setActionError(null);

    const finalItemIds = confirmingAction === "approved" ? selectedItemIds : [];

    // Enforce selection validation
    if (confirmingAction === "approved") {
      const val = validateItemSelection(quotationItems, finalItemIds, "approved");
      if (!val.valid) {
        setActionError(val.error || "Invalid item selection.");
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const result = await submitCustomerQuoteDecision(
        request.id,
        confirmingAction,
        finalItemIds,
        request.quoteVersion || 1,
        decisionNotes,
        request.quote,
        request,
      );

      if (!result.ok) {
        setActionError(
          result.error || "Unable to record decision. Please refresh the page and try again.",
        );
        setIsSubmitting(false);
        return;
      }

      const nextStatus = result.nextStatus ?? (confirmingAction === "approved" ? 5 : 4);

      const updatedRequest: ServiceRequest = {
        ...request,
        quoteState: confirmingAction,
        status: nextStatus,
        quote: result.totalAmount ?? calc.totalPayable,
        approvedItems: result.approvedItems || finalItemIds,
        declinedItems:
          result.declinedItems ||
          quotationItems.map((i) => i.id).filter((id) => !finalItemIds.includes(id)),
        decisionNotes,
        decisionAt: new Date().toISOString(),
      };

      store.set((prev) => ({
        requests: prev.requests.map((r) => (r.id === request.id ? updatedRequest : r)),
      }));

      store.notify(
        confirmingAction === "approved"
          ? `Quotation of ${money(calc.totalPayable)} authorized! (${finalItemIds.length} item(s) approved)`
          : "Quotation declined. IT HUB will prepare your device for collection/return.",
      );

      setConfirmingAction(null);
      setIsSubmitting(false);

      if (onDecisionComplete) {
        onDecisionComplete(updatedRequest);
      }
    } catch (err: any) {
      setActionError(err?.message || "A network error occurred while submitting your decision.");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-border bg-white p-6 shadow-sm ${
        isEmbedded ? "mt-4" : ""
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Itemized Quotation & Repair Authorization
            </span>
            {request.quoteVersion && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-bold text-primary">
                v{request.quoteVersion}
              </span>
            )}
          </div>
          <h3 className="text-base font-extrabold text-foreground">
            Official IT HUB Repair Estimate
          </h3>
        </div>
        <Badge
          tone={
            safeData.quoteState === "approved"
              ? "green"
              : safeData.quoteState === "rejected"
                ? "red"
                : "amber"
          }
        >
          {safeData.quoteState === "approved"
            ? "REPAIR AUTHORIZED"
            : safeData.quoteState === "rejected"
              ? "DECLINED BY CUSTOMER"
              : "AWAITING CUSTOMER APPROVAL"}
        </Badge>
      </div>

      {/* 1. Original Customer Complaint */}
      <div className="mt-4 rounded-xl border border-border/70 bg-secondary/15 p-3.5 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <FileText size={14} className="text-primary" />
          <span>Reported Customer Issue:</span>
        </div>
        <p className="mt-1 font-medium text-foreground">{request.problem || safeData.problem}</p>
      </div>

      {/* 2. Newly Discovered & Bench Findings (Separated from customer complaint) */}
      {findings.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Wrench size={13} className="text-primary" />
            <span>Lab Diagnostic Findings ({findings.length})</span>
          </h4>
          <div className="grid gap-2">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-xl border border-border bg-card/60 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-bold text-foreground">{finding.title}</span>
                  <div className="flex items-center gap-1">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        finding.source === "customer"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {finding.source === "customer"
                        ? "Customer-Reported"
                        : "Technician-Discovered"}
                    </span>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        finding.safety === "required"
                          ? "bg-red-50 text-red-700"
                          : finding.safety === "optional"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {finding.safety.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-muted-foreground leading-relaxed">
                  {finding.customerExplanation || finding.description}
                </p>
                {finding.recommendedRepair && (
                  <p className="mt-1 text-[11px] font-semibold text-primary">
                    Recommended Fix: {finding.recommendedRepair}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Itemized Quotation Lines with Individual Selection */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers size={13} className="text-primary" />
              <span>Itemized Work Scope & Parts ({quotationItems.length})</span>
            </h4>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Review faults and select eligible repairs to authorize. Mandatory repairs are locked
              for safety.
            </p>
          </div>

          {safeData.quoteState === "pending" &&
            isOwner &&
            quotationItems.length > 1 &&
            optionalCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setSelectedItemIds(quotationItems.map((i) => i.id));
                  }}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition ${
                    selectedItemIds.length === quotationItems.length
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  Select All ({quotationItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    const requiredIds = quotationItems.filter((i) => i.isRequired).map((i) => i.id);
                    const toSelect = requiredIds.length > 0 ? requiredIds : [quotationItems[0].id];
                    setSelectedItemIds(toSelect);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition ${
                    selectedItemIds.length < quotationItems.length
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  Essential Only ({requiredCount > 0 ? requiredCount : 1})
                </button>
              </div>
            )}
        </div>

        <div className="space-y-2.5">
          {quotationItems.map((item) => {
            const isChecked = selectedItemIds.includes(item.id);
            const isApproved = request.approvedItems?.includes(item.id);
            const isDeclined = request.declinedItems?.includes(item.id);
            const linkedFinding = findings.find((f) => f.id === item.findingId);

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-3.5 transition text-xs ${
                  isChecked
                    ? "border-primary/40 bg-primary/5 shadow-xs"
                    : "border-border bg-white text-muted-foreground opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    {safeData.quoteState === "pending" && isOwner ? (
                      item.isRequired ? (
                        <div className="mt-0.5 shrink-0" title="Mandatory core repair — locked">
                          <input
                            type="checkbox"
                            checked={true}
                            disabled={true}
                            className="h-4 w-4 rounded border-border text-primary cursor-not-allowed opacity-80"
                          />
                        </div>
                      ) : (
                        <input
                          type="checkbox"
                          id={`item-${item.id}`}
                          checked={isChecked}
                          onChange={() => handleToggleItem(item.id)}
                          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                        />
                      )
                    ) : (
                      <span className="mt-0.5 shrink-0">
                        {isApproved ? (
                          <CheckCircle2 size={16} className="text-emerald-600" />
                        ) : isDeclined ? (
                          <XCircle size={16} className="text-amber-600" />
                        ) : (
                          <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
                        )}
                      </span>
                    )}

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor={`item-${item.id}`}
                          className={`font-bold ${
                            item.isRequired
                              ? "text-foreground"
                              : isChecked
                                ? "text-foreground cursor-pointer"
                                : "text-muted-foreground cursor-pointer"
                          }`}
                        >
                          {item.title}
                        </label>

                        {/* Authorization Eligibility Badges */}
                        {item.isRequired ? (
                          <span className="inline-flex items-center gap-1 rounded bg-red-100 text-red-800 px-1.5 py-0.5 font-bold text-[10px]">
                            <Lock size={10} className="shrink-0" />
                            Mandatory Core Repair (Locked)
                          </span>
                        ) : item.canDefer ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 text-[10px]">
                            Optional / Safely Deferrable
                          </span>
                        ) : null}

                        {item.dependsOn && item.dependsOn.length > 0 && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 text-[10px]">
                            Requires prerequisite repair
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-[11px] text-muted-foreground">{item.description}</p>

                      {/* Linked Diagnosis Finding & Explanation */}
                      {linkedFinding && (
                        <div className="mt-2 rounded-lg bg-secondary/50 border border-border/50 p-2 text-[11px] space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-foreground">
                            <span>Diagnosis: {linkedFinding.title}</span>
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                              {linkedFinding.source === "customer"
                                ? "Customer Complaint"
                                : "Technician Discovered"}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-[10px]">
                            {linkedFinding.customerExplanation || linkedFinding.description}
                          </p>
                        </div>
                      )}

                      {/* Locked or Deferral helper note */}
                      {safeData.quoteState === "pending" && isOwner && (
                        <p className="mt-1.5 text-[10px] italic">
                          {item.isRequired ? (
                            <span className="text-red-700 font-medium">
                              * Essential core repair required for safety and functionality; cannot
                              be deselected unless declining all repairs.
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-medium">
                              * Eligible for individual approval. You may uncheck to defer or
                              exclude this repair.
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-extrabold text-foreground text-sm block">
                      {money(item.lineTotal)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Part: {money(item.partCost)} · Labour: {money(item.labourCost)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Live Calculated Cost Summary */}
      <div className="mt-5 rounded-xl border border-border bg-secondary/20 p-4 text-xs space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            Selected Replaced Parts ({calc.selectedCount} item(s)):
          </span>
          <span className="font-semibold text-foreground">{money(calc.partsTotal)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Labour & Bench Testing:</span>
          <span className="font-semibold text-foreground">{money(calc.labourTotal)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Diagnostic Assessment Fee:</span>
          <span className="font-semibold text-foreground">
            {calc.diagnosticFeeWaived ? (
              <span className="text-emerald-600 font-bold">₹0 (Waived upon repair approval)</span>
            ) : (
              <span>{money(calc.diagnosticFee)}</span>
            )}
          </span>
        </div>

        {calc.courierFee > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Insured Return Courier (Kerala-wide):</span>
            <span className="font-semibold text-foreground">{money(calc.courierFee)}</span>
          </div>
        )}

        <div className="flex justify-between border-t border-border pt-2.5 text-sm font-bold">
          <span className="text-foreground">
            {safeData.quoteState === "pending"
              ? "Total Estimated Payable:"
              : "Final Authorized Total:"}
          </span>
          <span className="text-base font-extrabold text-primary">{money(calc.totalPayable)}</span>
        </div>

        <p className="text-[10px] text-muted-foreground italic mt-1">
          *Note: All diagnostic fees are credited against authorized repairs. If you decline all
          repairs, only the standard ₹300 inspection charge applies upon device pickup.
        </p>
      </div>

      {/* Standard Terms & Warranties */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
          <span>90-Day IT HUB Workmanship Warranty on Replaced Parts</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-primary shrink-0" />
          <span>Turnaround: 24–48 hours after approval</span>
        </div>
      </div>

      {/* Error Alert */}
      {actionError && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Decision Actions */}
      <div className="mt-5 border-t border-border pt-4">
        {/* State A: Finalized decision display */}
        {safeData.quoteState === "approved" ? (
          <div className="rounded-xl bg-emerald-50 p-4 text-xs text-emerald-800 space-y-2.5">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>
                Repair Scope Authorized ({calc.selectedCount} of {quotationItems.length} item(s)
                approved)
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Our bench technician has commenced work on authorized items.
              {request.declinedItems && request.declinedItems.length > 0 && (
                <span>
                  {" "}
                  ({request.declinedItems.length} repair item(s) safely deferred/excluded).
                </span>
              )}
            </p>

            <div className="pt-2 border-t border-emerald-200/60 grid gap-2 sm:grid-cols-2 text-[11px]">
              <div>
                <span className="font-bold text-emerald-900 block mb-1">Approved Repairs:</span>
                <ul className="list-disc pl-4 space-y-0.5 text-emerald-800">
                  {quotationItems
                    .filter((i) =>
                      (request.approvedItems && request.approvedItems.length > 0
                        ? request.approvedItems
                        : selectedItemIds
                      ).includes(i.id),
                    )
                    .map((i) => (
                      <li key={i.id}>
                        {i.title} ({money(i.lineTotal)})
                      </li>
                    ))}
                </ul>
              </div>

              {quotationItems.some(
                (i) =>
                  !(
                    request.approvedItems && request.approvedItems.length > 0
                      ? request.approvedItems
                      : selectedItemIds
                  ).includes(i.id),
              ) && (
                <div>
                  <span className="font-bold text-amber-900 block mb-1">
                    Deferred / Skipped Repairs:
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                    {quotationItems
                      .filter(
                        (i) =>
                          !(
                            request.approvedItems && request.approvedItems.length > 0
                              ? request.approvedItems
                              : selectedItemIds
                          ).includes(i.id),
                      )
                      .map((i) => (
                        <li key={i.id}>
                          {i.title} ({money(i.lineTotal)}) [Deferred]
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : safeData.quoteState === "rejected" ? (
          <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800 space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <XCircle size={16} className="text-amber-600 shrink-0" />
              <span>Quotation Declined by Customer</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              No repair work will be performed. The device is being reassembled for pickup. The ₹300
              inspection charge applies upon collection.
            </p>
          </div>
        ) : (
          /* State B: Decision Pending */
          <>
            {!store.loggedIn ? (
              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-xs">
                <p className="font-semibold text-foreground">
                  <Lock size={13} className="inline mr-1 text-primary" />
                  Sign in required to authorize or customize repairs
                </p>
                <p className="mt-1 text-muted-foreground">
                  To protect device security, only the authenticated ticket owner can select and
                  approve repair scope.
                </p>
                <Button onClick={() => store.setAuthOpen(true)} className="mt-3 text-xs">
                  Sign In to Authorize
                </Button>
              </div>
            ) : !isOwner ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                <p className="font-bold flex items-center gap-1.5">
                  <Lock size={14} className="shrink-0 text-amber-600" />
                  Account Authorization Restricted
                </p>
                <p className="mt-1 leading-relaxed">
                  You are signed in as <strong>{store.profile.email || store.profile.phone}</strong>
                  , which does not match the registered customer record for this service ticket.
                </p>
              </div>
            ) : (
              <div>
                {confirmingAction ? (
                  /* Confirmation Modal / Step */
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs">
                    <p className="font-bold text-foreground">
                      {confirmingAction === "approved"
                        ? `Confirm Authorization for ${money(calc.totalPayable)}?`
                        : "Confirm Cancellation & Decline All Repairs?"}
                    </p>

                    <div className="mt-2 text-muted-foreground space-y-1">
                      {confirmingAction === "approved" ? (
                        <>
                          <p>
                            You are authorizing <strong>{selectedItemIds.length}</strong> repair
                            item(s):
                          </p>
                          <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                            {quotationItems
                              .filter((i) => selectedItemIds.includes(i.id))
                              .map((i) => (
                                <li key={i.id} className="text-emerald-700">
                                  {i.title} ({money(i.lineTotal)})
                                </li>
                              ))}
                          </ul>

                          {quotationItems.some((i) => !selectedItemIds.includes(i.id)) && (
                            <>
                              <p className="mt-2 text-amber-800 font-semibold">
                                The following item(s) will be deferred / skipped:
                              </p>
                              <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                                {quotationItems
                                  .filter((i) => !selectedItemIds.includes(i.id))
                                  .map((i) => (
                                    <li key={i.id} className="text-slate-600">
                                      {i.title} ({money(i.lineTotal)}) [Skipped]
                                    </li>
                                  ))}
                              </ul>
                            </>
                          )}
                        </>
                      ) : (
                        <p>
                          By declining, all repair work will be cancelled. The device will be
                          reassembled and prepared for return. The standard ₹300 inspection charge
                          applies upon pickup.
                        </p>
                      )}
                    </div>

                    <div className="mt-3">
                      <label className="block text-[11px] font-semibold text-foreground mb-1">
                        Optional instructions or notes for technician:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Please proceed with battery only; will do screen later"
                        value={decisionNotes}
                        onChange={(e) => setDecisionNotes(e.target.value)}
                        className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        disabled={isSubmitting}
                        onClick={handleConfirmDecision}
                        className={
                          confirmingAction === "approved"
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : "bg-red-600 hover:bg-red-700"
                        }
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 size={14} className="animate-spin mr-1" />
                            Recording Authorization...
                          </>
                        ) : confirmingAction === "approved" ? (
                          `Yes, Authorize (${money(calc.totalPayable)})`
                        ) : (
                          "Yes, Decline All Work"
                        )}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isSubmitting}
                        onClick={() => {
                          setConfirmingAction(null);
                          setActionError(null);
                        }}
                      >
                        Back
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Action Buttons */
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      disabled={!validation.valid || selectedItemIds.length === 0}
                      onClick={() => {
                        setActionError(null);
                        const val = validateItemSelection(
                          quotationItems,
                          selectedItemIds,
                          "approved",
                        );
                        if (!val.valid) {
                          setActionError(val.error || "Please select valid repairs to continue.");
                          return;
                        }
                        setIsPaymentModalOpen(true);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                    >
                      <CheckCircle2 size={15} />
                      {selectedItemIds.length === quotationItems.length
                        ? `Authorize All Repairs (${money(calc.totalPayable)})`
                        : `Authorize Selected Repairs (${selectedItemIds.length} of ${quotationItems.length} items · ${money(calc.totalPayable)})`}
                    </Button>

                    {selectedItemIds.length < quotationItems.length && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActionError(null);
                          const allIds = quotationItems.map((i) => i.id);
                          setSelectedItemIds(allIds);
                          setIsPaymentModalOpen(true);
                        }}
                        className="text-xs"
                      >
                        Authorize All ({money(allPayable)})
                      </Button>
                    )}

                    <Button
                      variant="secondary"
                      onClick={() => {
                        setActionError(null);
                        setConfirmingAction("rejected");
                      }}
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-xs"
                    >
                      <XCircle size={15} />
                      Decline All Quotations
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Complete Cost Breakdown & Mock Razorpay Payment Modal */}
      <RepairPaymentModal
        open={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        request={request}
        quotationItems={quotationItems}
        selectedItemIds={selectedItemIds}
        calc={calc}
        decisionNotes={decisionNotes}
        onDecisionNotesChange={setDecisionNotes}
        onSuccess={(updated) => {
          setIsPaymentModalOpen(false);
          if (onDecisionComplete) {
            onDecisionComplete(updated);
          }
        }}
      />
    </div>
  );
}
