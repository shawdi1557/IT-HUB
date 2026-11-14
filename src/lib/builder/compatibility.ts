// src/lib/builder/compatibility.ts
// IT HUB Deterministic Hardware Compatibility Engine
// Pure functional engine with zero side effects, no React hooks, and full unit testability.

import {
  CONFIRMED_CONFIDENCE,
  confidenceFromProvenance,
  readPcieConnectors,
  type PcieConnectors,
  type SpecConfidence,
  type SpecProblem,
} from "./spec-schema";
import type {
  CanonicalBuildComponent,
  ComponentSlotId,
  CompatibilityItem,
  CompatibilityStatus,
  CompatibilitySummary,
  MissingInput,
  TechnicalSpecs,
} from "./types";

export interface CheckCompatibilityOptions {
  /** Parts the customer already has. They aren't missing, but nothing here can check them. */
  ownedSlots?: Iterable<string>;
  workload?: "gaming" | "creation" | "work" | "general";
  budgetInr?: number;
  mode?: "automated" | "manual";
  /**
   * Leaves out the wording that depends on the whole build: which values each Unknown is waiting for, and
   * whether a part's missing values are ones the build uses. Results and statuses are the same either way,
   * so a search that only reads them can skip it.
   */
  withoutMissingInputs?: boolean;
}

/**
 * Calculates estimated system electrical power and recommended power supply capacity.
 * The load is the processor's stated maximum power where known, otherwise its base power, plus the
 * graphics card's board power and 80W for the rest of the system. The recommended figure adds 35%
 * headroom, or uses the card maker's recommendation if that's higher. The two are different things:
 * the load decides whether a build can run at all, the recommendation decides whether it needs a look.
 */
export function calculateSystemPower(
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  options: { ownsGpu?: boolean } = {},
): {
  estimatedSystemLoadWatts: number;
  recommendedPsuWatts: number;
  powerHeadroomWatts: number;
  powerHeadroomStatus: "adequate" | "limited" | "deficit" | "unknown";
  /** True when a CPU or GPU power draw isn't known, so the estimate rests on a typical value. */
  usesAssumedPower: boolean;
  /** The load counting only stated figures. A power supply below this fails whatever else is unknown. */
  knownMinimumLoadWatts: number;
  /** False when the processor is counted at base power because its maximum isn't stated. */
  cpuPeakStated: boolean;
  /** The maker's recommendation for the graphics card, kept apart from the calculated load. */
  manufacturerRecommendedPsuWatts?: number;
} {
  const cpu = components.CPU?.specs;
  const gpu = components.GPU?.specs;
  const psu = components.PSU?.specs;

  const statedCpuWatts = cpu?.maxTurboPowerWatts || cpu?.tdpWatts || 0;
  const statedGpuWatts = gpu?.powerWatts || gpu?.tdpWatts || 0;
  const cpuWatts = statedCpuWatts || (components.CPU ? 65 : 0);
  const gpuWatts = statedGpuWatts || (components.GPU ? 150 : 0);
  // An owned card draws power too, and nothing here knows how much.
  const usesAssumedPower =
    Boolean(options.ownsGpu) ||
    Boolean(components.CPU && !cpu?.tdpWatts) ||
    Boolean(components.GPU && !gpu?.powerWatts && !gpu?.tdpWatts);
  const platformBaseWatts = Object.keys(components).length > 0 ? 80 : 0;

  const estimatedSystemLoadWatts = cpuWatts + gpuWatts + platformBaseWatts;
  const knownMinimumLoadWatts = statedCpuWatts + statedGpuWatts + platformBaseWatts;
  const cpuPeakStated = Boolean(cpu?.maxTurboPowerWatts);

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
      knownMinimumLoadWatts,
      cpuPeakStated,
      manufacturerRecommendedPsuWatts: manufacturerRecommended || undefined,
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
    knownMinimumLoadWatts,
    cpuPeakStated,
    manufacturerRecommendedPsuWatts: manufacturerRecommended || undefined,
  };
}

export { readPcieConnectors };
export type { PcieConnectors };

function statedConnectors(
  sixPlusTwo: number | undefined,
  sixteenPin: number | undefined,
  entries: string[] | undefined,
  wording: string | undefined,
): PcieConnectors | undefined {
  if (sixPlusTwo !== undefined || sixteenPin !== undefined) {
    // One count left blank isn't a zero: it stays unanswered unless the other type already rules it out.
    if (sixPlusTwo === undefined || sixteenPin === undefined) return undefined;
    return { sixPin: 0, eightPin: sixPlusTwo, sixteenPin };
  }
  if (entries?.length) return readPcieConnectors(entries);
  if (wording) return readPcieConnectors([wording]);
  return undefined;
}

/** What a power supply provides, or undefined if nobody has said. */
export function psuConnectors(specs: TechnicalSpecs): PcieConnectors | undefined {
  return statedConnectors(
    specs.pcie6Plus2Count,
    specs.pcie16PinCount,
    specs.pciePowerConnectors,
    undefined,
  );
}

/** What a graphics card needs, or undefined if nobody has said. */
export function gpuConnectorNeeds(specs: TechnicalSpecs): PcieConnectors | undefined {
  return statedConnectors(
    specs.pcie6Plus2Required,
    specs.pcie16PinRequired,
    specs.requiredPcieConnectors,
    specs.requiredPciePins,
  );
}

const totalConnectors = (set: PcieConnectors) => set.sixPin + set.eightPin + set.sixteenPin;

/** Describes the connectors a power supply is missing for a card. Types must match. */
export function missingConnectors(
  need: PcieConnectors,
  have: PcieConnectors,
  adapterEightPinPlugs = 0,
): string | undefined {
  const missing: string[] = [];
  // Only an adapter the card's maker puts in the box can stand in for a 16-pin cable.
  const short16Pin = Math.max(0, need.sixteenPin - have.sixteenPin);
  const eightPinForAdapter = short16Pin * adapterEightPinPlugs;
  const eightPinNeeded = need.eightPin + eightPinForAdapter;
  if (short16Pin > 0 && (adapterEightPinPlugs === 0 || eightPinNeeded > have.eightPin)) {
    missing.push(`${short16Pin} 16-pin`);
  } else if (need.eightPin > have.eightPin) {
    missing.push(`${need.eightPin - have.eightPin} 8-pin`);
  }
  // A 6+2-pin plug left over can serve a 6-pin socket. Nothing else can.
  const spareForSixPin = have.sixPin + Math.max(0, have.eightPin - eightPinNeeded);
  if (need.sixPin > spareForSixPin) missing.push(`${need.sixPin - spareForSixPin} 6-pin`);
  return missing.length > 0 ? missing.join(" and ") : undefined;
}

/**
 * Anything nobody can yet confirm goes to review, so IT HUB checks it: an unknown doesn't make a build
 * incompatible, but it does mean nobody can say it's compatible. These are the exceptions that aren't
 * unknowns at all. Below the maker's recommended wattage is here because a recommendation isn't a limit,
 * and a possible BIOS update because nobody here can say whether this processor needs one.
 */
const REVIEW_RULES = new Set(["RULE_E_PSU_BELOW_RECOMMENDED", "RULE_A_BIOS_UPDATE"]);

/**
 * What a screen lists. The general notice that specifications are incomplete only repeats what the
 * individual checks already say, so it's shown when it's the only thing saying it. The result stays in
 * the summary, and doesn't change the build's status.
 */
export function reportedItems<T extends Pick<CompatibilityItem, "status" | "ruleId">>(
  items: T[],
): T[] {
  if (!items.some((item) => item.status === "unknown")) return items;
  return items.filter((item) => item.ruleId !== "RULE_J_SPEC_UNVERIFIED");
}

/** Whether a result sends a build to IT HUB, as opposed to being advice the customer can read. */
export function reachesReview(item: Pick<CompatibilityItem, "status" | "ruleId">): boolean {
  return item.status === "unknown" || REVIEW_RULES.has(item.ruleId);
}

const SPEC_PROBLEM_WORDING: Record<
  SpecProblem["kind"],
  { ruleId: string; label: string; consequence: string }
> = {
  invalid: {
    ruleId: "RULE_K_SPEC_INVALID",
    label: "unreadable specification",
    consequence: "This value isn't being used.",
  },
  conflict: {
    ruleId: "RULE_K_SPEC_CONFLICT",
    label: "conflicting specification",
    consequence: "This value isn't being used.",
  },
  review: {
    ruleId: "RULE_K_REVIEW_INCOMPLETE",
    label: "review record incomplete",
    consequence: "Its specifications count as unreviewed.",
  },
  rejected: {
    ruleId: "RULE_K_SPEC_REJECTED",
    label: "specifications rejected",
    consequence: "IT HUB must check this part before it can be confirmed.",
  },
};

/** IT HUB has marked this product's Shopify values as wrong. */
export function hasRejectedSpecs(specs?: TechnicalSpecs): boolean {
  return Boolean(specs?.specProblems?.some((problem) => problem.kind === "rejected"));
}

/** Compares motherboard sizes whichever way a supplier spells them. */
function normalizeFormFactor(value: string): string {
  const compact = value.toUpperCase().replace(/[\s_-]/g, "");
  if (compact === "MATX" || compact === "MICROATX" || compact === "UATX") return "MICRO-ATX";
  if (compact === "ITX" || compact === "MINIITX") return "MINI-ITX";
  if (compact === "EATX") return "E-ATX";
  return compact;
}

type MismatchInput = { slot: ComponentSlotId; fields: (keyof TechnicalSpecs)[]; name: string };
const input = (
  slot: ComponentSlotId,
  name: string,
  ...fields: (keyof TechnicalSpecs)[]
): MismatchInput => ({ slot, fields, name });

/** The values each blocking rule compares, so a result resting on a title can say so. */
const MISMATCH_INPUTS: Record<string, MismatchInput[]> = {
  RULE_A_SOCKET_MISMATCH: [
    input("CPU", "socket", "socket"),
    input("Motherboard", "socket", "socket"),
  ],
  RULE_B_RAM_SODIMM_ERROR: [input("RAM", "module type", "isLaptopSoDimm")],
  RULE_B_RAM_MISMATCH: [
    input("Motherboard", "memory generation", "supportedRamGeneration"),
    input("RAM", "memory generation", "ramGeneration"),
  ],
  RULE_B_RAM_SLOTS_EXCEEDED: [
    input("Motherboard", "memory slots", "ramSlots"),
    input("RAM", "module count", "moduleCount"),
  ],
  RULE_B_RAM_CAPACITY_EXCEEDED: [
    input("Motherboard", "memory limit", "maxRamCapacityGb"),
    input("RAM", "capacity", "capacityGb"),
  ],
  RULE_B_CPU_RAM_MISMATCH: [
    input("CPU", "memory support", "supportedRamGen"),
    input("RAM", "memory generation", "ramGeneration"),
  ],
  RULE_C_COOLER_SOCKET_MISMATCH: [
    input("CPU", "socket", "socket"),
    input("Cooler", "supported sockets", "supportedSockets"),
  ],
  RULE_C_COOLER_HEIGHT_EXCEEDED: [
    input("Cooler", "height", "coolerHeightMm"),
    input("Cabinet", "cooler limit", "maxCoolerHeightMm"),
  ],
  RULE_D_GPU_LENGTH_EXCEEDED: [
    input("GPU", "length", "lengthMm"),
    input("Cabinet", "graphics card limit", "maxGpuLengthMm"),
  ],
  RULE_E_PSU_WATTAGE_DEFICIT: [
    input("PSU", "wattage", "ratedWattage"),
    input("CPU", "power draw", "maxTurboPowerWatts", "tdpWatts"),
    input("GPU", "power draw", "powerWatts", "tdpWatts"),
  ],
  RULE_F_PCIE_POWER_INSUFFICIENT: [
    input("PSU", "power connectors", "pcie6Plus2Count", "pcie16PinCount", "pciePowerConnectors"),
    input(
      "GPU",
      "power connectors",
      "pcie6Plus2Required",
      "pcie16PinRequired",
      "requiredPcieConnectors",
      "requiredPciePins",
    ),
    input("GPU", "power draw", "powerWatts", "tdpWatts"),
  ],
  RULE_G_FORM_FACTOR_MISMATCH: [
    input("Motherboard", "size", "formFactor"),
    input("Cabinet", "motherboard sizes", "supportedMotherboards"),
  ],
  RULE_H_STORAGE_SLOT_MISSING: [
    input("Storage", "interface", "storageInterface"),
    input("Motherboard", "M.2 slots", "m2SlotCount"),
  ],
  RULE_H_STORAGE_PORT_MISSING: [
    input("Storage", "interface", "storageInterface"),
    input("Motherboard", "SATA ports", "sataPortCount"),
  ],
  RULE_I_GPU_MANDATORY_NO_IGPU: [input("CPU", "integrated graphics", "hasIntegratedGraphics")],
};

/**
 * A mismatch blocks a build whatever it rests on, but one resting on a value only read from a product
 * title has to say so, because nobody has confirmed that value. The label is what a customer sees.
 */
function noteTitleInferredBasis(
  items: CompatibilityItem[],
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
) {
  for (const item of items) {
    if (item.severity !== "error") continue;
    const inferred = (MISMATCH_INPUTS[item.ruleId] || []).filter(({ slot, fields }) => {
      const part = components[slot];
      const field = part && fields.find((candidate) => part.specs?.[candidate] !== undefined);
      return Boolean(part && field && specConfidence(part, field) === "title_inferred");
    });
    if (inferred.length === 0) continue;
    const names = inferred.map(({ slot, name }) => `the ${name} of ${components[slot]!.title}`);
    item.label = `${item.label} (from a product title, not confirmed)`;
    item.explanation = `${item.explanation} This rests on ${names.join(" and ")}, read from the product title and not from a confirmed specification.`;
    item.dataProvenance = "title_inferred";
  }
}

/** How Rule H reads a drive's connection, so the rule and the input list can't disagree. */
function storageConnection(specs: TechnicalSpecs) {
  const type = specs.storageInterface?.toUpperCase() || "";
  const usesM2 = type.includes("M.2") || type.includes("NVME");
  const usesSata = type.includes("SATA");
  return { usesM2, usesSata };
}

/** The other parts of a build, as the input list reads them. */
interface BuildView {
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>;
  ownsGpu: boolean;
  cpu?: TechnicalSpecs;
  board?: TechnicalSpecs;
  ram?: TechnicalSpecs;
  gpu?: TechnicalSpecs;
  storage?: TechnicalSpecs;
  psu?: TechnicalSpecs;
  cabinet?: TechnicalSpecs;
  cooler?: TechnicalSpecs;
}

interface InputRequirement {
  slot: ComponentSlotId;
  name: string;
  /** The rules that return Unknown without this value. */
  ruleIds: string[];
  /** Read the way the rule reads it: a blank count or a half-filled pair of connector counts isn't a value. */
  stated: (specs: TechnicalSpecs) => boolean;
  /** Whether this build's rules read it. */
  needed: (build: BuildView) => boolean;
  /** Set when a build can legitimately do without it, saying which builds can't. */
  onlyWhen?: string;
  /** A question no specification field can answer yet, so a part report names it on the part that raises it. */
  reportedOn?: { slot: ComponentSlotId; when: (specs: TechnicalSpecs) => boolean };
}

// The power rules stop at the first thing they can't answer, and the connector rules likewise, so whichever
// one is reported is waiting for all the values in its group.
const POWER_UNKNOWNS = [
  "RULE_E_PSU_WATTAGE_UNKNOWN",
  "RULE_E_POWER_DRAW_UNKNOWN",
  "RULE_E_RECOMMENDED_UNKNOWN",
  "RULE_E_CPU_PEAK_UNKNOWN",
];
const CONNECTOR_UNKNOWNS = [
  "RULE_F_GPU_POWER_UNKNOWN",
  "RULE_F_GPU_CONNECTORS_UNKNOWN",
  "RULE_F_PCIE_CONNECTORS_UNKNOWN",
  "RULE_F_PCIE_POWER_UNKNOWN",
];

const hasText = (value?: string) => Boolean(value?.trim());
const hasNumber = (value?: number) => Boolean(value);
const hasEntries = (value?: unknown[]) => Boolean(value?.length);
const answered = (value: unknown) => value !== undefined;

/** A card stated as needing no cable, and drawing what a slot can supply, doesn't use the supply's cables. */
function runsFromSlotPower(gpu: TechnicalSpecs): boolean {
  const need = gpuConnectorNeeds(gpu);
  return Boolean(
    need && totalConnectors(need) === 0 && (gpu.powerWatts || gpu.tdpWatts || 0) <= 75,
  );
}

/**
 * Every value a compatibility rule can return Unknown without, and when it does. This is the one list:
 * the engine marks its results from it, and the labels, the checks list and the staff report all read it.
 * It only says what's missing. It never decides a result, so a value being stated never makes a build match.
 */
const INPUT_REQUIREMENTS: InputRequirement[] = [
  // Processor and motherboard
  {
    slot: "CPU",
    name: "socket",
    ruleIds: ["RULE_A_SOCKET_UNKNOWN", "RULE_C_COOLER_SOCKET_UNKNOWN"],
    stated: (specs) => hasText(specs.socket),
    needed: ({ cpu, board, cooler }) => Boolean(cpu && (board || cooler)),
  },
  {
    slot: "Motherboard",
    name: "socket",
    ruleIds: ["RULE_A_SOCKET_UNKNOWN"],
    stated: (specs) => hasText(specs.socket),
    needed: ({ cpu, board }) => Boolean(cpu && board),
  },
  // Memory
  {
    slot: "RAM",
    name: "module type",
    ruleIds: ["RULE_B_RAM_TYPE_UNKNOWN"],
    stated: (specs) => answered(specs.isLaptopSoDimm),
    needed: ({ ram }) => Boolean(ram),
  },
  {
    slot: "Motherboard",
    name: "memory generation",
    ruleIds: ["RULE_B_RAM_UNKNOWN"],
    stated: (specs) => hasText(specs.supportedRamGeneration),
    needed: ({ ram, board }) => Boolean(ram && board),
  },
  {
    slot: "RAM",
    name: "memory generation",
    ruleIds: ["RULE_B_RAM_UNKNOWN"],
    stated: (specs) => hasText(specs.ramGeneration),
    needed: ({ ram, board }) => Boolean(ram && board),
  },
  {
    slot: "RAM",
    name: "module count",
    ruleIds: ["RULE_B_RAM_LIMITS_UNKNOWN"],
    stated: (specs) => hasNumber(specs.moduleCount),
    needed: ({ ram, board }) => Boolean(ram && board),
  },
  {
    slot: "RAM",
    name: "capacity",
    ruleIds: ["RULE_B_RAM_LIMITS_UNKNOWN"],
    stated: (specs) => hasNumber(specs.capacityGb),
    needed: ({ ram, board }) => Boolean(ram && board),
  },
  {
    slot: "Motherboard",
    name: "memory slots",
    ruleIds: ["RULE_B_RAM_LIMITS_UNKNOWN"],
    stated: (specs) => hasNumber(specs.ramSlots),
    needed: ({ ram, board }) => Boolean(ram && board),
  },
  {
    slot: "Motherboard",
    name: "memory limit",
    ruleIds: ["RULE_B_RAM_LIMITS_UNKNOWN"],
    stated: (specs) => hasNumber(specs.maxRamCapacityGb),
    needed: ({ ram, board }) => Boolean(ram && board),
  },
  // Cooling. A boxed cooler has no height to check, so none of the height values apply to it.
  {
    slot: "CPU",
    name: "included cooler",
    ruleIds: ["RULE_C_STOCK_COOLER_UNKNOWN"],
    stated: (specs) => answered(specs.includesCooler),
    needed: ({ cpu, cooler }) => Boolean(cpu && !cooler),
    onlyWhen: "no separate cooler is chosen",
  },
  {
    slot: "Cooler",
    name: "supported sockets",
    ruleIds: ["RULE_C_COOLER_SOCKET_UNKNOWN"],
    stated: (specs) => hasEntries(specs.supportedSockets),
    needed: ({ cpu, cooler }) => Boolean(cpu && cooler),
  },
  {
    slot: "Cooler",
    name: "height",
    ruleIds: ["RULE_C_COOLER_HEIGHT_UNKNOWN"],
    stated: (specs) => hasNumber(specs.coolerHeightMm),
    needed: ({ cpu, cooler, cabinet }) => Boolean(cpu && cooler && cabinet),
  },
  {
    slot: "Cabinet",
    name: "cooler height limit",
    ruleIds: ["RULE_C_COOLER_HEIGHT_UNKNOWN"],
    stated: (specs) => hasNumber(specs.maxCoolerHeightMm),
    needed: ({ cpu, cooler, cabinet }) => Boolean(cpu && cooler && cabinet),
    onlyWhen: "a separate cooler is chosen",
  },
  // Graphics card clearance
  {
    slot: "GPU",
    name: "length",
    ruleIds: ["RULE_D_GPU_CLEARANCE_UNKNOWN"],
    stated: (specs) => hasNumber(specs.lengthMm),
    needed: ({ gpu, cabinet }) => Boolean(gpu && cabinet),
  },
  {
    slot: "Cabinet",
    name: "graphics card clearance",
    ruleIds: ["RULE_D_GPU_CLEARANCE_UNKNOWN"],
    stated: (specs) => hasNumber(specs.maxGpuLengthMm),
    needed: ({ gpu, cabinet }) => Boolean(gpu && cabinet),
    onlyWhen: "a graphics card is chosen",
  },
  // Power
  {
    slot: "PSU",
    name: "wattage",
    ruleIds: [...POWER_UNKNOWNS, "RULE_F_PCIE_POWER_UNKNOWN"],
    stated: (specs) => hasNumber(specs.ratedWattage),
    needed: ({ psu }) => Boolean(psu),
  },
  {
    slot: "CPU",
    name: "power draw",
    ruleIds: POWER_UNKNOWNS,
    stated: (specs) => hasNumber(specs.tdpWatts),
    needed: ({ cpu, psu }) => Boolean(cpu && psu),
  },
  {
    slot: "CPU",
    name: "maximum power",
    ruleIds: POWER_UNKNOWNS,
    stated: (specs) => hasNumber(specs.maxTurboPowerWatts),
    needed: ({ cpu, psu, components, ownsGpu }) => {
      if (!cpu || !psu?.ratedWattage) return false;
      const power = calculateSystemPower(components, { ownsGpu });
      // Below the card's recommendation is reported first, and IT HUB checks the supply anyway.
      const belowRecommended = psu.ratedWattage < (power.manufacturerRecommendedPsuWatts || 0);
      return power.powerHeadroomStatus === "limited" && !belowRecommended;
    },
    onlyWhen: "the power supply has limited headroom",
  },
  {
    slot: "GPU",
    name: "power draw",
    ruleIds: [...POWER_UNKNOWNS, "RULE_F_GPU_POWER_UNKNOWN"],
    stated: (specs) => hasNumber(specs.powerWatts) || hasNumber(specs.tdpWatts),
    needed: ({ gpu, psu }) => Boolean(gpu && psu),
  },
  {
    slot: "GPU",
    name: "recommended power supply",
    ruleIds: POWER_UNKNOWNS,
    stated: (specs) => hasNumber(specs.recommendedPsuWatts),
    needed: ({ gpu, psu }) => Boolean(gpu && psu),
  },
  {
    slot: "GPU",
    name: "power connectors",
    ruleIds: CONNECTOR_UNKNOWNS,
    stated: (specs) => gpuConnectorNeeds(specs) !== undefined,
    needed: ({ gpu, psu }) => Boolean(gpu && psu),
  },
  {
    slot: "PSU",
    name: "power connectors",
    ruleIds: CONNECTOR_UNKNOWNS,
    stated: (specs) => psuConnectors(specs) !== undefined,
    needed: ({ gpu, psu }) => Boolean(gpu && psu && !runsFromSlotPower(gpu)),
    onlyWhen: "a graphics card that needs a power cable is chosen",
  },
  // Motherboard and cabinet
  {
    slot: "Motherboard",
    name: "form factor",
    ruleIds: ["RULE_G_FORM_FACTOR_UNKNOWN"],
    stated: (specs) => Boolean(specs.formFactor),
    needed: ({ board, cabinet }) => Boolean(board && cabinet),
  },
  {
    slot: "Cabinet",
    name: "supported motherboards",
    ruleIds: ["RULE_G_FORM_FACTOR_UNKNOWN"],
    stated: (specs) => hasEntries(specs.supportedMotherboards),
    needed: ({ board, cabinet }) => Boolean(board && cabinet),
  },
  // Storage connection
  {
    slot: "Storage",
    name: "interface",
    ruleIds: ["RULE_H_STORAGE_UNKNOWN"],
    stated: (specs) => {
      const { usesM2, usesSata } = storageConnection(specs);
      return usesM2 || usesSata;
    },
    needed: ({ storage, board }) => Boolean(storage && board),
  },
  {
    slot: "Motherboard",
    name: "M.2 slots",
    ruleIds: ["RULE_H_STORAGE_UNKNOWN", "RULE_H_M2_SATA_UNKNOWN"],
    stated: (specs) => answered(specs.m2SlotCount),
    needed: ({ storage, board }) => Boolean(storage && board && storageConnection(storage).usesM2),
    onlyWhen: "an M.2 drive is chosen",
  },
  {
    slot: "Motherboard",
    name: "SATA ports",
    ruleIds: ["RULE_H_STORAGE_UNKNOWN"],
    stated: (specs) => answered(specs.sataPortCount),
    needed: ({ storage, board }) => {
      if (!storage || !board) return false;
      const { usesM2, usesSata } = storageConnection(storage);
      return usesSata && !usesM2;
    },
    onlyWhen: "a SATA drive is chosen",
  },
  {
    slot: "Motherboard",
    name: "M.2 SATA support",
    ruleIds: ["RULE_H_M2_SATA_UNKNOWN"],
    stated: (specs) => typeof specs.m2SataSupported === "boolean",
    needed: ({ storage, board }) => {
      if (!storage || !board || board.m2SlotCount === 0) return false;
      const { usesM2, usesSata } = storageConnection(storage);
      return usesM2 && usesSata;
    },
    onlyWhen: "an M.2 SATA drive is chosen",
    reportedOn: {
      slot: "Storage",
      when: (specs) => {
        const { usesM2, usesSata } = storageConnection(specs);
        return usesM2 && usesSata;
      },
    },
  },
  // Display output
  {
    slot: "CPU",
    name: "integrated graphics",
    ruleIds: ["RULE_I_DISPLAY_OUTPUT_UNKNOWN"],
    stated: (specs) => answered(specs.hasIntegratedGraphics),
    needed: ({ cpu, gpu, ownsGpu }) => Boolean(cpu && !gpu && !ownsGpu),
    onlyWhen: "no graphics card is chosen",
  },
];

function viewOfBuild(
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  options: Pick<CheckCompatibilityOptions, "ownedSlots">,
): BuildView {
  const owned = new Set(options.ownedSlots || []);
  return {
    components,
    // Choosing a part for a slot means the customer isn't using their own there.
    ownsGpu: owned.has("GPU") && !components.GPU,
    cpu: components.CPU && (components.CPU.specs || {}),
    board: components.Motherboard && (components.Motherboard.specs || {}),
    ram: components.RAM && (components.RAM.specs || {}),
    gpu: components.GPU && (components.GPU.specs || {}),
    storage: components.Storage && (components.Storage.specs || {}),
    psu: components.PSU && (components.PSU.specs || {}),
    cabinet: components.Cabinet && (components.Cabinet.specs || {}),
    cooler: components.Cooler && (components.Cooler.specs || {}),
  };
}

/** The values a part lacks that the rules for this build read. */
export function checkInputsMissing(
  part: Pick<CanonicalBuildComponent, "slot" | "title" | "specs">,
  build: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {},
  options: Pick<CheckCompatibilityOptions, "ownedSlots"> = {},
): MissingInput[] {
  const view = viewOfBuild({ ...build, [part.slot]: part }, options);
  const specs = part.specs || {};
  return INPUT_REQUIREMENTS.filter(
    (requirement) =>
      requirement.slot === part.slot && !requirement.stated(specs) && requirement.needed(view),
  ).map(({ slot, name, ruleIds }) => ({ slot, title: part.title, name, ruleIds }));
}

/**
 * Whether everything a part lacks is a value this build never reads, such as a supply's cables in a build
 * with no graphics card. A part with any value stated but unconfirmed, or missing for another reason, doesn't.
 */
function lacksOnlyUnusedValues(
  part: CanonicalBuildComponent,
  build: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  ownedSlots: Iterable<string>,
): boolean {
  const missing = missingCriticalSpecs(part);
  if (missing.length === 0 || part.specs?.unreviewedSpecs?.length) return false;
  if (criticalSpecsAt(part, (level) => !isConfirmedLevel(level)).length > 0) return false;
  const view = viewOfBuild(build, { ownedSlots });
  return missing.every((name) =>
    INPUT_REQUIREMENTS.some(
      (requirement) =>
        requirement.slot === part.slot &&
        requirement.name === name &&
        requirement.onlyWhen &&
        !requirement.needed(view),
    ),
  );
}

/** The same, for every part in a build. */
export function buildInputsMissing(
  build: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  options: Pick<CheckCompatibilityOptions, "ownedSlots"> = {},
): MissingInput[] {
  // Always in the same part order, so every screen lists the same values the same way.
  return INPUT_SLOT_ORDER.flatMap((slot) =>
    build[slot] ? checkInputsMissing(build[slot]!, build, options) : [],
  );
}

const INPUT_SLOT_ORDER: ComponentSlotId[] = [
  "CPU",
  "Motherboard",
  "RAM",
  "GPU",
  "Storage",
  "PSU",
  "Cabinet",
  "Cooler",
];

export const describeMissingInputs = (inputs: MissingInput[]) =>
  inputs.map(({ name, title }) => `${name} of ${title}`).join("; ");

/**
 * What a part lacks before any build exists, for a report on the catalogue: values every build reads, and
 * values only some builds read, each saying which. Empty on both means no build can return Unknown for a
 * value missing from this part.
 */
export function inputsNeededByPart(part: Pick<CanonicalBuildComponent, "slot" | "specs">): {
  always: string[];
  sometimes: { name: string; when: string }[];
} {
  const specs = part.specs || {};
  const own = INPUT_REQUIREMENTS.filter(
    (requirement) => requirement.slot === part.slot && !requirement.reportedOn,
  );
  const unanswerable = INPUT_REQUIREMENTS.filter(
    ({ reportedOn }) => reportedOn?.slot === part.slot && reportedOn.when(specs),
  );
  const conditional = new Set(own.filter(({ onlyWhen }) => onlyWhen).map(({ name }) => name));
  const always = [
    ...own
      .filter((requirement) => !requirement.onlyWhen && !requirement.stated(specs))
      .map(({ name }) => name),
    ...missingCriticalSpecs(part).filter((name) => !conditional.has(name)),
  ];
  return {
    always: [...new Set(always)],
    sometimes: [...own.filter((requirement) => requirement.onlyWhen), ...unanswerable]
      .filter((requirement) => !requirement.stated(specs))
      .map(({ name, onlyWhen }) => ({ name, when: onlyWhen! })),
  };
}

/**
 * Comprehensive compatibility validator evaluating Rules A through J.
 */
export function checkCompatibility(
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  options: CheckCompatibilityOptions = {},
): CompatibilitySummary {
  const items: CompatibilityItem[] = [];
  // Choosing a part for a slot means the customer isn't using their own there.
  const owned = new Set<string>(
    [...(options.ownedSlots || [])].filter((slot) => !components[slot as ComponentSlotId]),
  );
  const ownsGpu = owned.has("GPU");

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
      // The flag belongs to the motherboard and names no processor family, so it can't be narrowed to one
      // here. Nothing in the catalogue says which processors a board supports.
      if (mobo.specs.requiresBiosUpdateForRyzen5000) {
        items.push({
          ruleId: "RULE_A_BIOS_UPDATE",
          severity: "warning",
          status: "conditional",
          affectedSlots: ["CPU", "Motherboard"],
          label: "Motherboard BIOS update may be required",
          explanation: `${mobo.title} is flagged as possibly needing a BIOS update, without saying for which processors, so ${cpu.title} may need one to boot.`,
          suggestedResolution: "IT HUB will confirm the BIOS version before ordering.",
        });
      } else {
        items.push({
          ruleId: "RULE_A_SOCKET_MATCH",
          severity: "info",
          status: "compatible",
          affectedSlots: ["CPU", "Motherboard"],
          label: `Socket matches (${cpuSocket})`,
          explanation: `Processor and motherboard both use the ${cpuSocket} socket. Chipset, processor generation and BIOS support aren't checked here.`,
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
    } else if (ram.specs.isLaptopSoDimm === undefined) {
      items.push({
        ruleId: "RULE_B_RAM_TYPE_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["RAM"],
        label: "Memory module type unverified",
        explanation: `Unable to confirm that ${ram.title} is desktop memory (DIMM) and not laptop memory (SO-DIMM).`,
        suggestedResolution: "IT HUB will confirm the memory type.",
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
        label: "CPU cooler required",
        explanation: `${cpu.title} does not include a stock heatsink/fan in the retail package. An aftermarket air or liquid cooler is required.`,
        suggestedResolution: "Add a CPU cooler to complete this build.",
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
      } else if (gpuLength === caseMaxGpu) {
        items.push({
          ruleId: "RULE_D_GPU_CLEARANCE_OK",
          severity: "info",
          status: "compatible",
          affectedSlots: ["GPU", "Cabinet"],
          label: `Tight fit: GPU fits case clearance (${gpuLength}mm / ${caseMaxGpu}mm)`,
          explanation: `${gpu.title}'s stated length equals ${cabinet.title}'s stated clearance, so it fits with no margin.`,
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
  const power = calculateSystemPower(components, { ownsGpu });

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
    } else if (psu.specs.ratedWattage < power.knownMinimumLoadWatts) {
      items.push({
        ruleId: "RULE_E_PSU_WATTAGE_DEFICIT",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["PSU"],
        label: "PSU capacity below estimated system consumption",
        explanation: `This build can draw about ${power.knownMinimumLoadWatts}W, but ${psu.title} is only rated for ${psu.specs.ratedWattage}W. The PC could shut down under load.`,
        suggestedResolution: `Choose a power supply of at least ${power.recommendedPsuWatts}W.`,
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
    } else if (
      power.manufacturerRecommendedPsuWatts &&
      psu.specs.ratedWattage < power.manufacturerRecommendedPsuWatts
    ) {
      items.push({
        ruleId: "RULE_E_PSU_BELOW_RECOMMENDED",
        severity: "warning",
        status: "conditional",
        affectedSlots: ["GPU", "PSU"],
        label: "PSU below the graphics card's recommended wattage",
        explanation: `The ${psu.title} (${psu.specs.ratedWattage}W) covers the estimated load of ${power.estimatedSystemLoadWatts}W, but ${gpu?.title} recommends at least ${power.manufacturerRecommendedPsuWatts}W. An IT HUB technician needs to check this.`,
        suggestedResolution: `Choose a power supply of at least ${power.manufacturerRecommendedPsuWatts}W, or have IT HUB confirm this one.`,
      });
    } else if (gpu && !power.manufacturerRecommendedPsuWatts) {
      items.push({
        ruleId: "RULE_E_RECOMMENDED_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["GPU", "PSU"],
        label: "Graphics card's recommended power supply unverified",
        explanation: `${psu.title} (${psu.specs.ratedWattage}W) covers the estimated load of ${power.estimatedSystemLoadWatts}W, but the wattage ${gpu.title}'s maker recommends isn't stated, so it can't be checked.`,
        suggestedResolution: "IT HUB will confirm the power supply for this card.",
      });
    } else if (power.powerHeadroomStatus === "limited" && !power.cpuPeakStated && cpu) {
      items.push({
        ruleId: "RULE_E_CPU_PEAK_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["CPU", "PSU"],
        label: "Processor's maximum power unverified",
        explanation: `${cpu.title} is counted at its ${cpu.specs.tdpWatts}W base power because its maximum isn't stated. ${psu.title} (${psu.specs.ratedWattage}W) leaves little margin above ${power.estimatedSystemLoadWatts}W, so that could matter.`,
        suggestedResolution: "IT HUB will confirm the power supply for this build.",
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
      const gpuWatts = gpu.specs.powerWatts || gpu.specs.tdpWatts || 0;
      const need = gpuConnectorNeeds(gpu.specs);
      const have = psuConnectors(psu.specs);
      // A PCIe slot supplies at most 75W, so a card drawing more needs a cable whatever else is unknown.
      // Drawing less doesn't show the reverse: some low-power cards still have a connector, so only a
      // stated answer of zero means no cable.
      const needsNoCable = need ? totalConnectors(need) === 0 : false;
      const slotPowerIsEnough = needsNoCable && gpuWatts <= 75;

      if (needsNoCable && !slotPowerIsEnough) {
        items.push({
          ruleId: "RULE_F_GPU_CONNECTORS_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["GPU", "PSU"],
          label: "Graphics card connector type unverified",
          explanation: `${gpu.title} is listed as needing no power cable, but it draws ${gpuWatts}W and a PCIe slot supplies at most 75W. One of those values is wrong.`,
          suggestedResolution: "IT HUB will confirm the power cables for this card.",
        });
      } else if (slotPowerIsEnough) {
        items.push({
          ruleId: "RULE_F_PCIE_POWER_NOT_REQUIRED",
          severity: "info",
          status: "compatible",
          affectedSlots: ["GPU"],
          label: "PCIe slot power sufficient (≤75W)",
          explanation: `${gpu.title} is stated as needing no PCIe power cable, and runs from the ≤75W a slot supplies.`,
        });
      } else if (!need && !gpuWatts) {
        items.push({
          ruleId: "RULE_F_GPU_POWER_UNKNOWN",
          severity: "warning",
          status: "unknown",
          affectedSlots: ["GPU", "PSU"],
          label: "Graphics card power connector unverified",
          explanation: `${gpu.title} has no stated power draw or connector, so its PCIe power needs can't be checked.`,
          suggestedResolution: "IT HUB will confirm the power cables for this card.",
        });
      } else if (!have) {
        items.push(
          psu.specs.ratedWattage
            ? {
                ruleId: "RULE_F_PCIE_CONNECTORS_UNKNOWN",
                severity: "warning",
                status: "unknown",
                affectedSlots: ["GPU", "PSU"],
                label: "PSU PCIe cables unverified",
                explanation: `${psu.title} has no stated PCIe power cables, so they can't be checked against ${gpu.title}.`,
                suggestedResolution: "IT HUB will confirm the power cables for this card.",
              }
            : {
                ruleId: "RULE_F_PCIE_POWER_UNKNOWN",
                severity: "warning",
                status: "unknown",
                affectedSlots: ["GPU", "PSU"],
                label: "PCIe power connector compatibility unverified",
                explanation: `Unable to verify PCIe auxiliary power connectors on ${psu.title} for ${gpu.title}.`,
                suggestedResolution:
                  "Verify PSU cable configuration with IT HUB technical support.",
              },
        );
      } else {
        // Zero connectors can't power a card that needs more than the slot gives, whatever its type.
        const missing = need
          ? missingConnectors(need, have, gpu.specs.pcie16PinAdapter8PinCount)
          : gpuWatts > 75 && totalConnectors(have) === 0
            ? "any PCIe power connector"
            : undefined;
        if (missing) {
          items.push({
            ruleId: "RULE_F_PCIE_POWER_INSUFFICIENT",
            severity: "error",
            status: "incompatible",
            affectedSlots: ["GPU", "PSU"],
            label: "Insufficient PCIe power cables",
            explanation: `${gpu.title} needs PCIe power that ${psu.title} doesn't have: it's short of ${missing}.`,
            suggestedResolution:
              "Select a power supply with the PCIe power connectors this card needs.",
          });
        } else if (!need) {
          items.push({
            ruleId: "RULE_F_GPU_CONNECTORS_UNKNOWN",
            severity: "warning",
            status: "unknown",
            affectedSlots: ["GPU", "PSU"],
            label: "Graphics card connector type unverified",
            explanation:
              gpuWatts > 75
                ? `${gpu.title} needs PCIe power, but its connector type isn't stated, so it can't be matched to ${psu.title}.`
                : `${gpu.title} draws ${gpuWatts}W, which a slot could supply, but its connector isn't stated, and some low-power cards still need a cable, so it can't be matched to ${psu.title}.`,
            suggestedResolution: "IT HUB will confirm the power cables for this card.",
          });
        } else {
          items.push({
            ruleId: "RULE_F_PCIE_POWER_MATCH",
            severity: "info",
            status: "compatible",
            affectedSlots: ["GPU", "PSU"],
            label: "PCIe power connectors compatible",
            explanation: `${psu.title} provides the PCIe power connectors ${gpu.title} needs.`,
          });
        }
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
    const { usesM2, usesSata } = storageConnection(storage.specs);
    // An M.2 slot may take NVMe drives only, and nothing in the catalogue says whether a board's take SATA.
    const usesM2Sata = usesM2 && usesSata;
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
        explanation: `${storage.title} is an M.2 drive, but ${mobo.title} has 0 M.2 slots.`,
        suggestedResolution:
          "Select a 2.5-inch SATA SSD or upgrade to a motherboard with M.2 NVMe slots.",
      });
    } else if (usesM2Sata && mobo.specs.m2SataSupported === false) {
      items.push({
        ruleId: "RULE_H_M2_SATA_UNSUPPORTED",
        severity: "error",
        status: "incompatible",
        affectedSlots: ["Storage", "Motherboard"],
        label: "Motherboard's M.2 slots don't take SATA drives",
        explanation: `${storage.title} is an M.2 SATA drive, but ${mobo.title}'s M.2 slots take NVMe drives only.`,
        suggestedResolution:
          "Select an M.2 NVMe SSD, a 2.5-inch SATA SSD, or a motherboard whose M.2 slots take SATA.",
      });
    } else if (usesM2Sata && mobo.specs.m2SataSupported === true) {
      items.push({
        ruleId: "RULE_H_STORAGE_OK",
        severity: "info",
        status: "compatible",
        affectedSlots: ["Storage", "Motherboard"],
        label: "Storage connection available (M.2 SATA)",
        explanation: `${mobo.title} lists ${slotCount ?? "its"} M.2 slot(s), and they take SATA drives.`,
      });
    } else if (usesM2Sata) {
      items.push({
        ruleId: "RULE_H_M2_SATA_UNKNOWN",
        severity: "warning",
        status: "unknown",
        affectedSlots: ["Storage", "Motherboard"],
        label: "M.2 SATA support unverified",
        explanation: `${storage.title} is an M.2 SATA drive. Some M.2 slots take NVMe drives only, and nothing here says whether ${mobo.title}'s take SATA.`,
        suggestedResolution: "IT HUB will confirm the storage connection.",
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
  if (ownsGpu && !gpu) {
    items.push({
      ruleId: "RULE_I_OWNED_GPU_UNCHECKED",
      severity: "warning",
      status: "unknown",
      affectedSlots: ["GPU"],
      label: "Your own graphics card needs checking",
      explanation:
        "Your card's length, power draw and connectors aren't known here, so IT HUB will check it fits this cabinet and power supply.",
      suggestedResolution: "Tell IT HUB which graphics card you own.",
    });
  } else if (cpu && !gpu) {
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
      // The specification list states an unsourced entry's values, so this rule, which is about values
      // missing from the catalogue, doesn't apply. Those values limit the build's labels instead.
      ((c.isVerified === false && c.specs?.provenance !== "registry_unverified") ||
        c.specs?.provenance === "unverified" ||
        (c.specs?.provenance as any) === "ambiguous_unverified"),
  );
  if (unverifiedParts.length > 0) {
    // The result and its status are the same whatever is missing. Only the wording differs: a customer
    // isn't asked to confirm values this build never reads.
    const unused = options.withoutMissingInputs
      ? []
      : unverifiedParts.filter((part) => lacksOnlyUnusedValues(part, components, owned));
    const relevant = unverifiedParts.filter((part) => !unused.includes(part));
    const unusedValues = unused
      .map((part) => `${missingCriticalSpecs(part).join(", ")} of ${part.title}`)
      .join("; ");
    items.push(
      relevant.length > 0
        ? {
            ruleId: "RULE_J_SPEC_UNVERIFIED",
            severity: "warning",
            status: "conditional",
            affectedSlots: unverifiedParts.map((p) => p.slot),
            label: "Component specifications preliminary / unverified",
            explanation:
              `${relevant.length} component(s) don't have their full specifications stated in the catalogue.` +
              (unused.length > 0
                ? ` Also not on file, but not used by this build: ${unusedValues}.`
                : ""),
            suggestedResolution: "Confirm these specifications with IT HUB before ordering.",
          }
        : {
            ruleId: "RULE_J_SPEC_UNVERIFIED",
            severity: "warning",
            status: "conditional",
            affectedSlots: unverifiedParts.map((p) => p.slot),
            label: "Some specifications aren't on file",
            explanation: `Not on file: ${unusedValues}. This build doesn't use them, so its compatibility doesn't depend on them.`,
          },
    );
  }

  if (owned.has("RAM") && !ram) {
    items.push({
      ruleId: "RULE_B_OWNED_RAM_UNCHECKED",
      severity: "warning",
      status: "unknown",
      affectedSlots: ["RAM"],
      label: "Your own memory needs checking",
      explanation:
        "Your memory's generation and size aren't known here, so IT HUB will check it suits this motherboard.",
      suggestedResolution: "Tell IT HUB which memory you own.",
    });
  }
  if (owned.has("Storage") && !storage) {
    items.push({
      ruleId: "RULE_H_OWNED_STORAGE_UNCHECKED",
      severity: "warning",
      status: "unknown",
      affectedSlots: ["Storage"],
      label: "Your own storage needs checking",
      explanation:
        "Your drive's connection isn't known here, so IT HUB will check this motherboard has a slot for it.",
      suggestedResolution: "Tell IT HUB which drive you own.",
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule K — Specifications That Couldn't Be Trusted
  // ───────────────────────────────────────────────────────────────────────────
  for (const component of Object.values(components)) {
    for (const problem of component?.specs?.specProblems || []) {
      const wording = SPEC_PROBLEM_WORDING[problem.kind];
      items.push({
        ruleId: wording.ruleId,
        severity: "warning",
        status: "unknown",
        affectedSlots: [component!.slot],
        label: `${component!.title}: ${wording.label}`,
        explanation: `${problem.label ?? "A specification"}: ${problem.detail}. ${wording.consequence}`,
        suggestedResolution: "IT HUB will correct this product's specifications.",
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rule L — Specifications Nobody Has Reviewed
  // ───────────────────────────────────────────────────────────────────────────
  // Values stated in Shopify, and any critical value that was only read from a title. The registry's
  // unsourced values limit a build's labels instead, and don't send it to review by themselves.
  for (const component of Object.values(components)) {
    if (!component) continue;
    const names = [
      ...(component.specs?.unreviewedSpecs || []),
      ...inferredCriticalSpecs(component.slot, component.specs),
    ];
    if (names.length === 0) continue;
    items.push({
      ruleId: "RULE_L_SPEC_UNREVIEWED",
      severity: "warning",
      status: "unknown",
      affectedSlots: [component.slot],
      label: `${component.title}: specifications not yet reviewed`,
      explanation: `IT HUB hasn't yet checked these against a source: ${names.join(", ")}.`,
      suggestedResolution: "IT HUB will check these before confirming the build.",
    });
  }

  noteTitleInferredBasis(items, components);

  // Each Unknown says which values it's waiting for, from the same list every report reads.
  if (!options.withoutMissingInputs && items.some((item) => item.status === "unknown")) {
    const missing = buildInputsMissing(components, { ownedSlots: owned });
    for (const item of items) {
      const inputs = missing.filter(({ ruleIds }) => ruleIds.includes(item.ruleId));
      if (inputs.length > 0) item.missingInputs = inputs;
    }
  }

  // Not a check, so it has no result: the boxed cooler's height is deliberately not compared.
  const notes: string[] = [];
  if (cpu && cabinet && !cooler && !owned.has("Cooler") && cpu.specs.includesCooler === true) {
    notes.push(
      "This build uses the processor's boxed cooler. Its height isn't separately checked against the cabinet.",
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Build Completeness & Overall Validity
  // ───────────────────────────────────────────────────────────────────────────
  const hasErrors = items.some((i) => i.severity === "error");
  const hasWarnings = items.some((i) => i.severity === "warning");
  const hasBlockingUnknowns =
    items.some((i) => i.status === "unknown" || REVIEW_RULES.has(i.ruleId)) ||
    Boolean(psu && !psu.specs.ratedWattage);

  let overallStatus: CompatibilityStatus = "compatible";
  if (hasErrors) overallStatus = "incompatible";
  else if (hasBlockingUnknowns) overallStatus = "unknown";
  else if (hasWarnings) overallStatus = "conditional";

  // Core essential slots
  const requiredPopulated = Boolean(
    cpu && mobo && (ram || owned.has("RAM")) && (storage || owned.has("Storage")) && psu && cabinet,
  );
  const coolerSatisfied = Boolean(cooler || cpu?.specs.includesCooler !== false);
  const gpuSatisfied = Boolean(gpu || ownsGpu || cpu?.specs.hasIntegratedGraphics !== false);
  const complete = requiredPopulated && coolerSatisfied && gpuSatisfied;

  const validForAutomatedRecommendation = !hasErrors && !hasBlockingUnknowns;

  return {
    status: overallStatus,
    items,
    notes,
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
 * Specifications a label rests on, because a wrong value means the part doesn't fit or doesn't power up.
 * A capacity or a Wi-Fi claim isn't in this list. Alternatives are listed where either can state it.
 */
const LABEL_CRITICAL_SPECS: Partial<
  Record<ComponentSlotId, { fields: (keyof TechnicalSpecs)[]; name: string }[]>
> = {
  CPU: [
    { fields: ["socket"], name: "socket" },
    { fields: ["tdpWatts"], name: "power draw" },
    { fields: ["hasIntegratedGraphics"], name: "integrated graphics" },
    { fields: ["includesCooler"], name: "included cooler" },
  ],
  Motherboard: [
    { fields: ["socket"], name: "socket" },
    { fields: ["supportedRamGeneration"], name: "memory generation" },
    { fields: ["formFactor"], name: "form factor" },
  ],
  RAM: [{ fields: ["ramGeneration"], name: "memory generation" }],
  GPU: [
    { fields: ["powerWatts", "tdpWatts"], name: "power draw" },
    { fields: ["recommendedPsuWatts"], name: "recommended power supply" },
    { fields: ["lengthMm"], name: "length" },
    {
      fields: ["pcie6Plus2Required", "requiredPcieConnectors", "requiredPciePins"],
      name: "power connectors",
    },
  ],
  PSU: [
    { fields: ["ratedWattage"], name: "wattage" },
    { fields: ["pcie6Plus2Count", "pciePowerConnectors"], name: "power connectors" },
  ],
  Storage: [{ fields: ["storageInterface"], name: "interface" }],
  Cabinet: [
    { fields: ["supportedMotherboards"], name: "supported motherboards" },
    { fields: ["maxGpuLengthMm"], name: "graphics card clearance" },
  ],
  Cooler: [{ fields: ["supportedSockets"], name: "supported sockets" }],
};

/** The specifications a label rests on for this kind of part. */
export function labelCriticalFields(slot: ComponentSlotId): (keyof TechnicalSpecs)[][] {
  return (LABEL_CRITICAL_SPECS[slot] || []).map(({ fields }) => fields);
}

export const isConfirmedLevel = (level: SpecConfidence) => CONFIRMED_CONFIDENCE.has(level);

/** How far a part's value for a specification can be trusted. */
export function specConfidence(
  part: Pick<CanonicalBuildComponent, "specs">,
  field: keyof TechnicalSpecs,
): SpecConfidence {
  const value = part.specs?.[field];
  if (value === undefined || value === null) return "unknown";
  return part.specs?.fieldSources?.[field] ?? confidenceFromProvenance(part.specs?.provenance);
}

function criticalSpecsAt(
  part: CanonicalBuildComponent,
  isAtLevel: (level: SpecConfidence) => boolean,
): string[] {
  return (LABEL_CRITICAL_SPECS[part.slot] || [])
    .filter(({ fields }) => {
      const field = fields.find((candidate) => part.specs?.[candidate] !== undefined);
      return field !== undefined && isAtLevel(specConfidence(part, field));
    })
    .map(({ name }) => name);
}

/** The critical specifications on this part that were only read from its title. */
export function inferredCriticalSpecs(slot: string, specs?: TechnicalSpecs): string[] {
  return criticalSpecsAt(
    { slot, specs: specs || {} } as CanonicalBuildComponent,
    (level) => level === "title_inferred",
  );
}

/** The critical specifications on this part that nobody has stated. */
export function missingCriticalSpecs(
  part: Pick<CanonicalBuildComponent, "slot" | "specs">,
): string[] {
  return (LABEL_CRITICAL_SPECS[part.slot] || [])
    .filter(({ fields }) => fields.every((field) => part.specs?.[field] === undefined))
    .map(({ name }) => name);
}

/**
 * What stops a compatible build earning a recommendation label. This doesn't make it incompatible, and
 * it can still be offered: a mismatch rules a build out, while these mean only that nobody can yet say
 * it's confirmed. A label needs each critical value from the registry or a reviewed Shopify field.
 */
export function labelCompatibilityGaps(
  parts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  items: {
    status: string;
    label: string;
    ruleId?: string;
    affectedSlots?: ComponentSlotId[];
    missingInputs?: MissingInput[];
  }[],
  options: Pick<CheckCompatibilityOptions, "ownedSlots"> = {},
): string[] {
  const gaps: string[] = [];
  const present = Object.values(parts).filter(Boolean) as CanonicalBuildComponent[];
  const reviewing = items.filter(
    (item) => item.status === "unknown" || REVIEW_RULES.has(item.ruleId ?? ""),
  );
  // Each check names the values it's waiting for, so they aren't listed a second time below.
  const named = new Set(
    reviewing.flatMap((item) =>
      (item.missingInputs || []).map(({ slot, name }) => `${slot}|${name}`),
    ),
  );
  const needed = buildInputsMissing(parts, options);
  const unnamed = needed.filter(({ slot, name }) => !named.has(`${slot}|${name}`));
  const unknown = reviewing
    // A part's title-read values are listed below, so a line saying only that adds nothing.
    .filter((item) => {
      if (item.ruleId !== "RULE_L_SPEC_UNREVIEWED") return true;
      const part = parts[item.affectedSlots?.[0] as ComponentSlotId];
      return !part || Boolean(part.specs?.unreviewedSpecs?.length);
    })
    .map((item) =>
      item.missingInputs?.length
        ? `${item.label} (${describeMissingInputs(item.missingInputs)})`
        : item.label,
    );
  if (unknown.length > 0) gaps.push(`Not yet confirmed: ${unknown.join(", ")}.`);
  const describe = (part: CanonicalBuildComponent, level: (l: SpecConfidence) => boolean) =>
    criticalSpecsAt(part, level).map((name) => `${name} of ${part.title}`);
  // A label still needs every critical value, but one this build doesn't read isn't something to check.
  const unused = (part: CanonicalBuildComponent, name: string) =>
    INPUT_REQUIREMENTS.some(
      (requirement) =>
        requirement.slot === part.slot && requirement.name === name && requirement.onlyWhen,
    );
  const criticalMissing = present.flatMap((part) =>
    missingCriticalSpecs(part).map((name) => ({ part, name })),
  );
  const isNeeded = ({ part, name }: { part: CanonicalBuildComponent; name: string }) =>
    needed.some((input) => input.slot === part.slot && input.name === name);
  const missing = [
    ...unnamed.map(({ name, title }) => `${name} of ${title}`),
    ...criticalMissing
      .filter(
        (entry) =>
          !isNeeded(entry) &&
          !unused(entry.part, entry.name) &&
          !named.has(`${entry.part.slot}|${entry.name}`),
      )
      .map(({ part, name }) => `${name} of ${part.title}`),
  ];
  if (missing.length > 0) gaps.push(`Not stated: ${missing.join("; ")}.`);
  const notRead = criticalMissing
    .filter((entry) => !isNeeded(entry) && unused(entry.part, entry.name))
    .map(({ part, name }) => `${name} of ${part.title}`);
  if (notRead.length > 0) {
    gaps.push(
      `No recommendation label, because these aren't on file, though this build doesn't rely on them: ${notRead.join("; ")}.`,
    );
  }
  const inferred = present.flatMap((part) => describe(part, (level) => level === "title_inferred"));
  if (inferred.length > 0) {
    gaps.push(`Read from the product title, not confirmed: ${inferred.join("; ")}.`);
  }
  const unreviewed = present.flatMap((part) =>
    describe(part, (level) => level === "supplier_provided"),
  );
  if (unreviewed.length > 0) {
    gaps.push(`Stated but not reviewed by IT HUB: ${unreviewed.join("; ")}.`);
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
        // A selection this old holds only a graphics card clearance, so its cooler limit stays unknown.
        maxGpuLengthMm: part.clearance,
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
export function compatibility(
  parts: Record<string, any>,
  options: { ownedSlots?: Iterable<string> } = {},
) {
  const canonicalParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {};
  for (const [key, part] of Object.entries(parts)) {
    if (!part) continue;
    canonicalParts[key as ComponentSlotId] = toCanonicalComponent(key, part);
  }

  const summary = checkCompatibility(canonicalParts, options);
  return {
    result: reportedItems(summary.items).map((item) => ({
      label: item.label,
      state:
        item.severity === "error"
          ? ("error" as const)
          : item.severity === "warning"
            ? ("warning" as const)
            : ("ok" as const),
      // Advice is the customer's to read. Anything needing review is IT HUB's to resolve.
      advice: item.status === "conditional" && !reachesReview(item) ? item.explanation : undefined,
      // The values this check is waiting for, so every screen names the same ones.
      missing: item.missingInputs && `Not stated: ${describeMissingInputs(item.missingInputs)}.`,
    })),
    watts: summary.estimatedSystemLoadWatts,
    recommended: summary.recommendedPsuWatts,
    valid: summary.valid,
    complete: summary.complete,
    summary,
  };
}
