// src/lib/builder/persistence.ts
// IT HUB Secure PC Build Persistence via Supabase RLS and Local Cache

import { supabase } from "../supabase"
import type { CanonicalBuild } from "./types"
import { checkCompatibility } from "./compatibility"

const LOCAL_STORAGE_KEY = "ithub_guest_pc_builds"

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
      const localBuilds = getLocalGuestBuilds()
      const existingIndex = localBuilds.findIndex((b) => b.id === build.id)
      const buildToSave: CanonicalBuild = {
        ...build,
        id: build.id.startsWith("guest-") ? build.id : `guest-${Date.now()}`,
        updatedAt: new Date().toISOString(),
      }

      if (existingIndex >= 0) {
        localBuilds[existingIndex] = buildToSave
      } else {
        localBuilds.unshift(buildToSave)
      }

      saveLocalGuestBuilds(localBuilds)
      return { success: true, id: buildToSave.id }
    }

    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user

    const payload = {
      name: build.name.trim() || "My custom PC",
      parts: build.components,
      estimated_price: calculateBuildTotal(build),
      enquiry_status: "Draft",
    }

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
          .single()

        if (error) {
          return { success: false, id: build.id, error: error.message }
        }
        return { success: true, id: data.id }
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
          .single()

        if (error) {
          return { success: false, id: build.id, error: error.message }
        }
        return { success: true, id: data.id }
      }
    } else {
      // Guest local storage fallback
      const localBuilds = getLocalGuestBuilds()
      const existingIndex = localBuilds.findIndex((b) => b.id === build.id)
      const buildToSave: CanonicalBuild = {
        ...build,
        id: build.id.startsWith("guest-") ? build.id : `guest-${Date.now()}`,
        updatedAt: new Date().toISOString(),
      }

      if (existingIndex >= 0) {
        localBuilds[existingIndex] = buildToSave
      } else {
        localBuilds.unshift(buildToSave)
      }

      saveLocalGuestBuilds(localBuilds)
      return { success: true, id: buildToSave.id }
    }
  } catch (err: any) {
    return { success: false, id: build.id, error: err?.message || "Failed to save build" }
  }
}

/**
 * Loads all saved builds for the current user.
 * Revalidates each build using the deterministic compatibility engine.
 */
export async function loadSavedBuilds(): Promise<CanonicalBuild[]> {
  if (!supabase) {
    return getLocalGuestBuilds()
  }

  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user

  if (user) {
    const { data, error } = await supabase
      .from("pc_builds")
      .select("id, name, parts, estimated_price, enquiry_status, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })

    if (error || !data) {
      return getLocalGuestBuilds()
    }

    return data.map((row) => {
      const parts = (row.parts || {}) as CanonicalBuild["components"]
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
      }
    })
  }

  return getLocalGuestBuilds()
}

/**
 * Deletes a saved build by ID.
 */
export async function deleteSavedBuild(buildId: string): Promise<boolean> {
  if (!supabase) {
    const builds = getLocalGuestBuilds().filter((b) => b.id !== buildId)
    saveLocalGuestBuilds(builds)
    return true
  }

  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user

  if (user && !buildId.startsWith("guest-")) {
    const { error } = await supabase
      .from("pc_builds")
      .delete()
      .eq("id", buildId)
      .eq("user_id", user.id)

    return !error
  }

  const builds = getLocalGuestBuilds().filter((b) => b.id !== buildId)
  saveLocalGuestBuilds(builds)
  return true
}

export function calculateBuildTotal(build: CanonicalBuild): number {
  const owned = new Set(build.ownedSlots || [])
  let total = 0
  for (const [slot, comp] of Object.entries(build.components)) {
    if (comp && !owned.has(slot as any)) {
      total += comp.price * (comp.quantity || 1)
    }
  }
  return total
}

export interface CustomerContactInfo {
  name?: string
  phone?: string
  email?: string
}

export interface QuotationSubmissionResult {
  success: boolean
  referenceId?: string
  id?: string
  estimatedPrice?: number
  error?: string
}

export function generateQuotationReference(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `ITH-PC-${dateStr}-${rand}`
}

/**
 * Submits an official PC Build Quotation Request to IT HUB.
 * Uses the Supabase RPC `submit_pc_quotation_request` which:
 * - Authoritatively binds authenticated users via auth.uid()
 * - Securely permits guest requests with null user_id
 * - Records reference_id, parts, Shopify variant IDs, estimated price, and hardware compatibility
 * - Never returns success if the database write fails
 */
export async function submitQuotationRequest(
  build: CanonicalBuild,
  customerInfo?: CustomerContactInfo,
): Promise<QuotationSubmissionResult> {
  const referenceId = generateQuotationReference()
  const estimatedPrice = calculateBuildTotal(build)

  // Map parts into structured format containing names, Shopify product/variant IDs, and prices
  const partsPayload: Record<string, any> = {}
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
      }
    }
  }

  const compatibilityPayload = build.compatibility || checkCompatibility(build.components)

  try {
    if (supabase) {
      const { data, error } = await supabase.rpc("submit_pc_quotation_request", {
        p_build_name: build.name || "Custom PC Build",
        p_reference_id: referenceId,
        p_parts: partsPayload,
        p_estimated_price: estimatedPrice,
        p_compatibility: compatibilityPayload,
        p_customer_name: customerInfo?.name?.trim() || null,
        p_customer_phone: customerInfo?.phone?.trim() || null,
        p_customer_email: customerInfo?.email?.trim() || null,
      })

      if (error) {
        return {
          success: false,
          error: error.message || "Failed to submit quotation request to IT HUB.",
        }
      }

      if (data && (data as any).success === false) {
        return {
          success: false,
          error: (data as any).error || "Failed to submit quotation request.",
        }
      }

      return {
        success: true,
        referenceId: (data as any)?.reference_id || referenceId,
        id: (data as any)?.id,
        estimatedPrice,
      }
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
      }
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          const stored = JSON.parse(localStorage.getItem("ithub_local_quotations") || "[]")
          stored.unshift(guestQuote)
          localStorage.setItem("ithub_local_quotations", JSON.stringify(stored))
        }
      } catch {
        // LocalStorage mock/environment safe
      }

      return {
        success: true,
        referenceId,
        id: guestQuote.id,
        estimatedPrice,
      }
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "An unexpected error occurred while submitting your quotation.",
    }
  }
}

function getLocalGuestBuilds(): CanonicalBuild[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CanonicalBuild[]
    return parsed.map((b) => ({
      ...b,
      compatibility: checkCompatibility(b.components),
    }))
  } catch {
    return []
  }
}

function saveLocalGuestBuilds(builds: CanonicalBuild[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(builds.slice(0, 20)))
  } catch {
    // Ignore storage quota errors
  }
}
