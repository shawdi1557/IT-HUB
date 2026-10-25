// src/lib/builder/persistence.ts
// IT HUB Secure PC Build Persistence via Supabase RLS and Local Cache

import { supabase } from "../supabase";
import type { CanonicalBuild } from "./types";
import { checkCompatibility } from "./compatibility";

const LOCAL_STORAGE_KEY = "ithub_guest_pc_builds";

/**
 * Persists a canonical PC build to Supabase `pc_builds` table.
 * If user is authenticated, uses verified user ID enforcing RLS.
 * If guest, saves to secure localStorage with sync capability.
 */
export async function saveBuild(
  build: CanonicalBuild,
): Promise<{ success: boolean; id: string; error?: string }> {
  try {
    if (!supabase) {
      const localBuilds = getLocalGuestBuilds();
      const existingIndex = localBuilds.findIndex((b) => b.id === build.id);
      const buildToSave: CanonicalBuild = {
        ...build,
        id: build.id.startsWith("guest-") ? build.id : `guest-${Date.now()}`,
        updatedAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        localBuilds[existingIndex] = buildToSave;
      } else {
        localBuilds.unshift(buildToSave);
      }

      saveLocalGuestBuilds(localBuilds);
      return { success: true, id: buildToSave.id };
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    const payload = {
      name: build.name.trim() || "My custom PC",
      parts: build.components,
      estimated_price: calculateBuildTotal(build),
      enquiry_status: "Draft",
    };

    if (user) {
      // Authenticated user saving to Supabase
      if (build.userId && build.id && !build.id.startsWith("guest-")) {
        // Update existing build
        const { data, error } = await supabase
          .from("pc_builds")
          .update({
            name: payload.name,
            parts: payload.parts,
            estimated_price: payload.estimated_price,
            updated_at: new Date().toISOString(),
          })
          .eq("id", build.id)
          .eq("user_id", user.id)
          .select("id")
          .single();

        if (error) {
          return { success: false, id: build.id, error: error.message };
        }
        return { success: true, id: data.id };
      } else {
        // Insert new build
        const { data, error } = await supabase
          .from("pc_builds")
          .insert({
            user_id: user.id,
            name: payload.name,
            parts: payload.parts,
            estimated_price: payload.estimated_price,
            enquiry_status: "Draft",
          })
          .select("id")
          .single();

        if (error) {
          return { success: false, id: build.id, error: error.message };
        }
        return { success: true, id: data.id };
      }
    } else {
      // Guest local storage fallback
      const localBuilds = getLocalGuestBuilds();
      const existingIndex = localBuilds.findIndex((b) => b.id === build.id);
      const buildToSave: CanonicalBuild = {
        ...build,
        id: build.id.startsWith("guest-") ? build.id : `guest-${Date.now()}`,
        updatedAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        localBuilds[existingIndex] = buildToSave;
      } else {
        localBuilds.unshift(buildToSave);
      }

      saveLocalGuestBuilds(localBuilds);
      return { success: true, id: buildToSave.id };
    }
  } catch (err: any) {
    return { success: false, id: build.id, error: err?.message || "Failed to save build" };
  }
}

/**
 * Loads all saved builds for the current user.
 * Revalidates each build using the deterministic compatibility engine.
 */
export async function loadSavedBuilds(): Promise<CanonicalBuild[]> {
  if (!supabase) {
    return getLocalGuestBuilds();
  }

  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;

  if (user) {
    const { data, error } = await supabase
      .from("pc_builds")
      .select("id, name, parts, estimated_price, enquiry_status, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error || !data) {
      return getLocalGuestBuilds();
    }

    return data.map((row) => {
      const parts = (row.parts || {}) as CanonicalBuild["components"];
      return {
        id: row.id,
        userId: user.id,
        name: row.name || "My custom PC",
        mode: "expert",
        currency: "INR",
        components: parts,
        compatibility: checkCompatibility(parts),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  return getLocalGuestBuilds();
}

/**
 * Deletes a saved build by ID.
 */
export async function deleteSavedBuild(buildId: string): Promise<boolean> {
  if (!supabase) {
    const builds = getLocalGuestBuilds().filter((b) => b.id !== buildId);
    saveLocalGuestBuilds(builds);
    return true;
  }

  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;

  if (user && !buildId.startsWith("guest-")) {
    const { error } = await supabase
      .from("pc_builds")
      .delete()
      .eq("id", buildId)
      .eq("user_id", user.id);

    return !error;
  }

  const builds = getLocalGuestBuilds().filter((b) => b.id !== buildId);
  saveLocalGuestBuilds(builds);
  return true;
}

export function calculateBuildTotal(build: CanonicalBuild): number {
  const owned = new Set(build.ownedSlots || []);
  let total = 0;
  for (const [slot, comp] of Object.entries(build.components)) {
    if (comp && !owned.has(slot as any)) {
      total += comp.price * (comp.quantity || 1);
    }
  }
  return total;
}

export interface CustomerContactInfo {
  name?: string;
  phone?: string;
  email?: string;
}

export interface QuotationSubmissionResult {
  success: boolean;
  referenceId?: string;
  id?: string;
  estimatedPrice?: number;
  error?: string;
  isRateLimited?: boolean;
  requiresAuth?: boolean;
  technicianReviewRequired?: boolean;
  priceDivergence?: number;
}

export const PENDING_QUOTATION_STORAGE_KEY = "ithub_pending_pc_quotation";

export interface PendingQuotation {
  mode: "wizard" | "customise";
  build: CanonicalBuild;
  parts: Record<string, any>;
  name: string;
  intent?: any;
  ownedSlots?: string[];
  timestamp: string;
}

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage)
    return (globalThis as any).localStorage;
  return null;
}

/**
 * Preserves a pending PC quotation build and customer preferences in localStorage
 * when an unauthenticated guest requests a quotation.
 */
export function savePendingQuotation(data: Omit<PendingQuotation, "timestamp">): void {
  try {
    const storage = getStorage();
    if (storage) {
      const payload: PendingQuotation = {
        ...data,
        timestamp: new Date().toISOString(),
      };
      storage.setItem(PENDING_QUOTATION_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // LocalStorage quota safe
  }
}

/**
 * Retrieves any saved pending PC quotation build awaiting customer review upon login.
 */
export function getPendingQuotation(): PendingQuotation | null {
  try {
    const storage = getStorage();
    if (storage) {
      const raw = storage.getItem(PENDING_QUOTATION_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as PendingQuotation;
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

/**
 * Clears the saved pending PC quotation after explicit customer confirmation or dismissal.
 */
export function clearPendingQuotation(): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(PENDING_QUOTATION_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export function generateQuotationReference(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ITH-PC-${dateStr}-${rand}`;
}

/**
 * Submits an official PC Build Quotation Request to IT HUB.
 * Uses the authoritative Supabase Edge Function `verify-and-submit-pc-quotation` which:
 * - Requires mandatory authentication with valid customer JWT
 * - Recalculates authoritative prices server-side from Shopify variant IDs
 * - Distributed rate-limits requests (5 requests / 60 seconds per IP)
 * - Flags price tampering (> ₹100 divergence) for technician review
 * - Derives customer user_id authoritatively from validated JWT identity
 * - Terminal error handling: never falls back to unverified client-side RPCs or bypasses verification
 */
export async function submitQuotationRequest(
  build: CanonicalBuild,
  customerInfo?: CustomerContactInfo,
  deps?: { supabaseClient?: any },
): Promise<QuotationSubmissionResult> {
  const activeSupabase = deps?.supabaseClient ?? supabase;
  const referenceId = generateQuotationReference();
  const estimatedPrice = calculateBuildTotal(build);

  // Map parts into structured format containing names, Shopify product/variant IDs, and prices
  const partsPayload: Record<string, any> = {};
  for (const [slot, comp] of Object.entries(build.components)) {
    if (comp) {
      partsPayload[slot] = {
        slot,
        productId: comp.productId,
        variantId: comp.variantId || null,
        title: comp.title,
        name: comp.title,
        price: comp.price,
        isShopifyLive: comp.isShopifyLive ?? Boolean(comp.variantId),
        specs: comp.specs || {},
      };
    }
  }

  const compatibilityPayload = build.compatibility || checkCompatibility(build.components);

  try {
    if (activeSupabase) {
      // 0. Client-Side Pre-Check: Authentication is mandatory for quotation submission
      if (activeSupabase.auth && typeof activeSupabase.auth.getUser === "function") {
        try {
          const { data: authData } = await activeSupabase.auth.getUser();
          if (!authData?.user) {
            return {
              success: false,
              error: "Authentication required to submit a PC quotation request. Please sign in.",
              requiresAuth: true,
            };
          }
        } catch {
          // If auth check throws, let Edge Function perform authoritative JWT validation
        }
      }

      // Authoritative Edge Function verification is the SOLE live submission pathway
      let edgeData: any = null;
      let edgeErr: any = null;

      try {
        const response = await activeSupabase.functions.invoke("verify-and-submit-pc-quotation", {
          body: {
            buildName: build.name || "Custom PC Build",
            parts: partsPayload,
            estimatedPrice,
            compatibility: compatibilityPayload,
            customerInfo: {
              name: customerInfo?.name?.trim() || null,
              phone: customerInfo?.phone?.trim() || null,
              email: customerInfo?.email?.trim() || null,
            },
          },
        });
        edgeData = response.data;
        edgeErr = response.error;
      } catch (invokeErr: any) {
        edgeErr = invokeErr;
      }

      // 1. Detect Authentication Required (HTTP 401)
      let isAuthRequired = false;
      let errorMessage = edgeErr?.message;

      if (edgeErr) {
        try {
          if (edgeErr.context && typeof edgeErr.context.json === "function") {
            const errBody = await edgeErr.context.json();
            if (errBody?.error) errorMessage = errBody.error;
            if (errBody?.requiresAuth || edgeErr.context.status === 401) {
              isAuthRequired = true;
            }
          } else if (edgeErr.context?.status === 401 || edgeErr.status === 401) {
            isAuthRequired = true;
          }
        } catch {
          // Context already consumed or not JSON
        }
      }

      if (
        edgeData?.requiresAuth ||
        (typeof edgeData?.error === "string" &&
          edgeData.error.toLowerCase().includes("authentication required")) ||
        (typeof errorMessage === "string" &&
          errorMessage.toLowerCase().includes("authentication required"))
      ) {
        isAuthRequired = true;
      }

      if (isAuthRequired) {
        return {
          success: false,
          error: "Authentication required to submit a PC quotation request. Please sign in.",
          requiresAuth: true,
        };
      }

      // 2. Detect Distributed Rate Limiting (HTTP 429)
      let isRateLimited = false;

      if (edgeErr) {
        try {
          if (edgeErr.context && typeof edgeErr.context.json === "function") {
            const errBody = await edgeErr.context.json();
            if (errBody?.error) errorMessage = errBody.error;
            if (errBody?.retryAfter || edgeErr.context.status === 429) {
              isRateLimited = true;
            }
          } else if (edgeErr.context?.status === 429 || edgeErr.status === 429) {
            isRateLimited = true;
          }
        } catch {
          // Context already consumed or not JSON
        }
      }

      if (
        edgeData?.retryAfter ||
        (typeof edgeData?.error === "string" &&
          edgeData.error.toLowerCase().includes("too many requests")) ||
        (typeof errorMessage === "string" &&
          errorMessage.toLowerCase().includes("too many requests"))
      ) {
        isRateLimited = true;
      }

      if (isRateLimited) {
        return {
          success: false,
          error:
            "Too many quotation requests. Maximum 5 requests per minute allowed. Please wait a moment before trying again.",
          isRateLimited: true,
        };
      }

      // 3. Network or invocation failure — Return terminal error (NO fallback to unverified RPC)
      if (edgeErr) {
        return {
          success: false,
          error:
            errorMessage ||
            "Failed to contact quotation verification service. Please try again or message IT HUB on WhatsApp.",
        };
      }

      // 4. Edge Function logical rejection
      if (edgeData && edgeData.success === false) {
        return {
          success: false,
          error: edgeData.error || "Quotation verification failed.",
          requiresAuth: Boolean(edgeData.requiresAuth),
          technicianReviewRequired: Boolean(edgeData.technicianReviewRequired),
          priceDivergence: edgeData.priceDivergence,
        };
      }

      // 5. Successful authoritative quotation verification
      if (edgeData && edgeData.success) {
        return {
          success: true,
          referenceId: edgeData.referenceId || referenceId,
          id: edgeData.buildId,
          estimatedPrice: edgeData.authoritativePrice ?? estimatedPrice,
          technicianReviewRequired: Boolean(edgeData.technicianReviewRequired),
          priceDivergence: edgeData.priceDivergence ?? 0,
        };
      }

      return {
        success: false,
        error: "Quotation verification returned an unexpected response. Please try again.",
      };
    } else {
      // In offline/test environment without Supabase configuration
      const guestQuote = {
        id: `local-quote-${Date.now()}`,
        reference_id: referenceId,
        name: build.name || "Custom PC Build",
        parts: partsPayload,
        estimated_price: estimatedPrice,
        compatibility: compatibilityPayload,
        created_at: new Date().toISOString(),
      };
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          const stored = JSON.parse(localStorage.getItem("ithub_local_quotations") || "[]");
          stored.unshift(guestQuote);
          localStorage.setItem("ithub_local_quotations", JSON.stringify(stored));
        }
      } catch {
        // LocalStorage mock/environment safe
      }

      return {
        success: true,
        referenceId,
        id: guestQuote.id,
        estimatedPrice,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to submit quotation request. Please try again.",
    };
  }
}

function getLocalGuestBuilds(): CanonicalBuild[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CanonicalBuild[];
    return parsed.map((b) => ({
      ...b,
      compatibility: checkCompatibility(b.components),
    }));
  } catch {
    return [];
  }
}

function saveLocalGuestBuilds(builds: CanonicalBuild[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(builds.slice(0, 20)));
  } catch {
    // Ignore storage quota errors
  }
}
