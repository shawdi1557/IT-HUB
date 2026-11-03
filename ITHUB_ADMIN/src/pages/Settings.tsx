// ITHUB_ADMIN/src/pages/Settings.tsx
// IT HUB Staff Portal — Comprehensive Store, Radius, WhatsApp & Database Settings

import { useState, useEffect } from "react";
import {
  Store,
  MessageCircle,
  Database,
  Shield,
  Save,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  BadgeIndianRupee,
  ChevronDown,
} from "lucide-react";
import { checkStaffDatabaseHealth, type DatabaseHealthResult } from "../lib/health";
import { supabase } from "../lib/supabase";
import { getSettingsNavigationTabs } from "../lib/uiHelpers";

interface StoreConfig {
  name: string;
  tagline: string;
  address: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  phone: string;
  email: string;
  hours: string;
  serviceRadiusKm: number;
  whatsappPhone: string;
  whatsappDefaultMsg: string;
  analyticsEnabled: boolean;
  maskVisitorIp: boolean;
}

const DEFAULT_CONFIG: StoreConfig = {
  name: "IT HUB",
  tagline: "Computers, Laptops, Sales & Repair Services",
  address: "AM Road, Kothamangalam",
  city: "Kothamangalam, Kerala",
  pincode: "686691",
  lat: 10.0601,
  lng: 76.6272,
  phone: "+91 94470 12345",
  email: "support@ithub.co.in",
  hours: "Mon - Sat: 9:30 AM - 7:30 PM",
  serviceRadiusKm: 25,
  whatsappPhone: "919447012345",
  whatsappDefaultMsg: "Hi IT HUB, I would like to inquire about a service or PC quotation.",
  analyticsEnabled: true,
  maskVisitorIp: true,
};

export function Settings() {
  const [config, setConfig] = useState<StoreConfig>(() => {
    try {
      const stored = localStorage.getItem("ithub-store-v2");
      if (stored) {
        const parsed = JSON.parse(stored);
        const loc = parsed?.locations?.[0];
        return {
          ...DEFAULT_CONFIG,
          name: parsed?.settings?.storeName || DEFAULT_CONFIG.name,
          phone: parsed?.settings?.phone || DEFAULT_CONFIG.phone,
          email: parsed?.settings?.email || DEFAULT_CONFIG.email,
          hours: parsed?.settings?.hours || DEFAULT_CONFIG.hours,
          address: loc?.address || DEFAULT_CONFIG.address,
          city: loc?.city || DEFAULT_CONFIG.city,
          pincode: loc?.pincode || DEFAULT_CONFIG.pincode,
          lat: loc?.lat || DEFAULT_CONFIG.lat,
          lng: loc?.lng || DEFAULT_CONFIG.lng,
          serviceRadiusKm: loc?.serviceRadiusKm || DEFAULT_CONFIG.serviceRadiusKm,
          whatsappPhone: parsed?.settings?.whatsappPhone || DEFAULT_CONFIG.whatsappPhone,
          whatsappDefaultMsg:
            parsed?.settings?.whatsappDefaultMsg || DEFAULT_CONFIG.whatsappDefaultMsg,
        };
      }
    } catch {
      // Fallback to defaults
    }
    return DEFAULT_CONFIG;
  });

  const [activeTab, setActiveTab] = useState<
    "store" | "fees" | "whatsapp" | "database" | "privacy"
  >("store");
  const [health, setHealth] = useState<DatabaseHealthResult | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [doorstepCalloutFee, setDoorstepCalloutFee] = useState<number>(250);
  const [courierReturnDeliveryFee, setCourierReturnDeliveryFee] = useState<number>(150);
  const [diagnosticFee, setDiagnosticFee] = useState<number>(299);
  const [loadingFees, setLoadingFees] = useState(false);
  const [savingFees, setSavingFees] = useState(false);

  useEffect(() => {
    if (supabase) {
      setLoadingFees(true);
      supabase
        .from("store_settings")
        .select("*")
        .limit(1)
        .maybeSingle()
        .then(
          ({ data, error }) => {
            setLoadingFees(false);
            if (data && !error) {
              if (data.doorstep_callout_fee != null)
                setDoorstepCalloutFee(Number(data.doorstep_callout_fee));
              if (data.courier_return_delivery_fee != null)
                setCourierReturnDeliveryFee(Number(data.courier_return_delivery_fee));
              if (data.diagnostic_assessment_fee != null)
                setDiagnosticFee(Number(data.diagnostic_assessment_fee));

              setConfig((prev) => ({
                ...prev,
                name: data.store_name || prev.name,
                phone: data.phone || prev.phone,
                email: data.email || prev.email,
                hours: data.hours || prev.hours,
                address: data.address || prev.address,
                city: data.city || prev.city,
                pincode: data.pincode || prev.pincode,
                tagline: data.tagline || prev.tagline,
                serviceRadiusKm:
                  data.service_radius_km != null
                    ? Number(data.service_radius_km)
                    : prev.serviceRadiusKm,
                whatsappPhone: data.whatsapp_number || prev.whatsappPhone,
                whatsappDefaultMsg: data.whatsapp_default_msg || prev.whatsappDefaultMsg,
                analyticsEnabled:
                  data.analytics_enabled != null
                    ? Boolean(data.analytics_enabled)
                    : prev.analyticsEnabled,
                maskVisitorIp:
                  data.mask_visitor_ip != null ? Boolean(data.mask_visitor_ip) : prev.maskVisitorIp,
              }));
            }
          },
          () => setLoadingFees(false),
        );
    }
  }, []);

  const runHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const res = await checkStaffDatabaseHealth();
      setHealth(res);
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (activeTab === "database" && !health) {
      runHealthCheck();
    }
  }, [activeTab]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFees(true);

    try {
      // 1. Authoritative persistence in PostgreSQL public.store_settings
      if (supabase) {
        const payload = {
          store_name: config.name.trim(),
          phone: config.phone.trim(),
          email: config.email.trim(),
          hours: config.hours.trim(),
          address: config.address.trim(),
          city: config.city.trim(),
          pincode: config.pincode.trim(),
          tagline: config.tagline.trim(),
          service_radius_km: config.serviceRadiusKm,
          whatsapp_number: config.whatsappPhone.trim(),
          whatsapp_default_msg: config.whatsappDefaultMsg.trim(),
          doorstep_callout_fee: doorstepCalloutFee,
          courier_return_delivery_fee: courierReturnDeliveryFee,
          diagnostic_assessment_fee: diagnosticFee,
          analytics_enabled: config.analyticsEnabled,
          mask_visitor_ip: config.maskVisitorIp,
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
          .from("store_settings")
          .select("id")
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          await supabase.from("store_settings").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("store_settings").insert(payload);
        }

        // Also sync it_hub_locations headquarters row
        try {
          await supabase
            .from("it_hub_locations")
            .update({
              name: `${config.name.trim()} Kothamangalam (Headquarters)`,
              address: config.address.trim(),
              pincode: config.pincode.trim(),
              service_radius_km: config.serviceRadiusKm,
            })
            .eq("id", "30000000-0000-0000-0000-000000000000");
        } catch {}

        // Audit log in staff_audit_logs
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          await supabase.from("staff_audit_logs").insert({
            staff_user_id: user?.id,
            action_type: "UPDATE_STORE_SETTINGS",
            entity_type: "store_settings",
            entity_id: "1",
            metadata: {
              store_name: config.name,
              phone: config.phone,
              email: config.email,
              service_radius_km: config.serviceRadiusKm,
              doorstep_callout_fee: doorstepCalloutFee,
              timestamp: new Date().toISOString(),
            },
          });
        } catch {}
      }

      // 2. Persist to ithub-store-v2 in localStorage so the storefront reflects it
      const currentRaw = localStorage.getItem("ithub-store-v2");
      const current = currentRaw ? JSON.parse(currentRaw) : {};

      const updated = {
        ...current,
        settings: {
          ...(current.settings || {}),
          storeName: config.name,
          phone: config.phone,
          email: config.email,
          hours: config.hours,
          whatsappPhone: config.whatsappPhone,
          whatsappDefaultMsg: config.whatsappDefaultMsg,
          doorstepCalloutFee,
          courierReturnDeliveryFee,
          diagnosticFee,
        },
        locations: [
          {
            id: current.locations?.[0]?.id || "loc-kothamangalam",
            name: config.name,
            address: config.address,
            city: config.city,
            pincode: config.pincode,
            lat: config.lat,
            lng: config.lng,
            phone: config.phone,
            email: config.email,
          },
          ...(current.locations?.slice(1) || []),
        ],
      };

      localStorage.setItem("ithub-store-v2", JSON.stringify(updated));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save settings", err);
    } finally {
      setSavingFees(false);
    }
  };

  const whatsappPreviewUrl = `https://wa.me/${config.whatsappPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
    config.whatsappDefaultMsg,
  )}`;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Store &amp; System Settings
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Configure primary store identity, on-site service radius, WhatsApp integrations, and
            database connectivity.
          </p>
        </div>

        {saveSuccess && (
          <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={16} />
            <span>Settings saved successfully!</span>
          </div>
        )}
      </div>

      {/* Mobile Settings Section Selector (< md) */}
      <div className="block md:hidden">
        <label
          htmlFor="mobile-settings-tab"
          className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
        >
          Settings Section
        </label>
        <div className="relative">
          <select
            id="mobile-settings-tab"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm py-3 pl-10 pr-10 text-xs font-bold text-slate-900 shadow-2xs focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[44px]"
          >
            <option value="store">Store Identity &amp; Location</option>
            <option value="fees">Service &amp; Logistics Fees</option>
            <option value="whatsapp">WhatsApp Support</option>
            <option value="database">Database Health Check</option>
            <option value="privacy">Privacy &amp; Anonymization</option>
          </select>
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-600">
            {activeTab === "store" && <Store size={16} />}
            {activeTab === "fees" && <BadgeIndianRupee size={16} />}
            {activeTab === "whatsapp" && <MessageCircle size={16} />}
            {activeTab === "database" && <Database size={16} />}
            {activeTab === "privacy" && <Shield size={16} />}
          </div>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      {/* Desktop Tabs Navigation (md+) with Refined Glassmorphism */}
      <div className="hidden md:flex items-center gap-1.5 rounded-2xl bg-slate-100/80 p-1.5 text-xs font-bold border border-slate-200/60 backdrop-blur-xs">
        {getSettingsNavigationTabs().map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`min-h-[44px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 transition-all duration-150 cursor-pointer text-center ${
                isActive
                  ? "bg-white text-blue-700 shadow-xs border border-slate-200/80 font-extrabold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              {tab.id === "store" && <Store size={15} />}
              {tab.id === "fees" && <BadgeIndianRupee size={15} />}
              {tab.id === "whatsapp" && <MessageCircle size={15} />}
              {tab.id === "database" && <Database size={15} />}
              {tab.id === "privacy" && <Shield size={15} />}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Tab 1: Store Identity & Location */}
        {activeTab === "store" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Store size={18} className="text-blue-600" /> Primary Store Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Store Name</label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tagline</label>
                <input
                  type="text"
                  value={config.tagline}
                  onChange={(e) => setConfig({ ...config, tagline: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={config.address}
                  onChange={(e) => setConfig({ ...config, address: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">City / Region</label>
                <input
                  type="text"
                  value={config.city}
                  onChange={(e) => setConfig({ ...config, city: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">PIN Code</label>
                <input
                  type="text"
                  value={config.pincode}
                  onChange={(e) => setConfig({ ...config, pincode: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Latitude (GPS)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={config.lat}
                  onChange={(e) => setConfig({ ...config, lat: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Longitude (GPS)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={config.lng}
                  onChange={(e) => setConfig({ ...config, lng: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={config.phone}
                  onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Support Email</label>
                <input
                  type="email"
                  value={config.email}
                  onChange={(e) => setConfig({ ...config, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Store Working Hours</label>
                <input
                  type="text"
                  value={config.hours}
                  onChange={(e) => setConfig({ ...config, hours: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Service & Logistics Fees */}
        {activeTab === "fees" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <BadgeIndianRupee size={18} className="text-blue-600" /> Service &amp; Logistics
                  Fee Configuration
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Configure authoritative rates applied across the storefront booking wizard.
                  Changes persist to store_settings and are snapshot onto each booking.
                </p>
              </div>
              {loadingFees && (
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <RefreshCw size={13} className="animate-spin" /> Loading fees…
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Doorstep Callout Fee */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Doorstep Technician Callout
                  </span>
                  <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-bold">
                    Per Visit
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Base transport and travel fee charged when a technician visits a customer in
                  Kothamangalam and surrounding areas.
                </p>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-bold text-slate-500">
                    ₹
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={doorstepCalloutFee}
                    onChange={(e) =>
                      setDoorstepCalloutFee(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-sm font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Default: ₹250 (waived or adjusted during on-site billing)
                </p>
              </div>

              {/* Courier Return Delivery Fee */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Courier Return Delivery</span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                    Kerala-Wide
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Insured return shipment fee charged to return repaired hardware safely back to the
                  customer's Kerala address.
                </p>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-bold text-slate-500">
                    ₹
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={courierReturnDeliveryFee}
                    onChange={(e) =>
                      setCourierReturnDeliveryFee(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-sm font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Default: ₹150 (all 14 Kerala districts)
                </p>
              </div>

              {/* Diagnostic Assessment Fee */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    In-Store Diagnostic Assessment
                  </span>
                  <span className="rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-[10px] font-bold">
                    Workbench
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Baseline workbench triage and diagnostic inspection fee for complex board-level
                  faults when repairs are deferred.
                </p>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-bold text-slate-500">
                    ₹
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={diagnosticFee}
                    onChange={(e) => setDiagnosticFee(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-sm font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Default: ₹299 (included in approved quote totals)
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <strong className="block text-blue-950 font-bold mb-0.5">
                  Audit Trail &amp; Snapshots:
                </strong>
                All fee updates are logged to staff_audit_logs with administrator metadata. Service
                bookings permanently retain their snapshot fee.
              </div>
              <button
                type="submit"
                disabled={savingFees}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50 shrink-0 min-h-[44px]"
              >
                <Save size={14} /> {savingFees ? "Saving…" : "Save Fees"}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: WhatsApp Support */}
        {activeTab === "whatsapp" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <MessageCircle size={18} className="text-emerald-600" /> WhatsApp Direct Communication
            </h2>

            <p className="text-xs text-slate-500">
              Configure the phone number and default message used when customers click WhatsApp
              support buttons on service tickets and quotations.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  WhatsApp Business Phone (with country code, digits only)
                </label>
                <input
                  type="text"
                  value={config.whatsappPhone}
                  onChange={(e) => setConfig({ ...config, whatsappPhone: e.target.value })}
                  placeholder="919447012345"
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Default Inbound Greeting
                </label>
                <input
                  type="text"
                  value={config.whatsappDefaultMsg}
                  onChange={(e) => setConfig({ ...config, whatsappDefaultMsg: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <strong className="text-emerald-900 block mb-0.5">
                    Live Click-to-Chat Preview:
                  </strong>
                  <p className="text-emerald-700 text-[11px] font-mono break-all bg-white/70 p-2 rounded-lg border border-emerald-200/60">
                    {whatsappPreviewUrl}
                  </p>
                </div>
                <a
                  href={whatsappPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition min-h-[44px] shrink-0"
                >
                  <ExternalLink size={14} /> Test Link
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Database Health Check */}
        {activeTab === "database" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Database size={18} className="text-blue-600" /> Supabase PostgreSQL Health
              </h2>
              <button
                type="button"
                onClick={runHealthCheck}
                disabled={checkingHealth}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition min-h-[44px]"
              >
                <RefreshCw size={13} className={checkingHealth ? "animate-spin" : ""} /> Check Again
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 text-xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Connection Status:</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wider ${
                    health?.connected
                      ? "bg-emerald-100 text-emerald-800"
                      : checkingHealth
                        ? "bg-blue-100 text-blue-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {checkingHealth ? "Probing..." : health?.connected ? "Connected" : "Disconnected"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Round-trip Query Latency:</span>
                <span className="font-mono font-bold text-slate-900">
                  {health?.latencyMs !== null ? `${health?.latencyMs} ms` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Supabase Endpoint:</span>
                <span className="font-mono text-slate-700 truncate max-w-[200px] sm:max-w-xs">
                  {health?.url || "Configured"}
                </span>
              </div>

              {health?.message && (
                <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-600">
                  <strong>Diagnostic Message:</strong> {health.message}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs space-y-2">
              <span className="font-bold text-slate-800 block flex items-center gap-1.5">
                <Shield size={14} className="text-emerald-600" />
                External Integration Credentials &amp; API Keys
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Shopify Storefront API credentials, Razorpay Gateway Secrets, and Supabase Service
                Role keys are securely managed via server environment configurations. In compliance
                with security standards, private secrets are never editable through client settings.
              </p>
            </div>
          </div>
        )}

        {/* Tab 5: Privacy */}
        {activeTab === "privacy" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Shield size={18} className="text-blue-600" /> Visitor Privacy &amp; Data Protection
            </h2>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50 transition">
                <div>
                  <span className="font-bold text-slate-900 block">
                    Anonymous Session Analytics
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Track page view counts and popular categories without personal identifiers.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.analyticsEnabled}
                  onChange={(e) => setConfig({ ...config, analyticsEnabled: e.target.checked })}
                  className="h-4 w-4 rounded accent-blue-600"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50 transition">
                <div>
                  <span className="font-bold text-slate-900 block">IP Address Anonymization</span>
                  <span className="text-slate-500 text-[11px]">
                    Mask the final octet of client IP addresses (e.g. 192.168.1.xxx) for privacy
                    compliance.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.maskVisitorIp}
                  onChange={(e) => setConfig({ ...config, maskVisitorIp: e.target.checked })}
                  className="h-4 w-4 rounded accent-blue-600"
                />
              </label>
            </div>
          </div>
        )}

        {/* Save Bar */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="submit"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition min-h-[44px]"
          >
            <Save size={15} /> Save All Settings
          </button>
        </div>
      </form>
    </div>
  );
}

export default Settings;
