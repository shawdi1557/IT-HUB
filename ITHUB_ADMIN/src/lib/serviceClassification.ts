// ITHUB_ADMIN/src/lib/serviceClassification.ts
// Three-Method Service Classification & Visual Metadata Architecture
// IT HUB — Kerala, India

/**
 * The three canonical service intake methods for IT HUB.
 */
export const CANONICAL_SERVICE_METHODS = {
  COURIER: "Courier to IT HUB",
  ONSITE: "On-site Technician Visit",
  WALK_IN: "Visit IT HUB",
} as const;

export type CanonicalServiceMethod =
  (typeof CANONICAL_SERVICE_METHODS)[keyof typeof CANONICAL_SERVICE_METHODS];

export interface ServiceMethodInfo {
  canonicalMethod: CanonicalServiceMethod;
  label: string;
  shortLabel: string;
  badgeClass: string;
  iconName: "Truck" | "Home" | "Store";
  description: string;
}

export interface ServiceMethodCounts {
  all: number;
  courier: number;
  onsite: number;
  walkIn: number;
}

/**
 * Returns the compact display label exclusively used for the Service Management ticket table and mobile card:
 * - "Courier to IT HUB" -> "Courier"
 * - "On-site Technician Visit" -> "On-site"
 * - "Visit IT HUB" -> "Visit IT HUB"
 * Preserves the underlying canonical method identifiers and database values intact.
 */
export function getServiceMethodCompactLabel(rawMethod?: string | null): string {
  const canonical = classifyServiceMethod(rawMethod);
  switch (canonical) {
    case CANONICAL_SERVICE_METHODS.COURIER:
      return "Courier";
    case CANONICAL_SERVICE_METHODS.ONSITE:
      return "On-site";
    case CANONICAL_SERVICE_METHODS.WALK_IN:
    default:
      return "Visit IT HUB";
  }
}

/**
 * Deterministically classifies any service method string (including historical,
 * schema check constraint, or UI variant aliases) into exactly one canonical method.
 */
export function classifyServiceMethod(rawMethod?: string | null): CanonicalServiceMethod {
  if (!rawMethod || typeof rawMethod !== "string") {
    return CANONICAL_SERVICE_METHODS.WALK_IN;
  }

  const normalized = rawMethod.trim().toLowerCase();

  if (normalized.includes("courier") || normalized.includes("pickup")) {
    return CANONICAL_SERVICE_METHODS.COURIER;
  }

  if (
    normalized.includes("on-site") ||
    normalized.includes("onsite") ||
    normalized.includes("doorstep")
  ) {
    return CANONICAL_SERVICE_METHODS.ONSITE;
  }

  // Covers "Visit IT HUB", "Direct Store Walk-In", "walk-in", etc.
  return CANONICAL_SERVICE_METHODS.WALK_IN;
}

/**
 * Returns canonical visual styling, icon identifier, and descriptive workflow label.
 */
export function getServiceMethodInfo(rawMethod?: string | null): ServiceMethodInfo {
  const canonical = classifyServiceMethod(rawMethod);

  switch (canonical) {
    case CANONICAL_SERVICE_METHODS.COURIER:
      return {
        canonicalMethod: CANONICAL_SERVICE_METHODS.COURIER,
        label: "Courier to IT HUB",
        shortLabel: "Courier",
        badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
        iconName: "Truck",
        description: "Track shipment, parcel consignment & incoming device receipt",
      };
    case CANONICAL_SERVICE_METHODS.ONSITE:
      return {
        canonicalMethod: CANONICAL_SERVICE_METHODS.ONSITE,
        label: "On-site Technician Visit",
        shortLabel: "On-site",
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
        iconName: "Home",
        description: "Technician assignment, doorstep dispatch & visit scheduling",
      };
    case CANONICAL_SERVICE_METHODS.WALK_IN:
    default:
      return {
        canonicalMethod: CANONICAL_SERVICE_METHODS.WALK_IN,
        label: "Visit IT HUB",
        shortLabel: "Visit IT HUB",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        iconName: "Store",
        description: "Customer arrival, direct store intake & workbench triage",
      };
  }
}

/**
 * Computes live counts across all three canonical service methods.
 */
export function calculateMethodCounts(
  tickets: Array<{ method?: string | null }>,
): ServiceMethodCounts {
  let courier = 0;
  let onsite = 0;
  let walkIn = 0;

  for (const t of tickets) {
    const canonical = classifyServiceMethod(t.method);
    if (canonical === CANONICAL_SERVICE_METHODS.COURIER) {
      courier++;
    } else if (canonical === CANONICAL_SERVICE_METHODS.ONSITE) {
      onsite++;
    } else {
      walkIn++;
    }
  }

  return {
    all: tickets.length,
    courier,
    onsite,
    walkIn,
  };
}

export interface TicketFilterCriteria {
  method?: "ALL" | CanonicalServiceMethod | string;
  category?: string;
  status?: string;
  search?: string;
}

/**
 * Filters a list of service tickets by method, category, status, and search query.
 */
export function filterTicketsByCriteria<T extends Record<string, any>>(
  tickets: T[],
  filters: TicketFilterCriteria,
): T[] {
  return tickets.filter((ticket) => {
    // 1. Method Filter
    if (filters.method && filters.method !== "ALL") {
      const canonical = classifyServiceMethod(ticket.method);
      const targetCanonical = classifyServiceMethod(filters.method);
      if (canonical !== targetCanonical) {
        return false;
      }
    }

    // 2. Status Filter
    if (filters.status && filters.status !== "ALL") {
      if (ticket.status !== filters.status) {
        return false;
      }
    }

    // 3. Category Filter
    if (filters.category && filters.category !== "ALL") {
      const dev = (ticket.device || "").toLowerCase();
      if (!dev.includes(filters.category.toLowerCase())) {
        return false;
      }
    }

    // 4. Search Filter
    if (filters.search && filters.search.trim()) {
      const query = filters.search.trim().toLowerCase();
      const searchable = [
        ticket.id,
        ticket.device,
        ticket.model,
        ticket.problem,
        ticket.customer_name,
        ticket.customer_phone,
        ticket.technician_name,
        ticket.inbound_courier_tracking_no,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!searchable.includes(query)) {
        return false;
      }
    }

    return true;
  });
}
