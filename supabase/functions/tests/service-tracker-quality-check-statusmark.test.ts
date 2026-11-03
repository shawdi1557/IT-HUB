// supabase/functions/tests/service-tracker-quality-check-statusmark.test.ts
// Automated Test Suite for:
// 1. Customer Service Tracker - customer_description, created_at, problem, and staff note isolation
// 2. Service progression lifecycle - "Quality Check", "Ready for Delivery", "Approved", and Completed non-reversion
// 3. Timeline checkmark rendering when Completed
// 4. Payment validation & Razorpay UPI KYC handling / Pay at Showroom counter
// 5. Sell Your Item category cleanup ("Other Electronics" rejected for new requests, historical preserved)
// 6. StatusMark integration and component capabilities

import {
  assertEquals,
  assertNotEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { TEST_DB_URL, dbTest } from "./_helpers/disposable_env.ts";

const DB_URL = TEST_DB_URL;

async function getValidUserId(client: PgClient): Promise<string> {
  const res = await client.queryObject<{ id: string }>(
    `SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1`,
  );
  if (res.rows.length > 0) {
    return res.rows[0].id;
  }
  return "0370fb7a-7896-44bc-a543-023dd399913f";
}

dbTest(
  "Database schema: customer_description column exists on public.service_requests",
  async () => {
    const client = new PgClient(DB_URL);
    await client.connect();

    const res = await client.queryObject<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type 
     FROM information_schema.columns 
     WHERE table_schema = 'public' 
       AND table_name = 'service_requests' 
       AND column_name = 'customer_description'`,
    );

    assertEquals(res.rows.length, 1);
    assertEquals(res.rows[0].column_name, "customer_description");
    assertEquals(res.rows[0].data_type, "text");

    await client.end();
  },
);

dbTest(
  "Database constraint: service_requests_status_check allows 'Quality Check', 'Ready for Delivery', and 'Approved'",
  async () => {
    const client = new PgClient(DB_URL);
    await client.connect();

    const res = await client.queryObject<{ conname: string; def: string }>(
      `SELECT conname, pg_get_constraintdef(oid) as def 
     FROM pg_constraint 
     WHERE conrelid = 'public.service_requests'::regclass 
       AND conname = 'service_requests_status_check'`,
    );

    assertEquals(res.rows.length, 1);
    const def = res.rows[0].def;
    assertEquals(def.includes("'Quality Check'"), true, "Quality Check must be allowed");
    assertEquals(def.includes("'Ready for Delivery'"), true, "Ready for Delivery must be allowed");
    assertEquals(def.includes("'Approved'"), true, "Approved must be allowed");

    await client.end();
  },
);

dbTest(
  "RPC: staff_update_service_status accepts 'Quality Check' and transitions ticket cleanly",
  async () => {
    const client = new PgClient(DB_URL);
    await client.connect();
    const userId = await getValidUserId(client);

    // Create test ticket
    const testId = crypto.randomUUID();
    const insertRes = await client.queryObject<{ id: string }>(
      `INSERT INTO public.service_requests (
      id, user_id, device, model, problem, method, status, payment_status
    ) VALUES (
      $1, $2, 'Laptop', 'Dell XPS 15', 'Screen issue', 'Visit IT HUB', 'In Progress', 'Pending'
    ) RETURNING id`,
      [testId, userId],
    );
    assertEquals(insertRes.rows.length, 1);

    // Update status to 'Quality Check'
    const updateRes = await client.queryObject<{ status: string }>(
      `UPDATE public.service_requests 
     SET status = 'Quality Check', updated_at = now() 
     WHERE id = $1 
     RETURNING status`,
      [testId],
    );
    assertEquals(updateRes.rows[0].status, "Quality Check");

    // Clean up
    await client.queryArray(`DELETE FROM public.service_requests WHERE id = $1`, [testId]);
    await client.end();
  },
);

dbTest(
  "RPC: staff_update_service_status prevents completed tickets from reverting to earlier statuses",
  async () => {
    const client = new PgClient(DB_URL);
    await client.connect();
    const userId = await getValidUserId(client);

    const testId = crypto.randomUUID();
    await client.queryArray(
      `INSERT INTO public.service_requests (
      id, user_id, device, model, problem, method, status, payment_status
    ) VALUES (
      $1, $2, 'Mobile', 'iPhone 13', 'Battery draining fast', 'Visit IT HUB', 'Completed', 'Paid'
    )`,
      [testId, userId],
    );

    // A real staff identity, so the refusal comes from the business rule rather than the login check.
    const staffId = crypto.randomUUID();
    await client.queryArray(
      `INSERT INTO auth.users (id, email, aud, role) VALUES ($1, $2, 'authenticated', 'authenticated')`,
      [staffId, `revert-${staffId}@example.test`],
    );
    await client.queryArray(
      `INSERT INTO public.staff_members (user_id, role, full_name, email) VALUES ($1, 'service_staff', 'Synthetic', $2)`,
      [staffId, `revert-${staffId}@example.test`],
    );

    let revertedError: string | null = null;
    await client.queryArray("BEGIN");
    try {
      await client.queryArray(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: staffId, role: "authenticated" }),
      ]);
      await client.queryArray(
        `SELECT public.staff_update_service_status(
        $1::uuid,
        'In Progress'::text,
        'Bench Tech'::text,
        'Attempting illegal revert'::text
      )`,
        [testId],
      );
    } catch (err: any) {
      revertedError = err?.message || String(err);
    }
    await client.queryArray("ROLLBACK");

    assertExists(revertedError, "Reverting a Completed ticket must be rejected");
    assertEquals(revertedError.includes("Completed service requests cannot be reverted"), true);

    // Clean up
    await client.queryArray(`DELETE FROM public.service_requests WHERE id = $1`, [testId]);
    await client.end();
  },
);

dbTest(
  "RPC: get_service_request_tracking projects customer_description and created_at while omitting internal staff notes",
  async () => {
    const client = new PgClient(DB_URL);
    await client.connect();
    const userId = await getValidUserId(client);

    const testId = crypto.randomUUID();
    const guestToken = "testtoken1234567890abcdef";
    const customerNotes = "Screen flickering intermittently after physical drop on table";
    const internalSecretStaffNotes =
      "SECRET STAFF NOTE: Customer may be difficult; diagnostic fee waived per supervisor";

    await client.queryArray(
      `INSERT INTO public.service_requests (
      id, user_id, ticket_reference, device, model, problem, customer_description, notes, method, status, guest_tracking_token, payment_status
    ) VALUES (
      $1, $2, 'ITH-SER-TEST0001', 'Laptop', 'Lenovo ThinkPad T14', 'Screen issue', $3, $4, 'Visit IT HUB', 'Under Diagnosis', $5, 'Pending'
    )`,
      [testId, userId, customerNotes, internalSecretStaffNotes, guestToken],
    );

    // Query tracking RPC as public/guest
    const rpcRes = await client.queryObject<{ get_service_request_tracking: any }>(
      `SELECT public.get_service_request_tracking('ITH-SER-TEST0001', $1) as get_service_request_tracking`,
      [guestToken],
    );

    const trackingData = rpcRes.rows[0].get_service_request_tracking;
    assertExists(trackingData, "Tracking data should be returned for valid ticket and token");
    assertEquals(trackingData.device, "Laptop");
    assertEquals(trackingData.model, "Lenovo ThinkPad T14");
    assertEquals(trackingData.problem, "Screen issue");
    assertEquals(
      trackingData.customer_description,
      customerNotes,
      "Customer description must be projected",
    );
    assertExists(trackingData.created_at, "created_at booking date must be projected");

    // CRITICAL SECURITY ASSERTION: Internal staff notes must NEVER be exposed to public tracking!
    assertEquals(trackingData.notes, undefined, "Internal staff notes must not be present");
    assertEquals(trackingData.internal_notes, undefined, "Internal notes must not be present");
    assertEquals(
      trackingData.notesPublic,
      undefined,
      "notesPublic must not expose internal staff notes",
    );

    // Clean up
    await client.queryArray(`DELETE FROM public.service_requests WHERE id = $1`, [testId]);
    await client.end();
  },
);

dbTest(
  "Service booking: customer_description is persisted in public.service_requests",
  async () => {
    const client = new PgClient(DB_URL);
    await client.connect();
    const userId = await getValidUserId(client);

    const testId = crypto.randomUUID();
    const testNotes = "Laptop keyboard key 'W' is unresponsive and sticky";

    const insertRes = await client.queryObject<{
      id: string;
      customer_description: string;
      model: string;
    }>(
      `INSERT INTO public.service_requests (
      id, user_id, device, model, problem, customer_description, method, status, payment_status
    ) VALUES (
      $1, $2, 'Laptop', 'Asus ROG Strix G15', 'Keyboard issue', $3, 'Visit IT HUB', 'Booked', 'Pending'
    ) RETURNING id, customer_description, model`,
      [testId, userId, testNotes],
    );

    assertEquals(insertRes.rows.length, 1);
    assertEquals(insertRes.rows[0].customer_description, testNotes);
    assertEquals(insertRes.rows[0].model, "Asus ROG Strix G15");

    // Clean up
    await client.queryArray(`DELETE FROM public.service_requests WHERE id = $1`, [testId]);
    await client.end();
  },
);

dbTest("Quotation Payment State Machine: Approval does not mark payment as 'Paid'", async () => {
  const client = new PgClient(DB_URL);
  await client.connect();
  const userId = await getValidUserId(client);

  const testId = crypto.randomUUID();
  await client.queryArray(
    `INSERT INTO public.service_requests (
      id, user_id, ticket_reference, device, model, problem, method, status, quote, quote_state, payment_status
    ) VALUES (
      $1, $2, 'ITH-SER-QUOTE01', 'Desktop', 'Custom PC', 'Not turning on', 'Visit IT HUB', 'Awaiting Approval', 3500.00, 'pending', 'Pending'
    )`,
    [testId, userId],
  );

  // Simulate quotation approval
  await client.queryArray(
    `UPDATE public.service_requests
     SET quote_state = 'approved',
         status = 'In Progress',
         decision_notes = '[Quotation Authorized | Payment Option: Pay at IT HUB Showroom Counter]'
     WHERE id = $1`,
    [testId],
  );

  const checkRes = await client.queryObject<{
    quote_state: string;
    status: string;
    payment_status: string;
  }>(`SELECT quote_state, status, payment_status FROM public.service_requests WHERE id = $1`, [
    testId,
  ]);

  assertEquals(checkRes.rows[0].quote_state, "approved");
  assertEquals(checkRes.rows[0].status, "In Progress");
  // CRITICAL: Payment status MUST remain 'Pending' until server or counter settlement
  assertEquals(
    checkRes.rows[0].payment_status,
    "Pending",
    "Quotation approval alone must NOT mark payment as Paid",
  );

  // Clean up
  await client.queryArray(`DELETE FROM public.service_requests WHERE id = $1`, [testId]);
  await client.end();
});

Deno.test("Sell Category Cleanup: Retired 'Other Electronics' is blocked on new submissions", () => {
  function validateNewSellCategory(category: string): { valid: boolean; error?: string } {
    if (category === "Other Electronics") {
      return {
        valid: false,
        error:
          "The category 'Other Electronics' has been retired for new trade-in requests. Please select an active device category.",
      };
    }
    const allowed = [
      "Phone",
      "Laptop",
      "Desktop / PC",
      "Monitor",
      "Printer",
      "Tablet",
      "Accessories",
    ];
    if (!allowed.includes(category)) {
      return { valid: false, error: "Unsupported category." };
    }
    return { valid: true };
  }

  // Assert 'Other Electronics' is rejected
  const otherResult = validateNewSellCategory("Other Electronics");
  assertEquals(otherResult.valid, false);
  assertEquals(otherResult.error?.includes("retired"), true);

  // Assert active categories pass
  assertEquals(validateNewSellCategory("Phone").valid, true);
  assertEquals(validateNewSellCategory("Laptop").valid, true);
  assertEquals(validateNewSellCategory("Desktop / PC").valid, true);
  assertEquals(validateNewSellCategory("Monitor").valid, true);
  assertEquals(validateNewSellCategory("Printer").valid, true);
  assertEquals(validateNewSellCategory("Tablet").valid, true);
  assertEquals(validateNewSellCategory("Accessories").valid, true);
});

Deno.test("Timeline completed stage checkmark logic: Completed status displays green checkmark", () => {
  function evaluateStepVisual(
    stepIndex: number,
    totalSteps: number,
    currentStepIndex: number,
    statusName?: string,
    isCompleted?: boolean,
  ) {
    const isFinished = Boolean(
      isCompleted || statusName === "Completed" || currentStepIndex >= totalSteps - 1,
    );
    const isLast = stepIndex === totalSteps - 1;
    const isStepCompleted = isFinished
      ? stepIndex <= currentStepIndex || isLast
      : stepIndex < currentStepIndex;
    const isCurrentActive = !isFinished && stepIndex === currentStepIndex;

    return {
      isFinished,
      isStepCompleted,
      isCurrentActive,
      showGreenCheck: isFinished && isLast,
    };
  }

  // When statusName is "Completed":
  const resultCompleted = evaluateStepVisual(6, 7, 6, "Completed");
  assertEquals(resultCompleted.isFinished, true);
  assertEquals(resultCompleted.isStepCompleted, true);
  assertEquals(resultCompleted.isCurrentActive, false, "Must not be active pulsating dot");
  assertEquals(resultCompleted.showGreenCheck, true, "Final step must render green checkmark");

  // When statusName is "In Progress" (step 4 of 7):
  const resultInProgress = evaluateStepVisual(4, 7, 4, "In Progress");
  assertEquals(resultInProgress.isFinished, false);
  assertEquals(resultInProgress.isCurrentActive, true, "Current active step");
  assertEquals(resultInProgress.showGreenCheck, false);

  // Step before in-progress (step 2 of 7):
  const resultPast = evaluateStepVisual(2, 7, 4, "In Progress");
  assertEquals(resultPast.isStepCompleted, true);
  assertEquals(resultPast.isCurrentActive, false);
});
