# IT HUB — Removal of Intel Partner Alliance Certificate from Public Storefront

**Date:** October 31, 2026  
**Environment:** Local Development Only (`http://127.0.0.1:54321` PostgreSQL port 54322)  
**Scope:** PostgreSQL Backend (`public.partner_certificates`, `public.staff_audit_logs`), Staff Portal (`http://localhost:5174`), Customer Storefront (`http://localhost:8443`)  
**Status:** Completed, Verified & Passing

---

## 1. Executive Summary

In response to the client directive to remove the **Intel Partner Alliance** certificate from the public IT HUB website while strictly avoiding permanent data loss, maintaining audit trail integrity, and keeping all other partner records untouched:

1. **Operation Performed:** Record retention with public visibility deactivation (`is_published = false`). Permanent deletion was **not** performed.
2. **Canonical Record Identified:** `cert-intel` in `public.partner_certificates`.
3. **Publication Status Transition:** `true` (Published) ➔ `false` (Unpublished / Hidden).
4. **Staff Audit Trail:** Logged in `public.staff_audit_logs` with immutable ID `c9b9aaf4-d7ac-455e-b8db-11cd1f9d5672`.
5. **Realtime Storefront Reaction:** Supabase Realtime emitted an `UPDATE` event containing `is_published: false`. The Storefront central `ContentSyncManager` received the WebSocket notification and immediately removed Intel from the active certificate state without requiring a browser refresh.
6. **Persistence on Refresh:** Both Customer Storefront (`http://localhost:8443`) and Staff Portal (`http://localhost:5174`) retain the state across refreshes. The Storefront query strictly returns the remaining 5 active manufacturer certificates (ASUS, Canon, Epson, Numeric, IGGIS).
7. **Asset & Record Preservation:** The Intel announcement image file (`/images/about-store.png`) was strictly preserved on disk, and the canonical Intel record remains available in the database for potential future re-activation by staff.

---

## 2. Record Identification & Distinction

### 2.1 Canonical Record Details (`cert-intel`)

| Field                            | Value                                                      |
| -------------------------------- | ---------------------------------------------------------- |
| **Database Primary Key**         | `cert-intel`                                               |
| **Title / Text**                 | `Intel Partner Alliance`                                   |
| **Manufacturer / Brand**         | `Intel`                                                    |
| **Category**                     | `Processors & Systems`                                     |
| **Status**                       | `Alliance Member`                                          |
| **Validity**                     | `Active Member`                                            |
| **Image Path**                   | `/images/about-store.png`                                  |
| **Alt Text**                     | `Intel Partner Alliance Membership Certificate for IT HUB` |
| **Shop URL**                     | `/products?brand=Intel`                                    |
| **Display Order**                | `6`                                                        |
| **Previous Publication Status**  | `true`                                                     |
| **Resulting Publication Status** | `false`                                                    |
| **Created At**                   | `2026-10-31 08:59:55.905138+00`                            |
| **Updated At**                   | `2026-10-31 10:34:43.251000+00`                            |

### 2.2 Record Independence & Integrity Verification

To prevent cross-contamination between certificates, cryptographic hash analysis and record comparison confirmed that `cert-intel` is completely separate and distinct from `cert-iggis` and all other partner records:

| Record ID      | Brand     | Certificate Title          | Image Asset                                         | SHA-256 Hash          | Public Status          |
| -------------- | --------- | -------------------------- | --------------------------------------------------- | --------------------- | ---------------------- |
| `cert-asus`    | ASUS      | ASUS Premium Partner       | `/images/recognition/asus-premium-partner.jpg`      | `51BF2E5A2FCBDE1F...` | **Published** (`true`) |
| `cert-canon`   | Canon     | Canon Authorised Reseller  | `/images/recognition/canon-authorised-reseller.jpg` | `537619589556E1AA...` | **Published** (`true`) |
| `cert-epson`   | Epson     | Epson Channel Partner      | `/images/recognition/epson-channel-partner.jpg`     | `52B93178F0058960...` | **Published** (`true`) |
| `cert-numeric` | Numeric   | Numeric Energy Partner     | `/images/recognition/numeric-energy-partner.jpg`    | `2E9083FACADCF9EC...` | **Published** (`true`) |
| `cert-iggis`   | IGGIS     | IGGIS Honour & Recognition | `/images/recognition/iggis-honour-recognition.jpg`  | `D740D6CD38346FBE...` | **Published** (`true`) |
| `cert-intel`   | **Intel** | **Intel Partner Alliance** | `/images/about-store.png`                           | `9325122E7C3858B2...` | **Hidden** (`false`)   |

All ASUS, Canon, Epson, Numeric, and IGGIS certificates and their underlying image files remain completely unchanged.

---

## 3. Audit Log Entry (`public.staff_audit_logs`)

An immutable audit trail entry was inserted into `public.staff_audit_logs`:

```json
{
  "id": "c9b9aaf4-d7ac-455e-b8db-11cd1f9d5672",
  "staff_user_id": "4df85a8a-fb06-431d-ae85-831e4b3564d4",
  "action_type": "UNPUBLISH_CERTIFICATE",
  "entity_type": "partner_certificate",
  "entity_id": "cert-intel",
  "previous_status": "Published",
  "new_status": "Unpublished",
  "metadata": {
    "id": "cert-intel",
    "text": "Intel Partner Alliance",
    "brand": "Intel",
    "is_published": false,
    "reason": "Client requested removal from public storefront"
  },
  "ip_address": null,
  "created_at": "2026-10-31T10:34:43.268164+00:00"
}
```

---

## 4. Staff Portal & Architectural Enhancements

To support professional management and future operational flexibility, the following enhancements were integrated into the Staff Portal:

1. **Staff Portal UI (`ITHUB_ADMIN/src/pages/Certificates.tsx`):**
   - **Publication Status Badges:** Certificate cards display an `"Active on Storefront"` green badge when published and a `"Hidden from Storefront"` amber badge when unpublished.
   - **Instant Unpublish / Publish Toggle:** Added a one-click toggle button on each card (`Publish` / `Unpublish`), allowing staff to change certificate storefront visibility without deleting the database record.
   - **Editor Modal Checkbox:** Added `"Published on public Customer Storefront"` checkbox in the Add/Edit Certificate modal.
   - **Realtime Synchronization:** Subscribed to Supabase Realtime channel `staff-certificates-sync` so administrative views synchronize across open staff tabs.
   - **Authoritative Audit Logging:** Corrected `staff_audit_logs` column mappings (`staff_user_id`, `action_type`, `entity_type`, `entity_id`).

2. **Database Migration (`20261031000004_partner_certificates_audit_logging.sql`):**
   - Expanded `staff_audit_logs_entity_type_check` to permit `'partner_certificate'` and `'website_showcase'`.
   - Verified 24 sequential database migrations and canonical `schema.sql` via `npm run verify:migrations`.

3. **Static Frontend Array Preservation:**
   - In adherence to Requirement 8, `DEFAULT_CERTIFICATES` in `Certificates.tsx` and `initialCertificates` in `catalog.ts` were **not** manually modified. Removal is governed authoritatively by the database layer (`is_published = false`).

---

## 5. Live Storefront & Realtime Verification Evidence

### 5.1 Realtime WebSocket Event Reception

During the update, the active Supabase Realtime listener on the Storefront received:

```
>>> REALTIME EVENT RECEIVED: UPDATE table: partner_certificates
    new: {
      id: 'cert-intel',
      text: 'Intel Partner Alliance',
      brand: 'Intel',
      is_published: false,
      display_order: 6,
      image: '/images/about-store.png',
      ...
    }
    old: {
      id: 'cert-intel',
      is_published: true,
      ...
    }
```

The Storefront `ContentSyncManager` (`src/lib/realtime/contentSync.ts`) immediately caught `payload.new.is_published === false` and filtered `cert-intel` out of `store.certificates` in memory, updating the UI dynamically without requiring a page reload.

### 5.2 Storefront Anonymous Query Verification

Running `fetchPublishedCertificates()` with the public anonymous client (`ANON_KEY`) against PostgreSQL:

```
Published certificates count: 5
 - [cert-asus]    ASUS:    ASUS Premium Partner
 - [cert-canon]   Canon:   Canon Authorised Reseller
 - [cert-epson]   Epson:   Epson Channel Partner
 - [cert-numeric] Numeric: Numeric Energy Partner
 - [cert-iggis]   IGGIS:   IGGIS Honour & Recognition

Is cert-intel in published query result? false
```

### 5.3 Test Suite & Quality Gates

| Verification Gate                                                           | Result                             |
| --------------------------------------------------------------------------- | ---------------------------------- |
| **Deno / Supabase Test Suite (`npm test`)**                                 | **645 passed, 0 failed**           |
| **Staff & Storefront Integration (`staff-storefront-integration.test.ts`)** | **11 passed, 0 failed**            |
| **Database Migrations Check (`npm run verify:migrations`)**                 | **24 migrations valid & verified** |
| **Staff Portal Typecheck (`npm --prefix ITHUB_ADMIN run typecheck`)**       | **0 errors (clean exit 0)**        |
| **Storefront App Typecheck (`npm run typecheck`)**                          | **0 errors (clean exit 0)**        |
| **Customer Storefront Dev Server (`http://localhost:8443`)**                | **HTTP 200 OK**                    |
| **Staff Portal Dev Server (`http://localhost:5174`)**                       | **HTTP 200 OK**                    |

---

## 6. Conclusion & Recommendation

The Intel Partner Alliance certificate has been successfully removed from the public IT HUB Customer Storefront via the existing Staff Portal and PostgreSQL integration. The record remains intact in PostgreSQL with `is_published = false`, historical and fresh audit trails are preserved, no images were deleted from storage, and all remaining partner accreditations continue to render without interruption.
