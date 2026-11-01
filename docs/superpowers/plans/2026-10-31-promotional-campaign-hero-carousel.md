# IT HUB — Admin-Managed Promotional Hero Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade, admin-managed Promotional Campaign Carousel integrated into the Homepage Hero section (`/`), backed by a new `promotional_campaigns` Supabase table and storage bucket, administered via the Staff Portal (`/content`), featuring React Bits odometer countdown timers, Shopify product/service destination routing, and Supabase Realtime synchronization.

**Architecture:**

- Supabase PostgreSQL: `promotional_campaigns` table with RLS, check constraints, ordering, scheduling, and `supabase_realtime` publication.
- Supabase Storage: `promotional-banners` public bucket for banner image uploads with staff-only write policies.
- Staff Portal (`ITHUB_ADMIN`): Full Campaign Manager in `WebsiteContent.tsx` with searchable Shopify product selector, service destination picker, image uploader, scheduling, display ordering, and audit logging.
- Storefront (`ITHUB_WEB`): `PromotionalHeroCarousel.tsx` integrated directly into Homepage Hero (`src/pages/Home.tsx`), featuring smooth rotation, touch/swipe gestures, fallback for zero/single campaigns, React Bits `Counter` digit animations, and realtime state updates via `contentSync.ts`.
- Shopify Catalog: Authoritative source for product IDs, handles, and validation.

**Tech Stack:** React 19, TypeScript 5.7, Vite 8, Tailwind CSS v4, Motion (Framer Motion), Supabase PostgreSQL + Storage + Realtime.

**Spec:** User specification prompt (Revise Promotional Campaign Manager implementation scope — Homepage Hero Integration).

## Global Constraints

- Promotional banners appear ONLY in the main homepage Hero section (`/`).
- Do NOT add promotional carousels to `/products` or `/services`.
- Preserve the existing IT HUB hero design, `Mobile_Banner.png`, headings, descriptions, and two CTAs (`Shop Products` and `Explore Services`).
- Do NOT modify Shopify product pricing, inventory, cart, or checkout.
- Do NOT modify service booking logic, quotation approval, or payment workflows.
- Local environment only; no production Supabase edits or deployments.

## Review Focus

1. **Zero / Single Campaign Resilience:** When no campaigns are published, the Homepage Hero renders cleanly without empty containers or layout shifts. When only one campaign is published, rotation controls are suppressed.
2. **Expired Campaign Ejection:** When a campaign's `ends_at` timestamp passes, it must immediately be excluded from public display both server-side (RLS) and client-side (real-time countdown zero check).
3. **Product Destination Accuracy:** Product destinations must validate against live Shopify handles and route directly to `/products/:handle`.
4. **Realtime Updates Without Full Reload:** Publishing, pausing, or updating a campaign in the Staff Portal reflects on the Homepage Hero in real-time without full browser reloads.
5. **Accessibility & Reduced Motion:** Touch swipes on mobile, pause on hover/focus, and `prefers-reduced-motion` compliance across carousel transitions and Counter rolls.

---

### Task 1: Database Schema, Storage, RLS & Realtime

**Files:**

- Create: `supabase/migrations/20261031000005_promotional_campaigns.sql`
- Modify: `supabase/schema.sql`
- Test: `supabase/functions/tests/promotional-campaigns-and-hero-carousel.test.ts`

- [ ] Write migration `20261031000005_promotional_campaigns.sql`:
  - Create table `public.promotional_campaigns` with fields: `id`, `title`, `description`, `badge`, `image_url`, `mobile_image_url`, `destination_type`, `destination_ref`, `destination_url`, `cta_label`, `starts_at`, `ends_at`, `show_countdown`, `countdown_heading`, `status`, `display_order`, `created_at`, `updated_at`, `created_by`.
  - Add check constraints: `destination_type IN ('product', 'category', 'service', 'url')`, `status IN ('draft', 'scheduled', 'published', 'paused', 'expired', 'archived')`.
  - Add indexes on `status`, `starts_at`, `ends_at`, `display_order`.
  - Enable RLS: public read for published & unexpired campaigns (or staff); staff-only insert/update/delete.
  - Set replica identity full and register in `supabase_realtime` publication.
  - Add `'promotional_campaign'` to `staff_audit_logs_entity_type_check`.
  - Create storage bucket `promotional-banners` with public read and staff write policies.
- [ ] Apply migration locally to Supabase Postgres (`127.0.0.1:54322`).
- [ ] Update `supabase/schema.sql` to match.
- [ ] Write automated tests in `supabase/functions/tests/promotional-campaigns-and-hero-carousel.test.ts` verifying table schema, constraints, RLS, and storage bucket configuration.
- [ ] Run tests with Deno to verify Task 1.

---

### Task 2: React Bits Odometer Counter & Countdown Engine

**Files:**

- Create: `src/components/Counter.tsx`
- Create: `src/components/Counter.css`
- Create: `src/lib/countdown.ts`
- Test: `supabase/functions/tests/promotional-campaigns-and-hero-carousel.test.ts`

- [ ] Create `src/components/Counter.tsx` and `src/components/Counter.css`:
  - Implement vertical digit column strip (`0-9`) with CSS translateY transitions.
  - Handle tabular width, non-digit characters, accessibility (`aria-hidden` on columns, screen-reader text).
  - Respect `prefers-reduced-motion` with instant transitions.
- [ ] Create `src/lib/countdown.ts`:
  - Function `calculateTimeRemaining(targetIso: string)` returning `{ days, hours, minutes, seconds, isExpired, totalSeconds }`.
  - Format with zero-padding.
  - Handle invalid dates, past dates, and tab visibility updates.
- [ ] Add unit tests in `promotional-campaigns-and-hero-carousel.test.ts` testing countdown calculation, boundary conditions, and Counter rendering logic.
- [ ] Run tests to verify Task 2.

---

### Task 3: Storefront State & Realtime Content Sync Extension

**Files:**

- Modify: `src/lib/realtime/contentSync.ts`
- Modify: `src/app/store.tsx`
- Test: `supabase/functions/tests/promotional-campaigns-and-hero-carousel.test.ts`

- [ ] Define `PromotionalCampaign` type in `src/app/store.tsx` and `contentSync.ts`.
- [ ] Extend `ContentSyncManager` in `src/lib/realtime/contentSync.ts`:
  - Add `syncPromotionalCampaigns()` method querying `promotional_campaigns` table (`status = 'published'`, ordered by `display_order asc, created_at desc`).
  - Add `handleCampaignChange(payload)` handling `INSERT`, `UPDATE`, `DELETE` events.
  - Register listener in `start()` on table `promotional_campaigns`.
  - Include in initial reconciliation `reconcileAll()`.
- [ ] Add `promotionalCampaigns: PromotionalCampaign[]` state to `src/app/store.tsx`.
- [ ] Add tests in `promotional-campaigns-and-hero-carousel.test.ts` verifying realtime payload handling and in-memory updates.
- [ ] Run tests to verify Task 3.

---

### Task 4: Promotional Hero Carousel Component & Homepage Hero Integration

**Files:**

- Create: `src/components/PromotionalHeroCarousel.tsx`
- Modify: `src/pages/Home.tsx`
- Test: `supabase/functions/tests/promotional-campaigns-and-hero-carousel.test.ts`

- [ ] Implement `src/components/PromotionalHeroCarousel.tsx`:
  - Props: `campaigns: PromotionalCampaign[]`.
  - If 0 campaigns: returns `null` (zero visual footprint).
  - If 1 campaign: renders single banner without pagination/arrows.
  - If multiple campaigns: automatic rotation every 6 seconds, pause on hover/focus, previous/next controls, dot indicators, touch swipe gestures (drag/touch handlers).
  - Display: uploaded image, badge, title, description, optional countdown timer with `Counter`, CTA button.
  - Click handling: navigates cleanly to `campaign.destination_url`.
  - Responsive sizing: mobile-optimized layout using `mobile_image_url` if provided, tablet, and desktop viewports.
- [ ] Integrate into `src/pages/Home.tsx`:
  - Place below the hero heading & CTAs, within the Hero container.
  - Retain existing `heroBanner`, `mobileHeroBanner`, "Everything Tech" headline, and CTAs.
  - Remove obsolete single-announcement banner strip if replaced by the promotional carousel.
- [ ] Add tests in `promotional-campaigns-and-hero-carousel.test.ts` verifying carousel component properties, single/multi/empty states, and destination clicks.
- [ ] Run tests to verify Task 4.

---

### Task 5: Staff Portal Campaign Management UI (`ITHUB_ADMIN`)

**Files:**

- Modify: `ITHUB_ADMIN/src/pages/WebsiteContent.tsx`
- Test: `supabase/functions/tests/promotional-campaigns-and-hero-carousel.test.ts`

- [ ] Redesign `/content` in `ITHUB_ADMIN/src/pages/WebsiteContent.tsx`:
  - Keep Website Showcase Gallery tab.
  - Replace legacy announcement editor with **Promotional Campaign Manager**:
    - Campaign list table/cards with banner thumbnail, title, badge, destination, schedule, status badge, display order, and action menu.
    - Status filters (`All`, `Published`, `Scheduled`, `Draft`, `Paused`, `Expired`).
    - Campaign Editor Modal:
      - Title, supporting description, badge (predefined suggestions + custom).
      - Image upload with Supabase Storage upload to `promotional-banners`, file validation (JPEG, PNG, WebP up to 5MB), preview, replace.
      - Optional mobile image upload.
      - Destination selector:
        - Mode: `Shopify Product` | `Category` | `Service` | `Custom URL`.
        - Searchable Shopify product selector (loads active products, sets canonical handle and URL).
        - Service route selector (`Laptop Repair`, `Mobile Repair`, `On-site Technician`, `Book Service`).
        - URL validation against internal routes.
      - Schedule: Start Date/Time and Expiry Date/Time (local IST picker, UTC storage).
      - Countdown toggle and heading.
      - Display order and status selection.
    - Quick actions: Publish/Pause toggle, Edit, Duplicate, Delete (with confirmation dialog).
    - Audit logging to `staff_audit_logs`.
- [ ] Add tests for Staff Portal campaign creation, editing, status change, and audit logging.
- [ ] Run tests to verify Task 5.

---

### Task 6: Full Verification, Regression Suite & Documentation

**Files:**

- Create: `IT_HUB_PROMOTIONAL_HERO_CAROUSEL_IMPLEMENTATION_REPORT.md`
- Create/Update: `task.md`

- [ ] Run storefront typecheck: `npm run typecheck`
- [ ] Run storefront production build: `npm run build`
- [ ] Run Staff Portal typecheck: `npm --prefix ITHUB_ADMIN run typecheck`
- [ ] Run Staff Portal production build: `npm --prefix ITHUB_ADMIN run build`
- [ ] Run all automated tests: `npm test` (ensuring all existing 645+ tests pass alongside new tests)
- [ ] Verify live endpoints on `http://localhost:8443` (Storefront) and `http://localhost:5174` (Staff Portal)
- [ ] Create `task.md` detailing all milestones and project completion percentage.
- [ ] Generate comprehensive implementation report `IT_HUB_PROMOTIONAL_HERO_CAROUSEL_IMPLEMENTATION_REPORT.md`.
