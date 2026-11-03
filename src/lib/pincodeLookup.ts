// src/lib/pincodeLookup.ts
// IT HUB — Geographic PIN Code Coverage Lookup & Verification Service
// Evaluates doorstep service eligibility against IT HUB's fixed 15 km coverage radius.

import { supabase } from "./supabase";
import {
  checkWarranty,
  distanceKm,
  isValidCoordinate,
  initialLocations,
  type ItHubLocation,
  type WarrantyResult,
} from "../data/catalog";

export interface PincodeLookupOptions {
  timeoutMs?: number;
  skipRemote?: boolean;
}

/**
 * Resiliently checks on-site doorstep service eligibility for a given PIN code.
 * 1. Checks fast local centroid directory (synchronous / offline-first).
 * 2. If unknown locally, checks Supabase `pincode_areas` table.
 * 3. If not found in database, attempts fallback geocoding lookup with timeout.
 * 4. If all lookups fail or coordinates cannot be validated, returns `status: "unknown"`
 *    with a clear message allowing retry (never falsely returns "ineligible").
 */
export async function lookupPincodeCoverage(
  pincode: string,
  locations?: ItHubLocation[],
  options: PincodeLookupOptions = {},
): Promise<WarrantyResult> {
  const cleanPin = pincode.trim().replace(/\D/g, "").slice(0, 6);

  // 1. Strict validation
  if (!/^[1-9]\d{5}$/.test(cleanPin)) {
    return {
      status: "invalid",
      message: "Please enter a valid 6-digit Indian PIN code.",
    };
  }

  // 2. Fast local check
  const localResult = checkWarranty(cleanPin, locations);
  if (localResult.status === "eligible" || localResult.status === "ineligible") {
    return localResult;
  }
  if (localResult.status === "invalid") {
    return localResult;
  }

  // If local directory does not have centroid, attempt remote/database lookup unless skipped
  if (options.skipRemote) {
    return localResult;
  }

  // Determine active store locations
  const rawLocations =
    Array.isArray(locations) && locations.length > 0 ? locations : initialLocations;
  let active = rawLocations.filter((location) => location.active !== false);
  if (!active.length) {
    active = initialLocations.filter((location) => location.active !== false);
  }
  const validStores = active.filter((loc) => isValidCoordinate(loc.latitude, loc.longitude));
  if (!validStores.length) {
    return {
      status: "unknown",
      pincode: cleanPin,
      reason: "no_valid_store",
      message: "Store location coordinates are temporarily unavailable.",
    };
  }

  const timeoutMs = options.timeoutMs ?? 3500;

  // 3. Try Supabase `pincode_areas` table
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("pincode_areas")
        .select("pincode, area, latitude, longitude")
        .eq("pincode", cleanPin)
        .maybeSingle();

      if (!error && data && isValidCoordinate(data.latitude, data.longitude)) {
        return evaluateDistance(cleanPin, data.area, data.latitude, data.longitude, validStores);
      }
    }
  } catch {
    // Database query failed or offline; continue to fallback geocoding
  }

  // 4. Fallback geocoding lookup with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const geoUrl = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(
      cleanPin,
    )}&country=India&format=json&limit=1`;

    const res = await fetch(geoUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ITHUB-Storefront-Eligibility-Checker/1.0",
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        const item = results[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const displayName = item.display_name?.split(",")[0] || `PIN ${cleanPin} Area`;

        if (isValidCoordinate(lat, lon)) {
          return evaluateDistance(cleanPin, displayName, lat, lon, validStores);
        }
      }
    }
  } catch {
    // Network / timeout / abort
  }

  // 5. If lookup failed or coordinates could not be retrieved, return "unknown"
  return {
    status: "unknown",
    pincode: cleanPin,
    reason: "lookup_unverified",
    message: `We could not automatically verify coverage for PIN ${cleanPin}. Please retry or contact IT HUB directly.`,
  };
}

/**
 * Calculates straight-line distance and evaluates against 15 km policy
 */
function evaluateDistance(
  pincode: string,
  areaName: string,
  latitude: number,
  longitude: number,
  stores: ItHubLocation[],
): WarrantyResult {
  const nearest = stores
    .map((store) => ({
      location: store,
      km: distanceKm(latitude, longitude, store.latitude, store.longitude),
    }))
    .filter((s) => Number.isFinite(s.km))
    .sort((a, b) => a.km - b.km)[0];

  if (!nearest) {
    return {
      status: "unknown",
      pincode,
      reason: "distance_calculation_failed",
      message: "Distance calculation failed.",
    };
  }

  const effectiveRadius = Math.min(15, nearest.location.serviceRadiusKm || 15);
  const roundedKm = Math.round(nearest.km * 10) / 10;
  const isEligible = roundedKm <= effectiveRadius;

  return {
    status: isEligible ? "eligible" : "ineligible",
    pincode,
    area: areaName,
    location: {
      ...nearest.location,
      serviceRadiusKm: effectiveRadius,
    },
    distanceKm: roundedKm,
    serviceRadiusKm: effectiveRadius,
  };
}
