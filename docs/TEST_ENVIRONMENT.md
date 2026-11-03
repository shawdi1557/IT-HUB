# IT HUB — Disposable Test Environment

Database tests run only on a separate, throwaway Supabase stack. They can't reach the development database, the hosted project, Shopify or Razorpay.

**Prerequisites:** Docker running, the Supabase CLI and Deno installed. Nothing else is needed.

## Commands

| Command                       | What it does                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run test:env:up`         | Creates the stack from an empty database, replays all migrations, marks it disposable and loads fixtures. About a minute |
| `npm run test:env:status`     | Re-verifies the environment's identity                                                                                   |
| `npm run test:env:safety`     | Proves the network limits, then attacks the guard with hostile settings                                                  |
| `npm test`                    | All tests, with **no network**. Database tests are ignored                                                               |
| `npm run test:db`             | The existing database suites, on the verified disposable stack                                                           |
| `npm run test:regression`     | Authorization matrix, Realtime, Edge Function, storage, grant and P0 regression tests                                    |
| `npm run test:env:migrate`    | Applies new migrations to the verified disposable stack with the real Supabase CLI                                       |
| `npm run test:env:reset-data` | Returns the disposable data to a fresh build, keeping the stack and its identity                                         |
| `npm run test:env:replay`     | Builds all migrations in a scratch database and compares the result with the live disposable schema                      |
| `npm run test:env:down`       | Destroys the stack and its data. It can only target the disposable project                                               |

**Typical session**

```powershell
npm run test:env:up
npm run test:env:safety
npm run test:db
npm run test:regression
npm run test:env:down
```

Tests leave rows behind and aren't repeatable on the same data, so run `npm run test:env:reset-data` between suites. Recreating the stack (`down`, then `up`) also works, and is the strongest proof of a clean build.

`test:security`, `test:portal`, `test:builder`, `test:shopify` and `test:edge` also run with no network.

## Never do this

- **Don't run `supabase db reset` in the repo root.** It targets the development database, which holds the two recovered order rows. The test tooling never uses this command.
- **Don't run `supabase stop --all`.** It stops every stack on the machine.
- **Don't deploy a build made from your local `.env`.** It contains local settings.

## How the two stacks are separated

|                              | Development (protected)                   | Disposable                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project ID                   | `ITHUB_WEB`                               | `ITHUB_TEST_DISPOSABLE`                                                                                                                                                                                                                                   |
| API port                     | 54321                                     | **55421**                                                                                                                                                                                                                                                 |
| Postgres port                | 54322                                     | **55422**                                                                                                                                                                                                                                                 |
| Shadow DB port               | 54320                                     | 55420                                                                                                                                                                                                                                                     |
| Docker volumes and network   | `*_ITHUB_WEB`                             | `*_ITHUB_TEST_DISPOSABLE`                                                                                                                                                                                                                                 |
| JWT secret                   | Public local default                      | Random, per environment                                                                                                                                                                                                                                   |
| Linked to the hosted project | Has a link file                           | **No link files exist**                                                                                                                                                                                                                                   |
| Data                         | Your data, including the recovered orders | Synthetic only                                                                                                                                                                                                                                            |
| Services                     | Full stack                                | Database, API, Auth, Storage, Realtime only                                                                                                                                                                                                               |
| Real email or SMS            | Not relevant here                         | **No SMTP server or SMS provider. `scripts/test-env/sms-sink.ts` runs the real hook and captures the provider call. Its only network permission is its own loopback port. The Twilio values in the template are invented, and only satisfy a CLI check.** |

The working files live in `.test-env/`, which is git-ignored and rebuilt on every `up`. The tracked source is `test-env/config.template.toml`.

## Safety layers

Any one of these stops a run.

| #   | Layer                         | Where                       | What it stops                                                                                                                       |
| --- | ----------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Deno network allowlist**    | `scripts/test-env/run.cjs`  | Only `127.0.0.1:55421` and `55422` are reachable. Everything else fails inside the runtime, before a packet is sent                 |
| 2   | **No writes or subprocesses** | `scripts/test-env/run.cjs`  | Tests can't write files or start `docker` or `supabase`                                                                             |
| 3   | **Clean environment**         | `cleanEnv()` in `lib.cjs`   | Removes inherited `SUPABASE_*`, `VITE_*`, `RAZORPAY_*` and `SHOPIFY_*` variables                                                    |
| 4   | **Host and port check**       | `assertSafeTargetUrl`       | Refuses protected ports and non-loopback hosts **before connecting**                                                                |
| 5   | **Permission self-check**     | `assertNetworkIsRestricted` | Refuses any run that could reach forbidden targets, which catches `deno test -A`                                                    |
| 6   | **Positive identity**         | `verifyMarker`              | A random ID in the database must match the identity file, through both the API and Postgres. The development database has no marker |
| 7   | **Default off**               | `dbTest`                    | Without the runner's settings, database tests are ignored and their connection details point nowhere                                |
| 8   | **Separate JWT secret**       | `up.cjs`                    | Tokens for one stack are rejected by the other                                                                                      |
| 9   | **Before and after proof**    | `assertProtectedUnchanged`  | Fingerprints the recovered rows, row counts and write counters, and fails loudly if any changed                                     |
| 10  | **Static checks**             | `test-env-safety.test.ts`   | Fails if a test hardcodes the development Postgres port, or a command bypasses the runner or widens permissions                     |

**If layer 9 reports a change:** the write counter also moves when you use the local app. If you were using it during the run, that may be the cause. Check the recovered-order fingerprint in the message.

## Writing a new database test

```ts
import { dbTest, TEST_SUPABASE_URL, TEST_SERVICE_KEY } from "./_helpers/disposable_env.ts";

dbTest("MY-1: does something real", async () => {
  // Runs only after the target is verified as disposable.
});
```

Don't hardcode ports or keys, and have each test create its own users, as `test-env/regression/_fixtures.ts` does.

## Regression tests

They live in `test-env/regression/`. All of them pass after the Phase 4 fixes, and each `CONTROL` test proves the harness works.

**Keep this folder uncommitted until the fixes are live on the new project.** The tests show how each weakness worked, and the old project still has them.

## Safe strategy for the blocked tests

| Group           | Count | Approach                                                                                                         |
| --------------- | ----: | ---------------------------------------------------------------------------------------------------------------- |
| Database tests  |    79 | Run with `npm run test:db`. All pass after Phase 4                                                               |
| Live Shopify    |     1 | `LAT-API-10` is always ignored, because it calls the real store. Replace it with a mock or get separate approval |
| Dead-port test  |     1 | `E2E-ORD-13` now uses a port nothing listens on, so it stays in the no-network suite                             |
| External lookup |     1 | On-site coverage test 9 calls a public geocoding service. It fails safely with no network; mock it later         |

### Earlier failures and false passes, resolved in Phase 4

| Test                                        | Was                                            | Resolution                                                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESCHED-APPROVAL-2`, `RESCHED-REJECTION-1` | Called staff functions as the service role     | Use a real staff session. The service role is now refused, because it has no person to name in the audit row                                                                                                                     |
| `INTG-1`, `INTG-4`                          | Migrations published the Intel certificate     | A migration now unpublishes it, matching the tests and your local data                                                                                                                                                           |
| `SYNC-12`                                   | Failed intermittently; cause never established | Failed in the Phase 4 baseline run and has passed in every run since the fixes. **The cause is still not established**, so treat a future failure as worth investigating. The new `p0-8-realtime` suite covers Realtime properly |
| `REV-2`, `SELL-5`, `SELL-6`                 | Exited early with no data, so proved nothing   | Create their own data and use real staff sessions                                                                                                                                                                                |
| `ASSOC-1`, `DB-SHOPIFY-2`                   | Inserted rows instead of calling the function  | Call the real function as a real customer                                                                                                                                                                                        |
| `LOGIN-LOOP-3`                              | Asserted the phone-login flaw as correct       | Now asserts a browser-chosen code gets nowhere                                                                                                                                                                                   |

## CI impact

CI calls the same `npm run test:*` commands, so database tests now show as **ignored** instead of failing for lack of a database. That means a green CI run says nothing about them. Adding this stack to CI is future work.

## Database test inventory

Measured in Phase 1, so the **Result** column below is historical; see above for the current state. Every test that touches a database or live service. "Writes" combines API requests observed during a real run with SQL statements read from each test's source. A test can write more if its data differs, so **treat this as a minimum**. Never run any of these against a database you care about.

| Measure                                                  |       Count |
| -------------------------------------------------------- | ----------: |
| Tests                                                    |          80 |
| Write to the database or auth                            |          52 |
| Can update or delete existing rows                       |          45 |
| Touch order tables                                       |          15 |
| **Delete from order tables**                             |      **13** |
| No write observed                                        |          28 |
| Connect through the API / direct Postgres / live service | 63 / 16 / 1 |

**This corrects the earlier audit,** which counted 72 tests, of which 45 might write. The network tracer found 8 more database tests that had been hiding their failed connections, and observing real runs gave firmer write counts.

### `customer-shopify-orders`

| Test      | Connects by | Writes                                                       | Order tables | Result |
| --------- | ----------- | ------------------------------------------------------------ | -----------: | ------ |
| ORD-API-2 | API         | DELETE shopify_customer_orders, POST shopify_customer_orders |      **Yes** | PASS   |
| ORD-API-3 | API         | DELETE shopify_customer_orders, POST shopify_customer_orders |      **Yes** | PASS   |
| ORD-API-4 | API         | DELETE shopify_customer_orders, POST shopify_customer_orders |      **Yes** | PASS   |
| ORD-API-5 | API         | DELETE shopify_customer_orders, POST shopify_customer_orders |      **Yes** | PASS   |

### `hero-reschedule-analytics`

| Test                | Connects by | Writes                                                                                                                                                                                | Order tables | Result |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------: | ------ |
| RESCHED-APPROVAL-2  | API         | DELETE service_appointment_reschedule_requests, DELETE service_requests, POST service_appointment_reschedule_requests, POST service_requests, RPC staff_decide_appointment_reschedule |           No | FAIL   |
| RESCHED-REJECTION-1 | API         | DELETE service_appointment_reschedule_requests, DELETE service_requests, POST service_appointment_reschedule_requests, POST service_requests, RPC staff_decide_appointment_reschedule |           No | FAIL   |
| ANALYTICS-DB-1      | API         | None observed                                                                                                                                                                         |           No | PASS   |
| ANALYTICS-DB-2      | API         | DELETE visitor_events, DELETE visitor_sessions, RPC log_visitor_event                                                                                                                 |           No | PASS   |

### `pc-builder-login-loop`

| Test         | Connects by | Writes                                                                             | Order tables | Result |
| ------------ | ----------- | ---------------------------------------------------------------------------------- | -----------: | ------ |
| LOGIN-LOOP-3 | API         | PATCH profiles, auth user create                                                   |           No | PASS   |
| LOGIN-LOOP-4 | API         | POST pc_builds, RPC check_distributed_rate_limit                                   |           No | PASS   |
| LOGIN-LOOP-6 | API         | PATCH profiles, auth user create                                                   |           No | PASS   |
| LOGIN-LOOP-7 | API         | PATCH profiles, POST pc_builds, RPC check_distributed_rate_limit, auth user create |           No | PASS   |

### `promotional-campaigns-and-hero-carousel`

| Test         | Connects by | Writes                                                                                                                                | Order tables | Result |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | -----------: | ------ |
| CAMP-DB-1    | API         | None observed                                                                                                                         |           No | PASS   |
| CAMP-DB-2    | API         | POST promotional_campaigns                                                                                                            |           No | PASS   |
| CAMP-DB-3    | API         | DELETE promotional_campaigns, POST promotional_campaigns                                                                              |           No | PASS   |
| CAMP-DB-4    | API         | None observed                                                                                                                         |           No | PASS   |
| CAMP-DB-5    | API         | DELETE staff_audit_logs, POST staff_audit_logs                                                                                        |           No | PASS   |
| CAMP-SYNC-1  | API         | DELETE promotional_campaigns, POST promotional_campaigns                                                                              |           No | PASS   |
| CAMP-STAFF-2 | API         | DELETE promotional_campaigns, DELETE staff_audit_logs, PATCH promotional_campaigns, POST promotional_campaigns, POST staff_audit_logs |           No | PASS   |

### `realtime-content-sync`

| Test   | Connects by | Writes                                                                             | Order tables | Result |
| ------ | ----------- | ---------------------------------------------------------------------------------- | -----------: | ------ |
| SYNC-1 | Postgres    | None observed                                                                      |           No | PASS   |
| SYNC-2 | Postgres    | None observed                                                                      |           No | PASS   |
| SYNC-3 | API         | DELETE partner_certificates, PATCH partner_certificates, POST partner_certificates |           No | PASS   |
| SYNC-4 | API         | DELETE website_showcase, PATCH website_showcase, POST website_showcase             |           No | PASS   |
| SYNC-5 | API         | DELETE announcements, POST announcements                                           |           No | PASS   |
| SYNC-6 | API         | PATCH store_settings                                                               |           No | PASS   |
| SYNC-7 | Postgres    | None observed                                                                      |           No | PASS   |

### `service-appointment-rescheduling-workflow`

| Test      | Connects by | Writes                                      | Order tables | Result |
| --------- | ----------- | ------------------------------------------- | -----------: | ------ |
| RESCHED-7 | API         | RPC customer_request_appointment_reschedule |           No | PASS   |

### `service-problem-validation`

| Test    | Connects by | Writes                                                   | Order tables | Result |
| ------- | ----------- | -------------------------------------------------------- | -----------: | ------ |
| PROB-10 | Postgres    | SQL INSERT service_requests                              |           No | PASS   |
| PROB-11 | Postgres    | SQL INSERT service_requests                              |           No | PASS   |
| PROB-12 | Postgres    | SQL DELETE service_requests, SQL INSERT service_requests |           No | PASS   |

### `service-realtime-sync`

| Test    | Connects by | Writes                                                                                                | Order tables | Result |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------- | -----------: | ------ |
| SYNC-1  | Postgres    | None observed                                                                                         |           No | PASS   |
| SYNC-2  | Postgres    | None observed                                                                                         |           No | PASS   |
| SYNC-3  | Postgres    | None observed                                                                                         |           No | PASS   |
| SYNC-4  | API         | DELETE customer_notifications, DELETE service_requests, PATCH service_requests, POST service_requests |           No | PASS   |
| SYNC-5  | API         | DELETE service_requests, POST service_requests, RPC get_service_request_tracking                      |           No | PASS   |
| SYNC-8  | API         | DELETE service_requests, POST service_requests                                                        |           No | PASS   |
| SYNC-9  | API         | DELETE customer_notifications, DELETE service_requests, PATCH service_requests, POST service_requests |           No | PASS   |
| SYNC-10 | API         | DELETE customer_notifications, DELETE service_requests, PATCH service_requests, POST service_requests |           No | PASS   |
| SYNC-11 | API         | DELETE customer_notifications, DELETE service_requests, PATCH service_requests, POST service_requests |           No | PASS   |
| SYNC-12 | API         | PATCH service_requests, POST service_requests                                                         |           No | FAIL   |

### `service-tracker-quality-check-statusmark`

| Test                            | Connects by | Writes                                                                                | Order tables | Result |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------- | -----------: | ------ |
| Database schema                 | Postgres    | None observed                                                                         |           No | PASS   |
| Database constraint             | Postgres    | None observed                                                                         |           No | PASS   |
| RPC                             | Postgres    | SQL DELETE service_requests, SQL INSERT service_requests, SQL UPDATE service_requests |           No | PASS   |
| RPC                             | Postgres    | SQL DELETE service_requests, SQL INSERT service_requests                              |           No | PASS   |
| RPC                             | Postgres    | SQL DELETE service_requests, SQL INSERT service_requests                              |           No | PASS   |
| Service booking                 | Postgres    | SQL DELETE service_requests, SQL INSERT service_requests                              |           No | PASS   |
| Quotation Payment State Machine | Postgres    | SQL DELETE service_requests, SQL INSERT service_requests, SQL UPDATE service_requests |           No | PASS   |

### `shopify-client-association`

| Test    | Connects by | Writes                                                             | Order tables | Result |
| ------- | ----------- | ------------------------------------------------------------------ | -----------: | ------ |
| ASSOC-1 | API         | DELETE shopify_order_associations, POST shopify_order_associations |      **Yes** | PASS   |

### `shopify-customer-orders-db`

| Test         | Connects by | Writes                                                                                          | Order tables | Result |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------- | -----------: | ------ |
| DB-SHOPIFY-1 | API         | None observed                                                                                   |      **Yes** | PASS   |
| DB-SHOPIFY-2 | API         | POST shopify_order_associations, RPC validate_and_consume_association_token                     |      **Yes** | PASS   |
| DB-SHOPIFY-3 | API         | DELETE shopify_customer_orders, DELETE shopify_order_associations, POST shopify_customer_orders |      **Yes** | PASS   |

### `shopify-customer-orders-e2e`

| Test          | Connects by | Writes                                                                                                                                    | Order tables | Result |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -----------: | ------ |
| E2E-ORD-1     | API         | DELETE shopify_customer_orders                                                                                                            |      **Yes** | PASS   |
| E2E-ORD-2     | API         | DELETE shopify_customer_orders, POST shopify_customer_orders                                                                              |      **Yes** | PASS   |
| E2E-ORD-3-4-5 | API         | DELETE shopify_customer_orders, POST shopify_customer_orders                                                                              |      **Yes** | PASS   |
| E2E-ORD-9-10  | API         | DELETE shopify_customer_orders, POST shopify_customer_orders, POST shopify_order_associations, RPC validate_and_consume_association_token |      **Yes** | PASS   |
| E2E-ORD-11    | API         | DELETE shopify_customer_orders, POST shopify_customer_orders                                                                              |      **Yes** | PASS   |
| E2E-ORD-14-15 | API         | None observed                                                                                                                             |           No | PASS   |

### `shopify-inventory-latency`

| Test       | Connects by                   | Writes        | Order tables | Result  |
| ---------- | ----------------------------- | ------------- | -----------: | ------- |
| LAT-API-10 | Live service (always ignored) | None observed |           No | IGNORED |

### `shopify-webhook-order-sync`

| Test       | Connects by | Writes                                                                                                                                    | Order tables | Result |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -----------: | ------ |
| WH-ORDER-1 | API         | DELETE shopify_customer_orders, POST shopify_customer_orders, POST shopify_order_associations, RPC validate_and_consume_association_token |      **Yes** | PASS   |
| WH-ORDER-2 | API         | DELETE shopify_customer_orders, POST shopify_customer_orders                                                                              |      **Yes** | PASS   |

### `staff-portal-reviews-and-sell`

| Test   | Connects by | Writes        | Order tables | Result |
| ------ | ----------- | ------------- | -----------: | ------ |
| REV-1  | API         | None observed |           No | PASS   |
| REV-2  | API         | None observed |           No | PASS   |
| REV-3  | API         | None observed |           No | PASS   |
| SELL-1 | API         | None observed |           No | PASS   |
| SELL-2 | API         | None observed |           No | PASS   |
| SELL-3 | API         | None observed |           No | PASS   |
| SELL-4 | API         | None observed |           No | PASS   |
| SELL-5 | API         | None observed |           No | PASS   |
| SELL-6 | API         | None observed |           No | PASS   |

### `staff-storefront-integration`

| Test    | Connects by | Writes                                                                             | Order tables | Result |
| ------- | ----------- | ---------------------------------------------------------------------------------- | -----------: | ------ |
| INTG-1  | API         | None observed                                                                      |           No | FAIL   |
| INTG-2  | API         | DELETE partner_certificates, POST partner_certificates                             |           No | PASS   |
| INTG-3  | API         | DELETE partner_certificates, PATCH partner_certificates, POST partner_certificates |           No | PASS   |
| INTG-4  | API         | None observed                                                                      |           No | FAIL   |
| INTG-5  | API         | None observed                                                                      |           No | PASS   |
| INTG-6  | API         | DELETE website_showcase, POST website_showcase                                     |           No | PASS   |
| INTG-7  | API         | None observed                                                                      |           No | PASS   |
| INTG-8  | API         | PATCH store_settings                                                               |           No | PASS   |
| INTG-9  | API         | POST partner_certificates                                                          |           No | PASS   |
| INTG-10 | API         | PATCH store_settings                                                               |           No | PASS   |
| INTG-11 | API         | None observed                                                                      |           No | PASS   |
