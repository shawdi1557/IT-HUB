// supabase/functions/tests/hero-and-reviews-showcase.test.ts
// Automated Tests for Homepage Hero React Bits AnimatedContent & About Page Genuine Google Reviews Showcase

import {
  assertEquals,
  assertMatch,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  googleReviews,
  GOOGLE_MAPS_REVIEW_URL,
  type GoogleCustomerReview,
} from "../../../src/data/googleReviews.ts";

const ANIMATED_CONTENT_PATH = "src/components/AnimatedContent.tsx";
const HOME_PAGE_PATH = "src/pages/Home.tsx";
const ABOUT_PAGE_PATH = "src/pages/Information.tsx";
const GOOGLE_REVIEWS_DATA_PATH = "src/data/googleReviews.ts";
const SHOWCASE_COMPONENT_PATH = "src/components/GoogleReviewShowcase.tsx";
const SHOWCASE_CSS_PATH = "src/components/GoogleReviewShowcase.css";
const PACKAGE_JSON_PATH = "package.json";

// ─────────────────────────────────────────────────────────────────────────────
// 1. GSAP DEPENDENCY & ANIMATEDCONTENT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("ANIM-1: gsap dependency is installed in package.json", () => {
  const pkg = JSON.parse(Deno.readTextFileSync(PACKAGE_JSON_PATH));
  assertEquals(Boolean(pkg.dependencies && pkg.dependencies.gsap), true);
});

Deno.test("ANIM-2: AnimatedContent implementation matches React Bits specification", () => {
  const code = Deno.readTextFileSync(ANIMATED_CONTENT_PATH);

  // Core GSAP imports & ScrollTrigger registration
  assertMatch(code, /import\s+gsap\s+from\s+["']gsap["']/);
  assertMatch(code, /import\s+\{\s*ScrollTrigger\s*\}\s+from\s+["']gsap\/ScrollTrigger["']/);
  assertMatch(code, /gsap\.registerPlugin\(ScrollTrigger\)/);

  // StrictMode & unmount cleanup
  assertMatch(code, /gsap\.context\(/);
  assertMatch(code, /ctx\.revert\(\)/);

  // Accessibility: prefers-reduced-motion
  assertMatch(code, /prefers-reduced-motion:\s*reduce/);

  // Props support
  assertMatch(code, /distance\s*=\s*100/);
  assertMatch(code, /direction\s*=\s*["']vertical["']/);
  assertMatch(code, /duration\s*=\s*0\.8/);
  assertMatch(code, /ease\s*=\s*["']power3\.out["']/);
  assertMatch(code, /blur\s*=\s*0/);
  assertMatch(code, /trigger\s*=\s*["']mount["']/);

  // Failure-safe fallback ensuring elements are not stuck hidden
  assertMatch(code, /catch\s*\(\s*err\s*\)/);
  assertMatch(code, /style\.opacity\s*=\s*["']1["']/);
  assertMatch(code, /style\.visibility\s*=\s*["']visible["']/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. HOMEPAGE HERO INTEGRATION & PRESERVATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("HERO-1: Homepage Hero integrates AnimatedContent with staggered sequence", () => {
  const code = Deno.readTextFileSync(HOME_PAGE_PATH);

  // Imported AnimatedContent
  assertMatch(
    code,
    /import\s+AnimatedContent\s+from\s+["'](\.\.\/components|@\/components)\/AnimatedContent["']/,
  );

  // Eyebrow badge: 35px vertical, delay 0, mount trigger
  assertMatch(code, /<AnimatedContent[^>]*distance=\{35\}[^>]*delay=\{0\}[^>]*trigger="mount"/);

  // Heading: 40px vertical, blur 3, delay 0.12, mount trigger
  assertMatch(
    code,
    /<AnimatedContent[^>]*distance=\{40\}[^>]*blur=\{3\}[^>]*delay=\{0\.12\}[^>]*trigger="mount"/,
  );

  // Description: 35px vertical, delay 0.24, mount trigger
  assertMatch(code, /<AnimatedContent[^>]*distance=\{35\}[^>]*delay=\{0\.24\}[^>]*trigger="mount"/);

  // Dual CTAs: 30px vertical, delay 0.36, mount trigger
  assertMatch(code, /<AnimatedContent[^>]*distance=\{30\}[^>]*delay=\{0\.36\}[^>]*trigger="mount"/);
});

Deno.test("HERO-2: Homepage Hero preserves all essential banner elements and CTAs", () => {
  const code = Deno.readTextFileSync(HOME_PAGE_PATH);

  // Desktop banner & Mobile banner preserved
  assertMatch(code, /heroBanner/);
  assertMatch(code, /mobileHeroBanner/);

  // Preserves hero responsiveness & dimensions
  assertMatch(code, /md:min-h-\[min\(680px,90svh\)\]/);

  // CTA Links preserved
  assertMatch(code, /to="\/products"/);
  assertMatch(code, /Shop Products/);
  assertMatch(code, /to="\/services"/);
  assertMatch(code, /Explore Services/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GENUINE GOOGLE REVIEWS DATA STRUCTURE (8 SOURCED REVIEWS)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("REV-1: Google review dataset contains all 8 genuine reviews from Google Maps screenshots", () => {
  const code = Deno.readTextFileSync(GOOGLE_REVIEWS_DATA_PATH);

  // GOOGLE_MAPS_REVIEW_URL points to IT HUB verified Google Maps listing
  assertEquals(GOOGLE_MAPS_REVIEW_URL, "https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8");

  // Exactly 8 genuine reviews
  assertEquals(Array.isArray(googleReviews), true);
  assertEquals(googleReviews.length, 8);

  // Verify all 8 customer names are present
  const names = googleReviews.map((r) => r.authorName);
  assertEquals(names.includes("Sony Joseph"), true);
  assertEquals(names.includes("Narayanan Namboothiry"), true);
  assertEquals(names.includes("Robin Aj"), true);
  assertEquals(names.includes("Amitha Ekram"), true);
  assertEquals(names.includes("Arnols Mr"), true);
  assertEquals(names.includes("Edwin"), true);
  assertEquals(names.includes("Muhammed Yaseen"), true);
  assertEquals(names.includes("Aby Varghese"), true);

  // All ratings are 5 stars
  for (const review of googleReviews) {
    assertEquals(review.rating, 5);
  }

  // Verify Review 8 (Aby Varghese) is truncated with ellipsis and does not have invented continuation
  const abyReview = googleReviews.find((r) => r.authorName === "Aby Varghese");
  assertEquals(Boolean(abyReview), true);
  assertEquals(abyReview?.isTruncated, true);
  assertEquals(abyReview?.text.endsWith("..."), true);
  assertMatch(abyReview?.text || "", /choose one motherboard over another\.\.\.$/);

  // Verify no placeholder strings exist in reviews data file
  assertNotMatch(code, /John Doe/i);
  assertNotMatch(code, /Jane Smith/i);
  assertNotMatch(code, /Lorem ipsum/i);
});

Deno.test("REV-2: GoogleCustomerReview data contract validation for each review", () => {
  for (const review of googleReviews) {
    assertEquals(review.rating, 5);
    assertEquals(review.authorName.length > 0, true);
    assertEquals(review.text.length > 0, true);
    assertEquals(review.relativeTimeDescription.length > 0, true);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GOOGLE REVIEW SHOWCASE & MARQUEE ANIMATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SHOW-1: GoogleReviewShowcase renders marquee, modal interaction, and screen reader duplication handling", () => {
  const code = Deno.readTextFileSync(SHOWCASE_COMPONENT_PATH);

  // Heading requirement
  assertMatch(code, /What Our Customers Say/);
  assertMatch(code, /Authentic feedback from verified Google Maps visitors/);

  // Official Google Logo SVG present
  assertMatch(code, /function GoogleLogo/);

  // Read More modal interaction present
  assertMatch(code, /setActiveReviewModal/);
  assertMatch(code, /Read more/);

  // Duplicate track elements hidden from screen readers and keyboard navigation
  assertMatch(code, /google-reviews-marquee-duplicate/);
  assertMatch(code, /aria-hidden="true"/);
  assertMatch(code, /tabIndex=\{isDuplicate \? -1 : undefined\}/);

  // 1-5 Star rating component
  assertMatch(code, /function RatingStars/);
});

Deno.test("SHOW-2: Marquee CSS provides 35-45s duration, pause on hover/focus, and reduced-motion static grid", () => {
  const css = Deno.readTextFileSync(SHOWCASE_CSS_PATH);

  // Marquee keyframe with seamless 50% translation for duplicated track
  assertMatch(css, /@keyframes googleReviewsMarquee/);
  assertMatch(css, /transform:\s*translate3d\(-50%,\s*0,\s*0\)/);

  // Desktop duration in 35-45s range (40s)
  assertMatch(css, /animation:\s*googleReviewsMarquee\s+40s\s+linear\s+infinite/);

  // Mobile duration (48s)
  assertMatch(css, /animation-duration:\s*48s/);

  // Pause on hover and focus-within
  assertMatch(css, /:hover\s+\.google-reviews-marquee-track/);
  assertMatch(css, /:focus-within\s+\.google-reviews-marquee-track/);
  assertMatch(css, /animation-play-state:\s*paused/);

  // Accessibility: prefers-reduced-motion fallback displays static grid
  assertMatch(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assertMatch(css, /animation:\s*none\s*!important/);
  assertMatch(css, /display:\s*grid\s*!important/);
  assertMatch(css, /\.google-reviews-marquee-duplicate\s*\{\s*display:\s*none\s*!important/);
});

Deno.test("SHOW-3: Showcase keeps page scrolling, a visible pause control and a stable loop", () => {
  const code = Deno.readTextFileSync(SHOWCASE_COMPONENT_PATH);
  const css = Deno.readTextFileSync(SHOWCASE_CSS_PATH);

  // Vertical swipes stay with the page
  assertMatch(css, /touch-action:\s*pan-y/);
  assertNotMatch(code, /touch-pan-x/);

  // Focusing an off-screen control can't scroll the marquee out of alignment
  assertMatch(css, /overflow:\s*clip/);

  // Hover can't stick on touch devices
  assertMatch(css, /@media\s*\(hover:\s*hover\)\s*\{\s*\.google-reviews-container:hover/);

  // Both halves stay exactly equal because spacing lives inside each item
  assertMatch(css, /padding-inline:\s*calc\(var\(--review-card-gap\)\s*\/\s*2\)/);

  // Visible pause control, and the marquee container is no longer a focus stop
  assertMatch(code, /Pause reviews/);
  assertNotMatch(code, /tabIndex=\{0\}/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ABOUT PAGE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("ABOUT-1: Information.tsx embeds GoogleReviewShowcase directly beneath the 4.8 rating section", () => {
  const code = Deno.readTextFileSync(ABOUT_PAGE_PATH);

  // Import check
  assertMatch(
    code,
    /import\s+GoogleReviewShowcase\s+from\s+["'](\.\.\/components|@\/components)\/GoogleReviewShowcase["']/,
  );

  // GoogleReviewShowcase rendered inside the Trusted by local customers container
  assertMatch(code, /Trusted by local customers\./);
  assertMatch(code, /<GoogleReviewShowcase\s*\/>/);

  // 4.8/5 rating preserved
  assertMatch(code, /4\.8\/5/);
});

Deno.test("ABOUT-2: Information.tsx company history timeline and narrative accurately reflect 2011 and 2026 milestones", () => {
  const code = Deno.readTextFileSync(ABOUT_PAGE_PATH);

  // 1. Timeline array verification
  assertMatch(
    code,
    /\[\s*["']2011["'],\s*["']IT HUB Founded["'],\s*["']Started with IT products, sales, and technical services\.["'],?\s*\]/,
  );
  assertMatch(
    code,
    /\[\s*["']2026["'],\s*["']Mobile Technology["'],\s*["']Expanded into mobile phone sales and accessories\.["'],?\s*\]/,
  );
  assertMatch(
    code,
    /\[\s*["']2026["'],\s*["']Software & Digital Solutions["'],\s*["']Entered the software development field, offering website development, web applications, and custom software solutions\.["'],?\s*\]/,
  );

  // 2. Narrative verification: 2026 exclusively covers mobile technology
  assertMatch(
    code,
    /In 2026, we expanded into the mobile technology segment, adding mobile phone sales and\s+accessories/,
  );

  // 3. Narrative verification: 2026 explicitly introduces software development
  assertMatch(code, /In 2026, IT HUB entered the software development and digital solutions field/);
  assertMatch(code, /website development, web applications, and custom software solutions/);

  // 4. Zero references to 2016 anywhere in Information.tsx
  assertNotMatch(code, /2016/);

  // 5. Founding milestone preserved
  assertMatch(code, /Founded in 2011/);
  assertMatch(code, /Serving customers since 2011/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. GLASSMORPHIC DESKTOP NAVIGATION PILL ENHANCEMENT
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("GLASS-1: Desktop navigation pill exhibits glassmorphism styling and animation preservation", () => {
  const css = Deno.readTextFileSync("src/components/GooeyNav.css");
  const compCode = Deno.readTextFileSync("src/components/GooeyNav.tsx");
  const layoutCode = Deno.readTextFileSync("src/components/Layout.tsx");

  // 1. CSS: Semi-transparent white background, 16px blur with WebKit, border, and rounded pill
  assertMatch(css, /\.gooey-nav--framed/);
  assertMatch(css, /border-radius:\s*999px/);
  assertMatch(css, /border:\s*1px\s+solid/);
  assertMatch(css, /-webkit-backdrop-filter:\s*blur\(16px\)/);
  assertMatch(css, /backdrop-filter:\s*blur\(16px\)/);

  // 2. THEMES: Light theme glassmorphic parameters
  assertMatch(compCode, /"--gn-frame":\s*["']rgba\(255,\s*255,\s*255,\s*0\.65\)["']/);
  assertMatch(compCode, /"--gn-frame-border":\s*["']rgba\(255,\s*255,\s*255,\s*0\.75\)["']/);
  assertMatch(compCode, /"--gn-ink":\s*["']#0a1e4a["']/);

  // 3. Layout: GooeyNav blue active indicator and animations strictly preserved
  assertMatch(layoutCode, /<GooeyNav/);
  assertMatch(layoutCode, /color="#1a4fd6"/);
  assertMatch(layoutCode, /activeTextColor="#ffffff"/);
  assertMatch(layoutCode, /hoverEffect=\{true\}/);
  assertMatch(layoutCode, /frame=\{true\}/);
});
