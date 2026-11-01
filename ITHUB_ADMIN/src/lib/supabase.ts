// ITHUB_ADMIN/src/lib/supabase.ts
// Supabase Client Initialization for Staff Portal
// Uses strictly publishable credentials — service-role keys are strictly forbidden.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = (
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  ""
).trim();

export const SUPABASE_ANON_KEY = (
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY)) ||
  ""
).trim();

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  url: string;
  hasAnonKey: boolean;
  error: string | null;
}

export function validateSupabaseConfig(): SupabaseConfigStatus {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      isConfigured: false,
      url: SUPABASE_URL || "",
      hasAnonKey: Boolean(SUPABASE_ANON_KEY),
      error: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment configuration.",
    };
  }

  if (
    SUPABASE_URL.includes("your-project") ||
    SUPABASE_ANON_KEY.includes("your-supabase-anon-key")
  ) {
    return {
      isConfigured: false,
      url: SUPABASE_URL,
      hasAnonKey: true,
      error: "Supabase environment variables contain unconfigured placeholder values.",
    };
  }

  try {
    const parsed = new URL(SUPABASE_URL);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        isConfigured: false,
        url: SUPABASE_URL,
        hasAnonKey: true,
        error: "VITE_SUPABASE_URL must be an HTTP or HTTPS URL.",
      };
    }
  } catch {
    return {
      isConfigured: false,
      url: SUPABASE_URL,
      hasAnonKey: true,
      error: "VITE_SUPABASE_URL is not a valid URL.",
    };
  }

  return {
    isConfigured: true,
    url: SUPABASE_URL,
    hasAnonKey: true,
    error: null,
  };
}

export const supabaseConfig = validateSupabaseConfig();

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseConfig.isConfigured) {
    throw new Error(
      `Supabase configuration error: ${supabaseConfig.error ?? "Invalid configuration"}`,
    );
  }

  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "ithub_staff_portal_session",
      },
    });
  }

  return clientInstance;
}

export const supabase: SupabaseClient | null = supabaseConfig.isConfigured
  ? getSupabaseClient()
  : null;

export default supabase;
