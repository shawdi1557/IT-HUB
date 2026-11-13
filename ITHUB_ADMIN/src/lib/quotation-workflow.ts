// ITHUB_ADMIN/src/lib/quotation-workflow.ts
// The Staff Portal's view of the quotation workflow (Stage 4S-5): the approved transition matrix (D11), the review
// gate and escalation rule (E1, E2), and what each database refusal means. For display only: the database
// (migration 20261111000002) decides every one of these again, and the portal can't override it.
//
// This file must stay import-free: Deno unit tests load it, and one of them checks this matrix against the
// migration's own (supabase/functions/tests/pc-builder-stage4s5-portal-types.test.ts).

/** The signed-in staff member's role, as `get_staff_portal_profile` reports it (auth.ts StaffRole). */
export type WorkflowRole = "portal_admin" | "quotation_staff" | "service_staff";

export type QuotationStatus =
  | "Draft"
  | "New"
  | "Contacted"
  | "Quoted"
  | "Closed"
  | "Archived"
  | "Withdrawn";

// ── The approved matrix (D11), mirrored for display only ────────────────────────────────────────────

export interface TransitionOption {
  to: QuotationStatus;
  reasonRequired: boolean;
  adminOnly: boolean;
  /** Moving into Quoted: a flagged quotation needs a completed "Checked – Suitable" review first. */
  gated: boolean;
  /** Restoring an archived quotation: only to the state it was archived from. */
  restore: boolean;
}

export const MATRIX: [
  from: QuotationStatus,
  to: QuotationStatus,
  who: "staff" | "admin",
  reason: boolean,
][] = [
  ["New", "Contacted", "staff", false],
  ["New", "Quoted", "staff", false],
  ["New", "Closed", "staff", true],
  ["New", "Archived", "staff", true],
  ["Contacted", "Quoted", "staff", false],
  ["Contacted", "Closed", "staff", true],
  ["Contacted", "Archived", "staff", true],
  ["Contacted", "New", "admin", true],
  ["Quoted", "Closed", "staff", true],
  ["Quoted", "Archived", "staff", true],
  ["Quoted", "Contacted", "admin", true],
  ["Closed", "Quoted", "admin", true],
  ["Archived", "New", "admin", true],
  ["Archived", "Contacted", "admin", true],
  ["Archived", "Quoted", "admin", true],
];

/**
 * The moves this role may offer from this state. For an archived quotation, only the restore to the state it was
 * archived from (`archivedFrom`, read from its history). The database checks all of this again.
 */
export function allowedTransitions(
  status: QuotationStatus,
  role: WorkflowRole | null,
  archivedFrom: string | null = null,
): TransitionOption[] {
  if (role !== "portal_admin" && role !== "quotation_staff") return [];
  return MATRIX.filter(([from, to, who]) => {
    if (from !== status) return false;
    if (who === "admin" && role !== "portal_admin") return false;
    if (from === "Archived") return to === archivedFrom;
    return true;
  }).map(([from, to, who, reason]) => ({
    to,
    reasonRequired: reason,
    adminOnly: who === "admin",
    gated: to === "Quoted",
    restore: from === "Archived",
  }));
}

/** States in which a review can be recorded. */
export const REVIEWABLE_STATUSES: readonly QuotationStatus[] = ["New", "Contacted", "Quoted"];

export const STATUS_LABELS: Record<QuotationStatus, string> = {
  Draft: "Draft",
  New: "New",
  Contacted: "Contacted",
  Quoted: "Quoted",
  Closed: "Closed",
  Archived: "Archived",
  Withdrawn: "Withdrawn by customer",
};

export type ReviewOutcome =
  | "checked_suitable"
  | "needs_customer_input"
  | "cannot_supply_as_built"
  | "escalated";

export const REVIEW_OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  checked_suitable: "Checked – Suitable",
  needs_customer_input: "Needs Customer Input",
  cannot_supply_as_built: "Cannot Supply As Built",
  escalated: "Escalated",
};

// ── Errors ──────────────────────────────────────────────────────────────────────────────────────────

export type StaffActionCode =
  | "stale_version"
  | "review_required"
  | "forbidden"
  | "invalid_transition"
  | "reason_required"
  | "reason_invalid"
  | "note_required"
  | "outcome_invalid"
  | "assignee_invalid"
  | "quotation_not_found"
  | "failed";

export const STAFF_ACTION_MESSAGES: Record<StaffActionCode, string> = {
  stale_version:
    "Someone else changed this quotation while you had it open. Reload it to see the latest, then try again.",
  review_required:
    "This quotation needs a completed “Checked – Suitable” review, with no open escalation, before it can be Quoted.",
  forbidden: "Your role can't make this change.",
  invalid_transition: "This change isn't allowed from the quotation's current status.",
  reason_required: "Please give a reason (at least 3 characters).",
  reason_invalid: "The reason must be 3 to 1,000 characters.",
  note_required: "Please write the note: up to 2,000 characters (a review note needs at least 3).",
  outcome_invalid: "Choose a review outcome.",
  assignee_invalid:
    "That person can't be assigned: choose an active quotation staff member or administrator.",
  quotation_not_found:
    "This quotation couldn't be found. It may have been removed or isn't a submitted request.",
  failed: "The change couldn't be saved. Please try again.",
};

export interface StaffActionResult {
  ok: boolean;
  version?: number;
  status?: QuotationStatus;
  code?: StaffActionCode;
  message?: string;
}

const KNOWN = new Set(Object.keys(STAFF_ACTION_MESSAGES));

/** Maps a database refusal to a code. The database raises the code itself as the message. */
export function staffActionError(
  error: { message?: string; code?: string } | null,
): StaffActionResult {
  const raw = String(error?.message ?? "").trim();
  const code = (KNOWN.has(raw) ? raw : "failed") as StaffActionCode;
  return { ok: false, code, message: STAFF_ACTION_MESSAGES[code] };
}

export interface QuotationEvent {
  id: number;
  event_type: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_role: string | null;
  from_status: string | null;
  to_status: string | null;
  version: number | null;
  reason: string | null;
  details: Record<string, any> | null;
  restores_event_id: number | null;
  created_at: string;
}

export interface QuotationReview {
  id: number;
  outcome: ReviewOutcome;
  note: string;
  escalation_clearance_reason: string | null;
  reviewer_user_id: string;
  reviewer_role: string;
  version: number;
  created_at: string;
}

export interface QuotationNote {
  id: number;
  note: string;
  author_user_id: string;
  author_role: string;
  version: number;
  created_at: string;
}

export interface QuotationHistory {
  events: QuotationEvent[];
  reviews: QuotationReview[];
  notes: QuotationNote[];
  error?: string;
}

// ── Who can be assigned ─────────────────────────────────────────────────────────────────────────────

export interface AssignableStaff {
  user_id: string;
  full_name: string;
  role: "portal_admin" | "quotation_staff";
}

/** A `staff_members` row, as the portal reads it. */
export interface StaffMemberRow {
  user_id: string | null;
  full_name: string | null;
  email?: string | null;
  role: string | null;
  is_active: boolean | null;
}

/** A `profiles` row, as the portal reads it. */
export interface ProfileRow {
  id: string | null;
  full_name: string | null;
  email?: string | null;
  role: string | null;
}

/**
 * Who a quotation can be assigned to, by the rule `staff_assign_pc_quotation` applies (migration 20261111000002),
 * which is also how `get_current_staff_role` decides who holds a quotation role: an administrator by profile
 * (`profiles.role = 'admin'`, who has no active flag), or an active staff member whose role is quotation staff or
 * portal administrator. The rows are checked again here, so a looser query can't widen the menu. A profile
 * administrator who also has a staff row is listed once, as an administrator. The database decides again.
 */
export function assignableStaff(
  staffRows: readonly StaffMemberRow[],
  profileRows: readonly ProfileRow[],
): AssignableStaff[] {
  const people = new Map<string, AssignableStaff>();
  const label = (id: string, name?: string | null, email?: string | null) =>
    name?.trim() || email?.trim() || id.slice(0, 8);
  for (const p of profileRows) {
    if (!p.id || p.role !== "admin") continue;
    people.set(p.id, {
      user_id: p.id,
      full_name: label(p.id, p.full_name, p.email),
      role: "portal_admin",
    });
  }
  for (const s of staffRows) {
    if (!s.user_id || s.is_active !== true) continue;
    if (s.role !== "quotation_staff" && s.role !== "portal_admin") continue;
    const admin = people.get(s.user_id);
    people.set(s.user_id, {
      user_id: s.user_id,
      full_name: s.full_name?.trim() || admin?.full_name || label(s.user_id, null, s.email),
      role: admin ? "portal_admin" : s.role,
    });
  }
  return [...people.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** The part of a Supabase client the menu needs; kept loose so this file stays import-free. */
interface TableReader {
  from(table: string): any;
}

/**
 * Reads the assignment menu with the signed-in staff member's own client (row security applies). If one of the two
 * reads fails, the other's people are still offered; the database checks every assignment again.
 */
export async function loadAssignableStaff(client: TableReader): Promise<AssignableStaff[]> {
  const [staff, admins] = await Promise.all([
    client
      .from("staff_members")
      .select("user_id, full_name, email, role, is_active")
      .eq("is_active", true)
      .in("role", ["portal_admin", "quotation_staff"]),
    client.from("profiles").select("id, full_name, email, role").eq("role", "admin"),
  ]);
  return assignableStaff(
    staff?.error ? [] : ((staff?.data ?? []) as StaffMemberRow[]),
    admins?.error ? [] : ((admins?.data ?? []) as ProfileRow[]),
  );
}

/** The state an archived quotation was archived from: the only state it can be restored to. */
export function archivedFrom(events: QuotationEvent[]): string | null {
  const archived = [...events].reverse().find((e) => e.event_type === "archived");
  return archived?.from_status ?? null;
}

/**
 * The review gate as the database applies it, for display: the latest review is "Checked – Suitable" and no
 * escalation is open.
 */
export function reviewGateMet(reviews: QuotationReview[]): boolean {
  const latest = reviews[reviews.length - 1];
  return Boolean(latest && latest.outcome === "checked_suitable" && !escalationOpen(reviews));
}

/**
 * Whether an escalation is open: some escalated review has no later "Checked – Suitable" from an administrator
 * with a clearance reason (E1). The same rule as the database's.
 */
export function escalationOpen(reviews: QuotationReview[]): boolean {
  return reviews.some(
    (e) =>
      e.outcome === "escalated" &&
      !reviews.some(
        (c) =>
          c.id > e.id &&
          c.outcome === "checked_suitable" &&
          c.reviewer_role === "portal_admin" &&
          c.escalation_clearance_reason !== null,
      ),
  );
}
