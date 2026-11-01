// src/lib/realtime/contentSync.ts
// IT HUB Storefront — Event-Driven Content Synchronization
// Listens to PostgreSQL change events across partner_certificates, website_showcase,
// announcements, store_settings, and it_hub_locations.
// Includes connection status tracking, reconnection resilience, and visibility-aware polling fallback.
// NOTE: Shopify remains authoritative for commerce (catalog, inventory, variants, orders, blog).

import { supabase } from "../supabase";
import { fetchPublishedCertificates } from "../certificates";
import type { CertificateItem, ItHubLocation } from "../../data/catalog";

export type ShowcaseImage = {
  id: string;
  src: string;
  caption: string;
};

export type AnnouncementItem = {
  id: string;
  title: string;
  message?: string;
  cta_label?: string;
  cta_url?: string;
  image_url?: string;
  is_active: boolean;
};

export type PromotionalCampaign = {
  id: string;
  title: string;
  description?: string | null;
  badge?: string | null;
  image_url: string;
  mobile_image_url?: string | null;
  destination_type: "product" | "category" | "service" | "url";
  destination_ref?: string | null;
  destination_url: string;
  cta_label?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  show_countdown: boolean;
  countdown_heading?: string | null;
  status: "draft" | "scheduled" | "published" | "paused" | "expired" | "archived";
  display_order: number;
  created_at?: string;
  updated_at?: string;
};

export type ContentSyncStatus = {
  isConnected: boolean;
  channelStatus: string;
  lastSyncedAt: number | null;
  lastEventAt: number | null;
  lastEventTable: string | null;
  reconnectCount: number;
};

export interface ContentSyncStore {
  set: (updater: (prev: any) => any) => void;
  get?: () => any;
}

export interface ContentSyncOptions {
  pollingIntervalMs?: number;
  onStatusChange?: (status: ContentSyncStatus) => void;
  enableLogging?: boolean;
  client?: any;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000; // 30 seconds fallback

export class ContentSyncManager {
  private store: ContentSyncStore;
  private options: ContentSyncOptions;
  private client: any;
  private channel: any = null;
  private pollTimer: any = null;
  private isDestroyed = false;
  private isSyncing = false;
  private status: ContentSyncStatus = {
    isConnected: false,
    channelStatus: "INITIALIZING",
    lastSyncedAt: null,
    lastEventAt: null,
    lastEventTable: null,
    reconnectCount: 0,
  };

  constructor(store: ContentSyncStore, options: ContentSyncOptions = {}) {
    this.store = store;
    this.options = {
      pollingIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      enableLogging: false,
      ...options,
    };
    this.client = options.client || supabase;
  }

  public getStatus(): ContentSyncStatus {
    return { ...this.status };
  }

  private log(...args: any[]) {
    if (this.options.enableLogging) {
      console.log("[ContentSync]", ...args);
    }
  }

  private warn(...args: any[]) {
    console.warn("[ContentSync]", ...args);
  }

  private updateStatus(partial: Partial<ContentSyncStatus>) {
    this.status = { ...this.status, ...partial };
    if (this.options.onStatusChange) {
      try {
        this.options.onStatusChange(this.getStatus());
      } catch (err) {
        this.warn("Error in onStatusChange callback:", err);
      }
    }
  }

  /**
   * Start subscription and register event handlers
   */
  public start(): () => void {
    const client = supabase;
    if (!client) {
      this.updateStatus({ channelStatus: "CLIENT_UNAVAILABLE", isConnected: false });
      return () => this.destroy();
    }

    // 1. Initial hydration of all synchronized content slices
    this.reconcileAll();

    // 2. Set up single multiplexed Realtime channel for content tables
    const channelName = `storefront-content-sync-${Date.now()}`;
    this.channel = client
      .channel(channelName)
      // Partner Certificates
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_certificates" },
        (payload) => this.handleCertificateChange(payload),
      )
      // Website Showcase Photos
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "website_showcase" },
        (payload) => this.handleShowcaseChange(payload),
      )
      // Promotional Announcement Banners
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, (payload) =>
        this.handleAnnouncementChange(payload),
      )
      // Store Settings (Profile, Contact, Hours)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_settings" },
        (payload) => this.handleSettingsChange(payload),
      )
      // Physical Store Locations
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "it_hub_locations" },
        (payload) => this.handleLocationsChange(payload),
      )
      // Promotional Campaigns Hero Carousel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "promotional_campaigns" },
        (payload) => this.handleCampaignChange(payload),
      )
      .subscribe((status) => {
        if (this.isDestroyed) return;

        const wasConnected = this.status.isConnected;
        const isNowConnected = status === "SUBSCRIBED";

        this.log(`Channel status transition: ${this.status.channelStatus} -> ${status}`);

        this.updateStatus({
          channelStatus: status,
          isConnected: isNowConnected,
          reconnectCount:
            !wasConnected && isNowConnected
              ? this.status.reconnectCount + 1
              : this.status.reconnectCount,
        });

        // Reconnection resilience: When recovering from dropped connection, perform full reconciliation
        if (!wasConnected && isNowConnected && this.status.reconnectCount > 1) {
          this.log("Reconnected to Realtime. Running full state reconciliation...");
          this.reconcileAll();
        }
      });

    // 3. Register visibility change & focus listeners for visibility-aware polling
    const win = typeof globalThis !== "undefined" ? (globalThis as any).window : undefined;
    const doc = typeof globalThis !== "undefined" ? (globalThis as any).document : undefined;
    if (win && doc) {
      win.addEventListener("focus", this.handleTabActive);
      doc.addEventListener("visibilitychange", this.handleTabActive);
    }

    // 4. Start fallback background poll timer (operates only when tab is visible and Realtime is disconnected)
    this.startFallbackPolling();

    return () => this.destroy();
  }

  /**
   * Visibility-aware active check: triggered on window focus or visibilitychange -> visible
   */
  private handleTabActive = () => {
    const doc = typeof globalThis !== "undefined" ? (globalThis as any).document : undefined;
    if (!doc || doc.visibilityState !== "visible") {
      return;
    }

    const now = Date.now();
    const timeSinceLastSync = this.status.lastSyncedAt ? now - this.status.lastSyncedAt : Infinity;

    // If channel is disconnected, or if > 30s has passed since last sync, reconcile
    if (
      !this.status.isConnected ||
      timeSinceLastSync >= (this.options.pollingIntervalMs || DEFAULT_POLL_INTERVAL_MS)
    ) {
      this.log("Tab became visible while disconnected or stale. Reconciling...");
      this.reconcileAll();
    }
  };

  /**
   * Starts periodic polling fallback. Pauses automatically when tab is hidden or channel is healthy.
   */
  private startFallbackPolling() {
    this.stopFallbackPolling();

    const interval = this.options.pollingIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    this.pollTimer = setInterval(() => {
      // Visibility Guard: NEVER poll when document is hidden (conserves CPU and network bandwidth)
      const doc = typeof globalThis !== "undefined" ? (globalThis as any).document : undefined;
      if (doc && doc.visibilityState !== "visible") {
        return;
      }

      // If Realtime is currently connected and healthy, fallback poll is not needed
      if (this.status.isConnected) {
        return;
      }

      this.log("Fallback poll triggered while disconnected.");
      this.reconcileAll();
    }, interval);
  }

  private stopFallbackPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Full reconciliation across all five content slices
   */
  public async reconcileAll(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      await Promise.allSettled([
        this.syncCertificates(),
        this.syncShowcase(),
        this.syncAnnouncements(),
        this.syncPromotionalCampaigns(),
        this.syncSettings(),
        this.syncLocations(),
      ]);

      this.updateStatus({ lastSyncedAt: Date.now() });
    } catch (err) {
      this.warn("Error during full reconciliation:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  // -------------------------------------------------------------
  // Slice Handlers & Fetchers
  // -------------------------------------------------------------

  /**
   * Handles postgres_changes on partner_certificates
   */
  private async handleCertificateChange(payload: any) {
    this.log("postgres_changes event on partner_certificates:", payload.eventType);
    this.updateStatus({
      lastEventAt: Date.now(),
      lastEventTable: "partner_certificates",
    });

    // Targeted in-memory mutation for instant UI update
    if (payload.eventType === "DELETE") {
      const deletedId = payload.old?.id;
      if (deletedId) {
        this.store.set((prev: any) => ({
          ...prev,
          certificates: (prev.certificates || []).filter(
            (c: CertificateItem) => c.id !== deletedId,
          ),
        }));
      }
    } else if (payload.eventType === "UPDATE" && payload.new?.is_published === false) {
      const unpublishedId = payload.new?.id || payload.old?.id;
      if (unpublishedId) {
        this.store.set((prev: any) => ({
          ...prev,
          certificates: (prev.certificates || []).filter(
            (c: CertificateItem) => c.id !== unpublishedId,
          ),
        }));
      }
    }

    // Refresh authoritative published list from PostgreSQL
    await this.syncCertificates();
  }

  public async syncCertificates(): Promise<void> {
    try {
      const certs = await fetchPublishedCertificates();
      if (certs && certs.length > 0) {
        this.store.set((prev: any) => ({
          ...prev,
          certificates: certs,
        }));
      }
    } catch (err) {
      this.warn("Failed to sync certificates:", err);
    }
  }

  /**
   * Handles postgres_changes on website_showcase
   */
  private async handleShowcaseChange(payload: any) {
    this.log("postgres_changes event on website_showcase:", payload.eventType);
    this.updateStatus({
      lastEventAt: Date.now(),
      lastEventTable: "website_showcase",
    });

    if (payload.eventType === "DELETE") {
      const deletedId = payload.old?.id;
      if (deletedId) {
        this.store.set((prev: any) => ({
          ...prev,
          showcase: (prev.showcase || []).filter((s: ShowcaseImage) => s.id !== deletedId),
        }));
      }
    }

    await this.syncShowcase();
  }

  public async syncShowcase(): Promise<void> {
    const client = supabase;
    if (!client) return;

    try {
      const { data, error } = await client
        .from("website_showcase")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (!error && data && data.length > 0) {
        this.store.set((prev: any) => ({
          ...prev,
          showcase: data.map((d: any) => ({
            id: d.id,
            src: d.src,
            caption: d.caption,
          })),
        }));
      }
    } catch (err) {
      this.warn("Failed to sync website showcase:", err);
    }
  }

  /**
   * Handles postgres_changes on announcements
   */
  private async handleAnnouncementChange(payload: any) {
    this.log("postgres_changes event on announcements:", payload.eventType);
    this.updateStatus({
      lastEventAt: Date.now(),
      lastEventTable: "announcements",
    });

    await this.syncAnnouncements();
  }

  public async syncAnnouncements(): Promise<void> {
    const client = supabase;
    if (!client) return;

    try {
      const { data, error } = await client
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error) {
        const announcement: AnnouncementItem | null = data
          ? {
              id: data.id,
              title: data.title || "",
              message: data.message || data.headline || data.supporting_text || "",
              cta_label: data.cta_label || "ANNOUNCEMENT",
              cta_url: data.cta_url || data.cta_destination || "/services",
              image_url: data.image_url || undefined,
              is_active: data.is_active,
            }
          : null;

        this.store.set((prev: any) => ({
          ...prev,
          announcement,
        }));
      }
    } catch (err) {
      this.warn("Failed to sync announcements:", err);
    }
  }

  /**
   * Handles postgres_changes on store_settings
   */
  private async handleSettingsChange(payload: any) {
    this.log("postgres_changes event on store_settings:", payload.eventType);
    this.updateStatus({
      lastEventAt: Date.now(),
      lastEventTable: "store_settings",
    });

    await this.syncSettings();
  }

  public async syncSettings(): Promise<void> {
    const client = supabase;
    if (!client) return;

    try {
      const { data, error } = await client
        .from("store_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) {
        this.store.set((prev: any) => ({
          ...prev,
          settings: {
            ...prev.settings,
            storeName: data.store_name || prev.settings.storeName,
            phone: data.phone || prev.settings.phone,
            email: data.email || prev.settings.email,
            whatsapp: data.whatsapp_number || prev.settings.whatsapp,
            address: data.address || prev.settings.address,
            workingHours: data.hours || prev.settings.workingHours,
          },
          locations: (prev.locations || []).map((loc: ItHubLocation) =>
            loc.id === "kothamangalam"
              ? {
                  ...loc,
                  name: `${data.store_name || "IT HUB"} Kothamangalam (Headquarters)`,
                  address: data.address || loc.address,
                  serviceRadiusKm:
                    data.service_radius_km != null
                      ? Number(data.service_radius_km)
                      : loc.serviceRadiusKm,
                  pincode: data.pincode || loc.pincode,
                }
              : loc,
          ),
        }));
      }
    } catch (err) {
      this.warn("Failed to sync store settings:", err);
    }
  }

  /**
   * Handles postgres_changes on it_hub_locations
   */
  private async handleLocationsChange(payload: any) {
    this.log("postgres_changes event on it_hub_locations:", payload.eventType);
    this.updateStatus({
      lastEventAt: Date.now(),
      lastEventTable: "it_hub_locations",
    });

    await this.syncLocations();
  }

  public async syncLocations(): Promise<void> {
    const client = supabase;
    if (!client) return;

    try {
      const { data, error } = await client
        .from("it_hub_locations")
        .select("*")
        .order("name", { ascending: true });

      if (!error && data && data.length > 0) {
        this.store.set((prev: any) => ({
          ...prev,
          locations: data.map((loc: any) => ({
            id: loc.id,
            name: loc.name,
            address: loc.address,
            phone: loc.phone || "+91 9847223886",
            email: loc.email || "services@ithubkothamangalam.in",
            pincode: loc.pincode || "686691",
            latitude: loc.latitude != null ? Number(loc.latitude) : 10.0601,
            longitude: loc.longitude != null ? Number(loc.longitude) : 76.6277,
            serviceRadiusKm: loc.service_radius_km != null ? Number(loc.service_radius_km) : 15,
            isHeadquarters: loc.is_headquarters ?? loc.id === "kothamangalam",
          })),
        }));
      }
    } catch (err) {
      this.warn("Failed to sync locations:", err);
    }
  }

  /**
   * Handles postgres_changes on promotional_campaigns
   */
  private async handleCampaignChange(payload: any) {
    this.log("postgres_changes event on promotional_campaigns:", payload.eventType);
    this.updateStatus({
      lastEventAt: Date.now(),
      lastEventTable: "promotional_campaigns",
    });

    // Targeted in-memory mutation for instant UI update
    if (payload.eventType === "DELETE") {
      const deletedId = payload.old?.id;
      if (deletedId) {
        this.store.set((prev: any) => ({
          ...prev,
          promotionalCampaigns: (prev.promotionalCampaigns || []).filter(
            (c: PromotionalCampaign) => c.id !== deletedId,
          ),
        }));
      }
    } else if (payload.eventType === "UPDATE") {
      const updated = payload.new;
      if (updated && updated.status !== "published") {
        this.store.set((prev: any) => ({
          ...prev,
          promotionalCampaigns: (prev.promotionalCampaigns || []).filter(
            (c: PromotionalCampaign) => c.id !== updated.id,
          ),
        }));
      }
    }

    await this.syncPromotionalCampaigns();
  }

  public async syncPromotionalCampaigns(): Promise<void> {
    const client = this.client || supabase;
    if (!client) return;

    try {
      const { data, error } = await client
        .from("promotional_campaigns")
        .select("*")
        .eq("status", "published")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (!error && data) {
        const now = Date.now();
        const active = data.filter((c: any) => {
          if (c.starts_at && new Date(c.starts_at).getTime() > now) return false;
          if (c.ends_at && new Date(c.ends_at).getTime() <= now) return false;
          return true;
        });

        this.store.set((prev: any) => ({
          ...prev,
          promotionalCampaigns: active as PromotionalCampaign[],
        }));
      }
    } catch (err) {
      this.warn("Failed to sync promotional campaigns:", err);
    }
  }

  /**
   * Tear down all channels, timers, and listeners cleanly
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.stopFallbackPolling();

    const win = typeof globalThis !== "undefined" ? (globalThis as any).window : undefined;
    const doc = typeof globalThis !== "undefined" ? (globalThis as any).document : undefined;
    if (win && doc) {
      win.removeEventListener("focus", this.handleTabActive);
      doc.removeEventListener("visibilitychange", this.handleTabActive);
    }

    if (this.channel && supabase) {
      try {
        supabase.removeChannel(this.channel);
      } catch (err) {
        this.warn("Error removing realtime channel:", err);
      }
      this.channel = null;
    }

    this.updateStatus({
      isConnected: false,
      channelStatus: "CLOSED",
    });
  }
}

/**
 * Convenience helper to initialize content synchronization on StoreProvider mount
 */
export function initContentSync(
  store: ContentSyncStore,
  options: ContentSyncOptions = {},
): () => void {
  const manager = new ContentSyncManager(store, options);
  return manager.start();
}
