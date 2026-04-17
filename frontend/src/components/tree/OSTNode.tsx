"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeType, BubbleDefaults, FillStyle } from "@/lib/types";
import { useTreeStore } from "@/stores/tree-store";
import { DEFAULT_BUBBLE_DEFAULTS } from "@/lib/colors";
import { getFillStyle } from "@/lib/fill-patterns";

interface OSTNodeData {
  title: string;
  nodeType: NodeType;
  description?: string;
  status?: string;
  isSelected?: boolean;
  index?: number;
  childCount?: number;
  isCollapsed?: boolean;
  hasAssumption?: boolean;
  tags?: string[];
  isAncestorOnly?: boolean;
  depthHidesChildren?: boolean;
  isExpandedBeyondDepth?: boolean;
  bubbleDefaults?: BubbleDefaults;
  overrideBorderColor?: string | null;
  overrideBorderWidth?: number | null;
  overrideFillColor?: string | null;
  overrideFillStyle?: FillStyle | null;
  tagFillColor?: string | null;
  tagFillStyle?: string | null;
  fontLight?: boolean;
  tagColorMap?: Record<string, string>;
  [key: string]: unknown;
}

function OSTNodeComponent({ id, data }: NodeProps) {
  const nodeData = data as OSTNodeData;
  const toggleCollapse = useTreeStore((s) => s.toggleCollapse);
  const toggleExpandBeyondDepth = useTreeStore((s) => s.toggleExpandBeyondDepth);

  // Get border styling from bubble defaults (passed via data) or fallback to defaults
  const bubbleDefaults = nodeData.bubbleDefaults ?? DEFAULT_BUBBLE_DEFAULTS;
  const typeDefaults = bubbleDefaults[nodeData.nodeType] ?? DEFAULT_BUBBLE_DEFAULTS[nodeData.nodeType] ?? { border_color: "#94a3b8", border_width: 2 };

  // Per-node overrides take precedence over type defaults
  const borderColor = nodeData.overrideBorderColor ?? typeDefaults.border_color;
  const borderWidth = nodeData.overrideBorderWidth ?? typeDefaults.border_width;
  // Fill cascade: node override > tag fill > white background
  const fillColor = nodeData.overrideFillColor ?? nodeData.tagFillColor ?? null;
  const fillStyle = nodeData.overrideFillStyle ?? (nodeData.tagFillStyle as FillStyle) ?? "none";
  const fillStyles = getFillStyle(fillColor, fillStyle);
  // Only apply light font when there's actually a visible fill — avoids white-on-white
  const hasFill = fillColor !== null && fillStyle !== "none";
  const fontLight = hasFill && (nodeData.fontLight ?? false);

  return (
    <div
      className={`relative px-4 py-3 rounded-lg shadow-sm min-w-[200px] max-w-[280px] ${
        nodeData.isSelected ? "ring-1 ring-offset-1" : ""
      } ${nodeData.isAncestorOnly ? "opacity-50" : ""}`}
      style={{
        borderColor,
        borderWidth: `${borderWidth}px`,
        borderStyle: "solid",
        ...fillStyles,
        ...(nodeData.isSelected ? { ringColor: borderColor } : {}),
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      {nodeData.index != null && (
        <span className={`absolute top-1.5 right-2 text-[10px] rounded px-1 min-w-[18px] text-center ${fontLight ? "text-white/50 bg-white/10" : "text-gray-400 bg-gray-50"}`}>
          #{nodeData.index}
        </span>
      )}
      <div className={`text-[15px] font-semibold leading-snug line-clamp-3 pr-8 ${fontLight ? "text-white" : "text-gray-900"}`}>{nodeData.title}</div>
      {nodeData.status && nodeData.status !== "active" && (
        <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${fontLight ? "bg-white/15 text-white/80" : "bg-gray-200 text-gray-600"}`}>
          {nodeData.status}
        </span>
      )}
      {nodeData.description && (
        <div className={`text-xs mt-1 line-clamp-2 ${fontLight ? "text-white/80" : "text-gray-500"}`}>{nodeData.description}</div>
      )}
      {/* Tag chips */}
      {nodeData.tags && nodeData.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {nodeData.tags.slice(0, 3).map((tag) => {
            const tagColor = nodeData.tagColorMap?.[tag];
            return (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded-full border"
                style={tagColor ? {
                  backgroundColor: tagColor + "20",
                  borderColor: tagColor,
                  color: tagColor,
                } : {
                  backgroundColor: "#f3f4f6",
                  borderColor: "#d1d5db",
                  color: "#4b5563",
                }}
              >
                {tag}
              </span>
            );
          })}
          {nodeData.tags.length > 3 && (
            <span className="text-[9px] text-gray-400">+{nodeData.tags.length - 3}</span>
          )}
        </div>
      )}
      {/* Assumption indicator */}
      {nodeData.hasAssumption && (
        <div className="flex items-center gap-1 mt-1.5">
          <span className={`text-[10px] ${fontLight ? "text-blue-200" : "text-blue-500"}`}>
            has assumption
          </span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
      {(nodeData.childCount ?? 0) > 0 && (() => {
        // Determine button behavior based on whether depth filter hides children
        const depthHides = nodeData.depthHidesChildren;
        const expandedBeyond = nodeData.isExpandedBeyondDepth;

        if (depthHides && !expandedBeyond) {
          // Children hidden by global depth — show expand button
          return (
            <button
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white border border-blue-400 rounded-full w-6 h-6 flex items-center justify-center text-xs text-blue-500 hover:bg-blue-50 shadow-sm z-10"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpandBeyondDepth(id);
              }}
              title="Expand subtree beyond level"
            >
              +{nodeData.childCount}
            </button>
          );
        }
        if (depthHides && expandedBeyond) {
          // Children visible via per-node expansion — show collapse button
          return (
            <button
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white border border-blue-400 rounded-full w-6 h-6 flex items-center justify-center text-xs text-blue-500 hover:bg-blue-50 shadow-sm z-10"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpandBeyondDepth(id);
              }}
              title="Collapse subtree back to level"
            >
              −
            </button>
          );
        }
        // Normal behavior (depth doesn't affect children)
        return (
          <button
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white border border-gray-300 rounded-full w-6 h-6 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-100 shadow-sm z-10"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(id);
            }}
            title={nodeData.isCollapsed ? "Expand children" : "Collapse children"}
          >
            {nodeData.isCollapsed ? `+${nodeData.childCount}` : "−"}
          </button>
        );
      })()}
    </div>
  );
}

export const OSTNode = memo(OSTNodeComponent);
