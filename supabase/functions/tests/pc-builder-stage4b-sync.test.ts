// Stage 4B-4: Shopify specification sync. The pure rules (payload, validation against the pc_builder definitions,
// Shopify's answers, each listing's state) and the Edge Function end to end, with an in-memory store that follows the
// migration's job rules and a stand-in for Shopify's Admin API. The real database functions are proven separately by
// pc-builder-stage4b-registry-db.test.ts on the disposable stack.
//
// NO NETWORK, NO LIVE SHOPIFY: every Shopify answer here is made up. Every ID and value is test data.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const Sync = await import("../hardware-shopify-sync/sync.ts");
const { handleHardwareSync } = await import("../hardware-shopify-sync/index.ts");
const Spec = await import("../_shared/builder/hardware-spec.ts");
const { PC_BUILDER_METAFIELDS } = await import("../_shared/builder/spec-schema.ts");
type JobRow = import("../hardware-shopify-sync/sync.ts").JobRow;
type SyncStore = import("../hardware-shopify-sync/store.ts").SyncStore;

const PRODUCT = "gid://shopify/Product/9500000001";
const VARIANT = "gid://shopify/ProductVariant/9600000001";
const LINK = "00000000-0000-4000-8000-0000000c0001";
const MODEL = "00000000-0000-4000-8000-0000000d0001";
const STAFF = { userId: "00000000-0000-4000-8000-0000000e0001", role: "quotation_staff" as const };

/** The mappings the migration seeds, all switched on. */
const MAPPINGS = Spec.HARDWARE_SPEC_FIELDS.filter((f: any) => f.metafieldKey).map(
  (f: any, i: number) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    category_id: f.category,
    field_key: f.key,
    namespace: "pc_builder",
    metafield_key: f.metafieldKey,
    metafield_type: PC_BUILDER_METAFIELDS.find((m: any) => m.key === f.metafieldKey)!.type,
    is_enabled: true,
  }),
);

const GPU_SPECS = {
  tdp_watts: 200,
  length_mm: 242,
  pcie_8pin_required: 1,
  pcie_16pin_required: 0,
  recommended_psu_watts: 650,
  vram_gb: 12,
  boost_clock_mhz: 2475,
};

const record = (overrides: Record<string, unknown> = {}) =>
  Spec.registryRecordFromRow({
    link_id: LINK,
    shopify_product_id: PRODUCT,
    shopify_variant_id: null,
    model_id: MODEL,
    category_id: "GPU",
    manufacturer: "Test Maker",
    model_name: "Test GPU G1",
    model_number: null,
    model_specs: GPU_SPECS,
    base_specs: null,
    overrides: {},
    spec_revision: 1,
    override_revision: 0,
    ...overrides,
  })!;

// ── Pure rules ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("S4B-SYNC-1: the payload holds only pc_builder keys the mappings name, encoded as Shopify types, sorted", () => {
  const plan = Sync.buildSyncPlan(record(), MAPPINGS);
  assertEquals(plan.problems, []);
  assertEquals(plan.metafields, [
    { namespace: "pc_builder", key: "gpu_length_mm", type: "number_integer", value: "242" },
    { namespace: "pc_builder", key: "pcie_16pin_required", type: "number_integer", value: "0" },
    { namespace: "pc_builder", key: "pcie_6plus2_required", type: "number_integer", value: "1" },
    { namespace: "pc_builder", key: "recommended_psu_watts", type: "number_integer", value: "650" },
    { namespace: "pc_builder", key: "watts", type: "number_integer", value: "200" },
  ]);
  // Registry-only values (no mapping) and mapped-but-unknown values are listed, never written.
  assert(plan.notSynced.some((n: any) => n.field === "vram_gb" && n.reason === "no_mapping"));
  assert(
    plan.notSynced.some(
      (n: any) => n.field === "pcie_16pin_adapter_8pin_count" && n.reason === "unknown",
    ),
  );
  // Lists and booleans.
  const cpu = Sync.buildSyncPlan(
    record({
      category_id: "CPU",
      model_specs: {
        socket: "AM5",
        tdp_watts: 65,
        integrated_graphics: true,
        includes_cooler: false,
        memory_support: ["DDR5"],
      },
    }),
    MAPPINGS,
  );
  assertEquals(cpu.problems, []);
  assert(
    cpu.metafields.some(
      (m: any) => m.key === "supported_ram_generations" && m.value === '["DDR5"]',
    ),
  );
  assert(cpu.metafields.some((m: any) => m.key === "includes_cooler" && m.value === "false"));
  assert(cpu.metafields.every((m: any) => m.namespace === "pc_builder"));
});

Deno.test("S4B-SYNC-2: an incomplete or invalid specification, or a mapping that doesn't fit its definition, blocks the sync", () => {
  const incomplete = Sync.buildSyncPlan(record({ model_specs: { length_mm: 242 } }), MAPPINGS);
  assert(
    incomplete.problems.some((p: any) => p.code === "missing_required" && p.field === "tdp_watts"),
  );
  const invalid = Sync.buildSyncPlan(
    record({ model_specs: { ...GPU_SPECS, length_mm: 9999 } }),
    MAPPINGS,
  );
  assert(invalid.problems.some((p: any) => p.code === "invalid_value" && p.field === "length_mm"));
  const wrongType = MAPPINGS.map((m: any) =>
    m.metafield_key === "watts" ? { ...m, metafield_type: "single_line_text_field" } : m,
  );
  assert(
    Sync.buildSyncPlan(record(), wrongType).problems.some((p: any) => p.code === "mapping_invalid"),
  );
  const otherNamespace = MAPPINGS.map((m: any) =>
    m.metafield_key === "watts" ? { ...m, namespace: "custom" } : m,
  );
  assert(
    Sync.buildSyncPlan(record(), otherNamespace).problems.some(
      (p: any) => p.code === "mapping_invalid",
    ),
  );
  const reviewKey = MAPPINGS.map((m: any) =>
    m.metafield_key === "watts"
      ? { ...m, metafield_key: "spec_review_status", metafield_type: "single_line_text_field" }
      : m,
  );
  assert(
    Sync.buildSyncPlan(record(), reviewKey).problems.some((p: any) => p.code === "mapping_invalid"),
  );
  // A switched-off mapping isn't written, and isn't a problem.
  const off = MAPPINGS.map((m: any) =>
    m.metafield_key === "watts" ? { ...m, is_enabled: false } : m,
  );
  const plan = Sync.buildSyncPlan(record(), off);
  assertEquals(plan.problems, []);
  assert(!plan.metafields.some((m: any) => m.key === "watts"));
});

Deno.test("S4B-SYNC-3: Shopify's answers: throttling and outages retry; refusals fail; only a confirmed write is synced", () => {
  const sent = Sync.buildSyncPlan(record(), MAPPINGS).metafields;
  const ok = (metafields = sent) => ({
    status: 200,
    body: { data: { metafieldsSet: { metafields, userErrors: [] } } },
  });
  assertEquals(Sync.classifyMetafieldsSet(ok(), sent, 1).outcome, "synced");
  const throttled = Sync.classifyMetafieldsSet(
    { status: 429, retryAfter: "7", body: null },
    sent,
    1,
  );
  assertEquals(throttled.outcome, "retry_pending");
  assertEquals((throttled as any).retryAfterSeconds, 7);
  assertEquals(
    Sync.classifyMetafieldsSet({ status: 502, body: null }, sent, 2).outcome,
    "retry_pending",
  );
  assertEquals(
    Sync.classifyMetafieldsSet(
      { status: 200, body: { errors: [{ message: "x", extensions: { code: "THROTTLED" } }] } },
      sent,
      1,
    ).outcome,
    "retry_pending",
  );
  assertEquals(Sync.classifyMetafieldsSet({ status: 401, body: null }, sent, 1).outcome, "failed");
  const rejected = Sync.classifyMetafieldsSet(
    {
      status: 200,
      body: {
        data: {
          metafieldsSet: {
            metafields: [],
            userErrors: [{ field: ["metafields", "0", "value"], message: "bad" }],
          },
        },
      },
    },
    sent,
    1,
  );
  assertEquals(rejected.outcome, "failed");
  assertEquals((rejected as any).error.code, "shopify_rejected_values");
  assertEquals(Sync.classifyMetafieldsSet(ok(sent.slice(1)), sent, 1).outcome, "failed");
  assertEquals(Sync.backoffSeconds(1), 30);
  assertEquals(Sync.backoffSeconds(3), 120);
  assertEquals(Sync.backoffSeconds(20), 900);
});

Deno.test("S4B-SYNC-4: a variant link writes to its product only when that is the product's one variant", () => {
  const one = { variants: { nodes: [{ id: VARIANT }] } };
  const two = { variants: { nodes: [{ id: VARIANT }, { id: "gid://shopify/ProductVariant/2" }] } };
  assertEquals(Sync.variantDestinationProblem(one, VARIANT), undefined);
  assertEquals(Sync.variantDestinationProblem(two, VARIANT)?.code, "variant_specific_unsupported");
  assertEquals(
    Sync.variantDestinationProblem(one, "gid://shopify/ProductVariant/3")?.code,
    "variant_not_on_product",
  );
  assertEquals(Sync.variantDestinationProblem(null, null)?.code, "product_not_found");
  assertEquals(Sync.variantDestinationProblem(two, null), undefined);
  const a = { id: "a", model_id: "m", shopify_product_id: PRODUCT, shopify_variant_id: null };
  const b = { id: "b", model_id: "n", shopify_product_id: PRODUCT, shopify_variant_id: VARIANT };
  assertEquals(Sync.sharedProductProblem(a, [a]), undefined);
  assertEquals(Sync.sharedProductProblem(a, [a, b])?.code, "shared_product");
});

Deno.test("S4B-SYNC-5: a listing's state follows its latest job; a change after a sync makes it Not Synced again", () => {
  const job = (status: string, hash: string, created: string) =>
    ({ status, payload_hash: hash, created_at: created }) as unknown as JobRow;
  assertEquals(Sync.listingState([], "h1"), "not_synced");
  assertEquals(Sync.listingState([job("synced", "h1", "1")], "h1"), "synced");
  assertEquals(Sync.listingState([job("synced", "h1", "1")], "h2"), "not_synced");
  assertEquals(
    Sync.listingState([job("synced", "h1", "1"), job("failed", "h1", "2")], "h1"),
    "failed",
  );
  assertEquals(
    Sync.listingState([job("failed", "h1", "1"), job("queued", "h1", "2")], "h1"),
    "queued",
  );
  assertEquals(Sync.listingState([job("retry_pending", "h1", "1")], "h1"), "retry_pending");
  assertEquals(Sync.listingState([job("superseded", "h1", "1")], "h1"), "not_synced");
});

// ── The Edge Function ──────────────────────────────────────────────────────────────────────────────────

/** An in-memory store following hardware_sync_enqueue, _claim, _finish and _retry. */
function memoryStore(initial: { record?: any; variant?: string | null } = {}) {
  let current = initial.record ?? record();
  const link = {
    id: LINK,
    model_id: MODEL,
    shopify_product_id: PRODUCT,
    shopify_variant_id: initial.variant ?? null,
    product_title: "Test GPU listing",
    variant_title: null,
    model_name: "Test GPU G1",
    model_number: null,
    category_id: "GPU",
    manufacturer: "Test Maker",
  };
  const jobs: JobRow[] = [];
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 10, 12, 0, 0, clock++)).toISOString();
  const store: SyncStore & { jobs_: JobRow[]; set: (r: any) => void } = {
    jobs_: jobs,
    set: (r) => (current = r),
    async registry() {
      return [{ ...current, variantId: link.shopify_variant_id }];
    },
    async links() {
      return [link];
    },
    async mappings() {
      return MAPPINGS;
    },
    async jobs({ linkIds, ids, dueOnly, limit }) {
      return jobs
        .filter((j) => !linkIds || linkIds.includes(j.link_id))
        .filter((j) => !ids || ids.includes(j.id))
        .filter((j) => !dueOnly || j.status === "queued" || j.status === "retry_pending")
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit);
    },
    async enqueue(args) {
      if (
        args.specRevision !== current.specRevision ||
        args.overrideRevision !== current.overrideRevision
      ) {
        return { error: { message: "stale_revision" } };
      }
      const waiting = jobs.find(
        (j) => j.link_id === args.linkId && ["queued", "retry_pending"].includes(j.status),
      );
      if (waiting && waiting.payload_hash === args.payloadHash) return { job: waiting };
      if (waiting) waiting.status = "superseded";
      const job = {
        id: crypto.randomUUID(),
        link_id: args.linkId,
        model_id: MODEL,
        status: "queued",
        payload: args.payload,
        payload_hash: args.payloadHash,
        spec_revision: args.specRevision,
        override_revision: args.overrideRevision,
        shopify_product_id: PRODUCT,
        shopify_variant_id: link.shopify_variant_id,
        attempts: 0,
        max_attempts: 5,
        next_attempt_at: null,
        last_error: null,
        created_at: now(),
        finished_at: null,
        requested_by: args.actor,
        requested_role: args.role,
      } as JobRow;
      jobs.push(job);
      return { job };
    },
    async claim(id) {
      const job = jobs.find((j) => j.id === id);
      if (!job || !["queued", "retry_pending"].includes(job.status)) return { job: null };
      if (
        job.spec_revision !== current.specRevision ||
        job.override_revision !== current.overrideRevision
      ) {
        job.status = "superseded";
        return { job: null };
      }
      job.status = "syncing";
      job.attempts++;
      return { job: { ...job } };
    },
    async finish({ jobId, outcome, error }) {
      const job = jobs.find((j) => j.id === jobId)!;
      job.status =
        outcome === "retry_pending" && job.attempts >= job.max_attempts ? "failed" : outcome;
      job.last_error = (error as any) ?? null;
      return { job: { ...job } };
    },
    async retry({ jobId }) {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return { error: { message: "job_not_found" } };
      if (!["failed", "retry_pending"].includes(job.status))
        return { error: { message: "job_not_retryable" } };
      job.status = "queued";
      return { job: { ...job } };
    },
  };
  return store;
}

/** Shopify's Admin API stand-in: records each call; `answers` decides the metafieldsSet reply. */
function shopify(options: { variants?: string[]; answer?: (call: number) => any } = {}) {
  const calls: { query: string; variables: any }[] = [];
  let sets = 0;
  const admin = async (query: string, variables: any) => {
    calls.push({ query, variables });
    if (query.includes("ItHubSyncTarget")) {
      return {
        status: 200,
        body: {
          data: {
            product: {
              id: PRODUCT,
              variants: { nodes: (options.variants ?? [VARIANT]).map((id) => ({ id })) },
              metafields: { nodes: [{ key: "watts", value: "180", type: "number_integer" }] },
            },
          },
        },
      };
    }
    sets++;
    if (options.answer) return options.answer(sets);
    return {
      status: 200,
      body: {
        data: {
          metafieldsSet: {
            metafields: variables.metafields.map((m: any) => ({
              ...m,
              updatedAt: "2026-11-12T00:00:00Z",
            })),
            userErrors: [],
          },
        },
      },
    };
  };
  return { admin, calls, sets: () => sets };
}

const WRITES = {
  SHOPIFY_SYNC_WRITES: "enabled",
  APP_ENV: "development",
  PORTAL_ORIGIN: "",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

async function call(
  body: Record<string, unknown>,
  deps: {
    store: any;
    shopifyAdmin?: any;
    env?: Record<string, string | undefined>;
    staff?: any;
    token?: string;
    origin?: string;
    fetchImpl?: typeof fetch;
  },
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (deps.token !== "") headers.Authorization = `Bearer ${deps.token ?? "staff-session"}`;
  if (deps.origin) headers.Origin = deps.origin;
  const res = await handleHardwareSync(
    new Request("http://localhost/hardware-shopify-sync", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    {
      store: deps.store,
      shopifyAdmin: deps.shopifyAdmin,
      fetchImpl: deps.fetchImpl,
      env: deps.env ?? WRITES,
      verifyStaff: async () => (deps.staff === undefined ? STAFF : deps.staff),
    },
  );
  return { status: res.status, body: await res.json(), headers: res.headers };
}

Deno.test("S4B-SYNC-6: only a signed-in Admin or Staff session may call it; the service key is refused as a session", async () => {
  const store = memoryStore();
  assertEquals((await call({ action: "overview" }, { store, token: "" })).status, 401);
  assertEquals((await call({ action: "overview" }, { store, token: "service-key" })).status, 401);
  assertEquals((await call({ action: "overview" }, { store, staff: null })).status, 403);
  assertEquals((await call({ action: "overview" }, { store })).status, 200);
  // The portal's dev origin is allowed in development; the storefront's isn't.
  assertEquals(
    (await call({ action: "overview" }, { store, origin: "http://localhost:5174" })).status,
    200,
  );
  assertEquals(
    (await call({ action: "overview" }, { store, origin: "http://localhost:8443" })).status,
    403,
  );
  assertEquals((await call({ action: "nope" }, { store })).status, 400);
  assertEquals((await call({ action: "enqueue", linkIds: ["not-a-uuid"] }, { store })).status, 400);
});

Deno.test("S4B-SYNC-7: queue and run: Shopify receives exactly the pc_builder payload for the product, and the job is synced", async () => {
  const store = memoryStore();
  const shop = shopify();
  const res = await call(
    { action: "enqueue", linkIds: [LINK] },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(res.status, 200);
  assertEquals(res.body.results[0].status, "queued");
  assertEquals(res.body.run[0].status, "synced");
  const set = shop.calls.find((c) => c.query.includes("metafieldsSet"))!;
  assertEquals(
    set.variables.metafields,
    Sync.buildSyncPlan(record(), MAPPINGS).metafields.map((m: any) => ({ ownerId: PRODUCT, ...m })),
  );
  assert(set.variables.metafields.every((m: any) => m.namespace === "pc_builder"));
  // Synced, so a second request without force writes nothing.
  const again = await call(
    { action: "enqueue", linkIds: [LINK] },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(again.body.results[0].status, "already_synced");
  assertEquals(shop.sets(), 1);
  const overview = await call({ action: "overview" }, { store, shopifyAdmin: shop.admin });
  assertEquals(overview.body.listings[0].state, "synced");
  // A later change makes it Not Synced again.
  store.set(record({ model_specs: { ...GPU_SPECS, length_mm: 250 }, spec_revision: 2 }));
  assertEquals(
    (await call({ action: "overview" }, { store, shopifyAdmin: shop.admin })).body.listings[0]
      .state,
    "not_synced",
  );
});

Deno.test("S4B-SYNC-8: with writes switched off or no Admin credential, nothing reaches Shopify and the job fails with the reason", async () => {
  const store = memoryStore();
  const shop = shopify();
  const off = await call(
    { action: "enqueue", linkIds: [LINK] },
    { store, shopifyAdmin: shop.admin, env: { ...WRITES, SHOPIFY_SYNC_WRITES: undefined } },
  );
  assertEquals(off.body.run[0].status, "failed");
  assertEquals(off.body.run[0].error.code, "writes_disabled");
  assertEquals(shop.calls.length, 0);

  const bare = memoryStore();
  const none = await call(
    { action: "enqueue", linkIds: [LINK] },
    {
      store: bare,
      env: {
        ...WRITES,
        SHOPIFY_ADMIN_ACCESS_TOKEN: undefined,
        SHOPIFY_STORE_DOMAIN: undefined,
        VITE_SHOPIFY_STORE_DOMAIN: undefined,
      },
    },
  );
  assertEquals(none.body.run[0].error.code, "admin_not_configured");
});

Deno.test("S4B-SYNC-9: an incomplete specification is blocked before any job exists", async () => {
  const store = memoryStore({ record: record({ model_specs: { length_mm: 242 } }) });
  const shop = shopify();
  const res = await call(
    { action: "enqueue", linkIds: [LINK] },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(res.body.results[0].status, "blocked");
  assert(res.body.results[0].problems.some((p: any) => p.code === "missing_required"));
  assertEquals(store.jobs_.length, 0);
  assertEquals(shop.calls.length, 0);
});

Deno.test("S4B-SYNC-10: a job whose values changed after it was queued is superseded, never written", async () => {
  const store = memoryStore();
  const shop = shopify();
  // Queued directly, as an earlier request would have left it.
  const queued = await store.enqueue({
    linkId: LINK,
    specRevision: 1,
    overrideRevision: 0,
    payload: Sync.buildSyncPlan(record(), MAPPINGS).metafields,
    payloadHash: await Sync.payloadHash(PRODUCT, Sync.buildSyncPlan(record(), MAPPINGS).metafields),
    actor: STAFF.userId,
    role: STAFF.role,
  });
  // The model changes (a newer revision) before the job runs.
  store.set(record({ model_specs: { ...GPU_SPECS, length_mm: 250 }, spec_revision: 2 }));
  const run = await call(
    { action: "run", jobIds: [queued.job!.id] },
    { store, shopifyAdmin: shop.admin, env: WRITES },
  );
  assertEquals(run.body.run[0].status, "skipped");
  assertEquals(store.jobs_[0].status, "superseded");
  assertEquals(shop.sets(), 0);
});

Deno.test("S4B-SYNC-11: base-model changes that don't touch the model's revision still supersede a stale payload", async () => {
  const store = memoryStore({
    record: record({
      model_specs: { ...GPU_SPECS, recommended_psu_watts: undefined },
      base_specs: { recommended_psu_watts: 650 },
    }),
  });
  const plan = Sync.buildSyncPlan((await store.registry())![0], MAPPINGS);
  const queued = await store.enqueue({
    linkId: LINK,
    specRevision: 1,
    overrideRevision: 0,
    payload: plan.metafields,
    payloadHash: await Sync.payloadHash(PRODUCT, plan.metafields),
    actor: STAFF.userId,
    role: STAFF.role,
  });
  // The base model's value changes; the model's own revision doesn't.
  store.set(
    record({
      model_specs: { ...GPU_SPECS, recommended_psu_watts: undefined },
      base_specs: { recommended_psu_watts: 700 },
    }),
  );
  const shop = shopify();
  const run = await call(
    { action: "run", jobIds: [queued.job!.id] },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(run.body.run[0].status, "superseded");
  assertEquals(shop.sets(), 0);
});

Deno.test("S4B-SYNC-12: throttling schedules a retry; a staff retry runs it again and it syncs", async () => {
  const store = memoryStore();
  const shop = shopify({
    answer: (n) =>
      n === 1
        ? { status: 429, retryAfter: "2", body: null }
        : {
            status: 200,
            body: {
              data: {
                metafieldsSet: {
                  metafields: Sync.buildSyncPlan(record(), MAPPINGS).metafields,
                  userErrors: [],
                },
              },
            },
          },
  });
  const first = await call(
    { action: "enqueue", linkIds: [LINK] },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(first.body.run[0].status, "retry_pending");
  assertEquals(first.body.run[0].error.code, "throttled");
  const retried = await call(
    { action: "retry", jobId: first.body.results[0].jobId },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(retried.status, 200);
  assertEquals(retried.body.run[0].status, "synced");
  // A synced job can't be retried.
  const refused = await call(
    { action: "retry", jobId: first.body.results[0].jobId },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(refused.status, 409);
});

Deno.test("S4B-SYNC-13: a variant link on a multi-variant product is refused at Shopify's door, and nothing is written", async () => {
  const store = memoryStore({ variant: VARIANT });
  const shop = shopify({ variants: [VARIANT, "gid://shopify/ProductVariant/2"] });
  const res = await call(
    { action: "enqueue", linkIds: [LINK] },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(res.body.run[0].status, "failed");
  assertEquals(res.body.run[0].error.code, "variant_specific_unsupported");
  assertEquals(shop.sets(), 0);
});

Deno.test("S4B-SYNC-14: preview shows the plan beside Shopify's current pc_builder values, read-only", async () => {
  const store = memoryStore();
  const shop = shopify();
  const res = await call({ action: "preview", linkId: LINK }, { store, shopifyAdmin: shop.admin });
  assertEquals(res.status, 200);
  assertEquals(res.body.shopifyValues, [{ key: "watts", value: "180", type: "number_integer" }]);
  assertEquals(res.body.payload.length, 5);
  assertEquals(shop.sets(), 0);
  assert(shop.calls.every((c) => !c.query.includes("mutation")));
});

Deno.test("S4B-SYNC-15 (4B-6): a sync through a stand-in is recorded as a stand-in, never as a live Shopify write", async () => {
  const store = memoryStore();
  const finished: any[] = [];
  const original = store.finish;
  store.finish = async (args: any) => {
    finished.push(args);
    return original(args);
  };
  const shop = shopify();
  const res = await call(
    { action: "enqueue", linkIds: [LINK] },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(res.body.run[0].status, "synced");
  assertEquals(finished[0].response.mode, "stand_in");
  assertEquals(finished[0].response.shop, null);
  const overview = await call({ action: "overview" }, { store, shopifyAdmin: shop.admin });
  assertEquals(overview.body.writeMode, "stand_in");
  // With no credential at all there is no write mode, and nothing is written.
  const bare = await call(
    { action: "overview" },
    {
      store: memoryStore(),
      env: {
        ...WRITES,
        SHOPIFY_ADMIN_ACCESS_TOKEN: undefined,
        SHOPIFY_STORE_DOMAIN: undefined,
        VITE_SHOPIFY_STORE_DOMAIN: undefined,
      },
    },
  );
  assertEquals(bare.body.writeMode, null);
});

Deno.test("S4B-SYNC-16 (4B-6): oversized and malformed requests are refused before any work", async () => {
  const store = memoryStore();
  const shop = shopify();
  const big = await call(
    { action: "overview", padding: "x".repeat(25_000) },
    { store, shopifyAdmin: shop.admin },
  );
  assertEquals(big.status, 413);
  for (const body of [
    {},
    { action: 5 },
    { action: "enqueue" },
    { action: "enqueue", linkIds: [] },
    { action: "enqueue", linkIds: Array(51).fill(LINK) },
    { action: "retry", jobId: "x" },
    { action: "preview" },
    { action: "run", jobIds: ["nope"] },
  ]) {
    const res = await call(body, { store, shopifyAdmin: shop.admin });
    assertEquals(res.status, 400, JSON.stringify(body).slice(0, 60));
  }
  const res = await handleHardwareSync(
    new Request("http://localhost/hardware-shopify-sync", {
      method: "POST",
      headers: { Authorization: "Bearer staff" },
      body: "{not json",
    }),
    { store, shopifyAdmin: shop.admin, env: WRITES, verifyStaff: async () => STAFF },
  );
  assertEquals(res.status, 400);
  const get = await handleHardwareSync(
    new Request("http://localhost/hardware-shopify-sync", {
      method: "GET",
      headers: { Authorization: "Bearer staff" },
    }),
    { store, env: WRITES, verifyStaff: async () => STAFF },
  );
  assertEquals(get.status, 405);
  assertEquals(shop.calls.length, 0);
  assertEquals(store.jobs_.length, 0);
});

Deno.test("S4B-SYNC-17 (4B-6): a value its Shopify definition would refuse is never written, even through a valid mapping", () => {
  // Today every registry range sits inside its definition's (S4B-2), so this guard is defence in depth: a mapping of
  // the card's power (1–1000 W) onto the recommended-PSU metafield (100–2000 W) must refuse 50 W rather than send it.
  const narrow = MAPPINGS.filter((m: any) => m.metafield_key !== "recommended_psu_watts").map(
    (m: any) =>
      m.category_id === "GPU" && m.field_key === "tdp_watts"
        ? { ...m, metafield_key: "recommended_psu_watts" }
        : m,
  );
  const plan = Sync.buildSyncPlan(record({ model_specs: { ...GPU_SPECS, tdp_watts: 50 } }), narrow);
  assert(
    plan.problems.some((p: any) => p.code === "value_rejected" && p.field === "tdp_watts"),
    JSON.stringify(plan.problems),
  );
  assert(!plan.metafields.some((m: any) => m.key === "recommended_psu_watts"));
});

Deno.test("S4B-SYNC-18: with the Dev Dashboard app's credentials but writes switched off, a send never contacts Shopify", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  const env = {
    ...WRITES,
    SHOPIFY_SYNC_WRITES: undefined,
    SHOPIFY_ADMIN_ACCESS_TOKEN: undefined,
    SHOPIFY_STORE_DOMAIN: "synthetic-store.myshopify.com",
    SHOPIFY_ADMIN_CLIENT_ID: "synthetic-client-id",
    SHOPIFY_ADMIN_CLIENT_SECRET: "synthetic-client-secret",
  };
  const res = await call({ action: "enqueue", linkIds: [LINK] }, { store, env, fetchImpl });
  assertEquals(res.body.run[0].status, "failed");
  assertEquals(res.body.run[0].error.code, "writes_disabled");
  assertEquals(calls, [], "no token request, no query, no mutation");
  const overview = await call({ action: "overview" }, { store, env, fetchImpl });
  assertEquals(
    [overview.body.adminConfigured, overview.body.writesEnabled, overview.body.writeMode],
    [true, false, "live"],
  );
  assertEquals(calls, []);
});
