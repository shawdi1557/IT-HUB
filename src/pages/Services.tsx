import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { LoginGate } from "../components/AuthModal";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  Laptop,
  Smartphone,
  Monitor,
  Wrench,
  ArrowUpRight,
  ArrowRight,
  Truck,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  CalendarCheck,
  Calendar,
  ClipboardCheck,
  PackageCheck,
  Package,
  Printer,
  AlertCircle,
  Clock,
  ChevronDown,
  Lock,
  Layers,
  Check,
  AlertTriangle,
  ShieldAlert,
  PhoneCall,
  RotateCcw,
  X,
  ArrowLeft,
} from "lucide-react";
import WhatsAppIcon from "../components/WhatsAppIcon";
import OurServices from "../components/OurServices";
import StatusMark from "../components/StatusMark";
import { useStore } from "../app/store";
import { track } from "../lib/analytics";
import {
  serviceTypes,
  problemsFor,
  serviceStatuses,
  serviceWarrantyPolicy,
  money,
  type ServiceRequest,
} from "../data/catalog";
import {
  createServiceBooking,
  updateServiceQuoteDecision,
  maskServiceRequestForPublicTracking,
  isUserTicketOwner,
  fetchServiceRequestById,
  mergeServiceRequests,
  upsertSingleServiceRequest,
  subscribeServiceTicket,
  validateDoorstepPin,
  validateCourierPin,
  validateAppointmentDate,
  validateServiceProblem,
  validateServiceDeviceModel,
  validateCustomerMobile,
  getWizardStepsForMethod,
  SERVICE_FEES,
  type WizardStep,
  type SafePublicTracking,
} from "../lib/services";
import {
  ActionLink,
  Badge,
  Button,
  Empty,
  Field,
  Loading,
  Logo,
  Page,
  PageHeading,
  Timeline,
  fieldClass,
  buttonClass,
  secondaryClass,
} from "../components/ui";
import QuotationApprovalPanel from "../components/QuotationApprovalPanel";
import {
  isRescheduleEligible,
  shouldDisplayRescheduleButton,
  validateRequestedAppointmentDate,
} from "../lib/serviceReschedule";
import { requestAppointmentReschedule, ALLOWED_TIME_SLOTS } from "../lib/services";
import {
  resolveTicketByReferenceOrId,
  TRACKER_PLACEHOLDER,
  normalizeTicketReference,
  formatTicketReference,
} from "../lib/ticketReference";

// ─────────────────────────────────────────────────────────────────────────────
// 1. MAIN SERVICES LANDING PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function Services() {
  const store = useStore();
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);

  // Live Quick Tracker State
  const [trackQuery, setTrackQuery] = useState<string>("");
  const [searchedId, setSearchedId] = useState<string>("");
  const [isSearchingRemote, setIsSearchingRemote] = useState<boolean>(false);

  const matchedRequest = useMemo(() => {
    if (!searchedId.trim()) return null;
    const q = searchedId.trim().toUpperCase();
    return store.requests.find(
      (r) =>
        r.id.toUpperCase() === q ||
        r.ticketReference?.toUpperCase() === q ||
        formatTicketReference(r.id).toUpperCase() === q ||
        r.id.toUpperCase().includes(q),
    );
  }, [searchedId, store.requests]);

  // Fetch authoritative record from Supabase upon search
  useEffect(() => {
    const cleanId = searchedId.trim();
    if (!cleanId || isSearchingRemote) return;

    setIsSearchingRemote(true);
    fetchServiceRequestById(cleanId)
      .then((fetched) => {
        if (fetched) {
          store.set((prev) => ({
            requests: upsertSingleServiceRequest(prev.requests, fetched),
          }));
        }
      })
      .finally(() => setIsSearchingRemote(false));
  }, [searchedId]);

  // Realtime subscription for quick-tracked ticket
  useEffect(() => {
    if (!matchedRequest?.id) return;
    const unsub = subscribeServiceTicket(matchedRequest.id, (updated) => {
      store.set((prev) => ({
        requests: upsertSingleServiceRequest(prev.requests, updated),
      }));
    });
    return () => unsub();
  }, [matchedRequest?.id]);

  const safeTrackData: SafePublicTracking | null = useMemo(() => {
    if (!matchedRequest) return null;
    const isOwner = isUserTicketOwner(matchedRequest, store.profile, {
      id: store.profile.id,
      email: store.profile.email,
      phone: store.profile.phone,
    });
    return maskServiceRequestForPublicTracking(matchedRequest, isOwner, serviceStatuses);
  }, [matchedRequest, store.profile]);

  // Direct technician consultation WhatsApp link
  const safeWhatsappLink = useMemo(() => {
    const text =
      "Hello IT HUB, I would like to consult with a technician regarding a device repair and preliminary diagnostics.\n\nI am attaching photos/videos of the device issue for preliminary assessment.";
    return `https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(text)}`;
  }, [store.settings.whatsapp]);

  return (
    <Page>
      {/* Hero Presentation */}
      <OurServices bleedTop />

      {/* Honest Trust Badges & Policies */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold">90-Day Service Warranty</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Warranty on replaced hardware components and labour workmanship.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold">Fair Diagnostic Policy</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Bench inspection fee is credited directly when you approve the repair.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold">Genuine OEM & Grade-A Parts</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Tested displays, brand batteries, and certified storage upgrades.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold">In-Store Kothamangalam Lab</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Direct workbench facility at Kothamangalam with certified staff.
            </p>
          </div>
        </div>
      </section>

      {/* Safe WhatsApp Diagnostics Card */}
      <section className="mt-10 md:mt-12 overflow-hidden rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-50/70 via-white to-emerald-50/30 p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-emerald-800">
              <WhatsAppIcon size={20} />
              <span className="text-[11px] font-bold uppercase tracking-[.18em]">
                Direct Technician Consultation
              </span>
            </div>
            <h3 className="mt-2 text-xl font-bold text-foreground">
              Send Device Photos/Videos for Preliminary Diagnosis
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Have a broken screen, strange motherboard beep, or printer error code? Send a photo or
              video directly to our Kothamangalam service team for quick triage and parts
              availability check.
            </p>

            {/* Crucial Security Notice */}
            <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-900">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-700" />
              <p className="text-[11px] leading-relaxed">
                <strong>Security & Privacy Advisory:</strong> Please <strong>never</strong> send
                device unlock PINs, passwords, UPI/banking OTPs, or confidential personal files. IT
                HUB technicians will never request personal passwords over WhatsApp or phone.
              </p>
            </div>
          </div>

          <a
            href={safeWhatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <WhatsAppIcon size={16} /> Open WhatsApp Chat <ArrowUpRight size={14} />
          </a>
        </div>
      </section>

      {/* Embedded Secure Live Ticket Quick-Tracker Widget */}
      <section className="mt-10 md:mt-12 rounded-2xl border border-border bg-card p-7 md:p-10 shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-border pb-6 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Search size={18} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">
                Live Ticket Lookup
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
              Track Your Repair in Real Time
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your Service Request ID to check status. Customer details are masked for your
              privacy.
            </p>
          </div>
          <Link to="/track-service" className="text-xs font-semibold text-primary hover:underline">
            Open Full Tracking Page →
          </Link>
        </div>

        <div className="mt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchedId(trackQuery.trim());
            }}
            className="flex max-w-xl gap-2"
          >
            <input
              required
              aria-label="Service request ID"
              placeholder="Enter Service Request ID (e.g. SRV-XXXXXXX)"
              value={trackQuery}
              onChange={(e) => setTrackQuery(e.target.value)}
              className={`${fieldClass} text-xs font-mono`}
            />
            <Button type="submit">
              Track <Search size={15} />
            </Button>
          </form>

          {/* Quick Tracking Result Container */}
          {searchedId && (
            <div className="mt-6">
              {isSearchingRemote ? (
                <div className="rounded-2xl border border-border bg-white p-8 text-center text-xs text-muted-foreground shadow-sm">
                  <Loading />
                  <p className="mt-2 font-medium">Looking up ticket {searchedId}...</p>
                </div>
              ) : safeTrackData && matchedRequest ? (
                <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">
                        Ticket ID
                      </span>
                      <h3 className="text-lg font-extrabold text-foreground">{safeTrackData.id}</h3>
                      <p className="text-xs text-muted-foreground">
                        Device: <strong>{safeTrackData.device}</strong> · Issue:{" "}
                        <strong>{safeTrackData.problem}</strong>
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge>{safeTrackData.statusLabel}</Badge>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Customer: {safeTrackData.customerMaskedName}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <Timeline
                      steps={
                        safeTrackData.pipelineSteps && safeTrackData.pipelineSteps.length > 0
                          ? safeTrackData.pipelineSteps
                          : serviceStatuses
                      }
                      current={safeTrackData.status}
                      statusName={safeTrackData.statusLabel}
                      isCompleted={safeTrackData.statusLabel === "Completed"}
                      isCancelled={safeTrackData.statusLabel === "Cancelled"}
                    />
                  </div>

                  {/* Customer-facing Quotation Actions on Embedded Tracker */}
                  {(matchedRequest.quote || matchedRequest.status >= 4) && (
                    <QuotationApprovalPanel
                      request={matchedRequest}
                      safeData={safeTrackData}
                      isEmbedded
                    />
                  )}

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-4 text-xs">
                    <div>
                      <span className="font-semibold text-foreground">Technician:</span>{" "}
                      <span className="text-muted-foreground">
                        {safeTrackData.technicianPublic}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">Quote Status:</span>{" "}
                      <span className="capitalize text-muted-foreground">
                        {safeTrackData.quoteState}
                      </span>
                    </div>
                    <Link
                      to={`/track-service/${encodeURIComponent(safeTrackData.id)}`}
                      className="font-bold text-primary hover:underline"
                    >
                      View Full Details & Approvals →
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center text-xs text-muted-foreground">
                  <p className="font-bold text-foreground">
                    No active service ticket found for "{searchedId}".
                  </p>
                  <p className="mt-1">
                    Please check the ticket ID format (e.g. SRV-XXXXXXX) or view your account
                    bookings.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Transparent Service Warranty Policy & Exclusions */}
      <section className="mt-14 rounded-2xl border border-border bg-card p-7 md:p-10 shadow-sm">
        <div className="border-b border-border pb-5">
          <span className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">
            Official Store Policies
          </span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
            Service Warranty Terms & Disclaimers
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Clear guidelines on what our {serviceWarrantyPolicy.durationDays}
            -day post-service warranty covers and standard industry exclusions.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {[
            {
              title: "What does the 90-day warranty cover?",
              content:
                serviceWarrantyPolicy.coverageScope + " " + serviceWarrantyPolicy.partsGuarantee,
            },
            {
              title: "How does the Diagnostic Assessment Fee work?",
              content: serviceWarrantyPolicy.inspectionPolicy,
            },
            {
              title: "What is explicitly excluded from service warranty?",
              isList: true,
              items: serviceWarrantyPolicy.exclusions,
            },
            {
              title: "Customer Data & Privacy Guarantee",
              content:
                "IT HUB strictly respects customer privacy. We do not access, copy, or browse personal photo galleries, documents, or browser histories during hardware repairs. However, storage drive repairs always carry risk of data corruption, so customers are advised to create backups prior to servicing.",
            },
          ].map((item, idx) => {
            const isOpen = faqOpenIndex === idx;
            return (
              <div
                key={idx}
                className="overflow-hidden rounded-xl border border-border bg-white transition"
              >
                <button
                  onClick={() => setFaqOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between p-4 text-left text-xs font-bold text-foreground hover:bg-secondary/40"
                >
                  <span>{item.title}</span>
                  <ChevronDown
                    size={16}
                    className={`transition duration-200 ${
                      isOpen ? "rotate-180 text-primary" : "text-muted-foreground"
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-border/70 p-4 text-xs leading-relaxed text-muted-foreground">
                    {item.isList ? (
                      <ul className="space-y-1.5 list-disc list-inside">
                        {item.items?.map((it, i) => (
                          <li key={i}>{it}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{item.content}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* How Service Works - 7 Clear Steps */}
      <section className="mt-14 overflow-hidden rounded-[2rem] border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border bg-secondary/60 px-7 py-8 md:flex-row md:items-end md:justify-between md:px-10">
          <div>
            <p className="text-[10px] font-semibold tracking-[.17em] text-primary">
              HOW SERVICE WORKS
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-.02em] md:text-3xl">
              Simple from start to finish.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            Seven clear steps, with updates at every stage. Nothing is repaired without your
            approval.
          </p>
        </div>
        <ol className="grid gap-x-4 gap-y-8 px-7 py-10 sm:grid-cols-2 md:px-10 lg:grid-cols-7">
          {[
            [CalendarCheck, "Book", "Choose your service and a convenient slot."],
            [Truck, "Pickup / drop-off", "Visit the store or schedule a courier."],
            [Search, "Diagnosis", "Our technicians find the root cause."],
            [ClipboardCheck, "Approval", "You approve the quote before any work."],
            [Wrench, "Repair", "Fixed with genuine, quality parts."],
            [ShieldCheck, "Quality check", "Tested thoroughly before handover."],
            [PackageCheck, "Return", "Collect it or get it delivered back."],
          ].map(([Icon, step, text], index, all) => {
            const StepIcon = Icon as typeof Wrench;
            return (
              <li key={step as string} className="relative flex gap-4 lg:block">
                {index < all.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-6 top-14 h-[calc(100%-1.5rem)] w-px bg-gradient-to-b from-primary/40 to-transparent sm:hidden lg:left-14 lg:top-6 lg:block lg:h-px lg:w-[calc(100%-2.5rem)] lg:bg-gradient-to-r"
                  />
                )}
                <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_10px_24px_-10px_rgba(26,79,214,.8)]">
                  <StepIcon size={20} />
                </span>
                <div className="lg:mt-5">
                  <p className="text-[11px] font-bold tracking-wider text-primary">
                    STEP {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold">{step as string}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text as string}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="flex items-center gap-2 border-t border-border px-7 py-5 text-xs text-muted-foreground md:px-10">
          <Truck size={15} className="shrink-0 text-primary" /> Send your device to IT HUB through
          courier and receive it back after service. Insured logistics available across Kerala.
        </p>
      </section>

      {/* Support Directory Cross-link */}
      <section
        id="warranty-check"
        className="mt-10 mb-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-7 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <h2 className="text-xl font-bold">Need Manufacturer Warranty Contacts?</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Looking for authorized service centres for Apple, Dell, HP, Lenovo or Samsung across
            Kerala? Check our official manufacturer directory.
          </p>
        </div>
        <ActionLink to="/support?view=warranty">
          Manufacturer Directory <ArrowRight size={15} />
        </ActionLink>
      </section>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ENHANCED SERVICE BOOKING FLOW
// ─────────────────────────────────────────────────────────────────────────────

export function ServiceBooking() {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const chosen = params.get("service") || "Laptop Repair";
  const presetDevice = params.get("device");
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => track("Service Booking Started", { service: chosen }), [chosen]);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const initialDevice =
    presetDevice ||
    (chosen.includes("Mobile")
      ? "Mobile"
      : chosen.includes("PC") || chosen.includes("Desktop")
        ? "Desktop"
        : chosen.includes("Printer")
          ? "Printer"
          : "Laptop");
  const presetProblem = params.get("problem");
  const initialProblem =
    presetProblem && problemsFor(initialDevice).includes(presetProblem) ? presetProblem : "";

  const [details, setDetails] = useState({
    device: initialDevice,
    model: "",
    problem: initialProblem,
    notes: "",
    method: params.get("method")?.includes("On-site")
      ? "On-site service"
      : params.get("method")?.includes("Courier")
        ? "Courier to IT HUB"
        : "Visit IT HUB",
    name: store.profile.name || "",
    email: store.profile.email || "",
    phone: store.profile.phone || "",
    houseBuilding: "",
    streetLocality: "",
    placeTown: "",
    pincode: "",
    directions: "",
    address: store.profile.address || "",
    inboundCourierTrackingNo: "",
    date: "",
    time: "10:00 – 12:00",
  });

  const update = (key: string, value: string) => {
    setDetails((prev) => {
      if (key === "device") {
        const supported = problemsFor(value);
        const keepProblem =
          prev.problem &&
          (supported.includes(prev.problem) ||
            prev.problem === "Other" ||
            prev.problem.startsWith("Other:"));
        return { ...prev, device: value, problem: keepProblem ? prev.problem : "" };
      }
      return { ...prev, [key]: value };
    });
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy[key];
      if (key === "problem") {
        delete copy.problem;
        if (value !== "Other") {
          delete copy.notes;
        }
      }
      if (key === "notes") {
        delete copy.notes;
        delete copy.problem;
      }
      return copy;
    });
    setSubmitError(null);
  };

  const isDoorstep =
    details.method === "On-site service" || details.method === "Doorstep Technician Visit";
  const isCourier =
    details.method === "Courier to IT HUB" || details.method === "Insured Courier Pickup & Return";
  const isWalkIn = details.method === "Visit IT HUB" || details.method === "Direct Store Walk-In";

  // Dynamic steps by service method:
  // Walk-in & Doorstep: 6 steps (with Date & Time)
  // Courier: 5 steps (without Date & Time)
  const steps: WizardStep[] = useMemo(() => {
    return getWizardStepsForMethod(details.method);
  }, [details.method]);

  // Safe active step clamped within bounds
  const safeStepIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[safeStepIndex] || steps[0];
  const isLastStep = safeStepIndex === steps.length - 1;

  const handleMethodChange = (newMethod: string) => {
    const willBeCourier =
      newMethod === "Courier to IT HUB" || newMethod === "Insured Courier Pickup & Return";
    setDetails((prev) => ({
      ...prev,
      method: newMethod,
      // Predictably clear incompatible appointment fields for courier, preserve otherwise
      ...(willBeCourier ? { date: "", time: "" } : { time: prev.time || "10:00 – 12:00" }),
    }));
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.method;
      delete copy.date;
      delete copy.time;
      return copy;
    });
    setSubmitError(null);
  };

  const focusFirstError = (errs: Record<string, string>) => {
    const firstKey = Object.keys(errs)[0];
    if (!firstKey) return;
    setTimeout(() => {
      const el =
        document.getElementById(`field-${firstKey}`) ||
        document.querySelector(`[name="${firstKey}"]`);
      if (el) {
        (el as HTMLElement).focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 60);
  };

  // Step-by-step validation
  const validateCurrentStep = (stepId: WizardStep["id"]): boolean => {
    const errs: Record<string, string> = {};

    if (stepId === "device") {
      if (!details.device) {
        errs.device = "Please select a device type.";
      }
      const modelCheck = validateServiceDeviceModel(details.model);
      if (!modelCheck.valid) {
        errs.model = modelCheck.error || "Please enter your device brand and model number.";
      }
    }

    if (stepId === "problem") {
      const probCheck = validateServiceProblem(details.problem, details.device, details.notes);
      if (!probCheck.valid) {
        if (!details.problem || !details.problem.trim()) {
          errs.problem = "Please select the issue you're experiencing before continuing.";
        } else if (details.problem === "Other" && (!details.notes || !details.notes.trim())) {
          errs.notes = "Please describe the issue you're experiencing before continuing.";
          errs.problem = "Please describe the issue you're experiencing before continuing.";
        } else {
          errs.problem =
            probCheck.error || "Please select the issue you're experiencing before continuing.";
        }
      }
    }

    if (stepId === "method") {
      if (!details.method || !details.method.trim()) {
        errs.method = "Please select a service method to proceed.";
      }
    }

    if (stepId === "details") {
      if (!details.name.trim()) {
        errs.name = "Customer full name is required.";
      }
      const phoneCheck = validateCustomerMobile(details.phone);
      if (!phoneCheck.valid) {
        errs.phone = phoneCheck.error || "Please enter a valid 10-digit mobile number.";
      }
      if (details.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) {
        errs.email = "Please enter a valid email address.";
      }

      if (isDoorstep) {
        if (!details.houseBuilding.trim()) {
          errs.houseBuilding = "House / Flat / Building is required.";
        }
        if (!details.streetLocality.trim()) {
          errs.streetLocality = "Street / Locality is required.";
        }
        if (!details.placeTown.trim()) {
          errs.placeTown = "Place / Town is required.";
        }
        if (!details.pincode.trim()) {
          errs.pincode = "Kerala PIN code is required.";
        } else {
          const pinRes = validateDoorstepPin(details.pincode);
          if (!pinRes.eligible) {
            errs.pincode = pinRes.message || "Doorstep service unavailable at this PIN.";
          }
        }
      }

      if (isCourier) {
        if (!details.houseBuilding.trim()) {
          errs.houseBuilding = "House / Flat / Building is required for return delivery.";
        }
        if (!details.streetLocality.trim()) {
          errs.streetLocality = "Street / Locality is required.";
        }
        if (!details.placeTown.trim()) {
          errs.placeTown = "Place / District is required.";
        }
        if (!details.pincode.trim()) {
          errs.pincode = "Kerala PIN code is required.";
        } else {
          const pinRes = validateCourierPin(details.pincode);
          if (!pinRes.eligible) {
            errs.pincode = pinRes.message || "Courier return unavailable at this PIN.";
          }
        }
      }
    }

    if (stepId === "appointment") {
      if (!details.date.trim()) {
        errs.date = "Please select a preferred appointment date.";
      } else {
        const dateRes = validateAppointmentDate(details.date);
        if (!dateRes.valid) {
          errs.date = dateRes.error || "Invalid appointment date.";
        }
      }
      if (!details.time.trim() || !ALLOWED_TIME_SLOTS.includes(details.time)) {
        errs.time = "Please select a valid store time slot.";
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      focusFirstError(errs);
      return false;
    }

    setFieldErrors({});
    return true;
  };

  const next = async () => {
    if (!validateCurrentStep(currentStep.id)) {
      return;
    }

    if (!isLastStep) {
      setStepIndex(safeStepIndex + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Last step ("confirm"): Final Submission
    setBusy(true);
    setSubmitError(null);

    // Formulate structured address
    const combinedAddress =
      isDoorstep || isCourier
        ? `${details.houseBuilding}, ${details.streetLocality}, ${details.placeTown}, PIN ${details.pincode}${
            details.directions ? ` (Directions: ${details.directions})` : ""
          }`
        : "IT HUB Computer & Laptop Service Center, AM Road, Kothamangalam — 686691";

    const currentUserId = (store.profile as any)?.id || undefined;

    const effectiveProblem =
      details.problem === "Other" && details.notes.trim()
        ? details.notes.trim().startsWith("Other")
          ? details.notes.trim()
          : `Other: ${details.notes.trim()}`
        : details.problem;

    const res = await createServiceBooking(
      {
        ...details,
        problem: effectiveProblem,
        model: details.model.trim(),
        address: combinedAddress,
        // For Courier, explicitly omit date & time so no fake appointments are stored
        date: isCourier ? undefined : details.date,
        time: isCourier ? undefined : details.time,
      },
      currentUserId,
    );

    if (!res.ok || !res.id) {
      setBusy(false);
      setSubmitError(res.error || "Failed to submit service booking. Please try again.");
      return;
    }

    const createdId = res.id;
    const guestToken = res.guestToken;

    const request: ServiceRequest = {
      ...details,
      problem: effectiveProblem,
      model: details.model.trim(),
      id: createdId,
      guestToken,
      address: combinedAddress,
      pincode: details.pincode || undefined,
      inboundCourierTrackingNo: details.inboundCourierTrackingNo || undefined,
      date: isCourier ? "" : details.date,
      time: isCourier ? "" : details.time,
      status: 0,
      statusName: "Booked",
      quote: 0,
      quoteState: "pending" as const,
      technician: isDoorstep ? "Assigned Field Specialist" : "IT HUB Bench Specialist",
      ...(isCourier && {
        courierCharge: {
          returnDelivery: SERVICE_FEES.COURIER_RETURN_DELIVERY,
        },
      }),
    };

    track("Service Request Created", {
      request: createdId,
      device: details.device,
      problem: effectiveProblem,
      method: details.method,
    });

    store.set((previous) => ({
      requests: [request, ...previous.requests],
      notifications: [`Service request ${createdId} created`, ...previous.notifications],
    }));

    store.log(`Service request ${createdId} submitted`);
    store.notify("Service request submitted successfully");
    navigate(`/service-success/${createdId}`);
  };

  const handleBack = () => {
    if (safeStepIndex > 0) {
      setStepIndex(safeStepIndex - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      navigate("/services");
    }
  };

  if (!store.loggedIn)
    return (
      <Page>
        <LoginGate
          title="Login to book a service"
          text="Sign in with your mobile number to book a repair, schedule a pickup, and track your service request."
        />
      </Page>
    );

  // Live PIN Code Validation Status
  const doorstepPinStatus =
    isDoorstep && details.pincode.length === 6 ? validateDoorstepPin(details.pincode) : null;
  const courierPinStatus =
    isCourier && details.pincode.length === 6 ? validateCourierPin(details.pincode) : null;

  // Reusable input styling for comfortable 50-56px heights and high contrast
  const getInputClass = (fieldName: string) =>
    `w-full h-13 sm:h-14 rounded-xl border px-4 sm:px-5 py-3 text-sm sm:text-base transition outline-none disabled:bg-muted ${
      fieldErrors[fieldName]
        ? "border-rose-500 bg-rose-50/20 text-foreground focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
        : "border-border bg-white text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
    }`;

  const getTextareaClass = (fieldName: string) =>
    `w-full rounded-xl border px-4 sm:px-5 py-3.5 text-sm sm:text-base transition outline-none disabled:bg-muted ${
      fieldErrors[fieldName]
        ? "border-rose-500 bg-rose-50/20 text-foreground focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
        : "border-border bg-white text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
    }`;

  const labelClass = "block text-sm sm:text-base font-bold text-foreground mb-2";

  return (
    <Page>
      <PageHeading
        title="Book a repair or maintenance"
        description="Transparent diagnostics, genuine parts, and tracking from intake to return."
      />

      {/* Main wizard container scaled up to 900-1000px maximum width on desktop */}
      <div className="mx-auto w-full max-w-[960px] px-2 sm:px-4 lg:px-6">
        {/* Dynamic Step Progress Bar */}
        <nav aria-label="Service Booking Steps" className="mb-8 md:mb-10">
          <ol className="flex items-center justify-between gap-1 sm:gap-3 border-b border-border pb-5">
            {steps.map((st, idx) => {
              const isActive = idx === safeStepIndex;
              const isCompleted = idx < safeStepIndex;
              return (
                <li key={st.id} className="flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (idx < safeStepIndex) setStepIndex(idx);
                    }}
                    disabled={idx > safeStepIndex}
                    className={`group flex items-center gap-2 sm:gap-3 text-left w-full transition ${
                      isActive
                        ? "text-primary"
                        : isCompleted
                          ? "text-emerald-600 hover:text-emerald-700 cursor-pointer"
                          : "text-muted-foreground/50 cursor-not-allowed"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-all duration-200 ${
                        isActive
                          ? "bg-primary text-white shadow-md shadow-primary/25 scale-105"
                          : isCompleted
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {isCompleted ? <Check size={16} strokeWidth={3} /> : idx + 1}
                    </span>
                    <span className="hidden sm:inline text-xs sm:text-sm font-semibold tracking-tight">
                      {st.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {submitError && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 flex items-start gap-3 shadow-xs"
          >
            <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-950 text-base">Unable to Submit Booking</p>
              <p className="mt-1 text-rose-800 leading-relaxed text-sm">{submitError}</p>
            </div>
          </div>
        )}

        {/* Step 0: Device Selection */}
        {currentStep.id === "device" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                Select Device Type
                <span className="text-red-500 font-bold ml-1" title="Required field">
                  *
                </span>
              </h3>
              {fieldErrors.device && (
                <span className="text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1">
                  <AlertCircle size={14} /> {fieldErrors.device}
                </span>
              )}
            </div>

            <div
              id="field-device"
              tabIndex={-1}
              role="radiogroup"
              aria-label="Device Type"
              aria-required="true"
              className="grid grid-cols-2 gap-4 sm:grid-cols-4"
            >
              {[
                { id: "Laptop", Icon: Laptop },
                { id: "Mobile", Icon: Smartphone },
                { id: "Desktop", Icon: Monitor },
                { id: "Printer", Icon: Printer },
              ].map(({ id, Icon }) => (
                <button
                  key={id}
                  type="button"
                  id={`device-${id.toLowerCase()}`}
                  role="radio"
                  aria-checked={details.device === id}
                  onClick={() => update("device", id)}
                  className={`flex flex-col items-center justify-center gap-3 rounded-2xl border p-6 sm:p-7 text-center transition-all duration-200 cursor-pointer ${
                    details.device === id
                      ? "border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary"
                      : "border-border bg-white text-muted-foreground hover:border-primary/50 hover:bg-slate-50/50"
                  }`}
                >
                  <div
                    className={`p-3 rounded-xl transition ${
                      details.device === id
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <Icon size={32} />
                  </div>
                  <span className="text-sm sm:text-base font-bold text-foreground">{id}</span>
                </button>
              ))}
            </div>

            <div className="pt-2">
              <label htmlFor="field-model" className={labelClass}>
                Device Brand &amp; Model Number{" "}
                <span className="text-red-500 font-bold ml-1" title="Required field">
                  *
                </span>
              </label>
              <input
                id="field-model"
                name="model"
                value={details.model}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.model)}
                aria-describedby={fieldErrors.model ? "error-model" : "help-model"}
                onChange={(e) => update("model", e.target.value)}
                placeholder="e.g. Dell Inspiron 15 3511, HP Pavilion Gaming, Lenovo ThinkPad T14, iPhone 13"
                className={getInputClass("model")}
              />
              {fieldErrors.model ? (
                <p
                  id="error-model"
                  className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                >
                  <AlertCircle size={14} className="shrink-0" /> {fieldErrors.model}
                </p>
              ) : (
                <p id="help-model" className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
                  Accurate model information allows our bench technicians to allocate appropriate
                  diagnostic test rigs.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Problem Selection */}
        {currentStep.id === "problem" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                What issue are you facing?
                <span className="text-red-500 font-bold ml-1" title="Required field">
                  *
                </span>
              </h3>
              {fieldErrors.problem && (
                <span
                  id="error-problem"
                  role="alert"
                  className="text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                >
                  <AlertCircle size={14} className="shrink-0" /> {fieldErrors.problem}
                </span>
              )}
            </div>

            <div
              id="field-problem"
              tabIndex={-1}
              role="radiogroup"
              aria-label="Common Hardware Issues"
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.problem)}
              aria-describedby={fieldErrors.problem ? "error-problem" : undefined}
              className="grid gap-3 sm:grid-cols-2"
            >
              {problemsFor(details.device).map((prob) => (
                <button
                  key={prob}
                  type="button"
                  role="radio"
                  aria-checked={details.problem === prob}
                  onClick={() => update("problem", prob)}
                  className={`rounded-xl border p-4 sm:p-5 text-left text-sm sm:text-base font-semibold transition cursor-pointer ${
                    details.problem === prob
                      ? "border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary"
                      : "border-border bg-white text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-slate-50/50"
                  }`}
                >
                  {prob}
                </button>
              ))}
            </div>

            {fieldErrors.problem && !details.problem && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs sm:text-sm font-semibold flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                {fieldErrors.problem}
              </div>
            )}

            <div>
              <label htmlFor="field-notes" className={labelClass}>
                {details.problem === "Other" ? (
                  <>
                    Please describe the issue you&apos;re experiencing:
                    <span className="text-red-500 font-bold ml-1" title="Required field">
                      *
                    </span>
                  </>
                ) : (
                  <>
                    Additional observations, error codes, or physical damage notes:
                    <span className="text-muted-foreground font-normal ml-1 text-xs sm:text-sm">
                      (Optional)
                    </span>
                  </>
                )}
              </label>
              <textarea
                id="field-notes"
                name="notes"
                value={details.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder={
                  details.problem === "Other"
                    ? "Please describe the problem your device is experiencing in detail (e.g. Broken hinge, burning smell, loose HDMI port, trackpad erratic)..."
                    : "e.g. Device dropped yesterday, display flickers when moved past 90 degrees, power LED blinks white..."
                }
                className={getTextareaClass(
                  details.problem === "Other" && fieldErrors.notes ? "notes" : "notes",
                )}
                rows={3}
                required={details.problem === "Other"}
                aria-required={details.problem === "Other"}
                aria-invalid={details.problem === "Other" && Boolean(fieldErrors.notes)}
                aria-describedby={
                  details.problem === "Other" && fieldErrors.notes ? "error-notes" : undefined
                }
              />
              {details.problem === "Other" && fieldErrors.notes && (
                <p
                  id="error-notes"
                  className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                >
                  <AlertCircle size={14} className="shrink-0" /> {fieldErrors.notes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Service Method */}
        {currentStep.id === "method" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                Select Service Method
                <span className="text-red-500 font-bold ml-1" title="Required field">
                  *
                </span>
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Choose how you would like to hand over your device to IT HUB.
              </p>
              {fieldErrors.method && (
                <p className="mt-2 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1">
                  <AlertCircle size={14} /> {fieldErrors.method}
                </p>
              )}
            </div>

            <div
              id="field-method"
              role="radiogroup"
              aria-label="Service Method"
              aria-required="true"
              className="space-y-4"
            >
              {[
                {
                  id: "Visit IT HUB",
                  title: "Direct Store Walk-In (Kothamangalam)",
                  description:
                    "Bring your device directly to IT HUB Kothamangalam service desk. Immediate physical intake, free visual check, and diagnostic fee credited on repair.",
                  charge: "No logistics charge",
                  chargeTone: "bg-emerald-50 text-emerald-700 border-emerald-200",
                  Icon: Wrench,
                },
                {
                  id: "On-site service",
                  title: "Doorstep Technician Visit",
                  description:
                    "Certified IT HUB technician visits your home or office within approximately 15 km of Kothamangalam for PC & network setup and on-site hardware checks.",
                  charge: "₹250 doorstep callout fee",
                  chargeTone: "bg-blue-50 text-blue-700 border-blue-200",
                  Icon: MapPin,
                },
                {
                  id: "Courier to IT HUB",
                  title: "Insured Courier Pickup & Return",
                  description:
                    "Available across all Kerala districts. Pack securely and courier to IT HUB central workshop. We repair upon quote approval and return-ship post-service.",
                  charge: `₹${SERVICE_FEES.COURIER_RETURN_DELIVERY} return delivery fee`,
                  chargeTone: "bg-purple-50 text-purple-700 border-purple-200",
                  Icon: Truck,
                },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  id={`method-${m.id.toLowerCase().replace(/\s+/g, "-")}`}
                  role="radio"
                  aria-checked={details.method === m.id}
                  onClick={() => handleMethodChange(m.id)}
                  className={`flex w-full items-start gap-5 rounded-2xl border p-6 sm:p-7 text-left transition-all duration-200 cursor-pointer ${
                    details.method === m.id
                      ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
                      : "border-border bg-white text-muted-foreground hover:border-primary/50 hover:bg-slate-50/50"
                  }`}
                >
                  <div
                    className={`p-3.5 rounded-2xl shrink-0 transition ${
                      details.method === m.id
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-primary"
                    }`}
                  >
                    <m.Icon size={28} />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base sm:text-lg font-bold text-foreground">{m.title}</p>
                      <span
                        className={`text-xs sm:text-sm font-bold px-3 py-1 rounded-full border ${m.chargeTone}`}
                      >
                        {m.charge}
                      </span>
                    </div>
                    <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {m.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Contact & Address Details */}
        {currentStep.id === "details" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                {isWalkIn
                  ? "Customer Contact Details"
                  : isDoorstep
                    ? "Customer Details & Doorstep Location"
                    : "Customer Details & Return Shipping Address"}
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                {isWalkIn
                  ? "Provide your contact details for booking verification and intake status updates."
                  : isDoorstep
                    ? "Provide your contact information and exact address for technician dispatch."
                    : "Provide your contact information and exact return shipping destination."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="field-name" className={labelClass}>
                  Your Full Name:
                  <span className="text-red-500 font-bold ml-1" title="Required field">
                    *
                  </span>
                </label>
                <input
                  id="field-name"
                  name="name"
                  value={details.name}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "error-name" : undefined}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Prakash A K"
                  className={getInputClass("name")}
                />
                {fieldErrors.name && (
                  <p
                    id="error-name"
                    className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                  >
                    <AlertCircle size={14} className="shrink-0" /> {fieldErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-phone" className={labelClass}>
                  Mobile Phone Number:
                  <span className="text-red-500 font-bold ml-1" title="Required field">
                    *
                  </span>
                </label>
                <input
                  id="field-phone"
                  name="phone"
                  type="tel"
                  value={details.phone}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? "error-phone" : undefined}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="e.g. 94470 55443"
                  className={getInputClass("phone")}
                />
                {fieldErrors.phone && (
                  <p
                    id="error-phone"
                    className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                  >
                    <AlertCircle size={14} className="shrink-0" /> {fieldErrors.phone}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="field-email" className={labelClass}>
                Email Address:
                <span className="text-muted-foreground font-normal ml-1 text-xs sm:text-sm">
                  (Optional — for quotation &amp; tracking updates)
                </span>
              </label>
              <input
                id="field-email"
                name="email"
                type="email"
                value={details.email}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "error-email" : undefined}
                onChange={(e) => update("email", e.target.value)}
                placeholder="e.g. prakash@example.com"
                className={getInputClass("email")}
              />
              {fieldErrors.email && (
                <p
                  id="error-email"
                  className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                >
                  <AlertCircle size={14} className="shrink-0" /> {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Walk-in notice */}
            {isWalkIn && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 text-sm text-blue-900 space-y-1">
                <p className="font-bold text-base">
                  No Physical Address Required for Store Walk-In
                </p>
                <p className="text-xs sm:text-sm leading-relaxed text-blue-800">
                  Your phone and email will be used for your intake reference receipt, diagnosis
                  report, and quotation approval notifications.
                </p>
              </div>
            )}

            {/* Doorstep Address Fields */}
            {isDoorstep && (
              <div className="space-y-4 border-t border-border pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm sm:text-base font-bold text-foreground uppercase tracking-wider">
                    Doorstep Service Address (~15 km of Kothamangalam)
                  </h4>
                  <span className="text-xs sm:text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                    ₹250 Callout Fee
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="field-houseBuilding" className={labelClass}>
                      House / Flat / Building No. &amp; Name:
                      <span className="text-red-500 font-bold ml-1" title="Required field">
                        *
                      </span>
                    </label>
                    <input
                      id="field-houseBuilding"
                      name="houseBuilding"
                      value={details.houseBuilding}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.houseBuilding)}
                      aria-describedby={
                        fieldErrors.houseBuilding ? "error-houseBuilding" : undefined
                      }
                      onChange={(e) => update("houseBuilding", e.target.value)}
                      placeholder="e.g. Flat 3B, Rose Villa"
                      className={getInputClass("houseBuilding")}
                    />
                    {fieldErrors.houseBuilding && (
                      <p
                        id="error-houseBuilding"
                        className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} className="shrink-0" /> {fieldErrors.houseBuilding}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="field-streetLocality" className={labelClass}>
                      Street or Locality:
                      <span className="text-red-500 font-bold ml-1" title="Required field">
                        *
                      </span>
                    </label>
                    <input
                      id="field-streetLocality"
                      name="streetLocality"
                      value={details.streetLocality}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.streetLocality)}
                      aria-describedby={
                        fieldErrors.streetLocality ? "error-streetLocality" : undefined
                      }
                      onChange={(e) => update("streetLocality", e.target.value)}
                      placeholder="e.g. AM Road, College Junction"
                      className={getInputClass("streetLocality")}
                    />
                    {fieldErrors.streetLocality && (
                      <p
                        id="error-streetLocality"
                        className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} className="shrink-0" /> {fieldErrors.streetLocality}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="field-placeTown" className={labelClass}>
                      Place / Town:
                      <span className="text-red-500 font-bold ml-1" title="Required field">
                        *
                      </span>
                    </label>
                    <input
                      id="field-placeTown"
                      name="placeTown"
                      value={details.placeTown}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.placeTown)}
                      aria-describedby={fieldErrors.placeTown ? "error-placeTown" : undefined}
                      onChange={(e) => update("placeTown", e.target.value)}
                      placeholder="e.g. Kothamangalam / Neriamangalam"
                      className={getInputClass("placeTown")}
                    />
                    {fieldErrors.placeTown && (
                      <p
                        id="error-placeTown"
                        className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} className="shrink-0" /> {fieldErrors.placeTown}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="field-pincode" className={labelClass}>
                      Kerala PIN Code:
                      <span className="text-red-500 font-bold ml-1" title="Required field">
                        *
                      </span>
                    </label>
                    <input
                      id="field-pincode"
                      name="pincode"
                      value={details.pincode}
                      maxLength={6}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.pincode)}
                      aria-describedby={fieldErrors.pincode ? "error-pincode" : undefined}
                      onChange={(e) => update("pincode", e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 686691"
                      className={getInputClass("pincode")}
                    />
                    {doorstepPinStatus && doorstepPinStatus.eligible && (
                      <p className="mt-1.5 text-xs sm:text-sm font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 size={15} /> Eligible for Doorstep Technician Visit (~15 km of
                        Kothamangalam)
                      </p>
                    )}
                    {doorstepPinStatus && !doorstepPinStatus.eligible && (
                      <p className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1">
                        <AlertCircle size={15} className="shrink-0" /> {doorstepPinStatus.message}
                      </p>
                    )}
                    {fieldErrors.pincode && !doorstepPinStatus && (
                      <p
                        id="error-pincode"
                        className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} className="shrink-0" /> {fieldErrors.pincode}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="field-directions" className={labelClass}>
                    Landmark / Directions:
                    <span className="text-muted-foreground font-normal ml-1 text-xs sm:text-sm">
                      (Optional)
                    </span>
                  </label>
                  <input
                    id="field-directions"
                    name="directions"
                    value={details.directions}
                    onChange={(e) => update("directions", e.target.value)}
                    placeholder="e.g. Opposite St. George Church, near AM Petrol Pump"
                    className={getInputClass("directions")}
                  />
                </div>
              </div>
            )}

            {/* Courier Address & Instructions Fields */}
            {isCourier && (
              <div className="space-y-5 border-t border-border pt-6">
                <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-5 sm:p-6 text-sm text-blue-950 space-y-3">
                  <div className="flex items-center gap-2.5 font-bold text-blue-900 text-base sm:text-lg">
                    <Package size={20} className="text-blue-700" />
                    How Insured Courier Service Works
                  </div>
                  <p className="text-blue-800 leading-relaxed text-xs sm:text-sm">
                    1. You securely pack your device with bubble wrap and courier it to IT HUB's
                    central service workshop:
                  </p>
                  <div className="rounded-xl bg-white p-4 font-mono text-xs sm:text-sm text-slate-800 border border-blue-100 shadow-xs leading-relaxed">
                    <strong>IT HUB Computer &amp; Laptop Service Center</strong>
                    <br />
                    Near Private Bus Stand, AM Road, Kothamangalam, Kerala — 686691
                    <br />
                    Helpline / WhatsApp: +91 94470 55443
                  </div>
                  <p className="text-blue-800 leading-relaxed text-xs sm:text-sm">
                    2. Please retain the courier consignment slip and tracking number.
                  </p>
                  <p className="text-blue-800 leading-relaxed text-xs sm:text-sm">
                    3. Enter your return delivery address below. Repaired equipment is
                    return-shipped safely with ₹150 return delivery charge.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="field-houseBuilding" className={labelClass}>
                      Return House / Building No.:
                      <span className="text-red-500 font-bold ml-1" title="Required field">
                        *
                      </span>
                    </label>
                    <input
                      id="field-houseBuilding"
                      name="houseBuilding"
                      value={details.houseBuilding}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.houseBuilding)}
                      aria-describedby={
                        fieldErrors.houseBuilding ? "error-courier-house" : undefined
                      }
                      onChange={(e) => update("houseBuilding", e.target.value)}
                      placeholder="e.g. House No. 42, Green Valley"
                      className={getInputClass("houseBuilding")}
                    />
                    {fieldErrors.houseBuilding && (
                      <p
                        id="error-courier-house"
                        className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} className="shrink-0" /> {fieldErrors.houseBuilding}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="field-streetLocality" className={labelClass}>
                      Street or Locality:
                      <span className="text-red-500 font-bold ml-1" title="Required field">
                        *
                      </span>
                    </label>
                    <input
                      id="field-streetLocality"
                      name="streetLocality"
                      value={details.streetLocality}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.streetLocality)}
                      aria-describedby={
                        fieldErrors.streetLocality ? "error-courier-street" : undefined
                      }
                      onChange={(e) => update("streetLocality", e.target.value)}
                      placeholder="e.g. Civil Station Road"
                      className={getInputClass("streetLocality")}
                    />
                    {fieldErrors.streetLocality && (
                      <p
                        id="error-courier-street"
                        className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} className="shrink-0" /> {fieldErrors.streetLocality}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="field-placeTown" className={labelClass}>
                      Place / District:
                      <span className="text-red-500 font-bold ml-1" title="Required field">
                        *
                      </span>
                    </label>
                    <input
                      id="field-placeTown"
                      name="placeTown"
                      value={details.placeTown}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.placeTown)}
                      aria-describedby={fieldErrors.placeTown ? "error-courier-town" : undefined}
                      onChange={(e) => update("placeTown", e.target.value)}
                      placeholder="e.g. Thrissur / Kozhikode / Thiruvananthapuram"
                      className={getInputClass("placeTown")}
                    />
                    {fieldErrors.placeTown && (
                      <p
                        id="error-courier-town"
                        className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} className="shrink-0" /> {fieldErrors.placeTown}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="field-pincode" className={labelClass}>
                      Kerala PIN Code:
                      <span className="text-red-500 font-bold ml-1" title="Required field">
                        *
                      </span>
                    </label>
                    <input
                      id="field-pincode"
                      name="pincode"
                      value={details.pincode}
                      maxLength={6}
                      required
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.pincode)}
                      aria-describedby={fieldErrors.pincode ? "error-courier-pin" : undefined}
                      onChange={(e) => update("pincode", e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 680001 (All Kerala PINs starting 67/68/69)"
                      className={getInputClass("pincode")}
                    />
                    {courierPinStatus && courierPinStatus.eligible && (
                      <p className="mt-1.5 text-xs sm:text-sm font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 size={15} /> Eligible for Kerala-wide Courier Return Delivery
                      </p>
                    )}
                    {courierPinStatus && !courierPinStatus.eligible && (
                      <p className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1">
                        <AlertCircle size={15} className="shrink-0" /> {courierPinStatus.message}
                      </p>
                    )}
                    {fieldErrors.pincode && !courierPinStatus && (
                      <p
                        id="error-courier-pin"
                        className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} className="shrink-0" /> {fieldErrors.pincode}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="field-inboundCourierTrackingNo" className={labelClass}>
                    Your Inbound Courier Tracking / Consignment Number:
                    <span className="text-muted-foreground font-normal ml-1 text-xs sm:text-sm">
                      (Optional)
                    </span>
                  </label>
                  <input
                    id="field-inboundCourierTrackingNo"
                    name="inboundCourierTrackingNo"
                    value={details.inboundCourierTrackingNo}
                    onChange={(e) => update("inboundCourierTrackingNo", e.target.value)}
                    placeholder="e.g. EK123456789IN (Speed Post), DTDC123456 (if already shipped)"
                    className={getInputClass("inboundCourierTrackingNo")}
                  />
                  <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
                    If you have already booked dispatch, provide it here so our intake team can
                    track incoming arrival.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Preferred Date & Time (Walk-In and Doorstep ONLY) */}
        {currentStep.id === "appointment" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                {isWalkIn
                  ? "Select Store Visit Appointment Date & Time"
                  : "Select Doorstep Appointment Date & Time"}
                <span className="text-red-500 font-bold ml-1" title="Required field">
                  *
                </span>
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Appointments are available Monday through Saturday. IT HUB is strictly closed on
                Sundays.
              </p>
            </div>

            <div>
              <label htmlFor="field-date" className={labelClass}>
                Preferred Appointment Date (Monday – Saturday):
                <span className="text-red-500 font-bold ml-1" title="Required field">
                  *
                </span>
              </label>
              <input
                id="field-date"
                name="date"
                type="date"
                value={details.date}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.date)}
                aria-describedby={fieldErrors.date ? "error-date" : "help-date"}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => update("date", e.target.value)}
                className={getInputClass("date")}
              />
              {fieldErrors.date ? (
                <p
                  id="error-date"
                  className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1"
                >
                  <AlertCircle size={14} className="shrink-0" /> {fieldErrors.date}
                </p>
              ) : (
                <p
                  id="help-date"
                  className="mt-1.5 text-xs sm:text-sm text-amber-800 flex items-center gap-1.5 font-medium"
                >
                  <Clock size={15} />
                  IT HUB Service Center is open Monday through Saturday (10:00 AM – 7:30 PM).
                  Sundays are strictly closed.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>
                Preferred Appointment Time Window:
                <span className="text-red-500 font-bold ml-1" title="Required field">
                  *
                </span>
              </label>
              <div
                id="field-time"
                role="radiogroup"
                aria-label="Appointment Time Window"
                aria-required="true"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              >
                {ALLOWED_TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    role="radio"
                    aria-checked={details.time === slot}
                    onClick={() => update("time", slot)}
                    className={`rounded-xl border p-4 text-center text-xs sm:text-sm font-semibold transition cursor-pointer ${
                      details.time === slot
                        ? "border-primary bg-primary text-white shadow-md ring-2 ring-primary"
                        : "border-border bg-white text-muted-foreground hover:border-primary hover:text-primary hover:bg-slate-50/50"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              {fieldErrors.time && (
                <p className="mt-1.5 text-xs sm:text-sm font-semibold text-rose-600 flex items-center gap-1">
                  <AlertCircle size={14} className="shrink-0" /> {fieldErrors.time}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step: Order Review & Confirmation */}
        {currentStep.id === "confirm" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                Confirm Service Booking
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Please review your details before submitting your service request to IT HUB
                workbench.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-white p-6 sm:p-7 space-y-4 text-sm shadow-sm">
              <div className="flex justify-between border-b border-border/80 pb-3">
                <span className="text-muted-foreground font-medium">Device / Model:</span>
                <span className="font-bold text-foreground text-right">
                  {details.device} {details.model ? `(${details.model})` : ""}
                </span>
              </div>

              <div className="flex justify-between border-b border-border/80 pb-3">
                <span className="text-muted-foreground font-medium">Reported Problem:</span>
                <span className="font-bold text-foreground text-right">
                  {details.problem === "Other" && details.notes
                    ? `Other: ${details.notes}`
                    : details.problem}
                </span>
              </div>

              {details.notes && (
                <div className="flex justify-between border-b border-border/80 pb-3">
                  <span className="text-muted-foreground font-medium">Observations / Notes:</span>
                  <span className="font-medium text-foreground text-right max-w-sm">
                    {details.notes}
                  </span>
                </div>
              )}

              <div className="flex justify-between border-b border-border/80 pb-3">
                <span className="text-muted-foreground font-medium">Service Method:</span>
                <span className="font-bold text-foreground text-right">{details.method}</span>
              </div>

              <div className="flex justify-between border-b border-border/80 pb-3">
                <span className="text-muted-foreground font-medium">Logistics / Callout Fee:</span>
                <span className="font-bold text-foreground text-right">
                  {isWalkIn && "₹0 (Direct Store Walk-In — Free Desk Handover)"}
                  {isDoorstep && "₹250 (Doorstep Technician Callout Fee)"}
                  {isCourier &&
                    `₹${SERVICE_FEES.COURIER_RETURN_DELIVERY} (Insured Return Delivery Charge)`}
                </span>
              </div>

              {/* Show Appointment Date & Time ONLY for Walk-In and Doorstep */}
              {(isWalkIn || isDoorstep) && (
                <div className="flex justify-between border-b border-border/80 pb-3">
                  <span className="text-muted-foreground font-medium">
                    {isWalkIn ? "Store Visit Appointment:" : "Doorstep Visit Slot:"}
                  </span>
                  <span className="font-bold text-foreground text-right">
                    {details.date} · {details.time}
                  </span>
                </div>
              )}

              <div className="flex justify-between border-b border-border/80 pb-3">
                <span className="text-muted-foreground font-medium">Customer:</span>
                <span className="font-bold text-foreground text-right">
                  {details.name} {details.phone ? `(${details.phone})` : ""}
                </span>
              </div>

              {details.email && (
                <div className="flex justify-between border-b border-border/80 pb-3">
                  <span className="text-muted-foreground font-medium">Email:</span>
                  <span className="font-medium text-foreground text-right">{details.email}</span>
                </div>
              )}

              {isWalkIn && (
                <div className="flex justify-between border-b border-border/80 pb-3">
                  <span className="text-muted-foreground font-medium">Store Location:</span>
                  <span className="font-semibold text-foreground text-right max-w-sm">
                    IT HUB Computer &amp; Laptop Service Center, AM Road, Kothamangalam — 686691
                  </span>
                </div>
              )}

              {isDoorstep && (
                <>
                  <div className="flex justify-between border-b border-border/80 pb-3">
                    <span className="text-muted-foreground font-medium">
                      Doorstep Visit Address:
                    </span>
                    <span className="font-semibold text-foreground text-right max-w-sm">
                      {details.houseBuilding}, {details.streetLocality}, {details.placeTown}, PIN{" "}
                      {details.pincode}
                    </span>
                  </div>
                  {details.directions && (
                    <div className="flex justify-between border-b border-border/80 pb-3">
                      <span className="text-muted-foreground font-medium">
                        Landmark / Directions:
                      </span>
                      <span className="font-medium text-foreground text-right max-w-sm">
                        {details.directions}
                      </span>
                    </div>
                  )}
                </>
              )}

              {isCourier && (
                <>
                  <div className="flex justify-between border-b border-border/80 pb-3">
                    <span className="text-muted-foreground font-medium">
                      Customer Inbound Handover:
                    </span>
                    <span className="font-semibold text-foreground text-right max-w-sm">
                      Customer packages securely and ships to IT HUB central service workshop
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border/80 pb-3">
                    <span className="text-muted-foreground font-medium">
                      Central Service Workshop:
                    </span>
                    <span className="font-semibold text-foreground text-right max-w-sm">
                      IT HUB Computer &amp; Laptop Service Center, AM Road, Kothamangalam, Kerala —
                      686691
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border/80 pb-3">
                    <span className="text-muted-foreground font-medium">
                      Return Delivery Destination:
                    </span>
                    <span className="font-semibold text-foreground text-right max-w-sm">
                      {details.houseBuilding}, {details.streetLocality}, {details.placeTown}, PIN{" "}
                      {details.pincode}
                    </span>
                  </div>
                  {details.inboundCourierTrackingNo && (
                    <div className="flex justify-between border-b border-border/80 pb-3">
                      <span className="text-muted-foreground font-medium">
                        Recorded Inbound Consignment:
                      </span>
                      <span className="font-mono font-bold text-foreground text-right">
                        {details.inboundCourierTrackingNo}
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground font-medium">Diagnostic Assessment:</span>
                <span className="font-bold text-foreground text-right">
                  ₹{SERVICE_FEES.DIAGNOSTIC_ASSESSMENT} (Credited in full when repair proceeds)
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
              By submitting this request, you authorize IT HUB to perform diagnostic evaluation. No
              repair will be carried out without your explicit advance itemized quotation approval.
            </p>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-10 flex items-center justify-between gap-4 border-t border-border pt-6">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled={busy}
            className="!h-13 sm:!h-14 !px-6 sm:!px-8 !text-sm sm:!text-base font-semibold"
          >
            {safeStepIndex === 0 ? "Cancel" : "Back"}
          </Button>

          <Button
            onClick={next}
            disabled={busy}
            className="!h-13 sm:!h-14 !px-8 sm:!px-10 !text-sm sm:!text-base font-bold shadow-lg"
          >
            {busy ? "Submitting Booking..." : isLastStep ? "Submit Service Request" : "Continue"}
          </Button>
        </div>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SERVICE SUCCESS SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export function ServiceSuccess() {
  const { id } = useParams();
  const store = useStore();
  const request = resolveTicketByReferenceOrId(store.requests, id);

  return (
    <Page>
      <div className="mx-auto max-w-xl text-center py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-sm">
          <StatusMark status="done" size={40} strike={false} />
        </div>
        <h1 className="mt-4 text-3xl font-extrabold text-foreground">Service Request Booked!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your request ID is{" "}
          <strong className="font-mono text-primary text-base font-bold">{id}</strong>. Keep this
          code to track your device status.
        </p>

        {request && (
          <div className="mt-6 rounded-2xl border border-border bg-white p-6 text-left text-xs space-y-2.5 shadow-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Device / Model:</span>
              <span className="font-bold text-foreground">
                {request.device} {request.model ? `(${request.model})` : ""}
              </span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Reported Issue:</span>
              <span className="font-bold text-foreground">{request.problem}</span>
            </p>
            {request.customerDescription && (
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 text-xs text-slate-700">
                <span className="font-semibold text-slate-900 block mb-0.5">
                  Customer Observations:
                </span>
                <p className="italic">&ldquo;{request.customerDescription}&rdquo;</p>
              </div>
            )}
            <p className="flex justify-between">
              <span className="text-muted-foreground">Method:</span>
              <span className="font-bold text-foreground">{request.method}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Initial Status:</span>
              <span className="font-bold text-emerald-600">Booked & Queued</span>
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to={`/track-service/${encodeURIComponent(id || "")}`} className={buttonClass}>
            Track Status Now
          </Link>
          <Link to="/services" className={secondaryClass}>
            Back to Services
          </Link>
        </div>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SECURE SERVICE TRACKING PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function ServiceTracking() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const store = useStore();
  const [query, setQuery] = useState(id ? normalizeTicketReference(id) || id : "");
  const [isFetchingRemote, setIsFetchingRemote] = useState(false);
  const fetchedRef = useRef<string | null>(null);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedSlot, setRequestedSlot] = useState("10:00 – 12:00");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleSuccess, setRescheduleSuccess] = useState("");
  const [liveToast, setLiveToast] = useState<string | null>(null);

  // Auto-dismiss live update notification after 4s
  useEffect(() => {
    if (!liveToast) return;
    const t = setTimeout(() => setLiveToast(null), 4000);
    return () => clearTimeout(t);
  }, [liveToast]);

  // Sync query state when route parameter id changes
  useEffect(() => {
    if (id) {
      setQuery(normalizeTicketReference(id) || formatTicketReference(id) || id);
    } else {
      setQuery("");
    }
  }, [id]);

  // Resolve ticket using unified reference / UUID resolver
  const request = useMemo(() => {
    return resolveTicketByReferenceOrId(store.requests, id);
  }, [store.requests, id]);

  const guestTokenFromUrl = searchParams.get("token") || undefined;
  const effectiveGuestToken = guestTokenFromUrl || request?.guestToken;

  const loadTicket = useCallback(
    async (showLiveIndicator = false) => {
      if (!id) return;
      try {
        const fetched = await fetchServiceRequestById(id, effectiveGuestToken);
        if (fetched) {
          store.set((prev) => ({
            requests: upsertSingleServiceRequest(prev.requests, fetched),
          }));
          if (showLiveIndicator) {
            setLiveToast("Service information updated");
          }
        }
      } catch (err) {
        console.warn("[ServiceTracker] Error fetching ticket:", err);
      }
    },
    [id, effectiveGuestToken],
  );

  // Initial authoritative fetch from Supabase
  useEffect(() => {
    if (!id) return;
    setIsFetchingRemote(true);
    loadTicket(false).finally(() => setIsFetchingRemote(false));
  }, [id, loadTicket]);

  // Supabase Realtime subscription for active ticket
  useEffect(() => {
    if (!request?.id) return;
    const unsub = subscribeServiceTicket(request.id, (updated) => {
      store.set((prev) => ({
        requests: upsertSingleServiceRequest(prev.requests, updated),
      }));
      setLiveToast("Service information updated");
    });
    return () => unsub();
  }, [request?.id]);

  // Fallback reconciliation on visibility change, focus, and 25s polling
  useEffect(() => {
    if (!id) return;
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        loadTicket(false);
      }
    };

    document.addEventListener("visibilitychange", onFocusOrVisible);
    window.addEventListener("focus", onFocusOrVisible);

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadTicket(false);
      }
    }, 25000);

    return () => {
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.removeEventListener("focus", onFocusOrVisible);
      clearInterval(poll);
    };
  }, [id, loadTicket]);

  const isOwnerOrAdmin = useMemo(() => {
    return isUserTicketOwner(request, store.profile, {
      id: store.profile.id,
      email: store.profile.email,
      phone: store.profile.phone,
    });
  }, [request, store.profile]);

  const safeData: SafePublicTracking | null = useMemo(() => {
    if (!request) return null;
    return maskServiceRequestForPublicTracking(request, isOwnerOrAdmin, serviceStatuses);
  }, [request, isOwnerOrAdmin]);

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRescheduleError("");
    setRescheduleSuccess("");

    const validation = validateRequestedAppointmentDate(requestedDate);
    if (!validation.valid) {
      setRescheduleError(validation.error || "Please select a valid future date.");
      return;
    }

    if (!request?.id) {
      setRescheduleError("Ticket ID missing.");
      return;
    }

    setRescheduleSubmitting(true);
    try {
      const res = await requestAppointmentReschedule({
        ticketId: request.id,
        requestedDate,
        requestedSlot,
        reason: rescheduleReason.trim() || undefined,
      });

      if (!res.ok) {
        setRescheduleError(res.error || "Failed to submit reschedule request.");
        return;
      }

      setRescheduleSuccess("Your reschedule request has been submitted to our team for review.");
      const updated = await fetchServiceRequestById(request.id);
      if (updated) {
        store.set((prev) => ({
          requests: upsertSingleServiceRequest(prev.requests, updated),
        }));
      }
      setTimeout(() => {
        setRescheduleModalOpen(false);
        setRescheduleSuccess("");
      }, 2000);
    } catch (err: any) {
      setRescheduleError(err?.message || "An unexpected error occurred.");
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  return (
    <Page>
      {/* Back to Account Services link */}
      <div className="mb-4">
        <Link
          to="/account/services"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft size={14} /> Back to my service requests
        </Link>
      </div>

      <PageHeading
        title="Service Tracker & Status"
        description="Real-time workbench status, diagnostic quotes, and handover milestones."
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const clean = query.trim();
          if (clean) {
            const target = normalizeTicketReference(clean) || clean;
            navigate(`/track-service/${encodeURIComponent(target)}`);
          }
        }}
        className="mb-8 flex max-w-xl gap-3"
      >
        <input
          required
          aria-label="Service request reference or ID"
          placeholder={TRACKER_PLACEHOLDER}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`${fieldClass} font-mono text-xs`}
        />
        <Button type="submit">
          Track <Search size={16} />
        </Button>
      </form>

      {isFetchingRemote ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center text-xs text-muted-foreground shadow-sm">
          <Loading />
          <p className="mt-3 font-medium">Loading ticket details from workbench...</p>
        </div>
      ) : request && safeData ? (
        <>
          {liveToast && (
            <div
              role="status"
              aria-live="polite"
              className="mb-6 flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-semibold text-emerald-900 shadow-sm animate-in fade-in duration-300"
            >
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{liveToast}</span>
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
            <div className="rounded-2xl border border-border bg-white p-7 shadow-sm">
              <div className="mb-7 flex flex-wrap justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Ticket Reference
                  </span>
                  <h2 className="text-xl font-extrabold text-foreground font-mono">
                    {safeData.ticketReference || formatTicketReference(safeData.id)}
                  </h2>
                </div>
                <Badge>{safeData.statusLabel}</Badge>
              </div>
              <Timeline
                steps={
                  safeData.pipelineSteps && safeData.pipelineSteps.length > 0
                    ? safeData.pipelineSteps
                    : serviceStatuses
                }
                current={safeData.status}
                statusName={safeData.statusLabel}
                isCompleted={safeData.statusLabel === "Completed"}
                isCancelled={safeData.statusLabel === "Cancelled"}
              />
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <h2 className="text-base font-bold text-foreground">Service Information</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Current Status:
                    </span>
                    <Badge>{safeData.statusLabel}</Badge>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Device Type</dt>
                    <dd className="mt-1 font-semibold text-foreground">{safeData.device}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Brand &amp; Model</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {safeData.model || "Not specified"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Reported Issue</dt>
                    <dd className="mt-1 font-semibold text-foreground">{safeData.problem}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Service Method</dt>
                    <dd className="mt-1 font-semibold text-foreground">{safeData.method}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Booking Date</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {safeData.createdAt
                        ? new Date(safeData.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Recorded at intake"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Appointment Schedule</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {safeData.date
                        ? `${safeData.date} · ${safeData.time || "10:00 – 12:00"}`
                        : safeData.method.toLowerCase().includes("walk-in")
                          ? "Immediate Walk-In"
                          : "Direct Intake Handover"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Technician</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {safeData.technicianPublic}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Customer</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {safeData.customerMaskedName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Delivery / Service Area</dt>
                    <dd className="mt-1 font-semibold text-foreground">{safeData.maskedAddress}</dd>
                  </div>
                  {request?.paymentStatus && (
                    <div>
                      <dt className="text-muted-foreground">Payment Status</dt>
                      <dd
                        className={`mt-1 font-semibold ${
                          request.paymentStatus === "Paid" ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {request.paymentStatus}{" "}
                        {request.paidAmount
                          ? `(₹${request.paidAmount.toLocaleString("en-IN")})`
                          : ""}
                      </dd>
                    </div>
                  )}
                  {safeData.customerDescription && (
                    <div className="col-span-2 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-xs text-slate-800">
                      <span className="font-semibold text-slate-900 block mb-1">
                        Customer Description &amp; Observations:
                      </span>
                      <p className="leading-relaxed text-slate-700 italic">
                        &ldquo;{safeData.customerDescription}&rdquo;
                      </p>
                    </div>
                  )}
                  {request?.statusDescriptions?.[safeData.statusLabel || ""] && (
                    <div className="col-span-2 rounded-xl bg-blue-50/60 border border-blue-200/80 p-3 text-xs text-blue-950">
                      <span className="font-semibold text-blue-900 block mb-1">
                        Workbench Status Update:
                      </span>
                      <p className="leading-relaxed">
                        {request.statusDescriptions[safeData.statusLabel || ""]}
                      </p>
                    </div>
                  )}
                </dl>

                {/* On-Site Reschedule Status Banners & Action */}
                {isRescheduleEligible(safeData.method) && (
                  <div className="mt-5 space-y-3 pt-3 border-t border-border/70">
                    {/* Pending Review Banner */}
                    {safeData.rescheduleDetails?.status === "pending" && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950">
                        <div className="flex items-start gap-2.5">
                          <Calendar size={18} className="mt-0.5 text-amber-700 shrink-0" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-900 text-sm">
                                Reschedule Request Pending Review
                              </span>
                              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">
                                Pending Review
                              </span>
                            </div>
                            <p className="text-amber-800 leading-relaxed">
                              You requested a new appointment on{" "}
                              <strong>
                                {safeData.rescheduleDetails.requestedDate} (
                                {safeData.rescheduleDetails.requestedSlot})
                              </strong>
                              . Our service team is reviewing your preferred schedule.
                            </p>
                            <p className="text-[11px] text-amber-700">
                              Current confirmed appointment remains:{" "}
                              <strong>
                                {safeData.date || "Confirmed"} · {safeData.time || "10:00 – 12:00"}
                              </strong>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Approved Banner */}
                    {safeData.rescheduleDetails?.status === "approved" && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-950">
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 size={18} className="mt-0.5 text-emerald-700 shrink-0" />
                          <div className="space-y-1">
                            <span className="font-bold text-emerald-900 text-sm">
                              Appointment Rescheduled
                            </span>
                            <p className="text-emerald-800 leading-relaxed">
                              Your appointment schedule has been confirmed for{" "}
                              <strong>
                                {safeData.rescheduleDetails.approvedDate || safeData.date} (
                                {safeData.rescheduleDetails.approvedSlot || safeData.time})
                              </strong>
                              .
                            </p>
                            {safeData.rescheduleDetails.staffResponse && (
                              <p className="text-[11px] text-emerald-700 italic">
                                Staff note: "{safeData.rescheduleDetails.staffResponse}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rejected Notice */}
                    {safeData.rescheduleDetails?.status === "rejected" && (
                      <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-xs text-red-950">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle size={18} className="mt-0.5 text-red-700 shrink-0" />
                          <div className="space-y-1">
                            <span className="font-bold text-red-900 text-sm">
                              Reschedule Request Not Approved
                            </span>
                            <p className="text-red-800 leading-relaxed">
                              Your requested appointment slot could not be accommodated. Your
                              original appointment on{" "}
                              <strong>
                                {safeData.date || "Confirmed"} · {safeData.time || "10:00 – 12:00"}
                              </strong>{" "}
                              remains active.
                            </p>
                            {safeData.rescheduleDetails.staffResponse && (
                              <p className="text-[11px] text-red-700 italic">
                                Reason from desk: "{safeData.rescheduleDetails.staffResponse}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Request Reschedule Trigger Button (Only when all 5 conditions met) */}
                    {shouldDisplayRescheduleButton(request || safeData) && (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-bold text-indigo-950">
                            Need a different appointment time?
                          </span>
                          <p className="text-indigo-800 text-[11px]">
                            Current confirmed appointment:{" "}
                            <strong>
                              {safeData.date || "Scheduled"} · {safeData.time || "10:00 – 12:00"}
                            </strong>
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setRequestedDate("");
                            setRequestedSlot("10:00 – 12:00");
                            setRescheduleReason("");
                            setRescheduleError("");
                            setRescheduleSuccess("");
                            setRescheduleModalOpen(true);
                          }}
                          className="shrink-0 font-bold"
                        >
                          <Calendar size={14} /> Request Reschedule
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {!safeData.isOwnerOrAdmin && (
                  <p className="mt-4 rounded-lg bg-secondary/70 p-2.5 text-[11px] text-muted-foreground">
                    <Lock size={12} className="inline mr-1 text-primary" /> Customer personal
                    details, invoices, and direct approvals require signing in as the ticket owner.
                  </p>
                )}
              </div>

              {/* Quotation & Diagnosis Approval Panel */}
              <QuotationApprovalPanel request={request} safeData={safeData} />
            </div>
          </div>
        </>
      ) : (
        <Empty
          title={id ? "Service request not found" : "No device left behind."}
          description={
            id
              ? "Check your request ID or find it in your account."
              : "Book a service to track its progress here."
          }
          to={store.requests.length ? "/account/services" : "/services/book"}
          label={store.requests.length ? "View my requests" : "Book a service"}
        />
      )}

      {/* Reschedule Request Modal */}
      {rescheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Request a New Appointment</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {
                    "Need a different appointment time? Submit a request and our team will review your preferred schedule."
                  }
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {rescheduleSuccess ? (
              <div className="my-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
                <p className="font-bold text-emerald-950 text-sm">{rescheduleSuccess}</p>
                <p className="text-xs text-emerald-800 mt-1">
                  Your current appointment remains active until our staff confirms the new schedule.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRescheduleSubmit} className="mt-4 space-y-4">
                {rescheduleError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
                    <span>{rescheduleError}</span>
                  </div>
                )}

                {/* Current Confirmed Appointment Summary */}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5 text-xs text-indigo-950 space-y-1">
                  <span className="font-semibold text-indigo-900 block text-[11px] uppercase tracking-wider">
                    Current confirmed appointment
                  </span>
                  <div className="font-bold text-sm">
                    {safeData?.date || "Scheduled"} · {safeData?.time || "10:00 – 12:00"}
                  </div>
                  <p className="text-[11px] text-indigo-700">
                    Service Method: {safeData?.method || "On-site Technician Visit"}
                  </p>
                </div>

                {/* Requested Date */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Requested appointment date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                    value={requestedDate}
                    onChange={(e) => setRequestedDate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Please select Monday through Saturday. Sunday service is not available.
                  </p>
                </div>

                {/* Requested Time Slot */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Preferred time slot <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={requestedSlot}
                    onChange={(e) => setRequestedSlot(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  >
                    {ALLOWED_TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Reason for rescheduling{" "}
                    <span className="text-[10px] text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Schedule conflict, traveling, need later in the afternoon..."
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border/80">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setRescheduleModalOpen(false)}
                    disabled={rescheduleSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={rescheduleSubmitting || !requestedDate}
                  >
                    {rescheduleSubmitting ? "Submitting..." : "Submit Request"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
