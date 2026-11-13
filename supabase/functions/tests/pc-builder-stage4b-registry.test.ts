// Stage 4B (4B-0, 4B-2, 4B-5): the Hardware Specification Manager's data contract and its use by the PC Builder.
//   - the field catalogue: every category, its validation, and its agreement with the pc_builder metafields, the
//     builder's own Shopify reader and the migration's seeded rows,
//   - the resolution order: override, model, inheritable base value, otherwise missing,
//   - the resolver: a linked listing resolves from the registry; Shopify disagreeing is a conflict; a record filed
//     under another category is never used; unlinked listings resolve exactly as before,
//   - the quotation server reads the registry itself, records the model and revision, and sends the quotation to a
//     technician when the registry can't be read.
//
// TEST CATALOGUE ONLY: every model, ID, price and value is made up for these tests. No network, no database.

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SLOT_CATEGORY,
  specMetafields,
  storefrontProduct,
  verifiedValues,
} from "./_helpers/quote-structure.ts";
import { quotationClient } from "./_helpers/quotation-client.ts";

const Spec = await import("../../../src/lib/builder/hardware-spec.ts");
const ServerSpec = await import("../_shared/builder/hardware-spec.ts");
const { resolveShopifyComponent } = await import("../../../src/lib/builder/spec-registry.ts");
const { PC_BUILDER_METAFIELDS, readStatedSpecs } =
  await import("../../../src/lib/builder/spec-schema.ts");
const { handleQuotationVerification } = await import("../verify-and-submit-pc-quotation/index.ts");
const { unresolvedSpecRecord } = await import("../verify-and-submit-pc-quotation/specs.ts");

const MIGRATION = await Deno.readTextFile(
  new URL("../../migrations/20261112000001_hardware_specification_manager.sql", import.meta.url),
);

// ── 4B-0: the field catalogue ──────────────────────────────────────────────────────────────────────────

Deno.test("S4B-1: the nine categories, each with fields; ids equal the builder's slots", () => {
  assertEquals(
    Spec.HARDWARE_CATEGORIES.map((category) => category.id),
    ["CPU", "GPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet", "Cooler", "Monitor"],
  );
  for (const category of Spec.HARDWARE_CATEGORIES) {
    assertEquals(category.builderSlot, category.id);
    assert(Spec.categoryFields(category.id).length >= 5, category.id);
  }
  // Keys are unique within a category.
  for (const category of Spec.HARDWARE_CATEGORIES) {
    const keys = Spec.categoryFields(category.id).map((field) => field.key);
    assertEquals(new Set(keys).size, keys.length, category.id);
  }
});

Deno.test("S4B-2: every synced field matches its pc_builder definition, and fills the same builder fields Shopify's reader does", () => {
  const sample = (key: string) => {
    const definition = PC_BUILDER_METAFIELDS.find((field: any) => field.key === key)!;
    if (definition.type === "number_integer") return String(definition.min ?? 1);
    if (definition.type === "boolean") return "true";
    if (definition.type === "list.single_line_text_field")
      return JSON.stringify([definition.choices![0]]);
    return definition.choices?.[0] ?? "x";
  };
  for (const field of Spec.HARDWARE_SPEC_FIELDS.filter((f: any) => f.metafieldKey)) {
    const definition = PC_BUILDER_METAFIELDS.find((m: any) => m.key === field.metafieldKey);
    assert(definition, `${field.category}.${field.key}: ${field.metafieldKey} has no definition`);
    assert(
      !definition.legacy && !definition.notCreated,
      `${field.metafieldKey} isn't a created key`,
    );
    if (definition.min !== undefined) assert((field.min ?? -Infinity) >= definition.min, field.key);
    if (definition.max !== undefined) assert((field.max ?? Infinity) <= definition.max, field.key);
    if (definition.choices && field.choices) {
      assert(
        field.choices.every((c: string) => definition.choices!.includes(c)),
        field.key,
      );
    }
    // The registry and Shopify's reader must put a value into the same builder fields.
    const key = field.metafieldKey as string;
    const fromShopify = Object.keys(readStatedSpecs(field.category, { [key]: sample(key) }).specs);
    assertEquals(
      [...(field.builderFields ?? [])].sort(),
      fromShopify.sort(),
      `${field.category}.${field.key} → ${field.metafieldKey}`,
    );
  }
});

Deno.test("S4B-3: the migration seeds exactly the TypeScript catalogue and mappings", () => {
  const q = (v: unknown) =>
    v === undefined || v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`;
  const n = (v: unknown) => (v === undefined ? "null" : String(v));
  const arr = (v?: readonly string[]) => (v ? `array[${v.map(q).join(", ")}]::text[]` : "null");
  const order: Record<string, number> = {};
  for (const f of Spec.HARDWARE_SPEC_FIELDS) {
    order[f.category] = (order[f.category] ?? 0) + 10;
    const row = `(${q(f.category)}, ${q(f.key)}, ${q(f.label)}, ${q(f.type)}, ${q(f.unit)}, ${n(f.min)}, ${n(f.max)}, ${arr(f.choices)}, ${n(f.maxLength)}, ${q(f.pattern)}, ${f.required}, ${f.inheritable}, ${q(f.metafieldKey)}, ${order[f.category]})`;
    assert(MIGRATION.includes(row), `field row missing or different: ${row}`);
  }
  const fieldRows =
    MIGRATION.match(
      /^  \('(?:CPU|GPU|Motherboard|RAM|Storage|PSU|Cabinet|Cooler|Monitor)', '[a-z0-9_]+', '[^']*', '(?:integer|decimal|text|boolean|enum|enum_list|text_list)', /gm,
    ) ?? [];
  assertEquals(fieldRows.length, Spec.HARDWARE_SPEC_FIELDS.length);
  for (const f of Spec.HARDWARE_SPEC_FIELDS.filter((x: any) => x.metafieldKey)) {
    const type = PC_BUILDER_METAFIELDS.find((m: any) => m.key === f.metafieldKey)!.type;
    assert(
      MIGRATION.includes(`(${q(f.category)}, ${q(f.key)}, ${q(f.metafieldKey)}, ${q(type)})`),
      f.key,
    );
  }
  // The server copy is the generated copy of the same module.
  assertEquals(ServerSpec.HARDWARE_SPEC_FIELDS, Spec.HARDWARE_SPEC_FIELDS);
});

// ── 4B-2: validation ───────────────────────────────────────────────────────────────────────────────────

Deno.test("S4B-4: values are checked by type, range and choice, and normalised; nothing is coerced or guessed", () => {
  const ok = Spec.validateHardwareSpecs("GPU", {
    tdp_watts: 200,
    length_mm: 242,
    vram_type: "gddr6x",
    display_outputs: [" 3x DisplayPort 1.4a ", "1x HDMI 2.1", "3x DisplayPort 1.4a"],
    chipset: "  GeForce   RTX 4070 ",
    width_slots: 2.5,
    boost_clock_mhz: null,
    base_clock_mhz: "",
  });
  assertEquals(ok.errors, []);
  assertEquals(ok.values, {
    tdp_watts: 200,
    length_mm: 242,
    vram_type: "GDDR6X",
    display_outputs: ["3x DisplayPort 1.4a", "1x HDMI 2.1"],
    chipset: "GeForce RTX 4070",
    width_slots: 2.5,
  });

  const codes = (category: string, input: Record<string, unknown>) =>
    Spec.validateHardwareSpecs(category, input).errors.map((e: any) => `${e.field}:${e.code}`);
  assertEquals(codes("GPU", { tdp_watts: "200W" }), ["tdp_watts:wrong_type"]);
  assertEquals(codes("GPU", { tdp_watts: 200.5 }), ["tdp_watts:not_whole_number"]);
  assertEquals(codes("GPU", { length_mm: 40 }), ["length_mm:below_minimum"]);
  assertEquals(codes("GPU", { length_mm: 501 }), ["length_mm:above_maximum"]);
  assertEquals(codes("GPU", { vram_type: "GDDR9" }), ["vram_type:not_a_choice"]);
  assertEquals(codes("GPU", { socket: "AM5" }), ["socket:unknown_field"]);
  // 4B-6: a refused field never appears among the accepted values.
  assertEquals(Spec.validateHardwareSpecs("GPU", { socket: "AM5", length_mm: 242 }).values, {
    length_mm: 242,
  });
  assertEquals(codes("GPU", { width_slots: 2.555 }), ["width_slots:too_precise"]);
  assertEquals(codes("CPU", { integrated_graphics: "yes" }), ["integrated_graphics:wrong_type"]);
  assertEquals(codes("CPU", { memory_support: [] }), ["memory_support:empty_list"]);
  assertEquals(codes("CPU", { memory_support: ["DDR3"] }), ["memory_support:not_a_choice"]);
  assertEquals(codes("Monitor", { resolution: "2560 x 1440" }), ["resolution:pattern_mismatch"]);
  assertEquals(codes("Monitor", { resolution: "2560 by 1440" }), ["resolution:too_long"]);
  assertEquals(codes("Monitor", { resolution: "2560x1440" }), []);
  assertEquals(codes("CPU", { core_count: 8, thread_count: 6 }), ["thread_count:inconsistent"]);
  assertEquals(codes("RAM", { capacity_gb: 16, module_count: 3 }), ["module_count:inconsistent"]);
  assertEquals(codes("GPU", { tdp_watts: 300, recommended_psu_watts: 250 }), [
    "recommended_psu_watts:inconsistent",
  ]);
  assertEquals(codes("Cooler", { cooler_type: "Air", radiator_size_mm: 240 }), [
    "radiator_size_mm:inconsistent",
  ]);
  assertEquals(codes("CPU", [] as any), [":not_an_object"]);
});

// ── 4B-2: resolution order ─────────────────────────────────────────────────────────────────────────────

Deno.test("S4B-5: override, then model, then the base model's inheritable fields only, otherwise missing", () => {
  const resolved = Spec.resolveHardwareSpecs({
    category: "GPU",
    base: {
      chipset: "GeForce RTX 4070",
      tdp_watts: 200,
      recommended_psu_watts: 650,
      length_mm: 336, // a reference board's length: never inherited
      boost_clock_mhz: 2475, // boards differ: never inherited
    },
    model: { length_mm: 242, pcie_8pin_required: 1, pcie_16pin_required: 0, tdp_watts: 215 },
    overrides: { length_mm: 245 },
  });
  assertEquals(resolved.values.length_mm, 245);
  assertEquals(resolved.sources.length_mm, "override");
  assertEquals(resolved.values.tdp_watts, 215);
  assertEquals(resolved.sources.tdp_watts, "model");
  assertEquals(resolved.values.recommended_psu_watts, 650);
  assertEquals(resolved.sources.recommended_psu_watts, "base");
  assertEquals(resolved.values.chipset, "GeForce RTX 4070");
  assertEquals(resolved.values.boost_clock_mhz, undefined);
  assertEquals(resolved.missingRequired, []);
  assert(resolved.complete);

  const missing = Spec.resolveHardwareSpecs({ category: "GPU", model: { length_mm: 242 } });
  assertEquals(missing.missingRequired, [
    "tdp_watts",
    "pcie_8pin_required",
    "pcie_16pin_required",
    "recommended_psu_watts",
  ]);
  assert(!missing.complete);
});

Deno.test("S4B-6: a stored value that no longer validates is reported and never used; a mixed-layer contradiction too", () => {
  // A layer's own bad values: the model's speed is out of range, and the override's 24 GB over 5 sticks contradicts
  // itself. Each is dropped and reported; the model's own consistent sticks remain.
  const own = Spec.resolveHardwareSpecs({
    category: "RAM",
    model: {
      capacity_gb: 32,
      module_count: 2,
      ram_generation: "DDR5",
      module_type: "DIMM",
      speed_mhz: 99999,
    },
    overrides: { capacity_gb: 24, module_count: 5 },
  });
  assertEquals(own.values.speed_mhz, undefined);
  assertEquals(own.values.capacity_gb, 24);
  assertEquals(own.sources.module_count, "model");
  assert(own.errors.some((e: any) => e.field === "speed_mhz" && e.message.startsWith("model:")));
  assert(
    own.errors.some((e: any) => e.field === "module_count" && e.message.startsWith("override:")),
  );
  assert(!own.complete);

  // Layers each consistent, together contradictory: 30 GB (override) can't split over the model's 4 sticks.
  const mixed = Spec.resolveHardwareSpecs({
    category: "RAM",
    model: { capacity_gb: 32, module_count: 4, ram_generation: "DDR5", module_type: "DIMM" },
    overrides: { capacity_gb: 30 },
  });
  assertEquals(mixed.values.module_count, undefined);
  assert(
    mixed.errors.some((e: any) => e.field === "module_count" && e.message.startsWith("resolved:")),
  );
  assert(!mixed.complete);
});

Deno.test("S4B-7: registry values become the builder's fields with the reader's conversions", () => {
  assertEquals(
    Spec.toBuilderFields("RAM", { module_type: "SO-DIMM", ram_generation: "DDR5", capacity_gb: 16 })
      .specs,
    { isLaptopSoDimm: true, ramGeneration: "DDR5", supportedRamGeneration: "DDR5", capacityGb: 16 },
  );
  assertEquals(Spec.toBuilderFields("Motherboard", { bios_update_required: false }).specs, {});
  assertEquals(Spec.toBuilderFields("Motherboard", { bios_update_required: true }).specs, {
    requiresBiosUpdateForRyzen5000: true,
  });
  assertEquals(Spec.toBuilderFields("GPU", { tdp_watts: 200, chipset: "x" }).specs, {
    tdpWatts: 200,
    powerWatts: 200,
  });
});

// ── 4B-1: identity ─────────────────────────────────────────────────────────────────────────────────────

Deno.test("S4B-8: identity is the exact model; boards sharing a chipset are never the same model", () => {
  assert(Spec.possiblySameModel("Dual GeForce RTX 4070", "dual geforce rtx-4070"));
  assert(Spec.possiblySameModel("Dual GeForce RTX 4070", "Dual GeForce RTX 4070 OC"));
  assert(!Spec.possiblySameModel("Dual GeForce RTX 4070", "GeForce RTX 4070 Ventus 2X"));
  assert(!Spec.possiblySameModel("RTX 4070", "GeForce RTX 4070 WINDFORCE OC"));
  assertEquals(Spec.identityText("Ventus 2X (OC)"), "ventus2xoc");
  assertEquals(Spec.shopifyGid("Product", "123"), "gid://shopify/Product/123");
  assertEquals(
    Spec.shopifyGid("Product", "gid://shopify/Product/123"),
    "gid://shopify/Product/123",
  );
  assertEquals(Spec.shopifyGid("Product", "gid://shopify/ProductVariant/123"), undefined);
  assertEquals(Spec.shopifyGid("ProductVariant", "abc"), undefined);
});

// ── 4B-5: the resolver ─────────────────────────────────────────────────────────────────────────────────

const PRODUCT_ID = "gid://shopify/Product/9100000001";
const VARIANT_ID = "gid://shopify/ProductVariant/9200000001";

const registryRow = (overrides: Record<string, unknown> = {}) => ({
  link_id: "00000000-0000-4000-8000-00000000b001",
  shopify_product_id: PRODUCT_ID,
  shopify_variant_id: null,
  model_id: "00000000-0000-4000-8000-00000000a001",
  category_id: "Motherboard",
  manufacturer: "Test Maker",
  model_name: "TB-650M Test Board",
  model_number: "TB650M-01",
  model_specs: {
    socket: "AM5",
    form_factor: "Micro-ATX",
    ram_generation: "DDR5",
    memory_slots: 2,
    max_memory_gb: 96,
    m2_slots: 1,
    sata_ports: 4,
    wifi: false,
  },
  base_specs: null,
  overrides: {},
  spec_revision: 3,
  override_revision: 0,
  ...overrides,
});

const boardProduct = (metafields: Record<string, string> = {}) => ({
  id: PRODUCT_ID,
  name: "Test Board (unbranded listing title)",
  category: "Motherboards",
  price: 9000,
  variantId: VARIANT_ID,
  specs: metafields,
});

const lookup = (...rows: Record<string, unknown>[]) =>
  Spec.registryLookup(rows.map((row) => Spec.registryRecordFromRow(row)!));

Deno.test("S4B-9: a linked listing resolves from its canonical model, as IT HUB's reviewed values", () => {
  const part = resolveShopifyComponent(boardProduct(), "Motherboard", {
    registrySpecs: lookup(registryRow()),
  })!;
  assertEquals(part.matchedModelKey, "hw-00000000-0000-4000-8000-00000000a001");
  assertEquals(part.specs.socket, "AM5");
  assertEquals(part.specs.formFactor, "Micro-ATX");
  assertEquals(part.specs.supportedRamGeneration, "DDR5");
  assertEquals(part.specs.ramSlots, 2);
  assertEquals(part.specs.hasWifi, false);
  assertEquals(part.specs.fieldSources?.socket, "it_hub_reviewed");
  assertEquals(part.specs.specProblems, undefined);
  assertEquals(part.isVerified, true);
  assertEquals(part.brand, "Test Maker");
  assertEquals(part.model, "TB-650M Test Board TB650M-01");
});

Deno.test("S4B-10: a variant's own link wins over its product's link; ids may be numbers or GIDs", () => {
  const productLink = registryRow();
  const variantLink = registryRow({
    link_id: "00000000-0000-4000-8000-00000000b002",
    shopify_variant_id: VARIANT_ID,
    model_id: "00000000-0000-4000-8000-00000000a002",
    model_specs: { socket: "AM4", form_factor: "ATX", ram_generation: "DDR4" },
  });
  const find = lookup(productLink, variantLink);
  assertEquals(find(VARIANT_ID, "9100000001")?.modelId, "00000000-0000-4000-8000-00000000a002");
  assertEquals(
    find("gid://shopify/ProductVariant/1", "9100000001")?.modelId,
    "00000000-0000-4000-8000-00000000a001",
  );
  assertEquals(find("gid://shopify/ProductVariant/1", "gid://shopify/Product/2"), undefined);
  // A row not in the function's shape is refused outright.
  assertEquals(
    Spec.registryRecordFromRow({ ...registryRow(), shopify_product_id: "not-an-id" }),
    undefined,
  );
  // 4B-6: revisions must be whole numbers, as the database function returns them.
  for (const bad of [
    { spec_revision: "3" },
    { spec_revision: null },
    { override_revision: 1.5 },
    { link_id: 7 },
  ]) {
    assertEquals(
      Spec.registryRecordFromRow({ ...registryRow(), ...bad }),
      undefined,
      JSON.stringify(bad),
    );
  }
});

Deno.test("S4B-11: Shopify disagreeing with the registry is a conflict and neither value is used; a gap is filled unreviewed", () => {
  // A record that leaves the board's M.2 slots and SATA ports unknown.
  const partial = registryRow({
    model_specs: {
      socket: "AM5",
      form_factor: "Micro-ATX",
      ram_generation: "DDR5",
      memory_slots: 2,
      max_memory_gb: 96,
    },
  });
  const part = resolveShopifyComponent(
    boardProduct({ socket: "AM4", sata_ports: "4", m2_slots: "banana" }),
    "Motherboard",
    { registrySpecs: lookup(partial) },
  )!;
  assertEquals(part.specs.socket, undefined);
  assert(part.specs.specProblems?.some((p: any) => p.kind === "conflict" && p.field === "socket"));
  // Unknown in the registry, stated by Shopify: used, but only as a supplier's statement.
  assertEquals(part.specs.sataPortCount, 4);
  assertEquals(part.specs.fieldSources?.sataPortCount, "supplier_provided");
  assert(part.specs.unreviewedSpecs?.includes("SATA ports"));
  // Shopify's unreadable m2_slots matters, because the registry doesn't state it.
  assert(part.specs.specProblems?.some((p: any) => p.kind === "invalid" && p.field === "m2_slots"));
  assertEquals(part.isVerified, false);

  // Matching values add nothing; an unreadable Shopify value the registry states is left for the sync to replace.
  const agreeing = resolveShopifyComponent(
    boardProduct({ socket: "AM5", form_factor: "nonsense" }),
    "Motherboard",
    {
      registrySpecs: lookup(registryRow()),
    },
  )!;
  assertEquals(agreeing.specs.specProblems, undefined);
  assertEquals(agreeing.isVerified, true);
  // The registry's "No" BIOS note contradicted by Shopify's "Yes".
  const bios = resolveShopifyComponent(
    boardProduct({ bios_update_required: "true" }),
    "Motherboard",
    {
      registrySpecs: lookup(
        registryRow({
          model_specs: { ...(registryRow().model_specs as object), bios_update_required: false },
        }),
      ),
    },
  )!;
  assert(bios.specs.specProblems?.some((p: any) => p.kind === "conflict"));
});

Deno.test("S4B-12: a record filed under another category is never used, and the part goes to review", () => {
  const part = resolveShopifyComponent(boardProduct(), "Motherboard", {
    registrySpecs: lookup(registryRow({ category_id: "GPU", model_specs: { tdp_watts: 200 } })),
  })!;
  assertEquals(part.specs.socket, undefined);
  assertEquals(part.specs.specProblems?.[0].kind, "conflict");
  assertEquals(part.specs.specProblems?.[0].field, "hardware_registry");
  assertEquals(part.isVerified, false);
});

Deno.test("S4B-13: an unlinked listing resolves exactly as it did before 4B", () => {
  const product = {
    ...boardProduct({ socket: "AM5", form_factor: "ATX" }),
    name: "MSI B650M Test Board",
  };
  const strip = (part: any) => ({ ...part, retrievedAt: "" });
  const before = strip(resolveShopifyComponent(product, "Motherboard", {}));
  const withOtherLinks = strip(
    resolveShopifyComponent(product, "Motherboard", {
      registrySpecs: lookup(registryRow({ shopify_product_id: "gid://shopify/Product/1" })),
    }),
  );
  assertEquals(withOtherLinks, before);
});

// ── 4B-5: the quotation server ─────────────────────────────────────────────────────────────────────────

const V = (n: number) => `gid://shopify/ProductVariant/93000000${n}`;
const P = (n: number) => `gid://shopify/Product/94000000${n}`;
const SLOTS = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"] as const;
const PRICE = 5000;

/** Shopify's product per slot: the helper's reviewed AM4 and DDR4 values, except the board, which states nothing. */
const productFor = (slot: string, index: number, boardValues: Record<string, string> = {}) => ({
  ...(slot === "Motherboard"
    ? { ...storefrontProduct(slot, "Test Board B1"), metafields: specMetafields(boardValues) }
    : storefrontProduct(slot, `IT-HUB Test ${slot} X1`, verifiedValues(slot))),
  id: P(index),
  category: { name: SLOT_CATEGORY[slot] },
});

const BOARD_ROW = (overrides: Record<string, unknown> = {}) =>
  registryRow({
    shopify_product_id: P(1),
    model_specs: {
      socket: "AM4",
      form_factor: "Micro-ATX",
      ram_generation: "DDR4",
      memory_slots: 4,
      max_memory_gb: 128,
      m2_slots: 2,
      sata_ports: 4,
    },
    ...overrides,
  });

async function quote(options: {
  registry?: Record<string, unknown>[];
  registryError?: boolean;
  boardValues?: Record<string, string>;
  browserBoardSpecs?: Record<string, unknown>;
}) {
  const db = quotationClient({
    userId: "00000000-0000-0000-0000-0000000004b0",
    registry: options.registry,
    registryError: options.registryError,
  });
  const parts: Record<string, unknown> = {};
  SLOTS.forEach((slot, index) => {
    parts[slot] = {
      slot,
      variantId: V(index),
      title: slot,
      price: PRICE,
      quantity: 1,
      ...(slot === "Motherboard" && options.browserBoardSpecs
        ? { specs: options.browserBoardSpecs }
        : {}),
    };
  });
  const shopifyFetch = async (_query: string, vars: { ids: string[] }) => ({
    data: {
      nodes: vars.ids.map((id) => {
        const index = SLOTS.findIndex((_, i) => V(i) === id);
        return {
          id,
          title: "Default Title",
          price: { amount: `${PRICE}.00`, currencyCode: "INR" },
          availableForSale: true,
          currentlyNotInStock: false,
          product: productFor(SLOTS[index], index, options.boardValues),
        };
      }),
    },
  });
  const res = await handleQuotationVerification(
    new Request("http://localhost/verify-and-submit-pc-quotation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer s4b-token" },
      body: JSON.stringify({
        buildName: "S4B",
        estimatedPrice: PRICE * SLOTS.length,
        compatibility: { status: "compatible" },
        customerInfo: {},
        parts,
      }),
    }),
    { supabaseClient: db.client as any, shopifyFetch },
  );
  return { status: res.status, body: await res.json(), db };
}

const fieldOf = (record: any, name: string) =>
  record.fields.find((entry: any) => entry.field === name);

Deno.test("S4B-14: the server reads the registry itself and records the model, revision and each value's origin", async () => {
  const { status, db } = await quote({ registry: [BOARD_ROW()] });
  assertEquals(status, 200);
  assertEquals(db.calls.registry.length, 1);
  assertEquals(
    db.calls.registry[0].p_variant_ids,
    SLOTS.map((_, i) => V(i)),
  );
  assert(db.calls.registry[0].p_product_ids.includes(P(1)));
  const stored = db.inserted[0];
  const board = stored.parts.Motherboard.serverSpecs;
  assertEquals(board.hardwareRecord, {
    modelId: "00000000-0000-4000-8000-00000000a001",
    linkId: "00000000-0000-4000-8000-00000000b001",
    specRevision: 3,
    overrideRevision: 0,
    sources: {
      socket: "model",
      form_factor: "model",
      ram_generation: "model",
      memory_slots: "model",
      max_memory_gb: "model",
      m2_slots: "model",
      sata_ports: "model",
    },
  });
  assertEquals(fieldOf(board, "socket").origin, "hardware_registry");
  assertEquals(fieldOf(board, "socket").status, "verified");
  assertEquals(board.status, "verified");
  assertEquals(stored.technician_review_required, false);
});

Deno.test("S4B-15: without its registry record the same board states nothing, so the server can't verify it", async () => {
  const { db } = await quote({ registry: [] });
  const board = db.inserted[0].parts.Motherboard.serverSpecs;
  assertNotEquals(board.status, "verified");
  assertEquals(board.hardwareRecord, undefined);
});

Deno.test("S4B-16: Shopify contradicting the registry sends the quotation to a technician", async () => {
  const { db } = await quote({ registry: [BOARD_ROW()], boardValues: { socket: "AM5" } });
  const stored = db.inserted[0];
  assertEquals(stored.parts.Motherboard.serverSpecs.status, "problem");
  assertEquals(stored.technician_review_required, true);
});

Deno.test("S4B-17: if the registry can't be read, no part is resolved without it and a technician reviews", async () => {
  const { status, db } = await quote({ registry: [BOARD_ROW()], registryError: true });
  assertEquals(status, 200);
  const stored = db.inserted[0];
  for (const [slot, part] of Object.entries(stored.parts) as [string, any][]) {
    if (part.owned) continue;
    assertEquals(
      part.serverSpecs,
      unresolvedSpecRecord("registry_unavailable", part.variantId),
      slot,
    );
  }
  assertEquals(stored.technician_review_required, true);
  // A malformed row is treated the same way: never partly trusted.
  const malformed = await quote({ registry: [{ ...BOARD_ROW(), spec_revision: "3" }] });
  assertEquals(
    malformed.db.inserted[0].parts.Motherboard.serverSpecs.reason,
    "registry_unavailable",
  );
});

Deno.test("S4B-18: the browser's values never change what the registry resolves", async () => {
  const honest = await quote({ registry: [BOARD_ROW()] });
  const tampered = await quote({
    registry: [BOARD_ROW()],
    browserBoardSpecs: {
      socket: "LGA1700",
      formFactor: "ATX",
      provenance: "manufacturer_verified",
    },
  });
  const a = honest.db.inserted[0].parts.Motherboard.serverSpecs;
  const b = { ...tampered.db.inserted[0].parts.Motherboard.serverSpecs };
  assert(b.browserDifferences?.some((d: any) => d.field === "socket" && d.server === "AM4"));
  delete b.browserDifferences;
  assertEquals(b, a);
  assertEquals(
    tampered.db.inserted[0].technician_review_required,
    honest.db.inserted[0].technician_review_required,
  );
});

Deno.test("S4B-19: a record of another category linked to the board is refused as evidence: review", async () => {
  const { db } = await quote({
    registry: [BOARD_ROW({ category_id: "GPU", model_specs: { tdp_watts: 200 } })],
  });
  const stored = db.inserted[0];
  assertEquals(stored.parts.Motherboard.serverSpecs.status, "problem");
  assertEquals(stored.technician_review_required, true);
});

Deno.test("S4B-20: the Staff Portal's copy of the field catalogue is the source, unchanged", () => {
  const source = Deno.readTextFileSync("src/lib/builder/hardware-spec.ts").replace(/\r\n/g, "\n");
  const copy = Deno.readTextFileSync("ITHUB_ADMIN/src/lib/hardware-spec.ts").replace(/\r\n/g, "\n");
  const header =
    "// GENERATED from src/lib/builder/hardware-spec.ts by scripts/sync-server-builder.cjs. Don't edit: change the source and\n" +
    "// run `node scripts/sync-server-builder.cjs`. The Staff Portal's copy, unchanged.\n\n";
  assertEquals(copy === header + source, true, "run node scripts/sync-server-builder.cjs");
});
