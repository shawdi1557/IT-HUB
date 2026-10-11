# IT HUB — Technology Store, IT Services & Support

A modern e-commerce and service platform prototype for **IT HUB, Kothamangalam, Kerala** (est. 2011).

The site is built around three pillars:

> **SHOP → SERVICE → SUPPORT**, with the **PC Builder** as a supporting tool.

Customers can buy technology products, book IT services, get after-sales and warranty help, and get a guided PC build recommendation. An admin dashboard manages all of it.

> **Prototype status:** everything runs in the browser.
> - **Data storage:** data is kept in `localStorage`. No server is required.
> - **Supabase:** a production-ready schema is provided in `supabase/schema.sql`.
> - **Simulated:** payments, SMS OTP and notifications.

---

## 1. Tech stack

| Area | Technology |
| --- | --- |
| Framework | React 19 + TypeScript, Vite 8 |
| Routing | React Router (data router) with lazy-loaded pages |
| Styling | Tailwind CSS v4 (`src/index.css`, `src/styles/theme.css`) |
| Motion | `motion`, `lenis` smooth scroll, React Bits effects (ShinyText, GlareHover, SonarGrid) |
| UI | Radix Dialog, lucide-react icons, custom components in `src/components/ui.tsx` |
| Data | React context store persisted to `localStorage` (`ithub-prototype-v1`) |
| Import | SheetJS (`xlsx`) for bulk CSV/XLSX product import |
| Charts | Recharts (admin analytics) |
| Backend (planned) | Supabase — Postgres schema with row-level security (`supabase/schema.sql`) |

Theme: **light only**, derived from the IT HUB logo.

| Token | Colour |
| --- | --- |
| Primary | `#1a4fd6` |
| Secondary | `#ecf1ff` |
| Deep | `#0c2f8a` |
| WhatsApp green | `#25D366`, used only on WhatsApp actions |

---

## 2. Getting started

```bash
pnpm install
pnpm dev       # start the dev server
pnpm build     # production build
pnpm preview   # preview the build
```

To reset the demo data, clear the `ithub-prototype-v1` (store) and `ithub-analytics-v1` (visitor analytics) keys in the browser's localStorage. You can also use the admin sample-data and *Clear demo data* tools.

---

## 3. Project structure

```text
src/
├── main.tsx                 Entry: mounts the app, imports index.css
├── app/
│   ├── App.tsx              Router, lazy routes (auto-reloads once on stale chunks)
│   └── store.tsx            Global state, persistence, auth, notifications, activity log
├── components/
│   ├── Layout.tsx           Header, Products mega-menu, search, account menu, footer
│   ├── ui.tsx               Button, Field, Modal, Badge, Select, Stars, Page, …
│   ├── AuthModal.tsx        OTP login + LoginGate
│   ├── ProductCard.tsx      Product card (Our price / MRP, stock, warranty)
│   ├── WarrantyCheck.tsx    On-site warranty PIN eligibility check
│   ├── WhatsAppIcon.tsx     Official WhatsApp glyph
│   └── GlareHover, ShinyText, reactbits   Visual effects
├── data/
│   ├── catalog.ts           Products, categories, offers, services, PC components,
│   │                        locations/PINs, brand-support directory, admin nav
│   ├── buildTemplates.ts    Smart PC Builder recommendation templates
│   └── admin.ts             Bulk-import columns & validation helpers
├── lib/
│   └── analytics.ts         Visitor sessions/events, track(), privacy controls, demo data
└── pages/
    ├── Home.tsx             Landing page
    ├── Products.tsx         Listing + product detail
    ├── Commerce.tsx         Cart, checkout, order success, order tracking
    ├── Services.tsx         Services landing, booking wizard, service tracking
    ├── Builder.tsx          Smart PC Builder + Expert Mode
    ├── Support.tsx          Help & Support (warranty assistance)
    ├── Account.tsx          Customer account
    ├── Information.tsx      About, Offers, Contact, 404
    ├── Admin.tsx            Admin dashboard
    └── AdminAnalytics.tsx   Analytics & Visitors views
public/images/               Product, store and PC imagery
supabase/schema.sql          Database schema + RLS policies
```

---

## 4. Customer site — how it works

### Navigation

The menu reads: **Products · Services · PC Builder · Help & Support · About**, with Search, Account and Cart on the right. The IT HUB logo links back to Home.

Hovering **Products** opens an animated mega-menu. It groups the categories (Computers & Office, PC Components, Mobiles & Audio, Accessories & More), shows a product count for each, and lists a few product names under each category. The mobile menu includes About and Contact as well.

### Home (`/`)

The page runs in priority order:

1. **Hero:** "Everything Tech. Sales, Service & Support." with *Shop Products* and *Explore Services*.
2. **Shop by Category:** a numbered list of categories with product counts.
3. **Featured Products.**
4. **IT Services:** Laptop, Mobile, PC and Printer service cards.
5. **IT Support at Your Location:** the on-site flow and the PIN check.
6. **We're Here After Your Purchase Too:** warranty and after-sales support.
7. **Build Your PC With IT HUB:** a small promo for the PC Builder.
8. **Your Local Technology Hub Since 2011:** the customer showcase and the "Rooted in Kothamangalam" section with a live Google Map.

### Products (`/products`, `/products/:id`)

- **Filters:** search, category, brand, price, availability and sort. Filters can also be set from the URL, e.g. `?category=Laptops&brand=ASUS&q=…`.
- **Pricing:** every product shows **Our price** with the struck-through **MRP**. Active offers are applied automatically; there are no coupon codes.
- **Product detail:** a gallery and price box (% OFF, You save, Inclusive of all taxes), stock, warranty and delivery. It has tabs for Overview, Specifications, Warranty, Reviews and Delivery, plus Related Products and Related Services. A *Warranty help* link goes to the support page.

### Cart & checkout (`/cart`, `/checkout`)

- **Login required:** you must be logged in to check out; the login modal opens automatically.
- **Order flow:** checkout collects the address, delivery and payment method (simulated), then shows *Order success*. Track the order at `/track-order/:id`.
- **Order statuses:** Placed → Confirmed → Packed → Shipped → Delivered. Cancelled orders are stored with status `-1`.

### IT Services (`/services`, `/services/book`)

- **Services page:** a hero ("Professional IT Services You Can Trust"), then service cards for Laptop, Mobile, PC, Printer and Software. PC Services links to PC Repair, Upgrade, Maintenance and the PC Builder. There is also an on-site section and a 7-step "Simple from start to finish" timeline.
- **Booking wizard:** Device → Problem → Service method → Your details → Date & time → Confirm.
  - Opening a service card passes the device in the URL (`?service=…&device=Laptop`), so the wizard starts directly at **Problem**.
  - Login is required to book.
- **Tracking:** at `/track-service/:id`.

### On-site warranty / service area

- **Eligibility check:** customers enter a PIN code. The app looks it up in the PIN directory, calculates the distance to the IT HUB location (Kothamangalam 686691), and checks it against the service radius (about 15 km, set by admin).
- **Logging:** every check is recorded for admin under Services → On-Site Warranty.

### Help & Support (`/support`)

There are four views (`?view=`): **Warranty Assistance, Service Assistance, On-Site Warranty, Contact IT HUB**.

**Warranty flow:**

1. **Category:** Laptop, Mobile or Printer. More can be added by admin.
2. **Brand:** search, Popular, Recently viewed, or *Other brand*.
3. **Brand support card:**
   - Warranty phone, customer care, support site, warranty portal, email and notes.
   - Actions: *Call Now* (`tel:` links), *Visit Official Website* and *Contact IT HUB*.
   - Each card has a **Verified on** or **Unverified** badge.

**Two separate paths:**

- **Brand Warranty Assistance** (white card): handled by the manufacturer, not IT HUB.
- **IT HUB Support** (blue card): call, WhatsApp, service request or the on-site PIN check, plus a "Can't resolve your issue?" checklist.

**Order-aware help:** each order has a *Warranty Assistance* button that links to `?order=…&product=…`. The page auto-fills the product, brand, category, purchase date and order number.

- If the warranty period is known, it shows an estimated *Warranty until* date.
- A manufacturer-verification disclaimer is always shown.

> **Data integrity rule:** support numbers and URLs must come from official manufacturer sources. The seed data includes only official support-site URLs, all marked *Unverified*. Every phone number is empty until an admin adds and verifies it.

### Smart PC Builder (`/pc-builder`)

The builder is a guided recommendation flow, not a component configurator.

1. **Landing:** *Find My PC* (primary) or *I'm an expert — Customize My Build* (Expert Mode).
2. **Purpose:**
   - Choose Gaming, Content Creation, Work, Professional, General Use, or *Something Else* (free text).
3. **Budget:** ₹40k–60k, ₹60k–80k, ₹80k–1L, ₹1L–1.5L, ₹1.5L+, or a custom amount. *Show My Builds* goes straight to the results.
4. **Recommendations:** three builds labelled by trade-off (Value-focused, Balanced, Higher-performance, Upgrade-friendly), never ranked.
   - **Scoring:** builds are scored on purpose match, flexible budget fit, availability and upgrade potential.
   - **Over budget:** builds slightly over budget show a note.
   - **Out of stock:** out-of-stock parts suggest an alternative with the price difference.
6. **Build detail:**
   - "Designed for" line, each component with a plain-language explanation, and "Why we recommend this build".
   - Expandable price breakdown: components plus assembly (Free when the charge is 0).
   - The estimate disclaimer.
7. **Actions:**
   - **Customize This Build:** swaps are compatibility-checked (socket, RAM type, GPU clearance, PSU wattage, cooler, storage interface) and the price is recalculated.
   - **Save Build:** requires login.
   - **Continue on WhatsApp:** sends a pre-filled enquiry to the number set in admin Settings.

Expert Mode keeps the manual 8-part configurator, with compatibility checks, *Add build to cart*, and a *Complete configuration* preview with WhatsApp.

### Account (`/account/:section`)

Sections: Profile, Orders (with order details and Warranty Assistance), Addresses, Offers, Wishlist, Warranty, After-sales Support, Service requests, and **PC Builds**.

PC Builds lets the customer view, rename, compare two side by side, customize, contact IT HUB, add to cart, or delete a build.

### Authentication

Login is by **phone/email + 6-digit OTP**.

- **Demo behaviour:** the prototype has no SMS gateway, so the OTP is generated locally and shown in a notification.
- **Gated actions:** checkout, service booking and saving builds require login.
- **Roles:** there are only two, **customer** and **admin**.

### Other pages

- **About:** store story, live Google Map, and the Intel partner section.
- **Offers:** direct product offers, no coupon codes.
- **Contact.**
- **404.**

---

## 5. Admin dashboard (`/admin/:section?view=…`)

| Section | What it does |
| --- | --- |
| **Dashboard** | KPIs, recent orders/requests, activity log, sample-data tools |
| **Products** | All Products, Categories, Brands, **Bulk Import**: CSV/XLSX upload in steps, with templates, validation, preview and import history |
| **Inventory** | Stock levels, low-stock thresholds, filters |
| **Orders** | Status updates, cancellation, filters |
| **Offers** | Create time-boxed offers (percentage or flat) for products, categories or brands; banner, active toggle |
| **Services** | Laptop / Mobile / PC / Printer / On-Site views (matched by keywords in the device or method), All Requests, On-Site Warranty check log, Service Areas (PIN codes and radius) |
| **Warranty / After-Sales** | Brand Support directory (All / Laptop / Mobile / Printer), Verification History |
| **PC Builder** | **Build Templates**, Configurations, Requests (WhatsApp enquiries), Estimates (component prices) |
| **Customers** | Customer list |
| **Reviews** | Review moderation |
| **Analytics & Visitors** | Overview (visitor KPIs + sales/service charts), Visitor Locations, Traffic Sources, Devices, Pages & Products, Audit Logs (visitor activity + admin activity) |
| **Settings** | Store info, IT HUB location, service radius, **WhatsApp number**, **Privacy & Visitor Data** |
| **Website Content** | Customer showcase (Home "Trust" gallery) |

### Analytics & Visitors

- **Data model:** `src/lib/analytics.ts` records visitor sessions and events separately (anonymous browser-scoped visitor ID, 30-minute session timeout). Storefront actions call `track()` (page views, product views, add to cart, checkout, orders, service bookings, PC builder, warranty assistance, WhatsApp, login/logout, admin login/data changes).
- **Date range:** Today / 7 / 30 / 90 days / Custom, shared across all views. Every figure is calculated from stored records; sparse ranges show an empty or "insufficient data" state.
- **Locations:** IP-derived and always labelled *approximate* (or *Location unavailable*). Never an address, and separate from addresses customers enter. Ranked table, "Visitors by Location" chart (City/State/Country), Kerala / Other India / International summary and grouped distribution tiles.
- **Audit Logs:** search, filters, sorting and pagination. Click a row to open the session drawer with an activity timeline. The existing admin activity log is on the *Admin activity* tab.
- **Demo data:** *Load demo data* generates rows flagged `demo` that use documentation-range IPs. A "Demo data" badge appears whenever any are in range; *Clear demo data* removes them.
- **Privacy (Settings → Privacy & Visitor Data):** analytics on/off, IP logging, IP masking, retention (7–365 days), anonymize, delete all (with confirmation), CSV export.

### Brand Support admin

- **Records:** add or edit records, one per brand per category. URLs must start with `https://`.
- **Verification:**
  - Editing a phone number, URL or email resets the record to *Unverified*, unless it is re-verified in the same save.
  - **Mark verified** requires the official source URL and the verifier's name, and writes an entry to Verification History.
- **Controls:** enable/disable and delete each record. You can also add new support categories (e.g. TV) for future use.

### Build Templates admin

- **Fields:** purpose, budget range, name, resolution, usage, trade-off, all 8 parts (from the component catalogue), highlights, and active/inactive status.
- **Pricing:** the estimated price is calculated live from current component prices. The **assembly charge** is set here (0 = free).
- **Actions:** duplicate a template or delete it with a confirmation.

---

## 6. Data & state

All state lives in `src/app/store.tsx` and is saved to `localStorage` on change. On load, saved data is merged with the defaults so that new features get their seed data. Old coupon-style offers are migrated, and missing build templates and components are added back. Because of this, a component an admin deleted can reappear after a reload.

**Main state keys:**

| Group | Keys |
| --- | --- |
| Catalogue | `products`, `brands`, `componentCatalog` |
| Commerce | `cart`, `orders`, `offers`, `wishlist` |
| Services | `requests` (services), `warrantyChecks`, `locations` |
| Support | `supportCategories`, `brandSupport`, `supportVerifications`, `recentSupport` |
| PC Builder | `builds` (saved), `buildTemplates`, `assemblyCharge`, `pcEnquiries` |
| Admin | `importHistory`, `showcase`, `settings` (WhatsApp, address, phone, email), activity log |

The store also provides `set(updater)`, `notify(message)`, `log(event)`, `loggedIn` and `setAuthOpen()`. `log()` also records an *Admin Data Change* analytics event on admin pages.

The store's React context is created once and reused across hot reloads, so editing `store.tsx` during development doesn't cause a "Store provider is required" crash.

**Visitor analytics** is kept apart from the main store, in `src/lib/analytics.ts`, under its own key `ithub-analytics-v1`:

| Data | Contents |
| --- | --- |
| `sessions` | Visitor/session IDs, approximate location (via ipapi.co), IP (only when IP logging is on), device, OS, browser, referrer, landing page, first/last seen, page views, new/returning |
| `events` | Event ID, session ID, user ID (when logged in), event type, timestamp, page and metadata (newest 5,000 kept) |
| `settings` | Analytics on/off, IP logging, IP masking, retention period |

Read it in components with `useAnalytics()` and record events with `track(type, meta)`. Old data is deleted automatically once it passes the retention period.

---

## 7. Supabase schema (`supabase/schema.sql`)

The schema is ready for moving off `localStorage`:

- **Users:** `profiles` with an `app_role` enum (`admin` | `customer`) and an `is_admin()` helper.
- **Catalogue and offers:** catalogue tables, plus offers and their product, category and brand links, and a `live_offers` view.
- **Commerce and services:** orders, reviews and service requests.
- **Locations:** `it_hub_locations`, `pincode_areas` and `check_onsite_warranty()`.
- **PC Builder:** `pc_builds` and `pc_build_templates`.
- **Support:** `support_categories`, `brand_support` (unique per brand + category, with verification fields) and `support_verifications`.
- **Settings:** `store_settings`.
- **Visitor analytics:** `visitor_sessions` and `visitor_events` (kept separate and linked by session), plus `analytics_settings`. Visitors write only through the security-definer function `log_visitor_event(...)`, which takes the IP from request headers. `purge_visitor_data()` enforces retention and can be scheduled with pg_cron. Only admins can read these tables.

**Row-level security:**

- The public can read active catalogue, offer, support and template rows.
- Customers can read and write only their own orders, builds and requests.
- **Only admins can write** management tables.

---

## 8. Before going live

- [ ] Replace the placeholder WhatsApp number (`919999999999`) in **Admin → Settings**.
- [ ] Fill in and **verify** brand support phone numbers and URLs from official manufacturer sources.
- [ ] Connect Supabase and replace the `localStorage` store with database queries.
- [ ] Connect a real SMS/OTP provider and a payment gateway.
- [ ] Review the service radius, PIN directory, component prices and build templates.
- [ ] Send analytics events to Supabase (`log_visitor_event`). Today they are stored only in each visitor's browser, so the dashboard shows only local and demo data.
- [ ] Review the privacy notice and retention period for visitor analytics. Each new session sends the visitor's IP to ipapi.co for an approximate location.
- [ ] Optimise large images (e.g. `public/images/pc-build.png`, about 3 MB).

## 9. Changelog

- **PC Builder:** the guided flow is now Purpose → Budget → Builds. The purpose follow-up questions and the optional Preferences step were removed.
- **Navigation:** removed Home from the menu (the logo links home) and added About after Help & Support.
