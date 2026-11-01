# IT HUB — Service Management UI Alignment & Unified Ticket Reference System Report

## Executive Summary

The Service Management Desk in the IT HUB Staff Portal (`ITHUB_ADMIN/`) and the customer-facing Service Tracker (`src/pages/Services.tsx`) have been successfully enhanced with:

1. **Desktop and Mobile Layout Alignment:** Restructured column proportions, vertical cell alignment (`align-middle`), and dedicated column width allocations ensuring that the Service Method badge, status dropdown, technician assignment, booking date, and action controls never clip, touch, or horizontally scroll on viewports 1366px and above.
2. **Unified Human-Readable Ticket Reference System (`ITH-SER-XXXXXXXX`):** Introduced a 16-character uppercase alphanumeric ticket reference format (prefix `ITH-SER-` + 8 collision-resistant uppercase alphanumeric characters) that is completely synchronized between the staff portal and the public tracking portal.
3. **Database Integrity Preservation:** In strict compliance with architectural constraints, the existing PostgreSQL UUID primary key (`public.service_requests.id`) is preserved for all internal database relationships, foreign keys, Realtime subscriptions, and internal lookups. A new, dedicated `ticket_reference text UNIQUE` column with a BEFORE INSERT trigger, UPDATE immutability lock, and idempotent backfill migration has been introduced.
4. **Test-Driven Verification:** Delivered with full TDD discipline under the `test-driven-development` skill. The new comprehensive test suite in `supabase/functions/tests/staff-portal-ticket-reference.test.ts` verified RED before GREEN implementation, culminating in 64 passing portal tests and 55 passing service regression tests.

---

## 1. Root Cause Analysis: Service Desk Alignment & Truncation Issues

Prior to this refinement, the Service Management Desk suffered from several alignment and proportion problems:

1. **Fixed Column Bottlenecks:** The Ticket ID column was hardcoded with `w-[95px]`, accommodating only an ad-hoc 8-character truncation `#{item.id.slice(0, 8)}`. Any longer formatted identifier clipped or pushed adjacent columns.
2. **Misaligned Cell Contents:** Table body cells lacked vertical alignment definitions (`align-middle`). Because the `Device & Problem` and `Customer & Contact` columns contain two lines of text while the `Status` and `Method` columns contain single-line badges/selects, status dropdowns floated near the top of tall rows, looking disjointed and uneven.
3. **Cramped Method & Status Columns:** The `Method` column (`w-[150px]`) and `Status` column (`w-[170px]`) were too tight for badges like "On-site Technician Visit" with icons and status selects with right chevrons, causing text truncation or badge edges to crowd adjoining borders.
4. **Disparate Customer vs. Staff IDs:** The public storefront displayed 36-character raw UUIDs (e.g. `c327b978-2ae9-4ab7-9b5b-e9385c62a7c2`), whereas the staff portal displayed `#c327b978`, causing confusion for customers calling support with their tracking link.

---

## 2. Table Layout & Visual Alignment Solution

The desktop table in `ITHUB_ADMIN/src/pages/Services.tsx` was rebuilt with the following verified column proportions (`min-w-[1170px]`):

| Column # | Column Name            | Width Allocation        | Cell Alignment & Typography                          | Purpose / Avoids Clipping                             |
| -------- | ---------------------- | ----------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| 1        | **Ticket ID**          | `w-[150px]`             | `align-middle font-mono font-bold whitespace-nowrap` | Full 16-char `ITH-SER-XXXXXXXX` reference             |
| 2        | **Device & Problem**   | `w-[23%] min-w-[200px]` | `align-middle text-xs`                               | Multi-line device name, issue, diagnostic badges      |
| 3        | **Customer & Contact** | `w-[16%] min-w-[150px]` | `align-middle text-xs`                               | Name, masked phone, quick copy                        |
| 4        | **Method**             | `w-[155px]`             | `align-middle whitespace-nowrap`                     | Method badge + icon with generous lateral padding     |
| 5        | **Status**             | `w-[175px]`             | `align-middle`                                       | Method-specific status select + animated indicator    |
| 6        | **Quote & State**      | `w-[110px]`             | `align-middle text-right font-mono`                  | Currency INR + state pill (approved/pending/rejected) |
| 7        | **Technician**         | `w-[125px]`             | `align-middle text-xs`                               | User icon + technician name truncate                  |
| 8        | **Booked**             | `w-[105px]`             | `align-middle text-xs whitespace-nowrap`             | `DD MMM YYYY` date formatting without wrap            |
| 9        | **Action**             | `w-[90px]`              | `align-middle text-right whitespace-nowrap`          | High-contrast "Manage" action button                  |

### Mobile Card View (`< lg`)

On tablet and mobile screens, wide tables are replaced with responsive ticket cards:

- **Card Header:** High-visibility ticket reference badge `ITH-SER-XXXXXXXX` in font-mono next to the method badge and formatted intake date.
- **Card Body:** Clear device brand/model, problem description, diagnostic findings chip count.
- **Card Footer:** Customer name, phone with direct WhatsApp link, and full-width "Manage Ticket" button meeting the $\ge 44\text{px}$ touch target standard.

---

## 3. Database Reference-Generation & Migration Strategy

### Architecture & Security Rules

- **Primary Key:** `public.service_requests.id uuid` remains the primary key. Foreign keys in `staff_audit_logs`, quotations, Realtime channels, and storage bucket associations remain unmodified.
- **Unique Constraint:** `CREATE UNIQUE INDEX idx_service_requests_ticket_reference ON public.service_requests (ticket_reference);`
- **Format:** `^ITH-SER-[0-9A-Z]{8}$` (16 characters total: `ITH-SER-` prefix + 8 uppercase alphanumeric characters).

### Migration Implementation (`20261030000001_service_ticket_reference.sql`)

1. **Cryptographic Generator Function:** `public.generate_ticket_reference()` generates 8 random bytes using `gen_random_bytes(8)` modulo 36 over `'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'`. It checks uniqueness in a loop with safety bounding.
2. **BEFORE INSERT/UPDATE Trigger:**
   - **INSERT:** If `ticket_reference` is missing, auto-generates reference via `public.generate_ticket_reference()`; if provided, uppercases and validates.
   - **UPDATE:** Immutability rule: `if OLD.ticket_reference is not null then NEW.ticket_reference := OLD.ticket_reference;`. Updates to status, technician, or quotation can never alter or nullify the reference.
3. **Idempotent Backfill:**
   For existing records with null references, derives candidate `'ITH-SER-' || upper(substr(replace(id::text, '-', ''), 1, 8))`. If a collision occurs, it calls `generate_ticket_reference()`.
4. **RPC Updates:**
   - `get_service_request_tracking(p_tracking_id, p_guest_token)`: Accepts `ITH-SER-XXXXXXXX`, 8-char code, or 36-char UUID; returns `'ticket_reference'` in JSON payload.
   - `create_service_booking(...)`: Returns `'ticket_reference'` in booking result object.

### Example Ticket References

| Internal UUID (Primary Key)            | Unified Human Reference (`ticket_reference`) | Context Display                           |
| -------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| `c327b978-2ae9-4ab7-9b5b-e9385c62a7c2` | `ITH-SER-C327B978`                           | Staff Portal, Tracker, WhatsApp, Invoices |
| `8f12a34b-1111-2222-3333-444455556666` | `ITH-SER-8F12A34B`                           | Customer Quick-Lookup Widget              |
| `12345678-aaaa-bbbb-cccc-ddddeeeeffff` | `ITH-SER-12345678`                           | Operational Alert Notification Links      |

---

## 4. Full Ecosystem Integration

### 1. Staff Portal Integration (`ITHUB_ADMIN/`)

- `ticketReference.ts`: Created shared validation, formatting, search matching, and URL generation helpers.
- `services.ts`: Updated `ServiceRecord` interface with `ticket_reference`, updated `fetchServices` to search by `ticket_reference.ilike.%${q}%`, updated `fetchServiceById` to accept both reference and UUID.
- `Services.tsx`: Desktop table expanded to `w-[150px]` for Ticket ID, mobile card updated to show `ITH-SER-XXXXXXXX`, search placeholder updated.
- `ServiceDetailModal.tsx`: Modal header displays `service.ticket_reference || formatTicketReference(service.id)`; WhatsApp on-site bill message includes authoritative `Ticket: ${reference}`.
- `Dashboard.tsx` & `serviceAlerts.ts`: Action required alerts and triage items reference the unified reference.

### 2. Storefront Customer Tracker (`src/pages/Services.tsx`)

- Quick Tracking Widget: Replaced raw UUID with `safeTrackData.ticketReference || formatTicketReference(safeTrackData.id)`.
- Full Dedicated Tracker: Replaced raw UUID with `safeData.ticketReference || formatTicketReference(safeData.id)`.
- Search & Lookup: Search inputs now accept `ITH-SER-XXXXXXXX`, 8-char shorthand, or full UUID seamlessly.

---

## 5. Files Created and Modified

| File Path                                                         | Nature of Change                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261030000001_service_ticket_reference.sql` | **New**: Column, generator function, immutable trigger, backfill, RPC updates                   |
| `supabase/functions/tests/staff-portal-ticket-reference.test.ts`  | **New**: 12 TDD unit & integration tests covering reference format, search, and layout          |
| `ITHUB_ADMIN/src/lib/ticketReference.ts`                          | **New**: Reference formatting, normalization, search predicate, desk column specifications      |
| `src/lib/ticketReference.ts`                                      | **New**: Storefront mirror of ticket reference helpers                                          |
| `supabase/schema.sql`                                             | **Modified**: Added `ticket_reference text unique` to canonical schema                          |
| `src/data/catalog.ts`                                             | **Modified**: Added `ticketReference?: string` to `ServiceRequest`                              |
| `src/lib/services.ts`                                             | **Modified**: Added `ticketReference` to types, mappings, search fallback, and booking creation |
| `src/pages/Services.tsx`                                          | **Modified**: Display unified ticket reference, accept reference in search and URL routing      |
| `ITHUB_ADMIN/src/lib/services.ts`                                 | **Modified**: Added `ticket_reference` to `ServiceRecord`, search query, and lookup             |
| `ITHUB_ADMIN/src/lib/serviceAlerts.ts`                            | **Modified**: Added `ticketReference` to alerts, updated alert message formatting               |
| `ITHUB_ADMIN/src/pages/Services.tsx`                              | **Modified**: Table colgroup `w-[150px]`, `align-middle` cells, reference badge, mobile cards   |
| `ITHUB_ADMIN/src/components/ServiceDetailModal.tsx`               | **Modified**: Modal header reference, WhatsApp bill message reference                           |
| `ITHUB_ADMIN/src/pages/Dashboard.tsx`                             | **Modified**: Alert ticket ID display using unified reference                                   |

---

## 6. Verification and Regression Test Results

### 1. Staff Portal Test Suite (`npm run test:portal`)

```
running 64 tests from 6 test suites:
- staff-portal-auth.test.ts: 14 passed
- staff-portal-quotations.test.ts: 5 passed
- staff-portal-responsive-ui.test.ts: 13 passed
- staff-portal-reviews-and-sell.test.ts: 9 passed
- staff-portal-services.test.ts: 11 passed
- staff-portal-ticket-reference.test.ts: 12 passed
Result: 64 passed, 0 failed (549ms)
```

### 2. Service Operations & Booking Suite

```
- service-method-alerts.test.ts: 15 passed
- service-reschedule-restriction.test.ts: 10 passed
- service-booking-methods.test.ts: 30 passed
Result: 55 passed, 0 failed (108ms)
```

### 3. Migration Verification (`npm run verify:migrations`)

```
Verified 19 sequential database migrations and canonical schema.sql successfully.
```

### 4. TypeScript Typechecks

- Storefront (`npm run typecheck`): `tsc --noEmit` exited with code 0 (clean).
- Staff Portal (`npm --prefix ITHUB_ADMIN run typecheck`): `tsc --noEmit` exited with code 0 (clean).

### 5. Production Builds

- Storefront (`npm run build`): Vite build completed in 1.62s (clean).
- Staff Portal (`npm --prefix ITHUB_ADMIN run build`): Vite build completed in 606ms (clean).

### 6. Dev Servers

- Storefront Dev Server on `http://localhost:8443` -> HTTP 200 OK.
- Staff Portal Dev Server on `http://localhost:5174` -> HTTP 200 OK.
