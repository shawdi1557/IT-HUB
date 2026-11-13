// GENERATED from src/lib/builder/hardware-spec.ts by scripts/sync-server-builder.cjs. Don't edit: change the source and
// run `node scripts/sync-server-builder.cjs`. The Staff Portal's copy, unchanged.

// src/lib/builder/hardware-spec.ts
// Stage 4B: the Hardware Specification Manager's data contract, shared by the storefront, the Edge Functions (through
// scripts/sync-server-builder.cjs) and the Staff Portal (ITHUB_ADMIN/src/lib/hardware-spec.ts, a checked copy).
//
// What lives here, and nowhere else in TypeScript:
//   - the hardware categories and each category's specification fields (types, units, ranges, choices),
//   - validation of a set of values, with the same rules the database applies (`private.hardware_validate_specs`,
//     migration 20261112000001, whose `hardware_spec_fields` rows a database test compares with this list),
//   - the resolution order: listing override, then the canonical model, then the base model for inheritable fields,
//     otherwise missing,
//   - how a registry value becomes the builder's TechnicalSpecs field, and which pc_builder metafield it syncs to.
//
// Pure and dependency-free: no imports, no network, no module state. A value that isn't stated is unknown, never a
// default. Nothing here decides compatibility: the builder's engine (compatibility.ts) stays authoritative.

export type HardwareCategoryId =
  | "CPU"
  | "GPU"
  | "Motherboard"
  | "RAM"
  | "Storage"
  | "PSU"
  | "Cabinet"
  | "Cooler"
  | "Monitor";

export interface HardwareCategory {
  id: HardwareCategoryId;
  label: string;
  /** The builder slot (ComponentSlotId) a model of this category fills. */
  builderSlot: string;
}

/** The categories 4B supports. Ids equal the builder's slot ids, so a link's category can be checked against the slot. */
export const HARDWARE_CATEGORIES: readonly HardwareCategory[] = [
  { id: "CPU", label: "CPU", builderSlot: "CPU" },
  { id: "GPU", label: "GPU", builderSlot: "GPU" },
  { id: "Motherboard", label: "Motherboard", builderSlot: "Motherboard" },
  { id: "RAM", label: "RAM", builderSlot: "RAM" },
  { id: "Storage", label: "Storage", builderSlot: "Storage" },
  { id: "PSU", label: "PSU", builderSlot: "PSU" },
  { id: "Cabinet", label: "PC Case", builderSlot: "Cabinet" },
  { id: "Cooler", label: "CPU Cooler", builderSlot: "Cooler" },
  { id: "Monitor", label: "Monitor", builderSlot: "Monitor" },
];

export const isHardwareCategory = (value: unknown): value is HardwareCategoryId =>
  HARDWARE_CATEGORIES.some((category) => category.id === value);

export type HardwareFieldType =
  | "integer"
  | "decimal"
  | "text"
  | "boolean"
  | "enum"
  | "enum_list"
  | "text_list";

/** How a registry value becomes a builder value, when it isn't copied as it is. */
export type BuilderConversion =
  /** "SO-DIMM" → true, "DIMM" → false. */
  | "so_dimm"
  /** Only `true` is passed on; `false` says nothing the builder reads (bios_update_required). */
  | "true_only";

export interface HardwareFieldDefinition {
  category: HardwareCategoryId;
  key: string;
  label: string;
  type: HardwareFieldType;
  unit?: string;
  min?: number;
  max?: number;
  /** For enum and enum_list. */
  choices?: readonly string[];
  /** For text and text_list: the longest entry. */
  maxLength?: number;
  /** For text: a pattern the whole value must match. */
  pattern?: string;
  /**
   * Needed for a complete specification, and before any Shopify sync: the values the builder's compatibility rules read
   * for this kind of part (compatibility.ts INPUT_REQUIREMENTS), except a CPU's maximum power, which only some makers
   * state.
   */
  required: boolean;
  /** Taken from the base model when the model itself doesn't state it. */
  inheritable: boolean;
  /** The builder's TechnicalSpecs fields this value fills. */
  builderFields?: readonly string[];
  builderConversion?: BuilderConversion;
  /** The pc_builder metafield this value syncs to, by default. */
  metafieldKey?: string;
  help?: string;
}

const SOCKETS = ["AM4", "AM5", "LGA1700", "LGA1851", "LGA1200"] as const;
const RAM_GENERATIONS = ["DDR4", "DDR5"] as const;
const BOARD_FORM_FACTORS = ["E-ATX", "ATX", "Micro-ATX", "Mini-ITX"] as const;
const STORAGE_INTERFACES = ["M.2 NVMe", "M.2 SATA", "SATA SSD", "SATA HDD"] as const;
const PCIE_VERSIONS = ["PCIe 3.0", "PCIe 4.0", "PCIe 5.0"] as const;
const GPU_INTERFACES = [
  "PCIe 3.0 x16",
  "PCIe 4.0 x8",
  "PCIe 4.0 x16",
  "PCIe 5.0 x8",
  "PCIe 5.0 x16",
] as const;

type FieldInput = Omit<HardwareFieldDefinition, "category" | "required" | "inheritable"> & {
  required?: boolean;
  inheritable?: boolean;
};

const fields = (category: HardwareCategoryId, list: FieldInput[]): HardwareFieldDefinition[] =>
  list.map((field) => ({
    category,
    ...field,
    required: field.required ?? false,
    inheritable: field.inheritable ?? false,
  }));

/**
 * Every category's specification fields. Ranges on fields that sync to Shopify equal the pc_builder metafield
 * definitions (spec-schema.ts), so a value accepted here is accepted there. Changing this list needs a migration that
 * changes `hardware_spec_fields` the same way; the database test S4B-DB fails otherwise.
 */
export const HARDWARE_SPEC_FIELDS: readonly HardwareFieldDefinition[] = [
  ...fields("CPU", [
    {
      key: "socket",
      label: "Socket",
      type: "enum",
      choices: SOCKETS,
      required: true,
      inheritable: true,
      builderFields: ["socket"],
      metafieldKey: "socket",
    },
    { key: "core_count", label: "Cores", type: "integer", min: 1, max: 256, inheritable: true },
    { key: "thread_count", label: "Threads", type: "integer", min: 1, max: 512, inheritable: true },
    {
      key: "base_clock_ghz",
      label: "Base clock",
      type: "decimal",
      unit: "GHz",
      min: 0.1,
      max: 10,
      inheritable: true,
    },
    {
      key: "boost_clock_ghz",
      label: "Boost clock",
      type: "decimal",
      unit: "GHz",
      min: 0.1,
      max: 10,
      inheritable: true,
    },
    {
      key: "tdp_watts",
      label: "TDP (base power)",
      type: "integer",
      unit: "W",
      min: 1,
      max: 1000,
      required: true,
      inheritable: true,
      builderFields: ["tdpWatts"],
      metafieldKey: "watts",
    },
    {
      key: "max_power_watts",
      label: "Maximum power",
      type: "integer",
      unit: "W",
      min: 1,
      max: 1000,
      inheritable: true,
      builderFields: ["maxTurboPowerWatts"],
      metafieldKey: "cpu_max_power_watts",
      help: "Intel's Maximum Turbo Power or AMD's PPT, only if the maker states it.",
    },
    {
      key: "integrated_graphics",
      label: "Integrated graphics",
      type: "boolean",
      required: true,
      inheritable: true,
      builderFields: ["hasIntegratedGraphics"],
      metafieldKey: "integrated_graphics",
    },
    {
      key: "includes_cooler",
      label: "Cooler in the box",
      type: "boolean",
      required: true,
      builderFields: ["includesCooler"],
      metafieldKey: "includes_cooler",
      help: "Boxed and tray versions differ, so this is never inherited.",
    },
    {
      key: "memory_support",
      label: "Memory support",
      type: "enum_list",
      choices: RAM_GENERATIONS,
      required: true,
      inheritable: true,
      builderFields: ["supportedRamGen"],
      metafieldKey: "supported_ram_generations",
    },
    {
      key: "max_memory_gb",
      label: "Maximum memory",
      type: "integer",
      unit: "GB",
      min: 1,
      max: 4096,
      inheritable: true,
    },
    {
      key: "pcie_version",
      label: "PCIe support",
      type: "enum",
      choices: PCIE_VERSIONS,
      inheritable: true,
    },
  ]),
  ...fields("GPU", [
    {
      key: "chipset",
      label: "Chipset",
      type: "text",
      maxLength: 80,
      inheritable: true,
      help: "The graphics chip, such as GeForce RTX 4070. Never merges models: each board stays its own model.",
    },
    {
      key: "vram_gb",
      label: "VRAM capacity",
      type: "integer",
      unit: "GB",
      min: 1,
      max: 128,
      inheritable: true,
    },
    {
      key: "vram_type",
      label: "VRAM type",
      type: "enum",
      choices: ["GDDR5", "GDDR6", "GDDR6X", "GDDR7", "HBM2", "HBM3"],
      inheritable: true,
    },
    {
      key: "memory_bus_bits",
      label: "Memory bus",
      type: "integer",
      unit: "bit",
      min: 32,
      max: 8192,
      inheritable: true,
    },
    {
      key: "base_clock_mhz",
      label: "Base clock",
      type: "integer",
      unit: "MHz",
      min: 100,
      max: 5000,
      inheritable: true,
    },
    {
      key: "boost_clock_mhz",
      label: "Boost clock",
      type: "integer",
      unit: "MHz",
      min: 100,
      max: 5000,
      help: "Factory-overclocked boards differ from the chip's reference clock.",
    },
    {
      key: "tdp_watts",
      label: "Board power (TDP)",
      type: "integer",
      unit: "W",
      min: 1,
      max: 1000,
      required: true,
      inheritable: true,
      builderFields: ["tdpWatts", "powerWatts"],
      metafieldKey: "watts",
    },
    {
      key: "length_mm",
      label: "Length",
      type: "integer",
      unit: "mm",
      min: 50,
      max: 500,
      required: true,
      builderFields: ["lengthMm"],
      metafieldKey: "gpu_length_mm",
      help: "Rounded up to a whole mm.",
    },
    {
      key: "width_slots",
      label: "Width",
      type: "decimal",
      unit: "slots",
      min: 1,
      max: 5,
      builderFields: ["slotWidth"],
    },
    {
      key: "pcie_8pin_required",
      label: "8-pin (6+2) power plugs needed",
      type: "integer",
      min: 0,
      max: 4,
      required: true,
      builderFields: ["pcie6Plus2Required"],
      metafieldKey: "pcie_6plus2_required",
      help: "Enter 0 if the card needs none.",
    },
    {
      key: "pcie_16pin_required",
      label: "16-pin (12VHPWR / 12V-2x6) plugs needed",
      type: "integer",
      min: 0,
      max: 2,
      required: true,
      builderFields: ["pcie16PinRequired"],
      metafieldKey: "pcie_16pin_required",
      help: "Enter 0 if the card needs none.",
    },
    {
      key: "pcie_16pin_adapter_8pin_count",
      label: "8-pin plugs on the boxed 16-pin adapter",
      type: "integer",
      min: 0,
      max: 4,
      builderFields: ["pcie16PinAdapter8PinCount"],
      metafieldKey: "pcie_16pin_adapter_8pin_count",
      help: "Only if the box includes an adapter. Otherwise leave blank.",
    },
    {
      key: "recommended_psu_watts",
      label: "Recommended PSU",
      type: "integer",
      unit: "W",
      min: 100,
      max: 2000,
      required: true,
      inheritable: true,
      builderFields: ["recommendedPsuWatts"],
      metafieldKey: "recommended_psu_watts",
    },
    {
      key: "pcie_interface",
      label: "PCIe interface",
      type: "enum",
      choices: GPU_INTERFACES,
      inheritable: true,
    },
    {
      key: "display_outputs",
      label: "Display outputs",
      type: "text_list",
      maxLength: 60,
      help: "One entry per output type, such as 3x DisplayPort 1.4a.",
    },
  ]),
  ...fields("Motherboard", [
    {
      key: "socket",
      label: "Socket",
      type: "enum",
      choices: SOCKETS,
      required: true,
      inheritable: true,
      builderFields: ["socket"],
      metafieldKey: "socket",
    },
    {
      key: "chipset",
      label: "Chipset",
      type: "text",
      maxLength: 40,
      inheritable: true,
      help: "Such as B550 or Z790.",
    },
    {
      key: "form_factor",
      label: "Form factor",
      type: "enum",
      choices: BOARD_FORM_FACTORS,
      required: true,
      builderFields: ["formFactor"],
      metafieldKey: "form_factor",
    },
    {
      key: "ram_generation",
      label: "RAM generation",
      type: "enum",
      choices: RAM_GENERATIONS,
      required: true,
      builderFields: ["supportedRamGeneration", "ramGeneration"],
      metafieldKey: "ram_generation",
    },
    {
      key: "memory_slots",
      label: "Memory slots",
      type: "integer",
      min: 1,
      max: 8,
      required: true,
      builderFields: ["ramSlots"],
      metafieldKey: "ram_slots",
    },
    {
      key: "max_memory_gb",
      label: "Maximum memory",
      type: "integer",
      unit: "GB",
      min: 1,
      max: 4096,
      required: true,
      builderFields: ["maxRamCapacityGb"],
      metafieldKey: "max_ram_gb",
    },
    { key: "pcie_x16_slots", label: "PCIe x16 slots", type: "integer", min: 0, max: 8 },
    {
      key: "m2_slots",
      label: "M.2 slots",
      type: "integer",
      min: 0,
      max: 12,
      required: true,
      builderFields: ["m2SlotCount"],
      metafieldKey: "m2_slots",
    },
    {
      key: "sata_ports",
      label: "SATA ports",
      type: "integer",
      min: 0,
      max: 12,
      required: true,
      builderFields: ["sataPortCount"],
      metafieldKey: "sata_ports",
    },
    {
      key: "wifi",
      label: "Built-in Wi-Fi",
      type: "boolean",
      builderFields: ["hasWifi"],
      metafieldKey: "wifi",
    },
    { key: "bluetooth", label: "Bluetooth", type: "boolean" },
    {
      key: "lan_speed",
      label: "Wired network",
      type: "enum",
      choices: ["1 GbE", "2.5 GbE", "5 GbE", "10 GbE"],
    },
    {
      key: "cpu_power_connectors",
      label: "CPU power connectors",
      type: "text",
      maxLength: 60,
      help: "Such as 8-pin EPS + 4-pin.",
    },
    {
      key: "bios_update_required",
      label: "May need a BIOS update for newer CPUs",
      type: "boolean",
      builderFields: ["requiresBiosUpdateForRyzen5000"],
      builderConversion: "true_only",
      metafieldKey: "bios_update_required",
    },
  ]),
  ...fields("RAM", [
    {
      key: "capacity_gb",
      label: "Kit capacity",
      type: "integer",
      unit: "GB",
      min: 1,
      max: 1024,
      required: true,
      builderFields: ["capacityGb"],
      metafieldKey: "ram_capacity_gb",
      help: "The whole kit, not one stick.",
    },
    {
      key: "ram_generation",
      label: "DDR generation",
      type: "enum",
      choices: RAM_GENERATIONS,
      required: true,
      builderFields: ["ramGeneration", "supportedRamGeneration"],
      metafieldKey: "ram_generation",
    },
    {
      key: "speed_mhz",
      label: "Speed",
      type: "integer",
      unit: "MHz",
      min: 1000,
      max: 12000,
      builderFields: ["speedMhz"],
      metafieldKey: "ram_speed_mhz",
    },
    {
      key: "module_type",
      label: "Form factor",
      type: "enum",
      choices: ["DIMM", "SO-DIMM"],
      required: true,
      builderFields: ["isLaptopSoDimm"],
      builderConversion: "so_dimm",
      metafieldKey: "ram_module_type",
      help: "DIMM for desktops, SO-DIMM for laptops.",
    },
    {
      key: "module_count",
      label: "Sticks in the kit",
      type: "integer",
      min: 1,
      max: 8,
      required: true,
      builderFields: ["moduleCount"],
      metafieldKey: "ram_modules",
    },
    { key: "cas_latency", label: "CAS latency", type: "integer", min: 1, max: 100 },
    { key: "voltage", label: "Voltage", type: "decimal", unit: "V", min: 0.5, max: 3 },
  ]),
  ...fields("Storage", [
    {
      key: "storage_type",
      label: "Type",
      type: "enum",
      choices: ["SSD", "HDD"],
    },
    {
      key: "capacity_gb",
      label: "Capacity",
      type: "integer",
      unit: "GB",
      min: 1,
      max: 100000,
      required: true,
      builderFields: ["storageCapacityGb"],
      metafieldKey: "storage_capacity_gb",
    },
    {
      key: "interface",
      label: "Interface",
      type: "enum",
      choices: STORAGE_INTERFACES,
      required: true,
      builderFields: ["storageInterface"],
      metafieldKey: "storage_interface",
    },
    {
      key: "form_factor",
      label: "Form factor",
      type: "enum",
      choices: ["M.2 2230", "M.2 2242", "M.2 2280", "2.5-inch", "3.5-inch"],
      builderFields: ["storageFormFactor"],
    },
    {
      key: "read_speed_mbps",
      label: "Read speed",
      type: "integer",
      unit: "MB/s",
      min: 1,
      max: 20000,
    },
    {
      key: "write_speed_mbps",
      label: "Write speed",
      type: "integer",
      unit: "MB/s",
      min: 1,
      max: 20000,
    },
  ]),
  ...fields("PSU", [
    {
      key: "wattage",
      label: "Wattage",
      type: "integer",
      unit: "W",
      min: 100,
      max: 3000,
      required: true,
      builderFields: ["ratedWattage"],
      metafieldKey: "capacity_watts",
    },
    {
      key: "efficiency_rating",
      label: "Efficiency rating",
      type: "enum",
      choices: [
        "None",
        "80 PLUS",
        "80 PLUS Bronze",
        "80 PLUS Silver",
        "80 PLUS Gold",
        "80 PLUS Platinum",
        "80 PLUS Titanium",
      ],
      builderFields: ["efficiencyRating"],
    },
    {
      key: "modular_type",
      label: "Modular type",
      type: "enum",
      choices: ["Non-modular", "Semi-modular", "Fully modular"],
    },
    {
      key: "form_factor",
      label: "Form factor",
      type: "enum",
      choices: ["ATX", "SFX", "SFX-L", "TFX"],
      builderFields: ["psuFormFactor"],
    },
    {
      key: "pcie_8pin_count",
      label: "8-pin (6+2) PCIe plugs",
      type: "integer",
      min: 0,
      max: 12,
      required: true,
      builderFields: ["pcie6Plus2Count"],
      metafieldKey: "pcie_6plus2_count",
      help: "Enter 0 if none.",
    },
    {
      key: "pcie_16pin_count",
      label: "16-pin (12VHPWR / 12V-2x6) plugs",
      type: "integer",
      min: 0,
      max: 4,
      required: true,
      builderFields: ["pcie16PinCount"],
      metafieldKey: "pcie_16pin_count",
      help: "Enter 0 if none.",
    },
    { key: "eps_connectors", label: "CPU (EPS) connectors", type: "integer", min: 0, max: 4 },
    { key: "sata_connectors", label: "SATA power connectors", type: "integer", min: 0, max: 16 },
  ]),
  ...fields("Cabinet", [
    {
      key: "case_type",
      label: "Form factor",
      type: "enum",
      choices: ["Full Tower", "Mid Tower", "Mini Tower", "Small Form Factor"],
    },
    {
      key: "supported_motherboards",
      label: "Supported motherboard sizes",
      type: "enum_list",
      choices: BOARD_FORM_FACTORS,
      required: true,
      builderFields: ["supportedMotherboards"],
      metafieldKey: "supported_motherboards",
    },
    {
      key: "max_gpu_length_mm",
      label: "Maximum GPU length",
      type: "integer",
      unit: "mm",
      min: 100,
      max: 600,
      required: true,
      builderFields: ["maxGpuLengthMm"],
      metafieldKey: "cabinet_clearance_mm",
    },
    {
      key: "max_cooler_height_mm",
      label: "Maximum CPU cooler height",
      type: "integer",
      unit: "mm",
      min: 50,
      max: 250,
      required: true,
      builderFields: ["maxCoolerHeightMm"],
      metafieldKey: "max_cooler_height_mm",
    },
    {
      key: "radiator_support",
      label: "Radiator support",
      type: "text_list",
      maxLength: 40,
      help: "One entry per position, such as Front 360 mm.",
    },
    { key: "drive_bays_35", label: '3.5" drive bays', type: "integer", min: 0, max: 12 },
    { key: "drive_bays_25", label: '2.5" drive bays', type: "integer", min: 0, max: 12 },
    {
      key: "included_fans",
      label: "Fans included",
      type: "integer",
      min: 0,
      max: 12,
      builderFields: ["includedFanCount"],
    },
  ]),
  ...fields("Cooler", [
    {
      key: "cooler_type",
      label: "Cooler type",
      type: "enum",
      choices: ["Air", "AIO liquid"],
    },
    {
      key: "supported_sockets",
      label: "Supported CPU sockets",
      type: "enum_list",
      choices: SOCKETS,
      required: true,
      builderFields: ["supportedSockets"],
      metafieldKey: "supported_sockets",
    },
    {
      key: "height_mm",
      label: "Height",
      type: "integer",
      unit: "mm",
      min: 20,
      max: 250,
      required: true,
      builderFields: ["coolerHeightMm"],
      metafieldKey: "cooler_height_mm",
      help: "For a liquid cooler, the pump block's height.",
    },
    {
      key: "radiator_size_mm",
      label: "Radiator size",
      type: "integer",
      unit: "mm",
      min: 80,
      max: 480,
      help: "Liquid coolers only.",
    },
    {
      key: "fan_configuration",
      label: "Fan configuration",
      type: "text",
      maxLength: 60,
      help: "Such as 2x 120 mm.",
    },
    {
      key: "max_tdp_watts",
      label: "Rated cooling capacity",
      type: "integer",
      unit: "W",
      min: 1,
      max: 1000,
      builderFields: ["maxTdpRatingWatts"],
    },
  ]),
  ...fields("Monitor", [
    {
      key: "display_size_in",
      label: "Display size",
      type: "decimal",
      unit: "in",
      min: 10,
      max: 65,
    },
    {
      key: "resolution",
      label: "Resolution",
      type: "text",
      maxLength: 11,
      pattern: "^[0-9]{3,5}x[0-9]{3,5}$",
      help: "Width x height in pixels, such as 2560x1440.",
    },
    {
      key: "refresh_rate_hz",
      label: "Refresh rate",
      type: "integer",
      unit: "Hz",
      min: 24,
      max: 1000,
    },
    {
      key: "panel_type",
      label: "Panel type",
      type: "enum",
      choices: ["IPS", "VA", "TN", "OLED", "Mini-LED"],
    },
    {
      key: "response_time_ms",
      label: "Response time",
      type: "decimal",
      unit: "ms",
      min: 0.01,
      max: 50,
    },
    {
      key: "adaptive_sync",
      label: "Adaptive sync",
      type: "enum_list",
      choices: [
        "None",
        "FreeSync",
        "FreeSync Premium",
        "FreeSync Premium Pro",
        "G-SYNC Compatible",
        "G-SYNC",
      ],
    },
    {
      key: "connectivity",
      label: "Connectivity",
      type: "text_list",
      maxLength: 40,
      help: "One entry per port type, such as 2x HDMI 2.0.",
    },
  ]),
];

export function categoryFields(category: string): HardwareFieldDefinition[] {
  return HARDWARE_SPEC_FIELDS.filter((field) => field.category === category);
}

export function fieldDefinition(
  category: string,
  key: string,
): HardwareFieldDefinition | undefined {
  return HARDWARE_SPEC_FIELDS.find((field) => field.category === category && field.key === key);
}

export type HardwareSpecValue = number | string | boolean | string[];
export type HardwareSpecValues = Record<string, HardwareSpecValue>;

export type HardwareSpecErrorCode =
  | "unknown_field"
  | "wrong_type"
  | "not_whole_number"
  | "too_precise"
  | "below_minimum"
  | "above_maximum"
  | "not_a_choice"
  | "too_long"
  | "pattern_mismatch"
  | "empty_list"
  | "inconsistent"
  | "not_an_object";

export interface HardwareSpecError {
  field: string;
  code: HardwareSpecErrorCode;
  message: string;
}

export interface HardwareSpecValidation {
  /** The values, normalised (trimmed text, choices in their listed spelling, lists without repeats). */
  values: HardwareSpecValues;
  errors: HardwareSpecError[];
}

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

const decimalPlaces = (value: number) => {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
};

function choiceFor(definition: HardwareFieldDefinition, value: string): string | undefined {
  const wanted = value.trim().toLowerCase();
  return definition.choices?.find((choice) => choice.toLowerCase() === wanted);
}

/** One value checked against its definition: the normalised value, or an error. Never a guess. */
function checkValue(
  definition: HardwareFieldDefinition,
  value: unknown,
): { value?: HardwareSpecValue; error?: HardwareSpecError } {
  const fail = (code: HardwareSpecErrorCode, message: string) => ({
    error: { field: definition.key, code, message: `${definition.label}: ${message}` },
  });
  const inRange = (number: number) => {
    if (definition.min !== undefined && number < definition.min) {
      return fail("below_minimum", `must be at least ${definition.min}${unitText(definition)}`);
    }
    if (definition.max !== undefined && number > definition.max) {
      return fail("above_maximum", `must be at most ${definition.max}${unitText(definition)}`);
    }
    return undefined;
  };
  switch (definition.type) {
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return fail("wrong_type", "must be a number");
      }
      if (!Number.isInteger(value)) return fail("not_whole_number", "must be a whole number");
      return inRange(value) ?? { value };
    }
    case "decimal": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return fail("wrong_type", "must be a number");
      }
      if (decimalPlaces(value) > 2) return fail("too_precise", "use at most 2 decimal places");
      return inRange(value) ?? { value };
    }
    case "boolean":
      return typeof value === "boolean" ? { value } : fail("wrong_type", "must be yes or no");
    case "text": {
      if (typeof value !== "string") return fail("wrong_type", "must be text");
      const text = value.trim().replace(/\s+/g, " ");
      if (definition.maxLength !== undefined && text.length > definition.maxLength) {
        return fail("too_long", `must be at most ${definition.maxLength} characters`);
      }
      if (definition.pattern && !new RegExp(definition.pattern).test(text)) {
        return fail("pattern_mismatch", "isn't in the expected format");
      }
      return { value: text };
    }
    case "enum": {
      if (typeof value !== "string") return fail("wrong_type", "must be one of the listed choices");
      const choice = choiceFor(definition, value);
      return choice
        ? { value: choice }
        : fail("not_a_choice", `must be one of: ${definition.choices?.join(", ")}`);
    }
    case "enum_list":
    case "text_list": {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        return fail("wrong_type", "must be a list");
      }
      const items: string[] = [];
      for (const raw of value as string[]) {
        const text = raw.trim().replace(/\s+/g, " ");
        if (!text) continue;
        let item = text;
        if (definition.type === "enum_list") {
          const choice = choiceFor(definition, text);
          if (!choice) {
            return fail(
              "not_a_choice",
              `"${text}" isn't one of: ${definition.choices?.join(", ")}`,
            );
          }
          item = choice;
        } else if (definition.maxLength !== undefined && text.length > definition.maxLength) {
          return fail("too_long", `each entry must be at most ${definition.maxLength} characters`);
        }
        if (!items.includes(item)) items.push(item);
      }
      if (items.length === 0) return fail("empty_list", "choose at least one, or leave it unknown");
      if (items.length > 12) return fail("too_long", "lists hold at most 12 entries");
      return { value: items };
    }
  }
}

function unitText(definition: HardwareFieldDefinition): string {
  return definition.unit ? ` ${definition.unit}` : "";
}

/**
 * Checks a category's values. A blank value (null, empty text) means unknown and is dropped, never stored as a
 * default. A key the category doesn't define, a value of the wrong type or outside its range, or values that
 * contradict each other are errors; nothing is coerced from text ("65W") into a number.
 */
export function validateHardwareSpecs(category: string, input: unknown): HardwareSpecValidation {
  const errors: HardwareSpecError[] = [];
  const values: HardwareSpecValues = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      values,
      errors: [{ field: "", code: "not_an_object", message: "Specifications must be an object" }],
    };
  }
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const definition = fieldDefinition(category, key);
    if (!definition) {
      errors.push({
        field: key,
        code: "unknown_field",
        message: `${key} isn't a ${category} specification`,
      });
      continue;
    }
    if (isBlank(raw)) continue;
    const checked = checkValue(definition, raw);
    if (checked.error) errors.push(checked.error);
    else if (checked.value !== undefined) values[key] = checked.value;
  }
  errors.push(...consistencyErrors(category, values));
  return { values, errors };
}

/** Values in one specification that can't both be right. Each pair is checked only when both are known. */
export function consistencyErrors(
  category: string,
  values: HardwareSpecValues,
): HardwareSpecError[] {
  const errors: HardwareSpecError[] = [];
  const num = (key: string) =>
    typeof values[key] === "number" ? (values[key] as number) : undefined;
  const inconsistent = (field: string, message: string) =>
    errors.push({ field, code: "inconsistent", message });
  if (category === "CPU") {
    const cores = num("core_count");
    const threads = num("thread_count");
    if (cores !== undefined && threads !== undefined && threads < cores) {
      inconsistent("thread_count", "Threads can't be fewer than cores");
    }
    const base = num("base_clock_ghz");
    const boost = num("boost_clock_ghz");
    if (base !== undefined && boost !== undefined && boost < base) {
      inconsistent("boost_clock_ghz", "Boost clock can't be below the base clock");
    }
    const tdp = num("tdp_watts");
    const max = num("max_power_watts");
    if (tdp !== undefined && max !== undefined && max < tdp) {
      inconsistent("max_power_watts", "Maximum power can't be below the base power");
    }
  }
  if (category === "GPU") {
    const base = num("base_clock_mhz");
    const boost = num("boost_clock_mhz");
    if (base !== undefined && boost !== undefined && boost < base) {
      inconsistent("boost_clock_mhz", "Boost clock can't be below the base clock");
    }
    const tdp = num("tdp_watts");
    const psu = num("recommended_psu_watts");
    if (tdp !== undefined && psu !== undefined && psu < tdp) {
      inconsistent("recommended_psu_watts", "The recommended PSU can't be below the card's power");
    }
  }
  if (category === "RAM") {
    const capacity = num("capacity_gb");
    const modules = num("module_count");
    if (capacity !== undefined && modules !== undefined && capacity % modules !== 0) {
      inconsistent("module_count", "The kit's capacity must divide evenly between its sticks");
    }
  }
  if (category === "Cooler") {
    const type = values["cooler_type"];
    if (type === "Air" && values["radiator_size_mm"] !== undefined) {
      inconsistent("radiator_size_mm", "An air cooler has no radiator");
    }
  }
  return errors;
}

/** Where a resolved value came from. */
export type HardwareValueSource = "override" | "model" | "base";

export interface ResolvedHardwareSpecs {
  values: HardwareSpecValues;
  sources: Record<string, HardwareValueSource>;
  /** Required fields with no value from any layer. */
  missingRequired: string[];
  /** Values a layer holds that fail validation now: never used. */
  errors: HardwareSpecError[];
  complete: boolean;
}

export interface HardwareSpecLayers {
  category: string;
  /** The canonical model's current specification. */
  model: unknown;
  /** The base model's current specification, if the model has one. Only inheritable fields are taken from it. */
  base?: unknown;
  /** The listing's product- or variant-specific overrides, if any. */
  overrides?: unknown;
}

/**
 * The resolution order (4B-2): a listing's override, then the canonical model, then the base model for inheritable
 * fields only, otherwise missing. Every layer is validated again here, so a stored value that no longer passes is
 * reported and never reaches the builder.
 */
export function resolveHardwareSpecs(layers: HardwareSpecLayers): ResolvedHardwareSpecs {
  const errors: HardwareSpecError[] = [];
  const checked = (input: unknown, layer: HardwareValueSource) => {
    if (input === undefined || input === null) return {};
    const result = validateHardwareSpecs(layers.category, input);
    errors.push(
      ...result.errors.map((error) => ({ ...error, message: `${layer}: ${error.message}` })),
    );
    // A layer with an inconsistency is unreliable as a whole for the fields involved.
    for (const error of result.errors) delete result.values[error.field];
    return result.values;
  };
  const override = checked(layers.overrides, "override");
  const model = checked(layers.model, "model");
  const base = checked(layers.base, "base");

  const values: HardwareSpecValues = {};
  const sources: Record<string, HardwareValueSource> = {};
  for (const definition of categoryFields(layers.category)) {
    const key = definition.key;
    if (override[key] !== undefined) {
      values[key] = override[key];
      sources[key] = "override";
    } else if (model[key] !== undefined) {
      values[key] = model[key];
      sources[key] = "model";
    } else if (definition.inheritable && base[key] !== undefined) {
      values[key] = base[key];
      sources[key] = "base";
    }
  }
  // Mixing layers can still produce a contradiction, such as an override's capacity against the model's sticks.
  for (const error of consistencyErrors(layers.category, values)) {
    errors.push({ ...error, message: `resolved: ${error.message}` });
    delete values[error.field];
    delete sources[error.field];
  }
  const missingRequired = categoryFields(layers.category)
    .filter((definition) => definition.required && values[definition.key] === undefined)
    .map((definition) => definition.key);
  return {
    values,
    sources,
    missingRequired,
    errors,
    complete: missingRequired.length === 0 && errors.length === 0,
  };
}

export interface HardwareSpecChange {
  field: string;
  from: HardwareSpecValue | null;
  to: HardwareSpecValue | null;
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed between two sets of values, field by field, in the category's order. */
export function diffHardwareSpecs(
  category: string,
  before: HardwareSpecValues,
  after: HardwareSpecValues,
): HardwareSpecChange[] {
  const keys = [
    ...categoryFields(category).map((definition) => definition.key),
    ...Object.keys({ ...before, ...after }).filter((key) => !fieldDefinition(category, key)),
  ];
  const changes: HardwareSpecChange[] = [];
  for (const key of [...new Set(keys)]) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (!sameValue(from, to)) changes.push({ field: key, from, to });
  }
  return changes;
}

/**
 * The builder's TechnicalSpecs fields for a set of registry values, and which registry key filled each. Values the
 * builder doesn't read (cores, clocks, outputs) stay in the registry only.
 */
export function toBuilderFields(
  category: string,
  values: HardwareSpecValues,
): { specs: Record<string, unknown>; fieldKeys: Record<string, string> } {
  const specs: Record<string, unknown> = {};
  const fieldKeys: Record<string, string> = {};
  for (const definition of categoryFields(category)) {
    const value = values[definition.key];
    if (value === undefined || !definition.builderFields) continue;
    let converted: unknown = value;
    if (definition.builderConversion === "so_dimm") converted = value === "SO-DIMM";
    if (definition.builderConversion === "true_only") {
      if (value !== true) continue;
      converted = true;
    }
    for (const field of definition.builderFields) {
      specs[field] = Array.isArray(converted) ? [...converted] : converted;
      fieldKeys[field] = definition.key;
    }
  }
  return { specs, fieldKeys };
}

/** Text for one value, with its unit, for people to read. */
export function formatHardwareValue(
  definition: HardwareFieldDefinition | undefined,
  value: unknown,
) {
  if (value === undefined || value === null) return "Unknown";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return definition?.unit ? `${value} ${definition.unit}` : String(value);
}

// ─── What the PC Builder reads (4B-5) ──────────────────────────────────────────────────────────────────

/** One active listing's registry layers, as `get_pc_builder_registry_specs` returns them. */
export interface RegistryListingRecord {
  linkId: string;
  productId: string;
  /** Null: the link covers every variant of the product. */
  variantId: string | null;
  modelId: string;
  category: string;
  manufacturer: string;
  modelName: string;
  modelNumber: string | null;
  modelSpecs: unknown;
  baseSpecs: unknown;
  overrides: unknown;
  specRevision: number;
  overrideRevision: number;
}

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

/** A database row as a record, or undefined if its shape isn't the function's. Never partly trusted. */
export function registryRecordFromRow(row: unknown): RegistryListingRecord | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;
  const productId = shopifyGid("Product", r.shopify_product_id);
  const variantId =
    r.shopify_variant_id === null || r.shopify_variant_id === undefined
      ? null
      : shopifyGid("ProductVariant", r.shopify_variant_id);
  if (
    !text(r.link_id) ||
    !productId ||
    variantId === undefined ||
    !text(r.model_id) ||
    !text(r.category_id) ||
    !Number.isInteger(r.spec_revision) ||
    !Number.isInteger(r.override_revision)
  ) {
    return undefined;
  }
  return {
    linkId: r.link_id as string,
    productId,
    variantId,
    modelId: r.model_id as string,
    category: r.category_id as string,
    manufacturer: text(r.manufacturer) ?? "",
    modelName: text(r.model_name) ?? "",
    modelNumber: text(r.model_number) ?? null,
    modelSpecs: r.model_specs ?? {},
    baseSpecs: r.base_specs ?? undefined,
    overrides: r.overrides ?? {},
    specRevision: r.spec_revision as number,
    overrideRevision: r.override_revision as number,
  };
}

/**
 * A lookup over listings: a variant's own link wins over its product's link. Ids may be GIDs or bare numbers (the
 * storefront keeps product ids as numbers, the server as GIDs).
 */
export function registryLookup(
  records: RegistryListingRecord[],
): (variantId: string, productId: string) => RegistryListingRecord | undefined {
  const byVariant = new Map<string, RegistryListingRecord>();
  const byProduct = new Map<string, RegistryListingRecord>();
  for (const record of records) {
    if (record.variantId) byVariant.set(record.variantId, record);
    else byProduct.set(record.productId, record);
  }
  return (variantId, productId) => {
    const variant = shopifyGid("ProductVariant", variantId);
    const product = shopifyGid("Product", productId);
    return (variant && byVariant.get(variant)) || (product && byProduct.get(product)) || undefined;
  };
}

/** The registry's resolved values for a listing, as the builder's fields, and which registry key gave each. */
/**
 * Shopify importer: a record that states nothing yet. An imported model starts with no specification of its own, no
 * base to inherit from and no listing override; until staff save one, the PC Builder resolves the listing exactly as
 * it would with no record at all, so an import never changes what the builder knew before.
 */
export function registryStatesNothing(record: RegistryListingRecord): boolean {
  const empty = (value: unknown) =>
    value === null ||
    value === undefined ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0);
  return empty(record.modelSpecs) && empty(record.baseSpecs) && empty(record.overrides);
}

export function registryBuilderValues(record: RegistryListingRecord) {
  const resolved = resolveHardwareSpecs({
    category: record.category,
    model: record.modelSpecs,
    base: record.baseSpecs,
    overrides: record.overrides,
  });
  return { resolved, ...toBuilderFields(record.category, resolved.values) };
}

// ─── Identity ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * The comparison form of a manufacturer or model name: lower case, letters and digits only. "GeForce RTX 4070 OC"
 * and "geforce-rtx4070oc" compare equal. The database's `private.hardware_identity_text` does the same.
 */
export function identityText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Whether two model names could be the same product, for the possible-duplicate warning. Never used to merge:
 * staff decide, and models that share only a chipset stay separate.
 */
export function possiblySameModel(a: string, b: string): boolean {
  const left = identityText(a);
  const right = identityText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  // One name containing the other ("Dual RTX 4070" in "Dual RTX 4070 OC") is worth a look, unless the shorter is
  // only a short chip name, which every board using that chip contains.
  return shorter.length >= 8 && longer.includes(shorter);
}

/** A Shopify product or variant id as a GID, or undefined if it isn't one. */
export function shopifyGid(kind: "Product" | "ProductVariant", value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  const prefix = `gid://shopify/${kind}/`;
  if (text.startsWith(prefix)) return /^\d+$/.test(text.slice(prefix.length)) ? text : undefined;
  return /^\d+$/.test(text) ? `${prefix}${text}` : undefined;
}
