// ITHUB_ADMIN/src/lib/quotations.ts
// PC Builder quotations for the Staff Portal (Stage 4S-5).
//
// Reads go through the `pc_builds_staff` view and the append-only history tables. Every change goes through one
// of four database functions, each checking the caller's role, the quotation's version and the approved matrix,
// and writing its history event and audit row in the same transaction. Staff have no direct write access to
// quotations; the portal never decides permissions, it only hides buttons the database would refuse.

import { supabase } from "./supabase";
import {
  type AssignableStaff,
  loadAssignableStaff,
  type QuotationEvent,
  type QuotationHistory,
  type QuotationNote,
  type QuotationReview,
  type QuotationStatus,
  type ReviewOutcome,
  type StaffActionResult,
  STAFF_ACTION_MESSAGES,
  staffActionError,
} from "./quotation-workflow";

export * from "./quotation-workflow";

export interface PcQuotationRecord {
  id: string;
  user_id: string;
  reference_id: string | null;
  name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  parts: unknown;
  estimated_price: number;
  authoritative_price?: number | null;
  price_divergence?: number | null;
  technician_review_required?: boolean | null;
  /** The customer's browser report. Never the authority. */
  compatibility?: any;
  /** The server's verdict (Stage 4S-4 onwards); null on older rows. */
  server_assessment?: unknown;
  enquiry_status: QuotationStatus;
  /** Sent back with every staff action, so a change made meanwhile is never overwritten. */
  version: number;
  /** The single free-text column used before Stage 4S-5. Read-only. */
  staff_notes?: string | null;
  assigned_staff_id?: string | null;
  created_at: string;
  updated_at: string;
}

async function call(fn: string, args: Record<string, unknown>): Promise<StaffActionResult> {
  if (!supabase) return { ok: false, code: "failed", message: "Database client unavailable." };
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return staffActionError(error);
    return { ok: true, version: Number(data?.version) || undefined, status: data?.status };
  } catch {
    return { ok: false, code: "failed", message: STAFF_ACTION_MESSAGES.failed };
  }
}

const trimmedOrNull = (text?: string | null) => {
  const value = (text ?? "").trim();
  return value ? value : null;
};

// ── Actions ─────────────────────────────────────────────────────────────────────────────────────────

export const transitionQuotation = (
  id: string,
  to: QuotationStatus,
  expectedVersion: number,
  reason?: string | null,
) =>
  call("staff_transition_pc_quotation", {
    p_quotation_id: id,
    p_to_status: to,
    p_expected_version: expectedVersion,
    p_reason: trimmedOrNull(reason),
  });

export const recordQuotationReview = (
  id: string,
  outcome: ReviewOutcome,
  note: string,
  expectedVersion: number,
  escalationClearanceReason?: string | null,
) =>
  call("staff_record_pc_quotation_review", {
    p_quotation_id: id,
    p_outcome: outcome,
    p_note: note,
    p_expected_version: expectedVersion,
    p_escalation_clearance_reason: trimmedOrNull(escalationClearanceReason),
  });

export const addQuotationNote = (id: string, note: string, expectedVersion: number) =>
  call("staff_add_pc_quotation_note", {
    p_quotation_id: id,
    p_note: note,
    p_expected_version: expectedVersion,
  });

/** `assignee` null unassigns. */
export const assignQuotation = (id: string, assignee: string | null, expectedVersion: number) =>
  call("staff_assign_pc_quotation", {
    p_quotation_id: id,
    p_assignee: assignee,
    p_expected_version: expectedVersion,
  });

// ── History ─────────────────────────────────────────────────────────────────────────────────────────

export async function fetchQuotationHistory(id: string): Promise<QuotationHistory> {
  if (!supabase)
    return { events: [], reviews: [], notes: [], error: "Database client unavailable." };
  const [events, reviews, notes] = await Promise.all([
    supabase.from("quotation_events").select("*").eq("quotation_id", id).order("id"),
    supabase.from("quotation_reviews").select("*").eq("quotation_id", id).order("id"),
    supabase.from("quotation_notes").select("*").eq("quotation_id", id).order("id"),
  ]);
  const error = events.error || reviews.error || notes.error;
  return {
    events: (events.data as QuotationEvent[]) || [],
    reviews: (reviews.data as QuotationReview[]) || [],
    notes: (notes.data as QuotationNote[]) || [],
    error: error ? "The quotation's history couldn't be loaded." : undefined,
  };
}

// ── Staff who can be assigned ───────────────────────────────────────────────────────────────────────

/**
 * Active quotation staff and portal administrators, and administrators by profile: the database's assignment rule
 * (`loadAssignableStaff` and `assignableStaff` in quotation-workflow.ts, which the database tests run as well).
 */
export async function fetchAssignableStaff(): Promise<AssignableStaff[]> {
  if (!supabase) return [];
  try {
    return await loadAssignableStaff(supabase);
  } catch {
    return [];
  }
}

// ── The queue ───────────────────────────────────────────────────────────────────────────────────────

export type ServerStateFilter =
  | "ALL"
  | "complete"
  | "needs_review"
  | "incomplete"
  | "incompatible"
  | "not_assessed"
  | "not_recorded";

export interface QuotationQueryOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  /** "yes" or "no" for the review flag; "ALL" for both. */
  reviewRequired?: "ALL" | "yes" | "no";
  serverState?: ServerStateFilter;
  /** "ALL", "unassigned", or a staff member's user ID. */
  assignment?: string;
  searchQuery?: string;
  sortBy?: "created_at" | "updated_at" | "estimated_price";
  sortOrder?: "asc" | "desc";
}

export interface QuotationQueryResult {
  quotations: PcQuotationRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

/** Characters with meaning in a PostgREST `or` filter are dropped from the search text. */
const searchText = (text: string) => text.replace(/[,()*%\\:."']/g, " ").trim();

export async function fetchQuotations(
  options: QuotationQueryOptions = {},
): Promise<QuotationQueryResult> {
  const {
    page = 1,
    pageSize = 15,
    status = "ALL",
    reviewRequired = "ALL",
    serverState = "ALL",
    assignment = "ALL",
    searchQuery = "",
    sortBy = "created_at",
    sortOrder = "desc",
  } = options;

  if (!supabase) {
    return {
      quotations: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      error: "Database client unavailable.",
    };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase
      .from("pc_builds_staff")
      .select("*", { count: "exact" })
      .not("reference_id", "is", null);

    if (status && status !== "ALL") query = query.eq("enquiry_status", status);
    if (reviewRequired === "yes") query = query.eq("technician_review_required", true);
    if (reviewRequired === "no") query = query.not("technician_review_required", "is", true);
    if (serverState === "not_recorded") query = query.is("server_assessment", null);
    else if (serverState !== "ALL") query = query.eq("server_assessment->>state", serverState);
    if (assignment === "unassigned") query = query.is("assigned_staff_id", null);
    else if (assignment && assignment !== "ALL") query = query.eq("assigned_staff_id", assignment);

    const q = searchText(searchQuery);
    if (q) {
      query = query.or(
        `reference_id.ilike.*${q}*,customer_name.ilike.*${q}*,customer_phone.ilike.*${q}*,customer_email.ilike.*${q}*`,
      );
    }

    query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);
    const { data, count, error } = await query;

    if (error) {
      console.error("Error fetching quotations:", error.message);
      return { quotations: [], totalCount: 0, page, pageSize, totalPages: 0, error: error.message };
    }

    const totalCount = count || 0;
    return {
      quotations: (data as PcQuotationRecord[]) || [],
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  } catch (err: any) {
    return { quotations: [], totalCount: 0, page, pageSize, totalPages: 0, error: err?.message };
  }
}

export async function getQuotationById(quotationId: string): Promise<PcQuotationRecord | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("pc_builds_staff")
      .select("*")
      .eq("id", quotationId)
      .single();
    if (error || !data) return null;
    return data as PcQuotationRecord;
  } catch {
    return null;
  }
}

/**
 * Dashboard counts. Archived and withdrawn requests aren't open work, so the review count leaves them out.
 */
export async function getQuotationStats(): Promise<{
  totalNew: number;
  totalContacted: number;
  totalQuoted: number;
  totalClosed: number;
  totalFlaggedReview: number;
}> {
  const empty = {
    totalNew: 0,
    totalContacted: 0,
    totalQuoted: 0,
    totalClosed: 0,
    totalFlaggedReview: 0,
  };
  if (!supabase) return empty;

  try {
    const { data, error } = await supabase
      .from("pc_builds_staff")
      .select("enquiry_status, technician_review_required")
      .not("reference_id", "is", null);
    if (error || !data) return empty;

    const stats = { ...empty };
    for (const item of data) {
      if (item.enquiry_status === "New") stats.totalNew++;
      if (item.enquiry_status === "Contacted") stats.totalContacted++;
      if (item.enquiry_status === "Quoted") stats.totalQuoted++;
      if (item.enquiry_status === "Closed") stats.totalClosed++;
      if (
        item.technician_review_required &&
        ["New", "Contacted", "Quoted"].includes(item.enquiry_status)
      ) {
        stats.totalFlaggedReview++;
      }
    }
    return stats;
  } catch {
    return empty;
  }
}
