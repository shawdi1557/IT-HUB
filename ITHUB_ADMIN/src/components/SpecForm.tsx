// ITHUB_ADMIN/src/components/SpecForm.tsx
// Stage 4B-2, reorganised in 4B-6: a category's specification fields as a form, in a few understandable sections
// (hardware-groups.ts) that open and close, with a filter for required or unknown values. Each field shows its unit,
// whether it's required, what a base model would supply, and why a value isn't accepted, in plain language. "Unknown"
// is always a choice: nothing is filled in by default. The database checks everything again on save.

import { useState } from "react";
import {
  categoryFields,
  formatHardwareValue,
  validateHardwareSpecs,
  type HardwareFieldDefinition,
  type HardwareSpecValues,
} from "../lib/hardware-spec";
import { groupsFor } from "../lib/hardware-groups";
import type { FieldError } from "../lib/hardware";
import { Collapsible, Pill } from "./HardwareUi";

/** What the form holds while it's edited: text for numbers and text, a list for lists. */
export type SpecDraft = Record<string, string | string[]>;

export function valuesToDraft(values: HardwareSpecValues | null | undefined): SpecDraft {
  const draft: SpecDraft = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (Array.isArray(value)) draft[key] = [...value];
    else if (typeof value === "boolean") draft[key] = value ? "yes" : "no";
    else draft[key] = String(value);
  }
  return draft;
}

/** The draft as values: blank means unknown and is left out. Numbers that don't parse are sent as text to be refused. */
export function draftToValues(category: string, draft: SpecDraft): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const definition of categoryFields(category)) {
    const raw = draft[definition.key];
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      const items = raw.map((item) => item.trim()).filter(Boolean);
      if (items.length > 0) values[definition.key] = items;
      continue;
    }
    const text = raw.trim();
    if (!text) continue;
    if (definition.type === "integer" || definition.type === "decimal") {
      const number = Number(text);
      values[definition.key] = Number.isFinite(number) ? number : text;
    } else if (definition.type === "boolean") {
      values[definition.key] = text === "yes";
    } else {
      values[definition.key] = text;
    }
  }
  return values;
}

/** The database's error codes in words staff understand. */
const ERROR_TEXT: Record<string, string> = {
  unknown_field: "This isn't a field of this category.",
  wrong_type: "This needs a different kind of value.",
  not_whole_number: "Enter a whole number, without decimals.",
  too_precise: "Use at most 2 decimal places.",
  below_minimum: "This is lower than the allowed range.",
  above_maximum: "This is higher than the allowed range.",
  not_a_choice: "Choose one of the listed options.",
  too_long: "This is too long.",
  pattern_mismatch: "This isn't in the expected format.",
  empty_list: "Choose at least one, or leave it unknown.",
  inconsistent: "This contradicts another value. Check both.",
};

/** A validation message without the field name prefix, which the field's own label already shows. */
const plainMessage = (definition: HardwareFieldDefinition, message: string) =>
  message.startsWith(`${definition.label}: `)
    ? `${message.slice(definition.label.length + 2)}.`.replace(/^./, (c) => c.toUpperCase())
    : message;

type Filter = "all" | "required" | "unknown";

interface Props {
  category: string;
  draft: SpecDraft;
  onChange: (draft: SpecDraft) => void;
  /** The base model's values: shown for inheritable fields left unknown. */
  inherited?: HardwareSpecValues;
  /** The model's own values, shown beside a listing override form. */
  modelValues?: HardwareSpecValues;
  serverErrors?: FieldError[];
  disabled?: boolean;
  /** Overrides: no required markers (the model supplies the rest). */
  mode?: "model" | "override";
}

export function SpecForm({
  category,
  draft,
  onChange,
  inherited,
  modelValues,
  serverErrors,
  disabled,
  mode = "model",
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const fields = categoryFields(category);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const local = validateHardwareSpecs(category, draftToValues(category, draft));
  const errorFor = (definition: HardwareFieldDefinition) => {
    const localError = local.errors.find((error) => error.field === definition.key);
    if (localError) return plainMessage(definition, localError.message);
    const server = serverErrors?.find((error) => error.field === definition.key);
    return server ? (ERROR_TEXT[server.code] ?? "This value wasn't accepted.") : undefined;
  };
  const isEmpty = (key: string) => {
    const value = draft[key];
    return (
      value === undefined ||
      (Array.isArray(value) ? value.every((item) => !item.trim()) : value.trim() === "")
    );
  };
  const isMissing = (definition: HardwareFieldDefinition) =>
    mode === "model" &&
    definition.required &&
    isEmpty(definition.key) &&
    !(definition.inheritable && inherited?.[definition.key] !== undefined);
  const set = (key: string, value: string | string[]) => onChange({ ...draft, [key]: value });

  if (fields.length === 0) {
    return <p className="text-xs text-slate-500">This category has no specification fields yet.</p>;
  }

  const requiredCount = fields.filter((field) => field.required).length;
  const missingCount = fields.filter(isMissing).length;
  const groups = groupsFor(
    category,
    fields.map((field) => field.key),
  );
  const shown = (definition: HardwareFieldDefinition) =>
    filter === "all" ||
    (filter === "required" && definition.required) ||
    (filter === "unknown" && isEmpty(definition.key));

  return (
    <div className="space-y-3" data-testid="spec-form">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold"
          role="group"
          aria-label="Which fields to show"
          data-testid="spec-filter"
        >
          {(
            [
              ["all", "All fields"],
              ...(mode === "model" ? [["required", "Required only"]] : []),
              ["unknown", "Unknown only"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 ${filter === id ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "model" && (
          <p className="text-xs text-slate-600" data-testid="spec-required-summary">
            {missingCount === 0 ? (
              <span className="font-semibold text-emerald-700">
                All {requiredCount} required values are known.
              </span>
            ) : (
              <>
                <span className="font-semibold text-amber-700">{missingCount} required</span> of{" "}
                {requiredCount} still unknown.
              </>
            )}
          </p>
        )}
      </div>

      {groups.map((group) => {
        const groupFields = group.fields
          .map((key) => byKey.get(key))
          .filter((f): f is HardwareFieldDefinition => Boolean(f));
        const visible = groupFields.filter(shown);
        if (visible.length === 0) return null;
        const missing = groupFields.filter(isMissing).length;
        const errors = groupFields.filter((f) => errorFor(f)).length;
        const known = groupFields.filter((f) => !isEmpty(f.key)).length;
        const hasRequired = groupFields.some((f) => f.required);
        return (
          <Collapsible
            key={`${group.id}-${filter}`}
            testId={`spec-group-${group.id}`}
            defaultOpen={filter !== "all" || errors > 0 || (mode === "model" && hasRequired)}
            title={
              <span>
                {group.title}
                <span className="ml-2 hidden text-xs font-medium text-slate-500 sm:inline">
                  {group.hint}
                </span>
              </span>
            }
            summary={
              errors > 0 ? (
                <Pill tone="danger">{errors} to fix</Pill>
              ) : missing > 0 ? (
                <Pill tone="warning">{missing} required unknown</Pill>
              ) : (
                <Pill tone={known === groupFields.length ? "success" : "neutral"}>
                  {known}/{groupFields.length} known
                </Pill>
              )
            }
          >
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
              {visible.map((definition) => {
                const error = errorFor(definition);
                const missingHere = isMissing(definition);
                const inheritedValue =
                  definition.inheritable && inherited ? inherited[definition.key] : undefined;
                const inputId = `spec-${category}-${definition.key}`;
                return (
                  <div
                    key={definition.key}
                    data-testid={`spec-field-${definition.key}`}
                    data-state={error ? "error" : missingHere ? "missing" : "ok"}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label htmlFor={inputId} className="text-xs font-bold text-slate-800">
                        {definition.label}
                        {definition.unit ? (
                          <span className="font-medium text-slate-500"> ({definition.unit})</span>
                        ) : null}
                      </label>
                      {mode === "model" && definition.required && (
                        <Pill tone={missingHere ? "warning" : "info"}>Required</Pill>
                      )}
                      {definition.inheritable && mode === "model" && <Pill>Can inherit</Pill>}
                    </div>
                    <div className="mt-1.5">
                      <FieldInput
                        id={inputId}
                        definition={definition}
                        value={draft[definition.key]}
                        disabled={disabled}
                        invalid={Boolean(error)}
                        onChange={(v) => set(definition.key, v)}
                      />
                    </div>
                    {error ? (
                      <p className="mt-1 text-[11px] font-semibold text-red-700" role="alert">
                        {error}
                      </p>
                    ) : missingHere ? (
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                        Required: still unknown.
                      </p>
                    ) : null}
                    {isEmpty(definition.key) && inheritedValue !== undefined && (
                      <p className="mt-1 text-[11px] font-medium text-blue-700">
                        Using the base model's value:{" "}
                        {formatHardwareValue(definition, inheritedValue)}
                      </p>
                    )}
                    {mode === "override" && modelValues && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Model value: {formatHardwareValue(definition, modelValues[definition.key])}
                      </p>
                    )}
                    {definition.help && (
                      <p className="mt-1 text-[11px] text-slate-500">{definition.help}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  `w-full rounded-lg border bg-white px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden disabled:bg-slate-50 ${
    invalid ? "border-red-300 focus:border-red-500" : "border-slate-200 focus:border-blue-500"
  }`;

function FieldInput({
  id,
  definition,
  value,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  definition: HardwareFieldDefinition;
  value: string | string[] | undefined;
  disabled?: boolean;
  invalid: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const text = Array.isArray(value) ? "" : (value ?? "");
  const list = Array.isArray(value) ? value : [];
  const common = { id, disabled, "aria-invalid": invalid || undefined };
  switch (definition.type) {
    case "integer":
    case "decimal":
      return (
        <input
          {...common}
          type="number"
          inputMode={definition.type === "integer" ? "numeric" : "decimal"}
          step={definition.type === "integer" ? 1 : 0.01}
          min={definition.min}
          max={definition.max}
          value={text}
          placeholder={`Unknown${definition.min !== undefined && definition.max !== undefined ? ` (${definition.min}–${definition.max})` : ""}`}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass(invalid)}
        />
      );
    case "boolean":
      return (
        <select
          {...common}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass(invalid)}
        >
          <option value="">Unknown</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    case "enum":
      return (
        <select
          {...common}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass(invalid)}
        >
          <option value="">Unknown</option>
          {definition.choices?.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      );
    case "enum_list":
      return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={id} id={id}>
          {definition.choices?.map((choice) => {
            const checked = list.includes(choice);
            return (
              <label
                key={choice}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  checked
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-blue-600"
                  checked={checked}
                  disabled={disabled}
                  onChange={() =>
                    onChange(checked ? list.filter((item) => item !== choice) : [...list, choice])
                  }
                />
                {choice}
              </label>
            );
          })}
        </div>
      );
    case "text_list":
      return (
        <textarea
          {...common}
          rows={2}
          value={list.join("\n")}
          placeholder="Unknown. One entry per line"
          onChange={(event) => onChange(event.target.value.split("\n"))}
          className={inputClass(invalid)}
        />
      );
    default:
      return (
        <input
          {...common}
          type="text"
          value={text}
          maxLength={definition.maxLength}
          placeholder="Unknown"
          onChange={(event) => onChange(event.target.value)}
          className={inputClass(invalid)}
        />
      );
  }
}

/** How many required values are known, for lists and badges. */
export function completenessOf(
  category: string,
  values: HardwareSpecValues,
  inherited?: HardwareSpecValues,
) {
  const fields = categoryFields(category);
  const required = fields.filter((field) => field.required);
  const known = required.filter(
    (field) =>
      values[field.key] !== undefined ||
      (field.inheritable && inherited?.[field.key] !== undefined),
  );
  return {
    required: required.length,
    known: known.length,
    complete: known.length === required.length,
    missing: required.filter((field) => !known.includes(field)).map((field) => field.label),
  };
}
