// Stage 4A-6 test helper. The quotation server now refuses a build missing an essential part. Tests written before
// that, about pricing, sign-in, rate limits or repeats, sent a processor alone. These helpers add the missing
// essentials at ₹0, so each test still sends what it was about, with the same totals. Made-up IDs, no real stock.

export const FILLER_PREFIX = "gid://shopify/ProductVariant/s4a6-filler-";

const ESSENTIALS = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"];

/** A ₹0 stand-in for an essential part the test isn't about. */
export const fillerPart = (slot: string) => ({
  slot,
  variantId: `${FILLER_PREFIX}${slot.toLowerCase()}`,
  title: `Stand-in ${slot}`,
  name: `Stand-in ${slot}`,
  price: 0,
});

/** The parts, plus a ₹0 stand-in for each essential slot they leave empty. */
export function withEssentials(parts: Record<string, any>): Record<string, any> {
  const filled: Record<string, any> = { ...parts };
  for (const slot of ESSENTIALS) if (!filled[slot]) filled[slot] = fillerPart(slot);
  return filled;
}

export const isFiller = (id: string) => id.startsWith(FILLER_PREFIX);

/** Shopify's answer for a stand-in: on sale at ₹0. */
export const fillerNode = (id: string) => ({
  id,
  title: "Default Title",
  product: { title: "Stand-in part" },
  price: { amount: "0.00", currencyCode: "INR" },
  availableForSale: true,
});

/**
 * Wraps a test's own Shopify answer: stand-ins are answered at ₹0, and the test's nodes answer its own IDs in
 * the order the server asks for them.
 */
export function answeringFillers(nodesForOwnIds: (ownIds: string[]) => any[]) {
  return (_query: string, vars: { ids: string[] }) => {
    const ownIds = vars.ids.filter((id) => !isFiller(id));
    const own = nodesForOwnIds(ownIds);
    let next = 0;
    return Promise.resolve({
      data: { nodes: vars.ids.map((id) => (isFiller(id) ? fillerNode(id) : own[next++])) },
    });
  };
}
