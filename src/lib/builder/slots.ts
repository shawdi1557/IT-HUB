// src/lib/builder/slots.ts
// Slot specifications and hierarchy for IT HUB PC Builder

import type { ComponentSlotId, SlotDefinition } from "./types"

export const COMPONENT_SLOTS: SlotDefinition[] = [
  {
    id: "CPU",
    label: "Processor (CPU)",
    category: "Processors",
    requirement: "required",
    description: "The brain of your PC that drives computing and gaming performance.",
    iconName: "Cpu",
    allowedTypes: ["Processor", "CPU"],
    maxQuantity: 1,
  },
  {
    id: "Motherboard",
    label: "Motherboard",
    category: "Motherboards",
    requirement: "required",
    description: "Connects your processor, graphics card, memory, and storage drives.",
    iconName: "CircuitBoard",
    allowedTypes: ["Motherboard"],
    maxQuantity: 1,
  },
  {
    id: "RAM",
    label: "System Memory (RAM)",
    category: "Memory",
    requirement: "required",
    description: "High-speed working memory for multitasking, gaming, and responsive workloads.",
    iconName: "Layers",
    allowedTypes: ["RAM", "Memory"],
    maxQuantity: 4,
  },
  {
    id: "GPU",
    label: "Graphics Card (GPU)",
    category: "Graphics Cards",
    requirement: "conditional",
    description: "Powers gaming visuals, 3D rendering, video encoding, and AI tasks.",
    iconName: "Monitor",
    allowedTypes: ["Graphics Card", "GPU"],
    maxQuantity: 1,
  },
  {
    id: "Storage",
    label: "Primary Storage (SSD)",
    category: "Storage",
    requirement: "required",
    description: "Ultra-fast NVMe or SATA SSD for Windows boot and instant program loading.",
    iconName: "HardDrive",
    allowedTypes: ["Internal SSD", "Storage", "Hard Drive"],
    maxQuantity: 2,
  },
  {
    id: "PSU",
    label: "Power Supply (PSU)",
    category: "Power Supplies",
    requirement: "required",
    description: "Delivers clean, safe, and efficient electrical power to all system components.",
    iconName: "Zap",
    allowedTypes: ["Power Supply", "PSU"],
    maxQuantity: 1,
  },
  {
    id: "Cabinet",
    label: "Cabinet (Case)",
    category: "PC Cases",
    requirement: "required",
    description: "Houses all components with optimized airflow and cooling clearances.",
    iconName: "Box",
    allowedTypes: ["PC Case", "Cabinet"],
    maxQuantity: 1,
  },
  {
    id: "Cooler",
    label: "CPU Cooler",
    category: "Cooling",
    requirement: "conditional",
    description: "Thermal cooling solution. Required if your processor does not include a stock cooler.",
    iconName: "Fan",
    allowedTypes: ["CPU Cooler", "Liquid Cooler"],
    maxQuantity: 1,
  },
  {
    id: "Monitor",
    label: "Monitor (Optional)",
    category: "Monitors",
    requirement: "optional",
    description: "Display monitor for your workstation or gaming setup.",
    iconName: "Tv",
    allowedTypes: ["Monitor", "Display"],
    maxQuantity: 1,
  },
]

export const ESSENTIAL_SLOTS: ComponentSlotId[] = [
  "CPU",
  "Motherboard",
  "RAM",
  "Storage",
  "PSU",
  "Cabinet",
]

export function getSlotDefinition(slotId: ComponentSlotId): SlotDefinition | undefined {
  return COMPONENT_SLOTS.find((s) => s.id === slotId)
}
