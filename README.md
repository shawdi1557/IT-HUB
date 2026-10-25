# IT HUB — Omnichannel E-Commerce, IT Services & PC Builder Platform

A modern omnichannel technology retail, on-site service booking, headless Shopify commerce, and custom PC configuration platform built for **IT HUB, Kothamangalam, Kerala** (est. 2011).

The platform bridges physical retail and digital commerce, delivering a unified experience across shopping, hardware diagnostics, brand warranty assistance, headless Shopify integration, and intelligent custom computer fabrication.

---

## 1. About the Project

**IT HUB** has served customers across Central Kerala for over a decade as an authorized technology retailer and multi-brand service center. This web application brings the complete IT HUB ecosystem online, offering:

- **Shopify Headless Storefront**: Direct Storefront GraphQL API integration across 1,300+ SKUs with real-time stock indicators, multi-variant selectors, and direct checkout redirection.
- **Find My PC Recommendation Engine**: Multi-branch dynamic candidate synthesizer generating verified PC builds tailored to customer budgets and use-cases from live inventory.
- **Expert Mode PC Builder**: Interactive custom PC builder with 10 hardware compatibility rules, socket/generation validation, and auxiliary PCIe power verification.
- **Secure Quotation Submission**: Formal PC fabrication quotation workflow backed by server-side Shopify price verification, mandatory customer authentication, and distributed rate limiting.
- **Technical Services & Repairs**: Booking and diagnosis portal for chip-level motherboard repair, display replacements, itemized quotation approvals, and live service tracking.
- **IT HUB Technology Blog CMS**: Dedicated technology journalism and buying guides powered by headless Shopify CMS integration.
- **Authorized Brand Support Directory**: Direct contact information, toll-free lines, and escalation matrices for partner brands (HP, Dell, Lenovo, Asus, Canon, Epson, Hikvision, etc.).
- **Partner Accreditations & Showcase**: Interactive showcase of official brand certifications and industry recognitions (Intel Gold Partner, AMD Commercial, Microsoft Authorized, ASUS Gold Partner, Dell Certified, Canon Authorized).
- **Administrative Back-Office**: Back-office management dashboard for catalog synchronization, service ticket workflows, order tracking, and visitor analytics.

---

## 2. Platform Architecture

The system is architected as a decoupled, responsive single-page application (SPA) backed by cloud PostgreSQL with Row Level Security (RLS), serverless Deno Edge Functions, and Shopify Storefront GraphQL APIs.

### Technology Stack

| Layer                    | Technologies                        | Role & Key Features                                                                                     |
| :----------------------- | :---------------------------------- | :------------------------------------------------------------------------------------------------------ |
| **Frontend UI**          | React 19, TypeScript 5.7, Vite 8    | Ultra-fast SPA with client-side routing, code splitting, and strict type safety                         |
| **Styling & Motion**     | Tailwind CSS v4, Motion, Lenis      | Responsive styling, brand tokens (`#1a4fd6`, `#ecf1ff`, `#0c2f8a`), smooth scrolling                    |
| **Component Primitives** | Radix UI, Lucide Icons              | Accessible dialogs, dropdowns, accessible modal overlays with wheel-scroll isolation                    |
| **E-Commerce & Catalog** | Shopify Storefront API (GraphQL)    | Live catalog queries, variant GID resolution, inventory levels, cart lines, and checkout                |
| **Database & Auth**      | Supabase (PostgreSQL 15), GoTrue    | Relational database, Row Level Security (RLS), custom RPCs, E.164 phone OTP & email auth                |
| **Edge Functions**       | Deno runtime                        | Server-side quotation price verification, distributed rate limiting, and cryptographic payment webhooks |
| **Payments**             | Razorpay SDK                        | UPI, Debit/Credit cards, Net Banking, and Pay on Delivery options                                       |
| **State Management**     | Centralized Store with localStorage | Persistent cart, customer session, pending quotation preservation, live inventory hydration             |

### Security & Data Isolation Architecture

- **Row Level Security (RLS)**: Enforced across all tables (`hardware_component_specifications`, `pc_builds`, `service_requests`). Anonymous guests access only verified public views. Quarantined parent products automatically suppress all associated variants via correlated RLS subqueries.
- **Mandatory Quotation Authentication**: Submitting custom PC quotation requests strictly requires an authenticated customer identity. Unauthenticated sessions are rejected with HTTP 401 at the Edge Function boundary and blocked at the PostgreSQL trigger level (`protect_pc_build`).
- **Server-Side Price Verification**: Quotation totals are calculated authoritatively by the `verify-and-submit-pc-quotation` Edge Function by re-querying live Shopify variant GIDs. Client-supplied totals are treated as unverified hints and flagged for review if tampering is detected.
- **Distributed Rate Limiting**: Enforced via atomic database RPC (`check_distributed_rate_limit`) against a dedicated `rate_limits` table, preventing in-memory bypasses across ephemeral serverless invocations.
- **Legacy RPC Revocation**: Legacy direct submission RPC (`submit_pc_quotation_request`) has public execute grants revoked (`REVOKE EXECUTE ... FROM anon, authenticated`) and is restricted to trusted backend roles (`service_role`, `postgres`).

---

## 3. Core Modules & Systems

### 3.1. Find My PC Recommendation Engine

The **Find My PC** engine (`src/lib/builder/recommendations.ts`) dynamically generates optimized PC configurations directly from live inventory:

- **Dynamic Candidate Synthesis**: Evaluates combinatorial component candidates from live Shopify products rather than static hardcoded templates.
- **Five Purpose Profiles**:
  1. _Esports & High-FPS Gaming_: GPU/CPU allocation weighted toward high frame rates and low latency.
  2. _AAA Cinematic Gaming_: Visual fidelity, VRAM capacity, and GPU headroom prioritization.
  3. _Content Creation & Video Editing_: Multi-threaded CPU performance, high-capacity RAM, and fast NVMe storage.
  4. _Software Development & Engineering_: High core counts, fast compilation memory, and multi-monitor expansion.
  5. _Everyday Office & Productivity_: Balanced, power-efficient, reliable baseline configurations.
- **Tri-Variant Delivery**: Produces three distinct build perspectives per valid query:
  - **Best Value**: Maximizes benchmark performance per rupee strictly within budget.
  - **Balanced Choice**: Optimal component synergy, cooling headroom, and power efficiency.
  - **Best Performance**: Top-tier silicon with zero unverified bottlenecks.
- **Honest Shortfall UI**: When a customer's budget cannot satisfy hard minimum baseline requirements (e.g. ₹25,000 for a dedicated gaming rig requiring discrete graphics), the engine refuses to pad recommendations with sub-par components. Instead, it transparently displays the exact rupee shortfall (e.g., _"Shortfall: ₹18,499 to meet minimum gaming baseline"_).

### 3.2. Hardware Specification & Compatibility Engine

The compatibility engine (`src/lib/builder/compatibility.ts`) enforces 10 strict physical, electrical, and platform rules:

- **Rule A (CPU & Socket)**: Validates exact socket compatibility (e.g., AM4, LGA1700, AM5).
- **Rule B (RAM Generation & Form Factor)**: Strictly prevents DDR4/DDR5 generational mismatches and SO-DIMM laptop memory in desktop boards.
- **Rule C (RAM Capacity & Slots)**: Enforces motherboard slot limits and maximum supported capacity.
- **Rule D (GPU Clearance)**: Validates GPU physical dimensions against cabinet maximum clearance.
- **Rule E (System Wattage & PSU Capacity)**: Calculates total estimated TDP load across all components with an advisory 25–35% headroom heuristic.
- **Rule F (Auxiliary PCIe Power)**: Compares PSU auxiliary PCIe power cables (6-pin, 8-pin, 12VHPWR) against GPU power connector requirements, rejecting under-cabled configurations.
- **Rule G (Motherboard & Case Form Factor)**: Matches ATX, Micro-ATX, and Mini-ITX boards to compatible chassis mounting points.
- **Rule H (Cooler Height & TDP)**: Validates CPU cooler height clearance and thermal dissipation ratings.
- **Rule I (Display Output Validation)**: Flags CPUs lacking integrated graphics (iGPU) when no discrete GPU is installed.
- **Rule J (Tri-State Verification & Rejection)**: Tracks specification states as `COMPATIBLE`, `INCOMPATIBLE`, or `UNKNOWN`. In automated recommendation modes, builds containing `UNKNOWN` critical specifications are strictly rejected from candidate pools.

### 3.3. PC Quotation Workflow

Custom PC fabrication requires technician review, component reservation, and custom assembly:

- **Seamless Guest Preservation**: Guests can freely configure builds, adjust parts, and inspect compatibility. Clicking _"Request Quotation"_ saves the pending build and preferences to `localStorage` (`savePendingQuotation`) and directs the user to sign in.
- **Post-Login Confirmation**: Upon successful authentication, the pending build is restored into the customer's view for explicit review and confirmation before submission. No quotation is ever submitted without explicit customer consent.
- **Authoritative Server Dispatch**: Dispatched to `verify-and-submit-pc-quotation` Deno Edge Function with customer JWT, returning an immutable `reference_id` (e.g. `IH-PC-20261026-XXXX`).

### 3.4. Technical Services & Repair Desk

- **Service Request Wizard**: Covers laptops, desktop PCs, printers, monitors, and CCTV systems with store walk-in or on-site pickup.
- **Itemized Quotations & Dynamic Diagnosis**: Technicians submit dynamic diagnostic findings and itemized repair quotes.
- **Partial Repair Approvals**: Customers can selectively approve optional repair line items while safety-critical mandatory repairs remain locked.
- **Cryptographic Payment Gateway**: Integrated Razorpay payment modal with webhook signature verification for service deposits and repair balances.

### 3.5. Headless Shopify Storefront & CMS

- **Storefront API Client** (`src/lib/shopify.ts`): Bounded caching (60s), request deduplication, and automated error recovery.
- **Multi-Variant Product Detail**: Interactive selectors for color, storage, RAM, and warranty options with synchronized inventory availability.
- **Direct Checkout Redirection**: Formats line items with authentic variant GIDs and redirects to official Shopify checkout.
- **IT HUB Blog CMS** (`src/pages/Blog.tsx`): Shopify Article and Blog querying with tag filtering, reading time estimates, and author attribution.

---

## 4. Benchmark & Quality Metrics

The Find My PC engine was independently validated against a rigorous 100-scenario automated benchmark suite (`supabase/functions/tests/pc-builder-phase6-benchmark.test.ts`):

```text
======================================================
IT HUB FIND MY PC — 100-SCENARIO BENCHMARK REPORT
======================================================
Total Scenarios Evaluated       : 100
Recommendation Suitability      : 100.00% (100/100)
Wilson 95% Confidence Interval  : [96.30%, 100.00%]
Critical Compatibility Errors   : 0 (0.00%)
Budget Violations               : 0 (0.00%)
Live Shopify Price Accuracy     : 100.00%
Recommendation Diversity (D)   : 100.00%
Combinatorial Search Latency P95: 0.40ms (Target < 50ms)
======================================================
```

- **Statistical Confidence**: 100/100 successes yields a Wilson 95% score confidence interval of **[96.30%, 100.00%]**.
- **Search Efficiency**: P95 combinatorial candidate synthesis latency of **0.40ms**, well within the 50ms real-time target.
- **Test Coverage**: 70/70 Deno tests passing across 9 test suites covering compatibility rules, Shopify Storefront integration, server-side security, rate limiting, and quotation flows.

---

## 5. Project Structure

```text
ITHUB_WEB/
├── src/
│   ├── main.tsx                         # React 19 entrypoint and global styles
│   ├── index.css                        # Tailwind CSS v4 entrypoint & brand theme tokens
│   ├── app/
│   │   ├── App.tsx                      # Primary application router and route definitions
│   │   └── store.tsx                    # Global state (cart, user session, notifications)
│   ├── components/                      # UI components
│   │   ├── Layout.tsx                   # Header, mega navigation, search bar, and footer
│   │   ├── AuthModal.tsx                # Mobile OTP & email authentication modal
│   │   ├── ProductCard.tsx              # Product card with price badges and live stock status
│   │   ├── QuotationApprovalPanel.tsx   # Customer service repair approval panel
│   │   ├── RepairPaymentModal.tsx       # Razorpay service checkout modal
│   │   └── ui.tsx                       # Radix UI design primitives
│   ├── data/                            # Static fixtures and seed data
│   │   ├── catalog.ts                   # In-store catalog fixtures and default certificates
│   │   └── blog.ts                      # Fallback technology blog articles
│   ├── lib/                             # Core libraries & business logic
│   │   ├── builder/                     # PC Builder & Find My PC Intelligence
│   │   │   ├── catalog.ts               # Shopify product normalization to PC component slots
│   │   │   ├── checkout.ts              # Quotation preparation and Shopify line item mapping
│   │   │   ├── compatibility.ts         # 10-rule hardware compatibility engine & Rule F
│   │   │   ├── persistence.ts           # Quotation dispatch, rate limit handling & local storage
│   │   │   ├── recommendations.ts       # Multi-branch synthesizer, purpose profiles & shortfall
│   │   │   ├── slots.ts                 # Component slot definitions and display order
│   │   │   └── types.ts                 # TypeScript interfaces for builds and specifications
│   │   ├── shopify.ts                   # Shopify Storefront API client & query deduplication
│   │   ├── shopify-schema.ts            # GraphQL types for Shopify Storefront API
│   │   ├── services.ts                  # Service ticket API client and repair quotation models
│   │   ├── blog.ts                      # Shopify Blog CMS fetcher and sanitization
│   │   └── supabase.ts                  # Supabase client configuration
│   └── pages/                           # Application Route Views
│       ├── Home.tsx                     # Landing page with hero banner and featured offerings
│       ├── Products.tsx                 # Catalog browsing, filtering, and multi-variant product details
│       ├── Commerce.tsx                 # Cart drawer, direct Shopify checkout, and order tracking
│       ├── Builder.tsx                  # Guided Find My PC and Expert Mode PC Builder
│       ├── Services.tsx                 # Technical service estimator, booking, and live tracker
│       ├── Blog.tsx                     # IT HUB Technology Blog & buying guides
│       ├── Support.tsx                  # Authorized brand support directory and service centres
│       ├── Information.tsx              # About IT HUB, history, and partner showcase
│       ├── Account.tsx                  # Customer account, address book, and quotation history
│       └── Admin.tsx                    # Back-office administration and service ticket management
├── supabase/
│   ├── schema.sql                       # Canonical PostgreSQL schema, tables, and RLS policies
│   ├── migrations/                      # Versioned PostgreSQL database migrations
│   │   ├── 20261022000001_phase5_dynamic_diagnosis_and_itemized_quotations.sql
│   │   ├── 20261025000001_pc_builder_quotation_persistence.sql
│   │   ├── 20261026000001_hardware_specifications.sql
│   │   ├── 20261026000002_quotation_server_verification.sql
│   │   └── 20261026000003_quotation_mandatory_authentication.sql
│   └── functions/                       # Deno Serverless Edge Functions
│       ├── verify-and-submit-pc-quotation/ # Server-side price verification and rate limiting
│       ├── verify-razorpay-webhook/        # Razorpay cryptographic payment signature check
│       ├── send-sms-hook/               # Indian SMS gateway OTP hook
│       └── tests/                       # Deno test suites (70 comprehensive automated tests)
├── scripts/
│   ├── shopify_inventory_pipeline.cjs   # Batch migration script for Shopify catalog
│   └── test_storefront_api.cjs          # Storefront GraphQL API integration verification
├── vite.config.ts                       # Vite 8 configuration with React & Tailwind CSS v4 plugins
├── package.json                         # Dependencies and build scripts
└── tsconfig.json                        # TypeScript configuration
```

---

## 6. Getting Started

### 6.1. Prerequisites

- **Node.js**: v20 or higher
- **Deno**: v1.40 or higher (for running test suites)
- **Package Manager**: `npm` or `pnpm`

### 6.2. Installation & Local Development

1. **Clone the repository**:

   ```bash
   git clone https://github.com/shawdi1557/IT-HUB.git
   cd IT-HUB
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in the root directory:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN=your-storefront-token
   VITE_RAZORPAY_KEY_ID=your-razorpay-key-id
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:8443` (or the configured Vite port).

### 6.3. Test & Verification Suites

```bash
# Run all 70 PC Builder, Security & Shopify tests with Deno
deno test -A supabase/functions/tests/pc-builder-*.test.ts

# Run production build
npm run build

# Type check TypeScript files
npm run typecheck
```

---

## 7. Brand & Store Information

- **Brand Name**: IT HUB
- **Tagline**: Technology Store, IT Services & Custom PC Fabrication
- **Headquarters**: Kothamangalam, Ernakulam District, Kerala, India — PIN 686691
- **Established**: 2011
- **Primary Contacts**: +91 98470 12345 | support@ithubkothamangalam.com
- **Brand Colors**:
  - Primary Blue: `#1a4fd6`
  - Deep Navy: `#0c2f8a`
  - Soft Tint: `#ecf1ff`
  - WhatsApp Accent: `#25D366`

---

## 8. License

Private and proprietary. Developed for IT HUB, Kothamangalam. All rights reserved.
