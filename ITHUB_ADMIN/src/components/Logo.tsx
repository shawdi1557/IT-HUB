// ITHUB_ADMIN/src/components/Logo.tsx
// IT HUB Brand Logo Component for Staff Portal

import ithubLogo from "../assets/ithub-logo.jpeg";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showSubtitle?: boolean;
}

export function Logo({ size = "md", className = "", showSubtitle = true }: LogoProps) {
  const imageSizeClasses = {
    sm: "h-7 w-auto",
    md: "h-9 w-auto",
    lg: "h-12 w-auto",
    xl: "h-16 w-auto",
  }[size];

  return (
    <div className={`inline-flex items-center gap-3 overflow-hidden ${className}`}>
      <img
        src={ithubLogo}
        alt="IT HUB Logo"
        className={`${imageSizeClasses} shrink-0 object-contain rounded-lg`}
      />
      {showSubtitle && (
        <div className="flex flex-col text-left leading-tight whitespace-nowrap min-w-0 transition-opacity duration-200">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black tracking-tight text-slate-900">IT HUB</span>
            <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              Staff
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">Service &amp; PC Portal</span>
        </div>
      )}
    </div>
  );
}
