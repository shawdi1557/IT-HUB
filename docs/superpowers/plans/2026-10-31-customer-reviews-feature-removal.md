# Customer Reviews Feature Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely remove first-party customer review interfaces from the storefront and staff portal while strictly preserving Google Maps business ratings (4.8/5) and all product catalog, account, and database records.

**Architecture:** Remove customer review UI elements, forms, and tabs from `src/pages/Products.tsx` and `src/components/ProductCard.tsx`. Delete the isolated `PeekRating` component and uninstall unused Hugeicons packages. Remove the Staff Portal customer reviews navigation and route (redirecting to dashboard) in `ITHUB_ADMIN`. Retain backend tables and historical customer review records intact.

**Tech Stack:** React 19, TypeScript 5.7, Vite 8, Tailwind CSS v4, Lucide React, Supabase JS, Deno Test Suite.

**Spec:** Local prompt instructions for "IT HUB — Complete Customer Reviews Feature Removal".

## Global Constraints

- Local development only; no production deployments or external git pushes.
- Do NOT drop `public.reviews` or delete historical review records from the database.
- Do NOT modify or remove the Google Maps 4.8/5 business rating on the Homepage Hero or About page.
- Do NOT remove shared dependencies without verifying they are unused across the entire codebase.
- Preserve all ecommerce, cart, checkout, PC builder, service management, and sell request workflows.
- Retain existing navigation and layout balance without blank spaces or broken routes.

## Review Focus

1. **Google Maps Rating Persistence:** Homepage Hero and About page must continue displaying the 4.8 rating linking to `https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8`.
2. **Product Detail Page Layout:** Description section must render cleanly without empty tabs, broken spacing, or lingering review buttons.
3. **Staff Portal Navigation & Routing:** `/reviews` route must gracefully redirect to `/`, and sidebar navigation must remain aligned without gaps.
4. **Dependency Tree Integrity:** Only unused Hugeicons packages (`@hugeicons/react`, `@hugeicons/core-free-icons`) are removed; Lucide React and other shared libraries remain untouched.
5. **No Broken Tests:** All existing 610+ tests and new review-removal verification tests must pass without failure.

---

### Task 1: Storefront Customer Reviews Removal in `Products.tsx` and `ProductCard.tsx`

**Files:**

- Modify: `src/pages/Products.tsx`
- Modify: `src/components/ProductCard.tsx`
- Modify: `src/data/catalog.ts`
- Modify: `src/data/admin.ts`
- Test: `supabase/functions/tests/google-rating-and-review-removal.test.ts`

**Steps:**

- [ ] Remove `CustomerReview` interface, `reviews` state, `showReviewForm` state, review form inputs state, and localStorage review loader/saver in `src/pages/Products.tsx`.
- [ ] Remove the product header average rating / review count button (`onClick={() => setTab("Reviews")}`) in `src/pages/Products.tsx`.
- [ ] Simplify the Description tab container in `src/pages/Products.tsx` to render the Product Description cleanly without a multi-tab bar or empty space.
- [ ] Remove the entire `tab === "Reviews"` panel containing review cards, summary, and submission form in `src/pages/Products.tsx`.
- [ ] Remove `Demo rating` display in `src/components/ProductCard.tsx`.
- [ ] Remove legacy `{ name: "Reviews", section: "reviews" }` from `src/data/catalog.ts` and `reviews` from `src/data/admin.ts`.
- [ ] Run `npm run typecheck` to verify no lingering references.

---

### Task 2: PeekRating Component and Unused Hugeicons Cleanup

**Files:**

- Delete: `src/components/reviews/PeekRating.tsx`
- Delete: `src/components/reviews/PeekRating.css`
- Delete: `scratch/PeekRating.jsx` and `scratch/PeekRating.css`
- Modify: `package.json`
- Test: `supabase/functions/tests/google-rating-and-review-removal.test.ts`

**Steps:**

- [ ] Verify no other file in `src/` or `ITHUB_ADMIN/` imports `PeekRating` or `@hugeicons`.
- [ ] Delete `src/components/reviews/PeekRating.tsx`, `src/components/reviews/PeekRating.css`, and directory `src/components/reviews`.
- [ ] Uninstall `@hugeicons/react` and `@hugeicons/core-free-icons` via `npm uninstall @hugeicons/react @hugeicons/core-free-icons`.
- [ ] Delete temporary scratch files `scratch/PeekRating.jsx` and `scratch/PeekRating.css`.
- [ ] Run `npm run typecheck` and `npm run build` to confirm clean compilation.

---

### Task 3: Staff Portal Customer Reviews Module Removal

**Files:**

- Modify: `ITHUB_ADMIN/src/components/Layout.tsx`
- Modify: `ITHUB_ADMIN/src/App.tsx`
- Modify: `ITHUB_ADMIN/src/lib/uiHelpers.ts`
- Delete: `ITHUB_ADMIN/src/pages/Reviews.tsx`
- Delete: `ITHUB_ADMIN/src/lib/reviews.ts`
- Test: `supabase/functions/tests/staff-portal-responsive-ui.test.ts`

**Steps:**

- [ ] Remove Customer Reviews navigation entry and unused `Star` icon in `ITHUB_ADMIN/src/components/Layout.tsx`.
- [ ] Update `ITHUB_ADMIN/src/App.tsx` to replace the `/reviews` route with `<Navigate to="/" replace />` and remove `Reviews` import.
- [ ] Remove `case "/reviews":` from `getPageTitle` in `ITHUB_ADMIN/src/lib/uiHelpers.ts`.
- [ ] Delete `ITHUB_ADMIN/src/pages/Reviews.tsx` and `ITHUB_ADMIN/src/lib/reviews.ts`.
- [ ] Update test `UI-1` in `supabase/functions/tests/staff-portal-responsive-ui.test.ts` to expect `"Staff Portal"` for `/reviews`.
- [ ] Run `npm run portal:typecheck` and `npm run portal:build` to confirm clean compilation.

---

### Task 4: Automated Testing & Verification Suite Update

**Files:**

- Rename / Update: `supabase/functions/tests/google-rating-and-peekrating.test.ts` -> `supabase/functions/tests/google-rating-and-review-removal.test.ts`
- Test: `npm test`, `npm run test:portal`

**Steps:**

- [ ] Preserve `RATE-1`, `RATE-2`, `RATE-3`, `RATE-4` ensuring Google Maps rating on Homepage Hero and About page remains functional and links to verified URL.
- [ ] Replace `PEEK-1..3` with tests verifying:
  - `NO-REV-1`: Product detail page has no Reviews tab or Write a Review button.
  - `NO-REV-2`: Product detail page does not import PeekRating.
  - `NO-REV-3`: PeekRating files are removed.
  - `NO-REV-4`: Package.json has no Hugeicons dependencies.
  - `NO-REV-5`: Staff Portal Layout navigation does not contain `/reviews` Customer Reviews item.
  - `NO-REV-6`: Staff Portal router redirects `/reviews` to `/`.
- [ ] Run `npm test` and `npm run test:portal` to ensure all tests pass.

---

### Task 5: Browser Verification, Final Audit & Documentation

**Files:**

- Create: `IT_HUB_CUSTOMER_REVIEWS_FEATURE_REMOVAL_REPORT.md`
- Update: Artifact `task.md`

**Steps:**

- [ ] Verify Storefront Product page and Staff Portal in browser.
- [ ] Confirm Homepage Hero and About page Google Maps ratings look crisp and link correctly.
- [ ] Run full regression suite (`npm test`, `npm run test:portal`, `npm run typecheck`, `npm run portal:typecheck`, `npm run build`, `npm run portal:build`).
- [ ] Write `IT_HUB_CUSTOMER_REVIEWS_FEATURE_REMOVAL_REPORT.md` covering all 13 required sections.
