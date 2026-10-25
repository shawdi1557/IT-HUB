// supabase/functions/_shared/shopify-webhook.ts
// Production-Grade Shopify Webhook Signature Verification (HMAC-SHA256)
// IT HUB — Kerala, India

/**
 * Constant-time comparison between two strings or byte arrays to prevent timing attacks.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Verifies that the incoming Shopify webhook request was signed by Shopify.
 *
 * @param rawBody - The raw text or Uint8Array body received in the HTTP request.
 * @param hmacHeader - The value of the 'X-Shopify-Hmac-Sha256' HTTP header.
 * @param secret - The Shopify app secret or webhook signing secret.
 */
export async function verifyShopifyWebhook(
  rawBody: string | Uint8Array,
  hmacHeader: string | null | undefined,
  secret: string | null | undefined,
): Promise<{ isValid: boolean; error?: string }> {
  if (!secret || typeof secret !== "string" || secret.trim() === "") {
    return {
      isValid: false,
      error: "Missing or unconfigured Shopify webhook signing secret.",
    };
  }

  if (!hmacHeader || typeof hmacHeader !== "string" || hmacHeader.trim() === "") {
    return {
      isValid: false,
      error: "Missing X-Shopify-Hmac-Sha256 signature header.",
    };
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret.trim());
    const bodyBytes = typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody;

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, bodyBytes as BufferSource);
    const signatureBytes = new Uint8Array(signatureBuffer);

    // Convert to standard Base64
    let binary = "";
    for (let i = 0; i < signatureBytes.byteLength; i++) {
      binary += String.fromCharCode(signatureBytes[i]);
    }
    const computedHmacBase64 = btoa(binary);

    const matches = constantTimeCompare(computedHmacBase64, hmacHeader.trim());
    if (!matches) {
      return {
        isValid: false,
        error: "Shopify webhook signature mismatch (potential tampering or wrong secret).",
      };
    }

    return { isValid: true };
  } catch (err: any) {
    return {
      isValid: false,
      error: err?.message || "Failed to verify Shopify webhook signature.",
    };
  }
}
