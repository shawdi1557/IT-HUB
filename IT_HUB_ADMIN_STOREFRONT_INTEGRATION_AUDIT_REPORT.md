# IT HUB — Staff Portal to Customer Storefront Integration Audit & Fix Report

**Date:** October 31, 2026  
**Environment:** Local Development Only  
**Scope:** Staff Portal (`ITHUB_ADMIN`, `http://localhost:5174`), Customer Storefront (`http://localhost:8443`), Supabase PostgreSQL Engine (`http://127.0.0.1:54321`)  
**Status:** Completed, Verified & Passing

---

## 1. Executive Summary & Original Architecture Findings

Prior to this integration overhaul, administrative actions performed inside the Staff Portal (`http://localhost:5174`) functioned in isolation from the Customer Storefront (`http://localhost:8443`).

### Original Architecture Audit & Trace

Tracing the data flow across the three target modules revealed the systemic disconnect:

```
[Staff Portal: localhost:5174] ──> React State ──> localStorage ("ithub-store-v2" on port 5174)
                                                             │
                                                    [NO CONNECTION]
                                                             │
[Customer Storefront: localhost:8443] <── React State <── localStorage ("ithub-store-v2" on port 8443) OR static fallback
```

Because `localStorage` is strictly segregated by origin in modern web browsers, changes saved to port 5174's storage were never accessible to port 8443. Furthermore, even within a single origin, `localStorage` is isolated to a single client profile and cannot provide multi-user server-authoritative persistence.

### Integration Status Classification

| Module                             | Sub-feature                         | Original Status          | New Status           | Authoritative Backend                                   |
| ---------------------------------- | ----------------------------------- | ------------------------ | -------------------- | ------------------------------------------------------- |
| **1. Certificates & Partnerships** | Listing, Add, Edit, Delete, Reset   | UI-only (`localStorage`) | **Fully integrated** | `public.partner_certificates` + Realtime                |
| **2. Website Content**             | Promotional Announcement Banner     | Partially integrated     | **Fully integrated** | `public.announcements`                                  |
| **2. Website Content**             | Showroom Showcase Photos            | UI-only (`localStorage`) | **Fully integrated** | `public.website_showcase` + Realtime                    |
| **2. Website Content**             | Technology Blog                     | Protected External CMS   | **Fully integrated** | Shopify Storefront API (`/blogs/news`)                  |
| **3. Settings**                    | Store Name, Address, Phone, Email   | UI-only (`localStorage`) | **Fully integrated** | `public.store_settings` + `public.it_hub_locations`     |
| **3. Settings**                    | Service Operations Fees             | Partially integrated     | **Fully integrated** | `public.store_settings` (Doorstep, Courier, Diagnostic) |
| **3. Settings**                    | WhatsApp Direct Support & Greeting  | UI-only (`localStorage`) | **Fully integrated** | `public.store_settings.whatsapp_number`                 |
| **3. Settings**                    | Database Infrastructure Health      | Diagnostic Read-Only     | **Fully integrated** | PostgREST Client Health Ping                            |
| **3. Settings**                    | Visitor Privacy & Analytics Toggles | UI-only (`localStorage`) | **Fully integrated** | `public.store_settings.analytics_enabled`               |
| **3. Settings**                    | Private Server API Credentials      | N/A (Server Secret)      | **Secured**          | Protected Server Environment Variables                  |

---

## 2. Root Cause & Corrections by Module

### 2.1 Module 1: Certificates & Partnerships

- **Original Problem:** Deleting a certificate from the Staff Portal had no effect on the Storefront. The Storefront continued to render all certificates from its own local cache or static `initialCertificates` array.
- **Root Cause:** There was no PostgreSQL database table for certificates. Deleting a certificate in `Certificates.tsx` only spliced the local React state and wrote to port 5174's `localStorage`.
- **Correction Applied:**
  1. Created `public.partner_certificates` table with RLS enabled.
  2. Seeded the table with the 6 canonical partners (ASUS, Canon, Epson, Numeric, IGGIS, Intel) using verified image paths.
  3. Updated [`Certificates.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Certificates.tsx):
     - On mount, fetches active certificates from `partner_certificates`.
     - `handleSaveCertificate`: Performs authoritative upsert into `partner_certificates` and writes audit log to `staff_audit_logs`.
     - `handleDelete`: Executes `DELETE FROM partner_certificates WHERE id = target.id` and logs the deletion.
     - `handleResetDefaults`: Re-seeds the 6 canonical certificates into `partner_certificates`.
  4. Updated Storefront [`src/lib/certificates.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/lib/certificates.ts) and [`src/pages/Information.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Information.tsx):
     - Queries `partner_certificates` where `is_published = true` order by `display_order`.
     - Subscribes to Supabase Realtime changes on `partner_certificates` so additions, edits, and deletions instantly propagate to customer screens without a page refresh.
     - When a certificate is deleted in the Staff Portal, it is immediately excluded from the query and disappears from the Customer Storefront.

---

### 2.2 Module 2: Website Content Management

- **Original Problem:** Edits to customer showcase photos, new photo uploads, or photo deletions in the Staff Portal did not affect the Customer Storefront homepage showcase grid.
- **Root Cause:** Showcase items were stored only in `localStorage["ithub-store-v2"]` on port 5174, while `Home.tsx` read from `store.showcase` on port 8443.
- **Correction Applied:**
  1. Created `public.website_showcase` table with RLS enabled.
  2. Seeded the table with the 10 showroom showcase images and captions.
  3. Updated [`WebsiteContent.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/WebsiteContent.tsx):
     - Fetches showcase items on mount from `website_showcase`.
     - New image uploads downscale to 900px and insert into `website_showcase` with staff audit logging.
     - Deletions execute `DELETE FROM website_showcase WHERE id = target.id`.
     - Promotional announcement banner continues to persist authoritatively to `public.announcements`.
  4. Updated Storefront [`src/pages/Home.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Home.tsx):
     - Hydrates `store.showcase` from `website_showcase`.
     - Subscribes to Supabase Realtime changes on `website_showcase` for live updates.
  5. **Shopify CMS Protection:**
     - Explicitly protected Shopify as the authoritative CMS for the Blog.
     - Preserved live Shopify Storefront API fetching in [`src/lib/shopify.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/lib/shopify.ts) and `Home.tsx`.
     - Added an administrative notice in `WebsiteContent.tsx` linking to Shopify Admin for editorial management without creating competing database tables in Supabase.

---

### 2.3 Module 3: Staff Portal Settings

- **Original Problem:** Editing store profile information (name, address, hours, phone, WhatsApp) in Settings did not persist to the database and did not update Storefront contact details or service estimator calculators.
- **Root Cause:** `handleSave` in `Settings.tsx` only wrote fee values to `store_settings`; contact details, hours, and WhatsApp info were only written to port 5174 `localStorage`.
- **Correction Applied:**
  1. Enhanced `public.store_settings` with columns: `hours`, `tagline`, `whatsapp_default_msg`, `city`, `pincode`, `service_radius_km`, `analytics_enabled`, `mask_visitor_ip`.
  2. Added staff update RLS policies for `store_settings` and `it_hub_locations`.
  3. Updated [`Settings.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Settings.tsx):
     - Loads all fields from `store_settings` row `id = 1` on mount.
     - `handleSave` persists all profile, contact, WhatsApp, fee, and privacy values to `store_settings` in PostgreSQL and syncs headquarters location in `it_hub_locations`.
     - Added staff audit logging for `UPDATE_STORE_SETTINGS`.
  4. Updated Storefront [`src/app/store.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/app/store.tsx):
     - Added `hydrateStoreSettings` on startup, populating `store.settings` and `store.locations` from `store_settings`.
     - Subscribes to Supabase Realtime changes on `store_settings`.
     - Updates propagate live to [`Support.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Support.tsx), [`Information.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Information.tsx), and [`WarrantyCheck.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/components/WarrantyCheck.tsx).
  5. **Integration Configuration & Secret Protection:**
     - Added a dedicated card in Settings explaining that Shopify credentials, Razorpay secrets, and Supabase service-role keys are securely server-managed and prohibited from client form editing.

---

## 3. Database Architecture & RLS Security

### 3.1 Migration Applied

`supabase/migrations/20261031000002_staff_portal_storefront_integration.sql` was created and applied via `supabase migration up`. Migration integrity was verified via `npm run verify:migrations` (22/22 valid sequential migrations).

### 3.2 Tables and Policies Overview

| Table                         | Operations                 | Public / Anon                       | Authenticated Staff (`is_staff()`) |
| ----------------------------- | -------------------------- | ----------------------------------- | ---------------------------------- |
| `public.partner_certificates` | `SELECT`                   | Allowed where `is_published = true` | Allowed for all records            |
| `public.partner_certificates` | `INSERT / UPDATE / DELETE` | **Forbidden** (RLS rejected)        | Allowed                            |
| `public.website_showcase`     | `SELECT`                   | Allowed where `is_active = true`    | Allowed for all records            |
| `public.website_showcase`     | `INSERT / UPDATE / DELETE` | **Forbidden** (RLS rejected)        | Allowed                            |
| `public.store_settings`       | `SELECT`                   | Allowed (read-only)                 | Allowed                            |
| `public.store_settings`       | `UPDATE`                   | **Forbidden** (RLS rejected)        | Allowed                            |
| `public.it_hub_locations`     | `SELECT`                   | Allowed (read-only)                 | Allowed                            |
| `public.it_hub_locations`     | `UPDATE`                   | **Forbidden** (RLS rejected)        | Allowed                            |

---

## 4. Cache Invalidation & Realtime Strategy

1. **Immediate Write Confirmation:** Staff Portal operations await PostgreSQL confirmation before displaying success toasts and logging audit records.
2. **Realtime Channels:**
   - Storefront `Information.tsx` subscribes to channel `realtime-partner-certificates`.
   - Storefront `Home.tsx` subscribes to channel `realtime-website-showcase`.
   - Storefront `store.tsx` subscribes to channel `realtime-storefront-settings`.
3. **Graceful Fallbacks:** If a browser is offline or PostgreSQL is temporarily unreachable, all modules gracefully fall back to local cached arrays or static canonical constants (`initialCertificates`, `DEFAULT_SHOWCASE`, `initial.settings`) without application crash.

---

## 5. Verification & Test Results

### 5.1 Dedicated Integration Tests

Ran `deno test -A supabase/functions/tests/staff-storefront-integration.test.ts`:

```
running 11 tests from ./supabase/functions/tests/staff-storefront-integration.test.ts
INTG-1: Partner certificates table returns all 6 canonical partners with is_published = true ... ok (39ms)
INTG-2: Deleting a certificate in Staff Portal removes it from public storefront query ... ok (56ms)
INTG-3: Editing certificate title persists and reflects in storefront query ... ok (18ms)
INTG-4: Intel and IGGIS records are completely independent with distinct images and titles ... ok (10ms)
INTG-5: Website showcase table returns active showroom photos for storefront ... ok (8ms)
INTG-6: Adding and deleting a showcase photo updates website_showcase table ... ok (17ms)
INTG-7: Store settings table contains authoritative store profile, contact, hours, and fees ... ok (5ms)
INTG-8: Staff update to store settings updates row 1 and is reflected in public storefront read ... ok (14ms)
INTG-9: Anonymous client is forbidden from inserting or modifying partner_certificates ... ok (8ms)
INTG-10: Anonymous client is forbidden from modifying store_settings ... ok (9ms)
INTG-11: Shopify Blog CMS ownership is respected and no competing blog table exists in Supabase ... ok (4ms)

ok | 11 passed | 0 failed (201ms)
```

### 5.2 Certificate Asset & Hash Mapping Tests

Ran `deno test -A supabase/functions/tests/certificate-partner-image-mapping.test.ts`:

- **14 passed | 0 failed (32ms)**
- Confirmed Intel Partner Alliance (`about-store.png`) and IGGIS Honour & Recognition (`iggis-honour-recognition.jpg`) retain distinct SHA-256 hashes across Storefront and Staff Portal.

### 5.3 Full Regression Suites

| Test Suite / Build            | Command                     | Result                               |
| ----------------------------- | --------------------------- | ------------------------------------ |
| Complete Regression Suite     | `npm test`                  | **638 passed · 0 failed (8s)**       |
| Staff Portal Test Suite       | `npm run test:portal`       | **68 passed · 0 failed (673ms)**     |
| Storefront TypeScript         | `npm run typecheck`         | **0 errors**                         |
| Staff Portal TypeScript       | `npm run portal:typecheck`  | **0 errors**                         |
| Storefront Production Build   | `npm run build`             | **Success in 1.44s**                 |
| Staff Portal Production Build | `npm run portal:build`      | **Success in 696ms**                 |
| Migration Verification        | `npm run verify:migrations` | **22 migrations verified**           |
| Dev Servers                   | Port 8443 & Port 5174       | **Both active and serving HTTP 200** |

---

## 6. Files Modified and Created

### Database & Migrations

- Created: [`supabase/migrations/20261031000002_staff_portal_storefront_integration.sql`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/migrations/20261031000002_staff_portal_storefront_integration.sql)
- Modified: [`supabase/schema.sql`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql)

### Staff Portal (`ITHUB_ADMIN/`)

- Modified: [`ITHUB_ADMIN/src/pages/Certificates.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Certificates.tsx) — PostgreSQL integration for Create, Update, Delete, Reset, and audit logs.
- Modified: [`ITHUB_ADMIN/src/pages/WebsiteContent.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/WebsiteContent.tsx) — PostgreSQL integration for showcase photos and Shopify CMS documentation banner.
- Modified: [`ITHUB_ADMIN/src/pages/Settings.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Settings.tsx) — Full PostgreSQL persistence for store profile, contact info, hours, WhatsApp greeting, and security notices.

### Customer Storefront (`src/`)

- Created: [`src/lib/certificates.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/lib/certificates.ts) — Data layer fetching published certificates with fallback.
- Modified: [`src/pages/Information.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Information.tsx) — Hydrates certificates from database and listens to Realtime changes.
- Modified: [`src/pages/Home.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Home.tsx) — Hydrates showcase photos from database with Realtime subscription; preserves Shopify Blog fetching.
- Modified: [`src/app/store.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/app/store.tsx) — Hydrates store settings and location headquarters from PostgreSQL on startup with Realtime sync.

### Test Suites

- Created: [`supabase/functions/tests/staff-storefront-integration.test.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/tests/staff-storefront-integration.test.ts) (11 tests)
- Plan: [`docs/superpowers/plans/2026-10-31-staff-portal-storefront-integration.md`](file:///D:/mario/IT%20HUB/ITHUB_WEB/docs/superpowers/plans/2026-10-31-staff-portal-storefront-integration.md)
