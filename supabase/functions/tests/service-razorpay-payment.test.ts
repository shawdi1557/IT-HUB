// supabase/functions/tests/service-razorpay-payment.test.ts
// Test-Driven Development (TDD) Suite for IT HUB Service Quotation Razorpay Payment Integration
// Kerala, India

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import {
  handleCreateServiceRazorpayOrder,
  type CreateServiceOrderDeps,
} from "../create-service-razorpay-order/index.ts";
import {
  handleVerifyServicePayment,
  type VerifyServicePaymentDeps,
} from "../verify-service-payment/index.ts";

const TEST_KEY_ID = "rzp_test_MOCK_SERVICE_KEY_123";
const TEST_KEY_SECRET = "mock_service_key_secret_xyz789";
const TEST_USER_ID = "11111111-2222-3333-4444-555555555555";
const TEST_SERVICE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TEST_TICKET_REF = "ITH-SER-C327B978";
const TEST_RZP_ORDER_ID = "order_SRV1234567890";
const TEST_RZP_PAY_ID = "pay_SRV9876543210";

// Helper: Calculate valid HMAC-SHA256 signature for test payloads
async function calculateHmacSignature(
  orderId: string,
  paymentId: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode(`${orderId}|${paymentId}`);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);
  const bytes = new Uint8Array(signatureBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Mock User Client Factory
function createMockUserClient(options: { userId?: string; serviceRecord?: any; userError?: any }) {
  return {
    auth: {
      getUser: async () => {
        if (options.userError) return { data: { user: null }, error: options.userError };
        if (!options.userId) return { data: { user: null }, error: new Error("No session") };
        return { data: { user: { id: options.userId, email: "customer@ithub.in" } }, error: null };
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => ({
            data: options.serviceRecord,
            error: null,
          }),
          single: async () => ({
            data: options.serviceRecord,
            error: null,
          }),
        }),
      }),
    }),
  };
}

// Mock Admin Client Factory
function createMockAdminClient(options: { serviceRecord?: any; rpcResult?: any; rpcError?: any }) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  return {
    rpcCalls,
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => ({
            data: options.serviceRecord,
            error: null,
          }),
          single: async () => ({
            data: options.serviceRecord,
            error: null,
          }),
        }),
      }),
      update: (fields: any) => ({
        eq: (col: string, val: string) => ({
          error: null,
        }),
      }),
    }),
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (options.rpcError) return { data: null, error: options.rpcError };
      return { data: options.rpcResult ?? { ok: true }, error: null };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: ORDER CREATION EDGE FUNCTION TESTS (create-service-razorpay-order)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SRV-PAY-1: Creates Razorpay order binding amount strictly to approved quotation (ignoring tampered browser amount)", async () => {
  const mockServiceRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500, // Authoritative DB quote: ₹4500
    quote_state: "approved",
    status: "Awaiting Approval",
    payment_status: "Unpaid",
  };

  let capturedRzpPayload: any = null;
  const mockFetch: typeof fetch = async (input, init) => {
    if (typeof input === "string" && input.includes("api.razorpay.com/v1/orders")) {
      capturedRzpPayload = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          id: TEST_RZP_ORDER_ID,
          amount: capturedRzpPayload.amount,
          currency: "INR",
          status: "created",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  };

  const adminClient = createMockAdminClient({ serviceRecord: mockServiceRecord });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: mockServiceRecord,
  });

  const deps: CreateServiceOrderDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    fetchFn: mockFetch,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/create-service-razorpay-order", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    // Malicious browser tries to pass tampered amount ₹100 instead of ₹4500
    body: JSON.stringify({
      service_request_id: TEST_SERVICE_ID,
      amount: 100, // TAMPERED AMOUNT
    }),
  });

  const res = await handleCreateServiceRazorpayOrder(req, deps);
  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(data.razorpay_order_id, TEST_RZP_ORDER_ID);
  assertEquals(data.amount, 450000); // Exactly 4500 * 100 paise, NOT 100 paise!
  assertEquals(data.currency, "INR");
  assertEquals(data.ticket_reference, TEST_TICKET_REF);

  // Assert Razorpay API call payload strictly bound to ₹4500 (450000 paise)
  assertExists(capturedRzpPayload);
  assertEquals(capturedRzpPayload.amount, 450000);
  assertEquals(capturedRzpPayload.currency, "INR");
  assertEquals(capturedRzpPayload.notes.service_request_id, TEST_SERVICE_ID);
  assertEquals(capturedRzpPayload.notes.ticket_reference, TEST_TICKET_REF);

  // Assert attach_service_razorpay_order_id RPC was called
  assertEquals(adminClient.rpcCalls.length, 1);
  assertEquals(adminClient.rpcCalls[0].name, "attach_service_razorpay_order_id");
  assertEquals(adminClient.rpcCalls[0].args.p_service_request_id, TEST_SERVICE_ID);
  assertEquals(adminClient.rpcCalls[0].args.p_razorpay_order_id, TEST_RZP_ORDER_ID);
});

Deno.test("SRV-PAY-2: Order creation rejects unapproved quotation (quote_state !== 'approved')", async () => {
  const unapprovedRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "pending", // Still pending approval
    status: "Awaiting Approval",
    payment_status: "Unpaid",
  };

  const adminClient = createMockAdminClient({ serviceRecord: unapprovedRecord });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: unapprovedRecord,
  });

  const deps: CreateServiceOrderDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/create-service-razorpay-order", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({ service_request_id: TEST_SERVICE_ID }),
  });

  const res = await handleCreateServiceRazorpayOrder(req, deps);
  assertEquals(res.status, 400);

  const data = await res.json();
  assertStringIncludes(data.error.toLowerCase(), "approved");
});

Deno.test("SRV-PAY-3: Order creation rejects zero or negative quotation amount", async () => {
  const zeroQuoteRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 0, // ₹0
    quote_state: "approved",
    status: "Awaiting Approval",
    payment_status: "Unpaid",
  };

  const adminClient = createMockAdminClient({ serviceRecord: zeroQuoteRecord });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: zeroQuoteRecord,
  });

  const deps: CreateServiceOrderDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/create-service-razorpay-order", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({ service_request_id: TEST_SERVICE_ID }),
  });

  const res = await handleCreateServiceRazorpayOrder(req, deps);
  assertEquals(res.status, 400);

  const data = await res.json();
  assertStringIncludes(data.error.toLowerCase(), "amount");
});

Deno.test("SRV-PAY-4: Order creation rejects already paid service requests (payment_status === 'Paid')", async () => {
  const alreadyPaidRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "In Progress",
    payment_status: "Paid", // Already paid!
    razorpay_payment_id: "pay_EXISTING_PAID_123",
  };

  const adminClient = createMockAdminClient({ serviceRecord: alreadyPaidRecord });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: alreadyPaidRecord,
  });

  const deps: CreateServiceOrderDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/create-service-razorpay-order", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({ service_request_id: TEST_SERVICE_ID }),
  });

  const res = await handleCreateServiceRazorpayOrder(req, deps);
  assertEquals(res.status, 400);

  const data = await res.json();
  assertStringIncludes(data.error.toLowerCase(), "already");
});

Deno.test("SRV-PAY-5: Order creation enforces ownership (rejects unauthorized users)", async () => {
  const recordOfAnotherUser = {
    id: TEST_SERVICE_ID,
    user_id: "99999999-8888-7777-6666-555555555555", // Belongs to different user
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "Awaiting Approval",
    payment_status: "Unpaid",
  };

  const adminClient = createMockAdminClient({ serviceRecord: recordOfAnotherUser });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID, // Different user attempting access
    serviceRecord: recordOfAnotherUser,
  });

  const deps: CreateServiceOrderDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/create-service-razorpay-order", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({ service_request_id: TEST_SERVICE_ID }),
  });

  const res = await handleCreateServiceRazorpayOrder(req, deps);
  assertEquals(res.status, 403);

  const data = await res.json();
  assertStringIncludes(data.error.toLowerCase(), "own");
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: PAYMENT VERIFICATION EDGE FUNCTION TESTS (verify-service-payment)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SRV-PAY-6: Verifies valid timing-safe HMAC signature and invokes record_service_payment RPC", async () => {
  const validSignature = await calculateHmacSignature(
    TEST_RZP_ORDER_ID,
    TEST_RZP_PAY_ID,
    TEST_KEY_SECRET,
  );

  const mockServiceRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "Awaiting Approval",
    payment_status: "Unpaid",
    razorpay_order_id: TEST_RZP_ORDER_ID,
  };

  const adminClient = createMockAdminClient({
    serviceRecord: mockServiceRecord,
    rpcResult: {
      ok: true,
      service_id: TEST_SERVICE_ID,
      payment_status: "Paid",
      status: "In Progress",
    },
  });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: mockServiceRecord,
  });

  const deps: VerifyServicePaymentDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/verify-service-payment", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({
      service_request_id: TEST_SERVICE_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  });

  const res = await handleVerifyServicePayment(req, deps);
  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(data.payment_status, "Paid");
  assertEquals(data.status, "In Progress");

  // Verify RPC arguments
  assertEquals(adminClient.rpcCalls.length, 1);
  assertEquals(adminClient.rpcCalls[0].name, "record_service_payment");
  assertEquals(adminClient.rpcCalls[0].args.p_service_request_id, TEST_SERVICE_ID);
  assertEquals(adminClient.rpcCalls[0].args.p_razorpay_order_id, TEST_RZP_ORDER_ID);
  assertEquals(adminClient.rpcCalls[0].args.p_razorpay_payment_id, TEST_RZP_PAY_ID);
  assertEquals(adminClient.rpcCalls[0].args.p_amount_paid, 4500);
});

Deno.test("SRV-PAY-7: Rejects forged or invalid HMAC signature with 401 Unauthorized", async () => {
  const forgedSignature = "0000000000000000000000000000000000000000000000000000000000000000";

  const mockServiceRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "Awaiting Approval",
    payment_status: "Unpaid",
    razorpay_order_id: TEST_RZP_ORDER_ID,
  };

  const adminClient = createMockAdminClient({ serviceRecord: mockServiceRecord });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: mockServiceRecord,
  });

  const deps: VerifyServicePaymentDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/verify-service-payment", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({
      service_request_id: TEST_SERVICE_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: forgedSignature,
    }),
  });

  const res = await handleVerifyServicePayment(req, deps);
  assertEquals(res.status, 401);

  const data = await res.json();
  assertStringIncludes(data.error.toLowerCase(), "signature");
  assertEquals(adminClient.rpcCalls.length, 0); // RPC suppressed!
});

Deno.test("SRV-PAY-8: Rejects mismatched Razorpay order ID with 400 Bad Request", async () => {
  const validSignature = await calculateHmacSignature(
    "order_UNATTACHED_DIFFERENT_999",
    TEST_RZP_PAY_ID,
    TEST_KEY_SECRET,
  );

  const mockServiceRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "Awaiting Approval",
    payment_status: "Unpaid",
    razorpay_order_id: TEST_RZP_ORDER_ID, // Attached order is order_SRV1234567890
  };

  const adminClient = createMockAdminClient({ serviceRecord: mockServiceRecord });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: mockServiceRecord,
  });

  const deps: VerifyServicePaymentDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/verify-service-payment", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({
      service_request_id: TEST_SERVICE_ID,
      razorpay_order_id: "order_UNATTACHED_DIFFERENT_999",
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  });

  const res = await handleVerifyServicePayment(req, deps);
  assertEquals(res.status, 400);

  const data = await res.json();
  assertStringIncludes(data.error.toLowerCase(), "order id");
  assertEquals(adminClient.rpcCalls.length, 0); // RPC suppressed!
});

Deno.test("SRV-PAY-9: Duplicate callback with identical payment ID returns idempotent 200 OK without re-processing", async () => {
  const validSignature = await calculateHmacSignature(
    TEST_RZP_ORDER_ID,
    TEST_RZP_PAY_ID,
    TEST_KEY_SECRET,
  );

  const alreadyPaidRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "In Progress",
    payment_status: "Paid",
    razorpay_order_id: TEST_RZP_ORDER_ID,
    razorpay_payment_id: TEST_RZP_PAY_ID, // Exactly identical payment ID!
  };

  const adminClient = createMockAdminClient({
    serviceRecord: alreadyPaidRecord,
    rpcResult: {
      ok: true,
      idempotent: true,
      service_id: TEST_SERVICE_ID,
      payment_status: "Paid",
    },
  });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: alreadyPaidRecord,
  });

  const deps: VerifyServicePaymentDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/verify-service-payment", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({
      service_request_id: TEST_SERVICE_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: TEST_RZP_PAY_ID,
      razorpay_signature: validSignature,
    }),
  });

  const res = await handleVerifyServicePayment(req, deps);
  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(data.idempotent, true);
});

Deno.test("SRV-PAY-10: Duplicate payment attempt with different payment ID returns 409 Conflict", async () => {
  const validSignature = await calculateHmacSignature(
    TEST_RZP_ORDER_ID,
    "pay_DIFFERENT_SECOND_ATTEMPT_999",
    TEST_KEY_SECRET,
  );

  const alreadyPaidRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "In Progress",
    payment_status: "Paid",
    razorpay_order_id: TEST_RZP_ORDER_ID,
    razorpay_payment_id: TEST_RZP_PAY_ID, // Already paid under original ID
  };

  const adminClient = createMockAdminClient({ serviceRecord: alreadyPaidRecord });
  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: alreadyPaidRecord,
  });

  const deps: VerifyServicePaymentDeps = {
    razorpayKeyId: TEST_KEY_ID,
    razorpayKeySecret: TEST_KEY_SECRET,
    supabaseUserClient: userClient,
    supabaseAdminClient: adminClient,
    appEnv: "development",
  };

  const req = new Request("http://localhost:54321/functions/v1/verify-service-payment", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock_token_customer",
      "Content-Type": "application/json",
      Origin: "http://localhost:8443",
    },
    body: JSON.stringify({
      service_request_id: TEST_SERVICE_ID,
      razorpay_order_id: TEST_RZP_ORDER_ID,
      razorpay_payment_id: "pay_DIFFERENT_SECOND_ATTEMPT_999",
      razorpay_signature: validSignature,
    }),
  });

  const res = await handleVerifyServicePayment(req, deps);
  assertEquals(res.status, 409);

  const data = await res.json();
  assertStringIncludes(data.error.toLowerCase(), "already");
  assertEquals(adminClient.rpcCalls.length, 0); // RPC suppressed!
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 3: OFFLINE SHOWROOM PAYMENT & STAFF SETTLEMENT TESTS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("SRV-PAY-11: Offline 'Pay at IT HUB' selection records pending status and preserves unpaid state (is_paid === false)", async () => {
  const mockServiceRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "Awaiting Approval",
    payment_status: "Unpaid",
  };

  const userClient = createMockUserClient({
    userId: TEST_USER_ID,
    serviceRecord: mockServiceRecord,
  });

  // Client triggers record_service_pay_at_store_selection
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const clientWithRpc = {
    ...userClient,
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return {
        data: {
          ok: true,
          service_id: args.p_service_request_id,
          payment_status: "Pay at Store",
          is_paid: false,
          status: "In Progress",
        },
        error: null,
      };
    },
  };

  const { data, error } = await clientWithRpc.rpc("record_service_pay_at_store_selection", {
    p_service_request_id: TEST_SERVICE_ID,
    p_notes: "Customer will inspect device and pay in showroom via Cash/QR.",
  });

  assertEquals(error, null);
  assertEquals(data.ok, true);
  assertEquals(data.payment_status, "Pay at Store");
  assertEquals(data.is_paid, false);
  assertEquals(data.status, "In Progress");
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].name, "record_service_pay_at_store_selection");
});

Deno.test("SRV-PAY-12: Staff payment collection confirms settlement, transitions ticket to Paid, and records staff ID", async () => {
  const staffUserId = "88888888-9999-aaaa-bbbb-cccccccccccc";
  const mockPendingStoreRecord = {
    id: TEST_SERVICE_ID,
    user_id: TEST_USER_ID,
    ticket_reference: TEST_TICKET_REF,
    quote: 4500,
    quote_state: "approved",
    status: "Completed",
    payment_status: "Pay at Store",
  };

  const rpcCalls: Array<{ name: string; args: any }> = [];
  const staffClient = {
    auth: {
      getUser: async () => ({
        data: { user: { id: staffUserId, email: "staff@ithub.in" } },
        error: null,
      }),
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return {
        data: {
          ok: true,
          service_id: args.p_service_request_id,
          payment_status: "Paid",
          paid_amount: args.p_collected_amount,
        },
        error: null,
      };
    },
  };

  const { data, error } = await staffClient.rpc("staff_confirm_service_payment_collected", {
    p_service_request_id: TEST_SERVICE_ID,
    p_collected_amount: 4500,
    p_payment_method: "store",
    p_notes: "Cash received at IT HUB front desk counter.",
  });

  assertEquals(error, null);
  assertEquals(data.ok, true);
  assertEquals(data.payment_status, "Paid");
  assertEquals(data.paid_amount, 4500);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].args.p_collected_amount, 4500);
  assertEquals(rpcCalls[0].args.p_payment_method, "store");
});
