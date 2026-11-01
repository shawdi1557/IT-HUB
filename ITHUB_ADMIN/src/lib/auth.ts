// ITHUB_ADMIN/src/lib/auth.ts
// Staff Portal Authentication & Authorization Engine
// Uses Supabase Auth (Email OTP / Password) with server-side role verification

import type { User, Session } from "@supabase/supabase-js";
import { supabase, supabaseConfig } from "./supabase";

export type StaffRole = "portal_admin" | "quotation_staff" | "service_staff";

export interface StaffPermissions {
  can_manage_quotations: boolean;
  can_manage_services: boolean;
  can_manage_staff: boolean;
}

export interface StaffProfile {
  is_staff: boolean;
  user_id: string;
  role: StaffRole;
  full_name: string;
  email: string;
  permissions: StaffPermissions;
}

export interface StaffAuthResult {
  ok: boolean;
  user?: User | null;
  session?: Session | null;
  profile?: StaffProfile | null;
  error?: string;
  isUnauthorizedCustomer?: boolean;
}

/**
 * Validates whether the currently authenticated user possesses an active staff role.
 * Queries the security-definer RPC `get_staff_portal_profile`.
 */
export async function verifyStaffAuthorization(user: User): Promise<StaffProfile | null> {
  if (!supabase || !user) return null;

  try {
    const { data, error } = await supabase.rpc("get_staff_portal_profile");
    if (error || !data || !data.is_staff) {
      return null;
    }

    return {
      is_staff: true,
      user_id: data.user_id,
      role: data.role as StaffRole,
      full_name: data.full_name || "IT HUB Staff",
      email: data.email || user.email || "",
      permissions: {
        can_manage_quotations: Boolean(data.permissions?.can_manage_quotations),
        can_manage_services: Boolean(data.permissions?.can_manage_services),
        can_manage_staff: Boolean(data.permissions?.can_manage_staff),
      },
    };
  } catch (err) {
    console.error("Staff authorization check failed:", err);
    return null;
  }
}

/**
 * Initiates an Email OTP login request via Supabase Auth.
 * Enforces shouldCreateUser: false to ensure only pre-provisioned staff accounts can request OTPs.
 */
export async function requestStaffEmailOtp(
  email: string,
): Promise<{ ok: boolean; message?: string; error?: string; isAccountNotFound?: boolean }> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return { ok: false, error: "Authentication service unavailable." };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { ok: false, error: "Please enter a valid staff email address." };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: false, // Disallow automatic account creation for staff portal
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      // Supabase GoTrue returns "Signups not allowed for otp" or "signup_disabled"
      // when shouldCreateUser: false is specified for an email that does not exist in auth.users
      if (
        msg.includes("signups not allowed for otp") ||
        msg.includes("signup_disabled") ||
        msg.includes("user not found") ||
        msg.includes("user_not_found")
      ) {
        return {
          ok: false,
          isAccountNotFound: true,
          error:
            "No authorized staff account found for this email address. Please ensure your account has been provisioned by an administrator, or sign in using your password.",
        };
      }

      if (
        msg.includes("provider is not enabled") ||
        msg.includes("unsupported email provider") ||
        msg.includes("email provider is disabled")
      ) {
        return {
          ok: false,
          error:
            "Email OTP service is not enabled in Supabase settings. Please sign in with your staff password.",
        };
      }

      if (error.status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
        return {
          ok: false,
          error: "Too many sign-in attempts. Please wait 60 seconds and try again.",
        };
      }

      return { ok: false, error: error.message };
    }

    return { ok: true, message: `Verification code sent to ${cleanEmail}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to dispatch verification code." };
  }
}

/**
 * Verifies an Email OTP code and evaluates staff authorization.
 */
export async function verifyStaffEmailOtp(email: string, token: string): Promise<StaffAuthResult> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return { ok: false, error: "Authentication service unavailable." };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = token.trim();

  if (!cleanToken || cleanToken.length < 6) {
    return { ok: false, error: "Please enter the 6-digit verification code." };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: "email",
    });

    if (error || !data.user) {
      const msg = error?.message.toLowerCase() || "";
      if (msg.includes("token has expired") || msg.includes("otp expired")) {
        return { ok: false, error: "Verification code has expired. Please request a new code." };
      }
      if (
        msg.includes("invalid token") ||
        msg.includes("token is invalid") ||
        msg.includes("incorrect") ||
        msg.includes("not valid")
      ) {
        return {
          ok: false,
          error: "Invalid verification code. Please check the 6-digit code and try again.",
        };
      }
      return { ok: false, error: error?.message || "Invalid or expired verification code." };
    }

    // Server-side staff authorization verification
    const profile = await verifyStaffAuthorization(data.user);
    if (!profile) {
      await supabase.auth.signOut();
      return {
        ok: false,
        isUnauthorizedCustomer: true,
        error: "Access Denied: Account is not an authorized IT HUB staff member.",
      };
    }

    return {
      ok: true,
      user: data.user,
      session: data.session,
      profile,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "OTP verification failed." };
  }
}

/**
 * Authenticates staff with email & password and evaluates authorization.
 */
export async function signInStaffWithPassword(
  email: string,
  password: string,
): Promise<StaffAuthResult> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return { ok: false, error: "Authentication service unavailable." };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data.user) {
      const msg = error?.message.toLowerCase() || "";
      if (
        msg.includes("invalid login credentials") ||
        msg.includes("invalid credentials") ||
        msg.includes("invalid password") ||
        msg.includes("email not confirmed")
      ) {
        return {
          ok: false,
          error: "Invalid email or password. Please verify your credentials and try again.",
        };
      }
      if (msg.includes("rate limit") || error?.status === 429) {
        return {
          ok: false,
          error: "Too many sign-in attempts. Please wait a moment and try again.",
        };
      }
      return {
        ok: false,
        error: error?.message || "Invalid credentials. Please verify your email and password.",
      };
    }

    // Verify staff permissions
    const profile = await verifyStaffAuthorization(data.user);
    if (!profile) {
      await supabase.auth.signOut();
      return {
        ok: false,
        isUnauthorizedCustomer: true,
        error: "Access Denied: You do not possess staff portal authorization.",
      };
    }

    return {
      ok: true,
      user: data.user,
      session: data.session,
      profile,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Authentication failed." };
  }
}

/**
 * Restores an existing session on page load or refresh.
 */
export async function restoreStaffSession(): Promise<StaffAuthResult> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return { ok: false, error: "Not configured" };
  }

  try {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData?.session?.user) {
      return { ok: false };
    }

    const profile = await verifyStaffAuthorization(sessionData.session.user);
    if (!profile) {
      await supabase.auth.signOut();
      return {
        ok: false,
        isUnauthorizedCustomer: true,
        error: "Active session does not have staff permissions.",
      };
    }

    return {
      ok: true,
      user: sessionData.session.user,
      session: sessionData.session,
      profile,
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Signs out the staff user and clears session storage.
 */
export async function signOutStaff(): Promise<void> {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out encountered error:", e);
    }
  }
}
