// src/lib/auth.ts
// Supabase Phone OTP Authentication & Profile Reconciliation Service
// IT HUB — Kerala, India

import { type Session, type User } from "@supabase/supabase-js";
import { supabase, supabaseConfig } from "./supabase";

export interface SendOtpResult {
  ok: boolean;
  formattedPhone: string;
  isSimulated?: boolean;
  demoCode?: string;
  message?: string;
  error?: string;
}

export interface VerifyOtpResult {
  ok: boolean;
  user?: User | null;
  session?: Session | null;
  profile?: CustomerProfile | null;
  error?: string;
}

export interface CustomerProfile {
  id: string;
  role: "customer" | "admin";
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Normalizes an Indian phone number to E.164 standard (+91XXXXXXXXXX).
 * Strips spaces, dashes, parentheses, and leading zeros.
 */
export function formatIndianPhoneToE164(input: string): string {
  const digitsOnly = input.replace(/\D/g, "");
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return `+${digitsOnly}`;
  }
  if (input.startsWith("+") && digitsOnly.length >= 10) {
    return `+${digitsOnly}`;
  }
  return `+91${digitsOnly.slice(-10)}`;
}

/**
 * Validates whether an input represents a valid 10-digit Indian mobile number.
 */
export function isValidIndianMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return /^[6-9]\d{9}$/.test(digits);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return /^[6-9]\d{9}$/.test(digits.slice(2));
  }
  return false;
}

/**
 * Sends a Phone OTP using Supabase Auth (or graceful development fallback).
 */
export async function sendPhoneOtp(
  rawPhone: string,
  _channel: "SMS" | "WhatsApp" = "SMS",
): Promise<SendOtpResult> {
  const formattedPhone = formatIndianPhoneToE164(rawPhone);

  // If Supabase client is not available, provide local simulated demo OTP
  if (!supabase || !supabaseConfig.isConfigured) {
    const demoCode = String(Math.floor(100000 + Math.random() * 900000));
    return {
      ok: true,
      formattedPhone,
      isSimulated: true,
      demoCode,
      message: `Demo OTP: ${demoCode}`,
    };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: {
        channel: "sms",
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      // If Phone provider is not yet enabled in Supabase dashboard
      if (
        msg.includes("provider is not enabled") ||
        msg.includes("unsupported phone provider") ||
        msg.includes("sms_provider_not_configured") ||
        (error.status === 400 && msg.includes("phone"))
      ) {
        const demoCode = String(Math.floor(100000 + Math.random() * 900000));
        return {
          ok: true,
          formattedPhone,
          isSimulated: true,
          demoCode,
          message:
            "Phone provider not yet enabled in Supabase Dashboard. Using development demo code.",
        };
      }

      // Rate limit or quota error
      if (msg.includes("rate limit") || msg.includes("too many requests") || error.status === 429) {
        return {
          ok: false,
          formattedPhone,
          error: "Too many OTP attempts. Please wait 60 seconds before trying again.",
        };
      }

      return {
        ok: false,
        formattedPhone,
        error: error.message || "Failed to send OTP. Please check your phone number.",
      };
    }

    return {
      ok: true,
      formattedPhone,
      isSimulated: false,
      message: `OTP sent to ${formattedPhone}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      formattedPhone,
      error: err?.message || "Unexpected error connecting to authentication service.",
    };
  }
}

/**
 * Verifies a Phone OTP and establishes a Supabase user session.
 */
export async function verifyPhoneOtp(
  rawPhone: string,
  token: string,
  fallbackDemoCode?: string,
): Promise<VerifyOtpResult> {
  const formattedPhone = formatIndianPhoneToE164(rawPhone);

  // Check fallback simulated code if Supabase isn't active or provider not enabled
  if (fallbackDemoCode && token === fallbackDemoCode) {
    return {
      ok: true,
      user: null,
      session: null,
      profile: {
        id: "demo-user",
        role: "customer",
        full_name: null,
        email: null,
        phone: formattedPhone,
        address: null,
      },
    };
  }

  if (!supabase || !supabaseConfig.isConfigured) {
    return {
      ok: false,
      error: "Authentication service is not configured.",
    };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: token.trim(),
      type: "sms",
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("token has expired") || msg.includes("expired")) {
        return {
          ok: false,
          error: "The OTP code has expired. Please request a new one.",
        };
      }
      if (msg.includes("invalid") || msg.includes("token is invalid")) {
        return {
          ok: false,
          error: "Incorrect verification code. Please check and try again.",
        };
      }
      return { ok: false, error: error.message };
    }

    if (!data.user) {
      return {
        ok: false,
        error: "Authentication failed. No user record returned.",
      };
    }

    // Reconcile and load profile
    const profile = await fetchOrCreateProfile(data.user);

    return {
      ok: true,
      user: data.user,
      session: data.session,
      profile,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Verification request failed.",
    };
  }
}

/**
 * Reconciles the customer profile in public.profiles.
 */
export async function fetchOrCreateProfile(user: User): Promise<CustomerProfile | null> {
  if (!supabase) return null;

  try {
    // 1. First attempt to select existing profile with address
    const { data: existing, error: selectErr } = await supabase
      .from("profiles")
      .select("id, role, full_name, email, phone, address")
      .eq("id", user.id)
      .maybeSingle();

    if (existing && !selectErr) {
      return existing as CustomerProfile;
    }

    // 1b. Fallback query without address if column has not yet been migrated in PostgreSQL
    if (selectErr && (selectErr.code === "42703" || selectErr.message?.includes("address"))) {
      const { data: fallback, error: fallbackErr } = await supabase
        .from("profiles")
        .select("id, role, full_name, email, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (fallback && !fallbackErr) {
        return fallback as CustomerProfile;
      }
    }

    // 2. Self-healing reconciliation RPC (ensure_profile)
    const { data: rpcData, error: rpcErr } = await supabase.rpc("ensure_profile");
    if (rpcData?.profile && !rpcErr) {
      return rpcData.profile as CustomerProfile;
    }

    // 3. Fallback direct upsert if permitted
    const { data: upsertData, error: upsertErr } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        phone: user.phone || null,
        email: user.email || null,
        role: "customer",
        updated_at: new Date().toISOString(),
      })
      .select("id, role, full_name, email, phone")
      .maybeSingle();

    if (upsertData && !upsertErr) {
      return upsertData as CustomerProfile;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Updates customer profile information in PostgreSQL.
 */
export interface UpdateProfileResult {
  ok: boolean;
  profile?: CustomerProfile | null;
  error?: string;
}

export async function updateCustomerProfile(updates: {
  fullName?: string;
  email?: string;
  address?: string;
  phone?: string;
}): Promise<UpdateProfileResult> {
  if (!supabase) {
    return { ok: false, error: "Supabase client not available" };
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: "You must be signed in to update your profile",
      };
    }

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.fullName !== undefined) payload.full_name = updates.fullName.trim() || null;
    if (updates.email !== undefined) payload.email = updates.email.trim() || null;
    if (updates.address !== undefined) payload.address = updates.address.trim() || null;
    if (updates.phone !== undefined) payload.phone = formatIndianPhoneToE164(updates.phone);

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", user.id)
      .select("id, role, full_name, email, phone, address")
      .single();

    if (error) {
      // If address column does not exist yet on remote database (error 42703), retry without address
      if (error.code === "42703" && payload.address !== undefined) {
        delete payload.address;
        const { data: retryData, error: retryErr } = await supabase
          .from("profiles")
          .update(payload)
          .eq("id", user.id)
          .select("id, role, full_name, email, phone")
          .single();

        if (!retryErr && retryData) {
          return {
            ok: true,
            profile: retryData as CustomerProfile,
            error:
              "Profile saved, but the address column requires running the migration in Supabase SQL editor.",
          };
        }
      }
      return { ok: false, error: error.message };
    }

    return { ok: true, profile: data as CustomerProfile };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Profile update failed" };
  }
}

/**
 * Signs the user out of Supabase Auth.
 */
export interface SignOutResult {
  ok: boolean;
  error?: string;
}

export async function signOutUser(): Promise<SignOutResult> {
  if (!supabase) return { ok: true };

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn("[Auth] Sign out error:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Sign out failed" };
  }
}

/**
 * Subscribes to Supabase Auth state changes.
 */
export function subscribeToAuthChanges(
  callback: (user: User | null, session: Session | null) => void,
): () => void {
  if (!supabase) {
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null, session);
  });

  return () => {
    subscription.unsubscribe();
  };
}

// ── Admin Authentication & Session Verification ─────────────────────────────

export interface AdminAuthResult {
  ok: boolean;
  user?: User | null;
  session?: Session | null;
  profile?: CustomerProfile | null;
  error?: string;
}

export type AdminAccessState = "loading" | "authorized" | "unauthenticated" | "denied";

export interface AdminSessionStatus {
  state: AdminAccessState;
  user: User | null;
  profile: CustomerProfile | null;
  error?: string;
}

/**
 * Authenticates an administrator with email and password via Supabase Auth.
 * Reconciles and verifies that the account's profile role is strictly 'admin'.
 * If an authenticated user lacks the 'admin' role, their session is immediately
 * terminated and access is safely denied.
 */
export async function signInAdminWithPassword(
  email: string,
  password: string,
): Promise<AdminAuthResult> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return {
      ok: false,
      error: "Supabase authentication client is not configured.",
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return {
      ok: false,
      error: "Please enter your administrator email address.",
    };
  }
  if (!password) {
    return {
      ok: false,
      error: "Please enter your administrator password.",
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      const msg = error.message.toLowerCase();
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
      if (msg.includes("rate limit") || error.status === 429) {
        return {
          ok: false,
          error: "Too many sign-in attempts. Please wait a moment and try again.",
        };
      }
      return {
        ok: false,
        error: "Sign-in failed. Please verify your credentials and try again.",
      };
    }

    if (!data.user) {
      return {
        ok: false,
        error: "Authentication failed. No user record returned.",
      };
    }

    // Verify application profile role
    const profile = await fetchOrCreateProfile(data.user);

    if (!profile || profile.role !== "admin") {
      // Immediate session termination for non-admins attempting admin access
      await supabase.auth.signOut();
      return {
        ok: false,
        error: "Access Denied: Administrator privileges are required for this account.",
      };
    }

    return {
      ok: true,
      user: data.user,
      session: data.session,
      profile,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "An unexpected error occurred during authentication.",
    };
  }
}

/**
 * Checks the current Supabase Auth session and verifies the 'admin' profile role.
 * Used on page load and session restoration to prevent brief unauthenticated flashes.
 */
export async function checkAdminSession(): Promise<AdminSessionStatus> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return {
      state: "unauthenticated",
      user: null,
      profile: null,
      error: "Supabase authentication client is not configured.",
    };
  }

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      return {
        state: "unauthenticated",
        user: null,
        profile: null,
      };
    }

    const profile = await fetchOrCreateProfile(session.user);

    if (profile?.role === "admin") {
      return {
        state: "authorized",
        user: session.user,
        profile,
      };
    }

    // Authenticated user exists, but lacks admin privileges
    return {
      state: "denied",
      user: session.user,
      profile,
      error: `Access Denied: Account ${session.user.email || session.user.phone || ""} is not an authorized administrator.`,
    };
  } catch (err: any) {
    return {
      state: "unauthenticated",
      user: null,
      profile: null,
      error: err?.message || "Failed to verify session authorization.",
    };
  }
}
