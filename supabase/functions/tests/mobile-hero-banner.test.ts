// supabase/functions/tests/mobile-hero-banner.test.ts
// TDD Test Suite for Mobile Homepage Hero Banner Integration & Responsive Behavior

import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  HERO_BREAKPOINT,
  getHeroBannerMode,
  getHeroImageClasses,
  getMobileHeroContainerHeight,
  calculateContrastRatio,
  isHeroTouchTargetValid,
  formatHeroBadgeText,
  HERO_CTA_CONFIG,
  getHeroCTACount,
  isAllowedHeroCTA,
} from "../../../src/lib/heroHelpers.ts";

Deno.test("MHB-1: Breakpoint constant is set to 768px (Tailwind md breakpoint)", () => {
  assertEquals(HERO_BREAKPOINT, 768);
});

Deno.test("MHB-2: getHeroBannerMode resolves 'mobile' for viewports < 768px and 'desktop' for >= 768px", () => {
  // Mobile widths
  assertEquals(getHeroBannerMode(320), "mobile");
  assertEquals(getHeroBannerMode(360), "mobile");
  assertEquals(getHeroBannerMode(375), "mobile");
  assertEquals(getHeroBannerMode(390), "mobile");
  assertEquals(getHeroBannerMode(414), "mobile");
  assertEquals(getHeroBannerMode(430), "mobile");
  assertEquals(getHeroBannerMode(640), "mobile");
  assertEquals(getHeroBannerMode(767), "mobile");

  // Tablet & Desktop widths
  assertEquals(getHeroBannerMode(768), "desktop");
  assertEquals(getHeroBannerMode(820), "desktop");
  assertEquals(getHeroBannerMode(1024), "desktop");
  assertEquals(getHeroBannerMode(1280), "desktop");
  assertEquals(getHeroBannerMode(1440), "desktop");
  assertEquals(getHeroBannerMode(1920), "desktop");
});

Deno.test("MHB-3: getHeroImageClasses returns proper mobile and desktop responsive visibility classes", () => {
  const classes = getHeroImageClasses();
  assertExists(classes.mobile);
  assertExists(classes.desktop);

  // Mobile image must be visible below md and hidden on md+
  assertEquals(classes.mobile.includes("md:hidden"), true);
  assertEquals(classes.mobile.includes("object-cover"), true);
  assertEquals(classes.mobile.includes("pointer-events-none"), true);
  assertEquals(classes.mobile.includes("absolute"), true);

  // Desktop image must be hidden below md and visible on md+
  assertEquals(classes.desktop.includes("hidden md:block"), true);
  assertEquals(classes.desktop.includes("object-cover"), true);
  assertEquals(classes.desktop.includes("pointer-events-none"), true);
  assertEquals(classes.desktop.includes("absolute"), true);
});

Deno.test("MHB-4: getMobileHeroContainerHeight returns appropriate viewport-scaled heights without excessive stretching", () => {
  // On mobile viewports, height should accommodate upper text + lower product showcase
  const h320 = getMobileHeroContainerHeight(320);
  const h390 = getMobileHeroContainerHeight(390);
  const h430 = getMobileHeroContainerHeight(430);

  assertEquals(h320 >= 560 && h320 <= 720, true);
  assertEquals(h390 >= 600 && h390 <= 780, true);
  assertEquals(h430 >= 640 && h430 <= 820, true);
});

Deno.test("MHB-5: calculateContrastRatio verifies accessible contrast against mobile light-blue canopy (#e8f1fd)", () => {
  const lightBlueBg = "#e8f1fd";
  const darkNavy = "#0a1e4a";
  const foreground = "#090d16";
  const mutedNavy = "#243c68";

  // WCAG AAA requires >= 7:1 for normal text, WCAG AA requires >= 4.5:1
  const ratioNavy = calculateContrastRatio(darkNavy, lightBlueBg);
  const ratioForeground = calculateContrastRatio(foreground, lightBlueBg);
  const ratioMuted = calculateContrastRatio(mutedNavy, lightBlueBg);

  assertEquals(ratioNavy >= 7.0, true, `Dark navy contrast ratio ${ratioNavy} must be >= 7.0`);
  assertEquals(
    ratioForeground >= 7.0,
    true,
    `Foreground contrast ratio ${ratioForeground} must be >= 7.0`,
  );
  assertEquals(ratioMuted >= 4.5, true, `Muted text contrast ratio ${ratioMuted} must be >= 4.5`);
});

Deno.test("MHB-6: isHeroTouchTargetValid ensures CTA buttons maintain minimum 44px touch targets", () => {
  assertEquals(isHeroTouchTargetValid(44), true);
  assertEquals(isHeroTouchTargetValid(48), true);
  assertEquals(isHeroTouchTargetValid(40), false);
  assertEquals(isHeroTouchTargetValid(32), false);
});

Deno.test("MHB-7: formatHeroBadgeText provides concise badge text on small screens without truncation", () => {
  const fullBadge = formatHeroBadgeText(1440);
  const mobileBadge = formatHeroBadgeText(320);

  assertEquals(fullBadge, "Your Trusted Tech Hub · Since 2011");
  // On very small 320px screens, badge is clean and concise
  assertEquals(mobileBadge.length <= 34, true);
});

function getHomeCode(): string {
  const fileUrl = new URL("../../../src/pages/Home.tsx", import.meta.url);
  return Deno.readTextFileSync(fileUrl);
}

Deno.test("MHB-8: Home.tsx imports Mobile_Banner.png directly through Vite import", () => {
  const homeCode = getHomeCode();
  const hasMobileImport =
    /import\s+mobileHeroBanner\s+from\s+["']\.\.\/imports\/Mobile_Banner\.png["']/.test(homeCode);
  assertEquals(hasMobileImport, true, "Home.tsx must import Mobile_Banner.png");
});

Deno.test("MHB-9: Home.tsx preserves desktop hero banner import untouched", () => {
  const homeCode = getHomeCode();
  const hasDesktopImport =
    /import\s+heroBanner\s+from\s+["']\.\.\/imports\/Futuristic Blue Tech Showroom Banner\.png["']/.test(
      homeCode,
    );
  assertEquals(
    hasDesktopImport,
    true,
    "Home.tsx must keep Futuristic Blue Tech Showroom Banner.png",
  );
});

Deno.test("MHB-10: Home.tsx renders both mobile and desktop image elements with responsive classes", () => {
  const homeCode = getHomeCode();
  // Mobile banner must have md:hidden
  const hasMobileImg =
    /<img[^>]*src=\{mobileHeroBanner\}[^>]*className="[^"]*md:hidden[^"]*"/.test(homeCode) ||
    /<img[^>]*className="[^"]*md:hidden[^"]*"[^>]*src=\{mobileHeroBanner\}/.test(homeCode);
  assertEquals(hasMobileImg, true, "Mobile banner img element must have md:hidden class");

  // Desktop banner must have hidden md:block
  const hasDesktopImg =
    /<img[^>]*src=\{heroBanner\}[^>]*className="[^"]*hidden\s+md:block[^"]*"/.test(homeCode) ||
    /<img[^>]*className="[^"]*hidden\s+md:block[^"]*"[^>]*src=\{heroBanner\}/.test(homeCode);
  assertEquals(hasDesktopImg, true, "Desktop banner img element must have hidden md:block class");
});

Deno.test("MHB-11: Home.tsx configures above-the-fold image loading optimization (fetchpriority high)", () => {
  const homeCode = getHomeCode();
  // Image elements should have fetchPriority="high" or loading="eager" to prevent layout shift
  const hasEagerLoading =
    homeCode.includes('loading="eager"') || homeCode.includes('fetchPriority="high"');
  assertEquals(hasEagerLoading, true, "Hero banners must use optimized above-the-fold loading");
});

Deno.test("MHB-12: Home.tsx responsive heading prevents text clipping on small mobile viewports", () => {
  const homeCode = getHomeCode();
  // Heading must scale down gracefully on mobile (< 48px / text-3xl or text-4xl on mobile, then sm:text-6xl md:text-7xl)
  const hasMobileResponsiveHeading =
    /text-[2-4]xl[^"]*sm:text-6xl[^"]*md:text-7xl/.test(homeCode) ||
    /text-balance[^"]*text-[2-4]xl/.test(homeCode) ||
    /text-[3-4]xl[^"]*md:text-7xl/.test(homeCode);
  assertEquals(
    hasMobileResponsiveHeading,
    true,
    "Hero heading must be responsive to prevent clipping on 320px-390px screens",
  );
});

Deno.test("MHB-13: Exactly two CTA buttons configured in hero specification", () => {
  assertEquals(getHeroCTACount(), 2);
  assertEquals(HERO_CTA_CONFIG[0].label, "Shop Products");
  assertEquals(HERO_CTA_CONFIG[0].to, "/products");
  assertEquals(HERO_CTA_CONFIG[1].label, "Explore Services");
  assertEquals(HERO_CTA_CONFIG[1].to, "/services");
  assertEquals(isAllowedHeroCTA("PC Builder"), false);
});

Deno.test("MHB-14: Home.tsx hero renders exactly two CTAs (Shop Products & Explore Services), PC Builder removed from hero", () => {
  const homeCode = getHomeCode();
  // Extract hero section code between {/* 1. Full-Width Hero Section */} and {/* 2. Dedicated or closing </section>
  const heroMatch = homeCode.match(
    /{\/\*\s*1\.\s*Full-Width Hero Section[\s\S]*?(?:{\/\*\s*2\.\s*(?:Dedicated|Marquee)|<\/section>)/,
  );
  assertExists(heroMatch, "Hero section must exist in Home.tsx");
  const heroSection = heroMatch[0];

  // Must contain Shop Products CTA
  assertEquals(
    heroSection.includes('to="/products"'),
    true,
    "Hero must contain Shop Products link",
  );
  assertEquals(
    heroSection.includes("Shop Products"),
    true,
    "Hero must contain 'Shop Products' label",
  );

  // Must contain Explore Services CTA
  assertEquals(
    heroSection.includes('to="/services"'),
    true,
    "Hero must contain Explore Services link",
  );
  assertEquals(
    heroSection.includes("Explore Services"),
    true,
    "Hero must contain 'Explore Services' label",
  );

  // Must NOT contain PC Builder CTA inside the hero section
  const heroHasPcBuilderCTA = /ActionLink[^>]*to="\/pc-builder"[\s\S]*?PC Builder/i.test(
    heroSection,
  );
  assertEquals(heroHasPcBuilderCTA, false, "PC Builder CTA must be removed from the hero section");
});

Deno.test("MHB-15: PC Builder remains accessible through navigation and other homepage sections", () => {
  const homeCode = getHomeCode();
  // PC Builder section or link outside the hero must exist
  const hasPcBuilderOutsideHero = homeCode.includes('to="/pc-builder"');
  assertEquals(hasPcBuilderOutsideHero, true, "PC Builder must remain accessible outside the hero");
});

Deno.test("MHB-16: Hero heading and description preserve exact required copy", () => {
  const homeCode = getHomeCode();
  const heroMatch = homeCode.match(
    /{\/\*\s*1\.\s*Full-Width Hero Section[\s\S]*?(?:{\/\*\s*2\.\s*(?:Dedicated|Marquee)|<\/section>)/,
  );
  assertExists(heroMatch, "Hero section must exist in Home.tsx");
  const heroSection = heroMatch[0];

  // Heading check
  assertEquals(heroSection.includes("Everything Tech."), true);
  assertEquals(heroSection.includes("Sales, Service"), true);
  assertEquals(heroSection.includes("& Support."), true);

  // Description check
  assertEquals(
    heroSection.includes(
      "Shop laptops, computers, mobiles, printers & IT services backed by IT HUB support.",
    ),
    true,
  );
});
