export type AdminRecord = {
  id: string
  name: string
  detail: string
  value: string
  status: string
}
export const resourceDefinitions: Record<string, {
  title: string
  description: string
  labels: [string, string, string]
  statuses: string[]
  initial: AdminRecord[]
}> = {
  courier: {
    title: "Courier partners",
    description:
      "Manage illustrative courier options. No live courier API is connected.",
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
    description:
      "Moderation workspace. No individual customer reviews have been fabricated.",
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
}
export const chartData = [
  { month: "Apr", revenue: 62, orders: 21, services: 12 },
  { month: "May", revenue: 85, orders: 29, services: 17 },
  { month: "Jun", revenue: 76, orders: 25, services: 14 },
  { month: "Jul", revenue: 115, orders: 38, services: 21 },
  { month: "Aug", revenue: 104, orders: 34, services: 23 },
  { month: "Sep", revenue: 148, orders: 49, services: 28 },
]

// ── Bulk product import (CSV / XLSX) ──
export const importColumns = [
  "SKU",
  "Product Name",
  "Brand",
  "Category",
  "Subcategory",
  "Description",
  "Price",
  "Sale Price",
  "Cost Price",
  "Stock",
  "Low Stock Threshold",
  "Warranty",
  "Weight",
  "Status",
] as const
export const requiredImportColumns = [
  "SKU",
  "Product Name",
  "Brand",
  "Category",
  "Price",
  "Stock",
  "Status",
]
export const importTemplateRows = [
  {
    SKU: "ITH-SSD-001",
    "Product Name": "Samsung 990 EVO Plus 2TB",
    Brand: "Samsung",
    Category: "Storage",
    Subcategory: "NVMe SSD",
    Description: "PCIe 4.0 NVMe M.2 SSD",
    Price: 15999,
    "Sale Price": 13999,
    "Cost Price": 11500,
    Stock: 20,
    "Low Stock Threshold": 4,
    Warranty: "5 years",
    Weight: "0.05 kg",
    Status: "Active",
  },
]
export type ImportIssue = { level: "error" | "warning" message: string }
export type ImportRow = {
  row: number
  data: Record<string, string>
  issues: ImportIssue[]
  valid: boolean
}
const cell = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim()
/** Validate parsed sheet rows. Row numbers are spreadsheet rows (header = row 1). */
export const validateImportRows = (
  raw: Record<string, unknown>[],
  categories: string[],
  brands: string[],
): ImportRow[] => {
  const skuCount = new Map<string, number>()
  for (const item of raw) {
    const sku = cell(item.SKU).toLowerCase()
    if (sku) skuCount.set(sku, (skuCount.get(sku) || 0) + 1)
  }
  const lowerCategories = categories.map((name) => name.toLowerCase())
  const lowerBrands = brands.map((name) => name.toLowerCase())
  return raw.map((item, index) => {
    const data = Object.fromEntries(
      importColumns.map((key) => [key, cell(item[key])]),
    )
    const issues: ImportIssue[] = []
    const error = (message: string) => issues.push({ level: "error", message })
    const warn = (message: string) => issues.push({ level: "warning", message })
    for (const key of requiredImportColumns)
      if (!data[key]) error(`Missing ${key}`)
    const numeric = (key: string) => {
      if (!data[key]) return null
      const value = Number(data[key].replace(/[,₹\s]/g, ""))
      if (!Number.isFinite(value)) {
        error(`Invalid ${key.toLowerCase()} (must be a number)`)
        return null
      }
      return value
    }
    const price = numeric("Price")
    if (price !== null && price <= 0)
      error("Invalid price (must be greater than 0)")
    const sale = numeric("Sale Price")
    if (sale !== null && sale <= 0)
      error("Invalid sale price (must be greater than 0)")
    if (sale !== null && price !== null && sale > price)
      error("Sale price is higher than price")
    const cost = numeric("Cost Price")
    if (cost !== null && cost < 0) error("Invalid cost price (negative)")
    const stock = numeric("Stock")
    if (stock !== null && stock < 0) error("Invalid stock (negative)")
    else if (stock !== null && !Number.isInteger(stock))
      error("Invalid stock (must be a whole number)")
    const threshold = numeric("Low Stock Threshold")
    if (threshold !== null && (threshold < 0 || !Number.isInteger(threshold)))
      error("Invalid low stock threshold (whole number ≥ 0)")
    if (data.SKU && (skuCount.get(data.SKU.toLowerCase()) || 0) > 1)
      error(`Duplicate SKU in file (${data.SKU})`)
    if (data.Category && !lowerCategories.includes(data.Category.toLowerCase()))
      error(`Unknown category "${data.Category}"`)
    if (data.Brand && !lowerBrands.includes(data.Brand.toLowerCase()))
      warn(`Unknown brand "${data.Brand}" — will be added`)
    if (
      data.Status &&
      !["active", "draft", "archived"].includes(data.Status.toLowerCase())
    )
      error(`Invalid status "${data.Status}" (use Active, Draft or Archived)`)
    return {
      row: index + 2,
      data,
      issues,
      valid: !issues.some((issue) => issue.level === "error"),
    }
  })
}
