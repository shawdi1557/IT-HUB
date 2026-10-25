// supabase/functions/tests/pc-builder-phase2-compat.test.ts
// IT HUB Find My PC — Phase 2 Compatibility Engine Hardening Tests
// Rigorous verification covering Rule F (PCIe power), Tri-State UNKNOWN blocking,
// and Specification Provenance transparency.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { checkCompatibility, calculateSystemPower } =
  await import("../../../src/lib/builder/compatibility.ts");

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PHASE2-1: Rule F — GPU requiring auxiliary PCIe power triggers error if PSU connectors insufficient", () => {
  const parts: any = {
    GPU: {
      slot: "GPU",
      productId: "gpu-rtx4080",
      variantId: "gid://shopify/ProductVariant/4080",
      title: "GeForce RTX 4080 16GB",
      price: 95000,
      currency: "INR",
      specs: { powerWatts: 320, requiredPcieConnectors: ["8-pin", "8-pin", "8-pin"] },
      availability: "available",
      quantity: 1,
    },
    PSU: {
      slot: "PSU",
      productId: "psu-budget",
      variantId: "gid://shopify/ProductVariant/psu-entry",
      title: "Budget 750W PSU",
      price: 5500,
      currency: "INR",
      specs: { ratedWattage: 750, pciePowerConnectors: ["8-pin"] }, // Only 1 connector!
      availability: "available",
      quantity: 1,
    },
  };

  const result = checkCompatibility(parts);
  assertEquals(result.valid, false);
  const pcieError = result.items.find((i) => i.ruleId === "RULE_F_PCIE_POWER_INSUFFICIENT");
  assertEquals(Boolean(pcieError), true);
  assertEquals(pcieError?.severity, "error");
  assertEquals(pcieError?.status, "incompatible");
});

Deno.test("PHASE2-2: Rule F — Low-power GPU (<=75W) passes without requiring auxiliary PCIe power", () => {
  const parts: any = {
    GPU: {
      slot: "GPU",
      productId: "gpu-gtx1650",
      variantId: "gid://shopify/ProductVariant/1650",
      title: "GeForce GTX 1650 4GB",
      price: 12000,
      currency: "INR",
      specs: { powerWatts: 75 },
      availability: "available",
      quantity: 1,
    },
    PSU: {
      slot: "PSU",
      productId: "psu-450",
      variantId: "gid://shopify/ProductVariant/450",
      title: "450W Standard PSU",
      price: 3200,
      currency: "INR",
      specs: { ratedWattage: 450 },
      availability: "available",
      quantity: 1,
    },
  };

  const result = checkCompatibility(parts);
  const notRequiredInfo = result.items.find((i) => i.ruleId === "RULE_F_PCIE_POWER_NOT_REQUIRED");
  assertEquals(Boolean(notRequiredInfo), true);
  assertEquals(notRequiredInfo?.status, "compatible");
});

Deno.test("PHASE2-3: UNKNOWN is never treated as PASS — Automated mode rejects blocking unknowns", () => {
  const partsWithUnknownSocket: any = {
    CPU: {
      slot: "CPU",
      productId: "cpu-unknown",
      variantId: "gid://shopify/ProductVariant/cpu-u",
      title: "Unbranded Processor",
      price: 10000,
      currency: "INR",
      specs: { socket: undefined }, // UNKNOWN socket
      availability: "available",
      quantity: 1,
    },
    Motherboard: {
      slot: "Motherboard",
      productId: "mobo-am4",
      variantId: "gid://shopify/ProductVariant/mobo-am4",
      title: "B550 Motherboard",
      price: 7000,
      currency: "INR",
      specs: { socket: "AM4", supportedRamGeneration: "DDR4" },
      availability: "available",
      quantity: 1,
    },
  };

  // In Manual / Expert Mode: Displays warning, does not block manual quote request
  const manualResult = checkCompatibility(partsWithUnknownSocket, { mode: "manual" });
  assertEquals(manualResult.valid, true);
  assertEquals(manualResult.hasBlockingUnknowns, true);
  assertEquals(manualResult.validForAutomatedRecommendation, false);

  // In Automated Mode (Find My PC recommendation engine): UNKNOWN strictly blocks recommendation
  const automatedResult = checkCompatibility(partsWithUnknownSocket, { mode: "automated" });
  assertEquals(automatedResult.valid, false); // Blocked!
  assertEquals(automatedResult.validForAutomatedRecommendation, false);
  assertEquals(automatedResult.status, "unknown");
});

Deno.test("PHASE2-4: Rule E — Missing PSU rated wattage is marked as blocking unknown", () => {
  const parts: any = {
    CPU: {
      slot: "CPU",
      specs: { tdpWatts: 65 },
    },
    PSU: {
      slot: "PSU",
      title: "Unspecified Brand PSU",
      specs: { ratedWattage: undefined }, // UNKNOWN wattage
    },
  };

  const result = checkCompatibility(parts, { mode: "automated" });
  assertEquals(result.hasBlockingUnknowns, true);
  assertEquals(result.validForAutomatedRecommendation, false);
  assertEquals(result.valid, false);
  const unknownWattage = result.items.find((i) => i.ruleId === "RULE_E_PSU_WATTAGE_UNKNOWN");
  assertEquals(Boolean(unknownWattage), true);
  assertEquals(unknownWattage?.status, "unknown");
});

Deno.test("PHASE2-5: Rule J — Provenance audit transparently flags unverified specifications", () => {
  const parts: any = {
    CPU: {
      slot: "CPU",
      title: "AMD Ryzen 5 5600",
      isVerified: true,
      specs: { socket: "AM4", provenance: "verified_manufacturer" },
    },
    Motherboard: {
      slot: "Motherboard",
      title: "Generic B550M Motherboard",
      isVerified: false,
      specs: { socket: "AM4", supportedRamGeneration: "DDR4", provenance: "ambiguous_unverified" },
    },
  };

  const result = checkCompatibility(parts);
  const unverifiedItem = result.items.find((i) => i.ruleId === "RULE_J_SPEC_UNVERIFIED");
  assertEquals(Boolean(unverifiedItem), true);
  assertEquals(unverifiedItem?.status, "conditional");
  assertEquals(unverifiedItem?.affectedSlots.includes("Motherboard"), true);
});
