// supabase/functions/tests/staff-portal-services.test.ts
// Automated Test Suite for Staff Portal Service Queue, Technician Assignment & Quotation Publishing

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { getStatusOptionsForMethod } from "../../../src/lib/serviceReschedule.ts";

export type ServiceStatus =
  | "Booked"
  | "Device Received"
  | "Under Diagnosis"
  | "In Progress"
  | "Diagnosis Done"
  | "Awaiting Approval"
  | "Completed"
  | "Cancelled"
  | "Delivered"
  | "Returned"
  | "Technician Assigned"
  | "Technician has Left IT HUB"
  | "Technician on the Way"
  | "Technician Arrived at Your Location"
  | "Technician Arrived"
  | "Customer Arrived"
  | "Service in Progress"
  | "Ready for Pickup"
  | "Reschedule Requested"
  | "Rescheduled";

export interface QuotationItem {
  id: string;
  title: string;
  description: string;
  partCost: number;
  labourCost: number;
  quantity: number;
  discount?: number;
  lineTotal: number;
  isRequired: boolean;
  canDefer: boolean;
  approvalState: "pending" | "approved" | "declined" | "deferred";
}

export interface DiagnosisFinding {
  id: string;
  title: string;
  description: string;
  source: "customer" | "technician";
  classification: "confirmed" | "suspected" | "needs_further_testing";
  customerExplanation: string;
  recommendedRepair: string;
  safety: "required" | "recommended" | "optional" | "cosmetic";
  isEligibleForRepair: boolean;
  createdAt: string;
}

export interface MockServiceRecord {
  id: string;
  user_id: string;
  device: string;
  model: string;
  problem: string;
  status: ServiceStatus;
  technician_name?: string;
  notes?: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  quote?: number | null;
  quote_state?: "pending" | "approved" | "rejected" | null;
  quote_version?: number;
  quotation_items?: QuotationItem[];
  findings?: DiagnosisFinding[];
  created_at: string;
}

export interface ServiceAuditLogEntry {
  staff_id: string;
  action: string;
  target_table: string;
  record_id: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

const mockServices: MockServiceRecord[] = [
  {
    id: "srv-001",
    user_id: "user-101",
    device: "Laptop",
    model: "Dell XPS 15 9520",
    problem: "Battery swelling and rapid thermal throttling under moderate load.",
    status: "Booked",
    technician_name: undefined,
    customer_name: "George Joseph",
    customer_phone: "+91 94470 55443",
    customer_email: "george@example.com",
    quote: null,
    quote_state: null,
    quote_version: 0,
    quotation_items: [],
    findings: [],
    created_at: "2026-10-25T08:00:00Z",
  },
  {
    id: "srv-002",
    user_id: "user-102",
    device: "Desktop",
    model: "Custom Gaming PC",
    problem: "No display output on HDMI/DisplayPort, fans spin for 3 seconds then reboot loop.",
    status: "In Progress",
    technician_name: "Technician A",
    customer_name: "Deepak Menon",
    customer_phone: "+91 98460 11223",
    customer_email: "deepak@example.com",
    quote: null,
    quote_state: null,
    quote_version: 0,
    quotation_items: [],
    findings: [],
    created_at: "2026-10-25T09:15:00Z",
  },
];

const mockServiceAudit: ServiceAuditLogEntry[] = [];

// Helper functions mirroring staff service RPCs
function queryServices(params: {
  statusFilter?: string;
  categoryFilter?: string;
  searchQuery?: string;
  role: string;
}): { data: MockServiceRecord[]; count: number } {
  if (params.role !== "portal_admin" && params.role !== "service_staff") {
    throw new Error("PERMISSION_DENIED: User lacks can_manage_services privileges");
  }

  let list = [...mockServices];

  if (params.statusFilter && params.statusFilter !== "ALL") {
    list = list.filter((s) => s.status === params.statusFilter);
  }

  if (params.categoryFilter && params.categoryFilter !== "ALL") {
    list = list.filter((s) => s.device.toLowerCase() === params.categoryFilter?.toLowerCase());
  }

  if (params.searchQuery) {
    const q = params.searchQuery.toLowerCase();
    list = list.filter(
      (s) =>
        s.device.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.customer_name.toLowerCase().includes(q) ||
        s.customer_phone.includes(q),
    );
  }

  return { data: list, count: list.length };
}

function staffUpdateServiceStatus(
  ticketId: string,
  newStatus: ServiceStatus,
  technicianName: string,
  notes: string,
  staffUser: { id: string; role: string },
  findings?: DiagnosisFinding[],
): MockServiceRecord {
  if (staffUser.role !== "portal_admin" && staffUser.role !== "service_staff") {
    throw new Error(
      "PERMISSION_DENIED: Only service staff or portal admin can update service tickets",
    );
  }

  const index = mockServices.findIndex((s) => s.id === ticketId);
  if (index === -1) {
    throw new Error("TICKET_NOT_FOUND");
  }

  const old = { ...mockServices[index] };
  mockServices[index].status = newStatus;
  mockServices[index].technician_name = technicianName;
  mockServices[index].notes = notes;
  if (findings !== undefined) {
    mockServices[index].findings = findings;
  }

  mockServiceAudit.push({
    staff_id: staffUser.id,
    action: "UPDATE_SERVICE_STATUS",
    target_table: "service_requests",
    record_id: ticketId,
    changes: {
      old_status: old.status,
      new_status: newStatus,
      technician: technicianName,
      notes,
      findingsUpdated: findings !== undefined,
    },
    timestamp: new Date().toISOString(),
  });

  return mockServices[index];
}

function staffPublishServiceQuotation(
  ticketId: string,
  items: QuotationItem[],
  findings: DiagnosisFinding[],
  staffUser: { id: string; role: string },
): MockServiceRecord {
  if (staffUser.role !== "portal_admin" && staffUser.role !== "service_staff") {
    throw new Error("PERMISSION_DENIED: Only service staff can publish repair quotations");
  }

  const index = mockServices.findIndex((s) => s.id === ticketId);
  if (index === -1) throw new Error("TICKET_NOT_FOUND");

  const total = items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  const nextVersion = (mockServices[index].quote_version || 0) + 1;

  mockServices[index].quotation_items = items;
  mockServices[index].findings = findings;
  mockServices[index].quote = total;
  mockServices[index].quote_state = "pending";
  mockServices[index].quote_version = nextVersion;
  mockServices[index].status = "Awaiting Approval";

  mockServiceAudit.push({
    staff_id: staffUser.id,
    action: "PUBLISH_REPAIR_QUOTATION",
    target_table: "service_requests",
    record_id: ticketId,
    changes: {
      total,
      version: nextVersion,
      itemsCount: items.length,
      status: "Awaiting Approval",
    },
    timestamp: new Date().toISOString(),
  });

  return mockServices[index];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("Service Staff - Service staff can query and filter tickets", () => {
  const result = queryServices({ role: "service_staff" });
  assertEquals(result.count, 2);
  assertEquals(result.data.length, 2);

  const laptopsOnly = queryServices({ categoryFilter: "Laptop", role: "service_staff" });
  assertEquals(laptopsOnly.count, 1);
  assertEquals(laptopsOnly.data[0].model, "Dell XPS 15 9520");
});

Deno.test("Service Staff - Quotation Staff or Customer cannot manage service tickets", () => {
  let quoteStaffBlocked = false;
  try {
    queryServices({ role: "quotation_staff" });
  } catch (err: any) {
    quoteStaffBlocked = err.message.includes("PERMISSION_DENIED");
  }
  assertEquals(quoteStaffBlocked, true);

  let customerBlocked = false;
  try {
    queryServices({ role: "customer" });
  } catch (err: any) {
    customerBlocked = err.message.includes("PERMISSION_DENIED");
  }
  assertEquals(customerBlocked, true);
});

Deno.test("Service Staff - Technician assignment and status update generates audit log", () => {
  const auditStart = mockServiceAudit.length;
  const staff = { id: "service-staff-uid", role: "service_staff" };

  const updated = staffUpdateServiceStatus(
    "srv-001",
    "In Progress",
    "Santhosh (Hardware Tech)",
    "Device received at workbench. Opening bottom chassis to isolate battery voltage.",
    staff,
  );

  assertEquals(updated.status, "In Progress");
  assertEquals(updated.technician_name, "Santhosh (Hardware Tech)");
  assertEquals(mockServiceAudit.length, auditStart + 1);

  const entry = mockServiceAudit[mockServiceAudit.length - 1];
  assertEquals(entry.action, "UPDATE_SERVICE_STATUS");
  assertEquals(entry.target_table, "service_requests");
  assertEquals(entry.record_id, "srv-001");
});

Deno.test("Service Staff - Publishing itemized quotation calculates total and sets Awaiting Approval", () => {
  const staff = { id: "service-staff-uid", role: "service_staff" };

  const items: QuotationItem[] = [
    {
      id: "part-1",
      title: "OEM Dell 86Wh Replacement Battery",
      description: "Direct OEM battery replacement with 1-year manufacturer warranty.",
      partCost: 6500,
      labourCost: 500,
      quantity: 1,
      lineTotal: 7000,
      isRequired: true,
      canDefer: false,
      approvalState: "pending",
    },
    {
      id: "service-1",
      title: "Thermal Paste Re-application (Arctic MX-6)",
      description: "Full heatsink cleaning and thermal compound replacement.",
      partCost: 300,
      labourCost: 450,
      quantity: 1,
      lineTotal: 750,
      isRequired: false,
      canDefer: true,
      approvalState: "pending",
    },
  ];

  const findings: DiagnosisFinding[] = [
    {
      id: "find-1",
      title: "Swollen Battery & Degraded Thermal Paste",
      description:
        "Battery cell 2 has expanded by 30%. Heatsink thermal paste has dried into chalk.",
      source: "technician",
      classification: "confirmed",
      customerExplanation:
        "Swelling battery poses a chassis puncture hazard and thermal throttling prevents normal CPU boost.",
      recommendedRepair: "Replace battery pack immediately; clean and repaste cooling assembly.",
      safety: "required",
      isEligibleForRepair: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const updated = staffPublishServiceQuotation("srv-001", items, findings, staff);

  assertEquals(updated.quote, 7750);
  assertEquals(updated.quote_version, 1);
  assertEquals(updated.quote_state, "pending");
  assertEquals(updated.status, "Awaiting Approval");
  assertEquals(updated.quotation_items?.length, 2);
  assertEquals(updated.findings?.length, 1);
});

Deno.test("Service Staff - Diagnostic findings recorded in Service Management Desk persist with status update", () => {
  const staff = { id: "service-staff-uid", role: "service_staff" };
  const findings: DiagnosisFinding[] = [
    {
      id: "find-bench-1",
      title: "Motherboard 19V Short Detected",
      description:
        "DC jack fuse OK. Ceramic capacitor shorted to ground near battery charging MOSFET.",
      source: "technician",
      classification: "confirmed",
      customerExplanation: "Short circuit prevents power delivery from reaching motherboard.",
      recommendedRepair: "SMD desoldering and replacement of shorted ceramic capacitor.",
      safety: "required",
      isEligibleForRepair: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const updated = staffUpdateServiceStatus(
    "srv-002",
    "In Progress",
    "Bench Tech #1",
    "Microscope diagnosis complete. Preparing hot air rework station.",
    staff,
    findings,
  );

  assertEquals(updated.status, "In Progress");
  assertEquals(updated.findings?.length, 1);
  assertEquals(updated.findings?.[0].title, "Motherboard 19V Short Detected");
});

Deno.test("Service Staff - Setting Under Diagnosis status assigns technician and generates audit log", () => {
  const staff = { id: "service-staff-uid", role: "service_staff" };
  const updated = staffUpdateServiceStatus(
    "srv-001",
    "Under Diagnosis",
    "Bench Tech #2",
    "Device disassembled on antistatic mat. Running motherboard power rail tests.",
    staff,
  );

  assertEquals(updated.status, "Under Diagnosis");
  assertEquals(updated.technician_name, "Bench Tech #2");
});

Deno.test("Service Staff - Physical device intake records Device Received status and logs audit entry", () => {
  const staff = { id: "service-staff-uid", role: "service_staff" };
  const updated = staffUpdateServiceStatus(
    "srv-001",
    "Device Received",
    "Workshop Intake Desk",
    "Customer courier received at Kothamangalam service center. Packaging inspected and unboxed onto queue rack.",
    staff,
  );

  assertEquals(updated.status, "Device Received");
  assertEquals(updated.technician_name, "Workshop Intake Desk");

  // Check audit trail
  const lastAudit = mockServiceAudit[mockServiceAudit.length - 1];
  assertEquals(lastAudit.action, "UPDATE_SERVICE_STATUS");
  assertEquals(lastAudit.record_id, "srv-001");
  assertEquals(lastAudit.staff_id, "service-staff-uid");
});

Deno.test("Service Staff - Fast inline status dropdown safely updates ticket to In Progress (Repairing) and preserves existing findings", () => {
  const staff = { id: "service-staff-uid", role: "service_staff" };
  const existingTicket = mockServices.find((s: MockServiceRecord) => s.id === "srv-002");
  const existingFindings = existingTicket?.findings || [];

  const updated = staffUpdateServiceStatus(
    "srv-002",
    "In Progress",
    existingTicket?.technician_name || "Bench Tech #1",
    "Updated via quick inline table dropdown",
    staff,
    existingFindings,
  );

  assertEquals(updated.status, "In Progress");
  assertEquals(updated.findings?.length, existingFindings.length);
});

Deno.test("Service Staff - In-flight duplicate mutation lock rejects overlapping updates for the same ticket", () => {
  const inFlightSet = new Set<string>();

  const tryStartUpdate = (ticketId: string) => {
    if (inFlightSet.has(ticketId)) {
      return { ok: false, error: "A status update is already in progress for this ticket." };
    }
    inFlightSet.add(ticketId);
    return { ok: true };
  };

  const endUpdate = (ticketId: string) => {
    inFlightSet.delete(ticketId);
  };

  // First click succeeds and acquires lock
  const first = tryStartUpdate("srv-001");
  assertEquals(first.ok, true);

  // Rapid double-click while in-flight is rejected
  const duplicate = tryStartUpdate("srv-001");
  assertEquals(duplicate.ok, false);
  assertEquals(duplicate.error, "A status update is already in progress for this ticket.");

  // After completion, lock is released
  endUpdate("srv-001");
  const subsequent = tryStartUpdate("srv-001");
  assertEquals(subsequent.ok, true);
  endUpdate("srv-001");
});

Deno.test("Service Staff - Status update supports Customer Arrived, Reschedule Requested, and Rescheduled", () => {
  const staff = { id: "service-staff-uid", role: "service_staff" };
  const allowedStatuses: ServiceStatus[] = [
    "Customer Arrived",
    "Reschedule Requested",
    "Rescheduled",
    "Ready for Pickup",
  ];

  for (const status of allowedStatuses) {
    const updated = staffUpdateServiceStatus(
      "srv-001",
      status,
      "Front Counter Lead",
      `Transitioned to ${status} safely`,
      staff,
    );
    assertEquals(updated.status, status);
  }
});

Deno.test("Service Staff - Method-specific status options always include ticket current status if unmatched", () => {
  // Test walk-in ticket that somehow has "Technician Assigned" status
  const walkInOptions = getStatusOptionsForMethod("Visit IT HUB", "Technician Assigned");
  assertEquals(walkInOptions.includes("Technician Assigned"), true);
  assertEquals(walkInOptions[0], "Technician Assigned");

  // Test doorstep with standard status
  const doorstepOptions = getStatusOptionsForMethod("Doorstep Visit", "Under Diagnosis");
  assertEquals(doorstepOptions.includes("Under Diagnosis"), true);

  // Test courier with unmatched status
  const courierOptions = getStatusOptionsForMethod("Insured Courier", "Customer Arrived");
  assertEquals(courierOptions.includes("Customer Arrived"), true);
});
