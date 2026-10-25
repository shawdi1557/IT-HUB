export type AdminRecord = {
  id: string;
  name: string;
  detail: string;
  value: string;
  status: string;
};
export const resourceDefinitions: Record<
  string,
  {
    title: string;
    description: string;
    labels: [string, string, string];
    statuses: string[];
    initial: AdminRecord[];
  }
> = {
  courier: {
    title: "Courier partners",
    description: "Manage illustrative courier options. No live courier API is connected.",
    labels: ["Partner name", "Coverage / notes", "Reference"],
    statuses: ["Active", "Inactive"],
    initial: [
      {
        id: "demo-courier",
        name: "Demo courier",
        detail: "Kerala · sample logistics provider",
        value: "No API connected",
        status: "Active",
      },
    ],
  },
  reviews: {
    title: "Customer feedback",
    description: "Moderation workspace. No individual customer reviews have been fabricated.",
    labels: ["Feedback reference", "Feedback text", "Product / service"],
    statuses: ["Pending", "Published", "Hidden"],
    initial: [],
  },
  compatibility: {
    title: "Compatibility rules",
    description:
      "Reference rules used by the PC builder. Core validation rules are fixed in this prototype.",
    labels: ["Rule name", "Requirement", "State"],
    statuses: ["Active"],
    initial: [
      {
        id: "socket",
        name: "CPU / motherboard socket",
        detail: "Socket identifiers must match",
        value: "Error on mismatch",
        status: "Active",
      },
      {
        id: "ram",
        name: "RAM generation",
        detail: "DDR4 / DDR5 must match the motherboard",
        value: "Error on mismatch",
        status: "Active",
      },
      {
        id: "psu",
        name: "Power headroom",
        detail: "Recommend 135% of estimated system load",
        value: "Warning if below recommended",
        status: "Active",
      },
      {
        id: "clearance",
        name: "GPU / case clearance",
        detail: "GPU length must be within cabinet clearance",
        value: "Error on mismatch",
        status: "Active",
      },
    ],
  },
};
export const chartData = [
  { month: "Apr", revenue: 62, orders: 21, services: 12 },
  { month: "May", revenue: 85, orders: 29, services: 17 },
  { month: "Jun", revenue: 76, orders: 25, services: 14 },
  { month: "Jul", revenue: 115, orders: 38, services: 21 },
  { month: "Aug", revenue: 104, orders: 34, services: 23 },
  { month: "Sep", revenue: 148, orders: 49, services: 28 },
];

// ── Bulk product import (CSV / XLSX) ──
export const importColumns = [
  "SKU",
  "Product Name",
  "Model Number",
  "Brand",
  "Category",
  "Subcategory",
  "Description",
  "MRP",
  "Price",
  "Sale Price",
  "Cost Price",
  "Stock",
  "Low Stock Threshold",
  "Warranty",
  "Weight",
  "Condition",
  "Second Hand",
  "Status",
] as const;

export const requiredImportColumns = ["Product Name", "Price"];

/**
 * Canonicalizes spreadsheet column headers to match IT HUB schema.
 * Handles variations from client Excel workbooks (e.g. "Selling Price" -> "Price", "M.R.P." -> "MRP", "Model No" -> "Model Number").
 */
export function canonicalizeImportHeader(header: string): string {
  const clean = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // SKU / Identifiers
  if (
    ["sku", "itemcode", "code", "barcode", "productcode", "partno", "partnumber"].includes(clean)
  ) {
    return "SKU";
  }
  if (["model", "modelnumber", "modelno", "mpn", "devicemodel", "modelmpn"].includes(clean)) {
    return "Model Number";
  }

  // Product Name
  if (
    [
      "productname",
      "product",
      "itemname",
      "item",
      "name",
      "title",
      "mobilename",
      "devicename",
      "particulars",
    ].includes(clean)
  ) {
    return "Product Name";
  }

  // Brand & Category
  if (["brand", "make", "manufacturer"].includes(clean)) return "Brand";
  if (["category", "dept", "department", "group"].includes(clean)) return "Category";
  if (["subcategory", "subcat", "subgroup", "type"].includes(clean)) return "Subcategory";

  // Pricing
  if (["mrp", "maxretailprice", "maximumretailprice"].includes(clean)) return "MRP";
  if (
    [
      "price",
      "sellingprice",
      "salesprice",
      "retailprice",
      "offerprice",
      "rate",
      "sp",
      "unitprice",
    ].includes(clean)
  )
    return "Price";
  if (
    ["saleprice", "promoprice", "promotionalprice", "discountprice", "discountedprice"].includes(
      clean,
    )
  )
    return "Sale Price";
  if (["costprice", "cost", "purchaseprice", "purchaserate", "cp"].includes(clean))
    return "Cost Price";

  // Inventory
  if (
    ["stock", "qty", "quantity", "availablestock", "inventory", "count", "balance"].includes(clean)
  )
    return "Stock";
  if (["lowstockthreshold", "lowstock", "reorderlevel", "minstock"].includes(clean))
    return "Low Stock Threshold";

  // Attributes
  if (["warranty", "guarantee"].includes(clean)) return "Warranty";
  if (["weight", "netweight"].includes(clean)) return "Weight";
  if (["condition", "itemcondition"].includes(clean)) return "Condition";
  if (["secondhand", "preowned", "issecondhand", "used"].includes(clean)) return "Second Hand";
  if (["status", "productstatus"].includes(clean)) return "Status";

  // Fallback to exact match in importColumns if casing differed
  const matched = importColumns.find((c) => c.toLowerCase() === header.trim().toLowerCase());
  return matched || header.trim();
}

export const importTemplateRows = [
  {
    SKU: "ITH-LPT-HP-15FD",
    "Product Name": 'HP 15-FD0534TU Laptop (i5-13th Gen, 8GB, 512GB SSD, 15.6" FHD)',
    "Model Number": "15-FD0534TU / B91DNPA",
    Brand: "HP",
    Category: "Laptops & MacBooks",
    Subcategory: "Laptops",
    Description: 'HP 15.6" Full HD Laptop with Windows 11 Home',
    MRP: 56999,
    Price: 49999,
    "Sale Price": 47999,
    "Cost Price": 44500,
    Stock: 8,
    "Low Stock Threshold": 2,
    Warranty: "1 year manufacturer warranty",
    Weight: "1.75 kg",
    Condition: "New",
    "Second Hand": "No",
    Status: "Active",
  },
  {
    SKU: "ITH-PHN-SMP-A15",
    "Product Name": "Samsung Galaxy A15 5G (8GB RAM, 128GB Storage, Blue)",
    "Model Number": "SM-A156E",
    Brand: "Samsung",
    Category: "Mobile Phones & Tablets",
    Subcategory: "Smartphones",
    Description: "Samsung Galaxy A15 5G with Super AMOLED 90Hz Display",
    MRP: 19499,
    Price: 16999,
    "Sale Price": 16499,
    "Cost Price": 14900,
    Stock: 15,
    "Low Stock Threshold": 3,
    Warranty: "1 year handset, 6 months accessories",
    Weight: "0.20 kg",
    Condition: "New",
    "Second Hand": "No",
    Status: "Active",
  },
  {
    SKU: "SH-PHN-APL-IP13",
    "Product Name": "Apple iPhone 13 128GB Midnight (Pre-Owned - Excellent Condition)",
    "Model Number": "MLPF3HN/A",
    Brand: "Apple",
    Category: "Mobile Phones & Tablets",
    Subcategory: "Smartphones",
    Description: "Pre-owned iPhone 13 128GB, fully tested with genuine parts",
    MRP: 59900,
    Price: 38500,
    "Sale Price": "",
    "Cost Price": 31000,
    Stock: 1,
    "Low Stock Threshold": 1,
    Warranty: "3 months store warranty",
    Weight: "0.17 kg",
    Condition: "Good",
    "Second Hand": "Yes",
    Status: "Draft",
  },
];

export interface ImportIssue {
  level: "error" | "warning";
  message: string;
}

export type ImportRow = {
  row: number;
  data: Record<string, string>;
  issues: ImportIssue[];
  valid: boolean;
};

const cell = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

/** Validate parsed sheet rows. Row numbers are spreadsheet rows (header = row 1). */
export const validateImportRows = (
  raw: Record<string, unknown>[],
  categories: string[],
  brands: string[],
): ImportRow[] => {
  const skuCount = new Map<string, number>();

  // Pre-scan SKUs for duplicate detection
  for (const item of raw) {
    let sku = cell(item.SKU).toLowerCase();
    if (!sku) {
      for (const [k, v] of Object.entries(item)) {
        if (canonicalizeImportHeader(k) === "SKU") {
          sku = cell(v).toLowerCase();
          break;
        }
      }
    }
    if (sku) skuCount.set(sku, (skuCount.get(sku) || 0) + 1);
  }

  const lowerCategories = categories.map((name) => name.toLowerCase());
  const lowerBrands = brands.map((name) => name.toLowerCase());

  return raw.map((item, index) => {
    // 1. Canonicalize raw headers into normalized keys
    const rawNormalized: Record<string, string> = {};
    for (const [key, val] of Object.entries(item)) {
      const canonical = canonicalizeImportHeader(key);
      const value = cell(val);
      if (!rawNormalized[canonical] || value.length > 0) {
        rawNormalized[canonical] = value;
      }
    }

    // 2. Build full data row with all canonical importColumns
    const data: Record<string, string> = {};
    for (const col of importColumns) {
      data[col] = rawNormalized[col] || "";
    }

    const issues: ImportIssue[] = [];
    const error = (message: string) => issues.push({ level: "error", message });
    const warn = (message: string) => issues.push({ level: "warning", message });

    // 3. Identifier Resolution: Either SKU or Model Number is required
    if (!data.SKU && data["Model Number"]) {
      const derived = `ITH-${data["Model Number"]
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 24)
        .toUpperCase()}`;
      data.SKU = derived;
      warn(`Missing SKU header — derived identifier "${derived}" from Model Number`);
    }

    if (!data.SKU && !data["Model Number"]) {
      error("Missing SKU or Model Number (at least one unique identifier is required)");
    } else if (data.SKU && (skuCount.get(data.SKU.toLowerCase()) || 0) > 1) {
      error(`Duplicate SKU in file (${data.SKU})`);
    }

    // 4. Product Name check
    if (!data["Product Name"]) {
      error("Missing Product Name");
    }

    // 5. Numeric helper
    const numeric = (key: string) => {
      if (!data[key]) return null;
      const value = Number(data[key].replace(/[,₹\s]/g, ""));
      if (!Number.isFinite(value)) {
        error(`Invalid ${key.toLowerCase()} (must be a number)`);
        return null;
      }
      return value;
    };

    // 6. Pricing Validations (Never invent prices!)
    const price = numeric("Price");
    if (price === null && !data.Price) {
      error("Missing selling price (Price is required and cannot be invented)");
    } else if (price !== null && price <= 0) {
      error("Invalid selling price (must be greater than 0)");
    }

    const mrp = numeric("MRP");
    if (mrp !== null && mrp <= 0) {
      error("Invalid MRP (must be greater than 0)");
    }
    if (mrp !== null && price !== null && mrp < price) {
      error(
        `Inconsistent pricing: stated MRP (₹${mrp}) cannot be lower than Selling Price (₹${price})`,
      );
    }

    const sale = numeric("Sale Price");
    if (sale !== null && sale <= 0) {
      error("Invalid sale price (must be greater than 0)");
    }
    if (sale !== null && price !== null && sale > price) {
      error("Sale price cannot be higher than regular selling price");
    }

    const cost = numeric("Cost Price");
    if (cost !== null && cost < 0) {
      error("Invalid cost price (cannot be negative)");
    }

    // 7. Inventory Validations (Never invent stock!)
    const stock = numeric("Stock");
    if (stock !== null) {
      if (stock < 0) error("Invalid stock (cannot be negative)");
      else if (!Number.isInteger(stock)) error("Invalid stock (must be a whole integer)");
    } else if (!data.Stock) {
      warn(
        "Missing stock quantity — will default to 0 (Out of stock) pending physical count verification",
      );
    }

    const threshold = numeric("Low Stock Threshold");
    if (threshold !== null && (threshold < 0 || !Number.isInteger(threshold))) {
      error("Invalid low stock threshold (whole number ≥ 0)");
    }

    // 8. Brand & Category Validation
    if (data.Brand) {
      if (!lowerBrands.includes(data.Brand.toLowerCase())) {
        warn(`Unknown brand "${data.Brand}" — will be added to brand index`);
      }
    } else {
      warn("Missing brand — product requires brand assignment");
    }

    if (data.Category) {
      if (!lowerCategories.includes(data.Category.toLowerCase())) {
        warn(`Category "${data.Category}" is not in current catalog taxonomy — requires review`);
      }
    } else {
      warn("Missing category — product will require category assignment");
    }

    // 9. Second-Hand & Condition Detection
    const isExplicitSecondHand =
      /yes|true|1/i.test(data["Second Hand"] || "") || data.SKU.toUpperCase().startsWith("SH-");
    const isPreOwnedCondition =
      data.Condition &&
      ["like new", "good", "fair", "for parts"].includes(data.Condition.toLowerCase());

    if (isExplicitSecondHand || isPreOwnedCondition) {
      data["Second Hand"] = "Yes";
      if (!data.Condition || data.Condition.toLowerCase() === "new") {
        data.Condition = "Good";
      }
      warn(
        "Second-hand listing detected — automated search disabled; physical photo upload required",
      );
    }

    // 10. Status Validation
    if (data.Status) {
      if (!["active", "draft", "archived"].includes(data.Status.toLowerCase())) {
        error(`Invalid status "${data.Status}" (use Active, Draft, or Archived)`);
      }
    } else {
      data.Status = "Draft";
      warn("Missing status — defaulting to Draft for catalog review");
    }

    return {
      row: index + 2,
      data,
      issues,
      valid: !issues.some((issue) => issue.level === "error"),
    };
  });
};
