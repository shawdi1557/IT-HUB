# Staff Portal to Customer Storefront Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Staff Portal from isolated client-side/localStorage UI controls into an authoritative administrative control plane that genuinely persists and reflects changes across the Customer Storefront for Certificates & Partnerships, Website Content, and Store Settings.

**Architecture:**

- **Database Layer:** Add `public.partner_certificates` and `public.website_showcase` tables in Supabase with RLS policies, and expand `public.store_settings` with authoritative store profile, contact, hours, and WhatsApp fields.
- **Staff Portal (`ITHUB_ADMIN`):** Replace disconnected `localStorage["ithub-store-v2"]` persistence with Supabase CRUD queries (`partner_certificates`, `website_showcase`, `store_settings`, `announcements`) with audit logging and offline fallback.
- **Customer Storefront (`src/`):** Hydrate certificates, showcase gallery, and store settings directly from Supabase tables (`partner_certificates`, `website_showcase`, `store_settings`) with Realtime cache updates and graceful static fallbacks.
- **Security & RBAC:** Enforce `is_staff()` and `portal_admin` RLS write policies; keep public secrets (Shopify, Razorpay) strictly hidden and server-managed.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Supabase (PostgreSQL 15 + PostgREST + Realtime), TypeScript 5.7, Deno Test Runner.

---

## Global Constraints

- Local development only; no remote production deployments.
- Strictly preserve Intel and IGGIS distinct image mappings (SHA-256 integrity).
- Never overwrite, delete, or bypass Shopify's authoritative CMS ownership of the Blog.
- Never expose environment secrets (Shopify private credentials, Razorpay Key Secret, Supabase service-role keys) in settings forms.
- Maintain backwards compatibility: offline or network failures must gracefully fall back to static constants without crashing the app.

---

### Task 1: Database Migration for Certificates, Showcase, and Store Settings

**Files:**

- Create: `supabase/migrations/20261031000002_staff_portal_storefront_integration.sql`
- Modify: `supabase/schema.sql`
- Test: `supabase/functions/tests/staff-storefront-integration.test.ts`

**Steps:**

- [ ] Create `public.partner_certificates` table with RLS (`select` for public when `is_published = true`, `all` for staff) and seed the 6 canonical partners.
- [ ] Create `public.website_showcase` table with RLS (`select` for public when `is_active = true`, `all` for staff) and seed the 10 showroom showcase items.
- [ ] Enhance `public.store_settings` with `hours`, `tagline`, `whatsapp_default_msg`, `city`, `pincode`, `service_radius_km`, `analytics_enabled`, `mask_visitor_ip`, and add staff update RLS policy.
- [ ] Add staff update RLS policy for `public.it_hub_locations`.
- [ ] Run `supabase migration up` to apply to local PostgreSQL database.
- [ ] Synchronize `supabase/schema.sql` with new tables and policies.
- [ ] Run `npm run verify:migrations` to ensure migration integrity.

---

### Task 2: Staff Portal Certificates Management & Storefront Integration

**Files:**

- Modify: `ITHUB_ADMIN/src/pages/Certificates.tsx`
- Modify: `src/pages/Information.tsx`
- Modify: `src/app/store.tsx`
- Modify: `src/data/catalog.ts`
- Test: `supabase/functions/tests/staff-storefront-integration.test.ts`

**Steps:**

- [ ] Update `ITHUB_ADMIN/src/pages/Certificates.tsx` to fetch certificates from `partner_certificates` on mount.
- [ ] Update `handleSaveCertificate` in `Certificates.tsx` to insert or update `partner_certificates` in Supabase.
- [ ] Update `handleDelete` in `Certificates.tsx` to delete from `partner_certificates` in Supabase.
- [ ] Update `handleResetDefaults` in `Certificates.tsx` to re-seed canonical partners in `partner_certificates`.
- [ ] Update `src/app/store.tsx` and `src/pages/Information.tsx` to fetch active certificates from `partner_certificates` on mount and subscribe to Realtime updates.
- [ ] Ensure deleted certificates in Staff Portal immediately disappear from the Customer Storefront.

---

### Task 3: Website Content Showcase Integration & Blog CMS Protection

**Files:**

- Modify: `ITHUB_ADMIN/src/pages/WebsiteContent.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/app/store.tsx`
- Test: `supabase/functions/tests/staff-storefront-integration.test.ts`

**Steps:**

- [ ] Update `ITHUB_ADMIN/src/pages/WebsiteContent.tsx` to fetch showcase items from `website_showcase` on mount.
- [ ] Update `handleSaveCaption`, upload, and delete functions in `WebsiteContent.tsx` to persist to `website_showcase` in Supabase.
- [ ] Update `src/pages/Home.tsx` to fetch active showcase items from `website_showcase` in Supabase.
- [ ] Verify that Shopify Blog CMS link in Staff Portal is clearly designated as managed via Shopify Storefront API and cannot be corrupted.

---

### Task 4: Store Settings Full Persistence & Realtime Storefront Hydration

**Files:**

- Modify: `ITHUB_ADMIN/src/pages/Settings.tsx`
- Modify: `src/app/store.tsx`
- Modify: `src/pages/Support.tsx`
- Modify: `src/pages/Information.tsx`
- Test: `supabase/functions/tests/staff-storefront-integration.test.ts`

**Steps:**

- [ ] Update `ITHUB_ADMIN/src/pages/Settings.tsx` to load all store settings (`store_name`, `address`, `phone`, `email`, `whatsapp_number`, `hours`, `tagline`, fees) from `public.store_settings`.
- [ ] Update `handleSave` in `Settings.tsx` to persist all fields to `store_settings` and sync `it_hub_locations`.
- [ ] Mark read-only server configurations (API secrets, database credentials) with explicit security notices.
- [ ] Update `src/app/store.tsx` to fetch `store_settings` on startup and subscribe to Realtime changes, automatically updating `Support.tsx` and `Information.tsx`.

---

### Task 5: Automated Integration Test Suite & Verification

**Files:**

- Create: `supabase/functions/tests/staff-storefront-integration.test.ts`
- Run: `npm test`
- Run: `npm run test:portal`
- Run: `npm run typecheck` & `npm run portal:typecheck`
- Run: `npm run build` & `npm run portal:build`

**Steps:**

- [ ] Write 10+ integration tests verifying database persistence, deletion reflection, RLS security, and fallback mechanisms.
- [ ] Run full test suite and confirm 0 failures.
- [ ] Verify both production builds and running dev servers on ports 8443 and 5174.

---

### Task 6: Final Deliverable Report

**Files:**

- Create: `IT_HUB_ADMIN_STOREFRONT_INTEGRATION_AUDIT_REPORT.md`

**Steps:**

- [ ] Document architecture findings, root cause analysis, migration details, cache invalidation, security verification, and test outputs.
