// ITHUB_ADMIN/src/lib/quotations.ts
// PC Builder Quotations Data Layer & Workflow Actions
// Interacts with `public.pc_builds` with database pagination, status filters, and audit updates

import { supabase } from "./supabase";

export type QuotationStatus = "Draft" | "New" | "Contacted" | "Quoted" | "Closed";

export interface PcPartItem {
  type: string;
  id?: string;
  name: string;
  price: number;
  variantId?: string;
  isShopifyLive?: boolean;
}

export interface PcQuotationRecord {
  id: string;
  user_id: string;
  reference_id: string | null;
  name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  parts: Record<string, PcPartItem> | PcPartItem[];
  estimated_price: number;
  authoritative_price?: number | null;
  price_divergence?: number | null;
  technician_review_required?: boolean | null;
  compatibility?: any;
  enquiry_status: QuotationStatus;
  staff_notes?: string | null;
  assigned_staff_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotationQueryOptions {
  page?: number;
  pageSize?: number;
  status?: string;
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

/**
 * Fetches paginated PC quotation requests with server-side filtering and sorting.
 */
export async function fetchQuotations(
  options: QuotationQueryOptions = {},
): Promise<QuotationQueryResult> {
  const {
    page = 1,
    pageSize = 15,
    status = "ALL",
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
      .not("reference_id", "is", null); // Display formal customer quotation requests

    if (status && status !== "ALL") {
      query = query.eq("enquiry_status", status);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      query = query.or(
        `reference_id.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%,customer_email.ilike.%${q}%`,
      );
    }

    query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error("Error fetching quotations:", error);
      return { quotations: [], totalCount: 0, page, pageSize, totalPages: 0, error: error.message };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      quotations: (data as PcQuotationRecord[]) || [],
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err: any) {
    return { quotations: [], totalCount: 0, page, pageSize, totalPages: 0, error: err?.message };
  }
}

/**
 * Retrieves full details for a single PC quotation by ID.
 */
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
 * Updates a quotation's status, appends staff notes, and records an append-only audit log entry.
 */
export async function updateQuotationStatus(
  quotationId: string,
  newStatus: QuotationStatus,
  staffNotes?: string,
  assignedStaffId?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };

  try {
    const { data, error } = await supabase.rpc("staff_update_pc_quotation_status", {
      p_quotation_id: quotationId,
      p_new_status: newStatus,
      p_staff_notes: staffNotes?.trim() || null,
      p_assigned_staff_id: assignedStaffId || null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: Boolean(data?.ok) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update quotation." };
  }
}

/**
 * Fetches dashboard summary statistics for PC quotations.
 */
export async function getQuotationStats(): Promise<{
  totalNew: number;
  totalContacted: number;
  totalQuoted: number;
  totalClosed: number;
  totalFlaggedReview: number;
}> {
  if (!supabase) {
    return {
      totalNew: 0,
      totalContacted: 0,
      totalQuoted: 0,
      totalClosed: 0,
      totalFlaggedReview: 0,
    };
  }

  try {
    const { data, error } = await supabase
      .from("pc_builds")
      .select("enquiry_status, technician_review_required")
      .not("reference_id", "is", null);

    if (error || !data) {
      return {
        totalNew: 0,
        totalContacted: 0,
        totalQuoted: 0,
        totalClosed: 0,
        totalFlaggedReview: 0,
      };
    }

    let totalNew = 0;
    let totalContacted = 0;
    let totalQuoted = 0;
    let totalClosed = 0;
    let totalFlaggedReview = 0;

    for (const item of data) {
      if (item.enquiry_status === "New") totalNew++;
      if (item.enquiry_status === "Contacted") totalContacted++;
      if (item.enquiry_status === "Quoted") totalQuoted++;
      if (item.enquiry_status === "Closed") totalClosed++;
      if (item.technician_review_required) totalFlaggedReview++;
    }

    return { totalNew, totalContacted, totalQuoted, totalClosed, totalFlaggedReview };
  } catch {
    return {
      totalNew: 0,
      totalContacted: 0,
      totalQuoted: 0,
      totalClosed: 0,
      totalFlaggedReview: 0,
    };
  }
}
