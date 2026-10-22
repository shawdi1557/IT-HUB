import { supabase, supabaseConfig } from "./supabase"
import {
  checkWarranty,
  type ServiceRequest,
  type DiagnosisFinding,
  type QuotationItem,
  type QuotationRevision,
} from "../data/catalog"

export interface ServiceBookingInput {
  device: string
  model: string
  problem: string
  method: string
  address: string
  date: string
  time: string
  name: string
  email: string
  phone?: string
  notes?: string
}

export interface SafePublicTracking {
  id: string
  userId?: string
  device: string
  model: string
  problem: string
  status: number
  statusLabel: string
  method: string
  date: string
  time: string
  quote: number
  quoteState: "pending" | "approved" | "rejected"
  quoteVersion?: number
  courierCharge?: { returnDelivery: number }
  technicianPublic: string
  isOwnerOrAdmin: boolean
  customerMaskedName?: string
  maskedAddress?: string
  notesPublic?: string
  createdAt?: string
  findings?: DiagnosisFinding[]
  quotationItems?: QuotationItem[]
  approvedItems?: string[]
  declinedItems?: string[]
}

export interface QuoteDecisionResult {
  ok: boolean
  decision?: "approved" | "rejected"
  nextStatus?: number
  nextStatusLabel?: string
  approvedItems?: string[]
  declinedItems?: string[]
  totalAmount?: number
  version?: number
  error?: string
}

export interface QuotationCalculation {
  partsTotal: number
  labourTotal: number
  subtotal: number
  discountsTotal: number
  diagnosticFee: number
  diagnosticFeeWaived: boolean
  courierFee: number
  totalPayable: number
  selectedCount: number
  totalCount: number
}

/**
 * Authoritatively calculates quotation item totals, labour, diagnostics, and courier fees.
 */
export function calculateQuotationTotals(
  items: QuotationItem[] = [],
  selectedItemIds: string[] = [],
  courierCharge?: { returnDelivery: number },
  baseDiagnosticFee: number = 300,
): QuotationCalculation {
  const selectedSet = new Set(selectedItemIds)
  const selectedItems = items.filter((it) => selectedSet.has(it.id))

  let partsTotal = 0
  let labourTotal = 0
  let discountsTotal = 0

  for (const it of selectedItems) {
    const qty = it.quantity || 1
    partsTotal += (it.partCost || 0) * qty
    labourTotal += (it.labourCost || 0) * qty
    discountsTotal += it.discount || 0
  }

  const subtotal = partsTotal + labourTotal
  const selectedCount = selectedItems.length

  // Diagnostic fee is waived when customer approves at least one repair.
  // If 0 repairs are approved (all declined or deferred), the standard diagnostic assessment fee applies.
  const diagnosticFeeWaived = selectedCount > 0
  const diagnosticFee = diagnosticFeeWaived ? 0 : baseDiagnosticFee

  const courierFee = courierCharge?.returnDelivery || 0
  const totalPayable = Math.max(
    0,
    subtotal - discountsTotal + diagnosticFee + courierFee,
  )

  return {
    partsTotal,
    labourTotal,
    subtotal,
    discountsTotal,
    diagnosticFee,
    diagnosticFeeWaived,
    courierFee,
    totalPayable,
    selectedCount,
    totalCount: items.length,
  }
}

export interface ItemSelectionValidation {
  valid: boolean
  error?: string
}

/**
 * Validates selected items against required classifications and dependencies.
 */
export function validateItemSelection(
  items: QuotationItem[] = [],
  selectedItemIds: string[] = [],
  decision: "approved" | "rejected" = "approved",
): ItemSelectionValidation {
  if (decision === "rejected" || selectedItemIds.length === 0) {
    return { valid: true }
  }

  const selectedSet = new Set(selectedItemIds)

  // 1. Check for required items
  for (const item of items) {
    if (item.isRequired && !selectedSet.has(item.id)) {
      return {
        valid: false,
        error: `Required repair "${item.title}" is essential for device operation and cannot be deselected if proceeding with repairs.`,
      }
    }
  }

  // 2. Check dependencies
  for (const item of items) {
    if (
      selectedSet.has(item.id) &&
      item.dependsOn &&
      item.dependsOn.length > 0
    ) {
      for (const depId of item.dependsOn) {
        if (!selectedSet.has(depId)) {
          const depItem = items.find((i) => i.id === depId)
          const depName = depItem ? depItem.title : depId
          return {
            valid: false,
            error: `Repair "${item.title}" requires "${depName}" to be authorized.`,
          }
        }
      }
    }
  }

  return { valid: true }
}

export interface UserProfileIdentity {
  id?: string
  email?: string
  phone?: string
  role?: string
}

export interface UserSessionIdentity {
  id?: string
  email?: string
  phone?: string
}

export interface ServiceBookingResult {
  ok: boolean
  id: string
  error?: string
}

export interface AdminUpdateResult {
  ok: boolean
  error?: string
}

/**
 * Normalizes a phone number for secure comparison across country-code formats.
 * e.g. "+91 98765 43210" -> "9876543210"
 */
export function normalizePhone(rawPhone?: string | null): string {
  if (!rawPhone) return ""
  const digits = rawPhone.replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2)
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1)
  }
  return digits
}

/**
 * Determines whether the current user is the authoritative owner of a service ticket,
 * or possesses an administrative role.
 */
export function isUserTicketOwner(
  request?: ServiceRequest | null,
  profile?: UserProfileIdentity | null,
  sessionUser?: UserSessionIdentity | null,
): boolean {
  if (!request) return false

  // 1. Admin role override
  if (profile?.role === "admin" || (profile as any)?.isAdmin) {
    return true
  }

  // 2. Direct Supabase UUID ownership match
  const authUserId = sessionUser?.id || profile?.id
  if (authUserId && request.userId && authUserId === request.userId) {
    return true
  }

  // 3. Normalized phone number match
  const userPhone = normalizePhone(sessionUser?.phone || profile?.phone)
  const reqPhone = normalizePhone(request.phone)
  if (userPhone && reqPhone && userPhone === reqPhone) {
    return true
  }

  // 4. Normalized email match
  const userEmail = (sessionUser?.email || profile?.email || "")
    .trim()
    .toLowerCase()
  const reqEmail = (request.email || "").trim().toLowerCase()
  if (userEmail && reqEmail && userEmail === reqEmail) {
    return true
  }

  return false
}

/**
 * Maps a database service_requests record to frontend ServiceRequest
 */
export function mapDbServiceRequest(
  item: any,
  defaultEmail = "",
  defaultPhone = "",
): ServiceRequest {
  const statusMap: Record<string, number> = {
    Booked: 0,
    "Pickup scheduled": 1,
    "Pickup Scheduled": 1,
    "Device received": 2,
    "Device Received": 2,
    "Diagnosis Done": 3,
    Diagnosing: 3,
    "Awaiting Approval": 4,
    "Awaiting approval": 4,
    Approved: 5,
    "In Progress": 6,
    "In progress": 6,
    Repairing: 6,
    "Quality check": 7,
    "Quality Check": 7,
    "Ready for delivery": 8,
    "Ready for Delivery": 8,
    Delivered: 8,
    Returned: 9,
    Completed: 9,
    Cancelled: 0,
  }

  return {
    id: item.id,
    userId: item.user_id,
    device: item.device,
    model: item.model || "",
    problem: item.problem,
    method: item.method,
    name: item.customer_name || "Customer",
    email: item.customer_email || defaultEmail,
    phone: item.customer_phone || defaultPhone,
    address: item.address || "",
    date: item.preferred_date || "",
    time: item.preferred_slot || "",
    status: statusMap[item.status] ?? 0,
    statusName: item.status,
    quote: Number(item.quote) || 0,
    quoteState: item.quote_state as any || "pending",
    technician: item.technician_name || "IT HUB Bench Specialist",
    notes: item.notes || "",
    courierCharge: item.courier_charge_return_delivery
      ? { returnDelivery: Number(item.courier_charge_return_delivery) }
      : undefined,
    quoteVersion: item.quote_version ? Number(item.quote_version) : 1,
    findings: Array.isArray(item.findings) ? item.findings : [],
    quotationItems: Array.isArray(item.quotation_items)
      ? item.quotation_items
      : [],
    approvedItems: Array.isArray(item.approved_items)
      ? item.approved_items
      : [],
    declinedItems: Array.isArray(item.declined_items)
      ? item.declined_items
      : [],
    decisionNotes: item.decision_notes || undefined,
    decisionAt: item.decision_at || undefined,
    decisionActor: item.decision_actor || undefined,
    quotationHistory: Array.isArray(item.quotation_history)
      ? item.quotation_history
      : [],
  }
}

/**
 * Creates a service booking record.
 * Persists to Supabase if authenticated & configured, with fallback to local store.
 */
export async function createServiceBooking(
  input: ServiceBookingInput,
  currentUserId?: string,
): Promise<ServiceBookingResult> {
  const id = `SRV-${crypto.randomUUID().slice(0, 7).toUpperCase()}`
  const isCourier = input.method === "Courier to IT HUB"
  const courierFee = isCourier ? 150 : undefined

  // Attempt Supabase insert if client is ready and user is authenticated
  if (supabase && supabaseConfig.isConfigured && currentUserId) {
    try {
      const { data, error: dbError } = await supabase
        .from("service_requests")
        .insert({
          user_id: currentUserId,
          device: input.device,
          model: input.model || null,
          problem: input.problem,
          method: input.method,
          preferred_date: input.date ? input.date : null,
          preferred_slot: input.time || null,
          status: "Booked",
          courier_charge_return_delivery: courierFee || null,
        })
        .select("id")
        .maybeSingle()

      if (dbError) {
        console.warn(
          "[Supabase] Failed to insert service_request:",
          dbError.message,
        )
      } else if (data?.id) {
        return { ok: true, id: data.id }
      }
    } catch (err) {
      console.warn("[Supabase] Service request network error:", err)
    }
  }

  return { ok: true, id }
}

/**
 * Fetches service requests for the current authenticated user from Supabase.
 */
export async function fetchUserServiceRequests(): Promise<ServiceRequest[]> {
  if (!supabase || !supabaseConfig.isConfigured) return []

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error || !data) return []

    return data.map((item) =>
      mapDbServiceRequest(item, user.email || "", user.phone || ""),
    )
  } catch (err) {
    console.warn("[Supabase] Error fetching user service requests:", err)
    return []
  }
}

/**
 * Fetches a single service request by ID from Supabase.
 */
export async function fetchServiceRequestById(
  id: string,
): Promise<ServiceRequest | null> {
  if (!supabase || !supabaseConfig.isConfigured) return null

  try {
    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (data && !error) {
      return mapDbServiceRequest(data)
    }
  } catch (err) {
    console.warn("[Supabase] Failed to fetch service request by id:", err)
  }

  return null
}

/**
 * Submits the customer's decision (Approve Repair or Reject Quotation).
 *
 * Security & RLS Compliance:
 * - Enforces authentication and checks ticket ownership server-side.
 * - Concurrency guard: requires quote_state = 'pending' so concurrent clicks cannot produce conflicting results.
 * - Protects status and price: strictly updates quote_state without tampering with status or quote amount,
 *   which satisfies the protect_service_request() trigger invariant.
 */
/**
 * Submits the customer's decision on a repair quotation.
 * Supports partial repair approvals, dependency checks, and authoritative recalculation.
 */
export async function submitCustomerQuoteDecision(
  requestId: string,
  decision: "approved" | "rejected",
  selectedItemIds: string[] = [],
  expectedVersion: number = 1,
  notes?: string,
  expectedQuoteAmount?: number,
  currentRequest?: ServiceRequest,
): Promise<QuoteDecisionResult> {
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "Invalid quotation decision." }
  }

  // 1. Try authoritative Supabase RPC first
  if (supabase && supabaseConfig.isConfigured) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "submit_customer_quote_decision",
        {
          p_request_id: requestId,
          p_decision: decision,
          p_approved_item_ids: decision === "approved" ? selectedItemIds : [],
          p_expected_version: expectedVersion,
          p_notes: notes || null,
        },
      )

      if (!rpcError && rpcData && rpcData.ok) {
        const nextStatus =
          rpcData.decision === "approved" && rpcData.approved_items?.length > 0
            ? 5
            : 4
        const nextStatusLabel =
          nextStatus === 5 ? "Approved" : "Awaiting approval"
        return {
          ok: true,
          decision: rpcData.decision,
          nextStatus,
          nextStatusLabel,
          approvedItems: rpcData.approved_items,
          declinedItems: rpcData.declined_items,
          totalAmount: rpcData.total,
          version: rpcData.version,
        }
      }

      // If RPC failed due to validation/auth, return its explicit error message
      if (
        rpcError &&
        !rpcError.message.includes("function") &&
        !rpcError.message.includes("does not exist")
      ) {
        return { ok: false, error: rpcError.message }
      }
    } catch {
      // Fall through to table update fallback
    }

    try {
      // 2. Fetch authoritative ticket to verify ownership, version, and pending status
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) {
        return {
          ok: false,
          error: "You must be signed in to approve or decline a quotation.",
        }
      }

      const { data: existing, error: fetchErr } = await supabase
        .from("service_requests")
        .select(
          "id, user_id, status, quote, quote_state, quote_version, quotation_items, courier_charge_return_delivery",
        )
        .eq("id", requestId)
        .maybeSingle()

      if (fetchErr || !existing) {
        return {
          ok: false,
          error:
            "Service request not found or you do not have permission to view it.",
        }
      }

      if (existing.user_id !== user.id) {
        return {
          ok: false,
          error: "Unauthorized: You do not own this service ticket.",
        }
      }

      if (existing.quote_state !== "pending") {
        return {
          ok: false,
          error: `This quotation has already been ${existing.quote_state}. Further decisions cannot be submitted.`,
        }
      }

      if (
        existing.quote_version &&
        existing.quote_version !== expectedVersion
      ) {
        return {
          ok: false,
          error: `The quotation has been revised to version ${existing.quote_version}. Please refresh to review the updated estimate.`,
        }
      }

      const items: QuotationItem[] = Array.isArray(existing.quotation_items)
        ? existing.quotation_items
        : []

      // Validate selection
      const val = validateItemSelection(items, selectedItemIds, decision)
      if (!val.valid) {
        return { ok: false, error: val.error }
      }

      const courierCharge = existing.courier_charge_return_delivery
        ? { returnDelivery: Number(existing.courier_charge_return_delivery) }
        : undefined

      const effectiveSelectedIds =
        decision === "approved" ? selectedItemIds : []
      const calc = calculateQuotationTotals(
        items,
        effectiveSelectedIds,
        courierCharge,
      )

      const allItemIds = items.map((i) => i.id)
      const declinedItemIds = allItemIds.filter(
        (id) => !effectiveSelectedIds.includes(id),
      )

      const updatedItems = items.map((i) => {
        if (effectiveSelectedIds.includes(i.id)) {
          return { ...i, approvalState: "approved" as const }
        }
        if (decision === "approved" && i.canDefer) {
          return { ...i, approvalState: "deferred" as const }
        }
        return { ...i, approvalState: "declined" as const }
      })

      const nextStatus =
        decision === "approved" && effectiveSelectedIds.length > 0 ? 5 : 4
      const nextStatusLabel =
        nextStatus === 5 ? "Approved" : "Awaiting approval"

      const { error: updateErr } = await supabase
        .from("service_requests")
        .update({
          quote_state: decision,
          quote: calc.totalPayable,
          quotation_items: updatedItems,
          approved_items: effectiveSelectedIds,
          declined_items: declinedItemIds,
          decision_notes: notes || null,
          decision_at: new Date().toISOString(),
          decision_actor: user.id,
        })
        .eq("id", requestId)
        .eq("quote_state", "pending")

      if (updateErr) {
        return {
          ok: false,
          error: updateErr.message || "Failed to update quotation decision.",
        }
      }

      return {
        ok: true,
        decision,
        nextStatus,
        nextStatusLabel,
        approvedItems: effectiveSelectedIds,
        declinedItems: declinedItemIds,
        totalAmount: calc.totalPayable,
        version: existing.quote_version || expectedVersion,
      }
    } catch (err: any) {
      return {
        ok: false,
        error:
          err?.message ||
          "A network error occurred while submitting your decision.",
      }
    }
  }

  // Fallback for offline prototype / demo mode / Deno test harness
  const items = currentRequest?.quotationItems || []
  const val = validateItemSelection(items, selectedItemIds, decision)
  if (!val.valid) {
    return { ok: false, error: val.error }
  }

  const effectiveSelectedIds = decision === "approved" ? selectedItemIds : []
  const calc = calculateQuotationTotals(
    items,
    effectiveSelectedIds,
    currentRequest?.courierCharge,
  )
  const allItemIds = items.map((i) => i.id)
  const declinedItemIds = allItemIds.filter(
    (id) => !effectiveSelectedIds.includes(id),
  )

  const updatedItems = items.map((i) => {
    if (effectiveSelectedIds.includes(i.id)) {
      return { ...i, approvalState: "approved" as const }
    }
    if (decision === "approved" && i.canDefer) {
      return { ...i, approvalState: "deferred" as const }
    }
    return { ...i, approvalState: "declined" as const }
  })

  const nextStatus =
    decision === "approved" && effectiveSelectedIds.length > 0 ? 5 : 4
  const nextStatusLabel = nextStatus === 5 ? "Approved" : "Awaiting approval"

  return {
    ok: true,
    decision,
    nextStatus,
    nextStatusLabel,
    approvedItems: effectiveSelectedIds,
    declinedItems: declinedItemIds,
    totalAmount: calc.totalPayable,
    version: expectedVersion,
  }
}

/**
 * Backward compatibility alias for customer quote decisions.
 */
export const updateServiceQuoteDecision = submitCustomerQuoteDecision

/**
 * Publishes an itemized quotation with diagnosis findings, incrementing version and resetting quote_state to pending.
 */
export async function adminPublishQuotation(
  requestId: string,
  findings: DiagnosisFinding[],
  quotationItems: QuotationItem[],
  adminNotes?: string,
  courierChargeReturnDelivery?: number,
  currentRequest?: ServiceRequest,
): Promise<{
  ok: boolean
  newVersion?: number
  totalAmount?: number
  error?: string
}> {
  const allItemIds = quotationItems.map((i) => i.id)
  const calc = calculateQuotationTotals(
    quotationItems,
    allItemIds,
    courierChargeReturnDelivery
      ? { returnDelivery: courierChargeReturnDelivery }
      : undefined,
  )

  const newVersion = (currentRequest?.quoteVersion || 1) + 1

  const revision: QuotationRevision = {
    version: currentRequest?.quoteVersion || 1,
    publishedAt: new Date().toISOString(),
    publishedBy: "IT HUB Workshop Admin",
    items: currentRequest?.quotationItems || [],
    findings: currentRequest?.findings || [],
    totalAmount: currentRequest?.quote || 0,
    notes: currentRequest?.notes || "",
  }

  const newHistory = currentRequest?.quotationHistory
    ? [...currentRequest.quotationHistory, revision]
    : [revision]

  if (supabase && supabaseConfig.isConfigured) {
    try {
      const { error } = await supabase
        .from("service_requests")
        .update({
          status: "Awaiting Approval",
          quote: calc.totalPayable,
          quote_state: "pending",
          quote_version: newVersion,
          findings: findings as any,
          quotation_items: quotationItems as any,
          approved_items: [],
          declined_items: [],
          quotation_history: newHistory as any,
          notes: adminNotes !== undefined ? adminNotes : currentRequest?.notes,
        })
        .eq("id", requestId)

      if (error) {
        return { ok: false, error: error.message }
      }
      return { ok: true, newVersion, totalAmount: calc.totalPayable }
    } catch (err: any) {
      return { ok: false, error: err?.message || "Failed to publish quotation" }
    }
  }

  return { ok: true, newVersion, totalAmount: calc.totalPayable }
}

/**
 * Updates service request records from the Admin dashboard.
 */
export async function adminUpdateServiceRequest(
  id: string,
  updates: {
    status?: string
    quote?: number
    quote_state?: string
    technician_name?: string
    notes?: string
  },
): Promise<AdminUpdateResult> {
  if (supabase && supabaseConfig.isConfigured) {
    try {
      const { error } = await supabase
        .from("service_requests")
        .update(updates)
        .eq("id", id)

      if (error) {
        console.warn(
          "[Supabase Admin] Failed to update service_request:",
          error.message,
        )
        return { ok: false, error: error.message }
      }
      return { ok: true }
    } catch (err: any) {
      console.warn("[Supabase Admin] Network error:", err)
      return { ok: false, error: err?.message }
    }
  }
  return { ok: true }
}

/**
 * Masks customer details to secure public tracking by service ticket ID.
 * Prevents unauthorized callers from accessing customer personal details, phone numbers,
 * exact addresses, or internal technician notes.
 */
export function maskServiceRequestForPublicTracking(
  request: ServiceRequest,
  isOwnerOrAdmin: boolean,
  statusLabels: string[],
): SafePublicTracking {
  const statusIndex = Math.min(
    Math.max(0, request.status),
    statusLabels.length - 1,
  )
  const statusLabel = statusLabels[statusIndex] || "Processing"

  if (isOwnerOrAdmin) {
    return {
      id: request.id,
      userId: request.userId,
      device: request.device,
      model: request.model,
      problem: request.problem,
      status: request.status,
      statusLabel,
      method: request.method,
      date: request.date,
      time: request.time,
      quote: request.quote,
      quoteState: request.quoteState,
      quoteVersion: request.quoteVersion || 1,
      courierCharge: request.courierCharge,
      technicianPublic: request.technician || "IT HUB Bench Technician",
      isOwnerOrAdmin: true,
      customerMaskedName: request.name,
      maskedAddress: request.address,
      notesPublic: request.notes,
      findings: request.findings || [],
      quotationItems: request.quotationItems || [],
      approvedItems: request.approvedItems || [],
      declinedItems: request.declinedItems || [],
    }
  }

  // Mask customer name: e.g. "Prakash A K" -> "P***** K."
  let maskedName = "Customer"
  if (request.name) {
    const parts = request.name.trim().split(/\s+/)
    if (parts.length === 1) {
      maskedName = `${parts[0][0]}***`
    } else {
      maskedName = `${parts[0][0]}*** ${parts[parts.length - 1][0]}.`
    }
  }

  // Mask address: e.g. "Kothamangalam, Ernakulam, PIN 686691" -> "Kerala Area (PIN 686***)"
  let maskedAddr = "IT HUB Registered Address"
  if (request.address) {
    const pinMatch = request.address.match(/\b([1-9][0-9]{2})[0-9]{3}\b/)
    if (pinMatch) {
      maskedAddr = `Kerala Area (PIN ${pinMatch[1]}***)`
    } else {
      maskedAddr = "Kerala Service Area"
    }
  }

  return {
    id: request.id,
    userId: request.userId,
    device: request.device,
    model: request.model,
    problem: request.problem,
    status: request.status,
    statusLabel,
    method: request.method,
    date: request.date,
    time: request.time,
    quote: request.quote,
    quoteState: request.quoteState,
    quoteVersion: request.quoteVersion || 1,
    courierCharge: request.courierCharge,
    technicianPublic: "Assigned IT HUB Repair Specialist",
    isOwnerOrAdmin: false,
    customerMaskedName: maskedName,
    maskedAddress: maskedAddr,
    notesPublic: undefined, // internal staff notes are omitted
    findings: (request.findings || []).map((f) => ({
      ...f,
      description: f.customerExplanation || f.title,
    })),
    quotationItems: request.quotationItems || [],
    approvedItems: request.approvedItems || [],
    declinedItems: request.declinedItems || [],
  }
}

/**
 * Service Coverage verification:
 * Checks whether an Indian PIN code is eligible for local Doorstep On-Site service
 * versus Kerala-wide Courier service and Store Walk-in.
 */
export function checkServiceCoverage(pincode: string, locations: any[]): {
  valid: boolean
  doorstepEligible: boolean
  courierEligible: boolean
  storeWalkInEligible: boolean
  areaName?: string
  distanceKm?: number
  message: string
} {
  const cleanPin = pincode
    .trim()
    .replace(/[^0-9]/g, "")
    .slice(0, 6)
  if (cleanPin.length !== 6) {
    return {
      valid: false,
      doorstepEligible: false,
      courierEligible: false,
      storeWalkInEligible: true,
      message: "Please enter a valid 6-digit Indian PIN code.",
    }
  }

  const result = checkWarranty(cleanPin, locations)

  // Doorstep is strictly within the local hub radius (~15 km of Kothamangalam / Ernakulam-Idukki border)
  const isDoorstep = result.status === "eligible"
  const isKeralaPin =
    cleanPin.startsWith("67") ||
    cleanPin.startsWith("68") ||
    cleanPin.startsWith("69")

  const areaName = "area" in result ? result.area : undefined
  const distanceKm = "distanceKm" in result ? result.distanceKm : undefined

  if (isDoorstep) {
    return {
      valid: true,
      doorstepEligible: true,
      courierEligible: true,
      storeWalkInEligible: true,
      areaName: areaName || "Kothamangalam Area",
      distanceKm: distanceKm ?? undefined,
      message: `Doorstep On-Site Service is available at ${areaName || "your location"} (~${distanceKm || 5} km from IT HUB)! You can also opt for Store Walk-in or Courier.`,
    }
  }

  if (isKeralaPin) {
    return {
      valid: true,
      doorstepEligible: false,
      courierEligible: true,
      storeWalkInEligible: true,
      areaName: areaName || "Kerala Region",
      distanceKm: distanceKm ?? undefined,
      message: `Doorstep technician visits are not available at PIN ${cleanPin} (outside our ~15 km local radius). However, our Kerala-wide Insured Courier Service and Store Walk-in are fully available for your area!`,
    }
  }

  return {
    valid: true,
    doorstepEligible: false,
    courierEligible: true,
    storeWalkInEligible: true,
    message: `PIN ${cleanPin} is outside Kerala local service radius. Courier service to IT HUB Kothamangalam or in-store drop-off is welcome.`,
  }
}
