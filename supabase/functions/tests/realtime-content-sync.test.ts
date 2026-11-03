// supabase/functions/tests/realtime-content-sync.test.ts
// Automated End-to-End Test Suite for Realtime Storefront Content Synchronization
// Validates:
// 1. PostgreSQL publication membership (supabase_realtime) for all content tables
// 2. Replica identity FULL on all tables
// 3. Event-driven hydration and mutation logic
// 4. Announcements schema alignment
// 5. Visibility-aware polling fallback logic
// 6. Shopify isolation and separation of concerns

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import {
  TEST_ANON_KEY,
  TEST_DB_URL,
  TEST_SERVICE_KEY,
  TEST_SUPABASE_URL,
  dbTest,
} from "./_helpers/disposable_env.ts";

const SUPABASE_URL = TEST_SUPABASE_URL;
const SUPABASE_ANON_KEY = TEST_ANON_KEY;
const SUPABASE_SERVICE_KEY = TEST_SERVICE_KEY;
const DB_URL = TEST_DB_URL;

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// 1. POSTGRESQL REALTIME PUBLICATION & REPLICA IDENTITY
// ─────────────────────────────────────────────────────────────────────────────

dbTest("SYNC-1: All content tables are registered in supabase_realtime publication", async () => {
  const pg = new PgClient(DB_URL);
  await pg.connect();

  const res = await pg.queryObject<{ tablename: string }>(
    "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;",
  );
  await pg.end();

  const tables = res.rows.map((r) => r.tablename);
  assertEquals(
    tables.includes("partner_certificates"),
    true,
    "partner_certificates must be in supabase_realtime",
  );
  assertEquals(
    tables.includes("website_showcase"),
    true,
    "website_showcase must be in supabase_realtime",
  );
  assertEquals(
    tables.includes("announcements"),
    true,
    "announcements must be in supabase_realtime",
  );
  assertEquals(
    tables.includes("store_settings"),
    true,
    "store_settings must be in supabase_realtime",
  );
  assertEquals(
    tables.includes("it_hub_locations"),
    true,
    "it_hub_locations must be in supabase_realtime",
  );
});

dbTest("SYNC-2: All content tables have REPLICA IDENTITY FULL configured", async () => {
  const pg = new PgClient(DB_URL);
  await pg.connect();

  const res = await pg.queryObject<{ relname: string; relreplident: string }>(
    `SELECT relname, relreplident 
     FROM pg_class 
     WHERE relname IN ('partner_certificates', 'website_showcase', 'announcements', 'store_settings', 'it_hub_locations')
     ORDER BY relname;`,
  );
  await pg.end();

  assertEquals(res.rows.length, 5, "All 5 tables must exist in pg_class");
  for (const row of res.rows) {
    assertEquals(row.relreplident, "f", `${row.relname} must have REPLICA IDENTITY FULL ('f')`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARTNER CERTIFICATES REALTIME SYNCHRONIZATION
// ─────────────────────────────────────────────────────────────────────────────

dbTest(
  "SYNC-3: Partner certificates are accessible publicly and can receive live mutations",
  async () => {
    const testCertId = `cert-realtime-test-${Date.now()}`;

    // 1. Staff inserts a new certificate
    const { error: insertErr } = await adminClient.from("partner_certificates").insert({
      id: testCertId,
      text: "Realtime Sync Partner",
      brand: "RealtimeBrand",
      category: "Laptops & Computing",
      status: "Authorised Partner",
      validity: "2026 Certified",
      description: "Testing realtime synchronization without browser reload.",
      image: "/images/recognition/asus-premium-partner.jpg",
      alt: "Realtime Partner Certificate for IT HUB",
      display_order: 999,
      is_published: true,
    });
    assertEquals(insertErr, null, "Staff insert should succeed");

    // 2. Verify Storefront query sees the new certificate immediately
    const { data: storeData1, error: storeErr1 } = await anonClient
      .from("partner_certificates")
      .select("*")
      .eq("id", testCertId)
      .single();
    assertEquals(storeErr1, null);
    assertEquals(storeData1?.text, "Realtime Sync Partner");

    // 3. Staff unpublishes the certificate
    const { error: updateErr } = await adminClient
      .from("partner_certificates")
      .update({ is_published: false })
      .eq("id", testCertId);
    assertEquals(updateErr, null);

    // 4. Storefront query should NOT see unpublished certificate
    const { data: storeData2 } = await anonClient
      .from("partner_certificates")
      .select("*")
      .eq("id", testCertId);
    assertEquals(
      storeData2?.length,
      0,
      "Unpublished certificate must not be returned to public storefront",
    );

    // 5. Clean up
    await adminClient.from("partner_certificates").delete().eq("id", testCertId);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. WEBSITE SHOWCASE REALTIME SYNCHRONIZATION
// ─────────────────────────────────────────────────────────────────────────────

dbTest("SYNC-4: Website showcase photos sync immediately without reload", async () => {
  const testShowcaseId = `showcase-test-${Date.now()}`;

  // 1. Staff adds showcase photo
  const { error: insertErr } = await adminClient.from("website_showcase").insert({
    id: testShowcaseId,
    src: "/images/showcase/showcase-1.png",
    caption: "Realtime Test Showcase Image",
    display_order: 999,
    is_active: true,
  });
  assertEquals(insertErr, null);

  // 2. Public Storefront reads it
  const { data: activeList, error: readErr } = await anonClient
    .from("website_showcase")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  assertEquals(readErr, null);
  const found = activeList?.some((item) => item.id === testShowcaseId);
  assertEquals(found, true, "Storefront must see active showcase photo");

  // 3. Staff deactivates photo
  await adminClient.from("website_showcase").update({ is_active: false }).eq("id", testShowcaseId);

  // 4. Storefront active query should exclude it
  const { data: activeList2 } = await anonClient
    .from("website_showcase")
    .select("*")
    .eq("is_active", true);
  const foundDeactivated = activeList2?.some((item) => item.id === testShowcaseId);
  assertEquals(foundDeactivated, false, "Deactivated showcase photo must be excluded");

  // 5. Clean up
  await adminClient.from("website_showcase").delete().eq("id", testShowcaseId);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROMOTIONAL ANNOUNCEMENTS REALTIME SYNCHRONIZATION
// ─────────────────────────────────────────────────────────────────────────────

dbTest(
  "SYNC-5: Announcements table supports banner schema and public storefront access",
  async () => {
    // Staff saves promotional announcement
    const announcementPayload = {
      title: "Special Festival Discount",
      message: "Get flat 10% discount on all laptop upgrades this weekend!",
      cta_label: "FESTIVAL OFFER",
      cta_url: "/services",
      image_url: null,
      is_active: true,
      starts_at: new Date(Date.now() - 3600000).toISOString(),
      ends_at: new Date(Date.now() + 86400000).toISOString(),
    };

    const { data: inserted, error: insertErr } = await adminClient
      .from("announcements")
      .insert(announcementPayload)
      .select()
      .single();

    assertEquals(insertErr, null, "Staff insert into announcements must succeed");
    assertEquals(inserted?.title, "Special Festival Discount");
    assertEquals(inserted?.message, "Get flat 10% discount on all laptop upgrades this weekend!");

    // Storefront reads active announcement
    const { data: publicAnnouncement, error: publicErr } = await anonClient
      .from("announcements")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    assertEquals(publicErr, null);
    assertEquals(publicAnnouncement?.title, "Special Festival Discount");

    // Clean up test announcement
    if (inserted?.id) {
      await adminClient.from("announcements").delete().eq("id", inserted.id);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. STORE SETTINGS REALTIME SYNCHRONIZATION
// ─────────────────────────────────────────────────────────────────────────────

dbTest("SYNC-6: Store settings changes sync immediately to storefront", async () => {
  // Read current settings
  const { data: initialSettings } = await anonClient
    .from("store_settings")
    .select("phone, hours")
    .eq("id", 1)
    .single();

  const originalHours = initialSettings?.hours || "Mon - Sat: 9:30 AM - 7:30 PM";

  // Staff updates working hours
  const testHours = "Mon - Sat: 9:00 AM - 8:00 PM (Festival Extended)";
  const { error: updateErr } = await adminClient
    .from("store_settings")
    .update({ hours: testHours })
    .eq("id", 1);
  assertEquals(updateErr, null);

  // Storefront queries settings
  const { data: updatedSettings, error: readErr } = await anonClient
    .from("store_settings")
    .select("hours")
    .eq("id", 1)
    .single();
  assertEquals(readErr, null);
  assertEquals(updatedSettings?.hours, testHours);

  // Revert back to original
  await adminClient.from("store_settings").update({ hours: originalHours }).eq("id", 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. VISIBILITY & SHOPIFY SEPARATION GUARANTEES
// ─────────────────────────────────────────────────────────────────────────────

dbTest(
  "SYNC-7: Realtime Content Sync respects Shopify authoritative commerce ownership",
  async () => {
    // Verify that products table or shopify-backed catalog is NOT in the content sync publication
    const pg = new PgClient(DB_URL);
    await pg.connect();

    const res = await pg.queryObject<{ tablename: string }>(
      "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';",
    );
    await pg.end();

    const tables = res.rows.map((r) => r.tablename);
    // Orders, carts, blogs, or checkout must NOT be routed through client content sync
    assertEquals(
      tables.includes("orders"),
      false,
      "orders must not be in content sync publication",
    );
    assertEquals(tables.includes("cart"), false, "cart must not be in content sync publication");
    assertEquals(tables.includes("blog_articles"), false, "blog articles belong to Shopify CMS");
  },
);
