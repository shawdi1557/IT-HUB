// ITHUB_ADMIN/src/pages/HardwareRegistry.tsx
// Stage 4B-1, reorganised in 4B-6: the Hardware Registry. Canonical models by exact manufacturer and model (never by
// chipset), with search, category and manufacturer filters, completeness, and a two-step "Add hardware" form with a
// possible-duplicate check. Also manufacturers and categories. On a phone the model list becomes cards. Every change
// goes through the database's own functions.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Boxes, ChevronRight, Factory, Plus, RefreshCw, Search, Tags, X } from "lucide-react";
import type { StaffRole } from "../lib/auth";
import {
  createModel,
  findDuplicates,
  loadCategories,
  loadLinks,
  loadManufacturers,
  loadModels,
  saveManufacturer,
  updateCategory,
  type ActionResult,
  type HardwareCategoryRow,
  type HardwareModelRow,
  type ManufacturerRow,
  type ShopifyLinkRow,
} from "../lib/hardware";
import { categoryFields, type HardwareSpecValues } from "../lib/hardware-spec";
import { SpecForm, completenessOf, draftToValues, type SpecDraft } from "../components/SpecForm";
import { HardwareNav } from "../components/HardwareNav";
import {
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  SkeletonRows,
  relativeTime,
  ui,
} from "../components/HardwareUi";

type Tab = "models" | "manufacturers" | "categories";

export function HardwareRegistry({ role }: { role: StaffRole }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("models");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<HardwareCategoryRow[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerRow[]>([]);
  const [models, setModels] = useState<HardwareModelRow[]>([]);
  const [links, setLinks] = useState<ShopifyLinkRow[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [manufacturer, setManufacturer] = useState<string>("all");
  const [status, setStatus] = useState<"active" | "archived" | "base">("active");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, m, h, l] = await Promise.all([
        loadCategories(),
        loadManufacturers(),
        loadModels(),
        loadLinks(),
      ]);
      setCategories(c);
      setManufacturers(m);
      setModels(h);
      setLinks(l.filter((link) => link.status === "active"));
    } catch {
      setError("The registry couldn't be loaded. Check your connection and try Refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const manufacturerName = useMemo(
    () => new Map(manufacturers.map((m) => [m.id, m.name])),
    [manufacturers],
  );
  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;

  const visible = models.filter((model) => {
    if (status === "archived" ? model.status !== "archived" : model.status !== "active")
      return false;
    if (status === "base" ? !model.is_base : status === "active" && model.is_base) return false;
    if (category !== "all" && model.category_id !== category) return false;
    if (manufacturer !== "all" && model.manufacturer_id !== manufacturer) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      model.model_name,
      model.model_number ?? "",
      manufacturerName.get(model.manufacturer_id) ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  const filtered =
    query.trim() !== "" || category !== "all" || manufacturer !== "all" || status !== "active";
  const countFor = (id: string) =>
    models.filter(
      (m) => m.status === "active" && !m.is_base && (id === "all" || m.category_id === id),
    ).length;

  const rowInfo = (model: HardwareModelRow) => {
    const base = model.base_model_id ? modelById.get(model.base_model_id) : undefined;
    return {
      base,
      completeness: completenessOf(model.category_id, model.specs, base?.specs),
      linkCount: links.filter((l) => l.model_id === model.id).length,
    };
  };
  const specPill = (model: HardwareModelRow) => {
    const { completeness } = rowInfo(model);
    return completeness.complete ? (
      <Pill tone="success">Complete</Pill>
    ) : (
      <Pill tone="warning" title={`Unknown: ${completeness.missing.join(", ")}`}>
        {completeness.known}/{completeness.required} required
      </Pill>
    );
  };
  const kindPill = (model: HardwareModelRow) =>
    model.is_base ? (
      <Pill tone="info">Base model</Pill>
    ) : model.status === "archived" ? (
      <Pill>Archived</Pill>
    ) : null;

  return (
    <div className="w-full min-w-0 space-y-6">
      <HardwareNav />
      <PageHeader
        breadcrumbs={[
          { label: "PC Quotations", to: "/quotations" },
          { label: "Hardware Registry" },
        ]}
        title="Hardware Registry"
        description="One record per exact hardware model. The specifications saved here are what the PC Builder checks customers' builds against."
        actions={
          <>
            <button className={ui.button} onClick={reload} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            {tab === "models" && !creating && (
              <button
                className={ui.primary}
                onClick={() => setCreating(true)}
                data-testid="new-model"
              >
                <Plus size={14} /> Add hardware
              </button>
            )}
          </>
        }
      />

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
        aria-label="Registry sections"
      >
        {(
          [
            ["models", "Hardware models", Boxes],
            ["manufacturers", "Manufacturers", Factory],
            ["categories", "Categories", Tags],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`registry-tab-${id}`}
            className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold ${
              tab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Icon size={14} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {tab === "models" && (
        <div className="portal-pop-in space-y-4">
          {creating && (
            <CreateModelPanel
              categories={categories.filter((c) => c.is_active)}
              manufacturers={manufacturers.filter((m) => m.is_active)}
              baseModels={models.filter((m) => m.is_base && m.status === "active")}
              onAddManufacturer={() => {
                setCreating(false);
                setTab("manufacturers");
              }}
              onCancel={() => setCreating(false)}
              onCreated={(model) => {
                setCreating(false);
                navigate(`/hardware/${model.id}`);
              }}
            />
          )}

          <div
            className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold"
            role="group"
            aria-label="Category"
          >
            {[{ id: "all", label: "All" }, ...categories].map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${category === c.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {c.label} <span className="opacity-70">{countFor(c.id)}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by model name, part number or manufacturer"
                aria-label="Search hardware models"
                className={`${ui.input} pl-9`}
                data-testid="registry-search"
              />
            </div>
            <select
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className={`${ui.input} md:w-56`}
              aria-label="Manufacturer"
            >
              <option value="all">All manufacturers</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className={`${ui.input} md:w-48`}
              aria-label="Which models"
            >
              <option value="active">Models for sale</option>
              <option value="base">Base models (references)</option>
              <option value="archived">Archived models</option>
            </select>
          </div>

          <div className={ui.card}>
            {loading ? (
              <SkeletonRows rows={6} label="Loading hardware models" />
            ) : visible.length === 0 ? (
              filtered ? (
                <EmptyState
                  icon={<Search size={22} />}
                  title="No model matches these filters"
                  action={
                    <button
                      className={ui.button}
                      onClick={() => {
                        setQuery("");
                        setCategory("all");
                        setManufacturer("all");
                        setStatus("active");
                      }}
                    >
                      Clear filters
                    </button>
                  }
                >
                  Try another search, or check the category and manufacturer.
                </EmptyState>
              ) : (
                <EmptyState
                  icon={<Boxes size={22} />}
                  title="No hardware models yet"
                  action={
                    <button className={ui.primary} onClick={() => setCreating(true)}>
                      <Plus size={14} /> Add hardware
                    </button>
                  }
                >
                  Add a model for each exact product you sell, then link its Shopify listings.
                </EmptyState>
              )
            ) : (
              <>
                {/* Phones and small tablets: one card per model. */}
                <ul className="divide-y divide-slate-100 md:hidden" data-testid="registry-cards">
                  {visible.map((model) => {
                    const { base, linkCount } = rowInfo(model);
                    return (
                      <li key={model.id}>
                        <button
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                          onClick={() => navigate(`/hardware/${model.id}`)}
                          data-testid="registry-row"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-bold text-slate-900">
                              {model.model_name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {manufacturerName.get(model.manufacturer_id)} ·{" "}
                              {categoryLabel(model.category_id)}
                              {base && ` · inherits from ${base.model_name}`}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {specPill(model)}
                              {kindPill(model)}
                              {!model.is_base && (
                                <Pill>
                                  {linkCount} listing{linkCount === 1 ? "" : "s"}
                                </Pill>
                              )}
                            </div>
                          </div>
                          <ChevronRight
                            size={16}
                            className="mt-1 shrink-0 text-slate-300"
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {/* Tablets and desktops: a table. */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-xs" data-testid="registry-table">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">Model</th>
                        <th className="px-4 py-2.5 font-bold">Manufacturer</th>
                        <th className="px-4 py-2.5 font-bold">Category</th>
                        <th className="px-4 py-2.5 font-bold">Specification</th>
                        <th className="px-4 py-2.5 font-bold">Listings</th>
                        <th className="px-4 py-2.5 font-bold">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visible.map((model) => {
                        const { base, linkCount } = rowInfo(model);
                        return (
                          <tr
                            key={model.id}
                            className="cursor-pointer hover:bg-blue-50/40 focus-within:bg-blue-50/40"
                            onClick={() => navigate(`/hardware/${model.id}`)}
                            data-testid="registry-row"
                          >
                            <td className="px-4 py-3">
                              <a
                                href={`/hardware/${model.id}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigate(`/hardware/${model.id}`);
                                }}
                                className="font-bold text-slate-900 hover:text-blue-700"
                              >
                                {model.model_name}
                              </a>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                {model.model_number ? (
                                  <span className="font-mono">{model.model_number}</span>
                                ) : (
                                  "No part number"
                                )}
                                {kindPill(model)}
                                {base && <span>· inherits from {base.model_name}</span>}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {manufacturerName.get(model.manufacturer_id)}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {categoryLabel(model.category_id)}
                            </td>
                            <td className="px-4 py-3">{specPill(model)}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {model.is_base ? "—" : linkCount}
                            </td>
                            <td
                              className="px-4 py-3 text-slate-500"
                              title={new Date(model.updated_at).toLocaleString()}
                            >
                              {relativeTime(model.updated_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          {!loading && visible.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Showing {visible.length} of {models.length} models. “Base models” are reference
              records, such as a graphics chip, that other models inherit values from; they're never
              sold.
            </p>
          )}
        </div>
      )}

      {tab === "manufacturers" && (
        <ManufacturersPanel
          manufacturers={manufacturers}
          models={models}
          onChanged={reload}
          onNotice={setNotice}
        />
      )}
      {tab === "categories" && (
        <CategoriesPanel
          categories={categories}
          role={role}
          onChanged={reload}
          onNotice={setNotice}
        />
      )}
    </div>
  );
}

// ── Add hardware ──────────────────────────────────────────────────────────────────────────────────────

function CreateModelPanel({
  categories,
  manufacturers,
  baseModels,
  onAddManufacturer,
  onCancel,
  onCreated,
}: {
  categories: HardwareCategoryRow[];
  manufacturers: ManufacturerRow[];
  baseModels: HardwareModelRow[];
  onAddManufacturer: () => void;
  onCancel: () => void;
  onCreated: (model: HardwareModelRow) => void;
}) {
  const [category, setCategory] = useState(categories[0]?.id ?? "CPU");
  const [manufacturerId, setManufacturerId] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [isBase, setIsBase] = useState(false);
  const [baseModelId, setBaseModelId] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<SpecDraft>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult<HardwareModelRow> | null>(null);
  const [warnings, setWarnings] = useState<
    { id: string; model_name: string; model_number: string | null }[]
  >([]);

  const base = baseModels.find((m) => m.id === baseModelId);
  const ready = Boolean(manufacturerId) && modelName.trim().length >= 2;

  // The possible-duplicate warning, as staff type. The database checks again on save.
  useEffect(() => {
    if (!manufacturerId || modelName.trim().length < 2) {
      setWarnings([]);
      return;
    }
    const timer = setTimeout(async () => {
      const found = await findDuplicates({ category, manufacturerId, modelName, modelNumber });
      setWarnings(found.ok && Array.isArray(found.data) ? found.data : []);
    }, 350);
    return () => clearTimeout(timer);
  }, [category, manufacturerId, modelName, modelNumber]);

  const save = async (confirmDistinct: boolean) => {
    if (busy) return;
    setBusy(true);
    const res = await createModel({
      category,
      manufacturerId,
      modelName,
      modelNumber,
      isBase,
      baseModelId: isBase ? null : baseModelId || null,
      notes,
      specs: draftToValues(category, draft) as HardwareSpecValues,
      confirmDistinct,
    });
    setBusy(false);
    setResult(res);
    if (res.ok && res.data) onCreated(res.data);
  };

  return (
    <div className={`${ui.card} portal-pop-in space-y-5 p-5`} data-testid="create-model">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Add hardware</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Step 1: what is it? Step 2: the values you know. You can save now and complete the rest
            later.
          </p>
        </div>
        <button className={ui.button} onClick={onCancel} aria-label="Cancel adding hardware">
          <X size={14} /> Cancel
        </button>
      </div>

      <fieldset className="space-y-3" disabled={busy}>
        <legend className={ui.sectionTitle}>1 · Identity</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className={ui.label}>
            Category
            <select
              className={`${ui.input} mt-1`}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setDraft({});
                setBaseModelId("");
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className={ui.label}>
            Manufacturer
            <select
              className={`${ui.input} mt-1`}
              value={manufacturerId}
              onChange={(e) => setManufacturerId(e.target.value)}
              data-testid="model-manufacturer"
            >
              <option value="">Choose…</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="mt-1 text-[11px] font-semibold text-blue-700 hover:underline"
              onClick={onAddManufacturer}
            >
              Not listed? Add a manufacturer
            </button>
          </label>
          <label className={ui.label}>
            Exact model name
            <input
              className={`${ui.input} mt-1`}
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. Dual GeForce RTX 4070 OC"
              data-testid="model-name"
            />
          </label>
          <label className={ui.label}>
            Part number (MPN) <span className="font-medium text-slate-500">optional</span>
            <input
              className={`${ui.input} mt-1`}
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value)}
              placeholder="From the box or the maker's site"
            />
          </label>
          {!isBase && (
            <label className={ui.label}>
              Inherits from base model <span className="font-medium text-slate-500">optional</span>
              <select
                className={`${ui.input} mt-1`}
                value={baseModelId}
                onChange={(e) => setBaseModelId(e.target.value)}
              >
                <option value="">None</option>
                {baseModels
                  .filter((m) => m.category_id === category)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.model_name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 md:mt-6">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-blue-600"
              checked={isBase}
              onChange={(e) => setIsBase(e.target.checked)}
            />
            <span>
              This is a base model
              <span className="block font-normal text-slate-500">
                A reference, such as a graphics chip, that other models inherit from. Never linked
                to Shopify.
              </span>
            </span>
          </label>
        </div>
        <label className={ui.label}>
          Notes <span className="font-medium text-slate-500">staff only, optional</span>
          <textarea
            className={`${ui.input} mt-1`}
            rows={2}
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </fieldset>

      {warnings.length > 0 && (
        <Notice tone="warning" testId="duplicate-warning">
          <p className="font-bold">Similar models already exist. Check this isn't one of them:</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={w.id}>
                {w.model_name}
                {w.model_number ? ` (${w.model_number})` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Boards that only share a chipset are different products and stay separate.
          </p>
        </Notice>
      )}

      <div className="space-y-2">
        <p className={ui.sectionTitle}>
          2 · Specification ({categoryFields(category).length} fields; leave unknown values blank)
        </p>
        <SpecForm
          category={category}
          draft={draft}
          onChange={setDraft}
          inherited={base?.specs}
          serverErrors={result?.fieldErrors}
          disabled={busy}
        />
      </div>

      {result && !result.ok && (
        <Notice tone="error">
          <p className="font-bold">{result.message}</p>
          {result.code === "possible_duplicate" && (
            <>
              <ul className="mt-1 list-disc pl-5">
                {result.duplicates?.map((d) => (
                  <li key={d.id}>
                    {d.model_name}
                    {d.model_number ? ` (${d.model_number})` : ""}
                  </li>
                ))}
              </ul>
              <button
                className={`${ui.button} mt-2`}
                disabled={busy}
                onClick={() => save(true)}
                data-testid="confirm-distinct"
              >
                These are different products: save anyway
              </button>
            </>
          )}
        </Notice>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
        <button className={ui.button} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className={ui.primary}
          disabled={busy || !ready}
          onClick={() => save(false)}
          data-testid="create-model-save"
        >
          {busy ? "Saving…" : "Save hardware model"}
        </button>
      </div>
      {!ready && (
        <p className="text-right text-[11px] text-slate-500">
          Choose a manufacturer and enter the model name to save.
        </p>
      )}
    </div>
  );
}

// ── Manufacturers ─────────────────────────────────────────────────────────────────────────────────────

function ManufacturersPanel({
  manufacturers,
  models,
  onChanged,
  onNotice,
}: {
  manufacturers: ManufacturerRow[];
  models: HardwareModelRow[];
  onChanged: () => void;
  onNotice: (text: string) => void;
}) {
  const [editing, setEditing] = useState<ManufacturerRow | "new" | null>(null);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (row: ManufacturerRow | "new") => {
    setEditing(row);
    setName(row === "new" ? "" : row.name);
    setWebsite(row === "new" ? "" : (row.website_url ?? ""));
    setActive(row === "new" ? true : row.is_active);
    setMessage(null);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const res = await saveManufacturer({
      id: editing === "new" || !editing ? null : editing.id,
      version: editing === "new" || !editing ? null : editing.version,
      name,
      websiteUrl: website,
      isActive: active,
    });
    setBusy(false);
    if (!res.ok) {
      setMessage(res.message ?? "Not saved.");
      return;
    }
    setEditing(null);
    onNotice(`Saved ${res.data?.name}.`);
    onChanged();
  };

  return (
    <div className="portal-pop-in space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          The companies that make the hardware. A manufacturer that's switched off can't be chosen
          for new models.
        </p>
        <button className={ui.primary} onClick={() => open("new")} data-testid="new-manufacturer">
          <Plus size={14} /> Add manufacturer
        </button>
      </div>
      {editing && (
        <div className={`${ui.card} portal-pop-in space-y-3 p-4`}>
          <p className="text-sm font-bold text-slate-900">
            {editing === "new" ? "New manufacturer" : `Edit ${editing.name}`}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className={ui.label}>
              Name
              <input
                className={`${ui.input} mt-1`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ASUS"
                data-testid="manufacturer-name"
              />
            </label>
            <label className={ui.label}>
              Website <span className="font-medium text-slate-500">optional</span>
              <input
                className={`${ui.input} mt-1`}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 md:mt-6">
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />{" "}
              Active
            </label>
          </div>
          {message && <Notice tone="error">{message}</Notice>}
          <div className="flex justify-end gap-2">
            <button className={ui.button} onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
            <button
              className={ui.primary}
              onClick={save}
              disabled={busy || !name.trim()}
              data-testid="manufacturer-save"
            >
              {busy ? "Saving…" : "Save manufacturer"}
            </button>
          </div>
        </div>
      )}
      <div className={ui.card}>
        {manufacturers.length === 0 ? (
          <EmptyState icon={<Factory size={22} />} title="No manufacturers yet">
            Add the makers of the hardware you sell, such as AMD, Intel or ASUS.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {manufacturers.map((m) => {
              const count = models.filter((x) => x.manufacturer_id === m.id).length;
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="manufacturer-row"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{m.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {count} model{count === 1 ? "" : "s"}
                      {m.website_url ? ` · ${m.website_url}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={m.is_active ? "success" : "neutral"}>
                      {m.is_active ? "Active" : "Inactive"}
                    </Pill>
                    <button className={ui.button} onClick={() => open(m)}>
                      Edit
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────────────────────────────────────

function CategoriesPanel({
  categories,
  role,
  onChanged,
  onNotice,
}: {
  categories: HardwareCategoryRow[];
  role: StaffRole;
  onChanged: () => void;
  onNotice: (text: string) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { label: string; sort: string; active: boolean }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  void role;

  const draftFor = (c: HardwareCategoryRow) =>
    drafts[c.id] ?? { label: c.label, sort: String(c.sort_order), active: c.is_active };

  const save = async (c: HardwareCategoryRow) => {
    const d = draftFor(c);
    setBusy(c.id);
    const res = await updateCategory({
      id: c.id,
      version: c.version,
      label: d.label,
      sortOrder: Number(d.sort),
      isActive: d.active,
    });
    setBusy(null);
    if (!res.ok) {
      setMessage(res.message ?? "Not saved.");
      return;
    }
    setMessage(null);
    setDrafts((all) => {
      const next = { ...all };
      delete next[c.id];
      return next;
    });
    onNotice(`Saved ${d.label}.`);
    onChanged();
  };

  return (
    <div className="portal-pop-in space-y-3">
      <p className="text-xs text-slate-500">
        Rename, reorder or switch off a category. Each category's specification fields are fixed by
        the system, because the PC Builder's checks depend on them.
      </p>
      {message && (
        <Notice tone="error" onClose={() => setMessage(null)}>
          {message}
        </Notice>
      )}
      <ul className="space-y-3">
        {categories.map((c) => {
          const d = draftFor(c);
          const fields = categoryFields(c.id);
          const dirty =
            d.label !== c.label || d.sort !== String(c.sort_order) || d.active !== c.is_active;
          return (
            <li key={c.id} className={`${ui.card} space-y-3 p-4`} data-testid="category-row">
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_7rem_auto_auto]">
                <label className={ui.label}>
                  Name shown to staff{" "}
                  <span className="font-mono font-medium text-slate-400">({c.id})</span>
                  <input
                    className={`${ui.input} mt-1`}
                    value={d.label}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [c.id]: { ...d, label: e.target.value } })
                    }
                  />
                </label>
                <label className={ui.label}>
                  Order
                  <input
                    className={`${ui.input} mt-1`}
                    type="number"
                    value={d.sort}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [c.id]: { ...d, sort: e.target.value } })
                    }
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={d.active}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [c.id]: { ...d, active: e.target.checked } })
                    }
                  />
                  Active
                </label>
                <button
                  className={ui.primary}
                  onClick={() => save(c)}
                  disabled={!dirty || busy === c.id}
                >
                  {busy === c.id ? "Saving…" : "Save"}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {fields.length} fields. Required:{" "}
                {fields
                  .filter((f) => f.required)
                  .map((f) => f.label)
                  .join(", ") || "none"}
                .
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default HardwareRegistry;
