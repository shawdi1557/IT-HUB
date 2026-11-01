import { Link, useLocation } from "react-router";
import { Home, LayoutGrid, Wrench, BookOpen, User } from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  Icon: typeof Home;
  isActive: (pathname: string) => boolean;
}

const navItems: NavItem[] = [
  {
    label: "Home",
    to: "/",
    Icon: Home,
    isActive: (p) => p === "/",
  },
  {
    label: "Shop",
    to: "/products",
    Icon: LayoutGrid,
    isActive: (p) =>
      p.startsWith("/products") || p.startsWith("/second-hand") || p.startsWith("/sell"),
  },
  {
    label: "Services",
    to: "/services",
    Icon: Wrench,
    isActive: (p) =>
      p.startsWith("/services") ||
      p.startsWith("/track-service") ||
      p.startsWith("/service-success"),
  },
  {
    label: "Blog",
    to: "/blog",
    Icon: BookOpen,
    isActive: (p) => p.startsWith("/blog"),
  },
  {
    label: "Account",
    to: "/account",
    Icon: User,
    isActive: (p) => p.startsWith("/account"),
  },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.04)] md:hidden"
    >
      <div className="grid grid-cols-5 items-center px-1">
        {navItems.map(({ label, to, Icon, isActive }) => {
          const active = isActive(currentPath);
          return (
            <Link
              key={label}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[48px] flex-col items-center justify-center py-0.5 transition-all duration-200 ${
                active ? "text-primary" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-xl transition-all duration-200 ${
                  active ? "bg-primary/10 text-primary" : ""
                }`}
              >
                <Icon
                  size={20}
                  className={`transition-transform duration-200 ${
                    active ? "stroke-[2.3] scale-105" : "stroke-[1.8]"
                  }`}
                />
              </div>
              <span
                className={`mt-0.5 text-[10px] tracking-tight transition-colors duration-200 ${
                  active ? "font-bold text-primary" : "font-medium text-slate-500"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
