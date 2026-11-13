// ITHUB_ADMIN/src/pages/HardwareActivity.tsx
// Stage 4B-3, reorganised in 4B-6: Revision & Activity History for the whole registry, as a timeline grouped by day:
// who did what to which model, the old and new values side by side, and when. Read-only: the log is append-only in
// the database.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { History, RefreshCw, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { loadAssignableStaff } from "../lib/quotation-workflow";
import {
  ACTIVITY_LABEL,
  ROLE_LABEL,
  loadActivity,
  loadModels,
  type ActivityRow,
  type HardwareModelRow,
} from "../lib/hardware";
import { fieldDefinition, formatHardwareValue } from "../lib/hardware-spec";
import { failureWording } from "../lib/sync-wording";
import { HardwareNav } from "../components/HardwareNav";
import {
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  SkeletonRows,
  ui,
  type Tone,
} from "../components/HardwareUi";

const GROUPS: Record<string, { label: string; test: (action: string) => boolean }> = {
  all: { label: "Everything", test: () => true },
  specifications: {
    label: "Specifications",
    test: (a) => a.startsWith("spec_") || a === "override_updated",
  },
  models: {
    label: "Models and makers",
    test: (a) =>
      a.startsWith("model_") || a.startsWith("manufacturer_") || a === "category_updated",
  },
  links: { label: "Shopify links", test: (a) => a.startsWith("link_") },
  sync: { label: "Shopify sending", test: (a) => a.startsWith("sync_") || a === "mapping_updated" },
  import: { label: "Shopify import", test: (a) => a.startsWith("import_") },
};

const toneFor = (action: string): Tone =>
  action === "sync_failed" || action === "import_item_failed"
    ? "danger"
    : action === "sync_succeeded"
      ? "success"
      : action.startsWith("sync_")
        ? "info"
        : action.endsWith("_removed") || action === "model_archived"
          ? "warning"
          : "neutral";

interface Change {
  field: string;
  from: string;
  to: string;
}

/** What changed, as label / old / new rows; or a short sentence when the record isn't field-by-field. */
function changesOf(row: ActivityRow, category?: string): { changes: Change[]; note?: string } {
  const changes = (row.details?.changes ?? null) as
    | { field: string; from: unknown; to: unknown }[]
    | null;
  if (Array.isArray(changes) && category) {
    return {
      changes: changes.map((c) => ({
        field: fieldDefinition(category, c.field)?.label ?? c.field,
        from: formatHardwareValue(fieldDefinition(category, c.field), c.from ?? undefined),
        to: formatHardwareValue(fieldDefinition(category, c.field), c.to ?? undefined),
      })),
    };
  }
  const error = (row.details as { error?: { code?: string; message?: string } })?.error;
  if (error) return { changes: [], note: failureWording(error) };
  const prev = (row.previous && typeof row.previous === "object" ? row.previous : {}) as Record<
    string,
    unknown
  >;
  const next = (row.new && typeof row.new === "object" ? row.new : {}) as Record<string, unknown>;
  // Only what the action set: a field present only in "previous" is context (such as the product a removed link
  // pointed at), not a change, so it isn't shown as "changed to —".
  const keys = Object.keys(next).filter((k) => k !== "payload");
  const show = (v: unknown) =>
    v === null || v === undefined || v === ""
      ? "—"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  const result = keys
    .filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]) || !(k in prev))
    .map((k) => ({
      field: k.replace(/_/g, " "),
      from: k in prev ? show(prev[k]) : "—",
      to: k in next ? show(next[k]) : "—",
    }));
  const reason = (row.details as { reason?: string })?.reason;
  return { changes: result, note: reason ? `Reason: “${reason}”` : undefined };
}

export function HardwareActivity() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [models, setModels] = useState<HardwareModelRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, m] = await Promise.all([loadActivity({ limit: 500 }), loadModels()]);
      setRows(a);
      setModels(m);
      if (supabase) {
        const staff = await loadAssignableStaff(supabase);
        setNames(new Map(staff.map((s) => [s.user_id, s.full_name])));
      }
    } catch {
      setError("The history couldn't be loaded. Try Refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const who = (row: ActivityRow) =>
    row.actor_role === "system"
      ? "System"
      : (row.actor_user_id && names.get(row.actor_user_id)) ||
        ROLE_LABEL[row.actor_role ?? ""] ||
        "Staff";
  const visible = rows.filter((row) => {
    if (!GROUPS[group].test(row.action)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const model = row.model_id ? modelById.get(row.model_id) : undefined;
    return `${model?.model_name ?? ""} ${ACTIVITY_LABEL[row.action] ?? row.action} ${who(row)}`
      .toLowerCase()
      .includes(q);
  });
  const byDay = visible.reduce<[string, ActivityRow[]][]>((days, row) => {
    const day = new Date(row.created_at).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const last = days[days.length - 1];
    if (last && last[0] === day) last[1].push(row);
    else days.push([day, [row]]);
    return days;
  }, []);

  return (
    <div className="w-full min-w-0 space-y-6">
      <HardwareNav />
      <PageHeader
        breadcrumbs={[
          { label: "PC Quotations", to: "/quotations" },
          { label: "Revision & Activity History" },
        ]}
        title="Revision & Activity History"
        description="Every change to the hardware registry and every Shopify send, with who made it and when. These records can't be edited or deleted."
        actions={
          <button className={ui.button} onClick={reload} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />
      {error && (
        <Notice tone="error" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div
          className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-xs font-bold"
          role="group"
          aria-label="Show"
        >
          {Object.entries(GROUPS).map(([id, g]) => (
            <button
              key={id}
              onClick={() => setGroup(id)}
              aria-pressed={group === id}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${group === id ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            className={`${ui.input} pl-9`}
            placeholder="Search by model, action or person"
            aria-label="Search the history"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className={ui.card}>
          <SkeletonRows rows={6} label="Loading the history" />
        </div>
      ) : visible.length === 0 ? (
        <div className={ui.card}>
          <EmptyState
            icon={<History size={22} />}
            title={rows.length ? "Nothing matches" : "Nothing recorded yet"}
          >
            {rows.length
              ? "Try another filter or search."
              : "Changes to hardware models and Shopify sends will appear here."}
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-6" data-testid="activity">
          {byDay.map(([day, entries]) => (
            <section key={day} className="portal-pop-in space-y-2">
              <h2 className={ui.sectionTitle}>{day}</h2>
              <ol className="relative space-y-2 border-l-2 border-slate-200 pl-5">
                {entries.map((row) => {
                  const model = row.model_id ? modelById.get(row.model_id) : undefined;
                  const { changes, note } = changesOf(row, model?.category_id);
                  return (
                    <li key={row.id} className="relative" data-testid="activity-entry">
                      <span
                        className="absolute -left-[27px] top-3.5 h-3 w-3 rounded-full border-2 border-white bg-slate-400 ring-2 ring-slate-100"
                        aria-hidden="true"
                      />
                      <div className={`${ui.card} p-3.5 text-xs`}>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="flex flex-wrap items-center gap-2">
                            <Pill tone={toneFor(row.action)}>
                              {ACTIVITY_LABEL[row.action] ?? row.action}
                            </Pill>
                            {model ? (
                              <Link
                                to={`/hardware/${model.id}`}
                                className="font-bold text-blue-700 hover:underline"
                              >
                                {model.model_name}
                              </Link>
                            ) : null}
                          </p>
                          <p className="text-slate-500">
                            <span className="font-semibold text-slate-700">{who(row)}</span>
                            {row.actor_role &&
                              row.actor_role !== "system" &&
                              ` (${ROLE_LABEL[row.actor_role] ?? row.actor_role})`}{" "}
                            ·{" "}
                            {new Date(row.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        {changes.length > 0 && (
                          <dl className="mt-2 grid grid-cols-1 gap-1">
                            {changes.slice(0, 12).map((c, i) => (
                              <div
                                key={`${c.field}-${i}`}
                                className="flex flex-wrap items-baseline gap-x-2 break-all"
                              >
                                <dt className="font-semibold capitalize text-slate-700">
                                  {c.field}
                                </dt>
                                <dd className="flex flex-wrap items-baseline gap-x-2">
                                  <span className="rounded bg-red-50 px-1.5 text-red-700 line-through decoration-red-300">
                                    {c.from}
                                  </span>
                                  <span aria-hidden="true" className="text-slate-400">
                                    →
                                  </span>
                                  <span className="sr-only">changed to</span>
                                  <span className="rounded bg-emerald-50 px-1.5 font-semibold text-emerald-800">
                                    {c.to}
                                  </span>
                                </dd>
                              </div>
                            ))}
                            {changes.length > 12 && (
                              <p className="text-slate-500">and {changes.length - 12} more</p>
                            )}
                          </dl>
                        )}
                        {note && <p className="mt-2 text-slate-600">{note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default HardwareActivity;
