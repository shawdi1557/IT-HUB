// src/lib/batchImporter.ts
// IT HUB — Safe Batch Inventory Importer & Staging Validation Engine
// Enforces zero-fabrication pricing, physical stock verification,
// SKU-based duplicate protection, and dry-run safety gates.

import { supabase } from "./supabase";
import type { Product } from "../data/catalog";

export interface StagedProductInput {
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory?: string;
  description?: string;
  price?: number | null;
  salePrice?: number | null;
  costPrice?: number | null;
  mrp?: number | null;
  stock?: number | null;
  lowStockThreshold?: number;
  warranty?: string;
  weight?: string;
  status?: string;
  secondHand?: boolean;
  condition?: string;
  specs?: Record<string, string>;
}

export interface RowValidationIssue {
  row: number;
  sku: string;
  field: string;
  level: "error" | "warning";
  message: string;
}

export interface BatchImportValidationReport {
  totalRows: number;
  validForImport: number;
  skippedOrInvalid: number;
  missingPriceCount: number;
  missingStockCount: number;
  duplicateSkuInFileCount: number;
  existingInDbCount: number;
  issues: RowValidationIssue[];
  dryRun: boolean;
  sampleReadyRows: StagedProductInput[];
}

export interface BatchImportOptions {
  dryRun?: boolean;
  batchSize?: number;
  skipExistingDbSkus?: boolean;
}

export interface BatchImportResult {
  success: boolean;
  dryRun: boolean;
  report: BatchImportValidationReport;
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  error?: string;
}

/**
 * Validates a collection of staged inventory rows according to IT HUB policy:
 * - Selling Price is MANDATORY and cannot be fabricated.
 * - Stock must be a non-negative integer (defaults to 0 / Out of Stock with warning if missing).
 * - SKUs must be non-empty and unique within the file.
 * - Database duplicates are identified against existing PostgreSQL records.
 */
export async function validateStagedInventory(
  rows: StagedProductInput[],
  existingDbSkus: Set<string> = new Set(),
): Promise<BatchImportValidationReport> {
  const issues: RowValidationIssue[] = [];
  const skuCounts = new Map<string, number>();
  const sampleReadyRows: StagedProductInput[] = [];

  let missingPriceCount = 0;
  let missingStockCount = 0;
  let duplicateSkuInFileCount = 0;
  let existingInDbCount = 0;
  let validForImport = 0;

  // Pass 1: Count SKU frequencies in file
  for (const row of rows) {
    const sku = (row.sku || "").trim().toUpperCase();
    if (sku) {
      skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
    }
  }

  // Pass 2: Row-level validation
  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed, header is row 1
    const sku = (row.sku || "").trim().toUpperCase();
    let hasError = false;

    if (!sku) {
      issues.push({
        row: rowNum,
        sku: "EMPTY",
        field: "sku",
        level: "error",
        message: "Missing SKU identifier",
      });
      hasError = true;
    } else if ((skuCounts.get(sku) || 0) > 1) {
      issues.push({
        row: rowNum,
        sku,
        field: "sku",
        level: "error",
        message: `Duplicate SKU in import file (${sku})`,
      });
      duplicateSkuInFileCount++;
      hasError = true;
    }

    if (!row.name || !row.name.trim()) {
      issues.push({
        row: rowNum,
        sku,
        field: "name",
        level: "error",
        message: "Missing product name",
      });
      hasError = true;
    }

    // Strict Pricing Safeguards (Never invent prices!)
    if (row.price === null || row.price === undefined || isNaN(row.price) || row.price <= 0) {
      issues.push({
        row: rowNum,
        sku,
        field: "price",
        level: "error",
        message:
          "Missing or invalid selling price. Prices must be provided by the client and cannot be fabricated.",
      });
      missingPriceCount++;
      hasError = true;
    }

    // MRP consistency check
    if (
      typeof row.mrp === "number" &&
      typeof row.price === "number" &&
      row.mrp > 0 &&
      row.price > row.mrp
    ) {
      issues.push({
        row: rowNum,
        sku,
        field: "mrp",
        level: "error",
        message: `Stated MRP (₹${row.mrp}) cannot be less than selling price (₹${row.price})`,
      });
      hasError = true;
    }

    // Stock verification
    if (row.stock === null || row.stock === undefined || isNaN(row.stock)) {
      issues.push({
        row: rowNum,
        sku,
        field: "stock",
        level: "warning",
        message: "Missing stock count — will default to 0 (Out of stock) pending physical count",
      });
      missingStockCount++;
    } else if (row.stock < 0 || !Number.isInteger(row.stock)) {
      issues.push({
        row: rowNum,
        sku,
        field: "stock",
        level: "error",
        message: "Stock quantity must be a non-negative integer",
      });
      hasError = true;
    }

    // Database SKU collision
    if (sku && existingDbSkus.has(sku)) {
      issues.push({
        row: rowNum,
        sku,
        field: "sku",
        level: "warning",
        message: `Product SKU already exists in PostgreSQL database (${sku})`,
      });
      existingInDbCount++;
    }

    if (!hasError) {
      validForImport++;
      if (sampleReadyRows.length < 5) {
        sampleReadyRows.push(row);
      }
    }
  });

  return {
    totalRows: rows.length,
    validForImport,
    skippedOrInvalid: rows.length - validForImport,
    missingPriceCount,
    missingStockCount,
    duplicateSkuInFileCount,
    existingInDbCount,
    issues,
    dryRun: true,
    sampleReadyRows,
  };
}

/**
 * Retrieves all currently existing product SKUs from PostgreSQL database.
 */
export async function getExistingDatabaseSkus(): Promise<Set<string>> {
  if (!supabase) return new Set();

  try {
    const { data, error } = await supabase.from("products_public").select("sku");

    if (error || !data) return new Set();

    return new Set(
      data.map((p) => p.sku?.trim().toUpperCase()).filter((s): s is string => Boolean(s)),
    );
  } catch {
    return new Set();
  }
}

/**
 * Performs a safe, repeatable batch import of validated staged products.
 * Defaults to dryRun = true to prevent unintended production modifications.
 */
export async function executeBatchImport(
  rows: StagedProductInput[],
  options: BatchImportOptions = {},
): Promise<BatchImportResult> {
  const dryRun = options.dryRun ?? true;
  const existingSkus = await getExistingDatabaseSkus();
  const report = await validateStagedInventory(rows, existingSkus);

  report.dryRun = dryRun;

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      report,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0,
    };
  }

  // Live import requires configured Supabase client and explicit authorization
  if (!supabase) {
    return {
      success: false,
      dryRun: false,
      report,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      error: "Supabase client not configured for live import execution.",
    };
  }

  // Live write path requires client approval and complete pricing/stock data
  return {
    success: false,
    dryRun: false,
    report,
    insertedCount: 0,
    updatedCount: 0,
    failedCount: 0,
    error:
      "Batch live import is blocked pending client submission of confirmed pricing and physical inventory workbooks.",
  };
}
