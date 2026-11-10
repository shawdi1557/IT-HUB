// Stage 4A-6 test helper. The quotation server now refuses a build missing an essential part. Tests written before
// that, about pricing, sign-in, rate limits or repeats, sent a processor alone. These helpers add the missing
// essentials at ₹0, so each test still sends what it was about, with the same totals. Made-up IDs, no real stock.
// Since the Stage 4A closure every part to buy must carry a quantity, so each stand-in is one unit.

export const FILLER_PREFIX = "gid://shopify/ProductVariant/s4a6-filler-";

const ESSENTIALS = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"];

/** A ₹0 stand-in for an essential part the test isn't about. */
export const fillerPart = (slot: string) => ({
  slot,
  variantId: `${FILLER_PREFIX}${slot.toLowerCase()}`,
  title: `Stand-in ${slot}`,
  name: `Stand-in ${slot}`,
  price: 0,
  quantity: 1,
});

/** The parts, plus a ₹0 stand-in for each essential slot they leave empty. */
export function withEssentials(parts: Record<string, any>): Record<string, any> {
  const filled: Record<string, any> = { ...parts };
  for (const slot of ESSENTIALS) if (!filled[slot]) filled[slot] = fillerPart(slot);
  return filled;
}

export const isFiller = (id: string) => id.startsWith(FILLER_PREFIX);

/**
 * The taxonomy category IT HUB's store files each kind of part under, as recorded from the real catalogue
 * (test-env/browser/fixtures/stage2-catalogue.json). Since Stage 4S-1 the server places a product by these.
 */
export const SLOT_CATEGORY: Record<string, string> = {
  CPU: "Computer Processors",
  Motherboard: "Motherboards",
  RAM: "RAM",
  GPU: "Video Cards & Adapters",
  Storage: "Solid State Drives",
  PSU: "Computer Power Supplies",
  Cabinet: "Desktop Computer & Server Cases",
  Cooler: "CPU Air Coolers & Heat Sinks",
  Monitor: "Monitors",
};

/** Shopify's product for a part in a slot, shaped as the server's query asks for it. Made-up IDs. */
export const storefrontProduct = (slot: string, title: string) => ({
  id: `gid://shopify/Product/test-${slot.toLowerCase()}`,
  title,
  productType: "",
  tags: [] as string[],
  category: { name: SLOT_CATEGORY[slot] },
  collections: { edges: [] as unknown[] },
});

const fillerSlot = (id: string) =>
  ESSENTIALS.find((slot) => slot.toLowerCase() === id.slice(FILLER_PREFIX.length)) ?? "CPU";

/** Shopify's answer for a stand-in: on sale at ₹0, filed under its slot's category. */
export const fillerNode = (id: string) => ({
  id,
  title: "Default Title",
  product: storefrontProduct(fillerSlot(id), "Stand-in part"),
  price: { amount: "0.00", currencyCode: "INR" },
  availableForSale: true,
});

/**
 * Wraps a test's own Shopify answer: stand-ins are answered at ₹0, and the test's nodes answer its own IDs in
 * the order the server asks for them. Like Shopify, each node names the variant it answers, unless the test's node
 * names one itself.
 */
export function answeringFillers(nodesForOwnIds: (ownIds: string[]) => any[]) {
  return (_query: string, vars: { ids: string[] }) => {
    const ownIds = vars.ids.filter((id) => !isFiller(id));
    const own = nodesForOwnIds(ownIds);
    let next = 0;
    return Promise.resolve({
      data: {
        nodes: vars.ids.map((id) => {
          if (isFiller(id)) return fillerNode(id);
          const node = own[next++];
          return node ? { id, ...node } : node;
        }),
      },
    });
  };
}
