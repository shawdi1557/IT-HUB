// ITHUB_ADMIN/src/lib/hardware-groups.ts
// Stage 4B-6 (UI only): how each category's specification fields are grouped into sections on screen, so staff see a
// few understandable sections instead of one long form. Display only: it changes no field, rule or value. A unit test
// (S4B6-UI-1) checks that every field of hardware-spec.ts appears in exactly one section. Import-free.

export interface FieldGroup {
  id: string;
  title: string;
  /** One line telling staff what belongs here. */
  hint: string;
  fields: string[];
}

export const FIELD_GROUPS: Record<string, FieldGroup[]> = {
  CPU: [
    {
      id: "platform",
      title: "Platform",
      hint: "Which boards and memory it works with",
      fields: ["socket", "memory_support", "max_memory_gb", "pcie_version"],
    },
    {
      id: "power",
      title: "Power and cooling",
      hint: "Power draw, and whether a cooler comes in the box",
      fields: ["tdp_watts", "max_power_watts", "includes_cooler"],
    },
    {
      id: "graphics",
      title: "Graphics",
      hint: "Built-in graphics",
      fields: ["integrated_graphics"],
    },
    {
      id: "performance",
      title: "Cores and clocks",
      hint: "For comparing processors",
      fields: ["core_count", "thread_count", "base_clock_ghz", "boost_clock_ghz"],
    },
  ],
  GPU: [
    {
      id: "power",
      title: "Power and connectors",
      hint: "What the power supply must provide",
      fields: [
        "tdp_watts",
        "recommended_psu_watts",
        "pcie_8pin_required",
        "pcie_16pin_required",
        "pcie_16pin_adapter_8pin_count",
      ],
    },
    {
      id: "size",
      title: "Size and fit",
      hint: "Whether it fits the case and board",
      fields: ["length_mm", "width_slots", "pcie_interface"],
    },
    {
      id: "chip",
      title: "Chip and memory",
      hint: "The graphics chip and its memory",
      fields: ["chipset", "vram_gb", "vram_type", "memory_bus_bits"],
    },
    {
      id: "clocks",
      title: "Clocks",
      hint: "Reference and factory clocks",
      fields: ["base_clock_mhz", "boost_clock_mhz"],
    },
    {
      id: "outputs",
      title: "Display outputs",
      hint: "Ports for monitors",
      fields: ["display_outputs"],
    },
  ],
  Motherboard: [
    {
      id: "platform",
      title: "Platform",
      hint: "Processor socket, chipset and size",
      fields: ["socket", "chipset", "form_factor"],
    },
    {
      id: "memory",
      title: "Memory",
      hint: "Which RAM, how many sticks, and how much",
      fields: ["ram_generation", "memory_slots", "max_memory_gb"],
    },
    {
      id: "storage",
      title: "Storage and expansion",
      hint: "Drive connections and expansion slots",
      fields: ["m2_slots", "m2_sata_support", "sata_ports", "pcie_x16_slots"],
    },
    {
      id: "connectivity",
      title: "Connectivity",
      hint: "Wireless and wired networking",
      fields: ["wifi", "bluetooth", "lan_speed"],
    },
    {
      id: "power",
      title: "Power and BIOS",
      hint: "CPU power plugs and BIOS notes",
      fields: ["cpu_power_connectors", "bios_update_required"],
    },
  ],
  RAM: [
    {
      id: "kit",
      title: "Kit",
      hint: "What's in the box",
      fields: ["ram_generation", "capacity_gb", "module_count", "module_type"],
    },
    {
      id: "performance",
      title: "Performance",
      hint: "Speed and timings",
      fields: ["speed_mhz", "cas_latency", "voltage"],
    },
  ],
  Storage: [
    {
      id: "drive",
      title: "Drive",
      hint: "Type, size and how it connects",
      fields: ["storage_type", "capacity_gb", "interface", "form_factor"],
    },
    {
      id: "performance",
      title: "Performance",
      hint: "Rated speeds",
      fields: ["read_speed_mbps", "write_speed_mbps"],
    },
  ],
  PSU: [
    {
      id: "power",
      title: "Power",
      hint: "Wattage, efficiency and size",
      fields: ["wattage", "efficiency_rating", "modular_type", "form_factor"],
    },
    {
      id: "connectors",
      title: "Connectors",
      hint: "Plugs for the graphics card, CPU and drives",
      fields: ["pcie_8pin_count", "pcie_16pin_count", "eps_connectors", "sata_connectors"],
    },
  ],
  Cabinet: [
    {
      id: "fit",
      title: "What fits inside",
      hint: "Board sizes and clearances",
      fields: ["supported_motherboards", "max_gpu_length_mm", "max_cooler_height_mm", "case_type"],
    },
    {
      id: "cooling",
      title: "Cooling and storage",
      hint: "Radiators, fans and drive bays",
      fields: ["radiator_support", "included_fans", "drive_bays_35", "drive_bays_25"],
    },
  ],
  Cooler: [
    {
      id: "fit",
      title: "Fit",
      hint: "Sockets and height",
      fields: ["supported_sockets", "height_mm", "cooler_type"],
    },
    {
      id: "cooling",
      title: "Cooling",
      hint: "Radiator, fans and rated capacity",
      fields: ["radiator_size_mm", "fan_configuration", "max_tdp_watts"],
    },
  ],
  Monitor: [
    {
      id: "display",
      title: "Display",
      hint: "Size, resolution and panel",
      fields: ["display_size_in", "resolution", "panel_type"],
    },
    {
      id: "motion",
      title: "Motion",
      hint: "Refresh rate, response time and sync",
      fields: ["refresh_rate_hz", "response_time_ms", "adaptive_sync"],
    },
    { id: "connections", title: "Connections", hint: "Ports", fields: ["connectivity"] },
  ],
};

/** The sections for a category; any field a section doesn't list goes into "Other details". */
export function groupsFor(category: string, allFieldKeys: string[]): FieldGroup[] {
  const groups = FIELD_GROUPS[category] ?? [];
  const listed = new Set(groups.flatMap((group) => group.fields));
  const rest = allFieldKeys.filter((key) => !listed.has(key));
  return rest.length > 0
    ? [...groups, { id: "other", title: "Other details", hint: "Everything else", fields: rest }]
    : groups;
}
