// ITHUB_ADMIN/src/pages/ShopifyImport.tsx
// Shopify Hardware Importer. Discover the store's products (read-only, through the hardware-shopify-import Edge
// Function), review each one's category, manufacturer, model name and registry match, then import the chosen ones:
// a new model with no specification, or a link to an existing model. Imported models are completed in the
// Specification Manager as before. Also the category rules and the history of discovery sessions.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Download,
  DownloadCloud,
  History,
  ListChecks,
  RefreshCw,
  Search,
  Tags,
  X,
} from "lucide-react";
import type { StaffRole } from "../lib/auth";
import {
  IMPORT_STATUS,
  RESULT_ACTION,
  discoverProducts,
  importCsv,
  importItems,
  importMessage,
  loadImportItems,
  loadImportRules,
  loadImportSessions,
  reevaluateSession,
  type ImportItemRow,
  type ImportRuleRow,
  type ImportSessionRow,
} from "../lib/hardware-import";
import {
  loadCategories,
  loadManufacturers,
  ROLE_LABEL,
  type HardwareCategoryRow,
  type ManufacturerRow,
} from "../lib/hardware";
import { HardwareNav } from "../components/HardwareNav";
import { ImportItemPanel } from "../components/ImportItemPanel";
import { ImportRules } from "../components/ImportRules";
import {
  ConfirmAction,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  SkeletonRows,
  relativeTime,
  ui,
} from "../components/HardwareUi";

type Tab = "products" | "rules" | "history";
type Filter =
  | "pc"
  | "all"
  | "attention"
  | "ready"
  | "duplicates"
  | "linked"
  | "excluded"
  | "done"
  | "failed";

const PAGE_SIZE = 25;

/** What staff should look at first: what needs a decision, then what's ready, then what's settled. */
const STATUS_ORDER: Record<string, number> = {
  needs_review: 0,
  unmapped: 1,
  possible_duplicate: 2,
  failed: 3,
  eligible: 4,
  exact_match: 5,
  already_linked: 6,
  imported: 7,
  skipped: 8,
  excluded: 9,
};

const FILTERS: { id: Filter; label: string; match: (i: ImportItemRow) => boolean }[] = [
  // The default: everything except products a rule marks as not PC hardware (phones, tablets), which can't be
  // imported anyway. They stay in the session (counted, and visible under "Not hardware" or "All").
  { id: "pc", label: "PC hardware", match: (i) => i.status !== "excluded" },
  { id: "all", label: "All, including not hardware", match: () => true },
  {
    id: "attention",
    label: "Needs attention",
    match: (i) => i.status === "unmapped" || i.status === "needs_review",
  },
  {
    id: "ready",
    label: "Ready",
    match: (i) => (i.status === "eligible" || i.status === "exact_match") && i.decision !== "skip",
  },
  {
    id: "duplicates",
    label: "Possible duplicates",
    match: (i) => i.status === "possible_duplicate",
  },
  { id: "linked", label: "Already linked", match: (i) => i.status === "already_linked" },
  { id: "excluded", label: "Not hardware", match: (i) => i.status === "excluded" },
  {
    id: "done",
    label: "Done or skipped",
    match: (i) => i.status === "imported" || i.status === "skipped",
  },
  { id: "failed", label: "Failed", match: (i) => i.status === "failed" },
];

/** An item an import would act on: it has a decision that isn't "skip", or it's done (a repeat is harmless). */
const importable = (i: ImportItemRow) =>
  i.status !== "imported" && i.status !== "skipped" && i.decision !== null && i.decision !== "skip";

function SessionStatus({ session }: { session: ImportSessionRow }) {
  const tone =
    session.status === "failed"
      ? "danger"
      : session.status === "completed"
        ? "success"
        : session.status === "discovering" || session.status === "importing"
          ? "info"
          : "neutral";
  const label = {
    discovering: "Reading Shopify…",
    ready: "Ready for review",
    importing: "Importing…",
    completed: "Imported",
    failed: "Discovery failed",
  }[session.status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function ShopifyImport({ role }: { role: StaffRole }) {
  const admin = role === "portal_admin";
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("products");
  const [sessions, setSessions] = useState<ImportSessionRow[]>([]);
  const [items, setItems] = useState<ImportItemRow[]>([]);
  const [rules, setRules] = useState<ImportRuleRow[]>([]);
  const [categories, setCategories] = useState<HardwareCategoryRow[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<null | "discover" | "import" | "recheck">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pc");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const sessionId = params.get("session") ?? sessions[0]?.id ?? null;
  const session = sessions.find((s) => s.id === sessionId) ?? null;

  const loadSession = async (id: string | null) => {
    if (!id) {
      setItems([]);
      return;
    }
    setItems(await loadImportItems(id));
  };

  const reload = async (id: string | null = sessionId) => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [s, r, c, m] = await Promise.all([
        loadImportSessions(),
        loadImportRules(),
        loadCategories(),
        loadManufacturers(),
      ]);
      setSessions(s);
      setRules(r);
      setCategories(c);
      setManufacturers(m);
      await loadSession(id ?? s[0]?.id ?? null);
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const chooseSession = async (id: string) => {
    setParams({ session: id });
    setSelected(new Set());
    setOpen(null);
    setPage(0);
    setTab("products");
    setLoading(true);
    try {
      await loadSession(id);
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
  };

  const discover = async () => {
    if (busy) return;
    setBusy("discover");
    setError(null);
    setNotice(null);
    const res = await discoverProducts();
    setBusy(null);
    if (!res.ok || !res.data) {
      setError(res.message ?? importMessage(res.code));
      await reload();
      return;
    }
    const d = res.data;
    const notHardware = d.counts?.excluded ?? 0;
    setNotice(
      `Read ${d.products} product${d.products === 1 ? "" : "s"} from Shopify` +
        (d.skipped ? ` (${d.skipped} couldn't be read)` : "") +
        (notHardware
          ? `: ${d.products - notHardware} PC hardware; ${notHardware} not PC hardware (hidden)`
          : "") +
        (d.truncated
          ? ". The store has more than one discovery reads: run it again after importing these."
          : "."),
    );
    setParams({ session: d.sessionId });
    setFilter("pc");
    setPage(0);
    setSelected(new Set());
    await reload(d.sessionId);
  };

  const recheck = async () => {
    if (!session || busy) return;
    setBusy("recheck");
    const res = await reevaluateSession(session.id);
    setBusy(null);
    if (!res.ok) setError(res.message ?? importMessage(res.code));
    else setNotice("Checked again against the current rules and registry.");
    await reload(session.id);
  };

  const runImport = async (ids: string[]) => {
    if (!session || busy || ids.length === 0) return null;
    setBusy("import");
    setError(null);
    const res = await importItems(session.id, ids);
    setBusy(null);
    if (!res.ok || !res.data) {
      await reload(session.id);
      return res.message ?? importMessage(res.code);
    }
    const results = res.data.results;
    const created = results.filter((r) => r.action === "created_model").length;
    const linked = results.filter(
      (r) => r.action === "linked_existing" || r.action === "refreshed_link",
    ).length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed");
    const parts = [];
    if (created) parts.push(`${created} new model${created === 1 ? "" : "s"} created`);
    if (linked) parts.push(`${linked} linked`);
    if (skipped) parts.push(`${skipped} skipped`);
    if (failed.length) parts.push(`${failed.length} failed (${importMessage(failed[0].error)})`);
    const text = (parts.join(", ") || "Nothing to do") + ".";
    if (failed.length) setError(text);
    else setNotice(`${text} Complete the new models' specifications in the Hardware Registry.`);
    if (res.message) setError(res.message);
    setSelected(new Set());
    await reload(session.id);
    return null;
  };

  // ── Filtering and paging ──
  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    for (const f of FILTERS) by[f.id] = items.filter(f.match).length;
    return by;
  }, [items]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = FILTERS.find((f) => f.id === filter)!.match;
    const rows = items.filter(
      (i) =>
        match(i) &&
        (category === "all" ||
          i.category_id === category ||
          (category === "none" && !i.category_id)) &&
        (!q ||
          [
            i.title,
            i.vendor,
            i.shopify_category,
            i.product_type,
            i.model_name,
            i.model_number,
            ...i.variants.map((v) => v.sku),
          ]
            .filter(Boolean)
            .some((t) => String(t).toLowerCase().includes(q))),
    );
    return rows.sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5) ||
        a.title.localeCompare(b.title),
    );
  }, [items, filter, category, query]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const shown = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [pages]);

  const selectable = visible.filter(importable);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const catLabel = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.label ?? id) : "—";
  const makerName = (id: string | null) =>
    id ? (manufacturers.find((m) => m.id === id)?.name ?? "—") : "—";

  const exportCsv = () => {
    const csv = importCsv(
      visible.map((i) => ({
        title: i.title,
        shopify_product_id: i.shopify_product_id,
        vendor: i.vendor,
        shopify_category: i.shopify_category,
        product_type: i.product_type,
        category_id: i.category_id,
        manufacturer: i.manufacturer_id ? makerName(i.manufacturer_id) : null,
        model_name: i.model_name,
        model_number: i.model_number,
        status: IMPORT_STATUS[i.status]?.label ?? i.status,
        decision: i.decision,
        result_action: i.result_action ? (RESULT_ACTION[i.result_action] ?? i.result_action) : null,
        error: i.error?.code ? importMessage(i.error.code) : null,
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopify-import-${(session?.started_at ?? "").slice(0, 10) || "session"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const replaceItem = (row: ImportItemRow) => {
    setItems((all) => all.map((i) => (i.id === row.id ? row : i)));
    if (!importable(row)) {
      const next = new Set(selected);
      next.delete(row.id);
      setSelected(next);
    }
  };

  const stat = (label: string, value: number | undefined, tone: string, target?: Filter) => (
    <button
      type="button"
      className={`${ui.card} min-w-0 p-3 text-left hover:border-slate-300 disabled:cursor-default`}
      disabled={!target}
      onClick={() => target && (setFilter(target), setPage(0), setTab("products"))}
      data-testid={`import-stat-${target ?? label}`}
    >
      <p className="text-[11px] font-bold uppercase leading-tight tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${tone}`}>{value ?? 0}</p>
    </button>
  );

  return (
    <div className="w-full min-w-0 space-y-6">
      <HardwareNav />
      <PageHeader
        breadcrumbs={[
          { label: "PC Quotations", to: "/quotations" },
          { label: "Hardware Registry", to: "/hardware" },
          { label: "Import from Shopify" },
        ]}
        title="Import from Shopify"
        description="Reads the store's published products and brings the PC hardware into the registry: a new model, or a link to one that's already there. Shopify isn't changed, and no specification is filled in for you."
        actions={
          <>
            <button
              className={ui.button}
              onClick={() => reload()}
              disabled={loading || busy !== null}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              className={ui.primary}
              onClick={discover}
              disabled={busy !== null}
              data-testid="import-discover"
            >
              <DownloadCloud size={14} className={busy === "discover" ? "animate-pulse" : ""} />
              {busy === "discover" ? "Reading Shopify…" : "Discover products"}
            </button>
          </>
        }
      />

      <Notice tone="info" testId="import-readonly">
        Discovery only reads Shopify (published products; drafts and archived products aren't
        visible to it). Importing creates registry records only. New models start with an empty
        specification, so the PC Builder treats them as unverified until staff complete them.
      </Notice>
      {error && (
        <Notice tone="error" onClose={() => setError(null)} testId="import-error">
          {error}
        </Notice>
      )}
      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)} testId="import-notice">
          {notice}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200" role="tablist">
        {(
          [
            ["products", "Products", ListChecks],
            ["rules", "Category rules", Tags],
            ["history", "History", History],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold ${
              tab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            data-testid={`import-tab-${id}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 && sessions.length === 0 ? (
        <SkeletonRows rows={6} label="Loading the importer" />
      ) : loadFailed ? (
        <div className={ui.card}>
          <EmptyState
            icon={<X size={22} />}
            title="The importer couldn't be loaded"
            action={
              <button
                className={ui.button}
                onClick={() => reload()}
                data-testid="import-retry-load"
              >
                Try again
              </button>
            }
          >
            Check your connection and try again.
          </EmptyState>
        </div>
      ) : tab === "rules" ? (
        <ImportRules
          rules={rules}
          categories={categories}
          admin={admin}
          onChanged={(message) => {
            setNotice(`${message} Use Re-check on a session to apply it.`);
            loadImportRules()
              .then(setRules)
              .catch(() => setLoadFailed(true));
          }}
        />
      ) : tab === "history" ? (
        sessions.length === 0 ? (
          <div className={ui.card}>
            <EmptyState icon={<History size={22} />} title="No discoveries yet" />
          </div>
        ) : (
          <div className={`${ui.card} overflow-x-auto`} data-testid="import-history">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Products</th>
                  <th className="px-3 py-2">New models</th>
                  <th className="px-3 py-2">Linked</th>
                  <th className="px-3 py-2">Failed</th>
                  <th className="px-3 py-2" aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-50 last:border-0"
                    data-testid="import-history-row"
                  >
                    <td className="px-3 py-2" title={new Date(s.started_at).toLocaleString()}>
                      {relativeTime(s.started_at)}
                    </td>
                    <td className="px-3 py-2">{ROLE_LABEL[s.started_role] ?? s.started_role}</td>
                    <td className="px-3 py-2">
                      <SessionStatus session={s} />
                      {s.error?.code && (
                        <span className="mt-1 block text-[11px] text-red-700">
                          {importMessage(s.error.code)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{s.counts.discovered ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums">{s.counts.imported ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums">{s.counts.linked ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums">{s.counts.failed ?? 0}</td>
                    <td className="px-3 py-2 text-right">
                      <button className={ui.button} onClick={() => chooseSession(s.id)}>
                        {s.id === sessionId ? "Open (current)" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !session ? (
        <div className={ui.card}>
          <EmptyState
            icon={<DownloadCloud size={22} />}
            title="Nothing discovered yet"
            action={
              <button className={ui.primary} onClick={discover} disabled={busy !== null}>
                <DownloadCloud size={14} /> Discover products
              </button>
            }
          >
            Discover reads every published product from Shopify and sorts it by the category rules.
            Nothing is imported until you choose.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="flex flex-wrap items-center gap-2 text-xs text-slate-600"
            data-testid="import-session"
          >
            <SessionStatus session={session} />
            <span>
              Discovered {relativeTime(session.discovered_at ?? session.started_at)} by{" "}
              {ROLE_LABEL[session.started_role] ?? session.started_role}
            </span>
            {session.error?.code && (
              <span className="font-semibold text-red-700">
                {importMessage(session.error.code)}
              </span>
            )}
            {session.id !== sessions[0]?.id && (
              <button
                className="font-semibold text-blue-700 hover:underline"
                onClick={() => chooseSession(sessions[0].id)}
              >
                Go to the latest session
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {stat("PC hardware", counts.pc, "text-slate-900", "pc")}
            {stat("Ready", counts.ready, "text-blue-700", "ready")}
            {stat("Needs attention", counts.attention, "text-amber-700", "attention")}
            {stat("Possible duplicates", counts.duplicates, "text-amber-700", "duplicates")}
            {stat("Already linked", counts.linked, "text-slate-700", "linked")}
            {stat("Not hardware", counts.excluded, "text-slate-500", "excluded")}
            {stat("Done", counts.done, "text-emerald-700", "done")}
            {stat("Failed", counts.failed, "text-red-700", "failed")}
          </div>

          {counts.excluded > 0 && filter === "pc" && (
            <p className="text-xs text-slate-500" data-testid="import-hidden-note">
              {counts.excluded} product{counts.excluded === 1 ? " isn't" : "s aren't"} PC hardware
              (phones, tablets and other categories a rule excludes) and{" "}
              {counts.excluded === 1 ? "is" : "are"} hidden: they can't be imported and never reach
              the PC Builder.{" "}
              <button
                className="font-semibold text-blue-700 hover:underline"
                onClick={() => {
                  setFilter("excluded");
                  setPage(0);
                }}
                data-testid="import-show-excluded"
              >
                Show them
              </button>
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="relative min-w-0 flex-1 basis-56">
              <span className="sr-only">Search</span>
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400"
              />
              <input
                className={`${ui.input} pl-8`}
                placeholder="Search title, vendor, SKU, model…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                data-testid="import-search"
              />
            </label>
            <label className="basis-40">
              <span className="sr-only">Status</span>
              <select
                className={ui.input}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as Filter);
                  setPage(0);
                }}
                data-testid="import-filter"
              >
                {FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} ({counts[f.id] ?? 0})
                  </option>
                ))}
              </select>
            </label>
            <label className="basis-40">
              <span className="sr-only">Category</span>
              <select
                className={ui.input}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(0);
                }}
                data-testid="import-category-filter"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                <option value="none">No category</option>
              </select>
            </label>
            <button
              className={ui.button}
              onClick={recheck}
              disabled={busy !== null}
              data-testid="import-recheck"
            >
              <RefreshCw size={14} className={busy === "recheck" ? "animate-spin" : ""} /> Re-check
            </button>
            <button
              className={ui.button}
              onClick={exportCsv}
              disabled={visible.length === 0}
              data-testid="import-export"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            data-testid="import-selection"
          >
            <span>
              <strong>{selected.size}</strong> selected
              {selectable.length > 0 && (
                <>
                  {" · "}
                  <button
                    className="font-semibold text-blue-700 hover:underline"
                    onClick={() => setSelected(new Set(selectable.map((i) => i.id)))}
                    data-testid="import-select-all"
                  >
                    Select all {selectable.length} importable in this view
                  </button>
                </>
              )}
              {selected.size > 0 && (
                <>
                  {" · "}
                  <button
                    className="font-semibold text-slate-600 hover:underline"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </button>
                </>
              )}
            </span>
            {selected.size > 0 && (
              <ConfirmAction
                label={busy === "import" ? "Importing…" : `Import ${selected.size} selected`}
                confirmLabel="Import"
                question={`Import ${selected.size} product${selected.size === 1 ? "" : "s"} into the registry? New models are created with no specification; existing models aren't changed.`}
                reasonRequired={false}
                tone="primary"
                testId="import-run"
                onConfirm={async () => await runImport([...selected])}
              />
            )}
          </div>

          {visible.length === 0 ? (
            <div className={ui.card}>
              <EmptyState icon={<Search size={22} />} title="No products match">
                Try another filter or search.
              </EmptyState>
            </div>
          ) : (
            <div className={`${ui.card} divide-y divide-slate-100`} data-testid="import-items">
              {shown.map((item) => {
                const s = IMPORT_STATUS[item.status];
                const isOpen = open === item.id;
                return (
                  <div key={item.id} data-testid="import-item" data-status={item.status}>
                    <div className="flex items-start gap-3 px-3 py-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        aria-label={`Select ${item.title}`}
                        disabled={!importable(item)}
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                        data-testid="import-item-select"
                      />
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          loading="lazy"
                          className="hidden h-10 w-10 shrink-0 rounded-lg border border-slate-100 object-contain sm:block"
                        />
                      ) : (
                        <div className="hidden h-10 w-10 shrink-0 rounded-lg bg-slate-100 sm:block" />
                      )}
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : item.id)}
                        data-testid="import-item-open"
                      >
                        <span className="block truncate text-sm font-bold text-slate-900">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {catLabel(item.category_id)} · {makerName(item.manufacturer_id)}
                          {item.shopify_category ? ` · Shopify: ${item.shopify_category}` : ""}
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Pill tone={s.tone}>{s.label}</Pill>
                        {item.status === "imported" && item.result_model_id && (
                          <Link
                            to={`/hardware/${item.result_model_id}`}
                            className="text-[11px] font-semibold text-blue-700 hover:underline"
                          >
                            Open model
                          </Link>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="border-t border-slate-100 bg-white px-3 py-4">
                        <ImportItemPanel
                          item={item}
                          categories={categories}
                          manufacturers={manufacturers}
                          onSaved={replaceItem}
                          onManufacturerAdded={(m) =>
                            setManufacturers((all) =>
                              [...all, m].sort((a, b) => a.name.localeCompare(b.name)),
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {pages > 1 && (
            <div
              className="flex items-center justify-between text-xs text-slate-600"
              data-testid="import-pages"
            >
              <span>
                {page * PAGE_SIZE + 1}–{Math.min(visible.length, (page + 1) * PAGE_SIZE)} of{" "}
                {visible.length}
              </span>
              <span className="flex gap-2">
                <button
                  className={ui.button}
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className={ui.button}
                  disabled={page + 1 >= pages}
                  onClick={() => setPage(page + 1)}
                  data-testid="import-next-page"
                >
                  Next
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ShopifyImport;
