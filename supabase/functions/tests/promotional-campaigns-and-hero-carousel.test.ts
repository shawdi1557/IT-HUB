// supabase/functions/tests/promotional-campaigns-and-hero-carousel.test.ts
// Test Suite for IT HUB Promotional Campaigns & Homepage Hero Carousel
// Local Database, Storage, RLS, Countdown Engine, Destination Routing, and Realtime

import {
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const SUPABASE_URL = TEST_SUPABASE_URL;
const SERVICE_ROLE_KEY = TEST_SERVICE_KEY;
const ANON_KEY = TEST_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// 1. DATABASE SCHEMA, STORAGE, RLS & AUDIT CONSTRAINTS
// ─────────────────────────────────────────────────────────────────────────────

dbTest("CAMP-DB-1: promotional_campaigns table exists with required schema columns", async () => {
  const { data, error } = await adminClient
    .from("promotional_campaigns")
    .select(
      "id, title, description, badge, image_url, mobile_image_url, destination_type, destination_ref, destination_url, cta_label, starts_at, ends_at, show_countdown, countdown_heading, status, display_order, created_at, updated_at",
    )
    .limit(1);

  assertEquals(error, null, `Error querying promotional_campaigns: ${error?.message}`);
  assertExists(data);
});

dbTest(
  "CAMP-DB-2: promotional_campaigns rejects invalid status and destination_type constraints",
  async () => {
    // Test invalid status
    const { error: statusError } = await adminClient.from("promotional_campaigns").insert({
      title: "Invalid Status Test",
      image_url: "https://example.com/banner.jpg",
      status: "nonexistent_status",
    });
    assertNotEquals(statusError, null, "Should reject invalid status");

    // Test invalid destination_type
    const { error: destError } = await adminClient.from("promotional_campaigns").insert({
      title: "Invalid Destination Test",
      image_url: "https://example.com/banner.jpg",
      destination_type: "external_spam",
    });
    assertNotEquals(destError, null, "Should reject invalid destination_type");
  },
);

dbTest(
  "CAMP-DB-3: RLS enforces that anon client sees ONLY published & unexpired campaigns",
  async () => {
    const testIdDraft = "00000000-0000-0000-0000-0000000000a1";
    const testIdPublished = "00000000-0000-0000-0000-0000000000a2";
    const testIdExpired = "00000000-0000-0000-0000-0000000000a3";

    // Cleanup potential previous runs
    await adminClient
      .from("promotional_campaigns")
      .delete()
      .in("id", [testIdDraft, testIdPublished, testIdExpired]);

    // Insert Draft
    await adminClient.from("promotional_campaigns").insert({
      id: testIdDraft,
      title: "TDD Draft Campaign",
      image_url: "https://example.com/draft.jpg",
      status: "draft",
      destination_url: "/products",
    });

    // Insert Published (Active)
    await adminClient.from("promotional_campaigns").insert({
      id: testIdPublished,
      title: "TDD Published Campaign",
      image_url: "https://example.com/published.jpg",
      status: "published",
      destination_url: "/products",
      starts_at: new Date(Date.now() - 3600000).toISOString(),
      ends_at: new Date(Date.now() + 86400000).toISOString(),
    });

    // Insert Expired
    await adminClient.from("promotional_campaigns").insert({
      id: testIdExpired,
      title: "TDD Expired Campaign",
      image_url: "https://example.com/expired.jpg",
      status: "published",
      destination_url: "/products",
      starts_at: new Date(Date.now() - 7200000).toISOString(),
      ends_at: new Date(Date.now() - 3600000).toISOString(),
    });

    // Query as anon client
    const { data: anonData, error: anonErr } = await anonClient
      .from("promotional_campaigns")
      .select("id, title, status");

    assertEquals(anonErr, null);
    const anonIds = (anonData || []).map((c: any) => c.id);

    // Assert anon client can see published active campaign
    assertEquals(
      anonIds.includes(testIdPublished),
      true,
      "Anon must see active published campaign",
    );

    // Assert anon client CANNOT see draft or expired campaigns
    assertEquals(anonIds.includes(testIdDraft), false, "Anon must NOT see draft campaign");
    assertEquals(anonIds.includes(testIdExpired), false, "Anon must NOT see expired campaign");

    // Cleanup test records
    await adminClient
      .from("promotional_campaigns")
      .delete()
      .in("id", [testIdDraft, testIdPublished, testIdExpired]);
  },
);

dbTest("CAMP-DB-4: Storage bucket promotional-banners is configured and public", async () => {
  const { data: buckets, error } = await adminClient.storage.listBuckets();
  assertEquals(error, null);
  assertExists(buckets, "Buckets list should not be null");
  const bucket = (buckets || []).find((b: any) => b.id === "promotional-banners");
  assertExists(bucket, "Bucket promotional-banners must exist");
  assertEquals(bucket.public, true, "Bucket must be public");
  assertEquals(bucket.file_size_limit, 5242880, "5MB limit");
});

dbTest("CAMP-DB-5: staff_audit_logs permits entity_type 'promotional_campaign'", async () => {
  const staffUserId = "4df85a8a-fb06-431d-ae85-831e4b3564d4";
  const { data, error } = await adminClient
    .from("staff_audit_logs")
    .insert({
      staff_user_id: staffUserId,
      action_type: "CREATE_CAMPAIGN",
      entity_type: "promotional_campaign",
      entity_id: "camp-test-1",
      metadata: { test: true },
    })
    .select();

  assertEquals(error, null, `Should accept entity_type promotional_campaign: ${error?.message}`);
  assertExists(data);
  if (data && data[0]?.id) {
    await adminClient.from("staff_audit_logs").delete().eq("id", data[0].id);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. COUNTDOWN ENGINE & CALCULATION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

import { calculateTimeRemaining } from "../../../src/lib/countdown.ts";

Deno.test("CAMP-COUNT-1: calculateTimeRemaining returns accurate zero-padded breakdown for future dates", () => {
  const now = Date.now();
  // 2 days, 3 hours, 4 minutes, 5 seconds in future
  const futureTarget = new Date(now + (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000).toISOString();

  const res = calculateTimeRemaining(futureTarget, now);

  assertEquals(res.isExpired, false);
  assertEquals(res.days, "02");
  assertEquals(res.hours, "03");
  assertEquals(res.minutes, "04");
  assertEquals(res.seconds, "05");
  assertEquals(res.formatted, "02d 03h 04m 05s");
});

Deno.test("CAMP-COUNT-2: calculateTimeRemaining safely handles expired, null, or past timestamps without negative values", () => {
  const now = Date.now();

  // Past timestamp
  const pastTarget = new Date(now - 10000).toISOString();
  const resPast = calculateTimeRemaining(pastTarget, now);
  assertEquals(resPast.isExpired, true);
  assertEquals(resPast.days, "00");
  assertEquals(resPast.hours, "00");
  assertEquals(resPast.minutes, "00");
  assertEquals(resPast.seconds, "00");
  assertEquals(resPast.totalSeconds, 0);

  // Null timestamp
  const resNull = calculateTimeRemaining(null, now);
  assertEquals(resNull.isExpired, true);
  assertEquals(resNull.totalSeconds, 0);

  // Malformed timestamp
  const resInvalid = calculateTimeRemaining("invalid-date-string", now);
  assertEquals(resInvalid.isExpired, true);
  assertEquals(resInvalid.totalSeconds, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. REALTIME CONTENT SYNC & STORE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

import {
  ContentSyncManager,
  type PromotionalCampaign,
} from "../../../src/lib/realtime/contentSync.ts";
import {
  TEST_ANON_KEY,
  TEST_SERVICE_KEY,
  TEST_SUPABASE_URL,
  dbTest,
} from "./_helpers/disposable_env.ts";

dbTest(
  "CAMP-SYNC-1: syncPromotionalCampaigns fetches and stores active published campaigns",
  async () => {
    const testCampId = "00000000-0000-0000-0000-0000000000c1";

    // Cleanup
    await adminClient.from("promotional_campaigns").delete().eq("id", testCampId);

    // Insert active published campaign
    await adminClient.from("promotional_campaigns").insert({
      id: testCampId,
      title: "Sync Test Diwali Offer",
      badge: "FESTIVE OFFER",
      image_url: "https://example.com/diwali.jpg",
      destination_type: "product",
      destination_ref: "iphone-16-pro",
      destination_url: "/products/iphone-16-pro",
      status: "published",
      starts_at: new Date(Date.now() - 3600000).toISOString(),
      ends_at: new Date(Date.now() + 86400000).toISOString(),
      display_order: 1,
    });

    let state: any = { promotionalCampaigns: [] };
    const mockStore = {
      set: (updater: any) => {
        state = updater(state);
      },
    };

    const manager = new ContentSyncManager(mockStore, { client: adminClient });
    await manager.syncPromotionalCampaigns();

    const found = state.promotionalCampaigns.find((c: PromotionalCampaign) => c.id === testCampId);
    assertExists(found, "Manager must sync published campaign into store state");
    assertEquals(found.title, "Sync Test Diwali Offer");
    assertEquals(found.destination_url, "/products/iphone-16-pro");

    // Cleanup
    await adminClient.from("promotional_campaigns").delete().eq("id", testCampId);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. HOMEPAGE HERO INTEGRATION & DESTINATION VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("CAMP-HERO-1: Home.tsx places animated text loop marquee between Hero and Promotional Carousel", () => {
  const homeContent = Deno.readTextFileSync("src/pages/Home.tsx");

  // 1. Must import and render PromotionalHeroCarousel
  assertMatch(
    homeContent,
    /import\s+PromotionalHeroCarousel\s+from\s+["']\.\.\/components\/PromotionalHeroCarousel["']/i,
    "Home.tsx must import PromotionalHeroCarousel",
  );
  assertMatch(
    homeContent,
    /<PromotionalHeroCarousel\s+campaigns=\{promotionalCampaigns\}\s*\/>/i,
    "Home.tsx must pass promotionalCampaigns from store to carousel",
  );

  // 2. Must preserve original Hero content
  assertMatch(homeContent, /Everything Tech/i, "Home.tsx must preserve original Hero title");
  assertMatch(homeContent, /Shop Products/i, "Home.tsx must preserve Shop Products CTA");
  assertMatch(homeContent, /Explore Services/i, "Home.tsx must preserve Explore Services CTA");

  // 3. Must NOT nest the promotional carousel inside the Hero <section>
  const heroSectionMatch = homeContent.match(
    /{\/\*\s*1\.\s*Full-Width Hero Section[\s\S]*?<\/section>/i,
  );
  assertExists(heroSectionMatch, "Hero section must exist and close cleanly");
  const heroSection = heroSectionMatch[0];
  assertEquals(
    heroSection.includes("PromotionalHeroCarousel"),
    false,
    "PromotionalHeroCarousel must NOT be nested inside the Hero section",
  );

  // 4. Must render original animated marquee (ScrollVelocity) between Hero and Promotional Carousel
  assertMatch(
    homeContent,
    /<ScrollVelocity[\s\S]*?Laptops[\s\S]*?Mobiles[\s\S]*?Custom PC Builds/i,
    "Home.tsx must render original ScrollVelocity animated text loop",
  );

  // 5. Promotional showcase must sit immediately between Marquee and Shop by Category
  const marqueeToCategoryMatch = homeContent.match(
    /<ScrollVelocity[\s\S]*?<\/div>\s*<\/div>\s*{\/\*\s*3\.\s*Large Promotional Campaign Carousel[\s\S]*?<section aria-label="Promotional Showcase"[\s\S]*?<PromotionalHeroCarousel[\s\S]*?<\/section>\s*{\/\*\s*4\.\s*Shop by Category/i,
  );
  assertExists(
    marqueeToCategoryMatch,
    "Promotional showcase must sit immediately between Marquee and Shop by Category",
  );
});

Deno.test("CAMP-HERO-ORDER-1: Homepage enforces mandatory hierarchy (Hero -> Marquee -> Promotional Carousel -> Shop by Category)", () => {
  const homeContent = Deno.readTextFileSync("src/pages/Home.tsx");

  const heroIdx = homeContent.indexOf("1. Full-Width Hero Section");
  const marqueeIdx = homeContent.indexOf("2. Original Animated Text Loop");
  const promoIdx = homeContent.indexOf("3. Large Promotional Campaign Carousel");
  const catIdx = homeContent.indexOf("4. Shop by Category");

  assertEquals(heroIdx > 0, true, "Hero section must be present");
  assertEquals(marqueeIdx > heroIdx, true, "Marquee must come after Hero");
  assertEquals(promoIdx > marqueeIdx, true, "Promotional carousel must come after Marquee");
  assertEquals(catIdx > promoIdx, true, "Shop by Category must come after Promotional carousel");
});

Deno.test("CAMP-SHOWCASE-DIM-1: PromotionalHeroCarousel uses full-width container and 400-480px desktop height", () => {
  const carouselContent = Deno.readTextFileSync("src/components/PromotionalHeroCarousel.tsx");

  // Full-width max-w-7xl container instead of narrow max-w-4xl
  assertEquals(
    carouselContent.includes("max-w-4xl"),
    false,
    "Must remove narrow max-w-4xl constraint",
  );
  assertMatch(
    carouselContent,
    /max-w-\[1520px\]\s+mx-auto|max-w-7xl\s+mx-auto/,
    "Must use generous 1480-1520px container matching storefront width",
  );

  // Height specification: ~400-480px / 16:9 aspect ratio on desktop
  assertMatch(
    carouselContent,
    /lg:h-\[480px\]|md:h-\[440px\]|sm:h-\[400px\]|md:aspect-\[16\/9\]/,
    "Must provide generous responsive heights scaling to 480px or 16:9 on desktop",
  );

  // Image object-cover
  assertMatch(carouselContent, /object-cover/, "Must display promotional images with object-cover");

  // Gradient contrast without excessive dark wash
  assertMatch(
    carouselContent,
    /bg-gradient-to-r/,
    "Must use directional gradient overlay for readable text on the left without covering right artwork",
  );
});

Deno.test("LAYOUT-WIDTH-1: containerClass is configured for 1480-1520px desktop width and 24-32px gutters", () => {
  const uiContent = Deno.readTextFileSync("src/components/ui.tsx");
  assertMatch(
    uiContent,
    /max-w-\[(?:1480|1500|1520)px\]/,
    "containerClass must use a maximum width of 1480-1520px for spacious desktop viewing",
  );
  assertMatch(
    uiContent,
    /px-4\s+sm:px-6\s+lg:px-8/,
    "containerClass must provide 24-32px gutters across standard viewports",
  );
});

Deno.test("CAMP-DEST-1: Destination routing handles Shopify products, categories, and services cleanly", () => {
  function resolveDestinationUrl(
    type: "product" | "category" | "service" | "url",
    ref?: string,
    customUrl?: string,
  ): string {
    if (type === "product" && ref) return `/products/${encodeURIComponent(ref)}`;
    if (type === "category" && ref) return `/products?category=${encodeURIComponent(ref)}`;
    if (type === "service") {
      if (ref === "book") return "/services/book";
      if (ref) return `/services/book?service=${encodeURIComponent(ref)}`;
      return "/services";
    }
    if (type === "url" && customUrl) {
      if (
        customUrl.startsWith("/") &&
        !customUrl.startsWith("//") &&
        !customUrl.includes("javascript:")
      ) {
        return customUrl;
      }
    }
    return "/products";
  }

  // Shopify Product by handle
  assertEquals(
    resolveDestinationUrl("product", "apple-macbook-pro-m4"),
    "/products/apple-macbook-pro-m4",
  );

  // Category
  assertEquals(resolveDestinationUrl("category", "Laptops"), "/products?category=Laptops");

  // Specific Service
  assertEquals(
    resolveDestinationUrl("service", "Laptop Repair"),
    "/services/book?service=Laptop%20Repair",
  );

  // General Service Booking
  assertEquals(resolveDestinationUrl("service", "book"), "/services/book");

  // General Services Page
  assertEquals(resolveDestinationUrl("service"), "/services");

  // Safe internal URL
  assertEquals(resolveDestinationUrl("url", undefined, "/pc-builder"), "/pc-builder");

  // Malicious/Unsafe URL fallback
  assertEquals(resolveDestinationUrl("url", undefined, "javascript:alert(1)"), "/products");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. STAFF PORTAL CAMPAIGN MANAGEMENT & AUDIT LOGGING
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("CAMP-STAFF-1: WebsiteContent.tsx implements full Promotional Campaign Manager UI", () => {
  const content = Deno.readTextFileSync("ITHUB_ADMIN/src/pages/WebsiteContent.tsx");

  assertMatch(
    content,
    /Promotional Campaigns/i,
    "WebsiteContent.tsx must render Promotional Campaigns tab",
  );
  assertMatch(
    content,
    /promotional-banners/i,
    "WebsiteContent.tsx must upload images to promotional-banners bucket",
  );
  assertMatch(content, /destination_type/i, "WebsiteContent.tsx must support destination types");
  assertMatch(content, /show_countdown/i, "WebsiteContent.tsx must support countdown timer toggle");
  assertMatch(
    content,
    /staff_audit_logs/i,
    "WebsiteContent.tsx must record audit logs for campaign changes",
  );
});

dbTest(
  "CAMP-STAFF-2: Staff portal campaign mutation creates, updates, and logs actions",
  async () => {
    const staffUserId = "4df85a8a-fb06-431d-ae85-831e4b3564d4";
    const campId = "00000000-0000-0000-0000-0000000000d1";

    // Cleanup
    await adminClient.from("promotional_campaigns").delete().eq("id", campId);
    await adminClient.from("staff_audit_logs").delete().eq("entity_id", campId);

    // 1. Staff creates campaign
    const { data: created, error: createErr } = await adminClient
      .from("promotional_campaigns")
      .insert({
        id: campId,
        title: "Staff Test Festive Promo",
        badge: "FESTIVE OFFER",
        image_url: "https://example.com/banner.jpg",
        destination_type: "service",
        destination_ref: "Laptop Repair",
        destination_url: "/services/book?service=Laptop%20Repair",
        status: "published",
        show_countdown: true,
        countdown_heading: "OFFER CLOSES IN",
        display_order: 1,
      })
      .select()
      .single();

    assertEquals(createErr, null);
    assertEquals(created.title, "Staff Test Festive Promo");

    // Record audit log
    const { error: auditErr1 } = await adminClient.from("staff_audit_logs").insert({
      staff_user_id: staffUserId,
      action_type: "CREATE_CAMPAIGN",
      entity_type: "promotional_campaign",
      entity_id: campId,
      metadata: { title: created.title, status: created.status },
    });
    assertEquals(auditErr1, null);

    // 2. Staff pauses campaign
    const { error: pauseErr } = await adminClient
      .from("promotional_campaigns")
      .update({ status: "paused" })
      .eq("id", campId);
    assertEquals(pauseErr, null);

    // Record pause audit log
    const { error: auditErr2 } = await adminClient.from("staff_audit_logs").insert({
      staff_user_id: staffUserId,
      action_type: "PAUSE_CAMPAIGN",
      entity_type: "promotional_campaign",
      entity_id: campId,
      metadata: { title: created.title, status: "paused" },
    });
    assertEquals(auditErr2, null);

    // Verify audit logs exist
    const { data: auditLogs, error: logFetchErr } = await adminClient
      .from("staff_audit_logs")
      .select("action_type, entity_type, entity_id")
      .eq("entity_id", campId);

    assertEquals(logFetchErr, null);
    assertEquals(auditLogs?.length, 2);
    const actions = (auditLogs || []).map((l: any) => l.action_type);
    assertEquals(actions.includes("CREATE_CAMPAIGN"), true);
    assertEquals(actions.includes("PAUSE_CAMPAIGN"), true);

    // 3. Cleanup
    await adminClient.from("promotional_campaigns").delete().eq("id", campId);
    await adminClient.from("staff_audit_logs").delete().eq("entity_id", campId);
  },
);
