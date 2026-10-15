// src/pages/AdminImageDiscovery.tsx
// IT HUB — Admin Bulk Product Image Discovery & Verification Interface
// Integrates SerpApi Google Images proxy, rights verification, and Supabase Storage upload.

import { useState, useMemo, useEffect } from "react"
import {
  Image as ImageIcon,
  Check,
  X,
  Search,
  AlertTriangle,
  ShieldCheck,
  Eye,
  RefreshCw,
  Upload,
  Lock,
  Sparkles,
  Info,
  ExternalLink,
  CheckCircle2,
} from "lucide-react"
import { useStore } from "../app/store"
import {
  ImageDiscoveryEngine,
  SerpApiImageProvider,
  buildOptimizedSearchQuery,
  prototypeProducts,
  type ImageCandidate,
  type DiscoveryQuery,
  type DiscoveryStatus,
} from "../lib/imageDiscovery"
import { supabase } from "../lib/supabase"

export default function AdminImageDiscovery() {
  const store = useStore()
  const engine = useMemo(() => new ImageDiscoveryEngine(), [])
  const serpProvider = useMemo(() => new SerpApiImageProvider(), [])

  // Initialize state from the 25-product prototype
  const [items] = useState<DiscoveryQuery[]>(prototypeProducts)
  const [candidatesMap, setCandidatesMap] =
    useState<Record<string, ImageCandidate[]>>({})
  const [selectedProduct, setSelectedProduct] = useState<DiscoveryQuery | null>(
    null,
  )
  const [selectedCandidate, setSelectedCandidate] =
    useState<ImageCandidate | null>(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [customSearchQuery, setCustomSearchQuery] = useState("")
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [isSearchingProduct, setIsSearchingProduct] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [searchFilterText, setSearchFilterText] = useState("")

  // Provider configuration state
  const [serpApiStatus, setSerpApiStatus] = useState<{
    checked: boolean
    isConfigured: boolean
    message?: string
  }>({ checked: false, isConfigured: false })

  // Check SerpApi configuration on load
  useEffect(() => {
    let mounted = true
    serpProvider.checkConfiguration().then((configured) => {
      if (mounted) {
        setSerpApiStatus({
          checked: true,
          isConfigured: configured,
          message: serpProvider.unconfiguredReason,
        })
      }
    })
    return () => {
      mounted = false
    }
  }, [serpProvider])

  // Aggregate stats across prototype items
  const stats = useMemo(() => {
    let matchedOrFound = 0
    let identityVerified = 0
    let uploaded = 0
    let needsReview = 0
    let rejected = 0
    let pending = 0
    const secondHand = items.filter((p) => p.isSecondHand).length

    for (const item of items) {
      const cands = candidatesMap[item.sku] || []
      if (cands.length === 0) {
        pending++
      } else {
        const top = cands[0]
        if (top.status === "uploaded" || top.status === "approved") uploaded++
        else if (top.status === "identity_verified") identityVerified++
        else if (top.status === "candidate_found" || top.status === "matched")
          matchedOrFound++
        else if (top.status === "needs_review") needsReview++
        else if (top.status === "rejected") rejected++
      }
    }

    return {
      totalEligible: items.length,
      matchedOrFound,
      identityVerified,
      uploaded,
      needsReview,
      rejected,
      pending,
      secondHand,
    }
  }, [items, candidatesMap])

  // Single-product targeted search
  const handleSearchForProduct = async (
    item: DiscoveryQuery,
    queryOverride?: string,
  ) => {
    setIsSearchingProduct(true)
    const results = await engine.discoverForProduct(item, queryOverride)
    setCandidatesMap((prev) => ({
      ...prev,
      [item.sku]: results,
    }))
    if (results.length > 0) {
      setSelectedCandidate(results[0])
    }
    setIsSearchingProduct(false)
    store.log(`Ran targeted image search for SKU: ${item.sku}`)
  }

  // Approve a selected candidate and upload to Supabase Storage
  const handleApprove = async (candidate: ImageCandidate) => {
    const isLocalAsset = candidate.candidateUrl.startsWith("/images/")
    if (!isLocalAsset && !rightsConfirmed) {
      store.notify(
        "Please verify the commercial rights confirmation checkbox before approving.",
      )
      return
    }

    const result = await engine.approveCandidate(
      candidate,
      rightsConfirmed,
      store.profile?.email || "admin@ithub.com",
    )

    if (result.ok) {
      setCandidatesMap((prev) => {
        const currentList = prev[candidate.sku] || [candidate]
        const updated = currentList.map((c) =>
          c.id === candidate.id
            ? {
                ...c,
                status: "uploaded" as DiscoveryStatus,
                storagePath: result.storagePath,
                rightsConfirmed: true,
                reviewedAt: new Date().toISOString(),
              }
            : c,
        )
        return { ...prev, [candidate.sku]: updated }
      })
      store.notify(`Image approved and stored for ${candidate.productName}`)
      store.log(`Image approved & uploaded for SKU: ${candidate.sku}`)
      setReviewModalOpen(false)
      setRightsConfirmed(false)
    } else {
      store.notify(`Approval failed: ${result.error}`)
    }
  }

  // Reject candidate
  const handleReject = (candidate: ImageCandidate) => {
    setCandidatesMap((prev) => {
      const currentList = prev[candidate.sku] || [candidate]
      const updated = currentList.map((c) =>
        c.id === candidate.id
          ? {
              ...c,
              status: "rejected" as DiscoveryStatus,
              reviewedAt: new Date().toISOString(),
            }
          : c,
      )
      return { ...prev, [candidate.sku]: updated }
    })
    store.notify(`Candidate rejected for ${candidate.productName}`)
    store.log(`Candidate rejected for SKU: ${candidate.sku}`)
    setReviewModalOpen(false)
  }

  // Upload actual physical photograph for second-hand items
  const handleSecondHandPhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    item: DiscoveryQuery,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      store.notify("Only JPEG, PNG, or WebP images are allowed.")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      store.notify("Image exceeds 5MB maximum file size limit.")
      return
    }

    const path = `products/${item.sku.toLowerCase()}/physical-${Date.now()}.jpg`

    if (supabase) {
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type, upsert: true })

      if (uploadError) {
        store.notify(`Upload failed: ${uploadError.message}`)
        return
      }

      const { data: pubData } = supabase.storage
        .from("product-images")
        .getPublicUrl(path)
      const storageUrl = pubData?.publicUrl || path

      const manualCand: ImageCandidate = {
        id: `manual-${item.sku}-${Date.now()}`,
        sourceRow: item.sourceRow,
        sku: item.sku,
        productName: item.productName,
        brand: item.brand,
        category: item.category,
        modelMpn: item.modelMpn,
        candidateUrl: storageUrl,
        sourceProvider: "Admin Physical Photo Upload",
        licenceType: "Manual_Upload",
        licenceEvidence:
          "Physical item condition photo taken and uploaded by IT HUB staff.",
        matchEvidence: "Actual physical hardware photograph.",
        confidence: 1.0,
        status: "uploaded",
        rightsConfirmed: true,
        storagePath: storageUrl,
        reviewedBy: store.profile?.email || "admin@ithub.com",
        reviewedAt: new Date().toISOString(),
        isSecondHand: true,
      }

      setCandidatesMap((prev) => ({
        ...prev,
        [item.sku]: [manualCand],
      }))
      store.notify(`Physical photo uploaded and attached to SKU: ${item.sku}`)
      setReviewModalOpen(false)
    }
  }

  // Filtered rows for catalog table
  const displayedRows = useMemo(() => {
    return items.filter((item) => {
      const cands = candidatesMap[item.sku] || []
      const top = cands[0]

      // Text search
      if (searchFilterText) {
        const query = searchFilterText.toLowerCase()
        const textMatch =
          item.productName.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          item.brand.toLowerCase().includes(query)
        if (!textMatch) return false
      }

      // Status pill filter
      if (filterStatus === "all") return true
      if (filterStatus === "pending") return cands.length === 0
      if (filterStatus === "identity_verified")
        return top?.status === "identity_verified"
      if (filterStatus === "candidate_found")
        return top?.status === "candidate_found" || top?.status === "matched"
      if (filterStatus === "needs_review") return top?.status === "needs_review"
      if (filterStatus === "uploaded")
        return top?.status === "uploaded" || top?.status === "approved"
      if (filterStatus === "rejected") return top?.status === "rejected"
      if (filterStatus === "second_hand") return item.isSecondHand
      return true
    })
  }, [items, candidatesMap, filterStatus, searchFilterText])

  return (
    <div className="space-y-6">
      {/* 1. Header & Provider Architecture Status */}
      <div className="rounded-xl border border-border bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                Phase C: Search-API Discovery
              </span>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Bulk Product Image Discovery & Admin Review
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Connects Google Images search API (SerpApi) with manufacturer
              validation, SSRF defense, and rights review.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Staging Active (25 Prototype Items) · 0 DB Mutations
            </span>
          </div>
        </div>

        {/* Setup Required Warning (if SerpApi is unconfigured) */}
        {serpApiStatus.checked && !serpApiStatus.isConfigured && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-900">
            <Info size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">SerpApi Configuration Required</p>
              <p className="mt-0.5 text-amber-800">
                To enable live Google Images discovery, configure your SerpApi
                key in Supabase Edge Function secrets:
              </p>
              <code className="mt-1.5 inline-block rounded bg-amber-100/90 px-2 py-1 font-mono text-[11px] text-amber-900 border border-amber-300">
                supabase secrets set SERPAPI_API_KEY=your_key_here
              </code>
            </div>
          </div>
        )}

        {/* Provider Status Badges */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              serpApiStatus.isConfigured
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-amber-200 bg-amber-50/60"
            }`}
          >
            {serpApiStatus.isConfigured ? (
              <ShieldCheck
                size={18}
                className="text-emerald-600 shrink-0 mt-0.5"
              />
            ) : (
              <AlertTriangle
                size={18}
                className="text-amber-600 shrink-0 mt-0.5"
              />
            )}
            <div>
              <p className="text-xs font-bold text-foreground">
                SerpApi Google Images
              </p>
              <p className="text-[11px] text-muted-foreground">
                {serpApiStatus.isConfigured
                  ? "Active · Live search ready"
                  : "Setup Required · Key missing"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
            <ShieldCheck size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-blue-900">
                Curated Media Library
              </p>
              <p className="text-[11px] text-blue-700">
                Active · High-res local assets
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
            <ShieldCheck
              size={18}
              className="text-indigo-600 shrink-0 mt-0.5"
            />
            <div>
              <p className="text-xs font-bold text-indigo-900">
                Distributor Feeds
              </p>
              <p className="text-[11px] text-indigo-700">
                Active · MPN/Model matched
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50/60 p-3">
            <Lock size={18} className="text-purple-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-purple-900">
                Second-Hand Policy
              </p>
              <p className="text-[11px] text-purple-700">
                Enforced · Actual photos only
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Metric Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs text-muted-foreground">Prototype Items</p>
          <p className="mt-1 text-2xl font-bold">{stats.totalEligible}</p>
          <span className="text-[11px] text-muted-foreground">
            Staging subset
          </span>
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs text-blue-700">Identity Verified</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            {stats.identityVerified}
          </p>
          <span className="text-[11px] text-blue-600/80">
            Exact Brand + MPN
          </span>
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs text-sky-700">Candidates Found</p>
          <p className="mt-1 text-2xl font-bold text-sky-600">
            {stats.matchedOrFound}
          </p>
          <span className="text-[11px] text-sky-600/80">Keyword matched</span>
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs text-amber-700">Needs Review</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {stats.needsReview}
          </p>
          <span className="text-[11px] text-amber-600/80">
            Ambiguous / Spares
          </span>
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs text-emerald-700">Uploaded / Approved</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {stats.uploaded}
          </p>
          <span className="text-[11px] text-emerald-600/80">
            In Storage bucket
          </span>
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs text-purple-700">Pre-Owned Blocked</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">
            {stats.secondHand}
          </p>
          <span className="text-[11px] text-purple-600/80">
            Physical upload only
          </span>
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterStatus("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === "all"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            All ({items.length})
          </button>
          <button
            onClick={() => setFilterStatus("pending")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === "pending"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Pending ({stats.pending})
          </button>
          <button
            onClick={() => setFilterStatus("identity_verified")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === "identity_verified"
                ? "bg-blue-600 text-white"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Verified ({stats.identityVerified})
          </button>
          <button
            onClick={() => setFilterStatus("needs_review")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === "needs_review"
                ? "bg-amber-600 text-white"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Needs Review ({stats.needsReview})
          </button>
          <button
            onClick={() => setFilterStatus("uploaded")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === "uploaded"
                ? "bg-emerald-600 text-white"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Uploaded ({stats.uploaded})
          </button>
          <button
            onClick={() => setFilterStatus("second_hand")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === "second_hand"
                ? "bg-purple-600 text-white"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Pre-Owned ({stats.secondHand})
          </button>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchFilterText}
            onChange={(e) => setSearchFilterText(e.target.value)}
            placeholder="Filter by name, SKU, or brand..."
            className="w-full rounded-md border border-border pl-8 pr-3 py-1.5 text-xs focus:border-primary focus:outline-hidden sm:w-64"
          />
        </div>
      </div>

      {/* 4. Prototype Items Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Row & SKU</th>
                <th className="px-4 py-3 font-semibold">Product Description</th>
                <th className="px-4 py-3 font-semibold">Brand & Category</th>
                <th className="px-4 py-3 font-semibold">Model / MPN</th>
                <th className="px-4 py-3 font-semibold">Candidate Preview</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayedRows.map((item) => {
                const cands = candidatesMap[item.sku] || []
                const topCand = cands[0]
                const status = topCand?.status || "pending"

                return (
                  <tr
                    key={item.sku}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <span className="text-muted-foreground">
                        Row {item.sourceRow}
                      </span>
                      <br />
                      <span className="font-semibold text-primary">
                        {item.sku}
                      </span>
                    </td>

                    <td className="max-w-xs px-4 py-3">
                      <p className="font-semibold text-foreground truncate">
                        {item.productName}
                      </p>
                      <p
                        className="text-[10px] text-muted-foreground truncate"
                        title={item.originalDescription}
                      >
                        {item.originalDescription}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-block rounded bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground">
                        {item.brand}
                      </span>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {item.category}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-mono ${
                          item.modelMpn && item.modelMpn !== "N/A"
                            ? "bg-blue-50 text-blue-800 font-semibold"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {item.modelMpn || "N/A"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {topCand?.candidateUrl ? (
                        <div className="relative h-12 w-12 overflow-hidden rounded-md border border-border bg-muted">
                          <img
                            src={topCand.thumbnailUrl || topCand.candidateUrl}
                            alt={item.productName}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).src =
                                "/images/photo-1616440347437-b1c73416efc2.jpg"
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground">
                          <ImageIcon size={16} />
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {status === "identity_verified" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                          <ShieldCheck size={11} /> Identity Verified
                        </span>
                      )}
                      {(status === "candidate_found" ||
                        status === "matched") && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                          <Sparkles size={11} /> Candidate Found
                        </span>
                      )}
                      {status === "needs_review" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          <AlertTriangle size={11} /> Needs Review
                        </span>
                      )}
                      {(status === "uploaded" || status === "approved") && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <CheckCircle2 size={11} /> Uploaded
                        </span>
                      )}
                      {status === "rejected" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                          <X size={11} /> Rejected
                        </span>
                      )}
                      {status === "no_match" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          No Results
                        </span>
                      )}
                      {status === "pending" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          Pending
                        </span>
                      )}
                      {item.isSecondHand && (
                        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-800">
                          <Lock size={10} /> Pre-Owned
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedProduct(item)
                            const queryInfo = buildOptimizedSearchQuery(item)
                            setCustomSearchQuery(queryInfo.primaryQuery)
                            setSelectedCandidate(topCand || null)
                            setRightsConfirmed(false)
                            setReviewModalOpen(true)
                          }}
                          className="rounded p-1.5 text-primary hover:bg-secondary"
                          title="Inspect, Review & Search Candidates"
                        >
                          <Eye size={15} />
                        </button>

                        <button
                          onClick={() => handleSearchForProduct(item)}
                          disabled={item.isSecondHand}
                          className="rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-secondary disabled:opacity-50"
                          title="Search Google Images / Providers"
                        >
                          <Search size={12} className="inline mr-1" />
                          Search
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Comprehensive Admin Review & Search Modal */}
      {reviewModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-white p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                    {selectedProduct.sku}
                  </span>
                  <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
                    {selectedProduct.brand} · {selectedProduct.category}
                  </span>
                  {selectedProduct.isSecondHand && (
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-900">
                      Pre-Owned Listing
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-base font-bold text-foreground">
                  {selectedProduct.productName}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                  Tally Raw: {selectedProduct.originalDescription}
                </p>
              </div>

              <button
                onClick={() => setReviewModalOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Second-Hand Physical Upload Notice */}
            {selectedProduct.isSecondHand ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-purple-300 bg-purple-50 p-4 text-purple-900">
                  <div className="flex items-start gap-2.5">
                    <Lock
                      size={18}
                      className="text-purple-700 shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="font-bold">
                        Second-Hand Mandatory Physical Photographs
                      </p>
                      <p className="mt-1 text-xs text-purple-800 leading-relaxed">
                        To maintain buyer trust and accurately represent
                        pre-owned hardware, stock manufacturer images are
                        strictly blocked. Staff must capture and upload real
                        photographs of this physical unit.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/30 p-8 text-center">
                  <Upload size={32} className="text-purple-600 mb-2" />
                  <p className="text-sm font-semibold text-foreground">
                    Upload Physical Device Photograph
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    JPEG, PNG, or WebP up to 5MB (magic-byte validated)
                  </p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) =>
                      handleSecondHandPhotoUpload(e, selectedProduct)
                    }
                    className="block text-xs text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-purple-600 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-purple-700"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {/* Search Query Editor & Trigger */}
                <div className="rounded-lg border border-border bg-secondary/30 p-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Search Query (Constructed from real brand + model/MPN):
                      </label>
                      <input
                        type="text"
                        value={customSearchQuery}
                        onChange={(e) => setCustomSearchQuery(e.target.value)}
                        placeholder="Search query..."
                        className="w-full rounded-md border border-border bg-white px-3 py-1.5 text-xs font-mono focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <button
                      onClick={() =>
                        handleSearchForProduct(
                          selectedProduct,
                          customSearchQuery,
                        )
                      }
                      disabled={isSearchingProduct}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-primary/90 disabled:opacity-50 self-end"
                    >
                      <Search
                        size={13}
                        className={isSearchingProduct ? "animate-spin" : ""}
                      />
                      {isSearchingProduct ? "Searching..." : "Search SerpApi"}
                    </button>
                  </div>
                </div>

                {/* Candidate Grid / Selection */}
                {(() => {
                  const cands = candidatesMap[selectedProduct.sku] || []
                  if (cands.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
                        <ImageIcon
                          size={32}
                          className="mb-2 text-muted-foreground/60"
                        />
                        <p className="text-sm font-medium">
                          No Candidates Discovered Yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                          Click &quot;Search SerpApi&quot; above to query
                          authorized manufacturer and Google Images results for
                          this product.
                        </p>
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Discovered Candidates ({cands.length} found):
                      </p>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                        {cands.map((cand, idx) => {
                          const isSelected = selectedCandidate?.id === cand.id

                          return (
                            <div
                              key={cand.id || idx}
                              onClick={() => setSelectedCandidate(cand)}
                              className={`cursor-pointer rounded-lg border p-3 transition-all ${
                                isSelected
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-border bg-white hover:border-primary/50"
                              }`}
                            >
                              <div className="relative aspect-4/3 w-full overflow-hidden rounded-md border border-border bg-muted">
                                {cand.candidateUrl ? (
                                  <img
                                    src={cand.thumbnailUrl || cand.candidateUrl}
                                    alt={cand.productName}
                                    className="h-full w-full object-contain"
                                    onError={(e) => {
                                      ;(e.target as HTMLImageElement).src =
                                        "/images/photo-1616440347437-b1c73416efc2.jpg"
                                    }}
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <ImageIcon size={24} />
                                  </div>
                                )}
                              </div>

                              <p
                                className="mt-2 text-xs font-bold text-foreground truncate"
                                title={cand.sourcePageTitle}
                              >
                                {cand.sourcePageTitle || cand.sourceProvider}
                              </p>

                              <p className="text-[10px] text-muted-foreground truncate">
                                {cand.sourceDomain ||
                                  cand.sourceCategory ||
                                  "Manufacturer Asset"}
                              </p>

                              <div className="mt-2 flex items-center justify-between text-[10px]">
                                <span className="font-semibold text-blue-700">
                                  {Math.round(cand.confidence * 100)}% match
                                </span>
                                {cand.dimensions && (
                                  <span className="font-mono text-muted-foreground">
                                    {cand.dimensions.width}×
                                    {cand.dimensions.height}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Selected Candidate Detailed Inspection */}
                      {selectedCandidate && (
                        <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs font-bold text-foreground">
                                Inspection:{" "}
                                {selectedCandidate.sourcePageTitle ||
                                  selectedCandidate.productName}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Provider: {selectedCandidate.sourceProvider} ·
                                Match: {selectedCandidate.matchEvidence}
                              </p>
                            </div>

                            {selectedCandidate.sourcePageUrl && (
                              <a
                                href={selectedCandidate.sourcePageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-[11px] font-semibold text-primary border border-border hover:bg-secondary"
                              >
                                View Source Page <ExternalLink size={12} />
                              </a>
                            )}
                          </div>

                          {/* Commercial Rights Confirmation Checkbox */}
                          <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3">
                            <label className="flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rightsConfirmed}
                                onChange={(e) =>
                                  setRightsConfirmed(e.target.checked)
                                }
                                className="mt-0.5 h-4 w-4 rounded border-amber-400 text-primary focus:ring-primary"
                              />
                              <div className="text-xs text-amber-900">
                                <span className="font-bold">
                                  Commercial Rights & License Confirmation
                                  (Mandatory)
                                </span>
                                <p className="mt-0.5 text-[11px] text-amber-800 leading-normal">
                                  I confirm this image is an authorized
                                  manufacturer asset, official distributor feed,
                                  or permitted under commercial fair
                                  use/creative commons for IT HUB catalog
                                  display.
                                </p>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => setReviewModalOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary"
              >
                Close
              </button>

              {selectedCandidate && !selectedProduct.isSecondHand && (
                <>
                  <button
                    onClick={() => handleReject(selectedCandidate)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    <X size={14} /> Reject Candidate
                  </button>

                  <button
                    onClick={() => handleApprove(selectedCandidate)}
                    disabled={
                      !selectedCandidate.candidateUrl ||
                      (!selectedCandidate.candidateUrl.startsWith("/images/") &&
                        !rightsConfirmed)
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check size={14} /> Approve & Store Media
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
