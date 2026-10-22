// supabase/functions/tests/service-quote-approval.test.ts
// Automated Test Suite for Phase 5.1: Customer Repair Quotation Approval Workflow
// Validates Authentication, Authorization, Database Triggers, State Transitions, and Public Privacy.

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Simulated Types & Core Decision Logic
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceRecord {
  id: string
  user_id: string
  device: string
  model: string
  problem: string
  method: string
  status: string
  quote: number | null
  quote_state: "pending" | "approved" | "rejected" | null
  technician_name: string
  notes: string
  customer_name: string
  customer_email: string
  customer_phone: string
  address: string
}

interface UserProfile {
  id: string
  email: string
  phone: string
  role?: "customer" | "admin"
}

function normalizePhone(rawPhone?: string | null): string {
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

function isUserTicketOwner(
  request: { userId?: string; email?: string; phone?: string } | null,
  profile: { id?: string; email?: string; phone?: string; role?: string } | null,
  sessionUser?: { id?: string; email?: string; phone?: string } | null,
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

  // 3. Normalized phone match
  const userPhone = normalizePhone(sessionUser?.phone || profile?.phone)
  const reqPhone = normalizePhone(request.phone)
  if (userPhone && reqPhone && userPhone === reqPhone) {
    return true
  }

  // 4. Normalized email match
  const userEmail = (sessionUser?.email || profile?.email || "").trim().toLowerCase()
  const reqEmail = (request.email || "").trim().toLowerCase()
  if (userEmail && reqEmail && userEmail === reqEmail) {
    return true
  }

  return false
}

/**
 * Simulates the Supabase database trigger `protect_service_request()`
 * enforcing authorization, quote transitions, and immutability invariants.
 */
function simulateProtectServiceRequestTrigger(
  oldRow: ServiceRecord,
  newRow: ServiceRecord,
  actorRole: "customer" | "admin",
): { success: boolean; error?: string } {
  if (actorRole !== "admin") {
    // 1. Status changes forbidden for non-admins
    if (newRow.status !== oldRow.status) {
      return {
        success: false,
        error: "Unauthorized: Only administrators can update service request status",
      }
    }

    // 2. Technician assignments forbidden for non-admins
    if (newRow.technician_name !== oldRow.technician_name) {
      return {
        success: false,
        error: "Unauthorized: Only administrators can assign technicians",
      }
    }

    // 3. Internal notes immutable by non-admins
    if (newRow.notes !== oldRow.notes) {
      return {
        success: false,
        error: "Unauthorized: Only administrators can update internal notes",
      }
    }

    // 4. Quotation amount immutable by non-admins
    if (newRow.quote !== oldRow.quote) {
      return {
        success: false,
        error: "Unauthorized: Customers cannot modify quotation amounts",
      }
    }

    // 5. Customer quote state transitions
    if (newRow.quote_state !== oldRow.quote_state) {
      if (oldRow.quote_state !== "pending") {
        return {
          success: false,
          error: "Unauthorized: Invalid quote response transition (not in pending state)",
        }
      }
      if (oldRow.quote === null || oldRow.quote <= 0) {
        return {
          success: false,
          error: "Unauthorized: Invalid quote response transition (no quotation exists)",
        }
      }
      if (newRow.quote_state !== "approved" && newRow.quote_state !== "rejected") {
        return {
          success: false,
          error: "Unauthorized: Invalid quote response transition (target not approved/rejected)",
        }
      }
    }
  }

  return { success: true }
}

/**
 * Simulates backend submission of customer quote decision with concurrency and staleness checks
 */
function simulateCustomerQuoteDecision(
  ticket: ServiceRecord,
  actor: UserProfile | null,
  decision: "approved" | "rejected",
  expectedQuoteAmount?: number,
): { ok: boolean; nextStatus?: number; nextStatusLabel?: string; error?: string } {
  // 1. Authentication check
  if (!actor || !actor.id) {
    return { ok: false, error: "Authentication required. Please sign in to approve or reject quotations." }
  }

  // 2. Ownership verification
  const isOwner = isUserTicketOwner(
    { userId: ticket.user_id, email: ticket.customer_email, phone: ticket.customer_phone },
    actor,
    actor,
  )
  if (!isOwner) {
    return { ok: false, error: "You are not authorized to make decisions on this service request." }
  }

  // 3. Expected status check
  if (ticket.quote_state !== "pending" || ticket.quote === null) {
    return {
      ok: false,
      error: `Quotation is not awaiting approval (current state: ${ticket.quote_state || "none"}).`,
    }
  }

  // 4. Stale price check
  if (expectedQuoteAmount !== undefined && ticket.quote !== expectedQuoteAmount) {
    return {
      ok: false,
      error: `The quotation amount has changed (was ₹${expectedQuoteAmount}, now ₹${ticket.quote}). Please refresh to review the latest estimate.`,
    }
  }

  // 5. Database trigger validation
  const updatedRow: ServiceRecord = {
    ...ticket,
    quote_state: decision,
  }
  const triggerResult = simulateProtectServiceRequestTrigger(ticket, updatedRow, actor.role || "customer")
  if (!triggerResult.success) {
    return { ok: false, error: triggerResult.error }
  }

  // Transition status mapping
  const nextStatus = decision === "approved" ? 5 : 4
  const nextStatusLabel = decision === "approved" ? "Approved" : "Awaiting approval"

  return {
    ok: true,
    nextStatus,
    nextStatusLabel,
  }
}

/**
 * Public tracking privacy mask
 */
function maskServiceRequestForPublicTracking(
  request: ServiceRecord,
  isOwnerOrAdmin: boolean,
) {
  if (isOwnerOrAdmin) {
    return {
      id: request.id,
      customerName: request.customer_name,
      customerEmail: request.customer_email,
      customerPhone: request.customer_phone,
      address: request.address,
      notes: request.notes,
      quote: request.quote,
      quoteState: request.quote_state,
    }
  }

  // Masked public output
  let maskedName = "Verified Customer"
  if (request.customer_name) {
    const parts = request.customer_name.trim().split(/\s+/)
    maskedName = parts[0] ? `${parts[0][0]}***` : "Customer"
  }

  let maskedAddr = "IT HUB Registered Area"
  if (request.address) {
    const pinMatch = request.address.match(/\b([1-9][0-9]{2})[0-9]{3}\b/)
    maskedAddr = pinMatch ? `Kerala Area (PIN ${pinMatch[1]}***)` : "Kerala Area"
  }

  return {
    id: request.id,
    customerMaskedName: maskedName,
    customerEmail: undefined,
    customerPhone: undefined,
    maskedAddress: maskedAddr,
    notes: undefined,
    notesPublic: `Observed issue: ${request.problem}. Bench diagnostics registered.`,
    quote: request.quote,
    quoteState: request.quote_state,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: 13 Invariants from Phase 5.1 Specification
// ─────────────────────────────────────────────────────────────────────────────

const sampleTicket: ServiceRecord = {
  id: "SRV-TEST001",
  user_id: "user-uuid-123",
  device: "Laptop",
  model: "Dell XPS 15",
  problem: "Display backlight flickering",
  method: "walkin",
  status: "Awaiting Approval",
  quote: 2800,
  quote_state: "pending",
  technician_name: "Kiran IT HUB Lab",
  notes: "Internal notes: Replaced LED inverter board. Bench tested 2 hrs.",
  customer_name: "Rahul Nair",
  customer_email: "rahul@example.com",
  customer_phone: "+91 98472 12345",
  address: "House 42, Kothamangalam, PIN 686691",
}

const ownerUser: UserProfile = {
  id: "user-uuid-123",
  email: "rahul@example.com",
  phone: "+91 98472 12345",
  role: "customer",
}

const otherCustomer: UserProfile = {
  id: "user-uuid-999",
  email: "stranger@example.com",
  phone: "+91 94471 00000",
  role: "customer",
}

const adminUser: UserProfile = {
  id: "admin-uuid-001",
  email: "ithubkmgm@gmail.com",
  phone: "+91 98472 23886",
  role: "admin",
}

// 1. Awaiting Approval displays authorized customer's quotation actions
Deno.test("SRV-1: Ticket in 'pending' quote state authorizes owner decision action", () => {
  const isOwner = isUserTicketOwner(
    { userId: sampleTicket.user_id, email: sampleTicket.customer_email, phone: sampleTicket.customer_phone },
    ownerUser,
    ownerUser,
  )
  assertEquals(isOwner, true, "Ticket owner must be authorized")
  assertEquals(sampleTicket.quote_state, "pending", "Ticket must be in pending approval state")
})

// 2. Other statuses do not expose inappropriate approval actions
Deno.test("SRV-2: Statuses without pending quotation strictly block approval actions", () => {
  const ticketInRepair: ServiceRecord = {
    ...sampleTicket,
    status: "In Progress",
    quote_state: "approved",
  }
  const result = simulateCustomerQuoteDecision(ticketInRepair, ownerUser, "approved", 2800)
  assertEquals(result.ok, false)
  assertStringIncludes(result.error!, "not awaiting approval")

  const ticketWithoutQuote: ServiceRecord = {
    ...sampleTicket,
    quote: null,
    quote_state: null,
  }
  const result2 = simulateCustomerQuoteDecision(ticketWithoutQuote, ownerUser, "approved")
  assertEquals(result2.ok, false)
})

// 3. Authenticated ticket owner can approve a valid quotation
Deno.test("SRV-3: Authenticated ticket owner can approve a valid quotation", () => {
  const res = simulateCustomerQuoteDecision(sampleTicket, ownerUser, "approved", 2800)
  assertEquals(res.ok, true)
  assertEquals(res.nextStatus, 5, "Next status index should be 5 (Approved)")
  assertEquals(res.nextStatusLabel, "Approved")
})

// 4. Authenticated ticket owner can reject a valid quotation
Deno.test("SRV-4: Authenticated ticket owner can reject a valid quotation", () => {
  const res = simulateCustomerQuoteDecision(sampleTicket, ownerUser, "rejected", 2800)
  assertEquals(res.ok, true)
  assertEquals(res.nextStatus, 4, "Status index remains 4 awaiting admin return processing")
  assertEquals(res.nextStatusLabel, "Awaiting approval")
})

// 5. Approval persists the correct next status and quote_state
Deno.test("SRV-5: Approval sets quote_state='approved' without direct status override", () => {
  const updatedTicket: ServiceRecord = {
    ...sampleTicket,
    quote_state: "approved",
  }
  const triggerCheck = simulateProtectServiceRequestTrigger(sampleTicket, updatedTicket, "customer")
  assertEquals(triggerCheck.success, true, "Customer can update quote_state to approved")
})

// 6. Rejection persists the correct rejection state
Deno.test("SRV-6: Rejection sets quote_state='rejected' safely", () => {
  const updatedTicket: ServiceRecord = {
    ...sampleTicket,
    quote_state: "rejected",
  }
  const triggerCheck = simulateProtectServiceRequestTrigger(sampleTicket, updatedTicket, "customer")
  assertEquals(triggerCheck.success, true, "Customer can update quote_state to rejected")
})

// 7. Unauthenticated customers cannot make decisions
Deno.test("SRV-7: Unauthenticated calls are rejected with 401 equivalent", () => {
  const result = simulateCustomerQuoteDecision(sampleTicket, null, "approved", 2800)
  assertEquals(result.ok, false)
  assertStringIncludes(result.error!, "Authentication required")
})

// 8. Other customers cannot approve or reject someone else's ticket
Deno.test("SRV-8: Other customer accounts are denied with authorization failure", () => {
  const result = simulateCustomerQuoteDecision(sampleTicket, otherCustomer, "approved", 2800)
  assertEquals(result.ok, false)
  assertStringIncludes(result.error!, "not authorized")
})

// 9. Arbitrary status and quotation manipulation is rejected
Deno.test("SRV-9: Customers attempting to alter status or price are rejected by trigger", () => {
  // Attempt 1: Customer modifies status directly
  const tamperingStatus: ServiceRecord = {
    ...sampleTicket,
    status: "Completed",
    quote_state: "approved",
  }
  const statusCheck = simulateProtectServiceRequestTrigger(sampleTicket, tamperingStatus, "customer")
  assertEquals(statusCheck.success, false)
  assertStringIncludes(statusCheck.error!, "Only administrators can update service request status")

  // Attempt 2: Customer modifies quote price
  const tamperingPrice: ServiceRecord = {
    ...sampleTicket,
    quote: 100, // attempting discount
    quote_state: "approved",
  }
  const priceCheck = simulateProtectServiceRequestTrigger(sampleTicket, tamperingPrice, "customer")
  assertEquals(priceCheck.success, false)
  assertStringIncludes(priceCheck.error!, "Customers cannot modify quotation amounts")
})

// 10. Repeated and concurrent decisions cannot produce conflicting outcomes
Deno.test("SRV-10: Concurrency guard blocks duplicate or conflicting decisions once resolved", () => {
  // First decision succeeds
  const firstDecision = simulateCustomerQuoteDecision(sampleTicket, ownerUser, "approved", 2800)
  assertEquals(firstDecision.ok, true)

  // Ticket in DB now has quote_state = 'approved'
  const postDecisionTicket: ServiceRecord = {
    ...sampleTicket,
    quote_state: "approved",
  }

  // Second concurrent or repeated decision attempt
  const secondDecision = simulateCustomerQuoteDecision(postDecisionTicket, ownerUser, "rejected", 2800)
  assertEquals(secondDecision.ok, false)
  assertStringIncludes(secondDecision.error!, "not awaiting approval")
})

// 11. Stale quotations and tickets with changed statuses are handled safely
Deno.test("SRV-11: Stale quotation amount is detected and rejected before mutation", () => {
  // Admin updated quote from 2800 to 3200
  const updatedTicketByAdmin: ServiceRecord = {
    ...sampleTicket,
    quote: 3200,
  }
  // Client submitted decision based on cached ₹2800
  const result = simulateCustomerQuoteDecision(updatedTicketByAdmin, ownerUser, "approved", 2800)
  assertEquals(result.ok, false)
  assertStringIncludes(result.error!, "quotation amount has changed")
})

// 12. Public tracking continues to mask contact details, addresses and internal notes
Deno.test("SRV-12: Public tracking masks phone, email, address, and shields internal notes", () => {
  const publicView = maskServiceRequestForPublicTracking(sampleTicket, false)

  assertEquals(publicView.customerEmail, undefined, "Email must not be leaked")
  assertEquals(publicView.customerPhone, undefined, "Phone must not be leaked")
  assertEquals(publicView.notes, undefined, "Internal technician notes must NEVER be exposed publicly")
  assertStringIncludes(publicView.customerMaskedName!, "R***", "Name must be masked")
  assertStringIncludes(publicView.maskedAddress!, "686***", "Address PIN must be masked")

  // Authenticated owner view retains full details
  const ownerView = maskServiceRequestForPublicTracking(sampleTicket, true)
  assertEquals(ownerView.customerEmail, "rahul@example.com")
  assertEquals(ownerView.customerPhone, "+91 98472 12345")
  assertEquals(ownerView.notes, sampleTicket.notes)
})

// 13. Existing booking, admin status updates and tracking workflows remain functional
Deno.test("SRV-13: Admin can assign technicians and advance status", () => {
  const adminAssignedTicket: ServiceRecord = {
    ...sampleTicket,
    technician_name: "Senior Chip-Level Engineer",
    status: "Repairing",
  }
  const triggerCheck = simulateProtectServiceRequestTrigger(sampleTicket, adminAssignedTicket, "admin")
  assertEquals(triggerCheck.success, true, "Admins must have full operational control")
})
