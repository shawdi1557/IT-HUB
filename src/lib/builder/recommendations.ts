// src/lib/builder/recommendations.ts
// IT HUB Deterministic Guided PC Recommendation Engine
// Converts customer questionnaire answers into fully compatible hardware configurations.

import type {
  CanonicalBuild,
  CanonicalBuildComponent,
  ComponentSlotId,
  GuidedAnswers,
  RecommendationCandidate,
} from "./types"
import { checkCompatibility } from "./compatibility"

export function generateRecommendations(
  answers: GuidedAnswers,
  catalog: Record<ComponentSlotId, CanonicalBuildComponent[]>,
): RecommendationCandidate[] {
  const budget = answers.budgetInr || 65000
  const owned = new Set(answers.ownedParts || [])
  const candidates: RecommendationCandidate[] = []

  // Helper to pick part by key substring
  const getPart = (slot: ComponentSlotId, matcher: (c: CanonicalBuildComponent) => boolean): CanonicalBuildComponent | undefined => {
    return catalog[slot]?.find(matcher) || catalog[slot]?.[0]
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tier 1: Value / Budget Match (~₹35,000 – ₹55,000)
  // AMD AM4 (Ryzen 5 5600) + B550M + 16GB DDR4 + RX 7600/GTX or i5-12400F
  // ───────────────────────────────────────────────────────────────────────────
  const valueParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {}
  valueParts.CPU = getPart("CPU", (c) => c.productId.includes("r5-5600") || c.productId.includes("12400f"))
  valueParts.Motherboard = getPart("Motherboard", (c) => c.productId.includes("b550m") || c.productId.includes("b760m"))
  valueParts.RAM = getPart("RAM", (c) => c.productId.includes("16gb-ddr4"))
  valueParts.Storage = getPart("Storage", (c) => c.productId.includes("500gb") || c.productId.includes("1tb"))
  valueParts.PSU = getPart("PSU", (c) => c.productId.includes("550w"))
  valueParts.Cabinet = getPart("Cabinet", (c) => c.productId.includes("case-matx"))

  if (answers.purpose === "gaming" || answers.purpose === "creation") {
    valueParts.GPU = getPart("GPU", (c) => c.productId.includes("rx7600") || c.productId.includes("rtx4060"))
  }

  const valueBuild = createBuildFromParts(
    "Smart Value Configuration",
    "guided",
    valueParts,
    owned,
    answers.purpose,
  )
  if (valueBuild.compatibility.valid) {
    candidates.push({
      build: valueBuild,
      style: "best-fit",
      title: "Best Value for Budget",
      matchScore: calculateScore(valueBuild, budget, answers),
      rationale: "Optimized price-to-performance ratio utilizing proven components with zero bottlenecking.",
      highlights: [
        "High clock speed 6-core processor ideal for gaming & day-to-day productivity",
        "Fast NVMe Solid State Drive for lightning-fast application launches",
        "80 Plus Bronze certified power delivery with built-in surge protection",
      ],
      tradeOffs: budget < 40000 ? "Uses previous-gen DDR4 platform to maximize graphics budget." : undefined,
    })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tier 2: Balanced Modern Platform (~₹65,000 – ₹95,000)
  // AMD AM5 (Ryzen 5 7600) + B650M + 16GB/32GB DDR5 + RTX 4060
  // ───────────────────────────────────────────────────────────────────────────
  const balancedParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {}
  balancedParts.CPU = getPart("CPU", (c) => c.productId.includes("r5-7600"))
  balancedParts.Motherboard = getPart("Motherboard", (c) => c.productId.includes("b650m"))
  balancedParts.RAM = getPart("RAM", (c) => c.productId.includes("16gb-ddr5") || c.productId.includes("32gb-ddr5"))
  balancedParts.Storage = getPart("Storage", (c) => c.productId.includes("1tb"))
  balancedParts.PSU = getPart("PSU", (c) => c.productId.includes("550w") || c.productId.includes("650w"))
  balancedParts.Cabinet = getPart("Cabinet", (c) => c.productId.includes("case-atx") || c.productId.includes("case-matx"))
  balancedParts.Cooler = getPart("Cooler", (c) => c.productId.includes("ag400"))

  if (answers.purpose === "gaming" || answers.purpose === "creation") {
    balancedParts.GPU = getPart("GPU", (c) => c.productId.includes("rtx4060"))
  }

  const balancedBuild = createBuildFromParts(
    "Balanced Modern Rig",
    "guided",
    balancedParts,
    owned,
    answers.purpose,
  )
  if (balancedBuild.compatibility.valid) {
    candidates.push({
      build: balancedBuild,
      style: "balanced",
      title: "Balanced Modern Rig",
      matchScore: calculateScore(balancedBuild, budget, answers),
      rationale: "Modern AM5 architecture with DDR5 memory, PCIe 4.0 expansion, and DLSS 3 ray tracing support.",
      highlights: [
        "AMD Zen 4 processor with integrated RDNA2 graphics backup",
        "Ultra-fast DDR5 memory bandwidth for heavy multitasking",
        "Full support for ray tracing, DLSS 3 frame generation, and AV1 video encoding",
      ],
    })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tier 3: High Performance & Upgrade-Friendly (~₹1,15,000+)
  // AMD AM5 (Ryzen 7 9700X) + B650M / Z790 + 32GB DDR5 + RTX 4070 Super + 750W PSU
  // ───────────────────────────────────────────────────────────────────────────
  const enthusiastParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {}
  enthusiastParts.CPU = getPart("CPU", (c) => c.productId.includes("r7-9700x") || c.productId.includes("14600k"))
  enthusiastParts.Motherboard = getPart("Motherboard", (c) => c.productId.includes("b650m") || c.productId.includes("z790"))
  enthusiastParts.RAM = getPart("RAM", (c) => c.productId.includes("32gb-ddr5"))
  enthusiastParts.GPU = getPart("GPU", (c) => c.productId.includes("rtx4070-super") || c.productId.includes("rtx4060"))
  enthusiastParts.Storage = getPart("Storage", (c) => c.productId.includes("1tb"))
  enthusiastParts.PSU = getPart("PSU", (c) => c.productId.includes("750w"))
  enthusiastParts.Cabinet = getPart("Cabinet", (c) => c.productId.includes("case-atx"))
  enthusiastParts.Cooler = getPart("Cooler", (c) => c.productId.includes("le520") || c.productId.includes("ag400"))

  const enthusiastBuild = createBuildFromParts(
    "High-Performance Creator & Gaming Beast",
    "guided",
    enthusiastParts,
    owned,
    answers.purpose,
  )
  if (enthusiastBuild.compatibility.valid) {
    candidates.push({
      build: enthusiastBuild,
      style: "upgrade-friendly",
      title: "High-Performance Workstation & Gaming",
      matchScore: calculateScore(enthusiastBuild, budget, answers),
      rationale: "Flagship 8-core/16-thread processing with dedicated AIO liquid cooling and heavy graphics capability for 1440p ultra gaming and 4K rendering.",
      highlights: [
        "Unrestricted 1440p ultra gaming performance with 12GB VRAM",
        "240mm liquid cooling maintaining whisper-quiet acoustic operation",
        "750W 80+ Gold power supply accommodating future high-end graphics upgrades",
      ],
    })
  }

  // Sort candidates by matchScore descending
  return candidates.sort((a, b) => b.matchScore - a.matchScore)
}

function createBuildFromParts(
  name: string,
  mode: "guided" | "expert",
  parts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  owned: Set<ComponentSlotId>,
  workload: GuidedAnswers["purpose"],
): CanonicalBuild {
  // If customer owns a part, we still track it in components for compatibility calculation,
  // but tag ownedSlots so UI and price calculators exclude it from total cost.
  let normalizedWorkload: "gaming" | "creation" | "work" | "general" = "general"
  if (workload === "gaming") normalizedWorkload = "gaming"
  else if (workload === "creation") normalizedWorkload = "creation"
  else if (workload === "programming" || workload === "office") normalizedWorkload = "work"
  else normalizedWorkload = "general"

  const compatibility = checkCompatibility(parts, { workload: normalizedWorkload })

  return {
    id: `build-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    mode,
    currency: "INR",
    components: parts,
    compatibility,
    ownedSlots: Array.from(owned),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function calculateScore(
  build: CanonicalBuild,
  targetBudget: number,
  answers: GuidedAnswers,
): number {
  let score = 80 // baseline

  // Calculate unowned subtotal
  const owned = new Set(build.ownedSlots || [])
  let total = 0
  for (const [slot, comp] of Object.entries(build.components)) {
    if (comp && !owned.has(slot as ComponentSlotId)) {
      total += comp.price
    }
  }

  // Budget proximity: closest to budget gets highest points
  const delta = Math.abs(total - targetBudget)
  const budgetRatio = delta / targetBudget
  if (budgetRatio <= 0.1) score += 20
  else if (budgetRatio <= 0.2) score += 10
  else if (budgetRatio <= 0.35) score += 5
  else score -= 15

  // Workload bonuses
  if (answers.purpose === "gaming" && build.components.GPU) score += 10
  if (answers.purpose === "creation" && (build.components.RAM?.specs.capacityGb || 0) >= 32) score += 10
  if (answers.requireWifi && build.components.Motherboard?.specs.hasWifi) score += 10

  return Math.min(100, Math.max(10, score))
}
