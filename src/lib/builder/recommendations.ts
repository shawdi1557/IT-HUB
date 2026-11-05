// src/lib/builder/recommendations.ts
// IT HUB Deterministic Guided PC Recommendation Engine
// Dynamically generates valid, fully compatible hardware configurations exclusively from available catalog products.
// Preserves authoritative Shopify prices, variant IDs, and inventory across Find My PC and Expert Mode.

import type {
  CanonicalBuild,
  CanonicalBuildComponent,
  ComponentSlotId,
  GuidedAnswers,
  PublishedPerformanceFigures,
  RecommendationCandidate,
} from "./types";
import {
  calculateSystemPower,
  checkCompatibility,
  hasRejectedSpecs,
  labelCompatibilityGaps,
  reachesReview,
  toCanonicalComponent,
} from "./compatibility";
import { assessFit, prefersForPriority, priorityNote, purposeProfile } from "./purpose";
import {
  comparePartPerformance,
  describeSpecSource,
  INSUFFICIENT_INFORMATION,
  performanceEvidence,
  rankBuilds,
  type ComparedSlot,
  type RankingLabel,
} from "./ranking";

const MAX_RECOMMENDATIONS = 3;

/** How many products per slot the search tries. Each is spread across the price range. */
const SEARCH_LIMIT = { CPU: 5, Motherboard: 3, RAM: 3, GPU: 5 };

/**
 * Up to `limit` products, cheapest to dearest, evenly spaced across the price range. Taking only the
 * cheapest would mean a large budget could never reach the better parts.
 */
function spreadByPrice<T extends { price: number }>(items: T[], limit: number): T[] {
  const sorted = items.slice().sort((a, b) => a.price - b.price);
  if (limit <= 0) return [];
  if (sorted.length <= limit) return sorted;
  if (limit === 1) return [sorted[0]];
  return Array.from(
    { length: limit },
    (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (limit - 1))],
  );
}

/**
 * The products to try for a slot that labels compare. Parts with checked figures go first, because only
 * they can earn a label, but others still get a place so that a customer can be offered them.
 */
function sampleForSearch(slot: ComparedSlot, items: NormalizedItem[], limit: number) {
  if (limit <= 0) return [];
  const checked = items.filter(
    (item) => performanceEvidence(slot, item) === "manufacturer_verified",
  );
  const rest = items.filter((item) => !checked.includes(item));
  const picked = spreadByPrice(checked, rest.length > 0 ? Math.max(1, limit - 2) : limit);
  return [...picked, ...spreadByPrice(rest, limit - picked.length)];
}

/** Parts with checked figures the search left out, and that no part it tried beats. */
function countUntriedCheckedParts(
  slot: ComparedSlot,
  items: NormalizedItem[],
  tried: NormalizedItem[],
): number {
  return items.filter(
    (item) =>
      !tried.includes(item) &&
      performanceEvidence(slot, item) === "manufacturer_verified" &&
      !tried.some((part) => comparePartPerformance(slot, part, item) === "higher"),
  ).length;
}

/** A kit's total memory. Used only to tell builds apart, so a title is good enough where nothing states it. */
function memoryGb(item?: NormalizedItem): number | undefined {
  if (!item) return undefined;
  if (item.capacityGb) return item.capacityGb;
  const size = item.name.match(/(\d{1,3})\s*gb/i)?.[1];
  return size ? Number(size) : undefined;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Specification sources that mean someone checked this exact model. */
const MANUFACTURER_CHECKED = new Set([
  "manufacturer_verified",
  "it_hub_reviewed",
  "verified_manufacturer",
  "verified_technician",
  "internal_verified",
]);

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
  wifiStatedAbsent?: boolean;
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
  performance?: PublishedPerformanceFigures;
  availability: "available" | "unavailable";
  isShopifyLive?: boolean;
  raw: any;
}

function normalizeItem(raw: any, slot: ComponentSlotId): NormalizedItem {
  const isCanonical = "productId" in raw && "specs" in raw;
  const title = (isCanonical ? raw.title : raw.name) || "";
  const normTitle = title.toLowerCase();

  // Only what the catalogue states. Nothing is guessed from a title here: the catalogue already read
  // whatever a title can safely say, for the correct kind of part.
  const socket = isCanonical ? raw.specs.socket : raw.socket;
  const ramGen = isCanonical
    ? raw.specs.supportedRamGeneration || raw.specs.ramGeneration
    : raw.ram;
  const tdpWatts = isCanonical ? raw.specs.tdpWatts || raw.specs.powerWatts : raw.watts;
  const ratedWattage = isCanonical ? raw.specs.ratedWattage : raw.capacity;

  const hasWifi = isCanonical
    ? Boolean(raw.specs.hasWifi)
    : raw.specs
      ? Boolean(raw.specs.hasWifi)
      : Boolean(raw.wifi || /wifi|wi-fi/i.test(normTitle));

  const hasIntegratedGraphics = isCanonical
    ? raw.specs.hasIntegratedGraphics
    : raw.hasIntegratedGraphics;
  const includesCooler = isCanonical ? raw.specs.includesCooler : raw.includesCooler;

  const isLaptopSoDimm = isCanonical ? raw.specs.isLaptopSoDimm : raw.isLaptopSoDimm;
  const lengthMm = isCanonical ? raw.specs.lengthMm : raw.length;
  const maxGpuLengthMm = isCanonical ? raw.specs.maxGpuLengthMm : raw.clearance;
  const capacityGb = isCanonical ? raw.specs.capacityGb : (raw.capacityGb ?? raw.specs?.capacityGb);
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
    wifiStatedAbsent: raw.specs?.hasWifi === false,
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
    performance: raw.specs?.performance,
    availability:
      raw.availability === "unavailable" || raw.stock === 0 ? "unavailable" : "available",
    isShopifyLive: Boolean(raw.isShopifyLive || raw.variantId),
    raw,
  };
}

/** The engine's model of a candidate part, so the search and the rules read the same data. */
function toEnginePart(slot: string, item: NormalizedItem): CanonicalBuildComponent {
  if ("productId" in item.raw && typeof item.raw.specs === "object") return item.raw;
  if (item.raw.specs) return toCanonicalComponent(slot, item.raw);
  return {
    slot: slot as ComponentSlotId,
    productId: item.id,
    variantId: item.variantId || `gid://shopify/ProductVariant/mock-${item.id}`,
    title: item.name,
    price: item.price,
    currency: "INR",
    specs: {
      socket: item.socket,
      supportedRamGeneration: slot === "Motherboard" ? item.ramGeneration : undefined,
      ramGeneration: slot === "RAM" ? item.ramGeneration : undefined,
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
      provenance: (item.verificationStatus || "ambiguous_unverified") as any,
    },
    availability: item.availability,
    quantity: 1,
    retrievedAt: new Date().toISOString(),
    isShopifyLive: item.isShopifyLive,
    isVerified: item.isVerified,
  };
}

export interface SynthesizedConfiguration {
  parts: Partial<Record<ComponentSlotId, NormalizedItem>>;
  price: number;
  title: string;
  /** Set only when the evidence supports it. See rankBuilds. */
  label: RankingLabel;
  /** Why this label, or what's missing, for the customer to read. */
  rankingReasons: string[];
  /** How this build relates to what the customer said they need. */
  purposeNotes: string[];
  /** What stops this compatible build earning a label. */
  labelGaps: string[];
  /** Where the compared parts' specifications came from. */
  specSources: Partial<Record<ComparedSlot, string>>;
  highlights: string[];
  designedFor: string;
  confidenceBadge: "certified" | "advisory" | "high" | "review";
  confidenceLabel: string;
  /** Advice about a build that doesn't need review, with the reason, for the customer to read. */
  advisories: { label: string; explanation: string }[];
  /** Whether review is needed because a specification is missing, and not only because of a warning. */
  hasUnknownSpecs: boolean;
  /** Some compatibility can't be confirmed from the catalogue, so IT HUB must check it. */
  requiresReview: boolean;
  /** What the check couldn't confirm, for the customer to read. */
  reviewItems: string[];
  /** The build includes a power supply whose stated wattage meets what this build needs. */
  psuKnownAdequate: boolean;
}

/**
 * Dynamically synthesizes hardware build configurations from available products.
 * Uses multi-branch combinatorial exploration, strict budget ceiling enforcement,
 * near-duplicate filtering, and labels backed by published specifications only.
 */
function synthesizeBuildConfigurations(
  itemsBySlot: Record<ComponentSlotId, NormalizedItem[]>,
  options: {
    purpose: string;
    maxBudget?: number;
    ownedSlots: Set<string>;
    preferredBrands?: string[];
    requireWifi?: boolean;
    /** What the customer told us about their use. */
    details?: Record<string, string>;
    /** Also offer builds whose compatibility can't be confirmed. They're always marked for review. */
    allowUnverified?: boolean;
  },
): {
  recommendations: SynthesizedConfiguration[];
  allValidCandidates: SynthesizedConfiguration[];
} {
  const {
    purpose,
    maxBudget,
    ownedSlots,
    preferredBrands = [],
    requireWifi = false,
    details = {},
    allowUnverified = false,
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
  const profile = purposeProfile(purpose, details, requireWifi);
  const wantedMemoryGb = profile.requirement?.memoryGb;

  // Candidate pool
  const candidatePool: SynthesizedConfiguration[] = [];

  // Filter CPUs: prefer in-stock & live products. A part whose specifications IT HUB has rejected is
  // never recommended, though a customer can still choose it in the manual builder, where it's marked.
  for (const slot of Object.keys(itemsBySlot) as ComponentSlotId[]) {
    itemsBySlot[slot] = (itemsBySlot[slot] || []).filter(
      (c) => c.availability !== "unavailable" && !hasRejectedSpecs(c.raw?.specs),
    );
  }
  const cpus = itemsBySlot.CPU || [];
  if (cpus.length === 0) return { recommendations: [], allValidCandidates: [] };

  // A part dearer than the whole budget can't be in a build within it.
  const affordable = <T extends { price: number }>(items: T[]) =>
    maxBudget ? items.filter((item) => item.price <= maxBudget) : items;

  // Branch CPUs across the price range, preferred brands first.
  const isPreferredBrand = (cpu: NormalizedItem) =>
    preferredBrands.some((brand) => cpu.name.toLowerCase().includes(brand.toLowerCase()));
  const preferredCpus = sampleForSearch(
    "CPU",
    affordable(cpus).filter(isPreferredBrand),
    SEARCH_LIMIT.CPU,
  );
  const otherCpus = sampleForSearch(
    "CPU",
    affordable(cpus).filter((cpu) => !isPreferredBrand(cpu)),
    SEARCH_LIMIT.CPU - preferredCpus.length,
  );
  const triedCpus = [...preferredCpus, ...otherCpus];

  // One of each model, across the price range. Titles are compared whole, because cards from one maker
  // often share their opening words.
  const seenModels = new Set<string>();
  const distinctGpus = (itemsBySlot.GPU || [])
    .slice()
    .sort((a, b) => a.price - b.price)
    .filter((g) => {
      const model = g.name
        .replace(/^\[TEST\]\s*/i, "")
        .trim()
        .toLowerCase();
      if (seenModels.has(model)) return false;
      seenModels.add(model);
      return true;
    });
  const triedGpus = sampleForSearch("GPU", affordable(distinctGpus), SEARCH_LIMIT.GPU);
  const untriedCheckedParts =
    countUntriedCheckedParts("CPU", affordable(cpus), triedCpus) +
    (ownedSlots.has("GPU")
      ? 0
      : countUntriedCheckedParts("GPU", affordable(distinctGpus), triedGpus));

  // Cheapest parts first, whatever their confidence, and the build says what isn't confirmed. A power
  // supply is the one exception to trying only the cheapest: one with an unstated wattage can't be
  // assumed adequate, so it's tried as a separate option that goes to review.
  const psuPreferences = allowUnverified ? ["adequate", "unstated"] : ["adequate"];

  for (const cpu of triedCpus) {
    const cpuSocket = cpu.socket;

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

    const wifiMobo = allMobos.find((m) => m.hasWifi && m.id !== allMobos[0].id);
    const moboBranches = uniqueById([
      allMobos[0],
      ...(wifiMobo ? [wifiMobo] : []),
      ...spreadByPrice(affordable(allMobos), SEARCH_LIMIT.Motherboard),
    ]);

    for (const mobo of moboBranches) {
      // 2. Branch RAM (up to 2: e.g. 16GB vs 32GB)
      const targetRamGen = mobo.ramGeneration;
      const allRams = (itemsBySlot.RAM || []).filter(
        (r) =>
          !r.isLaptopSoDimm &&
          (!r.ramGeneration ||
            !targetRamGen ||
            r.ramGeneration.toUpperCase().trim() === targetRamGen.toUpperCase().trim()),
      );
      if (allRams.length === 0 && !ownedSlots.has("RAM")) continue;

      // Memory meeting the published recommendation comes first when there is one.
      allRams.sort((a, b) => {
        if (wantedMemoryGb) {
          const aMeets = (memoryGb(a) || 0) >= wantedMemoryGb;
          const bMeets = (memoryGb(b) || 0) >= wantedMemoryGb;
          if (aMeets !== bMeets) return aMeets ? -1 : 1;
        }
        return a.price - b.price;
      });

      const ramBranches: Array<NormalizedItem | undefined> = ownedSlots.has("RAM")
        ? [undefined]
        : uniqueById([allRams[0], ...spreadByPrice(affordable(allRams), SEARCH_LIMIT.RAM)]);

      for (const ram of ramBranches) {
        // 3. Storage
        const allStorage = (itemsBySlot.Storage || []).slice().sort((a, b) => a.price - b.price);
        if (allStorage.length === 0 && !ownedSlots.has("Storage")) continue;
        const storage1tb = allStorage.find((s) => s.name.includes("1TB") || s.name.includes("1tb"));
        const storageOptions = storage1tb
          ? [storage1tb, ...allStorage.filter((s) => s.id !== storage1tb.id)]
          : allStorage;

        // 4. Cabinet
        const allCabinets = (itemsBySlot.Cabinet || []).slice().sort((a, b) => a.price - b.price);
        if (allCabinets.length === 0 && !ownedSlots.has("Cabinet")) continue;

        // 5. Branch GPUs
        const gpuBranches: Array<NormalizedItem | undefined> = [];
        if (ownedSlots.has("GPU")) {
          gpuBranches.push(undefined);
        } else if (profile.requiresDedicatedGpu || !cpu.hasIntegratedGraphics) {
          if (distinctGpus.length === 0) {
            if (!cpu.hasIntegratedGraphics) continue;
            gpuBranches.push(undefined);
          } else {
            gpuBranches.push(...(triedGpus.length > 0 ? triedGpus : [distinctGpus[0]]));
          }
        } else {
          // Work / General
          if (cpu.hasIntegratedGraphics) {
            gpuBranches.push(undefined);
          }
          if (distinctGpus.length > 0) {
            gpuBranches.push(distinctGpus[0]);
          }
        }

        for (const gpu of gpuBranches)
          for (const psuPreference of psuPreferences) {
            // Each remaining slot takes the first option that fits the parts already chosen, so one
            // unsuitable cheap product can't rule a build out while a suitable one is on sale.
            const chosen: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {
              CPU: toEnginePart("CPU", cpu),
              Motherboard: toEnginePart("Motherboard", mobo),
            };
            if (ram) chosen.RAM = toEnginePart("RAM", ram);
            if (gpu) chosen.GPU = toEnginePart("GPU", gpu);
            const fits = (slot: ComponentSlotId, item: NormalizedItem) =>
              !checkCompatibility({ ...chosen, [slot]: toEnginePart(slot, item) }).items.some(
                (check) => check.severity === "error" && check.affectedSlots.includes(slot),
              );

            // 6. Storage
            const storage = storageOptions.find((option) => fits("Storage", option));
            if (!storage && !ownedSlots.has("Storage")) continue;
            if (storage && ownedSlots.has("Storage")) {
              // Already owned, so nothing is added to the build.
            } else if (storage) {
              chosen.Storage = toEnginePart("Storage", storage);
            }

            // 7. Cabinet and cooler. A processor that comes with a cooler doesn't have another added.
            const allCoolers = (itemsBySlot.Cooler || []).slice().sort((a, b) => a.price - b.price);
            const needsCooler = !cpu.includesCooler && !ownedSlots.has("Cooler");
            // Needed but not sold: only a processor whose cooler is merely unstated can go ahead, and
            // only as a build marked for review.
            if (
              needsCooler &&
              allCoolers.length === 0 &&
              (cpu.includesCooler === false || !allowUnverified)
            ) {
              continue;
            }

            let cabinet: NormalizedItem | undefined = undefined;
            let cooler: NormalizedItem | undefined = undefined;
            if (ownedSlots.has("Cabinet")) {
              cooler = needsCooler
                ? allCoolers.find((option) => fits("Cooler", option))
                : undefined;
              if (needsCooler && allCoolers.length > 0 && !cooler) continue;
            } else {
              let placed = false;
              for (const option of allCabinets) {
                if (!fits("Cabinet", option)) continue;
                chosen.Cabinet = toEnginePart("Cabinet", option);
                const fittingCooler = needsCooler
                  ? allCoolers.find((candidate) => fits("Cooler", candidate))
                  : undefined;
                if (needsCooler && allCoolers.length > 0 && !fittingCooler) {
                  delete chosen.Cabinet;
                  continue;
                }
                cabinet = option;
                cooler = fittingCooler;
                placed = true;
                break;
              }
              if (!placed) continue;
            }
            if (cooler) chosen.Cooler = toEnginePart("Cooler", cooler);

            // 8. Power supply, using the same calculation as the compatibility rules.
            const power = calculateSystemPower({
              CPU: chosen.CPU,
              ...(chosen.GPU ? { GPU: chosen.GPU } : {}),
            });
            const recWatts = power.recommendedPsuWatts;

            const allPsus = (itemsBySlot.PSU || []).slice();
            if (allPsus.length === 0 && !ownedSlots.has("PSU")) continue;

            // A power supply with no stated wattage never counts as meeting the requirement.
            const matchingPsus = allPsus
              .filter((p) => (p.ratedWattage || 0) >= recWatts)
              .sort((a, b) => a.price - b.price);
            const unstatedPsus = allPsus
              .filter((p) => !p.ratedWattage)
              .sort((a, b) => a.price - b.price);
            const otherPsus = allPsus
              .filter((p) => (p.ratedWattage || 0) < recWatts && p.ratedWattage)
              .sort((a, b) => (b.ratedWattage || 0) - (a.ratedWattage || 0));
            const psuOrder =
              psuPreference === "unstated"
                ? [...unstatedPsus, ...matchingPsus, ...otherPsus]
                : [...matchingPsus, ...otherPsus, ...unstatedPsus];
            const psu = ownedSlots.has("PSU")
              ? undefined
              : psuOrder.find((option) => fits("PSU", option));
            if (!psu && !ownedSlots.has("PSU")) continue;

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
            const canonicalPartsForCompat: Partial<
              Record<ComponentSlotId, CanonicalBuildComponent>
            > = {};
            for (const [s, item] of Object.entries(candidateParts)) {
              if (item) {
                canonicalPartsForCompat[s as ComponentSlotId] = toEnginePart(s, item);
              }
            }
            const compatSummary = checkCompatibility(canonicalPartsForCompat, {
              workload: isGaming ? "gaming" : isCreation ? "creation" : isWork ? "work" : "general",
              mode: "automated",
              ownedSlots,
            });

            // Errors always rule a build out. Unknowns do too, unless the caller asked for builds that
            // IT HUB must check, and those are marked as such.
            if (
              !compatSummary.validForAutomatedRecommendation &&
              !(allowUnverified && !compatSummary.items.some((i) => i.severity === "error"))
            ) {
              continue;
            }
            const reviewItems = compatSummary.items.filter(reachesReview).map((i) => i.label);
            const hasUnknownSpecs = compatSummary.items.some((i) => i.status === "unknown");
            const advisories = compatSummary.items
              .filter((i) => i.status === "conditional" && !reachesReview(i))
              .map((i) => ({
                label: i.label,
                explanation: [i.explanation, i.suggestedResolution].filter(Boolean).join(" "),
              }));
            const requiresReview = !compatSummary.validForAutomatedRecommendation;
            const labelGaps = labelCompatibilityGaps(canonicalPartsForCompat, compatSummary.items);

            // Calculate unowned total price
            let price = 0;
            for (const [slot, item] of Object.entries(candidateParts)) {
              if (item && !ownedSlots.has(slot)) {
                price += item.price;
              }
            }

            // Titles & Badges
            const cleanCpu = cpu.name.replace(/^\[TEST\]\s*/i, "").trim();
            const cleanGpu = gpu ? gpu.name.replace(/^\[TEST\]\s*/i, "").trim() : "";
            const gpuShort = cleanGpu ? cleanGpu.split(" ").slice(0, 3).join(" ") : "";

            const title = cleanGpu
              ? `${cleanCpu} · ${gpuShort} Build`
              : `${cleanCpu} Custom System`;
            // A build with no graphics card isn't sold as gaming. A requested resolution isn't promised here.
            const designedFor = isGaming
              ? gpu || ownedSlots.has("GPU")
                ? "Gaming & Everyday Use"
                : "Everyday use, with integrated graphics"
              : isCreation
                ? "Content Creation & Rendering"
                : "Productivity & Multitasking";

            const highlights: string[] = [
              `${cleanCpu} processor`,
              gpu
                ? `${cleanGpu} dedicated graphics card`
                : ownedSlots.has("GPU")
                  ? "Your existing graphics card"
                  : "The processor's integrated graphics",
              storage ? storage.name.replace(/^\[TEST\]\s*/i, "") : "Your existing storage",
            ];
            if (mobo.hasWifi)
              highlights.push("Integrated Wi-Fi connectivity built into motherboard");

            // Specification confidence
            const partsList = Object.values(candidateParts).filter(Boolean) as NormalizedItem[];
            const allVerified =
              reviewItems.length === 0 &&
              partsList.every((p) => MANUFACTURER_CHECKED.has(p.verificationStatus || ""));
            const coreVerified = [cpu, mobo, ram, psu, gpu]
              .filter(Boolean)
              .every(
                (p: any) =>
                  p.isVerified ||
                  p.verificationStatus === "verified_manufacturer" ||
                  p.verificationStatus === "verified_technician",
              );

            // Confirmed means every check passed, not only that the specifications are on file.
            const confidenceBadge: SynthesizedConfiguration["confidenceBadge"] = requiresReview
              ? "review"
              : allVerified
                ? compatSummary.status === "compatible"
                  ? "certified"
                  : "advisory"
                : coreVerified
                  ? "high"
                  : "review";
            const confidenceLabel =
              confidenceBadge === "certified"
                ? "Specifications confirmed"
                : confidenceBadge === "advisory"
                  ? "Specifications on file, with advice"
                  : confidenceBadge === "high"
                    ? "Some specifications unconfirmed"
                    : "Review Required";

            candidatePool.push({
              parts: candidateParts,
              price,
              title,
              label: INSUFFICIENT_INFORMATION,
              rankingReasons: [],
              purposeNotes: [],
              labelGaps,
              specSources: {
                CPU: describeSpecSource("CPU", cpu),
                ...(gpu ? { GPU: describeSpecSource("GPU", gpu) } : {}),
              },
              highlights,
              designedFor,
              confidenceBadge,
              confidenceLabel,
              requiresReview,
              reviewItems,
              advisories,
              hasUnknownSpecs,
              psuKnownAdequate: Boolean(psu?.ratedWattage && psu.ratedWattage >= recWatts),
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
    const ramCap = memoryGb(c.parts.RAM) ?? "unstated";
    // A build that needs review stays separate from one that doesn't, so the customer sees both a
    // cheaper option IT HUB must check and a dearer one that needs no checking.
    const key = `${cpuName}|${gpuName}|${ramCap}|${c.requiresReview}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, c);
    } else {
      const existing = groupMap.get(key)!;
      // The same processor, graphics card and memory: keep what fits the budget, then the requested
      // Wi-Fi, then a power supply known to be enough, then the lower price. An unknown power supply
      // would otherwise win on price alone, and the price shown would rest on a part that may not work.
      const hasWifi = (config: SynthesizedConfiguration) =>
        Boolean(config.parts.Motherboard?.hasWifi);
      const inBudget = (config: SynthesizedConfiguration) =>
        !maxBudget || config.price <= maxBudget;
      let better = c.price < existing.price;
      if (inBudget(c) !== inBudget(existing)) better = inBudget(c);
      else if (requireWifi && hasWifi(c) !== hasWifi(existing)) better = hasWifi(c);
      else if (c.psuKnownAdequate !== existing.psuKnownAdequate) better = c.psuKnownAdequate;
      if (better) groupMap.set(key, c);
    }
  }

  // A build needing review adds nothing if the same parts cost no more without needing it.
  const sameParts = (config: SynthesizedConfiguration) =>
    `${config.parts.CPU?.id}|${config.parts.GPU?.id}|${memoryGb(config.parts.RAM)}`;
  const allDistinctCandidates = Array.from(groupMap.values())
    .filter(
      (config) =>
        !config.requiresReview ||
        !Array.from(groupMap.values()).some(
          (other) =>
            !other.requiresReview &&
            sameParts(other) === sameParts(config) &&
            other.price <= config.price,
        ),
    )
    .sort((a, b) => a.price - b.price);

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

  // ── What the Customer Asked For ─────────────────────────────────────────────
  const fitChecks = withinBudget.map((build) => assessFit(build, profile, ownedSlots));
  const shortfalls = fitChecks.map(
    (checks) => checks.filter((check) => check.status === "below").length,
  );
  // Where no build meets everything, the builds that come closest count as meeting the request.
  const fewestShortfalls = Math.min(...shortfalls);
  const fallsShort = (index: number) => shortfalls[index] > fewestShortfalls;

  // ── Evidence-Based Labels ───────────────────────────────────────────────────
  // Labels compare the builds that come closest to the published recommendation.
  const rankings = rankBuilds(
    withinBudget.map((build, index) => ({
      price: build.price,
      requiresReview: build.requiresReview,
      parts: { CPU: build.parts.CPU, GPU: build.parts.GPU },
      memoryGb: memoryGb(build.parts.RAM),
      labelGaps: [
        ...build.labelGaps,
        ...(fallsShort(index)
          ? ["It falls further short of what you asked for than other builds."]
          : []),
      ],
    })),
    {
      ownedSlots,
      needsDedicatedGpu: profile.requiresDedicatedGpu,
      untriedCheckedParts,
    },
  );
  const ranked = withinBudget.map((build, index) => ({
    ...build,
    label: rankings[index].label,
    rankingReasons: rankings[index].reasons,
    outclassed: rankings[index].outclassed,
    fallsShort: fallsShort(index),
    purposeNotes: fitChecks[index].map((check) => check.note),
  }));

  // Every labelled build is shown. So is the build that best suits what the customer's use leans on.
  // The remaining places go across the price range, builds meeting the request first, and never to one
  // that a build at the same price or less verifiably beats.
  const eligible = ranked.filter((build) => !build.outclassed);
  const meeting = eligible.filter((build) => !build.fallsShort);
  const prioritySlot = profile.priority;
  const priorityPool = meeting.length > 0 ? meeting : eligible;
  const priorityPick =
    prioritySlot && priorityPool.length > 1
      ? priorityPool.reduce((best, build) =>
          prefersForPriority(build, best, prioritySlot) ? build : best,
        )
      : undefined;
  const shown = ranked.filter((build) => build.label !== INSUFFICIENT_INFORMATION);
  // A developer may not need a graphics card, so a build without one is never crowded out of the offer.
  const noCardPick =
    purpose === "programming" && !ownedSlots.has("GPU")
      ? (meeting.length > 0 ? meeting : eligible).find((build) => !build.parts.GPU)
      : undefined;
  if (noCardPick && !shown.includes(noCardPick) && shown.length < MAX_RECOMMENDATIONS) {
    shown.push(noCardPick);
  }
  if (priorityPick && !shown.includes(priorityPick) && shown.length < MAX_RECOMMENDATIONS) {
    shown.push(priorityPick);
  }
  for (const pool of [meeting, eligible]) {
    const left = pool.filter((build) => !shown.includes(build));
    shown.push(...spreadByPrice(left, MAX_RECOMMENDATIONS - shown.length));
  }

  const resolutionNote = profile.requestedResolution
    ? `You asked for ${profile.requestedResolution}. Frame rates aren't measured here, so please ask IT HUB to confirm it for your games.`
    : undefined;

  const toRecommendation = (build: (typeof ranked)[number]): SynthesizedConfiguration => {
    const { outclassed: _outclassed, fallsShort: _fallsShort, ...config } = build;
    const pickNote =
      build === priorityPick
        ? priorityNote(
            build,
            shown.filter((other) => other !== build),
            profile,
          )
        : undefined;
    return {
      ...config,
      purposeNotes: [
        ...(resolutionNote ? [resolutionNote] : []),
        ...(pickNote ? [pickNote] : []),
        ...config.purposeNotes,
      ],
    };
  };

  return {
    recommendations: shown.map(toRecommendation).sort((a, b) => a.price - b.price),
    allValidCandidates: allDistinctCandidates,
  };
}

const RECOMMENDATION_STYLE: Record<RankingLabel, RecommendationCandidate["style"]> = {
  "Best Value": "best-fit",
  "Best Balanced": "balanced",
  "Highest Verified Performance": "upgrade-friendly",
  "Insufficient information": "not-ranked",
};

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
    maxBudget: Math.round(budget * 1.15),
    ownedSlots: owned,
    preferredBrands: answers.preferredBrands,
    requireWifi: answers.requireWifi,
    details: answers.details,
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
        style: RECOMMENDATION_STYLE[config.label],
        title: config.title,
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
  options: { allowUnverified?: boolean } = {},
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

  // 1. Explicit budget object passed from Builder.tsx: { min, max, label }
  if (
    budgetOrTemplates &&
    typeof budgetOrTemplates === "object" &&
    !Array.isArray(budgetOrTemplates) &&
    typeof budgetOrTemplates.max === "number"
  ) {
    minBudget = budgetOrTemplates.min || 0;
    maxBudget = budgetOrTemplates.max;
  } else if (answers.budgetId === "custom") {
    const num = Number((answers.customBudget || "").replace(/[^0-9]/g, ""));
    if (num > 0) {
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
    maxBudget,
    ownedSlots: owned,
    preferredBrands: answers.brands,
    requireWifi: answers.wifi === "Yes",
    details: answers.details,
    allowUnverified: options.allowUnverified,
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
      note = "This costs less than the range you selected.";
    }

    return {
      templateId: `dyn-build-${index + 1}-${Date.now().toString(36)}`,
      name: config.title,
      tradeoff: config.label,
      tradeoffLabel: config.label,
      rankingReasons: config.rankingReasons,
      purposeNotes: config.purposeNotes,
      specSources: config.specSources,
      designedFor: config.designedFor,
      highlights: config.highlights,
      parts,
      owned: Array.from(owned),
      note,
      inBudget,
      price: config.price,
      confidenceBadge: config.confidenceBadge,
      confidenceLabel: config.confidenceLabel,
      requiresReview: config.requiresReview,
      reviewItems: config.reviewItems,
      advisories: config.advisories,
      hasUnknownSpecs: config.hasUnknownSpecs,
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
  options: { allowUnverified?: boolean } = {},
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

  if (
    budgetOrTemplates &&
    typeof budgetOrTemplates === "object" &&
    !Array.isArray(budgetOrTemplates) &&
    typeof budgetOrTemplates.max === "number"
  ) {
    minBudget = budgetOrTemplates.min || 0;
    maxBudget = budgetOrTemplates.max;
  } else if (answers.budgetId === "custom") {
    const num = Number((answers.customBudget || "").replace(/[^0-9]/g, ""));
    if (num > 0) {
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
    maxBudget: undefined, // unbound search for closest
    ownedSlots: owned,
    preferredBrands: answers.brands,
    // The closest complete build, whatever its board: a dearer Wi-Fi board mustn't create a shortfall.
    requireWifi: false,
    details: answers.details,
    allowUnverified: options.allowUnverified,
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
    tradeoff: "Closest available build",
    tradeoffLabel: "Closest available build",
    rankingReasons: [],
    purposeNotes: [],
    specSources: closest.specSources,
    designedFor: closest.designedFor,
    highlights: closest.highlights,
    parts,
    owned: Array.from(owned),
    note: "Above your selected range — closest complete compatible configuration available in store.",
    inBudget: false,
    price: closest.price,
    confidenceBadge: closest.confidenceBadge,
    confidenceLabel: closest.confidenceLabel,
    requiresReview: closest.requiresReview,
    reviewItems: closest.reviewItems,
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
