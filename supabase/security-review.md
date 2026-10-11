# IT HUB — Database Schema Security, Integrity & Architecture Review

**Project:** IT HUB E-Commerce & IT Services Platform (Kerala, India)  
**Target Environment:** Supabase PostgreSQL (v15+) with Supabase Auth, Storage, and Edge Functions  
**Application Roles:** `admin`, `customer`, `anon` (unauthenticated visitor), `service_role` (trusted backend)  
**Audit Scope:** Full Database Schema, Storage, Migrations, Razorpay Integration, and Test Suite  

---

## 1. Executive Summary & Traceability Matrix

This security audit reviews and hardens the IT HUB database architecture. Every identified vulnerability has been resolved in the implementation, mapped to an exact code location, and paired with an isolated test case in [`test-plan.md`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/test-plan.md).

### Security Claim Traceability Matrix

| Security Claim / Vulnerability | Severity | Implementing Code Location | Test Case ID | Security Status |
| :--- | :--- | :--- | :--- | :--- |
| **1. Wholesale `cost_price` shielded from public access** | Critical | [`schema.sql#L1765-L1775`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1765-L1775), [`migration.sql#L1010-L1016`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L1010-L1016) | **TEST-05** | Fixed in code — not runtime-verified |
| **2. Mandatory `mrp` validation (`mrp >= price`)** | High | [`schema.sql#L148`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L148), [`migration.sql#L48-L56`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L48-L56) | **TEST-06** | Fixed in code — not runtime-verified |
| **3. Client-forged prices & direct order inserts rejected** | Critical | [`schema.sql#L1036-L1248`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1036-L1248), [`migration.sql#L470-L612`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L470-L612) | **TEST-07**, **TEST-08** | Fixed in code — not runtime-verified |
| **4. Negative inventory prevention under concurrent checkouts** | Critical | [`schema.sql#L1100-L1128`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1100-L1128), [`migration.sql#L510-L536`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L510-L536) | **TEST-09** | Fixed in code — not runtime-verified |
| **5. Unpaid checkout stock release via 30m reservation TTL** | High | [`schema.sql#L1542-L1579`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1542-L1579), [`migration.sql#L870-L905`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L870-L905) | **TEST-10A** | Fixed in code — not runtime-verified |
| **6. Double stock restoration prevention (idempotency)** | High | [`schema.sql#L1568-L1572`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1568-L1572), [`schema.sql#L1250-L1262`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1250-L1262) | **TEST-10B**, **TEST-11** | Fixed in code — not runtime-verified |
| **7. Late-payment atomic stock re-reservation or refund alert** | High | [`schema.sql#L1334-L1383`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1334-L1383), [`migration.sql#L735-L784`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L735-L784) | **TEST-10C** | Fixed in code — not runtime-verified |
| **8. Direct client invocation of `record_order_payment` blocked** | Critical | [`schema.sql#L1799-L1801`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1799-L1801), [`migration.sql#L1035-L1038`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L1035-L1038) | **TEST-12** | Fixed in code — not runtime-verified |
| **9. Razorpay checkout callback HMAC verification** | Critical | [`functions/verify-checkout-callback/index.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/verify-checkout-callback/index.ts) | **TEST-14E-CB** | Fixed in code — not runtime-verified |
| **10. Asynchronous webhook raw-body HMAC verification** | Critical | [`functions/verify-razorpay-webhook/index.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/verify-razorpay-webhook/index.ts) | **TEST-14E-WH** | Fixed in code — not runtime-verified |
| **11. Webhook duplicate delivery idempotency** | High | [`schema.sql#L1310-L1324`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1310-L1324), [`migration.sql#L710-L724`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L710-L724) | **TEST-14A** | Fixed in code — not runtime-verified |
| **12. Reject mismatched Razorpay order ID** | High | [`schema.sql#L1304-L1308`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1304-L1308), [`migration.sql#L704-L708`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L704-L708) | **TEST-14B** | Fixed in code — not runtime-verified |
| **13. Reject amount and currency mismatches** | High | [`schema.sql#L1291-L1328`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1291-L1328), [`migration.sql#L691-L728`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L691-L728) | **TEST-14C**, **TEST-14D** | Fixed in code — not runtime-verified |
| **14. One-time coupon redemption per customer enforced** | High | [`schema.sql#L409-L417`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L409-L417), [`schema.sql#L1385-L1430`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1385-L1430) | **TEST-15A** | Fixed in code — not runtime-verified |
| **15. Block concurrent checkouts with same single-use coupon** | High | [`schema.sql#L1155-L1166`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1155-L1166), [`migration.sql#L555-L566`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L555-L566) | **TEST-15B** | Fixed in code — not runtime-verified |
| **16. Post-payment coupon conflict audit reconciliation** | Medium | [`schema.sql#L1395-L1412`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1395-L1412), [`migration.sql#L795-L812`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L795-L812) | **TEST-15C** | Fixed in code — not runtime-verified |
| **17. Customer service request quote & technician locked** | Medium | [`schema.sql#L487-L538`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L487-L538), [`migration.sql#L230-L280`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql#L230-L280) | **TEST-17**, **TEST-18** | Fixed in code — not runtime-verified |
| **18. Storage cross-customer invoice access blocked** | Critical | [`storage-policies.sql#L145-L153`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/storage-policies.sql#L145-L153) | **TEST-19A** | Fixed in code — not runtime-verified |
| **19. Storage upload & delete restricted to owned Pending request** | High | [`storage-policies.sql#L104-L135`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/storage-policies.sql#L104-L135) | **TEST-19B**, **TEST-19C** | Fixed in code — not runtime-verified |
| **20. SVG disallowed in product images (XSS defense)** | High | [`storage-policies.sql#L18-L22`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/storage-policies.sql#L18-L22) | **TEST-19D** | Fixed in code — not runtime-verified |
| **21. IP masking & proxy header extraction in analytics** | Low | [`schema.sql#L685-L755`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L685-L755), [`schema.sql#L1515-L1538`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1515-L1538) | **TEST-20** | Fixed in code — not runtime-verified |

---

## 2. Razorpay Verification: Checkout Callbacks vs. Asynchronous Webhooks

The platform implements two strictly separated verification pathways for Razorpay payments. Never conflate their secrets, request structures, or execution semantics:

```
                                  RAZORPAY GATEWAY
                                  ┌──────────────┐
                                  │   Gateway    │
                                  └──────┬───────┘
                     Path A: Synchronous │ Path B: Asynchronous
                     Checkout Callback   │ Webhook Delivery
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
   [ Browser Checkout Modal ]                     [ Razorpay Webhook Engine ]
   POST /verify-checkout-callback                 POST /verify-razorpay-webhook
   Header: Authorization: Bearer <jwt>            Header: X-Razorpay-Signature: <hmac>
                 │                                               │
                 ▼                                               ▼
   [ Edge Function: Callback Handler ]            [ Edge Function: Webhook Handler ]
   Secret: RAZORPAY_KEY_SECRET                    Secret: RAZORPAY_WEBHOOK_SECRET
   HMAC over: order_id + "|" + payment_id         HMAC over: Raw HTTP request body bytes
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         ▼
                            [ Supabase PostgreSQL ]
                          RPC: record_order_payment()
                          Called ONLY by service_role
                          Pessimistic lock: FOR UPDATE
                          Strict amount & currency checks
                          Atomic stock re-reservation / alert
                          Single-use coupon enforcement
```

### Comparative Breakdown

| Verification Property | Path A: Checkout Callback Verification | Path B: Asynchronous Webhook Verification |
| :--- | :--- | :--- |
| **Initiator** | Client browser via Razorpay modal `handler(response)` | Razorpay gateway servers via HTTP POST |
| **Endpoint** | `POST /functions/v1/verify-checkout-callback` | `POST /functions/v1/verify-razorpay-webhook` |
| **Secret Used** | **`RAZORPAY_KEY_SECRET`** | **`RAZORPAY_WEBHOOK_SECRET`** |
| **Signature Payload** | `${razorpay_order_id}\|${razorpay_payment_id}` string | Exact raw HTTP request body bytes (`req.text()`) |
| **Caller Authentication** | Supabase Auth JWT (`Authorization: Bearer <token>`) | `X-Razorpay-Signature` cryptographic header |
| **Network Reliance** | Depends on client browser remaining open | Operates asynchronously even if user closes tab |
| **Secondary Validation** | Calls Razorpay REST API `GET /v1/payments/{id}` to verify captured state | Parses gateway event (`payment.captured` / `order.paid`) |
| **Database Call** | `record_order_payment(...)` via `service_role` | `record_order_payment(...)` via `service_role` |

---

## 3. Inventory & Coupon Concurrency Architecture

### A. Late-Payment Atomic Stock Re-Reservation
If a customer completes payment after their 30-minute checkout window has expired (or after an administrative auto-cancellation):
1. [`record_order_payment()`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1334-L1383) acquires pessimistic row locks (`FOR UPDATE`) on each required product in `inventory` in **deterministic ascending order** (`order by product_id`) to prevent deadlock conditions.
2. If stock is available for all items: stock is decremented immediately, `orders.stock_reserved` is re-enabled (`true`), and the order transitions to `Processing` / `Paid`.
3. If stock is unavailable (e.g. items were purchased by another shopper in the interim):
   - Inventory is **NOT** decremented (preventing negative inventory).
   - The order is marked `payment_status = 'Paid'`, but remains `status = 'Cancelled'`.
   - An explicit reconciliation audit note is appended to `orders.notes`:
     `[RECONCILIATION REQUIRED: Paid ₹... post-expiration but items out of stock. Action: Restock or initiate Razorpay refund.]`
   - Returns `{ ok: true, stock_re_reserved: false, alert: '...' }` so merchant operations can intervene immediately.

### B. Single-Use Coupon Invariant & Conflict Auditing
1. **Pre-Payment Defense ([`create_order()`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1155-L1166)):**
   - Acquires `FOR UPDATE` on `coupons`.
   - Validates validity dates, min order value, and global usage limit (`times_used < total_usage_limit`).
   - Checks `coupon_usages` to ensure the customer has never redeemed the coupon.
   - Blocks the customer from holding multiple concurrent pending checkouts with the same coupon.
2. **Post-Payment Conflict Reconciliation ([`record_order_payment()`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1385-L1430)):**
   - If two checkouts race before payment and both succeed at the bank, the database does **NOT** fail fatally (which would leave the customer charged but unrecorded).
   - The order is marked `payment_status = 'Paid'`, but flags `coupon_conflict: true` and writes an audit alert note to `orders.notes`:
     `[COUPON CONFLICT ALERT: Duplicate redemption or limit exceeded post-payment. Discount of ₹... was applied in error. Action: Collect difference or adjust tax invoice]`
   - If no conflict: records redemption in `coupon_usages` and increments `coupons.times_used` atomically.

---

## 4. Staging Setup & Deployment Checklist

### A. Supabase Vault / Edge Function Environment Variables
Configure the following secrets in the Supabase Dashboard (**Project Settings $\rightarrow$ Edge Functions / Secrets**):

```bash
# Razorpay API Credentials
supabase secrets set RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxxxx"
supabase secrets set RAZORPAY_KEY_SECRET="[CONFIDENTIAL_RAZORPAY_KEY_SECRET]"
supabase secrets set RAZORPAY_WEBHOOK_SECRET="[CONFIDENTIAL_RAZORPAY_WEBHOOK_SECRET]"

# Internal Supabase Service Credentials
supabase secrets set SUPABASE_URL="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="[ANON_KEY]"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="[SERVICE_ROLE_KEY]"
```

### B. Edge Functions Deployment
Deploy the three Edge Functions:
```bash
# 1. Razorpay Order Creation (Client authenticated)
supabase functions deploy create-razorpay-order

# 2. Razorpay Checkout Callback Verification (Client authenticated)
supabase functions deploy verify-checkout-callback

# 3. Razorpay Asynchronous Webhook Verification (Gateway authenticated)
supabase functions deploy verify-razorpay-webhook --no-verify-jwt
```

### C. Recurring Automated Tasks (`pg_cron`)
Ensure `pg_cron` is enabled in Supabase extensions, then schedule the cleanup jobs:
```sql
-- Clean expired checkouts and release reserved stock every 5 minutes
select cron.schedule('cleanup-expired-orders', '*/5 * * * *', 'select cleanup_expired_orders();');

-- Purge visitor analytics data beyond retention window daily at 03:00 UTC
select cron.schedule('purge-visitor-data', '0 3 * * *', 'select purge_visitor_data();');
```

---

## 5. Rollback & Recovery Procedures

### Safe Rollback of Migration
If [`migration.sql`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql) encounters an unexpected constraint failure during deployment:
1. The script is wrapped in a single transaction (`BEGIN ... COMMIT;`). Any failure will automatically trigger a clean transaction abort with zero changes committed.
2. If the migration was committed and needs manual reversion:
   - Revert view definitions: `DROP VIEW IF EXISTS products_public; DROP VIEW IF EXISTS live_offers;` and re-create previous definitions.
   - Drop newly introduced RPCs: `DROP FUNCTION IF EXISTS record_order_payment(uuid, text, text, text, numeric, text);`.
   - The added columns (`mrp`, `second_hand`, `condition`, `expires_at`, `stock_reserved`) are nullable or have defaults and do not break existing queries.

---

## 6. Unexecuted Tests & Verification Constraints

The following tests remain **unexecuted on live infrastructure** because this session operates without an active, connected Supabase PostgreSQL instance:
1. **TEST-01 through TEST-14D, TEST-15A through TEST-20:** All database unit and security tests in [`test-plan.md`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/test-plan.md) are classified as **`Executable but not run`**. They have been syntactically and logically validated against PostgreSQL 15 standards, but must be executed against a disposable staging database prior to production promotion.
2. **TEST-14E-CB & TEST-14E-WH:** Cryptographic verification tests require an active Razorpay test mode account and live HTTP calls to Supabase Edge Functions. They are classified as **`Requires manual configuration`**.
