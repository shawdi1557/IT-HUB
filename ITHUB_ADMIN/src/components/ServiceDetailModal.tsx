// ITHUB_ADMIN/src/components/ServiceDetailModal.tsx
// Comprehensive Service Ticket Management, Diagnosis & Itemized Quotation Modal

import { useState, useRef, useEffect } from "react";
import {
  X,
  Wrench,
  MessageCircle,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Layers,
  LoaderCircle,
  Loader2,
  Send,
  BadgeIndianRupee,
  Calendar,
  Truck,
  Home,
  Store,
  PackageCheck,
} from "lucide-react";
import {
  type ServiceRecord,
  type ServiceStatus,
  type DiagnosisFinding,
  type QuotationItem,
  type StaffTechnician,
  updateServiceStatus,
  updateServiceStatusDescription,
  fetchStaffTechnicians,
  staffPublishQuotation,
  saveOnSiteBilling,
  approveRescheduleRequest,
  rejectRescheduleRequest,
  shouldDisplayReschedulePanel,
  getServiceMethodInfo,
  classifyServiceMethod,
  CANONICAL_SERVICE_METHODS,
  formatTicketReference,
} from "../lib/services";

interface ServiceDetailModalProps {
  service: ServiceRecord;
  onClose: () => void;
  onUpdated: () => void;
}

export function ServiceDetailModal({ service, onClose, onUpdated }: ServiceDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "quotation">("overview");
  const [status, setStatus] = useState<ServiceStatus>(service.status);
  const [technician, setTechnician] = useState<string>(service.technician_name || "");
  const [availableStaff, setAvailableStaff] = useState<StaffTechnician[]>([]);
  const [customTrackingDescription, setCustomTrackingDescription] = useState<string>(
    service.status_descriptions?.[service.status] || "",
  );
  const [internalNotes, setInternalNotes] = useState<string>(service.notes || "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingDescriptionOnly, setSavingDescriptionOnly] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canonicalMethod = classifyServiceMethod(service.method);
  const isDoorstep = canonicalMethod === CANONICAL_SERVICE_METHODS.ONSITE;
  const isCourier = canonicalMethod === CANONICAL_SERVICE_METHODS.COURIER;
  const isWalkIn = canonicalMethod === CANONICAL_SERVICE_METHODS.WALK_IN;
  const methodInfo = getServiceMethodInfo(service.method);

  const [billingLabour, setBillingLabour] = useState<number>(
    () => service.billing_details?.labourCharges ?? 350,
  );
  const [billingParts, setBillingParts] = useState<number>(
    () => service.billing_details?.partsCharges ?? 0,
  );
  const [billingCallout, setBillingCallout] = useState<number>(
    () => service.billing_details?.calloutFee ?? service.doorstep_callout_fee ?? 250,
  );
  const [billingAdjustments, setBillingAdjustments] = useState<number>(
    () => service.billing_details?.adjustments ?? 0,
  );
  const [billingMethod, setBillingMethod] = useState<"UPI" | "Cash">(
    () => service.billing_details?.paymentMethod ?? "UPI",
  );
  const [billingPaymentStatus, setBillingPaymentStatus] = useState<"Pending" | "Received">(
    () => service.billing_details?.paymentStatus ?? "Pending",
  );
  const [billingReceiptNote, setBillingReceiptNote] = useState<string>(
    () => service.billing_details?.receiptNote ?? "",
  );
  const [savingBilling, setSavingBilling] = useState(false);
  const [staffRescheduleNote, setStaffRescheduleNote] = useState("");
  const [currentTicket, setCurrentTicket] = useState<ServiceRecord>(service);
  const [rescheduling, setRescheduling] = useState(false);

  useEffect(() => {
    setCurrentTicket(service);
    setStatus(service.status);
  }, [service]);

  const billingTotal = Math.max(
    0,
    billingLabour + billingParts + billingCallout - billingAdjustments,
  );

  const isSubmittingRef = useRef(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    fetchStaffTechnicians().then((staff) => {
      if (isMounted) {
        setAvailableStaff(staff);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Update tracking description draft when status changes
  const handleStatusChange = (newStatus: ServiceStatus) => {
    setStatus(newStatus);
    const existingDesc = service.status_descriptions?.[newStatus] || "";
    setCustomTrackingDescription(existingDesc);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Itemized quotation draft state
  const [findings, setFindings] = useState<DiagnosisFinding[]>(() => {
    if (service.findings && service.findings.length > 0) {
      return [...service.findings];
    }
    return [
      {
        id: `find-${Date.now().toString(36)}`,
        title: "Initial Diagnostic Observation",
        description: service.problem || "Customer reported fault requiring workbench testing.",
        source: "technician",
        classification: "confirmed",
        customerExplanation: "Inspected hardware circuitry and component behavior.",
        recommendedRepair: "Component repair / replacement as itemized.",
        safety: "required",
        isEligibleForRepair: true,
        createdAt: new Date().toISOString(),
      },
    ];
  });

  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>(() => {
    if (service.quotation_items && service.quotation_items.length > 0) {
      return [...service.quotation_items];
    }
    return [];
  });

  const [isAddingFinding, setIsAddingFinding] = useState(false);
  const [newFindingTitle, setNewFindingTitle] = useState("");
  const [newFindingDesc, setNewFindingDesc] = useState("");
  const [newFindingSafety, setNewFindingSafety] = useState<
    "required" | "recommended" | "optional" | "cosmetic"
  >("required");
  const [newFindingClass, setNewFindingClass] = useState<
    "confirmed" | "suspected" | "needs_further_testing"
  >("confirmed");
  const [newFindingRepair, setNewFindingRepair] = useState("");

  const handleAddNewFinding = () => {
    if (!newFindingTitle.trim()) return;
    const created: DiagnosisFinding = {
      id: `find-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: newFindingTitle.trim(),
      description: newFindingDesc.trim() || newFindingTitle.trim(),
      source: "technician",
      classification: newFindingClass,
      customerExplanation: newFindingDesc.trim() || newFindingTitle.trim(),
      recommendedRepair: newFindingRepair.trim() || "Workbench service & component repair",
      safety: newFindingSafety,
      isEligibleForRepair: true,
      createdAt: new Date().toISOString(),
    };
    setFindings((prev) => [...prev, created]);
    setNewFindingTitle("");
    setNewFindingDesc("");
    setNewFindingRepair("");
    setIsAddingFinding(false);
  };

  const handleCancelAddFinding = () => {
    setNewFindingTitle("");
    setNewFindingDesc("");
    setNewFindingRepair("");
    setIsAddingFinding(false);
  };

  const handleRemoveFinding = (id: string) => {
    setFindings((prev) => prev.filter((f) => f.id !== id));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleSaveDescriptionOnly = async () => {
    if (savingDescriptionOnly) return;
    setSavingDescriptionOnly(true);
    setError("");
    const res = await updateServiceStatusDescription(service.id, status, customTrackingDescription);
    setSavingDescriptionOnly(false);
    if (!res.ok) {
      setError(res.error || "Failed to update tracking description.");
    } else {
      setSuccess(`Tracking description for "${status}" updated!`);
      setTimeout(() => setSuccess(""), 3000);
      onUpdated();
    }
  };

  const handleSaveStatus = async () => {
    if (isSubmittingRef.current || savingStatus) return;

    // Strict non-reversion check: Completed tickets cannot be reverted to earlier statuses
    if (service.status === "Completed" && status !== "Completed") {
      setError(
        "Completed service requests are finalized and cannot be reverted to earlier statuses.",
      );
      return;
    }

    // Strict Doorstep completion check
    if (isDoorstep && status === "Completed") {
      const isPaid =
        billingPaymentStatus === "Received" ||
        service.billing_details?.paymentStatus === "Received";
      if (!isPaid) {
        setError(
          "Strict Requirement: On-site doorstep visits cannot be marked Completed until the service bill is finalized and payment is marked Received.",
        );
        return;
      }
    }

    isSubmittingRef.current = true;
    setSavingStatus(true);
    setError("");
    setSuccess("");

    const res = await updateServiceStatus(service.id, status, technician, internalNotes, findings);

    if (!res.ok) {
      isSubmittingRef.current = false;
      setSavingStatus(false);
      setError(res.error || "Failed to update service record.");
      return;
    }

    // Auto-save on-site billing details for doorstep tickets
    if (isDoorstep) {
      await saveOnSiteBilling(service.id, {
        labourCharges: billingLabour,
        partsCharges: billingParts,
        calloutFee: billingCallout,
        adjustments: billingAdjustments,
        total: billingTotal,
        paymentMethod: billingMethod,
        paymentStatus: billingPaymentStatus,
        receiptNote: billingReceiptNote.trim() || undefined,
        finalizedAt: new Date().toISOString(),
      });
    }

    // Save or clear customer-facing status description if changed
    const currentRecorded = service.status_descriptions?.[status] || "";
    if (customTrackingDescription.trim() !== currentRecorded.trim()) {
      await updateServiceStatusDescription(service.id, status, customTrackingDescription);
    }

    setSuccess("Service record updated successfully!");
    timerRef.current = setTimeout(() => {
      isSubmittingRef.current = false;
      setSavingStatus(false);
      onUpdated();
      onClose();
    }, 1000);
  };

  const handleAddQuotationItem = (prefill?: Partial<QuotationItem>) => {
    const pCost = prefill?.partCost ?? 0;
    const lCost = prefill?.labourCost ?? 350;
    const qty = prefill?.quantity ?? 1;
    const newItem: QuotationItem = {
      id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: prefill?.title || "Diagnostic Repair / Spare Part",
      description: prefill?.description || "Repair or replacement of damaged component.",
      partCost: pCost,
      labourCost: lCost,
      quantity: qty,
      discount: prefill?.discount ?? 0,
      lineTotal: Math.max(0, (pCost + lCost) * qty - (prefill?.discount ?? 0)),
      isRequired: prefill?.isRequired ?? true,
      canDefer: prefill?.canDefer ?? prefill?.isRequired === false,
      requirementLevel:
        prefill?.requirementLevel || (prefill?.isRequired === false ? "optional" : "required"),
      approvalState: "pending",
      findingId: prefill?.findingId,
    };
    setQuotationItems([...quotationItems, newItem]);
  };

  const handleRemoveQuotationItem = (index: number) => {
    setQuotationItems(quotationItems.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const updated = [...quotationItems];
    updated[index] = { ...updated[index], [field]: value };
    const pCost = Number(updated[index].partCost) || 0;
    const lCost = Number(updated[index].labourCost) || 0;
    const qty = Number(updated[index].quantity) || 1;
    const disc = Number(updated[index].discount) || 0;
    updated[index].lineTotal = Math.max(0, (pCost + lCost) * qty - disc);
    setQuotationItems(updated);
  };

  const calculateTotal = () => {
    return quotationItems.reduce((acc, item) => acc + (item.lineTotal || 0), 0);
  };

  const handlePublishQuote = async () => {
    if (quotationItems.length === 0) {
      setError("Please add at least one line item before publishing quotation.");
      return;
    }

    if (isSubmittingRef.current || publishing) return;
    isSubmittingRef.current = true;
    setPublishing(true);
    setError("");
    setSuccess("");

    const res = await staffPublishQuotation(
      service.id,
      findings,
      quotationItems,
      internalNotes,
      service,
    );

    if (!res.ok) {
      isSubmittingRef.current = false;
      setPublishing(false);
      setError(res.error || "Failed to publish itemized quotation.");
      return;
    }

    setSuccess(
      `Quotation for ${formatCurrency(res.totalAmount || 0)} published! Status set to Awaiting Approval.`,
    );
    setStatus("Awaiting Approval");
    timerRef.current = setTimeout(() => {
      isSubmittingRef.current = false;
      setPublishing(false);
      onUpdated();
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 overflow-y-auto">
      <div className="relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-5xl rounded-none sm:rounded-2xl border-0 sm:border border-slate-200/80 bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header (Sticky at top with subtle glassmorphism) */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Wrench size={18} className="sm:hidden" />
              <Wrench size={20} className="hidden sm:block" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-slate-700 uppercase bg-slate-100 px-2 py-0.5 rounded">
                  {service.ticket_reference || formatTicketReference(service.id)}
                </span>
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate max-w-[180px] sm:max-w-xs">
                  {service.device} {service.model && `— ${service.model}`}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
                    service.status === "Booked"
                      ? "bg-blue-100 text-blue-800"
                      : service.status === "Device Received"
                        ? "bg-teal-100 text-teal-800 border border-teal-300"
                        : service.status === "Under Diagnosis"
                          ? "bg-sky-100 text-sky-800 border border-sky-300"
                          : service.status === "In Progress"
                            ? "bg-amber-100 text-amber-800"
                            : service.status === "Diagnosis Done"
                              ? "bg-indigo-100 text-indigo-800"
                              : service.status === "Awaiting Approval"
                                ? "bg-purple-100 text-purple-800"
                                : service.status === "Approved"
                                  ? "bg-lime-100 text-lime-800 border border-lime-300"
                                  : service.status === "Quality Check"
                                    ? "bg-cyan-100 text-cyan-800 border border-cyan-300"
                                    : service.status === "Ready for Delivery"
                                      ? "bg-violet-100 text-violet-800 border border-violet-300"
                                      : service.status === "Completed"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {service.status === "In Progress" ? "In Progress (Repairing)" : service.status}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>Intake:</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-bold border ${methodInfo.badgeClass}`}
                >
                  {methodInfo.iconName === "Truck" && <Truck size={11} />}
                  {methodInfo.iconName === "Home" && <Home size={11} />}
                  {methodInfo.iconName === "Store" && <Store size={11} />}
                  <span>{methodInfo.label}</span>
                </span>
                <span>&bull;</span>
                <span>
                  {new Date(service.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-4 sm:px-6 shrink-0 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("overview")}
            className={`min-h-[44px] py-2.5 text-xs font-bold border-b-2 mr-4 sm:mr-6 whitespace-nowrap transition ${
              activeTab === "overview"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Ticket Overview &amp; Status
          </button>
          <button
            onClick={() => setActiveTab("quotation")}
            className={`min-h-[44px] py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === "quotation"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers size={14} /> Workbench Quotation Builder
            {service.quote_state && (
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.2 text-[9px] font-bold text-slate-600 uppercase">
                {service.quote_state}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-800 border border-red-200">
              <AlertTriangle size={15} /> <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
              <CheckCircle2 size={15} /> <span>{success}</span>
            </div>
          )}

          {activeTab === "overview" ? (
            <>
              {/* Reported Issue & Customer Observations */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Reported Issue &amp; Customer Observations
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium">Reported Problem:</span>
                    <p className="font-bold text-slate-900 mt-0.5">{service.problem}</p>
                  </div>
                  {service.customer_description && (
                    <div>
                      <span className="text-slate-500 font-medium">
                        Customer Observations / Notes:
                      </span>
                      <p className="font-medium text-slate-800 mt-0.5 italic">
                        &ldquo;{service.customer_description}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Details */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Customer &amp; Booking Contact
                </h3>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Customer Name:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {service.customer_name || "Valued Customer"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Contact Phone:</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-bold text-slate-900">
                        {service.customer_phone || "Not recorded"}
                      </span>
                      {service.customer_phone && (
                        <a
                          href={`https://wa.me/${service.customer_phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md hover:bg-emerald-100 transition"
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Email:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {service.customer_email || "Not recorded"}
                    </p>
                  </div>
                </div>

                {/* Additional logistics & address information */}
                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Service Method:</span>
                    <p className="font-bold text-slate-900 mt-0.5">{service.method}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Appointment / Slot:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {currentTicket.preferred_date
                        ? `${currentTicket.preferred_date} · ${currentTicket.preferred_slot || "Anytime"}`
                        : "Immediate Walk-In"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Kerala PIN Code:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {service.pincode || "Not provided"}
                    </p>
                  </div>
                  {service.address_details && (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500">Detailed Address:</span>
                      <p className="font-medium text-slate-800 mt-0.5">
                        {typeof service.address_details === "object"
                          ? service.address_details.formatted ||
                            `${service.address_details.houseBuilding || ""}, ${service.address_details.streetLocality || ""}, ${service.address_details.placeTown || ""}`
                          : String(service.address_details)}
                      </p>
                    </div>
                  )}
                  {service.inbound_courier_tracking_no && (
                    <div className="sm:col-span-1">
                      <span className="text-slate-500">Inbound Courier Consignment:</span>
                      <p className="font-mono font-bold text-blue-700 mt-0.5">
                        {service.inbound_courier_tracking_no}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Method-Specific Workflow Presentation */}
              {isCourier && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-purple-200/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Truck size={16} className="text-purple-700" />
                      <h4 className="font-bold text-xs text-purple-900 uppercase tracking-wider">
                        Courier Logistics &amp; Inbound Parcel Intake
                      </h4>
                    </div>
                    <span className="rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-[10px] font-bold uppercase">
                      Courier Workflow
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-purple-800 font-semibold">
                        Consignment Tracking AWB:
                      </span>
                      <p className="font-mono font-bold text-slate-900 mt-0.5">
                        {service.inbound_courier_tracking_no ||
                          "Awaiting dispatch / No tracking entered"}
                      </p>
                    </div>
                    <div>
                      <span className="text-purple-800 font-semibold">Parcel Intake Status:</span>
                      <p className="font-bold text-slate-900 mt-0.5">
                        {status === "Booked"
                          ? "Pending Delivery to IT HUB"
                          : "Device Received at Workshop"}
                      </p>
                    </div>
                  </div>
                  {status === "Booked" && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={savingStatus}
                        onClick={async () => {
                          setSavingStatus(true);
                          const res = await updateServiceStatus(service.id, "Device Received");
                          setSavingStatus(false);
                          if (res.ok) {
                            setStatus("Device Received");
                            setSuccess(
                              "Device received confirmed! Ticket moved to workshop queue.",
                            );
                            onUpdated();
                          } else {
                            setError(res.error || "Failed to update status.");
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-purple-700 shadow-xs transition"
                      >
                        <PackageCheck size={14} /> Confirm Parcel Received at IT HUB
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isWalkIn && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Store size={16} className="text-emerald-700" />
                      <h4 className="font-bold text-xs text-emerald-900 uppercase tracking-wider">
                        Store Walk-In &amp; Counter Intake Workflow
                      </h4>
                    </div>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold uppercase">
                      Walk-In Counter
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-emerald-800 font-semibold">Store Check-in:</span>
                      <p className="font-bold text-slate-900 mt-0.5">
                        {status === "Booked"
                          ? "Customer pre-booking / Awaiting store arrival"
                          : status === "Customer Arrived"
                            ? "Customer currently at IT HUB counter"
                            : "Device checked in & at workbench"}
                      </p>
                    </div>
                    <div>
                      <span className="text-emerald-800 font-semibold">Service Desk Action:</span>
                      <p className="font-medium text-slate-700 mt-0.5">
                        Physical device intake, visual inspection &amp; customer receipt issuance.
                      </p>
                    </div>
                  </div>
                  {status === "Booked" && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={savingStatus}
                        onClick={async () => {
                          setSavingStatus(true);
                          const res = await updateServiceStatus(service.id, "Customer Arrived");
                          setSavingStatus(false);
                          if (res.ok) {
                            setStatus("Customer Arrived");
                            setSuccess("Customer marked as arrived at service counter.");
                            onUpdated();
                          } else {
                            setError(res.error || "Failed to update status.");
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition"
                      >
                        <CheckCircle2 size={14} /> Mark Customer Arrived at Counter
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Problem Description */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Customer Problem Description
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-800 rounded-lg bg-slate-50 p-3 border border-slate-100">
                  {service.problem}
                </p>
              </div>

              {/* Diagnostic Findings Section */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Wrench size={16} className="text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Diagnostic Findings ({findings.length})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingFinding(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 transition shadow-2xs"
                  >
                    <Plus size={13} /> Add Finding
                  </button>
                </div>

                {/* Findings List */}
                {findings.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    No diagnostic findings documented yet. Click &quot;Add Finding&quot; to open the
                    diagnostic findings modal and record observations.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {findings.map((f, idx) => (
                      <div
                        key={f.id || idx}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs">{f.title}</span>
                            <span
                              className={`rounded-full px-2 py-0.2 text-[9px] font-extrabold uppercase ${
                                f.classification === "confirmed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : f.classification === "suspected"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-indigo-100 text-indigo-800"
                              }`}
                            >
                              {f.classification.replace(/_/g, " ")}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.2 text-[9px] font-extrabold uppercase ${
                                f.safety === "required"
                                  ? "bg-red-100 text-red-800"
                                  : f.safety === "recommended"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {f.safety}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              via{" "}
                              {f.source === "customer" ? "Customer Symptom" : "Technician Bench"}
                            </span>
                          </div>
                          <p className="text-slate-700 leading-relaxed">{f.description}</p>
                          {f.recommendedRepair && (
                            <p className="text-[11px] text-blue-700 font-medium">
                              <strong>Recommended Repair:</strong> {f.recommendedRepair}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const isReq = f.safety === "required";
                              handleAddQuotationItem({
                                title: f.recommendedRepair || f.title,
                                description: f.description,
                                isRequired: isReq,
                                canDefer: !isReq,
                                requirementLevel:
                                  f.safety === "required"
                                    ? "required"
                                    : f.safety === "recommended"
                                      ? "recommended"
                                      : "optional",
                                findingId: f.id,
                              });
                              setActiveTab("quotation");
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100 transition"
                            title="Add this finding as a quotation line"
                          >
                            <Plus size={11} /> Quote Line (
                            {f.safety === "required"
                              ? "Required"
                              : f.safety === "recommended"
                                ? "Recommended"
                                : "Optional"}
                            )
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFinding(f.id)}
                            className="text-slate-400 hover:text-red-600 p-1 transition"
                            title="Remove finding"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reschedule Approval Card — Strictly restricted to On-site Technician Visits */}
              {shouldDisplayReschedulePanel(currentTicket) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-amber-700" />
                      <h4 className="font-bold text-xs text-amber-900 uppercase tracking-wider">
                        Customer Reschedule Request
                      </h4>
                    </div>
                    <span className="rounded-full bg-amber-200 text-amber-900 px-2 py-0.5 text-[10px] font-extrabold uppercase">
                      Action Required
                    </span>
                  </div>

                  <div className="rounded-lg bg-white/80 p-3 border border-amber-200/60 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Current Confirmed Appointment:</span>
                      <strong className="text-slate-900 font-mono">
                        {currentTicket.preferred_date
                          ? `${currentTicket.preferred_date} · ${currentTicket.preferred_slot || "10:00 – 12:00"}`
                          : "Unscheduled"}
                      </strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-amber-800 font-semibold">Requested Date:</span>
                      <p className="font-bold text-slate-900 mt-0.5 font-mono">
                        {currentTicket.reschedule_details?.requestedDate || "Next available date"}
                      </p>
                    </div>
                    <div>
                      <span className="text-amber-800 font-semibold">Requested Slot:</span>
                      <p className="font-bold text-slate-900 mt-0.5 font-mono">
                        {currentTicket.reschedule_details?.requestedSlot ||
                          "Configured business hours"}
                      </p>
                    </div>
                    {currentTicket.reschedule_details?.reason && (
                      <div className="sm:col-span-2">
                        <span className="text-amber-800 font-semibold">Customer Note:</span>
                        <p className="text-slate-800 italic mt-0.5 bg-white/70 p-2 rounded-lg border border-amber-200/50">
                          {currentTicket.reschedule_details.reason}
                        </p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Staff Note / Response note (Optional):
                      </label>
                      <input
                        type="text"
                        value={staffRescheduleNote}
                        disabled={rescheduling}
                        onChange={(e) => setStaffRescheduleNote(e.target.value)}
                        placeholder="e.g. Approved slot booked with technician."
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-amber-200/60">
                    <button
                      type="button"
                      disabled={rescheduling}
                      onClick={async () => {
                        if (rescheduling) return;
                        setRescheduling(true);
                        setError("");
                        try {
                          const requestId = currentTicket.reschedule_details?.requestId;
                          const res = await rejectRescheduleRequest(
                            currentTicket.id,
                            requestId,
                            staffRescheduleNote,
                          );
                          if (res.ok) {
                            setSuccess(
                              "Reschedule request rejected. Original appointment remains unchanged.",
                            );
                            const revertedStatus =
                              currentTicket.status === "Reschedule Requested"
                                ? "Booked"
                                : currentTicket.status;
                            setStatus(revertedStatus as ServiceStatus);
                            setCurrentTicket((prev) => ({
                              ...prev,
                              status: revertedStatus as ServiceStatus,
                              reschedule_details: {
                                ...(prev.reschedule_details || {}),
                                status: "rejected",
                                staffResponse: staffRescheduleNote,
                                decidedAt: new Date().toISOString(),
                              },
                            }));
                            onUpdated();
                          } else {
                            setError(res.error || "Failed to reject reschedule.");
                          }
                        } catch (err: any) {
                          setError(err?.message || "Failed to reject reschedule.");
                        } finally {
                          setRescheduling(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {rescheduling ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <X size={13} />
                      )}
                      Reject Request
                    </button>
                    <button
                      type="button"
                      disabled={rescheduling}
                      onClick={async () => {
                        if (rescheduling) return;
                        setRescheduling(true);
                        setError("");
                        try {
                          const targetDate =
                            currentTicket.reschedule_details?.requestedDate ||
                            currentTicket.preferred_date ||
                            "";
                          const targetSlot =
                            currentTicket.reschedule_details?.requestedSlot ||
                            currentTicket.preferred_slot ||
                            "";
                          const requestId = currentTicket.reschedule_details?.requestId;
                          const res = await approveRescheduleRequest(
                            currentTicket.id,
                            targetDate,
                            targetSlot,
                            requestId,
                            staffRescheduleNote,
                          );
                          if (res.ok) {
                            setSuccess("Reschedule approved! Customer appointment slot updated.");
                            setStatus("Rescheduled");
                            setCurrentTicket((prev) => ({
                              ...prev,
                              status: "Rescheduled",
                              preferred_date: targetDate,
                              preferred_slot: targetSlot,
                              reschedule_details: {
                                ...(prev.reschedule_details || {}),
                                status: "approved",
                                approvedDate: targetDate,
                                approvedSlot: targetSlot,
                                staffResponse: staffRescheduleNote,
                                decidedAt: new Date().toISOString(),
                              },
                            }));
                            onUpdated();
                          } else {
                            setError(res.error || "Failed to approve reschedule.");
                          }
                        } catch (err: any) {
                          setError(err?.message || "Failed to approve reschedule.");
                        } finally {
                          setRescheduling(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {rescheduling ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={13} />
                      )}
                      Approve Reschedule &amp; Update Slot
                    </button>
                  </div>
                </div>
              )}

              {/* Decided Banner: Approved */}
              {currentTicket.reschedule_details?.status === "approved" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold">Reschedule Request Approved:</span>
                      <span className="ml-1 text-emerald-950 font-mono font-semibold">
                        {currentTicket.preferred_date} · {currentTicket.preferred_slot}
                      </span>
                      {currentTicket.reschedule_details?.staffResponse && (
                        <p className="text-[11px] text-emerald-700 italic mt-0.5">
                          Staff Note: {currentTicket.reschedule_details.staffResponse}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-200 text-emerald-900 px-2.5 py-0.5 text-[10px] font-extrabold uppercase shrink-0">
                    Confirmed
                  </span>
                </div>
              )}

              {/* Decided Banner: Rejected */}
              {currentTicket.reschedule_details?.status === "rejected" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <AlertCircle size={16} className="text-slate-500 shrink-0" />
                    <div>
                      <span className="font-bold">Reschedule Request Declined:</span>
                      <span className="ml-1 text-slate-800">
                        Original schedule preserved (
                        {currentTicket.preferred_date || "Confirmed date"} ·{" "}
                        {currentTicket.preferred_slot || "Slot"})
                      </span>
                      {currentTicket.reschedule_details?.staffResponse && (
                        <p className="text-[11px] text-slate-600 italic mt-0.5">
                          Reason: {currentTicket.reschedule_details.staffResponse}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-200 text-slate-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase shrink-0">
                    Preserved
                  </span>
                </div>
              )}

              {/* Doorstep On-Site Billing Card */}
              {isDoorstep && (
                <div className="rounded-xl border border-blue-200 bg-white p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <BadgeIndianRupee size={16} className="text-blue-600" />
                      <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                        Technician On-Site Billing &amp; Payment Settlement
                      </h4>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        billingPaymentStatus === "Received"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      Payment: {billingPaymentStatus}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Labour Charges (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={billingLabour}
                        onChange={(e) => setBillingLabour(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full rounded-lg border border-slate-200 p-2 font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Parts &amp; Spares (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={billingParts}
                        onChange={(e) => setBillingParts(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full rounded-lg border border-slate-200 p-2 font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Callout Fee (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={billingCallout}
                        onChange={(e) =>
                          setBillingCallout(Math.max(0, Number(e.target.value) || 0))
                        }
                        className="w-full rounded-lg border border-slate-200 p-2 font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Discount / Adjust (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={billingAdjustments}
                        onChange={(e) =>
                          setBillingAdjustments(Math.max(0, Number(e.target.value) || 0))
                        }
                        className="w-full rounded-lg border border-slate-200 p-2 font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Payment Method
                      </label>
                      <select
                        value={billingMethod}
                        onChange={(e) => setBillingMethod(e.target.value as "UPI" | "Cash")}
                        className="w-full rounded-lg border border-slate-200 p-2 font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                      >
                        <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                        <option value="Cash">Cash on Delivery</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Payment Status *
                      </label>
                      <select
                        value={billingPaymentStatus}
                        onChange={(e) =>
                          setBillingPaymentStatus(e.target.value as "Pending" | "Received")
                        }
                        className={`w-full rounded-lg border p-2 font-extrabold focus:outline-none ${
                          billingPaymentStatus === "Received"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-amber-300 bg-amber-50 text-amber-900"
                        }`}
                      >
                        <option value="Pending">Pending (Not Collected Yet)</option>
                        <option value="Received">Received (Confirmed by Technician)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-slate-900 p-3 text-white">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Final Bill Total
                        </span>
                        <strong className="text-lg font-extrabold text-white">
                          ₹{billingTotal}
                        </strong>
                      </div>
                      {service.customer_phone && (
                        <a
                          href={`https://wa.me/${service.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                            `*IT HUB ON-SITE SERVICE BILL*\n` +
                              `Ticket: ${service.ticket_reference || formatTicketReference(service.id)}\n` +
                              `Customer: ${service.customer_name || "Valued Customer"}\n` +
                              `Device: ${service.device} ${service.model || ""}\n\n` +
                              `• Callout Fee: ₹${billingCallout}\n` +
                              `• Labour Charges: ₹${billingLabour}\n` +
                              `• Parts & Materials: ₹${billingParts}\n` +
                              (billingAdjustments > 0
                                ? `• Discount: -₹${billingAdjustments}\n`
                                : "") +
                              `\n*Total Payable: ₹${billingTotal}*\n` +
                              `Payment Mode: ${billingMethod}\n` +
                              `Status: ${billingPaymentStatus === "Received" ? "✅ Received" : "⏳ Pending"}\n\n` +
                              `Thank you for trusting IT HUB Kothamangalam!`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
                        >
                          <MessageCircle size={13} /> Share Bill
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Receipt Note / Remarks
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Paid via PhonePe / cash handed to tech"
                      value={billingReceiptNote}
                      onChange={(e) => setBillingReceiptNote(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={savingBilling}
                      onClick={async () => {
                        setSavingBilling(true);
                        const res = await saveOnSiteBilling(service.id, {
                          labourCharges: billingLabour,
                          partsCharges: billingParts,
                          calloutFee: billingCallout,
                          adjustments: billingAdjustments,
                          total: billingTotal,
                          paymentMethod: billingMethod,
                          paymentStatus: billingPaymentStatus,
                          receiptNote: billingReceiptNote.trim() || undefined,
                          finalizedAt: new Date().toISOString(),
                        });
                        setSavingBilling(false);
                        if (res.ok) {
                          setSuccess("On-site billing saved successfully!");
                          onUpdated();
                        } else {
                          setError(res.error || "Failed to save billing.");
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-xs transition disabled:opacity-50"
                    >
                      <Save size={13} /> {savingBilling ? "Saving Bill…" : "Save On-Site Bill"}
                    </button>
                  </div>
                </div>
              )}

              {/* Status & Technician Assignment Controls */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Staff Assignment &amp; Progression
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Service Ticket Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => handleStatusChange(e.target.value as ServiceStatus)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                    >
                      {/* Three distinct canonical status pipelines */}
                      {(() => {
                        let opts: { val: string; label: string }[] = [];
                        if (isDoorstep) {
                          opts = [
                            { val: "Booked", label: "Booked (Doorstep Visit Scheduled)" },
                            { val: "Technician Assigned", label: "Technician Assigned" },
                            {
                              val: "Technician has Left IT HUB",
                              label: "Technician has Left IT HUB (En Route)",
                            },
                            {
                              val: "Technician Arrived at Your Location",
                              label: "Technician Arrived at Location",
                            },
                            {
                              val: "Under Diagnosis",
                              label: "Under Diagnosis (On-Site Bench Testing)",
                            },
                            {
                              val: "Service in Progress",
                              label: "Service in Progress (Servicing Hardware)",
                            },
                            {
                              val: "Quality Check",
                              label: "Quality Check (On-Site Quality Assurance)",
                            },
                            { val: "Completed", label: "Completed (Visit Finalized & Paid)" },
                            { val: "Reschedule Requested", label: "Reschedule Requested" },
                            { val: "Rescheduled", label: "Rescheduled" },
                            { val: "Cancelled", label: "Cancelled (Customer Cancelled)" },
                          ];
                        } else if (isCourier) {
                          opts = [
                            { val: "Booked", label: "Booked (Inbound Courier Shipment Scheduled)" },
                            {
                              val: "Device Received",
                              label: "Device Received (Intake Logged at Workshop / Desk)",
                            },
                            {
                              val: "Under Diagnosis",
                              label: "Under Diagnosis (Bench Testing / In Triage)",
                            },
                            {
                              val: "Diagnosis Done",
                              label: "Diagnosis Done (Bench Test Complete)",
                            },
                            {
                              val: "Awaiting Approval",
                              label: "Awaiting Approval (Quotation Published)",
                            },
                            { val: "Approved", label: "Approved (Customer Approved Quotation)" },
                            {
                              val: "In Progress",
                              label: "In Progress (Repairing / Parts Fitting)",
                            },
                            {
                              val: "Quality Check",
                              label: "Quality Check (Post-Repair QA Diagnostics)",
                            },
                            {
                              val: "Ready for Delivery",
                              label: "Ready for Delivery (Packaged for Courier Handover)",
                            },
                            {
                              val: "Ready for Pickup",
                              label: "Ready for Pickup (Workshop Desk / Packaging)",
                            },
                            { val: "Completed", label: "Completed (Repair Complete & Finalized)" },
                            { val: "Delivered", label: "Delivered (Insured Return Handover)" },
                            {
                              val: "Returned",
                              label: "Returned (Unrepaired / Returned to Customer)",
                            },
                            { val: "Cancelled", label: "Cancelled (Customer Cancelled)" },
                          ];
                        } else {
                          opts = [
                            {
                              val: "Booked",
                              label: "Booked (Direct Store Walk-In Appointment Scheduled)",
                            },
                            {
                              val: "Customer Arrived",
                              label: "Customer Arrived (Counter Intake Logged)",
                            },
                            { val: "Device Received", label: "Device Received (Desk Intake)" },
                            {
                              val: "Under Diagnosis",
                              label: "Under Diagnosis (Workbench Testing)",
                            },
                            {
                              val: "Diagnosis Done",
                              label: "Diagnosis Done (Bench Testing Finished)",
                            },
                            {
                              val: "Awaiting Approval",
                              label: "Awaiting Approval (Quotation Presented)",
                            },
                            { val: "Approved", label: "Approved (Customer Authorized Work)" },
                            { val: "In Progress", label: "In Progress (Repair in Progress)" },
                            {
                              val: "Quality Check",
                              label: "Quality Check (Counter QA Validation)",
                            },
                            {
                              val: "Ready for Pickup",
                              label: "Ready for Pickup (Store Counter Handover)",
                            },
                            { val: "Completed", label: "Completed (Handover Complete & Closed)" },
                            { val: "Reschedule Requested", label: "Reschedule Requested" },
                            { val: "Rescheduled", label: "Rescheduled" },
                            { val: "Cancelled", label: "Cancelled (Customer Cancelled)" },
                          ];
                        }
                        if (status && !opts.some((o) => o.val === status)) {
                          opts.unshift({ val: status, label: status });
                        }
                        return opts.map((opt) => (
                          <option key={opt.val} value={opt.val}>
                            {opt.label}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assigned Technician / Specialist
                    </label>
                    <input
                      type="text"
                      list="staff-technicians-list"
                      value={technician}
                      onChange={(e) => setTechnician(e.target.value)}
                      placeholder="Select or enter technician name..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                    />
                    <datalist id="staff-technicians-list">
                      {availableStaff.map((s) => (
                        <option key={s.id} value={s.full_name}>
                          {s.full_name} (
                          {s.role === "service_staff" ? "Service Technician" : "Portal Admin"})
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Customer-facing Tracking Description */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Customer-Facing Status Note (Publicly visible on tracker for &quot;{status}
                      &quot;)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-blue-600 font-semibold">
                        Audited in Staff Logs
                      </span>
                      <button
                        type="button"
                        disabled={savingDescriptionOnly}
                        onClick={handleSaveDescriptionOnly}
                        className="inline-flex items-center gap-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-bold px-2 py-0.5 transition disabled:opacity-50 cursor-pointer"
                        title="Update the customer-facing message for this status immediately without changing ticket state"
                      >
                        {savingDescriptionOnly ? "Saving..." : "Update Note Only"}
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={customTrackingDescription}
                    onChange={(e) => setCustomTrackingDescription(e.target.value)}
                    placeholder={`e.g. Technician ${technician || "specialist"} has departed our Kothamangalam service center and is traveling to your location...`}
                    className="w-full rounded-xl border border-blue-200 bg-blue-50/40 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    This message appears directly on the customer's tracking screen for this
                    milestone. Safe defaults apply if left empty.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Internal Workshop Notes (Staff-only, never visible to customer)
                  </label>
                  <textarea
                    rows={3}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Document workbench findings, component test results, serial numbers, customer communication logs..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                </div>

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
                    disabled={savingStatus}
                    onClick={handleSaveStatus}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {savingStatus ? (
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
            </>
          ) : (
            <>
              {/* Itemized Quotation Builder Tab */}
              <div className="space-y-6">
                {/* Header info */}
                <div className="flex items-center justify-between bg-blue-50/60 p-4 rounded-xl border border-blue-200">
                  <div>
                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                      Itemized Repair Quotation (Version {service.quote_version || 1})
                    </h4>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Publishing sends an updated itemized proposal to the customer&apos;s portal
                      for approval.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-blue-600 uppercase">
                      Estimated Total
                    </span>
                    <p className="text-lg font-extrabold text-blue-900">
                      {formatCurrency(calculateTotal())}
                    </p>
                  </div>
                </div>

                {/* Diagnostic Findings */}
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Technician Diagnostic Assessment / Problem Found
                  </label>
                  <textarea
                    rows={2}
                    value={findings[0]?.description || ""}
                    onChange={(e) => {
                      const desc = e.target.value;
                      setFindings((prev) => {
                        if (!prev.length) {
                          return [
                            {
                              id: `find-${Date.now().toString(36)}`,
                              title: "Diagnostic Observation",
                              description: desc,
                              source: "technician",
                              classification: "confirmed",
                              customerExplanation: desc,
                              recommendedRepair: "Service & repair as itemized below",
                              safety: "required",
                              isEligibleForRepair: true,
                              createdAt: new Date().toISOString(),
                            },
                          ];
                        }
                        return [
                          { ...prev[0], description: desc, customerExplanation: desc },
                          ...prev.slice(1),
                        ];
                      });
                    }}
                    placeholder="Document technician workbench observations explaining the needed repairs to the customer..."
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {/* Line Items Table */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Repair Line Items ({quotationItems.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleAddQuotationItem()}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                    >
                      <Plus size={14} /> Add Line Item
                    </button>
                  </div>

                  {quotationItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No repair items added yet. Click &quot;Add Line Item&quot; to begin building
                      quotation.
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View (sm+) */}
                      <div className="hidden sm:block divide-y divide-slate-100 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-2">Item Description</th>
                              <th className="px-3 py-2 w-36">Requirement</th>
                              <th className="px-3 py-2 w-24">Part (₹)</th>
                              <th className="px-3 py-2 w-24">Labour (₹)</th>
                              <th className="px-3 py-2 w-16">Qty</th>
                              <th className="px-3 py-2 text-right w-28">Total</th>
                              <th className="px-3 py-2 w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {quotationItems.map((item, index) => (
                              <tr key={item.id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-2.5">
                                  <input
                                    type="text"
                                    value={item.title}
                                    onChange={(e) =>
                                      handleUpdateItem(index, "title", e.target.value)
                                    }
                                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                                  />
                                </td>
                                <td className="px-3 py-2.5">
                                  <select
                                    value={
                                      item.isRequired
                                        ? "required"
                                        : item.requirementLevel === "recommended"
                                          ? "recommended"
                                          : "optional"
                                    }
                                    onChange={(e) => {
                                      const val = e.target.value as
                                        | "required"
                                        | "recommended"
                                        | "optional";
                                      const isReq = val === "required";
                                      const updated = [...quotationItems];
                                      updated[index] = {
                                        ...updated[index],
                                        isRequired: isReq,
                                        canDefer: !isReq,
                                        requirementLevel: val,
                                      };
                                      setQuotationItems(updated);
                                    }}
                                    className={`w-full rounded-md border px-2 py-1 text-[11px] font-bold focus:outline-none ${
                                      item.isRequired
                                        ? "bg-red-50 text-red-800 border-red-200"
                                        : item.requirementLevel === "recommended"
                                          ? "bg-amber-50 text-amber-800 border-amber-200"
                                          : "bg-slate-100 text-slate-700 border-slate-200"
                                    }`}
                                  >
                                    <option value="required">Required (Essential)</option>
                                    <option value="recommended">Recommended</option>
                                    <option value="optional">Optional Extra</option>
                                  </select>
                                </td>
                                <td className="px-3 py-2.5">
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.partCost}
                                    onChange={(e) =>
                                      handleUpdateItem(index, "partCost", e.target.value)
                                    }
                                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                                  />
                                </td>
                                <td className="px-3 py-2.5">
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.labourCost}
                                    onChange={(e) =>
                                      handleUpdateItem(index, "labourCost", e.target.value)
                                    }
                                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                                  />
                                </td>
                                <td className="px-3 py-2.5">
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) =>
                                      handleUpdateItem(index, "quantity", e.target.value)
                                    }
                                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                                  />
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                                  {formatCurrency(item.lineTotal)}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveQuotationItem(index)}
                                    className="text-slate-400 hover:text-red-600 transition"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Line-Item Cards (< sm) */}
                      <div className="sm:hidden space-y-3 p-3">
                        {quotationItems.map((item, index) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3 shadow-2xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-700 text-xs uppercase tracking-wider">
                                Item #{index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveQuotationItem(index)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-800 p-1"
                              >
                                <Trash2 size={13} />
                                <span>Remove</span>
                              </button>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                Item Description
                              </label>
                              <input
                                type="text"
                                value={item.title}
                                placeholder="e.g. Display Panel Replacement"
                                onChange={(e) => handleUpdateItem(index, "title", e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                Requirement Tier
                              </label>
                              <select
                                value={
                                  item.isRequired
                                    ? "required"
                                    : item.requirementLevel === "recommended"
                                      ? "recommended"
                                      : "optional"
                                }
                                onChange={(e) => {
                                  const val = e.target.value as
                                    | "required"
                                    | "recommended"
                                    | "optional";
                                  const isReq = val === "required";
                                  const updated = [...quotationItems];
                                  updated[index] = {
                                    ...updated[index],
                                    isRequired: isReq,
                                    canDefer: !isReq,
                                    requirementLevel: val,
                                  };
                                  setQuotationItems(updated);
                                }}
                                className={`w-full rounded-lg border px-3 py-2 text-xs font-bold focus:outline-none ${
                                  item.isRequired
                                    ? "bg-red-50 text-red-800 border-red-200"
                                    : item.requirementLevel === "recommended"
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-white text-slate-700 border-slate-200"
                                }`}
                              >
                                <option value="required">Required (Essential)</option>
                                <option value="recommended">Recommended</option>
                                <option value="optional">Optional Extra</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                  Part Cost (₹)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.partCost}
                                  onChange={(e) =>
                                    handleUpdateItem(index, "partCost", e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                  Labour Cost (₹)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.labourCost}
                                  onChange={(e) =>
                                    handleUpdateItem(index, "labourCost", e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-500">Qty:</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleUpdateItem(index, "quantity", e.target.value)
                                  }
                                  className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none text-center"
                                />
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Line Total
                                </span>
                                <span className="font-mono font-black text-sm text-slate-900">
                                  {formatCurrency(item.lineTotal)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Publish Actions */}
                <div className="flex flex-col sm:flex-row justify-end gap-2.5 sm:gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className="w-full sm:w-auto min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Back to Overview
                  </button>
                  <button
                    type="button"
                    disabled={publishing || quotationItems.length === 0}
                    onClick={handlePublishQuote}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {publishing ? (
                      <>
                        <LoaderCircle size={15} className="animate-spin" /> Publishing Quotation…
                      </>
                    ) : (
                      <>
                        <Send size={15} /> Publish &amp; Notify Customer
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pop-up Modal: Add Diagnostic Finding */}
      {isAddingFinding && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-finding-modal-title"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                  <Wrench size={18} />
                </div>
                <div>
                  <h3
                    id="add-finding-modal-title"
                    className="text-sm font-extrabold text-slate-900"
                  >
                    Add Diagnostic Finding
                  </h3>
                  <p className="text-xs text-slate-500">
                    Record bench observations, component faults, &amp; proposed remedies
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelAddFinding}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddNewFinding();
              }}
              className="p-6 space-y-4 text-xs"
            >
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Fault / Component Issue Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newFindingTitle}
                  onChange={(e) => setNewFindingTitle(e.target.value)}
                  placeholder="e.g. Motherboard 19V Short / Swollen Battery / GPU VRAM Defect"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Classification
                  </label>
                  <select
                    value={newFindingClass}
                    onChange={(e) => setNewFindingClass(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  >
                    <option value="confirmed">Confirmed Fault</option>
                    <option value="suspected">Suspected Fault</option>
                    <option value="needs_further_testing">Needs Bench Testing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Safety &amp; Criticality
                  </label>
                  <select
                    value={newFindingSafety}
                    onChange={(e) => setNewFindingSafety(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  >
                    <option value="required">Required (Device inoperable/unsafe)</option>
                    <option value="recommended">Recommended (Stability/performance)</option>
                    <option value="optional">Optional (Cosmetic/accessory)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Recommended Repair Action
                </label>
                <input
                  type="text"
                  value={newFindingRepair}
                  onChange={(e) => setNewFindingRepair(e.target.value)}
                  placeholder="e.g. SMD desoldering and replacement of shorted ceramic capacitor"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Technician Observations &amp; Multimeter / Scope Details
                </label>
                <textarea
                  rows={3}
                  value={newFindingDesc}
                  onChange={(e) => setNewFindingDesc(e.target.value)}
                  placeholder="Explain voltage rail readings, physical damage observed under microscope, thermal imaging, or failure cause..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancelAddFinding}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFindingTitle.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  <Plus size={14} /> Add Finding to Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
