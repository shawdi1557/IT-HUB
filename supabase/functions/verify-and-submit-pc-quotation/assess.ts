// supabase/functions/verify-and-submit-pc-quotation/assess.ts
// Stage 4S-3: the server's own compatibility and completeness verdict on a quotation request. It runs the builder's
// unchanged engine (`checkCompatibility`) and completeness assessment (`assessBuild`, Stage 4A), from the generated
// copies, on the parts the server resolved itself (Stage 4S-2's `serverBuildComponents`). Nothing the browser sends
// about compatibility, completeness or specifications is read here, except to record where it disagreed.
//
// Purpose (decision S3-B): a request may name the Find My PC use the build was found for, from the server's own list
// (`QUOTE_PURPOSES`). What that use requires comes from the builder's `purposeProfile`, exactly as the page applies
// it. No purpose means Expert Mode, which is purpose-neutral (4A decision D6).

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
import type { QuotePurpose } from "./structure.ts";

/** A check as recorded for staff: its rule, the parts it concerns, and the engine's own label. */
export interface RecordedCheck {
  ruleId: string;
  slots: string[];
  label: string;
}

/** The engine's overall statuses. Anything else a browser sends is recorded as `unrecognised`. */
const STATUSES: readonly CompatibilityStatus[] = [
  "compatible",
  "conditional",
  "unknown",
  "incompatible",
];
/** A rule identifier as the engine writes them. Nothing else from the browser is kept. */
const RULE_ID = /^RULE_[A-Z0-9_]{1,60}$/;
const MAX_RULES = 20;

/**
 * Decision S3-A: where the browser's own result disagrees with the server's, for diagnosis only. It never changes
 * the decision, never sends a quotation to review on its own, and holds no customer information: only the engine's
 * statuses, two flags and rule identifiers.
 */
export interface BrowserComparison {
  /** False when there was nothing to compare: no verdict, or no recognisable claim from the browser. */
  compared: boolean;
  /** Null when not compared. */
  agrees: boolean | null;
  differences: {
    field: "status" | "valid" | "complete";
    browser: string | boolean;
    server: string | boolean;
  }[];
  /** Blocking rules found by the server but not reported by the browser, and the reverse. */
  errorRules: { onlyServer: string[]; onlyBrowser: string[] };
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
  /** The Find My PC use the build was judged for, or null for Expert Mode (purpose-neutral). */
  purpose: QuotePurpose | null;
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
  /** The browser's claimed status, if it was one the engine uses; `unrecognised` otherwise. Never used. */
  browserStatus: CompatibilityStatus | "unrecognised" | null;
  /** `browserComparison.agrees`. */
  agreesWithBrowser: boolean | null;
  browserComparison: BrowserComparison;
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

interface BrowserClaim {
  status?: CompatibilityStatus | "unrecognised";
  valid?: boolean;
  complete?: boolean;
  /** Blocking rules the browser listed, if it sent a list. */
  errorRules?: string[];
}

/** What the browser claimed, reduced to values the engine itself produces. */
function readClaim(browserCompatibility: unknown): BrowserClaim {
  if (!browserCompatibility || typeof browserCompatibility !== "object") return {};
  const raw = browserCompatibility as Record<string, unknown>;
  const claim: BrowserClaim = {};
  if (typeof raw.status === "string") {
    claim.status = (STATUSES as readonly string[]).includes(raw.status)
      ? (raw.status as CompatibilityStatus)
      : "unrecognised";
  }
  if (typeof raw.valid === "boolean") claim.valid = raw.valid;
  if (typeof raw.complete === "boolean") claim.complete = raw.complete;
  if (Array.isArray(raw.items)) {
    const rules = raw.items
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && (item as any).severity === "error",
      )
      .map((item) => item.ruleId)
      .filter((ruleId): ruleId is string => typeof ruleId === "string" && RULE_ID.test(ruleId));
    claim.errorRules = [...new Set(rules)].slice(0, MAX_RULES);
  }
  return claim;
}

/** Compares the browser's claim with the server's summary. Diagnosis only. */
export function compareWithBrowser(
  browserCompatibility: unknown,
  summary: CompatibilitySummary | undefined,
): BrowserComparison {
  const claim = readClaim(browserCompatibility);
  const empty: BrowserComparison = {
    compared: false,
    agrees: null,
    differences: [],
    errorRules: { onlyServer: [], onlyBrowser: [] },
  };
  const claimed =
    claim.status !== undefined ||
    claim.valid !== undefined ||
    claim.complete !== undefined ||
    claim.errorRules !== undefined;
  if (!summary || !claimed) return empty;

  const differences: BrowserComparison["differences"] = [];
  if (claim.status !== undefined && claim.status !== summary.status) {
    differences.push({ field: "status", browser: claim.status, server: summary.status });
  }
  if (claim.valid !== undefined && claim.valid !== summary.valid) {
    differences.push({ field: "valid", browser: claim.valid, server: summary.valid });
  }
  if (claim.complete !== undefined && claim.complete !== summary.complete) {
    differences.push({ field: "complete", browser: claim.complete, server: summary.complete });
  }
  const errorRules = { onlyServer: [] as string[], onlyBrowser: [] as string[] };
  if (claim.errorRules !== undefined) {
    const server = [
      ...new Set(
        summary.items.filter((item) => item.severity === "error").map((item) => item.ruleId),
      ),
    ];
    errorRules.onlyServer = server.filter((rule) => !claim.errorRules!.includes(rule));
    errorRules.onlyBrowser = claim.errorRules.filter((rule) => !server.includes(rule));
  }
  return {
    compared: true,
    agrees:
      differences.length === 0 &&
      errorRules.onlyServer.length === 0 &&
      errorRules.onlyBrowser.length === 0,
    differences,
    errorRules,
  };
}

/**
 * The server's verdict. `resolutions` are the parts to buy as Stage 4S-2 resolved them; `ownedSlots` the slots the
 * customer marked as their own; `purpose` the request's validated Find My PC use, if any. If any part to buy is
 * unresolved, the build isn't assessed: a missing part would look like a gap, and a verdict on part of a build
 * proves nothing either way.
 */
export function assessQuotation(
  resolutions: PartSpecResolution[],
  ownedSlots: string[],
  browserCompatibility: unknown,
  purpose?: QuotePurpose,
): QuotationAssessment {
  const base = {
    assessedBy: "server" as const,
    stage: "4S-3" as const,
    purpose: purpose ?? null,
    ownedSlots: [...ownedSlots],
    browserStatus: readClaim(browserCompatibility).status ?? null,
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
        browserComparison: compareWithBrowser(browserCompatibility, undefined),
      },
    };
  }

  const components = serverBuildComponents(resolutions);
  // Exactly what the builder's screens do: the engine on the parts, then the assessment of its summary, with the
  // use the build was found for, as the page passes it (Builder.tsx `assessParts`).
  const summary = checkCompatibility(components, { ownedSlots });
  const assessment = assessBuild(components, summary, {
    ownedSlots,
    ...(purpose ? { purpose } : {}),
  });
  const reviewRuleIds = new Set(
    assessment.reviewReasons.flatMap((reason) => (reason.kind === "check" ? [reason.ruleId] : [])),
  );
  const browserComparison = compareWithBrowser(browserCompatibility, summary);
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
      agreesWithBrowser: browserComparison.agrees,
      browserComparison,
    },
    assessment,
    summary,
  };
}

/**
 * Decision S3-A: a log line for a disagreement, so one can be seen even when the request is refused and nothing is
 * stored. It names no customer, account, build or product: only the verdict, the browser's claim and rule
 * identifiers. Null when there's nothing to report.
 */
export function disagreementLog(record: ServerAssessmentRecord): Record<string, unknown> | null {
  if (record.browserComparison.agrees !== false) return null;
  return {
    event: "pc_quotation_browser_disagreement",
    stage: record.stage,
    serverState: record.state,
    serverStatus: record.compatibilityStatus ?? null,
    purpose: record.purpose,
    differences: record.browserComparison.differences,
    errorRules: record.browserComparison.errorRules,
  };
}

/**
 * The refusal for a build the server found Incompatible or Incomplete. Its message is the builder's own pop-up for a
 * blocked build (`blockerMessage`, wording approved under D10: W8, W14, W15, W18), so the customer reads the same
 * words the page would show. Null when the build can go ahead.
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
