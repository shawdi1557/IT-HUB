// supabase/functions/tests/shopify-client-association.test.ts
// Automated Tests for Checkout Association Token Generation & Buyer Identity Injection

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { TEST_SERVICE_KEY, TEST_SUPABASE_URL, dbTest } from "./_helpers/disposable_env.ts";
import { createSignedInUser } from "./_helpers/test_users.ts";

const SUPABASE_URL = TEST_SUPABASE_URL;
const SERVICE_KEY = TEST_SERVICE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

dbTest("ASSOC-1: RPC create_checkout_association generates valid opaque token", async () => {
  const customer = await createSignedInUser("assoc");
  const testUserId = customer.id;

  const { data: token, error: rpcErr } = await customer.client.rpc("create_checkout_association");
  assertEquals(rpcErr, null);
  assertEquals(token.startsWith("hub_assoc_"), true);
  assertEquals(token.length > 40, true);

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
