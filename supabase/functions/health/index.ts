// supabase/functions/health/index.ts
// Production-Grade Minimal Health Check Edge Function
// IT HUB — Kerala, India

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

export interface HealthCheckDeps {
  supabaseUrl?: string
  supabaseAnonKey?: string
  supabaseAdminClient?: any
}

export async function handleHealthCheck(
  req: Request,
  deps?: HealthCheckDeps,
): Promise<Response> {
  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  // 2. Only allow GET / HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use GET." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  const supabaseUrl = deps?.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? ""
  const supabaseAnonKey =
    deps?.supabaseAnonKey ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({
        status: "configuration_error",
        healthy: false,
        timestamp: Date.now(),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    )
  }

  try {
    const supabase =
      deps?.supabaseAdminClient ??
      createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      })

    const startTime = performance.now()
    const { error } = await supabase
      .from("store_settings")
      .select("id")
      .limit(1)

    const latencyMs = Math.round(performance.now() - startTime)

    if (
      error &&
      error.code !== "PGRST204" &&
      error.code !== "PGRST205" &&
      error.code !== "42P01"
    ) {
      return new Response(
        JSON.stringify({
          status: "disconnected",
          healthy: false,
          latencyMs,
          timestamp: Date.now(),
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      )
    }

    return new Response(
      JSON.stringify({
        status: "connected",
        healthy: true,
        latencyMs,
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, max-age=0",
        },
      },
    )
  } catch {
    return new Response(
      JSON.stringify({
        status: "disconnected",
        healthy: false,
        timestamp: Date.now(),
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    )
  }
}

if (import.meta.main) {
  serve((req: Request) => handleHealthCheck(req))
}
