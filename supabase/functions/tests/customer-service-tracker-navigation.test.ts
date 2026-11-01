// supabase/functions/tests/customer-service-tracker-navigation.test.ts
// Test-Driven Development (TDD) Suite for Customer Profile -> Services -> Track Service Bug Fix
// Verifies stable navigation, single mount, infinite fetch loop prevention,
// ticket reference resolution, and back-navigation stability.

import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveTicketByReferenceOrId,
  formatTicketReference,
} from "../../../src/lib/ticketReference.ts";

const ACCOUNT_PAGE_PATH = "src/pages/Account.tsx";
const SERVICES_PAGE_PATH = "src/pages/Services.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// 1. DATA SYNCHRONIZATION ON ACCOUNT PROFILE
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("TRACK-NAV-1: Account.tsx fetches user service requests on login using fetchUserServiceRequests", () => {
  const content = Deno.readTextFileSync(ACCOUNT_PAGE_PATH);

  // Must import fetchUserServiceRequests
  assertMatch(
    content,
    /import\s*\{[^}]*fetchUserServiceRequests[^}]*\}\s*from\s*["']\.\.\/lib\/services["']/,
    "Account.tsx must import fetchUserServiceRequests from services lib",
  );

  // Must call fetchUserServiceRequests when user is logged in
  assertMatch(
    content,
    /fetchUserServiceRequests\(\)/,
    "Account.tsx must invoke fetchUserServiceRequests() to populate user tickets",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. TICKET LINKING FROM ACCOUNT SERVICES SECTION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("TRACK-NAV-2: Account.tsx deep-links service request to /track-service/:ticketReference", () => {
  const content = Deno.readTextFileSync(ACCOUNT_PAGE_PATH);

  // Must navigate to /track-service with canonical ticket reference
  assertMatch(
    content,
    /\/track-service\/\$\{encodeURIComponent\(request\.ticketReference\s*\|\|\s*formatTicketReference\(request\.id\)\)\}/,
    "Account.tsx must generate tracking links using ticketReference",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TICKET REFERENCE RESOLUTION IN SERVICETRACKING
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("TRACK-NAV-3: ServiceTracking resolves request using resolveTicketByReferenceOrId without mismatching UUID vs ticket_reference", () => {
  const content = Deno.readTextFileSync(SERVICES_PAGE_PATH);

  // Must import resolveTicketByReferenceOrId
  assertMatch(
    content,
    /resolveTicketByReferenceOrId/,
    "Services.tsx must import and use resolveTicketByReferenceOrId",
  );

  // Must NOT find request solely by item.id === id
  const hasNaiveFind =
    /const\s+request\s*=\s*store\.requests\.find\(\s*\([^)]*\)\s*=>\s*item\.id\s*===\s*id\s*\)/.test(
      content,
    );
  assertEquals(
    hasNaiveFind,
    false,
    "Services.tsx must not use naive item.id === id matching because id in URL is ticketReference",
  );

  // Unit verification of resolveTicketByReferenceOrId
  const mockTickets = [
    {
      id: "c327b978-8316-4351-9da2-a42907409c95",
      ticketReference: "ITH-SER-C327B978",
      customer_name: "Rahul Nair",
    },
    {
      id: "a1b2c3d4-0000-0000-0000-000000000000",
      ticketReference: "ITH-SER-A1B2C3D4",
      customer_name: "Anita Varma",
    },
  ];

  // Lookup by ticket reference
  const byRef = resolveTicketByReferenceOrId(mockTickets, "ITH-SER-C327B978");
  assertEquals(byRef?.id, "c327b978-8316-4351-9da2-a42907409c95");

  // Lookup by lowercase reference
  const byLower = resolveTicketByReferenceOrId(mockTickets, "ith-ser-c327b978");
  assertEquals(byLower?.id, "c327b978-8316-4351-9da2-a42907409c95");

  // Lookup by code suffix alone
  const bySuffix = resolveTicketByReferenceOrId(mockTickets, "C327B978");
  assertEquals(bySuffix?.id, "c327b978-8316-4351-9da2-a42907409c95");

  // Lookup by legacy full UUID
  const byUuid = resolveTicketByReferenceOrId(mockTickets, "c327b978-8316-4351-9da2-a42907409c95");
  assertEquals(byUuid?.ticketReference, "ITH-SER-C327B978");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. INFINITE LOOP AND FLICKER PREVENTION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("TRACK-NAV-4: ServiceTracking guards remote fetch with single-attempt tracking to prevent infinite fetch and flicker loops", () => {
  const content = Deno.readTextFileSync(SERVICES_PAGE_PATH);

  // Must use a ref or tracker to record attempted fetch IDs
  assertMatch(
    content,
    /fetchedRef|fetchAttemptedRef|lastFetchedIdRef/,
    "Services.tsx must use a ref to prevent re-fetching the same ID indefinitely",
  );

  // Must not have isFetchingRemote as an unshielded effect trigger that cycles
  const hasVulnerableEffect =
    /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?fetchServiceRequestById[\s\S]*?\}\s*,\s*\[\s*id\s*,\s*request\s*,\s*isFetchingRemote\s*\]\s*\)/.test(
      content,
    );
  assertEquals(
    hasVulnerableEffect,
    false,
    "Services.tsx must not include isFetchingRemote in effect dependencies without attempt guards",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. INPUT SEARCH QUERY SYNCHRONIZATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("TRACK-NAV-5: ServiceTracking synchronizes search input query with route :id parameter", () => {
  const content = Deno.readTextFileSync(SERVICES_PAGE_PATH);

  // Must sync query state when id changes
  assertMatch(
    content,
    /setQuery\([^)]*id[^)]*\)/,
    "Services.tsx must update input query when route id changes",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. CANONICAL TICKET REFERENCE DISPLAY IN HEADER
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("TRACK-NAV-6: ServiceTracking displays canonical ticketReference in ticket header", () => {
  const content = Deno.readTextFileSync(SERVICES_PAGE_PATH);

  // Must display ticketReference in ticket header rather than raw UUID safeData.id
  assertMatch(
    content,
    /safeData\.ticketReference/,
    "Services.tsx must display safeData.ticketReference in the ticket overview header",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. BACK NAVIGATION STABILITY
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("TRACK-NAV-7: ServiceTracking includes back navigation link to /account/services", () => {
  const content = Deno.readTextFileSync(SERVICES_PAGE_PATH);

  // Must include a back link to /account/services
  assertMatch(
    content,
    /to=["']\/account\/services["']/,
    "Services.tsx must render a back navigation link to /account/services",
  );
});
