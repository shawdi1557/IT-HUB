// supabase/functions/tests/staff-storefront-integration.test.ts
// Automated End-to-End Integration Test Suite for Staff Portal to Customer Storefront
// Tests: Partner Certificates, Website Showcase, Store Settings, Security/RLS, Shopify CMS Integrity

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// 1. CERTIFICATES & PARTNERSHIPS INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("INTG-1: Public storefront query returns 5 active canonical partners and strictly excludes unpublished Intel", async () => {
  const { data, error } = await anonClient
    .from("partner_certificates")
    .select("*")
    .eq("is_published", true)
    .order("display_order", { ascending: true });

  assertEquals(error, null, "Query must not fail");
  assertEquals(Array.isArray(data), true);
  assertEquals(data!.length, 5, "Must have exactly 5 published canonical partner records");

  const ids = data!.map((c) => c.id);
  assertEquals(ids.includes("cert-asus"), true, "Must include cert-asus");
  assertEquals(ids.includes("cert-canon"), true, "Must include cert-canon");
  assertEquals(ids.includes("cert-epson"), true, "Must include cert-epson");
  assertEquals(ids.includes("cert-numeric"), true, "Must include cert-numeric");
  assertEquals(ids.includes("cert-iggis"), true, "Must include cert-iggis");
  assertEquals(
    ids.includes("cert-intel"),
    false,
    "Intel Partner Alliance must NOT be in public storefront query",
  );

  // Verify staff query retains all 6 records with cert-intel is_published = false
  const { data: allData, error: allErr } = await adminClient
    .from("partner_certificates")
    .select("*")
    .order("display_order", { ascending: true });

  assertEquals(allErr, null);
  assertEquals(allData!.length >= 6, true, "Staff query must retain all 6 records");
  const intelRecord = allData!.find((c) => c.id === "cert-intel");
  assertEquals(
    intelRecord?.is_published,
    false,
    "cert-intel must be retained with is_published = false",
  );
});

Deno.test("INTG-2: Deleting a certificate in Staff Portal removes it from public storefront query", async () => {
  const tempCertId = `cert-test-delete-${Date.now()}`;

  // 1. Staff creates temporary certificate
  const { error: insertErr } = await adminClient.from("partner_certificates").insert({
    id: tempCertId,
    text: "Test Temporary Partner",
    brand: "TestBrand",
    category: "Laptops & Computing",
    status: "Authorised Partner",
    validity: "2026 Certified",
    description: "Temporary partner certificate for deletion verification.",
    image: "/images/recognition/asus-premium-partner.jpg",
    alt: "Test Temporary Partner Certificate for IT HUB",
    display_order: 99,
    is_published: true,
  });
  assertEquals(insertErr, null, "Insert must succeed");

  // 2. Verify public storefront query sees the new certificate
  const { data: beforeDelete } = await anonClient
    .from("partner_certificates")
    .select("id")
    .eq("id", tempCertId)
    .eq("is_published", true)
    .maybeSingle();
  assertEquals(beforeDelete?.id, tempCertId, "Storefront must see newly created certificate");

  // 3. Staff deletes the certificate
  const { error: deleteErr } = await adminClient
    .from("partner_certificates")
    .delete()
    .eq("id", tempCertId);
  assertEquals(deleteErr, null, "Delete must succeed");

  // 4. Verify public storefront query NO LONGER returns the certificate
  const { data: afterDelete } = await anonClient
    .from("partner_certificates")
    .select("id")
    .eq("id", tempCertId)
    .eq("is_published", true)
    .maybeSingle();
  assertEquals(
    afterDelete,
    null,
    "Deleted certificate must immediately disappear from storefront query",
  );
});

Deno.test("INTG-3: Editing certificate title persists and reflects in storefront query", async () => {
  const tempCertId = `cert-test-edit-${Date.now()}`;

  // 1. Insert
  await adminClient.from("partner_certificates").insert({
    id: tempCertId,
    text: "Original Title",
    brand: "BrandX",
    category: "Peripherals",
    status: "Active",
    validity: "2026",
    description: "Desc",
    image: "/images/about-store.png",
    alt: "Alt",
    display_order: 100,
    is_published: true,
  });

  // 2. Update
  const updatedTitle = "Updated Certified OEM Partner Title";
  const { error: updateErr } = await adminClient
    .from("partner_certificates")
    .update({ text: updatedTitle, updated_at: new Date().toISOString() })
    .eq("id", tempCertId);
  assertEquals(updateErr, null);

  // 3. Verify storefront query sees the updated title
  const { data } = await anonClient
    .from("partner_certificates")
    .select("text")
    .eq("id", tempCertId)
    .maybeSingle();
  assertEquals(
    data?.text,
    updatedTitle,
    "Storefront query must reflect the updated certificate title",
  );

  // Cleanup
  await adminClient.from("partner_certificates").delete().eq("id", tempCertId);
});

Deno.test("INTG-4: Intel and IGGIS records are completely independent with distinct images and titles", async () => {
  // Public anon client cannot query cert-intel because it is unpublished (RLS policy enforces is_published = true for anon)
  const { data: publicIntel } = await anonClient
    .from("partner_certificates")
    .select("*")
    .eq("id", "cert-intel")
    .maybeSingle();
  assertEquals(
    publicIntel,
    null,
    "Unpublished cert-intel must be invisible to public anonymous client",
  );

  // Staff admin client can inspect retained cert-intel
  const { data: intel } = await adminClient
    .from("partner_certificates")
    .select("*")
    .eq("id", "cert-intel")
    .maybeSingle();

  const { data: iggis } = await anonClient
    .from("partner_certificates")
    .select("*")
    .eq("id", "cert-iggis")
    .maybeSingle();

  assertEquals(intel?.text, "Intel Partner Alliance");
  assertEquals(intel?.brand, "Intel");
  assertEquals(intel?.image, "/images/about-store.png");
  assertEquals(intel?.is_published, false);

  assertEquals(iggis?.text, "IGGIS Honour & Recognition");
  assertEquals(iggis?.brand, "IGGIS");
  assertEquals(iggis?.image, "/images/recognition/iggis-honour-recognition.jpg");
  assertEquals(iggis?.is_published, true);

  assertNotEquals(intel?.image, iggis?.image, "Intel and IGGIS must never share the same image");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. WEBSITE SHOWCASE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("INTG-5: Website showcase table returns active showroom photos for storefront", async () => {
  const { data, error } = await anonClient
    .from("website_showcase")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  assertEquals(error, null);
  assertEquals(data!.length >= 10, true, "Must return at least 10 canonical showcase photos");
  assertEquals(data![0].src.startsWith("/images/showcase/"), true);
});

Deno.test("INTG-6: Adding and deleting a showcase photo updates website_showcase table", async () => {
  const tempShowcaseId = `showcase-test-${Date.now()}`;

  // 1. Add
  const { error: insertErr } = await adminClient.from("website_showcase").insert({
    id: tempShowcaseId,
    src: "/images/showcase/showcase-1.png",
    caption: "Customer Setup at Kothamangalam Hub",
    display_order: 999,
    is_active: true,
  });
  assertEquals(insertErr, null);

  // 2. Query as storefront
  const { data: added } = await anonClient
    .from("website_showcase")
    .select("caption")
    .eq("id", tempShowcaseId)
    .maybeSingle();
  assertEquals(added?.caption, "Customer Setup at Kothamangalam Hub");

  // 3. Delete
  await adminClient.from("website_showcase").delete().eq("id", tempShowcaseId);

  // 4. Verify gone
  const { data: gone } = await anonClient
    .from("website_showcase")
    .select("id")
    .eq("id", tempShowcaseId)
    .maybeSingle();
  assertEquals(gone, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. STORE SETTINGS & OPERATIONS INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("INTG-7: Store settings table contains authoritative store profile, contact, hours, and fees", async () => {
  const { data, error } = await anonClient
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  assertEquals(error, null);
  assertEquals(data?.store_name, "IT HUB");
  assertEquals(data?.phone, "+91 9847223886");
  assertEquals(data?.email, "ithubkmgm@gmail.com");
  assertEquals(data?.whatsapp_number, "919847223886");
  assertEquals(typeof data?.hours, "string");
  assertEquals(Number(data?.doorstep_callout_fee), 250);
  assertEquals(Number(data?.courier_return_delivery_fee), 150);
  assertEquals(Number(data?.diagnostic_assessment_fee), 299);
});

Deno.test("INTG-8: Staff update to store settings updates row 1 and is reflected in public storefront read", async () => {
  const originalHours = "Mon - Sat: 9:30 AM - 7:30 PM";
  const updatedHours = "Mon - Sat: 10:00 AM - 8:30 PM (Sun: Holiday)";

  // 1. Staff updates hours
  const { error: updateErr } = await adminClient
    .from("store_settings")
    .update({ hours: updatedHours, updated_at: new Date().toISOString() })
    .eq("id", 1);
  assertEquals(updateErr, null);

  // 2. Storefront reads updated hours
  const { data } = await anonClient
    .from("store_settings")
    .select("hours")
    .eq("id", 1)
    .maybeSingle();
  assertEquals(data?.hours, updatedHours);

  // Restore original
  await adminClient
    .from("store_settings")
    .update({ hours: originalHours, updated_at: new Date().toISOString() })
    .eq("id", 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SECURITY & RBAC ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("INTG-9: Anonymous client is forbidden from inserting or modifying partner_certificates", async () => {
  const { error: insertErr } = await anonClient.from("partner_certificates").insert({
    id: "cert-unauthorized",
    text: "Hacker Partner",
    brand: "Exploit",
    category: "Laptops",
    image: "/images/hack.png",
  });

  // Must either error or be rejected by RLS (0 rows inserted)
  const { data } = await adminClient
    .from("partner_certificates")
    .select("id")
    .eq("id", "cert-unauthorized")
    .maybeSingle();
  assertEquals(data, null, "Anonymous insert must not persist in partner_certificates");
});

Deno.test("INTG-10: Anonymous client is forbidden from modifying store_settings", async () => {
  const { error } = await anonClient
    .from("store_settings")
    .update({ store_name: "Compromised IT HUB" })
    .eq("id", 1);

  // Query row 1 with admin client to confirm value did not change
  const { data } = await adminClient
    .from("store_settings")
    .select("store_name")
    .eq("id", 1)
    .maybeSingle();
  assertEquals(data?.store_name, "IT HUB", "Anonymous update must not mutate store_settings");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SHOPIFY BLOG CMS OWNERSHIP PROTECTION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("INTG-11: Shopify Blog CMS ownership is respected and no competing blog table exists in Supabase", async () => {
  const { data, error } = await anonClient.from("blog_articles").select("*");
  // Should error because table does not exist
  assertNotEquals(
    error,
    null,
    "Compromised/competing blog_articles table must NOT exist in Supabase",
  );

  // Home.tsx must query fetchBlogArticles from shopify.ts
  const homeCode = Deno.readTextFileSync("src/pages/Home.tsx");
  assertMatch(
    homeCode,
    /fetchBlogArticles\(\)/,
    "Home.tsx must fetch blog articles from Shopify Storefront API",
  );
});
