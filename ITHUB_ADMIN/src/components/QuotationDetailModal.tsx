// ITHUB_ADMIN/src/components/QuotationDetailModal.tsx
// One PC Builder quotation for staff (Stage 4S-5): the server's verdict and part records, the history, reviews and
// notes, and the actions the approved matrix allows this role from this state. Every action sends the version the
// screen was showing; the database refuses it if the quotation changed meanwhile, and decides every permission.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Cpu,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  History,
  StickyNote,
  UserCheck,
} from "lucide-react";
import type { StaffRole } from "../lib/auth";
import {
  type PcQuotationRecord,
  type QuotationHistory,
  type ReviewOutcome,
  type StaffActionResult,
  type TransitionOption,
  type AssignableStaff,
  REVIEWABLE_STATUSES,
  REVIEW_OUTCOME_LABELS,
  STATUS_LABELS,
  STAFF_ACTION_MESSAGES,
  addQuotationNote,
  allowedTransitions,
  archivedFrom,
  assignQuotation,
  escalationOpen,
  fetchAssignableStaff,
  fetchQuotationHistory,
  getQuotationById,
  recordQuotationReview,
  reviewGateMet,
  transitionQuotation,
} from "../lib/quotations";
import {
  ASSEMBLY_NOT_SET,
  BUILD_STATE_LABELS,
  LEGACY_NOTES_LABEL,
  NOT_RECORDED,
  REVIEW_REASON_LABEL,
  SLOT_CHECK_LABELS,
  SPEC_STATUS_LABELS,
  type QuotePart,
  type RecordedCheck,
  type ServerAssessmentRecord,
  readQuoteParts,
  readServerAssessment,
} from "../lib/quotation-records";

interface QuotationDetailModalProps {
  quotation: PcQuotationRecord;
  /** The signed-in staff member's role, from `get_staff_portal_profile`. Display only. */
  role: StaffRole | null;
  onClose: () => void;
  onUpdated: () => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const STATUS_BADGE: Record<string, string> = {
  New: "bg-blue-100 text-blue-800",
  Contacted: "bg-amber-100 text-amber-800",
  Quoted: "bg-purple-100 text-purple-800",
  Closed: "bg-emerald-100 text-emerald-800",
  Archived: "bg-slate-200 text-slate-700",
  Withdrawn: "bg-rose-100 text-rose-800",
};

const STATE_BADGE: Record<string, string> = {
  complete: "bg-emerald-100 text-emerald-800",
  needs_review: "bg-amber-100 text-amber-800",
  incomplete: "bg-orange-100 text-orange-800",
  incompatible: "bg-red-100 text-red-800",
  not_assessed: "bg-slate-200 text-slate-700",
};

const SPEC_BADGE: Record<string, string> = {
  verified: "bg-emerald-50 text-emerald-700",
  not_applicable: "bg-slate-100 text-slate-600",
  uncertain: "bg-amber-50 text-amber-700",
  incomplete: "bg-orange-50 text-orange-700",
  problem: "bg-red-50 text-red-700",
  unresolved: "bg-red-50 text-red-700",
};

const EVENT_LABELS: Record<string, string> = {
  submitted: "Submitted",
  withdrawn: "Withdrawn by the customer",
  status_changed: "Status changed",
  archived: "Archived",
  restored: "Restored from archive",
  review_recorded: "Review recorded",
  note_added: "Note added",
  assigned: "Assignment changed",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100";
const primaryButton =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

function Section({
  title,
  icon,
  children,
  testId,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 p-4" data-testid={testId}>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
        {icon}
        {title}
      </h3>
      <div className="mt-3 space-y-3 text-xs text-slate-700">{children}</div>
    </section>
  );
}

function CheckList({ title, checks }: { title: string; checks: RecordedCheck[] }) {
  if (!checks.length) return null;
  return (
    <div>
      <p className="font-semibold text-slate-900">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {checks.map((check, i) => (
          <li key={`${check.ruleId}-${i}`}>
            {check.label}{" "}
            <span className="font-mono text-[10px] text-slate-400">
              {check.ruleId}
              {check.slots.length ? ` · ${check.slots.join(", ")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServerVerdict({ record }: { record: ServerAssessmentRecord | null }) {
  if (!record) {
    return (
      <p className="text-slate-500" data-testid="verdict-not-recorded">
        {NOT_RECORDED}
      </p>
    );
  }
  const comparison = record.browserComparison;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="verdict-state"
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATE_BADGE[record.state] ?? "bg-slate-100 text-slate-700"}`}
        >
          {BUILD_STATE_LABELS[record.state] ?? record.state}
        </span>
        <span className="text-slate-500">
          Purpose:{" "}
          <strong className="text-slate-800">{record.purpose ?? "Expert Mode (none)"}</strong>
        </span>
        {record.compatibilityStatus && (
          <span className="text-slate-500">
            Compatibility: <strong className="text-slate-800">{record.compatibilityStatus}</strong>
          </span>
        )}
      </div>
      {record.unresolvedSlots?.length ? (
        <p>
          Specifications unresolved for: <strong>{record.unresolvedSlots.join(", ")}</strong>
        </p>
      ) : null}
      <CheckList title="Mismatches" checks={record.mismatches} />
      {record.gaps.length > 0 && (
        <div>
          <p className="font-semibold text-slate-900">Gaps</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {record.gaps.map((gap, i) => (
              <li key={`${gap.slot}-${i}`}>
                {gap.slot}: {gap.need === "missing" ? "missing" : "unconfirmed"} ({gap.reason})
              </li>
            ))}
          </ul>
        </div>
      )}
      <CheckList title="Review checks" checks={record.reviewChecks} />
      {record.reviewReasons.length > 0 && (
        <div>
          <p className="font-semibold text-slate-900">Why it needs review</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {record.reviewReasons.map((reason, i) => (
              <li key={i}>{REVIEW_REASON_LABEL(reason)}</li>
            ))}
          </ul>
        </div>
      )}
      <CheckList title="Advice (never changes the state)" checks={record.advice} />
      {record.ownedSlots.length > 0 && (
        <p>
          Customer's own parts: <strong>{record.ownedSlots.join(", ")}</strong>
        </p>
      )}
      {record.power && (
        <p>
          Power: about <strong>{record.power.estimatedSystemLoadWatts} W</strong> load; recommended
          PSU <strong>{record.power.recommendedPsuWatts} W</strong>
        </p>
      )}
      <div className="rounded-lg bg-slate-50 p-3" data-testid="browser-comparison">
        <p className="font-semibold text-slate-900">Customer's browser (for comparison only)</p>
        {!comparison.compared ? (
          <p className="mt-1 text-slate-500">Nothing to compare.</p>
        ) : comparison.agrees ? (
          <p className="mt-1 text-emerald-700">Agrees with the server.</p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-800">
            {comparison.differences.map((d, i) => (
              <li key={i}>
                {d.field}: browser said {String(d.browser)}, server found {String(d.server)}
              </li>
            ))}
            {comparison.errorRules.onlyServer.length > 0 && (
              <li>Only the server found: {comparison.errorRules.onlyServer.join(", ")}</li>
            )}
            {comparison.errorRules.onlyBrowser.length > 0 && (
              <li>Only the browser reported: {comparison.errorRules.onlyBrowser.join(", ")}</li>
            )}
          </ul>
        )}
      </div>
    </>
  );
}

function PartRow({ part }: { part: QuotePart }) {
  const specs = part.serverSpecs;
  return (
    <li className="space-y-1.5 p-3.5" data-testid="quotation-part">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
          {part.slot}
        </span>
        <span className="font-mono font-bold text-slate-900">
          {part.owned ? "—" : formatCurrency(part.price)}
        </span>
      </div>
      <p className="font-semibold leading-snug text-slate-800">{part.title || part.name}</p>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
          {part.owned ? "Customer's own" : `Buy × ${part.quantity ?? "not stated"}`}
        </span>
        {!part.owned && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
            Slot: {part.slotCheck ? SLOT_CHECK_LABELS[part.slotCheck] : "Not recorded"}
          </span>
        )}
        {!part.owned && (
          <span
            className={`rounded px-2 py-0.5 font-semibold ${specs ? SPEC_BADGE[specs.status] : "bg-slate-100 text-slate-600"}`}
          >
            Specs: {specs ? SPEC_STATUS_LABELS[specs.status] : "Not recorded"}
            {specs?.reason ? ` (${specs.reason})` : ""}
          </span>
        )}
        {part.reportedProductId && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800">
            Browser claimed product {part.reportedProductId}
          </span>
        )}
      </div>
      {specs && (
        <details className="rounded-lg bg-slate-50 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
            Specification details
          </summary>
          <div className="mt-2 space-y-2 overflow-x-auto">
            {specs.fields.length > 0 && (
              <table className="w-full text-left text-[11px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pr-3">Field</th>
                    <th className="pr-3">Value</th>
                    <th className="pr-3">Status</th>
                    <th className="pr-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {specs.fields.map((field) => (
                    <tr key={field.field}>
                      <td className="pr-3 font-mono">
                        {field.field}
                        {field.critical ? " *" : ""}
                      </td>
                      <td className="pr-3">{formatValue(field.value)}</td>
                      <td className="pr-3">{field.status}</td>
                      <td className="pr-3">
                        {field.origin ?? "—"}
                        {field.metafield ? ` (${field.metafield})` : ""} · {field.confidence}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {specs.missingCritical.length > 0 && <p>Missing: {specs.missingCritical.join(", ")}</p>}
            {specs.problems.length > 0 && (
              <ul className="list-disc pl-5">
                {specs.problems.map((problem, i) => (
                  <li key={i}>
                    {problem.kind === "conflict" ? "Conflicting" : problem.kind} {problem.field}:{" "}
                    {problem.detail}
                  </li>
                ))}
              </ul>
            )}
            {specs.unsupported.length > 0 && (
              <p>Not applicable to this part: {specs.unsupported.join(", ")}</p>
            )}
            {specs.browserDifferences?.length ? (
              <ul className="list-disc pl-5 text-amber-800">
                {specs.browserDifferences.map((d, i) => (
                  <li key={i}>
                    {d.field}: browser said {d.browser}, server found {formatValue(d.server)}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[10px] text-slate-400">* used by a recommendation label</p>
          </div>
        </details>
      )}
    </li>
  );
}

export function QuotationDetailModal({
  quotation: initial,
  role,
  onClose,
  onUpdated,
}: QuotationDetailModalProps) {
  const [quotation, setQuotation] = useState<PcQuotationRecord>(initial);
  const [history, setHistory] = useState<QuotationHistory>({ events: [], reviews: [], notes: [] });
  const [staff, setStaff] = useState<AssignableStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [stale, setStale] = useState(false);

  const [pending, setPending] = useState<TransitionOption | null>(null);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome | "">("");
  const [reviewNote, setReviewNote] = useState("");
  const [clearance, setClearance] = useState("");
  const [note, setNote] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    const [fresh, loaded] = await Promise.all([
      getQuotationById(initial.id),
      fetchQuotationHistory(initial.id),
    ]);
    if (fresh) setQuotation(fresh);
    setHistory(loaded);
    if (loaded.error) setMessage({ kind: "error", text: loaded.error });
    setStale(false);
    setLoading(false);
  }, [initial.id]);

  useEffect(() => {
    reload();
    fetchAssignableStaff().then(setStaff);
  }, [reload]);

  const isQuotationRole = role === "portal_admin" || role === "quotation_staff";
  const status = quotation.enquiry_status;
  const verdict = readServerAssessment(quotation.server_assessment);
  const parts = useMemo(() => readQuoteParts(quotation.parts), [quotation.parts]);
  const flagged = quotation.technician_review_required === true;
  const gateMet = reviewGateMet(history.reviews);
  const openEscalation = escalationOpen(history.reviews);
  const transitions = allowedTransitions(status, role, archivedFrom(history.events));
  const canReview = isQuotationRole && REVIEWABLE_STATUSES.includes(status);
  const clearingEscalation = outcome === "checked_suitable" && openEscalation;
  const names = useMemo(
    () => new Map(staff.map((member) => [member.user_id, member.full_name])),
    [staff],
  );
  const who = (id: string | null) => (id ? (names.get(id) ?? `${id.slice(0, 8)}…`) : "System");

  /** Runs an action; on success reloads, on a stale version offers a reload, otherwise shows the reason. */
  const act = async (run: () => Promise<StaffActionResult>, done: string, after?: () => void) => {
    setBusy(true);
    setMessage(null);
    const result = await run();
    setBusy(false);
    if (!result.ok) {
      setStale(result.code === "stale_version");
      setMessage({ kind: "error", text: result.message ?? STAFF_ACTION_MESSAGES.failed });
      return;
    }
    after?.();
    setMessage({ kind: "ok", text: done });
    await reload();
    onUpdated();
  };

  const confirmTransition = () =>
    pending &&
    act(
      () => transitionQuotation(quotation.id, pending.to, quotation.version, reason),
      `Status changed to ${STATUS_LABELS[pending.to]}.`,
      () => {
        setPending(null);
        setReason("");
      },
    );

  const submitReview = () =>
    outcome &&
    act(
      () =>
        recordQuotationReview(
          quotation.id,
          outcome,
          reviewNote,
          quotation.version,
          clearingEscalation ? clearance : null,
        ),
      "Review recorded.",
      () => {
        setOutcome("");
        setReviewNote("");
        setClearance("");
      },
    );

  const submitNote = () =>
    act(
      () => addQuotationNote(quotation.id, note, quotation.version),
      "Note added.",
      () => setNote(""),
    );

  const changeAssignee = (value: string) =>
    act(
      () => assignQuotation(quotation.id, value || null, quotation.version),
      value ? `Assigned to ${who(value)}.` : "Unassigned.",
    );

  const divergence = Math.round(Number(quotation.price_divergence) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-0 backdrop-blur-md sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Quotation ${quotation.reference_id ?? ""}`}
        data-testid="quotation-detail"
        className="relative flex h-full w-full flex-col overflow-hidden rounded-none border-0 border-slate-200/80 bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl sm:border"
      >
        {/* Header */}
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs sm:h-10 sm:w-10">
              <Cpu size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="font-mono text-xs font-bold text-slate-900 sm:text-sm">
                  {quotation.reference_id || "Unassigned Reference"}
                </span>
                <span
                  data-testid="quotation-status"
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider sm:text-[10px] ${STATUS_BADGE[status] ?? "bg-slate-100 text-slate-800"}`}
                >
                  {STATUS_LABELS[status] ?? status}
                </span>
                <span className="text-[10px] text-slate-400" data-testid="quotation-version">
                  v{quotation.version}
                </span>
              </div>
              <p className="mt-0.5 max-w-xs truncate text-[11px] text-slate-500 sm:text-xs">
                {quotation.name || "Custom PC Configuration"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
          {message && (
            <div
              role={message.kind === "error" ? "alert" : "status"}
              data-testid={message.kind === "error" ? "action-error" : "action-ok"}
              className={`flex flex-wrap items-center gap-2 rounded-lg p-3 text-xs ${
                message.kind === "error"
                  ? "bg-red-50 text-red-800"
                  : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {message.kind === "error" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              <span className="flex-1">{message.text}</span>
              {stale && (
                <button
                  type="button"
                  onClick={reload}
                  className={secondaryButton}
                  data-testid="reload"
                >
                  <RefreshCw size={13} /> Reload
                </button>
              )}
            </div>
          )}

          {flagged && (
            <div
              className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900"
              data-testid="review-flag"
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold">Technician review required</p>
                <p className="mt-0.5">
                  {gateMet
                    ? "A completed “Checked – Suitable” review is on record: this quotation can be Quoted."
                    : "It can't be Quoted until a “Checked – Suitable” review is recorded, with no open escalation."}
                </p>
                {divergence > 100 && (
                  <p className="mt-0.5">
                    The customer's estimate differs from live Shopify pricing by{" "}
                    {formatCurrency(divergence)}.
                  </p>
                )}
                {!quotation.authoritative_price && (
                  <p className="mt-0.5">Live Shopify pricing couldn't be verified.</p>
                )}
              </div>
            </div>
          )}

          {/* Prices */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Customer's estimate
              </p>
              <p className="mt-1 text-base font-extrabold text-slate-900">
                {formatCurrency(quotation.estimated_price)}
              </p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                Server price
              </p>
              <p className="mt-1 text-base font-extrabold text-blue-900">
                {quotation.authoritative_price
                  ? formatCurrency(quotation.authoritative_price)
                  : "Not verified"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Assembly
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800" data-testid="assembly">
                {ASSEMBLY_NOT_SET}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Submitted
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Calendar size={14} className="text-slate-400" />
                {formatWhen(quotation.created_at)}
              </p>
            </div>
          </div>

          {/* Customer */}
          <Section title="Customer contact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <span className="text-slate-500">Name:</span>
                <p className="mt-0.5 font-bold text-slate-900">
                  {quotation.customer_name || "Not provided"}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Verified phone:</span>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-bold text-slate-900">
                    {quotation.customer_phone || "Not provided"}
                  </span>
                  {quotation.customer_phone && (
                    <a
                      href={`https://wa.me/${quotation.customer_phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  )}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Email:</span>
                <p className="mt-0.5 font-bold text-slate-900">
                  {quotation.customer_email || "Not provided"}
                </p>
              </div>
            </div>
          </Section>

          {/* Server verdict */}
          <Section
            title="Server verdict"
            icon={<ShieldCheck size={14} className="text-blue-600" />}
            testId="server-verdict"
          >
            <ServerVerdict record={verdict} />
          </Section>

          {/* Parts */}
          <section className="overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Parts ({parts.length})
              </h3>
            </div>
            <ul className="divide-y divide-slate-100 text-xs">
              {parts.map((part, i) => (
                <PartRow key={`${part.slot}-${i}`} part={part} />
              ))}
            </ul>
          </section>

          {quotation.staff_notes ? (
            <Section title={LEGACY_NOTES_LABEL} testId="legacy-notes">
              <p className="whitespace-pre-wrap text-slate-600">{quotation.staff_notes}</p>
            </Section>
          ) : null}

          {/* Status */}
          <Section title="Status" testId="status-actions">
            {!isQuotationRole ? (
              <p className="text-slate-500">Your role can view this quotation but not change it.</p>
            ) : transitions.length === 0 ? (
              <p className="text-slate-500" data-testid="no-transitions">
                No status change is available to your role from {STATUS_LABELS[status] ?? status}.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {transitions.map((option) => {
                  const blocked = option.gated && flagged && !gateMet;
                  return (
                    <button
                      key={option.to}
                      type="button"
                      disabled={busy || loading}
                      data-testid={`transition-${option.to}`}
                      title={blocked ? STAFF_ACTION_MESSAGES.review_required : undefined}
                      onClick={() => {
                        setPending(option);
                        setReason("");
                        setMessage(null);
                      }}
                      className={`${secondaryButton} ${blocked ? "border-amber-300 text-amber-800" : ""}`}
                    >
                      {option.restore
                        ? `Restore to ${option.to}`
                        : `Move to ${STATUS_LABELS[option.to]}`}
                      {option.adminOnly ? " (admin)" : ""}
                    </button>
                  );
                })}
              </div>
            )}
            {pending && (
              <div
                className="space-y-2 rounded-lg bg-slate-50 p-3"
                data-testid="transition-confirm"
              >
                <p className="font-semibold text-slate-900">
                  {pending.restore ? "Restore" : "Move"} from {STATUS_LABELS[status]} to{" "}
                  {STATUS_LABELS[pending.to]}?
                </p>
                {pending.gated && flagged && !gateMet && (
                  <p className="text-amber-800">{STAFF_ACTION_MESSAGES.review_required}</p>
                )}
                <label className="block font-semibold text-slate-700">
                  {pending.reasonRequired ? "Reason (required)" : "Reason (optional)"}
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className={`${inputClass} mt-1`}
                    data-testid="transition-reason"
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setPending(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={busy || (pending.reasonRequired && reason.trim().length < 3)}
                    onClick={confirmTransition}
                    data-testid="transition-submit"
                  >
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : null} Confirm
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* Assignment */}
          <Section title="Assignment" icon={<UserCheck size={14} />} testId="assignment">
            <p>
              Assigned to:{" "}
              <strong data-testid="assignee">
                {quotation.assigned_staff_id ? who(quotation.assigned_staff_id) : "Nobody"}
              </strong>
            </p>
            {isQuotationRole && (
              <select
                aria-label="Assign to"
                value={quotation.assigned_staff_id ?? ""}
                disabled={busy || loading}
                onChange={(e) => changeAssignee(e.target.value)}
                className={`${inputClass} min-h-[44px] font-semibold`}
                data-testid="assign-select"
              >
                <option value="">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name} (
                    {member.role === "portal_admin" ? "Admin" : "Quotation staff"})
                  </option>
                ))}
              </select>
            )}
          </Section>

          {/* Reviews */}
          <Section title="Technician reviews" icon={<ShieldCheck size={14} />} testId="reviews">
            {openEscalation && (
              <p
                className="rounded-lg bg-amber-50 p-2 text-amber-800"
                data-testid="escalation-open"
              >
                Escalated: only an administrator can clear it, with a clearance reason.
              </p>
            )}
            {history.reviews.length === 0 ? (
              <p className="text-slate-500">No reviews yet.</p>
            ) : (
              <ol className="space-y-2" data-testid="review-list">
                {history.reviews.map((review) => (
                  <li key={review.id} className="rounded-lg border border-slate-100 p-2.5">
                    <p className="font-semibold text-slate-900">
                      {REVIEW_OUTCOME_LABELS[review.outcome] ?? review.outcome}
                      <span className="ml-2 font-normal text-slate-400">
                        {who(review.reviewer_user_id)} ·{" "}
                        {review.reviewer_role === "portal_admin" ? "Admin" : "Quotation staff"} ·{" "}
                        {formatWhen(review.created_at)}
                      </span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{review.note}</p>
                    {review.escalation_clearance_reason && (
                      <p className="mt-0.5 text-emerald-800">
                        Escalation cleared: {review.escalation_clearance_reason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canReview && (
              <div className="space-y-2 rounded-lg bg-slate-50 p-3" data-testid="review-form">
                <label className="block font-semibold text-slate-700">
                  Outcome
                  <select
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value as ReviewOutcome | "")}
                    className={`${inputClass} mt-1 min-h-[44px]`}
                    data-testid="review-outcome"
                  >
                    <option value="">Choose…</option>
                    {(Object.keys(REVIEW_OUTCOME_LABELS) as ReviewOutcome[]).map((key) => (
                      <option
                        key={key}
                        value={key}
                        disabled={
                          key === "checked_suitable" && openEscalation && role !== "portal_admin"
                        }
                      >
                        {REVIEW_OUTCOME_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block font-semibold text-slate-700">
                  Review note (required)
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    className={`${inputClass} mt-1`}
                    data-testid="review-note"
                  />
                </label>
                {clearingEscalation && (
                  <label className="block font-semibold text-slate-700">
                    Escalation clearance reason (required)
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={clearance}
                      onChange={(e) => setClearance(e.target.value)}
                      className={`${inputClass} mt-1`}
                      data-testid="review-clearance"
                    />
                  </label>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={
                      busy ||
                      !outcome ||
                      reviewNote.trim().length < 3 ||
                      (clearingEscalation && clearance.trim().length < 3)
                    }
                    onClick={submitReview}
                    data-testid="review-submit"
                  >
                    Record review
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* Notes */}
          <Section title="Internal notes" icon={<StickyNote size={14} />} testId="notes">
            <p className="text-[11px] text-slate-400">
              IT HUB only. Notes can't be edited or deleted.
            </p>
            {history.notes.length === 0 ? (
              <p className="text-slate-500">No notes yet.</p>
            ) : (
              <ol className="space-y-2" data-testid="note-list">
                {history.notes.map((item) => (
                  <li key={item.id} className="rounded-lg border border-slate-100 p-2.5">
                    <p className="whitespace-pre-wrap">{item.note}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {who(item.author_user_id)} · {formatWhen(item.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {isQuotationRole && (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note for IT HUB staff"
                  aria-label="New note"
                  className={inputClass}
                  data-testid="note-input"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={busy || !note.trim()}
                    onClick={submitNote}
                    data-testid="note-submit"
                  >
                    Add note
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* History */}
          <Section title="History" icon={<History size={14} />} testId="history">
            {loading && history.events.length === 0 ? (
              <p className="text-slate-500">Loading…</p>
            ) : history.events.length === 0 ? (
              <p className="text-slate-500">No history recorded.</p>
            ) : (
              <ol className="space-y-1.5" data-testid="event-list">
                {history.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-2">
                    <span className="font-semibold text-slate-900">
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                    </span>
                    {event.from_status &&
                      event.to_status &&
                      event.from_status !== event.to_status && (
                        <span>
                          {event.from_status} → {event.to_status}
                        </span>
                      )}
                    {event.reason && <span className="text-slate-600">“{event.reason}”</span>}
                    <span className="text-slate-400">
                      {event.actor_type === "customer" ? "Customer" : who(event.actor_user_id)} ·{" "}
                      {formatWhen(event.created_at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
