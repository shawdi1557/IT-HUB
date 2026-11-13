// Stage 4S-4 test helper: a stand-in for the database the quotation Edge Function talks to. Since 4S-4 the function
// reaches the database through two functions (migration 20261111000001), and since Stage 4B-5 reads the hardware
// registry through a third (20261112000001):
//   pc_quotation_guard(p_user_id, p_ip_key)          refuses staff and unverified accounts, and rate limits
//   create_pc_quotation(p_user_id, p_fingerprint, p_quotation)
//                                                    stores the quotation, or returns the same customer's identical
//                                                    request from the last two minutes
//   get_pc_builder_registry_specs(p_product_ids, p_variant_ids)
//                                                    the Hardware Specification Manager's records (none by default)
// This stand-in answers all three as the migrations define them, keeps the rows it stores, and refuses any direct table
// access, so a test fails if the function ever writes or reads a table itself. The real functions are proven by
// the database tests (pc-builder-stage4s-secure-db.test.ts). Made-up IDs, no network.

export interface QuoteRow extends Record<string, any> {
  id: string;
  user_id: string;
  created_at: string;
  reference_id: string | null;
  enquiry_status: string;
  request_fingerprint?: string | null;
}

export const TEST_PHONE = "919800000001";

/** The rows a test's quotations are stored in. Seed rows are kept as given. */
export function quotationStore(seed: QuoteRow[] = []) {
  return { rows: [...seed] as QuoteRow[], next: seed.length };
}

export interface QuotationClientOptions {
  userId?: string;
  /** The account's confirmed phone, as Supabase Auth returns it. */
  phone?: string | null;
  /** Sign-in fails. */
  authError?: boolean;
  /** The guard's answer. Default: allowed. */
  guard?: (args: { p_user_id: string; p_ip_key: string | null }) => unknown;
  /** The guard call itself fails (database unavailable). */
  guardError?: boolean;
  /** Storing fails. */
  createError?: boolean;
  store?: ReturnType<typeof quotationStore>;
  /** Also receives each stored row. */
  onInsert?: (row: QuoteRow) => void;
  /** Stage 4B-5: rows `get_pc_builder_registry_specs` returns. Default: none. */
  registry?: Record<string, unknown>[];
  /** Stage 4B-5: reading the registry fails. */
  registryError?: boolean;
}

export function quotationClient(options: QuotationClientOptions = {}) {
  const store = options.store ?? quotationStore();
  const userId = options.userId ?? "00000000-0000-0000-0000-0000000004s4";
  const calls = {
    guard: [] as { p_user_id: string; p_ip_key: string | null }[],
    create: [] as { p_user_id: string; p_fingerprint: string; p_quotation: Record<string, any> }[],
    tableAccess: [] as string[],
    registry: [] as { p_product_ids: string[]; p_variant_ids: string[] }[],
  };
  const inserted: QuoteRow[] = [];
  const client = {
    auth: {
      getUser: async () =>
        options.authError
          ? { data: { user: null }, error: new Error("invalid") }
          : {
              data: {
                user: {
                  id: userId,
                  ...(options.phone === null ? {} : { phone: options.phone ?? TEST_PHONE }),
                },
              },
              error: null,
            },
    },
    rpc: async (name: string, args: any) => {
      if (name === "pc_quotation_guard") {
        calls.guard.push(args);
        if (options.guardError) return { data: null, error: { message: "unavailable" } };
        return { data: options.guard ? options.guard(args) : { allowed: true }, error: null };
      }
      if (name === "create_pc_quotation") {
        calls.create.push(structuredClone(args));
        if (options.createError) return { data: null, error: { message: "insert failed" } };
        const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const earlier = store.rows
          .filter(
            (row) =>
              row.user_id === args.p_user_id &&
              row.request_fingerprint === args.p_fingerprint &&
              row.reference_id &&
              row.enquiry_status === "New" &&
              row.created_at >= since,
          )
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
        if (earlier) {
          return {
            data: {
              duplicate: true,
              id: earlier.id,
              reference_id: earlier.reference_id,
              estimated_price: earlier.estimated_price,
              authoritative_price: earlier.authoritative_price ?? null,
              technician_review_required: earlier.technician_review_required,
            },
            error: null,
          };
        }
        store.next++;
        const row: QuoteRow = {
          ...structuredClone(args.p_quotation),
          id: `test-quote-${store.next}`,
          user_id: args.p_user_id,
          reference_id: `ITH-PC-TEST-${String(store.next).padStart(6, "0")}`,
          enquiry_status: "New",
          version: 1,
          request_fingerprint: args.p_fingerprint,
          created_at: new Date().toISOString(),
        };
        store.rows.push(row);
        inserted.push(row);
        options.onInsert?.(row);
        return {
          data: { duplicate: false, id: row.id, reference_id: row.reference_id },
          error: null,
        };
      }
      // Stage 4B-5 (20261112000001): the registry layers for the listings asked about. Empty unless a test gives
      // some; `registryError` makes the read fail.
      if (name === "get_pc_builder_registry_specs") {
        calls.registry.push(structuredClone(args));
        if (options.registryError) return { data: null, error: { message: "unavailable" } };
        return { data: structuredClone(options.registry ?? []), error: null };
      }
      return { data: null, error: { message: `unexpected function ${name}` } };
    },
    from: (table: string) => {
      calls.tableAccess.push(table);
      throw new Error(`The quotation function must not touch ${table} directly.`);
    },
  };
  return { client, calls, inserted, store };
}
