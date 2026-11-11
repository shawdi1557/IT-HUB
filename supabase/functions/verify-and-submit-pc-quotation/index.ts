// supabase/functions/verify-and-submit-pc-quotation/index.ts
// Production Server-Side Quotation Verification & Anti-Tampering Engine
// Authoritatively recalculates prices from Shopify / Database, enforces distributed rate limits,
// and flags price tampering before writing to pc_builds.

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
import { resolvePartSpecs, unresolvedSpecRecord } from "./specs.ts";

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export interface QuotationVerificationDeps {
  supabaseClient?: any;
  shopifyFetch?: (query: string, variables?: any) => Promise<any>;
}

export async function handleQuotationVerification(
  req: Request,
  deps?: QuotationVerificationDeps,
): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // 1. Initialize Supabase Admin Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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
      token === Deno.env.get("SUPABASE_ANON_KEY") ||
      token === Deno.env.get("VITE_SUPABASE_ANON_KEY")
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
    if (supabase) {
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
        verifiedPhone = userData.user.phone || null;
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
    } else {
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

    // 3. Distributed Rate Limit Check (5 requests per 60 seconds)
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "guest-ip";

    if (supabase) {
      const { data: allowed, error: rlErr } = await supabase.rpc("check_distributed_rate_limit", {
        p_ip_hash: clientIp,
        p_endpoint: "verify-pc-quotation",
        p_max_requests: 5,
        p_window_seconds: 60,
      });

      // Fail closed: if the limiter can't answer, don't accept the submission.
      if (rlErr) {
        return new Response(
          JSON.stringify({ success: false, error: "Service temporarily unavailable." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (allowed === false) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Too Many Requests. Maximum 5 quotation requests per minute allowed.",
            retryAfter: 60,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": "60",
            },
          },
        );
      }
    }

    // 4. Structural checks (Stage 4A-6), after sign-in and the rate limit, so a refused request still counts.
    // They check the request's shape only. Nothing here makes a build compatible: that needs Stage 4S.
    const reject = (status: number, payload: Record<string, unknown>) =>
      new Response(JSON.stringify({ success: false, ...payload }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    const { buildName, estimatedPrice, compatibility, customerInfo } = checked;

    // 5. Recalculate Authoritative Pricing from the variant IDs. A part the customer already owns
    // is recorded for the technician, but isn't sold, so it isn't priced.
    const allParts = checked.parts;
    const partsArray = allParts.filter((part) => !part.owned);
    // Every part to buy has a valid variant ID by now, and a build has at least four of them.
    const variantGids = partsArray.map((part) => part.variantId as string);

    let authoritativePrice = 0;
    let hasAuthoritativeLookup = false;

    // Fetch authoritative variant prices if Shopify is configured
    const shopifyDomain = Deno.env.get("VITE_SHOPIFY_STORE_DOMAIN") || "";
    const shopifyToken = Deno.env.get("VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN") || "";
    const shopifyApiVersion = Deno.env.get("VITE_SHOPIFY_API_VERSION") || "2025-10";
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
            const specs = resolvePartSpecs(nodes[index], part.slot, check.slot, part.specs);
            part.serverSpecs = specs.record;
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

    // A second click or a retry returns the request already made, instead of filing another one. Only the same
    // request counts: the same slots, ownership, variants and quantities (Stage 4S decision 6).
    const buildKey = quotationFingerprint(allParts);
    if (supabase) {
      try {
        const { data: recent } = await supabase
          .from("pc_builds")
          .select(
            "id, reference_id, parts, estimated_price, authoritative_price, technician_review_required",
          )
          .eq("user_id", userId)
          .eq("enquiry_status", "New")
          .gte("created_at", new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString());
        const duplicate = (recent || []).find(
          (row: any) => row.reference_id && quotationFingerprint(row.parts) === buildKey,
        );
        if (duplicate) {
          return new Response(
            JSON.stringify({
              success: true,
              duplicate: true,
              referenceId: duplicate.reference_id,
              buildId: duplicate.id,
              authoritativePrice: duplicate.authoritative_price ?? null,
              clientEstimatedPrice: duplicate.estimated_price,
              priceDivergence: 0,
              technicianReviewRequired: Boolean(duplicate.technician_review_required),
              userId,
              isGuest: false,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch {
        // The duplicate check is a courtesy. The rate limit above still applies.
      }
    }

    // 6. Anti-Tampering & Price Divergence Audit. Client-supplied prices are never authoritative,
    // so an unverified quotation records no authoritative price at all.
    const clientPrice = Math.round(estimatedPrice);
    const specsNeedReview = partsArray.some((part) => part.serverSpecs?.reviewRequired === true);
    const priceDivergence = hasAuthoritativeLookup ? Math.abs(authoritativePrice - clientPrice) : 0;
    // The compatibility result comes from the browser, so it can only add a reason to review. A
    // missing result counts as unconfirmed.
    const technicianReviewRequired =
      priceDivergence > 100 ||
      !hasAuthoritativeLookup ||
      compatibility?.status !== "compatible" ||
      // Stage 4S-1: a part Shopify couldn't confirm belongs in its slot, or one sold while out of stock.
      slotsUnconfirmed ||
      backordered ||
      // Stage 4S-2: a part whose specifications the server couldn't resolve, or resolved with a rejected,
      // conflicting or unreadable value. (Unresolved parts are also caught above: no verified price.)
      specsNeedReview ||
      // Nothing here can check a customer's own part, and the browser is what marked it as owned.
      allParts.some((part) => part.owned);

    // 7. Generate Authoritative Reference ID
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const referenceId = `ITH-PC-${today}-${randomHex}`;

    // 8. Persist to pc_builds table
    let buildId = `quote-${Date.now()}`;
    if (supabase) {
      const { data: inserted, error: insErr } = await supabase
        .from("pc_builds")
        .insert({
          user_id: userId,
          name: buildName,
          reference_id: referenceId,
          // Keyed by slot, in the builder's shape, with Shopify's names and prices for the parts to buy.
          parts: Object.fromEntries(allParts.map((part) => [part.slot, part])),
          estimated_price: hasAuthoritativeLookup ? authoritativePrice : clientPrice,
          authoritative_price: hasAuthoritativeLookup ? authoritativePrice : null,
          price_divergence: priceDivergence,
          technician_review_required: technicianReviewRequired,
          // Worked out in the customer's browser, so it's a note for the technician, not a finding.
          compatibility: { ...compatibility, reportedBy: "customer_browser" },
          customer_name: customerInfo.name,
          customer_phone: verifiedPhone || customerInfo.phone,
          customer_email: customerInfo.email,
          enquiry_status: "New",
        })
        .select("id")
        .single();

      if (insErr) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to save the quotation request.",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (inserted?.id) {
        buildId = inserted.id;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        referenceId,
        buildId,
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
