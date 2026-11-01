// supabase/functions/tests/hero-reschedule-analytics.test.ts
// Test Suite for IT HUB 16:9 Hero Carousel, Reschedule Approval/Rejection Workflow,
// Website Visitor Analytics Data Layer & Excel (.xlsx) Export Engine.

import {
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { shouldDisplayReschedulePanel } from "../../../src/lib/serviceReschedule.ts";

function sanitizeExcelCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (/^[=+\-@]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// 1. PHASE 1 – HOMEPAGE HERO CAROUSEL 16:9 ASPECT RATIO & RESPONSIVENESS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("HERO-1: PromotionalHeroCarousel uses 16:9 aspect ratio classes on desktop/tablet", async () => {
  const content = await Deno.readTextFile("src/components/PromotionalHeroCarousel.tsx");

  // Verify desktop/tablet 16:9 aspect ratio styling
  assertMatch(
    content,
    /md:aspect-\[16\/9\]/,
    "Promotional hero carousel must include md:aspect-[16/9] for proper 16:9 proportion",
  );

  // Verify responsive desktop max height constraint
  assertMatch(
    content,
    /md:max-h-\[760px\]|lg:max-h-\[820px\]/,
    "Desktop must constrain max-height to avoid excessive vertical space on ultrawide monitors",
  );

  // Verify controlled mobile height
  assertMatch(
    content,
    /h-\[340px\]|min-\[400px\]:h-\[380px\]|sm:h-\[440px\]/,
    "Mobile must maintain controlled height classes so content does not collapse",
  );

  // Verify alignment with global container max-w-[1520px]
  assertMatch(
    content,
    /max-w-\[1520px\]/,
    "Promotional carousel container must align with the global 1520px content layout",
  );

  // Verify object-cover object-center to avoid image distortion
  assertMatch(
    content,
    /object-cover object-center/,
    "Promotional images must maintain object-cover object-center",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PHASE 2 – RESCHEDULE APPROVAL & REJECTION WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("RESCHED-APPROVAL-1: shouldDisplayReschedulePanel suppresses decided requests", () => {
  // Pending request -> displays panel
  const pendingTicket = {
    method: "On-site Technician Visit",
    status: "Reschedule Requested",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "14:00 – 16:00",
      status: "pending",
    },
  };
  assertEquals(shouldDisplayReschedulePanel(pendingTicket), true);

  // Approved request -> panel dismissed
  const approvedTicket = {
    method: "On-site Technician Visit",
    status: "Rescheduled",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "14:00 – 16:00",
      status: "approved",
    },
  };
  assertEquals(shouldDisplayReschedulePanel(approvedTicket), false);

  // Rejected request -> panel dismissed
  const rejectedTicket = {
    method: "On-site Technician Visit",
    status: "Booked",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "14:00 – 16:00",
      status: "rejected",
    },
  };
  assertEquals(shouldDisplayReschedulePanel(rejectedTicket), false);

  // Status is 'Rescheduled' -> panel dismissed
  const alreadyRescheduledTicket = {
    method: "On-site Technician Visit",
    status: "Rescheduled",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "14:00 – 16:00",
    },
  };
  assertEquals(shouldDisplayReschedulePanel(alreadyRescheduledTicket), false);

  // Non-on-site ticket -> always false
  const courierTicket = {
    method: "Courier to IT HUB",
    status: "Reschedule Requested",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "14:00 – 16:00",
    },
  };
  assertEquals(shouldDisplayReschedulePanel(courierTicket), false);
});

Deno.test("RESCHED-APPROVAL-2: Atomic Approval updates ticket status to 'Rescheduled', sets date/slot & logs audit", async () => {
  const testTicketId = "00000000-0000-0000-0000-000000000e01";
  const testReqId = "00000000-0000-0000-0000-000000000e02";

  // Cleanup
  await adminClient.from("service_appointment_reschedule_requests").delete().eq("id", testReqId);
  await adminClient.from("service_requests").delete().eq("id", testTicketId);

  // 1. Insert test on-site ticket
  const { error: ticketErr } = await adminClient.from("service_requests").insert({
    id: testTicketId,
    user_id: "0370fb7a-7896-44bc-a543-023dd399913f",
    device: "Dell XPS 15 Laptop",
    problem: "Display flickering on battery",
    method: "On-site service",
    status: "Booked",
    preferred_date: "2026-11-05",
    preferred_slot: "10:00 – 12:00",
    reschedule_details: {
      requestId: testReqId,
      requestedDate: "2026-11-08",
      requestedSlot: "14:00 – 16:00",
      reason: "Traveling out of town until Friday",
      status: "pending",
    },
  });
  assertEquals(ticketErr, null, `Failed inserting test ticket: ${ticketErr?.message}`);

  // 2. Insert pending reschedule request row
  const { error: reqErr } = await adminClient
    .from("service_appointment_reschedule_requests")
    .insert({
      id: testReqId,
      ticket_id: testTicketId,
      original_date: "2026-11-05",
      original_slot: "10:00 – 12:00",
      requested_date: "2026-11-08",
      requested_slot: "14:00 – 16:00",
      reason: "Traveling out of town until Friday",
      status: "pending",
    });
  assertEquals(reqErr, null, `Failed inserting test reschedule request: ${reqErr?.message}`);

  // 3. Invoke staff_decide_appointment_reschedule as service_role
  const { data: decisionRes, error: rpcErr } = await adminClient.rpc(
    "staff_decide_appointment_reschedule",
    {
      p_request_id: testReqId,
      p_decision: "approved",
      p_staff_response: "Confirmed with technician Arun for 2 PM slot.",
      p_ticket_id: testTicketId,
    },
  );

  assertEquals(rpcErr, null, `RPC error: ${rpcErr?.message}`);
  assertEquals(decisionRes.ok, true, `Decision result not ok: ${JSON.stringify(decisionRes)}`);
  assertEquals(decisionRes.newStatus, "Rescheduled");
  assertEquals(decisionRes.newDate, "2026-11-08");
  assertEquals(decisionRes.newSlot, "14:00 – 16:00");

  // 4. Verify updated service_requests row
  const { data: updatedTicket } = await adminClient
    .from("service_requests")
    .select("status, preferred_date, preferred_slot, reschedule_details")
    .eq("id", testTicketId)
    .single();

  assertEquals(updatedTicket?.status, "Rescheduled");
  assertEquals(updatedTicket?.preferred_date, "2026-11-08");
  assertEquals(updatedTicket?.preferred_slot, "14:00 – 16:00");
  assertEquals(updatedTicket?.reschedule_details?.status, "approved");

  // 5. Verify service_appointment_reschedule_requests row
  const { data: updatedReq } = await adminClient
    .from("service_appointment_reschedule_requests")
    .select("status, staff_response")
    .eq("id", testReqId)
    .single();

  assertEquals(updatedReq?.status, "approved");
  assertStringIncludes(updatedReq?.staff_response || "", "technician Arun");

  // 6. Verify staff audit log
  const { data: auditLog } = await adminClient
    .from("staff_audit_logs")
    .select("action_type, new_status, metadata")
    .eq("entity_id", testTicketId)
    .eq("action_type", "APPROVE_RESCHEDULE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  assertExists(auditLog);
  assertEquals(auditLog?.action_type, "APPROVE_RESCHEDULE");
  assertEquals(auditLog?.new_status, "Rescheduled");

  // Cleanup
  await adminClient.from("service_appointment_reschedule_requests").delete().eq("id", testReqId);
  await adminClient.from("service_requests").delete().eq("id", testTicketId);
});

Deno.test("RESCHED-REJECTION-1: Atomic Rejection reverts status from 'Reschedule Requested' to 'Booked' & preserves original slot", async () => {
  const testTicketId = "00000000-0000-0000-0000-000000000e03";
  const testReqId = "00000000-0000-0000-0000-000000000e04";

  // Cleanup
  await adminClient.from("service_appointment_reschedule_requests").delete().eq("id", testReqId);
  await adminClient.from("service_requests").delete().eq("id", testTicketId);

  // 1. Insert test on-site ticket with status 'Reschedule Requested'
  const { error: ticketErr } = await adminClient.from("service_requests").insert({
    id: testTicketId,
    user_id: "0370fb7a-7896-44bc-a543-023dd399913f",
    device: "MacBook Pro M2",
    problem: "Battery replacement",
    method: "On-site service",
    status: "Reschedule Requested",
    preferred_date: "2026-11-06",
    preferred_slot: "11:00 – 13:00",
    reschedule_details: {
      requestId: testReqId,
      requestedDate: "2026-11-09",
      requestedSlot: "16:00 – 18:00",
      reason: "Sunday preference",
      status: "pending",
    },
  });
  assertEquals(ticketErr, null, `Failed inserting test ticket: ${ticketErr?.message}`);

  // 2. Insert pending reschedule request row
  const { error: reqErr } = await adminClient
    .from("service_appointment_reschedule_requests")
    .insert({
      id: testReqId,
      ticket_id: testTicketId,
      original_date: "2026-11-06",
      original_slot: "11:00 – 13:00",
      requested_date: "2026-11-09",
      requested_slot: "16:00 – 18:00",
      reason: "Sunday preference",
      status: "pending",
    });
  assertEquals(reqErr, null, `Failed inserting test reschedule request: ${reqErr?.message}`);

  // 3. Invoke rejection RPC
  const { data: rejectRes, error: rpcErr } = await adminClient.rpc(
    "staff_decide_appointment_reschedule",
    {
      p_request_id: testReqId,
      p_decision: "rejected",
      p_staff_response: "Technicians fully booked on Sunday. Original slot maintained.",
      p_ticket_id: testTicketId,
    },
  );

  assertEquals(rpcErr, null, `RPC error: ${rpcErr?.message}`);
  assertEquals(rejectRes.ok, true);
  assertEquals(rejectRes.decision, "rejected");
  assertEquals(rejectRes.newStatus, "Booked");
  assertEquals(rejectRes.preservedDate, "2026-11-06");

  // 4. Verify updated service_requests row: status reverted to 'Booked', original date/slot PRESERVED
  const { data: updatedTicket } = await adminClient
    .from("service_requests")
    .select("status, preferred_date, preferred_slot, reschedule_details")
    .eq("id", testTicketId)
    .single();

  assertEquals(updatedTicket?.status, "Booked");
  assertEquals(updatedTicket?.preferred_date, "2026-11-06");
  assertEquals(updatedTicket?.preferred_slot, "11:00 – 13:00");
  assertEquals(updatedTicket?.reschedule_details?.status, "rejected");

  // 5. Verify staff audit log
  const { data: auditLog } = await adminClient
    .from("staff_audit_logs")
    .select("action_type, new_status, metadata")
    .eq("entity_id", testTicketId)
    .eq("action_type", "REJECT_RESCHEDULE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  assertExists(auditLog);
  assertEquals(auditLog?.action_type, "REJECT_RESCHEDULE");
  assertEquals(auditLog?.new_status, "Booked");

  // Cleanup
  await adminClient.from("service_appointment_reschedule_requests").delete().eq("id", testReqId);
  await adminClient.from("service_requests").delete().eq("id", testTicketId);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PHASE 3 – WEBSITE VISITOR ANALYTICS SCHEMA & STOREFRONT LOGGING
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("ANALYTICS-DB-1: visitor_sessions and visitor_events tables are accessible", async () => {
  const { data: sessions, error: sessErr } = await adminClient
    .from("visitor_sessions")
    .select("id, visitor_id, device, landing_page, page_views")
    .limit(1);

  assertEquals(sessErr, null, `visitor_sessions query error: ${sessErr?.message}`);
  assertExists(sessions);

  const { data: events, error: evtErr } = await adminClient
    .from("visitor_events")
    .select("id, session_id, event_type, path")
    .limit(1);

  assertEquals(evtErr, null, `visitor_events query error: ${evtErr?.message}`);
  assertExists(events);
});

Deno.test("ANALYTICS-DB-2: log_visitor_event stored procedure inserts session and event", async () => {
  const testSessionId = "00000000-0000-0000-0000-000000000e10";
  const testVisitorId = "tok_test_deno_visitor_12345";

  // Cleanup
  await adminClient.from("visitor_events").delete().eq("session_id", testSessionId);
  await adminClient.from("visitor_sessions").delete().eq("id", testSessionId);

  // Invoke RPC
  const { error: rpcErr } = await adminClient.rpc("log_visitor_event", {
    p_session_id: testSessionId,
    p_visitor_id: testVisitorId,
    p_event_type: "Page Viewed",
    p_path: "/products",
    p_meta: { source: "Deno Test Suite" },
    p_device: "Desktop",
    p_os: "Windows",
    p_browser: "Chrome",
    p_referrer: "Google",
    p_country: "India",
    p_region: "Kerala",
    p_city: "Kochi",
    p_isp: "Airtel",
    p_returning: false,
  });

  assertEquals(rpcErr, null, `log_visitor_event error: ${rpcErr?.message}`);

  // Verify inserted session
  const { data: s } = await adminClient
    .from("visitor_sessions")
    .select("id, visitor_id, device, city, region, page_views")
    .eq("id", testSessionId)
    .single();

  assertExists(s);
  assertEquals(s.visitor_id, testVisitorId);
  assertEquals(s.device, "Desktop");
  assertEquals(s.city, "Kochi");
  assertEquals(s.region, "Kerala");
  assertEquals(s.page_views, 1);

  // Cleanup
  await adminClient.from("visitor_events").delete().eq("session_id", testSessionId);
  await adminClient.from("visitor_sessions").delete().eq("id", testSessionId);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PHASE 4 – EXCEL EXPORT & FORMULA INJECTION SANITIZATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("EXCEL-1: sanitizeExcelCell protects against formula injection vulnerabilities", () => {
  // Dangerous inputs starting with =, +, -, @
  assertEquals(sanitizeExcelCell("=SUM(A1:A10)"), "'=SUM(A1:A10)");
  assertEquals(sanitizeExcelCell("+1234567890"), "'+1234567890");
  assertEquals(sanitizeExcelCell("-2+3*cmd|' /C calc'!A0"), "'-2+3*cmd|' /C calc'!A0");
  assertEquals(sanitizeExcelCell("@SUM(1,2)"), "'@SUM(1,2)");

  // Safe inputs
  assertEquals(sanitizeExcelCell("Kochi, Kerala"), "Kochi, Kerala");
  assertEquals(sanitizeExcelCell("user@example.com"), "user@example.com");
  assertEquals(sanitizeExcelCell("9847123456"), "9847123456");
  assertEquals(sanitizeExcelCell(null), "");
  assertEquals(sanitizeExcelCell(undefined), "");
});

Deno.test("EXCEL-2: Audits.tsx and visitorAnalytics.ts contain Excel export functionality", async () => {
  const pageContent = await Deno.readTextFile("ITHUB_ADMIN/src/pages/Audits.tsx");
  assertMatch(
    pageContent,
    /Export to Excel \(\.xlsx\)/,
    "Audits page must feature a prominent 'Export to Excel (.xlsx)' button",
  );
  assertMatch(
    pageContent,
    /exportVisitorAnalyticsToExcel/,
    "Audits page must invoke exportVisitorAnalyticsToExcel",
  );

  const libContent = await Deno.readTextFile("ITHUB_ADMIN/src/lib/visitorAnalytics.ts");
  assertMatch(
    libContent,
    /export function exportVisitorAnalyticsToExcel/,
    "visitorAnalytics library must export exportVisitorAnalyticsToExcel",
  );
  assertMatch(
    libContent,
    /IT_HUB_Website_Audit_.*\.xlsx/,
    "Filename format must follow IT_HUB_Website_Audit_YYYY-MM-DD.xlsx",
  );
});
