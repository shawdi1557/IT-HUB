# Shopify Order History Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully functional, secure **My Orders** section in the customer Account/Profile (`/account/orders`) displaying authoritative Shopify product orders via a hybrid synchronization architecture (cryptographically verified Shopify webhook ingestion + authenticated on-demand server reconciliation) while strictly isolating Supabase service requests and protecting against customer spoofing.

**Architecture:**

- **Checkout Token Association:** When an authenticated customer initiates Shopify checkout, the server generates a cryptographically random, single-use, scoped association token (`_hub_assoc_token`) tied to `auth.uid()`, injected into Shopify cart attributes alongside buyer identity.
- **Webhook Ingestion (`shopify-webhook`):** Validates `X-Shopify-Hmac-Sha256`, enforces idempotency, validates `_hub_assoc_token` from order note attributes (with controlled single-profile phone/email fallback for ambiguous checkouts), and upserts authoritative order snapshot metadata into `public.shopify_customer_orders`.
- **Server-Side Order Reconciliation API (`customer-shopify-orders`):** Validates customer JWT bearer token (`auth.uid()`), performs on-demand reconciliation with Shopify Admin API (if credentials configured) or serves authoritative synchronized orders from `shopify_customer_orders` with cursor-based pagination and zero cross-customer data leakage.
- **Customer Profile UI (`src/pages/Account.tsx`):** Replaces legacy mock demo orders with real Shopify order cards, product thumbnails, fulfillment/payment status badges, line item totals, interactive order details modal with full price breakdown and tracking links, auto-refresh on checkout return (`?checkout_completed=true`), pull-to-refresh, loading skeletons, and friendly empty/error states.

**Tech Stack:** React 19, TypeScript 5.7, Tailwind CSS v4, Supabase (PostgreSQL 15, PostgREST, Edge Functions in Deno), Shopify Storefront & Admin APIs.

**Spec:** User request: "IT HUB – Shopify Order History Integration with Customer Profile"

---

## Global Constraints

- Shopify remains the single authoritative source of truth for product orders, prices, inventory, payment, and fulfillment states.
- Supabase service requests, repairs, and diagnostics remain completely separate from product orders.
- Never trust customer IDs or arbitrary email addresses supplied directly by the frontend.
- Customer identity must be strictly derived from verified Supabase JWT (`auth.uid()`).
- Never expose Shopify Admin API access tokens or webhook signing secrets in frontend code.
- Opaque association tokens must be single-use and time-bound.
- All database mutations to `shopify_customer_orders` and `shopify_order_associations` restricted to `service_role`.
- React components must be exported as default exports (or named where canonical).
- Zero regression on existing service bookings, service tracking, Razorpay service payments, and customer authentication.

---

## Review Focus

1. **Unauthenticated or Expired Token Attempt:** User without valid Supabase session attempts to fetch `/customer-shopify-orders` -> Expected: HTTP 401 Unauthorized with no order data leakage.
2. **Cross-Customer Order Isolation:** Customer A with valid JWT attempts to retrieve Customer B's order -> Expected: Only Customer A's orders returned; Customer B's orders are completely invisible.
3. **Ambiguous / Conflicting Guest Checkout:** Order arrives via webhook with no association token and an email matching two different accounts -> Expected: Identity conflict flagged, order not mistakenly bound to the wrong user.
4. **Idempotent Webhook Processing:** Duplicate delivery of `orders/create` or `orders/updated` with the same `X-Shopify-Webhook-Id` -> Expected: Skipped gracefully with HTTP 200 without duplicate database rows or status degradation.
5. **Shopify API Outage / Network Delay During Refresh:** Customer opens My Orders while Shopify API has transient latency -> Expected: Serves existing synchronized snapshot with subtle background sync indicator; does not show empty state or break UI.

---

### Task 1: Database Migration for Order Association & Synchronized Order Metadata

**Files:**

- Create: `supabase/migrations/20261101000002_shopify_customer_orders.sql`
- Modify: `supabase/schema.sql`
- Test: `supabase/functions/tests/shopify-customer-orders-db.test.ts`

**Interfaces:**

- Produces:
  - Table `public.shopify_order_associations` (`id`, `token`, `user_id`, `expires_at`, `used_at`, `created_at`)
  - Table `public.shopify_customer_orders` (`id`, `user_id`, `shopify_order_id`, `order_number`, `created_at`, `financial_status`, `fulfillment_status`, `currency_code`, `total_price`, `subtotal_price`, `total_shipping`, `total_tax`, `total_discount`, `tracking_company`, `tracking_number`, `tracking_url`, `line_items`, `shipping_address`, `synced_at`)
  - RPC `create_checkout_association()` returns `text` (token)
  - RPC `validate_and_consume_association_token(p_token text, p_shopify_order_id text)` returns `uuid` (user_id)
  - RLS policies ensuring customers can only `SELECT` their own `shopify_customer_orders` where `user_id = auth.uid()`.

- [ ] **Step 1: Write database migration script**
      Create `supabase/migrations/20261101000002_shopify_customer_orders.sql` with tables, indexes, RLS policies, and helper RPCs.
- [ ] **Step 2: Apply migration to local Supabase PostgreSQL**
      Run `npx supabase db query` or `npx supabase migration up` to execute the migration.
- [ ] **Step 3: Update `supabase/schema.sql`**
      Synchronize table definitions and RLS policies into `supabase/schema.sql`.
- [ ] **Step 4: Write and run verification test**
      Verify table structures, foreign keys, RLS isolation, and RPC token generation/consumption using Deno test.

---

### Task 2: Server-Side Webhook Handler Enhancement for Order Synchronization

**Files:**

- Modify: `supabase/functions/shopify-webhook/index.ts`
- Modify: `supabase/functions/_shared/shopify-webhook.ts`
- Test: `supabase/functions/tests/shopify-webhook-order-sync.test.ts`

**Interfaces:**

- Consumes: `_hub_assoc_token` from `note_attributes` / `custom_attributes`
- Produces: Upserted `shopify_customer_orders` record bound to authenticated `user_id`

- [ ] **Step 1: Write failing test for webhook order ingestion**
      Test covers HMAC verification, token association matching, single-profile phone/email fallback, idempotency, and status updates (fulfilled, cancelled, refunded).
- [ ] **Step 2: Implement order topic handlers in `shopify-webhook/index.ts`**
      Handle topics: `orders/create`, `orders/updated`, `orders/fulfilled`, `orders/cancelled`, `orders/paid`.
      Parse line items, pricing breakdown, shipping address, and tracking info.
- [ ] **Step 3: Implement token redemption and fallback identity resolution**
      Call `validate_and_consume_association_token`. If absent, resolve unique matching profile by phone/email with conflict checks.
- [ ] **Step 4: Run webhook tests to verify all cases pass**
      Run `deno test -A supabase/functions/tests/shopify-webhook-order-sync.test.ts`.

---

### Task 3: Edge Function for Authenticated Customer Order Retrieval & Reconciliation

**Files:**

- Create: `supabase/functions/customer-shopify-orders/index.ts`
- Test: `supabase/functions/tests/customer-shopify-orders.test.ts`

**Interfaces:**

- Consumes: Customer JWT `Authorization: Bearer <token>`
- Produces: `{ ok: true, orders: ShopifyCustomerOrder[], pageInfo: { hasNextPage, endCursor } }`

- [ ] **Step 1: Write failing test for `customer-shopify-orders`**
      Test unauthenticated rejection (401), cross-customer data isolation, pagination, newest-first ordering, and on-demand reconciliation.
- [ ] **Step 2: Implement `customer-shopify-orders/index.ts`**
      Validate bearer token with `supabase.auth.getUser()`, extract `auth.uid()`, query `shopify_customer_orders` with pagination (`limit`, `cursor`), and execute on-demand Admin API sync if configured.
- [ ] **Step 3: Run tests to verify pass**
      Run `deno test -A supabase/functions/tests/customer-shopify-orders.test.ts`.

---

### Task 4: Storefront Client Service & Checkout Association Binding

**Files:**

- Create: `src/lib/shopify-orders.ts`
- Modify: `src/lib/shopify.ts`
- Modify: `src/pages/Commerce.tsx`
- Test: `supabase/functions/tests/shopify-client-association.test.ts`

**Interfaces:**

- `fetchCustomerShopifyOrders(options?: { refresh?: boolean; cursor?: string; limit?: number })`
- `createCheckoutAssociationToken()`
- Modified `createShopifyCart()` passing `_hub_assoc_token` in attributes and `buyerIdentity`

- [ ] **Step 1: Create `src/lib/shopify-orders.ts`**
      Implement client API service connecting to `customer-shopify-orders` Edge Function with auth session header, cache invalidation, and pagination.
- [ ] **Step 2: Update `createShopifyCart` in `src/lib/shopify.ts`**
      Support injecting `buyerIdentity` and custom attributes cleanly.
- [ ] **Step 3: Update checkout flow in `src/pages/Commerce.tsx`**
      When customer is logged in, request association token and pass return URL `/account/orders?checkout_completed=true`.
- [ ] **Step 4: Verify with automated tests**

---

### Task 5: Customer Profile "My Orders" UI & Order Details Modal

**Files:**

- Create: `src/components/ShopifyOrderDetailsModal.tsx`
- Modify: `src/pages/Account.tsx`
- Modify: `src/components/Layout.tsx` (ensure clean navigation indicators)

**Interfaces:**

- Renders:
  - Order card list with Shopify order numbers, dates, statuses, totals, item thumbnails
  - Detailed modal view with price breakdown, taxes, shipping, tracking links
  - Auto-refresh trigger on `?checkout_completed=true` with toast notice
  - Refresh button with spinner
  - Loading skeleton and retryable error state
  - Friendly empty state with "Shop Products" button

- [ ] **Step 1: Build `ShopifyOrderDetailsModal.tsx`**
      Component displaying complete order breakdown, items, address, tracking info, and help links.
- [ ] **Step 2: Update `src/pages/Account.tsx` orders section**
      Wire real `useCustomerOrders` hook / state machine, replacing the legacy `store.orders` mock mapping.
- [ ] **Step 3: Implement auto-refresh and checkout completion banner**
      Detect URL query param `checkout_completed=true`, trigger immediate order sync, and display feedback.
- [ ] **Step 4: Verify UI across desktop and mobile**
      Check responsive layout, status badge colors, and accessibility.

---

### Task 6: End-to-End Testing, Security Review & Deliverable Report

**Files:**

- Test: `supabase/functions/tests/shopify-customer-orders-e2e.test.ts`
- Create: `IT_HUB_CUSTOMER_SHOPIFY_ORDER_HISTORY_REPORT.md`
- Modify: `task.md`

- [ ] **Step 1: Run comprehensive test suite**
      Verify all 15 scenarios from user prompt: empty state, single order, multiple orders, sort order, pagination, images/quantities, totals, fulfillment/payment states, checkout refresh, delayed availability, cross-customer isolation, unauthenticated access, error handling, service bookings untouched, checkout untouched.
- [ ] **Step 2: Run storefront typechecks and production build**
      Run `npm run typecheck` and `npm run build`.
- [ ] **Step 3: Conduct security review**
      Verify zero exposure of Admin API tokens or secrets, verify HMAC enforcement, verify JWT authentication.
- [ ] **Step 4: Produce deliverable document**
      Write `IT_HUB_CUSTOMER_SHOPIFY_ORDER_HISTORY_REPORT.md` in root.
- [ ] **Step 5: Update `task.md`**
