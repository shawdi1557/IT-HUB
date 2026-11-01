// ITHUB_ADMIN/src/lib/health.ts
// Database Connection Health Check for Staff Portal

import { supabase, validateSupabaseConfig, SUPABASE_URL } from "./supabase";

export interface DatabaseHealthResult {
  connected: boolean;
  status: "connected" | "disconnected" | "configuration_error";
  message: string;
  latencyMs: number | null;
  checkedAt: string;
  url: string;
}

export async function checkStaffDatabaseHealth(timeoutMs = 15000): Promise<DatabaseHealthResult> {
  const checkedAt = new Date().toISOString();
  const config = validateSupabaseConfig();

  if (!config.isConfigured || !supabase) {
    return {
      connected: false,
      status: "configuration_error",
      message: config.error || "Supabase configuration is invalid or missing.",
      latencyMs: null,
      checkedAt,
      url: SUPABASE_URL || "Not configured",
    };
  }

  const startTime = performance.now();

  try {
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs),
    );

    // Read single ID from store_settings (publicly accessible)
    const queryPromise = supabase.from("store_settings").select("id").limit(1).maybeSingle();

    const response = await Promise.race([queryPromise, timeoutPromise]);
    const latencyMs = Math.round(performance.now() - startTime);

    if ("error" in response && response.error) {
      // If table doesn't exist yet, we still know the network connection succeeded if error has a postgres code
      const errorMsg = response.error.message || "Database query failed";
      return {
        connected: false,
        status: "disconnected",
        message: errorMsg,
        latencyMs,
        checkedAt,
        url: SUPABASE_URL,
      };
    }

    return {
      connected: true,
      status: "connected",
      message: "Successfully connected to Supabase PostgreSQL cluster.",
      latencyMs,
      checkedAt,
      url: SUPABASE_URL,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      connected: false,
      status: "disconnected",
      message: err?.message || "Failed to establish connection to Supabase database.",
      latencyMs,
      checkedAt,
      url: SUPABASE_URL,
    };
  }
}
