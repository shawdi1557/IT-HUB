// supabase/functions/tests/staff-portal-responsive-ui.test.ts
// TDD Test Suite for Staff Portal Responsive UI/UX Redesign Helpers & Layout Logic

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  getPageTitle,
  formatCurrencyINR,
  calculateQuotationItemTotal,
  calculateQuotationGrandTotal,
  getMobileStatusBadgeClass,
  truncateText,
} from "../../../ITHUB_ADMIN/src/lib/uiHelpers.ts";

Deno.test("UI-1: getPageTitle resolves accurate page titles from routing pathnames", () => {
  assertEquals(getPageTitle("/"), "Dashboard");
  assertEquals(getPageTitle("/quotations"), "PC Quotations");
  assertEquals(getPageTitle("/services"), "Service Management");
  assertEquals(getPageTitle("/services?ticket=123"), "Service Management");
  assertEquals(getPageTitle("/content"), "Website Content");
  assertEquals(getPageTitle("/certificates"), "Certificates");
  assertEquals(getPageTitle("/reviews"), "Staff Portal"); // Removed customer reviews route defaults to Staff Portal
  assertEquals(getPageTitle("/sell-requests"), "Sell Requests");
  assertEquals(getPageTitle("/settings"), "Settings");
  assertEquals(getPageTitle("/unknown-route"), "Staff Portal");
});

Deno.test("UI-2: formatCurrencyINR formats Indian Rupee values with proper symbol and formatting", () => {
  assertEquals(formatCurrencyINR(0), "₹0");
  assertEquals(formatCurrencyINR(250), "₹250");
  assertEquals(formatCurrencyINR(15000), "₹15,000");
  assertEquals(formatCurrencyINR(null), "—");
  assertEquals(formatCurrencyINR(undefined), "—");
});

Deno.test("UI-3: calculateQuotationItemTotal computes (partCost + labourCost) * quantity", () => {
  const item1 = { partCost: 500, labourCost: 200, quantity: 1 };
  assertEquals(calculateQuotationItemTotal(item1), 700);

  const item2 = { partCost: 1200, labourCost: 300, quantity: 2 };
  assertEquals(calculateQuotationItemTotal(item2), 3000);

  const item3 = { partCost: 0, labourCost: 350, quantity: 1 };
  assertEquals(calculateQuotationItemTotal(item3), 350);
});

Deno.test("UI-4: calculateQuotationGrandTotal aggregates required, optional, and total amounts", () => {
  const items = [
    { partCost: 1000, labourCost: 200, quantity: 1, isRequired: true },
    { partCost: 500, labourCost: 100, quantity: 1, isRequired: true },
    { partCost: 2000, labourCost: 0, quantity: 1, isRequired: false },
  ];

  const totals = calculateQuotationGrandTotal(items);
  assertEquals(totals.requiredTotal, 1800);
  assertEquals(totals.optionalTotal, 2000);
  assertEquals(totals.total, 3800);
});

Deno.test("UI-5: getMobileStatusBadgeClass returns appropriate high-contrast Tailwind classes for tickets", () => {
  const booked = getMobileStatusBadgeClass("Booked");
  assertEquals(booked.includes("bg-blue-50") || booked.includes("text-blue-800"), true);

  const completed = getMobileStatusBadgeClass("Completed");
  assertEquals(completed.includes("emerald"), true);

  const awaiting = getMobileStatusBadgeClass("Awaiting Approval");
  assertEquals(awaiting.includes("purple"), true);
});

Deno.test("UI-6: truncateText safely shortens long strings with ellipsis", () => {
  assertEquals(truncateText("Short text", 20), "Short text");
  assertEquals(
    truncateText("This is a very long problem description that must be truncated", 25),
    "This is a very long prob…",
  );
});

Deno.test("UI-7: getServiceMethodColorClass maps 3 methods to distinct brand color classes", async () => {
  // @ts-ignore: testing new function
  const { getServiceMethodColorClass } = await import("../../../ITHUB_ADMIN/src/lib/uiHelpers.ts");
  const courier = getServiceMethodColorClass("Courier");
  assertEquals(courier.includes("purple"), true);

  const onsite = getServiceMethodColorClass("On-site Technician Visit");
  assertEquals(onsite.includes("blue"), true);

  const visit = getServiceMethodColorClass("Visit IT HUB");
  assertEquals(visit.includes("emerald"), true);
});

Deno.test("UI-8: getViewportCategory accurately classifies target viewports", async () => {
  // @ts-ignore: testing new function
  const { getViewportCategory } = await import("../../../ITHUB_ADMIN/src/lib/uiHelpers.ts");
  assertEquals(getViewportCategory(320), "mobile");
  assertEquals(getViewportCategory(360), "mobile");
  assertEquals(getViewportCategory(375), "mobile");
  assertEquals(getViewportCategory(390), "mobile");
  assertEquals(getViewportCategory(414), "mobile");
  assertEquals(getViewportCategory(430), "mobile");
  assertEquals(getViewportCategory(768), "tablet");
  assertEquals(getViewportCategory(1024), "desktop");
  assertEquals(getViewportCategory(1280), "desktop");
  assertEquals(getViewportCategory(1440), "desktop");
});

Deno.test("UI-9: isTouchTargetCompliant enforces >= 44px minimum touch targets on mobile", async () => {
  // @ts-ignore: testing new function
  const { isTouchTargetCompliant } = await import("../../../ITHUB_ADMIN/src/lib/uiHelpers.ts");
  assertEquals(isTouchTargetCompliant(44), true);
  assertEquals(isTouchTargetCompliant(48), true);
  assertEquals(isTouchTargetCompliant(40), false);
  assertEquals(isTouchTargetCompliant(32), false);
});

Deno.test("UI-10: getAuditBadgeStyle returns refined subtle amber warning instead of bulky red block", async () => {
  // @ts-ignore: testing new function
  const { getAuditBadgeStyle } = await import("../../../ITHUB_ADMIN/src/lib/uiHelpers.ts");

  const flagged = getAuditBadgeStyle("flagged");
  // Refined amber warning styling
  assertEquals(
    flagged.bgClass.includes("amber-50") || flagged.textClass.includes("amber-700"),
    true,
  );
  assertEquals(flagged.bgClass.includes("bg-red-500"), false); // Never bulky solid red
  assertEquals(flagged.iconName, "AlertTriangle");
  assertEquals(flagged.label, "Review Flagged");

  const verified = getAuditBadgeStyle("verified");
  assertEquals(
    verified.bgClass.includes("emerald-50") ||
      verified.textClass.includes("emerald-700") ||
      verified.bgClass.includes("slate-50"),
    true,
  );
  assertEquals(verified.label, "Verified");

  const critical = getAuditBadgeStyle("critical");
  assertEquals(critical.bgClass.includes("red-50") && critical.textClass.includes("red-700"), true);
});

Deno.test("UI-11: calculateDesktopTableLayout ensures Booked column is visible and total min width <= 1180px", async () => {
  // @ts-ignore: testing new function
  const { calculateDesktopTableLayout } = await import("../../../ITHUB_ADMIN/src/lib/uiHelpers.ts");
  const layout = calculateDesktopTableLayout();

  // Must have all 9 columns
  assertEquals(layout.columns.length, 9);

  // Total minimum width must not exceed 1180px so 1366px, 1440px, and 1920px viewports have zero overflow
  assertEquals(layout.totalMinWidth <= 1180, true);

  // Booked column must be present and have at least 100px allocated
  const bookedCol = layout.columns.find((c: any) => c.key === "booked");
  assertEquals(Boolean(bookedCol), true);
  assertEquals((bookedCol?.minWidthPx ?? 0) >= 100, true);
});

Deno.test("UI-12: isFullWidthContainer ensures no max-w-7xl restriction on admin layouts", async () => {
  // @ts-ignore: testing new function
  const { isFullWidthContainer } = await import("../../../ITHUB_ADMIN/src/lib/uiHelpers.ts");
  assertEquals(isFullWidthContainer("flex-1 w-full min-w-0 px-4 sm:px-6 lg:px-8"), true);
  assertEquals(isFullWidthContainer("flex-1 w-full max-w-7xl mx-auto min-w-0"), false);
  assertEquals(isFullWidthContainer("max-w-5xl mx-auto"), false);
});

Deno.test("UI-13: getSettingsNavigationTabs returns all 5 settings sections with icons and metadata", async () => {
  // @ts-ignore: testing new function
  const { getSettingsNavigationTabs } = await import("../../../ITHUB_ADMIN/src/lib/uiHelpers.ts");
  const tabs = getSettingsNavigationTabs();
  assertEquals(tabs.length, 5);
  assertEquals(
    tabs.map((t: any) => t.id),
    ["store", "fees", "whatsapp", "database", "privacy"],
  );
});

Deno.test("UI-14: Service Desk Method and Status columns have dedicated separation without badge overflow", async () => {
  // @ts-ignore
  const { calculateDesktopTableLayout } = await import("../../../ITHUB_ADMIN/src/lib/uiHelpers.ts");
  const layout = calculateDesktopTableLayout();

  const methodCol = layout.columns.find((c: any) => c.key === "method");
  assertEquals(Boolean(methodCol), true);
  assertEquals((methodCol?.minWidthPx ?? 0) >= 120, true, "Method column must be at least 120px");

  const statusCol = layout.columns.find((c: any) => c.key === "status");
  assertEquals(Boolean(statusCol), true);
  assertEquals((statusCol?.minWidthPx ?? 0) >= 170, true, "Status column must be at least 170px");

  // Sum of minimum widths must fit comfortably within standard desktop viewports (1366px+)
  assertEquals(layout.totalMinWidth <= 1180, true);
});

Deno.test("UI-15: getServiceMethodCompactLabel produces compact labels <= 12 characters to prevent badge overlap", async () => {
  // @ts-ignore
  const { getServiceMethodCompactLabel } =
    await import("../../../ITHUB_ADMIN/src/lib/serviceClassification.ts");

  const onsite = getServiceMethodCompactLabel("On-site Technician Visit");
  assertEquals(onsite, "On-site");
  assertEquals(onsite.length <= 12, true);

  const courier = getServiceMethodCompactLabel("Courier to IT HUB");
  assertEquals(courier, "Courier");
  assertEquals(courier.length <= 12, true);

  const walkIn = getServiceMethodCompactLabel("Visit IT HUB");
  assertEquals(walkIn, "Visit IT HUB");
  assertEquals(walkIn.length <= 12, true);
});
