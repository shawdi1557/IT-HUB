// supabase/functions/tests/database-health.test.ts
// Automated Tests for Database Connection Health Check & Supabase Client Config
// IT HUB — Kerala, India

import {
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { handleHealthCheck } from "../health/index.ts"

// ────────────────────────────────────────────────────────────────────────────
// 1. ENVIRONMENT VALIDATION LOGIC TESTS
// ────────────────────────────────────────────────────────────────────────────

function validateConfigHelper(url?: string, key?: string) {
  const effectiveUrl = (url ?? "").trim()
  const effectiveKey = (key ?? "").trim()

  if (!effectiveUrl && !effectiveKey) {
    return {
      isConfigured: false,
      error:
        "Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing from environment configuration.",
    }
  }
  if (!effectiveUrl) {
    return {
      isConfigured: false,
      error:
        "VITE_SUPABASE_URL is missing. Please set it in your local .env file.",
    }
  }
  if (!effectiveKey) {
    return {
      isConfigured: false,
      error:
        "VITE_SUPABASE_ANON_KEY is missing. Please set it in your local .env file.",
    }
  }
  if (
    effectiveUrl.includes("your-project-id") ||
    effectiveKey.includes("your-supabase-anon-key")
  ) {
    return {
      isConfigured: false,
      error:
        "Supabase environment variables contain unconfigured placeholder values.",
    }
  }
  try {
    const parsed = new URL(effectiveUrl)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        isConfigured: false,
        error: "VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.",
      }
    }
  } catch {
    return {
      isConfigured: false,
      error: "VITE_SUPABASE_URL is not a valid URL format.",
    }
  }
  return { isConfigured: true, error: null }
}

Deno.test("H1. Configuration validation passes with valid URL and key", () => {
  const result = validateConfigHelper(
    "https://aeulrulvpxyqmxmypzey.supabase.co",
    "sb_publishable_y-r_ZxASFqW4Jf3yDLK9_g_bbJNwFZS",
  )
  assertEquals(result.isConfigured, true)
  assertEquals(result.error, null)
})

Deno.test("H2. Configuration validation fails when URL is missing", () => {
  const result = validateConfigHelper(
    "",
    "sb_publishable_y-r_ZxASFqW4Jf3yDLK9_g_bbJNwFZS",
  )
  assertEquals(result.isConfigured, false)
  assertMatch(result.error ?? "", /VITE_SUPABASE_URL is missing/)
})

Deno.test("H3. Configuration validation fails when key is missing", () => {
  const result = validateConfigHelper(
    "https://aeulrulvpxyqmxmypzey.supabase.co",
    "",
  )
  assertEquals(result.isConfigured, false)
  assertMatch(result.error ?? "", /VITE_SUPABASE_ANON_KEY is missing/)
})

Deno.test("H4. Configuration validation rejects placeholder credentials", () => {
  const result = validateConfigHelper(
    "https://your-project-id.supabase.co",
    "your-supabase-anon-key",
  )
  assertEquals(result.isConfigured, false)
  assertMatch(result.error ?? "", /placeholder values/)
})

Deno.test("H5. Configuration validation rejects invalid URL protocol", () => {
  const result = validateConfigHelper(
    "ftp://aeulrulvpxyqmxmypzey.supabase.co",
    "sb_publishable_valid_key",
  )
  assertEquals(result.isConfigured, false)
  assertMatch(result.error ?? "", /valid HTTP or HTTPS/)
})

// ────────────────────────────────────────────────────────────────────────────
// 2. QUERY HEALTH CHECK SIMULATION TESTS
// ────────────────────────────────────────────────────────────────────────────

async function simulateCheckConnection(
  mockFn: () => Promise<any>,
  configValid = true,
) {
  const checkedAt = new Date().toISOString()
  if (!configValid) {
    return {
      connected: false,
      status: "configuration_error",
      message: "Supabase environment configuration is invalid.",
      latencyMs: null,
      checkedAt,
    }
  }

  const start = performance.now()
  try {
    const response = await mockFn()
    const elapsed = Math.round(performance.now() - start)

    if (response.error) {
      const err = response.error
      const message = String(err.message || "").toLowerCase()
      const code = String(err.code || "")

      if (
        code === "401" ||
        code === "PGRST301" ||
        message.includes("api key")
      ) {
        return {
          connected: false,
          status: "configuration_error",
          message:
            "Authentication failed. The configured Supabase anon/publishable key is invalid.",
          latencyMs: elapsed,
          checkedAt,
        }
      }

      if (code === "42P01" || code === "PGRST204" || code === "PGRST205") {
        return {
          connected: true,
          status: "connected",
          message:
            "Connected to Supabase endpoint, but the initial database schema (schema.sql) has not been installed yet.",
          latencyMs: elapsed,
          checkedAt,
        }
      }

      return {
        connected: false,
        status: "disconnected",
        message: "Database responded with an error.",
        latencyMs: elapsed,
        checkedAt,
      }
    }

    return {
      connected: true,
      status: "connected",
      message: "Database connected and responding normally.",
      latencyMs: elapsed,
      checkedAt,
    }
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - start)
    const errMsg = String(err?.message || "").toLowerCase()
    if (errMsg.includes("timed out")) {
      return {
        connected: false,
        status: "disconnected",
        message: "Connection request timed out.",
        latencyMs: elapsed,
        checkedAt,
      }
    }
    return {
      connected: false,
      status: "disconnected",
      message: "Unable to establish database connection.",
      latencyMs: elapsed,
      checkedAt,
    }
  }
}

Deno.test("H6. Simulated health check returns connected on successful query", async () => {
  const res = await simulateCheckConnection(async () => {
    return { data: [{ id: 1 }], error: null }
  })
  assertEquals(res.connected, true)
  assertEquals(res.status, "connected")
  assertEquals(res.message, "Database connected and responding normally.")
  assertNotEquals(res.latencyMs, null)
})

Deno.test("H7. Simulated health check returns configuration_error when unconfigured", async () => {
  const res = await simulateCheckConnection(
    async () => ({ data: [], error: null }),
    false,
  )
  assertEquals(res.connected, false)
  assertEquals(res.status, "configuration_error")
  assertEquals(res.latencyMs, null)
})

Deno.test("H8. Simulated health check handles uninstalled schema safely as connected", async () => {
  const res = await simulateCheckConnection(async () => {
    return {
      data: null,
      error: {
        code: "42P01",
        message: 'relation "store_settings" does not exist',
      },
    }
  })
  assertEquals(res.connected, true)
  assertEquals(res.status, "connected")
  assertMatch(res.message, /schema\.sql.*not been installed/)
})

Deno.test("H9. Simulated health check handles 401 invalid key as configuration_error", async () => {
  const res = await simulateCheckConnection(async () => {
    return { data: null, error: { code: "401", message: "Invalid API key" } }
  })
  assertEquals(res.connected, false)
  assertEquals(res.status, "configuration_error")
  assertMatch(res.message, /Authentication failed/)
})

Deno.test("H10. Simulated health check handles timeout safely as disconnected", async () => {
  const res = await simulateCheckConnection(async () => {
    throw new Error("Connection timed out after 5000ms")
  })
  assertEquals(res.connected, false)
  assertEquals(res.status, "disconnected")
  assertMatch(res.message, /timed out/)
})

Deno.test("H11. Secret keys and tokens are never leaked in returned messages", async () => {
  const secretKey = "sb_secret_very_confidential_key"
  const res = await simulateCheckConnection(async () => {
    throw new Error(`Failed connection using secret ${secretKey}`)
  })
  assertEquals(res.connected, false)
  assertEquals(res.message.includes(secretKey), false)
})

// ────────────────────────────────────────────────────────────────────────────
// 3. SERVER-SIDE HEALTH EDGE FUNCTION TESTS
// ────────────────────────────────────────────────────────────────────────────

Deno.test("H12. Edge Function: Preflight OPTIONS returns 204 No Content", async () => {
  const req = new Request("http://localhost/health", { method: "OPTIONS" })
  const res = await handleHealthCheck(req)
  assertEquals(res.status, 204)
})

Deno.test("H13. Edge Function: Disallowed methods (POST) return 405 Method Not Allowed", async () => {
  const req = new Request("http://localhost/health", { method: "POST" })
  const res = await handleHealthCheck(req)
  assertEquals(res.status, 405)
})

Deno.test("H14. Edge Function: Missing credentials return 500 configuration_error", async () => {
  const req = new Request("http://localhost/health", { method: "GET" })
  const res = await handleHealthCheck(req, {
    supabaseUrl: "",
    supabaseAnonKey: "",
  })
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.status, "configuration_error")
  assertEquals(body.healthy, false)
})

Deno.test("H15. Edge Function: Successful database query returns 200 connected", async () => {
  const mockClient = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        limit: (_n: number) =>
          Promise.resolve({ data: [{ id: 1 }], error: null }),
      }),
    }),
  }
  const req = new Request("http://localhost/health", { method: "GET" })
  const res = await handleHealthCheck(req, {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "sample-key",
    supabaseAdminClient: mockClient,
  })
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.status, "connected")
  assertEquals(body.healthy, true)
  assertNotEquals(body.latencyMs, undefined)
})

Deno.test("H16. Edge Function: Database outage returns 503 disconnected", async () => {
  const mockClient = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        limit: (_n: number) =>
          Promise.resolve({
            data: null,
            error: { code: "57P01", message: "admin shutdown" },
          }),
      }),
    }),
  }
  const req = new Request("http://localhost/health", { method: "GET" })
  const res = await handleHealthCheck(req, {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "sample-key",
    supabaseAdminClient: mockClient,
  })
  assertEquals(res.status, 503)
  const body = await res.json()
  assertEquals(body.status, "disconnected")
  assertEquals(body.healthy, false)
})
