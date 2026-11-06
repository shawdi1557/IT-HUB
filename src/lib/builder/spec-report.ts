// src/lib/builder/spec-report.ts
// What the builder makes of each product in the catalogue, for staff to act on. It only reads. It runs
// the same matching the builder uses, so it reports what customers actually get.

import type { Product } from "../../data/catalog";
import {
  detectComponentSlot,
  matchShopifyProductToComponent,
  shopifyStatedValues,
} from "./catalog";
import { inferredCriticalSpecs, inputsNeededByPart } from "./compatibility";
import {
  customerVisibleSpecs,
  keysChangedSinceReview,
  readSpecReview,
  readStatedSpecs,
  specFieldName,
  type SpecProblem,
} from "./spec-schema";
import type { ComponentSlotId } from "./types";

export interface PartReport {
  title: string;
  slot: ComponentSlotId;
  /** The registry entry this product matched, if any. */
  registryKey?: string;
  /** The part's overall standing, as the builder sees it. */
  standing: string;
  /** Whether a customer can be offered it: in stock, priced, and with a variant to sell. */
  offered: boolean;
  /** Values a label or every build's checks need that nobody has stated. */
  missing: string[];
  /** Values only some builds' checks read, each saying which builds. */
  neededInSomeBuilds: { name: string; when: string }[];
  /** Values a label needs that were only read from the title. */
  readFromTitle: string[];
  /** Values stated in Shopify that nobody has reviewed. */
  unreviewed: string[];
  /** Values changed after their review. */
  changedSinceReview: string[];
  /** Unreadable values, conflicts, review records that don't hold up, and rejections. */
  problems: SpecProblem[];
  /** Over one means a single set of values is standing in for several versions of the product. */
  variantCount: number;
}

export interface UndetectedProduct {
  title: string;
  /** The specification fields it holds, which the builder is ignoring. */
  keys: string[];
}

export interface SpecReport {
  parts: PartReport[];
  /** Holds pc_builder values, but the builder can't tell what kind of part it is. */
  undetected: UndetectedProduct[];
  /** Products in the catalogue, PC parts or not. */
  productCount: number;
}

export function buildSpecReport(products: Product[]): SpecReport {
  const parts: PartReport[] = [];
  const undetected: UndetectedProduct[] = [];

  for (const product of products) {
    const slot = detectComponentSlot(
      product.name,
      product.productType,
      product.tags || [],
      product.category,
    );
    const statedSpecs = shopifyStatedValues(product);
    if (!slot) {
      const visible = customerVisibleSpecs(statedSpecs);
      const keys = Object.keys(statedSpecs).filter((key) => !(key in visible));
      if (keys.length > 0) undetected.push({ title: product.name, keys });
      continue;
    }

    const part = matchShopifyProductToComponent(product);
    if (!part) continue;
    // Only values this kind of part reads. Filling in the review record itself changes nothing here.
    const readKeys = new Set(Object.values(readStatedSpecs(slot, statedSpecs).fieldKeys));
    const changed = [
      ...keysChangedSinceReview(readSpecReview(statedSpecs), product.specUpdatedAt),
    ].filter((key) => readKeys.has(key));
    const needs = inputsNeededByPart(part);
    parts.push({
      title: product.name,
      slot,
      registryKey: part.matchedModelKey,
      standing: part.specs.provenance ?? "unknown",
      offered: part.availability === "available" && Boolean(part.variantId) && part.price > 0,
      missing: needs.always,
      neededInSomeBuilds: needs.sometimes,
      readFromTitle: inferredCriticalSpecs(slot, part.specs),
      unreviewed: part.specs.unreviewedSpecs || [],
      changedSinceReview: changed.map(specFieldName),
      problems: part.specs.specProblems || [],
      variantCount: product.variants?.length ?? 1,
    });
  }

  return {
    parts: parts.sort((a, b) => a.slot.localeCompare(b.slot) || a.title.localeCompare(b.title)),
    undetected,
    productCount: products.length,
  };
}

/** The report as plain text. It holds no credentials, and no value but what the storefront already shows. */
export function formatSpecReport(report: SpecReport): string {
  const lines: string[] = [
    `Products in the catalogue: ${report.productCount}`,
    `PC parts the builder recognizes: ${report.parts.length}`,
    `Products with builder values but no recognized kind: ${report.undetected.length}`,
  ];
  const section = (name: string, values: string[]) => {
    if (values.length > 0) lines.push(`    ${name}: ${values.join(", ")}`);
  };
  for (const part of report.parts) {
    lines.push("", `[${part.slot}] ${part.title}`);
    lines.push(
      `    Standing: ${part.standing}${part.offered ? "" : " (not offered to customers)"}`,
    );
    lines.push(`    Registry match: ${part.registryKey ?? "none"}`);
    section("Not stated", part.missing);
    section(
      "Not stated, needed in some builds",
      part.neededInSomeBuilds.map(({ name, when }) => `${name} (when ${when})`),
    );
    section("Only read from the title", part.readFromTitle);
    section("Not reviewed", part.unreviewed);
    section("Changed after review", part.changedSinceReview);
    for (const problem of part.problems) {
      lines.push(
        `    Problem (${problem.kind}): ${problem.label ?? problem.field}: ${problem.detail}`,
      );
    }
    if (part.variantCount > 1) {
      lines.push(
        `    ${part.variantCount} variants share one set of values. Check they all match.`,
      );
    }
  }
  if (report.undetected.length > 0) {
    lines.push("", "The builder ignores these, because it can't tell what kind of part they are.");
    lines.push("Set a Shopify category or product type on each:");
    for (const product of report.undetected) {
      lines.push(`    ${product.title} (${product.keys.length} values)`);
    }
  }
  return lines.join("\n");
}
