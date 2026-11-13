// ITHUB_ADMIN/src/pages/HardwareModelDetail.tsx
// Stage 4B-1 to 4B-3 for one canonical model, reorganised in 4B-6 for everyday use: a summary of where the model
// stands, then four tabs: Specification (grouped sections, required/unknown filter, a sticky save bar), Shopify
// listings (link, overrides, move, remove), History (a readable timeline with comparison) and Details (identity and
// notes). Staff and Admin save directly: no approval step. Every save is validated by the database and recorded as a
// revision with its actor. Archive and restore are administrator-only and ask before acting.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  Archive,
  ArchiveRestore,
  GitCompare,
  Link2,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import type { StaffRole } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { loadAssignableStaff } from "../lib/quotation-workflow";
import {
  ACTIVITY_LABEL,
  ROLE_LABEL,
  linkListing,
  loadActivity,
  loadCategories,
  loadLinks,
  loadManufacturers,
  loadModel,
  loadModels,
  loadRevisions,
  relinkListing,
  removeLink,
  saveOverrides,
  saveSpecs,
  setModelArchived,
  shortGid,
  updateModel,
  type ActionResult,
  type ActivityRow,
  type HardwareCategoryRow,
  type HardwareModelRow,
  type ManufacturerRow,
  type ShopifyLinkRow,
  type SpecRevisionRow,
} from "../lib/hardware";
import {
  categoryFields,
  diffHardwareSpecs,
  fieldDefinition,
  formatHardwareValue,
  resolveHardwareSpecs,
  type HardwareSpecValues,
} from "../lib/hardware-spec";
import { SpecForm, draftToValues, valuesToDraft, type SpecDraft } from "../components/SpecForm";
import { HardwareNav } from "../components/HardwareNav";
import {
  Collapsible,
  ConfirmAction,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  SkeletonRows,
  relativeTime,
  ui,
} from "../components/HardwareUi";

type Tab = "spec" | "links" | "history" | "details";

export function HardwareModelDetail({ role }: { role: StaffRole }) {
  const { id = "" } = useParams();
  const [model, setModel] = useState<HardwareModelRow | null>(null);
  const [models, setModels] = useState<HardwareModelRow[]>([]);
  const [categories, setCategories] = useState<HardwareCategoryRow[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerRow[]>([]);
  const [links, setLinks] = useState<ShopifyLinkRow[]>([]);
  const [revisions, setRevisions] = useState<SpecRevisionRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("spec");
  const [draft, setDraft] = useState<SpecDraft>({});
  const [reason, setReason] = useState("");
  const [saveResult, setSaveResult] = useState<ActionResult<HardwareModelRow> | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, all, c, mf, l, r, a] = await Promise.all([
        loadModel(id),
        loadModels(),
        loadCategories(),
        loadManufacturers(),
        loadLinks(id),
        loadRevisions(id),
        loadActivity({ modelId: id, limit: 100 }),
      ]);
      if (!m)
        throw new Error(
          "This model couldn't be found. It may have been removed, or the link is wrong.",
        );
      setModel(m);
      setModels(all);
      setCategories(c);
      setManufacturers(mf);
      setLinks(l);
      setRevisions(r);
      setActivity(a);
      setDraft(valuesToDraft(m.specs));
      setSaveResult(null);
      if (supabase) {
        const staff = await loadAssignableStaff(supabase);
        setNames(new Map(staff.map((s) => [s.user_id, s.full_name])));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The model couldn't be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTab("spec");
    reload();
  }, [id]);

  const base = useMemo(
    () => (model?.base_model_id ? models.find((m) => m.id === model.base_model_id) : undefined),
    [model, models],
  );

  if (loading && !model) {
    return (
      <div className="space-y-6">
        <HardwareNav />
        <div className={ui.card}>
          <SkeletonRows rows={6} label="Loading the model" />
        </div>
      </div>
    );
  }
  if (!model) {
    return (
      <div className="space-y-6">
        <HardwareNav />
        <div className={ui.card}>
          <EmptyState
            icon={<Undo2 size={22} />}
            title="Model not found"
            action={
              <Link to="/hardware" className={ui.button}>
                Back to the Hardware Registry
              </Link>
            }
          >
            {error ?? "This model couldn't be found."}
          </EmptyState>
        </div>
      </div>
    );
  }

  const archived = model.status === "archived";
  const manufacturer = manufacturers.find((m) => m.id === model.manufacturer_id);
  const category = categories.find((c) => c.id === model.category_id);
  const draftValues = draftToValues(model.category_id, draft) as HardwareSpecValues;
  const preview = resolveHardwareSpecs({
    category: model.category_id,
    model: draftValues,
    base: base?.specs,
  });
  const saved = resolveHardwareSpecs({
    category: model.category_id,
    model: model.specs,
    base: base?.specs,
  });
  const unsaved = diffHardwareSpecs(model.category_id, model.specs, draftValues);
  const activeLinks = links.filter((l) => l.status === "active");
  const requiredTotal = categoryFields(model.category_id).filter((f) => f.required).length;
  const who = (userId: string | null, actorRole: string | null) =>
    actorRole === "system"
      ? "System"
      : (userId && names.get(userId)) || ROLE_LABEL[actorRole ?? ""] || "Staff";
  const lastRevision = revisions.find((r) => r.link_id === null);

  const saveSpecification = async () => {
    if (busy) return;
    setBusy(true);
    const res = await saveSpecs(model.id, model.version, draftValues, reason);
    setBusy(false);
    setSaveResult(res);
    if (res.ok) {
      setNotice(
        res.data?.version === model.version
          ? "Nothing changed, so nothing was saved."
          : `Saved. This is now revision ${res.data?.spec_revision}.`,
      );
      setReason("");
      await reload();
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "spec", label: "Specification" },
    ...(!model.is_base
      ? [{ id: "links" as Tab, label: "Shopify listings", count: activeLinks.length }]
      : []),
    { id: "history", label: "History", count: revisions.length },
    { id: "details", label: "Details" },
  ];

  return (
    <div className="w-full min-w-0 space-y-6 pb-24">
      <HardwareNav />
      <PageHeader
        breadcrumbs={[
          { label: "PC Quotations", to: "/quotations" },
          { label: "Hardware Registry", to: "/hardware" },
          { label: model.model_name },
        ]}
        title={model.model_name}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{manufacturer?.name}</span>
            <span aria-hidden="true">·</span>
            <span>{category?.label ?? model.category_id}</span>
            {model.model_number && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{model.model_number}</span>
              </>
            )}
            {model.is_base && <Pill tone="info">Base model</Pill>}
            {base && <Pill>Inherits from {base.model_name}</Pill>}
            {archived && <Pill tone="neutral">Archived</Pill>}
          </span>
        }
        actions={
          <>
            <button className={ui.button} onClick={reload} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            {role === "portal_admin" && (
              <ConfirmAction
                testId="archive"
                label={archived ? "Restore model" : "Archive model"}
                icon={archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                confirmLabel={archived ? "Restore" : "Archive"}
                tone={archived ? "primary" : "danger"}
                question={
                  archived
                    ? "Restore this model so staff can edit and link it again?"
                    : "Archive this model? It must have no linked listings. You can restore it later."
                }
                onConfirm={async (why) => {
                  const res = await setModelArchived(model.id, model.version, !archived, why);
                  if (!res.ok) return res.message ?? "Not saved.";
                  setNotice(archived ? "Model restored." : "Model archived.");
                  reload();
                  return null;
                }}
              />
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
        <Notice tone="success" onClose={() => setNotice(null)} testId="notice">
          {notice}
        </Notice>
      )}
      {archived && (
        <Notice tone="info">
          This model is archived: it's read-only and the PC Builder doesn't use it. An administrator
          can restore it.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="model-summary">
        <SummaryTile label="Specification">
          {saved.complete ? (
            <Pill tone="success">Complete</Pill>
          ) : (
            <Pill tone="warning">
              {requiredTotal - saved.missingRequired.length} of {requiredTotal} required known
            </Pill>
          )}
        </SummaryTile>
        <SummaryTile label="Current revision">
          <span className="text-sm font-bold text-slate-900">
            {model.spec_revision === 0 ? "None yet" : `Revision ${model.spec_revision}`}
          </span>
          {lastRevision && (
            <span className="block text-[11px] text-slate-500">
              {who(lastRevision.actor_user_id, lastRevision.actor_role)},{" "}
              {relativeTime(lastRevision.created_at)}
            </span>
          )}
        </SummaryTile>
        <SummaryTile label="Shopify listings">
          <span className="text-sm font-bold text-slate-900">
            {model.is_base ? "Not linkable" : activeLinks.length}
          </span>
        </SummaryTile>
        <SummaryTile label="Status">
          <span className="text-sm font-bold text-slate-900">
            {archived ? "Archived" : "Active"}
          </span>
        </SummaryTile>
      </div>

      <div
        className="flex gap-1 overflow-x-auto border-b border-slate-200"
        role="tablist"
        aria-label="Model sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold ${
              tab === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "spec" && (
        <section className="portal-pop-in space-y-4" data-testid="spec-manager">
          <p className="text-xs text-slate-500">
            Leave a value blank when it isn't known. Saving checks every value and records a new
            revision with your name.
            {base && " Values left blank on fields marked “Can inherit” come from the base model."}
          </p>
          <SpecForm
            category={model.category_id}
            draft={draft}
            onChange={setDraft}
            inherited={base?.specs}
            serverErrors={saveResult?.fieldErrors}
            disabled={archived}
          />

          <Collapsible
            title="What the PC Builder will use"
            summary={
              <Pill tone={preview.complete ? "success" : "warning"}>
                {preview.complete
                  ? "Complete"
                  : `${preview.missingRequired.length} required unknown`}
              </Pill>
            }
            testId="spec-preview"
          >
            <p className="mb-3 text-xs text-slate-500">
              This preview includes your unsaved changes and any values inherited from a base model.
            </p>
            <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {categoryFields(model.category_id).map((definition) => (
                <div
                  key={definition.key}
                  className="flex justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
                >
                  <dt className="text-slate-500">{definition.label}</dt>
                  <dd className="text-right font-semibold text-slate-900">
                    {formatHardwareValue(definition, preview.values[definition.key])}
                    {preview.sources[definition.key] === "base" && (
                      <span className="ml-1 text-[10px] font-medium text-blue-700">(base)</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Collapsible>

          {!archived && (
            <div
              className="sticky bottom-3 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm"
              data-testid="save-bar"
            >
              {saveResult && !saveResult.ok && (
                <p className="mb-2 text-xs font-semibold text-red-700" role="alert">
                  {saveResult.message}
                </p>
              )}
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <p
                  className="text-xs font-semibold text-slate-700 md:w-44"
                  data-testid="unsaved-count"
                >
                  {unsaved.length === 0
                    ? "No unsaved changes"
                    : `${unsaved.length} unsaved change${unsaved.length > 1 ? "s" : ""}`}
                </p>
                <input
                  className={`${ui.input} md:flex-1`}
                  placeholder="Reason for this change (optional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  aria-label="Reason for this change"
                />
                <div className="flex gap-2">
                  <button
                    className={ui.button}
                    disabled={busy || unsaved.length === 0}
                    onClick={() => {
                      setDraft(valuesToDraft(model.specs));
                      setSaveResult(null);
                    }}
                    data-testid="discard-specs"
                  >
                    <Undo2 size={14} /> Discard
                  </button>
                  <button
                    className={ui.primary}
                    onClick={saveSpecification}
                    disabled={busy || unsaved.length === 0}
                    data-testid="save-specs"
                  >
                    <Save size={14} /> {busy ? "Saving…" : "Save specification"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "links" && !model.is_base && (
        <LinksSection
          model={model}
          links={links}
          models={models}
          base={base}
          disabled={archived}
          onChanged={(text) => {
            setNotice(text);
            reload();
          }}
        />
      )}

      {tab === "history" && (
        <HistorySection
          category={model.category_id}
          revisions={revisions}
          activity={activity}
          links={links}
          who={who}
        />
      )}

      {tab === "details" && (
        <IdentityEditor
          model={model}
          categories={categories}
          manufacturers={manufacturers}
          baseModels={models.filter((m) => m.is_base && m.status === "active" && m.id !== model.id)}
          disabled={archived}
          onSaved={(text) => {
            setNotice(text);
            reload();
          }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ── Details ───────────────────────────────────────────────────────────────────────────────────────────

function IdentityEditor({
  model,
  categories,
  manufacturers,
  baseModels,
  disabled,
  onSaved,
}: {
  model: HardwareModelRow;
  categories: HardwareCategoryRow[];
  manufacturers: ManufacturerRow[];
  baseModels: HardwareModelRow[];
  disabled: boolean;
  onSaved: (text: string) => void;
}) {
  const [category, setCategory] = useState(model.category_id);
  const [manufacturerId, setManufacturerId] = useState(model.manufacturer_id);
  const [name, setName] = useState(model.model_name);
  const [number, setNumber] = useState(model.model_number ?? "");
  const [isBase, setIsBase] = useState(model.is_base);
  const [baseId, setBaseId] = useState(model.base_model_id ?? "");
  const [notes, setNotes] = useState(model.notes ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult<HardwareModelRow> | null>(null);

  const changed =
    category !== model.category_id ||
    manufacturerId !== model.manufacturer_id ||
    name !== model.model_name ||
    number !== (model.model_number ?? "") ||
    isBase !== model.is_base ||
    baseId !== (model.base_model_id ?? "") ||
    notes !== (model.notes ?? "");

  const save = async (confirmDistinct: boolean) => {
    if (busy) return;
    setBusy(true);
    const res = await updateModel(model.id, model.version, {
      category,
      manufacturerId,
      modelName: name,
      modelNumber: number,
      isBase,
      baseModelId: isBase ? null : baseId || null,
      notes,
      confirmDistinct,
      reason,
    });
    setBusy(false);
    setResult(res);
    if (res.ok) {
      setReason("");
      onSaved("Model details saved.");
    }
  };

  return (
    <section className={`${ui.card} portal-pop-in space-y-4 p-5`} data-testid="identity">
      <div>
        <h2 className="text-sm font-extrabold text-slate-900">Model details</h2>
        <p className="mt-1 text-xs text-slate-500">
          The model's identity: manufacturer, exact name and part number. Boards that share a
          chipset are still different models. Changing the category is possible only while no
          Shopify listing is linked.
        </p>
      </div>
      <fieldset disabled={disabled || busy} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={ui.label}>
          Category
          <select
            className={`${ui.input} mt-1`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
          >
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.label}>
          Exact model name
          <input
            className={`${ui.input} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="identity-name"
          />
        </label>
        <label className={ui.label}>
          Part number (MPN)
          <input
            className={`${ui.input} mt-1`}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 md:mt-6">
          <input
            type="checkbox"
            className="h-4 w-4 accent-blue-600"
            checked={isBase}
            onChange={(e) => setIsBase(e.target.checked)}
          />
          Base model (a reference, never linked to Shopify)
        </label>
        {!isBase && (
          <label className={ui.label}>
            Inherits from base model
            <select
              className={`${ui.input} mt-1`}
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
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
        <label className={`${ui.label} md:col-span-3`}>
          Notes (staff only, never shown to customers)
          <textarea
            className={`${ui.input} mt-1`}
            rows={3}
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className={`${ui.label} md:col-span-2`}>
          Reason for this change (optional)
          <input
            className={`${ui.input} mt-1`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </fieldset>
      {result && !result.ok && (
        <Notice tone="error">
          {result.message}
          {result.code === "possible_duplicate" && (
            <div className="mt-2">
              <ul className="list-disc pl-5">
                {result.duplicates?.map((d) => (
                  <li key={d.id}>
                    {d.model_name}
                    {d.model_number ? ` (${d.model_number})` : ""}
                  </li>
                ))}
              </ul>
              <button className={`${ui.button} mt-2`} onClick={() => save(true)} disabled={busy}>
                These are different products: save anyway
              </button>
            </div>
          )}
        </Notice>
      )}
      {!disabled && (
        <div className="flex justify-end">
          <button
            className={ui.primary}
            onClick={() => save(false)}
            disabled={busy || !changed || name.trim().length < 2}
            data-testid="identity-save"
          >
            <Save size={14} /> {busy ? "Saving…" : "Save details"}
          </button>
        </div>
      )}
    </section>
  );
}

// ── Shopify listings ─────────────────────────────────────────────────────────────────────────────────

function LinksSection({
  model,
  links,
  models,
  base,
  disabled,
  onChanged,
}: {
  model: HardwareModelRow;
  links: ShopifyLinkRow[];
  models: HardwareModelRow[];
  base?: HardwareModelRow;
  disabled: boolean;
  onChanged: (text: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [variantTitle, setVariantTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = links.filter((l) => l.status === "active");
  const removed = links.filter((l) => l.status === "removed");
  const modelValues = resolveHardwareSpecs({
    category: model.category_id,
    model: model.specs,
    base: base?.specs,
  }).values;

  const add = async () => {
    if (busy) return;
    setBusy(true);
    const res = await linkListing({
      modelId: model.id,
      productId,
      variantId,
      productTitle,
      variantTitle,
    });
    setBusy(false);
    if (!res.ok) {
      setMessage(res.message ?? "The listing wasn't linked.");
      return;
    }
    setMessage(null);
    setProductId("");
    setVariantId("");
    setProductTitle("");
    setVariantTitle("");
    onChanged("Shopify listing linked. Its specifications now come from this model.");
  };

  return (
    <section className="portal-pop-in space-y-4" data-testid="links">
      <Notice tone="info">
        Link each Shopify product (or one of its variants) that sells this exact model. Several
        listings can share one model; a variant's own link takes precedence over its product's link.
        Prices, stock and checkout stay in Shopify.{" "}
        <Link to="/hardware-sync" className="font-semibold underline">
          Open the Shopify Sync Centre
        </Link>{" "}
        to write the values to Shopify.
      </Notice>

      {active.length === 0 ? (
        <div className={ui.card}>
          <EmptyState icon={<Link2 size={22} />} title="No Shopify listing linked yet">
            Add the Shopify product ID below. You'll find it in the product's address in Shopify
            Admin.
          </EmptyState>
        </div>
      ) : (
        <ul className="space-y-3">
          {active.map((link) => (
            <li key={link.id} className={`${ui.card} p-4`} data-testid="link-row">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 text-xs">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                    <Link2 size={14} className="text-blue-600" aria-hidden="true" />
                    {link.product_title || "Shopify product"}
                    {link.variant_title && (
                      <span className="font-medium text-slate-500">· {link.variant_title}</span>
                    )}
                    {Object.keys(link.overrides).length > 0 && (
                      <Pill tone="info">{Object.keys(link.overrides).length} override(s)</Pill>
                    )}
                  </p>
                  <p className="mt-1 text-slate-500">
                    Product <span className="font-mono">{shortGid(link.shopify_product_id)}</span>
                    {link.shopify_variant_id ? (
                      <>
                        {" "}
                        · variant{" "}
                        <span className="font-mono">{shortGid(link.shopify_variant_id)}</span>
                      </>
                    ) : (
                      " · all variants"
                    )}
                  </p>
                </div>
                {!disabled && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={ui.button}
                      onClick={() => setEditing(editing === link.id ? null : link.id)}
                      aria-expanded={editing === link.id}
                    >
                      {editing === link.id ? "Close overrides" : "Listing overrides"}
                    </button>
                    <MoveLink
                      link={link}
                      models={models.filter(
                        (m) => m.status === "active" && !m.is_base && m.id !== model.id,
                      )}
                      onDone={onChanged}
                    />
                    <ConfirmAction
                      testId="remove-link"
                      label="Remove"
                      icon={<Trash2 size={14} />}
                      confirmLabel="Remove link"
                      question="Remove this link? The listing will no longer use this model's specifications. The record is kept in the history."
                      onConfirm={async (why) => {
                        const res = await removeLink(link.id, link.version, why);
                        if (!res.ok) return res.message ?? "Not removed.";
                        onChanged("Link removed.");
                        return null;
                      }}
                    />
                  </div>
                )}
              </div>
              {editing === link.id && (
                <OverrideEditor
                  link={link}
                  category={model.category_id}
                  modelValues={modelValues}
                  onSaved={(text) => {
                    setEditing(null);
                    onChanged(text);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className={`${ui.card} space-y-3 p-4`}>
          <h3 className="text-sm font-bold text-slate-900">Link a Shopify product or variant</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className={ui.label}>
              Product ID <span className="font-medium text-slate-500">(required)</span>
              <input
                className={`${ui.input} mt-1`}
                placeholder="e.g. 9123456789"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                data-testid="link-product"
              />
            </label>
            <label className={ui.label}>
              Variant ID <span className="font-medium text-slate-500">(only for one variant)</span>
              <input
                className={`${ui.input} mt-1`}
                placeholder="Leave blank for every variant"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              />
            </label>
            <label className={ui.label}>
              Product title <span className="font-medium text-slate-500">(for reference)</span>
              <input
                className={`${ui.input} mt-1`}
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
              />
            </label>
            <label className={ui.label}>
              Variant title <span className="font-medium text-slate-500">(optional)</span>
              <input
                className={`${ui.input} mt-1`}
                value={variantTitle}
                onChange={(e) => setVariantTitle(e.target.value)}
              />
            </label>
          </div>
          {message && <Notice tone="error">{message}</Notice>}
          <div className="flex justify-end">
            <button
              className={ui.primary}
              disabled={busy || !productId.trim()}
              onClick={add}
              data-testid="link-save"
            >
              <Link2 size={14} /> {busy ? "Linking…" : "Link listing"}
            </button>
          </div>
        </div>
      )}

      {removed.length > 0 && (
        <Collapsible title={`Removed links (${removed.length})`}>
          <ul className="space-y-1 text-xs text-slate-600">
            {removed.map((l) => (
              <li key={l.id}>
                Product <span className="font-mono">{shortGid(l.shopify_product_id)}</span>
                {l.shopify_variant_id ? (
                  <>
                    {" "}
                    / variant <span className="font-mono">{shortGid(l.shopify_variant_id)}</span>
                  </>
                ) : (
                  ""
                )}
                : “{l.removed_reason}”
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </section>
  );
}

function OverrideEditor({
  link,
  category,
  modelValues,
  onSaved,
}: {
  link: ShopifyLinkRow;
  category: string;
  modelValues: HardwareSpecValues;
  onSaved: (text: string) => void;
}) {
  const [draft, setDraft] = useState<SpecDraft>(valuesToDraft(link.overrides));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult<ShopifyLinkRow> | null>(null);
  return (
    <div
      className="portal-pop-in mt-4 space-y-3 border-t border-slate-100 pt-4"
      data-testid="override-editor"
    >
      <p className="text-xs text-slate-600">
        Fill a value only where this listing differs from the model, such as a bundle with a
        different capacity. A blank value means “same as the model”.
      </p>
      <SpecForm
        category={category}
        draft={draft}
        onChange={setDraft}
        modelValues={modelValues}
        serverErrors={result?.fieldErrors}
        mode="override"
      />
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input
          className={`${ui.input} md:flex-1`}
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason for the override change"
        />
        <button
          className={ui.primary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await saveOverrides(
              link.id,
              link.version,
              draftToValues(category, draft) as HardwareSpecValues,
              reason,
            );
            setBusy(false);
            setResult(res);
            if (res.ok)
              onSaved(
                res.data?.version === link.version
                  ? "Nothing changed."
                  : "Listing overrides saved.",
              );
          }}
        >
          <Save size={14} /> {busy ? "Saving…" : "Save overrides"}
        </button>
      </div>
      {result && !result.ok && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}

function MoveLink({
  link,
  models,
  onDone,
}: {
  link: ShopifyLinkRow;
  models: HardwareModelRow[];
  onDone: (text: string) => void;
}) {
  const [target, setTarget] = useState("");
  return (
    <ConfirmAction
      label="Move to another model"
      confirmLabel="Move link"
      tone="primary"
      question="Move this listing to another model? Use this to correct a wrong link."
      onConfirm={async (why) => {
        if (!target) return "Choose the model to move it to.";
        const res = await relinkListing(link.id, link.version, target, why);
        if (!res.ok) return res.message ?? "Not moved.";
        onDone("Link moved to the other model.");
        return null;
      }}
      extra={
        <select
          className={ui.input}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Model to move to"
        >
          <option value="">Choose a model…</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.model_name} ({m.category_id})
            </option>
          ))}
        </select>
      }
    />
  );
}

// ── History ──────────────────────────────────────────────────────────────────────────────────────────

function HistorySection({
  category,
  revisions,
  activity,
  links,
  who,
}: {
  category: string;
  revisions: SpecRevisionRow[];
  activity: ActivityRow[];
  links: ShopifyLinkRow[];
  who: (userId: string | null, role: string | null) => string;
}) {
  const modelRevisions = revisions.filter((r) => r.link_id === null);
  const [left, setLeft] = useState<string>("");
  const [right, setRight] = useState<string>("");
  const a = modelRevisions.find((r) => String(r.revision_no) === left);
  const b = modelRevisions.find((r) => String(r.revision_no) === right);
  const comparison = a && b ? diffHardwareSpecs(category, a.specs, b.specs) : null;
  const label = (field: string) => fieldDefinition(category, field)?.label ?? field;
  const value = (field: string, v: unknown) =>
    formatHardwareValue(fieldDefinition(category, field), v ?? undefined);

  return (
    <section className="portal-pop-in space-y-4" data-testid="revisions">
      {modelRevisions.length >= 2 && (
        <div className={`${ui.card} space-y-3 p-4`}>
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <GitCompare size={16} className="text-blue-600" aria-hidden="true" /> Compare two
            revisions
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className={`${ui.input} sm:w-40`}
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              aria-label="Older revision"
            >
              <option value="">Older…</option>
              {modelRevisions.map((r) => (
                <option key={r.id} value={r.revision_no}>
                  Revision {r.revision_no}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">with</span>
            <select
              className={`${ui.input} sm:w-40`}
              value={right}
              onChange={(e) => setRight(e.target.value)}
              aria-label="Newer revision"
            >
              <option value="">Newer…</option>
              {modelRevisions.map((r) => (
                <option key={r.id} value={r.revision_no}>
                  Revision {r.revision_no}
                </option>
              ))}
            </select>
          </div>
          {comparison && (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[420px] text-left text-xs"
                data-testid="revision-compare"
              >
                <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5">Field</th>
                    <th className="py-1.5">Revision {left}</th>
                    <th className="py-1.5">Revision {right}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-slate-500">
                        These revisions hold the same values.
                      </td>
                    </tr>
                  )}
                  {comparison.map((c) => (
                    <tr key={c.field} className="border-t border-slate-100">
                      <td className="py-1.5 font-semibold">{label(c.field)}</td>
                      <td className="py-1.5 text-slate-500">{value(c.field, c.from)}</td>
                      <td className="py-1.5 font-semibold text-slate-900">
                        {value(c.field, c.to)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {revisions.length === 0 ? (
        <div className={ui.card}>
          <EmptyState icon={<GitCompare size={22} />} title="No specification saved yet">
            Each save of the specification appears here.
          </EmptyState>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
          {revisions.map((revision) => {
            const link = revision.link_id
              ? links.find((l) => l.id === revision.link_id)
              : undefined;
            return (
              <li key={revision.id} className="relative" data-testid="revision-entry">
                <span
                  className="absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-white bg-blue-600 ring-2 ring-blue-100"
                  aria-hidden="true"
                />
                <div className={`${ui.card} p-4 text-xs`}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-bold text-slate-900">
                      {revision.link_id
                        ? `Listing override, revision ${revision.revision_no}`
                        : `Specification revision ${revision.revision_no}`}
                      {link && (
                        <span className="ml-1 font-medium text-slate-500">
                          (product {shortGid(link.shopify_product_id)})
                        </span>
                      )}
                    </p>
                    <p
                      className="text-slate-500"
                      title={new Date(revision.created_at).toLocaleString()}
                    >
                      {who(revision.actor_user_id, revision.actor_role)} ·{" "}
                      {ROLE_LABEL[revision.actor_role] ?? revision.actor_role} ·{" "}
                      {relativeTime(revision.created_at)}
                    </p>
                  </div>
                  {revision.reason && <p className="mt-1 text-slate-600">“{revision.reason}”</p>}
                  <ul className="mt-2 space-y-1">
                    {revision.changes.map((change) => (
                      <li key={change.field} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-slate-700">{label(change.field)}</span>
                        <span className="rounded bg-red-50 px-1.5 text-red-700 line-through decoration-red-300">
                          {value(change.field, change.from)}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          →
                        </span>
                        <span className="sr-only">changed to</span>
                        <span className="rounded bg-emerald-50 px-1.5 font-semibold text-emerald-800">
                          {value(change.field, change.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Collapsible title={`All activity for this model (${activity.length})`}>
        <ul className="divide-y divide-slate-100 text-xs">
          {activity.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-semibold text-slate-800">
                {ACTIVITY_LABEL[row.action] ?? row.action}
              </span>
              <span className="text-slate-500" title={new Date(row.created_at).toLocaleString()}>
                {who(row.actor_user_id, row.actor_role)} · {relativeTime(row.created_at)}
              </span>
            </li>
          ))}
          {activity.length === 0 && <li className="py-2 text-slate-500">Nothing yet.</li>}
        </ul>
      </Collapsible>
    </section>
  );
}

export default HardwareModelDetail;
