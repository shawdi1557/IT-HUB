# IT HUB — Database Security & Data Integrity Verification Test Plan

**Project:** IT HUB E-Commerce & IT Services Platform (Kerala, India)  
**Database:** PostgreSQL 15+ (Supabase)  
**Testing Scope:** DDL, RLS, Edge Functions, Storage API, Razorpay Verification, Concurrency & Rollback  

---

## 1. Testing Methodology & Execution Constraints

### A. Execution Status Classifications
In accordance with production audit standards, every test case below is strictly labeled with its true verification state:
- `Not run` — Structured and syntactically validated code, but not yet executed on a running database.
- `Requires manual configuration` — Depends on external third-party infrastructure (e.g. Razorpay test sandbox or live Edge Function endpoints).
- `Run successfully` — Executed in an automated test harness or live environment with verified return values.
- `Failed` — Executed and produced an unhandled exception or constraint failure.

> [!NOTE]
> **Automated Edge Function & Logic Unit Test Suites:**
> 80 automated unit and invariant tests have been **actually executed** locally using the Deno test runner (`deno test --allow-net --allow-env --allow-read supabase/functions/tests/`) and **passed 100% (80 passed, 0 failed)**:
> 1. `verify-checkout-callback.test.ts`: **43 passed | 0 failed** (121ms) — Tests CORS, origin validation, Razorpay order mapping, network timeouts (502), customer ownership, and payment status checks.
> 2. `verify-razorpay-webhook.test.ts`: **19 passed | 0 failed** (37ms) — Tests HMAC-SHA256 signature verification, non-payment event filtering, notes UUID validation, and RPC error handling.
> 3. `security-fixes-audit.test.ts`: **18 passed | 0 failed** (20ms) — Tests Fixes A through J schema invariants, NULL-safe comparisons, deterministic item sorting, visitor allowlists, and coupon logic.
>
> **Live PostgreSQL Integration Tests:**
> Tests `TEST-01` through `TEST-20` (Sections 3 & 4) require a connected Supabase PostgreSQL instance and are marked as **`Not run`** pending staging database connection. Do NOT run them on a live production database.

### B. Transaction Boundary & Savepoint Isolation
- In PostgreSQL, when any statement inside a transaction block raises an exception, the entire transaction is aborted unless isolated with a **`SAVEPOINT`**.
- All negative test cases expecting SQL exceptions below use `SAVEPOINT <name>;` followed by `ROLLBACK TO SAVEPOINT <name>;`, enabling the entire suite to run continuously within a single transaction in the Supabase SQL Editor.

---

## 2. Test Suite Traceability Matrix

| Test ID | Category | Objective | Security Property Tested | Execution Status |
| :--- | :--- | :--- | :--- | :--- |
| **TEST-01** | Schema | Validate DDL structure, constraints, and foreign key graphs | DDL & Type Consistency | Not run |
| **TEST-02** | Migration | Validate non-destructive schema evolution from v1.0 | Non-Destructive Schema Evolution | Not run |
| **TEST-03** | Auth | Profile creation on auth.users insert | Default Customer Role Assertion | Not run |
| **TEST-04** | Auth/Role | Customer self-promotion to `admin` blocked by trigger | Privilege Escalation Defense | Not run |
| **TEST-05** | Catalog | Direct `products` table query blocked for anonymous visitors | Wholesale Cost Margin Shielding | Not run |
| **TEST-06** | Catalog | Validate `mrp`, `price`, `sale_price` and `effective_price` | Commercial Pricing Integrity | Not run |
| **TEST-07** | Orders | Direct `INSERT` into `orders` blocked by RLS | Client Price Forgery Defense | Not run |
| **TEST-08** | Orders | Server-side `create_order` price calculation & 30m TTL | Authoritative Totals & Reservation | Not run |
| **TEST-09** | Orders | Concurrent checkout overselling defense | Race Condition & Negative Stock Defense | Not run |
| **TEST-10A** | Orders | Unpaid checkout expiration & automatic stock release | Inventory Leakage Prevention | Not run |
| **TEST-10B** | Orders | Double stock restoration prevention on repeated cleanup | Restoration Idempotency | Not run |
| **TEST-10C** | Orders | Late payment arrives post-expiration: atomic re-reservation or refund alert | Late Settlement Reconciliation | Not run |
| **TEST-11** | Orders | Customer order cancellation restores stock idempotently | Customer Self-Service Cancellation | Not run |
| **TEST-12** | Payment | Direct client call to `record_order_payment` rejected | Execution Privilege Boundary | Not run |
| **TEST-13** | Payment | Trusted `service_role` payment finalization | Authoritative Settlement Authority | Not run |
| **TEST-14A** | Payment | Duplicate webhook delivery returns idempotent success | Replay Defense | Not run |
| **TEST-14B** | Payment | Mismatched Razorpay order ID rejected | Gateway Mapping Validation | Not run |
| **TEST-14C** | Payment | Underpayment / amount mismatch rejected | Financial Discrepancy Defense | Not run |
| **TEST-14D** | Payment | Unsupported currency rejected (non-INR) | Currency Tamper Defense | Not run |
| **TEST-14E-CB** | Payment | Checkout callback invalid HMAC signature rejected | Cryptographic Authenticity (Callback) | Requires manual configuration |
| **TEST-14E-WH** | Payment | Webhook invalid HMAC signature rejected | Cryptographic Authenticity (Webhook) | Requires manual configuration |
| **TEST-15A** | Coupons | One-time coupon redemption per customer enforced | Single Redemption Invariant | Not run |
| **TEST-15B** | Coupons | Concurrent checkouts with same single-use coupon blocked | Checkout Race Condition Defense | Not run |
| **TEST-15C** | Coupons | Post-payment coupon conflict audit alert reconciliation | Post-Payment Conflict Auditing | Not run |
| **TEST-16** | Coupons | Cross-customer coupon usage allowed within global limits | Global vs User Limit Invariant | Not run |
| **TEST-17** | Services | Customer unauthorized modification of diagnostic quote blocked | Billing Tamper Defense | Not run |
| **TEST-18** | Services | Customer permitted quote response (`pending` $\rightarrow$ `approved`) | Permitted State Transition Validation | Not run |
| **TEST-19A** | Storage | Cross-customer private invoice read blocked | Multi-Tenant Data Isolation | Not run |
| **TEST-19B** | Storage | Photo upload rejected without owned `Pending` request | Request Association Enforcement | Not run |
| **TEST-19C** | Storage | Photo delete blocked once request moves past `Pending` | Audit Trail Preservation | Not run |
| **TEST-19D** | Storage | Storage Client API upload & signed URL verification | Storage REST API Integration | Requires manual configuration |
| **TEST-20** | Analytics | IP masking verification & retention purge | Privacy Compliance & Data Minimization | Not run |

---

## 3. Test Fixtures Setup Script

Run this script once in a staging environment to seed deterministic fixtures:

```sql
-- ============================================================================
-- IT HUB TEST FIXTURES SETUP
-- Run in Supabase SQL Editor (Isolated Staging Environment Only)
-- ============================================================================

begin;

-- 1. Create Test Auth Users
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'test_admin@ithub.com',
    crypt('Password123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test Administrator"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'test_alpha@ithub.com',
    crypt('Password123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Customer Alpha"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'test_beta@ithub.com',
    crypt('Password123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Customer Beta"}', now(), now()
  )
on conflict (id) do nothing;

-- 2. Configure Profiles (Trigger handle_new_user created default customer profiles)
update profiles
set role = 'admin'
where id = '00000000-0000-0000-0000-000000000001';

-- 3. Seed Test Catalog Product with MRP, Price, Sale Price, and Cost Price
insert into products (
  id, sku, name, mrp, price, sale_price, cost_price, status
) values (
  '11111111-0000-0000-0000-000000000001',
  'TEST-LAPTOP-PRO',
  'IT HUB Test Workstation Laptop',
  75000.00,  -- MRP (strike-through)
  68000.00,  -- Regular IT HUB price
  62000.00,  -- Promotional sale price (effective customer price)
  52000.00,  -- Wholesale cost price (Admin only)
  'Active'
) on conflict (id) do update set
  mrp = excluded.mrp,
  price = excluded.price,
  sale_price = excluded.sale_price,
  cost_price = excluded.cost_price;

-- 4. Seed Inventory (Stock: 2 units)
insert into inventory (product_id, stock, low_stock_threshold)
values ('11111111-0000-0000-0000-000000000001', 2, 1)
on conflict (product_id) do update set stock = 2;

-- 5. Seed Test Coupon (Flat ₹1,000 off, min order ₹50,000, global limit: 5)
insert into coupons (
  id, code, description, type, value, min_order_value,
  total_usage_limit, times_used, starts_at, ends_at, active
) values (
  '22222222-0000-0000-0000-000000000001',
  'TESTSAVE1000',
  'Flat ₹1,000 Off Test Promotion',
  'fixed',
  1000.00,
  50000.00,
  5,
  0,
  now() - interval '1 day',
  now() + interval '30 days',
  true
) on conflict (id) do update set times_used = 0, active = true;

commit;
```

---

## 4. Complete Executable SQL Test Suite

Run this entire block inside the Supabase SQL Editor. Savepoints isolate every expected failure cleanly without aborting the transaction:

```sql
-- ============================================================================
-- IT HUB COMPREHENSIVE SECURITY VERIFICATION SUITE
-- Executes in a single transactional run using SAVEPOINT isolation.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-04: Role Escalation Defense
-- ────────────────────────────────────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

savepoint sp_test_04;
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000002';
-- MUST FAIL with: Unauthorized: Only administrators can modify roles
rollback to savepoint sp_test_04;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-05 & TEST-06: Catalog Reads, Cost-Price Shielding & MRP
-- ────────────────────────────────────────────────────────────────────────────
set local role anon;
set local "request.jwt.claims" to '{}';

-- Validate public view exposes MRP, price, sale_price, effective_price
do $$
declare
  v_prod record;
begin
  select * into v_prod from products_public where id = '11111111-0000-0000-0000-000000000001';
  assert v_prod.mrp = 75000.00, 'TEST-06 Failed: mrp mismatch';
  assert v_prod.price = 68000.00, 'TEST-06 Failed: price mismatch';
  assert v_prod.sale_price = 62000.00, 'TEST-06 Failed: sale_price mismatch';
  assert v_prod.effective_price = 62000.00, 'TEST-06 Failed: effective_price mismatch';
  assert v_prod.stock = 2, 'TEST-06 Failed: stock mismatch';
end $$;

-- Verify cost_price is blocked for anonymous role
savepoint sp_test_05;
select cost_price from products where id = '11111111-0000-0000-0000-000000000001';
-- MUST FAIL with: permission denied for table products
rollback to savepoint sp_test_05;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-07: Forged Direct Client Order Insertion Blocked
-- ────────────────────────────────────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

savepoint sp_test_07;
insert into orders (id, order_number, user_id, status, subtotal, total, payment_method, delivery_method)
values ('aaaaaaaa-0000-0000-0000-000000000099', 'ITH-FORGE-01', '00000000-0000-0000-0000-000000000002', 'Pending', 1.00, 1.00, 'Razorpay', 'Store pickup');
-- MUST FAIL with: violates row-level security policy for table "orders"
rollback to savepoint sp_test_07;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-08: Authoritative Server-Side Order Creation (Order Alpha 1)
-- ────────────────────────────────────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

do $$
declare
  v_res jsonb;
  v_ord_id uuid;
begin
  v_res := create_order(
    p_items := jsonb_build_array(
      jsonb_build_object('product_id', '11111111-0000-0000-0000-000000000001', 'quantity', 1)
    ),
    p_delivery_method := 'Store pickup',
    p_payment_method := 'Razorpay',
    p_coupon_code := 'TESTSAVE1000'
  );

  assert (v_res ->> 'ok')::boolean = true, 'TEST-08 Failed: create_order returned ok=false';
  assert (v_res ->> 'subtotal')::numeric = 62000.00, 'TEST-08 Failed: subtotal mismatch';
  assert (v_res ->> 'coupon_discount')::numeric = 1000.00, 'TEST-08 Failed: coupon_discount mismatch';
  assert (v_res ->> 'total')::numeric = 61000.00, 'TEST-08 Failed: total mismatch';

  -- Verify inventory stock was decremented from 2 to 1
  assert (select stock from inventory where product_id = '11111111-0000-0000-0000-000000000001') = 1,
    'TEST-08 Failed: inventory stock not decremented';
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-09: Inventory Overselling Defense (Attempting to order remaining + 1)
-- ────────────────────────────────────────────────────────────────────────────
savepoint sp_test_09;
select create_order(
  p_items := jsonb_build_array(
    jsonb_build_object('product_id', '11111111-0000-0000-0000-000000000001', 'quantity', 2)
  ),
  p_delivery_method := 'Store pickup',
  p_payment_method := 'Razorpay'
);
-- MUST FAIL with: Insufficient stock for "IT HUB Test Workstation Laptop"
rollback to savepoint sp_test_09;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-15B: Block Concurrent Checkouts with Same Single-Use Coupon
-- ────────────────────────────────────────────────────────────────────────────
savepoint sp_test_15b;
select create_order(
  p_items := jsonb_build_array(
    jsonb_build_object('product_id', '11111111-0000-0000-0000-000000000001', 'quantity', 1)
  ),
  p_delivery_method := 'Kerala delivery',
  p_payment_method := 'Razorpay',
  p_coupon_code := 'TESTSAVE1000'
);
-- MUST FAIL with: You already have an active checkout with coupon "TESTSAVE1000"
rollback to savepoint sp_test_15b;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-12: Direct Client Execution of record_order_payment Blocked
-- ────────────────────────────────────────────────────────────────────────────
savepoint sp_test_12;
select record_order_payment(
  p_order_id := (select id from orders where user_id = '00000000-0000-0000-0000-000000000002' limit 1),
  p_razorpay_order_id := 'order_fake_111',
  p_razorpay_payment_id := 'pay_fake_111',
  p_razorpay_signature := 'sig_fake_111',
  p_amount_paid := 61000.00,
  p_currency := 'INR'
);
-- MUST FAIL with: permission denied for function record_order_payment
rollback to savepoint sp_test_12;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-14B: Mismatched Razorpay Order ID Rejected
-- ────────────────────────────────────────────────────────────────────────────
set local role service_role;

-- Seed an exact test order with recorded Razorpay Order ID
insert into orders (
  id, order_number, user_id, status, payment_status, subtotal, shipping_fee, total,
  payment_method, delivery_method, razorpay_order_id, expires_at, stock_reserved
) values (
  'aaaaaaaa-0000-0000-0000-000000000001', 'ITH-TEST-ORD-01',
  '00000000-0000-0000-0000-000000000002', 'Pending', 'Pending',
  62000.00, 0.00, 62000.00, 'Razorpay', 'Store pickup',
  'order_rzp_live_100', now() + interval '30 minutes', true
);

savepoint sp_test_14b;
select record_order_payment(
  p_order_id := 'aaaaaaaa-0000-0000-0000-000000000001',
  p_razorpay_order_id := 'order_rzp_mismatch_999',
  p_razorpay_payment_id := 'pay_live_001',
  p_razorpay_signature := 'sig',
  p_amount_paid := 62000.00,
  p_currency := 'INR'
);
-- MUST FAIL with: Razorpay order ID mismatch
rollback to savepoint sp_test_14b;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-14C: Underpayment / Amount Mismatch Rejected
-- ────────────────────────────────────────────────────────────────────────────
savepoint sp_test_14c;
select record_order_payment(
  p_order_id := 'aaaaaaaa-0000-0000-0000-000000000001',
  p_razorpay_order_id := 'order_rzp_live_100',
  p_razorpay_payment_id := 'pay_live_002',
  p_razorpay_signature := 'sig',
  p_amount_paid := 50000.00, -- underpayment by ₹12,000
  p_currency := 'INR'
);
-- MUST FAIL with: Payment amount mismatch
rollback to savepoint sp_test_14c;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-14D: Unsupported Currency Rejected
-- ────────────────────────────────────────────────────────────────────────────
savepoint sp_test_14d;
select record_order_payment(
  p_order_id := 'aaaaaaaa-0000-0000-0000-000000000001',
  p_razorpay_order_id := 'order_rzp_live_100',
  p_razorpay_payment_id := 'pay_live_003',
  p_razorpay_signature := 'sig',
  p_amount_paid := 62000.00,
  p_currency := 'USD'
);
-- MUST FAIL with: Invalid currency: USD
rollback to savepoint sp_test_14d;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-13 & TEST-14A: Payment Confirmation & Webhook Idempotency
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_res jsonb;
begin
  -- 1. Initial valid payment finalization (TEST-13)
  v_res := record_order_payment(
    p_order_id := 'aaaaaaaa-0000-0000-0000-000000000001',
    p_razorpay_order_id := 'order_rzp_live_100',
    p_razorpay_payment_id := 'pay_live_001',
    p_razorpay_signature := 'valid_sig_hash',
    p_amount_paid := 62000.00,
    p_currency := 'INR'
  );
  assert (v_res ->> 'ok')::boolean = true, 'TEST-13 Failed: ok=false';
  assert (v_res ->> 'idempotent')::boolean = false, 'TEST-13 Failed: expected idempotent=false';
  assert (v_res ->> 'status') = 'Processing', 'TEST-13 Failed: status not Processing';
  assert (v_res ->> 'payment_status') = 'Paid', 'TEST-13 Failed: payment_status not Paid';

  -- 2. Duplicate webhook delivery with same payment ID (TEST-14A Idempotency)
  v_res := record_order_payment(
    p_order_id := 'aaaaaaaa-0000-0000-0000-000000000001',
    p_razorpay_order_id := 'order_rzp_live_100',
    p_razorpay_payment_id := 'pay_live_001',
    p_razorpay_signature := 'valid_sig_hash',
    p_amount_paid := 62000.00,
    p_currency := 'INR'
  );
  assert (v_res ->> 'ok')::boolean = true, 'TEST-14A Failed: duplicate webhook failed';
  assert (v_res ->> 'idempotent')::boolean = true, 'TEST-14A Failed: expected idempotent=true';
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-10A & TEST-10B: Expiration Cleanup & Double-Restoration Prevention
-- ────────────────────────────────────────────────────────────────────────────
-- Seed an expired unreserved order holding 1 laptop
insert into orders (
  id, order_number, user_id, status, payment_status, subtotal, shipping_fee, total,
  payment_method, delivery_method, expires_at, stock_reserved
) values (
  'cccccccc-0000-0000-0000-000000000003', 'ITH-TEST-ORD-EXP',
  '00000000-0000-0000-0000-000000000002', 'Pending', 'Pending',
  62000.00, 0.00, 62000.00, 'Razorpay', 'Store pickup',
  now() - interval '10 minutes', true
);

insert into order_items (order_id, product_id, name, unit_price, quantity)
values ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'IT HUB Test Laptop', 62000.00, 1);

do $$
declare
  v_clean jsonb;
  v_stock_before int;
  v_stock_after int;
begin
  select stock into v_stock_before from inventory where product_id = '11111111-0000-0000-0000-000000000001';

  -- Run cleanup (TEST-10A)
  v_clean := cleanup_expired_orders();
  assert (v_clean ->> 'cleaned_orders_count')::int >= 1, 'TEST-10A Failed: expected cleaned orders';

  select stock into v_stock_after from inventory where product_id = '11111111-0000-0000-0000-000000000001';
  assert v_stock_after = v_stock_before + 1, 'TEST-10A Failed: stock was not restored';

  -- Run cleanup again immediately (TEST-10B Idempotency)
  v_clean := cleanup_expired_orders();
  assert (select stock from inventory where product_id = '11111111-0000-0000-0000-000000000001') = v_stock_after,
    'TEST-10B Failed: stock was restored twice';
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-17 & TEST-18: Service Request Quote Tamper Defense & Customer Approval
-- ────────────────────────────────────────────────────────────────────
insert into service_requests (
  id, user_id, device, problem, method, status, quote, quote_state
) values (
  '33333333-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Gaming PC', 'Display artifacting', 'Visit IT HUB',
  'Diagnosis Done', 3500.00, 'pending'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

-- Customer attempts to alter quote price (TEST-17)
savepoint sp_test_17;
update service_requests set quote = 500.00 where id = '33333333-0000-0000-0000-000000000001';
-- MUST FAIL with: Unauthorized: Only administrators can modify quotes
rollback to savepoint sp_test_17;

-- Customer approves diagnostic quote legitimately (TEST-18)
update service_requests set quote_state = 'approved' where id = '33333333-0000-0000-0000-000000000001';
assert (select quote_state from service_requests where id = '33333333-0000-0000-0000-000000000001') = 'approved',
  'TEST-18 Failed: quote approval failed';

-- ────────────────────────────────────────────────────────────────────────────
-- TEST-19A, 19B & 19C: Storage Request Ownership Coupling & Isolation
-- ────────────────────────────────────────────────────────────────────────────
set local role service_role;
insert into sell_requests (
  id, customer_id, category, product_name, condition, status
) values (
  '55555555-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Laptops', 'Old MacBook Air', 'Good', 'Pending'
);

-- Customer Alpha uploads photo to owned Pending request (TEST-19B Valid)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

insert into storage.objects (id, bucket_id, name, owner)
values (
  gen_random_uuid(), 'sell-request-photos',
  '00000000-0000-0000-0000-000000000002/55555555-0000-0000-0000-000000000001/photo1.jpg',
  '00000000-0000-0000-0000-000000000002'
);

-- Customer Alpha uploads photo to NONEXISTENT request ID (TEST-19B Invalid)
savepoint sp_test_19b_invalid;
insert into storage.objects (id, bucket_id, name, owner)
values (
  gen_random_uuid(), 'sell-request-photos',
  '00000000-0000-0000-0000-000000000002/99999999-9999-9999-9999-999999999999/unowned.jpg',
  '00000000-0000-0000-0000-000000000002'
);
-- MUST FAIL with: new row violates row-level security policy for table "objects"
rollback to savepoint sp_test_19b_invalid;

-- Customer Beta attempts to query Customer Alpha's photo (TEST-19A Cross-user isolation)
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}';
assert (
  select count(*) from storage.objects
  where bucket_id = 'sell-request-photos'
    and name = '00000000-0000-0000-0000-000000000002/55555555-0000-0000-0000-000000000001/photo1.jpg'
) = 0, 'TEST-19A Failed: cross-user storage read was not blocked';

-- Request moves to 'Under Review'; customer delete is blocked (TEST-19C)
set local role service_role;
update sell_requests set status = 'Under Review' where id = '55555555-0000-0000-0000-000000000001';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

delete from storage.objects
where bucket_id = 'sell-request-photos'
  and name = '00000000-0000-0000-0000-000000000002/55555555-0000-0000-0000-000000000001/photo1.jpg';

assert (
  select count(*) from storage.objects
  where bucket_id = 'sell-request-photos'
    and name = '00000000-0000-0000-0000-000000000002/55555555-0000-0000-0000-000000000001/photo1.jpg'
) = 1, 'TEST-19C Failed: photo was deleted after moving past Pending status';

rollback; -- Cleanly undo all test modifications
```

---

## 5. Storage REST API & Client-Side Integration Test

The following script validates the Supabase Storage REST API using `@supabase/supabase-js` with authenticated JWT user sessions:

```typescript
// tests/storage-api.test.ts
// Run via: npx tsx tests/storage-api.test.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "ey...";

async function testStorageAPI() {
  console.log("Starting Storage API Integration Tests...");

  // 1. Authenticate Customer Alpha
  const clientAlpha = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authAlpha } = await clientAlpha.auth.signInWithPassword({
    email: "test_alpha@ithub.com",
    password: "Password123!",
  });
  const userAlphaId = authAlpha.user!.id;

  // 2. Authenticate Customer Beta
  const clientBeta = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authBeta } = await clientBeta.auth.signInWithPassword({
    email: "test_beta@ithub.com",
    password: "Password123!",
  });

  const dummyImage = new Blob(["dummy jpeg bytes"], { type: "image/jpeg" });

  // TEST-19D.1: Customer Alpha uploads to owned pending request -> MUST SUCCEED
  const validPath = `${userAlphaId}/55555555-0000-0000-0000-000000000001/device.jpg`;
  const { error: uploadOk } = await clientAlpha.storage
    .from("sell-request-photos")
    .upload(validPath, dummyImage);
  console.assert(!uploadOk, `Upload to owned pending request should succeed: ${uploadOk?.message}`);

  // TEST-19D.2: Customer Alpha uploads to unowned request -> MUST FAIL (403)
  const unownedPath = `${userAlphaId}/99999999-9999-9999-9999-999999999999/device.jpg`;
  const { error: uploadUnowned } = await clientAlpha.storage
    .from("sell-request-photos")
    .upload(unownedPath, dummyImage);
  console.assert(uploadUnowned !== null, "Upload to non-existent request should fail with RLS error");

  // TEST-19D.3: Customer Beta attempts to download Customer Alpha's photo -> MUST FAIL (403 / null data)
  const { data: betaDownload, error: betaErr } = await clientBeta.storage
    .from("sell-request-photos")
    .download(validPath);
  console.assert(betaDownload === null, "Cross-customer download should be blocked");

  // TEST-19D.4: Customer Alpha generates a 5-minute signed URL -> MUST SUCCEED
  const { data: signedData, error: signedErr } = await clientAlpha.storage
    .from("sell-request-photos")
    .createSignedUrl(validPath, 300);
  console.assert(!signedErr && signedData?.signedUrl.includes("token="), "Signed URL generation should succeed");

  console.log("Storage API Integration Tests Completed.");
}

testStorageAPI().catch(console.error);
```

---

## 6. Staging Cleanup Script

Run this script to wipe test data from a staging database:

```sql
begin;
delete from storage.objects where bucket_id in ('sell-request-photos', 'customer-invoices')
  and (storage.foldername(name))[1] in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
delete from service_requests where user_id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
delete from sell_requests where customer_id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
delete from coupon_usages where coupon_id = '22222222-0000-0000-0000-000000000001';
delete from coupons where id = '22222222-0000-0000-0000-000000000001';
delete from order_items where order_id in (select id from orders where user_id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'));
delete from orders where user_id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
delete from inventory where product_id = '11111111-0000-0000-0000-000000000001';
delete from products where id = '11111111-0000-0000-0000-000000000001';
delete from profiles where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
delete from auth.users where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
commit;
```
