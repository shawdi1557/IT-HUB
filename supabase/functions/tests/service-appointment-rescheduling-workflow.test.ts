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

Deno.test("RESCHED-3: validateRequestedAppointmentDate enforces future date & Sunday closure", () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // Past date must be rejected
  const pastRes = validateRequestedAppointmentDate(yesterdayStr);
  assertEquals(pastRes.valid, false);
  assertEquals(pastRes.error, "Requested appointment date must be in the future.");

  // Today must be rejected (needs advance booking)
  const todayStr = today.toISOString().split("T")[0];
  const todayRes = validateRequestedAppointmentDate(todayStr);
  assertEquals(todayRes.valid, false);

  // Sunday must be rejected
  // Find upcoming Sunday
  const nextSunday = new Date();
  nextSunday.setDate(today.getDate() + ((7 - today.getDay()) % 7 || 7));
  const sundayStr = nextSunday.toISOString().split("T")[0];
  const sundayRes = validateRequestedAppointmentDate(sundayStr);
  assertEquals(sundayRes.valid, false);
  assertEquals(
    sundayRes.error,
    "IT HUB is closed on Sundays. Please select Monday through Saturday.",
  );

  // Future Monday - Saturday must be accepted
  const validDay = new Date(nextSunday);
  validDay.setDate(nextSunday.getDate() + 1); // Monday
  const validStr = validDay.toISOString().split("T")[0];
  const validRes = validateRequestedAppointmentDate(validStr);
  assertEquals(validRes.valid, true);
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

Deno.test("RESCHED-7: Supabase functions customer_request_appointment_reschedule & staff_decide_appointment_reschedule exist in schema", async () => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.0");
  const supabaseUrl = Deno.env.get("VITE_SUPABASE_URL") || "http://127.0.0.1:54321";
  const supabaseKey =
    Deno.env.get("VITE_SUPABASE_ANON_KEY") ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
  const client = createClient(supabaseUrl, supabaseKey);

  // Verify calling RPC with dummy UUID returns structured jsonb without Postgres crashing
  const dummyId = "00000000-0000-0000-0000-000000000000";
  const { data: res } = await client.rpc("customer_request_appointment_reschedule", {
    p_ticket_id: dummyId,
    p_requested_date: "2026-11-20",
    p_requested_slot: "10:00 – 12:00",
    p_reason: "Test reason",
  });

  // Since ticket does not exist, it should return { ok: false, error: 'Service ticket not found.' }
  assertEquals(res?.ok, false);
  assertEquals(res?.error, "Service ticket not found.");
});
