# IT HUB — Phase 4: Shopify Checkout Navigation & Sold-Out Recovery Architecture Report
**Authoritative Storefront Checkout, Race Condition Handling & Customer Retention**  
**Date**: October 24, 2026  
**Branch**: `fix/shopify-catalog-integration`  
**Target Store**: `it-hub-m8tzfjd.myshopify.com`

---

## 1. Executive Summary

During Phase 4 manual verification of the headless Shopify checkout integration, two customer journey vulnerabilities were identified and resolved:

1. **Buy Now Navigation Friction**: Clicking **Buy Now** on the product detail page previously diverted customers to the local demo `/checkout` page rather than creating a native Shopify Storefront cart and redirecting directly to Shopify Hosted Checkout.
2. **Sold-Out Checkout Failure & Abandonment Risk**: If a product or variant was out of stock or inventory depleted between page load and cart creation (race condition), customers encountered unhandled errors or invalid cart state without clear explanations or direct recovery paths to the IT HUB catalog.

Both issues have been remediated cleanly. The storefront now enforces pre-flight availability checks, directly routes **Buy Now** to Shopify's authoritative `checkoutUrl`, handles stock race conditions gracefully on the IT HUB domain, and provides immediate recovery links (`/products`) to keep customers engaged.

All 225 automated tests pass, TypeScript compiler reports 0 errors, and the production Vite bundle builds cleanly.

---

## 2. Root Cause Analysis

### Issue A: Buy Now Detour
- In [`src/pages/Products.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/pages/Products.tsx), the `Buy now` button handler was previously implemented as:
  ```tsx
  onClick={() => {
    add()
    navigate("/checkout")
  }}
  ```
  This invoked local cart addition and pushed the user to the local `/checkout` route (which is configured for prototype/Razorpay flows), completely bypassing the direct Shopify Storefront API cart creation.
- Cart lines previously failed to pass `variantId`, falling back to `item.id` (which can be a Product GID rather than the required `ProductVariant` GID).

### Issue B: Sold-Out Product Handling & Race Conditions
- If a product became sold out in Shopify Admin (`availableForSale: false`):
  - Storefront API's `cartCreate` mutation returned `userErrors` (e.g., `OUT_OF_STOCK` or `"The merchandise item is not available"`).
  - Previously, `createShopifyCart` concatenated `userErrors` into a generic error string without mapping the error back to the specific line item or product in the customer's cart.
  - The cart page lacked proactive real-time inventory revalidation before checkout, risking customer frustration upon encountering unhandled errors.

---

## 3. Architecture & Implementation

### 3.1. Direct "Buy Now" Checkout Flow
1. **Validation**: When the customer clicks **Buy Now**, the product detail page validates that:
   - `quantity >= 1`.
   - `availableForSale` is `true` (or `stock > 0` for non-Shopify items).
2. **Single-Action Cart Creation**:
   - Sets `buyingNow = true`, disables the button, and shows `<LoaderCircle className="animate-spin" /> Preparing checkout...` to prevent double-clicks.
   - Resolves the exact `variantId` (e.g. `gid://shopify/ProductVariant/...`).
   - Injects a `return_to_store` attribute pointing to the product URL on the current storefront origin (`window.location.origin`).
   - Calls `createShopifyCart([{ merchandiseId: variantId, quantity }])`.
3. **Direct Redirection**:
   - Reads `res.cart.checkoutUrl` and immediately navigates via `window.location.href = res.cart.checkoutUrl`.
   - The customer never touches the local cart or intermediate pages.
4. **Error Confinement**:
   - If cart creation fails or Shopify rejects the variant, the customer remains on the IT HUB product page.
   - A dedicated error alert appears beneath the button with an explanation and a `"Continue shopping →"` link to `/products`.

### 3.2. Real-Time Pre-Flight Availability Checking
- Implemented [`checkShopifyAvailability(ids)`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/lib/shopify.ts) and [`revalidateCartAvailability(cartItems)`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/lib/shopify.ts).
- Queries `nodes(ids: $ids)` via Storefront API for `availableForSale` on `ProductVariant` and `Product`.
- Evaluates real-time availability immediately before proceeding to checkout and when the cart view mounts.
- If any item in the cart is sold out:
  - Highlights the item in red (`border-red-300 bg-red-50/30`).
  - Displays `"Sorry, this item is currently sold out."`
  - Provides a 1-click `"Remove item"` action.
  - Disables the `"Proceed to checkout"` button until the cart is valid.
  - Displays a catalog recovery link (`/products`).

### 3.3. Inventory Race Condition Recovery
- When stock depletes in the exact millisecond window between the availability check and `cartCreate`:
  - Shopify's `cartCreate` mutation returns `userErrors: [{ field: ["lines", "0", "merchandiseId"], message: "..." }]`.
  - Added [`parseCartErrorLineIndex(field)`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/lib/shopify.ts) to parse the zero-indexed line position from the GraphQL error path.
  - The cart page matches the error to the exact cart item, flags it as unavailable, displays:
    > *"Inventory updated: One or more items in your cart just became sold out. Please remove them or adjust quantity before checkout."*
  - Customer remains securely on the IT HUB cart page with full visibility into which item changed.
  - The system never silently removes items or alters order totals without informing the customer.

### 3.4. Shopify-Hosted Checkout Limitation
- Once the customer navigates to `https://it-hub-m8tzfjd.myshopify.com/checkouts/...`, browser execution shifts to Shopify's secure PCI-compliant environment.
- IT HUB cannot inject arbitrary client-side JavaScript into Shopify's hosted checkout domain without Shopify Plus Checkout Extensibility.
- **Remediation**:
  - We inject `return_to_store: window.location.origin + "/cart"` into cart attributes.
  - In Shopify Admin -> Settings -> Checkout -> Header & Navigation, configure the store logo and header link to point back to the IT HUB storefront origin.
  - Any error occurring before navigation is 100% intercepted and resolved inside IT HUB.

---

## 4. Files Modified

| File | Changes Made |
| :--- | :--- |
| [`src/lib/shopify.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/lib/shopify.ts) | 1. Added `ShopifyCartUserError`, `CreateShopifyCartOptions`, `CreateShopifyCartResult`.<br>2. Implemented `parseCartErrorLineIndex` to extract line numbers from error paths.<br>3. Enhanced `createShopifyCart` to accept cart options, inject default `return_to_store` origin attributes, and return structured `userErrors`.<br>4. Implemented `checkShopifyAvailability` and `revalidateCartAvailability` using Storefront API `nodes(ids: $ids)`. |
| [`src/pages/Products.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/pages/Products.tsx) | 1. Implemented `handleBuyNow` with variant ID validation, quantity check, loading state (`buyingNow`), and direct `window.location.href` navigation to Shopify `checkoutUrl`.<br>2. Rendered loading spinner and disabled state during checkout creation.<br>3. Added `buyNowError` alert with `"Continue shopping →"` recovery link.<br>4. Ensured `variantId` is passed in `add()` and guarded against adding sold-out products. |
| [`src/pages/Commerce.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/pages/Commerce.tsx) | 1. Integrated `revalidateCartAvailability` on cart load and pre-checkout.<br>2. Tracked `unavailableIds` to flag out-of-stock items in real-time.<br>3. Handled `cartCreate` `userErrors` using `lineIndex` to pinpoint affected items during race conditions.<br>4. Added item-level sold out banner with 1-click `"Remove item"` CTA and catalog link.<br>5. Added top checkout error banner with clear instructions and `"Continue shopping in catalog →"` link.<br>6. Disabled `"Proceed to checkout"` button when any item is sold out. |
| [`src/app/store.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/app/store.tsx) | Updated `addCart` to distinguish sold-out items (`"Sorry, this item is currently sold out."`) from excess quantity requests (`"Not enough stock available. Please adjust your cart."`). Preserved `variantId` on cart items. |
| [`supabase/functions/tests/shopify-catalog-integration.test.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/tests/shopify-catalog-integration.test.ts) | Added 10 automated regression tests (`SHOP-CHECKOUT-1` through `SHOP-CHECKOUT-10`). |

---

## 5. Verification & Test Suite Results

### 5.1. Automated Unit & Integration Tests
Command: `npm test`
```
running 26 tests from ./supabase/functions/tests/shopify-catalog-integration.test.ts
...
SHOP-CHECKOUT-1: Buy Now payload accurately normalizes variant GID and selected quantity ... ok
SHOP-CHECKOUT-2: Buy Now redirects directly to returned Shopify checkout URL ... ok
SHOP-CHECKOUT-3: Add to Cart preserves variantId and existing product structure ... ok
SHOP-CHECKOUT-4: Sold-out variants (availableForSale: false) are rejected before checkout or cart addition ... ok
SHOP-CHECKOUT-5: Quantity exceeding availability is detected and prevented without fabricating success ... ok
SHOP-CHECKOUT-6: Checkout preparation failures keep user on IT HUB and allow retry ... ok
SHOP-CHECKOUT-7: Cart recovery identifies unavailable items and provides route back to catalog ... ok
SHOP-CHECKOUT-8: Race condition handling: parseCartErrorLineIndex pinpoints affected cart item from userErrors ... ok
SHOP-CHECKOUT-9: Internal recovery links and return attributes use configured storefront origin ... ok
SHOP-CHECKOUT-10: checkShopifyAvailability and revalidateCartAvailability handle empty and unconfigured states safely ... ok

ok | 225 passed | 0 failed (1s)
```

### 5.2. TypeScript Compiler
Command: `npx tsc --noEmit`
Result: Clean exit (code 0), 0 errors.

### 5.3. Production Build
Command: `npm run build`
Result: Clean compilation in 11.81s. All 40 assets generated successfully in `dist/`.

---

## 6. Manual Verification Checklist

1. **Buy Now (Normal In-Stock Flow)**:
   - Navigate to `/products/lenovo-legion-smartchoice-r27qe-gen-2` on `http://localhost:8443`.
   - Confirm quantity is `1`.
   - Click **Buy now →**.
   - Observe loading state: button displays spinner and *"Preparing checkout..."*.
   - Confirm browser redirects directly to `https://it-hub-m8tzfjd.myshopify.com/checkouts/...` without loading `/cart` or local checkout.
2. **Buy Now (Sold-Out Product Flow)**:
   - Temporarily set `availableForSale: false` on a test product or inspect an unavailable item.
   - Confirm **Buy now** and **Add to cart** are disabled.
   - If invoked, observe the error message: *"Sorry, this item is currently sold out."*
   - Verify customer remains on `http://localhost:8443` and can click *"Continue shopping →"*.
3. **Cart Checkout & Stock Revalidation**:
   - Add an item to the cart and visit `/cart`.
   - Click **Proceed to checkout →**.
   - If an item is sold out, observe the item card border turn red with the *"Sold Out"* badge and *"Remove item"* action.
   - Confirm the checkout button is disabled with explanation, and customer remains on `/cart`.
