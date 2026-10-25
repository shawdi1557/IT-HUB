import { useEffect, useState, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router"
import {
  Cpu,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Zap,
  Save,
  ShoppingBag,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Gamepad2,
  Clapperboard,
  Briefcase,
  DraftingCompass,
  House,
  PenLine,
  Check,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  Info,
  PackageX,
} from "lucide-react"
import { useStore } from "../app/store"
import { track } from "../lib/analytics"
import WhatsAppIcon from "../components/WhatsAppIcon"
import {
  componentOptions,
  images,
  money,
  type ComponentOption,
} from "../data/catalog"
import {
  initialBuildTemplates,
  type BuildPurpose,
  type BuildTemplate,
} from "../data/buildTemplates"
import { Badge, Button, Modal, Page, PageHeading } from "../components/ui"

import {
  checkCompatibility,
  compatibility,
  fetchBuilderComponents,
  saveBuild,
  loadSavedBuilds,
  deleteSavedBuild,
  prepareShopifyCheckout,
  generateWhatsAppQuotation,
  type CanonicalBuild,
  type CanonicalBuildComponent,
  type ComponentSlotId,
  type CompatibilitySummary,
} from "../lib/builder"

export { compatibility }

function toCanonicalRecord(parts: Record<string, ComponentOption>): Partial<Record<ComponentSlotId, CanonicalBuildComponent>> {
  const canonicalParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {}
  for (const [key, part] of Object.entries(parts)) {
    if (!part) continue
    const slot = key as ComponentSlotId
    canonicalParts[slot] = {
      slot,
      productId: part.id || `part-${key}`,
      variantId: part.variantId || "",
      title: part.name || `${key} component`,
      price: part.price || 0,
      currency: "INR",
      specs: {
        socket: part.socket,
        supportedRamGeneration: part.ram,
        ramGeneration: part.ram,
        tdpWatts: part.watts,
        powerWatts: part.watts,
        ratedWattage: part.capacity,
        lengthMm: part.length,
        maxGpuLengthMm: part.clearance,
        maxCoolerHeightMm: part.clearance,
        coolerHeightMm: (part as any).height,
        hasWifi: part.wifi,
        requiresBiosUpdateForRyzen5000: part.bios,
        includesCooler: (part as any).includesCooler,
        hasIntegratedGraphics: (part as any).hasIntegratedGraphics ?? (key === "CPU" ? (part.name?.includes("G") || part.socket === "AM5") : undefined),
        provenance: part.provenance as any || (part.isVerified === false ? "unverified" : "manufacturer_verified"),
      },
      availability: part.stock === 0 ? "unavailable" : "available",
      quantity: 1,
      retrievedAt: new Date().toISOString(),
      isShopifyLive: Boolean(part.variantId),
      isVerified: part.isVerified !== false,
      matchedModelKey: part.matchedModelKey,
    }
  }
  return canonicalParts
}
function ExpertBuilder({
  initialParts,
  initialName,
  savedId,
  onBack,
}: {
  initialParts: Record<string, ComponentOption>
  initialName: string
  savedId?: string
  onBack: () => void
}) {
  const store = useStore()
  const navigate = useNavigate()
  const [parts, setParts] =
    useState<Record<string, ComponentOption>>(initialParts)
  const [selection, setSelection] = useState("")
  const [name, setName] = useState(initialName)
  const [filter, setFilter] = useState("")
  const [ready, setReady] = useState(false)
  const [savingBuild, setSavingBuild] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const total = Object.values(parts).reduce((sum, item) => sum + item.price, 0)
  const { result, watts, recommended, valid, complete } = compatibility(parts)

  const createCanonical = (): CanonicalBuild => ({
    id: savedId || crypto.randomUUID(),
    userId: store.profile?.id,
    name: name.trim() || "My custom PC",
    mode: "expert",
    currency: "INR",
    components: toCanonicalRecord(parts),
    compatibility: compatibility(parts).summary,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const save = async () => {
    if (!store.loggedIn) {
      store.notify("Please log in to save your build")
      store.setAuthOpen(true)
      return
    }
    setSavingBuild(true)
    const canonical = createCanonical()
    const res = await saveBuild(canonical)
    setSavingBuild(false)

    if (res.success) {
      const build = {
        id: res.id,
        name: canonical.name,
        parts: { ...parts },
        price: total,
      }
      if (savedId && store.builds.some((item) => item.id === savedId)) {
        store.set((previous) => ({
          builds: previous.builds.map((item) =>
            item.id === savedId ? { ...item, ...build, id: savedId } : item,
          ),
        }))
      } else {
        store.set((previous) => ({ builds: [build, ...previous.builds] }))
      }
      track("PC Build Saved", { build: canonical.name })
      store.log(`PC build saved: ${canonical.name}`)
      store.notify("Your PC build is saved to My Account")
      setReady(true)
    } else {
      store.notify(res.error || "Failed to save build")
    }
  }

  const partList = Object.keys(store.componentCatalog)
    .filter((type) => parts[type])
    .map((type) => ({ type, name: parts[type].name, price: parts[type].price }))

  const enquire = () => {
    const canonical = createCanonical()
    const quote = generateWhatsAppQuotation(canonical, store.settings.whatsapp)
    store.set((previous) => ({
      pcEnquiries: [
        {
          id: quote.referenceId,
          summary: name.trim() || "My custom PC",
          parts: partList,
          estimate: total,
          date: new Date().toISOString(),
          status: "New",
        },
        ...previous.pcEnquiries,
      ],
    }))
    store.log(`PC quotation requested: ${quote.referenceId}`)
    track("Contact/WhatsApp Action", { context: "PC Builder quotation", ref: quote.referenceId })
    window.open(quote.whatsappUrl, "_blank", "noopener,noreferrer")
  }

  const add = async () => {
    setCheckingOut(true)
    setCheckoutError(null)
    const canonical = createCanonical()
    const res = await prepareShopifyCheckout(canonical)
    setCheckingOut(false)

    if (res.success && res.checkoutUrl) {
      window.location.href = res.checkoutUrl
    } else {
      setCheckoutError(res.error || "Unable to proceed to direct Shopify checkout. You can request a WhatsApp quotation below.")
      setReady(true)
    }
  }
  return (
    <Page>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-xs font-semibold text-primary"
      >
        <ArrowLeft size={14} /> Back to Smart PC Builder
      </button>
      <PageHeading
        eyebrow="EXPERT MODE"
        title="Advanced Component Builder"
        description="Choose each component yourself. We check compatibility and calculate the estimated price in real time."
      />
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary px-5 py-4">
        <p className="text-xs text-primary">
          {Object.keys(parts).length} of 8 components selected
        </p>
        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-primary/10">
          <div
            className={`h-full rounded-full bg-primary transition-all ${["w-0", "w-[12.5%]", "w-1/4", "w-[37.5%]", "w-1/2", "w-[62.5%]", "w-3/4", "w-[87.5%]", "w-full"][Object.keys(parts).length]}`}
          />
        </div>
        <button
          onClick={() => {
            setParts({})
            store.notify("Build reset")
          }}
          className="flex items-center gap-2 text-xs text-primary"
        >
          <RotateCcw size={13} /> Reset build
        </button>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_370px]">
        <div className="space-y-3">
          {Object.keys(store.componentCatalog).map((type, index) => (
            <div
              key={type}
              className={`flex flex-wrap items-center gap-4 rounded-lg border p-5 ${
                parts[type]
                  ? "border-primary/20 bg-secondary/20"
                  : "border-border bg-white"
              }`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-muted">
                <Cpu size={23} className="text-primary" strokeWidth={1.5} />
              </div>
              <div className="min-w-32 flex-1">
                <p className="text-[10px] text-muted-foreground">
                  0{index + 1} · {type.toUpperCase()}
                </p>
                <h2 className="mt-1 text-sm font-semibold">
                  {parts[type]?.name || `Select a ${type.toLowerCase()}`}
                </h2>
                {parts[type] && (
                  <p className="mt-1 text-xs text-primary">
                    {money(parts[type].price)}
                  </p>
                )}
              </div>
              {parts[type] && (
                <button
                  aria-label={`Remove ${type}`}
                  onClick={() => {
                    const next = { ...parts }
                    delete next[type]
                    setParts(next)
                  }}
                  className="p-2 text-muted-foreground hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setSelection(type)
                  setFilter("")
                }}
                className="px-3 py-2 text-xs"
              >
                {parts[type] ? "Change" : "Select"}
                <Plus size={13} />
              </Button>
            </div>
          ))}
        </div>
        <aside className="space-y-5 self-start lg:sticky lg:top-28">
          <div className="rounded-lg border border-border p-6">
            <h2 className="mb-5 text-xl font-bold">Your build summary</h2>
            <label className="text-xs text-muted-foreground">
              Build name
              <input
                aria-label="Build name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm text-foreground"
              />
            </label>
            <div className="my-6 space-y-3">
              {partList.map((part) => (
                <div
                  key={part.type}
                  className="flex justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {part.type}
                    </p>
                    <p className="mt-0.5 font-medium">{part.name}</p>
                  </div>
                  <strong className="shrink-0">{money(part.price)}</strong>
                </div>
              ))}
              {!partList.length && (
                <p className="text-xs leading-6 text-muted-foreground">
                  A blank canvas for your next setup. Start with a processor.
                </p>
              )}
            </div>
            <div className="flex items-end justify-between gap-3 border-t border-border pt-5">
              <div>
                <Badge>ESTIMATED PRICE</Badge>
                <p className="mt-2 text-sm">Estimated Build Price</p>
              </div>
              <strong className="text-2xl">{money(total)}</strong>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
              This is an estimated price, not a guaranteed quotation. The final
              price may change based on component availability, current market
              pricing, configuration changes, assembly/service requirements and
              customer requirements.
            </p>
            <div className="mt-6 grid gap-3">
              <Button
                disabled={!complete || !valid}
                onClick={() => setReady(true)}
              >
                Request IT HUB Quotation <CheckCircle2 size={15} />
              </Button>
              <Button
                disabled={!complete || !valid || checkingOut}
                variant="secondary"
                onClick={add}
              >
                {checkingOut ? "Preparing Shopify Cart…" : "Checkout with Shopify"} <ShoppingBag size={15} />
              </Button>
              <Button
                disabled={!complete || !valid || savingBuild}
                variant="secondary"
                onClick={save}
              >
                {savingBuild ? "Saving to Account…" : "Save build"} <Save size={15} />
              </Button>
            </div>
            {(!complete || !valid) && (
              <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
                {!complete
                  ? "Select essential components (CPU, Motherboard, RAM, Storage, PSU, Cabinet) to complete your build."
                  : "Resolve compatibility errors before requesting quotation or purchasing."}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-muted p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Compatibility</h3>
              <Badge tone={!valid ? "red" : complete ? "green" : "gray"}>
                {!valid
                  ? "Incompatible"
                  : complete
                    ? "Compatible"
                    : "In progress"}
              </Badge>
            </div>
            <div className="space-y-3">
              {result.map((check, index) => {
                const Icon =
                  check.state === "ok"
                    ? CheckCircle2
                    : check.state === "error"
                      ? XCircle
                      : AlertTriangle
                return (
                  <p
                    key={index}
                    className={`flex gap-2 text-xs leading-5 ${
                      check.state === "ok"
                        ? "text-emerald-700"
                        : check.state === "error"
                          ? "text-red-600"
                          : "text-amber-700"
                    }`}
                  >
                    <Icon size={15} className="mt-0.5 shrink-0" />
                    {check.label}
                  </p>
                )
              })}
              {!result.length && (
                <p className="text-xs leading-6 text-muted-foreground">
                  Checks appear as you choose your components.
                </p>
              )}
            </div>
            <div className="mt-5 flex items-start gap-3 border-t border-border pt-5">
              <Zap size={20} className="text-primary" />
              <div>
                <p className="text-xs font-medium">
                  Estimated consumption: {watts}W
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Recommended PSU: {recommended || "—"}W or higher
                </p>
              </div>
            </div>
            <p className="mt-4 text-[10px] leading-5 text-muted-foreground">
              Simplified compatibility estimates. Confirm component fit,
              firmware and cooling with IT HUB.
            </p>
          </div>
        </aside>
      </div>
      <Modal
        open={ready}
        onOpenChange={(open) => {
          setReady(open)
          if (!open) setCheckoutError(null)
        }}
        title="Preview your PC configuration"
        description="Send this configuration to IT HUB on WhatsApp to confirm availability and get your final quotation."
      >
        {checkoutError && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 leading-relaxed">
            <p className="font-semibold text-amber-950 mb-0.5">Shopify Checkout Notice</p>
            {checkoutError}
          </div>
        )}
        <div className="space-y-2 rounded-lg bg-muted p-4 text-xs">
          {partList.map((part) => (
            <p key={part.type} className="flex justify-between gap-3">
              <span>
                <span className="text-muted-foreground">{part.type}:</span>{" "}
                {part.name}
              </span>
              <strong className="shrink-0">{money(part.price)}</strong>
            </p>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm">Estimated Price</span>
          <strong className="text-2xl text-primary">{money(total)}</strong>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
          Estimated only — final price may change based on availability, market
          pricing, configuration, assembly/service and your requirements.
        </p>
        <button
          onClick={enquire}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95"
        >
          <WhatsAppIcon size={18} /> Contact IT HUB on WhatsApp
        </button>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => setReady(false)}
        >
          Keep editing
        </Button>
      </Modal>
      <Modal
        open={Boolean(selection)}
        onOpenChange={(open) => {
          if (!open) setSelection("")
        }}
        title={`Choose your ${selection.toLowerCase()}`}
        description="Illustrative component prices. Compatibility updates when you select an option."
      >
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="mb-5 w-full rounded-md border border-border p-3 text-sm"
          placeholder="Search components…"
          aria-label="Search components"
        />
        <div className="space-y-3">
          {(store.componentCatalog[selection] || [])
            .filter((item) =>
              item.name.toLowerCase().includes(filter.toLowerCase()),
            )
            .map((item) => (
              <button
                key={item.id}
                className={`flex w-full items-center justify-between gap-4 rounded-lg border p-4 text-left hover:bg-secondary ${
                  parts[selection]?.id === item.id
                    ? "border-primary"
                    : "border-border"
                }`}
                onClick={() => {
                  setParts({ ...parts, [selection]: item })
                  setSelection("")
                  store.notify("PC component added")
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                    {item.isShopifyLive ? (
                      <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Shopify Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        In-Store Quote
                      </span>
                    )}
                    {item.isVerified === false && (
                      <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Unverified Specs
                      </span>
                    )}
                    {item.stock === 0 && (
                      <span className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                        Out of Stock
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      item.socket,
                      item.ram,
                      item.watts ? `${item.watts}W consumption` : "",
                      item.capacity ? `${item.capacity}W capacity` : "",
                      item.length ? `${item.length}mm length` : "",
                      item.clearance ? `${item.clearance}mm GPU clearance` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-sm font-bold text-primary">
                  {money(item.price)}
                </div>
              </button>
            ))}
          {!(store.componentCatalog[selection] || []).some((item) =>
            item.name.toLowerCase().includes(filter.toLowerCase()),
          ) && (
            <p className="py-6 text-sm text-muted-foreground">
              No matching components. Try a different search.
            </p>
          )}
        </div>
      </Modal>
    </Page>
  )
}

// ───────────────────────── Smart PC Builder ─────────────────────────

type PurposeId = BuildPurpose | "custom"
const purposes: {
  id: PurposeId
  title: string
  text: string
  Icon: typeof Gamepad2
}[] = [
  {
    id: "gaming",
    title: "Gaming",
    text: "Casual, competitive, AAA and high-end gaming",
    Icon: Gamepad2,
  },
  {
    id: "creation",
    title: "Content Creation",
    text: "Video editing, motion graphics, 3D, photo, streaming",
    Icon: Clapperboard,
  },
  {
    id: "work",
    title: "Work / Office",
    text: "Office work, programming, business and productivity",
    Icon: Briefcase,
  },
  {
    id: "professional",
    title: "Professional",
    text: "Software development, CAD, architecture, data/AI",
    Icon: DraftingCompass,
  },
  {
    id: "general",
    title: "General Use",
    text: "Browsing, media, education and home use",
    Icon: House,
  },
  {
    id: "custom",
    title: "Something Else",
    text: "Describe your use case in your own words",
    Icon: PenLine,
  },
]
const followUps: Record<PurposeId, {
  key: string
  question: string
  options: string[]
}[]> = {
  gaming: [
    {
      key: "type",
      question: "What kind of gaming?",
      options: ["Competitive / Esports", "AAA Games", "Both"],
    },
    {
      key: "resolution",
      question: "What resolution do you mainly want?",
      options: ["1080p", "1440p", "4K", "Not sure"],
    },
  ],
  creation: [
    {
      key: "type",
      question: "What do you mainly create?",
      options: [
        "Video",
        "Motion Graphics",
        "3D",
        "Photography",
        "Streaming",
        "Mixed",
      ],
    },
  ],
  work: [
    {
      key: "type",
      question: "What type of work?",
      options: [
        "Office",
        "Programming",
        "Business",
        "Professional Software",
        "Mixed",
      ],
    },
  ],
  professional: [
    {
      key: "type",
      question: "Which kind of professional work?",
      options: [
        "Software Development",
        "Architecture",
        "CAD",
        "Engineering",
        "Data / AI",
      ],
    },
  ],
  general: [
    {
      key: "type",
      question: "What will you mostly use it for?",
      options: ["Browsing", "Media", "Education", "Home use"],
    },
  ],
  custom: [],
}
const keywordFor: Record<string, string[]> = {
  Video: ["video"],
  "Motion Graphics": ["motion"],
  "3D": ["3d", "render", "blender"],
  Photography: ["photo"],
  Streaming: ["stream"],
  Office: ["office"],
  Programming: ["programming", "software"],
  Business: ["business"],
  "Professional Software": ["cad", "engineering", "professional"],
  "Software Development": ["software", "programming"],
  Architecture: ["architecture", "cad"],
  CAD: ["cad"],
  Engineering: ["engineering", "cad"],
  "Data / AI": ["ai", "data"],
  Browsing: ["browsing"],
  Media: ["media"],
  Education: ["education"],
  "Home use": ["home"],
  "Competitive / Esports": ["esports", "competitive", "high-refresh"],
  "AAA Games": ["aaa"],
}
export interface Budget {
  id: string
  label: string
  tier: string
  min: number
  max: number
}
const budgets: Budget[] = [
  {
    id: "40-60",
    label: "₹40,000 – ₹60,000",
    tier: "Entry Level",
    min: 40000,
    max: 60000,
  },
  {
    id: "60-80",
    label: "₹60,000 – ₹80,000",
    tier: "Balanced",
    min: 60000,
    max: 80000,
  },
  {
    id: "80-100",
    label: "₹80,000 – ₹1,00,000",
    tier: "Performance",
    min: 80000,
    max: 100000,
  },
  {
    id: "100-150",
    label: "₹1,00,000 – ₹1,50,000",
    tier: "High Performance",
    min: 100000,
    max: 150000,
  },
  {
    id: "150+",
    label: "₹1,50,000+",
    tier: "Enthusiast",
    min: 150000,
    max: 300000,
  },
]
const brandOptions = ["AMD", "Intel", "NVIDIA"]
const ownedOptions = ["Monitor", "GPU", "Storage", "RAM", "Keyboard/Mouse"]
const pricedOwned = ["GPU", "Storage", "RAM"]
const partOrder = [
  "CPU",
  "GPU",
  "Motherboard",
  "RAM",
  "Storage",
  "PSU",
  "Cooler",
  "Cabinet",
]
const partLabels: Record<string, string> = { Cooler: "CPU Cooler" }
const explanations: Record<string, string> = {
  CPU: "Handles general system processing and gaming workloads.",
  GPU: "Responsible primarily for gaming graphics and GPU-accelerated creative workloads.",
  Motherboard:
    "Connects every component together and decides future upgrade options.",
  RAM: "Helps with multitasking and application performance.",
  Storage:
    "Stores Windows, apps, games and files. NVMe SSDs load things quickly.",
  PSU: "Supplies stable power to every component, with headroom for safety.",
  Cooler: "Keeps the processor cool and quiet under load.",
  Cabinet:
    "Houses and protects the components, with airflow to keep them cool.",
}
const DISCLAIMER =
  "Component prices and availability may change. Final pricing will be confirmed by IT HUB before purchase."
const SLIGHTLY_ABOVE =
  "Slightly above your selected range to provide a better-balanced configuration."

type Answers = {
  purpose: PurposeId | ""
  customText: string
  details: Record<string, string>
  budgetId: string
  customBudget: string
  brands: string[]
  wifi: string
  owned: string[]
}
const emptyAnswers: Answers = {
  purpose: "",
  customText: "",
  details: {},
  budgetId: "",
  customBudget: "",
  brands: [],
  wifi: "",
  owned: [],
}
type DetailBuild = {
  name: string
  tradeoff?: string
  designedFor: string
  highlights: string[]
  parts: Record<string, ComponentOption>
  owned: string[]
  note?: string
  templateId?: string
  inBudget?: boolean
}
export interface RecommendationExtra {
  price: number
  template: BuildTemplate
}
export type Recommendation = DetailBuild & RecommendationExtra

function inferPurpose(text: string): BuildPurpose {
  const t = text.toLowerCase()
  if (
    /blender|unreal|render|3d|video|edit|premiere|davinci|after effects|stream|photo|youtube/.test(
      t,
    )
  )
    return "creation"
  if (
    /cad|autocad|solidworks|revit|architect|machine learning|\bai\b|data|tensorflow|engineering/.test(
      t,
    )
  )
    return "professional"
  if (/game|gaming|fps|esports|valorant|gta/.test(t)) return "gaming"
  if (/office|excel|code|coding|programming|business|accounting|tally/.test(t))
    return "work"
  return "general"
}
function resolvedBudget(answers: Answers) {
  if (answers.budgetId === "custom") {
    const value = Number(answers.customBudget.replace(/[^0-9]/g, ""))
    if (!value) return null
    return {
      min: Math.round(value * 0.85),
      max: value,
      label: `Around ${money(value)}`,
    }
  }
  const band = budgets.find((item) => item.id === answers.budgetId)
  if (!band) return null
  return {
    min: band.min,
    max: band.max,
    label:
      band.id === "150+"
        ? band.label.replace(/\s/g, "")
        : `${money(band.min)}–${money(band.max)}`,
  }
}
function findPart(
  catalog: Record<string, ComponentOption[]>,
  type: string,
  id: string,
) {
  const normId = id.toLowerCase()
  const bareId = normId.replace(/^[a-z]+-/, "")

  // 1. Direct ID match
  const direct = catalog[type]?.find((item) => item.id === id)
  if (direct) return direct

  // 2. Prioritize authentic live Shopify products matching model key or name
  const liveMatch = catalog[type]?.find((item) => {
    if (!item.isShopifyLive) return false
    if (item.matchedModelKey && (item.matchedModelKey === id || item.matchedModelKey.includes(bareId))) return true
    if (item.name.toLowerCase().includes(bareId)) return true
    return false
  })
  if (liveMatch) return liveMatch

  // 3. Reference catalog model match
  const keyMatch = catalog[type]?.find((item) => {
    if (item.matchedModelKey && (item.matchedModelKey === id || item.matchedModelKey.includes(bareId))) return true
    if (item.name.toLowerCase().includes(bareId)) return true
    return false
  })
  if (keyMatch) return keyMatch

  return componentOptions[type]?.find((item) => item.id === id)
}
const sumParts = (parts: Record<string, ComponentOption>) =>
  Object.values(parts).reduce((sum, item) => sum + item.price, 0)
const isAmd = (part?: ComponentOption) =>
  Boolean(
    part &&
      (part.socket?.startsWith("AM") || /amd|radeon|\brx\b/i.test(part.name)),
  )

/**
 * Recommendation engine. Optimises for purpose match + budget fit + compatibility
 * + performance balance + availability + upgrade potential — never just price.
 */
function recommend(
  templates: BuildTemplate[],
  catalog: Record<string, ComponentOption[]>,
  answers: Answers,
): Recommendation[] {
  const budget = resolvedBudget(answers)
  if (!budget) return []
  const purpose: BuildPurpose =
    answers.purpose === "custom"
      ? inferPurpose(answers.customText)
      : (answers.purpose || "general") as BuildPurpose
  const related: Record<BuildPurpose, BuildPurpose[]> = {
    gaming: ["creation"],
    creation: ["professional", "gaming"],
    work: ["general", "professional"],
    professional: ["creation", "work"],
    general: ["work"],
  }
  const resolution =
    answers.details.resolution && answers.details.resolution !== "Not sure"
      ? answers.details.resolution
      : answers.purpose === "custom" && /4k/i.test(answers.customText)
        ? "4K"
        : ""
  const keywords = [
    ...(keywordFor[answers.details.type] || []),
    ...(answers.purpose === "custom"
      ? answers.customText
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((word) => word.length > 2)
      : []),
  ]
  const owned = answers.owned.filter((item) => pricedOwned.includes(item))
  const scored = templates
    .filter((template) => template.active)
    .map((template) => {
      const parts: Record<string, ComponentOption> = {}
      Object.entries(template.parts).forEach(([type, id]) => {
        const part = findPart(catalog, type, id)
        if (part) parts[type] = part
      })
      // Wi-Fi requested: swap to the cheapest compatible Wi-Fi board.
      if (
        answers.wifi === "Yes" &&
        parts.Motherboard &&
        !parts.Motherboard.wifi
      ) {
        const board = (catalog.Motherboard || [])
          .filter(
            (item) =>
              item.wifi &&
              item.stock !== 0 &&
              compatibility({ ...parts, Motherboard: item }).valid,
          )
          .sort((a, b) => a.price - b.price)[0]
        if (board) parts.Motherboard = board
      }
      const priced = { ...parts }
      owned.forEach((type) => delete priced[type])
      const price = sumParts(priced)
      let score = 0
      if (template.purpose === purpose) score += 50
      else if (related[purpose].includes(template.purpose)) score += 12
      const text =
        `${template.name} ${template.usage} ${template.resolution}`.toLowerCase()
      if (resolution) {
        if (template.resolution.includes(resolution)) score += 16
        else if (template.purpose === "gaming") score -= 8
      }
      if (keywords.some((word) => text.includes(word))) score += 12
      let note = ""
      let inBudget = true
      if (price > budget.max) {
        const over = (price - budget.max) / budget.max
        inBudget = false
        if (over <= 0.1) {
          score += 24
          note = SLIGHTLY_ABOVE
        } else {
          score -= over * 220
          note =
            "Above your selected range — the closest suitable configuration for your needs."
        }
      } else if (price < budget.min) {
        const under = (budget.min - price) / budget.min
        score += under <= 0.25 ? 22 : 22 - under * 120
        note =
          "Below your selected range — covers your needs without overspending."
      } else score += 40
      answers.brands.forEach((brand) => {
        if (brand === "AMD") score += isAmd(parts.CPU) ? 5 : -3
        if (brand === "AMD" && parts.GPU) score += isAmd(parts.GPU) ? 5 : -3
        if (brand === "Intel") score += parts.CPU?.socket === "LGA1700" ? 8 : -4
        if (brand === "NVIDIA" && parts.GPU)
          score += /rtx|nvidia/i.test(parts.GPU.name) ? 8 : -4
      })
      if (Object.values(parts).some((part) => part.stock === 0)) score -= 4
      if (parts.Motherboard?.socket === "AM5") score += 2
      if (!compatibility(parts).valid) score -= 1000
      const designedFor =
        template.purpose === "gaming"
          ? `${resolution || template.resolution || "1080p"} gaming`
          : template.usage.charAt(0).toLowerCase() + template.usage.slice(1)
      return {
        name: template.name,
        tradeoff: template.tradeoff,
        designedFor,
        highlights: template.highlights,
        parts,
        owned,
        note,
        inBudget,
        templateId: template.id,
        template,
        price,
        score,
      }
    })
    .filter((item) => item.score > -500)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, 3).sort((a, b) => a.price - b.price)
}

function alternativeFor(
  catalog: Record<string, ComponentOption[]>,
  parts: Record<string, ComponentOption>,
  type: string,
) {
  const current = parts[type]
  if (!current) return undefined
  return (catalog[type] || [])
    .filter(
      (item) =>
        item.id !== current.id &&
        item.stock !== 0 &&
        compatibility({ ...parts, [type]: item }).valid,
    )
    .sort(
      (a, b) =>
        Math.abs(a.price - current.price) - Math.abs(b.price - current.price),
    )[0]
}

function Progress({ step }: { step: number }) {
  const labels = ["Purpose", "Budget", "Builds"]
  return (
    <ol
      className="mb-10 flex items-center gap-2 overflow-x-auto pb-1 text-xs"
      aria-label="Progress"
    >
      {labels.map((label, index) => (
        <li key={label} className="flex shrink-0 items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
              index < step
                ? "border-primary bg-primary text-white"
                : index === step
                  ? "border-primary bg-secondary text-primary"
                  : "border-border text-muted-foreground"
            }`}
          >
            {index < step ? <Check size={13} /> : index + 1}
          </span>
          <span
            className={
              index <= step
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            }
          >
            {label}
          </span>
          {index < labels.length - 1 && (
            <span
              className={`h-px w-6 sm:w-12 ${
                index < step ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </li>
      ))}
    </ol>
  )
}
function Choice({
  active,
  onClick,
  children,
  round = false,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  round?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
        active
          ? "border-primary bg-secondary font-semibold text-primary"
          : "border-border bg-white hover:border-primary"
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center border ${
          round ? "rounded-full" : "rounded"
        } ${active ? "border-primary bg-primary text-white" : "border-border"}`}
      >
        {active && <Check size={10} strokeWidth={3} />}
      </span>
      {children}
    </button>
  )
}
interface QuestionProps {
  title: string
  children: ReactNode
}

function Question({ title, children }: QuestionProps) {
  return (
    <fieldset className="mt-8">
      <legend className="mb-3 text-sm font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

function BuildDetail({
  initial,
  savedId,
  startCustomizing = false,
  onBack,
  onExpert,
}: {
  initial: DetailBuild
  savedId?: string
  startCustomizing?: boolean
  onBack: () => void
  onExpert: (parts: Record<string, ComponentOption>, name: string) => void
}) {
  const store = useStore()
  const catalog = store.componentCatalog
  const [parts, setParts] = useState(initial.parts)
  const [owned, setOwned] = useState(initial.owned)
  const [name, setName] = useState(initial.name)
  const [customizing, setCustomizing] = useState(startCustomizing)
  const [selection, setSelection] = useState("")
  const [breakdown, setBreakdown] = useState(false)
  const [savingBuild, setSavingBuild] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const priced: Record<string, ComponentOption> = { ...parts }
  owned.forEach((type) => delete priced[type])
  const componentTotal = sumParts(priced)
  const assembly = store.assemblyCharge || 0
  const total = componentTotal + assembly
  const checks = compatibility(parts)
  const changed = JSON.stringify(parts) !== JSON.stringify(initial.parts)
  const rows = partOrder.filter(
    (type) => parts[type] || type === "GPU" || owned.includes(type),
  )
  const display = (type: string) =>
    owned.includes(type)
      ? "Already owned"
      : parts[type]?.name ||
        (type === "GPU"
          ? "Integrated graphics (built into CPU)"
          : "Not selected")
  const why = [
    ...initial.highlights,
    parts.GPU && parts.CPU
      ? "Balanced CPU + GPU combination"
      : "Integrated graphics keeps cost and power low",
    `Suitable for ${initial.designedFor}`,
    parts.Storage
      ? `${parts.Storage.name.split(" ")[0]} fast NVMe storage`
      : "",
    parts.Motherboard?.socket === "AM5" || parts.Motherboard?.wifi
      ? "Upgrade-friendly motherboard"
      : "",
    parts.Motherboard?.wifi ? "Built-in Wi-Fi" : "",
    checks.result.find((check) => check.label.startsWith("PSU"))?.state === "ok"
      ? "Adequate power supply"
      : "",
    checks.valid ? "All parts checked for compatibility" : "",
    !changed && initial.inBudget !== undefined
      ? initial.inBudget
        ? "Fits your selected budget range"
        : initial.note === SLIGHTLY_ABOVE
          ? "Slightly above your range for a better-balanced build"
          : ""
      : "",
  ].filter(Boolean)

  const swap = (type: string, item: ComponentOption) => {
    setParts({ ...parts, [type]: item })
    setOwned(owned.filter((value) => value !== type))
    store.notify(`${partLabels[type] || type} updated — estimate recalculated`)
  }

  const createCanonical = (): CanonicalBuild => ({
    id: savedId || crypto.randomUUID(),
    userId: store.profile?.id,
    name: name.trim() || initial.name,
    mode: "guided",
    currency: "INR",
    components: toCanonicalRecord(parts),
    compatibility: compatibility(parts).summary,
    designedFor: initial.designedFor,
    templateId: initial.templateId,
    ownedSlots: owned as any,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const save = async () => {
    if (!store.loggedIn) {
      store.notify("Please log in to save your build")
      store.setAuthOpen(true)
      return
    }
    setSavingBuild(true)
    const canonical = createCanonical()
    const res = await saveBuild(canonical)
    setSavingBuild(false)

    if (res.success) {
      const build = {
        id: res.id,
        name: canonical.name,
        parts: { ...parts },
        price: componentTotal,
        designedFor: initial.designedFor,
        templateId: initial.templateId,
        owned,
      }
      store.set((previous) => ({
        builds: previous.builds.some((item) => item.id === build.id)
          ? previous.builds.map((item) => (item.id === build.id ? build : item))
          : [build, ...previous.builds],
      }))
      store.log(`PC build saved: ${canonical.name}`)
      store.notify("Saved to My Account → PC Builds")
    } else {
      store.notify(res.error || "Failed to save build")
    }
  }

  const enquire = () => {
    const canonical = createCanonical()
    const quote = generateWhatsAppQuotation(canonical, store.settings.whatsapp)
    store.set((previous) => ({
      pcEnquiries: [
        {
          id: quote.referenceId,
          summary: name.trim() || initial.name,
          parts: partOrder
            .filter((type) => priced[type])
            .map((type) => ({
              type,
              name: priced[type].name,
              price: priced[type].price,
            })),
          estimate: total,
          date: new Date().toISOString(),
          status: "New",
        },
        ...previous.pcEnquiries,
      ],
    }))
    store.log(`PC enquiry sent via WhatsApp: ${name.trim() || initial.name} (${quote.referenceId})`)
    track("Contact/WhatsApp Action", { context: "PC Builder enquiry", ref: quote.referenceId })
    window.open(quote.whatsappUrl, "_blank", "noopener,noreferrer")
  }

  const handleShopifyCheckout = async () => {
    setCheckingOut(true)
    setCheckoutError(null)
    const canonical = createCanonical()
    const res = await prepareShopifyCheckout(canonical)
    setCheckingOut(false)

    if (res.success && res.checkoutUrl) {
      window.location.href = res.checkoutUrl
    } else {
      setCheckoutError(res.error || "Unable to proceed to Shopify checkout. You can request a WhatsApp quotation below.")
    }
  }
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-xs font-semibold text-primary"
      >
        <ArrowLeft size={14} />{" "}
        {savedId ? "Back to PC Builder" : "Back to recommended builds"}
      </button>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          {initial.tradeoff && <Badge>{initial.tradeoff.toUpperCase()}</Badge>}
          {customizing ? (
            <input
              aria-label="Build name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-3 w-full rounded-xl border border-border px-4 py-2 font-display text-2xl font-bold md:text-3xl"
            />
          ) : (
            <h1 className="mt-3 font-display text-3xl font-bold md:text-4xl">
              {name}
            </h1>
          )}
          <p className="mt-3 text-sm">
            <span className="text-muted-foreground">Designed for:</span>{" "}
            <strong>{initial.designedFor}</strong>
          </p>
          {initial.note && !changed && (
            <p className="mt-3 flex gap-2 rounded-xl bg-secondary px-4 py-3 text-xs text-primary">
              <Info size={15} className="mt-0.5 shrink-0" /> {initial.note}
            </p>
          )}
          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-lg font-bold">Components</h2>
            <button
              onClick={() => setCustomizing(!customizing)}
              className="flex items-center gap-2 text-xs font-semibold text-primary"
            >
              <SlidersHorizontal size={14} />{" "}
              {customizing ? "Done customizing" : "Customize This Build"}
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {rows.map((type) => {
              const part = parts[type]
              const isOwned = owned.includes(type)
              const alt =
                part && part.stock === 0 && !isOwned
                  ? alternativeFor(catalog, parts, type)
                  : undefined
              return (
                <div
                  key={type}
                  className="rounded-2xl border border-border bg-white p-4 md:p-5"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Cpu size={20} strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {partLabels[type] || type}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">
                        {display(type)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {isOwned
                          ? "Not included in the estimate — you already own this."
                          : explanations[type]}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {part && !isOwned && (
                        <strong className="text-sm">{money(part.price)}</strong>
                      )}
                      {customizing && (
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => setSelection(type)}
                        >
                          {part && !isOwned ? "Change" : "Add"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {part && part.stock === 0 && !isOwned && (
                    <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                      <p className="flex items-center gap-2 font-semibold">
                        <PackageX size={14} /> Recommended{" "}
                        {partLabels[type] || type} is currently unavailable.
                      </p>
                      {alt ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                          <p>
                            Alternative: <strong>{alt.name}</strong>
                            <br />
                            Price Difference:{" "}
                            <strong>
                              {alt.price - part.price >= 0 ? "+" : "−"}
                              {money(Math.abs(alt.price - part.price))}
                            </strong>
                          </p>
                          <Button
                            className="px-4 py-2 text-xs"
                            onClick={() => swap(type, alt)}
                          >
                            Use Alternative
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-1">
                          IT HUB will suggest an alternative when you enquire.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {customizing && (
            <div className="mt-4 rounded-2xl bg-muted p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Compatibility check</p>
                <Badge tone={checks.valid ? "green" : "red"}>
                  {checks.valid ? "Compatible" : "Needs attention"}
                </Badge>
              </div>
              <div className="mt-3 space-y-1.5">
                {checks.result.map((check, index) => (
                  <p
                    key={index}
                    className={`flex gap-2 text-xs ${
                      check.state === "ok"
                        ? "text-emerald-700"
                        : check.state === "error"
                          ? "text-red-600"
                          : "text-amber-700"
                    }`}
                  >
                    {check.state === "ok" ? (
                      <CheckCircle2 size={14} />
                    ) : check.state === "error" ? (
                      <XCircle size={14} />
                    ) : (
                      <AlertTriangle size={14} />
                    )}
                    {check.label}
                  </p>
                ))}
              </div>
              <button
                onClick={() => onExpert(parts, name)}
                className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary"
              >
                <Wrench size={13} /> Open in Expert Mode
              </button>
            </div>
          )}
          <div className="mt-8 rounded-2xl border border-border p-5 md:p-6">
            <h2 className="text-lg font-bold">Why we recommend this build</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {why.map((item) => (
                <li key={item} className="flex gap-2 text-sm">
                  <Check
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-600"
                  />{" "}
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <aside className="space-y-4 self-start lg:sticky lg:top-28">
          <div className="rounded-2xl border border-border bg-white p-6">
            <Badge>ESTIMATE</Badge>
            <p className="mt-3 text-sm text-muted-foreground">
              Estimated Build Price
            </p>
            <p className="mt-1 font-display text-3xl font-bold text-primary">
              {money(total)}
            </p>
            <button
              onClick={() => setBreakdown(!breakdown)}
              aria-expanded={breakdown}
              className="mt-4 flex w-full items-center justify-between border-t border-border pt-4 text-sm font-semibold"
            >
              Price Breakdown
              <ChevronDown
                size={16}
                className={`transition ${breakdown ? "rotate-180" : ""}`}
              />
            </button>
            {breakdown && (
              <div className="mt-3 space-y-2 text-xs">
                {partOrder
                  .filter((type) => priced[type])
                  .map((type) => (
                    <p key={type} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {partLabels[type] || type}
                      </span>
                      <span>{money(priced[type].price)}</span>
                    </p>
                  ))}
                <p className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                  <span>Component Total</span>
                  <span>{money(componentTotal)}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    Assembly / Service Charge
                  </span>
                  <span
                    className={assembly ? "" : "font-semibold text-emerald-700"}
                  >
                    {assembly ? money(assembly) : "Free"}
                  </span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    Optional Services
                  </span>
                  <span>On request</span>
                </p>
                <p className="flex justify-between gap-3 border-t border-border pt-2 text-sm font-bold">
                  <span>Estimated Total</span>
                  <span>{money(total)}</span>
                </p>
              </div>
            )}
            <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
              {DISCLAIMER}
            </p>
            <div className="mt-6 grid gap-3">
              <p className="text-sm font-bold">Purchase or Confirm with IT HUB</p>
              {checkoutError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                  <p className="font-semibold text-amber-950 mb-0.5">Shopify Checkout Notice</p>
                  {checkoutError}
                </div>
              )}
              <button
                onClick={enquire}
                disabled={!checks.valid}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
              >
                <WhatsAppIcon size={18} /> Continue on WhatsApp
              </button>
              <Button
                variant="secondary"
                onClick={handleShopifyCheckout}
                disabled={!checks.valid || checkingOut}
              >
                {checkingOut ? "Preparing Shopify Cart…" : "Checkout with Shopify"} <ShoppingBag size={15} />
              </Button>
              <Button
                variant="secondary"
                onClick={save}
                disabled={!checks.valid || savingBuild}
              >
                <Save size={15} /> {savingBuild ? "Saving to Account…" : savedId ? "Save Changes" : "Save Build"}
              </Button>
              {!customizing && (
                <Button
                  variant="secondary"
                  onClick={() => onExpert(parts, name)}
                >
                  <SlidersHorizontal size={15} /> Customize in Expert Mode
                </Button>
              )}
              {!checks.valid && (
                <p className="text-[11px] text-red-600">
                  Resolve compatibility issues to continue.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
      <Modal
        open={Boolean(selection)}
        onOpenChange={(open) => !open && setSelection("")}
        title={`Change ${(partLabels[selection] || selection).toLowerCase()}`}
        description="Every option is checked against the rest of your build. The estimate updates instantly."
      >
        <div className="space-y-3">
          {selection === "GPU" &&
            parts.GPU &&
            parts.CPU &&
            /graphics/i.test(parts.CPU.name) && (
              <button
                className="flex w-full items-center justify-between rounded-xl border border-border p-4 text-left text-sm hover:bg-secondary"
                onClick={() => {
                  const next = { ...parts }
                  delete next.GPU
                  setParts(next)
                  setSelection("")
                }}
              >
                Use integrated graphics (remove graphics card)
              </button>
            )}
          {(catalog[selection] || []).map((item) => {
            const check = compatibility({ ...parts, [selection]: item })
            const issue = check.result.find((row) => row.state === "error")
            const current = parts[selection]
            const diff =
              current && !owned.includes(selection)
                ? item.price - current.price
                : item.price
            const active = current?.id === item.id && !owned.includes(selection)
            return (
              <button
                key={item.id}
                disabled={!check.valid || active}
                onClick={() => {
                  swap(selection, item)
                  setSelection("")
                }}
                className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition enabled:hover:bg-secondary disabled:cursor-not-allowed ${
                  active ? "border-primary bg-secondary/40" : "border-border"
                } ${!check.valid ? "opacity-50" : ""}`}
              >
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p
                    className={`mt-1 text-xs ${
                      issue ? "text-red-600" : "text-muted-foreground"
                    }`}
                  >
                    {active
                      ? "Current selection"
                      : issue
                        ? issue.label
                        : item.stock === 0
                          ? "Currently unavailable"
                          : "Compatible with this build"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold">{money(item.price)}</p>
                  {!active && (
                    <p className="text-[11px] text-muted-foreground">
                      {diff >= 0 ? "+" : "−"}
                      {money(Math.abs(diff))}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

function SmartBuilder() {
  const store = useStore()
  const [params, setParams] = useSearchParams()
  const saved = store.builds.find((build) => build.id === params.get("build"))
  const [mode, setMode] = useState<"landing" | "smart" | "expert">(
    params.get("mode") === "expert" ? "expert" : saved ? "smart" : "landing",
  )
  const [expertSeed, setExpertSeed] = useState<{
    parts: Record<string, ComponentOption>
    name: string
    savedId?: string
  }>({ parts: {}, name: "My custom PC" })
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>(emptyAnswers)
  const [detail, setDetail] = useState<DetailBuild | null>(
    saved
      ? {
          name: saved.name,
          designedFor: saved.designedFor || "your custom configuration",
          highlights: [],
          parts: saved.parts,
          owned: saved.owned || [],
          templateId: saved.templateId,
        }
      : null,
  )

  useEffect(() => {
    loadSavedBuilds().then((savedBuilds) => {
      if (savedBuilds.length > 0) {
        store.set((prev) => {
          const existingIds = new Set(prev.builds.map((b) => b.id))
          const fresh = savedBuilds
            .filter((b) => !existingIds.has(b.id))
            .map((b) => ({
              id: b.id,
              name: b.name,
              parts: b.components as any,
              price: Object.values(b.components).reduce((sum, c) => sum + (c?.price || 0), 0),
              designedFor: b.designedFor,
              templateId: b.templateId,
              owned: b.ownedSlots as any,
            }))
          return fresh.length ? { builds: [...prev.builds, ...fresh] } : {}
        })
      }
    })
  }, [])

  useEffect(() => {
    if (store.products.length === 0 && !store.catalogLoading) {
      store.refreshCatalog()
    }
  }, [store.products.length, store.catalogLoading])

  const update = (next: Partial<Answers>) => setAnswers({ ...answers, ...next })
  const templates = store.buildTemplates.length
    ? store.buildTemplates
    : initialBuildTemplates
  const recommendations =
    step === 2 ? recommend(templates, store.componentCatalog, answers) : []
  const budget = resolvedBudget(answers)
  const purposeInfo = purposes.find((item) => item.id === answers.purpose)
  const basedOn = [
    answers.purpose === "custom" ? "Custom use" : purposeInfo?.title,
    ...Object.values(answers.details).filter(
      (value) => value && value !== "Not sure",
    ),
    budget?.label,
  ]
    .filter(Boolean)
    .join(" • ")
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" })
  const go = (next: number) => {
    setStep(next)
    scrollTop()
  }
  const clearSaved = () => {
    if (params.get("build") || params.get("mode")) setParams({})
  }

  if (mode === "expert")
    return (
      <ExpertBuilder
        initialParts={
          expertSeed.parts.CPU || !saved ? expertSeed.parts : saved.parts
        }
        initialName={
          expertSeed.parts.CPU || !saved ? expertSeed.name : saved.name
        }
        savedId={expertSeed.savedId || saved?.id}
        onBack={() => {
          clearSaved()
          setMode(detail ? "smart" : "landing")
        }}
      />
    )

  if (mode === "landing")
    return (
      <Page>
        <section className="grid items-center gap-10 overflow-hidden rounded-[2rem] bg-secondary p-6 md:p-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Badge>SMART PC BUILDER</Badge>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-[#0c2f8a] md:text-5xl">
              Build the Right PC for You
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
              Tell us what you need and your budget. We'll suggest suitable PC
              configurations.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={() => {
                  setMode("smart")
                  setStep(0)
                }}
              >
                <Sparkles size={16} /> Find My PC
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setExpertSeed({ parts: {}, name: "My custom PC" })
                  setMode("expert")
                }}
              >
                I'm an expert — Customize My Build
              </Button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              No technical knowledge needed. Takes about a minute.
            </p>
          </div>
          <img
            src={images.pc}
            alt="Custom-built desktop PC"
            className="aspect-[4/3] w-full rounded-3xl object-cover"
          />
        </section>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Tell us your purpose",
              text: "Gaming, creating, work or everyday use.",
            },
            {
              title: "Set your overall budget",
              text: "One number for the complete PC — not per part.",
            },
            {
              title: "Get matched builds",
              text: "Compatible configurations with clear estimated pricing.",
            },
          ].map((item, index) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border p-6"
            >
              <span className="text-xs font-bold text-primary">
                0{index + 1}
              </span>
              <h2 className="mt-2 font-bold">{item.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
        {store.builds.length > 0 && (
          <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-foreground">Your Saved Configurations</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Resume editing or request an updated quotation</p>
              </div>
              <Badge tone="blue">{store.builds.length} Saved</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {store.builds.map((b) => (
                <div key={b.id} className="flex flex-col justify-between rounded-xl border border-border/80 p-4 bg-muted/20 hover:border-primary/40 transition">
                  <div>
                    <h3 className="text-xs font-bold text-foreground line-clamp-1">{b.name}</h3>
                    <p className="text-xs text-primary font-bold mt-1">{money(b.price)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {Object.keys(b.parts || {}).length} components selected
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="text-xs flex-1 py-1"
                      onClick={() => {
                        setExpertSeed({ parts: b.parts, name: b.name, savedId: b.id })
                        setMode("expert")
                      }}
                    >
                      Open in Expert Mode
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Page>
    )

  if (detail)
    return (
      <Page>
        <BuildDetail
          key={JSON.stringify(detail.parts) + detail.name}
          initial={detail}
          savedId={saved?.id}
          startCustomizing={Boolean(saved)}
          onBack={() => {
            setDetail(null)
            if (saved) {
              clearSaved()
              setMode("landing")
            }
            scrollTop()
          }}
          onExpert={(parts, name) => {
            setExpertSeed({ parts, name, savedId: saved?.id })
            setMode("expert")
          }}
        />
      </Page>
    )

  const purposeReady =
    answers.purpose &&
    (answers.purpose !== "custom" || answers.customText.trim().length > 2)
  return (
    <Page>
      <button
        onClick={() => (step ? go(step - 1) : setMode("landing"))}
        className="mb-6 flex items-center gap-2 text-xs font-semibold text-primary"
      >
        <ArrowLeft size={14} /> Back
      </button>
      <Progress step={step} />

      {step === 0 && (
        <section>
          <h1 className="font-display text-3xl font-bold md:text-4xl">
            What will you mainly use this PC for?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick the closest match — we'll handle the details.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {purposes.map(({ id, title, text, Icon }) => {
              const active = answers.purpose === id
              return (
                <button
                  key={id}
                  aria-pressed={active}
                  onClick={() => update({ purpose: id, details: {} })}
                  className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 md:flex-col md:p-6 ${
                    active
                      ? "border-primary bg-secondary shadow-[0_10px_30px_-15px_rgba(26,79,214,.6)]"
                      : "border-border bg-white hover:border-primary"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                      active
                        ? "bg-primary text-white"
                        : "bg-secondary text-primary"
                    }`}
                  >
                    <Icon size={24} strokeWidth={1.7} />
                  </span>
                  <span>
                    <span className="block font-bold uppercase tracking-wide">
                      {title}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {text}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          {answers.purpose === "custom" && (
            <label className="mt-8 block text-sm font-semibold">
              Describe your use case
              <textarea
                value={answers.customText}
                onChange={(event) => update({ customText: event.target.value })}
                rows={3}
                placeholder="e.g. I need a PC for Blender and Unreal Engine."
                className="mt-3 w-full rounded-xl border border-border p-4 text-sm font-normal focus:border-primary focus:outline-none"
              />
            </label>
          )}
          <div className="mt-10">
            <Button disabled={!purposeReady} onClick={() => go(1)}>
              Continue <ArrowRight size={15} />
            </Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="font-display text-3xl font-bold md:text-4xl">
            What's your overall PC budget?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The complete PC build budget — not individual parts. We treat it as
            a guide, not a hard limit.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {budgets.map((band) => {
              const active = answers.budgetId === band.id
              return (
                <button
                  key={band.id}
                  aria-pressed={active}
                  onClick={() => update({ budgetId: band.id })}
                  className={`rounded-2xl border p-5 text-left transition ${
                    active
                      ? "border-primary bg-secondary"
                      : "border-border bg-white hover:border-primary"
                  }`}
                >
                  <span className="block text-lg font-bold">{band.label}</span>
                  <span
                    className={`mt-1 block text-sm ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {band.tier}
                  </span>
                </button>
              )
            })}
            <div
              className={`rounded-2xl border p-5 transition ${
                answers.budgetId === "custom"
                  ? "border-primary bg-secondary"
                  : "border-border bg-white"
              }`}
            >
              <label
                className="block text-lg font-bold"
                htmlFor="custom-budget"
              >
                Custom Budget
              </label>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-white px-3 focus-within:border-primary">
                <span className="text-sm font-semibold">₹</span>
                <input
                  id="custom-budget"
                  inputMode="numeric"
                  value={answers.customBudget}
                  onFocus={() => update({ budgetId: "custom" })}
                  onChange={(event) =>
                    update({
                      budgetId: "custom",
                      customBudget: event.target.value.replace(/[^0-9]/g, ""),
                    })
                  }
                  placeholder="75000"
                  className="w-full bg-transparent py-2.5 text-sm outline-none"
                />
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button disabled={!budget} onClick={() => go(2)}>
              Show My Builds <ArrowRight size={15} />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <p className="text-xs font-bold tracking-widest text-primary">
            YOUR RECOMMENDED BUILDS
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
            Builds suggested for you
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Based on: <strong className="text-foreground">{basedOn}</strong>
          </p>
          {recommendations.length ? (
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {recommendations.map((build, index) => {
                const unavailable = Object.values(build.parts).some(
                  (part) => part.stock === 0,
                )
                return (
                  <article
                    key={build.templateId}
                    className="flex flex-col rounded-3xl border border-border bg-white p-6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-bold tracking-widest text-muted-foreground">
                        BUILD 0{index + 1}
                      </span>
                      <Badge>{build.tradeoff}</Badge>
                    </div>
                    <h2 className="mt-3 text-xl font-bold">{build.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Designed for {build.designedFor}
                    </p>
                    <ul className="mt-5 space-y-2 text-sm">
                      {["CPU", "GPU", "RAM", "Storage"].map((type) => (
                        <li key={type} className="flex gap-2">
                          <span className="w-16 shrink-0 text-xs text-muted-foreground">
                            {type}
                          </span>
                          <span className="font-medium">
                            {build.owned.includes(type)
                              ? "Already owned"
                              : build.parts[type]?.name ||
                                (type === "GPU" ? "Integrated graphics" : "—")}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-6">
                      <p className="text-xs text-muted-foreground">
                        Estimated price
                      </p>
                      <p className="font-display text-2xl font-bold text-primary">
                        {money(build.price + (store.assemblyCharge || 0))}
                      </p>
                      {build.note && (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {build.note}
                        </p>
                      )}
                      {unavailable && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                          <PackageX size={13} /> One part is out of stock —
                          alternative available
                        </p>
                      )}
                      <Button
                        className="mt-5 w-full"
                        onClick={() => {
                          setDetail(build)
                          scrollTop()
                        }}
                      >
                        View Build <ArrowRight size={15} />
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl bg-muted p-8 text-center">
              <h2 className="text-lg font-bold">
                We couldn't match a ready build
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Try a different budget, or message IT HUB and we'll put together
                a configuration for you.
              </p>
            </div>
          )}
          <p className="mt-6 text-[11px] text-muted-foreground">{DISCLAIMER}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => go(0)}>
              <RotateCcw size={14} /> Change answers
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setExpertSeed({ parts: {}, name: "My custom PC" })
                setMode("expert")
              }}
            >
              <Wrench size={14} /> I know what I want → Build Manually
            </Button>
          </div>
        </section>
      )}
    </Page>
  )
}

export default function Builder() {
  const [params] = useSearchParams()
  useEffect(() => track("PC Builder Started"), [])
  return <SmartBuilder key={params.get("build") || "new"} />
}
