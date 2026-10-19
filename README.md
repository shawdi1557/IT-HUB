# IT HUB — E-Commerce, IT Services & PC Builder Platform

A modern omnichannel technology retail, on-site service booking, and custom PC configuration platform built for **IT HUB, Kothamangalam, Kerala** (est. 2011).

The platform bridges physical retail and digital commerce, delivering a unified experience across shopping, hardware diagnostics, brand warranty assistance, and custom computer fabrication.

---

## 1. About the Project

**IT HUB** has served customers across Central Kerala for over a decade as an authorized technology retailer and multi-brand service center. This web application brings the complete IT HUB ecosystem online, offering:

- **E-Commerce Catalog**: Browse and purchase laptops, desktops, custom PC components, networking gear, peripherals, and CCTV surveillance systems with real-time stock indicators.
- **Guided PC Builder**: An interactive system builder with automated socket/wattage compatibility checks, preset build recommendations, and direct cart export.
- **Technical Services & Repairs**: Booking portal for chip-level motherboard repair, display replacements, data recovery, OS installations, and CCTV annual maintenance contracts.
- **Authorized Brand Support Directory**: Direct contact information, toll-free lines, and escalation matrices for over 20+ partner brands (HP, Dell, Lenovo, Asus, Canon, Epson, Hikvision, etc.).
- **Partner Accreditations & Showcase**: Interactive showcase of official brand certifications and industry recognitions (Intel Gold Partner, AMD Commercial, Microsoft Authorized, ASUS Gold Partner, Dell Certified, Canon Authorized).
- **Administrative Back-Office**: Comprehensive management dashboard for inventory, orders, customer service tickets, visitor analytics, and live showcase certificates.

---

## 2. Platform Architecture

The system is architected as a decoupled, responsive single-page application (SPA) backed by cloud PostgreSQL with Row Level Security (RLS) and serverless Edge Functions.

### Technology Stack

| Layer | Technologies | Role & Key Features |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, TypeScript 5.7, Vite 8 | Ultra-fast SPA with client-side routing, code splitting, and type safety |
| **Styling & Motion** | Tailwind CSS v4, Motion, Lenis | Responsive styling, brand tokens (`#1a4fd6`, `#ecf1ff`, `#0c2f8a`), smooth scrolling |
| **Component Primitives** | Radix UI, Lucide Icons | Accessible dialogs, dropdowns, accessible modal overlays with wheel-scroll isolation |
| **Database & Auth** | Supabase (PostgreSQL 15), GoTrue | Cloud relational database, Row Level Security (RLS), custom RPCs, E.164 phone OTP authentication |
| **Edge Functions** | Deno runtime | Serverless webhooks for Indian SMS OTP gateways and cryptographic payment verification |
| **Payments** | Razorpay SDK | UPI, Debit/Credit cards, Net Banking, and Pay on Delivery options |
| **State Management** | Centralized Store with localStorage | Persistent cart, customer session, live inventory hydration, and certificate state |

### Security & Data Isolation
- **Row Level Security (RLS)**: Enforced across all tables. Guest visitors (`anon`) access only public catalog views (`products_public`, `live_offers`) with sensitive margin data (`cost_price`) excluded.
- **InitPlan Query Optimization**: User authentication checks use `(select auth.uid())` to enable PostgreSQL to cache user identity once per query execution.
- **Transactional RPC Procedures**: Critical mutations (`create_order`, `cancel_order`, `ensure_profile`) run inside atomic PostgreSQL transaction blocks with `SECURITY DEFINER` and restricted search paths.

---

## 3. Core Modules & Features

### 3.1. E-Commerce Storefront
- Multi-dimensional filtering by category, brand, price range, and stock availability.
- Product detail pages with comprehensive specifications, warranty terms, and high-resolution galleries.
- Instant pincode serviceability checker for local on-site delivery and installation.
- Responsive cart drawer with instant quantity adjustments, coupon validation, and order breakdown.
- Multi-step checkout with address selection, payment gateway integration, and instant order tracking (`/track-order/:id`).

### 3.2. Guided PC Builder
- Step-by-step component selection: Processor, Motherboard, Memory, Graphics Card, Storage, Power Supply, Cabinet, and Cooling.
- Real-time compatibility checks (CPU socket matching, RAM generation, estimated system wattage).
- One-click build templates: Budget Office, Competitive Esports, 4K Gaming, and Creative Workstation.
- Shareable build summaries with instant WhatsApp inquiry export or direct cart addition.

### 3.3. Technical Services & Diagnostics
- Service request wizard covering laptops, desktop PCs, printers, monitors, and CCTV systems.
- Options for store walk-in or on-site pickup within the Kothamangalam service radius.
- Live service ticket tracker (`/track-service/:id`) with real-time status progression from diagnosis to completion.

### 3.4. Recognition & Certificate Showcase
- Displays official partner credentials and authorized dealer accreditations.
- Interactive modal with high-resolution image viewing and wheel-scroll containment.
- Dynamic administrative management allowing certificates to be added, edited, or removed in real time.

### 3.5. Administrative Suite (`/admin`)
- **Inventory & Catalog**: Real-time stock counts, price updates, threshold alerts, and category management.
- **Order Management**: Track order fulfillment stages (`placed` → `confirmed` → `packed` → `shipped` → `delivered`).
- **Service Desk**: Manage incoming repair jobs, technician assignments, and diagnosis notes.
- **Certificate CMS**: Dedicated admin panel (`/admin/certificates`) to manage showcase certificates with instant storefront synchronization.
- **Analytics Dashboard**: Visitor session volume, top-selling categories, and conversion metrics.

---

## 4. Project Structure

```text
ITHUB_WEB/
├── src/
│   ├── main.tsx                  # React 19 entrypoint and global CSS imports
│   ├── index.css                 # Tailwind CSS v4 entrypoint & brand theme variables
│   ├── app/
│   │   ├── App.tsx               # Primary application router and route definitions
│   │   └── store.tsx             # Global application state (cart, user, certificates, notifications)
│   ├── components/               # Reusable presentation and layout components
│   │   ├── Layout.tsx            # Header, mega navigation, search bar, and footer
│   │   ├── AuthModal.tsx         # Mobile OTP authentication modal (+91 format)
│   │   ├── ProductCard.tsx       # Standard product card with pricing badges and stock status
│   │   ├── WarrantyCheck.tsx     # On-site service PIN code validation widget
│   │   └── ui.tsx                # Design system primitives (Dialogs, Buttons, Tabs, Inputs)
│   ├── data/                     # Baseline catalog data and static fixtures
│   │   └── catalog.ts            # Seed products, brands, services, and default certificates
│   ├── lib/                      # Core libraries and service integrations
│   │   ├── auth.ts               # Supabase authentication helpers and phone sanitization
│   │   ├── supabase.ts           # Supabase client configuration
│   │   ├── catalogService.ts     # Catalog fetching, caching, and fallback management
│   │   └── analytics.ts          # Privacy-friendly visitor event tracking
│   └── pages/                    # Main route views
│       ├── Home.tsx              # Landing page with hero banner, quick links, and featured deals
│       ├── Products.tsx          # Catalog browsing, filtering, and product detail views
│       ├── Commerce.tsx          # Cart drawer, checkout workflow, and order tracking
│       ├── Builder.tsx           # Custom PC builder and compatibility engine
│       ├── Services.tsx          # Service offerings, pricing guide, and booking wizard
│       ├── Support.tsx           # Authorized brand support directory and escalation contacts
│       ├── Information.tsx       # About IT HUB, company history, and certificate showcase
│       ├── Account.tsx           # Customer account, address book, and order history
│       ├── Admin.tsx             # Main administration dashboard
│       ├── AdminCertificates.tsx # Dedicated certificate showcase management CMS
│       └── AdminAnalytics.tsx    # Visitor session graphs and telemetry charts
├── supabase/
│   ├── schema.sql                # Canonical PostgreSQL schema, tables, and RLS policies
│   ├── migration.sql             # Migration scripts, InitPlan optimizations, and index tuning
│   └── functions/                # Deno Edge Functions
│       ├── send-sms-hook/        # Webhook for dispatching SMS OTPs via Indian SMS gateways
│       └── verify-payment/       # Razorpay cryptographic signature verification
├── public/                       # Static public assets, certificate images, and icons
├── package.json                  # Dependencies and execution scripts
├── vite.config.ts                # Vite 8 configuration with React and Tailwind CSS v4 plugins
└── tsconfig.json                 # TypeScript compiler configuration
```

---

## 5. Getting Started

### 5.1. Prerequisites
- **Node.js**: v20 or higher
- **Package Manager**: `pnpm` (recommended) or `npm`

### 5.2. Installation & Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/shawdi1557/IT-HUB.git
   cd IT-HUB
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in the root directory:
   ```env
   VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_RAZORPAY_KEY_ID=your-razorpay-key-id
   ```

4. **Start the development server**:
   ```bash
   pnpm dev
   ```
   The application will be available at `http://localhost:8443` (or the configured Vite port).

### 5.3. Build & Quality Scripts

```bash
# Type-check TypeScript files
pnpm typecheck

# Format codebase using oxfmt
pnpm format

# Build production bundle
pnpm build

# Preview production build locally
pnpm preview
```

---

## 6. Brand & Store Information

- **Brand Name**: IT HUB
- **Tagline**: Technology Store, IT Services & Support
- **Headquarters**: Kothamangalam, Ernakulam District, Kerala, India — PIN 686691
- **Established**: 2011
- **Primary Contacts**: +91 98470 12345 | support@ithubkothamangalam.com
- **Brand Colors**:
  - Primary Blue: `#1a4fd6`
  - Deep Navy: `#0c2f8a`
  - Soft Tint: `#ecf1ff`
  - WhatsApp Accent: `#25D366`

---

## 7. License

Private and proprietary. Developed for IT HUB, Kothamangalam. All rights reserved.

