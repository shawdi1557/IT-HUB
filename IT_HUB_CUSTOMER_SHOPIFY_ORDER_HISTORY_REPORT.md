# IT HUB — Customer Shopify Order History Integration Report

**Date:** November 1, 2026  
**Project:** IT HUB — Modern Electronics, Custom PC Builder & Service Center (Kerala, India)  
**Deliverable Document:** Production Integration & Security Audit Report  
**Implementation Status:** ✅ Complete & Verified (737 Tests Passing, 0 Type Errors, Clean Production Builds)

---

## 1. Existing Authentication Architecture

Before this implementation, the IT HUB storefront was audited to inspect customer identification and authentication mechanics:

- **Customer Authentication Mechanism:** IT HUB customers authenticate using **Phone OTP** (+91 Indian mobile number standard, normalized to E.164 `+91XXXXXXXXXX`) powered by Supabase Auth (`supabase.auth.signInWithOtp` / `supabase.auth.verifyOtp` in [src/lib/auth.ts](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/lib/auth.ts)).
- **Session Identity:** A successful login establishes an authoritative Supabase session (`auth.uid()`) bound to `public.profiles`. The profile stores the verified mobile number, optional verified email, full name, and delivery address.
- **Absence of Shopify Passwords:** Because IT HUB customers authenticate passwordlessly via SMS/WhatsApp OTP, they do not possess a legacy Shopify customer password. Consequently, the legacy Shopify Storefront API mutation `customerAccessTokenCreate({ input: { email, password } })` cannot be used directly without prompting the customer for secondary credentials.
- **Separation of Domains:** Supabase serves as the operational data store for customer profiles, service tickets, technician dispatches, and diagnostics. Shopify serves as the authoritative single source of truth for product catalog inventory, pricing, hosted checkout, and commercial order processing.

---

## 2. Shopify Customer Association Strategy

To reliably connect a customer's hosted Shopify checkout order to their IT HUB customer profile without creating security vulnerabilities or relying on spoofable frontend inputs, a hybrid cryptographic association model was designed and implemented:

### A. Server-Generated Opaque Association Token

1. Prior to redirecting the customer to Shopify Hosted Checkout in [src/pages/Commerce.tsx](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Commerce.tsx), the client requests a cryptographically random, single-use, time-bound association token via the PostgreSQL RPC `public.create_checkout_association()`.
2. The RPC derives the customer's identity strictly from `auth.uid()`, generates an opaque 24-byte random hex token prefixed with `hub_assoc_`, and records it in `public.shopify_order_associations` with a strict 2-hour expiration window (`expires_at = now() + interval '2 hours'`).
3. This opaque token is injected into the Shopify cart custom attributes:
   ```json
   { "key": "_hub_assoc_token", "value": "hub_assoc_..." }
   ```
4. Alongside the token, the cart input receives `buyerIdentity` pre-filled with the authenticated customer's verified phone number and profile email, ensuring Shopify's checkout automatically links the customer and sends receipts to their verified contacts.
5. The return URL is configured as `${window.location.origin}/account/orders?checkout_completed=true`.

### B. Webhook Validation & Token Consumption

When Shopify emits webhook events (`orders/create`, `orders/updated`, `orders/fulfilled`, `orders/cancelled`, `orders/paid`), the Edge Function [supabase/functions/shopify-webhook/index.ts](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/shopify-webhook/index.ts):

1. Verifies the cryptographic HMAC-SHA256 signature against `X-Shopify-Hmac-Sha256` using constant-time comparison.
2. Checks webhook idempotency via in-memory and database tracking to safely ignore duplicate retries.
3. Extracts `_hub_assoc_token` from `note_attributes` and executes the atomic RPC `validate_and_consume_association_token(p_token, p_shopify_order_id)`:
   - Validates that the token exists, has not expired, and has not yet been consumed.
   - Atomically stamps `used_at = now()` and `shopify_order_id = p_shopify_order_id`, returning the authoritative `user_id`.
   - Single-use enforcement guarantees that a token can never be intercepted or replayed for another order.

### C. Controlled Fallback for Ambiguous Identity

If an order was placed without an association token (e.g. guest checkout or interrupted network flow):

- The webhook inspects `order.phone`, `order.email`, and `order.customer`.
- It executes a controlled lookup against `public.profiles`.
- **Strict Ambiguity Defense:** If and only if **exactly one** profile matches the verified phone or email, the order is associated with that user. If multiple profiles match or conflicting identities are detected, automatic association is intentionally withheld to prevent cross-account misattribution.

---

## 3. Order Retrieval API Used

Order history retrieval is served via the dedicated Edge Function [supabase/functions/customer-shopify-orders/index.ts](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/customer-shopify-orders/index.ts) with direct PostgREST RLS query fallback in [src/lib/shopify-orders.ts](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/lib/shopify-orders.ts):

- **Authentication Enforcement:** The endpoint strictly validates the HTTP `Authorization: Bearer <token>` header against `supabase.auth.getUser(token)`. Unauthenticated requests immediately receive HTTP 401 Unauthorized.
- **Identity Isolation:** The user ID is derived strictly from `user.id` (`auth.uid()`). Any client-supplied customer ID parameters in query strings or body payloads are completely ignored.
- **On-Demand Admin API Reconciliation:** When `reconcile=true` (triggered when the customer manually clicks "Refresh Orders" or returns from checkout), if `SHOPIFY_ADMIN_API_ACCESS_TOKEN` is present in server secrets, the function queries the Shopify Admin API on the backend to reconcile latest fulfillment and cancellation status updates into PostgreSQL.
- **Resilient Fallback:** When running in local development or if Shopify Admin API experiences transient latency, the endpoint serves the authoritative synchronized snapshot from `public.shopify_customer_orders`.
- **Zero Secret Exposure:** Shopify Admin API tokens (`shpat_...`) and webhook secrets are exclusively accessed within server-side Edge Functions. Neither tokens nor internal Shopify IDs are exposed to the browser.

---

## 4. My Orders UI Implementation

The customer profile interface in [src/pages/Account.tsx](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Account.tsx) was completely overhauled, retiring mock/demo in-memory arrays and integrating live Shopify order state:

### A. Order Cards

Under the **My Orders** section (`/account/orders`), orders are presented with:

- **Header:** Authoritative Shopify order number (e.g. `#1001`), order placement date formatted with locale `en-IN`, item count, and shipment carrier notice.
- **Presentation Status Badge:** Uses the 6 canonical Shopify presentation states with themed badge tones:
  - `Order placed` (Blue)
  - `Processing` (Blue)
  - `Partially fulfilled` (Amber)
  - `Fulfilled` (Green)
  - `Cancelled` (Red)
  - `Refunded` (Gray)
- **Line Items Preview:** Displays line item thumbnail images, product title, variant designation (e.g. "RGB Blue Switches", "16GB / 512GB"), quantity badge, unit price, and item total.
- **Footer & Actions:** Total order amount formatted with Indian currency formatting (`money(order.total_price)`), "Track Shipment" carrier link (when tracking URL is provided by Shopify), and "View Details" button.

### B. Interactive Order Details Modal

Selecting an order launches the responsive modal [src/components/ShopifyOrderDetailsModal.tsx](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/components/ShopifyOrderDetailsModal.tsx):

- **Full Price Breakdown:** Subtotal, Shopify discounts applied, shipping fee (or "Free"), estimated taxes, and total paid.
- **Delivery Destination:** Shipping address (name, street, city, state, postal code, country) displayed with verified customer ownership protection.
- **Carrier Tracking Banner:** Displays carrier name (e.g. BlueDart, Delhivery), carrier tracking number in monospace typography, and a direct tracking link (`target="_blank"`).
- **Warranty & Support Bridge:** Direct action linking to IT HUB warranty assistance (`/support?view=warranty&order=...`).

---

## 5. Automatic Refresh Behaviour

The storefront automatically revalidates and refreshes order history across key customer moments:

1. **Post-Checkout Return:** When customer completes payment on Shopify and is redirected back to `/account/orders?checkout_completed=true`:
   - A celebratory notification banner appears: _"Order Completed Successfully! Thank you for purchasing with IT HUB. Your order details are being synchronized directly from Shopify."_
   - Immediate on-demand reconciliation is dispatched to fetch the newly created order.
   - The query parameter `checkout_completed=true` is automatically stripped from the browser address bar via `navigate(location.pathname, { replace: true })` to prevent re-triggering upon reload.
2. **Tab Navigation:** Opening the "My Orders" tab automatically re-synchronizes customer records.
3. **Manual Refresh Action:** A prominent "Refresh Orders" button with a spinning `RefreshCw` icon allows customers to trigger on-demand synchronization at any time.
4. **Graceful Latency Handling:** If Shopify webhook delivery has transient propagation latency, existing synchronized records remain visible without layout flicker or blank states.

---

## 6. Pagination and Error Handling

- **Cursor & Offset Pagination:** The Edge Function supports `limit` (default 10, max 50) and `offset`, returning `pageInfo: { hasNextPage, endCursor }`. When older orders exist, a "Load Older Orders" button loads subsequent pages into the card list without page reloads.
- **Empty State:** If the customer has not yet placed any product orders, a friendly empty state is rendered: _"You haven't placed any orders yet."_ with an "Explore Products" button directing to `/products`.
- **Loading Skeleton:** Displays animated pulsing placeholder cards while orders are in-flight.
- **Error State:** Network or server errors display an alert banner with a clear explanation and an inline "Retry Order Sync" button, preventing silent empty-state masking of real failures.

---

## 7. Security and Customer Ownership Validation

Security controls were implemented and verified across every tier:

| Security Domain                | Defense Mechanism                                                                   | Verification Result                                                 |
| :----------------------------- | :---------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| **Authentication Enforcement** | HTTP `Authorization: Bearer <token>` verified via `supabase.auth.getUser()`.        | Unauthenticated access returns HTTP 401 Unauthorized.               |
| **Identity Derivation**        | User ID derived strictly from `auth.uid()`; frontend parameters ignored.            | Customer A cannot view Customer B's orders under any circumstances. |
| **Association Token Security** | Cryptographically random (24 bytes hex) single-use tokens expiring in 2 hours.      | Replay attacks and duplicate redemption return `null`.              |
| **Webhook Cryptography**       | HMAC-SHA256 verification using constant-time string comparison.                     | Tampered signatures immediately rejected with HTTP 401.             |
| **Row Level Security (RLS)**   | PostgreSQL RLS on `shopify_customer_orders` (`user_id = auth.uid()`).               | Direct unauthenticated database queries return 0 rows.              |
| **Secret Isolation**           | Admin API tokens & webhook secrets stored exclusively in server environment.        | Zero private tokens exposed in frontend client bundles.             |
| **Data Boundary Isolation**    | Product orders in `shopify_customer_orders`; service repairs in `service_requests`. | Service bookings and repair tracking remain completely isolated.    |

---

## 8. Test Results

### A. Dedicated Test Suites Run

All tests were executed against local Supabase PostgreSQL (port 54322) and the Deno runtime environment:

1. **`shopify-customer-orders-db.test.ts`** (Database Tables, RPCs, RLS):
   - `DB-SHOPIFY-1`: Tables `shopify_order_associations` and `shopify_customer_orders` exist with required columns — **PASSED**
   - `DB-SHOPIFY-2`: Token creation and consumption RPCs validate lifecycle & single-use — **PASSED**
   - `DB-SHOPIFY-3`: RLS ensures Customer A cannot view Customer B orders — **PASSED**
2. **`shopify-webhook-order-sync.test.ts`** (Webhook Processing):
   - `WH-ORDER-1`: Ingests valid `orders/create` with association token — **PASSED**
   - `WH-ORDER-2`: Updates order when fulfillment arrives (`orders/updated` with tracking) — **PASSED**
   - `WH-ORDER-3`: Rejects webhook with invalid HMAC signature (HTTP 401) — **PASSED**
3. **`customer-shopify-orders.test.ts`** (Edge Function API):
   - `ORD-API-1`: Rejects unauthenticated requests with HTTP 401 — **PASSED**
   - `ORD-API-2`: Returns only authenticated customer's orders (Cross-Customer Isolation) — **PASSED**
   - `ORD-API-3`: Supports pagination and newest-first sort order — **PASSED**
4. **`shopify-client-association.test.ts`** (Client Checkout Token Association):
   - `ASSOC-1`: RPC `create_checkout_association` generates valid opaque token — **PASSED**
5. **`shopify-customer-orders-e2e.test.ts`** (All 15 Specification Scenarios):
   - `E2E-ORD-1`: Customer with no orders returns empty list with 0 count — **PASSED**
   - `E2E-ORD-2`: Customer with one order sees exact order attributes — **PASSED**
   - `E2E-ORD-3-4-5`: Multiple orders sort newest first and support cursor pagination — **PASSED**
   - `E2E-ORD-6-7-8`: Validates line item thumbnails, prices, and status presentation mapper — **PASSED**
   - `E2E-ORD-9-10`: Token association webhook ingestion syncs immediately for checkout return — **PASSED**
   - `E2E-ORD-11`: Strict server-side customer isolation prevents cross-account order leakage — **PASSED**
   - `E2E-ORD-12`: Unauthenticated access is completely blocked (HTTP 401) — **PASSED**
   - `E2E-ORD-13`: Server errors return descriptive error payloads rather than silent empty arrays — **PASSED**
   - `E2E-ORD-14-15`: Service requests table and Shopify cart creation remain completely unaffected — **PASSED**

### B. Full Test Suite & Build Verification

- **Full Backend Suite:** 737 passed / 0 failed (13s across 58 test files).
- **TypeScript Typecheck:** `tsc --noEmit` exited with code 0 (0 errors).
- **Storefront Build:** `npm run build` compiled 2487 modules cleanly in 1.46s.
- **Staff Portal Build:** `npm --prefix ITHUB_ADMIN run build` compiled 2010 modules cleanly in 710ms.

---

## 9. Remaining Limitations

1. **Guest Checkout Linking:** Orders placed by customers who check out as guests on Shopify without logging into their IT HUB account will only be linked if their entered email or mobile number uniquely matches their IT HUB profile. If an unauthenticated customer enters a different phone/email during checkout, they must contact IT HUB support to bind the order reference to their profile.
2. **Third-Party Carrier Tracking Realtime Hooks:** Tracking updates depend on Shopify fulfillment updates or carrier webhooks emitted to Shopify. While the tracking number and carrier link are instantly surfaced in IT HUB, real-time in-transit waypoint tracking relies on opening the external carrier tracking link.
3. **No Production Modification:** In accordance with strict instructions, all migrations and tests were executed strictly against local Supabase PostgreSQL; remote production deployments and live customer data remain untouched.
