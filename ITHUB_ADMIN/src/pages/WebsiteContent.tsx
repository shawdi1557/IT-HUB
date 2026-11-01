// ITHUB_ADMIN/src/pages/WebsiteContent.tsx
// IT HUB Staff Portal — Promotional Campaign Manager & Website Content
// Allows administrators to upload promotional banners, configure Shopify product/service destinations,
// schedule campaigns, toggle countdowns, manage display ordering, and sync in real-time.

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Save,
  X,
  Eye,
  Plus,
  Clock,
  Search,
  ExternalLink,
  Layers,
  ShoppingBag,
  Wrench,
  Copy,
  Pause,
  Play,
  Filter,
} from "lucide-react";
import { supabase } from "../lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface PromotionalCampaign {
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
}

interface ShowcaseItem {
  id: string;
  src: string;
  caption: string;
}

interface CatalogProductOption {
  id: string;
  name: string;
  handle: string;
  price?: number;
  image?: string;
  category?: string;
}

const PREDEFINED_BADGES = [
  "NEW ARRIVAL",
  "FESTIVE OFFER",
  "LIMITED OFFER",
  "MEGA DEAL",
  "DIWALI SPECIAL",
  "ONAM OFFER",
  "CHRISTMAS DEAL",
  "EXCLUSIVE",
];

const PREDEFINED_CATEGORIES = [
  "Laptops",
  "Desktop PCs",
  "Components",
  "Storage",
  "Displays & Monitors",
  "Networking & Accessories",
  "Printers & Scanners",
  "Mobile & Tablets",
];

const PREDEFINED_SERVICES = [
  { name: "Laptop Repair", url: "/services/book?service=Laptop%20Repair" },
  { name: "Mobile & Tablet Repair", url: "/services/book?service=Mobile%20Repair" },
  { name: "Custom PC Assembly & Repair", url: "/services/book?service=PC%20Repair" },
  { name: "Printer Installation & Service", url: "/services/book?service=Printer%20Service" },
  { name: "On-site Technician Visit", url: "/services/book?service=On-site%20Technician%20Visit" },
  { name: "Insured Courier Service", url: "/services/book?service=Courier%20to%20IT%20HUB" },
  { name: "General Service Booking Wizard", url: "/services/book" },
  { name: "Main Services Overview Page", url: "/services" },
];

const DEFAULT_SHOWCASE: ShowcaseItem[] = [
  {
    id: "showcase-1",
    src: "/images/showcase/showcase-1.png",
    caption: "IT HUB Experience Store — Kothamangalam showroom floor and consultation desk",
  },
  {
    id: "showcase-2",
    src: "/images/showcase/showcase-2.png",
    caption: "Precision diagnostics & component repair bench",
  },
  {
    id: "showcase-3",
    src: "/images/showcase/showcase-3.png",
    caption: "Custom liquid-cooled gaming workstation assembly",
  },
  {
    id: "showcase-4",
    src: "/images/showcase/showcase-4.png",
    caption: "Authorized manufacturer display and genuine parts stock",
  },
  {
    id: "showcase-5",
    src: "/images/showcase/showcase-5.png",
    caption: "Enterprise networking & server configuration lab",
  },
];

export function WebsiteContent() {
  const [activeTab, setActiveTab] = useState<"campaigns" | "showcase">("campaigns");

  // Notifications
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const showNotification = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PROMOTIONAL CAMPAIGNS STATE
  // ─────────────────────────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<PromotionalCampaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<PromotionalCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromotionalCampaign | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<PromotionalCampaign | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formBadge, setFormBadge] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formMobileImageUrl, setFormMobileImageUrl] = useState("");
  const [formDestType, setFormDestType] = useState<"product" | "category" | "service" | "url">(
    "product",
  );
  const [formDestRef, setFormDestRef] = useState("");
  const [formDestUrl, setFormDestUrl] = useState("/products");
  const [formCtaLabel, setFormCtaLabel] = useState("Explore Now");
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formShowCountdown, setFormShowCountdown] = useState(false);
  const [formCountdownHeading, setFormCountdownHeading] = useState("ENDS IN");
  const [formStatus, setFormStatus] = useState<"draft" | "scheduled" | "published" | "paused">(
    "draft",
  );
  const [formDisplayOrder, setFormDisplayOrder] = useState(0);

  // Upload States
  const [isUploadingDesktop, setIsUploadingDesktop] = useState(false);
  const [isUploadingMobile, setIsUploadingMobile] = useState(false);
  const desktopFileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileFileInputRef = useRef<HTMLInputElement | null>(null);

  // Searchable Shopify Products List
  const [availableProducts, setAvailableProducts] = useState<CatalogProductOption[]>([]);
  const [productSearch, setProductSearch] = useState("");

  // ─────────────────────────────────────────────────────────────────────────
  // SHOWCASE GALLERY STATE
  // ─────────────────────────────────────────────────────────────────────────
  const [showcase, setShowcase] = useState<ShowcaseItem[]>(DEFAULT_SHOWCASE);
  const [captionDraft, setCaptionDraft] = useState("");
  const [isUploadingShowcase, setIsUploadingShowcase] = useState(false);
  const [showcaseDeleteTarget, setShowcaseDeleteTarget] = useState<ShowcaseItem | null>(null);
  const [showcasePreviewItem, setShowcasePreviewItem] = useState<ShowcaseItem | null>(null);
  const showcaseFileRef = useRef<HTMLInputElement | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA FETCHING & REALTIME SYNC
  // ─────────────────────────────────────────────────────────────────────────

  const loadCampaigns = async () => {
    if (!supabase) return;
    setCampaignsLoading(true);
    try {
      const { data, error } = await supabase
        .from("promotional_campaigns")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (!error && data) {
        setCampaigns(data as PromotionalCampaign[]);
      }
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setCampaignsLoading(false);
    }
  };

  const loadProducts = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, price")
        .limit(50);

      if (!error && data && data.length > 0) {
        setAvailableProducts(
          data.map((p) => ({
            id: p.id,
            name: p.name,
            handle: p.sku ? p.sku.toLowerCase() : p.id,
            price: Number(p.price),
          })),
        );
      }
    } catch {
      // Fallback sample product list for destination linking
      setAvailableProducts([
        {
          id: "prod-macbook",
          name: "Apple MacBook Pro M4 Max (16-inch)",
          handle: "apple-macbook-pro-m4",
          price: 249900,
        },
        {
          id: "prod-rtx5090",
          name: "Custom RTX 5090 Liquid Workstation",
          handle: "rtx-5090-workstation",
          price: 389000,
        },
        {
          id: "prod-thinkpad",
          name: "Lenovo ThinkPad P1 Gen 7 Mobile Workstation",
          handle: "lenovo-thinkpad-p1-gen-7",
          price: 189900,
        },
        {
          id: "prod-canon",
          name: "Canon imageCLASS All-In-One Laser Duplex",
          handle: "canon-imageclass-laser",
          price: 24500,
        },
      ]);
    }
  };

  const loadShowcase = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("website_showcase")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (!error && data && data.length > 0) {
        setShowcase(
          data.map((d: any) => ({
            id: d.id,
            src: d.src,
            caption: d.caption,
          })),
        );
      }
    } catch (err) {
      console.error("Failed to load showcase:", err);
    }
  };

  useEffect(() => {
    loadCampaigns();
    loadProducts();
    loadShowcase();

    if (!supabase) return;

    // Realtime subscription for campaigns
    const channel = supabase
      .channel("staff-promotional-campaigns-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "promotional_campaigns" },
        () => {
          loadCampaigns();
        },
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // CAMPAIGN ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingCampaign(null);
    setFormTitle("");
    setFormDescription("");
    setFormBadge("FESTIVE OFFER");
    setFormImageUrl("");
    setFormMobileImageUrl("");
    setFormDestType("product");
    setFormDestRef("");
    setFormDestUrl("/products");
    setFormCtaLabel("Explore Now");
    setFormStartsAt(new Date().toISOString().slice(0, 16));
    setFormEndsAt(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
    setFormShowCountdown(true);
    setFormCountdownHeading("ENDS IN");
    setFormStatus("published");
    setFormDisplayOrder(campaigns.length + 1);
    setIsModalOpen(true);
  };

  const openEditModal = (camp: PromotionalCampaign) => {
    setEditingCampaign(camp);
    setFormTitle(camp.title);
    setFormDescription(camp.description || "");
    setFormBadge(camp.badge || "");
    setFormImageUrl(camp.image_url);
    setFormMobileImageUrl(camp.mobile_image_url || "");
    setFormDestType(camp.destination_type);
    setFormDestRef(camp.destination_ref || "");
    setFormDestUrl(camp.destination_url);
    setFormCtaLabel(camp.cta_label || "Explore Now");
    setFormStartsAt(camp.starts_at ? new Date(camp.starts_at).toISOString().slice(0, 16) : "");
    setFormEndsAt(camp.ends_at ? new Date(camp.ends_at).toISOString().slice(0, 16) : "");
    setFormShowCountdown(camp.show_countdown);
    setFormCountdownHeading(camp.countdown_heading || "ENDS IN");
    setFormStatus(
      camp.status === "expired" || camp.status === "archived" ? "draft" : (camp.status as any),
    );
    setFormDisplayOrder(camp.display_order);
    setIsModalOpen(true);
  };

  // Image Upload Handler using Supabase Storage
  const handleImageUpload = async (file: File, isMobile: boolean) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showNotification("error", "Please upload a valid image file (JPEG, PNG, WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showNotification("error", "Image file exceeds maximum 5MB size limit.");
      return;
    }

    if (isMobile) setIsUploadingMobile(true);
    else setIsUploadingDesktop(true);

    try {
      if (!supabase) throw new Error("Supabase client not initialized");

      const fileExt = file.name.split(".").pop() || "jpg";
      const cleanFileName = `banner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("promotional-banners")
        .upload(cleanFileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("promotional-banners").getPublicUrl(cleanFileName);

      if (isMobile) {
        setFormMobileImageUrl(publicUrl);
        showNotification("success", "Mobile promotional banner uploaded successfully!");
      } else {
        setFormImageUrl(publicUrl);
        showNotification("success", "Promotional banner uploaded successfully!");
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      showNotification("error", `Image upload failed: ${err.message || "Network error"}`);
    } finally {
      if (isMobile) setIsUploadingMobile(false);
      else setIsUploadingDesktop(false);
    }
  };

  // Destination Resolution
  const handleDestinationTypeChange = (type: "product" | "category" | "service" | "url") => {
    setFormDestType(type);
    if (type === "product") {
      const first = availableProducts[0];
      if (first) {
        setFormDestRef(first.handle);
        setFormDestUrl(`/products/${encodeURIComponent(first.handle)}`);
      } else {
        setFormDestUrl("/products");
      }
    } else if (type === "category") {
      setFormDestRef(PREDEFINED_CATEGORIES[0]);
      setFormDestUrl(`/products?category=${encodeURIComponent(PREDEFINED_CATEGORIES[0])}`);
    } else if (type === "service") {
      setFormDestRef(PREDEFINED_SERVICES[0].name);
      setFormDestUrl(PREDEFINED_SERVICES[0].url);
    } else {
      setFormDestRef("");
      setFormDestUrl("/pc-builder");
    }
  };

  const handleProductSelect = (product: CatalogProductOption) => {
    setFormDestRef(product.handle);
    setFormDestUrl(`/products/${encodeURIComponent(product.handle)}`);
  };

  const handleCategorySelect = (cat: string) => {
    setFormDestRef(cat);
    setFormDestUrl(`/products?category=${encodeURIComponent(cat)}`);
  };

  const handleServiceSelect = (serviceName: string) => {
    const s = PREDEFINED_SERVICES.find((it) => it.name === serviceName);
    if (s) {
      setFormDestRef(s.name);
      setFormDestUrl(s.url);
    }
  };

  // Save Campaign
  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formTitle.trim()) {
      showNotification("error", "Campaign title is required.");
      return;
    }

    if (!formImageUrl.trim()) {
      showNotification("error", "Please upload or provide a desktop banner image.");
      return;
    }

    setIsSaving(true);
    try {
      if (!supabase) throw new Error("Supabase client not available");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        badge: formBadge.trim() || null,
        image_url: formImageUrl.trim(),
        mobile_image_url: formMobileImageUrl.trim() || null,
        destination_type: formDestType,
        destination_ref: formDestRef.trim() || null,
        destination_url: formDestUrl.trim() || "/products",
        cta_label: formCtaLabel.trim() || "Explore Now",
        starts_at: formStartsAt ? new Date(formStartsAt).toISOString() : new Date().toISOString(),
        ends_at: formEndsAt ? new Date(formEndsAt).toISOString() : null,
        show_countdown: formShowCountdown,
        countdown_heading: formCountdownHeading.trim() || "ENDS IN",
        status: formStatus,
        display_order: Number(formDisplayOrder) || 0,
        updated_at: new Date().toISOString(),
      };

      if (editingCampaign) {
        // Update
        const { error } = await supabase
          .from("promotional_campaigns")
          .update(payload)
          .eq("id", editingCampaign.id);

        if (error) throw error;

        // Audit log
        await supabase.from("staff_audit_logs").insert({
          staff_user_id: user?.id,
          action_type: "UPDATE_CAMPAIGN",
          entity_type: "promotional_campaign",
          entity_id: editingCampaign.id,
          metadata: {
            title: payload.title,
            status: payload.status,
            destination_url: payload.destination_url,
          },
        });

        showNotification("success", "Promotional campaign updated successfully!");
      } else {
        // Create
        const { data: inserted, error } = await supabase
          .from("promotional_campaigns")
          .insert({
            ...payload,
            created_by: user?.id || null,
          })
          .select()
          .single();

        if (error) throw error;

        // Audit log
        await supabase.from("staff_audit_logs").insert({
          staff_user_id: user?.id,
          action_type: "CREATE_CAMPAIGN",
          entity_type: "promotional_campaign",
          entity_id: inserted.id,
          metadata: {
            title: payload.title,
            status: payload.status,
            destination_url: payload.destination_url,
          },
        });

        showNotification("success", "New promotional campaign published to homepage hero!");
      }

      setIsModalOpen(false);
      await loadCampaigns();
    } catch (err: any) {
      console.error("Save error:", err);
      showNotification("error", `Failed to save campaign: ${err.message || "Database error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Publish / Pause
  const handleToggleStatus = async (camp: PromotionalCampaign) => {
    if (!supabase) return;
    const nextStatus = camp.status === "published" ? "paused" : "published";

    try {
      const { error } = await supabase
        .from("promotional_campaigns")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", camp.id);

      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from("staff_audit_logs").insert({
        staff_user_id: user?.id,
        action_type: nextStatus === "published" ? "PUBLISH_CAMPAIGN" : "PAUSE_CAMPAIGN",
        entity_type: "promotional_campaign",
        entity_id: camp.id,
        metadata: { title: camp.title, status: nextStatus },
      });

      showNotification(
        "success",
        `Campaign "${camp.title}" is now ${nextStatus === "published" ? "Live on Homepage" : "Paused"}.`,
      );
      await loadCampaigns();
    } catch (err: any) {
      showNotification("error", `Failed to toggle status: ${err.message}`);
    }
  };

  // Duplicate Campaign
  const handleDuplicate = async (camp: PromotionalCampaign) => {
    if (!supabase) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("promotional_campaigns").insert({
        title: `${camp.title} (Copy)`,
        description: camp.description,
        badge: camp.badge,
        image_url: camp.image_url,
        mobile_image_url: camp.mobile_image_url,
        destination_type: camp.destination_type,
        destination_ref: camp.destination_ref,
        destination_url: camp.destination_url,
        cta_label: camp.cta_label,
        starts_at: new Date().toISOString(),
        ends_at: camp.ends_at,
        show_countdown: camp.show_countdown,
        countdown_heading: camp.countdown_heading,
        status: "draft",
        display_order: camp.display_order + 1,
        created_by: user?.id || null,
      });

      if (error) throw error;
      showNotification("success", "Campaign duplicated as Draft.");
      await loadCampaigns();
    } catch (err: any) {
      showNotification("error", `Failed to duplicate: ${err.message}`);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget || !supabase) return;
    try {
      const { error } = await supabase
        .from("promotional_campaigns")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from("staff_audit_logs").insert({
        staff_user_id: user?.id,
        action_type: "DELETE_CAMPAIGN",
        entity_type: "promotional_campaign",
        entity_id: deleteTarget.id,
        metadata: { title: deleteTarget.title },
      });

      showNotification("success", "Promotional campaign deleted.");
      setDeleteTarget(null);
      await loadCampaigns();
    } catch (err: any) {
      showNotification("error", `Failed to delete campaign: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SHOWCASE GALLERY ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const handleShowcaseUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith("image/")) {
      showNotification("error", "Please select a valid image file.");
      return;
    }

    setIsUploadingShowcase(true);
    const reader = new FileReader();

    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);

          const newItem: ShowcaseItem = {
            id: `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            src: compressedDataUrl,
            caption: captionDraft.trim() || "Customer delivery by IT HUB Kothamangalam",
          };

          if (supabase) {
            supabase
              .from("website_showcase")
              .insert({
                id: newItem.id,
                src: newItem.src,
                caption: newItem.caption,
                display_order: showcase.length + 1,
                is_active: true,
                updated_at: new Date().toISOString(),
              })
              .then(() => {
                loadShowcase();
              });
          }

          setShowcase([newItem, ...showcase]);
          setCaptionDraft("");
          setIsUploadingShowcase(false);
          showNotification("success", "Customer photo added to showcase!");
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    if (showcaseFileRef.current) showcaseFileRef.current.value = "";
  };

  const handleShowcaseDelete = async () => {
    if (!showcaseDeleteTarget) return;

    if (supabase) {
      try {
        await supabase.from("website_showcase").delete().eq("id", showcaseDeleteTarget.id);
      } catch (err) {
        console.error("Failed to delete showcase item:", err);
      }
    }

    setShowcase(showcase.filter((it) => it.id !== showcaseDeleteTarget.id));
    setShowcaseDeleteTarget(null);
    showNotification("success", "Photo removed from customer showcase.");
  };

  // Filtered Campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchBadge = c.badge?.toLowerCase().includes(q);
        const matchDest = c.destination_url.toLowerCase().includes(q);
        if (!matchTitle && !matchBadge && !matchDest) return false;
      }
      return true;
    });
  }, [campaigns, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Page Title & Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Website Content &amp; Promotions
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Manage Homepage Hero promotional campaigns, festival offers, countdown timers, and
            customer showcase photos.
          </p>
        </div>

        {feedback && (
          <div
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold border transition-all ${
              feedback.type === "success"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {/* Primary Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("campaigns")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "campaigns"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Megaphone size={16} />
          <span>Promotional Campaigns ({campaigns.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("showcase")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "showcase"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ImageIcon size={16} />
          <span>Showcase Gallery ({showcase.length})</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* TAB 1: PROMOTIONAL CAMPAIGNS */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {activeTab === "campaigns" && (
        <div className="space-y-5">
          {/* Controls Bar: Search, Filters & Create Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search campaigns by title, badge, or destination…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-100"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                <Filter size={14} className="text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-600 focus:outline-none"
                >
                  <option value="all">All Statuses ({campaigns.length})</option>
                  <option value="published">Published</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="draft">Draft</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>

            {/* Create Campaign CTA */}
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <Plus size={16} /> Create Campaign
            </button>
          </div>

          {/* Campaigns List / Table */}
          {campaignsLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
              Loading promotional campaigns…
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
              <Megaphone size={32} className="mx-auto text-slate-400 mb-2" />
              <h3 className="text-sm font-bold text-slate-800">No campaigns found</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery || statusFilter !== "all"
                  ? "No campaigns match your current filter or search criteria."
                  : "No promotional campaigns created yet. Click 'Create Campaign' to publish your first banner to the Homepage Hero."}
              </p>
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs"
              >
                <Plus size={14} /> Add First Campaign
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCampaigns.map((camp) => {
                const isPublished = camp.status === "published";
                const isPaused = camp.status === "paused";

                return (
                  <div
                    key={camp.id}
                    className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition hover:shadow-md"
                  >
                    <div>
                      {/* Banner Image Preview Header */}
                      <div className="relative aspect-16/8 bg-slate-900 overflow-hidden border-b border-slate-100">
                        <img
                          src={camp.image_url}
                          alt={camp.title}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "/images/showcase/showcase-1.png";
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

                        {/* Badges on preview */}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                          {camp.badge && (
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-xs">
                              {camp.badge}
                            </span>
                          )}
                          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">
                            Order #{camp.display_order}
                          </span>
                        </div>

                        <span
                          className={`absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-xs shadow-xs ${
                            isPublished
                              ? "bg-emerald-600 text-white"
                              : isPaused
                                ? "bg-amber-500 text-white"
                                : "bg-slate-700 text-slate-200"
                          }`}
                        >
                          {camp.status}
                        </span>

                        <div className="absolute bottom-2 left-3 right-3 text-white">
                          <h4 className="font-extrabold text-sm line-clamp-1">{camp.title}</h4>
                        </div>
                      </div>

                      {/* Campaign Body */}
                      <div className="p-4 space-y-2.5 text-xs">
                        {camp.description && (
                          <p className="text-slate-600 line-clamp-2 leading-relaxed">
                            {camp.description}
                          </p>
                        )}

                        {/* Destination Link Info */}
                        <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-700">
                          {camp.destination_type === "product" ? (
                            <ShoppingBag size={13} className="text-blue-600 shrink-0" />
                          ) : camp.destination_type === "service" ? (
                            <Wrench size={13} className="text-emerald-600 shrink-0" />
                          ) : (
                            <Layers size={13} className="text-purple-600 shrink-0" />
                          )}
                          <span className="font-mono text-slate-900 font-bold truncate">
                            {camp.destination_url}
                          </span>
                        </div>

                        {/* Schedule & Countdown Info */}
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" />
                            <span>
                              {camp.ends_at
                                ? `Expires: ${new Date(camp.ends_at).toLocaleDateString()}`
                                : "No expiry"}
                            </span>
                          </div>
                          {camp.show_countdown && (
                            <span className="font-bold text-blue-600">Countdown ON</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 p-3 text-xs">
                      {/* Publish / Pause Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(camp)}
                        className={`inline-flex items-center gap-1 font-bold rounded-lg px-2.5 py-1 text-xs transition ${
                          isPublished
                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        }`}
                      >
                        {isPublished ? <Pause size={12} /> : <Play size={12} />}
                        <span>{isPublished ? "Pause" : "Publish"}</span>
                      </button>

                      {/* Action Menu */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewCampaign(camp)}
                          title="Preview banner"
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-200/70 transition"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(camp)}
                          title="Duplicate campaign"
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-200/70 transition"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(camp)}
                          title="Edit campaign"
                          className="rounded-lg px-2 py-1 font-bold text-blue-600 hover:bg-blue-50 transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(camp)}
                          title="Delete campaign"
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* TAB 2: SHOWCASE GALLERY */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {activeTab === "showcase" && (
        <div className="space-y-5">
          {/* Upload Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Add Customer Setup / Delivery Photo
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                placeholder="Caption: e.g. Customer delivery of custom liquid-cooled gaming PC in Kothamangalam"
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
              />
              <input
                type="file"
                ref={showcaseFileRef}
                onChange={(e) => handleShowcaseUpload(e.target.files)}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <button
                type="button"
                disabled={isUploadingShowcase}
                onClick={() => showcaseFileRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
              >
                <Upload size={14} />
                <span>{isUploadingShowcase ? "Compressing & Uploading…" : "Upload Photo"}</span>
              </button>
            </div>
          </div>

          {/* Photos Grid */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {showcase.map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs"
              >
                <div className="relative aspect-4/3 overflow-hidden bg-slate-100">
                  <img
                    src={item.src}
                    alt={item.caption}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowcasePreviewItem(item)}
                      className="rounded-lg bg-white/90 p-2 text-slate-900 hover:bg-white transition"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowcaseDeleteTarget(item)}
                      className="rounded-lg bg-red-600/90 p-2 text-white hover:bg-red-600 transition"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium text-slate-700 line-clamp-2">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* CAMPAIGN CREATE / EDIT MODAL */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Megaphone size={18} className="text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingCampaign
                    ? "Edit Promotional Campaign"
                    : "Create New Promotional Campaign"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className="mt-4 space-y-4 text-xs">
              {/* Campaign Title */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Campaign Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Special Festive Offers on Laptops & Custom PC Builds"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Supporting Description */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Supporting Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Free diagnostic checkup, genuine thermal repasting, and up to 30% off selected computing hardware."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Badge Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Campaign Badge</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PREDEFINED_BADGES.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setFormBadge(b)}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase transition ${
                        formBadge === b
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Or enter custom badge text (e.g. BACK TO COLLEGE)"
                  value={formBadge}
                  onChange={(e) => setFormBadge(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Desktop Banner Image Upload */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Desktop Promotional Banner (16:8 or landscape){" "}
                  <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Upload image or provide public URL"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none font-mono"
                  />
                  <input
                    type="file"
                    ref={desktopFileInputRef}
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleImageUpload(e.target.files[0], false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={isUploadingDesktop}
                    onClick={() => desktopFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 font-bold text-white hover:bg-slate-900 transition disabled:opacity-50"
                  >
                    <Upload size={13} />
                    <span>{isUploadingDesktop ? "Uploading…" : "Upload"}</span>
                  </button>
                </div>
                {formImageUrl && (
                  <div className="mt-2 rounded-xl border border-slate-200 p-2 bg-slate-50 max-w-sm">
                    <img
                      src={formImageUrl}
                      alt="Banner preview"
                      className="rounded-lg h-24 w-full object-cover"
                    />
                  </div>
                )}
              </div>

              {/* Mobile Banner Image (Optional) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mobile Promotional Banner{" "}
                  <span className="font-normal text-slate-400">
                    (Optional portrait/square asset)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Optional mobile asset URL"
                    value={formMobileImageUrl}
                    onChange={(e) => setFormMobileImageUrl(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none font-mono"
                  />
                  <input
                    type="file"
                    ref={mobileFileInputRef}
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleImageUpload(e.target.files[0], true);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={isUploadingMobile}
                    onClick={() => mobileFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 font-bold text-white hover:bg-slate-900 transition disabled:opacity-50"
                  >
                    <Upload size={13} />
                    <span>{isUploadingMobile ? "Uploading…" : "Upload Mobile"}</span>
                  </button>
                </div>
              </div>

              {/* Destination Configuration */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
                <span className="block font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Campaign Destination &amp; Routing
                </span>

                {/* Destination Type Radio Pills */}
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["product", "Shopify Product", ShoppingBag],
                      ["category", "Category Listing", Layers],
                      ["service", "Service Booking", Wrench],
                      ["url", "Custom Route", ExternalLink],
                    ] as const
                  ).map(([typeKey, label, Icon]) => (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => handleDestinationTypeChange(typeKey)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        formDestType === typeKey
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <Icon size={13} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Type-Specific Selector */}
                {formDestType === "product" && (
                  <div className="space-y-2">
                    <label className="block font-semibold text-slate-700">
                      Select Shopify Product
                    </label>
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="Search product name or handle…"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs"
                      />
                      <div className="max-h-36 overflow-y-auto space-y-1 rounded-xl border border-slate-200 bg-white p-1">
                        {availableProducts
                          .filter(
                            (p) =>
                              p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                              p.handle.toLowerCase().includes(productSearch.toLowerCase()),
                          )
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleProductSelect(p)}
                              className={`flex w-full items-center justify-between p-2 rounded-lg text-left transition ${
                                formDestRef === p.handle
                                  ? "bg-blue-50 text-blue-900 font-bold"
                                  : "hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <span className="truncate">{p.name}</span>
                              {p.price && (
                                <span className="font-mono text-slate-500 font-bold ml-2">
                                  ₹{p.price.toLocaleString("en-IN")}
                                </span>
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {formDestType === "category" && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Select Product Category
                    </label>
                    <select
                      value={formDestRef}
                      onChange={(e) => handleCategorySelect(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-semibold"
                    >
                      {PREDEFINED_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {formDestType === "service" && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Select Service Destination
                    </label>
                    <select
                      value={formDestRef}
                      onChange={(e) => handleServiceSelect(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-semibold"
                    >
                      {PREDEFINED_SERVICES.map((srv) => (
                        <option key={srv.name} value={srv.name}>
                          {srv.name} ({srv.url})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Resolved Destination URL Display */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Resolved Storefront URL
                  </label>
                  <input
                    type="text"
                    required
                    value={formDestUrl}
                    onChange={(e) => setFormDestUrl(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-slate-900 font-mono text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Schedule: Starts At & Ends At */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Campaign Start Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Campaign Expiry Date &amp; Time{" "}
                    <span className="font-normal text-slate-400">(Optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Countdown Configuration */}
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formShowCountdown}
                    onChange={(e) => setFormShowCountdown(e.target.checked)}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  <span className="font-bold text-slate-800">
                    Enable React Bits Odometer Countdown Timer
                  </span>
                </label>
                {formShowCountdown && (
                  <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                    <span className="text-slate-500 font-semibold">Heading:</span>
                    <input
                      type="text"
                      value={formCountdownHeading}
                      onChange={(e) => setFormCountdownHeading(e.target.value)}
                      placeholder="ENDS IN or OFFER CLOSES"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* CTA Label, Display Order & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CTA Button Label</label>
                  <input
                    type="text"
                    value={formCtaLabel}
                    onChange={(e) => setFormCtaLabel(e.target.value)}
                    placeholder="Explore Now"
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min={0}
                    value={formDisplayOrder}
                    onChange={(e) => setFormDisplayOrder(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Publication Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-slate-900 font-bold focus:border-blue-600 focus:outline-none"
                  >
                    <option value="published">Published (Live)</option>
                    <option value="draft">Draft (Hidden)</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>{isSaving ? "Saving Campaign…" : "Save & Publish"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* CAMPAIGN DELETE CONFIRMATION MODAL */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 size={20} />
              <h3 className="font-bold text-slate-900 text-sm">Delete Promotional Campaign?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>? It will
              immediately stop appearing on the storefront Homepage Hero.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition"
              >
                Delete Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* CAMPAIGN PREVIEW MODAL */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {previewCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md"
          onClick={() => setPreviewCampaign(null)}
        >
          <div
            className="relative max-w-3xl w-full rounded-3xl bg-slate-900 overflow-hidden shadow-2xl border border-white/20 text-white p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewCampaign(null)}
              className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black transition"
            >
              <X size={18} />
            </button>

            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-blue-400 block mb-2">
              Storefront Homepage Hero Live Preview
            </span>

            <div className="relative aspect-16/8 overflow-hidden rounded-2xl border border-white/20 bg-slate-950">
              <img
                src={previewCampaign.image_url}
                alt={previewCampaign.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/60 to-transparent" />
              <div className="absolute inset-0 p-6 flex flex-col justify-between">
                <div className="space-y-1.5 max-w-lg">
                  {previewCampaign.badge && (
                    <span className="rounded-full bg-blue-600 px-3 py-0.5 text-[10px] font-black uppercase text-white inline-block">
                      {previewCampaign.badge}
                    </span>
                  )}
                  <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                    {previewCampaign.title}
                  </h3>
                  {previewCampaign.description && (
                    <p className="text-xs text-slate-300 line-clamp-2">
                      {previewCampaign.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {previewCampaign.show_countdown && (
                    <div className="rounded-xl border border-white/20 bg-black/40 px-3 py-1.5 text-xs text-amber-300 font-mono font-bold">
                      {previewCampaign.countdown_heading || "ENDS IN"}: 02d 14h 36m 48s
                    </div>
                  )}
                  <span className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-900">
                    {previewCampaign.cta_label || "Explore Now"} →
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
              <span>
                Destination URL:{" "}
                <code className="text-blue-400">{previewCampaign.destination_url}</code>
              </span>
              <span>
                Status: <strong className="text-white uppercase">{previewCampaign.status}</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* SHOWCASE DELETE MODAL */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {showcaseDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 size={20} />
              <h3 className="font-bold text-slate-900 text-sm">Delete Showcase Photo?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove this delivery photo from the customer showcase?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowcaseDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleShowcaseDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* SHOWCASE PREVIEW MODAL */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {showcasePreviewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md"
          onClick={() => setShowcasePreviewItem(null)}
        >
          <div
            className="relative max-w-2xl w-full rounded-2xl bg-white overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowcasePreviewItem(null)}
              className="absolute right-3 top-3 rounded-full bg-slate-900/60 p-2 text-white hover:bg-slate-900 transition"
            >
              <X size={18} />
            </button>
            <img
              src={showcasePreviewItem.src}
              alt={showcasePreviewItem.caption}
              className="w-full max-h-[70vh] object-contain bg-slate-950"
            />
            <div className="p-4 bg-white">
              <p className="text-xs font-bold text-slate-900">{showcasePreviewItem.caption}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WebsiteContent;
