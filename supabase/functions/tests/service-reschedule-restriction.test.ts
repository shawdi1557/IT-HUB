// supabase/functions/tests/service-reschedule-restriction.test.ts
// Automated Tests: Restrict Customer Reschedule Requests to On-site Technician Visits (TDD)
// IT HUB — Kerala, India

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  isRescheduleEligible,
  shouldDisplayReschedulePanel,
  getStatusOptionsForMethod,
  validateRescheduleApproval,
  SERVICE_INTAKE_METHODS,
} from "../../../src/lib/serviceReschedule.ts";

interface MockServiceTicket {
  id: string;
  method: string;
  status: string;
  reschedule_details?:
    | {
        requestedDate?: string;
        requestedSlot?: string;
        reason?: string;
      }
    | Record<string, unknown>
    | null;
  preferred_date?: string | null;
  preferred_slot?: string | null;
}

function createTicket(overrides: Partial<MockServiceTicket> = {}): MockServiceTicket {
  return {
    id: "SRV-TEST-001",
    method: "On-site Technician Visit",
    status: "Booked",
    reschedule_details: {},
    preferred_date: "2026-11-05",
    preferred_slot: "10:00 – 12:00",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Identification and Verification of the Four Service Methods
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("METHOD-1: Identifies the four supported service intake methods", () => {
  assertEquals(SERVICE_INTAKE_METHODS.ONSITE, "On-site Technician Visit");
  assertEquals(SERVICE_INTAKE_METHODS.COURIER, "Courier to IT HUB");
  assertEquals(SERVICE_INTAKE_METHODS.WALK_IN_DIRECT, "Direct Store Walk-In");
  assertEquals(SERVICE_INTAKE_METHODS.WALK_IN_VISIT, "Visit IT HUB");
});

Deno.test("METHOD-2: isRescheduleEligible enables ONLY On-site Technician Visits", () => {
  // Method 1: On-site Technician Visit (and canonical variants) -> ENABLED
  assertEquals(isRescheduleEligible("On-site Technician Visit"), true);
  assertEquals(isRescheduleEligible("On-site service"), true);
  assertEquals(isRescheduleEligible("Doorstep Technician Visit"), true);
  assertEquals(isRescheduleEligible("doorstep visit"), true);

  // Method 2: Courier to IT HUB (and canonical variants) -> HIDDEN / DISABLED
  assertEquals(isRescheduleEligible("Courier to IT HUB"), false);
  assertEquals(isRescheduleEligible("Insured Courier Pickup & Return"), false);
  assertEquals(isRescheduleEligible("courier"), false);

  // Method 3: Direct Store Walk-In -> HIDDEN / DISABLED
  assertEquals(isRescheduleEligible("Direct Store Walk-In"), false);

  // Method 4: Visit IT HUB -> HIDDEN / DISABLED
  assertEquals(isRescheduleEligible("Visit IT HUB"), false);

  // Edge cases: null, undefined, empty, unknown
  assertEquals(isRescheduleEligible(null), false);
  assertEquals(isRescheduleEligible(undefined), false);
  assertEquals(isRescheduleEligible(""), false);
  assertEquals(isRescheduleEligible("Remote Support"), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Ticket Details Modal Conditional Rendering (shouldDisplayReschedulePanel)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("MODAL-1: On-site Technician Visit with reschedule request displays the panel", () => {
  // Status is "Reschedule Requested"
  const ticket1 = createTicket({
    method: "On-site Technician Visit",
    status: "Reschedule Requested",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "14:00 – 16:00",
      reason: "Available only after 2 PM",
    },
  });
  assertEquals(shouldDisplayReschedulePanel(ticket1), true);

  // Canonical "On-site service" method
  const ticket2 = createTicket({
    method: "On-site service",
    status: "Reschedule Requested",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "14:00 – 16:00",
    },
  });
  assertEquals(shouldDisplayReschedulePanel(ticket2), true);

  // Canonical "Doorstep Technician Visit" method
  const ticket3 = createTicket({
    method: "Doorstep Technician Visit",
    status: "Technician Assigned",
    reschedule_details: {
      requestedDate: "2026-11-12",
      requestedSlot: "16:00 – 18:00",
    },
  });
  assertEquals(shouldDisplayReschedulePanel(ticket3), true);
});

Deno.test("MODAL-2: Courier to IT HUB tickets NEVER display the reschedule panel", () => {
  // Courier ticket even with status "Reschedule Requested"
  const courierTicket1 = createTicket({
    method: "Courier to IT HUB",
    status: "Reschedule Requested",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "10:00 – 12:00",
    },
  });
  assertEquals(shouldDisplayReschedulePanel(courierTicket1), false);

  // Courier ticket with empty reschedule_details default {}
  const courierTicket2 = createTicket({
    method: "Courier to IT HUB",
    status: "Device Received",
    reschedule_details: {},
  });
  assertEquals(shouldDisplayReschedulePanel(courierTicket2), false);

  // Insured Courier variant
  const courierTicket3 = createTicket({
    method: "Insured Courier Pickup & Return",
    status: "Booked",
    reschedule_details: { reason: "Need pickup later" },
  });
  assertEquals(shouldDisplayReschedulePanel(courierTicket3), false);
});

Deno.test("MODAL-3: Direct Store Walk-In tickets NEVER display the reschedule panel", () => {
  const walkInTicket = createTicket({
    method: "Direct Store Walk-In",
    status: "Reschedule Requested",
    reschedule_details: {
      requestedDate: "2026-11-08",
      requestedSlot: "12:00 – 14:00",
    },
  });
  assertEquals(shouldDisplayReschedulePanel(walkInTicket), false);
});

Deno.test("MODAL-4: Visit IT HUB tickets NEVER display the reschedule panel", () => {
  const visitTicket = createTicket({
    method: "Visit IT HUB",
    status: "Booked",
    reschedule_details: {
      requestedDate: "2026-11-08",
    },
  });
  assertEquals(shouldDisplayReschedulePanel(visitTicket), false);
});

Deno.test("MODAL-5: On-site tickets without reschedule requests do NOT display the panel", () => {
  // Standard booked ticket with default empty reschedule_details {}
  const standardTicket = createTicket({
    method: "On-site Technician Visit",
    status: "Booked",
    reschedule_details: {},
  });
  assertEquals(shouldDisplayReschedulePanel(standardTicket), false);

  // Ticket with null reschedule_details
  const nullDetailsTicket = createTicket({
    method: "On-site Technician Visit",
    status: "Technician Assigned",
    reschedule_details: null,
  });
  assertEquals(shouldDisplayReschedulePanel(nullDetailsTicket), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Backend & Approval Security Validation
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SEC-1: validateRescheduleApproval strictly rejects non-on-site service methods", () => {
  // Courier rejection
  const courierCheck = validateRescheduleApproval({
    method: "Courier to IT HUB",
    status: "Reschedule Requested",
  });
  assertEquals(courierCheck.valid, false);
  assertStringIncludes(courierCheck.error || "", "On-site Technician Visit");

  // Direct Store Walk-In rejection
  const walkInCheck = validateRescheduleApproval({
    method: "Direct Store Walk-In",
    status: "Reschedule Requested",
  });
  assertEquals(walkInCheck.valid, false);
  assertStringIncludes(walkInCheck.error || "", "On-site Technician Visit");

  // Visit IT HUB rejection
  const visitCheck = validateRescheduleApproval({
    method: "Visit IT HUB",
    status: "Booked",
  });
  assertEquals(visitCheck.valid, false);

  // Missing method rejection
  const missingCheck = validateRescheduleApproval({
    method: "",
    status: "Reschedule Requested",
  });
  assertEquals(missingCheck.valid, false);
});

Deno.test("SEC-2: validateRescheduleApproval succeeds for On-site Technician Visits", () => {
  const onsiteCheck1 = validateRescheduleApproval({
    method: "On-site Technician Visit",
    status: "Reschedule Requested",
  });
  assertEquals(onsiteCheck1.valid, true);

  const onsiteCheck2 = validateRescheduleApproval({
    method: "On-site service",
    status: "Technician Assigned",
  });
  assertEquals(onsiteCheck2.valid, true);

  const onsiteCheck3 = validateRescheduleApproval({
    method: "Doorstep Technician Visit",
    status: "Booked",
  });
  assertEquals(onsiteCheck3.valid, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Method Status Pipelines (Staff Queue Status Options)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("STATUS-1: Reschedule statuses are available ONLY in On-site method pipeline", () => {
  // On-site options MUST include Reschedule statuses
  const onsiteOptions = getStatusOptionsForMethod("On-site Technician Visit");
  assertEquals(onsiteOptions.includes("Reschedule Requested"), true);
  assertEquals(onsiteOptions.includes("Rescheduled"), true);

  // Courier options MUST NOT include Reschedule statuses
  const courierOptions = getStatusOptionsForMethod("Courier to IT HUB");
  assertEquals(courierOptions.includes("Reschedule Requested"), false);
  assertEquals(courierOptions.includes("Rescheduled"), false);

  // Walk-in options MUST NOT include Reschedule statuses
  const walkInOptions = getStatusOptionsForMethod("Direct Store Walk-In");
  assertEquals(walkInOptions.includes("Reschedule Requested"), false);
  assertEquals(walkInOptions.includes("Rescheduled"), false);

  const visitOptions = getStatusOptionsForMethod("Visit IT HUB");
  assertEquals(visitOptions.includes("Reschedule Requested"), false);
  assertEquals(visitOptions.includes("Rescheduled"), false);
});
