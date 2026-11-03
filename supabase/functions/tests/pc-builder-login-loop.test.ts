// supabase/functions/tests/pc-builder-login-loop.test.ts
// Comprehensive Reproduction & Verification Suite for PC Builder Quotation Login Loop Bug
// IT HUB — Kerala, India

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  TEST_ANON_KEY,
  TEST_SERVICE_KEY,
  TEST_SUPABASE_URL,
  dbTest,
} from "./_helpers/disposable_env.ts";

const LOCAL_SUPABASE_URL = TEST_SUPABASE_URL;
const LOCAL_SUPABASE_ANON = TEST_ANON_KEY;
const LOCAL_SUPABASE_SERVICE_ROLE = TEST_SERVICE_KEY;

Deno.env.set("VITE_SUPABASE_URL", LOCAL_SUPABASE_URL);
Deno.env.set("SUPABASE_URL", LOCAL_SUPABASE_URL);
Deno.env.set("VITE_SUPABASE_ANON_KEY", LOCAL_SUPABASE_ANON);
Deno.env.set("SUPABASE_ANON_KEY", LOCAL_SUPABASE_ANON);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", LOCAL_SUPABASE_SERVICE_ROLE);

const { verifyPhoneOtp, sendPhoneOtp, formatIndianPhoneToE164, isValidIndianMobile } =
  await import("../../../src/lib/auth.ts");

const { submitQuotationRequest } = await import("../../../src/lib/builder/persistence.ts");

const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");

/** A real, confirmed account with a real password session. No phone number proves anything here. */
async function signInSynthetic(label: string) {
  const email = `login-loop-${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `Synthetic-${crypto.randomUUID()}`;
  const service = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    phone: `+918${String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000).padStart(9, "0")}`,
    phone_confirm: true,
  });
  if (created.error) throw new Error(created.error.message);
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(signed.error.message);
  return { ok: true, user: signed.data.user, session: signed.data.session };
}

async function createAuthenticatedClient(session: any) {
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON, {
    auth: { persistSession: false },
  });
  if (session) {
    await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }

  const serviceClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const customFunctions = {
    invoke: async (functionName: string, options: any) => {
      if (functionName === "verify-and-submit-pc-quotation") {
        const token = session?.access_token || "";
        const req = new Request("http://localhost/verify-and-submit-pc-quotation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify(options?.body || {}),
        });
        const res = await handleQuotationVerification(req, { supabaseClient: serviceClient });
        const data = await res.json();
        return { data, error: res.ok ? null : { message: data?.error || "Error" } };
      }
      return { data: null, error: new Error("Unknown function") };
    },
  };

  Object.defineProperty(client, "functions", {
    get: () => customFunctions,
    configurable: true,
  });

  return client;
}

const sampleBuild: any = {
  id: "test-build-login-loop",
  name: "Login Loop Test PC",
  components: {
    CPU: {
      slot: "CPU",
      productId: "test-cpu",
      title: "AMD Ryzen 5 5600",
      price: 9000,
      variantId: "gid://shopify/ProductVariant/4455667788",
    },
    Motherboard: {
      slot: "Motherboard",
      productId: "test-mobo",
      title: "ASUS Prime B550M-A WiFi II",
      price: 8999,
      variantId: "gid://shopify/ProductVariant/4455667789",
    },
  },
};

Deno.test("LOGIN-LOOP-1: Logged-out user quotation request triggers requiresAuth", async () => {
  const unauthClient = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  };

  const res = await submitQuotationRequest(sampleBuild, undefined, {
    supabaseClient: unauthClient as any,
  });

  assertEquals(res.success, false);
  assertEquals(res.requiresAuth, true);
  assertEquals(res.error?.toLowerCase().includes("authentication required"), true);
});

Deno.test("LOGIN-LOOP-2: Invalid or expired OTP is strictly rejected and creates no session", async () => {
  const phone = "9876543210";

  const resBadCode = await verifyPhoneOtp(phone, "999999");
  assertEquals(resBadCode.ok, false);
  assertEquals(resBadCode.user, undefined);
  assertEquals(resBadCode.session, undefined);
  assertNotEquals(resBadCode.error, undefined);
});

dbTest("LOGIN-LOOP-3: A code the browser chose can't establish a session", async () => {
  const res = await verifyPhoneOtp("9876543299", "654321");
  assertEquals(res.ok, false);
  assertEquals(res.user, undefined);
  assertEquals(res.session, undefined);
});

dbTest(
  "LOGIN-LOOP-4: Authenticated user quotation request succeeds without requiresAuth",
  async () => {
    const authRes = await signInSynthetic("quote");
    assertEquals(authRes.ok, true);
    assertEquals(Boolean(authRes.user), true);

    // Now create authenticated client with the verified session
    const client = await createAuthenticatedClient(authRes.session);

    // Verify submitting quotation with authenticated user succeeds
    const quoteRes = await submitQuotationRequest(
      sampleBuild,
      { name: "Kerala Customer", phone: "+919876543299", email: "kerala@example.com" },
      { supabaseClient: client },
    );

    assertEquals(quoteRes.requiresAuth, undefined);
    assertEquals(quoteRes.success, true);
    assertEquals(Boolean(quoteRes.referenceId), true);
    assertMatch(quoteRes.referenceId!, /^ITH-PC-\d{8}-[A-Z0-9]+$/);
  },
);

Deno.test("LOGIN-LOOP-5: Edge Function authoritatively derives customer identity and forbids forgery", async () => {
  const reqNoAuth = new Request("http://localhost/verify-and-submit-pc-quotation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buildName: "Spoofed Customer Build",
      parts: {},
      estimatedPrice: 20000,
      customerInfo: { name: "Attacker", phone: "9876543210" },
    }),
  });

  const res = await handleQuotationVerification(reqNoAuth);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.success, false);
  assertEquals(data.requiresAuth, true);
});

dbTest(
  "LOGIN-LOOP-6: Page refresh / session restoration preserves authentication state",
  async () => {
    const authRes = await signInSynthetic("reload");
    assertEquals(authRes.ok, true);
    assertEquals(Boolean(authRes.session), true);

    // Simulate page reload by creating a client initialized with that session
    const reloadedClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON, {
      auth: { persistSession: false },
    });
    await reloadedClient.auth.setSession({
      access_token: authRes.session!.access_token,
      refresh_token: authRes.session!.refresh_token,
    });

    // Check getSession and getUser
    const { data: sessionData } = await reloadedClient.auth.getSession();
    assertEquals(Boolean(sessionData.session), true);
    assertEquals(sessionData.session?.user.id, authRes.user?.id);

    const { data: userData } = await reloadedClient.auth.getUser();
    assertEquals(Boolean(userData.user), true);
    assertEquals(userData.user?.id, authRes.user?.id);
  },
);

dbTest(
  "LOGIN-LOOP-7: Customer isolation — Customer B cannot access Customer A's quotations",
  async () => {
    // Customer A logs in
    const authA = await signInSynthetic("customer-a");
    assertEquals(authA.ok, true);

    const clientA = await createAuthenticatedClient(authA.session);

    // Customer A submits a quotation
    const quoteA = await submitQuotationRequest(
      sampleBuild,
      { name: "Customer A", phone: "+919876543201" },
      { supabaseClient: clientA },
    );
    assertEquals(quoteA.success, true);
    assertEquals(Boolean(quoteA.referenceId), true);

    // Customer B logs in
    const authB = await signInSynthetic("customer-b");
    assertEquals(authB.ok, true);

    const clientB = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON, {
      auth: { persistSession: false },
    });
    await clientB.auth.setSession({
      access_token: authB.session!.access_token,
      refresh_token: authB.session!.refresh_token,
    });

    // Customer B attempts to select Customer A's quotation directly from pc_builds
    const { data: customerBReadsQuoteA } = await clientB
      .from("pc_builds")
      .select("id, reference_id, user_id, customer_name")
      .eq("reference_id", quoteA.referenceId!);

    // RLS MUST block access: Customer B sees an empty list
    assertEquals(customerBReadsQuoteA?.length, 0);

    // Customer A CAN read their own quotation
    const { data: customerAReadsOwnQuote } = await clientA
      .from("pc_builds")
      .select("id, reference_id, user_id, customer_name")
      .eq("reference_id", quoteA.referenceId!);

    assertEquals(customerAReadsOwnQuote?.length, 1);
    assertEquals(customerAReadsOwnQuote?.[0].reference_id, quoteA.referenceId);
    assertEquals(customerAReadsOwnQuote?.[0].user_id, authA.user?.id);
  },
);
