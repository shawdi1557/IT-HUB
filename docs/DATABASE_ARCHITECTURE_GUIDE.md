# IT HUB — Comprehensive Fresh-Install Schema Correction & Database Architecture Guide

This document is the authoritative engineering manual for setting up, securing, and operating the PostgreSQL database on Supabase for **IT HUB** (Kerala, India). It covers the complete schema design, fresh-install procedure, security privilege matrix, authoritative pricing model, inventory concurrency, and operational maintenance.

---

## 1. Executive Summary & Design Principles

IT HUB is an omnichannel e-commerce and computer hardware/repair services platform. The database architecture is designed according to **defense-in-depth** and **zero-trust** principles:

1. **Zero-Trust Client Boundary**: The frontend browser client is strictly an interactive presentation layer. Client requests are never trusted to specify product prices, discounts, order totals, admin privileges, review publication states, service quotes, or payment completion.
2. **Encapsulated Business Logic**: Critical state transitions (order creation, inventory reservation, payment recording, order cancellation, and quote acceptance) are executed through PostgreSQL `SECURITY DEFINER` stored procedures (`plpgsql`) that run in controlled search paths (`search_path = public, pg_temp`).
3. **Pessimistic Concurrency & Lock Determinism**: Multi-row inventory locks are always acquired using `SELECT ... FOR UPDATE` ordered deterministically by `product_id ASC` to prevent deadlocks under heavy concurrent checkout traffic.
4. **Data Isolation via Row Level Security (RLS)**: Every single table in the `public` schema has Row Level Security enabled (`ENABLE ROW LEVEL SECURITY`). Tables storing sensitive operational or financial data are isolated from anonymous and customer access.
5. **Separation of Public Views**: Protected columns (such as product `cost_price` and coupon secret analytics) are never exposed through raw table queries. Public views such as [`public_products`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1078) and [`public_coupons`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1095) provide sanitized projections for frontend consumers.

---

## 2. Architecture & Domain Overview

The database covers 12 core business domains:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             IT HUB DATABASE                              │
├──────────────────────┬──────────────────────┬────────────────────────────┤
│ Product Catalogue    │ E-Commerce & Checkout│ Customer & Services        │
│ • products           │ • orders             │ • profiles                 │
│ • categories         │ • order_items        │ • addresses                │
│ • brands             │ • coupons            │ • wishlists                │
│ • product_images     │ • coupon_usages      │ • reviews                  │
│ • inventory          │ • offers (prod/cat)  │ • service_requests         │
│ • inventory_logs     │ • invoices           │ • sell_requests            │
├──────────────────────┴──────────────────────┼────────────────────────────┤
│ Custom PC Builder & Support                 │ System & Analytics         │
│ • pc_builds                                 │ • visitor_analytics        │
│ • support_categories                        │ • store_settings           │
│ • service_centers                           │ • storage.objects (RLS)    │
└─────────────────────────────────────────────┴────────────────────────────┘
```

---

## 3. Fresh-Install Execution Sequence

To deploy IT HUB on an empty Supabase project, execute the migration and setup scripts in the exact sequence below.

### Step 1: Database Schema Deployment

Execute the canonical schema script:

```bash
# Path: supabase/schema.sql
# In Supabase Dashboard -> SQL Editor, run the full contents of schema.sql
```

This script creates:

- Core extensions (`pgcrypto`, `uuid-ossp`).
- Enum types (`user_role`, `order_status`, `payment_status`, `service_status`, `sell_status`).
- All 20 application tables with primary keys, foreign keys, check constraints, and performance indexes.
- All RLS policies for `anon`, `authenticated`, and `service_role`.
- Triggers for bidirectional field protection, timestamp updates, and inventory creation.
- Stored procedures (RPCs) with exact parameter types and hardened execution grants.

### Step 2: Storage Buckets & Policies

Execute the storage isolation script:

```bash
# Path: supabase/storage-policies.sql
# Run in Supabase SQL Editor
```

This creates and secures 3 storage buckets:

- `product-images` (Public read for active products; upload restricted to Admin; SVGs disallowed to prevent XSS).
- `sell-request-photos` (Private; path-isolated to `{user_id}/{request_id}/*`; Admin full access).
- `customer-invoices` (Strictly private; accessible only by the owning customer or Admin).

### Step 3: Base Configuration & Seed Data

Execute the safe seed script:

```bash
# Path: supabase/seed.sql
# Run in Supabase SQL Editor
```

This populates baseline data without inventing dummy credentials or fake users:

- Default store settings (Kerala GSTIN, contact numbers, delivery fees, operational switches).
- 8 Categories and 5 Subcategories (Laptops, Processors, Graphics Cards, Motherboards, RAM, Storage, etc.).
- 16 Hardware Brands (Intel, AMD, NVIDIA, ASUS, MSI, Corsair, Kingston, Samsung, etc.).
- 7 Support Categories & 4 Kerala Service Centers (Kochi, Trivandrum, Calicut, Thrissur).
- Kerala District Pincode Centroids for distance calculation.
- 4 PC Builder Starter Templates (Entry Office, Budget Gaming, Pro Creator, High-End Enthusiast).

### Step 4: First-Admin Bootstrap (One-Time Trusted Operation)

By default, all new user registrations in Supabase Auth are created as `customer`. To establish the initial administrator safely without exposing public role-escalation APIs:

1. Have the store owner sign up through the regular auth flow (email/password or OTP) to generate their Auth UUID.
2. In the **Supabase Dashboard SQL Editor**, execute the trusted bootstrap RPC:
   ```sql
   SELECT bootstrap_first_admin('00000000-0000-0000-0000-000000000000'::uuid);
   ```
   _(Replace `'00000000-...'` with the user's actual `auth.users.id`)._
3. The function verifies that:
   - The user exists in `auth.users`.
   - The user has not already been assigned a role.
   - Updates `profiles.role = 'admin'` and sets `email_verified = true`.
4. The `bootstrap_first_admin` function is strictly revoked from `public`, `anon`, and `authenticated`. It can **only** be run by `service_role` or a Supabase Superuser.

---

## 4. Privilege & Access Control Matrix

| Table / Object           | Anon (Guest)                                 | Authenticated (Customer)                     | Admin (`role = 'admin'`)   | Edge Functions (`service_role`) |
| :----------------------- | :------------------------------------------- | :------------------------------------------- | :------------------------- | :------------------------------ |
| `products` (raw table)   | Direct Access Blocked (Uses View)            | Direct Access Blocked (Uses View)            | Full CRUD                  | Full CRUD                       |
| `public_products` (view) | `SELECT` (active only; `cost_price` omitted) | `SELECT` (active only; `cost_price` omitted) | N/A (Admin queries table)  | Full Access                     |
| `inventory`              | Blocked                                      | Blocked                                      | Full CRUD                  | Managed via RPCs                |
| `coupons` (raw table)    | Blocked                                      | Blocked                                      | Full CRUD                  | Managed via RPCs                |
| `public_coupons` (view)  | `SELECT` (active & public only)              | `SELECT` (active & public only)              | Full Access                | Full Access                     |
| `orders`                 | Blocked                                      | `SELECT` (own orders only)                   | Full CRUD                  | Managed via RPCs                |
| `order_items`            | Blocked                                      | `SELECT` (items of own orders)               | Full CRUD                  | Managed via RPCs                |
| `profiles`               | Blocked                                      | `SELECT`, `UPDATE` (own row; role protected) | Full CRUD                  | Full CRUD                       |
| `addresses`              | Blocked                                      | Full CRUD (own addresses only)               | Full CRUD                  | Full CRUD                       |
| `reviews`                | Blocked (Uses View)                          | `SELECT` own; `INSERT` (pending only)        | Full CRUD (moderation)     | Full CRUD                       |
| `public_reviews` (view)  | `SELECT` (approved only)                     | `SELECT` (approved only)                     | Full Access                | Full Access                     |
| `service_requests`       | Blocked                                      | `SELECT` own; `INSERT` (customer fields)     | Full CRUD (quotes, status) | Full CRUD                       |
| `sell_requests`          | Blocked                                      | `SELECT` own; `INSERT` / `UPDATE` quotes     | Full CRUD (evaluate, pay)  | Full CRUD                       |
| `pc_builds`              | `SELECT` (shared builds)                     | Full CRUD (own builds)                       | Full CRUD                  | Full CRUD                       |
| `visitor_analytics`      | `INSERT` only (sanitized events)             | `INSERT` only (sanitized events)             | `SELECT`, Delete/Purge     | Full CRUD                       |
| `store_settings`         | `SELECT` (public configs)                    | `SELECT` (public configs)                    | Full CRUD                  | Full CRUD                       |

---

## 5. Stored Procedures (RPCs) & Security Signatures

All RPCs feature strict parameter signatures and role access constraints:

| Stored Procedure                                                                          | Allowed Caller           | Purpose & Guarantees                                                                        |
| :---------------------------------------------------------------------------------------- | :----------------------- | :------------------------------------------------------------------------------------------ |
| [`create_order`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1435)           | `authenticated`          | Atomically validates prices, stocks, and coupons. Deducts inventory and sets 30-min TTL.    |
| [`record_order_payment`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1604)   | `service_role` **ONLY**  | Validates gateway signature, amount, currency. Idempotently marks Paid and commits coupons. |
| [`record_payment_failure`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1829) | `service_role` **ONLY**  | Marks order Failed and releases reserved inventory.                                         |
| [`cancel_order`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1876)           | `authenticated`, `admin` | Customers can cancel Pending unpaid orders only. Restores reserved stock idempotently.      |
| [`cleanup_expired_orders`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1928) | `service_role` **ONLY**  | Scheduled worker; unlocks stock for unpaid checkouts past 30 minutes using `SKIP LOCKED`.   |
| [`bootstrap_first_admin`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1970)  | `service_role` **ONLY**  | One-time trusted admin role assignment.                                                     |

---

## 6. Bi-Directional Field Protection & State Machines

### Service Requests (`service_requests`)

Customers must not be able to assign engineers, set repair costs, or transition repair statuses.

- **Trigger**: `protect_service_request()` runs `BEFORE INSERT OR UPDATE`.
- On `INSERT`: Customers are forced to `status = 'Submitted'`, `cost_estimate = NULL`, `final_cost = NULL`, `assigned_to = NULL`.
- On `UPDATE`: If caller is not admin, changing `status`, `cost_estimate`, `final_cost`, or `assigned_to` raises an exception. Customers can only update notes, address, or contact details.

### Sell / Trade-In Requests (`sell_requests`)

Customers submit used devices for evaluation and quote acceptance.

- **Trigger**: `protect_sell_request()` runs `BEFORE INSERT OR UPDATE`.
- On `INSERT`: Customers cannot self-assign `offered_price` or mark status as anything other than `Pending Review`.
- On `UPDATE`: Admin sets `offered_price` and moves status to `Pending Offer`.
- Customer quote response: Customers can ONLY update `status` if transitioning from `Pending Offer` to `Offer Accepted` or `Offer Rejected`. If an offer has already been accepted/rejected, the state cannot be reverted by the customer.

### Customer Reviews (`reviews`)

- **Trigger**: `protect_review()` runs `BEFORE INSERT OR UPDATE`.
- On `INSERT`: Customers cannot insert a review with `status = 'approved'`. All reviews start as `status = 'pending'`.
- On `UPDATE`: Only administrators can change review moderation status or edit review content.

---

## 7. Authoritative Pricing & Coupon Engine

IT HUB implements a single server-side pricing algorithm executed inside [`create_order`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql#L1435):

1. **Item Price Validation**:
   - Queries `products` directly with `FOR SHARE` lock.
   - `effective_item_price = coalesce(sale_price, regular_price)`.
   - Client-submitted prices are ignored; database unit price is recorded in immutable snapshot `order_items`.
2. **Subtotal Calculation**:
   - $\text{Subtotal} = \sum (\text{effective\_item\_price} \times \text{quantity})$.
3. **Coupon Verification & Deduction**:
   - Verifies active status, start/end dates, minimum order value, and global usage limits (`times_used < total_usage_limit`).
   - Checks that customer has not already used the coupon (`coupon_usages`).
   - Blocks customer from opening multiple concurrent pending checkouts with the same coupon.
   - Calculates discount:
     - If percentage: $\text{Discount} = \min(\text{Subtotal} \times \frac{\text{Value}}{100}, \text{max\_discount})$.
     - If fixed: $\text{Discount} = \min(\text{Value}, \text{Subtotal})$.
4. **Delivery Charge**:
   - If `delivery_method == 'Store pickup'` $\rightarrow$ ₹0.00.
   - If `delivery_method == 'Home delivery'` $\rightarrow$ ₹99.00 flat fee across Kerala.
5. **Final Total**:
   $$\text{Order Total} = \max(0, \text{Subtotal} - \text{Coupon Discount}) + \text{Shipping Fee}$$

---

## 8. Storage Buckets & File Security

Storage policies in [`supabase/storage-policies.sql`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/storage-policies.sql) implement folder-level isolation:

| Bucket                | Access Policy                                   | Allowed MIME Types                                                  |
| :-------------------- | :---------------------------------------------- | :------------------------------------------------------------------ |
| `product-images`      | Public read; Admin upload/delete                | `image/jpeg`, `image/png`, `image/webp`, `image/avif` (SVG blocked) |
| `sell-request-photos` | Read: Request Owner + Admin; Upload: Customer   | `image/jpeg`, `image/png`, `image/webp`                             |
| `customer-invoices`   | Read: Order Owner + Admin; Upload: Backend only | `application/pdf`                                                   |

---

## 9. Rollback & Disaster Recovery

If a schema installation fails mid-way on a non-production test instance:

1. Review the error message in the SQL editor (often due to out-of-order execution or duplicate type definitions).
2. Clean teardown order:
   ```sql
   -- Drop views first
   DROP VIEW IF EXISTS public_reviews, public_coupons, public_products CASCADE;
   -- Drop tables in reverse foreign key order
   DROP TABLE IF EXISTS visitor_analytics, pc_builds, service_centers, support_categories,
     customer_invoices, reviews, wishlists, service_requests, sell_requests,
     coupon_usages, coupons, offers, order_items, orders, inventory_logs,
     inventory, product_images, products, brands, categories, addresses,
     profiles, store_settings CASCADE;
   -- Drop custom types
   DROP TYPE IF EXISTS sell_status, service_status, payment_status, order_status, user_role CASCADE;
   ```
3. Re-run [`supabase/schema.sql`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql) from the top.
