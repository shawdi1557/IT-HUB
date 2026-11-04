// src/lib/builder/purpose.ts
// Turns what a customer says about their use into rules a build can be checked against. A requirement
// is a figure the software's publisher states, with the source named. No scores, weights or frame rates.

import { comparePartPerformance, performanceEvidence, type ComparedSlot } from "./ranking";
import type { PublishedPerformanceFigures } from "./types";

export interface PublishedRequirement {
  software: string;
  memoryGb: number;
  /** Only where the publisher recommends a figure. */
  graphicsMemoryGb?: number;
  cores?: number;
  sourceUrl: string;
  checkedOn: string;
}

const BLENDER: PublishedRequirement = {
  software: "Blender",
  memoryGb: 32,
  graphicsMemoryGb: 8,
  cores: 8,
  sourceUrl: "https://www.blender.org/download/requirements/",
  checkedOn: "2026-11-03",
};
const PREMIERE: PublishedRequirement = {
  // Adobe recommends 16GB for HD media and 32GB or more for 4K.
  software: "Adobe Premiere",
  memoryGb: 16,
  sourceUrl:
    "https://helpx.adobe.com/premiere/desktop/get-started/technical-requirements/adobe-premiere-pro-technical-requirements.html",
  checkedOn: "2026-11-03",
};
const AFTER_EFFECTS: PublishedRequirement = {
  software: "Adobe After Effects",
  memoryGb: 32,
  graphicsMemoryGb: 8,
  sourceUrl:
    "https://helpx.adobe.com/after-effects/desktop/get-started/technical-requirements/system-requirements.html",
  checkedOn: "2026-11-03",
};
const PHOTOSHOP: PublishedRequirement = {
  software: "Adobe Photoshop",
  memoryGb: 16,
  graphicsMemoryGb: 2,
  sourceUrl:
    "https://helpx.adobe.com/photoshop/desktop/get-started/technical-requirements-installation/adobe-photoshop-on-desktop-technical-requirements.html",
  checkedOn: "2026-11-03",
};
const AUTOCAD: PublishedRequirement = {
  software: "AutoCAD",
  memoryGb: 32,
  graphicsMemoryGb: 8,
  sourceUrl:
    "https://help.autodesk.com/view/ACD/2026/ENU/?caas=caas%2Fsfdcarticles%2Fsfdcarticles%2FSystem-requirements-for-AutoCAD-2026-including-Specialized-Toolsets.html",
  checkedOn: "2026-11-03",
};
const VISUAL_STUDIO: PublishedRequirement = {
  software: "Visual Studio",
  memoryGb: 16,
  sourceUrl: "https://learn.microsoft.com/en-us/visualstudio/releases/2022/system-requirements",
  checkedOn: "2026-11-03",
};

/**
 * The customer picks a kind of work, not a program, so each kind names a common program and says so on
 * the build. Kinds with no single representative publisher figure, such as streaming or data and AI,
 * have no requirement rather than an invented one.
 */
const REQUIREMENT_FOR_WORK: Record<string, PublishedRequirement> = {
  Video: PREMIERE,
  "Motion Graphics": AFTER_EFFECTS,
  "3D": BLENDER,
  Photography: PHOTOSHOP,
  Programming: VISUAL_STUDIO,
  "Software Development": VISUAL_STUDIO,
  Architecture: AUTOCAD,
  CAD: AUTOCAD,
  Engineering: AUTOCAD,
};

const GRAPHICS_FIRST = "graphics card";
const PROCESSOR_FIRST = "processor";

export interface PurposeProfile {
  requiresDedicatedGpu: boolean;
  /** The part this use leans on. It settles only what the published figures can't. */
  priority?: ComparedSlot;
  priorityAsked?: string;
  requirement?: PublishedRequirement;
  requestedResolution?: string;
  requireWifi: boolean;
}

const stated = (value?: string) => (value && value !== "Not sure" ? value : undefined);

export function purposeProfile(
  purpose: string,
  details: Record<string, string> = {},
  requireWifi = false,
): PurposeProfile {
  const kind = stated(details.type);
  const resolution = stated(details.resolution);
  const profile: PurposeProfile = {
    requiresDedicatedGpu:
      purpose === "gaming" ||
      purpose === "creation" ||
      (purpose === "professional" && kind !== "Software Development"),
    requirement: kind
      ? REQUIREMENT_FOR_WORK[kind]
      : purpose === "programming"
        ? REQUIREMENT_FOR_WORK["Software Development"]
        : undefined,
    requestedResolution: purpose === "gaming" ? resolution : undefined,
    requireWifi,
  };
  if (purpose === "gaming") {
    // More pixels per frame lean on the graphics card, and a chosen resolution outranks the game type.
    // Competitive play at 1080p leans more on the processor. This sets a direction, never an amount.
    if (resolution === "1440p" || resolution === "4K") {
      profile.priority = "GPU";
      profile.priorityAsked = resolution;
    } else if (kind === "AAA Games") {
      profile.priority = "GPU";
      profile.priorityAsked = "AAA games";
    } else if (kind === "Competitive / Esports") {
      profile.priority = "CPU";
      profile.priorityAsked = "competitive games";
    }
  } else if (purpose === "creation" && kind === "3D") {
    profile.priority = "GPU";
    profile.priorityAsked = "3D work";
  }
  return profile;
}

export type FitStatus = "meets" | "below" | "unknown";

export interface FitCheck {
  status: FitStatus;
  note: string;
}

export interface FitPart {
  name: string;
  price: number;
  id: string;
  capacityGb?: number;
  hasWifi?: boolean;
  /** Stated to have no Wi-Fi, which is different from nobody saying. */
  wifiStatedAbsent?: boolean;
  performance?: PublishedPerformanceFigures;
  verificationStatus?: string;
}

export interface FitBuild {
  parts: Partial<Record<"CPU" | "GPU" | "RAM" | "Motherboard", FitPart>>;
}

function checkFigure(
  actual: number | undefined,
  wanted: number,
  what: string,
  software: string,
  unit = "",
): FitCheck {
  if (actual === undefined) {
    return {
      status: "unknown",
      note: `${what} isn't confirmed, so it can't be checked against ${software}'s recommended ${wanted}${unit}.`,
    };
  }
  const figures = `${actual}${unit}, ${actual >= wanted ? "meeting" : "below"} ${software}'s recommended ${wanted}${unit}.`;
  return { status: actual >= wanted ? "meets" : "below", note: `${what}: ${figures}` };
}

/** Checks a build against what the customer asked for. Silence is unknown, never a failure. */
export function assessFit(
  build: FitBuild,
  profile: PurposeProfile,
  ownedSlots: Set<string>,
): FitCheck[] {
  const checks: FitCheck[] = [];
  const requirement = profile.requirement;
  if (requirement) {
    const { software } = requirement;
    // An owned kit isn't in the build, so its size reads as unknown.
    checks.push(
      checkFigure(build.parts.RAM?.capacityGb, requirement.memoryGb, "Memory", software, "GB"),
    );
    if (requirement.graphicsMemoryGb !== undefined) {
      const gpu = build.parts.GPU;
      if (!gpu && !ownedSlots.has("GPU")) {
        checks.push({
          status: "below",
          note: `No dedicated graphics card, and ${software} recommends ${requirement.graphicsMemoryGb}GB of graphics memory.`,
        });
      } else {
        checks.push(
          checkFigure(
            gpu?.performance?.figures?.vramGb,
            requirement.graphicsMemoryGb,
            "Graphics memory",
            software,
            "GB",
          ),
        );
      }
    }
    if (requirement.cores !== undefined) {
      checks.push(
        checkFigure(
          build.parts.CPU?.performance?.figures?.totalCores,
          requirement.cores,
          "Processor cores",
          software,
        ),
      );
    }
  }
  if (profile.requireWifi) {
    const board = build.parts.Motherboard;
    if (board?.hasWifi) {
      checks.push({ status: "meets", note: "Has the Wi-Fi you asked for." });
    } else if (board?.wifiStatedAbsent) {
      checks.push({ status: "below", note: "This motherboard has no Wi-Fi, which you asked for." });
    } else {
      checks.push({ status: "unknown", note: "Wi-Fi isn't confirmed on this motherboard." });
    }
  }
  return checks;
}

/**
 * Whether build `a` suits the customer's priority better than `b`. Published figures decide first. Where
 * they can't, the price of that part decides, and the note on the build says it's only price.
 */
export function prefersForPriority<T extends FitBuild & { price: number }>(
  a: T,
  b: T,
  slot: ComparedSlot,
): boolean {
  const partA = a.parts[slot];
  const partB = b.parts[slot];
  if (partA && !partB) return true;
  if (!partA || !partB) return false;
  if (partA.id === partB.id) return a.price < b.price;
  const result = comparePartPerformance(slot, partA, partB);
  if (result === "higher") return true;
  if (result === "lower") return false;
  if (partA.price !== partB.price) return partA.price > partB.price;
  return a.price < b.price;
}

/** Why this build was picked for the customer's priority, in words that don't overclaim. */
export function priorityNote(
  build: FitBuild,
  others: FitBuild[],
  profile: PurposeProfile,
): string | undefined {
  const slot = profile.priority;
  if (!slot) return undefined;
  const part = build.parts[slot];
  if (!part) return undefined;
  const differing = others
    .map((other) => other.parts[slot])
    .filter((otherPart) => otherPart && otherPart.id !== part.id) as FitPart[];
  const partName = slot === "GPU" ? GRAPHICS_FIRST : PROCESSOR_FIRST;
  const provenByFigures =
    performanceEvidence(slot, part) === "manufacturer_verified" &&
    differing.some((otherPart) => comparePartPerformance(slot, part, otherPart) === "higher");
  // With the same part in every build, or a cheaper one here, nothing was chosen on this priority.
  if (!provenByFigures && !differing.some((otherPart) => otherPart.price < part.price)) {
    return undefined;
  }
  return provenByFigures
    ? `You asked for ${profile.priorityAsked}, which leans on the ${partName}. This one has higher published figures than the others shown.`
    : `You asked for ${profile.priorityAsked}, which leans on the ${partName}. This build spends the most on it. That's price, not measured performance.`;
}
