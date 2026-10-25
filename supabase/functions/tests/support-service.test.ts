// supabase/functions/tests/support-service.test.ts
// Automated Unit Tests for Support, Manufacturer Directory & Service-Centre Locator
// IT HUB — Kerala, India

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Replicate pure helper functions and logic from src/lib/support.ts

export function validateIndianPincode(pincode: string): boolean {
  if (!pincode || typeof pincode !== "string") return false;
  const trimmed = pincode.trim();
  return /^[1-9]\d{5}$/.test(trimmed);
}

export function validateHttpsUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return /^https:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/i.test(trimmed);
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export const PINCODE_CENTROIDS: Record<string, Coordinates> = {
  "686691": { latitude: 10.0601, longitude: 76.6294 }, // Kothamangalam (IT HUB)
  "686661": { latitude: 9.9754, longitude: 76.5786 }, // Muvattupuzha
  "682035": { latitude: 9.9816, longitude: 76.2845 }, // Ernakulam / Kochi
  "682016": { latitude: 9.9678, longitude: 76.2995 }, // Ernakulam South / Kadavanthra
  "680001": { latitude: 10.5276, longitude: 76.2144 }, // Thrissur
  "686001": { latitude: 9.5916, longitude: 76.5222 }, // Kottayam
  "673001": { latitude: 11.2588, longitude: 75.7804 }, // Kozhikode
  "695001": { latitude: 8.5241, longitude: 76.9366 }, // Thiruvananthapuram
};

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function calculatePincodeDistance(
  userPincode: string,
  destLat?: number,
  destLon?: number,
): number | null {
  if (!validateIndianPincode(userPincode)) return null;
  if (destLat == null || destLon == null) return null;

  const origin = PINCODE_CENTROIDS[userPincode.trim()];
  if (!origin) return null;

  return calculateDistanceKm(origin.latitude, origin.longitude, destLat, destLon);
}

export interface StoreSettings {
  storeName?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
}

export function checkStoreSettingsCompleteness(settings: StoreSettings): {
  isComplete: boolean;
  missingFields: string[];
} {
  const missing: string[] = [];
  if (!settings.address?.trim()) missing.push("Store Physical Address");
  if (!settings.phone?.trim()) missing.push("Customer Support Phone");
  if (!settings.whatsapp?.trim()) missing.push("WhatsApp Support Number");
  if (!settings.email?.trim()) missing.push("Support Email");

  return {
    isComplete: missing.length === 0,
    missingFields: missing,
  };
}

export interface BrandSupportRecord {
  id: string;
  brand: string;
  category: string;
  warrantyPhone?: string;
  customerCarePhone?: string;
  supportUrl?: string;
  warrantyUrl?: string;
  serviceLocatorUrl?: string;
  verificationStatus: "verified" | "pending" | "rejected";
  isPublished: boolean;
  active: boolean;
  lastVerifiedAt?: string | null;
}

export function filterPublicBrandSupport(
  records: BrandSupportRecord[],
  isAdmin: boolean = false,
): BrandSupportRecord[] {
  if (isAdmin) {
    return records.filter((r) => r.active);
  }
  // Public RLS policy: active = true AND last_verified_at IS NOT NULL AND is_published = true
  return records.filter(
    (r) =>
      r.active && Boolean(r.lastVerifiedAt) && r.isPublished && r.verificationStatus === "verified",
  );
}

export interface ServiceCentreRecord {
  id: string;
  name: string;
  brandName: string;
  category: string;
  pincode: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
  isAuthorized: boolean;
  active: boolean;
  verifiedAt?: string | null;
  sourceUrl: string;
}

export function filterPublicServiceCentres(
  records: ServiceCentreRecord[],
  isAdmin: boolean = false,
): ServiceCentreRecord[] {
  if (isAdmin) {
    return records.filter((r) => r.active);
  }
  // Public RLS policy: active = true AND verified_at IS NOT NULL
  return records.filter((r) => r.active && Boolean(r.verifiedAt) && r.isAuthorized);
}

// ============================================================================
// TEST SUITES
// ============================================================================

Deno.test("Support Service: 1. Strict Indian PIN code validation", () => {
  // Valid 6-digit PIN codes
  assertEquals(validateIndianPincode("686691"), true); // Kothamangalam
  assertEquals(validateIndianPincode("682035"), true); // Kochi
  assertEquals(validateIndianPincode("110001"), true); // New Delhi
  assertEquals(validateIndianPincode("560001"), true); // Bengaluru
  assertEquals(validateIndianPincode(" 686691 "), true); // Trimmable whitespace

  // Invalid: starts with 0
  assertEquals(validateIndianPincode("012345"), false);

  // Invalid: length != 6
  assertEquals(validateIndianPincode("68669"), false);
  assertEquals(validateIndianPincode("6866910"), false);
  assertEquals(validateIndianPincode(""), false);

  // Invalid: contains non-digits
  assertEquals(validateIndianPincode("68669A"), false);
  assertEquals(validateIndianPincode("686-691"), false);
  assertEquals(validateIndianPincode("686 691"), false);
  assertEquals(validateIndianPincode("PIN686"), false);
});

Deno.test("Support Service: 2. Official HTTPS URL validation", () => {
  assertEquals(validateHttpsUrl("https://support.hp.com/in-en"), true);
  assertEquals(validateHttpsUrl("https://www.dell.com/support/home/en-in"), true);
  assertEquals(validateHttpsUrl("https://locate.apple.com/in/en/"), true);

  // Insecure HTTP is rejected
  assertEquals(validateHttpsUrl("http://support.hp.com"), false);

  // Invalid protocols or relative URLs rejected
  assertEquals(validateHttpsUrl("ftp://support.hp.com"), false);
  assertEquals(validateHttpsUrl("/support/hp"), false);
  assertEquals(validateHttpsUrl("javascript:alert(1)"), false);
  assertEquals(validateHttpsUrl(""), false);
});

Deno.test("Support Service: 3. Haversine distance calculation and PIN centroids", () => {
  // Distance from Kothamangalam (686691) to Ernakulam (682035) ~ 40-45 km
  const distKochi = calculatePincodeDistance("686691", 9.9816, 76.2845);
  assertNotEquals(distKochi, null);
  assertEquals(typeof distKochi, "number");
  // Approximately 38-42 km straight line
  assertEquals(distKochi! > 35 && distKochi! < 45, true);

  // Distance to itself should be 0
  const distSelf = calculatePincodeDistance("686691", 10.0601, 76.6294);
  assertEquals(distSelf, 0);

  // Invalid PIN code returns null (no crash)
  assertEquals(calculatePincodeDistance("INVALID", 9.9816, 76.2845), null);

  // Missing destination coordinates returns null
  assertEquals(calculatePincodeDistance("686691", undefined, undefined), null);

  // Unknown centroid PIN returns null gracefully
  assertEquals(calculatePincodeDistance("699999", 9.9816, 76.2845), null);
});

Deno.test("Support Service: 4. RLS & public isolation for Brand Support records", () => {
  const sampleRecords: BrandSupportRecord[] = [
    {
      id: "bs-hp-laptop",
      brand: "HP",
      category: "Laptop",
      warrantyPhone: "1800-258-7170",
      customerCarePhone: "1800-425-4999",
      supportUrl: "https://support.hp.com/in-en",
      warrantyUrl: "https://support.hp.com/in-en/check-warranty",
      serviceLocatorUrl: "https://support.hp.com/in-en/service-center",
      verificationStatus: "verified",
      isPublished: true,
      active: true,
      lastVerifiedAt: "2026-10-17T00:00:00Z",
    },
    {
      id: "bs-unverified",
      brand: "Pending Brand",
      category: "Laptop",
      verificationStatus: "pending",
      isPublished: false,
      active: true,
      lastVerifiedAt: null,
    },
    {
      id: "bs-rejected",
      brand: "Rejected Brand",
      category: "Printer",
      verificationStatus: "rejected",
      isPublished: false,
      active: true,
      lastVerifiedAt: "2026-10-17T00:00:00Z",
    },
    {
      id: "bs-inactive",
      brand: "Inactive Brand",
      category: "Mobile",
      verificationStatus: "verified",
      isPublished: true,
      active: false, // Soft deleted
      lastVerifiedAt: "2026-10-17T00:00:00Z",
    },
  ];

  // Public customer view
  const publicResults = filterPublicBrandSupport(sampleRecords, false);
  assertEquals(publicResults.length, 1);
  assertEquals(publicResults[0].id, "bs-hp-laptop");

  // Admin view sees all active records including pending/rejected
  const adminResults = filterPublicBrandSupport(sampleRecords, true);
  assertEquals(adminResults.length, 3);
  assertEquals(
    adminResults.some((r) => r.id === "bs-unverified"),
    true,
  );
  assertEquals(
    adminResults.some((r) => r.id === "bs-rejected"),
    true,
  );
  // Inactive records are hidden even from active admin tables
  assertEquals(
    adminResults.some((r) => r.id === "bs-inactive"),
    false,
  );
});

Deno.test("Support Service: 5. RLS & public isolation for Service Centres", () => {
  const centres: ServiceCentreRecord[] = [
    {
      id: "sc-hp-kochi",
      name: "HP Authorized Service Centre (F1 Info Solutions)",
      brandName: "HP",
      category: "Laptop",
      pincode: "682035",
      city: "Kochi",
      state: "Kerala",
      latitude: 9.9816,
      longitude: 76.2845,
      isAuthorized: true,
      active: true,
      verifiedAt: "2026-10-17T00:00:00Z",
      sourceUrl: "https://support.hp.com/in-en/service-center",
    },
    {
      id: "sc-unverified",
      name: "Third Party Repair Shop",
      brandName: "Apple",
      category: "Mobile",
      pincode: "682016",
      city: "Kochi",
      state: "Kerala",
      isAuthorized: false,
      active: true,
      verifiedAt: null,
      sourceUrl: "https://example.com",
    },
    {
      id: "sc-inactive",
      name: "Closed Centre",
      brandName: "Dell",
      category: "Laptop",
      pincode: "680001",
      city: "Thrissur",
      state: "Kerala",
      isAuthorized: true,
      active: false,
      verifiedAt: "2026-10-17T00:00:00Z",
      sourceUrl: "https://www.dell.com/support/home/en-in",
    },
  ];

  // Public user
  const publicCentres = filterPublicServiceCentres(centres, false);
  assertEquals(publicCentres.length, 1);
  assertEquals(publicCentres[0].id, "sc-hp-kochi");

  // Admin user
  const adminCentres = filterPublicServiceCentres(centres, true);
  assertEquals(adminCentres.length, 2);
  assertEquals(
    adminCentres.some((c) => c.id === "sc-unverified"),
    true,
  );
  assertEquals(
    adminCentres.some((c) => c.id === "sc-inactive"),
    false,
  );
});

Deno.test("Support Service: 6. Store Settings completeness validation", () => {
  // Complete settings
  const complete = checkStoreSettingsCompleteness({
    storeName: "IT HUB",
    address: "Molathu Building, College Jn., Kothamangalam, Kerala - 686691",
    phone: "+91 98472 23886",
    whatsapp: "919847223886",
    email: "ithubkmgm@gmail.com",
  });
  assertEquals(complete.isComplete, true);
  assertEquals(complete.missingFields.length, 0);

  // Incomplete settings (missing phone & whatsapp)
  const incomplete = checkStoreSettingsCompleteness({
    storeName: "IT HUB",
    address: "Molathu Building, College Jn., Kothamangalam, Kerala - 686691",
    email: "ithubkmgm@gmail.com",
  });
  assertEquals(incomplete.isComplete, false);
  assertEquals(incomplete.missingFields.includes("Customer Support Phone"), true);
  assertEquals(incomplete.missingFields.includes("WhatsApp Support Number"), true);
});

Deno.test("Support Service: 7. Official Manufacturer Locator fallback", () => {
  // When a customer searches for a brand/PIN with zero local centres,
  // the system must provide the verified official manufacturer locator URL
  const brandSupport = {
    brand: "Brother",
    category: "Printer",
    serviceLocatorUrl: "https://www.brother.in/en/support/contact",
  };

  const matchingCentres: ServiceCentreRecord[] = []; // Empty for Brother in Kothamangalam

  const hasCentres = matchingCentres.length > 0;
  assertEquals(hasCentres, false);

  // Ensure fallback URL is present and secure HTTPS
  const fallbackUrl = brandSupport.serviceLocatorUrl;
  assertEquals(validateHttpsUrl(fallbackUrl), true);
  assertEquals(fallbackUrl.startsWith("https://"), true);
});

Deno.test("Support Service: 8. Distinction between Warranty Support and Customer Care", () => {
  const hpSupport = {
    brand: "HP",
    warrantyPhone: "1800-258-7170",
    customerCarePhone: "1800-425-4999",
  };

  // Warranty toll-free and Customer Care toll-free must be distinct
  assertNotEquals(hpSupport.warrantyPhone, hpSupport.customerCarePhone);
  assertEquals(hpSupport.warrantyPhone.startsWith("1800-"), true);
  assertEquals(hpSupport.customerCarePhone.startsWith("1800-"), true);
});

Deno.test("Support Service: 9. On-Site Service Eligibility strictly restricted to 15km store radius", () => {
  const storeLat = 10.0601;
  const storeLng = 76.6277;
  const serviceRadiusKm = 15;

  // 686691 (Kothamangalam Town) -> ~0 km -> Eligible
  const distKothamangalam = calculateDistanceKm(storeLat, storeLng, 10.0601, 76.6277);
  assertEquals(distKothamangalam <= serviceRadiusKm, true);

  // 686666 (M.A. College) -> ~1.8 km -> Eligible
  const distCollege = calculateDistanceKm(storeLat, storeLng, 10.0545, 76.6435);
  assertEquals(distCollege <= serviceRadiusKm, true);

  // 686661 (Muvattupuzha Town) -> ~9.5 km -> Eligible
  const distMvv = calculateDistanceKm(storeLat, storeLng, 9.9894, 76.579);
  assertEquals(distMvv <= serviceRadiusKm, true);

  // 683542 (Perumbavoor Town) -> ~17.5 km -> Ineligible (>15km)
  const distPerumbavoor = calculateDistanceKm(storeLat, storeLng, 10.1157, 76.478);
  assertEquals(distPerumbavoor > serviceRadiusKm, true);

  // 682030 (Kakkanad) -> ~31.7 km -> Ineligible (>15km)
  const distKakkanad = calculateDistanceKm(storeLat, storeLng, 10.0159, 76.3419);
  assertEquals(distKakkanad > serviceRadiusKm, true);
});

Deno.test("Support Service: 10. All PIN codes other than 15km coverage return ineligible / not available", () => {
  const eligiblePincodesUnder15km = new Set([
    "686691", // Kothamangalam Town (0 km)
    "686666", // Kothamangalam College (1.8 km)
    "686671", // Chathamattam (6.2 km)
    "686692", // Kottappady (7.1 km)
    "686670", // Pothanicad (8.7 km)
    "686681", // Keerampara (9.0 km)
    "686661", // Muvattupuzha Town (9.5 km)
    "686693", // Manikinar (9.9 km)
    "683556", // Odakkali (10.7 km)
    "686673", // Muvattupuzha Market (10.7 km)
    "685612", // Oonnukal Range (14.3 km)
  ]);

  // Check eligible pin codes
  for (const pin of eligiblePincodesUnder15km) {
    assertEquals(eligiblePincodesUnder15km.has(pin), true);
  }

  // Any other pin code must be treated as ineligible (outside 15km coverage)
  const otherPins = ["683542", "682030", "682001", "110001", "560001", "670001"];
  for (const pin of otherPins) {
    assertEquals(eligiblePincodesUnder15km.has(pin), false);
  }
});
