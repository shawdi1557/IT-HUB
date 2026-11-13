// ITHUB_ADMIN/src/components/HardwareNav.tsx
// Stage 4B: the PC Builder area's own tabs. The sidebar keeps its eight canonical items (NAV-REORDER-1); the hardware
// pages sit under "PC Quotations", and these tabs move between them.

import { Link, useLocation } from "react-router";
import { Boxes, Cpu, DownloadCloud, History, RefreshCw } from "lucide-react";

const TABS = [
  {
    to: "/quotations",
    label: "PC Quotations",
    icon: Cpu,
    match: (p: string) => p.startsWith("/quotations"),
  },
  {
    to: "/hardware",
    label: "Hardware Registry",
    icon: Boxes,
    match: (p: string) => p === "/hardware" || p.startsWith("/hardware/"),
  },
  {
    to: "/hardware-import",
    label: "Shopify Import",
    icon: DownloadCloud,
    match: (p: string) => p.startsWith("/hardware-import"),
  },
  {
    to: "/hardware-sync",
    label: "Shopify Sync",
    icon: RefreshCw,
    match: (p: string) => p.startsWith("/hardware-sync"),
  },
  {
    to: "/hardware-activity",
    label: "Spec History",
    icon: History,
    match: (p: string) => p.startsWith("/hardware-activity"),
  },
];

export function HardwareNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="PC Builder sections"
      className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold"
      data-testid="hardware-nav"
    >
      {TABS.map(({ to, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 ${
              active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon size={13} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default HardwareNav;
