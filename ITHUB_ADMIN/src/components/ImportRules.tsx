// ITHUB_ADMIN/src/components/ImportRules.tsx
// Shopify Hardware Importer: the category rules. Which Shopify category, product type, tag or collection means which
// registry category, or "not hardware". Everyone with importer access sees them; only administrators change them
// (staff_save_import_category_rule refuses anyone else).

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  MATCH_FIELD,
  importMessage,
  saveImportRule,
  type ImportRuleRow,
} from "../lib/hardware-import";
import type { HardwareCategoryRow } from "../lib/hardware";
import { Notice, Pill, ui } from "./HardwareUi";

interface Draft {
  id: string | null;
  version: number | null;
  matchField: string;
  matchValue: string;
  categoryId: string;
  priority: string;
  isActive: boolean;
  note: string;
}

const NOT_HARDWARE = "__none__";
const blank: Draft = {
  id: null,
  version: null,
  matchField: "category",
  matchValue: "",
  categoryId: "",
  priority: "100",
  isActive: true,
  note: "",
};

export function ImportRules({
  rules,
  categories,
  admin,
  onChanged,
}: {
  rules: ImportRuleRow[];
  categories: HardwareCategoryRow[];
  admin: boolean;
  onChanged: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const label = (id: string | null) =>
    id === null ? "Not hardware" : (categories.find((c) => c.id === id)?.label ?? id);

  const save = async () => {
    if (!draft || saving) return;
    if (!draft.categoryId) {
      setError("Choose a category, or Not hardware.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveImportRule({
      id: draft.id,
      version: draft.version,
      matchField: draft.matchField,
      matchValue: draft.matchValue,
      categoryId: draft.categoryId === NOT_HARDWARE ? null : draft.categoryId,
      priority: Number(draft.priority) || 0,
      isActive: draft.isActive,
      note: draft.note,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message ?? importMessage(res.code));
      return;
    }
    setDraft(null);
    onChanged(draft.id ? "Rule saved." : "Rule added.");
  };

  const edit = (rule: ImportRuleRow) =>
    setDraft({
      id: rule.id,
      version: rule.version,
      matchField: rule.match_field,
      matchValue: rule.match_value,
      categoryId: rule.category_id ?? NOT_HARDWARE,
      priority: String(rule.priority),
      isActive: rule.is_active,
      note: rule.note ?? "",
    });

  return (
    <div className="space-y-4" data-testid="import-rules">
      <p className="text-xs text-slate-600">
        A product takes the first active rule it matches, lowest priority number first: its Shopify
        category, then product type, tags and collections. Matching ignores case, spaces and
        punctuation. After changing rules, use "Re-check" on a session to apply them.
      </p>
      {!admin && (
        <Notice tone="info" testId="import-rules-readonly">
          Only administrators change category rules. Ask one if a product keeps landing in the wrong
          category.
        </Notice>
      )}
      {error && (
        <Notice tone="error" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}
      {admin && !draft && (
        <button
          className={ui.primary}
          onClick={() => setDraft({ ...blank })}
          data-testid="import-rule-add"
        >
          <Plus size={14} /> Add rule
        </button>
      )}
      {admin && draft && (
        <div className={`${ui.card} space-y-3 p-4`} data-testid="import-rule-form">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={ui.label}>
              Matches
              <select
                className={`${ui.input} mt-1`}
                value={draft.matchField}
                onChange={(e) => setDraft({ ...draft, matchField: e.target.value })}
              >
                {Object.entries(MATCH_FIELD).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label className={ui.label}>
              Value
              <input
                className={`${ui.input} mt-1`}
                value={draft.matchValue}
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, matchValue: e.target.value })}
                data-testid="import-rule-value"
              />
            </label>
            <label className={ui.label}>
              Registry category
              <select
                className={`${ui.input} mt-1`}
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                data-testid="import-rule-category"
              >
                <option value="">Choose…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                <option value={NOT_HARDWARE}>Not hardware (never import)</option>
              </select>
            </label>
            <label className={ui.label}>
              Priority
              <input
                className={`${ui.input} mt-1`}
                type="number"
                min={0}
                max={10000}
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              />
            </label>
          </div>
          <label className={ui.label}>
            Note
            <input
              className={`${ui.input} mt-1`}
              value={draft.note}
              maxLength={300}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="flex gap-2">
            <button
              className={ui.primary}
              onClick={save}
              disabled={saving || !draft.matchValue.trim()}
              data-testid="import-rule-save"
            >
              Save rule
            </button>
            <button className={ui.button} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={`${ui.card} overflow-x-auto`}>
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Matches</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">State</th>
              {admin && <th className="px-3 py-2" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr
                key={rule.id}
                className="border-b border-slate-50 last:border-0"
                data-testid="import-rule-row"
              >
                <td className="px-3 py-2 tabular-nums">{rule.priority}</td>
                <td className="px-3 py-2">{MATCH_FIELD[rule.match_field] ?? rule.match_field}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">
                  {rule.match_value}
                  {rule.note && (
                    <span className="block text-[11px] font-normal text-slate-500">
                      {rule.note}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Pill tone={rule.category_id ? "info" : "neutral"}>
                    {label(rule.category_id)}
                  </Pill>
                </td>
                <td className="px-3 py-2">{rule.is_active ? "Active" : "Off"}</td>
                {admin && (
                  <td className="px-3 py-2 text-right">
                    <button
                      className={ui.button}
                      onClick={() => edit(rule)}
                      aria-label={`Edit the rule for ${rule.match_value}`}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ImportRules;
