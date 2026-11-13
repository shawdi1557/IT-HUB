// src/lib/builder/quotation-refresh.ts
// Keeps the customer's copy of their quotation requests current (owner decision F2, after Stage 4S-6): read from the
// database when the builds are opened or revisited, after every withdrawal attempt, and whenever a withdrawal is
// refused as stale. Display only: the server decides every withdrawal on its own records.

import { loadQuotationStates } from "./persistence";
import {
  applyQuotationStates,
  type QuotationState,
  type QuotationStates,
} from "./quotation-status";

type Holder = { id: string; quotation?: QuotationState };
type Setter<B extends Holder> = (update: (previous: { builds: B[] }) => { builds?: B[] }) => void;

let issued = 0;

/**
 * Reads the latest states and applies them to the store's builds. Only the most recently started read is applied,
 * so an older answer arriving late can never undo a newer one (for example, one started just after a withdrawal).
 * Returns what was read, or null if it couldn't be.
 */
export async function refreshQuotationStates<B extends Holder>(
  set: Setter<B>,
  load: () => Promise<QuotationStates | null> = loadQuotationStates,
): Promise<QuotationStates | null> {
  const ticket = ++issued;
  const states = await load();
  if (states && ticket === issued) {
    set((previous) => {
      const builds = applyQuotationStates(previous.builds, states);
      return builds === previous.builds ? {} : { builds };
    });
  }
  return states;
}
