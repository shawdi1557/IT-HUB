// supabase/functions/_shared/cors.ts
// Stage 4S-4 (F12, E4): which browser origins may call an Edge Function. No wildcard.
//
//   APP_ENV=development   the local storefront dev server only: http://localhost:8443 and http://127.0.0.1:8443
//   anything else         only the exact origins listed in STOREFRONT_ORIGIN (comma-separated). Unset: none, so
//                         production fails closed until its domain is configured.
//
// A request with no Origin header doesn't come from a browser page, so CORS doesn't apply to it; it is still
// checked in full by the function (sign-in and everything after).

export const DEV_ORIGINS: readonly string[] = ["http://localhost:8443", "http://127.0.0.1:8443"];

export interface CorsSettings {
  /** APP_ENV. Anything but "development" is treated as production. */
  appEnv?: string;
  /** STOREFRONT_ORIGIN: exact origins, comma-separated. */
  allowedOrigins?: string;
  /** The local origins allowed in development. Default: the storefront's (DEV_ORIGINS). */
  devOrigins?: readonly string[];
}

/** Stage 4B: the Staff Portal's local dev server, for functions only the portal calls. */
export const PORTAL_DEV_ORIGINS: readonly string[] = [
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

export interface CorsDecision {
  /** False only for a browser origin outside the list. */
  allowed: boolean;
  headers: Record<string, string>;
}

export function corsFor(req: Request, settings: CorsSettings = {}): CorsDecision {
  const origin = req.headers.get("origin");
  const development = (settings.appEnv ?? "").trim().toLowerCase() === "development";
  const listed = (settings.allowedOrigins ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowed =
    origin === null ||
    (development && (settings.devOrigins ?? DEV_ORIGINS).includes(origin)) ||
    listed.includes(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed && origin) headers["Access-Control-Allow-Origin"] = origin;
  return { allowed, headers };
}
