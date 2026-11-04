// supabase/functions/verify-and-submit-pc-quotation/index.ts
// Production Server-Side Quotation Verification & Anti-Tampering Engine
// Authoritatively recalculates prices from Shopify / Database, enforces distributed rate limits,
// and flags price tampering before writing to pc_builds.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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
    const body = await req.json();
    const {
      buildName = "Custom PC Build",
      parts = {},
      estimatedPrice = 0,
      compatibility = {},
      customerInfo = {},
    } = body;

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

    // 4. Extract Variant GIDs & Recalculate Authoritative Pricing. A part the customer already owns
    // is recorded for the technician, but isn't sold, so it isn't priced.
    const allParts = (Array.isArray(parts) ? parts : Object.values(parts)).filter(Boolean) as any[];
    const partsArray = allParts.filter((part) => !part.owned);
    const variantGids: string[] = [];
    for (const part of partsArray) {
      if (part.variantId) {
        variantGids.push(part.variantId);
      }
    }

    let authoritativePrice = 0;
    let hasAuthoritativeLookup = false;

    // Fetch authoritative variant prices if Shopify is configured
    const shopifyDomain = Deno.env.get("VITE_SHOPIFY_STORE_DOMAIN") || "";
    const shopifyToken = Deno.env.get("VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN") || "";
    const shopifyApiVersion = Deno.env.get("VITE_SHOPIFY_API_VERSION") || "2025-10";
    // A part with no variant can't be priced by Shopify, so the total can't be verified.
    const everyPartHasVariant = partsArray.length > 0 && variantGids.length === partsArray.length;
    const unavailableParts: string[] = [];

    if (everyPartHasVariant && ((shopifyDomain && shopifyToken) || deps?.shopifyFetch)) {
      const query = `
        query getVariantPrices($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              title
              product {
                title
              }
              price {
                amount
                currencyCode
              }
              availableForSale
            }
          }
        }
      `;
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

        const shopifyData = await fetcher(query, { ids: variantGids });
        if (shopifyData?.data?.nodes && Array.isArray(shopifyData.data.nodes)) {
          let foundNodes = 0;
          for (const [index, node] of shopifyData.data.nodes.entries()) {
            if (node && node.price?.amount) {
              const price = Math.round(parseFloat(node.price.amount));
              authoritativePrice += price;
              foundNodes++;
              // What's stored is what Shopify says, whatever name and price the browser sent.
              const part = partsArray[index];
              part.price = price;
              if (node.product?.title) {
                part.title = node.product.title;
                part.name = node.product.title;
              }
              if (node.availableForSale === false) {
                unavailableParts.push(part.slot || part.title || "A component");
              }
            }
          }
          if (foundNodes === variantGids.length && variantGids.length > 0) {
            hasAuthoritativeLookup = true;
          }
        }
      } catch {
        // The price stays unverified and the quotation goes to a technician for review.
      }
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

    // A second click or a retry returns the request already made, instead of filing another one.
    const buildKey = JSON.stringify(allParts.map((part) => part.variantId || part.title).sort());
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
        const duplicate = (recent || []).find((row: any) => {
          const stored = (
            Array.isArray(row.parts) ? row.parts : Object.values(row.parts || {})
          ) as any[];
          return (
            row.reference_id &&
            JSON.stringify(
              stored
                .filter(Boolean)
                .map((part) => part.variantId || part.title)
                .sort(),
            ) === buildKey
          );
        });
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

    // 5. Anti-Tampering & Price Divergence Audit. Client-supplied prices are never authoritative,
    // so an unverified quotation records no authoritative price at all.
    const clientPrice = Math.round(Number(estimatedPrice) || 0);
    const priceDivergence = hasAuthoritativeLookup ? Math.abs(authoritativePrice - clientPrice) : 0;
    // The compatibility result comes from the browser, so it can only add a reason to review. A
    // missing result counts as unconfirmed.
    const technicianReviewRequired =
      priceDivergence > 100 ||
      !hasAuthoritativeLookup ||
      compatibility?.status !== "compatible" ||
      // Nothing here can check a customer's own part, and the browser is what marked it as owned.
      allParts.some((part) => part.owned);

    // 6. Generate Authoritative Reference ID
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const referenceId = `ITH-PC-${today}-${randomHex}`;

    // 7. Persist to pc_builds table
    let buildId = `quote-${Date.now()}`;
    if (supabase) {
      const { data: inserted, error: insErr } = await supabase
        .from("pc_builds")
        .insert({
          user_id: userId,
          name: String(buildName).slice(0, 120),
          reference_id: referenceId,
          parts,
          estimated_price: hasAuthoritativeLookup ? authoritativePrice : clientPrice,
          authoritative_price: hasAuthoritativeLookup ? authoritativePrice : null,
          price_divergence: priceDivergence,
          technician_review_required: technicianReviewRequired,
          // Worked out in the customer's browser, so it's a note for the technician, not a finding.
          compatibility: { ...compatibility, reportedBy: "customer_browser" },
          customer_name: customerInfo.name?.trim() || null,
          customer_phone: verifiedPhone || customerInfo.phone?.trim() || null,
          customer_email: customerInfo.email?.trim() || null,
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
