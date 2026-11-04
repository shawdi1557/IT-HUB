// scripts/pc-builder-spec-report.ts
// Read-only report of what the PC Builder makes of each product. It fetches the catalogue exactly as the
// storefront does, using only the public Storefront token, and changes nothing. No Admin credential.
//
//   deno run --no-lock --no-prompt --unstable-sloppy-imports --env-file=.env --allow-read --allow-env \
//     --allow-net=<the store> scripts/pc-builder-spec-report.ts
//
// Exit codes: 0 finished, 1 the catalogue couldn't be read, 2 Shopify isn't configured.

import { fetchAllShopifyProducts, shopifyConfig } from "../src/lib/shopify.ts";
import { buildSpecReport, formatSpecReport } from "../src/lib/builder/spec-report.ts";

if (!shopifyConfig.isConfigured) {
  console.error(
    "Shopify isn't configured: the store domain or public Storefront token is missing.",
  );
  Deno.exit(2);
}

const catalogue = await fetchAllShopifyProducts();
if (catalogue.error || !catalogue.products?.length) {
  console.error(`The catalogue couldn't be read: ${catalogue.error ?? "no products returned"}`);
  Deno.exit(1);
}

console.log(formatSpecReport(buildSpecReport(catalogue.products)));
