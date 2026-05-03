import { BubbleDefaults } from "./types";

export const NODE_COLORS: Record<string, { bg: string; border: string; text: string; light: string }> = {
  outcome: { bg: "bg-blue-300", border: "border-blue-300", text: "text-blue-600", light: "bg-blue-50" },
  opportunity: { bg: "bg-orange-300", border: "border-orange-300", text: "text-orange-600", light: "bg-orange-50" },
  child_opportunity: { bg: "bg-amber-300", border: "border-amber-300", text: "text-amber-600", light: "bg-amber-50" },
  solution: { bg: "bg-emerald-300", border: "border-emerald-300", text: "text-emerald-600", light: "bg-emerald-50" },
  experiment: { bg: "bg-violet-300", border: "border-violet-300", text: "text-violet-600", light: "bg-violet-50" },
};

// Default hex colors matching the Tailwind classes above (used when no project defaults are set)
// Desaturated ~15% from original to reduce visual noise and let content stand out
export const DEFAULT_BUBBLE_DEFAULTS: BubbleDefaults = {
  outcome: { border_color: "#a0c4e8", border_width: 2 },
  opportunity: { border_color: "#e8b88a", border_width: 2 },
  child_opportunity: { border_color: "#e5cc6a", border_width: 2 },
  solution: { border_color: "#82d4ad", border_width: 2 },
  experiment: { border_color: "#bfb5e4", border_width: 2 },
};

// Standard color palette for the color picker (16 colors)
export const STANDARD_COLORS = [
  "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb",  // Blues
  "#fdba74", "#fb923c", "#f97316", "#ea580c",  // Oranges
  "#fcd34d", "#fbbf24", "#f59e0b", "#d97706",  // Yellows
  "#6ee7b7", "#34d399", "#10b981", "#059669",  // Greens
  "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed",  // Purples
  "#fda4af", "#fb7185", "#f43f5e", "#e11d48",  // Reds
  "#94a3b8", "#64748b", "#475569", "#1e293b",  // Grays
];

export const NODE_ICONS: Record<string, string> = {
  outcome: "",
  opportunity: "",
  child_opportunity: "",
  solution: "",
  experiment: "",
};

export const NODE_LABELS: Record<string, string> = {
  outcome: "Outcome",
  opportunity: "Opportunity",
  child_opportunity: "Child Opportunity",
  solution: "Solution",
  experiment: "Experiment",
};

// Valid child types for each node type (matching backend VALID_CHILD_TYPES)
export const VALID_CHILD_TYPES: Record<string, string[]> = {
  outcome: ["opportunity"],
  opportunity: ["child_opportunity", "solution"],
  child_opportunity: ["child_opportunity", "solution"],
  solution: ["experiment"],
  experiment: [],
};

/**
 * Get the display label for a node type.
 * Checks NODE_LABELS first, then bubbleDefaults label, then humanizes the slug.
 */
export function getNodeLabel(nodeType: string, bubbleDefaults?: BubbleDefaults): string {
  if (NODE_LABELS[nodeType]) return NODE_LABELS[nodeType];
  if (bubbleDefaults?.[nodeType]?.label) return bubbleDefaults[nodeType].label!;
  // Humanize slug: "user_story" -> "User Story"
  return nodeType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Get the color palette for a node type.
 * Returns NODE_COLORS entry for standard types, or generates from bubbleDefaults border_color.
 */
export function getNodeColor(nodeType: string, bubbleDefaults?: BubbleDefaults): { bg: string; border: string; text: string; light: string } {
  if (NODE_COLORS[nodeType]) return NODE_COLORS[nodeType];
  // For custom types, return generic gray TW classes (actual border color comes from bubbleDefaults inline styles)
  return { bg: "bg-gray-300", border: "border-gray-300", text: "text-gray-600", light: "bg-gray-50" };
}
