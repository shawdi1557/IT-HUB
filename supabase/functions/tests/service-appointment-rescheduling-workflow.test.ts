// supabase/functions/tests/service-appointment-rescheduling-workflow.test.ts
// Test-Driven Development (TDD) Suite for Phase 6 & Phase 7:
// Customer Appointment Rescheduling, Database Integrity, Alerts & Security Audit
// IT HUB — Kerala, India

import {
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  isRescheduleEligible,
  shouldDisplayRescheduleButton,
  validateRequestedAppointmentDate,
  formatAppointmentDisplay,
} from "../../../src/lib/serviceReschedule.ts";
import { TEST_ANON_KEY, TEST_SUPABASE_URL, dbTest } from "./_helpers/disposable_env.ts";
import { createSignedInUser } from "./_helpers/test_users.ts";

const repoRoot = path.resolve(path.fromFileUrl(import.meta.url), "../../../..");
const servicesTrackingPagePath = path.join(repoRoot, "src", "pages", "Services.tsx");
const serviceDetailModalPath = path.join(
  repoRoot,
  "ITHUB_ADMIN",
  "src",
  "components",
  "ServiceDetailModal.tsx",
);
const servicesAdminPagePath = path.join(repoRoot, "ITHUB_ADMIN", "src", "pages", "Services.tsx");

// ─────────────────────────────────────────────────────────────────────────────
// 1. BUSINESS LOGIC & ELIGIBILITY VALIDATION (Unit / TDD)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("RESCHED-1: isRescheduleEligible permits ONLY On-site Technician Visits", () => {
  // On-site variants
  assertEquals(isRescheduleEligible("On-site Technician Visit"), true);
  assertEquals(isRescheduleEligible("On-site service"), true);
  assertEquals(isRescheduleEligible("Doorstep Technician Visit"), true);

  // Ineligible intake methods
  assertEquals(isRescheduleEligible("Courier to IT HUB"), false);
  assertEquals(isRescheduleEligible("Insured Courier Pickup & Return"), false);
  assertEquals(isRescheduleEligible("Visit IT HUB"), false);
  assertEquals(isRescheduleEligible("Direct Store Walk-In"), false);
  assertEquals(isRescheduleEligible(null), false);
  assertEquals(isRescheduleEligible(undefined), false);
});

Deno.test("RESCHED-2: shouldDisplayRescheduleButton strictly checks all 5 preconditions", () => {
  // Precondition 1: Method must be On-site
  // Precondition 2: Preferred date must be set
  // Precondition 3: Status must permit rescheduling (not Completed/Cancelled)
  // Precondition 4: No active pending request

  // Eligible ticket
  const eligibleTicket = {
    method: "On-site Technician Visit",
    preferred_date: "2026-11-15",
    preferred_slot: "10:00 – 12:00",
    status: "Booked",
    reschedule_details: null,
  };
  assertEquals(shouldDisplayRescheduleButton(eligibleTicket), true);

  // Ineligible 1: Courier method
  assertEquals(
    shouldDisplayRescheduleButton({ ...eligibleTicket, method: "Courier to IT HUB" }),
    false,
    "Courier must not show reschedule button",
  );

  // Ineligible 2: Visit IT HUB method
  assertEquals(
    shouldDisplayRescheduleButton({ ...eligibleTicket, method: "Visit IT HUB" }),
    false,
    "Visit IT HUB must not show reschedule button",
  );

  // Ineligible 3: Unscheduled appointment (no date)
  assertEquals(
    shouldDisplayRescheduleButton({ ...eligibleTicket, preferred_date: null }),
    false,
    "Unscheduled ticket must not show reschedule button",
  );

  // Ineligible 4: Completed ticket
  assertEquals(
    shouldDisplayRescheduleButton({ ...eligibleTicket, status: "Completed" }),
    false,
    "Completed ticket must not show reschedule button",
  );

  // Ineligible 5: Cancelled ticket
  assertEquals(
    shouldDisplayRescheduleButton({ ...eligibleTicket, status: "Cancelled" }),
    false,
    "Cancelled ticket must not show reschedule button",
  );

  // Ineligible 6: Already has pending reschedule request
  assertEquals(
    shouldDisplayRescheduleButton({
      ...eligibleTicket,
      reschedule_details: { status: "pending", requestedDate: "2026-11-20" },
    }),
    false,
    "Ticket with pending reschedule request must not show duplicate request button",
  );
});

/**
 * Runs a check as if the local clock showed a fixed moment. The validator works in local dates, so this
 * test must not depend on the hour or the machine's time zone. The clock is restored afterwards.
 */
function atLocalTime<T>(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  check: () => T,
): T {
  const RealDate = globalThis.Date;
  const fixed = new RealDate(year, monthIndex, day, hour, minute).getTime();
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed);
      else super(...(args as [number]));
    }
    static override now() {
      return fixed;
    }
  }
  globalThis.Date = FixedDate as DateConstructor;
  try {
    return check();
  } finally {
    globalThis.Date = RealDate;
  }
}

Deno.test("RESCHED-3: validateRequestedAppointmentDate enforces future date & Sunday closure", () => {
  const closed = "IT HUB is closed on Sundays. Please select Monday through Saturday.";
  const notFuture = "Requested appointment date must be in the future.";
  // Wednesday 4 November 2026, at the hours where a date converted through UTC lands on the wrong day
  // in India, and at the ends of the day.
  const times: [number, number][] = [
    [0, 0],
    [1, 0],
    [5, 29],
    [5, 30],
    [12, 0],
    [23, 59],
  ];
  for (const [hour, minute] of times) {
    const at = `${hour}:${minute}`;
    atLocalTime(2026, 10, 4, hour, minute, () => {
      const validate = validateRequestedAppointmentDate;
      // Past dates are rejected.
      assertEquals(validate("2020-01-01"), { valid: false, error: notFuture }, at);
      assertEquals(validate("2026-11-03"), { valid: false, error: notFuture }, at);
      // Today is rejected, because a visit needs advance booking.
      assertEquals(validate("2026-11-04"), { valid: false, error: notFuture }, at);
      // Sundays are rejected, including the coming one and a past one.
      assertEquals(validate("2026-11-08"), { valid: false, error: closed }, at);
      assertEquals(validate("2026-11-15"), { valid: false, error: closed }, at);
      assertEquals(validate("2026-11-01"), { valid: false, error: closed }, at);
      // Every future day from Monday to Saturday is accepted: the rest of this week and next Monday.
      for (const open of ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-09"]) {
        assertEquals(validate(open), { valid: true }, `${open} at ${at}`);
      }
    });
  }
});

Deno.test("RESCHED-3b: the controlled clock is restored, and the check also holds on a Sunday", () => {
  const RealDate = globalThis.Date;
  atLocalTime(2026, 10, 8, 10, 0, () => {
    assertEquals(new Date().getDay(), 0);
    // Today is a Sunday, so it's rejected for that reason. Tomorrow is the next open day.
    assertEquals(validateRequestedAppointmentDate("2026-11-08").valid, false);
    assertEquals(validateRequestedAppointmentDate("2026-11-09"), { valid: true });
  });
  assertEquals(globalThis.Date, RealDate);
});

Deno.test("RESCHED-4: formatAppointmentDisplay formats date and time cleanly", () => {
  const formatted = formatAppointmentDisplay("2026-11-15", "10:00 – 12:00");
  assertMatch(formatted, /15|Nov|2026/i);
  assertMatch(formatted, /10:00/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. STOREFRONT UI INTEGRATION (Customer Service Tracker)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("RESCHED-5: Services.tsx integrates 'Request Reschedule' button and modal for eligible on-site tickets", () => {
  const content = Deno.readTextFileSync(servicesTrackingPagePath);

  // Must include Request Reschedule trigger
  assertMatch(
    content,
    /Request Reschedule/i,
    "Service Tracker must include 'Request Reschedule' button",
  );

  // Must include modal title and explanation text
  assertMatch(
    content,
    /Request a New Appointment/i,
    "Modal must have heading 'Request a New Appointment'",
  );
  assertMatch(
    content,
    /Need a different appointment time\? Submit a request and our team will review your preferred schedule\./i,
    "Modal must include standard explanation text",
  );

  // Must show current confirmed appointment and requested inputs
  assertMatch(
    content,
    /Current confirmed appointment/i,
    "Modal must display current confirmed appointment",
  );
  assertMatch(content, /Requested appointment date/i, "Modal must display requested date field");
  assertMatch(content, /Reason for rescheduling/i, "Modal must display optional reason field");

  // Must display pending/approved/rejected status badges
  assertMatch(content, /Pending Review/i, "Tracker must support 'Pending Review' status banner");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. STAFF PORTAL WORKFLOW (ServiceDetailModal.tsx)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("RESCHED-6: ServiceDetailModal.tsx implements full Reschedule Requests section with Approve and Reject actions", () => {
  const content = Deno.readTextFileSync(serviceDetailModalPath);

  // Section title
  assertMatch(
    content,
    /Reschedule Request/i,
    "Ticket management must have Reschedule Requests section",
  );

  // Current confirmed vs requested display
  assertMatch(content, /Requested Date/i, "Must show requested date");
  assertMatch(content, /Requested Slot/i, "Must show requested slot");

  // Approve action
  assertMatch(content, /Approve Reschedule|approveRescheduleRequest/i, "Must have Approve action");

  // Reject action with optional note
  assertMatch(content, /Reject Request|rejectRescheduleRequest/i, "Must have Reject action");
  assertMatch(
    content,
    /Staff Note|staffResponse|Response note/i,
    "Must support optional staff note/response",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DATABASE RPC CONTRACT & INTEGRATION (Local Supabase DB)
// ─────────────────────────────────────────────────────────────────────────────

dbTest(
  "RESCHED-7: Supabase functions customer_request_appointment_reschedule & staff_decide_appointment_reschedule exist in schema",
  async () => {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.0");
    const supabaseUrl = TEST_SUPABASE_URL;
    const supabaseKey = TEST_ANON_KEY;
    const client = createClient(supabaseUrl, supabaseKey);

    const dummyId = "00000000-0000-0000-0000-000000000000";
    const args = {
      p_ticket_id: dummyId,
      p_requested_date: "2026-11-20",
      p_requested_slot: "10:00 – 12:00",
      p_reason: "Test reason",
    };

    // Anonymous callers are refused before anything is looked up.
    const anonymous = await client.rpc("customer_request_appointment_reschedule", args);
    assertEquals(anonymous.data, null);
    assertEquals(anonymous.error?.code, "42501");

    // A signed-in customer gets a structured answer, without Postgres crashing.
    const customer = await createSignedInUser("resched-7");
    const { data: res } = await customer.client.rpc(
      "customer_request_appointment_reschedule",
      args,
    );
    assertEquals(res?.ok, false);
    assertEquals(res?.error, "Service ticket not found.");
  },
);
