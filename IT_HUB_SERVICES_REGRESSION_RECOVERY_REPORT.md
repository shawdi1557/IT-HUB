# IT HUB — Urgent Services Module Regression Investigation & Recovery Report

**Document Status:** Complete & Verified  
**Date:** October 31, 2026  
**Priority:** Critical  
**Target:** Customer Storefront (`/services`, `/services/book`, `/track-service`) & Staff Portal (`ITHUB_ADMIN`)  
**Location:** IT HUB Computer & Laptop Service Center, AM Road, Near Private Bus Stand, Kothamangalam, Kerala — 686691

---

## 1. Executive Summary

This investigation was initiated following the regression of the IT HUB Services module on the customer storefront. The visible `/services/book` flow unexpectedly reverted from the modern, dynamic, method-adapted 5/6-step service workbench to an older, static 6-step booking wizard (`1. Device`, `2. Problem`, `3. Service method`, `4. Your details`, `5. Date & time`, `6. Confirm`).

A thorough forensic audit of the repository, Git history, transcript logs, and active components has identified the **exact root cause**:
During the execution of a prior request (_"Service Page Cleanup: Remove Three Unwanted Sections"_, conversation `79e32285-d119-4974-93bc-ccce296fa7fd`), the agent executed `git checkout src/pages/Services.tsx` at step 445 and step 534 to undo an edit conflict. This inadvertently wiped the uncommitted modern `ServiceBooking` component from the working tree, replacing it with the legacy 6-step wizard present in Git `HEAD` (`969698f`). The agent then pruned the 3 requested sections from `Services()` without realizing that `ServiceBooking` in the same file had regressed to the early October legacy prototype.

All backend RPCs, database migrations, domain validation utilities in `src/lib/services.ts`, and test suites in `supabase/functions/tests/service-booking-methods.test.ts` remained fully intact. We recovered the full modern `ServiceBooking` component from transcript step 481 of conversation `b3a960b3-11bd-4178-8461-796292592c1a`.

Following recovery, end-to-end verification via Chrome CDP headless browser automation and all 685 automated regression tests confirmed 100% compliance across both the customer storefront and the Staff Portal.

---

## 2. Phase 1 — Root Cause Investigation & Audit Findings

### 2.1 Route Configuration (`src/app/App.tsx`)

The routing configuration in `src/app/App.tsx` was verified:

```tsx
{ path: "services", Component: Services },
{ path: "services/book", Component: ServiceBooking },
{ path: "services/development", Component: DevRequest },
{ path: "service-success/:id", Component: ServiceSuccess },
{ path: "track-service", Component: ServiceTracking },
{ path: "track-service/:id", Component: ServiceTracking },
```

All four components (`Services`, `ServiceBooking`, `ServiceSuccess`, `ServiceTracking`) are lazy-loaded directly from `src/pages/Services.tsx`. There are no secondary or shadow route definitions.

### 2.2 Component Rendered at `/services`

The landing page component `Services()` in `src/pages/Services.tsx`:

- Renders `<OurServices bleedTop />` with categories (PC Service, Laptop Services, Mobile Services, Website Solutions, Printer Services).
- Renders 4 trust policy badges (90-Day Warranty, Fair Diagnostic Policy, Genuine OEM Parts, Kothamangalam Lab).
- Renders the WhatsApp preliminary photo/video diagnostic card.
- Renders the embedded Quick Tracker lookup widget with live status timelines.
- Renders the 90-day warranty FAQ and policies.
- Renders the 7-step "How Service Works" pipeline.
- Renders the Authorized Manufacturer Directory cross-link.
- The 3 unwanted sections (_Hardware & Software Solutions_, _Commercial Estimator_, _Service Delivery Radius_) were cleanly removed as requested in Prompt #2.
- **Link destination behavior:** When customers click any service card in `<OurServices />` (e.g. "PC Service", "Laptop Services", "Mobile Services", "Printer Services"), each card links to `/services/book?service=...`. This transfers the customer to `ServiceBooking`.

### 2.3 Component Previously Rendered at `/services/book`

In `src/pages/Services.tsx` lines 513–917, `ServiceBooking()` had reverted to:

```tsx
const steps = ["Device", "Problem", "Service method", "Your details", "Date & time", "Confirm"];
```

This legacy implementation exhibited the following regressions:

1. **Static 6-step pipeline:** Inflexible array that forced Courier customers through an irrelevant "Date & time" step, generating invalid/fake appointment dates.
2. **Compact form scale:** Constrained to `max-w-2xl` (672px) with small inputs instead of the spacious `max-w-[960px]` workbench layout with 52–56px touch/mouse targets.
3. **Missing field validation:** Lacked whitespace-only problem rejection, lacked Indian 10-digit mobile validation (`validateCustomerMobile`), and lacked Kerala PIN code verification.
4. **Missing mandatory semantics:** No red asterisks (`*`), no `aria-required`, and no automatic focus on invalid fields (`focusFirstError`).
5. **Missing logistics fee clarity:** Lacked clear breakdown between Direct Walk-In (₹0), Doorstep Technician Visit (₹250 doorstep callout), and Insured Courier (₹150 return delivery fee).

### 2.4 Git & Commit History Audit

- **Branch:** `feature/staff-portal-service-pc`.
- **Commit `ba5e3d4` & `f73b709`:** Added backend quotation approvals, itemized billing, and payment modals.
- **Commit `969698f` (`HEAD` of `main`):** Resolved CI validation failure and upgraded oxfmt to v0.74. At this commit, `src/pages/Services.tsx` still contained the legacy `ServiceBooking` component because the enhanced wizard was being iteratively developed in the workspace.
- **Conversation `b3a960b3-11bd-4178-8461-796292592c1a` (Oct 28–29):**
  - Modern `ServiceBooking` was implemented at step 481 in `src/pages/Services.tsx`.
  - Automated tests (`service-booking-methods.test.ts`, 30 tests) and validation helpers (`src/lib/services.ts`) were added and passed.
  - Verification was completed with Chrome CDP (`scratch/run-browser-tests.ts`).
  - Report `service-booking-workflow-implementation-report.md` was generated.
  - Changes in `src/pages/Services.tsx` remained uncommitted in the working tree.
- **Conversation `79e32285-d119-4974-93bc-ccce296fa7fd` (Oct 31, 10:56 AM):**
  - While fulfilling the request to remove 3 sections (_Hardware & Software Solutions_, _Commercial Estimator_, _Service Delivery Radius_), the agent ran:
    ```bash
    git checkout src/pages/Services.tsx
    ```
  - This destroyed the uncommitted enhanced `ServiceBooking` in the working tree, reverting the file to `969698f`.
  - The agent then re-applied the 3-section deletion to `Services()` on top of the legacy file, inadvertently leaving the legacy `ServiceBooking` in place.

### 2.5 Audit Checklist & Verification Matrix

| Audit Item                             | Question                                                       | Verification Result                                                                                                                |
| :------------------------------------- | :------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **1. Current Route Config**            | Which component is mapped to `/services` and `/services/book`? | Both mapped to `src/pages/Services.tsx` (`Services` and `ServiceBooking`).                                                         |
| **2. Active Component at `/services`** | What does `/services` render?                                  | Modern landing page with `<OurServices />`, trust cards, WhatsApp card, Quick Tracker, policies, and 7-step guide.                 |
| **3. Available Newer Components**      | Did a newer `ServiceBooking` exist?                            | Yes, recovered from audit logs (Step 481 of conversation `b3a960b3`).                                                              |
| **4. Git Commits & Branches**          | What branch and commits are active?                            | `feature/staff-portal-service-pc` on top of `main` (`969698f`).                                                                    |
| **5. Recent Merges / Resets**          | Was there a merge or reset?                                    | Yes, `git checkout src/pages/Services.tsx` was run on Oct 31 at 10:56 AM during section cleanup.                                   |
| **6. Feature Flags**                   | Are any feature flags hiding the new flow?                     | None. Pure component state regression.                                                                                             |
| **7. Component Imports**               | Were required imports present?                                 | Missing dynamic step helpers (`getWizardStepsForMethod`, `validateDoorstepPin`, `SERVICE_FEES`, etc.) in `src/pages/Services.tsx`. |
| **8. Newer Implementation Status**     | Was the newer implementation still accessible?                 | Fully recoverable from transcript and scratch automation suites.                                                                   |
| **9. Stale Dev Server Cache**          | Was Vite serving stale code?                                   | No, Vite HMR was healthy and accurately serving current file contents.                                                             |
| **10. Duplicate Page Files**           | Were there duplicate `Services*.tsx` files?                    | None. Single authoritative file `src/pages/Services.tsx`.                                                                          |

---

## 3. Phase 2 — Recovery Execution & Invariants Preserved

### 3.1 Non-Negotiable Invariants Maintained

1. **Preserved Customer-Facing Landing Page Cleanup:** Did **NOT** restore the 3 unwanted sections (_Hardware & Software Solutions_, _Commercial Estimator_, _Service Delivery Radius_) removed in Prompt #2.
2. **Preserved All Recent Features:**
   - Reschedule Modal (`CustomerRescheduleManager`, `isRescheduleEligible`, `ALLOWED_TIME_SLOTS`)
   - Canonical Ticket References (`ITH-SER-XXXXXXXX`, `resolveTicketByReferenceOrId`)
   - Quotation Approval & Itemized Breakdown (`QuotationApprovalPanel`)
   - Mock/Real Razorpay Payment Integration (`RepairPaymentModal`)
3. **Restored Modern `ServiceBooking`:**
   - 960px max width workbench scale (`max-w-[960px]`)
   - Large touch/mouse inputs (`h-13 sm:h-14`, 52–56px)
   - Dynamic 5 vs 6 step pipeline (`getWizardStepsForMethod`):
     - **Direct Store Walk-In (6 Steps):** Device → Problem → Method → Details → Date & Time → Confirm (₹0 logistics fee, store intake receipt).
     - **Doorstep Technician Visit (6 Steps):** Device (Model mandatory) → Problem → Method (₹250 callout) → Details (Address & ~15km PIN) → Date & Time → Confirm.
     - **Insured Courier Pickup & Return (5 Steps):** Device (Model mandatory) → Problem → Method (₹150 return fee) → Details (Return address & Kerala PIN) → Confirm (**Date & Time step strictly omitted**, no fake appointment timestamps).
   - Validation & Error Accessibility:
     - Mandatory indicators with red asterisks (`*`) and `aria-required`.
     - Whitespace-only rejection on problem and model fields.
     - Indian 10-digit mobile validation (`validateCustomerMobile`).
     - Auto-focus and scroll to first invalid field on error (`focusFirstError`).
   - Secure RPC Booking Submission:
     - Calls `create_service_booking` with structured address details and debouncing.
     - Generates canonical `ITH-SER-XXXXXXXX` reference and private guest tracking token.

### 3.2 Database & Backend Preservation

- **Zero Schema Changes Required:** All migrations (`20261026000007`, `20261029000001`, `20261030000001`, `20261030000002`, `20261031000001` through `20261031000007`) remain intact.
- **Zero Data Impact:** No tables dropped, no records overwritten, no test mocks introduced in place of Supabase RPCs.

---

## 4. Phase 4 — Routing & Component Verification

Direct verification across all customer storefront and Staff Portal routes:

| Route                     | Target Component       | HTTP Status | Verified Functionality                                                              |
| :------------------------ | :--------------------- | :---------: | :---------------------------------------------------------------------------------- |
| `/services`               | `Services`             |   200 OK    | Category cards, trust badges, WhatsApp triage, Quick Tracker, policies, 7 steps.    |
| `/services/book`          | `ServiceBooking`       |   200 OK    | Modern 960px form, 56px inputs, dynamic 5/6-step adaptation, PIN validation.        |
| `/track-service`          | `ServiceTracking`      |   200 OK    | Lookup by canonical `ITH-SER-XXXXXXXX` or UUID, masked privacy, status timelines.   |
| `/account/reschedule`     | `Account`              |   200 OK    | Restricted to eligible on-site tickets, Monday–Saturday calendar validation.        |
| `localhost:5174/services` | Staff Portal Services  |   200 OK    | Ticket list, service method badges, scheduling, quotation revisions, audit logging. |
| `localhost:5174/audits`   | Staff Portal Analytics |   200 OK    | Visitor Analytics KPI dashboard, session timeline, Excel (.xlsx) export.            |

---

## 5. Phase 5 — Automated Testing & Verification Results

### 5.1 Chrome Headless CDP Browser Automation (`scratch/run-browser-tests.ts`)

```
=============================================================
  SERVICE BOOKING WIZARD — CHROME HEADLESS BROWSER VERIFICATION
=============================================================

1. Spawning Chrome with remote debugging on port 9222...
SUCCESS: Connected to Chrome CDP at ws://127.0.0.1:9222/devtools/page/...

2. Initializing storefront and authenticating via customer OTP flow...
- LoginGate button clicked: true
- Switch to Email button clicked: true
- Email credentials submitted: true

3. Verifying Form Scale & Responsive Dimensions...
Scale Metrics: {
  "hasWizardContainer": true,
  "containerMaxWidth": "960px",
  "modelInputHeight": "56px",
  "deviceCardCount": 4,
  "deviceCardHeight": "150px",
  "hasProgressNav": true
}
✓ Wizard Container Max-Width: 960px (matches ~960px desktop requirement)
✓ Input Height: 56px (Comfortable 50-56px)

4. Verifying Mandatory Indicators (Red Asterisks & Required Semantics)...
Mandatory Semantics: {
  "hasHeadingRequiredAsterisk": true,
  "headingAsteriskText": "*",
  "modelAriaRequiredWalkIn": null
}

5. Testing Workflow 1: Direct Store Walk-In (6 Steps)...
Walk-In Step Pipeline: {
  "stepCount": 6,
  "stepNames": ["Device", "Problem", "Service Method", "Your Details", "Date & Time", "Confirm"],
  "hasDateStep": true
}
✓ Direct Store Walk-In correctly presents 6 steps including Date & Time

6. Testing Workflow 3: Insured Courier Pickup & Return (Dynamic Step Recalculation)...
Courier Step Recalculation Result: {
  "courierStepCount": 5,
  "courierStepNames": ["Device", "Problem", "Service Method", "Your Details", "Confirm"],
  "hasDateStep": false
}
✓ Insured Courier successfully recalculates to exactly 5 steps (Date & Time omitted!)

7. Verifying Courier Step Progression (Method -> Details -> Confirm)...
Courier Confirmation Inspection: {
  "isConfirmHeadingVisible": true,
  "showsReturnDeliveryFee": true,
  "showsCentralWorkshop": true,
  "showsReturnDestination": true,
  "hasAppointmentSlot": false
}
✓ Courier confirmation screen displays ₹150 return fee, central workshop, return destination, and strictly OMITS appointment slot!

8. Testing Validation: Empty & Whitespace-only Problem Description Rejection...
- Clicked Step 1 (Problem) pill: true
Whitespace Validation Result: {
  "errorVisible": true,
  "errorMessage": "Please select or describe the issue you are facing."
}
✓ Whitespace-only problem description correctly prevented progression with error: Please select or describe the issue you are facing.

=============================================================
  ALL HEADLESS BROWSER VERIFICATIONS COMPLETED SUCCESSFULLY!
=============================================================
```

### 5.2 Service Booking Domain Suite (`service-booking-methods.test.ts`)

- **Total Tests:** 30
- **Passed:** 30
- **Failed:** 0
- **Execution Time:** 11 ms

### 5.3 Full Regression Test Baseline (`npm test`)

- **Total Tests:** 685
- **Passed:** 685
- **Failed:** 0
- **Execution Time:** 9 s

### 5.4 Build & Typecheck Health

- **Storefront TypeScript (`npm run typecheck`):** 0 errors.
- **Storefront Build (`npm run build`):** Vite v8.3.2 built in 1.42s.
- **Staff Portal TypeScript (`npm --prefix ITHUB_ADMIN run typecheck`):** 0 errors.
- **Staff Portal Build (`npm --prefix ITHUB_ADMIN run build`):** Vite v8.3.5 built in 703ms.

---

## 6. Conclusion & Remaining Issues

- **Recovery Outcome:** The latest intended Services ecosystem has been 100% recovered and verified.
- **Clean State:** The 3 unwanted sections remain cleanly omitted from `/services`.
- **Remaining Issues:** None. The platform is healthy, fully tested, and ready.
