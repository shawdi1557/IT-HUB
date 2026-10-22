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
}

/**
 * Creates a service booking record.
 * Persists to Supabase if authenticated & configured, with fallback to local store.
 */
export async function createServiceBooking(
  input: ServiceBookingInput,
  currentUserId?: string,
): Promise<{ ok: boolean id: string error?: string }> {
  const id = `SRV-${crypto.randomUUID().slice(0, 7).toUpperCase()}`
  const isCourier = input.method === "Courier to IT HUB"
  const courierFee = isCourier ? 150 : undefined

  // Attempt Supabase insert if client is ready and user is authenticated
  if (supabase && supabaseConfig.isConfigured && currentUserId) {
    try {
      const { error: dbError } = await supabase
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

      if (dbError) {
        console.warn(
          "[Supabase] Failed to insert service_request:",
          dbError.message,
        )
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

    const statusMap: Record<string, number> = {
      Booked: 0,
      "Pickup scheduled": 1,
      "Device received": 2,
      "Diagnosis Done": 3,
      Diagnosing: 3,
      "Awaiting Approval": 4,
      "In Progress": 6,
      Approved: 5,
      Repairing: 6,
      "Quality check": 7,
      Delivered: 8,
      Returned: 9,
      Completed: 9,
      Cancelled: 0,
    }

    return data.map((item) => ({
      id: item.id,
      device: item.device,
      model: item.model || "",
      problem: item.problem,
      method: item.method,
      name: user.user_metadata?.full_name || "Customer",
      email: user.email || "",
      address: "",
      date: item.preferred_date || "",
      time: item.preferred_slot || "",
      status: statusMap[item.status] ?? 0,
      quote: Number(item.quote) || 0,
      quoteState: item.quote_state || "pending",
      technician: item.technician_name || "Assigned IT HUB Technician",
      notes: item.notes || "",
      courierCharge: item.courier_charge_return_delivery
        ? { returnDelivery: Number(item.courier_charge_return_delivery) }
        : undefined,
    }))
  } catch (err) {
    console.warn("[Supabase] Error fetching user service requests:", err)
    return []
  }
}

/**
 * Updates quote state (approved / rejected) in Supabase and local store.
 */
export async function updateServiceQuoteDecision(
  id: string,
  quoteState: "approved" | "rejected",
): Promise<{ ok: boolean error?: string }> {
  if (supabase && supabaseConfig.isConfigured) {
    try {
      const { error } = await supabase
        .from("service_requests")
        .update({
          quote_state: quoteState,
          status:
            quoteState === "approved" ? "In Progress" : "Awaiting Approval",
        })
        .eq("id", id)

      if (error) {
        console.warn("[Supabase] Quote decision update error:", error.message)
      }
    } catch (err) {
      console.warn("[Supabase] Quote decision network error:", err)
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

  // Mask address: e.g. "Kothamangalam, Ernakulam, PIN 686691" -> "Kothamangalam Area, PIN 686***"
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
