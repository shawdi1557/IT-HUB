// supabase/functions/tests/mobile-storefront-navigation.test.ts
// Automated test suite for IT HUB Mobile-First Storefront UI/UX

import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const repoRoot = path.resolve(path.fromFileUrl(import.meta.url), "../../../..");
const srcDir = path.join(repoRoot, "src");

// Helper to check route active state mapping
export function getMobileActiveNav(
  pathname: string,
): "home" | "shop" | "services" | "blog" | "account" | null {
  if (pathname === "/") return "home";
  if (
    pathname.startsWith("/products") ||
    pathname.startsWith("/second-hand") ||
    pathname.startsWith("/sell")
  ) {
    return "shop";
  }
  if (
    pathname.startsWith("/services") ||
    pathname.startsWith("/track-service") ||
    pathname.startsWith("/service-success")
  ) {
    return "services";
  }
  if (pathname.startsWith("/blog")) return "blog";
  if (pathname.startsWith("/account")) return "account";
  return null;
}

Deno.test("MSN-1: Route active state mapping resolves all 5 mobile bottom nav destinations correctly", () => {
  assertEquals(getMobileActiveNav("/"), "home");
  assertEquals(getMobileActiveNav("/products"), "shop");
  assertEquals(getMobileActiveNav("/products/iphone-16"), "shop");
  assertEquals(getMobileActiveNav("/second-hand"), "shop");
  assertEquals(getMobileActiveNav("/services"), "services");
  assertEquals(getMobileActiveNav("/services/book"), "services");
  assertEquals(getMobileActiveNav("/track-service"), "services");
  assertEquals(getMobileActiveNav("/blog"), "blog");
  assertEquals(getMobileActiveNav("/blog/rtx-50-series-review"), "blog");
  assertEquals(getMobileActiveNav("/account"), "account");
  assertEquals(getMobileActiveNav("/account/orders"), "account");
  assertEquals(getMobileActiveNav("/unknown-route"), null);
});

Deno.test("MSN-2: MobileHeader component has Row 2 search bar removed while preserving Row 1 navigation", () => {
  const filePath = path.join(srcDir, "components", "MobileHeader.tsx");
  const content = Deno.readTextFileSync(filePath);

  // Row 1 elements must be preserved
  assertMatch(content, /Menu/i, "Row 1 must contain menu button");
  assertMatch(content, /Logo/i, "Row 1 must contain centered Logo");
  assertMatch(content, /ShoppingBag|cartCount/i, "Row 1 must contain Cart trigger");
  assertMatch(content, /UserRound|\/account/i, "Row 1 must contain Account trigger");

  // Row 2 mobile search bar must be removed
  const hasMobileSearchInput =
    /<input[^>]*type=["']search["']/i.test(content) ||
    /Search laptops, mobiles, accessories/i.test(content);
  assertEquals(
    hasMobileSearchInput,
    false,
    "MobileHeader must not contain the second-row search input",
  );

  // Layout check: only h-14 row 1 header height, no pb-2.5 row 2 padding
  assertEquals(
    /px-3 pb-2\.5 pt-0\.5/.test(content),
    false,
    "MobileHeader must not contain row 2 padding container",
  );
});

Deno.test("MSN-3: MobileBottomNav component defines exactly 5 destinations with proper routes", () => {
  const filePath = path.join(srcDir, "components", "MobileBottomNav.tsx");
  const content = Deno.readTextFileSync(filePath);

  // Ensure 5 destinations in configuration or JSX
  assertMatch(content, /to:\s*["']\/["']|to=["']\/["']/i, "Must have Home link");
  assertMatch(content, /to:\s*["']\/products["']|to=["']\/products["']/i, "Must have Shop link");
  assertMatch(
    content,
    /to:\s*["']\/services["']|to=["']\/services["']/i,
    "Must have Services link",
  );
  assertMatch(content, /to:\s*["']\/blog["']|to=["']\/blog["']/i, "Must have Blog link");
  assertMatch(content, /to:\s*["']\/account["']|to=["']\/account["']/i, "Must have Account link");

  // Ensure hidden on desktop
  assertMatch(content, /md:hidden/i, "Must be hidden on medium screens and up");
});

Deno.test("MSN-4: MobileNavDrawer component provides structured categories", () => {
  const filePath = path.join(srcDir, "components", "MobileNavDrawer.tsx");
  const content = Deno.readTextFileSync(filePath);

  assertMatch(content, /Shopping/i, "Drawer must have Shopping section");
  assertMatch(content, /Services/i, "Drawer must have Services section");
  assertMatch(content, /Discover/i, "Drawer must have Discover section");
  assertMatch(content, /Account/i, "Drawer must have Account section");

  // Specific required links
  assertMatch(content, /\/pc-builder/i, "Drawer must link to PC Builder");
  assertMatch(content, /Find My PC/i, "Drawer must include Find My PC");
});

Deno.test("MSN-5: Layout.tsx integrates mobile header, bottom nav, drawer and safe-area padding", () => {
  const filePath = path.join(srcDir, "components", "Layout.tsx");
  const content = Deno.readTextFileSync(filePath);

  assertMatch(content, /MobileHeader/i, "Layout must mount MobileHeader");
  assertMatch(content, /MobileBottomNav/i, "Layout must mount MobileBottomNav");
  assertMatch(content, /MobileNavDrawer/i, "Layout must mount MobileNavDrawer");
  assertMatch(
    content,
    /pb-20|pb-24|pb-safe/i,
    "Layout must include bottom padding for fixed mobile nav",
  );
});

Deno.test("MSN-6: Home.tsx integrates horizontal category browsing and blog articles preview", () => {
  const filePath = path.join(srcDir, "pages", "Home.tsx");
  const content = Deno.readTextFileSync(filePath);

  assertMatch(content, /calculateCategoryCounts/i, "Home must use dynamic category counts");
  assertMatch(
    content,
    /overflow-x-auto|snap-x/i,
    "Home category section must support horizontal scrolling",
  );
  assertMatch(content, /fetchBlogArticles/i, "Home must incorporate blog articles integration");
});

Deno.test("MSN-7: MobileHeader keeps logo horizontally centered with balanced containers and unclipped sizing", () => {
  const filePath = path.join(srcDir, "components", "MobileHeader.tsx");
  const content = Deno.readTextFileSync(filePath);

  // Left and Right containers must be symmetrically balanced (w-20)
  assertMatch(
    content,
    /w-20[\s\S]*?w-20/,
    "Left and Right containers must be symmetrically sized for centered logo",
  );
  assertMatch(
    content,
    /flex-1\s+items-center\s+justify-center/,
    "Logo wrapper must be flex-1 centered",
  );
  assertMatch(
    content,
    /Logo className="h-11\s+w-11/,
    "Logo must specify unclipped responsive height/width",
  );
});

Deno.test("MSN-8: Drawer and Account dropdown include data-lenis-prevent and overscroll-contain for independent scroll", () => {
  const drawerPath = path.join(srcDir, "components", "MobileNavDrawer.tsx");
  const drawerContent = Deno.readTextFileSync(drawerPath);
  assertMatch(drawerContent, /data-lenis-prevent/, "Drawer must prevent Lenis scroll interception");
  assertMatch(drawerContent, /overscroll-contain/, "Drawer must contain overscroll");

  const dropdownPath = path.join(srcDir, "components", "AccountNavDropdown.tsx");
  const dropdownContent = Deno.readTextFileSync(dropdownPath);
  assertMatch(
    dropdownContent,
    /data-lenis-prevent/,
    "Account dropdown must prevent Lenis scroll interception",
  );
  assertMatch(dropdownContent, /overscroll-contain/, "Account dropdown must contain overscroll");
});

Deno.test("MSN-9: ProductCard and Products.tsx enforce min-w-0 and responsive flex layout to eliminate mobile overflow", () => {
  const cardPath = path.join(srcDir, "components", "ProductCard.tsx");
  const cardContent = Deno.readTextFileSync(cardPath);
  assertMatch(
    cardContent,
    /min-w-0\s+w-full/,
    "ProductCard root article must enforce min-w-0 w-full",
  );
  assertMatch(
    cardContent,
    /p-3\s+sm:p-4\s+md:p-5/,
    "ProductCard must have responsive mobile padding",
  );

  const productsPath = path.join(srcDir, "pages", "Products.tsx");
  const productsContent = Deno.readTextFileSync(productsPath);
  assertMatch(
    productsContent,
    /flex-col[\s\S]*?sm:flex-row/,
    "Products search bar must stack on mobile",
  );
});

Deno.test("MSN-10: Category carousel in Home.tsx supports touch-pan-y and clear carousel cue", () => {
  const homePath = path.join(srcDir, "pages", "Home.tsx");
  const homeContent = Deno.readTextFileSync(homePath);
  assertMatch(
    homeContent,
    /touch-pan-y/,
    "Category carousel must support touch-pan-y for vertical page scrolling",
  );
  assertMatch(
    homeContent,
    /overscroll-x-contain/,
    "Category carousel must support overscroll-x-contain",
  );
  assertMatch(
    homeContent,
    /Swipe to explore/i,
    "Category carousel must render a visual carousel hint for mobile users",
  );
});
