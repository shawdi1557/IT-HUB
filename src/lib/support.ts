// src/lib/support.ts
// Help & Support, Manufacturer Directory, and Service Centre Locator Service
// IT HUB — Kerala, India

import { supabase, supabaseConfig } from "./supabase"
import {
  distanceKm,
  initialBrandSupport,
  initialServiceCentres,
  initialSupportCategories,
  pincodeDirectory,
  type BrandSupport,
  type ServiceCentre,
  type SupportCategory,
} from "../data/catalog"

export interface StoreSettingsContact {
  storeName?: string
  address?: string
  phone?: string
  whatsapp?: string
  email?: string
  delivery?: string
}

export interface StoreSettingsStatus {
  complete: boolean
  missingFields: string[]
  warningMessage: string | null
}

/**
 * Validates whether a given string is a valid 6-digit Indian Postal PIN code.
 * Rules:
 *  - Must be exactly 6 numerical digits.
 *  - Must NOT start with 0.
 */
export function validateIndianPincode(pincode: string): boolean {
  if (!pincode || typeof pincode !== "string") return false
  const trimmed = pincode.trim()
  return /^[1-9]\d{5}$/.test(trimmed)
}

/**
 * Validates that a URL is non-empty and uses secure HTTPS protocol.
 */
export function validateHttpsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Calculates straight-line distance in kilometers between a customer's PIN code centroid
 * and a service centre's geographic coordinates.
 * Returns null if the PIN centroid is unknown or coordinates are invalid numbers.
 * ZERO FABRICATION: Distance is NEVER guessed or assumed.
 */
export function calculatePincodeDistance(
  userPincode: string,
  centreLat?: number | null,
  centreLng?: number | null,
): number | null {
  if (!validateIndianPincode(userPincode)) return null
  if (
    centreLat === null ||
    centreLat === undefined ||
    isNaN(Number(centreLat)) ||
    centreLng === null ||
    centreLng === undefined ||
    isNaN(Number(centreLng))
  ) {
    return null
  }

  const centroid = pincodeDirectory[userPincode.trim()]
  if (!centroid) return null

  const km = distanceKm(
    centroid.latitude,
    centroid.longitude,
    Number(centreLat),
    Number(centreLng),
  )

  return Math.round(km * 10) / 10
}

/**
 * Evaluates whether IT HUB store settings contain all mandatory verified business contacts.
 * If any contact is missing or contains placeholder tokens, returns a warning status.
 */
export function checkStoreSettingsCompleteness(
  settings: StoreSettingsContact,
): StoreSettingsStatus {
  const missingFields: string[] = []

  const isInvalid = (val?: string) =>
    !val ||
    val.trim() === "" ||
    val.includes("placeholder") ||
    val.includes("0000000000") ||
    val.includes("example.com")

  if (isInvalid(settings.address)) missingFields.push("Store Address")
  if (isInvalid(settings.phone)) missingFields.push("Phone Number")
  if (isInvalid(settings.whatsapp)) missingFields.push("WhatsApp Number")
  if (isInvalid(settings.email)) missingFields.push("Email Address")

  const complete = missingFields.length === 0
  const warningMessage = complete
    ? null
    : `Attention Store Administrator: Verified IT HUB contact details are incomplete (${missingFields.join(
        ", ",
      )}). Please update Store Settings to maintain full customer support service.`

  return { complete, missingFields, warningMessage }
}

/**
 * Fetches support categories from Supabase (or falls back to verified static dataset).
 */
export async function fetchSupportCategories(): Promise<SupportCategory[]> {
  if (!supabase || !supabaseConfig.isConfigured) {
    return initialSupportCategories.filter((c) => c.active)
  }

  try {
    const { data, error } = await supabase
      .from("support_categories")
      .select("id, name, icon, catalog_categories, active")
      .eq("active", true)
      .order("id", { ascending: true })

    if (error || !data || data.length === 0) {
      return initialSupportCategories.filter((c) => c.active)
    }

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      catalogCategories: row.catalog_categories || [],
      active: Boolean(row.active),
    }))
  } catch {
    return initialSupportCategories.filter((c) => c.active)
  }
}

export interface FetchBrandSupportOptions {
  category?: string
  brand?: string
  isAdmin?: boolean
}

/**
 * Fetches verified manufacturer brand support records.
 * For public customers: strictly returns only records where is_published = true, active = true, and last_verified_at is set.
 * Falls back safely to verified static dataset if database table is empty.
 */
export async function fetchBrandSupport(
  options: FetchBrandSupportOptions = {},
): Promise<BrandSupport[]> {
  const { category, brand, isAdmin = false } = options

  if (supabase && supabaseConfig.isConfigured) {
    try {
      let query = supabase
        .from("brand_support")
        .select(
          `
          id,
          brand_id,
          brands!inner(name),
          category,
          warranty_phone,
          customer_care_phone,
          support_url,
          warranty_url,
          service_locator_url,
          email,
          notes,
          source_url,
          last_verified_at,
          region,
          verification_status,
          is_published,
          popular,
          active,
          created_at,
          updated_at
        `,
        )
        .eq("active", true)

      if (!isAdmin) {
        query = query
          .eq("is_published", true)
          .not("last_verified_at", "is", null)
      }

      if (category) {
        query = query.eq("category", category)
      }

      const { data, error } = await query

      if (!error && data && data.length > 0) {
        let results: BrandSupport[] = data.map((row: any) => {
          const brandName =
            row.brands?.name || row.brand || row.brand_name || "Unknown Brand"
          return {
            id: row.id,
            brand: brandName,
            category: row.category,
            warrantyPhone: row.warranty_phone || "",
            customerCarePhone: row.customer_care_phone || "",
            supportUrl: row.support_url || "",
            warrantyUrl: row.warranty_url || "",
            serviceLocatorUrl: row.service_locator_url || undefined,
            email: row.email || "",
            notes: row.notes || "",
            sourceUrl: row.source_url || "",
            verifiedBy: "Store Administrator",
            lastVerifiedAt: row.last_verified_at || "",
            region: row.region || "India",
            verificationStatus:
              row.verification_status ||
              (row.last_verified_at ? "verified" : "unverified"),
            isPublished: Boolean(row.is_published),
            popular: Boolean(row.popular),
            active: Boolean(row.active),
            createdAt: row.created_at || new Date().toISOString(),
            updatedAt: row.updated_at || new Date().toISOString(),
          }
        })

        if (brand) {
          results = results.filter(
            (r) => r.brand.toLowerCase() === brand.toLowerCase(),
          )
        }

        return results
      }
    } catch {
      // Graceful fallback to verified in-memory dataset
    }
  }

  // Fallback to verified local dataset
  let results = [...initialBrandSupport].filter((r) => r.active)

  if (!isAdmin) {
    results = results.filter((r) => r.isPublished && r.lastVerifiedAt)
  }

  if (category) {
    results = results.filter((r) => r.category === category)
  }

  if (brand) {
    results = results.filter(
      (r) => r.brand.toLowerCase() === brand.toLowerCase(),
    )
  }

  return results
}

export interface FetchServiceCentresOptions {
  category?: string
  brandName?: string
  pincode?: string
  isAdmin?: boolean
}

/**
 * Fetches verified authorized service centres with PIN-code based proximity calculation.
 * If customer enters a valid Indian PIN code, computes distance from centroid to centre coordinates.
 * Sorts nearest locations first.
 */
export async function fetchServiceCentres(
  options: FetchServiceCentresOptions = {},
): Promise<ServiceCentre[]> {
  const { category, brandName, pincode, isAdmin = false } = options
  let centres: ServiceCentre[] = []

  if (supabase && supabaseConfig.isConfigured) {
    try {
      let query = supabase
        .from("service_centres")
        .select("*")
        .eq("active", true)

      if (!isAdmin) {
        query = query.not("verified_at", "is", null)
      }

      if (category) {
        query = query.eq("category", category)
      }

      if (brandName) {
        query = query.ilike("brand_name", brandName)
      }

      const { data, error } = await query

      if (!error && data && data.length > 0) {
        centres = data.map((row: any) => ({
          id: row.id,
          name: row.name,
          brandId: row.brand_id,
          brandName: row.brand_name,
          category: row.category,
          address: row.address,
          city: row.city,
          state: row.state || "Kerala",
          pincode: row.pincode,
          phone: row.phone,
          email: row.email,
          servicesOffered: row.services_offered || [],
          isAuthorized: Boolean(row.is_authorized),
          authorizationEvidence: row.authorization_evidence,
          sourceUrl: row.source_url,
          latitude: row.latitude ? Number(row.latitude) : undefined,
          longitude: row.longitude ? Number(row.longitude) : undefined,
          active: Boolean(row.active),
          verifiedAt: row.verified_at,
        }))
      }
    } catch {
      // Graceful fallback to verified seed list
    }
  }

  if (centres.length === 0) {
    centres = [...initialServiceCentres].filter((c) => c.active)
    if (!isAdmin) {
      centres = centres.filter((c) => c.verifiedAt)
    }
    if (category) {
      centres = centres.filter((c) => c.category === category)
    }
    if (brandName) {
      centres = centres.filter(
        (c) => c.brandName.toLowerCase() === brandName.toLowerCase(),
      )
    }
  }

  // If user entered a valid PIN code, attach calculated distance
  if (pincode && validateIndianPincode(pincode)) {
    centres = centres.map((centre) => {
      const distance = calculatePincodeDistance(
        pincode,
        centre.latitude,
        centre.longitude,
      )
      return {
        ...centre,
        distanceKm: distance !== null ? distance : undefined,
      }
    })

    // Sort: locations with calculated distance come first, in ascending order
    centres.sort((a, b) => {
      if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
        return a.distanceKm - b.distanceKm
      }
      if (a.distanceKm !== undefined) return -1
      if (b.distanceKm !== undefined) return 1
      return a.name.localeCompare(b.name)
    })
  }

  return centres
}
