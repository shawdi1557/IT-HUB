import { useState } from "react"
import {
  ShieldCheck,
  Clock,
  Wrench,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Smartphone,
  CreditCard,
  Building2,
  Sparkles,
  Receipt,
  Check,
  Info,
} from "lucide-react"
import { useStore } from "../app/store"
import {
  money,
  type ServiceRequest,
  type QuotationItem,
} from "../data/catalog"
import {
  submitCustomerQuoteDecision,
  type calculateQuotationTotals,
} from "../lib/services"
import { Modal, Button, Badge } from "./ui"

interface RepairPaymentModalProps {
  open: boolean
  onClose: () => void
  request: ServiceRequest
  quotationItems: QuotationItem[]
  selectedItemIds: string[]
  calc: ReturnType<typeof calculateQuotationTotals>
  decisionNotes: string
  onDecisionNotesChange: (notes: string) => void
  onSuccess: (updatedRequest: ServiceRequest) => void
}

type ModalStep = "breakdown" | "payment" | "success"
type PaymentMethod = "upi" | "card" | "netbanking" | "store"

export default function RepairPaymentModal({
  open,
  onClose,
  request,
  quotationItems,
  selectedItemIds,
  calc,
  decisionNotes,
  onDecisionNotesChange,
  onSuccess,
}: RepairPaymentModalProps) {
  const store = useStore()

  const [step, setStep] = useState<ModalStep>("breakdown")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi")
  const [upiId, setUpiId] = useState(
    store.profile.phone ? `${store.profile.phone}@oksbi` : "customer@okaxis",
  )
  const [selectedBank, setSelectedBank] = useState("Federal Bank")

  // Payment execution state
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatusText, setProcessingStatusText] = useState("")
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [completedPaymentId, setCompletedPaymentId] = useState<string>("")
  const [completedRequest, setCompletedRequest] =
    useState<ServiceRequest | null>(null)

  // Items split
  const approvedItemsList = quotationItems.filter((i) =>
    selectedItemIds.includes(i.id),
  )
  const deferredItemsList = quotationItems.filter(
    (i) => !selectedItemIds.includes(i.id),
  )

  // Reset modal state on close
  const handleModalClose = () => {
    if (isProcessing) return // don't close mid-transaction
    setPaymentError(null)
    if (step === "success" && completedRequest) {
      onSuccess(completedRequest)
    }
    setStep("breakdown")
    onClose()
  }

  // Simulate payment authorization
  const handleSimulatePayment = async () => {
    setIsProcessing(true)
    setPaymentError(null)

    const mockPayId = `pay_mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    setCompletedPaymentId(mockPayId)

    try {
      // Step A: Gateway simulation animation
      setProcessingStatusText("Connecting to Razorpay Gateway...")
      await new Promise((r) => setTimeout(r, 600))

      setProcessingStatusText(
        `Authorizing ${money(calc.totalPayable)} with issuing bank (${paymentMethod.toUpperCase()})...`,
      )
      await new Promise((r) => setTimeout(r, 800))

      setProcessingStatusText("Payment authorized! Syncing service ticket...")

      // Step B: Authoritative decision submission
      const paymentSummaryNote = `[Razorpay Mock PayID: ${mockPayId} | Method: ${paymentMethod} | Amount: ${money(calc.totalPayable)}]`
      const combinedNotes = decisionNotes.trim()
        ? `${decisionNotes.trim()} ${paymentSummaryNote}`
        : paymentSummaryNote

      const result = await submitCustomerQuoteDecision(
        request.id,
        "approved",
        selectedItemIds,
        request.quoteVersion || 1,
        combinedNotes,
        request.quote,
        request,
      )

      if (!result.ok) {
        throw new Error(
          result.error ||
            "Unable to record authorization. Please try again or contact IT HUB support.",
        )
      }

      // Step C: Update local store state
      const nextStatus = result.nextStatus ?? 5 // In Progress
      const updated: ServiceRequest = {
        ...request,
        quoteState: "approved",
        status: nextStatus,
        quote: result.totalAmount ?? calc.totalPayable,
        approvedItems: result.approvedItems || selectedItemIds,
        declinedItems:
          result.declinedItems || deferredItemsList.map((i) => i.id),
        decisionNotes: combinedNotes,
        decisionAt: new Date().toISOString(),
        payment: `Razorpay Mock (${mockPayId})`,
      }

      setCompletedRequest(updated)

      store.set((prev) => ({
        requests: prev.requests.map((r) =>
          r.id === request.id ? updated : r,
        ),
      }))

      store.notify(
        `Payment of ${money(calc.totalPayable)} authorized via Razorpay! Repair started.`,
      )

      setStep("success")
    } catch (err: any) {
      setPaymentError(
        err?.message ||
          "Payment processing was interrupted. Please retry.",
      )
    } finally {
      setIsProcessing(false)
      setProcessingStatusText("")
    }
  }

  // Simulate payment decline/failure
  const handleSimulateDecline = () => {
    setPaymentError(
      "Simulated Gateway Error: Transaction cancelled by user or declined by issuing bank (Mock Failure Test). You can re-try or switch methods.",
    )
  }

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleModalClose()
      }}
      title={
        step === "breakdown"
          ? "Repair Authorization & Cost Breakdown"
          : step === "payment"
            ? "Complete Payment via Razorpay"
            : "Authorization & Payment Confirmed"
      }
      description={
        step === "breakdown"
          ? "Review the complete itemized cost and terms before proceeding to secure payment."
          : step === "payment"
            ? "Secure checkout powered by Razorpay (Mock Gateway Mode)."
            : "Your repair order has been funded and dispatched to the workshop bench."
      }
      size="max-w-2xl"
    >
      {/* Stepper Progress Bar */}
      <div className="mb-6 flex items-center justify-between border-b border-border pb-3 text-xs">
        <div
          className={`flex items-center gap-2 font-semibold ${
            step === "breakdown"
              ? "text-primary font-bold"
              : "text-muted-foreground"
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              step === "breakdown"
                ? "bg-primary text-white"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {step === "breakdown" ? "1" : <Check size={12} />}
          </span>
          <span>1. Cost Breakdown</span>
        </div>

        <div className="h-0.5 w-10 bg-border md:w-16" />

        <div
          className={`flex items-center gap-2 font-semibold ${
            step === "payment"
              ? "text-primary font-bold"
              : step === "success"
                ? "text-emerald-700"
                : "text-muted-foreground"
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              step === "payment"
                ? "bg-primary text-white"
                : step === "success"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step === "success" ? <Check size={12} /> : "2"}
          </span>
          <span>2. Razorpay Payment</span>
        </div>

        <div className="h-0.5 w-10 bg-border md:w-16" />

        <div
          className={`flex items-center gap-2 font-semibold ${
            step === "success"
              ? "text-emerald-700 font-bold"
              : "text-muted-foreground"
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              step === "success"
                ? "bg-emerald-600 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            3
          </span>
          <span>3. Confirmation</span>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* STEP 1: COMPLETE COST BREAKDOWN */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {step === "breakdown" && (
        <div className="space-y-4 text-xs">
          {/* Ticket & Device Summary Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Service Ticket Reference
              </span>
              <p className="font-extrabold text-foreground text-sm">
                {request.device} {request.model ? `· ${request.model}` : ""}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Ticket ID: <span className="font-mono font-medium">#{request.id.slice(0, 8).toUpperCase()}</span>
                {request.quoteVersion && ` (Estimate v${request.quoteVersion})`}
              </p>
            </div>
            <div className="text-right">
              <Badge tone="blue">
                <Clock size={11} className="mr-1 inline" /> 24–48h Turnaround
              </Badge>
            </div>
          </div>

          {/* Approved Scope List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold uppercase tracking-wide text-muted-foreground text-[11px]">
                Authorized Work Scope ({approvedItemsList.length} Item(s))
              </h4>
              <span className="text-[11px] text-muted-foreground">
                Pricing includes labour & parts
              </span>
            </div>

            <div className="space-y-2">
              {approvedItemsList.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-card/60 p-3 flex items-start justify-between gap-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      <span>{item.title}</span>
                      {item.isRequired && (
                        <span className="rounded bg-red-50 text-red-700 font-semibold px-1 py-0.2 text-[9px]">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {item.description}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>Part: {money(item.partCost)}</span>
                      <span>•</span>
                      <span>Labour: {money(item.labourCost)}</span>
                      {item.quantity > 1 && (
                        <span>• Qty: {item.quantity}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right font-extrabold text-foreground text-sm shrink-0">
                    {money(item.lineTotal)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deferred / Excluded items if any */}
          {deferredItemsList.length > 0 && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 text-[11px]">
              <span className="font-bold text-amber-900 block mb-1">
                Excluded / Deferred Repairs ({deferredItemsList.length}):
              </span>
              <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                {deferredItemsList.map((item) => (
                  <li key={item.id}>
                    {item.title} ({money(item.lineTotal)}) —{" "}
                    <span className="italic">Not billed on this order</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Complete Commercial Breakdown Table */}
          <div className="rounded-2xl border border-border bg-secondary/25 p-4 space-y-2.5">
            <h5 className="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
              Commercial Bill Breakdown
            </h5>

            <div className="flex justify-between text-muted-foreground">
              <span>Genuine Replacement Parts Subtotal:</span>
              <span className="font-semibold text-foreground">
                {money(calc.partsTotal)}
              </span>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>Technician Workbench Labour & Testing:</span>
              <span className="font-semibold text-foreground">
                {money(calc.labourTotal)}
              </span>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>Diagnostic Assessment & Inspection Fee:</span>
              <span className="font-bold text-emerald-700 flex items-center gap-1">
                <span className="line-through text-muted-foreground font-normal">
                  ₹300
                </span>{" "}
                ₹0 (Waived upon repair authorization)
              </span>
            </div>

            {calc.courierFee > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Insured Return Courier Delivery (Kerala):</span>
                <span className="font-semibold text-foreground">
                  {money(calc.courierFee)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-muted-foreground">
              <span>Applicable GST / Taxes:</span>
              <span className="font-semibold text-foreground">
                Included (18% GST on services)
              </span>
            </div>

            <div className="border-t border-border pt-3 flex items-baseline justify-between">
              <div>
                <span className="text-sm font-extrabold text-foreground block">
                  Grand Total Payable:
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Final authoritative amount charged via Razorpay
                </span>
              </div>
              <span className="text-xl font-extrabold text-primary">
                {money(calc.totalPayable)}
              </span>
            </div>
          </div>

          {/* Technician Instructions Input */}
          <div>
            <label className="block font-semibold text-foreground text-[11px] mb-1">
              Instructions or notes for the technician (optional):
            </label>
            <input
              type="text"
              placeholder="e.g. Please backup C-drive before OS rebuild / Call before screen fitment"
              value={decisionNotes}
              onChange={(e) => onDecisionNotesChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3.5 py-2 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Guarantees Callout */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-3 text-[11px] text-emerald-900">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldCheck size={14} className="text-emerald-700 shrink-0" />
              <span>90-Day IT HUB Hardware Warranty</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <Sparkles size={14} className="text-emerald-700 shrink-0" />
              <span>100% Genuine OEM / Grade-A Spares</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border">
            <Button variant="secondary" onClick={handleModalClose}>
              Back / Modify Scope
            </Button>

            <Button
              onClick={() => {
                setPaymentError(null)
                setStep("payment")
              }}
              className="bg-primary hover:bg-primary/90 text-white font-bold"
            >
              <span>Proceed to Payment ({money(calc.totalPayable)})</span>
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* STEP 2: RAZORPAY PAYMENT SECTION (MOCK GATEWAY) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {step === "payment" && (
        <div className="space-y-4 text-xs">
          {/* Razorpay Brand Header Card */}
          <div className="overflow-hidden rounded-2xl bg-[#0c2340] text-white shadow-md">
            <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0082eb] font-extrabold text-white text-base shadow-sm">
                  ₹
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm tracking-wide">
                      Razorpay
                    </span>
                    <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-200 uppercase">
                      Trusted Business
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Merchant: <strong className="text-white">IT HUB Kerala</strong>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                  Amount to Pay
                </span>
                <span className="text-xl font-extrabold text-white">
                  {money(calc.totalPayable)}
                </span>
              </div>
            </div>

            {/* Sandbox Simulation Notice */}
            <div className="bg-[#123154] px-4 py-2 flex items-center justify-between text-[10px] text-sky-200">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles size={12} className="text-amber-400 shrink-0" />
                <span>Razorpay Sandbox Simulation Mode (Mock Gateway)</span>
              </span>
              <span className="font-mono text-slate-300">
                #SR-{request.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Payment Method Selector Tabs */}
          <div className="space-y-2">
            <label className="font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
              Select Payment Method
            </label>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setPaymentMethod("upi")}
                className={`rounded-xl border p-3 text-left transition ${
                  paymentMethod === "upi"
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-card/60 hover:bg-secondary/40"
                }`}
              >
                <Smartphone
                  size={18}
                  className={
                    paymentMethod === "upi" ? "text-primary" : "text-muted-foreground"
                  }
                />
                <span className="mt-1.5 block font-bold text-foreground text-[11px]">
                  UPI / QR
                </span>
                <span className="text-[10px] text-muted-foreground">
                  GPay, PhonePe
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("card")}
                className={`rounded-xl border p-3 text-left transition ${
                  paymentMethod === "card"
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-card/60 hover:bg-secondary/40"
                }`}
              >
                <CreditCard
                  size={18}
                  className={
                    paymentMethod === "card" ? "text-primary" : "text-muted-foreground"
                  }
                />
                <span className="mt-1.5 block font-bold text-foreground text-[11px]">
                  Cards
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Credit / Debit
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("netbanking")}
                className={`rounded-xl border p-3 text-left transition ${
                  paymentMethod === "netbanking"
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-card/60 hover:bg-secondary/40"
                }`}
              >
                <Building2
                  size={18}
                  className={
                    paymentMethod === "netbanking"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }
                />
                <span className="mt-1.5 block font-bold text-foreground text-[11px]">
                  Net Banking
                </span>
                <span className="text-[10px] text-muted-foreground">
                  All Indian Banks
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("store")}
                className={`rounded-xl border p-3 text-left transition ${
                  paymentMethod === "store"
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-card/60 hover:bg-secondary/40"
                }`}
              >
                <Receipt
                  size={18}
                  className={
                    paymentMethod === "store"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }
                />
                <span className="mt-1.5 block font-bold text-foreground text-[11px]">
                  Pay at Store
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Upon Collection
                </span>
              </button>
            </div>
          </div>

          {/* Interactive Method Configuration View */}
          <div className="rounded-xl border border-border bg-card/70 p-3.5">
            {paymentMethod === "upi" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-xs">
                    UPI Instant Transfer
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5">
                      Fastest
                    </span>
                    <span className="rounded bg-slate-100 text-slate-700 text-[9px] font-bold px-1.5 py-0.5">
                      Zero Surcharge
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {["Google Pay", "PhonePe", "Paytm", "BHIM"].map((app) => (
                    <button
                      key={app}
                      type="button"
                      onClick={() =>
                        setUpiId(
                          `${app.toLowerCase().replace(/\s+/g, "")}@oksbi`,
                        )
                      }
                      className="rounded-lg border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-primary/50"
                    >
                      {app}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block font-semibold text-foreground text-[10px] mb-1">
                    Virtual Payment Address (VPA / UPI ID):
                  </label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-mono"
                    placeholder="username@okhdfcbank"
                  />
                </div>
              </div>
            )}

            {paymentMethod === "card" && (
              <div className="space-y-3">
                <span className="font-bold text-foreground text-xs block">
                  Simulated Card Payment (Test Sandbox)
                </span>
                <div className="rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 p-4 text-white space-y-3 shadow-inner">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>IT HUB TEST CARD</span>
                    <span className="font-extrabold tracking-wider text-xs text-sky-400">
                      VISA / RuPay
                    </span>
                  </div>
                  <div className="font-mono text-base tracking-widest text-slate-200">
                    •••• •••• •••• 4242
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                    <span>EXP: 12/29</span>
                    <span>CVV: •••</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  *Standard 3D-Secure OTP authorization is simulated automatically in mock mode.
                </p>
              </div>
            )}

            {paymentMethod === "netbanking" && (
              <div className="space-y-3">
                <span className="font-bold text-foreground text-xs block">
                  Select Bank
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    "Federal Bank",
                    "State Bank of India",
                    "HDFC Bank",
                    "ICICI Bank",
                    "Axis Bank",
                    "Kerala Gramin Bank",
                  ].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => setSelectedBank(bank)}
                      className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold transition ${
                        selectedBank === bank
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border bg-white text-foreground hover:bg-secondary/40"
                      }`}
                    >
                      {bank}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paymentMethod === "store" && (
              <div className="space-y-2">
                <span className="font-bold text-foreground text-xs block">
                  Pay at IT HUB Showroom upon Device Collection
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  You can authorize the workbench repair now. The technician will
                  complete the authorized work, and payment ({money(calc.totalPayable)})
                  will be collected at the showroom counter via Cash, Card, or UPI upon testing your device.
                </p>
              </div>
            )}
          </div>

          {/* Error Message */}
          {paymentError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              <AlertTriangle size={15} className="shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          {/* Processing Status Spinner */}
          {isProcessing && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center space-y-2">
              <Loader2 size={24} className="animate-spin text-primary mx-auto" />
              <p className="font-bold text-foreground text-xs">
                {processingStatusText}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Please do not close this window. Your session is encrypted.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border">
            <Button
              variant="secondary"
              disabled={isProcessing}
              onClick={() => {
                setPaymentError(null)
                setStep("breakdown")
              }}
            >
              <ArrowLeft size={14} />
              <span>Back to Breakdown</span>
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={isProcessing}
                onClick={handleSimulateDecline}
                className="text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
              >
                Simulate Decline
              </Button>

              <Button
                disabled={isProcessing}
                onClick={handleSimulatePayment}
                className="bg-[#0c2340] hover:bg-[#123154] text-white font-bold text-xs"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : (
                  <>
                    <Lock size={13} className="text-sky-300" />
                    <span>
                      Pay {money(calc.totalPayable)} (Mock Razorpay)
                    </span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* STEP 3: CONFIRMATION & SUCCESS RECEIPT */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {step === "success" && (
        <div className="space-y-4 text-xs py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
            <CheckCircle2 size={32} />
          </div>

          <div>
            <h4 className="text-lg font-extrabold text-foreground">
              Repair Authorized & Payment Confirmed!
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Your service ticket has transitioned to{" "}
              <strong className="text-foreground">In Progress</strong>. Our workshop
              bench has been assigned to work on your authorized scope.
            </p>
          </div>

          {/* Payment Receipt Box */}
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-secondary/30 p-4 text-left space-y-2">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <span className="font-bold text-foreground">
                Payment Transaction Receipt
              </span>
              <Badge tone="green">CAPTURED</Badge>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>Razorpay Reference:</span>
              <span className="font-mono font-bold text-foreground">
                {completedPaymentId}
              </span>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>Service Request ID:</span>
              <span className="font-mono font-bold text-foreground">
                #{request.id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>Payment Mode:</span>
              <span className="font-semibold text-foreground uppercase">
                {paymentMethod} (Mock Sandbox)
              </span>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>Authorized Repairs:</span>
              <span className="font-semibold text-foreground">
                {approvedItemsList.length} of {quotationItems.length} items
              </span>
            </div>

            <div className="border-t border-border pt-2 flex justify-between items-baseline text-sm font-extrabold">
              <span className="text-foreground">Total Paid / Authorized:</span>
              <span className="text-primary text-base">
                {money(calc.totalPayable)}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
            You will receive live status milestones and diagnostic updates as our
            technician progresses with the hardware repair.
          </p>

          <div className="pt-2">
            <Button
              onClick={handleModalClose}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full max-w-sm mx-auto"
            >
              Done & View Service Tracker
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

