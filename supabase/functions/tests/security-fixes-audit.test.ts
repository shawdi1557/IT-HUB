// supabase/functions/tests/security-fixes-audit.test.ts
// Automated Test Suite for Database Security Fixes (Fixes A through J)
// Validates Business Logic, Invariants, Constraint Verification, and Schema Integrity

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"

// ==============================================================================
// Section 1: SQL Schema Invariant & Security Definer Audit (Fixes A, B, C, D, E, F, G, H, I, J)
// ==============================================================================

const SCHEMA_FILE_PATH = "supabase/schema.sql"
const MIGRATION_FILE_PATH =
  "supabase/migrations/20261011000001_security_and_reliability_fixes.sql"

const schemaSql = await Deno.readTextFile(SCHEMA_FILE_PATH)
const migrationSql = await Deno.readTextFile(MIGRATION_FILE_PATH)

const schemaSqlLower = schemaSql.toLowerCase()
const migrationSqlLower = migrationSql.toLowerCase()

Deno.test("SQL-1. Fix A: protect_service_request() uses NULL-safe IS DISTINCT FROM for quote_state", () => {
  assertStringIncludes(
    schemaSqlLower,
    "old.quote_state is distinct from 'pending'",
    "schema.sql must use NULL-safe IS DISTINCT FROM instead of <>",
  )
  assertStringIncludes(
    schemaSqlLower,
    "old.quote is null",
    "schema.sql must check that quote is not null before transition",
  )
  assertStringIncludes(
    migrationSqlLower,
    "old.quote_state is distinct from 'pending'",
    "migration.sql must use NULL-safe IS DISTINCT FROM instead of <>",
  )
})

Deno.test("SQL-2. Fix A: protect_service_request() prevents customer edits to internal notes and validates fields", () => {
  assertStringIncludes(schemaSqlLower, "new.notes is distinct from old.notes")
  assertStringIncludes(schemaSqlLower, "trim(coalesce(new.device, '')) = ''")
  assertStringIncludes(schemaSqlLower, "trim(coalesce(new.problem, '')) = ''")
  assertStringIncludes(
    schemaSqlLower,
    "select 1 from addresses where id = new.address_id and user_id = new.user_id",
  )
  assertStringIncludes(
    migrationSqlLower,
    "new.notes is distinct from old.notes",
  )
})

Deno.test("SQL-3. Fix B: record_order_payment() has unambiguous, non-cross-order lookup branches", () => {
  assertStringIncludes(schemaSqlLower, "if p_order_id is not null then")
  assertStringIncludes(
    schemaSqlLower,
    "where razorpay_order_id = trim(p_razorpay_order_id)",
  )
  assertStringIncludes(migrationSqlLower, "if p_order_id is not null then")
  assertStringIncludes(
    migrationSqlLower,
    "where razorpay_order_id = trim(p_razorpay_order_id)",
  )
})

Deno.test("SQL-4. Fix B: record_order_payment() handles late payments when stock reservations expire", () => {
  assertStringIncludes(
    schemaSqlLower,
    "stock re-reserved successfully upon late payment confirmation",
  )
  assertStringIncludes(schemaSqlLower, "reconciliation required: paid")
  assertStringIncludes(
    migrationSqlLower,
    "stock re-reserved successfully upon late payment confirmation",
  )
  assertStringIncludes(migrationSqlLower, "reconciliation required: paid")
})

Deno.test("SQL-5. Fix C & F: create_order() enforces mandatory address for Kerala and Standard delivery", () => {
  assertStringIncludes(
    schemaSqlLower,
    "if p_delivery_method in ('kerala delivery', 'standard delivery') then",
    "Delivery address condition check must exist",
  )
  assertStringIncludes(
    schemaSqlLower,
    "if p_address_id is null then",
    "Delivery address must be checked for null",
  )
  assertStringIncludes(
    migrationSqlLower,
    "if p_delivery_method in ('kerala delivery', 'standard delivery') then",
    "Delivery address condition check must exist in migration",
  )
})

Deno.test("SQL-6. Fix C: create_order() sorts cart items by product_id ASC to prevent deadlock", () => {
  assertStringIncludes(schemaSqlLower, "group by product_id")
  assertStringIncludes(schemaSqlLower, "order by product_id asc")
  assertStringIncludes(migrationSqlLower, "group by product_id")
  assertStringIncludes(migrationSqlLower, "order by product_id asc")
})

Deno.test("SQL-7. Fix C: create_order() snapshots product price in memory and avoids re-query price drift", () => {
  assertStringIncludes(
    schemaSqlLower,
    "v_snapshots := v_snapshots || jsonb_build_object(",
  )
  assertStringIncludes(schemaSqlLower, "'unit_price', v_effective_price")
  assertStringIncludes(
    migrationSqlLower,
    "v_snapshots := v_snapshots || jsonb_build_object(",
  )
  assertStringIncludes(migrationSqlLower, "'unit_price', v_effective_price")
})

Deno.test("SQL-8. Fix D: log_visitor_event() enforces event allowlist, admin event restrictions, and JSON size limit", () => {
  assertStringIncludes(schemaSqlLower, "'product added to cart'")
  assertStringIncludes(schemaSqlLower, "'admin login', 'admin data change'")
  assertStringIncludes(schemaSqlLower, "octet_length(p_meta::text) > 4096")
  assertStringIncludes(schemaSqlLower, "jsonb_typeof(p_meta) <> 'object'")
  assertStringIncludes(schemaSqlLower, "cf-connecting-ip")
  assertStringIncludes(migrationSqlLower, "'product added to cart'")
  assertStringIncludes(migrationSqlLower, "octet_length(p_meta::text) > 4096")
})

Deno.test("SQL-9. Fix E & H: handle_new_user() does NOT swallow unexpected exceptions", () => {
  const handleNewUserIndex = schemaSqlLower.indexOf(
    "function handle_new_user()",
  )
  const handleNewUserEnd = schemaSqlLower.indexOf(
    "end;\n$$;",
    handleNewUserIndex,
  )
  const handleNewUserBody = schemaSqlLower.substring(
    handleNewUserIndex,
    handleNewUserEnd,
  )
  assertEquals(
    handleNewUserBody.includes("when others then"),
    false,
    "handle_new_user must not silently swallow exceptions with when others then",
  )
})

Deno.test("SQL-10. Fix E: ensure_profile() self-healing function exists with SECURITY DEFINER and search_path", () => {
  assertStringIncludes(
    schemaSqlLower,
    "create or replace function ensure_profile()",
  )
  assertStringIncludes(schemaSqlLower, "security definer")
  assertStringIncludes(schemaSqlLower, "set search_path = public, pg_temp")
  assertStringIncludes(
    migrationSqlLower,
    "create or replace function ensure_profile()",
  )
})

Deno.test("SQL-11. Fix G: validate_coupon() checks positive cart total", () => {
  assertStringIncludes(
    schemaSqlLower,
    "if p_cart_total is null or p_cart_total <= 0 then",
  )
  assertStringIncludes(
    migrationSqlLower,
    "if p_cart_total is null or p_cart_total <= 0 then",
  )
})

Deno.test("SQL-12. Fix H: protect_role() uses NULL-safe IS DISTINCT FROM for role privilege elevation prevention", () => {
  assertStringIncludes(
    schemaSqlLower,
    "if new.role is distinct from old.role and not is_admin() then",
  )
  assertStringIncludes(
    schemaSqlLower,
    "if new.role is distinct from 'customer' and not is_admin() then",
  )
  assertStringIncludes(
    migrationSqlLower,
    "if new.role is distinct from old.role and not is_admin() then",
  )
})

Deno.test("SQL-13. Fix I: All SECURITY DEFINER functions set explicit search_path = public, pg_temp", () => {
  const functionDefinitions = schemaSql.split(
    /CREATE (?:OR REPLACE )?FUNCTION/i,
  )
  for (const fn of functionDefinitions.slice(1)) {
    if (/SECURITY\s+DEFINER/i.test(fn)) {
      const fnHeader = fn.substring(0, fn.indexOf("$$")).replace(/\s+/g, " ")
      assertStringIncludes(
        fn.toLowerCase(),
        "set search_path = public, pg_temp",
        `Security Definer function must set search_path = public, pg_temp. Header: ${fnHeader.substring(0, 80)}`,
      )
    }
  }
})

Deno.test("SQL-14. Fix I: Execution revoked from PUBLIC on internal triggers and helper functions", () => {
  assertStringIncludes(
    schemaSqlLower,
    "revoke all on function protect_service_request() from public",
  )
  assertStringIncludes(
    schemaSqlLower,
    "revoke all on function protect_role() from public",
  )
  assertStringIncludes(
    schemaSqlLower,
    "revoke all on function handle_new_user() from public",
  )
  assertStringIncludes(
    schemaSqlLower,
    "revoke all on function mask_ip_address(inet) from public",
  )
  assertStringIncludes(
    schemaSqlLower,
    "grant execute on function ensure_profile() to authenticated;",
  )
})

Deno.test("SQL-15. Phase 3 Invariants: Database cost_price shielding and atomic inventory row locks", () => {
  // 1. Column-level privilege restriction: cost_price must never be granted to anon/authenticated
  assertStringIncludes(
    schemaSqlLower,
    "revoke all on table products from anon, authenticated, public;",
    "products table must revoke full table privileges",
  )
  assertStringIncludes(
    schemaSqlLower,
    "on table products to anon, authenticated;",
    "products table must grant explicit column list only",
  )
  // Ensure 'cost_price' is NOT granted in the column list
  const productsGrantMatch = schemaSql.match(
    /grant\s+select\s*\(([^)]+)\)\s*on\s+(?:table\s+)?products\s+to\s+anon/i,
  )
  if (productsGrantMatch) {
    const grantedCols = productsGrantMatch[1].toLowerCase()
    assertEquals(
      grantedCols.includes("cost_price"),
      false,
      "cost_price must NEVER be granted to anon or authenticated roles",
    )
  }

  // 2. products_public view must not expose cost_price
  const viewMatch = schemaSql.match(
    /create(?:\s+or\s+replace)?\s+view\s+products_public[^;]+;/i,
  )
  if (viewMatch) {
    const viewBody = viewMatch[0].toLowerCase()
    assertEquals(
      viewBody.includes("cost_price"),
      false,
      "products_public view must NEVER expose cost_price",
    )
    assertStringIncludes(
      viewBody,
      "security_invoker = on",
      "products_public must enforce security_invoker = on",
    )
  }

  // 3. create_order() must use atomic row-level locks on inventory to prevent overselling
  assertStringIncludes(
    schemaSqlLower,
    "for share of p for update of i;",
    "create_order must place FOR UPDATE row lock on inventory to prevent concurrent overselling",
  )
  assertStringIncludes(
    schemaSqlLower,
    "if v_product.stock < v_item_qty then",
    "create_order must validate stock before deducting",
  )
  assertStringIncludes(
    schemaSqlLower,
    "update inventory\n    set stock = stock - v_item_qty",
    "create_order must deduct stock atomically on backend",
  )
})

Deno.test("SQL-16. Phase 3 Step 1: Enriched products_public view & idempotent Realtime publication", () => {
  // 1. Enriched products_public view joins brand and category names
  assertStringIncludes(
    schemaSqlLower,
    "b.name as brand",
    "products_public must join brands table to provide brand name",
  )
  assertStringIncludes(
    schemaSqlLower,
    "c.name as category",
    "products_public must join categories table to provide category name",
  )
  assertStringIncludes(
    schemaSqlLower,
    "low_stock_threshold",
    "products_public must include low_stock_threshold for live badges",
  )
  assertStringIncludes(
    schemaSqlLower,
    "as image_url",
    "products_public must extract primary image path from product_images",
  )

  // 2. cost_price must never leak into products_public
  const viewMatch = schemaSql.match(
    /create(?:\s+or\s+replace)?\s+view\s+products_public[^;]+;/i,
  )
  if (viewMatch) {
    const viewBody = viewMatch[0].toLowerCase()
    assertEquals(
      viewBody.includes("cost_price"),
      false,
      "products_public must never leak cost_price",
    )
  }

  // 3. Idempotent Realtime publication configuration
  assertStringIncludes(
    schemaSqlLower,
    "from pg_publication_tables",
    "Realtime publication configuration must check pg_publication_tables to prevent rerun errors",
  )
  assertStringIncludes(
    schemaSqlLower,
    "pubname = 'supabase_realtime'",
    "Realtime publication must check pubname = 'supabase_realtime'",
  )
  assertStringIncludes(
    schemaSqlLower,
    "tablename = 'inventory'",
    "Realtime publication must check tablename = 'inventory'",
  )
  assertStringIncludes(
    schemaSqlLower,
    "alter publication supabase_realtime add table public.inventory;",
    "Realtime publication must add public.inventory table",
  )
  assertStringIncludes(
    schemaSqlLower,
    "alter table public.inventory replica identity default;",
    "inventory must configure replica identity default for primary key updates",
  )
})

// ==============================================================================
// Section 2: Business Logic Emulation Tests (Pure algorithmic rules)
// ==============================================================================

interface TransitionOldState {
  quote: number | null
  quote_state: string | null
  isCustomer: boolean
}

interface TransitionNewState {
  quote_state: string
  notes?: string
}

interface TransitionResult {
  allowed: boolean
  reason?: string
}

function validateServiceRequestTransition(
  oldState: TransitionOldState,
  newState: TransitionNewState,
): TransitionResult {
  if (oldState.isCustomer) {
    if (oldState.quote_state !== "pending" || oldState.quote === null) {
      return {
        allowed: false,
        reason:
          "Quote cannot be approved or rejected unless pending with quote amount",
      }
    }
    if (newState.notes !== undefined) {
      return { allowed: false, reason: "Customer cannot modify staff notes" }
    }
  }
  return { allowed: true }
}

Deno.test("LOGIC-1. Service request quote approval requires 'pending' state and non-null quote amount", () => {
  // Case 1: unquoted request (quote is NULL, state is NULL)
  const res1 = validateServiceRequestTransition(
    { quote: null, quote_state: null, isCustomer: true },
    { quote_state: "approved" },
  )
  assertEquals(res1.allowed, false)

  // Case 2: quote is set but state is 'draft'
  const res2 = validateServiceRequestTransition(
    { quote: 500, quote_state: "draft", isCustomer: true },
    { quote_state: "approved" },
  )
  assertEquals(res2.allowed, false)

  // Case 3: quote is set and state is 'pending' -> allowed
  const res3 = validateServiceRequestTransition(
    { quote: 500, quote_state: "pending", isCustomer: true },
    { quote_state: "approved" },
  )
  assertEquals(res3.allowed, true)

  // Case 4: customer trying to edit notes during approval
  const res4 = validateServiceRequestTransition(
    { quote: 500, quote_state: "pending", isCustomer: true },
    { quote_state: "approved", notes: "Forged customer note" },
  )
  assertEquals(res4.allowed, false)
})

interface CartItemEntry {
  product_id: string
  quantity: number
}

// Fix C: Cart Grouping, Sorting, and Deterministic Locking Order
function sortCartItems(items: CartItemEntry[]) {
  return [...items].sort((a, b) => a.product_id.localeCompare(b.product_id))
}

Deno.test("LOGIC-2. Cart item deterministic ascending sort order prevents lock inversions", () => {
  const cart = [
    { product_id: "dddddddd-4444-4444-4444-444444444444", quantity: 1 },
    { product_id: "aaaaaaaa-1111-1111-1111-111111111111", quantity: 2 },
    { product_id: "cccccccc-3333-3333-3333-333333333333", quantity: 1 },
    { product_id: "bbbbbbbb-2222-2222-2222-222222222222", quantity: 3 },
  ]

  const sorted = sortCartItems(cart)
  assertEquals(sorted[0].product_id, "aaaaaaaa-1111-1111-1111-111111111111")
  assertEquals(sorted[1].product_id, "bbbbbbbb-2222-2222-2222-222222222222")
  assertEquals(sorted[2].product_id, "cccccccc-3333-3333-3333-333333333333")
  assertEquals(sorted[3].product_id, "dddddddd-4444-4444-4444-444444444444")
})

// Fix D: Visitor Event Allowlist and Meta Size Validation
const ALLOWED_PUBLIC_EVENTS = new Set([
  "Session Started",
  "Session Ended",
  "Page Viewed",
  "Login",
  "Logout",
  "Product Viewed",
  "Product Added to Cart",
  "Checkout Started",
  "Order Created",
  "Service Booking Started",
  "Service Request Created",
  "PC Builder Started",
  "PC Build Saved",
  "Warranty Assistance Viewed",
  "Contact/WhatsApp Action",
])
const ADMIN_EVENTS = new Set(["Admin Login", "Admin Data Change"])

interface VisitorValidationResult {
  valid: boolean
  error?: string
}

function validateVisitorEvent(
  eventType: string,
  meta: any,
  isAdmin: boolean,
): VisitorValidationResult {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    return { valid: false, error: "Metadata must be a JSON object" }
  }
  const metaLength = new TextEncoder().encode(JSON.stringify(meta)).byteLength
  if (metaLength > 4096) {
    return { valid: false, error: "Metadata exceeds 4096 byte limit" }
  }
  if (ADMIN_EVENTS.has(eventType)) {
    if (!isAdmin) {
      return { valid: false, error: "Event requires admin role" }
    }
    return { valid: true }
  }
  if (!ALLOWED_PUBLIC_EVENTS.has(eventType)) {
    return { valid: false, error: "Invalid event type" }
  }
  return { valid: true }
}

Deno.test("LOGIC-3. Visitor event validator enforces allowlist and payload limits", () => {
  // Public allowed event
  assertEquals(
    validateVisitorEvent("Product Viewed", { product_id: "xyz" }, false).valid,
    true,
  )

  // Public disallowed event
  assertEquals(
    validateVisitorEvent("arbitrary_spoof_event", {}, false).valid,
    false,
  )

  // Admin event attempted by non-admin
  assertEquals(validateVisitorEvent("Admin Login", {}, false).valid, false)

  // Admin event executed by admin
  assertEquals(validateVisitorEvent("Admin Login", {}, true).valid, true)

  // Non-object meta
  assertEquals(
    validateVisitorEvent("Page Viewed", "string_meta", false).valid,
    false,
  )
  assertEquals(
    validateVisitorEvent("Page Viewed", [1, 2, 3], false).valid,
    false,
  )

  // Payload > 4096 bytes
  const largeMeta = { spam: "x".repeat(5000) }
  assertEquals(
    validateVisitorEvent("Page Viewed", largeMeta, false).valid,
    false,
  )
})

interface CouponRuleInput {
  is_active: boolean
  start_date?: string
  end_date?: string
  min_order_value?: number
  discount_type: "percent" | "fixed"
  discount_value: number
  max_discount?: number | null
}

interface CouponValidationResult {
  valid: boolean
  discount: number
  finalTotal: number
  error?: string
}

// Fix G: Coupon Validation
function validateCouponRules(
  coupon: CouponRuleInput,
  cartTotal: number,
  now: Date = new Date(),
): CouponValidationResult {
  if (cartTotal <= 0) {
    return {
      valid: false,
      discount: 0,
      finalTotal: cartTotal,
      error: "Cart total must be greater than zero",
    }
  }
  if (!coupon.is_active) {
    return {
      valid: false,
      discount: 0,
      finalTotal: cartTotal,
      error: "Coupon is not active",
    }
  }
  if (coupon.start_date && new Date(coupon.start_date) > now) {
    return {
      valid: false,
      discount: 0,
      finalTotal: cartTotal,
      error: "Coupon has not started",
    }
  }
  if (coupon.end_date && new Date(coupon.end_date) < now) {
    return {
      valid: false,
      discount: 0,
      finalTotal: cartTotal,
      error: "Coupon has expired",
    }
  }
  if (coupon.min_order_value && cartTotal < coupon.min_order_value) {
    return {
      valid: false,
      discount: 0,
      finalTotal: cartTotal,
      error: `Minimum order value is ${coupon.min_order_value}`,
    }
  }

  let discount = 0
  if (coupon.discount_type === "percent") {
    discount =
      Math.round(((cartTotal * coupon.discount_value) / 100) * 100) / 100
    if (coupon.max_discount && discount > coupon.max_discount) {
      discount = coupon.max_discount
    }
  } else {
    discount = coupon.discount_value
  }
  if (discount > cartTotal) {
    discount = cartTotal
  }
  const finalTotal = Math.max(0, cartTotal - discount)
  return { valid: true, discount, finalTotal }
}

Deno.test("LOGIC-4. Coupon calculation respects percent limits, max discounts, and positive cart requirement", () => {
  // Negative or zero cart
  assertEquals(
    validateCouponRules(
      { is_active: true, discount_type: "fixed", discount_value: 100 },
      0,
    ).valid,
    false,
  )
  assertEquals(
    validateCouponRules(
      { is_active: true, discount_type: "fixed", discount_value: 100 },
      -50,
    ).valid,
    false,
  )

  // 10% discount on 1000 with max 50
  const capped = validateCouponRules(
    {
      is_active: true,
      discount_type: "percent",
      discount_value: 10,
      max_discount: 50,
    },
    1000,
  )
  assertEquals(capped.valid, true)
  assertEquals(capped.discount, 50)
  assertEquals(capped.finalTotal, 950)

  // Fixed discount larger than cart cannot make total negative
  const overflow = validateCouponRules(
    { is_active: true, discount_type: "fixed", discount_value: 500 },
    200,
  )
  assertEquals(overflow.valid, true)
  assertEquals(overflow.discount, 200)
  assertEquals(overflow.finalTotal, 0)
})
