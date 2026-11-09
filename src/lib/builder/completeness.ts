// src/lib/builder/completeness.ts
// Whether a build is ready for a quotation, in one of four states (Stage 4A-1, the owner's decisions D1 to D9 of
// 8 November 2026). It reads the compatibility engine's summary and never repeats a compatibility rule: a
// Mismatch is the engine's error, a check waiting for a value is the engine's Unknown. The only rules owned here
// say which parts a build needs, from `ESSENTIAL_SLOTS` and the purpose's profile.
//
// It returns codes, not wording. The customer's wording is the owner's to approve (D10).

import { reachesReview } from "./compatibility";
import { isUnavailablePart } from "./pricing";
import { purposeProfile } from "./purpose";
import { COMPONENT_SLOTS, ESSENTIAL_SLOTS } from "./slots";
import type {
  CanonicalBuildComponent,
  CompatibilityItem,
  CompatibilitySummary,
  ComponentSlotId,
} from "./types";

/** Precedence, highest first: Incompatible, Incomplete, Needs Review, Complete (D1). */
export type BuildState = "incompatible" | "incomplete" | "needs_review" | "complete";

export const BUILD_STATE_PRECEDENCE: readonly BuildState[] = [
  "incompatible",
  "incomplete",
  "needs_review",
  "complete",
];

export type GapReason =
  /** One of the six parts every PC needs. */
  | "essential"
  /** The processor states it comes without a cooler. */
  | "cooler_not_included"
  /** Nobody has said whether the processor comes with a cooler. */
  | "cooler_unknown"
  /** The processor states it has no graphics of its own. */
  | "gpu_no_integrated_graphics"
  /** Nobody has said whether the processor has graphics of its own. */
  | "gpu_integrated_graphics_unknown"
  /** The build's purpose needs a dedicated graphics card, whatever the processor has (D2). */
  | "gpu_required_for_purpose";

export type CorrectiveAction =
  /** Choose a part for this slot. */
  | { kind: "choose"; slot: ComponentSlotId }
  /** Choose a part, or IT HUB confirms it isn't needed. */
  | { kind: "choose_or_it_hub_confirms"; slot: ComponentSlotId };

export interface SlotGap {
  slot: ComponentSlotId;
  /** `missing` must be chosen. `unconfirmed` may not be needed, and nobody can yet say (D4). */
  need: "missing" | "unconfirmed";
  reason: GapReason;
  action: CorrectiveAction;
}

export type ReviewReason =
  /** A part's need can't be established. */
  | { kind: "unconfirmed_part"; slot: ComponentSlotId }
  /** A compatibility check sends the build to IT HUB: an Unknown, or one of the engine's review rules. */
  | { kind: "check"; ruleId: string }
  /** The customer's own part. Nothing here can check it (D5). */
  | { kind: "owned_part"; slot: ComponentSlotId }
  /** The engine holds the build for review, with no check above saying why. Never read as Complete. */
  | { kind: "engine_review" };

export interface BuildAssessment {
  state: BuildState;
  /** Parts to choose or confirm, in slot order. */
  gaps: SlotGap[];
  /** The engine's Mismatches, as it states them. */
  mismatches: CompatibilityItem[];
  reviewReasons: ReviewReason[];
  /** Conditional results the customer can read, which never change the state (D3). */
  advice: CompatibilityItem[];
  /** Parts the customer owns, as the engine counts them: only slots with nothing chosen. */
  ownedSlots: ComponentSlotId[];
  unavailableSlots: ComponentSlotId[];
  /** Whether a quotation can be requested. A draft can be saved on the same terms (D7). */
  quotationReady: boolean;
  blockedBy?: "incompatible" | "incomplete" | "unavailable";
}

export interface AssessmentContext {
  /** Find My PC's purpose. Expert Mode and saved drafts have none, and are purpose-neutral (D6). */
  purpose?: string;
  details?: Record<string, string>;
  ownedSlots?: Iterable<string>;
}

/**
 * The parts `checkCompatibility` accepts as the customer's own: it checks an owned memory kit, drive or card for
 * review, and counts them as present. A part owned in any other slot still has to be chosen.
 */
const OWNABLE_SLOTS = new Set<ComponentSlotId>(["RAM", "Storage", "GPU"]);

/**
 * The engine's error for a processor without graphics and no card. It's a part still to choose, not a clash
 * between parts, so the page has never shown it as Incompatible.
 */
const MISSING_PART_RULES = new Set(["RULE_I_GPU_MANDATORY_NO_IGPU"]);

const GAP_ORDER: ComponentSlotId[] = [...ESSENTIAL_SLOTS, "GPU", "Cooler"];

export function assessBuild(
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  summary: CompatibilitySummary,
  context: AssessmentContext = {},
): BuildAssessment {
  // As the engine counts it: choosing a part for a slot means the customer isn't using their own there.
  const ownedSlots = [...new Set(context.ownedSlots || [])]
    .filter((slot) => !components[slot as ComponentSlotId])
    .map((slot) => slot as ComponentSlotId)
    .sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1));
  const ownedAndChecked = new Set(ownedSlots.filter((slot) => OWNABLE_SLOTS.has(slot)));
  const present = (slot: ComponentSlotId) => Boolean(components[slot]) || ownedAndChecked.has(slot);

  const gaps: SlotGap[] = [];
  const missing = (slot: ComponentSlotId, reason: GapReason) =>
    gaps.push({ slot, need: "missing", reason, action: { kind: "choose", slot } });
  const unconfirmed = (slot: ComponentSlotId, reason: GapReason) =>
    gaps.push({
      slot,
      need: "unconfirmed",
      reason,
      action: { kind: "choose_or_it_hub_confirms", slot },
    });

  for (const slot of ESSENTIAL_SLOTS) if (!present(slot)) missing(slot, "essential");

  const cpuSpecs = components.CPU?.specs || {};
  const needsCard = context.purpose
    ? purposeProfile(context.purpose, context.details || {}).requiresDedicatedGpu
    : false;
  if (!present("GPU")) {
    // A purpose that needs a card needs it even when the processor's own graphics are unknown (D2).
    if (needsCard) missing("GPU", "gpu_required_for_purpose");
    else if (components.CPU && cpuSpecs.hasIntegratedGraphics === false) {
      missing("GPU", "gpu_no_integrated_graphics");
    } else if (components.CPU && cpuSpecs.hasIntegratedGraphics === undefined) {
      unconfirmed("GPU", "gpu_integrated_graphics_unknown");
    }
  }
  if (components.CPU && !components.Cooler) {
    if (cpuSpecs.includesCooler === false) missing("Cooler", "cooler_not_included");
    else if (cpuSpecs.includesCooler === undefined) unconfirmed("Cooler", "cooler_unknown");
  }
  gaps.sort((a, b) => GAP_ORDER.indexOf(a.slot) - GAP_ORDER.indexOf(b.slot));

  const mismatches = summary.items.filter(
    (item) => item.severity === "error" && !MISSING_PART_RULES.has(item.ruleId),
  );

  const reviewReasons: ReviewReason[] = [];
  for (const gap of gaps) {
    if (gap.need === "unconfirmed")
      reviewReasons.push({ kind: "unconfirmed_part", slot: gap.slot });
  }
  for (const item of summary.items) {
    if (item.severity !== "error" && reachesReview(item)) {
      reviewReasons.push({ kind: "check", ruleId: item.ruleId });
    }
  }
  for (const slot of ownedSlots) reviewReasons.push({ kind: "owned_part", slot });
  if (reviewReasons.length === 0 && (summary.hasBlockingUnknowns || summary.status === "unknown")) {
    reviewReasons.push({ kind: "engine_review" });
  }

  const advice = summary.items.filter(
    (item) => item.status === "conditional" && item.severity !== "error" && !reachesReview(item),
  );

  const state: BuildState =
    mismatches.length > 0
      ? "incompatible"
      : gaps.some((gap) => gap.need === "missing")
        ? "incomplete"
        : reviewReasons.length > 0
          ? "needs_review"
          : "complete";

  const unavailableSlots = (Object.keys(components) as ComponentSlotId[])
    .filter((slot) => isUnavailablePart(components[slot]))
    .sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1));

  const blockedBy =
    state === "incompatible" || state === "incomplete"
      ? state
      : unavailableSlots.length > 0
        ? "unavailable"
        : undefined;

  return {
    state,
    gaps,
    mismatches,
    reviewReasons,
    advice,
    ownedSlots,
    unavailableSlots,
    quotationReady: blockedBy === undefined,
    ...(blockedBy ? { blockedBy } : {}),
  };
}

/** The builder's slot order, so the result never depends on the order parts were chosen in. */
const SLOT_ORDER = COMPONENT_SLOTS.map((slot) => slot.id as string);
function order(slot: string) {
  const index = SLOT_ORDER.indexOf(slot);
  return index === -1 ? SLOT_ORDER.length : index;
}
