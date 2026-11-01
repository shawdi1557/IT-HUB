// ITHUB_ADMIN/src/lib/audits.ts
// Customer Audits & Location Management Data Layer
// Supports creation, status transitions, staff attribution, and history tracking
// IT HUB — Kerala, India

import { supabase } from "./supabase";

export type AuditStatus = "Pending" | "Scheduled" | "In Progress" | "Completed" | "Cancelled";

export type AuditType =
  | "On-site Inspection"
  | "Hardware Diagnostic Audit"
  | "Annual Maintenance Audit"
  | "Network & Setup Audit"
  | "Showroom Intake Audit";

export interface CustomerAuditRecord {
  id: string;
  audit_reference: string;
  audit_type: AuditType | string;
  status: AuditStatus;
  purpose: string;
  description?: string | null;

  // Customer info
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  service_ticket_id?: string | null;
  service_ticket_reference?: string | null;

  // Location info (no silent GPS tracking; staff-managed coordinates and addresses)
  service_address: string;
  city: string;
  district: string;
  pincode?: string | null;
  landmarks?: string | null;
  latitude?: number | null;
  longitude?: number | null;

  // Audit technical findings & notes
  observations?: string | null;
  findings?: string | null;
  notes?: string | null;
  documents?: any[];

  // Staff attribution
  created_by?: string | null;
  created_by_name?: string | null;
  assigned_staff_id?: string | null;
  assigned_staff_name?: string | null;
  last_updated_by?: string | null;
  last_updated_by_name?: string | null;

  scheduled_date?: string | null;
  scheduled_slot?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerAuditHistoryEntry {
  id: string;
  audit_id: string;
  staff_user_id?: string | null;
  staff_name?: string | null;
  action: string;
  previous_status?: string | null;
  new_status?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface AuditQueryOptions {
  status?: string;
  auditType?: string;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditQueryResult {
  audits: CustomerAuditRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

/**
 * Fetches audits with server-side filters, search, and pagination.
 */
export async function fetchAudits(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
  const {
    status = "ALL",
    auditType = "ALL",
    searchQuery = "",
    startDate,
    endDate,
    page = 1,
    pageSize = 15,
  } = options;

  if (!supabase) {
    return {
      audits: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      error: "Database client unavailable.",
    };
  }

  try {
    let query = supabase.from("customer_audits").select("*", { count: "exact" });

    // Status filter
    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    // Audit Type filter
    if (auditType && auditType !== "ALL") {
      query = query.eq("audit_type", auditType);
    }

    // Date range filter
    if (startDate) {
      query = query.gte("created_at", `${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
    }

    // Search filter across reference, customer name, phone, ticket reference
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      query = query.or(
        `audit_reference.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%,service_ticket_reference.ilike.%${q}%,purpose.ilike.%${q}%`,
      );
    }

    // Pagination & sorting
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.warn("[Audits] Error fetching audits:", error.message);
      return { audits: [], totalCount: 0, page, pageSize, totalPages: 0, error: error.message };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      audits: (data || []) as CustomerAuditRecord[],
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err: any) {
    console.warn("[Audits] Exception fetching audits:", err.message);
    return { audits: [], totalCount: 0, page, pageSize, totalPages: 0, error: err.message };
  }
}

/**
 * Fetches a single audit by ID with its audit history timeline.
 */
export async function fetchAuditById(id: string): Promise<{
  audit: CustomerAuditRecord | null;
  history: CustomerAuditHistoryEntry[];
  error?: string;
}> {
  if (!supabase || !id) {
    return { audit: null, history: [] };
  }

  try {
    const [auditRes, historyRes] = await Promise.all([
      supabase.from("customer_audits").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("customer_audit_history")
        .select("*")
        .eq("audit_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (auditRes.error) {
      return { audit: null, history: [], error: auditRes.error.message };
    }

    return {
      audit: auditRes.data as CustomerAuditRecord | null,
      history: (historyRes.data || []) as CustomerAuditHistoryEntry[],
    };
  } catch (err: any) {
    return { audit: null, history: [], error: err.message };
  }
}

/**
 * Creates a new customer audit record.
 */
export async function createAudit(payload: {
  audit_type: string;
  purpose: string;
  description?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  service_ticket_id?: string;
  service_ticket_reference?: string;
  service_address: string;
  city?: string;
  district?: string;
  pincode?: string;
  landmarks?: string;
  latitude?: number;
  longitude?: number;
  scheduled_date?: string;
  scheduled_slot?: string;
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  notes?: string;
}): Promise<{ ok: boolean; audit?: CustomerAuditRecord; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Fetch staff name if available
    let staffName = "IT HUB Staff";
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.full_name) staffName = profile.full_name;
    }

    // Call database sequence generator to get unique reference
    const { data: refData, error: refError } = await supabase.rpc(
      "generate_customer_audit_reference",
    );
    const auditReference =
      !refError && refData ? refData : `ITH-AUD-${Math.floor(100000 + Math.random() * 900000)}`;

    const insertPayload = {
      audit_reference: auditReference,
      audit_type: payload.audit_type,
      status: payload.scheduled_date ? "Scheduled" : "Pending",
      purpose: payload.purpose,
      description: payload.description || null,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      customer_email: payload.customer_email || null,
      service_ticket_id: payload.service_ticket_id || null,
      service_ticket_reference: payload.service_ticket_reference || null,
      service_address: payload.service_address,
      city: payload.city || "Kothamangalam",
      district: payload.district || "Ernakulam",
      pincode: payload.pincode || null,
      landmarks: payload.landmarks || null,
      latitude: payload.latitude || null,
      longitude: payload.longitude || null,
      scheduled_date: payload.scheduled_date || null,
      scheduled_slot: payload.scheduled_slot || null,
      assigned_staff_id: payload.assigned_staff_id || null,
      assigned_staff_name: payload.assigned_staff_name || null,
      notes: payload.notes || null,
      created_by: user?.id || null,
      created_by_name: staffName,
      last_updated_by: user?.id || null,
      last_updated_by_name: staffName,
    };

    const { data, error } = await supabase
      .from("customer_audits")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    // Create initial audit history row
    await supabase.from("customer_audit_history").insert({
      audit_id: data.id,
      staff_user_id: user?.id || null,
      staff_name: staffName,
      action: "CREATED",
      new_status: data.status,
      notes: payload.notes || "Audit created by staff",
      metadata: { initialScheduledDate: payload.scheduled_date },
    });

    // Write to staff_audit_logs
    await supabase.from("staff_audit_logs").insert({
      staff_user_id: user?.id,
      action_type: "CREATE_CUSTOMER_AUDIT",
      entity_type: "customer_audit",
      entity_id: data.id,
      metadata: { auditReference, customerName: payload.customer_name, purpose: payload.purpose },
    });

    return { ok: true, audit: data as CustomerAuditRecord };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Updates status, technical observations, or notes for an audit record.
 */
export async function updateAuditRecord(
  auditId: string,
  updates: {
    status?: AuditStatus;
    observations?: string;
    findings?: string;
    notes?: string;
    scheduled_date?: string;
    scheduled_slot?: string;
    assigned_staff_id?: string;
    assigned_staff_name?: string;
    historyNote?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase || !auditId) return { ok: false, error: "Database client unavailable." };

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let staffName = "IT HUB Staff";
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.full_name) staffName = profile.full_name;
    }

    // Fetch existing audit to verify previous status
    const { data: existing, error: fetchErr } = await supabase
      .from("customer_audits")
      .select("*")
      .eq("id", auditId)
      .single();

    if (fetchErr || !existing) {
      return { ok: false, error: fetchErr?.message || "Audit record not found." };
    }

    const patch: Record<string, any> = {
      last_updated_by: user?.id || null,
      last_updated_by_name: staffName,
      updated_at: new Date().toISOString(),
    };

    if (updates.status !== undefined) {
      patch.status = updates.status;
      if (updates.status === "Completed") {
        patch.completed_at = new Date().toISOString();
      }
    }
    if (updates.observations !== undefined) patch.observations = updates.observations;
    if (updates.findings !== undefined) patch.findings = updates.findings;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.scheduled_date !== undefined) patch.scheduled_date = updates.scheduled_date;
    if (updates.scheduled_slot !== undefined) patch.scheduled_slot = updates.scheduled_slot;
    if (updates.assigned_staff_id !== undefined) {
      patch.assigned_staff_id = updates.assigned_staff_id;
      patch.assigned_staff_name = updates.assigned_staff_name || null;
    }

    const { error: updateErr } = await supabase
      .from("customer_audits")
      .update(patch)
      .eq("id", auditId);

    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }

    // Append to customer_audit_history
    const actionLabel =
      updates.status && updates.status !== existing.status
        ? "STATUS_CHANGE"
        : updates.observations !== undefined || updates.findings !== undefined
          ? "FINDINGS_UPDATED"
          : "AUDIT_UPDATED";

    await supabase.from("customer_audit_history").insert({
      audit_id: auditId,
      staff_user_id: user?.id || null,
      staff_name: staffName,
      action: actionLabel,
      previous_status: existing.status,
      new_status: updates.status || existing.status,
      notes:
        updates.historyNote ||
        updates.notes ||
        `Audit updated to ${updates.status || existing.status}`,
      metadata: { changedFields: Object.keys(patch) },
    });

    // Write to staff_audit_logs
    await supabase.from("staff_audit_logs").insert({
      staff_user_id: user?.id,
      action_type: "UPDATE_CUSTOMER_AUDIT",
      entity_type: "customer_audit",
      entity_id: auditId,
      metadata: {
        auditReference: existing.audit_reference,
        fromStatus: existing.status,
        toStatus: updates.status || existing.status,
      },
    });

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// Re-export Website Visitor Analytics features for seamless unified auditing
export * from "./visitorAnalytics";
