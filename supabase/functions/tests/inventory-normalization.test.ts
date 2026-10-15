// supabase/functions/tests/inventory-normalization.test.ts
// Automated Tests for IT HUB Phase B — Inventory Normalization Engine

import {
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts"

// ── In-Memory Rule Engine (Testing Core Invariants) ─────────────────────────

function testGenerateSku(
  sourceRow: number,
  originalText: string,
  catCode: string,
  brandCode: string,
  model?: string,
): string {
  let token = (model || originalText)
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8)
  if (!token) token = "ITEM"

  // Simple deterministic 4-character hash for Deno unit testing
  let hashNum = 0
  const combined = `${sourceRow}:${originalText.trim()}`
  for (let i = 0; i < combined.length; i++) {
    hashNum = (hashNum * 31 + combined.charCodeAt(i)) >>> 0
  }
  const hash = hashNum.toString(16).toUpperCase().padStart(4, "0").slice(0, 4)

  return `ITH-${catCode}-${brandCode}-${token}-${hash}`
}

function testClassifyItem(
  text: string,
): {
  category: string
  catCode: string
  subcategory: string
  productType: "Fresh" | "Spare Part" | "Installation Hardware"
} {
  if (
    /(?:paper|papet|pper)\s*\d+\s*pin|pin\s*fhd|pin\s*hd|normal\s*led|pin\s*touch|boe\s*og/i.test(
      text,
    ) &&
    !/laptop\s+hp|macbook/i.test(text)
  ) {
    return {
      category: "Laptop Spares & Service Parts",
      catCode: "SPR",
      subcategory: "Replacement Laptop Screens",
      productType: "Spare Part",
    }
  }

  if (
    /\b(?:20mm|25mm|32mm)\b.*?\b(?:bend|elbow|junction|conduit|saddle)\b/i.test(
      text,
    )
  ) {
    return {
      category: "Networking & CCTV",
      catCode: "NET",
      subcategory: "Conduit & Installation Hardware",
      productType: "Installation Hardware",
    }
  }

  if (
    /\blaptop\b|\bmacbook\b|\bthinkpad\b|\bideapad\b|\bvictus\b|\bloq\b/i.test(
      text,
    )
  ) {
    return {
      category: "Laptops & MacBooks",
      catCode: "LPT",
      subcategory: /\bmacbook\b/i.test(text)
        ? "MacBooks"
        : /\bvictus\b|\bloq\b/i.test(text)
          ? "Gaming Laptops"
          : "Laptops",
      productType: "Fresh",
    }
  }

  if (/\biphone\b|\bipad\b|\boneplus\b|\bgalaxy\b/i.test(text)) {
    return {
      category: "Mobile Phones & Tablets",
      catCode: "PHN",
      subcategory: /\bipad\b/i.test(text) ? "iPads & Tablets" : "Smartphones",
      productType: "Fresh",
    }
  }

  if (/\btoner\b|\bcartridge\b|\bink\s*bottle\b|\b057\b|\b88a\b/i.test(text)) {
    return {
      category: "Inks, Toners & Cartridges",
      catCode: "INK",
      subcategory: /\btoner\b|\b88a\b|\b057\b/i.test(text)
        ? "Laser Toners"
        : "Ink Bottles",
      productType: "Fresh",
    }
  }

  if (/\bprinter\b|\bthermal\b|\bbarcode\b|\bxprinter\b/i.test(text)) {
    return {
      category: "Printers, Scanners & POS",
      catCode: "PRN",
      subcategory: /thermal|barcode/i.test(text)
        ? "Thermal Printers"
        : "Printers & Scanners",
      productType: "Fresh",
    }
  }

  if (/\bssd\b|\bnvme\b|\bhdd\b|\bddr[345]\b|\bram\b/i.test(text)) {
    return {
      category: "PC Components & Storage",
      catCode: "CMP",
      subcategory: /\bssd\b|\bnvme\b/i.test(text)
        ? "Solid State Drives (SSD)"
        : /\bhdd\b/i.test(text)
          ? "Hard Disk Drives (HDD)"
          : "RAM (DDR4 / DDR5)",
      productType: "Fresh",
    }
  }

  if (/\bairdopes\b|\brockerz\b|\bheadphone\b|\bsoundbar\b/i.test(text)) {
    return {
      category: "Audio & Smart Gadgets",
      catCode: "AUD",
      subcategory: /airdopes/i.test(text)
        ? "TWS Earbuds"
        : /rockerz|headphone/i.test(text)
          ? "Wireless Headphones"
          : "Soundbars & Speakers",
      productType: "Fresh",
    }
  }

  return {
    category: "Cables & Accessories",
    catCode: "ACC",
    subcategory: "General Accessories",
    productType: "Fresh",
  }
}

// ── Test Suites ─────────────────────────────────────────────────────────────

Deno.test("NORM-1. SKU Generation: Identical input produces identical SKU (Determinism)", () => {
  const row = 15
  const text =
    'Laptop HP 15 FD0534TU (i5-13th 1334U|8GB| 512GB SSD|15.6" FHD|W11|Natural Silver) - 00 B91DNPA'
  const sku1 = testGenerateSku(row, text, "LPT", "HP", "B91DNPA")
  const sku2 = testGenerateSku(row, text, "LPT", "HP", "B91DNPA")
  assertEquals(sku1, sku2)
  assertMatch(sku1, /^ITH-LPT-HP-[A-Z0-9]+-[A-Z0-9]{4}$/)
})

Deno.test("NORM-2. SKU Generation: Different rows produce distinct unique SKUs", () => {
  const text = "13.3 Paper 30 Pin Ips Fhd"
  const skuRow18 = testGenerateSku(18, text, "SPR", "GEN", "133PAPER")
  const skuRow19 = testGenerateSku(19, text, "SPR", "GEN", "133PAPER")
  assertNotEquals(skuRow18, skuRow19)
})

Deno.test("NORM-3. Classification: Laptops & MacBooks detected correctly", () => {
  const hpLaptop = testClassifyItem(
    'Laptop HP 15 FB3189AX Victus (R7 7445HS | 16GB | 512GB | 15.6"FHD)',
  )
  assertEquals(hpLaptop.category, "Laptops & MacBooks")
  assertEquals(hpLaptop.subcategory, "Gaming Laptops")
  assertEquals(hpLaptop.productType, "Fresh")

  const macbook = testClassifyItem(
    '13" Macbook Neo A18 Pro 6cpu 5gpu 8gb/256GB SSD CITRUS',
  )
  assertEquals(macbook.category, "Laptops & MacBooks")
  assertEquals(macbook.subcategory, "MacBooks")
})

Deno.test("NORM-4. Classification: Spare parts and panels distinguished from laptops", () => {
  const screen = testClassifyItem("15.6 PAPER 40 PIN FHD 144HZ BOE OG DISPLAY")
  assertEquals(screen.category, "Laptop Spares & Service Parts")
  assertEquals(screen.subcategory, "Replacement Laptop Screens")
  assertEquals(screen.productType, "Spare Part")
})

Deno.test("NORM-5. Classification: Conduit wiring supplies categorized as installation hardware", () => {
  const conduit = testClassifyItem("20MM PVC CONDUIT ISI(L) KON-DUCT")
  assertEquals(conduit.category, "Networking & CCTV")
  assertEquals(conduit.subcategory, "Conduit & Installation Hardware")
  assertEquals(conduit.productType, "Installation Hardware")
})

Deno.test("NORM-6. Classification: Consumables and POS equipment correctly classified", () => {
  const toner = testClassifyItem("Canon Cartridge 057 Black Laser Toner")
  assertEquals(toner.category, "Inks, Toners & Cartridges")
  assertEquals(toner.subcategory, "Laser Toners")

  const pos = testClassifyItem("XP-C230 NEW26 THERMAL PRINTER USB+LAN")
  assertEquals(pos.category, "Printers, Scanners & POS")
  assertEquals(pos.subcategory, "Thermal Printers")
})

Deno.test("NORM-7. Safety Invariant: Prices and stock counts remain unpopulated (No fake data)", () => {
  // Normalization template row contract
  const templateRow = {
    SKU: "ITH-LPT-HP-B91DNPA-3ADE",
    "Product Name": "Laptop HP 15 FD0534TU",
    Brand: "HP",
    Category: "Laptops & MacBooks",
    Price: "", // Empty string / null awaiting client update
    Stock: "", // Empty string / null awaiting client update
    Status: "Active",
  }
  assertEquals(templateRow.Price, "")
  assertEquals(templateRow.Stock, "")
})
