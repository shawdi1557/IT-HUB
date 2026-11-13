// ITHUB_ADMIN/src/components/Layout.tsx
// Desktop-Class Staff Portal Layout with Animated Left Navigation Sidebar & Mobile Slide-Over Drawer

import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  Cpu,
  Wrench,
  LayoutDashboard,
  LogOut,
  Image as ImageIcon,
  Award,
  Settings as SettingsIcon,
  BadgeIndianRupee,
  ClipboardCheck,
  Menu,
  X,
} from "lucide-react";
import { type StaffProfile, signOutStaff } from "../lib/auth";
import { getPageTitle } from "../lib/uiHelpers";
import { subscribeBadgeCounts, type PortalBadgeCounts } from "../lib/badgeCounts";
import { Logo } from "./Logo";

interface LayoutProps {
  profile: StaffProfile;
  onSignOut: () => void;
  children: ReactNode;
}

export function Layout({ profile, onSignOut, children }: LayoutProps) {
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<PortalBadgeCounts>({
    quotations: 0,
    services: 0,
    sellRequests: 0,
    dashboard: 0,
  });

  // Realtime badge counts subscription
  useEffect(() => {
    const unsubscribe = subscribeBadgeCounts(setBadgeCounts);
    return () => {
      unsubscribe();
    };
  }, []);

  // Prevent background scrolling while the mobile navigation drawer is active
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Automatically close drawer when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOutStaff();
    onSignOut();
  };

  const navItems = [
    {
      to: "/",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: location.pathname === "/",
      visible: true,
      badge: badgeCounts.dashboard,
    },
    {
      to: "/quotations",
      label: "PC Quotations",
      icon: Cpu,
      // Stage 4B: the Hardware Specification Manager's pages sit under the PC Builder area.
      active:
        location.pathname.startsWith("/quotations") || location.pathname.startsWith("/hardware"),
      visible: profile.permissions.can_manage_quotations,
      badge: badgeCounts.quotations,
    },
    {
      to: "/services",
      label: "Service Management",
      icon: Wrench,
      active: location.pathname.startsWith("/services"),
      visible: profile.permissions.can_manage_services,
      badge: badgeCounts.services,
    },
    {
      to: "/sell-requests",
      label: "Sell Requests",
      icon: BadgeIndianRupee,
      active: location.pathname.startsWith("/sell-requests"),
      visible: profile.permissions.can_manage_sell_requests,
      badge: badgeCounts.sellRequests,
    },
    {
      to: "/content",
      label: "Website Content",
      icon: ImageIcon,
      active: location.pathname.startsWith("/content"),
      visible: profile.permissions.can_manage_content,
      badge: 0,
    },
    {
      to: "/certificates",
      label: "Certificates",
      icon: Award,
      active: location.pathname.startsWith("/certificates"),
      visible: profile.permissions.can_manage_content,
      badge: 0,
    },
    {
      to: "/audits",
      label: "Audits",
      icon: ClipboardCheck,
      active: location.pathname.startsWith("/audits"),
      visible: profile.permissions.can_view_analytics,
      badge: 0,
    },
    {
      to: "/settings",
      label: "Settings",
      icon: SettingsIcon,
      active: location.pathname.startsWith("/settings"),
      visible: profile.permissions.can_manage_settings,
      badge: 0,
    },
  ];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "portal_admin":
        return { label: "Portal Admin", bg: "bg-purple-100 text-purple-800 border-purple-200" };
      case "quotation_staff":
        return { label: "Quotation Staff", bg: "bg-blue-100 text-blue-800 border-blue-200" };
      case "service_staff":
        return { label: "Service Staff", bg: "bg-emerald-100 text-emerald-800 border-emerald-200" };
      default:
        return { label: "Staff", bg: "bg-slate-100 text-slate-800 border-slate-200" };
    }
  };

  const badge = getRoleBadge(profile.role);
  const userInitials = profile.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "ST";

  const currentPageTitle = getPageTitle(location.pathname);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* ─────────────────────────────────────────────────────────────────────────────
          1. Desktop Left Navigation Sidebar (Compact 72px -> Floating 260px on hover)
          ───────────────────────────────────────────────────────────────────────────── */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Staff Portal Navigation"
        className={`hidden md:flex flex-col fixed top-0 bottom-0 left-0 z-50 bg-white/90 backdrop-blur-md border-r border-slate-200/80 text-slate-900 transition-[width,box-shadow] duration-300 ease-in-out motion-reduce:transition-none ${
          isHovered ? "w-[260px] shadow-2xl" : "w-[72px] shadow-xs"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-100 shrink-0 overflow-hidden">
          <Link
            to="/"
            className="flex items-center gap-3 w-full group transition focus:outline-hidden"
          >
            <Logo
              size="md"
              showSubtitle={isHovered}
              className={isHovered ? "w-full" : "mx-auto justify-center"}
            />
          </Link>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 py-4 px-2 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.to} className="relative group/nav">
                  <Link
                    to={item.to}
                    className={`flex items-center min-h-[44px] rounded-xl transition-all duration-200 outline-hidden ${
                      item.active
                        ? "bg-blue-600 text-white font-bold shadow-xs shadow-blue-600/20"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium"
                    }`}
                  >
                    {/* Centered Icon Container (Fixed 54px width inside 72px column) */}
                    <div className="w-[54px] flex items-center justify-center shrink-0 relative">
                      <Icon
                        size={19}
                        className={`transition-transform duration-200 ${
                          item.active ? "text-white" : "text-slate-500 group-hover/nav:scale-110"
                        }`}
                      />
                      {!isHovered && item.badge > 0 && (
                        <span
                          className="absolute top-1 right-2 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs"
                          aria-label={`${item.badge} pending items`}
                        >
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </div>

                    {/* Navigation Label & Badge (Fades in when expanded) */}
                    <div
                      className={`flex-1 flex items-center justify-between overflow-hidden pr-3 transition-opacity duration-200 ${
                        isHovered ? "opacity-100" : "opacity-0 pointer-events-none w-0"
                      }`}
                    >
                      <span className="whitespace-nowrap text-xs tracking-tight">{item.label}</span>
                      {item.badge > 0 && (
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold shadow-2xs ${
                            item.active ? "bg-white text-blue-600" : "bg-rose-500 text-white"
                          }`}
                        >
                          {item.badge > 99 ? "99+" : item.badge}
                          <span className="sr-only">pending items</span>
                        </span>
                      )}
                    </div>
                  </Link>

                  {/* Accessible Tooltip on hover when sidebar is collapsed */}
                  {!isHovered && (
                    <div className="fixed left-[76px] hidden group-hover/nav:flex items-center z-50 pointer-events-none transition-opacity duration-150">
                      <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg whitespace-nowrap flex items-center gap-2">
                        <span>{item.label}</span>
                        {item.badge > 0 && (
                          <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </nav>

        {/* Staff Profile & Session Actions (Bottom) */}
        <div className="border-t border-slate-100 bg-slate-50/50 p-2 shrink-0">
          {isHovered ? (
            /* Expanded Profile Card */
            <div className="space-y-3 p-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-extrabold text-xs shadow-2xs border border-blue-200">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{profile.full_name}</p>
                  <span
                    className={`mt-0.5 inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${badge.bg}`}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 shadow-2xs transition"
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            /* Compact Collapsed User Pill */
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="relative group/user">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-extrabold text-xs shadow-2xs border border-blue-200 cursor-default">
                  {userInitials}
                </div>
                {/* Tooltip on user avatar */}
                <div className="fixed left-[76px] hidden group-hover/user:flex items-center z-50 pointer-events-none transition-opacity duration-150">
                  <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow-lg whitespace-nowrap">
                    <p className="font-bold">{profile.full_name}</p>
                    <p className="text-[10px] text-slate-400">{badge.label}</p>
                  </div>
                </div>
              </div>

              <div className="relative group/logout">
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  aria-label="Sign Out"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
                >
                  <LogOut size={16} />
                </button>
                <div className="fixed left-[76px] hidden group-hover/logout:flex items-center z-50 pointer-events-none transition-opacity duration-150">
                  <div className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg whitespace-nowrap">
                    Logout
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────────────────────
          2. Mobile Top Navigation Bar (< md)
          ───────────────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex md:hidden h-14 w-full items-center justify-between border-b border-slate-200/80 bg-white/90 px-3 sm:px-4 backdrop-blur-md shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link to="/" className="flex items-center shrink-0">
            <Logo size="sm" showSubtitle={false} />
          </Link>
          <div className="h-4 w-px bg-slate-200 shrink-0" />
          <span className="truncate text-xs font-extrabold tracking-tight text-slate-900">
            {currentPageTitle}
          </span>
        </div>

        <button
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open Mobile Menu"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-100 active:scale-95 transition"
        >
          <Menu size={20} />
        </button>
      </header>

      {/* Mobile Slide-Over Drawer with Backdrop */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
          {/* Semi-transparent backdrop blur */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity duration-300"
          />

          {/* Drawer Content */}
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white/95 backdrop-blur-md shadow-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <Logo size="sm" showSubtitle={true} />
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="mt-4 flex-1 space-y-1 overflow-y-auto">
              {navItems
                .filter((item) => item.visible)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-bold min-h-[44px] transition ${
                        item.active
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge > 0 && (
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            item.active ? "bg-white text-blue-600" : "bg-rose-500 text-white"
                          }`}
                        >
                          {item.badge > 99 ? "99+" : item.badge}
                          <span className="sr-only">pending actionable items</span>
                        </span>
                      )}
                    </Link>
                  );
                })}
            </nav>

            {/* Staff info & Sign Out */}
            <div className="mt-auto pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-extrabold text-xs">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{profile.full_name}</p>
                  <span
                    className={`mt-0.5 inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${badge.bg}`}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-red-50 hover:text-red-700 transition"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          3. Main Dashboard & Viewport Content Area (Full-Width Responsive Architecture)
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="md:pl-[72px] min-h-screen flex flex-col min-w-0 transition-[padding] duration-300">
        <main className="flex-1 w-full min-w-0 px-3.5 py-5 sm:px-6 lg:px-8 xl:px-10">
          {/* Stage 4B-6: a short fade as each page opens (none with reduced motion). */}
          <div key={location.pathname} className="portal-page-enter">
            {children}
          </div>
        </main>

        <footer className="border-t border-slate-200/80 bg-white/80 backdrop-blur-xs py-4 px-4 text-center text-xs text-slate-500">
          <p>
            IT HUB Kothamangalam &bull; Internal Service &amp; PC Quotations Portal &bull;
            Confidential &amp; Authorized Personnel Only
          </p>
        </footer>
      </div>
    </div>
  );
}
