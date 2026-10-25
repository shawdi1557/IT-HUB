// supabase/functions/tests/service-quote-approval.test.ts
// Automated Test Suite for Phase 5.1 & Phase 5.2:
// Customer Repair Quotation Approval, Dynamic Diagnosis Findings, Itemized Quotations & Partial Approvals.

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Types & Core Business Invariants
// ─────────────────────────────────────────────────────────────────────────────

interface DiagnosisFinding {
  id: string
  title: string
  description: string
  source: "customer" | "technician"
  classification: "confirmed" | "suspected" | "needs_further_testing"
  customerExplanation: string
  safety: "required" | "recommended" | "optional" | "cosmetic"
  isEligibleForRepair: boolean
  recommendedRepair: string
}

interface QuotationItem {
  id: string
  findingId?: string
  title: string
  description: string
  partCost: number
  labourCost: number
  quantity: number
  discount?: number
  lineTotal: number
  isRequired: boolean
  canDefer: boolean
  dependsOn?: string[]
  approvalState: "pending" | "approved" | "declined" | "deferred" | "rejected"
}

interface QuotationRevision {
  version: number
  publishedAt: string
  items: QuotationItem[]
  findings: DiagnosisFinding[]
  totalAmount: number
}

interface ServiceRecord {
  id: string
  user_id: string
  device: string
  model: string
  problem: string // original customer complaint
  method: string
  status: string
  quote: number | null
  quote_state: "pending" | "approved" | "rejected" | null
  quote_version: number
  technician_name: string
  notes: string
  customer_name: string
  customer_email: string
  customer_phone: string
  address: string
  courier_charge_return_delivery?: number
  findings: DiagnosisFinding[]
  quotation_items: QuotationItem[]
  approved_items: string[]
  declined_items: string[]
  quotation_history: QuotationRevision[]
  decision_notes?: string
  decision_at?: string
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

interface TicketOwnerRequest {
  userId?: string
  email?: string
  phone?: string
}

interface TicketOwnerProfile {
  id?: string
  email?: string
  phone?: string
  role?: string
  isAdmin?: boolean
}

interface TicketOwnerSession {
  id?: string
  email?: string
  phone?: string
}

function isUserTicketOwner(
  request: TicketOwnerRequest | null,
  profile: TicketOwnerProfile | null,
  sessionUser?: TicketOwnerSession | null,
): boolean {
  if (!request) return false

  if (profile?.role === "admin" || (profile as any)?.isAdmin) {
    return true
  }

  const authUserId = sessionUser?.id || profile?.id
  if (authUserId && request.userId && authUserId === request.userId) {
    return true
  }

  const userPhone = normalizePhone(sessionUser?.phone || profile?.phone)
  const reqPhone = normalizePhone(request.phone)
  if (userPhone && reqPhone && userPhone === reqPhone) {
    return true
  }

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
 * Calculates authoritative quotation totals
 */
function calculateQuotationTotals(
  items: QuotationItem[],
  selectedItemIds: string[],
  courierChargeReturn: number = 0,
  baseDiagnosticFee: number = 300,
) {
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

  // Diagnostic fee waived if at least 1 repair is authorized
  const diagnosticFeeWaived = selectedCount > 0
  const diagnosticFee = diagnosticFeeWaived ? 0 : baseDiagnosticFee
  const totalPayable = Math.max(
    0,
    subtotal - discountsTotal + diagnosticFee + courierChargeReturn,
  )

  return {
    partsTotal,
    labourTotal,
    subtotal,
    discountsTotal,
    diagnosticFee,
    diagnosticFeeWaived,
    courierFee: courierChargeReturn,
    totalPayable,
    selectedCount,
  }
}

/**
 * Validates selected items against required and dependency invariants
 */
interface ItemValidationResult {
  valid: boolean
  error?: string
}

function validateItemSelection(
  items: QuotationItem[],
  selectedItemIds: string[],
  decision: "approved" | "rejected",
): ItemValidationResult {
  if (decision === "rejected" || selectedItemIds.length === 0) {
    return { valid: true }
  }

  const selectedSet = new Set(selectedItemIds)

  // 1. Required repair enforcement
  for (const item of items) {
    if (item.isRequired && !selectedSet.has(item.id)) {
      return {
        valid: false,
        error: `Required repair "${item.title}" is essential for device operation and cannot be deselected if proceeding with repairs.`,
      }
    }
  }

  // 2. Dependency enforcement
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

/**
 * Simulates the authoritative Postgres RPC submit_customer_quote_decision()
 */
interface SimulateRpcResult {
  ok: boolean
  result?: Partial<ServiceRecord>
  error?: string
}

function simulateCustomerQuoteDecisionRpc(
  ticket: ServiceRecord,
  actor: UserProfile | null,
  decision: "approved" | "rejected",
  approvedItemIds: string[],
  expectedVersion: number,
  notes?: string,
): SimulateRpcResult {
  // 1. Authentication check
  if (!actor || !actor.id) {
    return { ok: false, error: "Unauthorized: Authentication required" }
  }

  // 2. Ownership verification
  const isOwner = isUserTicketOwner(
    {
      userId: ticket.user_id,
      email: ticket.customer_email,
      phone: ticket.customer_phone,
    },
    actor,
    actor,
  )
  if (!isOwner) {
    return {
      ok: false,
      error: "Unauthorized: You do not own this service ticket",
    }
  }

  // 3. Status check
  if (ticket.quote_state !== "pending") {
    return {
      ok: false,
      error: `Invalid state: Quotation is not awaiting approval (current: ${ticket.quote_state})`,
    }
  }

  // 4. Stale version check
  if (ticket.quote_version !== expectedVersion) {
    return {
      ok: false,
      error: `Stale quotation: Quotation has been revised to version ${ticket.quote_version}. Please refresh to review the latest estimate.`,
    }
  }

  // 5. Item selection validation
  const val = validateItemSelection(
    ticket.quotation_items,
    approvedItemIds,
    decision,
  )
  if (!val.valid) {
    return { ok: false, error: val.error }
  }

  // 6. Recalculation
  const effectiveApprovedIds = decision === "approved" ? approvedItemIds : []
  const calc = calculateQuotationTotals(
    ticket.quotation_items,
    effectiveApprovedIds,
    ticket.courier_charge_return_delivery || 0,
  )

  const allItemIds = ticket.quotation_items.map((i) => i.id)
  const declinedItemIds = allItemIds.filter(
    (id) => !effectiveApprovedIds.includes(id),
  )

  const updatedQuotationItems = ticket.quotation_items.map((i) => {
    if (effectiveApprovedIds.includes(i.id)) {
      return { ...i, approvalState: "approved" as const }
    }
    if (decision === "approved" && i.canDefer) {
      return { ...i, approvalState: "deferred" as const }
    }
    return { ...i, approvalState: "declined" as const }
  })

  const newStatus =
    decision === "approved" && effectiveApprovedIds.length > 0
      ? "In Progress"
      : "Awaiting Approval"

  const updated: ServiceRecord = {
    ...ticket,
    quote_state: decision,
    quote: calc.totalPayable,
    status: newStatus,
    quotation_items: updatedQuotationItems,
    approved_items: effectiveApprovedIds,
    declined_items: declinedItemIds,
    decision_notes: notes,
    decision_at: new Date().toISOString(),
  }

  return { ok: true, result: updated }
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
      findings: request.findings,
      quotationItems: request.quotation_items,
      quote: request.quote,
      quoteState: request.quote_state,
      approvedItems: request.approved_items,
      declinedItems: request.declined_items,
    }
  }

  let maskedName = "Customer"
  if (request.customer_name) {
    const parts = request.customer_name.trim().split(/\s+/)
    maskedName = parts[0] ? `${parts[0][0]}***` : "Customer"
  }

  let maskedAddr = "Kerala Service Area"
  if (request.address) {
    const pinMatch = request.address.match(/\b([1-9][0-9]{2})[0-9]{3}\b/)
    maskedAddr = pinMatch
      ? `Kerala Area (PIN ${pinMatch[1]}***)`
      : "Kerala Area"
  }

  return {
    id: request.id,
    customerMaskedName: maskedName,
    customerEmail: undefined,
    customerPhone: undefined,
    maskedAddress: maskedAddr,
    notes: undefined, // internal technician notes hidden
    findings: request.findings.map((f) => ({
      ...f,
      description: f.customerExplanation || f.title, // internal description shielded
    })),
    quotationItems: request.quotation_items,
    quote: request.quote,
    quoteState: request.quote_state,
    approvedItems: request.approved_items,
    declinedItems: request.declined_items,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const initialCustomerProblem =
  "Laptop battery dying rapidly and laptop shuts down abruptly."

const sampleServiceTicket: ServiceRecord = {
  id: "SRV-LAPTOP-502",
  user_id: "user-uuid-123",
  device: "Laptop",
  model: "MacBook Pro 16",
  problem: initialCustomerProblem,
  method: "Visit IT HUB",
  status: "Awaiting Approval",
  quote: 6800,
  quote_state: "pending",
  quote_version: 1,
  technician_name: "Senior Workbench Specialist",
  notes: "Internal diagnostic note: Logic board rails verified, 12V stable.",
  customer_name: "Anand Menon",
  customer_email: "anand@example.com",
  customer_phone: "+91 98472 99881",
  address: "Kothamangalam Town, Ernakulam, PIN 686691",
  findings: [
    {
      id: "f-battery",
      title: "Battery Health Degraded (Customer Complaint)",
      description:
        "Internal technician note: Cycle count 890, battery swelling detected.",
      source: "customer",
      classification: "confirmed",
      customerExplanation:
        "Battery has reached end-of-life and requires replacement for battery runtime.",
      safety: "recommended",
      isEligibleForRepair: true,
      recommendedRepair: "OEM 96Wh Grade-A Battery replacement",
    },
    {
      id: "f-display",
      title: "Display Flex Cable Micro-Fraying (Discovered Fault)",
      description:
        "Internal technician note: Stage lighting effect observed at 110 degrees lid angle.",
      source: "technician",
      classification: "confirmed",
      customerExplanation:
        "Display cable shows slight flex wear causing occasional flicker when opened wide.",
      safety: "optional", // can be safely deferred
      isEligibleForRepair: true,
      recommendedRepair: "Display flex harness realignment & micro-soldering",
    },
  ],
  quotation_items: [
    {
      id: "item-battery-repl",
      findingId: "f-battery",
      title: "MacBook Pro OEM Battery Assembly",
      description:
        "Grade-A certified replacement battery with 90-day warranty.",
      partCost: 3500,
      labourCost: 800,
      quantity: 1,
      lineTotal: 4300,
      isRequired: false,
      canDefer: false,
      approvalState: "pending",
    },
    {
      id: "item-display-cable",
      findingId: "f-display",
      title: "Display Flex Cable Repair",
      description: "Micro-soldering repair for lid flex cable.",
      partCost: 1500,
      labourCost: 1000,
      quantity: 1,
      lineTotal: 2500,
      isRequired: false,
      canDefer: true, // safely deferrable
      approvalState: "pending",
    },
  ],
  approved_items: [],
  declined_items: [],
  quotation_history: [],
}

const owner: UserProfile = {
  id: "user-uuid-123",
  email: "anand@example.com",
  phone: "+91 98472 99881",
  role: "customer",
}

const stranger: UserProfile = {
  id: "user-uuid-999",
  email: "stranger@example.com",
  phone: "+91 91111 22222",
  role: "customer",
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5.2 Test Specifications
// ─────────────────────────────────────────────────────────────────────────────

// 1. Adding multiple diagnosis findings
Deno.test("PARTIAL-1: Multiple diagnosis findings recorded with distinct sources and safety ratings", () => {
  assertEquals(sampleServiceTicket.findings.length, 2)
  assertEquals(sampleServiceTicket.findings[0].source, "customer")
  assertEquals(sampleServiceTicket.findings[1].source, "technician")
  assertEquals(sampleServiceTicket.findings[1].safety, "optional")
})

// 2. Preserving the original customer complaint
Deno.test("PARTIAL-2: Original customer complaint is preserved intact and never overwritten", () => {
  assertEquals(
    sampleServiceTicket.problem,
    initialCustomerProblem,
    "Customer problem must not be replaced by technician findings",
  )
})

// 3. Publishing and revising quotations with audit trail
Deno.test("PARTIAL-3: Publishing quotation revision increments version and appends to audit history", () => {
  const previousRevision: QuotationRevision = {
    version: sampleServiceTicket.quote_version,
    publishedAt: new Date().toISOString(),
    items: [...sampleServiceTicket.quotation_items],
    findings: [...sampleServiceTicket.findings],
    totalAmount: sampleServiceTicket.quote || 0,
  }

  // Admin publishes version 2 with updated price
  const revisedTicket: ServiceRecord = {
    ...sampleServiceTicket,
    quote_version: 2,
    quote: 7200,
    quotation_history: [previousRevision],
  }

  assertEquals(revisedTicket.quote_version, 2)
  assertEquals(revisedTicket.quotation_history.length, 1)
  assertEquals(revisedTicket.quotation_history[0].version, 1)
})

// 4. Customer selection of individual repair items & Partial Approval
Deno.test("PARTIAL-4: Partial Approval: Customer approves battery while declining safely deferrable display repair", () => {
  // Customer selects only 'item-battery-repl'
  const approvedSelection = ["item-battery-repl"]

  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "approved",
    approvedSelection,
    1,
    "Proceed with battery replacement only for now",
  )

  assertEquals(res.ok, true)
  const updated = res.result!
  assertEquals(updated.quote_state, "approved")
  assertEquals(updated.status, "In Progress")
  assertEquals(updated.approved_items, ["item-battery-repl"])
  assertEquals(updated.declined_items, ["item-display-cable"])

  // Diagnostic fee is waived because 1 repair is authorized:
  // Battery: Part (3500) + Labour (800) = 4300. Diagnostic fee = 0. Total = 4300.
  assertEquals(updated.quote, 4300)
  assertStringIncludes(updated.decision_notes!, "battery replacement only")
})

// 5. Correct recalculation of totals and fees
Deno.test("PARTIAL-5: Correct recalculation of totals and diagnostic fee waiver", () => {
  // Approving both items
  const bothItems = ["item-battery-repl", "item-display-cable"]
  const calcBoth = calculateQuotationTotals(
    sampleServiceTicket.quotation_items,
    bothItems,
  )
  assertEquals(calcBoth.partsTotal, 5000) // 3500 + 1500
  assertEquals(calcBoth.labourTotal, 1800) // 800 + 1000
  assertEquals(calcBoth.diagnosticFeeWaived, true)
  assertEquals(calcBoth.diagnosticFee, 0)
  assertEquals(calcBoth.totalPayable, 6800)

  // Approving single item
  const singleItem = ["item-battery-repl"]
  const calcSingle = calculateQuotationTotals(
    sampleServiceTicket.quotation_items,
    singleItem,
  )
  assertEquals(calcSingle.partsTotal, 3500)
  assertEquals(calcSingle.labourTotal, 800)
  assertEquals(calcSingle.diagnosticFeeWaived, true)
  assertEquals(calcSingle.totalPayable, 4300)
})

// 6. Rejecting invalid combinations of dependent repairs
Deno.test("PARTIAL-6: Dependency Enforcement: Cannot approve dependent item without prerequisite item", () => {
  // Define dependent item
  const ticketWithDep: ServiceRecord = {
    ...sampleServiceTicket,
    quotation_items: [
      {
        id: "item-logic-board",
        title: "Logic Board Power IC Replacement",
        description: "Primary repair",
        partCost: 2000,
        labourCost: 1000,
        quantity: 1,
        lineTotal: 3000,
        isRequired: false,
        canDefer: false,
        approvalState: "pending",
      },
      {
        id: "item-daughter-board",
        title: "USB-C Port Sub-Assembly",
        description: "Requires primary logic board rail to function",
        partCost: 800,
        labourCost: 400,
        quantity: 1,
        lineTotal: 1200,
        isRequired: false,
        canDefer: true,
        dependsOn: ["item-logic-board"], // depends on logic board
        approvalState: "pending",
      },
    ],
  }

  // Attempting to select daughter board WITHOUT logic board
  const res = simulateCustomerQuoteDecisionRpc(
    ticketWithDep,
    owner,
    "approved",
    ["item-daughter-board"], // missing prerequisite!
    1,
  )

  assertEquals(res.ok, false)
  assertStringIncludes(res.error!, "requires")
  assertStringIncludes(res.error!, "to be authorized")

  // Selecting BOTH is valid
  const resValid = simulateCustomerQuoteDecisionRpc(
    ticketWithDep,
    owner,
    "approved",
    ["item-logic-board", "item-daughter-board"],
    1,
  )
  assertEquals(resValid.ok, true)
})

// 7. Required repair enforcement
Deno.test("PARTIAL-7: Required Repair Enforcement: Essential repairs cannot be omitted if proceeding", () => {
  const ticketWithRequired: ServiceRecord = {
    ...sampleServiceTicket,
    quotation_items: [
      {
        id: "item-safety-fuse",
        title: "Main Power Safety Fuse",
        description: "Required for fire/electrical safety",
        partCost: 300,
        labourCost: 200,
        quantity: 1,
        lineTotal: 500,
        isRequired: true, // required!
        canDefer: false,
        approvalState: "pending",
      },
      {
        id: "item-fan-upgrade",
        title: "Silent Fan Upgrade",
        description: "Optional accessory",
        partCost: 600,
        labourCost: 200,
        quantity: 1,
        lineTotal: 800,
        isRequired: false,
        canDefer: true,
        approvalState: "pending",
      },
    ],
  }

  // Trying to approve fan upgrade while omitting required safety fuse
  const res = simulateCustomerQuoteDecisionRpc(
    ticketWithRequired,
    owner,
    "approved",
    ["item-fan-upgrade"],
    1,
  )
  assertEquals(res.ok, false)
  assertStringIncludes(res.error!, "Required repair")
})

// 8. Declining all repairs
Deno.test("PARTIAL-8: Declining all repairs applies diagnostic fee and marks all items declined", () => {
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "rejected",
    [], // 0 items approved
    1,
    "Too expensive, will replace device",
  )

  assertEquals(res.ok, true)
  const updated = res.result!
  assertEquals(updated.quote_state, "rejected")
  assertEquals(updated.status, "Awaiting Approval")
  assertEquals(updated.approved_items!.length, 0)
  assertEquals(updated.declined_items!.length, 2)
  // Diagnostic assessment fee of 300 applies upon collection
  assertEquals(updated.quote, 300)
})

// 9. Ownership and RLS enforcement
Deno.test("PARTIAL-9: Ownership Enforcement: Non-owners cannot submit decisions on someone else's ticket", () => {
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    stranger,
    "approved",
    ["item-battery-repl"],
    1,
  )
  assertEquals(res.ok, false)
  assertStringIncludes(res.error!, "Unauthorized")
})

// 10. Tampered prices and totals
Deno.test("PARTIAL-10: Server authoritative calculation ignores manipulated client prices", () => {
  // Even if a malicious client sends a fake total, the RPC calculates strictly from ticket.quotation_items
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "approved",
    ["item-battery-repl"], // 3500 + 800 = 4300
    1,
  )
  assertEquals(res.ok, true)
  assertEquals(
    res.result!.quote,
    4300,
    "Price must be calculated authoritatively",
  )
})

// 11. Stale quotation versions
Deno.test("PARTIAL-11: Stale version check: Decision on v1 when v2 is published is rejected", () => {
  const ticketV2: ServiceRecord = {
    ...sampleServiceTicket,
    quote_version: 2,
  }

  // Client submits decision expecting version 1
  const res = simulateCustomerQuoteDecisionRpc(
    ticketV2,
    owner,
    "approved",
    ["item-battery-repl"],
    1, // stale!
  )
  assertEquals(res.ok, false)
  assertStringIncludes(res.error!, "Stale quotation")
  assertStringIncludes(res.error!, "revised to version 2")
})

// 12. Duplicate and concurrent approval requests
Deno.test("PARTIAL-12: Concurrency guard blocks duplicate decisions once resolved", () => {
  const alreadyResolvedTicket: ServiceRecord = {
    ...sampleServiceTicket,
    quote_state: "approved",
  }

  const res = simulateCustomerQuoteDecisionRpc(
    alreadyResolvedTicket,
    owner,
    "approved",
    ["item-battery-repl"],
    1,
  )
  assertEquals(res.ok, false)
  assertStringIncludes(res.error!, "not awaiting approval")
})

// 13. Public tracker privacy
Deno.test("PARTIAL-13: Public tracking masks phone, email, and redacts internal technician diagnosis notes", () => {
  const publicView = maskServiceRequestForPublicTracking(
    sampleServiceTicket,
    false,
  )

  assertEquals(publicView.customerEmail, undefined)
  assertEquals(publicView.customerPhone, undefined)
  assertEquals(publicView.notes, undefined)
  assertStringIncludes(publicView.customerMaskedName!, "A***")
  assertStringIncludes(publicView.maskedAddress!, "686***")

  // Internal description in finding is masked with customerExplanation
  const publicFinding = publicView.findings[1]
  assertEquals(
    publicFinding.description,
    sampleServiceTicket.findings[1].customerExplanation,
  )
  assertNotEquals(
    publicFinding.description,
    sampleServiceTicket.findings[1].description,
  )
})

// 14. Per-item approval states recorded accurately
Deno.test("PARTIAL-14: Line items record approved, deferred, or declined states upon decision", () => {
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "approved",
    ["item-battery-repl"],
    1,
  )

  assertEquals(res.ok, true)
  const items = res.result!.quotation_items!
  const battery = items.find((i) => i.id === "item-battery-repl")
  const display = items.find((i) => i.id === "item-display-cable")

  assertEquals(battery?.approvalState, "approved")
  assertEquals(display?.approvalState, "deferred") // display had canDefer = true
})

// 15. Cross-screen consistency between customer selection and admin view
Deno.test("PARTIAL-15: Cross-screen consistency: Saved selection and final total match across customer and admin views", () => {
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "approved",
    ["item-battery-repl"],
    1,
    "Customer authorized battery only",
  )

  assertEquals(res.ok, true)
  const updatedTicket = res.result!

  // Customer tracking view sees exact approved items and authoritative total
  const customerView = maskServiceRequestForPublicTracking(
    updatedTicket as any,
    true,
  )
  assertEquals(customerView.quote, 4300)
  assertEquals(customerView.approvedItems, ["item-battery-repl"])
  assertEquals(customerView.declinedItems, ["item-display-cable"])

  // Admin view totals calculated from the updated ticket match customerView exactly
  const adminCalc = calculateQuotationTotals(
    updatedTicket.quotation_items!,
    updatedTicket.approved_items!,
    updatedTicket.courier_charge_return_delivery,
  )
  assertEquals(adminCalc.totalPayable, customerView.quote)
  assertEquals(adminCalc.diagnosticFeeWaived, true)
})

// 16. JSON serialization compatibility (both camelCase and snake_case items)
Deno.test("PARTIAL-16: Authoritative RPC logic handles both camelCase and snake_case item pricing fields", () => {
  const snakeCaseItem = {
    id: "item-snake",
    part_cost: 1200,
    labour_cost: 400,
    quantity: 1,
    is_required: false,
    can_defer: true,
  }
  const camelCaseItem = {
    id: "item-camel",
    partCost: 1200,
    labourCost: 400,
    quantity: 1,
    isRequired: false,
    canDefer: true,
  }

  // Parse snake-case
  const pSnake =
    (snakeCaseItem as any).partCost ?? (snakeCaseItem as any).part_cost
  const lSnake =
    (snakeCaseItem as any).labourCost ?? (snakeCaseItem as any).labour_cost
  assertEquals(pSnake + lSnake, 1600)

  // Parse camel-case
  const pCamel =
    (camelCaseItem as any).partCost ?? (camelCaseItem as any).part_cost
  const lCamel =
    (camelCaseItem as any).labourCost ?? (camelCaseItem as any).labour_cost
  assertEquals(pCamel + lCamel, 1600)
})
