import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import {
  X,
  ShoppingBag,
  Sparkles,
  RefreshCw,
  BadgeIndianRupee,
  Cpu,
  Wrench,
  Search,
  BookOpen,
  Info,
  Phone,
  HelpCircle,
  User,
  Package,
  Layers,
  ChevronRight,
  Truck,
} from "lucide-react";
import { Logo } from "./ui";
import { useStore } from "../app/store";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const store = useStore();
  const location = useLocation();

  // Close drawer upon navigation change
  useEffect(() => {
    if (open) onClose();
  }, [location.pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation drawer"
        className="fixed inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-white shadow-2xl transition-transform"
      >
        {/* Drawer Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4">
          <Link to="/" onClick={onClose} aria-label="IT HUB Home" className="flex items-center">
            <Logo className="h-11 w-11" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Drawer Content */}
        <div
          data-lenis-prevent
          className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 py-4 space-y-6 text-sm"
        >
          {/* Section: Shopping */}
          <div>
            <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-primary">
              Shopping
            </p>
            <div className="mt-2 space-y-0.5">
              {[
                { label: "All Products", to: "/products", Icon: ShoppingBag },
                { label: "Shop by Category", to: "/products", Icon: Layers },
                { label: "Fresh Items", to: "/products?section=fresh", Icon: Sparkles },
                { label: "Pre-owned Items", to: "/second-hand", Icon: RefreshCw },
                { label: "Sell Your Item", to: "/sell", Icon: BadgeIndianRupee },
                { label: "PC Builder", to: "/pc-builder", Icon: Cpu },
                { label: "Find My PC", to: "/pc-builder?mode=smart", Icon: Sparkles },
              ].map(({ label, to, Icon }) => (
                <Link
                  key={label}
                  to={to}
                  onClick={onClose}
                  className="flex min-h-[44px] items-center justify-between rounded-xl px-2.5 py-2 text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="flex items-center gap-3">
                    <Icon size={18} className="text-slate-500" />
                    <span className="font-medium text-slate-800">{label}</span>
                  </span>
                  <ChevronRight size={15} className="text-slate-400" />
                </Link>
              ))}
            </div>
          </div>

          {/* Section: IT HUB Services */}
          <div>
            <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-primary">
              IT HUB Services
            </p>
            <div className="mt-2 space-y-0.5">
              {[
                { label: "Book a Service", to: "/services/book", Icon: Wrench },
                { label: "Track Service", to: "/track-service", Icon: Search },
                {
                  label: "Laptop Services",
                  to: "/services/book?service=Laptop%20Repair",
                  Icon: Wrench,
                },
                {
                  label: "Mobile Services",
                  to: "/services/book?service=Mobile%20Repair",
                  Icon: Wrench,
                },
                {
                  label: "Courier Services",
                  to: "/services/book?method=Courier%20to%20IT%20HUB",
                  Icon: Truck,
                },
              ].map(({ label, to, Icon }) => (
                <Link
                  key={label}
                  to={to}
                  onClick={onClose}
                  className="flex min-h-[44px] items-center justify-between rounded-xl px-2.5 py-2 text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="flex items-center gap-3">
                    <Icon size={18} className="text-slate-500" />
                    <span className="font-medium text-slate-800">{label}</span>
                  </span>
                  <ChevronRight size={15} className="text-slate-400" />
                </Link>
              ))}
            </div>
          </div>

          {/* Section: Discover */}
          <div>
            <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-primary">
              Discover
            </p>
            <div className="mt-2 space-y-0.5">
              {[
                { label: "Technology Blog", to: "/blog", Icon: BookOpen },
                { label: "About IT HUB", to: "/about", Icon: Info },
                { label: "Contact Us", to: "/contact", Icon: Phone },
                { label: "Help & Support", to: "/support", Icon: HelpCircle },
              ].map(({ label, to, Icon }) => (
                <Link
                  key={label}
                  to={to}
                  onClick={onClose}
                  className="flex min-h-[44px] items-center justify-between rounded-xl px-2.5 py-2 text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="flex items-center gap-3">
                    <Icon size={18} className="text-slate-500" />
                    <span className="font-medium text-slate-800">{label}</span>
                  </span>
                  <ChevronRight size={15} className="text-slate-400" />
                </Link>
              ))}
            </div>
          </div>

          {/* Section: Account */}
          <div className="border-t border-slate-100 pt-4">
            <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-primary">
              Account
            </p>
            <div className="mt-2 space-y-0.5">
              {store.loggedIn ? (
                <>
                  <Link
                    to="/account/profile"
                    onClick={onClose}
                    className="flex min-h-[44px] items-center justify-between rounded-xl px-2.5 py-2 text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                  >
                    <span className="flex items-center gap-3">
                      <User size={18} className="text-slate-500" />
                      <span className="font-medium text-slate-800">My Profile</span>
                    </span>
                    <ChevronRight size={15} className="text-slate-400" />
                  </Link>
                  <Link
                    to="/account/orders"
                    onClick={onClose}
                    className="flex min-h-[44px] items-center justify-between rounded-xl px-2.5 py-2 text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                  >
                    <span className="flex items-center gap-3">
                      <Package size={18} className="text-slate-500" />
                      <span className="font-medium text-slate-800">My Orders</span>
                    </span>
                    <ChevronRight size={15} className="text-slate-400" />
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    store.setAuthOpen(true);
                  }}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="flex items-center gap-3">
                    <User size={18} className="text-primary" />
                    <span className="font-semibold text-primary">Login / Sign Up</span>
                  </span>
                  <ChevronRight size={15} className="text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="shrink-0 border-t border-slate-100 bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[11px] text-slate-500">
          <p className="font-semibold text-slate-700">IT HUB Kothamangalam</p>
          <p className="mt-0.5">Your neighbourhood tech store since 2011</p>
        </div>
      </div>
    </div>
  );
}
