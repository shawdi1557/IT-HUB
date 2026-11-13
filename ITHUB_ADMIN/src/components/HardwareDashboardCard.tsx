// ITHUB_ADMIN/src/components/HardwareDashboardCard.tsx
// Stage 4B: the Dashboard's view of the Hardware Specification Manager: models, manufacturers, categories,
// specification completeness, recently updated models, recent activity and Shopify sync status. The PC quotation
// overview stays in the Dashboard's existing quotation cards.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Boxes, RefreshCw } from "lucide-react";
import {
  ACTIVITY_LABEL,
  loadActivity,
  loadCategories,
  loadManufacturers,
  loadModels,
  loadSyncJobs,
  type ActivityRow,
  type HardwareModelRow,
  type SyncJobRow,
} from "../lib/hardware";
import { completenessOf } from "./SpecForm";
import { reachedRealShopify } from "../lib/sync-wording";

interface Summary {
  models: HardwareModelRow[];
  manufacturers: number;
  categories: number;
  activity: ActivityRow[];
  jobs: SyncJobRow[];
}

export function HardwareDashboardCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    try {
      const [models, manufacturers, categories, activity, jobs] = await Promise.all([
        loadModels(),
        loadManufacturers(),
        loadCategories(),
        loadActivity({ limit: 6 }),
        loadSyncJobs(200),
      ]);
      setSummary({
        models,
        manufacturers: manufacturers.length,
        categories: categories.filter((c) => c.is_active).length,
        activity,
        jobs,
      });
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-xs">
        The hardware registry summary couldn't be loaded.
      </div>
    );
  }
  if (!summary) return null;

  const active = summary.models.filter((m) => m.status === "active" && !m.is_base);
  const byId = new Map(summary.models.map((m) => [m.id, m]));
  const complete = active.filter((m) => {
    const base = m.base_model_id ? byId.get(m.base_model_id) : undefined;
    return completenessOf(m.category_id, m.specs, base?.specs).complete;
  }).length;
  // The latest job per listing decides its state here; a failed one stays failed until retried or replaced.
  const latest = new Map<string, SyncJobRow>();
  for (const job of summary.jobs) if (!latest.has(job.link_id)) latest.set(job.link_id, job);
  const failed = [...latest.values()].filter((j) => j.status === "failed").length;
  const waiting = [...latest.values()].filter((j) =>
    ["queued", "syncing", "retry_pending"].includes(j.status),
  ).length;
  // Only a write the real Shopify store took counts; test-only records never look like a real sync.
  const synced = [...latest.values()].filter((j) => reachedRealShopify(j)).length;
  const recent = [...active].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 5);

  const stat = (label: string, value: string | number, tone = "text-slate-900") => (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-extrabold ${tone}`}>{value}</p>
    </div>
  );

  return (
    <div
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      data-testid="hardware-dashboard"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <Boxes size={16} className="text-blue-600" /> Hardware specifications
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            aria-label="Refresh hardware summary"
            className="text-slate-400 hover:text-slate-700"
          >
            <RefreshCw size={14} />
          </button>
          <Link to="/hardware" className="text-xs font-semibold text-blue-700">
            Hardware Registry →
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {stat("Hardware models", active.length)}
        {stat("Manufacturers", summary.manufacturers)}
        {stat("Categories", summary.categories)}
        {stat(
          "Specs complete",
          active.length ? `${Math.round((complete / active.length) * 100)}%` : "—",
          complete === active.length ? "text-emerald-700" : "text-amber-700",
        )}
        {stat("In Shopify", synced, "text-emerald-700")}
        {stat("Sync waiting", waiting, "text-blue-700")}
        {stat("Failed syncs", failed, failed ? "text-red-700" : "text-slate-900")}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Recently updated models
          </p>
          <ul className="mt-1 divide-y divide-slate-100 text-xs">
            {recent.map((m) => (
              <li key={m.id} className="flex justify-between py-1.5">
                <Link to={`/hardware/${m.id}`} className="font-semibold text-blue-700">
                  {m.model_name}
                </Link>
                <span className="text-slate-400">
                  {new Date(m.updated_at).toLocaleDateString()}
                </span>
              </li>
            ))}
            {recent.length === 0 && <li className="py-1.5 text-slate-500">No models yet.</li>}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Recent activity
          </p>
          <ul className="mt-1 divide-y divide-slate-100 text-xs">
            {summary.activity.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 py-1.5">
                <span className="text-slate-700">{ACTIVITY_LABEL[row.action] ?? row.action}</span>
                <span className="text-slate-400">{new Date(row.created_at).toLocaleString()}</span>
              </li>
            ))}
            {summary.activity.length === 0 && (
              <li className="py-1.5 text-slate-500">Nothing yet.</li>
            )}
          </ul>
          {failed > 0 && (
            <Link
              to="/hardware-sync"
              className="mt-2 inline-block text-xs font-semibold text-red-700"
            >
              {failed} failed sync job(s): open the Sync Centre →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default HardwareDashboardCard;
