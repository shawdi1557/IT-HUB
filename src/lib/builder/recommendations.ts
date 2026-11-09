// src/lib/builder/recommendations.ts
// IT HUB Deterministic Guided PC Recommendation Engine
// Dynamically generates valid, fully compatible hardware configurations exclusively from available catalog products.
// Preserves authoritative Shopify prices, variant IDs, and inventory across Find My PC and Expert Mode.

import type {
  CanonicalBuild,
  CanonicalBuildComponent,
  CompatibilityItem,
  ComponentSlotId,
  GuaranteeReason,
  GuidedAnswers,
  OfferRole,
  PublishedPerformanceFigures,
  RecommendationCandidate,
} from "./types";
import {
  calculateSystemPower,
  checkCompatibility,
  hasRejectedSpecs,
  isConfirmedLevel,
  labelCompatibilityGaps,
  reachesReview,
  reportedItems,
  specConfidence,
  toCanonicalComponent,
  type CheckCompatibilityOptions,
} from "./compatibility";
import { assessFit, purposeProfile } from "./purpose";
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

/** Text order that doesn't depend on the locale, so the same strings always sort the same way. */
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Cheapest first, then by product ID, so the order Shopify lists products in can't change a result. */
const byPriceThenId = <T extends { price: number; id: string }>(a: T, b: T) =>
  a.price - b.price || compareText(a.id, b.id);

/**
 * A build's identity: each part as slot and variant (or product), sorted, then the customer's own slots. Equal
 * builds give equal keys. It breaks every final tie, and a build's ID is made from it.
 */
export function buildIdentityKey(
  parts: Partial<
    Record<string, { id?: string; productId?: string; variantId?: string } | undefined>
  >,
  ownedSlots: Iterable<string> = [],
): string {
  const pieces = Object.entries(parts)
    .filter(([, part]) => part)
    .map(([slot, part]) => `${slot}:${part!.variantId || part!.id || part!.productId}`)
    .sort(compareText);
  return `${pieces.join("|")}|owned:${[...ownedSlots].sort(compareText).join(",")}`;
}

/**
 * A short, deterministic hash: two independent 32-bit mixes, 64 bits in all, as 16 hexadecimal digits. The same
 * text always gives the same value, in every browser and run. It identifies builds; it isn't for security.
 */
export function stableHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/** The same configuration for the same purpose always gets the same ID. Saved IDs are never regenerated. */
export function recommendationId(
  prefix: "build" | "closest",
  parts: Parameters<typeof buildIdentityKey>[0],
  ownedSlots: Iterable<string>,
  purpose: string,
): string {
  return `${prefix}-${stableHash(`${buildIdentityKey(parts, ownedSlots)}|purpose:${purpose}`)}`;
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

// ── Offer roles (Stage 3 contract, sections 2.2 and 11) ─────────────────────────
// Pure functions of the builds they're given, so each rule can be tested on its own. No scores, no weights.

/** A build the roles choose between: its total price and its parts. */
interface RoleCandidate {
  price: number;
  parts: Partial<Record<string, any>>;
}

/** The processor and graphics card, by product ID. No card is a value too. */
export function pairOf(build: RoleCandidate): string {
  return `${build.parts.CPU?.id ?? "none"}|${build.parts.GPU?.id ?? "none"}`;
}

/** The arithmetic median of prices sorted ascending: the middle one, or the mean of the two middle ones. */
export function medianPrice(sortedPrices: number[]): number {
  const middle = Math.floor(sortedPrices.length / 2);
  return sortedPrices.length % 2 === 1
    ? sortedPrices[middle]
    : (sortedPrices[middle - 1] + sortedPrices[middle]) / 2;
}

/**
 * Balanced Choice's pick from a pool sorted by price, then stable key: the build priced nearest the median.
 * Equally near, the lower price wins, then the stable key, which is the first nearest in that order.
 */
export function nearestToMedian<T extends { price: number }>(sortedPool: T[]): T | undefined {
  if (sortedPool.length === 0) return undefined;
  const median = medianPrice(sortedPool.map((build) => build.price));
  let pick = sortedPool[0];
  for (const build of sortedPool) {
    if (Math.abs(build.price - median) < Math.abs(pick.price - median)) pick = build;
  }
  return pick;
}

/**
 * Performance Priority's pick. Published figures decide only when every candidate's priority part has
 * manufacturer-sourced figures, every two different parts compare, and one part is higher than every other.
 * Otherwise the price of the priority part decides. Ties: the lower total price, then the stable key. With
 * fewer than two candidates, or every candidate spending the same on the part, nothing can be compared.
 */
export function performancePriorityPick<T extends RoleCandidate>(
  candidates: T[],
  slot: ComparedSlot,
  keyOf: (build: T) => string,
): { build: T; basis: "figures" | "price" } | undefined {
  if (candidates.length < 2) return undefined;
  const partOf = (build: T) => build.parts[slot];
  const tie = (a: T, b: T) => a.price - b.price || compareText(keyOf(a), keyOf(b));
  const distinctParts = candidates
    .map(partOf)
    .filter(
      (part, index, all) => part && all.findIndex((other) => other?.id === part.id) === index,
    );
  const figuresDecide =
    distinctParts.length > 1 &&
    candidates.every(
      (build) =>
        partOf(build) && performanceEvidence(slot, partOf(build)) === "manufacturer_verified",
    ) &&
    distinctParts.every((part) =>
      distinctParts.every((other) => {
        if (other.id === part.id) return true;
        const result = comparePartPerformance(slot, part, other);
        return result !== "incomparable" && result !== "insufficient";
      }),
    );
  const leaders = figuresDecide
    ? distinctParts.filter((part) =>
        distinctParts.every(
          (other) => other.id === part.id || comparePartPerformance(slot, part, other) === "higher",
        ),
      )
    : [];
  if (leaders.length === 1) {
    const build = candidates.filter((c) => partOf(c)?.id === leaders[0].id).sort(tie)[0];
    return { build, basis: "figures" };
  }
  const partPrice = (build: T) => partOf(build)?.price ?? 0;
  const top = Math.max(...candidates.map(partPrice));
  if (candidates.every((build) => partPrice(build) === top)) return undefined;
  return { build: candidates.filter((c) => partPrice(c) === top).sort(tie)[0], basis: "price" };
}

export interface OfferRoleOptions<T> {
  /** Builds already shown, by evidence label or Stage 2 guarantee. The roles' picks are added to it. */
  shown: T[];
  /** Eligible builds with the fewest shortfalls against what the customer asked for. */
  suitable: T[];
  /** The bottom of the customer's range. */
  minBudget: number;
  ownedSlots: Iterable<string>;
  isConfirmed: (build: T) => boolean;
  priority?: ComparedSlot;
  priorityAsked?: string;
  max?: number;
  /** How the Value Choice build fares against what the customer stated, which its reason must not overstate. */
  fitOf?: (build: T) => FitOutcome;
  /**
   * "range" when every build is within the customer's range. "budget" when only the maximum applies, because
   * the customer owns parts, so a reason never says "within your range" of a build below it.
   */
  scope?: "range" | "budget";
}

/**
 * How a build fares against the checks of what the customer stated: no checks, all met, at least one short,
 * or none short but at least one that can't be checked.
 */
export type FitOutcome = "none" | "meets" | "short" | "unchecked";

export function fitOutcome(checks: { status: string }[]): FitOutcome {
  if (checks.length === 0) return "none";
  if (checks.some((check) => check.status === "below")) return "short";
  if (checks.some((check) => check.status !== "meets")) return "unchecked";
  return "meets";
}

/** The Value Choice's reason. It says the build suits the request only when nothing stated is unmet or unchecked. */
export function valueReason(fit: FitOutcome): string {
  if (fit === "short") return VALUE_REASON_SHORT;
  if (fit === "unchecked") return VALUE_REASON_UNCHECKED;
  return VALUE_REASON;
}

/**
 * Fills the places left after the evidence labels and Stage 2 guarantees, in the contract's order (section
 * 11.2): Value Choice, Performance Priority, Balanced Choice, then Another Option. No role takes a pair
 * already shown, and fewer than `max` builds means no further suitable build with a distinct pair qualifies.
 */
export function fillOfferRoles<T extends RoleCandidate>(
  options: OfferRoleOptions<T>,
): { shown: T[]; roles: Map<T, { role: OfferRole; reason: string }>; valuePick?: T } {
  const { shown, suitable, minBudget, isConfirmed, priority, priorityAsked } = options;
  const max = options.max ?? MAX_RECOMMENDATIONS;
  const owned = [...options.ownedSlots];
  const roles = new Map<T, { role: OfferRole; reason: string }>();
  const stableKey = (build: T) => buildIdentityKey(build.parts, owned);
  const byPriceThenKey = (a: T, b: T) =>
    a.price - b.price || compareText(stableKey(a), stableKey(b));
  const placeLeft = () => shown.length < max;
  const notYetShown = (build: T) =>
    !shown.includes(build) && !shown.some((other) => pairOf(other) === pairOf(build));
  const inRange = (build: T) => build.price >= minBudget;
  // Only the maximum applies when the customer owns parts, so the range isn't claimed of those builds.
  const inScope = (reason: string) =>
    options.scope === "budget" ? reason.replace("within your range", "within your budget") : reason;
  const offer = (build: T, role: OfferRole, reason: string) => {
    if (!shown.includes(build)) shown.push(build);
    roles.set(build, { role, reason: inScope(reason) });
  };

  // Value Choice: the lowest-priced suitable build. Under the strict range it is within the range. Already shown by a
  // guarantee, it takes the role there (ruling P2-3). One whose pair another shown build has is passed over.
  const valueOrder = suitable
    .slice()
    .sort(
      (a, b) =>
        a.price - b.price ||
        Number(!isConfirmed(a)) - Number(!isConfirmed(b)) ||
        compareText(stableKey(a), stableKey(b)),
    );
  let valuePick: T | undefined;
  for (const build of valueOrder) {
    if (shown.includes(build)) {
      valuePick = build;
      break;
    }
    if (!notYetShown(build)) continue;
    if (placeLeft()) valuePick = build;
    break;
  }
  if (valuePick)
    offer(valuePick, "Value Choice", valueReason(options.fitOf?.(valuePick) ?? "none"));

  // Performance Priority: only where the customer's use names a priority part. Guidelines aren't used (Q7).
  if (priority && placeLeft()) {
    const picked = performancePriorityPick(suitable.filter(notYetShown), priority, stableKey);
    if (picked) {
      const partName = priority === "GPU" ? "graphics card" : "processor";
      const asked = `You asked for ${priorityAsked}, which leans on the ${partName}.`;
      offer(
        picked.build,
        "Performance Priority",
        picked.basis === "figures"
          ? `${asked} Its ${partName} has the highest published figures of the builds compared.`
          : `${asked} It spends the most on the ${partName}. That's price, not measured performance.`,
      );
    }
  }

  // Balanced Choice: suitable, in the range, and a pair not already shown (ruling P2-2).
  if (placeLeft()) {
    const pool = suitable
      .filter((build) => inRange(build) && notYetShown(build))
      .sort(byPriceThenKey);
    const pick = nearestToMedian(pool);
    if (pick) {
      offer(
        pick,
        "Balanced Choice",
        pool.length === 1
          ? BALANCED_ONLY_REASON
          : `Priced nearest the middle of the ${pool.length} suitable builds within your range.`,
      );
    }
  }

  // Another Option (ruling P2-1): the highest-priced suitable build in the range whose pair isn't shown.
  while (placeLeft()) {
    const pool = suitable
      .filter((build) => inRange(build) && notYetShown(build))
      .sort((a, b) => b.price - a.price || compareText(stableKey(a), stableKey(b)));
    if (pool.length === 0) break;
    offer(pool[0], "Another Option", ANOTHER_OPTION_REASON);
  }
  return { shown, roles, valuePick };
}

const VALUE_REASON = "The lowest-priced build here that suits what you asked for.";
const VALUE_REASON_SHORT =
  "The lowest-priced of the builds here that come closest to what you asked for.";
const VALUE_REASON_UNCHECKED =
  "The lowest-priced build here for what you asked for, though some of what you stated can't be checked on it.";
const BALANCED_ONLY_REASON =
  "The only other suitable build within your range with a different processor and graphics card.";
const ANOTHER_OPTION_REASON = "Another suitable build within your range, at a higher price.";

/** Advice the customer can read, as opposed to anything IT HUB has to check. */
function advisoriesOf(items: CompatibilityItem[]): SynthesizedConfiguration["advisories"] {
  return reportedItems(items)
    .filter((i) => i.status === "conditional" && !reachesReview(i))
    .map((i) => ({
      label: i.label,
      explanation: [i.explanation, i.suggestedResolution].filter(Boolean).join(" "),
    }));
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
  /**
   * How well the evidence says this build's power supply is enough: 2 when a wattage with a recorded
   * source or a review meets the need, 1 when a value that's only stated, listed without a source, or
   * read from a title does, and 0 otherwise.
   */
  psuEvidence: number;
  /** Why this build is on offer when no evidence label put it there. Set only on builds shown. */
  offerRole?: OfferRole;
  /** The one chip the card shows: the evidence label, otherwise the role, otherwise the Stage 2 reason. */
  chip?: string;
  /** The Stage 2 guarantee that put this build on offer, if one did. */
  guarantee?: GuaranteeReason;
}

const DIFFERENCE_SLOTS: [ComponentSlotId, string][] = [
  ["Motherboard", "Motherboard"],
  ["RAM", "Memory"],
  ["Storage", "Storage"],
  ["PSU", "Power supply"],
  ["Cabinet", "Cabinet"],
  ["Cooler", "Cooler"],
];

/**
 * Two builds on offer can share a processor, graphics card and memory, and differ only in parts the
 * summary doesn't list, so each says what sets it apart from the other.
 */
function differenceNotes(
  build: SynthesizedConfiguration,
  shown: SynthesizedConfiguration[],
  sameParts: (config: SynthesizedConfiguration) => string,
): string[] {
  return shown
    .filter((other) => other !== build && sameParts(other) === sameParts(build))
    .map((other) => {
      const differences = DIFFERENCE_SLOTS.filter(
        ([slot]) => build.parts[slot]?.id !== other.parts[slot]?.id,
      ).map(
        ([slot, name]) =>
          `${name}: ${build.parts[slot]?.name ?? "none"} rather than ${other.parts[slot]?.name ?? "none"}`,
      );
      return `Differs from the ₹${other.price.toLocaleString("en-IN")} build in: ${differences.join("; ")}.`;
    });
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
    /** The bottom of the customer's range. Builds at or above it are in the range. */
    minBudget?: number;
    /**
     * Whether a build below `minBudget` is left out (the owner's strict range, 7 November 2026). A customer
     * who owns parts pays nothing for them, so for them only the maximum applies.
     */
    enforceMinimum?: boolean;
    ownedSlots: Set<string>;
    preferredBrands?: string[];
    requireWifi?: boolean;
    /** What the customer told us about their use. */
    details?: Record<string, string>;
    /** Also offer builds whose compatibility can't be confirmed. They're always marked for review. */
    allowUnverified?: boolean;
    /**
     * When nothing is within the range, also return what the same search offers with no minimum, from the
     * builds already found, so the lowest price can be stated without searching again (Phase 3).
     */
    alsoWithoutMinimum?: boolean;
    /**
     * Leave out a processor and card whose cheapest possible build is above the maximum. It never changes
     * what is offered; it's switched off only by the tests that prove so.
     */
    pricePruning?: boolean;
  },
): {
  recommendations: SynthesizedConfiguration[];
  allValidCandidates: SynthesizedConfiguration[];
  /** Why the offer is smaller than it would be without the strict range, in the customer's words. */
  notices?: string[];
  /** With `alsoWithoutMinimum`, and nothing within the range: what the search offers with no minimum. */
  withoutMinimum?: SynthesizedConfiguration[];
} {
  const {
    purpose,
    maxBudget,
    minBudget = 0,
    enforceMinimum = true,
    ownedSlots,
    preferredBrands = [],
    requireWifi = false,
    details = {},
    allowUnverified = false,
    alsoWithoutMinimum = false,
    pricePruning = true,
  } = options;
  // Every build offered is within the customer's range: never above the maximum, and never below the
  // minimum, unless they own parts, which cost them nothing here (the owner's ruling, 7 November 2026).
  const rangeFloor = enforceMinimum && ownedSlots.size === 0 ? minBudget : 0;

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
  // The wording that depends on the whole build, filled in for the builds that survive the comparison.
  const wordingReaders = new Map<
    SynthesizedConfiguration,
    () => Pick<SynthesizedConfiguration, "labelGaps" | "advisories">
  >();
  // Builds whose card was tried only to reach the range. With no minimum they'd never have been looked for.
  const toReachRangeBuilds = new Set<SynthesizedConfiguration>();

  // Filter CPUs: prefer in-stock & live products. A part whose specifications IT HUB has rejected is
  // never recommended, though a customer can still choose it in the manual builder, where it's marked.
  for (const slot of Object.keys(itemsBySlot) as ComponentSlotId[]) {
    itemsBySlot[slot] = (itemsBySlot[slot] || [])
      .filter((c) => c.availability !== "unavailable" && !hasRejectedSpecs(c.raw?.specs))
      // Every later choice reads parts in this order, so ties never depend on how Shopify listed them.
      .sort(byPriceThenId);
  }
  const cpus = itemsBySlot.CPU || [];
  if (cpus.length === 0) return { recommendations: [], allValidCandidates: [] };

  // A part dearer than the whole budget can't be in a build within it.
  const affordable = <T extends { price: number }>(items: T[]) =>
    maxBudget ? items.filter((item) => item.price <= maxBudget) : items;
  // What a slot adds to a build at the least and at the most. A part the customer owns adds nothing.
  const cheapestIn = (slot: ComponentSlotId) =>
    ownedSlots.has(slot) ? 0 : (itemsBySlot[slot]?.[0]?.price ?? 0);
  const dearestIn = (slot: ComponentSlotId) =>
    ownedSlots.has(slot) ? 0 : (itemsBySlot[slot]?.[itemsBySlot[slot].length - 1]?.price ?? 0);
  const ownPrice = (slot: ComponentSlotId, item?: NormalizedItem) =>
    item && !ownedSlots.has(slot) ? item.price : 0;
  const withinRange = (price: number) => price >= rangeFloor && (!maxBudget || price <= maxBudget);

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
  // The cheapest part with nothing of its own to review is always tried, so that a confirmed build isn't
  // missed because the price spread passed over the only part that could confirm it.
  const ownValuesClean = new Map<string, boolean>();
  const hasCleanOwnValues = (slot: ComponentSlotId, item: NormalizedItem) => {
    const known = ownValuesClean.get(item.id);
    if (known !== undefined) return known;
    const clean = !checkCompatibility(
      { [slot]: toEnginePart(slot, item) },
      { withoutMissingInputs: true },
    ).items.some(
      (check) => reachesReview(check) && check.affectedSlots.every((affected) => affected === slot),
    );
    ownValuesClean.set(item.id, clean);
    return clean;
  };
  const cheapestClean = (slot: ComponentSlotId, items: NormalizedItem[]) => {
    const found = items
      .slice()
      .sort((a, b) => a.price - b.price)
      .find((item) => hasCleanOwnValues(slot, item));
    return found ? [found] : [];
  };
  const triedCpus = uniqueById([
    ...preferredCpus,
    ...otherCpus,
    ...cheapestClean("CPU", affordable(cpus)),
  ]);

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
  const triedGpus = uniqueById([
    ...sampleForSearch("GPU", affordable(distinctGpus), SEARCH_LIMIT.GPU),
    ...cheapestClean("GPU", affordable(distinctGpus)),
  ]);
  const untriedCheckedParts =
    countUntriedCheckedParts("CPU", affordable(cpus), triedCpus) +
    (ownedSlots.has("GPU")
      ? 0
      : countUntriedCheckedParts("GPU", affordable(distinctGpus), triedGpus));

  // Each branch is searched more than once, and the builds it yields are compared further down.
  // "confirmed" takes, in every slot, the cheapest part that adds nothing needing review, and keeps its
  // build only if nothing at all needs review, so a cheaper unknown part can't hide a confirmable build.
  // Its power supply needs a wattage with evidence behind it: a recorded source or a review, and not
  // only a place on the specification list or a figure in a title.
  // The others take the cheapest part that fits, whatever its confidence, and the build says what isn't
  // confirmed. They differ only in the power supply: one known to be enough, or one with no stated
  // wattage, which can't be assumed adequate.
  const confirmedWattages = new Map<string, boolean>();
  // Nothing needs review, and any power supply it includes has evidence that its wattage is enough.
  const isConfirmed = (build: SynthesizedConfiguration) =>
    !build.requiresReview && (!build.parts.PSU || build.psuEvidence === 2);
  const hasConfirmedWattage = (item: NormalizedItem) => {
    const known = confirmedWattages.get(item.id);
    if (known !== undefined) return known;
    const confirmed =
      Boolean(item.ratedWattage) &&
      isConfirmedLevel(specConfidence(toEnginePart("PSU", item), "ratedWattage"));
    confirmedWattages.set(item.id, confirmed);
    return confirmed;
  };
  const powerSupplies = itemsBySlot.PSU || [];
  const searchOrders = [
    "confirmed",
    "adequate",
    ...(allowUnverified && powerSupplies.some((item) => !item.ratedWattage) ? ["unstated"] : []),
  ];

  const storageFound = new Map<string, NormalizedItem | undefined>();

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
      ...cheapestClean("Motherboard", affordable(allMobos)),
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
        : uniqueById([
            allRams[0],
            ...spreadByPrice(affordable(allRams), SEARCH_LIMIT.RAM),
            ...cheapestClean("RAM", affordable(allRams)),
          ]);

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

        // The rest of a build costs at least the cheapest drive, cabinet and power supply, and a cooler
        // where one is needed, so a processor and card whose cheapest build is above the maximum are left
        // out. Every build that search would find is above the maximum, so nothing offered changes.
        const restAtLeast =
          ownPrice("CPU", cpu) +
          ownPrice("Motherboard", mobo) +
          ownPrice("RAM", ram) +
          cheapestIn("Storage") +
          cheapestIn("Cabinet") +
          cheapestIn("PSU") +
          (cpu.includesCooler ? 0 : cheapestIn("Cooler"));
        const restAtMost =
          ownPrice("CPU", cpu) +
          ownPrice("Motherboard", mobo) +
          ownPrice("RAM", ram) +
          dearestIn("Storage") +
          dearestIn("Cabinet") +
          dearestIn("PSU") +
          (cpu.includesCooler ? 0 : dearestIn("Cooler"));
        const searchesFor = (gpu?: NormalizedItem) =>
          pricePruning && maxBudget && restAtLeast + ownPrice("GPU", gpu) > maxBudget
            ? []
            : searchOrders;
        // A processor with its own graphics, for a use that needs no card, tries only the cheapest card.
        // Where none of those builds is within the customer's range, it also tries the other sampled cards
        // that could put a build within it (Phase 3, approved by the owner on 7 November 2026). A card is
        // never added where the range is already met without one, and never when there's no minimum.
        const branchStart = candidatePool.length;
        const otherCards =
          rangeFloor > 0 &&
          !ownedSlots.has("GPU") &&
          !profile.requiresDedicatedGpu &&
          cpu.hasIntegratedGraphics
            ? triedGpus.filter(
                (gpu) => gpu !== distinctGpus[0] && restAtMost + gpu.price >= rangeFloor,
              )
            : [];
        const cardsToReachRange = () =>
          otherCards.length === 0 ||
          candidatePool.slice(branchStart).some((build) => withinRange(build.price))
            ? []
            : otherCards;

        // Once no part fits a branch, the other searches that take any part that fits can't do better.
        const nothingFits = new Set<NormalizedItem | undefined>();
        for (const toReachRange of [false, true])
          for (const gpu of toReachRange ? cardsToReachRange() : gpuBranches)
            for (const searchOrder of searchesFor(gpu)) {
              // Each remaining slot takes the first option that fits the parts already chosen, so one
              // unsuitable cheap product can't rule a build out while a suitable one is on sale.
              const chosen: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {
                CPU: toEnginePart("CPU", cpu),
                Motherboard: toEnginePart("Motherboard", mobo),
              };
              if (ram) chosen.RAM = toEnginePart("RAM", ram);
              if (gpu) chosen.GPU = toEnginePart("GPU", gpu);
              const seekingConfirmed = searchOrder === "confirmed";
              if (!seekingConfirmed && nothingFits.has(gpu)) continue;
              const noPartFits = () => {
                if (!seekingConfirmed) nothingFits.add(gpu);
              };
              // Something already chosen needs review, so no choice below can make this build confirmed.
              if (
                seekingConfirmed &&
                checkCompatibility(chosen, { ownedSlots, withoutMissingInputs: true }).items.some(
                  (check) =>
                    reachesReview(check) &&
                    check.affectedSlots.every((affected) => chosen[affected] !== undefined),
                )
              ) {
                continue;
              }
              const fits = (slot: ComponentSlotId, item: NormalizedItem) =>
                !checkCompatibility(
                  { ...chosen, [slot]: toEnginePart(slot, item) },
                  { ownedSlots, withoutMissingInputs: true },
                ).items.some(
                  (check) =>
                    check.affectedSlots.includes(slot) &&
                    (check.severity === "error" || (seekingConfirmed && reachesReview(check))),
                );

              // Parts whose own values need review are set aside first, so a catalogue of mostly unknown
              // parts doesn't mean checking each of them on every branch.
              const usable = (slot: ComponentSlotId, options: NormalizedItem[]) =>
                seekingConfirmed
                  ? options.filter((option) => hasCleanOwnValues(slot, option))
                  : options;

              // 6. Storage
              // A drive's fit depends only on the motherboard, so it's found once for each.
              const storageKey = `${mobo.id}|${seekingConfirmed}`;
              if (!storageFound.has(storageKey)) {
                storageFound.set(
                  storageKey,
                  usable("Storage", storageOptions).find((option) => fits("Storage", option)),
                );
              }
              const storage = storageFound.get(storageKey);
              if (!storage && !ownedSlots.has("Storage")) {
                noPartFits();
                continue;
              }
              if (storage && ownedSlots.has("Storage")) {
                // Already owned, so nothing is added to the build.
              } else if (storage) {
                chosen.Storage = toEnginePart("Storage", storage);
              }

              // 7. Cabinet and cooler. A processor that comes with a cooler doesn't have another added.
              const allCoolers = (itemsBySlot.Cooler || [])
                .slice()
                .sort((a, b) => a.price - b.price);
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
                  ? usable("Cooler", allCoolers).find((option) => fits("Cooler", option))
                  : undefined;
                if (needsCooler && allCoolers.length > 0 && !cooler) {
                  noPartFits();
                  continue;
                }
              } else {
                let placed = false;
                for (const option of usable("Cabinet", allCabinets)) {
                  if (!fits("Cabinet", option)) continue;
                  chosen.Cabinet = toEnginePart("Cabinet", option);
                  const fittingCooler = needsCooler
                    ? usable("Cooler", allCoolers).find((candidate) => fits("Cooler", candidate))
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
                if (!placed) {
                  noPartFits();
                  continue;
                }
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
              const psuOrder = seekingConfirmed
                ? [...matchingPsus, ...otherPsus].filter(hasConfirmedWattage)
                : searchOrder === "unstated"
                  ? [...unstatedPsus, ...matchingPsus, ...otherPsus]
                  : [...matchingPsus, ...otherPsus, ...unstatedPsus];
              const psu = ownedSlots.has("PSU")
                ? undefined
                : usable("PSU", psuOrder).find((option) => fits("PSU", option));
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
              const compatOptions: CheckCompatibilityOptions = {
                workload: isGaming
                  ? "gaming"
                  : isCreation
                    ? "creation"
                    : isWork
                      ? "work"
                      : "general",
                mode: "automated",
                ownedSlots,
              };
              const compatSummary = checkCompatibility(canonicalPartsForCompat, {
                ...compatOptions,
                withoutMissingInputs: true,
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
              const advisories = advisoriesOf(compatSummary.items);
              const requiresReview = !compatSummary.validForAutomatedRecommendation;
              // This search exists only to find a build nothing has to be checked on.
              if (seekingConfirmed && requiresReview) continue;

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
              const coreVerified = [cpu, mobo, ram, psu, gpu].filter(Boolean).every(
                (p: any) =>
                  p.isVerified ||
                  // Its values are stated but unsourced, which "Some specifications unconfirmed" says.
                  p.verificationStatus === "registry_unverified" ||
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
                // Filled in below for the builds that survive the comparison, which are few.
                labelGaps: [],
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
                psuEvidence:
                  !psu?.ratedWattage || psu.ratedWattage < recWatts
                    ? 0
                    : hasConfirmedWattage(psu)
                      ? 2
                      : 1,
              });
              if (toReachRange) toReachRangeBuilds.add(candidatePool[candidatePool.length - 1]);
              wordingReaders.set(candidatePool[candidatePool.length - 1], () => {
                const { items } = checkCompatibility(canonicalPartsForCompat, compatOptions);
                return {
                  labelGaps: labelCompatibilityGaps(canonicalPartsForCompat, items, { ownedSlots }),
                  advisories: advisoriesOf(items),
                };
              });
            }
      }
    }
  }

  // The offer is chosen from the builds found. It's chosen again with no minimum, from the same builds,
  // when nothing is within the range, so the lowest price found can be stated without a second search.
  const selectOffer = (floor: number, pool: SynthesizedConfiguration[]) => {
    // ── Near-Duplicate Deduplication ──────────────────────────────────────────
    // Near-duplicate key: CPU_Model + GPU_Model + RAM_Capacity, and whether the build reaches the range.
    // Builds within the range are compared only with each other, so a cheaper version below the minimum
    // can't push out the one that's in the range (Phase 3, 7 November 2026). The builds below it are still
    // compared with each other, for the notices that say what the range leaves out.
    const reachOf = (config: SynthesizedConfiguration) => (config.price >= floor ? "in" : "below");
    const groupMap = new Map<string, SynthesizedConfiguration>();
    for (const c of pool) {
      const cpuName = c.parts.CPU?.name.replace(/^\[TEST\]\s*/i, "").trim() || "";
      const gpuName = c.parts.GPU?.name.replace(/^\[TEST\]\s*/i, "").trim() || "iGPU";
      const ramCap = memoryGb(c.parts.RAM) ?? "unstated";
      // A build that needs review stays separate from one that doesn't, so the customer sees both a
      // cheaper option IT HUB must check and a dearer one that needs no checking. So does one whose power
      // supply has no evidence behind its wattage, even if nothing sends it to review.
      const standing = c.requiresReview ? "review" : isConfirmed(c) ? "confirmed" : "unsourced";
      const key = `${cpuName}|${gpuName}|${ramCap}|${standing}|${reachOf(c)}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, c);
      } else {
        const existing = groupMap.get(key)!;
        // The same processor, graphics card and memory: keep what fits the budget, then the requested
        // Wi-Fi, then a power supply known to be enough, then the lower price. An unknown power supply
        // would otherwise win on price alone, and the price shown would rest on a part that may not work.
        // IT HUB checks these builds anyway, so a cheaper supply of adequate stated wattage stays: the
        // build with evidence for its wattage is offered beside it, as the confirmed one.
        const hasWifi = (config: SynthesizedConfiguration) =>
          Boolean(config.parts.Motherboard?.hasWifi);
        const inBudget = (config: SynthesizedConfiguration) =>
          !maxBudget || config.price <= maxBudget;
        const knownEnough = (config: SynthesizedConfiguration) => config.psuEvidence > 0;
        let better = c.price < existing.price;
        if (inBudget(c) !== inBudget(existing)) better = inBudget(c);
        else if (requireWifi && hasWifi(c) !== hasWifi(existing)) better = hasWifi(c);
        else if (knownEnough(c) !== knownEnough(existing)) better = knownEnough(c);
        if (better) groupMap.set(key, c);
      }
    }
    for (const survivor of groupMap.values())
      Object.assign(survivor, wordingReaders.get(survivor)!());

    // A build needing review adds nothing if the same parts cost no more without needing it, on the same
    // side of the minimum: a confirmed version below the range can't stand in for one within it.
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
              reachOf(other) === reachOf(config) &&
              other.price <= config.price,
          ),
      )
      .sort((a, b) => a.price - b.price);

    // ── Strict Budget Range ───────────────────────────────────────────────────
    // `floor` is `rangeFloor`, except when the offer is chosen again with no minimum.
    const underCeiling = maxBudget
      ? allDistinctCandidates.filter((c) => c.price <= maxBudget)
      : allDistinctCandidates;
    const withinBudget = underCeiling.filter((c) => c.price >= floor);
    const belowFloor = underCeiling.filter((c) => c.price < floor);

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
      shortfallCount: shortfalls[index],
      fit: fitOutcome(fitChecks[index]),
      purposeNotes: fitChecks[index].map((check) => check.note),
    }));

    // Places are filled in the contract's order (Stage 3 contract, section 11.2): evidence labels, the Stage 2
    // guarantees, then Value Choice, Performance Priority, Balanced Choice and Another Option. Nothing else is
    // added, and no build a build at the same price or less verifiably beats is ever offered.
    type Ranked = (typeof ranked)[number];
    const eligible = ranked.filter((build) => !build.outclassed);
    const meeting = eligible.filter((build) => !build.fallsShort);
    // Suitable: eligible, with the fewest shortfalls against what the customer asked for among eligible builds.
    const fewestEligibleShortfalls = Math.min(...eligible.map((build) => build.shortfallCount));
    const suitable = eligible.filter((build) => build.shortfallCount === fewestEligibleShortfalls);
    const shown = ranked.filter((build) => build.label !== INSUFFICIENT_INFORMATION);
    const guaranteeReason = new Map<Ranked, GuaranteeReason>();
    // A developer may not need a graphics card, so a build without one is never crowded out of the offer.
    const noCardPick =
      purpose === "programming" && !ownedSlots.has("GPU")
        ? (meeting.length > 0 ? meeting : eligible).find((build) => !build.parts.GPU)
        : undefined;
    if (noCardPick && !shown.includes(noCardPick) && shown.length < MAX_RECOMMENDATIONS) {
      shown.push(noCardPick);
      guaranteeReason.set(noCardPick, "No graphics card");
    }
    // A build nothing has to be checked on is never crowded out by builds that need review.
    const confirmedPick = [...meeting, ...eligible].find(isConfirmed);
    if (confirmedPick && !shown.some(isConfirmed) && shown.length < MAX_RECOMMENDATIONS) {
      shown.push(confirmedPick);
      guaranteeReason.set(
        confirmedPick,
        confirmedPick.confidenceBadge === "certified"
          ? "Confirmed specifications"
          : "No review needed",
      );
    }
    // The customer can choose between that build and a cheaper version of it that IT HUB has to check.
    const shownConfirmed = shown.find(isConfirmed);
    const cheaperForReview =
      shownConfirmed &&
      eligible.find(
        (build) =>
          !isConfirmed(build) &&
          sameParts(build) === sameParts(shownConfirmed) &&
          build.price < shownConfirmed.price,
      );
    if (
      cheaperForReview &&
      !shown.includes(cheaperForReview) &&
      shown.length < MAX_RECOMMENDATIONS
    ) {
      shown.push(cheaperForReview);
      guaranteeReason.set(
        cheaperForReview,
        cheaperForReview.requiresReview ? "Review required" : "Some specifications unconfirmed",
      );
    }

    const { roles } = fillOfferRoles({
      shown,
      suitable,
      minBudget: floor,
      ownedSlots,
      isConfirmed,
      priority: profile.priority,
      priorityAsked: profile.priorityAsked,
      max: MAX_RECOMMENDATIONS,
      fitOf: (build) => build.fit,
      scope: floor < minBudget ? "budget" : "range",
    });

    // A Stage 2 guarantee the range leaves out is said to be missing, never filled from below the range.
    const notices: string[] = [];
    if (
      purpose === "programming" &&
      !ownedSlots.has("GPU") &&
      !withinBudget.some((build) => !build.parts.GPU) &&
      belowFloor.some((build) => !build.parts.GPU)
    ) {
      notices.push("No build without a graphics card falls within your range.");
    }
    if (!withinBudget.some(isConfirmed) && belowFloor.some(isConfirmed)) {
      notices.push(
        "No build within your range is confirmed: each needs IT HUB's review, or its power supply's wattage isn't confirmed.",
      );
    }
    if (
      shownConfirmed &&
      !cheaperForReview &&
      belowFloor.some(
        (build) =>
          !isConfirmed(build) &&
          sameParts(build) === sameParts(shownConfirmed) &&
          build.price < shownConfirmed.price,
      )
    ) {
      notices.push(
        "A cheaper version of the confirmed build, which IT HUB would have to check, costs less than your range, so it isn't shown.",
      );
    }

    const resolutionNote = profile.requestedResolution
      ? `You asked for ${profile.requestedResolution}. Frame rates aren't measured here, so please ask IT HUB to confirm it for your games.`
      : undefined;

    const toRecommendation = (build: (typeof ranked)[number]): SynthesizedConfiguration => {
      const {
        outclassed: _outclassed,
        fallsShort: _fallsShort,
        shortfallCount: _shortfallCount,
        fit: _fit,
        ...config
      } = build;
      const role = roles.get(build)?.role;
      const reason = roles.get(build)?.reason;
      return {
        ...config,
        offerRole: role,
        guarantee: guaranteeReason.get(build),
        chip:
          build.label !== INSUFFICIENT_INFORMATION
            ? build.label
            : (role ?? guaranteeReason.get(build) ?? build.label),
        purposeNotes: [
          ...(resolutionNote ? [resolutionNote] : []),
          ...(reason ? [reason] : []),
          ...differenceNotes(build, shown, sameParts),
          ...config.purposeNotes,
        ],
      };
    };

    return {
      recommendations: shown
        .map(toRecommendation)
        .sort(
          (a, b) =>
            a.price - b.price ||
            compareText(
              buildIdentityKey(a.parts, ownedSlots),
              buildIdentityKey(b.parts, ownedSlots),
            ),
        ),
      allValidCandidates: allDistinctCandidates,
      notices,
    };
  };

  const offer: ReturnType<typeof selectOffer> & { withoutMinimum?: SynthesizedConfiguration[] } =
    selectOffer(rangeFloor, candidatePool);
  if (alsoWithoutMinimum && rangeFloor > 0 && offer.recommendations.length === 0) {
    // The cards tried only to reach the range wouldn't be tried with no minimum, so they're left out.
    offer.withoutMinimum = selectOffer(
      0,
      candidatePool.filter((build) => !toReachRangeBuilds.has(build)),
    ).recommendations;
  }
  return offer;
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
type OfferAnswers = Parameters<typeof generateCatalogOffer>[1];

/** The builds Find My PC offers. `generateCatalogOffer` also says why the offer is smaller than three. */
export function generateDynamicCatalogRecommendations(
  catalog: Record<string, any[]>,
  answers: OfferAnswers,
  budgetOrTemplates?: any,
  options: { allowUnverified?: boolean } = {},
): any[] {
  return generateCatalogOffer(catalog, answers, budgetOrTemplates, options).builds;
}

/** What Find My PC shows: the builds, and the notices that explain an offer of fewer than three. */
export interface CatalogOffer {
  builds: any[];
  /** Plain statements for the customer, such as how many builds were found within the range. */
  notices: string[];
  /**
   * When no build is within the range but suitable builds cost less, the lowest of their prices. Those builds
   * are never offered (the owner's strict range, 7 November 2026). Only the price is said.
   */
  cheaperFrom?: number;
}

const OWNED_WORDS: Record<string, string> = {
  CPU: "processor",
  Motherboard: "motherboard",
  RAM: "memory",
  GPU: "graphics card",
  Storage: "storage",
  PSU: "power supply",
  Cabinet: "cabinet",
  Cooler: "cooler",
  CaseFans: "case fans",
  Monitor: "monitor",
};
const SLOT_ORDER = Object.keys(OWNED_WORDS);

/** "the storage", "the memory and storage", "the processor, memory and storage". */
function ownedPhrase(owned: Iterable<string>): string {
  const words = [...owned]
    .sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b))
    .map((slot) => OWNED_WORDS[slot] ?? slot);
  if (words.length <= 1) return `the ${words[0] ?? "parts"}`;
  return `the ${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function generateCatalogOffer(
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
  options: {
    allowUnverified?: boolean;
    /** Only the tests that prove the price pruning changes nothing switch it off. */
    pricePruning?: boolean;
  } = {},
): CatalogOffer {
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
  if (missing.length > 0) return { builds: [], notices: [] };

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

  const strict = owned.size === 0;
  // One search. When nothing is within the range, it also says what it would offer with no minimum.
  const {
    recommendations,
    notices = [],
    withoutMinimum,
  } = synthesizeBuildConfigurations(itemsBySlot, {
    purpose: answers.purpose,
    maxBudget,
    minBudget,
    enforceMinimum: true,
    ownedSlots: owned,
    preferredBrands: answers.brands,
    requireWifi: answers.wifi === "Yes",
    details: answers.details,
    allowUnverified: options.allowUnverified,
    alsoWithoutMinimum: strict && minBudget > 0,
    pricePruning: options.pricePruning,
  });
  const where = strict ? "within your range" : "within your budget";
  const offerNotices = [...notices];
  if (recommendations.length === 1)
    offerNotices.unshift(`Only one suitable build was found ${where}.`);
  if (recommendations.length === 2)
    offerNotices.unshift(`Only two suitable builds were found ${where}.`);
  // Nothing within the range: the customer is told what the builds found cost, and none is offered.
  let cheaperFrom: number | undefined;
  if (recommendations.length === 0 && strict && minBudget > 0) {
    const cheaper = withoutMinimum ?? [];
    if (cheaper.length > 0) cheaperFrom = Math.min(...cheaper.map((config) => config.price));
  }

  const builds = recommendations.map((config) => {
    const parts: Record<string, any> = {};
    for (const [slot, normItem] of Object.entries(config.parts)) {
      if (normItem) {
        parts[slot] = normItem.raw;
      }
    }

    const inBudget = config.price >= minBudget && config.price <= maxBudget;
    // Below the range only when the customer owns parts, which cost them nothing here.
    let note: string | undefined;
    if (config.price < minBudget) {
      note =
        owned.size > 0
          ? `It costs less than your range because you already own ${ownedPhrase(owned)}.`
          : "This costs less than the range you selected.";
    }

    return {
      templateId: recommendationId("build", config.parts, owned, answers.purpose),
      name: config.title,
      // The card's one chip. The evidence label stays in tradeoffLabel, as before.
      tradeoff: config.chip ?? config.label,
      tradeoffLabel: config.label,
      offerRole: config.offerRole,
      guarantee: config.guarantee,
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
  return { builds, notices: builds.length > 0 ? offerNotices : [], cheaperFrom };
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
  const sorted = allValidCandidates
    .slice()
    .sort(
      (a, b) =>
        a.price - b.price ||
        compareText(buildIdentityKey(a.parts, owned), buildIdentityKey(b.parts, owned)),
    );
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
    templateId: recommendationId("closest", closest.parts, owned, answers.purpose),
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
