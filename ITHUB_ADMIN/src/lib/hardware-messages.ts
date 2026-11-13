// ITHUB_ADMIN/src/lib/hardware-messages.ts
// Stage 4B: what the database's refusals mean for staff, and how a refusal becomes a result. Import-free, so the
// database tests can check it against the real functions.

/** What the database's refusal codes mean, for staff to read. */
export const HARDWARE_MESSAGES: Record<string, string> = {
  forbidden: "Your role can't make this change.",
  stale_version:
    "Someone else changed this while you had it open. Reload to see the latest, then try again.",
  duplicate_model: "A model with exactly this manufacturer, name and part number already exists.",
  possible_duplicate:
    "Similar models already exist. Check they aren't the same product; if this one is different, confirm and save again.",
  duplicate_manufacturer: "A manufacturer with this name already exists.",
  specs_invalid: "Some values aren't valid. Check the highlighted fields.",
  category_invalid: "Choose an active category.",
  manufacturer_invalid: "Choose an active manufacturer.",
  manufacturer_name_invalid: "Enter the manufacturer's name (up to 80 characters).",
  website_url_invalid: "The website must be an https:// address.",
  model_name_invalid: "Enter the exact model name (2 to 120 characters).",
  model_number_invalid: "The part number can be at most 80 characters.",
  base_model_invalid: "The base model must be an active base model of the same category.",
  model_archived: "This model is archived. Restore it first.",
  model_has_links:
    "This model still has Shopify listings linked. Remove or move those links first.",
  model_is_base: "Other models inherit from this base model. Change them first.",
  base_model_not_linkable:
    "A base model is a reference record and can't be linked to a Shopify listing.",
  model_not_linkable: "Choose an active model that isn't a base model.",
  listing_already_linked:
    "This Shopify listing is already linked to a model. Change that link instead.",
  shopify_id_invalid: "Enter a Shopify product or variant ID (a number or a gid://shopify/… ID).",
  link_removed: "This link has been removed.",
  reason_required: "Please give a reason (at least 3 characters).",
  reason_invalid: "The reason must be 3 to 1,000 characters.",
  no_change: "Nothing changed.",
  category_label_invalid: "Enter a label (up to 60 characters).",
  sort_order_invalid: "The order must be between 0 and 10,000.",
  model_not_found: "This model couldn't be found.",
  link_not_found: "This link couldn't be found.",
  mapping_not_found: "This mapping couldn't be found.",
  category_not_found: "This category couldn't be found.",
  manufacturer_not_found: "This manufacturer couldn't be found.",
  failed: "The change couldn't be saved. Please try again.",
};

export interface FieldError {
  field: string;
  code: string;
}

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
  /** For specs_invalid: each field and why. For possible_duplicate: the candidates. */
  fieldErrors?: FieldError[];
  duplicates?: { id: string; model_name: string; model_number: string | null }[];
}

/** Maps a database refusal: the database raises the code as the message, with JSON detail for some. */
export function hardwareError<T>(
  error: { message?: string; details?: string | null } | null,
): ActionResult<T> {
  const code = String(error?.message ?? "").trim();
  const known = code in HARDWARE_MESSAGES ? code : "failed";
  const result: ActionResult<T> = { ok: false, code: known, message: HARDWARE_MESSAGES[known] };
  if (error?.details) {
    try {
      const detail = JSON.parse(error.details);
      if (known === "specs_invalid" && Array.isArray(detail)) result.fieldErrors = detail;
      if (known === "possible_duplicate" && Array.isArray(detail)) result.duplicates = detail;
    } catch {
      // Detail that isn't JSON is ignored.
    }
  }
  return result;
}
