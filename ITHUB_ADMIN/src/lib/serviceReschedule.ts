// ITHUB_ADMIN/src/lib/serviceReschedule.ts
// Service Reschedule Restriction Logic & Method Validation for Staff Portal
// IT HUB — Kerala, India

/**
 * The four supported service intake methods across IT HUB storefront, database, and staff portal.
 */
export const SERVICE_INTAKE_METHODS = {
  ONSITE: "On-site Technician Visit",
  COURIER: "Courier to IT HUB",
  WALK_IN_DIRECT: "Direct Store Walk-In",
  WALK_IN_VISIT: "Visit IT HUB",
} as const;

export type ServiceIntakeMethod =
  | "On-site Technician Visit"
  | "On-site service"
  | "Doorstep Technician Visit"
  | "Courier to IT HUB"
  | "Insured Courier Pickup & Return"
  | "Direct Store Walk-In"
  | "Visit IT HUB";

/**
 * Determines whether a service intake method supports customer appointment rescheduling.
 * Customer rescheduling is strictly restricted to On-site Technician Visits.
 */
export function isRescheduleEligible(method?: string | null): boolean {
  if (!method || typeof method !== "string") return false;
  const m = method.trim().toLowerCase();
  return m.includes("on-site") || m.includes("doorstep");
}

export interface RescheduleDetails {
  requestedDate?: string;
  requestedSlot?: string;
  reason?: string;
}

export interface RescheduleCheckTicket {
  method?: string | null;
  status?: string | null;
  reschedule_details?: RescheduleDetails | Record<string, unknown> | null;
}

/**
 * Determines whether the Customer Reschedule Request panel should be displayed in the
 * Service Management ticket details modal.
 *
 * Rules:
 * 1. Method MUST be an On-site Technician Visit.
 * 2. Ticket must have an active reschedule request (either status is "Reschedule Requested"
 *    or reschedule_details contains requestedDate, requestedSlot, or a non-empty reason).
 * 3. Default empty object `{}` from PostgreSQL jsonb defaults does NOT trigger the panel.
 */
export function shouldDisplayReschedulePanel(ticket?: RescheduleCheckTicket | null): boolean {
  if (!ticket || !isRescheduleEligible(ticket.method)) {
    return false;
  }

  const details = ticket.reschedule_details as
    | (RescheduleDetails & { status?: string })
    | undefined;

  // If the reschedule request is already decided, do not show the action required panel
  if (
    details &&
    typeof details === "object" &&
    (details.status === "approved" || details.status === "rejected")
  ) {
    return false;
  }

  if (ticket.status === "Rescheduled") {
    return false;
  }

  const hasStatusRequest = ticket.status === "Reschedule Requested";

  const hasDetailsRequest = Boolean(
    details &&
    typeof details === "object" &&
    details.status !== "approved" &&
    details.status !== "rejected" &&
    (Boolean(details.requestedDate) ||
      Boolean(details.requestedSlot) ||
      Boolean(details.reason?.trim())),
  );

  return hasStatusRequest || hasDetailsRequest;
}

/**
 * Validates backend eligibility before approving a reschedule request.
 * Enforces that non-on-site tickets cannot be updated to "Rescheduled".
 */
export function validateRescheduleApproval(ticket?: RescheduleCheckTicket | null): {
  valid: boolean;
  error?: string;
} {
  if (!ticket || !isRescheduleEligible(ticket.method)) {
    return {
      valid: false,
      error: `Customer reschedule requests are only supported for On-site Technician Visits (current method: "${ticket?.method || "Unspecified"}").`,
    };
  }
  return { valid: true };
}

/**
 * Returns tailored status pipeline options for staff queue management by service method.
 * Only On-site Technician Visits include "Reschedule Requested" and "Rescheduled".
 */
export function getStatusOptionsForMethod(
  method?: string | null,
  currentStatus?: string,
): string[] {
  const m = (method || "").trim().toLowerCase();
  let baseOptions: string[] = [];

  if (m.includes("doorstep") || m.includes("on-site")) {
    baseOptions = [
      "Booked",
      "Technician Assigned",
      "Technician has Left IT HUB",
      "Technician Arrived at Your Location",
      "Under Diagnosis",
      "Service in Progress",
      "Quality Check",
      "Completed",
      "Reschedule Requested",
      "Rescheduled",
      "Cancelled",
    ];
  } else if (m.includes("courier") || m.includes("pickup")) {
    baseOptions = [
      "Booked",
      "Device Received",
      "Under Diagnosis",
      "Diagnosis Done",
      "Awaiting Approval",
      "Approved",
      "In Progress",
      "Quality Check",
      "Ready for Delivery",
      "Ready for Pickup",
      "Completed",
      "Delivered",
      "Returned",
      "Cancelled",
    ];
  } else {
    // Direct Store Walk-In & Visit IT HUB
    baseOptions = [
      "Booked",
      "Customer Arrived",
      "Device Received",
      "Under Diagnosis",
      "Diagnosis Done",
      "Awaiting Approval",
      "Approved",
      "In Progress",
      "Quality Check",
      "Ready for Pickup",
      "Completed",
      "Cancelled",
    ];
  }

  if (currentStatus && !baseOptions.includes(currentStatus)) {
    return [currentStatus, ...baseOptions];
  }
  return baseOptions;
}

/**
 * Evaluates whether a customer can request rescheduling for a service ticket.
 * Preconditions:
 * 1. Intake method is On-site Technician Visit.
 * 2. An appointment has been scheduled (preferred_date is truthy).
 * 3. Ticket status permits rescheduling (not Completed, Cancelled, Delivered, Returned).
 * 4. No conflicting pending reschedule request exists.
 */
export function shouldDisplayRescheduleButton(ticket?: any | null): boolean {
  if (!ticket || !isRescheduleEligible(ticket.method)) {
    return false;
  }
  if (!ticket.preferred_date && !ticket.date) {
    return false;
  }
  const terminalStatuses = ["completed", "cancelled", "delivered", "returned"];
  const currentStatus = (ticket.status || "").trim().toLowerCase();
  if (terminalStatuses.includes(currentStatus)) {
    return false;
  }

  // Check if pending request exists
  const details = ticket.reschedule_details;
  if (details && typeof details === "object" && details.status === "pending") {
    return false;
  }

  return true;
}

/**
 * Validates a requested appointment date.
 * Rules:
 * 1. Must be formatted YYYY-MM-DD.
 * 2. Must be strictly in the future (tomorrow onwards).
 * 3. Cannot be on Sunday (IT HUB closed).
 */
export function validateRequestedAppointmentDate(dateStr?: string | null): {
  valid: boolean;
  error?: string;
} {
  if (!dateStr || typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return { valid: false, error: "Please select a valid date in YYYY-MM-DD format." };
  }

  const [year, month, day] = dateStr.trim().split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (target.getDay() === 0) {
    return {
      valid: false,
      error: "IT HUB is closed on Sundays. Please select Monday through Saturday.",
    };
  }

  if (target <= today) {
    return { valid: false, error: "Requested appointment date must be in the future." };
  }

  return { valid: true };
}

/**
 * Formats appointment date and time for clean customer display.
 */
export function formatAppointmentDisplay(dateStr?: string | null, slotStr?: string | null): string {
  if (!dateStr) return "Earliest Handover";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(dateObj);
    return slotStr ? `${formattedDate} · ${slotStr}` : formattedDate;
  } catch {
    return slotStr ? `${dateStr} · ${slotStr}` : dateStr;
  }
}
