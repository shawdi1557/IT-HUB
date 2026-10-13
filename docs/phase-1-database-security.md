# Phase 1: Database Foundation, Relational Integrity & Security Hardening

**Status**: Completed  
**Delivered Files**: [`supabase/schema.sql`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/schema.sql), [`supabase/migration.sql`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/migration.sql), [`supabase/seed.sql`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/seed.sql)

---

## 1. Objectives & Scope

- **Objective 1**: Design and deploy a production-grade PostgreSQL 15 schema covering all IT HUB business domains (Catalog, Commerce, Services, Brand Warranty, PC Builder, Analytics).
- **Objective 2**: Harden all Row Level Security (RLS) policies and address Supabase security linter warnings.
- **Objective 3**: Eliminate optimization side-channel leaks by converting default security definer views to security invoker barrier views.
- **Objective 4**: Shield wholesale pricing data (`cost_price`) from exposure to unauthorized roles (`anon` and `authenticated`).
- **Objective 5**: Optimize database query plans by resolving subquery re-evaluations and creating covering foreign key indexes.

---

## 2. Technical Architecture & Security Model

```mermaid
flowchart TD
    subgraph CallerRoles["Caller Roles"]
        Anon["anon (Guest)"]
        Auth["authenticated (Customer)"]
        AdminRole["authenticated (Admin Profile)"]
    end

    subgraph SecurityBoundary["Security & Permission Layer"]
        InvokerViews["Views: products_public, live_offers, public_coupons\n(security_invoker = on, security_barrier = true)"]
        ColGrants["Column-Level SELECT Grants\n(cost_price EXCLUDED from anon/authenticated)"]
        RLS["Row Level Security Engine\nCached InitPlan: (select auth.uid())"]
    end

    subgraph ExecProcedures["Transactional Stored Procedures"]
        HardenedRPCs["SECURITY DEFINER RPCs\n(create_order, cancel_order, ensure_profile)\nsearch_path = public, pg_temp"]
    end

    subgraph StorageTables["PostgreSQL 15 Tables"]
        CoreTables["18 Core Application Tables\n(products, inventory, orders, profiles, etc.)"]
    end

    Anon -->|Read Catalog| InvokerViews
    InvokerViews --> ColGrants
    Auth -->|Read Catalog| InvokerViews
    Auth -->|Read Own Records| RLS
    RLS --> CoreTables
    AdminRole -->|Full CRUD via is_admin()| CoreTables

    Anon -->|log_visitor_event| HardenedRPCs
    Auth -->|create_order| HardenedRPCs
    HardenedRPCs --> CoreTables
```

---

## 3. Key Implementations & Resolved Vulnerabilities

### 3.1. Relational Integrity & Schema Normalization
- Complete relational models across 18 core tables:
  - `profiles`, `categories`, `brands`, `products`, `product_images`, `inventory`, `offers`, `offer_products`, `addresses`, `wishlist`, `coupons`, `coupon_usages`, `orders`, `order_items`, `service_requests`, `brand_support`, `pc_build_templates`, `pc_builds`, `visitor_sessions`, `visitor_events`, `store_settings`.
- Cleaned and aligned UUIDs across schema and seed records, eliminating foreign key mismatch exceptions.

### 3.2. Critical Security Definer View Remediation
- **Vulnerability**: Postgres views defined without `security_invoker = on` execute with the privileges of the view owner, effectively bypassing the Row Level Security (RLS) of the underlying tables.
- **Resolution**:
  - Converted `products_public`, `live_offers`, and `public_coupons` views to:
    ```sql
    WITH (security_invoker = on, security_barrier = true)
    ```
  - This guarantees that caller RLS policies and permissions are strictly evaluated and eliminates query optimization side-channels.

### 3.3. Wholesale Cost Price (`cost_price`) Data Leak Prevention
- **Vulnerability**: The master `products` table stores internal procurement costs (`cost_price`) alongside retail prices (`mrp`, `our_price`). Exposing this column through PostgREST would expose business profit margins.
- **Resolution**:
  - Revoked blanket `SELECT` on `products` from `anon` and `authenticated`.
  - Granted selective column-level `SELECT` excluding `cost_price`:
    ```sql
    REVOKE ALL ON public.products FROM anon, authenticated;
    GRANT SELECT (id, category_id, brand_id, name, slug, description, short_specs,
                  mrp, our_price, discount_percent, sku, barcode, stock_quantity,
                  low_stock_threshold, is_active, is_featured, is_new, warranty_summary,
                  rating, review_count, primary_image_url, gallery_urls, created_at, updated_at)
    ON public.products TO anon, authenticated;
    ```

### 3.4. RPC Function Hardening & Privilege Separation
- **Read-Only Functions Converted to `SECURITY INVOKER`**:
  - `health_check()`: Verifies database liveness.
  - `check_onsite_warranty(p_pincode, p_location_id)`: Calculates Haversine distance against service radius.
  - `validate_coupon(p_code, p_cart_subtotal)`: Evaluates coupon discount rules.
- **Administrative Functions Protected**:
  - `is_admin()`: Revoked `EXECUTE` privilege from `anon`. Returns `true` only for authenticated users with role `admin` in `profiles`.
  - `rls_auto_enable()`: Revoked from `anon` and `authenticated`.
- **Hardened Transactional Procedures (`SECURITY DEFINER`)**:
  - `create_order(...)`: Validates `auth.uid()`, enforces atomic inventory checks, reserves stock, creates order records.
  - `cancel_order(...)`: Restricts cancellation to the order owner or administrator, reverting reserved inventory.
  - `ensure_profile()`: Safely provisions customer profile rows on first authentication.
  - `log_visitor_event(...)`: Ingests visitor metrics while keeping underlying tables read-only for clients.
  - **Pinned Search Path**: All `SECURITY DEFINER` functions explicitly set `SET search_path = public, pg_temp` to prevent malicious schema injection.

### 3.5. Performance & Database Linter Optimizations
- **Fixed 34 `auth_rls_initplan` Warnings**:
  - Calling `auth.uid()` directly forces PostgreSQL to re-evaluate the function on every single examined row.
  - Wrapped all occurrences with `(select auth.uid())`, allowing PostgreSQL to evaluate the identity once per statement and cache it as an `InitPlan`.
- **Fixed 100+ `multiple_permissive_policies` Warnings**:
  - Resolved policy collisions where multiple permissive policies forced Postgres to evaluate multiple expressions with `OR`.
  - Decoupled public storefront reads (`FOR SELECT TO public`) from administrative modifications (`FOR INSERT/UPDATE/DELETE TO authenticated USING (is_admin())`).
- **Index Cleanup & Optimization**:
  - **Dropped Duplicate Index**: Removed redundant index `brand_support_category_fk_idx` on `public.brand_support`.
  - **Added 18 Covering Foreign Key Indexes**: Created indexes on `parent_id`, `address_id`, `coupon_id`, `offer_id`, `location_id`, etc., eliminating sequential table scans during relational queries and cascading deletes.

---

## 4. Verification & Audit Results

| Linter / Audit Category | Before Fix | After Fix |
| :--- | :--- | :--- |
| **Security Definer Views** | 3 Critical Warnings | **0 (Clean)** |
| **Column-Level Cost Price Exposure** | Exposed to authenticated | **Strictly Revoked** |
| **Auth RLS InitPlan Performance** | 34 Warnings | **0 (All Cached)** |
| **Multiple Permissive Policies** | 100+ Warnings | **0 (Consolidated)** |
| **Duplicate Indexes** | 1 Found (`brand_support`) | **0 (Dropped)** |
| **Unindexed Foreign Keys** | 18 Found | **0 (All Indexed)** |

