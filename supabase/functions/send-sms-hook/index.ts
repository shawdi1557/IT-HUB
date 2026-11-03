// supabase/functions/send-sms-hook/index.ts
// Supabase Auth "Send SMS" hook. Supabase generates and verifies the OTP. This only delivers it,
// through one provider chosen explicitly, using a DLT-registered template, to Indian numbers only.
// It fails closed: an unsigned request is refused, and with no complete provider configuration no
// code is sent, so nobody can sign in. OTP values are never written to logs.

interface SendSmsHookPayload {
  user: {
    id: string;
    phone: string;
  };
  sms: {
    otp: string;
  };
}

export interface SendSmsHookDeps {
  hookSecret?: string;
  env?: (name: string) => string | undefined;
  fetchImpl?: typeof fetch;
  nowSeconds?: number;
  attemptTimeoutMs?: number;
  retryDelayMs?: number;
}

const TIMESTAMP_TOLERANCE_SECONDS = 300;

// Supabase Auth gives the whole hook 5 seconds, including any retries of its own. That leaves room
// for one retry here, and this hook never asks Auth to retry. A retry after a timeout can deliver
// the same code twice, which costs an SMS but is otherwise harmless, so it's better than no code.
const ATTEMPT_TIMEOUT_MS = 1800;
const RETRY_DELAY_MS = 200;
const MAX_ATTEMPTS = 2;

function failure(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function success(provider: string): Response {
  return new Response(JSON.stringify({ success: true, provider }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** The 10-digit number for a valid Indian mobile in any common form, otherwise null. */
export function indianMobileDigits(phone: string): string | null {
  const match = phone.replace(/\D/g, "").match(/^(?:91)?([6-9]\d{9})$/);
  return match ? match[1] : null;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Verifies a Standard Webhooks signature, the scheme Supabase Auth uses for HTTP hooks.
 * The secret has the form "v1,whsec_<base64>"; the signed content is "id.timestamp.body".
 */
export async function verifyHookSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const keyBytes = decodeBase64(secret.replace(/^v1,/, "").replace(/^whsec_/, ""));
  if (!keyBytes || keyBytes.byteLength === 0) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
    ),
  );

  for (const candidate of signatures.split(" ")) {
    const [version, value] = candidate.split(",");
    if (version !== "v1" || !value) continue;
    const provided = decodeBase64(value);
    if (provided && constantTimeEqual(expected, provided)) return true;
  }
  return false;
}

type Env = (name: string) => string | undefined;
type SendResult = { configured: boolean; delivered: boolean; detail?: string };
type Delivery = { fetcher: typeof fetch; attemptTimeoutMs: number; retryDelayMs: number };
type ProviderReply = { status: number; body: any; failure?: string };

/** Provider messages can echo the request, so long digit runs are removed before logging. */
function safeDetail(message: unknown): string {
  return String(message ?? "no message")
    .replace(/\d{4,}/g, "#")
    .slice(0, 120);
}

/** Retries only what might succeed next time: no response, rate limiting and server errors. */
async function postToProvider(
  delivery: Delivery,
  url: string,
  init: RequestInit,
): Promise<ProviderReply> {
  let reply: ProviderReply = { status: 0, body: null, failure: "no response" };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await delivery.fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(delivery.attemptTimeoutMs),
      });
      const body = await response.json().catch(() => null);
      reply = { status: response.status, body };
      if (response.status !== 429 && response.status < 500) return reply;
      reply.failure = response.status === 429 ? "rate limited" : `HTTP ${response.status}`;
      // Waiting as long as the provider asks wouldn't fit in Auth's time limit.
      const askedToWaitMs = Number(response.headers.get("retry-after") ?? 0) * 1000;
      if (askedToWaitMs > delivery.retryDelayMs) return reply;
    } catch (err: any) {
      reply = {
        status: 0,
        body: null,
        failure: err?.name === "TimeoutError" ? "timed out" : "network error",
      };
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, delivery.retryDelayMs));
    }
  }
  return reply;
}

/**
 * MSG91 Flow API: POST /api/v5/flow, with the authkey in a header. Flow only delivers a message,
 * unlike MSG91's Send OTP API, which stores and checks its own code. Supabase owns the code here.
 * The template holds the DLT Template ID and its sender, and contains the variable ##OTP##.
 */
async function sendWithMsg91(
  env: Env,
  delivery: Delivery,
  phone10: string,
  otp: string,
): Promise<SendResult> {
  const authKey = env("MSG91_AUTH_KEY");
  const templateId = env("MSG91_TEMPLATE_ID");
  if (!authKey || !templateId) return { configured: false, delivered: false };

  const reply = await postToProvider(delivery, "https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: {
      authkey: authKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      template_id: templateId,
      short_url: "0",
      realTimeResponse: "1",
      recipients: [{ mobiles: `91${phone10}`, OTP: otp }],
    }),
  });
  const delivered = reply.status >= 200 && reply.status < 300 && reply.body?.type === "success";
  return {
    configured: true,
    delivered,
    detail: delivered ? undefined : (reply.failure ?? safeDetail(reply.body?.message)),
  };
}

/** Fast2SMS DLT route only. Its non-DLT routes aren't used. */
async function sendWithFast2Sms(
  env: Env,
  delivery: Delivery,
  phone10: string,
  otp: string,
): Promise<SendResult> {
  const apiKey = env("FAST2SMS_API_KEY");
  const senderId = env("FAST2SMS_SENDER_ID");
  const templateId = env("FAST2SMS_TEMPLATE_ID");
  if (!apiKey || !senderId || !templateId) return { configured: false, delivered: false };

  const reply = await postToProvider(delivery, "https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: { authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      route: "dlt",
      sender_id: senderId,
      message: templateId,
      variables_values: otp,
      numbers: phone10,
    }),
  });
  const delivered = reply.status >= 200 && reply.status < 300 && reply.body?.return === true;
  return {
    configured: true,
    delivered,
    detail: delivered ? undefined : (reply.failure ?? safeDetail(reply.body?.message)),
  };
}

const PROVIDERS: Record<
  string,
  (env: Env, delivery: Delivery, phone10: string, otp: string) => Promise<SendResult>
> = {
  msg91: sendWithMsg91,
  fast2sms: sendWithFast2Sms,
};

export async function handleSendSmsHook(req: Request, deps?: SendSmsHookDeps): Promise<Response> {
  const env: Env = deps?.env ?? ((name: string) => Deno.env.get(name));
  const fetcher = deps?.fetchImpl ?? fetch;

  if (req.method !== "POST") {
    return failure("Method not allowed. Expected POST.", 405);
  }

  // The hook secret is mandatory. Without it, anyone could use this endpoint to send SMS.
  const hookSecret = deps?.hookSecret ?? env("SEND_SMS_HOOK_SECRET");
  if (!hookSecret) {
    console.error("[send-sms-hook] SEND_SMS_HOOK_SECRET is not configured");
    return failure("SMS hook is not configured.", 500);
  }

  try {
    const rawBody = await req.text();
    const verified = await verifyHookSignature(rawBody, req.headers, hookSecret, deps?.nowSeconds);
    if (!verified) {
      return failure("Unauthorized hook invocation", 401);
    }

    const body: SendSmsHookPayload = JSON.parse(rawBody);
    const { user, sms } = body;
    if (!user?.phone || !sms?.otp) {
      return failure("Missing required phone or OTP in payload", 400);
    }

    const phone10 = indianMobileDigits(user.phone);
    if (!phone10) {
      return failure("Only Indian mobile numbers are supported.", 400);
    }

    const providerName = (env("SMS_PROVIDER") ?? "").trim().toLowerCase();
    const send = Object.hasOwn(PROVIDERS, providerName) ? PROVIDERS[providerName] : undefined;
    if (!send) {
      console.error("[send-sms-hook] SMS_PROVIDER is not set to a supported provider");
      return failure("No SMS provider is configured.", 503);
    }

    const result = await send(
      env,
      {
        fetcher,
        attemptTimeoutMs: deps?.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS,
        retryDelayMs: deps?.retryDelayMs ?? RETRY_DELAY_MS,
      },
      phone10,
      sms.otp,
    );
    if (!result.configured) {
      console.error(`[send-sms-hook] ${providerName} is missing its key or DLT configuration`);
      return failure("The SMS provider's DLT configuration is incomplete.", 503);
    }
    if (!result.delivered) {
      console.error(`[send-sms-hook] ${providerName} didn't send: ${result.detail}`);
      return failure("The SMS provider couldn't send the message.", 502);
    }
    return success(providerName);
  } catch (err: any) {
    console.error("[send-sms-hook] Unhandled exception:", err?.name);
    return failure("Internal server error", 500);
  }
}

if (import.meta.main) {
  Deno.serve((req: Request) => handleSendSmsHook(req));
}
