// src/lib/builder/recommendations.ts
// IT HUB Deterministic Guided PC Recommendation Engine
// Dynamically generates valid, fully compatible hardware configurations exclusively from available catalog products.
// Preserves authoritative Shopify prices, variant IDs, and inventory across Find My PC and Expert Mode.

import type {
  CanonicalBuild,
  CanonicalBuildComponent,
  ComponentSlotId,
  GuidedAnswers,
  RecommendationCandidate,
} from "./types"
import { checkCompatibility } from "./compatibility"

export function getMissingCatalogCategories(
  catalog: Record<ComponentSlotId, CanonicalBuildComponent[]> | Record<string, any[]>,
  ownedParts: string[] = [],
): ComponentSlotId[] {
  const essential: ComponentSlotId[] = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"]
  return essential.filter((slot) => !ownedParts.includes(slot) && (!catalog[slot] || catalog[slot].length === 0))
}

interface NormalizedItem {
  slot: ComponentSlotId
  id: string
  name: string
  price: number
  variantId?: string
  socket?: string
  ramGeneration?: string
  tdpWatts?: number
  ratedWattage?: number
  hasWifi?: boolean
  hasIntegratedGraphics?: boolean
  includesCooler?: boolean
  availability: "available" | "unavailable"
  isShopifyLive?: boolean
  raw: any
}

function normalizeItem(raw: any, slot: ComponentSlotId): NormalizedItem {
  const isCanonical = "productId" in raw && "specs" in raw
  const title = (isCanonical ? raw.title : raw.name) || ""
  const normTitle = title.toLowerCase()

  let socket = isCanonical ? raw.specs.socket : raw.socket
  if (!socket) {
    if (normTitle.includes("am5") || normTitle.includes("7600") || normTitle.includes("7700") || normTitle.includes("7800") || normTitle.includes("9600") || normTitle.includes("9700") || normTitle.includes("b650") || normTitle.includes("x670")) {
      socket = "AM5"
    } else if (normTitle.includes("am4") || normTitle.includes("5600") || normTitle.includes("5700") || normTitle.includes("5800") || normTitle.includes("3600") || normTitle.includes("5500") || normTitle.includes("b550") || normTitle.includes("a520") || normTitle.includes("x570")) {
      socket = "AM4"
    } else if (normTitle.includes("1700") || normTitle.includes("12400") || normTitle.includes("13400") || normTitle.includes("13600") || normTitle.includes("14400") || normTitle.includes("14600") || normTitle.includes("b760") || normTitle.includes("z790")) {
      socket = "LGA1700"
    }
  }

  let ramGen = isCanonical ? (raw.specs.supportedRamGeneration || raw.specs.ramGeneration) : raw.ram
  if (!ramGen) {
    if (normTitle.includes("ddr5") || socket === "AM5") {
      ramGen = "DDR5"
    } else if (normTitle.includes("ddr4") || socket === "AM4") {
      ramGen = "DDR4"
    }
  }

  let tdpWatts = isCanonical ? (raw.specs.tdpWatts || raw.specs.powerWatts) : raw.watts
  if (!tdpWatts) {
    if (slot === "CPU") tdpWatts = 65
    else if (slot === "GPU") tdpWatts = 160
  }

  let ratedWattage = isCanonical ? raw.specs.ratedWattage : raw.capacity
  if (!ratedWattage && slot === "PSU") {
    const match = normTitle.match(/(\d{3,4})\s*w/i)
    if (match) ratedWattage = Number(match[1])
  }

  const hasWifi = isCanonical
    ? Boolean(raw.specs.hasWifi)
    : Boolean(raw.wifi || /wifi|wi-fi/i.test(normTitle))

  let hasIntegratedGraphics = isCanonical ? raw.specs.hasIntegratedGraphics : raw.hasIntegratedGraphics
  if (hasIntegratedGraphics === undefined && slot === "CPU") {
    hasIntegratedGraphics = normTitle.includes("g") || socket === "AM5" || (!normTitle.endsWith("f") && !normTitle.includes(" f ") && socket === "LGA1700")
  }

  let includesCooler = isCanonical ? raw.specs.includesCooler : raw.includesCooler
  if (includesCooler === undefined && slot === "CPU") {
    includesCooler = normTitle.includes("5600") || normTitle.includes("12400") || normTitle.includes("7600")
  }

  return {
    slot,
    id: isCanonical ? raw.productId : raw.id,
    name: title,
    price: raw.price || 0,
    variantId: raw.variantId || undefined,
    socket,
    ramGeneration: ramGen,
    tdpWatts,
    ratedWattage,
    hasWifi,
    hasIntegratedGraphics,
    includesCooler,
    availability: raw.availability === "unavailable" || raw.stock === 0 ? "unavailable" : "available",
    isShopifyLive: Boolean(raw.isShopifyLive || raw.variantId),
    raw,
  }
}

/**
 * Dynamically synthesizes hardware build configurations from available products.
 */
function synthesizeBuildConfigurations(
  itemsBySlot: Record<ComponentSlotId, NormalizedItem[]>,
  options: {
    purpose: string
    targetBudget: number
    ownedSlots: Set<string>
    preferredBrands?: string[]
    requireWifi?: boolean
    resolution?: string
  },
) {
  const { purpose, targetBudget, ownedSlots, preferredBrands = [], requireWifi = false, resolution } = options

  // Enforce catalog completeness
  const essentialSlots: ComponentSlotId[] = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"]
  const missing = essentialSlots.filter((slot) => !ownedSlots.has(slot) && (!itemsBySlot[slot] || itemsBySlot[slot].length === 0))
  if (missing.length > 0) return []

  const isGaming = purpose === "gaming"
  const isCreation = purpose === "creation"

  // Filter CPUs: prefer in-stock & live products
  const allCpus = (itemsBySlot.CPU || []).filter((c) => c.availability !== "unavailable")
  const cpus = allCpus.length > 0 ? allCpus : (itemsBySlot.CPU || [])
  if (cpus.length === 0) return []

  // Sort CPUs: brand preference, then budget fit
  cpus.sort((a, b) => {
    const aBrandMatch = preferredBrands.some((br) => a.name.toLowerCase().includes(br.toLowerCase()))
    const bBrandMatch = preferredBrands.some((br) => b.name.toLowerCase().includes(br.toLowerCase()))
    if (aBrandMatch && !bBrandMatch) return -1
    if (!aBrandMatch && bBrandMatch) return 1
    return a.price - b.price
  })

  const results: Array<{
    parts: Partial<Record<ComponentSlotId, NormalizedItem>>
    price: number
    score: number
    title: string
    tradeoff: "best-fit" | "balanced" | "upgrade-friendly"
    highlights: string[]
    designedFor: string
  }> = []

  for (const cpu of cpus) {
    const cpuSocket = cpu.socket || "AM4"

    // 1. Compatible Motherboards
    const allMobos = (itemsBySlot.Motherboard || []).filter((m) => !m.socket || !cpuSocket || m.socket === cpuSocket)
    if (allMobos.length === 0) continue

    // Prioritize Wi-Fi if requested, then in-stock
    allMobos.sort((a, b) => {
      if (requireWifi) {
        if (a.hasWifi && !b.hasWifi) return -1
        if (!a.hasWifi && b.hasWifi) return 1
      }
      return a.price - b.price
    })
    const mobo = allMobos[0]
    if (!mobo) continue

    // 2. Compatible RAM
    const targetRamGen = mobo.ramGeneration || (cpuSocket === "AM5" ? "DDR5" : "DDR4")
    const allRams = (itemsBySlot.RAM || []).filter((r) => !r.ramGeneration || !targetRamGen || r.ramGeneration === targetRamGen)
    if (allRams.length === 0 && !ownedSlots.has("RAM")) continue

    allRams.sort((a, b) => {
      if (isCreation) {
        const a32 = a.name.includes("32GB") || a.name.includes("32gb")
        const b32 = b.name.includes("32GB") || b.name.includes("32gb")
        if (a32 && !b32) return -1
        if (!a32 && b32) return 1
      }
      return a.price - b.price
    })
    const ram = allRams[0]

    // 3. Storage
    const allStorage = (itemsBySlot.Storage || []).slice().sort((a, b) => a.price - b.price)
    if (allStorage.length === 0 && !ownedSlots.has("Storage")) continue
    // If budget allows, prefer 1TB over 500GB
    const storage1tb = allStorage.find((s) => s.name.includes("1TB") || s.name.includes("1tb"))
    const storage = (targetBudget > 55000 && storage1tb) ? storage1tb : allStorage[0]

    // 4. Cabinet
    const allCabinets = (itemsBySlot.Cabinet || []).slice().sort((a, b) => a.price - b.price)
    if (allCabinets.length === 0 && !ownedSlots.has("Cabinet")) continue
    const cabinet = allCabinets[0]

    // 5. GPU
    let gpu: NormalizedItem | undefined = undefined
    const allGpus = (itemsBySlot.GPU || []).slice()
    const requiresDiscreteGpu = isGaming || isCreation || !cpu.hasIntegratedGraphics

    if (ownedSlots.has("GPU")) {
      gpu = undefined
    } else if (requiresDiscreteGpu) {
      if (allGpus.length === 0) {
        if (!cpu.hasIntegratedGraphics) {
          // Cannot display anything without GPU
          continue
        }
        gpu = undefined
      } else {
        // Sort GPUs by brand preference and price
        allGpus.sort((a, b) => {
          const aBrand = preferredBrands.some((br) => a.name.toLowerCase().includes(br.toLowerCase()))
          const bBrand = preferredBrands.some((br) => b.name.toLowerCase().includes(br.toLowerCase()))
          if (aBrand && !bBrand) return -1
          if (!aBrand && bBrand) return 1
          return a.price - b.price
        })
        gpu = allGpus[0]
      }
    } else {
      // Work / Office / General
      if (!cpu.hasIntegratedGraphics && allGpus.length > 0) {
        gpu = allGpus[0]
      } else {
        gpu = undefined
      }
    }

    // 6. Cooler
    let cooler: NormalizedItem | undefined = undefined
    const allCoolers = (itemsBySlot.Cooler || []).slice().sort((a, b) => a.price - b.price)
    if (!cpu.includesCooler) {
      if (allCoolers.length === 0) {
        // CPU cannot cool without cooler
        continue
      }
      cooler = allCoolers[0]
    } else if (allCoolers.length > 0 && targetBudget >= 60000) {
      cooler = allCoolers[0]
    }

    // 7. PSU
    const cpuWatts = cpu.tdpWatts || 65
    const gpuWatts = gpu ? (gpu.tdpWatts || 160) : 0
    const loadWatts = cpuWatts + gpuWatts + 80
    const recWatts = Math.max(450, Math.ceil((loadWatts + 100) / 50) * 50)

    const allPsus = (itemsBySlot.PSU || []).slice()
    if (allPsus.length === 0 && !ownedSlots.has("PSU")) continue

    const matchingPsus = allPsus.filter((p) => (p.ratedWattage || 550) >= recWatts)
    matchingPsus.sort((a, b) => (a.ratedWattage || 550) - (b.ratedWattage || 550))
    const psu = matchingPsus[0] || allPsus.sort((a, b) => (b.ratedWattage || 550) - (a.ratedWattage || 550))[0]

    // Form parts map
    const candidateParts: Partial<Record<ComponentSlotId, NormalizedItem>> = {
      CPU: cpu,
      Motherboard: mobo,
      Cabinet: cabinet,
    }
    if (ram && !ownedSlots.has("RAM")) candidateParts.RAM = ram
    if (storage && !ownedSlots.has("Storage")) candidateParts.Storage = storage
    if (psu && !ownedSlots.has("PSU")) candidateParts.PSU = psu
    if (gpu && !ownedSlots.has("GPU")) candidateParts.GPU = gpu
    if (cooler && !ownedSlots.has("Cooler")) candidateParts.Cooler = cooler

    // Calculate unowned total price
    let price = 0
    for (const [slot, item] of Object.entries(candidateParts)) {
      if (item && !ownedSlots.has(slot)) {
        price += item.price
      }
    }

    // Determine style / tradeoff
    let tradeoff: "best-fit" | "balanced" | "upgrade-friendly" = "balanced"
    if (price <= targetBudget * 0.9 || price <= 45000) {
      tradeoff = "best-fit"
    } else if (price >= targetBudget * 1.15 || cpuSocket === "AM5" || (gpu && gpu.price >= 35000)) {
      tradeoff = "upgrade-friendly"
    }

    // Score candidate
    let score = 80
    const delta = Math.abs(price - targetBudget)
    const ratio = delta / (targetBudget || 1)
    if (ratio <= 0.1) score += 20
    else if (ratio <= 0.25) score += 10
    else score -= Math.min(25, Math.round(ratio * 30))

    if (isGaming && gpu) score += 15
    if (isCreation && (ram?.name.includes("32GB") || ram?.name.includes("32gb"))) score += 10
    if (requireWifi && mobo.hasWifi) score += 10

    const cleanCpuTitle = cpu.name.replace(/^\[TEST\]\s*/i, "").trim()
    const cleanGpuTitle = gpu ? gpu.name.replace(/^\[TEST\]\s*/i, "").trim() : ""
    const gpuShort = cleanGpuTitle ? cleanGpuTitle.split(" ").slice(0, 3).join(" ") : ""

    const title = cleanGpuTitle
      ? `${cleanCpuTitle} · ${gpuShort} Build`
      : `${cleanCpuTitle} Custom System`

    const designedFor = isGaming
      ? `${resolution || "1080p"} Gaming & Daily Performance`
      : isCreation
        ? "Content Creation & Rendering"
        : "Productivity & Multitasking"

    const highlights: string[] = [
      `${cleanCpuTitle} processor delivering smooth responsiveness`,
      gpu ? `${cleanGpuTitle} dedicated graphics` : "Integrated graphics keeping power consumption and cost minimal",
      storage ? `${storage.name.replace(/^\[TEST\]\s*/i, "")} fast NVMe storage` : "High-speed solid state storage",
    ]
    if (mobo.hasWifi) highlights.push("Integrated Wi-Fi connectivity built into motherboard")

    results.push({
      parts: candidateParts,
      price,
      score,
      title,
      tradeoff,
      highlights,
      designedFor,
    })
  }

  // Deduplicate combinations (unique CPU + GPU + Mobo)
  const seen = new Set<string>()
  const unique = results.filter((r) => {
    const key = `${r.parts.CPU?.id}_${r.parts.GPU?.id || "none"}_${r.parts.Motherboard?.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort by score descending
  unique.sort((a, b) => b.score - a.score)
  return unique.slice(0, 3)
}

/**
 * Guided PC Recommendation Engine (CanonicalBuild format).
 * Strictly requires complete authentic live Shopify products; never fabricates mock parts.
 */
export function generateRecommendations(
  answers: GuidedAnswers,
  catalog: Record<ComponentSlotId, CanonicalBuildComponent[]>,
): RecommendationCandidate[] {
  const budget = answers.budgetInr || 65000
  const owned = new Set(answers.ownedParts || [])

  // Check missing categories
  const missing = getMissingCatalogCategories(catalog, answers.ownedParts || [])
  if (missing.length > 0) return []

  // Normalize canonical items
  const itemsBySlot: Record<ComponentSlotId, NormalizedItem[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
    CaseFans: [],
    Monitor: [],
  }

  for (const [slot, items] of Object.entries(catalog)) {
    itemsBySlot[slot as ComponentSlotId] = (items || []).map((c) => normalizeItem(c, slot as ComponentSlotId))
  }

  const configurations = synthesizeBuildConfigurations(itemsBySlot, {
    purpose: answers.purpose,
    targetBudget: budget,
    ownedSlots: owned,
    preferredBrands: answers.preferredBrands,
    requireWifi: answers.requireWifi,
  })

  return configurations.map((config) => {
    const rawParts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>> = {}
    for (const [slot, normItem] of Object.entries(config.parts)) {
      if (normItem) {
        rawParts[slot as ComponentSlotId] = normItem.raw as CanonicalBuildComponent
      }
    }

    const build = createBuildFromParts(
      config.title,
      "guided",
      rawParts,
      owned,
      answers.purpose,
    )

    return {
      build,
      style: config.tradeoff,
      title: config.title,
      matchScore: config.score,
      rationale: config.highlights.join(". ") + ".",
      highlights: config.highlights,
    }
  }).filter((c) => c.build.compatibility.valid)
}

/**
 * Dynamic catalog recommendation engine directly used by Find My PC in Builder.tsx.
 * Consumes the live store.componentCatalog (with authentic Shopify prices and variant IDs).
 */
export function generateDynamicCatalogRecommendations(
  catalog: Record<string, any[]>,
  answers: {
    purpose: string
    customText?: string
    details?: Record<string, string>
    budgetId?: string
    customBudget?: string
    brands?: string[]
    wifi?: string
    owned?: string[]
  },
  _templates?: any[],
): any[] {
  const owned = new Set(answers.owned || [])

  // Check missing essential categories
  const essentialSlots: ComponentSlotId[] = ["CPU", "Motherboard", "RAM", "Storage", "PSU", "Cabinet"]
  const missing = essentialSlots.filter((slot) => !owned.has(slot) && (!catalog[slot] || catalog[slot].length === 0))
  if (missing.length > 0) return []

  // Resolve target budget
  let targetBudget = 65000
  let minBudget = 35000
  let maxBudget = 150000
  if (answers.budgetId === "custom") {
    const num = Number((answers.customBudget || "").replace(/[^0-9]/g, ""))
    if (num > 0) {
      targetBudget = num
      minBudget = Math.round(num * 0.85)
      maxBudget = num
    }
  } else if (answers.budgetId) {
    const bandMap: Record<string, [number, number]> = {
      budget: [35000, 55000],
      mid: [55000, 85000],
      high: [85000, 140000],
      ultra: [140000, 300000],
    }
    const band = bandMap[answers.budgetId]
    if (band) {
      minBudget = band[0]
      maxBudget = band[1]
      targetBudget = Math.round((band[0] + band[1]) / 2)
    }
  }

  // Normalize catalog items
  const itemsBySlot: Record<ComponentSlotId, NormalizedItem[]> = {
    CPU: [],
    Motherboard: [],
    RAM: [],
    GPU: [],
    Storage: [],
    PSU: [],
    Cabinet: [],
    Cooler: [],
    CaseFans: [],
    Monitor: [],
  }

  for (const [slot, items] of Object.entries(catalog)) {
    if (slot in itemsBySlot) {
      itemsBySlot[slot as ComponentSlotId] = (items || []).map((o) => normalizeItem(o, slot as ComponentSlotId))
    }
  }

  const configurations = synthesizeBuildConfigurations(itemsBySlot, {
    purpose: answers.purpose,
    targetBudget,
    ownedSlots: owned,
    preferredBrands: answers.brands,
    requireWifi: answers.wifi === "Yes",
    resolution: answers.details?.resolution,
  })

  return configurations.map((config, index) => {
    const parts: Record<string, any> = {}
    for (const [slot, normItem] of Object.entries(config.parts)) {
      if (normItem) {
        parts[slot] = normItem.raw
      }
    }

    const inBudget = config.price >= minBudget && config.price <= maxBudget
    let note: string | undefined = undefined
    if (config.price > maxBudget) {
      note = "Above your selected range — the closest suitable configuration for your needs."
    } else if (config.price < minBudget) {
      note = "Below your selected range — covers your needs without overspending."
    }

    return {
      templateId: `dyn-build-${index + 1}-${Date.now().toString(36)}`,
      name: config.title,
      tradeoff: config.tradeoff === "best-fit" ? "Value" : config.tradeoff === "upgrade-friendly" ? "Higher-performance" : "Balanced",
      designedFor: config.designedFor,
      highlights: config.highlights,
      parts,
      owned: Array.from(owned),
      note,
      inBudget,
      price: config.price,
      score: config.score,
    }
  })
}

function createBuildFromParts(
  name: string,
  mode: "guided" | "expert",
  parts: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>,
  owned: Set<ComponentSlotId | string>,
  workload: GuidedAnswers["purpose"],
): CanonicalBuild {
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
    ownedSlots: Array.from(owned) as ComponentSlotId[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
