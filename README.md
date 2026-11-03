# IT HUB — Omnichannel E-Commerce, IT Services & PC Builder Platform

A modern omnichannel technology retail, on-site service booking, headless Shopify commerce, and custom PC configuration platform built for **IT HUB, Kothamangalam, Kerala** (est. 2011).

The platform bridges physical retail and digital commerce, delivering a unified customer and staff experience across product sales, hardware diagnostics, brand warranty assistance, headless Shopify integration, and intelligent custom computer fabrication.

---

## 1. Project Overview & Business Context

**IT HUB** has operated in Central Kerala for over a decade as an authorized technology retailer and multi-brand service center. This repository provides a two-tier ecosystem:

1. **Customer Storefront (`/`)**: A responsive customer-facing web application for browsing products, configuring custom PCs, requesting repairs, and managing order history.
2. **Staff Portal (`ITHUB_ADMIN/`)**: A dedicated, role-based administrative control plane for technicians and management to review service tickets, approve rescheduling, audit quotations, and manage showroom content.

---

## 2. Platform Architecture & Technology Stack

The platform is architected as a decoupled, single-page application (SPA) backed by cloud PostgreSQL with Row Level Security (RLS), serverless Deno Edge Functions, and Shopify Storefront GraphQL APIs.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                                    │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │   Customer Storefront (React 19)│   │    Staff Portal (React 19)      │  │
│  │   Vite 8 · Tailwind CSS v4      │   │    Vite 8 · Tailwind CSS v4     │  │
│  │   Port 8443 / 5173              │   │    Port 5174 (ITHUB_ADMIN/)     │  │
│  └────────────────┬────────────────┘   └────────────────┬────────────────┘  │
└───────────────────┼─────────────────────────────────────┼───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌────────────────────────────────────┐   ┌────────────────────────────────────┐
│          COMMERCE ENGINE           │   │         OPERATIONAL BACKEND        │
│   Shopify Storefront & Admin APIs  │   │   Supabase (PostgreSQL 15)         │
│   · 1,300+ Product SKUs & Variants │   │   · Customer Profiles & Auth       │
│   · Live Inventory & Headless Cart │   │   · Service Booking & Diagnoses    │
│   · Hosted Secure Checkout         │   │   · PC Quotations & Specification  │
│   · Authoritative Orders Source    │   │   · Staff RBAC & Audit Logs        │
│   · Headless Shopify Blog CMS      │   │   · Realtime State Sync & Pub/Sub  │
└───────────────────┬────────────────┘   └────────────────┬───────────────────┘
                    │                                     │
                    └──────────────────┬──────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVERLESS EDGE FUNCTIONS (DENO)                    │
│   · verify-and-submit-pc-quotation: Server-side price recalculation & RLS   │
│   · shopify-webhook: HMAC-SHA256 verified ingestion & token association     │
│   · customer-shopify-orders: Authenticated order history & reconciliation   │
│   · create-service-razorpay-order & verify-service-payment: Service escrow  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Matrix

| Layer                    | Technologies                                   | Role & Key Features                                                               |
| :----------------------- | :--------------------------------------------- | :-------------------------------------------------------------------------------- |
| **Customer Storefront**  | React 19, TypeScript 5.7, Vite 8               | Public commerce, custom PC builder, service booking wizard, and account area.     |
| **Staff Portal**         | React 19, TypeScript 5.7, Vite 8               | Standalone administrative application in `ITHUB_ADMIN/` with strict RBAC.         |
| **Styling & Animation**  | Tailwind CSS v4, Motion, Lenis                 | Modern responsive layout (`max-w-[1520px]`), brand tokens, smooth scrolling.      |
| **Component Primitives** | Radix UI, Lucide Icons                         | Accessible dialogs, status badges, timelines, and touch-friendly drawers.         |
| **Headless E-Commerce**  | Shopify Storefront API (`2026-01` / `2026-10`) | Authoritative product catalog, variant GIDs, live stock, and hosted checkout.     |
| **Database & Auth**      | Supabase (PostgreSQL 15), GoTrue               | Relational schema, Row Level Security (RLS), custom RPCs, and Phone OTP auth.     |
| **Serverless Functions** | Deno runtime (`supabase/functions/`)           | Cryptographic webhook verification, server price checks, rate limits, order sync. |
| **Payments**             | Razorpay SDK & Gateway                         | Test mode integration for UPI, Cards, NetBanking, and Pay at IT HUB Counter.      |

---

## 3. Repository Structure

```text
ITHUB_WEB/
├── src/                                  # Customer Storefront (React 19 + Vite 8)
│   ├── main.tsx                          # React entrypoint and global styles
│   ├── index.css                         # Tailwind CSS v4 entrypoint & theme tokens
│   ├── app/
│   │   ├── App.tsx                       # Router configuration and dynamic error boundaries
│   │   └── store.tsx                     # Global reactive application store
│   ├── components/                       # Shared UI and feature components
│   │   ├── Layout.tsx                    # Header, mobile drawer, bottom nav, footer
│   │   ├── PromotionalHeroCarousel.tsx   # 16:9 hero carousel with countdown & sync
│   │   ├── ShopifyOrderDetailsModal.tsx  # Customer order details & carrier tracking modal
│   │   ├── CustomerRescheduleManager.tsx # Customer on-site appointment rescheduling
│   │   ├── QuotationApprovalPanel.tsx    # Customer service repair approval panel
│   │   ├── RepairPaymentModal.tsx        # Service deposit & counter payment modal
│   │   ├── SellYourItem.tsx              # Gadget valuation and trade-in submission
│   │   └── ui.tsx                        # Radix UI design primitives
│   ├── lib/                              # Core business logic & API clients
│   │   ├── auth.ts                       # Supabase Phone OTP auth & profile reconciliation
│   │   ├── shopify.ts                    # Shopify Storefront API client & availability
│   │   ├── shopify-orders.ts             # Customer order retrieval & token association
│   │   ├── shopify-schema.ts             # GraphQL schema mapping & GID utilities
│   │   ├── services.ts                   # Service requests, status progression & tracking
│   │   ├── serviceReschedule.ts          # Rescheduling eligibility & date validation
│   │   ├── payments.ts                   # Razorpay modal launcher & verification callbacks
│   │   └── builder/                      # Find My PC & Expert PC Builder engine
│   └── pages/                            # Application route components
│       ├── Home.tsx                      # Landing page with hero, categories, trust grid
│       ├── Products.tsx                  # Catalog, category filtering, product detail view
│       ├── Commerce.tsx                  # Cart drawer, direct Shopify checkout, order success
│       ├── Builder.tsx                   # Find My PC and Expert PC Builder
│       ├── Services.tsx                  # 5-step booking wizard and live service tracker
│       ├── Blog.tsx                      # Headless Shopify technology journalism CMS
│       ├── Support.tsx                   # Brand warranty directory and service centres
│       ├── Information.tsx               # About IT HUB, history, partner certificates
│       └── Account.tsx                   # Customer profile, My Orders, active services
│
├── ITHUB_ADMIN/                          # IT HUB Staff Portal (Dedicated App)
│   ├── index.html                        # Portal shell
│   ├── vite.config.ts                    # Independent Vite 8 build config (Port 5174)
│   ├── package.json                      # Staff Portal scripts and dependencies
│   └── src/
│       ├── components/                   # ServiceDetailModal, QuotationModal, StatusMark
│       ├── lib/                          # Staff auth, RBAC, Excel export, analytics
│       └── pages/
│           ├── Dashboard.tsx             # Staff dashboard with numerical badges
│           ├── Services.tsx              # Ticket triage, diagnosis, technician assignment
│           ├── Quotations.tsx            # PC Builder quotation reviews & price audit
│           ├── SellRequests.tsx          # Gadget valuation and buyback management
│           ├── WebsiteContent.tsx        # Showroom showcase & certificates editor
│           ├── Audits.tsx                # Website Visitor Analytics & session inspector
│           └── Settings.tsx              # Store hours, address, WhatsApp message settings
│
├── supabase/                             # Database & Backend Infrastructure
│   ├── migrations/                       # Sequential database migrations: the only schema source
│   └── functions/                        # Serverless Deno Edge Functions
│       ├── verify-and-submit-pc-quotation/
│       ├── shopify-webhook/
│       ├── customer-shopify-orders/
│       ├── create-service-razorpay-order/
│       ├── verify-service-payment/
│       └── tests/                        # Automated Deno test suites (737 passed tests)
│
├── docs/superpowers/plans/               # Architecture implementation plans
├── public/                               # Static brand assets and certificate images
├── package.json                          # Storefront scripts and dependencies
└── vite.config.ts                        # Vite 8 configuration
```

---

## 4. Shopify Integration & Responsibilities

Shopify serves as the **authoritative single source of truth** for commercial product sales:

- **Product Catalog & Inventory**: Direct GraphQL queries against the Storefront API (`src/lib/shopify.ts`) with bounded caching (60s) and deduplication across 1,300+ SKUs.
- **Hosted Checkout**: Shopping bag checkout delegates directly to Shopify Hosted Checkout. Line items are mapped with authoritative variant GIDs (`gid://shopify/ProductVariant/...`).
- **Cryptographic Order Association**: Prior to checkout, an opaque association token (`_hub_assoc_token`) generated by Supabase is embedded in cart attributes alongside buyer identity (`buyerIdentity`), linking the resulting order to the authenticated customer.
- **Webhook Ingestion (`shopify-webhook`)**: Ingests `orders/create`, `orders/updated`, `orders/fulfilled`, `orders/cancelled`, and `orders/paid` with HMAC-SHA256 verification and idempotent deduplication.
- **Shopify Blog CMS**: The technology blog (`src/pages/Blog.tsx`) queries Shopify Articles and Blogs dynamically with tag filtering and reading time estimation.

---

## 5. Supabase Integration & Responsibilities

Supabase (PostgreSQL 15) manages operational services, authentication, and internal control:

- **Customer Authentication**: Phone OTP via SMS/WhatsApp with E.164 normalization, creating verified sessions (`auth.uid()`) in `public.profiles`.
- **Service Desk Operations**: Tables `public.service_requests` and `public.service_request_history` persist device repair tickets, technician assignments, itemized diagnoses, and status history.
- **PC Builder Quotations**: Table `public.pc_builds` stores verified customer PC configurations, component selections, and server-validated pricing.
- **Hardware Component Specifications**: Table `public.hardware_component_specifications` catalogs physical dimensions, socket types, memory generations, and auxiliary power requirements.
- **Showroom Content & Settings**: Tables `public.partner_certificates`, `public.website_showcase`, and `public.store_settings` drive customer showroom content with audit logging.
- **Website Visitor Analytics**: Table `public.website_visitor_sessions` records privacy-first visitor traffic, referrals, and session pageviews.
- **Realtime Synchronization**: PostgreSQL publication `supabase_realtime` broadcasts table mutations across Storefront and Staff Portal.

---

## 6. Customer Authentication & Account Functionality

- **Sign In via OTP**: Customers sign in using their 10-digit Indian mobile number (`+91XXXXXXXXXX`). A 6-digit verification code is delivered via SMS.
- **Customer Profile Area (`/account`)**:
  - **Overview**: Active order counters, active repair counters, saved builds, quick contact actions.
  - **My Orders (`/account/orders`)**: Real-time Shopify product orders with status badges, line item thumbnails, tracking links, and modal details.
  - **Services (`/account/services`)**: Active repair bookings with live status, technician details, and the on-site appointment rescheduling manager.
  - **Profile & Addresses**: Contact details, delivery address management, and optional verified email linking.
  - **Saved PC Builds**: Configured computers with compatibility scores and direct quotation requests.
  - **Sell & Trade-In Requests**: Device buyback tracking and valuation offer review.

---

## 7. Product Catalog, Inventory & Checkout Flow

1. **Browsing**: Products are displayed with categorized pricing, stock indicators, and brand metadata.
2. **Availability Pre-Validation**: When viewing a product or cart, live variant availability is checked against Shopify Storefront API.
3. **Cart Assembly**: Supports quantity adjustments, promo code pre-validation, and discount calculations.
4. **Checkout Redirection**:
   - For authenticated customers: Creates a server association token via `create_checkout_association()` and injects `_hub_assoc_token` into cart attributes.
   - Redirects customer to Shopify Hosted Checkout.
   - On completion, customer returns to `/account/orders?checkout_completed=true`, automatically triggering on-demand order reconciliation and a confirmation banner.

---

## 8. PC Builder & Find My PC Recommendation Engine

### Find My PC Engine

- Evaluates live inventory across 5 purpose profiles: _Esports Gaming_, _AAA Cinematic_, _Content Creation_, _Software Development_, and _Everyday Office_.
- Generates 3 candidate perspectives: **Best Value**, **Balanced Choice**, and **Best Performance**.
- **Honest Shortfall UI**: When a budget cannot meet minimum hardware safety baselines, the engine displays the exact rupee shortfall rather than recommending incompatible or underpowered components.

### 10-Rule Hardware Compatibility Engine

Enforces socket matching (Rule A), DDR4/DDR5 generational separation (Rule B), RAM slot limits (Rule C), GPU clearance (Rule D), TDP load & PSU capacity (Rule E), Auxiliary PCIe power cables (Rule F), Chassis form factors (Rule G), Cooler height (Rule H), Display output validation (Rule I), and Tri-State unknown verification (Rule J).

### Quotation Security

Quotation requests require mandatory customer authentication and are validated server-side by `verify-and-submit-pc-quotation` to prevent client price tampering and enforce distributed rate limits.

---

## 9. Service Booking, Tracking & Repair Management

### 5-Step Customer Booking Wizard

1. **Device Selection**: Device type (Laptop, Mobile, Desktop, Printer) with **mandatory** Device Brand & Model Number.
2. **Issue Selection**: Mandatory issue diagnosis selection with custom description for "Other".
3. **Service Method**:
   - _Store Walk-In_ (₹0 — IT HUB Showroom Counter).
   - _On-site Technician Visit_ (₹250 — Within 15km store radius).
   - _Insured Courier Pickup_ (₹150 — Across Kerala with pincode validation).
4. **Customer Details**: Name, phone, email, and pickup address.
5. **Slot Selection & Confirmation**: Calendar booking for eligible methods (Monday–Saturday).

### Canonical Lifecycle & Service Tracker

- Every booking generates a canonical ticket reference: `ITH-SER-XXXXXXXX`.
- Tracked via `/track-service/:id` with stages:
  `Booked` → `Device Received` → `Under Diagnosis` → `Diagnosis & Quotation Completed` → `Approved` → `In Progress` → `Quality Check` → `Ready for Delivery` → `Completed`.
- **Customer Rescheduling**: Eligible on-site visits allow customers to request a new date/slot. Requests require explicit staff review and approval (never rescheduled automatically).

---

## 10. Staff Portal Modules & RBAC (`ITHUB_ADMIN/`)

The Staff Portal is accessed at port `5174` (or `VITE_PORTAL_HOST`) and guarded by Supabase Auth with `is_staff()` and `portal_admin` role verification:

- **Dashboard**: High-level store metrics with live numerical badge indicators for pending tickets.
- **Service Management**: Full ticket lifecycle management, status updates, technician assignment, itemized quotation creation, and counter payment recording.
- **PC Quotations Queue**: Review custom PC build requests, audit live Shopify component pricing, and contact clients.
- **Sell & Trade-In Requests**: Evaluate customer gadget buyback submissions and submit formal cash/credit valuation offers.
- **Website Content Manager**: Manage showroom showcase gallery and official partner certificates with audit logging.
- **Website Visitor Analytics**: Privacy-first analytics tracking visitors, pageviews, referrers, device distributions, and Excel (`.xlsx`) export.
- **Store Settings**: Manage store profile, operating hours (9:00 AM – 7:30 PM, Sunday closed), support contacts, and default WhatsApp greetings.

---

## 11. Website Content Management & Shopify Blog

- **Showroom Showcase**: Dynamic showroom photos and equipment showcases managed via `public.website_showcase` with soft-activation toggles.
- **Partner Alliances**: Brand certifications (Intel Gold Partner, AMD Commercial, Microsoft Authorized, ASUS Gold Partner, Dell Certified, Canon Authorized) managed via `public.partner_certificates` with hash-verified image integrity.
- **Technology Blog**: Synchronized directly with Shopify Articles and Blogs.

---

## 12. Razorpay Payment Gateway Integration Status

| Component                    |        Status         | Details                                                                                      |
| :--------------------------- | :-------------------: | :------------------------------------------------------------------------------------------- |
| **Storefront Payment Modal** |    ✅ Implemented     | `RepairPaymentModal.tsx` supports Razorpay checkout and Pay at Counter option.               |
| **Order Creation Function**  |    ✅ Implemented     | `create-service-razorpay-order` generates server-side orders via Razorpay API.               |
| **Payment Verification**     |    ✅ Implemented     | `verify-service-payment` validates HMAC-SHA256 signatures before updating tickets.           |
| **Webhook Handler**          |    ✅ Implemented     | `verify-razorpay-webhook` processes asynchronous gateway events with constant-time security. |
| **Pay at IT HUB Counter**    |    ✅ Implemented     | Offline cash/counter settlement option recorded with staff accountability.                   |
| **Test Mode Sandbox**        |     ✅ Configured     | Runs seamlessly with test keys (`rzp_test_...`) in local development.                        |
| **Live Merchant Activation** | ⏳ Pending Activation | Requires live Razorpay Production Key ID & Secret from banking partner.                      |
| **Recurring Subscriptions**  |    ⚪ Out of Scope    | Not implemented or required for current retail/repair scope.                                 |

---

## 13. Environment Variables & Safe Setup

### Customer Storefront (`.env` or `.env.local`)

```env
# Shopify Storefront API Configuration (Public — Client Safe)
VITE_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN=your-public-storefront-token
VITE_SHOPIFY_API_VERSION=2026-01

# Supabase Configuration (Public Anon Key)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Razorpay Sandbox Key ID (Optional for local testing)
VITE_RAZORPAY_KEY_ID=rzp_test_your_key_id
```

### Staff Portal (`ITHUB_ADMIN/.env` or `ITHUB_ADMIN/.env.local`)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_PORTAL_HOST=staff.ithubkothamangalam.com
```

### Server-Side Edge Function Secrets (Supabase Dashboard / Vault)

```env
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_signing_secret
SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_...
SHOPIFY_WEBHOOK_SECRET=your_shopify_hmac_secret
```

> [!CAUTION]
> Never commit actual credentials or `.env` files to Git. All secret files are strictly listed in `.gitignore`.

---

## 14. Local Development Commands

### Customer Storefront

```bash
# Install dependencies
npm install

# Start development server (Port 8443 / 5173)
npm run dev

# Static typecheck
npm run typecheck

# Code formatting & lint check
npm run format
npm run lint

# Production build
npm run build
```

### Staff Portal (`ITHUB_ADMIN/`)

```bash
# Install Staff Portal dependencies
npm --prefix ITHUB_ADMIN install

# Start Staff Portal dev server (Port 5174)
npm run portal:dev

# Staff Portal static typecheck
npm run portal:typecheck

# Staff Portal build
npm run portal:build
```

---

## 15. Database Migrations & Supabase Setup

Local Supabase database runs via Docker CLI:

```bash
# Start local Supabase services (Postgres on 54322, Studio on 54323)
npx supabase start

# Apply all sequential database migrations
npx supabase migration up

# Check migration file names and order
npm run verify:migrations
```

---

## 16. Testing & Quality Verification

Automated test suites run using the Deno test runner:

```bash
# Run all 737 automated test suites
npm test

# Run specific functional test suites
npm run test:shopify      # Shopify catalog, inventory latency & order sync
npm run test:builder      # Hardware compatibility rules & quotation flow
npm run test:portal       # Staff Portal auth, review queues & service desk
npm run test:security     # JWT enforcement, HMAC verification, RLS isolation
```

All 737 test suites currently pass with 0 failures:

- **Database & RLS**: 3 passed
- **Shopify Webhooks & Order Sync**: 3 passed
- **Customer Order Retrieval API**: 3 passed
- **End-to-End Acceptance Criteria**: 9 passed
- **General Platform & Builder Suites**: 719 passed

---

## 17. Current Limitations & Pending Items

1. **Guest Checkout Linking**: Orders placed by customers who check out as guests without logging in will link automatically only if their entered email or mobile number uniquely matches their IT HUB profile.
2. **Third-Party Carrier Waypoints**: Real-time in-transit location waypoints rely on carrier webhooks or opening the external carrier tracking link.
3. **Razorpay Live Gateway**: Local and test transactions function via Razorpay Test Mode; production banking activation will take place in the upcoming payment activation phase.

---

## 18. Store Information & Location

- **Business Name**: IT HUB
- **Tagline**: Technology Store, IT Services & Custom PC Fabrication
- **Headquarters**: AM Road, Kothamangalam, Ernakulam District, Kerala, India — PIN 686691
- **Established**: 2011
- **Operating Hours**: Monday – Saturday: 9:00 AM – 7:30 PM (Sunday Closed)
- **Primary Support**: +91 98470 12345 | support@ithubkothamangalam.com
- **Brand Palette**:
  - Primary Blue: `#1a4fd6`
  - Deep Navy: `#0c2f8a`
  - Soft Tint: `#ecf1ff`
  - WhatsApp Accent: `#25D366`
