// src/components/AccountNavDropdown.tsx
// Mobile-friendly dropdown selector for customer account navigation
// Replaces horizontally scrolling tabs with an accessible, compact selector
// IT HUB — Kerala, India

import { useState, useRef, useEffect, type ElementType } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutGrid,
  UserRound,
  ShoppingBag,
  BadgeIndianRupee,
  Wrench,
  Cpu,
  Heart,
  Tag,
  ShieldCheck,
  MapPin,
  Bell,
  LifeBuoy,
  CalendarClock,
  ChevronDown,
  Check,
} from "lucide-react";

export interface AccountSection {
  id: string;
  name: string;
  Icon: ElementType<{ size?: number; className?: string }>;
}

export const accountSections: AccountSection[] = [
  { id: "overview", name: "Overview", Icon: LayoutGrid },
  { id: "profile", name: "My Profile", Icon: UserRound },
  { id: "orders", name: "Orders", Icon: ShoppingBag },
  { id: "sell-requests", name: "Sell & Trade-In", Icon: BadgeIndianRupee },
  { id: "services", name: "Services", Icon: Wrench },
  { id: "reschedule", name: "Reschedule Appointment", Icon: CalendarClock },
  { id: "builds", name: "PC Builds", Icon: Cpu },
  { id: "wishlist", name: "Wishlist", Icon: Heart },
  { id: "offers", name: "My Offers", Icon: Tag },
  { id: "warranty", name: "Warranty", Icon: ShieldCheck },
  { id: "notifications", name: "Notifications", Icon: Bell },
  { id: "support", name: "After-sales Support", Icon: LifeBuoy },
];

interface AccountNavDropdownProps {
  activeSection?: string;
  className?: string;
}

export default function AccountNavDropdown({
  activeSection = "overview",
  className = "",
}: AccountNavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Resolve current active section object safely
  const currentSection = accountSections.find((s) => s.id === activeSection) || accountSections[0];
  const CurrentIcon = currentSection.Icon;

  // Close dropdown on route/location change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname, location.search]);

  // Close on outside click or tap
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Dropdown Selector Trigger Button */}
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select account section"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex min-h-[50px] w-full items-center justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-slate-900 shadow-xs transition hover:border-slate-300 hover:bg-slate-50/60 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/25"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CurrentIcon size={18} className="stroke-[2.2]" />
          </div>
          <div className="text-left min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Account Section
            </span>
            <span className="block font-bold text-sm text-slate-900 truncate">
              {currentSection.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pl-2 text-slate-400">
          <span className="hidden text-[11px] font-semibold sm:inline text-slate-500">Switch</span>
          <ChevronDown
            size={18}
            className={`transition-transform duration-200 ${
              isOpen ? "rotate-180 text-primary" : "text-slate-500"
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu Options */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Account sections"
          data-lenis-prevent
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[380px] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
            Navigate Account
          </div>
          <div className="space-y-0.5">
            {accountSections.map((sec) => {
              const ItemIcon = sec.Icon;
              const isActive = sec.id === currentSection.id;
              const to = sec.id === "overview" ? "/account" : `/account/${sec.id}`;

              return (
                <Link
                  key={sec.id}
                  to={to}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => setIsOpen(false)}
                  className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? "bg-primary/10 font-bold text-primary shadow-2xs"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ItemIcon
                      size={17}
                      className={isActive ? "text-primary stroke-[2.2]" : "text-slate-500"}
                    />
                    <span className="truncate">{sec.name}</span>
                  </div>
                  {isActive && <Check size={16} className="text-primary stroke-[2.5] shrink-0" />}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
