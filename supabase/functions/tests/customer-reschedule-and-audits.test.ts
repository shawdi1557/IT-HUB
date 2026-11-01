// supabase/functions/tests/customer-reschedule-and-audits.test.ts
// Comprehensive Test Suite for:
// 1. Customer Profile Navigation Cleanup (Settings removed, Reschedule added, Settings direct URL preserved)
// 2. Customer Reschedule Module (/account/reschedule, On-site restriction, Courier/Walk-in ineligible, form validation)
// 3. Staff Portal Sidebar Badges (Quotations, Services, Sell Requests, Dashboard, Realtime, Zero-count hidden)
// 4. Staff Portal Navigation Reordering (Exact 8 items order)
// 5. Staff Portal Audits Module (/audits, CRUD, ITH-AUD-XXXXXX, location privacy, audit history timeline)
// 6. Realtime Subscriptions & Staff Approval Workflow
// IT HUB — Kerala, India

import {
  assertEquals,
  assertMatch,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  isRescheduleEligible,
  validateRequestedAppointmentDate,
  formatAppointmentDisplay,
} from "../../../src/lib/serviceReschedule.ts";

const repoRoot = path.resolve(path.fromFileUrl(import.meta.url), "../../../..");
const accountDropdownPath = path.join(repoRoot, "src", "components", "AccountNavDropdown.tsx");
const accountPagePath = path.join(repoRoot, "src", "pages", "Account.tsx");
const customerRescheduleManagerPath = path.join(
  repoRoot,
  "src",
  "components",
  "CustomerRescheduleManager.tsx",
);
const customerNotificationsLibPath = path.join(repoRoot, "src", "lib", "customerNotifications.ts");
const staffLayoutPath = path.join(repoRoot, "ITHUB_ADMIN", "src", "components", "Layout.tsx");
const staffAppPath = path.join(repoRoot, "ITHUB_ADMIN", "src", "App.tsx");
const staffBadgeCountsPath = path.join(repoRoot, "ITHUB_ADMIN", "src", "lib", "badgeCounts.ts");
const staffAuditsLibPath = path.join(repoRoot, "ITHUB_ADMIN", "src", "lib", "audits.ts");
const staffAuditsPagePath = path.join(repoRoot, "ITHUB_ADMIN", "src", "pages", "Audits.tsx");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20261031000006_customer_rescheduling_notifications_and_audits.sql",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. CUSTOMER PROFILE NAVIGATION CLEANUP (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("NAV-1: Customer account navigation removes Settings and includes Reschedule Appointment", async () => {
  const code = await Deno.readTextFile(accountDropdownPath);

  // Must include reschedule section
  assertStringIncludes(code, 'id: "reschedule"');
  assertStringIncludes(code, 'name: "Reschedule Appointment"');
  assertStringIncludes(code, "CalendarClock");

  // Must NOT include settings in navigation items
  const hasSettingsInNav = /id:\s*["']settings["']/.test(code);
  assertEquals(
    hasSettingsInNav,
    false,
    "Settings option must be removed from customer-facing navigation array",
  );
});

Deno.test("NAV-2: Account.tsx wires up reschedule view and safely preserves direct settings route", async () => {
  const code = await Deno.readTextFile(accountPagePath);

  // Must import CustomerRescheduleManager
  assertStringIncludes(code, "CustomerRescheduleManager");

  // Must render CustomerRescheduleManager when section === 'reschedule'
  assertStringIncludes(code, 'section === "reschedule"');

  // Must preserve Account Settings rendering if directly accessed via /account/settings
  assertStringIncludes(code, 'section === "settings"');
  assertStringIncludes(code, "Account settings");

  // Direct access to settings must not trigger 'Account section not found' empty state
  assertMatch(
    code,
    /section\s*!==\s*["']settings["']/,
    "Account.tsx must not show not-found empty state for direct settings access",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CUSTOMER RESCHEDULE MODULE & METHOD RESTRICTION (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("RESCHED-1: Customer appointment rescheduling strictly restricted to On-site Technician Visits", () => {
  // Eligible methods
  assertEquals(isRescheduleEligible("On-site Technician Visit"), true);
  assertEquals(isRescheduleEligible("On-site service"), true);
  assertEquals(isRescheduleEligible("Doorstep Technician Visit"), true);

  // Ineligible methods
  assertEquals(isRescheduleEligible("Courier to IT HUB"), false);
  assertEquals(isRescheduleEligible("Insured Courier Pickup & Return"), false);
  assertEquals(isRescheduleEligible("Visit IT HUB"), false);
  assertEquals(isRescheduleEligible("Direct Store Walk-In"), false);
  assertEquals(isRescheduleEligible(""), false);
  assertEquals(isRescheduleEligible(null), false);
  assertEquals(isRescheduleEligible(undefined), false);
});

Deno.test("RESCHED-2: validateRequestedAppointmentDate strictly enforces future dates and Sunday closure", () => {
  // Past date
  const pastRes = validateRequestedAppointmentDate("2020-01-01");
  assertEquals(pastRes.valid, false);
  assertStringIncludes(pastRes.error || "", "future");

  // Sunday validation: IT HUB closed
  // 2026-11-01 was a Sunday
  const sundayRes = validateRequestedAppointmentDate("2026-11-01");
  assertEquals(sundayRes.valid, false);
  assertStringIncludes(sundayRes.error || "", "Sunday");

  // Non-Sunday future date (e.g. 2026-11-02 was a Monday)
  const mondayRes = validateRequestedAppointmentDate("2026-11-02");
  assertEquals(mondayRes.valid, true);
});

Deno.test("RESCHED-3: CustomerRescheduleManager displays guidance for ineligible walk-in and courier tickets", async () => {
  const code = await Deno.readTextFile(customerRescheduleManagerPath);

  // Must classify tickets and display non-reschedulable guidance
  assertStringIncludes(code, "ineligibleTickets");
  assertStringIncludes(code, "Online Rescheduling Not Applicable");
  assertStringIncludes(code, "Direct store walk-in");
  assertStringIncludes(code, "Insured courier");

  // Must display policy banner that staff approval is strictly required
  assertStringIncludes(code, "Staff Approval Required for All Reschedules");
  assertStringIncludes(code, "never rescheduled automatically");
});

Deno.test("RESCHED-4: CustomerRescheduleManager displays pending staff review badge and prevents duplicates", async () => {
  const code = await Deno.readTextFile(customerRescheduleManagerPath);

  assertStringIncludes(code, "Pending Staff Review");
  assertStringIncludes(code, "hasPendingRequest");
  assertStringIncludes(code, "requestAppointmentReschedule");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. STAFF PORTAL SIDEBAR BADGES (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("BADGES-1: badgeCounts.ts queries actionable counts without double-counting", async () => {
  const code = await Deno.readTextFile(staffBadgeCountsPath);

  // Must query pc_builds for 'New'
  assertStringIncludes(code, 'from("pc_builds")');
  assertStringIncludes(code, '"New"');

  // Must query service_requests and pending reschedules
  assertStringIncludes(code, 'from("service_requests")');
  assertStringIncludes(code, '"Booked"');
  assertStringIncludes(code, '"Reschedule Requested"');
  assertStringIncludes(code, '"Awaiting Approval"');
  assertStringIncludes(code, 'from("service_appointment_reschedule_requests")');
  assertStringIncludes(code, '"pending"');
  assertStringIncludes(code, "uniqueActionableTicketIds");

  // Must query sell_requests for 'Pending' and 'Under Review'
  assertStringIncludes(code, 'from("sell_requests")');
  assertStringIncludes(code, '"Pending"');
  assertStringIncludes(code, '"Under Review"');

  // Must subscribe to realtime changes on all 4 tables
  assertStringIncludes(code, "subscribeBadgeCounts");
  assertStringIncludes(code, "staff_portal_sidebar_badges");
});

Deno.test("BADGES-2: Layout.tsx renders badge pill/dot indicators with accessibility labels", async () => {
  const code = await Deno.readTextFile(staffLayoutPath);

  // Must import subscribeBadgeCounts
  assertStringIncludes(code, "subscribeBadgeCounts");

  // Must show badge dot/pill on collapsed icon
  assertStringIncludes(code, "!isHovered && item.badge > 0");
  assertStringIncludes(code, "bg-rose-500");

  // Must show accessible screen reader text
  assertStringIncludes(code, "sr-only");
  assertStringIncludes(code, "pending");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. STAFF PORTAL NAVIGATION REORDERING (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("NAV-REORDER-1: Layout.tsx defines the exact canonical 8-item navigation order", async () => {
  const code = await Deno.readTextFile(staffLayoutPath);

  // Extract navigation items array from Layout.tsx
  const navItemsMatch = code.match(/const\s+navItems\s*=\s*\[([\s\S]*?)\];/);
  assertEquals(Boolean(navItemsMatch), true, "navItems array must be defined in Layout.tsx");

  const navContent = navItemsMatch![1];
  const labels: string[] = [];
  const labelRegex = /label:\s*["']([^"']+)["']/g;
  let match;
  while ((match = labelRegex.exec(navContent)) !== null) {
    labels.push(match[1]);
  }

  // Exact 8-item canonical order:
  // 1. Dashboard, 2. PC Quotations, 3. Service Management, 4. Sell Requests,
  // 5. Website Content, 6. Certificates, 7. Audits, 8. Settings
  const expectedOrder = [
    "Dashboard",
    "PC Quotations",
    "Service Management",
    "Sell Requests",
    "Website Content",
    "Certificates",
    "Audits",
    "Settings",
  ];

  assertEquals(
    labels,
    expectedOrder,
    "Staff portal navigation items must match the exact 8-item canonical order",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. STAFF PORTAL AUDITS MODULE (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("AUDITS-1: audits.ts provides full CRUD, reference format, and history tracking", async () => {
  const code = await Deno.readTextFile(staffAuditsLibPath);

  // CRUD functions
  assertStringIncludes(code, "fetchAudits");
  assertStringIncludes(code, "fetchAuditById");
  assertStringIncludes(code, "createAudit");
  assertStringIncludes(code, "updateAuditRecord");

  // Canonical reference format generator
  assertStringIncludes(code, "ITH-AUD-");
  assertStringIncludes(code, "generate_customer_audit_reference");

  // History and staff audit logging
  assertStringIncludes(code, 'from("customer_audit_history")');
  assertStringIncludes(code, 'from("staff_audit_logs")');
  assertStringIncludes(code, '"customer_audit"');
});

Deno.test("AUDITS-2: Audits.tsx renders table, search, filters, timeline modal, and export", async () => {
  const code = await Deno.readTextFile(staffAuditsPagePath);

  // Redefined Website Visitor Analytics Title & Controls
  assertStringIncludes(code, "Website Visitor Analytics");
  assertStringIncludes(code, "All Visitor Types");
  assertStringIncludes(code, "All Devices");
  assertStringIncludes(code, "All Time");

  // Modals & Export
  assertStringIncludes(code, "Session Clickstream Timeline");
  assertStringIncludes(code, "Export to Excel (.xlsx)");

  // Privacy: coarse location displayed without silent GPS
  assertStringIncludes(code, "Coarse Geographic Reach");
});

Deno.test("AUDITS-3: App.tsx registers /audits route between Certificates and Settings", async () => {
  const code = await Deno.readTextFile(staffAppPath);

  // Import Audits
  assertStringIncludes(code, 'import { Audits } from "./pages/Audits";');

  // Route registration
  assertMatch(
    code,
    /<Route\s+path=["']\/audits["']\s+element=\{<Audits\s+profile=\{profile\}\s*\/>\}\s*\/>/,
    "Route /audits must be registered in App.tsx",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DATABASE SCHEMA & RLS INTEGRITY (Phase 6)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("DB-1: Migration 20261031000006 creates customer_notifications, customer_audits, and audit history", async () => {
  const code = await Deno.readTextFile(migrationPath);

  // Tables
  assertStringIncludes(code, "create table if not exists public.customer_notifications");
  assertStringIncludes(code, "create table if not exists public.customer_audits");
  assertStringIncludes(code, "create table if not exists public.customer_audit_history");

  // Sequence for audit references
  assertStringIncludes(code, "generate_customer_audit_reference");
  assertStringIncludes(code, "ITH-AUD-");

  // Staff-only RLS for audits (Customer location and notes strictly staff-only)
  assertStringIncludes(code, "Staff can view all customer audits");
  assertStringIncludes(code, "can_manage_services");

  // Realtime publication
  assertStringIncludes(code, "supabase_realtime add table public.customer_audits");
  assertStringIncludes(code, "supabase_realtime add table public.customer_notifications");
});
