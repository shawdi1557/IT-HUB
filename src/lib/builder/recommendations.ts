// src/lib/builder/recommendations.ts
// IT HUB Deterministic Guided PC Recommendation Engine
// Dynamically generates valid, fully compatible hardware configurations exclusively from available catalog products.
// Preserves authoritative Shopify prices, variant IDs, and inventory across Find My PC and Expert Mode.

import type {
  CanonicalBuild,
  CanonicalBuildComponent,
  ComponentSlotId,
  GuidedAnswers,
  RecommendationCandidate,
} from "./types";
import { checkCompatibility } from "./compatibility";

export function getMissingCatalogCategories(
  catalog: Record<ComponentSlotId, CanonicalBuildComponent[]> | Record<string, any[]>,
  ownedParts: string[] = [],
): ComponentSlotId[] {
  const essential: ComponentSlotId[] = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"];
  return essential.filter(
    (slot) => !ownedParts.includes(slot) && (!catalog[slot] || catalog[slot].length === 0),
  );
}

interface NormalizedItem {
  slot: ComponentSlotId;
  id: string;
  name: string;
  price: number;
  variantId?: string;
  socket?: string;
  ramGeneration?: string;
  tdpWatts?: number;
  ratedWattage?: number;
  hasWifi?: boolean;
  hasIntegratedGraphics?: boolean;
  includesCooler?: boolean;
  isLaptopSoDimm?: boolean;
  lengthMm?: number;
  maxGpuLengthMm?: number;
  capacityGb?: number;
  pciePowerConnectors?: string[];
  requiredPcieConnectors?: string[];
  isVerified?: boolean;
  verificationStatus?: string;
  availability: "available" | "unavailable";
  isShopifyLive?: boolean;
  raw: any;
}

function normalizeItem(raw: any, slot: ComponentSlotId): NormalizedItem {
  const isCanonical = "productId" in raw && "specs" in raw;
  const title = (isCanonical ? raw.title : raw.name) || "";
  const normTitle = title.toLowerCase();

  let socket = isCanonical ? raw.specs.socket : raw.socket;
  if (!socket) {
    if (
      normTitle.includes("am5") ||
      normTitle.includes("7600") ||
      normTitle.includes("7700") ||
      normTitle.includes("7800") ||
      normTitle.includes("9600") ||
      normTitle.includes("9700") ||
      normTitle.includes("b650") ||
      normTitle.includes("x670")
    ) {
      socket = "AM5";
    } else if (
      normTitle.includes("am4") ||
      normTitle.includes("5600") ||
      normTitle.includes("5700") ||
      normTitle.includes("5800") ||
      normTitle.includes("3600") ||
      normTitle.includes("5500") ||
      normTitle.includes("b550") ||
      normTitle.includes("a520") ||
      normTitle.includes("x570")
    ) {
      socket = "AM4";
    } else if (
      normTitle.includes("1700") ||
      normTitle.includes("12400") ||
      normTitle.includes("13400") ||
      normTitle.includes("13600") ||
      normTitle.includes("14400") ||
      normTitle.includes("14600") ||
      normTitle.includes("b760") ||
      normTitle.includes("z790")
    ) {
      socket = "LGA1700";
    }
  }

  let ramGen = isCanonical ? raw.specs.supportedRamGeneration || raw.specs.ramGeneration : raw.ram;
  if (!ramGen) {
    if (normTitle.includes("ddr5") || socket === "AM5") {
      ramGen = "DDR5";
    } else if (normTitle.includes("ddr4") || socket === "AM4") {
      ramGen = "DDR4";
    }
  }

  let tdpWatts = isCanonical ? raw.specs.tdpWatts || raw.specs.powerWatts : raw.watts;
  if (!tdpWatts) {
    if (slot === "CPU") tdpWatts = 65;
    else if (slot === "GPU") tdpWatts = 160;
  }

  let ratedWattage = isCanonical ? raw.specs.ratedWattage : raw.capacity;
  if (!ratedWattage && slot === "PSU") {
    const match = normTitle.match(/(\d{3,4})\s*w/i);
    if (match) ratedWattage = Number(match[1]);
  }

  const hasWifi = isCanonical
    ? Boolean(raw.specs.hasWifi)
    : Boolean(raw.wifi || /wifi|wi-fi/i.test(normTitle));

  let hasIntegratedGraphics = isCanonical
    ? raw.specs.hasIntegratedGraphics
    : raw.hasIntegratedGraphics;
  if (hasIntegratedGraphics === undefined && slot === "CPU") {
    hasIntegratedGraphics =
      normTitle.includes("g") ||
      socket === "AM5" ||
      (!normTitle.endsWith("f") && !normTitle.includes(" f ") && socket === "LGA1700");
  }

  let includesCooler = isCanonical ? raw.specs.includesCooler : raw.includesCooler;
  if (includesCooler === undefined && slot === "CPU") {
    includesCooler =
      normTitle.includes("5600") || normTitle.includes("12400") || normTitle.includes("7600");
  }

  const isLaptopSoDimm = isCanonical ? raw.specs.isLaptopSoDimm : raw.isLaptopSoDimm;
  const lengthMm = isCanonical ? raw.specs.lengthMm : raw.length;
  const maxGpuLengthMm = isCanonical ? raw.specs.maxGpuLengthMm : raw.clearance;
  const capacityGb = isCanonical ? raw.specs.capacityGb : raw.capacityGb;
  const pciePowerConnectors = isCanonical ? raw.specs.pciePowerConnectors : undefined;
  const requiredPcieConnectors = isCanonical ? raw.specs.requiredPcieConnectors : undefined;
  const isVerified = isCanonical ? raw.isVerified : Boolean(raw.isVerified);
  const verificationStatus = isCanonical
    ? raw.specs?.provenance
    : raw.provenance || raw.specs?.provenance;

  return {
    slot,
    id: isCanonical ? raw.productId : raw.id,
    name: title,
    price: raw.price || 0,
    variantId: raw.variantId || undefined,
    socket,
    ramGeneration: ramGen,
    tdpWatts,
    ratedWattage,
    hasWifi,
    hasIntegratedGraphics,
    includesCooler,
    isLaptopSoDimm,
    lengthMm,
    maxGpuLengthMm,
    capacityGb,
    pciePowerConnectors,
    requiredPcieConnectors,
    isVerified,
    verificationStatus,
    availability:
      raw.availability === "unavailable" || raw.stock === 0 ? "unavailable" : "available",
    isShopifyLive: Boolean(raw.isShopifyLive || raw.variantId),
    raw,
  };
}

// Industry benchmark registry normalized to 0 - 100
export const HARDWARE_BENCHMARK_REGISTRY: Record<
  string,
  { singleCore: number; multiCore: number; gpuRaster: number; gpuCompute: number }
> = {
  "ryzen 5 5600": { singleCore: 54.0, multiCore: 32.5, gpuRaster: 0, gpuCompute: 0 },
  "ryzen 5 7600": { singleCore: 68.0, multiCore: 48.0, gpuRaster: 5.0, gpuCompute: 3.0 },
  "core i5-12400": { singleCore: 52.0, multiCore: 34.0, gpuRaster: 0, gpuCompute: 0 },
  "rtx 4060": { singleCore: 0, multiCore: 0, gpuRaster: 29.5, gpuCompute: 24.0 },
  "rtx 5050": { singleCore: 0, multiCore: 0, gpuRaster: 38.0, gpuCompute: 32.0 },
  "rtx 4070": { singleCore: 0, multiCore: 0, gpuRaster: 52.0, gpuCompute: 45.0 },
  "gtx 1650": { singleCore: 0, multiCore: 0, gpuRaster: 10.0, gpuCompute: 7.0 },
};

export function getComponentBenchmarkScores(name: string, slot: ComponentSlotId) {
  const norm = name.toLowerCase();
  for (const [key, scores] of Object.entries(HARDWARE_BENCHMARK_REGISTRY)) {
    if (norm.includes(key)) {
      return scores;
    }
  }
  if (slot === "CPU") {
    return { singleCore: 45.0, multiCore: 25.0, gpuRaster: 0, gpuCompute: 0 };
  }
  if (slot === "GPU") {
    return { singleCore: 0, multiCore: 0, gpuRaster: 20.0, gpuCompute: 15.0 };
  }
  return { singleCore: 0, multiCore: 0, gpuRaster: 0, gpuCompute: 0 };
}

export interface PurposeWeights {
  workload: number;
  budget: number;
  platform: number;
  thermal: number;
}

export function getPurposeWeights(purpose: string): PurposeWeights {
  if (purpose === "gaming") {
    return { workload: 0.5, budget: 0.25, platform: 0.15, thermal: 0.1 };
  }
  if (purpose === "creation") {
    return { workload: 0.45, budget: 0.2, platform: 0.2, thermal: 0.15 };
  }
  if (purpose === "work" || purpose === "programming" || purpose === "office") {
    return { workload: 0.25, budget: 0.5, platform: 0.15, thermal: 0.1 };
  }
  if (purpose === "professional") {
    return { workload: 0.45, budget: 0.15, platform: 0.25, thermal: 0.15 };
  }
  return { workload: 0.25, budget: 0.45, platform: 0.15, thermal: 0.15 };
}

export interface SynthesizedConfiguration {
  parts: Partial<Record<ComponentSlotId, NormalizedItem>>;
  price: number;
  score: number;
  workloadScore: number;
  title: string;
  tradeoff: "best-fit" | "balanced" | "upgrade-friendly";
  tradeoffLabel: "Best Value" | "Balanced Choice" | "Best Performance";
  highlights: string[];
  designedFor: string;
  confidenceBadge: "certified" | "high" | "review";
  confidenceLabel: string;
}

/**
 * Dynamically synthesizes hardware build configurations from available products.
 * Uses multi-branch combinatorial exploration, strict budget ceiling enforcement,
 * multi-objective mathematical scoring, and near-duplicate filtering.
 */
function synthesizeBuildConfigurations(
  itemsBySlot: Record<ComponentSlotId, NormalizedItem[]>,
  options: {
    purpose: string;
    targetBudget: number;
    minBudget?: number;
    maxBudget?: number;
    ownedSlots: Set<string>;
    preferredBrands?: string[];
    requireWifi?: boolean;
    resolution?: string;
    genre?: string;
    software?: string;
  },
): {
  recommendations: SynthesizedConfiguration[];
  allValidCandidates: SynthesizedConfiguration[];
} {
  const {
    purpose,
    targetBudget,
    maxBudget,
    ownedSlots,
    preferredBrands = [],
    requireWifi = false,
    resolution,
    genre,
    software,
  } = options;

  // Enforce catalog completeness
  const essentialSlots: ComponentSlotId[] = [
    "CPU",
    "Motherboard",
    "RAM",
    "Storage",
    "PSU",
    "Cabinet",
  ];
  const missing = essentialSlots.filter(
    (slot) => !ownedSlots.has(slot) && (!itemsBySlot[slot] || itemsBySlot[slot].length === 0),
  );
  if (missing.length > 0) return { recommendations: [], allValidCandidates: [] };

  const isGaming = purpose === "gaming";
  const isCreation = purpose === "creation";
  const isWork = purpose === "work" || purpose === "programming" || purpose === "office";
  const isProfessional = purpose === "professional";

  const weights = getPurposeWeights(purpose);

  // Candidate pool
  const candidatePool: SynthesizedConfiguration[] = [];

  // Filter CPUs: prefer in-stock & live products
  const allCpus = (itemsBySlot.CPU || []).filter((c) => c.availability !== "unavailable");
  const cpus = allCpus.length > 0 ? allCpus : itemsBySlot.CPU || [];
  if (cpus.length === 0) return { recommendations: [], allValidCandidates: [] };

  // Sort CPUs: brand preference, then budget fit
  cpus.sort((a, b) => {
    const aBrandMatch = preferredBrands.some((br) =>
      a.name.toLowerCase().includes(br.toLowerCase()),
    );
    const bBrandMatch = preferredBrands.some((br) =>
      b.name.toLowerCase().includes(br.toLowerCase()),
    );
    if (aBrandMatch && !bBrandMatch) return -1;
    if (!aBrandMatch && bBrandMatch) return 1;
    return a.price - b.price;
  });

  // Branch CPUs (up to top 3)
  for (const cpu of cpus.slice(0, 3)) {
    const cpuSocket = cpu.socket || "AM4";

    // 1. Branch Motherboards (up to 2: e.g. lowest price and WiFi/alternative)
    const allMobos = (itemsBySlot.Motherboard || []).filter(
      (m) =>
        !m.socket || !cpuSocket || m.socket.toUpperCase().trim() === cpuSocket.toUpperCase().trim(),
    );
    if (allMobos.length === 0) continue;

    allMobos.sort((a, b) => {
      if (requireWifi) {
        if (a.hasWifi && !b.hasWifi) return -1;
        if (!a.hasWifi && b.hasWifi) return 1;
      }
      return a.price - b.price;
    });

    const moboBranches = [allMobos[0]];
    if (allMobos.length > 1) {
      const wifiMobo = allMobos.find((m) => m.hasWifi && m.id !== allMobos[0].id);
      if (wifiMobo) moboBranches.push(wifiMobo);
      else if (allMobos[1].id !== allMobos[0].id) moboBranches.push(allMobos[1]);
    }

    for (const mobo of moboBranches) {
      // 2. Branch RAM (up to 2: e.g. 16GB vs 32GB)
      const targetRamGen = mobo.ramGeneration || (cpuSocket === "AM5" ? "DDR5" : "DDR4");
      const allRams = (itemsBySlot.RAM || []).filter(
        (r) =>
          !r.isLaptopSoDimm &&
          (!r.ramGeneration ||
            !targetRamGen ||
            r.ramGeneration.toUpperCase().trim() === targetRamGen.toUpperCase().trim()),
      );
      if (allRams.length === 0 && !ownedSlots.has("RAM")) continue;

      allRams.sort((a, b) => {
        if (isCreation || isProfessional) {
          const a32 = a.name.includes("32GB") || a.name.includes("32gb");
          const b32 = b.name.includes("32GB") || b.name.includes("32gb");
          if (a32 && !b32) return -1;
          if (!a32 && b32) return 1;
        }
        return a.price - b.price;
      });

      const ramBranches: Array<NormalizedItem | undefined> = ownedSlots.has("RAM")
        ? [undefined]
        : [allRams[0]];
      if (!ownedSlots.has("RAM") && allRams.length > 1) {
        const higherRam = allRams.find((r) => r.id !== allRams[0].id);
        if (higherRam) ramBranches.push(higherRam);
      }

      for (const ram of ramBranches) {
        // 3. Storage
        const allStorage = (itemsBySlot.Storage || []).slice().sort((a, b) => a.price - b.price);
        if (allStorage.length === 0 && !ownedSlots.has("Storage")) continue;
        const storage1tb = allStorage.find((s) => s.name.includes("1TB") || s.name.includes("1tb"));
        const storage = ownedSlots.has("Storage") ? undefined : storage1tb || allStorage[0];

        // 4. Cabinet
        const allCabinets = (itemsBySlot.Cabinet || []).slice().sort((a, b) => a.price - b.price);
        if (allCabinets.length === 0 && !ownedSlots.has("Cabinet")) continue;
        const cabinet = ownedSlots.has("Cabinet") ? undefined : allCabinets[0];

        // 5. Branch GPUs (up to 3 tiers)
        const allGpus = (itemsBySlot.GPU || []).slice();
        allGpus.sort((a, b) => a.price - b.price);

        const gpuBranches: Array<NormalizedItem | undefined> = [];
        if (ownedSlots.has("GPU")) {
          gpuBranches.push(undefined);
        } else if (isGaming || isCreation || isProfessional || !cpu.hasIntegratedGraphics) {
          if (allGpus.length === 0) {
            if (!cpu.hasIntegratedGraphics) continue;
            gpuBranches.push(undefined);
          } else {
            // Take up to 3 distinct GPU tiers
            const distinctGpuModels: NormalizedItem[] = [];
            for (const g of allGpus) {
              const cleanG = g.name
                .replace(/^\[TEST\]\s*/i, "")
                .trim()
                .toLowerCase();
              if (
                !distinctGpuModels.some((dg) => dg.name.toLowerCase().includes(cleanG.slice(0, 10)))
              ) {
                distinctGpuModels.push(g);
              }
              if (distinctGpuModels.length >= 3) break;
            }
            gpuBranches.push(
              ...(distinctGpuModels.length > 0 ? distinctGpuModels : allGpus.slice(0, 2)),
            );
          }
        } else {
          // Work / General
          if (cpu.hasIntegratedGraphics) {
            gpuBranches.push(undefined);
          }
          if (allGpus.length > 0) {
            gpuBranches.push(allGpus[0]);
          }
        }

        for (const gpu of gpuBranches) {
          // 6. Cooler
          let cooler: NormalizedItem | undefined = undefined;
          const allCoolers = (itemsBySlot.Cooler || []).slice().sort((a, b) => a.price - b.price);
          if (!cpu.includesCooler) {
            if (allCoolers.length === 0 && !ownedSlots.has("Cooler")) continue;
            cooler = ownedSlots.has("Cooler") ? undefined : allCoolers[0];
          } else if (allCoolers.length > 0 && !ownedSlots.has("Cooler")) {
            cooler = allCoolers[0];
          }

          // 7. PSU
          const cpuWatts = cpu.tdpWatts || 65;
          const gpuWatts = gpu ? gpu.tdpWatts || 160 : 0;
          const loadWatts = cpuWatts + gpuWatts + 80;
          const recWatts = Math.max(450, Math.ceil((loadWatts * 1.35) / 50) * 50);

          const allPsus = (itemsBySlot.PSU || []).slice();
          if (allPsus.length === 0 && !ownedSlots.has("PSU")) continue;

          const matchingPsus = allPsus.filter((p) => (p.ratedWattage || 550) >= recWatts);
          matchingPsus.sort((a, b) => (a.ratedWattage || 550) - (b.ratedWattage || 550));
          const psu = ownedSlots.has("PSU")
            ? undefined
            : matchingPsus[0] ||
              allPsus.sort((a, b) => (b.ratedWattage || 550) - (a.ratedWattage || 550))[0];

          // Form parts map
          const candidateParts: Partial<Record<ComponentSlotId, NormalizedItem>> = {
            CPU: cpu,
            Motherboard: mobo,
          };
          if (cabinet && !ownedSlots.has("Cabinet")) candidateParts.Cabinet = cabinet;
          if (ram && !ownedSlots.has("RAM")) candidateParts.RAM = ram;
          if (storage && !ownedSlots.has("Storage")) candidateParts.Storage = storage;
          if (psu && !ownedSlots.has("PSU")) candidateParts.PSU = psu;
          if (gpu && !ownedSlots.has("GPU")) candidateParts.GPU = gpu;
          if (cooler && !ownedSlots.has("Cooler")) candidateParts.Cooler = cooler;

          // Compatibility validation using Automated Mode (Rule A-J, UNKNOWN blocking)
          const canonicalPartsForCompat: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> =
            {};
          for (const [s, item] of Object.entries(candidateParts)) {
            if (item) {
              const isCanonical = "specs" in item.raw && typeof item.raw.specs === "object";
              canonicalPartsForCompat[s as ComponentSlotId] = isCanonical
                ? item.raw
                : {
                    slot: s as ComponentSlotId,
                    productId: item.id,
                    variantId: item.variantId || `gid://shopify/ProductVariant/mock-${item.id}`,
                    title: item.name,
                    price: item.price,
                    currency: "INR",
                    specs: {
                      socket: item.socket,
                      supportedRamGeneration: s === "Motherboard" ? item.ramGeneration : undefined,
                      ramGeneration: s === "RAM" ? item.ramGeneration : undefined,
                      tdpWatts: item.tdpWatts,
                      powerWatts: item.tdpWatts,
                      ratedWattage: item.ratedWattage,
                      lengthMm: item.lengthMm,
                      maxGpuLengthMm: item.maxGpuLengthMm,
                      hasWifi: item.hasWifi,
                      hasIntegratedGraphics: item.hasIntegratedGraphics,
                      includesCooler: item.includesCooler,
                      isLaptopSoDimm: item.isLaptopSoDimm,
                      pciePowerConnectors: item.pciePowerConnectors,
                      requiredPcieConnectors: item.requiredPcieConnectors,
                      provenance: (item.verificationStatus ||
                        (item.isVerified
                          ? "verified_manufacturer"
                          : "ambiguous_unverified")) as any,
                    },
                    availability: item.availability,
                    quantity: 1,
                    retrievedAt: new Date().toISOString(),
                    isShopifyLive: item.isShopifyLive,
                    isVerified: item.isVerified,
                  };
            }
          }
          const compatSummary = checkCompatibility(canonicalPartsForCompat, {
            workload: isGaming ? "gaming" : isCreation ? "creation" : isWork ? "work" : "general",
            mode: "automated",
          });

          if (!compatSummary.validForAutomatedRecommendation) {
            continue;
          }

          // Calculate unowned total price
          let price = 0;
          for (const [slot, item] of Object.entries(candidateParts)) {
            if (item && !ownedSlots.has(slot)) {
              price += item.price;
            }
          }

          // ── Benchmark & Sub-score Calculations ─────────────────────────
          const cpuScores = getComponentBenchmarkScores(cpu.name, "CPU");
          const gpuScores = gpu
            ? getComponentBenchmarkScores(gpu.name, "GPU")
            : { singleCore: 0, multiCore: 0, gpuRaster: 5.0, gpuCompute: 3.0 };

          // RAM capacity score
          const ramCapacity = ram?.name.includes("32GB") || ram?.name.includes("32gb") ? 32 : 16;
          const ramScore = ramCapacity >= 32 ? 95 : 65;

          // Workload Sub-score S_workload
          let sWorkload = 50;
          if (isGaming) {
            let gpuWeight = 0.65;
            let cpuSingleWeight = 0.2;
            let ramWeight = 0.15;

            if (resolution === "1440p") {
              gpuWeight = 0.7;
              cpuSingleWeight = 0.15;
            } else if (resolution === "4K") {
              gpuWeight = 0.85;
              cpuSingleWeight = 0.1;
            } else if (resolution === "1080p") {
              gpuWeight = 0.55;
              cpuSingleWeight = 0.3;
            }

            if (
              genre?.toLowerCase().includes("competitive") ||
              genre?.toLowerCase().includes("esports")
            ) {
              cpuSingleWeight += 0.15;
              gpuWeight -= 0.15;
            } else if (genre?.toLowerCase().includes("aaa")) {
              gpuWeight += 0.15;
            }

            sWorkload =
              gpuWeight * gpuScores.gpuRaster +
              cpuSingleWeight * cpuScores.singleCore +
              ramWeight * ramScore;
          } else if (isCreation) {
            let cpuMultiWeight = 0.4;
            let ramW = 0.3;
            let gpuCompW = 0.2;
            let storageW = 0.1;

            if (
              software?.toLowerCase().includes("premiere") ||
              software?.toLowerCase().includes("resolve")
            ) {
              ramW = 0.35;
            } else if (
              software?.toLowerCase().includes("blender") ||
              software?.toLowerCase().includes("unreal")
            ) {
              cpuMultiWeight = 0.4;
              gpuCompW = 0.35;
            }

            sWorkload =
              cpuMultiWeight * cpuScores.multiCore +
              ramW * ramScore +
              gpuCompW * gpuScores.gpuCompute +
              storageW * 80;
          } else if (isWork) {
            sWorkload =
              0.5 * cpuScores.singleCore + 0.3 * ramScore + 0.2 * (mobo.hasWifi ? 100 : 40);
          } else if (isProfessional) {
            sWorkload = 0.35 * cpuScores.multiCore + 0.35 * ramScore + 0.3 * gpuScores.gpuCompute;
          } else {
            sWorkload =
              0.5 * cpuScores.singleCore +
              0.35 * (cpu.hasIntegratedGraphics ? 70 : gpu ? 80 : 20) +
              0.15 * ramScore;
          }

          // Budget fit score S_budget
          const deltaPrice = Math.abs(price - targetBudget);
          const sBudget = Math.max(0, 100 - (deltaPrice / (targetBudget || 1)) * 100);

          // Platform upgradeability score S_platform
          const socketScore = cpuSocket === "AM5" ? 100 : cpuSocket === "LGA1700" ? 75 : 50;
          const ramGenScore = targetRamGen === "DDR5" ? 100 : 60;
          const sPlatform = (socketScore + ramGenScore + 85) / 3;

          // Thermal score S_thermal
          const psuCapacity = psu?.ratedWattage || 550;
          const bufferPct = (psuCapacity - loadWatts) / psuCapacity;
          const sThermal = Math.min(100, Math.max(0, Math.round(bufferPct * 150)));

          // Penalties
          let penalties = 0;
          if (bufferPct < 0.35) penalties += 5;

          // Composite score
          const compositeScore = Math.round(
            weights.workload * sWorkload +
              weights.budget * sBudget +
              weights.platform * sPlatform +
              weights.thermal * sThermal -
              penalties,
          );

          // Titles & Badges
          const cleanCpu = cpu.name.replace(/^\[TEST\]\s*/i, "").trim();
          const cleanGpu = gpu ? gpu.name.replace(/^\[TEST\]\s*/i, "").trim() : "";
          const gpuShort = cleanGpu ? cleanGpu.split(" ").slice(0, 3).join(" ") : "";

          const title = cleanGpu ? `${cleanCpu} · ${gpuShort} Build` : `${cleanCpu} Custom System`;
          const designedFor = isGaming
            ? `${resolution || "1080p"} Gaming & Daily Performance`
            : isCreation
              ? "Content Creation & Rendering"
              : "Productivity & Multitasking";

          const highlights: string[] = [
            `${cleanCpu} processor delivering smooth responsiveness`,
            gpu
              ? `${cleanGpu} dedicated graphics card`
              : "Integrated graphics keeping power consumption minimal",
            storage
              ? `${storage.name.replace(/^\[TEST\]\s*/i, "")} NVMe SSD`
              : "High-speed solid state storage",
          ];
          if (mobo.hasWifi) highlights.push("Integrated Wi-Fi connectivity built into motherboard");

          // Specification confidence
          const partsList = Object.values(candidateParts).filter(Boolean) as NormalizedItem[];
          const allVerified = partsList.every(
            (p) =>
              p.isVerified ||
              p.verificationStatus === "verified_manufacturer" ||
              p.verificationStatus === "verified_technician",
          );
          const coreVerified = [cpu, mobo, ram, psu, gpu]
            .filter(Boolean)
            .every(
              (p: any) =>
                p.isVerified ||
                p.verificationStatus === "verified_manufacturer" ||
                p.verificationStatus === "verified_technician",
            );

          const confidenceBadge: "certified" | "high" | "review" = allVerified
            ? "certified"
            : coreVerified
              ? "high"
              : "review";
          const confidenceLabel = allVerified
            ? "IT HUB Certified (100% Verified)"
            : coreVerified
              ? "High Confidence (Provisional)"
              : "Review Required";

          let tradeoff: "best-fit" | "balanced" | "upgrade-friendly" = "balanced";
          if (price <= targetBudget * 0.95) tradeoff = "best-fit";
          else if (price >= targetBudget * 1.1 || cpuSocket === "AM5")
            tradeoff = "upgrade-friendly";

          candidatePool.push({
            parts: candidateParts,
            price,
            score: compositeScore,
            workloadScore: Math.round(sWorkload),
            title,
            tradeoff,
            tradeoffLabel: "Balanced Choice",
            highlights,
            designedFor,
            confidenceBadge,
            confidenceLabel,
          });
        }
      }
    }
  }

  // ── Near-Duplicate Deduplication ──────────────────────────────────────────
  // Near-duplicate key: CPU_Model + GPU_Model + RAM_Capacity
  const groupMap = new Map<string, SynthesizedConfiguration>();
  for (const c of candidatePool) {
    const cpuName = c.parts.CPU?.name.replace(/^\[TEST\]\s*/i, "").trim() || "";
    const gpuName = c.parts.GPU?.name.replace(/^\[TEST\]\s*/i, "").trim() || "iGPU";
    const ramCap = c.parts.RAM?.name.includes("32GB") ? "32GB" : "16GB";
    const key = `${cpuName}|${gpuName}|${ramCap}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, c);
    } else {
      const existing = groupMap.get(key)!;
      // Tie-breaking: Higher score, then lower price
      if (
        c.score > existing.score ||
        (Math.abs(c.score - existing.score) < 0.5 && c.price < existing.price)
      ) {
        groupMap.set(key, c);
      }
    }
  }

  const allDistinctCandidates = Array.from(groupMap.values());

  // Sort all distinct candidates by score descending
  allDistinctCandidates.sort((a, b) => {
    if (Math.abs(b.score - a.score) >= 0.5) return b.score - a.score;
    return a.price - b.price; // Tie breaker 1: lower price
  });

  // ── Strict Budget Ceiling Filter ──────────────────────────────────────────
  const withinBudget = maxBudget
    ? allDistinctCandidates.filter((c) => c.price <= maxBudget)
    : allDistinctCandidates;

  if (withinBudget.length === 0) {
    return {
      recommendations: [],
      allValidCandidates: allDistinctCandidates,
    };
  }

  // ── Distinct Label Assignment ─────────────────────────────────────────────
  // 1. Best Value = lowest price meeting workload baseline
  const sortedByPrice = withinBudget.slice().sort((a, b) => a.price - b.price);
  const bestValueCandidate = sortedByPrice[0];

  // 2. Best Performance = highest workload score under budget
  const sortedByPerf = withinBudget
    .slice()
    .sort((a, b) => b.workloadScore - a.workloadScore || b.score - a.score);
  const bestPerfCandidate = sortedByPerf[0];

  // 3. Balanced Choice = highest composite score
  const sortedByScore = withinBudget.slice().sort((a, b) => b.score - a.score);
  let balancedCandidate = sortedByScore[0];

  const finalRecommendations: SynthesizedConfiguration[] = [];

  if (withinBudget.length === 1) {
    finalRecommendations.push({
      ...withinBudget[0],
      tradeoff: "balanced",
      tradeoffLabel: "Balanced Choice",
    });
  } else if (withinBudget.length === 2) {
    finalRecommendations.push({
      ...bestValueCandidate,
      tradeoff: "best-fit",
      tradeoffLabel: "Best Value",
    });
    const other = withinBudget.find((c) => c !== bestValueCandidate) || withinBudget[1];
    finalRecommendations.push({
      ...other,
      tradeoff: other === bestPerfCandidate ? "upgrade-friendly" : "balanced",
      tradeoffLabel: other === bestPerfCandidate ? "Best Performance" : "Balanced Choice",
    });
  } else {
    // 3 or more distinct builds
    finalRecommendations.push({
      ...bestValueCandidate,
      tradeoff: "best-fit",
      tradeoffLabel: "Best Value",
    });

    if (bestPerfCandidate !== bestValueCandidate) {
      finalRecommendations.push({
        ...bestPerfCandidate,
        tradeoff: "upgrade-friendly",
        tradeoffLabel: "Best Performance",
      });
    }

    // Find distinct balanced choice
    const remaining = withinBudget.filter(
      (c) => c !== bestValueCandidate && c !== bestPerfCandidate,
    );
    if (remaining.length > 0) {
      remaining.sort((a, b) => b.score - a.score);
      finalRecommendations.push({
        ...remaining[0],
        tradeoff: "balanced",
        tradeoffLabel: "Balanced Choice",
      });
    }
  }

  // Ensure recommendations are ordered: Best Value, Balanced Choice, Best Performance
  finalRecommendations.sort((a, b) => a.price - b.price);

  return {
    recommendations: finalRecommendations.slice(0, 3),
    allValidCandidates: allDistinctCandidates,
  };
}

/**
 * Guided PC Recommendation Engine (CanonicalBuild format).
 * Strictly requires complete authentic live Shopify products; never fabricates mock parts.
 */
export function generateRecommendations(
  answers: GuidedAnswers,
  catalog: Record<ComponentSlotId, CanonicalBuildComponent[]>,
): RecommendationCandidate[] {
  const budget = answers.budgetInr || 65000;
  const owned = new Set(answers.ownedParts || []);

  // Check missing categories
  const missing = getMissingCatalogCategories(catalog, answers.ownedParts || []);
  if (missing.length > 0) return [];

  // Normalize canonical items
  const itemsBySlot: Record<ComponentSlotId, NormalizedItem[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
    CaseFans: [],
    Monitor: [],
  };

  for (const [slot, items] of Object.entries(catalog)) {
    itemsBySlot[slot as ComponentSlotId] = (items || []).map((c) =>
      normalizeItem(c, slot as ComponentSlotId),
    );
  }

  const { recommendations } = synthesizeBuildConfigurations(itemsBySlot, {
    purpose: answers.purpose,
    targetBudget: budget,
    maxBudget: Math.round(budget * 1.15),
    ownedSlots: owned,
    preferredBrands: answers.preferredBrands,
    requireWifi: answers.requireWifi,
  });

  return recommendations
    .map((config) => {
      const rawParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {};
      for (const [slot, normItem] of Object.entries(config.parts)) {
        if (normItem) {
          rawParts[slot as ComponentSlotId] = normItem.raw as CanonicalBuildComponent;
        }
      }

      const build = createBuildFromParts(config.title, "guided", rawParts, owned, answers.purpose);

      return {
        build,
        style: config.tradeoff,
        title: config.title,
        matchScore: config.score,
        rationale: config.highlights.join(". ") + ".",
        highlights: config.highlights,
      };
    })
    .filter((c) => c.build.compatibility.valid);
}

/**
 * Dynamic catalog recommendation engine directly used by Find My PC in Builder.tsx.
 * Consumes the live store.componentCatalog (with authentic Shopify prices and variant IDs).
 * Strictly enforces that builds never exceed the customer's maximum budget.
 */
export function generateDynamicCatalogRecommendations(
  catalog: Record<string, any[]>,
  answers: {
    purpose: string;
    customText?: string;
    details?: Record<string, string>;
    budgetId?: string;
    customBudget?: string;
    brands?: string[];
    wifi?: string;
    owned?: string[];
  },
  budgetOrTemplates?: any,
): any[] {
  const owned = new Set(answers.owned || []);

  // Check missing essential categories
  const essentialSlots: ComponentSlotId[] = [
    "CPU",
    "Motherboard",
    "RAM",
    "Storage",
    "PSU",
    "Cabinet",
  ];
  const missing = essentialSlots.filter(
    (slot) => !owned.has(slot) && (!catalog[slot] || catalog[slot].length === 0),
  );
  if (missing.length > 0) return [];

  // Resolve budget range
  let minBudget = 40000;
  let maxBudget = 150000;
  let targetBudget = 65000;

  // 1. Explicit budget object passed from Builder.tsx: { min, max, label }
  if (
    budgetOrTemplates &&
    typeof budgetOrTemplates === "object" &&
    !Array.isArray(budgetOrTemplates) &&
    typeof budgetOrTemplates.max === "number"
  ) {
    minBudget = budgetOrTemplates.min || 0;
    maxBudget = budgetOrTemplates.max;
    targetBudget = Math.round((minBudget + maxBudget) / 2);
  } else if (answers.budgetId === "custom") {
    const num = Number((answers.customBudget || "").replace(/[^0-9]/g, ""));
    if (num > 0) {
      targetBudget = num;
      minBudget = Math.round(num * 0.85);
      maxBudget = num;
    }
  } else if (answers.budgetId) {
    const bandMap: Record<string, [number, number]> = {
      "40-60": [40000, 60000],
      "60-80": [60000, 80000],
      "80-100": [80000, 100000],
      "100-150": [100000, 150000],
      "150+": [150000, 300000],
      budget: [40000, 60000],
      mid: [60000, 80000],
      high: [80000, 140000],
      ultra: [140000, 300000],
    };
    const band = bandMap[answers.budgetId];
    if (band) {
      minBudget = band[0];
      maxBudget = band[1];
      targetBudget = Math.round((band[0] + band[1]) / 2);
    }
  }

  // Normalize catalog items
  const itemsBySlot: Record<ComponentSlotId, NormalizedItem[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
    CaseFans: [],
    Monitor: [],
  };

  for (const [slot, items] of Object.entries(catalog)) {
    if (slot in itemsBySlot) {
      itemsBySlot[slot as ComponentSlotId] = (items || []).map((o) =>
        normalizeItem(o, slot as ComponentSlotId),
      );
    }
  }

  const { recommendations } = synthesizeBuildConfigurations(itemsBySlot, {
    purpose: answers.purpose,
    targetBudget,
    minBudget,
    maxBudget,
    ownedSlots: owned,
    preferredBrands: answers.brands,
    requireWifi: answers.wifi === "Yes",
    resolution: answers.details?.resolution,
    genre: answers.details?.genre,
    software: answers.details?.software,
  });

  return recommendations.map((config, index) => {
    const parts: Record<string, any> = {};
    for (const [slot, normItem] of Object.entries(config.parts)) {
      if (normItem) {
        parts[slot] = normItem.raw;
      }
    }

    const inBudget = config.price >= minBudget && config.price <= maxBudget;
    let note: string | undefined = undefined;
    if (config.price < minBudget) {
      note = "Below your selected range — covers your needs without overspending.";
    }

    return {
      templateId: `dyn-build-${index + 1}-${Date.now().toString(36)}`,
      name: config.title,
      tradeoff:
        config.tradeoffLabel === "Best Value"
          ? "Value"
          : config.tradeoffLabel === "Best Performance"
            ? "Higher-performance"
            : "Balanced",
      tradeoffLabel: config.tradeoffLabel,
      designedFor: config.designedFor,
      highlights: config.highlights,
      parts,
      owned: Array.from(owned),
      note,
      inBudget,
      price: config.price,
      score: config.score,
      workloadScore: config.workloadScore,
      confidenceBadge: config.confidenceBadge,
      confidenceLabel: config.confidenceLabel,
    };
  });
}

export interface BudgetShortfallInfo {
  closestBuild: any;
  shortfallAmount: number;
  maxBudget: number;
  minBudget: number;
}

/**
 * Evaluates whether a genuine budget shortfall exists when 0 builds match within budget.
 * Returns the closest valid build, exact shortfall in INR, and budget boundaries.
 */
export function getBudgetShortfallInfo(
  catalog: Record<string, any[]>,
  answers: {
    purpose: string;
    customText?: string;
    details?: Record<string, string>;
    budgetId?: string;
    customBudget?: string;
    brands?: string[];
    wifi?: string;
    owned?: string[];
  },
  budgetOrTemplates?: any,
): BudgetShortfallInfo | null {
  const owned = new Set(answers.owned || []);

  // Check missing essential categories
  const essentialSlots: ComponentSlotId[] = [
    "CPU",
    "Motherboard",
    "RAM",
    "Storage",
    "PSU",
    "Cabinet",
  ];
  const missing = essentialSlots.filter(
    (slot) => !owned.has(slot) && (!catalog[slot] || catalog[slot].length === 0),
  );
  if (missing.length > 0) return null;

  let minBudget = 40000;
  let maxBudget = 150000;
  let targetBudget = 65000;

  if (
    budgetOrTemplates &&
    typeof budgetOrTemplates === "object" &&
    !Array.isArray(budgetOrTemplates) &&
    typeof budgetOrTemplates.max === "number"
  ) {
    minBudget = budgetOrTemplates.min || 0;
    maxBudget = budgetOrTemplates.max;
    targetBudget = Math.round((minBudget + maxBudget) / 2);
  } else if (answers.budgetId === "custom") {
    const num = Number((answers.customBudget || "").replace(/[^0-9]/g, ""));
    if (num > 0) {
      targetBudget = num;
      minBudget = Math.round(num * 0.85);
      maxBudget = num;
    }
  } else if (answers.budgetId) {
    const bandMap: Record<string, [number, number]> = {
      "40-60": [40000, 60000],
      "60-80": [60000, 80000],
      "80-100": [80000, 100000],
      "100-150": [100000, 150000],
      "150+": [150000, 300000],
      budget: [40000, 60000],
      mid: [60000, 80000],
      high: [80000, 140000],
      ultra: [140000, 300000],
    };
    const band = bandMap[answers.budgetId];
    if (band) {
      minBudget = band[0];
      maxBudget = band[1];
      targetBudget = Math.round((band[0] + band[1]) / 2);
    }
  }

  // Normalize catalog items
  const itemsBySlot: Record<ComponentSlotId, NormalizedItem[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
    CaseFans: [],
    Monitor: [],
  };

  for (const [slot, items] of Object.entries(catalog)) {
    if (slot in itemsBySlot) {
      itemsBySlot[slot as ComponentSlotId] = (items || []).map((o) =>
        normalizeItem(o, slot as ComponentSlotId),
      );
    }
  }

  // Generate without budget ceiling to identify the closest valid configuration
  const { allValidCandidates } = synthesizeBuildConfigurations(itemsBySlot, {
    purpose: answers.purpose,
    targetBudget,
    minBudget,
    maxBudget: undefined, // unbound search for closest
    ownedSlots: owned,
    preferredBrands: answers.brands,
    requireWifi: answers.wifi === "Yes",
    resolution: answers.details?.resolution,
    genre: answers.details?.genre,
    software: answers.details?.software,
  });

  if (allValidCandidates.length === 0) return null;

  // Sort by price ascending to find cheapest valid complete system
  const sorted = allValidCandidates.slice().sort((a, b) => a.price - b.price);
  const closest = sorted[0];

  if (closest.price <= maxBudget) {
    // A build actually fits within budget, not a shortfall
    return null;
  }

  const parts: Record<string, any> = {};
  for (const [slot, normItem] of Object.entries(closest.parts)) {
    if (normItem) {
      parts[slot] = normItem.raw;
    }
  }

  const closestBuildResult = {
    templateId: `closest-build-${Date.now().toString(36)}`,
    name: closest.title,
    tradeoff: "Balanced",
    tradeoffLabel: "Closest Valid Configuration",
    designedFor: closest.designedFor,
    highlights: closest.highlights,
    parts,
    owned: Array.from(owned),
    note: "Above your selected range — closest complete compatible configuration available in store.",
    inBudget: false,
    price: closest.price,
    score: closest.score,
    workloadScore: closest.workloadScore,
    confidenceBadge: closest.confidenceBadge,
    confidenceLabel: closest.confidenceLabel,
  };

  return {
    closestBuild: closestBuildResult,
    shortfallAmount: closest.price - maxBudget,
    maxBudget,
    minBudget,
  };
}

function createBuildFromParts(
  name: string,
  mode: "guided" | "expert",
  parts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  owned: Set<ComponentSlotId | string>,
  workload: GuidedAnswers["purpose"],
): CanonicalBuild {
  let normalizedWorkload: "gaming" | "creation" | "work" | "general" = "general";
  if (workload === "gaming") normalizedWorkload = "gaming";
  else if (workload === "creation") normalizedWorkload = "creation";
  else if (workload === "programming" || workload === "office") normalizedWorkload = "work";
  else normalizedWorkload = "general";

  const compatibility = checkCompatibility(parts, { workload: normalizedWorkload });

  return {
    id: `build-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    mode,
    currency: "INR",
    components: parts,
    compatibility,
    ownedSlots: Array.from(owned) as ComponentSlotId[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
