# IT HUB — Hosted Rebuild Runbook

Everything needed to build a new Supabase project from this repository. **Nothing here has been run against any hosted project.** Each step needs the owner's approval when the time comes. This file holds names only, never values.

## 1. Order of work

| #   | Step                                                | Command or place                                                     | Check                                   |
| --- | --------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| 1   | Create the project, in the region you want          | Supabase Dashboard                                                   | Note the project ref                    |
| 2   | Link and push the schema                            | `npx supabase link --project-ref <ref>`, then `npx supabase db push` | All 44 migrations listed as applied     |
| 3   | Load reference data                                 | Run `supabase/seed-reference.sql` once with `psql`                   | Store settings and categories exist     |
| 4   | Set Auth configuration                              | Section 4                                                            | Sign-up and redirects behave as planned |
| 5   | Set Edge Function secrets                           | Section 5                                                            | `npx supabase secrets list` shows names |
| 6   | Deploy Edge Functions                               | `npx supabase functions deploy`                                      | `health` responds                       |
| 7   | Create the first administrator                      | Section 3                                                            | Portal sign-in works                    |
| 8   | Point Shopify and Razorpay webhooks at the new URLs | Their dashboards                                                     | A test delivery returns 200             |
| 9   | Build and deploy the storefront and portal          | Section 6                                                            | Smoke test                              |
| 10  | Run the hosted checks                               | Q16 from `docs/PHASE_3_HOSTED_REBUILD_READINESS.md`                  | Matches the replay                      |

**Never paste SQL files into the Dashboard's SQL Editor to change the schema.** That is how the old project drifted from the code. Migrations are the only source of the schema. `schema.sql`, `migration.sql` and `storage-policies.sql` have been retired, and `npm run verify:migrations` fails if they come back.

## 2. Reference data

| File                          | Contains                                                                                                                  | Use on                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `supabase/seed-reference.sql` | Store settings, analytics settings, categories, brands, support categories, locations, service PIN codes, build templates | **Production**, once. Safe to repeat |
| `supabase/seed.sql`           | All of the above, plus sample products                                                                                    | **Local and test only**              |

Partner certificates, showroom photos and storage buckets come from the migrations. Products come from Shopify.

**Check before running:** the store's address, phone and email in `seed-reference.sql`, and the sample build templates.

## 3. First administrator

`bootstrap_first_admin` can only be run by the server, and it refuses as soon as any administrator exists.

1. Sign up through the storefront with the address you'll administer from, and **confirm it**.
2. In `psql`, connected to the new project, find the account's id, without exposing anything else:
   ```sql
   select id from auth.users where email = '<your address>';
   ```
3. Promote it:
   ```sql
   select public.bootstrap_first_admin('<the id>');
   ```
4. Sign in to the Staff Portal. Add other staff there; don't repeat this step.

**Role model:** `get_current_staff_role()` is the single resolver. A profile with `role = 'admin'` and an active `staff_members` row with `role = 'portal_admin'` both mean administrator.

## 4. Authentication plan

| Setting                    | Plan                                                                                               | Why                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Email provider             | **On, with public registration refused by the hook below**                                         | Staff sign in by email. Turning it off locks them out, because this setting also stops email sign-in |
| Confirm email              | **On**                                                                                             | The local development stack has it off                                                               |
| Minimum password length    | 10 or more                                                                                         | The local default is 6                                                                               |
| Leaked password protection | On, if your plan offers it                                                                         |                                                                                                      |
| Site URL, redirect URLs    | The real storefront and portal URLs only                                                           | Remove localhost                                                                                     |
| Phone provider             | **Off until an SMS provider and DLT registration are ready**, then on                              | Customers sign in only this way. See "Phone sign-in" below                                           |
| Send SMS hook              | With the phone provider. Point it at `send-sms-hook`, and set its secret as `SEND_SMS_HOOK_SECRET` | The hook verifies Auth's signature                                                                   |
| Session lifetime           | Keep the default 1 hour for access tokens                                                          |                                                                                                      |
| MFA for administrators     | Enable before adding real staff                                                                    | Not enforced in code yet                                                                             |
| Rate limits, CAPTCHA       | Review once live traffic is known                                                                  |                                                                                                      |

### Phone sign-in

Customers register and sign in only with a mobile number and an OTP. Supabase generates and checks every code. `send-sms-hook` only delivers it, and with no complete provider configuration it sends nothing, so sign-in shows as unavailable.

**1. DLT registration (India), done by IT HUB as the Principal Entity:**

1. Register the business on an operator's DLT portal (Jio, Airtel, Vi or BSNL). The registration is accepted across operators.
2. Register a 6-character header (sender ID).
3. Register a content template in the **Service Implicit** category, with the code as `{#var#}`. For example: `{#var#} is your IT HUB login code. It expires in 5 minutes. Do not share it with anyone.` Keep the wording of the expiry in line with the OTP expiry below.
4. Bind the SMS provider as your Telemarketer on the portal (the PE-TM chain).
5. Note your Entity ID, the header and the Template ID, and enter them in the provider's panel as it requires.

Confirm the current rules and fees on the operator's portal. The figures available when this was written came from vendors, not TRAI.

**2. Edge Function secrets for `send-sms-hook`, for one provider only:**

| Secret                 | Value                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| `SEND_SMS_HOOK_SECRET` | The `v1,whsec_...` secret that Supabase shows for the hook                 |
| `SMS_PROVIDER`         | `msg91` or `fast2sms`. Nothing is sent if it's unset                       |
| `MSG91_AUTH_KEY`       | MSG91 only                                                                 |
| `MSG91_TEMPLATE_ID`    | MSG91 only: the template ID from MSG91's SMS > Template section. See below |
| `FAST2SMS_API_KEY`     | Fast2SMS only                                                              |
| `FAST2SMS_SENDER_ID`   | Fast2SMS only: the DLT header                                              |
| `FAST2SMS_TEMPLATE_ID` | Fast2SMS only: the DLT Template ID as Fast2SMS lists it                    |

MSG91 setup, in its panel:

1. Add the DLT Template ID, the header and the Entity ID where MSG91 asks for them. Error 211 means a missing or wrong template ID, and error 203 means a missing Entity ID or an unapproved header.
2. Under SMS > Template, create the template. Use the DLT wording exactly, with `##OTP##` where DLT has `{#var#}`. The variable name is case-sensitive.
3. Choose your approved header as the template's sender, not "From API". `send-sms-hook` doesn't send a sender.
4. Don't use the Send OTP section for this. Its API keeps and checks its own code, and here Supabase does that.

The hook allows itself one retry, because Auth gives the whole call 5 seconds. A failed send shows the customer that sign-in is unavailable.

**3. Auth settings:**

| Setting                             | Value                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Allow new users to sign up          | On. Phone registration needs it. Registering by email is refused by the next row                  |
| Before User Created hook            | Postgres function `public.hook_before_user_created`. **Without it, anyone can register by email** |
| Phone provider, phone confirmations | On                                                                                                |
| Send SMS hook                       | HTTPS, `https://<project-ref>.functions.supabase.co/send-sms-hook`                                |
| SMS OTP expiry                      | 300 seconds, or whatever the DLT template says                                                    |
| SMS OTP length                      | 6                                                                                                 |
| SMS max frequency                   | 60 seconds. The sign-in screen's resend timer assumes this                                        |
| Rate limit for SMS sent             | Set from expected volume. It's a limit on sending, so too low blocks real customers               |
| Rate limit for token verifications  | Keep the default or lower. It limits guessing of codes                                            |
| CAPTCHA                             | Enable before launch. SMS costs money, and the endpoint is public                                 |

**4. Before opening to customers,** on a throwaway hosted project and with real phones: register a new number, sign in again, try a wrong code and a code past its expiry, and confirm delivery on Jio, Airtel, Vi and BSNL. The provider API calls in `send-sms-hook` have never reached a real provider. Check them against the provider's current API documentation first.

### Staff roles

| Area                                                                         | Portal administrator | Service staff | Quotation staff |
| ---------------------------------------------------------------------------- | -------------------- | ------------- | --------------- |
| Staff management, settings, website content, certificates, visitor analytics | Yes                  | No            | No              |
| Service tickets, appointments, on-site audits, review moderation             | Yes                  | Yes           | No              |
| Customers' Shopify orders, read-only                                         | Yes                  | Yes           | No              |
| PC builds and quotations                                                     | Yes                  | No            | Yes             |
| Sell requests, including staff notes                                         | Yes                  | Yes           | Yes             |

The database enforces these. The portal's menus and route guards show the same answers.

### Website orders

Only customers who sign in and buy through the website are tracked.

1. Checkout asks the server for a single-use token. `create_checkout_association` issues it to whoever the session's verified JWT says, and takes no other input. No valid session or no token means checkout doesn't start.
2. The token travels through the Shopify checkout as the `_hub_assoc_token` cart attribute.
3. The signed Shopify webhook redeems it and links the order to that customer. It's the only way an order reaches an account.

**Orders with no valid token aren't website orders.** In-store sales, WhatsApp, manual and historical orders are acknowledged and not linked, and nothing about them is stored. There's no recovery, claiming or matching on email or phone, by design.

**Check on the hosted rehearsal:** that a real Shopify order carries the cart attribute in `note_attributes`, and that checkout really can't be reached from the website without signing in.

## 5. Edge Function secrets

Set with `npx supabase secrets set NAME=value`. **Never put a value in a tracked file.** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are provided by the platform.

| Function                         | Needs                                                                                                   | JWT check at the gateway           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `create-service-razorpay-order`  | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `STOREFRONT_ORIGIN`, `APP_ENV`                                | On                                 |
| `verify-service-payment`         | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `STOREFRONT_ORIGIN`, `APP_ENV`                                | On                                 |
| `verify-checkout-callback`       | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_REQUEST_TIMEOUT_MS`, `STOREFRONT_ORIGIN`, `APP_ENV` | On                                 |
| `create-razorpay-order` (legacy) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`                                                                | On                                 |
| `verify-razorpay-webhook`        | `RAZORPAY_WEBHOOK_SECRET`                                                                               | **Off**; signature checked in code |
| `shopify-webhook`                | `SHOPIFY_WEBHOOK_SECRET`                                                                                | **Off**; signature checked in code |
| `send-sms-hook`                  | See "Phone sign-in"                                                                                     |
| `verify-and-submit-pc-quotation` | `VITE_SHOPIFY_STORE_DOMAIN`, `VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `VITE_SHOPIFY_API_VERSION`         | On                                 |
| `customer-shopify-orders`        | None beyond the platform's                                                                              | On                                 |
| `search-product-images`          | `SERPAPI_API_KEY`                                                                                       | On                                 |
| `health`                         | None beyond the platform's                                                                              | On; the anon key is enough         |

**Removed:** `SHOPIFY_ADMIN_API_ACCESS_TOKEN` is no longer read anywhere, so don't create that token unless a new feature needs it. `VITE_SHOPIFY_WEBHOOK_SECRET` is gone, because a `VITE_` name marks a value for the browser bundle.

## 6. Build variables

Template: `docs/production.env.example`.

| Build        | Names                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storefront   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SHOPIFY_STORE_DOMAIN`, `VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `VITE_SHOPIFY_API_VERSION`, `VITE_RAZORPAY_KEY_ID` |
| Staff Portal | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`                                                                                                                          |

Everything named `VITE_` ends up in the public bundle. **Only public values belong there:** the anon key, the Storefront token and the Razorpay key id. Never the service-role key, a Razorpay secret or a webhook secret.

## 7. Realtime publication allowlist

`supabase_realtime` holds exactly these tables, and `p0-8-realtime.test.ts` fails if that changes.

| Table                                                                                | Who receives events                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service_requests`                                                                   | Owner, service staff, administrators. **Never** `notes`, `guest_tracking_token`, `razorpay_order_id`, `razorpay_payment_id`, `payment_collected_by` or `decision_actor` |
| `customer_notifications`                                                             | The customer it's for                                                                                                                                                   |
| `customer_audits`, `customer_audit_history`                                          | Service staff, administrators                                                                                                                                           |
| `announcements`, `partner_certificates`, `promotional_campaigns`, `website_showcase` | Everyone once published; administrators always                                                                                                                          |
| `store_settings`, `it_hub_locations`, `inventory`                                    | Everyone                                                                                                                                                                |

Column filtering relies on column privileges, which Realtime honours. A publication column list can't be used on `service_requests`, because it has `REPLICA IDENTITY FULL`.

## 8. Function grants allowlist

Defined in `20261102000005_security_function_grants.sql`, and checked by `function-grants.test.ts`. New functions get no API grant until a migration adds one. **Add a function to both places or the test fails.**

## 9. Storage

| Bucket                | Public | Limit        | Who can write                                                        |
| --------------------- | ------ | ------------ | -------------------------------------------------------------------- |
| `product-images`      | Yes    | 5 MB, no SVG | Administrators                                                       |
| `promotional-banners` | Yes    | 5 MB, no SVG | Administrators                                                       |
| `sell-request-photos` | No     | 10 MB        | The customer, into their own folder, for a Pending request           |
| `customer-invoices`   | No     | 10 MB        | The customer, into their own folder, for a Pending or Booked request |

Private files are served with short-lived signed URLs. Store the object path in the database, never a URL.

## 10. Hosted differences to rehearse

These can't be proven on a local stack. Rehearse them on a throwaway hosted project first.

- `db push` runs as a role with fewer rights than local. Creating policies on `storage.objects` and setting default privileges must succeed.
- Auth's hooks on hosted Supabase. They've been tested with a real local Auth server (v2.197.0) and a stand-in SMS provider, and never with a real provider or a real phone.
- Webhook deliveries from real Shopify and Razorpay test mode.
- Realtime behaviour under the hosted connection settings.
