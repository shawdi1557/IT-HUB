// src/lib/builder/ranking.ts
// Compares builds using only published specifications. There are no scores, weights or benchmarks.
// Where the figures can't settle a comparison, the answer is "insufficient information".

import type { PublishedPerformanceFigures } from "./types";

export type RankingLabel =
  | "Best Value"
  | "Best Balanced"
  | "Highest Verified Performance"
  | "Insufficient information";

export const INSUFFICIENT_INFORMATION: RankingLabel = "Insufficient information";

/** Shown beside every label, so nobody reads a specification comparison as a measured result. */
export const RANKING_BASIS =
  "Labels compare published specifications only. They aren't measured game or application performance.";

export type ComparedSlot = "CPU" | "GPU";
const COMPARED_SLOTS: ComparedSlot[] = ["CPU", "GPU"];

/**
 * The figures compared for each kind of part, grouped by what they describe. Figures in one group
 * tend to move together, such as cores and threads, so together they count as one piece of evidence.
 */
const FIGURE_GROUPS: Record<ComparedSlot, Record<string, string[]>> = {
  CPU: {
    cores: ["performanceCores", "totalCores", "threads"],
    clockSpeed: ["maxBoostMhz"],
    cache: ["cacheMb"],
  },
  GPU: {
    shaderUnits: ["shaderUnits"],
    clockSpeed: ["boostClockMhz"],
    memory: ["vramGb", "memoryBusBits"],
  },
};

/** One kind of figure alone, such as core count or memory, never decides a comparison. */
const MIN_GROUPS_AHEAD = 2;

/**
 * A position runs from 0 for the lowest of the parts compared to 1 for the highest. A build pairing
 * opposite ends is never balanced. Beyond that no threshold is claimed: the closest pairing is chosen.
 */
const OPPOSITE_ENDS = 1;

export type EvidenceLevel = "manufacturer_verified" | "supplier_stated" | "missing";

export type PerformanceComparison =
  | "higher"
  | "lower"
  /** The same part, identical figures, or too small a difference to decide on. */
  | "no_clear_difference"
  /** Different architectures, or some figures higher and others lower. */
  | "incomparable"
  /** At least one part has no complete figures. */
  | "insufficient";

export interface RankablePart {
  id: string;
  name: string;
  performance?: PublishedPerformanceFigures;
  verificationStatus?: string;
}

export interface RankableBuild {
  price: number;
  requiresReview: boolean;
  parts: Partial<Record<ComparedSlot, RankablePart>>;
  /** Anything else that stops this build earning a label, for the customer to read. */
  labelGaps?: string[];
  /** A build with less memory hasn't beaten one with more, whatever its processor and card. */
  memoryGb?: number;
}

export interface RankOptions {
  /** A part the customer already owns is the same in every build, so it isn't compared. */
  ownedSlots: Set<string>;
  /** The purpose needs a dedicated graphics card, so a build without one has no evidence for it. */
  needsDedicatedGpu: boolean;
  /** Parts with checked figures the search didn't try. One of them could outrank every build here. */
  untriedCheckedParts?: number;
}

export interface BuildRanking {
  label: RankingLabel;
  reasons: string[];
  /** Another confirmed build is at least as capable for the same price or less. */
  outclassed: boolean;
}

const figuresFor = (slot: ComparedSlot) => Object.values(FIGURE_GROUPS[slot]).flat();

function hasCompleteFigures(slot: ComparedSlot, part: RankablePart): boolean {
  const performance = part.performance;
  if (!performance?.architecture?.trim()) return false;
  return figuresFor(slot).every((figure) => {
    const value = performance.figures?.[figure];
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  });
}

/**
 * How far a part's figures can be trusted. Only the specification registry sets a manufacturer status,
 * and each entry must also name its source. A title or a Shopify tag can't raise this.
 */
export function performanceEvidence(slot: ComparedSlot, part: RankablePart): EvidenceLevel {
  if (!hasCompleteFigures(slot, part)) return "missing";
  // A registry entry can hold sourced figures even where some of its other values are unconfirmed, or
  // were completed by IT HUB's review. Figures only ever come from the registry, with their own source.
  const fromManufacturer =
    part.verificationStatus === "manufacturer_verified" ||
    part.verificationStatus === "verified_manufacturer" ||
    part.verificationStatus === "registry_unverified" ||
    part.verificationStatus === "it_hub_reviewed";
  return fromManufacturer && /^https:\/\/\S+$/.test(part.performance?.sourceUrl || "")
    ? "manufacturer_verified"
    : "supplier_stated";
}

/**
 * Compares two parts of the same kind. One is higher only when they share an architecture, none of its
 * figures is lower, and it leads in at least two groups of figures.
 */
export function comparePartPerformance(
  slot: ComparedSlot,
  a: RankablePart,
  b: RankablePart,
): PerformanceComparison {
  if (a.id === b.id) return "no_clear_difference";
  if (performanceEvidence(slot, a) === "missing" || performanceEvidence(slot, b) === "missing") {
    return "insufficient";
  }
  const architecture = (part: RankablePart) => part.performance!.architecture.trim().toLowerCase();
  if (architecture(a) !== architecture(b)) return "incomparable";

  let aheadGroups = 0;
  let behindGroups = 0;
  for (const group of Object.values(FIGURE_GROUPS[slot])) {
    const differences = group.map(
      (figure) => a.performance!.figures[figure] - b.performance!.figures[figure],
    );
    if (differences.some((difference) => difference > 0)) aheadGroups++;
    if (differences.some((difference) => difference < 0)) behindGroups++;
  }
  if (aheadGroups > 0 && behindGroups > 0) return "incomparable";
  if (aheadGroups >= MIN_GROUPS_AHEAD) return "higher";
  if (behindGroups >= MIN_GROUPS_AHEAD) return "lower";
  return "no_clear_difference";
}

function comparedSlots(options: RankOptions): ComparedSlot[] {
  return COMPARED_SLOTS.filter((slot) => !options.ownedSlots.has(slot));
}

/** Higher only when no compared part is lower and at least one is higher. */
export function compareBuildPerformance(
  a: RankableBuild,
  b: RankableBuild,
  options: RankOptions,
): PerformanceComparison {
  let higher = false;
  let lower = false;
  for (const slot of comparedSlots(options)) {
    const partA = a.parts[slot];
    const partB = b.parts[slot];
    if (!partA && !partB) continue;
    // Integrated graphics have no figures to set against a dedicated card.
    if (!partA || !partB) return "incomparable";
    const result = comparePartPerformance(slot, partA, partB);
    if (result === "insufficient" || result === "incomparable") return result;
    if (result === "higher") higher = true;
    if (result === "lower") lower = true;
  }
  if (higher && lower) return "incomparable";
  if (higher) return "higher";
  if (lower) return "lower";
  return "no_clear_difference";
}

/** Why a build can't be compared. An empty list means it can be. */
function evidenceGaps(build: RankableBuild, options: RankOptions): string[] {
  const gaps: string[] = [];
  if (build.requiresReview) {
    gaps.push("IT HUB still has to check this build's compatibility, so it isn't ranked.");
  }
  gaps.push(...(build.labelGaps || []));
  const slots = comparedSlots(options);
  if (slots.length === 0) gaps.push("You already own the parts these labels compare.");
  for (const slot of slots) {
    const part = build.parts[slot];
    if (!part) {
      if (slot === "CPU" || options.needsDedicatedGpu) {
        gaps.push(
          `This build has no ${slot === "CPU" ? "processor" : "graphics card"} to compare.`,
        );
      }
      continue;
    }
    const level = performanceEvidence(slot, part);
    if (level === "missing") {
      gaps.push(`No checked manufacturer figures are on file for ${part.name}.`);
    } else if (level === "supplier_stated") {
      gaps.push(`The figures for ${part.name} haven't been checked against the manufacturer's.`);
    }
  }
  return gaps;
}

/**
 * Where each part sits among the parts compared, from 0 to 1. There's no answer when any two of them
 * can't be compared or when no part leads another, because a position then means nothing.
 */
function slotPositions(
  slot: ComparedSlot,
  builds: RankableBuild[],
): Map<string, number> | undefined {
  const parts = new Map<string, RankablePart>();
  for (const build of builds) {
    const part = build.parts[slot];
    if (part) parts.set(part.id, part);
  }
  const list = [...parts.values()];
  const levels = new Map<string, number>();
  for (const part of list) {
    let beaten = 0;
    for (const other of list) {
      if (other.id === part.id) continue;
      const result = comparePartPerformance(slot, part, other);
      if (result === "incomparable" || result === "insufficient") return undefined;
      if (result === "higher") beaten++;
    }
    levels.set(part.id, beaten);
  }
  const top = Math.max(0, ...levels.values());
  if (top === 0) return undefined;
  return new Map([...levels].map(([id, level]) => [id, level / top]));
}

/**
 * Labels each build. The rules, and the evidence each needs:
 *
 * A build can be compared only if IT HUB doesn't have to review it and its processor and graphics card
 * have complete figures from the specification registry, with a source named.
 *
 * - Highest Verified Performance: higher than at least one other compared build, and never lower than
 *   or incomparable with any of them.
 * - Best Value: the cheapest build not beaten at its price, comparable with every other compared build,
 *   with a dearer build that's verifiably higher, so the saving has a known cost. Price per unit of
 *   performance isn't calculated, because no measured performance is held.
 * - Best Balanced: not beaten at its price, with a compared build below it and another above it, and
 *   its processor and graphics card the closest pairing among the parts compared, and not at opposite
 *   ends. This needs more than one processor and more than one graphics card to compare.
 *
 * Every other build reports insufficient information, with the reason.
 */
export function rankBuilds<T extends RankableBuild>(
  builds: T[],
  options: RankOptions,
): BuildRanking[] {
  const gaps = builds.map((build) => evidenceGaps(build, options));
  const comparedIndexes = builds.map((_, index) => index).filter((i) => gaps[i].length === 0);
  const compared = comparedIndexes.map((i) => builds[i]);
  const notCompared = builds.length - compared.length;

  const relations = compared.map((a) =>
    compared.map((b) => (a === b ? null : compareBuildPerformance(a, b, options))),
  );
  const others = (i: number) => relations[i].filter((relation) => relation !== null);
  const cheaperOrEqualBeats = (i: number) =>
    compared.some(
      (other, j) =>
        j !== i &&
        (other.memoryGb ?? 0) >= (compared[i].memoryGb ?? 0) &&
        ((relations[j][i] === "higher" && other.price <= compared[i].price) ||
          (relations[j][i] === "no_clear_difference" && other.price < compared[i].price)),
    );
  const onFrontier = compared.map((_, i) => !cheaperOrEqualBeats(i));
  const byPrice = (a: number, b: number) => compared[a].price - compared[b].price;
  const indexes = compared.map((_, i) => i);

  const highestCandidate = indexes
    .filter((i) => {
      const relation = others(i);
      return (
        relation.includes("higher") &&
        relation.every((r) => r === "higher" || r === "no_clear_difference")
      );
    })
    .sort(byPrice)[0];
  const untried = options.untriedCheckedParts || 0;
  const highest = untried > 0 ? undefined : highestCandidate;

  const cheapest = indexes.filter((i) => onFrontier[i]).sort(byPrice)[0];
  const value =
    cheapest !== undefined &&
    others(cheapest).includes("lower") &&
    !others(cheapest).includes("incomparable")
      ? cheapest
      : undefined;

  const cpuPositions = slotPositions("CPU", compared);
  const gpuPositions = slotPositions("GPU", compared);
  const balanceGap = (i: number) => {
    const cpu = compared[i].parts.CPU;
    const gpu = compared[i].parts.GPU;
    const cpuPosition = cpu && cpuPositions?.get(cpu.id);
    const gpuPosition = gpu && gpuPositions?.get(gpu.id);
    return typeof cpuPosition === "number" && typeof gpuPosition === "number"
      ? Math.abs(cpuPosition - gpuPosition)
      : undefined;
  };
  const balanced =
    comparedSlots(options).length < 2
      ? undefined
      : indexes
          .filter((i) => {
            const gap = balanceGap(i);
            return (
              i !== highest &&
              i !== value &&
              onFrontier[i] &&
              others(i).includes("higher") &&
              others(i).includes("lower") &&
              gap !== undefined &&
              gap < OPPOSITE_ENDS
            );
          })
          .sort((a, b) => balanceGap(a)! - balanceGap(b)! || byPrice(a, b))[0];

  const coverage =
    notCompared > 0
      ? `${notCompared} other ${notCompared === 1 ? "build" : "builds"} couldn't be compared. Each says why.`
      : undefined;
  const withCoverage = (reasons: string[]) => (coverage ? [...reasons, coverage] : reasons);

  const rankings = new Map<number, BuildRanking>();
  comparedIndexes.forEach((buildIndex, i) => {
    const outclassed = !onFrontier[i];
    if (i === highest) {
      const lowestPrice = indexes.every((j) => compared[i].price <= compared[j].price);
      rankings.set(buildIndex, {
        label: "Highest Verified Performance",
        outclassed,
        reasons: withCoverage([
          `Its processor and graphics card have the highest published figures of the ${compared.length} builds compared, with none lower.`,
          ...(lowestPrice ? ["It's also the lowest priced of them."] : []),
        ]),
      });
    } else if (i === value) {
      rankings.set(buildIndex, {
        label: "Best Value",
        outclassed,
        reasons: withCoverage([
          `The lowest price of the ${compared.length} builds compared, and nothing at this price or less has higher published figures.`,
          "Spending more buys higher published figures. How much difference that makes in use isn't measured here.",
        ]),
      });
    } else if (i === balanced) {
      rankings.set(buildIndex, {
        label: "Best Balanced",
        outclassed,
        reasons: withCoverage([
          "Its processor and graphics card sit at similar positions among the parts compared, and it falls between the other builds compared.",
          "This is relative to the parts on sale. It doesn't measure whether one part holds the other back.",
        ]),
      });
    } else {
      rankings.set(buildIndex, {
        label: INSUFFICIENT_INFORMATION,
        outclassed,
        reasons: [
          i === highestCandidate
            ? `Its published figures lead the builds compared, but ${untried} more ${untried === 1 ? "part" : "parts"} with confirmed figures weren't tried in this search, so it can't be called the highest.`
            : unrankedReason(i, relations, compared.length, outclassed),
        ],
      });
    }
  });

  return builds.map(
    (_, index) =>
      rankings.get(index) ?? {
        label: INSUFFICIENT_INFORMATION,
        outclassed: false,
        reasons: gaps[index],
      },
  );
}

function unrankedReason(
  index: number,
  relations: (PerformanceComparison | null)[][],
  comparedCount: number,
  outclassed: boolean,
): string {
  if (comparedCount < 2) {
    return "It's the only build with confirmed figures, so there's nothing to rank it against.";
  }
  const relation = relations[index].filter((r) => r !== null);
  if (outclassed) return "Another build at the same price or less has higher published figures.";
  if (relation.includes("incomparable")) {
    return "It can't be compared like for like with every other build, because the parts differ in architecture or have some figures higher and others lower.";
  }
  if (relation.every((r) => r === "no_clear_difference")) {
    return "Its published figures show no clear difference from the other builds.";
  }
  return "Its figures are confirmed, but they don't support any of the labels.";
}

/** Where a part's specifications came from, in words a customer can read. */
export function describeSpecSource(slot: ComparedSlot, part: RankablePart): string {
  const level = performanceEvidence(slot, part);
  if (level === "manufacturer_verified") return "Manufacturer's published figures, source on file";
  switch (part.verificationStatus) {
    case "manufacturer_verified":
    case "verified_manufacturer":
      return "On IT HUB's specification list, no performance figures on file";
    case "registry_unverified":
      return "On IT HUB's specification list, source not confirmed for every value";
    case "it_hub_reviewed":
      return "Reviewed by IT HUB, with a source on file";
    case "supplier_spec":
      return "Stated by the supplier, not checked";
    case "title_derived":
      return "Read from the product title, not checked";
    default:
      return "Not stated";
  }
}
