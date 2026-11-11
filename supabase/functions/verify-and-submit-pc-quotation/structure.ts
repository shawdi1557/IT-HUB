// supabase/functions/verify-and-submit-pc-quotation/structure.ts
// Stage 4A-6: structural checks on a PC quotation request.
//
// These check the request's shape only: which slots it fills, and with what kind of record. They read no
// specification and trust none, so they can't tell whether the parts work together, or whether a build without a
// graphics card or cooler needs one. That's server-side build verification, Stage 4S. Passing these checks never
// makes a build "compatible".
//
// The slot lists repeat the builder's (`src/lib/builder/slots.ts`, `completeness.ts`, `persistence.ts`), because
// an Edge Function is deployed on its own. `pc-builder-stage4a-structure.test.ts` fails if the two drift apart.

import type { ServerSpecRecord } from "./specs.ts";

/** Every slot a quotation can fill: the builder's slots, and nothing else. */
export const QUOTE_SLOTS = [
  "CPU",
  "Motherboard",
  "RAM",
  "GPU",
  "Storage",
  "PSU",
  "Cabinet",
  "Cooler",
  "Monitor",
] as const;

/** The slots every quotation must fill, with a part to buy or, where allowed, the customer's own. */
export const QUOTE_ESSENTIAL_SLOTS = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"];

/**
 * Stage 4S-3 (decision S3-B): the uses Find My PC offers, as the page names them (`PurposeId` in
 * src/pages/Builder.tsx). A request may name one; what it requires (a dedicated graphics card for gaming, content
 * creation and professional work) comes from the builder's own `purposeProfile`, never from the request. No
 * purpose means Expert Mode, which is purpose-neutral (4A decision D6). `pc-builder-stage4s-purpose.test.ts` fails
 * if this list and the page's drift apart.
 */
export const QUOTE_PURPOSES = [
  "gaming",
  "creation",
  "work",
  "programming",
  "professional",
  "general",
] as const;
export type QuotePurpose = (typeof QUOTE_PURPOSES)[number];

/** The slots where the customer may use a part they already own. */
export const QUOTE_OWNABLE_SLOTS = ["RAM", "Storage", "GPU"];

/**
 * The most units of one part a slot can hold. A whole number above this is well formed but can't be priced, so the
 * quotation goes to review (Stage 4A-2). A part to buy with no quantity, or one that isn't a whole number from 1 up,
 * is refused (Stage 4A-7, Stage 4A closure).
 */
export const QUOTE_MAX_QUANTITY: Record<string, number> = {
  CPU: 1,
  Motherboard: 1,
  RAM: 4,
  GPU: 1,
  Storage: 2,
  PSU: 1,
  Cabinet: 1,
  Cooler: 1,
  Monitor: 1,
};

/** What the customer's own part is called, as the builder names it. */
const OWNED_PART_NAMES: Record<string, string> = {
  GPU: "graphics card",
  RAM: "RAM",
  Storage: "storage",
};

/** Customer wording for a slot that's missing. */
const SLOT_NAMES: Record<string, string> = {
  CPU: "processor",
  Motherboard: "motherboard",
  RAM: "memory (RAM)",
  Storage: "storage",
  PSU: "power supply",
  Cabinet: "cabinet",
};

/** More entries than there are slots means the request wasn't made by the builder. */
export const MAX_PARTS = 10;
/** A full build with every specification is about 5 KB. This leaves wide room and still bounds the work. */
export const MAX_BODY_BYTES = 256 * 1024;
/** Shopify's own limit on a product title. */
export const MAX_TEXT_LENGTH = 255;
/** A storefront variant ID, as the builder sends it. */
export const VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/[A-Za-z0-9._-]{1,64}$/;

export const MESSAGE_UNREADABLE =
  "This quotation request couldn't be read. Please refresh the page and try again.";
export const MESSAGE_TOO_LARGE =
  "This quotation request is too large. Please refresh the page and try again.";
export const messageMissingParts = (slots: string[]) =>
  `This build is missing parts a quotation needs: ${slots
    .map((slot) => SLOT_NAMES[slot] || slot)
    .join(", ")}. Please choose them and try again.`;

export type StructureProblemCode =
  | "body_not_object"
  | "build_name_invalid"
  | "estimated_price_invalid"
  | "compatibility_invalid"
  | "purpose_invalid"
  | "customer_info_invalid"
  | "parts_missing"
  | "too_many_parts"
  | "part_not_object"
  | "unknown_slot"
  | "slot_mismatch"
  | "duplicate_slot"
  | "owned_flag_invalid"
  | "owned_slot_not_allowed"
  | "owned_part_has_product"
  | "variant_missing"
  | "variant_malformed"
  | "duplicate_variant"
  | "text_invalid"
  | "price_invalid"
  | "quantity_missing"
  | "quantity_malformed"
  | "specs_invalid"
  | "missing_essential";

export interface StructureProblem {
  code: StructureProblemCode;
  slot?: string;
  field?: string;
}

/** A part as the server stores it: only the fields the builder sends, in a fixed shape. */
export interface QuotePart {
  slot: string;
  owned?: true;
  productId?: string;
  variantId: string | null;
  title: string;
  name: string;
  price: number;
  /** A whole number from 1, required on every part to buy. Owned parts have none: nothing is bought or priced. */
  quantity?: number;
  isShopifyLive: boolean;
  specs?: Record<string, unknown>;
  /**
   * Stage 4S-1, set by the server for each part to buy: how Shopify's data placed the product in its slot (its own
   * fields, or its title), or that it couldn't be confirmed. Owned parts have none.
   */
  slotCheck?: "shopify_fields" | "title" | "unconfirmed";
  /** Stage 4S-1: the product ID the browser sent, kept only when it isn't the variant's product in Shopify. */
  reportedProductId?: string;
  /**
   * Stage 4S-2, set by the server for each part to buy: the specifications it resolved from Shopify's answer, with
   * each value's status and provenance. `specs` above is the browser's report, kept as it was sent. Owned parts have
   * none.
   */
  serverSpecs?: ServerSpecRecord;
}

export type StructureResult =
  | {
      ok: true;
      buildName: string;
      estimatedPrice: number;
      compatibility: Record<string, unknown>;
      /** The Find My PC use the build was found for. Absent for Expert Mode. */
      purpose?: QuotePurpose;
      customerInfo: { name: string | null; phone: string | null; email: string | null };
      /** In slot order. Owned parts carry no product and no price. */
      parts: QuotePart[];
    }
  | {
      ok: false;
      status: 400 | 422;
      code: "invalid_request" | "incomplete_build";
      error: string;
      problems: StructureProblem[];
      missingSlots?: string[];
    };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const slotOrder = (slot: string) => (QUOTE_SLOTS as readonly string[]).indexOf(slot);

/** Optional text: absent, null, or a string no longer than the limit. */
function textOk(value: unknown, limit = MAX_TEXT_LENGTH) {
  return (
    value === undefined || value === null || (typeof value === "string" && value.length <= limit)
  );
}

/** The builder's record for a part the customer owns: no product, no price, the builder's own name. */
export function ownedQuotePart(slot: string): QuotePart {
  const name = `Customer's own ${OWNED_PART_NAMES[slot] || slot} (not priced)`;
  return {
    slot,
    owned: true,
    title: name,
    name,
    price: 0,
    variantId: null,
    isShopifyLive: false,
  };
}

/**
 * Checks a parsed request body. Rejects anything the builder can't have sent: an unknown or repeated slot, a part
 * to buy with no valid variant, an owned part where ownership isn't offered or that names a product, the same
 * variant in two slots, malformed fields, a part to buy with no quantity or one that isn't a whole number of at
 * least 1, or a build
 * missing an essential part. A well-formed quantity above the slot's most isn't refused: it's checked later, and
 * sends the quotation to review rather than pricing it (Stage 4A-2).
 */
export function checkQuotationStructure(body: unknown): StructureResult {
  const invalid = (problems: StructureProblem[]): StructureResult => ({
    ok: false,
    status: 400,
    code: "invalid_request",
    error: MESSAGE_UNREADABLE,
    problems,
  });

  if (!isPlainObject(body)) return invalid([{ code: "body_not_object" }]);

  const problems: StructureProblem[] = [];
  const {
    buildName = "Custom PC Build",
    parts,
    estimatedPrice = 0,
    compatibility = {},
    customerInfo = {},
    purpose = null,
  } = body as Record<string, unknown>;

  // The page lets a customer type any name, so a long one is shortened, as before, not refused.
  if (typeof buildName !== "string") problems.push({ code: "build_name_invalid" });
  if (
    typeof estimatedPrice !== "number" ||
    !Number.isFinite(estimatedPrice) ||
    estimatedPrice < 0
  ) {
    problems.push({ code: "estimated_price_invalid" });
  }
  // The browser's result is stored as a note for the technician, so it only has to be an object.
  if (!isPlainObject(compatibility)) problems.push({ code: "compatibility_invalid" });
  // A use the page doesn't offer can't have come from it.
  if (purpose !== null && !(QUOTE_PURPOSES as readonly unknown[]).includes(purpose)) {
    problems.push({ code: "purpose_invalid" });
  }
  if (
    !isPlainObject(customerInfo) ||
    !textOk(customerInfo.name) ||
    !textOk(customerInfo.phone, 32) ||
    !textOk(customerInfo.email, 254)
  ) {
    problems.push({ code: "customer_info_invalid" });
  }

  // Parts arrive keyed by slot, as the builder sends them, or as a list naming each slot.
  let entries: [string | undefined, unknown][] = [];
  if (Array.isArray(parts)) entries = parts.map((part) => [undefined, part]);
  else if (isPlainObject(parts)) entries = Object.entries(parts);
  else return invalid([...problems, { code: "parts_missing" }]);

  // An empty slot is left out, as before.
  entries = entries.filter(([, part]) => part !== null && part !== undefined);
  if (entries.length > MAX_PARTS) return invalid([...problems, { code: "too_many_parts" }]);

  const bySlot = new Map<string, QuotePart>();
  const variants = new Set<string>();
  for (const [key, raw] of entries) {
    if (!isPlainObject(raw)) {
      problems.push({ code: "part_not_object", slot: key });
      continue;
    }
    const slot = key ?? raw.slot;
    if (typeof slot !== "string" || !(QUOTE_SLOTS as readonly string[]).includes(slot)) {
      problems.push({ code: "unknown_slot", slot: typeof slot === "string" ? slot : undefined });
      continue;
    }
    if (key !== undefined && raw.slot !== undefined && raw.slot !== key) {
      problems.push({ code: "slot_mismatch", slot });
      continue;
    }
    if (bySlot.has(slot)) {
      problems.push({ code: "duplicate_slot", slot });
      continue;
    }
    if (!textOk(raw.title) || !textOk(raw.name) || !textOk(raw.productId)) {
      problems.push({ code: "text_invalid", slot });
      continue;
    }
    if (raw.specs !== undefined && raw.specs !== null && !isPlainObject(raw.specs)) {
      problems.push({ code: "specs_invalid", slot });
      continue;
    }
    if (raw.owned !== undefined && typeof raw.owned !== "boolean") {
      problems.push({ code: "owned_flag_invalid", slot });
      continue;
    }

    if (raw.owned === true) {
      if (!QUOTE_OWNABLE_SLOTS.includes(slot)) {
        problems.push({ code: "owned_slot_not_allowed", slot });
        continue;
      }
      if (raw.variantId !== undefined && raw.variantId !== null && raw.variantId !== "") {
        problems.push({ code: "owned_part_has_product", slot });
        continue;
      }
      // Stored under the builder's own name, whatever the request called it.
      bySlot.set(slot, ownedQuotePart(slot));
      continue;
    }

    if (raw.variantId === undefined || raw.variantId === null || raw.variantId === "") {
      problems.push({ code: "variant_missing", slot });
      continue;
    }
    if (typeof raw.variantId !== "string" || !VARIANT_GID.test(raw.variantId)) {
      problems.push({ code: "variant_malformed", slot });
      continue;
    }
    if (variants.has(raw.variantId)) {
      problems.push({ code: "duplicate_variant", slot });
      continue;
    }
    if (
      raw.price !== undefined &&
      raw.price !== null &&
      (typeof raw.price !== "number" || !Number.isFinite(raw.price) || raw.price < 0)
    ) {
      problems.push({ code: "price_invalid", slot });
      continue;
    }
    // The builder sends every part to buy with a JSON whole number of at least 1. A quantity left out, zero, a
    // negative or fractional number, a number written as text, null, or any other type can't be a real request
    // (owner decisions, Stage 4A-7 and the Stage 4A closure).
    if (raw.quantity === undefined) {
      problems.push({ code: "quantity_missing", slot });
      continue;
    }
    if (typeof raw.quantity !== "number" || !Number.isInteger(raw.quantity) || raw.quantity < 1) {
      problems.push({ code: "quantity_malformed", slot });
      continue;
    }
    variants.add(raw.variantId);

    const title = typeof raw.title === "string" ? raw.title : "";
    const name = typeof raw.name === "string" ? raw.name : title;
    const part: QuotePart = {
      slot,
      variantId: raw.variantId,
      title: title || name,
      name: name || title,
      // The browser's figures, kept only until Shopify's replace them. Never used to price the build.
      price: typeof raw.price === "number" ? raw.price : 0,
      isShopifyLive: raw.isShopifyLive === undefined ? true : raw.isShopifyLive === true,
    };
    if (typeof raw.productId === "string") part.productId = raw.productId;
    part.quantity = raw.quantity;
    // Reported by the browser and stored for the technician. Nothing on the server reads them.
    if (isPlainObject(raw.specs)) part.specs = raw.specs;
    bySlot.set(slot, part);
  }

  if (problems.length > 0) return invalid(problems);

  const missingSlots = QUOTE_ESSENTIAL_SLOTS.filter((slot) => !bySlot.has(slot));
  if (missingSlots.length > 0) {
    return {
      ok: false,
      status: 422,
      code: "incomplete_build",
      error: messageMissingParts(missingSlots),
      problems: missingSlots.map((slot) => ({ code: "missing_essential" as const, slot })),
      missingSlots,
    };
  }

  const info = customerInfo as Record<string, string | null | undefined>;
  const clean = (value: string | null | undefined) => value?.trim() || null;
  return {
    ok: true,
    buildName: (buildName as string).slice(0, 120),
    estimatedPrice: estimatedPrice as number,
    compatibility: compatibility as Record<string, unknown>,
    ...(purpose !== null ? { purpose: purpose as QuotePurpose } : {}),
    customerInfo: {
      name: clean(info.name),
      phone: clean(info.phone),
      email: clean(info.email),
    },
    parts: [...bySlot.values()].sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot)),
  };
}

/**
 * Whether a part's quantity can be priced: a whole number from 1 to its slot's most. The structure check has
 * already refused a part to buy without a whole number from 1, so in practice this catches a quantity above the
 * slot's most, which sends the quotation to a technician with no verified price, as Stage 4A-2 decided. An owned
 * part carries no quantity and nothing is priced for it, so it passes.
 */
export function quantityPriceable(part: QuotePart): boolean {
  const quantity = part.quantity === undefined ? 1 : part.quantity;
  return (
    typeof quantity === "number" &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= (QUOTE_MAX_QUANTITY[part.slot] ?? 1)
  );
}

/**
 * What makes two quotation requests the same request, for the two-minute repeat check (Stage 4S decision 6):
 * each slot, whether the customer owns the part there, and for a part to buy its variant and quantity. The same
 * parts in other quantities, other parts, or a part now owned rather than bought are a different request, so
 * they never get an earlier reference or price. Works on a request's checked parts and on a stored row's
 * `parts` (keyed by slot, or a list from older rows). A stored part to buy with no quantity predates quantities
 * being stored, when none meant one.
 */
export function quotationFingerprint(parts: unknown): string {
  const entries: [string, unknown][] = Array.isArray(parts)
    ? parts.map((part) => [String((part as any)?.slot ?? ""), part])
    : isPlainObject(parts)
      ? Object.entries(parts)
      : [];
  const lines = entries
    .filter(([, part]) => isPlainObject(part))
    .map(([key, part]) => {
      const raw = part as Record<string, unknown>;
      const slot = typeof raw.slot === "string" && raw.slot ? raw.slot : key;
      if (raw.owned === true) return [slot, "owned"];
      const quantity =
        typeof raw.quantity === "number" && Number.isInteger(raw.quantity) ? raw.quantity : 1;
      return [slot, "buy", typeof raw.variantId === "string" ? raw.variantId : null, quantity];
    })
    .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
  return JSON.stringify(lines);
}
