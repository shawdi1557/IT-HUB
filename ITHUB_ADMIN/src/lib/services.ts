// ITHUB_ADMIN/src/lib/services.ts
// Service & Repair Management Data Layer & Workflow Actions
// Interacts with `public.service_requests` with pagination, filters, and audit updates

import { supabase } from "./supabase";
import {
  isRescheduleEligible,
  shouldDisplayReschedulePanel,
  validateRescheduleApproval,
  getStatusOptionsForMethod,
  SERVICE_INTAKE_METHODS,
  type ServiceIntakeMethod,
} from "./serviceReschedule";
import {
  CANONICAL_SERVICE_METHODS,
  type CanonicalServiceMethod,
  type ServiceMethodInfo,
  type ServiceMethodCounts,
  classifyServiceMethod,
  getServiceMethodInfo,
  calculateMethodCounts,
  filterTicketsByCriteria,
} from "./serviceClassification";
import {
  type AdminAlert,
  type AdminAlertEventType,
  evaluateTicketAlerts,
  generateAlertsFromTickets,
  deduplicateAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  getUnreadAlertCount,
  loadStoredAlerts,
  saveStoredAlerts,
} from "./serviceAlerts";

export {
  isRescheduleEligible,
  shouldDisplayReschedulePanel,
  validateRescheduleApproval,
  getStatusOptionsForMethod,
  SERVICE_INTAKE_METHODS,
  type ServiceIntakeMethod,
  CANONICAL_SERVICE_METHODS,
  type CanonicalServiceMethod,
  type ServiceMethodInfo,
  type ServiceMethodCounts,
  classifyServiceMethod,
  getServiceMethodInfo,
  calculateMethodCounts,
  filterTicketsByCriteria,
  type AdminAlert,
  type AdminAlertEventType,
  evaluateTicketAlerts,
  generateAlertsFromTickets,
  deduplicateAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  getUnreadAlertCount,
  loadStoredAlerts,
  saveStoredAlerts,
};

export {
  TICKET_REFERENCE_PREFIX,
  TICKET_REFERENCE_REGEX,
  isValidTicketReference,
  formatTicketReference,
  normalizeTicketReference,
  matchesTicketSearch,
  getServiceDeskTableColumns,
  getDeskTableCellClass,
  generateRandomTicketReference,
  backfillTicketReferences,
  resolveTicketByReferenceOrId,
  buildTicketTrackingUrl,
} from "./ticketReference";

export type ServiceStatus =
  | "Booked"
  | "Device Received"
  | "Under Diagnosis"
  | "In Progress"
  | "Diagnosis Done"
  | "Awaiting Approval"
  | "Approved"
  | "Quality Check"
  | "Ready for Delivery"
  | "Completed"
  | "Cancelled"
  | "Delivered"
  | "Returned"
  | "Technician Assigned"
  | "Technician has Left IT HUB"
  | "Technician on the Way"
  | "Technician Arrived at Your Location"
  | "Technician Arrived"
  | "Customer Arrived"
  | "Service in Progress"
  | "Ready for Pickup"
  | "Reschedule Requested"
  | "Rescheduled";

export type QuoteState = "pending" | "approved" | "rejected";

export interface DiagnosisFinding {
  id: string;
  title: string;
  description: string;
  source: "customer" | "technician";
  classification: "confirmed" | "suspected" | "needs_further_testing";
  customerExplanation: string;
  recommendedRepair: string;
  safety: "required" | "recommended" | "optional" | "cosmetic";
  isEligibleForRepair: boolean;
  createdAt: string;
}

export interface QuotationItem {
  id: string;
  findingId?: string;
  title: string;
  description: string;
  partCost: number;
  labourCost: number;
  quantity: number;
  discount?: number;
  lineTotal: number;
  isRequired: boolean;
  canDefer: boolean;
  dependsOn?: string[];
  approvalState: "pending" | "approved" | "declined" | "deferred";
  requirementLevel?: "required" | "recommended" | "optional";
}

export interface ServiceRecord {
  id: string;
  ticket_reference?: string | null;
  user_id: string;
  device: string;
  model: string | null;
  problem: string;
  customer_description?: string | null;
  method: string;
  address_id: string | null;
  preferred_date: string | null;
  preferred_slot: string | null;
  status: ServiceStatus;
  quote: number | null;
  quote_state: QuoteState | null;
  technician_name: string | null;
  notes: string | null;
  courier_charge_return_delivery: number | null;
  findings: DiagnosisFinding[];
  quotation_items: QuotationItem[];
  quote_version: number;
  approved_items: string[];
  declined_items: string[];
  decision_notes: string | null;
  decision_at: string | null;
  quotation_history: any[];
  created_at: string;
  updated_at: string;
  pincode?: string | null;
  address_details?: any;
  inbound_courier_tracking_no?: string | null;
  outbound_courier_tracking_no?: string | null;
  status_descriptions?: Record<string, string> | null;
  doorstep_callout_fee?: number | null;
  billing_details?: any;
  reschedule_details?: any;
  // Customer details if joined from profiles
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
}

export interface BillingDetails {
  labourCharges: number;
  partsCharges: number;
  calloutFee: number;
  adjustments: number;
  total: number;
  paymentMethod: "UPI" | "Cash";
  paymentStatus: "Pending" | "Received";
  receiptNote?: string;
  finalizedAt?: string;
}

export async function saveOnSiteBilling(
  serviceId: string,
  billing: BillingDetails,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };
  try {
    const isPaid = billing.paymentStatus === "Received";
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const updatePayload: Record<string, any> = {
      billing_details: billing,
      updated_at: new Date().toISOString(),
    };

    if (isPaid) {
      updatePayload.payment_status = "Paid";
      updatePayload.payment_method = billing.paymentMethod?.toLowerCase().includes("upi")
        ? "upi"
        : "store";
      updatePayload.paid_amount = billing.total;
      updatePayload.paid_at = billing.finalizedAt || new Date().toISOString();
      if (user?.id) updatePayload.payment_collected_by = user.id;
    } else {
      updatePayload.payment_status = "Pay at Store";
      updatePayload.payment_method = "store";
    }

    const { error } = await supabase
      .from("service_requests")
      .update(updatePayload)
      .eq("id", serviceId);
    if (error) return { ok: false, error: error.message };

    await supabase.from("staff_audit_logs").insert({
      staff_id: user?.id,
      action: isPaid ? "SERVICE_PAYMENT_COLLECTED" : "SAVE_ONSITE_BILLING",
      entity_type: "service_request",
      entity_id: serviceId,
      metadata: billing,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to save billing." };
  }
}

export async function approveRescheduleRequest(
  serviceId: string,
  newDate: string,
  newSlot: string,
  requestId?: string,
  staffResponse?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };
  try {
    // 1. Invoke atomic stored procedure passing both request_id and ticket_id
    let effectiveReqId = requestId;
    if (!effectiveReqId) {
      const { data: req } = await supabase
        .from("service_appointment_reschedule_requests")
        .select("id")
        .eq("ticket_id", serviceId)
        .eq("status", "pending")
        .maybeSingle();
      if (req?.id) effectiveReqId = req.id;
    }

    const { data, error } = await supabase.rpc("staff_decide_appointment_reschedule", {
      p_request_id: effectiveReqId || null,
      p_decision: "approved",
      p_staff_response: staffResponse || null,
      p_ticket_id: serviceId,
    });

    if (error) {
      // If RPC fails due to missing function or permission, attempt direct fallback
      console.warn(
        "staff_decide_appointment_reschedule RPC returned error, using fallback:",
        error.message,
      );
    } else if (data && data.ok === false) {
      return { ok: false, error: data.error };
    } else if (data && data.ok === true) {
      return { ok: true };
    }

    // 2. Direct fallback if RPC was not applicable
    const { data: ticket, error: fetchErr } = await supabase
      .from("service_requests")
      .select("id, method, status, reschedule_details")
      .eq("id", serviceId)
      .single();

    if (fetchErr || !ticket) {
      return { ok: false, error: fetchErr?.message || "Service ticket not found." };
    }

    const validation = validateRescheduleApproval(ticket);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }

    const currentDetails = (ticket?.reschedule_details as any) || {};
    const { error: updateErr } = await supabase
      .from("service_requests")
      .update({
        status: "Rescheduled",
        preferred_date: newDate,
        preferred_slot: newSlot,
        reschedule_details: {
          ...currentDetails,
          status: "approved",
          decidedAt: new Date().toISOString(),
          approvedDate: newDate,
          approvedSlot: newSlot,
          staffResponse: staffResponse || null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", serviceId);
    if (updateErr) return { ok: false, error: updateErr.message };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("staff_audit_logs").insert({
      staff_user_id: user?.id,
      action_type: "APPROVE_RESCHEDULE",
      entity_type: "service_request",
      entity_id: serviceId,
      previous_status: ticket.status,
      new_status: "Rescheduled",
      metadata: { newDate, newSlot, method: ticket.method, staffResponse },
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to approve reschedule." };
  }
}

export async function rejectRescheduleRequest(
  serviceId: string,
  requestId?: string,
  staffResponse?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };
  try {
    let effectiveReqId = requestId;
    if (!effectiveReqId) {
      const { data: req } = await supabase
        .from("service_appointment_reschedule_requests")
        .select("id")
        .eq("ticket_id", serviceId)
        .eq("status", "pending")
        .maybeSingle();
      if (req?.id) effectiveReqId = req.id;
    }

    const { data, error } = await supabase.rpc("staff_decide_appointment_reschedule", {
      p_request_id: effectiveReqId || null,
      p_decision: "rejected",
      p_staff_response: staffResponse || null,
      p_ticket_id: serviceId,
    });

    if (error) {
      console.warn(
        "staff_decide_appointment_reschedule RPC returned error, using fallback:",
        error.message,
      );
    } else if (data && data.ok === false) {
      return { ok: false, error: data.error };
    } else if (data && data.ok === true) {
      return { ok: true };
    }

    // Direct fallback: keep confirmed appointment unchanged, update reschedule_details status & revert status to Booked
    const { data: ticket } = await supabase
      .from("service_requests")
      .select("id, status, reschedule_details")
      .eq("id", serviceId)
      .single();

    const currentDetails = (ticket?.reschedule_details as any) || {};
    const revertedStatus =
      ticket?.status === "Reschedule Requested" ? "Booked" : ticket?.status || "Booked";
    await supabase
      .from("service_requests")
      .update({
        status: revertedStatus,
        reschedule_details: {
          ...currentDetails,
          status: "rejected",
          staffResponse: staffResponse || null,
          decidedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", serviceId);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("staff_audit_logs").insert({
      staff_user_id: user?.id,
      action_type: "REJECT_RESCHEDULE",
      entity_type: "service_request",
      entity_id: serviceId,
      previous_status: ticket?.status,
      new_status: revertedStatus,
      metadata: { staffResponse },
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to reject reschedule." };
  }
}

export interface ServiceQueryOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  category?: string;
  method?: string;
  searchQuery?: string;
  sortBy?: "created_at" | "updated_at";
  sortOrder?: "asc" | "desc";
}

export interface ServiceQueryResult {
  services: ServiceRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

/**
 * Fetches paginated service requests with customer profile details.
 */
export async function fetchServices(
  options: ServiceQueryOptions = {},
): Promise<ServiceQueryResult> {
  const {
    page = 1,
    pageSize = 15,
    status = "ALL",
    category = "ALL",
    method = "ALL",
    searchQuery = "",
    sortBy = "created_at",
    sortOrder = "desc",
  } = options;

  if (!supabase) {
    return {
      services: [],
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
      .from("service_requests")
      .select("*, profiles:user_id(full_name, phone, email)", { count: "exact" });

    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    if (category && category !== "ALL") {
      query = query.ilike("device", `%${category}%`);
    }

    if (method && method !== "ALL") {
      const canonical = classifyServiceMethod(method);
      if (canonical === CANONICAL_SERVICE_METHODS.COURIER) {
        query = query.or("method.ilike.%courier%,method.ilike.%pickup%");
      } else if (canonical === CANONICAL_SERVICE_METHODS.ONSITE) {
        query = query.or("method.ilike.%on-site%,method.ilike.%doorstep%");
      } else {
        query = query.or("method.ilike.%visit%,method.ilike.%walk-in%,method.ilike.%walk in%");
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      query = query.or(
        `ticket_reference.ilike.%${q}%,device.ilike.%${q}%,model.ilike.%${q}%,problem.ilike.%${q}%,technician_name.ilike.%${q}%`,
      );
    }

    query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error("Error fetching services:", error);
      return { services: [], totalCount: 0, page, pageSize, totalPages: 0, error: error.message };
    }

    const services: ServiceRecord[] = (data || []).map((row: any) => ({
      ...row,
      customer_name: row.profiles?.full_name || "Valued Customer",
      customer_phone: row.profiles?.phone || "",
      customer_email: row.profiles?.email || "",
      findings: Array.isArray(row.findings) ? row.findings : [],
      quotation_items: Array.isArray(row.quotation_items) ? row.quotation_items : [],
      approved_items: Array.isArray(row.approved_items) ? row.approved_items : [],
      declined_items: Array.isArray(row.declined_items) ? row.declined_items : [],
      quotation_history: Array.isArray(row.quotation_history) ? row.quotation_history : [],
    }));

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      services,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err: any) {
    return { services: [], totalCount: 0, page, pageSize, totalPages: 0, error: err?.message };
  }
}

const inFlightStatusUpdates = new Set<string>();

/**
 * Updates a service ticket's status, assigns technician, logs internal staff notes,
 * saves diagnostic findings, and records an immutable audit trail entry.
 * Guarded against concurrent duplicate mutations.
 */
export async function updateServiceStatus(
  serviceId: string,
  newStatus: ServiceStatus,
  technicianName?: string,
  internalNotes?: string,
  findings?: DiagnosisFinding[],
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };

  if (inFlightStatusUpdates.has(serviceId)) {
    return { ok: false, error: "A status update is already in progress for this ticket." };
  }

  inFlightStatusUpdates.add(serviceId);

  try {
    const rpcRes = await supabase.rpc("staff_update_service_status", {
      p_service_id: serviceId,
      p_new_status: newStatus,
      p_technician_name: technicianName?.trim() || null,
      p_internal_notes: internalNotes !== undefined ? internalNotes.trim() : null,
      p_findings: findings || null,
    });

    if (rpcRes.error) {
      return { ok: false, error: rpcRes.error.message };
    }

    return { ok: Boolean(rpcRes.data?.ok ?? true) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update service status." };
  } finally {
    inFlightStatusUpdates.delete(serviceId);
  }
}

/**
 * Updates customer-facing description for a specific service status code with staff audit trail.
 */
export async function updateServiceStatusDescription(
  serviceId: string,
  status: string,
  description: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };

  try {
    const res = await supabase.rpc("staff_update_status_description", {
      p_service_id: serviceId,
      p_status: status,
      p_description: description.trim(),
    });

    if (res.error) {
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update tracking description." };
  }
}

export interface StaffTechnician {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  email: string;
}

/**
 * Fetches active staff members authorized to perform services / assignments.
 */
export async function fetchStaffTechnicians(): Promise<StaffTechnician[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("staff_members")
      .select("id, user_id, full_name, role, email")
      .eq("is_active", true)
      .in("role", ["portal_admin", "service_staff"])
      .order("full_name");
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Publishes an itemized workshop repair quotation with diagnosis findings for customer review.
 */
export async function staffPublishQuotation(
  serviceId: string,
  findings: DiagnosisFinding[],
  quotationItems: QuotationItem[],
  staffNotes?: string,
  currentRecord?: ServiceRecord,
): Promise<{ ok: boolean; totalAmount?: number; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };

  const totalPayable = quotationItems.reduce((acc, item) => {
    const line =
      (Number(item.partCost) + Number(item.labourCost)) * (Number(item.quantity) || 1) -
      (Number(item.discount) || 0);
    return acc + Math.max(0, line);
  }, 0);

  const newVersion = (currentRecord?.quote_version || 1) + 1;

  const revision = {
    version: currentRecord?.quote_version || 1,
    publishedAt: new Date().toISOString(),
    publishedBy: "IT HUB Workshop Staff",
    items: currentRecord?.quotation_items || [],
    findings: currentRecord?.findings || [],
    totalAmount: currentRecord?.quote || 0,
    notes: currentRecord?.notes || "",
  };

  const newHistory = currentRecord?.quotation_history
    ? [...currentRecord.quotation_history, revision]
    : [revision];

  try {
    const { error } = await supabase
      .from("service_requests")
      .update({
        status: "Awaiting Approval",
        quote: totalPayable,
        quote_state: "pending",
        quote_version: newVersion,
        findings: findings as any,
        quotation_items: quotationItems as any,
        approved_items: [],
        declined_items: [],
        quotation_history: newHistory as any,
        notes: staffNotes !== undefined ? staffNotes : currentRecord?.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serviceId);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, totalAmount: totalPayable };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to publish quotation." };
  }
}

/**
 * Fetches dashboard summary statistics for Service Management.
 */
export async function getServiceStats(): Promise<{
  totalBooked: number;
  totalInDiagnosis: number;
  totalAwaitingApproval: number;
  totalCompleted: number;
}> {
  if (!supabase) {
    return { totalBooked: 0, totalInDiagnosis: 0, totalAwaitingApproval: 0, totalCompleted: 0 };
  }

  try {
    const { data, error } = await supabase.from("service_requests").select("status").limit(500);

    if (error || !data) {
      return { totalBooked: 0, totalInDiagnosis: 0, totalAwaitingApproval: 0, totalCompleted: 0 };
    }

    let totalBooked = 0;
    let totalInDiagnosis = 0;
    let totalAwaitingApproval = 0;
    let totalCompleted = 0;

    for (const item of data) {
      if (item.status === "Booked") totalBooked++;
      if (item.status === "In Progress" || item.status === "Diagnosis Done") totalInDiagnosis++;
      if (item.status === "Awaiting Approval") totalAwaitingApproval++;
      if (item.status === "Completed" || item.status === "Delivered") totalCompleted++;
    }

    return { totalBooked, totalInDiagnosis, totalAwaitingApproval, totalCompleted };
  } catch {
    return { totalBooked: 0, totalInDiagnosis: 0, totalAwaitingApproval: 0, totalCompleted: 0 };
  }
}

/**
 * Computes live, unhardcoded counts across all three canonical service methods.
 */
export async function getServiceMethodCounts(): Promise<ServiceMethodCounts> {
  if (!supabase) {
    return { all: 0, courier: 0, onsite: 0, walkIn: 0 };
  }

  try {
    const { data, error } = await supabase.from("service_requests").select("method");
    if (error || !data) {
      return { all: 0, courier: 0, onsite: 0, walkIn: 0 };
    }
    return calculateMethodCounts(data);
  } catch {
    return { all: 0, courier: 0, onsite: 0, walkIn: 0 };
  }
}

/**
 * Fetches a single service ticket by ID for direct alert navigation.
 */
export async function fetchServiceById(id: string): Promise<ServiceRecord | null> {
  if (!supabase || !id) return null;
  const clean = id.trim();

  try {
    let query = supabase
      .from("service_requests")
      .select("*, profiles:user_id(full_name, phone, email)");

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
      query = query.eq("id", clean);
    } else {
      const ref = clean.toUpperCase().startsWith("ITH-SER-")
        ? clean.toUpperCase()
        : `ITH-SER-${clean.toUpperCase()}`;
      query = query.or(
        `ticket_reference.eq.${clean},ticket_reference.eq.${ref},id.ilike.${clean}%`,
      );
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) return null;

    return {
      ...data,
      customer_name: data.profiles?.full_name || "Valued Customer",
      customer_phone: data.profiles?.phone || "",
      customer_email: data.profiles?.email || "",
      findings: Array.isArray(data.findings) ? data.findings : [],
      quotation_items: Array.isArray(data.quotation_items) ? data.quotation_items : [],
      approved_items: Array.isArray(data.approved_items) ? data.approved_items : [],
      declined_items: Array.isArray(data.declined_items) ? data.declined_items : [],
      quotation_history: Array.isArray(data.quotation_history) ? data.quotation_history : [],
    };
  } catch {
    return null;
  }
}
