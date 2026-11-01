# IT HUB — Seamless Event-Driven Storefront Synchronization Report

**Project:** IT HUB E-Commerce & IT Service Platform  
**Scope:** Staff Portal (`http://localhost:5174`) + Customer Storefront (`http://localhost:8443`) + Supabase Realtime Engine  
**Environment:** Local Development Only (`http://127.0.0.1:54321`)  
**Status:** Completed & Fully Verified

---

## 1. Executive Summary

Previously, administrative modifications performed in the Staff Portal—such as publishing or unpublishing partner certificates, uploading or reordering customer showcase photos, posting promotional announcement banners, or updating store contact hours—required the customer to manually refresh their browser tab or clear browser cache to observe the updates.

This implementation delivers a **zero-reload, event-driven storefront synchronization architecture**. Administrative changes made in the Staff Portal are committed to PostgreSQL, published instantaneously via Supabase Realtime WebSocket events, and processed by the Customer Storefront. The Storefront applies targeted in-memory state mutations and targeted cache invalidations, re-rendering only the affected components without full-page reloads, routing interruption, or cache clearing.

---

## 2. Root Cause Analysis

Before this phase, PostgreSQL change events for website content were completely silent over Supabase Realtime. Our audit revealed two root causes in PostgreSQL:

1. **Omission from `supabase_realtime` Publication:**
   - Supabase Realtime relies on PostgreSQL logical replication (`wal2json`).
   - A query against `pg_publication_tables` revealed that only `public.inventory` was registered in `supabase_realtime`.
   - `partner_certificates`, `website_showcase`, `announcements`, `store_settings`, and `it_hub_locations` were **never added to the publication**.
   - As a result, PostgreSQL logical decoding never broadcasted changes for these tables to the Realtime server, making any frontend listener ineffective.

2. **Default Replica Identity:**
   - By default, PostgreSQL tables have `REPLICA IDENTITY DEFAULT`, which only includes primary key columns in `UPDATE` and `DELETE` WAL records.
   - For complete event handling and client-side granular cache invalidation, tables required `REPLICA IDENTITY FULL` so that `payload.old` carries the entire prior record state.

3. **Ad-Hoc and Redundant Channel Subscriptions:**
   - Individual page components (`Information.tsx` and `Home.tsx`) had attempted to create independent, ad-hoc Supabase channels.
   - When the user navigated away from `/about` or `/`, those channels were torn down, leaving the customer unaware of administrative updates until the next full page navigation or refresh.

---

## 3. Database Architecture & Migrations

### 3.1 Migration `20261031000003_realtime_content_sync.sql`

We introduced migration `20261031000003_realtime_content_sync.sql` which executes:

```sql
-- 1. Enable REPLICA IDENTITY FULL for all synchronized tables
alter table public.partner_certificates replica identity full;
alter table public.website_showcase replica identity full;
alter table public.announcements replica identity full;
alter table public.store_settings replica identity full;
alter table public.it_hub_locations replica identity full;

-- 2. Register tables into the supabase_realtime publication
alter publication supabase_realtime add table public.partner_certificates;
alter publication supabase_realtime add table public.website_showcase;
alter publication supabase_realtime add table public.announcements;
alter publication supabase_realtime add table public.store_settings;
alter publication supabase_realtime add table public.it_hub_locations;
```

### 3.2 Announcements Table Alignment & Security

To bridge Staff Portal input fields with Customer Storefront rendering, the `announcements` table was augmented:

- Added columns: `message text`, `cta_url text`, `starts_at timestamptz`, `ends_at timestamptz`.
- Relaxed legacy `headline` constraint (`alter column headline drop not null; alter column headline set default '';`).
- Configured RLS policies:
  - `announcements_staff_all`: Allows authenticated staff members (`public.is_staff()`) to perform all CRUD operations.
  - `announcements_public_read`: Permits anonymous visitors to read active announcements within valid date windows.

### 3.3 Canonical Partner Certificate Seeding

The canonical 6 partner records were guaranteed using `ON CONFLICT (id) DO UPDATE`:

1. `cert-asus`: ASUS Premium Partner (`/images/recognition/asus-premium-partner.jpg`)
2. `cert-canon`: Canon Authorised Reseller (`/images/recognition/canon-authorised-reseller.jpg`)
3. `cert-epson`: Epson Channel Partner (`/images/recognition/epson-channel-partner.jpg`)
4. `cert-numeric`: Numeric Energy Partner (`/images/recognition/numeric-energy-partner.jpg`)
5. `cert-iggis`: IGGIS Honour & Recognition (`/images/recognition/iggis-honour-recognition.jpg`)
6. `cert-intel`: Intel Partner Alliance (`/images/about-store.png`)

---

## 4. Central Content Synchronization Architecture

A central synchronization manager was built in `src/lib/realtime/contentSync.ts` implementing the `ContentSyncManager` class and `initContentSync` factory.

```
┌────────────────────────────────────────────────────────┐
│               Staff Portal (port 5174)                 │
│  • Certificates  • Showcase  • Banner  • Store Info    │
└──────────────────────────┬─────────────────────────────┘
                           │ INSERT / UPDATE / DELETE
                           ▼
┌────────────────────────────────────────────────────────┐
│         PostgreSQL Database (port 54322)               │
│  • REPLICA IDENTITY FULL                               │
│  • Publication: supabase_realtime                      │
└──────────────────────────┬─────────────────────────────┘
                           │ wal2json WebSocket Broadcast
                           ▼
┌────────────────────────────────────────────────────────┐
│      Customer Storefront Central Sync Manager          │
│       src/lib/realtime/contentSync.ts (port 8443)      │
│  • Single multiplexed channel (storefront-content-sync)│
│  • Targeted in-memory slice mutations                  │
│  • Visibility-aware fallback polling (paused when hidden│
│  • Automatic reconnection reconciliation               │
└──────────────────────────┬─────────────────────────────┘
                           │ Direct Store Mutations
                           ▼
┌────────────────────────────────────────────────────────┐
│               Targeted UI Re-renders                   │
│  • About / Info: Certificates Carousel                 │
│  • Home: Showcase Grid & Announcement Banner           │
│  • Layout / Support: Working Hours, Phone & Location   │
│         (ZERO Page Reloads · ZERO Layout Shift)        │
└────────────────────────────────────────────────────────┘
```

### 4.1 Key Capabilities of `ContentSyncManager`

1. **Multiplexed Single Channel:**
   - Replaces fragmented subscriptions with a single channel (`storefront-content-sync`).
   - Listens to `postgres_changes` across all 5 content tables simultaneously.

2. **Targeted In-Memory Mutations & Cache Invalidation:**
   - **Certificates:** Immediately filters out deleted IDs from state; revalidates active list via `fetchPublishedCertificates()`.
   - **Showcase:** Immediately removes deleted photo items; rehydrates active showcase list ordered by `display_order`.
   - **Announcements:** Normalizes banner fields (`title`, `message`, `cta_label`, `cta_url`, `image_url`) and mutates `store.announcement`.
   - **Store Settings:** Mutates `store.settings` (phone, hours, address, whatsapp) and updates the Kothamangalam headquarters location in `store.locations`.
   - **Locations:** Rehydrates `store.locations` with updated geocodes, phone numbers, and service radius.

3. **Visibility-Aware Fallback Polling:**
   - Fallback interval: 30 seconds.
   - **Strict Visibility Guard:** Uses `document.visibilityState === 'visible'`. When the browser tab is hidden or minimized, background polling is completely suspended to conserve client CPU and network bandwidth.
   - When the user returns to the tab (`visibilitychange` / `window.focus`), if disconnected or stale, a silent reconciliation is performed immediately.

4. **Reconnection Resilience:**
   - Monitors status transitions (`SUBSCRIBED`, `CLOSED`, `CHANNEL_ERROR`, `TIMED_OUT`).
   - When a connection drops and subsequently recovers, the manager automatically executes `reconcileAll()`, seamlessly catching up on any administrative updates committed during network downtime.

5. **Clean Lifecycle & Leak Prevention:**
   - Returns a teardown function that cleanly detaches window listeners, stops intervals, and invokes `supabase.removeChannel(channel)`.

---

## 5. Strict Shopify Separation & Commerce Isolation

The event-driven content synchronization architecture maintains strict separation between website content and commerce:

- **Shopify Remains Authoritative For:**
  - Product catalog (`/products`, `/products/:handle`)
  - Inventory availability & low-stock levels
  - Prices, sale prices, and currency calculations
  - Shopping cart, checkout sessions, and orders
  - Blog articles (`/blogs/news`) via Shopify Storefront GraphQL
- **Supabase Realtime Handles Only:**
  - Administrative store announcements
  - Customer showcase delivery photos
  - Verified manufacturer partnership certificates
  - Physical store hours, address, and contact numbers
  - Local service booking management & IT repairs

---

## 6. Verification & Automated Test Results

### 6.1 Realtime Synchronization Test Suite

A dedicated automated test suite was developed: `supabase/functions/tests/realtime-content-sync.test.ts`.

| Test ID  | Description                                                             | Result     | Execution Time |
| -------- | ----------------------------------------------------------------------- | ---------- | -------------- |
| `SYNC-1` | All content tables registered in `supabase_realtime` publication        | **PASSED** | 20ms           |
| `SYNC-2` | All content tables configured with `REPLICA IDENTITY FULL`              | **PASSED** | 10ms           |
| `SYNC-3` | Partner certificates accessible publicly with live mutation response    | **PASSED** | 85ms           |
| `SYNC-4` | Website showcase photos sync immediately without reload                 | **PASSED** | 30ms           |
| `SYNC-5` | Announcements table supports banner schema and public storefront access | **PASSED** | 16ms           |
| `SYNC-6` | Store settings changes sync immediately to storefront                   | **PASSED** | 20ms           |
| `SYNC-7` | Content sync strictly respects Shopify authoritative commerce ownership | **PASSED** | 14ms           |

**Summary:** 7 passed, 0 failed (Total runtime: 205ms).

### 6.2 Full Regression Test Suite Run

1. `supabase/functions/tests/staff-storefront-integration.test.ts`: **11 / 11 PASSED** (256ms)
2. `npm test` (All Storefront suites): **645 / 645 PASSED** (9s)
3. `npm run test:portal` (Staff Portal suites): **68 / 68 PASSED** (729ms)
4. `npm run verify:migrations`: **23 sequential migrations verified** successfully.

### 6.3 Typecheck & Build Verifications

- `npm run typecheck` (Storefront TypeScript 5.7): **0 errors**
- `npm run portal:typecheck` (Staff Portal TypeScript 5.7): **0 errors**
- `npm run build` (Storefront Vite 8 Production Build): **Success** in 1.40s
- `npm run portal:build` (Staff Portal Vite 8 Production Build): **Success** in 628ms

---

## 7. Operational Instructions

1. **Active Dev Servers:**
   - Customer Storefront: `http://localhost:8443`
   - Staff Portal: `http://localhost:5174`
   - Supabase Local Stack: `http://127.0.0.1:54321` (Postgres on `54322`)

2. **Live Synchronization Flow:**
   - Open Customer Storefront at `http://localhost:8443` in one tab/window.
   - Open Staff Portal at `http://localhost:5174` in another tab/window.
   - Update working hours or contact in Staff Portal **Settings**, upload/reorder a showcase photo in **Website Content**, or toggle a certificate in **Certificates**.
   - Notice that the Storefront tab updates its UI immediately in real time without refreshing the browser tab or losing customer state.
