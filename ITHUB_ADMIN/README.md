# IT HUB — SERVICE & PC PORTAL (`ITHUB_ADMIN`)

A dedicated, private staff portal built for authorized **IT HUB** personnel to manage custom PC quotations and workshop technical services.

---

## 1. Scope & Modules

This portal is intentionally separate from the public e-commerce storefront and contains strictly two operational modules:

1. **PC Quotations Management (`/quotations`)**:
   - Live queue of customer PC builds submitted through the public PC Builder.
   - Authoritative live price recalculation audit against Shopify variant GIDs.
   - Price divergence and tampering review indicators.
   - Status progression (`New` &rarr; `Contacted` &rarr; `Quoted` &rarr; `Closed`).
   - Staff notes logging with immutable audit trail.

2. **Service Management Desk (`/services`)**:
   - Repair intake queue for Laptop, Desktop, Mobile, Printer, CCTV, and Electronics.
   - Technician assignment and workshop workbench status tracking.
   - Itemized repair quotation builder with diagnostic findings.
   - Publishing quotes directly to customer tracking views for partial/full authorization.
   - Staff-only internal diagnosis notes kept separate from customer-visible remarks.

---

## 2. Authentication & Security Boundary

- **Authentication Method**: Supported via Supabase Auth Email OTP (Magic Code) and verified administrator password.
- **Role Verification**: Verified server-side via `public.get_staff_portal_profile()` against `public.staff_members` and `public.profiles`.
- **Unauthorized Customer Defense**: Ordinary customer logins attempting to access the portal are immediately rejected and terminated with an explicit unauthorized access shield.
- **Client Key Isolation**: Only public publishable keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are bundled. The `service_role` key and Shopify Admin tokens are strictly excluded.
- **Append-Only Audit**: All status transitions and technician assignments log immutable records into `public.staff_audit_logs`.

---

## 3. Local Development

### Prerequisites

- Node.js v20 or higher
- Deno v1.40 or higher (for test suites)
- npm or pnpm

### Getting Started

1. **Navigate to the portal directory**:

   ```bash
   cd ITHUB_ADMIN
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create `.env.local` using `.env.example`:

   ```env
   VITE_SUPABASE_URL=https://aeulrulvpxyqmxmypzey.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-key
   ```

4. **Start the local portal development server**:

   ```bash
   npm run dev
   ```

   The portal will be running locally at `http://localhost:5174`.

5. **Typecheck & Build**:
   ```bash
   # Typecheck TypeScript
   npm run typecheck

   # Production Build
   npm run build
   ```

---

## 4. Production Deployment & Subdomain Configuration

- **Target Domain**: Recommended as a subdomain, e.g., `staff.ithubkothamangalam.com`.
- **Hosting**: Can be deployed on Vercel, Cloudflare Pages, Netlify, or AWS S3 + CloudFront as an independent SPA.
- **SPA Routing**: Ensure single-page application fallback is enabled (`/* -> /index.html`).
