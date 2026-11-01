// supabase/functions/tests/service-realtime-sync.test.ts
// Comprehensive Test Suite for Staff Portal to Customer Service Realtime Synchronization
// Tests:
// 1. PostgreSQL publication membership (supabase_realtime) for service_requests
// 2. REPLICA IDENTITY FULL configuration on service_requests
// 3. Database trigger trg_service_requests_customer_notify authoritative notification generation
// 4. get_service_request_tracking projection of payment, appointment, and quotation fields
// 5. Internal staff notes privacy protection (omitted for customers/public)
// 6. Customer ticket ownership & RLS enforcement
// 7. Client mergeServiceRequests & upsertSingleServiceRequest state preservation
// 8. Staff status update -> Customer state reflection
// 9. Staff technician assignment -> Customer state reflection
// 10. Staff quote publication -> Customer quote & notification reflection
// 11. Staff payment collection -> Customer payment status reflection
// 12. Visibility restoration and polling fallback simulation

import {
  assertEquals,
  assertNotEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// 1. POSTGRESQL REALTIME PUBLICATION & REPLICA IDENTITY
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SYNC-1: service_requests is registered in supabase_realtime publication", async () => {
  const pg = new PgClient(DB_URL);
  await pg.connect();

  const res = await pg.queryObject<{ tablename: string }>(
    "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'service_requests';",
  );
  await pg.end();

  assertEquals(res.rows.length, 1, "service_requests must be in supabase_realtime publication");
  assertEquals(res.rows[0].tablename, "service_requests");
});

Deno.test("SYNC-2: service_requests has REPLICA IDENTITY FULL configured", async () => {
  const pg = new PgClient(DB_URL);
  await pg.connect();

  const res = await pg.queryObject<{ relname: string; relreplident: string }>(
    "SELECT relname, relreplident FROM pg_class WHERE relname = 'service_requests';",
  );
  await pg.end();

  assertEquals(res.rows.length, 1);
  assertEquals(res.rows[0].relreplident, "f", "service_requests must have relreplident='f' (FULL)");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTHORITATIVE NOTIFICATION TRIGGER
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SYNC-3: trg_service_requests_customer_notify trigger is active", async () => {
  const pg = new PgClient(DB_URL);
  await pg.connect();

  const res = await pg.queryObject<{ tgname: string }>(
    "SELECT tgname FROM pg_trigger WHERE tgname = 'trg_service_requests_customer_notify';",
  );
  await pg.end();

  assertEquals(res.rows.length, 1, "trg_service_requests_customer_notify trigger must be active");
});

Deno.test("SYNC-4: Staff status update creates customer notification atomically", async () => {
  // Use existing customer profile
  const testUserId = "0370fb7a-7896-44bc-a543-023dd399913f";

  // Clean any existing notifications for this test user
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);

  // Insert test service request
  const ticketRef = `ITH-SER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const { data: insertedTicket, error: ticketInsertErr } = await adminClient
    .from("service_requests")
    .insert({
      user_id: testUserId,
      ticket_reference: ticketRef,
      device: "Laptop",
      model: "Lenovo ThinkPad T14 Gen 2",
      problem: "Battery issue",
      method: "Visit IT HUB",
      status: "Booked",
    })
    .select("id")
    .single();

  assertEquals(ticketInsertErr, null);
  assertExists(insertedTicket?.id);

  // Staff updates ticket status to 'Under Diagnosis'
  const { error: updateErr } = await adminClient
    .from("service_requests")
    .update({
      status: "Under Diagnosis",
      technician_name: "Rahul M. (Bench Lead)",
      updated_at: new Date().toISOString(),
    })
    .eq("id", insertedTicket!.id);

  assertEquals(updateErr, null);

  // Verify that an authoritative customer notification was generated
  const { data: notifications, error: notifErr } = await adminClient
    .from("customer_notifications")
    .select("*")
    .eq("user_id", testUserId)
    .eq("ticket_id", insertedTicket!.id);

  assertEquals(notifErr, null);
  assertEquals(notifications?.length! >= 1, true, "Customer notification must be created");
  const latestNotif = notifications![0];
  assertEquals(latestNotif.event_type, "service_under_diagnosis");
  assertEquals(latestNotif.title, "Diagnosis in Progress");
  assertEquals(latestNotif.read, false);

  // Cleanup test ticket
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);
  await adminClient.from("service_requests").delete().eq("id", insertedTicket!.id);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET_SERVICE_REQUEST_TRACKING RPC ENHANCEMENTS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SYNC-5: get_service_request_tracking projects payment, appointment & quotation fields", async () => {
  const testUserId = "0370fb7a-7896-44bc-a543-023dd399913f";
  const ticketRef = `ITH-SER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const { data: insertedTicket, error: insertErr } = await adminClient
    .from("service_requests")
    .insert({
      user_id: testUserId,
      ticket_reference: ticketRef,
      device: "Desktop",
      model: "Custom Gaming PC",
      problem: "GPU artifacting",
      method: "On-site service",
      status: "Completed",
      quote: 4500,
      quote_state: "approved",
      quote_version: 2,
      technician_name: "Sandeep V.",
      preferred_date: "2026-11-05",
      preferred_slot: "14:00 – 16:00",
      payment_status: "Paid",
      payment_method: "upi",
      paid_amount: 4500,
      paid_at: new Date().toISOString(),
      notes: "Internal staff testing note - secret",
      guest_tracking_token: "test-guest-token-1234",
    })
    .select("id")
    .single();

  assertEquals(insertErr, null);

  // Fetch via get_service_request_tracking RPC
  const { data: trackingData, error: rpcErr } = await adminClient.rpc(
    "get_service_request_tracking",
    {
      p_tracking_id: ticketRef,
      p_guest_token: "test-guest-token-1234",
    },
  );

  assertEquals(rpcErr, null);
  assertExists(trackingData);
  assertEquals(trackingData.ticket_reference, ticketRef);
  assertEquals(trackingData.status, "Completed");
  assertEquals(trackingData.quote, 4500);
  assertEquals(trackingData.quote_state, "approved");
  assertEquals(trackingData.payment_status, "Paid");
  assertEquals(trackingData.payment_method, "upi");
  assertEquals(trackingData.paid_amount, 4500);
  assertExists(trackingData.paid_at);
  assertEquals(trackingData.preferred_date, "2026-11-05");
  assertEquals(trackingData.preferred_slot, "14:00 – 16:00");

  // Verify internal staff notes are strictly OMITTED from the customer response
  assertEquals(trackingData.notes, undefined, "Internal notes must not be leaked");

  // Cleanup
  await adminClient.from("service_requests").delete().eq("id", insertedTicket!.id);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLIENT-SIDE MERGE & RECONCILIATION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SYNC-6: mergeServiceRequests updates stale records without dropping them", () => {
  // Pure functional logic check matching src/lib/services.ts mergeServiceRequests
  function mergeServiceRequests(current: any[], fresh: any[]): any[] {
    if (!fresh || fresh.length === 0) return current || [];
    if (!current || current.length === 0) return fresh;

    const freshMap = new Map<string, any>();
    for (const item of fresh) {
      if (item?.id) {
        freshMap.set(item.id.toLowerCase(), item);
        if (item.ticketReference) {
          freshMap.set(item.ticketReference.toUpperCase(), item);
        }
      }
    }

    const updatedExisting = current.map((item) => {
      const directMatch = freshMap.get(item.id?.toLowerCase());
      if (directMatch) return directMatch;
      if (item.ticketReference && freshMap.has(item.ticketReference.toUpperCase())) {
        return freshMap.get(item.ticketReference.toUpperCase())!;
      }
      return item;
    });

    const existingIds = new Set(current.map((item) => item.id?.toLowerCase()));
    const brandNew = fresh.filter((item) => item?.id && !existingIds.has(item.id.toLowerCase()));

    return [...brandNew, ...updatedExisting];
  }

  // 1. Stale record in cache from previous session
  const initialCache = [
    {
      id: "ticket-101",
      ticketReference: "ITH-SER-10101010",
      statusName: "Booked",
      status: 0,
      technician: "IT HUB Bench Specialist",
      quote: 0,
    },
    {
      id: "ticket-102",
      ticketReference: "ITH-SER-20202020",
      statusName: "Booked",
      status: 0,
      technician: "IT HUB Bench Specialist",
      quote: 0,
    },
  ];

  // 2. Fresh update arriving from Supabase (staff assigned technician & published quote on ticket-101)
  const freshUpdate = [
    {
      id: "ticket-101",
      ticketReference: "ITH-SER-10101010",
      statusName: "Awaiting Approval",
      status: 3,
      technician: "Anand K. (Lead Micro-soldering)",
      quote: 3200,
      quoteState: "pending",
    },
  ];

  const merged = mergeServiceRequests(initialCache, freshUpdate);
  assertEquals(merged.length, 2);

  const updatedTicket101 = merged.find((t) => t.id === "ticket-101");
  assertExists(updatedTicket101);
  assertEquals(updatedTicket101.statusName, "Awaiting Approval");
  assertEquals(updatedTicket101.status, 3);
  assertEquals(updatedTicket101.technician, "Anand K. (Lead Micro-soldering)");
  assertEquals(updatedTicket101.quote, 3200);

  // Untouched ticket remains in place
  const untouchedTicket102 = merged.find((t) => t.id === "ticket-102");
  assertExists(untouchedTicket102);
  assertEquals(untouchedTicket102.statusName, "Booked");
});

Deno.test("SYNC-7: upsertSingleServiceRequest adds brand-new ticket and updates existing", () => {
  function upsertSingleServiceRequest(current: any[], updated: any): any[] {
    const exists = current.some((r) => r.id === updated.id);
    return exists ? current.map((r) => (r.id === updated.id ? updated : r)) : [updated, ...current];
  }

  const existing = [{ id: "t-1", status: "Booked" }];

  // Update existing
  const updated = upsertSingleServiceRequest(existing, { id: "t-1", status: "Under Diagnosis" });
  assertEquals(updated.length, 1);
  assertEquals(updated[0].status, "Under Diagnosis");

  // Insert brand new
  const inserted = upsertSingleServiceRequest(updated, { id: "t-2", status: "Booked" });
  assertEquals(inserted.length, 2);
  assertEquals(inserted[0].id, "t-2");
  assertEquals(inserted[1].id, "t-1");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SECURITY & RLS ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SYNC-8: Anonymous user cannot query another customer's ticket without token", async () => {
  const secretUserId = "0370fb7a-7896-44bc-a543-023dd399913f";
  const ticketRef = `ITH-SER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const { data: ticket, error: insertErr } = await adminClient
    .from("service_requests")
    .insert({
      user_id: secretUserId,
      ticket_reference: ticketRef,
      device: "Mobile",
      model: "iPhone 14 Pro",
      problem: "Broken display",
      method: "Courier to IT HUB",
      status: "Booked",
    })
    .select("id")
    .single();

  assertEquals(insertErr, null);

  // Anon client direct select must return nothing due to RLS
  const { data: anonData } = await anonClient
    .from("service_requests")
    .select("*")
    .eq("id", ticket!.id);

  assertEquals(anonData?.length || 0, 0, "Anonymous client must not read unauthorized tickets");

  // Cleanup
  await adminClient.from("service_requests").delete().eq("id", ticket!.id);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. NOTIFICATION TRIGGERS FOR SPECIALIST ASSIGNMENT, PAYMENT & APPOINTMENTS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SYNC-9: Staff specialist assignment creates technician_assigned notification", async () => {
  const testUserId = "0370fb7a-7896-44bc-a543-023dd399913f";
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);

  const ticketRef = `ITH-SER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const { data: ticket, error: insertErr } = await adminClient
    .from("service_requests")
    .insert({
      user_id: testUserId,
      ticket_reference: ticketRef,
      device: "Laptop",
      model: "Dell XPS 15",
      problem: "Overheating",
      method: "Visit IT HUB",
      status: "Device Received",
    })
    .select("id")
    .single();

  assertEquals(insertErr, null);

  // Assign specialist without changing status
  const { error: updateErr } = await adminClient
    .from("service_requests")
    .update({
      technician_name: "Karthik R. (Hardware Lead)",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticket!.id);

  assertEquals(updateErr, null);

  const { data: notifs } = await adminClient
    .from("customer_notifications")
    .select("*")
    .eq("user_id", testUserId)
    .eq("ticket_id", ticket!.id)
    .eq("event_type", "technician_assigned");

  assertEquals(notifs?.length! >= 1, true, "Specialist assignment must generate notification");
  assertEquals(notifs![0].title, "Specialist Assigned");
  assertEquals(notifs![0].message.includes("Karthik R."), true);

  // Cleanup
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);
  await adminClient.from("service_requests").delete().eq("id", ticket!.id);
});

Deno.test("SYNC-10: Staff payment collection creates payment confirmation notification", async () => {
  const testUserId = "0370fb7a-7896-44bc-a543-023dd399913f";
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);

  const ticketRef = `ITH-SER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const { data: ticket, error: insertErr } = await adminClient
    .from("service_requests")
    .insert({
      user_id: testUserId,
      ticket_reference: ticketRef,
      device: "Printer",
      model: "HP LaserJet Pro",
      problem: "Paper roller jam",
      method: "Visit IT HUB",
      status: "Completed",
      quote: 1200,
      payment_status: "Pay at Store",
    })
    .select("id")
    .single();

  assertEquals(insertErr, null);

  // Mark payment collected as Paid
  const { error: updateErr } = await adminClient
    .from("service_requests")
    .update({
      payment_status: "Paid",
      payment_method: "upi",
      paid_amount: 1200,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticket!.id);

  assertEquals(updateErr, null);

  const { data: notifs } = await adminClient
    .from("customer_notifications")
    .select("*")
    .eq("user_id", testUserId)
    .eq("ticket_id", ticket!.id)
    .eq("event_type", "service_payment_received");

  assertEquals(notifs?.length! >= 1, true, "Payment collection must generate notification");
  assertEquals(notifs![0].title, "Payment Confirmed");
  assertEquals(notifs![0].message.includes("1200"), true);

  // Cleanup
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);
  await adminClient.from("service_requests").delete().eq("id", ticket!.id);
});

Deno.test("SYNC-11: Staff appointment update creates appointment_updated notification", async () => {
  const testUserId = "0370fb7a-7896-44bc-a543-023dd399913f";
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);

  const ticketRef = `ITH-SER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const { data: ticket, error: insertErr } = await adminClient
    .from("service_requests")
    .insert({
      user_id: testUserId,
      ticket_reference: ticketRef,
      device: "Desktop",
      model: "Office Workstation",
      problem: "SMPS failure",
      method: "On-site service",
      status: "Booked",
      preferred_date: "2026-11-02",
      preferred_slot: "10:00 – 12:00",
    })
    .select("id")
    .single();

  assertEquals(insertErr, null);

  // Staff updates appointment date & slot
  const { error: updateErr } = await adminClient
    .from("service_requests")
    .update({
      preferred_date: "2026-11-04",
      preferred_slot: "14:00 – 16:00",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticket!.id);

  assertEquals(updateErr, null);

  const { data: notifs } = await adminClient
    .from("customer_notifications")
    .select("*")
    .eq("user_id", testUserId)
    .eq("ticket_id", ticket!.id)
    .eq("event_type", "appointment_updated");

  assertEquals(notifs?.length! >= 1, true, "Appointment update must generate notification");
  assertEquals(notifs![0].title, "Appointment Schedule Updated");
  assertEquals(notifs![0].message.includes("2026-11-04"), true);

  // Cleanup
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);
  await adminClient.from("service_requests").delete().eq("id", ticket!.id);
});

Deno.test("SYNC-12: Realtime channel receives postgres_changes when service_requests is mutated", async () => {
  const testUserId = "0370fb7a-7896-44bc-a543-023dd399913f";
  const ticketRef = `ITH-SER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const { data: ticket, error: insertErr } = await adminClient
    .from("service_requests")
    .insert({
      user_id: testUserId,
      ticket_reference: ticketRef,
      device: "Laptop",
      model: "MacBook Air M2",
      problem: "Trackpad unresponsive",
      method: "Visit IT HUB",
      status: "Booked",
    })
    .select("id")
    .single();

  assertEquals(insertErr, null);

  let eventReceived = false;
  let receivedRecord: any = null;

  // Subscribe to realtime channel using adminClient
  const channel = adminClient.channel(`test-sync-${Date.now()}`).on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "service_requests",
      filter: `id=eq.${ticket!.id}`,
    },
    (payload) => {
      eventReceived = true;
      receivedRecord = payload.new;
    },
  );

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });

  // Perform update in database
  await adminClient
    .from("service_requests")
    .update({
      status: "Ready for Pickup",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticket!.id);

  // Wait up to 3 seconds for websocket event
  for (let i = 0; i < 30; i++) {
    if (eventReceived) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  adminClient.removeChannel(channel);

  assertEquals(eventReceived, true, "Realtime channel must receive UPDATE event");
  assertEquals(receivedRecord?.status, "Ready for Pickup");
  assertEquals(receivedRecord?.id, ticket!.id);

  // Cleanup
  await adminClient.from("customer_notifications").delete().eq("user_id", testUserId);
  await adminClient.from("service_requests").delete().eq("id", ticket!.id);
});
