// Golden catalogues for PC Builder Stage 3. Every listing here is made up, with made-up test prices, and none
// describes IT HUB stock. Generated deterministically, so the same call always gives the same catalogue.

type Specs = Record<string, string>;

export interface GoldenListing {
  id: string;
  name: string;
  handle: string;
  price: number;
  tags: string[];
  variantId: string;
  availableForSale: boolean;
  stock: number;
  specs: Specs;
  category: string;
}

const REVIEWED: Specs = {
  spec_source: "manufacturer_datasheet",
  spec_review_status: "reviewed",
  spec_source_url: "https://www.example.org/datasheet",
  spec_reviewed_on: "2026-11-01",
};

const CATEGORY = {
  CPU: "Computer Processors",
  Motherboard: "Motherboards",
  RAM: "RAM",
  GPU: "Video Cards",
  Storage: "Solid State Drives",
  PSU: "Computer Power Supplies",
  Cabinet: "Computer Cases",
  Cooler: "CPU Coolers",
} as const;
type Slot = keyof typeof CATEGORY;

/** Every value the compatibility rules read, for a part that should pass every check. */
const FULL: Record<Slot, Specs> = {
  CPU: {
    socket: "AM4",
    watts: "65",
    cpu_max_power_watts: "76",
    integrated_graphics: "false",
    includes_cooler: "true",
    supported_ram_generations: '["DDR4"]',
  },
  Motherboard: {
    socket: "AM4",
    ram_generation: "DDR4",
    form_factor: "Micro-ATX",
    ram_slots: "4",
    max_ram_gb: "128",
    m2_slots: "2",
    sata_ports: "4",
  },
  RAM: { ram_generation: "DDR4", ram_capacity_gb: "16", ram_modules: "2", ram_module_type: "DIMM" },
  GPU: {
    watts: "130",
    gpu_length_mm: "240",
    recommended_psu_watts: "550",
    pcie_6plus2_required: "1",
    pcie_16pin_required: "0",
  },
  Storage: { storage_interface: "M.2 NVMe", storage_capacity_gb: "1000" },
  PSU: { capacity_watts: "650", pcie_6plus2_count: "2", pcie_16pin_count: "0" },
  Cabinet: {
    supported_motherboards: '["Micro-ATX","ATX"]',
    cabinet_clearance_mm: "320",
    max_cooler_height_mm: "165",
  },
  Cooler: { supported_sockets: '["AM4","AM5"]', cooler_height_mm: "155" },
};

function factory(prefix: string) {
  let next = 1;
  return (name: string, slot: Slot, price: number, specs: Specs = {}): GoldenListing => {
    const n = next++;
    const id = `${prefix}-${String(n).padStart(4, "0")}`;
    return {
      id: `gid://shopify/Product/${id}`,
      name,
      handle: id,
      price,
      tags: [],
      variantId: `gid://shopify/ProductVariant/${id}`,
      availableForSale: true,
      stock: 5,
      specs,
      category: CATEGORY[slot],
    };
  };
}

const reviewed = (slot: Slot, extra: Specs = {}) => ({ ...FULL[slot], ...extra, ...REVIEWED });

/** Mostly blank and title-read listings, like today's live test catalogue. Nearly every build needs review. */
export function sparseCatalogue(): GoldenListing[] {
  const p = factory("sparse");
  return [
    p("QZX Sparse Processor 6 Core AM4", "CPU", 9800),
    p("QZX Sparse Processor 8 Core AM4", "CPU", 15400, { socket: "AM4" }),
    p("QZX Sparse Board B550M DDR4", "Motherboard", 8900, { socket: "AM4" }),
    p("QZX Sparse Board B450M DDR4", "Motherboard", 6400),
    p("QZX Sparse Memory 16GB DDR4", "RAM", 3100),
    p("QZX Sparse Memory 32GB DDR4", "RAM", 6200, { ram_generation: "DDR4" }),
    p("QZX Sparse Card 8GB", "GPU", 27500, { watts: "115" }),
    p("QZX Sparse Card 12GB", "GPU", 41000),
    p("QZX Sparse Drive 1TB NVMe", "Storage", 4200),
    p("QZX Sparse Drive 500GB NVMe", "Storage", 2700),
    p("QZX Sparse Power 550W", "PSU", 3400),
    p("QZX Sparse Power 750W", "PSU", 6900),
    p("QZX Sparse Enclosure", "Cabinet", 2600),
    p("QZX Sparse Cooler Tower", "Cooler", 1800),
  ];
}

/** Every value reviewed, several tiers per slot, so confirmed builds exist and differ. */
export function evidenceRichCatalogue(): GoldenListing[] {
  const p = factory("rich");
  const items: GoldenListing[] = [];
  const tiers: [Slot, [string, number, Specs][]][] = [
    [
      "CPU",
      [
        ["Entry", 9500, {}],
        ["Mid", 16500, { watts: "88" }],
        ["High", 27500, { watts: "105", cpu_max_power_watts: "142" }],
      ],
    ],
    [
      "Motherboard",
      [
        ["Basic", 7200, {}],
        ["Wifi", 10800, { has_wifi: "true" }],
      ],
    ],
    [
      "RAM",
      [
        ["16GB", 3300, {}],
        ["32GB", 6400, { ram_capacity_gb: "32" }],
      ],
    ],
    [
      "GPU",
      [
        ["Card A", 24500, {}],
        ["Card B", 38500, { watts: "200", recommended_psu_watts: "650", gpu_length_mm: "285" }],
        ["Card C", 61000, { watts: "220", recommended_psu_watts: "650", gpu_length_mm: "300" }],
      ],
    ],
    [
      "Storage",
      [
        ["500GB", 2900, { storage_capacity_gb: "500" }],
        ["1TB", 4600, {}],
        ["2TB", 8200, { storage_capacity_gb: "2000" }],
      ],
    ],
    [
      "PSU",
      [
        ["650W", 4800, {}],
        ["850W", 8600, { capacity_watts: "850", pcie_6plus2_count: "4" }],
      ],
    ],
    [
      "Cabinet",
      [
        ["Compact", 3200, {}],
        ["Airflow", 5600, {}],
      ],
    ],
    ["Cooler", [["Tower", 2400, {}]]],
  ];
  for (const [slot, rows] of tiers) {
    for (const [tier, price, extra] of rows)
      items.push(p(`QZX Rich ${slot} ${tier}`, slot, price, reviewed(slot, extra)));
  }
  // An AM5 platform from IT HUB's specification list, whose processors and cards carry sourced published
  // figures. The titles match list entries exactly; the prices are made up.
  const listed: [string, Slot, number][] = [
    ["AMD Ryzen 5 7600 (6 Cores / 12 Threads)", "CPU", 17800],
    ["AMD Ryzen 7 9700X (8 Cores / 16 Threads)", "CPU", 29500],
    ["MSI PRO B650M-P Micro-ATX Motherboard", "Motherboard", 11900],
    ["Corsair Vengeance 16GB (1x16GB) DDR5 5200MHz", "RAM", 4700],
    ["Corsair Vengeance 32GB (2x16GB) DDR5 6000MHz CL36", "RAM", 9800],
    ["ASRock AMD Radeon RX 7600 Challenger 8GB OC", "GPU", 26800],
    ["ZOTAC Gaming GeForce RTX 4060 8GB Twin Edge", "GPU", 29900],
    ["Gigabyte GeForce RTX 4070 Super Windforce 12GB", "GPU", 59000],
    ["Corsair RM750e 750W 80 Plus Gold Fully Modular PSU", "PSU", 7900],
    ["Deepcool AG400 ARGB 120mm Single-Tower CPU Cooler", "Cooler", 2300],
  ];
  for (const [title, slot, price] of listed) items.push(p(title, slot, price));
  return items;
}

/** 300 listings per slot, every value reviewed, 2,400 in all. */
export function largeCatalogue(): GoldenListing[] {
  const p = factory("large");
  const items: GoldenListing[] = [];
  (Object.keys(CATEGORY) as Slot[]).forEach((slot, s) => {
    for (let i = 0; i < 300; i++)
      items.push(p(`QZX Large ${slot} ${i}`, slot, 2000 + (s + 1) * 37 * i, reviewed(slot)));
  });
  return items;
}

/** One listing in each slot. */
export function singlePerSlotCatalogue(): GoldenListing[] {
  const p = factory("single");
  return (Object.keys(CATEGORY) as Slot[]).map((slot) =>
    p(
      `QZX Single ${slot}`,
      slot,
      {
        CPU: 11000,
        Motherboard: 8000,
        RAM: 3200,
        GPU: 26000,
        Storage: 4100,
        PSU: 4600,
        Cabinet: 3000,
        Cooler: 2200,
      }[slot],
      reviewed(slot),
    ),
  );
}

/** Everything but a power supply. No complete build can be made. */
export function missingCategoryCatalogue(): GoldenListing[] {
  return singlePerSlotCatalogue()
    .filter((item) => item.category !== CATEGORY.PSU)
    .map((item) => ({
      ...item,
      id: item.id.replace("single", "missing"),
      variantId: item.variantId.replace("single", "missing"),
    }));
}

/**
 * Builds priced at and around the edges of the ₹60,000 to ₹80,000 band. With the cooler in the box, a build is
 * processor + board + memory + card + drive + supply + cabinet. The cheapest card gives exactly ₹60,000.
 */
export function budgetEdgeCatalogue(): GoldenListing[] {
  const p = factory("edge");
  const base = 10000 + 8000 + 3000 + 4000 + 4000 + 3000; // ₹32,000 without a card
  return [
    p("QZX Edge Processor", "CPU", 10000, reviewed("CPU")),
    p("QZX Edge Board", "Motherboard", 8000, reviewed("Motherboard")),
    p("QZX Edge Memory", "RAM", 3000, reviewed("RAM")),
    p("QZX Edge Drive", "Storage", 4000, reviewed("Storage")),
    p("QZX Edge Power", "PSU", 4000, reviewed("PSU")),
    p("QZX Edge Enclosure", "Cabinet", 3000, reviewed("Cabinet")),
    p("QZX Edge Card At Minimum", "GPU", 60000 - base, reviewed("GPU")),
    p("QZX Edge Card Below Minimum", "GPU", 59999 - base, reviewed("GPU")),
    p("QZX Edge Card At Maximum", "GPU", 80000 - base, reviewed("GPU")),
    p("QZX Edge Card Above Maximum", "GPU", 80001 - base, reviewed("GPU")),
  ];
}

export const GOLDEN_CATALOGUES: Record<string, () => GoldenListing[]> = {
  sparse: sparseCatalogue,
  evidenceRich: evidenceRichCatalogue,
  large: largeCatalogue,
  singlePerSlot: singlePerSlotCatalogue,
  missingCategory: missingCategoryCatalogue,
  budgetEdge: budgetEdgeCatalogue,
};

/** The searches every golden catalogue is run through: each purpose the page offers, at every budget band. */
export const GOLDEN_SEARCHES: {
  purpose: string;
  details: Record<string, string>;
  min: number;
  max: number;
}[] = [];
for (const [purpose, details] of [
  ["gaming", {}],
  ["gaming", { resolution: "1440p" }],
  ["creation", { type: "Video" }],
  ["creation", { type: "3D" }],
  ["work", {}],
  ["programming", {}],
  ["professional", { type: "Software Development" }],
  ["general", {}],
] as [string, Record<string, string>][]) {
  for (const [min, max] of [
    [40000, 60000],
    [60000, 80000],
    [80000, 100000],
    [100000, 150000],
  ]) {
    GOLDEN_SEARCHES.push({ purpose, details, min, max });
  }
}

/** A build as the baseline records it: what was offered and at what price, not the order or the ID. */
export function describeOffer(build: any) {
  return {
    price: build.price,
    parts: Object.entries(build.parts as Record<string, any>)
      .map(([slot, part]) => `${slot}=${part.id}`)
      .sort()
      .join(","),
    review: Boolean(build.requiresReview),
    badge: build.confidenceBadge,
    label: build.tradeoffLabel,
  };
}

const offerKey = (offer: ReturnType<typeof describeOffer>) => `${offer.price}|${offer.parts}`;

/** The set of builds offered, independent of order, so a baseline compares what was offered. */
export function offerSet(builds: any[]) {
  return builds
    .map(describeOffer)
    .sort((a, b) => (offerKey(a) < offerKey(b) ? -1 : offerKey(a) > offerKey(b) ? 1 : 0));
}

/** Phase 2: the same set, with each build's chip, role and Stage 2 guarantee. */
export function roleOfferSet(builds: any[]) {
  return builds
    .map((build) => ({
      ...describeOffer(build),
      chip: build.tradeoff,
      role: build.offerRole ?? null,
      guarantee: build.guarantee ?? null,
    }))
    .sort((a, b) => (offerKey(a) < offerKey(b) ? -1 : offerKey(a) > offerKey(b) ? 1 : 0));
}

/** Recommendation measurements for one catalogue across the golden searches. They describe, they don't judge. */
export function measureOffers(
  search: (purpose: string, details: Record<string, string>, min: number, max: number) => any[],
) {
  let searches = 0,
    empty = 0,
    shown = 0,
    belowBand = 0,
    review = 0,
    labelled = 0,
    repeatedPairs = 0;
  let utilisation = 0;
  const started = performance.now();
  for (const { purpose, details, min, max } of GOLDEN_SEARCHES) {
    searches++;
    const builds = search(purpose, details, min, max);
    if (builds.length === 0) empty++;
    shown += builds.length;
    const pairs = builds.map((b) => `${b.parts.CPU?.id}|${b.parts.GPU?.id ?? "none"}`);
    repeatedPairs += pairs.length - new Set(pairs).size;
    for (const b of builds) {
      if (b.price < min) belowBand++;
      if (b.requiresReview) review++;
      if (b.tradeoffLabel && b.tradeoffLabel !== "Insufficient information") labelled++;
      utilisation += b.price / max;
    }
  }
  return {
    searches,
    empty,
    shown,
    belowBand,
    belowBandShare: shown ? Math.round((1000 * belowBand) / shown) / 1000 : 0,
    utilisation: shown ? Math.round((1000 * utilisation) / shown) / 1000 : 0,
    repeatedPairs,
    labelled,
    review,
    reviewShare: shown ? Math.round((1000 * review) / shown) / 1000 : 0,
    milliseconds: Math.round(performance.now() - started),
  };
}

// ── Phase 2 fixtures: the same made-up parts, for tests that build their own small catalogues ──────

/** A listing maker with its own ID sequence. Every listing it makes is test data with a made-up price. */
export const testListingMaker = (prefix: string) => factory(prefix);
/** Every value the compatibility rules read, with a recorded manufacturer source and review. */
export const reviewedSpecs = (slot: Slot, extra: Specs = {}) => reviewed(slot, extra);
/** Every value the compatibility rules read, stated but with no source or review. */
export const statedSpecs = (slot: Slot, extra: Specs = {}) => ({ ...FULL[slot], ...extra });
