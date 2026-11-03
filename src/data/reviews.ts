// src/data/reviews.ts
// IT HUB — Google Maps Customer Reviews Data Architecture
// Re-exports genuine customer reviews from googleReviews.ts

export * from "./googleReviews";
export { googleReviews as curatedGoogleReviews } from "./googleReviews";
