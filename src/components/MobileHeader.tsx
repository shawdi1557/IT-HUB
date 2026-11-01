import { Link } from "react-router";
import { Menu, ShoppingBag, UserRound } from "lucide-react";
import { Logo } from "./ui";
import { useStore } from "../app/store";

interface MobileHeaderProps {
  onOpenMenu: () => void;
}

export default function MobileHeader({ onOpenMenu }: MobileHeaderProps) {
  const store = useStore();
  const cartCount = store.cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="sticky top-0 z-40 border-b border-border/80 bg-white shadow-xs md:hidden">
      {/* Row 1: Navigation triggers, Centered Brand, User and Cart */}
      <div className="flex h-16 items-center justify-between px-3 sm:px-4">
        {/* Left: Hamburger menu with accessible 44px touch target (symmetrically balanced with w-20 right container) */}
        <div className="flex w-20 items-center justify-start">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open navigation menu"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-800 transition active:bg-slate-100"
          >
            <Menu size={22} className="stroke-[2.2]" />
          </button>
        </div>

        {/* Center: Brand Logo - Fully visible, unconstrained, unclipped, preserving 1:1 aspect ratio */}
        <div className="flex flex-1 items-center justify-center min-w-0">
          <Link
            to="/"
            aria-label="IT HUB Home"
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-visible"
          >
            <Logo className="h-11 w-11 sm:h-12 sm:w-12 max-h-full max-w-full" />
          </Link>
        </div>

        {/* Right: Account & Cart Actions (symmetrically balanced w-20 container ensures logo remains perfectly centered) */}
        <div className="flex w-20 items-center justify-end gap-1">
          {store.loggedIn ? (
            <Link
              to="/account"
              aria-label="Account profile"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-800 transition active:bg-slate-100"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-xs">
                {(store.profile.name || "U").charAt(0).toUpperCase()}
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => store.setAuthOpen(true)}
              aria-label="Sign in to your account"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-800 transition active:bg-slate-100"
            >
              <UserRound size={20} className="stroke-[2]" />
            </button>
          )}

          <Link
            to="/cart"
            aria-label={`Shopping cart with ${cartCount} items`}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl text-slate-800 transition active:bg-slate-100"
          >
            <ShoppingBag size={21} className="stroke-[2]" />
            {cartCount > 0 && (
              <span className="absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white shadow-xs">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
