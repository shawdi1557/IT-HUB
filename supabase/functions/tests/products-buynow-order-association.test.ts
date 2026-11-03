// supabase/functions/tests/products-buynow-order-association.test.ts
// Automated Tests for Buy Now Order Association & Webhook Gateway Configuration

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("BUYNOW-1: Products.tsx requires a checkout token and passes _hub_assoc_token", () => {
  const code = Deno.readTextFileSync("src/pages/Products.tsx");
  assertEquals(
    code.includes('import { requireCheckoutAssociation } from "../lib/shopify-orders"'),
    true,
    "Products.tsx must import requireCheckoutAssociation",
  );
  assertEquals(
    code.includes("const association = await requireCheckoutAssociation()"),
    true,
    "Products.tsx must require a token on Buy Now",
  );
  assertEquals(
    code.includes('key: "_hub_assoc_token"'),
    true,
    "Products.tsx must attach _hub_assoc_token to cart attributes",
  );
  assertEquals(
    code.includes("buyerIdentity,"),
    true,
    "Products.tsx must pass buyerIdentity with email and phone to createShopifyCart",
  );
  assertEquals(
    code.includes("/account/orders?checkout_completed=true"),
    true,
    "Products.tsx must set return_to_store to /account/orders?checkout_completed=true",
  );
});

Deno.test("BUYNOW-2: config.toml configures verify_jwt = false for webhook handlers", () => {
  const config = Deno.readTextFileSync("supabase/config.toml");
  assertEquals(
    config.includes("[functions.shopify-webhook]\nverify_jwt = false"),
    true,
    "config.toml must disable verify_jwt for shopify-webhook",
  );
  assertEquals(
    config.includes("[functions.verify-razorpay-webhook]\nverify_jwt = false"),
    true,
    "config.toml must disable verify_jwt for verify-razorpay-webhook",
  );
});

Deno.test("BUYNOW-3: Account.tsx distinguishes all order states and has no self-service order claiming", () => {
  const code = Deno.readTextFileSync("src/pages/Account.tsx");
  assertEquals(
    code.includes("ordersAuthError"),
    true,
    "Account.tsx must track authentication failure state",
  );
  assertEquals(
    code.includes("Sign In Required"),
    true,
    "Account.tsx must provide explicit sign in call-to-action on auth failure",
  );
  assertEquals(
    code.includes("Unable to Synchronize Shopify Orders"),
    true,
    "Account.tsx must display explicit error banner on sync/API failure",
  );
  // Self-service order claiming let customers take other people's orders, so it must stay removed.
  assertEquals(
    code.includes("Find & Link Order"),
    false,
    "Account.tsx must not offer a way to claim an order by typing someone's details",
  );
  assertEquals(
    code.includes("ordersLoading && !shopifyOrders.length"),
    true,
    "Account.tsx must handle loading skeleton state distinctly",
  );
});
