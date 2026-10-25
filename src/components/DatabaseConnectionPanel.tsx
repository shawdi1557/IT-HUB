// src/components/DatabaseConnectionPanel.tsx
// IT HUB Admin — Database Connection Health Check Component
// Follows IT HUB design system, light theme, accessible, and zero secret leakage

import { useEffect, useState } from "react";
import {
  Database,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Activity,
  ShieldCheck,
  Server,
} from "lucide-react";
import { checkDatabaseConnection, type DatabaseHealthResult } from "../lib/health";
import { SUPABASE_URL, validateSupabaseConfig } from "../lib/supabase";
import { Badge, Button } from "./ui";

export default function DatabaseConnectionPanel() {
  const [result, setResult] = useState<DatabaseHealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const config = validateSupabaseConfig();

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const res = await checkDatabaseConnection();
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  // Perform a single initial check when the panel opens
  useEffect(() => {
    runHealthCheck();
  }, []);

  const getTone = (): "green" | "red" | "amber" | "gray" => {
    if (loading) return "gray";
    if (!result) return "gray";
    if (result.status === "connected") return "green";
    if (result.status === "configuration_error") return "amber";
    return "red";
  };

  const getStatusIcon = () => {
    if (loading) {
      return <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
    if (!result) {
      return <Database className="h-5 w-5 text-muted-foreground" />;
    }
    if (result.status === "connected") {
      return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    }
    if (result.status === "configuration_error") {
      return <AlertTriangle className="h-5 w-5 text-amber-600" />;
    }
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  const getStatusLabel = () => {
    if (loading) return "Checking connection...";
    if (!result) return "Not checked";
    if (result.status === "connected") return "Connected";
    if (result.status === "configuration_error") return "Configuration Error";
    return "Disconnected";
  };

  return (
    <div className="space-y-6">
      {/* Primary Status Card */}
      <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60">
              {getStatusIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Supabase Database</h3>
                <Badge tone={getTone()}>{getStatusLabel()}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                PostgreSQL via PostgREST / Supabase API
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={runHealthCheck}
            disabled={loading}
            className="self-start sm:self-auto"
            aria-label="Check database connection"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Checking..." : "Check Connection"}
          </Button>
        </div>

        {/* Metrics Bar */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/80 bg-slate-50/50 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Server className="h-3.5 w-3.5 text-primary" />
              <span>Configured Endpoint</span>
            </div>
            <div
              className="mt-1 truncate font-mono text-xs font-semibold text-foreground"
              title={config.url || "Not configured"}
            >
              {config.url ? new URL(config.url).host : "Not configured"}
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-slate-50/50 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span>Round-Trip Latency</span>
            </div>
            <div className="mt-1 font-mono text-xs font-semibold text-foreground">
              {loading
                ? "Measuring..."
                : result?.latencyMs !== null && result?.latencyMs !== undefined
                  ? `${result.latencyMs} ms`
                  : "N/A"}
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-slate-50/50 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>Last Checked</span>
            </div>
            <div className="mt-1 font-mono text-xs font-semibold text-foreground">
              {result?.checkedAt
                ? new Date(result.checkedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Never"}
            </div>
          </div>
        </div>

        {/* Diagnostic Message */}
        {result?.message && (
          <div
            className={`mt-4 rounded-lg border p-4 text-xs ${
              result.status === "connected"
                ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                : result.status === "configuration_error"
                  ? "border-amber-200 bg-amber-50/70 text-amber-900"
                  : "border-red-200 bg-red-50/70 text-red-900"
            }`}
          >
            <div className="flex items-start gap-2">
              {result.status === "connected" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : result.status === "configuration_error" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              )}
              <div className="space-y-1">
                <span className="font-semibold">
                  {result.status === "connected"
                    ? "Connection verified:"
                    : result.status === "configuration_error"
                      ? "Configuration warning:"
                      : "Connection failed:"}
                </span>{" "}
                {result.message}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Security & Architecture Context */}
      <div className="rounded-xl border border-border bg-slate-50/40 p-5 text-xs leading-relaxed text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>Security & Diagnostic Scope</span>
        </div>
        <p className="mt-2">
          This health check executes a minimal, 1-row read query (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            store_settings.id
          </code>
          ) through the Supabase client using your public publishable/anon key.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Never accesses private customer profiles, orders, or payment transactions.</li>
          <li>Never exposes database passwords, service-role keys, or webhook secrets.</li>
          <li>
            A successful check confirms that the configured Supabase endpoint is responding to
            queries under Row Level Security. It does not independently verify private policies,
            Edge Functions, or payment gateways.
          </li>
        </ul>
      </div>
    </div>
  );
}
