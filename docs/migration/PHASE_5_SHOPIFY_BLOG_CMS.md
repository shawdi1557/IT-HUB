# IT HUB — Phase 5: Shopify Native Blog CMS Integration

## Overview
This document specifies the architecture, audit findings, configuration requirements, and implementation details for the **IT HUB Technology Blog**, using Shopify as the authoritative Content Management System (CMS).

Published blogs and articles are authored in Shopify Admin and delivered to the headless storefront via the Shopify Storefront API GraphQL interface, with verified fallback guides and SEO structured data.

---

## 1. Storefront API Audit & Access Scope

### Current Configuration
- **API Version**: `2026-01`
- **Client**: Storefront GraphQL API (`/api/2026-01/graphql.json`)
- **Required Storefront API Scope**: `unauthenticated_read_content`
- **Security Constraint**: Private Admin API tokens (`shpat_`, `shpca_`) are **strictly prohibited** in client-side code. All storefront queries use `X-Shopify-Storefront-Access-Token`.

### Scope Verification & Shopify Admin Setup
To enable public reading of articles and blogs:
1. Open **Shopify Admin** $\rightarrow$ **Settings** $\rightarrow$ **Apps and sales channels** $\rightarrow$ **Develop apps**.
2. Select your headless custom app (or **Headless** sales channel).
3. Under **Configuration** $\rightarrow$ **Storefront API integration**:
   - Locate **Storefront API access scopes**.
   - Check ☑ **Content** (`unauthenticated_read_content`).
4. Click **Save** and deploy the configuration.

> **Resilience & Fallback**: If the `unauthenticated_read_content` scope is not yet enabled or if no articles are published in Shopify, the application safely detects this without throwing runtime errors and falls back to IT HUB's verified hardware engineering guides, ensuring zero storefront downtime.

---

## 2. Shopify Admin Authoring Workflow

Merchants manage all content natively within Shopify:
1. In Shopify Admin, navigate to **Online Store** $\rightarrow$ **Blog posts**.
2. Click **Add blog post**.
3. Fill in:
   - **Title**: Article headline (e.g., *Lenovo Legion R27qe Gen 2: The Definitive 180Hz 1440p Gaming Monitor Guide*).
   - **Content**: Rich HTML text, lists, subheadings, and specifications.
   - **Excerpt**: 1–2 sentence summary for article listing cards.
   - **Featured image**: High-resolution cover photo.
   - **Organization**:
     - **Author**: Assigned author (e.g., *IT HUB Engineering*).
     - **Blog**: Category blog container (e.g., *Hardware Reviews*, *Guides & Tutorials*, *Repair & Maintenance*).
     - **Tags**: Comma-separated topics (e.g., *Monitors, Gaming, Lenovo, Displays*).
4. Set **Visibility** to **Visible** and click **Save**.

---

## 3. Storefront Implementation Architecture

### File Map
| Path | Purpose |
| :--- | :--- |
| [`src/lib/blog.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/lib/blog.ts) | GraphQL query layer (`ARTICLES_QUERY`), 60s bounded cache, request deduplication, single article lookup, and Shopify-to-App data mapper. |
| [`src/pages/Blog.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/pages/Blog.tsx) | `/blog` listing page and `/blog/:slug` article detail page with search, categories, pagination, responsive layouts, loading/error states, and JSON-LD structured data. |
| [`src/data/blog.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/data/blog.ts) | Verified editorial content fallback and TypeScript interfaces. |
| [`src/app/App.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/app/App.tsx) | Lazy-loaded routes for `/blog` and `/blog/:slug`. |
| [`src/components/Layout.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/components/Layout.tsx) | Main navigation and mobile gooey nav featuring **Blog** in place of PC Builder. |

### Commerce & Service Integration
- Articles feature contextual callout cards linking directly to real Shopify products (e.g. `/products/lenovo-legion-smartchoice-r27qe-gen-2`) and Supabase service booking workflows (`/services`).
- Supabase repair service quotes, tracking, and customer sell-item workflows remain completely untouched and authoritative.

---

## 4. Verification Results

| Suite | Status | Details |
| :--- | :--- | :--- |
| **Deno Automated Tests** | **PASS** | 49 tests passing, 0 failures (`PH5-BLOG-1` to `PH5-BLOG-6` verified) |
| **TypeScript Compilation** | **PASS** | Clean check (`npx tsc --noEmit` exited code 0) |
| **Vite Production Build** | **PASS** | Production assets generated (`dist/assets/Blog-CsH133en.js`) |

