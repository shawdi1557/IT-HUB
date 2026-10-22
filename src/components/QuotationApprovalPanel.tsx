import { useState } from "react"
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
} from "lucide-react"
import { useStore } from "../app/store"
import { money, type ServiceRequest } from "../data/catalog"
import {
  submitCustomerQuoteDecision,
  isUserTicketOwner,
  type SafePublicTracking,
} from "../lib/services"
import { Badge, Button } from "./ui"

interface QuotationApprovalPanelProps {
  request: ServiceRequest
  safeData: SafePublicTracking
  onDecisionComplete?: (updated: ServiceRequest) => void
  isEmbedded?: boolean
}

export default function QuotationApprovalPanel({
  request,
  safeData,
  onDecisionComplete,
  isEmbedded = false,
}: QuotationApprovalPanelProps) {
  const store = useStore()

  // Concurrency & confirmation states
  const [confirmingAction, setConfirmingAction] =
    useState<"approved" | "rejected" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Verify ownership using multi-factor identity comparison
  const isOwner = isUserTicketOwner(request, store.profile, {
    id: store.profile.id,
    email: store.profile.email,
    phone: store.profile.phone,
  })

  // Quotation calculations
  const quoteAmount = request.quote || 1500
  const diagnosticFee = Math.min(300, quoteAmount)
  const partsLabourFee = Math.max(0, quoteAmount - diagnosticFee)
  const courierFee =
    request.method === "courier" || safeData.method === "courier"
      ? safeData.courierCharge?.returnDelivery || 150
      : 0
  const totalPayable = quoteAmount + courierFee

  // Decision submit handler
  const handleConfirmDecision = async () => {
    if (!confirmingAction) return
    setIsSubmitting(true)
    setActionError(null)

    try {
      const result = await submitCustomerQuoteDecision(
        request.id,
        confirmingAction,
        request.quote,
      )

      if (!result.ok) {
        setActionError(
          result.error ||
            "Unable to record decision. Please refresh the page and try again.",
        )
        setIsSubmitting(false)
        return
      }

      // Update local store requests state
      const nextStatus =
        result.nextStatus ?? (confirmingAction === "approved" ? 5 : 4)

      const updatedRequest: ServiceRequest = {
        ...request,
        quoteState: confirmingAction,
        status: nextStatus,
      }

      store.set((prev) => ({
        requests: prev.requests.map((r) =>
          r.id === request.id ? updatedRequest : r,
        ),
      }))

      store.notify(
        confirmingAction === "approved"
          ? `Repair quote of ${money(totalPayable)} approved! Bench work has been authorized.`
          : "Quotation declined. IT HUB will prepare your device for collection/return.",
      )

      setConfirmingAction(null)
      setIsSubmitting(false)

      if (onDecisionComplete) {
        onDecisionComplete(updatedRequest)
      }
    } catch (err: any) {
      setActionError(
        err?.message ||
          "A network error occurred while submitting your decision.",
      )
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className={`rounded-2xl border border-border bg-white p-6 shadow-sm ${
        isEmbedded ? "mt-4" : ""
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Repair Quotation & Bench Authorization
          </span>
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
            ? "APPROVED BY CUSTOMER"
            : safeData.quoteState === "rejected"
              ? "DECLINED"
              : "AWAITING CUSTOMER APPROVAL"}
        </Badge>
      </div>

      {/* Persisted Quotation Breakdown */}
      <div className="mt-5 space-y-2.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            Diagnostic Assessment Fee:
          </span>
          <span className="font-semibold text-foreground">
            {money(diagnosticFee)}{" "}
            <span className="text-[10px] text-emerald-600 font-normal">
              (credited upon repair)
            </span>
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">
            Replaced Parts & Lab Labour:
          </span>
          <span className="font-semibold text-foreground">
            {money(partsLabourFee)}
          </span>
        </div>

        {courierFee > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Insured Return Courier (Kerala-wide):
            </span>
            <span className="font-semibold text-foreground">
              {money(courierFee)}
            </span>
          </div>
        )}

        <div className="flex justify-between border-t border-border pt-3 text-sm font-bold">
          <span className="text-foreground">Total Quoted Amount:</span>
          <span className="text-base font-extrabold text-primary">
            {money(totalPayable)}
          </span>
        </div>
      </div>

      {/* Customer Diagnostic Notes */}
      <div className="mt-4 rounded-xl border border-border/70 bg-secondary/20 p-3.5 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <FileText size={14} className="text-primary" />
          <span>Bench Technician Diagnosis:</span>
        </div>
        <p className="mt-1 text-muted-foreground leading-relaxed">
          {safeData.notesPublic ||
            request.notes ||
            `Observed issue: ${safeData.problem || request.problem}. Verified internal hardware components and diagnostic fault lines.`}
        </p>
      </div>

      {/* Standard Terms & Trust Warranties */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
          <span>90-Day IT HUB Workmanship Warranty</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-primary shrink-0" />
          <span>Turnaround: 24–48 hours after approval</span>
        </div>
        <div className="flex items-center gap-1.5 sm:col-span-2">
          <Wrench size={14} className="text-amber-600 shrink-0" />
          <span>Genuine OEM & Grade-A replacement parts guaranteed</span>
        </div>
      </div>

      {/* Error Banner */}
      {actionError && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Action Flow Decisions */}
      <div className="mt-6 border-t border-border pt-4">
        {/* State A: Quote already finalized */}
        {safeData.quoteState === "approved" ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>
              Quotation approved. Our technician has commenced bench repair. You
              can track progress in the timeline above.
            </span>
          </div>
        ) : safeData.quoteState === "rejected" ? (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3.5 text-xs font-semibold text-amber-800">
            <XCircle size={16} className="text-amber-600 shrink-0" />
            <span>
              Quotation declined. Hardware bench repair has been halted. Your
              device is being readied for collection/return.
            </span>
          </div>
        ) : (
          /* State B: Quote is pending decision */
          <>
            {/* Unauthenticated Visitor */}
            {!store.loggedIn ? (
              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-xs">
                <p className="font-semibold text-foreground">
                  <Lock size={13} className="inline mr-1 text-primary" />
                  Sign in required to approve or decline this quotation
                </p>
                <p className="mt-1 text-muted-foreground">
                  To protect device security, only the authenticated ticket
                  owner can authorize repair costs.
                </p>
                <Button
                  onClick={() => store.setAuthOpen(true)}
                  className="mt-3 text-xs"
                >
                  Sign In to Review & Approve
                </Button>
              </div>
            ) : !isOwner ? (
              /* Authenticated but not ticket owner */
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                <p className="font-bold flex items-center gap-1.5">
                  <Lock size={14} className="shrink-0 text-amber-600" />
                  Account Authorization Restricted
                </p>
                <p className="mt-1 leading-relaxed">
                  You are signed in as{" "}
                  <strong>{store.profile.email || store.profile.phone}</strong>,
                  which does not match the customer record registered for this
                  service ticket. Quotation actions are restricted to the ticket
                  owner.
                </p>
              </div>
            ) : (
              /* Authenticated ticket owner */
              <div>
                {confirmingAction ? (
                  /* Confirmation Step */
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs">
                    <p className="font-bold text-foreground">
                      {confirmingAction === "approved"
                        ? `Authorize Repair for ${money(totalPayable)}?`
                        : "Decline Quotation & Cancel Repair?"}
                    </p>
                    <p className="mt-1 text-muted-foreground leading-relaxed">
                      {confirmingAction === "approved"
                        ? "By confirming, you authorize IT HUB technicians to install the required parts and carry out the bench repair. The diagnostic fee is credited against this total."
                        : "By declining, no further repairs will be performed. The device will be reassembled and prepared for pickup. The ₹300 bench diagnostic fee remains payable upon collection."}
                    </p>

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
                            Recording Decision...
                          </>
                        ) : confirmingAction === "approved" ? (
                          "Yes, Authorize Repair"
                        ) : (
                          "Yes, Decline Quotation"
                        )}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isSubmitting}
                        onClick={() => {
                          setConfirmingAction(null)
                          setActionError(null)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Initial Decision Buttons */
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => {
                        setActionError(null)
                        setConfirmingAction("approved")
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                    >
                      <CheckCircle2 size={15} />
                      Approve Repair ({money(totalPayable)})
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setActionError(null)
                        setConfirmingAction("rejected")
                      }}
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-xs"
                    >
                      <XCircle size={15} />
                      Decline Quotation
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
