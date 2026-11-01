// supabase/functions/tests/service-method-alerts.test.ts
// Automated Tests: Three-Method Classification & Intelligent Admin Alert System (TDD)
// IT HUB — Kerala, India

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  CANONICAL_SERVICE_METHODS,
  type CanonicalServiceMethod,
  classifyServiceMethod,
  getServiceMethodInfo,
  calculateMethodCounts,
  filterTicketsByCriteria,
} from "../../../src/lib/serviceClassification.ts";

import {
  type AdminAlert,
  type AdminAlertEventType,
  evaluateTicketAlerts,
  generateAlertsFromTickets,
  markAlertAsRead,
  markAllAlertsAsRead,
  getUnreadAlertCount,
  deduplicateAlerts,
} from "../../../src/lib/serviceAlerts.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers & Mock Fixtures
// ─────────────────────────────────────────────────────────────────────────────

interface MockServiceTicket {
  id: string;
  device: string;
  model?: string | null;
  problem: string;
  method: string;
  status: string;
  customer_name?: string;
  customer_phone?: string;
  technician_name?: string | null;
  quote_state?: "pending" | "approved" | "rejected" | null;
  approved_items?: string[];
  declined_items?: string[];
  reschedule_details?:
    | {
        requestedDate?: string;
        requestedSlot?: string;
        reason?: string;
      }
    | Record<string, unknown>
    | null;
  inbound_courier_tracking_no?: string | null;
  created_at: string;
  updated_at: string;
}

function createTicket(overrides: Partial<MockServiceTicket> = {}): MockServiceTicket {
  return {
    id: "SRV-TEST-001",
    device: "Laptop",
    model: "Dell XPS 15",
    problem: "Battery replacement required",
    method: "On-site Technician Visit",
    status: "Booked",
    customer_name: "Rahul Nair",
    customer_phone: "+91 98460 12345",
    technician_name: null,
    quote_state: null,
    approved_items: [],
    declined_items: [],
    reschedule_details: {},
    inbound_courier_tracking_no: null,
    created_at: "2026-10-30T10:00:00.000Z",
    updated_at: "2026-10-30T10:00:00.000Z",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Three-Method Classification Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("METHOD-CLASS-1: Classifies raw method strings into exactly one of three canonical methods", () => {
  assertEquals(CANONICAL_SERVICE_METHODS.COURIER, "Courier to IT HUB");
  assertEquals(CANONICAL_SERVICE_METHODS.ONSITE, "On-site Technician Visit");
  assertEquals(CANONICAL_SERVICE_METHODS.WALK_IN, "Visit IT HUB");

  // Courier aliases
  assertEquals(classifyServiceMethod("Courier to IT HUB"), "Courier to IT HUB");
  assertEquals(classifyServiceMethod("Insured Courier Pickup & Return"), "Courier to IT HUB");
  assertEquals(classifyServiceMethod("courier"), "Courier to IT HUB");
  assertEquals(classifyServiceMethod("Courier Service"), "Courier to IT HUB");

  // On-site aliases
  assertEquals(classifyServiceMethod("On-site Technician Visit"), "On-site Technician Visit");
  assertEquals(classifyServiceMethod("On-site service"), "On-site Technician Visit");
  assertEquals(classifyServiceMethod("Doorstep Technician Visit"), "On-site Technician Visit");
  assertEquals(classifyServiceMethod("doorstep"), "On-site Technician Visit");

  // Walk-In / Visit aliases
  assertEquals(classifyServiceMethod("Visit IT HUB"), "Visit IT HUB");
  assertEquals(classifyServiceMethod("Direct Store Walk-In"), "Visit IT HUB");
  assertEquals(classifyServiceMethod("Walk-in"), "Visit IT HUB");
  assertEquals(classifyServiceMethod(""), "Visit IT HUB");
  assertEquals(classifyServiceMethod(null), "Visit IT HUB");
  assertEquals(classifyServiceMethod(undefined), "Visit IT HUB");
});

Deno.test("METHOD-CLASS-2: Returns distinct visual badge styles and icons for each method", () => {
  const courierInfo = getServiceMethodInfo("Courier to IT HUB");
  assertEquals(courierInfo.canonicalMethod, "Courier to IT HUB");
  assertStringIncludes(courierInfo.badgeClass, "purple");
  assertEquals(courierInfo.iconName, "Truck");

  const onsiteInfo = getServiceMethodInfo("On-site Technician Visit");
  assertEquals(onsiteInfo.canonicalMethod, "On-site Technician Visit");
  assertStringIncludes(onsiteInfo.badgeClass, "blue");
  assertEquals(onsiteInfo.iconName, "Home");

  const walkInInfo = getServiceMethodInfo("Visit IT HUB");
  assertEquals(walkInInfo.canonicalMethod, "Visit IT HUB");
  assertStringIncludes(walkInInfo.badgeClass, "emerald");
  assertEquals(walkInInfo.iconName, "Store");
});

Deno.test("METHOD-CLASS-3: Computes live method ticket counts accurately", () => {
  const sampleTickets = [
    createTicket({ id: "1", method: "Courier to IT HUB" }),
    createTicket({ id: "2", method: "Insured Courier Pickup & Return" }),
    createTicket({ id: "3", method: "On-site Technician Visit" }),
    createTicket({ id: "4", method: "Doorstep Technician Visit" }),
    createTicket({ id: "5", method: "On-site service" }),
    createTicket({ id: "6", method: "Visit IT HUB" }),
    createTicket({ id: "7", method: "Direct Store Walk-In" }),
  ];

  const counts = calculateMethodCounts(sampleTickets);
  assertEquals(counts.all, 7);
  assertEquals(counts.courier, 2);
  assertEquals(counts.onsite, 3);
  assertEquals(counts.walkIn, 2);
});

Deno.test("METHOD-CLASS-4: Multi-facet filtering works harmoniously (method + status + category + search)", () => {
  const sampleTickets = [
    createTicket({
      id: "1",
      method: "Courier to IT HUB",
      status: "Booked",
      device: "Laptop",
      problem: "Screen broken",
    }),
    createTicket({
      id: "2",
      method: "Courier to IT HUB",
      status: "In Progress",
      device: "Desktop",
      problem: "PSU failure",
    }),
    createTicket({
      id: "3",
      method: "On-site Technician Visit",
      status: "Booked",
      device: "Laptop",
      problem: "Motherboard repair",
    }),
    createTicket({
      id: "4",
      method: "Visit IT HUB",
      status: "Booked",
      device: "MacBook",
      problem: "Liquid spill",
    }),
  ];

  // Filter by method: Courier
  const courierOnly = filterTicketsByCriteria(sampleTickets, { method: "Courier to IT HUB" });
  assertEquals(courierOnly.length, 2);

  // Filter by method + status
  const courierBooked = filterTicketsByCriteria(sampleTickets, {
    method: "Courier to IT HUB",
    status: "Booked",
  });
  assertEquals(courierBooked.length, 1);
  assertEquals(courierBooked[0].id, "1");

  // Filter by method + device category
  const courierDesktop = filterTicketsByCriteria(sampleTickets, {
    method: "Courier to IT HUB",
    category: "Desktop",
  });
  assertEquals(courierDesktop.length, 1);
  assertEquals(courierDesktop[0].id, "2");

  // Search across filtered tickets
  const searchResult = filterTicketsByCriteria(sampleTickets, {
    method: "ALL",
    search: "Liquid",
  });
  assertEquals(searchResult.length, 1);
  assertEquals(searchResult[0].id, "4");
});

Deno.test("METHOD-CLASS-5: Shortens table labels to Courier, On-site, and Visit IT HUB without altering canonical methods", async () => {
  // @ts-ignore
  const { getServiceMethodCompactLabel } =
    await import("../../../src/lib/serviceClassification.ts");

  // Verify compact table display labels
  assertEquals(getServiceMethodCompactLabel("Courier to IT HUB"), "Courier");
  assertEquals(getServiceMethodCompactLabel("Insured Courier Pickup & Return"), "Courier");
  assertEquals(getServiceMethodCompactLabel("On-site Technician Visit"), "On-site");
  assertEquals(getServiceMethodCompactLabel("Doorstep Technician Visit"), "On-site");
  assertEquals(getServiceMethodCompactLabel("On-site service"), "On-site");
  assertEquals(getServiceMethodCompactLabel("Visit IT HUB"), "Visit IT HUB");
  assertEquals(getServiceMethodCompactLabel("Direct Store Walk-In"), "Visit IT HUB");

  // Verify canonical methods and underlying values remain untouched
  assertEquals(CANONICAL_SERVICE_METHODS.COURIER, "Courier to IT HUB");
  assertEquals(CANONICAL_SERVICE_METHODS.ONSITE, "On-site Technician Visit");
  assertEquals(CANONICAL_SERVICE_METHODS.WALK_IN, "Visit IT HUB");

  // Verify getServiceMethodInfo provides both full label and shortLabel
  const onsite = getServiceMethodInfo("On-site Technician Visit");
  assertEquals(onsite.label, "On-site Technician Visit");
  assertEquals((onsite as any).shortLabel, "On-site");

  const courier = getServiceMethodInfo("Courier to IT HUB");
  assertEquals(courier.label, "Courier to IT HUB");
  assertEquals((courier as any).shortLabel, "Courier");

  const walkin = getServiceMethodInfo("Visit IT HUB");
  assertEquals(walkin.label, "Visit IT HUB");
  assertEquals((walkin as any).shortLabel, "Visit IT HUB");
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Intelligent Admin Alert System Tests (8 Required Event Types)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("ALERT-1: Generates NEW_COURIER_BOOKING for newly booked courier ticket", () => {
  const ticket = createTicket({
    id: "SRV-C-01",
    method: "Courier to IT HUB",
    status: "Booked",
    device: "Laptop ThinkPad T14",
  });

  const alerts = evaluateTicketAlerts(ticket);
  const match = alerts.find((a) => a.eventType === "NEW_COURIER_BOOKING");
  assertNotEquals(match, undefined);
  assertEquals(match?.method, "Courier to IT HUB");
  assertEquals(match?.ticketId, "SRV-C-01");
  assertEquals(match?.actionRequired, true);
  assertStringIncludes(match?.description || "", "courier");
});

Deno.test("ALERT-2: Generates NEW_ONSITE_BOOKING for newly booked on-site technician ticket", () => {
  const ticket = createTicket({
    id: "SRV-O-01",
    method: "On-site Technician Visit",
    status: "Booked",
    device: "Custom Gaming PC",
  });

  const alerts = evaluateTicketAlerts(ticket);
  const match = alerts.find((a) => a.eventType === "NEW_ONSITE_BOOKING");
  assertNotEquals(match, undefined);
  assertEquals(match?.method, "On-site Technician Visit");
  assertEquals(match?.ticketId, "SRV-O-01");
  assertEquals(match?.actionRequired, true);
});

Deno.test("ALERT-3: Generates NEW_WALKIN_BOOKING for newly booked Visit IT HUB ticket", () => {
  const ticket = createTicket({
    id: "SRV-W-01",
    method: "Visit IT HUB",
    status: "Booked",
    device: "Mac mini M2",
  });

  const alerts = evaluateTicketAlerts(ticket);
  const match = alerts.find((a) => a.eventType === "NEW_WALKIN_BOOKING");
  assertNotEquals(match, undefined);
  assertEquals(match?.method, "Visit IT HUB");
  assertEquals(match?.ticketId, "SRV-W-01");
});

Deno.test("ALERT-4: Generates CUSTOMER_RESCHEDULE_REQUESTED for on-site ticket with reschedule details", () => {
  const ticket = createTicket({
    id: "SRV-O-02",
    method: "On-site Technician Visit",
    status: "Reschedule Requested",
    reschedule_details: {
      requestedDate: "2026-11-10",
      requestedSlot: "14:00 – 16:00",
      reason: "Available only afternoon",
    },
  });

  const alerts = evaluateTicketAlerts(ticket);
  const match = alerts.find((a) => a.eventType === "CUSTOMER_RESCHEDULE_REQUESTED");
  assertNotEquals(match, undefined);
  assertEquals(match?.ticketId, "SRV-O-02");
  assertEquals(match?.actionRequired, true);
  assertStringIncludes(match?.description || "", "reschedule");
});

Deno.test("ALERT-5: Generates COURIER_DEVICE_RECEIVED when courier parcel arrives", () => {
  const ticket = createTicket({
    id: "SRV-C-02",
    method: "Courier to IT HUB",
    status: "Device Received",
    inbound_courier_tracking_no: "BLUEDART-987654321",
  });

  const alerts = evaluateTicketAlerts(ticket);
  const match = alerts.find((a) => a.eventType === "COURIER_DEVICE_RECEIVED");
  assertNotEquals(match, undefined);
  assertEquals(match?.ticketId, "SRV-C-02");
  assertEquals(match?.actionRequired, true);
});

Deno.test("ALERT-6: Generates TECHNICIAN_ASSIGNMENT_PENDING for on-site booking without assigned technician", () => {
  const ticket = createTicket({
    id: "SRV-O-03",
    method: "On-site Technician Visit",
    status: "Booked",
    technician_name: null,
  });

  const alerts = evaluateTicketAlerts(ticket);
  const match = alerts.find((a) => a.eventType === "TECHNICIAN_ASSIGNMENT_PENDING");
  assertNotEquals(match, undefined);
  assertEquals(match?.ticketId, "SRV-O-03");
  assertEquals(match?.actionRequired, true);
});

Deno.test("ALERT-7: Generates QUOTATION_APPROVED when customer approves repair quote", () => {
  const ticket = createTicket({
    id: "SRV-Q-01",
    method: "Visit IT HUB",
    status: "Awaiting Approval",
    quote_state: "approved",
    approved_items: ["f-battery-01", "f-clean-02"],
  });

  const alerts = evaluateTicketAlerts(ticket);
  const match = alerts.find((a) => a.eventType === "QUOTATION_APPROVED");
  assertNotEquals(match, undefined);
  assertEquals(match?.ticketId, "SRV-Q-01");
  assertEquals(match?.actionRequired, true);
});

Deno.test("ALERT-8: Generates ACTION_REQUIRED for operational milestones (e.g. customer arrived at store)", () => {
  const ticket = createTicket({
    id: "SRV-W-02",
    method: "Visit IT HUB",
    status: "Customer Arrived",
  });

  const alerts = evaluateTicketAlerts(ticket);
  const match = alerts.find((a) => a.eventType === "ACTION_REQUIRED");
  assertNotEquals(match, undefined);
  assertEquals(match?.ticketId, "SRV-W-02");
  assertEquals(match?.actionRequired, true);
});

Deno.test("ALERT-9: Alerts contain full actionable metadata and default unread state", () => {
  const ticket = createTicket({
    id: "SRV-META-01",
    device: "Asus ROG Zephyrus G14",
    model: null,
    customer_name: "Anita George",
    customer_phone: "+91 94471 23456",
    method: "Courier to IT HUB",
    status: "Booked",
  });

  const alerts = evaluateTicketAlerts(ticket);
  assertEquals(alerts.length > 0, true);
  const alert = alerts[0];

  assertEquals(alert.ticketId, "SRV-META-01");
  assertEquals(alert.deviceName, "Asus ROG Zephyrus G14");
  assertEquals(alert.customerName, "Anita George");
  assertEquals(alert.customerPhone, "+91 94471 23456");
  assertEquals(alert.method, "Courier to IT HUB");
  assertEquals(alert.read, false);
  assertNotEquals(alert.timestamp, undefined);
  assertNotEquals(alert.id, undefined);
});

Deno.test("ALERT-10: Prevents duplicate alerts and deduplicates identical event instances", () => {
  const ticket1 = createTicket({ id: "SRV-DUP-01", method: "Courier to IT HUB", status: "Booked" });
  const ticket2 = createTicket({ id: "SRV-DUP-01", method: "Courier to IT HUB", status: "Booked" });

  const alerts1 = evaluateTicketAlerts(ticket1);
  const alerts2 = evaluateTicketAlerts(ticket2);

  const combined = deduplicateAlerts([...alerts1, ...alerts2]);
  assertEquals(combined.length, alerts1.length);
});

Deno.test("ALERT-11: Manages read/unread states and unread counters reliably", () => {
  const ticketA = createTicket({ id: "SRV-A", method: "Courier to IT HUB", status: "Booked" });
  const ticketB = createTicket({
    id: "SRV-B",
    method: "On-site Technician Visit",
    status: "Booked",
  });

  const alerts = generateAlertsFromTickets([ticketA, ticketB]);
  const initialUnread = getUnreadAlertCount(alerts);
  assertEquals(initialUnread >= 2, true);

  // Mark first alert as read
  const firstId = alerts[0].id;
  const updatedAlerts = markAlertAsRead(alerts, firstId);
  assertEquals(getUnreadAlertCount(updatedAlerts), initialUnread - 1);
  assertEquals(updatedAlerts.find((a) => a.id === firstId)?.read, true);

  // Mark all as read
  const allRead = markAllAlertsAsRead(updatedAlerts);
  assertEquals(getUnreadAlertCount(allRead), 0);
  assertEquals(
    allRead.every((a) => a.read === true),
    true,
  );
});
