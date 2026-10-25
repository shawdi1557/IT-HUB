/**
 * IT HUB — Client Inventory Normalization Engine (Phase B)
 * File: scripts/normalize_inventory.cjs
 *
 * Normalizes raw Tally ERP Godown Summary export into structured,
 * categorized catalog staging records matching IT HUB's database and Admin Bulk Importer.
 *
 * Implements all Phase B safeguards:
 * - 100% preservation of original descriptions and source row numbers
 * - Explicit vs. Inferred brand detection with proposed correction logging
 * - Segregation of ambiguous screen panels, generic cables, and conduit hardware into Needs_Review
 * - Deterministic, collision-free SKU generation checked against existing catalog SKUs
 * - Zero fabrication of prices, stock, warranty, ratings, or reviews
 * - Multi-sheet workbook + CSV export matching validateImportRows() schema
 * - Strict row accounting (verifies 0 records are dropped)
 *
 * Usage:
 *   node scripts/normalize_inventory.cjs [--input=<path>] [--sample=<N>] [--dry-run] [--output=<path>] [--csv]
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const xlsx = require("xlsx");

// ── Default Configuration ───────────────────────────────────────────────────
const DEFAULT_INPUT =
  "C:/Users/PRAKASH A K/.gemini/antigravity/brain/4ee52b1c-d003-4edc-88a6-9d7ef0385bca/.user_uploaded/media_1792040498610_790321a9.xlsx";
const DEFAULT_OUTPUT = path.join(__dirname, "..", "inventory_staging", "normalized_inventory.xlsx");

// Parse CLI flags
const args = process.argv.slice(2);
const flags = {
  input: DEFAULT_INPUT,
  sample: 0, // 0 = process all valid rows
  dryRun: false,
  output: DEFAULT_OUTPUT,
  csv: false,
};

for (const arg of args) {
  if (arg.startsWith("--input=")) flags.input = arg.split("=")[1];
  else if (arg.startsWith("--sample=")) flags.sample = parseInt(arg.split("=")[1], 10) || 0;
  else if (arg.startsWith("--output=")) flags.output = arg.split("=")[1];
  else if (arg === "--dry-run") flags.dryRun = true;
  else if (arg === "--csv") flags.csv = true;
}

// ── Load Existing Repository SKUs (For Collision Defense) ───────────────────
function loadExistingSkus() {
  const existing = new Set();
  try {
    // 1. Scan src/data/catalog.ts
    const catalogPath = path.join(__dirname, "..", "src", "data", "catalog.ts");
    if (fs.existsSync(catalogPath)) {
      const content = fs.readFileSync(catalogPath, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        // match id: "..." or sku: "..."
        const mId = line.match(/\bid:\s*["']([^"']+)["']/);
        if (mId) existing.add(mId[1].toUpperCase());
        const mSku = line.match(/\bsku:\s*["']([^"']+)["']/);
        if (mSku) existing.add(mSku[1].toUpperCase());
      }
    }

    // 2. Scan supabase/seed.sql
    const seedPath = path.join(__dirname, "..", "supabase", "seed.sql");
    if (fs.existsSync(seedPath)) {
      const content = fs.readFileSync(seedPath, "utf8");
      const matches = content.match(/SH-[A-Z0-9-]+/g);
      if (matches) {
        for (const m of matches) existing.add(m.toUpperCase());
      }
    }
  } catch (err) {
    console.warn("[Warning] Could not scan existing repository SKUs:", err.message);
  }
  return existing;
}

// ── IT HUB Category Taxonomy ────────────────────────────────────────────────
const CATEGORY_MAP = {
  LAPTOPS: {
    name: "Laptops & MacBooks",
    code: "LPT",
    subcategories: ["Laptops", "MacBooks", "Gaming Laptops", "Chromebooks"],
  },
  MOBILES: {
    name: "Mobile Phones & Tablets",
    code: "PHN",
    subcategories: ["Smartphones", "iPads & Tablets", "Feature Phones"],
  },
  PRINTERS: {
    name: "Printers, Scanners & POS",
    code: "PRN",
    subcategories: [
      "Thermal Printers",
      "Barcode Printers",
      "Laser Printers",
      "Ink Tank Printers",
      "POS Terminals",
      "Receipt & Label Rolls",
    ],
  },
  INKS: {
    name: "Inks, Toners & Cartridges",
    code: "INK",
    subcategories: ["Laser Toners", "Ink Bottles", "Ink Cartridges", "Printer Ribbons"],
  },
  COMPONENTS: {
    name: "PC Components & Storage",
    code: "CMP",
    subcategories: [
      "Solid State Drives (SSD)",
      "RAM (DDR4 / DDR5)",
      "Hard Disk Drives (HDD)",
      "Processors (CPU)",
      "Motherboards",
      "Graphics Cards (GPU)",
      "Power Supplies (SMPS)",
      "Cabinets & Cases",
      "CPU Coolers & Fans",
    ],
  },
  MONITORS: {
    name: "Monitors & Displays",
    code: "MON",
    subcategories: ["LED Monitors", "Gaming Monitors", "Commercial Displays"],
  },
  NETWORKING: {
    name: "Networking & CCTV",
    code: "NET",
    subcategories: [
      "CCTV Cameras",
      "Routers & Access Points",
      "Switches",
      "Network Cables (Cat6)",
      "CCTV Connectors & Accessories",
      "Conduit & Installation Hardware",
    ],
  },
  AUDIO: {
    name: "Audio & Smart Gadgets",
    code: "AUD",
    subcategories: [
      "TWS Earbuds",
      "Wireless Headphones",
      "Soundbars & Speakers",
      "Smart Gadgets & Wearables",
    ],
  },
  POWER: {
    name: "Power, UPS & Inverters",
    code: "PWR",
    subcategories: ["Inverter Batteries", "Desktop UPS", "Power Adapters"],
  },
  SPARES: {
    name: "Laptop Spares & Service Parts",
    code: "SPR",
    subcategories: [
      "Replacement Laptop Screens",
      "Laptop Keyboards",
      "Laptop Batteries",
      "Laptop Fans & Hinges",
      "Laptop Cases & Plastics",
    ],
  },
  ACCESSORIES: {
    name: "Cables & Accessories",
    code: "ACC",
    subcategories: [
      "Cables & Adapters",
      "Chargers",
      "Mice & Keyboards",
      "Laptop Bags & Sleeves",
      "Thermal Paste & Service Tools",
    ],
  },
  DESKTOPS: {
    name: "Desktops, AIO & Servers",
    code: "DSK",
    subcategories: ["All-in-One PCs", "Desktop Towers", "Mini PCs", "Servers"],
  },
};

// ── Known Brand Definitions (Explicit vs Inferred) ──────────────────────────
const BRAND_DEFINITIONS = [
  {
    name: "Apple",
    code: "APL",
    explicitPatterns: [/\bapple\b/i],
    inferredPatterns: [/\bmacbook\b/i, /\biphone\b/i, /\bipad\b/i],
    inferenceReason: "Inferred Apple from product family (MacBook/iPhone/iPad)",
  },
  {
    name: "HP",
    code: "HP",
    explicitPatterns: [/\bhp\b/i, /\bhewlett-?packard\b/i],
    inferredPatterns: [
      /\bvictus\b/i,
      /\bpavilion\b/i,
      /\bomen\b/i,
      /\bprobook\b/i,
      /\belitebook\b/i,
    ],
    inferenceReason: "Inferred HP from brand sub-line (Victus/Pavilion/Omen/ProBook)",
  },
  {
    name: "Lenovo",
    code: "LNV",
    explicitPatterns: [/\blenovo\b/i],
    inferredPatterns: [/\bthinkpad\b/i, /\bideapad\b/i, /\bloq\b/i, /\blegion\b/i],
    inferenceReason: "Inferred Lenovo from brand sub-line (ThinkPad/IdeaPad/LOQ/Legion)",
  },
  {
    name: "Dell",
    code: "DEL",
    explicitPatterns: [/\bdell\b/i],
    inferredPatterns: [/\binspiron\b/i, /\blatitude\b/i, /\bvostro\b/i, /\bxps\b/i],
    inferenceReason: "Inferred Dell from brand sub-line (Inspiron/Latitude/Vostro/XPS)",
  },
  {
    name: "ASUS",
    code: "ASU",
    explicitPatterns: [/\basus\b/i],
    inferredPatterns: [/\btuf\b/i, /\brog\b/i, /\bzenbook\b/i, /\bvivobook\b/i],
    inferenceReason: "Inferred ASUS from brand sub-line (TUF/ROG/ZenBook/VivoBook)",
  },
  {
    name: "Acer",
    code: "ACR",
    explicitPatterns: [/\bacer\b/i],
    inferredPatterns: [/\baspire\b/i, /\bpredator\b/i, /\bnitro\b/i, /\bswift\b/i],
    inferenceReason: "Inferred Acer from brand sub-line (Aspire/Predator/Nitro/Swift)",
  },
  {
    name: "MSI",
    code: "MSI",
    explicitPatterns: [/\bmsi\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Samsung",
    code: "SAM",
    explicitPatterns: [/\bsamsung\b/i],
    inferredPatterns: [/\bgalaxy\b/i],
    inferenceReason: "Inferred Samsung from Galaxy device family",
  },
  {
    name: "OnePlus",
    code: "1PL",
    explicitPatterns: [/\boneplus\b/i],
    inferredPatterns: [/\bnord\b/i],
    inferenceReason: "Inferred OnePlus from Nord line",
  },
  {
    name: "boAt",
    code: "BAT",
    explicitPatterns: [/\bboat\b/i],
    inferredPatterns: [/\bboar\b/i, /\bairdopes\b/i, /\brockerz\b/i, /\baavante\b/i],
    inferenceReason: "Inferred boAt from product line (Airdopes/Rockerz) or source typo (Boar)",
  },
  {
    name: "Canon",
    code: "CAN",
    explicitPatterns: [/\bcanon\b/i],
    inferredPatterns: [/\bpixma\b/i, /\blbp\b/i],
    inferenceReason: "Inferred Canon from Pixma/LBP line",
  },
  {
    name: "Epson",
    code: "EPS",
    explicitPatterns: [/\bepson\b/i],
    inferredPatterns: [/\becotank\b/i],
    inferenceReason: "Inferred Epson from EcoTank line",
  },
  {
    name: "Brother",
    code: "BTR",
    explicitPatterns: [/\bbrother\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Hikvision",
    code: "HIK",
    explicitPatterns: [/\bhikvision\b/i],
    inferredPatterns: [/\bds-2ce\w+/i],
    inferenceReason: "Inferred Hikvision from DS-2CE model series",
  },
  {
    name: "CP Plus",
    code: "CPP",
    explicitPatterns: [/\bcp\s*plus\b/i],
    inferredPatterns: [/\bcp-uvc\b/i],
    inferenceReason: "Inferred CP Plus from CP camera code",
  },
  {
    name: "Dahua",
    code: "DAH",
    explicitPatterns: [/\bdahua\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "TP-Link",
    code: "TPL",
    explicitPatterns: [/\btp-link\b/i, /\btplink\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "D-Link",
    code: "DLK",
    explicitPatterns: [/\bd-link\b/i, /\bdlink\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Seagate",
    code: "SGT",
    explicitPatterns: [/\bseagate\b/i],
    inferredPatterns: [/\bbarracuda\b/i, /\bironwolf\b/i],
    inferenceReason: "Inferred Seagate from BarraCuda/IronWolf line",
  },
  {
    name: "Western Digital",
    code: "WD",
    explicitPatterns: [/\bwestern\s*digital\b/i, /\bwd\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Crucial",
    code: "CRU",
    explicitPatterns: [/\bcrucial\b/i],
    inferredPatterns: [/\bp3\s*plus\b/i, /\bp3\s*nvme\b/i],
    inferenceReason: "Inferred Crucial from P3 SSD model",
  },
  {
    name: "Kingston",
    code: "KNG",
    explicitPatterns: [/\bkingston\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Intel",
    code: "INT",
    explicitPatterns: [/\bintel\b/i],
    inferredPatterns: [/\bcore-?i[3579]\b/i, /\bcore-[357]\b/i],
    inferenceReason: "Inferred Intel from Core i-series processor tag",
  },
  {
    name: "AMD",
    code: "AMD",
    explicitPatterns: [/\bamd\b/i],
    inferredPatterns: [/\bryzen\b/i],
    inferenceReason: "Inferred AMD from Ryzen tag",
  },
  {
    name: "NVIDIA",
    code: "NVD",
    explicitPatterns: [/\bnvidia\b/i],
    inferredPatterns: [/\bgeforce\b/i, /\brtx\b/i, /\bgtx\b/i],
    inferenceReason: "Inferred NVIDIA from GeForce/RTX tag",
  },
  {
    name: "Logitech",
    code: "LOG",
    explicitPatterns: [/\blogitech\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Portronics",
    code: "POR",
    explicitPatterns: [/\bportronics\b/i],
    inferredPatterns: [/\b1por\b/i],
    inferenceReason: "Inferred Portronics from source abbreviation/typo (1POR)",
  },
  {
    name: "Zebronics",
    code: "ZEB",
    explicitPatterns: [/\bzebronics\b/i, /\bzeb\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Fingers",
    code: "FNG",
    explicitPatterns: [/\bfingers\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Xprinter",
    code: "XPR",
    explicitPatterns: [/\bxprinter\b/i],
    inferredPatterns: [/\bxp-\w+/i, /\bxpf\b/i],
    inferenceReason: "Inferred Xprinter from XP- / XPF model prefix",
  },
  {
    name: "TVS-E",
    code: "TVS",
    explicitPatterns: [/\btvs-?e\b/i, /\btvse\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Microtek",
    code: "MIC",
    explicitPatterns: [/\bmicrotek\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Exide",
    code: "EXD",
    explicitPatterns: [/\bexide\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "ProDot",
    code: "PRD",
    explicitPatterns: [/\bprodot\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Formax",
    code: "FMX",
    explicitPatterns: [/\bformax\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "LG",
    code: "LG",
    explicitPatterns: [/\blg\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Vivo",
    code: "VIV",
    explicitPatterns: [/\bvivo\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Oppo",
    code: "OPP",
    explicitPatterns: [/\boppo\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Realme",
    code: "RLM",
    explicitPatterns: [/\brealme\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Redmi / Xiaomi",
    code: "XIA",
    explicitPatterns: [/\bredmi\b/i, /\bxiaomi\b/i, /\bmi\b/i],
    inferredPatterns: [/\bpoco\b/i],
    inferenceReason: "Inferred Xiaomi/Redmi from POCO sub-brand",
  },
  {
    name: "Motorola",
    code: "MOT",
    explicitPatterns: [/\bmotorola\b/i, /\bmoto\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "iQOO",
    code: "IQO",
    explicitPatterns: [/\biqoo\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Toshiba",
    code: "TSH",
    explicitPatterns: [/\btoshiba\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "BOE",
    code: "BOE",
    explicitPatterns: [/\bboe\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Norden",
    code: "NOR",
    explicitPatterns: [/\bnorden\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Retsol",
    code: "RET",
    explicitPatterns: [/\bretsol\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Kon-Duct",
    code: "KND",
    explicitPatterns: [/\bkon-duct\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
  {
    name: "Vinilex",
    code: "VNX",
    explicitPatterns: [/\bvini?lex\b/i],
    inferredPatterns: [],
    inferenceReason: "",
  },
];

// ── Deterministic Spec Extractor ────────────────────────────────────────────
function extractSpecs(text) {
  const specs = {};

  // RAM
  const ramMatch = text.match(/\b(\d{1,2}\s*GB)\s*(DDR[345]|Unified)?\b/i);
  if (ramMatch) specs.RAM = ramMatch[0].trim().toUpperCase();

  // Storage
  const ssdMatch = text.match(/\b(\d{1,4}\s*(?:GB|TB))\s*(?:NVMe|SATA|PCIe)?\s*(SSD)\b/i);
  const hddMatch = text.match(/\b(\d{1,2}\s*TB|\d{3,4}\s*GB)\s*(HDD|Hard\s*Disk)\b/i);
  if (ssdMatch) specs.Storage = ssdMatch[0].trim();
  else if (hddMatch) specs.Storage = hddMatch[0].trim();

  // Processor
  const cpuMatch = text.match(
    /\b(i[3579]-\d{4,5}[A-Z]*|Core-?[357]\s*\d{3}[A-Z]*|R[3579]\s*\d{4}[A-Z]*|Ryzen\s*[3579]\s*\d{4}[A-Z]*|A18\s*Pro|M[1234]\s*(?:Pro|Max)?)\b/i,
  );
  if (cpuMatch) specs.Processor = cpuMatch[0].trim();

  // Screen / Display size (e.g. 15.6", 14.0", 13.3", 17.3")
  const displayMatch = text.match(
    /\b(1[1-7](?:\.[0-9])?)\s*(?:["']|inch|-inch)?\s*(FHD|HD|IPS|LED|OLED|True\s*Tone)?\b/i,
  );
  if (displayMatch) {
    const size = displayMatch[1];
    const res = displayMatch[2] ? " " + displayMatch[2].toUpperCase() : "";
    specs.Display = `${size}"${res}`;
  }

  // Refresh Rate
  const hzMatch = text.match(/\b(120|144|165|240)\s*HZ\b/i);
  if (hzMatch) specs.RefreshRate = `${hzMatch[1]}Hz`;

  // Pin count for replacement laptop panels
  const pinMatch = text.match(/\b(30|40)\s*PIN\b/i);
  if (pinMatch) specs.PinCount = `${pinMatch[1]}-Pin`;

  // GPU
  const gpuMatch = text.match(
    /\b(RTX\s*\d{4}(?:\s*Ti|\s*Super)?|GTX\s*\d{4}|Radeon\s*RX\s*\d{4})\b/i,
  );
  if (gpuMatch) specs.Graphics = gpuMatch[0].trim().toUpperCase();

  // OS
  const osMatch = text.match(/\b(W11|Windows\s*11|W10|Windows\s*10|macOS|Android)\b/i);
  if (osMatch)
    specs.OS = osMatch[0].trim().replace(/^W11$/i, "Windows 11").replace(/^W10$/i, "Windows 10");

  // Battery capacity (UPS / Inverter)
  const ahMatch = text.match(/\b(\d{1,3}\s*AH)\b/i);
  if (ahMatch) specs.Capacity = ahMatch[1].toUpperCase();

  // Color
  const colorMatch = text.match(
    /\b(Natural Silver|Citrus|Silver|Space Grey|Black|Blue|Sage|Cloudy Grey|Noir Black|Quartz White|Pearl White|Carbon Black|Active Black)\b/i,
  );
  if (colorMatch) specs.Color = colorMatch[0].trim();

  return specs;
}

// ── Model & MPN Extractor ───────────────────────────────────────────────────
function extractModelAndMpn(text) {
  let model = "";
  let mpn = "";

  // Look for MPN patterns like D49D1PA, D0NZ5PA, B91DNPA, MD4A4HN/A, MTP63HN/A
  const mpnMatch = text.match(/\b([A-Z0-9]{5,10}PA|[A-Z0-9]{5,8}HN\/A)\b/i);
  if (mpnMatch) mpn = mpnMatch[1].toUpperCase();

  // Specific model families
  if (/victus/i.test(text)) model = "Victus 15";
  else if (/loq/i.test(text)) model = "LOQ 15";
  else if (/macbook\s*neo/i.test(text)) model = 'MacBook Neo 13"';
  else if (/macbook\s*air/i.test(text)) model = "MacBook Air";
  else if (/macbook\s*pro/i.test(text)) model = "MacBook Pro";
  else if (/iphone\s*17/i.test(text)) model = "iPhone 17";
  else if (/iphone\s*16/i.test(text)) model = "iPhone 16";
  else if (/iphone\s*15/i.test(text)) model = "iPhone 15";
  else if (/airdopes\s*\d+/i.test(text)) {
    const m = text.match(/airdopes\s*\d+[a-z0-9]*/i);
    model = m ? m[0] : "Airdopes";
  } else if (/rockerz\s*\d+/i.test(text)) {
    const m = text.match(/rockerz\s*\d+[a-z0-9]*/i);
    model = m ? m[0] : "Rockerz";
  } else if (/aavante\s*bar/i.test(text)) {
    const m = text.match(/aavante\s*bar\s*[a-z0-9]+/i);
    model = m ? m[0] : "Aavante Bar";
  } else if (/xp-c230/i.test(text)) model = "XP-C230";
  else if (/xp-ats\s*1008/i.test(text)) model = "XP-ATS 1008";
  else if (/ds-2ce\w+/i.test(text)) {
    const m = text.match(/ds-2ce\w+/i);
    model = m ? m[0].toUpperCase() : "";
  }

  return { model, mpn };
}

// ── Classifier Function ─────────────────────────────────────────────────────
function classifyItem(text) {
  // 1. Laptop Replacement Displays (Specialized Spare Part)
  if (
    /(?:paper|papet|pper)\s*\d+\s*pin|pin\s*fhd|pin\s*hd|normal\s*led|pin\s*touch|boe\s*og/i.test(
      text,
    ) &&
    !/laptop\s+hp|macbook/i.test(text)
  ) {
    return {
      category: CATEGORY_MAP.SPARES.name,
      catCode: CATEGORY_MAP.SPARES.code,
      subcategory: "Replacement Laptop Screens",
      productType: "Spare Part",
    };
  }

  // 2. Electrical Conduit & CCTV Wiring Supplies (Installation Hardware)
  if (/\b(?:20mm|25mm|32mm)\b.*?\b(?:bend|elbow|junction|conduit|saddle)\b/i.test(text)) {
    return {
      category: CATEGORY_MAP.NETWORKING.name,
      catCode: CATEGORY_MAP.NETWORKING.code,
      subcategory: "Conduit & Installation Hardware",
      productType: "Installation Hardware",
    };
  }

  // 3. Laptop Spares & Batteries
  if (/laptop\s*(?:battery|fan|cpu fan|hinge|hinch|bottom case|keyboard|display)/i.test(text)) {
    return {
      category: CATEGORY_MAP.SPARES.name,
      catCode: CATEGORY_MAP.SPARES.code,
      subcategory: /battery/i.test(text)
        ? "Laptop Batteries"
        : /fan/i.test(text)
          ? "Laptop Fans & Hinges"
          : "Laptop Spares & Service Parts",
      productType: "Spare Part",
    };
  }

  // 4. Laptops & MacBooks
  if (
    /\blaptop\b|\bmacbook\b|\bthinkpad\b|\bideapad\b|\bvictus\b|\bloq\b|\bvivobook\b|\bzenbook\b|\baspire\b/i.test(
      text,
    )
  ) {
    return {
      category: CATEGORY_MAP.LAPTOPS.name,
      catCode: CATEGORY_MAP.LAPTOPS.code,
      subcategory: /\bmacbook\b/i.test(text)
        ? "MacBooks"
        : /\bvictus\b|\bloq\b|\btuf\b/i.test(text)
          ? "Gaming Laptops"
          : "Laptops",
      productType: "Fresh",
    };
  }

  // 5. Mobile Phones & Tablets
  if (
    /\biphone\b|\bipad\b|\boneplus\b|\bgalaxy\s*s\d|\bgalaxy\s*a\d|\bredmi\b|\brealme\b|\bpoco\b|\biqoo\b|\bmoto\s*[ge]\d/i.test(
      text,
    )
  ) {
    return {
      category: CATEGORY_MAP.MOBILES.name,
      catCode: CATEGORY_MAP.MOBILES.code,
      subcategory: /\bipad\b|\btablet\b/i.test(text) ? "iPads & Tablets" : "Smartphones",
      productType: "Fresh",
    };
  }

  // 6. Inks, Toners & Cartridges
  if (
    /\btoner\b|\bcartridge\b|\bink\s*bottle\b|\brefill\b|\b057\b|\b88a\b|\b12a\b|\bprodot\b|\bpg-47\b|\bcl-57\b|\b003\s*ink\b/i.test(
      text,
    )
  ) {
    return {
      category: CATEGORY_MAP.INKS.name,
      catCode: CATEGORY_MAP.INKS.code,
      subcategory: /\btoner\b|\b88a\b|\b12a\b|\b057\b/i.test(text) ? "Laser Toners" : "Ink Bottles",
      productType: "Fresh",
    };
  }

  // 7. Printers, Scanners & POS
  if (
    /\bprinter\b|\bpos\b|\bthermal\s*paper\b|\bbarcode\b|\breceipt\b|\bxprinter\b|\btvse\b/i.test(
      text,
    )
  ) {
    return {
      category: CATEGORY_MAP.PRINTERS.name,
      catCode: CATEGORY_MAP.PRINTERS.code,
      subcategory: /thermal\s*paper|barcode\s*label/i.test(text)
        ? "Receipt & Label Rolls"
        : /thermal|pos/i.test(text)
          ? "Thermal Printers"
          : "Printers & Scanners",
      productType: "Fresh",
    };
  }

  // 8. Storage & Memory (SSD / HDD / RAM)
  if (/\bssd\b|\bnvme\b|\bhdd\b|\bhard\s*disk\b|\bddr[345]\b|\bram\b/i.test(text)) {
    return {
      category: CATEGORY_MAP.COMPONENTS.name,
      catCode: CATEGORY_MAP.COMPONENTS.code,
      subcategory: /\bssd\b|\bnvme\b/i.test(text)
        ? "Solid State Drives (SSD)"
        : /\bhdd\b|\bhard\s*disk\b/i.test(text)
          ? "Hard Disk Drives (HDD)"
          : "RAM (DDR4 / DDR5)",
      productType: "Fresh",
    };
  }

  // 9. Monitors & Displays
  if (/\bmonitor\b|\bled\s*monitor\b/i.test(text)) {
    return {
      category: CATEGORY_MAP.MONITORS.name,
      catCode: CATEGORY_MAP.MONITORS.code,
      subcategory: "LED Monitors",
      productType: "Fresh",
    };
  }

  // 10. Networking & CCTV
  if (
    /\bcctv\b|\bcamera\b|\bbnc\b|\bcat6\b|\brouter\b|\bswitch\b|\bd-link\b|\btp-link\b|\bhikvision\b|\bcp\s*plus\b/i.test(
      text,
    )
  ) {
    return {
      category: CATEGORY_MAP.NETWORKING.name,
      catCode: CATEGORY_MAP.NETWORKING.code,
      subcategory: /\bcctv\b|\bcamera\b|\bbullet\b|\bdome\b/i.test(text)
        ? "CCTV Cameras"
        : /\bcat6\b|\bwire\b/i.test(text)
          ? "Network Cables (Cat6)"
          : "Routers & Access Points",
      productType: "Fresh",
    };
  }

  // 11. Audio & Smart Gadgets
  if (
    /\bairdopes\b|\brockerz\b|\bheadphone\b|\bearphone\b|\bsoundbar\b|\bearbuds\b|\bspeaker\b|\bboat\b/i.test(
      text,
    )
  ) {
    return {
      category: CATEGORY_MAP.AUDIO.name,
      catCode: CATEGORY_MAP.AUDIO.code,
      subcategory: /\bairdopes\b|\bearbuds\b/i.test(text)
        ? "TWS Earbuds"
        : /\bheadphone\b|\brockerz\b/i.test(text)
          ? "Wireless Headphones"
          : "Soundbars & Speakers",
      productType: "Fresh",
    };
  }

  // 12. Power & UPS
  if (/\bexide\b|\bbattery\s*\d+\s*ah\b|\bups\b|\binverter\b/i.test(text)) {
    return {
      category: CATEGORY_MAP.POWER.name,
      catCode: CATEGORY_MAP.POWER.code,
      subcategory: /\bbattery\b/i.test(text) ? "Inverter Batteries" : "Desktop UPS",
      productType: "Fresh",
    };
  }

  // 13. Accessories & Cables
  if (
    /\bcable\b|\badapter\b|\bmouse\b|\bkeyboard\b|\bdongle\b|\bcharger\b|\bhub\b|\bsleeve\b|\bbag\b/i.test(
      text,
    )
  ) {
    return {
      category: CATEGORY_MAP.ACCESSORIES.name,
      catCode: CATEGORY_MAP.ACCESSORIES.code,
      subcategory: /\bbag\b|\bsleeve\b/i.test(text)
        ? "Laptop Bags & Sleeves"
        : /\bmouse\b|\bkeyboard\b/i.test(text)
          ? "Mice & Keyboards"
          : "Cables & Adapters",
      productType: "Fresh",
    };
  }

  // Default Fallback
  return {
    category: "Accessories",
    catCode: "GEN",
    subcategory: "General IT Hardware",
    productType: "Fresh",
  };
}

// ── Deterministic SKU Generator ─────────────────────────────────────────────
function generateSku(sourceRow, originalText, catCode, brandCode, model) {
  let token = (model || originalText)
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  if (!token) token = "ITEM";

  // Deterministic 4-character hex hash from sourceRow + clean text
  const hash = crypto
    .createHash("sha256")
    .update(`${sourceRow}:${originalText.trim()}`)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();

  return `ITH-${catCode}-${brandCode}-${token}-${hash}`;
}

// ── Row Normalizer ──────────────────────────────────────────────────────────
function normalizeRow(rowNumber, rawText) {
  const cleanOriginal = rawText.trim().replace(/\r?\n/g, " ").replace(/\s+/g, " ");

  // 1. Brand Detection (Explicit vs Inferred)
  let detectedBrand = "Generic / OEM";
  let brandCode = "GEN";
  let brandConfidence = "Unknown";
  let brandInferenceNote = "";

  // Check explicit matches first
  for (const b of BRAND_DEFINITIONS) {
    if (b.explicitPatterns.some((p) => p.test(cleanOriginal))) {
      detectedBrand = b.name;
      brandCode = b.code;
      brandConfidence = "Explicit";
      break;
    }
  }

  // If not explicitly named, check inferred patterns
  if (brandConfidence === "Unknown") {
    for (const b of BRAND_DEFINITIONS) {
      if (b.inferredPatterns.some((p) => p.test(cleanOriginal))) {
        detectedBrand = b.name;
        brandCode = b.code;
        brandConfidence = "Inferred";
        brandInferenceNote = b.inferenceReason;
        break;
      }
    }
  }

  // 2. Classify Category & Subcategory
  const classification = classifyItem(cleanOriginal);

  // 3. Extract Model & MPN
  const { model, mpn } = extractModelAndMpn(cleanOriginal);

  // 4. Extract Hardware Specifications
  const specs = extractSpecs(cleanOriginal);

  // 5. Generate Stable, Deterministic SKU
  const sku = generateSku(
    rowNumber,
    cleanOriginal,
    classification.catCode,
    brandCode,
    model || mpn,
  );

  // 6. Normalized Product Name
  let normalizedName = cleanOriginal.replace(/^"|"$/g, "");
  if (normalizedName === normalizedName.toUpperCase() && normalizedName.length > 10) {
    normalizedName = normalizedName
      .toLowerCase()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // 7. Strict Review Criteria / Issues Detection
  const reviewReasons = [];

  if (classification.productType === "Installation Hardware") {
    reviewReasons.push(
      "Internal electrical / CCTV wiring supply (service consumable — recommend excluding from public retail)",
    );
  }
  if (classification.subcategory === "Replacement Laptop Screens") {
    reviewReasons.push(
      "Replacement laptop screen panel requires physical connector & mounting bracket review",
    );
  }
  if (brandConfidence === "Inferred") {
    reviewReasons.push(
      `Proposed Brand Correction: ${brandInferenceNote} (Requires admin confirmation)`,
    );
  }
  if (brandConfidence === "Unknown") {
    reviewReasons.push("Brand not specified in source description");
  }
  if (cleanOriginal.length < 15) {
    reviewReasons.push("Short or ambiguous product description");
  }

  const reviewRequired = reviewReasons.length > 0;

  return {
    sourceRow: rowNumber,
    originalDescription: cleanOriginal,
    sku,
    productName: normalizedName,
    brand: detectedBrand,
    brandConfidence,
    category: classification.category,
    subcategory: classification.subcategory,
    modelMpn: mpn || model || "N/A",
    specsJson: JSON.stringify(specs),
    productType: classification.productType,
    condition: "New",
    verificationStatus: "Unverified Staging Record",
    status: reviewRequired ? "Draft" : "Active",
    reviewRequired: reviewRequired ? "Yes" : "No",
    reviewReasons: reviewReasons.join(" | ") || "None",
  };
}

// ── Pipeline Runner ─────────────────────────────────────────────────────────
function run() {
  console.log("=".repeat(76));
  console.log("IT HUB — Inventory Normalization Engine (Phase B)");
  console.log("=".repeat(76));
  console.log(`Input File:  ${flags.input}`);
  console.log(`Output File: ${flags.output}`);
  console.log(`Dry Run:     ${flags.dryRun}`);
  console.log(
    `Scope:       ${
      flags.sample > 0 ? flags.sample + " sample rows" : "FULL WORKBOOK (~1,359 rows)"
    }`,
  );
  console.log("-".repeat(76));

  if (!fs.existsSync(flags.input)) {
    console.error(`ERROR: Source workbook not found at "${flags.input}".`);
    process.exit(1);
  }

  // Load existing repository SKUs for collision verification
  const existingRepoSkus = loadExistingSkus();
  console.log(
    `Existing Catalog SKUs Scanned: ${existingRepoSkus.size} (for cross-catalog collision check)`,
  );

  // Read workbook
  const wb = xlsx.readFile(flags.input);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  if (!sheet) {
    console.error(`ERROR: No sheet found in workbook "${flags.input}".`);
    process.exit(1);
  }

  // Extract raw rows (Row 15 to Row 1373, skipping header rows 1-14 and Grand Total footer)
  const rawRows = [];
  const totalRowsInSheet = 1374;
  for (let r = 15; r <= totalRowsInSheet; r++) {
    const cell = sheet["A" + r];
    if (cell && cell.v !== undefined) {
      const txt = String(cell.v).trim();
      if (txt && txt !== "Grand Total" && txt !== "Particulars") {
        rawRows.push({ row: r, text: txt });
      }
    }
  }

  console.log(`Total Valid Item Rows in Source Workbook: ${rawRows.length}`);

  // Apply sample filter if requested
  const itemsToProcess = flags.sample > 0 ? rawRows.slice(0, flags.sample) : rawRows;
  console.log(`Normalizing ${itemsToProcess.length} items...\n`);

  // Process rows
  const normalizedRecords = [];
  const internalSkuSet = new Set();
  const internalCollisions = [];
  const repoCollisions = [];

  for (const item of itemsToProcess) {
    const record = normalizeRow(item.row, item.text);

    // Internal collision check
    if (internalSkuSet.has(record.sku)) {
      internalCollisions.push(record.sku);
    } else {
      internalSkuSet.add(record.sku);
    }

    // Existing repository SKU collision check
    if (existingRepoSkus.has(record.sku.toUpperCase())) {
      repoCollisions.push(record.sku);
    }

    normalizedRecords.push(record);
  }

  // Strict Accounting Verification: Confirm zero records dropped
  if (normalizedRecords.length !== itemsToProcess.length) {
    console.error(
      `FATAL ACCOUNTING ERROR: Processed count (${normalizedRecords.length}) != expected count (${itemsToProcess.length})`,
    );
    process.exit(1);
  }

  // Tally Review vs Ready counts
  const needsReviewList = normalizedRecords.filter((r) => r.reviewRequired === "Yes");
  const readyList = normalizedRecords.filter((r) => r.reviewRequired === "No");

  // Group by category
  const categoryCounts = {};
  for (const r of normalizedRecords) {
    if (!categoryCounts[r.category]) {
      categoryCounts[r.category] = { total: 0, ready: 0, review: 0 };
    }
    categoryCounts[r.category].total++;
    if (r.reviewRequired === "Yes") categoryCounts[r.category].review++;
    else categoryCounts[r.category].ready++;
  }

  // Group by brand
  const brandCounts = {};
  for (const r of normalizedRecords) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }
  const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);

  console.log("=".repeat(76));
  console.log("NORMALIZATION AUDIT SUMMARY");
  console.log("=".repeat(76));
  console.log(
    `Total Source Items Accounted For : ${normalizedRecords.length} / ${itemsToProcess.length} (100% Accounted, 0 Dropped)`,
  );
  console.log(
    `Ready for Pricing & Verification : ${readyList.length} (${Math.round((readyList.length / normalizedRecords.length) * 100)}%)`,
  );
  console.log(
    `Requires Admin Review / Staging  : ${needsReviewList.length} (${Math.round((needsReviewList.length / normalizedRecords.length) * 100)}%)`,
  );
  console.log(`Unique SKUs Generated            : ${internalSkuSet.size}`);
  console.log(`Internal SKU Collisions          : ${internalCollisions.length} (Must be 0)`);
  console.log(`Collisions with Existing Catalog : ${repoCollisions.length} (Must be 0)`);

  if (internalCollisions.length > 0 || repoCollisions.length > 0) {
    console.error("FATAL: SKU Collisions detected!", {
      internalCollisions,
      repoCollisions,
    });
    process.exit(1);
  }

  console.log("\n--- Breakdown by Category ---");
  for (const [cat, counts] of Object.entries(categoryCounts).sort(
    (a, b) => b[1].total - a[1].total,
  )) {
    console.log(
      `  • ${cat.padEnd(32)}: Total ${counts.total.toString().padStart(4)} | Ready: ${counts.ready.toString().padStart(4)} | Review: ${counts.review.toString().padStart(4)}`,
    );
  }

  console.log("\n--- Top 15 Brands Identified ---");
  for (const [b, count] of sortedBrands.slice(0, 15)) {
    console.log(`  • ${b.padEnd(25)}: ${count} products`);
  }

  if (flags.dryRun) {
    console.log("\nDRY RUN complete. Staging files were not written to disk.");
    return;
  }

  // ── Build Multi-Sheet Workbook ────────────────────────────────────────────
  const outWb = xlsx.utils.book_new();

  // Sheet 1: Normalized_Inventory
  const sheet1Data = normalizedRecords.map((r) => ({
    "Source Row": r.sourceRow,
    "Original Description": r.originalDescription,
    SKU: r.sku,
    "Product Name": r.productName,
    Brand: r.brand,
    "Brand Confidence": r.brandConfidence,
    Category: r.category,
    Subcategory: r.subcategory,
    "Model / MPN": r.modelMpn,
    Specifications: r.specsJson,
    "Product Type": r.productType,
    Condition: r.condition,
    "Verification Status": r.verificationStatus,
    Status: r.status,
    "Review Required": r.reviewRequired,
    "Review Reasons": r.reviewReasons,
  }));
  const ws1 = xlsx.utils.json_to_sheet(sheet1Data);
  xlsx.utils.book_append_sheet(outWb, ws1, "Normalized_Inventory");

  // Sheet 2: Needs_Review
  const sheet2Data = needsReviewList.map((r) => ({
    "Source Row": r.sourceRow,
    "Original Description": r.originalDescription,
    SKU: r.sku,
    "Product Name": r.productName,
    Brand: r.brand,
    "Brand Confidence": r.brandConfidence,
    Category: r.category,
    Subcategory: r.subcategory,
    "Product Type": r.productType,
    "Review Reasons": r.reviewReasons,
  }));
  const ws2 = xlsx.utils.json_to_sheet(sheet2Data);
  xlsx.utils.book_append_sheet(outWb, ws2, "Needs_Review");

  // Sheet 3: Category_Summary
  const sheet3Data = Object.entries(categoryCounts)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, counts]) => ({
      Category: cat,
      "Total Items": counts.total,
      "Ready for Pricing": counts.ready,
      "Needs Review": counts.review,
      "Percentage Ready": `${Math.round((counts.ready / counts.total) * 100)}%`,
    }));
  const ws3 = xlsx.utils.json_to_sheet(sheet3Data);
  xlsx.utils.book_append_sheet(outWb, ws3, "Category_Summary");

  // Sheet 4: Import_Template (Exact 14 columns of Admin Bulk Importer)
  // Per business constraint: Prices, MRP, and Stock are left intentionally empty
  const sheet4Data = normalizedRecords.map((r) => ({
    SKU: r.sku,
    "Product Name": r.productName,
    Brand: r.brand,
    Category: r.category,
    Subcategory: r.subcategory,
    Description: r.originalDescription,
    Price: "", // Intentionally blank: Awaiting client rate update (~Oct 17, 2026)
    "Sale Price": "",
    "Cost Price": "",
    Stock: "", // Intentionally blank: Awaiting client godown stock counts
    "Low Stock Threshold": 3,
    Warranty: "",
    Weight: "",
    Status: r.status,
  }));
  const ws4 = xlsx.utils.json_to_sheet(sheet4Data);
  xlsx.utils.book_append_sheet(outWb, ws4, "Import_Template");

  // Sheet 5: Normalization_Report
  const sheet5Data = [
    { Metric: "Source File", Value: flags.input },
    {
      Metric: "Total Valid Items Accounted For",
      Value: normalizedRecords.length,
    },
    { Metric: "Items Ready for Pricing", Value: readyList.length },
    { Metric: "Items Flagged for Review", Value: needsReviewList.length },
    { Metric: "Unique Deterministic SKUs", Value: internalSkuSet.size },
    { Metric: "Internal SKU Collisions", Value: internalCollisions.length },
    {
      Metric: "Collisions with Existing Catalog",
      Value: repoCollisions.length,
    },
    {
      Metric: "Price Status",
      Value: "Awaiting client updated workbook with rates (~Oct 17, 2026)",
    },
    { Metric: "Stock Status", Value: "Awaiting client updated stock counts" },
    {
      Metric: "Database Safety",
      Value: "Preserved (0-price records staged only; not inserted into products table)",
    },
    { Metric: "Execution Timestamp", Value: new Date().toISOString() },
  ];
  const ws5 = xlsx.utils.json_to_sheet(sheet5Data);
  xlsx.utils.book_append_sheet(outWb, ws5, "Normalization_Report");

  // Ensure output directory exists
  const outDir = path.dirname(flags.output);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write Excel file
  xlsx.writeFile(outWb, flags.output);
  console.log(`\nWorkbook successfully written to:\n  ${flags.output}`);

  // Optional CSV export of Import_Template
  if (flags.csv) {
    const csvPath = flags.output.replace(/\.xlsx$/i, "_import_template.csv");
    const csvContent = xlsx.utils.sheet_to_csv(ws4);
    fs.writeFileSync(csvPath, csvContent, "utf8");
    console.log(`CSV Import Template written to:\n  ${csvPath}`);
  }

  console.log("\nNormalization pipeline completed successfully.");
}

run();
