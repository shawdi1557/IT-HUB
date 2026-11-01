// supabase/functions/tests/service-payment-method-correction.test.ts
// Test-Driven Development (TDD) Suite for Service Payment Method Correction:
// Removal of "Pay at IT HUB" from Service Quotation Modal while preserving
// Courier to IT HUB service logistics and Staff billing infrastructure.
// IT HUB — Kerala, India

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

const MODAL_PATH = "src/components/RepairPaymentModal.tsx";
const SERVICES_PATH = "src/pages/Services.tsx";
const SERVICES_LIB_PATH = "src/lib/services.ts";
const PAYMENTS_LIB_PATH = "src/lib/payments.ts";
const SERVICE_PAYMENTS_LIB_PATH = "src/lib/servicePayments.ts";
const ADMIN_SERVICES_PATH = "ITHUB_ADMIN/src/lib/services.ts";
const ADMIN_MODAL_PATH = "ITHUB_ADMIN/src/components/ServiceDetailModal.tsx";

// SPMC-1: Quotation payment modal must NOT contain "Pay at IT HUB" or "Pay at IT HUB Showroom" payment options
Deno.test("SPMC-1: RepairPaymentModal does not contain 'Pay at IT HUB Showroom' or 'Pay at IT HUB' payment option", async () => {
  const code = await Deno.readTextFile(MODAL_PATH);

  // Must not have showroom button or method B
  const hasShowroomButton = /Method B:\s*Pay at IT HUB Showroom/i.test(code);
  assertEquals(
    hasShowroomButton,
    false,
    "RepairPaymentModal must not contain Method B: Pay at IT HUB Showroom",
  );

  // Must not have handlePayAtStore function
  const hasHandlePayAtStore = /const\s+handlePayAtStore\s*=/i.test(code);
  assertEquals(
    hasHandlePayAtStore,
    false,
    "RepairPaymentModal must not contain handlePayAtStore handler",
  );

  // Must not offer setPaymentMethod("store")
  const hasSetStore = /setPaymentMethod\(\s*["']store["']\s*\)/i.test(code);
  assertEquals(
    hasSetStore,
    false,
    "RepairPaymentModal must not offer selection of 'store' payment method",
  );

  // Must not mention 'Pay at IT HUB' as a payment choice
  const hasPayAtStoreChoice = /Select your preferred payment method:.*Pay at IT HUB/i.test(code);
  assertEquals(
    hasPayAtStoreChoice,
    false,
    "RepairPaymentModal header must not invite selecting Pay at IT HUB",
  );
});

// SPMC-2: Quotation payment modal execution directly triggers UPI via Razorpay
Deno.test("SPMC-2: RepairPaymentModal executes Razorpay UPI payment directly without offline branch", async () => {
  const code = await Deno.readTextFile(MODAL_PATH);

  // handleExecutePayment should directly call handleRazorpayUpiPayment
  assertStringIncludes(code, "handleRazorpayUpiPayment");
  const hasBranchToPayAtStore =
    /if\s*\(\s*paymentMethod\s*===\s*["']store["']\s*\)\s*\{\s*handlePayAtStore/i.test(code);
  assertEquals(
    hasBranchToPayAtStore,
    false,
    "handleExecutePayment must not branch to handlePayAtStore",
  );
});

// SPMC-3: Fallback and error messages must not instruct users to select "Pay at IT HUB"
Deno.test("SPMC-3: Error fallback messages do not suggest selecting 'Pay at IT HUB'", async () => {
  const code = await Deno.readTextFile(MODAL_PATH);

  const hasFallbackSuggestingStore =
    /select\s+Pay at IT HUB/i.test(code) || /choose\s+['"]Pay at IT HUB['"]/i.test(code);
  assertEquals(
    hasFallbackSuggestingStore,
    false,
    "Error messages must not suggest selecting 'Pay at IT HUB'",
  );
});

// SPMC-4: Razorpay UPI authoritative payment flow is preserved intact
Deno.test("SPMC-4: Razorpay UPI order creation and signature verification remain fully integrated", async () => {
  const code = await Deno.readTextFile(MODAL_PATH);

  // Must import and use Razorpay SDK & Edge Functions
  assertStringIncludes(code, "createServiceRazorpayOrder");
  assertStringIncludes(code, "verifyServicePaymentCallback");
  assertStringIncludes(code, "loadRazorpayScript");
  assertStringIncludes(code, "getRazorpayUpiCheckoutConfig");
  assertStringIncludes(code, "UPI via Razorpay");
});

// SPMC-5: Step 3 Success receipt displays authoritative verified payment
Deno.test("SPMC-5: Step 3 Success screen displays verified captured UPI receipt without Pay at Store branch", async () => {
  const code = await Deno.readTextFile(MODAL_PATH);

  // Receipt badge should be CAPTURED
  assertStringIncludes(code, "CAPTURED");
  assertStringIncludes(code, "UPI (Razorpay)");

  // Must not have conditional title for store settlement
  const hasStoreSuccessTitle =
    /Repair Authorized — Pay at IT HUB/i.test(code) ||
    /Repair Authorized - Pay at IT HUB/i.test(code);
  assertEquals(
    hasStoreSuccessTitle,
    false,
    "Step 3 must not render 'Repair Authorized — Pay at IT HUB'",
  );

  // Must not render PAY AT STORE badge in quotation modal
  const hasStoreBadgeInModal = /<Badge[^>]*>\s*PAY AT STORE\s*<\/Badge>/i.test(code);
  assertEquals(
    hasStoreBadgeInModal,
    false,
    "Step 3 must not render PAY AT STORE badge in quotation modal",
  );
});

// SPMC-6: Courier to IT HUB service logistics method is strictly preserved
Deno.test("SPMC-6: Customer-facing Courier to IT HUB service method and logistics workflow are fully preserved", async () => {
  const code = await Deno.readTextFile(SERVICES_PATH);
  const libCode = await Deno.readTextFile(SERVICES_LIB_PATH);

  // Booking method options
  assertStringIncludes(code, '"Courier to IT HUB"');
  assertStringIncludes(code, "Insured Courier Pickup & Return");
  assertStringIncludes(libCode, "validateCourierPin");
  assertStringIncludes(libCode, "inboundCourierTrackingNo");
  assertStringIncludes(libCode, "COURIER_RETURN_DELIVERY");
});

// SPMC-7: Shared payment infrastructure remains intact for backward compatibility & staff portal
Deno.test("SPMC-7: Shared service payments infrastructure in lib remains intact", async () => {
  const libCode = await Deno.readTextFile(PAYMENTS_LIB_PATH);
  const serviceLibCode = await Deno.readTextFile(SERVICE_PAYMENTS_LIB_PATH);

  // Shared RPC callers
  assertStringIncludes(libCode, "recordServicePayAtStore");
  assertStringIncludes(libCode, "buildOfflinePayAtStoreRecord");
  assertStringIncludes(libCode, "createServiceRazorpayOrder");
  assertStringIncludes(libCode, "verifyServicePaymentCallback");

  // Shared payment types
  assertStringIncludes(serviceLibCode, "ALLOWED_SERVICE_PAYMENT_METHODS");
  assertStringIncludes(serviceLibCode, "buildOfflinePayAtStoreRecord");
  assertStringIncludes(serviceLibCode, "buildStaffPaymentReceivedRecord");
});

// SPMC-8: Staff Portal on-site billing and courier parcel intake are strictly preserved
Deno.test("SPMC-8: Staff Portal on-site billing and courier parcel intake are intact", async () => {
  const adminServicesCode = await Deno.readTextFile(ADMIN_SERVICES_PATH);
  const adminModalCode = await Deno.readTextFile(ADMIN_MODAL_PATH);

  // Staff on-site billing sets "Pay at Store" when offline
  assertStringIncludes(adminServicesCode, 'updatePayload.payment_status = "Pay at Store"');
  assertStringIncludes(adminServicesCode, 'updatePayload.payment_status = "Paid"');

  // Staff parcel intake for courier tickets
  assertStringIncludes(adminModalCode, "Confirm Parcel Received at IT HUB");
  assertStringIncludes(adminModalCode, 'updateServiceStatus(service.id, "Device Received")');
  assertStringIncludes(adminModalCode, 'setStatus("Device Received")');
});
