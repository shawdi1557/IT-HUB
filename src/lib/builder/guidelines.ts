// src/lib/builder/guidelines.ts
// IT HUB's own guidelines (Stage 3 contract §3, Q7): rows G1 to G7, approved by the owner on 14 November 2026 with
// the proposed values, **as advice only** (the owner's choice: "Advice shown only").
//
//   - Advisory: a guideline is shown with a build as "IT HUB recommends …" and whether the build meets it. It never
//     changes which builds are offered, their order, their price or their review standing.
//   - Never a compatibility requirement: nothing here writes `fieldSources`, `provenance`, `isVerified` or any
//     compatibility input, and the engine (recommendations.ts, compatibility.ts) doesn't read this module.
//   - Wording: "IT HUB recommends", never "requires", and never a manufacturer's or publisher's name.
//   - A publisher's figure (purpose.ts) is a separate thing and is unchanged.
//   - A size read only from a product title doesn't count as stated: the advice then says IT HUB will confirm it.
//
// Import-free, so the page and the tests share it.

export type GuidelinePurpose =
  | "gaming"
  | "creation"
  | "work"
  | "programming"
  | "professional"
  | "office"
  | "general"
  | "custom";

export interface ItHubGuideline {
  /** Stable, e.g. "G2". */
  id: string;
  /** The engine and the page read only "approved". */
  status: "draft" | "approved" | "retired";
  appliesTo: {
    purposes: readonly GuidelinePurpose[];
    resolutions?: readonly ("1080p" | "1440p" | "4K" | "unstated")[];
  };
  kind: "minimumMemoryGb" | "minimumStorageGb" | "priorityPart";
  /** A size in GB, a priority part, or "none" (no part leads). */
  value: number | "CPU" | "GPU" | "none";
  /** Shown with the value. */
  intendedWorkload: string;
  /** Why IT HUB recommends it. */
  rationale: string;
  approvedBy?: string;
  approvedOn?: string;
}

const APPROVED = {
  status: "approved" as const,
  approvedBy: "IT HUB owner",
  approvedOn: "2026-11-14",
};

export const IT_HUB_GUIDELINES: readonly ItHubGuideline[] = [
  {
    id: "G1",
    ...APPROVED,
    appliesTo: { purposes: ["office", "work", "general"] },
    kind: "minimumMemoryGb",
    value: 8,
    intendedWorkload: "office work and general use",
    rationale: "Enough for office software and browsing",
  },
  {
    id: "G2",
    ...APPROVED,
    appliesTo: { purposes: ["gaming"], resolutions: ["1080p", "unstated"] },
    kind: "minimumMemoryGb",
    value: 16,
    intendedWorkload: "gaming at 1080p",
    rationale: "Common baseline for current games",
  },
  {
    id: "G3",
    ...APPROVED,
    appliesTo: { purposes: ["gaming"], resolutions: ["1440p", "4K"] },
    kind: "minimumMemoryGb",
    value: 32,
    intendedWorkload: "gaming at 1440p or 4K",
    rationale: "Headroom at higher settings",
  },
  {
    id: "G4",
    ...APPROVED,
    appliesTo: { purposes: ["office", "work", "general"] },
    kind: "minimumStorageGb",
    value: 500,
    intendedWorkload: "office work and general use",
    rationale: "System, applications and documents",
  },
  {
    id: "G5",
    ...APPROVED,
    appliesTo: { purposes: ["gaming"] },
    kind: "minimumStorageGb",
    value: 1000,
    intendedWorkload: "gaming",
    rationale: "Modern games are large",
  },
  {
    id: "G6",
    ...APPROVED,
    appliesTo: { purposes: ["creation"] },
    kind: "minimumStorageGb",
    value: 1000,
    intendedWorkload: "content creation",
    rationale: "Project and cache files",
  },
  {
    id: "G7",
    ...APPROVED,
    appliesTo: { purposes: ["general"] },
    kind: "priorityPart",
    value: "none",
    intendedWorkload: "general use",
    rationale: "No part leads for mixed use",
  },
];

export interface GuidelineAdvice {
  guidelineId: string;
  /** "meets" and "below" compare stated sizes only; "not_stated" when the size isn't stated (or only in a title). */
  standing: "meets" | "below" | "not_stated";
  text: string;
}

/** A part as the builder holds it: its stated size and where that came from. */
type PartLike = {
  capacityGb?: number;
  specs?: { capacityGb?: number; fieldSources?: Record<string, string | undefined> } | null;
} | null;

const size = (gb: number) => (gb >= 1000 && gb % 1000 === 0 ? `${gb / 1000} TB` : `${gb} GB`);

/** A stated size, or undefined when the part doesn't state one (a size read from its title doesn't count). */
function statedCapacity(part: PartLike | undefined): number | undefined {
  const value = part?.specs?.capacityGb ?? part?.capacityGb;
  const source = part?.specs?.fieldSources?.capacityGb;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  if (source === "title_inferred" || source === "title_derived") return undefined;
  return value;
}

/** The approved guidelines that apply to a purpose, and to a gaming resolution when one is given. */
export function applicableGuidelines(
  purpose: string | undefined,
  details: Record<string, string | undefined> = {},
  rows: readonly ItHubGuideline[] = IT_HUB_GUIDELINES,
): ItHubGuideline[] {
  if (!purpose) return [];
  const resolution =
    details.resolution && details.resolution !== "Not sure" ? details.resolution : "unstated";
  return rows.filter(
    (g) =>
      g.status === "approved" &&
      (g.appliesTo.purposes as readonly string[]).includes(purpose) &&
      (!g.appliesTo.resolutions ||
        (g.appliesTo.resolutions as readonly string[]).includes(resolution)),
  );
}

/**
 * IT HUB's advice for a build's memory and storage, for the purpose it was found for. Parts the customer already
 * owns (absent from `parts`) get no advice. Changes nothing about the build.
 */
export function guidelineAdvice(
  purpose: string | undefined,
  details: Record<string, string | undefined>,
  parts: Partial<Record<string, PartLike>>,
  rows: readonly ItHubGuideline[] = IT_HUB_GUIDELINES,
): GuidelineAdvice[] {
  const advice: GuidelineAdvice[] = [];
  for (const g of applicableGuidelines(purpose, details, rows)) {
    if (g.kind === "priorityPart" || typeof g.value !== "number") continue;
    const slot = g.kind === "minimumMemoryGb" ? "RAM" : "Storage";
    const what = g.kind === "minimumMemoryGb" ? "memory" : "storage";
    if (!parts[slot]) continue;
    const stated = statedCapacity(parts[slot]);
    const lead = `IT HUB recommends at least ${size(g.value)} of ${what} for ${g.intendedWorkload}.`;
    if (stated === undefined) {
      advice.push({
        guidelineId: g.id,
        standing: "not_stated",
        text: `${lead} This build's ${what} size isn't stated, so IT HUB will confirm it.`,
      });
    } else {
      advice.push({
        guidelineId: g.id,
        standing: stated >= g.value ? "meets" : "below",
        text: `${lead} This build has ${size(stated)}.`,
      });
    }
  }
  return advice;
}
