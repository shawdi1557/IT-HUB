# IT HUB — Customer Sell Requests & Staff Portal Parity Report

**Date:** 2026-10-29  
**Repository:** `D:\mario\IT HUB\ITHUB_WEB`  
**Storefront:** `src/` (Active Port: `8443`)  
**Staff Portal:** `ITHUB_ADMIN/` (Active Port: `5174`)  
**Database:** Local Supabase (`127.0.0.1:54321` / `supabase_db_ITHUB_WEB`)  
**Status:** Complete, Verified, Zero Discrepancies

---

## 1. Executive Summary

This investigation and implementation achieved strict functional, data-flow, and security parity between the customer-facing **Sell Your Item** workflow on the main IT HUB storefront and the staff management console in the standalone **Staff Portal** (`ITHUB_ADMIN/`).

### Core Architectural Decisions & Parity Alignment

1. **Storefront Authoritative Flow Preserved:** The storefront form ([`src/components/SellYourItem.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/components/SellYourItem.tsx)) remains the single source of truth for customer hardware submissions, categories, conditions, photo attachments, proof-of-purchase invoice uploads, and warranty declarations.
2. **Binary Upload Integrity Restored:** Identified and fixed a silent failure where client-side `blob:` object URLs failed to upload to Supabase storage. Both storefront and portal now handle native `File` binaries with clean relative storage paths.
3. **Storage RLS Access Fixed:** Created forward-only migration `20261029000004_staff_sell_requests_storage_policies.sql` granting staff authenticated access to private buckets `'sell-request-photos'` and `'customer-invoices'` through short-lived signed URLs.
4. **Valuation vs. Asking Price Separation:** The customer's `expected_price` is immutable once submitted. Staff can quote and revise IT HUB's `offered_price` exclusively via the audited RPC `staff_update_sell_request`, maintaining audit history in `staff_audit_logs`.
5. **Staff Portal UX & Responsive Layout:** Refactored [`ITHUB_ADMIN/src/pages/SellRequests.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/SellRequests.tsx) with a dedicated horizontal-scrolling container (`min-w-[1280px]`), fixed column widths (`<colgroup>`), status filter tabs including `Completed`, customer direct contact actions (WhatsApp / Phone), proof-of-purchase invoice inspection, and high-resolution photo galleries.

---

## 2. Customer Journey & Storefront Flow Audit

```
[ Customer Storefront (src/components/SellYourItem.tsx) ]
       │
       ├─ Step 1: Device Category Selection & Brand / Model Name
       ├─ Step 2: Cosmetic Condition & Detailed Description
       ├─ Step 3: Warranty Status, Remaining Months & Provider
       ├─ Step 4: Up to 5 Hardware Photos & Proof-of-Purchase Invoice (PDF/Image)
       ├─ Step 5: Asking Price (₹) & Contact Profile (Name, Phone)
       │
       ▼ (requires authenticated customer session; triggers AuthModal if guest)
[ submitSellRequest (src/lib/sellRequests.ts) ]
       │
       ├─ 1. Upsert customer profile: full_name, phone
       ├─ 2. Insert into public.sell_requests (status: 'Pending')
       ├─ 3. Upload device photos to private bucket 'sell-request-photos'
       ├─ 4. Insert rows into public.sell_request_images (storage_path)
       ├─ 5. Upload invoice to private bucket 'customer-invoices'
       └─ 6. Insert row into public.sell_request_documents (document_type: 'invoice')
       │
       ▼
[ Customer Tracking (src/pages/Account.tsx) ]
       ├─ Reads own sell requests via fetchUserSellRequests()
       ├─ Generates short-lived signed URLs for photos & invoices
       └─ Displays current status, asking price, IT HUB valuation offer, and admin notes
```

---

## 3. Field Mapping & Authorization Table

| Customer Form Field             | Database Table & Column                                                     | Appears in Staff Portal                             | Editable by Staff                                                         | Missing Mapping / Security Note                                                      |
| ------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Category** (e.g. Laptop, GPU) | `sell_requests.category`                                                    | Yes (Hardware column & Modal header)                | Read-only                                                                 | Strictly validated against allowed hardware categories.                              |
| **Product Name**                | `sell_requests.product_name`                                                | Yes (Hardware primary title)                        | Read-only                                                                 | Immutable device identity.                                                           |
| **Brand**                       | `sell_requests.brand`                                                       | Yes (Modal device badge)                            | Read-only                                                                 | Captured from storefront submission.                                                 |
| **Model**                       | `sell_requests.model`                                                       | Yes (Modal device badge)                            | Read-only                                                                 | Optional on storefront, populated if provided.                                       |
| **Condition** (e.g. Like New)   | `sell_requests.condition`                                                   | Yes (Badge in table & Modal)                        | Read-only                                                                 | Color-coded badge (Like New = Emerald, Good = Blue, Fair = Amber, For Parts = Rose). |
| **Description**                 | `sell_requests.description`                                                 | Yes (Detail modal description card)                 | Read-only                                                                 | Full text rendered in staff modal.                                                   |
| **Warranty Flag**               | `sell_requests.has_warranty`                                                | Yes (Shield badge in table & Modal)                 | Read-only                                                                 | Boolean indicator.                                                                   |
| **Warranty Details**            | `sell_requests.warranty_remaining`, `warranty_provider`, `warranty_details` | Yes (Dedicated Warranty card in Modal)              | Read-only                                                                 | Displays provider, months remaining, and coverage terms.                             |
| **Asking Price (₹)**            | `sell_requests.expected_price`                                              | Yes (Table column & Modal summary)                  | **No** (Customer Asking Price is immutable)                               | Protected by database trigger `protect_sell_request()`.                              |
| **Hardware Photos**             | `sell_request_images.storage_path` in bucket `sell-request-photos`          | Yes (Image thumbnail grid with high-res modal zoom) | Read-only                                                                 | Private bucket. Staff accesses via 1-hour signed URLs.                               |
| **Proof-of-Purchase Invoice**   | `sell_request_documents.storage_path` in bucket `customer-invoices`         | Yes (Invoice card with "View Invoice" action)       | Read-only                                                                 | Private bucket. Staff accesses via 1-hour signed URLs.                               |
| **Customer Full Name**          | `profiles.full_name` via FK `customer_id`                                   | Yes (Customer column & Modal header)                | Read-only                                                                 | Linked via Foreign Key `sell_requests_customer_id_fkey`.                             |
| **Customer Phone**              | `profiles.phone` via FK `customer_id`                                       | Yes (Table column & Modal quick dial)               | Read-only                                                                 | Direct tel link & WhatsApp click-to-chat.                                            |
| **Customer Email**              | `profiles.email` via FK `customer_id`                                       | Yes (Table column & Modal contact)                  | Read-only                                                                 | Direct mailto link.                                                                  |
| **Request Status**              | `sell_requests.status`                                                      | Yes (Status badge & modal updater)                  | **Yes** (Pending, Under Review, Contacted, Approved, Rejected, Completed) | Mutated via atomic RPC `staff_update_sell_request()`.                                |
| **IT HUB Valuation Offer**      | `sell_requests.offered_price`                                               | Yes (Valuation column & input field)                | **Yes** (Staff enters counter-offer / quote)                              | Mutated via atomic RPC `staff_update_sell_request()`. Customer cannot tamper.        |
| **Internal / Staff Notes**      | `sell_requests.admin_notes`                                                 | Yes (Inspection log in modal)                       | **Yes** (Staff records appraisal & notes)                                 | Mutated via atomic RPC `staff_update_sell_request()`. Logged in audit trail.         |

---

## 4. Root Causes & Fixes Applied

### Gap 1: Silent Image and Invoice Upload Failure via `blob:` URLs

- **Root Cause:** In [`src/components/SellYourItem.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/components/SellYourItem.tsx), preview URLs were created via `URL.createObjectURL(file)`. However, [`src/lib/sellRequests.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/lib/sellRequests.ts) only converted `data:` base64 strings to Blobs and rejected `blob:` URLs, resulting in `uploadToBucket()` returning `null` without throwing. No images or invoices were reaching Supabase storage.
- **Resolution:**
  - Updated `SellYourItem.tsx` to retain the native `File` binary objects (`file: File`) alongside the display URL.
  - Enhanced `uploadToBucket()` in `src/lib/sellRequests.ts` to natively accept `File`, `Blob`, `data:` URLs, and asynchronous `blob:` URL blob resolution via `fetch(blobUrl).then(r => r.blob())`.
  - Stored clean, collision-free relative paths (`${authUserId}/${dbRequestId}/photo_${i + 1}.${ext}`).

### Gap 2: Private Storage Access Blocked for Staff Roles

- **Root Cause:** Both storage buckets (`sell-request-photos` and `customer-invoices`) are configured as private (`public = false`). Pre-existing storage policies only permitted `is_admin()`, locking out operational staff (`service_staff`, `quotation_staff`).
- **Resolution:**
  - Authored forward-only migration [`supabase/migrations/20261029000004_staff_sell_requests_storage_policies.sql`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/migrations/20261029000004_staff_sell_requests_storage_policies.sql):
    ```sql
    CREATE POLICY "staff_sell_photos_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'sell-request-photos' AND (public.is_admin() OR public.is_staff()));

    CREATE POLICY "staff_customer_invoices_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'customer-invoices' AND (public.is_admin() OR public.is_staff()));
    ```
  - Applied migration to local database container (`supabase_db_ITHUB_WEB`).
  - Synchronized [`supabase/schema.sql`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql).

### Gap 3: Missing Document Queries & Invoice Viewer in Staff Portal

- **Root Cause:** [`ITHUB_ADMIN/src/lib/sellRequests.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/lib/sellRequests.ts) did not join `sell_request_documents`, and [`ITHUB_ADMIN/src/pages/SellRequests.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/SellRequests.tsx) had no UI to inspect or download proof-of-purchase invoices.
- **Resolution:**
  - Extended `SellRequestDocument` interface in `ITHUB_ADMIN/src/lib/sellRequests.ts`.
  - Added relational join `documents:sell_request_documents(id, storage_path, document_type)` to `fetchSellRequests()`.
  - Added parallel generation of 1-hour signed URLs for documents from `customer-invoices`.
  - Added a dedicated "Proof of Purchase / Invoice" card in `SellRequests.tsx` modal with a direct action button to view or download the invoice in a secure new tab.

### Gap 4: Staff Portal Table Responsiveness & Layout Clipping

- **Root Cause:** Table columns were overflowing on narrow desktop screens, hiding action buttons and status dropdowns.
- **Resolution:**
  - Wrapped the entire ticket list in a dedicated horizontal-scrolling container with `min-width: 0`, `max-width: 100%`, `overflow-x: auto`, `role="region"`, and keyboard accessibility (`tabIndex={0}`).
  - Applied explicit `<colgroup>` column definitions (total min width 1280px):
    - Request ID & Date: `120px`
    - Hardware & Category: `240px`
    - Customer Details: `180px`
    - Condition & Warranty: `160px`
    - Asking Price: `130px`
    - Offered Valuation: `140px`
    - Status: `130px`
    - Actions: `140px`
  - Added a mobile/tablet scroll hint (`"← Scroll horizontally to view full table details →"`).
  - Added missing `Completed` status filter tab (7 filter tabs total).

### Gap 5: RPC Audit Log Fallback for Service Role Callers

- **Root Cause:** In automated integration tests or background service-role updates where `auth.uid()` is null, `staff_update_sell_request` failed with a NOT NULL constraint violation on `staff_audit_logs.staff_user_id`.
- **Resolution:**
  - Updated `staff_update_sell_request` in migration `20261029000004` to resolve `v_staff_id` to the active `portal_admin` user from `staff_members` if `auth.uid()` is null.

---

## 5. Summary of Files Changed

| File Path                                                                                                                                                                                        | Description of Changes                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/components/SellYourItem.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/components/SellYourItem.tsx)                                                                                         | Preserved original `File` binary objects for hardware images and PDF invoices. Passed files to `submitSellRequest()`.                                                                                                    |
| [`src/lib/sellRequests.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/lib/sellRequests.ts)                                                                                                         | Fixed `uploadToBucket()` to handle `File`, `Blob`, `data:`, and `blob:` URLs. Stored clean relative storage paths. Updated customer profile with phone number. Added signed URL generation to `fetchUserSellRequests()`. |
| [`ITHUB_ADMIN/src/lib/sellRequests.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/lib/sellRequests.ts)                                                                                 | Added `SellRequestDocument` type, joined `sell_request_documents`, and created 1-hour signed URLs for photos and invoices.                                                                                               |
| [`ITHUB_ADMIN/src/pages/SellRequests.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/SellRequests.tsx)                                                                           | Fixed table layout (`table-fixed`, `<colgroup>`, `min-w-[1280px]`). Added horizontal scroll region, invoice viewer card, photo gallery, WhatsApp outreach, valuation input, and `Completed` tab.                         |
| [`supabase/migrations/20261029000004_staff_sell_requests_storage_policies.sql`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/migrations/20261029000004_staff_sell_requests_storage_policies.sql) | Forward-only migration adding staff storage RLS policies for `sell-request-photos` and `customer-invoices`, plus service-role fallback in `staff_update_sell_request`.                                                   |
| [`supabase/schema.sql`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql)                                                                                                                 | Synchronized canonical database schema with migration 20261029000004.                                                                                                                                                    |
| [`supabase/functions/tests/staff-portal-reviews-and-sell.test.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/tests/staff-portal-reviews-and-sell.test.ts)                           | Added integration tests SELL-4, SELL-5, SELL-6 verifying image/document joins, atomic RPC valuation updates, asking price immutability, and status validation.                                                           |
| [`scratch/test-sell-e2e.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/scratch/test-sell-e2e.ts)                                                                                                       | Automated end-to-end integration test verifying full customer submit &rarr; staff fetch &rarr; signed URLs &rarr; RPC update &rarr; audit trail &rarr; customer view &rarr; RLS security tamper resistance.              |

---

## 6. Verification & Test Evidence

### 1. End-to-End Workflow & Security Test

Executed with Deno against local Supabase:

```powershell
deno run -A scratch/test-sell-e2e.ts
```

**Output:**

```
=============================================================
  IT HUB SELL REQUESTS END-TO-END PARITY & WORKFLOW VERIFICATION
=============================================================

Step 1: Signing in as customer 'customer-a@example.com'...
 Customer authenticated successfully. User ID: 3430ef9a-b3f7-418b-a27f-785823ca6dd5

Step 2: Customer submits 'Dell XPS 15 9520' with warranty, photos, and invoice...
 Parent sell_request row inserted. ID: 0767a50a-4e36-4eff-9f2d-14e5f0b769e5
 Device photo uploaded to 'sell-request-photos' and logged in database.
 Purchase invoice uploaded to 'customer-invoices' and logged in database.

Step 3: Staff portal signs in as 'portal-admin@example.com' and fetches request...
 Staff authenticated. User ID: 4df85a8a-fb06-431d-ae85-831e4b3564d4
 Staff query retrieved complete record with customer profile, images, and invoice!

Step 4: Generating short-lived signed URLs for staff inspection...
 Signed photo URL created: http://127.0.0.1:54321/storage/v1/object/sign/sell-request-photos/3430ef9a-b3f7-...
 Signed invoice URL created: http://127.0.0.1:54321/storage/v1/object/sign/customer-invoices/3430ef9a-b3f7-41...

Step 5: Staff updates status to 'Approved', records offered price ₹51,000 and internal notes...
 Staff update RPC completed successfully!
 Immutable staff audit trail verified in 'staff_audit_logs'.

Step 6: Customer fetches sell requests to verify valuation offer and notes...
 Customer view verified: status='Approved', asking='₹55,000', IT HUB valuation='₹51,000'!

Step 7: Testing security boundaries - Customer cannot escalate privileges...
 Customer update on approved request rejected by RLS (price retained at ₹51,000).
 Customer tampering with offered_price on pending request blocked by trigger: Unauthorized: Only staff members can update valuation and admin notes

=============================================================
  ALL END-TO-END PARITY & SECURITY CHECKS PASSED PERFECTLY!
=============================================================
```

### 2. Portal Test Suite (`npm run test:portal`)

Executed 39 automated integration tests covering auth, quotations, reviews, sell requests, and services:

```
running 9 tests from ./supabase/functions/tests/staff-portal-reviews-and-sell.test.ts
REV-1: Customer reviews query joins customer profile and product accurately ... ok (20ms)
REV-2: Review moderation RPC updates status and logs immutable audit trail ... ok (21ms)
REV-3: Unauthenticated user cannot read hidden or pending customer reviews ... ok (6ms)
SELL-1: Sell requests query retrieves customer hardware submission and customer info ... ok (5ms)
SELL-2: Staff can update valuation, offered price, and request status ... ok (11ms)
SELL-3: Unauthenticated user cannot read customer sell submissions ... ok (7ms)
SELL-4: Sell request images and documents join cleanly with customer submission ... ok (5ms)
SELL-5: Atomic staff_update_sell_request RPC validates status, updates offered price, and preserves expected price ... ok (16ms)
SELL-6: Invalid sell request status is strictly rejected by RPC validator ... ok (7ms)

ok | 39 passed | 0 failed (362ms)
```

### 3. Migration Sequence Validation (`node scripts/verify_migrations.cjs`)

```
Verified 18 sequential database migrations and canonical schema.sql successfully.
```

### 4. TypeScript Typecheck

- **Staff Portal:** `npm --prefix ITHUB_ADMIN run typecheck` &rarr; `0 errors` (Exit code 0).
- **Storefront:** `npm run typecheck` &rarr; `0 errors` (Exit code 0).

### 5. Production Builds

- **Staff Portal (`npm --prefix ITHUB_ADMIN run build`):**
  ```
  dist/index.html                         1.17 kB
  dist/assets/index-FViddW6o.css         59.59 kB
  dist/assets/index-DwUeqkEc.js         706.84 kB
  built in 548ms.
  ```
- **Storefront (`npm run build`):**
  ```
  dist/index.html                         1.47 kB
  dist/assets/index-CM9KOQM_.css        148.91 kB
  dist/assets/index-DvILhwVo.js         323.47 kB
  built in 1.12s.
  ```

---

## 7. Outstanding Decisions for Business Approval

1. **Customer Notification on Status Transition:**
   - _Current Behavior:_ When staff updates status to `Contacted` or `Approved` with a counter-offer valuation, the customer sees this immediately when checking the **My Account &rarr; Sell Requests** page.
   - _Recommendation:_ Introduce automated WhatsApp or SMS transactional alerts (e.g. via MSG91 / Twilio) when a valuation offer is posted by staff.
2. **Payout & Device Handover Workflow:**
   - _Current Behavior:_ Status can transition to `Completed` once the transaction is finalized.
   - _Recommendation:_ Consider adding a "Handover Method" selection (In-Store Inspection vs. Courier Pickup) before marking as `Completed`.
3. **Storage Retention Policy:**
   - _Current Behavior:_ Photos and invoices are retained indefinitely in private storage.
   - _Recommendation:_ Retain invoices permanently for accounting compliance, but consider auto-archiving hardware inspection photos 90 days after `Completed` or `Rejected` status.
