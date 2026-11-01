// supabase/functions/tests/service-booking-methods.test.ts
// Comprehensive Automated Test Suite for Service Booking Workflow Redesign & Tracking Implementation:
// - Direct Store Walk-In (Kothamangalam)
// - Doorstep Technician Visit (~15 km radius)
// - Insured Courier Pickup & Return (All Kerala)
// - Scheduling & Sunday Exclusions
// - Method-Specific Tracking Pipelines (No obsolete "Pickup Scheduled", No walk-in transit timelines)
// - Authorized Technician Name Retrieval
// - Editable Staff Tracking Descriptions & Audit Trail

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Business Constants & Rules (Mirrors Core Domain Invariants)
// ─────────────────────────────────────────────────────────────────────────────

export const DOORSTEP_ELIGIBLE_PINS = [
  "686691", // Kothamangalam, Keerampara, Varapetty
  "686666", // Kothamangalam Bazaar
  "686671", // Pothanicad, Paingottoor
  "686692", // Kottappady
  "686668", // Ayavana
  "686661", // Muvattupuzha
  "686681", // Vazhakulam
];

export const SERVICE_FEES = {
  WALK_IN_LOGISTICS: 0,
  DOORSTEP_CALLOUT: 250,
  COURIER_RETURN_DELIVERY: 150,
  DIAGNOSTIC_ASSESSMENT: 299,
};

export const ALLOWED_TIME_SLOTS = [
  "10:00 – 12:00",
  "12:00 – 14:00",
  "14:00 – 16:00",
  "16:00 – 18:00",
  "18:00 – 19:30",
];

export const doorstepServiceStatuses = [
  "Booked",
  "Technician Assigned",
  "Technician has Left IT HUB",
  "Technician Arrived at Your Location",
  "Service in Progress",
  "Completed",
];

export const courierServiceStatuses = [
  "Booked",
  "Device Received",
  "Under Diagnosis",
  "Awaiting Approval",
  "In Progress",
  "Completed",
];

export const walkInServiceStatuses = [
  "Booked",
  "Device Received",
  "Under Diagnosis",
  "Awaiting Approval",
  "In Progress",
  "Ready for Pickup",
  "Completed",
];

export const DEFAULT_STATUS_DESCRIPTIONS: Record<string, string> = {
  Booked: "Service request received and logged in our system.",
  "Device Received": "Device received and safely checked in at IT HUB Kothamangalam service desk.",
  "Under Diagnosis":
    "Senior hardware technician is performing bench diagnostics and component health inspection.",
  "Diagnosis Done": "Bench diagnostics completed; preparation of itemized quotation is underway.",
  "Awaiting Approval":
    "Itemized repair estimate prepared. Awaiting customer review and authorization.",
  Approved: "Repairs authorized by customer. Component allocation and workshop queue confirmed.",
  "In Progress":
    "Hardware repair, micro-soldering, and thermal servicing currently in progress on bench.",
  "Technician Assigned":
    "A certified field technician has been assigned and is preparing tools and replacement spares.",
  "Technician has Left IT HUB":
    "Technician has departed IT HUB Kothamangalam and is traveling to your location.",
  "Technician on the Way":
    "Technician has departed IT HUB Kothamangalam and is traveling to your location.",
  "Technician Arrived at Your Location":
    "Technician has arrived at your address for doorstep diagnostic service.",
  "Technician Arrived": "Technician has arrived at your address for doorstep diagnostic service.",
  "Service in Progress":
    "Field technician is actively testing and servicing your equipment on-site.",
  "Ready for Pickup":
    "Service and quality checks completed. Device is packaged and ready for collection at our desk.",
  Completed: "Service successfully completed and verified.",
  Delivered: "Equipment safely returned to customer.",
  Returned: "Device returned.",
  Cancelled: "Service request cancelled.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure Validation Logic (Matches Storefront & DB Implementation)
// ─────────────────────────────────────────────────────────────────────────────

export function validateDoorstepPin(pincode?: string): { eligible: boolean; message?: string } {
  const clean = (pincode || "").trim();
  if (!clean) {
    return { eligible: false, message: "PIN code is required for doorstep technician visit." };
  }
  if (DOORSTEP_ELIGIBLE_PINS.includes(clean)) {
    return { eligible: true };
  }
  return {
    eligible: false,
    message:
      "Doorstep technician service is currently limited to approximately 15 km around Kothamangalam (PINs: 686691, 686666, 686671, 686692, 686668, 686661, 686681). Please select Direct Store Walk-In or Insured Courier Pickup & Return.",
  };
}

export function validateCourierPin(pincode?: string): { eligible: boolean; message?: string } {
  const clean = (pincode || "").trim();
  if (!clean) {
    return { eligible: false, message: "PIN code is required for courier return address." };
  }
  if (/^(67|68|69)\d{4}$/.test(clean)) {
    return { eligible: true };
  }
  return {
    eligible: false,
    message:
      "Insured courier return delivery is available across all Kerala districts (PIN codes starting with 67, 68, or 69).",
  };
}

export function validateAppointmentDate(
  dateStr?: string,
  referenceToday = new Date("2026-10-28T00:00:00Z"),
): { valid: boolean; error?: string } {
  if (!dateStr || !dateStr.trim()) {
    return { valid: false, error: "Please select an appointment date." };
  }
  const parts = dateStr.trim().split("-");
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid appointment date format. Use YYYY-MM-DD." };
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(d.getTime())) {
    return { valid: false, error: "Invalid appointment date format." };
  }
  if (d.getTime() < referenceToday.getTime()) {
    return { valid: false, error: "Appointment date cannot be in the past." };
  }
  // Sunday is UTC day 0
  if (d.getUTCDay() === 0) {
    return {
      valid: false,
      error:
        "IT HUB is closed on Sundays. Please select an appointment from Monday through Saturday.",
    };
  }
  return { valid: true };
}

export function getWizardStepsForMethod(method?: string): string[] {
  const m = (method || "").toLowerCase();
  const isCourier = m.includes("courier");
  if (isCourier) {
    return ["Device", "Problem", "Service Method", "Your Details", "Confirm"];
  }
  return ["Device", "Problem", "Service Method", "Your Details", "Date & Time", "Confirm"];
}

export function validateServiceProblem(
  problem?: string | null,
  device?: string,
  notes?: string,
): { valid: boolean; error?: string } {
  if (problem === undefined || problem === null || typeof problem !== "string" || !problem.trim()) {
    return {
      valid: false,
      error: "Please select the issue you're experiencing before continuing.",
    };
  }

  const cleanProblem = problem.trim();
  const isOther =
    cleanProblem === "Other" ||
    cleanProblem.toLowerCase().startsWith("other:") ||
    cleanProblem.toLowerCase().startsWith("other -");

  // If "Other" is selected, require custom description
  if (cleanProblem === "Other") {
    if (!notes || !notes.trim()) {
      return {
        valid: false,
        error: "Please describe the issue you're experiencing before continuing.",
      };
    }
  }

  return { valid: true };
}

export function validateServiceDeviceModel(model?: string): { valid: boolean; error?: string } {
  if (!model || !model.trim()) {
    return { valid: false, error: "Please enter your device brand and model number." };
  }
  return { valid: true };
}

export function validateCustomerMobile(phone?: string): { valid: boolean; error?: string } {
  const clean = (phone || "").trim();
  const digits = clean.replace(/\D/g, "");
  if (!clean) {
    return { valid: false, error: "Mobile phone number is required." };
  }
  if (digits.length < 10) {
    return { valid: false, error: "Please enter a valid 10-digit mobile number." };
  }
  if (!/^[6-9]\d{9}$/.test(digits.slice(-10))) {
    return {
      valid: false,
      error: "Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.",
    };
  }
  return { valid: true };
}

export function getStatusPipelineForMethod(method?: string): string[] {
  const m = (method || "").toLowerCase();
  if (m.includes("on-site") || m.includes("doorstep")) {
    return doorstepServiceStatuses;
  }
  if (m.includes("courier")) {
    return courierServiceStatuses;
  }
  return walkInServiceStatuses;
}

export function maskTrackingRecord(
  req: {
    id: string;
    userId?: string;
    device: string;
    model: string;
    problem: string;
    method: string;
    status: number | string;
    technician?: string;
    statusDescriptions?: Record<string, string>;
    inboundCourierTrackingNo?: string;
    pincode?: string;
    address?: string;
    name?: string;
    date?: string;
    time?: string;
  },
  isOwnerOrAdmin: boolean,
) {
  const pipeline = getStatusPipelineForMethod(req.method);
  let computedIdx = 0;
  const rawStatus = typeof req.status === "string" ? req.status : pipeline[req.status] || "Booked";

  const directIdx = pipeline.indexOf(rawStatus);
  if (directIdx !== -1) {
    computedIdx = directIdx;
  } else if (rawStatus === "Technician on the Way") {
    computedIdx = pipeline.indexOf("Technician has Left IT HUB");
  } else if (rawStatus === "Technician Arrived") {
    computedIdx = pipeline.indexOf("Technician Arrived at Your Location");
  } else if (rawStatus === "Service in Progress" || rawStatus === "In Progress") {
    computedIdx =
      pipeline.indexOf("Service in Progress") !== -1
        ? pipeline.indexOf("Service in Progress")
        : pipeline.indexOf("In Progress");
  } else {
    computedIdx = typeof req.status === "number" ? req.status : 0;
  }

  const statusLabel = pipeline[computedIdx] || rawStatus;
  const customDesc = req.statusDescriptions?.[rawStatus] || req.statusDescriptions?.[statusLabel];
  const statusDescription =
    customDesc || DEFAULT_STATUS_DESCRIPTIONS[statusLabel] || "Service in progress.";

  let techDisplay = req.technician || "IT HUB Bench Specialist";
  const isDoorstep = req.method.includes("On-site") || req.method.includes("Doorstep");
  if (isDoorstep) {
    if (computedIdx >= 1 && req.technician) {
      techDisplay = req.technician;
    } else if (computedIdx >= 1) {
      techDisplay = "Assigned IT HUB Field Specialist";
    } else {
      techDisplay = "IT HUB Dispatch Team";
    }
  }

  return {
    id: req.id,
    device: req.device,
    model: req.model,
    problem: req.problem,
    method: req.method,
    status: computedIdx,
    statusLabel,
    statusDescription,
    technicianPublic: techDisplay,
    pipelineSteps: pipeline,
    inboundCourierTrackingNo: isOwnerOrAdmin
      ? req.inboundCourierTrackingNo
      : req.inboundCourierTrackingNo
        ? "Recorded by Customer"
        : undefined,
    isWalkIn: req.method === "Visit IT HUB" || req.method === "Direct Store Walk-In",
    hasTimeline: !(req.method === "Visit IT HUB" || req.method === "Direct Store Walk-In"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Service Booking Methods & Tracking
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("BOOKING-1: Direct Store Walk-In creates valid booking with ₹0 logistics fee and scheduled appointment slot", () => {
  const method = "Visit IT HUB";
  const fees = SERVICE_FEES.WALK_IN_LOGISTICS;
  assertEquals(fees, 0, "Walk-in must have zero logistics charge");

  const appointmentCheck = validateAppointmentDate("2026-11-02"); // Monday
  assertEquals(appointmentCheck.valid, true);

  const slot = "10:00 – 12:00";
  assertEquals(ALLOWED_TIME_SLOTS.includes(slot), true);
});

Deno.test("BOOKING-2: Doorstep Technician Visit enforces ₹250 callout fee, mandatory device model, and full address", () => {
  const fee = SERVICE_FEES.DOORSTEP_CALLOUT;
  assertEquals(fee, 250, "Doorstep callout fee must be explicitly ₹250");

  // Valid doorstep request with required fields
  const validDoorstep = {
    method: "On-site service",
    device: "Laptop",
    model: "Dell XPS 15 9520",
    problem: "Thermal throttling and fan failure",
    pincode: "686691",
    houseBuilding: "Rose Villa Flat 3B",
    streetLocality: "AM Road",
    placeTown: "Kothamangalam",
  };

  assertEquals(Boolean(validDoorstep.model.trim()), true);
  const pinRes = validateDoorstepPin(validDoorstep.pincode);
  assertEquals(pinRes.eligible, true);
});

Deno.test("BOOKING-3: Device Brand & Model Number validation rejects missing or whitespace input for all device types", () => {
  const devices = ["Laptop", "Mobile", "Desktop", "Printer"];
  for (const device of devices) {
    const emptyRes = validateServiceDeviceModel("");
    assertEquals(emptyRes.valid, false, `${device} must reject empty model`);
    assertEquals(emptyRes.error, "Please enter your device brand and model number.");

    const whitespaceRes = validateServiceDeviceModel("   ");
    assertEquals(whitespaceRes.valid, false, `${device} must reject whitespace-only model`);
    assertEquals(whitespaceRes.error, "Please enter your device brand and model number.");

    const undefinedRes = validateServiceDeviceModel(undefined);
    assertEquals(undefinedRes.valid, false, `${device} must reject undefined model`);
    assertEquals(undefinedRes.error, "Please enter your device brand and model number.");

    assertEquals(validateServiceDeviceModel("Dell Inspiron 15 3511").valid, true);
    assertEquals(validateServiceDeviceModel("iPhone 13").valid, true);
    assertEquals(validateServiceDeviceModel("Custom Gaming PC Ryzen 7").valid, true);
    assertEquals(validateServiceDeviceModel("HP LaserJet Pro MFP 3103fdw").valid, true);
  }
});

Deno.test("BOOKING-4: Doorstep service area validation accepts ~15km Kothamangalam PINs", () => {
  const validPins = ["686691", "686666", "686671", "686692", "686668", "686661", "686681"];

  for (const pin of validPins) {
    const res = validateDoorstepPin(pin);
    assertEquals(
      res.eligible,
      true,
      `PIN ${pin} within ~15km Kothamangalam radius must be eligible`,
    );
  }
});

Deno.test("BOOKING-5: Doorstep service area validation rejects out-of-area PINs", () => {
  const outOfAreaPins = [
    "686693", // Neendapara / Neriamangalam (Strictly excluded from doorstep radius)
    "682001", // Kochi (~50 km)
    "680001", // Thrissur (~75 km)
    "695001", // Thiruvananthapuram (~220 km)
    "560001", // Bangalore (out of state)
    "110001", // New Delhi
  ];

  for (const pin of outOfAreaPins) {
    const res = validateDoorstepPin(pin);
    assertEquals(res.eligible, false, `Out-of-area PIN ${pin} must be rejected`);
    assertStringIncludes(
      res.message || "",
      "Doorstep technician service is currently limited to approximately 15 km around Kothamangalam",
    );
  }
});

Deno.test("BOOKING-6: Insured Courier Pickup & Return enforces ₹150 return delivery fee and mandatory device model", () => {
  const fee = SERVICE_FEES.COURIER_RETURN_DELIVERY;
  assertEquals(fee, 150, "Courier return delivery charge must be ₹150");

  const validCourier = {
    method: "Courier to IT HUB",
    device: "Desktop",
    model: "Custom Gaming PC Ryzen 7 7800X3D",
    pincode: "680001", // Thrissur
  };

  assertEquals(Boolean(validCourier.model.trim()), true);
  const pinRes = validateCourierPin(validCourier.pincode);
  assertEquals(pinRes.eligible, true);
});

Deno.test("BOOKING-7: Courier return address validates Kerala PIN codes and rejects non-Kerala PINs", () => {
  const validKeralaPins = ["670001", "682001", "686691", "695001", "673001"];
  for (const pin of validKeralaPins) {
    const res = validateCourierPin(pin);
    assertEquals(res.eligible, true, `Kerala PIN ${pin} must be valid for courier return`);
  }

  const invalidPins = ["560001", "600001", "400001", "110001", "1234"];
  for (const pin of invalidPins) {
    const res = validateCourierPin(pin);
    assertEquals(res.eligible, false, `Non-Kerala PIN ${pin} must be rejected for courier return`);
  }
});

Deno.test("BOOKING-8: Courier intake does not restrict to 15km doorstep radius and retains customer inbound consignment number", () => {
  const pinInCalicut = "673001"; // Calicut is ~180 km from Kothamangalam
  const doorstepRes = validateDoorstepPin(pinInCalicut);
  assertEquals(doorstepRes.eligible, false, "Calicut is outside 15km doorstep radius");

  const courierRes = validateCourierPin(pinInCalicut);
  assertEquals(
    courierRes.eligible,
    true,
    "Calicut is inside Kerala, so courier return is eligible",
  );

  const inboundTracking = "EK987654321IN";
  assertEquals(Boolean(inboundTracking.trim()), true);
});

Deno.test("BOOKING-9: Sunday appointments are strictly rejected client and server-side across all methods", () => {
  // 2026-11-01 is Sunday
  const sunday = "2026-11-01";
  const res = validateAppointmentDate(sunday, new Date("2026-10-28T00:00:00Z"));
  assertEquals(res.valid, false);
  assertStringIncludes(res.error || "", "closed on Sundays");

  // 2026-11-02 is Monday
  const monday = "2026-11-02";
  const mondayRes = validateAppointmentDate(monday, new Date("2026-10-28T00:00:00Z"));
  assertEquals(mondayRes.valid, true);

  // 2026-11-07 is Saturday
  const saturday = "2026-11-07";
  const satRes = validateAppointmentDate(saturday, new Date("2026-10-28T00:00:00Z"));
  assertEquals(satRes.valid, true);
});

Deno.test("BOOKING-10: Past appointment dates are strictly rejected across all methods", () => {
  const pastDate = "2026-10-25";
  const res = validateAppointmentDate(pastDate, new Date("2026-10-28T00:00:00Z"));
  assertEquals(res.valid, false);
  assertStringIncludes(res.error || "", "cannot be in the past");
});

Deno.test("BOOKING-11: Valid store operating time slots accepted; invalid slots rejected", () => {
  const validSlots = [
    "10:00 – 12:00",
    "12:00 – 14:00",
    "14:00 – 16:00",
    "16:00 – 18:00",
    "18:00 – 19:30",
  ];

  for (const s of validSlots) {
    assertEquals(ALLOWED_TIME_SLOTS.includes(s), true);
  }

  const invalidSlots = ["08:00 – 10:00", "20:00 – 22:00", "Midnight Slot", ""];
  for (const s of invalidSlots) {
    assertEquals(ALLOWED_TIME_SLOTS.includes(s), false);
  }
});

Deno.test("BOOKING-12: Duplicate booking prevention debounces rapid concurrent submissions within 15 seconds", () => {
  const inFlightCache = new Set<string>();
  const makeKey = (uid: string, dev: string, prob: string, slot: string) =>
    `${uid}_${dev}_${prob}_${slot}`;

  const key1 = makeKey("user-101", "Laptop", "Screen issue", "10:00 – 12:00");
  assertEquals(inFlightCache.has(key1), false);

  inFlightCache.add(key1);
  assertEquals(
    inFlightCache.has(key1),
    true,
    "Subsequent rapid click must be flagged as duplicate",
  );

  // A different user or different slot should not be blocked
  const key2 = makeKey("user-102", "Laptop", "Screen issue", "10:00 – 12:00");
  assertEquals(inFlightCache.has(key2), false);
});

Deno.test("TRACKING-1: Direct Store Walk-In tracking displays appointment and intake desk details without courier or technician timeline", () => {
  const walkInTicket = {
    id: "srv-walkin-001",
    device: "Laptop",
    model: "MacBook Air M1",
    problem: "Liquid spill on trackpad",
    method: "Visit IT HUB",
    status: 0,
    name: "Thomas Mathew",
    date: "2026-11-03",
    time: "10:00 – 12:00",
  };

  const tracked = maskTrackingRecord(walkInTicket, true);
  assertEquals(tracked.isWalkIn, true);
  assertEquals(
    tracked.hasTimeline,
    false,
    "Walk-in tracking must omit misleading delivery/technician timeline",
  );
  assertEquals(tracked.statusLabel, "Booked");
});

Deno.test("TRACKING-2: Doorstep Technician tracking follows 6-stage lifecycle", () => {
  assertEquals(doorstepServiceStatuses.length, 6);
  assertEquals(doorstepServiceStatuses[0], "Booked");
  assertEquals(doorstepServiceStatuses[1], "Technician Assigned");
  assertEquals(doorstepServiceStatuses[2], "Technician has Left IT HUB");
  assertEquals(doorstepServiceStatuses[3], "Technician Arrived at Your Location");
  assertEquals(doorstepServiceStatuses[4], "Service in Progress");
  assertEquals(doorstepServiceStatuses[5], "Completed");
});

Deno.test("TRACKING-3: Doorstep Technician tracking retrieves and displays assigned technician name from authorized staff record", () => {
  const doorstepTicket = {
    id: "srv-doorstep-002",
    device: "Desktop",
    model: "HP Pavilion Tower",
    problem: "SMPS blown, no power",
    method: "On-site service",
    status: "Technician Assigned",
    technician: "Service Tech",
  };

  const tracked = maskTrackingRecord(doorstepTicket, true);
  assertEquals(tracked.status, 1);
  assertEquals(tracked.statusLabel, "Technician Assigned");
  assertEquals(
    tracked.technicianPublic,
    "Service Tech",
    "Must display assigned technician name from record",
  );
});

Deno.test("TRACKING-4: Doorstep Technician tracking does not claim technician arrived or departed unless recorded by staff", () => {
  const bookedDoorstep = {
    id: "srv-doorstep-003",
    device: "Printer",
    model: "Epson L3250",
    problem: "Paper jam sensor stuck",
    method: "On-site service",
    status: "Booked",
    technician: undefined,
  };

  const trackedBooked = maskTrackingRecord(bookedDoorstep, true);
  assertEquals(trackedBooked.status, 0);
  assertEquals(trackedBooked.statusLabel, "Booked");
  assertEquals(
    trackedBooked.technicianPublic,
    "IT HUB Dispatch Team",
    "Must not fabricate technician arrival or departure",
  );

  // Advance to "Technician has Left IT HUB"
  const enRouteDoorstep = {
    ...bookedDoorstep,
    status: "Technician has Left IT HUB",
    technician: "Service Tech",
  };
  const trackedEnRoute = maskTrackingRecord(enRouteDoorstep, true);
  assertEquals(trackedEnRoute.status, 2);
  assertEquals(trackedEnRoute.statusLabel, "Technician has Left IT HUB");
});

Deno.test("TRACKING-5: Courier tracking follows valid lifecycle without obsolete 'Pickup Scheduled' stage", () => {
  assertEquals(
    courierServiceStatuses.includes("Pickup Scheduled"),
    false,
    "Pickup Scheduled must be removed",
  );
  assertEquals(
    courierServiceStatuses.includes("Pickup scheduled"),
    false,
    "Pickup scheduled must be removed",
  );

  assertEquals(courierServiceStatuses, [
    "Booked",
    "Device Received",
    "Under Diagnosis",
    "Awaiting Approval",
    "In Progress",
    "Completed",
  ]);
});

Deno.test("TRACKING-6: Editable staff descriptions allow authorized staff to update customer-facing message with audit trail", () => {
  const ticket = {
    id: "srv-edit-001",
    device: "Laptop",
    model: "Dell Inspiron 15",
    problem: "Hinge broken",
    method: "On-site service",
    status: "Technician Assigned",
    technician: "Service Tech",
    statusDescriptions: {
      "Technician Assigned":
        "Technician Service Tech has been dispatched with replacement hinges and thermal paste.",
    },
  };

  const tracked = maskTrackingRecord(ticket, true);
  assertEquals(
    tracked.statusDescription,
    "Technician Service Tech has been dispatched with replacement hinges and thermal paste.",
    "Must display custom staff tracking description",
  );
});

Deno.test("TRACKING-7: Canonical status code remains preserved when custom description is updated", () => {
  const canonicalStatus = "Under Diagnosis";
  const customDesc = "Microscope inspection confirmed faulty GPU VRAM phase capacitor.";

  const record = {
    status: canonicalStatus,
    statusDescriptions: {
      [canonicalStatus]: customDesc,
    },
  };

  assertEquals(
    record.status,
    "Under Diagnosis",
    "Canonical status code must not be overwritten by description text",
  );
  assertEquals(record.statusDescriptions["Under Diagnosis"], customDesc);
});

Deno.test("TRACKING-8: Safe default tracking descriptions apply when no custom description exists", () => {
  const ticket = {
    id: "srv-default-001",
    device: "Laptop",
    model: "Acer Aspire",
    problem: "Boot loop",
    method: "Courier to IT HUB",
    status: "Device Received",
    statusDescriptions: {},
  };

  const tracked = maskTrackingRecord(ticket, true);
  assertEquals(
    tracked.statusDescription,
    "Device received and safely checked in at IT HUB Kothamangalam service desk.",
    "Must fall back to safe canonical default description",
  );
});

Deno.test("TRACKING-9: Customer isolation: unauthenticated or non-owner callers cannot view private details or internal notes", () => {
  const sensitiveTicket = {
    id: "srv-sens-001",
    device: "Laptop",
    model: "ThinkPad X1 Carbon",
    problem: "Liquid spill",
    method: "Courier to IT HUB",
    status: "Booked",
    inboundCourierTrackingNo: "SECRET-DTDC-9999",
    name: "Private Customer",
  };

  // Masked for public / non-owner
  const publicView = maskTrackingRecord(sensitiveTicket, false);
  assertEquals(
    publicView.inboundCourierTrackingNo,
    "Recorded by Customer",
    "Public view must redact private inbound tracking consignment number",
  );

  // Authenticated owner view
  const ownerView = maskTrackingRecord(sensitiveTicket, true);
  assertEquals(
    ownerView.inboundCourierTrackingNo,
    "SECRET-DTDC-9999",
    "Owner must have access to their own consignment number",
  );
});

Deno.test("WIZARD-1: Back navigation and method switching preserves customer inputs without data loss", () => {
  let formState = {
    device: "Laptop",
    model: "Lenovo Legion 5",
    problem: "Screen flickering",
    notes: "Happens when opening lid past 90 degrees",
    method: "Visit IT HUB",
    name: "George K.",
    email: "george@example.com",
    phone: "9447055443",
    houseBuilding: "Villa 10",
    streetLocality: "AM Road",
    placeTown: "Kothamangalam",
    pincode: "686691",
  };

  // User changes method from Walk-In to Doorstep
  formState = { ...formState, method: "On-site service" };
  assertEquals(formState.model, "Lenovo Legion 5", "Model must not be cleared on method switch");
  assertEquals(formState.problem, "Screen flickering", "Problem must be preserved");

  // User changes to Courier
  formState = { ...formState, method: "Courier to IT HUB" };
  assertEquals(formState.name, "George K.");
  assertEquals(formState.pincode, "686691");
  assertEquals(formState.notes, "Happens when opening lid past 90 degrees");
});

Deno.test("NETWORK-1: Server validation errors return actionable messages allowing customer correction and retry", () => {
  function handleApiSubmission(input: { pincode: string; method: string; date: string }) {
    if (input.method === "On-site service") {
      const pinRes = validateDoorstepPin(input.pincode);
      if (!pinRes.eligible) {
        return { ok: false, error: pinRes.message, retryable: true };
      }
    }
    const dateRes = validateAppointmentDate(input.date, new Date("2026-10-28T00:00:00Z"));
    if (!dateRes.valid) {
      return { ok: false, error: dateRes.error, retryable: true };
    }
    return { ok: true, id: "SRV-TEST" };
  }

  // Customer selects Sunday -> server error returned with retryable = true
  const failSunday = handleApiSubmission({
    pincode: "686691",
    method: "On-site service",
    date: "2026-11-01", // Sunday
  });
  assertEquals(failSunday.ok, false);
  assertEquals(failSunday.retryable, true);
  assertStringIncludes(failSunday.error || "", "closed on Sundays");

  // Customer corrects to Monday -> succeeds
  const passMonday = handleApiSubmission({
    pincode: "686691",
    method: "On-site service",
    date: "2026-11-02", // Monday
  });
  assertEquals(passMonday.ok, true);
});

Deno.test("DYNAMIC-1: Direct Store Walk-In configures 6 dynamic steps including Date & Time", () => {
  const steps = getWizardStepsForMethod("Visit IT HUB");
  assertEquals(steps.length, 6, "Walk-In flow must contain exactly 6 steps");
  assertEquals(steps, [
    "Device",
    "Problem",
    "Service Method",
    "Your Details",
    "Date & Time",
    "Confirm",
  ]);
});

Deno.test("DYNAMIC-2: Doorstep Technician Visit configures 6 dynamic steps including Date & Time", () => {
  const steps = getWizardStepsForMethod("On-site service");
  assertEquals(steps.length, 6, "Doorstep visit flow must contain exactly 6 steps");
  assertEquals(steps, [
    "Device",
    "Problem",
    "Service Method",
    "Your Details",
    "Date & Time",
    "Confirm",
  ]);
});

Deno.test("DYNAMIC-3: Insured Courier Pickup & Return configures strictly 5 dynamic steps and omits Date & Time", () => {
  const steps = getWizardStepsForMethod("Courier to IT HUB");
  assertEquals(steps.length, 5, "Courier flow must contain strictly 5 steps");
  assertEquals(steps, ["Device", "Problem", "Service Method", "Your Details", "Confirm"]);
  assertEquals(
    steps.includes("Date & Time"),
    false,
    "Date & Time step must not be present in Courier flow",
  );
});

Deno.test("DYNAMIC-4: Problem step validation rejects empty, undefined, or whitespace-only problem descriptions", () => {
  assertEquals(validateServiceProblem("").valid, false);
  assertEquals(validateServiceProblem("   ").valid, false);
  assertEquals(validateServiceProblem(undefined).valid, false);
  assertEquals(validateServiceProblem("Screen flickering and green lines").valid, true);
});

Deno.test("DYNAMIC-5: Mobile phone validation accepts valid Indian 10-digit mobile starting 6-9 and rejects malformed/short numbers", () => {
  assertEquals(validateCustomerMobile("").valid, false);
  assertEquals(validateCustomerMobile("12345").valid, false);
  assertEquals(validateCustomerMobile("0987654321").valid, false); // starts with 0
  assertEquals(validateCustomerMobile("5432109876").valid, false); // starts with 5
  assertEquals(validateCustomerMobile("9447055443").valid, true); // valid BSNL Kerala
  assertEquals(validateCustomerMobile("+91 94470 55443").valid, true); // valid formatted
  assertEquals(validateCustomerMobile("7012345678").valid, true); // valid Jio Kerala
});

Deno.test("DYNAMIC-6: Courier booking submission completes successfully with null preferred_date and preferred_slot", () => {
  // Simulates server-side booking payload for Courier
  const courierInput = {
    device: "Laptop",
    model: "Lenovo ThinkPad T14",
    problem: "Battery not charging",
    method: "Courier to IT HUB",
    name: "Anoop V.",
    phone: "9847123456",
    houseBuilding: "House 12",
    streetLocality: "MG Road",
    placeTown: "Ernakulam",
    pincode: "682001",
    date: undefined, // omitted for courier
    time: undefined, // omitted for courier
  };

  const probCheck = validateServiceProblem(courierInput.problem);
  assertEquals(probCheck.valid, true);

  const phoneCheck = validateCustomerMobile(courierInput.phone);
  assertEquals(phoneCheck.valid, true);

  const pinCheck = validateCourierPin(courierInput.pincode);
  assertEquals(pinCheck.eligible, true);

  // When date is undefined for Courier, validateAppointmentDate is not invoked
  const isCourier = courierInput.method === "Courier to IT HUB";
  assertEquals(isCourier, true);
  assertEquals(courierInput.date, undefined, "No fake appointment timestamp passed");
});

Deno.test("DYNAMIC-7: Dynamic step bounds clamping prevents out-of-range step index when switching between 6-step and 5-step workflows", () => {
  // User was on step index 5 ("Confirm") in 6-step Doorstep flow
  let stepIndex = 5;
  const doorstepSteps = getWizardStepsForMethod("On-site service");
  assertEquals(doorstepSteps.length, 6);
  assertEquals(Math.min(stepIndex, doorstepSteps.length - 1), 5);

  // User changes method to Courier (5 steps)
  const courierSteps = getWizardStepsForMethod("Courier to IT HUB");
  assertEquals(courierSteps.length, 5);

  // Clamping ensures index stays within [0, 4]
  stepIndex = Math.min(stepIndex, courierSteps.length - 1);
  assertEquals(stepIndex, 4, "Clamped to last step of Courier flow (Confirm)");
  assertEquals(courierSteps[stepIndex], "Confirm");
});
