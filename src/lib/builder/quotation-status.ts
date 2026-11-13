// src/lib/builder/quotation-status.ts
// What a customer sees about a quotation request they submitted (Stage 4S-4). The owner approved the status labels
// (D14) and the withdrawal wording (E7) on 11 November 2026. Internal notes and review decisions are never shown.

/** A submitted quotation, as the customer's saved build carries it. */
export interface QuotationState {
  referenceId: string;
  /** The database status: New, Contacted, Quoted, Closed, Archived or Withdrawn. */
  status: string;
  /** Sent back when the customer withdraws, so a change made meanwhile isn't overwritten. */
  version: number;
}

/** D14. */
export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  New: "Submitted",
  Contacted: "We have contacted you",
  Quoted: "Quotation provided",
  Closed: "Completed",
  Archived: "Closed by IT HUB",
  Withdrawn: "Withdrawn",
};

export const customerStatusLabel = (status: string): string =>
  QUOTATION_STATUS_LABELS[status] ?? "Submitted";

/** D7: a request can be withdrawn while IT HUB is still working on it. */
export const WITHDRAWABLE_STATUSES: readonly string[] = ["New", "Contacted", "Quoted"];

export const canWithdraw = (quotation?: QuotationState | null): boolean =>
  Boolean(quotation && WITHDRAWABLE_STATUSES.includes(quotation.status));

/** E7. */
export const WITHDRAW_BUTTON = "Withdraw request";
export const WITHDRAW_CONFIRMATION =
  "Withdraw this quotation request? IT HUB will stop working on it. This can't be undone.";
export const WITHDRAW_REASON_LABEL = "Reason (optional)";

/** Messages after a withdrawal attempt. */
export const WITHDRAWN_MESSAGE = "Your quotation request has been withdrawn.";
export const STALE_VERSION_MESSAGE =
  "This quotation was changed by someone else. Reload and try again.";
export const CANNOT_WITHDRAW_MESSAGE = "This quotation request can no longer be withdrawn.";
export const WITHDRAW_FAILED_MESSAGE = "We couldn't withdraw the request. Please try again.";

// ── Keeping the browser's copy current (owner decision F2, after Stage 4S-6) ─────────────────────────────────
// The browser's copy of a quotation's status and version is for display only. The server checks ownership, status
// and version on every withdrawal, so a wrong copy can never withdraw anything; it can only be refused. These keep
// the copy current so the customer sees what IT HUB has done, and can withdraw while that's still possible.

/** The database's current status and version for each of the customer's quotation requests, by build id. */
export type QuotationStates = ReadonlyMap<string, QuotationState>;

/**
 * The customer's builds with each held quotation replaced by the database's, whatever the browser held (a higher
 * version included). Builds the database didn't answer for are left as they are. The same array comes back when
 * nothing changed.
 */
export function applyQuotationStates<T extends { id: string; quotation?: QuotationState }>(
  builds: T[],
  states: QuotationStates,
): T[] {
  let changed = false;
  const next = builds.map((build) => {
    const latest = states.get(build.id);
    if (!latest) return build;
    const held = build.quotation;
    if (
      held &&
      held.status === latest.status &&
      held.version === latest.version &&
      held.referenceId === latest.referenceId
    ) {
      return build;
    }
    changed = true;
    return { ...build, quotation: { ...latest } };
  });
  return changed ? next : builds;
}

/** Why a withdrawal attempt didn't succeed, as `withdrawQuotationRequest` reports it. */
export type WithdrawFailure = "stale_version" | "invalid_transition" | "not_found" | "failed";

/**
 * What the customer is told after a refused withdrawal, once the latest state has been read again (`latest`,
 * undefined if it couldn't be), and whether the withdrawal stays open to try again. Only approved messages (E7).
 */
export function withdrawFailureOutcome(
  code: WithdrawFailure,
  latest?: QuotationState | null,
): { message: string; keepOpen: boolean } {
  if (code === "failed") return { message: WITHDRAW_FAILED_MESSAGE, keepOpen: true };
  if (code === "stale_version") {
    // Changed meanwhile: if it can still be withdrawn, the customer now sees the new status and may try again.
    if (!latest || canWithdraw(latest)) return { message: STALE_VERSION_MESSAGE, keepOpen: true };
    return { message: CANNOT_WITHDRAW_MESSAGE, keepOpen: false };
  }
  return { message: CANNOT_WITHDRAW_MESSAGE, keepOpen: false };
}
