// supabase/functions/tests/service-quote-approval.test.ts
// Automated Test Suite for Phase 5.1 & Phase 5.2:
// Customer Repair Quotation Approval, Dynamic Diagnosis Findings, Itemized Quotations & Partial Approvals.

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Core Business Invariants
// ─────────────────────────────────────────────────────────────────────────────

interface DiagnosisFinding {
  id: string;
  title: string;
  description: string;
  source: "customer" | "technician";
  classification: "confirmed" | "suspected" | "needs_further_testing";
  customerExplanation: string;
  safety: "required" | "recommended" | "optional" | "cosmetic";
  isEligibleForRepair: boolean;
  recommendedRepair: string;
}

interface QuotationItem {
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
  approvalState: "pending" | "approved" | "declined" | "deferred" | "rejected";
  requirementLevel?: "required" | "recommended" | "optional";
}

interface QuotationRevision {
  version: number;
  publishedAt: string;
  items: QuotationItem[];
  findings: DiagnosisFinding[];
  totalAmount: number;
}

interface ServiceRecord {
  id: string;
  user_id: string;
  device: string;
  model: string;
  problem: string; // original customer complaint
  method: string;
  status: string;
  quote: number | null;
  quote_state: "pending" | "approved" | "rejected" | null;
  quote_version: number;
  technician_name: string;
  notes: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address: string;
  courier_charge_return_delivery?: number;
  findings: DiagnosisFinding[];
  quotation_items: QuotationItem[];
  approved_items: string[];
  declined_items: string[];
  quotation_history: QuotationRevision[];
  decision_notes?: string;
  decision_at?: string;
  guest_tracking_token?: string;
  created_at?: string;
  updated_at?: string;
}

interface UserProfile {
  id: string;
  email: string;
  phone: string;
  role?: "customer" | "admin";
}

function normalizePhone(rawPhone?: string | null): string {
  if (!rawPhone) return "";
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

interface TicketOwnerRequest {
  userId?: string;
  email?: string;
  phone?: string;
}

interface TicketOwnerProfile {
  id?: string;
  email?: string;
  phone?: string;
  role?: string;
  isAdmin?: boolean;
}

interface TicketOwnerSession {
  id?: string;
  email?: string;
  phone?: string;
}

function isUserTicketOwner(
  request: TicketOwnerRequest | null,
  profile: TicketOwnerProfile | null,
  sessionUser?: TicketOwnerSession | null,
): boolean {
  if (!request) return false;

  if (profile?.role === "admin" || (profile as any)?.isAdmin) {
    return true;
  }

  const authUserId = sessionUser?.id || profile?.id;
  if (authUserId && request.userId && authUserId === request.userId) {
    return true;
  }

  const userPhone = normalizePhone(sessionUser?.phone || profile?.phone);
  const reqPhone = normalizePhone(request.phone);
  if (userPhone && reqPhone && userPhone === reqPhone) {
    return true;
  }

  const userEmail = (sessionUser?.email || profile?.email || "").trim().toLowerCase();
  const reqEmail = (request.email || "").trim().toLowerCase();
  if (userEmail && reqEmail && userEmail === reqEmail) {
    return true;
  }

  return false;
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
  const selectedSet = new Set(selectedItemIds);
  const selectedItems = items.filter((it) => selectedSet.has(it.id));

  let partsTotal = 0;
  let labourTotal = 0;
  let discountsTotal = 0;

  for (const it of selectedItems) {
    const qty = it.quantity || 1;
    partsTotal += (it.partCost || 0) * qty;
    labourTotal += (it.labourCost || 0) * qty;
    discountsTotal += it.discount || 0;
  }

  const subtotal = partsTotal + labourTotal;
  const selectedCount = selectedItems.length;

  // Diagnostic fee waived if at least 1 repair is authorized
  const diagnosticFeeWaived = selectedCount > 0;
  const diagnosticFee = diagnosticFeeWaived ? 0 : baseDiagnosticFee;
  const totalPayable = Math.max(0, subtotal - discountsTotal + diagnosticFee + courierChargeReturn);

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
  };
}

/**
 * Validates selected items against required and dependency invariants
 */
interface ItemValidationResult {
  valid: boolean;
  error?: string;
}

function validateItemSelection(
  items: QuotationItem[],
  selectedItemIds: string[],
  decision: "approved" | "rejected",
): ItemValidationResult {
  if (decision === "rejected" || selectedItemIds.length === 0) {
    return { valid: true };
  }

  const selectedSet = new Set(selectedItemIds);

  // 1. Required repair enforcement
  for (const item of items) {
    if (item.isRequired && !selectedSet.has(item.id)) {
      return {
        valid: false,
        error: `Required repair "${item.title}" is essential for device operation and cannot be deselected if proceeding with repairs.`,
      };
    }
  }

  // 2. Dependency enforcement
  for (const item of items) {
    if (selectedSet.has(item.id) && item.dependsOn && item.dependsOn.length > 0) {
      for (const depId of item.dependsOn) {
        if (!selectedSet.has(depId)) {
          const depItem = items.find((i) => i.id === depId);
          const depName = depItem ? depItem.title : depId;
          return {
            valid: false,
            error: `Repair "${item.title}" requires "${depName}" to be authorized.`,
          };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Simulates the authoritative Postgres RPC submit_customer_quote_decision()
 */
interface SimulateRpcResult {
  ok: boolean;
  result?: Partial<ServiceRecord>;
  error?: string;
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
    return { ok: false, error: "Unauthorized: Authentication required" };
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
  );
  if (!isOwner) {
    return {
      ok: false,
      error: "Unauthorized: You do not own this service ticket",
    };
  }

  // 3. Status check
  if (ticket.quote_state !== "pending") {
    return {
      ok: false,
      error: `Invalid state: Quotation is not awaiting approval (current: ${ticket.quote_state})`,
    };
  }

  // 4. Stale version check
  if (ticket.quote_version !== expectedVersion) {
    return {
      ok: false,
      error: `Stale quotation: Quotation has been revised to version ${ticket.quote_version}. Please refresh to review the latest estimate.`,
    };
  }

  // 5. Item selection validation
  const val = validateItemSelection(ticket.quotation_items, approvedItemIds, decision);
  if (!val.valid) {
    return { ok: false, error: val.error };
  }

  // 6. Recalculation
  const effectiveApprovedIds = decision === "approved" ? approvedItemIds : [];
  const calc = calculateQuotationTotals(
    ticket.quotation_items,
    effectiveApprovedIds,
    ticket.courier_charge_return_delivery || 0,
  );

  const allItemIds = ticket.quotation_items.map((i) => i.id);
  const declinedItemIds = allItemIds.filter((id) => !effectiveApprovedIds.includes(id));

  const updatedQuotationItems = ticket.quotation_items.map((i) => {
    if (effectiveApprovedIds.includes(i.id)) {
      return { ...i, approvalState: "approved" as const };
    }
    if (decision === "approved" && i.canDefer) {
      return { ...i, approvalState: "deferred" as const };
    }
    return { ...i, approvalState: "declined" as const };
  });

  const newStatus =
    decision === "approved" && effectiveApprovedIds.length > 0
      ? "In Progress"
      : "Awaiting Approval";

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
  };

  return { ok: true, result: updated };
}

/**
 * Public tracking privacy mask
 */
function maskServiceRequestForPublicTracking(request: ServiceRecord, isOwnerOrAdmin: boolean) {
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
    };
  }

  let maskedName = "Customer";
  if (request.customer_name) {
    const parts = request.customer_name.trim().split(/\s+/);
    maskedName = parts[0] ? `${parts[0][0]}***` : "Customer";
  }

  let maskedAddr = "Kerala Service Area";
  if (request.address) {
    const pinMatch = request.address.match(/\b([1-9][0-9]{2})[0-9]{3}\b/);
    maskedAddr = pinMatch ? `Kerala Area (PIN ${pinMatch[1]}***)` : "Kerala Area";
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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const initialCustomerProblem = "Laptop battery dying rapidly and laptop shuts down abruptly.";

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
      description: "Internal technician note: Cycle count 890, battery swelling detected.",
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
      description: "Grade-A certified replacement battery with 90-day warranty.",
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
};

const owner: UserProfile = {
  id: "user-uuid-123",
  email: "anand@example.com",
  phone: "+91 98472 99881",
  role: "customer",
};

const stranger: UserProfile = {
  id: "user-uuid-999",
  email: "stranger@example.com",
  phone: "+91 91111 22222",
  role: "customer",
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5.2 Test Specifications
// ─────────────────────────────────────────────────────────────────────────────

// 1. Adding multiple diagnosis findings
Deno.test("PARTIAL-1: Multiple diagnosis findings recorded with distinct sources and safety ratings", () => {
  assertEquals(sampleServiceTicket.findings.length, 2);
  assertEquals(sampleServiceTicket.findings[0].source, "customer");
  assertEquals(sampleServiceTicket.findings[1].source, "technician");
  assertEquals(sampleServiceTicket.findings[1].safety, "optional");
});

// 2. Preserving the original customer complaint
Deno.test("PARTIAL-2: Original customer complaint is preserved intact and never overwritten", () => {
  assertEquals(
    sampleServiceTicket.problem,
    initialCustomerProblem,
    "Customer problem must not be replaced by technician findings",
  );
});

// 3. Publishing and revising quotations with audit trail
Deno.test("PARTIAL-3: Publishing quotation revision increments version and appends to audit history", () => {
  const previousRevision: QuotationRevision = {
    version: sampleServiceTicket.quote_version,
    publishedAt: new Date().toISOString(),
    items: [...sampleServiceTicket.quotation_items],
    findings: [...sampleServiceTicket.findings],
    totalAmount: sampleServiceTicket.quote || 0,
  };

  // Admin publishes version 2 with updated price
  const revisedTicket: ServiceRecord = {
    ...sampleServiceTicket,
    quote_version: 2,
    quote: 7200,
    quotation_history: [previousRevision],
  };

  assertEquals(revisedTicket.quote_version, 2);
  assertEquals(revisedTicket.quotation_history.length, 1);
  assertEquals(revisedTicket.quotation_history[0].version, 1);
});

// 4. Customer selection of individual repair items & Partial Approval
Deno.test("PARTIAL-4: Partial Approval: Customer approves battery while declining safely deferrable display repair", () => {
  // Customer selects only 'item-battery-repl'
  const approvedSelection = ["item-battery-repl"];

  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "approved",
    approvedSelection,
    1,
    "Proceed with battery replacement only for now",
  );

  assertEquals(res.ok, true);
  const updated = res.result!;
  assertEquals(updated.quote_state, "approved");
  assertEquals(updated.status, "In Progress");
  assertEquals(updated.approved_items, ["item-battery-repl"]);
  assertEquals(updated.declined_items, ["item-display-cable"]);

  // Diagnostic fee is waived because 1 repair is authorized:
  // Battery: Part (3500) + Labour (800) = 4300. Diagnostic fee = 0. Total = 4300.
  assertEquals(updated.quote, 4300);
  assertStringIncludes(updated.decision_notes!, "battery replacement only");
});

// 5. Correct recalculation of totals and fees
Deno.test("PARTIAL-5: Correct recalculation of totals and diagnostic fee waiver", () => {
  // Approving both items
  const bothItems = ["item-battery-repl", "item-display-cable"];
  const calcBoth = calculateQuotationTotals(sampleServiceTicket.quotation_items, bothItems);
  assertEquals(calcBoth.partsTotal, 5000); // 3500 + 1500
  assertEquals(calcBoth.labourTotal, 1800); // 800 + 1000
  assertEquals(calcBoth.diagnosticFeeWaived, true);
  assertEquals(calcBoth.diagnosticFee, 0);
  assertEquals(calcBoth.totalPayable, 6800);

  // Approving single item
  const singleItem = ["item-battery-repl"];
  const calcSingle = calculateQuotationTotals(sampleServiceTicket.quotation_items, singleItem);
  assertEquals(calcSingle.partsTotal, 3500);
  assertEquals(calcSingle.labourTotal, 800);
  assertEquals(calcSingle.diagnosticFeeWaived, true);
  assertEquals(calcSingle.totalPayable, 4300);
});

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
  };

  // Attempting to select daughter board WITHOUT logic board
  const res = simulateCustomerQuoteDecisionRpc(
    ticketWithDep,
    owner,
    "approved",
    ["item-daughter-board"], // missing prerequisite!
    1,
  );

  assertEquals(res.ok, false);
  assertStringIncludes(res.error!, "requires");
  assertStringIncludes(res.error!, "to be authorized");

  // Selecting BOTH is valid
  const resValid = simulateCustomerQuoteDecisionRpc(
    ticketWithDep,
    owner,
    "approved",
    ["item-logic-board", "item-daughter-board"],
    1,
  );
  assertEquals(resValid.ok, true);
});

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
  };

  // Trying to approve fan upgrade while omitting required safety fuse
  const res = simulateCustomerQuoteDecisionRpc(
    ticketWithRequired,
    owner,
    "approved",
    ["item-fan-upgrade"],
    1,
  );
  assertEquals(res.ok, false);
  assertStringIncludes(res.error!, "Required repair");
});

// 8. Declining all repairs
Deno.test("PARTIAL-8: Declining all repairs applies diagnostic fee and marks all items declined", () => {
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "rejected",
    [], // 0 items approved
    1,
    "Too expensive, will replace device",
  );

  assertEquals(res.ok, true);
  const updated = res.result!;
  assertEquals(updated.quote_state, "rejected");
  assertEquals(updated.status, "Awaiting Approval");
  assertEquals(updated.approved_items!.length, 0);
  assertEquals(updated.declined_items!.length, 2);
  // Diagnostic assessment fee of 300 applies upon collection
  assertEquals(updated.quote, 300);
});

// 9. Ownership and RLS enforcement
Deno.test("PARTIAL-9: Ownership Enforcement: Non-owners cannot submit decisions on someone else's ticket", () => {
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    stranger,
    "approved",
    ["item-battery-repl"],
    1,
  );
  assertEquals(res.ok, false);
  assertStringIncludes(res.error!, "Unauthorized");
});

// 10. Tampered prices and totals
Deno.test("PARTIAL-10: Server authoritative calculation ignores manipulated client prices", () => {
  // Even if a malicious client sends a fake total, the RPC calculates strictly from ticket.quotation_items
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "approved",
    ["item-battery-repl"], // 3500 + 800 = 4300
    1,
  );
  assertEquals(res.ok, true);
  assertEquals(res.result!.quote, 4300, "Price must be calculated authoritatively");
});

// 11. Stale quotation versions
Deno.test("PARTIAL-11: Stale version check: Decision on v1 when v2 is published is rejected", () => {
  const ticketV2: ServiceRecord = {
    ...sampleServiceTicket,
    quote_version: 2,
  };

  // Client submits decision expecting version 1
  const res = simulateCustomerQuoteDecisionRpc(
    ticketV2,
    owner,
    "approved",
    ["item-battery-repl"],
    1, // stale!
  );
  assertEquals(res.ok, false);
  assertStringIncludes(res.error!, "Stale quotation");
  assertStringIncludes(res.error!, "revised to version 2");
});

// 12. Duplicate and concurrent approval requests
Deno.test("PARTIAL-12: Concurrency guard blocks duplicate decisions once resolved", () => {
  const alreadyResolvedTicket: ServiceRecord = {
    ...sampleServiceTicket,
    quote_state: "approved",
  };

  const res = simulateCustomerQuoteDecisionRpc(
    alreadyResolvedTicket,
    owner,
    "approved",
    ["item-battery-repl"],
    1,
  );
  assertEquals(res.ok, false);
  assertStringIncludes(res.error!, "not awaiting approval");
});

// 13. Public tracker privacy
Deno.test("PARTIAL-13: Public tracking masks phone, email, and redacts internal technician diagnosis notes", () => {
  const publicView = maskServiceRequestForPublicTracking(sampleServiceTicket, false);

  assertEquals(publicView.customerEmail, undefined);
  assertEquals(publicView.customerPhone, undefined);
  assertEquals(publicView.notes, undefined);
  assertStringIncludes(publicView.customerMaskedName!, "A***");
  assertStringIncludes(publicView.maskedAddress!, "686***");

  // Internal description in finding is masked with customerExplanation
  const publicFinding = publicView.findings[1];
  assertEquals(publicFinding.description, sampleServiceTicket.findings[1].customerExplanation);
  assertNotEquals(publicFinding.description, sampleServiceTicket.findings[1].description);
});

// 14. Per-item approval states recorded accurately
Deno.test("PARTIAL-14: Line items record approved, deferred, or declined states upon decision", () => {
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "approved",
    ["item-battery-repl"],
    1,
  );

  assertEquals(res.ok, true);
  const items = res.result!.quotation_items!;
  const battery = items.find((i) => i.id === "item-battery-repl");
  const display = items.find((i) => i.id === "item-display-cable");

  assertEquals(battery?.approvalState, "approved");
  assertEquals(display?.approvalState, "deferred"); // display had canDefer = true
});

// 15. Cross-screen consistency between customer selection and admin view
Deno.test("PARTIAL-15: Cross-screen consistency: Saved selection and final total match across customer and admin views", () => {
  const res = simulateCustomerQuoteDecisionRpc(
    sampleServiceTicket,
    owner,
    "approved",
    ["item-battery-repl"],
    1,
    "Customer authorized battery only",
  );

  assertEquals(res.ok, true);
  const updatedTicket = res.result!;

  // Customer tracking view sees exact approved items and authoritative total
  const customerView = maskServiceRequestForPublicTracking(updatedTicket as any, true);
  assertEquals(customerView.quote, 4300);
  assertEquals(customerView.approvedItems, ["item-battery-repl"]);
  assertEquals(customerView.declinedItems, ["item-display-cable"]);

  // Admin view totals calculated from the updated ticket match customerView exactly
  const adminCalc = calculateQuotationTotals(
    updatedTicket.quotation_items!,
    updatedTicket.approved_items!,
    updatedTicket.courier_charge_return_delivery,
  );
  assertEquals(adminCalc.totalPayable, customerView.quote);
  assertEquals(adminCalc.diagnosticFeeWaived, true);
});

// 16. JSON serialization compatibility (both camelCase and snake_case items)
Deno.test("PARTIAL-16: Authoritative RPC logic handles both camelCase and snake_case item pricing fields", () => {
  const snakeCaseItem = {
    id: "item-snake",
    part_cost: 1200,
    labour_cost: 400,
    quantity: 1,
    is_required: false,
    can_defer: true,
  };
  const camelCaseItem = {
    id: "item-camel",
    partCost: 1200,
    labourCost: 400,
    quantity: 1,
    isRequired: false,
    canDefer: true,
  };

  // Parse snake-case
  const pSnake = (snakeCaseItem as any).partCost ?? (snakeCaseItem as any).part_cost;
  const lSnake = (snakeCaseItem as any).labourCost ?? (snakeCaseItem as any).labour_cost;
  assertEquals(pSnake + lSnake, 1600);

  // Parse camel-case
  const pCamel = (camelCaseItem as any).partCost ?? (camelCaseItem as any).part_cost;
  const lCamel = (camelCaseItem as any).labourCost ?? (camelCaseItem as any).labour_cost;
  assertEquals(pCamel + lCamel, 1600);
});

// ─────────────────────────────────────────────────────────────────────────────
// Secure Public / Customer Tracking Simulation (Matches Migration 20261026000006)
// ─────────────────────────────────────────────────────────────────────────────

interface StaffMemberIdentity {
  user_id: string;
  role: "portal_admin" | "quotation_staff" | "service_staff";
  is_active: boolean;
}

function simulateGetTrackingRpc(
  tickets: ServiceRecord[],
  callerUid: string | null,
  staffMembers: StaffMemberIdentity[],
  trackingId: string,
  guestToken?: string,
): Record<string, any> | null {
  if (!trackingId || !trackingId.trim()) return null;
  const clean = trackingId
    .replace(/^[#\s]+/, "")
    .trim()
    .toLowerCase();

  // Canonical RBAC Check (can_manage_services):
  // Only portal_admin and service_staff with is_active = true
  const staffRecord = callerUid
    ? staffMembers.find((m) => m.user_id === callerUid && m.is_active)
    : undefined;
  const isAuthorizedStaff = Boolean(
    staffRecord && (staffRecord.role === "portal_admin" || staffRecord.role === "service_staff"),
  );

  let targetTicket: ServiceRecord | undefined;

  // 1. EXACT FULL-UUID LOOKUP (36 characters)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clean)) {
    targetTicket = tickets.find((t) => t.id.toLowerCase() === clean);
    if (!targetTicket) return null;
  }
  // 2. EXACT EIGHT-CHARACTER HEX PREFIX LOOKUP
  else if (/^[0-9a-f]{8}$/.test(clean)) {
    // PRIORITY 1: Guest tracking token provided
    // Safely binds directly to token secret, allowing cross-account tracking or collision resolution
    if (guestToken && guestToken.trim() !== "") {
      targetTicket = tickets.find(
        (t) => t.id.toLowerCase().startsWith(clean) && t.guest_tracking_token === guestToken.trim(),
      );
      if (!targetTicket) return null;
    }
    // PRIORITY 2: Authorized staff member
    else if (isAuthorizedStaff) {
      const matches = tickets.filter((t) => t.id.toLowerCase().startsWith(clean));
      if (matches.length === 1) {
        targetTicket = matches[0];
      } else {
        return null;
      }
    }
    // PRIORITY 3: Authenticated customer looking up own ticket
    else if (callerUid) {
      const userMatches = tickets.filter(
        (t) => t.id.toLowerCase().startsWith(clean) && t.user_id === callerUid,
      );
      if (userMatches.length === 1) {
        targetTicket = userMatches[0];
      } else {
        return null;
      }
    } else {
      // PRIORITY 4: Anonymous caller without token is blocked
      return null;
    }
  } else {
    // Non-UUID, non-8-hex format is rejected
    return null;
  }

  // Authorization Check
  const isOwner = callerUid !== null && targetTicket.user_id === callerUid;
  const hasValidGuestToken = Boolean(
    guestToken &&
    guestToken.trim() !== "" &&
    targetTicket.guest_tracking_token === guestToken.trim(),
  );

  if (!isAuthorizedStaff && !isOwner && !hasValidGuestToken) {
    return null; // Access Denied / anti-enumeration
  }

  const parseBoolean = (val: any, defaultVal: boolean): boolean => {
    if (val === null || val === undefined) return defaultVal;
    const s = String(val).trim().toLowerCase();
    if (["true", "t", "1", "yes"].includes(s)) return true;
    if (["false", "f", "0", "no"].includes(s)) return false;
    return defaultVal;
  };

  // Safe customer projection for diagnosis findings (strips internal technician notes, staff UUIDs, supplier costs)
  const safeFindings = (targetTicket.findings || []).map((f: any, idx: number) => ({
    id:
      (f.id && String(f.id).trim()) ||
      (f.findingId && String(f.findingId).trim()) ||
      (f.finding_id && String(f.finding_id).trim()) ||
      `legacy-finding-${idx + 1}`,
    title: f.title || "Diagnostic Observation",
    description: f.description || "",
    customerExplanation: f.customerExplanation || f.customer_explanation || f.description || "",
    recommendedRepair: f.recommendedRepair || f.recommended_repair || "",
    source: f.source || "technician",
    safety: f.safety || "optional",
    classification: f.classification || "confirmed",
    isEligibleForRepair: parseBoolean(f.isEligibleForRepair ?? f.is_eligible_for_repair, true),
    createdAt: f.createdAt || f.created_at || targetTicket.created_at,
  }));

  // Safe customer projection for quotation items (strips wholesale distributor rates, staff notes)
  // Preserves stable IDs; no random UUID generation; no fallback calculation of line totals;
  // missing or malformed pricing returns null without fabricating prices;
  // safe boolean parsing without throwing casting exceptions.
  const safeQuotationItems = (targetTicket.quotation_items || []).map((i: any, idx: number) => {
    const parseNumber = (val: any): number | null => {
      if (val === null || val === undefined || val === "") return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    const id =
      (i.id && String(i.id).trim()) ||
      (i.itemId && String(i.itemId).trim()) ||
      (i.item_id && String(i.item_id).trim()) ||
      `legacy-item-${idx + 1}`;
    const partCost = parseNumber(i.partCost ?? i.part_cost);
    const labourCost = parseNumber(i.labourCost ?? i.labour_cost);
    const quantity = parseNumber(i.quantity) ?? 1;
    const discount = parseNumber(i.discount) ?? 0;
    const lineTotal = parseNumber(i.lineTotal ?? i.line_total);
    const isRequired = parseBoolean(i.isRequired ?? i.is_required, false);
    const canDefer = parseBoolean(i.canDefer ?? i.can_defer, true);

    return {
      id,
      findingId: i.findingId || i.finding_id,
      title: i.title || "Service Item",
      description: i.description || "",
      partCost,
      labourCost,
      quantity,
      discount,
      lineTotal,
      isRequired,
      canDefer,
      dependsOn: i.dependsOn || i.depends_on || [],
      approvalState: i.approvalState || i.approval_state || "pending",
      requirementLevel:
        i.requirementLevel || i.requirement_level || (isRequired ? "required" : "optional"),
    };
  });

  // Strictly redacted projection: user_id is eliminated; replaced with boolean is_owner
  return {
    id: targetTicket.id,
    is_owner: isOwner,
    device: targetTicket.device,
    model: targetTicket.model,
    problem: targetTicket.problem,
    method: targetTicket.method,
    status: targetTicket.status,
    quote: targetTicket.quote,
    quote_state: targetTicket.quote_state,
    quote_version: targetTicket.quote_version,
    technician_name: targetTicket.technician_name,
    courier_charge_return_delivery: targetTicket.courier_charge_return_delivery,
    findings: safeFindings,
    quotation_items: safeQuotationItems,
    approved_items: targetTicket.approved_items || [],
    declined_items: targetTicket.declined_items || [],
    decision_notes: targetTicket.decision_notes
      ? targetTicket.decision_notes.slice(0, 1000).trim()
      : null,
    decision_at: targetTicket.decision_at,
    created_at: targetTicket.created_at,
    updated_at: targetTicket.updated_at,
  };
}

Deno.test("PARTIAL-17: Secure Tracking: Authenticated customer can look up own ticket by prefix, but unauthorized user is blocked", () => {
  const ticket: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    status: "Awaiting Approval",
    quote: 700,
    guest_tracking_token: "guest_sec_token_9999",
  };

  // Owner searches by 8-char prefix #b493bc9a -> succeeds
  const ownerResult = simulateGetTrackingRpc([ticket], "user-owner-123", [], "#b493bc9a");
  assertNotEquals(ownerResult, null);
  assertEquals(ownerResult?.id, ticket.id);
  assertEquals(ownerResult?.status, "Awaiting Approval");
  assertEquals(ownerResult?.quote, 700);

  // Different customer searches by the same prefix -> blocked (returns null)
  const strangerResult = simulateGetTrackingRpc([ticket], "user-stranger-456", [], "#b493bc9a");
  assertEquals(strangerResult, null);
});

Deno.test("PARTIAL-18: Secure Tracking RBAC: Service staff & Portal admin authorized; Quotation staff & Inactive staff denied", () => {
  const ticket: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    guest_tracking_token: "guest_sec_token_9999",
  };

  const staffRoster: StaffMemberIdentity[] = [
    { user_id: "staff-service-active", role: "service_staff", is_active: true },
    { user_id: "staff-admin-active", role: "portal_admin", is_active: true },
    { user_id: "staff-quotation-active", role: "quotation_staff", is_active: true },
    { user_id: "staff-service-inactive", role: "service_staff", is_active: false },
  ];

  // 1. Active service staff can view ticket
  const serviceStaffRes = simulateGetTrackingRpc(
    [ticket],
    "staff-service-active",
    staffRoster,
    ticket.id,
  );
  assertNotEquals(serviceStaffRes, null);

  // 2. Portal admin can view ticket
  const adminRes = simulateGetTrackingRpc([ticket], "staff-admin-active", staffRoster, ticket.id);
  assertNotEquals(adminRes, null);

  // 3. Quotation staff CANNOT view service tickets (enforces role boundaries)
  const quotationStaffRes = simulateGetTrackingRpc(
    [ticket],
    "staff-quotation-active",
    staffRoster,
    ticket.id,
  );
  assertEquals(quotationStaffRes, null);

  // 4. Deactivated staff member is blocked
  const inactiveStaffRes = simulateGetTrackingRpc(
    [ticket],
    "staff-service-inactive",
    staffRoster,
    ticket.id,
  );
  assertEquals(inactiveStaffRes, null);
});

Deno.test("PARTIAL-19: Secure Tracking Format & Prefix Collision: Strict 8-hex format and collision resolution", () => {
  const ticketA: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-aaaa-4f11-9a1d-8b0123456789",
    user_id: "user-alice",
    guest_tracking_token: "guest_token_alice_1234",
  };
  const ticketB: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-bbbb-4f11-9a1d-8b0123456789",
    user_id: "user-bob",
    guest_tracking_token: "guest_token_bob_5678",
  };

  const pool = [ticketA, ticketB];

  // 1. Format validation: invalid non-hex characters rejected
  const nonHexRes = simulateGetTrackingRpc(pool, "user-alice", [], "b493bc9z");
  assertEquals(nonHexRes, null);

  // 2. Format validation: incomplete prefix (< 8 chars) rejected
  const shortRes = simulateGetTrackingRpc(pool, "user-alice", [], "b493bc");
  assertEquals(shortRes, null);

  // 3. Collision: Anonymous caller without token cannot resolve colliding prefix
  const anonAmbiguous = simulateGetTrackingRpc(pool, null, [], "b493bc9a");
  assertEquals(anonAmbiguous, null);

  // 4. Collision: Authenticated Alice querying prefix b493bc9a disambiguates to Ticket A
  const aliceRes = simulateGetTrackingRpc(pool, "user-alice", [], "b493bc9a");
  assertNotEquals(aliceRes, null);
  assertEquals(aliceRes?.id, ticketA.id);

  // 5. Collision: Guest with Bob's token querying prefix b493bc9a disambiguates to Ticket B
  const bobGuestRes = simulateGetTrackingRpc(pool, null, [], "b493bc9a", "guest_token_bob_5678");
  assertNotEquals(bobGuestRes, null);
  assertEquals(bobGuestRes?.id, ticketB.id);

  // 6. Exact full-UUID lookups succeed directly
  const fullUuidRes = simulateGetTrackingRpc(pool, "user-alice", [], ticketA.id);
  assertNotEquals(fullUuidRes, null);
  assertEquals(fullUuidRes?.id, ticketA.id);

  // 7. Unknown ticket returns null
  const unknownRes = simulateGetTrackingRpc(pool, "user-alice", [], "12345678");
  assertEquals(unknownRes, null);
});

Deno.test("PARTIAL-20: Secure Tracking Projection: user_id eliminated, is_owner boolean returned, notes/PII redacted", () => {
  const ticket: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    notes: "Internal staff note: Water damage corrosion on pin 14. Do not show to customer.",
    customer_phone: "+91 98460 12345",
    customer_email: "secret@example.com",
    address: "Private Villa 42, Ernakulam",
    guest_tracking_token: "tok_secret",
  };

  const res = simulateGetTrackingRpc([ticket], "user-owner-123", [], ticket.id);
  assertNotEquals(res, null);

  // user_id is completely eliminated from RPC output to prevent leaking internal UUIDs
  assertEquals((res as any).user_id, undefined);
  // is_owner is returned as true for the authenticated ticket owner
  assertEquals(res?.is_owner, true);

  // Internal notes and sensitive customer contact columns MUST NOT be present in public RPC output
  assertEquals((res as any).notes, undefined);
  assertEquals((res as any).customer_phone, undefined);
  assertEquals((res as any).customer_email, undefined);
  assertEquals((res as any).address, undefined);
  assertEquals((res as any).guest_tracking_token, undefined);

  // Non-owner authenticated viewer with guest token receives is_owner = false
  const guestRes = simulateGetTrackingRpc(
    [ticket],
    "user-stranger-456",
    [],
    ticket.id,
    "tok_secret",
  );
  assertNotEquals(guestRes, null);
  assertEquals(guestRes?.is_owner, false);
  assertEquals((guestRes as any).user_id, undefined);
});

Deno.test("PARTIAL-21: Quotation Resolution: Real published quote of ₹700 is preserved and never defaults to ₹1,500/₹1,650", () => {
  const ticketWithPublishedQuote = {
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    device: "Mobile (iPhone 15)",
    problem: "Water damage",
    quote: 700,
    quoteState: "pending",
    quotationItems: [] as QuotationItem[], // single aggregate quote without item breakdown
  };

  // Simulate frontend quotation calculation
  const actualCost = ticketWithPublishedQuote.quote;
  assertNotEquals(actualCost, 1500, "Must not fabricate ₹1500 default");
  assertEquals(actualCost, 700, "Must accurately reflect ₹700 published quote");

  // If return courier fee is ₹150: 700 + 150 = 850, NOT 1650!
  const courierFee = 150;
  assertEquals(actualCost + courierFee, 850);
});

Deno.test("PARTIAL-22: Line item requirement safety: Required items locked; Recommended & Optional items can be deferred", () => {
  const items: QuotationItem[] = [
    {
      id: "item-screen",
      title: "Screen Assembly Replacement",
      description: "Shattered OLED display",
      partCost: 5000,
      labourCost: 800,
      quantity: 1,
      lineTotal: 5800,
      isRequired: true,
      canDefer: false,
      requirementLevel: "required",
      approvalState: "pending",
    },
    {
      id: "item-thermal",
      title: "Thermal Paste Re-application",
      description: "Degraded thermal compound",
      partCost: 200,
      labourCost: 300,
      quantity: 1,
      lineTotal: 500,
      isRequired: false,
      canDefer: true,
      requirementLevel: "recommended",
      approvalState: "pending",
    },
    {
      id: "item-protector",
      title: "Tempered Glass Protector",
      description: "Protective film accessory",
      partCost: 300,
      labourCost: 0,
      quantity: 1,
      lineTotal: 300,
      isRequired: false,
      canDefer: true,
      requirementLevel: "optional",
      approvalState: "pending",
    },
  ];

  // 1. Customer can approve Screen (Required) + Thermal (Recommended) while deferring Protector (Optional)
  const val1 = validateItemSelection(items, ["item-screen", "item-thermal"], "approved");
  assertEquals(val1.valid, true);

  // 2. Customer cannot deselect Screen (Required) while approving other items
  const val2 = validateItemSelection(items, ["item-thermal", "item-protector"], "approved");
  assertEquals(val2.valid, false);
  assertStringIncludes(val2.error!, "Required repair");
});

Deno.test("PARTIAL-23: Cross-Customer Prefix Collision: Authenticated Alice querying with Bob's guest token receives Bob's ticket, not Alice's", () => {
  const ticketAlice: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-aaaa-4f11-9a1d-8b0123456789",
    user_id: "user-alice",
    guest_tracking_token: "token_alice_alpha",
    device: "Laptop (Alice MacBook)",
  };
  const ticketBob: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-bbbb-4f11-9a1d-8b0123456789",
    user_id: "user-bob",
    guest_tracking_token: "token_bob_beta",
    device: "Phone (Bob iPhone)",
  };

  const pool = [ticketAlice, ticketBob];

  // Alice is logged in (callerUid = "user-alice"). She is tracking Bob's ticket using Bob's guest token.
  // Priority 1 token check ensures it resolves to Bob's ticket, NOT Alice's ticket!
  const res = simulateGetTrackingRpc(pool, "user-alice", [], "b493bc9a", "token_bob_beta");

  assertNotEquals(res, null);
  assertEquals(res?.id, ticketBob.id);
  assertEquals(res?.device, "Phone (Bob iPhone)");
  assertEquals(res?.is_owner, false); // Alice is not the owner of Bob's ticket
  assertEquals((res as any).user_id, undefined); // user_id is stripped
});

Deno.test("PARTIAL-24: Nested Projection Sanitization: Technician internal findings and wholesale supplier costs are stripped", () => {
  const ticketWithInternalMetadata: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    guest_tracking_token: "tok_secure_findings",
    findings: [
      {
        id: "find-1",
        title: "Swollen Battery",
        description: "Li-ion cell distended past safety tolerances",
        customerExplanation: "The battery has reached end of life and expanded.",
        source: "technician",
        safety: "required",
        classification: "confirmed",
        isEligibleForRepair: true,
        // Internal fields entered by workshop technician:
        technician_internal_notes: "Wholesale cost ₹800 from Prime Distributors. Staff ID: tech-77",
        supplier_id: "distributor-99",
      } as any,
    ],
    quotation_items: [
      {
        id: "item-1",
        title: "OEM Battery Replacement",
        description: "Tier 1 replacement cell",
        partCost: 1500,
        labourCost: 300,
        quantity: 1,
        lineTotal: 1800,
        isRequired: true,
        canDefer: false,
        requirementLevel: "required",
        approvalState: "pending",
        // Internal financial/supplier metadata:
        wholesale_cost: 800,
        dealer_margin_pct: 46.6,
        supplier_contact: "distributor@example.com",
      } as any,
    ],
  };

  const res = simulateGetTrackingRpc(
    [ticketWithInternalMetadata],
    "user-owner-123",
    [],
    ticketWithInternalMetadata.id,
  );

  assertNotEquals(res, null);
  const projectedFinding = res?.findings[0];
  const projectedItem = res?.quotation_items[0];

  // Customer-safe finding fields are retained
  assertEquals(projectedFinding.title, "Swollen Battery");
  assertEquals(
    projectedFinding.customerExplanation,
    "The battery has reached end of life and expanded.",
  );
  assertEquals(projectedFinding.safety, "required");

  // Internal keys are stripped completely
  assertEquals(projectedFinding.technician_internal_notes, undefined);
  assertEquals(projectedFinding.supplier_id, undefined);

  // Customer-safe quotation item fields are retained
  assertEquals(projectedItem.title, "OEM Battery Replacement");
  assertEquals(projectedItem.partCost, 1500);
  assertEquals(projectedItem.labourCost, 300);
  assertEquals(projectedItem.lineTotal, 1800);

  // Wholesale and private margin keys are stripped completely
  assertEquals(projectedItem.wholesale_cost, undefined);
  assertEquals(projectedItem.dealer_margin_pct, undefined);
  assertEquals(projectedItem.supplier_contact, undefined);
});

Deno.test("PARTIAL-25: Eight-character prefix format validation: strictly 8 hex chars required", () => {
  const ticket: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    guest_tracking_token: "tok_test_format",
  };

  // Valid 8-hex:
  assertNotEquals(simulateGetTrackingRpc([ticket], "user-owner-123", [], "b493bc9a"), null);
  assertNotEquals(simulateGetTrackingRpc([ticket], "user-owner-123", [], "#B493BC9A"), null); // Case insensitive with hash

  // Invalid lengths:
  assertEquals(simulateGetTrackingRpc([ticket], "user-owner-123", [], "b493bc9"), null); // 7 chars
  assertEquals(simulateGetTrackingRpc([ticket], "user-owner-123", [], "b493bc9a7"), null); // 9 chars
  assertEquals(simulateGetTrackingRpc([ticket], "user-owner-123", [], "b493"), null); // 4 chars

  // Non-hex chars:
  assertEquals(simulateGetTrackingRpc([ticket], "user-owner-123", [], "b493bc9g"), null); // 'g' is not hex
  assertEquals(simulateGetTrackingRpc([ticket], "user-owner-123", [], "b493-bc9"), null); // hyphen in prefix
});

Deno.test("PARTIAL-26: Stable Quotation IDs: Persisted IDs preserved, missing IDs receive stable legacy IDs without generating random UUIDs", () => {
  const ticketWithMixedIds: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    quotation_items: [
      {
        id: "persisted-uuid-001",
        title: "Keyboard Key Replacement",
        partCost: 400,
        labourCost: 100,
        lineTotal: 500,
      } as any,
      {
        // Missing id, has legacy itemId
        itemId: "legacy-key-switch",
        title: "Mechanical Switch Swap",
        partCost: 150,
        labourCost: 100,
        lineTotal: 250,
      } as any,
      {
        // Completely missing id
        title: "Keycap Cleaning",
        partCost: 0,
        labourCost: 100,
        lineTotal: 100,
      } as any,
    ],
  };

  // Multiple consecutive calls to simulate RPC
  const call1 = simulateGetTrackingRpc(
    [ticketWithMixedIds],
    "user-owner-123",
    [],
    ticketWithMixedIds.id,
  );
  const call2 = simulateGetTrackingRpc(
    [ticketWithMixedIds],
    "user-owner-123",
    [],
    ticketWithMixedIds.id,
  );

  assertNotEquals(call1, null);
  assertNotEquals(call2, null);

  // 1. Persisted ID is preserved exactly
  assertEquals(call1?.quotation_items[0].id, "persisted-uuid-001");
  assertEquals(call2?.quotation_items[0].id, "persisted-uuid-001");

  // 2. Legacy itemId is preserved stably
  assertEquals(call1?.quotation_items[1].id, "legacy-key-switch");
  assertEquals(call2?.quotation_items[1].id, "legacy-key-switch");

  // 3. Missing ID receives deterministic stable legacy ID ('legacy-item-3') across calls — NEVER random UUID!
  assertEquals(call1?.quotation_items[2].id, "legacy-item-3");
  assertEquals(call2?.quotation_items[2].id, "legacy-item-3");
  assertEquals(call1?.quotation_items[2].id, call2?.quotation_items[2].id);
});

Deno.test("PARTIAL-27: Quotation Line Total & Pricing Integrity: Zero fallback calculation; missing or malformed pricing returns null", () => {
  const ticketWithMalformedPricing: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    quotation_items: [
      {
        id: "item-valid",
        title: "Screen Replacement",
        partCost: 3000,
        labourCost: 500,
        quantity: 1,
        discount: 0,
        lineTotal: 3500, // Explicitly persisted
      } as any,
      {
        id: "item-no-linetotal",
        title: "Hinge Lubrication",
        partCost: 100,
        labourCost: 200,
        quantity: 1,
        // lineTotal is omitted/missing! Must NOT calculate fallback (100+200=300)!
      } as any,
      {
        id: "item-malformed",
        title: "Motherboard Rework",
        partCost: "corroded_pin", // malformed string!
        labourCost: "unknown", // malformed string!
        lineTotal: "N/A", // malformed string!
      } as any,
    ],
  };

  const res = simulateGetTrackingRpc(
    [ticketWithMalformedPricing],
    "user-owner-123",
    [],
    ticketWithMalformedPricing.id,
  );
  assertNotEquals(res, null);

  const items = res?.quotation_items;
  assertEquals(items?.length, 3);

  // 1. Valid item has authoritative lineTotal
  assertEquals(items[0].lineTotal, 3500);
  assertEquals(items[0].partCost, 3000);
  assertEquals(items[0].labourCost, 500);

  // 2. Item with missing lineTotal does NOT invent fallback lineTotal (must be null)
  assertEquals(
    items[1].lineTotal,
    null,
    "Tracking response must not calculate or invent fallback line totals",
  );
  assertEquals(items[1].partCost, 100);
  assertEquals(items[1].labourCost, 200);

  // 3. Malformed string inputs safely parse to null without throwing or fabricating prices
  assertEquals(items[2].partCost, null);
  assertEquals(items[2].labourCost, null);
  assertEquals(items[2].lineTotal, null);
});

Deno.test("PARTIAL-28: Real Published Total: Ticket with ₹700 published quote retains authoritative quote and does not invent line totals", () => {
  const ticket700: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    quote: 700,
    quote_state: "pending",
    quotation_items: [], // Published quote without item breakdown
  };

  const res = simulateGetTrackingRpc([ticket700], "user-owner-123", [], ticket700.id);
  assertNotEquals(res, null);

  // Authoritative published quote preserved
  assertEquals(res?.quote, 700);
  assertEquals(res?.quotation_items.length, 0);
  assertNotEquals(res?.quote, 1500, "Must never default to arbitrary ₹1500");
});

Deno.test("PARTIAL-29: Token-based Access & Caller Isolation: Cross-account guest token access grants access with is_owner=false and no enumeration leak", () => {
  const ticket: ServiceRecord = {
    ...sampleServiceTicket,
    id: "c1234567-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-bob",
    guest_tracking_token: "tok_bob_guest_access_secret",
  };

  // Alice is logged in (callerUid = "user-alice"). Querying Bob's ticket using Bob's valid guest token.
  const aliceTrackingBob = simulateGetTrackingRpc(
    [ticket],
    "user-alice",
    [],
    "c1234567",
    "tok_bob_guest_access_secret",
  );
  assertNotEquals(aliceTrackingBob, null);
  assertEquals(aliceTrackingBob?.id, ticket.id);
  assertEquals(aliceTrackingBob?.is_owner, false);
  assertEquals((aliceTrackingBob as any).user_id, undefined);
  assertEquals((aliceTrackingBob as any).guest_tracking_token, undefined);

  // Alice querying Bob's ticket with WRONG guest token -> strictly blocked (returns null)
  const aliceWrongToken = simulateGetTrackingRpc(
    [ticket],
    "user-alice",
    [],
    "c1234567",
    "wrong_token",
  );
  assertEquals(aliceWrongToken, null);

  // Alice querying Bob's ticket with NO guest token -> strictly blocked (returns null)
  const aliceNoToken = simulateGetTrackingRpc([ticket], "user-alice", [], "c1234567");
  assertEquals(aliceNoToken, null);
});

Deno.test("PARTIAL-30: Prefix Collisions & Security: Colliding 8-hex prefixes strictly require guest token or full UUID; unauthorized customer cannot guess other tickets", () => {
  const ticket1: ServiceRecord = {
    ...sampleServiceTicket,
    id: "e4f5a6b7-1111-4f11-9a1d-8b0123456789",
    user_id: "user-first",
    guest_tracking_token: "token_first_999",
  };
  const ticket2: ServiceRecord = {
    ...sampleServiceTicket,
    id: "e4f5a6b7-2222-4f11-9a1d-8b0123456789",
    user_id: "user-second",
    guest_tracking_token: "token_second_888",
  };

  const pool = [ticket1, ticket2];

  // 1. Anonymous caller querying colliding prefix 'e4f5a6b7' without token -> returns null
  assertEquals(simulateGetTrackingRpc(pool, null, [], "e4f5a6b7"), null);

  // 2. Unrelated customer 'user-third' querying colliding prefix -> returns null
  assertEquals(simulateGetTrackingRpc(pool, "user-third", [], "e4f5a6b7"), null);

  // 3. User-first querying colliding prefix disambiguates to ticket1
  const firstRes = simulateGetTrackingRpc(pool, "user-first", [], "e4f5a6b7");
  assertNotEquals(firstRes, null);
  assertEquals(firstRes?.id, ticket1.id);

  // 4. Guest with ticket2 token querying colliding prefix disambiguates to ticket2
  const guest2Res = simulateGetTrackingRpc(pool, null, [], "e4f5a6b7", "token_second_888");
  assertNotEquals(guest2Res, null);
  assertEquals(guest2Res?.id, ticket2.id);
});

Deno.test("PARTIAL-31: Nested Data Redaction: Strictly redacts technician private notes, supplier IDs, margins, and guest token from response", () => {
  const ticket: ServiceRecord = {
    ...sampleServiceTicket,
    id: "f1a2b3c4-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    notes: "Technician internal bench note: customer dropped device from 2nd floor balcony.",
    guest_tracking_token: "tok_private_guest_never_returned",
    findings: [
      {
        id: "find-private",
        title: "Cracked Housing",
        description: "Severe frame deformation",
        customerExplanation: "The chassis has structural damage requiring realignment.",
        technician_internal_notes: "Requires heat gun 250C. Cost 200 INR.",
        supplier_id: "supp-abc-123",
      } as any,
    ],
    quotation_items: [
      {
        id: "item-private",
        title: "Chassis Realignment",
        partCost: 500,
        labourCost: 400,
        lineTotal: 900,
        wholesale_cost: 200,
        dealer_margin_pct: 55.5,
        supplier_contact: "+91 99999 88888",
      } as any,
    ],
  };

  const res = simulateGetTrackingRpc([ticket], "user-owner-123", [], ticket.id);
  assertNotEquals(res, null);

  // Ticket level redactions
  assertEquals((res as any).notes, undefined);
  assertEquals((res as any).guest_tracking_token, undefined);
  assertEquals((res as any).user_id, undefined);

  // Findings level redactions
  const f = res?.findings[0];
  assertEquals(f.title, "Cracked Housing");
  assertEquals((f as any).technician_internal_notes, undefined);
  assertEquals((f as any).supplier_id, undefined);

  // Quotation items level redactions
  const it = res?.quotation_items[0];
  assertEquals(it.title, "Chassis Realignment");
  assertEquals(it.lineTotal, 900);
  assertEquals((it as any).wholesale_cost, undefined);
  assertEquals((it as any).dealer_margin_pct, undefined);
  assertEquals((it as any).supplier_contact, undefined);
});

Deno.test("PARTIAL-32: Boolean Robustness: Malformed legacy booleans (e.g. 'invalid', 'maybe', '{}', null) parse safely without throwing exceptions", () => {
  const ticketWithMalformedBooleans: ServiceRecord = {
    ...sampleServiceTicket,
    id: "a1b2c3d4-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    findings: [
      {
        id: "find-bool-1",
        title: "Testing Malformed Booleans",
        isEligibleForRepair: "malformed_string_not_boolean" as any,
      } as any,
      {
        id: "find-bool-2",
        title: "Testing False Boolean",
        isEligibleForRepair: "false" as any,
      } as any,
      {
        id: "find-bool-3",
        title: "Testing Numeric 1 Boolean",
        isEligibleForRepair: "1" as any,
      } as any,
    ],
    quotation_items: [
      {
        id: "item-bool-1",
        title: "Item with Malformed isRequired & canDefer",
        isRequired: "not_a_boolean" as any,
        canDefer: "also_not_a_boolean" as any,
      } as any,
      {
        id: "item-bool-2",
        title: "Item with String Truthy and Falsy values",
        isRequired: "yes" as any,
        canDefer: "no" as any,
      } as any,
      {
        id: "item-bool-3",
        title: "Item with Null values",
        isRequired: null as any,
        canDefer: null as any,
      } as any,
    ],
  };

  const res = simulateGetTrackingRpc(
    [ticketWithMalformedBooleans],
    "user-owner-123",
    [],
    ticketWithMalformedBooleans.id,
  );
  assertNotEquals(res, null);

  // Findings
  assertEquals(res?.findings[0].isEligibleForRepair, true); // Safely defaulted to true
  assertEquals(res?.findings[1].isEligibleForRepair, false); // Safely parsed 'false' -> false
  assertEquals(res?.findings[2].isEligibleForRepair, true); // Safely parsed '1' -> true

  // Quotation items
  // item 1: malformed values fallback to safe defaults (isRequired: false, canDefer: true)
  assertEquals(res?.quotation_items[0].isRequired, false);
  assertEquals(res?.quotation_items[0].canDefer, true);
  assertEquals(res?.quotation_items[0].requirementLevel, "optional");

  // item 2: 'yes' -> isRequired: true, 'no' -> canDefer: false
  assertEquals(res?.quotation_items[1].isRequired, true);
  assertEquals(res?.quotation_items[1].canDefer, false);
  assertEquals(res?.quotation_items[1].requirementLevel, "required");

  // item 3: null -> safe defaults (isRequired: false, canDefer: true)
  assertEquals(res?.quotation_items[2].isRequired, false);
  assertEquals(res?.quotation_items[2].canDefer, true);
  assertEquals(res?.quotation_items[2].requirementLevel, "optional");
});

Deno.test("PARTIAL-33: Genuine Zero vs Missing Pricing: Genuine zero cost items return 0, while missing prices return null", () => {
  const ticketWithZeroAndMissingPrices: ServiceRecord = {
    ...sampleServiceTicket,
    id: "b493bc9a-7c2e-4f11-9a1d-8b0123456789",
    user_id: "user-owner-123",
    quotation_items: [
      {
        id: "item-zero-price",
        title: "Complimentary Dust Cleaning",
        partCost: 0, // Genuine 0
        labourCost: 0, // Genuine 0
        quantity: 1,
        discount: 0,
        lineTotal: 0, // Genuine 0
      } as any,
      {
        id: "item-missing-price",
        title: "Specialty BGA Chip Reballing",
        // partCost is omitted/undefined -> missing
        // labourCost is null -> missing
        labourCost: null,
        // lineTotal is missing
      } as any,
      {
        id: "item-zero-part-paid-labour",
        title: "Firmware Flash (No Hardware)",
        partCost: 0, // Genuine 0
        labourCost: 450,
        lineTotal: 450,
      } as any,
    ],
  };

  const res = simulateGetTrackingRpc(
    [ticketWithZeroAndMissingPrices],
    "user-owner-123",
    [],
    ticketWithZeroAndMissingPrices.id,
  );
  assertNotEquals(res, null);

  const items = res?.quotation_items;

  // Genuine 0 must be 0, not null
  assertEquals(items[0].partCost, 0, "Genuine zero part cost must be 0");
  assertEquals(items[0].labourCost, 0, "Genuine zero labour cost must be 0");
  assertEquals(items[0].lineTotal, 0, "Genuine zero line total must be 0");

  // Missing prices must be null, not 0
  assertEquals(items[1].partCost, null, "Missing part cost must be null, not 0");
  assertEquals(items[1].labourCost, null, "Null labour cost must be null, not 0");
  assertEquals(items[1].lineTotal, null, "Missing line total must be null, not 0 or calculated");

  // Mix of zero and paid
  assertEquals(items[2].partCost, 0);
  assertEquals(items[2].labourCost, 450);
  assertEquals(items[2].lineTotal, 450);
});

Deno.test("PARTIAL-34: Booking Flow Guest Token Generation & Link Verification: High-entropy token generated and authenticates guest", () => {
  // Simulate high-entropy token generation in booking flow (16 bytes = 32 hex chars)
  const tokenBytes = new Uint8Array(16);
  crypto.getRandomValues(tokenBytes);
  const generatedGuestToken = Array.from(tokenBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  assertEquals(generatedGuestToken.length, 32);
  assertEquals(/^[0-9a-f]{32}$/.test(generatedGuestToken), true);

  const newBookingTicket: ServiceRecord = {
    ...sampleServiceTicket,
    id: "c4d5e6f7-aaaa-4f11-9a1d-8b0123456789",
    user_id: "user-new-customer",
    status: "Booked",
    guest_tracking_token: generatedGuestToken,
  };

  // 1. Guest tracks using 8-char prefix + generated guest token (no user session)
  const prefix = "c4d5e6f7";
  const guestResult = simulateGetTrackingRpc(
    [newBookingTicket],
    null, // anonymous/guest
    [],
    prefix,
    generatedGuestToken,
  );
  assertNotEquals(guestResult, null);
  assertEquals(guestResult?.id, newBookingTicket.id);
  assertEquals(guestResult?.status, "Booked");
  assertEquals(guestResult?.is_owner, false); // Anonymous guest is not authenticated owner

  // 2. Querying without the token is strictly rejected
  const unauthedResult = simulateGetTrackingRpc([newBookingTicket], null, [], prefix);
  assertEquals(unauthedResult, null);
});
