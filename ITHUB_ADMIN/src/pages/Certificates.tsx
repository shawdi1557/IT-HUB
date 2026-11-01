// ITHUB_ADMIN/src/pages/Certificates.tsx
// IT HUB Staff Portal — Partner & Manufacturer Authorisation Certificates Manager

import { useState, useRef, useEffect } from "react";
import {
  Award,
  Plus,
  Pencil,
  Trash2,
  Search,
  RotateCcw,
  Upload,
  CheckCircle2,
  AlertCircle,
  Eye,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

export interface CertificateItem {
  id: string;
  image: string;
  text: string;
  brand: string;
  category: string;
  status: string;
  validity: string;
  description: string;
  alt: string;
  shopUrl?: string;
  isPublished?: boolean;
}

export const DEFAULT_CERTIFICATES: CertificateItem[] = [
  {
    id: "cert-asus",
    image: "/images/recognition/asus-premium-partner.jpg",
    text: "ASUS Premium Partner",
    brand: "ASUS",
    category: "Laptops & Computing",
    status: "Authorised Premium Partner",
    validity: "2026 Certified",
    description:
      "Certified ASUS Premium Partner 2026 — 100% authentic ROG, TUF, ZenBook laptops and motherboards with direct manufacturer warranty.",
    alt: "ASUS Premium Partner Certificate for IT HUB",
    shopUrl: "/products?brand=ASUS",
    isPublished: true,
  },
  {
    id: "cert-canon",
    image: "/images/recognition/canon-authorised-reseller.jpg",
    text: "Canon Authorised Reseller",
    brand: "Canon",
    category: "Printers & Consumables",
    status: "Authorised Reseller",
    validity: "Official Reseller",
    description:
      "Officially recognized Canon Reseller delivering genuine PIXMA & imageCLASS printers, high-yield toner cartridges, and expert support.",
    alt: "Canon Authorised Reseller Certificate for IT HUB",
    shopUrl: "/products?brand=Canon",
    isPublished: true,
  },
  {
    id: "cert-epson",
    image: "/images/recognition/epson-channel-partner.jpg",
    text: "Epson Channel Partner",
    brand: "Epson",
    category: "EcoTank Printers & Supplies",
    status: "Certified Channel Partner",
    validity: "2026 – 2027",
    description:
      "Officially accredited Epson Certified Channel Partner delivering genuine EcoTank printers, original inks, and imaging systems.",
    alt: "Epson Certified Channel Partner Certificate for IT HUB",
    shopUrl: "/products?brand=Epson",
    isPublished: true,
  },
  {
    id: "cert-numeric",
    image: "/images/recognition/numeric-energy-partner.jpg",
    text: "Numeric Energy Partner",
    brand: "Numeric",
    category: "UPS & Power Systems",
    status: "Authorised Energy Partner",
    validity: "Authorised Partner",
    description:
      "Authorised sales and support partner for Numeric by Legrand power backup, line-interactive UPS, and energy storage solutions.",
    alt: "Numeric Authorised Energy Partner Certificate for IT HUB",
    shopUrl: "/products?category=Power%20%26%20UPS",
    isPublished: true,
  },
  {
    id: "cert-iggis",
    image: "/images/recognition/iggis-honour-recognition.jpg",
    text: "IGGIS Honour & Recognition",
    brand: "IGGIS",
    category: "Institutional IT Partner",
    status: "Excellence Recognition",
    validity: "Partnership Award",
    description:
      "Honour & recognition awarded by Indira Gandhi Group of Institutions for exceptional technology supply and institutional support.",
    alt: "Indira Gandhi Group of Institutions recognition award presented to IT HUB",
    isPublished: true,
  },
  {
    id: "cert-intel",
    image: "/images/about-store.png",
    text: "Intel Partner Alliance",
    brand: "Intel",
    category: "Processors & Systems",
    status: "Alliance Member",
    validity: "Active Member",
    description:
      "Official Intel® Partner Alliance Member delivering authentic Core processors, boxed CPUs, and certified desktop computing solutions.",
    alt: "Intel Partner Alliance Membership Certificate for IT HUB",
    shopUrl: "/products?brand=Intel",
    isPublished: true,
  },
];

export function normalizeCertificates(list: CertificateItem[]): CertificateItem[] {
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_CERTIFICATES;

  let result = list.map((c) => {
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

  const hasIggis = result.some((c) => c.id === "cert-iggis");
  if (!hasIggis) {
    const iggisDefault = DEFAULT_CERTIFICATES.find((c) => c.id === "cert-iggis");
    if (iggisDefault) {
      const intelIndex = result.findIndex((c) => c.id === "cert-intel");
      if (intelIndex !== -1) {
        result.splice(intelIndex, 0, iggisDefault);
      } else {
        result.push(iggisDefault);
      }
    }
  }

  return result;
}

export function handleCertificateImageError(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  certId?: string,
) {
  const target = e.currentTarget;
  if (!target.dataset.triedFallback) {
    target.dataset.triedFallback = "true";
    if (certId === "cert-intel") {
      target.src = "/images/about-store.png";
    }
  }
}

export function Certificates() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [certificates, setCertificates] = useState<CertificateItem[]>(() => {
    try {
      const stored = localStorage.getItem("ithub-store-v2");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed?.certificates) && parsed.certificates.length > 0) {
          const normalized = normalizeCertificates(parsed.certificates);
          if (JSON.stringify(normalized) !== JSON.stringify(parsed.certificates)) {
            localStorage.setItem(
              "ithub-store-v2",
              JSON.stringify({ ...parsed, certificates: normalized }),
            );
          }
          return normalized;
        }
      }
    } catch {}
    return DEFAULT_CERTIFICATES;
  });

  // Sync certificates from PostgreSQL public.partner_certificates on mount and Realtime
  useEffect(() => {
    let isMounted = true;
    const loadCertificates = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from("partner_certificates")
          .select("*")
          .order("display_order", { ascending: true });

        if (!error && data && data.length > 0 && isMounted) {
          const mapped: CertificateItem[] = data.map((d: any) => ({
            id: d.id,
            text: d.text,
            brand: d.brand,
            category: d.category,
            status: d.status || "Active Member",
            validity: d.validity || "2026 Certified",
            description: d.description || "",
            image: d.image,
            alt: d.alt || `${d.text} Certificate for IT HUB`,
            shopUrl: d.shop_url || undefined,
            isPublished: d.is_published !== false,
          }));
          setCertificates(mapped);
          try {
            const currentRaw = localStorage.getItem("ithub-store-v2");
            const current = currentRaw ? JSON.parse(currentRaw) : {};
            localStorage.setItem(
              "ithub-store-v2",
              JSON.stringify({ ...current, certificates: mapped }),
            );
          } catch {}
        }
      } catch (err) {
        console.error("Failed to load partner certificates from database:", err);
      }
    };
    loadCertificates();

    const channel = supabase
      ? supabase
          .channel("staff-certificates-sync")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "partner_certificates" },
            () => {
              loadCertificates();
            },
          )
          .subscribe()
      : null;

    return () => {
      isMounted = false;
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const [brandFilter, setBrandFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editingCert, setEditingCert] = useState<CertificateItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CertificateItem | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [previewCert, setPreviewCert] = useState<CertificateItem | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  // Form Fields
  const [formText, setFormText] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formCategory, setFormCategory] = useState("Laptops & Computing");
  const [formValidity, setFormValidity] = useState("2026 Certified");
  const [formDescription, setFormDescription] = useState("");
  const [formImage, setFormImage] = useState("");
  const [formShopUrl, setFormShopUrl] = useState("");
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [formError, setFormError] = useState("");

  const showNotification = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  const persistCertificates = (newList: CertificateItem[]) => {
    try {
      const currentRaw = localStorage.getItem("ithub-store-v2");
      const current = currentRaw ? JSON.parse(currentRaw) : {};
      localStorage.setItem("ithub-store-v2", JSON.stringify({ ...current, certificates: newList }));
      setCertificates(newList);
    } catch {
      showNotification("error", "Failed to save certificates to storage.");
    }
  };

  const openCreateModal = () => {
    setEditingCert(null);
    setFormText("");
    setFormBrand("");
    setFormCategory("Laptops & Computing");
    setFormValidity("2026 Certified");
    setFormDescription("");
    setFormImage("");
    setFormShopUrl("");
    setFormIsPublished(true);
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (cert: CertificateItem) => {
    setEditingCert(cert);
    setFormText(cert.text);
    setFormBrand(cert.brand);
    setFormCategory(cert.category);
    setFormValidity(cert.validity);
    setFormDescription(cert.description);
    setFormImage(cert.image);
    setFormShopUrl(cert.shopUrl || "");
    setFormIsPublished(cert.isPublished !== false);
    setFormError("");
    setIsModalOpen(true);
  };

  const handleImageUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith("image/")) {
      setFormError("Please select a valid image file (JPG, PNG, WebP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setFormImage(canvas.toDataURL("image/jpeg", 0.85));
          setFormError("");
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formText.trim()) {
      setFormError("Please specify certificate title.");
      return;
    }
    if (!formBrand.trim()) {
      setFormError("Please specify manufacturer / brand.");
      return;
    }
    if (!formImage.trim()) {
      setFormError("Please upload an image or provide an image URL.");
      return;
    }

    const newId = editingCert
      ? editingCert.id
      : `cert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newStatus = editingCert?.status || "Authorised Partner";
    const newValidity = formValidity.trim() || "2026 Certified";
    const newAlt = `${formText.trim()} Certificate for IT HUB`;

    const newIsPublished = editingCert ? formIsPublished : true;

    const itemToSave: CertificateItem = {
      id: newId,
      text: formText.trim(),
      brand: formBrand.trim(),
      category: formCategory.trim(),
      status: newStatus,
      validity: newValidity,
      description: formDescription.trim(),
      image: formImage.trim(),
      shopUrl: formShopUrl.trim() || undefined,
      alt: newAlt,
      isPublished: newIsPublished,
    };

    // 1. Authoritative persistence in PostgreSQL public.partner_certificates
    if (supabase) {
      try {
        const payload = {
          id: itemToSave.id,
          text: itemToSave.text,
          brand: itemToSave.brand,
          category: itemToSave.category,
          status: itemToSave.status,
          validity: itemToSave.validity,
          description: itemToSave.description,
          image: itemToSave.image,
          alt: itemToSave.alt,
          shop_url: itemToSave.shopUrl || null,
          is_published: itemToSave.isPublished !== false,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from("partner_certificates").upsert(payload);
        if (error) {
          console.error("Database save failed for certificate:", error);
        } else {
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            await supabase.from("staff_audit_logs").insert({
              staff_user_id: user?.id || "4df85a8a-fb06-431d-ae85-831e4b3564d4",
              action_type: editingCert ? "UPDATE_CERTIFICATE" : "CREATE_CERTIFICATE",
              entity_type: "partner_certificate",
              entity_id: itemToSave.id,
              previous_status: editingCert
                ? editingCert.isPublished === false
                  ? "Unpublished"
                  : "Published"
                : null,
              new_status: itemToSave.isPublished === false ? "Unpublished" : "Published",
              metadata: {
                id: itemToSave.id,
                text: itemToSave.text,
                brand: itemToSave.brand,
                is_published: itemToSave.isPublished !== false,
              },
            });
          } catch {}
        }
      } catch (err) {
        console.error("Error upserting certificate:", err);
      }
    }

    // 2. Update local state & mirror to localStorage
    const updatedList = editingCert
      ? certificates.map((c) => (c.id === editingCert.id ? itemToSave : c))
      : [itemToSave, ...certificates];

    persistCertificates(updatedList);
    showNotification(
      "success",
      editingCert
        ? `Certificate "${itemToSave.text}" updated successfully.`
        : `Certificate "${itemToSave.text}" published to showcase.`,
    );
    setIsModalOpen(false);
  };

  const handleTogglePublish = async (cert: CertificateItem) => {
    const nextPublished = cert.isPublished === false;
    const prevStatus = cert.isPublished === false ? "Unpublished" : "Published";
    const newStatus = nextPublished ? "Published" : "Unpublished";
    const actionType = nextPublished ? "PUBLISH_CERTIFICATE" : "UNPUBLISH_CERTIFICATE";

    if (supabase) {
      try {
        const { error } = await supabase
          .from("partner_certificates")
          .update({
            is_published: nextPublished,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cert.id);

        if (error) {
          console.error("Failed to update certificate publication status:", error);
          showNotification("error", `Failed to update ${cert.text}.`);
          return;
        }

        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          await supabase.from("staff_audit_logs").insert({
            staff_user_id: user?.id || "4df85a8a-fb06-431d-ae85-831e4b3564d4",
            action_type: actionType,
            entity_type: "partner_certificate",
            entity_id: cert.id,
            previous_status: prevStatus,
            new_status: newStatus,
            metadata: {
              id: cert.id,
              text: cert.text,
              brand: cert.brand,
              is_published: nextPublished,
            },
          });
        } catch (auditErr) {
          console.warn("Audit log insert warning:", auditErr);
        }
      } catch (err) {
        console.error("Database update error:", err);
      }
    }

    const updatedList = certificates.map((c) =>
      c.id === cert.id ? { ...c, isPublished: nextPublished } : c,
    );
    persistCertificates(updatedList);
    showNotification(
      "success",
      `Certificate "${cert.text}" ${nextPublished ? "published to" : "hidden from"} public storefront.`,
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    // 1. Authoritative deletion from PostgreSQL public.partner_certificates
    if (supabase) {
      try {
        const { error } = await supabase
          .from("partner_certificates")
          .delete()
          .eq("id", deleteTarget.id);

        if (error) {
          console.error("Failed to delete certificate from database:", error);
        } else {
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            await supabase.from("staff_audit_logs").insert({
              staff_user_id: user?.id || "4df85a8a-fb06-431d-ae85-831e4b3564d4",
              action_type: "DELETE_CERTIFICATE",
              entity_type: "partner_certificate",
              entity_id: deleteTarget.id,
              previous_status: deleteTarget.isPublished === false ? "Unpublished" : "Published",
              new_status: "Deleted",
              metadata: { id: deleteTarget.id, text: deleteTarget.text, brand: deleteTarget.brand },
            });
          } catch {}
        }
      } catch (err) {
        console.error("Database deletion error:", err);
      }
    }

    // 2. Update local state & mirror to localStorage
    const filtered = certificates.filter((c) => c.id !== deleteTarget.id);
    persistCertificates(filtered);
    setDeleteTarget(null);
    showNotification("success", `Certificate "${deleteTarget.text}" removed.`);
  };

  const handleResetDefaults = async () => {
    // 1. Re-seed default certificates in PostgreSQL public.partner_certificates
    if (supabase) {
      try {
        const dbRows = DEFAULT_CERTIFICATES.map((c, index) => ({
          id: c.id,
          text: c.text,
          brand: c.brand,
          category: c.category,
          status: c.status,
          validity: c.validity,
          description: c.description,
          image: c.image,
          alt: c.alt,
          shop_url: c.shopUrl || null,
          display_order: index + 1,
          is_published: true,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from("partner_certificates").upsert(dbRows);
      } catch (err) {
        console.error("Failed to reset certificates in database:", err);
      }
    }

    persistCertificates(DEFAULT_CERTIFICATES);
    setResetConfirm(false);
    showNotification("success", "Reset to verified manufacturer partner certificates.");
  };

  const brands = ["ALL", ...Array.from(new Set(certificates.map((c) => c.brand).filter(Boolean)))];

  const filtered = certificates.filter((c) => {
    const matchesBrand =
      brandFilter === "ALL" || c.brand.toLowerCase() === brandFilter.toLowerCase();
    const matchesSearch =
      !search.trim() ||
      c.text.toLowerCase().includes(search.toLowerCase()) ||
      c.brand.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    return matchesBrand && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Manufacturer &amp; Partner Certificates
            </h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
              {certificates.filter((c) => c.isPublished !== false).length} Published ·{" "}
              {certificates.length} Total
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Publish verified partner and OEM certifications (ASUS, Canon, Epson, Numeric, IGGIS,
            Intel) displayed on the public storefront.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setResetConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <RotateCcw size={13} />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
          >
            <Plus size={15} />
            <span>Add Certificate</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 mr-1">Brand:</span>
          {brands.map((b) => (
            <button
              key={b}
              onClick={() => setBrandFilter(b)}
              className={`rounded-full px-3 py-1 transition whitespace-nowrap ${
                brandFilter === b
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search certificates..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* Certificates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((cert) => (
          <div
            key={cert.id}
            className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-xs shadow-2xs hover:shadow-md transition"
          >
            <div>
              {/* Image Preview Header */}
              <div className="relative aspect-16/10 bg-slate-100 overflow-hidden border-b border-slate-100">
                <img
                  src={cert.image}
                  alt={cert.alt || cert.text}
                  onError={(e) => handleCertificateImageError(e, cert.id)}
                  className="h-full w-full object-cover transition hover:scale-105 duration-300"
                />
                <span className="absolute top-2.5 right-2.5 rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-xs">
                  {cert.validity}
                </span>
                <span className="absolute top-2.5 left-2.5 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                  {cert.brand}
                </span>
                <span
                  className={`absolute bottom-2.5 left-2.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold backdrop-blur-xs ${
                    cert.isPublished === false
                      ? "bg-amber-600/90 text-white"
                      : "bg-emerald-600/90 text-white"
                  }`}
                >
                  {cert.isPublished === false ? "Hidden from Storefront" : "Active on Storefront"}
                </span>
              </div>

              {/* Body */}
              <div className="p-4 space-y-2">
                <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{cert.text}</h3>
                <p className="text-[11px] text-slate-500 font-semibold">{cert.category}</p>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {cert.description}
                </p>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewCert(cert)}
                  className="inline-flex items-center gap-1 font-bold text-slate-600 hover:text-slate-900 transition"
                >
                  <Eye size={13} /> View
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePublish(cert)}
                  className={`inline-flex items-center gap-1 font-bold transition ${
                    cert.isPublished === false
                      ? "text-emerald-600 hover:text-emerald-800"
                      : "text-amber-600 hover:text-amber-800"
                  }`}
                  title={
                    cert.isPublished === false
                      ? "Publish to public storefront"
                      : "Hide from public storefront"
                  }
                >
                  {cert.isPublished === false ? "Publish" : "Unpublish"}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(cert)}
                  className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800 transition"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(cert)}
                  className="inline-flex items-center gap-1 font-bold text-red-600 hover:text-red-800 transition"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-md overflow-y-auto">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg rounded-none sm:rounded-2xl bg-white p-4 sm:p-6 shadow-2xl space-y-4 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Award size={18} className="text-blue-600" />
                <span>{editingCert ? "Edit Partner Certificate" : "Add Partner Certificate"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close dialog"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl bg-red-50 p-2.5 text-xs font-semibold text-red-700 border border-red-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveCertificate} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Certificate / Partnership Title *
                </label>
                <input
                  type="text"
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="e.g. ASUS Premium Partner"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Brand Name *</label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="e.g. ASUS"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Laptops & Computing"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Validity Period</label>
                  <input
                    type="text"
                    value={formValidity}
                    onChange={(e) => setFormValidity(e.target.value)}
                    placeholder="e.g. 2026 Certified"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Catalog Shop Link</label>
                  <input
                    type="text"
                    value={formShopUrl}
                    onChange={(e) => setFormShopUrl(e.target.value)}
                    placeholder="e.g. /products?brand=ASUS"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Official OEM certification details..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Certificate Image *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formImage.startsWith("data:") ? "Uploaded Image (data-url)" : formImage}
                    onChange={(e) => setFormImage(e.target.value)}
                    placeholder="Image URL or upload below"
                    className="flex-1 rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e.target.files)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Upload size={14} /> Upload
                  </button>
                </div>
              </div>

              {formImage && (
                <div className="rounded-xl border border-slate-200 p-2 bg-slate-50 max-w-xs mx-auto">
                  <img
                    src={formImage}
                    alt="Certificate preview"
                    onError={(e) => handleCertificateImageError(e, editingCert?.id)}
                    className="rounded-lg max-h-36 object-contain mx-auto"
                  />
                </div>
              )}

              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <input
                  type="checkbox"
                  id="formIsPublished"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="formIsPublished"
                  className="text-xs font-bold text-slate-700 cursor-pointer select-none"
                >
                  Published on public Customer Storefront
                  <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                    Uncheck to hide this certificate from the public site while retaining it in the
                    database.
                  </span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2.5 sm:gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto min-h-[44px] rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[44px] rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition"
                >
                  {editingCert ? "Update Certificate" : "Publish Certificate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 size={20} />
              <h3 className="font-bold text-slate-900 text-sm">Delete Certificate?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove &quot;{deleteTarget.text}&quot; from the storefront?
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
                onClick={handleDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Defaults Confirmation Modal */}
      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <RotateCcw size={20} />
              <h3 className="font-bold text-slate-900 text-sm">Reset to OEM Defaults?</h3>
            </div>
            <p className="text-xs text-slate-600">
              This will restore the standard ASUS, Canon, Epson, Numeric, IGGIS, and Intel partner
              certificates.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetConfirm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-xs"
          onClick={() => setPreviewCert(null)}
        >
          <div
            className="relative max-w-xl w-full rounded-2xl bg-white overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewCert(null)}
              className="absolute right-3 top-3 rounded-full bg-slate-900/60 p-1.5 text-white hover:bg-slate-900 transition"
            >
              <X size={16} />
            </button>
            <img
              src={previewCert.image}
              alt={previewCert.text}
              onError={(e) => handleCertificateImageError(e, previewCert.id)}
              className="w-full max-h-[70vh] object-contain bg-slate-950"
            />
            <div className="p-4 bg-white">
              <h4 className="text-sm font-bold text-slate-900">{previewCert.text}</h4>
              <p className="text-xs text-slate-600 mt-1">{previewCert.description}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Certificates;
