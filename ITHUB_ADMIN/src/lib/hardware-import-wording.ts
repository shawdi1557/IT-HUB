// ITHUB_ADMIN/src/lib/hardware-import-wording.ts
// Shopify Hardware Importer: what each status, decision and refusal means for staff, and the CSV export. Import-free,
// so the unit and database tests can check it against the real functions.

export type ImportStatus =
  | "eligible"
  | "already_linked"
  | "exact_match"
  | "possible_duplicate"
  | "unmapped"
  | "needs_review"
  | "excluded"
  | "imported"
  | "failed"
  | "skipped";

export type ImportDecision = "import_new" | "link_existing" | "refresh_link" | "skip";

export type WordingTone = "neutral" | "info" | "success" | "warning" | "danger";

export const IMPORT_STATUS: Record<
  ImportStatus,
  { label: string; tone: WordingTone; help: string }
> = {
  eligible: {
    label: "Ready to import",
    tone: "info",
    help: "No matching model in the registry: importing creates a new model and links this listing to it.",
  },
  already_linked: {
    label: "Already linked",
    tone: "neutral",
    help: "This listing is already linked to a registry model. Nothing to import; you can refresh its Shopify title.",
  },
  exact_match: {
    label: "Exact match",
    tone: "success",
    help: "A registry model has exactly this manufacturer, name and part number: importing links the listing to it.",
  },
  possible_duplicate: {
    label: "Possible duplicate",
    tone: "warning",
    help: "Similar models exist. Link to one of them, or confirm this is a different product.",
  },
  unmapped: {
    label: "Category needed",
    tone: "warning",
    help: "No category rule matches this product. Choose its category, or ask an administrator to add a rule.",
  },
  needs_review: {
    label: "Manufacturer needed",
    tone: "warning",
    help: "The Shopify vendor isn't a registered manufacturer. Choose or add the manufacturer.",
  },
  excluded: {
    label: "Not hardware",
    tone: "neutral",
    help: "A category rule marks this product as not PC hardware. It's never imported unless you choose a category.",
  },
  imported: {
    label: "Done",
    tone: "success",
    help: "Imported or linked. Open the model to complete its specification.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    help: "The last import attempt failed. Correct it and try again.",
  },
  skipped: {
    label: "Skipped",
    tone: "neutral",
    help: "Skipped on purpose. Choose another action to bring it back.",
  },
};

export const IMPORT_DECISION: Record<ImportDecision, string> = {
  import_new: "Create a new model",
  link_existing: "Link to an existing model",
  refresh_link: "Refresh the link's Shopify title",
  skip: "Skip",
};

/**
 * The actions staff may choose for an item in each status: the same rule staff_update_import_item applies (it refuses
 * anything else with decision_not_allowed). "link_existing" and "import_new" for a possible duplicate are chosen from
 * its candidates, with "import_new" only after confirming the product is different.
 */
export function allowedDecisions(status: ImportStatus): ImportDecision[] {
  switch (status) {
    case "already_linked":
      return ["skip", "refresh_link"];
    case "exact_match":
      return ["link_existing", "skip"];
    case "eligible":
      return ["import_new", "skip"];
    case "possible_duplicate":
      return ["link_existing", "import_new", "skip"];
    case "excluded":
    case "unmapped":
    case "needs_review":
    case "failed":
    case "skipped":
      return ["skip"];
    default:
      return [];
  }
}

export const RESULT_ACTION: Record<string, string> = {
  created_model: "New model created",
  linked_existing: "Linked to an existing model",
  refreshed_link: "Link refreshed",
  already_linked: "Already linked",
  skipped: "Skipped",
};

export const MATCH_FIELD: Record<string, string> = {
  category: "Shopify category",
  product_type: "Product type",
  tag: "Tag",
  collection: "Collection",
};

/** The database's and the Edge Function's refusal codes, for staff. */
export const IMPORT_MESSAGES: Record<string, string> = {
  forbidden: "Your role can't use the Shopify importer.",
  sign_in_required: "Please sign in again.",
  stale_version: "Someone else changed this item while you had it open. Reload, then try again.",
  import_item_not_found: "This item couldn't be found.",
  import_item_done: "This item has already been imported.",
  import_session_not_found: "This import session couldn't be found.",
  import_session_not_ready: "This session can't import: its discovery didn't finish.",
  import_session_not_discovering: "This session's discovery has already finished.",
  decision_required:
    "Choose what to do with this item first (its category, manufacturer or duplicate check).",
  decision_not_allowed: "That action doesn't fit this item now. Check its status and try again.",
  decision_invalid: "Choose a valid action.",
  items_invalid: "Choose between 1 and 200 items.",
  category_invalid: "Choose an active category.",
  manufacturer_invalid: "Choose an active manufacturer.",
  model_name_invalid: "Enter the exact model name (2 to 120 characters).",
  model_number_invalid: "The part number can be at most 80 characters.",
  model_not_linkable: "Choose an active model that isn't a base model.",
  duplicate_model: "A model with exactly this manufacturer, name and part number already exists.",
  possible_duplicate: "Similar models exist: link to one, or confirm this one is different.",
  listing_already_linked: "This Shopify listing was linked meanwhile. Reload the session.",
  model_archived: "That model is archived.",
  duplicate_rule: "A rule for this value already exists.",
  match_field_invalid: "Choose what the rule matches.",
  match_value_invalid: "Enter the value to match (up to 120 characters).",
  priority_invalid: "Priority must be between 0 and 10,000.",
  rule_not_found: "This rule couldn't be found.",
  discovery_running: "A discovery is already running. Wait for it to finish, then refresh.",
  shopify_not_configured: "Shopify's Storefront connection isn't configured for the importer.",
  shopify_unauthorized: "Shopify refused the Storefront credential.",
  shopify_throttled: "Shopify is limiting requests. Try again in a minute.",
  shopify_unavailable: "Shopify couldn't be reached. Try again later.",
  shopify_query_failed: "Shopify refused the product query.",
  shopify_invalid_response: "Shopify's answer couldn't be read.",
  staging_failed: "The products couldn't be saved for review.",
  products_invalid: "Shopify sent a page of products that couldn't be read.",
  product_invalid: "Shopify sent a product that couldn't be read.",
  database_unavailable: "The database couldn't be reached. Try again.",
  not_configured: "The importer service isn't configured.",
  failed: "That didn't work. Please try again.",
};

export const importMessage = (code: string | null | undefined) =>
  IMPORT_MESSAGES[String(code ?? "")] ?? IMPORT_MESSAGES.failed;

/** The fields a CSV export carries, in order. */
export interface ImportCsvRow {
  title: string;
  shopify_product_id: string;
  vendor: string | null;
  shopify_category: string | null;
  product_type: string | null;
  category_id: string | null;
  manufacturer: string | null;
  model_name: string | null;
  model_number: string | null;
  status: string;
  decision: string | null;
  result_action: string | null;
  error: string | null;
}

const CSV_COLUMNS: (keyof ImportCsvRow)[] = [
  "title",
  "shopify_product_id",
  "vendor",
  "shopify_category",
  "product_type",
  "category_id",
  "manufacturer",
  "model_name",
  "model_number",
  "status",
  "decision",
  "result_action",
  "error",
];

/**
 * One CSV cell: quoted when needed, and a leading = + - @ (or tab / carriage return) neutralised so a spreadsheet
 * never runs a Shopify title as a formula.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function importCsv(rows: ImportCsvRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
