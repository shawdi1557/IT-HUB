// src/lib/builder/completeness-wording.ts
// The customer's wording for a build's completeness state (Stage 4A-3), as the owner approved it on 8 November
// 2026 (D10, wording table W1 to W34). `assessBuild` decides; this module only says it, so Expert Mode and
// Find My PC say the same thing about the same build.

import { reportedItems } from "./compatibility";
import type { BuildAssessment, BuildState, SlotGap } from "./completeness";
import type { CompatibilitySummary, ComponentSlotId } from "./types";

export type StateTone = "red" | "gray" | "amber" | "green";

/** The Compatibility panel's badge for each state (W1 to W6). Advice never changes it (D3). */
export const STATE_BADGE: Record<BuildState, { label: string; tone: StateTone }> = {
  incompatible: { label: "Incompatible", tone: "red" },
  incomplete: { label: "Incomplete", tone: "gray" },
  needs_review: { label: "Needs IT HUB review", tone: "amber" },
  complete: { label: "Compatible", tone: "green" },
};

/** W14, W15. */
export const INCOMPATIBLE_MESSAGE =
  "Some selected components are incompatible. Change them before requesting a quotation or saving this build.";
/** W26 to W28. */
export const REVIEW_MESSAGE =
  "IT HUB will check this build before confirming your quotation. You can still request it.";
/** W6: under the Advice heading. */
export const ADVICE_NOTE = "This advice doesn't stop your quotation.";
/** W23: beside a part the customer owns. */
export const OWNED_PART_NOTE = "Not included in the estimate. IT HUB will check it fits.";
/** W21: in place of an unavailable part's price, which the total leaves out. */
export const NO_LONGER_AVAILABLE = "No longer available";
/** W31: no assembly charge is set, and IT HUB's assembly policy isn't confirmed. Never "Free". */
export const ASSEMBLY_NOT_SET = "Confirmed with your quotation";
/** W8: also in the graphics card picker, in place of removing the card, for a use that needs one. */
export const CARD_NEEDED_FOR_PURPOSE = "The use you chose needs a dedicated graphics card.";
/**
 * On a Find My PC card for a use that needs a graphics card, when the catalogue has none to offer: the card
 * says Incomplete with this, in place of what the recommendation says about the build. Owner, 9 November 2026.
 */
export const NO_CARD_AVAILABLE =
  "A dedicated graphics card is required, but none is currently available.";

/** What a Find My PC card shows about its build, beside what the recommendation says about it (Stage 4A-4). */
export interface CardStatus {
  /** The state badge, when the build can't be quoted as it stands: Incompatible or Incomplete. */
  badge?: { label: string; tone: StateTone };
  /** The use needs a graphics card and the build has none: NO_CARD_AVAILABLE in place of "Designed for". */
  noCardAvailable: boolean;
  /** "Specs Confirmed": only on a build the detail calls Compatible. */
  specsConfirmed: boolean;
  /** The "Needs IT HUB review" chip and REVIEW_MESSAGE. */
  review: boolean;
  /** The out-of-stock line. */
  outOfStock: boolean;
}

/**
 * A card's status, from the same assessment its build's detail makes on opening (same parts, owned parts and
 * purpose), so the card and the detail can't say different things. The recommendation's evidence only
 * decides the "Specs Confirmed" chip, and only on a build that is Compatible.
 */
export function cardStatus(
  assessment: BuildAssessment,
  evidence: { confidenceBadge?: string },
): CardStatus {
  const blocked = assessment.state === "incompatible" || assessment.state === "incomplete";
  return {
    ...(blocked ? { badge: STATE_BADGE[assessment.state] } : {}),
    noCardAvailable: assessment.gaps.some((gap) => gap.reason === "gpu_required_for_purpose"),
    specsConfirmed: assessment.state === "complete" && evidence.confidenceBadge === "certified",
    review: assessment.state === "needs_review",
    outOfStock: assessment.unavailableSlots.length > 0,
  };
}

/** W29: a part picker's option that IT HUB must check, named by the check. */
export function pickerReviewLabel(check: string): string {
  return `${STATE_BADGE.needs_review.label}: ${check}`;
}

const SLOT_LABELS: Partial<Record<ComponentSlotId, string>> = { Cooler: "CPU Cooler" };
/** A part's name in a list: "CPU Cooler" for the cooler, the slot's own name otherwise. */
export const slotLabel = (slot: ComponentSlotId) => SLOT_LABELS[slot] || slot;

/** The WhatsApp message (Stage 4A-5, the owner's approved wording, 9 November 2026): a request, with an estimate. */
export const WHATSAPP_HEADING = "*IT HUB PC BUILD — QUOTATION REQUEST*";
export const WHATSAPP_ESTIMATE_NOTE =
  "Estimate only. IT HUB will check this build before confirming your quotation.";
/** CPU, GPU, RAM and PSU stay in capitals in a sentence; "storage", "CPU cooler" don't. */
const inSentence = (slot: ComponentSlotId) =>
  slot === "Cooler" ? "CPU cooler" : /^[A-Z]{2,}$/.test(slot) ? slot : slot.toLowerCase();

/** Why a part is needed, or why nobody can yet say. An essential part needs no reason (W8 to W13). */
export function gapExplanation(gap: SlotGap): string | undefined {
  switch (gap.reason) {
    case "gpu_required_for_purpose":
      return CARD_NEEDED_FOR_PURPOSE;
    case "gpu_no_integrated_graphics":
      return "This processor has no built-in graphics, so it needs a graphics card.";
    case "cooler_not_included":
      return "This processor doesn't come with a cooler.";
    case "gpu_integrated_graphics_unknown":
      return "We couldn't confirm whether this processor has built-in graphics. Add a graphics card, or IT HUB will confirm whether you need one.";
    case "cooler_unknown":
      return "We couldn't confirm whether this processor comes with a cooler. Add a CPU cooler, or IT HUB will confirm whether you need one.";
    default:
      return undefined;
  }
}

export interface BlockerLine {
  kind: "incompatible" | "incomplete" | "unavailable";
  text: string;
  /** For "Still to choose": why each part with a reason is needed. */
  details?: string[];
}

/**
 * Everything stopping a quotation or a save, one line each, in the owner's order: Incompatible, then
 * Still to choose, then unavailable parts (W18). Empty when the build can be quoted.
 */
export function blockerLines(assessment: BuildAssessment): BlockerLine[] {
  const lines: BlockerLine[] = [];
  if (assessment.mismatches.length > 0) {
    lines.push({ kind: "incompatible", text: INCOMPATIBLE_MESSAGE });
  }
  const missing = assessment.gaps.filter((gap) => gap.need === "missing");
  if (missing.length > 0) {
    const details = missing.flatMap((gap) => {
      const why = gapExplanation(gap);
      return why ? [`${slotLabel(gap.slot)}: ${why}`] : [];
    });
    lines.push({
      kind: "incomplete",
      text: `Still to choose: ${missing.map((gap) => gap.slot).join(", ")}.`,
      ...(details.length ? { details } : {}),
    });
  }
  if (assessment.unavailableSlots.length > 0) {
    lines.push({
      kind: "unavailable",
      text: `Replace what's no longer available: ${assessment.unavailableSlots.join(", ")}.`,
    });
  }
  return lines;
}

/** The pop-up message when a blocked build's quotation is pressed: the same lines, in the same order. */
export function blockerMessage(assessment: BuildAssessment): string {
  return blockerLines(assessment)
    .map((line) => line.text)
    .join(" ");
}

/**
 * Why IT HUB has to check the build, beyond the compatibility checks already listed beside it: a part whose
 * need nobody can confirm (W11, W12), and each part the customer owns (W25). Each said once.
 */
export function reviewNotes(assessment: BuildAssessment): string[] {
  const notes: string[] = [];
  for (const reason of assessment.reviewReasons) {
    if (reason.kind === "unconfirmed_part") {
      const gap = assessment.gaps.find(
        (item) => item.slot === reason.slot && item.need === "unconfirmed",
      );
      const why = gap && gapExplanation(gap);
      if (why) notes.push(why);
    } else if (reason.kind === "owned_part") {
      notes.push(`You're using your own ${inSentence(reason.slot)}. IT HUB will check it fits.`);
    }
  }
  return [...new Set(notes)];
}

/**
 * Engine checks that only repeat a part still to choose, or one IT HUB will confirm, which the screen already
 * explains (W9 to W12, or W8 for a use that needs a card). The owner's closure decision 2, 9 November 2026.
 */
const REPEATED_BY_GAP: Record<string, ComponentSlotId> = {
  RULE_I_GPU_MANDATORY_NO_IGPU: "GPU", // W9
  RULE_I_DISPLAY_OUTPUT_UNKNOWN: "GPU", // W11
  RULE_C_COOLER_REQUIRED: "Cooler", // W10
  RULE_C_STOCK_COOLER_UNKNOWN: "Cooler", // W12
};

/** The rule IDs the screen leaves out for this build, because a gap's line already says the same. */
export function repeatedChecks(assessment: BuildAssessment): Set<string> {
  const gapSlots = new Set(assessment.gaps.map((gap) => gap.slot));
  return new Set(
    Object.entries(REPEATED_BY_GAP)
      .filter(([, slot]) => gapSlots.has(slot))
      .map(([ruleId]) => ruleId),
  );
}

/**
 * The checks a customer sees: `compatibility()`'s rows, less those a gap's line already explains. The rows
 * follow the engine's reported items one for one. The engine's summary, the assessment's review reasons and
 * the staff report keep every check.
 */
export function customerChecks<T>(
  rows: T[],
  summary: CompatibilitySummary,
  assessment: BuildAssessment,
): T[] {
  const items = reportedItems(summary.items);
  // If the rows ever stop matching the engine's items, show everything rather than hide the wrong one.
  if (items.length !== rows.length) return rows;
  const repeated = repeatedChecks(assessment);
  return rows.filter((_, index) => !repeated.has(items[index].ruleId));
}
