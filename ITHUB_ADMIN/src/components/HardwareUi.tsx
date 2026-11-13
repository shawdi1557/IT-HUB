// ITHUB_ADMIN/src/components/HardwareUi.tsx
// Stage 4B-6: small, shared building blocks for the hardware pages, so they look and behave alike: breadcrumbs,
// loading skeletons, empty states, collapsible sections, status pills, messages and a two-step confirm for
// destructive actions. Styling follows the portal's existing light slate and blue look.

import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Info, X } from "lucide-react";

export const ui = {
  card: "rounded-2xl border border-slate-200 bg-white shadow-xs",
  button:
    "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50",
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50",
  input:
    "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-500",
  label: "block text-xs font-bold text-slate-700",
  sectionTitle: "text-[11px] font-extrabold uppercase tracking-wider text-slate-500",
};

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-xs text-slate-500"
      data-testid="breadcrumbs"
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 && <ChevronRight size={12} className="text-slate-300" aria-hidden="true" />}
          {item.to ? (
            <Link to={item.to} className="font-semibold text-blue-700 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="font-semibold text-slate-700">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <header className="space-y-2 border-b border-slate-200 pb-5">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-extrabold tracking-tight text-slate-900">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SkeletonRows({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-live="polite" data-testid="skeleton">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="portal-skeleton h-9 flex-1" />
          <div className="portal-skeleton hidden h-9 w-32 sm:block" />
          <div className="portal-skeleton hidden h-9 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-12 text-center" data-testid="empty-state">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {icon}
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {children && (
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{children}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-50 text-blue-700 ring-blue-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-800 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-red-100",
};

export function Pill({
  tone = "neutral",
  children,
  testId,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${TONES[tone]}`}
      data-testid={testId}
      title={title}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone,
  children,
  onClose,
  testId,
}: {
  tone: "success" | "error" | "warning" | "info";
  children: ReactNode;
  onClose?: () => void;
  testId?: string;
}) {
  const style = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-blue-100 bg-blue-50 text-blue-900",
  }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return (
    <div
      className={`portal-pop-in flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${style}`}
      role={tone === "error" ? "alert" : "status"}
      data-testid={testId ?? `notice-${tone}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss message"
          className="rounded p-0.5 opacity-70 hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** A section that opens and closes smoothly; open state is the caller's or its own. */
export function Collapsible({
  title,
  summary,
  defaultOpen = false,
  children,
  testId,
}: {
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white"
      data-testid={testId}
      data-open={open}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="text-sm font-bold text-slate-900">{title}</span>
        <span className="flex items-center gap-2">
          {summary}
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>
      <div className="portal-collapse" data-open={open}>
        <div>
          <div className="border-t border-slate-100 p-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * A destructive action in two steps: the first click asks, the second (with a reason when required) does it. The
 * action can't be sent twice while it runs.
 */
export function ConfirmAction({
  label,
  confirmLabel,
  question,
  reasonRequired = true,
  onConfirm,
  icon,
  testId,
  tone = "danger",
  extra,
}: {
  /** More inputs shown with the question, such as a choice the action needs. */
  extra?: ReactNode;
  label: string;
  confirmLabel: string;
  question: string;
  reasonRequired?: boolean;
  onConfirm: (reason: string) => Promise<string | null>;
  icon?: ReactNode;
  testId?: string;
  tone?: "danger" | "primary";
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!asking) {
    return (
      <button className={ui.button} onClick={() => setAsking(true)} data-testid={testId}>
        {icon} {label}
      </button>
    );
  }
  return (
    <div
      className="portal-pop-in w-full space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:w-80"
      data-testid={testId ? `${testId}-confirm` : undefined}
    >
      <p className="text-xs font-semibold text-slate-800">{question}</p>
      {extra}
      {reasonRequired && (
        <input
          className={ui.input}
          placeholder="Reason (at least 3 characters)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason"
          autoFocus
        />
      )}
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          className={ui.button}
          onClick={() => {
            setAsking(false);
            setReason("");
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className={tone === "danger" ? ui.danger : ui.primary}
          disabled={busy || (reasonRequired && reason.trim().length < 3)}
          onClick={async () => {
            setBusy(true);
            const failure = await onConfirm(reason);
            setBusy(false);
            if (failure) setError(failure);
            else {
              setAsking(false);
              setReason("");
            }
          }}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/** "3 minutes ago", "yesterday", or the date: easier to read than a full timestamp. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}
