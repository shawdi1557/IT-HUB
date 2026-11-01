// supabase/functions/tests/staff-portal-status-dropdown.test.ts
// Test-Driven Development (TDD) Suite for Phase 5: Service Desk Status Filter Dropdown
// IT HUB — Kerala, India

import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const repoRoot = path.resolve(path.fromFileUrl(import.meta.url), "../../../..");
const servicesPagePath = path.join(repoRoot, "ITHUB_ADMIN", "src", "pages", "Services.tsx");

Deno.test("DESK-DROPDOWN-1: Services.tsx removes the horizontal scrollable status filter button strip", () => {
  const content = Deno.readTextFileSync(servicesPagePath);

  // The previous horizontal scroll status bar had:
  // <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-xs font-bold scrollbar-thin">
  const hasHorizontalScrollStatusBar =
    /<div[^>]*flex[^>]*overflow-x-auto[^>]*bg-slate-100[^>]*p-1[^>]*>\s*\{statusFilters\.map/i.test(
      content,
    ) || /statusFilters\.map\(\(tab\)\s*=>\s*\(<button[^>]*whitespace-nowrap/i.test(content);
  assertEquals(
    hasHorizontalScrollStatusBar,
    false,
    "Services.tsx must not contain horizontally scrollable status filter buttons bar",
  );
});

Deno.test("DESK-DROPDOWN-2: Services.tsx implements compact status filter dropdown with full status support", () => {
  const content = Deno.readTextFileSync(servicesPagePath);

  // Dropdown selector trigger or combobox
  assertMatch(
    content,
    /aria-label=["']Filter tickets by status["']|role=["']combobox["']|statusDropdown/i,
    "Services.tsx must include a status dropdown selector",
  );

  // Chevron indicator for dropdown
  assertMatch(content, /ChevronDown/i, "Status dropdown must render chevron icon");

  // All canonical status filters must be defined
  const requiredStatuses = [
    "All Tickets",
    "Booked",
    "Tech Assigned",
    "Device Received",
    "Under Diagnosis",
    "In Progress",
    "Diagnosis Done",
    "Awaiting Approval",
    "Ready for Pickup",
    "Completed",
    "Delivered",
  ];
  for (const st of requiredStatuses) {
    assertMatch(content, new RegExp(st, "i"), `Status dropdown must support: ${st}`);
  }

  // Preservation of other controls
  assertMatch(content, /Intake Method:/i, "Must preserve Intake Method filters");
  assertMatch(content, /All Methods/i, "Must preserve All Methods button");
  assertMatch(content, /Courier/i, "Must preserve Courier button");
  assertMatch(content, /On-site/i, "Must preserve On-site button");
  assertMatch(content, /Visit IT HUB/i, "Must preserve Visit IT HUB button");
  assertMatch(content, /Category:/i, "Must preserve Category filter row");
  assertMatch(content, /Search by ticket ref/i, "Must preserve ticket search input");
  assertMatch(content, /Refresh/i, "Must preserve refresh button");
});
