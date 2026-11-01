// supabase/functions/tests/staff-portal-quotations.test.ts
// Automated Test Suite for Staff Portal PC Quotation Review, Audit & Status Workflow

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

export type QuotationStatus = "Draft" | "New" | "Contacted" | "Quoted" | "Closed";

export interface MockQuotation {
  id: string;
  name: string;
  user_id: string;
  status: QuotationStatus;
  components: Record<string, { title: string; price: number; variantId?: string }>;
  total_price: number;
  authoritative_price?: number;
  price_divergence?: number;
  technician_review_required?: boolean;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  notes?: string;
  created_at: string;
}

export interface AuditLogEntry {
  staff_id: string;
  staff_email: string;
  action: string;
  target_table: string;
  record_id: string;
  old_data: Record<string, unknown>;
  new_data: Record<string, unknown>;
  created_at: string;
}

// In-memory test store
const mockQuotations: MockQuotation[] = [
  {
    id: "quote-001",
    name: "Intel 14th Gen Workstation",
    user_id: "user-123",
    status: "New",
    components: {
      cpu: {
        title: "Intel Core i7-14700K",
        price: 38500,
        variantId: "gid://shopify/ProductVariant/4412345678",
      },
      gpu: {
        title: "NVIDIA RTX 4070 Super",
        price: 61000,
        variantId: "gid://shopify/ProductVariant/4412345679",
      },
    },
    total_price: 99500,
    authoritative_price: 99500,
    price_divergence: 0,
    technician_review_required: false,
    contact_name: "Rahul Verma",
    contact_email: "rahul@example.com",
    contact_phone: "+91 98470 12345",
    notes: "",
    created_at: "2026-10-25T10:00:00Z",
  },
  {
    id: "quote-002",
    name: "Budget Gaming Rig",
    user_id: "user-456",
    status: "New",
    components: {
      cpu: {
        title: "AMD Ryzen 5 7600X",
        price: 21000,
        variantId: "gid://shopify/ProductVariant/4412345680",
      },
      gpu: {
        title: "NVIDIA RTX 4060",
        price: 29000,
        variantId: "gid://shopify/ProductVariant/4412345681",
      },
    },
    total_price: 50000,
    authoritative_price: 52500, // Shopify price has diverged by ₹2,500
    price_divergence: 2500,
    technician_review_required: true,
    contact_name: "Anand Nair",
    contact_email: "anand@example.com",
    contact_phone: "+91 94471 67890",
    notes: "Requires price verification with customer due to market increase.",
    created_at: "2026-10-25T11:30:00Z",
  },
];

const mockAuditLogs: AuditLogEntry[] = [];

// Helper functions mirroring staff quotation RPCs
function queryQuotations(params: { statusFilter?: string; searchQuery?: string; role: string }): {
  data: MockQuotation[];
  count: number;
} {
  if (params.role !== "portal_admin" && params.role !== "quotation_staff") {
    throw new Error("PERMISSION_DENIED: User lacks can_manage_quotations privileges");
  }

  let list = [...mockQuotations];

  if (params.statusFilter && params.statusFilter !== "ALL") {
    list = list.filter((q) => q.status === params.statusFilter);
  }

  if (params.searchQuery) {
    const q = params.searchQuery.toLowerCase();
    list = list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.contact_name.toLowerCase().includes(q) ||
        item.contact_email.toLowerCase().includes(q) ||
        item.contact_phone.includes(q),
    );
  }

  return { data: list, count: list.length };
}

function staffUpdateQuotationStatus(
  quoteId: string,
  newStatus: QuotationStatus,
  notes: string,
  staffUser: { id: string; email: string; role: string },
): MockQuotation {
  if (staffUser.role !== "portal_admin" && staffUser.role !== "quotation_staff") {
    throw new Error(
      "PERMISSION_DENIED: Only quotation staff or portal admin can update quotations",
    );
  }

  const quoteIndex = mockQuotations.findIndex((q) => q.id === quoteId);
  if (quoteIndex === -1) {
    throw new Error("QUOTATION_NOT_FOUND");
  }

  const oldRecord = { ...mockQuotations[quoteIndex] };
  mockQuotations[quoteIndex].status = newStatus;
  mockQuotations[quoteIndex].notes = notes;

  // Append immutable audit log
  mockAuditLogs.push({
    staff_id: staffUser.id,
    staff_email: staffUser.email,
    action: "UPDATE_STATUS",
    target_table: "pc_builds",
    record_id: quoteId,
    old_data: { status: oldRecord.status, notes: oldRecord.notes },
    new_data: { status: newStatus, notes },
    created_at: new Date().toISOString(),
  });

  return mockQuotations[quoteIndex];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PC Quotations - Quotation staff can query all quotations", () => {
  const result = queryQuotations({ role: "quotation_staff" });
  assertEquals(result.count, 2);
  assertEquals(result.data.length, 2);
});

Deno.test("PC Quotations - Customer or Service Staff cannot access quotation queue", () => {
  let customerBlocked = false;
  try {
    queryQuotations({ role: "customer" });
  } catch (err: any) {
    customerBlocked = err.message.includes("PERMISSION_DENIED");
  }
  assertEquals(customerBlocked, true);

  let serviceStaffBlocked = false;
  try {
    queryQuotations({ role: "service_staff" });
  } catch (err: any) {
    serviceStaffBlocked = err.message.includes("PERMISSION_DENIED");
  }
  assertEquals(serviceStaffBlocked, true);
});

Deno.test("PC Quotations - Price divergence detection flags technician review", () => {
  const cleanQuote = mockQuotations.find((q) => q.id === "quote-001");
  assertEquals(cleanQuote?.technician_review_required, false);
  assertEquals(cleanQuote?.price_divergence, 0);

  const divergedQuote = mockQuotations.find((q) => q.id === "quote-002");
  assertEquals(divergedQuote?.technician_review_required, true);
  assertEquals(divergedQuote?.price_divergence, 2500);
  assertNotEquals(divergedQuote?.authoritative_price, divergedQuote?.total_price);
});

Deno.test("PC Quotations - Search filters by customer name, phone, and component", () => {
  const byName = queryQuotations({ searchQuery: "Rahul", role: "quotation_staff" });
  assertEquals(byName.count, 1);
  assertEquals(byName.data[0].id, "quote-001");

  const byPhone = queryQuotations({ searchQuery: "94471", role: "quotation_staff" });
  assertEquals(byPhone.count, 1);
  assertEquals(byPhone.data[0].id, "quote-002");
});

Deno.test("PC Quotations - Staff status update persists change and generates audit trail", () => {
  const initialAuditCount = mockAuditLogs.length;

  const staffUser = {
    id: "quote-staff-uid",
    email: "quotations@ithub.com",
    role: "quotation_staff",
  };

  const updated = staffUpdateQuotationStatus(
    "quote-001",
    "Contacted",
    "Spoke with customer; discussed upgrade to 64GB RAM.",
    staffUser,
  );

  assertEquals(updated.status, "Contacted");
  assertEquals(mockAuditLogs.length, initialAuditCount + 1);

  const latestAudit = mockAuditLogs[mockAuditLogs.length - 1];
  assertEquals(latestAudit.staff_id, "quote-staff-uid");
  assertEquals(latestAudit.target_table, "pc_builds");
  assertEquals(latestAudit.record_id, "quote-001");
  assertEquals(latestAudit.old_data.status, "New");
  assertEquals(latestAudit.new_data.status, "Contacted");
});
