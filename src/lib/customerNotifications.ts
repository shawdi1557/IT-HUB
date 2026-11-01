// src/lib/customerNotifications.ts
// Customer Notifications Data Client & Realtime Sync
// IT HUB — Kerala, India

import { supabase, supabaseConfig } from "./supabase";

export interface CustomerNotification {
  id: string;
  user_id: string;
  ticket_id?: string | null;
  reschedule_request_id?: string | null;
  event_type: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  read: boolean;
  created_at: string;
}

/**
 * Fetches notifications for the currently logged-in customer.
 */
export async function fetchCustomerNotifications(): Promise<CustomerNotification[]> {
  if (!supabase || !supabaseConfig.isConfigured) return [];

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("customer_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[CustomerNotifications] Error fetching notifications:", error.message);
      return [];
    }

    return (data || []) as CustomerNotification[];
  } catch (err: any) {
    console.warn("[CustomerNotifications] Exception fetching notifications:", err.message);
    return [];
  }
}

/**
 * Marks a customer notification as read.
 */
export async function markCustomerNotificationAsRead(id: string): Promise<boolean> {
  if (!supabase || !supabaseConfig.isConfigured || !id) return false;

  try {
    const { error } = await supabase
      .from("customer_notifications")
      .update({ read: true })
      .eq("id", id);

    if (error) {
      console.warn("[CustomerNotifications] Error marking notification as read:", error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn("[CustomerNotifications] Exception marking notification as read:", err.message);
    return false;
  }
}

/**
 * Subscribes to customer notifications in Realtime.
 */
export function subscribeCustomerNotifications(userId: string, onUpdate: () => void): () => void {
  if (!supabase || !supabaseConfig.isConfigured || !userId) {
    return () => {};
  }

  const channel = supabase
    .channel(`customer_notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "customer_notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onUpdate();
      },
    )
    .subscribe();

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}
