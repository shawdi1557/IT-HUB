// ITHUB_ADMIN/src/lib/uiHelpers.ts
// Shared UI, formatting, and responsive calculation helpers for Staff Portal

export function getPageTitle(pathname: string): string {
  const clean = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  switch (clean) {
    case "/":
      return "Dashboard";
    case "/quotations":
      return "PC Quotations";
    case "/services":
      return "Service Management";
    case "/content":
      return "Website Content";
    case "/certificates":
      return "Certificates";
    case "/sell-requests":
      return "Sell Requests";
    case "/audits":
      return "Customer Audits";
    case "/settings":
      return "Settings";
    case "/hardware":
      return "Hardware Registry";
    case "/hardware-sync":
      return "Shopify Sync Centre";
    case "/hardware-activity":
      return "Revision & Activity History";
    default:
      if (clean.startsWith("/hardware/")) return "Hardware Model";
      return "Staff Portal";
  }
}

export function formatCurrencyINR(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return "—";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
}

export interface QuotationCalculationItem {
  partCost: number;
  labourCost: number;
  quantity: number;
  isRequired?: boolean;
}

export function calculateQuotationItemTotal(item: {
  partCost: number;
  labourCost: number;
  quantity: number;
}): number {
  const part = Number(item.partCost) || 0;
  const labour = Number(item.labourCost) || 0;
  const qty = Number(item.quantity) || 1;
  return (part + labour) * qty;
}

export function calculateQuotationGrandTotal(items: QuotationCalculationItem[]): {
  total: number;
  requiredTotal: number;
  optionalTotal: number;
} {
  let requiredTotal = 0;
  let optionalTotal = 0;

  for (const item of items) {
    const lineTotal = calculateQuotationItemTotal(item);
    if (item.isRequired !== false) {
      requiredTotal += lineTotal;
    } else {
      optionalTotal += lineTotal;
    }
  }

  return {
    total: requiredTotal + optionalTotal,
    requiredTotal,
    optionalTotal,
  };
}

export function getMobileStatusBadgeClass(status: string): string {
  switch (status) {
    case "Booked":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "Technician Assigned":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "Technician has Left IT HUB":
    case "Technician on the Way":
      return "bg-cyan-50 text-cyan-800 border-cyan-200";
    case "Technician Arrived at Your Location":
    case "Technician Arrived":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "Customer Arrived":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "Device Received":
      return "bg-teal-50 text-teal-800 border-teal-300";
    case "Under Diagnosis":
      return "bg-sky-50 text-sky-800 border-sky-300";
    case "In Progress":
    case "Service in Progress":
      return "bg-amber-50 text-amber-800 border-amber-300";
    case "Ready for Pickup":
      return "bg-lime-50 text-lime-800 border-lime-300";
    case "Diagnosis Done":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "Awaiting Approval":
      return "bg-purple-50 text-purple-800 border-purple-200";
    case "Completed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "Delivered":
      return "bg-green-50 text-green-800 border-green-200";
    case "Reschedule Requested":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "Rescheduled":
      return "bg-sky-100 text-sky-900 border-sky-300";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
}

export function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

export function getServiceMethodColorClass(method: string): string {
  switch (method) {
    case "Courier":
      return "border-purple-200 bg-purple-50 text-purple-700";
    case "On-site Technician Visit":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "Visit IT HUB":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function getViewportCategory(width: number): "mobile" | "tablet" | "desktop" {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function isTouchTargetCompliant(minHeightPx: number): boolean {
  return minHeightPx >= 44;
}

export interface AuditBadgeStyle {
  label: string;
  iconName: "AlertTriangle" | "CheckCircle2" | "ShieldAlert";
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export function getAuditBadgeStyle(
  severity: "normal" | "verified" | "flagged" | "review_required" | "critical" | string,
): AuditBadgeStyle {
  switch (severity) {
    case "flagged":
    case "review_required":
      return {
        label: "Review Flagged",
        iconName: "AlertTriangle",
        bgClass: "bg-amber-50/90",
        textClass: "text-amber-700",
        borderClass: "border-amber-200/80",
      };
    case "critical":
      return {
        label: "Security Alert",
        iconName: "ShieldAlert",
        bgClass: "bg-red-50",
        textClass: "text-red-700",
        borderClass: "border-red-200",
      };
    case "verified":
    case "normal":
    default:
      return {
        label: "Verified",
        iconName: "CheckCircle2",
        bgClass: "bg-emerald-50/80",
        textClass: "text-emerald-700",
        borderClass: "border-emerald-200/60",
      };
  }
}

export interface TableColumnConfig {
  key: string;
  label: string;
  minWidthPx: number;
  widthClass: string;
  align?: "left" | "right" | "center";
}

export function calculateDesktopTableLayout(): {
  totalMinWidth: number;
  columns: TableColumnConfig[];
} {
  const columns: TableColumnConfig[] = [
    { key: "ticket_id", label: "Ticket ID", minWidthPx: 145, widthClass: "w-[145px]" },
    { key: "device_problem", label: "Device & Problem", minWidthPx: 185, widthClass: "w-[23%]" },
    { key: "customer", label: "Customer & Contact", minWidthPx: 140, widthClass: "w-[16%]" },
    { key: "method", label: "Method", minWidthPx: 125, widthClass: "w-[125px]" },
    { key: "status", label: "Status", minWidthPx: 175, widthClass: "w-[175px]" },
    {
      key: "quote",
      label: "Quote & State",
      minWidthPx: 95,
      widthClass: "w-[95px]",
      align: "right",
    },
    { key: "technician", label: "Technician", minWidthPx: 110, widthClass: "w-[110px]" },
    { key: "booked", label: "Booked", minWidthPx: 105, widthClass: "w-[105px]" },
    { key: "action", label: "Action", minWidthPx: 80, widthClass: "w-[80px]", align: "right" },
  ];

  const totalMinWidth = columns.reduce((acc, col) => acc + col.minWidthPx, 0);
  return { totalMinWidth, columns };
}

export function isFullWidthContainer(classes: string): boolean {
  if (!classes) return false;
  if (
    classes.includes("max-w-7xl") ||
    classes.includes("max-w-5xl") ||
    classes.includes("max-w-6xl")
  ) {
    return false;
  }
  return classes.includes("w-full");
}

export interface SettingsTabItem {
  id: "store" | "fees" | "whatsapp" | "database" | "privacy";
  label: string;
  shortLabel: string;
  iconName: string;
}

export function getSettingsNavigationTabs(): SettingsTabItem[] {
  return [
    { id: "store", label: "Store Identity & Location", shortLabel: "Store", iconName: "Store" },
    {
      id: "fees",
      label: "Service & Logistics Fees",
      shortLabel: "Fees",
      iconName: "BadgeIndianRupee",
    },
    {
      id: "whatsapp",
      label: "WhatsApp Direct Communication",
      shortLabel: "WhatsApp",
      iconName: "MessageCircle",
    },
    {
      id: "database",
      label: "Supabase PostgreSQL Health",
      shortLabel: "Database",
      iconName: "Database",
    },
    {
      id: "privacy",
      label: "Visitor Privacy & Data Protection",
      shortLabel: "Privacy",
      iconName: "Shield",
    },
  ];
}
