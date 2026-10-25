// src/lib/builder/types.ts
// IT HUB Canonical PC Builder Data Types & Schema Definitions
// Production-grade types for hardware specifications, compatibility, and build state.

export type ComponentSlotId =
  | "CPU"
  | "Motherboard"
  | "RAM"
  | "GPU"
  | "Storage"
  | "PSU"
  | "Cabinet"
  | "Cooler"
  | "CaseFans"
  | "Monitor"

export type SlotRequirement = "required" | "optional" | "conditional"

export interface SlotDefinition {
  id: ComponentSlotId
  label: string
  category: string
  requirement: SlotRequirement
  description: string
  iconName: string
  allowedTypes: string[]
  maxQuantity: number
}

export type SocketType = "AM4" | "AM5" | "LGA1700" | "LGA1851" | "LGA1200" | string
export type RamGeneration = "DDR4" | "DDR5" | string
export type FormFactor = "ATX" | "Micro-ATX" | "Mini-ITX" | "E-ATX" | string

export interface TechnicalSpecs {
  // Processor
  socket?: SocketType
  tdpWatts?: number
  hasIntegratedGraphics?: boolean
  includesCooler?: boolean
  supportedRamGen?: RamGeneration[]

  // Motherboard
  formFactor?: FormFactor
  ramSlots?: number
  supportedRamGeneration?: RamGeneration
  maxRamCapacityGb?: number
  requiresBiosUpdateForRyzen5000?: boolean
  requiresBiosUpdateForIntel13_14th?: boolean
  m2SlotCount?: number
  sataPortCount?: number
  hasWifi?: boolean

  // RAM
  ramGeneration?: RamGeneration
  isLaptopSoDimm?: boolean
  capacityGb?: number
  moduleCount?: number
  speedMhz?: number

  // Graphics Card
  lengthMm?: number
  slotWidth?: number
  powerWatts?: number
  recommendedPsuWatts?: number
  requiredPciePins?: string
  requiredPcieConnectors?: string[]

  // Storage
  storageInterface?: "M.2 NVMe" | "SATA SSD" | "SATA HDD" | string
  storageFormFactor?: "M.2 2280" | "2.5-inch" | "3.5-inch" | string
  storageCapacityGb?: number

  // Power Supply
  ratedWattage?: number
  efficiencyRating?: string
  psuFormFactor?: "ATX" | "SFX" | string
  pciePowerConnectors?: string[]

  // Computer Case (Cabinet)
  maxGpuLengthMm?: number
  maxCoolerHeightMm?: number
  supportedMotherboards?: FormFactor[]
  includedFanCount?: number

  // Cooler
  coolerHeightMm?: number
  supportedSockets?: SocketType[]
  maxTdpRatingWatts?: number

  // Metadata & Provenance
  provenance?: "manufacturer_verified" | "supplier_spec" | "internal_verified" | "unverified"
  lastVerifiedAt?: string
}

export type AvailabilityStatus = "available" | "unavailable" | "unknown"

export interface CanonicalBuildComponent {
  slot: ComponentSlotId
  productId: string
  variantId: string
  title: string
  brand?: string
  model?: string
  price: number // in INR (clean integer/number)
  currency: string
  productUrl?: string
  imageUrl?: string
  specs: TechnicalSpecs
  availability: AvailabilityStatus
  quantity: number
  retrievedAt: string
  isShopifyLive?: boolean
  isVerified?: boolean
  matchedModelKey?: string
}

export type CompatibilityStatus = "compatible" | "incompatible" | "conditional" | "unknown"
export type CompatibilitySeverity = "error" | "warning" | "info"

export interface CompatibilityItem {
  ruleId: string
  severity: CompatibilitySeverity
  status: CompatibilityStatus
  affectedSlots: ComponentSlotId[]
  label: string
  explanation: string
  suggestedResolution?: string
  dataProvenance?: string
  missingFields?: string[]
}

export interface CompatibilitySummary {
  status: CompatibilityStatus
  items: CompatibilityItem[]
  estimatedSystemLoadWatts: number
  recommendedPsuWatts: number
  powerHeadroomWatts: number
  powerHeadroomStatus: "adequate" | "limited" | "deficit" | "unknown"
  valid: boolean // true when no 'error' severity exists
  validForAutomatedRecommendation: boolean // true when valid and NO blocking unknowns exist
  hasBlockingUnknowns: boolean
  complete: boolean // true when all strictly required slots are populated
}

export type BuildMode = "guided" | "expert"

export interface CanonicalBuild {
  id: string
  userId?: string
  name: string
  mode: BuildMode
  budgetInr?: number
  currency: string
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>
  compatibility: CompatibilitySummary
  designedFor?: string
  templateId?: string
  ownedSlots?: ComponentSlotId[]
  createdAt: string
  updatedAt: string
}

export type BuildPurpose =
  | "gaming"
  | "creation"
  | "programming"
  | "office"
  | "general"
  | "custom"

export interface GuidedAnswers {
  purpose: BuildPurpose
  customText?: string
  details: Record<string, string>
  budgetInr: number
  budgetRangeLabel?: string
  includePeripherals: boolean
  ownedParts: ComponentSlotId[]
  preferredBrands: string[]
  requireWifi: boolean
}

export interface RecommendationCandidate {
  build: CanonicalBuild
  style: "best-fit" | "balanced" | "upgrade-friendly"
  title: string
  matchScore: number
  rationale: string
  highlights: string[]
  tradeOffs?: string
}

export type QuotationStatus =
  | "Draft"
  | "New"
  | "Contacted"
  | "Quoted"
  | "Closed"

export interface QuotationRecord {
  id: string
  referenceId: string
  buildId: string
  userId?: string
  customerName?: string
  customerPhone?: string
  summary: string
  itemizedParts: Array<{
    slot: ComponentSlotId
    name: string
    price: number
    variantId?: string
  }>
  estimatedTotal: number
  currency: string
  status: QuotationStatus
  createdAt: string
}

export type SpecVerificationStatus =
  | "verified_manufacturer"
  | "verified_technician"
  | "supplier_spec"
  | "ambiguous_unverified"
  | "quarantined_rejected"

export interface HardwareProductRecord {
  id: string
  shopify_product_id: string
  handle?: string
  brand?: string
  model_family: string
  category: ComponentSlotId
  socket?: string
  form_factor?: string
  chipset?: string
  memory_generation?: string
  memory_slots?: number
  max_memory_capacity_gb?: number
  storage_interface?: string
  m2_slot_count?: number
  sata_port_count?: number
  max_gpu_length_mm?: number
  max_cooler_height_mm?: number
  max_psu_length_mm?: number
  supported_motherboards?: string[]
  supported_sockets?: string[]
  cooler_height_mm?: number
  max_tdp_rating_watts?: number
  tdp_watts?: number
  has_integrated_graphics?: boolean
  includes_stock_cooler?: boolean
  has_wifi?: boolean
  has_bluetooth?: boolean
  bios_version_required?: string
  benchmark_single_core?: number
  benchmark_multi_core?: number
  benchmark_gpu_raster?: number
  benchmark_gpu_compute?: number
  verification_status: SpecVerificationStatus
  source_reference_url?: string
  verified_by?: string
  spec_provenance?: Record<string, any>
  last_verified_at?: string
  created_at: string
  updated_at: string
}

export interface HardwareVariantRecord {
  id: string
  product_id: string
  shopify_variant_id: string
  sku?: string
  variant_title: string
  length_mm?: number
  slot_width?: number
  tdp_watts?: number
  rated_wattage?: number
  efficiency_rating?: string
  pcie_power_connectors?: string[]
  capacity_gb?: number
  module_count?: number
  speed_mhz?: number
  cas_latency?: number
  is_laptop_sodimm?: boolean
  verification_status: SpecVerificationStatus
  source_reference_url?: string
  spec_provenance?: Record<string, any>
  last_verified_at?: string
  created_at: string
  updated_at: string
}


