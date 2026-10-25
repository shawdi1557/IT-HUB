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
} from "./types"

export interface CheckCompatibilityOptions {
  workload?: "gaming" | "creation" | "work" | "general"
  budgetInr?: number
}

/**
 * Calculates estimated system electrical power and recommended power supply capacity.
 * Uses verified component TDPs + 80W base platform load (motherboard, memory, storage, fans)
 * with a documented 35% engineering safety headroom.
 */
export function calculateSystemPower(
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
): {
  estimatedSystemLoadWatts: number
  recommendedPsuWatts: number
  powerHeadroomWatts: number
  powerHeadroomStatus: "adequate" | "limited" | "deficit" | "unknown"
} {
  const cpu = components.CPU?.specs
  const gpu = components.GPU?.specs
  const psu = components.PSU?.specs

  const cpuWatts = cpu?.tdpWatts || (components.CPU ? 65 : 0)
  const gpuWatts = gpu?.powerWatts || (components.GPU ? 150 : 0)
  const platformBaseWatts = Object.keys(components).length > 0 ? 80 : 0

  const estimatedSystemLoadWatts = cpuWatts + gpuWatts + platformBaseWatts

  // 35% headroom rounded up to nearest 50W step, or GPU manufacturer recommendation
  const calculatedRecommended = Math.max(
    350,
    Math.ceil((estimatedSystemLoadWatts * 1.35) / 50) * 50,
  )
  const manufacturerRecommended = gpu?.recommendedPsuWatts || 0
  const recommendedPsuWatts = Math.max(calculatedRecommended, manufacturerRecommended)

  if (!psu?.ratedWattage) {
    return {
      estimatedSystemLoadWatts,
      recommendedPsuWatts,
      powerHeadroomWatts: 0,
      powerHeadroomStatus: "unknown",
    }
  }

  const powerHeadroomWatts = psu.ratedWattage - estimatedSystemLoadWatts
  let powerHeadroomStatus: "adequate" | "limited" | "deficit" = "adequate"

  if (psu.ratedWattage < estimatedSystemLoadWatts) {
    powerHeadroomStatus = "deficit"
  } else if (psu.ratedWattage < recommendedPsuWatts) {
    powerHeadroomStatus = "limited"
  }

  return {
    estimatedSystemLoadWatts,
    recommendedPsuWatts,
    powerHeadroomWatts,
    powerHeadroomStatus,
  }
}

/**
 * Comprehensive compatibility validator evaluating Rules A through J.
 */
export function checkCompatibility(
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  options: CheckCompatibilityOptions = {},
): CompatibilitySummary {
  const items: CompatibilityItem[] = []

  const cpu = components.CPU ? { ...components.CPU, specs: components.CPU.specs || {} } : undefined
  const mobo = components.Motherboard ? { ...components.Motherboard, specs: components.Motherboard.specs || {} } : undefined
  const ram = components.RAM ? { ...components.RAM, specs: components.RAM.specs || {} } : undefined
  const gpu = components.GPU ? { ...components.GPU, specs: components.GPU.specs || {} } : undefined
  const storage = components.Storage ? { ...components.Storage, specs: components.Storage.specs || {} } : undefined
  const psu = components.PSU ? { ...components.PSU, specs: components.PSU.specs || {} } : undefined
  const cabinet = components.Cabinet ? { ...components.Cabinet, specs: components.Cabinet.specs || {} } : undefined
  const cooler = components.Cooler ? { ...components.Cooler, specs: components.Cooler.specs || {} } : undefined

  // ───────────────────────────────────────────────────────────────────────────
  // Rule A — CPU and Motherboard Socket & Chipset Compatibility
  // ───────────────────────────────────────────────────────────────────────────
  if (cpu && mobo) {
    const cpuSocket = cpu.specs.socket?.toUpperCase().trim()
    const moboSocket = mobo.specs.socket?.toUpperCase().trim()

    if (!cpuSocket || !moboSocket) {
      items.push({
        ruleId: "RULE_A_SOCKET_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["CPU", "Motherboard"],
        label: "Socket specification unverified",
        explanation: `Unable to verify CPU socket (${cpuSocket || "unspecified"}) against motherboard socket (${moboSocket || "unspecified"}).`,
        suggestedResolution: "Check manufacturer specifications or request manual confirmation from IT HUB.",
        missingFields: [!cpuSocket ? "CPU.socket" : "", !moboSocket ? "Motherboard.socket" : ""].filter(Boolean),
      })
    } else if (cpuSocket !== moboSocket) {
      items.push({
        ruleId: "RULE_A_SOCKET_MISMATCH",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["CPU", "Motherboard"],
        label: "CPU & Motherboard socket mismatch",
        explanation: `The selected ${cpu.title} uses socket ${cpuSocket}, which cannot fit the ${mobo.title} (${moboSocket} socket).`,
        suggestedResolution: `Select a motherboard that supports the ${cpuSocket} socket, or choose a ${moboSocket}-compatible processor.`,
      })
    } else {
      // Sockets match! Check BIOS update requirements
      if (mobo.specs.requiresBiosUpdateForRyzen5000 || mobo.specs.requiresBiosUpdateForIntel13_14th) {
        items.push({
          ruleId: "RULE_A_BIOS_UPDATE",
          severity: "warning",
          status: "conditional",
          affectedSlots: ["CPU", "Motherboard"],
          label: "Motherboard BIOS update may be required",
          explanation: `This motherboard requires an updated BIOS version to boot with ${cpu.title}. IT HUB provides free BIOS flashing during system assembly.`,
          suggestedResolution: "IT HUB technicians will flash the latest stable BIOS before dispatch.",
        })
      } else {
        items.push({
          ruleId: "RULE_A_SOCKET_MATCH",
          severity: "info",
          status: "compatible",
          affectedSlots: ["CPU", "Motherboard"],
          label: `CPU & Motherboard compatible (${cpuSocket})`,
          explanation: `Processor and motherboard both support the ${cpuSocket} interface.`,
        })
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
      })
    }

    if (mobo) {
      const moboRam = mobo.specs.supportedRamGeneration?.toUpperCase().trim()
      const ramGen = ram.specs.ramGeneration?.toUpperCase().trim()

      if (!moboRam || !ramGen) {
        items.push({
          ruleId: "RULE_B_RAM_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["Motherboard", "RAM"],
          label: "Memory generation unverified",
          explanation: "Unable to confirm DDR generation compatibility between motherboard and RAM.",
          suggestedResolution: "Verify DDR4 vs DDR5 compatibility with IT HUB technical support.",
        })
      } else if (moboRam !== ramGen) {
        items.push({
          ruleId: "RULE_B_RAM_MISMATCH",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["Motherboard", "RAM"],
          label: `RAM generation mismatch (${ramGen} vs ${moboRam})`,
          explanation: `The ${mobo.title} only supports ${moboRam} memory, but ${ram.title} is ${ramGen}. Physical notches and voltages are incompatible.`,
          suggestedResolution: `Choose ${moboRam} memory modules to pair with this motherboard.`,
        })
      } else {
        items.push({
          ruleId: "RULE_B_RAM_MATCH",
          severity: "info",
          status: "compatible",
          affectedSlots: ["Motherboard", "RAM"],
          label: `RAM generation matches (${ramGen})`,
          explanation: `Both motherboard and memory modules utilize the ${ramGen} standard.`,
        })
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule C — CPU and CPU Cooler Compatibility & Height
  // ───────────────────────────────────────────────────────────────────────────
  if (cpu) {
    const hasCooler = Boolean(cooler)
    const includesStock = Boolean(cpu.specs.includesCooler)

    if (!hasCooler && !includesStock) {
      items.push({
        ruleId: "RULE_C_COOLER_REQUIRED",
        severity: "warning",
        status: "conditional",
        affectedSlots: ["CPU", "Cooler"],
        label: "Dedicated CPU cooler recommended",
        explanation: `${cpu.title} does not include a stock heatsink/fan in the retail package. An aftermarket air or liquid cooler is required.`,
        suggestedResolution: "Add an aftermarket CPU cooler to ensure safe operational temperatures.",
      })
    }

    if (cooler && cpu.specs.socket) {
      const coolerSockets = (cooler.specs.supportedSockets || []).map((s) => s.toUpperCase().trim())
      const cpuSocket = cpu.specs.socket.toUpperCase().trim()

      if (coolerSockets.length > 0 && !coolerSockets.includes(cpuSocket)) {
        items.push({
          ruleId: "RULE_C_COOLER_SOCKET_MISMATCH",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["CPU", "Cooler"],
          label: "Cooler bracket incompatible with CPU socket",
          explanation: `${cooler.title} does not list mounting brackets for ${cpuSocket}.`,
          suggestedResolution: `Choose a cooler with certified ${cpuSocket} mounting hardware.`,
        })
      }
    }

    if (cooler && cabinet) {
      const coolerHeight = cooler.specs.coolerHeightMm || 0
      const caseMaxHeight = cabinet.specs.maxCoolerHeightMm || 0

      if (coolerHeight > 0 && caseMaxHeight > 0 && coolerHeight > caseMaxHeight) {
        items.push({
          ruleId: "RULE_C_COOLER_HEIGHT_EXCEEDED",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["Cooler", "Cabinet"],
          label: "CPU cooler exceeds case clearance",
          explanation: `${cooler.title} is ${coolerHeight}mm tall, exceeding the cabinet's maximum clearance of ${caseMaxHeight}mm. The side panel will not close.`,
          suggestedResolution: `Select a lower profile air cooler (under ${caseMaxHeight}mm) or an all-in-one liquid cooler.`,
        })
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule D — GPU Physical Clearance in Case
  // ───────────────────────────────────────────────────────────────────────────
  if (gpu && cabinet) {
    const gpuLength = gpu.specs.lengthMm || 0
    const caseMaxGpu = cabinet.specs.maxGpuLengthMm || 0

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
        })
      } else {
        items.push({
          ruleId: "RULE_D_GPU_CLEARANCE_OK",
          severity: "info",
          status: "compatible",
          affectedSlots: ["GPU", "Cabinet"],
          label: `GPU fits case clearance (${gpuLength}mm / ${caseMaxGpu}mm)`,
          explanation: "Graphics card dimensions fit cleanly within cabinet internal clearances.",
        })
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule E & F — Power Consumption & PSU Headroom
  // ───────────────────────────────────────────────────────────────────────────
  const power = calculateSystemPower(components)

  if (psu) {
    if (power.powerHeadroomStatus === "deficit") {
      items.push({
        ruleId: "RULE_E_PSU_WATTAGE_DEFICIT",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["PSU"],
        label: "PSU capacity below estimated system consumption",
        explanation: `Total estimated system peak load is ${power.estimatedSystemLoadWatts}W, but the selected ${psu.title} is only rated for ${psu.specs.ratedWattage}W. The system will trigger over-current shutdown under load.`,
        suggestedResolution: `Upgrade to at least a ${power.recommendedPsuWatts}W power supply.`,
      })
    } else if (power.powerHeadroomStatus === "limited") {
      items.push({
        ruleId: "RULE_E_PSU_HEADROOM_LIMITED",
        severity: "warning",
        status: "conditional",
        affectedSlots: ["PSU"],
        label: "Limited power supply headroom",
        explanation: `The ${psu.title} (${psu.specs.ratedWattage}W) handles estimated consumption (${power.estimatedSystemLoadWatts}W), but provides less than the recommended 35% safety margin (${power.recommendedPsuWatts}W recommended).`,
        suggestedResolution: `Consider a ${power.recommendedPsuWatts}W unit for optimal energy efficiency and future component upgrades.`,
      })
    } else {
      items.push({
        ruleId: "RULE_E_PSU_HEADROOM_ADEQUATE",
        severity: "info",
        status: "compatible",
        affectedSlots: ["PSU"],
        label: `PSU has adequate power headroom (${psu.specs.ratedWattage}W)`,
        explanation: `Sufficient wattage for all components with healthy power headroom.`,
      })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule G — Motherboard and Cabinet Form Factor
  // ───────────────────────────────────────────────────────────────────────────
  if (mobo && cabinet) {
    const moboForm = mobo.specs.formFactor?.toUpperCase().trim()
    const caseForms = (cabinet.specs.supportedMotherboards || []).map((f) => f.toUpperCase().trim())

    if (moboForm && caseForms.length > 0) {
      if (!caseForms.includes(moboForm)) {
        items.push({
          ruleId: "RULE_G_FORM_FACTOR_MISMATCH",
          severity: "error",
          status: "incompatible",
          affectedSlots: ["Motherboard", "Cabinet"],
          label: `Motherboard form factor incompatible with case (${moboForm})`,
          explanation: `${cabinet.title} does not have standoff mounting holes or clearance for a ${moboForm} motherboard (supported: ${caseForms.join(", ")}).`,
          suggestedResolution: `Select an ${moboForm}-compatible cabinet or choose a motherboard matching the case.`,
        })
      } else {
        items.push({
          ruleId: "RULE_G_FORM_FACTOR_MATCH",
          severity: "info",
          status: "compatible",
          affectedSlots: ["Motherboard", "Cabinet"],
          label: `Form factor compatible (${moboForm})`,
          explanation: `Cabinet has standard standoffs and clearance for ${moboForm} motherboards.`,
        })
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule H — Storage Interface
  // ───────────────────────────────────────────────────────────────────────────
  if (storage && mobo) {
    const storageType = storage.specs.storageInterface?.toUpperCase() || ""
    if (storageType.includes("M.2") && (mobo.specs.m2SlotCount === 0)) {
      items.push({
        ruleId: "RULE_H_STORAGE_SLOT_MISSING",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["Storage", "Motherboard"],
        label: "Motherboard lacks required M.2 slot",
        explanation: `${storage.title} is an M.2 NVMe SSD, but ${mobo.title} has 0 M.2 slots.`,
        suggestedResolution: "Select a 2.5-inch SATA SSD or upgrade to a motherboard with M.2 NVMe slots.",
      })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule I — Conditional Discrete GPU Requirement
  // ───────────────────────────────────────────────────────────────────────────
  if (cpu && !gpu) {
    const hasIgpu = cpu.specs.hasIntegratedGraphics
    const isGamingOrCreation = options.workload === "gaming" || options.workload === "creation"

    if (hasIgpu === false) {
      items.push({
        ruleId: "RULE_I_GPU_MANDATORY_NO_IGPU",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["CPU", "GPU"],
        label: "Discrete graphics card required for display output",
        explanation: `${cpu.title} does not contain integrated graphics. Without a dedicated graphics card, your monitor will receive no video signal.`,
        suggestedResolution: "Add a dedicated graphics card to complete the build.",
      })
    } else if (isGamingOrCreation) {
      items.push({
        ruleId: "RULE_I_GPU_RECOMMENDED_FOR_WORKLOAD",
        severity: "warning",
        status: "conditional",
        affectedSlots: ["GPU"],
        label: "Discrete graphics card recommended for gaming/creation",
        explanation: "While the CPU includes basic display graphics, a dedicated graphics card is essential for smooth frame rates in modern games and 3D rendering.",
        suggestedResolution: "Add a dedicated GPU to meet your performance expectations.",
      })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Build Completeness & Overall Validity
  // ───────────────────────────────────────────────────────────────────────────
  const hasErrors = items.some((i) => i.severity === "error")
  const hasWarnings = items.some((i) => i.severity === "warning")

  let overallStatus: CompatibilityStatus = "compatible"
  if (hasErrors) overallStatus = "incompatible"
  else if (hasWarnings) overallStatus = "conditional"

  // Core essential slots
  const requiredPopulated = Boolean(
    cpu && mobo && ram && storage && psu && cabinet,
  )
  const coolerSatisfied = Boolean(cooler || cpu?.specs.includesCooler)
  const gpuSatisfied = Boolean(gpu || cpu?.specs.hasIntegratedGraphics !== false)
  const complete = requiredPopulated && coolerSatisfied && gpuSatisfied

  return {
    status: overallStatus,
    items,
    estimatedSystemLoadWatts: power.estimatedSystemLoadWatts,
    recommendedPsuWatts: power.recommendedPsuWatts,
    powerHeadroomWatts: power.powerHeadroomWatts,
    powerHeadroomStatus: power.powerHeadroomStatus,
    valid: !hasErrors,
    complete,
  }
}

/**
 * Legacy compatibility wrapper preserving the exact signature required by Admin.tsx and tests:
 * { result: Array<{ label: string; state: "ok" | "warning" | "error" }>, watts, recommended, valid, complete }
 */
export function compatibility(parts: Record<string, any>) {
  const canonicalParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {}
  for (const [key, part] of Object.entries(parts)) {
    if (!part) continue
    const slot = key as ComponentSlotId
    canonicalParts[slot] = {
      slot,
      productId: part.id || `part-${key}`,
      variantId: (part as any).variantId || `gid://shopify/ProductVariant/mock-${part.id || key}`,
      title: part.name || part.title || `${key} component`,
      price: part.price || 0,
      currency: "INR",
      specs: {
        socket: part.socket,
        supportedRamGeneration: part.ram,
        ramGeneration: part.ram,
        tdpWatts: part.watts,
        powerWatts: part.watts,
        ratedWattage: part.capacity,
        lengthMm: part.length,
        maxGpuLengthMm: part.clearance,
        maxCoolerHeightMm: part.clearance,
        coolerHeightMm: (part as any).height,
        hasWifi: part.wifi,
        requiresBiosUpdateForRyzen5000: part.bios,
        includesCooler: (part as any).includesCooler,
        hasIntegratedGraphics:
          (part as any).hasIntegratedGraphics ??
          (key === "CPU" ? part.name?.includes("G") || part.socket === "AM5" : undefined),
      },
      availability: "available",
      quantity: 1,
      retrievedAt: new Date().toISOString(),
    }
  }

  const summary = checkCompatibility(canonicalParts)
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
  }
}
