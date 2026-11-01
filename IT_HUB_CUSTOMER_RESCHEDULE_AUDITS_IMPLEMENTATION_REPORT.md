# IT HUB — Customer Rescheduling, Staff Portal Notifications & Customer Audits Implementation Report

**Author:** IT HUB Engineering Team  
**Date:** October 31, 2026  
**Status:** Production-Ready & Fully Verified  
**Target Environments:** Customer Storefront (`http://localhost:8443`) & Staff Portal (`http://localhost:5174`)  
**Test Suite:** 677 passed, 0 failed across 43 suites (`npm test`)

---

## 1. Executive Summary & Architectural Overview

This release completes an end-to-end integration across the customer-facing storefront and the staff portal (`ITHUB_ADMIN`), introducing dedicated self-service appointment rescheduling, live numerical notification badges, navigation harmonization, and a new Field Audits & Location Management module.

### Core Architectural Decisions & Mandates

1. **Mandatory Staff Approval on Rescheduling:** An appointment is never rescheduled automatically when submitted by a customer. The original scheduled date and time remain active until an authorized staff member explicitly approves the request via the Staff Portal desk.
2. **Strict Intake Method Restriction:** Customer self-service rescheduling is strictly restricted to **On-site Technician Visits**. In-store walk-ins and insured courier shipments are explicitly identified as ineligible, accompanied by explanatory guidance.
3. **No Silent GPS Tracking & Strict Privacy:** Customer location data, field observations, and internal notes are guarded by strict staff-only PostgreSQL Row-Level Security (RLS) policies. No location or audit records are exposed through public storefront queries.
4. **Live Realtime Deduplication:** Sidebar badge counters compute actionable items across PC Quotations, Service Tickets, and Sell Requests in real time, preventing double-counting when tickets share statuses and pending request rows.

---

## 2. Phase-by-Phase Implementation Details

### Phase 1: Customer Profile Navigation Cleanup

- **Settings Option Removal:** In [`src/components/AccountNavDropdown.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/components/AccountNavDropdown.tsx), the `{ id: "settings", name: "Settings", Icon: Settings }` item was removed from the canonical customer navigation list.
- **Dedicated Reschedule Item:** Added `{ id: "reschedule", name: "Reschedule Appointment", Icon: CalendarClock }` directly beneath Services in the account navigation list.
- **Direct Route Preservation:** Direct navigation to `/account/settings` remains fully functional in [`src/pages/Account.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Account.tsx), preventing the "Account section not found" fallback if a user accesses the URL directly.
- **Staff Portal Settings Preserved:** Staff Portal `/settings` was completely preserved in `ITHUB_ADMIN`.

### Phase 2: Customer Reschedule Module (`/account/reschedule`)

Implemented [`src/components/CustomerRescheduleManager.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/components/CustomerRescheduleManager.tsx) and wired it into [`src/pages/Account.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Account.tsx#L916):

- **Partitioning & Eligibility:**
  - **Eligible On-site Appointments:** Tickets where intake method is On-site Technician Visit, appointment date/time is set, status is non-terminal, and ownership is validated.
  - **Ineligible Service Tickets:** Direct Store Walk-in and Insured Courier tickets are rendered with dedicated badges and explanatory cards:
    - _Store Walk-In:_ "Direct store walk-in tickets do not require appointment rescheduling. Visit our showroom any time during store hours (Mon–Sat, 9:30 AM – 8:00 PM)."
    - _Courier Pickup:_ "Insured courier pickups are scheduled directly with our logistics partner. To modify courier pickup, please contact IT HUB support directly."
  - **Terminal / Historical Tickets:** Completed, cancelled, and returned tickets are excluded from rescheduling.
- **Interactive Reschedule Form:**
  - **Preferred Date:** Validated via `validateRequestedAppointmentDate()`: must be in the future (tomorrow onwards), and cannot fall on a Sunday.
  - **Time Window:** Morning (10:00 AM – 1:00 PM), Afternoon (1:00 PM – 4:00 PM), Evening (4:00 PM – 7:00 PM).
  - **Reason Dropdown:** Structured options including emergency, work conflict, location accessibility, data backup, or custom reasons.
- **State Integrity & Duplicate Prevention:**
  - Sets request status to `pending`.
  - The ticket displays a prominent `Pending Staff Review` badge and active request details card.
  - Duplicate requests for the same appointment are blocked while a pending request is active.
- **Customer Notifications:**
  - Connects to `public.customer_notifications` to display realtime updates when staff review, approve, or reject reschedule requests with notes.

### Phase 3: Staff Portal Sidebar Numerical Indicators

Created [`ITHUB_ADMIN/src/lib/badgeCounts.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/lib/badgeCounts.ts) and integrated into [`ITHUB_ADMIN/src/components/Layout.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/components/Layout.tsx):

- **Live Count Calculations:**
  1. **Dashboard:** Total actionable pending items across the portal without double-counting (`quotations + services + sellRequests`).
  2. **PC Quotations:** Filtered for `enquiry_status in ('New')` in `public.pc_builds`.
  3. **Service Management:** Actionable tickets where `status in ('Booked', 'Reschedule Requested', 'Awaiting Approval')` combined with pending rows in `public.service_appointment_reschedule_requests`. Utilizes a unique ID set so tickets in "Reschedule Requested" status with a pending request row are counted exactly once.
  4. **Sell Requests:** Filtered for `status in ('Pending', 'Under Review')` in `public.sell_requests`.
- **Display Behavior:**
  - Count hidden when 0.
  - Collapsed sidebar (72px): Compact rose notification pill on the icon with count (`99+` for large numbers).
  - Expanded sidebar (260px) & Mobile Drawer: Prominent pill badge beside the navigation label with `<span className="sr-only">pending actionable items</span>`.
  - Debounced Supabase Realtime subscription on all 4 underlying tables.

### Phase 4: Staff Portal Navigation Reordering

In [`ITHUB_ADMIN/src/components/Layout.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/components/Layout.tsx#L55-L125), reordered `navItems` into the exact canonical 8-item sequence:

| Position | Route            | Navigation Label   |        Icon        | Live Badge Source          |
| :------: | :--------------- | :----------------- | :----------------: | :------------------------- |
|  **1**   | `/`              | Dashboard          | `LayoutDashboard`  | `badgeCounts.dashboard`    |
|  **2**   | `/quotations`    | PC Quotations      |       `Cpu`        | `badgeCounts.quotations`   |
|  **3**   | `/services`      | Service Management |      `Wrench`      | `badgeCounts.services`     |
|  **4**   | `/sell-requests` | Sell Requests      | `BadgeIndianRupee` | `badgeCounts.sellRequests` |
|  **5**   | `/content`       | Website Content    |    `ImageIcon`     | None (0)                   |
|  **6**   | `/certificates`  | Certificates       |      `Award`       | None (0)                   |
|  **7**   | `/audits`        | Audits             |  `ClipboardCheck`  | None (0)                   |
|  **8**   | `/settings`      | Settings           |   `SettingsIcon`   | None (0)                   |

### Phase 5: Staff Portal Audits Module (`/audits`)

Created [`ITHUB_ADMIN/src/lib/audits.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/lib/audits.ts) and [`ITHUB_ADMIN/src/pages/Audits.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Audits.tsx):

- **Database Architecture:**
  - Table `public.customer_audits`: stores reference (`ITH-AUD-XXXXXX`), audit type, status (`Pending`, `Scheduled`, `In Progress`, `Completed`, `Cancelled`), purpose, customer details, service ticket link, location info, technical observations, and findings.
  - Table `public.customer_audit_history`: timestamped audit log of every status transition, finding update, and staff attribution.
  - Stored sequence `public.customer_audit_ref_seq` and generator `public.generate_customer_audit_reference()`.
  - Added `'customer_audit'` to `staff_audit_logs_entity_type_check`.
- **Audit Desk User Interface:**
  - **Search & Filters:** Realtime search across reference, customer name, phone, ticket reference, and purpose; filters by status and audit type.
  - **New Audit Modal:** Form for creating field inspections, hardware diagnostic audits, maintenance audits, or showroom intake records with location details and scheduled time windows.
  - **Detail View & Workflow Modal:**
    - Two-column card view with Customer Info and Site Location Details (respects privacy, no silent GPS).
    - Status transition controls (`Pending` → `Scheduled` → `In Progress` → `Completed` / `Cancelled`).
    - Field Findings & Technical Observations editor.
    - Timestamped Audit History Timeline.
- **Route Registration:** Registered `<Route path="/audits" element={<Audits profile={profile} />} />` in [`ITHUB_ADMIN/src/App.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/App.tsx#L112) and title mapping in [`ITHUB_ADMIN/src/lib/uiHelpers.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/lib/uiHelpers.ts#L18).

### Phase 6: Realtime & Stored Procedure Workflow

- **Migration Applied:** `supabase/migrations/20261031000006_customer_rescheduling_notifications_and_audits.sql` applied to local PostgreSQL database.
- **Realtime Publications:** `customer_audits` and `customer_notifications` added to `supabase_realtime` publication.
- **Atomic Stored Procedures:**
  - `customer_request_appointment_reschedule`: validates ownership, checks intake method eligibility (On-site only), verifies non-terminal status, validates future non-Sunday date, prevents duplicates, inserts pending request row, creates staff notification, and creates customer notification.
  - `staff_decide_appointment_reschedule`: atomic approval/rejection with row-level locking (`for update`). On approval, updates `service_requests.preferred_date` and `preferred_slot`, updates status to `Rescheduled`, logs staff audit, and writes to `customer_notifications`.

---

## 3. Verification & Test Evidence

### 1. Automated Test Suite Execution (`npm test`)

```
running 13 tests from ./supabase/functions/tests/customer-reschedule-and-audits.test.ts
NAV-1: Customer account navigation removes Settings and includes Reschedule Appointment ... ok (1ms)
NAV-2: Account.tsx wires up reschedule view and safely preserves direct settings route ... ok (875µs)
RESCHED-1: Customer appointment rescheduling strictly restricted to On-site Technician Visits ... ok (157µs)
RESCHED-2: validateRequestedAppointmentDate strictly enforces future dates and Sunday closure ... ok (255µs)
RESCHED-3: CustomerRescheduleManager displays guidance for ineligible walk-in and courier tickets ... ok (822µs)
RESCHED-4: CustomerRescheduleManager displays pending staff review badge and prevents duplicates ... ok (581µs)
BADGES-1: badgeCounts.ts queries actionable counts without double-counting ... ok (530µs)
BADGES-2: Layout.tsx renders badge pill/dot indicators with accessibility labels ... ok (597µs)
NAV-REORDER-1: Layout.tsx defines the exact canonical 8-item navigation order ... ok (798µs)
AUDITS-1: audits.ts provides full CRUD, reference format, and history tracking ... ok (575µs)
AUDITS-2: Audits.tsx renders table, search, filters, create modal, and detail modal ... ok (691µs)
AUDITS-3: App.tsx registers /audits route between Certificates and Settings ... ok (721µs)
DB-1: Migration 20261031000006 creates customer_notifications, customer_audits, and audit history ... ok (784µs)

ok | 13 passed | 0 failed (16ms)

Full Suite Result: ok | 677 passed | 0 failed (10s across 43 suites)
```

### 2. TypeScript Compilation Verification

- **Customer Storefront (`npm run typecheck`):**
  ```
  > figma-make-app@1.0.0 typecheck
  > tsc --noEmit
  (0 errors, exited with code 0)
  ```
- **Staff Portal (`npm --prefix ITHUB_ADMIN run typecheck`):**
  ```
  > ithub-admin-portal@1.0.0 typecheck
  > tsc --noEmit
  (0 errors, exited with code 0)
  ```

### 3. Production Build Verification

- **Customer Storefront (`npm run build`):** Succeeded in 1.17s.
- **Staff Portal (`npm --prefix ITHUB_ADMIN run build`):** Succeeded in 579ms.

---

## 4. Summary of Modified & Created Files

| File Path                                                                               |   Type    | Key Role & Changes                                                                                                                                                                                                                   |
| :-------------------------------------------------------------------------------------- | :-------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261031000006_customer_rescheduling_notifications_and_audits.sql` | Migration | Created `customer_notifications`, `customer_audits`, `customer_audit_history`, RLS policies, audit reference sequence, updated reschedule RPCs with customer notifications.                                                          |
| `src/components/AccountNavDropdown.tsx`                                                 | Component | Removed "Settings" from navigation array; added "Reschedule Appointment" (`reschedule`) with `CalendarClock`.                                                                                                                        |
| `src/components/CustomerRescheduleManager.tsx`                                          | Component | Created dedicated customer reschedule module with on-site filtering, ineligible ticket guidance, date/slot form, pending status badge, and notifications list.                                                                       |
| `src/lib/customerNotifications.ts`                                                      |    Lib    | Created customer notifications data fetcher, read marker, and Realtime subscription.                                                                                                                                                 |
| `src/pages/Account.tsx`                                                                 |   Page    | Integrated `<CustomerRescheduleManager />` for `section === "reschedule"`; preserved direct access to `/account/settings`.                                                                                                           |
| `src/data/catalog.ts`                                                                   |   Types   | Added `rescheduleDetails?: any;` to `ServiceRequest`.                                                                                                                                                                                |
| `src/lib/services.ts`                                                                   |    Lib    | Added `rescheduleDetails` mapping to `mapDbServiceRequest`.                                                                                                                                                                          |
| `ITHUB_ADMIN/src/lib/badgeCounts.ts`                                                    |    Lib    | Created live numerical indicator calculator for Dashboard, Quotations (`New`), Services (`Booked`, `Reschedule Requested`, `Awaiting Approval`, pending requests), and Sell Requests (`Pending`, `Under Review`) with Realtime sync. |
| `ITHUB_ADMIN/src/lib/audits.ts`                                                         |    Lib    | Created Customer Audits data layer: `fetchAudits`, `fetchAuditById`, `createAudit`, `updateAuditRecord`.                                                                                                                             |
| `ITHUB_ADMIN/src/pages/Audits.tsx`                                                      |   Page    | Created Staff Portal Audits module with reference `ITH-AUD-XXXXXX`, search, filters, create modal, detail modal, and audit history timeline.                                                                                         |
| `ITHUB_ADMIN/src/components/Layout.tsx`                                                 | Component | Reordered navigation to exact 8 items; integrated live badge counts with collapsed icon pills and expanded label badges.                                                                                                             |
| `ITHUB_ADMIN/src/App.tsx`                                                               |    App    | Registered route `/audits` between Certificates and Settings.                                                                                                                                                                        |
| `ITHUB_ADMIN/src/lib/uiHelpers.ts`                                                      |    Lib    | Added `/audits` title mapping ("Customer Audits").                                                                                                                                                                                   |
| `supabase/functions/tests/customer-reschedule-and-audits.test.ts`                       |   Test    | Created 13 automated tests verifying navigation cleanup, method restriction, form validation, badge counts, reordering, audits CRUD, and database RLS.                                                                               |
| `supabase/functions/tests/mobile-account-ui.test.ts`                                    |   Test    | Updated canonical sections assertion to verify `reschedule` present and `settings` removed from navigation dropdown.                                                                                                                 |
| `task.md`                                                                               |    Doc    | Updated roadmap matrix with Milestone 14 (677 passed tests).                                                                                                                                                                         |
