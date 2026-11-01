// supabase/functions/tests/staff-portal-ticket-reference.test.ts
// TDD Test Suite for IT HUB Unified Ticket Reference System & Service Management Alignment

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  isValidTicketReference,
  formatTicketReference,
  normalizeTicketReference,
  matchesTicketSearch,
  getServiceDeskTableColumns,
} from "../../../ITHUB_ADMIN/src/lib/ticketReference.ts";
import { isRescheduleEligible } from "../../../src/lib/serviceReschedule.ts";

Deno.test("REF-1: isValidTicketReference enforces ITH-SER- prefix followed by 8 uppercase alphanumeric chars", () => {
  // Valid references
  assertEquals(isValidTicketReference("ITH-SER-C327B978"), true);
  assertEquals(isValidTicketReference("ITH-SER-00000000"), true);
  assertEquals(isValidTicketReference("ITH-SER-9ABCDEF0"), true);
  assertEquals(isValidTicketReference("ITH-SER-ZZZZZZZZ"), true);

  // Invalid references
  assertEquals(isValidTicketReference("ITH-SER-c327b978"), false, "Lowercase should be rejected");
  assertEquals(
    isValidTicketReference("ITH-SER-C327-978"),
    false,
    "Hyphens inside reference body should be rejected",
  );
  assertEquals(isValidTicketReference("ITH-SER-C327"), false, "Too short should be rejected");
  assertEquals(isValidTicketReference("ITH-SER-C327B9789"), false, "Too long should be rejected");
  assertEquals(
    isValidTicketReference("ITH-TKT-C327B978"),
    false,
    "Invalid prefix should be rejected",
  );
  assertEquals(
    isValidTicketReference("c327b978-2ae9-4ab7-9b5b-e9385c62a7c2"),
    false,
    "Raw UUID should not pass reference validation",
  );
  assertEquals(isValidTicketReference(""), false, "Empty string should be rejected");
});

Deno.test("REF-2: formatTicketReference produces stable ITH-SER-XXXXXXXX from existing reference or UUID", () => {
  // Pass-through if already valid reference
  assertEquals(formatTicketReference("ITH-SER-C327B978"), "ITH-SER-C327B978");

  // Format from raw UUID (c327b978-2ae9-4ab7-9b5b-e9385c62a7c2 -> ITH-SER-C327B978)
  assertEquals(formatTicketReference("c327b978-2ae9-4ab7-9b5b-e9385c62a7c2"), "ITH-SER-C327B978");
  assertEquals(formatTicketReference("8f12a34b-1111-2222-3333-444455556666"), "ITH-SER-8F12A34B");

  // Normalizes lowercase prefix
  assertEquals(formatTicketReference("ith-ser-c327b978"), "ITH-SER-C327B978");

  // Gracefully handles null / undefined / empty
  assertEquals(formatTicketReference(null), "");
  assertEquals(formatTicketReference(undefined), "");
  assertEquals(formatTicketReference(""), "");
});

Deno.test("REF-3: normalizeTicketReference normalizes shorthand user/staff inputs into standard format", () => {
  // Input: 8-char code -> standard reference
  assertEquals(normalizeTicketReference("C327B978"), "ITH-SER-C327B978");
  assertEquals(normalizeTicketReference("c327b978"), "ITH-SER-C327B978");

  // Input: already standard
  assertEquals(normalizeTicketReference("ITH-SER-C327B978"), "ITH-SER-C327B978");
  assertEquals(normalizeTicketReference("ith-ser-c327b978"), "ITH-SER-C327B978");

  // Input: full UUID
  assertEquals(
    normalizeTicketReference("c327b978-2ae9-4ab7-9b5b-e9385c62a7c2"),
    "ITH-SER-C327B978",
  );
});

Deno.test("REF-4: matchesTicketSearch finds tickets by reference, code, UUID, customer name, and problem", () => {
  const sampleTicket = {
    id: "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2",
    ticket_reference: "ITH-SER-C327B978",
    customer_name: "Rahul Verma",
    device: "MacBook Pro M1",
    problem: "Battery replacement required after swelling",
  };

  // Search by full ticket reference
  assertEquals(matchesTicketSearch(sampleTicket, "ITH-SER-C327B978"), true);
  assertEquals(matchesTicketSearch(sampleTicket, "ith-ser-c327b978"), true);

  // Search by 8-char code
  assertEquals(matchesTicketSearch(sampleTicket, "C327B978"), true);
  assertEquals(matchesTicketSearch(sampleTicket, "c327b978"), true);

  // Search by UUID prefix or full UUID
  assertEquals(matchesTicketSearch(sampleTicket, "c327b978-2ae9"), true);
  assertEquals(matchesTicketSearch(sampleTicket, "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2"), true);

  // Search by customer name and details
  assertEquals(matchesTicketSearch(sampleTicket, "Rahul"), true);
  assertEquals(matchesTicketSearch(sampleTicket, "macbook"), true);
  assertEquals(matchesTicketSearch(sampleTicket, "swelling"), true);

  // Negative case
  assertEquals(matchesTicketSearch(sampleTicket, "NonexistentDevice"), false);
  assertEquals(matchesTicketSearch(sampleTicket, "ITH-SER-99999999"), false);
});

Deno.test("REF-5: getServiceDeskTableColumns defines 9 properly proportioned columns without clipping", () => {
  const columns = getServiceDeskTableColumns();

  assertEquals(columns.length, 9, "Desk must define exactly 9 desktop table columns");

  const expectedColumns = [
    { id: "ticket_id", label: "Ticket ID", minRequiredWidth: 145 },
    { id: "device_problem", label: "Device & Problem", minRequiredWidth: 180 },
    { id: "customer_contact", label: "Customer & Contact", minRequiredWidth: 140 },
    { id: "method", label: "Method", minRequiredWidth: 120 },
    { id: "status", label: "Status", minRequiredWidth: 170 },
    { id: "quote_state", label: "Quote & State", minRequiredWidth: 95 },
    { id: "technician", label: "Technician", minRequiredWidth: 110 },
    { id: "booked", label: "Booked", minRequiredWidth: 100 },
    { id: "action", label: "Action", minRequiredWidth: 80 },
  ];

  for (let i = 0; i < expectedColumns.length; i++) {
    const exp = expectedColumns[i];
    const actual = columns[i];
    assertEquals(actual.id, exp.id);
    assertEquals(actual.label, exp.label);
    assertEquals(
      actual.minWidth >= exp.minRequiredWidth,
      true,
      `Column ${exp.id} minWidth (${actual.minWidth}px) must be >= ${exp.minRequiredWidth}px`,
    );
  }
});

Deno.test("REF-6: isRescheduleEligible preserves reschedule restriction strictly to On-site", () => {
  assertEquals(isRescheduleEligible("On-site Technician Visit"), true);
  assertEquals(isRescheduleEligible("Courier"), false);
  assertEquals(isRescheduleEligible("Visit IT HUB"), false);
});

Deno.test("REF-7: generateRandomTicketReference generates collision-resistant valid references", async () => {
  // @ts-ignore
  const { generateRandomTicketReference } =
    await import("../../../ITHUB_ADMIN/src/lib/ticketReference.ts");
  const generated = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const ref = generateRandomTicketReference();
    assertEquals(isValidTicketReference(ref), true);
    assertEquals(ref.startsWith("ITH-SER-"), true);
    assertEquals(ref.length, 16);
    generated.add(ref);
  }
  assertEquals(generated.size, 100, "100 generated references should all be unique");
});

Deno.test("REF-8: backfillTicketReferences safely backfills missing references without altering UUIDs", async () => {
  // @ts-ignore
  const { backfillTicketReferences } =
    await import("../../../ITHUB_ADMIN/src/lib/ticketReference.ts");
  const records = [
    { id: "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2", ticket_reference: null },
    { id: "8f12a34b-1111-2222-3333-444455556666", ticket_reference: "ITH-SER-EXIST001" },
    { id: "12345678-aaaa-bbbb-cccc-ddddeeeeffff", ticket_reference: undefined },
  ];

  const backfilled = backfillTicketReferences(records);

  // Original UUIDs preserved
  assertEquals(backfilled[0].id, "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2");
  assertEquals(backfilled[1].id, "8f12a34b-1111-2222-3333-444455556666");
  assertEquals(backfilled[2].id, "12345678-aaaa-bbbb-cccc-ddddeeeeffff");

  // Missing references populated
  assertEquals(backfilled[0].ticket_reference, "ITH-SER-C327B978");
  // Existing reference untouched
  assertEquals(backfilled[1].ticket_reference, "ITH-SER-EXIST001");
  // Third reference populated
  assertEquals(backfilled[2].ticket_reference, "ITH-SER-12345678");
});

Deno.test("REF-9: applyTicketUpdate immutably preserves ticket_reference during updates", async () => {
  // @ts-ignore
  const { applyTicketUpdate } = await import("../../../ITHUB_ADMIN/src/lib/ticketReference.ts");
  const original = {
    id: "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2",
    ticket_reference: "ITH-SER-C327B978",
    status: "Booked",
    technician_name: null as string | null,
  };

  const updated = applyTicketUpdate(original, {
    status: "In Progress",
    technician_name: "Kiran Kumar",
    ticket_reference: "ITH-SER-MUTATEDD", // Malicious attempt to mutate reference
  });

  assertEquals(updated.status, "In Progress");
  assertEquals(updated.technician_name, "Kiran Kumar");
  assertEquals(updated.ticket_reference, "ITH-SER-C327B978", "Reference must be immutable");
});

Deno.test("REF-10: resolveTicketByReferenceOrId resolves both reference and legacy UUID to same record", async () => {
  // @ts-ignore
  const { resolveTicketByReferenceOrId } =
    await import("../../../ITHUB_ADMIN/src/lib/ticketReference.ts");
  const dataset = [
    {
      id: "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2",
      ticket_reference: "ITH-SER-C327B978",
      customer_name: "Rahul",
    },
    {
      id: "98765432-1111-2222-3333-444455556666",
      ticket_reference: "ITH-SER-98765432",
      customer_name: "Sneha",
    },
  ];

  // Lookup by full reference
  const byRef = resolveTicketByReferenceOrId(dataset, "ITH-SER-C327B978");
  assertEquals(byRef?.id, "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2");

  // Lookup by reference lowercase
  const byRefLower = resolveTicketByReferenceOrId(dataset, "ith-ser-c327b978");
  assertEquals(byRefLower?.id, "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2");

  // Lookup by 8-char code
  const byCode = resolveTicketByReferenceOrId(dataset, "C327B978");
  assertEquals(byCode?.id, "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2");

  // Lookup by legacy full UUID
  const byUuid = resolveTicketByReferenceOrId(dataset, "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2");
  assertEquals(byUuid?.ticket_reference, "ITH-SER-C327B978");

  // Lookup non-existent
  assertEquals(resolveTicketByReferenceOrId(dataset, "UNKNOWN-REF"), null);
});

Deno.test("REF-11: buildTicketTrackingUrl generates consistent deep links using ticket_reference", async () => {
  // @ts-ignore
  const { buildTicketTrackingUrl } =
    await import("../../../ITHUB_ADMIN/src/lib/ticketReference.ts");
  const ticket = {
    id: "c327b978-2ae9-4ab7-9b5b-e9385c62a7c2",
    ticket_reference: "ITH-SER-C327B978",
  };

  const portalUrl = buildTicketTrackingUrl("https://admin.ithub.com/services", ticket);
  assertEquals(portalUrl, "https://admin.ithub.com/services?ticket=ITH-SER-C327B978");

  const siteUrl = buildTicketTrackingUrl("https://ithub.com/services", ticket);
  assertEquals(siteUrl, "https://ithub.com/services?ticket=ITH-SER-C327B978");
});

Deno.test("REF-12: getDeskTableCellClass ensures vertical centering and alignment for all columns", async () => {
  // @ts-ignore
  const { getDeskTableCellClass } = await import("../../../ITHUB_ADMIN/src/lib/ticketReference.ts");
  const ticketIdClass = getDeskTableCellClass("ticket_id");
  assertEquals(ticketIdClass.includes("align-middle"), true);
  assertEquals(ticketIdClass.includes("font-mono"), true);

  const methodClass = getDeskTableCellClass("method");
  assertEquals(methodClass.includes("align-middle"), true);

  const statusClass = getDeskTableCellClass("status");
  assertEquals(statusClass.includes("align-middle"), true);

  const actionClass = getDeskTableCellClass("action");
  assertEquals(actionClass.includes("text-right"), true);
});
