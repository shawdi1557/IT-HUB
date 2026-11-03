// supabase/functions/tests/onsite-service-coverage.test.ts
// Comprehensive automated tests for On-Site Service Eligibility: 15 KM Radius Calculation

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  checkWarranty,
  distanceKm,
  isValidCoordinate,
  initialLocations,
  pincodeDirectory,
  type ItHubLocation,
} from "../../../src/data/catalog.ts";

import { lookupPincodeCoverage } from "../../../src/lib/pincodeLookup.ts";

Deno.test("On-Site Coverage: 1. Distance Calculation Accuracy & Haversine Formula", () => {
  const storeLat = 10.0601;
  const storeLng = 76.6277;

  // 1a. Distance from store to itself is 0
  const selfDist = distanceKm(storeLat, storeLng, storeLat, storeLng);
  assertEquals(selfDist, 0);

  // 1b. Known distance to Kochi/Ernakulam (lat: 9.9816, lng: 76.2799) is ~38-42 km
  const kochiDist = distanceKm(storeLat, storeLng, 9.9816, 76.2799);
  assertEquals(kochiDist > 35 && kochiDist < 45, true);

  // 1c. Known distance to M.A. College (lat: 10.0545, lng: 76.6435) is ~1.8 km
  const collegeDist = distanceKm(storeLat, storeLng, 10.0545, 76.6435);
  assertEquals(Math.round(collegeDist * 10) / 10, 1.8);

  // 1d. Order of arguments: (lat1, lon1, lat2, lon2) is symmetric
  const distAtoB = distanceKm(10.0601, 76.6277, 10.1132, 76.5925);
  const distBtoA = distanceKm(10.1132, 76.5925, 10.0601, 76.6277);
  assertEquals(Math.round(distAtoB * 100), Math.round(distBtoA * 100));
});

Deno.test("On-Site Coverage: 2. Incorrect Latitude/Longitude & Invalid Coordinate Protection", () => {
  // 2a. Coordinate validation utility
  assertEquals(isValidCoordinate(10.0601, 76.6277), true);
  assertEquals(isValidCoordinate(-90, 180), true);
  assertEquals(isValidCoordinate(90, -180), true);

  // Out of bounds latitude
  assertEquals(isValidCoordinate(91, 76.6277), false);
  assertEquals(isValidCoordinate(-90.1, 76.6277), false);

  // Out of bounds longitude
  assertEquals(isValidCoordinate(10.0601, 180.1), false);
  assertEquals(isValidCoordinate(10.0601, -180.5), false);

  // Non-finite values
  assertEquals(isValidCoordinate(NaN, 76.6277), false);
  assertEquals(isValidCoordinate(10.0601, Infinity), false);
  assertEquals(isValidCoordinate(undefined, 76.6277), false);
  assertEquals(isValidCoordinate(null, 76.6277), false);
  assertEquals(isValidCoordinate("10.0601", "76.6277"), false);

  // 2b. distanceKm returns NaN on invalid coordinates instead of producing silent corrupt distance
  assertEquals(Number.isNaN(distanceKm(NaN, 76.6277, 10.0601, 76.6277)), true);
  assertEquals(Number.isNaN(distanceKm(10.0601, 76.6277, 95, 76.6277)), true);
});

Deno.test("On-Site Coverage: 3. Valid PIN Within 15 KM Radius (including 686691)", () => {
  // 3a. IT HUB headquarters PIN code 686691
  const hqRes = checkWarranty("686691", initialLocations);
  assertEquals(hqRes.status, "eligible");
  if (hqRes.status === "eligible") {
    assertEquals(hqRes.distanceKm, 0);
    assertEquals(hqRes.serviceRadiusKm, 15);
    assertEquals(hqRes.pincode, "686691");
    assertStringIncludes(hqRes.area, "Kothamangalam");
    assertEquals(hqRes.location.name, "IT HUB Kothamangalam (Headquarters)");
  }

  // 3b. M.A. College campus 686666 (~1.8 km)
  const collegeRes = checkWarranty("686666", initialLocations);
  assertEquals(collegeRes.status, "eligible");
  if (collegeRes.status === "eligible") {
    assertEquals(collegeRes.distanceKm <= 15, true);
    assertEquals(collegeRes.distanceKm, 1.8);
  }

  // 3c. Kottappady 686692 (~7.1 km)
  const kottappadyRes = checkWarranty("686692", initialLocations);
  assertEquals(kottappadyRes.status, "eligible");
  if (kottappadyRes.status === "eligible") {
    assertEquals(kottappadyRes.distanceKm <= 15, true);
    assertEquals(kottappadyRes.distanceKm, 7.1);
  }

  // 3d. Keerampara 686681 (~9.0 km)
  const keeramparaRes = checkWarranty("686681", initialLocations);
  assertEquals(keeramparaRes.status, "eligible");
  if (keeramparaRes.status === "eligible") {
    assertEquals(keeramparaRes.distanceKm <= 15, true);
    assertEquals(keeramparaRes.distanceKm, 9.0);
  }

  // 3e. Muvattupuzha Town 686661 (~9.5 km)
  const mvvRes = checkWarranty("686661", initialLocations);
  assertEquals(mvvRes.status, "eligible");
  if (mvvRes.status === "eligible") {
    assertEquals(mvvRes.distanceKm <= 15, true);
    assertEquals(mvvRes.distanceKm, 9.5);
  }
});

Deno.test("On-Site Coverage: 4. Valid PIN Outside 15 KM Radius", () => {
  // 4a. Perumbavoor Town 683542 (~17.5 km)
  const perumbavoorRes = checkWarranty("683542", initialLocations);
  assertEquals(perumbavoorRes.status, "ineligible");
  if (perumbavoorRes.status === "ineligible") {
    assertEquals(perumbavoorRes.distanceKm > 15, true);
    assertEquals(perumbavoorRes.distanceKm, 17.5);
    assertEquals(perumbavoorRes.serviceRadiusKm, 15);
  }

  // 4b. Kakkanad / Infopark 682030 (~31.7 km)
  const kakkanadRes = checkWarranty("682030", initialLocations);
  assertEquals(kakkanadRes.status, "ineligible");
  if (kakkanadRes.status === "ineligible") {
    assertEquals(kakkanadRes.distanceKm > 15, true);
    assertEquals(kakkanadRes.distanceKm, 31.7);
  }

  // 4c. Ernakulam M.G. Road 682016 (~39.0 km)
  const ernakulamRes = checkWarranty("682016", initialLocations);
  assertEquals(ernakulamRes.status, "ineligible");
  if (ernakulamRes.status === "ineligible") {
    assertEquals(ernakulamRes.distanceKm > 15, true);
  }

  // 4d. Thiruvananthapuram 695001 (>200 km)
  const tvmRes = checkWarranty("695001", initialLocations);
  assertEquals(tvmRes.status, "ineligible");
});

Deno.test("On-Site Coverage: 5. Exactly 15 KM Boundary Condition", () => {
  // 1 degree latitude is ~111 km. 15 km is approximately 15 / 111.1949 = 0.134900 degrees latitude.
  const storeLat = 10.0601;
  const storeLng = 76.6277;

  // Let's create a custom store and test points right at the 15.0 km boundary
  const customStore: ItHubLocation[] = [
    {
      id: "test-hub",
      name: "Test IT HUB",
      address: "College Junction",
      pincode: "686691",
      latitude: storeLat,
      longitude: storeLng,
      serviceRadiusKm: 15,
      active: true,
    },
  ];

  // Point at exactly 15.00 km (North):
  // distanceKm(10.0601, 76.6277, 10.0601 + 0.134897, 76.6277)
  const dExact = distanceKm(storeLat, storeLng, storeLat + 0.134897, storeLng);
  const roundedExact = Math.round(dExact * 10) / 10;
  assertEquals(roundedExact, 15.0);
  assertEquals(roundedExact <= 15.0, true);

  // Point slightly beyond boundary (~15.2 km)
  const dBeyond = distanceKm(storeLat, storeLng, storeLat + 0.137, storeLng);
  const roundedBeyond = Math.round(dBeyond * 10) / 10;
  assertEquals(roundedBeyond > 15.0, true);
});

Deno.test("On-Site Coverage: 6. Invalid PIN Code Rejection", () => {
  // Letters or symbols
  assertEquals(checkWarranty("ABCDEF").status, "invalid");
  assertEquals(checkWarranty("68669A").status, "invalid");
  assertEquals(checkWarranty("686-69").status, "invalid");

  // Fewer than 6 digits
  assertEquals(checkWarranty("68669").status, "invalid");
  assertEquals(checkWarranty("1").status, "invalid");
  assertEquals(checkWarranty("").status, "invalid");

  // More than 6 digits
  assertEquals(checkWarranty("6866910").status, "invalid");

  // Indian PIN codes cannot start with 0
  assertEquals(checkWarranty("012345").status, "invalid");
});

Deno.test("On-Site Coverage: 7. Missing Geocoding Coordinates Returns 'unknown' (Never Falsely Ineligible)", () => {
  // A 6-digit PIN not present in the local directory (e.g. 999999)
  const unknownRes = checkWarranty("999999", initialLocations);
  assertEquals(unknownRes.status, "unknown");
  if (unknownRes.status === "unknown") {
    assertEquals(unknownRes.pincode, "999999");
    assertEquals(unknownRes.reason, "centroid_not_found");
  }

  // Passing corrupted locations with missing/invalid coordinates
  const corruptedStore: ItHubLocation[] = [
    {
      id: "corrupted",
      name: "Corrupted Store",
      address: "Nowhere",
      pincode: "686691",
      latitude: NaN,
      longitude: NaN,
      serviceRadiusKm: 15,
      active: true,
    },
  ];

  // Even with a valid PIN, invalid store coordinates must yield "unknown", NOT "ineligible"
  const corruptedRes = checkWarranty("686691", corruptedStore);
  assertEquals(corruptedRes.status, "unknown");
  if (corruptedRes.status === "unknown") {
    assertEquals(corruptedRes.reason, "no_valid_store_coordinates");
  }
});

Deno.test("On-Site Coverage: 8. Store Configuration Retrieval & Radius Capping Policy", () => {
  // Even if database has service_radius_km: 30, policy strictly caps at 15 km
  const storeWith30km: ItHubLocation[] = [
    {
      id: "test-hub",
      name: "IT HUB Kothamangalam",
      address: "College Junction",
      pincode: "686691",
      latitude: 10.0601,
      longitude: 76.6277,
      serviceRadiusKm: 30, // attempted expansion
      active: true,
    },
  ];

  // 683542 (Perumbavoor) is 17.5 km away. If 30km were allowed, it would be eligible.
  // With 15km capping, it MUST remain ineligible!
  const res = checkWarranty("683542", storeWith30km);
  assertEquals(res.status, "ineligible");
  if (res.status === "ineligible") {
    assertEquals(res.serviceRadiusKm, 15); // Capped at 15
    assertEquals(res.distanceKm, 17.5);
  }

  // When locations array is empty, checkWarranty safely falls back to initialLocations
  const emptyLocationsRes = checkWarranty("686691", []);
  assertEquals(emptyLocationsRes.status, "eligible");

  // When location has active: undefined (e.g. un-sanitized sync), it is safely treated as active
  const unmappedActiveStore: any[] = [
    {
      id: "kothamangalam",
      name: "IT HUB Kothamangalam",
      address: "College Junction",
      pincode: "686691",
      latitude: 10.0601,
      longitude: 76.6277,
      serviceRadiusKm: 15,
      // active is omitted/undefined
    },
  ];
  const resUnmapped = checkWarranty("686691", unmappedActiveStore as any);
  assertEquals(resUnmapped.status, "eligible");
});

Deno.test("On-Site Coverage: 9. Async Geocoding Lookup Service & Error Handling", async () => {
  // 9a. Known local PIN resolves immediately through lookupPincodeCoverage
  const localRes = await lookupPincodeCoverage("686691", initialLocations, { skipRemote: true });
  assertEquals(localRes.status, "eligible");
  if (localRes.status === "eligible") {
    assertEquals(localRes.distanceKm, 0);
  }

  // 9b. Unknown PIN with skipRemote returns "unknown"
  const unverifiedRes = await lookupPincodeCoverage("999999", initialLocations, {
    skipRemote: true,
  });
  assertEquals(unverifiedRes.status, "unknown");
  if (unverifiedRes.status === "unknown") {
    assertEquals(unverifiedRes.pincode, "999999");
  }

  // 9c. Invalid PIN returns "invalid"
  const invalidRes = await lookupPincodeCoverage("123", initialLocations, { skipRemote: true });
  assertEquals(invalidRes.status, "invalid");

  // 9d. Timeout simulation gracefully returns "unknown" without throwing
  const timeoutRes = await lookupPincodeCoverage("999999", initialLocations, {
    timeoutMs: 1, // trigger instant timeout
  });
  assertEquals(timeoutRes.status, "unknown");
});
