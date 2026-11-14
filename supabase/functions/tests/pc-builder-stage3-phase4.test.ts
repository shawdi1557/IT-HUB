// Stage 3 Phase 4 (the owner's rulings of 13 November 2026, plan P4-1 to P4-6): every role takes the cheapest drive
// that fits, never chosen by its title; no size preference without an approved guideline; a drive whose capacity
// isn't stated can still be chosen; selection never changes a part's evidence (contract test F2). Every listing is
// synthetic test data. No network.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GOLDEN_CATALOGUES, testListingMaker } from "./_helpers/stage3-golden.ts";

const { syncBuilderCatalogWithShopify } = await import("../../../src/lib/builder/catalog.ts");
const { generateCatalogOffer, generateDynamicCatalogRecommendations } =
  await import("../../../src/lib/builder/recommendations.ts");

const catalogueOf = (listings: any[]) => syncBuilderCatalogWithShopify(listings).componentCatalog;
const search = (catalogue: any, purpose: string, min: number, max: number, details = {}) =>
  generateDynamicCatalogRecommendations(
    catalogue,
    { purpose, details, brands: [] },
    { min, max },
    { allowUnverified: true },
  ) as any[];
const drives = (builds: any[]) => new Set(builds.map((b) => b.parts.Storage?.name));

/** The sparse catalogue with its two drives replaced. */
const sparseWithDrives = (drivesToUse: [string, number, Record<string, string>?][]) => {
  const p = testListingMaker("p4");
  const base = GOLDEN_CATALOGUES.sparse().filter((l) => l.category !== "Solid State Drives");
  return [
    ...base,
    ...drivesToUse.map(([name, price, specs]) => p(name, "Storage", price, specs ?? {})),
  ];
};

Deno.test("P4-1: every role takes the cheapest drive that fits; a title saying 1TB earns nothing", () => {
  const catalogue = catalogueOf(
    sparseWithDrives([
      ["QZX Phase4 Drive 1TB NVMe", 4200],
      ["QZX Phase4 Drive Plain NVMe", 2700],
    ]),
  );
  for (const [purpose, min, max] of [
    ["gaming", 60000, 80000],
    ["office", 40000, 60000],
    ["programming", 60000, 80000],
  ] as const) {
    const builds = search(catalogue, purpose, min, max);
    assert(builds.length > 0, purpose);
    assertEquals(drives(builds), new Set(["QZX Phase4 Drive Plain NVMe"]), purpose);
  }
});

Deno.test("P4-1: renaming the drives never changes which one is chosen", () => {
  const named = (cheap: string, dear: string) =>
    search(
      catalogueOf(
        sparseWithDrives([
          [dear, 4200],
          [cheap, 2700],
        ]),
      ),
      "gaming",
      60000,
      80000,
    ).map((b) => `${b.price}|${b.parts.Storage?.price}`);
  const plain = named("QZX Phase4 Drive A", "QZX Phase4 Drive B");
  assertEquals(named("QZX Phase4 Drive 500GB", "QZX Phase4 Drive 1TB"), plain);
  assertEquals(named("QZX Phase4 Drive 1TB", "QZX Phase4 Drive 500GB"), plain);
  assertEquals(named("QZX Phase4 Drive 2TB", "QZX Phase4 Drive 1tb"), plain);
});

Deno.test("P4-1: two drives at the same price are chosen by product ID, whatever order Shopify lists them in", () => {
  const listings = sparseWithDrives([
    ["QZX Phase4 Drive First", 2700],
    ["QZX Phase4 Drive Second", 2700],
  ]);
  const chosen = (order: any[]) => [...drives(search(catalogueOf(order), "gaming", 60000, 80000))];
  const forward = chosen(listings);
  assertEquals(forward.length, 1);
  assertEquals(chosen(listings.slice().reverse()), forward);
  // The lower product ID wins the tie: the first drive made.
  assertEquals(forward, ["QZX Phase4 Drive First"]);
});

Deno.test("P4-2: with no approved storage guideline, a larger stated capacity earns no role a dearer drive", () => {
  const catalogue = catalogueOf(
    sparseWithDrives([
      [
        "QZX Phase4 Drive Big",
        8200,
        { storage_interface: "M.2 NVMe", storage_capacity_gb: "2000" },
      ],
      [
        "QZX Phase4 Drive Small",
        2700,
        { storage_interface: "M.2 NVMe", storage_capacity_gb: "500" },
      ],
    ]),
  );
  const offer = generateCatalogOffer(
    catalogue,
    { purpose: "gaming", details: {}, brands: [] },
    { min: 60000, max: 80000 },
    { allowUnverified: true },
  );
  assert(offer.builds.length > 1);
  assertEquals(drives(offer.builds), new Set(["QZX Phase4 Drive Small"]));
});

Deno.test("P4-4: a drive whose capacity isn't stated can still be chosen", () => {
  const catalogue = catalogueOf(
    sparseWithDrives([
      ["QZX Phase4 Drive Unstated", 2600, { storage_interface: "M.2 NVMe" }],
      [
        "QZX Phase4 Drive Stated",
        2700,
        { storage_interface: "M.2 NVMe", storage_capacity_gb: "1000" },
      ],
    ]),
  );
  assertEquals(
    drives(search(catalogue, "gaming", 60000, 80000)),
    new Set(["QZX Phase4 Drive Unstated"]),
  );
});

Deno.test("F2: choosing parts never changes a part's evidence (field sources, provenance, verified)", () => {
  let compared = 0;
  for (const [name, make] of Object.entries(GOLDEN_CATALOGUES)) {
    const catalogue = catalogueOf(make());
    const byId = new Map<string, any>();
    for (const items of Object.values(catalogue) as any[][])
      for (const item of items) byId.set(item.id, item);
    for (const [purpose, min, max] of [
      ["gaming", 60000, 100000],
      ["office", 30000, 80000],
    ] as const) {
      for (const build of search(catalogue, purpose, min, max)) {
        for (const [slot, part] of Object.entries(build.parts as Record<string, any>)) {
          const source = byId.get(part.id);
          if (!source) continue;
          const where = `${name} ${purpose} ${slot} ${part.name}`;
          assertEquals(part.specs?.fieldSources, source.specs?.fieldSources, where);
          assertEquals(part.specs?.provenance, source.specs?.provenance, where);
          assertEquals(part.isVerified, source.isVerified, where);
          compared++;
        }
      }
    }
  }
  assert(compared > 100, `only ${compared} parts compared`);
});

Deno.test("P4: the engine never reads a drive's title to choose it", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../src/lib/builder/recommendations.ts", import.meta.url),
  );
  assert(!/name\.includes\("1TB"\)|includes\("1tb"\)/.test(source));
  assert(!/storage1tb/.test(source));
});

// ── P4-5: the motherboard's M.2 SATA field ──────────────────────────────────────────────────────────────

const Spec = await import("../../../src/lib/builder/hardware-spec.ts");
const { compatibility } = await import("../../../src/lib/builder/compatibility.ts");

Deno.test("P4-5: an M.2 SATA drive passes on a board that takes it, fails on one that doesn't, and is reviewed when unstated", () => {
  const catalogue = catalogueOf(GOLDEN_CATALOGUES.sparse());
  const cpu = catalogue.CPU[0];
  const board =
    catalogue.Motherboard.find((b: any) => b.specs?.socket === cpu.specs?.socket) ??
    catalogue.Motherboard[0];
  const drive = {
    ...catalogue.Storage[0],
    name: "QZX M.2 SATA Drive",
    specs: { ...catalogue.Storage[0].specs, storageInterface: "M.2 SATA" },
  };
  const withBoard = (m2SataSupported?: boolean) =>
    compatibility({
      CPU: cpu,
      Motherboard: { ...board, specs: { ...board.specs, m2SlotCount: 2, m2SataSupported } },
      Storage: drive,
    }).result;
  const storageRows = (rows: any[]) => rows.filter((r) => /M\.2|Storage connection/.test(r.label));
  const yes = storageRows(withBoard(true));
  assert(
    yes.some((r) => r.label === "Storage connection available (M.2 SATA)" && r.state === "ok"),
    JSON.stringify(yes),
  );
  const no = storageRows(withBoard(false));
  assert(
    no.some(
      (r) => r.label === "Motherboard's M.2 slots don't take SATA drives" && r.state === "error",
    ),
    JSON.stringify(no),
  );
  const unknown = storageRows(withBoard(undefined));
  assert(
    unknown.some((r) => r.label === "M.2 SATA support unverified" && r.state !== "ok"),
    JSON.stringify(unknown),
  );
});

Deno.test("P4-5: the registry field reaches the builder as m2SataSupported, both yes and no", () => {
  const field = Spec.HARDWARE_SPEC_FIELDS.find(
    (f: any) => f.category === "Motherboard" && f.key === "m2_sata_support",
  );
  assert(field, "field defined");
  assertEquals([field.type, field.required, field.metafieldKey], ["boolean", false, undefined]);
  const record = (value: boolean) =>
    Spec.registryRecordFromRow({
      link_id: "00000000-0000-4000-8000-0000000c0001",
      shopify_product_id: "gid://shopify/Product/97000001",
      shopify_variant_id: null,
      model_id: "00000000-0000-4000-8000-0000000c0002",
      category_id: "Motherboard",
      manufacturer: "Synthetic",
      model_name: "Synthetic Board",
      model_number: null,
      model_specs: { m2_sata_support: value },
      base_specs: null,
      overrides: {},
      spec_revision: 1,
      override_revision: 0,
    })!;
  assertEquals(Spec.registryBuilderValues(record(true)).specs.m2SataSupported, true);
  assertEquals(Spec.registryBuilderValues(record(false)).specs.m2SataSupported, false);
});

// ── P4-6: U1 and U4 ─────────────────────────────────────────────────────────────────────────────────────

const Readiness = await import("../../../src/lib/builder/listing-readiness.ts");

Deno.test("P4-6: only a listing tagged approved is real; the test tag or [TEST] in the title makes it test", () => {
  const r = Readiness.listingReadiness;
  assertEquals(r({ name: "AMD Ryzen 5 5600", tags: ["it-hub-approved"] }), "approved");
  assertEquals(r({ name: "AMD Ryzen 5 5600", tags: [" IT-HUB-Approved "] }), "approved");
  assertEquals(r({ name: "AMD Ryzen 5 5600", tags: [] }), "not_approved");
  assertEquals(r({ name: "AMD Ryzen 5 5600" }), "not_approved");
  assertEquals(r({ name: "AMD Ryzen 5 5600", tags: ["it-hub-test"] }), "test");
  assertEquals(r({ name: "[TEST] AMD Ryzen 5 5600", tags: [] }), "test");
  assertEquals(r({ name: "AMD Ryzen 5 5600 [ test ]", tags: ["it-hub-approved"] }), "test");
  assertEquals(r({ name: "AMD Ryzen 5 5600", tags: ["it-hub-approved", "it-hub-test"] }), "test");
  assertEquals(r({ title: "[Test] Board", tags: [7, null, "it-hub-approved"] as any }), "test");
  assertEquals(Readiness.offeredInProduction("approved"), true);
  assertEquals(Readiness.offeredInProduction("not_approved"), false);
  assertEquals(Readiness.offeredInProduction("test"), false);
});

Deno.test("P4-6: nothing on the site uses the classifier until U2 (how the site knows it's production) is decided", async () => {
  const walk = async (dir: URL, found: string[]) => {
    for await (const entry of Deno.readDir(dir)) {
      const next = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
      if (entry.isDirectory) await walk(next, found);
      else if (/\.(tsx?)$/.test(entry.name) && entry.name !== "listing-readiness.ts") {
        if ((await Deno.readTextFile(next)).includes("listing-readiness"))
          found.push(next.pathname);
      }
    }
    return found;
  };
  assertEquals(await walk(new URL("../../../src/", import.meta.url), []), []);
});

Deno.test("P4-1: the engine breaks a drive price tie by product ID, however its drive list is ordered", () => {
  const listings = sparseWithDrives([
    ["QZX Phase4 Drive First", 2700],
    ["QZX Phase4 Drive Second", 2700],
  ]);
  const catalogue = catalogueOf(listings);
  const chosen = (storage: any[]) => [
    ...drives(search({ ...catalogue, Storage: storage }, "gaming", 60000, 80000)),
  ];
  const forward = chosen(catalogue.Storage);
  assertEquals(forward, ["QZX Phase4 Drive First"]);
  assertEquals(chosen([...catalogue.Storage].reverse()), forward);
});
