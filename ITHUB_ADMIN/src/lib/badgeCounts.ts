// ITHUB_ADMIN/src/lib/badgeCounts.ts
// Live Numerical Indicators for Staff Portal Sidebar & Navigation
// Realtime sync across Quotations, Services, Sell Requests, and Dashboard
// IT HUB — Kerala, India

import { supabase } from "./supabase";

export interface PortalBadgeCounts {
  quotations: number;
  services: number;
  sellRequests: number;
  dashboard: number;
}

const DEFAULT_COUNTS: PortalBadgeCounts = {
  quotations: 0,
  services: 0,
  sellRequests: 0,
  dashboard: 0,
};

/**
 * Fetches accurate, un-duplicated actionable counts across all staff portal modules.
 */
export async function fetchBadgeCounts(): Promise<PortalBadgeCounts> {
  if (!supabase) return DEFAULT_COUNTS;

  try {
    // 1. PC Quotations: enquiry_status in ('New')
    const quotationsPromise = supabase
      .from("pc_builds")
      .select("id", { count: "exact", head: true })
      .eq("enquiry_status", "New");

    // 2. Service Management: Booked, Reschedule Requested, Awaiting Approval, plus pending reschedule requests
    const servicesPromise = (async (): Promise<number> => {
      try {
        const [ticketsRes, pendingReschedulesRes] = await Promise.all([
          supabase
            .from("service_requests")
            .select("id, status")
            .in("status", ["Booked", "Reschedule Requested", "Awaiting Approval"]),
          supabase
            .from("service_appointment_reschedule_requests")
            .select("ticket_id")
            .eq("status", "pending"),
        ]);

        const uniqueActionableTicketIds = new Set<string>();

        if (ticketsRes.data) {
          ticketsRes.data.forEach((t) => {
            if (t.id) uniqueActionableTicketIds.add(t.id);
          });
        }

        if (pendingReschedulesRes.data) {
          pendingReschedulesRes.data.forEach((r) => {
            if (r.ticket_id) uniqueActionableTicketIds.add(r.ticket_id);
          });
        }

        return uniqueActionableTicketIds.size;
      } catch {
        return 0;
      }
    })();

    // 3. Sell Requests: status in ('Pending', 'Under Review')
    const sellRequestsPromise = supabase
      .from("sell_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["Pending", "Under Review"]);

    const [quotationsRes, servicesCount, sellRequestsRes] = await Promise.all([
      quotationsPromise,
      servicesPromise,
      sellRequestsPromise,
    ]);

    const quotations = quotationsRes.count || 0;
    const services = servicesCount || 0;
    const sellRequests = sellRequestsRes.count || 0;

    // 4. Dashboard: Outstanding actionable items without double counting
    const dashboard = quotations + services + sellRequests;

    return {
      quotations,
      services,
      sellRequests,
      dashboard,
    };
  } catch (err) {
    console.warn("[BadgeCounts] Error computing badge counts:", err);
    return DEFAULT_COUNTS;
  }
}

/**
 * Subscribes to database changes across all 4 key tables and delivers fresh badge counts.
 */
export function subscribeBadgeCounts(onUpdate: (counts: PortalBadgeCounts) => void): () => void {
  if (!supabase) return () => {};

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const counts = await fetchBadgeCounts();
      onUpdate(counts);
    }, 250);
  };

  const channel = supabase
    .channel("staff_portal_sidebar_badges")
    .on("postgres_changes", { event: "*", schema: "public", table: "pc_builds" }, triggerUpdate)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "service_requests" },
      triggerUpdate,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "service_appointment_reschedule_requests" },
      triggerUpdate,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "sell_requests" }, triggerUpdate)
    .subscribe();

  // Initial fetch
  fetchBadgeCounts().then(onUpdate);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}
