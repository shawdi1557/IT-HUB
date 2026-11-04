import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
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
  Code2,
  DraftingCompass,
  House,
  Check,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  Info,
  PackageX,
} from "lucide-react";
import { useStore } from "../app/store";
import { track } from "../lib/analytics";
import WhatsAppIcon from "../components/WhatsAppIcon";
import { images, money, type ComponentOption } from "../data/catalog";
import { Badge, Button, Modal, Page, PageHeading } from "../components/ui";

import {
  checkCompatibility,
  compatibility,
  fetchBuilderComponents,
  saveBuild,
  loadSavedBuilds,
  deleteSavedBuild,
  submitQuotationRequest,
  savePendingQuotation,
  getPendingQuotation,
  clearPendingQuotation,
  pendingMatchesBuild,
  generateWhatsAppQuotation,
  generateDynamicCatalogRecommendations,
  getBudgetShortfallInfo,
  hasRejectedSpecs,
  RANKING_BASIS,
  reconcileBuildParts,
  toCanonicalComponent,
  type CanonicalBuild,
  type CanonicalBuildComponent,
  type ComponentSlotId,
  type CompatibilitySummary,
} from "../lib/builder";

export { compatibility };

function toCanonicalRecord(
  parts: Record<string, ComponentOption>,
): Partial<Record<ComponentSlotId, CanonicalBuildComponent>> {
  const canonicalParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {};
  for (const [key, part] of Object.entries(parts)) {
    if (part) canonicalParts[key as ComponentSlotId] = toCanonicalComponent(key, part);
  }
  return canonicalParts;
}

/** The sentences listing each unconfirmed value, as opposed to saying what that means for the build. */
const isUnconfirmedDetail = (reason: string) =>
  /^(?:Not yet confirmed|Not stated|Read from the product title|Stated but not reviewed)/.test(
    reason,
  );

/** Why a build has its label, and what the figures behind it rest on. */
function RankingEvidence({ build, compact = false }: { build: DetailBuild; compact?: boolean }) {
  if (!build.rankingReasons?.length && !build.specSources && !build.purposeNotes?.length) {
    return null;
  }
  // A customer needs the outcome first. The list of what's unconfirmed is there for anyone who wants it.
  const reasons = (build.rankingReasons || []).filter((reason) => !isUnconfirmedDetail(reason));
  const toConfirm = (build.rankingReasons || []).filter(isUnconfirmedDetail);
  const shown = compact ? reasons.slice(0, 2) : reasons;
  return (
    <div className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
      {build.purposeNotes?.map((note) => (
        <p key={note} className="text-foreground">
          {note}
        </p>
      ))}
      {shown.map((reason) => (
        <p key={reason}>{reason}</p>
      ))}
      {toConfirm.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">
            What IT HUB still has to confirm
          </summary>
          <div className="space-y-1.5 pb-1">
            {toConfirm.map((reason) => (
              <p key={reason} className="break-words">
                {reason}
              </p>
            ))}
          </div>
        </details>
      )}
      {build.specSources?.CPU && (
        <p>
          <strong className="text-foreground">Processor specs:</strong> {build.specSources.CPU}
        </p>
      )}
      {build.specSources?.GPU && (
        <p>
          <strong className="text-foreground">Graphics card specs:</strong> {build.specSources.GPU}
        </p>
      )}
    </div>
  );
}

const UNVERIFIED_NOTICE =
  "Compatibility cannot be verified because required specifications are unavailable.";

/** CPU, GPU, RAM and PSU stay in capitals in a sentence. */
const inSentence = (type: string) => (/^[A-Z]{2,}$/.test(type) ? type : type.toLowerCase());

const isUnavailable = (part?: ComponentOption) => part?.stock === 0;

/**
 * Parts that clash. A processor needing a graphics card that hasn't been picked yet is an unfinished
 * build, not a clash, so it blocks the quotation without calling the parts incompatible.
 */
const findConflict = (items: CompatibilitySummary["items"]) =>
  items.find((item) => item.severity === "error" && item.ruleId !== "RULE_I_GPU_MANDATORY_NO_IGPU");

/** A selection that's kept up to date with the live catalogue's prices and availability. */
function useLiveParts(initial: Record<string, ComponentOption>) {
  const store = useStore();
  const [parts, setParts] = useState<Record<string, ComponentOption>>(
    () => reconcileBuildParts(initial, store.componentCatalog).parts,
  );
  useEffect(() => {
    const next = reconcileBuildParts(parts, store.componentCatalog);
    if (JSON.stringify(next.parts) === JSON.stringify(parts)) return;
    setParts(next.parts);
    if (next.priceChanged.length > 0) {
      store.notify(`Updated to the current price: ${next.priceChanged.join(", ")}`);
    }
  }, [store.componentCatalog, parts]);
  return [parts, setParts] as const;
}

/** What still has to be chosen before a quotation can be requested. */
function missingForQuotation(parts: Record<string, ComponentOption>, owned: string[] = []) {
  const missing = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"].filter(
    (type) => !parts[type] && !owned.includes(type),
  );
  if (parts.CPU?.includesCooler === false && !parts.Cooler) missing.push("Cooler");
  if (parts.CPU?.hasIntegratedGraphics === false && !parts.GPU && !owned.includes("GPU")) {
    missing.push("GPU");
  }
  return missing;
}

function PartThumb({ part }: { part?: ComponentOption }) {
  const image = part?.image && !part.image.includes("placeholder") ? part.image : "";
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      {image ? (
        <img src={image} alt="" className="h-full w-full object-contain" />
      ) : (
        <Cpu size={23} className="text-primary" strokeWidth={1.5} />
      )}
    </div>
  );
}

/** Shown in a component picker when there's nothing to list, saying which of three cases it is. */
function EmptyCatalog() {
  const store = useStore();
  if (store.catalogLoading) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">Loading live products…</p>
      </div>
    );
  }
  if (store.catalogError) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <PackageX className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium text-foreground">
          We couldn't load the live product list.
        </p>
        <Button
          variant="secondary"
          className="mt-3 px-3 py-2 text-xs"
          onClick={() => store.refreshCatalog({ force: true })}
        >
          <RotateCcw size={13} /> Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      <PackageX className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
      <p className="text-sm font-medium text-foreground">
        No matching products are currently available. Please contact IT HUB for assistance.
      </p>
    </div>
  );
}

/** Says so when the prices on screen may be older than the store's. */
function CatalogWarning() {
  const store = useStore();
  if (!store.catalogError) return null;
  return (
    <p className="mb-5 flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      The live product list couldn't be refreshed, so prices and availability may be out of date.
    </p>
  );
}

const EXPERT_BUILDER_SLOTS = [
  "CPU",
  "Motherboard",
  "RAM",
  "GPU",
  "Storage",
  "PSU",
  "Cabinet",
  "Cooler",
];

function ExpertBuilder({
  initialParts,
  initialName,
  initialOwned = [],
  savedId,
  onBack,
}: {
  initialParts: Record<string, ComponentOption>;
  initialName: string;
  initialOwned?: string[];
  savedId?: string;
  onBack: () => void;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const [parts, setParts] = useLiveParts(initialParts);
  const [currentId, setCurrentId] = useState(savedId);
  const [selection, setSelection] = useState("");
  const [name, setName] = useState(initialName);
  const [filter, setFilter] = useState("");
  const [savingBuild, setSavingBuild] = useState(false);
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [pendingRestored, setPendingRestored] = useState(false);
  const [quoteResult, setQuoteResult] = useState<{
    referenceId: string;
    estimatedPrice: number;
    parts: Array<{ type: string; name: string; price: number }>;
    buildName: string;
  } | null>(null);
  const total = Object.values(parts).reduce(
    (sum, item) => sum + (isUnavailable(item) ? 0 : item.price),
    0,
  );
  const [ownedAtStart, setOwnedAtStart] = useState(initialOwned);
  // Choosing a part for a slot means the customer is no longer using their own.
  const owned = ownedAtStart.filter((type) => !parts[type]);
  const ownedLabel = (type: string) => (owned.includes(type) ? "Already owned" : undefined);
  const { result, watts, recommended, valid, complete, summary } = compatibility(parts, {
    ownedSlots: owned,
  });
  const unavailable = Object.keys(parts).filter((type) => isUnavailable(parts[type]));
  const canRequest = complete && valid && unavailable.length === 0;
  const hasConflict = Boolean(findConflict(summary.items));
  const missing = missingForQuotation(parts, owned);

  // After signing in, offer the build kept for it. A different build on screen is left alone.
  useEffect(() => {
    if (store.loggedIn) {
      const pending = getPendingQuotation();
      if (pending?.mode !== "wizard") return;
      const nothingChosenYet = Object.keys(parts).length === 0;
      if (nothingChosenYet && Object.keys(pending.parts || {}).length > 0) {
        setParts(pending.parts);
        setName(pending.name || "My custom PC");
        setOwnedAtStart(pending.ownedSlots || []);
        setPendingRestored(true);
      } else if (pendingMatchesBuild(pending, parts, owned)) {
        setPendingRestored(true);
      }
    }
  }, [store.loggedIn]);

  const createCanonical = (): CanonicalBuild => ({
    id: currentId || crypto.randomUUID(),
    // Only a build that's already saved has a row to update.
    userId: currentId ? store.profile?.id : undefined,
    name: name.trim() || "My custom PC",
    mode: "expert",
    currency: "INR",
    components: toCanonicalRecord(parts),
    compatibility: summary,
    ownedSlots: owned as any,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const save = async () => {
    if (!store.loggedIn) {
      store.notify("Please log in to save your build");
      store.setAuthOpen(true);
      return;
    }
    setSavingBuild(true);
    const canonical = createCanonical();
    const res = await saveBuild(canonical);
    setSavingBuild(false);

    if (res.success) {
      const build = {
        id: res.id,
        name: canonical.name,
        parts: { ...parts },
        price: total,
        owned,
      };
      setCurrentId(res.id);
      if (currentId && store.builds.some((item) => item.id === currentId)) {
        store.set((previous) => ({
          builds: previous.builds.map((item) =>
            item.id === currentId ? { ...item, ...build, id: currentId } : item,
          ),
        }));
      } else {
        store.set((previous) => ({ builds: [build, ...previous.builds] }));
      }
      track("PC Build Saved", { build: canonical.name });
      store.log(`PC build saved: ${canonical.name}`);
      store.notify("Your PC build is saved to My Account");
    } else {
      store.notify(res.error || "Failed to save build");
    }
  };

  const partList = Object.keys(parts)
    .filter((type) => type !== "Peripherals" && type !== "OS" && parts[type])
    .map((type) => ({ type, name: parts[type].name, price: parts[type].price }));

  const handleRequestQuotation = async () => {
    if (submittingQuote) return;
    if (!canRequest) {
      store.notify(
        unavailable.length > 0
          ? `Please replace what's no longer available: ${unavailable.join(", ")}.`
          : "Please select all essential components and resolve any compatibility issues.",
      );
      return;
    }

    if (!store.loggedIn) {
      const canonical = createCanonical();
      savePendingQuotation({
        mode: "wizard",
        build: canonical,
        parts,
        name: name.trim() || "My custom PC",
        ownedSlots: owned,
      });
      store.notify(
        "Please sign in to submit your official quotation request. Your build has been saved!",
      );
      store.setAuthOpen(true);
      return;
    }

    setSubmittingQuote(true);
    const canonical = createCanonical();
    const res = await submitQuotationRequest(canonical, {
      name: store.profile?.name,
      phone: store.profile?.phone,
      email: store.profile?.email,
    });
    setSubmittingQuote(false);

    if (res.requiresAuth) {
      savePendingQuotation({
        mode: "wizard",
        build: canonical,
        parts,
        name: name.trim() || "My custom PC",
        ownedSlots: owned,
      });
      store.notify("Please sign in to submit your official quotation request.");
      store.setAuthOpen(true);
      return;
    }

    if (res.success && res.referenceId) {
      clearPendingQuotation();
      setPendingRestored(false);
      setQuoteResult({
        referenceId: res.referenceId,
        estimatedPrice: res.estimatedPrice ?? total,
        parts: partList,
        buildName: name.trim() || "My custom PC",
      });
      store.set((previous) => ({
        pcEnquiries: [
          {
            id: res.referenceId!,
            summary: name.trim() || "My custom PC",
            parts: partList,
            estimate: total,
            date: new Date().toISOString(),
            status: "New",
          },
          ...previous.pcEnquiries,
        ],
      }));
      store.log(`PC quotation requested: ${res.referenceId}`);
      track("Contact/WhatsApp Action", { context: "PC Builder quotation", ref: res.referenceId });
    } else {
      store.notify(res.error || "Failed to submit quotation request. Please try again.");
    }
  };
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
      <CatalogWarning />
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary px-5 py-4">
        <p className="text-xs text-primary">{Object.keys(parts).length} of 8 components selected</p>
        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-primary/10">
          <div
            className={`h-full rounded-full bg-primary transition-all ${["w-0", "w-[12.5%]", "w-1/4", "w-[37.5%]", "w-1/2", "w-[62.5%]", "w-3/4", "w-[87.5%]", "w-full"][Object.keys(parts).length]}`}
          />
        </div>
        <button
          onClick={() => {
            setParts({});
            store.notify("Build reset");
          }}
          className="flex items-center gap-2 text-xs text-primary"
        >
          <RotateCcw size={13} /> Reset build
        </button>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_370px]">
        <div className="space-y-3">
          {EXPERT_BUILDER_SLOTS.map((type, index) => (
            <div
              key={type}
              className={`flex flex-wrap items-center gap-4 rounded-lg border p-5 ${
                parts[type] ? "border-primary/20 bg-secondary/20" : "border-border bg-white"
              }`}
            >
              <PartThumb part={parts[type]} />
              <div className="min-w-32 flex-1">
                <p className="text-[10px] text-muted-foreground">
                  0{index + 1} · {type.toUpperCase()}
                </p>
                <h2 className="mt-1 text-sm font-semibold">
                  {parts[type]?.name || ownedLabel(type) || `Select a ${inSentence(type)}`}
                </h2>
                {ownedLabel(type) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Not included in the estimate. IT HUB will check it fits.
                  </p>
                )}
                {parts[type] &&
                  (isUnavailable(parts[type]) ? (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      No longer available. Please replace it.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-primary">{money(parts[type].price)}</p>
                  ))}
              </div>
              {parts[type] && (
                <button
                  aria-label={`Remove ${type}`}
                  onClick={() => {
                    const next = { ...parts };
                    delete next[type];
                    setParts(next);
                  }}
                  className="p-2 text-muted-foreground hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setSelection(type);
                  setFilter("");
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
                <div key={part.type} className="flex justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {part.type}
                    </p>
                    <p className="mt-0.5 font-medium">{part.name}</p>
                  </div>
                  <strong className="shrink-0">{money(part.price)}</strong>
                </div>
              ))}
              {owned.map((type) => (
                <div key={type} className="flex justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {type}
                    </p>
                    <p className="mt-0.5 font-medium">Already owned</p>
                  </div>
                  <strong className="shrink-0">Not priced</strong>
                </div>
              ))}
              {!partList.length && !owned.length && (
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
              This is an estimated price, not a guaranteed quotation. The final price may change
              based on component availability, current market pricing, configuration changes,
              assembly/service requirements and customer requirements.
            </p>
            {pendingRestored && (
              <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-left">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <CheckCircle2 size={14} /> Restored Build Ready for Review
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Welcome back! Please review your build details and click{" "}
                  <strong>Confirm &amp; Submit Quotation</strong> below to submit your official
                  request.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!canRequest || submittingQuote}
                    onClick={async () => {
                      setPendingRestored(false);
                      clearPendingQuotation();
                      await handleRequestQuotation();
                    }}
                  >
                    {submittingQuote ? "Submitting…" : "Confirm & Submit Quotation"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setPendingRestored(false);
                      clearPendingQuotation();
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-6 grid gap-3">
              <Button disabled={!canRequest || submittingQuote} onClick={handleRequestQuotation}>
                {submittingQuote ? "Submitting Request…" : "Request IT HUB Quotation"}{" "}
                <CheckCircle2 size={15} />
              </Button>
              <Button disabled={!canRequest || savingBuild} variant="secondary" onClick={save}>
                {savingBuild ? "Saving to Account…" : "Save build"} <Save size={15} />
              </Button>
            </div>
            {!canRequest && (
              <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
                {unavailable.length > 0
                  ? `Replace what's no longer available: ${unavailable.join(", ")}.`
                  : !complete
                    ? `Still to choose: ${missing.join(", ")}.`
                    : "Resolve compatibility errors before requesting a quotation."}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-muted p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Compatibility</h3>
              <Badge
                tone={
                  hasConflict
                    ? "red"
                    : !complete
                      ? "gray"
                      : summary.status === "compatible"
                        ? "green"
                        : "amber"
                }
              >
                {hasConflict
                  ? "Incompatible"
                  : !complete
                    ? "In progress"
                    : summary.status === "compatible"
                      ? "Compatible"
                      : "Needs checking"}
              </Badge>
            </div>
            {summary.items.some((item) => item.status === "unknown") && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                {UNVERIFIED_NOTICE}
              </p>
            )}
            <div className="space-y-3">
              {result.map((check, index) => {
                const Icon =
                  check.state === "ok"
                    ? CheckCircle2
                    : check.state === "error"
                      ? XCircle
                      : AlertTriangle;
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
                );
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
                <p className="text-xs font-medium">Estimated consumption: {watts}W</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Recommended PSU: {recommended || "—"}W or higher
                </p>
              </div>
            </div>
            <p className="mt-4 text-[10px] leading-5 text-muted-foreground">
              Simplified compatibility estimates. Confirm component fit, firmware and cooling with
              IT HUB.
            </p>
          </div>
        </aside>
      </div>
      <Modal
        open={Boolean(quoteResult)}
        onOpenChange={(open) => !open && setQuoteResult(null)}
        title="Your PC Build Request Has Been Received!"
        description="Quotation Request Confirmation"
      >
        {quoteResult && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 leading-relaxed">
              <div className="flex items-center gap-2 font-bold text-emerald-950 mb-1">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Reference ID: {quoteResult.referenceId}</span>
              </div>
              <p>
                Thank you for choosing IT HUB. Our team will review your selected components, verify
                current availability, and contact you soon with the final quotation.
              </p>
            </div>

            <div className="space-y-2 rounded-xl bg-muted p-4 text-xs">
              <p className="font-semibold text-foreground mb-2">Build: {quoteResult.buildName}</p>
              {quoteResult.parts.map((part) => (
                <p key={part.type} className="flex justify-between gap-3 text-muted-foreground">
                  <span>
                    <strong className="text-foreground">{part.type}:</strong> {part.name}
                  </span>
                  <strong className="shrink-0 text-foreground">{money(part.price)}</strong>
                </p>
              ))}
            </div>

            <div className="rounded-xl border border-border p-4 bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Estimated Build Price
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    (Estimate only — final price will be confirmed in your official quotation)
                  </p>
                </div>
                <strong className="text-2xl text-primary">
                  {money(quoteResult.estimatedPrice)}
                </strong>
              </div>
            </div>

            <div className="rounded-xl bg-secondary/50 p-3.5 text-xs text-muted-foreground flex items-center gap-2.5">
              <Info size={16} className="text-primary shrink-0" />
              <p>
                <strong className="text-foreground">Next step: </strong>
                Our team will contact you soon after reviewing your build.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={() => setQuoteResult(null)}>
                Continue Building
              </Button>
              <Button variant="secondary" onClick={() => setQuoteResult(null)}>
                Close
              </Button>
              <a
                href={`https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(
                  `Hi IT HUB, I've requested a quotation for PC Build "${quoteResult.buildName}" (Ref: ${quoteResult.referenceId}, Est: ${money(quoteResult.estimatedPrice)}). Looking forward to hearing from you!`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-95"
              >
                <WhatsAppIcon size={16} /> Send via WhatsApp
              </a>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(selection)}
        onOpenChange={(open) => {
          if (!open) setSelection("");
        }}
        title={`Choose your ${inSentence(selection)}`}
        description="Live products from the IT HUB store. Each is checked against what you've chosen so far."
      >
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="mb-5 w-full rounded-md border border-border p-3 text-sm"
          placeholder="Search components…"
          aria-label="Search components"
        />
        <div className="space-y-3">
          {(() => {
            const slotItems = store.componentCatalog[selection] || [];
            if (slotItems.length === 0) return <EmptyCatalog />;
            const filtered = slotItems.filter((item) =>
              item.name.toLowerCase().includes(filter.toLowerCase()),
            );
            if (filtered.length === 0) {
              return (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    No matching products found for "{filter}".
                  </p>
                </div>
              );
            }
            return filtered.map((item) => {
              const conflict = findConflict(
                compatibility({ ...parts, [selection]: item }, { ownedSlots: owned }).summary.items,
              );
              return (
                <button
                  key={item.id}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg border p-4 text-left hover:bg-secondary ${
                    parts[selection]?.id === item.id ? "border-primary" : "border-border"
                  }`}
                  onClick={() => {
                    setParts({ ...parts, [selection]: item });
                    setSelection("");
                    store.notify("PC component added");
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
                      {hasRejectedSpecs(item.specs) ? (
                        <span className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                          Specs Rejected
                        </span>
                      ) : (
                        item.isVerified === false && (
                          <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Unverified Specs
                          </span>
                        )
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
                    {conflict && <p className="mt-1 text-xs text-red-600">{conflict.label}</p>}
                  </div>
                  <div className="shrink-0 text-sm font-bold text-primary">{money(item.price)}</div>
                </button>
              );
            });
          })()}
        </div>
      </Modal>
    </Page>
  );
}

// ───────────────────────── Smart PC Builder ─────────────────────────

type PurposeId = "gaming" | "creation" | "work" | "programming" | "professional" | "general";
const purposes: {
  id: PurposeId;
  title: string;
  text: string;
  Icon: typeof Gamepad2;
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
    text: "Office work, business and productivity",
    Icon: Briefcase,
  },
  {
    id: "programming",
    title: "Software Development",
    text: "Coding, compiling and development tools",
    Icon: Code2,
  },
  {
    id: "professional",
    title: "Professional",
    text: "CAD, architecture, engineering, data/AI",
    Icon: DraftingCompass,
  },
  {
    id: "general",
    title: "General Use",
    text: "Browsing, media, education and home use",
    Icon: House,
  },
];
export interface Budget {
  id: string;
  label: string;
  min: number;
  max: number;
}
const budgets: Budget[] = [
  {
    id: "40-60",
    label: "₹40,000 – ₹60,000",
    min: 40000,
    max: 60000,
  },
  {
    id: "60-80",
    label: "₹60,000 – ₹80,000",
    min: 60000,
    max: 80000,
  },
  {
    id: "80-100",
    label: "₹80,000 – ₹1,00,000",
    min: 80000,
    max: 100000,
  },
  {
    id: "100-150",
    label: "₹1,00,000 – ₹1,50,000",
    min: 100000,
    max: 150000,
  },
  {
    id: "150+",
    label: "₹1,50,000+",
    min: 150000,
    max: 300000,
  },
];
const partOrder = ["CPU", "GPU", "Motherboard", "RAM", "Storage", "PSU", "Cooler", "Cabinet"];
const partLabels: Record<string, string> = { Cooler: "CPU Cooler" };
const explanations: Record<string, string> = {
  CPU: "Handles general system processing and gaming workloads.",
  GPU: "Responsible primarily for gaming graphics and GPU-accelerated creative workloads.",
  Motherboard: "Connects every component together and decides future upgrade options.",
  RAM: "Helps with multitasking and application performance.",
  Storage: "Stores Windows, apps, games and files. NVMe SSDs load things quickly.",
  PSU: "Supplies stable power to every component, with headroom for safety.",
  Cooler: "Keeps the processor cool and quiet under load.",
  Cabinet: "Houses and protects the components, with airflow to keep them cool.",
};
const DISCLAIMER =
  "Component prices and availability may change. Final pricing will be confirmed by IT HUB before purchase.";

type Answers = {
  purpose: PurposeId | "";
  budgetId: string;
  brands: string[];
};
const emptyAnswers: Answers = {
  purpose: "",
  budgetId: "",
  brands: [],
};
type DetailBuild = {
  name: string;
  tradeoff?: string;
  designedFor: string;
  highlights: string[];
  parts: Record<string, ComponentOption>;
  owned: string[];
  note?: string;
  templateId?: string;
  inBudget?: boolean;
  /** Compatibility can't be confirmed from the catalogue, so IT HUB must check this build. */
  requiresReview?: boolean;
  /** Why this build has its label, or what's missing. Applies only to the parts as recommended. */
  rankingReasons?: string[];
  /** How this build relates to what the customer said they need. */
  purposeNotes?: string[];
  /** Where the compared parts' specifications came from. */
  specSources?: { CPU?: string; GPU?: string };
};

function resolvedBudget(answers: Answers) {
  const band = budgets.find((item) => item.id === answers.budgetId);
  if (!band) return null;
  return {
    min: band.min,
    max: band.max,
    label:
      band.id === "150+" ? band.label.replace(/\s/g, "") : `${money(band.min)}–${money(band.max)}`,
  };
}
const sumParts = (parts: Record<string, ComponentOption>) =>
  Object.values(parts).reduce((sum, item) => sum + item.price, 0);
function alternativeFor(
  catalog: Record<string, ComponentOption[]>,
  parts: Record<string, ComponentOption>,
  type: string,
  owned: string[] = [],
) {
  const current = parts[type];
  if (!current) return undefined;
  return (catalog[type] || [])
    .filter(
      (item) =>
        item.id !== current.id &&
        item.stock !== 0 &&
        compatibility({ ...parts, [type]: item }, { ownedSlots: owned }).valid,
    )
    .sort((a, b) => Math.abs(a.price - current.price) - Math.abs(b.price - current.price))[0];
}

function Progress({ step }: { step: number }) {
  const labels = ["Purpose", "Budget", "Builds"];
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
            className={index <= step ? "font-semibold text-foreground" : "text-muted-foreground"}
          >
            {label}
          </span>
          {index < labels.length - 1 && (
            <span className={`h-px w-6 sm:w-12 ${index < step ? "bg-primary" : "bg-border"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}
function Choice({
  active,
  onClick,
  children,
  round = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  round?: boolean;
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
  );
}
interface QuestionProps {
  title: string;
  children: ReactNode;
}

function Question({ title, children }: QuestionProps) {
  return (
    <fieldset className="mt-8">
      <legend className="mb-3 text-sm font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function BuildDetail({
  initial,
  savedId,
  startCustomizing = false,
  onBack,
  onExpert,
}: {
  initial: DetailBuild;
  savedId?: string;
  startCustomizing?: boolean;
  onBack: () => void;
  onExpert: (parts: Record<string, ComponentOption>, name: string, owned: string[]) => void;
}) {
  const store = useStore();
  const catalog = store.componentCatalog;
  const [parts, setParts] = useLiveParts(initial.parts);
  const [currentId, setCurrentId] = useState(savedId);
  const [owned, setOwned] = useState(initial.owned);
  const [name, setName] = useState(initial.name);
  const [customizing, setCustomizing] = useState(startCustomizing);
  const [selection, setSelection] = useState("");
  const [breakdown, setBreakdown] = useState(false);
  const [savingBuild, setSavingBuild] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [pendingRestored, setPendingRestored] = useState(false);
  const [quoteResult, setQuoteResult] = useState<{
    referenceId: string;
    estimatedPrice: number;
    parts: Array<{ type: string; name: string; price: number }>;
    buildName: string;
  } | null>(null);

  // After signing in, offer the build kept for it. A different build on screen is left alone.
  useEffect(() => {
    if (store.loggedIn) {
      const pending = getPendingQuotation();
      if (pending?.mode === "customise" && pendingMatchesBuild(pending, parts, owned)) {
        setPendingRestored(true);
      }
    }
  }, [store.loggedIn]);
  const priced: Record<string, ComponentOption> = { ...parts };
  owned.forEach((type) => delete priced[type]);
  const unavailable = Object.keys(priced).filter((type) => isUnavailable(priced[type]));
  unavailable.forEach((type) => delete priced[type]);
  const componentTotal = sumParts(priced);
  const assembly = store.assemblyCharge || 0;
  const total = componentTotal + assembly;
  const checks = compatibility(parts, { ownedSlots: owned });
  const canRequest = checks.valid && checks.complete && unavailable.length === 0;
  const missing = missingForQuotation(parts, owned);
  const changed = JSON.stringify(parts) !== JSON.stringify(initial.parts);
  // While customizing, every slot stays on screen, so a removed part can be added back.
  const rows = customizing
    ? partOrder
    : partOrder.filter((type) => parts[type] || type === "GPU" || owned.includes(type));
  const display = (type: string) =>
    owned.includes(type)
      ? "Already owned"
      : parts[type]?.name ||
        (type === "GPU" && parts.CPU?.hasIntegratedGraphics
          ? "Integrated graphics (built into CPU)"
          : type === "GPU"
            ? "No graphics card selected"
            : "Not selected");
  const storageIsNvme = /nvme/i.test(parts.Storage?.interface || "");
  const why = [
    ...initial.highlights,
    !parts.GPU && parts.CPU?.hasIntegratedGraphics
      ? "Uses the processor's integrated graphics"
      : "",
    `Chosen for ${initial.designedFor}`,
    storageIsNvme ? `${parts.Storage.name.split(" ")[0]} fast NVMe storage` : "",
    parts.Motherboard?.wifi ? "Built-in Wi-Fi" : "",
    checks.result.find((check) => check.label.startsWith("PSU has adequate"))?.state === "ok"
      ? "Adequate power supply"
      : "",
    checks.summary.status === "compatible" ? "All parts checked for compatibility" : "",
    !changed && initial.inBudget !== undefined
      ? initial.inBudget
        ? "Fits your selected budget range"
        : ""
      : "",
  ].filter(Boolean);

  const removePart = (type: string) => {
    const next = { ...parts };
    delete next[type];
    setParts(next);
    store.notify(`${partLabels[type] || type} removed — estimate recalculated`);
  };

  const swap = (type: string, item: ComponentOption) => {
    setParts({ ...parts, [type]: item });
    setOwned(owned.filter((value) => value !== type));
    store.notify(`${partLabels[type] || type} updated — estimate recalculated`);
  };

  const createCanonical = (): CanonicalBuild => ({
    id: currentId || crypto.randomUUID(),
    // Only a build that's already saved has a row to update.
    userId: currentId ? store.profile?.id : undefined,
    name: name.trim() || initial.name,
    mode: "guided",
    currency: "INR",
    components: toCanonicalRecord(parts),
    compatibility: checks.summary,
    designedFor: initial.designedFor,
    templateId: initial.templateId,
    ownedSlots: owned as any,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const save = async () => {
    if (!store.loggedIn) {
      store.notify("Please log in to save your build");
      store.setAuthOpen(true);
      return;
    }
    setSavingBuild(true);
    const canonical = createCanonical();
    const res = await saveBuild(canonical);
    setSavingBuild(false);

    if (res.success) {
      setCurrentId(res.id);
      const build = {
        id: res.id,
        name: canonical.name,
        parts: { ...parts },
        price: componentTotal,
        designedFor: initial.designedFor,
        templateId: initial.templateId,
        owned,
      };
      store.set((previous) => ({
        builds: previous.builds.some((item) => item.id === build.id)
          ? previous.builds.map((item) => (item.id === build.id ? build : item))
          : [build, ...previous.builds],
      }));
      store.log(`PC build saved: ${canonical.name}`);
      store.notify("Saved to My Account → PC Builds");
    } else {
      store.notify(res.error || "Failed to save build");
    }
  };

  const enquire = () => {
    const canonical = createCanonical();
    const quote = generateWhatsAppQuotation(canonical, store.settings.whatsapp);
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
    }));
    store.log(
      `PC enquiry sent via WhatsApp: ${name.trim() || initial.name} (${quote.referenceId})`,
    );
    track("Contact/WhatsApp Action", { context: "PC Builder enquiry", ref: quote.referenceId });
    window.open(quote.whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const handleRequestQuotation = async () => {
    if (submittingQuote) return;
    if (!canRequest) {
      store.notify(
        unavailable.length > 0
          ? `Please replace what's no longer available: ${unavailable.join(", ")}.`
          : !checks.valid
            ? "Please resolve compatibility issues before requesting a quotation."
            : `Still to choose: ${missing.join(", ")}.`,
      );
      return;
    }

    if (!store.loggedIn) {
      const canonical = createCanonical();
      savePendingQuotation({
        mode: "customise",
        build: canonical,
        parts,
        name: name.trim() || initial.name,
        ownedSlots: owned,
      });
      store.notify(
        "Please sign in to submit your official quotation request. Your build has been saved!",
      );
      store.setAuthOpen(true);
      return;
    }

    setSubmittingQuote(true);
    const canonical = createCanonical();
    const res = await submitQuotationRequest(canonical, {
      name: store.profile?.name,
      phone: store.profile?.phone,
      email: store.profile?.email,
    });
    setSubmittingQuote(false);

    if (res.requiresAuth) {
      savePendingQuotation({
        mode: "customise",
        build: canonical,
        parts,
        name: name.trim() || initial.name,
        ownedSlots: owned,
      });
      store.notify("Please sign in to submit your official quotation request.");
      store.setAuthOpen(true);
      return;
    }

    if (res.success && res.referenceId) {
      clearPendingQuotation();
      setPendingRestored(false);
      const summaryParts = partOrder
        .filter((type) => priced[type])
        .map((type) => ({
          type,
          name: priced[type].name,
          price: priced[type].price,
        }));

      setQuoteResult({
        referenceId: res.referenceId,
        estimatedPrice: (res.estimatedPrice ?? componentTotal) + assembly,
        parts: summaryParts,
        buildName: name.trim() || initial.name,
      });
      store.set((previous) => ({
        pcEnquiries: [
          {
            id: res.referenceId!,
            summary: name.trim() || initial.name,
            parts: summaryParts,
            estimate: (res.estimatedPrice ?? componentTotal) + assembly,
            date: new Date().toISOString(),
            status: "New",
          },
          ...previous.pcEnquiries,
        ],
      }));
      store.log(`PC quotation requested: ${res.referenceId}`);
      track("Contact/WhatsApp Action", { context: "PC Builder quotation", ref: res.referenceId });
    } else {
      store.notify(res.error || "Failed to submit quotation request. Please try again.");
    }
  };
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-xs font-semibold text-primary"
      >
        <ArrowLeft size={14} /> {savedId ? "Back to PC Builder" : "Back to recommended builds"}
      </button>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          {/* A label describes the build as recommended, not one the customer has since changed. */}
          {initial.tradeoff && !changed && <Badge>{initial.tradeoff.toUpperCase()}</Badge>}
          {customizing ? (
            <input
              aria-label="Build name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-3 w-full rounded-xl border border-border px-4 py-2 font-display text-2xl font-bold md:text-3xl"
            />
          ) : (
            <h1 className="mt-3 font-display text-3xl font-bold md:text-4xl">{name}</h1>
          )}
          <p className="mt-3 text-sm">
            <span className="text-muted-foreground">Designed for:</span>{" "}
            <strong>{initial.designedFor}</strong>
          </p>
          {!changed && <RankingEvidence build={initial} />}
          {initial.note && !changed && (
            <p className="mt-3 flex gap-2 rounded-xl bg-secondary px-4 py-3 text-xs text-primary">
              <Info size={15} className="mt-0.5 shrink-0" /> {initial.note}
            </p>
          )}
          <div className="mt-3">
            <CatalogWarning />
          </div>
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
              const part = parts[type];
              const isOwned = owned.includes(type);
              const alt =
                part && part.stock === 0 && !isOwned
                  ? alternativeFor(catalog, parts, type, owned)
                  : undefined;
              return (
                <div key={type} className="rounded-2xl border border-border bg-white p-4 md:p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <PartThumb part={part} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {partLabels[type] || type}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">{display(type)}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {isOwned
                          ? "Not included in the estimate — you already own this."
                          : explanations[type]}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {part && !isOwned && !isUnavailable(part) && (
                        <strong className="text-sm">{money(part.price)}</strong>
                      )}
                      {customizing && part && !isOwned && (
                        <button
                          aria-label={`Remove ${partLabels[type] || type}`}
                          onClick={() => removePart(type)}
                          className="p-2 text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
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
                        <PackageX size={14} /> Recommended {partLabels[type] || type} is currently
                        unavailable.
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
                          <Button className="px-4 py-2 text-xs" onClick={() => swap(type, alt)}>
                            Use Alternative
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-1">
                          Choose Customize This Build to replace it, or message IT HUB.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {
            <div className="mt-4 rounded-2xl bg-muted p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Compatibility check</p>
                <Badge
                  tone={
                    !checks.valid
                      ? "red"
                      : checks.summary.status === "compatible"
                        ? "green"
                        : "amber"
                  }
                >
                  {!checks.valid
                    ? "Needs attention"
                    : checks.summary.status === "compatible"
                      ? "Compatible"
                      : "Needs checking"}
                </Badge>
              </div>
              {checks.summary.items.some((item) => item.status === "unknown") && (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  {UNVERIFIED_NOTICE} IT HUB will check these before confirming your quotation.
                </p>
              )}
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
              {customizing && (
                <button
                  onClick={() => onExpert(parts, name, owned)}
                  className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary"
                >
                  <Wrench size={13} /> Open in Expert Mode
                </button>
              )}
            </div>
          }
          <div className="mt-8 rounded-2xl border border-border p-5 md:p-6">
            <h2 className="text-lg font-bold">Why we recommend this build</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {why.map((item) => (
                <li key={item} className="flex gap-2 text-sm">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <aside className="space-y-4 self-start lg:sticky lg:top-28">
          <div className="rounded-2xl border border-border bg-white p-6">
            <Badge>ESTIMATE</Badge>
            <p className="mt-3 text-sm text-muted-foreground">Estimated Build Price</p>
            <p className="mt-1 font-display text-3xl font-bold text-primary">{money(total)}</p>
            <button
              onClick={() => setBreakdown(!breakdown)}
              aria-expanded={breakdown}
              className="mt-4 flex w-full items-center justify-between border-t border-border pt-4 text-sm font-semibold"
            >
              Price Breakdown
              <ChevronDown size={16} className={`transition ${breakdown ? "rotate-180" : ""}`} />
            </button>
            {breakdown && (
              <div className="mt-3 space-y-2 text-xs">
                {partOrder
                  .filter((type) => priced[type])
                  .map((type) => (
                    <p key={type} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{partLabels[type] || type}</span>
                      <span>{money(priced[type].price)}</span>
                    </p>
                  ))}
                <p className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                  <span>Component Total</span>
                  <span>{money(componentTotal)}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Assembly / Service Charge</span>
                  <span className={assembly ? "" : "font-semibold text-emerald-700"}>
                    {assembly ? money(assembly) : "Free"}
                  </span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Optional Services</span>
                  <span>On request</span>
                </p>
                <p className="flex justify-between gap-3 border-t border-border pt-2 text-sm font-bold">
                  <span>Estimated Total</span>
                  <span>{money(total)}</span>
                </p>
              </div>
            )}
            <p className="mt-4 text-[11px] leading-5 text-muted-foreground">{DISCLAIMER}</p>
            {pendingRestored && (
              <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-left">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <CheckCircle2 size={14} /> Restored Build Ready for Review
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Welcome back! Please review your custom build and click{" "}
                  <strong>Confirm &amp; Submit Quotation</strong> below to submit your official
                  request.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!canRequest || submittingQuote}
                    onClick={async () => {
                      setPendingRestored(false);
                      clearPendingQuotation();
                      await handleRequestQuotation();
                    }}
                  >
                    {submittingQuote ? "Submitting…" : "Confirm & Submit Quotation"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setPendingRestored(false);
                      clearPendingQuotation();
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-6 grid gap-3">
              <p className="text-sm font-bold">Request Official Quotation</p>
              <Button disabled={!canRequest || submittingQuote} onClick={handleRequestQuotation}>
                {submittingQuote ? "Submitting Request…" : "Request IT HUB Quotation"}{" "}
                <CheckCircle2 size={15} />
              </Button>
              <button
                onClick={enquire}
                disabled={!canRequest}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
              >
                <WhatsAppIcon size={18} /> Continue on WhatsApp
              </button>
              <Button variant="secondary" onClick={save} disabled={!canRequest || savingBuild}>
                <Save size={15} />{" "}
                {savingBuild ? "Saving to Account…" : currentId ? "Save Changes" : "Save Build"}
              </Button>
              {!customizing && (
                <Button variant="secondary" onClick={() => onExpert(parts, name, owned)}>
                  <SlidersHorizontal size={15} /> Customize in Expert Mode
                </Button>
              )}
              {!canRequest && (
                <p className="text-[11px] text-red-600">
                  {unavailable.length > 0
                    ? `Replace what's no longer available: ${unavailable.join(", ")}.`
                    : !checks.valid
                      ? "Resolve compatibility issues to continue."
                      : `Still to choose: ${missing.join(", ")}.`}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
      <Modal
        open={Boolean(quoteResult)}
        onOpenChange={(open) => !open && setQuoteResult(null)}
        title="Your PC Build Request Has Been Received!"
        description="Quotation Request Confirmation"
      >
        {quoteResult && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 leading-relaxed">
              <div className="flex items-center gap-2 font-bold text-emerald-950 mb-1">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Reference ID: {quoteResult.referenceId}</span>
              </div>
              <p>
                Thank you for choosing IT HUB. Our team will review your selected components, verify
                current availability, and contact you soon with the final quotation.
              </p>
            </div>

            <div className="space-y-2 rounded-xl bg-muted p-4 text-xs">
              <p className="font-semibold text-foreground mb-2">Build: {quoteResult.buildName}</p>
              {quoteResult.parts.map((part) => (
                <p key={part.type} className="flex justify-between gap-3 text-muted-foreground">
                  <span>
                    <strong className="text-foreground">{part.type}:</strong> {part.name}
                  </span>
                  <strong className="shrink-0 text-foreground">{money(part.price)}</strong>
                </p>
              ))}
            </div>

            <div className="rounded-xl border border-border p-4 bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Estimated Build Price
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    (Estimate only — final price will be confirmed in your official quotation)
                  </p>
                </div>
                <strong className="text-2xl text-primary">
                  {money(quoteResult.estimatedPrice)}
                </strong>
              </div>
            </div>

            <div className="rounded-xl bg-secondary/50 p-3.5 text-xs text-muted-foreground flex items-center gap-2.5">
              <Info size={16} className="text-primary shrink-0" />
              <p>
                <strong className="text-foreground">Next step: </strong>
                Our team will contact you soon after reviewing your build.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={() => setQuoteResult(null)}>
                Continue Building
              </Button>
              <Button variant="secondary" onClick={() => setQuoteResult(null)}>
                Close
              </Button>
              <a
                href={`https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(
                  `Hi IT HUB, I've requested a quotation for PC Build "${quoteResult.buildName}" (Ref: ${quoteResult.referenceId}, Est: ${money(quoteResult.estimatedPrice)}). Looking forward to hearing from you!`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-95"
              >
                <WhatsAppIcon size={16} /> Send via WhatsApp
              </a>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(selection)}
        onOpenChange={(open) => !open && setSelection("")}
        title={`Change ${(partLabels[selection] || selection).toLowerCase()}`}
        description="Each option is checked against the rest of your build, as far as its specifications allow."
      >
        <div className="space-y-3">
          {selection === "GPU" && parts.GPU && parts.CPU?.hasIntegratedGraphics && (
            <button
              className="flex w-full items-center justify-between rounded-xl border border-border p-4 text-left text-sm hover:bg-secondary"
              onClick={() => {
                const next = { ...parts };
                delete next.GPU;
                setParts(next);
                setSelection("");
              }}
            >
              Use integrated graphics (remove graphics card)
            </button>
          )}
          {(() => {
            const slotItems = catalog[selection] || [];
            if (slotItems.length === 0) return <EmptyCatalog />;
            return slotItems.map((item) => {
              const check = compatibility({ ...parts, [selection]: item }, { ownedSlots: owned });
              const issue = check.result.find((row) => row.state === "error");
              // Only what concerns this option, so that one part's gap doesn't mark every other choice.
              const unverifiedCheck = check.summary.items.find(
                (row) =>
                  row.status === "unknown" &&
                  row.affectedSlots.includes(selection as ComponentSlotId),
              );
              const current = parts[selection];
              const diff =
                current && !owned.includes(selection) ? item.price - current.price : item.price;
              const active = current?.id === item.id && !owned.includes(selection);
              return (
                <button
                  key={item.id}
                  disabled={!check.valid || active}
                  onClick={() => {
                    swap(selection, item);
                    setSelection("");
                  }}
                  className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition enabled:hover:bg-secondary disabled:cursor-not-allowed ${
                    active ? "border-primary bg-secondary/40" : "border-border"
                  } ${!check.valid ? "opacity-50" : ""}`}
                >
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p
                      className={`mt-1 text-xs ${issue ? "text-red-600" : "text-muted-foreground"}`}
                    >
                      {active
                        ? "Current selection"
                        : issue
                          ? issue.label
                          : item.stock === 0
                            ? "Currently unavailable"
                            : hasRejectedSpecs(item.specs)
                              ? "IT HUB rejected these specifications, and must check this part"
                              : item.isVerified === false
                                ? "Specifications unverified"
                                : unverifiedCheck
                                  ? `Needs checking: ${unverifiedCheck.label}`
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
              );
            });
          })()}
        </div>
      </Modal>
    </div>
  );
}

function SmartBuilder() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const saved = store.builds.find((build) => build.id === params.get("build"));
  const [mode, setMode] = useState<"landing" | "smart" | "expert">(
    params.get("mode") === "expert" ? "expert" : saved ? "smart" : "landing",
  );
  const [expertSeed, setExpertSeed] = useState<{
    parts: Record<string, ComponentOption>;
    name: string;
    savedId?: string;
    owned?: string[];
  }>({ parts: {}, name: "My custom PC" });
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
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
  );

  useEffect(() => {
    loadSavedBuilds().then((savedBuilds) => {
      if (savedBuilds.length > 0) {
        store.set((prev) => {
          const existingIds = new Set(prev.builds.map((b) => b.id));
          const fresh = savedBuilds
            .filter((b) => !existingIds.has(b.id))
            .map((b) => ({
              id: b.id,
              name: b.name,
              // Saved in the engine's model. An empty catalogue converts without judging availability.
              parts: reconcileBuildParts(b.components, {}).parts,
              price: Object.values(b.components).reduce((sum, c) => sum + (c?.price || 0), 0),
              designedFor: b.designedFor,
              templateId: b.templateId,
              owned: b.ownedSlots as any,
            }));
          return fresh.length ? { builds: [...prev.builds, ...fresh] } : {};
        });
      }
    });
  }, []);

  useEffect(() => {
    if (store.products.length === 0 && !store.catalogLoading) {
      store.refreshCatalog();
    }
  }, [store.products.length, store.catalogLoading]);

  // A phone can reload the page while the customer reads the code, so the kept build has to come back
  // from here as well. It opens only from the landing page, so it never replaces a build on screen.
  useEffect(() => {
    if (!store.loggedIn || mode !== "landing" || detail) return;
    const pending = getPendingQuotation();
    if (!pending?.parts || Object.keys(pending.parts).length === 0) return;
    if (pending.mode === "wizard") {
      setExpertSeed({ parts: pending.parts, name: pending.name, owned: pending.ownedSlots });
      setMode("expert");
    } else {
      setDetail({
        name: pending.name,
        designedFor: pending.build?.designedFor || "your custom configuration",
        highlights: [],
        parts: pending.parts,
        owned: pending.ownedSlots || [],
        templateId: pending.build?.templateId,
      });
      setMode("smart");
    }
  }, [store.loggedIn]);

  const update = (next: Partial<Answers>) => setAnswers({ ...answers, ...next });
  const budget = resolvedBudget(answers);
  // Cheaper builds IT HUB has to check are offered beside confirmed ones, and each one says so.
  const { recommendations, shortfallInfo } = useMemo(() => {
    if (step !== 2) return { recommendations: [], shortfallInfo: null };
    const builds = generateDynamicCatalogRecommendations(store.componentCatalog, answers, budget, {
      allowUnverified: true,
    });
    return {
      recommendations: builds,
      shortfallInfo:
        builds.length > 0
          ? null
          : getBudgetShortfallInfo(store.componentCatalog, answers, budget, {
              allowUnverified: true,
            }),
    };
  }, [step, store.componentCatalog, answers, budget?.min, budget?.max]);
  const essentialSlots = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"];
  const missingSlots = essentialSlots.filter(
    (slot) =>
      // A rejected part is never recommended, so a slot with only those is as good as empty.
      !(store.componentCatalog[slot] || []).some((part) => !hasRejectedSpecs(part.specs)),
  );
  const purposeInfo = purposes.find((item) => item.id === answers.purpose);
  const basedOn = [purposeInfo?.title, budget?.label].filter(Boolean).join(" • ");
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const go = (next: number) => {
    setStep(next);
    scrollTop();
  };
  const clearSaved = () => {
    if (params.get("build") || params.get("mode")) setParams({});
  };

  if (mode === "expert")
    return (
      <ExpertBuilder
        initialParts={expertSeed.parts.CPU || !saved ? expertSeed.parts : saved.parts}
        initialName={expertSeed.parts.CPU || !saved ? expertSeed.name : saved.name}
        initialOwned={expertSeed.parts.CPU || !saved ? expertSeed.owned : saved.owned}
        savedId={expertSeed.savedId || saved?.id}
        onBack={() => {
          clearSaved();
          setMode(detail ? "smart" : "landing");
        }}
      />
    );

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
              Tell us what you need and your budget. We'll suggest suitable PC configurations.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={() => {
                  setMode("smart");
                  setStep(0);
                }}
              >
                <Sparkles size={16} /> Find My PC
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setExpertSeed({ parts: {}, name: "My custom PC" });
                  setMode("expert");
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
              text: "Pick a range for the complete PC — not per part.",
            },
            {
              title: "Get matched builds",
              text: "Configurations from live products, with clear estimated pricing.",
            },
          ].map((item, index) => (
            <div key={item.title} className="rounded-2xl border border-border p-6">
              <span className="text-xs font-bold text-primary">0{index + 1}</span>
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  Resume editing or request an updated quotation
                </p>
              </div>
              <Badge tone="blue">{store.builds.length} Saved</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {store.builds.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col justify-between rounded-xl border border-border/80 p-4 bg-muted/20 hover:border-primary/40 transition"
                >
                  <div>
                    <h3 className="text-xs font-bold text-foreground line-clamp-1">{b.name}</h3>
                    <p className="text-xs text-primary font-bold mt-1">
                      {money(
                        Object.values(
                          reconcileBuildParts(b.parts, store.componentCatalog).parts,
                        ).reduce((sum, part) => sum + (isUnavailable(part) ? 0 : part.price), 0),
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {Object.keys(b.parts || {}).length} components selected
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="text-xs flex-1 py-1"
                      onClick={() => {
                        setExpertSeed({
                          parts: b.parts,
                          name: b.name,
                          savedId: b.id,
                          owned: b.owned,
                        });
                        setMode("expert");
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
    );

  if (detail)
    return (
      <Page>
        <BuildDetail
          key={JSON.stringify(detail.parts) + detail.name}
          initial={detail}
          savedId={saved?.id}
          startCustomizing={Boolean(saved)}
          onBack={() => {
            setDetail(null);
            if (saved) {
              clearSaved();
              setMode("landing");
            }
            scrollTop();
          }}
          onExpert={(parts, name, owned) => {
            setExpertSeed({ parts, name, savedId: saved?.id, owned });
            setMode("expert");
          }}
        />
      </Page>
    );

  const purposeReady = Boolean(answers.purpose);
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
              const active = answers.purpose === id;
              return (
                <button
                  key={id}
                  aria-pressed={active}
                  onClick={() => update({ purpose: id })}
                  className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 md:flex-col md:p-6 ${
                    active
                      ? "border-primary bg-secondary shadow-[0_10px_30px_-15px_rgba(26,79,214,.6)]"
                      : "border-border bg-white hover:border-primary"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                      active ? "bg-primary text-white" : "bg-secondary text-primary"
                    }`}
                  >
                    <Icon size={24} strokeWidth={1.7} />
                  </span>
                  <span>
                    <span className="block font-bold uppercase tracking-wide">{title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
                  </span>
                </button>
              );
            })}
          </div>
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
            The complete PC build budget — not individual parts.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {budgets.map((band) => {
              const active = answers.budgetId === band.id;
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
                </button>
              );
            })}
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
          <p className="text-xs font-bold tracking-widest text-primary">YOUR RECOMMENDED BUILDS</p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
            Builds suggested for you
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Based on: <strong className="text-foreground">{basedOn}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{RANKING_BASIS}</p>
          <div className="mt-6">
            <CatalogWarning />
          </div>
          {store.catalogLoading && recommendations.length === 0 ? (
            <div className="mt-8 rounded-3xl bg-muted p-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">Loading live products…</p>
            </div>
          ) : recommendations.length ? (
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {recommendations.map((build, index) => {
                const unavailable = Object.values(build.parts).some(
                  (part: any) => part?.stock === 0,
                );
                return (
                  <article
                    key={build.templateId}
                    className="flex flex-col rounded-3xl border border-border bg-white p-6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-bold tracking-widest text-muted-foreground">
                        BUILD 0{index + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge>{build.tradeoff}</Badge>
                        {build.confidenceBadge === "certified" && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                            title="Every component's specifications are on IT HUB's specification list, and every check passed."
                          >
                            <CheckCircle2 size={11} className="text-emerald-600" /> Specs Confirmed
                          </span>
                        )}
                        {build.confidenceBadge === "high" && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                            title="Core components have stated specifications. IT HUB confirms the rest."
                          >
                            <AlertTriangle size={11} className="text-amber-600" /> Some Specs
                            Unconfirmed
                          </span>
                        )}
                        {build.requiresReview && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            <AlertTriangle size={11} className="text-amber-600" /> Needs IT HUB
                            review
                          </span>
                        )}
                      </div>
                    </div>
                    <h2 className="mt-3 text-xl font-bold">{build.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Designed for {build.designedFor}
                    </p>
                    <RankingEvidence build={build} compact />
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
                                (type === "GPU" && build.parts.CPU?.hasIntegratedGraphics
                                  ? "Integrated graphics"
                                  : "—")}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-6">
                      <p className="text-xs text-muted-foreground">Estimated price</p>
                      <p className="font-display text-2xl font-bold text-primary">
                        {money(build.price + (store.assemblyCharge || 0))}
                      </p>
                      {build.note && (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{build.note}</p>
                      )}
                      {build.requiresReview && (
                        <p className="mt-2 text-xs leading-5 text-amber-800">
                          {UNVERIFIED_NOTICE} IT HUB will check this build before confirming it.
                        </p>
                      )}
                      {unavailable && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                          <PackageX size={13} /> One part is out of stock — alternative available
                        </p>
                      )}
                      <Button
                        className="mt-5 w-full"
                        onClick={() => {
                          setDetail(build);
                          scrollTop();
                        }}
                      >
                        View Build <ArrowRight size={15} />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : missingSlots.length > 0 ? (
            <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-950">
              <PackageX className="mx-auto h-10 w-10 text-amber-700 mb-3" />
              <h2 className="text-lg font-bold">Catalog Incomplete for Pre-Configured Builds</h2>
              <p className="mt-2 text-sm text-amber-900 max-w-xl mx-auto">
                The live store catalog currently does not have eligible products for:{" "}
                <span className="font-semibold underline">{missingSlots.join(", ")}</span>. Rather
                than suggesting unverified or unavailable parts, our team can source them directly
                for you.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button onClick={() => setMode("expert")}>
                  <Wrench size={15} /> Open Expert Mode
                </Button>
                <a
                  href={`https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(`Hi IT HUB, I'm looking for a custom PC configuration for ${basedOn || "custom use"} with budget ${budget?.label || "custom"}. Could you assist with component availability?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:brightness-95 transition"
                >
                  <WhatsAppIcon size={16} /> Contact on WhatsApp
                </a>
              </div>
            </div>
          ) : shortfallInfo ? (
            <div className="mt-8 rounded-3xl border border-blue-200 bg-blue-50/70 p-8 text-center text-slate-900">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 mb-3">
                <SlidersHorizontal size={22} />
              </div>
              <h2 className="text-xl font-bold">
                No complete PC found within {budget?.label || "selected budget"}
              </h2>
              <p className="mt-2 text-sm text-slate-700 max-w-xl mx-auto">
                The closest complete configuration available in our live store starts at{" "}
                <strong className="text-foreground">
                  {money(shortfallInfo.closestBuild.price)}
                </strong>{" "}
                (Budget shortfall:{" "}
                <strong className="text-primary">{money(shortfallInfo.shortfallAmount)}</strong>).
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button
                  onClick={() => {
                    setDetail(shortfallInfo.closestBuild);
                    scrollTop();
                  }}
                >
                  Show Closest Build ({money(shortfallInfo.closestBuild.price)}){" "}
                  <ArrowRight size={15} />
                </Button>
                <Button variant="secondary" onClick={() => go(1)}>
                  <RotateCcw size={14} /> Adjust Budget
                </Button>
                <Button variant="secondary" onClick={() => setMode("expert")}>
                  <Wrench size={14} /> Open Expert Mode
                </Button>
                <a
                  href={`https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(
                    `Hi IT HUB, I was looking for a custom PC for ${basedOn || "custom use"} with budget ${budget?.label || "custom"}. The closest build starts at ${money(shortfallInfo.closestBuild.price)} (Shortfall: ${money(shortfallInfo.shortfallAmount)}). Could you assist with component sourcing or custom pricing?`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:brightness-95 transition"
                >
                  <WhatsAppIcon size={16} /> Contact on WhatsApp
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-3xl bg-muted p-8 text-center">
              <h2 className="text-lg font-bold">We couldn't match a ready build</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Try a different budget, or message IT HUB and we'll put together a configuration for
                you.
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
                setExpertSeed({ parts: {}, name: "My custom PC" });
                setMode("expert");
              }}
            >
              <Wrench size={14} /> I know what I want → Build Manually
            </Button>
          </div>
        </section>
      )}
    </Page>
  );
}

export default function Builder() {
  const [params] = useSearchParams();
  useEffect(() => track("PC Builder Started"), []);
  return <SmartBuilder key={params.get("build") || "new"} />;
}
