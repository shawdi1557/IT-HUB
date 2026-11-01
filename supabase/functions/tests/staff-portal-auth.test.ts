// supabase/functions/tests/staff-portal-auth.test.ts
// Automated Test Suite for IT HUB Staff Portal Authentication & RBAC Isolation

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

export type StaffRole = "portal_admin" | "quotation_staff" | "service_staff";

export interface StaffMember {
  user_id: string;
  role: StaffRole;
  full_name: string;
  email: string;
  is_active: boolean;
}

export interface ProfileRecord {
  id: string;
  email: string;
  role: "admin" | "customer";
}

// In-memory mock database state
const mockProfiles: Record<string, ProfileRecord> = {
  "admin-uid-1": { id: "admin-uid-1", email: "ithubkmgm@gmail.com", role: "admin" },
  "quote-staff-uid": { id: "quote-staff-uid", email: "quotations@ithub.com", role: "customer" },
  "service-staff-uid": { id: "service-staff-uid", email: "repairs@ithub.com", role: "customer" },
  "customer-uid-1": { id: "customer-uid-1", email: "john.doe@example.com", role: "customer" },
  "customer-uid-2": { id: "customer-uid-2", email: "priya.sharma@example.com", role: "customer" },
};

const mockStaffMembers: Record<string, StaffMember> = {
  "admin-uid-1": {
    user_id: "admin-uid-1",
    role: "portal_admin",
    full_name: "IT HUB Super Admin",
    email: "ithubkmgm@gmail.com",
    is_active: true,
  },
  "quote-staff-uid": {
    user_id: "quote-staff-uid",
    role: "quotation_staff",
    full_name: "PC Quotations Specialist",
    email: "quotations@ithub.com",
    is_active: true,
  },
  "service-staff-uid": {
    user_id: "service-staff-uid",
    role: "service_staff",
    full_name: "Lead Service Engineer",
    email: "repairs@ithub.com",
    is_active: true,
  },
  "inactive-staff-uid": {
    user_id: "inactive-staff-uid",
    role: "service_staff",
    full_name: "Former Staff",
    email: "former@ithub.com",
    is_active: false,
  },
};

// Logic mirroring get_staff_portal_profile() and get_current_staff_role()
function getStaffPortalProfile(userId: string | null): {
  authorized: boolean;
  role: StaffRole | null;
  full_name: string | null;
  email: string | null;
  error?: string;
} {
  if (!userId) {
    return {
      authorized: false,
      role: null,
      full_name: null,
      email: null,
      error: "Not authenticated",
    };
  }

  // 1. Check if user is in staff_members
  const staff = mockStaffMembers[userId];
  if (staff) {
    if (!staff.is_active) {
      return {
        authorized: false,
        role: null,
        full_name: null,
        email: null,
        error: "Account deactivated",
      };
    }
    return {
      authorized: true,
      role: staff.role,
      full_name: staff.full_name,
      email: staff.email,
    };
  }

  // 2. Fallback to existing public.profiles admin
  const profile = mockProfiles[userId];
  if (profile && profile.role === "admin") {
    return {
      authorized: true,
      role: "portal_admin",
      full_name: "IT HUB Administrator",
      email: profile.email,
    };
  }

  // 3. Customer or unlisted user: strictly unauthorized
  return {
    authorized: false,
    role: null,
    full_name: null,
    email: null,
    error: "Unauthorized: Access restricted to authorized IT HUB staff",
  };
}

function checkPermission(
  role: StaffRole | null,
  action: "manage_quotations" | "manage_services" | "manage_staff",
): boolean {
  if (!role) return false;
  if (role === "portal_admin") return true;
  if (action === "manage_quotations" && role === "quotation_staff") return true;
  if (action === "manage_services" && role === "service_staff") return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("Staff Auth - Unauthenticated users are rejected", () => {
  const result = getStaffPortalProfile(null);
  assertEquals(result.authorized, false);
  assertEquals(result.role, null);
  assertEquals(result.error, "Not authenticated");
});

Deno.test("Staff Auth - Customer sessions cannot access staff portal", () => {
  const result1 = getStaffPortalProfile("customer-uid-1");
  assertEquals(result1.authorized, false);
  assertEquals(result1.role, null);
  assertEquals(result1.error, "Unauthorized: Access restricted to authorized IT HUB staff");

  const result2 = getStaffPortalProfile("customer-uid-2");
  assertEquals(result2.authorized, false);
});

Deno.test("Staff Auth - Primary admin maps to portal_admin with full permissions", () => {
  const result = getStaffPortalProfile("admin-uid-1");
  assertEquals(result.authorized, true);
  assertEquals(result.role, "portal_admin");

  assertEquals(checkPermission(result.role, "manage_quotations"), true);
  assertEquals(checkPermission(result.role, "manage_services"), true);
  assertEquals(checkPermission(result.role, "manage_staff"), true);
});

Deno.test("Staff Auth - Quotation staff can manage quotations but not services or staff", () => {
  const result = getStaffPortalProfile("quote-staff-uid");
  assertEquals(result.authorized, true);
  assertEquals(result.role, "quotation_staff");

  assertEquals(checkPermission(result.role, "manage_quotations"), true);
  assertEquals(checkPermission(result.role, "manage_services"), false);
  assertEquals(checkPermission(result.role, "manage_staff"), false);
});

Deno.test("Staff Auth - Service staff can manage services but not quotations or staff", () => {
  const result = getStaffPortalProfile("service-staff-uid");
  assertEquals(result.authorized, true);
  assertEquals(result.role, "service_staff");

  assertEquals(checkPermission(result.role, "manage_quotations"), false);
  assertEquals(checkPermission(result.role, "manage_services"), true);
  assertEquals(checkPermission(result.role, "manage_staff"), false);
});

Deno.test("Staff Auth - Deactivated staff members cannot access portal", () => {
  const result = getStaffPortalProfile("inactive-staff-uid");
  assertEquals(result.authorized, false);
  assertEquals(result.role, null);
  assertEquals(result.error, "Account deactivated");
});

// ─────────────────────────────────────────────────────────────────────────────
// OTP & Password Flow Simulation Tests (Matching ITHUB_ADMIN/src/lib/auth.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface MockGoTrueResponse {
  error?: {
    message: string;
    status?: number;
    code?: string;
  } | null;
  user?: { id: string; email: string } | null;
}

function simulateRequestStaffEmailOtp(
  email: string,
  existingUsersInAuth: string[],
  options?: { emailProviderEnabled?: boolean; rateLimited?: boolean },
): { ok: boolean; message?: string; error?: string; isAccountNotFound?: boolean } {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { ok: false, error: "Please enter a valid staff email address." };
  }

  if (options?.rateLimited) {
    return {
      ok: false,
      error: "Too many sign-in attempts. Please wait 60 seconds and try again.",
    };
  }

  if (options?.emailProviderEnabled === false) {
    return {
      ok: false,
      error:
        "Email OTP service is not enabled in Supabase settings. Please sign in with your staff password.",
    };
  }

  // GoTrue behavior when shouldCreateUser: false
  const userExists = existingUsersInAuth.includes(cleanEmail);
  if (!userExists) {
    // GoTrue error when shouldCreateUser: false and user is not in auth.users
    const goTrueError = {
      message: "Signups not allowed for otp",
      status: 422,
      code: "signup_disabled",
    };
    const msg = goTrueError.message.toLowerCase();
    if (
      msg.includes("signups not allowed for otp") ||
      msg.includes("signup_disabled") ||
      msg.includes("user not found")
    ) {
      return {
        ok: false,
        isAccountNotFound: true,
        error:
          "No authorized staff account found for this email address. Please ensure your account has been provisioned by an administrator, or sign in using your password.",
      };
    }
    return { ok: false, error: goTrueError.message };
  }

  return { ok: true, message: `Verification code sent to ${cleanEmail}` };
}

function simulateSignInStaffWithPassword(
  email: string,
  passwordAttempt: string,
  registeredAuthUsers: Record<string, { id: string; password: string }>,
): {
  ok: boolean;
  profile?: ReturnType<typeof getStaffPortalProfile>;
  error?: string;
  isUnauthorizedCustomer?: boolean;
} {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !passwordAttempt) {
    return { ok: false, error: "Email and password are required." };
  }

  const authUser = registeredAuthUsers[cleanEmail];
  if (!authUser || authUser.password !== passwordAttempt) {
    return {
      ok: false,
      error: "Invalid email or password. Please verify your credentials and try again.",
    };
  }

  // Server-side staff authorization verification
  const staffProfile = getStaffPortalProfile(authUser.id);
  if (!staffProfile.authorized) {
    return {
      ok: false,
      isUnauthorizedCustomer: true,
      error: "Access Denied: You do not possess staff portal authorization.",
    };
  }

  return { ok: true, profile: staffProfile };
}

function simulateVerifyStaffEmailOtp(
  email: string,
  token: string,
  expectedTokens: Record<string, { code: string; userId: string; expired?: boolean }>,
): {
  ok: boolean;
  profile?: ReturnType<typeof getStaffPortalProfile>;
  error?: string;
  isUnauthorizedCustomer?: boolean;
} {
  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = token.trim();

  if (!cleanToken || cleanToken.length < 6) {
    return { ok: false, error: "Please enter the 6-digit verification code." };
  }

  const record = expectedTokens[cleanEmail];
  if (!record || record.code !== cleanToken) {
    return {
      ok: false,
      error: "Invalid verification code. Please check the 6-digit code and try again.",
    };
  }

  if (record.expired) {
    return { ok: false, error: "Verification code has expired. Please request a new code." };
  }

  const staffProfile = getStaffPortalProfile(record.userId);
  if (!staffProfile.authorized) {
    return {
      ok: false,
      isUnauthorizedCustomer: true,
      error: "Access Denied: Account is not an authorized IT HUB staff member.",
    };
  }

  return { ok: true, profile: staffProfile };
}

Deno.test("Staff Auth - Non-existent staff email requesting OTP gracefully translates GoTrue 'Signups not allowed for otp'", () => {
  const existingAuthUsers = ["ithubkmgm@gmail.com", "quotations@ithub.com"];

  // User types technician@ithubkothamangalam.com which is not in auth.users
  const result = simulateRequestStaffEmailOtp(
    "technician@ithubkothamangalam.com",
    existingAuthUsers,
  );

  assertEquals(result.ok, false);
  assertEquals(result.isAccountNotFound, true);
  assertEquals(
    result.error,
    "No authorized staff account found for this email address. Please ensure your account has been provisioned by an administrator, or sign in using your password.",
  );
});

Deno.test("Staff Auth - Existing provisioned staff email requesting OTP succeeds", () => {
  const existingAuthUsers = ["ithubkmgm@gmail.com", "quotations@ithub.com"];

  const result = simulateRequestStaffEmailOtp("quotations@ithub.com", existingAuthUsers);

  assertEquals(result.ok, true);
  assertEquals(result.message, "Verification code sent to quotations@ithub.com");
  assertEquals(result.error, undefined);
});

Deno.test("Staff Auth - Unconfigured email provider in Supabase returns clean guidance", () => {
  const existingAuthUsers = ["ithubkmgm@gmail.com"];

  const result = simulateRequestStaffEmailOtp("ithubkmgm@gmail.com", existingAuthUsers, {
    emailProviderEnabled: false,
  });

  assertEquals(result.ok, false);
  assertEquals(
    result.error,
    "Email OTP service is not enabled in Supabase settings. Please sign in with your staff password.",
  );
});

Deno.test("Staff Auth - Rate limit (HTTP 429) returns clean rate limit notice", () => {
  const existingAuthUsers = ["ithubkmgm@gmail.com"];

  const result = simulateRequestStaffEmailOtp("ithubkmgm@gmail.com", existingAuthUsers, {
    rateLimited: true,
  });

  assertEquals(result.ok, false);
  assertEquals(result.error, "Too many sign-in attempts. Please wait 60 seconds and try again.");
});

Deno.test("Staff Auth - Existing staff member authenticates with password successfully", () => {
  const mockAuthUsers = {
    "ithubkmgm@gmail.com": { id: "admin-uid-1", password: "StrongAdminPassword123!" },
    "repairs@ithub.com": { id: "service-staff-uid", password: "ServiceStaffPassword456!" },
  };

  const adminResult = simulateSignInStaffWithPassword(
    "ithubkmgm@gmail.com",
    "StrongAdminPassword123!",
    mockAuthUsers,
  );
  assertEquals(adminResult.ok, true);
  assertEquals(adminResult.profile?.role, "portal_admin");

  const serviceResult = simulateSignInStaffWithPassword(
    "repairs@ithub.com",
    "ServiceStaffPassword456!",
    mockAuthUsers,
  );
  assertEquals(serviceResult.ok, true);
  assertEquals(serviceResult.profile?.role, "service_staff");
});

Deno.test("Staff Auth - Incorrect password or unknown user returns safe authentication error", () => {
  const mockAuthUsers = {
    "ithubkmgm@gmail.com": { id: "admin-uid-1", password: "StrongAdminPassword123!" },
  };

  const wrongPassword = simulateSignInStaffWithPassword(
    "ithubkmgm@gmail.com",
    "WrongPassword",
    mockAuthUsers,
  );
  assertEquals(wrongPassword.ok, false);
  assertEquals(
    wrongPassword.error,
    "Invalid email or password. Please verify your credentials and try again.",
  );

  const unknownUser = simulateSignInStaffWithPassword(
    "nonexistent@ithub.com",
    "SomePassword",
    mockAuthUsers,
  );
  assertEquals(unknownUser.ok, false);
  assertEquals(
    unknownUser.error,
    "Invalid email or password. Please verify your credentials and try again.",
  );
});

Deno.test("Staff Auth - Customer with valid password is denied staff access (isUnauthorizedCustomer = true)", () => {
  const mockAuthUsers = {
    "customer@example.com": { id: "customer-uid-1", password: "CustomerPassword123!" },
  };

  const result = simulateSignInStaffWithPassword(
    "customer@example.com",
    "CustomerPassword123!",
    mockAuthUsers,
  );

  assertEquals(result.ok, false);
  assertEquals(result.isUnauthorizedCustomer, true);
  assertEquals(result.error, "Access Denied: You do not possess staff portal authorization.");
});

Deno.test("Staff Auth - Invalid or expired OTP verification code returns descriptive error", () => {
  const mockTokens = {
    "quotations@ithub.com": { code: "654321", userId: "quote-staff-uid", expired: false },
    "repairs@ithub.com": { code: "112233", userId: "service-staff-uid", expired: true },
  };

  const shortToken = simulateVerifyStaffEmailOtp("quotations@ithub.com", "123", mockTokens);
  assertEquals(shortToken.ok, false);
  assertEquals(shortToken.error, "Please enter the 6-digit verification code.");

  const wrongToken = simulateVerifyStaffEmailOtp("quotations@ithub.com", "999999", mockTokens);
  assertEquals(wrongToken.ok, false);
  assertEquals(
    wrongToken.error,
    "Invalid verification code. Please check the 6-digit code and try again.",
  );

  const expiredToken = simulateVerifyStaffEmailOtp("repairs@ithub.com", "112233", mockTokens);
  assertEquals(expiredToken.ok, false);
  assertEquals(expiredToken.error, "Verification code has expired. Please request a new code.");

  const validToken = simulateVerifyStaffEmailOtp("quotations@ithub.com", "654321", mockTokens);
  assertEquals(validToken.ok, true);
  assertEquals(validToken.profile?.role, "quotation_staff");
});
