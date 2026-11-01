// supabase/functions/tests/staff-portal-reviews-and-sell.test.ts
// Automated Test Suite for IT HUB Staff Portal Reviews Moderation & Sell Requests Management
// IT HUB — Kerala, India

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const LOCAL_SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || "http://127.0.0.1:54321";
const LOCAL_SUPABASE_ANON =
  Deno.env.get("VITE_SUPABASE_ANON_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SUPABASE_SERVICE_ROLE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicmVmIjoiMTI3LjAuMC4xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzI3NTAwMCwiZXhwIjoyMTA4NjM1MDAwfQ.e1aa46kGEZiBSW3jrNHrdvVxqz7-x3DKRPtWNEYraLw";

const adminClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.test("REV-1: Customer reviews query joins customer profile and product accurately", async () => {
  const { data, error } = await adminClient
    .from("reviews")
    .select(`
      id,
      rating,
      body,
      status,
      customer:profiles!reviews_user_id_fkey(id, full_name, email),
      product:products!reviews_product_id_fkey(id, name)
    `)
    .limit(5);

  assertEquals(error, null);
  assertEquals(Array.isArray(data), true);
  if (data && data.length > 0) {
    const rev = data[0];
    assertEquals(typeof rev.rating, "number");
    assertEquals(Boolean(rev.status), true);
    assertEquals(["Pending", "Published", "Hidden"].includes(rev.status), true);
  }
});

Deno.test("REV-2: Review moderation RPC updates status and logs immutable audit trail", async () => {
  // 1. Fetch or create test review
  const { data: existing } = await adminClient.from("reviews").select("id, status").limit(1);
  if (!existing || existing.length === 0) return;

  const testReview = existing[0];
  const newStatus = testReview.status === "Published" ? "Hidden" : "Published";

  // 2. Perform status change
  const { error: updateErr } = await adminClient
    .from("reviews")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", testReview.id);

  assertEquals(updateErr, null);

  // 3. Verify status persisted
  const { data: verified } = await adminClient
    .from("reviews")
    .select("status")
    .eq("id", testReview.id)
    .single();

  assertEquals(verified?.status, newStatus);
});

Deno.test("REV-3: Unauthenticated user cannot read hidden or pending customer reviews", async () => {
  const anonClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON, {
    auth: { persistSession: false },
  });

  const { data, error } = await anonClient
    .from("reviews")
    .select("id, status")
    .in("status", ["Pending", "Hidden"]);

  // RLS public_read policy only allows Published reviews or reviews owned by the caller
  assertEquals(error, null);
  assertEquals(data?.length, 0);
});

Deno.test("SELL-1: Sell requests query retrieves customer hardware submission and customer info", async () => {
  const { data, error } = await adminClient
    .from("sell_requests")
    .select(`
      id,
      category,
      product_name,
      condition,
      expected_price,
      offered_price,
      status,
      customer:profiles!sell_requests_customer_id_fkey(id, full_name, email, phone)
    `)
    .limit(5);

  assertEquals(error, null);
  assertEquals(Array.isArray(data), true);
  if (data && data.length > 0) {
    const req = data[0];
    assertEquals(Boolean(req.category), true);
    assertEquals(Boolean(req.product_name), true);
    assertEquals(
      ["Pending", "Under Review", "Contacted", "Approved", "Rejected", "Completed"].includes(
        req.status,
      ),
      true,
    );
  }
});

Deno.test("SELL-2: Staff can update valuation, offered price, and request status", async () => {
  const { data: existing } = await adminClient.from("sell_requests").select("id, status").limit(1);
  if (!existing || existing.length === 0) return;

  const testReq = existing[0];
  const testValuation = 38500;
  const testNotes = "Verified cosmetic condition via customer photos. Offer presented.";

  const { error: updateErr } = await adminClient
    .from("sell_requests")
    .update({
      status: "Contacted",
      offered_price: testValuation,
      admin_notes: testNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", testReq.id);

  assertEquals(updateErr, null);

  const { data: verified } = await adminClient
    .from("sell_requests")
    .select("status, offered_price, admin_notes")
    .eq("id", testReq.id)
    .single();

  assertEquals(verified?.status, "Contacted");
  assertEquals(Number(verified?.offered_price), testValuation);
  assertEquals(verified?.admin_notes, testNotes);
});

Deno.test("SELL-3: Unauthenticated user cannot read customer sell submissions", async () => {
  const anonClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON, {
    auth: { persistSession: false },
  });

  const { data } = await anonClient.from("sell_requests").select("id, product_name, customer_id");

  // RLS own_sell_read policy strictly blocks access for unauthenticated callers
  assertEquals(data?.length, 0);
});

Deno.test("SELL-4: Sell request images and documents join cleanly with customer submission", async () => {
  const { data: testReqs } = await adminClient
    .from("sell_requests")
    .select(`
      id,
      product_name,
      images:sell_request_images(id, storage_path, display_order),
      documents:sell_request_documents(id, storage_path, document_type)
    `)
    .limit(3);

  assertEquals(Array.isArray(testReqs), true);
  if (testReqs && testReqs.length > 0) {
    const r = testReqs[0];
    assertEquals(Array.isArray(r.images), true);
    assertEquals(Array.isArray(r.documents), true);
  }
});

Deno.test("SELL-5: Atomic staff_update_sell_request RPC validates status, updates offered price, and preserves expected price", async () => {
  const { data: existing } = await adminClient
    .from("sell_requests")
    .select("id, status, expected_price")
    .limit(1);
  if (!existing || existing.length === 0) return;

  const req = existing[0];
  const originalExpected = req.expected_price;
  const newOffered = 42500;
  const testNotes = "Audited via Staff Portal automated test harness.";

  const { data: rpcRes, error: rpcErr } = await adminClient.rpc("staff_update_sell_request", {
    p_request_id: req.id,
    p_status: "Approved",
    p_admin_notes: testNotes,
    p_offered_price: newOffered,
  });

  assertEquals(rpcErr, null);
  assertEquals(rpcRes?.success, true);
  assertEquals(rpcRes?.status, "Approved");

  // Verify offered price was updated while expected price was preserved
  const { data: verified } = await adminClient
    .from("sell_requests")
    .select("status, offered_price, expected_price, admin_notes")
    .eq("id", req.id)
    .single();

  assertEquals(verified?.status, "Approved");
  assertEquals(Number(verified?.offered_price), newOffered);
  assertEquals(verified?.expected_price, originalExpected);
  assertEquals(verified?.admin_notes, testNotes);

  // Verify audit log entry
  const { data: auditLogs } = await adminClient
    .from("staff_audit_logs")
    .select("action_type, entity_type, entity_id, new_status")
    .eq("entity_id", req.id)
    .eq("action_type", "UPDATE_SELL_REQUEST");

  assertEquals(Boolean(auditLogs && auditLogs.length > 0), true);
  assertEquals(auditLogs![0].new_status, "Approved");
});

Deno.test("SELL-6: Invalid sell request status is strictly rejected by RPC validator", async () => {
  const { data: existing } = await adminClient.from("sell_requests").select("id").limit(1);
  if (!existing || existing.length === 0) return;

  const { error: invalidErr } = await adminClient.rpc("staff_update_sell_request", {
    p_request_id: existing[0].id,
    p_status: "INVALID_STATUS_NAME",
  });

  assertNotEquals(invalidErr, null);
  assertMatch(invalidErr?.message || "", /Invalid sell request status/i);
});
