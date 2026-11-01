# Mobile-First Storefront UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Overview

Transform the IT HUB storefront mobile experience into a premium, app-like technology commerce interface inspired by modern mobile shopping standards while strictly preserving IT HUB's brand identity, Shopify catalog integration, Supabase service management, and desktop layouts.

---

## File Structure & Responsibilities

| File                                                            | Responsibility                                                                                                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/MobileHeader.tsx`                               | Two-row compact sticky mobile header: Row 1 (Menu, Centered Logo, Account & Cart), Row 2 (Permanently visible full-width search input). Visible `< md`.                          |
| `src/components/MobileBottomNav.tsx`                            | Fixed 5-destination bottom navigation bar: Home, Shop, Services, Blog, Account. Route-aware active states and safe-area padding. Visible `< md`.                                 |
| `src/components/MobileNavDrawer.tsx`                            | Slide-over drawer with categorized navigation for Shopping, Services, Discover, and Account. Smooth backdrop and touch-friendly targets.                                         |
| `src/components/Layout.tsx`                                     | Integration point for MobileHeader, MobileBottomNav, MobileNavDrawer, preserving desktop `GooeyNav` and full desktop header `≥ md`. Adds bottom safe-padding to `<main>`.        |
| `src/pages/Home.tsx`                                            | Mobile-optimized section ordering: Hero -> Shop by Category (horizontal scroll) -> Featured Fresh Products -> PC Builder promo -> Services cards -> Pre-Owned -> Blog -> Footer. |
| `src/components/ProductCard.tsx`                                | Mobile touch optimization, clean price badges, stock status indicators, and overflow prevention.                                                                                 |
| `supabase/functions/tests/mobile-storefront-navigation.test.ts` | Automated test suite verifying mobile header elements, bottom nav destinations, active route mapping, and section integrity.                                                     |

---

## Tasks

### Task 1: Mobile Header & Sticky Search Bar (Phases 2 & 3)

- [ ] Create `src/components/MobileHeader.tsx`:
  - Row 1: Hamburger menu button (44px target) on left, centered IT HUB Logo, Account button & Cart button with item count pill on right.
  - Row 2: Full-width search bar with blue search icon (`#1a4fd6`), placeholder `"Search laptops, mobiles, accessories..."`, submitting to `/products?q={query}`.
  - Sticky at top (`sticky top-0 z-40 bg-white border-b border-border shadow-xs`).
  - Total vertical height kept compact (~106px).
- [ ] Wire `MobileHeader.tsx` into `src/components/Layout.tsx`:
  - Show `MobileHeader` on mobile (`md:hidden`).
  - Preserve desktop header untouched on `hidden md:block`.
- [ ] Write tests in `supabase/functions/tests/mobile-storefront-navigation.test.ts` verifying header structure and search submission.

### Task 2: Fixed 5-Item Mobile Bottom Navigation (Phase 4)

- [ ] Create `src/components/MobileBottomNav.tsx`:
  - Fixed at bottom of screen (`fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border shadow-lg md:hidden`).
  - Exactly 5 destinations:
    1. **Home** (`/`) with `Home` icon
    2. **Shop** (`/products`) with `Grid` or `ShoppingBag` icon
    3. **Services** (`/services`) with `Wrench` icon
    4. **Blog** (`/blog`) with `BookOpen` icon
    5. **Account** (`/account`) with `User` icon
  - Route-aware active state highlighting current section in `#1a4fd6`.
  - Respect mobile safe-area insets (`pb-[max(0.5rem,env(safe-area-inset-bottom))]`).
- [ ] Update `src/components/Layout.tsx`:
  - Add `pb-20 md:pb-0` to `<main>` to prevent any fixed bottom nav collision.
  - Mount `<MobileBottomNav />`.
- [ ] Add tests in `mobile-storefront-navigation.test.ts` verifying all 5 routes and active state detection.

### Task 3: Mobile Navigation Drawer (Phase 5)

- [ ] Create `src/components/MobileNavDrawer.tsx`:
  - Slides in from left with smooth Framer Motion transition and dark semi-transparent backdrop.
  - Header: Logo and close button (`X`).
  - Section 1: **Shopping** (All Products, Shop by Category, Fresh Items, Pre-owned Items, Sell Your Item, PC Builder, Find My PC).
  - Section 2: **IT HUB Services** (Book a Service, Track Service, Laptop Repair, Mobile Repair, Courier Service).
  - Section 3: **Discover** (Blog, About IT HUB, Contact Us, Help & Support).
  - Section 4: **Account** (My Profile, My Orders, Saved PC Builds, Wishlist).
  - Accessible touch targets (minimum 44px height), scrollable if content exceeds viewport.
- [ ] Connect drawer state (`mobileNavOpen`) in `Layout.tsx` triggered by `MobileHeader` hamburger.
- [ ] Add tests in `mobile-storefront-navigation.test.ts` verifying drawer links and categories.

### Task 4: Homepage Section Restructuring & Horizontal Mobile Carousels (Phase 6)

- [ ] Update `src/pages/Home.tsx`:
  - Mobile section sequence:
    1. Hero section (with `Mobile_Banner.png`, centered typography, two CTAs).
    2. Shop by Category: Horizontal scrollable cards with icons and dynamic category counts (`calculateCategoryCounts(store.products)`).
    3. Featured Fresh Products: Horizontal swipeable product carousel or responsive cards for fresh items (`filterFeaturedFreshProducts(store.products, 8)`).
    4. PC Builder / Find My PC promo: Highlighting "Build Your Perfect PC" with dual buttons for "Find My PC" (`/pc-builder?mode=smart`) and "Custom PC Builder" (`/pc-builder`).
    5. IT HUB Services: Responsive service cards for Courier, On-site, and In-Store booking.
    6. Certified Pre-Owned & Hardware Buyback banner.
    7. Latest Blog Articles: Horizontal card carousel fetching published articles via `fetchBlogArticles()`.
    8. Store & Location Footer.
  - Ensure all horizontal scroll containers have `-webkit-overflow-scrolling: touch`, `scrollbar-none`, and comfortable snap points.
- [ ] Add tests in `mobile-storefront-navigation.test.ts` verifying homepage section order and data integrity.

### Task 5: Mobile Product Card & Touch Optimization (Phase 7)

- [ ] Review and refine `src/components/ProductCard.tsx`:
  - Ensure product cards have comfortable tap targets, clear badges (`PRE-OWNED`, `Only X left!`), and readable typography.
  - Prevent horizontal text blowout on narrow screens (320px).

### Task 6: Multi-Viewport Verification & Visual Inspection (Phases 8, 9, 11)

- [ ] Run test suite: `deno test -A --no-check supabase/functions/tests/mobile-storefront-navigation.test.ts`.
- [ ] Run typecheck: `npm run typecheck`.
- [ ] Run production build: `npm run build`.
- [ ] Capture and inspect screenshots across all required viewports:
  - Mobile: 320px, 360px, 375px, 390px, 430px
  - Tablet: 768px, 1024px
  - Desktop: 1280px, 1440px, 1920px
- [ ] Visually inspect rendered outputs to confirm clean layout, zero overflow, and correct active states.
