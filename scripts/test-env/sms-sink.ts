// Test-only stand-in for an SMS provider. No message ever leaves this machine.
//
// The disposable stack's Auth server calls this with its real signed hook, and the real
// send-sms-hook handler runs on it. Only the provider's network call is captured, so tests can
// read the OTP Supabase generated, the way a customer would read it from their phone.

import { handleSendSmsHook } from "../../supabase/functions/send-sms-hook/index.ts";

const PORT = Number(Deno.env.get("ITHUB_SMS_SINK_PORT"));
const hookSecret = Deno.env.get("ITHUB_SMS_HOOK_SECRET") ?? "";

type Mode =
  | "ok"
  | "provider_down"
  | "no_provider"
  | "missing_dlt"
  | "refused"
  | "rate_limited"
  | "hangs"
  | "fails_once"
  | "hangs_once";
let mode: Mode = "ok";

const sends: { phone: string; otp: string; templateId: string; authKey: string | null }[] = [];
const attempts = new Map<string, number>();

const SYNTHETIC_ENV: Record<string, string> = {
  SMS_PROVIDER: "msg91",
  MSG91_AUTH_KEY: "synthetic-auth-key",
  MSG91_TEMPLATE_ID: "synthetic-dlt-template",
};

const env = (name: string) => {
  if (mode === "no_provider") return undefined;
  if (mode === "missing_dlt" && name === "MSG91_TEMPLATE_ID") return undefined;
  return SYNTHETIC_ENV[name];
};

const provider: typeof fetch = async (input, init) => {
  if (!String(input).startsWith("https://control.msg91.com/")) {
    throw new Error("The sink only stands in for the configured provider.");
  }
  const body = JSON.parse(String(init?.body));
  const phone = body.recipients[0].mobiles;
  const attempt = (attempts.get(phone) ?? 0) + 1;
  attempts.set(phone, attempt);

  if (mode === "hangs" || (mode === "hangs_once" && attempt === 1)) {
    // Only a timeout set by the hook itself can end this.
    return await new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  }
  if (mode === "provider_down" || (mode === "fails_once" && attempt === 1)) {
    return new Response(JSON.stringify({ type: "error" }), { status: 500 });
  }
  if (mode === "rate_limited") {
    return new Response(JSON.stringify({ type: "error", message: "Too many requests" }), {
      status: 429,
    });
  }
  if (mode === "refused") {
    return new Response(JSON.stringify({ type: "error", message: "Template ID is invalid" }), {
      status: 200,
    });
  }
  sends.push({
    phone,
    otp: body.recipients[0].OTP,
    templateId: body.template_id,
    authKey: new Headers(init?.headers).get("authkey"),
  });
  return new Response(JSON.stringify({ message: "synthetic-request-id", type: "success" }), {
    status: 200,
  });
};

Deno.serve({ hostname: "127.0.0.1", port: PORT, onListen: () => {} }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/send-sms") {
    return await handleSendSmsHook(req, { hookSecret, env, fetchImpl: provider });
  }

  if (url.pathname === "/__health") return new Response("ok");
  if (url.pathname === "/__sends") {
    const phone = url.searchParams.get("phone");
    return Response.json(sends.filter((send) => send.phone === phone));
  }
  if (url.pathname === "/__attempts") {
    return Response.json(attempts.get(url.searchParams.get("phone") ?? "") ?? 0);
  }
  if (url.pathname === "/__mode" && req.method === "POST") {
    mode = (await req.json()).mode;
    return Response.json({ mode });
  }
  return new Response("Not found", { status: 404 });
});
