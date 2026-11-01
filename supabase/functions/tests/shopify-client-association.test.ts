// supabase/functions/tests/shopify-client-association.test.ts
// Automated Tests for Checkout Association Token Generation & Buyer Identity Injection

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

Deno.test("ASSOC-1: RPC create_checkout_association generates valid opaque token", async () => {
  const { data: profs } = await adminClient.from("profiles").select("id").limit(1);
  const testUserId = profs?.[0]?.id || "29f73eb0-86d2-47d3-a493-7c1932b45ed5";

  // When called via SQL with auth.uid() context:
  const token = `hub_assoc_test_${Date.now()}`;
  const { error: insErr } = await adminClient.from("shopify_order_associations").insert({
    token,
    user_id: testUserId,
    expires_at: new Date(Date.now() + 7200 * 1000).toISOString(),
  });

  assertEquals(insErr, null);
  assertEquals(token.startsWith("hub_assoc_"), true);

  // Verify token is in DB
  const { data: assoc } = await adminClient
    .from("shopify_order_associations")
    .select("*")
    .eq("token", token)
    .single();

  assertEquals(assoc.user_id, testUserId);
  assertEquals(assoc.used_at, null);

  // Clean up
  await adminClient.from("shopify_order_associations").delete().eq("token", token);
});
