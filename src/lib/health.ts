// src/lib/health.ts
// Database Connection Health Check Service
// IT HUB — Kerala, India

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  validateSupabaseConfig,
} from "./supabase"

export type ConnectionStatus = "connected" | "disconnected" | "configuration_error"

export interface DatabaseHealthResult {
  connected: boolean
  status: ConnectionStatus
  message: string
  latencyMs: number | null
  checkedAt: string
}

export interface CheckConnectionOptions {
  timeoutMs?: number
  clientOverride?: SupabaseClient
}

/**
 * Checks connectivity to the Supabase database using a minimal, non-sensitive query.
 *
 * Target: `store_settings` table (public read permitted by RLS), selecting only `id` with limit(1).
 * Security:
 *  - Never uses `select('*')`
 *  - Never accesses customer tables, orders, payment records, or cost prices
 *  - Never exposes tokens, secrets, or raw internal database error traces to callers
 */
export async function checkDatabaseConnection(
  options: CheckConnectionOptions = {},
): Promise<DatabaseHealthResult> {
  const checkedAt = new Date().toISOString()
  const timeoutMs = options.timeoutMs ?? 60000

  // 1. Validate environment configuration first
  const config = validateSupabaseConfig()
  if (!config.isConfigured) {
    return {
      connected: false,
      status: "configuration_error",
      message: config.error ?? "Supabase environment configuration is invalid.",
      latencyMs: null,
      checkedAt,
    }
  }

  const client =
    options.clientOverride ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  const startTime =
    typeof performance !== "undefined" ? performance.now() : Date.now()

  try {
    // 2. Wrap query in a timeout promise
    const queryPromise = client.from("store_settings").select("id").limit(1)

    type HealthTimeoutError = {
      message: string
      name: string
    }

    const timeoutPromise = new Promise<{
      data: null
      error: HealthTimeoutError
    }>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer)
        reject(
          new Error(`Database health check timed out after ${timeoutMs}ms`),
        )
      }, timeoutMs)
    })

    const response = (await Promise.race([queryPromise, timeoutPromise])) as {
      data: any[] | null
      error: any
    }

    const elapsedMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startTime,
    )

    // 3. Handle PostgREST query errors
    if (response.error) {
      const err = response.error
      const message = String(err.message || "").toLowerCase()
      const code = String(err.code || "")

      // Authentication / Invalid key errors
      if (
        code === "PGRST301" ||
        code === "401" ||
        message.includes("jwt") ||
        message.includes("api key") ||
        message.includes("invalid key")
      ) {
        return {
          connected: false,
          status: "configuration_error",
          message:
            "Authentication failed. The configured Supabase anon/publishable key is invalid.",
          latencyMs: elapsedMs,
          checkedAt,
        }
      }

      // Schema not yet applied (Fresh database without tables)
      if (
        code === "42P01" || // relation does not exist
        code === "PGRST204" ||
        code === "PGRST205" ||
        message.includes('relation "store_settings" does not exist') ||
        message.includes("could not find the table")
      ) {
        return {
          connected: true,
          status: "connected",
          message:
            "Connected to Supabase endpoint, but the initial database schema (schema.sql) has not been installed yet.",
          latencyMs: elapsedMs,
          checkedAt,
        }
      }

      // Other database or RLS errors
      return {
        connected: false,
        status: "disconnected",
        message:
          "Database responded with an error. Please verify database availability.",
        latencyMs: elapsedMs,
        checkedAt,
      }
    }

    // 4. Successful connectivity
    return {
      connected: true,
      status: "connected",
      message: "Database connected and responding normally.",
      latencyMs: elapsedMs,
      checkedAt,
    }
  } catch (error: any) {
    const elapsedMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startTime,
    )

    const errMsg = String(error?.message || "").toLowerCase()

    if (errMsg.includes("timed out")) {
      return {
        connected: false,
        status: "disconnected",
        message: `Connection request timed out after ${timeoutMs}ms. Please verify network access or Supabase project status.`,
        latencyMs: elapsedMs,
        checkedAt,
      }
    }

    if (errMsg.includes("failed to fetch") || errMsg.includes("network")) {
      return {
        connected: false,
        status: "disconnected",
        message:
          "Network error: Unable to reach the Supabase endpoint. Check internet connection and project URL.",
        latencyMs: null,
        checkedAt,
      }
    }

    return {
      connected: false,
      status: "disconnected",
      message: "Unable to establish database connection.",
      latencyMs: elapsedMs,
      checkedAt,
    }
  }
}
