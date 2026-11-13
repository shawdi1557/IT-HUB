// ITHUB_ADMIN/src/lib/quotation-records.ts
// What the quotation server stores about a submitted PC build, as the Staff Portal reads it (Stage 4S-5).
//
// These are copies of the server's record types in supabase/functions/verify-and-submit-pc-quotation/
// (specs.ts, assess.ts, structure.ts). The portal is a separate app and can't import them. A drift test
// (supabase/functions/tests/pc-builder-stage4s5-portal-types.test.ts) fails if a server record gains, loses
// or changes a field these don't accept. Slot names are plain strings here; the server narrows them.
//
// This file must stay import-free: the drift test loads it from Deno.

export type CompatibilityStatus = "compatible" | "incompatible" | "conditional" | "unknown";
export type BuildState = "incompatible" | "incomplete" | "needs_review" | "complete";
export type SpecConfidence =
  | "manufacturer_verified"
  | "it_hub_reviewed"
  | "supplier_provided"
  | "title_inferred"
  | "unknown";

// ── Stage 4S-2: one part's specifications ───────────────────────────────────────────────────────────

export type SpecFieldStatus = "verified" | "uncertain" | "missing" | "conflicting" | "invalid";
export type SpecOrigin =
  | "code_registry"
  | "database_registry"
  // Stage 4B: the Hardware Specification Manager.
  | "hardware_registry"
  | "shopify_metafield"
  | "product_title"
  | "unattributed";

export interface ServerSpecField {
  field: string;
  status: SpecFieldStatus;
  value?: unknown;
  confidence: SpecConfidence;
  origin?: SpecOrigin;
  metafield?: string;
  critical: boolean;
}

export type PartSpecStatus =
  | "unresolved"
  | "problem"
  | "incomplete"
  | "uncertain"
  | "verified"
  | "not_applicable";

export type SpecUnresolvedReason =
  | "shopify_unavailable"
  | "answer_unreliable"
  | "malformed_answer"
  | "not_resolvable"
  // Stage 4B: the hardware registry couldn't be read.
  | "registry_unavailable";

export interface ServerSpecRecord {
  resolvedBy: "server";
  stage: "4S-2";
  status: PartSpecStatus;
  reason?: SpecUnresolvedReason;
  reviewRequired: boolean;
  slotBasis: "shopify_fields" | "title" | "unconfirmed";
  variantId: string | null;
  productId: string | null;
  registryKey?: string;
  // Stage 4B: the canonical model and revisions the values came from.
  hardwareRecord?: {
    modelId: string;
    linkId: string;
    specRevision: number;
    overrideRevision: number;
    sources: Record<string, string>;
  };
  provenance?: string;
  isVerified?: boolean;
  fields: ServerSpecField[];
  missingCritical: string[];
  problems: {
    kind: "invalid" | "conflict" | "review" | "rejected";
    field: string;
    detail: string;
  }[];
  unsupported: string[];
  browserDifferences?: { field: string; browser: string; server: unknown }[];
}

// ── Stage 4S-1/4S-2: a stored part ─────────────────────────────────────────────────────────────────

export interface QuotePart {
  slot: string;
  owned?: true;
  productId?: string;
  variantId: string | null;
  title: string;
  name: string;
  price: number;
  quantity?: number;
  isShopifyLive: boolean;
  specs?: Record<string, unknown>;
  slotCheck?: "shopify_fields" | "title" | "unconfirmed";
  reportedProductId?: string;
  serverSpecs?: ServerSpecRecord;
}

// ── Stage 4S-3: the server's verdict ───────────────────────────────────────────────────────────────

export interface RecordedCheck {
  ruleId: string;
  slots: string[];
  label: string;
}

export type ReviewReason =
  | { kind: "unconfirmed_part"; slot: string }
  | { kind: "check"; ruleId: string }
  | { kind: "owned_part"; slot: string }
  | { kind: "engine_review" };

export interface BrowserComparison {
  compared: boolean;
  agrees: boolean | null;
  differences: {
    field: "status" | "valid" | "complete";
    browser: string | boolean;
    server: string | boolean;
  }[];
  errorRules: { onlyServer: string[]; onlyBrowser: string[] };
}

export type QuotePurpose =
  | "gaming"
  | "creation"
  | "work"
  | "programming"
  | "professional"
  | "general";

export interface ServerAssessmentRecord {
  assessedBy: "server";
  stage: "4S-3";
  state: BuildState | "not_assessed";
  reason?: "specifications_unresolved";
  unresolvedSlots?: string[];
  purpose: QuotePurpose | null;
  compatibilityStatus?: CompatibilityStatus;
  mismatches: RecordedCheck[];
  gaps: { slot: string; need: "missing" | "unconfirmed"; reason: string }[];
  reviewReasons: ReviewReason[];
  reviewChecks: RecordedCheck[];
  advice: RecordedCheck[];
  ownedSlots: string[];
  power?: { estimatedSystemLoadWatts: number; recommendedPsuWatts: number };
  browserStatus: CompatibilityStatus | "unrecognised" | null;
  agreesWithBrowser: boolean | null;
  browserComparison: BrowserComparison;
}

// ── Display wording ────────────────────────────────────────────────────────────────────────────────

export const BUILD_STATE_LABELS: Record<ServerAssessmentRecord["state"], string> = {
  complete: "Complete",
  needs_review: "Needs review",
  incomplete: "Incomplete",
  incompatible: "Incompatible",
  not_assessed: "Not assessed (specifications unresolved)",
};

export const SPEC_STATUS_LABELS: Record<PartSpecStatus, string> = {
  verified: "Verified",
  uncertain: "Uncertain",
  incomplete: "Incomplete",
  problem: "Problem",
  unresolved: "Unresolved",
  not_applicable: "Not applicable",
};

export const SLOT_CHECK_LABELS: Record<NonNullable<QuotePart["slotCheck"]>, string> = {
  shopify_fields: "Confirmed by Shopify fields",
  title: "Matched by title only",
  unconfirmed: "Not confirmed",
};

export const REVIEW_REASON_LABEL = (reason: ReviewReason): string => {
  switch (reason.kind) {
    case "unconfirmed_part":
      return `Part need not confirmed: ${reason.slot}`;
    case "check":
      return `Check ${reason.ruleId}`;
    case "owned_part":
      return `Customer's own part: ${reason.slot}`;
    case "engine_review":
      return "Held for review by the engine";
  }
};

/** Older rows have no server verdict: they were stored before Stage 4S-4. */
export const NOT_RECORDED = "Not recorded (before 4S-4)";
/** The single free-text column staff used before Stage 4S-5. Read-only now. */
export const LEGACY_NOTES_LABEL = "Notes (before 4S-5)";
/** No assembly choice is recorded on a quotation yet. */
export const ASSEMBLY_NOT_SET = "Not set";

/** Reads a stored server verdict, or null when there is none (or it isn't one). */
export function readServerAssessment(value: unknown): ServerAssessmentRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ServerAssessmentRecord>;
  return record.assessedBy === "server" && typeof record.state === "string"
    ? (record as ServerAssessmentRecord)
    : null;
}

/** The stored parts in slot order as the server wrote them; older rows may be an array or lack fields. */
export function readQuoteParts(value: unknown): QuotePart[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, any>).map(([slot, part]) => ({ slot, ...part }))
      : [];
  return list
    .filter((part): part is Record<string, any> => Boolean(part) && typeof part === "object")
    .map((part) => ({
      ...part,
      slot: String(part.slot ?? part.type ?? "Part"),
      title: String(part.title ?? part.name ?? "Custom component"),
      name: String(part.name ?? part.title ?? "Custom component"),
      price: Number(part.price) || 0,
      variantId: typeof part.variantId === "string" ? part.variantId : null,
      isShopifyLive: part.isShopifyLive === true,
    })) as QuotePart[];
}
