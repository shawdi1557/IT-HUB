# IT HUB — Supabase Database Remediation, Security Audit & Production Readiness

## 1. Your Role

Act as a **Senior PostgreSQL Database Architect, Supabase Security Engineer, Backend Engineer, and Payment Integration Auditor**.

You are working on the existing **IT HUB e-commerce and IT services platform** for a business in Kerala, India.

I previously generated five remediation files using Gemini:

1. `schema(1).sql` — complete database schema
2. `migration.sql` — migration for an existing database
3. `storage-policies.sql` — Supabase Storage bucket configuration and policies
4. `security-review.md` — security findings and recommended fixes
5. `test-plan.md` — database and security test cases

These files have already undergone an initial review. However, several important problems remain unresolved or insufficiently verified.

Your task is to **inspect all five files together, correct the actual implementation, preserve existing business requirements, and produce a consistent, testable, security-conscious database package**.

Do not assume that the previous remediation was correct merely because the security review says that an issue has been resolved.

Do not stop at providing recommendations. Where a defect exists, fix the relevant SQL, migration, policy, function, or test.

---

## 2. Mandatory Working Rules

Follow these rules throughout the task:

1. Read all five attached files completely before editing anything.
2. Trace relationships between tables, functions, triggers, RLS policies, views, grants, storage policies, and application workflows.
3. Treat the existing files as the starting implementation, not as proof of correctness.
4. Preserve the existing IT HUB features and business logic unless a change is necessary for security, consistency, or correctness.
5. Do not silently remove features, tables, columns, functions, policies, or business rules to make the audit easier.
6. Do not fabricate successful test results. Clearly distinguish static code review from tests actually executed.
7. Do not claim production readiness unless all required checks have been performed and the remaining limitations are documented.
8. Never expose Supabase service-role keys, Razorpay secrets, webhook secrets, or other credentials in frontend code, SQL seed files, documentation, or logs.
9. Avoid unnecessary architecture changes. Prefer targeted, backward-conscious corrections over a complete rewrite.
10. Do not run destructive commands against a real or production database. Provide scripts and instructions for review and controlled testing.
11. If you cannot execute SQL against a real PostgreSQL/Supabase environment, explicitly state that the code has not been runtime-validated.
12. Keep the final deliverables internally consistent: the schema, migration, Storage policies, security review, and test plan must describe the same implementation.

## 3. IT HUB Business Requirements to Preserve

IT HUB is an e-commerce and IT services website. It includes:

- New and second-hand IT products.
- Product categories, brands, specifications, pricing, stock, and product images.
- Product search, filtering, product details, cart, and checkout.
- Customer accounts and administrator accounts.
- Customer orders, order items, order statuses, and payment statuses.
- Coupons and promotional offers.
- One-time coupon redemption per authenticated customer per coupon.
- Product inventory management and stock control.
- Razorpay online payment integration.
- IT services, service requests, diagnosis fees, courier arrangements, and service status tracking.
- Sell Your Item requests with photos, invoices, warranty information, and administrator review.
- Product warranty and after-sales assistance.
- Public product browsing and controlled public offers.
- Visitor analytics and audit logging.
- Private customer documents and invoices.
- Administrator management of products, orders, coupons, offers, service requests, and related business records.

The application uses a React and TypeScript frontend, with Supabase PostgreSQL, Authentication, Row Level Security, and Storage.

The website is deployed or intended to be deployed using Vercel.

Keep these core roles:

- **Customer:** Can access their own protected account data and permitted customer workflows.
- **Admin:** Can perform authorized administrative operations.
- **Unauthenticated visitor:** Can browse explicitly public content without receiving access to private customer or administrative data.

Use `auth.uid()` and trusted server-side logic for authorization wherever appropriate. Do not rely on frontend checks as the security boundary.

---

# 4. Critical Issue A — Correct Product Pricing and MRP

## Current defect

The reviewed schema does not contain an explicit `mrp` field in the products table, public product view, or migration.

IT HUB needs to display the product's Maximum Retail Price and its actual selling price separately.

## Required data model

Review the current meaning of `price`, `sale_price`, and `cost_price`.

Implement a clear and consistent pricing model:

- `mrp`: Manufacturer's Retail Price or stated MRP, displayed publicly.
- `price`: Regular IT HUB selling price.
- `sale_price`: Optional promotional selling price, if the existing application requires it.
- `cost_price`: Internal procurement cost, if needed for inventory or profit calculations. Never expose this to ordinary customers.

Do not assume that `price` is MRP.

If `sale_price` is retained, explicitly define when it applies and how the effective customer price is calculated. Avoid ambiguous or contradictory pricing rules.

## Required changes

1. Add `mrp` to the canonical product schema.
2. Add the corresponding safe migration for existing databases.
3. Update the public product view to expose `mrp` and the intended public selling-price fields.
4. Keep `cost_price` excluded from all public views and customer-accessible query paths.
5. Review column types, currency precision, nullability, non-negative constraints, and reasonable pricing validations.
6. Decide whether MRP must always be greater than or equal to the effective selling price. If so, enforce this consistently without breaking valid existing records.
7. Define the rule for products without a promotional price.
8. Ensure order items store the trusted price used at checkout so that later price changes do not alter historical order records.
9. Ensure discounts, coupon calculations, order totals, and offer calculations use the same effective-price rules.
10. Update the test plan to cover normal pricing, promotional pricing, missing MRP, invalid pricing, and attempts to access `cost_price`.

Do not modify the product pricing model in only one file. Update every dependent schema, view, function, migration, and test.

---

# 5. Critical Issue B — Razorpay Payment Verification

## Current concern

The schema contains a privileged function similar to `record_order_payment()` that updates payment status.

A database function must not be treated as proof that a real payment succeeded merely because it was called.

A malicious or incorrect caller must not be able to mark an unpaid order as paid.

## Required payment architecture

Implement and document the following trust boundary:

**Frontend → Trusted backend or Supabase Edge Function → Razorpay verification → Database payment update**

The frontend must never be the authority for payment success.

The Razorpay secret key and webhook secret must remain server-side.

## Verify the checkout signature correctly

When using Razorpay Checkout, the backend must verify the checkout signature using the appropriate Razorpay checkout signature procedure and the configured API secret.

Validate the expected order/payment relationship and ensure the payment corresponds to the correct internal IT HUB order.

## Verify webhooks correctly

For webhook events:

1. Read the raw HTTP request body exactly as required by Razorpay's webhook verification procedure.
2. Verify the `X-Razorpay-Signature` header using the configured **webhook secret**.
3. Do not substitute the Razorpay API key secret for the webhook secret.
4. Reject invalid signatures.
5. Validate the event type and payment state.
6. Confirm the payment's Razorpay order ID matches the expected Razorpay order associated with the internal IT HUB order.
7. Verify the expected amount and currency against trusted database records and the payment/order details.
8. Do not trust arbitrary client-provided order IDs, payment status, totals, amounts, or notes as sufficient evidence.
9. Handle duplicate webhook delivery safely.
10. Prevent replay or conflicting payment events from corrupting order state.
11. Handle payment failure, cancellation, refunds, and delayed payment confirmation according to explicitly defined transitions.
12. Record enough payment-event information for safe reconciliation without unnecessarily storing sensitive data.

Do not assume that a payment's `notes.order_id` is always populated or trustworthy. Establish a reliable mapping between the internal order, Razorpay order, and Razorpay payment.

## Database function requirements

Audit `record_order_payment()` and every related privileged function.

- Restrict execution to the intended trusted backend role.
- Verify database privileges and function ownership.
- Use a secure `search_path` for privileged functions.
- Prevent ordinary authenticated customers from invoking payment-finalization functions.
- Ensure only a verified payment workflow can finalize payment.
- Make payment processing idempotent.
- Prevent a payment event for one order from updating a different order.
- Ensure paid orders cannot be silently downgraded by duplicate or out-of-order events.
- Avoid granting broad privileges merely to make the frontend integration work.

If SQL alone cannot verify a Razorpay signature, explicitly keep cryptographic verification in the trusted Edge Function or backend. Do not attempt to solve this by trusting a frontend boolean.

## Required deliverables

Provide:

1. Corrected SQL payment-related functions and permissions.
2. A clear Edge Function or trusted-backend implementation outline, including signature verification and database calls.
3. The environment variables required, with placeholders only.
4. The expected payment state transitions.
5. Tests for invalid signatures, mismatched order IDs, mismatched amounts, wrong currency, duplicate webhooks, failed payments, and valid payment confirmation.

Do not claim that Razorpay is fully implemented until the trusted backend code and configuration have actually been completed and tested.

---

# 6. Critical Issue C — Unpaid Orders, Stock Reservation, and Expiration

## Current concern

The existing `create_order()` workflow deducts stock when the order is created, but abandoned or unpaid orders may not automatically release the reserved stock.

This can cause inventory to remain unavailable indefinitely.

## Required investigation

Trace the complete lifecycle:

- Order creation.
- Price and stock validation.
- Stock reservation or deduction.
- Razorpay order creation.
- Successful payment.
- Failed payment.
- Customer cancellation.
- Payment timeout.
- Abandoned checkout.
- Refund or post-payment cancellation, if supported.

## Required solution

Choose and document one consistent inventory strategy.

### Option A: Reserve stock at checkout

If stock is reserved when an order is created:

- Store a reliable expiration timestamp.
- Ensure reservation is atomic and safe under concurrent checkout attempts.
- Release reserved stock when the order expires or is cancelled without payment.
- Prevent paid orders from having their stock reservation released by a stale cleanup task.
- Prevent stock from being restored twice.
- Ensure retries cannot duplicate stock restoration.
- Ensure stock reservations are associated with the relevant order and inventory changes are traceable.

### Option B: Deduct stock only after payment

If stock is deducted after successful payment:

- Verify availability during checkout.
- Prevent overselling under concurrent payments.
- Atomically confirm stock availability and update inventory when payment is finalized.
- Define how to handle a successful payment when inventory is no longer available.

Choose the strategy that fits the current schema and implementation best. Explain the trade-offs.

## Expiration and cleanup requirements

Provide a reliable mechanism for identifying and processing expired unpaid orders.

- Use a trusted scheduled backend process or another supported scheduling mechanism.
- Do not assume that a SQL comment describing a scheduled job means the job exists.
- Make the cleanup safe to rerun.
- Ensure cancellation and payment confirmation cannot race into inconsistent inventory.
- Record relevant order and inventory transitions for auditability.
- Never restore stock twice for the same order.

Document how to configure and verify the scheduled process in Supabase.

Add tests for concurrent checkout, abandoned orders, expired orders, cancellation, successful payment near expiration, duplicate cleanup, and stock-restoration idempotency.

---

# 7. Critical Issue D — Safe Migration and Fresh Installation

## Current concern

The current `migration.sql` claims compatibility with both fresh and existing databases but assumes that several core tables and other objects already exist.

It also includes statements such as:

`DROP VIEW IF EXISTS ... CASCADE`

This can remove dependent database objects and is not appropriate as a casual compatibility mechanism.

## Required deliverables

Produce two clearly distinguished installation paths.

### A. Fresh installation

Provide a complete, ordered schema script that works on a genuinely empty Supabase project.

It must include the required:

- Extensions, where needed.
- Enums and types.
- Tables and constraints.
- Indexes.
- Triggers.
- Functions.
- Views.
- Grants and revokes.
- RLS enablement and policies.
- Storage setup references or separate Storage instructions.

Ensure dependency order is correct.

If the fresh-install script is intended to run only once, document that requirement clearly. Do not claim that it is safely rerunnable unless it actually is.

### B. Existing database migration

Provide a migration that assumes an explicitly documented starting schema version.

- State its prerequisites.
- Check that required tables, columns, and dependencies exist before using them.
- Add missing columns such as `mrp` safely.
- Handle existing data and defaults deliberately.
- Resolve existing policies and constraints without accidental duplication.
- Avoid unnecessary object deletion.
- Preserve valid existing customer and business data.
- Avoid destructive `CASCADE` operations unless they are demonstrably necessary and explicitly justified.
- If an object must be replaced, inspect its dependencies and recreate required dependent objects safely.
- Make the migration's transaction behavior explicit.
- Provide a rollback or recovery plan where practical.
- Identify changes that cannot be rolled back automatically without data loss.

Do not use `IF NOT EXISTS` as a substitute for verifying that an existing object's definition is correct.

Do not claim the migration supports every possible database state. Define the exact schema version and prerequisites.

## Migration validation

Add checks for:

- Missing core tables.
- Missing expected columns.
- Existing conflicting policies.
- Duplicate indexes or constraints.
- Existing data that violates new constraints.
- Dependencies on views being changed.
- Functions whose signatures or permissions have changed.

If the current database state is unknown, state that the migration cannot be guaranteed safe until the existing schema is inspected.

**Never instruct me to run an unreviewed migration against my production database.**

---

# 8. Critical Issue E — Repair the Test Plan

## Current concern

The existing test plan creates profile IDs that may not correspond to real `auth.users` records, despite the profile table referencing `auth.users(id)`.

Some tests rely on temporary fixtures, transaction-local role switching, and JWT claim settings that may not behave as assumed in Supabase SQL Editor sessions.

## Required corrections

Redesign the test plan so every test can be executed in a clearly specified environment.

### Test setup

- Create test users through a supported Supabase Auth process or another legitimate controlled test fixture.
- Ensure profile IDs satisfy all foreign keys.
- Ensure test users have the intended roles.
- Use isolated test products, inventory, coupons, orders, and service requests.
- Document whether a test must run in one transaction or session.
- Do not assume temporary tables persist across separate database sessions.
- Do not assume SQL Editor role changes reproduce real authenticated API requests.
- Explain when tests must be executed through the Supabase API with real test-user sessions.
- Ensure cleanup cannot delete production data.

### Test categories

Create executable or precisely specified tests for:

1. Fresh schema installation.
2. Migration from the documented prior schema.
3. Authentication and profile creation.
4. Customer/admin role separation.
5. RLS on every exposed table.
6. Public product access and protected procurement costs.
7. Product MRP and selling-price correctness.
8. Order ownership and access control.
9. Server-trusted prices and order totals.
10. Stock reservation, payment, cancellation, and expiration.
11. Coupon validation and redemption.
12. Razorpay payment verification and duplicate webhook handling.
13. Customer service-request update permissions.
14. Sell Your Item requests and private document access.
15. Storage bucket access and path ownership.
16. Visitor analytics privacy and data retention.
17. Privileged function permissions and secure execution.
18. Migration compatibility and rollback/recovery.
19. Concurrent requests and race conditions.
20. Regression tests for existing IT HUB workflows.

For each test, specify:

- Test ID.
- Purpose.
- Preconditions.
- Test data.
- Execution method.
- SQL or API request where appropriate.
- Expected result.
- Security property being validated.
- Cleanup procedure.

Do not report a test as passed merely because its SQL was generated.

Clearly label each test as one of:

- **Static review only**
- **Executable but not run**
- **Executed successfully**
- **Executed and failed**
- **Requires manual configuration**

Do not fabricate actual execution results.

---

# 9. Critical Issue F — Correct Service-Request Authorization

## Current concern

The customer service-request update policy appears broader than the trigger's protected-field checks.

A customer may potentially update fields that should be controlled by an administrator or trusted workflow, even if certain protected fields are blocked by a trigger.

RLS and triggers must be reviewed together.

## Required workflow definition

Inspect the service-request table, its columns, triggers, functions, grants, and all relevant RLS policies.

Define which fields a customer may change at each state.

Examples of fields that may be customer-controlled, depending on the existing workflow:

- Customer-provided symptoms or problem description.
- Customer-provided contact or scheduling details, if supported.
- Explicit customer approval or rejection of a service quote, through a controlled transition.

Fields that ordinarily require trusted workflow or administrator authority include:

- Customer ownership identifiers.
- Service status.
- Quote amount.
- Technician assignment.
- Internal notes.
- Courier charges and administrative pricing.
- Other internal workflow and payment fields.

Do not assume every field in these examples exists in the current schema. Inspect the actual columns first.

## Required implementation

1. Narrow customer updates to explicitly permitted fields.
2. Enforce permitted state transitions.
3. Ensure customers cannot change ownership to another user's ID.
4. Prevent customers from editing administrative or payment-related fields.
5. Keep administrator actions restricted to authorized administrators or trusted backend operations.
6. Avoid relying only on a trigger when column-level grants, RLS policies, or a controlled database function would provide a clearer boundary.
7. Check whether a customer can change `quote_state`, symptoms, status, or other workflow fields outside the intended sequence.
8. Make the rules consistent across policies, triggers, grants, and frontend expectations.

Add positive and negative tests for each permitted customer action and each prohibited modification.

The goal is to preserve the intended customer workflow without allowing unrestricted modification of service records.

---

# 10. Critical Issue G — Storage Policies and Frontend Upload Paths

## Required buckets

Review the existing policies and maintain the intended separation:

- `product-images`: Public product imagery only, if public access is intended.
- `sell-request-photos`: Private customer-submitted item photographs.
- `customer-invoices`: Private invoices and customer documents.

Use the existing project design as the starting point and document any additional buckets already required by the schema.

## Required security checks

For every bucket, specify:

- Whether reading is public or private.
- Who can upload.
- Who can update.
- Who can delete.
- Who can read existing files.
- Whether an administrator can access files.
- How object paths establish ownership.
- Whether private files use signed URLs.
- How the policies behave for anonymous, authenticated, and administrative requests.

Review the expected private path convention, including whether paths contain a customer ID and the associated request ID.

Compare the policies with the **actual expected React upload path convention**. Do not invent the frontend path. If the React source is not provided, state that the path still needs confirmation and document the convention the frontend must follow.

Do not assume that matching a path prefix alone proves the user is authorized to access the related database record.

## Additional requirements

- Ensure an ordinary customer cannot read another customer's invoice or sell request files.
- Prevent anonymous users from uploading arbitrary content to public product-image storage.
- Ensure administrator privileges are explicitly and correctly checked.
- Review MIME type and file-size restrictions.
- Consider whether allowing SVG uploads is appropriate for publicly served product images. If SVG is unnecessary, disallow it; otherwise, document and implement appropriate sanitization and serving controls.
- Use stable, documented object path conventions.
- Ensure storage policies do not conflict with the relevant RLS functions or grants.
- Do not expose private file URLs unnecessarily.

Add a bucket-by-bucket test matrix covering unauthorized uploads, cross-customer reads, unauthorized deletes, valid administrator access, and signed-URL access.

---

# 11. Additional Security Audit — Review All Related Components

Do not stop after fixing the six critical issues above. Audit the entire attached implementation for related defects.

## A. Row Level Security

- Verify RLS is enabled on every table exposed through the Supabase Data API.
- Inspect `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies individually.
- Verify customer ownership through `auth.uid()` and trusted relationships.
- Ensure admin-only actions cannot be performed by customers.
- Check whether permissive policies unintentionally combine with other policies.
- Review anonymous access separately from authenticated access.
- Verify that grants and policies work together; neither should be treated as a substitute for the other.

## B. Public views and sensitive fields

Inspect views such as `products_public` and `live_offers`.

- Expose only intended public columns.
- Never expose `cost_price`, internal notes, private identifiers, customer records, or administrative data through a public view.
- Avoid broad `SELECT *` projections for public views.
- Review PostgreSQL view security semantics, ownership, and underlying table privileges.
- Verify that the view works for intended anonymous and authenticated roles without unintentionally bypassing required security controls.

## C. Coupon and discount correctness

The intended rule is:

**Each authenticated customer may successfully redeem the same coupon only once. Different customers may each redeem that coupon once, subject to the coupon's global usage limit and validity rules.**

- Enforce uniqueness for `(coupon_id, customer_id)` where applicable.
- Ensure usage is recorded only at the correct successful checkout/payment stage.
- Ensure clients cannot create arbitrary redemption records.
- Validate customer identity from a trusted source.
- Verify coupon ownership, validity dates, minimum order amount, discount limits, applicable products, and global usage limits.
- Make concurrent redemptions safe.
- Ensure a failed or abandoned payment does not permanently consume a coupon unless that is the explicitly defined business rule.
- Handle the case where multiple unpaid orders attempt to use the same coupon before either is paid.
- Ensure an order cannot receive a discount that was not legitimately validated and associated with that order.
- Ensure duplicate payment events cannot count the same redemption more than once.

Review the existing coupon functions, including `validate_coupon()` and `use_coupon()`, as well as any order-creation and payment-finalization functions.

## D. Trusted order totals

Do not trust frontend-submitted:

- Product prices.
- Subtotals.
- Discount amounts.
- Shipping charges.
- Final totals.
- Payment status.
- Inventory quantities.

Calculate or verify all financially meaningful values using trusted database records and server-side logic.

Ensure the same pricing rules are used in product display, checkout, order-item snapshots, coupon validation, payment verification, and order history.

## E. Database functions and privileges

Review every `SECURITY DEFINER` function.

- Use a secure `search_path`.
- Fully qualify sensitive object references where appropriate.
- Restrict `EXECUTE` permissions.
- Ensure ordinary users cannot call administrative or payment-finalization functions.
- Check function ownership and privilege inheritance.
- Avoid trusting caller-supplied user IDs where `auth.uid()` or verified server context should determine identity.
- Verify exact function signatures in `GRANT` and `REVOKE` statements.
- Do not remove required function permissions without checking their legitimate callers.

## F. User profiles and role management

Review profile-creation triggers and role-protection mechanisms.

- Ensure a newly registered user receives the intended default customer role.
- Prevent customers from elevating their own roles.
- Restrict administrator role changes to an appropriately trusted process.
- Do not allow client-submitted user metadata alone to determine privileged roles.
- Ensure profile creation errors are observable rather than silently hidden without logging.
- Preserve legitimate account creation and login workflows.

## G. Visitor analytics and privacy

Review the visitor logging implementation, including `log_visitor_event()`, the `mask_ip` setting, and retention functions.

- Check whether IP masking is actually applied when enabled.
- Do not accept arbitrary client-supplied IP, city, country, region, or ISP information as verified facts.
- Use a trusted server-side source for IP extraction and optional geolocation enrichment.
- Account for reverse proxies and trusted forwarded headers correctly.
- Do not claim to identify a person's real identity or exact location from an IP address.
- Explain that VPNs, proxies, mobile networks, and inaccurate IP geolocation can produce approximate or misleading locations.
- Minimize collection and retention of personal data.
- Document the retention policy and verify that the scheduled purge mechanism actually exists.
- Prevent customers from reading visitor-level data or administrative audit logs unless explicitly authorized.

## H. Service, inventory, and order state consistency

Review status transitions, cancellation, refund handling, and inventory updates together.

Ensure there are no conflicting transitions, double deductions, double restorations, or ways for a customer to alter a trusted financial or operational status.

## I. Performance and maintainability

Review indexes, foreign keys, check constraints, query patterns, and function complexity.

Recommend indexes where they are justified by real query or policy patterns. Avoid creating large numbers of speculative indexes.

Do not make performance changes that weaken security or silently alter business logic.

---

# 12. Required Output Files

Produce the following five corrected files.

## File 1 — `schema.sql`

A complete, ordered fresh-install schema for the documented Supabase environment.

It must include the corrected product pricing model, tables, constraints, indexes, functions, triggers, views, privileges, and RLS policies.

It must not depend on undocumented manual database objects.

## File 2 — `migration.sql`

A separate migration for the explicitly documented existing schema version.

It must safely introduce the required changes, including MRP and relevant security corrections, without accidental data loss or destructive dependency removal.

Do not present this migration as universally compatible with unknown database states.

## File 3 — `storage-policies.sql`

Corrected Storage configuration and policies with clear public/private behavior, customer ownership checks, administrator permissions, and documented object path conventions.

Separate bucket creation from policy changes where the Supabase deployment workflow requires it.

## File 4 — `security-review.md`

A truthful security review that includes:

- Issues discovered.
- Severity and impact.
- Exact affected database objects or functions.
- Corrections implemented.
- Remaining risks.
- Required Edge Function/backend work.
- Manual configuration requirements.
- Verification evidence.
- Known limitations.
- A final status that accurately reflects the actual work performed.

Do not mark an issue as resolved merely because a code change was generated. Identify the test or evidence needed to verify the fix.

## File 5 — `test-plan.md`

A corrected, reproducible test plan with setup instructions, valid fixtures, expected outcomes, cleanup steps, and explicit execution status.

Include the critical tests described in this prompt and tests for the other security controls reviewed.

---

# 13. Implementation and Consistency Requirements

Before finalizing the files, cross-check all of them against one another.

At minimum, verify:

1. Every table and column referenced by a function exists.
2. Every function call uses the correct signature.
3. Every trigger references a valid function and table.
4. Every policy references existing tables, columns, and helper functions.
5. Every public view exposes only intended fields.
6. The MRP field exists in both the fresh schema and existing-database migration.
7. The product pricing logic is consistent across views, order creation, discounts, and payment validation.
8. The migration does not assume that a missing core table exists.
9. The migration does not accidentally remove required dependent objects through `CASCADE`.
10. The test fixtures respect foreign keys and actual authentication relationships.
11. Customer update policies match the actual service-request workflow.
12. Storage policies use a documented path convention and correct ownership checks.
13. Coupon redemption is concurrency-safe and follows the one-redemption-per-customer rule.
14. Order cancellation and stock restoration are idempotent.
15. Payment finalization is restricted to a trusted, verified payment workflow.
16. No secret keys or service-role credentials are required in browser code.
17. Every exposed table has been checked for the intended RLS and privilege configuration.
18. No existing IT HUB feature has been removed without explanation.
19. Any required scheduled task, webhook, Edge Function, or environment variable is explicitly identified.
20. The security review and test plan accurately describe the final SQL.

Use the PostgreSQL/Supabase syntax appropriate to the target environment. Where possible, validate syntax and behavior using a disposable development project, local Supabase environment, or a compatible PostgreSQL test environment.

If runtime validation is unavailable, do not fabricate it. Report the limitation.

---

# 14. Execution Plan

Work in this order:

**Phase 1 — Inspect**

Read all five files and build an inventory of the actual tables, views, functions, triggers, policies, grants, and storage rules.

**Phase 2 — Identify defects**

Create a traceable issue list that maps every discovered problem to its exact file and database object.

**Phase 3 — Correct the implementation**

Fix the schema, migration, storage policies, and related logic.

**Phase 4 — Validate cross-file consistency**

Check that the five outputs agree on function signatures, columns, policies, state transitions, pricing rules, and storage paths.

**Phase 5 — Validate tests**

Repair invalid fixtures and ambiguous test procedures. Execute tests only where a real suitable environment is available.

**Phase 6 — Produce final artifacts**

Generate the five corrected files and provide a concise execution guide.

Do not skip directly from reading the security review to rewriting its conclusions. Inspect the actual SQL and derive the conclusions from the implementation.

---

# 15. Final Response Format

When finished, provide:

### A. Summary of changes

List the most important corrections and why they were necessary.

### B. Deliverable files

Provide each of the five files separately with its filename and purpose.

### C. Critical security status

Use one of these labels for each issue:

- Fixed in code — not runtime-verified
- Fixed and runtime-tested
- Partially fixed
- Not fixed
- Requires external configuration
- Requires application/frontend integration

### D. Database installation instructions

Explain the correct sequence for a fresh installation and the separate procedure for an existing database.

Clearly warn against running both scripts indiscriminately or applying an unreviewed migration to production.

### E. Supabase configuration

List required configuration for:

- Authentication.
- Storage buckets and policies.
- Edge Functions or trusted backend.
- Razorpay checkout and webhook secrets.
- Scheduled order-expiration cleanup.
- Any required analytics-retention job.

Use placeholders for secret values.

### F. Frontend integration checklist

Identify any frontend changes needed for:

- MRP and selling-price display.
- Trusted checkout totals.
- Payment verification.
- Service-request update permissions.
- Storage upload paths.
- Private invoice and document access.

Do not claim that the frontend already follows these conventions unless the actual frontend source has been inspected.

### G. Remaining blockers

List anything that prevents a reliable production deployment, including tests that have not been executed.

## Final instruction

Prioritize correctness, security, business-rule preservation, and verifiability over making the output look complete.

**Do not merely generate a better-looking security report. Correct the implementation, demonstrate what can be verified, identify what remains unverified, and never claim production readiness without evidence.**
