// GENERATED from src/lib/builder/pricing.ts by scripts/sync-server-builder.cjs. Don't edit: change the source and
// run `node scripts/sync-server-builder.cjs`. Only ".ts" is added to relative imports.

// src/lib/builder/pricing.ts
// One price summary for every screen and for the quotation request (Stage 4A-2). A part the customer owns is
// never priced, a part that's no longer available is named and left out, and the assembly charge is its own
// line on top of the parts. The quotation server prices the same way: unit price times quantity, owned parts
// left out, no assembly charge.

import { COMPONENT_SLOTS } from "./slots.ts";

/** A part as any screen holds it: a catalogue selection (`name`, `stock`) or an engine part (`title`, `availability`, `quantity`). */
export interface PricedPartInput {
  price?: number;
  quantity?: number;
  stock?: number;
  availability?: string;
  name?: string;
  title?: string;
  /** The stored record of a part the customer owns. */
  owned?: boolean;
}

export interface PriceLine {
  slot: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface BuildPriceSummary {
  /** The parts being bought, in slot order. */
  lines: PriceLine[];
  /** Parts the customer owns. Never priced. */
  ownedSlots: string[];
  /** Parts that are no longer available. Named, and left out of every total. */
  unavailableSlots: string[];
  /** The parts being bought, unit price times quantity. What the quotation server checks. */
  componentTotal: number;
  /** The assembly or service charge, 0 when assembly is free. */
  assembly: number;
  /** The parts plus the assembly charge. What a customer sees as the estimated total. */
  total: number;
}

/** A selection out of stock, or an engine part marked unavailable. Every screen uses this one test. */
export const isUnavailablePart = (part?: PricedPartInput | null): boolean =>
  part?.stock === 0 || part?.availability === "unavailable";

/** How many of a part are being bought. Anything but a whole number of at least one counts as one. */
export function partQuantity(part?: PricedPartInput | null): number {
  const quantity = part?.quantity;
  return typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
}

const unitPrice = (part: PricedPartInput) =>
  typeof part.price === "number" && Number.isFinite(part.price) ? part.price : 0;

const SLOT_ORDER = COMPONENT_SLOTS.map((slot) => slot.id as string);
const slotRank = (slot: string) => {
  const index = SLOT_ORDER.indexOf(slot);
  return index === -1 ? SLOT_ORDER.length : index;
};
/** Known slots in the builder's order, then anything else by name, so the result never depends on key order. */
const bySlot = (a: string, b: string) => slotRank(a) - slotRank(b) || (a < b ? -1 : a > b ? 1 : 0);

export function summariseBuildPrice(
  parts: Record<string, PricedPartInput | null | undefined> | null | undefined,
  options: { ownedSlots?: Iterable<string>; assembly?: number } = {},
): BuildPriceSummary {
  const declaredOwned = new Set<string>(options.ownedSlots || []);
  const owned = new Set<string>();
  const unavailable: string[] = [];
  const lines: PriceLine[] = [];

  for (const slot of Object.keys(parts || {}).sort(bySlot)) {
    const part = parts?.[slot];
    if (!part) continue;
    if (declaredOwned.has(slot) || part.owned === true) {
      owned.add(slot);
      continue;
    }
    if (isUnavailablePart(part)) {
      unavailable.push(slot);
      continue;
    }
    const quantity = partQuantity(part);
    const price = unitPrice(part);
    lines.push({
      slot,
      name: part.name || part.title || slot,
      unitPrice: price,
      quantity,
      lineTotal: price * quantity,
    });
  }
  // A part owned outright has no record in the parts at all, and is still owned.
  for (const slot of declaredOwned) owned.add(slot);

  const componentTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const assembly =
    typeof options.assembly === "number" &&
    Number.isFinite(options.assembly) &&
    options.assembly > 0
      ? options.assembly
      : 0;
  return {
    lines,
    ownedSlots: [...owned].sort(bySlot),
    unavailableSlots: unavailable,
    componentTotal,
    assembly,
    total: componentTotal + assembly,
  };
}
