// IT HUB — Unified Ticket Reference System Helpers
// D:\mario\IT HUB\ITHUB_WEB\src\lib\ticketReference.ts

export const TICKET_REFERENCE_PREFIX = "ITH-SER-";
export const TICKET_REFERENCE_REGEX = /^ITH-SER-[0-9A-Z]{8}$/;

/**
 * Validates whether a given string is a valid IT HUB service ticket reference:
 * Must start with "ITH-SER-" followed by exactly 8 uppercase alphanumeric characters.
 * Example: "ITH-SER-C327B978"
 */
export function isValidTicketReference(ref?: string | null): boolean {
  if (!ref || typeof ref !== "string") return false;
  return TICKET_REFERENCE_REGEX.test(ref.trim());
}

/**
 * Generates a collision-resistant 8-character uppercase alphanumeric reference.
 * Format: ITH-SER-XXXXXXXX
 */
export function generateRandomTicketReference(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 8; i++) {
      result += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return `${TICKET_REFERENCE_PREFIX}${result}`;
}

/**
 * Generates or formats a stable ticket reference from an existing reference, UUID, or ID string.
 * If already a valid reference, returns it as-is (uppercased).
 * If a UUID, extracts the 8-character uppercase hex prefix (e.g. c327b978-... -> ITH-SER-C327B978).
 */
export function formatTicketReference(idOrRef?: string | null): string {
  if (!idOrRef || typeof idOrRef !== "string") return "";
  const trimmed = idOrRef.trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();

  // If already starts with prefix
  if (upper.startsWith(TICKET_REFERENCE_PREFIX)) {
    const code = upper.substring(TICKET_REFERENCE_PREFIX.length).trim();
    if (code.length === 8 && /^[0-9A-Z]{8}$/.test(code)) {
      return `${TICKET_REFERENCE_PREFIX}${code}`;
    }
  }

  // If standard UUID or alphanumeric ID, extract first 8 alphanumeric characters
  const clean = upper.replace(/[^0-9A-Z]/g, "");
  if (clean.length >= 8) {
    return `${TICKET_REFERENCE_PREFIX}${clean.slice(0, 8)}`;
  }

  return upper;
}

/**
 * Normalizes user/staff query inputs to standard reference format if possible.
 * e.g., "C327B978" -> "ITH-SER-C327B978"
 *       "ith-ser-c327b978" -> "ITH-SER-C327B978"
 *       UUID -> "ITH-SER-C327B978"
 */
export function normalizeTicketReference(input?: string | null): string {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();

  // If 8-character code alone
  if (/^[0-9A-Z]{8}$/.test(upper)) {
    return `${TICKET_REFERENCE_PREFIX}${upper}`;
  }

  // If prefixed
  if (upper.startsWith(TICKET_REFERENCE_PREFIX)) {
    const code = upper.substring(TICKET_REFERENCE_PREFIX.length).trim();
    if (/^[0-9A-Z]{8}$/.test(code)) {
      return `${TICKET_REFERENCE_PREFIX}${code}`;
    }
  }

  // If UUID
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(trimmed)) {
    return formatTicketReference(trimmed);
  }

  return formatTicketReference(trimmed);
}

export const TRACKER_PLACEHOLDER = "Enter your IT HUB service reference (e.g. ITH-SER-C327B978)";

/**
 * Derives the initial input text for the Service Tracker search field.
 * - Starts empty ("") when visiting the general /track-service page without an ID.
 * - Resolves to canonical "ITH-SER-XXXXXXXX" reference if a reference, shorthand code, or legacy UUID is passed in URL params.
 * - Never returns a raw UUID or random-looking value.
 */
export function getTrackerInitialInput(urlId?: string | null): string {
  if (!urlId || typeof urlId !== "string" || !urlId.trim()) {
    return "";
  }
  const clean = urlId.trim();
  return normalizeTicketReference(clean) || formatTicketReference(clean) || "";
}

/**
 * Normalizes user queries submitted in the service tracker search bar.
 * Safely strips whitespace, formats 8-character codes or UUIDs into standard "ITH-SER-XXXXXXXX",
 * and returns uppercase canonical reference for query execution.
 */
export function normalizeTrackerSearchQuery(query?: string | null): string {
  if (!query || typeof query !== "string") return "";
  const trimmed = query.trim();
  if (!trimmed) return "";
  return normalizeTicketReference(trimmed);
}

export interface ServiceRecordLike {
  id: string;
  ticket_reference?: string | null;
  ticketReference?: string | null;
  customer_name?: string;
  device?: string;
  problem?: string;
  status?: string;
}

/**
 * Evaluates whether a service ticket matches a staff or customer search query.
 * Supports reference lookup, partial reference code, UUID prefix/full, and customer/device/problem keywords.
 */
export function matchesTicketSearch(ticket: ServiceRecordLike, query: string): boolean {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();
  const qNorm = normalizeTicketReference(query).toLowerCase();

  // Match stored ticket_reference / ticketReference
  const refVal = ticket.ticket_reference || ticket.ticketReference;
  if (refVal) {
    const ref = refVal.toLowerCase();
    if (ref.includes(q) || ref.includes(qNorm)) return true;
    const refCode = refVal
      .replace(new RegExp(`^${TICKET_REFERENCE_PREFIX}`, "i"), "")
      .toLowerCase();
    if (refCode.includes(q)) return true;
  }

  // Match raw UUID or formatted ticket reference from ID
  if (ticket.id) {
    const id = ticket.id.toLowerCase();
    if (id.includes(q)) return true;
    const formattedId = formatTicketReference(ticket.id).toLowerCase();
    if (formattedId.includes(q) || formattedId.includes(qNorm)) return true;
    const code = formattedId
      .replace(new RegExp(`^${TICKET_REFERENCE_PREFIX}`, "i"), "")
      .toLowerCase();
    if (code.includes(q)) return true;
  }

  // Match customer name, device, problem
  if (ticket.customer_name && ticket.customer_name.toLowerCase().includes(q)) return true;
  if (ticket.device && ticket.device.toLowerCase().includes(q)) return true;
  if (ticket.problem && ticket.problem.toLowerCase().includes(q)) return true;
  if (ticket.status && ticket.status.toLowerCase().includes(q)) return true;

  return false;
}

/**
 * Safely backfills missing ticket references across an array of tickets while preserving original UUIDs.
 */
export function backfillTicketReferences<
  T extends { id: string; ticket_reference?: string | null; ticketReference?: string | null },
>(records: T[]): T[] {
  return records.map((rec) => {
    const existingRef = rec.ticket_reference || rec.ticketReference;
    if (existingRef && isValidTicketReference(existingRef)) {
      return { ...rec };
    }
    const generated = formatTicketReference(rec.id) || generateRandomTicketReference();
    return {
      ...rec,
      ticket_reference: generated,
      ticketReference: generated,
    };
  });
}

/**
 * Resolves a ticket record by either its modern ticket_reference, 8-char code, or legacy UUID.
 */
export function resolveTicketByReferenceOrId<
  T extends { id: string; ticket_reference?: string | null; ticketReference?: string | null },
>(records: T[], input?: string | null): T | null {
  if (!input || !input.trim()) return null;
  const clean = input.trim().toLowerCase();
  const normalized = normalizeTicketReference(input).toLowerCase();

  // 1. Direct match on ticket_reference (exact or normalized)
  for (const r of records) {
    const refVal = r.ticket_reference || r.ticketReference;
    if (refVal) {
      const refLower = refVal.toLowerCase();
      if (refLower === clean || refLower === normalized) return r;
      const refSuffix = refVal
        .replace(new RegExp(`^${TICKET_REFERENCE_PREFIX}`, "i"), "")
        .toLowerCase();
      if (refSuffix === clean) return r;
    }
  }

  // 2. Direct match on id (exact UUID or hex prefix)
  for (const r of records) {
    if (r.id) {
      const idLower = r.id.toLowerCase();
      if (idLower === clean) return r;
      const formatted = formatTicketReference(r.id).toLowerCase();
      if (formatted === clean || formatted === normalized) return r;
      if (idLower.startsWith(clean)) return r;
    }
  }

  return null;
}

/**
 * Generates an authoritative deep-link URL for ticket tracking using the unified reference.
 */
export function buildTicketTrackingUrl(
  baseUrl: string,
  ticket: { id: string; ticket_reference?: string | null; ticketReference?: string | null },
): string {
  const ref = ticket.ticket_reference || ticket.ticketReference || formatTicketReference(ticket.id);
  const url = new URL(baseUrl);
  url.searchParams.set("ticket", ref);
  return url.toString();
}
