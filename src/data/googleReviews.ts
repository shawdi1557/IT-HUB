// src/data/googleReviews.ts
// IT HUB — Genuine Customer Reviews from Google Maps Listing
// Manually curated from genuine public customer review screenshots on IT HUB Kothamangalam's verified Google Maps listing:
// https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8
// Note: These reviews are curated directly from genuine customer submissions and are not an automated live API feed.

export interface GoogleCustomerReview {
  id: string;
  authorName: string;
  rating: number; // 1 to 5
  text: string;
  relativeTimeDescription: string;
  isTruncated?: boolean;
  profileUrl?: string;
}

export const GOOGLE_MAPS_REVIEW_URL = "https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8";

/**
 * Eight genuine Google customer reviews sourced from verified Google Maps screenshots.
 * Preserves exact customer display names, 5-star ratings, dates, and authentic customer wording.
 */
export const googleReviews: GoogleCustomerReview[] = [
  {
    id: "g-rev-1",
    authorName: "Sony Joseph",
    rating: 5,
    relativeTimeDescription: "3 months ago",
    text: "IT Hub IT Store provides excellent customer service and a great overall shopping experience. The staff are knowledgeable, friendly, and always ready to help with the right product recommendations. They offer genuine products at competitive prices, with smooth billing and timely delivery. Their after-sales support is also commendable, making them a reliable partner for customers. Overall, a highly recommended store for anyone looking for quality IT products and professional service.",
  },
  {
    id: "g-rev-2",
    authorName: "Narayanan Namboothiry",
    rating: 5,
    relativeTimeDescription: "2 months ago",
    text: "Fast, Reliable, and Honest Service. The team is super professional, transparent about costs, and the repair quality is top-notch. Fast turnaround and good service—definitely my go-to place for any laptop repairs now!",
  },
  {
    id: "g-rev-3",
    authorName: "Robin Aj",
    rating: 5,
    relativeTimeDescription: "1 month ago",
    text: "I purchased a 27-inch Zebronics monitor from here. I received excellent service and am very happy. For any future IT-related services or sales, I would suggest 'IT HUB' as the best choice.",
  },
  {
    id: "g-rev-4",
    authorName: "Amitha Ekram",
    rating: 5,
    relativeTimeDescription: "2 months ago",
    text: "Excellent service and very affordable. The staffs were very professional. My laptop was repaired quickly. The cost was also much lower than expected.",
  },
  {
    id: "g-rev-5",
    authorName: "Arnols Mr",
    rating: 5,
    relativeTimeDescription: "1 month ago",
    text: "I have known this shop for more than 11 years and have experienced its services throughout this time. Overall, I am satisfied with the service.",
  },
  {
    id: "g-rev-6",
    authorName: "Edwin",
    rating: 5,
    relativeTimeDescription: "5 months ago",
    text: "Recently, I had a pleasure of being their customer in getting a Mac mini which was not available in major consumer retail electronics stores near me. The overall experience was good and interaction was professional with proper knowledge transfer.",
  },
  {
    id: "g-rev-7",
    authorName: "Muhammed Yaseen",
    rating: 5,
    relativeTimeDescription: "1 year ago",
    text: "Had a really good experience at IT HUB Kothamangalam! Their prices are affordable, and the service I received was excellent. Definitely recommend them!",
  },
  {
    id: "g-rev-8",
    authorName: "Aby Varghese",
    rating: 5,
    relativeTimeDescription: "1 year ago",
    text: "I recently purchased a gaming PC for my son. The staff was very patient to explain about each and every component. They told the pros and cons of each processor we considered. The features that we might get if we choose one motherboard over another...",
    isTruncated: true,
  },
];
