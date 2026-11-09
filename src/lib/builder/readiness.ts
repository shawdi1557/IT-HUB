// src/lib/builder/readiness.ts
// Whether a saved build can go to IT HUB as it stands today (Stage 4A-5). A saved build keeps the parts and prices
// it was saved with, so it's first matched against the live catalogue: a part that has gone is marked unavailable
// and current prices replace old ones. It's then assessed and priced exactly as the builder's own screens do,
// purpose-neutral like every saved build (D6).

import { reconcileBuildParts } from "./catalog";
import { compatibility, toCanonicalComponent } from "./compatibility";
import { assessBuild, type BuildAssessment } from "./completeness";
import { summariseBuildPrice, type BuildPriceSummary } from "./pricing";
import type { ComponentOption } from "../../data/catalog";
import type { CanonicalBuildComponent, ComponentSlotId } from "./types";

export interface LiveBuild {
  /** The build's parts as the live catalogue has them now. */
  parts: Record<string, ComponentOption>;
  /** The parts the customer owns, where no part has been chosen since. */
  owned: string[];
  assessment: BuildAssessment;
  price: BuildPriceSummary;
}

export function liveBuild(
  savedParts: Record<string, any>,
  savedOwned: string[] | undefined,
  catalog: Record<string, ComponentOption[]>,
  assembly = 0,
): LiveBuild {
  const parts = reconcileBuildParts(savedParts || {}, catalog || {}).parts as Record<
    string,
    ComponentOption
  >;
  // Choosing a part for a slot means the customer is no longer using their own, as on the builder's screens.
  const owned = (savedOwned || []).filter((slot) => !parts[slot]);
  const { summary } = compatibility(parts, { ownedSlots: owned });
  const components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {};
  for (const [slot, part] of Object.entries(parts)) {
    if (part) components[slot as ComponentSlotId] = toCanonicalComponent(slot, part);
  }
  return {
    parts,
    owned,
    assessment: assessBuild(components, summary, { ownedSlots: owned }),
    price: summariseBuildPrice(parts, { ownedSlots: owned, assembly }),
  };
}
