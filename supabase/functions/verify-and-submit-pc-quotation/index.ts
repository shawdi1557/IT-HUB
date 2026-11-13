// supabase/functions/verify-and-submit-pc-quotation/index.ts
// The verified PC quotation endpoint. Only a signed-in customer with a confirmed phone may submit (Stage 4S-4). The
// server resolves every part from Shopify (4S-1, 4S-2), judges the build itself (4S-3), and stores the quotation
// through one database function that refuses repeats atomically (4S-4). Nothing the browser says about prices,
// specifications or compatibility decides anything.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  checkQuotationStructure,
  MAX_BODY_BYTES,
  MESSAGE_TOO_LARGE,
  MESSAGE_UNREADABLE,
  quantityPriceable,
  quotationFingerprint,
} from "./structure.ts";
import { checkVariantNode, slotCheckLabel, VARIANT_QUERY } from "./resolve.ts";
import {
  loadRegistryLookup,
  resolvePartSpecs,
  unresolvedSpecRecord,
  type PartSpecResolution,
} from "./specs.ts";
import { assessmentRefusal, assessQuotation, disagreementLog } from "./assess.ts";
import { corsFor } from "../_shared/cors.ts";

/** For a staff account, or one without a phone confirmed at sign-in (Stage 4S-4, D8, E6). */
export const MESSAGE_CUSTOMER_ACCOUNT_REQUIRED =
  "This account can't request a PC quotation. Please sign in with your customer account.";

export interface QuotationVerificationDeps {
  supabaseClient?: any;
  shopifyFetch?: (query: string, variables?: any) => Promise<any>;
  /** Environment overrides for tests. A name given here, even as undefined, isn't read from the environment. */
  env?: Record<string, string | undefined>;
}

/** A salted SHA-256 (HMAC) of the client IP, in hex. The address itself is never stored (F9). */
export async function hashClientIp(ip: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function handleQuotationVerification(
  req: Request,
  deps?: QuotationVerificationDeps,
): Promise<Response> {
  const env = (name: string): string =>
    (deps?.env && name in deps.env ? deps.env[name] : Deno.env.get(name)) ?? "";
  // Stage 4S-4 (F12, E4): only the origins configured for this environment. No wildcard.
  const cors = corsFor(req, { appEnv: env("APP_ENV"), allowedOrigins: env("STOREFRONT_ORIGIN") });
  const corsHeaders = cors.headers;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: corsHeaders });
  }

  if (!cors.allowed) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "This website can't use the quotation service.",
        code: "origin_not_allowed",
      }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const reject = (
    status: number,
    payload: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify({ success: false, ...payload }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
    });

  try {
    // 1. Initialize Supabase Admin Client
    const supabaseUrl = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const supabase =
      deps?.supabaseClient ??
      (supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null);

    // 2. Authoritative User Identity Derivation & Mandatory Authentication
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authentication required to submit a PC quotation request. Please sign in.",
          requiresAuth: true,
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "WWW-Authenticate": 'Bearer realm="IT HUB PC Builder Quotation"',
          },
        },
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (
      !token ||
      token === serviceKey ||
      token === env("SUPABASE_ANON_KEY") ||
      token === env("VITE_SUPABASE_ANON_KEY")
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Valid customer session token required. Anonymous quotation submissions are not permitted.",
          requiresAuth: true,
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "WWW-Authenticate": 'Bearer error="invalid_token"',
          },
        },
      );
    }

    let userId: string | null = null;
    let verifiedPhone: string | null = null;
    if (!supabase) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authentication service unavailable.",
          requiresAuth: true,
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user?.id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid or expired session. Please sign in again to submit your quotation.",
            requiresAuth: true,
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "WWW-Authenticate": 'Bearer error="invalid_token"',
            },
          },
        );
      }
      userId = userData.user.id;
      verifiedPhone =
        typeof userData.user.phone === "string" && userData.user.phone ? userData.user.phone : null;
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authentication verification failed. Please sign in again.",
          requiresAuth: true,
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // 3. Stage 4S-4: only a customer account with a phone confirmed at sign-in may submit (D8, F14). The database
    // guard also refuses staff accounts, and rate limits each customer (5 a minute, always) and each client IP
    // (20 a minute) once a trusted client-IP header is configured: QUOTATION_TRUSTED_IP_HEADER, set only after it is
    // verified on a hosted rehearsal (B1). Never x-forwarded-for by default, and never a shared bucket (F9).
    if (!verifiedPhone) {
      return reject(403, {
        error: MESSAGE_CUSTOMER_ACCOUNT_REQUIRED,
        code: "customer_account_required",
      });
    }
    let ipKey: string | null = null;
    const trustedIpHeader = env("QUOTATION_TRUSTED_IP_HEADER").trim();
    if (trustedIpHeader) {
      const salt = env("QUOTATION_RATE_LIMIT_SALT");
      // A configured IP limit with no salt can't be applied safely: fail closed.
      if (!salt) return reject(503, { error: "Service temporarily unavailable." });
      const clientIp = req.headers.get(trustedIpHeader)?.trim();
      if (clientIp) ipKey = await hashClientIp(clientIp, salt);
    }
    const { data: gate, error: gateError } = await supabase.rpc("pc_quotation_guard", {
      p_user_id: userId,
      p_ip_key: ipKey,
    });
    // Fail closed: if the guard can't answer, nothing is accepted.
    if (gateError || !gate || typeof gate !== "object") {
      return reject(503, { error: "Service temporarily unavailable." });
    }
    if (gate.allowed !== true) {
      if (gate.code === "customer_account_required") {
        return reject(403, {
          error: MESSAGE_CUSTOMER_ACCOUNT_REQUIRED,
          code: "customer_account_required",
        });
      }
      if (gate.code === "rate_limited") {
        return reject(
          429,
          {
            error: "Too Many Requests. Maximum 5 quotation requests per minute allowed.",
            retryAfter: 60,
          },
          { "Retry-After": "60" },
        );
      }
      return reject(503, { error: "Service temporarily unavailable." });
    }

    // 4. Structural checks (Stage 4A-6), after sign-in and the guard, so a refused request still counts.
    // They check the request's shape only. Nothing here makes a build compatible: that needs Stage 4S.
    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return reject(413, { error: MESSAGE_TOO_LARGE, code: "request_too_large" });
    }
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
      return reject(413, { error: MESSAGE_TOO_LARGE, code: "request_too_large" });
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return reject(400, {
        error: MESSAGE_UNREADABLE,
        code: "invalid_request",
        problems: [{ code: "body_not_json" }],
      });
    }
    const checked = checkQuotationStructure(body);
    if (!checked.ok) {
      return reject(checked.status, {
        error: checked.error,
        code: checked.code,
        problems: checked.problems,
        ...(checked.missingSlots ? { missingSlots: checked.missingSlots } : {}),
      });
    }
    const { buildName, estimatedPrice, compatibility, customerInfo, purpose } = checked;

    // 5. Recalculate Authoritative Pricing from the variant IDs. A part the customer already owns
    // is recorded for the technician, but isn't sold, so it isn't priced.
    const allParts = checked.parts;
    const partsArray = allParts.filter((part) => !part.owned);
    // Every part to buy has a valid variant ID by now, and a build has at least four of them.
    const variantGids = partsArray.map((part) => part.variantId as string);

    let authoritativePrice = 0;
    let hasAuthoritativeLookup = false;

    // Fetch authoritative variant prices if Shopify is configured
    // Stage 4S-4 (F13): the server's own names first; the VITE_ names are a temporary fallback.
    const shopifyDomain = env("SHOPIFY_STORE_DOMAIN") || env("VITE_SHOPIFY_STORE_DOMAIN");
    const shopifyToken =
      env("SHOPIFY_STOREFRONT_TOKEN") || env("VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN");
    const shopifyApiVersion =
      env("SHOPIFY_API_VERSION") || env("VITE_SHOPIFY_API_VERSION") || "2025-10";
    // Priced as the browser prices it: unit price times quantity. Every quantity is a whole number from 1 by now;
    // one above the slot's most (4 memory modules, 2 drives, 1 of anything else) can't be priced, so the
    // quotation goes to a technician with no verified price.
    const quantitiesValid = partsArray.every(quantityPriceable);
    const quantities = partsArray.map((part) => (quantitiesValid ? (part.quantity ?? 1) : 1));
    const unavailableParts: string[] = [];

    // Stage 4S-1: what Shopify says each part is. Until it has answered reliably, every part's slot is unconfirmed.
    const wrongSlotParts: string[] = [];
    let slotsUnconfirmed = partsArray.length > 0;
    let backordered = false;
    // Stage 4S-2: what the server resolves each part's specifications to. Until Shopify has answered reliably, none
    // is resolved, and that alone sends the quotation to a technician.
    const resolved = new Map<string, PartSpecResolution>();
    for (const part of partsArray) {
      part.slotCheck = "unconfirmed";
      part.serverSpecs = unresolvedSpecRecord("shopify_unavailable", part.variantId);
    }

    if (partsArray.length > 0 && ((shopifyDomain && shopifyToken) || deps?.shopifyFetch)) {
      try {
        const fetcher =
          deps?.shopifyFetch ??
          (async (q: string, vars: any) => {
            const res = await fetch(
              `https://${shopifyDomain}/api/${shopifyApiVersion}/graphql.json`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Shopify-Storefront-Access-Token": shopifyToken,
                },
                body: JSON.stringify({ query: q, variables: vars }),
              },
            );
            return await res.json();
          });

        const shopifyData = await fetcher(VARIANT_QUERY, { ids: variantGids });
        const nodes = shopifyData?.data?.nodes;
        // Shopify answers one node per ID, in order, each naming the variant it describes. Any other answer can't be
        // matched to the parts: nothing in it is used, the price and stock stay unverified, and a technician reviews
        // the quotation (Stage 4A-2, Stage 4S decision 3).
        const checks =
          Array.isArray(nodes) && nodes.length === variantGids.length
            ? nodes.map((node: any, index: number) =>
                checkVariantNode(node, variantGids[index], partsArray[index].slot),
              )
            : null;
        if (Array.isArray(nodes) && !(checks && !checks.some((c) => c.kind === "mismatched"))) {
          // Shopify answered, but not for the variants asked about: nothing in it is used.
          for (const part of partsArray) {
            part.serverSpecs = unresolvedSpecRecord("answer_unreliable", part.variantId);
          }
        }
        if (checks && !checks.some((check) => check.kind === "mismatched")) {
          let foundNodes = 0;
          slotsUnconfirmed = false;
          // Stage 4B-5: the Hardware Specification Manager's records for these listings, read here by the server.
          // If they can't be read, no part is resolved without them and a technician reviews the quotation.
          const productIds = checks
            .map((check: any) => (check.kind === "resolved" ? check.productId : undefined))
            .filter((id: unknown): id is string => typeof id === "string" && id !== "");
          const registry = await loadRegistryLookup(supabase, productIds, variantGids);
          for (const [index, check] of checks.entries()) {
            const part = partsArray[index];
            // Stage 4A-6: a variant the store doesn't know, or one with no price, isn't a part IT HUB can quote.
            if (check.kind !== "resolved") {
              unavailableParts.push(part.slot);
              slotsUnconfirmed = true;
              continue;
            }
            authoritativePrice += check.price * quantities[index];
            foundNodes++;
            // What's stored is what Shopify says, whatever name, price and product the browser sent.
            part.price = check.price;
            if (check.title) {
              part.title = check.title;
              part.name = check.title;
            }
            if (check.productId) {
              if (part.productId && part.productId !== check.productId) {
                part.reportedProductId = part.productId;
              }
              part.productId = check.productId;
            }
            if (!check.availableForSale) unavailableParts.push(part.slot);
            if (check.backordered) backordered = true;
            // Stage 4S decision 2: Shopify's own fields placing the product elsewhere refuse the request; no
            // confident answer either way leaves it for a technician.
            if (check.slot.kind === "other_part" || check.slot.kind === "not_a_part") {
              wrongSlotParts.push(part.slot);
            } else if (check.slot.kind === "unknown") {
              slotsUnconfirmed = true;
            } else if (check.slot.source === "title") {
              // Stage 4S-1 closure: only Shopify's category, type or tags confirm a slot. A title match is
              // provisional ("Ryzen" also names coolers and boards), so a technician checks it; it's recorded as
              // `slotCheck: "title"` so staff can see why.
              slotsUnconfirmed = true;
            }
            part.slotCheck = slotCheckLabel(check.slot);
            // Stage 4S-2: the part's specifications, from this answer only. The browser's are compared, never used.
            if (!registry) {
              part.serverSpecs = unresolvedSpecRecord("registry_unavailable", part.variantId);
              continue;
            }
            const specs = resolvePartSpecs(
              nodes[index],
              part.slot,
              check.slot,
              part.specs,
              registry,
            );
            part.serverSpecs = specs.record;
            resolved.set(part.slot, specs);
          }
          if (foundNodes === variantGids.length && quantitiesValid) {
            hasAuthoritativeLookup = true;
          }
        }
      } catch {
        // The price stays unverified and the quotation goes to a technician for review.
      }
    }

    if (wrongSlotParts.length > 0) {
      return reject(400, {
        error: MESSAGE_UNREADABLE,
        code: "invalid_request",
        problems: wrongSlotParts.map((slot) => ({ code: "variant_wrong_slot", slot })),
      });
    }

    if (unavailableParts.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No longer available: ${unavailableParts.join(", ")}. Please replace it and try again.`,
          unavailableParts,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Stage 4S-3: the server's own verdict, from the unchanged engine and completeness rules run on the parts it
    // resolved. The browser's compatibility report is only recorded. A part left unresolved means no verdict, and
    // review. A build the server finds Incompatible or Incomplete is refused, as the builder would refuse it, and
    // nothing is stored.
    const verdict = assessQuotation(
      partsArray.map(
        (part) =>
          resolved.get(part.slot) ?? {
            slot: part.slot,
            record: part.serverSpecs!,
            component: null,
          },
      ),
      allParts.filter((part) => part.owned).map((part) => part.slot),
      compatibility,
      purpose,
    );
    // Decision S3-A: a browser that disagrees is noted for diagnosis, refused or not. It changes nothing.
    const disagreement = disagreementLog(verdict.record);
    if (disagreement) console.warn(JSON.stringify(disagreement));
    const refusal = assessmentRefusal(verdict);
    if (refusal) return reject(refusal.status, refusal.payload);

    // 6. Anti-Tampering & Price Divergence Audit. Client-supplied prices are never authoritative,
    // so an unverified quotation records no authoritative price at all.
    const clientPrice = Math.round(estimatedPrice);
    const specsNeedReview = partsArray.some((part) => part.serverSpecs?.reviewRequired === true);
    const priceDivergence = hasAuthoritativeLookup ? Math.abs(authoritativePrice - clientPrice) : 0;
    const technicianReviewRequired =
      priceDivergence > 100 ||
      !hasAuthoritativeLookup ||
      // Stage 4S-3: anything but Complete on the server's own assessment (Needs Review, or not assessed). The
      // browser's claimed status plays no part.
      verdict.record.state !== "complete" ||
      // Stage 4S-1: a part Shopify couldn't confirm belongs in its slot, or one sold while out of stock.
      slotsUnconfirmed ||
      backordered ||
      // Stage 4S-2: a part whose specifications the server couldn't resolve, or resolved with a rejected,
      // conflicting or unreadable value. (Unresolved parts are also caught above: no verified price.)
      specsNeedReview ||
      // Nothing here can check a customer's own part, and the browser is what marked it as owned.
      allParts.some((part) => part.owned);

    // 7. Stage 4S-4: stored through one database function. It serialises this customer's submissions and returns
    // the earlier reference for the same request within two minutes (D9), draws the reference from a strong
    // random source (F11), and records the submission in the quotation's history (D10).
    // The browser's report is kept only as its note; a "serverAssessment" it claims to carry is dropped.
    const { serverAssessment: _claimedVerdict, ...browserReport } = compatibility as Record<
      string,
      unknown
    >;
    const { data: stored, error: storeError } = await supabase.rpc("create_pc_quotation", {
      p_user_id: userId,
      p_fingerprint: quotationFingerprint(allParts),
      p_quotation: {
        name: buildName,
        // Keyed by slot, in the builder's shape, with Shopify's names and prices for the parts to buy.
        parts: Object.fromEntries(allParts.map((part) => [part.slot, part])),
        estimated_price: hasAuthoritativeLookup ? authoritativePrice : clientPrice,
        authoritative_price: hasAuthoritativeLookup ? authoritativePrice : null,
        price_divergence: priceDivergence,
        technician_review_required: technicianReviewRequired,
        compatibility: { ...browserReport, reportedBy: "customer_browser" },
        // The server's own verdict, in its own column, which customers can't read (D1, D5).
        server_assessment: verdict.record,
        customer_name: customerInfo.name,
        // Always the phone confirmed at sign-in, never the browser's (F14).
        customer_phone: verifiedPhone,
        customer_email: customerInfo.email,
      },
    });

    if (storeError || !stored?.reference_id) {
      return reject(500, { error: "Failed to save the quotation request." });
    }

    // A second click or a retry gets the request already made (Stage 4S decision 6).
    if (stored.duplicate) {
      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          referenceId: stored.reference_id,
          buildId: stored.id,
          authoritativePrice: stored.authoritative_price ?? null,
          clientEstimatedPrice: stored.estimated_price,
          priceDivergence: 0,
          technicianReviewRequired: Boolean(stored.technician_review_required),
          userId,
          isGuest: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        referenceId: stored.reference_id,
        buildId: stored.id,
        authoritativePrice: hasAuthoritativeLookup ? authoritativePrice : null,
        clientEstimatedPrice: clientPrice,
        priceDivergence,
        technicianReviewRequired,
        userId,
        isGuest: false,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) {
  serve((req) => handleQuotationVerification(req));
}
