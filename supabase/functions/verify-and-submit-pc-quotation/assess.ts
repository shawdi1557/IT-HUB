// supabase/functions/verify-and-submit-pc-quotation/assess.ts
// Stage 4S-3: the server's own compatibility and completeness verdict on a quotation request. It runs the builder's
// unchanged engine (`checkCompatibility`) and completeness assessment (`assessBuild`, Stage 4A), from the generated
// copies, on the parts the server resolved itself (Stage 4S-2's `serverBuildComponents`). Nothing the browser sends
// about compatibility, completeness or specifications is read here, except to record what it claimed.
//
// The assessment is purpose-neutral, as Expert Mode is (4A decision D6): the request carries no purpose.

import { checkCompatibility } from "../_shared/builder/compatibility.ts";
import {
  assessBuild,
  type BuildAssessment,
  type BuildState,
  type ReviewReason,
} from "../_shared/builder/completeness.ts";
import { blockerMessage } from "../_shared/builder/completeness-wording.ts";
import type {
  CompatibilityItem,
  CompatibilityStatus,
  CompatibilitySummary,
} from "../_shared/builder/types.ts";
import { serverBuildComponents, type PartSpecResolution } from "./specs.ts";

/** A check as recorded for staff: its rule, the parts it concerns, and the engine's own label. */
export interface RecordedCheck {
  ruleId: string;
  slots: string[];
  label: string;
}

/**
 * What the server concluded about the build, stored as `pc_builds.compatibility.serverAssessment`, beside the
 * browser's report (the rest of `compatibility`). The server always writes this key last, so a browser can't
 * supply it.
 */
export interface ServerAssessmentRecord {
  assessedBy: "server";
  stage: "4S-3";
  /** `not_assessed`: a part's specifications couldn't be resolved, so no verdict is possible: review. */
  state: BuildState | "not_assessed";
  reason?: "specifications_unresolved";
  unresolvedSlots?: string[];
  /** The engine's overall status on the server-resolved parts. */
  compatibilityStatus?: CompatibilityStatus;
  mismatches: RecordedCheck[];
  gaps: { slot: string; need: "missing" | "unconfirmed"; reason: string }[];
  reviewReasons: ReviewReason[];
  /** The checks that send the build to review, with their labels. */
  reviewChecks: RecordedCheck[];
  /** Conditional results that never change the state (4A decision D3). */
  advice: RecordedCheck[];
  ownedSlots: string[];
  power?: { estimatedSystemLoadWatts: number; recommendedPsuWatts: number };
  /** What the browser claimed, kept only to show where it disagreed. Never used. */
  browserStatus: string | null;
  agreesWithBrowser: boolean | null;
}

export interface QuotationAssessment {
  record: ServerAssessmentRecord;
  /** Present when the build was assessed. */
  assessment?: BuildAssessment;
  summary?: CompatibilitySummary;
}

const recorded = (item: CompatibilityItem): RecordedCheck => ({
  ruleId: item.ruleId,
  slots: [...(item.affectedSlots || [])],
  label: item.label,
});

/**
 * The server's verdict. `resolutions` are the parts to buy as Stage 4S-2 resolved them; `ownedSlots` the slots the
 * customer marked as their own. If any part to buy is unresolved, the build isn't assessed: a missing part would
 * look like a gap, and a verdict on part of a build proves nothing either way.
 */
export function assessQuotation(
  resolutions: PartSpecResolution[],
  ownedSlots: string[],
  browserCompatibility: unknown,
): QuotationAssessment {
  const reported =
    browserCompatibility && typeof browserCompatibility === "object"
      ? (browserCompatibility as Record<string, unknown>).status
      : undefined;
  const browserStatus = typeof reported === "string" ? reported : null;
  const base = {
    assessedBy: "server" as const,
    stage: "4S-3" as const,
    ownedSlots: [...ownedSlots],
    browserStatus,
  };

  const unresolvedSlots = resolutions
    .filter((resolution) => !resolution.component || resolution.record.status === "unresolved")
    .map((resolution) => resolution.slot);
  if (resolutions.length === 0 || unresolvedSlots.length > 0) {
    return {
      record: {
        ...base,
        state: "not_assessed",
        reason: "specifications_unresolved",
        unresolvedSlots,
        mismatches: [],
        gaps: [],
        reviewReasons: [],
        reviewChecks: [],
        advice: [],
        agreesWithBrowser: null,
      },
    };
  }

  const components = serverBuildComponents(resolutions);
  // Exactly what the builder's screens do: the engine on the parts, then the assessment of its summary.
  const summary = checkCompatibility(components, { ownedSlots });
  const assessment = assessBuild(components, summary, { ownedSlots });
  const reviewRuleIds = new Set(
    assessment.reviewReasons.flatMap((reason) => (reason.kind === "check" ? [reason.ruleId] : [])),
  );
  return {
    record: {
      ...base,
      state: assessment.state,
      compatibilityStatus: summary.status,
      mismatches: assessment.mismatches.map(recorded),
      gaps: assessment.gaps.map(({ slot, need, reason }) => ({ slot, need, reason })),
      reviewReasons: assessment.reviewReasons,
      reviewChecks: summary.items
        .filter((item) => item.severity !== "error" && reviewRuleIds.has(item.ruleId))
        .map(recorded),
      advice: assessment.advice.map(recorded),
      power: {
        estimatedSystemLoadWatts: summary.estimatedSystemLoadWatts,
        recommendedPsuWatts: summary.recommendedPsuWatts,
      },
      agreesWithBrowser: browserStatus === null ? null : browserStatus === summary.status,
    },
    assessment,
    summary,
  };
}

/**
 * The refusal for a build the server found Incompatible or Incomplete. Its message is the builder's own pop-up for a
 * blocked build (`blockerMessage`, wording approved under D10: W14, W15, W18), so the customer reads the same words
 * the page would show. Null when the build can go ahead.
 */
export function assessmentRefusal(
  result: QuotationAssessment,
): { status: 422; payload: Record<string, unknown> } | null {
  const { assessment, record } = result;
  if (!assessment) return null;
  if (record.state !== "incompatible" && record.state !== "incomplete") return null;
  return {
    status: 422,
    payload: {
      error: blockerMessage(assessment),
      code: record.state === "incompatible" ? "incompatible_build" : "incomplete_build",
      ...(record.state === "incompatible"
        ? { mismatches: record.mismatches }
        : {
            missingSlots: assessment.gaps
              .filter((gap) => gap.need === "missing")
              .map((gap) => gap.slot),
          }),
    },
  };
}
