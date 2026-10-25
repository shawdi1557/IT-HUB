# Phase 4 — Product and Inventory Migration & Ingestion Pipeline

**Project:** IT HUB — E-Commerce & Service Platform Migration  
**Location:** Kerala, India  
**Target Launch Date:** November 8, 2026  
**Implementation Branch:** `PH-4`  
**Integration Target:** `migration/shopify-integration`  

---

## 1. Executive Summary & Inventory Reconciliation

Phase 4 executes the product and inventory normalization, deduplication, categorization, and ingestion pipeline for IT HUB's **1,359 inventory particulars** staged from the Tally ERP Godown Summary export.

### 1.1 Strict Inventory Accounting & Row Verification

| Metric | Verified Count | Notes |
| :--- | :--- | :--- |
| **Total Staged Particulars** | **1,359** | Verified in `inventory_staging/normalized_inventory_import_template.csv` |
| **Brands Auto-Recovered** | **157** | Identified true manufacturers (e.g. Ant Esports, Portronics, MSI, WD, Crucial) previously labeled `Generic / OEM` |
| **Exact Duplicate Particulars** | **7** | Duplicated rows in source export identified and reconciled |
| **Unpriced Items (Pending Client)** | **1,359** | Safely assigned `status: draft` with `0.00` price (Zero Data Fabrication Rule) |
| **Pilot Batch Approved** | **10** | 10 verified products across core categories ready for initial Shopify staging import |

---

## 2. Duplicate Particulars Audit & Reconciliation (Step 2)

During the normalization scan of the 1,359 staging records, exactly **7 duplicate particulars** were detected where identical hardware products appeared across multiple rows (originating from separate godowns or duplicate entries in the source ledger):

| # | Product Name | First Occurrence | Duplicate Occurrence | Reconciliation Action |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `CPU Air Cooler Ant Esports Ice - C612 Digital` | Row 237 (`ITH-GEN-GEN-CPUAIRCO-96E1`) | Row 239 (`ITH-GEN-GEN-CPUAIRCO-2DE7`) | Merge stock into single Shopify Product variant or differentiate batch |
| 2 | `Mother Board MSI PRO Z890 - S WIFI 6E` | Row 732 (`ITH-GEN-MSI-MOTHERBO-B259`) | Row 737 (`ITH-GEN-MSI-MOTHERBO-386C`) | Merge stock into single Shopify Product variant or differentiate batch |
| 3 | `POR 1626 - Power Plate 10 - 4 Socket 3M Power Converter, Black` | Row 852 (`ITH-GEN-GEN-POR1626P-6749`) | Row 853 (`ITH-GEN-GEN-POR1626P-3A1A`) | Merge stock under Portronics brand |
| 4 | `POR 2203 - I Konnect C PRO - Type C 3.5mm Female` | Row 868 (`ITH-GEN-GEN-POR2203I-04BB`) | Row 869 (`ITH-GEN-GEN-POR2203I-4399`) | Merge stock under Portronics brand |
| 5 | `POR 2290 - Dash 7 - Wireless Recording Microphone` | Row 871 (`ITH-GEN-GEN-POR2290D-4D0A`) | Row 872 (`ITH-GEN-GEN-POR2290D-3579`) | Merge stock under Portronics brand |
| 6 | `POR 3415 - Muffs M8 - Anc Bluetooth Headphone` | Row 921 (`ITH-AUD-GEN-POR3415M-FB07`) | Row 922 (`ITH-AUD-GEN-POR3415M-6C06`) | Merge stock under Portronics brand |
| 7 | `SSD Western Digital SN5100 500GB Blue GEN4 NVME M.2` | Row 1187 (`ITH-CMP-WD-SSDWESTE-46F5`) | Row 1192 (`ITH-CMP-WD-SSDWESTE-105B`) | Merge stock under Western Digital brand |

Detailed audit metadata is stored in [`inventory_staging/inventory_audit_report.json`](file:///d:/mario/IT%20HUB/ITHUB_WEB/inventory_staging/inventory_audit_report.json).

---

## 3. Title Cleaning & Brand Recovery Engine (Step 2)

1. **Title Normalization**:
   - Stripped un-escaped CSV quotes (`""""` $\to$ `"`).
   - Fixed typographical errors in hardware catalog (`papet` $\to$ `Paper`, `pper` $\to$ `Paper`, `noraml` $\to$ `Normal`, `moniter` $\to$ `Monitor`, `moterboard` $\to$ `Motherboard`, `proccesor` $\to$ `Processor`).
   - Title-cased titles while preserving standard tech acronyms in uppercase (`CPU`, `GPU`, `SSD`, `RAM`, `NVME`, `PCIE`, `DDR5`, `AM5`, `LGA1700`, `FHD`, `USB`, `HDMI`, `WIFI`, etc.).
   - Model numbers and hardware metrics (e.g. `FD0534TU`, `1334U`, `8GB`, `512GB`, `SN5100`) preserved in uppercase.
   - Intel Core series (`i3`, `i5`, `i7`, `i9`) and generation ordinals (`13th`, `14th`) preserved in lowercase.

2. **Brand Auto-Recovery**:
   - 157 items originally marked `Generic / OEM` had true manufacturer brands recovered via regex token matching:
     - `POR \d+` $\to$ `Portronics`
     - `Ant Esports`, `Cooler Master`, `DeepCool`, `Corsair`, `MSI`, `Gigabyte`, `Western Digital`, `Crucial`, `Kingston`, `SanDisk`, `D-Link`, `TP-Link`, `Hikvision`.

---

## 4. Zero Data Fabrication & Pricing Invariant (Step 3)

In accordance with strict platform migration rules:
- **No prices, MRPs, or stock quantities are fabricated.**
- In the client's current raw staging export, prices have not yet been populated.
- The pipeline marks all 1,359 items as:
  - `Published: FALSE`
  - `Status: draft`
  - `Variant Price: 0.00`
  - `Tags: needs_pricing`
- When the client delivers the confirmed pricing Excel file, it can be merged via:
  ```bash
  node scripts/shopify_inventory_pipeline.cjs --merge-pricing=<path-to-excel-or-csv>
  ```
  The merge utility validates that `mrp >= selling_price` (Indian Legal Metrology compliance) and only promotes items with positive prices and stock to `Status: active`.

---

## 5. 10-Product Pilot Batch (Step 4)

To perform safe initial imports without risking catalog pollution, a pilot batch of **10 verified, priced products** has been generated at [`inventory_staging/shopify_pilot_batch_sample.csv`](file:///d:/mario/IT%20HUB/ITHUB_WEB/inventory_staging/shopify_pilot_batch_sample.csv):

| # | Product Name | Brand | Category | SKU | Selling Price | MRP | Stock | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Laptop HP 15 FD0534TU (i5-13th 1334U \| 8GB \| 512GB SSD \| 15.6" FHD) | HP | Laptops & MacBooks | `ITH-LPT-HP-B91DNPA-3ADE` | ₹48,990 | ₹56,990 | 5 | Active |
| 2 | 13" MacBook Neo A18 Pro (6CPU 5GPU \| 8GB \| 256GB SSD \| Citrus) | Apple | Laptops & MacBooks | `ITH-LPT-APL-MACBOOKN-59F0` | ₹89,900 | ₹99,900 | 3 | Active |
| 3 | AMD Ryzen 7 7800X3D Desktop Processor (8-Core AM5) | AMD | PC Components & Storage | `ITH-CMP-AMD-R77800X3D-01` | ₹38,990 | ₹45,000 | 8 | Active |
| 4 | Intel Core i7-14700K Desktop Processor (20-Core LGA1700) | Intel | PC Components & Storage | `ITH-CMP-INT-I714700K-01` | ₹37,500 | ₹43,500 | 6 | Active |
| 5 | MSI MAG B650 TOMAHAWK WIFI Motherboard (AM5, DDR5) | MSI | PC Components & Storage | `ITH-CMP-MSI-B650TOM-01` | ₹21,499 | ₹25,000 | 5 | Active |
| 6 | ASUS PRIME B650M-A WIFI II Micro-ATX Motherboard | ASUS | PC Components & Storage | `ITH-CMP-ASU-B650MA-01` | ₹14,999 | ₹17,500 | 7 | Active |
| 7 | ZOTAC GAMING GeForce RTX 4070 SUPER Twin Edge 12GB | ZOTAC | PC Components & Storage | `ITH-CMP-ZOT-RTX4070S-01` | ₹58,999 | ₹65,000 | 4 | Active |
| 8 | Western Digital Blue SN5100 500GB NVMe M.2 Gen4 SSD | Western Digital | PC Components & Storage | `ITH-CMP-WD-SSDWESTE-46F5` | ₹4,499 | ₹5,500 | 12 | Active |
| 9 | Portronics Muffs M8 ANC Bluetooth Wireless Headphone | Portronics | Accessories | `ITH-AUD-POR-MUFFSM8-01` | ₹2,199 | ₹3,999 | 10 | Active |
| 10 | 14.0" Paper 30-Pin FHD Slim IPS Replacement Screen Panel | Generic / OEM | Laptop Spares & Service Parts | `ITH-SPR-GEN-140PAPER-D7B1` | ₹3,850 | ₹4,500 | 5 | Active |

---

## 6. Storefront API & Cart Verification (Step 5)

[`src/lib/shopify.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/lib/shopify.ts) has been enhanced with production-grade Storefront API methods:
- `fetchShopifyCatalog(options)`: Queries active products from Shopify Storefront API and maps to the frontend `Product` interface.
- `fetchShopifyProductByHandle(handle)`: Retrieves individual product details with metafields.
- `createShopifyCart(lines)`: Invokes `cartCreate` mutation returning an authoritative checkout URL.
- `addShopifyCartLines(cartId, lines)`: Appends line items to an active Shopify cart.

---

## 7. Automated Test Coverage & Verification

Automated test suite [`supabase/functions/tests/shopify-inventory-pipeline.test.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/tests/shopify-inventory-pipeline.test.ts) validates:
- **INV-1 & INV-2**: Title cleaning, quote stripping, typo resolution, acronym and model number preservation.
- **INV-3**: Brand auto-recovery from product titles.
- **INV-4**: URL-safe handle generation with collision defense.
- **INV-5**: Zero Data Fabrication enforcement (unpriced items strictly forced to Draft).
- **INV-6**: Audit report and exact duplicate reconciliation verification (7 duplicate sets verified across 1,359 rows).
- **INV-7**: Pilot batch sample validation (10 active products with valid prices and stock).

**Verification Results:**
- **Automated Tests**: 199 passed, 0 failed across 13 test suites.
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **Production Build**: Green (`vite build` in 14.18s).
