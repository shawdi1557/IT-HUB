// ITHUB_ADMIN/src/components/ImportItemPanel.tsx
// Shopify Hardware Importer: one discovered product. What Shopify says about it, the proposal (category, manufacturer,
// model name and part number) with corrections, the registry match and duplicate candidates, and what an import of
// it will do. Saving goes through staff_update_import_item; nothing is imported from here.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ExternalLink, Plus, Save } from "lucide-react";
import {
  IMPORT_DECISION,
  IMPORT_STATUS,
  RESULT_ACTION,
  allowedDecisions,
  importMessage,
  updateImportItem,
  type ImportItemRow,
} from "../lib/hardware-import";
import { saveManufacturer, type HardwareCategoryRow, type ManufacturerRow } from "../lib/hardware";
import { Notice, Pill, ui } from "./HardwareUi";

const shortId = (gid: string) => gid.split("/").pop() ?? gid;

export function ImportItemPanel({
  item,
  categories,
  manufacturers,
  onSaved,
  onManufacturerAdded,
}: {
  item: ImportItemRow;
  categories: HardwareCategoryRow[];
  manufacturers: ManufacturerRow[];
  onSaved: (row: ImportItemRow) => void;
  onManufacturerAdded: (row: ManufacturerRow) => void;
}) {
  const [categoryId, setCategoryId] = useState(item.category_id ?? "");
  const [manufacturerId, setManufacturerId] = useState(item.manufacturer_id ?? "");
  const [modelName, setModelName] = useState(item.model_name ?? "");
  const [modelNumber, setModelNumber] = useState(item.model_number ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newMaker, setNewMaker] = useState(
    item.vendor && item.vendor !== "IT-HUB" ? item.vendor : "",
  );

  useEffect(() => {
    setCategoryId(item.category_id ?? "");
    setManufacturerId(item.manufacturer_id ?? "");
    setModelName(item.model_name ?? "");
    setModelNumber(item.model_number ?? "");
    setError(null);
  }, [item.id, item.version]);

  const done = item.status === "imported";
  const status = IMPORT_STATUS[item.status];
  const dirty =
    categoryId !== (item.category_id ?? "") ||
    manufacturerId !== (item.manufacturer_id ?? "") ||
    modelName !== (item.model_name ?? "") ||
    modelNumber !== (item.model_number ?? "");

  const save = async (extra: Parameters<typeof updateImportItem>[1] = {}) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await updateImportItem(item, {
      categoryId: categoryId && categoryId !== item.category_id ? categoryId : null,
      manufacturerId:
        manufacturerId && manufacturerId !== item.manufacturer_id ? manufacturerId : null,
      modelName: modelName.trim() && modelName !== item.model_name ? modelName : null,
      modelNumber: modelNumber !== (item.model_number ?? "") ? modelNumber : undefined,
      ...extra,
    });
    setSaving(false);
    if (!res.ok || !res.data) {
      setError(res.message ?? importMessage(res.code));
      return;
    }
    onSaved(res.data);
  };

  const addManufacturer = async () => {
    const name = newMaker.trim();
    if (!name) return;
    setSaving(true);
    const res = await saveManufacturer({ name });
    setSaving(false);
    if (!res.ok || !res.data) {
      setError(res.message ?? "The manufacturer couldn't be added.");
      return;
    }
    onManufacturerAdded(res.data);
    setManufacturerId(res.data.id);
    setAdding(false);
  };

  const maker = (id: string | null) => manufacturers.find((m) => m.id === id)?.name ?? "—";
  const decisions = allowedDecisions(item.status);

  return (
    <div className="space-y-4" data-testid="import-item-panel">
      {error && (
        <Notice tone="error" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* What Shopify says */}
        <section className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            In Shopify
          </p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            <dt className="font-semibold text-slate-500">Product ID</dt>
            <dd className="break-all font-mono">{shortId(item.shopify_product_id)}</dd>
            <dt className="font-semibold text-slate-500">Vendor</dt>
            <dd>{item.vendor ?? "—"}</dd>
            <dt className="font-semibold text-slate-500">Category</dt>
            <dd>{item.shopify_category ?? "—"}</dd>
            <dt className="font-semibold text-slate-500">Product type</dt>
            <dd>{item.product_type ?? "—"}</dd>
            <dt className="font-semibold text-slate-500">Tags</dt>
            <dd className="break-words">{item.tags.length ? item.tags.join(", ") : "—"}</dd>
            <dt className="font-semibold text-slate-500">Collections</dt>
            <dd className="break-words">
              {item.collections.length ? item.collections.join(", ") : "—"}
            </dd>
            <dt className="font-semibold text-slate-500">Builder's guess</dt>
            <dd>{item.suggested_category_id ?? "None"}</dd>
          </dl>
          {item.variants.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-left">
                <thead className="text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">Variant</th>
                    <th className="py-1 pr-2">SKU</th>
                    <th className="py-1 pr-2">Price</th>
                    <th className="py-1">For sale</th>
                  </tr>
                </thead>
                <tbody>
                  {item.variants.slice(0, 12).map((v) => (
                    <tr key={v.id} className="border-t border-slate-200">
                      <td className="py-1 pr-2">{v.title ?? shortId(v.id)}</td>
                      <td className="py-1 pr-2 font-mono">{v.sku ?? "—"}</td>
                      <td className="py-1 pr-2">
                        {v.price ? `${v.currency ?? ""} ${v.price}` : "—"}
                      </td>
                      <td className="py-1">
                        {v.available === null ? "—" : v.available ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {item.variants.length > 12 && (
                <p className="mt-1 text-slate-500">and {item.variants.length - 12} more variants</p>
              )}
            </div>
          )}
        </section>

        {/* The proposal */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={status.tone} testId="import-item-status">
              {status.label}
            </Pill>
            {item.category_source && (
              <span className="text-[11px] text-slate-500">
                Category {item.category_source === "manual" ? "chosen by staff" : "from a rule"}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600">{status.help}</p>
          {item.review_reasons.map((reason) => (
            <p key={reason} className="text-xs font-semibold text-amber-700">
              {reason}
            </p>
          ))}
          {item.error && item.status !== "imported" && (
            <p className="text-xs font-semibold text-red-700" data-testid="import-item-error">
              Last attempt: {importMessage(item.error.code)}
            </p>
          )}
          {item.status === "failed" && !dirty && (
            <button
              className={ui.button}
              onClick={() => save()}
              disabled={saving}
              data-testid="import-recheck-item"
            >
              Re-check against the registry
            </button>
          )}

          {done ? (
            <div className="space-y-2 text-xs">
              <p>
                <strong>{RESULT_ACTION[item.result_action ?? ""] ?? "Done"}</strong>:{" "}
                {item.model_name}
                {item.model_number ? ` (${item.model_number})` : ""}, {maker(item.manufacturer_id)}
              </p>
              {item.result_model_id && (
                <Link
                  to={`/hardware/${item.result_model_id}`}
                  className={ui.primary}
                  data-testid="import-open-model"
                >
                  <ExternalLink size={14} /> Open in the Specification Manager
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={ui.label}>
                  Category
                  <select
                    className={`${ui.input} mt-1`}
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    data-testid="import-category"
                  >
                    <option value="">Choose…</option>
                    {categories
                      .filter((c) => c.is_active)
                      .map((c) => (
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
                    data-testid="import-manufacturer"
                  >
                    <option value="">Choose…</option>
                    {manufacturers
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {adding ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className={`${ui.label} min-w-0 flex-1`}>
                    New manufacturer
                    <input
                      className={`${ui.input} mt-1`}
                      value={newMaker}
                      maxLength={80}
                      onChange={(e) => setNewMaker(e.target.value)}
                      data-testid="import-new-manufacturer"
                    />
                  </label>
                  <button
                    className={ui.button}
                    onClick={addManufacturer}
                    disabled={saving || !newMaker.trim()}
                  >
                    Add
                  </button>
                  <button className={ui.button} onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                  onClick={() => setAdding(true)}
                  data-testid="import-add-manufacturer"
                >
                  <Plus size={12} /> Manufacturer not listed? Add it
                </button>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={ui.label}>
                  Exact model name
                  <input
                    className={`${ui.input} mt-1`}
                    value={modelName}
                    maxLength={120}
                    onChange={(e) => setModelName(e.target.value)}
                    data-testid="import-model-name"
                  />
                </label>
                <label className={ui.label}>
                  Part number (MPN)
                  <input
                    className={`${ui.input} mt-1`}
                    value={modelNumber}
                    maxLength={80}
                    placeholder="Optional"
                    onChange={(e) => setModelNumber(e.target.value)}
                    data-testid="import-model-number"
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                The name comes from the Shopify title. Shorten it to the exact model (no marketing
                words) and add the part number when you know it: that's how duplicates are found.
              </p>
              <button
                className={ui.primary}
                onClick={() => save()}
                disabled={!dirty || saving}
                data-testid="import-save"
              >
                <Save size={14} /> Save corrections
              </button>

              {item.status === "possible_duplicate" && (
                <div
                  className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs"
                  data-testid="import-duplicates"
                >
                  <p className="font-bold text-amber-900">Similar models in the registry</p>
                  {item.duplicate_candidates.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/hardware/${c.id}`}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        {c.model_name}
                        {c.model_number ? ` (${c.model_number})` : ""}
                      </Link>
                      <button
                        className={
                          item.decision === "link_existing" && item.target_model_id === c.id
                            ? ui.primary
                            : ui.button
                        }
                        disabled={saving || dirty}
                        onClick={() => save({ decision: "link_existing", targetModelId: c.id })}
                        data-testid="import-link-candidate"
                      >
                        {item.decision === "link_existing" && item.target_model_id === c.id
                          ? "Will link to this"
                          : "Same product: link"}
                      </button>
                    </div>
                  ))}
                  <button
                    className={item.decision === "import_new" ? ui.primary : ui.button}
                    disabled={saving || dirty}
                    onClick={() => save({ decision: "import_new", confirmDistinct: true })}
                    data-testid="import-confirm-distinct"
                  >
                    {item.decision === "import_new"
                      ? "Will create a new model"
                      : "It's a different product: create new"}
                  </button>
                </div>
              )}

              {decisions.length > 0 && (
                <div className="space-y-1">
                  <p className={ui.label}>When imported</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Import action">
                    {decisions
                      .filter((d) => !(item.status === "possible_duplicate" && d !== "skip"))
                      .map((d) => (
                        <button
                          key={d}
                          className={item.decision === d ? ui.primary : ui.button}
                          aria-pressed={item.decision === d}
                          disabled={saving || dirty || item.decision === d}
                          onClick={() => save({ decision: d })}
                          data-testid={`import-decision-${d}`}
                        >
                          {IMPORT_DECISION[d]}
                        </button>
                      ))}
                  </div>
                  {dirty && (
                    <p className="text-[11px] text-slate-500">Save your corrections first.</p>
                  )}
                  {item.decision === "link_existing" &&
                    item.target_model_id &&
                    item.status === "exact_match" && (
                      <Link
                        to={`/hardware/${item.target_model_id}`}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        View the matching model
                      </Link>
                    )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default ImportItemPanel;
