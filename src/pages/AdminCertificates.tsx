import { useState, useRef } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ShieldCheck,
  BadgeCheck,
  Award,
  Upload,
  ArrowUpRight,
  RotateCcw,
  ZoomIn,
  Link as LinkIcon,
} from "lucide-react";
import { useStore } from "../app/store";
import { type CertificateItem, initialCertificates } from "../data/catalog";
import { Button, Modal, Field, fieldClass } from "../components/ui";

export default function AdminCertificates({ view = "all" }: { view?: string }) {
  const store = useStore();
  const certificates = store.certificates || initialCertificates;

  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(view === "add");
  const [editingCert, setEditingCert] = useState<CertificateItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CertificateItem | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [previewCert, setPreviewCert] = useState<CertificateItem | null>(null);

  // Form Fields
  const [text, setText] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [validity, setValidity] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [formError, setFormError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openCreate = () => {
    setEditingCert(null);
    setText("");
    setBrand("");
    setCategory("Laptops & Computing");
    setValidity("2026 Certified");
    setDescription("");
    setImage("");
    setShopUrl("");
    setFormError("");
    setEditorOpen(true);
  };

  const openEdit = (cert: CertificateItem) => {
    setEditingCert(cert);
    setText(cert.text);
    setBrand(cert.brand);
    setCategory(cert.category);
    setValidity(cert.validity);
    setDescription(cert.description);
    setImage(cert.image);
    setShopUrl(cert.shopUrl || "");
    setFormError("");
    setEditorOpen(true);
  };

  const handleImageFile = (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setFormError("Please upload a valid image file (JPG, PNG, WebP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Downscale to max 900px width/height for snappy performance & localStorage persistence
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setImage(dataUrl);
          setFormError("");
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setFormError("Please enter the certificate or partnership title.");
      return;
    }
    if (!brand.trim()) {
      setFormError("Please specify the brand name (e.g. ASUS, Canon, Epson).");
      return;
    }
    if (!image.trim()) {
      setFormError("Please upload a certificate photo or enter an image URL.");
      return;
    }

    if (editingCert) {
      // Update existing certificate
      const updated: CertificateItem = {
        ...editingCert,
        text: text.trim(),
        brand: brand.trim(),
        category: category.trim() || "Technology",
        status: editingCert.status || "Authorised Partner",
        validity: validity.trim() || "Certified Partner",
        description: description.trim(),
        image: image.trim(),
        alt: `${text.trim()} Certificate for IT HUB`,
        shopUrl: shopUrl.trim() || undefined,
      };

      store.set((s) => ({
        certificates: (s.certificates || initialCertificates).map((c) =>
          c.id === editingCert.id ? updated : c,
        ),
      }));
      store.log(`Updated showcase certificate: ${updated.text}`);
      store.notify(`Certificate "${updated.text}" updated successfully`);
    } else {
      // Create new certificate
      const newCert: CertificateItem = {
        id: `cert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: text.trim(),
        brand: brand.trim(),
        category: category.trim() || "Technology",
        status: "Authorised Partner",
        validity: validity.trim() || "Certified Partner",
        description: description.trim(),
        image: image.trim(),
        alt: `${text.trim()} Certificate for IT HUB`,
        shopUrl: shopUrl.trim() || undefined,
      };

      store.set((s) => ({
        certificates: [newCert, ...(s.certificates || initialCertificates)],
      }));
      store.log(`Added showcase certificate: ${newCert.text}`);
      store.notify(`Certificate "${newCert.text}" published to showcase`);
    }

    setEditorOpen(false);
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    const targetTitle = deleteConfirm.text;

    store.set((s) => ({
      certificates: (s.certificates || initialCertificates).filter((c) => c.id !== id),
    }));
    store.log(`Deleted showcase certificate: ${targetTitle}`);
    store.notify(`Certificate "${targetTitle}" removed from showcase`);
    setDeleteConfirm(null);
  };

  const handleReset = () => {
    store.set(() => ({
      certificates: initialCertificates,
    }));
    store.log("Reset showcase certificates to default manufacturer partners");
    store.notify("Showcase certificates restored to default manufacturer list");
    setResetConfirm(false);
  };

  // Filter certificates
  const filtered = certificates.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.text.toLowerCase().includes(q) ||
      c.brand.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.validity.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Overview Top Card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck size={18} />
              </span>
              <h2 className="text-xl font-bold text-foreground">
                Showcase Certificates & Accreditations
              </h2>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Manage manufacturer partnerships, reseller authorizations, and awards shown in the
              Recognition section on the main website.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" onClick={() => setResetConfirm(true)} className="text-xs">
              <RotateCcw size={14} /> Reset Defaults
            </Button>
            <Button onClick={openCreate} className="text-xs">
              <Plus size={15} /> Add Certificate
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">Active Showcase</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{certificates.length}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">Unique Brands</p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {new Set(certificates.map((c) => c.brand)).size}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">Product Categories</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {new Set(certificates.map((c) => c.category)).size}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">Public Display</p>
            <p className="mt-1 text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <BadgeCheck size={14} /> Live on /about
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search certificates by brand, title, category..."
            className={`${fieldClass} pl-9 text-xs`}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {certificates.length} certificates
        </p>
      </div>

      {/* Certificates Cards Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center">
          <Award size={36} className="mx-auto text-muted-foreground/60" />
          <h3 className="mt-3 text-base font-bold text-foreground">No certificates found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Try adjusting your search or add a new manufacturer certificate.
          </p>
          <Button onClick={openCreate} className="mt-4 text-xs">
            <Plus size={14} /> Add Certificate
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cert) => (
            <div
              key={cert.id}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md"
            >
              <div>
                {/* Image Preview Container */}
                <div
                  onClick={() => setPreviewCert(cert)}
                  className="group relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-xl border border-border/70 bg-muted/40 p-2 flex items-center justify-center transition-colors hover:bg-muted/60"
                >
                  <img
                    src={cert.image}
                    alt={cert.alt || cert.text}
                    className="h-full w-full object-contain rounded-lg transition-transform group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10 rounded-xl" />
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
                    <ZoomIn size={12} /> Inspect
                  </span>
                </div>

                {/* Metadata */}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold text-primary">
                    {cert.brand}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                    <BadgeCheck size={12} /> {cert.validity}
                  </span>
                </div>

                <h3 className="mt-2 font-display text-sm font-bold text-foreground line-clamp-1">
                  {cert.text}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {cert.description}
                </p>

                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{cert.category}</span>
                  {cert.shopUrl && (
                    <span className="flex items-center gap-0.5 text-primary">
                      <LinkIcon size={11} /> Linked
                    </span>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
                <button
                  type="button"
                  onClick={() => openEdit(cert)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(cert)}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/10"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Certificate Modal */}
      <Modal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingCert ? "Edit Certificate" : "Add Showcase Certificate"}
        description="Add manufacturer partner accreditations to display on the storefront About page."
        size="max-w-2xl"
      >
        <form onSubmit={handleSave} className="mt-2 space-y-4">
          {formError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Certificate Title *">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. ASUS Premium Partner"
                className={fieldClass}
                required
              />
            </Field>

            <Field label="Brand Name *">
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. ASUS, Canon, Epson, Intel"
                className={fieldClass}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Product Category">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Laptops & Computing, Printers"
                className={fieldClass}
              />
            </Field>

            <Field label="Validity / Status Chip">
              <input
                value={validity}
                onChange={(e) => setValidity(e.target.value)}
                placeholder="e.g. 2026 Certified, Authorised Reseller"
                className={fieldClass}
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the authorization, product warranty, and genuine sales partnership..."
              className={fieldClass}
            />
          </Field>

          {/* Certificate Image Upload & URL */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-foreground">Certificate Image *</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <input
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="Paste Image URL or click Upload photo"
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/60 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Upload size={14} /> Upload Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageFile(e.target.files)}
              />
            </div>

            {/* Image Preview Box */}
            {image && (
              <div className="relative mt-2 flex h-44 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20 p-2">
                <img
                  src={image}
                  alt="Certificate preview"
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
                <button
                  type="button"
                  onClick={() => setImage("")}
                  className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white hover:bg-black/80"
                >
                  Clear Image
                </button>
              </div>
            )}
          </div>

          <Field label="Catalog Shop Link (Optional)">
            <input
              value={shopUrl}
              onChange={(e) => setShopUrl(e.target.value)}
              placeholder="e.g. /products?brand=ASUS"
              className={fieldClass}
            />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingCert ? "Save Changes" : "Publish to Showcase"}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Certificate"
        description="Are you sure you want to remove this certificate from the showcase?"
        size="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This will immediately remove{" "}
            <span className="font-bold text-foreground">{deleteConfirm?.text}</span> from the About
            page on the main storefront.
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center justify-center rounded-full bg-destructive px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-destructive/90"
            >
              Delete Certificate
            </button>
          </div>
        </div>
      </Modal>

      {/* Reset Confirmation Modal */}
      <Modal
        open={resetConfirm}
        onOpenChange={setResetConfirm}
        title="Reset Certificates to Defaults"
        description="Restore original manufacturer certificates (ASUS, Canon, Epson, Numeric, IGGIS, Intel)?"
        size="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Any custom certificates added will be replaced by the default verified partner list.
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setResetConfirm(false)}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#0c2f8a]"
            >
              Confirm Reset
            </button>
          </div>
        </div>
      </Modal>

      {/* Full Preview Modal */}
      <Modal
        open={!!previewCert}
        onOpenChange={(open) => !open && setPreviewCert(null)}
        title={previewCert?.text || "Certificate Preview"}
        description={previewCert?.description}
        size="max-w-3xl"
      >
        {previewCert && (
          <div className="space-y-4">
            <div className="flex items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/20 p-3 shadow-inner">
              <img
                src={previewCert.image}
                alt={previewCert.alt || previewCert.text}
                className="max-h-[65vh] w-auto max-w-full rounded-xl object-contain shadow-xs"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-xs">
              <span className="font-semibold text-foreground">
                Brand: {previewCert.brand} · Category: {previewCert.category}
              </span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <BadgeCheck size={14} /> {previewCert.validity}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
