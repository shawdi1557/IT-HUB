// supabase/functions/send-sms-hook/index.ts
// Supabase Auth "Send SMS" Hook for Indian SMS Gateways (Fast2SMS, MSG91, 2Factor, Twilio)
// IT HUB — Kerala, India

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface SendSmsHookPayload {
  user: {
    id: string;
    phone: string;
  };
  sms: {
    otp: string;
  };
}

/**
 * Normalizes Indian phone numbers from E.164 (+919847223886) to 10 digits (9847223886)
 */
function to10Digits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

Deno.serve(async (req: Request) => {
  // 1. Health check or non-POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ status: "ok", service: "IT HUB SMS Gateway Hook" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 2. Validate optional secret token (if configured in Supabase hook headers)
    const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
    if (hookSecret) {
      const authHeader = req.headers.get("x-hook-secret") || req.headers.get("authorization");
      if (authHeader !== hookSecret && authHeader !== `Bearer ${hookSecret}`) {
        return new Response(JSON.stringify({ error: "Unauthorized hook invocation" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 3. Parse Supabase Auth Hook payload
    const body: SendSmsHookPayload = await req.json();
    const { user, sms } = body;

    if (!user?.phone || !sms?.otp) {
      return new Response(JSON.stringify({ error: "Missing required phone or OTP in payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const phoneE164 = user.phone;
    const phone10 = to10Digits(phoneE164);
    const otp = sms.otp;
    const storeName = Deno.env.get("STORE_NAME") || "IT HUB";

    console.log(`[send-sms-hook] Dispatching OTP for phone ${phone10} (length: ${otp.length})`);

    // ────────────────────────────────────────────────────────────────────────────
    // 4. Provider Dispatch
    // ────────────────────────────────────────────────────────────────────────────

    // Provider A: Fast2SMS (Popular in India for Quick OTPs)
    const fast2smsApiKey = Deno.env.get("FAST2SMS_API_KEY");
    if (fast2smsApiKey) {
      const resp = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
          authorization: fast2smsApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "otp",
          variables_values: otp,
          numbers: phone10,
        }),
      });

      const resJson = await resp.json();
      if (!resp.ok || resJson.return === false) {
        console.error("[send-sms-hook] Fast2SMS dispatch failed:", resJson);
        return new Response(JSON.stringify({ error: "SMS dispatch failed via Fast2SMS" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, provider: "fast2sms" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Provider B: 2Factor (Specialized in Indian 2FA / OTP delivery)
    const twoFactorApiKey = Deno.env.get("TWO_FACTOR_API_KEY");
    if (twoFactorApiKey) {
      const templateName = Deno.env.get("TWO_FACTOR_TEMPLATE") || "IT_HUB_OTP";
      const url = `https://2factor.in/API/V1/${encodeURIComponent(twoFactorApiKey)}/SMS/${encodeURIComponent(phone10)}/${encodeURIComponent(otp)}/${encodeURIComponent(templateName)}`;
      const resp = await fetch(url);
      const resJson = await resp.json();

      if (!resp.ok || resJson.Status !== "Success") {
        console.error("[send-sms-hook] 2Factor dispatch failed:", resJson);
        return new Response(JSON.stringify({ error: "SMS dispatch failed via 2Factor" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, provider: "2factor" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Provider C: MSG91 (DLT-Approved Indian SMS Gateway)
    const msg91AuthKey = Deno.env.get("MSG91_AUTH_KEY");
    const msg91TemplateId = Deno.env.get("MSG91_TEMPLATE_ID");
    if (msg91AuthKey && msg91TemplateId) {
      const resp = await fetch(
        `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(msg91TemplateId)}&mobile=91${encodeURIComponent(phone10)}&authkey=${encodeURIComponent(msg91AuthKey)}&otp=${encodeURIComponent(otp)}`,
        { method: "POST" },
      );
      const resJson = await resp.json();

      if (!resp.ok || resJson.type === "error") {
        console.error("[send-sms-hook] MSG91 dispatch failed:", resJson);
        return new Response(JSON.stringify({ error: "SMS dispatch failed via MSG91" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, provider: "msg91" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Provider D: Generic / Mock Gateway (Log for test environments)
    console.log(
      `[send-sms-hook] [DEVELOPMENT MOCK] Sending OTP "${otp}" to +91 ${phone10} for ${storeName}`,
    );
    return new Response(
      JSON.stringify({
        success: true,
        provider: "mock_development",
        phone: phone10,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("[send-sms-hook] Unhandled exception:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
