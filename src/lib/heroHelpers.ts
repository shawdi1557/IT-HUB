// src/lib/heroHelpers.ts
// IT HUB — Mobile Homepage Hero Banner Integration & Layout Helpers

/**
 * Standard Tailwind `md` breakpoint in pixels (768px).
 * Viewports < 768px use the portrait Mobile_Banner.png.
 * Viewports >= 768px use the landscape Futuristic Blue Tech Showroom Banner.png.
 */
export const HERO_BREAKPOINT = 768;

export type HeroBannerMode = "mobile" | "desktop";

/**
 * Resolves whether to use mobile or desktop hero presentation mode based on viewport width.
 */
export function getHeroBannerMode(viewportWidth: number): HeroBannerMode {
  return viewportWidth < HERO_BREAKPOINT ? "mobile" : "desktop";
}

/**
 * Returns responsive Tailwind class strings for mobile and desktop hero background images.
 * Mobile image preserves bottom-aligned showroom product showcase.
 * Desktop image maintains centered showroom alignment.
 */
export function getHeroImageClasses() {
  return {
    mobile:
      "md:hidden pointer-events-none absolute inset-0 size-full object-cover object-[center_bottom]",
    desktop:
      "hidden md:block pointer-events-none absolute inset-0 size-full object-cover object-center",
  };
}

/**
 * Computes an optimal mobile hero container height in pixels based on viewport width
 * to maintain the natural portrait composition (~9:16 aspect ratio) without excessive cropping.
 */
export function getMobileHeroContainerHeight(viewportWidth: number): number {
  if (viewportWidth <= 320) return 620;
  if (viewportWidth <= 375) return 660;
  if (viewportWidth <= 390) return 690;
  if (viewportWidth <= 430) return 720;
  if (viewportWidth < HERO_BREAKPOINT) return 740;
  return 680;
}

/**
 * Helper to compute WCAG 2.1 relative luminance and contrast ratio between two hex colors.
 */
function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function calculateContrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = parseHexToRgb(hex1);
  const [r2, g2, b2] = parseHexToRgb(hex2);

  const l1 = getRelativeLuminance(r1, g1, b1);
  const l2 = getRelativeLuminance(r2, g2, b2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return parseFloat(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Enforces touch target compliance (>= 44px) per mobile accessibility standards.
 */
export function isHeroTouchTargetValid(heightPx: number): boolean {
  return heightPx >= 44;
}

/**
 * Formats hero badge text appropriately across viewports.
 */
export function formatHeroBadgeText(_viewportWidth?: number): string {
  return "Your Trusted Tech Hub · Since 2011";
}

/**
 * Strict hero CTA specification: Exactly two CTA buttons across all devices.
 * 1. Shop Products -> /products
 * 2. Explore Services -> /services
 */
export const HERO_CTA_CONFIG = [
  { label: "Shop Products", to: "/products", variant: "primary" },
  { label: "Explore Services", to: "/services", variant: "secondary" },
] as const;

export function getHeroCTACount(): number {
  return HERO_CTA_CONFIG.length;
}

export function isAllowedHeroCTA(label: string): boolean {
  return HERO_CTA_CONFIG.some((cta) => cta.label === label);
}
