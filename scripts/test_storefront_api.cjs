/**
 * IT HUB — Shopify Storefront API Diagnostic & Product Verification Utility (Phase 4 QA)
 * File: scripts/test_storefront_api.cjs
 *
 * Diagnostic tool to independently test Storefront API connectivity,
 * search for the Lenovo Legion R27qe Gen 2 monitor, verify variant inventory,
 * and test cart creation & hosted checkout URL generation.
 *
 * Security:
 * - NEVER prints or logs access tokens, secret keys, or authorization headers.
 * - Accepts credentials via CLI arguments or environment variables.
 *
 * Usage:
 *   node scripts/test_storefront_api.cjs [--domain=<store.myshopify.com>] [--token=<storefront-token>]
 */

const https = require("https");

// Read args
const args = process.argv.slice(2);
let storeDomain = "";
let storefrontToken = "";
let apiVersion = "2026-01";

for (const arg of args) {
  if (arg.startsWith("--domain=")) storeDomain = arg.split("=")[1].trim();
  if (arg.startsWith("--token=")) storefrontToken = arg.split("=")[1].trim();
  if (arg.startsWith("--version=")) apiVersion = arg.split("=")[1].trim();
}

// Fallback to environment variables if not passed via CLI
if (!storeDomain) storeDomain = (process.env.VITE_SHOPIFY_STORE_DOMAIN || "").trim();
if (!storefrontToken)
  storefrontToken = (process.env.VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN || "").trim();

function normalizeDomain(domain) {
  return domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

storeDomain = normalizeDomain(storeDomain);

function printHeader(title) {
  console.log("\n================================================================================");
  console.log(`IT HUB QA: ${title}`);
  console.log("================================================================================");
}

function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    if (!storeDomain || !storefrontToken) {
      return reject(
        new Error(
          "Missing storeDomain or storefrontToken. Pass via --domain=... --token=... or set env vars.",
        ),
      );
    }

    const payload = JSON.stringify({ query, variables });
    const options = {
      hostname: storeDomain,
      port: 443,
      path: `/api/${apiVersion}/graphql.json`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": storefrontToken,
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            rawBody: data,
            parseError: e.message,
          });
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timed out after 10000ms"));
    });
    req.write(payload);
    req.end();
  });
}

async function runDiagnostic() {
  printHeader("Shopify Storefront API Diagnostic & Product Verification");

  console.log(`Target Store Domain: ${storeDomain || "(Not provided)"}`);
  console.log(`API Version:         ${apiVersion}`);
  console.log(
    `Storefront Token:    ${storefrontToken ? "[CONFIGURED: " + storefrontToken.slice(0, 4) + "..." + storefrontToken.slice(-4) + "]" : "(Missing)"}`,
  );

  if (!storeDomain || !storefrontToken) {
    console.log("\n[DIAGNOSTIC STATUS: UNCONFIGURED]");
    console.log("Please supply credentials to run independent Storefront verification:");
    console.log(
      "  node scripts/test_storefront_api.cjs --domain=your-store.myshopify.com --token=your-storefront-access-token",
    );
    return;
  }

  // ── Step 1: Health Check & Shop Metadata ──
  console.log("\n[Test 1] Verifying Endpoint & Storefront Authentication...");
  const healthQuery = `
    query {
      shop {
        name
        primaryDomain {
          host
        }
        paymentSettings {
          currencyCode
        }
      }
    }
  `;

  try {
    const healthRes = await makeGraphQLRequest(healthQuery);
    if (healthRes.statusCode !== 200) {
      console.error(`  FAIL: HTTP Status ${healthRes.statusCode}`);
      if (healthRes.statusCode === 401 || healthRes.statusCode === 403) {
        console.error("  Error: Invalid Storefront Access Token or unauthorized permissions.");
      }
      return;
    }

    if (healthRes.body?.errors) {
      console.error("  FAIL: GraphQL Errors returned:");
      healthRes.body.errors.forEach((e) => console.error(`    - ${e.message}`));
      return;
    }

    const shop = healthRes.body?.data?.shop;
    console.log(`  PASS: Connected successfully to "${shop?.name}" (${shop?.primaryDomain?.host})`);
    console.log(`  Store Currency: ${shop?.paymentSettings?.currencyCode || "INR"}`);
  } catch (err) {
    console.error(`  FAIL: Network/Connection Error: ${err.message}`);
    return;
  }

  // ── Step 2: Query Catalog & Inspect Lenovo Legion Monitor ──
  console.log("\n[Test 2] Querying Published Products from Storefront API...");
  const productsQuery = `
    query {
      products(first: 50) {
        pageInfo {
          hasNextPage
        }
        edges {
          node {
            id
            title
            handle
            availableForSale
            productType
            vendor
            description
            descriptionHtml
            featuredImage {
              url
              altText
            }
            images(first: 20) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  availableForSale
                  price {
                    amount
                    currencyCode
                  }
                  compareAtPrice {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let publishedProducts = [];
  try {
    const catalogRes = await makeGraphQLRequest(productsQuery);
    if (catalogRes.body?.errors) {
      console.error("  FAIL: GraphQL Errors querying products:");
      catalogRes.body.errors.forEach((e) => console.error(`    - ${e.message}`));
      return;
    }

    const edges = catalogRes.body?.data?.products?.edges || [];
    publishedProducts = edges.map((e) => e.node);
    console.log(
      `  PASS: Storefront API returned ${publishedProducts.length} published product(s).`,
    );
  } catch (err) {
    console.error(`  FAIL: Error querying catalog: ${err.message}`);
    return;
  }

  // ── Step 3: Inspect Lenovo Legion Monitor Specifically ──
  console.log("\n[Test 3] Inspecting Lenovo Legion R27qe Gen 2 Monitor...");
  const lenovoMatch = publishedProducts.find((p) => {
    const text = `${p.title} ${p.handle} ${p.vendor}`.toLowerCase();
    return (
      text.includes("legion") ||
      text.includes("r27qe") ||
      (text.includes("lenovo") && text.includes("monitor"))
    );
  });

  if (lenovoMatch) {
    console.log("  FOUND: Lenovo Monitor is published and visible to Storefront API!");
    console.log(`    Title:               ${lenovoMatch.title}`);
    console.log(`    Handle:              ${lenovoMatch.handle}`);
    console.log(`    Product GID:         ${lenovoMatch.id}`);
    console.log(`    Vendor:              ${lenovoMatch.vendor || "Lenovo"}`);
    console.log(`    Available For Sale:  ${lenovoMatch.availableForSale}`);
    console.log(
      `    Catalog Status:      ${lenovoMatch.availableForSale ? "In Stock (Available)" : "Out of Stock"}`,
    );
    console.log(`    Primary Image:       ${lenovoMatch.featuredImage?.url || "None"}`);
    const galleryUrls = (lenovoMatch.images?.edges || []).map((e) => e.node.url);
    console.log(`    Gallery Images:      ${galleryUrls.length} image(s)`);
    galleryUrls.forEach((url, i) => console.log(`      [${i + 1}] ${url}`));
    const descPreview = lenovoMatch.description
      ? lenovoMatch.description.slice(0, 80) + "..."
      : "(No description)";
    console.log(`    Description:         ${descPreview}`);
    console.log(`    Has HTML Desc:       ${Boolean(lenovoMatch.descriptionHtml)}`);

    const variants = lenovoMatch.variants.edges.map((e) => e.node);
    console.log(`    Variants Count:      ${variants.length}`);
    variants.forEach((v, idx) => {
      console.log(`      [Variant ${idx + 1}] Title: "${v.title}", ID: ${v.id}`);
      console.log(`        Price:             ₹${v.price.amount} ${v.price.currencyCode}`);
      console.log(
        `        Compare At MRP:    ${v.compareAtPrice ? "₹" + v.compareAtPrice.amount : "None"}`,
      );
      console.log(`        Available:         ${v.availableForSale}`);
      console.log(
        `        Status:            ${v.availableForSale ? "In Stock (Available)" : "Out of Stock"}`,
      );
    });

    if (!lenovoMatch.availableForSale || !variants[0]?.availableForSale) {
      console.log("\n  [QA NOTICE: INVENTORY IS ZERO]");
      console.log("  The monitor is visible, but current available inventory is 0.");
      console.log("  To make it purchasable for end-to-end checkout testing:");
      console.log("    1. In Shopify Admin -> Products -> Lenovo Legion R27qe Gen 2 -> Inventory");
      console.log("    2. Set Available quantity >= 1 at your active location (e.g. 5 units)");
      console.log("    3. Or enable 'Continue selling when out of stock' if testing backorders.");
    }
  } else {
    console.log("  [INVESTIGATION RESULT: LENOVO MONITOR NOT RETURNED]");
    console.log("  The Storefront API did NOT return a product matching 'Legion' or 'R27qe'.");
    console.log("  Published products currently in store:");
    if (publishedProducts.length === 0) {
      console.log("    (No products are currently published to the Storefront API sales channel)");
    } else {
      publishedProducts.forEach((p, i) =>
        console.log(`    ${i + 1}. "${p.title}" (Handle: ${p.handle})`),
      );
    }
    console.log("\n  [REQUIRED ACTION IN SHOPIFY ADMIN]:");
    console.log("    1. Open Shopify Admin -> Products -> Lenovo Legion R27qe Gen 2");
    console.log("    2. Check 'Product Status': Must be 'Active' (not 'Draft')");
    console.log("    3. Check 'Sales Channels': Click 'Manage' next to Publishing/Sales channels");
    console.log("       Ensure 'Headless' / 'Storefront API' (and 'Online Store') are checked!");
    console.log(
      "       (If a product is Active but not published to the Storefront API app, it is hidden from the API)",
    );
    console.log("    4. Save changes and re-run this diagnostic.");
  }

  // ── Step 4: Test Cart Creation & Hosted Checkout URL Generation ──
  console.log("\n[Test 4] Testing Native Cart Creation & Hosted Checkout URL...");
  const testProduct = lenovoMatch || publishedProducts[0];
  const testVariant = testProduct?.variants?.edges?.[0]?.node;

  if (testVariant) {
    const cartMutation = `
      mutation cartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
            totalQuantity
            cost {
              totalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const cartRes = await makeGraphQLRequest(cartMutation, {
        input: {
          lines: [
            {
              merchandiseId: testVariant.id,
              quantity: 1,
            },
          ],
        },
      });

      const cartData = cartRes.body?.data?.cartCreate;
      if (cartData?.userErrors && cartData.userErrors.length > 0) {
        console.log(
          `  FAIL: Cart userErrors: ${cartData.userErrors.map((e) => e.message).join(", ")}`,
        );
      } else if (cartData?.cart) {
        console.log("  PASS: Native Shopify Cart Created Successfully!");
        console.log(`    Cart GID:       ${cartData.cart.id}`);
        console.log(`    Total Items:    ${cartData.cart.totalQuantity}`);
        console.log(
          `    Total Amount:   ₹${cartData.cart.cost.totalAmount.amount} ${cartData.cart.cost.totalAmount.currencyCode}`,
        );
        console.log(`    Checkout Host:  ${new URL(cartData.cart.checkoutUrl).hostname}`);
        console.log(`    Checkout URL:   [VALID HOSTED CHECKOUT LINK GENERATED]`);
      }
    } catch (err) {
      console.error(`  FAIL: Cart creation error: ${err.message}`);
    }
  } else {
    console.log("  SKIP: No purchasable variant available to test cart creation.");
  }

  printHeader("Diagnostic Complete");
}

runDiagnostic().catch((e) => console.error("Unhandled error:", e));
