// src/lib/builder/compatibility.ts
// IT HUB Deterministic Hardware Compatibility Engine
// Pure functional engine with zero side effects, no React hooks, and full unit testability.

import type {
  CanonicalBuildComponent,
  ComponentSlotId,
  CompatibilityItem,
  CompatibilityStatus,
  CompatibilitySummary,
  TechnicalSpecs,
} from "./types";

export interface CheckCompatibilityOptions {
  /** The customer already has a graphics card, so one isn't missing from this build. */
  ownsGpu?: boolean;
  workload?: "gaming" | "creation" | "work" | "general";
  budgetInr?: number;
  mode?: "automated" | "manual";
}

/**
 * Calculates estimated system electrical power and recommended power supply capacity.
 * Uses verified component TDPs + 80W base platform load (motherboard, memory, storage, fans)
 * with a documented 35% engineering safety headroom.
 */
export function calculateSystemPower(
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
): {
  estimatedSystemLoadWatts: number;
  recommendedPsuWatts: number;
  powerHeadroomWatts: number;
  powerHeadroomStatus: "adequate" | "limited" | "deficit" | "unknown";
  /** True when a CPU or GPU power draw isn't known, so the estimate rests on a typical value. */
  usesAssumedPower: boolean;
} {
  const cpu = components.CPU?.specs;
  const gpu = components.GPU?.specs;
  const psu = components.PSU?.specs;

  const cpuWatts = cpu?.tdpWatts || (components.CPU ? 65 : 0);
  const gpuWatts = gpu?.powerWatts || gpu?.tdpWatts || (components.GPU ? 150 : 0);
  const usesAssumedPower =
    Boolean(components.CPU && !cpu?.tdpWatts) ||
    Boolean(components.GPU && !gpu?.powerWatts && !gpu?.tdpWatts);
  const platformBaseWatts = Object.keys(components).length > 0 ? 80 : 0;

  const estimatedSystemLoadWatts = cpuWatts + gpuWatts + platformBaseWatts;

  // 35% headroom rounded up to nearest 50W step, or GPU manufacturer recommendation
  const calculatedRecommended = Math.max(
    350,
    Math.ceil((estimatedSystemLoadWatts * 1.35) / 50) * 50,
  );
  const manufacturerRecommended = gpu?.recommendedPsuWatts || 0;
  const recommendedPsuWatts = Math.max(calculatedRecommended, manufacturerRecommended);

  if (!psu?.ratedWattage) {
    return {
      estimatedSystemLoadWatts,
      recommendedPsuWatts,
      powerHeadroomWatts: 0,
      powerHeadroomStatus: "unknown",
      usesAssumedPower,
    };
  }

  const powerHeadroomWatts = psu.ratedWattage - estimatedSystemLoadWatts;
  let powerHeadroomStatus: "adequate" | "limited" | "deficit" = "adequate";

  if (psu.ratedWattage < estimatedSystemLoadWatts) {
    powerHeadroomStatus = "deficit";
  } else if (psu.ratedWattage < recommendedPsuWatts) {
    powerHeadroomStatus = "limited";
  }

  return {
    estimatedSystemLoadWatts,
    recommendedPsuWatts,
    powerHeadroomWatts,
    powerHeadroomStatus,
    usesAssumedPower,
  };
}

/** Compares motherboard sizes whichever way a supplier spells them. */
function normalizeFormFactor(value: string): string {
  const compact = value.toUpperCase().replace(/[\s_-]/g, "");
  if (compact === "MATX" || compact === "MICROATX" || compact === "UATX") return "MICRO-ATX";
  if (compact === "ITX" || compact === "MINIITX") return "MINI-ITX";
  if (compact === "EATX") return "E-ATX";
  return compact;
}

/**
 * Comprehensive compatibility validator evaluating Rules A through J.
 */
export function checkCompatibility(
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  options: CheckCompatibilityOptions = {},
): CompatibilitySummary {
  const items: CompatibilityItem[] = [];

  const cpu = components.CPU ? { ...components.CPU, specs: components.CPU.specs || {} } : undefined;
  const mobo = components.Motherboard
    ? { ...components.Motherboard, specs: components.Motherboard.specs || {} }
    : undefined;
  const ram = components.RAM ? { ...components.RAM, specs: components.RAM.specs || {} } : undefined;
  const gpu = components.GPU ? { ...components.GPU, specs: components.GPU.specs || {} } : undefined;
  const storage = components.Storage
    ? { ...components.Storage, specs: components.Storage.specs || {} }
    : undefined;
  const psu = components.PSU ? { ...components.PSU, specs: components.PSU.specs || {} } : undefined;
  const cabinet = components.Cabinet
    ? { ...components.Cabinet, specs: components.Cabinet.specs || {} }
    : undefined;
  const cooler = components.Cooler
    ? { ...components.Cooler, specs: components.Cooler.specs || {} }
    : undefined;

  // ───────────────────────────────────────────────────────────────────────────
  // Rule A — CPU and Motherboard Socket & Chipset Compatibility
  // ───────────────────────────────────────────────────────────────────────────
  if (cpu && mobo) {
    const cpuSocket = cpu.specs.socket?.toUpperCase().trim();
    const moboSocket = mobo.specs.socket?.toUpperCase().trim();

    if (!cpuSocket || !moboSocket) {
      items.push({
        ruleId: "RULE_A_SOCKET_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["CPU", "Motherboard"],
        label: "Socket specification unverified",
        explanation: `Unable to verify CPU socket (${cpuSocket || "unspecified"}) against motherboard socket (${moboSocket || "unspecified"}).`,
        suggestedResolution:
          "Check manufacturer specifications or request manual confirmation from IT HUB.",
        missingFields: [
          !cpuSocket ? "CPU.socket" : "",
          !moboSocket ? "Motherboard.socket" : "",
        ].filter(Boolean),
      });
    } else if (cpuSocket !== moboSocket) {
      items.push({
        ruleId: "RULE_A_SOCKET_MISMATCH",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["CPU", "Motherboard"],
        label: "CPU & Motherboard socket mismatch",
        explanation: `The selected ${cpu.title} uses socket ${cpuSocket}, which cannot fit the ${mobo.title} (${moboSocket} socket).`,
        suggestedResolution: `Select a motherboard that supports the ${cpuSocket} socket, or choose a ${moboSocket}-compatible processor.`,
      });
    } else {
      // Sockets match! Check BIOS update requirements
      if (
        mobo.specs.requiresBiosUpdateForRyzen5000 ||
        mobo.specs.requiresBiosUpdateForIntel13_14th
      ) {
        items.push({
          ruleId: "RULE_A_BIOS_UPDATE",
          severity: "warning",
          status: "conditional",
          affectedSlots: ["CPU", "Motherboard"],
          label: "Motherboard BIOS update may be required",
          explanation: `This motherboard may need an updated BIOS version to boot with ${cpu.title}.`,
          suggestedResolution: "Confirm the BIOS version with IT HUB before ordering.",
        });
      } else {
        items.push({
          ruleId: "RULE_A_SOCKET_MATCH",
          severity: "info",
          status: "compatible",
          affectedSlots: ["CPU", "Motherboard"],
          label: `CPU & Motherboard compatible (${cpuSocket})`,
          explanation: `Processor and motherboard both support the ${cpuSocket} interface.`,
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule B — Motherboard and RAM Generation & Form Factor
  // ───────────────────────────────────────────────────────────────────────────
  if (ram) {
    if (ram.specs.isLaptopSoDimm) {
      items.push({
        ruleId: "RULE_B_RAM_SODIMM_ERROR",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["RAM"],
        label: "Incompatible SO-DIMM laptop memory",
        explanation: `${ram.title} is designed for laptops (SO-DIMM) and cannot be installed in desktop motherboards.`,
        suggestedResolution: "Select standard desktop unbuffered DIMM memory modules.",
      });
    }

    if (mobo) {
      const moboRam = mobo.specs.supportedRamGeneration?.toUpperCase().trim();
      const ramGen = ram.specs.ramGeneration?.toUpperCase().trim();

      if (!moboRam || !ramGen) {
        items.push({
          ruleId: "RULE_B_RAM_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["Motherboard", "RAM"],
          label: "Memory generation unverified",
          explanation:
            "Unable to confirm DDR generation compatibility between motherboard and RAM.",
          suggestedResolution: "Verify DDR4 vs DDR5 compatibility with IT HUB technical support.",
        });
      } else if (moboRam !== ramGen) {
        items.push({
          ruleId: "RULE_B_RAM_MISMATCH",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["Motherboard", "RAM"],
          label: `RAM generation mismatch (${ramGen} vs ${moboRam})`,
          explanation: `The ${mobo.title} only supports ${moboRam} memory, but ${ram.title} is ${ramGen}. Physical notches and voltages are incompatible.`,
          suggestedResolution: `Choose ${moboRam} memory modules to pair with this motherboard.`,
        });
      } else {
        items.push({
          ruleId: "RULE_B_RAM_MATCH",
          severity: "info",
          status: "compatible",
          affectedSlots: ["Motherboard", "RAM"],
          label: `RAM generation matches (${ramGen})`,
          explanation: `Both motherboard and memory modules utilize the ${ramGen} standard.`,
        });
      }

      // RAM capacity and slot limits
      const moduleCount = ram.specs.moduleCount;
      const capacityGb = ram.specs.capacityGb;
      const ramSlots = mobo.specs.ramSlots;
      const maxRamGb = mobo.specs.maxRamCapacityGb;

      if (moduleCount && ramSlots && moduleCount > ramSlots) {
        items.push({
          ruleId: "RULE_B_RAM_SLOTS_EXCEEDED",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["Motherboard", "RAM"],
          label: "More memory modules than motherboard slots",
          explanation: `${ram.title} has ${moduleCount} modules, but ${mobo.title} has ${ramSlots} memory slots.`,
          suggestedResolution: `Choose a kit with no more than ${ramSlots} modules.`,
        });
      }
      if (capacityGb && maxRamGb && capacityGb > maxRamGb) {
        items.push({
          ruleId: "RULE_B_RAM_CAPACITY_EXCEEDED",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["Motherboard", "RAM"],
          label: "Memory capacity above the motherboard limit",
          explanation: `${ram.title} totals ${capacityGb}GB, but ${mobo.title} supports up to ${maxRamGb}GB.`,
          suggestedResolution: `Choose a kit of ${maxRamGb}GB or less.`,
        });
      }
      if (!moduleCount || !capacityGb || !ramSlots || !maxRamGb) {
        items.push({
          ruleId: "RULE_B_RAM_LIMITS_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["Motherboard", "RAM"],
          label: "Memory slot and capacity limits unverified",
          explanation:
            "Unable to compare the memory kit against the motherboard's slots and maximum capacity.",
          suggestedResolution: "IT HUB will confirm the memory configuration.",
        });
      } else if (moduleCount <= ramSlots && capacityGb <= maxRamGb) {
        items.push({
          ruleId: "RULE_B_RAM_LIMITS_OK",
          severity: "info",
          status: "compatible",
          affectedSlots: ["Motherboard", "RAM"],
          label: `Memory fits the motherboard (${capacityGb}GB, ${moduleCount} of ${ramSlots} slots)`,
          explanation: "The kit is within the motherboard's slot count and maximum capacity.",
        });
      }
    }

    // The processor's own memory support can rule a kit out, whichever motherboard is chosen.
    const ramGeneration = ram.specs.ramGeneration?.toUpperCase().trim();
    const cpuRamGenerations = (cpu?.specs.supportedRamGen || []).map((g) => g.toUpperCase().trim());
    if (
      ramGeneration &&
      cpuRamGenerations.length > 0 &&
      !cpuRamGenerations.includes(ramGeneration)
    ) {
      items.push({
        ruleId: "RULE_B_CPU_RAM_MISMATCH",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["CPU", "RAM"],
        label: `Processor doesn't support ${ramGeneration}`,
        explanation: `${cpu?.title} supports ${cpuRamGenerations.join(" and ")} memory, but ${ram.title} is ${ramGeneration}.`,
        suggestedResolution: `Choose ${cpuRamGenerations.join(" or ")} memory.`,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule C — CPU and CPU Cooler Compatibility & Height
  // ───────────────────────────────────────────────────────────────────────────
  if (cpu) {
    const hasCooler = Boolean(cooler);
    const includesStock = Boolean(cpu.specs.includesCooler);

    if (!hasCooler && cpu.specs.includesCooler === undefined) {
      items.push({
        ruleId: "RULE_C_STOCK_COOLER_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["CPU", "Cooler"],
        label: "Bundled CPU cooler unverified",
        explanation: `Unable to confirm whether ${cpu.title} includes a cooler.`,
        suggestedResolution: "Add a CPU cooler, or confirm with IT HUB that one is included.",
      });
    } else if (!hasCooler && !includesStock) {
      items.push({
        ruleId: "RULE_C_COOLER_REQUIRED",
        severity: "warning",
        status: "conditional",
        affectedSlots: ["CPU", "Cooler"],
        label: "Dedicated CPU cooler recommended",
        explanation: `${cpu.title} does not include a stock heatsink/fan in the retail package. An aftermarket air or liquid cooler is required.`,
        suggestedResolution:
          "Add an aftermarket CPU cooler to ensure safe operational temperatures.",
      });
    }

    if (cooler) {
      const coolerSockets = (cooler.specs.supportedSockets || []).map((s) =>
        s.toUpperCase().trim(),
      );
      const cpuSocket = cpu.specs.socket?.toUpperCase().trim();

      if (!cpuSocket || coolerSockets.length === 0) {
        items.push({
          ruleId: "RULE_C_COOLER_SOCKET_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["CPU", "Cooler"],
          label: "Cooler socket support unverified",
          explanation: `Unable to confirm that ${cooler.title} mounts on ${cpu.title}.`,
          suggestedResolution: "IT HUB will confirm the mounting hardware.",
        });
      } else if (coolerSockets.includes(cpuSocket)) {
        items.push({
          ruleId: "RULE_C_COOLER_SOCKET_MATCH",
          severity: "info",
          status: "compatible",
          affectedSlots: ["CPU", "Cooler"],
          label: `Cooler supports the ${cpuSocket} socket`,
          explanation: `${cooler.title} lists mounting support for ${cpuSocket}.`,
        });
      } else {
        items.push({
          ruleId: "RULE_C_COOLER_SOCKET_MISMATCH",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["CPU", "Cooler"],
          label: "Cooler bracket incompatible with CPU socket",
          explanation: `${cooler.title} does not list mounting brackets for ${cpuSocket}.`,
          suggestedResolution: `Choose a cooler with ${cpuSocket} mounting hardware.`,
        });
      }
    }

    if (cooler && cabinet) {
      const coolerHeight = cooler.specs.coolerHeightMm || 0;
      const caseMaxHeight = cabinet.specs.maxCoolerHeightMm || 0;

      if (coolerHeight <= 0 || caseMaxHeight <= 0) {
        items.push({
          ruleId: "RULE_C_COOLER_HEIGHT_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["Cooler", "Cabinet"],
          label: "Cooler height clearance unverified",
          explanation: `Unable to confirm that ${cooler.title} fits inside ${cabinet.title}.`,
          suggestedResolution: "IT HUB will confirm the cabinet clearance.",
        });
      } else if (coolerHeight <= caseMaxHeight) {
        items.push({
          ruleId: "RULE_C_COOLER_HEIGHT_OK",
          severity: "info",
          status: "compatible",
          affectedSlots: ["Cooler", "Cabinet"],
          label: `Cooler fits the cabinet (${coolerHeight}mm / ${caseMaxHeight}mm)`,
          explanation: "The cooler is within the cabinet's stated height clearance.",
        });
      } else {
        items.push({
          ruleId: "RULE_C_COOLER_HEIGHT_EXCEEDED",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["Cooler", "Cabinet"],
          label: "CPU cooler exceeds case clearance",
          explanation: `${cooler.title} is ${coolerHeight}mm tall, exceeding the cabinet's maximum clearance of ${caseMaxHeight}mm. The side panel will not close.`,
          suggestedResolution: `Select a lower profile air cooler (under ${caseMaxHeight}mm) or an all-in-one liquid cooler.`,
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule D — GPU Physical Clearance in Case
  // ───────────────────────────────────────────────────────────────────────────
  if (gpu && cabinet) {
    const gpuLength = gpu.specs.lengthMm || 0;
    const caseMaxGpu = cabinet.specs.maxGpuLengthMm || 0;

    if (gpuLength > 0 && caseMaxGpu > 0) {
      if (gpuLength > caseMaxGpu) {
        items.push({
          ruleId: "RULE_D_GPU_LENGTH_EXCEEDED",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["GPU", "Cabinet"],
          label: "Graphics card too long for cabinet",
          explanation: `${gpu.title} is ${gpuLength}mm long, exceeding the case's internal clearance limit of ${caseMaxGpu}mm.`,
          suggestedResolution: `Choose a more spacious cabinet or a dual-fan graphics card under ${caseMaxGpu}mm.`,
        });
      } else {
        items.push({
          ruleId: "RULE_D_GPU_CLEARANCE_OK",
          severity: "info",
          status: "compatible",
          affectedSlots: ["GPU", "Cabinet"],
          label: `GPU fits case clearance (${gpuLength}mm / ${caseMaxGpu}mm)`,
          explanation: "Graphics card dimensions fit cleanly within cabinet internal clearances.",
        });
      }
    } else {
      items.push({
        ruleId: "RULE_D_GPU_CLEARANCE_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["GPU", "Cabinet"],
        label: "Chassis GPU clearance unverified",
        explanation: `Unable to verify whether ${gpu.title} (${gpuLength ? `${gpuLength}mm` : "length unspecified"}) fits ${cabinet.title} (${caseMaxGpu ? `${caseMaxGpu}mm clearance` : "clearance unspecified"}).`,
        suggestedResolution: "Check chassis manufacturer dimensions.",
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule E & F — Power Consumption & PSU Headroom
  // ───────────────────────────────────────────────────────────────────────────
  const power = calculateSystemPower(components);

  if (psu) {
    if (!psu.specs.ratedWattage) {
      items.push({
        ruleId: "RULE_E_PSU_WATTAGE_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["PSU"],
        label: "PSU rated wattage unverified",
        explanation:
          "Unable to calculate power headroom because the PSU rated wattage is unspecified.",
        suggestedResolution: "Confirm PSU wattage specifications before ordering.",
      });
    } else if (power.usesAssumedPower) {
      items.push({
        ruleId: "RULE_E_POWER_DRAW_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["PSU"],
        label: "Power draw unverified",
        explanation: `A processor or graphics card has no stated power draw, so ${psu.specs.ratedWattage}W can't be checked against the build. The ${power.estimatedSystemLoadWatts}W shown uses a typical value.`,
        suggestedResolution: "IT HUB will confirm the power supply for this build.",
      });
    } else if (power.powerHeadroomStatus === "deficit") {
      items.push({
        ruleId: "RULE_E_PSU_WATTAGE_DEFICIT",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["PSU"],
        label: "PSU capacity below estimated system consumption",
        explanation: `Total estimated system peak load is ${power.estimatedSystemLoadWatts}W, but the selected ${psu.title} is only rated for ${psu.specs.ratedWattage}W. The system will trigger over-current shutdown under load.`,
        suggestedResolution: `Upgrade to at least a ${power.recommendedPsuWatts}W power supply.`,
      });
    } else if (power.powerHeadroomStatus === "limited") {
      items.push({
        ruleId: "RULE_E_PSU_HEADROOM_LIMITED",
        severity: "warning",
        status: "conditional",
        affectedSlots: ["PSU"],
        label: "Limited power supply headroom",
        explanation: `The ${psu.title} (${psu.specs.ratedWattage}W) handles estimated consumption (${power.estimatedSystemLoadWatts}W), but provides less than the recommended 35% safety margin (${power.recommendedPsuWatts}W recommended).`,
        suggestedResolution: `Consider a ${power.recommendedPsuWatts}W unit for optimal energy efficiency and future component upgrades.`,
      });
    } else {
      items.push({
        ruleId: "RULE_E_PSU_HEADROOM_ADEQUATE",
        severity: "info",
        status: "compatible",
        affectedSlots: ["PSU"],
        label: `PSU has adequate power headroom (${psu.specs.ratedWattage}W)`,
        explanation: `Sufficient wattage for all components with healthy power headroom.`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rule F — PCIe Auxiliary Power Connector Requirements
    // ─────────────────────────────────────────────────────────────────────────
    if (gpu) {
      const gpuTdp = gpu.specs.powerWatts || gpu.specs.tdpWatts || 0;
      const gpuNeedsAux =
        gpuTdp > 75 ||
        Boolean(gpu.specs.requiredPciePins || gpu.specs.requiredPcieConnectors?.length);
      const psuConnectors = psu.specs.pciePowerConnectors;

      if (!gpuTdp && !gpuNeedsAux) {
        items.push({
          ruleId: "RULE_F_GPU_POWER_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["GPU", "PSU"],
          label: "Graphics card power connector unverified",
          explanation: `${gpu.title} has no stated power draw or connector, so its PCIe power needs can't be checked.`,
          suggestedResolution: "IT HUB will confirm the power cables for this card.",
        });
      } else if (!gpuNeedsAux) {
        items.push({
          ruleId: "RULE_F_PCIE_POWER_NOT_REQUIRED",
          severity: "info",
          status: "compatible",
          affectedSlots: ["GPU"],
          label: "PCIe slot power sufficient (≤75W)",
          explanation: `${gpu.title} draws ≤75W and does not require dedicated auxiliary PCIe power cables from the power supply.`,
        });
      } else if (psuConnectors && psuConnectors.length > 0) {
        const requiredCount = gpu.specs.requiredPcieConnectors?.length || (gpuTdp > 225 ? 2 : 1);
        if (psuConnectors.length < requiredCount) {
          items.push({
            ruleId: "RULE_F_PCIE_POWER_INSUFFICIENT",
            severity: "error",
            status: "incompatible",
            affectedSlots: ["GPU", "PSU"],
            label: "Insufficient PCIe power cables",
            explanation: `${gpu.title} requires ${requiredCount} PCIe power cable(s), but ${psu.title} only provides ${psuConnectors.length}.`,
            suggestedResolution:
              "Select a power supply with sufficient dedicated PCIe power connectors.",
          });
        } else {
          items.push({
            ruleId: "RULE_F_PCIE_POWER_MATCH",
            severity: "info",
            status: "compatible",
            affectedSlots: ["GPU", "PSU"],
            label: "PCIe power connectors compatible",
            explanation: `${psu.title} provides adequate PCIe power cables (${psuConnectors.length} available) for ${gpu.title}.`,
          });
        }
      } else if (!psu.specs.ratedWattage) {
        items.push({
          ruleId: "RULE_F_PCIE_POWER_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["GPU", "PSU"],
          label: "PCIe power connector compatibility unverified",
          explanation: `Unable to verify PCIe auxiliary power connectors on ${psu.title} for ${gpu.title}.`,
          suggestedResolution: "Verify PSU cable configuration with IT HUB technical support.",
        });
      } else {
        items.push({
          ruleId: "RULE_F_PCIE_CONNECTORS_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["GPU", "PSU"],
          label: "PSU PCIe cables unverified",
          explanation: `${psu.title} has no stated PCIe power cables, so they can't be checked against ${gpu.title}.`,
          suggestedResolution: "IT HUB will confirm the power cables for this card.",
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule G — Motherboard and Cabinet Form Factor
  // ───────────────────────────────────────────────────────────────────────────
  if (mobo && cabinet) {
    const moboForm = mobo.specs.formFactor ? normalizeFormFactor(mobo.specs.formFactor) : undefined;
    const caseForms = (cabinet.specs.supportedMotherboards || []).map(normalizeFormFactor);

    if (!moboForm || caseForms.length === 0) {
      items.push({
        ruleId: "RULE_G_FORM_FACTOR_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["Motherboard", "Cabinet"],
        label: "Motherboard and cabinet size unverified",
        explanation: `Unable to confirm that ${mobo.title} fits inside ${cabinet.title}.`,
        suggestedResolution: "IT HUB will confirm the motherboard size against the cabinet.",
      });
    } else {
      if (!caseForms.includes(moboForm)) {
        items.push({
          ruleId: "RULE_G_FORM_FACTOR_MISMATCH",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["Motherboard", "Cabinet"],
          label: `Motherboard form factor incompatible with case (${moboForm})`,
          explanation: `${cabinet.title} does not have standoff mounting holes or clearance for a ${moboForm} motherboard (supported: ${caseForms.join(", ")}).`,
          suggestedResolution: `Select an ${moboForm}-compatible cabinet or choose a motherboard matching the case.`,
        });
      } else {
        items.push({
          ruleId: "RULE_G_FORM_FACTOR_MATCH",
          severity: "info",
          status: "compatible",
          affectedSlots: ["Motherboard", "Cabinet"],
          label: `Form factor compatible (${moboForm})`,
          explanation: `Cabinet has standard standoffs and clearance for ${moboForm} motherboards.`,
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule H — Storage Interface
  // ───────────────────────────────────────────────────────────────────────────
  if (storage && mobo) {
    const storageType = storage.specs.storageInterface?.toUpperCase() || "";
    const usesM2 = storageType.includes("M.2") || storageType.includes("NVME");
    const usesSata = storageType.includes("SATA");
    const slotCount = usesM2
      ? mobo.specs.m2SlotCount
      : usesSata
        ? mobo.specs.sataPortCount
        : undefined;

    if (usesM2 && slotCount === 0) {
      items.push({
        ruleId: "RULE_H_STORAGE_SLOT_MISSING",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["Storage", "Motherboard"],
        label: "Motherboard lacks required M.2 slot",
        explanation: `${storage.title} is an M.2 NVMe SSD, but ${mobo.title} has 0 M.2 slots.`,
        suggestedResolution:
          "Select a 2.5-inch SATA SSD or upgrade to a motherboard with M.2 NVMe slots.",
      });
    } else if (usesSata && slotCount === 0) {
      items.push({
        ruleId: "RULE_H_STORAGE_PORT_MISSING",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["Storage", "Motherboard"],
        label: "Motherboard lacks a SATA port",
        explanation: `${storage.title} needs a SATA port, but ${mobo.title} has none.`,
        suggestedResolution: "Select an M.2 NVMe SSD or a motherboard with SATA ports.",
      });
    } else if (slotCount === undefined) {
      items.push({
        ruleId: "RULE_H_STORAGE_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["Storage", "Motherboard"],
        label: "Storage connection unverified",
        explanation: `Unable to confirm that ${mobo.title} has a free connection for ${storage.title}.`,
        suggestedResolution: "IT HUB will confirm the storage connection.",
      });
    } else {
      items.push({
        ruleId: "RULE_H_STORAGE_OK",
        severity: "info",
        status: "compatible",
        affectedSlots: ["Storage", "Motherboard"],
        label: `Storage connection available (${usesM2 ? "M.2" : "SATA"})`,
        explanation: `${mobo.title} lists ${slotCount} ${usesM2 ? "M.2 slot(s)" : "SATA port(s)"}.`,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule I — Conditional Discrete GPU Requirement
  // ───────────────────────────────────────────────────────────────────────────
  // A graphics card the customer already owns still drives the display.
  if (cpu && !gpu && !options.ownsGpu) {
    const hasIgpu = cpu.specs.hasIntegratedGraphics;
    const isGamingOrCreation = options.workload === "gaming" || options.workload === "creation";

    if (hasIgpu === false) {
      items.push({
        ruleId: "RULE_I_GPU_MANDATORY_NO_IGPU",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["CPU", "GPU"],
        label: "Discrete graphics card required for display output",
        explanation: `${cpu.title} does not contain integrated graphics. Without a dedicated graphics card, your monitor will receive no video signal.`,
        suggestedResolution: "Add a dedicated graphics card to complete the build.",
      });
    } else if (hasIgpu === undefined) {
      items.push({
        ruleId: "RULE_I_DISPLAY_OUTPUT_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["CPU", "GPU"],
        label: "Display output unverified",
        explanation: `Unable to confirm whether ${cpu.title} has integrated graphics. Without them, a graphics card is needed for a display signal.`,
        suggestedResolution: "Add a graphics card, or confirm with IT HUB.",
      });
    } else if (isGamingOrCreation) {
      items.push({
        ruleId: "RULE_I_GPU_RECOMMENDED_FOR_WORKLOAD",
        severity: "warning",
        status: "conditional",
        affectedSlots: ["GPU"],
        label: "Discrete graphics card recommended for gaming/creation",
        explanation:
          "While the CPU includes basic display graphics, a dedicated graphics card is essential for smooth frame rates in modern games and 3D rendering.",
        suggestedResolution: "Add a dedicated GPU to meet your performance expectations.",
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule J — Specification Provenance & Transparency
  // ───────────────────────────────────────────────────────────────────────────
  const unverifiedParts = Object.values(components).filter(
    (c) =>
      c &&
      (c.isVerified === false ||
        c.specs?.provenance === "unverified" ||
        (c.specs?.provenance as any) === "ambiguous_unverified"),
  );
  if (unverifiedParts.length > 0) {
    items.push({
      ruleId: "RULE_J_SPEC_UNVERIFIED",
      severity: "warning",
      status: "conditional",
      affectedSlots: unverifiedParts.map((p) => p.slot),
      label: "Component specifications preliminary / unverified",
      explanation: `${unverifiedParts.length} component(s) don't have their full specifications stated in the catalogue.`,
      suggestedResolution: "Confirm these specifications with IT HUB before ordering.",
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Build Completeness & Overall Validity
  // ───────────────────────────────────────────────────────────────────────────
  const hasErrors = items.some((i) => i.severity === "error");
  const hasWarnings = items.some((i) => i.severity === "warning");
  const hasBlockingUnknowns =
    items.some(
      (i) =>
        i.status === "unknown" &&
        (i.ruleId === "RULE_A_SOCKET_UNKNOWN" ||
          i.ruleId === "RULE_B_RAM_UNKNOWN" ||
          i.ruleId === "RULE_E_PSU_WATTAGE_UNKNOWN" ||
          i.ruleId === "RULE_F_PCIE_POWER_UNKNOWN"),
    ) || Boolean(psu && !psu.specs.ratedWattage);

  let overallStatus: CompatibilityStatus = "compatible";
  if (hasErrors) overallStatus = "incompatible";
  else if (hasBlockingUnknowns) overallStatus = "unknown";
  else if (hasWarnings) overallStatus = "conditional";

  // Core essential slots
  const requiredPopulated = Boolean(cpu && mobo && ram && storage && psu && cabinet);
  const coolerSatisfied = Boolean(cooler || cpu?.specs.includesCooler !== false);
  const gpuSatisfied = Boolean(gpu || cpu?.specs.hasIntegratedGraphics !== false);
  const complete = requiredPopulated && coolerSatisfied && gpuSatisfied;

  const validForAutomatedRecommendation = !hasErrors && !hasBlockingUnknowns;

  return {
    status: overallStatus,
    items,
    estimatedSystemLoadWatts: power.estimatedSystemLoadWatts,
    recommendedPsuWatts: power.recommendedPsuWatts,
    powerHeadroomWatts: power.powerHeadroomWatts,
    powerHeadroomStatus: power.powerHeadroomStatus,
    valid: options.mode === "automated" ? validForAutomatedRecommendation : !hasErrors,
    validForAutomatedRecommendation,
    hasBlockingUnknowns,
    complete,
  };
}

/**
 * Converts a builder selection into the engine's model. A selection made from the live catalogue
 * carries its full specifications, so every rule sees them. The flat fields only serve selections
 * saved before specifications were carried, and never state anything those fields don't.
 */
/**
 * Specifications a label can't rest on when they were only read from a title, because a wrong value
 * means the part doesn't fit or doesn't power up. A capacity or a Wi-Fi claim isn't in this list.
 */
const LABEL_CRITICAL_SPECS: Partial<
  Record<ComponentSlotId, { field: keyof TechnicalSpecs; name: string }[]>
> = {
  CPU: [{ field: "socket", name: "socket" }],
  Motherboard: [
    { field: "socket", name: "socket" },
    { field: "supportedRamGeneration", name: "memory generation" },
    { field: "formFactor", name: "form factor" },
  ],
  RAM: [{ field: "ramGeneration", name: "memory generation" }],
  GPU: [{ field: "powerWatts", name: "power draw" }],
  PSU: [{ field: "ratedWattage", name: "wattage" }],
  Storage: [{ field: "storageInterface", name: "interface" }],
};

export function inferredCriticalSpecs(slot: string, specs?: TechnicalSpecs): string[] {
  const inferred = specs?.inferredFromTitle;
  if (!inferred?.length) return [];
  return (LABEL_CRITICAL_SPECS[slot as ComponentSlotId] || [])
    .filter(({ field }) => inferred.includes(field))
    .map(({ name }) => name);
}

const OWNED_PART_NAMES: Record<string, string> = {
  CPU: "processor",
  Motherboard: "motherboard",
  RAM: "memory",
  GPU: "graphics card",
  Storage: "storage",
  PSU: "power supply",
  Cabinet: "cabinet",
  Cooler: "cooler",
};

/**
 * What stops a compatible build earning a recommendation label. This doesn't make it incompatible, and
 * it can still be offered: a mismatch rules a build out, while these mean only that nobody can yet say
 * it's confirmed. A label needs every check confirmed from the registry or a stated Shopify field.
 */
export function labelCompatibilityGaps(
  parts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  items: { status: string; label: string }[],
  ownedSlots: Set<string> = new Set(),
): string[] {
  const gaps: string[] = [];
  const unknown = items.filter((item) => item.status === "unknown").map((item) => item.label);
  if (unknown.length > 0) gaps.push(`Not yet confirmed: ${unknown.join(", ")}.`);
  const inferred = Object.values(parts).flatMap((part) =>
    part
      ? inferredCriticalSpecs(part.slot, part.specs).map((name) => `${name} of ${part.title}`)
      : [],
  );
  if (inferred.length > 0) {
    gaps.push(`Read from the product title, not confirmed: ${inferred.join("; ")}.`);
  }
  const owned = [...ownedSlots].map((slot) => OWNED_PART_NAMES[slot] || slot);
  if (owned.length > 0) {
    gaps.push(`IT HUB needs to check how your own ${owned.join(", ")} fits with these parts.`);
  }
  return gaps;
}

export function toCanonicalComponent(
  key: string,
  part: Record<string, any>,
): CanonicalBuildComponent {
  const slot = key as ComponentSlotId;
  const stated: TechnicalSpecs | undefined = part.specs;
  const specs: TechnicalSpecs = stated
    ? { ...stated }
    : {
        socket: part.socket,
        supportedRamGeneration: part.ram,
        ramGeneration: part.ram,
        tdpWatts: part.watts,
        powerWatts: part.watts,
        ratedWattage: part.capacity,
        lengthMm: part.length,
        maxGpuLengthMm: part.clearance,
        maxCoolerHeightMm: part.clearance,
        coolerHeightMm: part.height,
        hasWifi: part.wifi,
        requiresBiosUpdateForRyzen5000: part.bios,
        includesCooler: part.includesCooler,
        hasIntegratedGraphics: part.hasIntegratedGraphics,
        storageInterface: part.interface,
        provenance: part.provenance,
      };

  return {
    slot,
    productId: part.id || part.productId || `part-${key}`,
    variantId: part.variantId || "",
    title: part.name || part.title || `${key} component`,
    price: part.price || 0,
    currency: "INR",
    specs,
    imageUrl: part.image || part.imageUrl,
    availability:
      part.stock === 0 || part.availability === "unavailable" ? "unavailable" : "available",
    quantity: 1,
    retrievedAt: new Date().toISOString(),
    isShopifyLive: Boolean(part.isShopifyLive ?? part.variantId),
    isVerified: part.isVerified,
    matchedModelKey: part.matchedModelKey,
  };
}

/**
 * Legacy compatibility wrapper preserving the exact signature required by Admin.tsx and tests:
 * { result: Array<{ label: string; state: "ok" | "warning" | "error" }>, watts, recommended, valid, complete }
 */
export function compatibility(parts: Record<string, any>) {
  const canonicalParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {};
  for (const [key, part] of Object.entries(parts)) {
    if (!part) continue;
    canonicalParts[key as ComponentSlotId] = toCanonicalComponent(key, part);
  }

  const summary = checkCompatibility(canonicalParts);
  return {
    result: summary.items.map((item) => ({
      label: item.label,
      state:
        item.severity === "error"
          ? ("error" as const)
          : item.severity === "warning"
            ? ("warning" as const)
            : ("ok" as const),
    })),
    watts: summary.estimatedSystemLoadWatts,
    recommended: summary.recommendedPsuWatts,
    valid: summary.valid,
    complete: Object.keys(parts).length >= 6 && summary.complete,
    summary,
  };
}
