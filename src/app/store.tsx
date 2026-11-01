import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { track } from "../lib/analytics";

import { supabase } from "../lib/supabase";
import {
  shopifyConfig,
  fetchShopifyCatalog,
  checkShopifyAvailability,
  patchShopifyAvailability,
  syncShopifyAvailability,
  diffCatalogProducts,
  broadcastShopifySync,
  subscribeToShopifySync,
  toProductGid,
  toVariantGid,
  type VariantAvailabilityInfo,
  recordInventoryMeasurement,
} from "../lib/shopify";
import { syncBuilderCatalogWithShopify } from "../lib/builder/catalog";
import { WEBSITE_CATEGORIES } from "../lib/categoryMapping";

import { subscribeToAuthChanges, fetchOrCreateProfile } from "../lib/auth";
import {
  initContentSync,
  type AnnouncementItem,
  type PromotionalCampaign,
} from "../lib/realtime/contentSync";

import {
  fetchCatalogDetailed,
  fetchActiveOffersDetailed,
  fetchActiveCouponsDetailed,
  patchProductInventory,
} from "../lib/catalog";

import {
  initialOffers,
  categories,
  componentOptions,
  type ComponentOption,
  type Product,
  type CartItem,
  type Order,
  type ServiceRequest,
  type Build,
  type Offer,
  initialBrands,
  initialLocations,
  type ItHubLocation,
  type WarrantyCheck,
  type PcEnquiry,
  type ImportRecord,
  initialSupportCategories,
  initialBrandSupport,
  initialServiceCentres,
  type SupportCategory,
  type BrandSupport,
  type SupportVerification,
  type ServiceCentre,
  type Coupon,
  type CouponUsage,
  type SellRequest,
  initialCoupons,
  initialCouponUsages,
  initialSellRequests,
  type CertificateItem,
  initialCertificates,
} from "../data/catalog";

import { initialBuildTemplates, type BuildTemplate } from "../data/buildTemplates";

import { resourceDefinitions, type AdminRecord } from "../data/admin";

type Profile = {
  id?: string;

  role?: string;

  name: string;

  email: string;

  phone: string;

  address: string;
};

type Audit = {
  id: string;

  action: string;

  date: string;
};

export type ShowcaseImage = {
  id: string;

  src: string;

  caption: string;
};

type State = {
  products: Product[];

  cart: CartItem[];

  wishlist: string[];

  orders: Order[];

  requests: ServiceRequest[];

  builds: Build[];

  buildTemplates: BuildTemplate[];

  /** Assembly charge added to build estimates; 0 = free assembly. */

  assemblyCharge: number;

  offers: Offer[];

  profile: Profile;

  loggedIn: boolean;

  showcase: ShowcaseImage[];

  notifications: string[];

  audit: Audit[];

  technicians: string[];

  catalogCategories: string[];

  brands: string[];

  locations: ItHubLocation[];

  warrantyChecks: WarrantyCheck[];

  pcEnquiries: PcEnquiry[];

  importHistory: ImportRecord[];

  supportCategories: SupportCategory[];

  brandSupport: BrandSupport[];

  serviceCentres: ServiceCentre[];

  supportVerifications: SupportVerification[];

  /** Recently viewed brand-support record ids (customer side). */

  recentSupport: string[];

  componentCatalog: Record<string, ComponentOption[]>;

  resources: Record<string, AdminRecord[]>;

  settings: {
    storeName: string;

    delivery: string;

    emailNotifications: boolean;

    /** Official IT HUB WhatsApp number, digits with country code (e.g. 919876543210). */

    whatsapp: string;

    address: string;

    phone: string;

    email: string;

    workingHours: string;
  };

  tickets: {
    id: string;

    subject: string;

    message: string;

    status: string;
  }[];

  coupons: Coupon[];

  couponUsages: CouponUsage[];

  sellRequests: SellRequest[];

  certificates: CertificateItem[];

  catalogLoading: boolean;

  catalogLive: boolean;

  catalogError: string | null;

  catalogSource: "shopify" | "supabase" | "unconfigured";

  realtimeConnected: boolean;

  announcement: AnnouncementItem | null;

  promotionalCampaigns: PromotionalCampaign[];

  contentSyncConnected: boolean;
};

const initial: State = {
  products: [],

  catalogLoading: true,

  catalogLive: false,

  catalogError: null,

  catalogSource: "unconfigured",

  realtimeConnected: false,

  announcement: null,

  promotionalCampaigns: [],

  contentSyncConnected: false,

  cart: [],

  wishlist: [],

  orders: [],

  requests: [],

  builds: [],

  buildTemplates: initialBuildTemplates,

  assemblyCharge: 0,

  offers: initialOffers,

  coupons: initialCoupons,

  couponUsages: initialCouponUsages,

  sellRequests: initialSellRequests,

  certificates: initialCertificates,

  profile: { name: "", email: "", phone: "", address: "" },

  loggedIn: false,

  showcase: Array.from({ length: 10 }, (_, i) => ({
    id: `showcase-${i + 1}`,

    src: `/images/showcase/showcase-${i + 1}.png`,

    caption: "Another happy IT HUB customer",
  })),

  notifications: [],

  audit: [],

  technicians: ["Unassigned"],

  catalogCategories: categories,

  brands: initialBrands,

  locations: initialLocations,

  warrantyChecks: [],

  pcEnquiries: [],

  importHistory: [],

  supportCategories: initialSupportCategories,

  brandSupport: initialBrandSupport,

  serviceCentres: initialServiceCentres,

  supportVerifications: [],

  recentSupport: [],

  componentCatalog: componentOptions,

  resources: Object.fromEntries(
    Object.entries(resourceDefinitions).map(([key, value]) => [
      key,

      value.initial,
    ]),
  ),

  settings: {
    storeName: "IT HUB",

    delivery: "Kerala",

    emailNotifications: true,

    whatsapp: "919847223886",

    address: "Molathu Building, College Jn., Kothamangalam, Kerala - 686691",

    phone: "+91 98472 23886",

    email: "ithubkmgm@gmail.com",

    workingHours: "10:00 AM - 8:30 PM (Sunday Holiday)",
  },

  tickets: [],
};

type Store = State & {
  set: (next: Partial<State> | ((state: State) => Partial<State>)) => void;

  notify: (message: string) => void;

  toast: string;

  authOpen: boolean;

  setAuthOpen: (open: boolean) => void;

  addCart: (item: Omit<CartItem, "quantity">, quantity?: number) => void;

  toggleWish: (id: string) => void;

  log: (action: string) => void;

  refreshCatalog: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;

  syncAvailability: () => Promise<boolean>;

  patchAvailability: (availabilityMap: Record<string, VariantAvailabilityInfo>) => void;
};

// Keep one context instance across hot updates; otherwise an edited store

// module creates a new context that the already-mounted provider doesn't supply.

const globalStore = globalThis as {
  __ithubStoreContext?: ReturnType<typeof createContext<Store | null>>;
};

const Context = (globalStore.__ithubStoreContext ??= createContext<Store | null>(null));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => {
    try {
      const saved = localStorage.getItem("ithub-prototype-v1");

      if (!saved) return initial;

      const parsed = JSON.parse(saved) as Partial<State>;

      return {
        ...initial,

        ...parsed,

        products: [], // Never restore stale products from localStorage; always hydrate fresh from Supabase

        catalogLoading: true,

        catalogLive: false,

        catalogError: null,

        realtimeConnected: false,

        // Older saves used coupon-code offers; replace them with the new offer model.

        offers: parsed.offers?.every((offer) => "type" in offer) ? parsed.offers : initial.offers,

        settings: {
          ...initial.settings,

          ...parsed.settings,

          phone: "+91 98472 23886",

          email: "ithubkmgm@gmail.com",

          workingHours: "10:00 AM - 8:30 PM (Sunday Holiday)",
        },

        buildTemplates: parsed.buildTemplates?.length
          ? parsed.buildTemplates
          : initial.buildTemplates,

        certificates: (() => {
          if (!Array.isArray(parsed.certificates) || parsed.certificates.length === 0) {
            return initial.certificates;
          }
          const list = parsed.certificates.map((c: CertificateItem) => {
            if (c.id === "cert-intel") {
              const needsTitleFix = c.text === "Intel Technology Partner";
              const isDuplicateImage = c.image === "/images/recognition/intel-partner.jpg";
              if (needsTitleFix || isDuplicateImage) {
                return {
                  ...c,
                  text: needsTitleFix ? "Intel Partner Alliance" : c.text,
                  image: isDuplicateImage ? "/images/about-store.png" : c.image,
                  alt: "Intel Partner Alliance Membership Certificate for IT HUB",
                };
              }
            }
            return c;
          });
          const hasIggis = list.some((c: CertificateItem) => c.id === "cert-iggis");
          if (!hasIggis) {
            const iggisDefault = initial.certificates.find((c) => c.id === "cert-iggis");
            if (iggisDefault) {
              const intelIndex = list.findIndex((c: CertificateItem) => c.id === "cert-intel");
              if (intelIndex !== -1) {
                list.splice(intelIndex, 0, iggisDefault);
              } else {
                list.push(iggisDefault);
              }
            }
          }
          return list;
        })(),

        locations:
          parsed.locations && parsed.locations.length > 0
            ? parsed.locations.map((loc) =>
                loc.id === "kothamangalam"
                  ? {
                      ...loc,

                      name: "IT HUB Kothamangalam (Headquarters)",

                      address: "Molathu Building, College Jn., Kothamangalam, Kerala",

                      pincode: "686691",

                      latitude: 10.0601,

                      longitude: 76.6277,

                      serviceRadiusKm: 15,
                    }
                  : loc,
              )
            : initial.locations,

        brandSupport: parsed.brandSupport?.some((r: any) => r.warrantyPhone)
          ? parsed.brandSupport
          : initial.brandSupport,

        serviceCentres: parsed.serviceCentres?.length
          ? [
              ...parsed.serviceCentres,

              ...initial.serviceCentres.filter(
                (c) => !(parsed.serviceCentres as any[])?.some((p: any) => p.id === c.id),
              ),
            ]
          : initial.serviceCentres,

        supportCategories: parsed.supportCategories?.length
          ? parsed.supportCategories
          : initial.supportCategories,

        // Rehydrate only authentic Shopify-backed component options, discarding old static mocks.
        componentCatalog: Object.fromEntries(
          Object.entries(initial.componentCatalog).map(([type, options]) => {
            const saved = (parsed.componentCatalog?.[type] || []).filter(
              (item: any) => item.isShopifyLive && item.variantId,
            );

            return [
              type,
              [
                ...saved,
                ...options.filter((option) => !saved.some((row: any) => row.id === option.id)),
              ],
            ];
          }),
        ),
      };
    } catch {
      return initial;
    }
  });

  const [toast, setToast] = useState("");

  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("ithub-prototype-v1", JSON.stringify(state));
    } catch {
      setToast("Browser storage is unavailable. Changes last for this session.");
    }
  }, [state]);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(""), 3500);

    return () => clearTimeout(timer);
  }, [toast]);

  // Synchronize store with real Supabase Auth session & PostgreSQL profiles

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          fetchOrCreateProfile(session.user).then((profile) => {
            setState((prev) => ({
              ...prev,

              loggedIn: true,

              profile: {
                ...prev.profile,

                id: session.user.id,

                role: profile?.role || "customer",

                phone: profile?.phone || session.user.phone || prev.profile.phone,

                name: profile?.full_name || prev.profile.name,

                email:
                  profile?.email ||
                  (session.user.email && !session.user.email.endsWith("@customer.ithub.internal")
                    ? session.user.email
                    : "") ||
                  prev.profile.email,

                address: profile?.address || prev.profile.address,
              },
            }));
          });
        }
      });
    }

    const unsubscribe = subscribeToAuthChanges((user) => {
      if (!user) {
        setState((prev) => ({ ...prev, loggedIn: false }));
      } else {
        fetchOrCreateProfile(user).then((profile) => {
          setState((prev) => ({
            ...prev,

            loggedIn: true,

            profile: {
              ...prev.profile,

              id: user.id,

              role: profile?.role || "customer",

              phone: profile?.phone || user.phone || prev.profile.phone,

              name: profile?.full_name || prev.profile.name,

              email:
                profile?.email ||
                (user.email && !user.email.endsWith("@customer.ithub.internal")
                  ? user.email
                  : "") ||
                prev.profile.email,

              address: profile?.address || prev.profile.address,
            },
          }));
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Realtime Event-Driven Storefront Content Synchronization
  // Synchronizes partner_certificates, website_showcase, announcements, store_settings, and it_hub_locations
  useEffect(() => {
    const cleanup = initContentSync(
      { set: setState },
      {
        enableLogging: false,
        onStatusChange: (status) => {
          setState((prev) => ({
            ...prev,
            contentSyncConnected: status.isConnected,
          }));
        },
      },
    );

    return () => {
      cleanup();
    };
  }, []);

  const catalogSyncVersionRef = useRef(0);
  const isCatalogSyncingRef = useRef(false);

  const refreshCatalog = async (options: { force?: boolean; silent?: boolean } = {}) => {
    // Only show loading spinner on initial cold load or explicit non-silent force
    if (!options.silent) {
      setState((prev) =>
        prev.products.length === 0 || options.force ? { ...prev, catalogLoading: true } : prev,
      );
    }

    if (isCatalogSyncingRef.current && !options.force) {
      return;
    }
    isCatalogSyncingRef.current = true;
    const currentVersion = ++catalogSyncVersionRef.current;

    try {
      if (shopifyConfig.isConfigured) {
        // Shopify is the authoritative source for commerce products
        const [shopifyRes, offersRes, couponsRes] = await Promise.allSettled([
          fetchShopifyCatalog({ first: 100, force: options.force }),
          fetchActiveOffersDetailed(),
          fetchActiveCouponsDetailed(),
        ]);

        // Discard stale out-of-order response
        if (currentVersion < catalogSyncVersionRef.current) {
          return;
        }

        setState((prev) => {
          const updates: Partial<State> = {
            catalogLoading: false,
            catalogSource: "shopify",
          };

          if (shopifyRes.status === "fulfilled") {
            const { products: shopifyProducts, isLive, error } = shopifyRes.value;
            if (error) {
              // Strictly display error; preserve last known good catalog (never wipe to empty array)
              updates.catalogError = error;
              updates.catalogLive = false;
              console.warn(
                "[store] Shopify catalog sync warning (retaining last known good):",
                error,
              );
            } else {
              const diff = diffCatalogProducts(prev.products, shopifyProducts);
              if (diff.hasChanges || prev.products.length === 0) {
                updates.products = shopifyProducts;
                updates.catalogLive = isLive;
                updates.catalogError = null;

                const liveCategories = Array.from(
                  new Set(shopifyProducts.map((p) => p.category).filter(Boolean)),
                );
                updates.catalogCategories = ["All", ...WEBSITE_CATEGORIES];
                const liveBrands = Array.from(
                  new Set(
                    shopifyProducts.map((p) => p.brand).filter((b) => Boolean(b && b.trim())),
                  ),
                );
                if (liveBrands.length > 0) {
                  updates.brands = liveBrands;
                }

                // Synchronize PC Builder catalog with authentic Shopify products (authoritative source)
                const syncResult = syncBuilderCatalogWithShopify(shopifyProducts);
                updates.componentCatalog = syncResult.componentCatalog;

                // Broadcast structural update to other open browser tabs
                if (diff.hasStructuralChanges) {
                  broadcastShopifySync({ type: "CATALOG_SYNC", timestamp: Date.now() });
                }
              }
            }
          } else {
            updates.catalogError =
              shopifyRes.reason?.message || "Failed to load products from Shopify Storefront.";
            updates.catalogLive = false;
            // Retain prev.products as last known good
            console.warn(
              "[store] Shopify catalog request rejected (retaining last known good):",
              shopifyRes.reason,
            );
          }

          if (offersRes.status === "fulfilled" && offersRes.value.isLive) {
            updates.offers = offersRes.value.offers;
          }
          if (couponsRes.status === "fulfilled" && couponsRes.value.isLive) {
            updates.coupons = couponsRes.value.coupons;
          }

          return { ...prev, ...updates };
        });
        return;
      }

      // Unconfigured Shopify environment: fallback to Supabase for local development
      const [catalogRes, offersRes, couponsRes] = await Promise.allSettled([
        fetchCatalogDetailed(),
        fetchActiveOffersDetailed(),
        fetchActiveCouponsDetailed(),
      ]);

      if (currentVersion < catalogSyncVersionRef.current) return;

      setState((prev) => {
        const updates: Partial<State> = {
          catalogLoading: false,
          catalogSource: "supabase",
        };

        if (catalogRes.status === "fulfilled") {
          const { products: liveProducts, isLive, error } = catalogRes.value;
          if (error) {
            updates.catalogError = error;
            updates.catalogLive = false;
          } else if (isLive) {
            updates.products = liveProducts;
            updates.catalogLive = true;
            updates.catalogError = null;

            const liveCategories = Array.from(
              new Set(liveProducts.map((p) => p.category).filter(Boolean)),
            );
            updates.catalogCategories = ["All", ...WEBSITE_CATEGORIES];
            const liveBrands = Array.from(
              new Set(liveProducts.map((p) => p.brand).filter((b) => Boolean(b && b.trim()))),
            );
            if (liveBrands.length > 0) {
              updates.brands = liveBrands;
            }
          }
        } else {
          updates.catalogError = catalogRes.reason?.message || "Failed to load live catalog.";
          updates.catalogLive = false;
        }

        if (offersRes.status === "fulfilled" && offersRes.value.isLive) {
          updates.offers = offersRes.value.offers;
        }
        if (couponsRes.status === "fulfilled" && couponsRes.value.isLive) {
          updates.coupons = couponsRes.value.coupons;
        }

        return { ...prev, ...updates };
      });
    } catch (err) {
      console.warn("[store] Background catalog hydration error:", err);

      setState((prev) => ({
        ...prev,

        catalogLoading: false,

        catalogError: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      if (currentVersion === catalogSyncVersionRef.current) {
        isCatalogSyncingRef.current = false;
      }
    }
  };

  const productsRef = useRef(state.products);
  useEffect(() => {
    productsRef.current = state.products;
  }, [state.products]);

  const isAvailabilitySyncingRef = useRef(false);

  const syncAvailability = async (
    trigger: "poll" | "focus" | "visibility" | "manual" = "poll",
  ): Promise<boolean> => {
    const currentProducts = productsRef.current;
    if (!shopifyConfig.isConfigured || currentProducts.length === 0) return false;

    // Concurrency lock: Prevent overlapping in-flight availability checks
    if (isAvailabilitySyncingRef.current) return false;
    isAvailabilitySyncingRef.current = true;

    try {
      const syncResult = await syncShopifyAvailability(currentProducts);
      const t3 = syncResult.t3 || performance.now();
      const t4 = performance.now();

      if (syncResult.hasChanges && syncResult.availability) {
        const availabilityMap = syncResult.availability;
        setState((prev) => {
          // Functionally patch against latest prev.products in case a concurrent structural sync completed
          const { updatedProducts, hasChanges: stateHasChanges } = patchShopifyAvailability(
            prev.products,
            availabilityMap,
          );
          if (!stateHasChanges) return prev;
          const syncResultBuilder = syncBuilderCatalogWithShopify(updatedProducts);
          return {
            ...prev,
            products: updatedProducts,
            componentCatalog: syncResultBuilder.componentCatalog,
          };
        });

        // Record T5 when React has committed changes and browser prepares paint
        const t4_snapshot = t4;
        if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
          requestAnimationFrame(() => {
            const t5 = performance.now();
            recordInventoryMeasurement({
              id: `meas-${Date.now()}`,
              trigger,
              t2_requestStarted: syncResult.t2 || t3 - (syncResult.durationMs || 0),
              t3_responseReceived: t3,
              t4_statePatched: t4_snapshot,
              t5_uiRendered: t5,
              requestDurationMs: syncResult.durationMs || t3 - (syncResult.t2 || t3),
              processingDurationMs: t4_snapshot - t3,
              renderDurationMs: t5 - t4_snapshot,
              hasChanges: true,
              nodeCount: currentProducts.length,
              status: "success",
            });
          });
        }

        // Broadcast availability update (including variants) to all other open tabs
        const availabilityPayload: Record<string, any> = {};
        for (const p of syncResult.updatedProducts) {
          availabilityPayload[toProductGid(p.id)] = {
            id: toProductGid(p.id),
            availableForSale: p.availableForSale,
          };
          availabilityPayload[p.id] = {
            id: toProductGid(p.id),
            availableForSale: p.availableForSale,
          };
          if (p.variants) {
            for (const v of p.variants) {
              const vInfo = {
                id: v.id,
                availableForSale: v.availableForSale,
              };
              availabilityPayload[v.id] = vInfo;
              availabilityPayload[toVariantGid(v.id)] = vInfo;
            }
          }
        }
        broadcastShopifySync({
          type: "AVAILABILITY_SYNC",
          timestamp: Date.now(),
          payload: availabilityPayload,
        });

        return true;
      } else {
        // Record unchanged poll measurement
        recordInventoryMeasurement({
          id: `meas-${Date.now()}`,
          trigger,
          t2_requestStarted: syncResult.t2 || t3 - (syncResult.durationMs || 0),
          t3_responseReceived: t3,
          t4_statePatched: t4,
          t5_uiRendered: t4,
          requestDurationMs: syncResult.durationMs || t3 - (syncResult.t2 || t3),
          processingDurationMs: t4 - t3,
          renderDurationMs: 0,
          hasChanges: false,
          nodeCount: currentProducts.length,
          status: syncResult.error ? "error" : "unchanged",
          error: syncResult.error,
        });
      }
    } catch {
      // Graceful fallback
    } finally {
      isAvailabilitySyncingRef.current = false;
    }
    return false;
  };

  const patchAvailability = (availabilityMap: Record<string, VariantAvailabilityInfo>) => {
    setState((prev) => {
      const { updatedProducts, hasChanges } = patchShopifyAvailability(
        prev.products,
        availabilityMap,
      );
      if (!hasChanges) return prev;
      const syncResult = syncBuilderCatalogWithShopify(updatedProducts);
      return {
        ...prev,
        products: updatedProducts,
        componentCatalog: syncResult.componentCatalog,
      };
    });
  };

  // Phase 3 Step 3: Background Stale-While-Revalidate catalog hydration

  useEffect(() => {
    let isMounted = true;

    refreshCatalog().catch(() => {
      if (isMounted) {
        setState((prev) => ({ ...prev, catalogLoading: false }));
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Phase 3 Step 4: Realtime Inventory Synchronization & Window Focus Revalidation

  useEffect(() => {
    const client = supabase;

    if (!client) return;

    const channel = client

      .channel("public:inventory")

      .on(
        "postgres_changes",

        { event: "*", schema: "public", table: "inventory" },

        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            const row = payload.new as {
              product_id: string;

              stock: number;

              low_stock_threshold?: number;
            };

            if (row?.product_id) {
              setState((prev) => {
                const productExists = prev.products.some((p) => p.id === row.product_id);

                if (productExists) {
                  return {
                    ...prev,

                    products: patchProductInventory(prev.products, row),
                  };
                } else if (payload.eventType === "INSERT") {
                  // Brand new product record added; trigger full catalog revalidation

                  refreshCatalog();

                  return prev;
                }

                return prev;
              });
            }
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { product_id?: string };

            if (oldRow?.product_id) {
              setState((prev) => ({
                ...prev,

                products: patchProductInventory(prev.products, {
                  product_id: oldRow.product_id!,

                  stock: 0,
                }),
              }));
            }
          }
        },
      )

      .subscribe((status) => {
        setState((prev) => ({
          ...prev,

          realtimeConnected: status === "SUBSCRIBED",
        }));
      });

    let lastFocusSync = Date.now();
    let lastStructuralSync = Date.now();

    const handleFocusSync = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        // Responsive tab focus revalidation (3s debounce prevents event storming)
        if (now - lastFocusSync >= 3_000) {
          lastFocusSync = now;
          if (shopifyConfig.isConfigured) {
            syncAvailability("focus");
            if (now - lastStructuralSync >= 15_000) {
              lastStructuralSync = now;
              refreshCatalog({ silent: true });
            }
          } else {
            refreshCatalog({ force: true });
          }
        }
      }
    };

    window.addEventListener("focus", handleFocusSync);

    document.addEventListener("visibilitychange", handleFocusSync);

    return () => {
      window.removeEventListener("focus", handleFocusSync);

      document.removeEventListener("visibilitychange", handleFocusSync);

      client.removeChannel(channel);
    };
  }, []);

  // Phase 2: Active tab visibility-aware dual-tier synchronization & cross-tab sync
  // Tier 1: Real-time availability check every 5 seconds (198ms lightweight query)
  // Tier 2: Structural catalog sync every 20 seconds (silent, zero layout shift)
  useEffect(() => {
    if (!shopifyConfig.isConfigured) return;

    let availabilityTimer: any = null;
    let structuralTimer: any = null;

    const startPolling = () => {
      stopPolling();
      availabilityTimer = setInterval(() => {
        if (document.visibilityState === "visible") {
          syncAvailability("poll");
        }
      }, 5_000);

      structuralTimer = setInterval(() => {
        if (document.visibilityState === "visible") {
          refreshCatalog({ silent: true });
        }
      }, 20_000);
    };

    const stopPolling = () => {
      if (availabilityTimer) {
        clearInterval(availabilityTimer);
        availabilityTimer = null;
      }
      if (structuralTimer) {
        clearInterval(structuralTimer);
        structuralTimer = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncAvailability("visibility");
        refreshCatalog({ silent: true });
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibility);

    // Cross-tab broadcast synchronization subscription
    const unsubscribeBroadcast = subscribeToShopifySync((msg) => {
      if (msg.type === "AVAILABILITY_SYNC" && msg.payload) {
        patchAvailability(msg.payload);
      } else if (msg.type === "CATALOG_SYNC") {
        refreshCatalog({ silent: true });
      }
    });

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribeBroadcast();
    };
  }, []);

  const set = (next: Partial<State> | ((value: State) => Partial<State>)) =>
    setState((previous) => ({
      ...previous,

      ...(typeof next === "function" ? next(previous) : next),
    }));

  const notify = (message: string) => setToast(message);

  const log = (action: string) => {
    if (location.pathname.startsWith("/admin")) track("Admin Data Change", { action });

    set((previous) => ({
      audit: [
        { id: crypto.randomUUID(), action, date: new Date().toLocaleString() },

        ...previous.audit,
      ].slice(0, 100),
    }));
  };

  const addCart = (item: Omit<CartItem, "quantity">, quantity = 1) => {
    if (!state.loggedIn) {
      setAuthOpen(true);

      notify("Please sign in with your mobile number to add items to your cart.");

      return;
    }

    const existingQuantity = state.cart.find((row) => row.id === item.id)?.quantity || 0;

    const product = item.productId
      ? state.products.find(
          (product) =>
            product.id === item.productId ||
            product.variantId === item.id ||
            product.id === item.id,
        )
      : null;

    if (item.productId) {
      const variant = product?.variants?.find((v) => v.id === item.variantId || v.id === item.id);
      const isVariantSoldOut = variant ? !variant.availableForSale : false;
      const isSoldOut = product
        ? product.availableForSale !== undefined
          ? !product.availableForSale
          : product.stock <= 0
        : false;

      if (!product || isSoldOut || isVariantSoldOut) {
        notify("Sorry, this item is currently sold out.");
        return;
      }

      if (product.availableForSale === undefined && existingQuantity + quantity > product.stock) {
        notify("Not enough stock available. Please adjust your cart.");
        return;
      }
    }

    set((previous) => {
      const existing = previous.cart.find((row) => row.id === item.id);

      return {
        cart: existing
          ? previous.cart.map((row) =>
              row.id === item.id ? { ...row, quantity: row.quantity + quantity } : row,
            )
          : [
              ...previous.cart,
              { ...item, variantId: item.variantId || product?.variantId, quantity },
            ],
      };
    });

    notify("Added to cart");

    track("Product Added to Cart", {
      product: item.name ?? item.id,

      productId: item.productId ?? item.id,
    });
  };

  const toggleWish = (id: string) => {
    if (!state.loggedIn) {
      setAuthOpen(true);

      notify("Please sign in with your mobile number to save items to your wishlist.");

      return;
    }

    const exists = state.wishlist.includes(id);

    set((previous) => ({
      wishlist: exists
        ? previous.wishlist.filter((value) => value !== id)
        : [...previous.wishlist, id],
    }));

    notify(exists ? "Removed from wishlist" : "Saved to wishlist");
  };

  return (
    <Context.Provider
      value={{
        ...state,

        set,

        notify,

        toast,

        authOpen,

        setAuthOpen,

        addCart,

        toggleWish,

        log,

        refreshCatalog,

        syncAvailability,

        patchAvailability,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useStore() {
  const store = useContext(Context);

  if (!store) throw new Error("Store provider is required");

  return store;
}
