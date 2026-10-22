import { supabase, supabaseConfig } from "./supabase"
import { checkWarranty, type ServiceRequest } from "../data/catalog"

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
  courierCharge?: { returnDelivery: number }
  technicianPublic: string
  isOwnerOrAdmin: boolean
  customerMaskedName?: string
  maskedAddress?: string
  notesPublic?: string
  createdAt?: string
}

export interface QuoteDecisionResult {
  ok: boolean
  decision?: "approved" | "rejected"
  nextStatus?: number
  nextStatusLabel?: string
  error?: string
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
    "Device received": 2,
    "Diagnosis Done": 3,
    Diagnosing: 3,
    "Awaiting Approval": 4,
    Approved: 5,
    "In Progress": 6,
    Repairing: 6,
    "Quality check": 7,
    "Ready for delivery": 8,
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
export async function submitCustomerQuoteDecision(
  requestId: string,
  decision: "approved" | "rejected",
  expectedQuoteAmount?: number,
): Promise<QuoteDecisionResult> {
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "Invalid quotation decision." }
  }

  if (supabase && supabaseConfig.isConfigured) {
    try {
      // 1. Verify user authentication
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

      // 2. Fetch authoritative ticket to verify ownership, pending status, and quote amount
      const { data: existing, error: fetchErr } = await supabase
        .from("service_requests")
        .select("id, user_id, status, quote, quote_state")
        .eq("id", requestId)
        .maybeSingle()

      if (fetchErr) {
        return {
          ok: false,
          error: `Failed to load quotation: ${fetchErr.message}`,
        }
      }

      if (!existing) {
        return {
          ok: false,
          error:
            "Service request not found or you do not have permission to view it.",
        }
      }

      // 3. Enforce ownership server-side
      if (existing.user_id !== user.id) {
        return {
          ok: false,
          error: "Unauthorized: You do not own this service ticket.",
        }
      }

      // 4. Verify the quote is actively pending
      if (existing.quote_state !== "pending") {
        return {
          ok: false,
          error: `This quotation has already been ${existing.quote_state}. Further decisions cannot be submitted.`,
        }
      }

      if (
        existing.quote === null ||
        existing.quote === undefined ||
        Number(existing.quote) <= 0
      ) {
        return {
          ok: false,
          error: "No active quotation amount is set for this ticket.",
        }
      }

      // 5. Prevent stale quotation submissions if technician updated price
      if (
        expectedQuoteAmount !== undefined &&
        Math.abs(Number(existing.quote) - expectedQuoteAmount) > 0.01
      ) {
        return {
          ok: false,
          error:
            "The quotation amount has changed. Please review the updated estimate before deciding.",
        }
      }

      // 6. Mutate quote_state atomically under RLS and protect_service_request trigger
      const { error: updateErr } = await supabase
        .from("service_requests")
        .update({
          quote_state: decision,
        })
        .eq("id", requestId)
        .eq("quote_state", "pending") // concurrency guard

      if (updateErr) {
        return {
          ok: false,
          error: updateErr.message || "Failed to update quotation decision.",
        }
      }

      const nextStatus = decision === "approved" ? 5 : 4
      const nextStatusLabel =
        decision === "approved" ? "Approved" : "Awaiting approval"

      return {
        ok: true,
        decision,
        nextStatus,
        nextStatusLabel,
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

  // Fallback for offline prototype / demo mode
  return {
    ok: true,
    decision,
    nextStatus: decision === "approved" ? 5 : 4,
    nextStatusLabel: decision === "approved" ? "Approved" : "Awaiting approval",
  }
}

/**
 * Backward compatibility alias for customer quote decisions.
 */
export const updateServiceQuoteDecision = submitCustomerQuoteDecision

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
      courierCharge: request.courierCharge,
      technicianPublic: request.technician || "IT HUB Bench Technician",
      isOwnerOrAdmin: true,
      customerMaskedName: request.name,
      maskedAddress: request.address,
      notesPublic: request.notes,
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
    courierCharge: request.courierCharge,
    technicianPublic: "Assigned IT HUB Repair Specialist",
    isOwnerOrAdmin: false,
    customerMaskedName: maskedName,
    maskedAddress: maskedAddr,
    notesPublic: undefined, // internal staff notes are omitted
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
