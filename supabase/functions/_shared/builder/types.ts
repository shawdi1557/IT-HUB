// GENERATED from src/lib/builder/types.ts by scripts/sync-server-builder.cjs. Don't edit: change the source and
// run `node scripts/sync-server-builder.cjs`. Only ".ts" is added to relative imports.

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
  | "Monitor";

export type SlotRequirement = "required" | "optional" | "conditional";

export interface SlotDefinition {
  id: ComponentSlotId;
  label: string;
  category: string;
  requirement: SlotRequirement;
  description: string;
  iconName: string;
  allowedTypes: string[];
  maxQuantity: number;
}

export type SocketType = "AM4" | "AM5" | "LGA1700" | "LGA1851" | "LGA1200" | string;
export type RamGeneration = "DDR4" | "DDR5" | string;
export type FormFactor = "ATX" | "Micro-ATX" | "Mini-ITX" | "E-ATX" | string;

import type { SpecConfidence, SpecProblem } from "./spec-schema.ts";

/**
 * A manufacturer's published figures for one model. Compared only with the same architecture, and only
 * on the figures named in ranking.ts. These are specifications, not benchmark results.
 */
export interface PublishedPerformanceFigures {
  architecture: string;
  figures: Record<string, number>;
  sourceUrl: string;
  checkedOn: string;
}

export interface TechnicalSpecs {
  // Processor
  socket?: SocketType;
  tdpWatts?: number;
  /** The most the processor can draw: Intel's Maximum Turbo Power. Not the same as tdpWatts. */
  maxTurboPowerWatts?: number;
  hasIntegratedGraphics?: boolean;
  includesCooler?: boolean;
  supportedRamGen?: RamGeneration[];

  // Motherboard
  formFactor?: FormFactor;
  ramSlots?: number;
  supportedRamGeneration?: RamGeneration;
  maxRamCapacityGb?: number;
  /** Read from Shopify's `bios_update_required`, which names no processor family, despite this name. */
  requiresBiosUpdateForRyzen5000?: boolean;
  m2SlotCount?: number;
  sataPortCount?: number;
  /** Stage 3 Phase 4 (P4-5): whether the board's M.2 slots take M.2 SATA drives. Unknown when unstated. */
  m2SataSupported?: boolean;
  hasWifi?: boolean;

  // RAM
  ramGeneration?: RamGeneration;
  isLaptopSoDimm?: boolean;
  capacityGb?: number;
  moduleCount?: number;
  speedMhz?: number;

  // Graphics Card
  lengthMm?: number;
  slotWidth?: number;
  powerWatts?: number;
  recommendedPsuWatts?: number;
  requiredPciePins?: string;
  requiredPcieConnectors?: string[];
  /** Connectors the card needs. Zero is a real answer, and blank means nobody has said. */
  pcie6Plus2Required?: number;
  pcie16PinRequired?: number;
  /** 8-pin plugs the 16-pin adapter in the card's box takes. Blank means no adapter is known of. */
  pcie16PinAdapter8PinCount?: number;

  // Storage
  storageInterface?: "M.2 NVMe" | "SATA SSD" | "SATA HDD" | string;
  storageFormFactor?: "M.2 2280" | "2.5-inch" | "3.5-inch" | string;
  storageCapacityGb?: number;

  // Power Supply
  ratedWattage?: number;
  efficiencyRating?: string;
  psuFormFactor?: "ATX" | "SFX" | string;
  pciePowerConnectors?: string[];
  /** Connectors the power supply provides. Zero is a real answer, and blank means nobody has said. */
  pcie6Plus2Count?: number;
  pcie16PinCount?: number;

  // Computer Case (Cabinet)
  maxGpuLengthMm?: number;
  maxCoolerHeightMm?: number;
  supportedMotherboards?: FormFactor[];
  includedFanCount?: number;

  // Cooler
  coolerHeightMm?: number;
  supportedSockets?: SocketType[];
  maxTdpRatingWatts?: number;

  // Published figures used to compare parts. Only the specification registry sets these.
  performance?: PublishedPerformanceFigures;

  // Where each value came from. A value missing here is unknown.
  fieldSources?: Partial<Record<keyof TechnicalSpecs, SpecConfidence>>;
  // Values Shopify holds that couldn't be read, or that disagree with another source.
  specProblems?: SpecProblem[];
  // What Shopify states for this part that nobody has reviewed, named for people to read.
  unreviewedSpecs?: string[];

  // Metadata & Provenance
  provenance?:
    | SpecVerificationStatus
    | "manufacturer_verified"
    | "supplier_spec"
    | "title_derived"
    | "it_hub_reviewed"
    | "registry_unverified"
    | "internal_verified"
    | "unverified";
  lastVerifiedAt?: string;
}

export type AvailabilityStatus = "available" | "unavailable" | "unknown";

export interface CanonicalBuildComponent {
  slot: ComponentSlotId;
  productId: string;
  variantId: string;
  title: string;
  brand?: string;
  model?: string;
  price: number; // in INR (clean integer/number)
  currency: string;
  productUrl?: string;
  imageUrl?: string;
  specs: TechnicalSpecs;
  availability: AvailabilityStatus;
  quantity: number;
  retrievedAt: string;
  isShopifyLive?: boolean;
  isVerified?: boolean;
  matchedModelKey?: string;
}

export type CompatibilityStatus = "compatible" | "incompatible" | "conditional" | "unknown";
export type CompatibilitySeverity = "error" | "warning" | "info";

/** A value the compatibility rules for a build read, and that a part doesn't state. */
export interface MissingInput {
  slot: ComponentSlotId;
  /** The part lacking it. */
  title: string;
  name: string;
  /** The rules that return Unknown without it. */
  ruleIds: string[];
}

export interface CompatibilityItem {
  ruleId: string;
  severity: CompatibilitySeverity;
  status: CompatibilityStatus;
  affectedSlots: ComponentSlotId[];
  label: string;
  explanation: string;
  suggestedResolution?: string;
  dataProvenance?: string;
  /** The values this result is waiting for. Only an Unknown has them. */
  missingInputs?: MissingInput[];
}

export interface CompatibilitySummary {
  status: CompatibilityStatus;
  items: CompatibilityItem[];
  /** Plain statements about what wasn't checked. They have no result, and never change the status. */
  notes?: string[];
  estimatedSystemLoadWatts: number;
  recommendedPsuWatts: number;
  powerHeadroomWatts: number;
  powerHeadroomStatus: "adequate" | "limited" | "deficit" | "unknown";
  valid: boolean; // true when no 'error' severity exists
  validForAutomatedRecommendation: boolean; // true when valid and NO blocking unknowns exist
  hasBlockingUnknowns: boolean;
  complete: boolean; // true when all strictly required slots are populated
}

export type BuildMode = "guided" | "expert";

export interface CanonicalBuild {
  id: string;
  userId?: string;
  name: string;
  mode: BuildMode;
  budgetInr?: number;
  currency: string;
  components: Partial<Record<ComponentSlotId, CanonicalBuildComponent>>;
  compatibility: CompatibilitySummary;
  designedFor?: string;
  templateId?: string;
  ownedSlots?: ComponentSlotId[];
  createdAt: string;
  updatedAt: string;
}

/** Every purpose the Find My PC page offers, plus "custom". `work` and `professional` are sent by the page. */
/**
 * The rule that put a build on offer, when no evidence label did (Stage 3 contract, sections 2.2 and 11). A role
 * is a selection rule only: it never says a build is compatible, confirmed or faster.
 */
export type OfferRole =
  | "Value Choice"
  | "Performance Priority"
  | "Balanced Choice"
  | "Another Option";

/**
 * The chip of a Stage 2 guarantee build that has neither an evidence label nor a role. The owner's wording,
 * used only where it's true of the build: a confirmed build whose specifications aren't all confirmed says it
 * needs no review, and a cheaper twin that doesn't need review says some specifications are unconfirmed.
 */
export type GuaranteeReason =
  | "No graphics card"
  | "Confirmed specifications"
  | "No review needed"
  | "Review required"
  | "Some specifications unconfirmed";

export type BuildPurpose =
  | "gaming"
  | "creation"
  | "work"
  | "programming"
  | "professional"
  | "office"
  | "general"
  | "custom";

export interface GuidedAnswers {
  purpose: BuildPurpose;
  customText?: string;
  details: Record<string, string>;
  budgetInr: number;
  budgetRangeLabel?: string;
  includePeripherals: boolean;
  ownedParts: ComponentSlotId[];
  preferredBrands: string[];
  requireWifi: boolean;
}

export interface RecommendationCandidate {
  build: CanonicalBuild;
  style: "best-fit" | "balanced" | "upgrade-friendly" | "not-ranked";
  title: string;
  rationale: string;
  highlights: string[];
  tradeOffs?: string;
}

export type QuotationStatus = "Draft" | "New" | "Contacted" | "Quoted" | "Closed";

export interface QuotationRecord {
  id: string;
  referenceId: string;
  buildId: string;
  userId?: string;
  customerName?: string;
  customerPhone?: string;
  summary: string;
  itemizedParts: Array<{
    slot: ComponentSlotId;
    name: string;
    price: number;
    variantId?: string;
  }>;
  estimatedTotal: number;
  currency: string;
  status: QuotationStatus;
  createdAt: string;
}

export type SpecVerificationStatus =
  | "verified_manufacturer"
  | "verified_technician"
  | "supplier_spec"
  | "ambiguous_unverified"
  | "quarantined_rejected";

export interface HardwareProductRecord {
  id: string;
  shopify_product_id: string;
  handle?: string;
  brand?: string;
  model_family: string;
  category: ComponentSlotId;
  socket?: string;
  form_factor?: string;
  chipset?: string;
  memory_generation?: string;
  memory_slots?: number;
  max_memory_capacity_gb?: number;
  storage_interface?: string;
  m2_slot_count?: number;
  sata_port_count?: number;
  max_gpu_length_mm?: number;
  max_cooler_height_mm?: number;
  max_psu_length_mm?: number;
  supported_motherboards?: string[];
  supported_sockets?: string[];
  cooler_height_mm?: number;
  max_tdp_rating_watts?: number;
  tdp_watts?: number;
  has_integrated_graphics?: boolean;
  includes_stock_cooler?: boolean;
  has_wifi?: boolean;
  has_bluetooth?: boolean;
  bios_version_required?: string;
  verification_status: SpecVerificationStatus;
  source_reference_url?: string;
  verified_by?: string;
  spec_provenance?: Record<string, any>;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface HardwareVariantRecord {
  id: string;
  product_id: string;
  shopify_variant_id: string;
  sku?: string;
  variant_title: string;
  length_mm?: number;
  slot_width?: number;
  tdp_watts?: number;
  rated_wattage?: number;
  efficiency_rating?: string;
  pcie_power_connectors?: string[];
  capacity_gb?: number;
  module_count?: number;
  speed_mhz?: number;
  cas_latency?: number;
  is_laptop_sodimm?: boolean;
  verification_status: SpecVerificationStatus;
  source_reference_url?: string;
  spec_provenance?: Record<string, any>;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
}
