import { useEffect, useMemo, useState } from "react";
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
  ClipboardCheck,
  PackageCheck,
  Printer,
  AppWindow,
  Code2,
  AlertCircle,
  Info,
  Clock,
  ChevronDown,
  Lock,
  Layers,
  Check,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  PhoneCall,
  RotateCcw,
} from "lucide-react";
import WhatsAppIcon from "../components/WhatsAppIcon";
import OurServices from "../components/OurServices";
import { useStore } from "../app/store";
import { track } from "../lib/analytics";
import {
  serviceTypes,
  problemsFor,
  serviceStatuses,
  serviceCatalogItems,
  serviceWarrantyPolicy,
  repairEstimates,
  money,
  type ServiceCatalogItem,
  type ServiceRequest,
} from "../data/catalog";
import {
  createServiceBooking,
  updateServiceQuoteDecision,
  maskServiceRequestForPublicTracking,
  checkServiceCoverage,
  isUserTicketOwner,
  fetchServiceRequestById,
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. MAIN SERVICES LANDING PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function Services() {
  const store = useStore();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);

  // Estimator State
  const [estimatorDevice, setEstimatorDevice] = useState<string>("Laptop");
  const availableProblems = useMemo(() => problemsFor(estimatorDevice), [estimatorDevice]);
  const [estimatorIssue, setEstimatorIssue] = useState<string>("Screen issue");
  const [estimatorDelivery, setEstimatorDelivery] = useState<"walkin" | "courier" | "onsite">(
    "walkin",
  );

  // Update issue when device changes if needed
  useEffect(() => {
    if (!availableProblems.includes(estimatorIssue)) {
      setEstimatorIssue(availableProblems[0] || "Screen issue");
    }
  }, [availableProblems, estimatorIssue]);

  // Lookup matching estimate rule
  const matchedEstimate = useMemo(() => {
    const match = repairEstimates.find(
      (e) =>
        e.device.toLowerCase() === estimatorDevice.toLowerCase() &&
        e.issue.toLowerCase() === estimatorIssue.toLowerCase(),
    );
    if (match) return match;

    // Default fallback calculation if no exact combination exists
    return {
      device: estimatorDevice,
      issue: estimatorIssue,
      diagnosticFee: 299,
      labourMin: 400,
      labourMax: 700,
      partsMin: 800,
      partsMax: 2500,
      turnaround: "24–48 hrs",
      notes: "Quotation provided after workbench diagnostic assessment.",
    };
  }, [estimatorDevice, estimatorIssue]);

  const deliveryCost =
    estimatorDelivery === "courier" ? 150 : estimatorDelivery === "onsite" ? 250 : 0;
  const estimatedMinTotal = matchedEstimate.labourMin + matchedEstimate.partsMin + deliveryCost;
  const estimatedMaxTotal = matchedEstimate.labourMax + matchedEstimate.partsMax + deliveryCost;

  // Service Coverage State
  const [coveragePin, setCoveragePin] = useState<string>("686691");
  const coverageResult = useMemo(
    () => checkServiceCoverage(coveragePin, store.locations),
    [coveragePin, store.locations],
  );

  // Live Quick Tracker State
  const [trackQuery, setTrackQuery] = useState<string>("");
  const [searchedId, setSearchedId] = useState<string>("");
  const [isSearchingRemote, setIsSearchingRemote] = useState<boolean>(false);

  const matchedRequest = useMemo(() => {
    if (!searchedId.trim()) return null;
    const q = searchedId.trim().toUpperCase();
    return store.requests.find((r) => r.id.toUpperCase() === q || r.id.toUpperCase().includes(q));
  }, [searchedId, store.requests]);

  // Async fallback: fetch from Supabase if not found in local cache
  useEffect(() => {
    const cleanId = searchedId.trim();
    if (cleanId && !matchedRequest && !isSearchingRemote) {
      setIsSearchingRemote(true);
      fetchServiceRequestById(cleanId)
        .then((fetched) => {
          if (fetched) {
            store.set((prev) => {
              if (prev.requests.some((r) => r.id === fetched.id)) return prev;
              return { requests: [...prev.requests, fetched] };
            });
          }
        })
        .finally(() => setIsSearchingRemote(false));
    }
  }, [searchedId, matchedRequest, isSearchingRemote]);

  const safeTrackData: SafePublicTracking | null = useMemo(() => {
    if (!matchedRequest) return null;
    const isOwner = isUserTicketOwner(matchedRequest, store.profile, {
      id: store.profile.id,
      email: store.profile.email,
      phone: store.profile.phone,
    });
    return maskServiceRequestForPublicTracking(matchedRequest, isOwner, serviceStatuses);
  }, [matchedRequest, store.profile]);

  // Filter Catalog Items
  const filteredCatalog = useMemo(() => {
    if (selectedCategory === "all") return serviceCatalogItems;
    return serviceCatalogItems.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  // Safe WhatsApp prefill link
  const safeWhatsappLink = useMemo(() => {
    const text = `Hello IT HUB, I would like an initial repair estimate:\n• Device: ${estimatorDevice}\n• Issue: ${estimatorIssue}\n• Preferred Mode: ${
      estimatorDelivery === "walkin"
        ? "Store Walk-in (Kothamangalam)"
        : estimatorDelivery === "courier"
          ? "Insured Courier Pickup"
          : "Doorstep Technician Visit"
    }\n\nI am attaching photos/videos of the device issue for preliminary assessment.`;
    return `https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(text)}`;
  }, [estimatorDevice, estimatorIssue, estimatorDelivery, store.settings.whatsapp]);

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

      {/* Interactive Service Catalog */}
      <section className="mt-16">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">
              Hardware & Software Solutions
            </span>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Professional Repair Catalog & Starting Rates
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Transparent baseline pricing, diagnostics policies, and turnaround estimates.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Services" },
              { id: "laptop", label: "Laptop" },
              { id: "mobile", label: "Mobile" },
              { id: "pc", label: "PC & Desktop" },
              { id: "printer", label: "Printer" },
              { id: "software", label: "Software & Data" },
              { id: "onsite", label: "On-Site Doorstep" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  selectedCategory === cat.id
                    ? "bg-primary text-white shadow-sm"
                    : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Grid */}
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCatalog.map((service) => (
            <div
              key={service.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-block rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary uppercase tracking-wide">
                    {service.category}
                  </span>
                  {service.popular && (
                    <Badge tone="green">
                      <Sparkles size={11} className="mr-1 inline" /> Popular
                    </Badge>
                  )}
                </div>

                <h3 className="mt-3 text-lg font-bold text-foreground">{service.name}</h3>
                <p className="mt-1 text-xs font-medium text-primary/80">{service.tagline}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {service.description}
                </p>

                {/* Pricing & Commercial Structure */}
                <div className="mt-4 rounded-xl border border-border/80 bg-secondary/40 p-3.5 text-xs">
                  <div className="flex items-baseline justify-between border-b border-border/60 pb-2">
                    <span className="font-semibold text-muted-foreground">Starting From</span>
                    <span className="text-base font-extrabold text-foreground">
                      {money(service.startingTotal)}*
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1.5 text-[11px] text-muted-foreground">
                    <p className="flex justify-between">
                      <span>Inspection Fee:</span>
                      <span className="font-medium text-foreground">
                        {service.diagnosticFee > 0
                          ? `${money(service.diagnosticFee)} (waived on repair)`
                          : "Free Bench Check"}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span>Est. Labour:</span>
                      <span className="font-medium text-foreground">
                        {money(service.labourRange[0])} – {money(service.labourRange[1])}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span>Turnaround:</span>
                      <span className="font-medium text-foreground">
                        {service.turnaroundEstimate}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Common Symptoms Checklist */}
                <div className="mt-4">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Common Symptoms:
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {service.commonSymptoms.map((sym, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <Check size={13} className="shrink-0 text-emerald-600" />
                        <span>{sym}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="mt-6 border-t border-border/70 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {service.warrantyText}
                  </span>
                  <Link
                    to={`/services/book?service=${encodeURIComponent(
                      service.name,
                    )}&device=${encodeURIComponent(
                      service.category === "laptop"
                        ? "Laptop"
                        : service.category === "mobile"
                          ? "Mobile"
                          : service.category === "pc"
                            ? "Desktop"
                            : service.category === "printer"
                              ? "Printer"
                              : "Laptop",
                    )}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 shrink-0"
                  >
                    Book Service <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Realistic Repair Cost Estimator */}
      <section className="mt-16 rounded-[2rem] border border-primary/20 bg-gradient-to-b from-white via-white to-secondary/30 p-7 shadow-sm md:p-10">
        <div className="flex flex-col justify-between gap-3 border-b border-border/80 pb-6 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wrench size={18} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">
                Commercial Estimator
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
              Instant Repair Cost & Timeline Estimator
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ballpark estimates separating diagnostic fees, labour, parts, and courier logistics.
            </p>
          </div>
          <Badge tone="amber">
            <Info size={12} className="mr-1 inline" /> Indicative Estimate
          </Badge>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          {/* Estimator Controls */}
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-foreground">
                1. Select Device Type:
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { id: "Laptop", Icon: Laptop },
                  { id: "Mobile", Icon: Smartphone },
                  { id: "Desktop", Icon: Monitor },
                  { id: "Printer", Icon: Printer },
                ].map(({ id, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setEstimatorDevice(id)}
                    className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold transition ${
                      estimatorDevice === id
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-white text-muted-foreground hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    <Icon size={16} />
                    <span>{id}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground">
                2. Select Observed Issue:
              </label>
              <select
                value={estimatorIssue}
                onChange={(e) => setEstimatorIssue(e.target.value)}
                className={`${fieldClass} mt-2 text-xs`}
              >
                {availableProblems.map((prob) => (
                  <option key={prob} value={prob}>
                    {prob}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground">
                3. Service Delivery Method:
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {[
                  {
                    id: "walkin",
                    title: "Store Walk-in",
                    fee: "Free",
                    note: "IT HUB Kothamangalam",
                  },
                  {
                    id: "courier",
                    title: "Insured Courier",
                    fee: "₹150 return",
                    note: "All 14 Kerala Districts",
                  },
                  {
                    id: "onsite",
                    title: "Doorstep On-Site",
                    fee: "₹250",
                    note: "Within ~15km radius",
                  },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setEstimatorDelivery(m.id as any)}
                    className={`rounded-xl border p-3 text-left transition ${
                      estimatorDelivery === m.id
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-white text-muted-foreground hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    <p className="text-xs font-bold">{m.title}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-foreground">{m.fee}</p>
                    <p className="text-[10px] text-muted-foreground">{m.note}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Estimate Breakdown Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div>
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Indicative Cost Breakdown
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  Est. {matchedEstimate.turnaround}
                </span>
              </div>

              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bench Diagnostic Fee:</span>
                  <span className="font-semibold text-foreground">
                    {matchedEstimate.diagnosticFee > 0
                      ? `${money(matchedEstimate.diagnosticFee)}*`
                      : "₹0 (Included)"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Labour:</span>
                  <span className="font-semibold text-foreground">
                    {money(matchedEstimate.labourMin)} – {money(matchedEstimate.labourMax)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Indicative Parts Range:</span>
                  <span className="font-semibold text-foreground">
                    {matchedEstimate.partsMin > 0
                      ? `${money(matchedEstimate.partsMin)} – ${money(matchedEstimate.partsMax)}`
                      : "No hardware required"}
                  </span>
                </div>

                {deliveryCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Logistics Charge (
                      {estimatorDelivery === "courier" ? "Courier Return" : "Doorstep Visit"}
                      ):
                    </span>
                    <span className="font-semibold text-foreground">{money(deliveryCost)}</span>
                  </div>
                )}

                <div className="border-t border-border/80 pt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-foreground">Estimated Total:</span>
                    <span className="text-xl font-extrabold text-primary">
                      {money(estimatedMinTotal)} – {money(estimatedMaxTotal)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    * Diagnostic fee is credited in full against total invoice when repair proceeds.
                  </p>
                </div>
              </div>

              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                <strong>Notice:</strong> This is a ballpark range. Fixed pricing and exact part
                availability are confirmed following physical bench diagnosis.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                to={`/services/book?service=${encodeURIComponent(
                  `${estimatorDevice} Repair`,
                )}&device=${encodeURIComponent(estimatorDevice)}`}
                className={`${buttonClass} flex-1 text-center justify-center text-xs`}
              >
                Proceed to Booking <ArrowRight size={14} />
              </Link>
              <a
                href={safeWhatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                <WhatsAppIcon size={14} /> WhatsApp Quote
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Safe WhatsApp Diagnostics Card */}
      <section className="mt-12 overflow-hidden rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-50/70 via-white to-emerald-50/30 p-6 md:p-8">
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

      {/* Accurate Kerala Service Coverage Checker */}
      <section className="mt-14 rounded-2xl border border-border bg-card p-7 md:p-10 shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPin size={18} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">
                Service Delivery Radius
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
              Kerala Service Coverage Checker
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your PIN code to check exact doorstep vs. courier service eligibility.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Hub Location: <strong>Kothamangalam, Kerala</strong>
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <label className="block text-xs font-bold text-foreground">
              Enter 6-Digit Indian PIN Code:
            </label>
            <div className="mt-2 flex gap-2">
              <input
                value={coveragePin}
                onChange={(e) => setCoveragePin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="e.g. 686691"
                className={`${fieldClass} text-xs font-semibold`}
              />
              <Button variant="secondary" onClick={() => setCoveragePin(coveragePin.trim())}>
                Check
              </Button>
            </div>

            {/* Real-time Coverage Feedback */}
            <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-4 text-xs">
              <p className="font-semibold text-foreground">Coverage Status:</p>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">
                {coverageResult.message}
              </p>
            </div>
          </div>

          {/* Distinct Delivery Tiers */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-white p-4 text-xs">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <Wrench size={16} />
              </div>
              <h4 className="font-bold text-foreground">Store Walk-In</h4>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Direct drop-off at IT HUB Kothamangalam. No logistics fee. Open Mon–Sat 9AM–7:30PM.
              </p>
              <span className="mt-3 inline-block rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                All Customers
              </span>
            </div>

            <div className="rounded-xl border border-border bg-white p-4 text-xs">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <Truck size={16} />
              </div>
              <h4 className="font-bold text-foreground">Insured Courier</h4>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Available across all 14 Kerala districts. We return serviced devices via insured
                courier.
              </p>
              <span className="mt-3 inline-block rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                Whole Kerala
              </span>
            </div>

            <div className="rounded-xl border border-border bg-white p-4 text-xs">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <MapPin size={16} />
              </div>
              <h4 className="font-bold text-foreground">Doorstep Visit</h4>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Certified technician on-site visit for PCs, Wi-Fi and setup within local ~15km
                radius.
              </p>
              <span className="mt-3 inline-block rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Local Radius Only
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Embedded Secure Live Ticket Quick-Tracker Widget */}
      <section className="mt-14 rounded-2xl border border-border bg-card p-7 md:p-10 shadow-sm">
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
                    <Timeline steps={serviceStatuses} current={safeTrackData.status} />
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
  const COURIER_CHARGE_PER_LEG = 150;
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const chosen = params.get("service") || "Laptop Repair";
  const presetDevice = params.get("device");
  const [step, setStep] = useState(0);

  useEffect(() => track("Service Booking Started", { service: chosen }), [chosen]);

  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState({
    device:
      presetDevice ||
      (chosen.includes("Mobile")
        ? "Mobile"
        : chosen.includes("PC") || chosen.includes("Desktop")
          ? "Desktop"
          : chosen.includes("Printer")
            ? "Printer"
            : "Laptop"),
    model: "",
    problem: chosen.includes("Recovery")
      ? "Data recovery"
      : presetDevice === "Printer" || chosen.includes("Printer")
        ? "Not printing"
        : "Screen issue",
    notes: "",
    method: params.get("method")?.includes("On-site") ? "On-site service" : "Visit IT HUB",
    name: store.profile.name,
    email: store.profile.email,
    address: store.profile.address,
    date: "",
    time: "10:00 – 12:00",
  });

  const update = (key: string, value: string) => setDetails({ ...details, [key]: value });

  const steps = ["Device", "Problem", "Service method", "Your details", "Date & time", "Confirm"];

  const next = async () => {
    if (step < 5) {
      setStep(step + 1);
      return;
    }

    setBusy(true);

    const isCourier = details.method === "Courier to IT HUB";
    const currentUserId = (store.profile as any)?.id || undefined;

    const { id } = await createServiceBooking(details, currentUserId);

    const request = {
      ...details,
      id,
      status: 0,
      quote: details.problem === "Screen issue" ? 2850 : 1500,
      quoteState: "pending" as const,
      technician: "IT HUB Bench Specialist",
      ...(isCourier && {
        courierCharge: {
          returnDelivery: COURIER_CHARGE_PER_LEG,
        },
      }),
    };

    track("Service Request Created", {
      request: id,
      device: details.device,
      problem: details.problem,
    });

    store.set((previous) => ({
      requests: [request, ...previous.requests],
      notifications: [`Service request ${id} created`, ...previous.notifications],
    }));

    store.log(`Service request ${id} submitted`);
    store.notify("Service request submitted successfully");
    navigate(`/service-success/${id}`);
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

  return (
    <Page>
      <PageHeading
        title="Book a repair or maintenance"
        description="Transparent diagnostics, genuine parts, and tracking from intake to return."
      />

      <div className="mx-auto max-w-2xl">
        {/* Step Progress Pills */}
        <div className="mb-8 flex justify-between gap-1 border-b border-border pb-4">
          {steps.map((label, idx) => (
            <div
              key={label}
              className={`flex items-center gap-1.5 text-xs font-semibold ${
                idx === step
                  ? "text-primary"
                  : idx < step
                    ? "text-emerald-600"
                    : "text-muted-foreground/60"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  idx === step
                    ? "bg-primary text-white"
                    : idx < step
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {idx < step ? "✓" : idx + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>

        {/* Step 0: Device Selection */}
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Select Device Type</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { id: "Laptop", Icon: Laptop },
                { id: "Mobile", Icon: Smartphone },
                { id: "Desktop", Icon: Monitor },
                { id: "Printer", Icon: Printer },
              ].map(({ id, Icon }) => (
                <button
                  key={id}
                  onClick={() => update("device", id)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition ${
                    details.device === id
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-white text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <Icon size={24} />
                  <span className="text-xs font-bold text-foreground">{id}</span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-foreground">
                Device Brand & Model Number (optional but recommended):
              </label>
              <input
                value={details.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="e.g. Dell Inspiron 15 3511, HP Pavilion Gaming, iPhone 13"
                className={`${fieldClass} mt-1.5 text-xs`}
              />
            </div>
          </div>
        )}

        {/* Step 1: Problem Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">What issue are you facing?</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {problemsFor(details.device).map((prob) => (
                <button
                  key={prob}
                  onClick={() => update("problem", prob)}
                  className={`rounded-xl border p-3.5 text-left text-xs font-semibold transition ${
                    details.problem === prob
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-white text-muted-foreground hover:border-primary/50 hover:text-primary"
                  }`}
                >
                  {prob}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-foreground">
                Additional observations or error messages:
              </label>
              <textarea
                value={details.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="e.g. Device fell down yesterday, display is flickering when moved, power adapter light blinks..."
                className={`${fieldClass} mt-1.5 text-xs`}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 2: Service Method */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Select Service Method</h3>
            <div className="space-y-3">
              {[
                {
                  id: "Visit IT HUB",
                  title: "Direct Store Walk-In (Kothamangalam)",
                  description:
                    "Bring your device to IT HUB Kothamangalam. Immediate intake receipt, free initial visual check, diagnostic fee credited on repair.",
                  charge: "No logistics charge",
                  Icon: Wrench,
                },
                {
                  id: "Courier to IT HUB",
                  title: "Insured Courier Pickup & Return",
                  description:
                    "Available across all Kerala districts. Pack securely; we arrange pickup and return delivery post-service.",
                  charge: `₹${COURIER_CHARGE_PER_LEG} return delivery fee`,
                  Icon: Truck,
                },
                {
                  id: "On-site service",
                  title: "Doorstep Technician Visit",
                  description:
                    "Certified technician visits your home/office within ~15 km of Kothamangalam for PC & network setup.",
                  charge: "₹250 doorstep callout",
                  Icon: MapPin,
                },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => update("method", m.id)}
                  className={`flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition ${
                    details.method === m.id
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-white text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <m.Icon size={22} className="mt-0.5 shrink-0 text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground">{m.title}</p>
                      <span className="text-xs font-semibold text-primary">{m.charge}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {m.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Contact Details */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Customer Contact Details</h3>
            <div>
              <label className="block text-xs font-bold text-foreground">Your Full Name:</label>
              <input
                value={details.name}
                onChange={(e) => update("name", e.target.value)}
                className={`${fieldClass} mt-1.5 text-xs`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground">Email Address:</label>
              <input
                type="email"
                value={details.email}
                onChange={(e) => update("email", e.target.value)}
                className={`${fieldClass} mt-1.5 text-xs`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground">
                Pickup / Service Address with PIN Code:
              </label>
              <textarea
                value={details.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder="House / building name, road, town, Kerala PIN code"
                className={`${fieldClass} mt-1.5 text-xs`}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 4: Preferred Date & Time */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Preferred Appointment / Handover</h3>
            <div>
              <label className="block text-xs font-bold text-foreground">Preferred Date:</label>
              <input
                type="date"
                value={details.date}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => update("date", e.target.value)}
                className={`${fieldClass} mt-1.5 text-xs`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground">
                Preferred Time Slot:
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  "10:00 – 12:00",
                  "12:00 – 14:00",
                  "14:00 – 16:00",
                  "16:00 – 18:00",
                  "18:00 – 19:30",
                ].map((slot) => (
                  <button
                    key={slot}
                    onClick={() => update("time", slot)}
                    className={`rounded-xl border p-3 text-center text-xs font-semibold transition ${
                      details.time === slot
                        ? "border-primary bg-primary text-white shadow-sm"
                        : "border-border bg-white text-muted-foreground hover:border-primary"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Order Review & Confirmation */}
        {step === 5 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Confirm Service Request</h3>
            <div className="rounded-2xl border border-border bg-white p-5 space-y-3 text-xs">
              <div className="flex justify-between border-b border-border/80 pb-2">
                <span className="text-muted-foreground">Device:</span>
                <span className="font-bold text-foreground">
                  {details.device} {details.model ? `(${details.model})` : ""}
                </span>
              </div>
              <div className="flex justify-between border-b border-border/80 pb-2">
                <span className="text-muted-foreground">Reported Issue:</span>
                <span className="font-bold text-foreground">{details.problem}</span>
              </div>
              <div className="flex justify-between border-b border-border/80 pb-2">
                <span className="text-muted-foreground">Delivery Mode:</span>
                <span className="font-bold text-foreground">{details.method}</span>
              </div>
              <div className="flex justify-between border-b border-border/80 pb-2">
                <span className="text-muted-foreground">Appointment:</span>
                <span className="font-bold text-foreground">
                  {details.date ? details.date : "Earliest Available"} · {details.time}
                </span>
              </div>
              <div className="flex justify-between border-b border-border/80 pb-2">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-bold text-foreground">
                  {details.name} ({details.email})
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Initial Diagnostic Deposit:</span>
                <span className="font-bold text-foreground">
                  ₹299 (Credited in full when repair proceeds)
                </span>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              By submitting this request, you authorize IT HUB to perform bench diagnostics. No
              repair will be carried out without your advance quotation approval.
            </p>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-8 flex justify-between gap-3 border-t border-border pt-4">
          <Button
            variant="secondary"
            onClick={() => (step > 0 ? setStep(step - 1) : navigate("/services"))}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          <Button onClick={next} disabled={busy}>
            {busy ? "Submitting..." : step === 5 ? "Submit Service Request" : "Continue"}
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
  const request = store.requests.find((item) => item.id === id);

  return (
    <Page>
      <div className="mx-auto max-w-xl text-center py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
          <CheckCircle2 size={36} />
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
              <span className="text-muted-foreground">Device:</span>
              <span className="font-bold text-foreground">{request.device}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Reported Issue:</span>
              <span className="font-bold text-foreground">{request.problem}</span>
            </p>
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
  const navigate = useNavigate();
  const store = useStore();
  const [query, setQuery] = useState(id || "");
  const [isFetchingRemote, setIsFetchingRemote] = useState(false);

  const request = store.requests.find((item) => item.id === id);

  // Fetch from Supabase if not in local store cache
  useEffect(() => {
    if (id && !request && !isFetchingRemote) {
      setIsFetchingRemote(true);
      fetchServiceRequestById(id)
        .then((fetched) => {
          if (fetched) {
            store.set((prev) => {
              if (prev.requests.some((r) => r.id === fetched.id)) return prev;
              return { requests: [...prev.requests, fetched] };
            });
          }
        })
        .finally(() => setIsFetchingRemote(false));
    }
  }, [id, request, isFetchingRemote]);

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

  return (
    <Page>
      <PageHeading
        title="Service Tracker & Status"
        description="Real-time workbench status, diagnostic quotes, and handover milestones."
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          navigate(`/track-service/${encodeURIComponent(query.trim())}`);
        }}
        className="mb-8 flex max-w-xl gap-3"
      >
        <input
          required
          aria-label="Service request ID"
          placeholder="Enter your service request ID (e.g. SRV-XXXXXXX)"
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
        <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-2xl border border-border bg-white p-7 shadow-sm">
            <div className="mb-7 flex flex-wrap justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Ticket ID
                </span>
                <h2 className="text-xl font-extrabold text-foreground">{safeData.id}</h2>
              </div>
              <Badge>{safeData.statusLabel}</Badge>
            </div>
            <Timeline steps={serviceStatuses} current={safeData.status} />
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
              <h2 className="mb-5 text-base font-bold text-foreground">Service Overview</h2>
              <dl className="grid grid-cols-2 gap-5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Device / Model</dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {safeData.device} {safeData.model ? `(${safeData.model})` : ""}
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
              </dl>

              {!safeData.isOwnerOrAdmin && (
                <p className="mt-4 rounded-lg bg-secondary/70 p-2.5 text-[11px] text-muted-foreground">
                  <Lock size={12} className="inline mr-1 text-primary" /> Customer personal details,
                  invoices, and direct approvals require signing in as the ticket owner.
                </p>
              )}
            </div>

            {/* Quotation & Diagnosis Approval Panel */}
            <QuotationApprovalPanel request={request} safeData={safeData} />
          </div>
        </div>
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
    </Page>
  );
}
