// src/lib/supabase.ts
// Supabase Client Initialization & Configuration Validation
// IT HUB — Kerala, India

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Normalized Supabase project URL from Vite environment.
 */
export const SUPABASE_URL = (
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  ""
).trim()

/**
 * Normalized publishable/anon key from Vite environment.
 * Supports VITE_SUPABASE_ANON_KEY as primary, with fallback to VITE_SUPABASE_PUBLISHABLE_KEY.
 */
export const SUPABASE_ANON_KEY = (
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_SUPABASE_ANON_KEY ||
      import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY)) ||
  ""
).trim()

export interface SupabaseConfigStatus {
  isConfigured: boolean
  url: string
  hasAnonKey: boolean
  error: string | null
}

/**
 * Evaluates whether required Supabase credentials are validly supplied.
 * Checks for missing values and placeholder values.
 */
export function validateSupabaseConfig(): SupabaseConfigStatus {
  if (!SUPABASE_URL && !SUPABASE_ANON_KEY) {
    return {
      isConfigured: false,
      url: "",
      hasAnonKey: false,
      error: "Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing from environment configuration.",
    }
  }

  if (!SUPABASE_URL) {
    return {
      isConfigured: false,
      url: "",
      hasAnonKey: Boolean(SUPABASE_ANON_KEY),
      error: "VITE_SUPABASE_URL is missing. Please set it in your local .env file.",
    }
  }

  if (!SUPABASE_ANON_KEY) {
    return {
      isConfigured: false,
      url: SUPABASE_URL,
      hasAnonKey: false,
      error: "VITE_SUPABASE_ANON_KEY is missing. Please set it in your local .env file.",
    }
  }

  if (SUPABASE_URL.includes("your-project-id") || SUPABASE_ANON_KEY.includes("your-supabase-anon-key")) {
    return {
      isConfigured: false,
      url: SUPABASE_URL,
      hasAnonKey: true,
      error: "Supabase environment variables contain unconfigured placeholder values.",
    }
  }

  try {
    const parsed = new URL(SUPABASE_URL)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        isConfigured: false,
        url: SUPABASE_URL,
        hasAnonKey: true,
        error: "VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.",
      }
    }
  } catch {
    return {
      isConfigured: false,
      url: SUPABASE_URL,
      hasAnonKey: true,
      error: "VITE_SUPABASE_URL is not a valid URL format.",
    }
  }

  return {
    isConfigured: true,
    url: SUPABASE_URL,
    hasAnonKey: true,
    error: null,
  }
}

export const supabaseConfig = validateSupabaseConfig()

let clientInstance: SupabaseClient | null = null

/**
 * Returns the singleton Supabase client instance.
 * Throws a safe configuration error if credentials are not configured.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseConfig.isConfigured) {
    throw new Error(
      `Supabase configuration error: ${supabaseConfig.error ?? "Invalid environment configuration"}`
    )
  }

  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }

  return clientInstance
}

/**
 * Null-safe singleton client export. If credentials are fully configured,
 * provides the active Supabase client. Otherwise null.
 */
export const supabase: SupabaseClient | null = supabaseConfig.isConfigured
  ? getSupabaseClient()
  : null

export default supabase
