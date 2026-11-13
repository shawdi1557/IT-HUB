// ITHUB_ADMIN/src/pages/ShopifySync.tsx
// Stage 4B-4, reorganised in 4B-6: the Shopify Sync Centre. Each linked listing's state in plain words, why it can't be
// sent yet, a preview of exactly what would be written beside Shopify's current values, send and retry controls (with
// a confirmation), the history with readable failure reasons, and the metafield mappings (administrators switch them).
// A record written only to a stand-in is labelled as a test, never as "in Shopify". Everything runs through the
// hardware-shopify-sync Edge Function or the database's own functions.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Eye, RefreshCw, RotateCcw, UploadCloud } from "lucide-react";
import type { StaffRole } from "../lib/auth";
import {
  loadMappings,
  setMappingEnabled,
  shortGid,
  syncAction,
  type MappingRow,
  type SyncJobRow,
  type SyncListing,
  type SyncOverview,
  type SyncPreview,
} from "../lib/hardware";
import { fieldDefinition } from "../lib/hardware-spec";
import {
  failureWording,
  reachedRealShopify,
  stateWording,
  type ListingState,
} from "../lib/sync-wording";
import { HardwareNav } from "../components/HardwareNav";
import {
  Collapsible,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  SkeletonRows,
  relativeTime,
  ui,
} from "../components/HardwareUi";

type Tab = "listings" | "history" | "mappings";

export function ShopifySync({ role }: { role: StaffRole }) {
  const [overview, setOverview] = useState<SyncOverview | null>(null);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<Tab>("listings");

  const reload = async () => {
    setLoading(true);
    setError(null);
    const [res, maps] = await Promise.all([
      syncAction<SyncOverview>({ action: "overview" }),
      loadMappings().catch(() => [] as MappingRow[]),
    ]);
    setLoading(false);
    setMappings(maps);
    if (!res.ok || !res.data) {
      setError(res.message ?? "The sync overview couldn't be loaded. Try Refresh.");
      return;
    }
    setOverview(res.data);
  };

  useEffect(() => {
    reload();
  }, []);

  const run = async (body: Record<string, unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    setConfirming(false);
    const res = await syncAction<{
      results?: { status: string; problems?: { message: string }[] }[];
      run?: { status: string; error?: { code?: string; message?: string } }[];
    }>(body);
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? "That didn't work. Try again.");
      return;
    }
    const blocked = res.data?.results?.filter((r) => r.status === "blocked").length ?? 0;
    const already = res.data?.results?.filter((r) => r.status === "already_synced").length ?? 0;
    const failed = res.data?.run?.filter((r) => r.status === "failed") ?? [];
    const parts = [done];
    if (already) parts.push(`${already} already up to date.`);
    if (blocked) parts.push(`${blocked} can't be sent yet (see the reasons in the list).`);
    if (failed.length)
      parts.push(`${failed.length} couldn't be sent: ${failureWording(failed[0].error)}`);
    (failed.length ? setError : setNotice)(parts.join(" "));
    setSelected(new Set());
    reload();
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const openPreview = async (listing: SyncListing) => {
    const res = await syncAction<SyncPreview>({ action: "preview", linkId: listing.link.id });
    if (res.ok && res.data) setPreview(res.data);
    else setError(res.message ?? "The preview couldn't be loaded.");
  };

  const ready = overview?.listings.filter((l) => l.problems.length === 0) ?? [];
  const live = overview?.writeMode === "live" && overview.writesEnabled;

  return (
    <div className="w-full min-w-0 space-y-6">
      <HardwareNav />
      <PageHeader
        breadcrumbs={[
          { label: "PC Quotations", to: "/quotations" },
          { label: "Shopify Sync Centre" },
        ]}
        title="Shopify Sync Centre"
        description="Sends each linked listing's specification to its pc_builder fields in Shopify. Nothing else is changed: prices, stock, checkout and other product fields stay as they are."
        actions={
          <button className={ui.button} onClick={reload} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      {overview && (
        <Notice tone={live ? "info" : "warning"} testId="sync-mode">
          {!overview.adminConfigured ? (
            <>
              <strong>Shopify isn't connected here.</strong> Previews and history work, but nothing
              can be sent until an administrator adds the Shopify Admin credential. Any send will
              fail safely without changing Shopify.
            </>
          ) : overview.writeMode === "stand_in" ? (
            <>
              <strong>Test mode.</strong> Sends go to a stand-in, not the real Shopify store.
            </>
          ) : !overview.writesEnabled ? (
            <>
              <strong>Sending is switched off here.</strong> Previews work, but nothing will be sent
              to Shopify.
            </>
          ) : (
            <>
              <strong>Live.</strong> Sending changes the pc_builder fields of the real Shopify
              products.
            </>
          )}
        </Notice>
      )}
      {error && (
        <Notice tone="error" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}
      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      <div
        className="flex gap-1 overflow-x-auto border-b border-slate-200"
        role="tablist"
        aria-label="Sync sections"
      >
        {(
          [
            ["listings", `Listings${overview ? ` (${overview.listings.length})` : ""}`],
            ["history", "Send history"],
            ["mappings", "Field mappings"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`sync-tab-${id}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold ${tab === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "listings" && (
        <div className="portal-pop-in space-y-4">
          {preview && <PreviewPanel preview={preview} onClose={() => setPreview(null)} />}

          {overview && ready.length > 0 && (
            <div
              className={`${ui.card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
              data-testid="sync-actions"
            >
              <p className="text-xs text-slate-600">
                {selected.size === 0
                  ? "Tick the listings to send, or send every ready listing."
                  : `${selected.size} selected.`}
              </p>
              {confirming ? (
                <div
                  className="portal-pop-in flex flex-col gap-2 sm:flex-row sm:items-center"
                  data-testid="sync-confirm"
                >
                  <span className="text-xs font-semibold text-slate-800">
                    {live
                      ? "Send to the real Shopify store?"
                      : "Send? (Nothing will reach the real Shopify store here.)"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      className={ui.button}
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button
                      className={ui.primary}
                      disabled={busy}
                      onClick={() =>
                        run(
                          {
                            action: "enqueue",
                            linkIds: selected.size
                              ? [...selected]
                              : ready.map((l) => l.link.id).slice(0, 50),
                          },
                          "Send requested.",
                        )
                      }
                      data-testid="sync-confirm-send"
                    >
                      {busy ? "Sending…" : "Yes, send"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className={ui.primary}
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                  data-testid="sync-selected"
                >
                  <UploadCloud size={14} />{" "}
                  {selected.size
                    ? `Send ${selected.size} selected`
                    : `Send all ready (${Math.min(ready.length, 50)})`}
                </button>
              )}
            </div>
          )}

          <div className={ui.card}>
            {loading && !overview ? (
              <SkeletonRows rows={5} label="Loading listings" />
            ) : !overview ? (
              // The overview couldn't be loaded: say so, rather than claiming there are no listings.
              <EmptyState
                icon={<RefreshCw size={22} />}
                title="The listings couldn't be loaded"
                action={
                  <button
                    className={ui.button}
                    onClick={reload}
                    disabled={loading}
                    data-testid="sync-retry-load"
                  >
                    <RefreshCw size={14} /> Try again
                  </button>
                }
              >
                The sync service didn't answer, so it isn't known which listings are linked. Nothing
                has been sent to Shopify.
              </EmptyState>
            ) : overview.listings.length === 0 ? (
              <EmptyState
                icon={<UploadCloud size={22} />}
                title="No linked listings yet"
                action={
                  <Link to="/hardware" className={ui.button}>
                    Open the Hardware Registry
                  </Link>
                }
              >
                Link Shopify products to hardware models first, on each model's page.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100" data-testid="sync-list">
                {overview.listings.map((listing) => (
                  <ListingRow
                    key={listing.link.id}
                    listing={listing}
                    selected={selected.has(listing.link.id)}
                    onToggle={() => toggle(listing.link.id)}
                    onPreview={() => openPreview(listing)}
                    onRetry={(job) => run({ action: "retry", jobId: job.id }, "Trying again.")}
                    busy={busy}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "history" && (
        <HistoryList
          jobs={overview?.jobs ?? []}
          onRetry={(job) => run({ action: "retry", jobId: job.id }, "Trying again.")}
          busy={busy}
        />
      )}

      {tab === "mappings" && (
        <MappingsTable mappings={mappings} role={role} onChanged={reload} onError={setError} />
      )}
    </div>
  );
}

function ListingRow({
  listing,
  selected,
  onToggle,
  onPreview,
  onRetry,
  busy,
}: {
  listing: SyncListing;
  selected: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onRetry: (job: SyncJobRow) => void;
  busy: boolean;
}) {
  const { link, state, problems, latestJob } = listing;
  const wording = stateWording(state as ListingState, latestJob);
  const canSelect = problems.length === 0;
  const canRetry =
    latestJob && (latestJob.status === "failed" || latestJob.status === "retry_pending");
  return (
    <li className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start" data-testid="sync-row">
      <label className="flex min-w-0 flex-1 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-blue-600 disabled:opacity-40"
          checked={selected}
          onChange={onToggle}
          disabled={!canSelect}
          aria-label={`Select ${link.product_title || shortGid(link.shopify_product_id)}`}
        />
        <span className="min-w-0">
          <span className="block break-words text-sm font-bold text-slate-900">
            {link.product_title || `Shopify product ${shortGid(link.shopify_product_id)}`}
          </span>
          <span className="mt-0.5 block text-[11px] text-slate-500">
            Product <span className="font-mono">{shortGid(link.shopify_product_id)}</span>
            {link.shopify_variant_id ? (
              <>
                {" "}
                · variant <span className="font-mono">{shortGid(link.shopify_variant_id)}</span>
              </>
            ) : null}
            {" · "}
            <Link
              to={`/hardware/${link.model_id}`}
              className="font-semibold text-blue-700 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {link.manufacturer} {link.model_name}
            </Link>
          </span>
        </span>
      </label>
      <div className="min-w-0 space-y-1 lg:w-80">
        <Pill tone={wording.tone} testId="sync-state">
          {wording.label}
        </Pill>
        <p className="text-[11px] text-slate-500">{wording.explanation}</p>
        {state === "failed" && latestJob?.last_error && (
          <p className="text-[11px] font-semibold text-red-700" data-testid="sync-failure">
            {failureWording(latestJob.last_error)}
          </p>
        )}
        {problems.length > 0 ? (
          <div
            className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900"
            data-testid="sync-problems"
          >
            <p className="font-bold">Can't be sent yet:</p>
            <ul className="list-disc pl-4">
              {problems.slice(0, 3).map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
              {problems.length > 3 && (
                <li>and {problems.length - 3} more (open the model to fix them)</li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-[11px] font-semibold text-emerald-700">
            Ready: {listing.payload.length} value{listing.payload.length === 1 ? "" : "s"} to send
          </p>
        )}
      </div>
      <div className="flex gap-2 lg:justify-end">
        <button className={ui.button} onClick={onPreview} data-testid="sync-preview-open">
          <Eye size={13} /> Preview
        </button>
        {canRetry && (
          <button
            className={ui.button}
            disabled={busy}
            onClick={() => onRetry(latestJob!)}
            data-testid="sync-retry"
          >
            <RotateCcw size={13} /> Try again
          </button>
        )}
      </div>
    </li>
  );
}

function PreviewPanel({ preview, onClose }: { preview: SyncPreview; onClose: () => void }) {
  const current = new Map((preview.shopifyValues ?? []).map((v) => [v.key, v.value]));
  return (
    <div className={`${ui.card} portal-pop-in space-y-3 p-5`} data-testid="sync-preview">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">Preview: what would be sent</h2>
          <p className="text-xs text-slate-500">
            {preview.link.manufacturer} {preview.link.model_name} → Shopify product{" "}
            <span className="font-mono">{shortGid(preview.link.shopify_product_id)}</span>
          </p>
        </div>
        <button className={ui.button} onClick={onClose}>
          Close
        </button>
      </div>
      {preview.problems.length > 0 && (
        <Notice tone="warning">
          <p className="font-bold">This listing can't be sent yet:</p>
          <ul className="list-disc pl-4">
            {preview.problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </Notice>
      )}
      {!preview.adminConfigured && (
        <p className="text-xs text-slate-500">
          Shopify's current values can't be shown, because Shopify isn't connected here.
        </p>
      )}
      {preview.shopifyReadError && (
        <p className="text-xs text-red-700">
          Shopify's current values couldn't be read: {preview.shopifyReadError}.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-1.5">Shopify field</th>
              <th className="py-1.5">In Shopify now</th>
              <th className="py-1.5">Would become</th>
            </tr>
          </thead>
          <tbody>
            {preview.payload.map((m) => {
              const same = current.get(m.key) === m.value;
              return (
                <tr key={m.key} className="border-t border-slate-100">
                  <td className="py-1.5 font-mono text-[11px]">
                    {m.namespace}.{m.key}
                  </td>
                  <td className="py-1.5 text-slate-500">
                    {preview.shopifyValues ? (current.get(m.key) ?? "—") : "Not available"}
                  </td>
                  <td
                    className={`py-1.5 font-semibold ${same ? "text-slate-500" : "text-blue-800"}`}
                  >
                    {m.value}
                    {same ? " (no change)" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {preview.notSynced.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Not sent:{" "}
          {preview.notSynced
            .map(
              (n) =>
                `${fieldDefinition(preview.link.category_id, n.field)?.label ?? n.field} (${n.reason === "unknown" ? "unknown, so Shopify's value is left as it is" : "not a Shopify field"})`,
            )
            .join("; ")}
        </p>
      )}
    </div>
  );
}

function HistoryList({
  jobs,
  onRetry,
  busy,
}: {
  jobs: SyncJobRow[];
  onRetry: (job: SyncJobRow) => void;
  busy: boolean;
}) {
  if (jobs.length === 0) {
    return (
      <div className={ui.card}>
        <EmptyState icon={<RotateCcw size={22} />} title="Nothing has been sent yet">
          Each send request appears here with its result.
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className={`${ui.card} portal-pop-in divide-y divide-slate-100`} data-testid="sync-history">
      {jobs.map((job) => {
        const wording = stateWording(job.status as ListingState, job);
        const real = reachedRealShopify(job);
        return (
          <li key={job.id} className="space-y-2 px-4 py-3 text-xs" data-testid="sync-history-row">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex flex-wrap items-center gap-2">
                <Pill tone={wording.tone}>{wording.label}</Pill>
                {job.status === "synced" && !real && (
                  <Pill testId="sync-test-record">Not sent to the real store</Pill>
                )}
                <span className="text-slate-600">
                  Product <span className="font-mono">{shortGid(job.shopify_product_id)}</span> ·
                  specification revision {job.spec_revision}
                  {job.override_revision ? `, override ${job.override_revision}` : ""}
                </span>
              </p>
              <span className="text-slate-500" title={new Date(job.created_at).toLocaleString()}>
                {relativeTime(job.created_at)} · try {job.attempts} of {job.max_attempts}
              </span>
            </div>
            {job.last_error && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="font-semibold text-red-700">{failureWording(job.last_error)}</p>
                {(job.status === "failed" || job.status === "retry_pending") && (
                  <button className={ui.button} disabled={busy} onClick={() => onRetry(job)}>
                    <RotateCcw size={13} /> Try again
                  </button>
                )}
              </div>
            )}
            {job.last_error?.details !== undefined && (
              <Collapsible title="Technical details">
                <pre className="whitespace-pre-wrap break-all text-[10px] text-slate-600">
                  {JSON.stringify(job.last_error, null, 2)}
                </pre>
              </Collapsible>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MappingsTable({
  mappings,
  role,
  onChanged,
  onError,
}: {
  mappings: MappingRow[];
  role: StaffRole;
  onChanged: () => void;
  onError: (text: string) => void;
}) {
  const admin = role === "portal_admin";
  const [busy, setBusy] = useState<string | null>(null);
  const byCategory = mappings.reduce<Record<string, MappingRow[]>>(
    (acc, m) => ((acc[m.category_id] ??= []).push(m), acc),
    {},
  );
  return (
    <div className="portal-pop-in space-y-3" data-testid="mappings">
      <p className="text-xs text-slate-500">
        Each value is sent to one field in IT HUB's own{" "}
        <span className="font-mono">pc_builder</span> group in Shopify, in the format Shopify
        expects.{" "}
        {admin
          ? "Switch a mapping off to stop sending that value."
          : "Only an administrator can switch mappings on or off."}
      </p>
      {Object.entries(byCategory).map(([category, rows]) => (
        <Collapsible
          key={category}
          title={category}
          summary={
            <Pill>
              {rows.filter((r) => r.is_enabled).length}/{rows.length} on
            </Pill>
          }
        >
          <ul className="divide-y divide-slate-100">
            {rows.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-800">
                    {fieldDefinition(m.category_id, m.field_key)?.label ?? m.field_key}
                  </span>
                  <span className="block break-all font-mono text-[10px] text-slate-500">
                    {m.namespace}.{m.metafield_key} · {m.metafield_type}
                  </span>
                </span>
                <label className="flex shrink-0 items-center gap-2 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={m.is_enabled}
                    disabled={!admin || busy === m.id}
                    aria-label={`Send ${fieldDefinition(m.category_id, m.field_key)?.label ?? m.field_key} to Shopify`}
                    data-testid="mapping-toggle"
                    onChange={async (e) => {
                      setBusy(m.id);
                      const res = await setMappingEnabled(m.id, m.version, e.target.checked);
                      setBusy(null);
                      if (res.ok) onChanged();
                      else onError(res.message ?? "Not saved.");
                    }}
                  />
                  {m.is_enabled ? "On" : "Off"}
                </label>
              </li>
            ))}
          </ul>
        </Collapsible>
      ))}
    </div>
  );
}

export default ShopifySync;
