// src/lib/builder/listing-readiness.ts
// Stage 3 Phase 4 (P4-6): whether a Shopify listing is an approved real product, under the owner's decisions of
// 13 November 2026:
//   U1: a listing is real only when it carries the approved tag; anything untagged is not approved.
//   U4: "[TEST]" in its title marks a listing as test, as the test tag does.
// A listing marked test is test even if it also carries the approved tag.
//
// Not used by the site yet: how the site knows it's the production site (U2) is undecided, and until then every
// PC listing is treated as test data (contract §4.2). Import-free.

export const APPROVED_LISTING_TAG = "it-hub-approved";
export const TEST_LISTING_TAG = "it-hub-test";

export type ListingReadiness = "approved" | "test" | "not_approved";

const tagSet = (tags: readonly unknown[] | undefined) =>
  new Set(
    (tags ?? [])
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim().toLowerCase()),
  );

export function listingReadiness(listing: {
  name?: string | null;
  title?: string | null;
  tags?: readonly unknown[];
}): ListingReadiness {
  const tags = tagSet(listing.tags);
  const title = `${listing.title ?? ""} ${listing.name ?? ""}`;
  if (tags.has(TEST_LISTING_TAG) || /\[\s*test\s*\]/i.test(title)) return "test";
  return tags.has(APPROVED_LISTING_TAG) ? "approved" : "not_approved";
}

/** Whether production may offer a listing: only an approved real one (U1). */
export const offeredInProduction = (readiness: ListingReadiness) => readiness === "approved";
